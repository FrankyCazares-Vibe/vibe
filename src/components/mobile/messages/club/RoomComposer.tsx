"use client";

import { useEffect, useRef, useState } from "react";

import type { ChatMessage, RoomKind, ViewerInRoom } from "@/lib/chat/types";
import type { RoomPoll } from "@/lib/chat/use-room-poll";
import { vibeRequest } from "@/lib/feedback/request";

import { CardTray, type CardTrayKind } from "../compose/CardTray";
import { ComposeSheets } from "../compose/ComposeSheets";
import { quotedBody } from "../format";
import { toastSendFailure } from "../send-failure";
import { FONT, palette } from "../v2-tokens";
import { composerPlaceholder, sendLabel } from "./helpers";

/**
 * The composer of a club room (handoffs/chat-redesign/wave-2-contracts.md
 * 11.3, 11.4, 11.5, 1.2; mockups `W0_Club:153-159`, `W0_Board:136-150`,
 * `W0_Room:155-170`, MK:0.2): 64px — the "+" 44px circle, the 44px pill
 * input (16px, the iOS zoom guard of 11.0), the 44px gradient send.
 *
 * - While `viewer` is null NOTHING is drawn in the composer's place (no
 *   composer flashes in a Board; SCREENS-L9).
 * - `viewer.can_post === false` → the quiet tile: the Board's member sentence
 *   `Only officers post on the Board. You can reply to any post.` (14.16) or
 *   `This chat is closed.` (= `REFUSAL_SENTENCES.room_closed`).
 * - The "+" only when `can_post`: it opens W2-S3's `CardTray` in flow above
 *   the row, and a pick mounts `ComposeSheets` (`onPosted` → `append`,
 *   `onReload` → `reload`, the "+" as `returnFocusTo`).
 * - Sending (11.5): `POST …/messages { content, parent_message_id? }` with an
 *   optimistic `temp_` row appended to the hook's oldest-first state
 *   (`append`), replaced by the answer (`replace`), removed on failure with
 *   the toast (`remove`); `board_officers_only` / `room_closed` → the quiet
 *   tile until the next full read hands a new `viewer` (the refusal is
 *   remembered against the `viewer` object's identity, so no effect resets it).
 * - The officer's `Everyone in <club> sees this` line above the row on the
 *   Board (`officerLine`); the reply pill (a quote) above the row when the
 *   thread picked a message to reply to.
 *
 * The tray's scrim is absolute over the room column: the room mounts this
 * inside a `position: relative` box; the footer sits at z-index 2 over it.
 */

export type ReplyTarget = {
  parent: NonNullable<ChatMessage["parent_preview"]>;
  authorName: string;
};

export type RoomComposerProps = {
  roomId: string;
  roomKind: RoomKind;
  roomName: string;
  clubName: string;
  orgHandle: string;
  viewer: ViewerInRoom | null;
  viewerId: string | null;
  night: boolean;
  poll: Pick<RoomPoll, "append" | "replace" | "remove" | "reload">;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  /** After a send or a posted card: the thread scrolls the new row into view. */
  onSent?: () => void;
  /** The Board, for an officer: the line above the row. */
  officerLine?: boolean;
  /** Bumped by the room to focus the input (ClubEmpty's `Post a welcome on the Board`). */
  focusToken?: number;
};

const SEND_FAILURE = "Couldn't send your message.";

