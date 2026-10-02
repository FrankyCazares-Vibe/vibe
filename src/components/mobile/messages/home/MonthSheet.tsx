"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";
import { useLayerHistory } from "@/lib/chat/use-layer-history";
import { addMonths, clampMonth, compareMonths, isSameLocalDay, isTap, monthBounds, monthGrid, monthName, monthOf, type MonthRef, startOfLocalDay } from "@/lib/chat/week";
import { vibeRequest } from "@/lib/feedback/request";

import { clubGradient } from "../avatar";
import { vaulContentStyle, vaulOverlayStyle } from "../sheet-styles";
import { FONT, palette, type Palette, SERIF } from "../v2-tokens";

import { CheckIcon } from "./ClubRow";
import { calendarUrl, dayCaption, dayDot, dayHeading, dayWhen, entriesOn, isPastDay, monthDayLabel, type PlanRow, planRows, rsvpEntries, sheetReturnFocus, spokenDay, type WeekEntry } from "./home-rules";
import { SLIDE_CSS, slideClass, useSwipe } from "./YourWeek";

/**
 * The month sheet of the Messages home (S71 amendment 4, section 2; mockup
 * R3_Month): the month of your RSVPs, opened by the week's title (on today,
 * or on the Monday of the week on screen) or by a day of the strip (on that
 * day).
 *
 * - The app's bottom sheet, as `CardSheet` / `RsvpSheet`: vaul, the scrim,
 *   the 40×5 handle (here a Close button), `var(--paper)`, radius 28. A plain `Drawer.Root`: the
 *   home is not inside a drawer (`NestedRoot` throws without one). It calls
 *   `useHideTabBar()` (the tab bar is above every sheet) and owns one history
 *   entry (`useLayerHistory`): Back closes the sheet and nothing else.
 * - A fixed height (580px, at most 88dvh), the content scrolling inside: a
 *   bottom sheet that hugged its content would move the grid under the
 *   finger whenever the picked day has more or fewer plans.
 * - Top to bottom: `October` `2026`, the `Today` pill, the two month
 *   chevrons; `Mon … Sun`; the grid (a dot under a day with plans — coral
 *   when any is Going, grey for Maybe only, `dayDot`; today's coral ring; the
 *   picked day filled; other months' days blank; past days dim); the picked
 *   day (`Fri, Oct 9`, `Tomorrow · 1 plan`) and its plans by start; the
 *   line `Only events you RSVP'd to`.
 * - The grid swipes month to month (the week strip's rule, `useSwipe`) and
 *   the chevrons do the same, between the months of `monthBounds(now)`.
 *   Moving the month keeps the picked day. The grid is `data-vaul-no-drag`,
 *   so a swipe never drags the sheet; the rest of the sheet still does.
 * - One calendar read per month on screen (the grid's first Monday 00:00 to
 *   its last Sunday 23:59:59.999), kept by month while the sheet is open.
 *   While it is out the grid draws without dots; a failure shows
 *   `Couldn't load your calendar.` with Retry in the day's place.
 * - A plan whose entry has a `room_id` is a button: `onOpenRoom(entry)`. The
 *   shell opens the room through the history layer, which closes this sheet
 *   on the way (`onPop`) and gives the sheet's history entry to the room —
 *   so the sheet is never stepped back off and then pushed over
 *   (`MessagesMobile.openView`, `layer-stack.ts`).
 * - `onClose(picked)` on every way out (the handle, the scrim, the drag,
 *   Escape, Back, a plan): the home moves the strip to that day's week.
 * - The handle is a real button (`CloseHandle`, R3_Month:160): vaul's own
 *   `Drawer.Handle` is an `aria-hidden` div that does nothing on a tap, and
 *   the scrim is hidden from assistive tech, so without it a screen reader
 *   or a switch had no way out but Escape and Back.
 * - Focus on close is the sheet's own (`sheetReturnFocus`): the control that
 *   opened it, else the week's title, nothing when an event chat is opening.
 */
