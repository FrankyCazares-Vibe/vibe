/**
 * The waitlist pages' pure helpers (BUILD.md batch C): the sign-up page's
 * words for a refused code, the landing buttons, and the admin tab's
 * filtering, counting and batch picking. No `server-only`, no `node:`
 * imports, and only type imports (erased), so `node --test` loads it as is.
 *
 * The two paths are written out here rather than imported from types.ts,
 * because a value import would need a resolve hook in the test; view.test.ts
 * checks they still equal WAITLIST_PATH and SIGNUP_PATH.
 */

import type { AdminWaitlistRow, GateRefusal, WaitlistStatus } from "./types";

const WAITLIST_HREF = "/waitlist";
const SIGNUP_HREF = "/auth/signup";

/** How many people one "Send codes" press may hold (POST /api/admin/waitlist/invite takes 1-25). */
export const WAITLIST_BATCH_CAP = 25;

/** Entries deleted within this many days are flagged, so a wave can go out first. */
export const WAITLIST_LEAVING_SOON_DAYS = 5;

/**
 * No code goes to an entry with less than this many hours left before its
 * deletion: `waitlist_issue_code` refuses it ("entry_expiring",
 * 20261003160000; retention.test.ts compares the two).
 */
export const WAITLIST_CODE_MIN_LEFT_HOURS = 24;

const DAY_MS = 24 * 60 * 60 * 1000;

const REFUSAL_COPY: Record<GateRefusal, string> = {
  access_code_required: "Vibe is opening in waves. Enter the access code from your invite email.",
  // The gate can't tell a typo from a code whose entry was deleted (within
  // 40 days; both are unknown to it), so this covers both.
  access_code_invalid:
    "We don't recognise that access code, or it has expired. Check it against your invite email, or reply to that email for a new one.",
  access_code_expired: "That access code has expired. Reply to your invite email and we'll send a new one.",
  access_code_used:
    "That access code has already been used to make an account. Not you? Reply to your invite email.",
  access_code_in_use:
    "That code is being used with a different email right now. Use the same email, or try again in 15 minutes.",
  club_link_invalid: "That link doesn't work. Ask whoever shared it for a new one.",
  club_link_used: "That setup link has already been used. Ask Vibe for a new one.",
  club_link_expired: "That link has ended. Ask whoever shared it for a new one.",
  club_link_off: "That link has been turned off. Ask the club for a new one.",
  club_link_full: "That link is full. Ask the club for another way in.",
  club_link_in_use:
    "That setup link is being used with a different email right now. Use the same email, or try again in 15 minutes.",
  club_link_school_email: "Use your school email (the one ending in iu.edu or purdue.edu) for this link.",
};

/** What the sign-up page says when the gate refused the code. Never the hook's own message. */
export function gateRefusalCopy(reason: GateRefusal): string {
  return REFUSAL_COPY[reason] ?? REFUSAL_COPY.access_code_required;
}

/** Where a landing button sits: the door 05 button says more when sign-up is open. */
export type LandingSpot = "button" | "door";

/**
 * The landing's sign-up buttons. Closed (the pilot): "Join the waitlist",
 * tagged `src=landing` so the founders can see which channel worked. Open
 * (launch): today's labels and `/auth/signup`.
 */
export function landingCta(open: boolean, spot: LandingSpot = "button"): { label: string; href: string } {
  if (!open) return { label: "Join the waitlist", href: `${WAITLIST_HREF}?src=landing` };
  return { label: spot === "door" ? "Create your account" : "Sign up", href: SIGNUP_HREF };
}

/** Door 06's officer line, for the closed state. */
export const CLUB_WAITLIST_HREF = `${WAITLIST_HREF}?officer=1&src=club`;

// ---------------------------------------------------------------------------
// The admin tab
// ---------------------------------------------------------------------------

export type WaitlistFilters = {
  status: WaitlistStatus | "all";
  /** "none": a founder-added address outside IU and Purdue. */
  school: "all" | "iu" | "purdue" | "none";
  /** "all", "none" (prefer not to say) or "1".."5". */
  year: string;
  /** Contains, any case. */
  major: string;
  /** Contains, any case, in the clubs they're in or the club they run. */
  club: string;
  officersOnly: boolean;
  /** "all", "none" (no ?src=) or one source tag. */
  source: string;
  /** Contains, any case: name, masked email, major, clubs, their line, source, batch. */
  text: string;
  /** Only people not yet joined whose entry is deleted within {@link WAITLIST_LEAVING_SOON_DAYS}, soonest first. */
  leavingSoon: boolean;
};

export const EMPTY_WAITLIST_FILTERS: WaitlistFilters = Object.freeze({
  status: "all",
  school: "all",
  year: "all",
  major: "",
  club: "",
  officersOnly: false,
  source: "all",
  text: "",
  leavingSoon: false,
});

function has(haystack: Array<string | null | undefined>, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return haystack.some((h) => typeof h === "string" && h.toLowerCase().includes(n));
}

/** Days are counted on Indiana's calendar, like the admin tab's dates. */
const INDIANA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Indiana/Indianapolis",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function indianaDayNumber(ms: number): number {
  return Math.round(Date.parse(`${INDIANA_DAY.format(ms)}T00:00:00Z`) / DAY_MS);
}

/**
 * Calendar days (Indiana) from today to the day the entry is deleted: 0 =
 * today (or overdue), 1 = tomorrow. It matches the "deleted on" date the row
 * shows. Null when unknown.
 */
export function daysUntilDeleted(row: Pick<AdminWaitlistRow, "deletesAt">, now: Date): number | null {
  const at = row.deletesAt ? Date.parse(row.deletesAt) : NaN;
  if (!Number.isFinite(at)) return null;
  return Math.max(0, indianaDayNumber(at) - indianaDayNumber(now.getTime()));
}

