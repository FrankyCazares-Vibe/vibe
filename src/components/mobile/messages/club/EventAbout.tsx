"use client";

import type { EventRef, Person } from "@/lib/chat/types";
import { eventTime } from "@/lib/chat/when";

import { personColor } from "../avatar";
import { initialsOf } from "../format";
import { FONT, palette } from "../v2-tokens";
import { pillState, rsvpPill, statePillText, whoIsGoingLabel } from "./helpers";

/**
 * "About" on the event chat layer (handoffs/chat-redesign/wave-2-contracts.md
 * 11.6, 1.2; mockup `W0_Room:24-70`, MK:6): the 96px hero (a generated
 * gradient — `events` has no cover image, DM:5.10; the bloom only on
 * `live`), the state pill (`role="status"`: `Soon · starts 7:30 PM` ·
 * `Live now` · `Ended · chat open N more days` · `Closed`), the Plans grid
 * (`Where` = `location` or `No place yet`; `When` = `eventTime`), then
 * Who's going (`role="group" aria-label="Who's going: N going, M maybe"`):
 * up to five stacked 30px avatars from `going` (the first 8 visible people,
 * 8.3), `<N> going`, `· <M> maybe` (the counts, blocked people included), and
 * the RSVP pill (`Going` check / `Maybe` dot / `RSVP`) that opens the sheet.
 */
export type EventAboutProps = {
  event: EventRef & { going: Person[] };
  night: boolean;
  now: Date;
  onRsvp: () => void;
};

const HERO_BG =
  "linear-gradient(0deg, rgba(12,11,11,0.50) 0%, rgba(12,11,11,0) 62%), repeating-radial-gradient(circle at 100% 0%, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 15px), radial-gradient(150px 90px at 92% 0%, rgba(255,196,128,0.55) 0%, rgba(255,196,128,0) 70%), linear-gradient(112deg, #2A0E1E 0%, #6E1F33 42%, #C2452F 78%, #FF5C35 100%)";

function StatePill({ event, now }: { event: EventAboutProps["event"]; now: Date }) {
  const state = pillState(event.state);
  const text = statePillText(event, now);
  const dot = text.indexOf(" · ");
  const head = dot >= 0 ? text.slice(0, dot) : text;
  const tail = dot >= 0 ? text.slice(dot + 1) : null;
  const live = state === "live";
  const ink = live ? "#FF8A66" : state === "closed" ? "#CFC8BE" : "#F6F1EA";
  let mark: React.ReactNode;
  if (state === "soon") mark = <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, boxSizing: "border-box", border: "2px solid #F6F1EA" }} />;
  else if (live) mark = <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, background: "#FF5C35", boxShadow: "0 0 0 3px rgba(255,92,53,0.25), 0 0 8px #FF5C35" }} />;
  else if (state === "after")
    mark = (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#CFC8BE" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.8 2.8L16 9.8" />
      </svg>
    );
  else
    mark = (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="10" rx="2.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    );
  return (
    <span
      role="status"
      style={{
        height: 30,
        padding: "0 12px 0 10px",
        borderRadius: 999,
        boxSizing: "border-box",
        border: live ? "1px solid rgba(255,92,53,0.60)" : "1px solid rgba(250,247,242,0.16)",
        background: "rgba(12,11,11,0.62)",
        color: ink,
        fontSize: 12.5,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        whiteSpace: "nowrap",
        boxShadow: live ? "0 0 18px rgba(255,92,53,0.45)" : undefined,
      }}
    >
      {mark}
      {head}
      {tail ? <span style={{ fontWeight: 500, color: "#E4DDD3" }}>{tail}</span> : null}
    </span>
  );
}

