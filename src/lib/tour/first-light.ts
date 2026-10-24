/**
 * First light (Franky, Oct 24 2026): a newcomer's first Campus visit arrives
 * with only Otto. As the tour goes, Otto brings the page into being, one
 * part per bubble: the feed bursts in, then the left side (Your clubs, each
 * club's Board), then the right (Tonight: school and club events). On a
 * phone: the feed, then the Tonight card. Plan: handoffs/2026-10-23-
 * onboarding-review/PLAN.md "Deploy B" and critique.md fixes 1-3, 9.
 *
 * HOW IT HOLDS. `FIRST_LIGHT_BOOT_SCRIPT` runs before the first paint (in
 * the root layout, beside the theme script, with the request's nonce): on
 * /campus, when the campus tour is about to run, it sets
 * `<html data-first-light="feed clubs tonight">`. globals.css hides each
 * listed part with `visibility: hidden`, which keeps its space (the feed
 * never moves, the tour can still measure it) and makes it unclickable and
 * unfocusable. Decided before paint because the computer's Campus page is
 * built on the server, which can't read the tour's flag in localStorage.
 *
 * HOW IT GROWS. `light(part)` drops the part from the attribute and gives
 * its elements `.first-light-burst` (a scale-and-fade on the springs; fade
 * only with reduced motion). The tour calls it from each step's `onShow`.
 *
 * WAYS OUT, each lights everything: Done, Skip, the tour script failing, a
 * tour that isn't running within `FIRST_LIGHT_CEILING_MS`, a tab change, a
 * visit where no tour starts. Nothing is stored: the hold is worked out on
 * every load from the tour's own flag, so the Privacy Policy is unchanged.
 *
 * A CLIENT-SIDE ARRIVAL (tapping Campus inside the app, as a club-link guest
 * does after their club page) never reruns the boot script, so CampusHome
 * and CampusMobile call `holdOnClientArrival()` from a layout effect, which
 * runs before the browser paints, with the same rule.
 *
 * OFF SWITCH: `FIRST_LIGHT=off` in the environment drops the boot script and
 * the `data-first-light-on` mark on <html> (src/app/layout.tsx), so nothing
 * is ever held; `light()` is then a no-op.
 *
 * No imports, so node tests load it under plain type stripping.
 */

export const FIRST_LIGHT_ATTR = "data-first-light";

/** On <html> while the switch is on, for the client-side hold. */
export const FIRST_LIGHT_ON_ATTR = "data-first-light-on";

export type FirstLightPart = "feed" | "clubs" | "tonight";

/** In the order the tour brings them in. */
export const FIRST_LIGHT_PARTS: readonly FirstLightPart[] = ["feed", "clubs", "tonight"];

/**
 * What each part holds, computer and phone. globals.css hides the same
 * selectors (first-light.test.ts checks the two lists match).
 */
export const FIRST_LIGHT_TARGETS: Readonly<Record<FirstLightPart, readonly string[]>> = {
  feed: [".tonight-feed-main", "#otto-mobile-tour-feed"],
  clubs: [".tonight-feed-left", ".tonight-feed-right .tonight-fold"],
  tonight: [".tonight-feed-right .tonight-panel-aside", "#otto-mobile-tour-feed .tonight-card"],
};

/** The class that plays the burst; removed when it ends. */
export const FIRST_LIGHT_BURST_CLASS = "first-light-burst";

/** A held page whose tour isn't running by then shows everything. */
export const FIRST_LIGHT_CEILING_MS = 4000;

/**
 * The last resort, armed outside React by whatever sets the hold (the boot
 * script, holdOnClientArrival): a page held this long with no tour on screen
 * shows everything, whatever React did or didn't mount (a computer page
 * guessed for a narrow screen returns before arming its own ceiling).
 */
export const FIRST_LIGHT_LAST_RESORT_MS = 5000;

/**
 * Pre-paint, plain ES5 (it runs before anything else on the page). The same
 * start rule as `tourStartDecision` for the campus leg: the pending flag says
 * "campus", or `?welcome=1` on a browser that hasn't seen the tour.
 */
export const FIRST_LIGHT_BOOT_SCRIPT =
  "(function(){try{" +
  'if(location.pathname!=="/campus")return;' +
  "var p=null,s=false;" +
  'try{p=localStorage.getItem("vibe_tour_pending");s=localStorage.getItem("vibe_campus_tour_seen_v1")==="1"}catch(e){}' +
  'var w=/(^|[?&])welcome=1(&|$)/.test(location.search);' +
  'if(!(p==="campus"||(w&&!s)))return;' +
  "var d=document.documentElement;" +
  `d.setAttribute(${JSON.stringify(FIRST_LIGHT_ATTR)},${JSON.stringify(FIRST_LIGHT_PARTS.join(" "))});` +
  // The last resort (see FIRST_LIGHT_LAST_RESORT_MS).
  "setTimeout(function(){var t=window.OttoTour;" +
  `if(!(t&&t.isRunning&&t.isRunning()))d.removeAttribute(${JSON.stringify(FIRST_LIGHT_ATTR)})},${FIRST_LIGHT_LAST_RESORT_MS})` +
  "}catch(e){}})();";

/**
 * The boot script's rule, for code that runs later: hold on /campus when the
 * tour's flag says "campus", or on `?welcome=1` where it wasn't seen.
 * first-light.test.ts checks the two agree.
 */
