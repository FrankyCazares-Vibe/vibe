/**
 * "This club's events changed" on the club page (the club's view, wave 2).
 *
 * The Up next card and the Events tab read one list (ClubEventsProvider).
 * Their own cards and "+ Create event" refresh it directly; a writer
 * elsewhere on the page that can't reach the provider (the + sheet's New
 * event) fires this, and the provider reads the list again. A same-window
 * event only: another tab has its own page and its own read.
 *
 * No React, no imports: safe from any client file.
 */

export const CLUB_EVENTS_CHANGED_EVENT = "vibe:club-events-changed";

export type ClubEventsChangedDetail = { orgId: string };

export function announceClubEventsChanged(orgId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<ClubEventsChangedDetail>(CLUB_EVENTS_CHANGED_EVENT, { detail: { orgId } }),
    );
  } catch {
    // An old browser without CustomEvent: the list catches up on the next visit.
  }
}
