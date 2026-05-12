"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type NotifType = "follow" | "connection" | "like" | "comment" | "mention";

type NotifActor = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
} | null;

type NotifPost = {
  id: string;
  type: string | null;
  content: string | null;
  media_thumbnail_url: string | null;
  // Author handle is pulled by the notifications GET join — used so
  // mention clicks route to /profile/<authorHandle>?post=<id> instead
  // of the viewer's own profile.
  author?: { handle: string | null } | null;
} | null;

type NotifComment = {
  id: string;
  content: string | null;
} | null;

type NotifRow = {
  id: string;
  type: NotifType | string;
  post_id: string | null;
  comment_id: string | null;
  message_id?: string | null;
  read_at: string | null;
  created_at: string;
  actor: NotifActor;
  post: NotifPost;
  comment: NotifComment;
};

type CountPayload = {
  unread: number;
  totals: {
    follow?: number;
    connection?: number;
    like?: number;
    comment?: number;
    mention?: number;
  };
};

type MetricsPayload = {
  profile_views: { today: number; seven_days: number; thirty_days: number; all_time: number };
  creator: { views: number; likes: number; comments: number; reposts: number };
};

type Filter = "all" | NotifType;

/**
 * React port of the legacy `_otto.js` slide-out panel. Mounts when `open` is
 * true; renders a dark backdrop + right-side dark panel with header, stats
 * grid, notification list, and a footer link to the full Otto command center.
 *
 * Marks all notifications read on open (matches the legacy behaviour).
 */
