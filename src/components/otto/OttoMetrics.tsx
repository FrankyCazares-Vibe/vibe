"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";
import { useAppShell } from "@/lib/native/use-app-shell";

import { OttoSection } from "./OttoSection";
import { ProfileViewersList, type ProfileViewerRow } from "./ProfileViewersList";

/**
 * GET /api/me/profile-views (wave plan contract C1). Two shapes behind one
 * type: a free account gets counts, `premium: false` and — when the number is
 * exactly known — `locked_count`, the distinct PEOPLE of the last seven days.
 * A Vibe+ account gets `recent`, the first page of the same list
 * /api/me/profile-viewers pages through.
 *
 * `recent` is absent (not empty) on the free branch: the route never sends
 * identities for the client to hide, so there is nothing here to leak.
 */
type ProfileViewsPayload = {
  counts: { today: number; seven_days: number; thirty_days: number; all_time: number };
  premium: boolean;
  viewer_identities?: "locked" | "visible";
  /** Free only, and omitted rather than zeroed when the count is unknown. */
  locked_count?: number;
  /** Vibe+ only — the first page (25) of the viewers list. */
  recent?: ProfileViewerRow[];
  recent_total?: number;
  recent_has_more?: boolean;
  /** Where "Show more" starts — people consumed, not rows sent. */
  recent_next_offset?: number;
};

/**
 * GET /api/me/creator-stats (contract C5). `saves` is optional everywhere it
 * appears: an older deploy of the route simply doesn't send it, and a missing
 * key means "we don't know", which is not the same claim as zero — so the
 * Saves tile disappears instead of printing 0.
 */
type WindowStats = {
  views: number;
  likes: number;
  comments: number;
  reposts: number;
  saves?: number;
};

type CreatorStatsPayload = {
  totals: {
    posts: number;
    views: number;
    likes: number;
    comments: number;
    reposts: number;
    saves?: number;
  };
  by_window: {
    seven_days: WindowStats;
    thirty_days: WindowStats;
  };
  top_posts: Array<{
    id: string;
    type: string;
    content: string | null;
    view_count: number;
    like_count: number;
    comment_count: number;
    repost_count: number;
    save_count?: number;
    created_at: string;
  }>;
};

/** What OttoMetrics keeps, once the two payloads are checked. */
type ProfileViewsState = {
  counts: ProfileViewsPayload["counts"];
  premium: boolean;
  /** null on the free branch: no identities were sent. */
  recent: ProfileViewerRow[] | null;
  recentHasMore: boolean;
  /** Offset of the second page; falls back to the rows sent if omitted. */
  recentNextOffset: number;
  /** null when the route omitted it — absent is not zero. */
  lockedCount: number | null;
};

/** One line per half, so a refused read says which numbers are missing. */
const PV_FAILURE = "Couldn't load your profile views.";
const CS_FAILURE = "Couldn't load your post stats.";

/**
 * The lock link comes back to this exact pane, so a student who taps "See who"
 * and then backs out lands where they were. /plus validates `next` with
 * isSafeRelativePath, and the value carries a query string of its own, so it
 * is encoded rather than concatenated. Never shown inside the store apps,
 * where Vibe+ isn't for sale (handoffs/wave-plan-pwa/plan.md §5 SD1).
 */
const PLUS_HREF = `/plus?next=${encodeURIComponent("/otto?tab=stats")}`;

/**
 * Three-tile rows size themselves to the column: this section is half a grid
 * column on desktop and a full-width snap pane on the phone, and three tiles
 * fit on one line at both widths.
 *
 * Four-tile rows use `.otto-metrics-tiles--4` instead, because an inline
 * grid-template-columns outranks the stylesheet and would kill the
 * `@media (max-width: 760px)` rule that folds four tiles into a tidy 2x2
 * (src/app/globals.css, `.otto-metrics-tiles--4`) — on a 375px phone auto-fit
 * fits only three, leaving an orphan on a second line.
 */
const TILE_GRID: CSSProperties = {
  gridTemplateColumns: "repeat(auto-fit, minmax(86px, 1fr))",
};

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n / 1000) + "k";
}

