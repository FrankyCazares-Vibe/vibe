"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  last_message: {
    content: string;
    created_at: string;
    user_id: string;
  } | null;
  last_read_at: string | null;
  accepted_at: string | null;
  pinned_at?: string | null;
  hidden_at?: string | null;
  muted_until?: string | null;
  unread_count?: number;
  members?: ThreadMember[];
  viewer_role?: "admin" | "member";
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
};

type Tab = "all" | "requests";

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

// ---------- Component ----------

export function MessagesMobile({ initialHandle }: { initialHandle?: string }) {
  const [tab, setTab] = useState<Tab>("all");
  const [threads, setThreads] = useState<ThreadEntry[] | null>(null);
  const [requests, setRequests] = useState<ThreadEntry[] | null>(null);
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
      try {
        const r = await fetch("/api/me/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: lower }),
        });
        const j = await r.json();
        if (j?.ok && j.channel_id) {
          await refetchThreadsRef.current?.();
          setComposeOpen(false);
          setOpenThreadId(j.channel_id);
        }
      } catch {
        /* silent — user stays on compose */
      }
    },
    [threads],
  );

  // Stable handle to the refetcher so callbacks can refresh without a
  // dep-chain rewrite. Filled in below once `refetchThreads` exists.
  const refetchThreadsRef = useRef<(() => Promise<void>) | null>(null);

  const refetchThreads = useCallback(async () => {
    try {
      const r = await fetch("/api/me/threads", { cache: "no-store" });
      const j = await r.json();
      if (j?.ok) {
        setThreads(Array.isArray(j.threads) ? j.threads : []);
        setRequests(Array.isArray(j.requests) ? j.requests : []);
      } else {
        setThreads([]);
        setRequests([]);
      }
    } catch {
      setThreads([]);
      setRequests([]);
    }
  }, []);

  useEffect(() => {
    refetchThreadsRef.current = refetchThreads;
    void refetchThreads();
  }, [refetchThreads]);

  // ?to=<handle> deep link — resolve to a channel id once threads have
  // loaded, then open that conversation. Handles both existing threads
  // (peer.handle matches) and brand-new ones (POST to /api/me/threads).
  useEffect(() => {
    if (!initialHandle) return;
    if (threads === null) return; // wait for initial fetch
    if (initialHandleResolvedRef.current) return;
    initialHandleResolvedRef.current = true;
    const lower = initialHandle.toLowerCase();
    const existing = threads.find(
      (t) => t.type === "dm" && t.peer?.handle?.toLowerCase() === lower,
    );
    if (existing) {
      setOpenThreadId(existing.id);
      return;
    }
    // Create / resolve the DM channel server-side.
    (async () => {
      try {
        const r = await fetch("/api/me/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: lower }),
        });
        const j = await r.json();
        if (j?.ok && j.channel_id) {
          await refetchThreads();
          setOpenThreadId(j.channel_id);
        }
      } catch {
        /* silent — user lands on the thread list */
      }
    })();
  }, [initialHandle, threads, refetchThreads]);

  const visibleThreads = useMemo(() => {
    if (tab === "requests") return requests ?? [];
    return threads ?? [];
  }, [tab, threads, requests]);

  const unreadCount = useMemo(() => {
    if (!threads) return 0;
    return threads.filter((t) => {
      if (!t.last_message) return false;
      if (t.last_message.user_id === t.peer?.id) {
        if (!t.last_read_at) return true;
        return new Date(t.last_message.created_at) > new Date(t.last_read_at);
      }
      return false;
    }).length;
  }, [threads]);

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
          <ListSkeleton />
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
  const preview = thread.last_message?.content?.trim() || "No messages yet";
  const when = relativeTime(thread.last_message?.created_at);
  const unread =
    !!thread.last_message &&
    thread.last_message.user_id === thread.peer?.id &&
    (!thread.last_read_at ||
      new Date(thread.last_message.created_at) > new Date(thread.last_read_at));

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

