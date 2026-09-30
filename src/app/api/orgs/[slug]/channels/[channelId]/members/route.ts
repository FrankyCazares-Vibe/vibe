import { NextResponse } from "next/server";

import { refusalBody } from "@/lib/chat/types";
import { loadClubOfficer } from "@/lib/club-routes/officer-guard";
import { requireNotRestricted } from "@/lib/moderation/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ slug: string; channelId: string }> };
type PostBody = { user_id?: unknown; handle?: unknown };

/**
 * Owner/admin of THIS club, and the channel is the club's. A stranger asking
 * about a hidden club gets 404, not 403 (security wave 2, `loadClubOfficer`).
 * Writes also refuse a restricted officer (`checkRestriction`): they run on
 * the service role, so the allow-list policies' `NOT is_restricted_now()`
 * never runs.
 */
async function requireChannelStaff(
  slug: string,
  channelId: string,
  viewerId: string,
  checkRestriction: boolean,
) {
  if (checkRestriction) {
    const restricted = await requireNotRestricted(viewerId);
    if (restricted) return { response: restricted } as const;
  }
  const guard = await loadClubOfficer(slug, viewerId, { channelId });
  if (!guard.ok) {
    return {
      response: NextResponse.json({ ok: false, error: guard.error }, { status: guard.status }),
    } as const;
  }
  if (!guard.channel) {
    return {
      response: NextResponse.json({ ok: false, error: "Channel not found" }, { status: 404 }),
    } as const;
  }
  return { org: guard.org, channel: guard.channel, service: guard.service } as const;
}

/**
 * GET /api/orgs/[slug]/channels/[channelId]/members — list users explicitly
 * granted access to a private channel (in addition to staff, who always
 * pass `can_view_org_channel`). Owner/admin only — exposing the access list
 * to regular members would leak who else has been invited.
 */
export async function GET(_req: Request, { params }: Params) {
  const { slug, channelId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireChannelStaff(slug, channelId, user.id, false);
  if ("response" in guard) return guard.response;

  const { data, error } = await guard.service
    .from("org_channel_members")
    .select(
      "user_id, added_at, users:user_id(id, name, handle, avatar_url, school_verified)"
    )
    .eq("channel_id", channelId)
    .order("added_at", { ascending: true });
  if (error) {
    console.error("[channel/members GET]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load members" },
      { status: 500 }
    );
  }

  const rows = (data || []).map((r) => {
    const u = r.users as unknown as {
      id: string;
      name: string | null;
      handle: string | null;
      avatar_url: string | null;
      school_verified: boolean | null;
    } | null;
    return {
      user_id: r.user_id as string,
      added_at: r.added_at as string,
      name: u?.name ?? null,
      handle: u?.handle ?? null,
      avatar_url: u?.avatar_url ?? null,
      school_verified: !!u?.school_verified,
    };
  });

  return NextResponse.json({ ok: true, members: rows });
}

/**
 * POST /api/orgs/[slug]/channels/[channelId]/members
 * Body: { user_id } OR { handle } — the latter is a convenience for the UI's
 * member typeahead so the client doesn't have to resolve the handle first.
 *
 * Validation:
 *  - The target user must already be a member of the org. Granting access
 *    to a non-member is meaningless (they wouldn't pass `is_org_member`).
 *  - The channel must belong to the org and ideally be private (granting
 *    access to a public channel is harmless but not useful).
 */
export async function POST(req: Request, { params }: Params) {
  const { slug, channelId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const guard = await requireChannelStaff(slug, channelId, user.id, true);
  if ("response" in guard) return guard.response;

  // A Board, a Lounge or an event chat is open to every member by the
  // database's rule (`can_view_org_channel`), so a by-name allow-list row
  // on one is meaningless and is refused (wave-2 contract 6.3, D8). The
  // Officers room, an extra room and a database without `channels.kind`
  // (`kind` null) go on as before.
  const { kind } = guard.channel;
  if (kind === "board" || kind === "lounge" || kind === "event") {
    return NextResponse.json(refusalBody("room_locked"), { status: 409 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  // `null`, a number or an array parse fine but are not a body: same answer.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  let targetUserId: string | null = null;
  if (typeof body.user_id === "string") {
    targetUserId = body.user_id;
  } else if (typeof body.handle === "string" && body.handle.trim()) {
    const { data: u } = await guard.service
      .from("users")
      .select("id")
      .eq("handle", body.handle.trim().toLowerCase())
      .maybeSingle();
    if (!u) {
      return NextResponse.json(
        { ok: false, error: "No user with that handle" },
        { status: 404 }
      );
    }
    targetUserId = u.id as string;
  }
  if (!targetUserId) {
    return NextResponse.json(
      { ok: false, error: "Provide user_id or handle" },
      { status: 400 }
    );
  }

  // Target must be an org member.
  const { data: orgMember } = await guard.service
    .from("org_members")
    .select("user_id")
    .eq("org_id", guard.org.id)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!orgMember) {
    return NextResponse.json(
      { ok: false, error: "User must join the org first" },
      { status: 400 }
    );
  }

  // Idempotent: if they already have access, return ok.
  const { data: existing } = await guard.service
    .from("org_channel_members")
    .select("user_id")
    .eq("channel_id", channelId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, granted: true });
  }

  const { error } = await guard.service.from("org_channel_members").insert({
    channel_id: channelId,
    user_id: targetUserId,
    added_by: user.id,
  });
  if (error) {
    console.error("[channel/members POST]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to grant access" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, granted: true });
}
