/**
 * The browser half of the use totals (rules: ./touch.ts). Browser only:
 * every function here reads `window` or `document` when it runs, never when
 * the file loads, so a server render that imports it is unharmed.
 *
 * Two things leave from here, both to POST /api/me/heartbeat:
 *   - `touchActivity()`: "Vibe is open on my screen", at most once every
 *     four minutes per tab. <ActivityTouch /> calls it on every page.
 *   - `countOpen("otto" | "map")`: the person has just opened Otto or the
 *     map, at most once every ten minutes per feature per tab. It checks in
 *     as well.
 * Each body is the device kind, worked out here from the screen alone, and
 * the open when there is one. The browser's own name and details are never
 * read here and never put in a body. Signed out, nothing leaves: only the
 * sign-in cookie's name is looked at, never its value.
 *
 * The gaps live in sessionStorage, so they are per tab, shared with the
 * static profile's twin (public/html/_usageTouch.js), and gone when the tab
 * closes. Where storage is blocked, a note in memory stands in for this page.
 */

import { isStandalone } from "@/lib/pwa/display-mode";
import { carriesSignInCookie } from "@/lib/tally/open";

import {
  COARSE_QUERY,
  deviceClass,
  OPEN_AT_KEY_PREFIX,
  OPEN_EVERY_MS,
  PHONE_QUERY,
  TOUCH_AT_KEY,
  TOUCH_EVERY_MS,
  TOUCH_PATH,
  touchBody,
  touchDue,
  type UsageDevice,
  type UsageOpen,
} from "./touch";

/** Stands in for sessionStorage where merely touching it throws. */
const memory = new Map<string, number>();

/** The request on its way, if any: a second caller waits on it instead of sending another. */
let inFlight: Promise<void> | null = null;

function stamp(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const at = Number(raw);
  return Number.isFinite(at) && at > 0 ? at : null;
}

/** The later of what storage and memory hold for `key`, or null for neither. */
function readAt(key: string): number | null {
  let stored: number | null = null;
  try {
    stored = stamp(window.sessionStorage.getItem(key));
  } catch {
    stored = null;
  }
  const kept = memory.get(key) ?? null;
  if (stored === null) return kept;
  return kept === null ? stored : Math.max(stored, kept);
}

function writeAt(key: string, at: number): void {
  memory.set(key, at);
  try {
    window.sessionStorage.setItem(key, String(at));
  } catch {
    /* blocked or full: the note in memory holds the gap for this page */
  }
}

function matches(query: string): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

/** This screen's kind, from media queries and the display mode only. */
export function currentDevice(): UsageDevice {
  const nav = navigator as Navigator & { standalone?: unknown };
  return deviceClass({
    standalone: isStandalone({
      navigatorStandalone: nav.standalone,
      matchStandalone: matches("(display-mode: standalone)"),
      matchFullscreen: matches("(display-mode: fullscreen)"),
    }),
    coarsePointer: matches(COARSE_QUERY),
    narrow: matches(PHONE_QUERY),
  });
}

/** Signed in, by the sign-in cookie's name. Checked every time: sign-in needs no reload. */
function signedIn(): boolean {
  try {
    return carriesSignInCookie(document.cookie);
  } catch {
    return false;
  }
}

/** On screen: a page in a background tab is not "open on your screen". */
function onScreen(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "visible";
}

/** Posts one body. Never throws and never rejects: a missed check-in is retried by the next one. */
function send(body: string): Promise<void> {
  return fetch(TOUCH_PATH, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body,
  }).then(
    () => undefined,
    () => undefined,
  );
}

function track(request: Promise<void>): Promise<void> {
  const mine = request.finally(() => {
    if (inFlight === mine) inFlight = null;
  });
  inFlight = mine;
  return mine;
}

/**
 * "Vibe is open on my screen." Sends when this tab is signed in, on screen
 * and has not checked in for four minutes; otherwise does nothing. The
 * stamp is written before the request leaves, so two callers in the same
 * moment send one. Resolves when the request in flight (this one, or one
 * already on its way) has answered, so a caller can read "active now"
 * after it and find the person in it.
 */
export function touchActivity(): Promise<void> {
  if (inFlight) return inFlight;
  if (!onScreen() || !signedIn()) return Promise.resolve();
  const now = Date.now();
  if (!touchDue(now, readAt(TOUCH_AT_KEY), TOUCH_EVERY_MS)) return Promise.resolve();
  writeAt(TOUCH_AT_KEY, now);
  return track(send(touchBody(currentDevice())));
}

/**
 * The person has just opened Otto or the map. Counted at most once every
 * ten minutes per feature per tab; the open is a check-in too, so it stamps
 * the four-minute gap as well. The database stops a day's opens at ten per
 * active person, so this gap is the polite half, not the only lock.
 */
export function countOpen(what: UsageOpen): void {
  if (!onScreen() || !signedIn()) return;
  const key = OPEN_AT_KEY_PREFIX + what;
  const now = Date.now();
  if (!touchDue(now, readAt(key), OPEN_EVERY_MS)) return;
  writeAt(key, now);
  writeAt(TOUCH_AT_KEY, now);
  const request = send(touchBody(currentDevice(), what));
  if (!inFlight) void track(request);
}
