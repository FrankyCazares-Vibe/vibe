"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";

import type { LoadFailure } from "@/components/feedback/LoadFailed";
import { clubEventHref } from "@/lib/calendar/calendar-key";
import { CheckIcon } from "@/components/mobile/messages/home/ClubRow";
import { dayDot, dayLabel, entriesOn, isPastDay, weekCardLabel, weekCardLine, type WeekEntry } from "@/components/mobile/messages/home/home-rules";
import { InterestedRing, RsvpDayMark } from "@/components/mobile/messages/home/RsvpMark";
import { MONTH_SLIDE_CSS } from "@/components/mobile/messages/home/MonthBody";
import { visuallyHiddenStyle } from "@/components/mobile/messages/sheet-styles";
import { FONT, palette, type Palette, SERIF } from "@/components/mobile/messages/v2-tokens";
import { clampWeekOffset, isSameLocalDay, sheetStartDay, startOfLocalDay, WEEK_MAX_OFFSET, WEEK_MIN_OFFSET, weekDays, weekOffsetOf, weekRangeAt, weekSpoken, weekTitle, weekWord } from "@/lib/chat/week";

import type { WeekBandProps } from "./contracts";
import { bandFit } from "./desktop-rules";
import { MonthPopover } from "./MonthPopover";

/**
 * "Your week" on a laptop (wave-3 contract 0.2, 3.2, H6, H7, 6.5; W3-4-week;
 * the pictures D3_Tuck step 0 and step 1): one band across the top of
 * Messages, fed by the shell's ONE `useHomeData` (`data`). Two faces of the
 * same row:
 *
 * - Full (76px, the home). Left to right: the title, a button with a small
 *   chevron that opens the month; `Previous week` / `Next week`, always
 *   drawn, `aria-disabled` at the bounds; the `This week` pill away from the
 *   current week; the seven days packed 2px apart (each opens the month on
 *   that day; dot and spoken label from `home-rules`); then the week's cards,
 *   50px tall, two lines (`Fri 7 PM · Going` / the title and the club).
 * - Folded (44px, a chat is open): the title, then `<Fri 7 PM> <title>` on
 *   one line. The week on screen is kept (H6).
 *
 * What fits (H7). The title, the arrows and the days never give way: they
 * are the left block, `flexShrink: 0`. ONE `ResizeObserver` measures the
 * band's box and that block (which is wider on another week: a longer title,
 * the pill), and `bandFit(bandWidth, fixedWidth, count)` says how many cards
 * are drawn; the rest is one `+N` chip that opens the month on the first
 * hidden card's day. A card is 168px at least and 8px from the next, the
 * chip 48px: the rule's own slots, less the gap the row's last one does not
 * have (`fitOf`). The folded line is cut by the same rule.
 * Under 48px of room nothing is drawn after the days; the title and the days
 * still open the month.
 *
 * Cards and folded items are `<a href="/messages?channel=<room_id>">`: a
 * plain left click is answered here (`onOpenRoom`, the shell opens the chat
 * in place); Cmd / Ctrl / Shift / Alt and the middle button are the
 * browser's (a new tab). With no `room_id` the same text is not a link.
 *
 * One glow per screen (3.2): the first live card of the FULL band carries
 * the live chrome and the glowing dot. Folded, the live item is flat text
 * with a plain coral dot.
 *
 * The month: `MonthPopover`, under the title whatever opened it, so focus
 * returns to the title on every close. Closing does what the phone does
 * (`MessagesHome.tsx:353-358`): the band moves to the picked day's week and
 * that week is read again. The title is a toggle: a click on it while the
 * month is open closes the month, and so does Esc with focus on it (both are
 * `MonthPopover`'s listeners on its anchor; `aria-expanded` says which).
 *
 * The other states, in the cards' place: three grey cards while the week's
 * first read is out; `Nothing on your week yet.` / `Nothing that week yet.`
 * with `Find events`; the read's failure line with Retry. In the full band
 * neither sentence is cut at the widths walked: it wraps to a second line,
 * and its control goes under it when the two do not fit side by side.
 * Folded, it is one line. A week that comes on screen slides in from its
 * side (the phone's classes).
 *
 * Colours are `palette(night)` and CSS variables only. Hover and focus
 * styles are `BAND_CSS`, a `<style>` of this component (3.2).
 */

