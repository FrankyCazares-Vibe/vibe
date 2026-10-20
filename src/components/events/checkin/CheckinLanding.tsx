"use client";

/**
 * The page the door's QR opens (contract 4.4): /campus/checkin/<id>, with
 * the QR's token in `?checkin=` when it came from the camera. One centred
 * column on every screen, theme tokens only, so Night mode follows.
 *
 * On mount the token leaves the address bar (history.replaceState), so a
 * screenshot or a shared link of this page carries nothing. The token stays
 * in memory for the one "I'm here" tap; a dead one falls back to the code box.
 *
 * It never shows who else is there: at most the count, from 5 up.
 *
 * TIME. The header's time is campus time (campus-time.ts), the same on the
 * server and in the browser, so it can render before hydration. Everything
 * that depends on "now" waits for useCampusNow, which answers 0 until then.
 */
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { campusDateTime } from "@/components/campus/tonight/campus-time";
import { useCampusNow } from "@/components/campus/tonight/use-campus-now";
import {
  CHECKIN_COPY,
  CHECKIN_ERRORS,
  CHECKIN_OPENS_BEFORE_MS,
  checkinCountLine,
  checkinPagePath,
  checkinPhase,
  eventAnchorPath,
  opensAtLine,
  type CheckinDeleteResponse,
  type CheckinViewerState,
} from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";
import { SPRING_POP, SPRING_SOFT, RISE_PX } from "@/lib/motion/springs";

import { CheckinCodeForm } from "./CheckinCodeForm";
import { checkinOpensWhen } from "./door-screen";
import { checkinApiPath, parseViewerState, useCheckinState } from "./use-checkin-state";

export type CheckinLandingEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string;
  org: { name: string; handle: string } | null;
};

type Props = {
  event: CheckinLandingEvent | null;
  initial: CheckinViewerState | null;
  token: string | null;
};

/** "Try again" waits this long between reads, so a held thumb can't spin the route. */
const TRY_AGAIN_COOLDOWN_MS = 3_000;

export function CheckinLanding({ event, initial, token }: Props) {
  return (
    <main style={pageStyle}>
      <div style={columnStyle}>
        <div style={eyebrowStyle}>{CHECKIN_COPY.sheetTitle}</div>
        {event ? (
          <LandingBody event={event} initial={initial} token={token} />
        ) : (
          <>
            <p style={{ ...lineStyle, marginTop: 12 }}>{CHECKIN_COPY.eventGone}</p>
            <a href="/campus" className="vibe-press" style={primaryLinkStyle}>
              {CHECKIN_COPY.goToCampus}
            </a>
          </>
        )}
      </div>
    </main>
  );
}

/** "Wed, Nov 11 · 6:30 PM" in campus time; "" for a time that doesn't parse. */
function whenLine(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? campusDateTime(ms) : "";
}

