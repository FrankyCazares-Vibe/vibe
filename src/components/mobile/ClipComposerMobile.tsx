"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  bindMentionPicker,
  capturePosterFrame,
  extractHashtags,
} from "@/lib/composer/helpers";

/**
 * TikTok-style clip composer — vertical 9:16, full-screen camera, big
 * record button with hold-to-record + tap-to-toggle, live duration
 * counter, pause / resume, review-then-publish.
 *
 * v1 scope (what ships here):
 *   - Camera permission flow (front camera by default, can toggle)
 *   - Live 9:16 preview from getUserMedia({ video, audio })
 *   - MediaRecorder for capture; chunks combined into one Blob on stop
 *   - Pause / resume natively (MediaRecorder.pause / .resume — supported
 *     in Safari 14.3+ which matches our floor)
 *   - 120-second cap (matches publish-clip server validation); auto-stops
 *   - Review screen plays back the captured blob in a loop, with
 *     Retake / Use clip
 *   - Caption screen with hashtag + @mention picker (same bind as the
 *     post composer)
 *   - Publish through the existing /api/me/clip-upload-url + /api/me/
 *     publish-clip pipeline — no new server code needed
 *
 * Deferred (text overlays burned onto frames, trim/scrub editing, music)
 * would need either canvas-based re-encoding or new DB columns for
 * overlay metadata + a renderer in ClipViewerMobile. Out of scope for
 * v1.
 */

type Phase = "intro" | "recording" | "paused" | "review" | "caption" | "publishing";
type Facing = "user" | "environment";

const MAX_CLIP_SEC = 120;
const ENTER_DURATION_MS = 360;
const EXIT_DURATION_MS = 220;

