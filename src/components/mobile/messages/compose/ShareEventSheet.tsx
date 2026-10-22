"use client";

import { useEffect, useId, useState } from "react";

import type { ChatMessage, EventRef, RoomKind, SpaceResponse } from "@/lib/chat/types";
import { eventWhen, eventWhenSpoken } from "@/lib/chat/when";
import { MembersOnlyChip } from "@/components/events/MembersOnlyChip";
import { isMembersOnly, MEMBERS_ONLY_COPY, shareRefused } from "@/components/events/members-only";
import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";

import { deviceZone, shareEventLabel, shareEventLine, whenParts } from "../cards/card-rules";
import { CoralDisc, Ring } from "../cards/card-parts";
import { palette, SERIF } from "../v2-tokens";
import { CardSheet, Counter, FieldLabel, fieldStyle, useCardPost } from "./CardSheet";
import { charCount, eventValid, NOTE_MAX, shareCta, sheetRoomLine } from "./sheet-rules";

/**
 * The Share-an-event sheet (wave-2 contract 11.7, 1.2; mockup W0_ShareEvent,
 * MK:11): `Upcoming events` = `GET /api/orgs/<handle>/space?events=1` →
 * `upcoming` (7.2.6, open point 14.44), read when the sheet opens: a
 * `radiogroup` of 66px rows with the date tile, the title, `<Thu> · <7:30
 * PM>[ · <place>]` and the mark (`aria-label="<title>, <Thursday October
 * 8, 7:30 PM>[, <place>][, selected]"`); `No upcoming events.` when empty
 * (the CTA stays disabled); the read failing → `LoadFailed compact`
 * (`Couldn't load your events.`) in the list's place, Retry re-reads, the
 * CTA disabled (SCREENS-L9). Then the note input (`Add a line (optional)`,
 * 200 max, the counter), the helper `Members who tap Going or Interested join the
 * event chat.`, the CTA `Share to <room>` → `POST …/cards { type: "event",
 * event_id, note? }`. The `New event · Officers only` link is not built
 * (open point 14.19).
 *
 * Members only (Oct 22, 2026, PLAN-2.md): a members-only event's row carries
 * the "Members only" chip. On the Board, which followers read, those rows
 * can't be picked (`aria-disabled`, dimmed) and one line under the list says
 * why; the cards route refuses them there too. Every other room is
 * members-only already, so there they can be picked as usual.
 */
