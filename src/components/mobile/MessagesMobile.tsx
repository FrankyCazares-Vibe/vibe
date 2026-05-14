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
  unread_count?: number;
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
  const initialHandleResolvedRef = useRef(false);

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
    </div>
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
