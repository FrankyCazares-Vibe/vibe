"use client";

/**
 * The officers' door screen (Oct 19 2026; contract §4.3, D7): a big QR and a
 * 4-digit code that change every 30 seconds, on its own page so it outlives
 * the events list dropping the card, works in the hour after the end and
 * opens on a second device.
 *
 * Theme tokens only, so Night mode follows, except the QR tile (QrCode.tsx):
 * dark on white in every theme, because cameras misread inverted codes.
 * No tab bar and no portal. `data-holds-reload` holds a new build's reload
 * while check-in is open, so a deploy never blanks the screen mid-line.
 *
 * Oct 19, 2026 (B10): one way out per screen. Officers get the header's Done
 * on every screen (the open door used to draw a second Done beside Stop);
 * everyone else gets "Go to the event" and no Done. The rules, the "opens"
 * line and the after-the-end count live in door-screen.ts, with tests.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  useEffect,
  useRef,
  useTransition,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

import {
  CHECKIN_COPY,
  CHECKIN_ERRORS,
  checkinCountLine,
  eventAnchorPath,
  newCodeInLine,
  spokenCode,
  type CheckinErrorCode,
} from "@/lib/events/event-checkin";
import { RISE_PX, SPRING_POP, SPRING_SOFT } from "@/lib/motion/springs";

import { DOOR_START_LEAD, doorAfterLine, doorExits, doorOpensLine, doorScreen, doorWhoCameLabel } from "./door-screen";
import { QrCode } from "./QrCode";
import { useDoorFeed, type DoorFeedState } from "./use-door-feed";
import { useWakeLock } from "./use-wake-lock";

export type DoorEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  org: { name: string; handle: string } | null;
};

/** A visible outline in both themes (the hairline token is too faint for a button edge). */
export const DOOR_OUTLINE = "1.5px solid rgba(var(--scrim-rgb), 0.22)";

export const doorPill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  padding: "0 20px",
  borderRadius: 999,
  border: DOOR_OUTLINE,
  background: "transparent",
  color: "var(--charcoal)",
  font: "inherit",
  fontSize: 15,
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
};

const ROOT: CSSProperties = {
  minHeight: "100dvh",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  gap: 20,
  background: "var(--cream)",
  color: "var(--charcoal)",
  padding:
    "max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) " +
    "max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
};

const BODY: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  textAlign: "center",
};

const LINE: CSSProperties = { margin: 0, fontSize: 16, lineHeight: 1.45, color: "var(--ink-2)", maxWidth: 440 };
/** A screen's first, stronger line ("Couldn't load check-in.", "Check-in has ended."). */
const HEAD_LINE: CSSProperties = { ...LINE, color: "var(--charcoal)", fontWeight: 600 };
const MUTED: CSSProperties = { margin: 0, fontSize: 15, color: "var(--ink-muted)" };

/**
 * Only a refusal the check-in words cover gets its own line (never a raw
 * server string). An own-key check, not `in`: "constructor" or "toString"
 * would match through the prototype and put a function in the JSX.
 */
function refusalLine(code: string | null): string | null {
  if (!code || code === "request_failed") return null;
  if (!Object.prototype.hasOwnProperty.call(CHECKIN_ERRORS, code)) return null;
  return CHECKIN_ERRORS[code as CheckinErrorCode];
}

/**
 * `loadFailed`: the page couldn't read the event (a database hiccup, not a
 * missing event), so it draws "Couldn't load check-in." with a retry instead
 * of a 404 at the moment the line is forming. No feed is read then.
 */