export type MonthSheetProps = {
  /** The day picked when the sheet opens. */
  initialDay: Date;
  /** The control that opened the sheet (a day of the strip, the week's title): focus returns to it on close. */
  opener: HTMLElement | null;
  now: Date;
  night: boolean;
  /** The sheet closed; `picked` is the day selected at that moment. */
  onClose: (picked: Date) => void;
  /** A plan with a room: the shell opens its event chat (and closes this sheet). */
  onOpenRoom: (entry: WeekEntry) => void;
  /** Where focus goes when the sheet closes and `opener` is gone (the strip moved to another week): the week's title. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

/** One month of the sheet's cache: its RSVPs (null until the read answers) and the read's failure. */
type MonthSlot = { entries: WeekEntry[] | null; failure: LoadFailure | null };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const monthKey = (m: MonthRef) => `${m.year}-${m.month}`;
const FAILURE_LINE = "Couldn't load your calendar.";

export function MonthSheet({ initialDay, opener, now, night, onClose, onOpenRoom, returnFocusTo }: MonthSheetProps) {
  useHideTabBar();
  const t = palette(night);
  const bounds = monthBounds(now);
  const [picked, setPicked] = useState(() => startOfLocalDay(initialDay));
  // The month on screen, and the way the last move went (for the slide-in).
  const [at, setAt] = useState<{ month: MonthRef; slide: -1 | 0 | 1 }>(() => ({ month: clampMonth(monthOf(initialDay), monthBounds(now)), slide: 0 }));
  const [months, setMonths] = useState<Record<string, MonthSlot>>({});
  const seqRef = useRef(new Map<string, number>());
  const pickedRef = useRef<HTMLButtonElement | null>(null);
  // True from the press of a plan row: the sheet is closing because its event chat is opening.
  const openingRoomRef = useRef(false);

  const close = () => onClose(picked);
  // The user's own ways out (the handle, the scrim, a drag, Escape): never a room opening.
  const closeByHand = () => {
    openingRoomRef.current = false;
    close();
  };
  const openRoom = (entry: WeekEntry) => {
    openingRoomRef.current = true;
    onOpenRoom(entry);
  };
  // Its own history entry while it is on screen (it is mounted only then).
  useLayerHistory(true, close);

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
    setPicked(startOfLocalDay(now));
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
    <Drawer.Root
      open
      onOpenChange={(open) => {
        if (!open) closeByHand();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, background: t.scrim }} />
        <Drawer.Content
          style={{
            ...vaulContentStyle,
            background: t.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderTop: `1px solid ${t.fieldBorder}`,
            boxShadow: night ? "0 -18px 44px rgba(0,0,0,0.6)" : "0 -18px 44px rgba(20,20,22,0.18)",
            height: 580,
            maxHeight: "88dvh",
            display: "flex",
            flexDirection: "column",
            fontFamily: FONT,
            color: t.ink,
          }}
          aria-modal="true"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Focus lands on the picked day, not on the first control.
            if (!pickedRef.current) return;
            e.preventDefault();
            pickedRef.current.focus();
          }}
          onCloseAutoFocus={(e) => {
            // Always the sheet's own answer. Left alone, Radix's modal handler
            // runs: it prevents the default (the focus scope's restore) and
            // focuses its trigger, and this sheet has none, so focus would
            // fall to <body>.
            e.preventDefault();
            sheetReturnFocus(opener, returnFocusTo?.current ?? null, openingRoomRef.current)?.focus({ preventScroll: true });
          }}
        >
          <style>{SLIDE_CSS}</style>
          <CloseHandle onClose={closeByHand} />
          <div style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch", boxSizing: "border-box", paddingBottom: 14, display: "flex", flexDirection: "column" }}>
            <MonthHeader name={grid.name} year={grid.year} now={now} t={t} canBack={canBack} canForward={canForward} before={monthName(month - 1)} after={monthName(month + 1)} onToday={goToday} onGo={go} />

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
                      ref={selected ? pickedRef : undefined}
                      type="button"
                      aria-pressed={selected}
                      aria-current={today ? "date" : undefined}
                      aria-label={monthDayLabel(day, onDay, { today, selected })}
                      onClick={() => setPicked(day)}
                      style={{ height: 46, padding: 0, border: "none", background: "transparent", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
                    >
                      <span style={{ width: 42, height: 42, boxSizing: "border-box", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, background: selected ? "rgba(var(--scrim-rgb),0.12)" : "transparent", boxShadow: today ? `inset 0 0 0 2px ${t.coral}` : "none" }}>
                        <span style={{ fontSize: 15, fontWeight: today || selected ? 800 : 700, lineHeight: "16px", color: !selected && isPastDay(day, now) ? t.muted : t.ink }}>{day.getDate()}</span>
                        <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 999, background: dot === "going" ? t.coral : dot === "maybe" ? t.muted : "transparent", boxShadow: live ? `0 0 6px ${t.coral}` : "none" }} />
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

            <DayPlans rows={rows} failure={failure} onRetry={retry} night={night} t={t} onOpenRoom={openRoom} />

            <p style={{ margin: "auto 16px 0", paddingTop: 10, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, lineHeight: "16px", color: t.muted }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <path d="M8 3v4M16 3v4M8.5 14l2.5 2.5 4.5-5" />
              </svg>
              Only events you RSVP&apos;d to
            </p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * The sheet's handle as a button (R3_Month:160, `Close the calendar, back to
 * your week`): the same 40×5 bar, 8px under the sheet's top edge, inside an
 * 88×44 target. The target takes the handle's 20px of the sheet and reaches
 * 24px above the sheet's edge, over the scrim (a tap there closes the sheet
 * anyway), so it covers nothing of the header under it.
 *
 * The sheet is still dragged from here (vaul's drag starts on any part of
 * the content). A drag that lets go without closing ends, with a mouse, in a
 * click on this button: that click is not a press (`isTap`), as `useSwipe`
 * does for a swipe. A keyboard or a screen reader press has no drag before it.
 */
function CloseHandle({ onClose }: { onClose: () => void }) {
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const draggedAtRef = useRef(Number.NEGATIVE_INFINITY);
  return (
    <button
      type="button"
      aria-label="Close the calendar, back to your week"
      onPointerDown={(e) => {
        downRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const down = downRef.current;
        downRef.current = null;
        if (down && !isTap(e.clientX - down.x, e.clientY - down.y)) draggedAtRef.current = e.timeStamp;
      }}
      onPointerCancel={() => {
        downRef.current = null;
      }}
      onClick={(e) => {
        if (e.timeStamp - draggedAtRef.current < 400) return;
        onClose();
      }}
      style={{ position: "relative", alignSelf: "center", flexShrink: 0, width: 88, height: 44, marginTop: -24, padding: 0, border: "none", borderRadius: 14, background: "transparent", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
    >
      {/* The bar as `Drawer.Handle` draws it in `CardSheet` / `RsvpSheet` (vaul's own sheet gives its handle `opacity: .7`). */}
      <span aria-hidden="true" style={{ position: "absolute", left: 24, bottom: 7, width: 40, height: 5, borderRadius: 999, background: "rgba(var(--scrim-rgb),0.24)", opacity: 0.7 }} />
    </button>
  );
}

/** `October` `2026`, the `Today` pill, the two month chevrons (R3_Month:98-103). The title is the dialog's name and says the month when it changes. */
function MonthHeader({
  name,
  year,
  now,
  t,
  canBack,
  canForward,
  before,
  after,
  onToday,
  onGo,
}: {
  name: string;
  year: number;
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
      <Drawer.Title aria-live="polite" aria-atomic="true" style={{ margin: 0, marginRight: "auto", minWidth: 0, display: "flex", alignItems: "baseline", gap: 7, fontFamily: SERIF, fontWeight: 800, fontSize: 26, lineHeight: 1, letterSpacing: "-0.6px", whiteSpace: "nowrap" }}>
        {name}
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, letterSpacing: 0, color: t.muted }}>{year}</span>
      </Drawer.Title>
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
              <span style={{ flexShrink: 0, height: 28, boxSizing: "border-box", padding: "0 10px 0 9px", borderRadius: 999, border: `1px solid ${t.chipBorder}`, background: "rgba(var(--scrim-rgb),0.06)", color: t.secondary, fontSize: 12.5, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: t.muted }} />
                Maybe
              </span>
            )}
          </>
        );
        return e.room_id ? (
          <button key={e.id} type="button" aria-label={row.label} onClick={() => onOpenRoom(e)} style={{ ...rowStyle, cursor: "pointer" }}>
            {body}
          </button>
        ) : (
          <div key={e.id} role="group" aria-label={row.label} style={rowStyle}>
            {body}
          </div>
        );
      })}
    </>
  );
}
