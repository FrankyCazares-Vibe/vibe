"use client";

/**
 * The Tonight sheet (Oct 19 2026, board P2_Sheet): opened from the phone's
 * Tonight card. #1 with why it leads, the rest of tonight (school events,
 * then club events), this week's home games, and the calendars' credits.
 * One height, no detents (the repo never uses vaul's snap points).
 * Contract: handoffs/2026-10-19-tonight-build/CONTRACT.md §6.2.
 *
 * School rows leave the app (a new tab on the school's own calendar page);
 * club rows and "All in Events" go to the Events tab, and the caller closes
 * this sheet first. Counts only on club rows, from 5 (tonight-view floors
 * them); never a name or a face.
 */
import { useRef } from "react";
import { Drawer } from "vaul";

import type { SchoolSource } from "@/lib/school-events/types";

import {
  ClubSwatch,
  CreditLine,
  IconChevron,
  IconClock,
  IconInfo,
  IconPin,
  ItemTitle,
  LeadLinks,
  OutLink,
  ReasonLabel,
  SchoolTag,
  TonightSkeleton,
  httpsHref,
  schoolHref,
} from "./TonightBits";
import { athleticsSource, homeWeekLabel, leadRuleLine, sectionHeadings, TONIGHT_COPY } from "./tonight-view";
import type {
  SchoolEventsState,
  TonightItem,
  TonightLead,
  TonightSheetProps,
  TonightView,
  WeekTile,
} from "./types";
import { useHomeWeek, useTonightView } from "./use-tonight-view";

import "./tonight-phone.css";

export function TonightSheet({
  open,
  onOpenChange,
  school,
  clubs,
  onPickClubEvent,
  onOpenEvents,
}: TonightSheetProps) {
  // Where focus was when the sheet opened (the card), so a Close, Escape or
  // scrim tap hands it back there. Radix would focus a Drawer.Trigger, and
  // this sheet is opened by state, not by a trigger.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Set when a row or "All in Events" took the student to the Events tab:
  // then focus must NOT go back to the card on the Feed pane they just left.
  const leftRef = useRef(false);

  // `autoFocus`: vaul's default (false) cancels Radix's move into the sheet,
  // so focus stayed on the card behind the scrim and Tab walked the page
  // underneath. With it, Radix focuses the first control (Close) without
  // scrolling, and the focus trap has somewhere to hold. A tap open shows no
  // ring there (:focus-visible follows the tap); a keyboard open does.
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} autoFocus>
      <Drawer.Portal>
        <Drawer.Overlay className="tonight-sheet-overlay" />
        <Drawer.Content
          className="tonight-sheet"
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            const active = document.activeElement;
            returnFocusRef.current = active instanceof HTMLElement ? active : null;
            leftRef.current = false;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const back = returnFocusRef.current;
            returnFocusRef.current = null;
            // preventScroll: the card sits in a horizontal pager, and a
            // scrolled-into-view focus would drag the pager back to Feed.
            if (back && back.isConnected && !leftRef.current) back.focus({ preventScroll: true });
          }}
        >
          {/* Mounted only while open (vaul unmounts closed content), so the
              minute ticker behind useTonightView runs only while it shows. */}
          <SheetBody
            school={school}
            clubs={clubs}
            onClose={() => onOpenChange(false)}
            onPickClub={(id) => {
              leftRef.current = true;
              onPickClubEvent(id);
            }}
            onAllEvents={() => {
              leftRef.current = true;
              onOpenEvents();
            }}
          />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

type BodyProps = {
  school: SchoolEventsState;
  clubs: TonightSheetProps["clubs"];
  onClose: () => void;
  onPickClub: (eventId: string) => void;
  onAllEvents: () => void;
};

function SheetBody({ school, clubs, onClose, onPickClub, onAllEvents }: BodyProps) {
  const view = useTonightView(school, clubs);
  const weekAll = useHomeWeek(school);
  // School off or failed: the home-games block goes with every school part.
  const week = school.on ? weekAll : [];
  const title = view ? `${TONIGHT_COPY.tonight} · ${view.dayLabel}` : TONIGHT_COPY.tonight;

  return (
    <>
      <div className="tonight-sheet-grab" aria-hidden="true" />
      <div className="tonight-sheet-top">
        <Drawer.Title className="tonight-eyebrow">{title}</Drawer.Title>
        <button type="button" className="tonight-sheet-close tonight-focus vibe-press" aria-label="Close" onClick={onClose}>
          <span aria-hidden="true">
            <IconX />
          </span>
        </button>
      </div>
      {/* Scrolling the list must not drag the sheet shut. */}
      <div className="tonight-sheet-body" data-vaul-no-drag>
        {view === null ? (
          <TonightSkeleton rows={3} />
        ) : (
          <>
            {view.lead ? (
              <Tonight view={view} lead={view.lead} sources={school.sources} onPickClub={onPickClub} onAllEvents={onAllEvents} />
            ) : (
              <NothingTonight view={view} sources={school.sources} onPickClub={onPickClub} onAllEvents={onAllEvents} />
            )}
            {week.length > 0 ? <HomeWeek tiles={week} sources={school.sources} /> : null}
            <div className="tonight-sheet-credit">
              <CreditLine sources={sheetCredits(view, school.sources, week.length > 0)} />
            </div>
          </>
        )}
      </div>
    </>
  );
}

