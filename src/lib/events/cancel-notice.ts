/**
 * The cancel notice's rules, as pure functions (S68 officer tools, B1;
 * contract C1 in handoffs/wave-plan-s68/officer-tools.md). The database side
 * (`notifications.event_title`, `event_starts_at`, the 'event_cancelled'
 * type and its shape CHECK) is
 * supabase/migrations/20260930100000_event_cancel_notices.sql;
 * cancel-notice.test.ts reads that file and fails if the two drift.
 *
 * Franky's calls (Sept 28):
 *  - Cancel and Delete are one DELETE. Whichever the officer pressed, an
 *    event that has NOT ended tells everyone who RSVP'd going or maybe,
 *    except the officer who did it.
 *  - An event that already ended is deleted with no notice.
 *  - The notice is from the club: `actor_id` is the officer only because the
 *    column is NOT NULL. Nothing shows it.
 *
 * Pure: no `@/` import, so `node --test --experimental-strip-types` loads it.
 */

export const EVENT_CANCELLED_TYPE = "event_cancelled" as const;

/** notifications_event_title_length: the same cap as events.title. */
export const NOTICE_TITLE_MAX = 120;

/** Used only if a stored title is somehow blank (events_title_length forbids it). */
export const NOTICE_TITLE_FALLBACK = "An event";

/** The RSVP statuses that count as "RSVP'd". 'no' is not one of them. */
export const NOTIFIED_RSVP_STATUSES = ["going", "maybe"] as const;

/** The event as it was read just before the delete. */
export type CancelledEvent = {
  id: string;
  org_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
};

/** One notifications row, exactly as the service role inserts it. */
export type CancelNoticeRow = {
  user_id: string;
  actor_id: string;
  type: typeof EVENT_CANCELLED_TYPE;
  org_id: string;
  event_title: string;
  event_starts_at: string;
};

/**
 * True when the event is still upcoming or under way: its end is after
 * `nowMs`. An end that can't be read counts as ended, so a bad row never
 * sends anyone a notice.
 */
export function cancelSendsNotices(endsAt: string, nowMs: number): boolean {
  const end = Date.parse(endsAt);
  return Number.isFinite(end) && end > nowMs;
}

/**
 * Who hears about it: each student with a going/maybe RSVP, once, never the
 * officer who pressed the button.
 */
export function cancelRecipientIds(
  rows: ReadonlyArray<{ user_id?: unknown; status?: unknown }>,
  actorId: string,
): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    if (typeof row.user_id !== "string" || !row.user_id) continue;
    if (row.user_id === actorId) continue;
    if (!(NOTIFIED_RSVP_STATUSES as readonly unknown[]).includes(row.status)) continue;
    out.add(row.user_id);
  }
  return [...out];
}

/**
 * The title as the notice stores it: trimmed and at most 120 characters,
 * counted the way Postgres counts them (code points), so a title of emoji
 * can't pass here and fail the CHECK.
 */
export function noticeTitle(title: string): string {
  const points = Array.from((title ?? "").trim());
  if (points.length === 0) return NOTICE_TITLE_FALLBACK;
  return points.slice(0, NOTICE_TITLE_MAX).join("").trim() || NOTICE_TITLE_FALLBACK;
}

/** One C1 row per recipient. post_id / comment_id / message_id stay unset (NULL). */
export function cancelNoticeRows(
  event: CancelledEvent,
  recipientIds: readonly string[],
  actorId: string,
): CancelNoticeRow[] {
  const title = noticeTitle(event.title);
  return recipientIds.map((userId) => ({
    user_id: userId,
    actor_id: actorId,
    type: EVENT_CANCELLED_TYPE,
    org_id: event.org_id,
    event_title: title,
    event_starts_at: event.starts_at,
  }));
}
