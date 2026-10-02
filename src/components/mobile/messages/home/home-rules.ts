/**
 * The Messages home's pure rules (handoffs/chat-redesign/wave-2-contracts.md
 * 1.2 "Messages home", 11.1, 11.2; W2-S1): the merged All ordering, the All
 * badge, the club and person previews, the chip line, every row and day
 * `aria-label`, the week card's first line. No React, no DOM: `when.ts`,
 * `week.ts` and types only, so `node --test` loads it (home-rules.test.ts).
 *
 * `HomeFilter` is the home's own name (11.0, SPLIT-M2), never a widening of
 * `messages/types.ts`'s `Tab`.
 *
 * S71 amendment 4 (the end of the file): the month sheet's words — a grid
 * day's label, the picked day's heading and caption, its plan rows.
 */

import type { InboxClub, RoomState } from "@/lib/chat/types";
import { dayDiff, isSameLocalDay } from "@/lib/chat/week";
import { eventTimeShort, rowTime, rowTimeSpoken } from "@/lib/chat/when";

import type { ThreadEntry } from "../types";

export type HomeFilter = "all" | "chats" | "clubs" | "requests";

export const HOME_FILTERS: readonly HomeFilter[] = ["all", "chats", "clubs", "requests"];

/** `?tab=chats` / `clubs` / `requests` (2.3); anything else is `all`. */
export function parseHomeFilter(raw: string | null | undefined): HomeFilter {
  return raw === "chats" || raw === "clubs" || raw === "requests" ? raw : "all";
}

/** `/messages`, or `/messages?tab=<filter>` when a filter other than All is active (2.3). */
export function homeUrl(filter: HomeFilter): string {
  return filter === "all" ? "/messages" : `/messages?tab=${filter}`;
}

export type HomeRow = { kind: "club"; club: InboxClub } | { kind: "thread"; thread: ThreadEntry };

const time = (iso: string | null | undefined): number => {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
};

/**
 * 11.1 "The list", All: clubs and dm/group threads merged, pinned first
 * (newest pin first), then by recency (`last_activity_at` vs
 * `last_message.created_at`; a null sorts last). Ties keep the server's order
 * (a stable sort over clubs then threads).
 */
export function mergeHomeRows(clubs: readonly InboxClub[], threads: readonly ThreadEntry[]): HomeRow[] {
  const rows: HomeRow[] = [
    ...clubs.map((club): HomeRow => ({ kind: "club", club })),
    ...threads.map((thread): HomeRow => ({ kind: "thread", thread })),
  ];
  const pinnedAt = (r: HomeRow) => time(r.kind === "club" ? r.club.pinned_at : r.thread.pinned_at);
  const recency = (r: HomeRow) =>
    time(r.kind === "club" ? r.club.last_activity_at : r.thread.last_message?.created_at);
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const ap = pinnedAt(a.row);
      const bp = pinnedAt(b.row);
      const aPinned = ap !== Number.NEGATIVE_INFINITY;
      const bPinned = bp !== Number.NEGATIVE_INFINITY;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned && bPinned && ap !== bp) return bp - ap;
      const ar = recency(a.row);
      const br = recency(b.row);
      if (ar !== br) return br - ar;
      return a.i - b.i;
    })
    .map((x) => x.row);
}

/** `muted_until` in the future (today's rule for a thread, `MessagesMobile.tsx` `unreadCount`). */
export function isMuted(mutedUntil: string | null | undefined, now: Date): boolean {
  return !!mutedUntil && new Date(mutedUntil).getTime() > now.getTime();
}

/** A club with an unread Board post or new Lounge messages (its row shows the dot / `N new`). */
export function clubHasUnread(club: InboxClub): boolean {
  return club.board.unread || club.lounge.unread_count > 0;
}

/**
 * 11.1 "The All pill's badge": unread dm/group threads (a muted thread is left
 * out) + clubs with `board.unread || lounge.unread_count > 0` whose
 * `muted_until` is null or past (SCREENS-L8).
 */
export function allBadgeCount(threads: readonly ThreadEntry[], clubs: readonly InboxClub[], now: Date): number {
  const t = threads.filter((x) => x.unread && !isMuted(x.muted_until, now)).length;
  const c = clubs.filter((x) => clubHasUnread(x) && !isMuted(x.muted_until, now)).length;
  return t + c;
}

