import { NextResponse } from "next/server";

import { blockedIdsFor } from "@/lib/chat/blocks";
import { isAllowedReactionEmoji } from "@/lib/messages/reaction-emoji";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string; messageId: string }> };
type Body = { emoji?: unknown };

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
 * is never refused.
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const { messageId } = await ctx.params;
  if (!messageId) {
    return NextResponse.json({ ok: false, error: "Missing message id" }, { status: 400 });
  }
  const auth = await authorize();
  if (!auth.ok) return auth.res;

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseEmoji(body);
  if (!parsed.ok) return parsed.res;

  // The author, as the viewer may read it (RLS): no row, nothing to react to.
  const { data: message, error: readErr } = await auth.supabase
    .from("messages")
    .select("user_id")
    .eq("id", messageId)
    .maybeSingle();
  if (readErr) {
    console.error("[messages/:id/react POST read]", readErr.code, readErr.message);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!message) {
    return NextResponse.json({ ok: false, error: "That message is no longer there." }, { status: 404 });
  }
  const authorId = (message as { user_id: string }).user_id;
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
