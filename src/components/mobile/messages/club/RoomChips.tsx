"use client";

import type { SpaceRoom } from "@/lib/chat/types";

import { FONT, palette } from "../v2-tokens";
import { chipAriaLabel, chipLabel } from "./helpers";

/**
 * The room chips of the club space (handoffs/chat-redesign/wave-2-contracts.md
 * 11.3, 1.2; mockup `W0_Club:52-57`, MK:0.2): a 45px `<nav aria-label="Rooms
 * in <club>">` holding `rooms` in the server's order (lounge, board, officers
 * when I may enter, event rooms, then rooms), each chip a 44px hit area around
 * a 30px pill (11px sides, 5px gaps: one pixel under the mockup's each, so
 * Lounge · Board · Officers · <event> fit at 375 without a cut chip; more
 * chips scroll; VIS-S2-4).
 *
 * `aria-current="page"` marks the open Board / Lounge / `room`. An event chip
 * NEVER becomes the active chip: it opens the event chat layer (SCREENS-M1).
 * The Board's dot comes from `rooms[board].unread`; the Officers chip carries
 * no dot in v1 (7.2.3). Labels and `aria-label`s are 1.2's (helpers.ts).
 */
export type RoomChipsProps = {
  clubName: string;
  rooms: SpaceRoom[];
  /** The open room's id (never an event room's). */
  activeRoomId: string | null;
  night: boolean;
  now: Date;
  onPick: (room: SpaceRoom) => void;
};

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

export function RoomChips({ clubName, rooms, activeRoomId, night, now, onPick }: RoomChipsProps) {
  const t = palette(night);
  const inactiveBorder = night ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(20,20,22,0.12)";
  return (
    <nav
      aria-label={`Rooms in ${clubName}`}
      style={{
        flexShrink: 0,
        height: 45,
        boxSizing: "border-box",
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 5,
        borderTop: `1px solid ${t.hairline}`,
        overflowX: "auto",
        overflowY: "hidden",
        scrollbarWidth: "none",
        fontFamily: FONT,
      }}
    >
      {rooms.map((room) => {
        const active = room.kind !== "event" && room.id === activeRoomId;
        const label = chipAriaLabel(room, now);
        const icon = room.kind === "officers" ? <LockIcon /> : room.kind === "event" ? <CalendarIcon /> : null;
        const dot = room.kind === "board" && room.unread;
        return (
          <button
            key={room.id}
            type="button"
            aria-current={active ? "page" : undefined}
            aria-label={label ?? undefined}
            onClick={() => onPick(room)}
            style={{
              height: 44,
              flexShrink: 0,
              padding: 0,
              border: "none",
              background: "transparent",
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              fontFamily: "inherit",
              color: "inherit",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span
              style={{
                height: 30,
                boxSizing: "border-box",
                padding: icon ? "0 11px 0 9px" : dot ? "0 9px 0 11px" : "0 11px",
                borderRadius: 999,
                border: active ? "1px solid transparent" : inactiveBorder,
                background: active ? t.activeChip.bg : "transparent",
                color: active ? t.activeChip.ink : t.secondary,
                fontSize: 13,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: icon ? 5 : 6,
                whiteSpace: "nowrap",
              }}
            >
              {icon}
              {chipLabel(room)}
              {dot ? (
                <span aria-hidden="true" style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 999, background: t.coral }} />
              ) : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
