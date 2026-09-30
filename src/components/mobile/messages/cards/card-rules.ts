/**
 * The pure rules of the three card renderers (handoffs/chat-redesign/
 * wave-2-contracts.md 11.8 and 1.2 "Cards"; W2-S3): every label, count word
 * and layout decision the views draw, so they are tested without React
 * (card-rules.test.ts). Imports nothing but types.
 *
 * Names: `Person.name`, else the handle, else `Someone`; in a card's own
 * label an author whose `users` row the viewer cannot read is `someone`
 * (1.2: `Poll from someone: …`).
 */

import type { ChatMessage, EventRef, Person, PollCard, PollCardOption } from "@/lib/chat/types";

export const EVENT_CANCELLED_LINE = "This event was cancelled.";
export const APPEAR_LINE = "You'll appear in the event chat.";
export const OPEN_EVENT_CHAT = "Open event chat";
export const YOUR_PICK = "Your pick";
export const TAKE_A_SPOT = "Take a spot";
export const LEAVE = "Leave";
export const FULL = "Full";

export function personName(p: Pick<Person, "name" | "handle">): string {
  return p.name.trim() || p.handle.trim() || "Someone";
}

/** Ends a spoken clause with one full stop: none is added after a name's own `.` (`Priya S.`) or a question's `?`. */
export function endSentence(text: string): string {
  return /[.?!…]$/.test(text) ? text : `${text}.`;
}

// ── The header line (11.8: `<Name> · Poll | Sign-up | Event`) ───────────────

export type CardWord = "Poll" | "Sign-up" | "Event";

/**
 * The word after the dot. `card.type` when hydrated; else the message's
 * kind, and for `kind: "poll"` (which covers sign-ups too) the fallback
 * text's prefix (`Sign-up: …`, cards/fallback.ts).
 */
export function cardWord(message: Pick<ChatMessage, "kind" | "card" | "content">): CardWord {
  const type = message.card?.type;
  if (type === "signup") return "Sign-up";
  if (type === "event") return "Event";
  if (type === "poll") return "Poll";
  if (message.kind === "event_card") return "Event";
  return message.content.startsWith("Sign-up:") ? "Sign-up" : "Poll";
}

/** `You` when mine, the author's name (else the handle), `Someone` when `users` is null (SCREENS-L11). */
export function cardAuthorName(message: Pick<ChatMessage, "users">, isMine: boolean): string {
  if (isMine) return "You";
  const name = message.users?.name?.trim() || message.users?.handle?.trim();
  return name || "Someone";
}

// ── Poll ─────────────────────────────────────────────────────────────────────

/** The result bar: `count / max(total_voters, 1)`, each bar on its own (open point 14.26), as a 0–100 percentage. */
export function pollBarWidth(count: number, totalVoters: number): number {
  const share = Math.max(0, count) / Math.max(totalVoters, 1);
  return Math.round(Math.min(1, share) * 100);
}

/** `1 vote` / `N votes` (the option's label). */
export function votesWord(n: number): string {
  return n === 1 ? "1 vote" : `${n} votes`;
}

/**
 * The option's `aria-label` (1.2, SCREENS-L3): `<label>[, your pick]. N
 * votes` + `: <A> and <B>.` when the two spoken names are every visible
 * voter · `, including <A> and <B>.` when more visible voters exist · `.`
 * alone when anonymous or nobody. The count may exceed the visible names
 * (PRIVACY-L4): the count is the truth, the names the viewer's view.
 */
export function optionAriaLabel(
  option: Pick<PollCardOption, "label" | "mine" | "count" | "voters">,
  anonymous: boolean,
): string {
  const head = `${option.label}${option.mine ? ", your pick" : ""}. ${votesWord(option.count)}`;
  const voters = anonymous ? [] : option.voters;
  if (voters.length === 0) return endSentence(head);
  const names = voters.slice(0, 2).map(personName).join(" and ");
  return endSentence(voters.length > 2 ? `${head}, including ${names}` : `${head}: ${names}`);
}

/** The footer: `<N> voted · names shown` / `<N> voted · anonymous`; closed: `Closed · <N> voted`. */
export function pollFooter(card: Pick<PollCard, "total_voters" | "anonymous" | "closed">): string {
  if (card.closed) return `Closed · ${card.total_voters} voted`;
  return `${card.total_voters} voted · ${card.anonymous ? "anonymous" : "names shown"}`;
}

