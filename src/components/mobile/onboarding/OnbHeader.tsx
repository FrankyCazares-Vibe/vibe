"use client";

import type { CSSProperties, JSX } from "react";

import { ONB_COPY } from "./onb-copy";
import { COLORS } from "./onb-theme";

/**
 * The phone onboarding's pinned header (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §9 B12 item 6):
 * Back, the logo, "{n} of 6", and Skip, on every step.
 *
 * Sticky at the top of the page. That only holds because the shell
 * (`OnboardingMobile`) is not a scroll container: its old `overflow: hidden`
 * made the header scroll away with the step.
 *
 * Back is hidden (but keeps its column) on step 1 and calls `onBack`, which
 * the parent wires to `history.back()` so the header, the browser and the iOS
 * swipe all go back the same way. Skip shows on all six steps, step 1
 * included. Both are disabled while the parent is saving.
 */
export function OnbHeader(p: {
  step: number;
  total: number;
  backDisabled: boolean;
  skipDisabled: boolean;
  onBack: () => void;
  onSkip: () => void;
}): JSX.Element {
  // `total` is part of the contract; the copy ("{n} of 6") already carries it.
  const { step, backDisabled, skipDisabled, onBack, onSkip } = p;
  const copy = ONB_COPY.header;
  const progress = copy.progress.replace("{n}", String(step));

  return (
    <header style={topBarStyle}>
      <button
        type="button"
        aria-label={copy.back}
        disabled={backDisabled}
        onClick={onBack}
        style={{
          ...backBtnStyle,
          visibility: step <= 1 ? "hidden" : "visible",
          opacity: backDisabled ? 0.4 : 1,
        }}
      >
        <span aria-hidden="true">←</span>
      </button>
      <div style={logoStyle}>
        vibe<span style={{ color: COLORS.accent }}>.</span>
      </div>
      <span style={progressTextStyle}>{progress}</span>
      <button
        type="button"
        disabled={skipDisabled}
        onClick={onSkip}
        style={{ ...skipBtnStyle, opacity: skipDisabled ? 0.4 : 1 }}
      >
        {copy.skip}
      </button>
    </header>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const topBarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 5,
  display: "grid",
  gridTemplateColumns: "44px 1fr auto auto",
  alignItems: "center",
  gap: 8,
  padding:
    "calc(env(safe-area-inset-top, 0px) + 12px) 16px 12px",
  background:
    "linear-gradient(to bottom, rgba(28,28,30,.95) 60%, rgba(28,28,30,.0))",
  backdropFilter: "blur(8px)",
};

const logoStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 18,
  fontWeight: 900,
  letterSpacing: "-0.5px",
  color: "white",
};

const progressTextStyle: CSSProperties = {
  fontSize: 10,
  color: "rgba(255,255,255,.55)",
  marginLeft: 6,
  fontWeight: 500,
  letterSpacing: "0.3px",
};

const backBtnStyle: CSSProperties = {
  width: 44,
  height: 44,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginLeft: -10,
  padding: 0,
  background: "none",
  border: "none",
  borderRadius: 12,
  color: "white",
  fontSize: 22,
  lineHeight: 1,
  fontFamily: "inherit",
};

const skipBtnStyle: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  padding: "8px 4px",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,.5)",
  fontSize: 12,
  fontWeight: 500,
  fontFamily: "inherit",
  textAlign: "right",
};
