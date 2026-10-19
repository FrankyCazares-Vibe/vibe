"use client";

/**
 * The Tonight view for one component (Oct 19 2026): `buildTonight` on the
 * minute clock. Each card, panel and section calls this itself, so the
 * minute tick redraws only that piece, never CampusMobile or CampusHome.
 *
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §5.4.
 */
import { useMemo } from "react";

import type { CampusEvent } from "@/app/campus/campus-home";
import type { SchoolEvent } from "@/lib/school-events/types";

import { buildHomeWeek, buildTonight } from "./tonight-view";
import type { SchoolEventsState, TonightFilter, TonightView, WeekTile } from "./types";
import { useCampusNow } from "./use-campus-now";

/** One empty list for every "nothing", so a memo doesn't see a new [] each render. */
const NO_SCHOOL: SchoolEvent[] = [];
const NO_TILES: WeekTile[] = [];

/**
 * Null while the club list is loading (`clubs === null`), while the school
 * read is loading, and before the clock is known (0 on the server and while
 * hydrating). With the school part off, only club events are used.
 */
export function useTonightView(
  school: SchoolEventsState,
  clubs: CampusEvent[] | null,
  filter: TonightFilter = "all",
): TonightView | null {
  const now = useCampusNow();
  const loading = school.status === "loading";
  const schoolEvents = school.on ? school.events : NO_SCHOOL;
  const sources = school.sources;
  return useMemo(() => {
    if (clubs === null || loading || now === 0) return null;
    return buildTonight({ school: schoolEvents, clubs, sources, filter, now });
  }, [clubs, loading, now, schoolEvents, sources, filter]);
}

/** "Home games this week" (the phone sheet): [] while loading, with the school part off, or before the clock. */
export function useHomeWeek(school: SchoolEventsState): WeekTile[] {
  const now = useCampusNow();
  const on = school.status === "ready" && school.on;
  const events = school.events;
  return useMemo(() => (on && now !== 0 ? buildHomeWeek(events, now) : NO_TILES), [on, now, events]);
}
