/**
 * The door to the computer's Club tools panel (ClubToolsDrawer.tsx), for the
 * cover's Club tools button (OfficerActions.tsx): with a panel on the page
 * and a window 900px wide or more, the button opens it instead of going to
 * the Club tools page. Anywhere else (a phone, a narrow window, outside the
 * app frame) the button stays a link. One panel per page.
 */

/** The panel's widths: the app frame's, where its left menu shows. */
export const DRAWER_QUERY = "(min-width: 900px)";

type Opener = (from: HTMLElement | null) => void;

let opener: Opener | null = null;

export function registerClubToolsDrawer(open: Opener): () => void {
  opener = open;
  return () => {
    if (opener === open) opener = null;
  };
}

/** Opens the panel and answers true, or answers false when there is none to open here. */
export function openClubToolsDrawer(from: HTMLElement | null): boolean {
  if (!opener || typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (!window.matchMedia(DRAWER_QUERY).matches) return false;
  opener(from);
  return true;
}
