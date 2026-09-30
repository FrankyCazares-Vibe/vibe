"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { PushAsk } from "@/components/push/PushAsk";
import { ReportSheet, type ReportTargetRef } from "@/components/safety/ReportSheet";
import { REFUSAL_SENTENCES, type RoomKind, type ThreadMessagesResponse } from "@/lib/chat/types";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

import { ConversationActionSheet } from "./ConversationActionSheet";
import { entryCanPost, quotedBody, threadAvatar, threadTitle } from "./format";
import { GroupSettingsView } from "./GroupSettingsView";
import { MessageBubble } from "./MessageBubble";
import { toastSendFailure } from "./send-failure";
import { vaulOverlayStyle, visuallyHiddenStyle } from "./sheet-styles";
import { useNightTheme } from "./theme";
import { type MessageRow, type ParentPreview, type ThreadEntry } from "./types";

// What the composer can attach: the upload route's own types and limits
// (src/app/api/me/messages-upload-url). They're checked here before any
// request, because the route's 400 text never reaches the student.
const ATTACH_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm";

const ATTACH_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const ATTACH_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/** A photo or video picked for the next message. previewUrl is a blob: URL. */
type StagedMedia = {
  file: File;
  kind: "image" | "video";
  contentType: string;
  previewUrl: string;
};

/** The message being replied to: the stub the optimistic row carries, and
 *  the name the pill above the composer shows. */
type ReplyTarget = { parent: ParentPreview; authorName: string };