export function OttoSidePanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [count, setCount] = useState<CountPayload | null>(null);
  const [list, setList] = useState<NotifRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const markAllRead = useCallback(async () => {
    try {
      await fetch("/api/me/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      /* silent */
    }
  }, []);

  // Fetch + mark-read whenever the panel opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [countRes, listRes, pviewsRes, csRes] = await Promise.all([
          fetch("/api/me/notifications/count", { cache: "no-store" }),
          fetch("/api/me/notifications?limit=30", { cache: "no-store" }),
          fetch("/api/me/profile-views", { cache: "no-store" }),
          fetch("/api/me/creator-stats", { cache: "no-store" }),
        ]);
        const countData = await countRes.json();
        const listData = await listRes.json();
        if (cancelled) return;
        if (countData?.ok) {
          setCount({
            unread: typeof countData.unread === "number" ? countData.unread : 0,
            totals: countData.totals ?? {},
          });
        }
        if (listData?.ok && Array.isArray(listData.notifications)) {
          const rows = listData.notifications as NotifRow[];
          setList(rows);
          if (rows.some((n) => !n.read_at)) {
            void markAllRead();
          }
        }
        // Metrics: best-effort. If either endpoint failed, we just skip the
        // metrics block rather than blocking the whole panel render.
        try {
          const pv = pviewsRes.ok ? await pviewsRes.json() : null;
          const cs = csRes.ok ? await csRes.json() : null;
          if (pv?.ok || cs?.ok) {
            setMetrics({
              profile_views: pv?.ok
                ? pv.counts
                : { today: 0, seven_days: 0, thirty_days: 0, all_time: 0 },
              creator: cs?.ok
                ? cs.totals
                : { views: 0, likes: 0, comments: 0, reposts: 0 },
            });
          }
        } catch {
          /* metrics block is optional; ignore */
        }
      } catch {
        /* keep prior state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, markAllRead]);

  const briefing = useMemo(() => {
    if (!count) return "loading your activity…";
    const total =
      (count.totals.follow ?? 0) +
      (count.totals.connection ?? 0) +
      (count.totals.like ?? 0) +
      (count.totals.comment ?? 0);
    if (total === 0) return "quiet around here. go say hi to someone.";
    if (count.unread > 0) return `${count.unread} new since you last looked.`;
    return "all caught up — here's what's been happening.";
  }, [count]);

  const filtered = useMemo(() => {
    if (filter === "all") return list;
    return list.filter((n) => n.type === filter);
  }, [list, filter]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(20,20,22,0.42)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          animation: "otto-backdrop-in 0.22s ease-out",
        }}
      />
      <aside
        role="dialog"
        aria-label="Otto"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          width: 380,
          maxWidth: "92vw",
          background: "#141416",
          color: "white",
          borderLeft: "0.5px solid rgba(255,92,53,0.15)",
          boxShadow: "-16px 0 48px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "DM Sans, sans-serif",
          animation: "otto-panel-in 0.26s cubic-bezier(0.2,0.8,0.2,1)",
        }}
      >
        <Header onClose={onClose} briefing={briefing} loading={loading} />
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "0 18px 18px",
          }}
        >
          <StatsGrid count={count} onPick={setFilter} active={filter} />
          <div
            aria-hidden
            style={{
              height: 1,
              background: "rgba(255,255,255,0.06)",
              margin: "16px 0",
            }}
          />
          <SectionEyebrow>your metrics</SectionEyebrow>
          <MetricsBlock metrics={metrics} loading={loading} />
          <div
            aria-hidden
            style={{
              height: 1,
              background: "rgba(255,255,255,0.06)",
              margin: "16px 0",
            }}
          />
          <SectionEyebrow>activity</SectionEyebrow>
          <FilterPills value={filter} onChange={setFilter} />
          <NotifList loading={loading} rows={filtered} filter={filter} onClose={onClose} />
        </div>
        <Footer />
      </aside>
      <style jsx global>{`
        @keyframes otto-backdrop-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes otto-panel-in {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}

function Header({
  onClose,
  briefing,
  loading,
}: {
  onClose: () => void;
  briefing: string;
  loading: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: "22px 22px 18px",
        borderBottom: "0.5px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <SynapseBackdrop />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "relative",
          marginBottom: 12,
        }}
      >
        <MiniOrb />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            otto
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "rgba(255,180,150,0.78)",
              marginTop: 4,
            }}
          >
            your agent · online
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(255,255,255,0.7)",
            width: 30,
            height: 30,
            borderRadius: 999,
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontStyle: "italic",
          fontSize: 14,
          color: loading ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.78)",
          lineHeight: 1.5,
          position: "relative",
        }}
      >
        “{briefing}”
      </div>
    </div>
  );
}

function MiniOrb() {
  return (
    <div
      style={{
        position: "relative",
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "0.5px solid rgba(255,92,53,0.4)",
          animation: "otto-orbit-spin 8s linear infinite",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -1,
            left: "50%",
            transform: "translateX(-50%)",
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "#FF5C35",
          }}
        />
      </div>
      <div
        style={{
          width: 11,
          height: 11,
          borderRadius: "50%",
          background: "#FF5C35",
          boxShadow: "0 0 12px #FF5C35",
          animation: "otto-core-pulse 2.4s ease-in-out infinite",
        }}
      />
    </div>
  );
}

function SynapseBackdrop() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 220 110"
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        width: 220,
        height: "100%",
        opacity: 0.35,
        pointerEvents: "none",
      }}
    >
      <g stroke="#FF5C35" strokeWidth="0.5">
        <line x1="22" y1="22" x2="88" y2="55" />
        <line x1="88" y1="55" x2="176" y2="33" />
        <line x1="88" y1="55" x2="198" y2="77" />
        <line x1="22" y1="88" x2="88" y2="55" />
        <line x1="176" y1="33" x2="198" y2="77" />
      </g>
      <g fill="#FF5C35">
        <circle cx="22" cy="22" r="2" />
        <circle cx="88" cy="55" r="3" />
        <circle cx="176" cy="33" r="2" />
        <circle cx="198" cy="77" r="2" />
        <circle cx="22" cy="88" r="2" />
      </g>
    </svg>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.45)",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function StatsGrid({
  count,
  onPick,
  active,
}: {
  count: CountPayload | null;
  onPick: (f: Filter) => void;
  active: Filter;
}) {
  const tiles: Array<{ key: NotifType; label: string }> = [
    { key: "follow", label: "Follows" },
    { key: "connection", label: "Connections" },
    { key: "like", label: "Likes" },
    { key: "comment", label: "Comments" },
  ];
  return (
    <div
      style={{
        marginTop: 16,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
      }}
    >
      {tiles.map((t) => {
        const n = count?.totals?.[t.key] ?? 0;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick(t.key)}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: isActive
                ? "rgba(255,92,53,0.14)"
                : "rgba(255,255,255,0.04)",
              border: isActive
                ? "1px solid rgba(255,140,90,0.45)"
                : "1px solid rgba(255,255,255,0.08)",
              color: "white",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "DM Sans, sans-serif",
              transition: "background 120ms ease, border 120ms ease",
            }}
          >
            <div
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 22,
                fontWeight: 800,
                lineHeight: 1,
                color: isActive ? "#FFB89C" : "white",
              }}
            >
              {n}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.55)",
                marginTop: 4,
                letterSpacing: "0.04em",
              }}
            >
              {t.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MetricsBlock({
  metrics,
  loading,
}: {
  metrics: MetricsPayload | null;
  loading: boolean;
}) {
  // Three states: still fetching, fetched but empty (migration not applied
  // or no posts yet), or have data. Showing real text for each so a brand-new
  // account or a half-migrated deploy doesn't get a permanent "loading…".
  if (loading) {
    return (
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, padding: "8px 0" }}>
        loading metrics…
      </div>
    );
  }
  if (!metrics) {
    return (
      <div
        style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: 12,
          padding: "8px 0",
          fontStyle: "italic",
          fontFamily: "Fraunces, serif",
        }}
      >
        metrics not available yet — once posts + views land they&apos;ll show here.
      </div>
    );
  }
  const tiles: Array<{ n: number; label: string; accent?: boolean }> = [
    { n: metrics.profile_views.thirty_days, label: "Profile views (30d)", accent: true },
    { n: metrics.creator.views, label: "Post views" },
    { n: metrics.creator.likes, label: "Likes" },
    { n: metrics.creator.reposts, label: "Reposts" },
  ];
  return (
    <a
      href="/otto?tab=stats"
      aria-label="Open full metrics in Otto's command center"
      style={{
        display: "block",
        textDecoration: "none",
        borderRadius: 12,
        // Whole block deep-links to /otto's Stats tab so the side panel is
        // the synced entry-point to the full metrics surface.
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
        }}
      >
        {tiles.map((t, i) => (
          <div
            key={i}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: t.accent ? "rgba(255,92,53,0.14)" : "rgba(255,255,255,0.04)",
              border: t.accent
                ? "1px solid rgba(255,140,90,0.45)"
                : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 22,
                fontWeight: 800,
                lineHeight: 1,
                color: t.accent ? "#FFB89C" : "white",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatMetric(t.n)}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.55)",
                marginTop: 4,
                letterSpacing: "0.04em",
              }}
            >
              {t.label}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 11,
          color: "rgba(255,180,150,0.7)",
          textAlign: "right",
        }}
      >
        full breakdown in /otto →
      </div>
    </a>
  );
}

function formatMetric(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return Math.round(n / 1000) + "k";
}

function FilterPills({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (v: Filter) => void;
}) {
  const opts: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "follow", label: "Follows" },
    { id: "connection", label: "Connections" },
    { id: "like", label: "Likes" },
    { id: "comment", label: "Comments" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: active
                ? "1px solid rgba(255,140,90,0.45)"
                : "1px solid rgba(255,255,255,0.10)",
              background: active
                ? "rgba(255,92,53,0.14)"
                : "rgba(255,255,255,0.04)",
              color: active ? "#FFB89C" : "rgba(255,255,255,0.7)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function NotifList({
  loading,
  rows,
  filter,
  onClose,
}: {
  loading: boolean;
  rows: NotifRow[];
  filter: Filter;
  onClose: () => void;
}) {
  if (loading && rows.length === 0) {
    return (
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "12px 0" }}>
        loading…
      </div>
    );
  }
  if (rows.length === 0) {
    const msg =
      filter === "all"
        ? "no activity yet — go say hi to someone."
        : `no ${filter}s yet.`;
    return (
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, padding: "12px 0" }}>
        {msg}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((n) => (
        <NotifRowView key={n.id} n={n} onClose={onClose} />
      ))}
    </div>
  );
}

function verbFor(n: NotifRow): string {
  switch (n.type) {
    case "follow":
      return "started following you";
    case "connection":
      return "you're now connected";
    case "like":
      return "liked your post";
    case "comment":
      return "commented on your post";
    case "mention":
      return n.message_id ? "mentioned you in a chat" : "mentioned you";
    default:
      return "";
  }
}

function snippetFor(n: NotifRow): string {
  if (n.type === "comment" && n.comment?.content) return n.comment.content;
  if (
    (n.type === "like" || n.type === "mention" || n.type === "comment") &&
    n.post?.content
  ) {
    return n.post.content;
  }
  return "";
}

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function NotifRowView({ n, onClose }: { n: NotifRow; onClose: () => void }) {
  const a = n.actor;
  const initials = (a?.name ?? a?.handle ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  const display = a?.name ?? (a?.handle ? `@${a.handle}` : "someone");
  const verb = verbFor(n);
  const snippet = snippetFor(n);

  const onClick = () => {
    // Mention in chat → /messages
    if (n.type === "mention" && n.message_id && !n.post) {
      window.location.href = "/messages";
      onClose();
      return;
    }
    // Like / comment / mention on a post → open the post viewer
    // anchored on the *author's* profile so the row reads in context.
    // Falls back to /profile?post=<id> when the join didn't return an
    // author handle (defensive — should always be present in v1).
    if (
      (n.type === "like" || n.type === "comment" || n.type === "mention") &&
      n.post?.id
    ) {
      const authorHandle = n.post.author?.handle ?? null;
      const href = authorHandle
        ? `/profile/${encodeURIComponent(authorHandle)}?post=${encodeURIComponent(n.post.id)}`
        : `/profile?post=${encodeURIComponent(n.post.id)}`;
      window.location.href = href;
      onClose();
      return;
    }
    // Follow/connection → actor profile
    if (a?.handle) {
      window.location.href = `/profile/${encodeURIComponent(a.handle)}`;
      onClose();
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        gap: 10,
        padding: "10px 8px",
        background: n.read_at ? "transparent" : "rgba(255,92,53,0.06)",
        border: "none",
        borderRadius: 10,
        color: "white",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "DM Sans, sans-serif",
        transition: "background 120ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = n.read_at
          ? "transparent"
          : "rgba(255,92,53,0.06)";
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: a?.avatar_url
            ? `url(${a.avatar_url}) center/cover`
            : "rgba(255,255,255,0.08)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontFamily: "Fraunces, serif",
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        {!a?.avatar_url ? initials : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, lineHeight: 1.3 }}>
          <span style={{ fontWeight: 700 }}>{display}</span>{" "}
          <span style={{ color: "rgba(255,255,255,0.65)" }}>{verb}</span>
        </div>
        {snippet ? (
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontStyle: "italic",
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              marginTop: 4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            “{snippet.slice(0, 140)}”
          </div>
        ) : null}
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            marginTop: 4,
          }}
        >
          {relTime(n.created_at)}
        </div>
      </div>
    </button>
  );
}

function Footer() {
  return (
    <div
      style={{
        padding: "14px 22px",
        borderTop: "0.5px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}
    >
      <a
        href="/otto"
        style={{
          display: "block",
          textAlign: "center",
          color: "#FFB89C",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
          padding: "8px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,140,90,0.18)",
        }}
      >
        Open Otto&apos;s command center →
      </a>
    </div>
  );
}
