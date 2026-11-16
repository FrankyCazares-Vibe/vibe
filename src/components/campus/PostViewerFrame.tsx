"use client";

/**
 * The profile's post popup on the campus feed, on a computer (Nov 16, 2026).
 *
 * Franky: a photo in the feed should open "just like how you can open them on
 * profiles". The profile's popup is public/html/_postViewer.js, a static
 * script whose buttons are inline onclick handlers, and the React pages'
 * browser code rule refuses those (src/lib/security/csp.ts). So the popup
 * runs in its own small static page, public/html/post-viewer.html, shown in
 * a full-window frame over the feed; the same approach as the Messages pane.
 *
 * The frame loads on first need (a pointer over a photo, else the click),
 * stays mounted, hidden, between opens, and speaks postMessage with this
 * file only, same origin:
 *   here → frame: open { id, prefill }
 *   frame → here: ready | closed { id, counts } | deleted { id } |
 *                 edited { id, content, tags, edited_at }
 * post-viewer.html writes the same names by hand; change both together.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { toast } from "@/lib/feedback/toast";
import type { EditedPost } from "@/lib/posts/edit";

export const POST_VIEWER_FRAME_SRC = "/html/post-viewer.html?app=1";
const SOURCE = "vibe-post-viewer";
/** How long a click waits for the frame before giving up on it. */
const READY_TIMEOUT_MS = 8000;

/** What the popup paints before the server answers (its renderFromPrefill). */
export type PostViewerPrefill = {
  id: string;
  type?: string;
  content?: string;
  tags?: string[];
  media_url?: string;
  media_thumbnail_url?: string;
  media_kind?: string | null;
  created_at?: string;
  edited_at?: string | null;
  author?: { name?: string | null; handle?: string | null; avatar_url?: string | null } | null;
  org?: { name?: string | null } | null;
};

/** The counts the student left the popup with; null when it never loaded. */
export type PostViewerCounts = { liked: boolean; likes: number; saved: boolean; comments: number };

export type PostViewerFrameEvents = {
  onDeleted: (postId: string) => void;
  onEdited: (post: EditedPost) => void;
  onClosed: (postId: string, counts: PostViewerCounts | null) => void;
};

type FrameApi = {
  /** Start loading the frame, so the first open is quick. */
  warm: () => void;
  open: (prefill: PostViewerPrefill) => void;
};

const PostViewerFrameContext = createContext<FrameApi | null>(null);

/** The feed's opener, or null outside a PostViewerFrameProvider. */
export function usePostViewerFrame(): FrameApi | null {
  return useContext(PostViewerFrameContext);
}

type FrameMessage = {
  source?: unknown;
  v?: unknown;
  type?: unknown;
  id?: unknown;
  counts?: unknown;
  content?: unknown;
  tags?: unknown;
  edited_at?: unknown;
};

function countsFrom(raw: unknown): PostViewerCounts | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  const likes = num(c.likes);
  const comments = num(c.comments);
  if (likes === null || comments === null) return null;
  return { liked: c.liked === true, likes, saved: c.saved === true, comments };
}

export function PostViewerFrameProvider({
  children,
  onDeleted,
  onEdited,
  onClosed,
}: PostViewerFrameEvents & { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const readyRef = useRef(false);
  const pendingRef = useRef<PostViewerPrefill | null>(null);
  const events = useRef<PostViewerFrameEvents>({ onDeleted, onEdited, onClosed });
  useEffect(() => {
    events.current = { onDeleted, onEdited, onClosed };
  }, [onDeleted, onEdited, onClosed]);

  const send = useCallback((prefill: PostViewerPrefill) => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ source: SOURCE, v: 1, type: "open", id: prefill.id, prefill }, window.location.origin);
    // Escape and the comment box answer the keyboard inside the frame.
    frameRef.current?.focus();
  }, []);

  const warm = useCallback(() => setMounted(true), []);
  // A frame that never says "ready" (signed out meanwhile, or a page the
  // proxy sent elsewhere) must not sit over the feed: drop it and say so.
  const readyTimer = useRef<number | null>(null);
  const clearReadyTimer = useCallback(() => {
    if (readyTimer.current !== null) window.clearTimeout(readyTimer.current);
    readyTimer.current = null;
  }, []);
  const open = useCallback(
    (prefill: PostViewerPrefill) => {
      setMounted(true);
      setOpenId(prefill.id);
      if (readyRef.current) {
        send(prefill);
        return;
      }
      pendingRef.current = prefill;
      clearReadyTimer();
      readyTimer.current = window.setTimeout(() => {
        readyTimer.current = null;
        if (readyRef.current) return;
        pendingRef.current = null;
        setOpenId(null);
        setMounted(false);
        toast({ message: "Couldn't open this post. Try again.", tone: "error" });
      }, READY_TIMEOUT_MS);
    },
    [send, clearReadyTimer],
  );
  useEffect(() => clearReadyTimer, [clearReadyTimer]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (!frameRef.current || e.source !== frameRef.current.contentWindow) return;
      const d = e.data as FrameMessage | null;
      if (!d || d.source !== SOURCE || d.v !== 1) return;
      const id = typeof d.id === "string" ? d.id : null;
      switch (d.type) {
        case "ready": {
          readyRef.current = true;
          clearReadyTimer();
          const pending = pendingRef.current;
          pendingRef.current = null;
          if (pending) send(pending);
          break;
        }
        case "closed":
          setOpenId(null);
          if (id) events.current.onClosed(id, countsFrom(d.counts));
          break;
        case "deleted":
          if (id) events.current.onDeleted(id);
          break;
        case "edited":
          if (id && typeof d.content === "string") {
            events.current.onEdited({
              id,
              content: d.content,
              tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === "string") : [],
              edited_at: typeof d.edited_at === "string" ? d.edited_at : null,
            });
          }
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send, clearReadyTimer]);

  // The feed under the popup doesn't scroll while it's open.
  const isOpen = openId !== null;
  useEffect(() => {
    if (!isOpen) return;
    const el = document.documentElement;
    const before = el.style.overflow;
    el.style.overflow = "hidden";
    return () => {
      el.style.overflow = before;
    };
  }, [isOpen]);

  const api = useMemo(() => ({ warm, open }), [warm, open]);

  return (
    <PostViewerFrameContext.Provider value={api}>
      {children}
      {mounted && typeof document !== "undefined"
        ? createPortal(
            <iframe
              ref={frameRef}
              src={POST_VIEWER_FRAME_SRC}
              title="Post"
              // An open post is something in progress: BuildRefresh doesn't
              // reload the page under it (src/lib/build/page-snapshot.ts).
              data-holds-reload={isOpen || undefined}
              aria-hidden={!isOpen}
              tabIndex={isOpen ? 0 : -1}
              style={{
                position: "fixed",
                inset: 0,
                width: "100%",
                height: "100%",
                border: 0,
                // See-through needs the frame's color-scheme to match its
                // page's (a mismatch paints an opaque canvas): both follow
                // data-theme, so this one is left to inherit.
                background: "transparent",
                // Over the app's menu (10000), under the coral cursor.
                zIndex: 2147483000,
                visibility: isOpen ? "visible" : "hidden",
                pointerEvents: isOpen ? "auto" : "none",
              }}
            />,
            document.body,
          )
        : null}
    </PostViewerFrameContext.Provider>
  );
}
