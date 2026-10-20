/**
 * The looks the club's own tools share (the club's view, wave 1): the setup
 * list at /orgs/<h>/setup and the members' link panel. Theme tokens only, so
 * Night mode follows, in the check-in page's family (CheckinLanding.tsx):
 * a cream page, charcoal words, one coral button per screen, outline pills
 * for everything else. Every tappable thing is at least 44px tall.
 */
import type { CSSProperties } from "react";

const SANS = "DM Sans, sans-serif";

export const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "var(--cream)",
  color: "var(--charcoal)",
  fontFamily: SANS,
};

/** One centred column on every screen, phone first. */
export const columnStyle: CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  boxSizing: "border-box",
  padding: "max(28px, env(safe-area-inset-top)) 16px 40px",
};

export const eyebrowStyle: CSSProperties = {
  fontFamily: SANS,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--tag-ink)",
};

export const titleStyle: CSSProperties = {
  margin: "8px 0 0",
  fontFamily: "Fraunces, serif",
  fontSize: 26,
  fontWeight: 800,
  lineHeight: 1.15,
  letterSpacing: "-0.02em",
  color: "var(--charcoal)",
  overflowWrap: "anywhere",
};

export const lineStyle: CSSProperties = {
  margin: 0,
  fontFamily: SANS,
  fontSize: 14,
  lineHeight: 1.5,
  color: "var(--ink-2)",
};

export const quietStyle: CSSProperties = {
  margin: 0,
  fontFamily: SANS,
  fontSize: 12.5,
  lineHeight: 1.45,
  color: "var(--ink-muted)",
};

export const errorLineStyle: CSSProperties = {
  margin: 0,
  fontFamily: SANS,
  fontSize: 13,
  lineHeight: 1.45,
  color: "var(--error-ink)",
};

const primaryBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  minHeight: 48,
  boxSizing: "border-box",
  padding: "0 18px",
  borderRadius: 999,
  border: "none",
  background: "var(--coral)",
  color: "var(--on-coral)",
  fontFamily: SANS,
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  WebkitTapHighlightColor: "transparent",
};

/** The screen's ONE main action. */
export const primaryButtonStyle: CSSProperties = primaryBase;

/** A step's own button ("Add", "Choose", "Share"), and the panels' smaller actions. */
export const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  minHeight: 44,
  padding: "0 16px",
  boxSizing: "border-box",
  borderRadius: 999,
  border: "1px solid rgba(var(--scrim-rgb),0.18)",
  background: "transparent",
  color: "var(--charcoal)",
  fontFamily: SANS,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  WebkitTapHighlightColor: "transparent",
};

/** A quiet underlined text action ("Skip for now", "Open the club page"). */
export const textActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 44,
  padding: "0 4px",
  border: "none",
  background: "transparent",
  color: "var(--ink-2)",
  fontFamily: SANS,
  fontSize: 13.5,
  fontWeight: 600,
  textDecoration: "underline",
  textUnderlineOffset: 3,
  cursor: "pointer",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(var(--scrim-rgb),0.18)",
  background: "rgba(var(--scrim-rgb),0.03)",
  color: "var(--charcoal)",
  fontFamily: SANS,
  fontSize: 16, // 16px keeps iOS from zooming in on focus
};

/** The box an open step's panel sits in, under its row. */
export const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  margin: "0 0 14px",
  padding: "14px 14px 16px",
  borderRadius: 16,
  border: "1px solid var(--hairline)",
  background: "rgba(var(--scrim-rgb),0.03)",
};

/** "Saving…" and friends: dimmed and not tappable while the request runs. */
export function busyStyle(busy: boolean): CSSProperties {
  return busy ? { opacity: 0.6, cursor: "default" } : {};
}
