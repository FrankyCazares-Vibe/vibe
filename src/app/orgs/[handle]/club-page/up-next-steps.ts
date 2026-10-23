/**
 * Up next with its steps, the pure half (Oct 23, 2026; the club's view, wave
 * 3, B1: handoffs/2026-10-23-club-view-wave-3/PLAN.md, board
 * Pick_UpNext.png, "one card for the whole night"). The owner and officers
 * get one card that walks the night: Posted, Going, Check-in, Who came,
 * Thank-you. This file decides which event the card is about, which step it
 * is on, and every word it prints. UpNextSteps.tsx draws it; UpNext.tsx
 * feeds it the page's two event lists. Members and visitors keep the plain
 * event card.
 *
 * PURE ON PURPOSE: its runtime imports are pure modules only (the check-in
 * window and words, campus time, the Members only rule), so
 * up-next-steps.test.ts loads it under plain `node --test` with an "@/"
 * resolve hook. Days and clocks read in campus time, the way the door
 * screen and Tonight name them.
 */
import { campusClock, campusDay, campusHour, campusLongDay } from "@/components/campus/tonight/campus-time";
import { isMembersOnly } from "@/components/events/members-only";
import { CHECKIN_COPY, checkinPhase } from "@/lib/events/event-checkin";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** A thank-you is asked for until three days after the event ends. */
export const THANKS_WINDOW_MS = 72 * HOUR_MS;

/** The step the card is on (Posted is always behind it). */
export type UpNextStep = "going" | "checkin" | "thanks";

/** done = a tick, current = the coral ring, skipped = a dash, later = its number. */
export type StepState = "done" | "current" | "skipped" | "later";

export const STEP_LABELS = ["Posted", "Going", "Check-in", "Who came", "Thank-you"] as const;

/** What a screen reader hears after each step's name ("Going, now"). */
export const STEP_SPOKEN: Record<StepState, string> = {
  done: "done",
  current: "now",
  skipped: "skipped",
  later: "to come",
};

/** What the card reads off an event (a CampusEvent fits it). */
export type StepEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  going_count: number;
  interested_count: number;
  checkin_open?: boolean;
  checked_in_count?: number | null;
  /** "members" for a Members only event (read by members-only.ts; else everyone). */
  visibility?: string | null;
};

export type UpNextPick<E extends StepEvent> = {
  event: E;
  step: UpNextStep;
  /**
   * The soonest other event that hasn't started and everyone can see (the
   * thank-you's "Next up"). Never a Members only one: the thank-you is a
   * post on the club page, which visitors read (review, Oct 23, 2026).
   */
  nextUp: E | null;
};

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

const byStart = (a: StepEvent, b: StepEvent) => ms(a.starts_at) - ms(b.starts_at);

/**
 * The upcoming list (the page's provider) and the officers' past read, as
 * one list by id. An event in both has just ended: the past read's copy is
 * the newer one (it is read again after every change to the upcoming list).
 */
export function mergeEventLists<E extends StepEvent>(upcoming: readonly E[], past: readonly E[]): E[] {
  const byId = new Map<string, E>();
  for (const e of upcoming) byId.set(e.id, e);
  for (const e of past) byId.set(e.id, e);
  return [...byId.values()];
}

/**
 * Among events whose check-in window is open: the one check-in is running
 * for, then one that hasn't ended (the soonest), then one that has (the
 * latest to end).
 */
function compareOpen(a: StepEvent, b: StepEvent, nowMs: number): number {
  const running = Number(b.checkin_open === true) - Number(a.checkin_open === true);
  if (running !== 0) return running;
  const aEnded = ms(a.ends_at) < nowMs;
  const bEnded = ms(b.ends_at) < nowMs;
  if (aEnded !== bEnded) return aEnded ? 1 : -1;
  return aEnded ? ms(b.ends_at) - ms(a.ends_at) : byStart(a, b);
}

/**
 * Which event the officers' card is about, and its step (PLAN.md B1):
 * 1. one whose check-in window is open now (an hour before the start to an
 *    hour after the end) → Check-in;
 * 2. else the latest event that ended in the last 72 hours with no club post
 *    after its end → Thank-you;
 * 3. else the soonest event still to come → Going;
 * 4. else null (the page's "No event coming up" hint).
 * `latestPostAt` is the club's newest post (null: none). Undefined means the
 * page didn't say, and with no way to tell a thank-you was posted, step 2
 * is left out rather than asked for every time. Null before hydration
 * (`nowMs` 0).
 */