/**
 * The card's own label: `Poll from <Name>: <q>. N voted, names shown` /
 * `Your anonymous poll: <q>. N voted` (1.2's two examples), the other two
 * sides by the same pattern; closed puts the footer's `Closed` before the
 * count. `author` null = `someone`.
 */
export function pollCardLabel(
  card: Pick<PollCard, "question" | "total_voters" | "anonymous" | "closed">,
  author: string | null,
  isMine: boolean,
): string {
  const count = `${card.closed ? "Closed, " : ""}${card.total_voters} voted`;
  const question = endSentence(card.question);
  if (isMine) {
    return card.anonymous ? `Your anonymous poll: ${question} ${count}` : `Your poll: ${question} ${count}, names shown`;
  }
  return `Poll from ${author ?? "someone"}: ${question} ${count}, ${card.anonymous ? "anonymous" : "names shown"}`;
}

// ── Sign-up ──────────────────────────────────────────────────────────────────

/** Two-line rows when any slot label is longer than 12 characters (open point 14.34); else the single-line layout. */
export function signupTwoLine(labels: readonly string[]): boolean {
  return labels.some((label) => Array.from(label).length > 12);
}

/** `taken` = Σ count, `total` = Σ capacity. */
export function signupCounts(options: readonly Pick<PollCardOption, "count" | "capacity">[]): { taken: number; total: number } {
  let taken = 0;
  let total = 0;
  for (const o of options) {
    taken += Math.max(0, o.count);
    total += Math.max(0, o.capacity ?? 0);
  }
  return { taken, total };
}

export const SIGNUP_MAX_SEGMENTS = 12;

export type SignupProgress = { kind: "segments"; segments: number; filled: number } | { kind: "bar"; fraction: number };

/** The footer progress: `min(Σ capacity, 12)` segments; past 12 the bar is continuous (11.8). */
export function signupProgress(total: number, taken: number): SignupProgress {
  if (total > SIGNUP_MAX_SEGMENTS) return { kind: "bar", fraction: total > 0 ? Math.min(1, taken / total) : 0 };
  return { kind: "segments", segments: Math.max(0, total), filled: Math.max(0, Math.min(taken, total)) };
}

/** `1 open` / `K open` (the row's chip). */
export function openWord(k: number): string {
  return `${k} open`;
}

/** `1 spot open` / `K spots open`. */
export function spotsOpen(k: number): string {
  return k === 1 ? "1 spot open" : `${k} spots open`;
}

/** `Take a spot in <slot>, K spots open` — the raw slot label (1.2). */
export function takeSpotLabel(slot: string, open: number): string {
  return `Take a spot in ${slot}, ${spotsOpen(open)}`;
}

/** `Leave <slot>`. */
export function leaveLabel(slot: string): string {
  return `Leave ${slot}`;
}

/** `<taken> of <total> filled`; closed: `Closed · <taken> of <total> filled`. */
export function filledLine(taken: number, total: number, closed: boolean): string {
  const base = `${taken} of ${total} filled`;
  return closed ? `Closed · ${base}` : base;
}

/** `Sign-up from <Name>: <title>, K of M spots filled` / `Your sign-up: …`. */
export function signupCardLabel(title: string, taken: number, total: number, author: string | null, isMine: boolean): string {
  const tail = `${title}, ${taken} of ${total} spots filled`;
  return isMine ? `Your sign-up: ${tail}` : `Sign-up from ${author ?? "someone"}: ${tail}`;
}

export const TAKERS_SHOWN = 3;

/** The taker chips: up to three visible people, then `+N` for the rest of the VISIBLE ones (never for hidden people). */
export function visibleTakers<T>(voters: readonly T[]): { shown: T[]; more: number } {
  if (voters.length <= TAKERS_SHOWN) return { shown: [...voters], more: 0 };
  return { shown: voters.slice(0, TAKERS_SHOWN), more: voters.length - TAKERS_SHOWN };
}

/** The row that gets the coral `Take a spot`: the first row that shows one (open point 14.34); −1 when none. */
export function firstOpenIndex(options: readonly Pick<PollCardOption, "full" | "mine">[]): number {
  return options.findIndex((o) => !o.full && !o.mine);
}

// ── Event card ───────────────────────────────────────────────────────────────