export function EventAbout({ event, night, now, onRsvp }: EventAboutProps) {
  const t = palette(night);
  const live = event.state === "live";
  // A closed chat: the pill still reads the RSVP but opens nothing (11.8 hides a closed card's pills; VIS-S2-5).
  const closed = event.state === "closed";
  const tile: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 3,
    minWidth: 0,
    height: 50,
    boxSizing: "border-box",
    padding: "0 12px",
    borderRadius: 16,
    border: `1px solid ${t.hairline}`,
    background: t.raisedSurface,
    color: t.ink,
    boxShadow: night ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "0 1px 2px rgba(20,20,22,0.04)",
  };
  const label: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: t.muted };
  const value: React.CSSProperties = { fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
  const pill = rsvpPill(event.viewer_status);
  const going = event.going.slice(0, 5);

  return (
    <>
      <section aria-label="About this event" style={{ flexShrink: 0, position: "relative", isolation: "isolate", boxSizing: "border-box", padding: "2px 12px 0", fontFamily: FONT }}>
        {live ? <div aria-hidden="true" style={{ position: "absolute", zIndex: -1, left: -66, top: 34, width: 340, height: 132, pointerEvents: "none", background: t.bloom }} /> : null}
        <div style={{ position: "relative", height: 96, boxSizing: "border-box", padding: 10, borderRadius: 18, overflow: "hidden", border: `1px solid ${t.hairline}`, display: "flex", alignItems: "flex-end", background: HERO_BG }}>
          <StatePill event={event} now={now} />
        </div>
        <div role="group" aria-label="Plans" style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
          <div style={tile}>
            <span style={label}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
              Where
            </span>
            <span style={value}>{event.location.trim() || "No place yet"}</span>
          </div>
          <div style={tile}>
            <span style={label}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              When
            </span>
            <span style={value}>{eventTime(event.starts_at, now)}</span>
          </div>
        </div>
      </section>
      <div role="group" aria-label={whoIsGoingLabel(event.going_count, event.maybe_count)} style={{ flexShrink: 0, boxSizing: "border-box", padding: "4px 16px 0", display: "flex", alignItems: "center", gap: 10, fontFamily: FONT, color: t.ink }}>
        {going.length > 0 ? (
          <div aria-hidden="true" style={{ display: "flex", flexShrink: 0 }}>
            {going.map((p, i) => {
              const disc = personColor(p.id);
              return (
                <span key={p.id} style={{ width: 30, height: 30, marginLeft: i === 0 ? 0 : -8, borderRadius: 999, border: `2px solid ${t.page}`, boxSizing: "border-box", background: p.avatar_url ? `url(${p.avatar_url}) center/cover` : disc.bg, color: disc.ink, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>
                  {p.avatar_url ? null : initialsOf(p.name || p.handle)}
                </span>
              );
            })}
          </div>
        ) : null}
        <span style={{ minWidth: 0, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {event.going_count} going <span style={{ fontSize: 13, fontWeight: 600, color: t.muted }}>· {event.maybe_count} maybe</span>
        </span>
        <button type="button" aria-label={pill.label} aria-disabled={closed || undefined} onClick={closed ? undefined : onRsvp} style={{ marginLeft: "auto", flexShrink: 0, height: 44, padding: 0, border: "none", background: "transparent", fontFamily: "inherit", cursor: closed ? "default" : "pointer", display: "flex", alignItems: "center", WebkitTapHighlightColor: "transparent" }}>
          <span style={{ height: 34, boxSizing: "border-box", padding: event.viewer_status ? "0 12px 0 8px" : "0 14px", borderRadius: 999, border: event.viewer_status === "going" ? "1px solid rgba(255,92,53,0.50)" : `1px solid ${t.hairline}`, background: event.viewer_status === "going" ? "rgba(255,92,53,0.16)" : t.surface, color: t.ink, fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
            {event.viewer_status === "going" ? (
              <span aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 999, background: t.coral, color: "#140806", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
            ) : event.viewer_status === "maybe" ? (
              <span aria-hidden="true" style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 999, background: t.muted }} />
            ) : null}
            {pill.text}
          </span>
        </button>
      </div>
    </>
  );
}
