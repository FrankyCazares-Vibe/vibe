"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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
  const g = u.coverGradient;
  if (typeof g === "string" && g.trim()) return g.trim();
  return null;
}

const cardShell: React.CSSProperties = {
  display: "block",
  borderRadius: 12,
  overflow: "hidden",
  textDecoration: "none",
  border: "1px solid rgba(28, 28, 30, 0.08)",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.05)",
};

const bannerFallback =
  "linear-gradient(135deg, #EDE9E2 0%, #D8D2C8 45%, #C9C2B8 100%)";

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
        });
      } catch {
        if (!cancelled) setChip({ status: "idle" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (chip.status === "loading") {
    return (
      <Link href="/profile" style={{ ...cardShell, opacity: 0.65 }}>
        <div
          style={{
            height: BANNER_PREVIEW_H,
            background: "#E4E0D8",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 10px 12px",
            background: "white",
          }}
        >
          <div
            style={{
              width: AVATAR_SZ,
              height: AVATAR_SZ,
              borderRadius: 10,
              background: "#E4E0D8",
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0, flex: 1, paddingTop: 1 }}>
            <div
              style={{
                height: 12,
                borderRadius: 4,
                background: "#E4E0D8",
                marginBottom: 6,
                width: "72%",
              }}
            />
            <div
              style={{
                height: 9,
                borderRadius: 4,
                background: "#EFECE6",
                width: "48%",
              }}
            />
          </div>
        </div>
      </Link>
    );
  }

  if (chip.status === "idle") {
    return (
      <Link href="/profile" style={cardShell}>
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
            background: "white",
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
              style={{ fontSize: "12.5px", fontWeight: "600", color: "#1C1C1E" }}
            >
              You
            </div>
            <div style={{ fontSize: "11px", color: "#8A8580" }}>My profile</div>
          </div>
        </div>
      </Link>
    );
  }

  const { name, subtitle, avatarUrl, initials, bannerCss } = chip;

  return (
    <Link
      href="/profile"
      style={cardShell}
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
          background: "white",
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
              color: "#1C1C1E",
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
              color: "#8A8580",
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
