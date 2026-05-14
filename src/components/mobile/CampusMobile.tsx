"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { type CampusEvent, EventCard } from "@/app/campus/campus-home";
import { ClipComposerMobile } from "@/components/mobile/ClipComposerMobile";
import { ClipViewerMobile } from "@/components/mobile/ClipViewerMobile";
import { PostComposerMobile } from "@/components/mobile/PostComposerMobile";
import { PostViewerMobile } from "@/components/mobile/PostViewerMobile";

/**
 * iOS-native rebuild of `/campus` for mobile. Three swipeable tabs:
 *
 *   - Feed       → posts + clips (mixed, vertical), with a clips-only
 *                  toggle that swaps the body for an embedded reel.
 *   - Events     → vertical stack of EventCard (reused from desktop).
 *   - Orgs       → list of orgs the viewer can browse/join.
 *
 * Sticky header has the school greeting + live "on Vibe / active now"
 * stats. Composer FAB at the bottom-right opens the appropriate
 * mobile composer (post or clip) based on the active tab.
 *
 * Sub-components shared with desktop: EventCard from campus-home.
 * Everything else is mobile-tuned (lighter chrome, single column,
 * larger tap targets).
 */

// ---------- Types ----------

type Tab = "feed" | "events" | "orgs";
const TAB_ORDER: Tab[] = ["feed", "events", "orgs"];

type FeedAuthor = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

type FeedOrg = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
} | null;

type FeedPost = {
  id: string;
  user_id: string;
  type: "post" | "clip";
  content: string;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  edit_metadata: import("@/lib/clip/edit-metadata").ClipEditMetadata | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  created_at: string;
  author: FeedAuthor | null;
  org: FeedOrg;
};

type Org = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  banner_url: string | null;
  description?: string | null;
  member_count?: number | null;
  verified?: boolean;
};

type CampusStats = {
  totalUsers: number;
  activeNow: number;
};

// ---------- Component ----------

