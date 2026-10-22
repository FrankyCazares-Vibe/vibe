"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type JSX } from "react";

import { ToolSheetPlacement, ToolsHeader } from "@/components/orgs/tools/tools-ui";
import type { ToolsClub } from "@/components/orgs/tools/types";
import { RISE_PX, SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";

import type { SetupView } from "../setup/SetupScreen";
import type { ArcCounts } from "./club-tools-arc";
import { panelBackLabel, panelHeading, panelKey, panelTop, type PanelBloom, type PanelEntry, type PanelState } from "./club-tools-panel";
import type { RosterCache } from "./ClubToolsLauncherCards";
import { ClubToolsBloom } from "./ClubToolsPanelBloom";
import { PanelScreenBody } from "./ClubToolsPanelScreens";

/**
 * Club tools open in place, on a computer (Oct 22, 2026; PLAN-2.md T1): the
 * panel the planet grows into, springing in from the right edge, full
 * height, about 560px wide (club-tools-panel.ts), like Otto's side panel. It
 * holds the phone's own Club tools screens (ClubToolsPanelScreens.tsx) under
 * their own header: ‹ back (the screen under it, else the arc), the title
 * and ×. ClubToolsLauncher.tsx owns what is open; the arc
 * (ClubToolsLauncherArc.tsx) draws this layer over itself, and folds its
 * bubbles into the planet while the panel is out.
 *
 * Inside the arc's dialog, a `vibe-night-island`, so the screens' theme
 * tokens read as Night, as the arc and the club page do. Their sheets go to
 * <body> at 10000 and over; the photo upload and the event form go to <body>
 * at the arc's 1000, after it, so they draw above it too.
 *
 * Nothing takes a click until the panel, and each screen after it, has come
 * all the way in: the second click of a double click would otherwise land
 * on whatever arrived under the pointer.
 */

/** The page's setup list, for the setup screen: the read, and whether the club has its photo and cover yet. */
export type ClubToolsSetup = { view: SetupView | null; hasLogo: boolean; hasBanner: boolean };

/** What the screens need from the launcher. */
export type PanelHost = {
  club: ToolsClub;
  /** Null when the page didn't pass it: the setup screen is then the members' link alone. */
  setup: ClubToolsSetup | null;
  counts: ArcCounts;
  /** The arc's one roster read, for All Club tools' officers count. */
  rosterRef: RosterCache;
  /** ‹ : the screen under this one, else the arc. */
  onBack: () => void;
  /** × : the panel and the arc together. */
  onClose: () => void;
  /** A row of All Club tools: its screen, on top. */
  onOpen: (entry: PanelEntry) => void;
  /** "Edit the page": everything closes, Edit page opens. */
  onEditPage: () => void;
  /** "Past events and who came": everything closes, the Events tab shows. */
  onPastEvents: () => void;
  /** Club settings' Leave and Delete, once done. */
  onLeft: () => void;
  onDeleted: () => void;
};

/**
 * The panel's place and its bloom, drawn as the arc's last layers. The place
 * slides away with the arc when everything closes (× or Escape); ‹ from the
 * first screen sends only the panel back, into the planet.
 */
export function ClubToolsPanelLayer({
  panel,
  returning,
  geo,
  host,
  onReturned,
}: {
  panel: PanelState | null;
  /** ‹ took it back: the bloom is still shrinking into the planet. */
  returning: boolean;
  geo: PanelBloom;
  host: PanelHost;
  onReturned: () => void;
}): JSX.Element {
  const width = geo.clip.width;
  // Until the panel is all the way in, a click anywhere in the arc is the
  // second half of the double click that opened it (review, Oct 22, 2026):
  // the bubbles finish folding about 0.4s in, the panel about 0.65s, and in
  // between that click fell on the scrim and closed everything, on the
  // panel's place and on the part of the card's link left of it. A
  // transparent shield takes it until the panel says it has arrived (or a
  // beat later at most, so it never stays).
  const out = !!panel;
  const [arrived, setArrived] = useState(false);
  const [wasOut, setWasOut] = useState(out);
  if (wasOut !== out) {
    setWasOut(out);
    setArrived(false);
  }
  useEffect(() => {
    if (!out || arrived) return;
    const t = window.setTimeout(() => setArrived(true), 1200);
    return () => window.clearTimeout(t);
  }, [out, arrived]);
  const onArrived = useCallback(() => setArrived(true), []);
  return (
    <>
      {out && !arrived ? <div aria-hidden style={{ position: "absolute", inset: 0 }} /> : null}
      <motion.div
        initial={false}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: width, opacity: 0, transition: { x: SPRING_SNAPPY, opacity: { ...SPRING_SNAPPY, delay: 0.04 } } }}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width, pointerEvents: "none" }}
      >
        <AnimatePresence>
          {panel ? <PanelSheet key="panel" state={panel} width={width} host={host} onArrived={onArrived} /> : null}
        </AnimatePresence>
      </motion.div>
      <ClubToolsBloom phase={panel ? "out" : returning ? "back" : null} geo={geo} onReturned={onReturned} />
    </>
  );
}

