import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_EMOJIS = new Set([
  "❤️",
  "👍",
  "👎",
  "😂",
  "🔥",
  "😮",
  "😢",
]);

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
  if (!ALLOWED_EMOJIS.has(emoji)) {
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

  const { error } = await auth.supabase
    .from("message_reactions")
    .insert({ message_id: messageId, user_id: auth.userId, emoji: parsed.emoji });

  if (error) {
    if (/duplicate key|unique constraint/i.test(error.message ?? "")) {
      return NextResponse.json({ ok: true, already: true });
    }
    console.error("[messages/:id/react POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
