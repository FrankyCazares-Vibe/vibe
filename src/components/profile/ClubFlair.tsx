"use client";

import Link from "next/link";
import { useState, type CSSProperties, type JSX } from "react";

import { clubFlairLabel, flairChips } from "@/lib/profile/club-flair";

import type { FlairClub } from "./clubs-model";

/**
 * Club flair on the phone profile (batch 2E; club model spec D): the small
 * chips under the @handle, and the round logo the Clubs section reuses.
 *
 * A chip reads "President · SAE" with a title, otherwise "SAE". Up to three,
 * titled clubs first, in the person's order (`flairChips`). No dates here:
 * "Member since" lives in the Clubs section only. The row scrolls sideways
 * inside itself, so the page never does at 375 px.
 */
export function ClubFlairChips({ clubs }: { clubs: readonly FlairClub[] }): JSX.Element | null {
  const chips = flairChips(clubs);
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Clubs" style={rowStyle}>
      {chips.map((club) => {
        const label = clubFlairLabel(club.name, club.title);
        // A long title gives way before the club's name does.
        const title = label === club.name ? null : club.title;
        return (
          <li key={club.handle} style={{ flexShrink: 0, listStyle: "none" }}>
            <Link
              href={`/orgs/${encodeURIComponent(club.handle)}`}
              aria-label={`${label}. Open the club's page`}
              style={chipStyle}
            >
              <ClubLogo name={club.name} url={club.logo_url} size={20} />
              {title ? (
                <>
                  <span aria-hidden="true" style={titlePartStyle}>{title}</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span aria-hidden="true" style={labelStyle}>{club.name}</span>
              {club.verified ? <VerifiedTick size={12} /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** A round club logo; the name's first letter when there is none or it fails. */
export function ClubLogo({
  name,
  url,
  size,
}: {
  name: string;
  url: string | null;
  size: number;
}): JSX.Element {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      style={{
        ...logoStyle,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.45),
      }}
    >
      {url && failedUrl !== url ? (
        // eslint-disable-next-line @next/next/no-img-element -- org asset proxy URLs
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(url)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        initial
      )}
    </span>
  );
}

/** The club's verified mark: a small green tick, as on the onboarding club list. */
export function VerifiedTick({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <span
      role="img"
      aria-label="Verified"
      title="Verified"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--ok-ink)",
        color: "var(--paper)",
        fontSize: Math.round(size * 0.62),
        fontWeight: 900,
        lineHeight: 1,
      }}
    >
      ✓
    </span>
  );
}

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "nowrap",
  gap: 6,
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  overflowX: "auto",
  overscrollBehaviorX: "contain",
  scrollbarWidth: "none",
  margin: "0 0 10px",
  padding: 0,
  WebkitOverflowScrolling: "touch",
};

const chipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minHeight: 32,
  padding: "4px 10px 4px 5px",
  background: "var(--paper)",
  border: "1px solid var(--hairline)",
  borderRadius: 999,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--ink-2)",
  textDecoration: "none",
  whiteSpace: "nowrap",
  WebkitTapHighlightColor: "transparent",
};

const labelStyle: CSSProperties = {
  maxWidth: 160,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const titlePartStyle: CSSProperties = { ...labelStyle, maxWidth: 120, color: "var(--charcoal)" };

const logoStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  overflow: "hidden",
  borderRadius: "50%",
  background: "var(--row-hover)",
  border: "1px solid var(--hairline)",
  color: "var(--ink-2)",
  fontFamily: "Fraunces, serif",
  fontWeight: 800,
  lineHeight: 1,
  boxSizing: "border-box",
};
