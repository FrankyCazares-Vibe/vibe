"use client";

import { useEffect, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { RemovedContentCard } from "@/components/safety/ReportSheet";
import type { ChatMessage, ThreadMessagesResponse, ThreadRoom, ViewerInRoom } from "@/lib/chat/types";
import type { RoomPoll } from "@/lib/chat/use-room-poll";
import { rowTime, rowTimeSpoken } from "@/lib/chat/when";
import { vibeRequest } from "@/lib/feedback/request";

import { personColor } from "../avatar";
import { CardBubble } from "../cards/CardBubble";
import { initialsOf } from "../format";
import { toastSendFailure } from "../send-failure";
import { FONT, palette } from "../v2-tokens";
import { authorName, postAriaLabel, repliesToggleLabel, repliesToggleText, roleWord } from "./helpers";

/**
 * One Board post with its folded replies (handoffs/chat-redesign/wave-2-contracts.md
 * 11.4, 1.2; mockup `W0_Board:60-112`, MK:5): an `<article>` with the byline
 * (28px avatar, the name 13.5px/700, the role word from `author_role`, the
 * time `rowTime`), the body 15px/500 `text-wrap: pretty` or a card
 * (`CardBubble`, 11.8), then the replies toggle (44px, `aria-expanded`;
 * `N replies` / `1 reply` / `Reply` when 0; `Replies stay quiet` at the
 * right).
 *
 * Open → `GET …/messages?root=<postId>&limit=200` once (oldest first), read
 * again on every 5th tick while open (`refreshToken`) and on Retry; the read
 * failing → `LoadFailed compact` (`Couldn't load replies.`) under the toggle
 * (SCREENS-L9); a stub renders nothing; a fold whose rows are all stubs shows
 * the reply field only (PRIVACY-L5); the viewer's own removed reply is the
 * compact `RemovedContentCard` in its place (1.2; S2-repair.md SEC1). Under
 * the rows the reply field when
 * `viewer.can_reply` (`Reply quietly`, `aria-label="Reply quietly to <Name>'s
 * post"`, send `Send reply`): `POST …/messages { content, thread_root_id }`;
 * 200 → the returned message appended; `board_post_missing` → the toast and
 * the post is dropped (`onMissing`). No per-post `New` mark (14.17), no
 * repliers' avatars folded (14.18).
 *
 * A card post mounts `CardBubble` with `layout="post"` (full width, no
 * second avatar or header; INT-ADJUDICATE-3) and hands its picker the
 * Board's handlers: an emoji → `onToggleReaction` (the chips under the card
 * follow), `Reply` → the fold opens with the reply field focused (a Board
 * reply is never a quote; INT-ADJUDICATE-2).
 */
export type BoardPostProps = {
  post: ChatMessage;
  roomId: string;
  room: ThreadRoom | null;
  viewer: ViewerInRoom | null;
  viewerId: string | null;
  night: boolean;
  now: Date;
  /** Bumped by the Board view every 5th tick: an open fold re-reads. */
  refreshToken: number;
  onCard: RoomPoll["replaceCard"];
  onRefresh: (createdAt: string) => void;
  onOpenEventChat: (roomId: string) => void;
  onRemove?: () => void;
  onReport?: () => void;
  /** An emoji picked on a card post (its picker or its chips): today's reaction flow (reactions.ts). */
  onToggleReaction?: (emoji: string) => void;
  /** A reply went in: the list re-reads the post (its server `reply_count`). */
  onReplied: () => void;
  /** `board_post_missing`: the post is gone; the list drops it. */
  onMissing: () => void;
};

const REPLIES_LINE = "Couldn't load replies.";

type Replies = { rows: ChatMessage[] | null; failure: LoadFailure | null };

function Avatar({ person, fallbackId, size, fontSize }: { person: ChatMessage["users"]; fallbackId: string; size: number; fontSize: number }) {
  const disc = personColor(person?.id || fallbackId);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        background: person?.avatar_url ? `url(${person.avatar_url}) center/cover` : disc.bg,
        color: disc.ink,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        fontWeight: 700,
      }}
    >
      {person?.avatar_url ? null : initialsOf(person?.name || person?.handle || "?")}
    </span>
  );
}

