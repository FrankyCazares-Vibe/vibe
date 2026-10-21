"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { YourClubsMenu } from "@/components/orgs/YourClubsMenu";
import { campusRowById } from "@/lib/iu/campuses";
import { schoolStripBackground } from "@/lib/iu/school-colors";
import { resolveCoverThemeCss } from "@/lib/profile/cover-themes";

const BANNER_PREVIEW_H = 48;
const AVATAR_SZ = 36;

type ChipState =
  | { status: "loading" }
  | { status: "idle" }
  | {
      status: "ready";
      name: string;
      subtitle: string;
      avatarUrl: string | null;
      initials: string;
      bannerCss: string | null;
      /** The home campus's school strip paint; null when no campus. */
      strip: string | null;
    };

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase().slice(0, 2);
}

function avatarUrlFromVibeUser(u: Record<string, unknown>): string | null {
  const raw = u.avatarPhoto;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const t = raw.trim();
  if (
    t.startsWith("https://") ||
    t.startsWith("http://") ||
    t.startsWith("data:")
  ) {
    return t;
  }
  return null;
}

function bannerCssFromVibeUser(u: Record<string, unknown>): string | null {
  const photo = u.coverPhoto;
  if (typeof photo === "string" && photo.trim()) {
    const t = photo.trim();
    if (t.startsWith("https://") || t.startsWith("http://")) {
      return `url(${JSON.stringify(t)}) center / cover no-repeat`;
    }
  }
  // coverGradient is a cover-theme KEY. Anything this doesn't recognize
  // resolves to null and the chip falls back to bannerFallback — a stored
  // value never reaches the DOM as CSS.
  return resolveCoverThemeCss(u.coverGradient);
}

// Theme tokens (globals.css), so the card follows Light and Night: paper
// body, charcoal name, muted subtitle, hairline border.
const cardShell: React.CSSProperties = {
  display: "block",
  position: "relative",
  borderRadius: 12,
  overflow: "hidden",
  // Never squeezed (Oct 21, 2026): LeftNav is a full-height column, and a
  // flex item that clips its overflow may shrink to nothing. When the menu
  // is taller than the window, the menu scrolls; the card keeps its size.
  flexShrink: 0,
  textDecoration: "none",
  background: "var(--paper)",
  border: "1px solid var(--hairline)",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.05)",
};

/** The "you" part of the card: the link to my profile, inside the card's frame. */
const meLink: React.CSSProperties = {
  display: "block",
  textDecoration: "none",
  color: "inherit",
};

const bannerFallback = "var(--chip-banner-fallback)";

/**
 * A 3px strip across the card's top edge in the viewer's HOME campus's
 * school colours (crimson, gold, or half and half for a shared campus). It's
 * an identity card, so it follows home, never a campus being visited.
 */
