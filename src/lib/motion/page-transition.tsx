"use client";

import { ViewTransition, type ReactNode } from "react";

/**
 * Page moves inside the app (motion 1, Nov 12, 2026; Franky: "when clicking
 * from tab to tab it glides / slides / smoothens over to the next thing").
 *
 * React's <ViewTransition> + the browser's View Transitions API: a route
 * change in Next is a transition, so the page content wrapped below slides
 * and fades on its own. A tab tap carries a direction (the Link's
 * `transitionTypes`, from `navTransitionTypes`): a tab to the right slides
 * the new page in from the right, one to the left from the left. Any other
 * move (a link in the page, Back) is a short fade with a small rise. The
 * nav, the tab bar and the Otto corner stay put (`StayPut`). The CSS is
 * src/lib/motion/view-transitions.css; reduce motion turns it all off there,
 * and a browser without view transitions just changes the page.
 */

/** Transition types a tab Link adds (Link `transitionTypes`). */
export const NAV_FORWARD = "vibe-nav-forward";
export const NAV_BACK = "vibe-nav-back";

/** The tab Link's types for a move from the lit tab `from` to tab `to` in
 *  one bar's own order. None when nothing is lit or it's the same tab. */
export function navTransitionTypes(from: number, to: number): string[] | undefined {
  if (from < 0 || to < 0 || from === to) return undefined;
  return [to > from ? NAV_FORWARD : NAV_BACK];
}

const SLIDE = {
  [NAV_FORWARD]: "vibe-vt-forward",
  [NAV_BACK]: "vibe-vt-back",
  default: "vibe-vt-fade",
};

/**
 * Wrap a shell's page content (not its nav). Plays only when the content
 * mounts or unmounts in a navigation, never on updates inside the page.
 * Named, so the old page and the new one pair as one move ("share"); an
 * unnamed boundary here never played its enter or exit under Next's router
 * (checked in the browser, Nov 12, 2026). One shell is on screen at a time,
 * so the name is never doubled; if it were, the browser skips the move and
 * the page just changes.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition name="vibe-page" share={SLIDE} enter={SLIDE} exit={SLIDE} default="none">
      {children}
    </ViewTransition>
  );
}

/**
 * A persistent part of the frame (left menu, tab bar, Otto corner). Each page
 * draws its own, so in a navigation the old and new copies pair by `name`
 * and the pair is drawn above the moving pages with no animation of its own
 * (`.vibe-vt-stay`): it doesn't move, and the sliding page never covers it.
 * Its insides stay live, so the marker's glide shows through.
 */
export function StayPut({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="vibe-vt-stay" default="none">
      {children}
    </ViewTransition>
  );
}
