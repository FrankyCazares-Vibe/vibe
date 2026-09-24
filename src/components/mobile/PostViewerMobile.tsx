"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";

import { asLoadFailure, LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { EditPostSheet } from "@/components/mobile/EditPostSheet";
import { PostAudienceSheet } from "@/components/mobile/PostAudienceSheet";
import { SharePostSheet } from "@/components/mobile/SharePostSheet";
import type { PostAudienceKind } from "@/components/posts/PostAudienceList";
import {
  RemovedContentCard,
  ReportSheet,
  type ReportTargetRef,
} from "@/components/safety/ReportSheet";
import { copyText, vibeRequest } from "@/lib/feedback/request";
import { EDITED_LABEL, type EditedPost } from "@/lib/posts/edit";

/**
 * iOS-native mobile post viewer. Opens as a full-screen sheet from the
 * ProfileMobile Posts grid; ProfileMobile owns the open/close state.
 *
 * Layout:
 *   - Top bar (safe-area padded): close × + author avatar/name/handle
 *     + the post's relative timestamp.
 *   - Scrollable body: image or video (if any), content with @handle / #tag
 *     linkified, tag chips, then the engagement bar.
 *   - Engagement bar: Like (heart + count), Comment (chat + count),
 *     Repost (loop + count), Views (eye + count — public, and for the
 *     author a tap through to who they were), Saves (author only, when
 *     the count could be read), Save (bookmark), Share. Hits the same
 *     /api/posts/[id]/{like,repost,save,comments,view} endpoints the
 *     desktop FeedRow uses, so all the counts stay consistent across
 *     surfaces.
 *   - Comments drawer: collapsed by default; expand to render a flat
 *     list of comments + a sticky composer at the bottom. Replies are
 *     flattened into the same list (v1 — no nesting).
 *   - Owner ⋯ menu: Send to chats, Copy link, Edit post (EditPostSheet,
 *     plan §8 E2; shown only when the server says `is_owner`), Delete
 *     post. A saved edit patches the body, the #tag chips and the
 *     " · Edited" marker here, then tells the caller through `onEdited`.
 *     Until wave 4 wires `onEdited` into CampusMobile and ProfileMobile,
 *     the card underneath keeps its old text until the next load (critic
 *     W3 L9).
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
  /** Server-computed from the stored key; media_url itself is an opaque
   *  proxy path, so it can't tell an image from a video. */
  media_kind?: "video" | "image" | null;
  created_at: string;
  /** Set when a published post's text was edited (stamped by the database);
   *  null or absent = never edited. Drives the " · Edited" marker. */
  edited_at?: string | null;
  /**
   * A moderator took it down. OPTIONAL and never sent today:
   * `/api/posts/[id]` selects an explicit column list without `removed_at` or
   * `removed_reason`, and that route is not this batch's. Until it is, a
   * removed post still opens for its author as an ordinary one.
   */
  removed_at?: string | null;
  removed_reason?: string | null;
  author: Author | null;
};

type Comment = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  /** Same story as the post above: the comments route doesn't select these. */
  removed_at?: string | null;
  removed_reason?: string | null;
  author: { id: string; name: string | null; handle: string | null; avatar_url: string | null } | null;
};

/**
 * `saves` is OPTIONAL because the server omits the key rather than sending 0
 * when the bookmarks count can't be read (/api/posts/[id]): "nobody saved it"
 * and "we couldn't count" are different claims, and absent means no number is
 * shown at all. `views` is the honest ledger tally with the author's own rows
 * dropped — never `posts.view_count`.
 */
type Counts = {
  likes: number;
  comments: number;
  views: number;
  reposts: number;
  saves?: number;
};
type Viewer = { liked: boolean; saved: boolean };

