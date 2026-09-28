/**
 * Club event rules, as pure functions (security wave 2, A4).
 *
 * The same numbers live in the database, in
 * supabase/migrations/20260928110000_club_events_rules.sql (the events_*
 * CHECK constraints). manage.test.ts reads that file and fails if the two
 * drift apart: a route cap looser than the CHECK turns a clean 400 into a 500.
 *
 * WHY THE ROUTE CAN USE `.length`: JavaScript counts UTF-16 code units and
 * Postgres `char_length` counts code points, and a code point is one or two
 * units, so `.length <= N` always implies `char_length <= N`. Anything the
 * route accepts passes the CHECK.
 */

export const EVENT_MAX_TITLE = 120;
export const EVENT_MAX_DESCRIPTION = 2000;
export const EVENT_MAX_LOCATION = 200;

/** An event can last at most 14 days (Franky's product call 8, wave A). */
export const EVENT_MAX_DURATION_DAYS = 14;
export const EVENT_MAX_DURATION_MS = EVENT_MAX_DURATION_DAYS * 24 * 60 * 60 * 1000;

/** How far in the past a start may be and still count as "now" (form lag). */
export const EVENT_START_GRACE_MS = 5 * 60 * 1000;

export type EventTimesProblem = { code: "invalid_times"; error: string };

/**
 * Checks a new event's start and end (epoch ms, from Date.parse). Returns
 * null when they are fine, or the 400 to send. Order matters only for which
 * message a student sees first.
 */
export function eventTimesProblem(start: number, end: number, nowMs: number): EventTimesProblem | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { code: "invalid_times", error: "Start and end times are required" };
  }
  if (end < start) {
    return { code: "invalid_times", error: "End time must be after start" };
  }
  if (start < nowMs - EVENT_START_GRACE_MS) {
    return { code: "invalid_times", error: "Start time is in the past" };
  }
  if (end - start > EVENT_MAX_DURATION_MS) {
    return {
      code: "invalid_times",
      error: `An event can last at most ${EVENT_MAX_DURATION_DAYS} days`,
    };
  }
  return null;
}

/**
 * Who manages an event (sees its attendee list, and may delete it).
 *
 * A CLUB event follows the club's CURRENT owner and admins, never the row's
 * creator: an officer who is demoted or removed loses it the moment their
 * role changes, and every current officer has it whoever made the event.
 * Moderators ('mod') moderate chat, not content, so they don't.
 * An org-less (legacy) event is managed by its creator.
 *
 * The database says the same thing in public.can_manage_event and the
 * events DELETE policy; this is the copy the events list uses to decide
 * whether to show "Manage attendees".
 */
export function viewerCanManage(input: {
  orgId: string | null;
  creatorId: string | null;
  viewerId: string;
  viewerIsOfficer: boolean;
}): boolean {
  if (input.orgId) return input.viewerIsOfficer;
  return !!input.creatorId && input.creatorId === input.viewerId;
}

/**
 * A club event never ships the creator's identity: the app shows the club,
 * not the officer who typed it. Only an org-less event keeps `creator`
 * (the card shows "by @handle" for those). `creator_id` stays; it is readable
 * over the data API anyway and the client uses it only as a colour fallback.
 */
export function withoutClubCreator<T extends { org_id: string | null; creator: unknown }>(
  row: T,
): T {
  return row.org_id ? { ...row, creator: null } : row;
}
