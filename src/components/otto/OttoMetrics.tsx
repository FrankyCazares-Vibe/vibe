"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { OttoSection } from "./OttoSection";

type ProfileViewsPayload = {
  ok: true;
  counts: { today: number; seven_days: number; thirty_days: number; all_time: number };
  recent: Array<{
    id: string;
    handle: string | null;
    name: string | null;
    avatar_url: string | null;
    viewed_on: string;
  }>;
  premium: boolean;
};

type CreatorStatsPayload = {
  ok: true;
  totals: { posts: number; clips: number; views: number; likes: number; comments: number; reposts: number };
  by_window: {
    seven_days: { views: number; likes: number; comments: number; reposts: number };
    thirty_days: { views: number; likes: number; comments: number; reposts: number };
  };
  top_posts: Array<{
    id: string;
    type: string;
    content: string | null;
    view_count: number;
    like_count: number;
    comment_count: number;
    repost_count: number;
    created_at: string;
  }>;
};

function fmt(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n / 1000) + "k";
}

/**
 * Full metrics section on /otto — the command-center counterpart to the
 * compact MetricsBlock in OttoSidePanel.
 *
 * Two halves: profile views (today / 7d / 30d / all-time) + recent viewer
 * thumbnails, and creator stats (posts/clips, views, likes, comments,
 * reposts) with a 7d/30d/all-time bucket grid and a top-5 posts list.
 *
 * Self-contained data fetch — runs in a useEffect on mount. The cost is
 * one extra paint frame vs. server-side hydration; trade-off is that the
 * Otto page payload stays lean and these endpoints can be polled
 * independently in a future revision.
 */
export function OttoMetrics() {
  const [pv, setPv] = useState<ProfileViewsPayload | null>(null);
  const [cs, setCs] = useState<CreatorStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pvRes, csRes] = await Promise.all([
          fetch("/api/me/profile-views", { cache: "no-store" }),
          fetch("/api/me/creator-stats", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (pvRes.ok) {
          const j = await pvRes.json();
          if (j.ok) setPv(j);
        }
        if (csRes.ok) {
          const j = await csRes.json();
          if (j.ok) setCs(j);
        }
      } catch (e) {
        console.error("[OttoMetrics] fetch", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <OttoSection eyebrow="Your metrics" wide>
      {loading ? (
        <p className="otto-room-empty">crunching the numbers…</p>
      ) : (
        <div className="otto-metrics">
          {/* Profile views half */}
          <div className="otto-metrics-block">
            <div className="otto-metrics-block-head">Profile views</div>
            <div className="otto-metrics-tiles otto-metrics-tiles--4">
              <Tile n={pv?.counts.today ?? 0} label="Today" />
              <Tile n={pv?.counts.seven_days ?? 0} label="7 days" />
              <Tile n={pv?.counts.thirty_days ?? 0} label="30 days" accent />
              <Tile n={pv?.counts.all_time ?? 0} label="All time" />
            </div>
            <div className="otto-metrics-recent">
              {pv?.recent.length ? (
                <>
                  <div className="otto-metrics-recent-label">Recent viewers</div>
                  <ul className="otto-metrics-recent-list">
                    {pv.recent.slice(0, 8).map((v) => (
                      <li key={v.id}>
                        <Link
                          href={v.handle ? `/profile/${v.handle}` : "#"}
                          className="otto-metrics-recent-row"
                          title={v.name || (v.handle ? `@${v.handle}` : "")}
                        >
                          {v.avatar_url ? (
                            // Plain <img> intentional — these are small (28px)
                            // user avatars and the next/image overhead isn't
                            // worth it for a metrics surface.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.avatar_url} alt="" />
                          ) : (
                            <span className="otto-metrics-recent-ph">
                              {(v.name || v.handle || "?").charAt(0).toUpperCase()}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {pv.premium ? null : (
                    <p className="otto-metrics-foot">
                      premium soon — viewer identity will move behind the paywall.
                    </p>
                  )}
                </>
              ) : (
                <p className="otto-room-empty">no profile views yet.</p>
              )}
            </div>
          </div>

          {/* Creator stats half */}
          <div className="otto-metrics-block">
            <div className="otto-metrics-block-head">
              Posts & clips
              {cs ? (
                <span className="otto-metrics-block-sub">
                  {cs.totals.posts} posts · {cs.totals.clips} clips
                </span>
              ) : null}
            </div>
            <div className="otto-metrics-tiles otto-metrics-tiles--4">
              <Tile n={cs?.totals.views ?? 0} label="Views" accent />
              <Tile n={cs?.totals.likes ?? 0} label="Likes" />
              <Tile n={cs?.totals.comments ?? 0} label="Comments" />
              <Tile n={cs?.totals.reposts ?? 0} label="Reposts" />
            </div>
            <div className="otto-metrics-windows">
              <WindowRow
                label="7 days"
                w={cs?.by_window.seven_days ?? { views: 0, likes: 0, comments: 0, reposts: 0 }}
              />
              <WindowRow
                label="30 days"
                w={cs?.by_window.thirty_days ?? { views: 0, likes: 0, comments: 0, reposts: 0 }}
              />
            </div>
            {cs?.top_posts.length ? (
              <div className="otto-metrics-top">
                <div className="otto-metrics-recent-label">Top posts</div>
                <ul className="otto-metrics-top-list">
                  {cs.top_posts.map((p) => (
                    <li key={p.id} className="otto-metrics-top-row">
                      <span className="otto-metrics-top-content">
                        {p.content?.slice(0, 80) || (p.type === "clip" ? "Clip" : "(no text)")}
                      </span>
                      <span className="otto-metrics-top-counts">
                        {fmt(p.view_count)}v · {fmt(p.like_count)}❤ · {fmt(p.comment_count)}💬 ·{" "}
                        {fmt(p.repost_count)}↻
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
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

function WindowRow({
  label,
  w,
}: {
  label: string;
  w: { views: number; likes: number; comments: number; reposts: number };
}) {
  return (
    <div className="otto-metrics-window-row">
      <span className="otto-metrics-window-label">{label}</span>
      <span className="otto-metrics-window-vals">
        <span>{fmt(w.views)} views</span>
        <span>·</span>
        <span>{fmt(w.likes)} likes</span>
        <span>·</span>
        <span>{fmt(w.comments)} comments</span>
        <span>·</span>
        <span>{fmt(w.reposts)} reposts</span>
      </span>
    </div>
  );
}
