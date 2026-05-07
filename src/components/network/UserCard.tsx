"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type UserCardProps = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  banner_url?: string | null;
  banner_gradient?: string | null;
  major: string | null;
  year: number | null;
  mutual_count: number;
  /** Optional secondary signal — e.g. "in 2 orgs" — appended to the meta line. */
  shared_org_count?: number;
  /**
   * Override the line under the name. If omitted, computed from major/year/
   * mutual_count/shared_org_count.
   */
  reason?: string;
  follow_state: "self" | "none" | "following" | "followed_by" | "connected";
  /** Called after a successful follow/unfollow/message so the parent can refresh. */
  onStateChange?: (next: UserCardProps["follow_state"]) => void;
};

const META_DOT = " · ";

function initialsOf(name: string | null, handle: string | null): string {
  const source = (name ?? handle ?? "?").trim();
  if (!source) return "?";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!)
    .join("")
    .toUpperCase();
}

function metaLine(
  major: string | null,
  year: number | null,
  mutuals: number,
  sharedOrgs: number,
  reason?: string,
): string {
  if (reason && reason.length > 0) {
    return [major, year ? String(year) : null, reason]
      .filter(Boolean)
      .join(META_DOT);
  }
  const parts: string[] = [];
  if (major) parts.push(major);
  if (year) parts.push(String(year));
  if (mutuals > 0) parts.push(`${mutuals} mutual${mutuals === 1 ? "" : "s"}`);
  if (sharedOrgs > 0)
    parts.push(sharedOrgs === 1 ? "1 shared org" : `${sharedOrgs} shared orgs`);
  return parts.join(META_DOT);
}

/**
 * Deterministic avatar tint per user id. Five warm pairs that all sit on the
 * cream backdrop — the card never reads as random color noise, just gentle
 * variety so a list of empty avatars stops looking like a single repeated
 * shape.
 */
const AVATAR_TINTS: ReadonlyArray<{
  bg: string;
  text: string;
  ring: string;
}> = [
  {
    bg: "linear-gradient(180deg, #FFD8B8 0%, #FFB890 100%)",
    text: "#7A3A18",
    ring: "rgba(255,140,90,0.32)",
  },
  {
    bg: "linear-gradient(180deg, #FFE7C2 0%, #F5C97A 100%)",
    text: "#7A4A0E",
    ring: "rgba(220,160,40,0.32)",
  },
  {
    bg: "linear-gradient(180deg, #E0D4FF 0%, #BBA8F5 100%)",
    text: "#3F2A75",
    ring: "rgba(123,95,224,0.30)",
  },
  {
    bg: "linear-gradient(180deg, #D6EBDC 0%, #A6CFB7 100%)",
    text: "#1F4D2E",
    ring: "rgba(70,140,90,0.30)",
  },
  {
    bg: "linear-gradient(180deg, #F8D6D6 0%, #E5A8A8 100%)",
    text: "#7A1F1F",
    ring: "rgba(200,80,80,0.30)",
  },
];

/**
 * Default banner gradients — used when a user hasn't picked their own. Same
 * peach→lavender→sky default as the profile cover, plus three alts so a
 * scrolling list stops feeling samey.
 */
const DEFAULT_BANNER_GRADIENTS: ReadonlyArray<string> = [
  "linear-gradient(135deg,#FFB8A0 0%,#C8B8FF 45%,#B8E4FF 100%)",
  "linear-gradient(135deg,#FFD27A 0%,#FF8C58 55%,#C84A20 100%)",
  "linear-gradient(135deg,#A8E6D5 0%,#9DC8E6 55%,#B8A0E0 100%)",
  "linear-gradient(135deg,#F8C8A8 0%,#E8A2B8 55%,#A28EE0 100%)",
];

function idHash(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return hash;
}

function tintFor(id: string) {
  return AVATAR_TINTS[Math.abs(idHash(id)) % AVATAR_TINTS.length]!;
}