/** A count we can't read as a finite number renders as 0, never as the word
 *  "undefined". Deliberately NOT applied to `saves`, whose absence is a claim
 *  of its own ("we couldn't count") and hides the entry instead. */
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function PostViewerMobile({
  postId,
  onClose,
  canDelete = false,
  viewerId = null,
  onDeleted,
  onEdited,
  onBlocked,
}: {
  postId: string;
  onClose: () => void;
  /** Who is reading, when the caller already knows (CampusMobile gets it off
   *  every feed answer). `/api/posts/[id]` never sends it, so without this the
   *  screen only learns the viewer from `is_owner` or from a comment they
   *  post — and a comment's Report stays hidden until then. */
  viewerId?: string | null;
  /** Show the kebab menu with a Delete action. Caller decides ownership;
   *  server still re-checks at /api/posts/[id] DELETE. */
  canDelete?: boolean;
  /** Fired after a successful delete; viewer auto-closes. Parent
   *  typically uses this to refresh its post grid. */
  onDeleted?: () => void;
  /** Fired after a block lands, just before the viewer closes. The blocked
   *  person's posts are still sitting in whatever list is underneath, so the
   *  caller reloads it — otherwise the viewer closes onto a feed that looks
   *  exactly as it did, which reads as the block not having worked. */
  onBlocked?: () => void;
  /** Fired after a saved edit, with the post's new text, tags and
   *  `edited_at`. The viewer has already updated itself; the caller patches
   *  its own list in place. No caller passes it yet (wave 4: CM, PM). */
  onEdited?: (p: EditedPost) => void;
}) {
  const [post, setPost] = useState<PostDetail | null>(null);
  const [counts, setCounts] = useState<Counts>({
    likes: 0,
    comments: 0,
    views: 0,
    reposts: 0,
  });
  const [viewer, setViewer] = useState<Viewer>({ liked: false, saved: false });
  // Server-computed (`is_owner` from /api/posts/[id]), not the `canDelete`
  // prop: only ProfileMobile passes that one, so on the feed and on a shared
  // link the author was treated as a stranger. The owner-only audience sheets
  // hang off this, and the routes behind them re-check ownership themselves.
  const [isOwner, setIsOwner] = useState(false);
  // What the report sheet is pointed at — the post, or one comment. One sheet
  // serves both, so the reason list and the copy can't drift between them.
  const [reportTarget, setReportTarget] = useState<ReportTargetRef | null>(null);
  const [blocking, setBlocking] = useState(false);
  // Who is reading. `/api/posts/[id]` answers `is_owner` but never a viewer
  // id, so this is learned two honest ways: the author's own id when the
  // server says the post is theirs, and the `user_id` on a comment they just
  // posted. Null means "we don't know", and a comment's ⋯ stays hidden rather
  // than offering a student Report on their own words (a 400 they'd only ever
  // read as "Couldn't send your report.").
  const [selfId, setSelfId] = useState<string | null>(null);
  // Which audience sheet is up, if any. Mounted only while open, so the
  // owner-only fetch never fires for a sheet nobody asked for.
  const [audienceKind, setAudienceKind] = useState<PostAudienceKind | null>(null);
  // Why the post didn't load; the body shows LoadFailed in its place.
  const [loadErr, setLoadErr] = useState<LoadFailure | null>(null);
  // Bumped by Retry to run the post load again.
  const [attempt, setAttempt] = useState(0);
  // Open the comments drawer by default when the viewer mounts —
  // tapping into a post almost always means the user wants to read /
  // join the conversation. The lazy-fetch effect below fires the
  // initial GET as soon as this becomes true.
  const [commentsOpen, setCommentsOpen] = useState(true);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentsErr, setCommentsErr] = useState<LoadFailure | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Whether the latest pointerdown landed on the app toast; the drawer's
  // onPointerDownOutside reads it (see the effect below).
  const toastTapRef = useRef(false);
  // A like request is out; toggleLike drops taps until it settles.
  const likingRef = useRef(false);

  const handleDelete = async () => {
    if (deleting) return;
    if (typeof window !== "undefined" && !window.confirm("Delete this post?")) {
      return;
    }
    setDeleting(true);
    // A refusal used to replace the whole post with the raw server error;
    // now the post stays up and the toast says why.
    const r = await vibeRequest(`/api/posts/${postId}`, {
      method: "DELETE",
      credentials: "include",
      failure: "Couldn't delete this post.",
    });
    if (!r.ok) {
      setDeleting(false);
      return;
    }
    onDeleted?.();
    onClose();
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

  // The app toast (ToastHost) floats above this sheet, so tapping it is a
  // tap outside the drawer and Radix would close the viewer, throwing away
  // the comment draft the toast is about. Note where each pointerdown lands
  // while the toast is still on the page: on touch, Radix only acts on the
  // click that follows, and by then the tap has already dismissed (removed)
  // the toast, so its target can't be checked there.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      toastTapRef.current =
        t instanceof Element && t.closest('[role="alert"], [role="status"]') !== null;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  // Fetch the single post + counts + viewer state in one roundtrip. A
  // failure shows LoadFailed with Retry (a deleted post reads "That's no
  // longer available.") where the raw server error used to sit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{
        post?: PostDetail;
        counts?: Counts;
        viewer?: Viewer;
        is_owner?: boolean;
      }>(`/api/posts/${postId}`, {
        cache: "no-store",
        quiet: true,
        failure: "Couldn't load this post.",
      });
      if (cancelled) return;
      if (!r.ok || !r.data.post) {
        setLoadErr(asLoadFailure(r, "Couldn't load this post."));
        return;
      }
      setLoadErr(null);
      setPost(r.data.post);
      // `vibeRequest` casts the parsed body to the declared type without
      // checking it (src/lib/feedback/request.ts: `(parsed ?? {}) as T`), so a
      // payload missing a key — a cached pre-wave-A response, a rollback —
      // would print the literal word "undefined" beside an icon. Coerce here,
      // once, rather than at each call site. `saves` keeps its three-way
      // meaning: a number, or absent = "we couldn't count", which shows as
      // nothing at all rather than as 0.
      if (r.data.counts) {
        const c = r.data.counts as Partial<Counts>;
        setCounts({
          likes: num(c.likes),
          comments: num(c.comments),
          views: num(c.views),
          reposts: num(c.reposts),
          ...(typeof c.saves === "number" && Number.isFinite(c.saves)
            ? { saves: c.saves }
            : {}),
        });
      }
      if (r.data.viewer) setViewer(r.data.viewer);
      // Fails closed: anything but an explicit true leaves the owner-only
      // affordances off.
      setIsOwner(r.data.is_owner === true);
      // The one place this screen can learn who is reading it.
      if (r.data.is_owner === true && r.data.post.author?.id) {
        setSelfId(r.data.post.author.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, attempt]);

  // Fires the per-day-deduped /view endpoint so view counts get
  // attributed even when the post is opened from a profile, not the
  // feed. Its own effect, so a Retry of the load doesn't ping again.
  useEffect(() => {
    // Fire and forget the view ping — server dedupes per-user-per-day.
    fetch(`/api/posts/${postId}/view`, { method: "POST", cache: "no-store" })
      .catch(() => {});
  }, [postId]);

  // Lazy-fetch comments the first time the drawer opens. A failure waits
  // in `commentsErr` until Retry clears it, which runs this again.
  useEffect(() => {
    if (!commentsOpen || comments !== null || commentsErr) return;
    let cancelled = false;
    (async () => {
      const r = await vibeRequest<{ comments?: unknown }>(
        `/api/posts/${postId}/comments?limit=80`,
        { cache: "no-store", quiet: true, failure: "Couldn't load the comments." },
      );
      if (cancelled) return;
      if (!r.ok || !Array.isArray(r.data.comments)) {
        setCommentsErr(asLoadFailure(r, "Couldn't load the comments."));
        return;
      }
      // Flatten roots + replies into one chronological list so the
      // mobile drawer reads top-to-bottom without indentation gymnastics.
      const flat: Comment[] = [];
      for (const root of r.data.comments as Array<Comment & { replies?: Comment[] }>) {
        flat.push(root);
        for (const rep of root.replies ?? []) flat.push(rep);
      }
      setComments(flat);
    })();
    return () => {
      cancelled = true;
    };
  }, [commentsOpen, comments, commentsErr, postId]);

  // The heart flips first. A refusal (Terms not accepted, liking too fast, a
  // post that's gone) used to flip it back without a word; now it goes back
  // to exactly what it was and the toast says why, the same as the feed card
  // (CampusMobile). One request at a time, so a fast double tap can't send
  // two requests that each roll the count back by one.
  const toggleLike = async () => {
    if (likingRef.current) return;
    likingRef.current = true;
    const next = !viewer.liked;
    const prevLiked = viewer.liked;
    const prevLikes = counts.likes;
    setViewer((v) => ({ ...v, liked: next }));
    setCounts((c) => ({ ...c, likes: Math.max(0, c.likes + (next ? 1 : -1)) }));
    const r = await vibeRequest(`/api/posts/${postId}/like`, {
      method: next ? "POST" : "DELETE",
      failure: next ? "Couldn't like this post." : "Couldn't unlike this post.",
    });
    if (!r.ok) {
      setViewer((v) => ({ ...v, liked: prevLiked }));
      setCounts((c) => ({ ...c, likes: prevLikes }));
    }
    likingRef.current = false;
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
    // a re-post by the same user as a no-op. Nothing on screen changes,
    // so the toast is the only sign it worked (or was refused).
    await vibeRequest(`/api/posts/${postId}/repost`, {
      method: "POST",
      json: {},
      failure: "Couldn't repost this.",
      success: "Reposted",
    });
  };
  const share = async () => {
    try {
      const url = `${window.location.origin}/posts/${encodeURIComponent(postId)}`;
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
    // Confirm, then paint: on a refusal the toast says why, the draft
    // stays in the box and Post re-enables.
    const r = await vibeRequest<{ comment?: Comment }>(`/api/posts/${postId}/comments`, {
      method: "POST",
      json: { content: text },
      failure: "Couldn't post your comment.",
    });
    if (r.ok) {
      const posted = r.data.comment;
      // Onto a loaded list only: alone in a list that never loaded, it would
      // read as the only comment. A failed load runs again and picks it up.
      if (posted) setComments((prev) => (prev ? [...prev, posted] : prev));
      // Their own comment names them, which is how a stranger's post learns
      // the viewer's id without a second request.
      if (posted?.user_id) setSelfId(posted.user_id);
      setCommentsErr(null);
      setCounts((c) => ({ ...c, comments: c.comments + 1 }));
      setDraft("");
    }
    setPosting(false);
  };

  const author = post?.author ?? null;
  const authorHandle = author?.handle ?? null;
  // ONE owner flag for the whole screen. The engagement bar keys on the
  // server's `is_owner`, so keying the ⋯ menu on the caller-supplied
  // `canDelete` alone would offer the author "Report post" on their own post
  // while the bar right above it shows them their own viewers — CampusMobile
  // and PostPageClient both omit the prop. `canDelete` stays in the OR so
  // ProfileMobile's optimistic-removal path is untouched, and deleting still
  // fails closed server-side (DELETE /api/posts/[id] re-checks ownership).
  const owner = canDelete || isOwner;
  // The caller's answer wins; `selfId` is what this screen worked out for
  // itself. Either way, null means "we don't know" and the ⋯ stays away.
  const me = viewerId ?? selfId;
  const authorLabel =
    author?.name || (author?.handle ? `@${author.handle}` : null);

  // "Block author", next to Report in the ⋯ menu. The phone viewer offered a
  // report and no way to stop seeing the person.
  const blockAuthor = async () => {
    const id = author?.id;
    if (!id || blocking) return;
    const who = authorLabel || "this person";
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Block ${who}?\n\nThey won't be able to message you, see your posts, or find you in search. You also won't see their content.`,
      )
    )
      return;
    setBlocking(true);
    const r = await vibeRequest("/api/me/block", {
      json: { target_id: id },
      failure: `Couldn't block ${who}.`,
      success: `Blocked ${who}`,
    });
    setBlocking(false);
    // A refusal said why in a toast; the viewer stays where it is.
    if (!r.ok) return;
    // Tell the list underneath before closing onto it.
    onBlocked?.();
    onClose();
  };
  // media_url is a /api/posts/[id]/media proxy path, so a `clips/` sniff
  // would call every video an image — trust the server's media_kind.
  const isImage =
    post && post.media_url && post.media_kind !== "video" && post.type === "post";
  // Video posts and clips alike, as the desktop feed plays both: a clip's
  // share link (/posts/<id>) lands here on every viewport.
  const isVideo = post && post.media_url && post.media_kind === "video";

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
          // Tapping a toast only clears the toast; see toastTapRef. vaul runs
          // this first and skips the close once it's default-prevented.
          onPointerDownOutside={(e) => {
            if (toastTapRef.current) e.preventDefault();
          }}
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: "100%",
            // SharePostSheet ("Send to chats", below) portals to <body> too,
            // so it's a sibling of this drawer and only z-index separates
            // them: it sits at 10400/10401 to land above this.
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
                {post?.created_at
                  ? `${author.handle ? " · " : ""}${relTime(post.created_at)}${post.edited_at ? ` · ${EDITED_LABEL}` : ""}`
                  : ""}
              </div>
            </div>
          </Link>
        ) : (
          <div style={{ flex: 1 }} />
        )}
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
                  minWidth: 180,
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
                <ViewerMenuItem
                  label="Send to chats"
                  onClick={() => {
                    setMenuOpen(false);
                    setShareOpen(true);
                  }}
                />
                <ViewerMenuItem
                  label="Copy link"
                  onClick={() => {
                    setMenuOpen(false);
                    // Straight from the tap, so the clipboard still counts it
                    // as the student's gesture; toasts "Link copied" or why not.
                    void copyText(
                      `${window.location.origin}/posts/${encodeURIComponent(postId)}`,
                    );
                  }}
                />
                {!owner ? (
                  <ViewerMenuItem
                    label="Report post"
                    tone="danger"
                    onClick={() => {
                      setMenuOpen(false);
                      // Was a one-tap `reason_code: "other"` with no picker.
                      setReportTarget({
                        type: "post",
                        id: postId,
                        authorId: author?.id ?? null,
                        authorName: authorLabel,
                      });
                    }}
                  />
                ) : null}
                {!owner && author?.id ? (
                  <ViewerMenuItem
                    label={blocking ? "Blocking…" : "Block author"}
                    tone="danger"
                    disabled={blocking}
                    onClick={() => {
                      setMenuOpen(false);
                      void blockAuthor();
                    }}
                  />
                ) : null}
                {/* The server's `is_owner` only, never `canDelete`: ProfileMobile
                    passes canDelete on your own profile, where the Saved and
                    Reposts tabs open OTHER people's posts in this viewer. */}
                {isOwner ? (
                  <ViewerMenuItem
                    label="Edit post"
                    disabled={!post}
                    onClick={() => {
                      setMenuOpen(false);
                      setEditOpen(true);
                    }}
                  />
                ) : null}
                {owner ? (
                  <ViewerMenuItem
                    label={deleting ? "Deleting…" : "Delete post"}
                    tone="danger"
                    disabled={deleting}
                    onClick={() => {
                      setMenuOpen(false);
                      void handleDelete();
                    }}
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </div>
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
        {loadErr ? (
          <div style={{ paddingTop: 18 }}>
            <LoadFailed
              failure={loadErr}
              onRetry={() => {
                setLoadErr(null);
                setAttempt((n) => n + 1);
              }}
            />
          </div>
        ) : !post ? (
          <PostViewerSkeleton />
        ) : owner && post.removed_at ? (
          // The author's own view, gated the same way the other four are
          // (campus-home's feed card, CampusMobile's card, the CommentRow
          // below, MessagesMobile's bubble). RLS already means only the
          // author is served a removed post, but the card's own sentence is
          // "Only you can see this post" — one service-client branch added to
          // `/api/posts/[id]` and a stranger opening a shared link would be
          // told a moderator removed it and that they alone can see it.
          // Unreachable today either way: that route does not select
          // `removed_at` (see the PostDetail type).
          <RemovedContentCard
            kind="post"
            removedAt={post.removed_at}
            removedReason={post.removed_reason}
          />
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

            {isVideo ? (
              <video
                src={post.media_url ?? undefined}
                controls
                playsInline
                preload="metadata"
                poster={post.media_thumbnail_url ?? undefined}
                // The drawer closes on a sideways drag, and scrubbing the
                // timeline is one, so keep vaul's drag handling off it.
                data-vaul-no-drag
                style={{
                  width: "100%",
                  maxHeight: "70vh",
                  borderRadius: 14,
                  border: "1px solid rgba(28,28,30,0.06)",
                  background: "#000",
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

            {/* Engagement bar. Spacing is tighter than the four-item bar it
                grew out of: with Views — and, on the author's own post, the
                saves count — this carries six items, and at the old
                18px + 8px-a-side it pushed Save off a 375px screen, which
                (the body scrolls vertically) would have let the whole post
                slide sideways. It wraps rather than overflowing if a count
                ever runs to four digits. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                columnGap: 12,
                rowGap: 8,
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
              {/* Views. The number is public — the feed card shows it to
                  everyone — so it renders on every viewport for every
                  reader. Only the author can tap through to the people
                  behind it: counts are public, identities are private. */}
              {isOwner ? (
                <EngagementButton
                  label={String(counts.views)}
                  ariaLabel={`${counts.views} views — see who saw this`}
                  onTap={() => setAudienceKind("viewers")}
                  icon={<EyeIcon />}
                />
              ) : (
                <EngagementStat label={String(counts.views)} icon={<EyeIcon />} />
              )}
              {/* Saves, author only. Absent means the count couldn't be read,
                  and an unread count shows as nothing rather than as 0. It
                  counts OTHER people (the author's own bookmark is excluded),
                  which is why tapping Save below never moves it. It sits with
                  Views, on the left: both are the author's own numbers, it
                  keeps the bar's icon-then-count pattern (a bare trailing
                  number reads as belonging to the eye beside it), and it puts
                  a gap between it and the Save toggle — two adjacent small
                  targets, one of which writes a bookmark. */}
              {isOwner && typeof counts.saves === "number" && counts.saves > 0 ? (
                <EngagementButton
                  label={String(counts.saves)}
                  ariaLabel={`${counts.saves} saves — see who saved this`}
                  onTap={() => setAudienceKind("savers")}
                  icon={<BookmarkIcon />}
                />
              ) : null}
              {/* `margin-left:auto` rather than a `flex:1` spacer element: the
                  spacer only grows AFTER lines are formed, so when the bar
                  wraps it would strand Save at the far left of line 2 while
                  pushing the last left-hand item to the far right of line 1.
                  An auto margin is resolved per line, so Save keeps the right
                  edge of whichever line it lands on. */}
              <div
                style={{
                  marginLeft: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  columnGap: 12,
                }}
              >
                <EngagementButton
                  label=""
                  active={viewer.saved}
                  onTap={toggleSave}
                  activeColor="#1C1C1E"
                  icon={<BookmarkIcon filled={viewer.saved} />}
                />
              </div>
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
                  commentsErr ? (
                    <LoadFailed
                      compact
                      failure={commentsErr}
                      onRetry={() => setCommentsErr(null)}
                    />
                  ) : (
                    <div style={{ color: "#8A8580", fontSize: 13, padding: "12px 0" }}>
                      Loading…
                    </div>
                  )
                ) : comments.length === 0 ? (
                  <div style={{ color: "#8A8580", fontSize: 13, padding: "12px 0" }}>
                    Be the first to comment.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {comments.map((c) => (
                      <CommentRow
                        key={c.id}
                        c={c}
                        isMine={!!me && c.user_id === me}
                        // Hidden while we don't know who is reading: the
                        // route answers a report on your own comment with a
                        // 400 the student never sees as a sentence.
                        onReport={
                          me && c.user_id !== me
                            ? () =>
                                setReportTarget({
                                  type: "comment",
                                  id: c.id,
                                  authorId: c.author?.id ?? c.user_id,
                                  authorName:
                                    c.author?.name ||
                                    (c.author?.handle ? `@${c.author.handle}` : null),
                                })
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Composer — sticky at the bottom over the body's bottom padding.
          Not under a post that didn't load: there's nothing to reply to. */}
      {commentsOpen && !loadErr ? (
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

      {shareOpen ? (
        <SharePostSheet
          postId={postId}
          postTitle={post?.content ?? ""}
          postPosterUrl={
            (post && "media_thumbnail_url" in post
              ? (post as { media_thumbnail_url?: string | null }).media_thumbnail_url
              : null) ??
            (post && "media_url" in post
              ? (post as { media_url?: string | null }).media_url
              : null) ??
            null
          }
          authorName={
            author?.name ||
            (author?.handle ? `@${author.handle}` : null)
          }
          // This sheet sits inside the viewer's own open drawer. Without
          // `nested`, closing it hands the page's scroll position back and
          // clears vaul's body-lock while the viewer is still full-screen —
          // iOS Safari only. See the Nesting note in SharePostSheet.
          nested
          onClose={() => setShareOpen(false)}
        />
      ) : null}

      {/* Edit post, author only (the menu item keys on `is_owner`). Mounted
          only while open, `nested` for the same vaul body-lock reason as the
          share sheet. The PATCH route re-checks ownership (and club officer
          role). */}
      {editOpen && post ? (
        <EditPostSheet
          nested
          postId={postId}
          initialContent={post.content ?? ""}
          hasMedia={!!post.media_url}
          onClose={() => setEditOpen(false)}
          onSaved={(p) => {
            setPost((prev) =>
              prev
                ? { ...prev, content: p.content, tags: p.tags, edited_at: p.edited_at }
                : prev,
            );
            onEdited?.(p);
          }}
        />
      ) : null}

      {/* Who saw / who saved. Mounted only while open — the owner-only fetch
          behind it should never run for a sheet nobody asked for — and
          `nested` for the same vaul body-lock reason as the share sheet. */}
      {audienceKind ? (
        <PostAudienceSheet
          postId={postId}
          kind={audienceKind}
          nested
          onClose={() => setAudienceKind(null)}
        />
      ) : null}

      {/* One report sheet for the post and for any comment. `nested` for the
          same vaul body-lock reason as the share sheet. */}
      {reportTarget ? (
        <ReportSheet
          variant="sheet"
          nested
          target={reportTarget}
          onClose={() => setReportTarget(null)}
          // Block offered after a report lands reaches the list underneath
          // too, the same as the ⋯ menu's own Block author.
          onBlocked={() => onBlocked?.()}
        />
      ) : null}
    </Drawer.Root>
  );
}

/** Row in the 3-dot dropdown menu. Centralizes the menu-item style so
 *  Copy link / Report / Delete all read the same. */
function ViewerMenuItem({
  label,
  onClick,
  tone,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  tone?: "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        if (!disabled) onClick();
      }}
      disabled={disabled}
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
        color: tone === "danger" ? "#C42B1C" : "#1C1C1E",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );
}

function CommentRow({
  c,
  isMine = false,
  onReport,
}: {
  c: Comment;
  /** The viewer wrote it — the only person the row is served to once it has
   *  been removed, and the one person who is never offered Report. */
  isMine?: boolean;
  /** Absent when reporting doesn't apply (their own comment, or we can't
   *  tell who is reading): no ⋯ is drawn at all. */
  onReport?: () => void;
}) {
  const a = c.author;
  // Unreachable today: `/api/posts/[id]/comments` selects an explicit column
  // list with neither `removed_at` nor `removed_reason`.
  if (isMine && c.removed_at) {
    return (
      <RemovedContentCard
        kind="comment"
        compact
        removedAt={c.removed_at}
        removedReason={c.removed_reason}
      />
    );
  }
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
      {onReport ? (
        <button
          type="button"
          onClick={onReport}
          aria-label="Report this comment"
          style={{
            flexShrink: 0,
            // 32px of thumb around a glyph that reads as a hairline.
            width: 32,
            height: 32,
            marginTop: -4,
            marginRight: -6,
            background: "transparent",
            border: "none",
            color: "#8A8580",
            fontSize: 15,
            lineHeight: 1,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          ⋯
        </button>
      ) : null}
    </div>
  );
}

/** One item in the engagement bar, so the tappable and the static entries
 *  (below) can't drift apart. `cursor` is the only difference. */
function engagementItemStyle(color: string, tappable: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    // 4px a side, not 8: see the bar's own note — six items have to fit a
    // 375px phone without the post being able to scroll sideways.
    padding: "6px 4px",
    background: "transparent",
    border: "none",
    color,
    fontFamily: "DM Sans, sans-serif",
    fontSize: 13,
    fontWeight: 600,
    cursor: tappable ? "pointer" : "default",
  };
}

function EngagementButton({
  label,
  icon,
  onTap,
  active,
  activeColor,
  ariaLabel,
}: {
  label: string;
  icon: React.ReactNode;
  onTap: () => void;
  active?: boolean;
  activeColor?: string;
  /** For a button whose visible text is only a number — "12" says nothing
   *  about what tapping it does. */
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={ariaLabel}
      style={engagementItemStyle(active && activeColor ? activeColor : "#5C5853", true)}
    >
      {icon}
      {label ? <span>{label}</span> : null}
    </button>
  );
}

/** The non-interactive twin: a number that is worth reading but leads
 *  nowhere. Not a disabled <button> — there is no action to disable, and a
 *  disabled control is skipped by the screen reader that should still hear
 *  the count. */
function EngagementStat({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <span style={engagementItemStyle("#5C5853", false)}>
      {icon}
      {label ? <span>{label}</span> : null}
    </span>
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
/** The same eye the desktop feed row draws (campus-home.tsx EyeIcon), at this
 *  bar's 18px so it sits level with the heart and the bookmark beside it. Its
 *  own 16-unit viewBox comes along, so the shape is identical, not a redraw. */
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
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
