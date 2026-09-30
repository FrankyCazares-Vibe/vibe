"use client";

import Link from "next/link";
import { useRef } from "react";

import { LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { isSameLocalDay, type WeekRange, weekDays } from "@/lib/chat/week";

import { clubGradient } from "../avatar";
import { useNightTheme } from "../theme";
import { FONT, palette, SERIF } from "../v2-tokens";

import { CheckIcon } from "./ClubRow";
import { dayDot, dayLabel, entriesOn, weekCardLabel, weekCardLine, type WeekEntry } from "./home-rules";

/**
 * "Your week" (handoffs/chat-redesign/wave-2-contracts.md 11.2, 1.2, 11.9.1;
 * W2-S1) — W0_Home top, W0_EmptyWeek. The calendar's `rsvp` entries between
 * Monday and Sunday of the device's week (`weekRange`): the heading row, the
 * seven-day strip (a tap scrolls the card row to that day's first card; open
 * point 14.35), the 142×64 card row sorted by `starts_at` (the live chrome
 * and the bloom only when a live card exists; a link only when `room_id !==
 * null`; `Ended` after), the empty line + `Find events`, the failure line.
 *
 * 150px with cards, 126px empty (MK:1.2, MK:2): 6 + 18 + 2 + 44 + 72 + 8.
 */
export function YourWeek({
  entries,
  failure,
  onRetry,
  now,
  range,
  onOpenRoom,
}: {
  /** Sorted here; null while the first calendar read is out. */
  entries: WeekEntry[] | null;
  failure: LoadFailure | null;
  onRetry: () => void;
  now: Date;
  range: WeekRange;
  /** A card with `room_id` set: the club space on its Lounge with the event chat layer on top (2.3). */
  onOpenRoom: (entry: WeekEntry) => void;
}) {
  const night = useNightTheme();
  const t = palette(night);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const days = weekDays(range.start);
  const sorted = entries ? [...entries].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()) : null;
  const hasLive = !!sorted?.some((e) => e.room_state === "live");
  const todayIndex = days.findIndex((d) => isSameLocalDay(now, d));

  const scrollToDay = (day: Date) => {
    const first = sorted ? entriesOn(day, sorted)[0] : undefined;
    const row = rowRef.current;
    const el = first ? cardRefs.current.get(first.id) : undefined;
    if (!first || !row || !el) return;
    row.scrollTo({ left: Math.max(0, el.offsetLeft - 16), behavior: "smooth" });
  };

  return (
    <section
      aria-labelledby="your-week-heading"
      style={{ flexShrink: 0, position: "relative", isolation: "isolate", boxSizing: "border-box", padding: "6px 0 8px", display: "flex", flexDirection: "column", fontFamily: FONT, color: t.ink }}
    >
      {hasLive ? (
        <div aria-hidden="true" style={{ position: "absolute", zIndex: -1, left: -92, top: 54, width: 340, height: 118, pointerEvents: "none", background: t.bloom }} />
      ) : null}
      <div style={{ height: 18, boxSizing: "border-box", padding: "0 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <h2 id="your-week-heading" style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: 1, letterSpacing: "-0.2px", color: t.ink }}>
          Your week
        </h2>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, lineHeight: 1, color: t.muted, whiteSpace: "nowrap" }}>
          {range.label} · your RSVPs
        </span>
      </div>

      <nav aria-label={`Your week, ${range.spoken}`} style={{ marginTop: 2, height: 44, boxSizing: "border-box", padding: "0 12px", display: "flex", justifyContent: "space-between" }}>
        {days.map((day, i) => {
          const onDay = sorted ? entriesOn(day, sorted) : [];
          const dot = dayDot(onDay);
          const today = i === todayIndex;
          const past = todayIndex >= 0 && i < todayIndex;
          return (
            <button
              key={day.getTime()}
              type="button"
              aria-current={today ? "date" : undefined}
              aria-label={dayLabel(day, onDay, today)}
              onClick={() => scrollToDay(day)}
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
                cursor: onDay.length ? "pointer" : "default",
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
              <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: 999, background: dot === "going" ? t.coral : dot === "maybe" ? t.muted : "transparent" }} />
            </button>
          );
        })}
      </nav>

      {failure ? (
        <div style={{ margin: "0 0 -10px", boxSizing: "border-box", padding: "8px 16px 10px", minHeight: 82 }}>
          <LoadFailed failure={failure} compact tone={night ? "dark" : "light"} onRetry={onRetry} />
        </div>
      ) : sorted === null ? (
        <div aria-hidden="true" style={{ margin: "0 0 -10px", boxSizing: "border-box", padding: "8px 16px 10px", display: "flex", gap: 8, overflow: "hidden" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ width: 142, height: 64, flexShrink: 0, borderRadius: 18, background: "rgba(var(--scrim-rgb),0.06)" }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ marginTop: 4, height: 44, boxSizing: "border-box", padding: "0 6px 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: t.secondary, whiteSpace: "nowrap" }}>Nothing on your week yet.</p>
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
          ref={rowRef}
          role="group"
          aria-label="Event rooms you RSVP'd to this week"
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
            <WeekCard key={e.id} entry={e} now={now} night={night} onOpenRoom={onOpenRoom} register={(el) => (el ? cardRefs.current.set(e.id, el) : cardRefs.current.delete(e.id))} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One 142×64 card (`W0_Home:40-54`): the live chrome on `room_state ===
 * "live"`, the quiet chrome otherwise; line 1 `Live now` / `Ended` /
 * `eventTimeShort` + ` · ` + the RSVP mark (a check for Going, a dot for
 * Maybe: shape and word, never colour alone); line 2 the title; line 3 the
 * club dot + name (none when `org` is null). A link to the room when
 * `room_id` is set, else a plain tile with the same text.
 */
function WeekCard({
  entry,
  now,
  night,
  onOpenRoom,
  register,
}: {
  entry: WeekEntry;
  now: Date;
  night: boolean;
  onOpenRoom: (entry: WeekEntry) => void;
  register: (el: HTMLElement | null) => void;
}) {
  const t = palette(night);
  const line = weekCardLine(entry, now);
  const live = line.kind === "live";
  const chrome = live ? t.liveCard : t.quietCard;
  const label = weekCardLabel(entry, now);
  const style: React.CSSProperties = {
    width: 142,
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
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: t.muted }} />
            Maybe
          </span>
        )}
      </span>
      <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 15.5, lineHeight: "17px", letterSpacing: "-0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.title}</span>
      {entry.org ? (
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 500, lineHeight: "14px", color: live ? t.secondary : t.muted, whiteSpace: "nowrap", overflow: "hidden" }}>
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
  return (
    <div ref={register} role="group" aria-label={label} style={style}>
      {body}
    </div>
  );
}
