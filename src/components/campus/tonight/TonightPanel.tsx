"use client";

/**
 * "What's the vibe tonight?" on the desktop Feed (C2_Desk's right panel,
 * Oct 19 2026). #1 sits on top and never scrolls; the rest of tonight
 * (school rows, then club rows) scrolls inside the panel when it doesn't
 * fit, so the panel always ends above the Otto orb. The order comes from
 * the pure buildTonight (tonight-view.ts): school before clubs, then by
 * start time, never by popularity; club counts only from 5. School items
 * open their own calendar page in a new tab; club items switch to Events
 * and flash that event's card, where Going lives. CONTRACT.md §6.1.
 */
import { type ReactNode, useId } from "react";

import { Reveal } from "@/lib/motion/Reveal";
import type { SchoolSource } from "@/lib/school-events/types";

import {
  ClubSwatch,
  CreditLine,
  IconChevron,
  IconClock,
  IconPin,
  ItemTitle,
  LeadLinks,
  OutLink,
  ReasonLabel,
  SchoolTag,
  TonightSkeleton,
  schoolHref,
} from "./TonightBits";
// After TonightBits (which brings tonight.css), so this layout file comes
// later in the page's CSS and wins any tie with the shared classes.
import "./feed-side.css";
import { TONIGHT_COPY } from "./tonight-view";
import type { TonightItem, TonightLead, TonightPanelProps, TonightView } from "./types";
import { useTonightView } from "./use-tonight-view";

type SchoolItem = Extract<TonightItem, { kind: "school" }>;

/** The calendar a school item came from (its credit and fallback page), or null. */
function sourceOf(item: SchoolItem, sources: readonly SchoolSource[]): SchoolSource | null {
  return sources.find((s) => s.key === item.ev.source) ?? null;
}

/** "Bouldering night and Blitz night", "A, B and C": the folded club line read aloud. */
function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles.join("");
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

export function TonightPanel({ school, clubs, clubsFailed, onPickEvent, onOpenEvents }: TonightPanelProps) {
  // Re-ranks on the minute tick inside the hook, so only this panel
  // re-renders as an event starts or ends, never the page around it.
  const view = useTonightView(school, clubs);
  // Nothing could be read at all (no club list, no school calendar for this
  // campus): no panel, and the feed simply has an empty right gutter.
  if (clubsFailed && school.status === "ready" && !school.on) return null;
  // The club list failed and the school has nothing tonight or this week:
  // the only thing left to say would be "Nothing on campus tonight", and
  // club events may well be on. Saying nothing beats a claim we couldn't check.
  if (clubsFailed && view && !view.lead && view.nextUp.length === 0) return null;
  return (
    // The landmark lives here, not in FeedSideLayout, so it exists exactly
    // when the panel draws: never an empty "What's the vibe tonight" region,
    // and never one that holds only the folded "Your clubs" strip.
    <aside className="tonight-panel-aside" aria-label="What's the vibe tonight">
      <section className="tonight-panel" aria-labelledby="tonight-panel-h" aria-busy={view ? undefined : true}>
        <div className="tonight-side-head">
          <span className="tonight-eyebrow">{view ? view.dayLabel : TONIGHT_COPY.tonight}</span>
          <h2 id="tonight-panel-h" className="tonight-panel-title">
            {TONIGHT_COPY.title}
          </h2>
        </div>
        {view ? (
          <Reveal rise={false} className="tonight-panel-content">
            <PanelBody
              view={view}
              sources={school.sources}
              clubsFailed={clubsFailed}
              onPickEvent={onPickEvent}
              onOpenEvents={onOpenEvents}
            />
          </Reveal>
        ) : (
          <TonightSkeleton rows={3} />
        )}
      </section>
    </aside>
  );
}

type BodyProps = {
  view: TonightView;
  sources: readonly SchoolSource[];
  /** The club list couldn't be read: say nothing that claims there are no club events. */
  clubsFailed: boolean;
  onPickEvent: (eventId: string) => void;
  onOpenEvents: () => void;
};

function PanelBody({ view, sources, clubsFailed, onPickEvent, onOpenEvents }: BodyProps) {
  const credit = view.credits.length ? (
    <div className="tonight-panel-credit">
      <CreditLine sources={view.credits} />
    </div>
  ) : null;
  if (!view.lead) {
    return (
      <div className="tonight-scroll tonight-panel-body tonight-panel-body--empty">
        {/* Only when the club list answered: with it missing, "nothing on
            campus" is a guess (the panel shows only the school's week then). */}
        {clubsFailed ? null : <p className="tonight-empty">{TONIGHT_COPY.empty}</p>}
        {view.nextUp.length ? (
          <NextUp items={view.nextUp} sources={sources} onPickEvent={onPickEvent} />
        ) : null}
        <div className="tonight-empty-foot">
          <AllInEvents onOpenEvents={onOpenEvents} />
        </div>
        {credit}
      </div>
    );
  }
  return (
    <>
      <Hero lead={view.lead} sources={sources} onPickEvent={onPickEvent} />
      <div className="tonight-scroll tonight-panel-body">
        <AlsoTonight
          view={view}
          sources={sources}
          clubsFailed={clubsFailed}
          onPickEvent={onPickEvent}
          onOpenEvents={onOpenEvents}
        />
        {credit}
      </div>
    </>
  );
}

