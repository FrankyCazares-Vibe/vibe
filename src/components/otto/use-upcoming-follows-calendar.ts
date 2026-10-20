"use client";

import { useEffect, useRef } from "react";

import type { OttoPayload, UpcomingRow } from "@/app/api/me/otto/route";
import { CALENDAR_CHANGED_EVENT } from "@/lib/calendar/calendar-sync";
import { vibeRequest } from "@/lib/feedback/request";

/**
 * Otto's Upcoming list follows an RSVP made anywhere (Oct 19, 2026, critique
 * B8 repair, decision 12). The page draws Upcoming from the server's first
 * answer and never read it again, so an RSVP in the Otto-corner window, the
 * Messages panel or another tab (calendar-sync.ts carries all three) left it
 * stale until a reload. On `vibe:calendar-changed` it reads `/api/me/otto`
 * again, quietly, and hands over only the Upcoming rows.
 *
 * Only the newest read lands, and an answer whose Upcoming read failed keeps
 * what is on screen (the first answer's own "couldn't load" stays the only
 * failure the student sees). Nothing new is read: it is the same payload the
 * page opened with.
 */
export function useUpcomingFollowsCalendar(onUpcoming: (rows: UpcomingRow[]) => void): void {
  const onUpcomingRef = useRef(onUpcoming);
  useEffect(() => {
    onUpcomingRef.current = onUpcoming;
  });
  const seqRef = useRef(0);

  useEffect(() => {
    const reread = async () => {
      const seq = ++seqRef.current;
      const r = await vibeRequest<OttoPayload>("/api/me/otto", {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't refresh Otto.",
      });
      if (seq !== seqRef.current) return;
      if (!r.ok || !Array.isArray(r.data.upcoming)) return;
      if (r.data.failed?.includes("upcoming")) return;
      onUpcomingRef.current(r.data.upcoming);
    };
    const handler = () => {
      void reread();
    };
    window.addEventListener(CALENDAR_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener(CALENDAR_CHANGED_EVENT, handler);
      // Leaving the page: an answer still out is dropped.
      seqRef.current += 1;
    };
  }, []);
}
