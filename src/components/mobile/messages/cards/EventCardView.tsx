"use client";

import { useState } from "react";

import { emitCalendarChanged } from "@/lib/calendar/calendar-sync";
import type { EventCard, ThreadRoom } from "@/lib/chat/types";
import { eventWhen, eventWhenSpoken } from "@/lib/chat/when";
import { vibeRequest } from "@/lib/feedback/request";

import { toastSendFailure } from "../send-failure";
import { palette, SERIF } from "../v2-tokens";
import {
  announceRsvp,
  APPEAR_LINE,
  cancelledEventLabel,
  deviceZone,
  EVENT_CANCELLED_LINE,
  eventCardLabel,
  eventPlaceLine,
  fallbackEventTitle,
  goingWord,
  OPEN_EVENT_CHAT,
  showAppearLine,
} from "./card-rules";
import { Chevron, ClubDisc, CoralDisc, PillSpinner, Ring } from "./card-parts";

/**
 * An Event card inside `CardBubble` (wave-2 contract 11.8, 1.2 "Cards";
 * mockup W0_Cards 7.4): the 48px club band over the gradient (the club's
 * logo or initials, its name), the `<Name> · Event` line, the 19px/700
 * Fraunces title, `<place> · <Thu Oct 8, 7:30 PM>` (the place omitted when
 * empty), the note line when present, `Going` / `Interested` pills
 * (`aria-pressed`) in `role="group" aria-label="Your RSVP"`, the line
 * `You'll appear in the event chat.` while the viewer has no RSVP and no
 * room (14.41), `<N> going`, and `Open event chat` when `room_id` is set.
 *
 * A pill → `PUT /api/events/<id>/rsvp { status }` (the pressed one →
 * `DELETE`), then `onRefresh(created_at)` re-reads this one message and
 * `emitCalendarChanged()` tells whoever shows the viewer's plans (the
 * desktop's My Calendar and week band; wave-3 contract 6.3) to read again;
 * the refusal toast goes through `toastSendFailure`. `event === null` → the
 * title from the fallback text, `This event was cancelled.`, no buttons.
 * `state === "closed"` → the pills are hidden, `Open event chat` stays.
 */
export type EventCardViewProps = {
  card: EventCard;
  /** The stored fallback text (`Event: <title> · …`), the title's source when the event is gone. */
  content: string;
  room: ThreadRoom | null;
  createdAt: string;
  author: string | null;
  isMine: boolean;
  night: boolean;
  header: React.ReactNode;
  onRefresh: (createdAt: string) => void;
  onOpenEventChat: (roomId: string) => void;
  onAnnounce: (text: string) => void;
};

const BAND_BG =
  "radial-gradient(150px 90px at 92% 0%, rgba(255,196,128,0.55) 0%, rgba(255,196,128,0) 70%), linear-gradient(112deg, #2A0E1E 0%, #6E1F33 42%, #C2452F 78%, #FF5C35 100%)";

type Status = "going" | "maybe";

