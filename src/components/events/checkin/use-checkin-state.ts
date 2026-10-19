"use client";

/**
 * useCheckinState(ev): what a student's event card, and the QR's landing
 * page, know about one event's check-in (contract 4.1, handoffs/
 * 2026-10-19-checkin-build/CONTRACT.md).
 *
 * It starts from the three fields the events list already sends
 * (checkin_open, checked_in_count, viewer_checked_in). The list never polls,
 * so a student who walks up to the door with the app already open would
 * otherwise still see "check-in isn't open". While the check-in window is on
 * (an hour before the start to an hour after the end) it therefore reads
 * GET /api/events/[id]/checkin once on mount, and again when the tab comes
 * back into view if the last read is 30 s old or more. Outside the window it
 * never reads: nothing there can change what the card shows.
 *
 * The 30 s rule is kept per EVENT for the whole page, not per card: a card
 * remounts on every Feed / Events switch, and each read counts against the
 * account's day budget (eventCheckinRead, shared with Settings and the
 * landing page). A card that remounts inside the 30 s starts from the last
 * answer instead of reading again.
 *
 * The pure half sits at the top of this file, so node --test can check it
 * without React (use-checkin-state.test.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { useCampusNow } from "@/components/campus/tonight/use-campus-now";
import {
  CHECKIN_CLOSES_AFTER_MS,
  CHECKIN_ERRORS,
  CHECKIN_OPENS_BEFORE_MS,
  checkinPhase,
  type CheckinCardEvent,
  type CheckinErrorCode,
  type CheckinPhase,
  type CheckinStateResponse,
  type CheckinViewerState,
} from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";

/** A return to the tab reads again only when the last read is this old. */
export const CHECKIN_RESYNC_MS = 30_000;

// ── Pure helpers ────────────────────────────────────────────────────────────

/** `iso` moved by `deltaMs`, as ISO; "" when it doesn't parse. */
function shiftIso(iso: string, deltaMs: number): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms + deltaMs).toISOString() : "";
}

/** The viewer's state from what the list sent. Missing fields read "nothing known". */
export function stateFromCard(ev: CheckinCardEvent): CheckinViewerState {
  const n = ev.checked_in_count;
  return {
    event_id: ev.id,
    open: ev.checkin_open === true,
    checked_in: ev.viewer_checked_in === true,
    count: typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null,
    opens_at: shiftIso(ev.starts_at, -CHECKIN_OPENS_BEFORE_MS),
    closes_at: shiftIso(ev.ends_at, CHECKIN_CLOSES_AFTER_MS),
  };
}

/**
 * Changes when the list sends new check-in facts for this card (a re-read
 * after an RSVP, say). Then the card starts over from them; otherwise a
 * fresher answer from the check-in route stays.
 */
export function cardStateKey(ev: CheckinCardEvent): string {
  return [
    ev.id,
    ev.starts_at,
    ev.ends_at,
    ev.checkin_open === true ? "1" : "0",
    ev.viewer_checked_in === true ? "1" : "0",
    typeof ev.checked_in_count === "number" ? String(ev.checked_in_count) : "",
  ].join("|");
}

/** A tab coming back into view reads again only when the last read is 30 s old (or there was none). */
export function dueForReread(lastReadAtMs: number, nowMs: number): boolean {
  return lastReadAtMs <= 0 || nowMs - lastReadAtMs >= CHECKIN_RESYNC_MS;
}

/**
 * The last read (or tap) of one event's check-in on this page. `at` is when
 * the read was SENT, so a read still out or one that failed also holds the
 * 30 s back; `state` is null until an answer lands. `listKey` is the card's
 * list facts at that moment (cardStateKey). `pending` is the read still out,
 * if any.
 */
export type CheckinReadMemo = {
  at: number;
  state: CheckinViewerState | null;
  listKey: string;
  pending?: Promise<CheckinViewerState | null> | null;
};

/**
 * What a card mounting now does: read (no read of this event in the last
 * 30 s), or not, starting from the remembered answer when the list hasn't
 * changed since it was taken (a list that has changed is newer news).
 */
