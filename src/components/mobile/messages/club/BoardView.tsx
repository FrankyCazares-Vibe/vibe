"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import { RemovedContentCard, ReportSheet, type ReportTargetRef } from "@/components/safety/ReportSheet";
import { asDeletedNote, withDeletedQuotes } from "@/lib/chat/deleted-note";
import type { ChatMessage, DeleteOwnResponse, RemoveMessageResponse } from "@/lib/chat/types";
import { useLayerHistory } from "@/lib/chat/use-layer-history";
import { ROOM_FULL_READ_EVERY, ROOM_POLL_MS, type RoomPoll } from "@/lib/chat/use-room-poll";
import { vibeRequest } from "@/lib/feedback/request";
import { ORG_COPY, fillCopy } from "@/lib/orgs/join-copy";

import { DeleteConfirm, rowFocusTarget } from "../DeleteConfirm";
import { canDeleteBoardPost, DELETE_FAILED, deleteConfirmCopy, leftNote } from "../delete-rules";
import { toastSendFailure } from "../send-failure";
import { useChatSurface } from "../surface";
import { FONT, palette } from "../v2-tokens";
import { BoardPost } from "./BoardPost";
import { isEmptyRoom } from "./helpers";
import { HOVER_ACTIONS_CSS } from "./HoverActions";
import { toggleReactionOn } from "./reactions";
import { RemoveConfirm } from "./RoomThread";

/**
 * The Board with folded replies (handoffs/chat-redesign/wave-2-contracts.md
 * 11.4, 1.2; mockup `W0_Board`, MK:5). Reads through the polling hook on the
 * Board's id (top-level rows only, oldest first in the hook) and shows the
 * posts NEWEST FIRST, top-anchored `<article>`s (BoardPost.tsx). A new post
 * (a `?after=` row, an optimistic `temp_` row, a card from a sheet) is at the
 * end of the hook's state, so at the top here, with `Reply` (`reply_count`
 * 0; SCREENS-L14). `Earlier messages` sits under the last post (SCREENS-L7).
 *
 * Every 5th tick (20 s while visible, and not while `paused`: the event chat
 * layer over the space pauses the room's hook, so the folds pause too)
 * `refreshToken` bumps and every open fold re-reads its replies. The
 * viewer's own removed post (`removed !== null`, the only removed row the
 * read sends) is `RemovedContentCard` alone: no byline, no text, no toggle,
 * no field (1.2 "Removed message (own)"; S2-repair.md SEC1). States: the
 * skeleton (three post-shaped blocks), `Nothing on the Board yet.`,
 * `LoadFailed` (`Couldn't load the Board.`, the hook's `line` set by the
 * space).
 *
 * Wave 3 (handoffs/chat-redesign/wave-3-desktop/contract.md 4c.4, 6.3):
 * `Remove` and `Report` reach text posts and replies too (the "..." of
 * `BoardPost`; the owed 17.2 L3), through the one confirm and the one report
 * sheet here; a removed reply makes the open folds read again. On the
 * desktop surface only: one line above the posts says whose announcements
 * these are, the report opens as the modal, not as a nested sheet, and the
 * hover toolbar's CSS is rendered once for the card posts (`BoardPost` wraps
 * a card in `HoverActions` there: the long press does not arm on a laptop).
 */
export type BoardViewProps = {
  poll: RoomPoll;
  roomId: string;
  night: boolean;
  now: Date;
  onOpenEventChat: (roomId: string) => void;
  /** Bumped after a send or a posted card: the list scrolls to the top (the newest). */
  scrollToken: number;
  /** True while the event chat layer is open over the space: no fold re-read. */
  paused?: boolean;
};

const SKELETON_DISC = "rgba(var(--scrim-rgb),0.06)";
const SKELETON_BAR = "rgba(var(--scrim-rgb),0.08)";
const SKELETON_BAR_SOFT = "rgba(var(--scrim-rgb),0.05)";

