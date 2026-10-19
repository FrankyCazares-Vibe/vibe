/**
 * Event check-in, the half both sides share (Oct 19 2026; contract:
 * handoffs/2026-10-19-checkin-build/CONTRACT.md): the numbers, the wire
 * types of every check-in route, the student-facing words and the pure
 * helpers the cards, the check-in page, the door screen and the routes use.
 * No React and nothing server-only: the routes and the browser both load it.
 *
 * The database half is supabase/migrations/20261019120000_event_checkins.sql
 * (the codes, the window, the from-5 floor); the numbers here mirror it and
 * src/lib/events/checkin-migration.test.ts keeps the two equal.
 *
 * "Check-in" here always means checking in AT AN EVENT. The yearly
 * school-email check (src/lib/auth/school-checkin-job.ts) and the usage
 * heartbeat (Privacy Policy 3d) are other things; never mix the names.
 */

// ── The numbers ─────────────────────────────────────────────────────────────

/** A code and a QR token last one 30-second step (the database's `step`). */
export const CHECKIN_STEP_SEC = 30;
export const CHECKIN_CODE_DIGITS = 4;
export const CHECKIN_TOKEN_LENGTH = 22;
/** Check-in works from an hour before the start ... */
export const CHECKIN_OPENS_BEFORE_MS = 60 * 60 * 1000;
/** ... to an hour after the end. */
export const CHECKIN_CLOSES_AFTER_MS = 60 * 60 * 1000;
/** Officers can mark people as here until a day after the end. */
export const CHECKIN_MARK_CLOSES_AFTER_MS = 24 * 60 * 60 * 1000;
/** Below this, nobody but the event's officers is told how many checked in. */
export const CHECKIN_PUBLIC_FLOOR = 5;
/** The query parameter the door's QR link carries its token in (Sentry strips it). */
export const CHECKIN_LINK_PARAM = "checkin";
/** How often the door screen re-reads its feed while it is visible. */
export const DOOR_POLL_MS = 10_000;
/** How often the officers' attendee list re-reads while check-in can happen. */
export const ATTENDEES_POLL_MS = 20_000;

// ── Wire types ──────────────────────────────────────────────────────────────

/** Every `code` a check-in route can answer with (plus the shared gates'). */
export type CheckinErrorCode =
  | "invalid_event_id"
  | "invalid_user_id"
  | "invalid_json"
  | "invalid_body"
  | "unauthorized"
  | "terms_required"
  | "account_restricted"
  | "not_found"
  | "org_role_required"
  | "org_hidden"
  | "checkin_code_format"
  | "checkin_code_wrong"
  | "checkin_link_expired"
  | "checkin_closed"
  | "checkin_outside_window"
  | "checkin_mark_window"
  | "checkin_not_on_list"
  | "checkin_too_many_tries"
  | "checkin_unavailable"
  | "request_failed";

/** A refusal: `{ ok: false, code, error }`, `error` a sentence a person can read. */
export type CheckinFailureBody = { ok: false; code: CheckinErrorCode; error: string };

/** What the viewer knows about one event's check-in. */
export type CheckinViewerState = {
  event_id: string;
  /** An officer started check-in and the window is on (club not hidden). */
  open: boolean;
  /** The viewer checked in (or was marked as here). */
  checked_in: boolean;
  /** Exact for the event's officers; for everyone else null below 5. */
  count: number | null;
  /** ISO times: an hour before the start, an hour after the end. */
  opens_at: string;
  closes_at: string;
};

/** GET /api/events/[id]/checkin */
export type CheckinStateResponse = { ok: true; state: CheckinViewerState };
/** POST /api/events/[id]/checkin: exactly one of the two. */
export type CheckinPostBody = { code: string } | { token: string };
export type CheckinPostResponse = { ok: true; already: boolean; state: CheckinViewerState };
/** DELETE /api/events/[id]/checkin. `state` is null when the event can no longer be seen. */
export type CheckinDeleteResponse = { ok: true; state: CheckinViewerState | null };

/** One 30-second step on the door screen. `link` is what the QR holds. */
export type DoorStep = { code: string; link: string; starts_at: string; ends_at: string };

