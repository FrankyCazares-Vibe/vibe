"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";

import { LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { clubEventHref } from "@/lib/calendar/calendar-key";
import {
  isSameLocalDay,
  swipeDirection,
  WEEK_MAX_OFFSET,
  WEEK_MIN_OFFSET,
  type WeekRange,
  weekDays,
  weekRangeAt,
  weekSpoken,
  weekTitle,
  weekWord,
} from "@/lib/chat/week";

import { clubGradient } from "../avatar";
import { visuallyHiddenStyle } from "../sheet-styles";
import { useNightTheme } from "../theme";
import { FONT, palette, type Palette, SERIF } from "../v2-tokens";

import { CheckIcon } from "./ClubRow";
import { dayDot, dayLabel, entriesOn, isPastDay, weekCardLabel, weekCardLine, type WeekEntry } from "./home-rules";
import { InterestedRing, RsvpDayMark } from "./RsvpMark";

/**
 * The slide-in of a week (or of a month in `MonthSheet`) that a swipe or a
 * step brought on screen: 220ms, from the side it came from. None with
 * `prefers-reduced-motion`. Rendered as a `<style>` by both components.
 */
export const SLIDE_CSS = `
@keyframes vibe-week-in-next { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes vibe-week-in-prev { from { transform: translateX(-28px); opacity: 0; } to { transform: none; opacity: 1; } }
.vibe-week-in-next { animation: vibe-week-in-next 220ms cubic-bezier(0.22, 1, 0.36, 1); }
.vibe-week-in-prev { animation: vibe-week-in-prev 220ms cubic-bezier(0.22, 1, 0.36, 1); }
@media (prefers-reduced-motion: reduce) { .vibe-week-in-next, .vibe-week-in-prev { animation: none; } }
`;

/** The class of `SLIDE_CSS` for the way the last move went (+1 = later); none before any move. */
export function slideClass(slide: -1 | 0 | 1): string | undefined {
  return slide === 1 ? "vibe-week-in-next" : slide === -1 ? "vibe-week-in-prev" : undefined;
}

/**
 * A horizontal swipe over an element (S71 amendment 4): spread `handlers` on
 * it and give it `touchAction: "pan-y"`, so the browser keeps the vertical
 * scroll (it cancels the pointer when it takes one) and hands the sideways
 * moves here. `swipeDirection` decides on release (40px, 1.5× the vertical
 * move); nothing is prevented, so a tap stays a tap. A mouse drag ends with
 * a click on the element it started on: that one click is swallowed, so a
 * swipe never also presses the day under it (a touch swipe makes no click).
 */
export function useSwipe(onSwipe: (direction: "left" | "right") => void) {
  const startRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const swipedAtRef = useRef(Number.NEGATIVE_INFINITY);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      // One finger (or the main mouse button) only.
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) {
        startRef.current = null;
        return;
      }
      startRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const start = startRef.current;
      startRef.current = null;
      if (!start || start.id !== e.pointerId) return;
      const direction = swipeDirection(e.clientX - start.x, e.clientY - start.y);
      if (!direction) return;
      swipedAtRef.current = e.timeStamp;
      onSwipe(direction);
    },
    onPointerCancel: () => {
      startRef.current = null;
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (e.timeStamp - swipedAtRef.current < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}

/** The mockup's edge chevrons (R3_NextWeek:29-30) are drawn away from the current week only; true shows them at rest too (S71 walk: at rest nothing else says the strip swipes). */
const EDGE_HINTS_AT_REST = true;

/**
 * "Your week" (handoffs/chat-redesign/wave-2-contracts.md 11.2, 1.2, 11.9.1;
 * W2-S1) — W0_Home top, W0_EmptyWeek; S71 amendment 4 — R3_NextWeek. The
 * calendar's `rsvp` entries between Monday and Sunday of the week on screen
 * (`range`, `offset` weeks from the device's current one): the title row, the
 * seven-day strip, the 142×64 card row sorted by `starts_at` (the live chrome
 * and the bloom only when a live card exists; a link only when `room_id !==
 * null`; `Ended` after), the empty line + `Find events`, the failure line.
 *
 * Amendment 4:
 * - A horizontal swipe on the title row + the day strip moves one week
 *   (`useSwipe`; left = the next week). The card row keeps its own scroll:
 *   it is outside the swipe area.
 * - The title is `Your week` / `Next week` / `Last week` / the range, alone
 *   and centred. Away from the current week a `This week` pill sits at the
 *   right end (absolutely placed: the title stays centred).
 * - `Previous week` / `Next week` are two real buttons, visually hidden
 *   until one has keyboard focus (then a 44px quiet chevron at its end of
 *   the row), so the row at rest is the title and nothing else. The title
 *   row is the `aria-live` region: it announces `Next week, October 12 to 18`.
 * - The title and every day open the month sheet (`onOpenMonth`; a day with
 *   that day picked). The old "a day scrolls the card row" is gone. The
 *   button pressed goes along: an iPhone does not focus a button on a tap,
 *   so `document.activeElement` would not name it.
 * - The week that comes on screen slides in from its side (`SLIDE_CSS`;
 *   none with `prefers-reduced-motion`).
 *
 * 150px with cards, 126px empty (MK:1.2, MK:2): 6 + 18 + 2 + 44 + 72 + 8.
 *
 * The bloom (340×118, `top: 54`) is centred on the LIVE card wherever the
 * sort puts it and follows the row's scroll (the mockup's `left: -92` is
 * the first-card case, `W0_Home:22`; VIS-S1-2).
 */
export function YourWeek({
  entries,
  failure,
  onRetry,
  now,
  range,
  offset,
  slide,
  onStep,
  onThisWeek,
  onOpenMonth,
  onOpenRoom,
  titleRef,
}: {
  /** Sorted here; null while the week's first calendar read is out. */
  entries: WeekEntry[] | null;
  failure: LoadFailure | null;
  onRetry: () => void;
  now: Date;
  /** The week on screen. */
  range: WeekRange;
  /** Weeks from the device's current week (0 = this week; −4 … +26). */
  offset: number;
  /** The way the last change of week went (+1 = to a later week; 0 before any). */
  slide: -1 | 0 | 1;
  onStep: (delta: 1 | -1) => void;
  onThisWeek: () => void;
  /** The month sheet: with a day of the strip picked, or `null` from the title. `opener` is the button pressed (focus returns to it when the sheet closes). */
  onOpenMonth: (day: Date | null, opener: HTMLElement) => void;
  /** A card with `room_id` set: the club space on its Lounge with the event chat layer on top (2.3). */
  onOpenRoom: (entry: WeekEntry) => void;
  /** The title's button: where focus goes when the month sheet closes and its opener is gone. */
  titleRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const night = useNightTheme();
  const t = palette(night);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const days = weekDays(range.start);
  const sorted = entries ? [...entries].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()) : null;
  const liveId = sorted?.find((e) => e.room_state === "live")?.id ?? null;
  const weekKey = range.start.getTime();
  const title = weekTitle(offset, range);
  const spoken = weekSpoken(offset, range);
  const sliding = slideClass(slide);
  const canBack = offset > WEEK_MIN_OFFSET;
  const canForward = offset < WEEK_MAX_OFFSET;
  const swipe = useSwipe((direction) => onStep(direction === "left" ? 1 : -1));
  // The bloom's left edge: the live card's centre − 170, less the row's
  // scroll. Measured after layout, on the row's scroll, once the fonts are in
  // (the cards size to their first line, VIS-S1-1) and whenever the cards change.
  const [bloomLeft, setBloomLeft] = useState<number | null>(null);
  const cardKey = sorted?.map((e) => e.id).join("|") ?? "";
  useLayoutEffect(() => {
    const row = rowRef.current;
    const place = () => {
      const el = liveId ? cardRefs.current.get(liveId) : undefined;
      setBloomLeft(row && el ? Math.round(el.offsetLeft + el.offsetWidth / 2 - 170 - row.scrollLeft) : null);
    };
    place();
    let on = true;
    void document.fonts?.ready.then(() => {
      if (on) place();
    });
    row?.addEventListener("scroll", place, { passive: true });
    return () => {
      on = false;
      row?.removeEventListener("scroll", place);
    };
  }, [liveId, cardKey, weekKey]);

  // `overflowX: "clip"`: the 340px bloom (absolute, `left` ≈ 69 with a live
  // card) ends past 375, and a mobile browser widens the layout viewport to
  // the document's scroll width, so every fixed layer over the home drew 409
  // wide and the composer's "+" sat off the phone (11.0 "no horizontal
  // scroll"; visual/README.md run 2, VIS-X-1; INT-ADJUDICATE-1). `clip` on the
  // x axis alone keeps the y axis visible (the halo's bottom is not cut). It
  // also holds the 28px of a week sliding in.
  return (
    <section
      aria-labelledby="your-week-heading"
      style={{ flexShrink: 0, position: "relative", isolation: "isolate", boxSizing: "border-box", padding: "6px 0 8px", overflowX: "clip", display: "flex", flexDirection: "column", fontFamily: FONT, color: t.ink }}
    >
      <style>{SLIDE_CSS}</style>
      {liveId && bloomLeft !== null ? (
        <div aria-hidden="true" style={{ position: "absolute", zIndex: -1, left: bloomLeft, top: 54, width: 340, height: 118, pointerEvents: "none", background: t.bloom }} />
      ) : null}

      {/* The swipe area: the title row and the day strip (never the card row,
          which scrolls sideways itself). The empty line and the loading row
          below take the same handlers: an empty week has no cards to scroll,
          and a thumb lands there as often as on the days (S71 walk). */}
      <div {...swipe} style={{ touchAction: "pan-y" }}>
        {/* The title alone, centred (Franky, S71: the "Sep 28 – Oct 4 · your RSVPs"
            caption made the top feel cluttered). The dates are still spoken: the
            hidden half of the title and the day strip's label carry them. */}
        <div style={{ position: "relative", height: 18, boxSizing: "border-box", padding: "0 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <StepButton label="Previous week" back disabled={!canBack} onPress={() => onStep(-1)} t={t} shown={{ position: "absolute", left: 4, top: -13 }} />
          <div aria-live="polite" aria-atomic="true" style={{ display: "flex", alignItems: "center" }}>
            <h2 id="your-week-heading" style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: 1, letterSpacing: "-0.2px", color: t.ink }}>
              {/* A 44px box around the 16px title. The day strip below is drawn over
                  the part that reaches into it, so a day keeps its whole target. */}
              <button
                ref={titleRef}
                type="button"
                aria-haspopup="dialog"
                onClick={(e) => onOpenMonth(null, e.currentTarget)}
                style={{ display: "block", margin: "-14px -12px", padding: "14px 12px", border: "none", background: "transparent", color: "inherit", font: "inherit", letterSpacing: "inherit", lineHeight: 1, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
              >
                <span aria-hidden="true">{title}</span>
                <span style={visuallyHiddenStyle}>{spoken}</span>
              </button>
            </h2>
          </div>
          {/* Centred on the title (−10 + 19 = the row's middle) and clear of the header's compose button above. */}
          <div style={{ position: "absolute", right: 12, top: -10, height: 38, display: "flex", alignItems: "center" }}>
            <StepButton label="Next week" disabled={!canForward} onPress={() => onStep(1)} t={t} shown={{ marginRight: 2 }} />
            {offset !== 0 ? (
              <button
                type="button"
                onClick={onThisWeek}
                aria-label={`Back to this week, ${weekRangeAt(now, 0).spoken}`}
                style={{ height: 38, minWidth: 44, padding: 0, border: "none", background: "transparent", color: t.ink, fontFamily: "inherit", display: "flex", alignItems: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
              >
                <span style={{ height: 22, boxSizing: "border-box", padding: "0 8px 0 5px", borderRadius: 999, border: "1px solid rgba(var(--scrim-rgb),0.14)", background: "rgba(var(--scrim-rgb),0.08)", fontSize: 11, fontWeight: 700, lineHeight: 1, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 5l-7 7 7 7" />
                  </svg>
                  This week
                </span>
              </button>
            ) : null}
          </div>
        </div>

        <nav aria-label={spoken} style={{ position: "relative", marginTop: 2, height: 44, boxSizing: "border-box", padding: "0 12px" }}>
          {(offset !== 0 || EDGE_HINTS_AT_REST) && canBack ? (
            <svg aria-hidden="true" width="7" height="12" viewBox="0 0 7 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 3, top: 16, color: t.muted }}>
              <path d="M5.5 1L1.5 6l4 5" />
            </svg>
          ) : null}
          {(offset !== 0 || EDGE_HINTS_AT_REST) && canForward ? (
            <svg aria-hidden="true" width="7" height="12" viewBox="0 0 7 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: 3, top: 16, color: t.muted }}>
              <path d="M1.5 1l4 5-4 5" />
            </svg>
          ) : null}
          <div key={weekKey} className={sliding} style={{ height: 44, display: "flex", justifyContent: "space-between" }}>
            {days.map((day) => {
              const onDay = sorted ? entriesOn(day, sorted) : [];
              const dot = dayDot(onDay);
              const today = isSameLocalDay(now, day);
              const past = isPastDay(day, now);
              return (
                <button
                  key={day.getTime()}
                  type="button"
                  aria-current={today ? "date" : undefined}
                  aria-haspopup="dialog"
                  aria-label={dayLabel(day, onDay, today)}
                  onClick={(e) => onOpenMonth(day, e.currentTarget)}
                  style={{
                    width: 44,
                    height: 44,
                    padding: 0,
                    borderRadius: 14,
                    border: "none",
                    background: today ? t.activeChip.bg : "transparent",
                    boxShadow: today ? (night ? "0 6px 16px rgba(0,0,0,0.45)" : "0 6px 16px rgba(20,20,22,0.18)") : "none",
                    fontFamily: "inherit",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 2,
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: today ? 700 : 600,
                      lineHeight: "12px",
                      // Today's weekday on the inverted chip: the mockup's #4A4541
                      // on #F6F1EA (Night); Light's chip is #141416, so cream at .80.
                      color: today ? (night ? "#4A4541" : "rgba(250,247,242,0.80)") : past ? t.muted : t.secondary,
                    }}
                  >
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day.getDay()]}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: today ? 800 : 700, lineHeight: "16px", color: today ? t.activeChip.ink : past ? t.muted : t.ink }}>
                    {day.getDate()}
                  </span>
                  {/* The calendar key (Oct 19, 2026 repair): a coral ring for Interested. */}
                  <RsvpDayMark kind={dot} coral={t.coral} />
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {failure ? (
        <div key={weekKey} className={sliding} style={{ margin: "0 0 -10px", boxSizing: "border-box", padding: "8px 16px 10px", minHeight: 82 }}>
          <LoadFailed failure={failure} compact tone={night ? "dark" : "light"} onRetry={onRetry} />
        </div>
      ) : sorted === null ? (
        <div key={weekKey} className={sliding} {...swipe} aria-hidden="true" style={{ margin: "0 0 -10px", boxSizing: "border-box", padding: "8px 16px 10px", display: "flex", gap: 8, overflow: "hidden", touchAction: "pan-y" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 142, height: 64, flexShrink: 0, borderRadius: 18, background: "rgba(var(--scrim-rgb),0.06)" }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div key={weekKey} className={sliding} {...swipe} style={{ marginTop: 4, height: 44, boxSizing: "border-box", padding: "0 6px 0 16px", display: "flex", alignItems: "center", gap: 8, touchAction: "pan-y" }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: t.secondary, whiteSpace: "nowrap" }}>{offset === 0 ? "Nothing on your week yet." : "Nothing that week yet."}</p>
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
      ) : (
        <div
          key={weekKey}
          className={sliding}
          ref={rowRef}
          role="group"
          aria-label={`Event rooms you RSVP'd to ${weekWord(offset, range)}`}
          style={{
            position: "relative",
            margin: "0 0 -10px",
            boxSizing: "border-box",
            padding: "8px 16px 10px",
            display: "flex",
            gap: 8,
            overflowX: "auto",
            overflowY: "hidden",
            scrollbarWidth: "none",
            WebkitMaskImage: "linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%)",
            maskImage: "linear-gradient(90deg, #000 0, #000 calc(100% - 28px), transparent 100%)",
          }}
        >
          {sorted.map((e) => (
            <WeekCard key={e.id} entry={e} now={now} night={night} otherWeek={offset !== 0} onOpenRoom={onOpenRoom} register={(el) => (el ? cardRefs.current.set(e.id, el) : cardRefs.current.delete(e.id))} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * `Previous week` / `Next week` (S71 amendment 4, Accessibility): a real
 * button that draws nothing until it has keyboard focus, then a 44px quiet
 * chevron where `shown` puts it. At the strip's bound it stays in place,
 * `aria-disabled`.
 */
function StepButton({ label, back, disabled, onPress, t, shown }: { label: string; back?: boolean; disabled: boolean; onPress: () => void; t: Palette; shown: React.CSSProperties }) {
  const [focused, setFocused] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onClick={() => {
        if (!disabled) onPress();
      }}
      style={
        focused
          ? { ...shown, zIndex: 1, width: 44, height: 44, flexShrink: 0, boxSizing: "border-box", padding: 0, borderRadius: 999, border: `1px solid ${t.fieldBorder}`, background: t.surface, color: t.secondary, opacity: disabled ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }
          : visuallyHiddenStyle
      }
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={back ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}

/**
 * One 142×64 card (`W0_Home:40-54`): the live chrome on `room_state ===
 * "live"`, the quiet chrome otherwise; line 1 `Live now` / `Ended` /
 * `eventTimeShort` + ` · ` + the RSVP mark (a check for Going, a coral ring
 * for Interested since Oct 19, 2026, the calendar key: shape and word, never
 * colour alone); line 2 the title; line 3
 * the club dot + name (none when `org` is null). A link to the room when
 * `room_id` is set; else, since Oct 19, 2026 (critique D13), a link to the
 * club's page at that event when it has a club; else a plain tile.
 *
 * Width: 142 is the floor, not a fixed size (VIS-S1-1). The mockup's 142 was
 * drawn for `Fri 7 PM · Going`; the pinned `● Live now · ✓ Going` needs ~134px
 * of text at 12px/700 and 142 − 20 leaves 120, so line 1 alone sizes the card
 * between 142 and 184 (`Wed 11:30 PM · ● Interested` → ~184; past that the
 * time is the part that ends in "…"). The title and the
 * club line are `contain: inline-size` so they never widen it and keep their
 * ellipsis; line 1 keeps its own ellipsis as the guard past 184.
 */
function WeekCard({
  entry,
  now,
  night,
  otherWeek,
  onOpenRoom,
  register,
}: {
  entry: WeekEntry;
  now: Date;
  night: boolean;
  /** The strip is on a week other than the current one: the card says the weekday. */
  otherWeek: boolean;
  onOpenRoom: (entry: WeekEntry) => void;
  register: (el: HTMLElement | null) => void;
}) {
  const t = palette(night);
  const line = weekCardLine(entry, now, otherWeek);
  const live = line.kind === "live";
  const chrome = live ? t.liveCard : t.quietCard;
  const label = weekCardLabel(entry, now);
  const style: React.CSSProperties = {
    width: "max-content",
    minWidth: 142,
    maxWidth: 184,
    height: 64,
    flexShrink: 0,
    boxSizing: "border-box",
    padding: "7px 10px",
    borderRadius: 18,
    border: `1px solid ${chrome.border}`,
    background: chrome.bg,
    boxShadow: chrome.shadow,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    textDecoration: "none",
    color: t.ink,
    WebkitTapHighlightColor: "transparent",
  };
  const body = (
    <>
      <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: live ? 700 : 600, lineHeight: "15px", color: live ? t.coralMark : t.secondary, whiteSpace: "nowrap", overflow: "hidden" }}>
        {live ? (
          <span aria-hidden="true" style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 999, background: t.coral, boxShadow: `0 0 0 3px rgba(255,92,53,0.25), 0 0 8px ${t.coral}` }} />
        ) : null}
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{line.text}</span>
        <span aria-hidden="true" style={{ flexShrink: 0, color: t.muted }}>
          ·
        </span>
        {entry.viewer_status === "going" ? (
          // On the tinted live chrome the Going check is the coral MARK (11.0:
          // "the Going check … on a tinted surface"; #C8401E on #FFE9E0 is 4.3:1).
          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 700, color: live ? t.coralMark : t.coralText }}>
            <CheckIcon size={11} />
            Going
          </span>
        ) : (
          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: t.secondary }}>
            <InterestedRing coral={t.coral} />
            Interested
          </span>
        )}
      </span>
      <span style={{ contain: "inline-size", fontFamily: SERIF, fontWeight: 700, fontSize: 15.5, lineHeight: "17px", letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.title}</span>
      {entry.org ? (
        <span style={{ contain: "inline-size", display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, lineHeight: "14px", color: live ? t.secondary : t.muted, whiteSpace: "nowrap", overflow: "hidden" }}>
          <span aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 999, background: clubGradient(entry.org_id ?? entry.org.handle) }} />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{entry.org.name}</span>
        </span>
      ) : (
        <span aria-hidden="true" style={{ height: 14 }} />
      )}
    </>
  );
  if (entry.room_id) {
    const roomId = entry.room_id;
    return (
      <a
        ref={register}
        href={`/messages?channel=${encodeURIComponent(roomId)}`}
        aria-label={label}
        onClick={(e) => {
          // The shell opens the layer in place (a pushState, 2.3); the href
          // stays the room's deep link for a long-press or a copied link.
          e.preventDefault();
          onOpenRoom(entry);
        }}
        style={style}
      >
        {body}
      </a>
    );
  }
  if (entry.org) {
    // No chat to open (Oct 19, 2026, critique D13): the card opens the
    // club's page, scrolled to this event.
    return (
      <Link ref={register} href={clubEventHref(entry.org.handle, entry.id)} aria-label={`${label}. Open the club page`} style={style}>
        {body}
      </Link>
    );
  }
  return (
    <div ref={register} role="group" aria-label={label} style={style}>
      {body}
    </div>
  );
}