function Chevron({ up, color }: { up: boolean; color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}

function BellOff() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.7 3.9A6 6 0 0 1 18 9c0 4 1 6 2 7H9" />
      <path d="M6.3 6.6A6 6 0 0 0 6 9c0 4-1 6-2 7h1" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function BoardPost({ post, roomId, room, viewer, viewerId, night, now, refreshToken, onCard, onRefresh, onOpenEventChat, onRemove, onReport, onToggleReaction, onReplied, onMissing }: BoardPostProps) {
  const t = palette(night);
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<Replies>({ rows: null, failure: null });
  const [retryToken, setRetryToken] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // `Reply` from a card post's picker: the fold opens and the field takes
  // focus once it is mounted (the token counts the asks).
  const replyRef = useRef<HTMLInputElement | null>(null);
  const [focusReply, setFocusReply] = useState(0);
  useEffect(() => {
    if (open && focusReply > 0) replyRef.current?.focus();
  }, [open, focusReply]);

  const postId = post.id;
  const temp = postId.startsWith("temp_");
  // The `?root=` read: on open, on Retry, and on every 5th tick while open.
  // The state is set in the read's callback, never in the effect's body.
  useEffect(() => {
    if (!open || temp) return;
    let live = true;
    void (async () => {
      const r = await vibeRequest<ThreadMessagesResponse>(
        `/api/me/threads/${encodeURIComponent(roomId)}/messages?root=${encodeURIComponent(postId)}&limit=200`,
        { quiet: true, failure: REPLIES_LINE },
      );
      if (!live) return;
      if (!r.ok || !Array.isArray(r.data?.messages)) {
        // A refetch that fails keeps the rows and stays quiet (11.0).
        setReplies((cur) => (cur.rows === null ? { rows: null, failure: asLoadFailure(r, REPLIES_LINE) } : cur));
        return;
      }
      const rows = r.data.messages;
      setReplies({ rows, failure: null });
    })();
    return () => {
      live = false;
    };
  }, [open, temp, roomId, postId, refreshToken, retryToken]);

  const name = authorName(post.users);
  const role = roleWord(post.author_role);
  const isMine = viewerId !== null && post.user_id === viewerId;
  const count = post.reply_count ?? 0;
  const canReply = !!viewer?.can_reply && !temp;
  const text = draft.trim();
  const canSend = text.length > 0 && !sending;

  const sendReply = async () => {
    if (!canSend) return;
    setSending(true);
    const r = await vibeRequest<{ message?: ChatMessage | null }>(`/api/me/threads/${encodeURIComponent(roomId)}/messages`, {
      json: { content: text, thread_root_id: postId },
      failure: "Couldn't send your reply.",
      quiet: true,
    });
    setSending(false);
    if (!r.ok) {
      toastSendFailure(r);
      if (r.code === "board_post_missing") onMissing();
      return;
    }
    setDraft("");
    const sent = r.data.message;
    if (sent) setReplies((cur) => ({ rows: [...(cur.rows ?? []), sent], failure: null }));
    onReplied();
  };

  const visibleReplies = (replies.rows ?? []).filter((m) => !m.hidden);

  return (
    <article
      aria-label={postAriaLabel(name, post.author_role, rowTimeSpoken(post.created_at, now))}
      style={{
        flexShrink: 0,
        boxSizing: "border-box",
        // Folded, the 44px toggle sits flush at the card's bottom edge (`W0_Board:95`, MK:5).
        padding: open ? "10px 12px 10px" : "10px 12px 0",
        borderRadius: 16,
        border: `1px solid ${t.hairline}`,
        background: t.surface,
        boxShadow: night ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "0 1px 2px rgba(20,20,22,0.04)",
        color: t.ink,
        fontFamily: FONT,
        opacity: temp ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", minWidth: 0 }}>
        <Avatar person={post.users} fallbackId={post.user_id} size={28} fontSize={10} />
        <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis" }}>{isMine && !post.users ? "You" : name}</span>
        {role ? <span style={{ fontSize: 12, fontWeight: 600, lineHeight: "18px", color: t.muted }}>{role}</span> : null}
        <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 12, fontWeight: 600, lineHeight: "18px", color: t.muted }}>{rowTime(post.created_at, now)}</span>
      </div>
      {post.kind !== "text" ? (
        <div style={{ marginTop: 8 }}>
          <CardBubble
            message={post}
            roomId={roomId}
            room={room}
            viewerId={viewerId ?? ""}
            isMine={isMine}
            night={night}
            layout="post"
            onCard={onCard}
            onRefresh={onRefresh}
            onOpenEventChat={onOpenEventChat}
            onRemove={onRemove}
            onReport={onReport}
            onToggleReaction={onToggleReaction}
            onReply={
              canReply
                ? () => {
                    setOpen(true);
                    setFocusReply((n) => n + 1);
                  }
                : undefined
            }
          />
        </div>
      ) : (
        <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 500, lineHeight: 1.35, textWrap: "pretty", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{post.content}</p>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-label={repliesToggleLabel(count, open)}
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", height: 44, marginTop: 4, padding: 0, border: "none", borderTop: `1px solid ${t.hairline}`, background: "transparent", color: t.ink, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{repliesToggleText(count)}</span>
        <Chevron up={open} color={t.secondary} />
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: t.muted }}>
          <BellOff />
          Replies stay quiet
        </span>
      </button>
      {open ? (
        <>
          {replies.failure ? (
            <LoadFailed failure={replies.failure} compact tone={night ? "dark" : "light"} onRetry={() => setRetryToken((n) => n + 1)} />
          ) : replies.rows === null ? (
            <div aria-hidden="true" style={{ boxSizing: "border-box", padding: "4px 0 0 10px", display: "flex", flexDirection: "column", gap: 6 }}>
              {[0, 1].map((i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 999, background: "rgba(var(--scrim-rgb),0.06)" }} />
                  <span style={{ width: i === 0 ? "60%" : "45%", height: 12, borderRadius: 6, background: "rgba(var(--scrim-rgb),0.08)" }} />
                </div>
              ))}
            </div>
          ) : visibleReplies.length > 0 ? (
            <div role="group" aria-label="Replies" style={{ boxSizing: "border-box", paddingLeft: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {visibleReplies.map((m) =>
                m.removed !== null ? (
                  <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "min(300px, 86%)" }}>
                    <RemovedContentCard kind="message" compact by={m.removed.by} removedAt={m.removed.at} removedReason={m.removed.reason} />
                  </div>
                ) : (
                  <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Avatar person={m.users} fallbackId={m.user_id} size={22} fontSize={8.5} />
                    <p style={{ margin: 0, paddingTop: 2, fontSize: 13, lineHeight: "18px", color: t.secondary, overflowWrap: "anywhere" }}>
                      <span style={{ fontWeight: 700, color: t.ink }}>{viewerId !== null && m.user_id === viewerId && !m.users ? "You" : authorName(m.users)}</span> {m.content}
                    </p>
                  </div>
                ),
              )}
            </div>
          ) : null}
          {canReply ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendReply();
              }}
              style={{ margin: "8px 0 0 10px", height: 44, boxSizing: "border-box", padding: "0 0 0 14px", borderRadius: 999, border: night ? "1px solid rgba(255,255,255,0.10)" : `1px solid ${t.hairline}`, background: "rgba(var(--scrim-rgb),0.04)", display: "flex", alignItems: "center" }}
            >
              <input
                ref={replyRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Reply quietly"
                aria-label={`Reply quietly to ${name}'s post`}
                autoComplete="off"
                enterKeyHint="send"
                style={{ flexGrow: 1, minWidth: 0, height: 40, padding: 0, border: "none", outline: "none", background: "transparent", color: t.ink, fontFamily: "inherit", fontSize: 16 }}
              />
              <button type="submit" aria-label="Send reply" aria-disabled={!canSend} style={{ width: 44, height: 44, flexShrink: 0, padding: 0, border: "none", background: "transparent", color: canSend ? t.coralText : t.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: canSend ? "pointer" : "default", WebkitTapHighlightColor: "transparent" }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
              </button>
            </form>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
