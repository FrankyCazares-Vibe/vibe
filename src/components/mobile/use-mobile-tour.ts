"use client";

import { useEffect } from "react";

import { campusRowById } from "@/lib/iu/campuses";

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
 *   campus   → CampusMobile  (tabs → feed → composer FAB)
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

type TourStep = {
  selector: string;
  title: string;
  body: string;
  endLabel?: string;
  nextLabel?: string;
};

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

/** Feed bubble body. `campus` is a `shortName` from the static campus table. */
export function campusFeedBody(campus: string | null): string {
  return campus
    ? `What students at ${campus} are posting. People and clubs you follow rise to the top.`
    : "What students on your campus are posting. People and clubs you follow rise to the top.";
}

/**
 * The campus leg's bubbles. The engine renders `title` / `body` as HTML, so
 * the campus name only ever comes from `campusRowById(...).shortName` (our
 * own table), never from the URL or a server string.
 */
export function campusTourSteps(campus: string | null): TourStep[] {
  return [
    {
      selector: "#otto-mobile-tour-tabs",
      title: "Everything's one swipe away.",
      body: "Feed, Events, Orgs, Chat, and the Map. Swipe or tap to switch.",
    },
    {
      selector: "#otto-mobile-tour-feed",
      title: "The campus feed.",
      body: campusFeedBody(campus),
    },
    {
      selector: "#otto-mobile-tour-compose",
      title: "Your turn.",
      body: "Tap + to post text, photos, or video.",
      endLabel: "Got it",
    },
  ];
}

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
export type TourStartInput = {
  leg: Leg;
  /** `localStorage.vibe_tour_pending`; null when unset or storage failed. */
  pending: string | null;
  /** This leg's seen key is "1"; false when unset or storage failed. */
  seen: boolean;
  /** `?welcome=1` is on the URL. */
  welcome: boolean;
};

/**
 * What the hook does on mount:
 * - "start": the pending flag names this leg, or it's the campus leg on
 *   `?welcome=1` and the student hasn't seen it.
 * - "strip": campus leg on `?welcome=1` that was already seen, with no
 *   pending flag for it: drop the param so a refresh stays quiet.
 * - "none": nothing to do.
 */
export function tourStartDecision(i: TourStartInput): "start" | "strip" | "none" {
  if (i.pending === i.leg) return "start";
  if (i.leg !== "campus" || !i.welcome) return "none";
  return i.seen ? "strip" : "start";
}

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
    if (decision === "strip") {
      stripWelcomeParam();
      return;
    }
    if (decision !== "start") return;

    // If a tour is already running (e.g., the desktop effect briefly
    // mounted before the viewport-switch swapped to the mobile tree),
    // bail rather than stacking two engines.
    if (window.OttoTour?.isRunning?.()) return;

    const MAX_POLL_MS = 8000;
    const POLL_INTERVAL_MS = 250;
    const startedAt = Date.now();
    const aborter = new AbortController();

    void loadTourScript()
      .then(async () => {
        if (cancelled) return;
        // Campus leg: resolve the campus name (≤1.5 s) before starting, so
        // the feed bubble can say where the posts come from.
        const steps =
          leg === "campus"
            ? campusTourSteps(await loadCampusShortName(aborter.signal))
            : STEPS_BY_LEG[leg];
        if (cancelled) return;
        // Wait for the first target to render. ProfileMobile / CampusMobile
        // do their own data fetches and mount the anchored elements only
        // after data arrives, so we poll until the target exists or we
        // hit a max so we don't spin forever on a busted route.
        const start = () => {
          if (cancelled || !window.OttoTour) return;
          const firstSel = steps[0]?.selector;
          if (firstSel && !document.querySelector(firstSel)) {
            if (Date.now() - startedAt > MAX_POLL_MS) {
              // Restore the flag so a refresh / next visit can retry.
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
          window.OttoTour.start(steps, {
            onDone: () => handleDone(leg, "done"),
            onSkip: () => handleDone(leg, "skip"),
          });
        };
        setTimeout(start, POLL_INTERVAL_MS);
      })
      .catch(() => {
        /* network error — silent fail; user can try again from Settings */
      });

    return () => {
      cancelled = true;
      aborter.abort();
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