export function mountPlan(
  memo: CheckinReadMemo | undefined,
  listKey: string,
  nowMs: number,
): { read: boolean; cached: CheckinViewerState | null } {
  if (!memo || dueForReread(memo.at, nowMs)) return { read: true, cached: null };
  return { read: false, cached: memo.state && memo.listKey === listKey ? memo.state : null };
}

/** A route's `state`, checked field by field; null when it isn't one, or is another event's. */
export function parseViewerState(raw: unknown, eventId: string): CheckinViewerState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.event_id === "string" && r.event_id !== eventId) return null;
  const n = r.count;
  return {
    event_id: eventId,
    open: r.open === true,
    checked_in: r.checked_in === true,
    count: typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null,
    opens_at: typeof r.opens_at === "string" ? r.opens_at : "",
    closes_at: typeof r.closes_at === "string" ? r.closes_at : "",
  };
}

/**
 * `next`, keeping `prev`'s window times where `next` has none: a check-in
 * whose follow-up read failed answers with empty times (contract 3.2), and
 * the card still knows them from the list.
 */
export function mergeViewerState(prev: CheckinViewerState, next: CheckinViewerState): CheckinViewerState {
  return {
    ...next,
    opens_at: next.opens_at || prev.opens_at,
    closes_at: next.closes_at || prev.closes_at,
  };
}

/** How the code form answers one refusal. */
export type CodeFormRefusal = {
  message: string;
  /** A wrong code: empty the field and put the cursor back in it. */
  clear: boolean;
  /** Too many tries, or the limiter can't count: the field stops taking digits. */
  lock: boolean;
  /** An old QR link: switch to the code box. */
  toCode: boolean;
};

/**
 * The line for a refused check-in, by the route's `code` (CHECKIN_ERRORS),
 * never the server's own sentence; `fallback` (vibeRequest's mapped line,
 * e.g. "Couldn't reach Vibe") for a code the words don't know.
 */
export function codeFormRefusal(code: string | null | undefined, fallback: string): CodeFormRefusal {
  const known =
    typeof code === "string" && Object.prototype.hasOwnProperty.call(CHECKIN_ERRORS, code)
      ? (code as CheckinErrorCode)
      : null;
  return {
    message: known ? CHECKIN_ERRORS[known] : fallback,
    clear: known === "checkin_code_wrong",
    lock: known === "checkin_too_many_tries" || known === "checkin_unavailable",
    toCode: known === "checkin_link_expired",
  };
}

/** The student's check-in route for one event. */
export function checkinApiPath(eventId: string): string {
  return `/api/events/${encodeURIComponent(eventId)}/checkin`;
}

// ── The page's memory ───────────────────────────────────────────────────────

// Browser only. Written from effects and handlers, never while rendering, so
// the server's copy of this module stays empty and one visitor's answer can
// never reach another visitor's page.
const memos = new Map<string, CheckinReadMemo>();

function memoFor(eventId: string): CheckinReadMemo | undefined {
  return typeof window === "undefined" ? undefined : memos.get(eventId);
}

function remember(eventId: string, memo: CheckinReadMemo): void {
  if (typeof window !== "undefined") memos.set(eventId, memo);
}

/**
 * Send one read of an event's state. The memo notes it at once (with the
 * request itself, so a card that remounts while it is out waits for it
 * rather than sending another: React's dev double-mount does exactly that),
 * and keeps the answer unless a tap has said something newer since.
 */
function sendRead(eventId: string, listKey: string): Promise<CheckinViewerState | null> {
  // Quiet: a card never toasts for a background read. A failure keeps
  // what the list said.
  const pending: Promise<CheckinViewerState | null> = vibeRequest<CheckinStateResponse>(checkinApiPath(eventId), {
    cache: "no-store",
    quiet: true,
    failure: CHECKIN_ERRORS.request_failed,
  }).then((r) => {
    const next = r.ok ? parseViewerState(r.data?.state, eventId) : null;
    const memo = memoFor(eventId);
    if (memo && memo.pending === pending) remember(eventId, { ...memo, state: next, pending: null });
    return next;
  });
  remember(eventId, { at: Date.now(), state: null, listKey, pending });
  return pending;
}

/**
 * A card's first state: the list's fields, or the last answer for this event
 * when it is under 30 s old and the list hasn't changed since (a remount).
 * Called once, from useState's initializer.
 */
