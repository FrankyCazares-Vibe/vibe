"use client";

import { useEffect, useRef, useState } from "react";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import { RemovedContentCard, ReportSheet, type ReportTargetRef } from "@/components/safety/ReportSheet";
import type { ChatMessage, RemoveMessageResponse, RoomKind } from "@/lib/chat/types";
import type { RoomPoll } from "@/lib/chat/use-room-poll";
import { vibeRequest } from "@/lib/feedback/request";

import { CardBubble } from "../cards/CardBubble";
import { MessageBubble } from "../MessageBubble";
import { toastSendFailure } from "../send-failure";
import type { MessageRow } from "../types";
import { FONT, palette } from "../v2-tokens";
import { emptyLine, isEmptyRoom, separatorIds, sepLabel } from "./helpers";
import type { ReplyTarget } from "./RoomComposer";

/**
 * A club room's thread (handoffs/chat-redesign/wave-2-contracts.md 11.5, 1.2;
 * mockup `W0_Club:66-151`, MK:0.2, MK:4): the Lounge, a `room`, and the event
 * chat (11.6, top-anchored). The Board has its own view (BoardView.tsx).
 *
 * Oldest first from the hook, bottom-anchored (`anchor: "bottom"`) with the
 * 14px top fade; `Today` / date separators by `shouldShowChatSep`'s rule
 * computed over the rows that are not stubs (helpers.ts `separatorIds`);
 * text rows reuse `MessageBubble` (its palette unchanged in v1, 14.24) with
 * `groupMode` and `showSender` on the first row of a sender's run, today's
 * reaction flow moved as is (`toggleReaction`), Reply (a quote), Report, and
 * the new `onRemove` when `viewer.can_moderate && m.user_id !== viewerId`
 * (the confirm of 1.2 → `DELETE …/messages/<mid>` → the row is dropped;
 * `report_open` / `not_allowed` → the toast); a card row → `CardBubble`
 * (11.8) with `onCard` → `replaceCard`, `onRefresh` → `refreshOne`; `removed
 * !== null` → `RemovedContentCard by={removed.by}`; a stub renders nothing.
 * `Earlier messages` (44px, quiet) above the first row while the last earlier
 * page was full (SCREENS-L7). Empty (no rows, or only stubs): `Say hi to
 * <club>.` / `Say hi to everyone going.` (or the officer's `ClubEmpty`).
 */

export type RoomThreadProps = {
  poll: RoomPoll;
  roomId: string;
  roomKind: RoomKind;
  clubName: string;
  night: boolean;
  now: Date;
  /** `bottom` for the Lounge and a `room`; `top` for the event chat (MK:6). */
  anchor: "bottom" | "top";
  onReply: (target: ReplyTarget) => void;
  onOpenEventChat: (roomId: string) => void;
  /** Bumped by the composer after a send or a posted card: the new row scrolls into view. */
  scrollToken: number;
  /** The officer's brand new club (11.9.3), in the empty line's place. */
  emptyBlock?: React.ReactNode;
};

/** The `MessageRow` `MessageBubble` reads, built from a `ChatMessage` (the fields match, MM:12.6). */
export function toMessageRow(m: ChatMessage): MessageRow {
  const attachment = m.attachment
    ? {
        id: m.attachment.id,
        type: m.attachment.type === "clip" ? ("clip" as const) : ("post" as const),
        content: m.attachment.content,
        media_url: m.attachment.media_url,
        media_thumbnail_url: m.attachment.media_thumbnail_url,
        user_id: m.attachment.user_id,
        author: m.attachment.author,
      }
    : m.attachment;
  const mediaKind = m.media_kind === "image" || m.media_kind === "video" ? m.media_kind : null;
  const attachmentKind = m.attachment_kind === "post" || m.attachment_kind === "clip" ? m.attachment_kind : null;
  return {
    id: m.id,
    content: m.content,
    created_at: m.created_at,
    user_id: m.user_id,
    users: m.users,
    media_url: m.media_url,
    media_kind: mediaKind,
    attachment_id: m.attachment_id,
    attachment_kind: attachmentKind,
    attachment,
    parent_message_id: m.parent_message_id,
    parent_preview: m.parent_preview,
    reactions: m.reactions ?? [],
    hidden: m.hidden,
  };
}

/** The 1.2 reply target: the quoted parent as the send route's `parent_message_id` and the pill's name. */
export function replyTargetOf(m: ChatMessage, isMine: boolean): ReplyTarget {
  return {
    parent: {
      id: m.id,
      content: m.content?.trim() ? m.content : null,
      user_id: m.user_id,
      author: m.users ?? null,
      media_kind: m.media_kind === "image" || m.media_kind === "video" ? m.media_kind : null,
      attachment_kind: m.attachment_kind === "post" || m.attachment_kind === "clip" ? m.attachment_kind : null,
    },
    authorName: isMine ? "yourself" : m.users?.name || m.users?.handle || "Member",
  };
}