export function CampusMobile() {
  const [tab, setTab] = useState<Tab>("feed");
  const [feed, setFeed] = useState<FeedPost[] | null>(null);
  const [events, setEvents] = useState<CampusEvent[] | null>(null);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [stats, setStats] = useState<CampusStats | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [openClipId, setOpenClipId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<"post" | "clip">("post");
  const [composerOrigin, setComposerOrigin] = useState<
    { x: number; y: number } | undefined
  >(undefined);
  const composerFabRef = useRef<HTMLButtonElement | null>(null);

  const tabScrollRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  // ---------- Initial fetches ----------

  const refetchFeed = useCallback(async () => {
    try {
      const r = await fetch("/api/feed?limit=50", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok && Array.isArray(j.entries)) {
        // /api/feed returns "entries" (posts + reposts). Flatten to the
        // post payload — reposts share the same FeedPost shape via .post.
        const posts: FeedPost[] = j.entries
          .map((e: { kind: string; post?: FeedPost }) => e.post)
          .filter((p: FeedPost | undefined): p is FeedPost => !!p);
        setFeed(posts);
      } else if (j?.ok && Array.isArray(j.posts)) {
        setFeed(j.posts as FeedPost[]);
      } else {
        setFeed([]);
      }
    } catch {
      setFeed([]);
    }
  }, []);

  const refetchEvents = useCallback(async () => {
    try {
      const r = await fetch("/api/events?limit=50", { cache: "no-store" });
      const j = await r.json();
      setEvents(j?.ok && Array.isArray(j.events) ? (j.events as CampusEvent[]) : []);
    } catch {
      setEvents([]);
    }
  }, []);

  const refetchOrgs = useCallback(async () => {
    try {
      const r = await fetch("/api/orgs", { cache: "no-store" });
      const j = await r.json();
      setOrgs(j?.ok && Array.isArray(j.orgs) ? (j.orgs as Org[]) : []);
    } catch {
      setOrgs([]);
    }
  }, []);

  const refetchStats = useCallback(async () => {
    try {
      const r = await fetch("/api/stats/campus", { cache: "no-store" });
      const j = await r.json();
      if (
        j?.ok &&
        typeof j.totalUsers === "number" &&
        typeof j.activeNow === "number"
      ) {
        setStats({ totalUsers: j.totalUsers, activeNow: j.activeNow });
      }
    } catch {
      /* silent — banner just shows skeleton */
    }
  }, []);

  useEffect(() => {
    void refetchFeed();
    void refetchEvents();
    void refetchOrgs();
    void refetchStats();
  }, [refetchFeed, refetchEvents, refetchOrgs, refetchStats]);

  // ---------- Swipeable tab scroll sync ----------

  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const idx = TAB_ORDER.indexOf(tab);
    if (idx < 0) return;
    const target = el.clientWidth * idx;
    if (Math.abs(el.scrollLeft - target) < 4) return;
    isProgrammaticScrollRef.current = true;
    el.scrollTo({ left: target, behavior: "smooth" });
    const t = window.setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 420);
    return () => window.clearTimeout(t);
  }, [tab]);

  // ---------- Composer FAB ----------

  const openComposer = (kind: "post" | "clip") => {
    const r = composerFabRef.current?.getBoundingClientRect();
    setComposerOrigin(
      r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : undefined,
    );
    setComposerKind(kind);
    setComposerOpen(true);
  };

  // ---------- Render ----------

  return (
    <main
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.40) 0%, rgba(255,222,180,0) 60%), " +
          "radial-gradient(110% 80% at 100% 100%, rgba(255,200,170,0.32) 0%, rgba(255,200,170,0) 60%), " +
          "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)",
        minHeight: "100dvh",
        position: "relative",
      }}
    >
      <header
        style={{
          padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 4px",
          background: "rgba(250, 247, 242, 0.86)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          position: "sticky",
          top: 0,
          zIndex: 5,
          borderBottom: "1px solid rgba(28,28,30,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.8px",
              color: "#1C1C1E",
              margin: 0,
            }}
          >
            Campus
          </h1>
          <CampusStatsLine stats={stats} />
        </div>
        <TabStrip active={tab} onChange={setTab} />
      </header>

      <div
        ref={tabScrollRef}
        onScroll={(e) => {
          if (isProgrammaticScrollRef.current) return;
          const el = e.currentTarget;
          const w = el.clientWidth;
          if (w === 0) return;
          const idx = Math.round(el.scrollLeft / w);
          const next = TAB_ORDER[idx];
          if (next && next !== tab) setTab(next);
        }}
        className="vibe-no-scrollbar"
        style={{
          display: "flex",
          overflowX: "auto",
          overflowY: "hidden",
          scrollSnapType: "x mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
          width: "100%",
        }}
      >
        <section style={paneStyle}>
          <FeedPane
            posts={feed}
            onOpenPost={(id) => setOpenPostId(id)}
            onOpenClip={(id) => setOpenClipId(id)}
          />
        </section>
        <section style={paneStyle}>
          <EventsPane events={events} onMutate={refetchEvents} />
        </section>
        <section style={paneStyle}>
          <OrgsPane orgs={orgs} />
        </section>
      </div>

      {/* Composer FAB — context-aware. On Feed it shows a single + that
          opens a tiny choice sheet (Post / Clip). On other tabs it
          jumps straight to the post composer since events / orgs don't
          have their own mobile composer flows yet. */}
      <ComposerFab
        ref={composerFabRef}
        onPost={() => openComposer("post")}
        onClip={() => openComposer("clip")}
      />

      {/* Composers */}
      {composerOpen && composerKind === "post" ? (
        <PostComposerMobile
          origin={composerOrigin}
          onClose={() => setComposerOpen(false)}
          onPosted={() => {
            void refetchFeed();
            setComposerOpen(false);
          }}
        />
      ) : null}
      {composerOpen && composerKind === "clip" ? (
        <ClipComposerMobile
          origin={composerOrigin}
          onClose={() => setComposerOpen(false)}
          onPosted={() => {
            void refetchFeed();
            setComposerOpen(false);
          }}
        />
      ) : null}

      {/* Viewers */}
      {openPostId ? (
        <PostViewerMobile
          postId={openPostId}
          onClose={() => setOpenPostId(null)}
          onDeleted={() => {
            void refetchFeed();
            setOpenPostId(null);
          }}
        />
      ) : null}
      {openClipId ? (
        <ClipViewerMobile
          clipId={openClipId}
          onClose={() => setOpenClipId(null)}
          onDeleted={() => {
            void refetchFeed();
            setOpenClipId(null);
          }}
        />
      ) : null}
    </main>
  );
}

// ---------- Sub-layout ----------