/** GET / POST / DELETE /api/events/[id]/checkin/door (officers). */
export type DoorFeed = {
  event_id: string;
  /** Started, and inside the window. */
  open: boolean;
  opens_at: string;
  closes_at: string;
  /** The database's clock, for the countdown (the screen's own may drift). */
  server_now: string;
  /** Null unless open. */
  current: DoorStep | null;
  /** The step after `current`, so one missed read never blanks the screen. */
  next: DoorStep | null;
  /** Exact: everyone checked in so far. */
  count: number;
};
export type DoorResponse = { ok: true; door: DoorFeed };

/** PUT / DELETE /api/events/[id]/checkin/marks/[userId] (officers). */
export type MarkResponse = { ok: true; user_id: string; checked_in: boolean };
/** DELETE /api/events/[id]/checkin/marks (officers): clear all. */
export type ClearResponse = { ok: true; cleared: number };

export type AttendeeUser = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  major: string | null;
  year: number | null;
};

/** One row of the officers' attendee list. A walk-in has `status: null`. */
export type EventAttendee = {
  status: "going" | "maybe" | null;
  created_at: string | null;
  checked_in: boolean;
  user: AttendeeUser;
};

export type AttendeesCheckin = {
  open: boolean;
  /** Exact: every check-in row, walk-ins included. */
  count: number;
  starts_at: string;
  ends_at: string;
};

/** GET /api/events/[id]/attendees (officers), extended. */
export type AttendeesResponse = {
  ok: true;
  going: EventAttendee[];
  interested: EventAttendee[];
  /** Checked in without a Going or Interested RSVP. */
  walk_ins: EventAttendee[];
  checkin: AttendeesCheckin;
};

/** GET /api/me/event-checkins: the viewer's own, for Settings. */
export type MyEventCheckin = {
  event_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  org: { name: string; handle: string } | null;
};
export type MyEventCheckinsResponse = { ok: true; checkins: MyEventCheckin[] };

/** The three fields every GET /api/events item (and PATCH's `event`) gains. */
export type EventCheckinListFields = {
  checkin_open: boolean;
  checked_in_count: number | null;
  viewer_checked_in: boolean;
};

/** What a card needs to draw check-in (a CampusEvent fits it). */
export type CheckinCardEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  viewer_can_manage?: boolean;
} & Partial<EventCheckinListFields>;

/** One parsed row of `event_checkin_state`. */
export type CheckinStateRow = { open: boolean; count: number | null; viewerCheckedIn: boolean };

// ── Words ───────────────────────────────────────────────────────────────────
// Plain English, no blame. Never the word "safety", nothing about location.

export const CHECKIN_ERRORS: Record<CheckinErrorCode, string> = {
  invalid_event_id: "That event is no longer available.",
  invalid_user_id: "That person isn't on this event's list.",
  invalid_json: "Something went wrong. Try again.",
  invalid_body: "Something went wrong. Try again.",
  unauthorized: "Sign in to check in.",
  terms_required: "Accept the Terms to continue.",
  account_restricted: "Your account is restricted.",
  not_found: "That event is no longer available.",
  org_role_required: "Only the club's owner and admins can run check-in.",
  org_hidden: "You can't change this club's events right now.",
  checkin_code_format: "Enter the 4-digit code on the screen at the door.",
  checkin_code_wrong: "That code didn't match. It changes every 30 seconds, so check the screen and try again.",
  checkin_link_expired: "That link has expired. Type the 4-digit code on the screen instead.",
  checkin_closed: "Check-in isn't open right now.",
  checkin_outside_window: "Check-in works from an hour before the event until an hour after it ends.",
  checkin_mark_window: "You can mark people as here from an hour before the event until a day after it ends.",
  checkin_not_on_list: "You can mark people who said Going or Interested.",
  checkin_too_many_tries: "Too many tries today. If you said Going or Interested, ask someone running check-in to mark you as here.",
  checkin_unavailable: "Check-in is busy right now. Try again in a minute.",
  request_failed: "Something went wrong. Try again.",
};

