"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ClipViewerMobile } from "@/components/mobile/ClipViewerMobile";
import { PostViewerMobile } from "@/components/mobile/PostViewerMobile";
import { ResumeViewerMobile } from "@/components/mobile/ResumeViewerMobile";
import type { RedactionBar } from "@/lib/profile/resume-redactions";

/**
 * iOS-native mobile profile screen. Instagram-style layout: full-bleed
 * cover, avatar overlapping below, identity stack (stats / name /
 * handle / tagline / meta / vibe tags / Edit profile), Bio block, then
 * a tab strip with three panes:
 *
 *   - Posts      — feed posts as a 1:1 grid
 *   - Clips      — 9:16 short videos as a 9:14 grid with play overlay
 *   - Portfolio  — recruiter-facing pane: "Working on" (currentlyOn)
 *                  + work experience + resume / portfolio file
 *
 * Data sources:
 *   - /api/me/profile-bootstrap  → identity + work experience + resume
 *                                  (currentlyOn is not yet persisted
 *                                  server-side — Working-on shows an
 *                                  empty state until that lands)
 *   - /api/me/posts              → posts + clips (filtered by `type`)
 *
 * Identity stays in sync with desktop profile.html because both read
 * the same bootstrap shape.
 */

/**
 * Shape returned by `/api/me/profile-bootstrap` — actually the
 * `vibe_user_v1` shape from `buildVibeUserV1FromProfile`. NOT the raw
 * snake_case row. The naming is unusual (avatarPhoto / coverPhoto /
 * coverGradient / vibeTags) because this shape predates the React app
 * and was originally consumed by profile.html via localStorage. We
 * read the same shape on mobile so identity stays in sync across
 * surfaces.
 */
type VibeTag = { label?: string; color?: string };
type WorkExp = {
  title?: string;
  company?: string;
  dates?: string;
  location?: string;
  description?: string;
  logoUrl?: string;
};
type StudentVerification = { status?: string; school?: string };
type ResumeItem = { name?: string; type?: string; url?: string };
type CurrentProject = { icon?: string; text?: string };

type VibeUser = {
  name?: string | null;
  handle?: string | null;
  tagline?: string | null;
  headline?: string | null;
  avatarPhoto?: string | null;
  coverPhoto?: string | null;
  coverGradient?: string | null;
  location?: string | null;
  bio?: string | null;
  skills?: string[];
  vibeTags?: VibeTag[];
  studentVerification?: StudentVerification;
  workExperience?: WorkExp[];
  resumePortfolio?: ResumeItem[];
  /** "Currently working on" items — short text/icon pairs the user
   *  enters in their profile editor. Persisted to Supabase as
   *  users.current_on; this field is the camelCase mirror that the
   *  build-vibe-user-v1 builder emits. */
  currentlyOn?: CurrentProject[];
  /** Redaction bars overlaying the user's resume / portfolio.
   *  Persisted as users.resume_redactions; mirrored here as the
   *  camelCase key the build-vibe-user-v1 builder emits. */
  resumeRedactions?: RedactionBar[];
  counts?: {
    followers?: string | number;
    following?: string | number;
    connections?: string | number;
  };
  /** Set by /api/users/[handle]/bootstrap. true = this payload is for a
   *  visited user, not the signed-in viewer. */
  _isViewerMode?: boolean;
  /** Set alongside _isViewerMode. "none" | "following" | "followed_by"
   *  | "connected" | "self" — drives the Connect / Follow / Following
   *  pill state in visitor mode. */
  _viewerFollowState?: FollowState;
  /** Bootstrap short-circuit: target has blocked the viewer. Only
   *  minimal identity (name, handle, avatarPhoto) is included on the
   *  payload — everything else is intentionally omitted. */
  _blockedByTarget?: boolean;
  /** Bootstrap short-circuit: viewer has blocked the target. Same
   *  minimal payload; UI shows an Unblock button instead of the
   *  "restricted you" message. */
  _viewerHasBlocked?: boolean;
  /** Echoed alongside _blockedByTarget / _viewerHasBlocked so the
   *  Unblock button has a stable user id to call DELETE /api/me/block
   *  with, independent of handle changes. */
  id?: string;
};

type FollowState = "none" | "following" | "followed_by" | "connected" | "self";

/** Row shape from /api/me/posts. `type === "clip"` are 9:16 short videos
 *  shown in the Clips tab; everything else lands in Posts. */
type PostRow = {
  id: string;
  type?: string | null;
  content?: string | null;
  media_url?: string | null;
  media_thumbnail_url?: string | null;
  created_at?: string | null;
};

type ProfileTab = "posts" | "clips" | "portfolio";

