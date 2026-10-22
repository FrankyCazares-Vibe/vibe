"use client";

import { motion } from "motion/react";
import type { CSSProperties, JSX, Ref } from "react";

import { SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";

import { ARC } from "./club-tools-arc";

/**
 * The Arc's handle (Oct 22, 2026; FloatArc.dc.html): a little planet half
 * tucked into the window's right edge, halfway down, its colours turning
 * slowly (coral rim, teal, deep blue), a sparkle on its rim and the coral
 * count while someone wants to join. It leans out a touch on hover and
 * comes 36px out, a little bigger, while the arc is open; the arc's close
 * target sits over it then (ClubToolsLauncherArc.tsx), so it takes no
 * clicks of its own while open. Motion owns its transform, so its place is
 * `top`/`margin-top`, never a transform. Shown from 1024px (globals.css
 * `.vibe-arc-planet`), and at any width while the arc is out (the cover's
 * button opens it from 900px, and the arc turns round it); the loops are
 * CSS, behind reduce motion.
 *
 * `merged` (Oct 22, 2026): a tool is open in place, in the panel the planet
 * grew into (ClubToolsPanel.tsx). The planet swells a touch and fades as its
 * bloom, the same colours, takes over, and comes back when the bloom has
 * shrunk back into it.
 */
export function ClubToolsPlanet({
  open,
  shown,
  merged = false,
  count,
  label,
  buttonRef,
  onOpen,
}: {
  open: boolean;
  /** The panel is out (or its bloom still on its way back): the planet is the panel now. */
  merged?: boolean;
  /** Open, or the arc still closing: keeps the planet drawn under 1024px (globals.css). */
  shown: boolean;
  /** The coral count ("3", "9+"), or null when no one is waiting. */
  count: string | null;
  label: string;
  buttonRef: Ref<HTMLButtonElement>;
  onOpen: (from: HTMLElement) => void;
}): JSX.Element {
  const hot = count !== null;
  return (
    <motion.div
      className="vibe-arc-planet vibe-night-island"
      data-open={shown ? "" : undefined}
      initial={false}
      animate={{
        x: open ? -ARC.openShift : 0,
        scale: open ? (merged ? ARC.openScale * 1.2 : ARC.openScale) : 1,
        opacity: open && merged ? 0 : 1,
      }}
      whileHover={open ? undefined : { x: -5, transition: SPRING_SNAPPY }}
      transition={{ default: SPRING_SOFT, opacity: SPRING_SNAPPY }}
      style={{ ...wrapStyle, zIndex: open ? 1001 : 900, pointerEvents: open ? "none" : undefined }}
    >
      <span
        aria-hidden
        className={hot ? "vibe-arc-glow--hot" : undefined}
        style={{ ...glowStyle, opacity: hot ? undefined : 0.35 }}
      />
      <button
        ref={buttonRef}
        type="button"
        className="vibe-arc-planet-hit"
        aria-label={label}
        title="Club tools"
        aria-haspopup="dialog"
        aria-expanded={open}
        tabIndex={open ? -1 : undefined}
        onClick={(e) => onOpen(e.currentTarget)}
        style={hitStyle}
      >
        <span aria-hidden style={bodyStyle}>
          <span className="vibe-arc-sway" style={surfaceStyle} />
          <span style={rimStyle} />
        </span>
        <span aria-hidden style={shineStyle} />
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" style={{ position: "absolute", left: 10, top: 0 }}>
          <path d="M12 0c.5 7 4.6 11.4 12 12-7.4.6-11.5 5-12 12-.5-7-4.6-11.4-12-12 7.4-.6 11.5-5 12-12Z" fill="#FFFFFF" />
        </svg>
        {count ? (
          <span aria-hidden style={badgeStyle}>
            {count}
          </span>
        ) : null}
      </button>
    </motion.div>
  );
}

const half = ARC.planet / 2;

/** Its centre on the window's right edge, halfway down. */
const wrapStyle: CSSProperties = {
  position: "fixed",
  right: -half,
  top: "50%",
  marginTop: -half,
  width: ARC.planet,
  height: ARC.planet,
};

const glowStyle: CSSProperties = {
  position: "absolute",
  left: -30,
  top: -30,
  width: ARC.planet + 60,
  height: ARC.planet + 60,
  borderRadius: "50%",
  background: "radial-gradient(closest-side, rgba(255,110,60,0.45), rgba(255,110,60,0.10) 62%, rgba(255,110,60,0))",
  pointerEvents: "none",
};

const hitStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  padding: 0,
  border: "none",
  borderRadius: "50%",
  background: "transparent",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const bodyStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  overflow: "hidden",
  boxShadow: "0 0 0 1px rgba(255,196,160,0.30), -8px 0 26px rgba(0,0,0,0.45)",
};

/** The planet's colours, an illustration: the same in Light and Night. Its bloom wears them too. */
export const PLANET_SURFACE =
  "radial-gradient(circle at 68% 70%, #040820 0%, #0A1B4E 28%, #17527E 45%, #2F8F7A 57%, #C8A04A 69%, #FF7A3F 78%, #FF5C35 86%, #FFB894 100%)";

const surfaceStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  background: PLANET_SURFACE,
  transformOrigin: "50% 50%",
};

const rimStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  boxShadow: "inset 3px 3px 5px rgba(255,230,206,0.6), inset 12px 10px 20px rgba(255,120,70,0.22)",
};

const shineStyle: CSSProperties = {
  position: "absolute",
  left: -2,
  top: 6,
  width: 40,
  height: 4,
  borderRadius: "50%",
  background: "radial-gradient(closest-side, #FFFFFF, rgba(255,216,192,0.55) 50%, rgba(255,216,192,0))",
};

/** Dark number on coral, on the planet's shoulder, as on the Otto orb. */
const badgeStyle: CSSProperties = {
  position: "absolute",
  top: 20,
  left: -6,
  minWidth: 18,
  height: 18,
  padding: "0 5px",
  boxSizing: "border-box",
  borderRadius: 999,
  background: "var(--coral)",
  color: "var(--on-coral)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 10,
  fontWeight: 800,
  lineHeight: "18px",
  textAlign: "center",
  boxShadow: "0 0 0 2px #241B40, 0 0 12px rgba(255,92,53,0.55)",
};
