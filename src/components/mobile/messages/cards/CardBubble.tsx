"use client";

import { useEffect, useRef, useState } from "react";

import type { Card, ChatMessage, ThreadRoom } from "@/lib/chat/types";

import { personColor } from "../avatar";
import { initialsOf } from "../format";
import { ReactionPicker } from "../ReactionPicker";
import { visuallyHiddenStyle } from "../sheet-styles";
import { FONT, palette } from "../v2-tokens";
import { cardAuthorName, cardWord, type CardWord } from "./card-rules";
import { EventCardView } from "./EventCardView";
import { PollCardView } from "./PollCardView";
import { SignupCardView } from "./SignupCardView";

/**
 * The card row in a club room (wave-2 contract 11.8; mockup W0_Cards,
 * MK:0.2 "Cards in the list", MK:7): the 292px card, theirs with the 28px
 * avatar and the left-tail radius, mine right-aligned with no avatar, the
 * header line `<Name> · Poll | Sign-up | Event` (`You` when mine, `Someone`
 * when `users` is null, SCREENS-L11), and its OWN 500 ms long-press that
 * opens `ReactionPicker` with Report and Remove (`MessageBubble`'s gesture
 * is not reused).
 *
 * `card !== null` is routed by `card.type` to `PollCardView`,
 * `SignupCardView` or `EventCardView`; the bubble owns the box (its
 * padding per type, the event card's full-bleed band, the 70 % opacity of a
 * closed poll or sign-up) and the ONE `aria-live="polite"` span per card
 * (1.2: `<N> voted` · `<taken> of <total> filled` · `You're going` / `You
 * said maybe` / `RSVP removed`), set by the views after each answer.
 * `card === null` on a card kind (a stale cached answer; 9.1's 503 keeps a
 * fresh read from producing one) shows `message.content`, the stored
 * fallback text (cards/fallback.ts), as a plain bubble.
 */

export type CardBubbleProps = {
  message: ChatMessage;
  roomId: string;
  room: ThreadRoom | null;
  viewerId: string;
  isMine: boolean;
  night: boolean;
  /** A vote's answer: the card that replaces this message's (`replaceCard`). */
  onCard: (id: string, card: Card) => void;
  /** Re-read this one message (`refreshOne(createdAt)`): after an RSVP, a 404. */
  onRefresh: (createdAt: string) => void;
  /** `Open event chat` → the event chat layer over the space (11.6). */
  onOpenEventChat: (roomId: string) => void;
  /** `Remove` in the long-press picker: an officer's or a mod's removal. */
  onRemove?: () => void;
  /** `Report` in the long-press picker; never passed for the viewer's own. */
  onReport?: () => void;
};

function HeaderIcon({ word, stroke }: { word: CardWord; stroke: string }) {
  if (word === "Poll") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" aria-hidden>
        <path d="M6 20V11M12 20V5M18 20v-6" />
      </svg>
    );
  }
  if (word === "Sign-up") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5.5" y="4.5" width="13" height="16" rx="2" />
        <path d="M9 3.5h6v3H9z" />
        <path d="M9 13.5l2 2 4-4" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  );
}

/** The `<Name> · Poll | Sign-up | Event` line: 11.5px/600 muted, the name 700 secondary, one line. */
function HeaderLine({ word, author, night }: { word: CardWord; author: string; night: boolean }) {
  const t = palette(night);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, lineHeight: "15px", color: t.muted, whiteSpace: "nowrap", overflow: "hidden" }}>
      <HeaderIcon word={word} stroke={t.secondary} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        <span style={{ fontWeight: 700, color: t.secondary }}>{author}</span>
        {" · "}
        {word}
      </span>
    </div>
  );
}

