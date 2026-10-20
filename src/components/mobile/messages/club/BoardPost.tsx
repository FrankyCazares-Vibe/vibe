"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { RemovedContentCard } from "@/components/safety/ReportSheet";
import type { ChatMessage, ThreadMessagesResponse, ThreadRoom, ViewerInRoom } from "@/lib/chat/types";
import type { RoomPoll } from "@/lib/chat/use-room-poll";
import { DELETED_LINE, DELETED_POST_LINE } from "@/lib/chat/deleted-note";
import { rowTime, rowTimeSpoken } from "@/lib/chat/when";
import { vibeRequest } from "@/lib/feedback/request";

import { personColor } from "../avatar";
import { CardBubble } from "../cards/CardBubble";
import { TrashIcon } from "../DeleteConfirm";
import { canDeleteOwn, DELETE_LABEL } from "../delete-rules";
import { initialsOf } from "../format";
import { toastSendFailure } from "../send-failure";
import { useChatSurface } from "../surface";
import { FONT, palette } from "../v2-tokens";
import { authorName, postAriaLabel, repliesToggleLabel, repliesToggleText, roleWord } from "./helpers";
import { HoverActions } from "./HoverActions";

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
 *
 * A text post's byline and each reply row end in a "..." (`MoreMenu`, below;
 * wave-3 contract 6.3, the owed 17.2 L3) for `Report` and `Remove`, on the
 * phone and on the desktop: the post's through `onReport` / `onRemove`, a
 * reply's through `onReportReply` / `onRemoveReply`. The Board view owns the
 * confirm, the report sheet and the request.
 *
 * A card post has ONE door of its own instead, never a byline "..." as well:
 * the long press on the phone, and on the desktop surface (where that press
 * never arms) the hover toolbar the thread's rows have (`HoverActions`,
 * wave-3 contract 6.4): React, Reply, and `More` with the same `Report` and
 * `Remove`. The Board view renders the toolbar's CSS once.
 *
 * Delete (Oct 19, 2026; batch B7, decisions 8 and 9): the officer's own
 * post (the byline "..." for text, the card's own door for a card) and the
 * viewer's own reply (its "..." holds Delete only). A deleted post keeps its
 * byline and shows "Post deleted" in place of its body; its replies stay
 * readable and the reply field goes. A deleted reply keeps its name and
 * shows "Message deleted".
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
  /** `Remove` on one reply of this post: passed only to the owner or an officer; never offered on the viewer's own reply. */
  onRemoveReply?: (reply: ChatMessage) => void;
  /** `Report` on one reply of this post; never offered on the viewer's own reply. */
  onReportReply?: (reply: ChatMessage) => void;
  /** `Delete` on the post: the viewer's own (Oct 19, 2026, decision 9; delete-rules.ts `canDeleteBoardPost`). */
  onDelete?: () => void;
  /** `Delete` on one reply: offered only on the viewer's own (`canDeleteOwn`), decided here per reply. */
  onDeleteReply?: (reply: ChatMessage) => void;
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

const MORE_ITEM_CSS = `
.vibe-board-more-item { background: transparent; }
.vibe-board-more-item:hover, .vibe-board-more-item:focus-visible { background: rgba(var(--scrim-rgb), 0.06); }
`;

/**
 * The three places of a "..." (`MoreMenu`): the button's own box, the
 * negative margins that keep its row as tall as it was and reach into the
 * post's 12px gutter (the dots end 2px inside the post's text edge on all
 * three), and the menu's right edge (the post's text edge).
 *
 * `byline`: 44 in the 28px byline. `replyPointer`: 28 in a 22px reply row on
 * the desktop surface, where the rows are 28px apart and a pointer is exact.
 * `replyTouch`: a reply row on the phone, a full 44px target (wave-2
 * contract 11.0) centred on the reply's first line; it reaches 11px above
 * and below its 22px row, so the fold spaces those rows 44px apart
 * (`REPLY_TOUCH_GAP`) and keeps the same 11px clear of the toggle above and
 * of the reply field below: no two targets share a pixel.
 */
const MORE_AT = {
  byline: { box: 44, margin: "-8px -12px -8px -10px", menuRight: 12 },
  replyTouch: { box: 44, margin: "-11px -12px -11px -8px", menuRight: 12 },
  replyPointer: { box: 28, margin: "-3px -4px -3px -4px", menuRight: 4 },
} as const;
/** The phone's gap between reply rows once one of them carries a "...": a 22px row plus this is the 44px box's pitch. */
const REPLY_TOUCH_GAP = 22;
/** The same fold's padding: 11px above the first row; 3px under the last, which with the reply field's 8px margin is 11 again. */
const REPLY_TOUCH_PADDING = "11px 0 3px 10px";

/**
 * The "..." of a text post's byline and of a reply row (wave-3 contract 6.3,
 * 2.5 row 10 (d); the owed 17.2 L3): until now `Report` and `Remove` were
 * reachable only from a card post's long press. A button named `More` and a
 * small menu under it with the actions it was given (`Report`: never on the
 * viewer's own; `Remove`: the owner or an officer, never on their own; the
 * caller decides and passes a handler or not). Nothing is drawn with no
 * handler.
 *
 * `at` is where it sits (`MORE_AT`, above). The menu is in flow of the post
 * (absolute under the button), not a portal: it works the same inside the
 * phone's drawer and the desktop pane.
 *
 * Keys: Enter or Space opens it and focus lands on the first item; Up and
 * Down move; Esc or Tab closes it (Esc gives focus back to the button and is
 * stopped, so on the desktop it never also closes the chat). A press outside
 * closes it. A picked action closes the menu first and returns focus to the
 * button, so the confirm or the report sheet it opens hands focus back there.
 */
function MoreMenu({ night, at, onReport, onRemove, onDelete }: { night: boolean; at: keyof typeof MORE_AT; onReport?: () => void; onRemove?: () => void; onDelete?: () => void }) {
  const t = palette(night);
  const { box, margin, menuRight } = MORE_AT[at];
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Under the button unless the Board's scroller cannot show it there (the
  // last reply of the last post), then above it. Written to the node before
  // paint; the menu is mounted anew at every open, so nothing is to undo.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    let list = menu.parentElement;
    while (list && !/auto|scroll/.test(getComputedStyle(list).overflowY)) list = list.parentElement;
    const floor = list ? list.getBoundingClientRect().bottom : window.innerHeight;
    if (menu.getBoundingClientRect().bottom > floor) {
      menu.style.top = "auto";
      menu.style.bottom = "100%";
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const onPress = (e: PointerEvent) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPress, true);
    return () => document.removeEventListener("pointerdown", onPress, true);
  }, [open]);

  if (!onReport && !onRemove && !onDelete) return null;

  const run = (action: () => void) => {
    setOpen(false);
    buttonRef.current?.focus();
    action();
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
  };
  const item: React.CSSProperties = { height: 40, width: "100%", boxSizing: "border-box", padding: "0 12px", border: "none", borderRadius: 8, color: t.ink, fontFamily: "inherit", fontSize: 14, fontWeight: 600, textAlign: "left", cursor: "pointer", WebkitTapHighlightColor: "transparent" };

  return (
    <span ref={wrapRef} style={{ position: "relative", flexShrink: 0, display: "flex", margin }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ width: box, height: box, padding: 0, border: "none", borderRadius: 999, background: "transparent", color: t.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>
      {open ? <style>{MORE_ITEM_CSS}</style> : null}
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="More"
          onKeyDown={onMenuKey}
          style={{ position: "absolute", zIndex: 5, top: "100%", right: menuRight, minWidth: 148, boxSizing: "border-box", padding: 4, borderRadius: 12, border: `1px solid ${t.fieldBorder}`, background: t.surface, boxShadow: "var(--card-shadow)", display: "flex", flexDirection: "column", whiteSpace: "nowrap" }}
        >
          {onReport ? (
            <button type="button" role="menuitem" className="vibe-board-more-item" onClick={() => run(onReport)} style={item}>
              Report
            </button>
          ) : null}
          {onRemove ? (
            <button type="button" role="menuitem" className="vibe-board-more-item" onClick={() => run(onRemove)} style={item}>
              Remove
            </button>
          ) : null}
          {onDelete ? (
            <button type="button" role="menuitem" className="vibe-board-more-item" onClick={() => run(onDelete)} style={{ ...item, color: "var(--danger-ink)", display: "flex", alignItems: "center", gap: 8 }}>
              <TrashIcon />
              {DELETE_LABEL}
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

export function BoardPost({ post, roomId, room, viewer, viewerId, night, now, refreshToken, onCard, onRefresh, onOpenEventChat, onRemove, onReport, onRemoveReply, onReportReply, onDelete, onDeleteReply, onToggleReaction, onReplied, onMissing }: BoardPostProps) {
  const t = palette(night);
  const surface = useChatSurface();
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
  // A deleted post (Oct 19, 2026): the "Post deleted" line in its body's
  // place, its byline (who and when) and its replies stay; no menu, and no
  // new replies under it (the database would still take one; the field goes).
  const deleted = post.deleted === true;
  const canReply = !!viewer?.can_reply && !temp && !deleted;
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
  const desktop = surface === "desktop";
  // The byline's "..." (owed L3): on a text post, where nothing else names
  // Report or Remove. A card post has its own door (the long press, or the
  // hover toolbar below), so never both.
  const bylineMore = post.kind === "text" && !deleted;
  // `Reply` on a card post, from the phone's picker or the desktop's toolbar:
  // the fold opens with the reply field focused.
  const replyFromCard = canReply
    ? () => {
        setOpen(true);
        setFocusReply((n) => n + 1);
      }
    : undefined;
  // A reply's "...": never on the viewer's own reply; Remove only for the
  // owner or an officer (the Board view passes it only then).
  // Since Oct 19, 2026 the viewer's own reply has one too, with Delete only.
  const replyMore = (m: ChatMessage) =>
    m.deleted !== true &&
    m.removed === null &&
    (canDeleteOwn(m, viewerId)
      ? !!onDeleteReply
      : viewerId !== null && m.user_id !== viewerId && (!!onReportReply || (!!onRemoveReply && !!viewer?.can_moderate)));
  // The phone's fold once a row carries a "...": every row 44px apart, so
  // the 44px targets never touch (`MORE_AT.replyTouch`). A fold with none
  // (the viewer's own replies only) and the desktop keep the 28px rhythm.
  const touchRows = !desktop && visibleReplies.some(replyMore);
  const card =
    post.kind !== "text" ? (
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
        onDelete={onDelete}
        onToggleReaction={onToggleReaction}
        onReply={replyFromCard}
      />
    ) : null;

  return (
    <article
      aria-label={postAriaLabel(name, post.author_role, rowTimeSpoken(post.created_at, now))}
      // A deleted post takes focus after its delete (DeleteConfirm's `focusAfter`; review of Oct 19, 2026).
      data-chat-row={post.id}
      tabIndex={deleted ? -1 : undefined}
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
        {bylineMore ? <MoreMenu night={night} at="byline" onReport={onReport} onRemove={onRemove} onDelete={onDelete} /> : null}
      </div>
      {card ? (
        // Desktop: the card's slot is the hover toolbar's size container (`vibe-hover-list`, HoverActions.tsx), so the pill stays inside the post.
        <div className={desktop ? "vibe-hover-list" : undefined} style={{ marginTop: 8 }}>
          {desktop ? (
            // A post is full width and left on both sides of the room, so the toolbar is always at the far (right) corner: never `isMine`.
            // A post still sending gets no handler, so no toolbar (the wrapper stays, bare).
            <HoverActions
              night={night}
              isMine={false}
              label={`Message from ${name}`}
              onReact={temp ? undefined : onToggleReaction}
              onReply={replyFromCard}
              onReport={temp ? undefined : onReport}
              onRemove={temp ? undefined : onRemove}
              onDelete={temp ? undefined : onDelete}
            >
              {card}
            </HoverActions>
          ) : (
            card
          )}
        </div>
      ) : deleted ? (
        <p style={{ margin: "6px 0 0", fontSize: 14, fontStyle: "italic", fontWeight: 500, lineHeight: 1.35, color: t.muted }}>{DELETED_POST_LINE}</p>
      ) : (
        <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 500, lineHeight: 1.35, textWrap: "pretty", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{post.content}</p>
      )}
      {deleted && count === 0 ? (
        <div aria-hidden="true" style={{ height: 10 }} />
      ) : (
        <button
          type="button"
          data-replies-toggle={post.id}
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
      )}
      {open && !(deleted && count === 0) ? (
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
            <div role="group" aria-label="Replies" style={{ boxSizing: "border-box", padding: touchRows ? REPLY_TOUCH_PADDING : "0 0 0 10px", display: "flex", flexDirection: "column", gap: touchRows ? REPLY_TOUCH_GAP : 6 }}>
              {visibleReplies.map((m) => {
                if (m.removed !== null) {
                  return (
                    <div key={m.id} style={{ alignSelf: "flex-end", maxWidth: "min(300px, 86%)" }}>
                      <RemovedContentCard kind="message" compact by={m.removed.by} removedAt={m.removed.at} removedReason={m.removed.reason} />
                    </div>
                  );
                }
                return (
                  <div key={m.id} data-chat-row={m.id} tabIndex={m.deleted ? -1 : undefined} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <Avatar person={m.users} fallbackId={m.user_id} size={22} fontSize={8.5} />
                    <p style={{ flexGrow: 1, minWidth: 0, margin: 0, paddingTop: 2, fontSize: 13, lineHeight: "18px", color: t.secondary, overflowWrap: "anywhere" }}>
                      <span style={{ fontWeight: 700, color: t.ink }}>{viewerId !== null && m.user_id === viewerId && !m.users ? "You" : authorName(m.users)}</span>{" "}
                      {m.deleted ? <span style={{ fontStyle: "italic", color: t.muted }}>{DELETED_LINE}</span> : m.content}
                    </p>
                    {replyMore(m) ? (
                      <MoreMenu
                        night={night}
                        at={desktop ? "replyPointer" : "replyTouch"}
                        onReport={onReportReply && !canDeleteOwn(m, viewerId) ? () => onReportReply(m) : undefined}
                        onRemove={onRemoveReply && viewer?.can_moderate && !canDeleteOwn(m, viewerId) ? () => onRemoveReply(m) : undefined}
                        onDelete={onDeleteReply && canDeleteOwn(m, viewerId) ? () => onDeleteReply(m) : undefined}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {canReply ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendReply();
              }}
              style={{ margin: "8px 0 0 10px", height: 44, boxSizing: "border-box", padding: "0 0 0 14px", borderRadius: 999, border: `1px solid ${t.fieldBorder}`, background: "rgba(var(--scrim-rgb),0.04)", display: "flex", alignItems: "center" }}
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
