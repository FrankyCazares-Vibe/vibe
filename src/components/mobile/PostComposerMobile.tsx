"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ImageCropperModal } from "@/components/ImageCropperModal";
import {
  bindMentionPicker,
  capturePosterFrame,
  classifyVideo,
  extractHashtags,
  type VideoMode,
} from "@/lib/composer/helpers";

/**
 * Mobile composer sheet — text + image + video post + 9:16 clip with
 * R2 presigned upload. Mirrors src/app/campus/campus-home.tsx's
 * FeedComposer feature set; the shared logic lives in
 * @/lib/composer/helpers so the two don't drift.
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
};

export function PostComposerMobile({ onClose, onPosted }: Props) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [clipFile, setClipFile] = useState<File | null>(null);
  const [videoMode, setVideoMode] = useState<VideoMode>("clip");
  const [videoMeta, setVideoMeta] = useState<{
    width: number | null;
    height: number | null;
    duration: number | null;
    posterBlob: Blob | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Bind the legacy mention/hashtag picker to the textarea so @ + #
  // suggestions appear inline. Idempotent across re-renders.
  useEffect(() => {
    if (textareaRef.current) bindMentionPicker(textareaRef.current);
  }, []);

  // Autofocus on mount so the keyboard opens immediately. Defer one
  // frame so iOS doesn't swallow the focus during the sheet's mount
  // transition.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

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
        setError("Image too large — max 8MB.");
        return;
      }
      setPendingImage(file);
      return;
    }
    if (file.type.startsWith("video/")) {
      if (file.size > 200 * 1024 * 1024) {
        setError("Video too large — max 200MB.");
        return;
      }
      setClipFile(file);
      setImageFile(null);
      setVideoMeta(null);
      setVideoMode("clip");
      void capturePosterFrame(file).then((meta) => {
        setVideoMode(classifyVideo(meta.width, meta.height, meta.duration));
        setVideoMeta({
          width: meta.width,
          height: meta.height,
          duration: meta.duration,
          posterBlob: meta.blob,
        });
      });
      return;
    }
    setError("Pick a photo or video file.");
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
        const sig = await fetch("/api/me/clip-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType: clipFile.type,
            sizeBytes: clipFile.size,
          }),
        }).then((r) => r.json());
        if (!sig?.ok) throw new Error(sig?.error || "Could not start upload");

        // 2. Direct PUT to R2.
        const putRes = await fetch(sig.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": clipFile.type },
          body: clipFile,
        });
        if (!putRes.ok) {
          throw new Error(`Upload failed (HTTP ${putRes.status})`);
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
            const up = await fetch("/api/me/profile-upload", {
              method: "POST",
              body: fd,
            }).then((r) => r.json());
            if (up?.ok && up.url) posterUrl = up.url as string;
          } catch {
            /* never block publishing on poster upload */
          }
        }

        // 4. Record the row — endpoint depends on mode.
        if (videoMode === "clip") {
          const pub = await fetch("/api/me/publish-clip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              object_key: sig.objectKey,
              content: trimmed,
              tags,
              poster_url: posterUrl,
              duration_sec: durationSec,
            }),
          }).then((r) => r.json());
          if (!pub?.ok) throw new Error(pub?.error || "Publish failed");
        } else {
          const pub = await fetch("/api/me/publish-post", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: trimmed,
              tags,
              video_object_key: sig.objectKey,
              media_thumbnail_url: posterUrl,
              duration_sec: durationSec,
            }),
          }).then((r) => r.json());
          if (!pub?.ok) throw new Error(pub?.error || "Publish failed");
        }
      } else if (imageFile) {
        // Image path: multipart upload then post.
        const fd = new FormData();
        fd.append("file", imageFile);
        fd.append("kind", "post");
        const up = await fetch("/api/me/profile-upload", {
          method: "POST",
          body: fd,
        }).then((r) => r.json());
        if (!up?.ok) throw new Error(up?.error || "Image upload failed");

        const pub = await fetch("/api/me/publish-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            tags,
            media_url: up.url,
          }),
        }).then((r) => r.json());
        if (!pub?.ok) throw new Error(pub?.error || "Publish failed");
      } else {
        // Text-only.
        const pub = await fetch("/api/me/publish-post", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed, tags }),
        }).then((r) => r.json());
        if (!pub?.ok) throw new Error(pub?.error || "Publish failed");
      }

      onPosted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    clipFile,
    hasContent,
    imageFile,
    onClose,
    onPosted,
    text,
    videoMeta,
    videoMode,
  ]);

  const sheet = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Compose post"
      style={{
        position: "fixed",
        inset: 0,
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
            onClose();
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
            </span>
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{ fontSize: 11, color: "#8A8580", fontWeight: 600 }}
              >
                Post as:
              </span>
              <button
                type="button"
                onClick={() => setVideoMode("clip")}
                style={videoModePill(videoMode === "clip")}
              >
                Clip
              </button>
              <button
                type="button"
                onClick={() => setVideoMode("post-video")}
                style={videoModePill(videoMode === "post-video")}
              >
                Video post
              </button>
              {videoMeta?.duration ? (
                <span
                  style={{
                    fontSize: 11,
                    color: "#8A8580",
                    marginLeft: "auto",
                  }}
                >
                  {Math.round(videoMeta.duration)}s
                  {videoMeta.width && videoMeta.height
                    ? ` · ${videoMeta.width}×${videoMeta.height}`
                    : ""}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setClipFile(null);
                setVideoMeta(null);
                setVideoMode("clip");
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
            {error}
          </div>
        ) : null}
      </div>

      {/* Bottom action row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 18px",
          borderTop: "1px solid rgba(28,28,30,0.06)",
          background: "#FAF7F2",
        }}
      >
        <input
          ref={attachInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          style={{ display: "none" }}
          // Reset on click so the same file can be re-picked after a
          // remove (iOS Safari otherwise no-ops onChange).
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
            gap: 6,
            padding: "8px 14px",
            borderRadius: 999,
            border: "1px solid rgba(28,28,30,0.10)",
            background: "rgba(255,255,255,0.7)",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 600,
            color: "#1C1C1E",
            cursor: busy ? "default" : "pointer",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M13 7.5L8 12.5C6.343 14.157 3.657 14.157 2 12.5S1 8.157 2.657 6.5L8 1l4 4L6.5 10.5C5.672 11.328 4.328 11.328 3.5 10.5s-.828-2.172 0-3L9 2"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
          Photo or video
        </button>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#8A8580" }}>
          {text.length}/2000
        </span>
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

function videoModePill(active: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    padding: "5px 12px",
    borderRadius: 999,
    border: active ? "1px solid #5B41B8" : "1px solid rgba(28,28,30,0.14)",
    background: active ? "#5B41B8" : "transparent",
    color: active ? "#fff" : "#1C1C1E",
    cursor: "pointer",
    fontFamily: "DM Sans, sans-serif",
    letterSpacing: "0.2px",
  };
}
