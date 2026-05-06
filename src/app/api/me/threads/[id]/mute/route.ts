import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };
type Body = { duration_hours?: unknown };

const ALLOWED_HOURS: ReadonlySet<number> = new Set([1, 8, 24, 168]);
// Forever = a far-future timestamp. Easier than carrying a separate
// "forever" boolean and special-casing NULL.
const FOREVER_YEARS = 100;

/**
 * Channel mute — viewer-side silence on a single chat (DM or group).
 * Body `{ duration_hours }` set to 1/8/24/168 picks the cutoff;
 * omitted/null/0 = forever.
 *
 * Effects (client-side mostly): muted channels don't contribute to the
 * unread badge in the mini messenger and the thread list shows a small
 * mute icon. Messages still arrive — just not flashy.
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

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* allow empty body — interpreted as forever. */
  }

  let until: string;
  if (typeof body.duration_hours === "number" && body.duration_hours > 0) {
    if (!ALLOWED_HOURS.has(body.duration_hours)) {
      return NextResponse.json(
        { ok: false, error: "duration_hours must be one of 1, 8, 24, 168" },
        { status: 400 },
      );
    }
    until = new Date(Date.now() + body.duration_hours * 60 * 60 * 1000).toISOString();
  } else {
    const now = new Date();
    now.setFullYear(now.getFullYear() + FOREVER_YEARS);
    until = now.toISOString();
  }

  const { error } = await supabase
    .from("channel_members")
    .update({ muted_until: until })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (error) {
    if (/muted_until|column/i.test(error.message ?? "")) {
      // Migration lag — surface a 503 so the client can show a
      // friendly "feature coming online" message rather than 500.
      return NextResponse.json(
        { ok: false, error: "Mute is rolling out — try again in a minute." },
        { status: 503 },
      );
    }
    console.error("[threads.mute.POST]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, muted_until: until });
}

/** Unmute. Idempotent. */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("channel_members")
    .update({ muted_until: null })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[threads.mute.DELETE]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