function LandingBody({ event, initial, token }: { event: CheckinLandingEvent; initial: CheckinViewerState | null; token: string | null }) {
  const now = useCampusNow(15_000);
  const phase = checkinPhase(event.starts_at, event.ends_at, now);
  const { state, set, refresh } = useCheckinState({
    id: event.id,
    title: event.title,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    checkin_open: initial?.open,
    checked_in_count: initial?.count,
    viewer_checked_in: initial?.checked_in,
  }, { serverFresh: initial !== null });
  // The QR's token is good for one tap: after a check-in (or a removal) the
  // form starts from the code box.
  const [liveToken, setLiveToken] = useState<string | null>(token);
  const [justCheckedIn, setJustCheckedIn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [cooling, setCooling] = useState(false);
  const confirmTextId = useId();
  const coolRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // "Remove my check-in" and the Remove / Keep pair replace each other, so
  // focus would drop to <body>: it moves to Keep when the question opens,
  // and back to "Remove my check-in" on Keep.
  const keepRef = useRef<HTMLButtonElement | null>(null);
  const removeRef = useRef<HTMLButtonElement | null>(null);
  const focusNextRef = useRef<"keep" | "remove" | null>(null);

  useEffect(() => {
    const want = focusNextRef.current;
    if (!want) return;
    focusNextRef.current = null;
    (want === "keep" ? keepRef : removeRef).current?.focus({ preventScroll: true });
  });

  // The token leaves the address bar as soon as the page is up.
  useEffect(() => {
    if (!token) return;
    try {
      window.history.replaceState(null, "", checkinPagePath(event.id));
    } catch {
      // An old browser without the History API keeps the address; the token
      // in it dies within two minutes anyway.
    }
  }, [token, event.id]);

  useEffect(() => () => {
    if (coolRef.current) clearTimeout(coolRef.current);
  }, []);

  const tryAgain = async () => {
    if (cooling) return;
    setCooling(true);
    coolRef.current = setTimeout(() => {
      coolRef.current = null;
      setCooling(false);
    }, TRY_AGAIN_COOLDOWN_MS);
    await refresh();
  };

  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    const r = await vibeRequest<CheckinDeleteResponse>(checkinApiPath(event.id), {
      method: "DELETE",
      failure: CHECKIN_ERRORS.request_failed,
    });
    setRemoving(false);
    if (!r.ok) return;
    setConfirming(false);
    setJustCheckedIn(false);
    setLiveToken(null);
    const next = parseViewerState(r.data?.state, event.id);
    set({ ...(next ?? state), checked_in: false });
  };

  const club = event.org?.name ?? null;
  const when = whenLine(event.starts_at);
  const sub = [club, when].filter(Boolean).join(" · ");
  const ready = phase !== null;
  const goToEvent = (
    <a href={eventAnchorPath(event.id)} className="vibe-press" style={primaryLinkStyle}>
      {CHECKIN_COPY.goToEvent}
    </a>
  );

  // One view at a time, in the contract's order: checked in wins, then the
  // window, then whether an officer has started check-in.
  const view = !ready
    ? null
    : state.checked_in
      ? "in"
      : phase === "before"
        ? "before"
        : phase === "after"
          ? "after"
          : state.open
            ? "form"
            : "not_open";
  const countLine = checkinCountLine(state.count, phase === "after", false);
  // Campus time with the day when it isn't today, the door's own words
  // (Oct 19, 2026): a link opened the night before used to name no day.
  const opensWhen = now > 0 ? checkinOpensWhen(Date.parse(event.starts_at) - CHECKIN_OPENS_BEFORE_MS, now) : null;

  return (
    <>
      <h1 style={titleStyle}>{event.title}</h1>
      {sub ? <p style={subStyle}>{sub}</p> : null}
      <div style={{ marginTop: 28 }}>
        {view === "in" ? (
          <motion.div
            aria-hidden
            initial={justCheckedIn ? { scale: 0.6, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING_POP}
            style={bigDiscStyle}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </motion.div>
        ) : null}
        {/* Always mounted, so the change to "You're checked in" is announced. */}
        <p role="status" style={view === "in" ? successLineStyle : emptyStatusStyle}>
          {view === "in" ? CHECKIN_COPY.checkedIn : ""}
        </p>
        {view ? (
          <motion.div key={view} initial={{ opacity: 0, y: RISE_PX }} animate={{ opacity: 1, y: 0 }} transition={SPRING_SOFT}>
            {view === "in" ? (
              <div style={{ textAlign: "center" }}>
                {countLine ? <p style={{ ...lineStyle, marginTop: 4 }}>{countLine}</p> : null}
                {goToEvent}
                {confirming ? (
                  <div style={confirmBoxStyle} role="group" aria-labelledby={confirmTextId}>
                    <p id={confirmTextId} style={{ ...lineStyle, margin: 0 }}>
                      {CHECKIN_COPY.removeConfirm}
                    </p>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 10 }}>
                      <button type="button" className="vibe-press" disabled={removing} onClick={() => void remove()} style={{ ...outlineButtonStyle, color: "var(--error-ink)", opacity: removing ? 0.6 : 1 }}>
                        {CHECKIN_COPY.removeYes}
                      </button>
                      <button
                        ref={keepRef}
                        type="button"
                        className="vibe-press"
                        disabled={removing}
                        onClick={() => {
                          setConfirming(false);
                          focusNextRef.current = "remove";
                        }}
                        style={outlineButtonStyle}
                      >
                        {CHECKIN_COPY.removeKeep}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    ref={removeRef}
                    type="button"
                    className="vibe-press"
                    disabled={removing}
                    onClick={() => {
                      // The card's rule: no question while they could check in again.
                      if (state.open && phase === "open") void remove();
                      else {
                        setConfirming(true);
                        focusNextRef.current = "keep";
                      }
                    }}
                    style={{ ...textButtonStyle, marginTop: 10, opacity: removing ? 0.6 : 1 }}
                  >
                    {CHECKIN_COPY.remove}
                  </button>
                )}
              </div>
            ) : view === "before" ? (
              <>
                <p style={lineStyle}>{opensWhen ? opensAtLine(opensWhen) : CHECKIN_ERRORS.checkin_outside_window}</p>
                {goToEvent}
              </>
            ) : view === "after" ? (
              <>
                <p style={lineStyle}>{CHECKIN_COPY.landingClosed}</p>
                {goToEvent}
              </>
            ) : view === "not_open" ? (
              <>
                <p style={lineStyle}>{CHECKIN_COPY.landingNotOpen}</p>
                <button type="button" className="vibe-press" disabled={cooling} onClick={() => void tryAgain()} style={{ ...primaryButtonStyle, opacity: cooling ? 0.6 : 1 }}>
                  {CHECKIN_COPY.tryAgain}
                </button>
                <div style={{ textAlign: "center", marginTop: 10 }}>
                  <a href={eventAnchorPath(event.id)} style={textLinkStyle}>
                    {CHECKIN_COPY.goToEvent}
                  </a>
                </div>
              </>
            ) : (
              <>
                {liveToken ? null : <p style={lineStyle}>{CHECKIN_COPY.sheetLead}</p>}
                <CheckinCodeForm
                  eventId={event.id}
                  eventTitle={event.title}
                  token={liveToken}
                  autoFocus={!liveToken}
                  onCheckedIn={(next) => {
                    setJustCheckedIn(true);
                    setLiveToken(null);
                    set({ ...next, checked_in: true });
                  }}
                />
              </>
            )}
          </motion.div>
        ) : null}
      </div>
    </>
  );
}

