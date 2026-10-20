/**
 * The pure parts of the club screens (handoffs/chat-redesign/wave-2-contracts.md
 * 1.2 "Inside a club", 11.3-11.6; W2-S2): the copy strings and `aria-label`s
 * assembled from the payloads, the role word, the event chip's state word,
 * the date separators rule and the state pill's text.
 *
 * PURE: no React, no DOM. The imports are `when.ts` (1.4), `room-names.ts`
 * (wave-3 desktop contract 4c.3; itself import-free), join-copy.ts (whose
 * own imports are types) and types, so `node --test` loads it (helpers.test.ts,
 * through the repo's resolve hook for the "@/" alias). The member screens'
 * strings are 1.2's, word for word; the follower's (club model, Oct 16) are
 * `ORG_COPY.board`'s, the club page's own. Every function that reads a clock
 * takes `now`.
 */

import { roomDisplayName } from "@/lib/chat/room-names";
import type { ClubRole, EventRef, FollowedBoard, RoomKind, RoomState, SpaceAnswer, SpaceResponse, SpaceRoom } from "@/lib/chat/types";
import { eventTime, eventTimeShort, isSoon, moreDays, rowTime, rowTimeSpoken } from "@/lib/chat/when";
import { ORG_COPY, fillCopy, type OrgRelation } from "@/lib/orgs/join-copy";

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

// ── Followers (club model, Franky's calls of Oct 16) ─────────────────────────
// Only members type, react or vote. A follower the database lets in reads
// the club's Board (its officers' posts, never the replies) and nothing else.

/** The space read as a MEMBER's (a role in `viewer`), else null: a follower's space, or none yet. */
export function memberSpace(space: SpaceAnswer | null | undefined): SpaceResponse | null {
  return space && space.viewer.role !== null ? (space as SpaceResponse) : null;
}

/** The quiet line in the composer's place for a follower on the Board. */
export const FOLLOWER_POST_LINE: string = ORG_COPY.board.onlyMembersPost;

/** A reader of the room or the space who follows the club but is not in it. */
export function isFollower(viewer: object | null | undefined): boolean {
  return (viewer as { standing?: unknown } | null | undefined)?.standing === "follower";
}

/**
 * The header's second line for a follower: `Following · 12 members`, or
 * `Following` alone when the count is null (counts are public from 5 up, so
 * the space sends null below that, or when it could not be read).
 */
export function followerHatLine(memberCount: number | null | undefined): string {
  return typeof memberCount === "number" && Number.isFinite(memberCount)
    ? `Following · ${countWord(memberCount, "member")}`
    : "Following";
}

/** The line over a follower's Board: whose posts these are. */
export function followerBoardIntro(clubName: string): string {
  return fillCopy(ORG_COPY.board.intro, { org: clubName.trim() || "the club" });
}

/** A follower's Board post is the club's: `Board post from <Club>, <spoken time>`. */
export function followerPostLabel(clubName: string, spokenTime: string): string {
  return `Board post from ${clubName.trim() || "the club"}${spokenTime ? `, ${spokenTime}` : ""}`;
}

/** A reaction a follower sees as a count only: `3 reactions with 🎉`. */
export function reactionCountLabel(emoji: string, count: number): string {
  return `${countWord(count, "reaction")} with ${emoji}`;
}

/**
 * A Board I follow has a post I haven't seen: its newest post is later than
 * the newest one this browser showed me (`board-seen.ts`; a follower has no
 * server read mark). Never seen, any post is new.
 */
export function boardHasNew(latestAt: string | null | undefined, seenAt: string | null | undefined): boolean {
  const latest = latestAt ? Date.parse(latestAt) : Number.NaN;
  if (!Number.isFinite(latest)) return false;
  const seen = seenAt ? Date.parse(seenAt) : Number.NaN;
  return !Number.isFinite(seen) || latest > seen;
}

/** The row of a Board I follow on the Messages home: `<Club> Board, you follow this club[, new post], latest: <text>, <time>`. */
export function followedBoardLabel(board: Pick<FollowedBoard, "org" | "latest">, now: Date, isNew = false): string {
  const parts = [`${board.org.name} Board`, "you follow this club"];
  if (isNew) parts.push("new post");
  const text = board.latest?.text.trim();
  const empty = ORG_COPY.board.followedEmpty;
  parts.push(text ? `latest: ${text}` : empty.charAt(0).toLowerCase() + empty.slice(1));
  if (board.latest) {
    const when = rowTimeSpoken(board.latest.created_at, now);
    if (when) parts.push(when);
  }
  return parts.join(", ");
}

/** The wide list's search over the Boards I follow: the club's name or handle includes the query, whatever the case. */
export function boardsMatching<T extends Pick<FollowedBoard, "org">>(boards: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...boards];
  return boards.filter((b) => b.org.name.toLowerCase().includes(q) || b.org.handle.toLowerCase().includes(q));
}

const JOIN_STATES = ["member", "invited", "requested", "can_join", "can_request", "invite_only", "audience_blocked", "unverified", "hidden"] as const;
const ROLES = ["owner", "admin", "mod", "member"] as const;

