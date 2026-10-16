import { NextResponse } from "next/server";

import { limitFor } from "@/lib/limits/budgets";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

/** What a refusal on the `threadSettings` budget says: the same line on every route that shares it (the numbers are in src/lib/limits/budgets.ts). */
const SETTINGS_TOO_FAST = "You're changing chat settings too fast. Try again in a few minutes.";

/** Explicitly accept a message request. Idempotent. */
export async function POST(_req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const rl = await limitFor("threadSettings", user.id);
  if (!rl.allowed) return tooManyRequests(rl, SETTINGS_TOO_FAST);

  const { data: existing, error: readErr } = await supabase
    .from("channel_members")
    .select("accepted_at")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readErr) {
    console.error("[threads.accept read]", readErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }
  if (existing.accepted_at) {
    return NextResponse.json({ ok: true, already: true });
  }

  const { error: updErr } = await supabase
    .from("channel_members")
    .update({ accepted_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (updErr) {
    console.error("[threads.accept update]", updErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
