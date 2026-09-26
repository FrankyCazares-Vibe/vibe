"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type WheelEvent,
} from "react";

import {
  eventChipLabel,
  eventChipTitle,
  leadIn,
  rollDurationSec,
  shouldRoll,
  stripEntries,
  stripIsEmpty,
  tagChipTitle,
  type StripEntry,
} from "./rolling-strip-view";
import type { StripData } from "./strip-data";

/**
 * The Feed tab's rolling strip (S67 wave 1, plan D, contracts C1): the
 * student's next RSVP'd events, then the week's trending tags, as one row of
 * 30px chips on a dotted track behind an italic coral lead-in. It replaces
 * the two-card `OttoFeedStrip` on both shells.
 *
 * The PARENT owns the data (`useStripData` in strip-data.ts) and passes it in,
 * so it knows when the strip is hidden: `null` whenever `stripIsEmpty(data)`,
 * with no placeholder — the composer moves up. A refused read shows one
 * "Couldn't load · Retry" chip per failed source, never silence.
 *
 * Two behaviours from one component:
 *   - `roll` false (the phone, the default): a manual scroller. Chips
 *     moving under a thumb hurt taps, so nothing moves.
 *   - `roll` true (the desktop): ONE copy is rendered and measured with a
 *     ResizeObserver; only when it overflows its room by more than the slack
 *     (and the student hasn't asked for reduced motion) does a second,
 *     aria-hidden copy appear (not `inert`: that would swallow clicks on the
 *     clone half while the roll is paused) and the pair slide left on a
 *     transform animation, paused on hover, focus-within and while the tab is
 *     hidden. A horizontal wheel or an arrow key hands the strip back to the
 *     student: the roll stops for the life of the mount and the phone's
 *     manual scroller takes over. When the chips fit, it behaves exactly like
 *     the phone.
 *
 * Colours are the C0 tokens only. The right-edge fade is a mask on the
 * scroller, so it works while scrolling and while rolling and shows whatever
 * backdrop sits under the strip. Chips stay 30px tall (C1); a pseudo-element
 * stretches each hit area to the strip's 40px.
 */
