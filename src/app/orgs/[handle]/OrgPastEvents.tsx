"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AttendeesModal, type CampusEvent } from "@/app/campus/campus-home";
import { CHECKIN_COPY, CHECKIN_ERRORS, checkinCountLine } from "@/lib/events/event-checkin";
import { vibeRequest } from "@/lib/feedback/request";

import { LinkedFlash, LinkedFocusStyle, useLinkedEvent, useLinkedEventParam } from "./linked-event";

/**
 * Past events on a club page (event check-in, contract 4.6 and D10): the
 * club's events that ended in the last 30 days, newest first, from
 * `GET /api/events?org_id=<id>&when=past`. This is where "N were there"
 * lives after an event (from 5 up; the server sends null below that to
 * anyone but the club's officers), and how officers reach "who came" once
 * the event's card has left the upcoming list.
 *
 * Quiet on purpose: signed out, a failed read or no past events, and the
 * block isn't drawn at all. The upcoming list above already says what a
 * visitor needs; an empty "Past events" would only be noise.
 *
 * `?event=<id>` (Oct 19, 2026, critique D13): a calendar link to an event
 * that has ended lands on its row here, scrolled into view and flashed
 * (linked-event.tsx). A read that failed can't say the event is gone.
 * The read takes the route's full 20 rows and passes the id as `include`
 * (Oct 19, 2026 repair): a club that meets three times a week has more than
 * 10 events in the 30 days My Calendar looks back, and an RSVP from three
 * weeks ago would otherwise be "not listed".
 */
export function OrgPastEvents({ orgId, orgHandle }: { orgId: string; orgHandle: string }) {
  const [events, setEvents] = useState<CampusEvent[] | null>(null);
  // The first read failed (the block stays hidden; the link stays quiet).
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<{ id: string; title: string } | null>(null);
  // The "Who came" that opened the list, to hand focus back on close.
  const openerRef = useRef<HTMLButtonElement | null>(null);
  // Only the newest read lands (the opening one, or the re-read on close).
  const seqRef = useRef(0);
  const linkedParam = useLinkedEventParam();

  // The state is set in the answer's callback, never in the effect's own
  // turn (the opening read runs from an effect).
  const load = useCallback(() => {
    const seq = ++seqRef.current;
    void vibeRequest<{ events?: CampusEvent[] }>(
      `/api/events?org_id=${encodeURIComponent(orgId)}&when=past&limit=20${
        linkedParam ? `&include=${encodeURIComponent(linkedParam)}` : ""
      }`,
      { cache: "no-store", quiet: true, failure: CHECKIN_ERRORS.request_failed },
    ).then((r) => {
      if (seq !== seqRef.current) return;
      // A failed re-read keeps what is on screen.
      if (r.ok && Array.isArray(r.data.events)) setEvents(r.data.events);
      else setFailed(true);
    });
  }, [orgId, linkedParam]);

  useEffect(() => {
    load();
    return () => {
      // Leaving the page: an answer still out is dropped.
      seqRef.current += 1;
    };
  }, [load]);

  const linkedId = useLinkedEvent("past", events ? events.map((e) => e.id) : failed ? "unknown" : null);

  if (!events || events.length === 0) return null;

  const headingId = `org-${orgHandle}-past-events`;
  return (
    <section aria-labelledby={headingId} style={sectionStyle}>
      <h2 id={headingId} style={headingStyle}>
        {CHECKIN_COPY.pastHeading}
      </h2>
      {linkedId ? <LinkedFocusStyle /> : null}
      <ul style={listStyle}>
        {events.map((ev) => {
          const countLine = checkinCountLine(ev.checked_in_count, true, ev.viewer_can_manage);
          return (
            <li
              key={ev.id}
              // The anchor `?event=` scrolls to (EVENT_ANCHOR_ATTR).
              data-event-anchor={ev.id}
              tabIndex={ev.id === linkedId ? -1 : undefined}
              // No `outline: none` (Oct 19, 2026 repair): LinkedFocusStyle
              // keeps the focus mark after the flash fades.
              style={{ ...rowStyle, position: "relative" }}
            >
              {/* Wider than the row: its text starts at the row's own edge. */}
              {ev.id === linkedId ? <LinkedFlash radius={10} inset="-2px -10px" /> : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={titleStyle}>{ev.title}</div>
                <div style={dateStyle}>{pastEventDate(ev.starts_at)}</div>
                {countLine ? <div style={countStyle}>{countLine}</div> : null}
              </div>
              {ev.viewer_can_manage ? (
                <button
                  type="button"
                  className="vibe-press"
                  aria-haspopup="dialog"
                  // Visible words first, so the spoken name still contains them.
                  aria-label={`${CHECKIN_COPY.whoCame}: ${ev.title}`}
                  onClick={(e) => {
                    openerRef.current = e.currentTarget;
                    setOpen({ id: ev.id, title: ev.title });
                  }}
                  style={pillStyle}
                >
                  {CHECKIN_COPY.whoCame}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {open ? (
        <AttendeesModal
          eventId={open.id}
          eventTitle={open.title}
          onClose={() => {
            setOpen(null);
            openerRef.current?.focus();
            // A mark, a removal or a clear may have changed "N were there".
            load();
          }}
        />
      ) : null}
    </section>
  );
}

/** "Fri, Oct 17", in the viewer's time, like the event cards' dates. */
function pastEventDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

// ── Styles: the club page's dark values (OrgEventsSection.tsx:99-130) ───────

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
  padding: "clamp(12px, 3.6vw, 16px)",
  borderRadius: 16,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14)",
};

/** The "Upcoming events" label's look, as a real heading. */
const headingStyle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.55)",
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 0",
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 600,
  color: "#fff",
  overflowWrap: "anywhere",
};

const dateStyle: React.CSSProperties = {
  marginTop: 2,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  color: "rgba(255,255,255,0.6)",
};

const countStyle: React.CSSProperties = {
  marginTop: 2,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 12,
  fontWeight: 600,
  color: "rgba(255,255,255,0.85)",
};

/** The event card's "Manage attendees" pill (campus-home.tsx ManageAttendeesAction), at 32 px. */
const pillStyle: React.CSSProperties = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  minHeight: 32,
  boxSizing: "border-box",
  padding: "5px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,180,150,0.38)",
  background: "rgba(255,140,90,0.10)",
  color: "#FFB89C",
  fontFamily: "DM Sans, sans-serif",
  fontWeight: 600,
  fontSize: 11.5,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};