/** The pill's text: `99+` past 99 (the same cap as today's `TabPill`). */
export function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/**
 * 1.2 club row, the preview line (SCREENS-L8): the Board's `Board: <text>`
 * with the coral dot when `board.unread`; else the newer of `board.latest` /
 * `lounge.latest` (a Board line is prefixed `Board:`, a Lounge line
 * `<Author>:`); nothing when both are null. An empty `author_name` (ROUTES-L8)
 * → the text alone, no `: `.
 */
export type ClubPreview = { prefix: string | null; text: string; dot: boolean };

export function clubPreview(club: InboxClub): ClubPreview | null {
  const board = club.board.latest;
  const lounge = club.lounge.latest;
  const dot = club.board.unread;
  if (dot && board) return { prefix: "Board:", text: board.text, dot };
  if (!board && !lounge) return null;
  const useBoard = !!board && (!lounge || time(board.created_at) >= time(lounge.created_at));
  if (useBoard && board) return { prefix: "Board:", text: board.text, dot };
  if (!lounge) return null;
  const author = lounge.author_name.trim();
  return { prefix: author ? `${author}:` : null, text: lounge.text, dot };
}

/** `Live now · <title>` (live chrome) or `<eventTimeShort> · <title>`, plus the RSVP mark (1.2, 11.1). */
export type ClubChip = { live: boolean; text: string; rsvp: "going" | "maybe" | null };

export function clubChip(club: InboxClub, now: Date): ClubChip | null {
  const ev = club.next_event;
  if (!ev) return null;
  const live = ev.state === "live";
  return {
    live,
    text: live ? `Live now · ${ev.title}` : `${eventTimeShort(ev.starts_at, now)} · ${ev.title}`,
    rsvp: ev.viewer_status,
  };
}

/** `N new` from `lounge.unread_count` (`99+` past 99). */
export function newCountText(count: number): string | null {
  return count > 0 ? `${badgeText(count)} new` : null;
}

const WEEKDAY_LONG: Record<string, string> = {
  Sun: "Sunday",
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};
const MONTH_LONG: Record<string, string> = {
  Jan: "January",
  Feb: "February",
  Mar: "March",
  Apr: "April",
  May: "May",
  Jun: "June",
  Jul: "July",
  Aug: "August",
  Sep: "September",
  Oct: "October",
  Nov: "November",
  Dec: "December",
};

/** `eventTimeShort` spoken: `Fri 7 PM` → `Friday 7 PM`, `Oct 8 7:30 PM` → `October 8 7:30 PM`, `7:30 PM` unchanged. */
export function spokenShort(short: string): string {
  const [head, ...rest] = short.split(" ");
  const long = WEEKDAY_LONG[head] ?? MONTH_LONG[head];
  return long ? [long, ...rest].join(" ") : short;
}

const rsvpClause = (status: "going" | "maybe" | null): string | null =>
  status === "going" ? "you're going" : status === "maybe" ? "you said maybe" : null;

/** The state clause of an event in a label: `live now` / `ended` / the spoken time. */
export function eventStateSpoken(state: RoomState | null | undefined, startsAt: string, now: Date): string {
  if (state === "live") return "live now";
  if (state === "after") return "ended";
  return spokenShort(eventTimeShort(startsAt, now));
}

/**
 * 1.2 club row `aria-label`: `<club>[, unread Board post][, N new in the
 * Lounge][, <title> is live now | <title> <spoken time>][, you're going | ,
 * you said maybe][, pinned][, <rowTimeSpoken>]` — each clause only when true.
 */
export function clubRowLabel(club: InboxClub, now: Date): string {
  const parts: string[] = [club.org.name];
  if (club.board.unread) parts.push("unread Board post");
  if (club.lounge.unread_count > 0) parts.push(`${badgeText(club.lounge.unread_count)} new in the Lounge`);
  const ev = club.next_event;
  if (ev) {
    parts.push(ev.state === "live" ? `${ev.title} is live now` : `${ev.title} ${eventStateSpoken(ev.state, ev.starts_at, now)}`);
    const r = rsvpClause(ev.viewer_status);
    if (r) parts.push(r);
  }
  if (club.pinned_at) parts.push("pinned");
  if (club.last_activity_at) parts.push(rowTimeSpoken(club.last_activity_at, now));
  return parts.join(", ");
}

