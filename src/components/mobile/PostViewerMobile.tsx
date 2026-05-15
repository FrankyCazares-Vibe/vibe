"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Drawer } from "vaul";

/**
 * iOS-native mobile post viewer. Opens as a full-screen sheet from the
 * ProfileMobile Posts grid; ProfileMobile owns the open/close state.
 *
 * Layout:
 *   - Top bar (safe-area padded): close × + author avatar/name/handle
 *     + the post's relative timestamp.
 *   - Scrollable body: image (if any), content with @handle / #tag
 *     linkified, tag chips, then the engagement bar.
 *   - Engagement bar: Like (heart + count), Comment (chat + count),
 *     Repost (loop + count), Save (bookmark), Share. Hits the same
 *     /api/posts/[id]/{like,repost,save,comments,view} endpoints the
 *     desktop FeedRow uses, so all the counts stay consistent across
 *     surfaces.
 *   - Comments drawer: collapsed by default; expand to render a flat
 *     list of comments + a sticky composer at the bottom. Replies are
 *     flattened into the same list (v1 — no nesting).
 *
 * Hit the single-post endpoint /api/posts/[id] on mount so we get the
 * server-side counts + viewer state in one roundtrip; rolls back
 * optimistically on a failed mutation.
 */

type Author = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
  major?: string | null;
  year?: number | null;
};

type PostDetail = {
  id: string;
  user_id: string;
  type: string;
  content: string | null;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  created_at: string;
  author: Author | null;
};

type Comment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  author: { id: string; name: string | null; handle: string | null; avatar_url: string | null } | null;
};

type Counts = { likes: number; comments: number };
type Viewer = { liked: boolean; saved: boolean };

