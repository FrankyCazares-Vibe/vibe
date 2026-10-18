import { NextResponse } from "next/server";

import { limitFor } from "@/lib/limits/budgets";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { membersOnly, standingInRoom } from "../_lib/club-follower";

type RouteCtx = { params: Promise<{ id: string }> };
type Body = { pinned?: unknown };

/** What a refusal on the `threadSettings` budget says: the same line on every route that shares it (the numbers are in src/lib/limits/budgets.ts). */
const SETTINGS_TOO_FAST = "You're changing chat settings too fast. Try again in a few minutes.";

/**
 * Toggle pin on a thread. Body `{ pinned: true|false }` is explicit; if
 * omitted, flips the current value. Pinned threads sort to the top of
 * the viewer's thread list.
 *
 * A follower reading a club's Board (Franky, Oct 16) has no row to pin:
 * 403 `members_only` (../_lib/club-follower.ts).
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
  const rl = await limitFor("threadSettings", user.id);
  if (!rl.allowed) return tooManyRequests(rl, SETTINGS_TOO_FAST);

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* allow empty body for toggle */
  }

  const { data: existing, error: readErr } = await supabase
    .from("channel_members")
    .select("pinned_at")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readErr) {
    console.error("[threads.pin read]", readErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (!existing) {
    // A follower reading a club's Board holds no row, so there is nothing to
    // pin: they get `members_only`, the chat's answer to a follower. Asked
    // only on this miss, so a member's pin costs nothing more; a read that
    // fails answers as before.
    if ((await standingInRoom(supabase, channelId, user.id)) === "follower") return membersOnly();
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  const wantPinned =
    typeof body.pinned === "boolean" ? body.pinned : existing.pinned_at === null;
  const pinned_at = wantPinned ? new Date().toISOString() : null;

  const { error: updErr } = await supabase
    .from("channel_members")
    .update({ pinned_at })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (updErr) {
    console.error("[threads.pin update]", updErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pinned: wantPinned });
}