/** The club row's time: `rowTime(last_activity_at)` (1.4). */
export function clubRowTime(club: InboxClub, now: Date): string {
  return club.last_activity_at ? rowTime(club.last_activity_at, now) : "";
}

const threadTitleOf = (t: ThreadEntry): string =>
  t.type === "dm" ? t.peer?.name || (t.peer?.handle ? `@${t.peer.handle}` : "Direct message") : t.name || "Group";

/**
 * 1.2 person / group row preview: `You: …` for my own last message, `<Name>:
 * …` for another member of a group, the text alone for the dm peer. Empty
 * content says what was sent, as today's row does.
 *
 * `You:` only when it is provable: the list sends no viewer id, and
 * `members` holds the CURRENT members but me (`threads/route.ts:68`), so in
 * a group an author outside `members` is me or someone who left — the text
 * alone then (today's row shows no prefix either). In a dm the author who is
 * not `peer` is me; with `peer: null` (a removed account) the text alone.
 */
export function personPreview(t: ThreadEntry): string {
  const lm = t.last_message;
  if (!lm) return "No messages yet";
  const body =
    lm.content?.trim() ||
    (lm.media_kind === "video"
      ? "Video"
      : lm.media_kind === "image"
        ? "Photo"
        : lm.attachment_kind === "clip"
          ? "Shared a clip"
          : lm.attachment_kind === "post"
            ? "Shared a post"
            : "Attachment");
  if (t.type === "dm") return !t.peer || lm.user_id === t.peer.id ? body : `You: ${body}`;
  const member = (t.members ?? []).find((m) => m.id === lm.user_id);
  if (member) return `${member.name || (member.handle ? `@${member.handle}` : "Someone")}: ${body}`;
  return body;
}

/** 1.2 person / group row `aria-label`: `<name>, <spoken time>[, unread][, pinned]`. */
export function personRowLabel(t: ThreadEntry, now: Date): string {
  const parts: string[] = [threadTitleOf(t)];
  if (t.last_message) parts.push(rowTimeSpoken(t.last_message.created_at, now));
  if (t.unread) parts.push("unread");
  if (t.pinned_at) parts.push("pinned");
  return parts.join(", ");
}

/** One `rsvp` entry of `GET /api/me/calendar` with 7.3's room fields (the home's own copy of the shape). */
export type WeekEntry = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  viewer_status: "going" | "maybe";
  org: { handle: string; name: string } | null;
  org_id: string | null;
  room_id: string | null;
  room_state: RoomState | null;
};

/** The entries on one local day, by `starts_at`. */
export function entriesOn(day: Date, entries: readonly WeekEntry[]): WeekEntry[] {
  return entries
    .filter((e) => isSameLocalDay(e.starts_at, day))
    .sort((a, b) => time(a.starts_at) - time(b.starts_at));
}

/** The strip's dot: coral for at least one `going`, grey for `maybe` only, none otherwise (11.2). */
export function dayDot(entries: readonly WeekEntry[]): "going" | "maybe" | null {
  if (entries.some((e) => e.viewer_status === "going")) return "going";
  if (entries.some((e) => e.viewer_status === "maybe")) return "maybe";
  return null;
}

/**
 * 1.2 day `aria-label` (SCREENS-L2): `<Weekday>, <Month D>, nothing planned`
 * · `…, today, nothing planned` · `<Weekday>, <Month D>: <title>, going` /
 * `, maybe` / `, going, live now` · today with events `…, today: <title>,
 * going[, live now]`; two events joined with `; `.
 */
export function dayLabel(day: Date, entries: readonly WeekEntry[], today: boolean): string {
  const date = `${WEEKDAY_LONG[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day.getDay()]]}, ${
    Object.values(MONTH_LONG)[day.getMonth()]
  } ${day.getDate()}`;
  if (entries.length === 0) return today ? `${date}, today, nothing planned` : `${date}, nothing planned`;
  const clauses = entries
    .map((e) => `${e.title}, ${e.viewer_status}${e.room_state === "live" ? ", live now" : ""}`)
    .join("; ");
  return today ? `${date}, today: ${clauses}` : `${date}: ${clauses}`;
}

