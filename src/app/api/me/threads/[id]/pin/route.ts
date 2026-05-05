import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };
type Body = { pinned?: unknown };

/**
 * Toggle pin on a thread. Body `{ pinned: true|false }` is explicit; if
 * omitted, flips the current value. Pinned threads sort to the top of
 * the viewer's thread list.
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
    return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  }
  if (!existing) {
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
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, pinned: wantPinned });
}
