import type { SupabaseClient } from "@supabase/supabase-js";

import type { LeaveRsvpEvent } from "./join-copy";

/**
 * Leaving a club takes you off its Members only events (Franky, Oct 22, 2026:
 * "if it's a members only event and they leave, provide a popup warning about
 * it being removed or cancelled on your end"; PLAN-3.md).
 *
 * WHY. Since 20261025100000 only a club's members see a members-only event or
 * RSVP to it (event_visible, event_audience_ok). A voluntary leave kept every
 * RSVP (only a removal drops them, in the `org_members_drop_club_access`
 * trigger), so a members-only one became an orphan: it still counted in the
 * Going list, and the student could no longer see the event to take it back.
 * Now the leave confirms say which of those they hold ({@link
 * membersOnlyRsvpsOnLeave}, `GET /join?leave_preview=1`) and the leave route
 * drops them once the membership is gone ({@link dropMembersOnlyRsvpsOnLeave}).
 * An Everyone event keeps its RSVP: anyone can still go to it.
 *
 * "UPCOMING" is `ends_at > now`, the trigger's own test, so an event under
 * way counts. Check-ins are their own table (event_checkins) and stay.
 *
 * SERVICE ROLE for both: after the leave the student's own client can't see
 * those events at all, and the preview must not depend on a policy detail.
 * Both are scoped to one student and one club, never anyone else's rows.
 *
 * No `server-only` and no `@/` imports, so `leave-rsvps.test.ts` loads it
 * under plain `node --test` (the `./join-copy` import is a type and erased).
 */

/** A members-only event's RSVPs the preview lists: the ones that mean "I'm coming". */
const COMING_STATUSES = ["going", "maybe"] as const;

/**
 * The most rows one read takes, which also keeps the delete's `.in()` list
 * (and its URL) short. A student holds a handful of RSVPs to one club's
 * upcoming events; past this the warning says "and N more" from what it has.
 */
export const LEAVE_RSVPS_MAX = 100;

/**
 * How many pages of {@link LEAVE_RSVPS_MAX} the drop takes at most (review,
 * Oct 22, 2026): a full page means more may sit behind it, and one capped
 * read would leave those as the orphans this file exists to remove. Bounded
 * so a delete that somehow takes nothing can't spin.
 */
export const LEAVE_DROP_ROUNDS = 5;

type RsvpRow = {
  status?: unknown;
  event?: { id?: unknown; title?: unknown; starts_at?: unknown } | null;
};

/** The embedded read both helpers share: the student's RSVPs to this club's members-only upcoming events. */
function membersOnlyRsvps(client: SupabaseClient, orgId: string, userId: string, nowIso: string) {
  return client
    .from("rsvps")
    .select("status, event:events!inner(id, title, starts_at, ends_at, org_id, visibility)")
    .eq("user_id", userId)
    .eq("event.org_id", orgId)
    .eq("event.visibility", "members")
    .gt("event.ends_at", nowIso);
}

/**
 * The student's Going and Interested RSVPs to the club's members-only events
 * that haven't ended, soonest first: what the leave confirms warn about.
 * `ok: false` on a failed read (logged with the club only, never a person);
 * the route then answers 500 and the confirm shows nothing extra.
 */
export async function membersOnlyRsvpsOnLeave(
  client: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<{ ok: true; events: LeaveRsvpEvent[] } | { ok: false }> {
  try {
    const { data, error } = await membersOnlyRsvps(client, orgId, userId, new Date().toISOString())
      .in("status", [...COMING_STATUSES])
      .order("event(starts_at)", { ascending: true })
      .limit(LEAVE_RSVPS_MAX);
    if (error) {
      console.error("[orgs/leave-rsvps preview]", { orgId, code: error.code });
      return { ok: false };
    }
    const events: LeaveRsvpEvent[] = [];
    for (const row of (data ?? []) as RsvpRow[]) {
      const ev = row.event;
      if (!ev || typeof ev.id !== "string" || typeof ev.starts_at !== "string") continue;
      events.push({
        id: ev.id,
        title: typeof ev.title === "string" ? ev.title : "",
        starts_at: ev.starts_at,
        viewer_status: row.status === "maybe" ? "maybe" : "going",
      });
    }
    // The read orders by the event's start already; sorted again so a
    // database that ignores an embedded order can't shuffle the warning.
    events.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    return { ok: true, events };
  } catch (err) {
    console.error("[orgs/leave-rsvps preview]", { orgId, error: err instanceof Error ? err.message : "unknown" });
    return { ok: false };
  }
}

/**
 * After a leave: delete the student's RSVPs to the club's members-only events
 * that haven't ended, every status (a "Can't go" on an event they can't see
 * is an orphan too). Two steps, since PostgREST deletes can't filter on an
 * embedded table: the event ids from the read above, then one delete on
 * (user, those events). No new one can land in between: the membership is
 * gone, and `rsvps_insert_own` refuses a non-member on a members-only event.
 *
 * A page at a time ({@link LEAVE_RSVPS_MAX}, at most {@link
 * LEAVE_DROP_ROUNDS} of them): a short page was the whole list, a full one
 * reads again, and the rows just deleted are no longer in it.
 *
 * Returns how many Going or Interested RSVPs came off (the toast's number:
 * "You're off 2 members-only events"; a "Can't go" isn't one they were on).
 * NEVER THROWS: a failed read or delete is logged (the club and the error
 * code, never a person) and gives `ok: false` with what came off before it
 * (0 on the first page); the leave stands.
 */
export async function dropMembersOnlyRsvpsOnLeave(
  service: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<{ ok: boolean; dropped: number }> {
  const tag = "[orgs/leave-rsvps drop]";
  let dropped = 0;
  try {
    const nowIso = new Date().toISOString();
    for (let round = 0; round < LEAVE_DROP_ROUNDS; round += 1) {
      const { data, error } = await membersOnlyRsvps(service, orgId, userId, nowIso).limit(LEAVE_RSVPS_MAX);
      if (error) {
        console.error(tag, "read", { orgId, code: error.code });
        return { ok: false, dropped };
      }
      const rows = (data ?? []) as RsvpRow[];
      const ids = new Set<string>();
      for (const row of rows) {
        if (typeof row.event?.id === "string") ids.add(row.event.id);
      }
      if (ids.size === 0) return { ok: true, dropped };
      const { data: gone, error: deleteErr } = await service
        .from("rsvps")
        .delete()
        .eq("user_id", userId)
        .in("event_id", [...ids])
        .select("status");
      if (deleteErr) {
        console.error(tag, "delete", { orgId, code: deleteErr.code });
        return { ok: false, dropped };
      }
      const goneRows = (gone ?? []) as { status?: unknown }[];
      for (const row of goneRows) {
        if ((COMING_STATUSES as readonly unknown[]).includes(row.status)) dropped += 1;
      }
      if (rows.length < LEAVE_RSVPS_MAX || goneRows.length === 0) return { ok: true, dropped };
    }
    return { ok: true, dropped };
  } catch (err) {
    console.error(tag, { orgId, error: err instanceof Error ? err.message : "unknown" });
    return { ok: false, dropped };
  }
}
