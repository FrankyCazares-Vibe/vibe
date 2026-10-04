/**
 * Desktop Messages' pinned prop types (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 3.3, word for word; W3-1-pure). Types only, and nothing else:
 * every component of `src/components/desktop/messages/` takes its props from
 * here, so a batch can code against a sibling that is not built yet. A
 * placeholder is a component with its FINAL props type from this file that
 * returns `null` (3.1).
 *
 * `LegacyThreadPane` is `forwardRef<LegacyThreadPaneHandle,
 * LegacyThreadPaneProps>`; every other component is a plain named export with
 * the same name as its file.
 */

import type { ReactNode } from "react";
import type { HomeData } from "@/components/mobile/messages/home/MessagesHome";
import type { HomeFilter, WeekEntry } from "@/components/mobile/messages/home/home-rules";
import type { RoomKind, ThreadMessagesResponse } from "@/lib/chat/types";
import type { DmPageEvent } from "./dm-bridge";
import type { SlimRow } from "./desktop-rules";

export type MessagesDesktopProps = { initialHandle?: string; initialChannelId?: string };

export type WeekBandProps = { data: HomeData; folded: boolean; night: boolean; onOpenRoom: (entry: WeekEntry) => void };
export type MonthPopoverProps = { anchor: HTMLElement | null; initialDay: Date; now: Date; night: boolean; onClose: (picked: Date | null) => void; onOpenRoom: (entry: WeekEntry) => void };

export type InboxWideProps = {
  data: HomeData; filter: HomeFilter; night: boolean;
  onFilter: (filter: HomeFilter) => void;
  onOpenClub: (orgHandle: string, roomId: string, roomKind: RoomKind) => void;
  onOpenThread: (threadId: string) => void;
  onNew: () => void;
};
export type SlimListProps = { rows: SlimRow[]; night: boolean; onHome: () => void; onOpen: (row: SlimRow) => void };
export type NewChatDialogProps = { night: boolean; onClose: () => void; onCreated: (channelId: string) => void };

export type ClubPaneProps = {
  orgHandle: string;
  roomId: string;
  roomKind: RoomKind | null;                      // null until the space or the thread read names it
  initialPage: ThreadMessagesResponse | null;     // the resolving read of a deep link, reused as the room's first page
  night: boolean;
  contentWidth: number;
  onSwitchRoom: (roomId: string, roomKind: RoomKind | null) => void;  // the shell writes the address (replaceState)
  onLost: (message: string) => void;              // a later 403 / 404: the shell goes home and toasts the message
  onOrg: (org: { id: string; handle: string; name: string; logo_url: string | null }) => void; // names a club the inbox does not list
  onListsChanged: () => void;                     // the shell bumps refreshKey
  onRsvpChanged: () => void;                      // the shell calls emitCalendarChanged()
};
export type ClubPanelProps = {
  space: import("@/lib/chat/types").SpaceResponse;
  activeRoomKind: RoomKind | null;
  night: boolean; now: Date; mode: "side" | "overlay";
  faces: import("@/lib/chat/types").Person[] | null;   // null while the roster loads or after it failed
  onHide: () => void;
  onOpenRoom: (roomId: string, roomKind: RoomKind) => void;   // an event row -> its chat; a Board post -> the Board
  onRsvp: (eventId: string, current: "going" | "maybe" | null) => void;
  onSeeMembers: () => void;
  onManageRooms: (() => void) | null;             // null unless owner or admin; `Manage club` is drawn under the same condition
};
// GET /api/orgs/<handle>/members answers THIS, not Person (members/route.ts:12, :124): `user_id`, no limit, owner first.
export type RosterRow = { user_id: string; role: string; joined_at: string; name: string | null; handle: string | null; avatar_url: string | null; school_verified: boolean };
export type RosterResponse = { ok: true; members: RosterRow[] };
export type RoomPeopleProps = {
  orgHandle: string; roomId: string; night: boolean;
  title: string;                                  // "Also in this room" | "People who can see this room" | "People who can post"
  roster: RosterRow[] | null;                     // the Rooms dialog's ONE unfiltered roster read; null while it loads or after it failed
  skipRoles: readonly string[];                   // ["owner", "admin"]: officers are in every room already, never listed or offered
  onChanged: () => void;                          // after an add or a remove
};
export type EventPanelProps = { event: import("@/lib/chat/types").EventRef & { going: import("@/lib/chat/types").Person[] }; night: boolean; now: Date; mode: "side" | "overlay"; onHide: () => void; onRsvp: () => void };
export type MembersDialogProps = { orgHandle: string; clubName: string; night: boolean; onClose: () => void };
export type RoomsDialogProps = { orgHandle: string; clubName: string; night: boolean; onClose: () => void; onChanged: () => void };

export type LegacyThreadPaneHandle = { jump: (messageId: string) => void; pinsChanged: () => void; setPanel: (open: boolean) => void; focus: () => void };
export type LegacyThreadPaneProps = { threadId: string | null; night: boolean; onEvent: (event: DmPageEvent) => void };   // threadId null = hidden and told to close
export type PinsPanelProps = {
  threadId: string; title: string; night: boolean; mode: "side" | "overlay";
  refreshToken: number;            // bumped when the page says pins-changed
  missedId: string | null;         // the last message the page could not jump to
  onClose: () => void;
  onJump: (messageId: string) => void;
  onChanged: () => void;           // after an unpin made in the panel: the shell tells the page
};
export type DesktopDialogProps = { title: string; onClose: () => void; width?: number; busy?: boolean; ownsHistory?: boolean; children: ReactNode; footer?: ReactNode };   // ownsHistory default true; false when the caller already holds a useLayerHistory entry for it
export type DesktopPopoverProps = { anchor: HTMLElement | null; label: string; onClose: () => void; width?: number; align?: "start" | "end"; children: ReactNode };
