/**
 * The campus tour's bubbles, computer and phone (first run, Oct 24 2026;
 * handoffs/2026-10-23-onboarding-review/PLAN.md beats 9-12 and 14). Franky's
 * order (his words, Oct 24 evening): Otto first, then the feed, then the
 * left side (Your clubs, each club's Board), then the right (Tonight, school
 * and club events). With first light (./first-light.ts) the page arrives
 * with only Otto and each bubble brings its part in, through `onShow`. It
 * shows instead of asking: no photo ask, no post ask, and nothing that
 * sounds like the Otto agent ("threads the right matches").
 *
 * The engine (`public/html/_otto-tour.js`) renders `title` and `body` as
 * HTML. The only outside words that go in are the campus short name from our
 * own table (`campusRowById(...).shortName`), escaped here anyway; never a
 * club name, the URL or a server string.
 *
 * Computer: `campusTourSteps(campus, hasSize)` drops every step whose target
 * has no size before the tour starts (a missing target floats the bubble in
 * mid-screen), and picks where "Your clubs" is: the left column at 1400px and
 * up, the folded strip above Tonight at 1100-1399px when it has clubs in it,
 * otherwise the tabs. The tour ends on Tonight ("Got it"); where Tonight
 * isn't on screen (under 1100px) it ends on clubs, and "Show me clubs" opens
 * the Orgs tab.
 *
 * Type-only import, so node tests load it under plain type stripping.
 */

import type { FirstLightPart } from "./first-light";

export type CampusTourStep = {
  selector: string;
  title: string;
  body: string;
  endLabel?: string;
  nextLabel?: string;
  /** Runs once as the bubble opens: brings this step's part of the page in. */
  onShow?: () => void;
};

/** Brings a held part of the page in (first-light's `light`); a no-op stand-in by default. */
export type LightPart = (part: FirstLightPart) => void;
const noLight: LightPart = () => {};

/** What each computer bubble points at. */
export const CAMPUS_TOUR_TARGETS = {
  /** The Otto orb, bottom right (OttoCorner.tsx). Fixed, so nothing scrolls. */
  otto: "#otto-corner",
  /**
   * The feed's first screen (its heading, the strip and the composer), not
   * the whole `#campus-feed` column: the engine centres its target, and the
   * whole column would scroll the page away from the side columns.
   */
  feed: "#campus-feed-top",
  /** The Tonight panel itself, not the right column (which also holds the folded clubs strip). */
  tonight: ".tonight-feed-right .tonight-panel",
  /** Your clubs, 1400px and up: the left column's tray. */
  clubsPanel: ".tonight-feed-left .tonight-tray",
  /** Your clubs, 1100-1399px: the folded strip, drawn only once it has clubs. */
  clubsFold: ".tonight-feed-right .tonight-fold",
  /** Everything else: the Feed / Events / Orgs / Map pills. */
  tabs: "#campus-tabs",
} as const;

/** The computer tour's last button; Done then opens the Orgs tab. */
export const SHOW_ME_CLUBS = "Show me clubs";

/** The left side's loading rows: while they're up, the folded strip can't have drawn yet. */
export const CLUBS_LOADING_SELECTOR = ".tonight-feed-left .tonight-clubs-loading";

const accent = (word: string) => `<span class="accent">${word}</span>`;