export function pickUpNext<E extends StepEvent>({
  upcoming,
  past,
  nowMs,
  latestPostAt,
}: {
  upcoming: readonly E[];
  past: readonly E[];
  nowMs: number;
  latestPostAt: string | null | undefined;
}): UpNextPick<E> | null {
  if (!Number.isFinite(nowMs) || nowMs <= 0) return null;
  const all = mergeEventLists(upcoming, past).filter(
    (e) => Number.isFinite(ms(e.starts_at)) && Number.isFinite(ms(e.ends_at)),
  );
  const notStarted = all.filter((e) => ms(e.starts_at) > nowMs).sort(byStart);
  const nextAfter = (e: E) => notStarted.find((n) => n.id !== e.id && !isMembersOnly(n)) ?? null;

  const open = all
    .filter((e) => checkinPhase(e.starts_at, e.ends_at, nowMs) === "open")
    .sort((a, b) => compareOpen(a, b, nowMs));
  if (open[0]) return { event: open[0], step: "checkin", nextUp: nextAfter(open[0]) };

  if (latestPostAt !== undefined) {
    const posted = latestPostAt ? ms(latestPostAt) : NaN;
    const owed = all
      .filter((e) => {
        const end = ms(e.ends_at);
        // NaN > end is false: no post (or an unreadable one) is not a thank-you.
        return end < nowMs && nowMs - end <= THANKS_WINDOW_MS && !(posted > end);
      })
      .sort((a, b) => ms(b.ends_at) - ms(a.ends_at));
    if (owed[0]) return { event: owed[0], step: "thanks", nextUp: nextAfter(owed[0]) };
  }

  const coming = all.filter((e) => checkinPhase(e.starts_at, e.ends_at, nowMs) === "before").sort(byStart);
  if (coming[0]) return { event: coming[0], step: "going", nextUp: nextAfter(coming[0]) };
  return null;
}

// ── Steps ───────────────────────────────────────────────────────────────────

/**
 * Whether check-in ran: true with anyone checked in (or marked as here),
 * false with nobody, null when the count couldn't be read (the list sends
 * null when its check-in read failed; officers otherwise get the exact
 * number).
 */
export function checkinRan(ev: Pick<StepEvent, "checked_in_count">): boolean | null {
  const n = ev.checked_in_count;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return n > 0;
}

/**
 * The five steps' states. After the event, Check-in and Who came are ticked
 * when anyone checked in and dashed when nobody did; with no count they
 * keep their numbers, since the card can't say either way.
 */
export function stepStates(step: UpNextStep, ran: boolean | null): StepState[] {
  if (step === "going") return ["done", "current", "later", "later", "later"];
  if (step === "checkin") return ["done", "done", "current", "later", "later"];
  const after: StepState = ran === true ? "done" : ran === false ? "skipped" : "later";
  return ["done", "done", after, after, "current"];
}

// ── Words ───────────────────────────────────────────────────────────────────

/** Whole campus days from `nowMs`'s day to `atMs`'s (by wall date, DST-safe). */
export function campusDaysFrom(nowMs: number, atMs: number): number {
  const index = (t: number) => {
    const [y, m, d] = campusDay(t).key.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  };
  return index(atMs) - index(nowMs);
}

/** "7 PM", "7:30 PM": the board's clock, no ":00". */
function shortClock(t: number): string {
  return campusClock(t).replace(":00 ", " ");
}

const count = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0).toLocaleString("en-US");

/** "Thu · 7 PM · The Lantern Room"; a day more than six away carries its date. */
export function upNextWhenLine(ev: Pick<StepEvent, "starts_at" | "location">, nowMs: number): string {
  const start = ms(ev.starts_at);
  if (!Number.isFinite(start)) return (ev.location ?? "").trim();
  const label = campusDay(start).label;
  const day = Math.abs(campusDaysFrom(nowMs, start)) <= 6 ? label.split(",")[0] : label;
  return [day, shortClock(start), (ev.location ?? "").trim()].filter(Boolean).join(" · ");
}

