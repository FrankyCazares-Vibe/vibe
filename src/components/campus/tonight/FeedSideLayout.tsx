"use client";

/**
 * The desktop Feed's three columns (C2, Oct 19 2026): "Your clubs" on the
 * left, the feed exactly centred, "What's the vibe tonight?" on the right.
 * campus-home's TabBody wraps the keyed FeedTabBody in this, so picking a
 * tag (which remounts FeedTabBody) never refetches or flashes the panels;
 * TabBody's campus key remounts this on a campus change. CONTRACT.md §6.1.
 *
 * The widths are CSS only (feed-side.css): 1400px and up, both panels;
 * 1100-1399, the clubs fold into a strip on top of the right column; under
 * 1100, the feed alone. So the three reads run at every width; the phone
 * never mounts this (it has CampusMobile).
 */
import { useEffect, useRef } from "react";

import { TonightPanel } from "./TonightPanel";
import { QuietBoundary } from "./QuietBoundary";
// After the panels (and so after tonight.css, which they bring in).
import "./feed-side.css";
import type { FeedSideLayoutProps } from "./types";
import { useClubEvents } from "./use-club-events";
import { useSchoolEvents } from "./use-school-events";
import { useYourClubs } from "./use-your-clubs";
import { YourClubsFold, YourClubsPanel } from "./YourClubsPanel";

export function FeedSideLayout({ children, eventsUrl, schoolUrl, onPickEvent, onOpenTab }: FeedSideLayoutProps) {
  const school = useSchoolEvents(schoolUrl);
  const clubEvents = useClubEvents(eventsUrl);
  const yourClubs = useYourClubs();
  const gridRef = useFeedTop();
  // An aside with nothing in it would still be announced as a landmark, so
  // the left one is left out when "Your clubs" draws nothing (both reads
  // failed). The right column is a plain box: the folded strip is its own
  // "Your clubs" region and TonightPanel brings its own "What's the vibe
  // tonight" aside only when it draws (its null rules need the ranked view),
  // so no landmark is ever empty or misnamed. The grid keeps its columns
  // either way, so the feed stays where it is.
  const clubsShown = yourClubs.status !== "error";
  return (
    <div ref={gridRef} className="tonight-feed-grid">
      {clubsShown ? (
        <aside className="tonight-feed-left" aria-label="Your clubs">
          <QuietBoundary name="your-clubs"><YourClubsPanel state={yourClubs} onFindClubs={() => onOpenTab("orgs")} /></QuietBoundary>
        </aside>
      ) : null}
      <div className="tonight-feed-main">{children}</div>
      <div className="tonight-feed-right">
        <QuietBoundary name="your-clubs-fold"><YourClubsFold state={yourClubs} /></QuietBoundary>
        <QuietBoundary name="tonight-panel">
        <TonightPanel
          school={school}
          clubs={clubEvents.events}
          clubsFailed={clubEvents.failed}
          onPickEvent={onPickEvent}
          onOpenEvents={() => onOpenTab("events")}
        />
        </QuietBoundary>
      </div>
    </div>
  );
}

/**
 * How far down the page the panels start, as `--tonight-feed-top` on the
 * grid. The Tonight panel's height cap (feed-side.css) keeps its foot 24px
 * above the Otto orb at scroll 0, the lowest it ever sits, and that depends
 * on what is above: the 64px top bar, plus the "Viewing …" pill or the
 * "Pick your campus" strip when one shows. Measured rather than assumed,
 * and written straight onto the element, so nothing re-renders. Once the
 * page scrolls past a banner the panel is only shorter than it needs to be.
 */
function useFeedTop() {
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let last = "";
    const measure = () => {
      const top = `${Math.max(0, Math.round(grid.getBoundingClientRect().top + window.scrollY))}px`;
      if (top === last) return;
      last = top;
      grid.style.setProperty("--tonight-feed-top", top);
    };
    measure();
    window.addEventListener("resize", measure);
    // A strip that appears above after this mounts moves the grid without a
    // window resize: a tall page grows (the body), a short one squeezes the
    // grid's flex parent. One of the two observers sees either.
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(document.body);
    if (grid.parentElement) ro?.observe(grid.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);
  return gridRef;
}