function pick<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) {
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
}

const DEFAULT_BANNER_GRADIENT =
  "linear-gradient(135deg,#FFB8A0 0%,#C8B8FF 45%,#B8E4FF 100%)";

type Props = {
  /** Optional — when set, renders visitor mode for this handle. Omit
   *  for the signed-in user's own profile. Named `targetHandle` so it
   *  doesn't shadow the visited user's `handle` field we destructure
   *  out of `user` below. */
  targetHandle?: string;
};

export function ProfileMobile({ targetHandle }: Props = {}) {
  const isVisitor = !!targetHandle;
  const [user, setUser] = useState<VibeUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [tab, setTab] = useState<ProfileTab>("posts");
  /** Resume item the viewer should open. null = closed. */
  const [viewerItem, setViewerItem] = useState<ResumeItem | null>(null);
  /** Post id for the full-screen post viewer. null = closed. */
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  /** Clip id for the full-screen clip viewer. null = closed. */
  const [openClipId, setOpenClipId] = useState<string | null>(null);
  /** Visitor-mode follow state; mirrors the server value initially then
   *  flips optimistically when the user taps Connect / Follow. */
  const [followState, setFollowState] = useState<FollowState>("none");
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const endpoint = isVisitor
      ? `/api/users/${encodeURIComponent(targetHandle!)}/bootstrap`
      : "/api/me/profile-bootstrap";
    (async () => {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (!data?.ok || !data.vibeUser) {
          setError("Could not load profile");
          return;
        }
        const u = data.vibeUser as VibeUser;
        setUser(u);
        if (isVisitor && u._viewerFollowState) {
          setFollowState(u._viewerFollowState);
        }
      } catch {
        if (!cancelled) setError("Could not load profile");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisitor, targetHandle]);

  // Posts + clips fetch — same shape both ways, just routed by `handle`.
  useEffect(() => {
    let cancelled = false;
    const endpoint = isVisitor
      ? `/api/users/${encodeURIComponent(targetHandle!)}/posts`
      : "/api/me/posts";
    (async () => {
      try {
        const res = await fetch(endpoint, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data?.ok && Array.isArray(data.posts)) {
          setPosts(data.posts as PostRow[]);
        } else {
          setPosts([]);
        }
      } catch {
        if (!cancelled) setPosts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisitor, targetHandle]);

  // Follow/unfollow toggle for visitor mode. Optimistic so the pill
  // updates instantly; reverts on server error.
  const toggleFollow = async () => {
    if (!isVisitor || !targetHandle || followBusy) return;
    const wasFollowing = followState === "following" || followState === "connected";
    const next: FollowState = wasFollowing
      ? followState === "connected"
        ? "followed_by"
        : "none"
      : followState === "followed_by"
        ? "connected"
        : "following";
    setFollowBusy(true);
    setFollowState(next);
    try {
      const r = await fetch("/api/me/follow", {
        method: wasFollowing ? "DELETE" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_handle: targetHandle }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        // Roll back.
        setFollowState(followState);
      }
    } catch {
      setFollowState(followState);
    } finally {
      setFollowBusy(false);
    }
  };

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "#8A8580" }}>
        {error}
      </div>
    );
  }
  if (!user) {
    return <ProfileMobileSkeleton />;
  }
  if (user._blockedByTarget || user._viewerHasBlocked) {
    return <BlockedByTargetView user={user} />;
  }

  const name = pick(user.name) ?? "You";
  const handle = pick(user.handle);
  const tagline = pick(user.tagline);
  const headline = pick(user.headline);
  const avatar = pick(user.avatarPhoto);
  const banner = pick(user.coverPhoto);
  const gradient = pick(user.coverGradient) ?? DEFAULT_BANNER_GRADIENT;
  const location = pick(user.location);
  const bio = pick(user.bio);
  const verified = user.studentVerification?.status === "verified";
  const school = pick(user.studentVerification?.school);
  const skills = (user.skills ?? []).filter(Boolean).slice(0, 6);
  const tagsFromVibeTags = (user.vibeTags ?? [])
    .map((t) => t?.label)
    .filter((s): s is string => !!s)
    .slice(0, 6);
  const workExperience = (user.workExperience ?? []).slice(0, 4);
  const counts = user.counts ?? {};
  const followers = String(counts.followers ?? "0");
  const connections = String(counts.connections ?? "0");
  const resumePortfolio = (user.resumePortfolio ?? []).filter(
    (r) => !!r?.url,
  );
  const currentProjects = (user.currentlyOn ?? []).filter(
    (p) => !!p?.text,
  );
  const resumeRedactions = user.resumeRedactions ?? [];

  const feedPosts = (posts ?? []).filter((p) => (p.type ?? "post") !== "clip");
  const clipPosts = (posts ?? []).filter((p) => p.type === "clip");

  return (
    <div style={{ minHeight: "100dvh", background: "#FAF7F2", color: "#1C1C1E" }}>
      {/* Cover — full bleed, sits under the status bar (env() pads it). */}
      <div
        style={{
          position: "relative",
          height: "calc(200px + env(safe-area-inset-top, 0px))",
          paddingTop: "env(safe-area-inset-top, 0px)",
          background: banner ? `url(${banner}) center/cover` : gradient,
        }}
      >
        {/* Bottom-edge fade so the avatar reads cleanly against the cover */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, transparent 50%, rgba(250,247,242,0.55) 100%)",
            pointerEvents: "none",
          }}
        />
        {/* Floating top-right actions — pencil + settings for owners,
            nothing for visitors (visitor CTA sits in the identity stack
            below the avatar instead so it lands closer to the name). */}
        {isVisitor ? null : (
          <div
            style={{
              position: "absolute",
              top: "calc(env(safe-area-inset-top, 0px) + 14px)",
              right: 14,
              display: "flex",
              gap: 8,
            }}
          >
            <Link
              href="/profile?edit=1"
              aria-label="Edit profile"
              style={floatingActionStyle}
            >
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden>
                <path
                  d="M11.6 1.9l3.5 3.5-9.2 9.2H2.4v-3.5l9.2-9.2z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  fill="none"
                />
                <path
                  d="M10.2 3.3l3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
            <Link href="/settings" aria-label="Settings" style={floatingActionStyle}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <circle cx="9" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M9 1.5v2.2M9 14.3v2.2M16.5 9h-2.2M3.7 9H1.5M14.3 3.7l-1.55 1.55M5.25 12.75L3.7 14.3M14.3 14.3l-1.55-1.55M5.25 5.25L3.7 3.7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
          </div>
        )}
      </div>

      {/* Identity block — overlaps the cover */}
      <div style={{ padding: "0 16px", marginTop: -44 }}>
        {/* Avatar alone on its own row so the stats can breathe below it
            instead of sitting flush against the cover. position+z-index
            lifts it above the cover's bottom-fade overlay (positioned
            descendants outrank normal-flow siblings in paint order). */}
        <div style={{ position: "relative", zIndex: 1, marginBottom: 14 }}>
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 22,
              background: avatar
                ? `url(${avatar}) center/cover`
                : "#FFD3C2",
              border: "3px solid #FAF7F2",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Fraunces, serif",
              fontSize: 32,
              fontWeight: 800,
              color: "#1C1C1E",
            }}
          >
            {!avatar ? initialsOf(name) : null}
          </div>
        </div>

        {/* Stats row — own line below the avatar so it's no longer kissing
            the bottom edge of the banner. Centered and capped so the two
            counts have visual weight without spreading edge-to-edge. */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-around",
            gap: 12,
            maxWidth: 260,
            marginBottom: 16,
          }}
        >
          <StatTile num={followers} label="Followers" />
          <StatTile num={connections} label="Connections" prominent />
        </div>

        {/* Name + verified */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 2,
          }}
        >
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-0.6px",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            {name}
          </h1>
          {verified ? <VerifiedBadge school={school} /> : null}
        </div>

        {/* Handle */}
        {handle ? (
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#8A8580",
              marginBottom: 10,
            }}
          >
            @{handle}
          </div>
        ) : null}

        {/* Tagline */}
        {tagline ? (
          <p
            style={{
              fontFamily: "Fraunces, serif",
              fontStyle: "italic",
              fontSize: 16,
              color: "#5C5853",
              lineHeight: 1.45,
              margin: "0 0 12px",
            }}
          >
            “{tagline}”
          </p>
        ) : null}

        {/* Meta chips — headline already encodes major + year + department */}
        {(location || headline) ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 14,
            }}
          >
            {headline ? <MetaChip label={headline} icon="book" /> : null}
            {location ? <MetaChip label={location} icon="pin" /> : null}
          </div>
        ) : null}

        {/* Vibe tags */}
        {[...tagsFromVibeTags, ...skills].length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 18,
            }}
          >
            {[...tagsFromVibeTags, ...skills].slice(0, 8).map((tag) => (
              <span key={tag} style={vibeTagStyle}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {/* Owner: edit affordance lives in the cover top-right.
            Visitor: Connect / Follow CTA goes here, full-width and
            prominent (the primary call-to-action on someone else's
            profile). */}
        {isVisitor ? (
          <FollowButton
            state={followState}
            busy={followBusy}
            onTap={toggleFollow}
          />
        ) : null}
      </div>

      {/* Bio — stays in the header area, above the tab strip */}
      {bio ? (
        <Section title="Bio">
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#3D3D3A", margin: 0 }}>
            {bio}
          </p>
        </Section>
      ) : null}

      {/* Tab strip — Instagram-style. Posts, Clips, and a Resume tab
          aimed at recruiters (experience + portfolio + resume PDF). */}
      <ProfileTabs active={tab} onChange={setTab} />

      <div style={{ padding: "12px 16px 24px" }}>
        {tab === "posts" ? (
          <PostsGrid
            posts={feedPosts}
            loading={posts === null}
            isVisitor={isVisitor}
            ownerName={name}
            onOpenPost={setOpenPostId}
          />
        ) : tab === "clips" ? (
          <ClipsGrid
            clips={clipPosts}
            loading={posts === null}
            isVisitor={isVisitor}
            ownerName={name}
            onOpenClip={setOpenClipId}
          />
        ) : (
          <PortfolioPane
            currentProjects={currentProjects}
            workExperience={workExperience}
            resumePortfolio={resumePortfolio}
            onOpenDoc={(r) => setViewerItem(r)}
            isVisitor={isVisitor}
            ownerName={name}
          />
        )}
      </div>

      {viewerItem ? (
        <ResumeViewerMobile
          url={viewerItem.url ?? ""}
          type={viewerItem.type === "image" ? "image" : "pdf"}
          name={viewerItem.name ?? "Resume"}
          // Only doc 0 persists today (users.resume_url is a single
          // string), so the bars saved server-side all anchor to it.
          bars={resumeRedactions.filter((b) => b.docIndex === 0)}
          onClose={() => setViewerItem(null)}
        />
      ) : null}
      {openPostId ? (
        <PostViewerMobile
          postId={openPostId}
          onClose={() => setOpenPostId(null)}
        />
      ) : null}
      {openClipId ? (
        <ClipViewerMobile
          clipId={openClipId}
          onClose={() => setOpenClipId(null)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab strip + content panes
// ---------------------------------------------------------------------------

function ProfileTabs({
  active,
  onChange,
}: {
  active: ProfileTab;
  onChange: (t: ProfileTab) => void;
}) {
  const tabs: Array<{ id: ProfileTab; label: string; icon: React.ReactNode }> = [
    { id: "posts", label: "Posts", icon: <IconGrid /> },
    { id: "clips", label: "Clips", icon: <IconClip /> },
    { id: "portfolio", label: "Portfolio", icon: <IconResume /> },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        borderTop: "1px solid rgba(28,28,30,0.08)",
        borderBottom: "1px solid rgba(28,28,30,0.08)",
        background: "#FAF7F2",
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={isActive}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "12px 4px 10px",
              background: "transparent",
              border: "none",
              color: isActive ? "#1C1C1E" : "#8A8580",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span aria-hidden style={{ display: "inline-flex" }}>{t.icon}</span>
            {t.label}
            {isActive ? (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 34,
                  height: 2,
                  borderRadius: 2,
                  background: "#1C1C1E",
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function PostsGrid({
  posts,
  loading,
  isVisitor,
  ownerName,
  onOpenPost,
}: {
  posts: PostRow[];
  loading: boolean;
  isVisitor: boolean;
  ownerName: string;
  onOpenPost: (id: string) => void;
}) {
  if (loading) return <PostFeedSkeleton />;
  if (posts.length === 0) {
    return isVisitor ? (
      <EmptyTab title="No posts yet" body={`${ownerName} hasn't posted anything yet.`} />
    ) : (
      <EmptyTab
        title="No posts yet"
        body="Share a thought, a moment, or a photo — your posts land here."
        cta={{ href: "/campus?tab=feed", label: "Open the feed →" }}
      />
    );
  }
  // Single-column card feed — Vibe is text-first, so this reads
  // "here's what they've been saying" instead of pretending every
  // post is an Instagram tile. Image posts still show their image
  // inline above the text; text posts just read as the text.
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {posts.map((p) => (
        <PostFeedCard key={p.id} post={p} onTap={() => onOpenPost(p.id)} />
      ))}
    </div>
  );
}

function PostFeedCard({
  post,
  onTap,
}: {
  post: PostRow;
  onTap: () => void;
}) {
  const thumb = post.media_thumbnail_url || post.media_url || "";
  const isImage = !!thumb;
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: 16,
        // Liquid-glass card — a darker warm-tinted overlay on the cream
        // backdrop. Backdrop-blur lets the page color show through but
        // the dark tint + stronger shadow gives the card real
        // separation from the page instead of blending in.
        background:
          "linear-gradient(180deg, rgba(28,28,30,0.07) 0%, rgba(28,28,30,0.12) 100%)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
        border: "1px solid rgba(28,28,30,0.12)",
        boxShadow: [
          "inset 0 1px 0 rgba(255,255,255,0.45)",
          "inset 0 -1px 0 rgba(28,28,30,0.08)",
          "0 12px 28px rgba(28,28,30,0.10)",
        ].join(", "),
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "DM Sans, sans-serif",
        color: "#1C1C1E",
      }}
    >
      {post.content ? (
        <p
          style={{
            margin: 0,
            fontSize: 14.5,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            display: "-webkit-box",
            WebkitLineClamp: 6,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {renderInlineContentInline(post.content)}
        </p>
      ) : null}
      {isImage ? (
        <div
          style={{
            borderRadius: 10,
            overflow: "hidden",
            background: `url(${thumb}) center/cover, #EFEAE2`,
            aspectRatio: "1 / 1",
            border: "1px solid rgba(28,28,30,0.06)",
          }}
        />
      ) : null}
      <div
        style={{
          fontSize: 11,
          color: "#8A8580",
          letterSpacing: "0.04em",
        }}
      >
        {post.created_at ? relTimeForCard(post.created_at) : ""}
      </div>
    </button>
  );
}

// Inline @handle / #tag linkifier for the profile post card. Renders
// non-link spans for now (the entire card is one big <button>, so
// nested links would interfere); the linkified version lives in the
// post viewer modal which has independent click targets.
function renderInlineContentInline(text: string): React.ReactNode {
  if (!text) return null;
  const re = /(^|[^A-Za-z0-9_@#])([@#][A-Za-z0-9_]{1,32})/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    const leading = m[1] ?? "";
    const token = m[2] ?? "";
    const start = m.index + leading.length;
    if (start > lastIndex)
      nodes.push(<span key={`t${key++}`}>{text.slice(lastIndex, start)}</span>);
    nodes.push(
      <span key={`tok${key++}`} style={{ color: "#FF5C35", fontWeight: 600 }}>
        {token}
      </span>,
    );
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length)
    nodes.push(<span key={`t${key++}`}>{text.slice(lastIndex)}</span>);
  return nodes;
}

function relTimeForCard(iso: string): string {
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

function ClipsGrid({
  clips,
  loading,
  isVisitor,
  ownerName,
  onOpenClip,
}: {
  clips: PostRow[];
  loading: boolean;
  isVisitor: boolean;
  ownerName: string;
  onOpenClip: (id: string) => void;
}) {
  if (loading) return <GridSkeleton ratio="9/14" />;
  if (clips.length === 0) {
    return isVisitor ? (
      <EmptyTab title="No clips yet" body={`${ownerName} hasn't posted any clips yet.`} />
    ) : (
      <EmptyTab
        title="No clips yet"
        body="Clips are short, 9:16 video moments. Post one from the campus feed to get started."
      />
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 4,
      }}
    >
      {clips.map((p) => (
        <PostThumb
          key={p.id}
          post={p}
          ratio="9/14"
          overlay="play"
          onTap={() => onOpenClip(p.id)}
        />
      ))}
    </div>
  );
}

function PostThumb({
  post,
  ratio,
  overlay,
  onTap,
}: {
  post: PostRow;
  ratio: string;
  overlay?: "play";
  onTap?: () => void;
}) {
  const thumb = post.media_thumbnail_url || post.media_url || "";
  // Text-only posts (no media) get a different tile entirely — cream
  // surface with the actual content readable, not a fake-thumbnail
  // gradient pretending there's an image. Keeps the grid layout but
  // text posts read as text, not as Instagram tiles.
  const isTextOnly = !thumb;
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        position: "relative",
        aspectRatio: ratio,
        borderRadius: 6,
        overflow: "hidden",
        background: isTextOnly
          ? "linear-gradient(180deg,#FFFCF6 0%,#F5F0E5 100%)"
          : `url(${thumb}) center/cover`,
        border: isTextOnly ? "1px solid rgba(28,28,30,0.06)" : "none",
        boxShadow: isTextOnly ? "inset 0 1px 0 rgba(255,255,255,0.6)" : "none",
        padding: 0,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {isTextOnly ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            color: "#1C1C1E",
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          {/* Subtle quote glyph in the top-left so the tile reads as
              "a thought" rather than an empty card. */}
          <div
            aria-hidden
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 22,
              lineHeight: 1,
              color: "rgba(255,92,53,0.55)",
              fontWeight: 900,
            }}
          >
            &ldquo;
          </div>
          <div
            style={{
              fontSize: 11,
              lineHeight: 1.35,
              fontWeight: 500,
              color: "#1C1C1E",
              display: "-webkit-box",
              WebkitLineClamp: 5,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              flex: 1,
              marginTop: 4,
            }}
          >
            {(post.content ?? "").trim() || "Post"}
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#8A8580",
              marginTop: 6,
            }}
          >
            Text
          </div>
        </div>
      ) : null}
      {overlay === "play" ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.55)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor">
            <path d="M1.5 1L8 4.5 1.5 8z" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}

function PortfolioPane({
  currentProjects,
  workExperience,
  resumePortfolio,
  onOpenDoc,
  isVisitor,
  ownerName,
}: {
  currentProjects: CurrentProject[];
  workExperience: WorkExp[];
  resumePortfolio: ResumeItem[];
  onOpenDoc: (r: ResumeItem) => void;
  isVisitor: boolean;
  ownerName: string;
}) {
  const allEmpty =
    currentProjects.length === 0 &&
    workExperience.length === 0 &&
    resumePortfolio.length === 0;
  if (allEmpty) {
    if (isVisitor) {
      return (
        <EmptyTab
          title="Nothing here yet"
          body={`${ownerName} hasn't added projects, experience, or a resume yet.`}
        />
      );
    }
    return (
      <EmptyTab
        title="Nothing for recruiters yet"
        body="Show what you're working on, where you've worked, or upload a resume — recruiters land here when they vet candidates."
        cta={{ href: "/profile?edit=1", label: "Edit profile →" }}
      />
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Visitors only see subsections that have content — empty
          subsections with owner-instruction copy ("Add roles…") would
          be confusing on someone else's profile. */}
      {currentProjects.length > 0 || !isVisitor ? (
        <PortfolioSubsection title="Working on">
          {currentProjects.length === 0 ? (
            <SubsectionEmpty body="Show what you're building, learning, or planning. Adds context for recruiters and connections." />
          ) : (
            <ul style={projectListStyle}>
              {currentProjects.map((p, i) => (
                <li key={`${p.text}-${i}`} style={projectItemStyle}>
                  <span style={projectIconStyle} aria-hidden>
                    {p.icon || "✦"}
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1.4 }}>{p.text}</span>
                </li>
              ))}
            </ul>
          )}
        </PortfolioSubsection>
      ) : null}

      {workExperience.length > 0 || !isVisitor ? (
      <PortfolioSubsection title="Experience">
        {workExperience.length === 0 ? (
          <SubsectionEmpty body="Add roles, internships, and side gigs from your profile editor." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {workExperience.map((w, i) => (
              <div key={`${w.title}-${i}`} style={{ display: "flex", gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: w.logoUrl
                      ? `url(${w.logoUrl}) center/cover`
                      : "#FAF7F2",
                    border: "1px solid rgba(28,28,30,0.08)",
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {w.title ?? "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8580" }}>
                    {[w.company, w.dates, w.location]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  {w.description ? (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#5C5853",
                        marginTop: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      {w.description}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </PortfolioSubsection>
      ) : null}

      {resumePortfolio.length > 0 || !isVisitor ? (
      <PortfolioSubsection title="Resume">
        {resumePortfolio.length === 0 ? (
          <SubsectionEmpty body="Upload a PDF or portfolio image to give recruiters a quick reference document." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {resumePortfolio.map((r, i) => (
              <button
                key={`${r.url}-${i}`}
                type="button"
                onClick={() => onOpenDoc(r)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "#fff",
                  border: "1px solid rgba(28,28,30,0.08)",
                  borderRadius: 14,
                  color: "#1C1C1E",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,92,53,0.10)",
                    color: "#FF5C35",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  <IconResume />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {r.name ?? "Resume"}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A8580" }}>
                    {(r.type ?? "file").toUpperCase()} · tap to open in viewer
                  </div>
                </div>
                <span
                  aria-hidden
                  style={{
                    color: "#8A8580",
                    fontSize: 18,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ›
                </span>
              </button>
            ))}
          </div>
        )}
      </PortfolioSubsection>
      ) : null}
    </div>
  );
}

function PortfolioSubsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "-0.2px",
          marginBottom: 10,
          color: "#1C1C1E",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function SubsectionEmpty({ body }: { body: string }) {
  return (
    <p
      style={{
        fontSize: 13,
        color: "#8A8580",
        margin: 0,
        lineHeight: 1.5,
        padding: "12px 14px",
        background: "rgba(255,253,248,0.7)",
        border: "1px dashed rgba(28,28,30,0.12)",
        borderRadius: 12,
      }}
    >
      {body}
    </p>
  );
}

const projectListStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const projectItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  background: "#FAF7F2",
  border: "1px solid rgba(28,28,30,0.06)",
  borderRadius: 12,
  color: "#3D3D3A",
};
const projectIconStyle: React.CSSProperties = {
  fontSize: 16,
  flexShrink: 0,
};

function PostFeedSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            padding: 14,
            borderRadius: 16,
            background:
              "linear-gradient(180deg, rgba(28,28,30,0.07) 0%, rgba(28,28,30,0.12) 100%)",
            backdropFilter: "blur(20px) saturate(140%)",
            WebkitBackdropFilter: "blur(20px) saturate(140%)",
            border: "1px solid rgba(28,28,30,0.12)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.45), 0 12px 28px rgba(28,28,30,0.10)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ height: 12, borderRadius: 6, background: "rgba(28,28,30,0.06)", width: "85%" }} />
          <div style={{ height: 12, borderRadius: 6, background: "rgba(28,28,30,0.06)", width: "60%" }} />
          <div style={{ height: 10, borderRadius: 6, background: "rgba(28,28,30,0.04)", width: 60, marginTop: 4 }} />
        </div>
      ))}
    </div>
  );
}

function GridSkeleton({ ratio = "1/1" }: { ratio?: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 4,
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            aspectRatio: ratio,
            background: "rgba(28,28,30,0.06)",
            borderRadius: 6,
          }}
        />
      ))}
    </div>
  );
}

function EmptyTab({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      style={{
        padding: "32px 18px",
        textAlign: "center",
        background: "rgba(255,253,248,0.65)",
        border: "1px dashed rgba(28,28,30,0.14)",
        borderRadius: 18,
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 16,
          color: "#1C1C1E",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p style={{ fontSize: 13, color: "#8A8580", margin: 0, lineHeight: 1.5 }}>
        {body}
      </p>
      {cta ? (
        <Link
          href={cta.href}
          style={{
            display: "inline-block",
            marginTop: 14,
            padding: "9px 16px",
            borderRadius: 999,
            background: "#FF5C35",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

// Tab strip icons — small, monochrome, 16px so they sit cleanly above text.
function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="1.5" width="4" height="4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="10.5" y="1.5" width="4" height="4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.5" y="10.5" width="4" height="4" stroke="currentColor" strokeWidth="1.3" />
      <rect x="10.5" y="10.5" width="4" height="4" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
function IconClip() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="3" y="1.5" width="10" height="13" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 5.5L10 8l-3.5 2.5z" fill="currentColor" />
    </svg>
  );
}
function IconResume() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="4" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------

function FollowButton({
  state,
  busy,
  onTap,
}: {
  state: FollowState;
  busy: boolean;
  onTap: () => void;
}) {
  const isFollowing = state === "following" || state === "connected";
  const label =
    state === "connected"
      ? "Connected"
      : state === "following"
        ? "Following"
        : state === "followed_by"
          ? "Follow back"
          : "Connect";
  const filled = !isFollowing;
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={busy}
      style={{
        display: "block",
        width: "100%",
        textAlign: "center",
        padding: "11px 16px",
        borderRadius: 14,
        background: filled
          ? state === "followed_by"
            ? "#FF5C35"
            : "#1C1C1E"
          : "rgba(255,255,255,0.7)",
        color: filled ? "#fff" : "#1C1C1E",
        border: filled
          ? "1px solid rgba(0,0,0,0.06)"
          : "1px solid rgba(28,28,30,0.18)",
        fontFamily: "DM Sans, sans-serif",
        fontWeight: 700,
        fontSize: 14,
        marginBottom: 22,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.65 : 1,
        boxShadow: filled
          ? "0 4px 14px rgba(0,0,0,0.12)"
          : "inset 0 1px 0 rgba(255,255,255,0.6)",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {isFollowing ? `${label} ✓` : label}
    </button>
  );
}

function BlockedByTargetView({ user }: { user: VibeUser }) {
  const name = pick(user.name) ?? "This user";
  const handle = pick(user.handle);
  const avatar = pick(user.avatarPhoto);
  const viewerHasBlocked = !!user._viewerHasBlocked;
  const firstName = ((name as string) || "").split(/\s+/)[0] || "them";
  const initials = ((name as string) || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const heading = viewerHasBlocked
    ? `You blocked ${firstName}`
    : "Profile unavailable";
  const bodyText = viewerHasBlocked
    ? "Unblock to see their content. You won’t be reconnected — you’ll need to Connect again."
    : "This account has restricted you. You can’t see their profile or message them.";
  const [busy, setBusy] = useState(false);
  const onUnblock = async () => {
    if (!user.id || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/me/block", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: user.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        setBusy(false);
        return;
      }
      // Reload so the visitor view re-runs cleanly with the full profile.
      window.location.reload();
    } catch {
      setBusy(false);
    }
  };
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "#FAF7F2",
        color: "#1C1C1E",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 32px",
        textAlign: "center",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: "50%",
          background: avatar
            ? `url(${avatar}) center/cover, #F0EBE3`
            : "#F0EBE3",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 18,
          overflow: "hidden",
          fontFamily: "Fraunces, serif",
          fontSize: 34,
          color: "#8A8580",
          filter: avatar ? "grayscale(.6)" : undefined,
          opacity: avatar ? 0.85 : 1,
        }}
      >
        {avatar ? null : initials || "?"}
      </div>
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 24,
          color: "#1C1C1E",
          marginBottom: 2,
        }}
      >
        {name}
      </div>
      {handle ? (
        <div style={{ fontSize: 13, color: "#8A8580", marginBottom: 28 }}>
          @{handle}
        </div>
      ) : (
        <div style={{ marginBottom: 28 }} />
      )}
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 18,
          color: "#1C1C1E",
          marginBottom: 6,
        }}
      >
        {heading}
      </div>
      <p
        style={{
          fontSize: 14,
          color: "#8A8580",
          lineHeight: 1.55,
          marginBottom: 28,
          maxWidth: 320,
        }}
      >
        {bodyText}
      </p>
      {viewerHasBlocked ? (
        <button
          type="button"
          onClick={onUnblock}
          disabled={busy}
          style={{
            display: "inline-block",
            padding: "11px 24px",
            borderRadius: 100,
            background: "#1C1C1E",
            color: "white",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          Unblock {firstName}
        </button>
      ) : (
        <Link
          href="/network"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            borderRadius: 100,
            background: "#1C1C1E",
            color: "white",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          ← Back
        </Link>
      )}
    </div>
  );
}

function StatTile({
  num,
  label,
  prominent,
}: {
  num: string;
  label: string;
  prominent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        minWidth: 56,
      }}
    >
      <span
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: prominent ? 22 : 20,
          color: prominent ? "#FF5C35" : "#1C1C1E",
          lineHeight: 1,
        }}
      >
        {num}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#8A8580",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function VerifiedBadge({ school }: { school?: string | null }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        background: "linear-gradient(135deg, #FFF0F0, #FFE5DB)",
        border: "1px solid rgba(153,0,0,0.18)",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        color: "#990000",
      }}
    >
      🎓 <strong style={{ color: "#1C1C1E", fontWeight: 700 }}>{school ?? "Student"}</strong>
    </span>
  );
}

