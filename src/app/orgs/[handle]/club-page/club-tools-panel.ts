/**
 * Club tools open in place (Oct 22, 2026; handoffs/2026-10-22-club-tools-arc
 * PLAN-2.md, T1). Franky, after the Arc shipped: a card's "Open Join
 * requests" sent him to a whole other page, then "Club tools", then the club,
 * to get back. He wanted it to open where he was, "like how Otto does it",
 * "the planet orb expands and turns into that". So on a computer the planet
 * grows into a panel that springs in from the right edge, full height, with
 * the same screens the phone's Club tools pages show (ClubToolsPanel.tsx);
 * the arc folds into the planet while it is out. Phones keep the pages.
 *
 * This file is the panel's pure half: which screen is up and where ← goes,
 * the words at the top of each screen, how wide the panel is, and the
 * planet's bloom (the circle that scales out from the planet's centre to
 * cover the panel, then fades; ← plays it backwards).
 *
 * PURE ON PURPOSE, as club-tools-arc.ts: no imports but types, so
 * `club-tools-panel.test.ts` loads it under plain `node --test`.
 */
import type { ArcToolId } from "./club-tools-arc";

/** The screens the panel holds: the phone's Club tools pages, and the setup list (the members' link). */
export type PanelScreen = "index" | "requests" | "members" | "officers" | "followers" | "settings" | "setup";

/** One screen; the setup list can open at its members' link (what `/setup#members-link` does on a phone). */
export type PanelEntry = { screen: PanelScreen; step?: "members_link" };

/**
 * The screens on the panel, the one showing last. `from` is the arc's card
 * that opened it: ← from the first screen closes the panel and brings that
 * card back, so the officer is where they were.
 */
export type PanelState = { stack: readonly PanelEntry[]; from: ArcToolId | null };

/** About Otto's panel and a little wider; the window always keeps 280px of the page beside it. */
export const PANEL = Object.freeze({ width: 560, keepLeft: 280 });

export function panelWidth(windowWidth: number): number {
  return Math.max(0, Math.round(Math.min(PANEL.width, windowWidth - PANEL.keepLeft)));
}

const sameEntry = (a: PanelEntry, b: PanelEntry) => a.screen === b.screen && (a.step ?? null) === (b.step ?? null);

/** The screen showing. */
export function panelTop(state: PanelState): PanelEntry {
  return state.stack[state.stack.length - 1] ?? { screen: "index" };
}

/**
 * A card opens the panel at a screen; a row of All Club tools opens the next
 * screen on top of it, so ← comes back to the list. The screen already
 * showing, asked again (a double click), changes nothing.
 */
export function openPanelAt(state: PanelState | null, entry: PanelEntry, from: ArcToolId | null): PanelState {
  if (!state || state.stack.length === 0) return { stack: [entry], from };
  if (sameEntry(panelTop(state), entry)) return state;
  return { stack: [...state.stack, entry], from: state.from };
}

/** ← : the screen under this one, or null when this was the first (back to the arc). */
export function panelBack(state: PanelState): PanelState | null {
  if (state.stack.length <= 1) return null;
  return { stack: state.stack.slice(0, -1), from: state.from };
}

/** What a screen's heading and grey line say (the phone pages' words). */
export function panelHeading(entry: PanelEntry, hasSetupList: boolean): { title: string; sub: string | null } {
  switch (entry.screen) {
    case "index":
      return { title: "All Club tools", sub: "Only officers see this" };
    case "requests":
      return { title: "Join requests", sub: "Approve or deny each one" };
    case "members":
      return { title: "Members", sub: "Tap someone for their title and more" };
    case "officers":
      return { title: "Officers and titles", sub: null };
    case "followers":
      return { title: "Followers", sub: null };
    case "settings":
      return { title: "Club settings", sub: null };
    case "setup":
      // A club no setup link made has no list: the screen is its members' link alone.
      return hasSetupList ? { title: "Club setup", sub: "Get it ready for members" } : { title: "Members' link", sub: null };
  }
}

/** Where ← goes, said on the button: the screen under this one, else the arc ("Club tools"). */
export function panelBackLabel(state: PanelState, hasSetupList: boolean): string {
  if (state.stack.length <= 1) return "Club tools";
  return panelHeading(state.stack[state.stack.length - 2], hasSetupList).title;
}

/** A screen's key, for swapping one for another. */
export function panelKey(entry: PanelEntry): string {
  return entry.step ? `${entry.screen}:${entry.step}` : entry.screen;
}

// ── The bloom ─────────────────────────────────────────────────────────────

export type PanelBloom = {
  /** What the bloom is clipped to: the panel's place in the window, full height. */
  clip: { left: number; width: number; height: number };
  /** The circle in the clip box: its top-left corner and its diameter. */
  left: number;
  top: number;
  size: number;
  /** Its scale when it is the open planet's size: where it grows from, and shrinks back to. */
  from: number;
};

/**
 * The planet's gradient circle, centred on the open planet (`hub`), just big
 * enough to reach the panel's farthest corner. It is drawn at that full size
 * and scaled down to the planet (`from`), so it is sharp when it is biggest.
 */
export function panelBloom(
  windowWidth: number,
  windowHeight: number,
  hub: { x: number; y: number },
  planetSize: number,
): PanelBloom {
  const width = panelWidth(windowWidth);
  const left = windowWidth - width;
  const dx = Math.max(hub.x - left, windowWidth - hub.x);
  const dy = Math.max(hub.y, windowHeight - hub.y);
  // A couple of pixels over, so rounding never leaves a corner uncovered.
  const r = Math.ceil(Math.hypot(dx, dy)) + 2;
  const size = 2 * r;
  return {
    clip: { left, width, height: Math.max(0, Math.round(windowHeight)) },
    left: Math.round(hub.x - left - r),
    top: Math.round(hub.y - r),
    size,
    from: size > 0 ? Math.min(1, Math.round((planetSize / size) * 10000) / 10000) : 1,
  };
}