export const CHECKIN_COPY = {
  checkIn: "Check in",
  imHere: "I'm here",
  checkedIn: "You're checked in",
  remove: "Remove my check-in",
  removeConfirm: "Remove it? Check-in has closed, so you can't add it back.",
  removeYes: "Remove",
  removeKeep: "Keep",
  codeLabel: "4-digit code from the screen at the door",
  sheetTitle: "Check in",
  sheetLead: "Type the 4 numbers on the club's check-in screen.",
  startCheckin: "Start check-in",
  showCheckin: "Show check-in",
  stopCheckin: "Stop check-in",
  done: "Done",
  doorLead: "Scan with your phone's camera, or type the code in Vibe.",
  doorBefore: "You can start check-in from an hour before the event.",
  doorAfter: "Check-in has ended.",
  doorStartLead: "People check in by scanning this screen or typing the 4 numbers under the code. The code changes every 30 seconds.",
  doorNotOfficer: "Only the club's owner and admins can run check-in.",
  markHere: "Mark as here",
  here: "Here",
  clearAll: "Clear check-ins",
  checkedInHeading: "Checked in",
  goingNotInHeading: "Said Going, didn't check in",
  interestedHeading: "Interested",
  settingsTitle: "Event check-ins",
  settingsLead: "The events you checked in at. Each club's owner and admins can see who checked in at its events.",
  settingsEmpty: "You haven't checked in at any events.",
  goToEvent: "Go to the event",
  goToCampus: "Go to Campus",
  pastHeading: "Past events",
  whoCame: "Who came",
  seeWhoCame: "See who came",
  typeCodeInstead: "Type the code instead",
  checking: "Checking…",
  starting: "Starting…",
  stopping: "Stopping…",
  tryAgain: "Try again",
  loading: "Loading…",
  eventGone: "That event isn't available.",
  landingClosed: "Check-in for this event has closed.",
  landingNotOpen: "Check-in isn't open right now. When the club starts it, the code shows on their screen at the door.",
  doorGettingCode: "Getting the code…",
  doorLoadFailed: "Couldn't load check-in.",
  doorReconnecting: "Reconnecting…",
  doorNobodyYet: "Nobody has checked in yet.",
  clearing: "Clearing…",
  keepThem: "Keep them",
} as const;

/** "Check in to Fall Formal?" (the QR's one-tap line). */
export function checkInToLine(title: string): string {
  return `Check in to ${title}?`;
}

/** "Check-in opens at 6:00 PM, an hour before the event." */
export function opensAtLine(timeLabel: string): string {
  return `Check-in opens at ${timeLabel}, an hour before the event.`;
}

/** "New code in 12 s" (the door's countdown; never announced). */
export function newCodeInLine(seconds: number): string {
  return `New code in ${Math.max(0, Math.trunc(seconds))} s`;
}

/** The officers' confirm before clearing every check-in of an event. */
export function clearConfirmLine(title: string): string {
  return `Clear all check-ins for ${title}? This can't be undone.`;
}

// ── Helpers (pure) ──────────────────────────────────────────────────────────

export type CheckinPhase = "before" | "open" | "after";

/**
 * Where `nowMs` sits against the check-in window (the database's rule:
 * outside when now < start - 1 h or now > end + 1 h). Null when a time is
 * unreadable or `nowMs` is 0 (useCampusNow before hydration): draw nothing.
 */
export function checkinPhase(
  startsAt: string,
  endsAt: string,
  nowMs: number,
  closesAfterMs: number = CHECKIN_CLOSES_AFTER_MS,
): CheckinPhase | null {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(nowMs) || nowMs <= 0) return null;
  if (nowMs < start - CHECKIN_OPENS_BEFORE_MS) return "before";
  if (nowMs > end + closesAfterMs) return "after";
  return "open";
}

/** The same for an officer's "Mark as here" (until a day after the end). */
export function markPhase(startsAt: string, endsAt: string, nowMs: number): CheckinPhase | null {
  return checkinPhase(startsAt, endsAt, nowMs, CHECKIN_MARK_CLOSES_AFTER_MS);
}

/** What the code box keeps of what was typed or pasted: digits, at most 4. */
export function sanitizeDoorCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CHECKIN_CODE_DIGITS);
}

export function isDoorCode(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value);
}

export function isCheckinToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{22}$/.test(value);
}

/** The student's check-in page. */
export function checkinPagePath(eventId: string): string {
  return `/campus/checkin/${encodeURIComponent(eventId)}`;
}

