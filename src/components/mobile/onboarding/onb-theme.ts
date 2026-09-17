import type { CSSProperties } from "react";

/**
 * The phone onboarding's colours and the shared step styles (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §8 B12S item 2).
 *
 * COPIED VERBATIM from `OnboardingMobile.tsx` (`COLORS` :62-76, the eleven
 * styles within :1523-1851) so the new step files (`StepClubs.tsx`,
 * `StepPeople.tsx`, and B12's campus / profile / photo steps) and the shell
 * read one look. B12 (wave 4) deletes the originals in `OnboardingMobile.tsx`
 * and imports these instead; until then the two copies must not drift.
 *
 * Plain `CSSProperties` objects only. The type import is erased, so nothing
 * here pulls React into a node test.
 */

export const COLORS = {
  charcoal: "#1C1C1E",
  charcoalSoft: "#26252A",
  cream: "#FAF7F2",
  accent: "#FF5C35",
  purple: "#7C5CFC",
  lavender: "#C8B8FF",
  green: "#1A9E5B",
  red: "#C54323",
  mutedText: "rgba(255,255,255,.55)",
  faintBorder: "rgba(255,255,255,.10)",
  fieldBg: "rgba(255,255,255,.04)",
  fieldBorder: "rgba(255,255,255,.10)",
  fieldFocusBorder: "rgba(255,92,53,.55)",
};

export const stepSectionStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  textAlign: "center",
  animation: "onb-step-in .35s cubic-bezier(.2,.8,.2,1)",
};

export const h2Style: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontSize: 24,
  fontWeight: 900,
  letterSpacing: "-0.8px",
  lineHeight: 1.15,
  marginBottom: 10,
  color: "white",
};

export const subIntroStyle: CSSProperties = {
  fontFamily: "'Fraunces', Georgia, serif",
  fontStyle: "italic",
  fontSize: 13,
  color: "rgba(255,255,255,.55)",
  marginBottom: 22,
  maxWidth: 460,
  lineHeight: 1.5,
};

export const formStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 18,
  textAlign: "left",
  marginTop: 4,
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "rgba(255,255,255,.85)",
  marginBottom: 6,
};

export const hintBelowStyle: CSSProperties = {
  fontSize: 12,
  color: "rgba(255,255,255,.45)",
  marginTop: 6,
};

export const inputStyle: CSSProperties = {
  width: "100%",
  background: COLORS.fieldBg,
  border: `1px solid ${COLORS.fieldBorder}`,
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16, // 16px avoids iOS auto-zoom on focus
  color: "white",
  fontFamily: "inherit",
  outline: "none",
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  lineHeight: 1.45,
  minHeight: 80,
};

export const fieldErrorStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.red,
  marginTop: 8,
};

export const primaryCtaStyle: CSSProperties = {
  display: "block",
  width: "100%",
  background: COLORS.accent,
  color: "white",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 16,
  border: "none",
  borderRadius: 14,
  padding: "14px 18px",
  textAlign: "center",
  boxShadow: "0 6px 20px rgba(255,92,53,.35)",
};

export const secondaryLinkStyle: CSSProperties = {
  display: "block",
  width: "100%",
  background: "transparent",
  color: "rgba(255,255,255,.55)",
  fontFamily: "inherit",
  fontWeight: 500,
  fontSize: 14,
  border: "none",
  padding: "6px 18px 4px",
  textAlign: "center",
};
