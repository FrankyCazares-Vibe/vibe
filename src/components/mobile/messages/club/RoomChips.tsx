"use client";

import type { SpaceRoom } from "@/lib/chat/types";

import { useChatSurface } from "../surface";
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
 *
 * The chip of the room being shown NEVER draws the unread dot and never says
 * `1 unread post` (S71 amendment 3, C; audit F05): the space read is 20 s
 * behind the thread, so a post I am looking at would light the dot on the
 * chip I am on until the next space read.
 *
 * Wave 3 (handoffs/chat-redesign/wave-3-desktop/contract.md 4c.4, 6.3).
 * BOTH surfaces: the lock on the Officers chip and on every private room
 * that is not an event chat (`room.locked`), and the megaphone before the
 * word `Board` (C9: the Board reads as announcements). DESKTOP surface only
 * (`useChatSurface()`): an event chat opens in place like any room, so its
 * chip is drawn selected while it is the open room; the row wraps instead of
 * scrolling sideways, so every room is reachable with a mouse; and the
 * `<nav>` draws no top border and no side padding, because `ClubPane` places
 * the chips inside the club header's row.
 */
export type RoomChipsProps = {
  clubName: string;
  rooms: SpaceRoom[];
  /** The open room's id (on the phone never an event room's; on desktop it may be one). */
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

/** The Board's mark: `BoardStrip`'s megaphone path at the chip icons' 12px, in the chip's own ink. */
function MegaphoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1z" />
      <path d="M16 9a4.5 4.5 0 0 1 0 6" />
      <path d="M18.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

export function RoomChips({ clubName, rooms, activeRoomId, night, now, onPick }: RoomChipsProps) {
  const t = palette(night);
  const desktop = useChatSurface() === "desktop";
  const inactiveBorder = `1px solid ${t.chipBorder}`;
  // Desktop: inside the club header's row, so no hairline and no side padding
  // of its own, and the chips wrap (no sideways scroll). Phone: the 45px row
  // under the header as before, scrolling sideways when the chips do not fit.
  // The wrap needs a width to wrap in: as an item of the header's row the
  // `<nav>` must be allowed to get narrower than its one-line width
  // (`flexShrink: 1`, `minWidth: 0`), or the chips run off the row instead.
  const row: React.CSSProperties = desktop
    ? { flexShrink: 1, minWidth: 0, height: "auto", minHeight: 45, padding: 0, borderTop: "none", flexWrap: "wrap" }
    : { flexShrink: 0, height: 45, padding: "0 12px", borderTop: `1px solid ${t.hairline}`, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" };
  return (
    <nav
      aria-label={`Rooms in ${clubName}`}
      style={{
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontFamily: FONT,
        ...row,
      }}
    >
      {rooms.map((room) => {
        // On the phone an event chip never becomes the active chip (it opens
        // the event chat layer); on desktop the event chat is the open room.
        const active = (desktop || room.kind !== "event") && room.id === activeRoomId;
        // The open room is read by being on screen: no dot, no "unread" word.
        const unread = room.unread && !active;
        const label = chipAriaLabel(unread === room.unread ? room : { ...room, unread }, now);
        // The lock: the Officers room, and any private room that is not an event chat (4c.4).
        const locked = room.kind === "officers" || (room.locked && room.kind !== "event");
        const icon = locked ? <LockIcon /> : room.kind === "event" ? <CalendarIcon /> : room.kind === "board" ? <MegaphoneIcon /> : null;
        const dot = room.kind === "board" && unread;
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
                // 9px on a side that holds a mark (the icon on the left, the dot on the right), else 11px.
                padding: `0 ${dot ? 9 : 11}px 0 ${icon ? 9 : 11}px`,
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
