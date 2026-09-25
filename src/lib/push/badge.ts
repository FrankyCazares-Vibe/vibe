import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadHiddenUsers, type HiddenUsers } from "@/lib/safety/hidden-users";

/**
 * THE unread number on the app icon (plan §7 2D; critic-push.md item 14).
 * One helper, read by `GET /api/me/badge` and by every push the dispatcher
 * sends, so the icon, the push and the app never show three different counts.
 *
 *   total = unread notifications + unread DM and group threads
 *
 * NOTIFICATIONS: the count route's rule exactly
 * (src/app/api/me/notifications/count/route.ts): unread rows for the student,
 * leaving out actors blocked either way or muted right now. That route also
 * counts the dead `connection` kind; so does this, or the Otto dot and the
 * icon would disagree (critic item 14, out-of-scope note).
 *
 * THREADS: the Messages list's rule (src/app/api/me/threads/route.ts GET), a
 * thread is unread when its latest message is from someone else and newer
 * than the student's `last_read_at`. Like the list: requests (not yet
 * accepted) are left out, a hidden thread counts again only once a newer
 * message arrives, and a 1:1 chat with someone blocked either way is gone.
 * Like the phone and desktop clients: a chat muted until later doesn't count
 * (its mute copy promises "no unread badge"). And, the one addition, the
 * recommended single rule (research code-notifications.md §E): a latest
 * message from someone blocked or muted doesn't light the icon, the same
 * people whose pushes are never sent.
 *
 * WHICH CLIENT: the badge route passes the student's own client (RLS scopes
 * every read to them, as in the count and threads routes). The dispatcher
 * passes the service client; every query below also filters on `userId`, so
 * the answer is the same. Removed messages are left out explicitly, which is
 * what RLS does for the student's own client.
 *
 * AT MOST FOUR ROUND TRIPS (loadHiddenUsers is two reads in parallel, skipped
 * when the caller already has it). Any failure answers `{ ok: false }`; the
 * dispatcher then leaves the badge out of the push rather than guess.
 */

export type BadgeCounts = { notifications: number; messages: number; total: number };
export type BadgeResult = ({ ok: true } & BadgeCounts) | { ok: false; error: unknown };

/** The same budget the threads list reads, per channel (threads/route.ts). */
const MESSAGES_PER_CHANNEL = 5;

type MemberRow = {
  channel_id: string;
  accepted_at: string | null;
  last_read_at: string | null;
  hidden_at: string | null;
  muted_until: string | null;
  channels: { type: string; org_id: string | null } | null;
};

type LatestRow = { channel_id: string; user_id: string; created_at: string };

const time = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

export async function loadBadgeCounts(
  client: SupabaseClient,
  userId: string,
  hiddenIn?: HiddenUsers,
): Promise<BadgeResult> {
  try {
    let hidden = hiddenIn;
    if (!hidden) {
      const res = await loadHiddenUsers(client, userId);
      if (!res.ok) return { ok: false, error: res.error };
      hidden = res.hidden;
    }
    const hiddenIds = hidden.ids;

    let unreadQuery = client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    if (hiddenIds.length > 0) unreadQuery = unreadQuery.notIn("actor_id", hiddenIds);

    const [unreadRes, membersRes] = await Promise.all([
      unreadQuery,
      client
        .from("channel_members")
        .select("channel_id, accepted_at, last_read_at, hidden_at, muted_until, channels!inner(type, org_id)")
        .eq("user_id", userId)
        .not("accepted_at", "is", null),
    ]);
    if (unreadRes.error) return { ok: false, error: unreadRes.error };
    if (membersRes.error) return { ok: false, error: membersRes.error };

    const now = Date.now();
    const members = ((membersRes.data ?? []) as unknown as MemberRow[]).filter((m) => {
      const type = m.channels?.type;
      if (type !== "dm" && type !== "group") return false;
      if (m.channels?.org_id) return false;
      return !(m.muted_until && time(m.muted_until) > now);
    });

    let messages = 0;
    if (members.length > 0) {
      const channelIds = members.map((m) => m.channel_id);
      const latestRes = await client
        .from("messages")
        .select("channel_id, user_id, created_at")
        .in("channel_id", channelIds)
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .limit(channelIds.length * MESSAGES_PER_CHANNEL);
      if (latestRes.error) return { ok: false, error: latestRes.error };

      const latest = new Map<string, LatestRow>();
      for (const row of (latestRes.data ?? []) as LatestRow[]) {
        if (!latest.has(row.channel_id)) latest.set(row.channel_id, row);
      }
      for (const m of members) {
        const last = latest.get(m.channel_id);
        if (!last || last.user_id === userId) continue;
        // Blocked either way hides a 1:1 chat from the list; blocked or
        // muted, the latest message doesn't light the icon (header).
        if (hidden.blocked.has(last.user_id) || hidden.muted.has(last.user_id)) continue;
        const at = time(last.created_at);
        if (m.hidden_at && !(at > time(m.hidden_at))) continue;
        if (!m.last_read_at || at > time(m.last_read_at)) messages += 1;
      }
    }

    const notifications = unreadRes.count ?? 0;
    return { ok: true, notifications, messages, total: notifications + messages };
  } catch (error) {
    return { ok: false, error };
  }
}