/** The band's side padding. The measured band width is the room between the two. */
const BAND_PAD = 24;
/** A card's least width and the gap after it: `bandFit`'s 176px slot. */
const CARD_MIN = 168;
const CARD_GAP = 8;
/** The `+N` chip: with its gap it sits inside the 64px `bandFit` keeps for it. Also the least room in which anything is drawn after the days. */
const MORE_WIDTH = 48;
/** The least room for the control after a sentence (`Find events`, Retry); under it the sentence stands alone. */
const CONTROL_ROOM = 120;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The classes of `MONTH_SLIDE_CSS` (the week strip's own string) for the way the last move went; none before any move. */
const slideClass = (slide: -1 | 0 | 1): string | undefined => (slide === 1 ? "vibe-week-in-next" : slide === -1 ? "vibe-week-in-prev" : undefined);

const BAND_CSS = `
.vibe-band { transition: height 320ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.vibe-band button:focus-visible, .vibe-band a:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
.vibe-band-quiet { background: transparent; }
.vibe-band-quiet:hover { background: rgba(var(--scrim-rgb), 0.06); }
.vibe-band-wash { background: rgba(var(--scrim-rgb), 0.05); }
.vibe-band-wash:not([aria-disabled="true"]):hover { background: rgba(var(--scrim-rgb), 0.1); }
.vibe-band-card { background: rgba(var(--scrim-rgb), 0.045); }
a.vibe-band-card:hover { background: rgba(var(--scrim-rgb), 0.08); }
@media (prefers-reduced-motion: reduce) { .vibe-band { transition: none; } }
`;

/**
 * How a sentence in the cards' place (the empty line, the failure line) gives
 * way. Folded (44px): one line, ending in an ellipsis. Full (76px): it wraps
 * to a second line first, and is cut only after that; at 1024 and 900 the
 * room after the days is narrower than either sentence on one line.
 */
function sentenceClip(folded: boolean): React.CSSProperties {
  return folded ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : { overflow: "hidden", display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2 };
}

/** A plain left click: the only one the band answers itself. Any other (Cmd, Ctrl, Shift, Alt) is the browser's: a new tab or window on the link's own address. */
function plainClick(e: React.MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** The local day an entry starts on; null when its start cannot be read. */
function entryDay(e: WeekEntry): Date | null {
  const start = new Date(e.starts_at);
  return Number.isNaN(start.getTime()) ? null : startOfLocalDay(start);
}

export function WeekBand({ data, folded, night, onOpenRoom }: WeekBandProps) {
  const t = palette(night);
  const headingId = useId();
  const { now, range, weekOffset: offset } = data;
  const bandRef = useRef<HTMLElement | null>(null);
  // The left block: the title, the arrows, the pill, the days, and its own gap to the cards.
  const fixedRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLButtonElement | null>(null);
  // Both widths as last measured (0 = not yet): what `bandFit` is asked with.
  const [size, setSize] = useState({ band: 0, fixed: 0 });
  // The month popover: the day it opens on and the title's button (its anchor); null = closed.
  const [month, setMonth] = useState<{ day: Date; anchor: HTMLElement | null } | null>(null);

  const days = weekDays(range.start);
  const sorted = data.week ? [...data.week].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()) : null;
  const liveId = sorted?.find((e) => e.room_state === "live")?.id ?? null;
  const weekKey = range.start.getTime();
  const title = weekTitle(offset, range);
  const spoken = weekSpoken(offset, range);
  const sliding = slideClass(data.weekSlide);
  const away = offset !== 0;
  const canBack = offset > WEEK_MIN_OFFSET;
  const canForward = offset < WEEK_MAX_OFFSET;

  // One observer on the band's box and on its left block. Measured before
  // the paint too, whenever the left block's content changes (another week's
  // title, the pill, the fold): the cards are never drawn against a stale fit.
  useLayoutEffect(() => {
    const band = bandRef.current;
    const fixed = fixedRef.current;
    if (!band || !fixed) return;
    const measure = () => {
      const bandWidth = Math.max(0, Math.floor(band.clientWidth - 2 * BAND_PAD));
      const fixedWidth = Math.ceil(fixed.getBoundingClientRect().width);
      setSize((prev) => (prev.band === bandWidth && prev.fixed === fixedWidth ? prev : { band: bandWidth, fixed: fixedWidth }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(band);
    observer.observe(fixed);
    return () => observer.disconnect();
  }, [title, away, folded]);

  const room = size.band - size.fixed;
  // The rule counts a gap after every slot, and the row's last one has none:
  // the band is asked as one gap wider. n cards need n*176 - 8 of the room;
  // n cards and the chip need n*176 + 48, inside the n*176 + 56 the rule
  // then asks for.
  const fitOf = (count: number) => bandFit(size.band + CARD_GAP, size.fixed, count);
  const fit = fitOf(sorted?.length ?? 0);
  const firstHidden = sorted && fit.more > 0 ? sorted[fit.cards] : undefined;

  // From the title: today when the week on screen holds it, else that week's Monday. From a day or the chip: that day.
  const openMonth = (day: Date | null) => setMonth({ day: day ?? sheetStartDay(now, range), anchor: titleRef.current });
  // Every way out of the month lands here: the band moves to the picked
  // day's week (the bounds hold; no pick = the week on screen) and that week
  // is read again, so the band and the month (which read when it opened) say
  // the same.
  const closeMonth = (picked: Date | null) => {
    setMonth(null);
    const next = picked ? clampWeekOffset(weekOffsetOf(now, picked)) : offset;
    data.setWeekOffset(next);
    void data.refreshWeek(weekRangeAt(now, next));
  };

  // What follows the left block. Nothing until the widths are known, and
  // nothing when not even the chip would fit whole.
  let after: React.ReactNode = null;
  let grouped = false;
  // The empty line of the full band: `Find events` goes under the sentence when the two do not fit side by side.
  let stacked = false;
  if (room < MORE_WIDTH) {
    after = null;
  } else if (data.weekErr) {
    after = <BandFailure failure={data.weekErr} onRetry={data.retryWeek} control={room >= CONTROL_ROOM} folded={folded} t={t} />;
  } else if (sorted === null) {
    after = Array.from({ length: fitOf(3).cards }, (_, i) => (
      <div key={i} aria-hidden="true" style={folded ? { width: 120, height: 14, flexShrink: 0, borderRadius: 7, background: "rgba(var(--scrim-rgb), 0.06)" } : { width: CARD_MIN, height: 50, flexShrink: 0, borderRadius: 16, background: "rgba(var(--scrim-rgb), 0.06)" }} />
    ));
  } else if (sorted.length === 0) {
    stacked = !folded;
    after = (
      <>
        <p style={{ margin: 0, minWidth: 0, ...sentenceClip(folded), fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: t.secondary }}>{away ? "Nothing that week yet." : "Nothing on your week yet."}</p>
        {room >= CONTROL_ROOM ? (
          <Link href="/campus?tab=events" style={{ minHeight: 28, flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, textDecoration: "none", color: t.coralText, fontSize: 13.5, fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap" }}>
            Find events
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ) : null}
      </>
    );
  } else {
    grouped = true;
    after = (
      <>
        {sorted.slice(0, fit.cards).map((e) =>
          folded ? (
            <BandItem key={e.id} entry={e} now={now} otherWeek={away} t={t} onOpenRoom={onOpenRoom} />
          ) : (
            <BandCard key={e.id} entry={e} now={now} otherWeek={away} glow={e.id === liveId} t={t} onOpenRoom={onOpenRoom} />
          ),
        )}
        {fit.more > 0 ? (
          <button
            type="button"
            className="vibe-band-wash"
            aria-haspopup="dialog"
            onClick={() => openMonth(firstHidden ? entryDay(firstHidden) : null)}
            style={{ width: MORE_WIDTH, height: folded ? 28 : 50, flexShrink: 0, padding: 0, border: "none", borderRadius: folded ? 999 : 16, color: t.secondary, fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, lineHeight: 1, cursor: "pointer" }}
          >
            +{fit.more}
          </button>
        ) : null}
      </>
    );
  }

  return (
    <section
      ref={bandRef}
      className="vibe-band"
      aria-labelledby={headingId}
      style={{ height: folded ? 44 : 76, flexShrink: 0, minWidth: 0, boxSizing: "border-box", padding: `0 ${BAND_PAD}px`, borderBottom: `1px solid ${t.hairline}`, overflow: "hidden", display: "flex", alignItems: "center", fontFamily: FONT, color: t.ink }}
    >
      <style>{BAND_CSS}</style>
      <style>{MONTH_SLIDE_CSS}</style>

      {/* The left block: never shrinks. Its right padding is the gap to the
          cards, so its measured width is everything the cards cannot have. */}
      <div ref={fixedRef} style={{ flexShrink: 0, boxSizing: "border-box", paddingRight: folded ? 30 : 24, display: "flex", alignItems: "center" }}>
        {/* The title row is the live region: it says `Next week, October 12 to 18` when the week changes. */}
        <div aria-live="polite" aria-atomic="true" style={{ display: "flex", alignItems: "center" }}>
          <h2 id={headingId} style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: 1, letterSpacing: "-0.2px", whiteSpace: "nowrap" }}>
            <button
              ref={titleRef}
              type="button"
              className="vibe-band-quiet"
              aria-haspopup="dialog"
              aria-expanded={month !== null}
              onClick={() => {
                // The click that closes the open month never comes here: the popover takes it on this button and stops it.
                if (!month) openMonth(null);
              }}
              style={{ position: "relative", minHeight: 28, margin: "0 -6px", padding: "0 6px", border: "none", borderRadius: 999, color: t.ink, font: "inherit", letterSpacing: "inherit", display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}
            >
              <span aria-hidden="true">{title}</span>
              <span style={visuallyHiddenStyle}>{spoken}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, color: t.muted }}>
                <path d="M5 9l7 7 7-7" />
              </svg>
            </button>
          </h2>
        </div>

        {folded ? null : (
          <>
            <div style={{ marginLeft: 14, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
              <StepButton label="Previous week" back disabled={!canBack} onPress={() => data.stepWeek(-1)} t={t} />
              <StepButton label="Next week" disabled={!canForward} onPress={() => data.stepWeek(1)} t={t} />
              {away ? (
                <button
                  type="button"
                  className="vibe-band-wash"
                  onClick={() => {
                    // The pill leaves with the press: focus goes to the title, not to <body>.
                    titleRef.current?.focus({ preventScroll: true });
                    data.setWeekOffset(0);
                  }}
                  aria-label={`Back to this week, ${weekRangeAt(now, 0).spoken}`}
                  style={{ marginLeft: 2, height: 28, flexShrink: 0, boxSizing: "border-box", padding: "0 10px 0 7px", borderRadius: 999, border: `1px solid ${t.chipBorder}`, color: t.ink, fontFamily: "inherit", fontSize: 11, fontWeight: 700, lineHeight: 1, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap", cursor: "pointer" }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 5l-7 7 7 7" />
                  </svg>
                  This week
                </button>
              ) : null}
            </div>

            {/* 24px from the arrows and to the cards; the 4px of padding is the room a day's focus ring needs inside the clip that holds a week sliding in. */}
            <nav aria-label={spoken} style={{ margin: "0 -4px 0 20px", padding: 4, flexShrink: 0, overflow: "hidden" }}>
              <div key={weekKey} className={sliding} style={{ height: 44, display: "flex", gap: 2 }}>
                {days.map((day) => {
                  const onDay = sorted ? entriesOn(day, sorted) : [];
                  const dot = dayDot(onDay);
                  const today = isSameLocalDay(now, day);
                  const past = isPastDay(day, now);
                  return (
                    <button
                      key={day.getTime()}
                      type="button"
                      className={today ? undefined : "vibe-band-quiet"}
                      aria-current={today ? "date" : undefined}
                      aria-haspopup="dialog"
                      aria-label={dayLabel(day, onDay, today)}
                      onClick={() => openMonth(day)}
                      style={{ width: 44, height: 44, flexShrink: 0, padding: 0, borderRadius: 14, border: "none", background: today ? t.activeChip.bg : undefined, fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: "pointer" }}
                    >
                      {/* Today's weekday on the inverted chip: the chip's own ink, a step quieter than the date. */}
                      <span style={{ fontSize: 10.5, fontWeight: today ? 700 : 600, lineHeight: "12px", color: today ? t.activeChip.ink : past ? t.muted : t.secondary, opacity: today ? 0.72 : 1 }}>{WEEKDAYS[day.getDay()]}</span>
                      <span style={{ fontSize: 15, fontWeight: today ? 800 : 700, lineHeight: "16px", color: today ? t.activeChip.ink : past ? t.muted : t.ink }}>{day.getDate()}</span>
                      {/* The calendar key (Oct 19, 2026 repair): a ring for Interested, as in My Calendar beside it. */}
                      <RsvpDayMark kind={dot} coral={t.coral} />
                    </button>
                  );
                })}
              </div>
            </nav>
          </>
        )}
      </div>

      {/* Keyed by the week alone: the same node on both faces, so folding never replays the slide. */}
      <div
        key={weekKey}
        className={sliding}
        role={grouped ? "group" : undefined}
        aria-label={grouped ? `Event rooms you RSVP'd to ${weekWord(offset, range)}` : undefined}
        style={{ flex: "1 1 0", minWidth: 0, display: "flex", alignItems: "center", flexWrap: stacked ? "wrap" : undefined, columnGap: folded ? 24 : grouped || sorted === null ? CARD_GAP : 12, rowGap: 0 }}
      >
        {after}
      </div>

      {month ? <MonthPopover anchor={month.anchor} initialDay={month.day} now={now} night={night} onClose={closeMonth} onOpenRoom={onOpenRoom} /> : null}
    </section>
  );
}

/** `Previous week` / `Next week`: a 28px round button, always drawn. At the strip's bound it stays in place and keeps its focus, `aria-disabled`. */
function StepButton({ label, back, disabled, onPress, t }: { label: string; back?: boolean; disabled: boolean; onPress: () => void; t: Palette }) {
  return (
    <button
      type="button"
      className="vibe-band-wash"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onPress();
      }}
      style={{ width: 28, height: 28, flexShrink: 0, padding: 0, border: "none", borderRadius: 999, color: t.secondary, opacity: disabled ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "default" : "pointer" }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={back ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
      </svg>
    </button>
  );
}

type BandEntryProps = {
  entry: WeekEntry;
  now: Date;
  /** The band is on a week other than the current one: the line says the weekday. */
  otherWeek: boolean;
  t: Palette;
  onOpenRoom: (entry: WeekEntry) => void;
};

/** The room's deep link, and the click that opens it in place: only a plain left click is taken from the browser. */
function roomLink(entry: WeekEntry, roomId: string, onOpenRoom: (entry: WeekEntry) => void) {
  return {
    href: `/messages?channel=${encodeURIComponent(roomId)}`,
    onClick: (e: React.MouseEvent) => {
      if (!plainClick(e)) return;
      e.preventDefault();
      // The second click of a double click was aimed at the card that stood here at the first one (the
      // band folds under the pointer when a chat opens): it opens nothing. A key press counts 0.
      if (e.detail > 1) return;
      onOpenRoom(entry);
    },
  };
}

/**
 * One card of the full band, 50px tall (D3_Tuck step 0): line 1 `Live now` /
 * `Ended` / `Fri 7 PM` (`weekCardLine`) + ` · ` + the RSVP (a check and
 * `Going`, or `Interested`: a shape and a word, never colour alone); line 2 the
 * title and the club's name (none when `org` is null). 168px at least, as
 * wide as its text up to 280, then both lines end in an ellipsis.
 *
 * `glow`: the live chrome and the glowing dot, for the band's first live
 * card only (one glow per screen). Any other live card is the quiet card
 * with `Live now` in coral and a plain dot. A link when `room_id` is set;
 * else, since Oct 19, 2026 (critique D13), a link to the club's page at
 * that event when it has a club; else the same tile.
 */
function BandCard({ entry, now, otherWeek, glow, t, onOpenRoom }: BandEntryProps & { glow: boolean }) {
  const line = weekCardLine(entry, now, otherWeek);
  const live = line.kind === "live";
  const label = weekCardLabel(entry, now);
  const style: React.CSSProperties = {
    flex: "0 1 auto",
    minWidth: CARD_MIN,
    maxWidth: 280,
    height: 50,
    boxSizing: "border-box",
    padding: "0 16px 0 14px",
    borderRadius: 16,
    border: `1px solid ${glow ? t.liveCard.border : "transparent"}`,
    background: glow ? t.liveCard.bg : undefined,
    boxShadow: glow ? t.liveCard.shadow : undefined,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 3,
    textDecoration: "none",
    color: t.ink,
  };
  const body = (
    <>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, lineHeight: "15px", color: t.secondary, whiteSpace: "nowrap" }}>
        <span style={{ minWidth: 0, display: "inline-flex", alignItems: "center", gap: 6, fontWeight: live ? 700 : 600, color: live ? t.coralMark : undefined }}>
          {live ? <span aria-hidden="true" style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 999, background: t.coral, boxShadow: glow ? `0 0 8px ${t.coral}` : "none" }} /> : null}
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{line.text}</span>
        </span>
        <span aria-hidden="true" style={{ flexShrink: 0, color: t.muted }}>
          ·
        </span>
        {entry.viewer_status === "going" ? (
          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3 }}>
            <CheckIcon size={11} />
            Going
          </span>
        ) : (
          <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <InterestedRing coral={t.coral} />
            Interested
          </span>
        )}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" }}>
        <span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontFamily: SERIF, fontWeight: 700, fontSize: 15.5, lineHeight: "18px", letterSpacing: "-0.2px" }}>{entry.title}</span>
        {entry.org ? <span style={{ flex: "0 2 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontSize: 12, fontWeight: 500, lineHeight: "15px", color: glow ? t.secondary : t.muted }}>{entry.org.name}</span> : null}
      </span>
    </>
  );
  if (entry.room_id) {
    return (
      <a {...roomLink(entry, entry.room_id, onOpenRoom)} className={glow ? undefined : "vibe-band-card"} aria-label={label} style={style}>
        {body}
      </a>
    );
  }
  if (entry.org) {
    return (
      <Link href={clubEventHref(entry.org.handle, entry.id)} className={glow ? undefined : "vibe-band-card"} aria-label={`${label}. Open the club page`} style={style}>
        {body}
      </Link>
    );
  }
  return (
    <div role="group" className={glow ? undefined : "vibe-band-card"} aria-label={label} style={style}>
      {body}
    </div>
  );
}

/**
 * One item of the folded band (D3_Tuck step 1): the card's first line, then
 * the title, on one line; a long title ends in an ellipsis. The live item is
 * flat text with a plain coral dot: no chrome, no glow (3.2). A link when
 * `room_id` is set; else a link to the club's page at that event when it has
 * a club (Oct 19, 2026); else the same text.
 */
function BandItem({ entry, now, otherWeek, t, onOpenRoom }: BandEntryProps) {
  const line = weekCardLine(entry, now, otherWeek);
  const live = line.kind === "live";
  const label = weekCardLabel(entry, now);
  const style: React.CSSProperties = { flex: "0 1 auto", minWidth: 0, minHeight: 28, display: "inline-flex", alignItems: "center", gap: 7, textDecoration: "none", color: t.ink, whiteSpace: "nowrap" };
  const body = (
    <>
      {live ? <span aria-hidden="true" style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 999, background: t.coral }} /> : null}
      <span style={{ flexShrink: 0, fontSize: 12, fontWeight: live ? 700 : 600, color: live ? t.coralText : t.muted }}>{line.text}</span>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontFamily: SERIF, fontWeight: 700, fontSize: 14.5, letterSpacing: "-0.2px", color: live ? t.ink : t.secondary }}>{entry.title}</span>
    </>
  );
  if (entry.room_id) {
    return (
      <a {...roomLink(entry, entry.room_id, onOpenRoom)} aria-label={label} style={style}>
        {body}
      </a>
    );
  }
  if (entry.org) {
    return (
      <Link href={clubEventHref(entry.org.handle, entry.id)} aria-label={`${label}. Open the club page`} style={style}>
        {body}
      </Link>
    );
  }
  return (
    <span role="group" aria-label={label} style={style}>
      {body}
    </span>
  );
}

