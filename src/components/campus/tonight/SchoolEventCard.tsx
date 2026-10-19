"use client";

/**
 * A school event in the Events tab's "Coming up" grid (Oct 19 2026, board
 * D2_Events). It wears the club EventCard's frame so the grid reads as one
 * list, but carries none of its controls: no Going, no Interested, no Report.
 * Going on a school event would need a new RSVP table and a same-day Privacy
 * Policy change (CONTRACT §7.1), and a school calendar's event is reported to
 * the school, not to Vibe. It has no `id="event-…"` either: only club cards
 * are scroll targets (the strip and Tonight's club rows flash those).
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §6.3.
 */
import { useId, type CSSProperties } from "react";

import { campusClock, campusDateTime } from "./campus-time";
import { IconPin, LeadLinks, MatchupTitle, OutLink, SchoolTag, schoolHref } from "./TonightBits";
import { TONIGHT_COPY } from "./tonight-view";
import type { SchoolEventCardProps } from "./types";

import "./tonight.css";
import "./tonight-events.css";

/**
 * An exact twin of DARK_GLASS_SURFACE in src/app/campus/campus-home.tsx
 * (6804-6816). Copied, not imported: a new file never takes runtime values
 * from campus-home (no import cycle, CONTRACT §0.8). Change both together.
 * These cards are dark glass in both looks, like EventCard, so their text is
 * white and the hex values here are the card's own.
 */
const SCHOOL_CARD_SURFACE: CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(20,16,28,0.78) 0%, rgba(14,11,22,0.82) 100%)",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  border: "1px solid rgba(255,255,255,0.10)",
  boxShadow: [
    "inset 0 1px 0 rgba(255,255,255,0.10)",
    "inset 0 -1px 0 rgba(0,0,0,0.32)",
    "0 12px 32px rgba(20,8,40,0.22)",
  ].join(", "),
  color: "#fff",
};

const CARD_STYLE: CSSProperties = {
  ...SCHOOL_CARD_SURFACE,
  borderRadius: 18,
  // A club card's left edge is its club colour; a school event never takes
  // one, so it gets a quiet white edge instead (never mistaken for a club).
  borderLeft: "3px solid rgba(255,255,255,0.28)",
  padding: 20,
  fontFamily: "DM Sans, sans-serif",
};

/** The board's 14-grid calendar glyph (TonightBits has clock and pin only). */
function IconCalendar() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1" y="2" width="12" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1 6h12M4 1v2M10 1v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** "Wed, Nov 11 · 6:30 PM", plus " – 8:00 PM" for an event. A game's end is
 *  the feed's guess (start + 2 h when it gives none), so it is never shown. */
function whenLine(ev: SchoolEventCardProps["ev"]): string {
  const start = Date.parse(ev.starts_at);
  if (!Number.isFinite(start)) return "";
  const end = Date.parse(ev.ends_at);
  const head = campusDateTime(start);
  if (ev.kind === "game" || !Number.isFinite(end) || end <= start) return head;
  return `${head} – ${campusClock(end)}`;
}

/** Games only: "Men's basketball, home game." plus the promo ("Senior Day"). */
function gameNote(ev: SchoolEventCardProps["ev"]): string | null {
  if (ev.kind !== "game") return null;
  const base = ev.sport ? `${ev.sport}, home game.` : "Home game.";
  return ev.promo ? `${base} ${ev.promo}` : base;
}

export function SchoolEventCard({ ev, source }: SchoolEventCardProps) {
  const titleId = useId();
  const when = whenLine(ev);
  const note = gameNote(ev);
  // The event's own page when the feed names one, else the calendar itself:
  // both are https on the school's own host (checked on the server, and
  // again here by the one shared check, so a bad page falls back to the calendar).
  const calendarHref = schoolHref(ev, source ? [source] : []);

  return (
    <article aria-labelledby={titleId} className="tonight-school-card" style={CARD_STYLE}>
      <h4 id={titleId} className="tonight-sc-title">
        <MatchupTitle ev={ev} />
      </h4>
      <div className="tonight-sc-tagrow">
        <SchoolTag tone="glass" size="hero" />
        {source ? <span className="tonight-sc-credit">{source.credit}</span> : null}
      </div>
      <div className="tonight-sc-facts">
        {when ? (
          <span>
            <IconCalendar />
            {when}
          </span>
        ) : null}
        {ev.location ? (
          <span>
            <IconPin size={13} />
            {ev.location}
          </span>
        ) : null}
      </div>
      {note ? <p className="tonight-sc-note">{note}</p> : null}
      {/* Empty (no page, no tickets, no stream) collapses in CSS (:empty). */}
      <div className="tonight-sc-foot">
        {calendarHref ? (
          <OutLink href={calendarHref} label={`See ${ev.title} on the calendar`}>
            {TONIGHT_COPY.seeCalendar}
          </OutLink>
        ) : null}
        <LeadLinks ev={ev} />
      </div>
    </article>
  );
}