function oneOf<T extends string>(value: unknown, list: readonly T[]): T | null {
  return typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * The viewer's standing with a club, from `GET /api/orgs/<handle>`'s `org`
 * (the Join or Request control under a follower's Board). The fields are the
 * phone Orgs tab's (`orgRelationFor`): following = a role, or a follow row.
 * Null when the body does not hold a club and a known state, so the screen
 * offers nothing rather than a wrong button.
 */
export function followerRelation(org: unknown): OrgRelation | null {
  if (!org || typeof org !== "object") return null;
  const o = org as Record<string, unknown>;
  const state = oneOf(o.join_state, JOIN_STATES);
  if (typeof o.handle !== "string" || !o.handle || !state) return null;
  const role = oneOf(o.viewer_role, ROLES);
  return {
    handle: o.handle,
    orgName: typeof o.name === "string" ? o.name : "",
    state,
    following: state === "member" || role !== null || o.org_follow_state === "following",
    role,
    reason: oneOf(o.join_reason, ["policy", "visiting"] as const),
    audience: oneOf(o.audience, ["both", "iu", "purdue"] as const) ?? "both",
    joinPolicy: oneOf(o.join_policy, ["open", "request", "invite"] as const),
  };
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

/**
 * The chip's visible text: `Lounge`, `Board`, `Officers`, the event's title,
 * an extra room's name as words (`exec-only` reads `Exec only`; wave-3
 * desktop contract 4c.3, C14: the stored name stays a slug).
 */
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
      return roomDisplayName(room.name);
  }
}

/**
 * The chip's `aria-label` (1.2); null when the visible text is the label.
 * An extra room only some members see (`locked`, the chip's lock) says so
 * (wave-3 desktop contract 4c.3).
 */
export function chipAriaLabel(room: Pick<SpaceRoom, "kind" | "name" | "unread" | "event"> & { locked?: boolean }, now: Date): string | null {
  switch (room.kind) {
    case "board":
      return room.unread ? "Board, 1 unread post" : "Board";
    case "officers":
      return "Officers, only officers see this room";
    case "event":
      return room.event ? `${chipLabel(room)}, event chat, ${chipStateWord(room.event, now)}` : null;
    case "room":
      return room.locked ? `${chipLabel(room)}, only some members see this room` : null;
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

/** The RSVP word on an Up next card and a week card: `Going` / `Interested` / null.
 *  "Interested", not "Maybe", since Oct 19, 2026 (decision 12): the Policy's
 *  and the event card's word. The stored value is still `maybe`. */
export function rsvpWord(status: EventRef["viewer_status"]): "Going" | "Interested" | null {
  return status === "going" ? "Going" : status === "maybe" ? "Interested" : null;
}

/** An Up next card's line 1: `Live now` / `Tonight · 7:30 PM` / `Tue · 7 PM` (`eventTime`). */
export function upNextLine(event: EventTimes, now: Date): string {
  return event.state === "live" ? "Live now" : eventTime(event.starts_at, now);
}

/**
 * `"<title> room, soon, tonight 7:30 PM, you're going"` /
 * `"<title> room, Tuesday 7 PM, you're interested"`; `soon` only when `isSoon`,
 * `live now` on `live`, the RSVP clause only when the viewer RSVP'd.
 */
export function upNextAriaLabel(event: EventTimes & Pick<EventRef, "title" | "viewer_status"> & { room_id?: string | null }, now: Date): string {
  // A tile with no chat to enter (a follower's, or before the RSVP) opens the event itself.
  const parts = [`${event.title} ${event.room_id === null ? "event" : "room"}`];
  if (isSoon(event.starts_at, event.ends_at, now)) parts.push("soon");
  parts.push(event.state === "live" ? "live now" : eventTimeSpoken(event.starts_at, now));
  if (event.viewer_status === "going") parts.push("you're going");
  else if (event.viewer_status === "maybe") parts.push("you're interested");
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

/** `Who's going: N going, M interested`. */
export function whoIsGoingLabel(going: number, maybe: number): string {
  return `Who's going: ${going} going, ${maybe} interested`;
}

/** The RSVP pill's text and `aria-label` (1.2). */
export function rsvpPill(status: EventRef["viewer_status"]): { text: string; label: string } {
  if (status === "going") return { text: "Going", label: "You're going. Change your RSVP" };
  if (status === "maybe") return { text: "Interested", label: "You're interested. Change your RSVP" };
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

/**
 * What a refused send does to the composer, by the refusal's `code` (11.5;
 * wave-3 desktop contract 4c.4). `tile`: the composer turns into the quiet
 * tile until the next full read hands a new `viewer`. `reread`: that read is
 * asked for at once, because the `viewer` on screen cannot say why: after
 * `room_posters_only` it still holds `can_post: true` and no `post_line`, so
 * the tile would read `This chat is closed.` on a room that is open. Every
 * other code (and none) leaves the composer as it is.
 */
export function refusedSend(code: string | null | undefined): { tile: boolean; reread: boolean } {
  const reread = code === "room_posters_only";
  return { tile: reread || code === "board_officers_only" || code === "room_closed", reread };
}

/** The empty room's line: `Say hi to <club>.` · `Nothing on the Board yet.` · `Say hi to everyone going.` */
export function emptyLine(kind: RoomKind, clubName: string): string {
  if (kind === "board") return ORG_COPY.board.empty;
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
