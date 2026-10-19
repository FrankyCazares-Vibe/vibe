"use client";

/**
 * The Events tab's "Tonight" block, desktop (board D2_Events) and phone
 * (P2_Events), Oct 19 2026. It sits between the filter chips and the
 * "Coming up" grid, and it hands that grid its heading, so the caller adds
 * none. On a campus with no school calendar and nothing on tonight it draws
 * nothing at all, so those Events tabs look exactly as they did before.
 *
 * A SCHOOL lead gets the hero. A club lead is drawn as the first club row
 * instead: its EventCard below is the RSVP place, and Tonight never draws a
 * second Going button. School events have no Going in v1 (CONTRACT §7.1).
 * Never ordered by popularity: tonight-view.ts decides the order; counts
 * show on club rows only, and only from 5 (`text.count`).
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §6.3.
 */
import { useId, type ReactNode } from "react";

import { Reveal } from "@/lib/motion/Reveal";
import type { SchoolSource } from "@/lib/school-events/types";

import {
  CreditLine,
  IconChevron,
  IconClock,
  IconInfo,
  IconOut,
  IconPin,
  ItemTitle,
  LeadLinks,
  OrbitMark,
  ReasonLabel,
  SchoolTag,
  TonightSkeleton,
  schoolHref,
} from "./TonightBits";
import { leadRuleLine, sectionHeadings, TONIGHT_COPY, tonightSectionVisible } from "./tonight-view";
import type { TonightItem, TonightLead, TonightSectionProps, TonightView } from "./types";
import { useTonightView } from "./use-tonight-view";

import "./tonight.css";
import "./tonight-events.css";

type Layout = TonightSectionProps["layout"];
type SchoolLead = Extract<TonightLead, { kind: "school" }>;

/** What the block draws, worked out once from the view. */
type Plan = {
  hero: SchoolLead | null;
  schoolRows: TonightItem[];
  clubRows: TonightItem[];
  schoolHeading: string | null;
  clubHeading: string | null;
};

function planOf(view: TonightView): Plan {
  const lead = view.lead;
  const hero = lead && lead.kind === "school" ? lead : null;
  // A club leads only when no school event is on tonight; it goes first in
  // the club rows (still soonest first: the lead is the soonest or live one).
  const clubRows: TonightItem[] = lead && lead.kind === "club" ? [lead, ...view.clubs] : view.clubs;
  // sectionHeadings counts a club lead (no hero) as a club row too, so its
  // heading is null exactly when that group draws nothing.
  const heads = sectionHeadings(view, hero !== null);
  return {
    hero,
    schoolRows: view.school,
    clubRows,
    schoolHeading: heads.school,
    clubHeading: heads.clubs,
  };
}

/** The section frame and its header; "Coming up" follows it as a sibling. */
function Shell({
  layout,
  headingId,
  dayLabel,
  busy,
  children,
}: {
  layout: Layout;
  headingId: string;
  dayLabel: string | null;
  busy?: boolean;
  children: ReactNode;
}) {
  const title = (
    <h3 id={headingId} className="tonight-ev-title">
      {TONIGHT_COPY.tonight}
    </h3>
  );
  const day = dayLabel ? <span className="tonight-ev-day">{dayLabel}</span> : null;
  return (
    <>
      <section
        aria-labelledby={headingId}
        aria-busy={busy || undefined}
        className={`tonight-ev tonight-ev--${layout}`}
      >
        {layout === "desktop" ? (
          <div className="tonight-ev-head">
            <div className="tonight-ev-headtext">
              {title}
              {day}
            </div>
            <OrbitMark size={28} />
          </div>
        ) : (
          <div className="tonight-ev-head">
            {title}
            {day}
          </div>
        )}
        {children}
      </section>
      <h3 className="tonight-coming-h">{TONIGHT_COPY.comingUp}</h3>
    </>
  );
}

