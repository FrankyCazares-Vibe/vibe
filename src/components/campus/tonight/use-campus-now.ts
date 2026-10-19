"use client";

/**
 * The clock the Tonight surfaces read (Oct 19 2026): "now" in ms, re-read
 * every `stepMs` and when the tab comes back into view, so "Up next" turns
 * into "Happening now" on its own.
 *
 * WHY 0 FIRST. The server can't know the viewer's moment, and the page has
 * to hydrate to exactly what the server sent, so the hook answers 0 on the
 * server and during hydration (the useSyncExternalStore server snapshot) and
 * the real time right after. Callers treat 0 as "not yet" and draw nothing
 * time-based, so there is never a hydration mismatch.
 *
 * ONE TICKER PER STEP. Every card and panel that asks for the minute shares
 * one timer, aligned to the step's boundary (a minute tick lands on :00, when
 * events start), instead of each component running its own.
 *
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §5.4.
 */
import { useSyncExternalStore } from "react";

const DEFAULT_STEP_MS = 60_000;
/** A step below a second would only burn the battery: nothing here prints seconds. */
const MIN_STEP_MS = 1_000;

/**
 * Development only: `?tonight_now=2026-10-22T18:00:00Z` fakes the campus
 * clock (and useSchoolEvents sends it to the server as `now`), so the
 * browser pass can stand at a set moment against the fixtures. Null in
 * production, on the server, and for a missing or bad value.
 */
export function devNowOverride(): number | null {
  if (process.env.NODE_ENV !== "development") return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = new URLSearchParams(window.location.search).get("tonight_now");
    if (!raw) return null;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

/**
 * The faked clock keeps running from the moment it was set, so a dev page
 * left open still ticks. Remembered per query string, so changing the URL's
 * `tonight_now` sets it again.
 */
let devOffset: { search: string; offset: number } | null = null;

function readNow(): number {
  const real = Date.now();
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") return real;
  const search = window.location.search;
  if (!devOffset || devOffset.search !== search) {
    const fake = devNowOverride();
    devOffset = { search, offset: fake === null ? 0 : fake - real };
  }
  return real + devOffset.offset;
}

type Ticker = {
  stepMs: number;
  listeners: Set<() => void>;
  /** The answer every reader gets until the next tick: React needs the same value between ticks. */
  value: number;
  /** Real time of the last read, to know when a stopped ticker's value is stale. */
  readAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
};

const tickers = new Map<number, Ticker>();
let watchingVisibility = false;

function refresh(t: Ticker): void {
  t.value = readNow();
  t.readAt = Date.now();
}

/**
 * The value is from an earlier step window (or was never read). Ticks land
 * on window boundaries, so within one window every reader shares one value
 * and a component mounting mid-window doesn't force its siblings to redraw.
 */
function stale(t: Ticker): boolean {
  return t.value === 0 || Math.floor(t.readAt / t.stepMs) !== Math.floor(Date.now() / t.stepMs);
}

/** Next tick on the step's boundary (plus a hair, so the boundary minute has begun). */
function schedule(t: Ticker): void {
  if (t.timer !== null) clearTimeout(t.timer);
  const wait = t.stepMs - (Date.now() % t.stepMs) + 50;
  t.timer = setTimeout(() => {
    t.timer = null;
    refresh(t);
    for (const fn of t.listeners) fn();
    if (t.listeners.size > 0) schedule(t);
  }, wait);
}

/** Back in view: background tabs throttle timers, so every running ticker re-reads now. */
function onVisibility(): void {
  if (document.visibilityState !== "visible") return;
  for (const t of tickers.values()) {
    if (t.listeners.size === 0) continue;
    refresh(t);
    for (const fn of t.listeners) fn();
    schedule(t);
  }
}

function syncVisibilityListener(): void {
  const anyRunning = [...tickers.values()].some((t) => t.listeners.size > 0);
  if (anyRunning && !watchingVisibility) {
    document.addEventListener("visibilitychange", onVisibility);
    watchingVisibility = true;
  } else if (!anyRunning && watchingVisibility) {
    document.removeEventListener("visibilitychange", onVisibility);
    watchingVisibility = false;
  }
}

function tickerFor(stepMs: number): Ticker {
  const existing = tickers.get(stepMs);
  if (existing) return existing;
  const t: Ticker = {
    stepMs,
    listeners: new Set(),
    value: 0,
    readAt: 0,
    timer: null,
    // Made once per step, so React sees the same subscribe function every render.
    subscribe: (onChange) => {
      t.listeners.add(onChange);
      if (t.listeners.size === 1) {
        if (stale(t)) refresh(t);
        schedule(t);
      }
      syncVisibilityListener();
      return () => {
        t.listeners.delete(onChange);
        if (t.listeners.size === 0 && t.timer !== null) {
          clearTimeout(t.timer);
          t.timer = null;
        }
        syncVisibilityListener();
      };
    },
    getSnapshot: () => {
      // A stopped ticker (nobody listening) or a throttled timer can leave an
      // old value: re-read it here, once per window, so nobody starts late.
      if (stale(t)) refresh(t);
      return t.value;
    },
  };
  tickers.set(stepMs, t);
  return t;
}

function serverSnapshot(): number {
  return 0;
}

/**
 * "Now" in ms: 0 on the server and while hydrating, then the real time
 * (plus the dev offset), re-read every `stepMs` (default a minute) and when
 * the tab comes back into view.
 */
export function useCampusNow(stepMs: number = DEFAULT_STEP_MS): number {
  const step = Number.isFinite(stepMs) ? Math.max(MIN_STEP_MS, Math.round(stepMs)) : DEFAULT_STEP_MS;
  const t = tickerFor(step);
  return useSyncExternalStore(t.subscribe, t.getSnapshot, serverSnapshot);
}
