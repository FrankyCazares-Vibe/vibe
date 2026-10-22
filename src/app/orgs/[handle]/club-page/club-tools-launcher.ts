/**
 * The door to the computer's Club tools launcher, the Arc
 * (ClubToolsLauncher.tsx; Oct 22, 2026, it replaces the slide-out panel and
 * its `club-tools-drawer.ts`), for the cover's Club tools button
 * (OfficerActions.tsx): with a launcher on the page and a window 900px wide
 * or more, the button brings the arc out instead of going to the Club tools
 * page. Anywhere else (a phone, a narrow window, outside the app frame) the
 * button stays a link. One launcher per page.
 */

/** The launcher's widths: the app frame's, where its left menu shows. Narrower, it closes. */
export const LAUNCHER_QUERY = "(min-width: 900px)";

type Opener = (from: HTMLElement | null) => void;

let opener: Opener | null = null;

export function registerClubToolsLauncher(open: Opener): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

/** Brings the arc out and answers true, or answers false when there is none to open here. */
export function openClubToolsLauncher(from: HTMLElement | null): boolean {
  if (!opener || typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (!window.matchMedia(LAUNCHER_QUERY).matches) return false;
  opener(from);
  return true;
}