/**
 * Full metrics section on /otto — the command-center counterpart to the
 * compact MetricsBlock in OttoSidePanel. Desktop mounts it under the Stats tab
 * (OttoPageClient.tsx), the phone mounts the same component as its second
 * swipe pane (src/components/mobile/OttoMobile.tsx), so there is one screen to
 * keep honest, not two.
 *
 * Two halves: profile views (today / 7d / 30d / all-time) with either the
 * Vibe+ "Who viewed you" list or the locked teaser under it, and creator stats
 * (post views by window, reactions, top posts).
 *
 * Self-contained data fetch — runs in a useEffect on mount. The cost is one
 * extra paint frame vs. server-side hydration; trade-off is that the Otto page
 * payload stays lean and these endpoints can be polled independently in a
 * future revision.
 *
 * Each half owns its failure: a refused read (or a 2xx without the numbers in
 * it) puts an inline line with Retry in that half's place, so a tile never
 * shows 0 for a number nobody counted.
 */
export function OttoMetrics() {
  const [pv, setPv] = useState<ProfileViewsState | null>(null);
  const [cs, setCs] = useState<CreatorStatsPayload | null>(null);
  const [pvErr, setPvErr] = useState<LoadFailure | null>(null);
  const [csErr, setCsErr] = useState<LoadFailure | null>(null);
  const [pvLoading, setPvLoading] = useState(true);
  const [csLoading, setCsLoading] = useState(true);
  // Bumped on every accepted profile-views payload and used as the viewers
  // list's key: a reload remounts it with the new first page instead of an
  // effect copying props into its state.
  const [pvSeq, setPvSeq] = useState(0);
  // Inside the store apps the free "See who · Vibe+" teaser doesn't render
  // at all. The hook is null for one frame while the page hydrates, but the
  // teaser only paints after the profile-views fetch, so it never flashes.
  const inApp = useAppShell() !== null;

  // Each half fetches — and retries — on its own. They used to share one
  // load(), which meant retrying the refused Posts half also refetched profile
  // views, bumped pvSeq and remounted <ProfileViewersList>: every paged-in row
  // and every follow the student had just made in that list was thrown away.
  //
  // vibeRequest never throws, so an HTML error page reads as a failure instead
  // of blowing up the section. Quiet: each half renders its own line rather
  // than toasting a load the student didn't ask for.
  const pvRunRef = useRef(0);
  const csRunRef = useRef(0);

  const loadProfileViews = useCallback(async () => {
    const run = ++pvRunRef.current;
    setPvLoading(true);
    const pvRes = await vibeRequest<Partial<ProfileViewsPayload>>(
      "/api/me/profile-views",
      { cache: "no-store", quiet: true, failure: PV_FAILURE },
    );
    if (pvRunRef.current !== run) return;

    // A payload with counts and no `recent` is a success on the free branch —
    // the route omits viewer identities entirely rather than sending them for
    // the client to hide. On the paid branch the route 500s instead of sending
    // `recent: []`, so a `premium: true` payload WITHOUT the array is a broken
    // shape, not an empty list: it fails rather than saying "no one yet".
    const pvData = pvRes.ok ? pvRes.data : null;
    const premium = pvData?.premium === true;
    const recent = Array.isArray(pvData?.recent) ? pvData.recent : null;
    if (pvData?.counts && (!premium || recent !== null)) {
      setPv({
        counts: pvData.counts,
        premium,
        recent,
        recentHasMore: pvData.recent_has_more === true,
        recentNextOffset:
          typeof pvData.recent_next_offset === "number"
            ? pvData.recent_next_offset
            : (recent?.length ?? 0),
        // Absent means "we couldn't count it exactly"; only a real number
        // reaches the teaser.
        lockedCount: typeof pvData.locked_count === "number" ? pvData.locked_count : null,
      });
      setPvErr(null);
      setPvSeq((n) => n + 1);
    } else {
      setPvErr(asLoadFailure(pvRes, PV_FAILURE));
    }
    setPvLoading(false);
  }, []);

  const loadCreatorStats = useCallback(async () => {
    const run = ++csRunRef.current;
    setCsLoading(true);
    const csRes = await vibeRequest<Partial<CreatorStatsPayload>>(
      "/api/me/creator-stats",
      { cache: "no-store", quiet: true, failure: CS_FAILURE },
    );
    if (csRunRef.current !== run) return;

    if (
      csRes.ok &&
      csRes.data.totals &&
      csRes.data.by_window &&
      Array.isArray(csRes.data.top_posts)
    ) {
      setCs({
        totals: csRes.data.totals,
        by_window: csRes.data.by_window,
        top_posts: csRes.data.top_posts,
      });
      setCsErr(null);
    } else {
      setCsErr(asLoadFailure(csRes, CS_FAILURE));
    }
    setCsLoading(false);
  }, []);

  // The fetch runs in an async IIFE, the way every other list in the app
  // does it, so the effect body itself stays synchronous.
  useEffect(() => {
    void (async () => {
      await Promise.all([loadProfileViews(), loadCreatorStats()]);
    })();
    return () => {
      // Drop an in-flight response after unmount (the phone swipes panes).
      pvRunRef.current += 1;
      csRunRef.current += 1;
    };
  }, [loadProfileViews, loadCreatorStats]);

  const loading = pvLoading || csLoading;

  const retryPv = () => {
    void loadProfileViews();
  };
  const retryCs = () => {
    void loadCreatorStats();
  };

  // "Nobody has looked" is a claim about all four windows, not just the one on
  // screen — an all-time zero with a 30-day zero is the only state that earns
  // the empty copy.
  const noViewsYet =
    pv !== null &&
    pv.counts.today === 0 &&
    pv.counts.seven_days === 0 &&
    pv.counts.thirty_days === 0 &&
    pv.counts.all_time === 0;

  const reactionTotal = cs
    ? cs.totals.likes + cs.totals.comments + cs.totals.reposts + (cs.totals.saves ?? 0)
    : 0;

  // Likes / Comments / Reposts, plus Saves when the route knows about them.
  // Four tiles hand the row to the stylesheet's `--4` rule (which folds to 2x2
  // under 760px); three stay on the auto-fit grid, which fits three on a phone.
  const hasSavesTile = typeof cs?.totals.saves === "number";

  return (
    <OttoSection eyebrow="Your metrics" wide>
      {loading && !pv && !cs ? (
        <p className="otto-room-empty">crunching the numbers…</p>
      ) : (
        <div className="otto-metrics">
          {/* Profile views half */}
          <div className="otto-metrics-block">
            <div className="otto-metrics-block-head">Profile views</div>
            {pvErr && !pv ? (
              <LoadFailed failure={pvErr} onRetry={retryPv} tone="dark" />
            ) : !pv ? null : (
              <>
                <div className="otto-metrics-tiles otto-metrics-tiles--4">
                  <Tile n={pv.counts.today} label="Today" />
                  <Tile n={pv.counts.seven_days} label="7 days" />
                  <Tile n={pv.counts.thirty_days} label="30 days" accent />
                  <Tile n={pv.counts.all_time} label="All time" />
                </div>
                <div className="otto-metrics-recent">
                  {noViewsYet ? (
                    <p className="otto-room-empty">
                      Nobody&rsquo;s looked yet. Your profile shows up when you post,
                      comment, or turn up on the map.
                    </p>
                  ) : pv.premium ? (
                    <>
                      <div className="otto-metrics-recent-label">Who viewed you</div>
                      {pv.recent && pv.recent.length > 0 ? (
                        <ProfileViewersList
                          key={`viewers-${pvSeq}`}
                          initialRows={pv.recent}
                          initialHasMore={pv.recentHasMore}
                          initialNextOffset={pv.recentNextOffset}
                        />
                      ) : (
                        <p className="otto-room-empty">No one yet.</p>
                      )}
                    </>
                  ) : pv.lockedCount !== null && pv.lockedCount > 0 && !inApp ? (
                    // Free account, in a browser. The teaser counts PEOPLE
                    // over seven days, while the tile beside it counts VIEWS —
                    // hence the two different words for two different numbers.
                    // In the app the tiles stand alone: the counts are free
                    // everywhere, and the pitch for the names is web-only.
                    <>
                      <div className="otto-metrics-recent-label">Who viewed you</div>
                      <p className="otto-metrics-foot">
                        <strong>
                          {pv.lockedCount} {pv.lockedCount === 1 ? "person" : "people"}
                        </strong>{" "}
                        looked at your profile this week.{" "}
                        <Link href={PLUS_HREF}>See who · Vibe+</Link>
                      </p>
                    </>
                  ) : null}
                </div>
              </>
            )}
          </div>

          {/* Creator stats half */}
          <div className="otto-metrics-block">
            <div className="otto-metrics-block-head">
              Posts
              {cs ? (
                <span className="otto-metrics-block-sub">
                  {cs.totals.posts} posts
                </span>
              ) : null}
            </div>
            {csErr && !cs ? (
              <LoadFailed failure={csErr} onRetry={retryCs} tone="dark" />
            ) : !cs ? null : cs.totals.posts === 0 ? (
              <p className="otto-room-empty">
                You haven&rsquo;t posted yet — post views land here once you do.
              </p>
            ) : (
              <>
                <div className="otto-metrics-recent-label">Post views</div>
                <div className="otto-metrics-tiles" style={TILE_GRID}>
                  <Tile n={cs.by_window.seven_days.views} label="7 days" />
                  <Tile n={cs.by_window.thirty_days.views} label="30 days" />
                  <Tile n={cs.totals.views} label="All time" accent />
                </div>

                <div className="otto-metrics-recent-label">Reactions</div>
                {reactionTotal === 0 ? (
                  <p className="otto-room-empty">No reactions yet.</p>
                ) : (
                  <>
                    <div
                      className={`otto-metrics-tiles${hasSavesTile ? " otto-metrics-tiles--4" : ""}`}
                      style={hasSavesTile ? undefined : TILE_GRID}
                    >
                      <Tile n={cs.totals.likes} label="Likes" />
                      <Tile n={cs.totals.comments} label="Comments" />
                      <Tile n={cs.totals.reposts} label="Reposts" />
                      {typeof cs.totals.saves === "number" ? (
                        <Tile n={cs.totals.saves} label="Saves" />
                      ) : null}
                    </div>
                    <div className="otto-metrics-windows">
                      <WindowRow label="7 days" w={cs.by_window.seven_days} />
                      <WindowRow label="30 days" w={cs.by_window.thirty_days} />
                    </div>
                  </>
                )}

                {cs.top_posts.length ? (
                  <div className="otto-metrics-top">
                    <div className="otto-metrics-recent-label">Top posts</div>
                    <ul className="otto-metrics-top-list">
                      {cs.top_posts.map((p) => (
                        <li key={p.id}>
                          {/* The row is the way into the post itself — a stat
                              you can't click back to its cause is trivia. */}
                          <Link
                            href={`/posts/${encodeURIComponent(p.id)}`}
                            className="otto-metrics-top-row"
                            // Colour comes from .otto-metrics-top-row; an
                            // inline `color` would outrank it and print the
                            // row brighter than its own counts.
                            style={{ textDecoration: "none" }}
                          >
                            <span className="otto-metrics-top-content">
                              {p.content?.slice(0, 80) || "(no text)"}
                            </span>
                            <span className="otto-metrics-top-counts">
                              {fmt(p.view_count)}v · {fmt(p.like_count)}❤ ·{" "}
                              {fmt(p.comment_count)}💬 · {fmt(p.repost_count)}↻
                              {typeof p.save_count === "number"
                                ? ` · ${fmt(p.save_count)}🔖`
                                : ""}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </OttoSection>
  );
}

function Tile({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div className={`otto-metrics-tile ${accent ? "otto-metrics-tile--accent" : ""}`}>
      <div className="otto-metrics-tile-n">{fmt(n)}</div>
      <div className="otto-metrics-tile-l">{label}</div>
    </div>
  );
}

/**
 * Reactions by window. Views are deliberately not repeated here — the tiles
 * above already carry 7d / 30d / all-time views, and two places printing the
 * same number is two places to get it wrong.
 */
function WindowRow({ label, w }: { label: string; w: WindowStats }) {
  return (
    <div className="otto-metrics-window-row">
      <span className="otto-metrics-window-label">{label}</span>
      <span className="otto-metrics-window-vals">
        <span>{fmt(w.likes)} likes</span>
        <span>·</span>
        <span>{fmt(w.comments)} comments</span>
        <span>·</span>
        <span>{fmt(w.reposts)} reposts</span>
        {typeof w.saves === "number" ? (
          <>
            <span>·</span>
            <span>{fmt(w.saves)} saves</span>
          </>
        ) : null}
      </span>
    </div>
  );
}
