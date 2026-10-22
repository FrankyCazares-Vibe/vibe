"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent } from "react";

import { SPRING_POP, SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";

import {
  ARC,
  ARC_TOOLS,
  bubbleLabel,
  bubbleMeta,
  chipText,
  type ArcCounts,
  type ArcLayout,
  type ArcTool,
  type ArcToolId,
} from "./club-tools-arc";
import type { PanelBloom, PanelState } from "./club-tools-panel";
import { EventsCard, InviteCard, MembersCard, OfficersCard, SettingsCard, type ArcClub, type RosterCache } from "./ClubToolsLauncherCards";
import { FollowersCard } from "./ClubToolsLauncherFollowers";
import { ARC_ICON, ArcGlyph } from "./ClubToolsLauncherParts";
import { RequestsCard } from "./ClubToolsLauncherRequests";
import { ClubToolsPanelLayer, type PanelHost } from "./ClubToolsPanel";

/**
 * The open Arc (Oct 22, 2026; ClubToolsLauncher.tsx owns it): a scrim, a
 * ring going out from the planet, the seven tools springing out of it one
 * after another along the arc, and the chosen tool's card beside them. A
 * modal dialog, dark in Light and Night alike (`vibe-night-island`): focus
 * comes in when it opens (and again when it is opened while still going
 * away), Tab stays inside, and the Otto orb stands down until it has gone
 * (`data-hides-otto`, globals.css). Escape closes the card first, then the
 * arc; the scrim and the close target over the planet close the arc.
 *
 * Nothing takes a click until the last bubble has come all the way out: the
 * second click of a double-click on the planet would otherwise land on the
 * close target sitting over it, or on a bubble still flying past.
 *
 * A tool opened in place (Oct 22, 2026; ClubToolsPanel.tsx): the bubbles
 * fold back into the planet while the planet grows into the panel, and
 * spring out again on ‹. While the panel is out the arc's own pieces are
 * inert, so Tab stays in the panel, and Escape closes everything.
 */
export function ClubToolsArc({
  club,
  counts,
  layout,
  tool,
  inviteOpen,
  rosterRef,
  onPick,
  onCloseCard,
  onClose,
  onLeave,
  onInvite,
  onEditPage,
  onCount,
  onChanged,
  panel,
  returning,
  panelGeo,
  panelHost,
  onReturned,
}: {
  club: ArcClub;
  counts: ArcCounts;
  layout: ArcLayout;
  tool: ArcToolId | null;
  /** The Invite people sheet is up over the arc: the arc waits under it. */
  inviteOpen: boolean;
  rosterRef: RosterCache;
  onPick: (id: ArcToolId) => void;
  onCloseCard: () => void;
  onClose: (giveFocusBack: boolean) => void;
  onLeave: (href: string) => void;
  onInvite: () => void;
  /** Club settings' Edit page: the arc closes and the Edit page dialog opens. */
  onEditPage: () => void;
  onCount: (n: number) => void;
  onChanged: () => void;
  /** The tools panel's screens, while a tool is open in place. */
  panel: PanelState | null;
  /** ‹ sent the panel back: its bloom is still shrinking into the planet. */
  returning: boolean;
  panelGeo: PanelBloom;
  /** Null: no panel here (the page didn't pass the officer's role), the cards' links go to the pages. */
  panelHost: PanelHost | null;
  onReturned: () => void;
}): JSX.Element {
  // Going away, it is no longer a dialog: nothing in it takes a click.
  const present = useIsPresent();
  const [settled, setSettled] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // The panel coming or going folds or unfolds the bubbles: unsettled from
  // this very render, not from the fold's first frame, or the second click
  // of a double click on a card's link would fall through the arriving
  // panel onto the scrim and close everything (harness, Oct 22, 2026).
  const panelOut = !!panel;
  const [foldSeen, setFoldSeen] = useState(panelOut);
  if (foldSeen !== panelOut) {
    setFoldSeen(panelOut);
    setSettled(false);
  }

  /** The card goes; focus goes back to the bubble that opened it. */
  const closeCard = () => {
    const was = tool;
    onCloseCard();
    window.requestAnimationFrame(() => {
      if (was) rootRef.current?.querySelector<HTMLElement>(`[data-arc-tool="${was}"]`)?.focus({ preventScroll: true });
    });
  };
  const latest = useRef({ tool, closeCard, onClose, panelOut: !!panel });
  useEffect(() => {
    latest.current = { tool, closeCard, onClose, panelOut: !!panel };
  });

  // Into the dialog on opening, and again when it is opened while still
  // going away (Motion brings the same one back, so this is not a mount).
  useEffect(() => {
    if (present) rootRef.current?.focus({ preventScroll: true });
  }, [present]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Only when this is the top dialog: the Invite people sheet over it closes first.
      const open = document.querySelectorAll('[aria-modal="true"]');
      if (open[open.length - 1] !== rootRef.current) return;
      // A search box with words in it: Escape clears them (the members' filter).
      const at = e.target;
      if (at instanceof HTMLInputElement && at.type === "search" && at.value) return;
      e.preventDefault();
      const { tool: card, closeCard: dropCard, onClose: closeAll, panelOut } = latest.current;
      if (card && !panelOut) dropCard();
      else closeAll(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const keepTabInside = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    // The panel's screens have fields too; whatever is inert (the folded
    // arc under the panel) is out of the loop.
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
      (el) => el.tabIndex >= 0 && el.getClientRects().length > 0 && !el.closest("[inert]"),
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === rootRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const ring = Math.round((272 * layout.radius) / ARC.radius);
  const common = { club, counts, onClose: closeCard, onLeave, onPanel: panelHost?.onOpen };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal={present ? "true" : undefined}
      aria-label={`Club tools, ${club.name}`}
      inert={!present || inviteOpen}
      tabIndex={-1}
      onKeyDown={keepTabInside}
      data-hides-otto=""
      className="vibe-night-island"
      style={{ position: "fixed", inset: 0, zIndex: 1000, outline: "none", pointerEvents: present ? undefined : "none" }}
    >
      <motion.div
        aria-hidden
        onClick={() => {
          if (settled) onClose(true);
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: SPRING_SNAPPY }}
        transition={SPRING_SOFT}
        style={scrimStyle}
      />
      <motion.span
        aria-hidden
        initial={{ opacity: 0.9, scale: 0.4 }}
        animate={{ opacity: 0, scale: 1.6 }}
        transition={SPRING_SOFT}
        style={{
          position: "absolute",
          left: layout.hub.x - ring / 2,
          top: layout.hub.y - ring / 2,
          width: ring,
          height: ring,
          borderRadius: "50%",
          border: "1px solid rgba(255,190,160,0.5)",
          pointerEvents: "none",
        }}
      />
      <nav
        aria-label="Club tools"
        className="vibe-arc-nav"
        data-carding={tool ? "" : undefined}
        inert={panelOut}
        style={{ pointerEvents: settled ? undefined : "none" }}
      >
        {ARC_TOOLS.map((t, i) => (
          <ArcBubble
            key={t.id}
            tool={t}
            index={i}
            spot={layout.bubbles[i]}
            counts={counts}
            selected={tool === t.id}
            dim={tool !== null && tool !== t.id}
            folded={panelOut}
            onPick={() => (tool === t.id ? closeCard() : onPick(t.id))}
            onSettle={i === ARC_TOOLS.length - 1 ? setSettled : undefined}
          />
        ))}
      </nav>

      {/* The card's column. It fades with the arc as the arc goes (its own
          AnimatePresence swaps cards; one told to `propagate` the arc's exit
          never lets an empty one finish, so the arc would never leave). */}
      <motion.div
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: SPRING_SNAPPY }}
        inert={panelOut}
        style={{
          position: "absolute",
          left: layout.card.left,
          width: layout.card.width,
          top: layout.card.margin,
          bottom: layout.card.margin,
          display: "flex",
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {tool === "requests" ? (
            <RequestsCard key="requests" {...common} onCount={onCount} onChanged={onChanged} />
          ) : tool === "members" ? (
            <MembersCard key="members" {...common} rosterRef={rosterRef} />
          ) : tool === "followers" ? (
            <FollowersCard key="followers" {...common} onChanged={onChanged} />
          ) : tool === "officers" ? (
            <OfficersCard key="officers" {...common} rosterRef={rosterRef} />
          ) : tool === "events" ? (
            <EventsCard key="events" {...common} />
          ) : tool === "settings" ? (
            <SettingsCard key="settings" {...common} onEditPage={onEditPage} />
          ) : tool === "invite" ? (
            <InviteCard key="invite" {...common} onInvite={onInvite} />
          ) : null}
        </AnimatePresence>
      </motion.div>

      {/* Over the open planet (which takes no clicks then): last in the Tab order. */}
      <button
        type="button"
        className="vibe-arc-close"
        aria-label="Close Club tools"
        inert={panelOut}
        onClick={() => {
          if (settled) onClose(true);
        }}
        style={{
          position: "absolute",
          left: layout.closeSpot.left,
          top: layout.closeSpot.top,
          width: layout.closeSpot.size,
          height: layout.closeSpot.size,
          padding: 0,
          border: "none",
          borderRadius: "50%",
          background: "transparent",
          cursor: "pointer",
        }}
      />

      {/* The tools panel and the planet's bloom, over everything else here. */}
      {panelHost ? (
        <ClubToolsPanelLayer panel={panel} returning={returning} geo={panelGeo} host={panelHost} onReturned={onReturned} />
      ) : null}
    </div>
  );
}

/** What Tab moves between inside the arc and its panel. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * One tool on the arc. It springs out of the planet (`fromX`/`fromY` back to
 * its centre) a beat after the one above it, with a small pop, then bobs
 * gently (CSS, behind reduce motion). Its name slides in beside it on hover
 * and on keyboard focus (globals.css `.vibe-arc-label`), unless a card is
 * open; then the other bubbles dim and this one, if chosen, wears a ring.
 * `folded`: a tool is open in the panel, so it goes back into the planet,
 * the bottom one first (the way it leaves when the arc closes), and comes
 * out again, top first, on ‹.
 */
function ArcBubble({
  tool,
  index,
  spot,
  counts,
  selected,
  dim,
  folded,
  onPick,
  onSettle,
}: {
  tool: ArcTool;
  index: number;
  spot: ArcLayout["bubbles"][number];
  counts: ArcCounts;
  selected: boolean;
  dim: boolean;
  folded: boolean;
  onPick: () => void;
  /** The last bubble only: the arc is out once its entrance settles. */
  onSettle?: (settled: boolean) => void;
}): JSX.Element {
  const delay = 0.06 + index * 0.045;
  const count = tool.id === "requests" ? counts.requests : tool.id === "members" ? counts.members : tool.id === "followers" ? counts.followers : null;
  const chip = chipText(count);
  const meta = bubbleMeta(tool.id, counts);
  const back = ARC_TOOLS.length - 1 - index;
  return (
    <motion.div
      className="vibe-arc-spot"
      initial={{ opacity: 0, x: spot.fromX, y: spot.fromY, scale: 0.5 }}
      animate={
        folded
          ? { opacity: 0, x: spot.fromX, y: spot.fromY, scale: 0.4, transition: { ...SPRING_SNAPPY, delay: back * 0.015 } }
          : { opacity: 1, x: 0, y: 0, scale: 1 }
      }
      exit={{
        opacity: 0,
        x: Math.round(spot.fromX * 0.7),
        y: Math.round(spot.fromY * 0.7),
        scale: 0.6,
        transition: { ...SPRING_SNAPPY, delay: back * 0.015 },
      }}
      transition={{ default: { ...SPRING_SOFT, delay }, scale: { ...SPRING_POP, delay } }}
      onAnimationStart={onSettle ? () => onSettle(false) : undefined}
      onAnimationComplete={onSettle ? () => onSettle(true) : undefined}
      style={{ position: "absolute", left: spot.left, top: spot.top, width: spot.size, height: spot.size }}
    >
      <span
        className="vibe-arc-bob"
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          height: "100%",
          animationDuration: `${3.6 + (index % 3) * 0.7}s`,
          animationDelay: `${-index * 0.6}s`,
        }}
      >
        <motion.span
          animate={{ opacity: dim ? 0.42 : 1 }}
          transition={SPRING_SNAPPY}
          style={{ position: "absolute", inset: 0, display: "block" }}
        >
          <button
            type="button"
            className="vibe-arc-bubble"
            data-arc-tool={tool.id}
            aria-label={bubbleLabel(tool.id, counts)}
            aria-expanded={selected}
            onClick={onPick}
            style={bubbleStyle(tool, selected)}
          >
            <ArcGlyph d={ARC_ICON[tool.id]} size={Math.round((22 * spot.size) / ARC.bubble)} />
            {chip ? (
              <span aria-hidden style={chipStyle(tool.hot)}>
                {chip}
              </span>
            ) : null}
          </button>
        </motion.span>
        <span aria-hidden className="vibe-arc-label" style={labelStyle}>
          {tool.name}
          {meta ? <span style={{ fontWeight: 600, color: tool.hot ? "var(--tag-ink)" : "var(--ink-2)" }}>{meta}</span> : null}
        </span>
      </span>
    </motion.div>
  );
}

