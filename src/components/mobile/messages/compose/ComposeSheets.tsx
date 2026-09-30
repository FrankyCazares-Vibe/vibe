"use client";

import type { ChatMessage, RoomKind } from "@/lib/chat/types";

import { useNightTheme } from "../theme";
import { NewPollSheet } from "./NewPollSheet";
import { NewSignupSheet } from "./NewSignupSheet";
import { ShareEventSheet } from "./ShareEventSheet";

/**
 * The mount point for the three card sheets (wave-2 contract 11.7): the
 * room mounts ONE `ComposeSheets` and sets `kind` from the tray's pick;
 * `null` closes whichever sheet is open (the sheet unmounts, so its draft
 * does not survive a close — "drafts surviving a close" is not in v1).
 *
 * Each sheet ends in `onPosted(message)` on a 201 (the room's
 * `append(message)`), or `onReload()` after a 503 `try_again` (the room's
 * `reload()`, the sheet never re-submitting), and `onClose()` on every
 * other way out. `returnFocusTo` is the composer's "+", focused again on
 * close (11.0 accessibility). `orgId` (optional) draws the club dot on the
 * sheet's `<club> · <room>` line in the club's own colour.
 */

export type ComposeSheetKind = "poll" | "signup" | "event";

export type ComposeSheetsProps = {
  kind: ComposeSheetKind | null;
  roomId: string;
  roomKind: RoomKind;
  roomName: string;
  clubName: string;
  orgHandle: string;
  /** The club's id (`room.org.id`): the 14px dot beside `<club> · <room>`; absent → no dot. */
  orgId?: string | null;
  onClose: () => void;
  onPosted: (message: ChatMessage) => void;
  onReload: () => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

export function ComposeSheets({ kind, roomId, roomKind, roomName, clubName, orgHandle, orgId, onClose, onPosted, onReload, returnFocusTo }: ComposeSheetsProps) {
  const night = useNightTheme();
  if (kind === null) return null;
  const common = { roomId, roomKind, roomName, clubName, orgId, night, onClose, onPosted, onReload, returnFocusTo };
  if (kind === "poll") return <NewPollSheet {...common} />;
  if (kind === "signup") return <NewSignupSheet {...common} />;
  return <ShareEventSheet {...common} orgHandle={orgHandle} />;
}
