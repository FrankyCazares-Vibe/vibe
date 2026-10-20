"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { clubEventHref } from "@/lib/calendar/calendar-key";
import { addMonths, clampMonth, compareMonths, isSameLocalDay, monthBounds, monthGrid, monthName, monthOf, type MonthRef, startOfLocalDay } from "@/lib/chat/week";
import { vibeRequest } from "@/lib/feedback/request";

import { clubGradient } from "../avatar";
import { useChatSurface } from "../surface";
import { palette, type Palette, SERIF } from "../v2-tokens";

import { CheckIcon } from "./ClubRow";
import { calendarUrl, dayCaption, dayDot, dayHeading, dayWhen, entriesOn, isPastDay, monthDayLabel, type PlanRow, planRows, rsvpEntries, spokenDay, type WeekEntry } from "./home-rules";
import { InterestedRing, RsvpDayMark } from "./RsvpMark";
import { slideClass, useSwipe } from "./YourWeek";

/**
 * The month of your RSVPs without its container (wave-3 contract 6.2, H4):
 * the calendar that `MonthSheet` held until the split, moved here line for
 * line so the phone's sheet (`MonthSheet`, vaul) and the desktop's popover
 * (`dm/MonthPopover`) draw ONE calendar. Two copies of a calendar drift.
 *
 * - What is here: the picked day, the month on screen and the way it last
 *   moved, the per-month cache and its one read per month (the grid's first
 *   Monday 00:00 to its last Sunday 23:59:59.999, kept while the body is
 *   mounted), then top to bottom: the header row (the title, the `Today`
 *   pill, the two month chevrons), `Mon … Sun`, the grid (a dot under a day
 *   with plans, `dayDot`; today's coral ring; the picked day filled; other
 *   months' days blank; past days dim), the hairline, the picked day
 *   (`Fri, Oct 9`, `Tomorrow · 1 plan`) and its plans by start, the line
 *   `Only events you RSVP'd to`.
 * - What is NOT here: any shell. No scrim, no handle, no history entry, no
 *   focus rule, no close. The wrapper owns those.
 * - It renders a FRAGMENT. The wrapper's box must be a flex column (the plan
 *   rows are buttons and only stretch to the full width as flex items; in
 *   the sheet the footer line also sits at the bottom of the fixed height by
 *   its `auto` top margin), and gives the bottom padding (the sheet: 14px).
 * - `renderTitle(monthLabel)` draws the title, the first child of the 44px
 *   header row: `monthLabel` is the month and the year on screen
 *   (`October 2026`). The element needs `marginRight: "auto"` (it pushes
 *   `Today` and the chevrons to the right) and should be a live region, as
 *   the sheet's `Drawer.Title` is: the month is said when it changes.
 * - `onPicked(day)` at every pick (a day of the grid, `Today`), as it is
 *   made: the wrapper keeps the last one for its own close (the week strip
 *   or the band moves to that day's week). Moving the month keeps the pick.
 * - The grid swipes month to month (`useSwipe`) and slides in from its side:
 *   the classes are `SLIDE_CSS`'s, which the WRAPPER puts on the page with
 *   `<style>{MONTH_SLIDE_CSS}</style>` (the sheet keeps its own `<style>`
 *   where it always was; without it the month changes with no slide and
 *   nothing else is lost). `data-vaul-no-drag` on the swipe area means
 *   something to the sheet only.
 * - `cell` is the day chip's size (42 by default, the sheet's): seven of
 *   them need 7 × `cell` + 24px of width, so 336px holds the default.
 * - A live event's day dot glows on the phone, as it always has. On the
 *   desktop surface (`useChatSurface()`) it is a plain coral dot: the screen
 *   under the popover already has its one glow (the band's live card at
 *   home, `EventAbout`'s live mark in an event chat; contract 3.2).
 * - A plan whose entry has a `room_id` is a button: `onOpenRoom(entry)`.
 */
export type MonthBodyProps = {
  /** The day picked when the body mounts. */
  initialDay: Date;
  now: Date;
  night: boolean;
  /** A day was picked (a day of the grid, `Today`). */
  onPicked: (day: Date) => void;
  /** A plan with a room: the wrapper opens its event chat. */
  onOpenRoom: (entry: WeekEntry) => void;
  /** The title element for `October 2026` (the sheet: `Drawer.Title`; the popover: an `<h2>`). */
  renderTitle: (monthLabel: string) => ReactNode;
  /** The day chip's size in px (default 42). */
  cell?: number;
};

/** The slide-in classes of the month grid: the wrapper renders this once in a `<style>` (the same string as the week strip's). */
export { SLIDE_CSS as MONTH_SLIDE_CSS } from "./YourWeek";