// ─── Looks ────────────────────────────────────────────────────────────────

/** Darkest at the planet, lighter away from it, so the page still shows behind. */
const scrimStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(70% 90% at 100% 50%, rgba(6,4,14,0.72) 0%, rgba(6,4,14,0.45) 60%, rgba(6,4,14,0.32) 100%)",
};

function bubbleStyle(tool: ArcTool, selected: boolean): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 0,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.14)",
    background: `radial-gradient(circle at 34% 28%, rgba(255,255,255,0.16), rgba(255,255,255,0.03) 58%), radial-gradient(circle at 50% 120%, rgba(${tool.tint},0.38), rgba(${tool.tint},0) 70%), rgba(14,11,22,0.92)`,
    boxShadow: selected
      ? "0 0 0 2px var(--charcoal), 0 12px 32px rgba(0,0,0,0.5)"
      : `0 12px 30px rgba(0,0,0,0.45), 0 0 22px rgba(${tool.tint},0.22)`,
    color: "var(--charcoal)",
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  };
}

/** The count on a bubble's shoulder: coral on Join requests, light on the others. */
function chipStyle(hot: boolean): CSSProperties {
  return {
    position: "absolute",
    right: -4,
    bottom: -2,
    minWidth: 20,
    height: 20,
    padding: "0 6px",
    boxSizing: "border-box",
    borderRadius: 999,
    background: hot ? "var(--coral)" : "var(--charcoal)",
    color: hot ? "var(--on-coral)" : "#120E1C",
    fontFamily: "DM Sans, sans-serif",
    fontSize: 11,
    fontWeight: 800,
    lineHeight: "20px",
    textAlign: "center",
    boxShadow: "0 0 0 2px #120E1C",
  };
}

/** A bubble's name, to its left: `top`/`margin-top` place it, the CSS slides it. */
const labelStyle: CSSProperties = {
  position: "absolute",
  right: "calc(100% + 12px)",
  top: "50%",
  marginTop: -17,
  height: 34,
  boxSizing: "border-box",
  padding: "0 14px",
  borderRadius: 999,
  background: "rgba(14,11,22,0.94)",
  border: "1px solid rgba(255,255,255,0.12)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  whiteSpace: "nowrap",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  fontWeight: 700,
  color: "var(--charcoal)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};
