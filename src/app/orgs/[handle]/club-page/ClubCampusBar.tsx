"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  CampusTopBar,
  type CampusView,
  CampusViewContext,
  useViewerCampus,
} from "@/app/campus/campus-home";
import { CampusBrowsePicker } from "@/components/campus/CampusBrowsePicker";
import {
  canonicalCampusId,
  isOpenCampus,
  isVisitingCampus,
  withCampus,
} from "@/components/campus/viewing-campus";
import { vibeRequest } from "@/lib/feedback/request";
import { campusRowById } from "@/lib/iu/campuses";

import { clubCampusPickHref, clubCampusTabHref } from "./club-campus-bar";

/**
 * Campus's own top bar at the top of a club page on a computer (Oct 22,
 * 2026, Franky's pick A, "the Campus bar"; plan
 * handoffs/2026-10-22-club-tools-arc/PLAN-5.md B1). It is CampusTopBar
 * itself, drawn exactly as Campus draws it: the campus name, Campuses, the
 * search, the seam and the tab pills, with Orgs lit, because a club is one
 * of the campus's Orgs.
 *
 * What changes is where things go. A tab pill leaves for that Campus tab
 * (`/campus?tab=<tab>`), and Orgs goes back to the clubs list. Campuses opens
 * the same "Look around." picker; picking a campus opens its Orgs list, home
 * without `campus`. Search is Campus's search, unchanged.
 *
 * The page passes `visitedCampusId` when it was reached while visiting
 * another campus (page.tsx, the same id its Back keeps). The bar then shows
 * THAT campus in the visiting look, its tabs keep `campus=<id>`, and Map
 * hides when that campus isn't open, as on Campus. `hideChat` is the
 * `chat_desktop` switch (chatDesktopFor), as on Campus.
 *
 * The bar provides the campus on screen to itself only (CampusViewContext,
 * built the way CampusHome builds it), so the club page's own event cards
 * keep reading the default view. At home it is provided too, so a stray
 * `?campus=` on the club's address can never repaint the bar.
 *
 * Mounted only in the app frame (signed in, on a computer). The wrapper's
 * class is the CSS's (globals.css): hidden by default, shown from 900px in
 * the frame. Under 900px the page keeps its own top, "Return to
 * Organizations".
 */
export function ClubCampusBar({
  visitedCampusId,
  hideChat,
}: {
  visitedCampusId: string | null;
  hideChat: boolean;
}) {
  const router = useRouter();
  const viewerCampus = useViewerCampus();
  const homeId = canonicalCampusId(viewerCampus.campusId);
  // The campus on screen: the one being visited, else home. Until home is
  // known a visited campus reads as visiting, the same safe direction as
  // Campus (viewing-campus.ts).
  const viewingId = canonicalCampusId(visitedCampusId) ?? homeId;
  const isVisiting = isVisitingCampus(viewingId, homeId);
  const campusView = useMemo<CampusView>(
    () => ({
      provided: true,
      viewingId,
      homeId,
      isVisiting,
      label: isVisiting ? (campusRowById(viewingId)?.name ?? null) : viewerCampus.label,
      url: (path: string) => withCampus(path, viewingId, homeId),
    }),
    [viewingId, homeId, isVisiting, viewerCampus.label],
  );
  // A campus that isn't open has only a handful of students, and its map
  // would name them by major (R3): no Map pill while visiting one.
  const hideMap = isVisiting && !isOpenCampus(viewingId);
  // The campus the tabs keep: the visited one, never home.
  const tabCampusId = isVisiting ? viewingId : null;

  const [browseOpen, setBrowseOpen] = useState(false);
  // The picker's home row says when the 45-day lock lifts. The profile
  // bootstrap carries that date; read it once, the first time the picker
  // opens. Quiet: on a failure the row just says "Home". (CampusHome's own
  // read, copied: the club page has no CampusHome.)
  const [homeLockAt, setHomeLockAt] = useState<string | null>(null);
  const homeLockAskedRef = useRef(false);
  useEffect(() => {
    if (!browseOpen || homeLockAskedRef.current) return;
    homeLockAskedRef.current = true;
    void vibeRequest<{ campusChangeAvailableAt?: unknown }>("/api/me/profile-bootstrap", {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't load your campus.",
    }).then((r) => {
      if (r.ok && typeof r.data.campusChangeAvailableAt === "string") {
        setHomeLockAt(r.data.campusChangeAvailableAt);
      }
    });
  }, [browseOpen]);

  return (
    <div className="vibe-club-campusbar">
      <CampusViewContext.Provider value={campusView}>
        <CampusTopBar
          active="orgs"
          onTabChange={(tab) => router.push(clubCampusTabHref(tab, tabCampusId))}
          hideMap={hideMap}
          hideChat={hideChat}
          onOpenCampuses={() => setBrowseOpen(true)}
        />
        {/* "Look around.": every campus, grouped Shared · IU · Purdue.
            Picking one opens its Orgs list; picking home drops `campus`,
            as Campus's own picker does. */}
        <CampusBrowsePicker
          variant="modal"
          open={browseOpen}
          homeId={homeId}
          viewingId={viewingId}
          homeChangeAvailableAt={homeLockAt}
          onPick={(id) => {
            setBrowseOpen(false);
            router.push(clubCampusPickHref(canonicalCampusId(id), homeId));
          }}
          onClose={() => setBrowseOpen(false)}
        />
      </CampusViewContext.Provider>
    </div>
  );
}
