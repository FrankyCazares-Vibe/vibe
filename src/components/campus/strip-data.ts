"use client";

import { useCallback, useEffect, useState } from "react";

import { asLoadFailure, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";

import { formatUpcomingChip, stripIsEmpty } from "./rolling-strip-view";

/**
 * The data behind the Feed tab's rolling strip (S67 wave 1, contracts C1).
 * Two reads, each with its own error and its own retry, so one outage never
 * blanks the other or reads as "nothing here". The PARENT owns this hook
 * (`FeedTabBody` on the desktop, `CampusMobile` on the phone) and hands the
 * result to `<RollingStrip data={…}>`, so the parent also knows when the
 * strip is hidden (`stripIsEmpty`).
 *
 * The fetch effects are the old `OttoFeedStrip`'s, moved here unchanged in
 * spirit: `vibeRequest` with `quiet: true` (the strip renders its own
 * failure chip), `cache: "no-store"`, and a cancelled flag on unmount.
 */
export type StripTrend = { tag: string; count: number };

export type StripUpcoming = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  org: { handle: string; name: string } | null;
  viewer_status: "going" | "maybe";
};

export type StripData = {
  upcoming: StripUpcoming[] | null;
  trending: StripTrend[] | null;
  upcomingErr: LoadFailure | null;
  trendingErr: LoadFailure | null;
  retryUpcoming(): void;
  retryTrending(): void;
  /** Re-reads both sources; rows already on screen stay until the answer lands. */
  refresh(): void;
};

// The date word and the hidden rule are pure (tested in rolling-strip-view.ts)
// and re-exported here so callers have the one import path C1 names.
export { formatUpcomingChip, stripIsEmpty };

const UPCOMING_FAILURE = "Couldn't load your upcoming events.";
const TRENDING_FAILURE = "Couldn't load trending tags.";

export function useStripData(opts: {
  upcomingLimit?: number;
  trendingLimit?: number;
  days?: number;
  /** Only while visiting another campus (wave 4): trending follows it, RSVPs stay the student's. */
  campusId?: string | null;
} = {}): StripData {
  const { upcomingLimit = 3, trendingLimit = 8, days = 14, campusId = null } = opts;
  const [trending, setTrending] = useState<StripTrend[] | null>(null);
  const [upcoming, setUpcoming] = useState<StripUpcoming[] | null>(null);
  const [trendingErr, setTrendingErr] = useState<LoadFailure | null>(null);
  const [upcomingErr, setUpcomingErr] = useState<LoadFailure | null>(null);
  const [trendingKey, setTrendingKey] = useState(0);
  const [upcomingKey, setUpcomingKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const campus = campusId ? `&campus=${encodeURIComponent(campusId)}` : "";
    (async () => {
      const r = await vibeRequest<{ trending?: StripTrend[] }>(
        `/api/trending/hashtags?limit=${trendingLimit}${campus}`,
        { cache: "no-store", quiet: true, failure: TRENDING_FAILURE },
      );
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.trending)) {
        setTrendingErr(null);
        setTrending(r.data.trending);
      } else {
        setTrendingErr(asLoadFailure(r, TRENDING_FAILURE));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trendingKey, trendingLimit, campusId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ upcoming?: StripUpcoming[] }>(
        `/api/me/upcoming-events?limit=${upcomingLimit}&days=${days}`,
        { cache: "no-store", quiet: true, failure: UPCOMING_FAILURE },
      );
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.upcoming)) {
        setUpcomingErr(null);
        setUpcoming(r.data.upcoming);
      } else {
        setUpcomingErr(asLoadFailure(r, UPCOMING_FAILURE));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [upcomingKey, upcomingLimit, days]);

  const retryTrending = useCallback(() => {
    setTrendingErr(null);
    setTrendingKey((k) => k + 1);
  }, []);
  const retryUpcoming = useCallback(() => {
    setUpcomingErr(null);
    setUpcomingKey((k) => k + 1);
  }, []);
  const refresh = useCallback(() => {
    retryTrending();
    retryUpcoming();
  }, [retryTrending, retryUpcoming]);

  return { upcoming, trending, upcomingErr, trendingErr, retryUpcoming, retryTrending, refresh };
}