/** The officers' door screen. */
export function doorPagePath(eventId: string): string {
  return `/campus/checkin/${encodeURIComponent(eventId)}/door`;
}

/** The event's card on the Events tab (contract C2's anchor). */
export function eventAnchorPath(eventId: string): string {
  return `/campus?tab=events&event=${encodeURIComponent(eventId)}`;
}

/** What the door's QR holds. `origin` has no trailing slash. */
export function checkinLink(origin: string, eventId: string, token: string): string {
  return `${origin}${checkinPagePath(eventId)}?${CHECKIN_LINK_PARAM}=${encodeURIComponent(token)}`;
}

/**
 * The count line on a card or a past-event row: "12 checked in" while it can
 * still happen, "12 were there" once the event has ended. Null for nothing to
 * show: no number, 0, or under 5 for anyone but the event's officers (the
 * server already sends them null; this keeps a stale number from showing).
 */
export function checkinCountLine(
  count: number | null | undefined,
  ended: boolean,
  isManager: boolean,
): string | null {
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  const n = Math.trunc(count);
  if (n <= 0) return null;
  if (!isManager && n < CHECKIN_PUBLIC_FLOOR) return null;
  if (ended) return n === 1 ? "1 was there" : `${n} were there`;
  return `${n} checked in`;
}

/** Spaced digits, so a screen reader says "4 8 1 2", not "four thousand...". */
export function spokenCode(code: string): string {
  return code.split("").join(" ");
}

/** Whole seconds until `endsAtIso`, by the server's clock (`skewMs` = server - device). */
export function secondsLeft(endsAtIso: string, deviceNowMs: number, skewMs: number): number {
  const end = Date.parse(endsAtIso);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - (deviceNowMs + skewMs)) / 1000));
}

/**
 * The step the door should show right now: `current` until it ends, then
 * `next`, then nothing (the feed is stale: read it again).
 */
export function doorStepNow(
  feed: Pick<DoorFeed, "current" | "next">,
  deviceNowMs: number,
  skewMs: number,
): DoorStep | null {
  const now = deviceNowMs + skewMs;
  for (const step of [feed.current, feed.next]) {
    if (step && now < Date.parse(step.ends_at)) return step;
  }
  return null;
}

/**
 * The officers' list once check-in matters: everyone checked in first
 * (Going, then Interested, then walk-ins, each in the route's order), then
 * who said Going and didn't check in, then Interested who didn't.
 */
export function splitAttendees(lists: {
  going: EventAttendee[];
  interested: EventAttendee[];
  walk_ins: EventAttendee[];
}): { checkedIn: EventAttendee[]; goingNotIn: EventAttendee[]; interestedNotIn: EventAttendee[] } {
  return {
    checkedIn: [
      ...lists.going.filter((a) => a.checked_in),
      ...lists.interested.filter((a) => a.checked_in),
      ...lists.walk_ins,
    ],
    goingNotIn: lists.going.filter((a) => !a.checked_in),
    interestedNotIn: lists.interested.filter((a) => !a.checked_in),
  };
}

/**
 * Whether the officers' list shows the check-in split: once the window has
 * opened, or as soon as anyone is checked in. Before that it stays the plain
 * Going / Interested list.
 */
export function showCheckinSplit(phase: CheckinPhase | null, checkedInCount: number): boolean {
  return checkedInCount > 0 || phase === "open" || phase === "after";
}

/** `event_checkin_state` rows by event id. Anything malformed is skipped. */
export function parseCheckinStateRows(data: unknown): Map<string, CheckinStateRow> {
  const out = new Map<string, CheckinStateRow>();
  if (!Array.isArray(data)) return out;
  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.event_id !== "string") continue;
    const n = r.checked_in_count;
    out.set(r.event_id, {
      open: r.is_open === true,
      viewerCheckedIn: r.viewer_checked_in === true,
      count: typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null,
    });
  }
  return out;
}

/** The list fields from a parsed row; "nothing known" when there is none. */
export function checkinListFields(row: CheckinStateRow | undefined): EventCheckinListFields {
  return {
    checkin_open: row?.open ?? false,
    checked_in_count: row?.count ?? null,
    viewer_checked_in: row?.viewerCheckedIn ?? false,
  };
}
