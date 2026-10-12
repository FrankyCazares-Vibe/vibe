"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ImageCropperModal } from "@/components/ImageCropperModal";
import {
  bindMentionPicker,
  capturePosterFrame,
  extractHashtags,
} from "@/lib/composer/helpers";
import type { ToastAction } from "@/lib/feedback/failure-copy";
import { vibeRequest, type VibeFailure } from "@/lib/feedback/request";
import { VIDEO_LOCATION_HINT } from "@/lib/media/copy";

/**
 * Mobile composer sheet — text + photo + horizontal video posts.
 * Clips (vertical 9:16, ≤120s) have their own TikTok-style composer
 * on the Clips tab; this sheet is for the Posts feed only. Shared
 * upload + classification logic lives in @/lib/composer/helpers.
 *
 * UX: full-viewport sheet that slides up from the bottom. Top bar holds
 * Cancel / Post; body is a textarea + attachment preview; bottom action
 * row holds the paperclip. iOS keyboard pushes the sheet up naturally
 * since the sheet uses `inset:0` not `bottom:0`.
 */
type Props = {
  onClose: () => void;
  /** Fired after a successful publish. Caller refetches their feed. */
  onPosted: () => void;
  /**
   * Origin point (viewport-space px) the sheet should grow OUT OF on
   * open, and shrink BACK INTO on close. Typically the centre of the
   * FAB that launched the composer. If omitted, falls back to the
   * bottom-right corner.
   */
  origin?: { x: number; y: number };
};

