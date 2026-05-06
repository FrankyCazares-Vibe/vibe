import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Tell the caller what safety relationships the viewer has with another
 * user — am I blocking them? Did they block me? Am I muting them?
 *
 * Used by the profile (...) menu, post viewer "..." menu, and DM panel
 * to render the right Block/Unblock and Mute/Unmute toggles. Always
 * returns 200 — empty fields when no relationship exists.
 *
 * Query: ?with=<user_id_or_handle>
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const raw = (url.searchParams.get("with") || "").trim();
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Missing ?with=" }, { status: 400 });
  }

  // Accept either a UUID id or a handle.
  const looksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw);
  let targetId: string | null = null;
  if (looksUuid) {
    targetId = raw;
  } else {
    const { data: u } = await supabase
      .from("users")
      .select("id")
      .eq("handle", raw.toLowerCase())
      .maybeSingle();
    if (u?.id) targetId = u.id as string;
  }
  if (!targetId) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  if (targetId === user.id) {
    return NextResponse.json({
      ok: true,
      blocking: false,
      muting: false,
      mute_until: null,
    });
  }

  const [iBlock, myMute] = await Promise.all([
    supabase
      .from("blocks")
      .select("id", { count: "exact", head: true })
      .eq("blocker_id", user.id)
      .eq("blocked_id", targetId),
    supabase
      .from("mutes")
      .select("until")
      .eq("muter_id", user.id)
      .eq("muted_id", targetId)
      .maybeSingle(),
  ]);

  const blocking = (iBlock.count ?? 0) > 0;
  const muteRow = myMute.data as { until: string | null } | null;
  const until = muteRow?.until ?? null;
  const muting = !!muteRow && (until === null || new Date(until) > new Date());

  // We intentionally don't surface whether the OTHER user blocks the
  // viewer — that's a privacy/UX call. The API just rejects the relevant
  // actions (send DM, view profile) when blocked-by is the case.

  return NextResponse.json({
    ok: true,
    blocking,
    muting,
    mute_until: until,
  });
}
