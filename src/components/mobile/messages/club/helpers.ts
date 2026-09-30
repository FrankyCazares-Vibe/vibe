/**
 * The pure parts of the club screens (handoffs/chat-redesign/wave-2-contracts.md
 * 1.2 "Inside a club", 11.3-11.6; W2-S2): the copy strings and `aria-label`s
 * assembled from the payloads, the role word, the event chip's state word,
 * the date separators rule and the state pill's text.
 *
 * PURE: no React, no DOM. The imports are `when.ts` (1.4) and types, so
 * `node --test` loads it (helpers.test.ts, through the repo's resolve hook
 * for the "@/" alias). Every string here is 1.2's, word for word; nothing
 * is invented, and every function that reads a clock takes `now`.
 */

import type { ClubRole, EventRef, RoomKind, RoomState, SpaceRoom } from "@/lib/chat/types";
import { eventTime, eventTimeShort, isSoon, moreDays, rowTime } from "@/lib/chat/when";

/** `org_members.role` → the product's word (1.1 "Your hat"); "" for null. */
export function roleWord(role: ClubRole | null | undefined): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Officer";
    case "mod":
      return "Mod";
    case "member":
      return "Member";
    default:
      return "";
  }
}

/** An officer in 1.1's sense: owner or admin (a mod is not one). */
export function isOfficer(role: ClubRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** `1 member` / `48 members`. */
export function countWord(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** `Your hat: <Owner|Officer|Mod|Member> · <N> members` (1.2). */
export function hatLine(role: ClubRole | null | undefined, memberCount: number): string {
  return `Your hat: ${roleWord(role)} · ${countWord(memberCount, "member")}`;
}

/** The author's name, `Someone` when `users` is null (SCREENS-L11). */
export function authorName(users: { name?: string | null; handle?: string | null } | null | undefined): string {
  const name = users?.name?.trim() || users?.handle?.trim();
  return name || "Someone";
}

type EventTimes = Pick<EventRef, "starts_at" | "ends_at" | "state">;

/** The live chrome and the `Soon` mark: `state === "live"` or `isSoon` (SCREENS-M2). */
export function isHot(event: EventTimes, now: Date): boolean {
  return event.state === "live" || isSoon(event.starts_at, event.ends_at, now);
}

function startsAtOrAfterFive(starts_at: string): boolean {
  const d = new Date(starts_at);
  return Number.isFinite(d.getTime()) && d.getHours() >= 17;
}

/**
 * The event chip's state word (1.2, SCREENS-L13): `tonight` when `isSoon` and
 * the start is at 17:00 or later · `today` when `isSoon` otherwise · `live now`
 * on `live` · `ended` on `after` · else `eventTimeShort`.
 */
export function chipStateWord(event: EventTimes, now: Date): string {
  if (isSoon(event.starts_at, event.ends_at, now)) return startsAtOrAfterFive(event.starts_at) ? "tonight" : "today";
  if (event.state === "live") return "live now";
  if (event.state === "after") return "ended";
  return eventTimeShort(event.starts_at, now);
}

/** The chip's visible text: `Lounge`, `Board`, `Officers`, the event's title, a room's name. */
export function chipLabel(room: Pick<SpaceRoom, "kind" | "name" | "event">): string {
  switch (room.kind) {
    case "lounge":
      return "Lounge";
    case "board":
      return "Board";
    case "officers":
      return "Officers";
    case "event":
      return room.event?.title || room.name;
    default:
      return room.name;
  }
}

/** The chip's `aria-label` (1.2); null when the visible text is the label. */
export function chipAriaLabel(room: Pick<SpaceRoom, "kind" | "name" | "unread" | "event">, now: Date): string | null {
  switch (room.kind) {
    case "board":
      return room.unread ? "Board, 1 unread post" : "Board";
    case "officers":
      return "Officers, only officers see this room";
    case "event":
      return room.event ? `${chipLabel(room)}, event chat, ${chipStateWord(room.event, now)}` : null;
    default:
      return null;
  }
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

/** `eventTime` for `aria-label`s: `tonight 7:30 PM`, `Tuesday 7 PM`, `October 8 7:30 PM`. */
export function eventTimeSpoken(starts_at: string, now: Date): string {
  const text = eventTime(starts_at, now);
  const [day, time] = text.split(" · ");
  if (!time) return text;
  if (day === "Tonight" || day === "Today" || day === "Tomorrow") return `${day.toLowerCase()} ${time}`;
  if (WEEKDAY_LONG[day]) return `${WEEKDAY_LONG[day]} ${time}`;
  const [mon, num] = day.split(" ");
  if (MONTH_LONG[mon] && num) return `${MONTH_LONG[mon]} ${num} ${time}`;
  return `${day} ${time}`;
}

/** The RSVP word on an Up next card and a week card: `Going` / `Maybe` / null. */
export function rsvpWord(status: EventRef["viewer_status"]): "Going" | "Maybe" | null {
  return status === "going" ? "Going" : status === "maybe" ? "Maybe" : null;
}

/** An Up next card's line 1: `Live now` / `Tonight · 7:30 PM` / `Tue · 7 PM` (`eventTime`). */
export function upNextLine(event: EventTimes, now: Date): string {
  return event.state === "live" ? "Live now" : eventTime(event.starts_at, now);
}

/**
 * `"<title> room, soon, tonight 7:30 PM, you're going"` /
 * `"<title> room, Tuesday 7 PM, you said maybe"`; `soon` only when `isSoon`,
 * `live now` on `live`, the RSVP clause only when the viewer RSVP'd.
 */
export function upNextAriaLabel(event: EventTimes & Pick<EventRef, "title" | "viewer_status">, now: Date): string {
  const parts = [`${event.title} room`];
  if (isSoon(event.starts_at, event.ends_at, now)) parts.push("soon");
  parts.push(event.state === "live" ? "live now" : eventTimeSpoken(event.starts_at, now));
  if (event.viewer_status === "going") parts.push("you're going");
  else if (event.viewer_status === "maybe") parts.push("you said maybe");
  return parts.join(", ");
}

const CHAT_GAP_MS = 60 * 60 * 1000;

/**
 * `shouldShowChatSep`'s rule (src/app/campus/campus-home.tsx): a separator
 * before the first row, on a day change, or after a gap of more than an hour.
 */
export function shouldShowSep(prevIso: string | null | undefined, currIso: string): boolean {
  if (!currIso) return false;
  if (!prevIso) return true;
  const pa = new Date(prevIso);
  const pb = new Date(currIso);
  if (Number.isNaN(pa.getTime()) || Number.isNaN(pb.getTime())) return false;
  const sameDay =
    pa.getFullYear() === pb.getFullYear() && pa.getMonth() === pb.getMonth() && pa.getDate() === pb.getDate();
  if (!sameDay) return true;
  return pb.getTime() - pa.getTime() > CHAT_GAP_MS;
}

/** The separator's text: `Today`, `Yesterday`, `Wed`, `Oct 5` (1.4 `rowTime` with the clock replaced by `Today`). */
export function sepLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? "Today" : rowTime(iso, now);
}

/**
 * The ids of the rows a separator stands before, computed over the rows that
 * are not stubs (11.5): a stub neither gets one nor counts as the previous row.
 */
export function separatorIds(rows: readonly { id: string; created_at: string; hidden?: boolean }[]): Set<string> {
  const out = new Set<string>();
  let prev: string | null = null;
  for (const row of rows) {
    if (row.hidden) continue;
    if (shouldShowSep(prev, row.created_at)) out.add(row.id);
    prev = row.created_at;
  }
  return out;
}

/** `Reply` when 0, else `1 reply` / `N replies`. */
export function repliesToggleText(count: number | null | undefined): string {
  const n = count ?? 0;
  return n === 0 ? "Reply" : countWord(n, "reply", "replies");
}

/** `Show N replies. Replies don't notify anyone.` / `Hide N replies. …`; `Reply. …` for 0. */
export function repliesToggleLabel(count: number | null | undefined, open: boolean): string {
  const n = count ?? 0;
  const head = n === 0 ? "Reply" : `${open ? "Hide" : "Show"} ${countWord(n, "reply", "replies")}`;
  return `${head}. Replies don't notify anyone.`;
}

/** `Board post from <Name>, <Role>, <spoken time>` (the role clause only with a role). */
export function postAriaLabel(name: string, role: ClubRole | null | undefined, spokenTime: string): string {
  const word = roleWord(role);
  return `Board post from ${name}${word ? `, ${word}` : ""}, ${spokenTime}`;
}

/** The state pill's text (1.2): `Soon · starts 7:30 PM` · `Live now` · `Ended · chat open N more days` · `Closed`. */
export function statePillText(event: EventTimes, now: Date): string {
  switch (event.state) {
    case "soon":
      return `Soon · starts ${eventTimeShort(event.starts_at, now)}`;
    case "live":
      return "Live now";
    case "after":
      return `Ended · chat open ${countWord(moreDays(event.ends_at, now), "more day")}`;
    default:
      return "Closed";
  }
}

/** The pill's state for its mark; `closed` for anything unknown (room-state.ts fails closed). */
export function pillState(state: RoomState | string): RoomState {
  return state === "soon" || state === "live" || state === "after" ? state : "closed";
}

/** `Who's going: N going, M maybe`. */
export function whoIsGoingLabel(going: number, maybe: number): string {
  return `Who's going: ${going} going, ${maybe} maybe`;
}

/** The RSVP pill's text and `aria-label` (1.2). */
export function rsvpPill(status: EventRef["viewer_status"]): { text: string; label: string } {
  if (status === "going") return { text: "Going", label: "You're going. Change your RSVP" };
  if (status === "maybe") return { text: "Maybe", label: "You said maybe. Change your RSVP" };
  return { text: "RSVP", label: "RSVP to this event" };
}

/** Composer placeholders (= `aria-label`s): `Message the Lounge` · `Post to the Board` · `Message the event chat` · `Message <room name>`. */
export function composerPlaceholder(kind: RoomKind, roomName: string): string {
  switch (kind) {
    case "lounge":
      return "Message the Lounge";
    case "board":
      return "Post to the Board";
    case "event":
      return "Message the event chat";
    default:
      // `room`, and `officers` by the room's own name (S3-notes STOPPED 2, the same reading).
      return `Message ${roomName}`;
  }
}

/** The send button's `aria-label`: `Post to the Board` on the Board, else `Send`. */
export function sendLabel(kind: RoomKind): string {
  return kind === "board" ? "Post to the Board" : "Send";
}

/** The empty room's line: `Say hi to <club>.` · `Nothing on the Board yet.` · `Say hi to everyone going.` */
export function emptyLine(kind: RoomKind, clubName: string): string {
  if (kind === "board") return "Nothing on the Board yet.";
  if (kind === "event") return "Say hi to everyone going.";
  return `Say hi to ${clubName}.`;
}

/** `Latest from the Board, unread. <Author>: <text>. Open the Board` (the unread clause only when true). */
export function boardStripLabel(author: string, text: string, unread: boolean): string {
  return `Latest from the Board${unread ? ", unread" : ""}. ${author}: ${text}. Open the Board`;
}

/** A room whose rows are all stubs, or none, is empty (8.3). */
export function isEmptyRoom(rows: readonly { hidden?: boolean }[] | null): boolean {
  return rows !== null && rows.every((r) => r.hidden);
}