/** #1 when it's a school event: desktop beside the rows, phone its own card. */
function Hero({ lead, layout, sources }: { lead: SchoolLead; layout: Layout; sources: SchoolSource[] }) {
  const titleId = useId();
  const { ev, text } = lead;
  const href = schoolHref(ev, sources);
  const desktop = layout === "desktop";
  const reason = (
    <span className="tonight-ev-reason">
      <ReasonLabel reason={lead.reason} />
    </span>
  );
  return (
    <article
      aria-labelledby={titleId}
      className={desktop ? "tonight-ev-hero" : "tonight-ev-card tonight-ev-card--hero"}
    >
      {desktop ? null : reason}
      <div className="tonight-ev-tagrow">
        <span className="tonight-ev-tagline">
          <SchoolTag size="hero" />
          {/* Desktop says the sport on the subline; the phone card has no
              subline, so its tag row carries "Athletics · Men's basketball". */}
          <span>{desktop ? ev.host : text.byline}</span>
        </span>
        {desktop ? reason : null}
      </div>
      <h4 id={titleId} className="tonight-ev-lead">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="tonight-focus"
            aria-label={`${ev.title}, opens in a new tab`}
          >
            <ItemTitle item={lead} />
          </a>
        ) : (
          <ItemTitle item={lead} />
        )}
      </h4>
      {desktop && text.subline ? <p className="tonight-ev-sub">{text.subline}</p> : null}
      <div className="tonight-ev-when">
        <span>
          <IconClock size={14} />
          <span>
            <b>{text.time}</b>
            {text.timeTail}
          </span>
        </span>
        {text.place ? (
          <span>
            <IconPin size={14} />
            {text.place}
          </span>
        ) : null}
      </div>
      <div className="tonight-ev-links">
        <LeadLinks ev={ev} />
      </div>
      <p className="tonight-ev-rule">
        <IconInfo size={13} />
        <span>{leadRuleLine(lead)}</span>
      </p>
    </article>
  );
}

/** One row. School: a link to its calendar page, new tab. Club: a button
 *  that scrolls to and flashes its EventCard in "Coming up". */
function Row({
  item,
  layout,
  sources,
  onPickClubEvent,
}: {
  item: TonightItem;
  layout: Layout;
  sources: SchoolSource[];
  onPickClubEvent: (eventId: string) => void;
}) {
  const { text } = item;
  const school = item.kind === "school";
  const href = item.kind === "school" ? schoolHref(item.ev, sources) : null;
  const tail = text.timeTail.trim();
  const time = (
    <span className="tonight-ev-time">
      <span className="tonight-ev-clock">{text.time}</span>
      {tail ? <span className="tonight-ev-tail">{tail}</span> : null}
    </span>
  );
  let inner: ReactNode;
  if (layout === "desktop") {
    inner = (
      <>
        {time}
        <span className="tonight-ev-text">
          <span className="tonight-ev-rtitle">
            <span>
              <ItemTitle item={item} />
            </span>
            {school ? <SchoolTag size="hero" /> : null}
          </span>
          <span className="tonight-ev-meta">
            {text.byline ? <span className="tonight-ev-host">{text.byline}</span> : null}
            {text.byline && text.place ? " · " : null}
            {text.place}
          </span>
        </span>
        <span className="tonight-ev-count">{text.count}</span>
        <span className="tonight-ev-icon">
          {!school ? <IconChevron size={14} /> : href ? <IconOut size={14} /> : null}
        </span>
      </>
    );
  } else {
    // Phone: the school tag and office get their own line; a club's name
    // shares the place line (P2_Events). `count` is "" under 5 and on school.
    const meta = (school ? [text.place, text.count] : [text.byline, text.place, text.count])
      .filter(Boolean)
      .join(" · ");
    inner = (
      <>
        {time}
        <span className="tonight-ev-text">
          <span className="tonight-ev-ptitle">
            <ItemTitle item={item} />
          </span>
          {school ? (
            <span className="tonight-ev-ptag">
              <SchoolTag size="row" />
              <span>{text.byline}</span>
            </span>
          ) : null}
          {meta ? <span className="tonight-ev-meta">{meta}</span> : null}
        </span>
      </>
    );
  }
  const label = `${text.spoken}. ${school ? TONIGHT_COPY.actionSchool : TONIGHT_COPY.actionClub}`;
  if (item.kind === "club") {
    return (
      <button
        type="button"
        className="tonight-row tonight-ev-row vibe-press"
        aria-label={label}
        onClick={() => onPickClubEvent(item.ev.id)}
      >
        {inner}
      </button>
    );
  }
  // No page and no calendar to open (never expected: every source has one),
  // so the row is plain text rather than a link to nowhere.
  if (!href) return <div className="tonight-ev-row">{inner}</div>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tonight-row tonight-ev-row vibe-press"
      aria-label={label}
    >
      {inner}
    </a>
  );
}

