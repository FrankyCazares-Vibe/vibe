"use client";

/**
 * "Start check-in" / "Show check-in" in an event card's action row, for the
 * event's officers (contract 4.1, D7). Gated on `viewer_can_manage` alone,
 * so an org-less event's creator gets it too (can_manage_event lets them
 * in), and drawn only inside the check-in window: an hour before the start
 * to an hour after the end, the only time the door route would say yes.
 *
 * Starting goes to the door screen as its own page (doorPagePath), not an
 * overlay: it survives the events list dropping the card at the end time,
 * and opens on a second device. When the list already says check-in is
 * open, the pill is a plain link there.
 *
 * COLOURS. The card sits on the always-dark Events scene, so the pill copies
 * the card's own dark values (named below) instead of theme tokens.
 */
import { useEffect, useRef, useState } from "react";

import { useCampusNow } from "@/components/campus/tonight/use-campus-now";
import {
  CHECKIN_COPY,
  checkinPhase,
  doorPagePath,
  type CheckinCardEvent,
  type DoorResponse,
} from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";

export function StartCheckinAction({ ev }: { ev: CheckinCardEvent }) {
  // 0 until hydrated: the phase is null then, and nothing is drawn.
  const now = useCampusNow(60_000);
  const [busy, setBusy] = useState(false);
  // Synchronous twin of `busy`, so a double tap can't send two starts.
  const busyRef = useRef(false);

  // Back from the door with the browser's Back button: a page restored from
  // the back-forward cache would still say "Starting…" with nothing out.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      busyRef.current = false;
      setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  if (!ev.viewer_can_manage || checkinPhase(ev.starts_at, ev.ends_at, now) !== "open") return null;

  if (ev.checkin_open) {
    return (
      <a href={doorPagePath(ev.id)} className="vibe-press" style={pillStyle}>
        {CHECKIN_COPY.showCheckin}
      </a>
    );
  }

  const start = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    // Not quiet: an officer's refusal is said in the server's own sentence
    // ("Check-in works from an hour before…", "Only the club's owner…").
    // Already open (another officer, or a stale list) answers ok too.
    const r = await vibeRequest<DoorResponse>(
      `/api/events/${encodeURIComponent(ev.id)}/checkin/door`,
      { method: "POST", failure: "Couldn't start check-in." },
    );
    if (r.ok) {
      // Stays "Starting…" while the door page loads.
      window.location.assign(doorPagePath(ev.id));
      return;
    }
    busyRef.current = false;
    setBusy(false);
  };

  return (
    <button
      type="button"
      className="vibe-press"
      // aria-disabled, not disabled: a disabled button drops keyboard focus.
      aria-disabled={busy || undefined}
      onClick={() => void start()}
      style={{ ...pillStyle, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
    >
      {busy ? CHECKIN_COPY.starting : CHECKIN_COPY.startCheckin}
    </button>
  );
}

/**
 * campus-home.tsx's `eventCardSubtleLink` (:11021 at 6bb6c04) with the
 * "Manage attendees" coral tint (ManageAttendeesAction, :11101), raised to
 * the 32 px hit area every new control gets (contract 4.0).
 */
const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  minHeight: 32,
  boxSizing: "border-box",
  padding: "5px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,180,150,0.38)",
  background: "rgba(255,140,90,0.10)",
  color: "#FFB89C",
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 600,
  fontSize: 11,
  textDecoration: "none",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};