export function CardBubble({ message, roomId, room, isMine, night, onCard, onRefresh, onOpenEventChat, onRemove, onReport }: CardBubbleProps) {
  const t = palette(night);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The one polite region per card (11.8 "Announcements"). `n` counts the
  // answers: the span's text ends in a zero-width space on every other one,
  // so an identical text (`12 voted` after a switched pick, the same
  // `K of M filled` after Leave then Take) is still a DOM change the
  // reader speaks (S3-BEHAVIOUR-4).
  const [announce, setAnnounce] = useState<{ text: string; n: number }>({ text: "", n: 0 });
  const onAnnounce = (text: string) => setAnnounce((a) => ({ text, n: a.n + 1 }));
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  // A card that unmounts inside the 500 ms window (a merge dropping it, the
  // layer closing under the finger) must not fire the picker afterwards.
  useEffect(
    () => () => {
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    },
    [],
  );

  const clearLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pressStart.current = null;
  };
  const startLongPress = (x: number, y: number) => {
    longPressFired.current = false;
    pressStart.current = { x, y };
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    // 500 ms, iOS's own long-press (the text bubble's timing, 11.8).
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      longPressFired.current = true;
      if (navigator.vibrate) {
        try {
          navigator.vibrate(8);
        } catch {
          /* unsupported */
        }
      }
      setPickerOpen(true);
    }, 500);
  };
  // A finger that drifts more than ~10px is scrolling, not holding.
  const onPressMove = (x: number, y: number) => {
    if (!pressStart.current) return;
    const dx = x - pressStart.current.x;
    const dy = y - pressStart.current.y;
    if (dx * dx + dy * dy > 100) clearLongPress();
  };
  const pressHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      // Only the first finger's primary press arms it; a second finger
      // (a pinch) cancels one that is pending.
      if (!e.isPrimary || e.button !== 0) {
        clearLongPress();
        return;
      }
      startLongPress(e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => onPressMove(e.clientX, e.clientY),
    onPointerUp: () => clearLongPress(),
    onPointerCancel: () => clearLongPress(),
    onPointerLeave: () => clearLongPress(),
    onContextMenu: (e: React.MouseEvent) => {
      // Mobile Safari's own long-press menu: we own the gesture.
      e.preventDefault();
    },
    // The click that ends a fired press must not also tap what is under
    // the finger (a vote, a Take a spot, an RSVP pill).
    onClickCapture: (e: React.MouseEvent) => {
      if (!longPressFired.current) return;
      longPressFired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  const word = cardWord(message);
  const author = cardAuthorName(message, isMine);
  // The card's own label says `someone` for an author the viewer cannot read (1.2).
  const authorForLabel = message.users ? cardAuthorName(message, false) : null;
  const sender = message.users;
  const disc = personColor(sender?.id || message.user_id);
  // A row still sending has no id to report or remove (the text bubble's guard).
  const temp = message.id.startsWith("temp_");
  const card = message.card;
  const header = <HeaderLine word={word} author={author} night={night} />;
  const closed = card !== null && card.type !== "event" && card.closed;

  let body: React.ReactNode;
  if (card === null) {
    body = (
      <>
        {header}
        <div style={{ marginTop: 4, fontSize: 14.5, lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.content}</div>
      </>
    );
  } else if (card.type === "event") {
    body = <EventCardView card={card} content={message.content} room={room} createdAt={message.created_at} author={authorForLabel} isMine={isMine} night={night} header={header} onRefresh={onRefresh} onOpenEventChat={onOpenEventChat} onAnnounce={onAnnounce} />;
  } else if (card.type === "signup") {
    body = <SignupCardView card={card} roomId={roomId} messageId={message.id} createdAt={message.created_at} author={authorForLabel} isMine={isMine} night={night} header={header} onCard={onCard} onRefresh={onRefresh} onAnnounce={onAnnounce} />;
  } else {
    body = <PollCardView card={card} roomId={roomId} messageId={message.id} createdAt={message.created_at} author={authorForLabel} isMine={isMine} night={night} header={header} onCard={onCard} onRefresh={onRefresh} onAnnounce={onAnnounce} />;
  }

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: isMine ? "flex-end" : "flex-start",
        gap: 8,
        fontFamily: FONT,
      }}
    >
      {!isMine ? (
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            borderRadius: 999,
            background: sender?.avatar_url ? `url(${sender.avatar_url}) center/cover` : disc.bg,
            color: disc.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {!sender?.avatar_url ? initialsOf(sender?.name || sender?.handle || "?") : null}
        </span>
      ) : null}
      <div
        {...pressHandlers}
        style={{
          width: 292,
          maxWidth: "100%",
          boxSizing: "border-box",
          // The Event card's band is full-bleed (no padding, the box clips it).
          padding: card?.type === "event" ? 0 : "10px 12px 9px",
          overflow: card?.type === "event" ? "hidden" : undefined,
          borderRadius: isMine ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
          border: `1px solid ${t.hairline}`,
          background: t.surface,
          color: t.ink,
          // A closed poll or sign-up: the whole card at 70 %, no taps (11.8).
          opacity: closed ? 0.7 : 1,
          cursor: "pointer",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
          transition: "transform 120ms ease",
          transform: pickerOpen ? "scale(0.97)" : "scale(1)",
        }}
      >
        {body}
      </div>
      <span aria-live="polite" style={visuallyHiddenStyle}>
        {announce.text}
        {announce.n % 2 === 1 ? "\u200B" : ""}
      </span>
      {pickerOpen ? (
        <ReactionPicker
          darkMode={night}
          isMine={isMine}
          existing={message.reactions ?? []}
          // S3-notes STOPPED 1: the pinned props carry no reaction handler,
          // so a pick only closes the picker.
          onPick={() => setPickerOpen(false)}
          onReport={
            onReport && !temp
              ? () => {
                  setPickerOpen(false);
                  onReport();
                }
              : undefined
          }
          onRemove={
            onRemove && !temp
              ? () => {
                  setPickerOpen(false);
                  onRemove();
                }
              : undefined
          }
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}
