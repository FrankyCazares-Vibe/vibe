"use client";

import type { ChatMessage, RoomKind } from "@/lib/chat/types";

/**
 * The mount point for the three card sheets (wave-2 contract 11.7): the
 * room mounts ONE `ComposeSheets` and sets `kind` from the tray's pick;
 * `null` closes whichever sheet is open.
 *
 * W2-S3's first commit renders nothing here: the signature is what W2-S2's
 * `RoomComposer` builds against. The main W2-S3 batch fills it with
 * `CardSheet` (the shared chrome) and `NewPollSheet`, `NewSignupSheet`,
 * `ShareEventSheet`, which end in `onPosted(message)` on a 201 (the room's
 * `append(message)`), or `onReload()` after a 503 `try_again` (the room's
 * `reload()`, the sheet never re-submitting), and `onClose()` on every
 * other way out. `returnFocusTo` is the composer's "+", focused again on
 * close (11.0 accessibility).
 */

export type ComposeSheetKind = "poll" | "signup" | "event";

export type ComposeSheetsProps = {
  kind: ComposeSheetKind | null;
  roomId: string;
  roomKind: RoomKind;
  roomName: string;
  clubName: string;
  orgHandle: string;
  onClose: () => void;
  onPosted: (message: ChatMessage) => void;
  onReload: () => void;
  returnFocusTo?: React.RefObject<HTMLElement | null>;
};

// Typed against the final props so the mount compiles today; the props are
// read once the sheets land (the main W2-S3 batch).
export const ComposeSheets: (props: ComposeSheetsProps) => React.ReactNode = () => null;
