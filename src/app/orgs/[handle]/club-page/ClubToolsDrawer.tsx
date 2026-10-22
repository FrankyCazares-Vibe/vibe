"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type JSX } from "react";
import { createPortal } from "react-dom";

import { SPRING_SNAPPY } from "@/lib/motion/springs";

import { DRAWER_QUERY, registerClubToolsDrawer } from "./club-tools-drawer";
import { ClubToolsPanel } from "./ClubToolsPanel";
import type { ClubToolsRow } from "./ToolsCard";

/**
 * Club tools on a computer, in the app frame (Oct 21, 2026, Franky: "make
 * the club tools come out instead of always being out"). They used to be the
 * frame's right column, always open. Now the owner and officers get a small
 * handle on the window's right edge, Otto's orbit on it and a coral count
 * while someone wants to join; it, or the cover's Club tools button
 * (club-tools-drawer.ts), brings the panel out (ClubToolsPanel.tsx). The
 * page mounts this only in the frame and only for them. The handle shows
 * from 1024px, where the page has a margin for it (below that it would sit
 * on the page's right edge, the ⋯ button included); from 900px the cover's
 * button opens the panel, and under 900px it goes to the Club tools page,
 * as on a phone.
 *
 * The panel closes on Escape, the scrim, its ×, a pick, a page change and a
 * window narrower than 900px. Focus goes back to whatever opened it (or the
 * cover's button, if that is gone from view), except after a pick that
 * leaves the page.
 */
export function ClubToolsDrawer({
  clubName,
  toolsHref,
  rows,
  requests,
}: {
  clubName: string;
  toolsHref: string;
  rows: ClubToolsRow[];
  /** Join requests waiting, for the handle's count. Null when unknown. */
  requests: number | null;
}): JSX.Element {
  const pathname = usePathname();
  // The page it was opened on: a page change closes it with no effect to run.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const show = useCallback(
    (from: HTMLElement | null) => {
      returnTo.current = from;
      setOpenOn(pathname);
    },
    [pathname],
  );
  useEffect(() => registerClubToolsDrawer(show), [show]);

  /** Closed: focus goes back where it came from, unless a pick is leaving the page. */
  const close = useCallback((giveFocusBack: boolean) => {
    setOpenOn(null);
    if (!giveFocusBack) return;
    window.requestAnimationFrame(() => {
      // The opener, else the handle, else the cover's button: whichever is
      // still on the page and showing (the handle hides under 1024px).
      const back = [returnTo.current, handleRef.current, document.querySelector<HTMLElement>('a[aria-label="Club tools"]')].find(
        (el) => !!el && el.isConnected && el.getClientRects().length > 0,
      );
      back?.focus({ preventScroll: true });
    });
  }, []);

  /** A row: leaving the page, focus goes with it; "Past events" stays on this page, so focus comes back. */
  const pick = useCallback(
    (href: string) => {
      const samePage = new URL(href, window.location.href).pathname === window.location.pathname;
      close(samePage);
    },
    [close],
  );

  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia(DRAWER_QUERY);
    const onChange = () => {
      if (!mq.matches) close(true);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [open, close]);

  const count = typeof requests === "number" && requests > 0 ? requests : 0;

  return (
    <>
      <motion.button
        ref={handleRef}
        type="button"
        className="vibe-club-tools-handle vibe-night-island"
        aria-label={count > 0 ? `Club tools, ${count} ${count === 1 ? "wants" : "want"} to join` : "Club tools"}
        title="Club tools"
        aria-haspopup="dialog"
        aria-expanded={open}
        tabIndex={open ? -1 : undefined}
        onClick={(e) => show(e.currentTarget)}
        initial={false}
        animate={{ x: open ? 32 : 0, opacity: open ? 0 : 1 }}
        whileHover={open ? undefined : { x: -4 }}
        whileTap={open ? undefined : { scale: 0.96 }}
        transition={SPRING_SNAPPY}
        style={{ ...handleStyle, pointerEvents: open ? "none" : undefined }}
      >
        <OrbitGlyph />
        {count > 0 ? (
          <span aria-hidden style={badgeStyle}>
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </motion.button>
      {typeof document === "undefined"
        ? null
        : createPortal(
            <AnimatePresence>
              {open ? (
                <ClubToolsPanel
                  key="club-tools"
                  clubName={clubName}
                  toolsHref={toolsHref}
                  rows={rows}
                  onClose={() => close(true)}
                  onPick={pick}
                />
              ) : null}
            </AnimatePresence>,
            document.body,
          )}
    </>
  );
}

/** Otto's orbit, small: a coral core and a moon going round it (still with reduce motion on). */
function OrbitGlyph(): JSX.Element {
  return (
    <span aria-hidden style={{ position: "relative", width: 24, height: 24, display: "grid", placeItems: "center" }}>
      <span
        className="vibe-orbit-spin"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.32)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: -2.5,
            left: "50%",
            width: 5,
            height: 5,
            marginLeft: -2.5,
            borderRadius: "50%",
            background: "#F6F1EA",
            boxShadow: "0 0 6px rgba(246,241,234,0.7)",
          }}
        />
      </span>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "#FF5C35",
          boxShadow: "0 0 10px rgba(255,92,53,0.75)",
        }}
      />
    </span>
  );
}

/** Tucked into the right edge, rounded on the side that shows. `top`/`marginTop`, not a transform: Motion owns that. */
const handleStyle: CSSProperties = {
  position: "fixed",
  right: 0,
  top: "50%",
  marginTop: -44,
  zIndex: 900,
  width: 40,
  height: 88,
  placeItems: "center",
  padding: 0,
  borderRadius: "20px 0 0 20px",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRight: "none",
  background: "rgba(14,10,22,0.9)",
  boxShadow: "-6px 0 24px rgba(0,0,0,0.35), 0 0 22px rgba(255,92,53,0.16)",
  color: "var(--charcoal)",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

/** The count on the handle's shoulder: dark number on coral, as on the Otto orb. */
const badgeStyle: CSSProperties = {
  position: "absolute",
  top: 6,
  left: -7,
  minWidth: 18,
  height: 18,
  padding: "0 5px",
  boxSizing: "border-box",
  borderRadius: 999,
  background: "#FF5C35",
  color: "var(--on-coral)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 10,
  fontWeight: 800,
  lineHeight: "18px",
  textAlign: "center",
  boxShadow: "0 0 12px rgba(255,92,53,0.55)",
};
