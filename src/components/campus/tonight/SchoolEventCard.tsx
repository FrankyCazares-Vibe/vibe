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

import { MouseSpotlight } from "@/components/ui/mouse-spotlight";
import { IU_CRIMSON } from "@/lib/iu/school-colors";

import { campusClock, campusDateTime } from "./campus-time";
import { QuietBoundary } from "./QuietBoundary";
import { IconCalendar, IconPin, LeadLinks, MatchupTitle, OutLink, SchoolTag, schoolHref } from "./TonightBits";
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

/** IU crimson: every calendar Vibe reads today is IU's (Indianapolis and Bloomington). */
const IU_ACCENT = { edge: IU_CRIMSON, glow: "rgba(153, 0, 0, 0.55)" } as const;

/**
 * A school event wears its school's colour where a club card wears the
 * club's: the left edge and the spotlight that follows the pointer (Franky,
 * Oct 19 2026: "school events hover in school colours"). Every calendar so
 * far is IU's, so crimson; a Purdue calendar would map to gold here.
 *
 * Why the default (Oct 19, 2026): the switch used to list only Indy's three
 * calendars and fell off its end for any other name, so a calendar added on
 * the server (Bloomington's) before this file knew it crashed the whole
 * Events tab. The `string` widening keeps that true for a name sent by a
 * newer server than this page.
 */
function schoolAccent(source: string): { edge: string; glow: string } {
  switch (source) {
    case "athletics":
    case "iu-student-affairs":
    case "iu-featured":
    case "iub-athletics":
    case "iub-student-life":
    case "iub-featured":
    default:
      return IU_ACCENT;
  }
}

const CARD_STYLE: CSSProperties = {
  ...SCHOOL_CARD_SURFACE,
  borderRadius: 18,
  fontFamily: "DM Sans, sans-serif",
};

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

/**
 * Why the boundary (Oct 19, 2026): the Events tab draws these cards straight
 * into its grid, with no boundary of its own around them, so one card that
 * can't render (a row shape from a newer server, say) took the whole tab
 * down. Here only that card goes; campus-home and CampusMobile need no edit.
 */
export function SchoolEventCard(props: SchoolEventCardProps) {
  return (
    <QuietBoundary name="school-card">
      <SchoolEventCardBody {...props} />
    </QuietBoundary>
  );
}

function SchoolEventCardBody({ ev, source }: SchoolEventCardProps) {
  const titleId = useId();
  const when = whenLine(ev);
  const note = gameNote(ev);
  // The event's own page when the feed names one, else the calendar itself:
  // both are https on the school's own host (checked on the server, and
  // again here by the one shared check, so a bad page falls back to the calendar).
  const calendarHref = schoolHref(ev, source ? [source] : []);

  const accent = schoolAccent(ev.source);

  return (
    <MouseSpotlight size={240} color={accent.glow} style={{ ...CARD_STYLE, borderLeft: `3px solid ${accent.edge}` }}>
    <article aria-labelledby={titleId} className="tonight-school-card" style={{ padding: 20 }}>
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
            <IconCalendar size={13} />
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
    </MouseSpotlight>
  );
}
