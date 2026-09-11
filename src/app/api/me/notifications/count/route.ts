import { NextResponse } from "next/server";

import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Counts for the Otto corner-ring dot AND the stats tiles.
 *
 * Returns:
 *   - `unread` — total unread notifications (drives the corner-ring dot)
 *   - `totals` — per-type breakdown for the last 30 days, used by the
 *               profile hero status line and the side-panel stats grid
 *
 * Five small COUNT queries instead of one keeps each cheap and lets
 * Postgres use the existing indexes. Polled every ~30s by Otto so we
 * keep this fast.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Nothing from someone blocked either way, or muted right now: the same
  // people ../route.ts leaves out of the list, with the same filter on
  // actor_id, so the badge never counts a row the list won't show.
  // OttoCorner peeks `?limit=1` when `unread` rises, and a hidden row
  // counted here would land that peek on an older, visible notification.
  // The 30-day totals sit beside the list in the side panel, so they
  // leave the same people out. Fail closed on error, as the list does.
  const hiddenRes = await loadHiddenUsers(supabase, user.id);
  if (!hiddenRes.ok) {
    console.error("[me/notifications/count hidden-users]", hiddenRes.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const hiddenIds = hiddenRes.hidden.ids;

  // Every count below starts here.
  const visible = () => {
    const q = supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    return hiddenIds.length > 0 ? q.notIn("actor_id", hiddenIds) : q;
  };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const countByType = (t: string) =>
    visible().eq("type", t).gte("created_at", since);

  // Unread-mention count drives the corner's "thinking + alert" morph
  // — the orb's body switches to a richer multi-orbit treatment when
  // there's at least one unread mention sitting in the inbox, so the
  // user can tell at a glance "Otto wants to show me something".
  const unreadMentionRes = visible().eq("type", "mention").is("read_at", null);

  const [
    unreadRes,
    followRes,
    connRes,
    likeRes,
    commentRes,
    mentionRes,
    unreadMention,
  ] = await Promise.all([
    visible().is("read_at", null),
    countByType("follow"),
    countByType("connection"),
    countByType("like"),
    countByType("comment"),
    countByType("mention"),
    unreadMentionRes,
  ]);

  const firstErr = [
    unreadRes,
    followRes,
    connRes,
    likeRes,
    commentRes,
    mentionRes,
    unreadMention,
  ].find((r) => r.error)?.error;
  if (firstErr) {
    console.error("[me/notifications/count]", firstErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    unread: unreadRes.count ?? 0,
    unread_mention: unreadMention.count ?? 0,
    totals: {
      follow:     followRes.count  ?? 0,
      connection: connRes.count    ?? 0,
      like:       likeRes.count    ?? 0,
      comment:    commentRes.count ?? 0,
      mention:    mentionRes.count ?? 0,
    },
    window_days: 30,
  });
}