type ListProps = {
  view: TonightView;
  sources: SchoolSource[];
  onPickClub: (eventId: string) => void;
  onAllEvents: () => void;
};

/** #1, then the rest of tonight: school rows first, then club rows. */
function Tonight({ view, lead, sources, onPickClub, onAllEvents }: ListProps & { lead: TonightLead }) {
  // #1 is always drawn big here (school or club), so club rows read "Also
  // tonight from clubs" under it.
  const heads = sectionHeadings(view, true);
  const firstHead = view.school.length > 0 ? heads.school : heads.clubs;
  return (
    <>
      <Hero lead={lead} sources={sources} onPickClub={onPickClub} />
      <div className="tonight-sheet-hr" aria-hidden="true" />
      <div className="tonight-sheet-head">
        {firstHead ? <h3 className="tonight-sheet-h3">{firstHead}</h3> : <p className="tonight-sheet-none">{TONIGHT_COPY.nothingElse}</p>}
        <AllInEvents onClick={onAllEvents} />
      </div>
      {view.school.length > 0 ? <Rows items={view.school} sources={sources} onPickClub={onPickClub} /> : null}
      {view.school.length > 0 && heads.clubs ? <h3 className="tonight-sheet-h3 tonight-sheet-h3--gap">{heads.clubs}</h3> : null}
      {view.clubs.length > 0 ? <Rows items={view.clubs} sources={sources} onPickClub={onPickClub} /> : null}
    </>
  );
}

/** Nothing on tonight (it can end while the sheet is open): the next few days instead. */
function NothingTonight({ view, sources, onPickClub, onAllEvents }: ListProps) {
  return (
    <>
      <p className="tonight-sheet-empty">{TONIGHT_COPY.empty}</p>
      <div className="tonight-sheet-head">
        {view.nextUp.length > 0 ? <h3 className="tonight-sheet-h3">{TONIGHT_COPY.nextUp}</h3> : <span />}
        <AllInEvents onClick={onAllEvents} />
      </div>
      {view.nextUp.length > 0 ? <Rows items={view.nextUp} sources={sources} onPickClub={onPickClub} withDay /> : null}
    </>
  );
}