export function EventCardView({ card, content, room, createdAt, author, isMine, night, header, onRefresh, onOpenEventChat, onAnnounce }: EventCardViewProps) {
  const t = palette(night);
  const [busy, setBusy] = useState<Status | null>(null);
  const event = card.event;
  const org = room?.org ?? null;

  const rsvp = async (status: Status) => {
    if (!event || busy !== null) return;
    setBusy(status);
    const url = `/api/events/${encodeURIComponent(event.id)}/rsvp`;
    const remove = event.viewer_status === status;
    const r = remove
      ? await vibeRequest(url, { method: "DELETE", failure: "Couldn't change your RSVP.", quiet: true })
      : await vibeRequest(url, { method: "PUT", json: { status }, failure: "Couldn't save your RSVP.", quiet: true });
    setBusy(null);
    if (!r.ok) {
      toastSendFailure(r);
      return;
    }
    onRefresh(createdAt);
    emitCalendarChanged();
    onAnnounce(announceRsvp(remove ? null : status));
  };

  const band = org ? (
    <div style={{ height: 48, boxSizing: "border-box", padding: "0 12px", display: "flex", alignItems: "center", gap: 7, background: BAND_BG }}>
      <ClubDisc org={org} size={22} fontSize={9} ring="1.5px solid rgba(250,247,242,0.7)" />
      {/* The name ends by x ≈ 197px: past ~205px the band's gradient (with the peach radial tint) drops #FAF7F2 under 4.5:1 (11.0; S3-DESIGN-3). */}
      <span style={{ minWidth: 0, maxWidth: 156, fontFamily: SERIF, fontWeight: 700, fontSize: 14, color: "#FAF7F2", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{org.name}</span>
    </div>
  ) : null;

  const title = (text: string) => (
    <h3 style={{ margin: "4px 0 0", fontFamily: SERIF, fontWeight: 700, fontSize: 19, lineHeight: 1.15, letterSpacing: -0.3, color: t.ink, overflowWrap: "anywhere" }}>{text}</h3>
  );

  if (event === null) {
    const name = fallbackEventTitle(content);
    return (
      <article aria-label={cancelledEventLabel(name, author, isMine)}>
        {band}
        <div style={{ boxSizing: "border-box", padding: "9px 12px 9px", display: "flex", flexDirection: "column" }}>
          {header}
          {title(name)}
          <div style={{ marginTop: 3, fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: t.secondary }}>{EVENT_CANCELLED_LINE}</div>
        </div>
      </article>
    );
  }

  const zone = deviceZone();
  const when = eventWhen(event.starts_at, zone);
  const whenSpoken = eventWhenSpoken(event.starts_at, zone);
  const closed = event.state === "closed";
  const label = eventCardLabel({ title: event.title, location: event.location, whenSpoken, going: event.going_count, status: event.viewer_status }, author, isMine);

  const pill = (status: Status, text: string) => {
    const pressed = event.viewer_status === status;
    const spinning = busy === status;
    return (
      <button
        type="button"
        aria-pressed={pressed}
        aria-disabled={busy !== null || undefined}
        onClick={() => void rsvp(status)}
        style={{
          height: 44,
          minWidth: 0,
          boxSizing: "border-box",
          padding: "0 12px",
          borderRadius: 999,
          border: pressed ? "1px solid rgba(255,92,53,0.50)" : "1px solid rgba(var(--scrim-rgb),0.12)",
          background: pressed ? "rgba(255,92,53,0.16)" : "rgba(var(--scrim-rgb),0.04)",
          color: pressed ? t.ink : t.secondary,
          fontFamily: "inherit",
          fontSize: 14,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          cursor: busy !== null ? "default" : "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        {spinning ? <PillSpinner color={t.secondary} /> : pressed ? <CoralDisc dot={status === "maybe"} /> : <Ring color={t.ringGrey} />}
        {text}
      </button>
    );
  };

  return (
    <article aria-label={label}>
      {band}
      <div style={{ boxSizing: "border-box", padding: "9px 12px 2px", display: "flex", flexDirection: "column" }}>
        {header}
        {title(event.title)}
        <div style={{ marginTop: 3, fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: t.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{eventPlaceLine(event.location, when)}</div>
        {card.note !== null ? <div style={{ marginTop: 4, fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: t.secondary, overflowWrap: "anywhere" }}>{card.note}</div> : null}
        {!closed ? (
          <div role="group" aria-label="Your RSVP" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {pill("going", "Going")}
            {/* "Interested", not "Maybe" (Oct 19, 2026, decision 12). */}
            {pill("maybe", "Interested")}
          </div>
        ) : null}
        {showAppearLine(event) ? <div style={{ marginTop: 6, fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: t.secondary }}>{APPEAR_LINE}</div> : null}
        <div style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{goingWord(event.going_count)}</span>
          {event.room_id !== null ? (
            <button
              type="button"
              onClick={() => onOpenEventChat(event.room_id as string)}
              style={{ marginLeft: "auto", minHeight: 44, padding: 0, border: "none", background: "transparent", display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "inherit", fontSize: 13, fontWeight: 700, color: t.coralText, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
            >
              {OPEN_EVENT_CHAT}
              <Chevron />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