// Reuse the post composer's keyframe pool — both surfaces grow out of
// the same FAB, so users get a consistent reveal. Idempotent.
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
    @keyframes vibeRecordPulse {
      0%,100% { transform: scale(1);   box-shadow: 0 0 0 0 rgba(255,92,53,0.5); }
      50%     { transform: scale(1.05); box-shadow: 0 0 0 16px rgba(255,92,53,0); }
    }
  `;
  document.head.appendChild(style);
}

type Props = {
  onClose: () => void;
  onPosted: () => void;
  /** Centre point (viewport px) the sheet grows out of on open. */
  origin?: { x: number; y: number };
};

type PermState =
  /** Haven't asked yet — show the friendly "Enable camera" CTA. */
  | "asking"
  /** Asked and granted — stream live. */
  | "granted"
  /** Asked and denied (or blocked at OS level). Show the Instagram /
   *  TikTok-style "open settings" graphic instead of just an error. */
  | "denied"
  /** Browser doesn't expose getUserMedia (HTTP, in-app webview, etc). */
  | "unsupported";

export function ClipComposerMobile({ onClose, onPosted, origin }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [permState, setPermState] = useState<PermState>(() => {
    if (typeof navigator === "undefined") return "asking";
    if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
    return "asking";
  });
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("user");
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedAccumRef = useRef(0);
  const elapsedTickRef = useRef<number | null>(null);
  const elapsedSegmentStartRef = useRef<number>(0);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ---------- keyframes + permissions ----------

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

  // Request camera + mic. Called from the intro screen's button so it
  // counts as a real user gesture (iOS Safari is strict about this).
  // Differentiates "denied" (NotAllowedError, NotFoundError) from other
  // failures so we can show the Instagram-style settings prompt vs a
  // generic error.
  const requestCamera = useCallback(async (next: Facing = facing) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermState("unsupported");
      return;
    }
    setPermissionError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: next,
          // Ask for vertical 720x1280. Browsers usually round to the
          // nearest supported config (iPhone camera is happy with this).
          width: { ideal: 720 },
          height: { ideal: 1280 },
        },
        audio: true,
      });
      // Stop any prior tracks before swapping (front/back toggle).
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return s;
      });
      setFacing(next);
      setPermState("granted");
    } catch (e) {
      // DOMException names that mean "user / OS said no" vs everything
      // else (missing hardware, in-app webview, etc).
      const name = (e as { name?: string })?.name ?? "";
      if (
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        name === "SecurityError"
      ) {
        setPermState("denied");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setPermState("denied");
        setPermissionError("No camera was found on this device.");
      } else {
        setPermState("denied");
        setPermissionError(
          e instanceof Error ? e.message : "Couldn't open the camera.",
        );
      }
    }
  }, [facing]);

  // Attach the live stream to the <video> preview every time the
  // stream changes (initial grant + facing-toggle re-grant).
  useEffect(() => {
    const v = previewVideoRef.current;
    if (v && stream) {
      v.srcObject = stream;
    }
  }, [stream]);

  // Cleanup on unmount — release camera, revoke object URLs, cancel
  // any pending RAF ticks.
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      if (elapsedTickRef.current !== null) {
        cancelAnimationFrame(elapsedTickRef.current);
      }
    };
    // We deliberately read the latest refs at cleanup time — including
    // `stream` and `recordedUrl` as deps would re-run cleanup mid-flow
    // and stop the live preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- elapsed timer ----------

  const startTick = useCallback(() => {
    elapsedSegmentStartRef.current = performance.now();
    const tick = () => {
      const now = performance.now();
      const segment = now - elapsedSegmentStartRef.current;
      const total = elapsedAccumRef.current + segment;
      if (total >= MAX_CLIP_SEC * 1000) {
        // Auto-stop at the cap. Inline the stop instead of calling
        // stopRecording() so startTick and stopRecording don't depend
        // on each other (circular useCallback deps).
        setElapsedMs(MAX_CLIP_SEC * 1000);
        if (elapsedTickRef.current !== null) {
          cancelAnimationFrame(elapsedTickRef.current);
          elapsedTickRef.current = null;
        }
        const r = recorderRef.current;
        if (r && r.state !== "inactive") {
          try {
            r.stop();
          } catch {
            /* already stopping */
          }
        }
        return;
      }
      setElapsedMs(total);
      elapsedTickRef.current = window.requestAnimationFrame(tick);
    };
    elapsedTickRef.current = window.requestAnimationFrame(tick);
  }, []);

  const stopTick = useCallback(() => {
    if (elapsedTickRef.current !== null) {
      cancelAnimationFrame(elapsedTickRef.current);
      elapsedTickRef.current = null;
    }
    // Roll the current segment into the running total so the next
    // segment picks up where we left off (used by pause / resume).
    const now = performance.now();
    elapsedAccumRef.current += now - elapsedSegmentStartRef.current;
  }, []);

  // ---------- recording controls ----------

  const startRecording = useCallback(() => {
    if (!stream) return;
    chunksRef.current = [];
    elapsedAccumRef.current = 0;
    setElapsedMs(0);
    // Prefer mp4 on iOS Safari for native playback; fall back to webm
    // on Android Chrome / desktop.
    const mp4 = "video/mp4";
    const webm = "video/webm;codecs=vp9,opus";
    const webmVp8 = "video/webm;codecs=vp8,opus";
    const mimeType = MediaRecorder.isTypeSupported(mp4)
      ? mp4
      : MediaRecorder.isTypeSupported(webm)
        ? webm
        : MediaRecorder.isTypeSupported(webmVp8)
          ? webmVp8
          : "";
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Recorder error: ${e.message}`
          : "Could not start the recorder.",
      );
      return;
    }
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "video/mp4";
      const blob = new Blob(chunksRef.current, { type });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      setPhase("review");
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setPhase("recording");
    startTick();
  }, [stream, startTick]);

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (r.state !== "inactive") {
      try {
        r.stop();
      } catch {
        /* recorder may already have stopped */
      }
    }
    stopTick();
  }, [stopTick]);

  const pauseRecording = useCallback(() => {
    const r = recorderRef.current;
    if (!r || r.state !== "recording") return;
    try {
      r.pause();
      stopTick();
      setPhase("paused");
    } catch {
      /* Some Android Chrome builds throw on pause; treat as stop. */
      stopRecording();
    }
  }, [stopTick, stopRecording]);

  const resumeRecording = useCallback(() => {
    const r = recorderRef.current;
    if (!r || r.state !== "paused") return;
    try {
      r.resume();
      startTick();
      setPhase("recording");
    } catch {
      stopRecording();
    }
  }, [startTick, stopRecording]);

  // ---------- review controls ----------

  const retake = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setElapsedMs(0);
    elapsedAccumRef.current = 0;
    setError(null);
    setPhase("intro");
  }, [recordedUrl]);

  // ---------- close (animated) ----------

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, EXIT_DURATION_MS);
  }, [closing, onClose]);

  // ---------- publish ----------

  const publish = useCallback(async () => {
    if (!recordedBlob) return;
    setPhase("publishing");
    setError(null);
    try {
      const trimmed = caption.trim();
      const tags = extractHashtags(trimmed);

      // 1. Probe for poster + true duration (the chunked recording's
      //    Blob doesn't expose duration directly; readback via a
      //    video element gives us both poster + accurate length).
      const file = new File(
        [recordedBlob],
        `clip.${recordedBlob.type.includes("mp4") ? "mp4" : "webm"}`,
        { type: recordedBlob.type || "video/mp4" },
      );
      const meta = await capturePosterFrame(file);

      // 2. Presigned R2 PUT.
      const sig = await fetch("/api/me/clip-upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: file.type,
          sizeBytes: file.size,
        }),
      }).then((r) => r.json());
      if (!sig?.ok) throw new Error(sig?.error || "Could not start upload");

      const putRes = await fetch(sig.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed (HTTP ${putRes.status})`);
      }

      // 3. Best-effort poster upload (gradient fallback on the grid
      //    if this step fails).
      let posterUrl: string | undefined;
      if (meta.blob) {
        try {
          const fd = new FormData();
          fd.append(
            "file",
            new File([meta.blob], "poster.jpg", { type: "image/jpeg" }),
          );
          fd.append("kind", "poster");
          const up = await fetch("/api/me/profile-upload", {
            method: "POST",
            body: fd,
          }).then((r) => r.json());
          if (up?.ok && up.url) posterUrl = up.url as string;
        } catch {
          /* non-fatal */
        }
      }

      // 4. Publish through the existing clip endpoint. Duration prefer-
      //    ences in order: probed metadata > our own elapsed timer > none.
      const durationSec =
        meta.duration && Number.isFinite(meta.duration)
          ? meta.duration
          : elapsedMs > 0
            ? elapsedMs / 1000
            : undefined;
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

      onPosted();
      requestClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish");
      setPhase("caption");
    }
  }, [recordedBlob, caption, elapsedMs, onPosted, requestClose]);

  // ---------- mention picker on caption ----------

  useEffect(() => {
    if (phase === "caption" && captionTextareaRef.current) {
      bindMentionPicker(captionTextareaRef.current);
      // Autofocus a tick after the caption screen mounts so iOS opens
      // the keyboard alongside the layout shift instead of fighting it.
      const id = window.setTimeout(() => {
        captionTextareaRef.current?.focus();
      }, 40);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [phase]);

  // ---------- format helpers ----------

  const formatMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const remS = s - m * 60;
    return `${m}:${remS.toString().padStart(2, "0")}`;
  };

  const recording = phase === "recording";
  const paused = phase === "paused";

  // ---------- subviews ----------

  /**
   * Friendly first-ask screen — gradient backdrop, big camera icon,
   * single CTA. Triggers the OS prompt via a real user gesture.
   */
  const renderAskingScreen = () => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
        textAlign: "center",
        color: "#fff",
        background:
          "radial-gradient(120% 80% at 50% 20%, rgba(255,92,53,0.32) 0%, rgba(28,28,30,0.96) 60%, #000 100%)",
        gap: 18,
      }}
    >
      <button
        type="button"
        onClick={requestClose}
        aria-label="Close"
        style={chromeButton({
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          left: 14,
        })}
      >
        ✕
      </button>

      <div
        aria-hidden
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background:
            "linear-gradient(135deg, #FF7A4D 0%, #FF5C35 60%, #E04A26 100%)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 12px 36px rgba(255,92,53,0.45)",
          marginBottom: 4,
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="2.5" y="6" width="14" height="12" rx="2.5" stroke="#fff" strokeWidth="1.8" fill="none" />
          <path d="M16.5 10l4-2.5v9L16.5 14" stroke="#fff" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
        </svg>
      </div>

      <span
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 28,
          lineHeight: 1.15,
        }}
      >
        Record your clip
      </span>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          opacity: 0.8,
          maxWidth: 300,
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Vibe needs your camera and microphone to film a vertical clip.
        You&apos;ll see the OS permission prompt next.
      </p>

      <button
        type="button"
        onClick={() => void requestCamera()}
        style={{
          marginTop: 12,
          padding: "13px 26px",
          borderRadius: 999,
          border: "none",
          background: "#fff",
          color: "#1C1C1E",
          fontFamily: "DM Sans, sans-serif",
          fontWeight: 800,
          fontSize: 14,
          cursor: "pointer",
          boxShadow: "0 10px 28px rgba(0,0,0,0.35)",
        }}
      >
        Enable camera + microphone
      </button>
    </div>
  );

  /**
   * Permission-denied screen, modeled on Instagram + TikTok's "camera
   * access is off" graphics. Detects iOS so we can show iOS-specific
   * Settings-app instructions. Gives a Retry button — sometimes the
   * user fixes it in another tab and comes back.
   */
  const renderDeniedScreen = () => {
    const isIOS =
      typeof navigator !== "undefined" &&
      /iPad|iPhone|iPod/.test(navigator.userAgent);
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 28px",
          textAlign: "center",
          color: "#fff",
          background:
            "radial-gradient(120% 80% at 50% 20%, rgba(255,92,53,0.18) 0%, rgba(28,28,30,0.98) 60%, #000 100%)",
          gap: 18,
        }}
      >
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          style={chromeButton({
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            left: 14,
          })}
        >
          ✕
        </button>

        {/* Camera-with-slash icon — the universal "access denied" mark */}
        <div
          aria-hidden
          style={{
            width: 92,
            height: 92,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.18)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="2.5" y="6" width="14" height="12" rx="2.5" stroke="#fff" strokeWidth="1.6" fill="none" opacity={0.92} />
            <path d="M16.5 10l4-2.5v9L16.5 14" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" fill="none" opacity={0.92} />
            {/* The slash */}
            <line x1="3" y1="3.5" x2="22.5" y2="22" stroke="#FF5C35" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="3.5" y1="3" x2="23" y2="21.5" stroke="#1C1C1E" strokeWidth="1.0" strokeLinecap="round" opacity={0.5} />
          </svg>
        </div>

        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 24,
            lineHeight: 1.2,
          }}
        >
          Camera access is off
        </span>

        <p
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            opacity: 0.78,
            maxWidth: 320,
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          To record a clip, Vibe needs your camera and microphone. Turn
          access on in your device settings and come back here to try
          again.
        </p>

        {/* iOS-specific path. Keeps copy from Instagram / TikTok's flows
            so users recognize the steps. */}
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12.5,
            color: "rgba(255,255,255,0.7)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 14,
            padding: "12px 16px",
            maxWidth: 340,
            textAlign: "left",
            lineHeight: 1.55,
          }}
        >
          {isIOS ? (
            <>
              <strong style={{ color: "#fff", fontWeight: 800 }}>How to fix it</strong>
              <ol style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                <li>Open the <strong>Settings</strong> app</li>
                <li>Scroll down to <strong>Safari</strong> (or Chrome)</li>
                <li>Tap <strong>Camera</strong> + <strong>Microphone</strong></li>
                <li>Choose <strong>Allow</strong> for this site</li>
                <li>Come back here and tap Try again</li>
              </ol>
            </>
          ) : (
            <>
              <strong style={{ color: "#fff", fontWeight: 800 }}>How to fix it</strong>
              <ol style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                <li>Tap the lock or info icon in the address bar</li>
                <li>Open Permissions / Site settings</li>
                <li>Set <strong>Camera</strong> and <strong>Microphone</strong> to Allow</li>
                <li>Reload the page and tap Try again</li>
              </ol>
            </>
          )}
        </div>

        {permissionError ? (
          <p
            style={{
              fontFamily: "DM Sans, sans-serif",
              fontSize: 11,
              color: "#FF8A6F",
              maxWidth: 320,
              margin: 0,
            }}
          >
            {permissionError}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button
            type="button"
            onClick={requestClose}
            style={{
              padding: "11px 18px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.30)",
              background: "transparent",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => void requestCamera()}
            style={{
              padding: "11px 22px",
              borderRadius: 999,
              border: "none",
              background: "#FF5C35",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: "0 6px 18px rgba(255,92,53,0.35)",
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  };

  /**
   * Browser doesn't expose getUserMedia at all (old Safari, in-app
   * webviews like LinkedIn / Instagram's preview browser, http://). No
   * recovery path — point the user at Safari directly.
   */
  const renderUnsupportedScreen = () => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
        textAlign: "center",
        color: "#fff",
        background: "#000",
        gap: 18,
      }}
    >
      <button
        type="button"
        onClick={requestClose}
        aria-label="Close"
        style={chromeButton({
          top: "calc(env(safe-area-inset-top, 0px) + 12px)",
          left: 14,
        })}
      >
        ✕
      </button>
      <span
        style={{
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 24,
        }}
      >
        Open Vibe in your browser
      </span>
      <p
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 14,
          opacity: 0.78,
          maxWidth: 320,
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        Clip recording isn&apos;t supported in this app&apos;s preview browser.
        Tap the share icon and choose <strong>Open in Safari</strong> (or
        Chrome) to record a clip.
      </p>
    </div>
  );

  const renderRecordingChrome = () => (
    <>
      <video
        ref={previewVideoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          background: "#000",
          transform: facing === "user" ? "scaleX(-1)" : "none",
        }}
      />

      {/* Live timer pill — top center */}
      <div
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 14px)",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "6px 14px",
          borderRadius: 999,
          background: recording ? "rgba(255,92,53,0.92)" : "rgba(0,0,0,0.6)",
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: "0.04em",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {recording ? (
          <span
            aria-hidden
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#fff",
              animation: "vibeRecordPulse 1.2s ease-in-out infinite",
            }}
          />
        ) : null}
        {formatMs(elapsedMs)} / {formatMs(MAX_CLIP_SEC * 1000)}
      </div>

      {/* Camera flip — top-right */}
      <button
        type="button"
        onClick={() => void requestCamera(facing === "user" ? "environment" : "user")}
        disabled={recording || paused}
        aria-label="Flip camera"
        style={chromeButton({ top: "calc(env(safe-area-inset-top, 0px) + 12px)", right: 14 })}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M3 7l2-3h8l2 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <rect x="3" y="6" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <circle cx="9" cy="10.5" r="2.4" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M7 14.5l-1 1 1 1M11 14.5l1 1-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      </button>

      {/* Bottom controls — record + pause/resume + finish */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
        }}
      >
        {/* Pause / resume — left of record button, only after a segment exists */}
        {recording ? (
          <button
            type="button"
            onClick={pauseRecording}
            aria-label="Pause"
            style={sideButton}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
              <rect x="6" y="5" width="3" height="12" rx="1" fill="currentColor" />
              <rect x="13" y="5" width="3" height="12" rx="1" fill="currentColor" />
            </svg>
          </button>
        ) : paused ? (
          <button
            type="button"
            onClick={resumeRecording}
            aria-label="Resume"
            style={sideButton}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
              <polygon points="6,4 18,11 6,18" fill="currentColor" />
            </svg>
          </button>
        ) : null}

        {/* Record (big) — tap to toggle. Hold-to-record is layered on via
            pointerdown/up handlers below. */}
        <button
          type="button"
          aria-label={recording ? "Stop" : "Record"}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            if (!recording && !paused) startRecording();
          }}
          onPointerUp={(e) => {
            try {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {}
            // If the recording was started by this very press AND is
            // shorter than ~140ms, treat the gesture as a tap (so the
            // user can either hold OR tap-to-toggle). Otherwise the
            // pointerup ends the hold-to-record.
            if (recording) {
              if (elapsedMs < 140) {
                // Keep going — promote to tap-toggle mode.
                return;
              }
              stopRecording();
            }
          }}
          onClick={() => {
            // Click fires AFTER pointerup. If we're recording past the
            // 140ms tap threshold, the pointerup already stopped; nothing
            // to do here. If we got here without recording, the press was
            // never registered (rare) — fall through.
            if (recording && elapsedMs >= 140) return;
            if (paused) return;
            // Toggle: if recording (after promoted tap), stop.
            if (recording) stopRecording();
          }}
          style={{
            width: 86,
            height: 86,
            borderRadius: "50%",
            border: "5px solid rgba(255,255,255,0.92)",
            background: recording ? "#FF5C35" : paused ? "#FFB070" : "#FF5C35",
            boxShadow: recording
              ? "0 0 0 6px rgba(255,92,53,0.25), 0 8px 26px rgba(0,0,0,0.45)"
              : "0 8px 26px rgba(0,0,0,0.45)",
            cursor: "pointer",
            position: "relative",
            transition: "transform 120ms ease",
            animation: recording ? "vibeRecordPulse 1.4s ease-in-out infinite" : undefined,
          }}
        >
          {recording ? (
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 28,
                height: 28,
                borderRadius: 6,
                background: "#fff",
                transform: "translate(-50%, -50%)",
              }}
            />
          ) : null}
        </button>

        {/* Finish — only visible after at least one segment exists */}
        {(recording || paused) && elapsedMs > 800 ? (
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Finish"
            style={{
              ...sideButton,
              background: "rgba(255,255,255,0.92)",
              color: "#1C1C1E",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
              <polyline points="5,12 9,16 17,7" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <span style={{ width: 52, height: 52, display: "inline-block" }} />
        )}
      </div>

      {/* Cancel — top-left, always visible */}
      <button
        type="button"
        onClick={() => {
          if (recording || paused) stopRecording();
          requestClose();
        }}
        aria-label="Close"
        style={chromeButton({ top: "calc(env(safe-area-inset-top, 0px) + 12px)", left: 14 })}
      >
        ✕
      </button>

      {/* Hint when nothing recorded yet */}
      {!recording && !paused && elapsedMs === 0 ? (
        <div
          style={{
            position: "absolute",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 132px)",
            left: 0,
            right: 0,
            textAlign: "center",
            color: "rgba(255,255,255,0.9)",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textShadow: "0 1px 4px rgba(0,0,0,0.6)",
            pointerEvents: "none",
          }}
        >
          Tap or hold to record · max {MAX_CLIP_SEC}s
        </div>
      ) : null}
    </>
  );

  const renderReview = () => (
    <>
      <video
        ref={playbackVideoRef}
        src={recordedUrl ?? undefined}
        autoPlay
        loop
        playsInline
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          background: "#000",
        }}
      />
      {/* Duration badge */}
      <div
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 14px)",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "6px 14px",
          borderRadius: 999,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          fontFamily: "DM Sans, sans-serif",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: "0.04em",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {formatMs(elapsedMs)}
      </div>
      {/* Close */}
      <button
        type="button"
        onClick={requestClose}
        aria-label="Discard"
        style={chromeButton({ top: "calc(env(safe-area-inset-top, 0px) + 12px)", left: 14 })}
      >
        ✕
      </button>
      {/* Bottom action bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)",
          padding: "0 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <button
          type="button"
          onClick={retake}
          style={{
            padding: "12px 18px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.6)",
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          Retake
        </button>
        <button
          type="button"
          onClick={() => setPhase("caption")}
          style={{
            padding: "12px 22px",
            borderRadius: 999,
            border: "none",
            background: "#FF5C35",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 8px 22px rgba(255,92,53,0.4)",
          }}
        >
          Next
        </button>
      </div>
    </>
  );

  const renderCaption = () => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#FAF7F2",
        color: "#1C1C1E",
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      {/* Header */}
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
          onClick={() => setPhase("review")}
          style={{
            background: "none",
            border: "none",
            fontFamily: "inherit",
            fontSize: 15,
            fontWeight: 600,
            color: "#1C1C1E",
            padding: 0,
            cursor: "pointer",
          }}
        >
          Back
        </button>
        <span style={{ fontFamily: "Fraunces, serif", fontSize: 17, fontWeight: 800 }}>
          Post clip
        </span>
        <button
          type="button"
          onClick={() => void publish()}
          style={{
            padding: "7px 18px",
            borderRadius: 999,
            border: "none",
            background: "#FF5C35",
            color: "#fff",
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(255,92,53,0.32)",
          }}
        >
          Post
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 18px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", gap: 12 }}>
          {/* Clip thumb — vertical 9:16 */}
          <div
            style={{
              flexShrink: 0,
              width: 74,
              aspectRatio: "9 / 16",
              borderRadius: 10,
              overflow: "hidden",
              background: "#000",
            }}
          >
            {recordedUrl ? (
              <video
                src={recordedUrl}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            ) : null}
          </div>
          <textarea
            ref={captionTextareaRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 2000))}
            placeholder="Caption — use #hashtags or @mention someone."
            rows={5}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 15,
              color: "#1C1C1E",
              padding: 0,
              lineHeight: 1.5,
            }}
          />
        </div>
        <span style={{ alignSelf: "flex-end", fontSize: 11, color: "#8A8580" }}>
          {caption.length}/2000
        </span>
        {error ? (
          <div
            style={{
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
    </div>
  );

  const renderPublishing = () => (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
        fontWeight: 700,
        fontSize: 15,
        letterSpacing: "0.04em",
      }}
    >
      Posting clip…
    </div>
  );

  // ---------- sheet shell ----------

  const originStyleVars = {
    "--vibe-composer-x": origin ? `${origin.x}px` : "100%",
    "--vibe-composer-y": origin ? `${origin.y}px` : "100%",
  } as React.CSSProperties;

  const sheet = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New clip"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "100vh",
        minHeight: "100dvh",
        maxHeight: "100dvh",
        zIndex: 1100,
        background: "#000",
        color: "#fff",
        animation: closing
          ? `vibeComposerCollapse ${EXIT_DURATION_MS}ms cubic-bezier(0.55, 0.06, 0.68, 0.19) forwards`
          : `vibeComposerExpand ${ENTER_DURATION_MS}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
        willChange: "clip-path, opacity",
        overflow: "hidden",
        ...originStyleVars,
      }}
    >
      {/* Pre-stream: show the permission UI ONLY — never the chrome.
          The previous build rendered both, which gave us two competing
          <video> elements on the same ref (black screen on Safari). */}
      {phase === "intro" && permState === "unsupported"
        ? renderUnsupportedScreen()
        : phase === "intro" && permState === "denied"
          ? renderDeniedScreen()
          : phase === "intro" && !stream
            ? renderAskingScreen()
            : null}
      {/* Stream is live (or we're mid-recording / paused) → camera UI. */}
      {(phase === "intro" || phase === "recording" || phase === "paused") &&
      stream
        ? renderRecordingChrome()
        : null}
      {phase === "review" ? renderReview() : null}
      {phase === "caption" ? renderCaption() : null}
      {phase === "publishing" ? renderPublishing() : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(sheet, document.body);
}

function chromeButton(pos: React.CSSProperties): React.CSSProperties {
  return {
    position: "absolute",
    ...pos,
    width: 38,
    height: 38,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.32)",
    background: "rgba(0,0,0,0.42)",
    color: "#fff",
    fontFamily: "DM Sans, sans-serif",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

const sideButton: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.32)",
  background: "rgba(0,0,0,0.45)",
  color: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};
