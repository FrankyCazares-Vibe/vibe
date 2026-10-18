import { NextResponse } from "next/server";

import { blockedIdsFor } from "@/lib/chat/blocks";
import { limitFor } from "@/lib/limits/budgets";
import { isAllowedReactionEmoji } from "@/lib/messages/reaction-emoji";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { membersOnly, standingInClub } from "../../../_lib/club-follower";

type RouteCtx = { params: Promise<{ id: string; messageId: string }> };
type Body = { emoji?: unknown };

/**
 * Adding and taking back both count against the account's `react` budget
 * (src/lib/limits/budgets.ts; rate limits, wave 3), right after sign-in and
 * before the body or any read: a script toggling one emoji is a notice to
 * the author each time.
 */
const REACT_TOO_FAST = "You're reacting too fast. Try again in a few minutes.";

async function authorize(): Promise<
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> }
  | { ok: false; res: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, userId: user.id, supabase };
}

function parseEmoji(body: Body): { ok: true; emoji: string } | { ok: false; res: NextResponse } {
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";
  if (!emoji) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "emoji required" }, { status: 400 }),
    };
  }
  // The same list the database CHECK enforces (message_reactions_emoji_check,
  // migration 20260927110000), so a reaction the route takes always stores.
  if (!isAllowedReactionEmoji(emoji)) {
    return {
      ok: false,
      res: NextResponse.json(
        { ok: false, error: "emoji not allowed" },
        { status: 400 },
      ),
    };
  }
  return { ok: true, emoji };
}

/**
 * Add a reaction. Idempotent on (message_id, user_id, emoji): a duplicate
 * POST is a no-op. RLS gates message visibility — the policy on
 * `message_reactions` joins back through `messages` + `is_channel_member`
 * so users can only react to messages they can see.
 *
 * A block stops reactions too (Privacy Policy 5: "A block stops new messages
 * both ways"): no new reaction on a message by someone blocked either way,
 * in any chat. A reaction is a notice to its author, and in a club room the
 * message itself is hidden from the viewer. Taking a reaction back (DELETE)
 * is never refused over a block; only the shared budget above can turn it
 * away.
 *
 * A follower reading a club's Board (Franky, Oct 16) reads it, never reacts.
 * What they get today is the 404 below: since 20261017110000 a follower reads
 * no club message on their own client (messages_select_org_member), so the
 * message read finds nothing. The 403 `members_only` after it is a backstop
 * for the day that read widens (wave-3 review, finding 10). The follower's
 * Board offers no reaction to add (FollowerBoard.tsx). Taking back a reaction
 * stays open to them (one they left while they were a member).
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const { messageId } = await ctx.params;
  if (!messageId) {
    return NextResponse.json({ ok: false, error: "Missing message id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;
  const rl = await limitFor("react", auth.userId);
  if (!rl.allowed) return tooManyRequests(rl, REACT_TOO_FAST);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseEmoji(body);
  if (!parsed.ok) return parsed.res;

  // The author and the message's club, as the viewer may read them (RLS):
  // no row, nothing to react to. The club rides on the same read, named by
  // its foreign key like the `users` embed elsewhere, so a dm or a group
  // costs nothing more.
  const { data: message, error: readErr } = await auth.supabase
    .from("messages")
    .select("user_id, channels:channels!messages_channel_id_fkey(org_id)")
    .eq("id", messageId)
    .maybeSingle();
  if (readErr) {
    console.error("[messages/:id/react POST read]", readErr.code, readErr.message);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!message) {
    return NextResponse.json({ ok: false, error: "That message is no longer there." }, { status: 404 });
  }
  const row = message as { user_id: string; channels?: { org_id?: unknown } | null };
  const authorId = row.user_id;

  // A follower reading a club's Board never reacts (Franky, Oct 16): only
  // members take part. A BACKSTOP: a follower's message read above already
  // finds nothing (404). Should it ever find the row, this refuses them in a
  // sentence before the reaction rule would with a bare 500. A membership
  // read that fails answers "try again", never a guessed refusal.
  const orgId = row.channels?.org_id;
  if (typeof orgId === "string" && orgId !== "") {
    const standing = await standingInClub(auth.supabase, orgId, auth.userId);
    if (standing === "failed") return NextResponse.json({ ok: false, error: "Try again in a moment." }, { status: 503 });
    if (standing === "follower") return membersOnly();
  }

  if (authorId !== auth.userId) {
    const blocked = await blockedIdsFor(auth.supabase, auth.userId);
    // Fails closed: a block set that could not be read reacts to nobody.
    if (!blocked) return NextResponse.json({ ok: false, error: "Try again in a moment." }, { status: 503 });
    if (blocked.has(authorId)) {
      return NextResponse.json({ ok: false, error: "You can't react to this message.", code: "blocked" }, { status: 403 });
    }
  }

  const { error } = await auth.supabase
    .from("message_reactions")
    .insert({ message_id: messageId, user_id: auth.userId, emoji: parsed.emoji });

  if (error) {
    if (/duplicate key|unique constraint/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[messages/:id/react POST]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Remove a reaction. Idempotent — deleting zero rows is success. Body
 * accepts `{ emoji }` so the same one user has reacted to can be undone.
 */
export async function DELETE(req: Request, ctx: RouteCtx) {
  const { messageId } = await ctx.params;
  if (!messageId) {
    return NextResponse.json({ ok: false, error: "Missing message id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;
  const rl = await limitFor("react", auth.userId);
  if (!rl.allowed) return tooManyRequests(rl, REACT_TOO_FAST);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* empty body accepted — but we still need an emoji */
  }
  const parsed = parseEmoji(body);
  if (!parsed.ok) return parsed.res;

  const { error } = await auth.supabase
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", auth.userId)
    .eq("emoji", parsed.emoji);

  if (error) {
    console.error("[messages/:id/react DELETE]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
