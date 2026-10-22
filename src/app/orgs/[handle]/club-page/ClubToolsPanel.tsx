"use client";

import { motion, useIsPresent } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent, type MouseEvent } from "react";

import { Arrow } from "@/components/brand/Arrow";
import { RISE_PX, SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";

import { GalaxyBackdrop } from "./GalaxyBackdrop";
import type { ClubToolsRow } from "./ToolsCard";

/**
 * The Club tools panel that comes out of the right edge on a computer
 * (ClubToolsDrawer.tsx). It springs out from the edge, its sky blooms in
 * behind (GalaxyBackdrop.tsx), and the rows rise in one after another; it
 * goes back the way it came. Dark in Light and Night alike, like the club
 * page it sits over (`vibe-night-island`). A modal dialog: Tab stays inside,
 * Escape closes it when it is the top one, and the Otto orb stands down
 * until it has gone (globals.css, `[data-hides-otto]`). Nothing in it takes
 * a click until it has come all the way out, so the second click of a
 * double-click on the handle can't land on a row still sliding under it.
 */
export function ClubToolsPanel({
  clubName,
  toolsHref,
  rows,
  onClose,
  onPick,
}: {
  clubName: string;
  toolsHref: string;
  rows: ClubToolsRow[];
  onClose: () => void;
  /** A row was chosen (the drawer closes; it gives focus back when the row is this same page). */
  onPick: (href: string) => void;
}): JSX.Element {
  const titleId = useId();
  // Going away, it is no longer a dialog: nothing in it takes a click, and
  // the Otto orb may come back as it fades.
  const present = useIsPresent();
  // Out all the way (its entrance spring has settled): only then do the rows,
  // the × and the scrim take clicks.
  const [settled, setSettled] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Into the panel on opening, and again when it is opened while still
  // going away (Motion brings the same panel back, so this is not a mount).
  useEffect(() => {
    if (present) panelRef.current?.focus({ preventScroll: true });
  }, [present]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] !== rootRef.current) return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const keepTabInside = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const pick = (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    // A new tab or window: the panel stays as it is.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    onPick(href);
  };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={present ? "true" : undefined}
      aria-labelledby={titleId}
      inert={!present}
      data-hides-otto=""
      className="vibe-night-island"
      style={{ position: "fixed", inset: 0, zIndex: 1000, pointerEvents: present ? undefined : "none" }}
    >
      <motion.div
        aria-hidden
        onClick={() => {
          if (settled) onClose();
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: SPRING_SNAPPY }}
        transition={SPRING_SOFT}
        style={{ position: "absolute", inset: 0, background: "rgba(6,4,14,0.46)" }}
      />
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={keepTabInside}
        initial={{ opacity: 0, x: 56, scale: 0.94 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 40, scale: 0.97, transition: SPRING_SNAPPY }}
        transition={SPRING_SOFT}
        onAnimationStart={() => setSettled(false)}
        onAnimationComplete={() => setSettled(true)}
        style={panelStyle}
      >
        <GalaxyBackdrop />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            minHeight: 0,
            pointerEvents: settled ? undefined : "none",
          }}
        >
          <Rise index={0} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "24px 18px 18px 24px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={eyebrowStyle}>Only officers</div>
              <h2 id={titleId} style={titleStyle}>
                Club tools
              </h2>
              <div style={{ marginTop: 4, fontSize: 13, color: "var(--ink-muted)", overflowWrap: "anywhere" }}>{clubName}</div>
            </div>
            <button type="button" className="vibe-press" aria-label="Close Club tools" onClick={onClose} style={closeStyle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </Rise>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 14px 14px", display: "grid", alignContent: "start", gap: 8 }}>
            {rows.map((r, i) => (
              <Rise key={r.label} index={i + 1}>
                <Link href={r.href} onClick={(e) => pick(e, r.href)} className="vibe-galaxy-row" style={rowStyle}>
                  {r.label === "Join requests" && typeof r.count === "number" && r.count > 0 ? (
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: "var(--coral)", boxShadow: "0 0 8px rgba(255,92,53,0.7)", flexShrink: 0 }} />
                  ) : null}
                  <span style={{ flex: 1, minWidth: 0 }}>{r.label}</span>
                  {typeof r.count === "number" ? (
                    <span style={{ color: "var(--ink-2)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                      {r.count.toLocaleString("en-US")}
                    </span>
                  ) : null}
                  <span aria-hidden style={{ color: "var(--ink-2)", display: "inline-flex" }}>
                    <Arrow direction="right" />
                  </span>
                </Link>
              </Rise>
            ))}
          </div>

          <Rise index={rows.length + 1} style={{ padding: "0 14px 16px" }}>
            <Link href={toolsHref} onClick={(e) => pick(e, toolsHref)} className="vibe-galaxy-row vibe-galaxy-row--cta" style={ctaStyle}>
              Invite, share and more
              <Arrow direction="right" />
            </Link>
          </Rise>
        </div>
      </motion.div>
    </div>
  );
}

/** One line of the panel rising into place, a beat after the one above. */
function Rise({ index, style, children }: { index: number; style?: CSSProperties; children: React.ReactNode }): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: RISE_PX }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: SPRING_SNAPPY }}
      transition={{ ...SPRING_SOFT, delay: 0.1 + index * 0.035 }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

const panelStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  bottom: 12,
  width: 360,
  maxWidth: "calc(100vw - 24px)",
  overflow: "hidden",
  borderRadius: 26,
  border: "1px solid rgba(255,255,255,0.09)",
  background: "#0A0810",
  boxShadow: "-24px 0 64px rgba(0,0,0,0.5), 0 0 40px rgba(255,92,53,0.08)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  transformOrigin: "100% 50%",
  outline: "none",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--tag-ink)",
};

const titleStyle: CSSProperties = {
  margin: "6px 0 0",
  fontFamily: "var(--font-display)",
  fontSize: 28,
  fontWeight: 800,
  lineHeight: 1.1,
  letterSpacing: "-0.01em",
  color: "var(--charcoal)",
};

const closeStyle: CSSProperties = {
  width: 40,
  height: 40,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  padding: 0,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "var(--charcoal)",
  cursor: "pointer",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 50,
  padding: "0 16px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--charcoal)",
  textDecoration: "none",
  fontSize: 14.5,
  fontWeight: 600,
};

/** The footer's way to the whole Club tools page, tinted coral (its hover stays coral: globals.css). */
const ctaStyle: CSSProperties = {
  ...rowStyle,
  justifyContent: "center",
  background: "rgba(255,92,53,0.14)",
  border: "1px solid rgba(255,92,53,0.32)",
};