export function PostViewerMobile({
  postId,
  onClose,
  canDelete = false,
  onDeleted,
}: {
  postId: string;
  onClose: () => void;
  /** Show the kebab menu with a Delete action. Caller decides ownership;
   *  server still re-checks at /api/posts/[id] DELETE. */
  canDelete?: boolean;
  /** Fired after a successful delete; viewer auto-closes. Parent
   *  typically uses this to refresh its post grid. */
  onDeleted?: () => void;
}) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [counts, setCounts] = useState<Counts>({ likes: 0, comments: 0 });
  const [viewer, setViewer] = useState<Viewer>({ liked: false, saved: false });
  const [error, setError] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (deleting) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this post?")) {
      return;
    }
    setDeleting(true);
    try {
      const r = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error ?? "Could not delete");
      }
      onDeleted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setDeleting(false);
    }
  };

  // Lock body scroll while the viewer is up. Restored on close so a
  // post share-link landing into /campus?post=… can still scroll the
  // underlying feed once the user dismisses the viewer.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Fetch the single post + counts + viewer state in one roundtrip.
  // Also fires the per-day-deduped /view endpoint so view counts get
  // attributed even when the post is opened from a profile, not the
  // feed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/posts/${postId}`, { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (!j?.ok) {
          setError(j?.error ?? "Could not load post");
          return;
        }
        setPost(j.post as PostDetail);
        setCounts(j.counts as Counts);
        setViewer(j.viewer as Viewer);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load post");
      }
    })();
    // Fire and forget the view ping — server dedupes per-user-per-day.
    fetch(`/api/posts/${postId}/view`, { method: "POST", cache: "no-store" })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // Lazy-fetch comments the first time the drawer opens.
  useEffect(() => {
    if (!commentsOpen || comments !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/posts/${postId}/comments?limit=80`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        if (j?.ok) {
          // Flatten roots + replies into one chronological list so the
          // mobile drawer reads top-to-bottom without indentation gymnastics.
          const flat: Comment[] = [];
          for (const root of (j.comments ?? []) as Array<Comment & { replies?: Comment[] }>) {
            flat.push(root);
            for (const rep of root.replies ?? []) flat.push(rep);
          }
          setComments(flat);
        }
      } catch {
        if (!cancelled) setComments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commentsOpen, comments, postId]);

  const toggleLike = async () => {
    const next = !viewer.liked;
    setViewer((v) => ({ ...v, liked: next }));
    setCounts((c) => ({ ...c, likes: c.likes + (next ? 1 : -1) }));
    try {
      const r = await fetch(`/api/posts/${postId}/like`, {
        method: next ? "POST" : "DELETE",
      });
      if (!r.ok) throw new Error("like");
    } catch {
      setViewer((v) => ({ ...v, liked: !next }));
      setCounts((c) => ({ ...c, likes: c.likes + (next ? -1 : 1) }));
    }
  };
  const toggleSave = async () => {
    const next = !viewer.saved;
    setViewer((v) => ({ ...v, saved: next }));
    try {
      const r = await fetch(`/api/posts/${postId}/save`, {
        method: next ? "POST" : "DELETE",
      });
      if (!r.ok) throw new Error("save");
    } catch {
      setViewer((v) => ({ ...v, saved: !next }));
    }
  };
  const repost = async () => {
    // Simple repost (no quote on mobile v1) — POST adds, server treats
    // a re-post by the same user as a no-op.
    try {
      await fetch(`/api/posts/${postId}/repost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      /* silent — engagement count refresh would need another fetch */
    }
  };
  const share = async () => {
    try {
      const url = `${window.location.origin}/campus?post=${encodeURIComponent(postId)}`;
      if (navigator.share) {
        await navigator.share({
          url,
          title: post?.content?.slice(0, 80) || "Vibe post",
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* user cancelled or unsupported */
    }
  };

  const submitComment = async () => {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const r = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const j = await r.json();
      if (r.ok && j?.ok && j.comment) {
        setComments((prev) => [...(prev ?? []), j.comment as Comment]);
        setCounts((c) => ({ ...c, comments: c.comments + 1 }));
        setDraft("");
      }
    } catch {
      /* silent */
    } finally {
      setPosting(false);
    }
  };

  const author = post?.author ?? null;
  const authorHandle = author?.handle ?? null;
  const isImage =
    post && post.media_url && !post.media_url.includes("clips/") && post.type === "post";

  return (
    <Drawer.Root
      open
      direction="right"
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Drawer.Portal>
        {/* No dim overlay — the content takes the full screen and the
            user expects to return to the underlying feed at the same
            scroll position, not to a darkened "modal" backdrop. */}
        <Drawer.Content
          role="dialog"
          aria-modal="true"
          aria-label="Post"
          aria-describedby={undefined}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            zIndex: 10000,
            background: "#FAF7F2",
            display: "flex",
            flexDirection: "column",
            color: "#1C1C1E",
            outline: "none",
          }}
        >
          <Drawer.Title
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
              whiteSpace: "nowrap",
              border: 0,
            }}
          >
            Post
          </Drawer.Title>
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding:
            "calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px",
          borderBottom: "1px solid rgba(28,28,30,0.06)",
          background: "rgba(255,253,248,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            border: "1px solid rgba(28,28,30,0.10)",
            background: "rgba(255,255,255,0.7)",
            color: "#1C1C1E",
            fontSize: 18,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          ×
        </button>
        {author ? (
          <Link
            href={authorHandle ? `/profile/${encodeURIComponent(authorHandle)}` : "#"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              textDecoration: "none",
              color: "inherit",
              flex: 1,
              minWidth: 0,
              // Leave room for the kebab when it's rendered, otherwise
              // long names crash into it.
              paddingRight: canDelete ? 4 : 0,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: author.avatar_url
                  ? `url(${author.avatar_url}) center/cover`
                  : "#1C1C1E",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Fraunces, serif",
                fontWeight: 800,
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {!author.avatar_url ? initialsOf(author.name ?? author.handle) : null}
            </div>
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.2 }}>
              <div
                style={{
                  fontFamily: "Fraunces, serif",
                  fontWeight: 800,
                  fontSize: 14,
                  color: "#1C1C1E",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {author.name ?? (author.handle ? `@${author.handle}` : "Member")}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#8A8580",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {author.handle ? `@${author.handle}` : ""}
                {post?.created_at ? `${author.handle ? " · " : ""}${relTime(post.created_at)}` : ""}
              </div>
            </div>
          </Link>
        ) : (
          <div style={{ flex: 1 }} />
        )}
        {canDelete ? (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close post menu" : "Open post menu"}
              aria-expanded={menuOpen}
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                border: "1px solid rgba(28,28,30,0.10)",
                background: menuOpen
                  ? "#1C1C1E"
                  : "rgba(255,255,255,0.7)",
                color: menuOpen ? "#fff" : "#1C1C1E",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                lineHeight: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <circle cx="3"  cy="8" r="1.5" fill="currentColor" />
                <circle cx="8"  cy="8" r="1.5" fill="currentColor" />
                <circle cx="13" cy="8" r="1.5" fill="currentColor" />
              </svg>
            </button>
            {menuOpen ? (
              <>
                {/* Click-away backdrop. Transparent, sits below the
                    menu but above the rest of the viewer so any tap
                    outside the menu closes it. */}
                <button
                  type="button"
                  aria-label="Dismiss menu"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "transparent",
                    border: "none",
                    cursor: "default",
                    zIndex: 1,
                  }}
                />
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    top: 40,
                    right: 0,
                    minWidth: 168,
                    background: "rgba(255,253,248,0.98)",
                    backdropFilter: "blur(14px)",
                    WebkitBackdropFilter: "blur(14px)",
                    border: "1px solid rgba(28,28,30,0.10)",
                    borderRadius: 12,
                    boxShadow:
                      "0 14px 30px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.08)",
                    padding: 6,
                    zIndex: 2,
                  }}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void handleDelete();
                    }}
                    disabled={deleting}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      border: "none",
                      background: "transparent",
                      borderRadius: 8,
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: 14,
                      fontWeight: 600,
                      color: "#C42B1C",
                      cursor: deleting ? "default" : "pointer",
                    }}
                  >
                    {deleting ? "Deleting…" : "Delete post"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "14px 16px calc(80px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {error ? (
          <div style={{ color: "#C0392B", fontSize: 14, textAlign: "center", padding: "32px 16px" }}>
            {error}
          </div>
        ) : !post ? (
          <PostViewerSkeleton />
        ) : (
          <>
            {isImage ? (
              <div
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  background: `url(${post.media_url}) center/cover, #EFEAE2`,
                  width: "100%",
                  aspectRatio: "1 / 1",
                  border: "1px solid rgba(28,28,30,0.06)",
                }}
              />
            ) : null}

            {post.content ? (
              <p
                style={{
                  margin: 0,
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 15,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  color: "#1C1C1E",
                }}
              >
                {renderInlineContent(post.content)}
              </p>
            ) : null}

            {post.tags && post.tags.length > 0 ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {post.tags.map((t) => (
                  <Link
                    key={t}
                    href={`/campus?tab=feed&tag=${encodeURIComponent(t)}`}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 999,
                      background: "rgba(255,92,53,0.10)",
                      border: "1px solid rgba(255,92,53,0.22)",
                      color: "#FF5C35",
                      fontFamily: "DM Sans, sans-serif",
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    #{t}
                  </Link>
                ))}
              </div>
            ) : null}

            {/* Engagement bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 18,
                paddingTop: 8,
                borderTop: "1px solid rgba(28,28,30,0.06)",
              }}
            >
              <EngagementButton
                label={String(counts.likes)}
                active={viewer.liked}
                onTap={toggleLike}
                activeColor="#FF5C35"
                icon={<HeartIcon filled={viewer.liked} />}
              />
              <EngagementButton
                label={String(counts.comments)}
                onTap={() => setCommentsOpen((v) => !v)}
                icon={<ChatIcon />}
              />
              <EngagementButton
                label="Repost"
                onTap={repost}
                icon={<RepostIcon />}
              />
              <div style={{ flex: 1 }} />
              <EngagementButton
                label=""
                active={viewer.saved}
                onTap={toggleSave}
                activeColor="#1C1C1E"
                icon={<BookmarkIcon filled={viewer.saved} />}
              />
              <EngagementButton
                label=""
                onTap={share}
                icon={<ShareIcon />}
              />
            </div>

            {/* Comments drawer */}
            {commentsOpen ? (
              <div style={{ borderTop: "1px solid rgba(28,28,30,0.06)", paddingTop: 10 }}>
                <div
                  style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "#8A8580",
                    marginBottom: 10,
                  }}
                >
                  Comments
                </div>
                {comments === null ? (
                  <div style={{ color: "#8A8580", fontSize: 13, padding: "12px 0" }}>
                    Loading…
                  </div>
                ) : comments.length === 0 ? (
                  <div style={{ color: "#8A8580", fontSize: 13, padding: "12px 0" }}>
                    Be the first to comment.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {comments.map((c) => (
                      <CommentRow key={c.id} c={c} />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Composer — sticky at the bottom over the body's bottom padding */}
      {commentsOpen ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding:
              "8px 12px calc(8px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(255,253,248,0.94)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            borderTop: "1px solid rgba(28,28,30,0.08)",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void submitComment();
              }
            }}
            placeholder="Add a comment…"
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid rgba(28,28,30,0.10)",
              background: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 14,
              outline: "none",
              color: "#1C1C1E",
            }}
          />
          <button
            type="button"
            onClick={submitComment}
            disabled={posting || !draft.trim()}
            style={{
              padding: "9px 16px",
              borderRadius: 999,
              background:
                draft.trim() && !posting ? "#FF5C35" : "rgba(28,28,30,0.10)",
              color: draft.trim() && !posting ? "#fff" : "#8A8580",
              border: "none",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: posting || !draft.trim() ? "default" : "pointer",
            }}
          >
            Post
          </button>
        </div>
      ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function CommentRow({ c }: { c: Comment }) {
  const a = c.author;
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: a?.avatar_url
            ? `url(${a.avatar_url}) center/cover`
            : "#1C1C1E",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Fraunces, serif",
          fontWeight: 700,
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        {!a?.avatar_url ? initialsOf(a?.name ?? a?.handle) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#1C1C1E", lineHeight: 1.4 }}>
          <span style={{ fontWeight: 700 }}>
            {a?.name ?? (a?.handle ? `@${a.handle}` : "someone")}
          </span>{" "}
          <span style={{ color: "#5C5853" }}>{c.content}</span>
        </div>
        <div style={{ fontSize: 10, color: "#8A8580", marginTop: 2 }}>
          {relTime(c.created_at)}
        </div>
      </div>
    </div>
  );
}

function EngagementButton({
  label,
  icon,
  onTap,
  active,
  activeColor,
}: {
  label: string;
  icon: React.ReactNode;
  onTap: () => void;
  active?: boolean;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "6px 8px",
        background: "transparent",
        border: "none",
        color: active && activeColor ? activeColor : "#5C5853",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {icon}
      {label ? <span>{label}</span> : null}
    </button>
  );
}

// ── inline icons (kept here so the viewer is fully self-contained) ──
function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#FF5C35" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function RepostIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function BookmarkIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "#1C1C1E" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function PostViewerSkeleton() {
  return (
    <>
      <div style={{ aspectRatio: "1/1", borderRadius: 14, background: "rgba(28,28,30,0.06)" }} />
      <div style={{ height: 14, borderRadius: 6, background: "rgba(28,28,30,0.06)", width: "85%" }} />
      <div style={{ height: 14, borderRadius: 6, background: "rgba(28,28,30,0.06)", width: "60%" }} />
    </>
  );
}