export function shouldHold(path: string, search: string, pending: string | null, seen: boolean): boolean {
  if (path !== "/campus") return false;
  const welcome = /(^|[?&])welcome=1(&|$)/.test(search);
  return pending === "campus" || (welcome && !seen);
}

/**
 * The hold for an arrival without a page load. Call it from a layout effect
 * (before the paint). Never re-holds a page that is mid-reveal or whose tour
 * is already on screen, and does nothing with the switch off.
 */
export function holdOnClientArrival(): void {
  const html = root();
  if (!html || typeof window === "undefined") return;
  if (gaveUp || !html.hasAttribute(FIRST_LIGHT_ON_ATTR) || html.hasAttribute(FIRST_LIGHT_ATTR)) return;
  if (tourRunning()) return;
  let pending: string | null = null;
  let seen = false;
  try {
    pending = window.localStorage.getItem("vibe_tour_pending");
    seen = window.localStorage.getItem("vibe_campus_tour_seen_v1") === "1";
  } catch {
    return;
  }
  if (shouldHold(window.location.pathname, window.location.search, pending, seen)) {
    html.setAttribute(FIRST_LIGHT_ATTR, FIRST_LIGHT_PARTS.join(" "));
    // The last resort, outside React, as the boot script arms it.
    window.setTimeout(() => {
      if (!tourRunning()) lightAll();
    }, FIRST_LIGHT_LAST_RESORT_MS);
  }
}

function tourRunning(): boolean {
  if (typeof window === "undefined") return false;
  const tour = (window as { OttoTour?: { isRunning?: () => boolean } }).OttoTour;
  return tour?.isRunning?.() === true;
}

/**
 * Set when a ceiling found no tour running: this page doesn't hold again
 * (a tour that can't start would otherwise blank every in-app arrival).
 */
let gaveUp = false;

/** The parts still held, as the attribute lists them. */
export function heldParts(value: string | null): FirstLightPart[] {
  if (!value) return [];
  const words = value.split(/\s+/);
  return FIRST_LIGHT_PARTS.filter((p) => words.includes(p));
}

/** The attribute after `part` comes in, or null when nothing is left held. */
export function afterLighting(value: string | null, part: FirstLightPart): string | null {
  const rest = heldParts(value).filter((p) => p !== part);
  return rest.length ? rest.join(" ") : null;
}

function root(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

/** The page arrived held and some part is still waiting. */
export function firstLightHeld(): boolean {
  const html = root();
  return !!html && heldParts(html.getAttribute(FIRST_LIGHT_ATTR)).length > 0;
}

/** Brings one part into being. A no-op when it isn't held (or the switch is off). */
export function light(part: FirstLightPart): void {
  const html = root();
  if (!html) return;
  const value = html.getAttribute(FIRST_LIGHT_ATTR);
  if (!heldParts(value).includes(part)) return;
  // The burst first, in the same task: its first frame (fill "backwards")
  // is already transparent when the hold lifts, so nothing flashes.
  for (const selector of FIRST_LIGHT_TARGETS[part]) {
    document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      // Not drawn at this width (display:none): no burst, or the class would
      // wait there and play the day a resize shows it.
      if (el.getClientRects().length === 0) return;
      el.classList.remove(FIRST_LIGHT_BURST_CLASS);
      void el.offsetWidth; // restart the animation if it was mid-way
      el.classList.add(FIRST_LIGHT_BURST_CLASS);
      const clear = () => {
        el.classList.remove(FIRST_LIGHT_BURST_CLASS);
        el.removeEventListener("animationend", done);
      };
      const done = (e: AnimationEvent) => {
        if (e.target === el && e.animationName === "first-light-pop") clear();
      };
      el.addEventListener("animationend", done);
      // In case the end never comes (the element left the page mid-burst).
      window.setTimeout(clear, BURST_CLEAR_MS);
    });
  }
  const next = afterLighting(value, part);
  if (next) html.setAttribute(FIRST_LIGHT_ATTR, next);
  else html.removeAttribute(FIRST_LIGHT_ATTR);
}

/** Past the burst's longest run (600ms), when its class is dropped regardless. */
const BURST_CLEAR_MS = 1200;

/** Everything still held comes in at once (the ways out). */
export function lightAll(): void {
  const html = root();
  if (!html) return;
  for (const part of heldParts(html.getAttribute(FIRST_LIGHT_ATTR))) light(part);
  html.removeAttribute(FIRST_LIGHT_ATTR);
}

/**
 * The ceiling: unless `running()` is true by `ms`, everything comes in.
 * Returns a cancel for the caller's cleanup.
 */
export function lightAllUnlessRunning(running: () => boolean, ms = FIRST_LIGHT_CEILING_MS): () => void {
  if (typeof window === "undefined") return () => {};
  const timer = window.setTimeout(() => {
    if (running()) return;
    gaveUp = true;
    lightAll();
  }, ms);
  return () => window.clearTimeout(timer);
}

/**
 * A visit that won't start a tour shows everything, unless a tour is already
 * on screen (a remount mid-tour, like a phone turned across 900px and back,
 * must not bring the rest in ahead of its bubbles).
 */
export function lightAllUnlessTourRunning(): void {
  if (!tourRunning()) lightAll();
}