// ── Styles (theme tokens only, so Night mode follows) ────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "var(--cream)",
  color: "var(--charcoal)",
};

const columnStyle: React.CSSProperties = {
  maxWidth: 420,
  margin: "0 auto",
  boxSizing: "border-box",
  padding: "max(32px, env(safe-area-inset-top)) 16px max(32px, env(safe-area-inset-bottom))",
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--tag-ink)",
};

const titleStyle: React.CSSProperties = {
  margin: "8px 0 0",
  fontFamily: "Fraunces, serif",
  fontSize: 26,
  fontWeight: 800,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
  color: "var(--charcoal)",
  overflowWrap: "anywhere",
};

const subStyle: React.CSSProperties = {
  margin: "6px 0 0",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  lineHeight: 1.45,
  color: "var(--ink-2)",
};

const lineStyle: React.CSSProperties = {
  margin: "0 0 16px",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 15,
  lineHeight: 1.5,
  color: "var(--ink-2)",
};

const bigDiscStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  margin: "0 auto 14px",
  borderRadius: 999,
  background: "var(--coral)",
  color: "var(--on-coral)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const successLineStyle: React.CSSProperties = {
  margin: "0 0 8px",
  textAlign: "center",
  fontFamily: "Fraunces, serif",
  fontSize: 22,
  fontWeight: 800,
  color: "var(--charcoal)",
};

/** The status line while it has nothing to say: there, but taking no room. */
const emptyStatusStyle: React.CSSProperties = { margin: 0 };

const primaryBase: React.CSSProperties = {
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
  fontFamily: "DM Sans, sans-serif",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const primaryLinkStyle: React.CSSProperties = { ...primaryBase, textDecoration: "none" };
const primaryButtonStyle: React.CSSProperties = primaryBase;

const textButtonStyle: React.CSSProperties = {
  minHeight: 32,
  padding: "6px 12px",
  borderRadius: 999,
  border: "none",
  background: "transparent",
  color: "var(--ink-2)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  fontWeight: 600,
  textDecoration: "underline",
  cursor: "pointer",
};

const textLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 32,
  color: "var(--tag-ink)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13.5,
  fontWeight: 700,
  textDecoration: "none",
};

const outlineButtonStyle: React.CSSProperties = {
  minHeight: 40,
  padding: "0 18px",
  borderRadius: 999,
  border: "1px solid rgba(var(--scrim-rgb),0.18)",
  background: "transparent",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const confirmBoxStyle: React.CSSProperties = {
  marginTop: 14,
  padding: "14px 12px",
  borderRadius: 14,
  border: "1px solid var(--hairline)",
  background: "rgba(var(--scrim-rgb),0.03)",
};