const SKELETON_DISC = "rgba(var(--scrim-rgb),0.06)";
const SKELETON_BAR = "rgba(var(--scrim-rgb),0.08)";

/** Three bubble-shaped blocks while the first read is out (11.0 States). */
export function ThreadSkeleton() {
  return (
    <div aria-hidden="true" style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: "16px 12px", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 12 }}>
      {[200, 140, 230].map((w, i) => (
        <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: 8, alignSelf: i === 1 ? "flex-end" : "flex-start" }}>
          {i !== 1 ? <span style={{ width: 28, height: 28, borderRadius: 999, background: SKELETON_DISC }} /> : null}
          <span style={{ width: w, maxWidth: "70%", height: 38, borderRadius: 18, background: SKELETON_BAR }} />
        </div>
      ))}
    </div>
  );
}

/** The 1.2 confirm before an officer's remove: `Remove this message for everyone in the room?` with `Remove` / `Cancel`. */
function RemoveConfirm({ night, busy, onConfirm, onCancel }: { night: boolean; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const t = palette(night);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  const button: React.CSSProperties = {
    flex: 1,
    height: 44,
    borderRadius: 999,
    border: "none",
    fontFamily: FONT,
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
  };
  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 1150, background: t.scrim, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="club-remove-confirm"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        style={{ width: "100%", maxWidth: 320, boxSizing: "border-box", padding: 18, borderRadius: 20, border: `1px solid ${t.hairline}`, background: t.surface, color: t.ink, fontFamily: FONT, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <p id="club-remove-confirm" style={{ margin: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
          Remove this message for everyone in the room?
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button ref={cancelRef} type="button" onClick={onCancel} style={{ ...button, background: "rgba(var(--scrim-rgb),0.07)", color: t.ink }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} aria-disabled={busy} style={{ ...button, background: t.coralButton.bg, color: t.coralButton.ink, opacity: busy ? 0.6 : 1 }}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoomThread({ poll, roomId, roomKind, clubName, night, now, anchor, onReply, onOpenEventChat, scrollToken, emptyBlock }: RoomThreadProps) {
  const t = palette(night);
  const { messages, room, viewer, viewerId, failure } = poll;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listScrolledAtRef = useRef(Number.NEGATIVE_INFINITY);
  const pinnedRef = useRef(true);
  const [removeTarget, setRemoveTarget] = useState<ChatMessage | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reportMessage, setReportMessage] = useState<ReportTargetRef | null>(null);

  const lastId = messages && messages.length > 0 ? messages[messages.length - 1].id : null;
  const rowCount = messages?.length ?? 0;
  // Keep the newest row in view: on the first page, on a new last row while
  // the reader sits at the bottom, and after a send (`scrollToken`).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (anchor === "bottom" && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [anchor, lastId, rowCount]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || scrollToken === 0) return;
    pinnedRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [scrollToken]);

  const toggleReaction = async (m: ChatMessage, emoji: string) => {
    // Today's flow (ConversationView `toggleReaction`), moved as is: an
    // optimistic count, a raw fetch, a rollback when the fetch throws.
    const existing = m.reactions ?? [];
    const found = existing.find((r) => r.emoji === emoji);
    const willAdd = !found?.viewer_reacted;
    const apply = (row: ChatMessage, add: boolean) => {
      const list = row.reactions ?? [];
      const cur = list.find((r) => r.emoji === emoji);
      if (cur) {
        const next = list
          .map((r) => (r.emoji === emoji ? { ...r, count: add ? cur.count + 1 : cur.count - 1, viewer_reacted: add } : r))
          .filter((r) => r.count > 0);
        return { ...row, reactions: next };
      }
      return add ? { ...row, reactions: [...list, { emoji, count: 1, viewer_reacted: true }] } : row;
    };
    const optimistic = apply(m, willAdd);
    poll.replace(m.id, optimistic);
    try {
      await fetch(`/api/me/threads/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(m.id)}/react`, {
        method: willAdd ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch {
      poll.replace(m.id, apply(optimistic, !willAdd));
    }
  };

  const confirmRemove = async () => {
    const target = removeTarget;
    if (!target || removing) return;
    setRemoving(true);
    const r = await vibeRequest<RemoveMessageResponse>(
      `/api/me/threads/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(target.id)}`,
      { method: "DELETE", failure: "Couldn't remove this message.", quiet: true },
    );
    setRemoving(false);
    setRemoveTarget(null);
    if (!r.ok) {
      toastSendFailure(r);
      return;
    }
    poll.remove(target.id);
  };

  if (failure) {
    return (
      <div style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: "16px 12px", display: "flex", flexDirection: "column", justifyContent: anchor === "bottom" ? "flex-end" : "flex-start" }}>
        <LoadFailed failure={failure} onRetry={() => void poll.reload()} tone={night ? "dark" : "light"} />
      </div>
    );
  }
  if (messages === null) return <ThreadSkeleton />;

  const shown = messages.filter((m) => !m.hidden);
  const seps = separatorIds(messages);
  const empty = isEmptyRoom(messages);

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current;
          if (!el) return;
          listScrolledAtRef.current = performance.now();
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        style={{ flexGrow: 1, minHeight: 0, position: "relative", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", fontFamily: FONT }}
      >
        <div aria-hidden="true" style={{ position: "sticky", zIndex: 2, top: 0, height: 14, marginBottom: -14, pointerEvents: "none", background: `linear-gradient(180deg, ${t.page} 0%, rgba(0,0,0,0) 100%)` }} />
        <div style={{ minHeight: "100%", boxSizing: "border-box", padding: "8px 12px 8px", display: "flex", flexDirection: "column", justifyContent: anchor === "bottom" ? "flex-end" : "flex-start", gap: 6 }}>
          {poll.hasEarlier ? (
            <button
              type="button"
              onClick={() => void poll.loadEarlier()}
              style={{ alignSelf: "center", height: 44, padding: "0 16px", border: "none", background: "transparent", color: t.secondary, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
            >
              Earlier messages
            </button>
          ) : null}
          {empty ? (
            emptyBlock ?? (
              <div style={{ padding: "48px 18px", textAlign: "center", color: t.secondary, fontSize: 13.5, lineHeight: 1.5 }}>{emptyLine(roomKind, clubName)}</div>
            )
          ) : (
            shown.map((m, i) => {
              const isMine = viewerId !== null && m.user_id === viewerId;
              const prev = shown[i - 1];
              const showGap = !prev || prev.user_id !== m.user_id;
              const temp = m.id.startsWith("temp_");
              const canRemove = !!viewer?.can_moderate && !isMine && !temp && m.user_id !== "";
              const canReport = !!viewerId && !isMine && !temp;
              const canReply = !!viewer?.can_post && !temp;
              const sep = seps.has(m.id) ? (
                <div style={{ alignSelf: "center", padding: "6px 0 2px", fontSize: 11, fontWeight: 600, lineHeight: "14px", color: t.muted }}>{sepLabel(m.created_at, now)}</div>
              ) : null;
              const report = canReport
                ? () => setReportMessage({ type: "message", id: m.id, authorId: m.users?.id ?? m.user_id, authorName: m.users?.name || (m.users?.handle ? `@${m.users.handle}` : null), noun: "message" })
                : undefined;
              const remove = canRemove ? () => setRemoveTarget(m) : undefined;
              let row: React.ReactNode;
              if (m.removed !== null) {
                row = (
                  <div style={{ marginTop: showGap ? 8 : 0, display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ maxWidth: "min(300px, 86%)" }}>
                      <RemovedContentCard kind="message" compact by={m.removed.by} removedAt={m.removed.at} removedReason={m.removed.reason} />
                    </div>
                  </div>
                );
              } else if (m.kind !== "text") {
                row = (
                  <div style={{ marginTop: showGap ? 8 : 0 }}>
                    <CardBubble
                      message={m}
                      roomId={roomId}
                      room={room}
                      viewerId={viewerId ?? ""}
                      isMine={isMine}
                      night={night}
                      onCard={poll.replaceCard}
                      onRefresh={(createdAt) => void poll.refreshOne(createdAt)}
                      onOpenEventChat={onOpenEventChat}
                      onRemove={remove}
                      onReport={report}
                    />
                  </div>
                );
              } else {
                row = (
                  <MessageBubble
                    message={toMessageRow(m)}
                    isMine={isMine}
                    topGap={showGap ? 8 : 0}
                    showSender={!isMine && showGap}
                    groupMode
                    darkMode={night}
                    onToggleReaction={(emoji) => void toggleReaction(m, emoji)}
                    listScrolledAtRef={listScrolledAtRef}
                    parentIsMine={!!viewerId && m.parent_preview?.user_id === viewerId}
                    onReply={canReply ? () => onReply(replyTargetOf(m, isMine)) : undefined}
                    onReport={report}
                    onRemove={remove}
                  />
                );
              }
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                  {sep}
                  {row}
                </div>
              );
            })
          )}
        </div>
      </div>
      {removeTarget ? <RemoveConfirm night={night} busy={removing} onConfirm={() => void confirmRemove()} onCancel={() => setRemoveTarget(null)} /> : null}
      {reportMessage ? <ReportSheet variant="sheet" nested target={reportMessage} onClose={() => setReportMessage(null)} /> : null}
    </>
  );
}