function ConversationView({
  threadId,
  thread,
  onClose,
}: {
  threadId: string;
  thread: ThreadEntry | null;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Hide the tab bar while the conversation is open. Reuses the
  // existing composer-overlay rule in globals.css.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, []);

  // Initial fetch + mark-as-read.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/me/threads/${encodeURIComponent(threadId)}/messages?limit=50`,
          { cache: "no-store" },
        );
        const j = await r.json();
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.messages)) {
          // API returns oldest-first — UI appends new messages to the
          // bottom, so the array can be used as-is.
          setMessages(j.messages as MessageRow[]);
          if (typeof j.viewer_id === "string") setMeId(j.viewer_id);
        } else {
          setMessages([]);
        }
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    // Mark as read — best-effort, non-blocking.
    fetch(`/api/me/threads/${encodeURIComponent(threadId)}/read`, {
      method: "POST",
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // Auto-scroll to the bottom on first message-paint + after sends.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    // Optimistic append.
    const tempId = `temp_${Date.now()}`;
    setMessages((prev) => [
      ...(prev ?? []),
      {
        id: tempId,
        content: text,
        created_at: new Date().toISOString(),
        user_id: meId ?? "me",
      },
    ]);
    setDraft("");
    try {
      const r = await fetch(
        `/api/me/threads/${encodeURIComponent(threadId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text }),
        },
      );
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Send failed");
      // Replace the temp row with the server row.
      setMessages((prev) =>
        (prev ?? []).map((m) =>
          m.id === tempId ? (j.message as MessageRow) : m,
        ),
      );
    } catch (e) {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== tempId));
      setDraft(text);
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [draft, sending, threadId, meId]);

  const peer = thread?.peer;
  const title = thread ? threadTitle(thread) : "Conversation";
  const avatar = thread ? threadAvatar(thread) : { url: null, initials: "?" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "#FAF7F2",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding:
            "calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px",
          background: "rgba(250, 247, 242, 0.92)",
          backdropFilter: "saturate(160%) blur(14px)",
          WebkitBackdropFilter: "saturate(160%) blur(14px)",
          borderBottom: "1px solid rgba(28,28,30,0.06)",
          flexShrink: 0,
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
                color: "#1C1C1E",
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
                color: "#1C1C1E",
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
                color: "#8A8580",
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
            border: "1px solid rgba(28,28,30,0.10)",
            background: "rgba(255,255,255,0.78)",
            color: "#1C1C1E",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            WebkitTapHighlightColor: "transparent",
            flexShrink: 0,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
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
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 14px 8px",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {messages === null ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "#8A8580",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 13,
            }}
          >
            Loading messages…
          </div>
        ) : messages.length === 0 ? (
          <div
            style={{
              padding: "48px 18px",
              textAlign: "center",
              color: "#5C5853",
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
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isMine={isMine}
                  topGap={showGap ? 8 : 0}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Error banner */}
      {error ? (
        <div
          role="alert"
          style={{
            padding: "8px 14px",
            background: "rgba(255,92,53,0.10)",
            color: "#B83A1A",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12.5,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {error}
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
          background: "rgba(250, 247, 242, 0.96)",
          borderTop: "1px solid rgba(28,28,30,0.08)",
        }}
      >
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
          placeholder="Message…"
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            minHeight: 38,
            maxHeight: 120,
            padding: "10px 14px",
            borderRadius: 18,
            border: "1px solid rgba(28,28,30,0.10)",
            background: "rgba(255,255,255,0.92)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14.5,
            color: "#1C1C1E",
            outline: "none",
            lineHeight: 1.4,
          }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: "none",
            background:
              !draft.trim() || sending ? "rgba(28,28,30,0.18)" : "#FF5C35",
            color: "#fff",
            cursor: !draft.trim() || sending ? "default" : "pointer",
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
    </div>
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conversation actions"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(0,0,0,0.42)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#FAF7F2",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
          animation: "vibeActionSheetIn 220ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        <style>{`
          @keyframes vibeActionSheetIn {
            from { transform: translateY(20px); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        `}</style>
        {/* Grab handle */}
        <div
          aria-hidden
          style={{
            margin: "10px auto 4px",
            width: 38,
            height: 4,
            borderRadius: 999,
            background: "rgba(28,28,30,0.18)",
          }}
        />
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
            <SheetRow
              label="Group info"
              onClick={onOpenGroupSettings}
            />
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
      </div>
    </div>
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
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "rgba(0,0,0,0.42)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#FAF7F2",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div
          aria-hidden
          style={{
            margin: "10px auto 4px",
            width: 38,
            height: 4,
            borderRadius: 999,
            background: "rgba(28,28,30,0.18)",
          }}
        />
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
      </div>
    </div>
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Actions for ${member.name || member.handle || "member"}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        background: "rgba(0,0,0,0.42)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "#FAF7F2",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div
          aria-hidden
          style={{
            margin: "10px auto 4px",
            width: 38,
            height: 4,
            borderRadius: 999,
            background: "rgba(28,28,30,0.18)",
          }}
        />
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
      </div>
    </div>
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hide the bottom tab bar while compose is open.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => document.body.classList.remove("vibe-composer-open");
  }, []);

  // Autofocus on mount — keyboard opens immediately. Small delay so
  // iOS Safari honors the focus after the slide-in.
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
      try {
        const r = await fetch(
          `/api/users/search?q=${encodeURIComponent(debounced)}&limit=20`,
          { cache: "no-store" },
        );
        const j = await r.json();
        if (cancelled) return;
        setResults(
          j?.ok && Array.isArray(j.users) ? (j.users as SearchUser[]) : [],
        );
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced]);

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
              fontSize: 15,
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
}: {
  message: MessageRow;
  isMine: boolean;
  topGap: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isMine ? "flex-end" : "flex-start",
        marginTop: topGap,
      }}
    >
      <div
        style={{
          maxWidth: "78%",
          padding: "8px 14px",
          borderRadius: 18,
          background: isMine ? "#FF5C35" : "rgba(255,255,255,0.88)",
          color: isMine ? "#fff" : "#1C1C1E",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14.5,
          lineHeight: 1.4,
          fontWeight: 500,
          border: isMine ? "none" : "1px solid rgba(28,28,30,0.06)",
          boxShadow: isMine
            ? "0 4px 14px rgba(255,92,53,0.22)"
            : "0 2px 8px rgba(180,120,60,0.06)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {message.content}
      </div>
    </div>
  );
}
