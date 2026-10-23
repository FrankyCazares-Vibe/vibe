"use client";

import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import { OrgInviteSheet } from "@/components/orgs/OrgInviteSheet";
import { SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";

import { planetCount, planetLabel, type ArcCounts, type ArcToolId } from "./club-tools-arc";
import { openEditPage } from "./club-tools-launcher";
import { EventsCard, InviteCard, MembersCard, OfficersCard, SettingsCard, type ArcClub, type RosterRead } from "./ClubToolsLauncherCards";
import { FollowersCard } from "./ClubToolsLauncherFollowers";
import { RequestsCard } from "./ClubToolsLauncherRequests";
import { TRAY_TOP, TrayHome, TrayPlanet, keepInView } from "./ClubToolsTrayParts";
import { useJoinRequests, type RequestRow } from "./use-join-requests";
import { PHONE_QUERY } from "./use-phone";

/**
 * Club tools on a phone: the Inline tray (Oct 23, 2026; PLAN-6.md, Franky
 * picked it from six phone boards, `PhoneE.dc.html`: the first three "felt
 * too large and overtake the screen too much"). The page mounts this in
 * place of the row for the owner and officers outside the app frame; a
 * computer keeps the Arc (ClubToolsLauncher.tsx).
 *
 * The row's Club tools pill is a toggle now, not a link: pressed (coral)
 * while open, its chevron flipped, the coral count of waiting join requests
 * on its little planet. The tray opens right under the row, inside the page
 * (no overlay, no dimming), and pushes the rest of the page down: Needs you
 * (the oldest request, Approve and Decline), then the seven tools as small
 * bubbles with their names, and All Club tools. A tool opens its card in
 * the tray, in place of the bubbles: the Arc's own cards, with no panel, so
 * their footer links go to the phone's Club tools pages. The card's × (or
 * Escape) goes back to the bubbles, focus to that tool's bubble; the pill or
 * Escape there shuts it, focus to the pill. Shut after something changed (a
 * request answered, a follower removed), the page is read again, as the Arc
 * does. Opening, and opening a card, scrolls the page just enough that the
 * tray clears the tab bar (ClubToolsTrayParts.tsx `keepInView`).
 *
 * Motion (springs.ts, transform and opacity only): the tray settles in from
 * the pill, the bubbles pop in one after another, a card swaps in sideways
 * as on the Arc. What is below the tray moves at once: no height is
 * animated, and going away the tray fades over the page, out of its flow.
 */
export function ClubToolsTrayRow({
  before,
  after,
  club,
  counts,
}: {
  /** + Post (when not hidden) and the hidden Edit page button. */
  before: ReactNode;
  /** The share square (absent on a hidden club). */
  after: ReactNode;
  club: ArcClub;
  counts: ArcCounts;
}): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const trayId = useId();
  // The page it was opened on: a page change shuts it with nothing to run.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === pathname;
  const [tool, setTool] = useState<ArcToolId | null>(null);
  const [invite, setInvite] = useState<"sheet" | "modal" | null>(null);
  const [pointerX, setPointerX] = useState<number | null>(null);

  // The pill's count follows the tray's reads of the list, until the page
  // sends a new number (as the Arc's planet).
  const [liveRequests, setLiveRequests] = useState<number | null>(null);
  const [seenRequests, setSeenRequests] = useState(counts.requests);
  if (seenRequests !== counts.requests) {
    setSeenRequests(counts.requests);
    setLiveRequests(null);
  }
  const live = useMemo(() => ({ ...counts, requests: liveRequests ?? counts.requests }), [counts, liveRequests]);

  const rowRef = useRef<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  // One read of the roster per opening, shared by Members and Officers.
  const rosterRef = useRef<RosterRead | null>(null);
  const changed = useRef(false);

  /** The tray's pointer goes under the pill's middle, from the row's left edge (the tray's own). */
  const measurePointer = useCallback(() => {
    const pill = pillRef.current;
    const row = rowRef.current;
    if (!pill || !row) return;
    const p = pill.getBoundingClientRect();
    setPointerX(Math.round(p.left + p.width / 2 - row.getBoundingClientRect().left));
  }, []);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measurePointer);
    return () => window.removeEventListener("resize", measurePointer);
  }, [open, measurePointer]);

  const show = () => {
    rosterRef.current = null;
    setTool(null);
    setInvite(null);
    measurePointer();
    setOpenOn(pathname);
  };

  /** Shut: the page is read again if something changed; focus to the pill when asked (Escape, a link on this page). */
  const close = useCallback(
    (focusPill: boolean) => {
      setOpenOn(null);
      setTool(null);
      setInvite(null);
      if (changed.current) {
        changed.current = false;
        router.refresh();
      }
      if (focusPill) window.requestAnimationFrame(() => pillRef.current?.focus({ preventScroll: true }));
    },
    [router],
  );

  /** A link in a card or All Club tools: leaving the page, the tray shuts; one on this page (Past events) gives focus back. */
  const leave = useCallback(
    (href: string) => close(new URL(href, window.location.href).pathname === window.location.pathname),
    [close],
  );

  // Something changed the club (a request answered, say): the page is read
  // again on the way out, and Members and Officers read the roster afresh,
  // so the person just let in is on it (Oct 23, 2026).
  const markChanged = useCallback(() => {
    changed.current = true;
    rosterRef.current = null;
  }, []);

  const clubPath = `/orgs/${encodeURIComponent(club.handle)}`;
  // Club settings' Edit page: the tray shuts and the Edit page dialog opens
  // (the hidden button registers the opener; `?edit=1` if it hasn't). The
  // pill takes focus first, so the dialog hands it back there on close.
  const editPage = useCallback(() => {
    pillRef.current?.focus({ preventScroll: true });
    close(false);
    if (!openEditPage()) router.push(`${clubPath}?edit=1`, { scroll: false });
  }, [close, router, clubPath]);

  // Invite members, from the Invite card: the Invite people sheet over the
  // tray, a sheet from the bottom on a phone (as ToolsIndex.tsx). It can send
  // invites and answer requests, so it counts as a change.
  const openInvite = useCallback(() => setInvite(window.matchMedia(PHONE_QUERY).matches ? "sheet" : "modal"), []);
  const closeInvite = useCallback(() => {
    setInvite(null);
    changed.current = true;
    window.requestAnimationFrame(() => boxRef.current?.querySelector<HTMLElement>("[data-arc-invite]")?.focus({ preventScroll: true }));
  }, []);

  return (
    <>
      <div ref={rowRef} className="vibe-club-actions">
        {before}
        {/* `vibe-club-row-tools`: the row's Club tools pill, where Edit page
            hands focus back when the button it came from is gone. */}
        <button
          ref={pillRef}
          type="button"
          className="vibe-press vibe-club-row-tools"
          aria-label={planetLabel(live.requests)}
          aria-expanded={open}
          aria-controls={open ? trayId : undefined}
          onClick={() => (open ? close(false) : show())}
          onKeyDown={(e) => {
            if (e.key !== "Escape" || !open || e.defaultPrevented) return;
            e.preventDefault();
            close(false);
          }}
          style={pillStyle}
        >
          <motion.span aria-hidden initial={false} animate={{ opacity: open ? 1 : 0 }} transition={SPRING_SNAPPY} style={pressedStyle} />
          <TrayPlanet count={planetCount(live.requests)} />
          <span style={{ position: "relative", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>Club tools</span>
          <motion.svg
            aria-hidden
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={SPRING_SNAPPY}
            style={{ position: "relative", flexShrink: 0, color: open ? "var(--tag-ink)" : "var(--ink-2)" }}
          >
            <path d="M6 9l6 6 6-6" />
          </motion.svg>
        </button>
        {after}
      </div>
      {/* The tray's box: in the page's flow while it is open, empty when shut.
          It reaches over the page's side margins and clips there, on x only,
          so a card sliding in from the right never makes the page wider (a
          phone would widen every fixed layer with it, the tab bar included;
          YourWeek.tsx has the same fix). */}
      <div ref={boxRef} style={boxStyle}>
        <AnimatePresence>
          {open ? (
            <ClubToolsTray
              key="club-tools-tray"
              id={trayId}
              club={club}
              counts={live}
              tool={tool}
              pointerX={pointerX}
              rowRef={rowRef}
              rosterRef={rosterRef}
              onPick={setTool}
              onCloseCard={() => setTool(null)}
              onClose={close}
              onLeave={leave}
              onInvite={openInvite}
              onEditPage={editPage}
              onCount={setLiveRequests}
              onChanged={markChanged}
            />
          ) : null}
        </AnimatePresence>
      </div>
      {open && invite ? (
        <OrgInviteSheet handle={club.handle} orgName={club.name} audience={club.audience} presentation={invite} onClose={closeInvite} />
      ) : null}
    </>
  );
}

/** How long after opening, or after a card opens, the tray's growth is kept clear of the tab bar. */
const FOLLOW_MS = 1500;

/**
 * The open tray: a pointer up to the pill, then the first view
 * (ClubToolsTrayParts.tsx `TrayHome`) or a tool's card. Going away it is
 * inert and leaves the page's flow (absolute, over what is below), so the
 * page closes up at once while it fades.
 */
function ClubToolsTray({
  id,
  club,
  counts,
  tool,
  pointerX,
  rowRef,
  rosterRef,
  onPick,
  onCloseCard,
  onClose,
  onLeave,
  onInvite,
  onEditPage,
  onCount,
  onChanged,
}: {
  id: string;
  club: ArcClub;
  counts: ArcCounts;
  tool: ArcToolId | null;
  pointerX: number | null;
  rowRef: RefObject<HTMLDivElement | null>;
  rosterRef: RefObject<RosterRead | null>;
  onPick: (id: ArcToolId) => void;
  onCloseCard: () => void;
  onClose: (focusPill: boolean) => void;
  onLeave: (href: string) => void;
  onInvite: () => void;
  onEditPage: () => void;
  onCount: (n: number) => void;
  onChanged: () => void;
}): JSX.Element {
  const present = useIsPresent();
  const reduce = useReducedMotion() === true;
  const trayRef = useRef<HTMLElement | null>(null);
  // What it shows: the open tool, kept as it was while the tray goes away
  // (shutting clears the tool, and the card shouldn't swap out mid-fade).
  const [view, setView] = useState(tool);
  if (present && view !== tool) setView(tool);
  // The tool whose card the bubbles came back from: its bubble takes focus.
  const [back, setBack] = useState<ArcToolId | null>(null);

  // Needs you: the people waiting, read as the tray opens (not when the page
  // says nobody waits). A card that acted on the club may have answered some
  // too, so on the way back the list is read again, and the strip stays
  // away until it has been (`held`: the rows it no longer trusts).
  const needs = useJoinRequests({ handle: club.handle, clubName: club.name, enabled: counts.requests !== 0, onCount, onChanged });
  const stale = useRef(false);
  const [held, setHeld] = useState<RequestRow[] | null>(null);
  const fresh = needs.rows !== null && needs.rows !== held;
  const cardChanged = () => {
    stale.current = true;
    onChanged();
  };

  /** × or Escape on a card: back to the bubbles, focus to the one that opened it. */
  const closeCard = () => {
    if (!tool) return;
    setBack(tool);
    if (stale.current) {
      stale.current = false;
      setHeld(needs.rows);
      needs.retry();
    }
    onCloseCard();
  };

  // Clear of the tab bar: as it opens and as each card opens, and for a
  // moment after, while it grows (a card's list arriving). The person
  // scrolling the page themselves ends that moment.
  const follow = useRef(0);
  useEffect(() => {
    const el = trayRef.current;
    if (!el || !present) return;
    follow.current = performance.now() + FOLLOW_MS;
    const frame = window.requestAnimationFrame(() => keepInView(el, rowRef.current, reduce));
    return () => window.cancelAnimationFrame(frame);
  }, [tool, present, rowRef, reduce]);
  useEffect(() => {
    const el = trayRef.current;
    if (!el || !present || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (performance.now() < follow.current) keepInView(el, rowRef.current, reduce);
    });
    ro.observe(el);
    const stop = () => {
      follow.current = 0;
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
    };
  }, [present, rowRef, reduce]);

  // Escape (a keyboard): a card goes back to the bubbles, the bubbles shut
  // the tray and focus goes to the pill. Not while a search box has words in
  // it, and not when something over the tray took the key first.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    const at = e.target;
    if (at instanceof HTMLInputElement && at.type === "search" && at.value) return;
    e.preventDefault();
    if (tool) closeCard();
    else onClose(true);
  };

  // The Arc's cards as they are, with no panel: their footers go to the
  // phone's Club tools pages. Their × comes back here.
  const common = { club, counts, onClose: closeCard, onLeave };
  const inviting = () => {
    stale.current = true;
    onInvite();
  };

  return (
    <motion.section
      ref={trayRef}
      id={id}
      aria-label="Club tools, only officers"
      // The tools panel's coral focus ring (globals.css), and none on a card
      // that only took focus to bring the keyboard in.
      className="vibe-night-island vibe-tools-panel"
      inert={!present}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97, transition: SPRING_SNAPPY }}
      transition={SPRING_SOFT}
      style={{
        ...(present ? trayStyle : goingStyle),
        transformOrigin: pointerX === null ? "50% 0px" : `${pointerX}px 0px`,
      }}
    >
      {pointerX !== null ? (
        <span aria-hidden style={{ ...pointerStyle, left: pointerX - 6, background: view ? CARD_TOP : TRAY_TOP }} />
      ) : null}
      <AnimatePresence mode="wait">
        {view === "requests" ? (
          <RequestsCard key="requests" {...common} onCount={onCount} onChanged={cardChanged} />
        ) : view === "members" ? (
          <MembersCard key="members" {...common} rosterRef={rosterRef} />
        ) : view === "followers" ? (
          <FollowersCard key="followers" {...common} onChanged={cardChanged} />
        ) : view === "officers" ? (
          <OfficersCard key="officers" {...common} rosterRef={rosterRef} />
        ) : view === "events" ? (
          <EventsCard key="events" {...common} />
        ) : view === "settings" ? (
          <SettingsCard key="settings" {...common} onEditPage={onEditPage} />
        ) : view === "invite" ? (
          <InviteCard key="invite" {...common} onInvite={inviting} />
        ) : (
          <TrayHome
            key="home"
            needs={{
              rows: fresh ? needs.rows : null,
              failure: needs.failure,
              busy: needs.busy,
              // The placeholder only for the first read; a re-read after a
              // card brings the strip back when it lands.
              expected: held === null && (counts.requests ?? 0) > 0,
              act: (row, action) => void needs.act(row, action),
              retry: needs.retry,
            }}
            hidden={club.hidden}
            counts={counts}
            toolsHref={`/orgs/${encodeURIComponent(club.handle)}/tools`}
            back={back}
            onPick={onPick}
            onLeave={onLeave}
          />
        )}
      </AnimatePresence>
    </motion.section>
  );
}

