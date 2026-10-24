"use client";

import { useEffect } from "react";

import { campusRowById } from "@/lib/iu/campuses";
import {
  PHONE_CLUBS_TARGET,
  PHONE_TONIGHT_TARGET,
  phoneCampusTourSteps,
  targetHasSize,
  tourStartDecision,
  type CampusTourStep,
} from "@/lib/tour/campus-tour-steps";
import { light, lightAll, lightAllUnlessRunning, lightAllUnlessTourRunning } from "@/lib/tour/first-light";

/**
 * Hook that runs the Otto spotlight tour on mobile surfaces.
 *
 * Reuses the existing vanilla-JS engine at `public/html/_otto-tour.js`
 * (also used by desktop campus + network + the static profile page).
 * On mount, it loads the script, checks `localStorage.vibe_tour_pending`,
 * and if it matches this surface's leg name, fires the spotlight after a
 * short delay so React layout has time to settle.
 *
 * Legs:
 *   profile  → ProfileMobile (cover → identity → actions)
 *   campus   → CampusMobile  (the Otto tab → feed → tabs; first run, Oct 24
 *              2026, the bubbles in src/lib/tour/campus-tour-steps.ts)
 *   network  → NetworkMobile (tabs → otto tab in bottom bar)
 *
 * Settings → Replay tour sets `vibe_tour_pending=profile`; the profile leg
 * hands off to campus through the same flag the desktop tour uses. The
 * campus leg is where the phone tour ENDS ("Got it", no navigation): the
 * network leg still runs when its own pending flag is set, but nothing
 * hands off to it any more (wave plan B14t).
 *
 * The campus leg also starts on `/campus?welcome=1` (where onboarding
 * lands) when its seen key isn't set, so a fresh student gets it without
 * a pending flag.
 */

// The `window.OttoTour` global is also declared by `campus-home.tsx` and
// `NetworkPageClient.tsx`. The shape must stay in sync across all three
// declarations — TypeScript's structural check rejects diverging shapes.
declare global {
  interface Window {
    OttoTour?: {
      start: (
        steps: Array<{
          selector: string;
          title: string;
          body: string;
          endLabel?: string;
          nextLabel?: string;
          onShow?: () => void;
        }>,
        options?: {
          onDone?: () => void;
          onSkip?: () => void;
        },
      ) => void;
      isRunning: () => boolean;
    };
  }
}

type TourStep = CampusTourStep;

const SCRIPT_SRC = "/html/_otto-tour.js";

export const PENDING_KEY = "vibe_tour_pending";
const SEEN_KEYS = {
  profile: "vibe_profile_tour_seen_v1",
  campus: "vibe_campus_tour_seen_v1",
  network: "vibe_network_tour_seen_v1",
} as const;

type Leg = keyof typeof SEEN_KEYS;

// ── Step content ────────────────────────────────────────────────────────────
const PROFILE_STEPS: TourStep[] = [
  {
    selector: "#otto-mobile-tour-cover",
    title: "This is you.",
    body: "Your cover and avatar set the tone. In edit mode you can swap either in a tap.",
  },
  {
    selector: "#otto-mobile-tour-identity",
    title: "Name, handle, bio.",
    body: "How everyone finds you and gets the gist. Your posts and portfolio live just below.",
  },
  {
    selector: "#otto-mobile-tour-actions",
    title: "Search and edit.",
    body: "The pencil opens edit mode for your whole profile. The magnifying glass searches people and orgs on campus.",
    endLabel: "Next: campus →",
  },
];

/**
 * The campus leg's bubbles: the Otto tab, the feed, the tabs (no floating
 * Otto on phones; the dead Chat tab and the post ask are gone). The engine
 * renders `title` / `body` as HTML, so the campus name only ever comes from
 * `campusRowById(...).shortName` (our own table), never from the URL or a
 * server string, and is escaped on the way in.
 */
export const campusTourSteps = phoneCampusTourSteps;

const CAMPUS_STEPS: TourStep[] = campusTourSteps(null);

