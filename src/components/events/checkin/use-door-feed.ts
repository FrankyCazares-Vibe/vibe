"use client";

/**
 * useDoorFeed(eventId, enabled): the officers' door screen's live feed
 * (Oct 19 2026; contract §4.3). It reads GET /api/events/[id]/checkin/door:
 *
 * - on mount, then every DOOR_POLL_MS while the page is in view (each read
 *   books the next, so reads never pile up), right away when the page comes
 *   back into view, and right away when the code on screen moves from the
 *   feed's `current` step to its `next` one, so there is always a next code
 *   ready and the screen never blanks over one slow read;
 * - with the SERVER's clock: the database decides which code is live, so the
 *   countdown runs on `server_now` plus the time since it arrived (`skewMs`),
 *   not on the device's own clock, which may be minutes off;
 * - with its own one-second tick, lined up on the server's whole seconds, so
 *   the code flips at :00 and :30 on the dot.
 *
 * `start()` and `stop()` POST and DELETE the same route and put the answer on
 * screen. They are not quiet: a refusal shows the server's sentence as a
 * toast. The reads are quiet: the door draws its own "Reconnecting…".
 *
 * An action's answer always wins. While Start or Stop is out no read starts
 * and the poll waits: a read sent then could reach the database before the
 * action commits, come back first (a GET is one trip shorter) and keep the
 * old state on screen, a QR that no longer works or a Start button for a
 * check-in that is already open. The action books the next read itself.
 *
 * A refusal that won't change on a retry (signed out, the role or the club
 * gone, the event deleted) takes the feed off the screen, so the door says
 * why instead of showing codes that stopped working, and lets the screen
 * sleep and take a new build. A 429 or a server error keeps the last feed
 * with "Reconnecting…": its codes stay valid for up to a minute.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DOOR_POLL_MS,
  doorStepNow,
  secondsLeft as secondsLeftUntil,
  type DoorFeed,
  type DoorResponse,
  type DoorStep,
} from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";

/**
 * After a refusal (a 429, or a 4xx such as a hidden club or a lost role) the
 * answer won't change in 10 s: ask again in a minute, so a screen left open
 * on a refusal doesn't spend the officer's door budget.
 */
const REFUSED_RETRY_MS = 60_000;

/**
 * Before the window opens and after it closes, codes can't appear and only
 * an officer's marks can still move the count, so a door left open (a
 * desktop tab overnight) reads once a minute instead of every 10 s. The
 * screen's own tick flips it to the Start button or "Check-in has ended" on
 * time either way; the read only refreshes the data.
 */
const IDLE_POLL_MS = 60_000;

/** A 4xx a retry won't change. 408 and 429 are "try later", not "no". */
function isFinalRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** How long until the next read after a good answer, by the server's clock. */
function pollWait(feed: DoorFeed | null, skewMs: number): number {
  if (!feed) return DOOR_POLL_MS;
  const now = Date.now() + skewMs;
  const opensAt = Date.parse(feed.opens_at);
  if (now > Date.parse(feed.closes_at)) return IDLE_POLL_MS;
  // Before: read again right as the window opens (another officer may start
  // check-in then), but never more often than the open window's pace.
  if (now < opensAt) return Math.min(IDLE_POLL_MS, Math.max(DOOR_POLL_MS, opensAt - now));
  return DOOR_POLL_MS;
}

export type DoorBusy = "start" | "stop" | null;

export type DoorFeedState = {
  feed: DoorFeed | null;
  /** The last read failed (the feed, if any, is the last good one). */
  failed: boolean;
  /** The refusal's `code` when the last read failed, e.g. "org_hidden". */
  failCode: string | null;
  /** The step to show now: `current` until it ends, then `next`, then null. */
  step: DoorStep | null;
  secondsLeft: number;
  /** The server's "now" in ms (0 before the first answer). */
  serverNowMs: number;
  busy: DoorBusy;
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  reload: () => void;
};

const isStr = (v: unknown): v is string => typeof v === "string";