/**
 * 1.2 week card, line 1: `Live now` (glowing dot), `Ended` on `after`, else `eventTimeShort` (N5).
 * `otherWeek` (S71 amendment 4): on a week that is not the current one the
 * day strip above names the days, so the card says the weekday (`Sun 7 PM`),
 * never `Oct 11 7 PM` beside `Tue 7 PM`.
 */
export function weekCardLine(e: WeekEntry, now: Date, otherWeek = false): { kind: "live" | "ended" | "time"; text: string } {
  if (e.room_state === "live") return { kind: "live", text: "Live now" };
  if (e.room_state === "after") return { kind: "ended", text: "Ended" };
  if (otherWeek) {
    const start = new Date(e.starts_at);
    if (!Number.isNaN(start.getTime())) {
      // `eventTimeShort` of a day against itself is the clock alone (`7 PM`).
      return { kind: "time", text: `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][start.getDay()]} ${eventTimeShort(start, start)}` };
    }
  }
  return { kind: "time", text: eventTimeShort(e.starts_at, now) };
}

/** 1.2 week card `aria-label`: `<title> room, <club>, live now, you're going` / `…, Friday 7 PM, you said maybe`; no club clause when `org` is null. */
export function weekCardLabel(e: WeekEntry, now: Date): string {
  const parts = [`${e.title} room`];
  if (e.org) parts.push(e.org.name);
  parts.push(eventStateSpoken(e.room_state, e.starts_at, now));
  const r = rsvpClause(e.viewer_status);
  if (r) parts.push(r);
  return parts.join(", ");
}

/* ------------------------------------------------------------------------ *
 * S71 amendment 4: the month sheet (R3_Month).
 * ------------------------------------------------------------------------ */

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = Object.keys(MONTH_LONG);

/** `Friday October 9` (a day inside a spoken sentence). */
export function spokenDay(day: Date): string {
  return `${WEEKDAY_LONG[WEEKDAY_SHORT[day.getDay()]]} ${MONTH_LONG[MONTH_SHORT[day.getMonth()]]} ${day.getDate()}`;
}

/** The picked day's heading: `Fri, Oct 9`. */
export function dayHeading(day: Date): string {
  return `${WEEKDAY_SHORT[day.getDay()]}, ${MONTH_SHORT[day.getMonth()]} ${day.getDate()}`;
}

/** `No plans` / `1 plan` / `2 plans`. */
export function planCountText(count: number): string {
  if (count <= 0) return "No plans";
  return count === 1 ? "1 plan" : `${count} plans`;
}

/**
 * The caption right of the heading: `Today · 1 plan`, `Tomorrow · No plans`;
 * any other day the count alone (`2 plans`). By calendar day, not by hours.
 */
export function dayCaption(day: Date, now: Date, count: number): string {
  const when = dayWhen(day, now);
  return when ? `${when} · ${planCountText(count)}` : planCountText(count);
}

/** `Today`, `Tomorrow`, or null for any other day (the caption's first half; all of it while the plans load). */
export function dayWhen(day: Date, now: Date): "Today" | "Tomorrow" | null {
  const away = dayDiff(now, day);
  return away === 0 ? "Today" : away === 1 ? "Tomorrow" : null;
}

/** True for a day before today (the grid dims it). */
export function isPastDay(day: Date, now: Date): boolean {
  return dayDiff(now, day) < 0;
}

/**
 * A grid day's `aria-label` (R3_Month:110-140): `<Weekday>, <Month D>[,
 * today][, selected], ` then `nothing planned` · `1 event you're going to` ·
 * `2 events you said maybe to` · `1 event you're going to, 1 you said maybe
 * to`, and `, live now` when one of them is.
 */
export function monthDayLabel(day: Date, entries: readonly WeekEntry[], flags: { today: boolean; selected: boolean }): string {
  const parts = [`${WEEKDAY_LONG[WEEKDAY_SHORT[day.getDay()]]}, ${MONTH_LONG[MONTH_SHORT[day.getMonth()]]} ${day.getDate()}`];
  if (flags.today) parts.push("today");
  if (flags.selected) parts.push("selected");
  const going = entries.filter((e) => e.viewer_status === "going").length;
  const maybe = entries.length - going;
  const events = (n: number) => `${n} ${n === 1 ? "event" : "events"}`;
  if (entries.length === 0) parts.push("nothing planned");
  else if (maybe === 0) parts.push(`${events(going)} you're going to`);
  else if (going === 0) parts.push(`${events(maybe)} you said maybe to`);
  else parts.push(`${events(going)} you're going to`, `${maybe} you said maybe to`);
  if (entries.some((e) => e.room_state === "live")) parts.push("live now");
  return parts.join(", ");
}