/**
 * Too late for a code: the entry is past its line or less than
 * {@link WAITLIST_CODE_MIN_LEFT_HOURS} hours from it, so the database would
 * refuse one. Such a row shows "Leaves within a day" and has no Send code
 * button.
 */
export function tooLateForCode(row: Pick<AdminWaitlistRow, "deletesAt">, now: Date): boolean {
  const at = row.deletesAt ? Date.parse(row.deletesAt) : NaN;
  return Number.isFinite(at) && at - now.getTime() < WAITLIST_CODE_MIN_LEFT_HOURS * 60 * 60 * 1000;
}

/**
 * The flag on a row deleted within {@link WAITLIST_LEAVING_SOON_DAYS} days:
 * "Leaves within a day" whenever it is too late for a code (under 24 hours
 * left, whichever date that lands on), else by Indiana's calendar ("Leaves
 * today" only on the 25-hour day the clocks go back). Null for a joined row
 * or one with more time.
 */
export function leavingLabel(row: Pick<AdminWaitlistRow, "deletesAt" | "status">, now: Date): string | null {
  if (!isLeavingSoon(row, now)) return null;
  if (tooLateForCode(row, now)) return "Leaves within a day";
  const days = daysUntilDeleted(row, now) ?? 0;
  return days === 0 ? "Leaves today" : days === 1 ? "Leaves tomorrow" : `Leaves in ${days} days`;
}

/** Not joined yet, and deleted within {@link WAITLIST_LEAVING_SOON_DAYS} days. */
export function isLeavingSoon(row: Pick<AdminWaitlistRow, "deletesAt" | "status">, now: Date): boolean {
  const at = row.deletesAt ? Date.parse(row.deletesAt) : NaN;
  return row.status !== "joined" && Number.isFinite(at) && at - now.getTime() <= WAITLIST_LEAVING_SOON_DAYS * DAY_MS;
}

/**
 * The rows that pass every filter, in the order given (the route sends
 * newest first); with `leavingSoon`, the soonest to be deleted first.
 */
export function filterWaitlistRows(
  rows: readonly AdminWaitlistRow[],
  f: WaitlistFilters,
  now: Date = new Date(),
): AdminWaitlistRow[] {
  const shown = rows.filter((r) => {
    if (f.leavingSoon && !isLeavingSoon(r, now)) return false;
    if (f.status !== "all" && r.status !== f.status) return false;
    if (f.school !== "all" && (r.schoolSystem ?? "none") !== f.school) return false;
    if (f.year !== "all" && (r.classYear === null ? "none" : String(r.classYear)) !== f.year) return false;
    if (f.officersOnly && !r.isOfficer) return false;
    if (f.source !== "all" && (r.source ?? "none") !== f.source) return false;
    if (!has([r.major], f.major)) return false;
    if (!has([r.clubs, r.officerClub], f.club)) return false;
    return has([r.name, r.maskedEmail, r.major, r.clubs, r.officerClub, r.wish, r.source, r.batch], f.text);
  });
  if (f.leavingSoon) shown.sort((a, b) => Date.parse(a.deletesAt ?? "") - Date.parse(b.deletesAt ?? ""));
  return shown;
}

export type WaitlistCounts = {
  total: number;
  status: Record<WaitlistStatus, number>;
  school: { iu: number; purdue: number; none: number };
  officers: number;
  /** Not joined, and deleted within {@link WAITLIST_LEAVING_SOON_DAYS} days. */
  leavingSoon: number;
  /** Source tags, most first; "none" for rows with no tag. Ties by name. */
  sources: Array<{ source: string; count: number }>;
};

export function countWaitlistRows(rows: readonly AdminWaitlistRow[], now: Date = new Date()): WaitlistCounts {
  const counts: WaitlistCounts = {
    total: rows.length,
    status: { unconfirmed: 0, waiting: 0, invited: 0, expired: 0, joined: 0 },
    school: { iu: 0, purdue: 0, none: 0 },
    officers: 0,
    leavingSoon: 0,
    sources: [],
  };
  const sources = new Map<string, number>();
  for (const r of rows) {
    if (r.status in counts.status) counts.status[r.status] += 1;
    counts.school[r.schoolSystem ?? "none"] += 1;
    if (r.isOfficer) counts.officers += 1;
    if (isLeavingSoon(r, now)) counts.leavingSoon += 1;
    const s = r.source ?? "none";
    sources.set(s, (sources.get(s) ?? 0) + 1);
  }
  counts.sources = [...sources.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  return counts;
}

/**
 * Batch mode sends only to people who confirmed and have no code yet, and
 * whose entry has a day or more left ({@link tooLateForCode}).
 */
export function canBatchInvite(row: Pick<AdminWaitlistRow, "status" | "deletesAt">, now: Date = new Date()): boolean {
  return row.status === "waiting" && !tooLateForCode(row, now);
}

/**
 * "Select shown": adds the shown rows that can take a batch code, in order,
 * until the selection holds {@link WAITLIST_BATCH_CAP}. Rows past their line
 * or in their last day are never picked (with "Leaving within 5 days" on,
 * they come first). Ids already selected stay selected, so the selection
 * never grows past the cap.
 */
export function selectShown(
  shown: readonly Pick<AdminWaitlistRow, "id" | "status" | "deletesAt">[],
  selected: ReadonlySet<string>,
  cap: number = WAITLIST_BATCH_CAP,
  now: Date = new Date(),
): Set<string> {
  const next = new Set(selected);
  for (const r of shown) {
    if (next.size >= cap) break;
    if (canBatchInvite(r, now)) next.add(r.id);
  }
  return next;
}