function bannerStyleFor(
  id: string,
  banner_url: string | null | undefined,
  banner_gradient: string | null | undefined,
): React.CSSProperties {
  if (banner_url && banner_url.trim().length > 0) {
    return {
      backgroundImage: `url(${banner_url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (banner_gradient && banner_gradient.trim().length > 0) {
    return { background: banner_gradient };
  }
  const fallback =
    DEFAULT_BANNER_GRADIENTS[
      Math.abs(idHash(id)) % DEFAULT_BANNER_GRADIENTS.length
    ]!;
  return { background: fallback };
}

export function UserCard(props: UserCardProps) {
  const {
    id,
    name,
    handle,
    avatar_url,
    banner_url,
    banner_gradient,
    major,
    year,
    mutual_count,
    shared_org_count = 0,
    reason,
    follow_state,
    onStateChange,
  } = props;

  const profileHref = handle ? `/profile/${encodeURIComponent(handle)}` : null;
  const meta = metaLine(major, year, mutual_count, shared_org_count, reason);
  const tint = useMemo(() => tintFor(id), [id]);
  const bannerStyle = useMemo(
    () => bannerStyleFor(id, banner_url, banner_gradient),
    [id, banner_url, banner_gradient],
  );
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background:
          "linear-gradient(180deg, rgba(255,253,248,0.78) 0%, rgba(255,250,240,0.66) 100%)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        border: hovered
          ? "1px solid rgba(255,180,150,0.55)"
          : "1px solid rgba(255,255,255,0.7)",
        borderRadius: 18,
        boxShadow: hovered
          ? [
              "inset 0 1px 0 rgba(255,255,255,0.9)",
              "inset 0 -1px 0 rgba(28,28,30,0.04)",
              "0 14px 36px rgba(180,120,60,0.16)",
            ].join(", ")
          : [
              "inset 0 1px 0 rgba(255,255,255,0.85)",
              "inset 0 -1px 0 rgba(28,28,30,0.04)",
              "0 6px 22px rgba(180,120,60,0.08)",
            ].join(", "),
        color: "#1C1C1E",
        transform: hovered ? "translateY(-1px)" : "translateY(0)",
        transition:
          "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
      }}
    >
      <Link
        href={profileHref ?? "#"}
        aria-label={name || handle || "Profile"}
        style={{
          display: "block",
          width: 56,
          height: 56,
          borderRadius: 999,
          background: avatar_url
            ? `url(${avatar_url}) center/cover`
            : tint.bg,
          border: "1px solid rgba(255,255,255,0.92)",
          boxShadow: `0 2px 10px ${tint.ring}, 0 0 0 3px rgba(255,255,255,0.6)`,
          color: tint.text,
          flexShrink: 0,
          textDecoration: "none",
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 18,
          lineHeight: "54px",
          textAlign: "center",
        }}
      >
        {!avatar_url ? initialsOf(name, handle) : null}
      </Link>

      <div style={{ flex: 1, minWidth: 0 }}>
        <Link
          href={profileHref ?? "#"}
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 16,
              fontWeight: 800,
              color: "#1C1C1E",
              letterSpacing: "-0.01em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name || handle || "Member"}
            {handle ? (
              <span
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 500,
                  fontSize: 13,
                  color: "#8A8580",
                  marginLeft: 8,
                }}
              >
                @{handle}
              </span>
            ) : null}
          </div>
          {meta ? (
            <div
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12,
                color: "#5C5853",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {meta}
            </div>
          ) : null}
        </Link>
      </div>

      {/* Banner anchored to the right, just before the action button — name
          can grow into the available space without pushing the banner around. */}
      <Link
        href={profileHref ?? "#"}
        aria-hidden
        tabIndex={-1}
        style={{
          display: "block",
          height: 88,
          width: 360,
          borderRadius: 14,
          flexShrink: 0,
          ...bannerStyle,
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 8px rgba(28,28,30,0.08)",
        }}
      />

      {follow_state !== "self" ? (
        <ActionButton
          targetId={id}
          handle={handle}
          state={follow_state}
          onStateChange={onStateChange}
        />
      ) : null}
    </div>
  );
}

function ActionButton({
  targetId,
  handle,
  state,
  onStateChange,
}: {
  targetId: string;
  handle: string | null;
  state: "none" | "following" | "followed_by" | "connected" | "self";
  onStateChange?: (next: UserCardProps["follow_state"]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [hovered, setHovered] = useState(false);

  const follow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        const next = state === "followed_by" ? "connected" : "following";
        onStateChange?.(next);
      }
    } finally {
      setBusy(false);
    }
  };

  const unfollow = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/follow", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId }),
      });
      const data = await res.json();
      if (res.ok && data?.ok) {
        const next = state === "connected" ? "followed_by" : "none";
        onStateChange?.(next);
      }
    } finally {
      setBusy(false);
    }
  };

  const message = async () => {
    if (busy || !handle) return;
    setBusy(true);
    try {
      const res = await fetch("/api/me/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (res.ok && data?.ok && data.channel_id) {
        window.location.href = `/messages?channel=${data.channel_id}`;
      }
    } finally {
      setBusy(false);
    }
  };

  const ORANGE_FILLED: React.CSSProperties = {
    background: "linear-gradient(180deg, #FF7B4A 0%, #FF5C35 100%)",
    color: "#fff",
    border: "1px solid rgba(200,74,32,0.35)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32), 0 4px 12px rgba(255,92,53,0.22)",
  };
  const GOLD_OUTLINE: React.CSSProperties = {
    background: "rgba(255,200,90,0.16)",
    color: "#A06410",
    border: "1px solid rgba(200,140,30,0.45)",
  };
  const GHOST: React.CSSProperties = {
    background: "rgba(28,28,30,0.04)",
    color: "#1C1C1E",
    border: "1px solid rgba(28,28,30,0.14)",
  };
  const DANGER: React.CSSProperties = {
    background: "rgba(220,60,60,0.10)",
    color: "#B83030",
    border: "1px solid rgba(220,60,60,0.35)",
  };

  let label = "";
  let onClick: () => void = () => {};
  let style: React.CSSProperties = ORANGE_FILLED;

  if (state === "connected") {
    label = "Message";
    onClick = message;
    style = GHOST;
  } else if (state === "following") {
    label = hovered ? "Unfollow" : "Following";
    onClick = unfollow;
    style = hovered ? DANGER : GHOST;
  } else if (state === "followed_by") {
    label = "Connect back";
    onClick = follow;
    style = GOLD_OUTLINE;
  } else {
    label = "Connect";
    onClick = follow;
    style = ORANGE_FILLED;
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={busy}
      style={{
        ...style,
        padding: "8px 14px",
        borderRadius: 999,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.7 : 1,
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "background 120ms ease, color 120ms ease, border 120ms ease",
      }}
    >
      {label}
    </button>
  );
}