const NETWORK_STEPS: TourStep[] = [
  {
    selector: "#otto-mobile-tour-network-tabs",
    title: "Your people.",
    body: "Connections you've made, requests waiting on you, and folks worth meeting next.",
  },
  {
    selector: "#otto-mobile-tour-network-otto",
    title: "Otto's always around.",
    body: "Tap the Otto tab any time. He knows your campus, your saved events, and who you've been talking to.",
    endLabel: "Got it",
  },
];

const STEPS_BY_LEG: Record<Leg, TourStep[]> = {
  profile: PROFILE_STEPS,
  campus: CAMPUS_STEPS,
  network: NETWORK_STEPS,
};

// Where this leg hands off (or null = done).
const HANDOFFS: Record<Leg, { next: Leg | null; dest: string | null }> = {
  profile: { next: "campus", dest: "/campus" },
  campus: { next: null, dest: null },
  network: { next: null, dest: null },
};

// ── Script loader ──────────────────────────────────────────────────────────
let scriptPromise: Promise<void> | null = null;
function loadTourScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.OttoTour) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("otto-tour script failed to load")),
      );
      // If it already finished:
      if (window.OttoTour) resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("otto-tour script failed to load"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

// ── Start rule ─────────────────────────────────────────────────────────────
// The same rule as the computer's (src/lib/tour/campus-tour-steps.ts):
// "start" when the pending flag names this leg, or on the campus leg's
// `?welcome=1` when it hasn't been seen; "strip" drops a seen `?welcome=1`.
export { tourStartDecision };

/** How long the campus leg waits for the campus name before using the fallback. */
const CAMPUS_NAME_TIMEOUT_MS = 1500;

/**
 * The student's campus `shortName` for the feed bubble, or null on any
 * failure (timeout, non-2xx, bad body, unknown id). Never read from the URL.
 */
async function loadCampusShortName(signal: AbortSignal): Promise<string | null> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (signal.aborted) return null;
  signal.addEventListener("abort", abort);
  const timer = setTimeout(abort, CAMPUS_NAME_TIMEOUT_MS);
  try {
    const res = await fetch("/api/me/onboarding-state", {
      cache: "no-store",
      credentials: "same-origin",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { campus_id?: unknown } | null;
    const id = typeof j?.campus_id === "string" ? j.campus_id : null;
    return campusRowById(id)?.shortName ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────
/**
 * Mount this in a mobile route component. When the matching
 * `vibe_tour_pending` flag is set (or, for the campus leg, `?welcome=1`
 * on a first visit), the spotlight fires after the targets have rendered.
 * Caller is responsible for the underlying elements existing — see
 * `STEPS_BY_LEG` selectors.
 *
 * Safe to mount unconditionally; the hook is a no-op when nothing asks for
 * this leg.
 */
export function useMobileTour(leg: Leg) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    // A storage failure reads as "no flag, not seen", so `?welcome=1` can
    // still start the campus leg.
    let pending: string | null = null;
    let seen = false;
    try {
      pending = localStorage.getItem(PENDING_KEY);
      seen = localStorage.getItem(SEEN_KEYS[leg]) === "1";
    } catch {
      pending = null;
      seen = false;
    }
    let welcome = false;
    try {
      welcome = new URLSearchParams(window.location.search).get("welcome") === "1";
    } catch {
      welcome = false;
    }
    const decision = tourStartDecision({ leg, pending, seen, welcome });
    // First light (src/lib/tour/first-light.ts) holds the campus feed for the
    // tour; whenever this visit won't run it, everything comes in now.
    const campus = leg === "campus";
    if (decision === "strip") {
      stripWelcomeParam();
      if (campus) lightAllUnlessTourRunning();
      return;
    }
    if (decision !== "start") {
      if (campus) lightAllUnlessTourRunning();
      return;
    }

    // If a tour is already running (e.g., the desktop effect briefly
    // mounted before the viewport-switch swapped to the mobile tree),
    // bail rather than stacking two engines.
    if (window.OttoTour?.isRunning?.()) return;
    // ... and if this one isn't running within the ceiling, the page comes in anyway.
    const cancelCeiling = campus
      ? lightAllUnlessRunning(() => window.OttoTour?.isRunning?.() === true)
      : () => {};

    const MAX_POLL_MS = 8000;
    const POLL_INTERVAL_MS = 250;
    const startedAt = Date.now();
    const aborter = new AbortController();

    void loadTourScript()
      .then(async () => {
        if (cancelled) return;
        // Campus leg: resolve the campus name (≤1.5 s) before starting, so
        // the feed bubble can say where the posts come from.
        const campusName = campus ? await loadCampusShortName(aborter.signal) : null;
        if (cancelled) return;
        // The campus leg waits for every target it needs (its first, the Otto
        // tab, is in the tab bar on every page, before Campus has drawn its
        // own); the Tonight card is only there when something is on, and the
        // Your clubs band not when both its reads failed, so their steps are
        // kept or dropped when the tour starts. Other legs wait for their
        // first target, as before.
        const optional = [PHONE_TONIGHT_TARGET, PHONE_CLUBS_TARGET];
        const required = campus
          ? campusTourSteps(null).filter((s) => !optional.includes(s.selector))
          : STEPS_BY_LEG[leg].slice(0, 1);
        // Wait for the first target to render. ProfileMobile / CampusMobile
        // do their own data fetches and mount the anchored elements only
        // after data arrives, so we poll until the target exists or we
        // hit a max so we don't spin forever on a busted route.
        const start = () => {
          if (cancelled || !window.OttoTour) return;
          if (required.some((s) => !document.querySelector(s.selector))) {
            if (Date.now() - startedAt > MAX_POLL_MS) {
              // Restore the flag so a refresh / next visit can retry; the
              // page comes in now rather than wait for a tour that won't run.
              if (campus) lightAll();
              return;
            }
            setTimeout(start, POLL_INTERVAL_MS);
            return;
          }
          // Clear the pending flag NOW — right before starting — so a
          // failed start (target never appeared) keeps the flag for a
          // retry, but a successful start doesn't re-fire on refresh.
          // Only this leg's flag: a `?welcome=1` start leaves another
          // leg's flag alone.
          if (pending === leg) {
            try {
              localStorage.removeItem(PENDING_KEY);
            } catch {
              /* non-fatal */
            }
          }
          stripWelcomeParam();
          const steps = campus ? campusTourSteps(campusName, targetHasSize, light) : STEPS_BY_LEG[leg];
          if (!steps.length) {
            // Nothing drawn to point at: no tour this visit, and nothing held.
            if (campus) lightAll();
            return;
          }
          window.OttoTour.start(steps, {
            onDone: () => handleDone(leg, "done"),
            onSkip: () => handleDone(leg, "skip"),
          });
        };
        setTimeout(start, POLL_INTERVAL_MS);
      })
      .catch(() => {
        /* network error — silent fail; user can try again from Settings */
        if (campus) lightAll();
      });

    return () => {
      cancelled = true;
      aborter.abort();
      cancelCeiling();
    };
  }, [leg]);
}

/** Remove `?welcome=1` from the URL without a navigation, so a refresh
 *  during/after the tour doesn't re-trigger the desktop effects. */
function stripWelcomeParam() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("welcome")) return;
    url.searchParams.delete("welcome");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  } catch {
    /* non-fatal */
  }
}

function handleDone(leg: Leg, reason: "done" | "skip") {
  // Whatever first light still holds (a Tonight card that came late) comes in.
  if (leg === "campus") lightAll();
  try {
    localStorage.setItem(SEEN_KEYS[leg], "1");
  } catch {
    /* non-fatal */
  }
  // Skip = bail out of the whole multi-leg flow. Done = advance.
  if (reason === "skip") return;
  const handoff = HANDOFFS[leg];
  if (!handoff.next || !handoff.dest) return;
  try {
    localStorage.setItem(PENDING_KEY, handoff.next);
  } catch {
    /* non-fatal */
  }
  // Brief delay so the bubble teardown animation finishes.
  setTimeout(() => {
    window.location.assign(handoff.dest!);
  }, 280);
}
