"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  FILTER_CSS,
  getOverlayCss,
  isOverlayVisible,
} from "@/lib/clip/edit-metadata";

/**
 * iOS-native vertical-clip viewer. Opens as a full-screen sheet from
 * the ProfileMobile Clips grid. Single-clip experience (no swipe-to-
 * next yet — v1) with:
 *
 *   - Full-bleed 9:16 video, `playsInline` + muted-by-default so iOS
 *     Safari actually autoplays on tap-open (mobile autoplay rule).
 *   - Side action stack (like / comment / share) on the right edge,
 *     TikTok-style. Counts update optimistically.
 *   - Bottom caption: author + content + tags, with @handle / #tag
 *     linkified.
 *   - Tap the video → toggle play/pause. Volume button toggles mute.
 *   - Close button top-left, safe-area-padded.
 *
 * Hits the same /api/posts/[id]/{like,repost,save,view,comments}
 * endpoints the desktop ClipsReel uses so counts stay consistent
 * across surfaces.
 */

type Author = {
  id: string;
  name: string | null;
  handle: string | null;
  avatar_url: string | null;
};
type PostDetail = {
  id: string;
  user_id: string;
  type: string;
  content: string | null;
  tags: string[] | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
  edit_metadata: import("@/lib/clip/edit-metadata").ClipEditMetadata | null;
  created_at: string;
  author: Author | null;
};