const paneStyle: React.CSSProperties = {
  flex: "0 0 100%",
  scrollSnapAlign: "start",
  padding: "12px 16px 96px",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

function CampusStatsLine({ stats }: { stats: CampusStats | null }) {
  if (!stats) {
    return (
      <span
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 11.5,
          color: "rgba(28,28,30,0.45)",
          fontWeight: 600,
        }}
      >
        loading…
      </span>
    );
  }
  return (
    <span
      style={{
        fontFamily: "DM Sans, sans-serif",
        fontSize: 11.5,
        color: "#5C5853",
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      <strong style={{ color: "#1C1C1E", fontWeight: 800 }}>
        {stats.activeNow.toLocaleString()}
      </strong>{" "}
      active · {stats.totalUsers.toLocaleString()} on Vibe
    </span>
  );
}

function TabStrip({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "feed", label: "Feed" },
    { id: "events", label: "Events" },
    { id: "orgs", label: "Orgs" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        marginTop: 10,
        paddingBottom: 8,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              border: "1px solid rgba(28,28,30,0.10)",
              background: isActive ? "#1C1C1E" : "rgba(255,255,255,0.7)",
              color: isActive ? "#fff" : "#5C5853",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Feed pane ----------

function FeedPane({
  posts,
  onOpenPost,
  onOpenClip,
}: {
  posts: FeedPost[] | null;
  onOpenPost: (id: string) => void;
  onOpenClip: (id: string) => void;
}) {
  if (posts === null) return <PaneSkeleton />;
  if (posts.length === 0) {
    return (
      <EmptyTab
        title="The feed is quiet"
        body="Be the first to drop a post or clip — tap the + in the corner."
      />
    );
  }
  return (
    <>
      {posts.map((p) => (
        <FeedCard
          key={p.id}
          post={p}
          onOpen={() =>
            p.type === "clip" ? onOpenClip(p.id) : onOpenPost(p.id)
          }
        />
      ))}
    </>
  );
}

function FeedCard({
  post,
  onOpen,
}: {
  post: FeedPost;
  onOpen: () => void;
}) {
  const author = post.author;
  const initials = (author?.name ?? author?.handle ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const time = relativeTime(post.created_at);
  const isClip = post.type === "clip";
  const hasMedia = !!post.media_url || !!post.media_thumbnail_url;
  const thumb = post.media_thumbnail_url || (isClip ? null : post.media_url);

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: "100%",
        background: "rgba(255,253,248,0.78)",
        border: "1px solid rgba(255,255,255,0.7)",
        borderRadius: 18,
        padding: 14,
        textAlign: "left",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: author?.avatar_url
              ? `url(${author.avatar_url}) center/cover`
              : "#FFD3C2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1C1C1E",
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 13,
            flexShrink: 0,
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {!author?.avatar_url ? initials || "?" : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 14,
              fontWeight: 800,
              color: "#1C1C1E",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {author?.name || (author?.handle ? `@${author.handle}` : "Member")}
          </div>
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11.5,
              color: "#8A8580",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            {author?.handle ? `@${author.handle} · ` : ""}
            {time}
            {post.org ? ` · ${post.org.name}` : ""}
          </div>
        </div>
        {isClip ? (
          <span
            aria-hidden
            style={{
              padding: "3px 8px",
              borderRadius: 999,
              background: "rgba(255,92,53,0.12)",
              color: "#FF5C35",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Clip
          </span>
        ) : null}
      </div>

      {post.content ? (
        <p
          style={{
            margin: "10px 0 0",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            color: "#1C1C1E",
            lineHeight: 1.45,
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {post.content}
        </p>
      ) : null}

      {hasMedia && thumb ? (
        <div
          style={{
            marginTop: 10,
            position: "relative",
            width: "100%",
            aspectRatio: isClip ? "9 / 12" : "1 / 1",
            borderRadius: 14,
            overflow: "hidden",
            background: `url(${thumb}) center/cover, #1C1C1E`,
          }}
        >
          {isClip ? (
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(0,0,0,0.55)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 1L13 8 3 15z" />
              </svg>
            </span>
          ) : null}
        </div>
      ) : null}

      {post.tags && post.tags.length > 0 ? (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {post.tags.slice(0, 4).map((t) => (
            <span
              key={t}
              style={{
                padding: "3px 9px",
                borderRadius: 999,
                background: "rgba(255,92,53,0.10)",
                color: "#B83A1A",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              #{t}
            </span>
          ))}
        </div>
      ) : null}

      {/* Counts strip */}
      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 14,
          fontFamily: "DM Sans, sans-serif",
          fontSize: 11.5,
          color: "#8A8580",
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}
      >
        <span>{post.like_count} likes</span>
        <span>{post.comment_count} comments</span>
        {post.view_count > 0 ? (
          <span>{post.view_count} views</span>
        ) : null}
      </div>
    </button>
  );
}

// ---------- Events pane ----------

function EventsPane({
  events,
  onMutate,
}: {
  events: CampusEvent[] | null;
  onMutate: () => void;
}) {
  if (events === null) return <PaneSkeleton />;
  if (events.length === 0) {
    return (
      <EmptyTab
        title="Nothing scheduled"
        body="When orgs or classmates create events, they'll surface here. Pull to refresh later."
      />
    );
  }
  return (
    <>
      {events.map((ev) => (
        <EventCard key={ev.id} ev={ev} onMutate={onMutate} />
      ))}
    </>
  );
}

// ---------- Orgs pane ----------

function OrgsPane({ orgs }: { orgs: Org[] | null }) {
  if (orgs === null) return <PaneSkeleton />;
  if (orgs.length === 0) {
    return (
      <EmptyTab
        title="No orgs here yet"
        body="Once orgs spin up on campus, you'll find them here."
      />
    );
  }
  return (
    <>
      {orgs.map((o) => (
        <OrgRow key={o.id} org={o} />
      ))}
    </>
  );
}

function OrgRow({ org }: { org: Org }) {
  return (
    <Link
      href={`/orgs/${encodeURIComponent(org.handle)}`}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "block",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 14,
          borderRadius: 18,
          background: "rgba(255,253,248,0.78)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)",
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: org.logo_url
              ? `url(${org.logo_url}) center/cover`
              : "linear-gradient(135deg,#FFD3C2 0%,#FF9D7E 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1C1C1E",
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 18,
            flexShrink: 0,
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {!org.logo_url
            ? org.name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? "")
                .join("")
            : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 16,
                fontWeight: 800,
                color: "#1C1C1E",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {org.name}
            </span>
            {org.verified ? (
              <span
                aria-label="Verified"
                title="Verified"
                style={{
                  display: "inline-flex",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#5BD18C",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 900,
                }}
              >
                ✓
              </span>
            ) : null}
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "#8A8580",
              fontWeight: 600,
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            @{org.handle}
            {typeof org.member_count === "number"
              ? ` · ${org.member_count} member${org.member_count === 1 ? "" : "s"}`
              : ""}
          </div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
          style={{ flexShrink: 0, color: "#8A8580" }}
        >
          <path
            d="M5 2l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Link>
  );
}

// ---------- Helpers ----------

function PaneSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 110,
            borderRadius: 18,
            background: "rgba(255,253,248,0.45)",
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        />
      ))}
    </>
  );
}

function EmptyTab({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        background: "rgba(255,253,248,0.6)",
        border: "1px dashed rgba(28,28,30,0.14)",
        borderRadius: 18,
        marginTop: 8,
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 17,
          color: "#1C1C1E",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13.5,
          color: "#5C5853",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = ms / 60000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.floor(min)}m ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.floor(hr)}h ago`;
  const d = hr / 24;
  if (d < 7) return `${Math.floor(d)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ---------- Composer FAB ----------

const ComposerFab = ({
  ref,
  onPost,
  onClip,
}: {
  ref: React.RefObject<HTMLButtonElement | null>;
  onPost: () => void;
  onClip: () => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close composer menu" : "Open composer"}
        style={{
          position: "fixed",
          right: 18,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)",
          width: 56,
          height: 56,
          borderRadius: 999,
          border: "none",
          background: "linear-gradient(135deg,#FF7A4D 0%,#FF5C35 60%,#E04A26 100%)",
          color: "#fff",
          boxShadow: "0 12px 30px rgba(255,92,53,0.42)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          WebkitTapHighlightColor: "transparent",
          transform: open ? "rotate(45deg)" : "rotate(0deg)",
          transition: "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
          <path
            d="M11 4v14M4 11h14"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open ? (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 49,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              right: 18,
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 144px)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "flex-end",
            }}
          >
            <FabAction
              label="New post"
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <rect x="2" y="3.5" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
                  <path d="M5 7h8M5 10h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              }
              onClick={() => {
                setOpen(false);
                onPost();
              }}
            />
            <FabAction
              label="New clip"
              icon={
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <rect x="2" y="4" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
                  <path d="M13 8l3-2v6l-3-2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
                </svg>
              }
              onClick={() => {
                setOpen(false);
                onClip();
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
};

function FabAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 16px",
        borderRadius: 999,
        border: "1px solid rgba(28,28,30,0.10)",
        background: "rgba(255,253,248,0.96)",
        color: "#1C1C1E",
        boxShadow: "0 8px 24px rgba(180,120,60,0.18)",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {icon}
      {label}
    </button>
  );
}