function MetaChip({ label, icon }: { label: string; icon?: "pin" | "book" | "cal" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 10px",
        background: "#fff",
        border: "1px solid rgba(28,28,30,0.08)",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: "#5C5853",
      }}
    >
      {icon === "pin" ? "📍" : icon === "book" ? "📚" : icon === "cal" ? "🗓" : null}
      {label}
    </span>
  );
}

const floatingActionStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 999,
  background: "rgba(0,0,0,0.32)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#fff",
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.18)",
};

const vibeTagStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 12px",
  borderRadius: 999,
  background: "#FFF0EC",
  color: "#FF5C35",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        margin: "16px",
        padding: "18px 16px",
        background: "#fff",
        borderRadius: 18,
        border: "1px solid rgba(28,28,30,0.06)",
        boxShadow: "0 4px 18px rgba(0,0,0,0.04)",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 16,
          fontWeight: 800,
          letterSpacing: "-0.2px",
          marginBottom: 12,
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function ProfileMobileSkeleton() {
  return (
    <div style={{ minHeight: "100dvh", background: "#FAF7F2" }}>
      <div
        style={{
          height: "calc(200px + env(safe-area-inset-top, 0px))",
          background: DEFAULT_BANNER_GRADIENT,
          opacity: 0.55,
        }}
      />
      <div style={{ padding: 16, marginTop: -36 }}>
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: 22,
            background: "rgba(28,28,30,0.08)",
            border: "3px solid #FAF7F2",
          }}
        />
        <div
          style={{
            width: 160,
            height: 28,
            background: "rgba(28,28,30,0.08)",
            borderRadius: 8,
            marginTop: 14,
          }}
        />
        <div
          style={{
            width: 100,
            height: 14,
            background: "rgba(28,28,30,0.06)",
            borderRadius: 6,
            marginTop: 10,
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

