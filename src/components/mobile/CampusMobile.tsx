"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

import {
  BACKDROP_PRESETS,
  type BackdropKey,
  type CampusEvent,
  CampusBanner,
  ClipsReelInner,
  EventCard,
  type FeedPost as DesktopFeedPost,
  OttoFeedStrip,
} from "@/app/campus/campus-home";
import { ClipComposerMobile } from "@/components/mobile/ClipComposerMobile";
import { ClipViewerMobile } from "@/components/mobile/ClipViewerMobile";
import { MapMobile } from "@/components/mobile/MapMobile";
import { ConversationView } from "@/components/mobile/MessagesMobile";
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

type Tab = "feed" | "clips" | "events" | "orgs" | "chat" | "map";
const TAB_ORDER: Tab[] = ["feed", "clips", "events", "orgs", "chat", "map"];

// Use the desktop FeedPost shape so ClipsReelInner accepts our posts
// without any mapping.
type FeedPost = DesktopFeedPost;

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

// ---------- Component ----------

export function CampusMobile() {
  const [tab, setTab] = useState<Tab>("feed");
  const [feed, setFeed] = useState<FeedPost[] | null>(null);
  const [events, setEvents] = useState<CampusEvent[] | null>(null);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [openClipId, setOpenClipId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerKind, setComposerKind] = useState<"post" | "clip">("post");
  const [composerOrigin, setComposerOrigin] = useState<
    { x: number; y: number } | undefined
  >(undefined);
  const composerFabRef = useRef<HTMLButtonElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // ?channel=<id> deep link from /orgs/<handle> Channels list. When
  // present, force the Chat tab AND open the conversation view for
  // that channel right away. ConversationView fetches messages via
  // /api/me/threads/[id]/messages which handles org channels via
  // can_view_org_channel even if the channel isn't in the user's
  // pre-fetched threads list yet.
  const searchParams = useSearchParams();
  const initialChannelId = searchParams.get("channel") || null;
  // Discord-style drill-down state: tapping an org opens its channels
  // drawer, tapping a channel inside that drawer opens the conversation.
  // openChannel carries the channel info so ConversationView's top bar
  // can show #channel-name even if the thread isn't in the cached list.
  const [selectedOrgForChat, setSelectedOrgForChat] = useState<JoinedOrg | null>(null);
  const [openChannel, setOpenChannel] = useState<OpenChannel | null>(
    initialChannelId
      ? {
          id: initialChannelId,
          name: null,
          orgName: null,
          orgLogo: null,
          orgBackdrop: null,
        }
      : null,
  );
  useEffect(() => {
    if (initialChannelId) setTab("chat");
  }, [initialChannelId]);

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

  useEffect(() => {
    void refetchFeed();
    void refetchEvents();
    void refetchOrgs();
  }, [refetchFeed, refetchEvents, refetchOrgs]);

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

  // Tabs that are dense / interactive enough that the Otto strip just
  // steals scroll real estate. On these we collapse Otto with a swoop-
  // down-into-the-tab-icon animation (see render below).
  const ottoCollapsed = tab === "orgs" || tab === "chat" || tab === "map";

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
      {/* IU crimson banner — school identity, live stats line, search bar,
          mobile-only Messages quick-link. Reused from desktop. */}
      <div
        style={{
          paddingTop: "env(safe-area-inset-top, 0px)",
          position: "sticky",
          top: 0,
          zIndex: 6,
        }}
      >
        <CampusBanner compactSearch onSearchTap={() => setSearchOpen(true)} />
      </div>

      {/* Otto horizontal strip — heads-up + trending. Tap a trending
          tag → switch to Feed (tag filtering is desktop-only for now).
          On orgs / chat / map we collapse it: the strip swoops down
          and shrinks toward the bottom Otto tab icon (3rd of 5, hence
          bottom-center as the transform-origin), freeing vertical
          space for those denser layouts. Tapping back to a Otto-friendly
          tab reverses the animation. */}
      <div
        style={{
          overflow: "hidden",
          maxHeight: ottoCollapsed ? 0 : 240,
          paddingTop: ottoCollapsed ? 0 : 10,
          paddingLeft: 12,
          paddingRight: 12,
          paddingBottom: 0,
          transition:
            "max-height 320ms cubic-bezier(.65,0,.35,1), padding-top 320ms cubic-bezier(.65,0,.35,1)",
          pointerEvents: ottoCollapsed ? "none" : undefined,
        }}
        aria-hidden={ottoCollapsed}
      >
        <div
          style={{
            transformOrigin: "50% 100%",
            transform: ottoCollapsed
              ? "translateY(48vh) scale(0.04)"
              : "translateY(0) scale(1)",
            opacity: ottoCollapsed ? 0 : 1,
            transition:
              "transform 380ms cubic-bezier(.65,0,.35,1), opacity 240ms ease-out",
            willChange: "transform, opacity",
          }}
        >
          <OttoFeedStrip
            onPickTag={() => {
              setTab("feed");
            }}
          />
        </div>
      </div>

      <header
        style={{
          padding: "10px 0 4px",
          background: "transparent",
          position: "sticky",
          top: ottoCollapsed
            ? "calc(env(safe-area-inset-top, 0px) + 56px)"
            : "calc(env(safe-area-inset-top, 0px) + 64px)",
          zIndex: 5,
          transition: "top 320ms cubic-bezier(.65,0,.35,1)",
        }}
      >
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
        <section style={clipsPaneStyle}>
          <ClipsPane posts={feed} />
        </section>
        <section style={paneStyle}>
          <EventsPane events={events} onMutate={refetchEvents} />
        </section>
        <section style={paneStyle}>
          <OrgsPane orgs={orgs} />
        </section>
        <section style={paneStyle}>
          <ChatPane onSelectOrg={(o) => setSelectedOrgForChat(o)} />
        </section>
        <section style={mapPaneStyle}>
          <MapPane />
        </section>
      </div>

      {/* Composer FAB — only on Feed + Clips. Events, Orgs, Chat, and
          Map have no composer flow, and on those tabs the orange + just
          covered content (e.g. the chat send button or a map bubble). */}
      {tab === "feed" || tab === "clips" ? (
        <ComposerFab
          ref={composerFabRef}
          onPost={() => openComposer("post")}
          onClip={() => openComposer("clip")}
        />
      ) : null}

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

      {/* Search overlay (mobile) — replaces the squished search bar
          in the banner. Tap the search icon → this slides in from the
          top with a focused input + live results. */}
      {searchOpen ? (
        <CampusSearchOverlay onClose={() => setSearchOpen(false)} />
      ) : null}

      {/* Org channels drawer — Discord-style. Swipes in when an org
          is tapped on the Chat tab. Holds the channel list + back +
          search; tapping a channel mounts ConversationView below. */}
      {selectedOrgForChat ? (
        <OrgChannelsDrawer
          org={selectedOrgForChat}
          onClose={() => setSelectedOrgForChat(null)}
          onOpenChannel={(c) => setOpenChannel(c)}
        />
      ) : null}

      {/* Channel conversation — opens from the channels drawer OR from
          a /campus?tab=chat&channel=<id> deep link. Reuses
          MessagesMobile's ConversationView so the chat UX, send flow,
          and 3-dot menu all behave identically. */}
      {openChannel ? (
        <ConversationView
          threadId={openChannel.id}
          thread={synthesizeChannelThread(openChannel)}
          onClose={() => setOpenChannel(null)}
          backdropCss={
            openChannel.orgBackdrop
              ? BACKDROP_PRESETS[openChannel.orgBackdrop]?.css ?? null
              : null
          }
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

// Clips reel is full-bleed scroll-snap, manages its own padding.
const clipsPaneStyle: React.CSSProperties = {
  flex: "0 0 100%",
  scrollSnapAlign: "start",
  minWidth: 0,
  padding: 0,
};

// Map needs full pane height for the canvas, no horizontal padding.
const mapPaneStyle: React.CSSProperties = {
  flex: "0 0 100%",
  scrollSnapAlign: "start",
  minWidth: 0,
  padding: 0,
  overflow: "hidden",
};

function TabStrip({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "feed", label: "Feed" },
    { id: "clips", label: "Clips" },
    { id: "events", label: "Events" },
    { id: "orgs", label: "Orgs" },
    { id: "chat", label: "Chat" },
    { id: "map", label: "Map" },
  ];
  return (
    <div
      className="vibe-no-scrollbar"
      style={{
        display: "flex",
        gap: 6,
        padding: "0 16px 8px",
        overflowX: "auto",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        WebkitOverflowScrolling: "touch",
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
              flexShrink: 0,
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

  // Local engagement state, seeded from the feed payload. Heart +
  // double-tap-to-like + repost + save all flow through their own
  // optimistic toggles with rollback on network failure. Save state
  // isn't in the feed payload so it starts unsaved; tapping seeds it.
  const [liked, setLiked] = useState(!!post.viewer_liked);
  const [likeCount, setLikeCount] = useState(post.like_count ?? 0);
  const [reposted, setReposted] = useState(!!post.viewer_reposted);
  const [repostCount, setRepostCount] = useState(post.repost_count ?? 0);
  const [saved, setSaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const tapTimerRef = useRef<number | null>(null);
  const likingRef = useRef(false);
  const repostingRef = useRef(false);
  const savingRef = useRef(false);

  const toggleLike = useCallback(async () => {
    if (likingRef.current) return;
    likingRef.current = true;
    const targetLiked = !liked;
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(targetLiked);
    setLikeCount((n) => Math.max(0, n + (targetLiked ? 1 : -1)));
    try {
      const r = await fetch(`/api/posts/${post.id}/like`, {
        method: targetLiked ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Like failed");
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
    } finally {
      likingRef.current = false;
    }
  }, [liked, likeCount, post.id]);

  const toggleRepost = useCallback(async () => {
    if (repostingRef.current) return;
    repostingRef.current = true;
    const target = !reposted;
    const prevReposted = reposted;
    const prevCount = repostCount;
    setReposted(target);
    setRepostCount((n) => Math.max(0, n + (target ? 1 : -1)));
    try {
      const r = await fetch(`/api/posts/${post.id}/repost`, {
        method: target ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Repost failed");
    } catch {
      setReposted(prevReposted);
      setRepostCount(prevCount);
    } finally {
      repostingRef.current = false;
    }
  }, [reposted, repostCount, post.id]);

  const toggleSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const target = !saved;
    const prev = saved;
    setSaved(target);
    try {
      const r = await fetch(`/api/posts/${post.id}/save`, {
        method: target ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error("Save failed");
    } catch {
      setSaved(prev);
    } finally {
      savingRef.current = false;
    }
  }, [saved, post.id]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    };
  }, []);

  // Manual tap-vs-double-tap split. Single tap fires after 240ms so the
  // double-tap window has time to land. Double-tap toggles like once
  // (so it works as both "like" and "unlike") — was force-liking each
  // time, which made repeated double-taps stack the count.
  const handleCardClick = useCallback(() => {
    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      void toggleLike();
      return;
    }
    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      onOpen();
    }, 240);
  }, [onOpen, toggleLike]);

  return (
    <button
      type="button"
      onClick={handleCardClick}
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
        position: "relative",
        overflow: "hidden",
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
        {/* 3-dot menu — top right of the card. Holds Report / Copy
            link / Hide for now; owner-only Delete lives in the post
            viewer (kept off the card to avoid clutter). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(true);
          }}
          aria-label="More actions"
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            border: "1px solid rgba(28,28,30,0.06)",
            background: "rgba(255,255,255,0.62)",
            color: "#5C5853",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="3" cy="8" r="1.6" />
            <circle cx="8" cy="8" r="1.6" />
            <circle cx="13" cy="8" r="1.6" />
          </svg>
        </button>
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

      {/* Friend-repost social proof — Instagram-style "X reposted this"
          pill. Only renders when at least one of the viewer's friends
          reposted; we never show generic popularity here. */}
      {post.friend_reposters && post.friend_reposters.length > 0 ? (
        <div
          style={{
            marginTop: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px 4px 4px",
            borderRadius: 999,
            background: "rgba(46,160,72,0.10)",
            border: "1px solid rgba(46,160,72,0.22)",
            color: "#1F6B3A",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          <div style={{ display: "inline-flex", marginRight: 2 }}>
            {post.friend_reposters.slice(0, 3).map((u, i) => (
              <span
                key={u.id}
                aria-hidden
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: u.avatar_url
                    ? `url(${u.avatar_url}) center/cover`
                    : "#FFD3C2",
                  border: "1.5px solid #FAF7F2",
                  marginLeft: i === 0 ? 0 : -6,
                }}
              />
            ))}
          </div>
          {friendRepostLabel(post)}
        </div>
      ) : null}

      {/* Action row — heart + comments + views. Heart is a real button
          and stops click propagation so toggling like doesn't also
          fire the card's tap-to-open. Double-tapping anywhere else on
          the card also likes (see handleCardClick). */}
      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: "DM Sans, sans-serif",
          fontSize: 12,
          color: "#8A8580",
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleLike();
          }}
          aria-label={liked ? "Unlike" : "Like"}
          aria-pressed={liked}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid rgba(28,28,30,0.06)",
            background: liked ? "rgba(255,92,53,0.10)" : "rgba(255,255,255,0.55)",
            color: liked ? "#E04A26" : "#5C5853",
            fontFamily: "inherit",
            fontWeight: 700,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            transition: "transform 140ms ease, background 140ms ease",
            transform: liked ? "scale(1.03)" : "scale(1)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill={liked ? "#FF5C35" : "none"}
            stroke={liked ? "#FF5C35" : "currentColor"}
            strokeWidth="1.8"
            aria-hidden
          >
            <path
              d="M10 17s-6-3.6-6-8.2A3.8 3.8 0 0 1 7.8 5c1.3 0 2.4.65 2.95 1.65A3.4 3.4 0 0 1 13.7 5 3.8 3.8 0 0 1 17.5 8.8C17.5 13.4 11.5 17 11.5 17z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {likeCount}
        </button>

        {/* Comment — opens the post viewer (which has the comments
            drawer); same destination as tapping the card body, just
            with the explicit icon affordance. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            // Cancel any pending single-tap timer so we don't double-fire.
            if (tapTimerRef.current) {
              window.clearTimeout(tapTimerRef.current);
              tapTimerRef.current = null;
            }
            onOpen();
          }}
          aria-label="Comment"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid rgba(28,28,30,0.06)",
            background: "rgba(255,255,255,0.55)",
            color: "#5C5853",
            fontFamily: "inherit",
            fontWeight: 700,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2.5 4a1.5 1.5 0 0 1 1.5-1.5h8a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 12 11.5H5.6L2.5 14V4z" />
          </svg>
          {post.comment_count}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleRepost();
          }}
          aria-label={reposted ? "Undo repost" : "Repost"}
          aria-pressed={reposted}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            borderRadius: 999,
            border: "1px solid rgba(28,28,30,0.06)",
            background: reposted
              ? "rgba(46,160,72,0.12)"
              : "rgba(255,255,255,0.55)",
            color: reposted ? "#2E8242" : "#5C5853",
            fontFamily: "inherit",
            fontWeight: 700,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            transition: "transform 140ms ease, background 140ms ease",
            transform: reposted ? "scale(1.03)" : "scale(1)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M4 9V7a2 2 0 0 1 2-2h10l-2.5-2.5" />
            <path d="M18 13v2a2 2 0 0 1-2 2H6l2.5 2.5" />
          </svg>
          {repostCount}
        </button>

        {/* Views — small inline metric. Kept subtle so the three
            action buttons read as the primary affordances. */}
        {post.view_count > 0 ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "#8A8580",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            {post.view_count}
          </span>
        ) : null}

        {/* Save (bookmark) — pinned to the right of the action row.
            Separate from like/repost since the save list is private
            to the viewer. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleSave();
          }}
          aria-label={saved ? "Unsave" : "Save"}
          aria-pressed={saved}
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: 999,
            border: "1px solid rgba(28,28,30,0.06)",
            background: saved
              ? "rgba(28,28,30,0.10)"
              : "rgba(255,255,255,0.55)",
            color: saved ? "#1C1C1E" : "#5C5853",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
            transition: "transform 140ms ease, background 140ms ease",
            transform: saved ? "scale(1.05)" : "scale(1)",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill={saved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 3.5h10v14L10 14l-5 3.5z" />
          </svg>
        </button>
      </div>

      {menuOpen ? (
        <PostActionsSheet
          postId={post.id}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
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

// ---------- Clips pane ----------

function ClipsPane({ posts }: { posts: FeedPost[] | null }) {
  if (posts === null) {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          color: "#5C5853",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 13,
        }}
      >
        Loading clips…
      </div>
    );
  }
  const clips = posts.filter((p) => p.type === "clip");
  if (clips.length === 0) {
    return (
      <div style={{ padding: "12px 16px" }}>
        <EmptyTab
          title="No clips yet"
          body="Tap the + to record one — yours will appear here once it's posted."
        />
      </div>
    );
  }
  return <ClipsReelInner clips={clips} />;
}

// ---------- Chat pane ----------

// Discord-style: Chat tab shows a dark surface listing the user's
// joined orgs (each as a server-card). Tap an org → channels drawer
// slides in from the right (own component below). Tap a channel in
// the drawer → ConversationView slides in over it.
function ChatPane({
  onSelectOrg,
}: {
  onSelectOrg: (org: JoinedOrg) => void;
}) {
  const [joinedOrgs, setJoinedOrgs] = useState<JoinedOrg[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/orgs?filter=mine", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        setJoinedOrgs(
          j?.ok && Array.isArray(j.orgs) ? (j.orgs as JoinedOrg[]) : [],
        );
      } catch {
        if (!cancelled) setJoinedOrgs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = (joinedOrgs ?? []).filter((o) =>
    query.trim()
      ? o.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        o.handle.toLowerCase().includes(query.trim().toLowerCase())
      : true,
  );

  return (
    <div
      style={{
        // Dark Discord-like surface that "persists" through the chat
        // navigation stack. The campus shell behind stays cream; this
        // pane covers it for the Chat tab.
        background:
          "linear-gradient(180deg, #1A1B1F 0%, #16171B 100%)",
        margin: "-12px -16px 0",
        padding: "14px 14px 32px",
        minHeight: "calc(100dvh - 220px)",
        color: "#E7E7EA",
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "-0.2px",
            color: "#fff",
          }}
        >
          Servers
        </span>
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "rgba(255,255,255,0.42)",
            display: "inline-flex",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          placeholder="Search servers"
          style={{
            width: "100%",
            padding: "9px 12px 9px 34px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            fontSize: 14,
            outline: "none",
            fontFamily: "DM Sans, sans-serif",
          }}
        />
      </div>

      {joinedOrgs === null ? (
        <ChatDarkSkeleton />
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: "48px 18px",
            textAlign: "center",
            color: "rgba(255,255,255,0.62)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13.5,
            lineHeight: 1.55,
          }}
        >
          {query.trim() ? (
            <>No servers match &ldquo;{query}&rdquo;.</>
          ) : (
            <>
              No org chats yet. Join an org to get its channels.
            </>
          )}
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {filtered.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                onClick={() => onSelectOrg(org)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.04)",
                  textAlign: "left",
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    background: org.logo_url
                      ? `url(${org.logo_url}) center/cover`
                      : "linear-gradient(135deg,#5865F2 0%,#7B5FE0 100%)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontFamily: "Fraunces, serif",
                    fontWeight: 800,
                    fontSize: 16,
                    flexShrink: 0,
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
                      fontFamily: "Fraunces, serif",
                      fontSize: 15.5,
                      fontWeight: 800,
                      color: "#fff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {org.name}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: 12,
                      color: "rgba(255,255,255,0.55)",
                      fontWeight: 600,
                    }}
                  >
                    @{org.handle}
                  </div>
                </div>
                <span
                  aria-hidden
                  style={{
                    color: "rgba(255,255,255,0.45)",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatDarkSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 70,
            borderRadius: 14,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        />
      ))}
    </div>
  );
}

type JoinedOrg = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified?: boolean;
  role?: string;
  backdrop_preset?: BackdropKey | null;
};

type ChannelRow = {
  id: string;
  name: string;
  topic: string | null;
  is_private: boolean;
  pinned: boolean | null;
  position: number | null;
};

/** Info passed from the channels drawer up to the parent so the
 *  ConversationView's top bar can render #name without a separate
 *  fetch. The channel id alone is enough to load messages — the
 *  rest is for chrome. */
type OpenChannel = {
  id: string;
  name: string | null;
  orgName: string | null;
  orgLogo: string | null;
  /** The org's chosen backdrop preset — drives the chat wallpaper so
   *  mobile matches what the user sees in desktop's ChannelMain. */
  orgBackdrop: BackdropKey | null;
};

/** Build a ThreadEntry-shaped object so ConversationView's top bar
 *  can show #channel-name + org logo, even for channels not yet in
 *  the user's pre-fetched threads list. */
function synthesizeChannelThread(c: OpenChannel) {
  if (!c.name) return null;
  return {
    id: c.id,
    type: "org" as const,
    name: `# ${c.name}`,
    photo_url: c.orgLogo,
    peer: null,
    members: [],
    last_message: null,
    last_read_at: null,
    accepted_at: new Date().toISOString(),
  } as Parameters<typeof ConversationView>[0]["thread"];
}

function sortChannels(a: ChannelRow, b: ChannelRow): number {
  if (!!b.pinned !== !!a.pinned) return Number(!!b.pinned) - Number(!!a.pinned);
  const ap = a.position ?? 1000;
  const bp = b.position ?? 1000;
  if (ap !== bp) return ap - bp;
  return a.name.localeCompare(b.name);
}

/** Discord-style channels drawer. Slides in from the right when an
 *  org is tapped on the Chat tab. Dark themed. Top bar has back +
 *  org name + search + settings. List shows channels grouped by
 *  Public / Private. Tap a channel → opens ConversationView via the
 *  parent's onOpenChannel callback. */
function OrgChannelsDrawer({
  org,
  onClose,
  onOpenChannel,
}: {
  org: JoinedOrg;
  onClose: () => void;
  onOpenChannel: (c: OpenChannel) => void;
}) {
  const [channels, setChannels] = useState<ChannelRow[] | null>(null);
  const [query, setQuery] = useState("");

  // Hide the bottom tab bar while this drawer is up — reuses the
  // existing CSS rule that ConversationView leverages so the chat
  // stack feels fullscreen.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/orgs/${encodeURIComponent(org.handle)}/channels`,
          { cache: "no-store" },
        );
        const j = await r.json();
        if (cancelled) return;
        setChannels(
          j?.ok && Array.isArray(j.channels) ? (j.channels as ChannelRow[]) : [],
        );
      } catch {
        if (!cancelled) setChannels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.handle]);

  const all = (channels ?? []).filter((c) =>
    query.trim()
      ? c.name.toLowerCase().includes(query.trim().toLowerCase())
      : true,
  );
  const publicChannels = all.filter((c) => !c.is_private).sort(sortChannels);
  const privateChannels = all.filter((c) => c.is_private).sort(sortChannels);

  return (
    <Drawer.Root open direction="right" onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            // Sit below ConversationView (overlay 1099 / content 1100)
            // so opening a channel can stack the chat on top of this
            // drawer instead of being hidden behind it.
            zIndex: 1080,
          }}
        />
        <Drawer.Content
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            // Mirror the desktop chat backdrop: each org picks a preset
            // (cream / sand-purple / ember / deep-violet / forest / midnight)
            // in org settings, and that gradient now flows through the
            // mobile channel rail + the conversation below it. Falls back
            // to neutral dark when the org hasn't picked one yet.
            background:
              BACKDROP_PRESETS[
                (org.backdrop_preset ?? "cream") as BackdropKey
              ]?.css ?? "linear-gradient(180deg, #1A1B1F 0%, #16171B 100%)",
            color: "#E7E7EA",
            zIndex: 1081,
            outline: "none",
            display: "flex",
            flexDirection: "column",
          }}
          aria-describedby={undefined}
        >
          <Drawer.Title
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            {org.name} channels
          </Drawer.Title>

          {/* Top bar */}
          <header
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding:
                "calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px",
              background: "rgba(255,255,255,0.04)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              style={{
                width: 38,
                height: 38,
                borderRadius: 999,
                border: "none",
                background: "transparent",
                color: "#E7E7EA",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
                <path
                  d="M14 4L7 11l7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: org.logo_url
                  ? `url(${org.logo_url}) center/cover`
                  : "linear-gradient(135deg,#5865F2 0%,#7B5FE0 100%)",
                border: "1px solid rgba(255,255,255,0.10)",
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontFamily: "Fraunces, serif",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              {!org.logo_url
                ? org.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("")
                : null}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link
                href={`/orgs/${encodeURIComponent(org.handle)}`}
                style={{
                  fontFamily: "Fraunces, serif",
                  fontSize: 16,
                  fontWeight: 800,
                  color: "#fff",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "block",
                }}
              >
                {org.name}
              </Link>
              <div
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 11.5,
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: 600,
                }}
              >
                @{org.handle}
              </div>
            </div>
            <button
              type="button"
              aria-label="Org settings"
              title="Org settings (coming soon)"
              style={chatChromeBtnStyle}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M9 1.5v2M9 14.5v2M16.5 9h-2M3.5 9h-2M14.3 3.7l-1.4 1.4M5.1 12.9l-1.4 1.4M14.3 14.3l-1.4-1.4M5.1 5.1L3.7 3.7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>

          {/* Search */}
          <div
            style={{
              padding: "10px 14px 6px",
              flexShrink: 0,
            }}
          >
            <div style={{ position: "relative" }}>
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "rgba(255,255,255,0.42)",
                  display: "inline-flex",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder="Search channels"
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 34px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "DM Sans, sans-serif",
                }}
              />
            </div>
          </div>

          {/* Channel list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              padding: "6px 14px 24px",
            }}
          >
            {channels === null ? (
              <ChatDarkSkeleton />
            ) : all.length === 0 ? (
              <div
                style={{
                  padding: "36px 18px",
                  textAlign: "center",
                  color: "rgba(255,255,255,0.6)",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  lineHeight: 1.55,
                }}
              >
                {query.trim()
                  ? `No channels match "${query}"`
                  : "No channels yet"}
              </div>
            ) : (
              <>
                {publicChannels.length > 0 ? (
                  <ChannelGroupHeader label="Text channels" />
                ) : null}
                {publicChannels.map((c) => (
                  <DarkChannelRow
                    key={c.id}
                    channel={c}
                    onTap={() =>
                      onOpenChannel({
                        id: c.id,
                        name: c.name,
                        orgName: org.name,
                        orgLogo: org.logo_url,
                        orgBackdrop: org.backdrop_preset ?? null,
                      })
                    }
                  />
                ))}
                {privateChannels.length > 0 ? (
                  <>
                    <div style={{ height: 10 }} />
                    <ChannelGroupHeader label="Private" />
                  </>
                ) : null}
                {privateChannels.map((c) => (
                  <DarkChannelRow
                    key={c.id}
                    channel={c}
                    onTap={() =>
                      onOpenChannel({
                        id: c.id,
                        name: c.name,
                        orgName: org.name,
                        orgLogo: org.logo_url,
                        orgBackdrop: org.backdrop_preset ?? null,
                      })
                    }
                  />
                ))}
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ChannelGroupHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "6px 8px 6px",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.46)",
      }}
    >
      {label}
    </div>
  );
}

function DarkChannelRow({
  channel,
  onTap,
}: {
  channel: ChannelRow;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 10px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(255,255,255,0.03)",
        textAlign: "left",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        color: "inherit",
        marginBottom: 4,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: channel.is_private
            ? "rgba(198,176,255,0.85)"
            : "rgba(255,255,255,0.55)",
          fontFamily: "DM Sans, sans-serif",
          fontWeight: 800,
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        {channel.is_private ? (
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
            <rect x="2.5" y="5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
            <path d="M4 5V3.6a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
          </svg>
        ) : (
          "#"
        )}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {channel.name}
          </span>
          {channel.pinned ? (
            <span
              aria-label="Pinned"
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "rgba(255,224,168,0.92)",
                background: "rgba(240,200,74,0.16)",
                border: "1px solid rgba(240,200,74,0.32)",
                padding: "1px 5px",
                borderRadius: 999,
              }}
            >
              Pinned
            </span>
          ) : null}
        </div>
        {channel.topic ? (
          <div
            style={{
              marginTop: 1,
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11.5,
              color: "rgba(255,255,255,0.5)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {channel.topic}
          </div>
        ) : null}
      </div>
    </button>
  );
}

const chatChromeBtnStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: "rgba(255,255,255,0.78)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

// ---------- Map pane ----------

function MapPane() {
  // Native rebuild — pinch-zoom, pan, vaul zone sheet. The desktop
  // MapTabBody embed has been retired here (was visually squished on
  // phones); see MapMobile for the touch-first version.
  return <MapMobile />;
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
  // Partition into verified + unverified so the trusted accounts surface
  // first. Within each bucket sort alphabetically.
  const verified = orgs
    .filter((o) => !!o.verified)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const others = orgs
    .filter((o) => !o.verified)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      {verified.length > 0 ? (
        <>
          <OrgSectionHeader label="Verified" />
          {verified.map((o) => (
            <OrgRow key={o.id} org={o} />
          ))}
        </>
      ) : null}
      {others.length > 0 ? (
        <>
          {verified.length > 0 ? (
            <div style={{ height: 6 }} />
          ) : null}
          <OrgSectionHeader label="All orgs" />
          {others.map((o) => (
            <OrgRow key={o.id} org={o} />
          ))}
        </>
      ) : null}
    </>
  );
}

function OrgSectionHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "4px 4px 4px",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 11.5,
        color: "#8A8580",
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </div>
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

/** 3-dot menu sheet — slides up from the bottom. Holds Report, Copy
 *  link, and Hide. Owner-only Delete still lives in the post viewer
 *  (we'd rather not clutter the feed card with delete affordances).
 *
 *  Implemented as a portaled vaul Drawer so it doesn't inherit the
 *  feed card's button cursor / hover styles, and so the tap on the
 *  scrim closes it cleanly. */
function PostActionsSheet({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const report = useCallback(
    async (reasonCode: string) => {
      if (reporting) return;
      setReporting(true);
      try {
        const r = await fetch("/api/me/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_type: "post",
            target_id: postId,
            reason_code: reasonCode,
            reason: "",
          }),
        });
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Report failed");
        setToast("Reported — thanks for letting us know.");
        setTimeout(onClose, 900);
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Couldn't report");
        setReporting(false);
      }
    },
    [postId, reporting, onClose],
  );

  const copyLink = useCallback(async () => {
    try {
      const url = `${window.location.origin}/campus?post=${encodeURIComponent(postId)}`;
      await navigator.clipboard.writeText(url);
      setToast("Link copied.");
      setTimeout(onClose, 700);
    } catch {
      setToast("Couldn't copy link");
    }
  }, [postId, onClose]);

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
            zIndex: 1200,
          }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#FAF7F2",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
            zIndex: 1201,
            outline: "none",
          }}
        >
          <div
            aria-hidden
            style={{
              alignSelf: "center",
              margin: "10px auto 4px",
              width: 38,
              height: 4,
              borderRadius: 999,
              background: "rgba(28,28,30,0.18)",
            }}
          />
          <Drawer.Title
            style={{
              padding: "8px 18px 6px",
              fontFamily: "Fraunces, serif",
              fontSize: 14,
              fontWeight: 800,
              color: "#1C1C1E",
            }}
          >
            Post options
          </Drawer.Title>

          {toast ? (
            <div
              style={{
                margin: "0 14px 8px",
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(46,160,72,0.10)",
                border: "1px solid rgba(46,160,72,0.22)",
                color: "#1F6B3A",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12.5,
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              {toast}
            </div>
          ) : null}

          <ActionSheetRow label="Copy link" onClick={copyLink} />
          <ActionSheetRow
            label="Report post"
            tone="danger"
            onClick={() => void report("other")}
            disabled={reporting}
          />
          <ActionSheetRow
            label="Cancel"
            onClick={onClose}
            divider={false}
            bold
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ActionSheetRow({
  label,
  onClick,
  tone,
  divider = true,
  bold = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  tone?: "danger";
  divider?: boolean;
  bold?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      style={{
        display: "block",
        width: "100%",
        textAlign: "center",
        padding: "14px 16px",
        background: "transparent",
        border: "none",
        borderTop: divider ? "1px solid rgba(28,28,30,0.08)" : "none",
        color: tone === "danger" ? "#B83A1A" : "#1C1C1E",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 15,
        fontWeight: bold ? 800 : 600,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
    </button>
  );
}

/** "Alice reposted this" / "Alice and 4 others reposted this" — names
 *  for up to 2 friends, then collapse the tail into "and N others". */
function friendRepostLabel(post: FeedPost): string {
  const samples = post.friend_reposters ?? [];
  const total = post.friend_reposter_count ?? samples.length;
  if (samples.length === 0) return "Reposted by your network";
  const first = samples[0]!.name || (samples[0]!.handle ? `@${samples[0]!.handle}` : "Someone");
  if (total <= 1) return `${first} reposted this`;
  if (samples.length === 1 || total === 2) {
    const second = samples[1]
      ? samples[1].name || (samples[1].handle ? `@${samples[1].handle}` : null)
      : null;
    if (second && total === 2) return `${first} and ${second} reposted this`;
    return `${first} and ${total - 1} other${total - 1 === 1 ? "" : "s"} reposted this`;
  }
  return `${first} and ${total - 1} others reposted this`;
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

// ---------- Search overlay ----------

type SearchUser = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  major: string | null;
  year: string | number | null;
};

type SearchOrg = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
};

type SearchEvent = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  org_handle: string | null;
};

function CampusSearchOverlay({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [orgs, setOrgs] = useState<SearchOrg[]>([]);
  const [events, setEvents] = useState<SearchEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const seqRef = useRef(0);

  // Hide bottom tab bar while the search is up.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, []);

  // Autofocus on mount.
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  // Debounce.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 220);
    return () => clearTimeout(t);
  }, [value]);

  // Search fetch.
  useEffect(() => {
    if (!debounced) {
      setUsers([]);
      setOrgs([]);
      setEvents([]);
      setLoading(false);
      return;
    }
    const seq = ++seqRef.current;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/search?q=${encodeURIComponent(debounced)}&limit=8`,
          { credentials: "include", cache: "no-store" },
        );
        const j = r.ok ? await r.json() : { ok: false };
        if (seq !== seqRef.current) return;
        if (j?.ok) {
          setUsers(Array.isArray(j.users) ? j.users : []);
          setOrgs(Array.isArray(j.orgs) ? j.orgs : []);
          setEvents(Array.isArray(j.events) ? j.events : []);
        } else {
          setUsers([]);
          setOrgs([]);
          setEvents([]);
        }
      } catch {
        if (seq !== seqRef.current) return;
        setUsers([]);
        setOrgs([]);
        setEvents([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    })();
  }, [debounced]);

  const hasResults =
    users.length > 0 || orgs.length > 0 || events.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "#FAF7F2",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Search bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "calc(env(safe-area-inset-top, 0px) + 10px) 12px 10px",
          background: "rgba(250,247,242,0.96)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          borderBottom: "1px solid rgba(28,28,30,0.06)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cancel"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            background: "transparent",
            border: "none",
            color: "#1C1C1E",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path
              d="M14 4L7 11l7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div style={{ position: "relative", flex: 1 }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#8A8580",
              display: "inline-flex",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search people, orgs, events"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={{
              width: "100%",
              padding: "11px 14px 11px 38px",
              borderRadius: 14,
              border: "1px solid rgba(28,28,30,0.10)",
              background: "rgba(255,255,255,0.92)",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 15,
              color: "#1C1C1E",
              outline: "none",
            }}
          />
        </div>
      </header>

      {/* Results */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "10px 0 18px",
        }}
      >
        {!debounced ? (
          <SearchHint />
        ) : loading ? (
          <SearchLoading />
        ) : !hasResults ? (
          <EmptyTab
            title={`No matches for "${debounced}"`}
            body="Try a name, @handle, or org. Spelling matters."
          />
        ) : (
          <>
            {users.length > 0 ? (
              <SearchSection label="People">
                {users.map((u) => (
                  <SearchUserRow key={u.id} u={u} onPick={onClose} />
                ))}
              </SearchSection>
            ) : null}
            {orgs.length > 0 ? (
              <SearchSection label="Orgs">
                {orgs.map((o) => (
                  <SearchOrgRow key={o.id} o={o} onPick={onClose} />
                ))}
              </SearchSection>
            ) : null}
            {events.length > 0 ? (
              <SearchSection label="Events">
                {events.map((ev) => (
                  <SearchEventRow key={ev.id} ev={ev} onPick={onClose} />
                ))}
              </SearchSection>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function SearchSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ padding: "10px 16px 4px" }}>
      <div
        style={{
          padding: "0 0 6px",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#8A8580",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </section>
  );
}

function SearchUserRow({ u, onPick }: { u: SearchUser; onPick: () => void }) {
  const initials = (u.name ?? u.handle ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const yearLabel = u.year ? `Year ${u.year}` : null;
  return (
    <Link
      href={u.handle ? `/profile/${u.handle}` : "#"}
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 4px",
        textDecoration: "none",
        color: "inherit",
        borderBottom: "1px solid rgba(28,28,30,0.04)",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 999,
          background: u.avatar_url
            ? `url(${u.avatar_url}) center/cover`
            : "#FFD3C2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#1C1C1E",
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 15,
          flexShrink: 0,
          border: "1px solid rgba(255,255,255,0.6)",
        }}
      >
        {!u.avatar_url ? initials : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 15,
            fontWeight: 700,
            color: "#1C1C1E",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {u.name || (u.handle ? `@${u.handle}` : "Member")}
        </div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "#8A8580",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {[u.handle ? `@${u.handle}` : null, u.major, yearLabel]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
    </Link>
  );
}

function SearchOrgRow({ o, onPick }: { o: SearchOrg; onPick: () => void }) {
  return (
    <Link
      href={`/orgs/${encodeURIComponent(o.handle)}`}
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 4px",
        textDecoration: "none",
        color: "inherit",
        borderBottom: "1px solid rgba(28,28,30,0.04)",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: o.logo_url
            ? `url(${o.logo_url}) center/cover`
            : "linear-gradient(135deg,#FFD3C2 0%,#FF9D7E 100%)",
          flexShrink: 0,
          border: "1px solid rgba(255,255,255,0.6)",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "Fraunces, serif",
            fontSize: 15,
            fontWeight: 700,
            color: "#1C1C1E",
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {o.name}
          </span>
          {o.verified ? (
            <span
              aria-label="Verified"
              style={{
                width: 13,
                height: 13,
                borderRadius: "50%",
                background: "#5BD18C",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 8.5,
                fontWeight: 900,
              }}
            >
              ✓
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "#8A8580",
            fontWeight: 600,
          }}
        >
          @{o.handle}
        </div>
      </div>
    </Link>
  );
}

function SearchEventRow({
  ev,
  onPick,
}: {
  ev: SearchEvent;
  onPick: () => void;
}) {
  const when = new Date(ev.starts_at).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Link
      href={
        ev.org_handle
          ? `/orgs/${encodeURIComponent(ev.org_handle)}?event=${ev.id}`
          : "#"
      }
      onClick={onPick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 4px",
        textDecoration: "none",
        color: "inherit",
        borderBottom: "1px solid rgba(28,28,30,0.04)",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "linear-gradient(135deg,#FFD3C2 0%,#FF7A4D 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <rect x="2.5" y="4" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
          <path d="M2.5 7.5h13" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6 2v3M12 2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 15,
            fontWeight: 700,
            color: "#1C1C1E",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {ev.title}
        </div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "#8A8580",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {when}
          {ev.location ? ` · ${ev.location}` : ""}
        </div>
      </div>
    </Link>
  );
}

function SearchHint() {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        color: "#5C5853",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13.5,
        lineHeight: 1.55,
      }}
    >
      Search people, orgs, and events across campus.
      <br />
      Type a name, @handle, or topic.
    </div>
  );
}

function SearchLoading() {
  return (
    <div
      style={{
        padding: "32px 24px",
        textAlign: "center",
        color: "#8A8580",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
      }}
    >
      Searching…
    </div>
  );
}

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