// ─── Looks ────────────────────────────────────────────────────────────────

/**
 * The row's Club tools pill: OfficerActions.tsx's half pill (the page's dark
 * glass, 44px), a little tighter inside so the planet, the name and the
 * chevron fit half a phone's row.
 */
const pillStyle: CSSProperties = {
  position: "relative",
  flex: 1,
  minWidth: 0,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  boxSizing: "border-box",
  padding: "0 8px",
  borderRadius: 12,
  border: "1px solid rgba(var(--scrim-rgb),0.10)",
  background: "rgba(var(--scrim-rgb),0.09)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14.5,
  fontWeight: 700,
  whiteSpace: "nowrap",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

/** The pill pressed while the tray is open: a coral-tinted face and a coral ring, faded in over it. */
const pressedStyle: CSSProperties = {
  position: "absolute",
  inset: -1,
  borderRadius: 12,
  background: "linear-gradient(180deg, rgba(255,92,53,0.26) 0%, rgba(255,92,53,0.12) 100%), rgba(20,14,26,0.6)",
  border: "1px solid rgba(255,140,100,0.62)",
  boxShadow: "inset 0 2px 7px rgba(0,0,0,0.45), 0 0 18px rgba(255,92,53,0.20)",
  pointerEvents: "none",
};

/** How far the tray's box reaches past the column on each side: the phone page's side margin (globals.css `.vibe-org-shell`, 14px). */
const BLEED = 14;

/** The tray's box: as wide as the phone, clipped on x alone (y stays visible: the pointer above and the shadow below aren't cut). */
const boxStyle: CSSProperties = { position: "relative", margin: `0 -${BLEED}px`, padding: `0 ${BLEED}px`, overflowX: "clip" };

/** In the page's flow, over what is below it (its shadow falls on it). */
const trayStyle: CSSProperties = { position: "relative", zIndex: 2, marginTop: 10 };

/** Going away: out of the flow, so the page closes up at once, and taking no taps. */
const goingStyle: CSSProperties = { position: "absolute", zIndex: 2, top: 10, left: BLEED, right: BLEED, pointerEvents: "none" };

/** The top of the Arc's card (ClubToolsLauncherParts.tsx), for the pointer over a card. */
const CARD_TOP = "#17121F";

/** A small rotated square peeking over the tray's top edge, under the pill. */
const pointerStyle: CSSProperties = {
  position: "absolute",
  zIndex: 3,
  top: -6,
  width: 12,
  height: 12,
  boxSizing: "border-box",
  transform: "rotate(45deg)",
  borderLeft: "1px solid rgba(255,140,100,0.45)",
  borderTop: "1px solid rgba(255,140,100,0.45)",
  borderTopLeftRadius: 3,
  pointerEvents: "none",
};
