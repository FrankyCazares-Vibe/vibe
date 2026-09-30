"use client";

import Link from "next/link";

import type { EventRef } from "@/lib/chat/types";
import { isSoon } from "@/lib/chat/when";

import { FONT, palette, SERIF } from "../v2-tokens";
import { isHot, rsvpWord, upNextAriaLabel, upNextLine } from "./helpers";

/**
 * "Up next" on the club space (handoffs/chat-redesign/wave-2-contracts.md
 * 11.3, 1.2, 11.9.3; mockups `W0_Club:29-50`, `W0_EmptyClub:30-37`, MK:4, MK:12).
 *
 * `up_next.slice(0, 2)` in a 2-column grid of 50px cards (the third event is
 * reachable by its chip; SCREENS-L6): line 1 `eventTime` (`Live now` when
 * live) + the RSVP mark when the viewer RSVP'd, line 2 the title; at 375px
 * the time stays whole and the RSVP mark yields (the check keeps the shape,
 * the `aria-label` the word; S2-notes.md STOPPED 10). The live
 * chrome only on `state === "live"` or `isSoon` (SCREENS-M2); the `Soon`
 * ring only when `isSoon`; every other card the quiet chrome. The bloom
 * behind the block only when a DRAWN card is hot. A tap opens the event chat
 * layer when `room_id !== null`, else nothing. No right text (MK:16.6).
 *
 * The block is left out when `up_next` is empty and the viewer is a member;
 * the officer's brand new club (`officerEmpty`) shows the dashed
 * `Add your first event` button (→ `/campus?tab=events`) and the line
 * `Every event gets its own chat for the people going.` (11.9.3).
 */
export type UpNextProps = {
  clubName: string;
  events: EventRef[];
  night: boolean;
  now: Date;
  officerEmpty: boolean;
  onOpenEvent: (roomId: string) => void;
};

function Check({ color }: { color: string }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function UpNext({ clubName, events, night, now, officerEmpty, onOpenEvent }: UpNextProps) {
  const t = palette(night);
  const heading = (
    <h2 style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 16, lineHeight: "18px", letterSpacing: -0.2, color: t.ink }}>
      Up next
    </h2>
  );

  if (officerEmpty) {
    return (
      <section aria-label="Up next" style={{ flexShrink: 0, boxSizing: "border-box", padding: "8px 16px 12px", display: "flex", flexDirection: "column", gap: 8, fontFamily: FONT }}>
        {heading}
        <Link
          href="/campus?tab=events"
          style={{
            width: "100%",
            height: 56,
            boxSizing: "border-box",
            padding: "0 14px 0 12px",
            borderRadius: 18,
            border: night ? "1px dashed rgba(255,255,255,0.22)" : "1px dashed rgba(20,20,22,0.22)",
            background: "rgba(var(--scrim-rgb),0.03)",
            color: t.ink,
            fontSize: 14.5,
            fontWeight: 700,
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span aria-hidden="true" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 999, background: "rgba(var(--scrim-rgb),0.07)", color: t.secondary, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          Add your first event
        </Link>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, lineHeight: 1.35, color: t.secondary }}>Every event gets its own chat for the people going.</p>
      </section>
    );
  }

  const drawn = events.slice(0, 2);
  if (drawn.length === 0) return null;
  const bloom = drawn.some((e) => isHot(e, now));

  return (
    <section aria-label="Up next" style={{ flexShrink: 0, position: "relative", isolation: "isolate", boxSizing: "border-box", padding: "6px 0 0", display: "flex", flexDirection: "column", fontFamily: FONT }}>
      {bloom ? (
        <div aria-hidden="true" style={{ position: "absolute", zIndex: -1, left: -66, top: -2, width: 340, height: 118, pointerEvents: "none", background: t.bloom }} />
      ) : null}
      <div style={{ height: 18, boxSizing: "border-box", padding: "0 16px", display: "flex", alignItems: "center" }}>{heading}</div>
      <div role="group" aria-label={`${clubName} events`} style={{ boxSizing: "border-box", padding: "8px 16px 10px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        {drawn.map((e) => {
          const hot = isHot(e, now);
          const soon = isSoon(e.starts_at, e.ends_at, now);
          const chrome = hot ? t.liveCard : t.quietCard;
          const word = rsvpWord(e.viewer_status);
          const tappable = e.room_id !== null;
          const inner = (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, lineHeight: "15px", color: t.secondary, whiteSpace: "nowrap", overflow: "hidden" }}>
                <span style={{ flexShrink: 0 }}>{upNextLine(e, now)}</span>
                {word ? (
                  <>
                    <span aria-hidden="true" style={{ flexShrink: 0, color: t.muted }}>·</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: word === "Going" ? 3 : 4, fontWeight: 700, color: word === "Going" ? t.coralMark : t.secondary, minWidth: 0, overflow: "hidden" }}>
                      <span style={{ flexShrink: 0, display: "inline-flex" }}>{word === "Going" ? <Check color={t.coralMark} /> : <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: t.muted }} />}</span>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{word}</span>
                    </span>
                  </>
                ) : null}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ flexGrow: 1, minWidth: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 15.5, lineHeight: "17px", letterSpacing: -0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
                {soon ? (
                  <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, lineHeight: "15px", color: t.coralMark }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, boxSizing: "border-box", borderRadius: 999, border: `2px solid ${t.coralMark}` }} />
                    Soon
                  </span>
                ) : null}
              </span>
            </>
          );
          const style: React.CSSProperties = {
            height: 50,
            minWidth: 0,
            boxSizing: "border-box",
            padding: "7px 10px",
            borderRadius: 18,
            border: `1px solid ${chrome.border}`,
            background: chrome.bg,
            boxShadow: chrome.shadow,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            color: t.ink,
            textAlign: "left",
            fontFamily: "inherit",
            cursor: tappable ? "pointer" : "default",
            WebkitTapHighlightColor: "transparent",
          };
          const label = upNextAriaLabel(e, now);
          return tappable ? (
            <button key={e.id} type="button" aria-label={label} onClick={() => onOpenEvent(e.room_id as string)} style={style}>
              {inner}
            </button>
          ) : (
            <div key={e.id} role="group" aria-label={label} style={style}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
