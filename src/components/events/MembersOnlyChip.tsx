/**
 * The "Members only" chip (Oct 22, 2026, PLAN-2.md batch E2): a small lock
 * and the two words, on every surface that shows a members-only club event
 * (the campus event card, the phone's Tonight card, the event chat's About
 * block on phone and desktop, event cards in chats, the share sheet's rows).
 * One component so the words, the glyph and the size never drift apart.
 *
 * Quiet on purpose, the way the "School event" tag is: an outlined pill in
 * the surface's own grey, never coral (coral is for actions). It is words
 * only, not a button, so it has no target size of its own.
 *
 * `tone` says what it sits on:
 * - "page" (default): the app's paper, glass and sheets. Theme tokens only
 *   (--scrim-rgb, --ink-2), so Night and Light both come from globals.css.
 * - "glass": the dark-glass event cards, which are dark in both looks (the
 *   twin of `.tonight-tag--glass`).
 * - "hero": over the event chat's gradient hero, filled like its state pill
 *   so it reads over the brightest part of the gradient.
 *
 * `size`: "row" fits a one-line, 18px row (the Tonight card's fixed lines);
 * "pill" (default) is a touch larger for a card's own line.
 *
 * No "use client": no hooks, so a server page can draw it too.
 */
import type { CSSProperties, ReactElement } from "react";

import { MEMBERS_ONLY_COPY } from "./members-only";

export type MembersOnlyChipTone = "page" | "glass" | "hero";
export type MembersOnlyChipSize = "row" | "pill";

const TONES: Record<MembersOnlyChipTone, CSSProperties> = {
  page: {
    border: "1px solid rgba(var(--scrim-rgb), 0.18)",
    background: "rgba(var(--scrim-rgb), 0.04)",
    color: "var(--ink-2)",
  },
  glass: {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "transparent",
    color: "rgba(255,255,255,0.78)",
  },
  hero: {
    border: "1px solid rgba(250,247,242,0.16)",
    background: "rgba(12,11,11,0.62)",
    color: "#F6F1EA",
  },
};

const SIZES: Record<MembersOnlyChipSize, { box: CSSProperties; glyph: number }> = {
  row: { box: { height: 16, padding: "0 6px 0 5px", gap: 3, fontSize: 10, lineHeight: "14px" }, glyph: 9 },
  pill: { box: { height: 22, padding: "0 8px 0 7px", gap: 4, fontSize: 11, lineHeight: "16px" }, glyph: 11 },
};

/** The lock, on a 24 grid in currentColor (the event chat's "Closed" lock). */
export function LockGlyph({ size = 12 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function MembersOnlyChip({
  tone = "page",
  size = "pill",
  style,
}: {
  tone?: MembersOnlyChipTone;
  size?: MembersOnlyChipSize;
  /** Placement only (a margin, an absolute corner); the look is the tone's. */
  style?: CSSProperties;
}): ReactElement {
  const s = SIZES[size];
  return (
    <span
      data-members-only=""
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        boxSizing: "border-box",
        borderRadius: 999,
        fontFamily: "DM Sans, sans-serif",
        fontWeight: 700,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        ...s.box,
        ...TONES[tone],
        ...style,
      }}
    >
      <LockGlyph size={s.glyph} />
      {MEMBERS_ONLY_COPY.chip}
    </span>
  );
}
