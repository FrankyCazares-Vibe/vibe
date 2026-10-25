/**
 * The phone onboarding's door to Otto's wormhole (`public/html/_otto-wormhole.js`,
 * Oct 25 2026), the same file the computer's static onboarding page loads:
 * Otto's arrival on step 1 and the leave for the app on Finish. Loaded on
 * demand like the tour engine; a script that fails or takes too long answers
 * null, and the page goes on without the effect.
 *
 * No imports, so node tests load it under plain type stripping.
 */

export type WormholeArrive = {
  anchor: Element | null;
  bg?: string;
  onReveal?: () => void;
  onDone?: () => void;
};

export type WormholeDepart = {
  anchor: Element | null;
  collapse?: (Element | null)[];
  color?: string;
  onDone?: () => void;
};

export type OttoWormhole = {
  arrive: (opts: WormholeArrive) => void;
  depart: (opts: WormholeDepart) => void;
};

declare global {
  interface Window {
    OttoWormhole?: OttoWormhole;
  }
}

export const WORMHOLE_SRC = "/html/_otto-wormhole.js";

let loading: Promise<OttoWormhole | null> | null = null;

/** The wormhole, or null when its script can't load within `timeoutMs`. Never rejects. */
export function loadWormhole(timeoutMs = 1500): Promise<OttoWormhole | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.OttoWormhole) return Promise.resolve(window.OttoWormhole);
  if (!loading) {
    loading = new Promise<OttoWormhole | null>((resolve) => {
      const s = document.createElement("script");
      s.src = WORMHOLE_SRC;
      s.async = true;
      s.onload = () => resolve(window.OttoWormhole ?? null);
      s.onerror = () => {
        loading = null; // a later call may try again
        resolve(null);
      };
      document.head.appendChild(s);
    });
  }
  const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([loading, timeout]);
}

/**
 * The app's page colour (Campus) in the theme on screen: what the screen
 * turns into on the way out (globals.css `--cream`, Light and Night).
 */
export function appColour(theme: string | null | undefined): string {
  return theme === "dark" ? "#0C0B0B" : "#FAF7F2";
}
