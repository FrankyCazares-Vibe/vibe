"use client";

import { AnimatePresence, motion, useIsPresent } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

import { isClubPath } from "@/components/mobile/mobile-tab-active";
import { ClubLogo } from "@/components/profile/ClubFlair";
import { SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";
import { readClubsYouRunLast, useClubsYouRun } from "@/lib/orgs/club-switch";
import { readClubsInLast, useClubsIn } from "@/lib/orgs/clubs-in";

/**
 * "Your clubs" in the desktop left menu's profile card (Oct 21, 2026,
 * Franky: two clubs already pushed the calendar out of sight, and members
 * want a quick way to their club's page too). One row in the card, the same
 * height however many clubs: "Your clubs", then up to three small logos
 * (and "+N" for the rest), with a coral dot on them while a club I run has
 * join requests. It fits the card at the menu's narrowest. It opens a list
 * that floats over the calendar (the calendar never moves): the clubs I run
 * first (from `/api/me/clubs-you-run`, each with its dot), then the clubs
 * I'm a member of (`/api/me/clubs-in`). Each line is the club's page.
 *
 * WHY A FLOATING LIST. The app's motion rules (src/lib/motion/springs.ts)
 * animate transform and opacity only, never height, so the list can't grow
 * the card smoothly; and the menu and the card both clip, so the list is
 * drawn in a portal at the row's place. Tab from the row goes into it. It
 * closes on a pick, a click outside, Escape (focus back on the row), Tab
 * past either end, focus going anywhere else (an iframe included), the menu
 * or the page scrolling, a resize and a page change. Each opening asks both
 * lists fresh, as the phone's switcher does; between pages the row keeps
 * the last answer while a new one comes.
 *
 * Nothing at all until I'm in a club, so for most people the card is
 * unchanged. A phone never asks (LeftNav is hidden there; the phone has the
 * Profile-tab switch).
 */

/** LeftNav shows from 900px up (CampusAppShell mounts it at every width and hides it below). */
const DESKTOP_QUERY = "(min-width: 900px)";
/** Logos stacked on the row. */
const STACK_MAX = 3;
/** The list's tallest; more clubs scroll inside it. */
const PANEL_MAX_H = 360;
/** Below this much room under the row, the list opens upward if there's more room there. */
const ROOM_BELOW_MIN = 200;

function subscribeDesktop(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function isDesktopNow(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(DESKTOP_QUERY).matches;
}

type Place = { left: number; width: number; maxH: number; below: boolean; top?: number; bottom?: number };

type Line = { org_id: string; handle: string; name: string; logo_url: string | null; requests: number | null };

/** Where the list goes: under the row at the card's width, or above it when the row sits low. */
function placeFor(button: HTMLElement): Place {
  const card = button.closest("#nav-identity-chip") ?? button;
  const cardRect = card.getBoundingClientRect();
  const row = button.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.max(cardRect.width, 232);
  const left = Math.max(8, Math.min(cardRect.left, vw - width - 8));
  const roomBelow = vh - row.bottom - 14;
  const roomAbove = row.top - 14;
  if (roomBelow >= ROOM_BELOW_MIN || roomBelow >= roomAbove) {
    return { left, width, below: true, top: row.bottom + 6, maxH: Math.min(PANEL_MAX_H, Math.max(120, roomBelow)) };
  }
  return { left, width, below: false, bottom: vh - row.top + 6, maxH: Math.min(PANEL_MAX_H, Math.max(120, roomAbove)) };
}

export function YourClubsMenu(): JSX.Element | null {
  const pathname = usePathname() ?? "";
  // Asks only where the menu shows: "not desktop" on the server and while
  // hydrating, so the first render and the server agree.
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktopNow, () => false);
  const runs = useClubsYouRun(desktop);
  const ins = useClubsIn(desktop);

  const [place, setPlace] = useState<Place | null>(null);
  const open = place !== null;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  /** Opened from the keyboard: focus goes to the first club. */
  const focusFirst = useRef(false);
  const panelId = useId();

  // A page change closes it (React's "adjust state while rendering").
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (place) setPlace(null);
  }

  const close = (refocus: boolean) => {
    setPlace(null);
    if (refocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (panelRef.current?.contains(t) || buttonRef.current?.contains(t));
    const onPointer = (e: PointerEvent) => {
      if (!inside(e.target)) setPlace(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      // Only while focus is ours (the row, the list, or nowhere): Escape in a
      // window opened on top of the page belongs to that window.
      const at = document.activeElement;
      if (e.key !== "Escape" || !(at === null || at === document.body || inside(at))) return;
      e.preventDefault();
      setPlace(null);
      buttonRef.current?.focus();
    };
    const onScroll = (e: Event) => {
      // Only a scroll that moves the row: the page itself, or the menu around
      // it. A chat thread pinning to a new message elsewhere doesn't count.
      const t = e.target;
      const row = buttonRef.current;
      if (t === document || t === document.documentElement || (t instanceof Node && row && t.contains(row))) {
        setPlace(null);
      }
    };
    // Focus went somewhere else (Tab out, a click into an iframe): close, without pulling it back.
    const onFocusIn = (e: FocusEvent) => {
      if (!inside(e.target)) setPlace(null);
    };
    const onBlur = () => setPlace(null);
    const onResize = () => setPlace(null);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("blur", onBlur);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !focusFirst.current) return;
    focusFirst.current = false;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
  }, [open]);

  // While a page's first ask runs, the last answer holds the row's place
  // (page memory, cleared with the cache), so it doesn't vanish and come back.
  const run: Line[] = runs.status === "ok" ? runs.clubs : desktop ? (readClubsYouRunLast() ?? []) : [];
  const runIds = new Set(run.map((c) => c.org_id));
  const inClubs = ins.status === "ok" ? ins.clubs : desktop ? (readClubsInLast() ?? []) : [];
  const member: Line[] = inClubs.filter((c) => !runIds.has(c.org_id)).map((c) => ({ ...c, requests: null }));
  const all = [...run, ...member];
  if (!desktop || all.length === 0) return null;
  const waiting = run.some((c) => (c.requests ?? 0) > 0);

  const onToggle = (e: MouseEvent<HTMLButtonElement>) => {
    if (open) {
      setPlace(null);
      return;
    }
    // A click from Enter or Space has no pointer detail.
    focusFirst.current = e.detail === 0;
    setPlace(placeFor(e.currentTarget));
    // Fresh on every opening (a club just joined or left shows right away).
    runs.refresh();
    ins.refresh();
  };

  // The list is drawn at the end of the page, so Tab from the open row goes into it.
  const onRowKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open || e.key !== "Tab" || e.shiftKey) return;
    const first = panelRef.current?.querySelector<HTMLElement>("a");
    if (!first) return;
    e.preventDefault();
    first.focus();
  };

  // Up and Down move between clubs; Tab past either end closes and goes back to the row.
  const onPanelKey = (e: KeyboardEvent<HTMLElement>) => {
    const links = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a") ?? []);
    if (links.length === 0) return;
    const at = links.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? (at + 1) % links.length : (at - 1 + links.length) % links.length;
      links[next]?.focus();
    } else if (e.key === "Tab" && ((!e.shiftKey && at === links.length - 1) || (e.shiftKey && at <= 0))) {
      e.preventDefault();
      close(true);
    }
  };

  let index = 0;
  const group = (key: string, title: string, lines: Line[]) =>
    lines.length === 0 ? null : (
      <div role="group" aria-labelledby={`${panelId}-${key}`} style={groupStyle}>
        <div id={`${panelId}-${key}`} style={eyebrowStyle}>
          {title}
        </div>
        {lines.map((club) => {
          const here = isClubPath(pathname, club.handle);
          const dot = (club.requests ?? 0) > 0;
          const delay = Math.min(index++, 8) * 0.025;
          return (
            <motion.div
              key={club.org_id}
              initial={{ opacity: 0, y: place?.below === false ? -4 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING_SOFT, delay }}
            >
              <Link
                href={`/orgs/${encodeURIComponent(club.handle)}`}
                className="vibe-clubs-row"
                aria-current={here ? "page" : undefined}
                style={here ? { ...rowStyle, ...rowHereStyle } : rowStyle}
                onClick={() => setPlace(null)}
              >
                <ClubLogo name={club.name} url={club.logo_url} size={22} />
                <span style={nameStyle}>{club.name}</span>
                {dot ? (
                  <>
                    <span aria-hidden="true" style={dotStyle} />
                    <span style={srOnlyStyle}>, join requests to review</span>
                  </>
                ) : null}
              </Link>
            </motion.div>
          );
        })}
      </div>
    );

  const panel =
    open && place ? (
      <FloatingNav
        key="your-clubs"
        ref={panelRef}
        id={panelId}
        aria-label="Your clubs"
        onKeyDown={onPanelKey}
        initial={{ opacity: 0, y: place.below ? -6 : 6, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: place.below ? -4 : 4, scale: 0.98, transition: SPRING_SNAPPY }}
        transition={SPRING_SOFT}
        style={{
          ...panelStyle,
          left: place.left,
          width: place.width,
          maxHeight: place.maxH,
          top: place.top,
          bottom: place.bottom,
          transformOrigin: place.below ? "top center" : "bottom center",
        }}
      >
        {group("run", "Clubs you run", run)}
        {group("in", "Clubs you're in", member)}
      </FloatingNav>
    ) : null;

  return (
    <div style={sectionStyle}>
      <button
        ref={buttonRef}
        type="button"
        className="vibe-clubs-toggle"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Your clubs, ${all.length}${waiting ? ", join requests to review" : ""}`}
        onClick={onToggle}
        onKeyDown={onRowKey}
        style={toggleStyle}
      >
        <span style={labelStyle}>Your clubs</span>
        <span aria-hidden="true" style={stackStyle}>
          {all.slice(0, STACK_MAX).map((club, i) => (
            <span
              key={club.org_id}
              style={{ ...stackItemStyle, marginLeft: i === 0 ? 0 : -7 }}
            >
              <ClubLogo name={club.name} url={club.logo_url} size={20} />
            </span>
          ))}
          {all.length > STACK_MAX ? (
            <span style={{ ...stackItemStyle, ...moreStyle, marginLeft: -7 }}>+{all.length - STACK_MAX}</span>
          ) : null}
          {waiting ? <span style={badgeStyle} /> : null}
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={SPRING_SNAPPY}
          style={chevronStyle}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.span>
      </button>
      {typeof document === "undefined" ? null : createPortal(<AnimatePresence>{panel}</AnimatePresence>, document.body)}
    </div>
  );
}

/**
 * The list's frame. While it fades out after closing it no longer catches
 * clicks or keys, so a click meant for what's underneath lands there.
 */
function FloatingNav({ style, ...rest }: ComponentProps<typeof motion.nav>): JSX.Element {
  const present = useIsPresent();
  return <motion.nav {...rest} inert={!present} style={present ? style : { ...style, pointerEvents: "none" }} />;
}

/** The card's lower part: a hairline under my name, the card's own paper. */
const sectionStyle: CSSProperties = {
  borderTop: "1px solid var(--hairline)",
  background: "var(--paper)",
};

/** One row, the card's width; hover and its keyboard ring live in globals.css (`.vibe-clubs-toggle`). */
const toggleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  padding: "8px 9px 8px 10px",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--ink-2)",
};

/** The logos, overlapping; the coral badge sits on their corner. */
const stackStyle: CSSProperties = { position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 };

/** A ring of the card's paper between overlapping logos; each later one sits on top, so "+N" shows whole. */
const stackItemStyle: CSSProperties = {
  position: "relative",
  display: "inline-flex",
  borderRadius: "50%",
  boxShadow: "0 0 0 2px var(--paper)",
};

/** "+2" after three logos, the logos' size and shape. */
const moreStyle: CSSProperties = {
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  padding: "0 4px",
  borderRadius: 999,
  background: "var(--row-hover)",
  border: "1px solid var(--hairline)",
  boxSizing: "border-box",
  color: "var(--ink-muted)",
  fontSize: 9.5,
  fontWeight: 700,
};

/** A club I run has join requests: a coral dot on the logos' top corner. */
const badgeStyle: CSSProperties = {
  position: "absolute",
  top: -2,
  right: -2,
  zIndex: 10,
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "var(--coral)",
  boxShadow: "0 0 0 2px var(--paper)",
};

const labelStyle: CSSProperties = { flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

const chevronStyle: CSSProperties = { display: "inline-flex", flexShrink: 0, color: "var(--ink-muted)" };

/** Above the page and the menu, as LeftNav's own calendar windows (zIndex 9999). */
const panelStyle: CSSProperties = {
  position: "fixed",
  zIndex: 9999,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: 6,
  borderRadius: 12,
  background: "var(--paper)",
  border: "1px solid var(--hairline)",
  boxShadow: "0 14px 40px rgba(0, 0, 0, 0.22)",
};

const groupStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 1 };

/** LeftNav's "Platform" eyebrow, a size down. */
const eyebrowStyle: CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
  padding: "6px 8px 4px",
};

/** Hover and the keyboard ring live in globals.css (`.vibe-clubs-row`). */
const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "7px 8px",
  borderRadius: 8,
  fontFamily: "'DM Sans', system-ui, sans-serif",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--ink-2)",
  textDecoration: "none",
  minWidth: 0,
};

const rowHereStyle: CSSProperties = {
  fontWeight: 600,
  color: "var(--charcoal)",
  background: "var(--row-hover)",
};

const nameStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const dotStyle: CSSProperties = {
  flexShrink: 0,
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: "var(--coral)",
};

const srOnlyStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};