/**
 * The title of a cancelled event (`event: null`) from the stored fallback
 * text (5.1: `Event: <title> · <when>[ — <note>]`): what sits between
 * `Event: ` and the first ` · `; the whole text past the prefix when no
 * ` · ` follows.
 */
export function fallbackEventTitle(content: string): string {
  const prefix = "Event: ";
  const body = content.startsWith(prefix) ? content.slice(prefix.length) : content;
  const dot = body.indexOf(" · ");
  return (dot >= 0 ? body.slice(0, dot) : body).trim();
}

/** `<place> · <Thu Oct 8, 7:30 PM>`, the place omitted when empty. */
export function eventPlaceLine(location: string, when: string): string {
  const place = location.trim();
  return place ? `${place} · ${when}` : when;
}

/** `N going`. */
export function goingWord(n: number): string {
  return `${n} going`;
}

/** The spoken RSVP clause of the card's label; null when the viewer has none. */
export function rsvpSpoken(status: EventRef["viewer_status"]): string | null {
  if (status === "going") return "you're going";
  if (status === "maybe") return "you said maybe";
  return null;
}

function eventHead(author: string | null, isMine: boolean): string {
  return isMine ? "Event you shared" : `Event shared by ${author ?? "someone"}`;
}

/** `Event shared by <Name>: <title>, <place>, <Thursday October 8, 7:30 PM>. N going, you're going`. */
export function eventCardLabel(
  input: { title: string; location: string; whenSpoken: string; going: number; status: EventRef["viewer_status"] },
  author: string | null,
  isMine: boolean,
): string {
  const place = input.location.trim() ? `, ${input.location.trim()}` : "";
  const you = rsvpSpoken(input.status);
  return `${eventHead(author, isMine)}: ${input.title}${place}, ${input.whenSpoken}. ${goingWord(input.going)}${you ? `, ${you}` : ""}`;
}

/** The cancelled card: `Event shared by <Name>: <fallback title>. This event was cancelled.` */
export function cancelledEventLabel(title: string, author: string | null, isMine: boolean): string {
  return `${eventHead(author, isMine)}: ${endSentence(title)} ${EVENT_CANCELLED_LINE}`;
}

/** The `You'll appear in the event chat.` line: while the viewer has no RSVP and no room, and the event is open (14.41). */
export function showAppearLine(event: Pick<EventRef, "viewer_status" | "room_id" | "state">): boolean {
  return event.viewer_status === null && event.room_id === null && event.state !== "closed";
}

// ── Announcements (1.2, one polite region per card) ──────────────────────────

export function announceVotes(totalVoters: number): string {
  return `${totalVoters} voted`;
}

export function announceFilled(taken: number, total: number): string {
  return `${taken} of ${total} filled`;
}

export function announceRsvp(status: EventRef["viewer_status"]): string {
  if (status === "going") return "You're going";
  if (status === "maybe") return "You said maybe";
  return "RSVP removed";
}

// ── The Share-an-event rows (11.7) ───────────────────────────────────────────

export type WhenParts = { weekday: string; month: string; day: string; clock: string };

/** `Thu Oct 8, 7:30 PM` (`eventWhen`) → its parts for the 44×48 date tile and the row's line. */
export function whenParts(when: string): WhenParts {
  const m = /^(\S+) (\S+) (\d+), (.+)$/.exec(when);
  if (!m) return { weekday: "", month: "", day: "", clock: when };
  return { weekday: m[1], month: m[2], day: m[3], clock: m[4] };
}

/** `Thu · 7:30 PM · Campus Center 450` / `Tue · 7 PM`. */
export function shareEventLine(when: string, location: string): string {
  const p = whenParts(when);
  const head = p.weekday ? `${p.weekday} · ${p.clock}` : p.clock;
  const place = location.trim();
  return place ? `${head} · ${place}` : head;
}

/** `<title>, <Thursday October 8, 7:30 PM>[, <place>][, selected]` (1.2). */
export function shareEventLabel(title: string, whenSpoken: string, location: string, selected: boolean): string {
  const place = location.trim();
  return `${title}, ${whenSpoken}${place ? `, ${place}` : ""}${selected ? ", selected" : ""}`;
}

/** The device's zone for the screens' date lines (1.4); undefined lets `eventWhen` fall back to the campus zone. */
export function deviceZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
