import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The people a viewer should not see posts, reposts or notifications from
 * right now. Read by /api/feed and /api/me/notifications.
 *
 *   - `blocked`: a block in EITHER direction — the viewer blocked them, or
 *     they blocked the viewer. RLS `blocks_select_either` lets the session
 *     read both directions, so the caller's own client is enough.
 *   - `muted`: the viewer's ACTIVE mutes. `until` null means "until I
 *     unmute"; a past `until` has expired and hides nothing. Same test as
 *     the `is_muting_now` SQL function and /api/me/relationships. RLS
 *     `mutes_select_own` scopes the read to the viewer's own rows.
 *
 * Two small queries in parallel — one round trip. Callers exclude with
 * `.notIn(column, ids)` inside their query, before limit and ranking, so a
 * hidden author never costs the viewer a slot on the page.
 */
export type HiddenUsers = {
  blocked: Set<string>;
  muted: Set<string>;
  /** blocked ∪ muted. Empty when there is nothing to hide — skip `.notIn` then. */
  ids: string[];
};

export async function loadHiddenUsers(
  supabase: SupabaseClient,
  viewerId: string,
): Promise<{ ok: true; hidden: HiddenUsers } | { ok: false; error: unknown }> {
  const [blocksRes, mutesRes] = await Promise.all([
    supabase
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`),
    supabase.from("mutes").select("muted_id, until").eq("muter_id", viewerId),
  ]);
  if (blocksRes.error) return { ok: false, error: blocksRes.error };
  if (mutesRes.error) return { ok: false, error: mutesRes.error };

  const blocked = new Set<string>();
  for (const row of blocksRes.data ?? []) {
    const r = row as { blocker_id: string; blocked_id: string };
    blocked.add(r.blocker_id === viewerId ? r.blocked_id : r.blocker_id);
  }

  const now = Date.now();
  const muted = new Set<string>();
  for (const row of mutesRes.data ?? []) {
    const r = row as { muted_id: string; until: string | null };
    if (r.until === null || new Date(r.until).getTime() > now) muted.add(r.muted_id);
  }

  // Never hide the viewer from themselves (self-block/self-mute are
  // rejected at the API, but a stray row must not empty their own feed).
  const all = new Set<string>([...blocked, ...muted]);
  all.delete(viewerId);
  return { ok: true, hidden: { blocked, muted, ids: Array.from(all) } };
}