// Keyframe registry — injected once per page on first mount. We animate
// `clip-path: circle(...)` from a small disc centered on the FAB to a
// disc that covers the viewport (radius > diagonal), so the sheet
// reads as growing OUT OF the button that launched it. The reverse on
// close shrinks the sheet back into the button.
//
// clip-path's `at <x> <y>` accepts CSS variables, and only the radius
// interpolates between keyframes — so we keep the origin fixed via
// --vibe-composer-x / --vibe-composer-y on the element and only the
// disc size changes.
const KEYFRAMES_ID = "vibe-composer-keyframes";
function ensureKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes vibeComposerExpand {
      from {
        clip-path: circle(28px at var(--vibe-composer-x, 100%) var(--vibe-composer-y, 100%));
        opacity: 0.6;
      }
      to {
        clip-path: circle(150% at var(--vibe-composer-x, 100%) var(--vibe-composer-y, 100%));
        opacity: 1;
      }
    }
    @keyframes vibeComposerCollapse {
      from {
        clip-path: circle(150% at var(--vibe-composer-x, 100%) var(--vibe-composer-y, 100%));
        opacity: 1;
      }
      to {
        clip-path: circle(28px at var(--vibe-composer-x, 100%) var(--vibe-composer-y, 100%));
        opacity: 0.4;
      }
    }
  `;
  document.head.appendChild(style);
}

const ENTER_DURATION_MS = 460;
const EXIT_DURATION_MS = 300;

// What the sheet says when posting fails. The calls to Vibe's own routes go
// through vibeRequest, which words a refusal itself (signed out, Terms,
// school email, the word filter, going too fast) and falls back to the
// caller's line. The student never reads a caught error's own text
// ("Load failed", "Unauthorized", "Invalid JSON").
const PUBLISH_FAILED = "Couldn't publish your post.";
const PHOTO_UPLOAD_FAILED = "Your photo didn't upload.";
const VIDEO_UPLOAD_FAILED = "Your video didn't upload.";
// The video goes straight to storage, not through a Vibe route, so
// vibeRequest never sees that step. A failed one gets this fixed line.
const VIDEO_STORAGE_FAILED = "Your video didn't upload. Check your connection and try again.";
const VIDEO_WRONG_TYPE = "Use an MP4, MOV or WebM video.";
const VIDEO_TOO_LONG = "That video is too long to post. Try a shorter one.";

/**
 * The two refusals a student fixes by picking another video. The routes word
 * them for developers ("Unsupported video type (mp4, mov, webm only)" from
 * /api/me/clip-upload-url, "Video exceeds 600s" from /api/me/publish-post) and
 * vibeRequest shows a 400 as the caller's general line, so each gets its own
 * sentence here. Every other refusal keeps vibeRequest's.
 */
function videoRefusalLine(r: VibeFailure): string {
  if (r.status === 400 && r.error?.startsWith("Unsupported video type")) return VIDEO_WRONG_TYPE;
  if (r.status === 400 && r.error?.startsWith("Video exceeds")) return VIDEO_TOO_LONG;
  return r.message;
}

export function PostComposerMobile({ onClose, onPosted, origin }: Props) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [clipFile, setClipFile] = useState<File | null>(null);
  // Videos in this composer always publish as "post-video" (X-style,
  // shows inline in the Posts feed). Clips get their own TikTok-style
  // composer surface in the Clips tab — different aspect, different
  // record-vs-pick UX. So there's no mode toggle here.
  const [videoMeta, setVideoMeta] = useState<{
    width: number | null;
    height: number | null;
    duration: number | null;
    posterBlob: Blob | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // The line under the attachment, plus Sign in / Review Terms / Verify when
  // vibeRequest says that is the fix (the same shape Settings' campus card
  // keeps). One value, so a line never carries another failure's link.
  const [error, setError] = useState<{ text: string; action?: ToastAction } | null>(null);
  // Drives the exit animation. When true, the sheet plays its slide-
  // down keyframe; the actual unmount happens via onClose() after the
  // animation finishes.
  const [closing, setClosing] = useState(false);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Inject keyframes (idempotent) before first paint.
  useEffect(() => {
    ensureKeyframes();
  }, []);

  // Hide the mobile tab bar while we're open. CSS rule
  // `body.vibe-composer-open .vibe-mobile-tabbar { display: none }`
  // does the work; we just flip the class.
  useEffect(() => {
    document.body.classList.add("vibe-composer-open");
    return () => {
      document.body.classList.remove("vibe-composer-open");
    };
  }, []);

  // Bind the legacy mention/hashtag picker to the textarea so @ + #
  // suggestions appear inline. Idempotent across re-renders.
  useEffect(() => {
    if (textareaRef.current) bindMentionPicker(textareaRef.current);
  }, []);

  // Defer autofocus until after the entrance animation lands —
  // focusing during the slide-up causes the iOS keyboard to race with
  // the sheet animation, which is the "choppy" feel users see when
  // we focus immediately.
  useEffect(() => {
    const id = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, ENTER_DURATION_MS + 20);
    return () => window.clearTimeout(id);
  }, []);

  // Wraps onClose with a fade-down exit so the sheet doesn't just
  // snap away when the user taps Cancel or after a successful post.
  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, EXIT_DURATION_MS);
  }, [closing, onClose]);

  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : null;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const hasContent = !!text.trim() || !!imageFile || !!clipFile;

  const onPickAttachment = (file: File | null) => {
    setError(null);
    if (!file) return;
    if (file.type.startsWith("image/")) {
      if (file.size > 8 * 1024 * 1024) {
        setError({ text: "That image is too large. The limit is 8 MB." });
        return;
      }
      setPendingImage(file);
      return;
    }
    if (file.type.startsWith("video/")) {
      if (file.size > 200 * 1024 * 1024) {
        setError({ text: "That video is too large. The limit is 200 MB." });
        return;
      }
      setClipFile(file);
      setImageFile(null);
      setVideoMeta(null);
      // Probe for poster + duration. We still classify the video, but
      // only to decide whether to BLOCK vertical short-form uploads
      // here (they belong in the Clips composer) instead of routing.
      void capturePosterFrame(file).then((meta) => {
        setVideoMeta({
          width: meta.width,
          height: meta.height,
          duration: meta.duration,
          posterBlob: meta.blob,
        });
      });
      return;
    }
    setError({ text: "Pick a photo or video file." });
  };

  const onCroppedImage = (blob: Blob) => {
    const cropped = new File([blob], "post-cropped.jpg", {
      type: blob.type || "image/jpeg",
    });
    setImageFile(cropped);
    setClipFile(null);
    setPendingImage(null);
  };

  const submit = useCallback(async () => {
    if (!hasContent || busy) return;
    setBusy(true);
    setError(null);
    // A step that failed: show its line and stop. Every `return` below sits
    // inside the `try`, so `finally` still clears `busy`.
    const refuse = (line: string, action?: ToastAction) => {
      setError(action ? { text: line, action } : { text: line });
    };
    // The last step of all three kinds of post. True only when the route
    // says it published: a 2xx with any other body (a page some network put
    // in the way) must not close the sheet as if the post went out.
    const publish = async (post: Record<string, unknown>): Promise<boolean> => {
      const pub = await vibeRequest<{ ok?: boolean }>("/api/me/publish-post", {
        method: "POST",
        json: post,
        quiet: true,
        failure: PUBLISH_FAILED,
      });
      if (pub.ok && pub.data.ok === true) return true;
      if (pub.ok) refuse(`${PUBLISH_FAILED} Try again.`);
      else refuse(videoRefusalLine(pub), pub.action);
      return false;
    };
    try {
      const trimmed = text.trim();
      const tags = extractHashtags(trimmed);

      if (clipFile) {
        // Probe the video if we didn't already (covers publish-before-
        // probe-finished race).
        let meta = videoMeta;
        if (!meta) {
          const captured = await capturePosterFrame(clipFile);
          meta = {
            width: captured.width,
            height: captured.height,
            duration: captured.duration,
            posterBlob: captured.blob,
          };
        }

        // 1. Presigned R2 PUT.
        const sig = await vibeRequest<{ uploadUrl?: string; objectKey?: string }>(
          "/api/me/clip-upload-url",
          {
            method: "POST",
            json: { contentType: clipFile.type, sizeBytes: clipFile.size },
            quiet: true,
            failure: VIDEO_UPLOAD_FAILED,
          },
        );
        if (!sig.ok) {
          refuse(videoRefusalLine(sig), sig.action);
          return;
        }
        const { uploadUrl, objectKey } = sig.data;
        if (!uploadUrl || !objectKey) {
          refuse(VIDEO_STORAGE_FAILED);
          return;
        }

        // 2. Direct PUT to R2. A raw upload on purpose: storage isn't a Vibe
        //    route and answers in its own format. A dropped connection throws
        //    and a refusal is a status; both get the same fixed line.
        let stored = false;
        try {
          const putRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": clipFile.type },
            body: clipFile,
          });
          stored = putRes.ok;
        } catch {
          // Offline, or the connection dropped mid-upload: `stored` stays false.
        }
        if (!stored) {
          refuse(VIDEO_STORAGE_FAILED);
          return;
        }

        // 3. Best-effort poster upload — publish proceeds without one
        //    if this fails (gradient fallback renders on the grid).
        let posterUrl: string | undefined;
        const durationSec =
          meta.duration && Number.isFinite(meta.duration)
            ? meta.duration
            : undefined;
        if (meta.posterBlob) {
          try {
            const fd = new FormData();
            fd.append(
              "file",
              new File([meta.posterBlob], "poster.jpg", {
                type: "image/jpeg",
              }),
            );
            fd.append("kind", "poster");
            // Quiet, and a refusal is not read: the post goes out without it.
            const up = await vibeRequest<{ url?: string }>("/api/me/profile-upload", {
              method: "POST",
              body: fd,
              quiet: true,
              failure: PHOTO_UPLOAD_FAILED,
            });
            if (up.ok && up.data.url) posterUrl = up.data.url;
          } catch {
            /* never block publishing on poster upload */
          }
        }

        // 4. Always publish as a video POST. Clip publishing lives in
        //    the separate Clips composer.
        const posted = await publish({
          content: trimmed,
          tags,
          video_object_key: objectKey,
          media_thumbnail_url: posterUrl,
          duration_sec: durationSec,
        });
        if (!posted) return;
      } else if (imageFile) {
        // Image path: multipart upload then post.
        const fd = new FormData();
        fd.append("file", imageFile);
        fd.append("kind", "post");
        const up = await vibeRequest<{ url?: string }>("/api/me/profile-upload", {
          method: "POST",
          body: fd,
          quiet: true,
          failure: PHOTO_UPLOAD_FAILED,
        });
        if (!up.ok) {
          refuse(up.message, up.action);
          return;
        }
        // An answer with no address would post the words without the photo.
        const photoUrl = up.data.url;
        if (!photoUrl) {
          refuse(`${PHOTO_UPLOAD_FAILED} Try again.`);
          return;
        }

        const posted = await publish({ content: trimmed, tags, media_url: photoUrl });
        if (!posted) return;
      } else {
        // Text-only.
        const posted = await publish({ content: trimmed, tags });
        if (!posted) return;
      }

      onPosted();
      requestClose();
    } catch {
      // vibeRequest never throws, so this is something of our own going
      // wrong. Its text is for a developer, not the student.
      setError({ text: `${PUBLISH_FAILED} Try again.` });
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    clipFile,
    hasContent,
    imageFile,
    onPosted,
    requestClose,
    text,
    videoMeta,
  ]);

  // CSS-var-driven origin for the clip-path circle. Falls back to the
  // viewport's bottom-right (where the FAB lives by default) if the
  // caller didn't pass a captured rect.
  const originStyleVars = {
    "--vibe-composer-x": origin ? `${origin.x}px` : "100%",
    "--vibe-composer-y": origin ? `${origin.y}px` : "100%",
  } as React.CSSProperties;

  const sheet = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compose post"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        // 100dvh shrinks when the iOS keyboard opens, so the bottom
        // action row (paperclip / char counter) stays visible above
        // the keyboard. With plain `inset: 0` / 100vh the sheet stayed
        // at the layout viewport's full height and the action row
        // landed under the keyboard — users couldn't tap Photo/Video
        // and could only post text. Falls back to 100vh on older
        // browsers via the vh value preceding dvh.
        height: "100vh",
        maxHeight: "100dvh",
        minHeight: "100dvh",
        zIndex: 1100,
        background: "#FAF7F2",
        display: "flex",
        flexDirection: "column",
        // Lift the whole sheet above the safe-area inset so the top bar
        // sits below the notch.
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        fontFamily: "DM Sans, sans-serif",
        color: "#1C1C1E",
        // Circular reveal: a small disc centred on the FAB grows out to
        // cover the screen, so the sheet looks like it's spawning from
        // the + button rather than sliding up from below. Reverse on
        // close shrinks back into the same point.
        animation: closing
          ? `vibeComposerCollapse ${EXIT_DURATION_MS}ms cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards`
          : `vibeComposerExpand ${ENTER_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
        willChange: "clip-path, opacity",
        ...originStyleVars,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderBottom: "1px solid rgba(28,28,30,0.06)",
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (busy) return;
            requestClose();
          }}
          disabled={busy}
          style={{
            background: "none",
            border: "none",
            fontFamily: "inherit",
            fontSize: 15,
            fontWeight: 600,
            color: busy ? "#8A8580" : "#1C1C1E",
            padding: 0,
            cursor: busy ? "default" : "pointer",
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
          New post
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !hasContent}
          style={{
            padding: "7px 18px",
            borderRadius: 999,
            border: "none",
            background:
              hasContent && !busy ? "#FF5C35" : "rgba(28,28,30,0.16)",
            color: "#fff",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 700,
            cursor: busy || !hasContent ? "default" : "pointer",
            boxShadow:
              hasContent && !busy ? "0 2px 8px rgba(255,92,53,0.32)" : "none",
          }}
        >
          {busy ? "Posting…" : "Post"}
        </button>
      </div>

      {/* Media toolbar — pinned right under the top header so it never
          ends up under the keyboard or scrolled out of view. This is the
          primary entry point for adding a photo / video / clip and it
          MUST be reachable regardless of viewport. The hidden file input
          lives here too. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 18px",
          borderBottom: "1px solid rgba(28,28,30,0.06)",
          background: "rgba(255,253,248,0.92)",
        }}
      >
        <input
          ref={attachInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          // Hidden but kept in the layout tree — some iOS Safari builds
          // refuse to fire .click() on display:none inputs even from a
          // real user-gesture handler.
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            opacity: 0,
            pointerEvents: "none",
          }}
          onClick={(e) => {
            (e.currentTarget as HTMLInputElement).value = "";
          }}
          onChange={(e) => onPickAttachment(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => attachInputRef.current?.click()}
          disabled={busy}
          aria-label="Attach photo or video"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 16px",
            borderRadius: 999,
            border: "1px solid rgba(255,92,53,0.35)",
            background:
              "linear-gradient(135deg, rgba(255,122,77,0.14), rgba(255,92,53,0.10))",
            fontFamily: "inherit",
            fontSize: 14,
            fontWeight: 700,
            color: "#C2461F",
            cursor: busy ? "default" : "pointer",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <rect x="2.5" y="4" width="13" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="6.5" cy="8" r="1.2" fill="currentColor" />
            <path d="M3 13l3.5-3.2 2.8 2.5 2.4-2.1L15 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          Photo / Video
        </button>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#8A8580" }}>
          {text.length}/2000
        </span>
      </div>

      {/* Body — scrollable so a long preview + open keyboard still work */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 18px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          placeholder="What's happening on campus?  Use #hashtags or @mention someone."
          rows={6}
          style={{
            border: "none",
            outline: "none",
            resize: "none",
            minHeight: 140,
            background: "transparent",
            fontFamily: "inherit",
            fontSize: 16,
            color: "#1C1C1E",
            padding: 0,
            lineHeight: 1.5,
            width: "100%",
          }}
        />


        {previewUrl ? (
          <div
            style={{
              position: "relative",
              borderRadius: 14,
              overflow: "hidden",
              border: "1px solid rgba(28,28,30,0.08)",
              paddingTop: "100%",
              background: `url(${previewUrl}) center/cover`,
            }}
          >
            <button
              type="button"
              onClick={() => setImageFile(null)}
              style={removeButtonStyle}
              aria-label="Remove photo"
            >
              ×
            </button>
          </div>
        ) : null}

        {clipFile ? (
          <div
            style={{
              position: "relative",
              border: "1px solid rgba(124,92,252,0.28)",
              borderRadius: 14,
              padding: "12px 14px",
              background: "rgba(124,92,252,0.08)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <span
              style={{
                fontFamily: "inherit",
                fontSize: 13,
                color: "#1C1C1E",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                paddingRight: 28,
              }}
            >
              🎬 {clipFile.name} · {(clipFile.size / (1024 * 1024)).toFixed(1)} MB
              {videoMeta?.duration ? (
                <span style={{ color: "#8A8580" }}>
                  {" · "}
                  {Math.round(videoMeta.duration)}s
                </span>
              ) : null}
            </span>
            <span
              style={{
                fontFamily: "inherit",
                fontSize: 12,
                lineHeight: 1.4,
                color: "var(--ink-muted)",
                paddingRight: 28,
              }}
            >
              {VIDEO_LOCATION_HINT}
            </span>
            <button
              type="button"
              onClick={() => {
                setClipFile(null);
                setVideoMeta(null);
              }}
              style={removeButtonStyle}
              aria-label="Remove video"
            >
              ×
            </button>
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              fontFamily: "inherit",
              fontSize: 12,
              color: "#C42B1C",
              background: "rgba(196,43,28,0.08)",
              padding: "8px 12px",
              borderRadius: 10,
            }}
          >
            {error.text}
            {error.action ? (
              <>
                {" "}
                {/* A plain link: a full page load, so the sign-in and Terms
                    checks on the page it opens run (the toast does the same). */}
                <a
                  href={error.action.href}
                  style={{
                    display: "inline-block",
                    padding: "6px 0",
                    color: "inherit",
                    fontWeight: 700,
                    textDecoration: "underline",
                    whiteSpace: "nowrap",
                  }}
                >
                  {error.action.label} →
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {pendingImage ? (
        <ImageCropperModal
          src={pendingImage}
          aspectChoices={[
            { label: "Square 1:1", value: 1 },
            { label: "Portrait 4:5", value: 4 / 5 },
            { label: "Landscape 16:9", value: 16 / 9 },
          ]}
          outputMaxSize={1600}
          title="Adjust photo"
          onCancel={() => setPendingImage(null)}
          onConfirm={onCroppedImage}
        />
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(sheet, document.body);
}

const removeButtonStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 28,
  height: 28,
  borderRadius: 999,
  border: "none",
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 16,
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
};

