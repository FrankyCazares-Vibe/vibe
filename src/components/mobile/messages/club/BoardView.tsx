"use client";

import { useEffect, useRef, useState } from "react";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import { ReportSheet, type ReportTargetRef } from "@/components/safety/ReportSheet";
import type { ChatMessage, RemoveMessageResponse } from "@/lib/chat/types";
import { ROOM_FULL_READ_EVERY, ROOM_POLL_MS, type RoomPoll } from "@/lib/chat/use-room-poll";
import { vibeRequest } from "@/lib/feedback/request";

import { toastSendFailure } from "../send-failure";
import { FONT, palette } from "../v2-tokens";
import { BoardPost } from "./BoardPost";
import { isEmptyRoom } from "./helpers";
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
 * Every 5th tick (20 s while visible) `refreshToken` bumps and every open
 * fold re-reads its replies. States: the skeleton (three post-shaped
 * blocks), `Nothing on the Board yet.`, `LoadFailed` (`Couldn't load the
 * Board.`, the hook's `line` set by the space).
 */
export type BoardViewProps = {
  poll: RoomPoll;
  roomId: string;
  night: boolean;
  now: Date;
  onOpenEventChat: (roomId: string) => void;
  /** Bumped after a send or a posted card: the list scrolls to the top (the newest). */
  scrollToken: number;
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

export function BoardView({ poll, roomId, night, now, onOpenEventChat, scrollToken }: BoardViewProps) {
  const t = palette(night);
  const { messages, room, viewer, viewerId, failure } = poll;
  const [refreshToken, setRefreshToken] = useState(0);
  const [removeTarget, setRemoveTarget] = useState<ChatMessage | null>(null);
  const [removing, setRemoving] = useState(false);
  const [reportMessage, setReportMessage] = useState<ReportTargetRef | null>(null);
  const scrollRef = useRef<HTMLElement | null>(null);

  // The every-5th-tick re-read of the open folds (11.4): the same period as
  // the hook's full read, counted here while the page is visible.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      setRefreshToken((n) => n + 1);
    }, ROOM_POLL_MS * ROOM_FULL_READ_EVERY);
    return () => window.clearInterval(id);
  }, []);

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
    poll.remove(target.id);
  };

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
        {empty ? (
          <div style={{ padding: "48px 18px", textAlign: "center", color: t.secondary, fontSize: 13.5, lineHeight: 1.5 }}>Nothing on the Board yet.</div>
        ) : (
          posts.map((post) => {
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
                onRemove={canRemove ? () => setRemoveTarget(post) : undefined}
                onReport={
                  canReport
                    ? () => setReportMessage({ type: "message", id: post.id, authorId: post.users?.id ?? post.user_id, authorName: post.users?.name || (post.users?.handle ? `@${post.users.handle}` : null), noun: "message" })
                    : undefined
                }
                onReplied={() => poll.replace(post.id, { ...post, reply_count: (post.reply_count ?? 0) + 1 })}
                onMissing={() => poll.remove(post.id)}
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
      {reportMessage ? <ReportSheet variant="sheet" nested target={reportMessage} onClose={() => setReportMessage(null)} /> : null}
    </>
  );
}
