"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import { RemovedContentCard, ReportSheet, type ReportTargetRef } from "@/components/safety/ReportSheet";
import type { ChatMessage, RemoveMessageResponse, RoomKind } from "@/lib/chat/types";
import { useLayerHistory } from "@/lib/chat/use-layer-history";
import type { RoomPoll } from "@/lib/chat/use-room-poll";
import { vibeRequest } from "@/lib/feedback/request";

import { CardBubble } from "../cards/CardBubble";
import { MessageBubble } from "../MessageBubble";
import { toastSendFailure } from "../send-failure";
import { useChatSurface } from "../surface";
import type { MessageRow } from "../types";
import { FONT, palette } from "../v2-tokens";
import { authorName, emptyLine, isEmptyRoom, separatorIds, sepLabel } from "./helpers";
import { HOVER_ACTIONS_CSS, HoverActions } from "./HoverActions";
import { toggleReactionOn } from "./reactions";
import type { ReplyTarget } from "./RoomComposer";

/**
 * A club room's thread (handoffs/chat-redesign/wave-2-contracts.md 11.5, 1.2;
 * mockup `W0_Club:66-151`, MK:0.2, MK:4): the Lounge, a `room`, and the event
 * chat (11.6, top-anchored). The Board has its own view (BoardView.tsx).
 *
 * Oldest first from the hook, bottom-anchored (`anchor: "bottom"`) with the
 * 14px top fade. Both anchors stay on the NEWEST row (S71 amendment 3, E =
 * audit F09): the first page scrolls to the end when the content overflows;
 * a new row, a row growing, or the box shrinking under the keyboard keeps
 * the end in view while the reader is within `PIN_SLACK` of it; a reader who
 * scrolled up is never moved. `anchor` only decides where a SHORT chat sits
 * (the event chat's rows start under its About block, 11.6). `header` (the
 * event chat's About and Board strip) is drawn INSIDE the scroller, above
 * the rows, so it scrolls away with them and the thread keeps its height
 * when the keyboard is up.
 * The rest: `Today` / date separators by `shouldShowChatSep`'s rule
 * computed over the rows that are not stubs (helpers.ts `separatorIds`);
 * text rows reuse `MessageBubble` (its palette unchanged in v1, 14.24) with
 * `groupMode` and `showSender` on the first row of a sender's run, today's
 * reaction flow moved as is (`toggleReactionOn`, reactions.ts), Reply (a quote), Report, and
 * the new `onRemove` when `viewer.can_moderate && m.user_id !== viewerId`
 * (the confirm of 1.2 → `DELETE …/messages/<mid>` → the row is dropped;
 * `report_open` / `not_allowed` → the toast); a card row → `CardBubble`
 * (11.8) with `onCard` → `replaceCard`, `onRefresh` → `refreshOne`; `removed
 * !== null` → `RemovedContentCard by={removed.by}`; a stub renders nothing.
 * A card's picker gets the same `onToggleReaction` / `onReply` as a text
 * bubble (11.8; INT-ADJUDICATE-2).
 * `Earlier messages` (44px, quiet) above the first row while the last earlier
 * page was full (SCREENS-L7). Empty (no rows, or only stubs): `Say hi to
 * <club>.` / `Say hi to everyone going.` (or the officer's `ClubEmpty`).
 *
 * Desktop surface (handoffs/chat-redesign/wave-3-desktop/contract.md 6.3,
 * 6.4; `useChatSurface()`): each row is wrapped in `HoverActions`, the hover
 * toolbar that holds React, Reply, Report and Remove (the same per-row
 * handlers the bubbles get; the bubbles' own press does not arm there), and
 * the Report sheet is the centred dialog (`variant="modal"`, not nested: no
 * drawer is under it). On the phone `HoverActions` is never mounted and
 * nothing below changes.
 */

