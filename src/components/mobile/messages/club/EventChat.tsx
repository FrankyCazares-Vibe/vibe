"use client";

import { useEffect, useState } from "react";
import { Drawer } from "vaul";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import type { ChatMessage, ThreadMessagesResponse } from "@/lib/chat/types";
import { useHideTabBar } from "@/lib/chat/use-hide-tabbar";
import { useRoomPoll } from "@/lib/chat/use-room-poll";
import { toast } from "@/lib/feedback/toast";

import { clubGradient } from "../avatar";
import { vaulOverlayStyle, visuallyHiddenStyle } from "../sheet-styles";
import { useNightTheme } from "../theme";
import { FONT, palette, SERIF } from "../v2-tokens";
import { BoardStrip } from "./BoardStrip";
import { EventAbout } from "./EventAbout";
import { RoomComposer, type ReplyTarget } from "./RoomComposer";
import { RoomThread } from "./RoomThread";
import { RsvpSheet } from "./RsvpSheet";

/**
 * The event chat layer (handoffs/chat-redesign/wave-2-contracts.md 11.6, 1.2;
 * mockup `W0_Room`, MK:6): a full-screen layer OVER the club space, its own
 * `Drawer.Root direction="right"` at 1101/1102 above the space's 1099/1100,
 * calling `useHideTabBar()` (counted). Opened by an event chip, an Up next
 * card, a week card, a card's `Open event chat` or an event-room deep link;
 * the space keeps the history writes (2.3): Back and the swipe call
 * `onClose`, which the space answers with `history.back()`.
 *
 * Data: the thread GET's `room` with `kind === "event"` (`room.event` =
 * `EventRef & { going }`), read through `useRoomPoll` (`Couldn't load this
 * event chat.`), refreshed on the every-5th full read and at once after an
 * RSVP change (`reload()`). Header: `Back to <club>`, no avatar, the event
 * title, `<club> · event chat`, no right button. Then About (EventAbout.tsx),
 * the Board strip (from the space read underneath), the thread top-anchored,
 * the composer `Message the event chat` or the closed tile. A later 403 on
 * the thread (an RSVP change removed the viewer, 14.25) → the layer closes
 * with the toast `You left the event chat.`. States: the skeleton (the 96px
 * hero block + two 50px tiles + three bars), `LoadFailed` in the About +
 * thread place with Back working.
 */
export type EventChatProps = {
  orgHandle: string;
  club: { id: string; name: string; logo_url: string | null };
  roomId: string;
  /** A deep-linked event room's resolving read (2.3): the hook's first page, so the room is read once (INT-ADJUDICATE-5). */
  initialPage?: ThreadMessagesResponse;
  boardLatest: ChatMessage | null;
  boardUnread: boolean;
  onOpenBoard: () => void;
  onClose: () => void;
};

const EVENT_LINE = "Couldn't load this event chat.";
const SKELETON_DISC = "rgba(var(--scrim-rgb),0.06)";
const SKELETON_BAR = "rgba(var(--scrim-rgb),0.08)";
const SKELETON_BAR_SOFT = "rgba(var(--scrim-rgb),0.05)";

function EventSkeleton() {
  return (
    <div aria-hidden="true" style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: "2px 12px 0", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ height: 96, borderRadius: 18, background: SKELETON_DISC }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
        <div style={{ height: 50, borderRadius: 16, background: SKELETON_DISC }} />
        <div style={{ height: 50, borderRadius: 16, background: SKELETON_DISC }} />
      </div>
      <div style={{ padding: "8px 0 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: ["85%", "60%", "72%"][i], height: 14, borderRadius: 6, background: i === 1 ? SKELETON_BAR_SOFT : SKELETON_BAR }} />
        ))}
      </div>
    </div>
  );
}

