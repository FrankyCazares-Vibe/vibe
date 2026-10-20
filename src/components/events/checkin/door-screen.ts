/**
 * The door screen's pure rules (Oct 19, 2026, critique batch B10): which of
 * its screens shows, where its one way out sits, and the few lines only the
 * door says. DoorView draws what these return.
 *
 * WHY ONE WAY OUT. The open door drew "Done" twice (the header and again
 * beside Stop), and a member's "only the owner and admins" screen had Done
 * and "Go to the event" going to the same card. Two buttons to the same
 * place read as two different things, which is the last thing an officer
 * holding a line needs. Now every screen has exactly one way back to the
 * event: the header's Done for anyone who can run check-in (the same spot on
 * every screen, so it doesn't jump when Start turns into the QR), and the
 * body's "Go to the event" for everyone else.
 *
 * WHY CAMPUS TIME. The student's check-in page already says when check-in
 * opens in campus time (CheckinLanding uses campusClock), so the door says
 * the same clock, and names the day when it isn't today: a door link opened
 * the night before used to say "opens at 7:00 PM" with no day.
 *
 * PURE: no React, no DOM, so node:test can load it.
 */
import { addCampusDays, campusClock, campusDay } from "@/components/campus/tonight/campus-time";
import { CHECKIN_COPY, checkinCountLine } from "@/lib/events/event-checkin";

/** Every screen the door can show, in the order DoorView checks them. */
export type DoorScreen =
  | "loadFailed" // the page couldn't read the event: "Couldn't load check-in." + Try again
  | "notOfficer" // not the club's owner or an admin (the page's check, or the feed's refusal)
  | "loading" // waiting for the first feed
  | "failed" // the first feed was refused or failed
  | "before" // the window hasn't opened
  | "start" // inside the window, check-in not started: the Start button
  | "open" // the QR, the code and Stop
  | "after"; // the window has closed

export type DoorPhase = "before" | "window" | "after" | null;

/**
 * Oct 19, 2026: `failCode` too. The page lets the door try when its own
 * officer check errors, and a role can be taken away mid-event; either way
 * the feed's answer is "org_role_required", and that is the same fact as the
 * page's own check, so it gets the same screen and the same one way out
 * ("Go to the event"), not "Couldn't load check-in." with a Try again that
 * can never work.
 */
export function doorScreen(s: {
  loadFailed: boolean;
  canManage: boolean;
  hasFeed: boolean;
  failed: boolean;
  failCode?: string | null;
  phase: DoorPhase;
  open: boolean;
}): DoorScreen {
  if (s.loadFailed) return "loadFailed";
  if (!s.canManage) return "notOfficer";
  if (!s.hasFeed && s.failed && s.failCode === "org_role_required") return "notOfficer";
  if (!s.hasFeed) return s.failed ? "failed" : "loading";
  if (s.phase === "before") return "before";
  if (s.phase === "after") return "after";
  return s.open ? "open" : "start";
}

export type DoorExits = {
  /** The header's Done (to the event's card). */
  headerDone: boolean;
  /**
   * The body's own link, if any: "event" (to the same card, so only when
   * there is no Done) or "whoCame" (the club's page, a different place).
   */
  bodyLink: "event" | "whoCame" | null;
};

/** Where a screen's way out sits. Never two links to the event's card. */
export function doorExits(screen: DoorScreen, hasClub: boolean): DoorExits {
  if (screen === "notOfficer") return { headerDone: false, bodyLink: "event" };
  if (screen === "after" && hasClub) return { headerDone: true, bodyLink: "whoCame" };
  return { headerDone: true, bodyLink: null };
}

/**
 * When check-in opens, in campus time, with the day when it isn't today:
 * "at 6:00 PM", "tomorrow at 6:00 PM" or "Thu, Oct 22 at 6:00 PM". Null for
 * a time that doesn't parse. Exported for the student's check-in page too
 * (Oct 19, 2026: its "before" line still names no day; the patch for it is
 * handoffs/2026-10-19-critique/B10-opens-line.patch).
 */
export function checkinOpensWhen(opensAtMs: number, nowMs: number): string | null {
  if (!Number.isFinite(opensAtMs) || !Number.isFinite(nowMs)) return null;
  const clock = campusClock(opensAtMs);
  const day = campusDay(opensAtMs);
  const today = campusDay(nowMs);
  if (day.key === today.key) return `at ${clock}`;
  if (day.key === addCampusDays(today, 1).key) return `tomorrow at ${clock}`;
  return `${day.label} at ${clock}`;
}

/**
 * "Check-in opens at 6:00 PM." today, "...tomorrow at 6:00 PM.", or
 * "...Thu, Oct 22 at 6:00 PM." Null for a time that doesn't parse (the
 * screen then says only that it opens an hour before the event).
 */
export function doorOpensLine(opensAtMs: number, nowMs: number): string | null {
  const when = checkinOpensWhen(opensAtMs, nowMs);
  return when ? `Check-in opens ${when}.` : null;
}

/**
 * The Start screen's lead, the door's own (Oct 19, 2026). The shared
 * doorStartLead said "the 4 numbers under the code", but from 760 px wide
 * the numbers sit beside the QR, and before Start there is no QR yet, so
 * "the code" could mean either. This names the QR, says "next to it" (true
 * in both layouts) and keeps the students' own words, "the 4 numbers"
 * ("4-digit" broke at its hyphen on the desktop's two lines).
 */
export const DOOR_START_LEAD =
  // No-break spaces keep "QR code" and "4 numbers" whole on a phone's lines.
  "People check in by scanning the QR\u00a0code or typing the 4\u00a0numbers next to it. Both change every 30 seconds.";

/**
 * After the window: "7 were there", or "Nobody checked in" (the shared
 * "Nobody has checked in yet." is for an open door; after the end there is
 * no "yet"). No full stop, like "7 were there": it's the same big count line
 * (Oct 19, 2026).
 */
export const DOOR_NOBODY_CAME = "Nobody checked in";

export function doorAfterLine(count: number): string {
  return checkinCountLine(count, true, true) ?? DOOR_NOBODY_CAME;
}

/**
 * The after-the-end link to the club's page. With nobody checked in, "See who
 * came" sat right under "Nobody checked in" and contradicted it. The link
 * stays because officers can still mark Going and Interested people as here
 * for a day after the end, so at 0 it says that instead (Oct 19, 2026).
 */
export const DOOR_MARK_WHO_CAME = "Mark who came";

export function doorWhoCameLabel(count: number): string {
  return count > 0 ? CHECKIN_COPY.seeWhoCame : DOOR_MARK_WHO_CAME;
}