function BoardSkeleton({ night }: { night: boolean }) {
  const t = palette(night);
  return (
    <div aria-hidden="true" style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: "8px 12px 0", display: "flex", flexDirection: "column", gap: 8 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ boxSizing: "border-box", padding: "10px 12px", borderRadius: 16, border: `1px solid ${t.hairline}`, background: t.surface, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 999, background: SKELETON_DISC }} />
            <span style={{ width: 90, height: 12, borderRadius: 6, background: SKELETON_BAR }} />
          </div>
          <span style={{ width: ["85%", "60%", "72%"][i], height: 14, borderRadius: 6, background: SKELETON_BAR_SOFT }} />
        </div>
      ))}
    </div>
  );
}

export function BoardView({ poll, roomId, night, now, onOpenEventChat, scrollToken, paused = false }: BoardViewProps) {
  const t = palette(night);
  const surface = useChatSurface();
  const { messages, room, viewer, viewerId, failure } = poll;
  const [refreshToken, setRefreshToken] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<ChatMessage | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reportMessage, setReportMessage] = useState<ReportTargetRef | null>(null);
  // The viewer's own post or reply they asked to delete (Oct 19, 2026; decision 9).
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  // ONE handler for the life of the Board, as in `RoomThread`: the desktop
  // dialog (`ReportSheet variant="modal"`) takes focus again whenever its
  // `onClose` changes, and the Board renders again on every poll, which would
  // pull the caret out of the details box mid-sentence.
  const closeReport = useCallback(() => setReportMessage(null), []);
  // The Report sheet's own history entry (S71 amendment 3, A): Back closes it
  // alone. The remove confirm takes its own inside `RemoveConfirm`.
  useLayerHistory(reportMessage !== null, closeReport);
  const scrollRef = useRef<HTMLElement | null>(null);

  // The every-5th-tick re-read of the open folds (11.4): the same period as
  // the hook's full read, counted here while the page is visible.
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setRefreshToken((n) => n + 1);
    }, ROOM_POLL_MS * ROOM_FULL_READ_EVERY);
    return () => window.clearInterval(id);
  }, [paused]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && scrollToken > 0) el.scrollTop = 0;
  }, [scrollToken]);

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
    if (target.thread_root_id === null) {
      poll.remove(target.id);
      return;
    }
    // A reply is not in the hook's rows (top-level only): the open folds
    // read again now, and its post is re-read for the server's `reply_count`.
    setRefreshToken((n) => n + 1);
    const root = messages?.find((m) => m.id === target.thread_root_id);
    if (root) void poll.refreshOne(root.created_at);
  };

  // Delete for everyone (Oct 19, 2026). A post becomes its "Post deleted"
  // note in place (its replies stay; `asDeletedNote` keeps `reply_count`), or
  // goes when the server took it away whole. A reply is not in the hook's
  // rows: the open folds read again and show its note.
  const confirmDelete = async () => {
    const target = deleteTarget;
    if (!target || deleting) return;
    setDeleting(true);
    const r = await vibeRequest<DeleteOwnResponse>(
      `/api/me/threads/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(target.id)}`,
      { method: "DELETE", failure: DELETE_FAILED, quiet: true },
    );
    setDeleting(false);
    setDeleteTarget(null);
    if (!r.ok) {
      toastSendFailure(r);
      return;
    }
    if (target.thread_root_id === null) {
      const note = leftNote(r.data);
      if (note) poll.replace(target.id, asDeletedNote(target));
      else poll.remove(target.id);
      // Any post that quoted it quotes the note now (review of Oct 19, 2026).
      const rows = messages ?? [];
      withDeletedQuotes(rows, target.id, note).forEach((m, i) => {
        if (m !== rows[i]) poll.replace(m.id, m);
      });
      return;
    }
    setRefreshToken((n) => n + 1);
    const root = messages?.find((m) => m.id === target.thread_root_id);
    if (root) void poll.refreshOne(root.created_at);
  };

  const reportRef = (m: ChatMessage): ReportTargetRef => ({
    type: "message",
    id: m.id,
    authorId: m.users?.id ?? m.user_id,
    authorName: m.users?.name || (m.users?.handle ? `@${m.users.handle}` : null),
    noun: "message",
  });

  if (failure) {
    return (
      <div style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: "16px 12px" }}>
        <LoadFailed failure={failure} onRetry={() => void poll.reload()} tone={night ? "dark" : "light"} />
      </div>
    );
  }
  if (messages === null) return <BoardSkeleton night={night} />;

  const posts = messages.filter((m) => !m.hidden).slice().reverse();
  const empty = isEmptyRoom(messages);

  return (
    <>
      <section
        ref={scrollRef}
        aria-label="Board posts, newest first"
        style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", boxSizing: "border-box", padding: "8px 12px 8px", display: "flex", flexDirection: "column", gap: 8, fontFamily: FONT }}
      >
        {surface === "desktop" ? <style>{HOVER_ACTIONS_CSS}</style> : null}
        {surface === "desktop" && room?.org.name ? (
          <p style={{ flexShrink: 0, margin: 0, padding: "2px 4px 0", color: t.muted, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>
            {`${fillCopy(ORG_COPY.board.intro, { org: room.org.name })} Everyone in the club sees them.`}
          </p>
        ) : null}
        {empty ? (
          <div style={{ padding: "48px 18px", textAlign: "center", color: t.secondary, fontSize: 13.5, lineHeight: 1.5 }}>{ORG_COPY.board.empty}</div>
        ) : (
          posts.map((post) => {
            if (post.removed !== null) {
              return (
                <div key={post.id} style={{ flexShrink: 0, alignSelf: "flex-end", maxWidth: "min(300px, 86%)" }}>
                  <RemovedContentCard kind="message" compact by={post.removed.by} removedAt={post.removed.at} removedReason={post.removed.reason} />
                </div>
              );
            }
            const isMine = viewerId !== null && post.user_id === viewerId;
            const temp = post.id.startsWith("temp_");
            const canRemove = !!viewer?.can_moderate && !isMine && !temp;
            const canReport = !!viewerId && !isMine && !temp;
            return (
              <BoardPost
                key={post.id}
                post={post}
                roomId={roomId}
                room={room}
                viewer={viewer}
                viewerId={viewerId}
                night={night}
                now={now}
                refreshToken={refreshToken}
                onCard={poll.replaceCard}
                onRefresh={(createdAt) => void poll.refreshOne(createdAt)}
                onOpenEventChat={onOpenEventChat}
                onRemove={canRemove && !post.deleted ? () => setRemoveTarget(post) : undefined}
                onReport={canReport && !post.deleted ? () => setReportMessage(reportRef(post)) : undefined}
                onDelete={canDeleteBoardPost(post, viewerId) ? () => setDeleteTarget(post) : undefined}
                onDeleteReply={viewerId && !temp ? setDeleteTarget : undefined}
                onRemoveReply={viewer?.can_moderate && !temp ? setRemoveTarget : undefined}
                onReportReply={viewerId && !temp ? (reply) => setReportMessage(reportRef(reply)) : undefined}
                onReplied={() => void poll.refreshOne(post.created_at)}
                onMissing={() => poll.remove(post.id)}
                onToggleReaction={(emoji) => void toggleReactionOn(poll, roomId, post, emoji)}
              />
            );
          })
        )}
        {poll.hasEarlier ? (
          <button
            type="button"
            onClick={() => void poll.loadEarlier()}
            style={{ alignSelf: "center", flexShrink: 0, height: 44, padding: "0 16px", border: "none", background: "transparent", color: t.secondary, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
          >
            Earlier messages
          </button>
        ) : null}
      </section>
      {removeTarget ? <RemoveConfirm night={night} busy={removing} onConfirm={() => void confirmRemove()} onCancel={() => setRemoveTarget(null)} /> : null}
      {deleteTarget ? (
        <DeleteConfirm
          night={night}
          busy={deleting}
          copy={deleteConfirmCopy(deleteTarget.thread_root_id === null ? { boardPost: true, replies: deleteTarget.reply_count } : {})}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
          focusAfter={() => rowFocusTarget(scrollRef.current, deleteTarget.id, deleteTarget.thread_root_id)}
        />
      ) : null}
      {reportMessage ? (
        // The desktop pane has no drawer above it: the modal form there (a nested vaul sheet without a parent drawer throws).
        surface === "desktop" ? (
          <ReportSheet variant="modal" target={reportMessage} onClose={closeReport} />
        ) : (
          <ReportSheet variant="sheet" nested target={reportMessage} onClose={closeReport} />
        )
      ) : null}
    </>
  );
}
