"use client";

/**
 * "Mark as here" on one row of the officers' attendee list (contract 4.2,
 * D8). Pressed, it is a green tick and "Here"; a tap takes the check-in off
 * (allowed any time; it asks first when that can't be put back, see
 * below). Not pressed, the outline pill "Mark as here" (only for
 * someone who said Going or Interested, inside the mark window). Not checked
 * in and not markable draws nothing: a walk-in taken off can't be put back
 * from this list, they check themselves in with the code.
 *
 * The flip is optimistic: `onChange(next)` first, so the modal moves the row
 * between its sections at once, then PUT or DELETE; a refusal flips it back
 * and the request's toast says why (not quiet: the server's sentence).
 *
 * WHY MODULE STATE. Moving the row between sections unmounts this button
 * and mounts a new one in the other list. Three things must survive that,
 * so they live per event + person, outside the component:
 *   - a request still out (a second tap on the new button would race it);
 *   - keyboard focus, when it has to follow the row (see `flip`);
 *   - the tick's one pop when it turns on.
 * The list marks each section with `data-here-list` (campus-home.tsx
 * AttendeeList), which is how a toggle finds its neighbours.
 *
 * Two more guards (review, Oct 19):
 *   - MISFIRES. After a flip the next row slides into the moved one's place,
 *     so the second tap of a double tap would mark (or take off) whoever is
 *     under the finger now. Any tap in the same list within MISFIRE_MS of a
 *     flip is dropped; a held Enter's repeats are dropped too.
 *   - CAN'T PUT IT BACK. When nobody can add the check-in back from this
 *     list (the mark window is over, or a walk-in once the code has
 *     stopped), the list passes `confirmOff` and a tap on "Here" asks first.
 *
 * The spoken name stays "Mark as here: <name>" in both states, so it holds
 * the visible word ("Here" is in it) and `aria-pressed` alone says which.
 *
 * COLOURS. The modal sits on the always-dark Events scene, so these are its
 * own dark values, named below.
 */
