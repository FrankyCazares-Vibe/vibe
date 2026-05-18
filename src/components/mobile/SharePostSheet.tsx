"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";

/**
 * In-app "Send to…" picker. Lists every chat the viewer can post to
 * (DMs, groups, org channels) and multi-sends the post/clip as an
 * attached message via /api/me/threads/[id]/messages with
 * { content, attachment_id, attachment_kind }.
 *
 * Mounted from the 3-dot menus on both the feed card and the post
 * viewer (mobile + desktop). The sheet is a bottom vaul drawer on
 * every viewport — desktop just renders it centered on top of the
 * page; doesn't fight the underlying layout.
 *
 * The threads list comes from /api/me/threads, which already returns
 * DMs + groups + org_channels + org_subchannels in one payload.
 * Requests (pending message-request threads) are excluded — you
 * shouldn't be able to share into a chat you haven't accepted.
 */

type ThreadType = "dm" | "group" | "org_channel" | "org_subchannel";

type ThreadEntry = {
  id: string;
  type: ThreadType;
  name: string;
  photo_url: string | null;
  peer: {
    id: string;
    name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
  is_request: boolean;
};

export function SharePostSheet({
  postId,
  postKind,
  postTitle,
  postPosterUrl,
  authorName,
  onClose,
  onSent,
}: {
  postId: string;
  postKind: "post" | "clip";
  /** Short preview text — usually the post's content. Shown in the
   *  sticky preview row above the threads list so the user knows
   *  what they're about to send. */
  postTitle?: string;
  /** Optional thumbnail URL for the preview row. */
  postPosterUrl?: string | null;
  /** Author display name for the preview row's subline. */
  authorName?: string | null;
  onClose: () => void;
  /** Fired after a successful multi-send. Callers can use this to
   *  show a toast or close the parent menu. */
  onSent?: (count: number) => void;
}) {
  const [threads, setThreads] = useState<ThreadEntry[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranSendRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/me/threads", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (!j?.ok) {
          setError(j?.error ?? "Couldn't load chats");
          setThreads([]);
          return;
        }
        const all: ThreadEntry[] = [
          ...((j.threads ?? []) as ThreadEntry[]),
          ...((j.requests ?? []) as ThreadEntry[]),
        ].filter((t) => !t.is_request);
        setThreads(all);
      } catch {
        if (!cancelled) {
          setError("Couldn't load chats");
          setThreads([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!threads) return [];
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => {
      const hay = [
        t.name,
        t.peer?.name ?? "",
        t.peer?.handle ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [threads, query]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const send = useCallback(async () => {
    if (sending || ranSendRef.current || selectedIds.size === 0) return;
    ranSendRef.current = true;
    setSending(true);
    setError(null);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.all(
        ids.map((threadId) =>
          fetch(
            `/api/me/threads/${encodeURIComponent(threadId)}/messages`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                content: caption.trim(),
                attachment_id: postId,
                attachment_kind: postKind,
              }),
            },
          ),
        ),
      );
      const failures = results.filter((r) => !r.ok).length;
      if (failures > 0) {
        throw new Error(
          failures === results.length
            ? "Couldn't send to any chats"
            : `Sent to ${results.length - failures} of ${results.length}`,
        );
      }
      onSent?.(results.length);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send");
      ranSendRef.current = false;
    } finally {
      setSending(false);
    }
  }, [sending, selectedIds, caption, postId, postKind, onSent, onClose]);

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.42)",
            zIndex: 1200,
          }}
        />
        <Drawer.Content
          aria-describedby={undefined}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "85dvh",
            background: "#FAF7F2",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            boxShadow: "0 -8px 32px rgba(0,0,0,0.18)",
            zIndex: 1201,
            outline: "none",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            aria-hidden
            style={{
              alignSelf: "center",
              margin: "10px auto 4px",
              width: 38,
              height: 4,
              borderRadius: 999,
              background: "rgba(28,28,30,0.18)",
            }}
          />
          <Drawer.Title
            style={{
              padding: "6px 18px 10px",
              fontFamily: "Fraunces, serif",
              fontSize: 17,
              fontWeight: 800,
              color: "#1C1C1E",
            }}
          >
            Send to
          </Drawer.Title>

          {/* Post preview — small thumbnail + title so the user
              confirms what they're about to send. */}
          <div
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 16px",
              borderTop: "1px solid rgba(28,28,30,0.06)",
              borderBottom: "1px solid rgba(28,28,30,0.06)",
              background: "rgba(255,253,248,0.78)",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                flexShrink: 0,
                background: postPosterUrl
                  ? `url(${postPosterUrl}) center/cover`
                  : "linear-gradient(135deg, #FFD3C2 0%, #FF9D7E 100%)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#FF5C35",
                  marginBottom: 2,
                }}
              >
                {postKind === "clip" ? "Clip" : "Post"}
              </div>
              <div
                style={{
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  color: "#1C1C1E",
                  fontWeight: 600,
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {postTitle?.trim() ||
                  (postKind === "clip" ? "Untitled clip" : "Post")}
              </div>
              {authorName ? (
                <div
                  style={{
                    marginTop: 2,
                    fontSize: 11.5,
                    color: "#8A8580",
                  }}
                >
                  by {authorName}
                </div>
              ) : null}
            </div>
          </div>

          {/* Search */}
          <div
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid rgba(28,28,30,0.06)",
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 10,
                border: "1px solid rgba(28,28,30,0.10)",
                background: "rgba(255,255,255,0.92)",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13.5,
                color: "#1C1C1E",
                outline: "none",
              }}
            />
          </div>

          {/* Threads list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {threads === null ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#8A8580",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                }}
              >
                Loading chats…
              </div>
            ) : filtered.length === 0 ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#8A8580",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                }}
              >
                {query.trim()
                  ? `No chats match "${query}"`
                  : "No chats yet — start a DM to share things."}
              </div>
            ) : (
              filtered.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  selected={selectedIds.has(t.id)}
                  onToggle={() => toggle(t.id)}
                />
              ))
            )}
          </div>

          {/* Caption + send */}
          <div
            style={{
              padding:
                "10px 14px calc(12px + env(safe-area-inset-bottom, 0px))",
              borderTop: "1px solid rgba(28,28,30,0.06)",
              background: "rgba(250,247,242,0.96)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {error ? (
              <div
                role="alert"
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  background: "rgba(192,57,43,0.08)",
                  border: "1px solid rgba(192,57,43,0.22)",
                  color: "#B83A1A",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            ) : null}
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a message (optional)"
              rows={1}
              style={{
                width: "100%",
                resize: "vertical",
                minHeight: 38,
                maxHeight: 120,
                padding: "9px 12px",
                borderRadius: 10,
                border: "1px solid rgba(28,28,30,0.10)",
                background: "rgba(255,255,255,0.92)",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13.5,
                color: "#1C1C1E",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={selectedIds.size === 0 || sending}
              style={{
                alignSelf: "flex-end",
                padding: "9px 18px",
                borderRadius: 999,
                border: "none",
                background:
                  selectedIds.size === 0 || sending
                    ? "rgba(28,28,30,0.18)"
                    : "#FF5C35",
                color: "#fff",
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13.5,
                fontWeight: 800,
                cursor:
                  selectedIds.size === 0 || sending ? "default" : "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {sending
                ? "Sending…"
                : selectedIds.size === 0
                  ? "Pick a chat"
                  : `Send to ${selectedIds.size} chat${selectedIds.size === 1 ? "" : "s"}`}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ThreadRow({
  thread,
  selected,
  onToggle,
}: {
  thread: ThreadEntry;
  selected: boolean;
  onToggle: () => void;
}) {
  const avatarUrl =
    thread.type === "dm" ? thread.peer?.avatar_url : thread.photo_url;
  const initials =
    (thread.type === "dm"
      ? thread.peer?.name || thread.peer?.handle || "?"
      : thread.name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const isChannel =
    thread.type === "org_channel" || thread.type === "org_subchannel";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "10px 16px",
        background: selected ? "rgba(255,92,53,0.08)" : "transparent",
        border: "none",
        borderBottom: "1px solid rgba(28,28,30,0.04)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 20,
          height: 20,
          borderRadius: 6,
          border: selected
            ? "1.5px solid #FF5C35"
            : "1.5px solid rgba(28,28,30,0.22)",
          background: selected ? "#FF5C35" : "#fff",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 12,
          fontWeight: 800,
          lineHeight: 1,
        }}
      >
        {selected ? "✓" : ""}
      </span>
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: avatarUrl
            ? `url(${avatarUrl}) center/cover`
            : "linear-gradient(135deg, #FFD3C2 0%, #FF9D7E 100%)",
          color: "#1C1C1E",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {!avatarUrl ? initials : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13.5,
            fontWeight: 700,
            color: "#1C1C1E",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {isChannel ? `# ${thread.name}` : thread.name || "Direct message"}
        </span>
        <span
          style={{
            display: "block",
            marginTop: 1,
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11.5,
            color: "#8A8580",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {thread.type === "dm"
            ? thread.peer?.handle
              ? `@${thread.peer.handle}`
              : "Direct message"
            : thread.type === "group"
              ? "Group"
              : "Channel"}
        </span>
      </span>
    </button>
  );
}
