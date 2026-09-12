"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { vibeRequest } from "@/lib/feedback/request";
import { toast } from "@/lib/feedback/toast";

/**
 * iOS-native /messages rebuild for mobile. Two screens, one component:
 *
 *   1. Thread list — All / Requests tabs, each row shows avatar +
 *      title + last-message preview + relative time + unread dot.
 *   2. Conversation view — full-screen sheet that slides over the list
 *      when a thread is tapped. Top bar with back chevron and peer
 *      identity, message bubbles (mine right/coral, theirs left/cream),
 *      sticky input bar at the bottom.
 *
 * The bottom tab bar is hidden while a conversation is open so the
 * input bar doesn't fight for space (matches Instagram / iMessage).
 *
 * Data:
 *   - GET /api/me/threads → { threads, requests }
 *   - GET /api/me/threads/[id]/messages → { messages }
 *   - POST /api/me/threads/[id]/messages → { ok, message }
 *   - POST /api/me/threads/[id]/read → mark as read on entry
 *   - POST /api/me/threads → resolve ?to=<handle> to a DM channel
 */

// ---------- Types ----------

type ThreadType = "dm" | "group" | "org";

type ThreadPeer = {
  id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  school: string | null;
};

type ThreadMember = {
  id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
};

type ThreadEntry = {
  id: string;
  type: ThreadType;
  name: string;
  photo_url: string | null;
  peer: ThreadPeer | null;
  /** media_kind / attachment_kind let a photo-only message preview as
   *  "Photo". Optional: older servers send only the first three. */
  last_message: {
    content: string;
    created_at: string;
    user_id: string;
    media_kind?: "image" | "video" | null;
    attachment_kind?: "post" | "clip" | null;
  } | null;
  /** Server-computed: the last message is someone else's and newer than
   *  the viewer's last_read_at. The API never sends last_read_at, so this
   *  flag is the only source for the unread dot and the badge. Optional
   *  because CampusMobile's synthesized org-channel entries omit it. */
  unread?: boolean;
  accepted_at: string | null;
  /** Server-computed: the viewer hasn't accepted this thread yet. Optional
   *  because CampusMobile's org-channel entries omit it (never a request). */
  is_request?: boolean;
  pinned_at?: string | null;
  hidden_at?: string | null;
  muted_until?: string | null;
  members?: ThreadMember[];
  viewer_role?: "admin" | "member";
};

type MessageReaction = {
  emoji: string;
  count: number;
  viewer_reacted: boolean;
};

/** A shared post/clip as joined by the messages API. Its media URLs are
 *  opaque src values — use them as-is, never parse them. */
type MessageAttachment = {
  id: string;
  type: "post" | "clip";
  content: string | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  user_id: string;
  author: {
    id: string;
    handle: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
};

/** The message a reply quotes, as the messages API embeds it. The two
 *  kinds let a stub for a photo or shared-post parent say so; older
 *  servers omit them. */
type ParentPreview = {
  id: string;
  content: string | null;
  user_id: string;
  author: {
    id: string;
    handle: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
  media_kind?: "image" | "video" | null;
  attachment_kind?: "post" | "clip" | null;
};

type MessageRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  users?: {
    id: string;
    handle: string | null;
    name: string | null;
    avatar_url: string | null;
  } | null;
  /** Inline photo/video. media_url is an opaque same-origin src (the
   *  server redirects it to storage) — never parse it. */
  media_url?: string | null;
  media_kind?: "image" | "video" | null;
  /** Shared post/clip. `attachment` is null when the post isn't visible to
   *  the viewer, or was deleted — then attachment_id is nulled too (FK is
   *  ON DELETE SET NULL) and only attachment_kind remains. */
  attachment_id?: string | null;
  attachment_kind?: "post" | "clip" | null;
  attachment?: MessageAttachment | null;
  parent_message_id?: string | null;
  /** Set on a reply; null when the parent was deleted (FK is ON DELETE
   *  SET NULL, so the stub quietly goes away). */
  parent_preview?: ParentPreview | null;
  reactions?: MessageReaction[];
};

const REACTION_EMOJIS = ["❤️", "👍", "👎", "😂", "🔥", "😮", "😢"] as const;

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

type Tab = "all" | "requests";

// ---------- Vaul shared styles ----------
// Inline styles for the bottom-sheet primitives so every sheet in this
// file gets the same iOS-native look (cream surface, rounded top,
// safe-area-aware bottom, drag handle). vaul owns the open/close
// animation, drag-to-dismiss, focus trap, and scroll lock.

const vaulOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.42)",
  zIndex: 1200,
};

const vaulContentStyle: React.CSSProperties = {
  position: "fixed",
  bottom: 0,
  left: 0,
  right: 0,
  background: "#FAF7F2",
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  paddingBottom: "env(safe-area-inset-bottom, 0px)",
  boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
  zIndex: 1201,
  outline: "none",
};

const vaulHandleStyle: React.CSSProperties = {
  margin: "10px auto 4px",
  width: 38,
  height: 4,
  borderRadius: 999,
  background: "rgba(28,28,30,0.18)",
};

// Screen-reader-only — used to satisfy vaul's a11y requirement on
// Drawer.Title without showing a visible header.
const visuallyHiddenStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

