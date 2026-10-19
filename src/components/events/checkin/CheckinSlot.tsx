"use client";

/**
 * The student's check-in block on an event card (contract 4.1), in its own
 * slot right under the RSVP row: never in the card's action row, which
 * hides from a creator who neither RSVP'd nor manages the event.
 *
 * It draws nothing before hydration and nothing outside the check-in window
 * (an hour before the start to an hour after the end). Inside it:
 *   - "N checked in", from 5 up (an officer sees any number);
 *   - checked in: a coral tick, "You're checked in" and "Remove my
 *     check-in" (straight away while check-in is open; once it has closed,
 *     an inline confirm first, since they couldn't check in again);
 *   - open and not checked in: a coral "Check in" pill that opens the code
 *     sheet;
 *   - not open: nothing (most clubs never start check-in).
 *
 * Not gated on an RSVP or the home campus: anyone who may see the event can
 * check in at the door (D9); the route decides.
 *
 * COLOURS. The card sits on the always-dark Events scene, so these are the
 * card's own dark values, copied as local constants with their source lines
 * named (the sheet it opens uses theme tokens).
 */
import { motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

import { visuallyHiddenStyle } from "@/components/mobile/messages/sheet-styles";
import {
  CHECKIN_COPY,
  CHECKIN_ERRORS,
  checkinCountLine,
  type CheckinCardEvent,
  type CheckinDeleteResponse,
} from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";
import { SPRING_POP } from "@/lib/motion/springs";

import { CheckinSheet } from "./CheckinSheet";
import { checkinApiPath, parseViewerState, useCheckinState } from "./use-checkin-state";

/** Where keyboard focus goes after the next render (the control it was on has gone). */
type FocusTarget = "status" | "keep" | "remove" | "checkin";

/** Focus has nowhere to be: on <body>, or on a node that has left the page. */
function focusIsLost(): boolean {
  const el = document.activeElement;
  return !el || el === document.body || !el.isConnected;
}

export function CheckinSlot({ ev }: { ev: CheckinCardEvent }) {
  const { state, phase, set } = useCheckinState(ev);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  // The tick pops only when it turns on here, not on every list load.
  const [justCheckedIn, setJustCheckedIn] = useState(false);

  // Each of these controls replaces another on a tap ("Check in" becomes
  // the tick, "Remove" becomes Remove / Keep), so focus would drop to
  // <body>. The effect below puts it on the right one once it is drawn.
  const statusRef = useRef<HTMLSpanElement | null>(null);
  const keepRef = useRef<HTMLButtonElement | null>(null);
  const removeRef = useRef<HTMLButtonElement | null>(null);
  const checkInRef = useRef<HTMLButtonElement | null>(null);
  const focusNextRef = useRef<{ target: FocusTarget; onlyIfLost: boolean } | null>(null);
  const confirmTextId = useId();

  useEffect(() => {
    const want = focusNextRef.current;
    if (!want) return;
    focusNextRef.current = null;
    // After a check-in that landed with the sheet already shut, focus may
    // be somewhere the student chose since: leave it there.
    if (want.onlyIfLost && !focusIsLost()) return;
    const el = { status: statusRef, keep: keepRef, remove: removeRef, checkin: checkInRef }[want.target].current;
    el?.focus({ preventScroll: true });
  });

  // `phase` is null until hydrated (useCampusNow answers 0 first).
  if (phase !== "open") return null;
  const countLine = checkinCountLine(state.count, false, !!ev.viewer_can_manage);
  if (!countLine && !state.checked_in && !state.open && !sheetOpen) return null;

  const remove = async () => {
    if (removing) return;
    setRemoving(true);
    // Not quiet: the toast is the only word a failed removal gets here.
    const r = await vibeRequest<CheckinDeleteResponse>(checkinApiPath(ev.id), {
      method: "DELETE",
      failure: CHECKIN_ERRORS.request_failed,
    });
    setRemoving(false);
    if (!r.ok) return;
    setConfirming(false);
    setJustCheckedIn(false);
    // `state` is null when the event can't be seen any more: then only the
    // tick goes.
    const next = parseViewerState(r.data?.state, ev.id);
    set({ ...(next ?? state), checked_in: false });
    // Back to "Check in" while check-in is open; with nothing left to
    // press, focus stays where the browser puts it.
    focusNextRef.current = { target: "checkin", onlyIfLost: true };
  };

  // The row keeps one shape in both states, so the status line below stays
  // the same element when "Check in" turns into the tick and its change is
  // read out (the landing page's always-mounted status does the same).
  const showRow = state.checked_in || state.open;
  return (
    <div>
      {countLine ? <div style={countStyle}>{countLine}</div> : null}
      {showRow ? (
        <div style={rowStyle}>
          {state.checked_in ? (
            <motion.span
              aria-hidden
              initial={justCheckedIn ? { scale: 0.6 } : false}
              animate={{ scale: 1 }}
              transition={SPRING_POP}
              style={discStyle}
            >
              <TickIcon />
            </motion.span>
          ) : null}
          {/* Focusable from code only (tabIndex -1): where focus lands after
              a check-in, since the pill it came from has gone. */}
          <span
            ref={statusRef}
            role="status"
            tabIndex={-1}
            style={state.checked_in ? checkedInTextStyle : visuallyHiddenStyle}
          >
            {state.checked_in ? CHECKIN_COPY.checkedIn : ""}
          </span>
          {state.checked_in ? (
            confirming ? null : (
              <button
                key="remove"
                ref={removeRef}
                type="button"
                className="vibe-press"
                disabled={removing}
                onClick={() => {
                  // While check-in is open they can check in again, so no
                  // question; once it has closed, ask first.
                  if (state.open) void remove();
                  else {
                    setConfirming(true);
                    focusNextRef.current = { target: "keep", onlyIfLost: false };
                  }
                }}
                style={{ ...subtlePillStyle, opacity: removing ? 0.6 : 1 }}
              >
                {CHECKIN_COPY.remove}
              </button>
            )
          ) : (
            <button
              key="checkin"
              ref={checkInRef}
              type="button"
              className="vibe-press"
              onClick={() => setSheetOpen(true)}
              style={checkInPillStyle}
            >
              {CHECKIN_COPY.checkIn}
            </button>
          )}
          {state.checked_in && confirming ? (
            <div style={confirmStyle} role="group" aria-labelledby={confirmTextId}>
              <span id={confirmTextId} style={confirmTextStyle}>
                {CHECKIN_COPY.removeConfirm}
              </span>
              <span style={{ display: "inline-flex", gap: 6 }}>
                <button
                  type="button"
                  className="vibe-press"
                  disabled={removing}
                  onClick={() => void remove()}
                  style={{ ...dangerPillStyle, opacity: removing ? 0.6 : 1 }}
                >
                  {CHECKIN_COPY.removeYes}
                </button>
                <button
                  ref={keepRef}
                  type="button"
                  className="vibe-press"
                  disabled={removing}
                  onClick={() => {
                    setConfirming(false);
                    focusNextRef.current = { target: "remove", onlyIfLost: false };
                  }}
                  style={subtlePillStyle}
                >
                  {CHECKIN_COPY.removeKeep}
                </button>
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      {sheetOpen ? (
        <CheckinSheet
          eventId={ev.id}
          eventTitle={ev.title}
          onClose={() => setSheetOpen(false)}
          onCheckedIn={(next) => {
            setJustCheckedIn(true);
            set({ ...next, checked_in: true });
            // The "Check in" pill the sheet would hand focus back to has
            // become the tick: focus goes to "You're checked in" instead
            // (not to "Remove", where a stray Enter would undo it).
            focusNextRef.current = { target: "status", onlyIfLost: true };
          }}
        />
      ) : null}
    </div>
  );
}

function TickIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// ── Styles: the card's dark values (the Events scene never turns light) ─────

/** The card's coral (COLORS.accent, campus-home.tsx:315). */
const CORAL = "#FF5C35";

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 8,
};

/** Contract 4.1: DM Sans 12 at 60% white, like EVENT_CHAT_LINE's muted line. */
const countStyle: React.CSSProperties = {
  marginTop: 8,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  lineHeight: 1.4,
  color: "rgba(255,255,255,0.6)",
};

const discStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  flexShrink: 0,
  borderRadius: 999,
  background: CORAL,
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const checkedInTextStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  color: "#fff",
};

/** eventCardSubtleLink (campus-home.tsx:11021), raised to a 32 px hit area. */
const subtlePillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  minHeight: 32,
  boxSizing: "border-box",
  padding: "5px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.85)",
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 600,
  fontSize: 11.5,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

/** eventCardDangerLink (campus-home.tsx:11185), the same 32 px floor. */
const dangerPillStyle: React.CSSProperties = {
  ...subtlePillStyle,
  border: "1px solid rgba(255,138,122,0.38)",
  color: "#FFB1A8",
  background: "rgba(196,43,28,0.14)",
};

/** "+ Create event" (OrgEventsSection.tsx:136-150): coral fill, dark words (4.8:1). */
const checkInPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 32,
  boxSizing: "border-box",
  padding: "6px 16px",
  borderRadius: 999,
  border: "none",
  background: "linear-gradient(135deg,#FF7A4D 0%,#FF5C35 60%,#E04A26 100%)",
  color: "var(--on-coral, #160A06)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12.5,
  fontWeight: 800,
  letterSpacing: "0.02em",
  cursor: "pointer",
  boxShadow: "0 6px 16px rgba(255,92,53,0.36)",
  WebkitTapHighlightColor: "transparent",
};

const confirmStyle: React.CSSProperties = {
  flexBasis: "100%",
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const confirmTextStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  lineHeight: 1.4,
  color: "rgba(255,255,255,0.75)",
};