import { motion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { CHECKIN_COPY, CHECKIN_ERRORS, type MarkResponse } from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";
import { SPRING_POP } from "@/lib/motion/springs";

/** Requests out, by `event:user`. */
const pending = new Set<string>();
const listeners = new Set<() => void>();
/** The last flip, so the button mounted in the row's new place can take it over. */
let lastFlip: { key: string; on: boolean; focus: boolean } | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setPending(key: string, on: boolean): void {
  if (on) pending.add(key);
  else pending.delete(key);
  for (const l of listeners) l();
}

function flipFor(key: string): typeof lastFlip {
  return lastFlip && lastFlip.key === key ? lastFlip : null;
}

/** A tap this soon after a flip in the same list is a double tap's second half. */
const MISFIRE_MS = 500;
/** When a row last moved in each event's list (a flip, or a refusal flipping it back). */
const movedAt = new Map<string, number>();

function stampMove(eventId: string): void {
  movedAt.set(eventId, Date.now());
}

function justMoved(eventId: string): boolean {
  const at = movedAt.get(eventId);
  return at !== undefined && Date.now() - at < MISFIRE_MS;
}

/**
 * Whether a mark or a removal for this event is still on its way. The list
 * holds its re-reads meanwhile: a read sent now could still reach the
 * database first and put the old row back over the change.
 */
export function hereRequestsOut(eventId: string): boolean {
  const prefix = `${eventId}:`;
  for (const k of pending) if (k.startsWith(prefix)) return true;
  return false;
}

/** Asks before a removal nobody can undo; `go` sends it, `opener` takes focus back. */
export type ConfirmOff = (opener: HTMLButtonElement, go: () => void) => void;

type Props = {
  eventId: string;
  userId: string;
  name: string;
  checkedIn: boolean;
  canMark: boolean;
  onChange: (next: boolean) => void;
  /** Set when taking this check-in off can't be put back from the list. */
  confirmOff?: ConfirmOff;
};

export function HereToggle({ eventId, userId, name, checkedIn, canMark, onChange, confirmOff }: Props) {
  const key = `${eventId}:${userId}`;
  const busy = useSyncExternalStore(subscribe, () => pending.has(key), () => false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  // The tick pops when it turns on here, or when this button was mounted by
  // a flip to "here" (the row just moved), never when a list loads ticked.
  const [mountedOff] = useState(!checkedIn);
  const [poppedByFlip] = useState(() => flipFor(key)?.on === true);

  useEffect(() => {
    const flip = flipFor(key);
    if (flip?.focus) btnRef.current?.focus();
    if (flip) lastFlip = null;
  }, [key]);

  if (!checkedIn && !canMark) return null;

  // Not guarded by MISFIRE_MS: a confirmed removal arrives through here too.
  const flip = async () => {
    if (pending.has(key)) return;
    const next = !checkedIn;
    if (next && !canMark) return;
    // Keyboard focus stays where the officer is working: on the next
    // person's toggle in this section (the row taking the moved one's
    // place), else the one before; only an emptied section sends focus
    // after the moved row. Without this it would drop to <body>.
    const btn = btnRef.current;
    const hadFocus = btn !== null && document.activeElement === btn;
    let neighbor: HTMLElement | null = null;
    if (hadFocus) {
      const list = btn.closest("[data-here-list]");
      const all = list ? Array.from(list.querySelectorAll<HTMLElement>("[data-here-toggle]")) : [];
      const i = all.indexOf(btn);
      neighbor = (i >= 0 ? (all[i + 1] ?? all[i - 1]) : undefined) ?? null;
      neighbor?.focus({ preventScroll: true });
    }
    lastFlip = { key, on: next, focus: hadFocus && neighbor === null };
    // Only for the render this flip causes; a later mount must not take it.
    window.setTimeout(() => {
      if (lastFlip?.key === key) lastFlip = null;
    }, 0);
    setPending(key, true);
    stampMove(eventId);
    onChange(next);
    const url = `/api/events/${encodeURIComponent(eventId)}/checkin/marks/${encodeURIComponent(userId)}`;
    const r = await vibeRequest<MarkResponse>(url, {
      method: next ? "PUT" : "DELETE",
      failure: CHECKIN_ERRORS.request_failed,
    });
    setPending(key, false);
    if (r.ok) return;
    // Back where it was, with focus if the moved button still had it.
    const focusNow = document.activeElement?.getAttribute("data-here-toggle") === key;
    lastFlip = { key, on: !next, focus: focusNow };
    window.setTimeout(() => {
      if (lastFlip?.key === key) lastFlip = null;
    }, 0);
    // The row jumps back, so the misfire window starts again.
    stampMove(eventId);
    onChange(!next);
  };

  const onClick = () => {
    if (pending.has(key) || justMoved(eventId)) return;
    const btn = btnRef.current;
    if (checkedIn && confirmOff && btn) {
      confirmOff(btn, () => void flip());
      return;
    }
    void flip();
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className="vibe-press"
      data-here-toggle={key}
      aria-pressed={checkedIn}
      // One name in both states, holding the visible words; aria-pressed
      // says checked in or not (contract 4.2 wording changed, review Oct 19).
      aria-label={`${CHECKIN_COPY.markHere}: ${name}`}
      aria-haspopup={checkedIn && confirmOff ? "dialog" : undefined}
      // aria-disabled, not disabled: a disabled button drops keyboard focus.
      aria-disabled={busy || undefined}
      onClick={onClick}
      // A held Enter repeats the click, and focus has moved to the next
      // person by then: only the first press counts.
      onKeyDown={(e) => {
        if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault();
      }}
      style={{ ...(checkedIn ? herePill : markPill), opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
    >
      {checkedIn ? (
        <>
          <motion.span
            aria-hidden
            initial={mountedOff || poppedByFlip ? { scale: 0.6 } : false}
            animate={{ scale: 1 }}
            transition={SPRING_POP}
            style={discStyle}
          >
            <TickIcon />
          </motion.span>
          {CHECKIN_COPY.here}
        </>
      ) : (
        CHECKIN_COPY.markHere
      )}
    </button>
  );
}

function TickIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** The list's green, the "Going" / "Checked in" accent (campus-home.tsx AttendeesModal). */
const GREEN = "#5BD18C";

/** The row's "Message" button (campus-home.tsx AttendeeList, :11800 at 6bb6c04), at 32 px. */
const markPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
  minHeight: 32,
  minWidth: 32,
  boxSizing: "border-box",
  padding: "4px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "rgba(255,255,255,0.85)",
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 600,
  fontSize: 11,
  whiteSpace: "nowrap",
  flexShrink: 0,
  WebkitTapHighlightColor: "transparent",
};

const herePill: React.CSSProperties = {
  ...markPill,
  padding: "4px 12px 4px 6px",
  border: "1px solid rgba(91,209,140,0.45)",
  background: "rgba(91,209,140,0.12)",
  color: GREEN,
};

const discStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  flexShrink: 0,
  borderRadius: 999,
  background: GREEN,
  // Dark tick on the green disc (white on #5BD18C is under 2:1).
  color: "#0B2416",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