// ---------- Helpers ----------

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = (Date.now() - then) / 1000;
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function initialsOf(s: string | null | undefined): string {
  if (!s) return "?";
  return s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function threadTitle(t: ThreadEntry): string {
  if (t.type === "dm") return t.peer?.name || (t.peer?.handle ? `@${t.peer.handle}` : "Direct message");
  return t.name || "Group";
}

function threadAvatar(t: ThreadEntry): { url: string | null; initials: string } {
  if (t.type === "dm") {
    return {
      url: t.peer?.avatar_url ?? null,
      initials: initialsOf(t.peer?.name || t.peer?.handle),
    };
  }
  return {
    url: t.photo_url ?? null,
    initials: initialsOf(t.name),
  };
}

/** The one line a quote stub or the reply pill shows: the quoted text,
 *  else what the message carried. */
function quotedBody(p: ParentPreview): string {
  return (
    p.content?.trim() ||
    (p.media_kind === "video"
      ? "Video"
      : p.media_kind === "image"
        ? "Photo"
        : p.attachment_kind === "clip"
          ? "Shared clip"
          : p.attachment_kind === "post"
            ? "Shared post"
            : "Attachment")
  );
}

// ---------- Component ----------

export function MessagesMobile({
  initialHandle,
  initialChannelId,
}: {
  initialHandle?: string;
  initialChannelId?: string;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [threads, setThreads] = useState<ThreadEntry[] | null>(null);
  const [requests, setRequests] = useState<ThreadEntry[] | null>(null);
  // The first list load's failure, shown in the list's place. A refetch
  // that fails keeps the rows already on screen instead.
  const [listErr, setListErr] = useState<LoadFailure | null>(null);
  const listLoadedRef = useRef(false);
  const listSeqRef = useRef(0);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const initialHandleResolvedRef = useRef(false);

  /** Resolve a handle → DM channel id, creating the thread if needed. */
  const openOrCreateDmFromHandle = useCallback(
    async (handle: string) => {
      const lower = handle.toLowerCase();
      // Cheap path: already have a thread with this peer.
      const existing = (threads ?? []).find(
        (t) => t.type === "dm" && t.peer?.handle?.toLowerCase() === lower,
      );
      if (existing) {
        setComposeOpen(false);
        setOpenThreadId(existing.id);
        return;
      }
      const r = await vibeRequest<{ channel_id?: string }>("/api/me/threads", {
        json: { handle: lower },
        failure: "Couldn't start that conversation.",
      });
      // A refusal has toasted why; compose stays open for another pick.
      if (!r.ok) return;
      const channelId = r.data.channel_id;
      if (typeof channelId !== "string" || !channelId) {
        toast({ message: "Couldn't start that conversation. Try again.", tone: "error" });
        return;
      }
      await refetchThreadsRef.current?.();
      setComposeOpen(false);
      setOpenThreadId(channelId);
    },
    [threads],
  );

  // Stable handle to the refetcher so callbacks can refresh without a
  // dep-chain rewrite. Filled in below once `refetchThreads` exists.
  const refetchThreadsRef = useRef<
    ((mode?: "first" | "refresh") => Promise<void>) | null
  >(null);

  // "first" is the page's own load and its Retry: a failure shows in the
  // list's place, with no toast. "refresh" follows something the student
  // did (closing a thread, accepting a request): a failure keeps both
  // lists on screen and toasts. Until one load has worked there are no
  // rows to keep, so every failure is a first-load failure.
  const refetchThreads = useCallback(
    async (mode: "first" | "refresh" = "refresh") => {
      const seq = ++listSeqRef.current;
      const r = await vibeRequest<{ threads?: ThreadEntry[]; requests?: ThreadEntry[] }>(
        "/api/me/threads",
        {
          cache: "no-store",
          quiet: mode === "first" || !listLoadedRef.current,
          failure: "Couldn't load your messages.",
        },
      );
      // A newer load has started; its answer is the one to paint.
      if (seq !== listSeqRef.current) return;
      if (r.ok && Array.isArray(r.data.threads) && Array.isArray(r.data.requests)) {
        listLoadedRef.current = true;
        setListErr(null);
        setThreads(r.data.threads);
        setRequests(r.data.requests);
        return;
      }
      if (!listLoadedRef.current) {
        setListErr(asLoadFailure(r, "Couldn't load your messages."));
      } else if (r.ok && mode === "refresh") {
        // A 2xx without the lists: vibeRequest didn't toast that one.
        toast({ message: "Couldn't load your messages. Try again.", tone: "error" });
      }
    },
    [],
  );

  useEffect(() => {
    refetchThreadsRef.current = refetchThreads;
    void refetchThreads("first");
  }, [refetchThreads]);

  // ?channel=<id> deep link — opens the conversation view on that
  // thread immediately. The ConversationView handles its own message
  // fetch via /api/me/threads/[id]/messages which works for org
  // channels via the can_view_org_channel RPC even if the thread
  // isn't in the user's threads list yet.
  const initialChannelResolvedRef = useRef(false);
  useEffect(() => {
    if (!initialChannelId) return;
    if (initialChannelResolvedRef.current) return;
    initialChannelResolvedRef.current = true;
    setOpenThreadId(initialChannelId);
  }, [initialChannelId]);

  // ?to=<handle> deep link — resolve to a channel id once the first list
  // load has settled, then open that conversation. Handles both existing
  // threads (peer.handle matches) and brand-new ones (POST to
  // /api/me/threads). A failed first load still resolves it through the
  // POST, which finds an existing DM too, so the link never waits on a
  // Retry; the ref keeps a later successful load from posting again.
  useEffect(() => {
    if (!initialHandle) return;
    if (threads === null && !listErr) return; // wait for the first load to settle
    if (initialHandleResolvedRef.current) return;
    initialHandleResolvedRef.current = true;
    const lower = initialHandle.toLowerCase();
    const existing = (threads ?? []).find(
      (t) => t.type === "dm" && t.peer?.handle?.toLowerCase() === lower,
    );
    if (existing) {
      setOpenThreadId(existing.id);
      return;
    }
    // Create / resolve the DM channel server-side. A refusal toasts why
    // and the student lands on the thread list.
    (async () => {
      const r = await vibeRequest<{ channel_id?: string }>("/api/me/threads", {
        json: { handle: lower },
        failure: "Couldn't open that conversation.",
      });
      if (!r.ok) return;
      const channelId = r.data.channel_id;
      if (typeof channelId !== "string" || !channelId) {
        toast({ message: "Couldn't open that conversation. Try again.", tone: "error" });
        return;
      }
      await refetchThreads();
      setOpenThreadId(channelId);
    })();
  }, [initialHandle, threads, listErr, refetchThreads]);

  const visibleThreads = useMemo(() => {
    if (tab === "requests") return requests ?? [];
    return threads ?? [];
  }, [tab, threads, requests]);

  // Threads with an unread message — the server's flag, because only the
  // server knows the viewer's last_read_at. A muted thread keeps its dot
  // but stays out of the badge: mute promises silence (desktop's copy
  // says so, and the server documents muted_until as badge silence).
  const unreadCount = useMemo(
    () =>
      (threads ?? []).filter(
        (t) =>
          t.unread && !(t.muted_until && new Date(t.muted_until) > new Date()),
      ).length,
    [threads],
  );

  return (
    <main
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(255,222,180,0.30) 0%, rgba(255,222,180,0) 60%), " +
          "linear-gradient(180deg, #FAF7F2 0%, #F4EDE2 100%)",
        minHeight: "100dvh",
      }}
    >
      <header
        style={{
          padding: "calc(env(safe-area-inset-top, 0px) + 14px) 16px 6px",
          background: "rgba(250, 247, 242, 0.86)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          position: "sticky",
          top: 0,
          zIndex: 5,
          borderBottom: "1px solid rgba(28,28,30,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h1
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.8px",
              color: "#1C1C1E",
              margin: 0,
            }}
          >
            Messages
          </h1>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            aria-label="New message"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "1px solid rgba(28,28,30,0.10)",
              background: "rgba(255,255,255,0.78)",
              color: "#1C1C1E",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              WebkitTapHighlightColor: "transparent",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden>
              <path
                d="M14.5 3.5l4 4-10 10H4v-4.5l10.5-9.5z"
                stroke="currentColor"
                strokeWidth="1.6"
                fill="none"
                strokeLinejoin="round"
              />
              <path
                d="M13 5l4 4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 12,
            paddingBottom: 8,
          }}
        >
          <TabPill
            label="All"
            active={tab === "all"}
            onClick={() => setTab("all")}
            badge={unreadCount > 0 ? unreadCount : undefined}
          />
          <TabPill
            label="Requests"
            active={tab === "requests"}
            onClick={() => setTab("requests")}
            badge={requests?.length || undefined}
          />
        </div>
      </header>

      <div style={{ padding: "8px 0 24px" }}>
        {threads === null ? (
          listErr ? (
            <div style={{ padding: "16px 16px 0" }}>
              <LoadFailed
                failure={listErr}
                onRetry={() => {
                  setListErr(null);
                  void refetchThreads("first");
                }}
              />
            </div>
          ) : (
            <ListSkeleton />
          )
        ) : visibleThreads.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {visibleThreads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                onTap={() => setOpenThreadId(t.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {openThreadId ? (
        <ConversationView
          threadId={openThreadId}
          thread={
            threads?.find((t) => t.id === openThreadId) ??
            requests?.find((t) => t.id === openThreadId) ??
            null
          }
          onThreadsChanged={() => void refetchThreads()}
          onClose={() => {
            setOpenThreadId(null);
            void refetchThreads();
          }}
        />
      ) : null}

      {composeOpen ? (
        <ComposeOverlay
          onCancel={() => setComposeOpen(false)}
          onPick={(handle) => void openOrCreateDmFromHandle(handle)}
        />
      ) : null}
    </main>
  );
}

// ---------- Thread list pieces ----------

function TabPill({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 999,
        border: "1px solid rgba(28,28,30,0.10)",
        background: active ? "#1C1C1E" : "rgba(255,255,255,0.7)",
        color: active ? "#fff" : "#5C5853",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
      {badge ? (
        <span
          style={{
            display: "inline-flex",
            minWidth: 18,
            height: 18,
            padding: "0 6px",
            borderRadius: 999,
            background: active ? "rgba(255,255,255,0.18)" : "#FF5C35",
            color: "#fff",
            fontSize: 11,
            fontWeight: 800,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  );
}

function ThreadRow({
  thread,
  onTap,
}: {
  thread: ThreadEntry;
  onTap: () => void;
}) {
  const { url: avatarUrl, initials } = threadAvatar(thread);
  const title = threadTitle(thread);
  // A photo, video or shared post sent without a caption has empty
  // content — say which instead of a blank line. "Attachment" is left for
  // a server that doesn't send the kinds.
  const lm = thread.last_message;
  const preview = !lm
    ? "No messages yet"
    : lm.content?.trim() ||
      (lm.media_kind === "video"
        ? "Video"
        : lm.media_kind === "image"
          ? "Photo"
          : lm.attachment_kind === "clip"
            ? "Shared a clip"
            : lm.attachment_kind === "post"
              ? "Shared a post"
              : "Attachment");
  const when = relativeTime(thread.last_message?.created_at);
  const unread = !!thread.unread;

  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          background: "transparent",
          border: "none",
          borderBottom: "1px solid rgba(28,28,30,0.04)",
          cursor: "pointer",
          textAlign: "left",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 999,
            background: avatarUrl
              ? `url(${avatarUrl}) center/cover`
              : "#FFD3C2",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1C1C1E",
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 17,
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {!avatarUrl ? initials : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 16,
                fontWeight: unread ? 900 : 700,
                color: "#1C1C1E",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {title}
            </span>
            <span
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 11.5,
                color: unread ? "#FF5C35" : "#8A8580",
                fontWeight: unread ? 800 : 600,
                flexShrink: 0,
              }}
            >
              {when}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 2,
            }}
          >
            <span
              style={{
                flex: 1,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                color: unread ? "#1C1C1E" : "#8A8580",
                fontWeight: unread ? 600 : 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {preview}
            </span>
            {unread ? (
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#FF5C35",
                  flexShrink: 0,
                }}
              />
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <li
          key={i}
          style={{
            display: "flex",
            gap: 12,
            padding: "12px 16px",
            borderBottom: "1px solid rgba(28,28,30,0.04)",
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 999,
              background: "rgba(28,28,30,0.06)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: "55%",
                height: 14,
                background: "rgba(28,28,30,0.08)",
                borderRadius: 6,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: "85%",
                height: 11,
                background: "rgba(28,28,30,0.05)",
                borderRadius: 5,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        color: "#5C5853",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          fontFamily: "Fraunces, serif",
          fontSize: 18,
          fontWeight: 800,
          color: "#1C1C1E",
          marginBottom: 6,
        }}
      >
        {tab === "requests" ? "No message requests" : "No conversations yet"}
      </div>
      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.55,
          margin: "0 auto",
          maxWidth: 260,
        }}
      >
        {tab === "requests"
          ? "Requests from people you don't follow yet will show up here."
          : "Search for someone in Network and tap message to start a conversation."}
      </p>
      {tab !== "requests" ? (
        <Link
          href="/network"
          style={{
            display: "inline-block",
            marginTop: 14,
            padding: "9px 18px",
            borderRadius: 999,
            background: "#1C1C1E",
            color: "#fff",
            textDecoration: "none",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          Find people
        </Link>
      ) : null}
    </div>
  );
}

// ---------- Conversation view ----------

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
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  // Why the first load failed, shown in the list's place. Retry bumps
  // loadSeq, which re-runs the load.
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  const [loadSeq, setLoadSeq] = useState(0);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedMedia | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // Where a message request stands once the viewer answers it here, so
  // the bar goes before the thread list re-syncs.
  const [requestState, setRequestState] = useState<"pending" | "accepted" | "declined">(
    "pending",
  );
  const [reqBusy, setReqBusy] = useState(false);
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
  // The messages, their load failure, the reply target, the staged file
  // and the request bar all belong to one thread. If the thread changes
  // under a mounted view, reset them here during render, before anything
  // of the old thread paints (an effect would paint it first).
  const [shownThreadId, setShownThreadId] = useState(threadId);
  if (shownThreadId !== threadId) {
    setShownThreadId(threadId);
    setMessages(null);
    setLoadErr(null);
    setReplyTo(null);
    setStaged(null);
    setRequestState("pending");
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
      const r = await vibeRequest<{ messages?: MessageRow[]; viewer_id?: string }>(
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
        return;
      }
      setLoadErr(asLoadFailure(r, "Couldn't load this conversation."));
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
        });
        if (!sign.ok) return;
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
        });
        if (!r.ok) return;
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
        });
        if (!r.ok) {
          setMessages((prev) => (prev ? prev.filter((m) => m.id !== tempId) : prev));
          setDraft(text);
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
  const canAttach = thread?.type === "dm" || thread?.type === "group";

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
            // it stays null → cream surface, same as before.
            background: backdropCss ?? "#FAF7F2",
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
          background: backdropCss
            ? "rgba(14, 11, 22, 0.62)"
            : "rgba(250, 247, 242, 0.92)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          borderBottom: backdropCss
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
            color: backdropCss ? "#fff" : "#1C1C1E",
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
                color: backdropCss ? "#fff" : "#1C1C1E",
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
                color: backdropCss ? "#fff" : "#1C1C1E",
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
                color: backdropCss ? "rgba(255,255,255,0.6)" : "#8A8580",
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
            border: backdropCss
              ? "1px solid rgba(255,255,255,0.14)"
              : "1px solid rgba(28,28,30,0.10)",
            background: backdropCss
              ? "rgba(20,16,28,0.55)"
              : "rgba(255,255,255,0.78)",
            color: backdropCss ? "#fff" : "#1C1C1E",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            WebkitTapHighlightColor: "transparent",
            flexShrink: 0,
            boxShadow: backdropCss
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
              tone={backdropCss ? "dark" : "light"}
            />
          ) : (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: backdropCss ? "rgba(255,255,255,0.6)" : "#8A8580",
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
              color: backdropCss ? "rgba(255,255,255,0.7)" : "#5C5853",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            Say hi to {peer?.name || title}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {messages.map((m, i) => {
              const isMine = m.user_id === meId;
              const prev = messages[i - 1];
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
                  darkMode={!!backdropCss}
                  onToggleReaction={(emoji) => void toggleReaction(m.id, emoji)}
                  onMediaLoad={keepPinnedToBottom}
                  listScrolledAtRef={listScrolledAtRef}
                  parentIsMine={!!meId && m.parent_preview?.user_id === meId}
                  onReply={() => startReply(m)}
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
            borderTop: "1px solid rgba(28,28,30,0.08)",
            fontFamily: "DM Sans, sans-serif",
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 13,
              lineHeight: 1.45,
              color: "#5C5853",
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
                border: "1px solid rgba(28,28,30,0.14)",
                background: "transparent",
                color: "#1C1C1E",
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

      {/* Reply pill and staged photo/video, on the composer's surface
          (desktop's reply pill and compStaged). */}
      {replyTo || staged ? (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "8px 12px 0",
            background: backdropCss
              ? "rgba(14, 11, 22, 0.72)"
              : "rgba(250, 247, 242, 0.96)",
            borderTop: backdropCss
              ? "1px solid rgba(255,255,255,0.08)"
              : "1px solid rgba(28,28,30,0.08)",
            backdropFilter: backdropCss ? "blur(20px) saturate(160%)" : undefined,
            WebkitBackdropFilter: backdropCss ? "blur(20px) saturate(160%)" : undefined,
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
                    color: backdropCss ? "rgba(255,180,150,0.95)" : "#FF5C35",
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
                    color: backdropCss ? "rgba(255,255,255,0.7)" : "#5C5853",
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
                  background: backdropCss ? "rgba(255,255,255,0.10)" : "rgba(28,28,30,0.06)",
                  color: backdropCss ? "#fff" : "#1C1C1E",
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
                  background: staged.kind === "video" ? "#000" : "rgba(28,28,30,0.06)",
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
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1C1C1E" }}>
                  {staged.kind === "video" ? "Video" : "Photo"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#8A8580" }}>
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
                  background: "rgba(28,28,30,0.06)",
                  color: "#1C1C1E",
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

      {/* Input bar */}
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
          background: backdropCss
            ? "rgba(14, 11, 22, 0.72)"
            : "rgba(250, 247, 242, 0.96)",
          // The reply pill / staged chip above carries the top edge.
          borderTop:
            replyTo || staged
              ? "none"
              : backdropCss
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid rgba(28,28,30,0.08)",
          backdropFilter: backdropCss ? "blur(20px) saturate(160%)" : undefined,
          WebkitBackdropFilter: backdropCss ? "blur(20px) saturate(160%)" : undefined,
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
            border: backdropCss
              ? "1px solid rgba(255,255,255,0.12)"
              : "1px solid rgba(28,28,30,0.10)",
            background: backdropCss
              ? "rgba(255,255,255,0.06)"
              : "rgba(255,255,255,0.92)",
            fontFamily: "DM Sans, sans-serif",
            // At least 16px: iOS Safari zooms the page into any field
            // under 16px when it's focused, and never zooms back out.
            fontSize: 16,
            color: backdropCss ? "#fff" : "#1C1C1E",
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
              (!draft.trim() && !staged) || sending ? "rgba(28,28,30,0.18)" : "#FF5C35",
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

      {/* Action sheet — pinned/muted toggles, view profile, clear,
          block, leave group, delete. Mirrors the desktop kebab menu. */}
      {menuOpen ? (
        <ConversationActionSheet
          threadId={threadId}
          thread={thread}
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

// ---------- Action sheet ----------

function ConversationActionSheet({
  threadId,
  thread,
  pinned,
  muted,
  feedback,
  onFeedback,
  onPinned,
  onMuted,
  onClose,
  onOpenGroupSettings,
  onCleared,
  onLeftOrDeleted,
}: {
  threadId: string;
  thread: ThreadEntry | null;
  pinned: boolean;
  muted: boolean;
  feedback: string | null;
  onFeedback: (msg: string | null) => void;
  onPinned: (pinnedAt: string | null) => void;
  onMuted: (mutedUntil: string | null) => void;
  onClose: () => void;
  onOpenGroupSettings: () => void;
  onCleared: () => void;
  onLeftOrDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);

  const isDm = thread?.type === "dm";
  const isGroup = thread?.type === "group";
  const peer = thread?.peer ?? null;

  const togglePin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const wantPin = !pinned;
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/pin`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: wantPin }),
        },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Pin failed");
      onPinned(wantPin ? new Date().toISOString() : null);
      onFeedback(wantPin ? "Pinned" : "Unpinned");
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Pin failed");
    } finally {
      setBusy(false);
    }
  }, [busy, pinned, threadId, onPinned, onFeedback]);

  const unmute = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/mute`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Unmute failed");
      onMuted(null);
      onFeedback("Unmuted");
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Unmute failed");
    } finally {
      setBusy(false);
    }
  }, [busy, threadId, onMuted, onFeedback]);

  const muteFor = useCallback(
    async (hours: number | null) => {
      if (busy) return;
      setBusy(true);
      setMuteSheetOpen(false);
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/mute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ duration_hours: hours }),
          },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Mute failed");
        onMuted(j.muted_until ?? null);
        onFeedback("Muted");
      } catch (e) {
        onFeedback(e instanceof Error ? e.message : "Mute failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId, onMuted, onFeedback],
  );

  const clearHistory = useCallback(async () => {
    if (busy) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Clear chat history? This only clears your view; the other side keeps their copy.",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/clear`,
        { method: "POST" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Clear failed");
      onCleared();
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  }, [busy, threadId, onCleared, onFeedback]);

  const hideConversation = useCallback(async () => {
    if (busy) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Delete this conversation? It'll hide from your view, but the other side will still see it.",
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/hide`,
        { method: "POST" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Delete failed");
      onLeftOrDeleted();
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }, [busy, threadId, onLeftOrDeleted, onFeedback]);

  const leaveGroup = useCallback(async () => {
    if (busy || !thread) return;
    const groupName = thread.name || "this group";
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Leave ${groupName}? You won't receive new messages.`)
    )
      return;
    // Fetch viewer id from the messages endpoint (the only one that
    // reliably returns it) — cheaper than a profile bootstrap.
    setBusy(true);
    try {
      const meR = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/messages?limit=1`,
        { cache: "no-store" },
      );
      const meJ = await meR.json();
      const viewerId =
        typeof meJ?.viewer_id === "string" ? (meJ.viewer_id as string) : null;
      if (!viewerId) throw new Error("Could not resolve your id");
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(viewerId)}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Leave failed");
      onLeftOrDeleted();
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Leave failed");
    } finally {
      setBusy(false);
    }
  }, [busy, thread, threadId, onLeftOrDeleted, onFeedback]);

  const blockPeer = useCallback(async () => {
    if (busy || !peer?.id) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Block @${peer.handle ?? "user"}? They won't be able to see your profile or message you.`,
      )
    )
      return;
    setBusy(true);
    try {
      const r = await fetch("/api/me/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: peer.id }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Block failed");
      onLeftOrDeleted();
    } catch (e) {
      onFeedback(e instanceof Error ? e.message : "Block failed");
    } finally {
      setBusy(false);
    }
  }, [busy, peer, onLeftOrDeleted, onFeedback]);

  // Auto-clear the feedback toast after a beat so the menu doesn't
  // pile up messages.
  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => onFeedback(null), 1800);
    return () => window.clearTimeout(t);
  }, [feedback, onFeedback]);

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={vaulOverlayStyle} />
        <Drawer.Content style={vaulContentStyle} aria-describedby={undefined}>
          <Drawer.Title style={visuallyHiddenStyle}>Conversation actions</Drawer.Title>
          <Drawer.Handle style={vaulHandleStyle} />
          {feedback ? (
            <div
              style={{
                margin: "6px 16px 8px",
                padding: "8px 12px",
                borderRadius: 12,
                background: "rgba(28,28,30,0.06)",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12.5,
                color: "#1C1C1E",
                textAlign: "center",
              }}
            >
              {feedback}
            </div>
          ) : null}

          <div style={{ padding: "4px 0 14px" }}>
            {isDm && peer?.handle ? (
              <SheetRow
                label="View profile"
                href={`/profile/${peer.handle}`}
                onClose={onClose}
              />
            ) : null}
            {isGroup ? (
              <SheetRow label="Group info" onClick={onOpenGroupSettings} />
            ) : null}
            <SheetRow
              label={pinned ? "Unpin" : "Pin to top"}
              onClick={() => void togglePin()}
              disabled={busy}
            />
            {muted ? (
              <SheetRow
                label="Unmute"
                onClick={() => void unmute()}
                disabled={busy}
              />
            ) : (
              <SheetRow
                label="Mute…"
                onClick={() => setMuteSheetOpen(true)}
                disabled={busy}
              />
            )}
            <SheetRow
              label="Clear chat history"
              onClick={() => void clearHistory()}
              disabled={busy}
            />
            {isGroup ? (
              <SheetRow
                label="Leave group"
                danger
                onClick={() => void leaveGroup()}
                disabled={busy}
              />
            ) : null}
            {isDm && peer ? (
              <SheetRow
                label={`Block @${peer.handle ?? "user"}`}
                danger
                onClick={() => void blockPeer()}
                disabled={busy}
              />
            ) : null}
            <SheetRow
              label="Delete conversation"
              danger
              onClick={() => void hideConversation()}
              disabled={busy}
            />
            <SheetRow label="Cancel" onClick={onClose} bold />
          </div>

          {muteSheetOpen ? (
            <MuteDurationSheet
              onClose={() => setMuteSheetOpen(false)}
              onPick={(h) => void muteFor(h)}
            />
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SheetRow({
  label,
  onClick,
  href,
  onClose,
  danger,
  bold,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  onClose?: () => void;
  danger?: boolean;
  bold?: boolean;
  disabled?: boolean;
}) {
  const inner = (
    <span
      style={{
        display: "block",
        padding: "14px 18px",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 15,
        fontWeight: bold ? 700 : 500,
        color: danger ? "#C0392B" : "#1C1C1E",
        textAlign: "left",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : "pointer",
        borderTop: "1px solid rgba(28,28,30,0.04)",
        textDecoration: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {label}
    </span>
  );
  if (href) {
    return (
      <Link
        href={href}
        onClick={() => onClose?.()}
        style={{ display: "block", color: "inherit" }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        background: "transparent",
        border: "none",
        padding: 0,
        textAlign: "left",
      }}
    >
      {inner}
    </button>
  );
}

function MuteDurationSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (hours: number | null) => void;
}) {
  const options: Array<{ label: string; hours: number | null }> = [
    { label: "For 1 hour", hours: 1 },
    { label: "For 8 hours", hours: 8 },
    { label: "For 24 hours", hours: 24 },
    { label: "For 7 days", hours: 168 },
    { label: "Until I unmute", hours: null },
  ];
  // NestedRoot — scales the parent drawer down behind this one
  // (the iOS-native stacked-sheet feel).
  return (
    <Drawer.NestedRoot open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={vaulOverlayStyle} />
        <Drawer.Content style={vaulContentStyle} aria-describedby={undefined}>
          <Drawer.Title style={visuallyHiddenStyle}>Mute duration</Drawer.Title>
          <Drawer.Handle style={vaulHandleStyle} />
          <div
            style={{
              padding: "10px 18px 6px",
              fontFamily: "Fraunces, serif",
              fontSize: 16,
              fontWeight: 800,
              color: "#1C1C1E",
            }}
          >
            Mute this chat
          </div>
          <div style={{ padding: "0 0 12px" }}>
            {options.map((opt) => (
              <SheetRow
                key={opt.label}
                label={opt.label}
                onClick={() => onPick(opt.hours)}
              />
            ))}
            <SheetRow label="Cancel" onClick={onClose} bold />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.NestedRoot>
  );
}

// ---------- Group settings ----------

function GroupSettingsView({
  threadId,
  thread,
  onClose,
  onLeft,
}: {
  threadId: string;
  thread: ThreadEntry;
  onClose: () => void;
  onLeft: () => void;
}) {
  const [name, setName] = useState(thread.name || "Group");
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(thread.name || "");
  const [members, setMembers] = useState<ThreadMember[]>(
    Array.isArray(thread.members) ? thread.members : [],
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(thread.photo_url);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Per-member mute state — keyed by member id, value is the "until"
  // ISO string returned by POST /members/:id/mute (or null = unmuted).
  // The threads API doesn't surface this yet, so we treat unknown as
  // unmuted and let taps drive the truth.
  const [memberMutes, setMemberMutes] = useState<Record<string, string | null>>({});
  // Which member's action sheet is open (null = none).
  const [memberSheetFor, setMemberSheetFor] = useState<ThreadMember | null>(null);

  const viewerRole = thread.viewer_role ?? "member";
  const isAdmin = viewerRole === "admin";

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(null), 1800);
    return () => window.clearTimeout(t);
  }, [feedback]);

  // Hide the bottom tab bar while group settings is up. Same trick we
  // use everywhere else with full-screen overlays.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, []);

  const saveName = useCallback(async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === name || busy) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmed }),
        },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Rename failed");
      setName(trimmed);
      setEditingName(false);
      setFeedback("Name updated");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }, [draftName, name, busy, threadId]);

  const removeMember = useCallback(
    async (m: ThreadMember) => {
      if (busy) return;
      if (
        typeof window !== "undefined" &&
        !window.confirm(`Remove ${m.name || `@${m.handle ?? "user"}`} from the group?`)
      )
        return;
      setBusy(true);
      // Optimistic remove.
      setMembers((prev) => prev.filter((x) => x.id !== m.id));
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(m.id)}`,
          { method: "DELETE" },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Remove failed");
        setFeedback(`${m.name || "Member"} removed`);
      } catch (e) {
        // Roll back.
        setMembers((prev) =>
          [...prev, m].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
        );
        setFeedback(e instanceof Error ? e.message : "Remove failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId],
  );

  const muteMember = useCallback(
    async (m: ThreadMember, hours: number | null) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(m.id)}/mute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(hours ? { duration_hours: hours } : {}),
          },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Mute failed");
        setMemberMutes((prev) => ({ ...prev, [m.id]: j.until ?? null }));
        setFeedback(`${m.name || "Member"} muted`);
      } catch (e) {
        setFeedback(e instanceof Error ? e.message : "Mute failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId],
  );

  const unmuteMember = useCallback(
    async (m: ThreadMember) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(m.id)}/mute`,
          { method: "DELETE" },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Unmute failed");
        setMemberMutes((prev) => ({ ...prev, [m.id]: null }));
        setFeedback(`${m.name || "Member"} unmuted`);
      } catch (e) {
        setFeedback(e instanceof Error ? e.message : "Unmute failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId],
  );

  const leave = useCallback(async () => {
    if (busy) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Leave ${name}? You won't receive new messages.`)
    )
      return;
    setBusy(true);
    try {
      const meR = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/messages?limit=1`,
        { cache: "no-store" },
      );
      const meJ = await meR.json();
      const viewerId =
        typeof meJ?.viewer_id === "string" ? (meJ.viewer_id as string) : null;
      if (!viewerId) throw new Error("Could not resolve your id");
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(viewerId)}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Leave failed");
      onLeft();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Leave failed");
    } finally {
      setBusy(false);
    }
  }, [busy, name, threadId, onLeft]);

  const addMember = useCallback(
    async (handle: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/members`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle }),
          },
        );
        const j = await r.json();
        if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Add failed");
        if (j.member) {
          setMembers((prev) => [...prev, j.member as ThreadMember]);
        }
        setAddOpen(false);
        setFeedback("Member added");
      } catch (e) {
        setFeedback(e instanceof Error ? e.message : "Add failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, threadId],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Group info"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1250,
        background: "#FAF7F2",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px",
          background: "rgba(250, 247, 242, 0.94)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          borderBottom: "1px solid rgba(28,28,30,0.06)",
          position: "sticky",
          top: 0,
          zIndex: 2,
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
            color: "#1C1C1E",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
            <path d="M14 4L7 11l7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 17,
            fontWeight: 800,
            color: "#1C1C1E",
            flex: 1,
          }}
        >
          Group info
        </span>
      </header>

      {/* Photo + name section */}
      <section
        style={{
          padding: "24px 18px 14px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          borderBottom: "1px solid rgba(28,28,30,0.06)",
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 999,
            background: photoUrl
              ? `url(${photoUrl}) center/cover`
              : "linear-gradient(135deg,#FFD3C2 0%,#FF9D7E 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1C1C1E",
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 28,
            boxShadow: "0 6px 22px rgba(180,120,60,0.18)",
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {!photoUrl ? initialsOf(name) : null}
        </div>
        {editingName && isAdmin ? (
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 320 }}>
            <input
              type="text"
              // 17px on purpose: keep it out of the phone 16px input rule.
              data-keep-font
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              autoFocus
              maxLength={80}
              style={{
                flex: 1,
                padding: "10px 14px",
                borderRadius: 14,
                border: "1px solid rgba(28,28,30,0.10)",
                background: "rgba(255,255,255,0.92)",
                fontFamily: "Fraunces, serif",
                fontSize: 17,
                fontWeight: 800,
                color: "#1C1C1E",
                outline: "none",
                textAlign: "center",
              }}
            />
            <button
              type="button"
              onClick={() => void saveName()}
              disabled={busy}
              style={{
                padding: "10px 16px",
                borderRadius: 999,
                border: "none",
                background: "#FF5C35",
                color: "#fff",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!isAdmin) return;
              setDraftName(name);
              setEditingName(true);
            }}
            disabled={!isAdmin}
            style={{
              background: "transparent",
              border: "none",
              padding: "6px 12px",
              cursor: isAdmin ? "pointer" : "default",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                fontFamily: "Fraunces, serif",
                fontSize: 22,
                fontWeight: 900,
                color: "#1C1C1E",
                letterSpacing: "-0.4px",
              }}
            >
              {name}
            </span>
            {isAdmin ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M9.5 2L12 4.5l-7 7H2.5v-2.5z" stroke="#8A8580" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
              </svg>
            ) : null}
          </button>
        )}
        <span
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            color: "#8A8580",
            fontWeight: 600,
            letterSpacing: "0.02em",
          }}
        >
          {members.length + 1} {members.length + 1 === 1 ? "member" : "members"}
        </span>
      </section>

      {feedback ? (
        <div
          style={{
            margin: "10px 16px 0",
            padding: "8px 12px",
            borderRadius: 12,
            background: "rgba(28,28,30,0.06)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12.5,
            color: "#1C1C1E",
            textAlign: "center",
          }}
        >
          {feedback}
        </div>
      ) : null}

      {/* Members list */}
      <section style={{ padding: "16px 0 8px" }}>
        <div
          style={{
            padding: "0 18px 8px",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#8A8580",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Members</span>
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              style={{
                background: "transparent",
                border: "none",
                color: "#FF5C35",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 12.5,
                fontWeight: 800,
                letterSpacing: "0.02em",
                cursor: "pointer",
                padding: 0,
                textTransform: "none",
              }}
            >
              + Add
            </button>
          ) : null}
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              muted={
                !!memberMutes[m.id] &&
                new Date(memberMutes[m.id] as string) > new Date()
              }
              onOpenActions={() => setMemberSheetFor(m)}
            />
          ))}
        </ul>
      </section>

      {/* Leave group */}
      <section style={{ padding: "8px 0 28px", marginTop: 8 }}>
        <SheetRow label="Leave group" danger onClick={() => void leave()} />
      </section>

      {addOpen ? (
        <ComposeOverlay
          onCancel={() => setAddOpen(false)}
          onPick={(handle) => void addMember(handle)}
        />
      ) : null}

      {memberSheetFor ? (
        <MemberActionSheet
          member={memberSheetFor}
          muted={
            !!memberMutes[memberSheetFor.id] &&
            new Date(memberMutes[memberSheetFor.id] as string) > new Date()
          }
          canRemove={isAdmin && memberSheetFor.role !== "admin"}
          onClose={() => setMemberSheetFor(null)}
          onMute={(hours) => {
            const m = memberSheetFor;
            setMemberSheetFor(null);
            void muteMember(m, hours);
          }}
          onUnmute={() => {
            const m = memberSheetFor;
            setMemberSheetFor(null);
            void unmuteMember(m);
          }}
          onRemove={() => {
            const m = memberSheetFor;
            setMemberSheetFor(null);
            void removeMember(m);
          }}
        />
      ) : null}
    </div>
  );
}