export function DoorView({
  event,
  canManage,
  loadFailed = false,
}: {
  event: DoorEvent;
  canManage: boolean;
  loadFailed?: boolean;
}) {
  const door = useDoorFeed(event.id, canManage && !loadFailed);
  const { feed, serverNowMs } = door;
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  // Before / after by the SERVER's clock (the feed's), never the device's.
  const phase =
    !feed || serverNowMs === 0
      ? null
      : serverNowMs < Date.parse(feed.opens_at)
        ? "before"
        : serverNowMs > Date.parse(feed.closes_at)
          ? "after"
          : "window";
  const open = phase === "window" && feed?.open === true;
  useWakeLock(open);

  // Start and Stop each unmount the button that was pressed, so focus would
  // drop to the page body and a screen-reader or keyboard officer would lose
  // their place. It moves to the button that replaces it (Stop after a start,
  // Start after a stop), or to Done when that button isn't drawn.
  const startRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLAnchorElement>(null);
  /** Set before the request, so it holds whichever render shows the answer. */
  const focusAfterRef = useRef<"start" | "stop" | null>(null);
  useEffect(() => {
    const want = focusAfterRef.current;
    if (want === "stop" && open) {
      focusAfterRef.current = null;
      (stopRef.current ?? doneRef.current)?.focus();
    } else if (want === "start" && !open) {
      focusAfterRef.current = null;
      (startRef.current ?? doneRef.current)?.focus();
    }
  }, [open]);
  // The buttons use aria-disabled, not disabled, while busy: a disabled
  // button drops focus too. A refused action leaves focus where it was.
  const onStart = async () => {
    if (door.busy) return;
    focusAfterRef.current = "stop";
    if (!(await door.start())) focusAfterRef.current = null;
  };
  const onStop = async () => {
    if (door.busy) return;
    focusAfterRef.current = "start";
    if (!(await door.stop())) focusAfterRef.current = null;
  };

  const eventLink = eventAnchorPath(event.id);
  const count = feed?.count ?? 0;
  // What the screen reader hears: the live code, digit by digit. Empty when
  // no code shows, so the first code after Start is a change and is read out.
  const spoken = open && door.step ? `Code ${spokenCode(door.step.code)}` : "";
  const screen = doorScreen({
    loadFailed,
    canManage,
    hasFeed: feed !== null,
    failed: door.failed,
    failCode: door.failCode,
    phase,
    open,
  });
  // One way back to the event per screen (door-screen.ts says why, Oct 19, 2026).
  const exits = doorExits(screen, event.org !== null);

  let body: ReactNode;
  if (screen === "loadFailed") {
    body = (
      <>
        <p style={HEAD_LINE}>{CHECKIN_COPY.doorLoadFailed}</p>
        {/* Re-runs the page's own reads on the server; client state stays. */}
        <button
          type="button"
          className="vibe-press"
          style={doorPill}
          aria-disabled={retrying}
          onClick={() => {
            if (!retrying) startRetry(() => router.refresh());
          }}
        >
          {retrying ? CHECKIN_COPY.loading : CHECKIN_COPY.tryAgain}
        </button>
      </>
    );
  } else if (screen === "notOfficer") {
    body = <p style={LINE}>{CHECKIN_COPY.doorNotOfficer}</p>;
  } else if (screen === "failed") {
    body = (
      <>
        <p style={HEAD_LINE}>{CHECKIN_COPY.doorLoadFailed}</p>
        {refusalLine(door.failCode) ? <p style={LINE}>{refusalLine(door.failCode)}</p> : null}
        <button type="button" className="vibe-press" style={doorPill} onClick={door.reload}>
          {CHECKIN_COPY.tryAgain}
        </button>
      </>
    );
  } else if (screen === "loading" || !feed) {
    body = <p style={MUTED}>{CHECKIN_COPY.doorGettingCode}</p>;
  } else if (screen === "before") {
    // The time first, then why: "an hour before" is said once (Oct 19, 2026).
    const opens = doorOpensLine(Date.parse(feed.opens_at), serverNowMs);
    body = (
      <>
        {opens ? <p style={HEAD_LINE}>{opens}</p> : null}
        <p style={LINE}>{CHECKIN_COPY.doorBefore}</p>
      </>
    );
  } else if (screen === "after") {
    body = (
      <>
        <p style={HEAD_LINE}>{CHECKIN_COPY.doorAfter}</p>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{doorAfterLine(count)}</p>
      </>
    );
  } else if (screen === "open") {
    body = <OpenDoor title={event.title} door={door} stopRef={stopRef} onStop={onStop} />;
  } else {
    body = (
      <>
        <p style={LINE}>{DOOR_START_LEAD}</p>
        <button
          ref={startRef}
          type="button"
          className="vibe-press"
          style={{
            ...doorPill,
            minHeight: 56,
            padding: "0 32px",
            fontSize: 17,
            border: "none",
            background: "var(--coral)",
            color: "var(--on-coral)",
            opacity: door.busy ? 0.75 : 1,
          }}
          aria-disabled={door.busy !== null}
          onClick={() => void onStart()}
        >
          {door.busy === "start" ? CHECKIN_COPY.starting : CHECKIN_COPY.startCheckin}
        </button>
      </>
    );
  }
  // The body's own link: never a second way to the event's card (Done is that).
  const bodyLink =
    exits.bodyLink === "event" ? (
      <Link href={eventLink} className="vibe-press" style={doorPill}>
        {CHECKIN_COPY.goToEvent}
      </Link>
    ) : exits.bodyLink === "whoCame" && event.org ? (
      <Link href={`/orgs/${encodeURIComponent(event.org.handle)}`} className="vibe-press" style={doorPill}>
        {doorWhoCameLabel(count)}
      </Link>
    ) : null;

  return (
    <main className={screen === "open" ? "vibe-door is-open" : "vibe-door"} style={ROOT} data-holds-reload={open ? "" : "false"}>
      <style>{DOOR_CSS}</style>
      {/*
        The code's live region sits here, always mounted, so the first code
        after Start counts as a change and is announced (a live region that
        arrives already holding its words is never read out). role="status"
        is polite and atomic; the visible digits are aria-hidden.
      */}
      <div role="status" aria-live="polite" aria-atomic="true" style={SR_ONLY}>
        {spoken}
      </div>
      <header style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 960, minHeight: 44, margin: "0 auto" }}>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          {/* Two lines before the "…" (Oct 19, 2026): the line at the door reads
              the title to know they're at the right event. */}
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.25,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
            }}
          >
            {/* No title when the event couldn't be read (loadFailed). */}
            {event.title || CHECKIN_COPY.checkIn}
          </h1>
          {event.org ? (
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--ink-2)" }}>{event.org.name}</p>
          ) : null}
        </div>
        {/* The screen's one Done. It only hides the screen: check-in stays open
            for the people still coming (Stop is what closes it). 44 px tall,
            a full touch target (it was 40). */}
        {exits.headerDone ? (
          <Link ref={doneRef} href={eventLink} className="vibe-press" style={{ ...doorPill, flexShrink: 0, padding: "0 18px" }}>
            {CHECKIN_COPY.done}
          </Link>
        ) : null}
      </header>
      <div className="vibe-door-body" style={BODY}>
        {body}
        {bodyLink}
        {/* A read failed but the last good feed is still on screen. The open
            door says it beside its code instead (OpenDoor, Oct 19, 2026). */}
        {canManage && feed && door.failed && screen !== "open" ? (
          <p style={{ ...MUTED, fontSize: 13 }}>{CHECKIN_COPY.doorReconnecting}</p>
        ) : null}
      </div>
    </main>
  );
}

