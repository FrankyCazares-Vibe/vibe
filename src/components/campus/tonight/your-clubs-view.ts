/**
 * "Your clubs" on the desktop Feed (C2, Oct 19 2026): the pure half. It
 * merges the two reads Messages home already makes (GET /api/me/inbox for
 * the clubs I'm a member of, GET /api/me/club-boards for the ones I only
 * follow) into one list of Board lines, and words the ages.
 *
 * PURE ON PURPOSE, so node --test loads it with no React: the only runtime
 * import is the campus time zone constant (a file with type imports only).
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §4.
 */
import type { FollowedBoard, InboxClub, OrgRef } from "@/lib/chat/types";
import { CAMPUS_TIME_ZONE } from "@/lib/push/event-notice";

import type { YourClubRow, YourClubsState } from "./types";

/** Rows the left panel draws; the rest are one click away in Messages ("See all"). */
export const YOUR_CLUBS_MAX = 5;

/**
 * Tiles the folded strip draws (1100-1399px). The contract said up to 6, but
 * that column is always 280px there (the grid caps it), and after the
 * "Your clubs ›" link only three 36px tiles fit (the 1280 render shows
 * exactly three); a fourth would spill past the frame. The rest are one
 * click away through that link.
 */
export const YOUR_CLUBS_FOLD_MAX = 3;

/** The time a row sorts by: a real ISO date, or null (no post, or a date that doesn't parse). */
function latestAt(row: YourClubRow): number | null {
  if (!row.latest) return null;
  const at = Date.parse(row.latest.created_at);
  return Number.isFinite(at) ? at : null;
}

/**
 * Only the Board line's words and time are copied: never `author_name`, so a
 * name can't reach the panel even if a route started sending one (a follower
 * must never see who posted; the Board speaks for the club).
 */
function lineOf(latest: { text?: unknown; created_at?: unknown } | null | undefined): YourClubRow["latest"] {
  if (!latest || typeof latest.created_at !== "string") return null;
  return { text: typeof latest.text === "string" ? latest.text : "", created_at: latest.created_at };
}

/** A usable club ref: an id and a name, so a half-built row from a bad answer is skipped, not drawn blank. */
function usableOrg(org: OrgRef | null | undefined): org is OrgRef {
  return !!org && typeof org.id === "string" && org.id !== "" && typeof org.name === "string";
}

/**
 * Member clubs and followed clubs as one list. A club in both (a member also
 * holds the follow that joining made) is listed once, as a member. Newest
 * Board post first, clubs with nothing posted last, then by name, so the
 * order never depends on which read answered first. Either input may be null
 * (that read failed or 404'd with the chat flag off): the other still lists.
 */
export function mergeYourClubs(inbox: InboxClub[] | null, followed: FollowedBoard[] | null): YourClubRow[] {
  const byOrg = new Map<string, YourClubRow>();
  for (const club of inbox ?? []) {
    if (!club || !usableOrg(club.org) || !club.board || typeof club.board.room_id !== "string") continue;
    if (byOrg.has(club.org.id)) continue;
    byOrg.set(club.org.id, { org: club.org, room_id: club.board.room_id, role: "member", latest: lineOf(club.board.latest) });
  }
  for (const board of followed ?? []) {
    if (!board || !usableOrg(board.org) || typeof board.room_id !== "string") continue;
    // Member wins: club-boards already drops member clubs, but the two reads
    // can disagree for a moment (a join between them), and a member's row
    // is the one that matches what Messages shows them.
    if (byOrg.has(board.org.id)) continue;
    byOrg.set(board.org.id, { org: board.org, room_id: board.room_id, role: "follower", latest: lineOf(board.latest) });
  }
  return [...byOrg.values()].sort((a, b) => {
    const at = latestAt(a);
    const bt = latestAt(b);
    if (at !== null && bt !== null && at !== bt) return bt - at;
    if (at === null && bt !== null) return 1;
    if (at !== null && bt === null) return -1;
    const byName = a.org.name.localeCompare(b.org.name);
    return byName !== 0 ? byName : a.room_id.localeCompare(b.room_id);
  });
}