/** One plan of the picked day (R3_Month:151-158). */
export type PlanRow = {
  entry: WeekEntry;
  /** The club's name; null when the entry has no club. */
  club: string | null;
  /** The start's clock time on its own day: `7 PM`, `7:30 PM`. */
  time: string;
  /** `Film Society · 7 PM`; the time alone without a club. */
  line: string;
  /** `Fright Night, Film Society, Friday October 9 at 7 PM, you're going`, plus `. Open the event room` when it has one. */
  label: string;
};

/** The day's plans, sorted by start; a row opens its event chat only when `entry.room_id` is set. */
export function planRows(day: Date, entries: readonly WeekEntry[]): PlanRow[] {
  return entriesOn(day, entries).map((entry) => {
    // `eventTimeShort` against the event's own day answers the clock alone.
    const time = eventTimeShort(entry.starts_at, new Date(entry.starts_at));
    const club = entry.org?.name?.trim() || null;
    const said = entry.viewer_status === "going" ? "you're going" : "you said maybe";
    const spoken = [entry.title, ...(club ? [club] : []), `${spokenDay(new Date(entry.starts_at))} at ${time}`, said].join(", ");
    return {
      entry,
      club,
      time,
      line: club ? `${club} · ${time}` : time,
      label: entry.room_id ? `${spoken}. Open the event room` : spoken,
    };
  });
}

/**
 * What takes focus when the month sheet closes (S71 amendment 4):
 * - nothing when it closed because an event chat is opening (the chat takes
 *   focus; the home under it must not);
 * - the control that opened it (a day of the strip, the week's title) while
 *   that control is still on the page;
 * - else `fallback`, the week's title: the day that opened it left with its
 *   week when the strip moved to the picked day's week.
 * The sheet always answers Radix's close-focus event itself: with no
 * `Drawer.Trigger`, Radix would otherwise focus nothing and stop the focus
 * scope's own restore, leaving focus on `<body>`.
 */
export function sheetReturnFocus<T extends { isConnected: boolean }>(opener: T | null, fallback: T | null, openingRoom: boolean): T | null {
  if (openingRoom) return null;
  if (opener?.isConnected) return opener;
  return fallback?.isConnected ? fallback : null;
}

/** `GET /api/me/calendar` for a range: `from` / `to` are the two instants the home shows between (a week, a month's grid). */
export function calendarUrl(from: Date, to: Date): string {
  return `/api/me/calendar?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

/**
 * The `rsvp` entries of a calendar answer as the home's `WeekEntry`s (the
 * personal entries and anything malformed are left out; a missing room field
 * is null, `viewer_status` anything but `maybe` is `going`). Null when the
 * body has no `entries` array: the read failed.
 */
export function rsvpEntries(body: unknown): WeekEntry[] | null {
  const list = body && typeof body === "object" ? (body as { entries?: unknown }).entries : null;
  if (!Array.isArray(list)) return null;
  const out: WeekEntry[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const e = x as Record<string, unknown>;
    if (e.kind !== "rsvp" || typeof e.id !== "string" || typeof e.title !== "string" || typeof e.starts_at !== "string") continue;
    const org = e.org && typeof e.org === "object" ? (e.org as { handle: string; name: string }) : null;
    out.push({
      id: e.id,
      title: e.title,
      starts_at: e.starts_at,
      ends_at: e.ends_at as string,
      viewer_status: e.viewer_status === "maybe" ? "maybe" : "going",
      org: org ? { handle: org.handle, name: org.name } : null,
      org_id: typeof e.org_id === "string" ? e.org_id : null,
      room_id: typeof e.room_id === "string" ? e.room_id : null,
      room_state: (e.room_state as RoomState | null | undefined) ?? null,
    });
  }
  return out;
}