function firstState(ev: CheckinCardEvent, listKey: string, serverFresh: boolean): CheckinViewerState {
  const fromList = stateFromCard(ev);
  if (serverFresh) return fromList;
  const { cached } = mountPlan(memoFor(ev.id), listKey, Date.now());
  return cached ? mergeViewerState(fromList, cached) : fromList;
}

// ── The hook ────────────────────────────────────────────────────────────────

export type CheckinStateHandle = {
  state: CheckinViewerState;
  /** Where now sits against the check-in window; null before hydration. */
  phase: CheckinPhase | null;
  /** Read the route now (the landing page's "Try again" throttles it itself). */
  refresh: () => Promise<void>;
  /** Take an answer the card already has (a check-in, a removal). */
  set: (next: CheckinViewerState) => void;
};

export type CheckinStateOptions = {
  /**
   * The fields came from a server read made for this page a moment ago (the
   * landing's `initial`): skip the read the window would otherwise make on
   * mount. Reads on a return to the tab still happen.
   */
  serverFresh?: boolean;
};

export function useCheckinState(ev: CheckinCardEvent, options: CheckinStateOptions = {}): CheckinStateHandle {
  const now = useCampusNow(60_000);
  const phase = checkinPhase(ev.starts_at, ev.ends_at, now);
  const serverFresh = options.serverFresh === true;

  // New facts from the list start the card over (React's "adjust state
  // while rendering" pattern, so there is no flash of the old state).
  const key = cardStateKey(ev);
  const [seenKey, setSeenKey] = useState(key);
  const [state, setState] = useState<CheckinViewerState>(() => firstState(ev, key, serverFresh));
  if (seenKey !== key) {
    setSeenKey(key);
    setState(stateFromCard(ev));
  }

  // Only the newest read lands: a slow answer can't overwrite a newer one,
  // nor an answer the card set itself after a tap. An unmount drops
  // whatever is still out (the memo still keeps it).
  const seqRef = useRef(0);
  const keyRef = useRef(key);
  // The first render's view, for the server-fresh note below. `pending`
  // stays true until the clock is known (hydration answers 0 first), then
  // is spent on that first real reading.
  const firstRef = useRef({ state, key, pending: serverFresh });
  const eventId = ev.id;

  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  /** Wait for a read (this card's own, or one already out) and take its answer if it is still the newest. */
  const land = useCallback(async (pending: Promise<CheckinViewerState | null>) => {
    const seq = ++seqRef.current;
    const next = await pending;
    if (seq !== seqRef.current || !next) return;
    setState((prev) => mergeViewerState(prev, next));
  }, []);

  const read = useCallback(() => land(sendRead(eventId, keyRef.current)), [eventId, land]);

  const set = useCallback(
    (next: CheckinViewerState) => {
      seqRef.current += 1;
      // A tap's answer is the newest word on this event: a remount inside
      // the 30 s starts from it, not from a list fetched before the tap.
      remember(eventId, { at: Date.now(), state: next, listKey: keyRef.current, pending: null });
      setState((prev) => mergeViewerState(prev, next));
    },
    [eventId],
  );

  const live = phase === "open";
  const ready = phase !== null;
  useEffect(() => {
    if (!ready) return;
    const first = firstRef.current;
    if (!first.pending) return;
    first.pending = false;
    // The server read this for the page a moment ago: note it rather than
    // read again. Only when the window is on at the first reading of the
    // clock; a page left open until the window opens reads then, as usual.
    if (live) remember(eventId, { at: Date.now(), state: first.state, listKey: first.key, pending: null });
  }, [ready, live, eventId]);

  // Inside the window only: once on mount (or when the window opens with the
  // page up), then on a return to the tab, at most once per 30 s per event.
  useEffect(() => {
    if (!live) return;
    const memo = memoFor(eventId);
    if (mountPlan(memo, keyRef.current, Date.now()).read) void read();
    else if (memo?.pending) void land(memo.pending);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (dueForReread(memoFor(eventId)?.at ?? 0, Date.now())) void read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      seqRef.current += 1;
    };
  }, [live, read, land, eventId]);

  return { state, phase, refresh: read, set };
}
