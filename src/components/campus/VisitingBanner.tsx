"use client";

import type { CSSProperties, JSX } from "react";

import { campusViewName, isVisitingCampus, visitingBannerText } from "./viewing-campus";

/**
 * The "you're just looking" pill (S67 wave 4, contracts C5, the canvas's
 * "Viewing Bloomington" board): a coral pill reading "Viewing Bloomington ·
 * home is Indianapolis" with a charcoal Back home button, under the campus
 * header on both shells. Renders nothing unless a known campus other than
 * home is on screen (`isVisitingCampus`), so a shell can mount it always.
 *
 * `role="status"`: it appears when the student picks a campus, and a screen
 * reader should hear where they are. The pill is 44px tall so Back home's hit
 * area is the full 44px; the charcoal chip inside stays 30px, as drawn.
 *
 * Colours are the C0 tokens (the coral tints are coral in both themes). In
 * Night the chip flips to a light chip with near-black text, like every
 * `var(--charcoal)` fill.
 */
export function VisitingBanner({
  viewingId,
  homeId,
  onBackHome,
  className,
  style,
}: {
  viewingId: string | null;
  homeId: string | null;
  onBackHome(): void;
  /** Placement is the parent's (the phone passes `margin: 10px 16px 0`). */
  className?: string;
  style?: CSSProperties;
}): JSX.Element | null {
  const text = visitingBannerText(viewingId, homeId);
  if (!text || !isVisitingCampus(viewingId, homeId)) return null;
  const home = campusViewName(homeId);
  return (
    <div
      role="status"
      className={["vibe-visiting", className].filter(Boolean).join(" ")}
      style={{ ...PILL, ...style }}
    >
      <style>{BANNER_CSS}</style>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M20.5 14.5A9 9 0 1 1 15 3.5" stroke="var(--coral)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="19" cy="18" r="2.6" stroke="var(--coral)" strokeWidth="1.6" />
      </svg>
      <span title={text} style={TEXT}>
        {text}
      </span>
      <button
        type="button"
        className="vibe-visiting-home"
        onClick={onBackHome}
        aria-label={home ? `Back home to ${home}` : "Back home"}
        style={BUTTON}
      >
        <span style={CHIP}>Back home</span>
      </button>
    </div>
  );
}

const PILL: CSSProperties = {
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 44,
  padding: "0 0 0 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,92,53,0.35)",
  background: "rgba(255,92,53,0.08)",
  fontFamily: "DM Sans, sans-serif",
};

const TEXT: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--tag-ink)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

// The button is the 44px hit area (transparent, full pill height); the chip
// inside is what's drawn.
const BUTTON: CSSProperties = {
  flexShrink: 0,
  alignSelf: "stretch",
  minHeight: 44,
  display: "inline-flex",
  alignItems: "center",
  padding: "0 7px 0 4px",
  border: "none",
  borderRadius: 999,
  background: "transparent",
  cursor: "pointer",
  font: "inherit",
  WebkitTapHighlightColor: "transparent",
};

const CHIP: CSSProperties = {
  height: 30,
  padding: "0 12px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  background: "var(--charcoal)",
  color: "var(--cream)",
  fontSize: 12,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

/** The focus ring goes on the drawn chip, not the invisible hit area. */
const BANNER_CSS = `
.vibe-visiting-home:focus-visible { outline: none; }
.vibe-visiting-home:focus-visible > span { outline: 2px solid var(--coral); outline-offset: 2px; }
`;