/**
 * Two columns from 760 px (QR left, the rest right); one column below it.
 * The QR tile's side: as big as fits on a phone, and never under 300 px on a
 * wider screen, so it scans from arm's length. The code never drops under
 * 64 px; beside the QR it scales by 11vw so both columns fit at 760 px.
 *
 * A phone held sideways (844 x 390 and the like) is wide but short, so the
 * 300 px floor gives way to 62dvh there and the code shrinks with the height
 * (18dvh): otherwise the tile's bottom sits under the browser's bar.
 *
 * Oct 19, 2026 (B10): every line wraps balanced, so no line ends on one
 * lonely word ("...type the code in / Vibe."); the white QR tile gets a
 * hairline ring, so it has an edge on Light's cream (in Night the ring is
 * a faint light line on the dark page). With no code to show, the tile
 * (`is-empty`) keeps its size as a faint tint of the page with a dashed
 * edge (not white, and not the card colour, which is white in Light).
 *
 * PORTRAIT PHONES (Oct 19, 2026). A flat 46dvh tile pushed Stop under the
 * fold in Safari with its bars showing (390 x 664, 375 x 553), and more so
 * when the title wraps to two lines. Now, under 760 px wide, the open door
 * is exactly one screen tall and the QR takes the height that's left after
 * the header and the code column: its box (`vibe-door-qr-box`) starts at the
 * old size and shrinks when the screen is short, never under 160 px, and the
 * tile is the box's smaller side (container units). On a short screen
 * (under 740 px tall) the column's gaps tighten and the code shrinks with
 * the height, so the QR keeps as much room as it can.
 */