function Hero({ lead, sources, onPickClub }: { lead: TonightLead; sources: SchoolSource[]; onPickClub: (eventId: string) => void }) {
  const source = lead.kind === "school" ? sourceOf(sources, lead.ev.source) : null;
  const href = lead.kind === "school" ? schoolHref(lead.ev, sources) : null;
  return (
    <div className="tonight-sheet-hero">
      <p className="tonight-sheet-reason">
        <ReasonLabel reason={lead.reason} />
      </p>
      <div className="tonight-sheet-tagrow">
        <span className="tonight-sheet-by">
          {lead.kind === "school" ? <SchoolTag size="hero" /> : <ClubSwatch orgId={lead.ev.org?.id ?? null} />}
          <span className="tonight-ellipsis">{lead.text.byline}</span>
        </span>
        {/* Club counts only, from 5 (tonight-view); school items have none in v1. */}
        {lead.text.count ? <span className="tonight-sheet-count">{lead.text.count}</span> : null}
      </div>
      <h3 className="tonight-sheet-title">
        {lead.kind === "club" ? (
          // Its Events card is where Going lives, so the title goes there.
          <button
            type="button"
            className="tonight-focus"
            aria-label={`${lead.ev.title}. ${TONIGHT_COPY.actionClub}`}
            onClick={() => onPickClub(lead.ev.id)}
          >
            <ItemTitle item={lead} />
          </button>
        ) : href ? (
          <a
            className="tonight-focus"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${lead.ev.title}, opens in a new tab`}
          >
            <ItemTitle item={lead} />
          </a>
        ) : (
          <ItemTitle item={lead} />
        )}
      </h3>
      <div className="tonight-sheet-meta">
        <span>
          <IconClock size={14} />
          <span>
            <b>{lead.text.time}</b>
            {lead.text.timeTail}
          </span>
        </span>
        {lead.text.place ? (
          <span>
            <IconPin size={14} />
            {lead.text.place}
          </span>
        ) : null}
      </div>
      {lead.kind === "school" ? (
        <div className="tonight-sheet-links">
          <LeadLinks ev={lead.ev} />
          {source ? (
            <OutLink href={source.calendar_url}>{source.credit}</OutLink>
          ) : null}
        </div>
      ) : null}
      <p className="tonight-sheet-rule">
        <IconInfo size={13} />
        <span>{leadRuleLine(lead)}</span>
      </p>
    </div>
  );
}

function Rows({
  items,
  sources,
  onPickClub,
  withDay = false,
}: {
  items: TonightItem[];
  sources: SchoolSource[];
  onPickClub: (eventId: string) => void;
  withDay?: boolean;
}) {
  return (
    <ul className="tonight-sheet-list">
      {items.map((item) => (
        <li key={item.key}>
          <Row item={item} sources={sources} onPickClub={onPickClub} withDay={withDay} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One row: a 72px time column (the end or "tip-off" under it; "Thu 5" over
 * the time in the next-days list), then the title and whose it is. A school
 * row is a link to its calendar page in a new tab; a club row is a button to
 * its Events card.
 */
function Row({
  item,
  sources,
  onPickClub,
  withDay,
}: {
  item: TonightItem;
  sources: SchoolSource[];
  onPickClub: (eventId: string) => void;
  withDay: boolean;
}) {
  const top = withDay ? item.text.day : item.text.time;
  const under = withDay ? item.text.time : item.text.timeTail.trim();
  const spoken = withDay ? `${item.text.day}, ${item.text.spoken}` : item.text.spoken;
  const when = (
    <span className="tonight-sheet-when">
      <span className="tonight-sheet-time">{top}</span>
      {under ? <span className="tonight-sheet-tail">{under}</span> : null}
    </span>
  );

  if (item.kind === "club") {
    const line = [item.text.byline, item.text.place, item.text.count].filter(Boolean).join(" · ");
    return (
      <button
        type="button"
        className="tonight-sheet-row tonight-row vibe-press"
        aria-label={`${spoken}. ${TONIGHT_COPY.actionClub}`}
        onClick={() => onPickClub(item.ev.id)}
      >
        {when}
        <span className="tonight-sheet-main">
          <span className="tonight-sheet-rtitle">
            <ItemTitle item={item} />
          </span>
          {line ? <span className="tonight-sheet-line">{line}</span> : null}
        </span>
      </button>
    );
  }

  const href = schoolHref(item.ev, sources);
  const body = (
    <>
      {when}
      <span className="tonight-sheet-main">
        <span className="tonight-sheet-rtitle">
          <ItemTitle item={item} />
        </span>
        <span className="tonight-sheet-sub">
          <SchoolTag size="row" />
          <span className="tonight-ellipsis">{item.text.byline}</span>
        </span>
        {item.text.place ? <span className="tonight-sheet-line">{item.text.place}</span> : null}
      </span>
    </>
  );
  // No page to open (a calendar switched off mid-read): the words, unlinked.
  if (!href) return <div className="tonight-sheet-row tonight-sheet-row--still">{body}</div>;
  return (
    <a
      className="tonight-sheet-row tonight-row vibe-press"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${spoken}. ${TONIGHT_COPY.actionSchool}`}
    >
      {body}
    </a>
  );
}

/**
 * "Home games this week": athletics only, two tiles a row, played ones faded.
 * The calendar and its name come from the campus's athletics source (Oct 19,
 * 2026): "IU Athletics" in Bloomington, "IU Indy Athletics" in Indy.
 */
function HomeWeek({ tiles, sources }: { tiles: WeekTile[]; sources: SchoolSource[] }) {
  const fallback = httpsHref(athleticsSource(sources)?.calendar_url);
  const label = homeWeekLabel(sources);
  return (
    <>
      <div className="tonight-sheet-hr tonight-sheet-hr--week" aria-hidden="true" />
      <div className="tonight-sheet-weekhead">
        <h3 className="tonight-sheet-h3">{TONIGHT_COPY.homeWeek}</h3>
        {label ? <span className="tonight-sheet-weeksub">{label}</span> : null}
      </div>
      <ol className="tonight-week">
        {tiles.map((tile) => {
          const href = httpsHref(tile.ev.url) ?? fallback;
          const current = tile.state === "today" || tile.state === "live" ? ("date" as const) : undefined;
          const inner = (
            <>
              <span className="tonight-tile-top">
                <span>{tile.day}</span>
                <span>{tile.label}</span>
              </span>
              <span className="tonight-tile-sport">{tile.sport}</span>
              <span className="tonight-tile-vs">{tile.versus}</span>
            </>
          );
          return (
            <li key={tile.key}>
              {href ? (
                <a
                  className="tonight-tile tonight-focus vibe-press"
                  data-state={tile.state}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-current={current}
                  aria-label={`${tile.spoken}, opens in a new tab`}
                >
                  {inner}
                </a>
              ) : (
                <div className="tonight-tile" data-state={tile.state} aria-current={current}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function AllInEvents({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="tonight-sheet-all tonight-focus vibe-press" onClick={onClick}>
      {TONIGHT_COPY.allInEvents}
      <IconChevron size={12} />
    </button>
  );
}

function sourceOf(sources: SchoolSource[], key: SchoolSource["key"]): SchoolSource | null {
  return sources.find((s) => s.key === key) ?? null;
}

/**
 * The calendars behind what this sheet shows, in the fixed source order:
 * the view's own (#1, rows, next days) plus athletics when the home-games
 * tiles show, since those come from it even with no game tonight.
 */
function sheetCredits(view: TonightView, sources: SchoolSource[], weekShown: boolean): SchoolSource[] {
  const athletics = weekShown ? athleticsSource(sources) : null;
  return sources.filter((s) => view.credits.some((c) => c.key === s.key) || s === athletics);
}

/** The sheet's Close mark (the boards' 12-grid x), currentColor. */
function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
