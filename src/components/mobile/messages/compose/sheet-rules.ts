/**
 * The pure rules of the "+" tray's three sheets (handoffs/chat-redesign/
 * wave-2-contracts.md 11.7, 1.2 "The tray and the three sheets"; W2-S3):
 * the `<club> · <room>` line, the share CTA, the counters and the validity
 * of each body, mirroring the route's own limits (4.2, `cards/body.ts`:
 * lengths count code points). Tested in sheet-rules.test.ts; imports
 * nothing but types.
 */

import type { RoomKind } from "@/lib/chat/types";

export const QUESTION_MAX = 200;
export const LABEL_MAX = 80;
export const NOTE_MAX = 200;
export const POLL_OPTIONS_MIN = 2;
export const SIGNUP_SLOTS_MIN = 1;
export const OPTIONS_MAX = 10;
export const CAPACITY_MIN = 1;
export const CAPACITY_MAX = 50;
export const CAPACITY_DEFAULT = 2;

/** Characters as Postgres and the route count them (code points). */
export function charCount(s: string): number {
  return Array.from(s).length;
}

/** Whitespace of every kind, runs included, becomes one space; the ends are trimmed (the route's `collapse`). */
export function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** The counter's text `<n> / 200`. */
export function counterText(n: number, max: number): string {
  return `${n} / ${max}`;
}

/** The counter's `aria-label`: `<n> of 200 characters`. */
export function counterLabel(n: number, max: number): string {
  return `${n} of ${max} characters`;
}

/** `<club> · the Lounge` / `· the Board` / `· <event title>` / `· <room>` (1.2). */
export function sheetRoomLine(clubName: string, roomKind: RoomKind, roomName: string): string {
  switch (roomKind) {
    case "lounge":
      return `${clubName} · the Lounge`;
    case "board":
      return `${clubName} · the Board`;
    default:
      // `event` → the event title (the room's name); `room` and `officers` → the room's name.
      return `${clubName} · ${roomName}`;
  }
}

/** The Share-an-event CTA: `Share to the Lounge` / `Share to the Board` / `Share to the event chat` / `Share to <room>`. */
export function shareCta(roomKind: RoomKind, roomName: string): string {
  switch (roomKind) {
    case "lounge":
      return "Share to the Lounge";
    case "board":
      return "Share to the Board";
    case "event":
      return "Share to the event chat";
    default:
      return `Share to ${roomName}`;
  }
}

/** `1 spot` / `N spots` (the stepper's number). */
export function spotsWord(n: number): string {
  return n === 1 ? "1 spot" : `${n} spots`;
}

/** `Option <i>` / `Slot <i>` (1-based), the inputs' names. */
export function optionName(i: number): string {
  return `Option ${i}`;
}

export function slotName(i: number): string {
  return `Slot ${i}`;
}

/** `Remove <label>`; a blank label falls back to the input's name (`Remove Option 2`). */
export function removeLabel(label: string, fallback: string): string {
  return `Remove ${cleanText(label) || fallback}`;
}

/** `Spots for <slot>`; a blank slot falls back to `Spots for Slot <i>`. */
export function spotsForLabel(label: string, fallback: string): string {
  return `Spots for ${cleanText(label) || fallback}`;
}

/** A question or title: 1–200 characters once cleaned. */
export function questionValid(question: string): boolean {
  const n = charCount(cleanText(question));
  return n >= 1 && n <= QUESTION_MAX;
}

/** A label: 1–80 characters once cleaned. */
export function labelValid(label: string): boolean {
  const n = charCount(cleanText(label));
  return n >= 1 && n <= LABEL_MAX;
}

/** New poll: the question 1–200 and 2–10 non-blank labels ≤ 80 (11.7). */
export function pollValid(question: string, labels: readonly string[]): boolean {
  if (!questionValid(question)) return false;
  if (labels.length < POLL_OPTIONS_MIN || labels.length > OPTIONS_MAX) return false;
  return labels.every(labelValid);
}

/** New sign-up: the title 1–200 and 1–10 slots, each a label ≤ 80 with a capacity 1–50 (11.7). */
export function signupValid(title: string, slots: readonly { label: string; capacity: number }[]): boolean {
  if (!questionValid(title)) return false;
  if (slots.length < SIGNUP_SLOTS_MIN || slots.length > OPTIONS_MAX) return false;
  return slots.every(
    (s) => labelValid(s.label) && Number.isInteger(s.capacity) && s.capacity >= CAPACITY_MIN && s.capacity <= CAPACITY_MAX,
  );
}

/** Share an event: an event picked and the note ≤ 200. */
export function eventValid(eventId: string | null, note: string): boolean {
  return eventId !== null && eventId !== "" && charCount(note.trim()) <= NOTE_MAX;
}

/** Steps a capacity within 1–50. */
export function stepCapacity(current: number, delta: 1 | -1): number {
  return Math.min(CAPACITY_MAX, Math.max(CAPACITY_MIN, current + delta));
}