/**
 * The week's read failed: its line in the band (either face is too short
 * for the boxed `LoadFailed`). Folded: one row, the line ending in an
 * ellipsis when the room is short. Full: the line wraps to a second line
 * before it is cut, and the pill goes under it when the two do not fit side
 * by side (`sentenceClip`). The pill follows `LoadFailed`'s rule: the
 * failure's mapped action (Sign in / Review Terms) when it has one, since a
 * retry would only fail again; otherwise Retry, unless retrying cannot help.
 * `control` false (not enough room for a whole pill): the line alone.
 */
function BandFailure({ failure, onRetry, control, folded, t }: { failure: LoadFailure; onRetry: () => void; control: boolean; folded: boolean; t: Palette }) {
  const action = failure.action;
  const showButton = control && (Boolean(action) || failure.retryable !== false);
  return (
    <div role="alert" style={{ flex: "0 1 auto", minWidth: 0, display: "flex", alignItems: "center", flexWrap: folded ? undefined : "wrap", columnGap: 12, rowGap: 2 }}>
      <span style={{ minWidth: 0, ...sentenceClip(folded), fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: t.secondary }}>{failure.message}</span>
      {showButton ? (
        <button
          type="button"
          onClick={() => {
            // Full navigation, so the server-side gates on the target run.
            if (action) window.location.assign(action.href);
            else onRetry();
          }}
          style={{ height: 26, flexShrink: 0, margin: 0, padding: "0 12px", border: "none", borderRadius: 999, background: t.coralButton.bg, color: t.coralButton.ink, fontFamily: "inherit", fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1, whiteSpace: "nowrap", cursor: "pointer" }}
        >
          {action ? action.label : "Retry"}
        </button>
      ) : null}
    </div>
  );
}