function PanelSheet({
  state,
  width,
  host,
  onArrived,
}: {
  state: PanelState;
  width: number;
  host: PanelHost;
  onArrived: () => void;
}): JSX.Element {
  const present = useIsPresent();
  const [ready, setReady] = useState(false);
  const entry = panelTop(state);
  const placement = useMemo(() => ({ width }), [width]);
  return (
    <motion.div
      className="vibe-tools-panel"
      inert={!present}
      // Opacity quickly, so it is solid early in the slide; with reduce
      // motion on, the slide is skipped and this fade is what's left.
      initial={{ x: width, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: width, opacity: 0, transition: { x: SPRING_SNAPPY, opacity: { ...SPRING_SNAPPY, delay: 0.04 } } }}
      transition={{ x: SPRING_SOFT, opacity: SPRING_SNAPPY }}
      onAnimationComplete={() => {
        setReady(true);
        if (present) onArrived();
      }}
      style={{ ...sheetStyle, pointerEvents: present && ready ? "auto" : "none" }}
    >
      {/* The screens' sheets rise along the panel's foot, dark like it (tools-ui.tsx). */}
      <ToolSheetPlacement.Provider value={placement}>
        <AnimatePresence mode="wait">
          <PanelPage key={panelKey(entry)} entry={entry} state={state} host={host} />
        </AnimatePresence>
      </ToolSheetPlacement.Provider>
    </motion.div>
  );
}

/** One screen: its header and its list. It takes focus when it comes, so a keyboard lands in it. */
function PanelPage({ entry, state, host }: { entry: PanelEntry; state: PanelState; host: PanelHost }): JSX.Element {
  const present = useIsPresent();
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const hasList = !!host.setup?.view;
  const heading = panelHeading(entry, hasList);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <motion.section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      initial={{ opacity: 0, y: RISE_PX }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: SPRING_SNAPPY }}
      transition={SPRING_SOFT}
      onAnimationComplete={() => setReady(true)}
      style={{ ...pageStyle, pointerEvents: present && ready ? undefined : "none" }}
    >
      <div style={{ flexShrink: 0, padding: "14px 24px 0" }}>
        <ToolsHeader
          onBack={host.onBack}
          backLabel={panelBackLabel(state, hasList)}
          title={`${heading.title}.`}
          sub={heading.sub ?? undefined}
          club={{ name: host.club.name, handle: host.club.handle }}
          onClose={host.onClose}
          closeLabel="Close Club tools"
          titleId={titleId}
        />
      </div>
      <div data-tools-panel-scroll="" style={scrollStyle}>
        <PanelScreenBody entry={entry} host={host} />
      </div>
    </motion.section>
  );
}

// ─── Looks ────────────────────────────────────────────────────────────────

/** The page's own background (Night's cream), with the planet's warmth left where it was. */
const sheetStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  background: "radial-gradient(520px 420px at 100% 50%, rgba(255,92,53,0.10), rgba(255,92,53,0) 70%), var(--cream)",
  borderLeft: "1px solid var(--hairline)",
  boxShadow: "-24px 0 64px rgba(0,0,0,0.5)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
};

const pageStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  outline: "none",
};

const scrollStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "0 24px 40px",
};