/** The badge on the right: "In 3 days", "Tomorrow", "Tonight", "Check-in open", "Done". */
export function upNextBadge(step: UpNextStep, ev: Pick<StepEvent, "starts_at">, nowMs: number): string {
  if (step === "checkin") return "Check-in open";
  if (step === "thanks") return "Done";
  const start = ms(ev.starts_at);
  const days = campusDaysFrom(nowMs, start);
  // "Tonight" from 5 PM on campus, as Tonight itself starts; a lunch is "Today".
  if (days <= 0) return campusHour(start) >= 17 ? "Tonight" : "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** The card's one line of facts. */
export function upNextLine(step: UpNextStep, ev: StepEvent, nowMs: number): string {
  if (step === "going") return `${count(ev.going_count)} going · ${count(ev.interested_count)} interested.`;
  if (step === "checkin") {
    if (ev.checkin_open) {
      const n = ev.checked_in_count;
      return typeof n === "number" ? `Check-in is open. ${count(n)} here so far.` : "Check-in is open.";
    }
    if (ms(ev.ends_at) < nowMs) return "It has ended. Check-in stays open for an hour after.";
    if (ms(ev.starts_at) <= nowMs) return "It's started. Start check-in at the door.";
    return "Doors open soon? Start check-in.";
  }
  const ran = checkinRan(ev);
  if (ran === null) return "Couldn't load who came.";
  return ran ? `${count(ev.checked_in_count ?? 0)} came.` : "Check-in wasn't run.";
}

/** Everything a button on the card can do. */
export type UpNextAction =
  | "share"
  | "edit"
  | "show_checkin"
  | "start_checkin"
  | "who_came"
  | "post_thanks"
  | "see_who_came";

export const ACTION_LABELS: Record<UpNextAction, string> = {
  share: "Share the event",
  edit: "Edit",
  show_checkin: CHECKIN_COPY.showCheckin,
  start_checkin: CHECKIN_COPY.startCheckin,
  who_came: CHECKIN_COPY.whoCame,
  post_thanks: "Post a thank-you",
  see_who_came: CHECKIN_COPY.seeWhoCame,
};

/** One coral primary, always the next thing to do, and at most one quiet secondary. */
export function upNextActions(
  step: UpNextStep,
  ev: StepEvent,
): { primary: UpNextAction; secondary: UpNextAction | null } {
  if (step === "going") return { primary: "share", secondary: "edit" };
  if (step === "checkin") return { primary: ev.checkin_open ? "show_checkin" : "start_checkin", secondary: "who_came" };
  // Nobody to see when check-in wasn't run; an unread count still offers the list.
  return { primary: "post_thanks", secondary: checkinRan(ev) === false ? null : "see_who_came" };
}

/** A title as it sits inside a sentence: trimmed, no closing "!", "?" or ".". */
function inSentence(title: string): string {
  return title.trim().replace(/[.!?\s]+$/, "");
}

/** "tonight", "today", "tomorrow", "Tuesday", or "Thursday, Nov 12" past a week. */
function dayInSentence(atMs: number, nowMs: number): string {
  const days = campusDaysFrom(nowMs, atMs);
  if (days <= 0) return campusHour(atMs) >= 17 ? "tonight" : "today";
  if (days === 1) return "tomorrow";
  const long = campusLongDay(atMs);
  return days <= 6 ? long.split(",")[0] : long;
}

/**
 * The thank-you's starter text, which the officer edits before posting:
 * "Thank you to everyone who came to Blitz Night! Next up: Rapid Night,
 * Tuesday." The "Next up" half only when there is a next event.
 *
 * NEVER A MEMBERS ONLY EVENT'S NAME (review, Oct 23, 2026). The thank-you
 * is a post on the club page, which visitors and signed-out people read, so
 * a Members only event thanked is "everyone who came!" with no title, and
 * one coming up is left out (pickUpNext already skips it for `nextUp`).
 */
export function thankYouStarter(
  thanked: Pick<StepEvent, "title" | "visibility">,
  nextUp: Pick<StepEvent, "title" | "starts_at" | "visibility"> | null,
  nowMs: number,
): string {
  const head = isMembersOnly(thanked)
    ? "Thank you to everyone who came!"
    : `Thank you to everyone who came to ${inSentence(thanked.title)}!`;
  const at = nextUp ? ms(nextUp.starts_at) : NaN;
  if (!nextUp || isMembersOnly(nextUp) || !Number.isFinite(at)) return head;
  return `${head} Next up: ${inSentence(nextUp.title)}, ${dayInSentence(at, nowMs)}.`;
}

// ── Sharing the event ───────────────────────────────────────────────────────

/** The club's link to one event: its page, scrolled to the event (linked-event.tsx). */
export function clubEventPath(handle: string, eventId: string): string {
  return `/orgs/${encodeURIComponent(handle)}?event=${encodeURIComponent(eventId)}`;
}

/** "Thu, Oct 29, 7 PM": a shared line is read later, so it always has the date. */
export function eventShareWhen(startsAt: string): string {
  const start = ms(startsAt);
  if (!Number.isFinite(start)) return "";
  return `${campusDay(start).label}, ${shortClock(start)}`;
}

/** "Blitz Night · Thu, Oct 29, 7 PM · The Lantern Room" (empty parts left out). */
export function eventShareText(parts: { title: string; when: string; place: string }): string {
  return [parts.title, parts.when, parts.place]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

// ── The card ────────────────────────────────────────────────────────────────

export type UpNextView = {
  when: string;
  title: string;
  badge: string;
  steps: { label: string; state: StepState; n: number }[];
  line: string;
  primary: UpNextAction;
  secondary: UpNextAction | null;
};

/** Everything UpNextSteps.tsx prints for one pick. */
export function upNextView<E extends StepEvent>(pick: UpNextPick<E>, nowMs: number): UpNextView {
  const ev = pick.event;
  const states = stepStates(pick.step, checkinRan(ev));
  const { primary, secondary } = upNextActions(pick.step, ev);
  return {
    when: upNextWhenLine(ev, nowMs),
    title: ev.title,
    badge: upNextBadge(pick.step, ev, nowMs),
    steps: STEP_LABELS.map((label, i) => ({ label, state: states[i], n: i + 1 })),
    line: upNextLine(pick.step, ev, nowMs),
    primary,
    secondary,
  };
}