/** "All in Events ›": the whole list, with Going, on the Events tab. */
function AllInEvents({ onOpenEvents }: { onOpenEvents: () => void }) {
  return (
    <button type="button" className="tonight-quiet-link vibe-press" onClick={onOpenEvents}>
      {TONIGHT_COPY.allInEvents}
      <IconChevron size={10} />
    </button>
  );
}

/** #1: why it leads, its title (out to the calendar, or in to Events), when and where, and its links. */
function Hero({ lead, sources, onPickEvent }: { lead: TonightLead; sources: readonly SchoolSource[]; onPickEvent: (eventId: string) => void }) {
  const titleId = useId();
  const { text } = lead;
  const source = lead.kind === "school" ? sourceOf(lead, sources) : null;
  // https only, re-checked (see Row): a refused address leaves the title as plain words.
  const href = lead.kind === "school" ? schoolHref(lead.ev, sources) : null;
  let title: ReactNode = <ItemTitle item={lead} />;
  if (lead.kind === "club") {
    // Going lives on the event's card in Events, so #1 never draws a second one.
    title = (
      <button type="button" onClick={() => onPickEvent(lead.ev.id)} aria-label={`${lead.ev.title}. ${TONIGHT_COPY.actionClub}`}>
        {title}
      </button>
    );
  } else if (href) {
    title = (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${lead.ev.title}. ${TONIGHT_COPY.actionSchool}`}>
        {title}
      </a>
    );
  }
  const hasLinks = lead.kind === "school" && (source !== null || !!lead.ev.tickets_url || !!lead.ev.watch_url);
  return (
    <article className="tonight-hero" aria-labelledby={titleId}>
      <div className="tonight-hero-top">
        <div className="tonight-hero-reason">
          <ReasonLabel reason={lead.reason} />
        </div>
        <h3 id={titleId} className="tonight-hero-title">
          {title}
        </h3>
        {text.subline ? <p className="tonight-hero-sub">{text.subline}</p> : null}
        <div className="tonight-hero-tagrow">
          {lead.kind === "school" ? <SchoolTag /> : <ClubSwatch orgId={lead.ev.org?.id ?? null} />}
          <span className="tonight-hero-host">{lead.kind === "school" ? lead.ev.host : (lead.ev.org?.name ?? "")}</span>
        </div>
      </div>
      <div className="tonight-hero-facts">
        <span className="tonight-fact">
          <IconClock size={14} />
          <span className="tonight-fact-text">
            <strong>{text.time}</strong>
            {text.timeTail}
          </span>
        </span>
        {text.place ? (
          <span className="tonight-fact">
            <IconPin size={14} />
            <span className="tonight-fact-text">{text.place}</span>
          </span>
        ) : null}
      </div>
      {lead.kind === "club" && text.count ? <p className="tonight-hero-count">{text.count}</p> : null}
      {hasLinks && lead.kind === "school" ? (
        <div className="tonight-hero-links">
          <LeadLinks ev={lead.ev} />
          {source ? (
            // Its own quieter line under the actions: the credit is a long
            // sentence, and as a bold action it wrapped with its arrow
            // stranded at the far edge.
            <span className="tonight-hero-credit">
              <OutLink href={source.calendar_url}>{source.credit}</OutLink>
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Everything else tonight. School rows under "Also tonight", then the club
 * rows under "Also tonight from clubs"; between 1100 and 1399px those club
 * rows fold into one line into Events (CSS picks the twin). With no school
 * rows the club rows show at every width: there is room for them then.
 */
function AlsoTonight({ view, sources, clubsFailed, onPickEvent, onOpenEvents }: BodyProps) {
  const alsoId = useId();
  const clubsId = useId();
  if (view.more === 0) {
    return (
      <div className={clubsFailed ? "tonight-group-head tonight-group-head--end" : "tonight-group-head"}>
        {/* "Nothing else tonight" only when the club list answered; without
            it, just the way into Events. */}
        {clubsFailed ? null : <p className="tonight-nothing-else">{TONIGHT_COPY.nothingElse}</p>}
        <AllInEvents onOpenEvents={onOpenEvents} />
      </div>
    );
  }
  const clubRows = view.clubs.map((item) => (
    <li key={item.key}>
      <Row item={item} sources={sources} onPickEvent={onPickEvent} />
    </li>
  ));
  if (view.school.length === 0) {
    return (
      <section className="tonight-group" aria-labelledby={clubsId}>
        <div className="tonight-group-head">
          <h3 id={clubsId} className="tonight-group-title">
            {TONIGHT_COPY.alsoClubs}
          </h3>
          <AllInEvents onOpenEvents={onOpenEvents} />
        </div>
        <ul className="tonight-list">{clubRows}</ul>
      </section>
    );
  }
  return (
    <>
      <section className="tonight-group" aria-labelledby={alsoId}>
        <div className="tonight-group-head">
          <h3 id={alsoId} className="tonight-group-title">
            {TONIGHT_COPY.alsoTonight}
          </h3>
          <AllInEvents onOpenEvents={onOpenEvents} />
        </div>
        <ul className="tonight-list">
          {view.school.map((item) => (
            <li key={item.key}>
              <Row item={item} sources={sources} onPickEvent={onPickEvent} />
            </li>
          ))}
        </ul>
      </section>
      {view.clubs.length ? (
        <>
          <ClubsSummary items={view.clubs} onOpenEvents={onOpenEvents} />
          <section className="tonight-clubs-full" aria-labelledby={clubsId}>
            <h3 id={clubsId} className="tonight-group-title tonight-group-title--pad">
              {TONIGHT_COPY.alsoClubs}
            </h3>
            <ul className="tonight-list">{clubRows}</ul>
          </section>
        </>
      ) : null}
    </>
  );
}

/** The folded club rows: "Also tonight from clubs · 2 more ›", into Events. */
function ClubsSummary({ items, onOpenEvents }: { items: TonightItem[]; onOpenEvents: () => void }) {
  const n = items.length;
  const label = `${TONIGHT_COPY.alsoClubs}: ${n} ${n === 1 ? "event" : "events"}, ${joinTitles(items.map((i) => i.ev.title))}`;
  return (
    <button type="button" className="tonight-row tonight-clubs-sum vibe-press" aria-label={label} onClick={onOpenEvents}>
      <span className="tonight-group-title">{TONIGHT_COPY.alsoClubs}</span>
      <span className="tonight-quiet-link">
        {n} more
        <IconChevron size={10} />
      </span>
    </button>
  );
}

/** Nothing tonight: up to three things in the next 7 days, each with its day. */
function NextUp({ items, sources, onPickEvent }: { items: TonightItem[]; sources: readonly SchoolSource[]; onPickEvent: (eventId: string) => void }) {
  const id = useId();
  return (
    <section className="tonight-group" aria-labelledby={id}>
      <h3 id={id} className="tonight-group-title tonight-group-title--pad">
        {TONIGHT_COPY.nextUp}
      </h3>
      <ul className="tonight-list">
        {items.map((item) => (
          <li key={item.key}>
            <Row item={item} sources={sources} onPickEvent={onPickEvent} withDay />
          </li>
        ))}
      </ul>
    </section>
  );
}

type RowProps = { item: TonightItem; sources: readonly SchoolSource[]; onPickEvent: (eventId: string) => void; withDay?: boolean };

/**
 * One row. School: a link to its calendar page in a new tab, with the
 * "School event" tag and the office. Club: a button that switches to Events
 * and flashes that card, with the club's colour square and name, and a
 * count only from 5 going (buildTonight already blanked anything lower).
 */
function Row({ item, sources, onPickEvent, withDay = false }: RowProps) {
  const { text } = item;
  // The byline, not the bare office: a game reads "Athletics · Women's
  // swimming", so the men's and women's meets at the same hour and pool
  // don't look like one row twice. Events and clubs: the office, the club.
  const host = text.byline;
  const body = (
    <>
      <span className="tonight-prow-top">
        <span className="tonight-prow-title">
          <ItemTitle item={item} />
        </span>
        {text.count ? <span className="tonight-prow-count">{text.count}</span> : null}
      </span>
      <span className="tonight-prow-when">
        <strong>{withDay ? `${text.day} · ${text.time}` : text.time}</strong>
        {item.kind === "school" ? text.timeTail : ""}
        {text.place ? ` · ${text.place}` : ""}
      </span>
      {host ? (
        <span className="tonight-prow-by">
          {item.kind === "school" ? <SchoolTag /> : <ClubSwatch orgId={item.ev.org?.id ?? null} />}
          <span className="tonight-prow-host" title={host}>
            {host}
          </span>
        </span>
      ) : null}
    </>
  );
  const spoken = withDay ? `${text.day}, ${text.spoken}` : text.spoken;
  if (item.kind === "club") {
    const ev = item.ev;
    return (
      <button
        type="button"
        className="tonight-row tonight-prow vibe-press"
        aria-label={`${spoken}. ${TONIGHT_COPY.actionClub}`}
        onClick={() => onPickEvent(ev.id)}
      >
        {body}
      </button>
    );
  }
  // https only, checked again here (as OutLink does), so a bad address from
  // the feed can never become a live link; the server's host lock is the first check.
  const href = schoolHref(item.ev, sources);
  // No safe page to open (none in the feed, its calendar unknown, or not
  // https): the same words, just not a link.
  if (!href) return <div className="tonight-prow">{body}</div>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="tonight-row tonight-prow vibe-press"
      aria-label={`${spoken}. ${TONIGHT_COPY.actionSchool}`}
    >
      {body}
    </a>
  );
}