export type RoomThreadProps = {
  poll: RoomPoll;
  roomId: string;
  roomKind: RoomKind;
  clubName: string;
  night: boolean;
  now: Date;
  /** Where a short chat sits: `bottom` for the Lounge and a `room`; `top` for the event chat (MK:6). Both follow the newest row. */
  anchor: "bottom" | "top";
  /** Drawn inside the scroller above the rows (the event chat's About and Board strip): it scrolls away with them. */
  header?: React.ReactNode;
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

/** How far from the end the reader may sit and still be followed by new rows (px). */
const PIN_SLACK = 80;

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

/**
 * The 1.2 confirm before an officer's remove: `Remove this message for
 * everyone in the room?` with `Remove` / `Cancel`. Focus lands on Cancel,
 * Tab cycles the two buttons, Escape cancels, and focus returns to the
 * element that had it on close (11.0 Accessibility; S2-repair.md D2).
 * Its own history entry while it is up (`useLayerHistory`; S71 amendment 3,
 * A): Back cancels the confirm and nothing else.
 */
export function RemoveConfirm({ night, busy, onConfirm, onCancel }: { night: boolean; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const t = palette(night);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  useLayerHistory(true, onCancel);
  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (returnTo && returnTo.isConnected) returnTo.focus();
    };
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
          if (e.key === "Tab") {
            e.preventDefault();
            (document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current)?.focus();
          }
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
          <button ref={confirmRef} type="button" onClick={onConfirm} aria-disabled={busy} style={{ ...button, background: t.coralButton.bg, color: t.coralButton.ink, opacity: busy ? 0.6 : 1 }}>
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoomThread({ poll, roomId, roomKind, clubName, night, now, anchor, header, onReply, onOpenEventChat, scrollToken, emptyBlock }: RoomThreadProps) {
  const t = palette(night);
  const desktop = useChatSurface() === "desktop";
  const { messages, room, viewer, viewerId, failure } = poll;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listScrolledAtRef = useRef(Number.NEGATIVE_INFINITY);
  const pinnedRef = useRef(true);
  const [removeTarget, setRemoveTarget] = useState<ChatMessage | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reportMessage, setReportMessage] = useState<ReportTargetRef | null>(null);
  // ONE handler for the life of the thread: the desktop dialog (`ReportSheet
  // variant="modal"`) takes focus again whenever its `onClose` changes, and
  // this component renders again on every full read (20 s) and every new row,
  // which would pull the caret out of the details box mid-sentence.
  const closeReport = useCallback(() => setReportMessage(null), []);
  // The Report sheet's own history entry (S71 amendment 3, A): Back closes it alone.
  useLayerHistory(reportMessage !== null, closeReport);

  const lastId = messages && messages.length > 0 ? messages[messages.length - 1].id : null;
  const firstId = messages && messages.length > 0 ? messages[0].id : null;
  const rowCount = messages?.length ?? 0;
  // `Earlier messages`: the scroll position before the prepend, so the row
  // the reader was on stays where it is once the older rows are above it.
  // The anchor is consumed by the prepend (a new first row), or by the first
  // state change after the read settled (it brought nothing).
  const earlierAnchorRef = useRef<{ top: number; height: number; firstId: string | null } | null>(null);
  const loadingEarlierRef = useRef(false);
  useLayoutEffect(() => {
    const anchor = earlierAnchorRef.current;
    if (!anchor || messages === null) return;
    if (anchor.firstId !== firstId) {
      earlierAnchorRef.current = null;
      const el = scrollRef.current;
      if (el) el.scrollTop = anchor.top + (el.scrollHeight - anchor.height);
    } else if (!loadingEarlierRef.current) {
      earlierAnchorRef.current = null;
    }
  }, [messages, firstId]);
  // Keep the newest row in view, whatever the anchor (E): on the first page
  // (a no-op while the content does not overflow, so a short chat keeps its
  // layout), on a new last row while the reader sits within PIN_SLACK of the
  // end, and after a send (`scrollToken`). Before paint, so the thread never
  // shows its oldest rows first.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [lastId, rowCount]);
  // The box shrinking (the keyboard) or the content growing (a late image, a
  // vote, the About block) while pinned: the end stays in view. Neither
  // fires a scroll event, so `pinnedRef` still says where the reader was.
  const listShown = !failure && messages !== null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!listShown || !el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [listShown]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || scrollToken === 0) return;
    pinnedRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, [scrollToken]);

  // Today's flow (ConversationView `toggleReaction`), moved as is into
  // reactions.ts so the Board's card posts share it.
  const toggleReaction = (m: ChatMessage, emoji: string) => toggleReactionOn(poll, roomId, m, emoji);

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
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_SLACK;
        }}
        style={{ flexGrow: 1, minHeight: 0, position: "relative", overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", fontFamily: FONT }}
      >
        {/* One column at least as tall as the box: the header (when given), the fade, the rows. The fade sits under the header until that has scrolled away, then sticks to the top. */}
        <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
          {desktop ? <style>{HOVER_ACTIONS_CSS}</style> : null}
          {header}
          <div aria-hidden="true" style={{ flexShrink: 0, position: "sticky", zIndex: 2, top: 0, height: 14, marginBottom: -14, pointerEvents: "none", background: `linear-gradient(180deg, ${t.page} 0%, rgba(0,0,0,0) 100%)` }} />
          {/* Desktop: the column is the hover toolbar's size container (`vibe-hover-list`, HoverActions.tsx). */}
          <div className={desktop ? "vibe-hover-list" : undefined} style={{ flexGrow: 1, boxSizing: "border-box", padding: "8px 12px 8px", display: "flex", flexDirection: "column", justifyContent: anchor === "bottom" ? "flex-end" : "flex-start", gap: 6 }}>
            {poll.hasEarlier ? (
              <button
                type="button"
                onClick={() => {
                  const el = scrollRef.current;
                  if (!el || loadingEarlierRef.current) return;
                  earlierAnchorRef.current = { top: el.scrollTop, height: el.scrollHeight, firstId: messages[0]?.id ?? null };
                  loadingEarlierRef.current = true;
                  pinnedRef.current = false;
                  void poll.loadEarlier().finally(() => {
                    loadingEarlierRef.current = false;
                  });
                }}
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
                        onToggleReaction={(emoji) => void toggleReaction(m, emoji)}
                        onReply={canReply ? () => onReply(replyTargetOf(m, isMine)) : undefined}
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
                // Desktop: the hover toolbar around the row. A removed-content card and a row
                // still sending get no handler, so no toolbar (the wrapper stays, bare).
                const acts = !temp && m.removed === null;
                return (
                  <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                    {sep}
                    {desktop ? (
                      <HoverActions
                        night={night}
                        isMine={isMine}
                        label={`Message from ${authorName(m.users)}`}
                        onReact={acts ? (emoji) => void toggleReaction(m, emoji) : undefined}
                        onReply={acts && canReply ? () => onReply(replyTargetOf(m, isMine)) : undefined}
                        onReport={acts ? report : undefined}
                        onRemove={acts ? remove : undefined}
                      >
                        {row}
                      </HoverActions>
                    ) : (
                      row
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      {removeTarget ? <RemoveConfirm night={night} busy={removing} onConfirm={() => void confirmRemove()} onCancel={() => setRemoveTarget(null)} /> : null}
      {reportMessage ? (
        desktop ? (
          <ReportSheet variant="modal" target={reportMessage} onClose={closeReport} />
        ) : (
          <ReportSheet variant="sheet" nested target={reportMessage} onClose={closeReport} />
        )
      ) : null}
    </>
  );
}
