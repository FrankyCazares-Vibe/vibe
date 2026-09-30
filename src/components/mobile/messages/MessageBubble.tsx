"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { RemovedContentCard } from "@/components/safety/ReportSheet";

import { initialsOf, quotedBody } from "./format";
import { ReactionPicker } from "./ReactionPicker";
import { type MessageRow } from "./types";

export function MessageBubble({
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
  onReport,
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
   *  cream, or Night's paper with no backdrop: ConversationView's
   *  `onDark`) — flips sender name color and bubble style to
   *  white-on-glass. */
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
  /** "⚑ Report" in the same picker. Never passed for the viewer's own
   *  message: the route answers that with a 400 the student never reads as a
   *  sentence. */
  onReport?: () => void;
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

  // A ⋯ beside the bubble, opening the same picker the long press opens.
  // Report lived only behind that hold: nothing on the screen named it, and
  // holding a bubble still for half a second is the hardest thing this thread
  // asks of a thumb. It shows on someone else's message only — which is
  // exactly where the picker has a Report to offer (never on the viewer's
  // own, never on a row still sending, both already decided by `onReport`).
  const showMore = !!onReport && !message.id.startsWith("temp_");
  const moreButton = showMore ? (
    <button
      type="button"
      aria-label="Message actions"
      aria-expanded={pickerOpen}
      onClick={(e) => {
        e.stopPropagation();
        setPickerOpen(true);
      }}
      style={{
        flexShrink: 0,
        width: 32,
        height: 32,
        marginBottom: 2,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // The reaction chip's own surface, so it reads as part of the thread
        // rather than a control bolted onto it.
        background: darkMode ? "rgba(20,16,28,0.55)" : "rgba(255,255,255,0.78)",
        border: darkMode
          ? "1px solid rgba(255,255,255,0.10)"
          : "1px solid rgba(28,28,30,0.08)",
        color: darkMode ? "rgba(255,255,255,0.72)" : "#8A8580",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 15,
        fontWeight: 700,
        lineHeight: 1,
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span aria-hidden>⋯</span>
    </button>
  ) : null;

  // A moderator took this message down. Only its sender is served the row at
  // all, so this card is theirs. Unreachable today —
  // `/api/me/threads/[id]/messages` does not select `removed_at`.
  if (isMine && message.removed_at) {
    return (
      <div style={{ marginTop: topGap, display: "flex", justifyContent: "flex-end" }}>
        <div style={{ maxWidth: "min(300px, 86%)" }}>
          <RemovedContentCard
            kind="message"
            compact
            removedAt={message.removed_at}
            removedReason={message.removed_reason}
          />
        </div>
      </div>
    );
  }

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
            the stub carries the long-press handlers. The ⋯ sits beside
            the stack, at the bottom of it, so a long message doesn't
            push it off the far side of a 375px screen. */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: isMine ? "flex-end" : "flex-start",
              gap: 4,
              minWidth: 0,
            }}
          >
            {quote}
            {captionAbove ? textBubble : null}
            {media}
            {card}
            {captionAbove ? null : textBubble}
            {isEmpty ? noticeTile("Attachment") : null}
          </div>
          {moreButton}
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
            // Same temp_ guard: a row still sending has no id to report.
            onReport={
              onReport && !message.id.startsWith("temp_")
                ? () => {
                    setPickerOpen(false);
                    onReport();
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