export function RollingStrip(props: {
  data: StripData;
  onPickTag(tag: string): void;
  onPickEvent(eventId: string): void;
  /** The tag filter in force; that chip renders charcoal and tapping it clears. */
  activeTag?: string | null;
  /** Viewing another campus (wave 4): the lead-in reads `there.`. */
  visiting?: boolean;
  /** Desktop: roll when the chips overflow. Off on the phone. */
  roll?: boolean;
  /** The phone passes its bleed (`margin:0 -16px; padding:0 16px`) and `vibe-no-scrollbar`. */
  className?: string;
}): JSX.Element | null {
  const { data, onPickTag, onPickEvent, activeTag = null, visiting = false, roll = false, className } = props;
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [trackWidth, setTrackWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  // The student scrolled or arrowed the strip: theirs from here on, no roll.
  const [manual, setManual] = useState(false);
  // How far the roll had travelled when they took over, carried into scrollLeft.
  const carryRef = useRef(0);

  const empty = stripIsEmpty(data);
  const entries = empty ? [] : stripEntries(data, new Date());
  const rolling = roll && !manual && shouldRoll(trackWidth, viewportWidth, reducedMotion);

  // Reduced motion: the OS setting, live. Desktop only — the phone never rolls.
  useEffect(() => {
    if (!roll || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [roll]);

  // A hidden tab pauses the roll (CSS can't see document.hidden).
  useEffect(() => {
    if (!roll || typeof document === "undefined") return;
    const sync = () => setPageHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [roll]);

  // Measure the single copy against the room it has. The room is the
  // scroller's padding box minus where the track starts (the lead-in and its
  // gap); offsetLeft ignores transforms and scroll, so the number is stable
  // while rolling. Observing the copy (not the track) means the clone
  // appearing never feeds back into the decision.
  useEffect(() => {
    if (!roll || empty) return;
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    const copy = copyRef.current;
    if (!scroller || !track || !copy || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      setTrackWidth(Math.round(copy.getBoundingClientRect().width));
      setViewportWidth(Math.round(scroller.clientWidth - track.offsetLeft));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    ro.observe(copy);
    return () => ro.disconnect();
  }, [roll, empty]);

  // Starting to roll from a scrolled position would show a seam; reset first.
  // Stopping because the student took over: the clone goes and the transform
  // with it, so put the rolled distance into scrollLeft before paint or the
  // chips jump back to the start under the pointer.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (rolling) scroller.scrollLeft = 0;
    else if (carryRef.current > 0) {
      scroller.scrollLeft = carryRef.current;
      carryRef.current = 0;
    }
  }, [rolling]);

  // Plan D: manual scroll always works. While rolling the scroller is
  // overflow:hidden, so a horizontal wheel (or shift+wheel) and the arrow keys
  // switch the roll off for the life of this mount; from then on the browser
  // handles the gesture itself on the plain scroller.
  const takeOver = () => {
    if (!rolling) return;
    const track = trackRef.current;
    if (track && typeof DOMMatrix === "function") {
      const transform = getComputedStyle(track).transform;
      if (transform && transform !== "none") carryRef.current = Math.max(0, -new DOMMatrix(transform).m41);
    }
    setManual(true);
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || (e.shiftKey && e.deltaY !== 0)) takeOver();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") takeOver();
  };

  // On the phone the strip sits inside the campus pane scroller (Feed / Events /
  // Orgs / Chat / Map snap horizontally), where a horizontal gesture that
  // escapes the strip flips the tab. `overscroll-behavior-x: contain` keeps a
  // touch inside the strip; this native (non-passive: React's onWheel can't
  // preventDefault) listener does the same for a trackpad or mouse wheel in a
  // narrow window, so a horizontal wheel over an overflowing strip scrolls
  // the strip itself and goes no further.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onNativeWheel = (e: globalThis.WheelEvent) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || (e.shiftKey && e.deltaY !== 0);
      if (!horizontal || scroller.scrollWidth <= scroller.clientWidth + 1) return;
      e.preventDefault();
      scroller.scrollLeft += e.deltaX || e.deltaY;
    };
    scroller.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onNativeWheel);
  }, [empty]);

  if (empty) return null;

  const failureFor = (source: "upcoming" | "trending") =>
    source === "upcoming"
      ? { failure: data.upcomingErr, retry: data.retryUpcoming }
      : { failure: data.trendingErr, retry: data.retryTrending };

  const renderEntry = (entry: StripEntry, clone: boolean): JSX.Element => {
    const tab = clone ? -1 : undefined;
    if (entry.kind === "event") {
      const going = entry.status === "going";
      return (
        <button
          key={`${clone ? "c-" : ""}e-${entry.id}`}
          type="button"
          className="vibe-strip-chip"
          style={EVENT_CHIP}
          title={eventChipTitle(entry.status)}
          aria-label={eventChipLabel(entry.title, entry.when, entry.status)}
          tabIndex={tab}
          onClick={() => onPickEvent(entry.id)}
        >
          <OrbitGlyph going={going} />
          <span style={EVENT_TITLE}>{entry.title}</span>
          {entry.when ? <span style={EVENT_WHEN}>{entry.when}</span> : null}
        </button>
      );
    }
    if (entry.kind === "tag") {
      const active = activeTag === entry.tag;
      return (
        <button
          key={`${clone ? "c-" : ""}t-${entry.tag}`}
          type="button"
          className="vibe-strip-chip"
          style={active ? TAG_CHIP_ACTIVE : TAG_CHIP}
          title={tagChipTitle(entry.count)}
          // The name is the tag; the title alone would be read as "1 post this week".
          aria-label={`#${entry.tag}, ${tagChipTitle(entry.count)}`}
          aria-pressed={active}
          tabIndex={tab}
          onClick={() => onPickTag(entry.tag)}
        >
          #{entry.tag}
          <span style={{ fontWeight: 500, opacity: 0.7 }}>{entry.count}</span>
        </button>
      );
    }
    // One chip per refused read. A failure that maps to an action (Sign in,
    // Review Terms) navigates there like LoadFailed does: a retry would only
    // fail again. Otherwise the matching retry re-reads that one source.
    const { failure, retry } = failureFor(entry.source);
    const action = failure?.action;
    return (
      <button
        key={`${clone ? "c-" : ""}f-${entry.source}`}
        type="button"
        className="vibe-strip-chip"
        style={FAILED_CHIP}
        title={entry.message}
        aria-label={`${entry.message} ${action ? action.label : "Retry"}`}
        tabIndex={tab}
        onClick={() => {
          if (action) window.location.assign(action.href);
          else retry();
        }}
      >
        Couldn&apos;t load · {action ? action.label : "Retry"}
      </button>
    );
  };

  const scrollerStyle: CSSProperties = {
    ...SCROLLER,
    overflowX: rolling ? "hidden" : "auto",
  };
  const trackStyle = {
    ...TRACK,
    "--vibe-strip-dur": `${rollDurationSec(trackWidth)}s`,
  } as CSSProperties;

  return (
    <div
      ref={scrollerRef}
      className={["vibe-strip", className].filter(Boolean).join(" ")}
      style={scrollerStyle}
      role="group"
      aria-label="Your events and trending tags"
      onWheel={onWheel}
      onKeyDown={onKeyDown}
    >
      <style>{STRIP_CSS}</style>
      <span aria-hidden="true" style={LEAD_IN}>
        {leadIn(visiting)}
      </span>
      <div
        ref={trackRef}
        className="vibe-strip-track"
        data-rolling={rolling ? "" : undefined}
        data-paused={rolling && pageHidden ? "" : undefined}
        style={trackStyle}
      >
        <div ref={copyRef} style={COPY}>
          {entries.map((e) => renderEntry(e, false))}
        </div>
        {rolling ? (
          <div aria-hidden="true" style={COPY}>
            {entries.map((e) => renderEntry(e, true))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The logo's open orbit: the arc, and a dot that's filled when going, hollow when interested. */
function OrbitGlyph({ going }: { going: boolean }): JSX.Element {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" style={{ flexShrink: 0 }}>
      <path d="M20.5 14.5A9 9 0 1 1 15 3.5" stroke="var(--coral)" strokeWidth={2.4} strokeLinecap="round" />
      {going ? (
        <circle cx={19} cy={18} r={3} fill="var(--coral)" />
      ) : (
        <circle cx={19} cy={18} r={2.6} fill="none" stroke="var(--coral)" strokeWidth={1.6} />
      )}
    </svg>
  );
}

// ── Styles (C0 tokens only; numbers from contracts C1) ──────────────────────

/** The right-edge fade: the last 48px of the scroller melt into the backdrop. */
const FADE = "linear-gradient(90deg, #000 calc(100% - 48px), transparent)";

const SCROLLER: CSSProperties = {
  height: 40,
  display: "flex",
  alignItems: "center",
  gap: 8,
  position: "relative",
  overflowY: "hidden",
  overscrollBehaviorX: "contain",
  scrollbarWidth: "none",
  // The dotted track, one pixel tall through the vertical centre.
  background:
    "repeating-linear-gradient(90deg, rgba(var(--scrim-rgb),0.16) 0 2px, transparent 2px 8px) center / 100% 1px no-repeat",
  maskImage: FADE,
  WebkitMaskImage: FADE,
};

const TRACK: CSSProperties = { display: "flex", alignItems: "center", flexShrink: 0 };

// Trailing 8px so two copies loop seamlessly at translateX(-50%); under the
// fade it's invisible when there's only one copy.
const COPY: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingRight: 8 };

// On a cream patch that covers the dots behind the word; above the track so
// rolling chips slide under it on the desktop.
const LEAD_IN: CSSProperties = {
  flexShrink: 0,
  alignSelf: "stretch",
  display: "inline-flex",
  alignItems: "center",
  paddingRight: 6,
  position: "relative",
  zIndex: 1,
  background: "var(--cream)",
  fontFamily: "Fraunces, serif",
  fontStyle: "italic",
  fontSize: 16,
  lineHeight: 1,
  color: "var(--coral)",
  userSelect: "none",
};

const CHIP: CSSProperties = {
  height: 30,
  padding: "0 12px",
  margin: 0,
  borderRadius: 999,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  fontWeight: 700,
  lineHeight: 1,
  whiteSpace: "nowrap",
  cursor: "pointer",
  appearance: "none",
  transition: "background 120ms ease, border-color 120ms ease, color 120ms ease",
};

const EVENT_CHIP: CSSProperties = {
  ...CHIP,
  background: "var(--glass)",
  border: "1px solid var(--glass-border)",
  color: "var(--charcoal)",
  boxShadow: "var(--card-shadow)",
};
const EVENT_TITLE: CSSProperties = {
  maxWidth: 150,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const EVENT_WHEN: CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--ink-muted)" };

const TAG_CHIP: CSSProperties = {
  ...CHIP,
  background: "var(--tag-bg)",
  border: "1px solid rgba(255,92,53,0.22)",
  color: "var(--tag-ink)",
};
const TAG_CHIP_ACTIVE: CSSProperties = {
  ...TAG_CHIP,
  background: "var(--charcoal)",
  color: "var(--cream)",
  borderColor: "transparent",
};

const FAILED_CHIP: CSSProperties = {
  ...CHIP,
  fontWeight: 600,
  background: "transparent",
  border: "1px dashed rgba(var(--scrim-rgb),0.14)",
  color: "var(--ink-2)",
};

/**
 * What inline styles can't say: the keyframes, the hover / focus-within /
 * hidden-tab pause, the reduced-motion belt, the 40px hit area and the coral
 * focus ring. Scoped by class; one strip per shell, so one copy in the DOM.
 */
const STRIP_CSS = `
@keyframes vibe-strip-roll { to { transform: translateX(-50%); } }
.vibe-strip::-webkit-scrollbar { display: none; }
.vibe-strip-track[data-rolling] {
  animation: vibe-strip-roll var(--vibe-strip-dur, 30s) linear infinite;
  will-change: transform;
}
.vibe-strip:hover .vibe-strip-track[data-rolling],
.vibe-strip:focus-within .vibe-strip-track[data-rolling],
.vibe-strip-track[data-rolling][data-paused] { animation-play-state: paused; }
@media (prefers-reduced-motion: reduce) {
  .vibe-strip-track[data-rolling] { animation: none; }
}
.vibe-strip-chip { position: relative; }
.vibe-strip-chip::before { content: ""; position: absolute; left: 0; right: 0; top: -5px; bottom: -5px; }
.vibe-strip-chip:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
`;