export function ConversationView({
  threadId,
  thread,
  onClose,
  onThreadsChanged,
  backdropCss,
}: {
  threadId: string;
  thread: ThreadEntry | null;
  onClose: () => void;
  /** The thread list should re-sync: a request was accepted, or a reply
   *  accepted it. MessagesMobile refetches; CampusMobile passes nothing. */
  onThreadsChanged?: () => void;
  /** Optional org backdrop gradient (CSS background value). When set
   *  (and not the cream preset), the chat container, header, and input
   *  bar flip to dark-glass treatments so the wallpaper reads as the
   *  feature instead of clashing with cream chrome. */
  backdropCss?: string | null;
}) {
  // The dark-glass chrome and bubbles: over a dark org backdrop, or on
  // Night's near-black paper when there is none. Light with no backdrop
  // keeps the cream chrome exactly as before.
  const night = useNightTheme();
  const onDark = !!backdropCss || night;
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  // Why the first load failed, shown in the list's place. Retry bumps
  // loadSeq, which re-runs the load.
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadSeq, setLoadSeq] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  // Club chat v1: which kind of club room this is (null on a dm or a
  // group) and whether the viewer may post here. Seeded from the list
  // entry, then set by the thread read. A server that sends neither
  // leaves both as they were before club chat.
  const [roomKind, setRoomKind] = useState<RoomKind | null>(thread?.room_kind ?? null);
  const [canPost, setCanPost] = useState<boolean | null>(entryCanPost(thread));
  // One message, reported from the long-press picker. A single message is a
  // `message` target; the whole chat is handled by the ⋯ sheet.
  const [reportMessage, setReportMessage] = useState<ReportTargetRef | null>(null);
  const [staged, setStaged] = useState<StagedMedia | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // Where a message request stands once the viewer answers it here, so
  // the bar goes before the thread list re-syncs.
  const [requestState, setRequestState] = useState<"pending" | "accepted" | "declined">(
    "pending",
  );
  const [reqBusy, setReqBusy] = useState(false);
  // A DM sent from this view: mounts the push ask above the composer for
  // the rest of the view. PushAsk decides whether anything shows.
  const [showPushAsk, setShowPushAsk] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  // Local mirror of pinned_at + muted_until so the menu reflects taps
  // before the thread list re-syncs. Seeded from `thread` prop.
  const [pinnedAt, setPinnedAt] = useState<string | null>(
    thread?.pinned_at ?? null,
  );
  const [mutedUntil, setMutedUntil] = useState<string | null>(
    thread?.muted_until ?? null,
  );
  // The messages, their load failure, the reply target, the staged file,
  // the request bar and the push ask all belong to one thread. If the
  // thread changes under a mounted view, reset them here during render,
  // before anything of the old thread paints (an effect would paint it
  // first).
  const [shownThreadId, setShownThreadId] = useState(threadId);
  if (shownThreadId !== threadId) {
    setShownThreadId(threadId);
    setMessages(null);
    setLoadErr(null);
    setReplyTo(null);
    setStaged(null);
    setRequestState("pending");
    setShowPushAsk(false);
    setRoomKind(thread?.room_kind ?? null);
    setCanPost(entryCanPost(thread));
  }
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // When the message list last scrolled (performance.now()). A bubble's
  // pending long-press reads it so a scroll never opens the picker.
  const listScrolledAtRef = useRef(Number.NEGATIVE_INFINITY);

  // The composer grows with its draft up to its 120px max, so a normal
  // draft never needs scrolling inside the box: under handleOnly, vaul's
  // iOS scroll lock blocks a finger-scroll there.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    // +2 for the 1px top and bottom border (border-box).
    el.style.height = `${Math.min(el.scrollHeight + 2, 120)}px`;
  }, [draft]);

  // Hide the tab bar while the conversation is open. Reuses the
  // existing composer-overlay rule in globals.css.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, []);

  // Initial fetch, and Retry. A first load that fails shows LoadFailed in
  // the list's place and the composer stays; once rows are on screen, a
  // later failed load keeps them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<
        { messages?: MessageRow[]; viewer_id?: string } & Partial<
          Pick<ThreadMessagesResponse, "room" | "viewer">
        >
      >(
        `/api/me/threads/${encodeURIComponent(threadId)}/messages?limit=50`,
        { cache: "no-store", quiet: true, failure: "Couldn't load this conversation." },
      );
      // Closed, another thread, or a newer Retry: drop it, failures too.
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.messages)) {
        // API returns oldest-first — UI appends new messages to the
        // bottom, so the array can be used as-is.
        setLoadErr(null);
        setMessages(r.data.messages);
        if (typeof r.data.viewer_id === "string") setMeId(r.data.viewer_id);
        // Club chat v1. No `viewer` or `room` in the answer: keep what
        // the list entry said.
        const viewer = r.data.viewer;
        setCanPost((prev) => (viewer ? viewer.can_post !== false : (prev ?? true)));
        if (r.data.room?.kind) setRoomKind(r.data.room.kind);
        return;
      }
      setLoadErr(asLoadFailure(r, "Couldn't load this conversation."));
      // Still unknown: the composer stays, as before club chat.
      setCanPost((prev) => prev ?? true);
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, loadSeq]);

  // Mark as read — best-effort and quiet: the student didn't ask for it,
  // and only the unread dot would notice.
  useEffect(() => {
    void vibeRequest(`/api/me/threads/${encodeURIComponent(threadId)}/read`, {
      method: "POST",
      quiet: true,
      failure: "Couldn't mark this conversation as read.",
    });
  }, [threadId]);

  // Auto-scroll to the bottom on first message-paint + after sends. Keyed on
  // the newest message's id, not on `messages`: a reaction rewrites that
  // array, and scrolling then yanked the reader away from the message they
  // had just reacted to. A first paint always scrolls; after that only a
  // genuinely new message does, and only if the reader was already at the
  // bottom (they may have scrolled up to read while a message arrived).
  const lastMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages === null) return;
    const newestId = messages.length ? messages[messages.length - 1].id : null;
    if (newestId === lastMessageIdRef.current) return;
    const isFirstPaint = lastMessageIdRef.current === null;
    lastMessageIdRef.current = newestId;
    // Measured here rather than read from the scroll handler's ref: same
    // ~80px test, but it reflects where the reader is right now.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (isFirstPaint || atBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Photos and videos only take their real height once they load, which
  // pushes the newest message below the fold after the scroll above ran.
  // Track whether the reader is at the bottom so a late-loading one keeps
  // them pinned there — and leaves them alone if they scrolled up.
  const pinnedToBottomRef = useRef(true);
  const keepPinnedToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el && pinnedToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, []);

  // A message request the viewer hasn't answered here yet. CampusMobile's
  // org entries carry no is_request, so the bar never shows there.
  const isRequest = thread?.is_request === true && requestState === "pending";
  // One-to-one DMs only: CampusMobile reuses this view for club channels,
  // and neither those nor group chats get the push ask.
  const isDm = thread?.type === "dm";

  // Re-runs the load: Retry, and a send that couldn't be painted onto the
  // list (none loaded yet, or no row in the server's answer).
  const reload = useCallback(() => {
    setLoadErr(null);
    setLoadSeq((n) => n + 1);
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    const media = staged;
    if ((!text && !media) || sending) return;
    const reply = replyTo;
    const body = {
      content: text,
      ...(reply ? { parent_message_id: reply.parent.id } : {}),
    };
    const url = `/api/me/threads/${encodeURIComponent(threadId)}/messages`;
    setSending(true);
    try {
      let row: MessageRow | undefined;
      if (media) {
        // Non-optimistic: nothing is painted until the server has the
        // message. A failure at any step keeps the file, the draft and
        // the reply target, and the toast has said why.
        const failure =
          media.kind === "video" ? "Couldn't upload your video." : "Couldn't upload your photo.";
        const sign = await vibeRequest<{
          uploadUrl?: string;
          objectKey?: string;
          kind?: "image" | "video";
        }>("/api/me/messages-upload-url", {
          json: { channelId: threadId, contentType: media.contentType, sizeBytes: media.file.size },
          failure,
          quiet: true,
        });
        if (!sign.ok) {
          toastSendFailure(sign);
          return;
        }
        const { uploadUrl, objectKey } = sign.data;
        if (!uploadUrl || !objectKey) {
          toast({ message: `${failure} Try again.`, tone: "error" });
          return;
        }
        // The signature binds Content-Length to the declared size, and a
        // File body sends exactly those bytes. R2 is another origin, so
        // the same-origin default sends no cookies.
        const put = await vibeRequest(uploadUrl, {
          method: "PUT",
          body: media.file,
          headers: { "content-type": media.contentType },
          failure,
        });
        if (!put.ok) return;
        const r = await vibeRequest<{ message?: MessageRow }>(url, {
          json: { ...body, media_url: objectKey, media_kind: sign.data.kind ?? media.kind },
          failure: "Couldn't send your message.",
          quiet: true,
        });
        if (!r.ok) {
          toastSendFailure(r);
          return;
        }
        row = r.data.message;
        const sent = row;
        setMessages((prev) => (prev && sent ? [...prev, sent] : prev));
        setStaged(null);
        // Anything typed while it uploaded stays in the box.
        setDraft((d) => (d.trim() === text ? "" : d));
      } else {
        // Optimistic, but only onto a list that loaded: one row under a
        // failed load would read as the whole conversation.
        const tempId = `temp_${Date.now()}`;
        setMessages((prev) =>
          prev
            ? [
                ...prev,
                {
                  id: tempId,
                  content: text,
                  created_at: new Date().toISOString(),
                  user_id: meId ?? "me",
                  parent_preview: reply?.parent ?? null,
                },
              ]
            : prev,
        );
        setDraft("");
        const r = await vibeRequest<{ message?: MessageRow }>(url, {
          json: body,
          failure: "Couldn't send your message.",
          quiet: true,
        });
        if (!r.ok) {
          toastSendFailure(r);
          setMessages((prev) => (prev ? prev.filter((m) => m.id !== tempId) : prev));
          setDraft(text);
          // The room stopped taking the viewer's posts after it was opened
          // (no longer an officer, or the event chat closed): the quiet
          // line replaces the composer, as on the next open.
          if (r.code === "board_officers_only" || r.code === "room_closed") setCanPost(false);
          return;
        }
        row = r.data.message;
        const sent = row;
        // Replace the temp row with the server row.
        setMessages((prev) =>
          prev && sent ? prev.map((m) => (m.id === tempId ? sent : m)) : prev,
        );
      }
      // Sent. A reply target picked while it was sending stays.
      setReplyTo((cur) => (cur === reply ? null : cur));
      pinnedToBottomRef.current = true;
      if (!row || messages === null) reload();
      // A reply accepts a request on the server (messages route), so the
      // bar goes and the thread moves from Requests to All.
      if (isRequest) {
        setRequestState("accepted");
        onThreadsChanged?.();
      }
      // A DM went out: offer "Know when they reply" (once per device,
      // PushAsk's call).
      if (isDm) setShowPushAsk(true);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [
    draft,
    staged,
    sending,
    replyTo,
    threadId,
    meId,
    messages,
    reload,
    isRequest,
    isDm,
    onThreadsChanged,
  ]);

  // Accept / Decline a message request. The bar stays until the server
  // agrees, so a refusal has nothing to roll back: the toast says why and
  // the buttons come back.
  const acceptRequest = useCallback(async () => {
    if (reqBusy) return;
    setReqBusy(true);
    const r = await vibeRequest(`/api/me/threads/${encodeURIComponent(threadId)}/accept`, {
      method: "POST",
      failure: "Couldn't accept this request.",
    });
    setReqBusy(false);
    if (!r.ok) return;
    setRequestState("accepted");
    onThreadsChanged?.();
  }, [reqBusy, threadId, onThreadsChanged]);

  const declineRequest = useCallback(async () => {
    if (reqBusy) return;
    // Asked first: the two buttons sit side by side on a phone, and a
    // decline can't be undone. The sender is never told.
    if (
      typeof window !== "undefined" &&
      !window.confirm("Decline this request? It'll be removed from your inbox.")
    )
      return;
    setReqBusy(true);
    const r = await vibeRequest(`/api/me/threads/${encodeURIComponent(threadId)}/decline`, {
      method: "POST",
      failure: "Couldn't decline this request.",
    });
    setReqBusy(false);
    if (!r.ok) return;
    setRequestState("declined");
    // Closing refetches the thread list (MessagesMobile's onClose), which
    // takes the request out of the Requests tab.
    onClose();
  }, [reqBusy, threadId, onClose]);

  const startReply = useCallback(
    (m: MessageRow) => {
      const mine = !!meId && m.user_id === meId;
      setReplyTo({
        parent: {
          id: m.id,
          content: m.content?.trim() ? m.content : null,
          user_id: m.user_id,
          author: m.users ?? null,
          media_kind: m.media_kind ?? null,
          attachment_kind: m.attachment_kind ?? null,
        },
        authorName: mine ? "yourself" : m.users?.name || m.users?.handle || "Member",
      });
      inputRef.current?.focus();
    },
    [meId],
  );

  // Photos and videos attach in DMs and groups only: the upload route
  // checks channel_members, which org channels don't have, so it 403s there.
  // Never in a club's room, whatever its type says (club chat v1).
  const canAttach = (thread?.type === "dm" || thread?.type === "group") && !roomKind;

  // A picked photo or video, checked against the upload route's rules
  // before anything is sent. A new pick replaces the staged one.
  const chooseMedia = useCallback((file: File | undefined) => {
    if (!file) return;
    const contentType = file.type.split(";")[0].trim().toLowerCase();
    const kind = ATTACH_IMAGE_TYPES.has(contentType)
      ? "image"
      : ATTACH_VIDEO_TYPES.has(contentType)
        ? "video"
        : null;
    if (!kind) {
      toast({
        message: "Photos can be JPG, PNG, WebP or GIF, and videos MP4, MOV or WebM.",
        tone: "error",
      });
      return;
    }
    if (file.size > (kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
      toast({
        message: kind === "image" ? "That photo is over 15 MB." : "That video is over 200 MB.",
        tone: "error",
      });
      return;
    }
    setStaged({ file, kind, contentType, previewUrl: URL.createObjectURL(file) });
  }, []);

  // The staged preview is a blob: URL. Free it once the file is sent,
  // removed or replaced, and when the conversation closes.
  useEffect(() => {
    if (!staged) return;
    const url = staged.previewUrl;
    return () => URL.revokeObjectURL(url);
  }, [staged]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      // Find current state to know if we're adding or removing.
      let willAdd = true;
      setMessages((prev) => {
        if (!prev) return prev;
        return prev.map((m) => {
          if (m.id !== messageId) return m;
          const existing = m.reactions ?? [];
          const found = existing.find((r) => r.emoji === emoji);
          willAdd = !found?.viewer_reacted;
          if (found) {
            const nextCount = willAdd ? found.count + 1 : found.count - 1;
            const next = existing
              .map((r) =>
                r.emoji === emoji
                  ? { ...r, count: nextCount, viewer_reacted: willAdd }
                  : r,
              )
              .filter((r) => r.count > 0);
            return { ...m, reactions: next };
          }
          return {
            ...m,
            reactions: [
              ...existing,
              { emoji, count: 1, viewer_reacted: true },
            ],
          };
        });
      });
      try {
        await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/react`,
          {
            method: willAdd ? "POST" : "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ emoji }),
          },
        );
      } catch {
        // Roll back the optimistic update on failure.
        setMessages((prev) => {
          if (!prev) return prev;
          return prev.map((m) => {
            if (m.id !== messageId) return m;
            const existing = m.reactions ?? [];
            const found = existing.find((r) => r.emoji === emoji);
            if (!found) return m;
            const rolledCount = willAdd ? found.count - 1 : found.count + 1;
            const next = existing
              .map((r) =>
                r.emoji === emoji
                  ? { ...r, count: rolledCount, viewer_reacted: !willAdd }
                  : r,
              )
              .filter((r) => r.count > 0);
            return { ...m, reactions: next };
          });
        });
      }
    },
    [threadId],
  );

  const peer = thread?.peer;
  const title = thread ? threadTitle(thread) : "Conversation";
  const avatar = thread ? threadAvatar(thread) : { url: null, initials: "?" };
  // A stub (a message hidden by a block, wave-2 contract 8.1) leaves the
  // array before grouping, never inside MessageBubble (12.1): a stub between
  // two rows by one person would split their run.
  const shown = (messages ?? []).filter((m) => !m.hidden);

  // handleOnly: vaul lets a side drawer drag from anywhere, so a
  // sideways drift while scrolling slid the chat or closed it. No
  // Drawer.Handle is rendered, so nothing drags it now; Back closes it
  // through onClose, here and in CampusMobile's org channels.
  // On iPhone it also keeps vaul's scroll lock on while the chat is
  // open (the lock used to lift for every touch, since each touch
  // started a drag). The lock blocks a finger scroll inside the
  // composer, a list scroll that starts on the list's padding, and a
  // pinch while the list sits at its top or bottom edge. Org channels
  // already had this: their channel drawer stays open underneath and
  // holds the lock. repositionInputs={false} would lift it, but would
  // also stop vaul keeping the chat above the keyboard.
  return (
    <Drawer.Root
      open
      direction="right"
      handleOnly
      onOpenChange={(o) => { if (!o) onClose(); }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={{ ...vaulOverlayStyle, zIndex: 1099 }} />
        <Drawer.Content
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            // backdropCss carries the org's chosen gradient (set by
            // CampusMobile when opening an org channel). For DMs/groups
            // it stays null → the page colour (cream; Night's near-black).
            background: backdropCss ?? "var(--cream)",
            color: backdropCss ? "#fff" : undefined,
            display: "flex",
            flexDirection: "column",
            zIndex: 1100,
            outline: "none",
          }}
          aria-describedby={undefined}
        >
          <Drawer.Title style={visuallyHiddenStyle}>{title}</Drawer.Title>
          {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding:
            "calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px",
          background: onDark
            ? "rgba(14, 11, 22, 0.62)"
            : "rgba(250, 247, 242, 0.92)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          borderBottom: onDark
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(28,28,30,0.06)",
          flexShrink: 0,
          // A resting finger starts no text selection, and a held
          // profile link opens no iOS preview.
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            border: "none",
            background: "transparent",
            color: onDark ? "#fff" : "#1C1C1E",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path
              d="M14 4L7 11l7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: avatar.url ? `url(${avatar.url}) center/cover` : "#FFD3C2",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1C1C1E",
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 13,
            border: "1px solid rgba(255,255,255,0.6)",
            flexShrink: 0,
          }}
        >
          {!avatar.url ? avatar.initials : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {peer?.handle ? (
            <Link
              href={`/profile/${peer.handle}`}
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 16,
                fontWeight: 800,
                color: onDark ? "#fff" : "#1C1C1E",
                textDecoration: "none",
                display: "block",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </Link>
          ) : (
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 16,
                fontWeight: 800,
                color: onDark ? "#fff" : "#1C1C1E",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </span>
          )}
          {peer?.handle ? (
            <span
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 11.5,
                color: onDark ? "rgba(255,255,255,0.6)" : "#8A8580",
                fontWeight: 600,
                display: "block",
              }}
            >
              @{peer.handle}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="More actions"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: onDark
              ? "1px solid rgba(255,255,255,0.14)"
              : "1px solid rgba(28,28,30,0.10)",
            background: onDark
              ? "rgba(20,16,28,0.55)"
              : "rgba(255,255,255,0.78)",
            color: onDark ? "#fff" : "#1C1C1E",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            WebkitTapHighlightColor: "transparent",
            flexShrink: 0,
            boxShadow: onDark
              ? "inset 0 1px 0 rgba(255,255,255,0.08)"
              : "inset 0 1px 0 rgba(255,255,255,0.7)",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <circle cx="4.5" cy="10" r="1.8" />
            <circle cx="10" cy="10" r="1.8" />
            <circle cx="15.5" cy="10" r="1.8" />
          </svg>
        </button>
      </header>

      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          listScrolledAtRef.current = performance.now();
          // Within ~80px of the bottom counts as reading the latest.
          const el = e.currentTarget;
          pinnedToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 14px 8px",
          WebkitOverflowScrolling: "touch",
          // No double-tap zoom; pan and pinch are left to the browser.
          // It has to sit on the scroller itself: a scroll container
          // resets touch-action, so nothing set higher up reaches in
          // here. On iPhone, vaul's scroll lock can still cancel a pinch
          // at the list's top or bottom edge (see handleOnly above).
          touchAction: "manipulation",
          // Pulling past the top or bottom doesn't bounce the page behind.
          overscrollBehavior: "contain",
          // No text selection or iOS callout from a resting finger. The
          // composer's textarea is outside this list, so typing and
          // pasting are untouched.
          WebkitUserSelect: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        {messages === null ? (
          loadErr ? (
            <LoadFailed
              failure={loadErr}
              onRetry={reload}
              tone={onDark ? "dark" : "light"}
            />
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: onDark ? "rgba(255,255,255,0.6)" : "#8A8580",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
              }}
            >
              Loading messages…
            </div>
          )
        ) : messages.length === 0 ? (
          <div
            style={{
              padding: "48px 18px",
              textAlign: "center",
              color: onDark ? "rgba(255,255,255,0.7)" : "#5C5853",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            Say hi to {peer?.name || title}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {shown.map((m, i) => {
              const isMine = m.user_id === meId;
              const prev = shown[i - 1];
              const showGap = !prev || prev.user_id !== m.user_id;
              // For multi-party threads (groups + org channels), show the
              // sender's avatar + name at the start of each run of their
              // messages — Discord/iMessage-group style. DMs already have a
              // single peer in the header so they skip this row.
              const isMultiParty = thread?.type !== "dm";
              const showSender = isMultiParty && !isMine && showGap;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMine={isMine}
                  topGap={showGap ? 8 : 0}
                  showSender={showSender}
                  groupMode={isMultiParty}
                  darkMode={onDark}
                  onToggleReaction={(emoji) => void toggleReaction(m.id, emoji)}
                  onMediaLoad={keepPinnedToBottom}
                  listScrolledAtRef={listScrolledAtRef}
                  parentIsMine={!!meId && m.parent_preview?.user_id === meId}
                  // No composer to reply in when the viewer can't post here.
                  onReply={canPost ? () => startReply(m) : undefined}
                  // Never on their own message, and never before the thread
                  // has told us who they are.
                  onReport={
                    meId && m.user_id !== meId
                      ? () =>
                          setReportMessage({
                            type: "message",
                            id: m.id,
                            authorId: m.users?.id ?? m.user_id,
                            authorName:
                              m.users?.name ||
                              (m.users?.handle ? `@${m.users.handle}` : null),
                            noun: "message",
                          })
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Message request: desktop's bar, above the composer. Replying
          accepts it too. */}
      {isRequest && thread ? (
        <div
          style={{
            flexShrink: 0,
            padding: "12px 16px",
            background: "rgba(255,92,53,0.06)",
            borderTop: "1px solid var(--hairline)",
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              lineHeight: 1.45,
              color: "var(--ink-2)",
              textAlign: "center",
            }}
          >
            {`${threadTitle(thread)} sent you a message request. You haven't connected yet — accept or decline.`}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void acceptRequest()}
              disabled={reqBusy}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 999,
                border: "none",
                background: "#FF5C35",
                color: "#fff",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 14,
                fontWeight: 700,
                cursor: reqBusy ? "default" : "pointer",
                opacity: reqBusy ? 0.6 : 1,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => void declineRequest()}
              disabled={reqBusy}
              style={{
                flex: 1,
                height: 40,
                borderRadius: 999,
                border: "1px solid rgba(var(--scrim-rgb),0.14)",
                background: "transparent",
                color: "var(--charcoal)",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 14,
                fontWeight: 700,
                cursor: reqBusy ? "default" : "pointer",
                opacity: reqBusy ? 0.6 : 1,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              Decline
            </button>
          </div>
        </div>
      ) : null}

      {/* After a DM sends: the "Know when they reply" push ask, above the
          composer. PushAsk renders nothing unless it applies (and only
          once per device); the wrapper keeps it from shrinking. */}
      {showPushAsk && isDm ? (
        <div style={{ flexShrink: 0 }}>
          <PushAsk placement="dm" />
        </div>
      ) : null}

      {/* Reply pill and staged photo/video, on the composer's surface
          (desktop's reply pill and compStaged). */}
      {(replyTo || staged) && canPost ? (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "8px 12px 0",
            background: onDark
              ? "rgba(14, 11, 22, 0.72)"
              : "rgba(250, 247, 242, 0.96)",
            borderTop: onDark
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid rgba(28,28,30,0.08)",
            backdropFilter: onDark ? "blur(20px) saturate(160%)" : undefined,
            WebkitBackdropFilter: onDark ? "blur(20px) saturate(160%)" : undefined,
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          {replyTo ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "2px 0 2px 10px",
                  borderLeft: "3px solid #FF5C35",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: onDark ? "rgba(255,180,150,0.95)" : "#FF5C35",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Replying to {replyTo.authorName}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: onDark ? "rgba(255,255,255,0.7)" : "#5C5853",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {quotedBody(replyTo.parent)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "none",
                  background: onDark ? "rgba(255,255,255,0.10)" : "rgba(28,28,30,0.06)",
                  color: onDark ? "#fff" : "#1C1C1E",
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: "pointer",
                  flexShrink: 0,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                ×
              </button>
            </div>
          ) : null}
          {staged ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  overflow: "hidden",
                  flexShrink: 0,
                  background: staged.kind === "video" ? "#000" : "rgba(var(--scrim-rgb),0.06)",
                }}
              >
                {staged.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={staged.previewUrl}
                    alt=""
                    draggable={false}
                    style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <video
                    src={staged.previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--charcoal)" }}>
                  {staged.kind === "video" ? "Video" : "Photo"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-muted)" }}>
                  {sending
                    ? "Sending…"
                    : `${Math.max(1, Math.round(staged.file.size / 1024)).toLocaleString()} KB`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStaged(null)}
                disabled={sending}
                aria-label="Remove attachment"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "none",
                  background: "rgba(var(--scrim-rgb),0.06)",
                  color: "var(--charcoal)",
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: sending ? "default" : "pointer",
                  opacity: sending ? 0.4 : 1,
                  flexShrink: 0,
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Input bar. Club chat v1: in a room the viewer can't post in (a
          Board for anyone but its officers, an event chat that has closed)
          a quiet line takes its place. Tokens on the page's own paper; over
          a club's wallpaper, the dark glass the composer wears there. Empty
          while it isn't known yet, so no composer flashes in a Board. */}
      {canPost !== true ? (
        <div
          role={canPost === false ? "note" : undefined}
          style={{
            flexShrink: 0,
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 16px calc(env(safe-area-inset-bottom, 0px) + 10px)",
            background: backdropCss ? "rgba(14, 11, 22, 0.72)" : "var(--cream)",
            borderTop: backdropCss
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid var(--hairline)",
            backdropFilter: backdropCss ? "blur(20px) saturate(160%)" : undefined,
            WebkitBackdropFilter: backdropCss ? "blur(20px) saturate(160%)" : undefined,
            color: backdropCss ? "rgba(255,255,255,0.7)" : "var(--ink-2)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13.5,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {canPost === null
            ? null
            : roomKind === "board"
              ? REFUSAL_SENTENCES.board_officers_only
              : REFUSAL_SENTENCES.room_closed}
        </div>
      ) : (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          padding:
            "8px 12px calc(env(safe-area-inset-bottom, 0px) + 10px)",
          background: onDark
            ? "rgba(14, 11, 22, 0.72)"
            : "rgba(250, 247, 242, 0.96)",
          // The reply pill / staged chip above carries the top edge.
          borderTop:
            replyTo || staged
              ? "none"
              : onDark
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid rgba(28,28,30,0.08)",
          backdropFilter: onDark ? "blur(20px) saturate(160%)" : undefined,
          WebkitBackdropFilter: onDark ? "blur(20px) saturate(160%)" : undefined,
        }}
      >
        {canAttach ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ATTACH_ACCEPT}
              style={{ display: "none" }}
              // Reset on every click so iOS fires onChange again when the
              // same file is picked twice (ProfileMobile's fix).
              onClick={(e) => {
                e.currentTarget.value = "";
              }}
              onChange={(e) => chooseMedia(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              aria-label="Attach a photo or video"
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                border: "1px solid rgba(28,28,30,0.10)",
                background: "rgba(255,255,255,0.78)",
                color: "#1C1C1E",
                cursor: sending ? "default" : "pointer",
                opacity: sending ? 0.5 : 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <rect
                  x="2.5"
                  y="4"
                  width="15"
                  height="12"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="7.25" cy="8.25" r="1.5" fill="currentColor" />
                <path
                  d="M3 14.5l4.25-4 3.25 3 2.5-2.25L17 14.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </>
        ) : null}
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={`Message${thread?.type === "org" ? " " + (thread?.name ?? "") : "…"}`}
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            minHeight: 38,
            maxHeight: 120,
            // 1px less than before, so the 16px text keeps the bar the
            // same height (about 42px on one line).
            padding: "9px 14px",
            borderRadius: 18,
            border: onDark
              ? "1px solid rgba(255,255,255,0.12)"
              : "1px solid rgba(28,28,30,0.10)",
            background: onDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(255,255,255,0.92)",
            fontFamily: "DM Sans, sans-serif",
            // At least 16px: iOS Safari zooms the page into any field
            // under 16px when it's focused, and never zooms back out.
            fontSize: 16,
            color: onDark ? "#fff" : "#1C1C1E",
            outline: "none",
            lineHeight: 1.4,
          }}
        />
        <button
          type="submit"
          // Same test as send(): text, or a staged photo/video.
          disabled={(!draft.trim() && !staged) || sending}
          aria-label="Send"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: "none",
            background:
              (!draft.trim() && !staged) || sending ? "rgba(var(--scrim-rgb),0.18)" : "#FF5C35",
            color: "#fff",
            cursor: (!draft.trim() && !staged) || sending ? "default" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "background 120ms ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path
              d="M3 11L19 4l-7 16-2-7-7-2z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </button>
      </form>
      )}

      {/* Action sheet — pinned/muted toggles, view profile, clear,
          block, leave group, delete. Mirrors the desktop kebab menu. */}
      {menuOpen ? (
        <ConversationActionSheet
          threadId={threadId}
          thread={thread}
          // Campus > Chat hands over a club room as type "org" with no
          // room_kind; the inbox sends "org_channel". Neither is a dm or group.
          clubRoom={!!roomKind || (!!thread && thread.type !== "dm" && thread.type !== "group")}
          pinned={!!pinnedAt}
          muted={!!mutedUntil && new Date(mutedUntil) > new Date()}
          feedback={actionFeedback}
          onFeedback={setActionFeedback}
          onPinned={(at) => setPinnedAt(at)}
          onMuted={(until) => setMutedUntil(until)}
          onClose={() => setMenuOpen(false)}
          onOpenGroupSettings={() => {
            setMenuOpen(false);
            setGroupSettingsOpen(true);
          }}
          onCleared={() => {
            setMessages([]);
            setMenuOpen(false);
          }}
          onLeftOrDeleted={() => {
            setMenuOpen(false);
            onClose();
          }}
        />
      ) : null}

      {/* One reported message. `nested` is about the drawer this sits INSIDE,
          not the long-press picker it opens from: that picker is a plain
          positioned element, but the conversation itself is a vaul drawer
          (Drawer.Root above), and a plain root closing inside it runs vaul's
          unlock and restores the body styles the conversation still needs —
          the page behind becomes scrollable and the thread can jump its
          scroll position. Same shape as PostViewerMobile's sheet inside its
          own full-screen drawer. */}
      {reportMessage ? (
        <ReportSheet
          variant="sheet"
          nested
          target={reportMessage}
          onClose={() => setReportMessage(null)}
        />
      ) : null}

      {/* Group settings — photo, name, members list, add/remove,
          per-member mute, leave. Admin-only affordances gated by
          thread.viewer_role. */}
      {groupSettingsOpen && thread ? (
        <GroupSettingsView
          threadId={threadId}
          thread={thread}
          onClose={() => setGroupSettingsOpen(false)}
          onLeft={() => {
            setGroupSettingsOpen(false);
            onClose();
          }}
        />
      ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