const DOOR_CSS = `
.vibe-door p { text-wrap: balance; }
.vibe-door-open { display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; }
.vibe-door-qr { --vibe-door-qr: min(78vw, 46dvh, 420px); width: var(--vibe-door-qr); height: var(--vibe-door-qr); box-sizing: border-box; padding: 12px; border-radius: 16px; background: #fff; box-shadow: 0 0 0 1px var(--hairline); }
.vibe-door-qr.is-empty { display: flex; align-items: center; justify-content: center; background: rgba(var(--scrim-rgb), 0.05); box-shadow: none; border: 1.5px dashed rgba(var(--scrim-rgb), 0.22); }
.vibe-door-side { display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 0; text-align: center; }
.vibe-door-buttons { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 6px; }
.vibe-door-code { font-size: clamp(64px, 20vw, 128px); }
@media (max-width: 759px) {
  .vibe-door.is-open { height: 100dvh; }
  .vibe-door.is-open .vibe-door-body { min-height: 0; }
  .vibe-door.is-open .vibe-door-open { flex: 0 1 auto; min-height: 0; }
  .vibe-door-qr-box { align-self: stretch; flex: 0 1 min(78vw, 420px); min-height: 160px; container-type: size; display: flex; align-items: center; justify-content: center; }
  .vibe-door-qr { --vibe-door-qr: min(100cqw, 100cqh); }
  .vibe-door-side { flex-shrink: 0; }
}
@media (max-width: 759px) and (max-height: 740px) {
  .vibe-door-open { gap: 12px; }
  .vibe-door-side { gap: 6px; }
  .vibe-door-buttons { margin-top: 2px; }
  .vibe-door-code { font-size: clamp(56px, min(20vw, 11dvh), 128px); }
}
@media (min-width: 760px) {
  .vibe-door-code { font-size: clamp(64px, min(11vw, 18dvh), 128px); }
  .vibe-door-open { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 40px; max-width: 960px; margin: 0 auto; }
  .vibe-door-qr { --vibe-door-qr: clamp(min(300px, 62dvh), 46dvh, 420px); }
  .vibe-door-side { align-items: flex-start; text-align: left; }
  .vibe-door-buttons { justify-content: flex-start; }
}
`;

/** Read out by a screen reader with the live code; hidden on screen. */
const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * The live door: the QR, the code, the countdown, the count and Stop. Its
 * own Done is gone (Oct 19, 2026): the header's Done is the screen's one way
 * out, in the same spot as before Start.
 *
 * NO CODE ON SCREEN (Oct 19, 2026). When reads fail long enough for both of
 * the feed's steps to run out (30 to 60 s of bad signal), there is no code to
 * show. The tile used to stay a bare white square under "Scan with your
 * phone's camera", which looked broken. Now the tile keeps its size (nothing
 * jumps when the code comes back), turns a faint tint of the page and says
 * "Reconnecting…" or "Getting the code…" inside, and the scan line hides
 * until there is something to scan. While codes still show, "Reconnecting…"
 * sits under the countdown, next to the code it is about.
 */
