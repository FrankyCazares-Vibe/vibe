"use client";

import "./kit/sky.css";
import "./kit/desk.css";
import "./kit/more.css";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { addCampusDays, campusDay } from "@/components/campus/tonight/campus-time";
import { EyeIcon } from "@/components/icons/engagement-icons";
import { DeskClubMark } from "@/components/otto/desk/DeskDraft";
import { vibeRequest } from "@/lib/feedback/request";
import type { ProfileViewerRow } from "@/lib/metrics/profile-viewers";
import { useAppShell } from "@/lib/native/use-app-shell";
import type { DeskClub } from "@/lib/otto/desk";
import { PROFILE_COUNTS, parseStats, rangeLabel, viewsCounts, viewsSub, viewsWhat, type OttoStats } from "@/lib/otto/stats";

import { OttoStatCard, OttoStatFail, OttoStatLoading, OttoStatWindows } from "./OttoStatCard";
import { ProfileViewersList } from "./ProfileViewersList";

/**
 * Otto's Stats tab on the desk (Nov 10, 2026, the Otto build's Wave 2A; board
 * D4 "Numbers and settings"). Two numbers, each with its range and one line
 * saying what it counts:
 *
 * 1. Views on your posts, last 30 days (GET /api/me/otto/stats). An officer
 *    acting as a club (`club`, the desk's `actingAs`) sees that club's posts.
 *    One number, no Events / Announcements split: only posts have a view
 *    ledger (src/lib/otto/stats.ts). No "things Otto did" until he does any.
 * 2. Views of your profile (GET /api/me/profile-views), kept from the old tab
 *    with its Vibe+ "Who viewed you" list and the web-only teaser, because
 *    removing the list changes a live feature (BUILD-ORDER.md, raised apart).
 *    Only on your own desk (You): acting as a club, the tab is the club's
 *    numbers, so the personal card isn't shown or read (walk fix, Nov 11).
 *
 * Each card owns its failure: a refused read shows "couldn't count" with
 * Try again, never a 0. Today's tab lives on as OttoMetricsLegacy.tsx for the
 * `OTTO_DESK=off` page.
 */

type ProfileViewsPayload = {
  counts?: { today: number; seven_days: number; thirty_days: number; all_time: number };
  premium?: boolean;
  locked_count?: number;
  recent?: ProfileViewerRow[];
  recent_has_more?: boolean;
  recent_next_offset?: number;
};

type ProfileViews = {
  counts: NonNullable<ProfileViewsPayload["counts"]>;
  premium: boolean;
  recent: ProfileViewerRow[] | null;
  hasMore: boolean;
  nextOffset: number;
  /** Distinct people this week; null when the route couldn't say exactly. */
  lockedCount: number | null;
};

type Load<T> = { state: "loading" } | { state: "ok"; value: T } | { state: "fail" };

/** Comes back to this tab after /plus; never shown inside the store apps. */
const PLUS_HREF = `/plus?next=${encodeURIComponent("/otto?tab=stats")}`;