function asStep(v: unknown): DoorStep | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  if (!isStr(s.code) || !isStr(s.link) || !isStr(s.starts_at) || !isStr(s.ends_at)) return null;
  return { code: s.code, link: s.link, starts_at: s.starts_at, ends_at: s.ends_at };
}

/** The answer's `door`, or null when it isn't one (a stale build, a proxy page). */
function asFeed(data: Partial<DoorResponse> | undefined): DoorFeed | null {
  const d = data?.door as unknown;
  if (!d || typeof d !== "object") return null;
  const f = d as Record<string, unknown>;
  if (!isStr(f.event_id) || typeof f.open !== "boolean") return null;
  if (!isStr(f.opens_at) || !isStr(f.closes_at) || !isStr(f.server_now)) return null;
  const count = typeof f.count === "number" && Number.isFinite(f.count) ? Math.max(0, Math.trunc(f.count)) : 0;
  return {
    event_id: f.event_id,
    open: f.open,
    opens_at: f.opens_at,
    closes_at: f.closes_at,
    server_now: f.server_now,
    current: asStep(f.current),
    next: asStep(f.next),
    count,
  };
}

type Shown = { feed: DoorFeed | null; skewMs: number; failed: boolean; failCode: string | null };

const EMPTY: Shown = { feed: null, skewMs: 0, failed: false, failCode: null };