function Megaphone({ color, size = 13 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1z" />
      <path d="M16 9a4.5 4.5 0 0 1 0 6" />
      <path d="M18.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}

function Lock({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="10" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** The quiet tile in the composer's place (11.3, 11.6). */
export function ClosedTile({ text, night, board = false }: { text: string; night: boolean; board?: boolean }) {
  const t = palette(night);
  return (
    <footer style={{ flexShrink: 0, boxSizing: "border-box", padding: "10px 12px calc(env(safe-area-inset-bottom, 0px) + 14px)", background: t.page, borderTop: `1px solid ${t.hairline}`, fontFamily: FONT }}>
      <div
        role="note"
        style={{
          minHeight: 44,
          boxSizing: "border-box",
          padding: "10px 14px",
          borderRadius: 16,
          border: `1px solid ${t.hairline}`,
          background: t.surface,
          display: "flex",
          alignItems: "center",
          justifyContent: board ? "flex-start" : "center",
          gap: board ? 10 : 8,
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.35,
          color: t.secondary,
        }}
      >
        {board ? <Megaphone color={t.muted} size={15} /> : <Lock color={t.muted} />}
        <span>{text}</span>
      </div>
    </footer>
  );
}

export function RoomComposer({
  roomId,
  roomKind,
  roomName,
  clubName,
  orgHandle,
  viewer,
  viewerId,
  night,
  poll,
  replyTo,
  onCancelReply,
  onSent,
  officerLine = false,
  focusToken = 0,
}: RoomComposerProps) {
  const t = palette(night);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [sheet, setSheet] = useState<CardTrayKind | null>(null);
  // The `viewer` object a refused send was answered against: `can_post` reads
  // false until the next full read hands a new one (11.4, 11.5).
  const [refusedViewer, setRefusedViewer] = useState<ViewerInRoom | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const plusRef = useRef<HTMLButtonElement | null>(null);

  // The input exists only once `viewer` answered with `can_post`: the focus
  // waits for that, and a plain chip tap resets the token to 0 (ClubSpace).
  const ready = viewer !== null && viewer.can_post;
  useEffect(() => {
    if (focusToken > 0 && ready) inputRef.current?.focus();
  }, [focusToken, ready]);

  if (viewer === null) return null;
  const canPost = viewer.can_post && refusedViewer !== viewer;
  if (!canPost) {
    return roomKind === "board" ? (
      <ClosedTile night={night} board text="Only officers post on the Board. You can reply to any post." />
    ) : (
      <ClosedTile night={night} text="This chat is closed." />
    );
  }

  const placeholder = composerPlaceholder(roomKind, roomName);
  const text = draft.trim();
  const canSend = text.length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    const reply = replyTo;
    const tempId = `temp_${Date.now()}`;
    const temp: ChatMessage = {
      id: tempId,
      content: text,
      created_at: new Date().toISOString(),
      user_id: viewerId ?? "me",
      attachment_id: null,
      attachment_kind: null,
      media_url: null,
      media_kind: null,
      parent_message_id: reply?.parent.id ?? null,
      users: null,
      attachment: null,
      parent_preview: reply?.parent ?? null,
      reactions: [],
      kind: "text",
      thread_root_id: null,
      card: null,
      reply_count: roomKind === "board" ? 0 : null,
      author_role: viewer.role,
      hidden: false,
      removed: null,
    };
    poll.append(temp);
    setDraft("");
    setSending(true);
    onSent?.();
    const r = await vibeRequest<{ message?: ChatMessage | null }>(`/api/me/threads/${encodeURIComponent(roomId)}/messages`, {
      json: { content: text, ...(reply ? { parent_message_id: reply.parent.id } : {}) },
      failure: SEND_FAILURE,
      quiet: true,
    });
    setSending(false);
    if (!r.ok) {
      toastSendFailure(r);
      poll.remove(tempId);
      setDraft(text);
      if (r.code === "board_officers_only" || r.code === "room_closed") setRefusedViewer(viewer);
      return;
    }
    const sent = r.data.message;
    if (sent) poll.replace(tempId, sent);
    else {
      poll.remove(tempId);
      void poll.reload();
    }
    if (reply) onCancelReply();
  };

  const circle: React.CSSProperties = {
    width: 44,
    height: 44,
    flexShrink: 0,
    boxSizing: "border-box",
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <>
      <CardTray
        roomKind={roomKind}
        roomName={roomName}
        clubName={clubName}
        open={trayOpen}
        onClose={() => setTrayOpen(false)}
        onPick={(kind) => {
          setTrayOpen(false);
          setSheet(kind);
        }}
      />
      <footer
        style={{
          flexShrink: 0,
          position: "relative",
          zIndex: 2,
          boxSizing: "border-box",
          padding: "8px 12px calc(env(safe-area-inset-bottom, 0px) + 12px)",
          background: t.page,
          borderTop: `1px solid ${t.hairline}`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontFamily: FONT,
        }}
      >
        {officerLine ? (
          <div style={{ boxSizing: "border-box", padding: "0 4px", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, lineHeight: "16px", color: t.muted }}>
            <Megaphone color={t.muted} />
            Everyone in {clubName} sees this
          </div>
        ) : null}
        {replyTo ? (
          <div style={{ boxSizing: "border-box", padding: "6px 10px 6px 12px", borderRadius: 14, border: `1px solid ${t.hairline}`, background: t.surface, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: t.secondary }}>Replying to {replyTo.authorName}</span>
              <span style={{ fontSize: 12.5, color: t.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{quotedBody(replyTo.parent)}</span>
            </span>
            <button type="button" aria-label="Cancel reply" onClick={onCancelReply} style={{ ...circle, width: 36, height: 36, border: "none", background: "transparent", color: t.muted }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}
        >
          <button
            ref={plusRef}
            type="button"
            aria-label={trayOpen ? "Close the tray" : "Add a poll, sign-up or event"}
            aria-expanded={trayOpen}
            onClick={() => setTrayOpen((o) => !o)}
            style={{ ...circle, border: night ? "1px solid rgba(255,255,255,0.10)" : `1px solid ${t.hairline}`, background: t.surface, color: t.ink, transition: "transform 160ms ease", transform: trayOpen ? "rotate(45deg)" : "none" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <label style={{ flexGrow: 1, minWidth: 0, height: 44, boxSizing: "border-box", padding: "0 16px", display: "flex", alignItems: "center", borderRadius: 999, border: night ? "1px solid rgba(255,255,255,0.10)" : `1px solid ${t.hairline}`, background: t.surface }}>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={placeholder}
              placeholder={placeholder}
              autoComplete="off"
              enterKeyHint="send"
              style={{ flexGrow: 1, minWidth: 0, height: 40, padding: 0, border: "none", outline: "none", background: "transparent", color: t.ink, fontFamily: "inherit", fontSize: 16 }}
            />
          </label>
          <button
            type="submit"
            aria-label={sendLabel(roomKind)}
            aria-disabled={!canSend}
            style={{ ...circle, border: "none", background: canSend ? t.coralButton.bg : "rgba(var(--scrim-rgb),0.07)", color: canSend ? t.coralButton.ink : t.muted, cursor: canSend ? "pointer" : "default" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
          </button>
        </form>
      </footer>
      <ComposeSheets
        kind={sheet}
        roomId={roomId}
        roomKind={roomKind}
        roomName={roomName}
        clubName={clubName}
        orgHandle={orgHandle}
        onClose={() => setSheet(null)}
        onPosted={(message) => {
          setSheet(null);
          poll.append(message);
          onSent?.();
        }}
        onReload={() => {
          setSheet(null);
          void poll.reload();
        }}
        returnFocusTo={plusRef}
      />
    </>
  );
}