export function EventChat({ orgHandle, club, roomId, initialPage, boardLatest, boardUnread, onOpenBoard, onClose }: EventChatProps) {
  useHideTabBar();
  const night = useNightTheme();
  const t = palette(night);
  const poll = useRoomPoll(roomId, { enabled: true, line: EVENT_LINE, initialPage });
  const [now, setNow] = useState<Date>(() => new Date());
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [scrollToken, setScrollToken] = useState(0);
  const [rsvpOpen, setRsvpOpen] = useState(false);

  // The labels' clock: a minute is enough for `Tonight`, `Soon`, `N more days`.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") setNow(new Date());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // The viewer lost the room (a `Not going` by trigger, 14.25): out, with the line.
  const lost = poll.lostAccess;
  useEffect(() => {
    if (!lost) return;
    toast({ message: "You left the event chat.", tone: "info" });
    onClose();
  }, [lost, onClose]);

  const { room, viewer, viewerId, messages, failure } = poll;
  const event = room?.kind === "event" ? room.event : null;
  const title = event?.title || room?.name || "";

  return (
    <Drawer.Root
      open
      direction="right"
      handleOnly
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, zIndex: 1101 }} />
        <Drawer.Content
          style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "100%", background: t.page, color: t.ink, display: "flex", flexDirection: "column", zIndex: 1102, outline: "none", fontFamily: FONT }}
          aria-describedby={undefined}
        >
          <Drawer.Title style={visuallyHiddenStyle}>Event chat</Drawer.Title>
          <header style={{ flexShrink: 0, boxSizing: "border-box", height: "calc(52px + env(safe-area-inset-top, 0px))", padding: "calc(env(safe-area-inset-top, 0px) + 4px) 10px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              aria-label={`Back to ${club.name}`}
              onClick={onClose}
              style={{ width: 44, height: 44, flexShrink: 0, boxSizing: "border-box", borderRadius: 999, border: `1px solid ${t.fieldBorder}`, background: t.raisedSurface, color: t.secondary, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <div style={{ flexGrow: 1, minWidth: 0, boxSizing: "border-box", paddingLeft: 4, display: "flex", flexDirection: "column", gap: 3 }}>
              {title ? (
                <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 800, fontSize: 20, lineHeight: 1.1, letterSpacing: -0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
              ) : (
                <div aria-hidden="true" style={{ width: "55%", height: 18, borderRadius: 6, background: SKELETON_BAR }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, lineHeight: "15px", whiteSpace: "nowrap", color: t.muted }}>
                <span aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, borderRadius: 999, background: club.logo_url ? `url(${club.logo_url}) center/cover` : clubGradient(club.id) }} />
                {club.name} · event chat
              </div>
            </div>
          </header>
          {failure ? (
            <div style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: "16px 12px" }}>
              <LoadFailed failure={failure} onRetry={() => void poll.reload()} tone={night ? "dark" : "light"} />
            </div>
          ) : messages === null ? (
            <EventSkeleton />
          ) : (
            <div style={{ flexGrow: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
              {event ? <EventAbout event={event} night={night} now={now} onRsvp={() => setRsvpOpen(true)} /> : null}
              {boardLatest ? <BoardStrip latest={boardLatest} unread={boardUnread} night={night} margin="4px 12px 0" onOpen={onOpenBoard} /> : null}
              <RoomThread
                poll={poll}
                roomId={roomId}
                roomKind="event"
                clubName={club.name}
                night={night}
                now={now}
                anchor="top"
                onReply={setReplyTo}
                onOpenEventChat={() => undefined}
                scrollToken={scrollToken}
              />
              <RoomComposer
                roomId={roomId}
                roomKind="event"
                roomName={title}
                clubName={club.name}
                orgHandle={orgHandle}
                orgId={club.id}
                viewer={viewer}
                viewerId={viewerId}
                night={night}
                poll={poll}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                onSent={() => setScrollToken((n) => n + 1)}
              />
            </div>
          )}
          {rsvpOpen && event ? (
            <RsvpSheet eventId={event.id} current={event.viewer_status} night={night} onClose={() => setRsvpOpen(false)} onChanged={() => void poll.reload()} />
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