/**
 * What the panels show, from the two reads (null = that read has never
 * answered). Both missing: "error", and the panels hide. One missing and the
 * other lists no clubs: also "error", NOT the empty state. club-boards leaves
 * member clubs out, so for most members it is rightly empty, and a failed
 * inbox beside it says nothing about whether the student is in a club:
 * "Join or follow a club" would be wrong for them. One missing and the other
 * has clubs: those rows. Both answered: "ready", where [] is the true empty
 * state.
 */
export function yourClubsState(inbox: InboxClub[] | null, followed: FollowedBoard[] | null): YourClubsState {
  if (inbox === null && followed === null) return { status: "error", rows: [] };
  const rows = mergeYourClubs(inbox, followed);
  if ((inbox === null || followed === null) && rows.length === 0) return { status: "error", rows: [] };
  return { status: "ready", rows };
}

/** "Oct 5", in campus time so every viewer reads the same date for the same post. */
function shortDate(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, month: "short", day: "numeric" }).format(ms);
}

type AgeStep = { n: number; unit: "s" | "m" | "h" | "d" | "w" } | { date: string } | null;

/**
 * How far "the future" may be and still count as just posted: the panel's
 * clock is re-read once a minute, so a post made since the last tick sits up
 * to a minute ahead of it, and the device clock can trail the server's a
 * little. Further ahead than this is a wrong date, and shows nothing.
 */
const FUTURE_SLACK_MS = 120_000;

/** The one ladder both the printed and the spoken age climb, so the two never disagree. */
function ageStep(iso: string, now: number): AgeStep {
  const at = Date.parse(iso);
  const raw = now - at;
  // A bad date, or a time well in the future (or a clock not known yet),
  // shows nothing rather than a wrong number. A post just past the last tick
  // reads as just posted, so the newest row never loses its age.
  if (!Number.isFinite(at) || !Number.isFinite(raw) || raw < -FUTURE_SLACK_MS) return null;
  const ms = Math.max(0, raw);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return { n: sec, unit: "s" };
  const min = Math.floor(sec / 60);
  if (min < 60) return { n: min, unit: "m" };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { n: hr, unit: "h" };
  const day = Math.floor(hr / 24);
  if (day < 7) return { n: day, unit: "d" };
  const wk = Math.floor(day / 7);
  if (wk < 5) return { n: wk, unit: "w" };
  return { date: shortDate(at) };
}

/**
 * "45s" "20m" "3h" "2d" "1w", then "Oct 5": the twin of campus-home's
 * relativeTime (6995, not exported), so a Board line's age reads like the
 * post cards beside it. `now` is passed in so the panel can tick it and the
 * tests can pin it. Up to two minutes ahead reads "0s"; "" for a time
 * further in the future or an unreadable one.
 */
export function relativeAge(iso: string, now: number): string {
  const step = ageStep(iso, now);
  if (!step) return "";
  if ("date" in step) return step.date;
  return `${step.n}${step.unit}`;
}

const SPOKEN_UNIT = { s: "second", m: "minute", h: "hour", d: "day", w: "week" } as const;

/** The age read aloud: "just now", "3 hours ago", "1 week ago", "on Oct 5"; "" when relativeAge is "". */
export function spokenAge(iso: string, now: number): string {
  const step = ageStep(iso, now);
  if (!step) return "";
  if ("date" in step) return `on ${step.date}`;
  // "0 seconds ago" reads like a glitch; the printed "0s" is the post cards' own.
  if (step.n === 0) return "just now";
  return `${step.n} ${SPOKEN_UNIT[step.unit]}${step.n === 1 ? "" : "s"} ago`;
}

/**
 * A row read aloud (the board's label): "Salsa Club, on the Board 3 hours
 * ago: Officer applications are open until Friday." No author, ever. With
 * nothing posted: "Salsa Club, nothing on the Board yet". `boardEmpty` is
 * the shared copy ("Nothing on the Board yet"), passed in so this file
 * needs no copy import.
 */
export function yourClubLabel(row: YourClubRow, now: number, boardEmpty: string): string {
  const name = row.org.name;
  if (!row.latest) return `${name}, ${boardEmpty.charAt(0).toLowerCase()}${boardEmpty.slice(1)}`;
  const when = spokenAge(row.latest.created_at, now);
  const head = when ? `${name}, on the Board ${when}` : `${name}, on the Board`;
  const text = row.latest.text.trim();
  return text ? `${head}: ${text}` : head;
}