/** The rows under the hero (desktop: one column with a rule; phone: one card). */
function Rows({
  plan,
  layout,
  sources,
  onPickClubEvent,
}: {
  plan: Plan;
  layout: Layout;
  sources: SchoolSource[];
  onPickClubEvent: (eventId: string) => void;
}) {
  const list = (rows: TonightItem[]) => (
    <ul className="tonight-ev-rows">
      {rows.map((item) => (
        <li key={item.key}>
          <Row item={item} layout={layout} sources={sources} onPickClubEvent={onPickClubEvent} />
        </li>
      ))}
    </ul>
  );
  if (layout === "desktop") {
    return (
      <div className={`tonight-ev-list${plan.hero ? " tonight-ev-list--ruled" : ""}`}>
        {plan.schoolHeading ? (
          <div>
            <h4 className="tonight-ev-group-h">{plan.schoolHeading}</h4>
            {list(plan.schoolRows)}
          </div>
        ) : null}
        {plan.clubHeading ? (
          <div>
            <h4 className="tonight-ev-group-h">{plan.clubHeading}</h4>
            {list(plan.clubRows)}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="tonight-ev-card tonight-ev-card--also">
      {plan.schoolHeading ? (
        <>
          <h4 className="tonight-ev-caps">{plan.schoolHeading}</h4>
          {list(plan.schoolRows)}
        </>
      ) : null}
      {plan.clubHeading ? (
        <>
          <h4 className={`tonight-ev-caps${plan.schoolHeading ? " tonight-ev-caps--split" : ""}`}>
            {plan.clubHeading}
          </h4>
          {list(plan.clubRows)}
        </>
      ) : null}
    </div>
  );
}

export function TonightSection({ layout, school, clubs, filter, onPickClubEvent }: TonightSectionProps) {
  // The view ticks every minute here, so a row going live re-renders this
  // block only, never the whole Events tab.
  const view = useTonightView(school, clubs, filter);
  const headingId = useId();

  if (view === null) {
    // Still loading. When the school part is already known to be off (every
    // campus but Indianapolis), only a club event tonight could still appear,
    // so draw nothing instead of a skeleton that would usually just vanish.
    if (school.status === "ready" && !school.on) return null;
    return (
      <Shell layout={layout} headingId={headingId} dayLabel={null} busy>
        <TonightSkeleton rows={3} />
      </Shell>
    );
  }
  if (!tonightSectionVisible(view, school.on)) return null;

  const plan = planOf(view);
  const hasRows = plan.schoolRows.length > 0 || plan.clubRows.length > 0;
  const sources = school.sources;

  return (
    <Shell layout={layout} headingId={headingId} dayLabel={view.dayLabel}>
      {/* A plain crossfade over the skeleton; a filter change keeps this
          mounted, so switching chips never replays it. */}
      <Reveal rise={false} className="tonight-ev-reveal">
        {view.lead === null ? (
          <p className="tonight-ev-empty">{TONIGHT_COPY.empty}</p>
        ) : layout === "desktop" ? (
          <div className="tonight-ev-body">
            <div className="tonight-ev-cols">
              {plan.hero ? <Hero lead={plan.hero} layout="desktop" sources={sources} /> : null}
              {hasRows ? (
                <Rows plan={plan} layout="desktop" sources={sources} onPickClubEvent={onPickClubEvent} />
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {plan.hero ? <Hero lead={plan.hero} layout="phone" sources={sources} /> : null}
            {hasRows ? (
              <Rows plan={plan} layout="phone" sources={sources} onPickClubEvent={onPickClubEvent} />
            ) : null}
          </>
        )}
        {/* Desktop only (D2 draws it; P2_Events doesn't, and its small links
            would fall under the phone's 44px tap rule; the phone's school
            cards below and its Tonight sheet carry the credit). Only for rows
            drawn here: with nothing tonight, the view's credits name its
            "next up" items, which this block doesn't draw. */}
        {layout === "desktop" && view.lead !== null && view.credits.length > 0 ? (
          <div className="tonight-ev-credit">
            <CreditLine sources={view.credits} />
          </div>
        ) : null}
      </Reveal>
    </Shell>
  );
}