export function ClipViewerMobile({
  clipId,
  onClose,
  canDelete = false,
  onDeleted,
}: {
  clipId: string;
  onClose: () => void;
  /** Show kebab menu with a Delete action. Caller decides ownership;
   *  server still re-checks at /api/posts/[id] DELETE. */
  canDelete?: boolean;
  /** Fired after a successful delete; viewer auto-closes. */
  onDeleted?: () => void;
}) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [likes, setLikes] = useState(0);
  const [comments, setComments] = useState(0);
  const [liked, setLiked] = useState(false);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Playback position in ms — drives the per-overlay visibility gate.
  // Only updates from `timeupdate` (≈250ms cadence) so we don't churn
  // re-renders.
  const [currentMs, setCurrentMs] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleDelete = async () => {
    if (deleting) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this clip?")) {
      return;
    }
    setDeleting(true);
    try {
      const r = await fetch(`/api/posts/${clipId}`, {
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

  // Lock body scroll while the viewer is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // One-shot fetch on mount — full post + counts + viewer state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/posts/${clipId}`, { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (!j?.ok) {
          setError(j?.error ?? "Could not load clip");
          return;
        }
        setPost(j.post as PostDetail);
        setLikes(j.counts?.likes ?? 0);
        setComments(j.counts?.comments ?? 0);
        setLiked(!!j.viewer?.liked);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load clip");
      }
    })();
    fetch(`/api/posts/${clipId}/view`, { method: "POST", cache: "no-store" })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clipId]);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((c) => c + (next ? 1 : -1));
    try {
      const r = await fetch(`/api/posts/${clipId}/like`, {
        method: next ? "POST" : "DELETE",
      });
      if (!r.ok) throw new Error("like");
    } catch {
      setLiked(!next);
      setLikes((c) => c + (next ? -1 : 1));
    }
  };
  const share = async () => {
    try {
      const url = `${window.location.origin}/posts/${encodeURIComponent(clipId)}`;
      if (navigator.share) {
        await navigator.share({ url, title: "Vibe clip" });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      /* dismissed */
    }
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play().catch(() => {});
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  const author = post?.author ?? null;
  // The media URL stored is an R2 key for clips — the unified
  // /api/posts/[id]/media endpoint 307s to a signed GET so the
  // <video src> can just point at it directly.
  const videoSrc = post ? `/api/posts/${clipId}/media` : null;
  const poster = post?.media_thumbnail_url ?? undefined;

  // ---------- lossless edit effects (read-side) ----------
  const editMeta = post?.edit_metadata ?? null;

  // Speed → playbackRate. Re-applies on metadata change AND when the
  // src becomes available (some browsers reset rate on srcChange).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = editMeta?.speed ?? 1;
  }, [editMeta?.speed, videoSrc]);

  // Trim → clamp playback inside [start_ms, end_ms]. timeupdate fires
  // ~250ms; seekToStart on first frame; loop back to start when we
  // cross end_ms instead of letting the file run past the trim.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const trim = editMeta?.trim ?? null;
    if (!trim) return;
    const startSec = trim.start_ms / 1000;
    const endSec = trim.end_ms / 1000;

    const onLoaded = () => {
      if (v.currentTime < startSec || v.currentTime > endSec) {
        try {
          v.currentTime = startSec;
        } catch {
          /* not yet seekable */
        }
      }
    };
    const onTimeUpdate = () => {
      if (v.currentTime >= endSec) {
        try {
          v.currentTime = startSec;
        } catch {
          /* ignore */
        }
      }
    };
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTimeUpdate);
    onLoaded();
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [editMeta?.trim, videoSrc]);

  // Track playback time so per-overlay timing (startMs/endMs) can gate
  // visibility. `timeupdate` fires ~4×/sec, which works most of the
  // time — but some iOS Safari clips stop firing it after a loop or
  // background tab. Belt-and-suspenders: also poll currentTime via
  // requestAnimationFrame so currentMs always tracks live playback,
  // even when timeupdate goes silent.
  const hasTimedOverlay = useMemo(
    () =>
      (editMeta?.text_overlays ?? []).some(
        (o) => o.startMs !== undefined || o.endMs !== undefined,
      ),
    [editMeta?.text_overlays],
  );
  useEffect(() => {
    if (!hasTimedOverlay) return;
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    let lastMs = -1;
    const tick = () => {
      const ms = Math.round(v.currentTime * 1000);
      // Only re-render on ≥50ms changes so the loop doesn't churn
      // setState every frame for the same value.
      if (Math.abs(ms - lastMs) >= 50) {
        lastMs = ms;
        setCurrentMs(ms);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [hasTimedOverlay, videoSrc]);

  // Filter preset → CSS `filter` string, applied inline on the <video>.
  const filterCss = editMeta?.filter ? FILTER_CSS[editMeta.filter] : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Clip"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "#000",
        display: "flex",
        flexDirection: "column",
        color: "#fff",
        overflow: "hidden",
      }}
    >
      {/* Video fills the whole viewport — object-fit:cover keeps the
          9:16 framing clean on any device aspect. Tap to toggle play. */}
      {videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          poster={poster}
          muted={muted}
          loop
          autoPlay
          playsInline
          preload="metadata"
          onClick={togglePlay}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            background: "#000",
            filter: filterCss,
          }}
        />
      ) : null}

      {/* Text overlays from edit_metadata — positioned in %-coords so
          they scale with the viewport. Pointer-events off so they
          don't intercept play/pause taps. Style comes from
          `getOverlayCss` so composer + viewer stay in lock-step.
          Per-overlay timing (startMs/endMs) gates visibility against
          the current playback ms. */}
      {editMeta?.text_overlays
        ?.filter((o) => isOverlayVisible(o, currentMs))
        .map((o) => (
          <div
            key={o.id}
            aria-hidden
            style={{
              position: "absolute",
              left: `${o.x}%`,
              top: `${o.y}%`,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              ...getOverlayCss(o),
            }}
          >
            {o.text}
          </div>
        ))}

      {/* Soft top/bottom vignette so the chrome stays readable over
          any video. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* Top bar — close + mute */}
      <header
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding:
            "calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={chromeButtonStyle}
        >
          ×
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => {
            const next = !muted;
            setMuted(next);
            if (videoRef.current) videoRef.current.muted = next;
          }}
          aria-label={muted ? "Unmute" : "Mute"}
          style={chromeButtonStyle}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        {canDelete ? (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close clip menu" : "Open clip menu"}
              aria-expanded={menuOpen}
              style={chromeButtonStyle}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <circle cx="3"  cy="8" r="1.5" fill="currentColor" />
                <circle cx="8"  cy="8" r="1.5" fill="currentColor" />
                <circle cx="13" cy="8" r="1.5" fill="currentColor" />
              </svg>
            </button>
            {menuOpen ? (
              <>
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
                    background: "rgba(28,28,30,0.92)",
                    backdropFilter: "blur(14px)",
                    WebkitBackdropFilter: "blur(14px)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: 12,
                    boxShadow:
                      "0 14px 30px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.18)",
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
                      color: "#FF7A6A",
                      cursor: deleting ? "default" : "pointer",
                    }}
                  >
                    {deleting ? "Deleting…" : "Delete clip"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Center play hint when paused */}
      {paused && videoSrc ? (
        <span
          aria-hidden
          onClick={togglePlay}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 72,
            height: 72,
            borderRadius: 999,
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            fontWeight: 700,
            backdropFilter: "blur(8px)",
            cursor: "pointer",
            zIndex: 3,
          }}
        >
          ▶
        </span>
      ) : null}

      {/* Side action stack (right edge) */}
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 90px)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          zIndex: 3,
        }}
      >
        <SideAction
          onTap={toggleLike}
          icon={<HeartIcon filled={liked} />}
          count={likes}
          activeColor={liked ? "#FF5C35" : undefined}
        />
        <SideAction
          icon={<ChatIcon />}
          count={comments}
          // No mobile comments drawer for clips in v1 — tap routes to
          // /posts/<id>, where the full post viewer mounts with the
          // comments drawer already expanded (no need to crowd the
          // vertical clip canvas with a second drawer).
          onTap={() => {
            window.location.href = `/posts/${encodeURIComponent(clipId)}`;
          }}
        />
        <SideAction
          onTap={share}
          icon={<ShareIcon />}
        />
      </div>

      {/* Bottom caption — author + content. Pulled in from the bottom
          edge of the safe area. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 72,
          bottom: 0,
          padding:
            "0 14px calc(env(safe-area-inset-bottom, 0px) + 16px)",
          zIndex: 3,
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
        }}
      >
        {author ? (
          <Link
            href={author.handle ? `/profile/${encodeURIComponent(author.handle)}` : "#"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px 6px 4px",
              borderRadius: 999,
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(10px)",
              color: "#fff",
              textDecoration: "none",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: author.avatar_url
                  ? `url(${author.avatar_url}) center/cover`
                  : "rgba(255,255,255,0.18)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Fraunces, serif",
                fontWeight: 800,
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              {!author.avatar_url ? initialsOf(author.name ?? author.handle) : null}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              {author.name ?? (author.handle ? `@${author.handle}` : "Member")}
            </span>
          </Link>
        ) : null}
        {post?.content ? (
          <p
            style={{
              margin: "0 0 6px 0",
              fontSize: 13,
              lineHeight: 1.45,
              maxWidth: 340,
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {renderInlineContent(post.content)}
          </p>
        ) : null}
        {post?.tags && post.tags.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {post.tags.slice(0, 4).map((t) => (
              <Link
                key={t}
                href={`/campus?tab=feed&tag=${encodeURIComponent(t)}`}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#FFB89C",
                  textDecoration: "none",
                }}
              >
                #{t}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#FFB1A8",
            fontSize: 14,
            zIndex: 4,
            padding: 24,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}

function SideAction({
  icon,
  count,
  onTap,
  activeColor,
}: {
  icon: React.ReactNode;
  count?: number;
  onTap: () => void;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        border: "none",
        color: activeColor ?? "#fff",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        textShadow: "0 1px 3px rgba(0,0,0,0.6)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: "rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(8px)",
        }}
      >
        {icon}
      </div>
      {typeof count === "number" ? <span>{formatCount(count)}</span> : null}
    </button>
  );
}

const chromeButtonStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(0,0,0,0.4)",
  color: "#fff",
  fontSize: 18,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={filled ? "#FF5C35" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

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
          style={{ color: "#FFB89C", fontWeight: 600, textDecoration: "none" }}
        >
          {token}
        </Link>,
      );
    } else if (sigil === "#") {
      nodes.push(
        <Link
          key={`h${key++}`}
          href={`/campus?tab=feed&tag=${encodeURIComponent(body)}`}
          style={{ color: "#FFB89C", fontWeight: 600, textDecoration: "none" }}
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

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}