function SchoolStrip({ paint }: { paint: string | null }) {
  if (!paint) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: paint,
        zIndex: 1,
        // Decoration over the profile link: a click on it is a click on the card.
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Sidebar “you” card: banner preview + avatar + name (from profile-bootstrap).
 */
export function NavIdentityChip() {
  const [chip, setChip] = useState<ChipState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me/profile-bootstrap", {
          credentials: "include",
        });
        if (cancelled) return;
        if (!r.ok) {
          setChip({ status: "idle" });
          return;
        }
        const d = (await r.json()) as {
          ok?: boolean;
          vibeUser?: Record<string, unknown>;
          /** Home campus, validated against the school system (top level). */
          campusId?: unknown;
        };
        if (!d?.ok || !d.vibeUser) {
          setChip({ status: "idle" });
          return;
        }
        const u = d.vibeUser;
        const nameRaw = typeof u.name === "string" ? u.name.trim() : "";
        const name = nameRaw || "You";
        const headline =
          typeof u.headline === "string" ? u.headline.trim() : "";
        const tagline =
          typeof u.tagline === "string" ? u.tagline.trim() : "";
        const subtitle = headline || tagline || "My profile";
        setChip({
          status: "ready",
          name,
          subtitle,
          avatarUrl: avatarUrlFromVibeUser(u),
          initials: initialsFromName(name),
          bannerCss: bannerCssFromVibeUser(u),
          // Same response, no extra request: `campusId` is the viewer's home.
          strip: schoolStripBackground(
            campusRowById(typeof d.campusId === "string" ? d.campusId : null),
          ),
        });
      } catch {
        if (!cancelled) setChip({ status: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One frame in every state (Oct 21, 2026): "Your clubs" sits inside the
  // card under my name, and a link can't hold a button, so the card is a
  // frame holding the profile link, then the clubs row. The row stays the
  // frame's last child in every state, so it comes from its own caches at
  // once and never waits for (or depends on) the profile read. The frame
  // keeps the id the campus tour points at.
  let me: React.ReactNode;
  if (chip.status === "loading") {
    me = (
      <Link href="/profile" className="vibe-identity-me" style={{ ...meLink, opacity: 0.65 }}>
        <div
          style={{
            height: BANNER_PREVIEW_H,
            background: "var(--hairline)",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 10px 12px",
            background: "var(--paper)",
          }}
        >
          <div
            style={{
              width: AVATAR_SZ,
              height: AVATAR_SZ,
              borderRadius: 10,
              background: "var(--hairline)",
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0, flex: 1, paddingTop: 1 }}>
            <div
              style={{
                height: 12,
                borderRadius: 4,
                background: "var(--hairline)",
                marginBottom: 6,
                width: "72%",
              }}
            />
            <div
              style={{
                height: 9,
                borderRadius: 4,
                background: "var(--row-hover)",
                width: "48%",
              }}
            />
          </div>
        </div>
      </Link>
    );
  } else if (chip.status === "idle") {
    me = (
      <Link href="/profile" className="vibe-identity-me" style={meLink}>
        <div
          style={{
            height: BANNER_PREVIEW_H,
            background: bannerFallback,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 10px 12px",
            background: "var(--paper)",
          }}
        >
          <div
            style={{
              width: AVATAR_SZ,
              height: AVATAR_SZ,
              borderRadius: 10,
              background: "#1C1C1E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Fraunces, serif",
              fontSize: "12px",
              fontWeight: "700",
              color: "white",
              flexShrink: 0,
            }}
          >
            —
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingTop: 1 }}>
            <div
              style={{ fontSize: "12.5px", fontWeight: "600", color: "var(--charcoal)" }}
            >
              You
            </div>
            <div style={{ fontSize: "11px", color: "var(--ink-muted)" }}>My profile</div>
          </div>
        </div>
      </Link>
    );
  } else {
    const { name, subtitle, avatarUrl, initials, bannerCss } = chip;
    me = (
      <Link
        href="/profile"
        className="vibe-identity-me"
        style={meLink}
        title={`${name} — ${subtitle}`}
      >
        <div
          aria-hidden
          style={{
            height: BANNER_PREVIEW_H,
            width: "100%",
            background: bannerCss ?? bannerFallback,
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 10px 12px",
            background: "var(--paper)",
          }}
        >
          <div
            style={{
              width: AVATAR_SZ,
              height: AVATAR_SZ,
              borderRadius: 10,
              background: "#1C1C1E",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Fraunces, serif",
              fontSize: "12px",
              fontWeight: "700",
              color: "white",
              flexShrink: 0,
              overflow: "hidden",
            }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Supabase + data URLs
              <img
                src={avatarUrl}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : (
              initials
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingTop: 1 }}>
            <div
              style={{
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: "12.5px",
                fontWeight: "600",
                color: "var(--charcoal)",
                lineHeight: 1.38,
                letterSpacing: "-0.01em",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontSize: "11px",
                color: "var(--ink-muted)",
                lineHeight: 1.4,
                marginTop: 4,
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: 2,
                overflow: "hidden",
              }}
            >
              {subtitle}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div id="nav-identity-chip" style={cardShell}>
      <SchoolStrip paint={chip.status === "ready" ? chip.strip : null} />
      {me}
      <YourClubsMenu />
    </div>
  );
}