export function OttoMetrics({ club = null }: { club?: DeskClub | null }) {
  const handle = club?.handle ?? null;
  const [stats, setStats] = useState<Load<OttoStats>>({ state: "loading" });
  const [pv, setPv] = useState<Load<ProfileViews>>({ state: "loading" });
  const [pvSeq, setPvSeq] = useState(0);
  const [busy, setBusy] = useState({ stats: false, pv: false });
  const inApp = useAppShell() !== null;
  const statsRun = useRef(0);
  const pvRun = useRef(0);

  const loadStats = useCallback(async () => {
    const run = ++statsRun.current;
    setBusy((b) => ({ ...b, stats: true }));
    const url = handle ? `/api/me/otto/stats?club=${encodeURIComponent(handle)}` : "/api/me/otto/stats";
    const r = await vibeRequest<unknown>(url, { cache: "no-store", quiet: true, failure: "Couldn't count your post views." });
    if (statsRun.current !== run) return;
    const value = r.ok ? parseStats(r.data) : null;
    // Labelled in campus days: the ledger's UTC dates read a day ahead after
    // about 7 PM on campus (review L7). Same 30 days the number counts.
    const today = campusDay(Date.now());
    setStats(
      value
        ? { state: "ok", value: { ...value, since: addCampusDays(today, -30).key, until: today.key } }
        : { state: "fail" },
    );
    setBusy((b) => ({ ...b, stats: false }));
  }, [handle]);

  const loadPv = useCallback(async () => {
    const run = ++pvRun.current;
    setBusy((b) => ({ ...b, pv: true }));
    const r = await vibeRequest<ProfileViewsPayload>("/api/me/profile-views", {
      cache: "no-store",
      quiet: true,
      failure: "Couldn't count your profile views.",
    });
    if (pvRun.current !== run) return;
    const d = r.ok ? r.data : null;
    const premium = d?.premium === true;
    const recent = Array.isArray(d?.recent) ? d.recent : null;
    // Vibe+ without its list is a broken shape, not "no one yet".
    if (d?.counts && (!premium || recent !== null)) {
      setPv({
        state: "ok",
        value: {
          counts: d.counts,
          premium,
          recent,
          hasMore: d.recent_has_more === true,
          nextOffset: typeof d.recent_next_offset === "number" ? d.recent_next_offset : (recent?.length ?? 0),
          lockedCount: typeof d.locked_count === "number" ? d.locked_count : null,
        },
      });
      setPvSeq((n) => n + 1);
    } else {
      setPv({ state: "fail" });
    }
    setBusy((b) => ({ ...b, pv: false }));
  }, []);

  useEffect(() => {
    void (async () => {
      await loadStats();
    })();
    return () => {
      statsRun.current += 1;
    };
  }, [loadStats]);

  useEffect(() => {
    if (handle) return;
    void (async () => {
      await loadPv();
    })();
    return () => {
      pvRun.current += 1;
    };
  }, [loadPv, handle]);

  const s = stats.state === "ok" ? stats.value : null;
  const range = s ? rangeLabel(s.since, s.until) : "";

  return (
    <div className="dk-body otto-stats">
      <div className="dk-for">
        {club ? <DeskClubMark club={club} /> : null}
        <span>
          <b>{club ? club.name : "Your numbers"}</b>
          {range ? ` · ${range}` : ""}
        </span>
      </div>

      {stats.state === "loading" ? (
        <OttoStatLoading />
      ) : !s ? (
        <OttoStatFail
          line={club ? `The views on ${club.name}’s posts didn’t load.` : "The views on your posts didn’t load."}
          onRetry={() => void loadStats()}
          busy={busy.stats}
        />
      ) : (
        <OttoStatCard
          num={s.views}
          what={viewsWhat(s.club, s.views)}
          sub={viewsSub(s.posts)}
          counts={viewsCounts(s.club)}
          icon={<EyeIcon size={13} />}
          label={club ? `Views on ${club.name}’s posts` : "Views on your posts"}
        >
          {s.posts === 0 ? (
            <p className="dk-stat-load">
              {club ? "Nothing posted yet. Views land here once the club posts." : "You haven’t posted yet. Views land here once you do."}
            </p>
          ) : null}
        </OttoStatCard>
      )}

      {club ? null : <ProfileCard pv={pv} seq={pvSeq} inApp={inApp} busy={busy.pv} onRetry={() => void loadPv()} />}
    </div>
  );
}

function ProfileCard({
  pv,
  seq,
  inApp,
  busy,
  onRetry,
}: {
  pv: Load<ProfileViews>;
  seq: number;
  inApp: boolean;
  busy: boolean;
  onRetry: () => void;
}) {
  if (pv.state === "loading") return <OttoStatLoading />;
  if (pv.state === "fail") return <OttoStatFail line="Your profile views didn’t load." onRetry={onRetry} busy={busy} />;
  const v = pv.value;
  const c = v.counts;
  const none = c.today === 0 && c.seven_days === 0 && c.thirty_days === 0 && c.all_time === 0;
  return (
    <OttoStatCard
      num={c.thirty_days}
      what={c.thirty_days === 1 ? "view of your profile" : "views of your profile"}
      sub="Last 30 days"
      counts={PROFILE_COUNTS}
      label="Views of your profile"
      icon={<EyeIcon size={13} />}
    >
      <OttoStatWindows
        items={[
          { label: "Today", n: c.today },
          { label: "7 days", n: c.seven_days },
          { label: "All time", n: c.all_time },
        ]}
      />
      {none ? (
        <p className="dk-stat-load">
          Nobody&rsquo;s looked yet. Your profile shows up when you post, comment, or turn up on the map.
        </p>
      ) : v.premium ? (
        // ProfileViewersList is drawn for the old dark room, so it keeps a small night well in both looks.
        <div className="vibe-night-island dk-stat-well">
          <p className="dk-stat-well-h">Who viewed you</p>
          {v.recent && v.recent.length > 0 ? (
            <ProfileViewersList
              key={`viewers-${seq}`}
              initialRows={v.recent}
              initialHasMore={v.hasMore}
              initialNextOffset={v.nextOffset}
            />
          ) : (
            <p className="dk-stat-load">No one yet.</p>
          )}
        </div>
      ) : v.lockedCount !== null && v.lockedCount > 0 && !inApp ? (
        <p className="dk-stat-load">
          <b>
            {v.lockedCount} {v.lockedCount === 1 ? "person" : "people"}
          </b>{" "}
          looked at your profile this week. <Link href={PLUS_HREF}>See who · Vibe+</Link>
        </p>
      ) : null}
    </OttoStatCard>
  );
}
