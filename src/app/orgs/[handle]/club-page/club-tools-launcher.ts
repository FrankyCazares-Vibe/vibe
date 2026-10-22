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

/**
 * Edit page, opened from the tools panel's "Edit the page" (Oct 22, 2026;
 * ClubToolsPanel.tsx): the panel closes and the cover's Edit page dialog
 * opens straight away. Not through `?edit=1`: EditPageButton (OfficerActions
 * .tsx) takes that from the address once per page, so a second one would
 * open nothing. The button registers itself; one per page.
 */
let editOpener: (() => void) | null = null;

export function registerEditPageOpener(open: () => void): () => void {
  editOpener = open;
  return () => {
    if (editOpener === open) editOpener = null;
  };
}

/** Opens Edit page and answers true, or answers false when there is none on this page. */
export function openEditPage(): boolean {
  if (!editOpener) return false;
  editOpener();
  return true;
}