export type ShareEventSheetProps = {
  roomId: string;
  roomKind: RoomKind;
  roomName: string;
  clubName: string;
  orgHandle: string;
  orgId?: string | null;
  night: boolean;
  onClose: () => void;
  onPosted: (message: ChatMessage) => void;
  onReload: () => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

type Events = { status: "loading" } | { status: "ok"; rows: EventRef[] } | { status: "failed"; failure: LoadFailure };

const EVENTS_LINE = "Couldn't load your events.";
const POST_FAILURE = "Couldn't share this event.";

export function ShareEventSheet({ roomId, roomKind, roomName, clubName, orgHandle, orgId, night, onClose, onPosted, onReload, returnFocusTo }: ShareEventSheetProps) {
  const t = palette(night);
  const ids = useId();
  const eventsLabelId = `${ids}-events`;
  const boardOffId = `${ids}-board-off`;
  const [events, setEvents] = useState<Events>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const { posting, field, clearField, post } = useCardPost({ roomId, failure: POST_FAILURE, onPosted, onReload, onClose });
  const zone = deviceZone();

  // The list, read when the sheet opens and on Retry; the state is set in
  // the read's callback after the answer, never in the effect's body.
  useEffect(() => {
    let live = true;
    const read = async () => {
      const r = await vibeRequest<SpaceResponse>(`/api/orgs/${encodeURIComponent(orgHandle)}/space?events=1`, {
        quiet: true,
        failure: EVENTS_LINE,
        cache: "no-store",
      });
      if (!live) return;
      if (!r.ok || !Array.isArray(r.data?.upcoming)) {
        setEvents({ status: "failed", failure: asLoadFailure(r, EVENTS_LINE) });
        return;
      }
      setEvents({ status: "ok", rows: r.data.upcoming });
    };
    void read();
    return () => {
      live = false;
    };
  }, [orgHandle, retryToken]);

  // A refused row can't be picked, and a pick a Retry turned members-only
  // can't be sent either.
  const refused = (ev: EventRef) => shareRefused(roomKind, ev);
  const selectedRefused = events.status === "ok" && events.rows.some((ev) => ev.id === selected && refused(ev));
  const anyRefused = events.status === "ok" && events.rows.some(refused);
  const valid = events.status === "ok" && eventValid(selected, note) && !selectedRefused;

  const submit = () => {
    if (!valid || selected === null) return;
    const line = note.trim();
    void post({ type: "event", event_id: selected, ...(line ? { note: line } : {}) });
  };

  let list: React.ReactNode;
  if (events.status === "loading") {
    list = (
      <div aria-hidden style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ height: 66, borderRadius: 16, background: "rgba(var(--scrim-rgb),0.06)" }} />
        ))}
      </div>
    );
  } else if (events.status === "failed") {
    list = (
      <LoadFailed
        failure={events.failure}
        compact
        tone={night ? "dark" : "light"}
        onRetry={() => {
          setEvents({ status: "loading" });
          setRetryToken((n) => n + 1);
        }}
      />
    );
  } else if (events.rows.length === 0) {
    list = <div style={{ minHeight: 44, display: "flex", alignItems: "center", fontSize: 13, fontWeight: 500, color: t.secondary }}>No upcoming events.</div>;
  } else {
    list = events.rows.map((ev) => {
      const off = refused(ev);
      const on = selected === ev.id && !off;
      const membersOnly = isMembersOnly(ev);
      const when = eventWhen(ev.starts_at, zone);
      const parts = whenParts(when);
      const spoken = shareEventLabel(ev.title, eventWhenSpoken(ev.starts_at, zone), ev.location, on);
      return (
        <button
          key={ev.id}
          type="button"
          role="radio"
          aria-checked={on}
          aria-disabled={off || undefined}
          aria-describedby={off ? boardOffId : undefined}
          aria-label={off ? `${spoken}, ${MEMBERS_ONLY_COPY.boardOffSpoken}` : membersOnly ? `${spoken}, ${MEMBERS_ONLY_COPY.chip.toLowerCase()}` : spoken}
          onClick={() => {
            if (off) return;
            clearField();
            setSelected(ev.id);
          }}
          style={{
            width: "100%",
            minHeight: 66,
            boxSizing: "border-box",
            padding: "8px 12px 8px 10px",
            borderRadius: 16,
            border: on ? "1px solid rgba(255,92,53,0.50)" : "1px solid rgba(var(--scrim-rgb),0.08)",
            background: on ? "rgba(255,92,53,0.10)" : "rgba(var(--scrim-rgb),0.03)",
            color: t.ink,
            fontFamily: "inherit",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            gap: 12,
            cursor: off ? "default" : "pointer",
            // Dimmed, not hidden: the officer sees the event is there and
            // reads, just below, why the Board can't take it.
            opacity: off ? 0.55 : 1,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <span aria-hidden style={{ width: 44, height: 48, flexShrink: 0, borderRadius: 14, background: "rgba(var(--scrim-rgb),0.07)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, lineHeight: "12px", color: t.secondary }}>{parts.month}</span>
            <span style={{ fontSize: 17, fontWeight: 800, lineHeight: "18px", color: t.ink }}>{parts.day}</span>
          </span>
          <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16.5, lineHeight: 1.2, letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              {membersOnly ? <MembersOnlyChip size="row" /> : null}
              <span style={{ minWidth: 0, fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, color: t.secondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shareEventLine(when, ev.location)}</span>
            </span>
          </span>
          {on ? <CoralDisc size={22} /> : <Ring size={22} color={t.ringGrey} />}
        </button>
      );
    });
  }

  return (
    <CardSheet title="Share an event" roomLine={sheetRoomLine(clubName, roomKind, roomName)} orgId={orgId} night={night} cta={shareCta(roomKind, roomName)} ctaDisabled={!valid} posting={posting} onSubmit={submit} onClose={onClose} returnFocusTo={returnFocusTo}>
      <div role="radiogroup" aria-labelledby={eventsLabelId} style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <FieldLabel id={eventsLabelId} night={night}>
          Upcoming events
        </FieldLabel>
        {list}
        {anyRefused ? (
          <p id={boardOffId} style={{ margin: 0, fontSize: 12.5, lineHeight: 1.35, fontWeight: 500, color: t.secondary }}>
            {MEMBERS_ONLY_COPY.boardOff}
          </p>
        ) : null}
      </div>

      <div style={{ marginTop: 12, boxSizing: "border-box", paddingTop: 12, borderTop: "1px solid rgba(var(--scrim-rgb),0.07)", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* The note has no label word (1.2), so its counter sits inside the field's right end instead of alone on a row (VIS-S3-4). */}
        <div style={{ position: "relative" }}>
          <input
            type="text"
            aria-label="Add a line, optional"
            placeholder="Add a line (optional)"
            aria-invalid={field === "note" || undefined}
            value={note}
            autoComplete="off"
            onChange={(e) => {
              clearField();
              setNote(e.target.value);
            }}
            style={{ ...fieldStyle(night, field === "note"), fontWeight: 500, paddingRight: 72 }}
          />
          <span aria-hidden style={{ position: "absolute", top: 0, right: 14, height: 48, display: "flex", alignItems: "center", pointerEvents: "none" }}>
            <Counter n={charCount(note)} max={NOTE_MAX} night={night} />
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.35, fontWeight: 500, color: t.secondary }}>Members who tap Going or Interested join the event chat.</p>
      </div>
    </CardSheet>
  );
}
