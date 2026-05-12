"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
   *  enters in their profile editor. Not persisted to Supabase yet;
   *  field stays optional and the Portfolio pane shows an empty state
   *  until the backend wire-through lands. */
  currentlyOn?: CurrentProject[];
  counts?: {
    followers?: string | number;
    following?: string | number;
    connections?: string | number;
  };
};

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

export function ProfileMobile() {
  const [user, setUser] = useState<VibeUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [tab, setTab] = useState<ProfileTab>("posts");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/profile-bootstrap", {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!data?.ok || !data.vibeUser) {
          setError("Could not load profile");
          return;
        }
        setUser(data.vibeUser as VibeUser);
      } catch {
        if (!cancelled) setError("Could not load profile");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Posts + clips fetch — same endpoint, filtered client-side by type.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/posts", { cache: "no-store" });
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
  }, []);

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
        {/* Settings gear — floating top-right, iOS pattern */}
        <Link
          href="/settings"
          aria-label="Settings"
          style={{
            position: "absolute",
            top: "calc(env(safe-area-inset-top, 0px) + 14px)",
            right: 14,
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
          }}
        >
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

        {/* Edit profile button */}
        <Link
          href="/profile?edit=1"
          style={{
            display: "block",
            width: "100%",
            textAlign: "center",
            padding: "11px 16px",
            borderRadius: 14,
            background: "#1C1C1E",
            color: "#fff",
            textDecoration: "none",
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 22,
            boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
          }}
        >
          Edit profile
        </Link>
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
          <PostsGrid posts={feedPosts} loading={posts === null} />
        ) : tab === "clips" ? (
          <ClipsGrid clips={clipPosts} loading={posts === null} />
        ) : (
          <PortfolioPane
            currentProjects={currentProjects}
            workExperience={workExperience}
            resumePortfolio={resumePortfolio}
          />
        )}
      </div>
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

function PostsGrid({ posts, loading }: { posts: PostRow[]; loading: boolean }) {
  if (loading) return <GridSkeleton />;
  if (posts.length === 0) {
    return (
      <EmptyTab
        title="No posts yet"
        body="Share a thought, a moment, or a photo — your posts land here."
        cta={{ href: "/campus?tab=feed", label: "Open the feed →" }}
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
      {posts.map((p) => (
        <PostThumb key={p.id} post={p} ratio="1/1" />
      ))}
    </div>
  );
}

function ClipsGrid({ clips, loading }: { clips: PostRow[]; loading: boolean }) {
  if (loading) return <GridSkeleton ratio="9/14" />;
  if (clips.length === 0) {
    return (
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
        <PostThumb key={p.id} post={p} ratio="9/14" overlay="play" />
      ))}
    </div>
  );
}

function PostThumb({
  post,
  ratio,
  overlay,
}: {
  post: PostRow;
  ratio: string;
  overlay?: "play";
}) {
  const thumb = post.media_thumbnail_url || post.media_url || "";
  return (
    <div
      style={{
        position: "relative",
        aspectRatio: ratio,
        borderRadius: 6,
        overflow: "hidden",
        background: thumb
          ? `url(${thumb}) center/cover`
          : "linear-gradient(135deg,#FFE5DB,#C8B8FF)",
      }}
    >
      {!thumb ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            fontSize: 11,
            color: "#fff",
            background: "rgba(0,0,0,0.18)",
            textAlign: "center",
            lineHeight: 1.3,
            fontWeight: 600,
          }}
        >
          {(post.content ?? "").slice(0, 60) || "Post"}
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
    </div>
  );
}

function PortfolioPane({
  currentProjects,
  workExperience,
  resumePortfolio,
}: {
  currentProjects: CurrentProject[];
  workExperience: WorkExp[];
  resumePortfolio: ResumeItem[];
}) {
  const allEmpty =
    currentProjects.length === 0 &&
    workExperience.length === 0 &&
    resumePortfolio.length === 0;
  if (allEmpty) {
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

      <PortfolioSubsection title="Resume">
        {resumePortfolio.length === 0 ? (
          <SubsectionEmpty body="Upload a PDF or portfolio image to give recruiters a quick reference document." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {resumePortfolio.map((r, i) => (
              <a
                key={`${r.url}-${i}`}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  background: "#fff",
                  border: "1px solid rgba(28,28,30,0.08)",
                  borderRadius: 14,
                  textDecoration: "none",
                  color: "#1C1C1E",
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
                    {(r.type ?? "file").toUpperCase()} · tap to open
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </PortfolioSubsection>
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