/** Plain text for the bubble's HTML. */
export function escapeTourText(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/** The campus short name, escaped, or null when there isn't one. */
function campusName(campus: string | null): string | null {
  const name = typeof campus === "string" ? campus.trim() : "";
  return name ? escapeTourText(name) : null;
}

/** "Hi again. I'm Otto." Both devices; the body says where he lives. */
export const OTTO_TITLE = `Hi again. I'm ${accent("Otto")}.`;

/** The feed bubble, the same words on both devices. */
export function feedBubble(campus: string | null): { title: string; body: string } {
  const name = campusName(campus);
  return {
    title: `This is ${name ?? "your campus"}, ${accent("live")}.`,
    body: "What students and clubs here are posting. Clubs and people you follow come first.",
  };
}

/**
 * The computer tour, in order, with every step whose target has no size
 * dropped. `hasSize(selector)` answers whether that element is on the page
 * with a width and a height (the caller measures; tests pass a stand-in).
 */
export function campusTourSteps(
  campus: string | null,
  hasSize: (selector: string) => boolean,
  light: LightPart = noLight,
): CampusTourStep[] {
  const name = campusName(campus);
  const T = CAMPUS_TOUR_TARGETS;
  const clubsAt = [T.clubsPanel, T.clubsFold].find((s) => hasSize(s));
  const steps: CampusTourStep[] = [
    {
      selector: T.otto,
      title: OTTO_TITLE,
      body: "I live down here. Click me for what's new and your messages.",
    },
    { selector: T.feed, ...feedBubble(campus), onShow: () => light("feed") },
    clubsAt
      ? {
          selector: clubsAt,
          title: `Your ${accent("clubs")}.`,
          body: "Every club you follow or join posts its newest Board update here.",
          onShow: () => light("clubs"),
        }
      : {
          selector: T.tabs,
          title: `Find your ${accent("clubs")}.`,
          body: `Orgs has every club ${name ? `at ${name}` : "on your campus"}. Follow one and its updates come to you.`,
          onShow: () => light("clubs"),
        },
    {
      selector: T.tonight,
      title: `What's on ${accent("tonight")}.`,
      body: `School and club events ${name ? `at ${name}` : "on your campus"}, tonight and this week.`,
      onShow: () => light("tonight"),
    },
  ];
  const kept = steps.filter((s) => hasSize(s.selector));
  const last = kept[kept.length - 1];
  if (last) {
    const onClubs = last.selector === T.tabs || last.selector === T.clubsPanel || last.selector === T.clubsFold;
    kept[kept.length - 1] = { ...last, endLabel: onClubs ? SHOW_ME_CLUBS : "Got it" };
  }
  return kept;
}

/** True when the tour ends on clubs, so Done opens the Orgs tab. */
export function endsOnClubs(steps: readonly CampusTourStep[]): boolean {
  return steps.length > 0 && steps[steps.length - 1]?.endLabel === SHOW_ME_CLUBS;
}

/** The phone's Tonight card, inside the feed (null while loading or with nothing on). */
export const PHONE_TONIGHT_TARGET = "#otto-mobile-tour-feed .tonight-card";

/**
 * The phone tour (no floating Otto on phones): the Otto tab, the feed, the
 * Tonight card when there is one, then the tabs. With first light the feed
 * and the card each come in as their bubble opens. The dead Chat tab and the
 * "Your turn… post" ask are gone. `hasSize` drops any step with nothing to
 * point at (by default nothing is dropped).
 */
export function phoneCampusTourSteps(
  campus: string | null,
  hasSize: (selector: string) => boolean = () => true,
  light: LightPart = noLight,
): CampusTourStep[] {
  const name = campusName(campus);
  const steps: CampusTourStep[] = [
    {
      selector: "#otto-mobile-tour-network-otto",
      title: OTTO_TITLE,
      body: "That's me down here, the otto tab: what's coming up and what's new for you. Messages is right next door.",
    },
    { selector: "#otto-mobile-tour-feed", ...feedBubble(campus), onShow: () => light("feed") },
    {
      selector: PHONE_TONIGHT_TARGET,
      title: `What's on ${accent("tonight")}.`,
      body: `School and club events ${name ? `at ${name}` : "on your campus"}, tonight and this week.`,
      onShow: () => light("tonight"),
    },
    {
      selector: "#otto-mobile-tour-tabs",
      title: `Clubs and events, ${accent("one swipe over")}.`,
      body: "Feed, Events, Orgs and Map. Orgs has every club on campus.",
      endLabel: "Got it",
    },
  ];
  // Any step whose target isn't drawn is dropped, as on the computer: the
  // Tonight card when nothing is on, and the Otto tab when the tab bar is
  // hidden (an open dialog hides it), so no bubble points at nothing.
  return steps.filter((s) => hasSize(s.selector));
}

// ── On the page (computer) ─────────────────────────────────────────────────

/** The element is on the page with a width and a height (what the engine can spotlight). */
export function targetHasSize(selector: string): boolean {
  if (typeof document === "undefined") return false;
  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    return false;
  }
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Resolves once `check()` is true, or after `ms` whatever it says. Never rejects. */
export function waitUntil(check: () => boolean, ms: number, every = 100): Promise<void> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      let done = false;
      try {
        done = check();
      } catch {
        done = false;
      }
      if (done || Date.now() - startedAt >= ms) resolve();
      else setTimeout(tick, every);
    };
    tick();
  });
}

// ── Start rule (both devices) ──────────────────────────────────────────────

export type TourLeg = "profile" | "campus" | "network";

export type TourStartInput = {
  leg: TourLeg;
  /** `localStorage.vibe_tour_pending`; null when unset or storage failed. */
  pending: string | null;
  /** This leg's seen key is "1"; false when unset or storage failed. */
  seen: boolean;
  /** `?welcome=1` is on the URL. */
  welcome: boolean;
};

/**
 * Whether a tour starts on this visit, the same rule on the phone and the
 * computer:
 * - "start": the pending flag names this leg (whatever "seen" says, so the
 *   second person to finish onboarding on a shared laptop still gets it), or
 *   it's the campus leg on `?welcome=1` and this browser hasn't seen it.
 * - "strip": campus leg on `?welcome=1` that was already seen, with no
 *   pending flag for it: drop the param so a refresh stays quiet.
 * - "none": nothing to do.
 */
export function tourStartDecision(i: TourStartInput): "start" | "strip" | "none" {
  if (i.pending === i.leg) return "start";
  if (i.leg !== "campus" || !i.welcome) return "none";
  return i.seen ? "strip" : "start";
}
