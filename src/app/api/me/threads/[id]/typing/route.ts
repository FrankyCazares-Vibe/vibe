import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string }> };

const HEARTBEAT_SEC = 5;
/**
 * A ping writes only when the stamp it would replace runs out within this
 * many seconds. The composer pings every 3 s, so the stamp has 2 s left at
 * each ping and every normal ping writes; only pings under 1 s apart (a
 * double send, a script) find more than 4 s left and skip. A 2 s line would
 * skip any ping that lands a little early, and the dots would go out before
 * the next one (limits critique #5).
 */
const STILL_FRESH_SEC = 4;

/**
 * Heartbeat: while the user is actively typing in a channel, the composer
 * calls this every ~3s and we bump typing_until = now() + 5s. Peers polling
 * the messages route see "typing" until typing_until passes.
 *
 * No limiter, on purpose (rate limits, wave 3): a per-account count of
 * typing pings would be a minute-by-minute record of when someone is on
 * Vibe, which Privacy Policy 3d rules out. The write is conditional instead,
 * in the same single update: it only lands when `typing_until` is empty or
 * runs out within STILL_FRESH_SEC. A skipped ping still answers ok.
 */
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

  const now = Date.now();
  const until = new Date(now + HEARTBEAT_SEC * 1000).toISOString();
  const stillFresh = new Date(now + STILL_FRESH_SEC * 1000).toISOString();
  const { error } = await supabase
    .from("channel_members")
    .update({ typing_until: until })
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .or(`typing_until.is.null,typing_until.lte.${stillFresh}`);

  if (error) {
    // Soft-fail when the column hasn't been migrated yet — typing is a
    // polish feature, not worth 500-ing the composer. Matched on the
    // missing-column codes (Postgres's in a filter, PostgREST's in the
    // payload), not the text: a refused filter names the column too, and
    // must not pass as "skipped" while the dots never show.
    if (error.code === "42703" || error.code === "PGRST204") {
      return NextResponse.json({ ok: true, skipped: true });
    }
    console.error("[threads.typing]", error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