/** One month of the sheet's cache: its RSVPs (null until the read answers) and the read's failure. */
type MonthSlot = { entries: WeekEntry[] | null; failure: LoadFailure | null };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const monthKey = (m: MonthRef) => `${m.year}-${m.month}`;
const FAILURE_LINE = "Couldn't load your calendar.";

export function MonthBody({ initialDay, now, night, onPicked, onOpenRoom, renderTitle, cell = 42 }: MonthBodyProps) {
  const t = palette(night);
  // One glow per screen (3.2): only the phone's sheet lights a live day's dot.
  const glow = useChatSurface() === "phone";
  const bounds = monthBounds(now);
  const [picked, setPicked] = useState(() => startOfLocalDay(initialDay));
  // The month on screen, and the way the last move went (for the slide-in).
  const [at, setAt] = useState<{ month: MonthRef; slide: -1 | 0 | 1 }>(() => ({ month: clampMonth(monthOf(initialDay), monthBounds(now)), slide: 0 }));
  const [months, setMonths] = useState<Record<string, MonthSlot>>({});
  const seqRef = useRef(new Map<string, number>());
  // Every pick is told to the wrapper as it is made (its close hands the last one on).
  const pick = (day: Date) => {
    setPicked(day);
    onPicked(day);
  };

  const { year, month } = at.month;
  const key = monthKey(at.month);
  const grid = monthGrid(year, month);

  const readMonth = useCallback(async (m: MonthRef) => {
    const k = monthKey(m);
    const seq = (seqRef.current.get(k) ?? 0) + 1;
    seqRef.current.set(k, seq);
    const g = monthGrid(m.year, m.month);
    const res = await vibeRequest<unknown>(calendarUrl(g.from, g.to), { cache: "no-store", quiet: true, failure: FAILURE_LINE });
    if (seqRef.current.get(k) !== seq) return;
    const entries = res.ok ? rsvpEntries(res.data) : null;
    setMonths((prev) => ({ ...prev, [k]: entries ? { entries, failure: null } : { entries: null, failure: asLoadFailure(res, FAILURE_LINE) } }));
  }, []);

  // The month on screen is read once (the answer is kept while the sheet is open).
  useEffect(() => {
    const run = async () => {
      if (!seqRef.current.has(monthKey({ year, month }))) await readMonth({ year, month });
    };
    void run();
  }, [year, month, readMonth]);

  const go = (delta: 1 | -1) => {
    setAt((prev) => {
      const next = clampMonth(addMonths(prev.month, delta), bounds);
      return compareMonths(next, prev.month) === 0 ? prev : { month: next, slide: delta };
    });
  };
  const goToday = () => {
    const today = monthOf(now);
    pick(startOfLocalDay(now));
    setAt((prev) => {
      const way = compareMonths(today, prev.month);
      return way === 0 ? prev : { month: today, slide: way > 0 ? 1 : -1 };
    });
  };
  const swipe = useSwipe((direction) => go(direction === "left" ? 1 : -1));

  const slot = months[key];
  const canBack = compareMonths(at.month, bounds.min) > 0;
  const canForward = compareMonths(at.month, bounds.max) < 0;
  // The picked day's plans come from ITS month's read (the month on screen may have moved on).
  const pickedMonth = monthOf(picked);
  const pickedSlot = months[monthKey(pickedMonth)];
  const rows = pickedSlot?.entries ? planRows(picked, pickedSlot.entries) : null;
  // The failure line: the month on screen first (its dots are missing), else the picked day's month.
  const failedMonth = slot?.failure ? at.month : pickedSlot?.failure ? pickedMonth : null;
  const failure = failedMonth ? (months[monthKey(failedMonth)]?.failure ?? null) : null;
  const caption = rows ? dayCaption(picked, now, rows.length) : (dayWhen(picked, now) ?? "");
  // Retry: the failed month back to its loading state, and its read again.
  const retry = () => {
    if (!failedMonth) return;
    const k = monthKey(failedMonth);
    setMonths((prev) => {
      const next = { ...prev };
      delete next[k];
      return next;
    });
    void readMonth(failedMonth);
  };

  return (
    <>
      <MonthHeader title={renderTitle(`${grid.name} ${grid.year}`)} now={now} t={t} canBack={canBack} canForward={canForward} before={monthName(month - 1)} after={monthName(month + 1)} onToday={goToday} onGo={go} />

      <div aria-hidden="true" style={{ marginTop: 6, flexShrink: 0, boxSizing: "border-box", padding: "0 12px", display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", fontSize: 10.5, fontWeight: 600, lineHeight: "12px", color: t.muted, textAlign: "center" }}>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {/* The swipe area: the grid (left = the next month). `data-vaul-no-drag`: a
          sideways swipe that starts a little downward would otherwise also drag
          the sheet (and a fast one would close it); the sheet still drags from
          the handle, the header and everything under the grid. */}
      <div {...swipe} data-vaul-no-drag="" role="group" aria-label={`${grid.name} ${grid.year}, days with your RSVPs marked`} style={{ marginTop: 4, flexShrink: 0, boxSizing: "border-box", padding: "0 12px", overflow: "hidden", touchAction: "pan-y" }}>
        <div key={key} className={slideClass(at.slide)} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: 2 }}>
          {grid.cells.map((day, i) => {
            if (!day) return <span key={`blank-${i}`} aria-hidden="true" />;
            const onDay = slot?.entries ? entriesOn(day, slot.entries) : [];
            const dot = dayDot(onDay);
            const today = isSameLocalDay(now, day);
            const selected = isSameLocalDay(picked, day);
            const live = onDay.some((e) => e.room_state === "live");
            return (
              <button
                key={day.getTime()}
                type="button"
                aria-pressed={selected}
                aria-current={today ? "date" : undefined}
                aria-label={monthDayLabel(day, onDay, { today, selected })}
                onClick={() => pick(day)}
                style={{ height: cell + 4, padding: 0, border: "none", background: "transparent", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
              >
                <span style={{ width: cell, height: cell, boxSizing: "border-box", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, background: selected ? "rgba(var(--scrim-rgb),0.12)" : "transparent", boxShadow: today ? `inset 0 0 0 2px ${t.coral}` : "none" }}>
                  <span style={{ fontSize: 15, fontWeight: today || selected ? 800 : 700, lineHeight: "16px", color: !selected && isPastDay(day, now) ? t.muted : t.ink }}>{day.getDate()}</span>
                  {/* The calendar key (Oct 19, 2026 repair): a coral ring for Interested. */}
                  <RsvpDayMark kind={dot} coral={t.coral} glow={live && glow ? `0 0 6px ${t.coral}` : undefined} />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div aria-hidden="true" style={{ margin: "10px 16px 0", height: 1, flexShrink: 0, background: t.hairline }} />

      <div aria-live="polite" aria-atomic="true" style={{ flexShrink: 0, boxSizing: "border-box", padding: "12px 16px 0", display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 17, lineHeight: "20px", letterSpacing: "-0.2px" }}>{dayHeading(picked)}</h3>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, lineHeight: 1, color: t.muted }}>{failure ? "" : caption}</span>
      </div>

      <DayPlans rows={rows} failure={failure} onRetry={retry} night={night} t={t} onOpenRoom={onOpenRoom} />

      <p style={{ margin: "auto 16px 0", paddingTop: 10, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, lineHeight: "16px", color: t.muted }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M8 3v4M16 3v4M8.5 14l2.5 2.5 4.5-5" />
        </svg>
        Only events you RSVP&apos;d to
      </p>
    </>
  );
}

/** `October` `2026`, the `Today` pill, the two month chevrons (R3_Month:98-103). The title is the dialog's name and says the month when it changes; the wrapper draws it (`renderTitle`). */
function MonthHeader({
  title,
  now,
  t,
  canBack,
  canForward,
  before,
  after,
  onToday,
  onGo,
}: {
  /** The wrapper's title element for the month on screen. */
  title: ReactNode;
  now: Date;
  t: Palette;
  canBack: boolean;
  canForward: boolean;
  /** The month before / after the one on screen (`September`, `November`), for the chevrons' labels. */
  before: string;
  after: string;
  onToday: () => void;
  onGo: (delta: 1 | -1) => void;
}) {
  const chevron = (label: string, enabled: boolean, delta: 1 | -1) => (
    <button
      type="button"
      aria-label={label}
      aria-disabled={!enabled || undefined}
      onClick={() => {
        if (enabled) onGo(delta);
      }}
      style={{ width: 44, height: 44, flexShrink: 0, padding: 0, border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.4, WebkitTapHighlightColor: "transparent" }}
    >
      <span style={{ width: 34, height: 34, boxSizing: "border-box", borderRadius: 999, border: `1px solid ${t.fieldBorder}`, background: "rgba(var(--scrim-rgb),0.04)", color: t.secondary, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={delta === -1 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
        </svg>
      </span>
    </button>
  );
  return (
    <div style={{ height: 44, flexShrink: 0, boxSizing: "border-box", padding: "0 6px 0 16px", display: "flex", alignItems: "center" }}>
      {title}
      <button
        type="button"
        onClick={onToday}
        aria-label={`Jump to today, ${spokenDay(now)}`}
        style={{ height: 44, flexShrink: 0, padding: "0 4px", border: "none", background: "transparent", display: "flex", alignItems: "center", cursor: "pointer", fontFamily: "inherit", WebkitTapHighlightColor: "transparent" }}
      >
        <span style={{ height: 30, boxSizing: "border-box", padding: "0 13px", borderRadius: 999, border: `1px solid ${t.chipBorder}`, color: t.secondary, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center" }}>Today</span>
      </button>
      {chevron(`Previous month, ${before}`, canBack, -1)}
      {chevron(`Next month, ${after}`, canForward, 1)}
    </div>
  );
}

/**
 * The picked day's plans (R3_Month:151-158), or its three other states: the
 * read's failure line with Retry, one placeholder row while the read is
 * out, `Nothing planned.` with the `Find events` link.
 */
function DayPlans({
  rows,
  failure,
  onRetry,
  night,
  t,
  onOpenRoom,
}: {
  /** Null while the month's read is out. */
  rows: PlanRow[] | null;
  failure: LoadFailure | null;
  onRetry: () => void;
  night: boolean;
  t: Palette;
  onOpenRoom: (entry: WeekEntry) => void;
}) {
  if (failure) {
    return (
      <div style={{ margin: "8px 12px 0", flexShrink: 0 }}>
        <LoadFailed failure={failure} compact tone={night ? "dark" : "light"} onRetry={onRetry} />
      </div>
    );
  }
  if (rows === null) {
    return <div aria-hidden="true" style={{ margin: "8px 12px 0", height: 66, flexShrink: 0, borderRadius: 18, background: "rgba(var(--scrim-rgb),0.06)" }} />;
  }
  if (rows.length === 0) {
    return (
      <div style={{ marginTop: 4, height: 44, flexShrink: 0, boxSizing: "border-box", padding: "0 6px 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: t.secondary, whiteSpace: "nowrap" }}>Nothing planned.</p>
        <Link
          href="/campus?tab=events"
          style={{ marginLeft: "auto", height: 44, flexShrink: 0, boxSizing: "border-box", padding: "0 10px", display: "flex", alignItems: "center", gap: 3, textDecoration: "none", color: t.coralText, fontSize: 13.5, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap" }}
        >
          Find events
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    );
  }
  const rowStyle: React.CSSProperties = {
    margin: "8px 12px 0",
    height: 66,
    flexShrink: 0,
    boxSizing: "border-box",
    padding: "8px 10px 8px 14px",
    borderRadius: 18,
    border: `1px solid ${t.quietCard.border}`,
    background: "rgba(var(--scrim-rgb),0.035)",
    boxShadow: t.quietCard.shadow,
    display: "flex",
    alignItems: "center",
    gap: 12,
    textAlign: "left",
    fontFamily: "inherit",
    color: t.ink,
    WebkitTapHighlightColor: "transparent",
  };
  return (
    <>
      {rows.map((row) => {
        const e = row.entry;
        const body = (
          <>
            <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16.5, lineHeight: "19px", letterSpacing: "-0.3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 500, lineHeight: "16px", color: t.muted, whiteSpace: "nowrap", overflow: "hidden" }}>
                {row.club ? <span aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 999, background: clubGradient(e.org_id ?? e.org?.handle ?? row.club) }} /> : null}
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{row.line}</span>
              </span>
            </span>
            {e.viewer_status === "going" ? (
              <span style={{ flexShrink: 0, height: 28, boxSizing: "border-box", padding: "0 10px 0 9px", borderRadius: 999, border: "1px solid rgba(255,92,53,0.38)", background: "rgba(255,92,53,0.16)", color: t.coralMark, fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <CheckIcon size={12} />
                Going
              </span>
            ) : (
              // A coral outline with ink words (the calendar key, Oct 19, 2026
              // repair); Going above is the filled coral pill.
              <span style={{ flexShrink: 0, height: 28, boxSizing: "border-box", padding: "0 10px 0 9px", borderRadius: 999, border: `1.5px solid ${t.coral}`, background: "var(--tag-bg)", color: t.ink, fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <InterestedRing coral={t.coral} />
                Interested
              </span>
            )}
          </>
        );
        if (e.room_id) {
          return (
            <button key={e.id} type="button" aria-label={row.label} onClick={() => onOpenRoom(e)} style={{ ...rowStyle, cursor: "pointer" }}>
              {body}
            </button>
          );
        }
        // No chat to open (Oct 19, 2026, critique D13): the row opens the
        // club's page, scrolled to this event.
        if (e.org) {
          return (
            <Link key={e.id} href={clubEventHref(e.org.handle, e.id)} aria-label={`${row.label}. Open the club page`} style={{ ...rowStyle, textDecoration: "none" }}>
              {body}
            </Link>
          );
        }
        return (
          <div key={e.id} role="group" aria-label={row.label} style={rowStyle}>
            {body}
          </div>
        );
      })}
    </>
  );
}