export function useDoorFeed(eventId: string, enabled: boolean): DoorFeedState {
  const [shown, setShown] = useState<Shown>(EMPTY);
  /** The device clock at the last tick or answer (0 until the first). */
  const [deviceNow, setDeviceNow] = useState(0);
  const [busy, setBusy] = useState<DoorBusy>(null);

  // Read by the timers and callbacks, never during render.
  const feedRef = useRef<DoorFeed | null>(null);
  const skewRef = useRef(0);
  /** Every request takes a number; an answer older than one already shown is dropped. */
  const seqRef = useRef(0);
  const appliedRef = useRef(0);
  const readingRef = useRef(false);
  /** Start or Stop is out: no read may start until its answer is on screen. */
  const actingRef = useRef(false);
  const activeRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The `current` step a refill was already asked for, so one boundary asks once. */
  const refillForRef = useRef<string | null>(null);
  /** The latest `read`, for the poll timer that `read` itself books. */
  const readRef = useRef<() => Promise<void>>(async () => {});

  const base = `/api/events/${encodeURIComponent(eventId)}/checkin/door`;

  /** Puts an answer on screen unless a newer one is already there. */
  const apply = useCallback((seq: number, feed: DoorFeed) => {
    if (seq < appliedRef.current) return;
    appliedRef.current = seq;
    const serverMs = Date.parse(feed.server_now);
    const device = Date.now();
    const skewMs = Number.isFinite(serverMs) ? serverMs - device : 0;
    feedRef.current = feed;
    skewRef.current = skewMs;
    setShown({ feed, skewMs, failed: false, failCode: null });
    setDeviceNow(device);
  }, []);

  const clearPoll = useCallback(() => {
    if (pollRef.current !== null) clearTimeout(pollRef.current);
    pollRef.current = null;
  }, []);

  /**
   * Books the next read. It clears any booked one first, so a read and an
   * action finishing close together leave exactly one timer, never two
   * chains of polls. Nothing is booked while the page is out of view.
   */
  const book = useCallback(
    (wait: number) => {
      clearPoll();
      if (!activeRef.current || document.visibilityState !== "visible") return;
      pollRef.current = setTimeout(() => void readRef.current(), wait);
    },
    [clearPoll],
  );

  const read = useCallback(async (): Promise<void> => {
    if (!activeRef.current || readingRef.current || actingRef.current) return;
    readingRef.current = true;
    clearPoll();
    const seq = ++seqRef.current;
    const r = await vibeRequest<DoorResponse>(base, {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load check-in.",
    });
    readingRef.current = false;
    if (!activeRef.current) return;
    const feed = r.ok ? asFeed(r.data) : null;
    if (feed) {
      apply(seq, feed);
    } else if (seq >= appliedRef.current) {
      const failCode = r.ok ? null : r.code;
      if (!r.ok && isFinalRefusal(r.status)) {
        // The codes on screen no longer work for this officer: take them
        // down so the door shows the refusal's own line, and mark this
        // answer applied so an older read still out can't put them back.
        appliedRef.current = seq;
        feedRef.current = null;
        setShown({ feed: null, skewMs: 0, failed: true, failCode });
      } else {
        // Keep the last good feed: its codes stay valid for up to a minute.
        setShown((s) => ({ ...s, failed: true, failCode }));
      }
    }
    // An action sent while this read was out books the next read itself.
    if (actingRef.current) return;
    const refused = !r.ok && r.status >= 400 && r.status < 500;
    book(refused ? REFUSED_RETRY_MS : pollWait(feedRef.current, skewRef.current));
  }, [apply, base, book, clearPoll]);

  useEffect(() => {
    readRef.current = read;
  }, [read]);

  // Reads: on mount, on a return to the page, and (booked by each read or
  // action) every DOOR_POLL_MS while the page is in view, once a minute
  // outside the window or after a refusal.
  useEffect(() => {
    if (!enabled) return;
    activeRef.current = true;
    const run = async () => {
      await read();
    };
    void run();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void read();
      else clearPoll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      activeRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      clearPoll();
      // A read still out keeps going: if the screen mounts again (React's
      // development double mount does exactly this) its answer is the first
      // feed, and if it doesn't, `activeRef` drops it.
    };
  }, [enabled, read, clearPoll]);

  // The one-second tick, lined up on the server's whole seconds. When the
  // feed's `current` step has ended (the screen now shows `next`), it asks
  // for a fresh feed once, so the step after that is ready in time.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      const device = Date.now();
      setDeviceNow(device);
      const cur = feedRef.current?.current;
      if (cur && device + skewRef.current >= Date.parse(cur.ends_at) && refillForRef.current !== cur.starts_at) {
        refillForRef.current = cur.starts_at;
        void read();
      }
      const wait = 1000 - ((((device + skewRef.current) % 1000) + 1000) % 1000) + 20;
      timer = setTimeout(tick, wait);
    };
    timer = setTimeout(tick, 0);
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [enabled, read]);

  const act = useCallback(
    async (kind: "start" | "stop"): Promise<boolean> => {
      // A ref, not the `busy` state: two taps inside one frame must not both send.
      if (actingRef.current) return false;
      actingRef.current = true;
      // The poll waits for the action (see the header): its answer is newer
      // than anything a read could bring back while it is out.
      clearPoll();
      setBusy(kind);
      const seq = ++seqRef.current;
      const r = await vibeRequest<DoorResponse>(base, {
        method: kind === "start" ? "POST" : "DELETE",
        failure: kind === "start" ? "Couldn't start check-in." : "Couldn't stop check-in.",
      });
      actingRef.current = false;
      setBusy(null);
      if (!activeRef.current) return false;
      const feed = r.ok ? asFeed(r.data) : null;
      if (feed) {
        apply(seq, feed);
        book(pollWait(feed, skewRef.current));
        return true;
      }
      // Refused (the toast says why): read again so the screen shows what is
      // true. That read books the poll; if one is still out, it does.
      void read();
      return false;
    },
    [apply, base, book, clearPoll, read],
  );

  const start = useCallback(() => act("start"), [act]);
  const stop = useCallback(() => act("stop"), [act]);
  const reload = useCallback(() => {
    void read();
  }, [read]);

  if (!enabled) {
    return { ...EMPTY, step: null, secondsLeft: 0, serverNowMs: 0, busy: null, start, stop, reload };
  }
  const { feed, skewMs } = shown;
  const step = feed && deviceNow > 0 ? doorStepNow(feed, deviceNow, skewMs) : null;
  return {
    feed,
    failed: shown.failed,
    failCode: shown.failCode,
    step,
    secondsLeft: step ? secondsLeftUntil(step.ends_at, deviceNow, skewMs) : 0,
    serverNowMs: feed && deviceNow > 0 ? deviceNow + skewMs : 0,
    busy,
    start,
    stop,
    reload,
  };
}
