/**
 * The Campus bar on a club page, its pure pieces (Oct 22, 2026, Franky's
 * pick A on the canvas, "The top of a club page on a computer"; plan
 * handoffs/2026-10-22-club-tools-arc/PLAN-5.md B1). The bar itself is
 * ClubCampusBar.tsx: Campus's own top bar with Orgs lit. This file is where
 * its tab pills and its Campuses picker go.
 *
 * Every address is a Campus tab, `/campus?tab=<tab>`; Orgs is the clubs list
 * the old "Return to Organizations" went back to. Reached while visiting
 * another campus (the page's `visitedCampusId`), each one keeps
 * `campus=<id>`, the way the page's `backHref` does, so Campus opens on the
 * campus the student was browsing. Home never carries `campus`: Campus reads
 * the bare address as home (viewing-campus.ts).
 *
 * PURE ON PURPOSE: no imports, so `club-campus-bar.test.ts` loads it under
 * plain `node --test`. The tab names restate campus-home.tsx's `CampusTab`
 * for the same reason; keep the two the same.
 */

/** Campus's tabs, in the bar's order (campus-home.tsx `TABS`). */
export type ClubCampusTab = "feed" | "events" | "orgs" | "chat" | "map";

export const CLUB_CAMPUS_TABS: readonly ClubCampusTab[] = Object.freeze([
  "feed",
  "events",
  "orgs",
  "chat",
  "map",
]);

/** Where a tab pill of the club page's Campus bar goes. */
export function clubCampusTabHref(tab: ClubCampusTab, visitedCampusId: string | null): string {
  // A tab this list doesn't know (nothing sends one) lands on the clubs list.
  const params = new URLSearchParams({ tab: CLUB_CAMPUS_TABS.includes(tab) ? tab : "orgs" });
  if (visitedCampusId) params.set("campus", visitedCampusId);
  return `/campus?${params.toString()}`;
}

/**
 * Where picking a campus in the bar's Campuses picker goes: that campus's
 * Orgs list. Picking home goes to home's, with no `campus`, the way Campus's
 * own picker drops it (`setViewing`). Both ids come in canonical
 * (`canonicalCampusId`), null when unknown, so a plain compare is enough;
 * with home not known yet, any campus picked is kept.
 */
export function clubCampusPickHref(pickedId: string | null, homeId: string | null): string {
  const visiting = pickedId && pickedId !== homeId ? pickedId : null;
  return clubCampusTabHref("orgs", visiting);
}