function MemberRow({
  member,
  muted,
  onOpenActions,
}: {
  member: ThreadMember;
  muted: boolean;
  onOpenActions: () => void;
}) {
  const initials = initialsOf(member.name || member.handle);
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 18px",
        borderTop: "1px solid rgba(28,28,30,0.04)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: member.avatar_url
            ? `url(${member.avatar_url}) center/cover`
            : "#FFD3C2",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#1C1C1E",
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 15,
          border: "1px solid rgba(255,255,255,0.6)",
        }}
      >
        {!member.avatar_url ? initials : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {member.handle ? (
          <Link
            href={`/profile/${member.handle}`}
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 15,
              fontWeight: 700,
              color: "#1C1C1E",
              textDecoration: "none",
              display: "block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {member.name || `@${member.handle}`}
          </Link>
        ) : (
          <span
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 15,
              fontWeight: 700,
              color: "#1C1C1E",
            }}
          >
            {member.name || "Member"}
          </span>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 1,
          }}
        >
          <span
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "#8A8580",
              fontWeight: 600,
            }}
          >
            {member.handle ? `@${member.handle}` : ""}
          </span>
          {member.role === "admin" ? (
            <span
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 10,
                fontWeight: 800,
                color: "#FF5C35",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: "rgba(255,92,53,0.10)",
                padding: "2px 6px",
                borderRadius: 999,
              }}
            >
              Admin
            </span>
          ) : null}
          {muted ? (
            <span
              aria-label="Muted"
              title="Muted"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "DM Sans, sans-serif",
                fontSize: 10,
                fontWeight: 800,
                color: "#8A8580",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                background: "rgba(28,28,30,0.08)",
                padding: "2px 6px",
                borderRadius: 999,
              }}
            >
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M3 5h2l3-2v6L5 7H3V5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
                <path d="M2 2l8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Muted
            </span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenActions}
        aria-label="Member actions"
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          border: "1px solid rgba(28,28,30,0.10)",
          background: "rgba(255,255,255,0.78)",
          color: "#1C1C1E",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3.5" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="12.5" cy="8" r="1.4" />
        </svg>
      </button>
    </li>
  );
}