// Inline @handle / #tag linkifier — matches the desktop feed's
// renderPostContent behavior. Mentions route to /profile/<handle>;
// tags route to the campus feed filtered to that hashtag.
function renderInlineContent(text: string): React.ReactNode {
  if (!text) return null;
  const re = /(^|[^A-Za-z0-9_@#])([@#][A-Za-z0-9_]{1,32})/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    const leading = m[1] ?? "";
    const token = m[2] ?? "";
    const start = m.index + leading.length;
    if (start > lastIndex) nodes.push(<span key={`t${key++}`}>{text.slice(lastIndex, start)}</span>);
    const sigil = token[0];
    const body = token.slice(1).toLowerCase();
    if (sigil === "@" && body.length >= 3) {
      nodes.push(
        <Link
          key={`m${key++}`}
          href={`/profile/${encodeURIComponent(body)}`}
          style={{ color: "#FF5C35", fontWeight: 600, textDecoration: "none" }}
        >
          {token}
        </Link>,
      );
    } else if (sigil === "#") {
      nodes.push(
        <Link
          key={`h${key++}`}
          href={`/campus?tab=feed&tag=${encodeURIComponent(body)}`}
          style={{ color: "#FF5C35", fontWeight: 600, textDecoration: "none" }}
        >
          {token}
        </Link>,
      );
    } else {
      nodes.push(<span key={`p${key++}`}>{token}</span>);
    }
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) nodes.push(<span key={`t${key++}`}>{text.slice(lastIndex)}</span>);
  return nodes;
}

function initialsOf(s: string | null | undefined): string {
  if (!s) return "?";
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
}

function relTime(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
