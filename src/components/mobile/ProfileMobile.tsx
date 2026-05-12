"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * iOS-native mobile profile screen. Built from scratch (not a squished
 * profile.html) so we can use the native pattern: full-bleed cover
 * sitting flush with the status bar, avatar overlapping below, then a
 * clean stack of identity / stats / sections.
 *
 * MVP for the pilot — top section (cover, avatar, name, handle,
 * tagline, stats, meta, vibe tags, settings gear) + bio + work
 * experience. The rest of the sections (skills, currently into,
 * clips/vibes grid, resume viewer) will land in follow-up iterations
 * once the layout feels right.
 *
 * Data source: /api/me/profile-bootstrap. Same endpoint the desktop
 * profile.html bridge uses — so identity stays in sync.
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
  counts?: {
    followers?: string | number;
    following?: string | number;
    connections?: string | number;
  };
};

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
  const following = String(counts.following ?? "0");
  const connections = String(counts.connections ?? "0");

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
        <div
          style={{
            // position+z-index lifts the avatar row above the cover's
            // absolutely-positioned bottom-fade overlay. Without this,
            // the translucent gradient paints OVER the avatar in the
            // overlap zone (positioned descendants outrank normal-flow
            // siblings in paint order).
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "flex-end",
            gap: 14,
            marginBottom: 14,
          }}
        >
          {/* Avatar */}
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
              flexShrink: 0,
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

          {/* Stats row beside avatar */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              paddingBottom: 6,
              gap: 4,
            }}
          >
            <StatTile num={followers} label="Followers" />
            <StatTile num={following} label="Following" />
            <StatTile num={connections} label="Connections" prominent />
          </div>
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

      {/* Bio section */}
      {bio ? (
        <Section title="Bio">
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#3D3D3A", margin: 0 }}>
            {bio}
          </p>
        </Section>
      ) : null}

      {/* Work experience */}
      {workExperience.length > 0 ? (
        <Section title="Experience">
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
        </Section>
      ) : null}

      {/* Placeholder for future iterations */}
      <Section title="More coming">
        <p style={{ fontSize: 13, color: "#8A8580", margin: 0, lineHeight: 1.5 }}>
          Vibes (clips), skills detail, currently into, and the resume
          viewer ship in the next iteration of the mobile rebuild.
        </p>
      </Section>
    </div>
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