function MemberActionSheet({
  member,
  muted,
  canRemove,
  onClose,
  onMute,
  onUnmute,
  onRemove,
}: {
  member: ThreadMember;
  muted: boolean;
  canRemove: boolean;
  onClose: () => void;
  onMute: (hours: number | null) => void;
  onUnmute: () => void;
  onRemove: () => void;
}) {
  const [muteSheetOpen, setMuteSheetOpen] = useState(false);
  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay style={vaulOverlayStyle} />
        <Drawer.Content style={vaulContentStyle} aria-describedby={undefined}>
          <Drawer.Title style={visuallyHiddenStyle}>
            Actions for {member.name || member.handle || "member"}
          </Drawer.Title>
          <Drawer.Handle style={vaulHandleStyle} />
          <div
            style={{
              padding: "10px 18px 6px",
              fontFamily: "Fraunces, serif",
              fontSize: 16,
              fontWeight: 800,
              color: "#1C1C1E",
            }}
          >
            {member.name || (member.handle ? `@${member.handle}` : "Member")}
          </div>
          <div style={{ padding: "4px 0 14px" }}>
            {member.handle ? (
              <SheetRow
                label="View profile"
                href={`/profile/${member.handle}`}
                onClose={onClose}
              />
            ) : null}
            {muted ? (
              <SheetRow label="Unmute member" onClick={onUnmute} />
            ) : (
              <SheetRow
                label="Mute member…"
                onClick={() => setMuteSheetOpen(true)}
              />
            )}
            {canRemove ? (
              <SheetRow label="Remove from group" danger onClick={onRemove} />
            ) : null}
            <SheetRow label="Cancel" onClick={onClose} bold />
          </div>

          {muteSheetOpen ? (
            <MuteDurationSheet
              onClose={() => setMuteSheetOpen(false)}
              onPick={(h) => onMute(h)}
            />
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// ---------- Compose overlay ----------

type SearchUser = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url?: string | null;
  major?: string | null;
  year?: number | string | null;
};

function ComposeOverlay({
  onCancel,
  onPick,
}: {
  onCancel: () => void;
  onPick: (handle: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [suggested, setSuggested] = useState<SearchUser[] | null>(null);
  const [results, setResults] = useState<SearchUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  // A search that didn't run, shown instead of "No matches". Retry bumps
  // searchSeq, which re-runs the same query.
  const [searchErr, setSearchErr] = useState<LoadFailure | null>(null);
  const [searchSeq, setSearchSeq] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hide the bottom tab bar while compose is open.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, []);

  // Autofocus on mount — keyboard opens immediately. Small delay so
  // iOS Safari honors the focus after the slide-in. The field is 16px,
  // so taking focus no longer zooms the page in.
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  // Debounce typing → search query.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  // Initial picks — same data source as Network's Discover. Lets
  // users start a DM with someone they already know without typing.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me/suggested-connections?limit=20", {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        setSuggested(
          j?.ok && Array.isArray(j.suggestions) ? (j.suggestions as SearchUser[]) : [],
        );
      } catch {
        if (!cancelled) setSuggested([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Search fetch — same endpoint Network uses, debounced.
  useEffect(() => {
    if (!debounced) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const r = await vibeRequest<{ users?: SearchUser[] }>(
        `/api/users/search?q=${encodeURIComponent(debounced)}&limit=20`,
        { cache: "no-store", quiet: true, failure: "Couldn't search people." },
      );
      // A newer query (or Retry) owns the list now.
      if (cancelled) return;
      if (r.ok && Array.isArray(r.data.users)) {
        setSearchErr(null);
        setResults(r.data.users);
      } else {
        setSearchErr(asLoadFailure(r, "Couldn't search people."));
        setResults(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, searchSeq]);

  const list = debounced ? results : suggested;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New message"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "#FAF7F2",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "calc(env(safe-area-inset-top, 0px) + 8px) 14px 8px",
          background: "rgba(250, 247, 242, 0.94)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          borderBottom: "1px solid rgba(28,28,30,0.06)",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            border: "none",
            color: "#1C1C1E",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            fontWeight: 600,
            padding: "8px 4px",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          Cancel
        </button>
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 17,
            fontWeight: 800,
            color: "#1C1C1E",
          }}
        >
          New message
        </span>
        <span style={{ width: 60 }} />
      </header>

      {/* Search field */}
      <div
        style={{
          padding: "12px 16px 8px",
          background: "rgba(250, 247, 242, 0.94)",
          borderBottom: "1px solid rgba(28,28,30,0.04)",
        }}
      >
        <div style={{ position: "relative" }}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 14,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#8A8580",
              display: "inline-flex",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M11 11l3 3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search people"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={{
              width: "100%",
              padding: "11px 14px 11px 38px",
              borderRadius: 14,
              border: "1px solid rgba(28,28,30,0.10)",
              background: "rgba(255,255,255,0.78)",
              fontFamily: "DM Sans, sans-serif",
              // 16px: any smaller and iOS zooms in when the autofocus
              // above lands.
              fontSize: 16,
              color: "#1C1C1E",
              outline: "none",
            }}
          />
        </div>
      </div>

      {/* Results list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "6px 0",
        }}
      >
        {!debounced && suggested === null ? (
          <ListSkeleton />
        ) : debounced && loading ? (
          <ListSkeleton />
        ) : debounced && searchErr ? (
          <div style={{ padding: "12px 16px" }}>
            <LoadFailed
              failure={searchErr}
              compact
              onRetry={() => setSearchSeq((n) => n + 1)}
            />
          </div>
        ) : !list || list.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              color: "#5C5853",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13.5,
            }}
          >
            {debounced
              ? `No matches for "${debounced}"`
              : "Search above to start a new message."}
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
            }}
          >
            {!debounced ? (
              <li
                style={{
                  padding: "6px 18px 8px",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#8A8580",
                }}
              >
                Suggested
              </li>
            ) : null}
            {list.map((u) => (
              <ComposeUserRow
                key={u.id}
                user={u}
                onPick={() => u.handle && onPick(u.handle)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ComposeUserRow({
  user,
  onPick,
}: {
  user: SearchUser;
  onPick: () => void;
}) {
  const initials = initialsOf(user.name || user.handle);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={!user.handle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 16px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: user.handle ? "pointer" : "default",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 999,
            background: user.avatar_url
              ? `url(${user.avatar_url}) center/cover`
              : "#FFD3C2",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1C1C1E",
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 15,
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          {!user.avatar_url ? initials : null}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: 15,
              fontWeight: 700,
              color: "#1C1C1E",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {user.name || (user.handle ? `@${user.handle}` : "Member")}
          </div>
          <div
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              color: "#8A8580",
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {[user.handle ? `@${user.handle}` : null, user.major]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </button>
    </li>
  );
}

function MessageBubble({
  message,
  isMine,
  topGap,
  showSender = false,
  groupMode = false,
  darkMode = false,
  onToggleReaction,
  onMediaLoad,
  listScrolledAtRef,
  parentIsMine = false,
  onReply,
}: {
  message: MessageRow;
  isMine: boolean;
  topGap: number;
  /** Only true on the FIRST message in a sender's run — renders avatar
   *  on the left and name+time above the bubble. Subsequent messages in
   *  the same run reuse the column gutter for alignment. */
  showSender?: boolean;
  /** When the thread is multi-party (group/org), reserve a 36px left
   *  gutter on every non-mine row so bubbles align under the first
   *  message's avatar. No-op for DMs. */
  groupMode?: boolean;
  /** True when the chat backdrop is dark (any org backdrop except
   *  cream) — flips sender name color and bubble style to white-on-glass. */
  darkMode?: boolean;
  /** Long-press a bubble fires the picker; tapping an emoji here calls
   *  this with the chosen emoji. Tapping an existing reaction chip
   *  toggles it via the same handler. */
  onToggleReaction?: (emoji: string) => void;
  /** Fired when a photo/video learns its real size, so the thread can
   *  stay pinned to the bottom. */
  onMediaLoad?: () => void;
  /** When the message list last scrolled (performance.now()). A pending
   *  long-press checks it so a scroll never opens the picker. */
  listScrolledAtRef?: React.RefObject<number>;
  /** The reply's quoted parent is the viewer's own, so its stub reads "You". */
  parentIsMine?: boolean;
  /** "↩ Reply" in the long-press picker. */
  onReply?: () => void;
}) {
  const sender = message.users ?? null;
  const senderName = sender?.name || sender?.handle || "Member";
  const senderInitials =
    (sender?.name || sender?.handle || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const [pickerOpen, setPickerOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  // Flipped by onError: a photo/video (or a shared post's poster) that
  // 404s or whose link expired shows a muted tile / the gradient instead
  // of a broken image.
  const [mediaFailed, setMediaFailed] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

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
    const pressedAt = performance.now();
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    // 500ms, iOS's own long-press. At 360ms a thumb resting on a bubble
    // while reading was enough to open the picker.
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      // The list scrolled after this finger came down, or was still
      // gliding just before it (the touch that stops a flick lands on
      // a bubble too). That's a scroll, not a hold.
      const scrolledAt =
        listScrolledAtRef?.current ?? Number.NEGATIVE_INFINITY;
      if (scrolledAt >= pressedAt - 150) return;
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
  // Cancel the timer if the finger drifts more than ~10px — that's a
  // scroll, not a long-press.
  const onPressMove = (x: number, y: number) => {
    if (!pressStart.current) return;
    const dx = x - pressStart.current.x;
    const dy = y - pressStart.current.y;
    if (dx * dx + dy * dy > 100) clearLongPress();
  };

  // The same long-press gesture on the text bubble, the photo, the
  // shared-post card and the notice tiles, so the reaction picker opens
  // from any of them. Not on the video: its native controls need every
  // touch, and holding the scrubber opened the picker.
  const pressHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      // Only the first finger's primary press arms it. A second finger
      // means a pinch, so it cancels one that's pending.
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
      // Mobile Safari fires contextmenu on long-press by default —
      // we own the gesture, so suppress its native menu.
      e.preventDefault();
    },
    // The click that ends a long-press must not also open the shared
    // post.
    onClickCapture: (e: React.MouseEvent) => {
      if (!longPressFired.current) return;
      longPressFired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  // Bubble palette flips with darkMode AND mine-ness:
  //   - dark + theirs   → translucent dark glass, white text
  //   - dark + mine     → orange-tinted dark glass, white text
  //   - cream + theirs  → white tile, dark text
  //   - cream + mine    → solid accent orange, white text
  const bubbleBg = isMine
    ? darkMode
      ? "linear-gradient(180deg,rgba(255,92,53,0.32) 0%,rgba(255,92,53,0.12) 100%),linear-gradient(180deg,rgba(20,16,28,0.62) 0%,rgba(14,11,22,0.66) 100%)"
      : "#FF5C35"
    : darkMode
      ? "linear-gradient(180deg,rgba(20,16,28,0.62) 0%,rgba(14,11,22,0.66) 100%)"
      : "rgba(255,255,255,0.88)";
  const bubbleColor = isMine || darkMode ? "#fff" : "#1C1C1E";
  const bubbleBorder = darkMode
    ? "1px solid rgba(255,255,255,0.08)"
    : isMine
      ? "none"
      : "1px solid rgba(28,28,30,0.06)";

  // Sender name + handle: flip to white on dark backdrops so they're
  // legible against the gradient wallpaper.
  const senderNameColor = darkMode ? "rgba(255,255,255,0.92)" : "rgba(28,28,30,0.7)";
  const senderHandleColor = darkMode ? "rgba(255,255,255,0.5)" : "rgba(28,28,30,0.42)";
  const bubbleShadow = isMine
    ? darkMode
      ? "0 6px 18px rgba(255,92,53,0.18)"
      : "0 4px 14px rgba(255,92,53,0.22)"
    : darkMode
      ? "0 6px 18px rgba(20,8,40,0.18)"
      : "0 2px 8px rgba(180,120,60,0.06)";
  // Shared-post card text: white on the coral / dark-glass surfaces,
  // charcoal with an accent label on the cream theirs-card (desktop's).
  const onTint = isMine || darkMode;
  const cardMuted = onTint ? "rgba(255,255,255,0.66)" : "#8A8580";

  // Every piece of the message shares this: no iOS callout or
  // selection, and the same press-in scale while the picker is open.
  const pressStyle: React.CSSProperties = {
    cursor: "pointer",
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
    transition: "transform 120ms ease",
    transform: pickerOpen ? "scale(0.97)" : "scale(1)",
  };

  // What the message carries besides text. A media kind with no URL
  // means the server couldn't produce a link — it gets the same
  // "couldn't load" tile as a load error. Never a blank bubble.
  const hasText = !!message.content?.trim();
  const mediaUrl = message.media_url || null;
  const mediaKind: "image" | "video" | null =
    message.media_kind === "video"
      ? "video"
      : message.media_kind === "image" || mediaUrl
        ? "image"
        : null;
  const attachment = message.attachment ?? null;
  const hasCard =
    !!attachment || !!message.attachment_id || !!message.attachment_kind;
  const isEmpty = !hasText && !mediaKind && !hasCard;
  // Desktop's order: a caption sits under a photo/video, but above a
  // shared post ("here's my note → here's the thing").
  const captionAbove = hasCard && !mediaKind;

  const noticeTile = (label: string, wide = false) => (
    <div
      {...pressHandlers}
      style={{
        width: wide ? 260 : undefined,
        maxWidth: "100%",
        padding: wide ? 14 : "10px 14px",
        textAlign: wide ? "center" : undefined,
        borderRadius: 14,
        background: darkMode ? "rgba(20,16,28,0.55)" : "rgba(28,28,30,0.04)",
        border: darkMode
          ? "1px dashed rgba(255,255,255,0.18)"
          : "1px dashed rgba(28,28,30,0.16)",
        color: darkMode ? "rgba(255,255,255,0.62)" : "#8A8580",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 12.5,
        fontWeight: 600,
        ...pressStyle,
      }}
    >
      {label}
    </div>
  );

  const textBubble = hasText ? (
    <div
      {...pressHandlers}
      style={{
        display: "inline-block",
        maxWidth: "100%",
        padding: "8px 14px",
        borderRadius: 18,
        background: bubbleBg,
        color: bubbleColor,
        fontFamily: "DM Sans, sans-serif",
        fontSize: 14.5,
        lineHeight: 1.4,
        fontWeight: 500,
        border: bubbleBorder,
        backdropFilter: darkMode ? "blur(20px) saturate(160%)" : undefined,
        WebkitBackdropFilter: darkMode ? "blur(20px) saturate(160%)" : undefined,
        boxShadow: bubbleShadow,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        ...pressStyle,
      }}
    >
      {message.content}
    </div>
  ) : null;

  // Photo/video, keyed by message id so a refetch never remounts (and
  // re-downloads) it. Max 260×320 with the aspect kept; the photo's min
  // box holds space while it lazy-loads, and object-fit crops panoramas.
  let media: React.ReactNode = null;
  if (mediaKind && (!mediaUrl || mediaFailed)) {
    media = noticeTile(
      mediaKind === "video" ? "Video couldn't load" : "Photo couldn't load",
    );
  } else if (mediaKind === "video" && mediaUrl) {
    // No long-press handlers here: the native controls (play, scrub,
    // fullscreen) keep all their touches. pressStyle stays so the video
    // shrinks with the rest of the message while the picker is open.
    media = (
      <div style={{ ...pressStyle, borderRadius: 14, overflow: "hidden" }}>
        <video
          key={`${message.id}:video`}
          src={mediaUrl}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={onMediaLoad}
          onError={() => setMediaFailed(true)}
          style={{
            display: "block",
            maxWidth: 260,
            maxHeight: 320,
            borderRadius: 14,
            background: "#000",
          }}
        />
      </div>
    );
  } else if (mediaKind === "image" && mediaUrl) {
    media = (
      <div
        {...pressHandlers}
        style={{ ...pressStyle, borderRadius: 14, overflow: "hidden" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={`${message.id}:photo`}
          src={mediaUrl}
          alt="Photo"
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={onMediaLoad}
          onError={() => setMediaFailed(true)}
          style={{
            display: "block",
            minWidth: 120,
            minHeight: 120,
            maxWidth: 260,
            maxHeight: 320,
            objectFit: "cover",
            borderRadius: 14,
            background: darkMode ? "rgba(255,255,255,0.06)" : "rgba(28,28,30,0.06)",
          }}
        />
      </div>
    );
  }

  // Shared post/clip → a card that opens /posts/<id>. A card with no joined
  // row means the post isn't visible, or was deleted — deleting nulls
  // attachment_id (FK is ON DELETE SET NULL) and only attachment_kind stays.
  let card: React.ReactNode = null;
  if (hasCard && !attachment) {
    card = noticeTile("Post unavailable", true);
  } else if (attachment) {
    const isClip = attachment.type === "clip";
    // Poster: the thumbnail, else the post's own image. A clip's
    // media_url is a video, so it never doubles as a poster.
    const posterUrl =
      attachment.media_thumbnail_url || (!isClip ? attachment.media_url : null);
    const author = attachment.author;
    card = (
      <Link
        href={`/posts/${encodeURIComponent(attachment.id)}`}
        draggable={false}
        {...pressHandlers}
        style={{
          display: "block",
          width: 260,
          maxWidth: "100%",
          borderRadius: 14,
          overflow: "hidden",
          background: bubbleBg,
          color: bubbleColor,
          border: bubbleBorder,
          boxShadow: bubbleShadow,
          backdropFilter: darkMode ? "blur(20px) saturate(160%)" : undefined,
          WebkitBackdropFilter: darkMode ? "blur(20px) saturate(160%)" : undefined,
          fontFamily: "DM Sans, sans-serif",
          textDecoration: "none",
          ...pressStyle,
        }}
      >
        <div
          style={{
            position: "relative",
            height: 150,
            background: "linear-gradient(135deg,#2D1B4E,#1A3A5C)",
            overflow: "hidden",
          }}
        >
          {posterUrl && !posterFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${message.id}:poster`}
              src={posterUrl}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setPosterFailed(true)}
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : null}
          {isClip ? (
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(0,0,0,0.18)",
              }}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.94)",
                  color: "#1C1C1E",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                  <path d="M5 3.5v9l8-4.5z" />
                </svg>
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ padding: "10px 12px 12px" }}>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: onTint ? "rgba(255,255,255,0.8)" : "#FF5C35",
              marginBottom: 5,
            }}
          >
            {isClip ? "Clip" : "Post"}
          </div>
          {attachment.content?.trim() ? (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                fontWeight: 500,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                wordBreak: "break-word",
              }}
            >
              {attachment.content}
            </div>
          ) : (
            <div style={{ fontSize: 12, fontStyle: "italic", color: cardMuted }}>
              Tap to open
            </div>
          )}
          {author && (author.name || author.handle) ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                marginTop: 9,
                paddingTop: 9,
                borderTop: onTint
                  ? "1px solid rgba(255,255,255,0.16)"
                  : "1px solid rgba(28,28,30,0.08)",
                fontSize: 11,
                color: cardMuted,
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 7,
                  background: author.avatar_url
                    ? `url(${author.avatar_url}) center/cover`
                    : "#FFD3C2",
                  color: "#1C1C1E",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Fraunces, serif",
                  fontSize: 9,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {!author.avatar_url ? initialsOf(author.name || author.handle) : null}
              </span>
              <span
                style={{
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                by{" "}
                <span style={{ fontWeight: 700, color: onTint ? "#fff" : "#1C1C1E" }}>
                  {author.name || `@${author.handle}`}
                </span>
                {author.name && author.handle ? (
                  <span style={{ opacity: 0.8 }}> @{author.handle}</span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      </Link>
    );
  }

  // A reply's quote stub (desktop's .dm-quote): who it answers and one
  // line of what they sent. It sits on the chat surface above the
  // message, whatever kind it is, and takes no long-press.
  const parent = message.parent_preview ?? null;
  const quote = parent ? (
    <div
      style={{
        maxWidth: "min(260px, 100%)",
        boxSizing: "border-box",
        padding: "5px 10px",
        borderLeft: darkMode ? "3px solid rgba(255,140,90,0.55)" : "3px solid #FF5C35",
        borderRadius: 8,
        background: darkMode ? "rgba(20,16,28,0.45)" : "rgba(28,28,30,0.05)",
        color: darkMode ? "rgba(255,255,255,0.78)" : "#5C5853",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 12,
        lineHeight: 1.35,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: darkMode ? "rgba(255,180,150,0.95)" : "#FF5C35",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        ↩ {parentIsMine ? "You" : parent.author?.name || parent.author?.handle || "message"}
      </div>
      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {quotedBody(parent)}
      </div>
    </div>
  ) : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isMine ? "flex-end" : "flex-start",
        marginTop: topGap,
        position: "relative",
      }}
    >
      {showSender ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            margin: "0 0 4px 0",
            color: senderNameColor,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              background: sender?.avatar_url
                ? `url(${sender.avatar_url}) center/cover`
                : "#FFD3C2",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 800,
              color: "#1C1C1E",
              border: "1px solid rgba(255,255,255,0.6)",
              flexShrink: 0,
            }}
          >
            {!sender?.avatar_url ? senderInitials : null}
          </div>
          <span>{senderName}</span>
          {sender?.handle ? (
            <span
              style={{
                color: senderHandleColor,
                fontWeight: 500,
              }}
            >
              @{sender.handle}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        style={{
          // 32px gutter (24 avatar + 8 gap) so subsequent bubbles in a
          // sender's run align under the avatar, the way Discord does it.
          paddingLeft: groupMode && !isMine ? 32 : 0,
          maxWidth: "100%",
          position: "relative",
        }}
      >
        {/* Quote stub, photo/video, shared-post card and caption,
            stacked on the sender's side. Each piece but the video and
            the stub carries the long-press handlers. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: isMine ? "flex-end" : "flex-start",
            gap: 4,
          }}
        >
          {quote}
          {captionAbove ? textBubble : null}
          {media}
          {card}
          {captionAbove ? null : textBubble}
          {isEmpty ? noticeTile("Attachment") : null}
        </div>

        {/* Existing reactions — tappable to toggle. Wraps below the bubble. */}
        {message.reactions && message.reactions.length > 0 ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 4,
              marginTop: 4,
              justifyContent: isMine ? "flex-end" : "flex-start",
            }}
          >
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onToggleReaction?.(r.emoji)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: r.viewer_reacted
                    ? "rgba(255,140,90,0.22)"
                    : darkMode
                      ? "rgba(20,16,28,0.55)"
                      : "rgba(255,255,255,0.78)",
                  border: r.viewer_reacted
                    ? "1px solid rgba(255,180,150,0.55)"
                    : darkMode
                      ? "1px solid rgba(255,255,255,0.10)"
                      : "1px solid rgba(28,28,30,0.08)",
                  color: r.viewer_reacted
                    ? "#FFD0BF"
                    : darkMode
                      ? "rgba(255,255,255,0.85)"
                      : "#1C1C1E",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span style={{ fontSize: 13 }}>{r.emoji}</span>
                {r.count}
              </button>
            ))}
          </div>
        ) : null}

        {/* Emoji picker — pops out on long-press. Anchored above the
            bubble on the same side, or below it when the list has no
            room above. */}
        {pickerOpen ? (
          <ReactionPicker
            darkMode={darkMode}
            isMine={isMine}
            existing={message.reactions ?? []}
            onPick={(emoji) => {
              setPickerOpen(false);
              onToggleReaction?.(emoji);
            }}
            // Not on a row still sending: the server silently drops a
            // parent it can't find, and a temp_ id is one.
            onReply={
              onReply && !message.id.startsWith("temp_")
                ? () => {
                    setPickerOpen(false);
                    onReply();
                  }
                : undefined
            }
            onClose={() => setPickerOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

// Eats the click that ends one press, so the tap that closes the
// reaction picker doesn't also open whatever is under the finger. It
// listens in the capture phase on document, ahead of React and links.
// The next press, this press turning into a scroll (pointercancel), or
// a second with no click ends it without eating anything.
function swallowNextClick(pointerId: number) {
  let timer = 0;
  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    stop();
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) stop();
  };
  const stop = () => {
    window.clearTimeout(timer);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("pointercancel", onCancel, true);
  };
  document.addEventListener("click", onClick, true);
  document.addEventListener("pointerdown", stop, true);
  document.addEventListener("pointercancel", onCancel, true);
  timer = window.setTimeout(stop, 1000);
}

function ReactionPicker({
  darkMode,
  isMine,
  existing,
  onPick,
  onReply,
  onClose,
}: {
  darkMode: boolean;
  isMine: boolean;
  existing: MessageReaction[];
  onPick: (emoji: string) => void;
  /** Adds "↩ Reply", on the emoji row's far side from the bubble. */
  onReply?: () => void;
  onClose: () => void;
}) {
  const pickerRef = useRef<HTMLDivElement | null>(null);

  // Opens above the bubble unless the message list can't show it
  // there, then below. The list clips it at its top edge, and above the
  // first message no scroll brings it back, so on a request or DM with
  // one or two messages the emojis and Reply were cut off. Measured
  // before paint, so it never shows on the wrong side first.
  const [below, setBelow] = useState(false);
  useLayoutEffect(() => {
    const el = pickerRef.current;
    // The bubble wrapper it's positioned against.
    const anchor = el?.offsetParent;
    if (!el || !anchor) return;
    let list = anchor.parentElement;
    while (list && !/auto|scroll/.test(getComputedStyle(list).overflowY)) {
      list = list.parentElement;
    }
    const listTop = list ? list.getBoundingClientRect().top : 0;
    if (anchor.getBoundingClientRect().top - listTop < el.offsetHeight + 6) {
      setBelow(true);
    }
  }, []);

  // Outside-tap dismiss — but only if the tap is OUTSIDE the picker.
  // Previously we used `once: true`, which also fired when the user
  // tapped an emoji inside, unmounting the picker before the emoji's
  // click could fire (pointerdown happens before click on mobile). Now
  // we check the event target and short-circuit if it's inside.
  // Closing still happens on pointerdown, so a scroll that starts
  // outside closes it too. That tap's click is eaten: it used to open
  // the shared post, reaction chip or More sheet under the finger.
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && pickerRef.current?.contains(target)) return;
      swallowNextClick(e.pointerId);
      onClose();
    };
    // Bind on the next tick so the pointerdown that opened the picker
    // doesn't immediately close it.
    const t = window.setTimeout(() => {
      document.addEventListener("pointerdown", handler);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("pointerdown", handler);
    };
  }, [onClose]);

  const reactedSet = new Set(
    existing.filter((r) => r.viewer_reacted).map((r) => r.emoji),
  );

  return (
    <div
      ref={pickerRef}
      role="dialog"
      aria-label="React"
      style={{
        position: "absolute",
        ...(below
          ? { top: "calc(100% + 6px)" }
          : { bottom: "calc(100% + 6px)" }),
        ...(isMine ? { right: 0 } : { left: 32 }),
        display: "flex",
        // The emojis sit next to the bubble on either side (above, that's
        // where they were before Reply), and Reply goes on the far side.
        flexDirection: below ? "column" : "column-reverse",
        padding: "6px 8px",
        // A pill for the emoji row alone; a card once Reply joins it.
        // Reply gets its own row because beside the emojis the picker
        // ran past a phone's width and scrolled the list sideways.
        borderRadius: onReply ? 20 : 999,
        background: darkMode
          ? "rgba(20,16,28,0.92)"
          : "rgba(255,255,255,0.96)",
        border: darkMode
          ? "1px solid rgba(255,255,255,0.14)"
          : "1px solid rgba(28,28,30,0.10)",
        boxShadow: darkMode
          ? "inset 0 1px 0 rgba(255,255,255,0.10),0 12px 28px rgba(0,0,0,0.42)"
          : "0 12px 28px rgba(180,120,60,0.18)",
        backdropFilter: darkMode ? "blur(20px) saturate(180%)" : undefined,
        WebkitBackdropFilter: darkMode ? "blur(20px) saturate(180%)" : undefined,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {REACTION_EMOJIS.map((emoji) => {
          const on = reactedSet.has(emoji);
          return (
            <button
              key={emoji}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPick(emoji);
              }}
              style={{
                background: on ? "rgba(255,140,90,0.22)" : "transparent",
                border: "none",
                padding: 0,
                width: 32,
                height: 32,
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
                boxShadow: on
                  ? "0 0 0 1.5px rgba(255,180,150,0.7)"
                  : "none",
                transition: "transform 120ms ease",
              }}
            >
              {emoji}
            </button>
          );
        })}
      </div>
      {onReply ? (
        <>
          <div
            aria-hidden
            style={{
              height: 1,
              // 6px on the emoji side, 4px on Reply's, in either order.
              margin: below ? "6px 2px 4px" : "4px 2px 6px",
              background: darkMode ? "rgba(255,255,255,0.12)" : "rgba(28,28,30,0.08)",
            }}
          />
          <button
            type="button"
            aria-label="Reply"
            onClick={(e) => {
              e.stopPropagation();
              onReply();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 36,
              padding: "0 8px",
              borderRadius: 12,
              border: "none",
              background: "transparent",
              color: darkMode ? "#fff" : "#1C1C1E",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span aria-hidden>↩</span>
            Reply
          </button>
        </>
      ) : null}
    </div>
  );
}