function OpenDoor({
  title,
  door,
  stopRef,
  onStop,
}: {
  title: string;
  door: DoorFeedState;
  /** DoorView moves focus here after a start (the Start button is gone). */
  stopRef: RefObject<HTMLButtonElement | null>;
  onStop: () => Promise<void>;
}) {
  const { step, feed } = door;
  const n = feed?.count ?? 0;
  const countLine = n > 0 ? checkinCountLine(n, false, true) : CHECKIN_COPY.doorNobodyYet;
  return (
    <div className="vibe-door-open">
      <div className="vibe-door-qr-box">
        {step ? (
          <div className="vibe-door-qr">
            {/* Keyed by the step, so each new code rises in (enter only, no exit). */}
            <motion.div
              key={step.starts_at}
              initial={{ opacity: 0, y: RISE_PX }}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING_SOFT}
              style={{ width: "100%", height: "100%" }}
            >
              <QrCode text={step.link} size="100%" label={`QR code to check in at ${title}`} />
            </motion.div>
          </div>
        ) : (
          <div className="vibe-door-qr is-empty">
            <p style={{ ...MUTED, color: "var(--ink-2)" }}>
              {door.failed ? CHECKIN_COPY.doorReconnecting : CHECKIN_COPY.doorGettingCode}
            </p>
          </div>
        )}
      </div>
      <div className="vibe-door-side">
        {/* Screen readers hear the code from DoorView's status line ("Code 4 8 1 2"), not these digits. */}
        {step ? (
          <motion.div
            key={step.starts_at}
            className="vibe-door-code"
            aria-hidden="true"
            initial={{ opacity: 0, y: RISE_PX }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING_SOFT}
            style={{
              fontWeight: 800,
              lineHeight: 1,
              letterSpacing: "0.12em",
              // The spacing also trails the last digit, which pushed the
              // centred code 0.06em left of the QR's middle on a phone.
              marginRight: "-0.12em",
              fontVariantNumeric: "tabular-nums",
              color: "var(--charcoal)",
            }}
          >
            {step.code}
          </motion.div>
        ) : null}
        {step ? <p style={{ margin: 0, fontSize: 15, color: "var(--ink-muted)" }}>{newCodeInLine(door.secondsLeft)}</p> : null}
        {/* The codes on screen stay valid for up to a minute after a failed read. */}
        {step && door.failed ? <p style={{ ...MUTED, fontSize: 13 }}>{CHECKIN_COPY.doorReconnecting}</p> : null}
        <motion.p
          key={n}
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={SPRING_POP}
          style={{ margin: "6px 0 0", fontSize: 20, fontWeight: 700, color: "var(--charcoal)" }}
        >
          {countLine}
        </motion.p>
        {step ? (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: "var(--ink-2)", maxWidth: 360 }}>{CHECKIN_COPY.doorLead}</p>
        ) : null}
        <div className="vibe-door-buttons">
          {/* No confirm: starting again gives a fresh code, so a mis-tap costs nothing. */}
          <button
            ref={stopRef}
            type="button"
            className="vibe-press"
            style={{
              ...doorPill,
              border: "1.5px solid var(--error-ink)",
              color: "var(--error-ink)",
              opacity: door.busy ? 0.75 : 1,
            }}
            aria-disabled={door.busy !== null}
            onClick={() => void onStop()}
          >
            {door.busy === "stop" ? CHECKIN_COPY.stopping : CHECKIN_COPY.stopCheckin}
          </button>
        </div>
      </div>
    </div>
  );
}
