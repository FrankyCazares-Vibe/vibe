"use client";

import { useEffect } from "react";

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
 * Each leg hands off to the next via the same `vibe_tour_pending`
 * localStorage flag the desktop tour uses, so Settings → Replay tour
 * still works as the entry point.
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

const PENDING_KEY = "vibe_tour_pending";
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
    body: "How everyone finds you and gets the gist. Posts, clips, and your portfolio live just below.",
  },
  {
    selector: "#otto-mobile-tour-actions",
    title: "Search and edit.",
    body: "The pencil opens edit mode for your whole profile. The magnifying glass searches people and orgs on campus.",
    endLabel: "Next: campus →",
  },
];

const CAMPUS_STEPS: TourStep[] = [
  {
    selector: "#otto-mobile-tour-tabs",
    title: "Swipe between everything.",
    body: "Feed, Clips, Events, Orgs, Chat, and the campus Map all live here. Swipe or tap to switch.",
  },
  {
    selector: "#otto-mobile-tour-feed",
    title: "Your feed.",
    body: "Posts from people you follow, ranked by who's actually engaging — friends' reposts get a boost.",
  },
  {
    selector: "#otto-mobile-tour-compose",
    title: "Post or record a clip.",
    body: "The + opens the composer. Posts for text and photos, clips for short videos.",
    endLabel: "Next: network →",
  },
];

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
  campus: { next: "network", dest: "/network" },
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

// ── Hook ───────────────────────────────────────────────────────────────────
/**
 * Mount this in a mobile route component. When the matching
 * `vibe_tour_pending` flag is set, the spotlight fires after the
 * targets have rendered. Caller is responsible for the underlying
 * elements existing — see `STEPS_BY_LEG` selectors.
 *
 * Safe to mount unconditionally; the hook is a no-op when no flag is
 * present or the flag doesn't match this leg.
 */
export function useMobileTour(leg: Leg) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    let pending: string | null = null;
    try {
      pending = localStorage.getItem(PENDING_KEY);
    } catch {
      return;
    }
    if (pending !== leg) return;

    // Clear the flag immediately so a refresh mid-tour doesn't double-fire.
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* non-fatal */
    }

    void loadTourScript()
      .then(() => {
        if (cancelled) return;
        // Wait one more frame + a small delay so React has flushed
        // the layout and our targets exist with sane dimensions.
        const start = () => {
          if (cancelled || !window.OttoTour) return;
          // Verify the first target actually exists. If not, retry once
          // — content sometimes mounts a beat after initial paint.
          const firstSel = STEPS_BY_LEG[leg][0]?.selector;
          if (firstSel && !document.querySelector(firstSel)) {
            setTimeout(start, 300);
            return;
          }
          window.OttoTour.start(STEPS_BY_LEG[leg], {
            onDone: () => handleDone(leg, "done"),
            onSkip: () => handleDone(leg, "skip"),
          });
        };
        setTimeout(start, 250);
      })
      .catch(() => {
        /* network error — silent fail; user can try again from Settings */
      });

    return () => {
      cancelled = true;
    };
  }, [leg]);
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
