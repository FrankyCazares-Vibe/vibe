"use client";

import { useSyncExternalStore } from "react";

import { DesktopPopover } from "@/components/desktop/messages/DesktopDialog";
import type { RoomKind } from "@/lib/chat/types";

import { useChatSurface } from "../surface";
import { useNightTheme } from "../theme";
import { FONT, SERIF, palette } from "../v2-tokens";

/**
 * The "+" tray (wave-2 contract 11.7, 1.2; mockup W0_Tray, MK:8): the picker
 * under the composer's "+" that opens one of the three sheets.
 *
 * In flow ABOVE the composer, with the tail pointing at the "+", so the
 * composer's own "+" (`aria-expanded`, `Close the tray` while open) stays
 * where it is. The scrim covers the thread: it is absolute over the room's
 * column, so the room mounts the tray inside a `position: relative` box and
 * gives its composer a z-index above the scrim's (the mockup: scrim 1, tray
 * and footer 2). A row opens its sheet and closes the tray; the scrim or the
 * "+" (now an X) closes it. The room shows it only when `viewer.can_post`.
 *
 * On the desktop surface (wave-3 contract 6.3, 1.3 K5) the same caption and
 * the same three rows sit in a `DesktopPopover` anchored to the "+"
 * (`anchorRef`), 320 wide: in flow they would be three 72px rows stretched
 * across the whole pane with the thread dimmed behind them. No scrim there.
 * The phone surface is the block described above, unchanged.
 */

export type CardTrayKind = "poll" | "signup" | "event";

export type CardTrayProps = {
  roomKind: RoomKind;
  roomName: string;
  clubName: string;
  open: boolean;
  onClose: () => void;
  onPick: (kind: CardTrayKind) => void;
  /** The composer's "+": the desktop popover's anchor, and where its focus goes back. Only `RoomComposer` passes it. */
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
};

/** `Add to the Lounge` / `Add to the Board` / `Add to the event chat` / `Add to <room name>` (1.2). */
export function trayCaption(roomKind: RoomKind, roomName: string): string {
  switch (roomKind) {
    case "lounge":
      return "Add to the Lounge";
    case "board":
      return "Add to the Board";
    case "event":
      return "Add to the event chat";
    default:
      // `room` and (S3-notes STOPPED 2) `officers`: the room's own name.
      return `Add to ${roomName}`;
  }
}

const ROWS: { kind: CardTrayKind; title: string; line: string }[] = [
  { kind: "poll", title: "Poll", line: "Ask the room a question" },
  { kind: "signup", title: "Sign-up", line: "Shifts, rides, who brings what" },
  { kind: "event", title: "Event", line: "Share an event with Going / Maybe" },
];

function RowIcon({ kind }: { kind: CardTrayKind }) {
  if (kind === "poll") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <path d="M6 20V11M12 20V5M18 20v-6" />
      </svg>
    );
  }
  if (kind === "signup") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5.5" y="4.5" width="13" height="16" rx="2" />
        <path d="M9 3.5h6v3H9z" />
        <path d="M9 13.5l2 2 4-4" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  );
}

/** The "+" never changes while the tray is open: a store with nothing to subscribe to. */
const noChange = () => () => {};

/**
 * The desktop tray's box: `DesktopPopover` with `anchor` = the node behind
 * `anchorRef` (contract 6.3's `anchorRef?.current ?? null`). It is mounted
 * only while the tray is open, so the "+" is on screen by then. The node is
 * read as a snapshot, not in the render's own body (a ref is not read while
 * rendering; the lint rule `react-hooks/refs`), the way `theme.ts` reads the
 * page's theme.
 */
function DesktopTray({ anchorRef, label, onClose, children }: { anchorRef: CardTrayProps["anchorRef"]; label: string; onClose: () => void; children: React.ReactNode }) {
  const anchor = useSyncExternalStore(
    noChange,
    () => anchorRef?.current ?? null,
    () => null,
  );
  return (
    <DesktopPopover anchor={anchor} label={label} onClose={onClose} width={320} align="start">
      <div style={{ boxSizing: "border-box", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </DesktopPopover>
  );
}

export function CardTray({ roomKind, roomName, open, onClose, onPick, anchorRef }: CardTrayProps) {
  const night = useNightTheme();
  const surface = useChatSurface();
  const t = palette(night);
  if (!open) return null;

  const caption = trayCaption(roomKind, roomName);
  // A tint that is white on Night's paper and ink on Light's (`--scrim-rgb`).
  const rowBg = "rgba(var(--scrim-rgb),0.04)";
  const rowBorder = "1px solid rgba(var(--scrim-rgb),0.07)";
  const discBg = "rgba(var(--scrim-rgb),0.07)";

  // The caption and the three rows: the same nodes on both surfaces.
  const captionRow = (
    <div
      style={{
        height: 20,
        boxSizing: "border-box",
        padding: "0 6px",
        display: "flex",
        alignItems: "center",
        fontSize: 12,
        fontWeight: 700,
        color: t.muted,
      }}
    >
      {caption}
    </div>
  );
  const rows = ROWS.map((row) => (
    <button
      key={row.kind}
      type="button"
      onClick={() => onPick(row.kind)}
      style={{
        minHeight: 72,
        width: "100%",
        boxSizing: "border-box",
        padding: "0 10px 0 12px",
        borderRadius: 14,
        border: rowBorder,
        background: rowBg,
        color: t.ink,
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        fontFamily: FONT,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 999,
          background: discBg,
          color: t.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <RowIcon kind={row.kind} />
      </span>
      <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, lineHeight: 1.2, letterSpacing: -0.2 }}>
          {row.title}
        </span>
        <span style={{ fontSize: 13, lineHeight: 1.3, color: t.secondary }}>{row.line}</span>
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  ));

  // The desktop surface: a popover on the "+", opening upward (the composer
  // is at the foot of the pane, so `DesktopPopover` finds no room under it).
  // No scrim and no tail; the popover's own surface (`t.surface`), border
  // and shadow; Esc, a press outside and Back close it, and focus goes back
  // to the "+" (all `DesktopPopover`'s).
  if (surface === "desktop") {
    return (
      <DesktopTray anchorRef={anchorRef} label={caption} onClose={onClose}>
        {captionRow}
        {rows}
      </DesktopTray>
    );
  }

  // The raised surface: the mockup's `#1C1A1A` in Night; Light is not drawn
  // (MK:8), so the app's paper and hairline stand in.
  const trayBg = night ? "#1C1A1A" : t.surface;
  const trayBorder = `1px solid ${t.fieldBorder}`;
  const trayShadow = night ? "0 -10px 30px rgba(0,0,0,0.55)" : "0 -10px 30px rgba(20,20,22,0.18)";

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "absolute",
          zIndex: 1,
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          background: t.scrim,
        }}
      />
      <nav
        aria-label={caption}
        // Open and not a dialog: tells BuildRefresh not to reload the page
        // under it (src/lib/build/page-snapshot.ts).
        data-holds-reload
        style={{
          flexShrink: 0,
          position: "relative",
          zIndex: 2,
          margin: "0 12px 8px",
          boxSizing: "border-box",
          padding: 8,
          borderRadius: 20,
          border: trayBorder,
          background: trayBg,
          boxShadow: trayShadow,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontFamily: FONT,
          color: t.ink,
        }}
      >
        {captionRow}
        {rows}
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 18,
            bottom: -7,
            width: 12,
            height: 12,
            transform: "rotate(45deg)",
            background: trayBg,
            borderRight: trayBorder,
            borderBottom: trayBorder,
          }}
        />
      </nav>
    </>
  );
}
