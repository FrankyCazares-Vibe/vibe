import { NextResponse } from "next/server";

import { getFollowState } from "@/lib/connections/queries";
import {
  GROUP_ADD_REFUSED,
  GROUP_FULL,
  MAX_GROUP_MEMBERS,
  groupAddDecision,
} from "@/lib/messages/group-rules";
import { requireCanPublish } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadGroupBlockConflict } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string }> };
type Body = {
  handle?: unknown;
  target_id?: unknown;
};

/**
 * Add a member to a group chat. Group only. The inviter (viewer) must be
 * mutually connected with the target — matches the user's "you can't add
 * anyone you're not connected with" rule. Idempotent: re-adding an
 * existing member returns `{ already: true }`.
 *
 * Adding someone is a publishing act, gated like group create
 * (requireCanPublish: Terms, a verified school email, no restriction) and
 * rate limited (`thread-member-add`, MAX_GROUP_MEMBERS per 10 minutes per
 * adder, so one person can fill a group in one sitting, as create can).
 *
 * THE CHAT KEEPS ITS RULES (S67 security wave 2, A2; src/lib/messages/
 * group-rules.ts): at most MAX_GROUP_MEMBERS people, the same cap group
 * create uses (409 when full), and nobody comes in who has a block, either
 * way, with anyone already in it (403, copy that names no block). The block
 * read uses the SERVICE client: the pairs asked about are the newcomer's with
 * other people, which the adder's own client can't see (loadGroupBlockConflict
 * explains). One block inside a group stops both people in it from sending
 * (messages_insert_member), so an add that let it in would mute them. The
 * count-then-insert can overshoot the cap under two adds at the same instant;
 * accepted (the largest live chat has 3 people).
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Every add can put somebody into a chat and ping them, so it is paced per
  // adder: MAX_GROUP_MEMBERS per 10 minutes, one POST per person, so filling
  // one group from the add sheet never meets the brake (create takes the
  // same 50 in one call under `thread-create`). Before the publish gate,
  // like the sibling routes.
  const rl = await rateLimit(`thread-member-add:${user.id}`, {
    limit: MAX_GROUP_MEMBERS,
    windowSec: 600,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // Resolve target id from handle/id.
  let targetId: string | null = null;
  if (typeof body.target_id === "string" && body.target_id.length > 0) {
    // Not a uuid is nobody: answered like a missing user, not a 500.
    if (!isUuid(body.target_id)) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    targetId = body.target_id.toLowerCase();
  } else if (typeof body.handle === "string" && body.handle.length > 0) {
    const handle = body.handle.trim().toLowerCase();
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (!u) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    targetId = u.id as string;
  } else {
    return NextResponse.json(
      { ok: false, error: "Missing target_id or handle" },
      { status: 400 },
    );
  }
  if (targetId === user.id) {
    return NextResponse.json({ ok: false, error: "Already a member" }, { status: 400 });
  }

  // Channel must be a group.
  const { data: chan } = await supabase
    .from("channels")
    .select("id, type")
    .eq("id", channelId)
    .maybeSingle();
  if (!chan) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (chan.type !== "group") {
    return NextResponse.json(
      { ok: false, error: "Members can only be added to group chats" },
      { status: 400 },
    );
  }

  // Inviter must be a member of the channel themselves.
  const { data: viewerMembership } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewerMembership) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  // Connected check: inviter and target must be mutually connected. Anything
  // less (one-way follow, none) blocks the add.
  const state = await getFollowState(supabase, user.id, targetId);
  if (state !== "connected") {
    return NextResponse.json(
      {
        ok: false,
        error: "You can only add people you're connected with",
        state,
      },
      { status: 403 },
    );
  }

  // Who is in the chat now, read with the service client: RLS would show the
  // adder the roster too, but the block read below needs the service client
  // anyway, and one client keeps the two reads consistent.
  const admin = createSupabaseServiceClient();
  const { data: roster, error: rosterErr } = await admin
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", channelId);
  if (rosterErr) {
    console.error("[threads.members.POST roster]", rosterErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const memberIds = ((roster ?? []) as Array<{ user_id?: unknown }>)
    .map((r) => (typeof r?.user_id === "string" ? r.user_id.toLowerCase() : ""))
    .filter((id) => id.length > 0);
  const targetIsMember = memberIds.includes(targetId);

  // The block read only when it can change the answer (not already in, not full).
  let blocked = false;
  if (groupAddDecision({ memberCount: memberIds.length, targetIsMember, blocked: false }).kind === "add") {
    const conflict = await loadGroupBlockConflict(admin, [targetId], memberIds);
    if (!conflict.ok) {
      console.error("[threads.members.POST block-check]", conflict.error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    blocked = conflict.blocked;
  }

  const decision = groupAddDecision({ memberCount: memberIds.length, targetIsMember, blocked });
  if (decision.kind === "already") return NextResponse.json({ ok: true, already: true });
  if (decision.kind === "full") {
    return NextResponse.json({ ok: false, error: GROUP_FULL }, { status: 409 });
  }
  if (decision.kind === "refused") {
    return NextResponse.json({ ok: false, error: GROUP_ADD_REFUSED }, { status: 403 });
  }

  // Insert via service client (RLS blocks inserting another user's row).
  const { error: insErr } = await admin.from("channel_members").insert({
    channel_id: channelId,
    user_id: targetId,
    role: "member",
    accepted_at: new Date().toISOString(),
  });
  if (insErr) {
    // Added by someone else in the same instant: the idempotent answer.
    if ((insErr as { code?: string }).code === "23505") {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[threads.members.POST]", insErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
