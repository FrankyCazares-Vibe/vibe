"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "vaul";

import {
  ALLOWED_SPEEDS,
  FILTER_CSS,
  FILTER_PRESETS,
  TEXT_OVERLAY_BGS,
  TEXT_OVERLAY_FONTS,
  TEXT_OVERLAY_SIZES,
  type ClipEditMetadata,
  type ClipSpeed,
  type FilterPreset,
  type TextOverlay,
  type TextOverlayBg,
  type TextOverlayFont,
  type TextOverlaySize,
  getOverlayCss,
} from "@/lib/clip/edit-metadata";
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
    @keyframes vibeFocusPulse {
      0%   { transform: translate(-50%, -50%) scale(1.7); opacity: 0; }
      20%  { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
      100% { transform: translate(-50%, -50%) scale(0.92); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

/** Six-color palette for text overlays. White first so it's the
 *  default and matches what most users want most of the time. */
const TEXT_COLORS = ["#FFFFFF", "#000000", "#FF5C35", "#FFD23F", "#C6A0FF", "#5BE3B9"];

// Vaul style constants for the clip composer's overlays — dark theme
// to match the rest of the camera surface (the messages-mobile
// equivalents are cream). Slide from the right so dragging right
// dismisses (iOS push-view semantics).
const composerVaulOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  zIndex: 1200,
};

const composerVaulContentStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: "100%",
  background: "#0E0E10",
  color: "#fff",
  zIndex: 1201,
  outline: "none",
  display: "flex",
  flexDirection: "column",
};

const composerVaulHiddenTitleStyle: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Inline label + horizontally-laid-out controls row, used inside the
 *  TextOverlayEditor for Color / Background / Font / Size pickers. */
function ControlRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        style={{
          fontFamily: "DM Sans, sans-serif",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.16em",
          color: "rgba(255,255,255,0.55)",
          textTransform: "uppercase",
          minWidth: 76,
        }}
      >
        {label}
      </span>
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          flex: 1,
          flexWrap: "wrap",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
  style,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        border: active
          ? "1.5px solid rgba(255,255,255,0.95)"
          : "1px solid rgba(255,255,255,0.18)",
        background: active
          ? "rgba(255,255,255,0.16)"
          : "rgba(255,255,255,0.04)",
        color: "#fff",
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Two-thumb range slider for picking a `start_ms — end_ms` window of
 * the clip during which a text overlay should be visible. When both
 * thumbs are at the rail extremes, returns `undefined` for both so the
 * overlay defaults back to "always on" (no startMs/endMs persisted).
 */
function TimingRange({
  durationMs,
  startMs,
  endMs,
  onChange,
}: {
  durationMs: number;
  startMs: number | undefined;
  endMs: number | undefined;
  onChange: (s: number | undefined, e: number | undefined) => void;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  // Resolved values for rendering (fall back to full range when null).
  const startPct = ((startMs ?? 0) / durationMs) * 100;
  const endPct = ((endMs ?? durationMs) / durationMs) * 100;

  const setThumb = (which: "start" | "end", clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const ms = Math.round((pct / 100) * durationMs);
    let s = startMs ?? 0;
    let e = endMs ?? durationMs;
    if (which === "start") {
      s = Math.min(ms, e - 100); // keep at least 100ms gap
    } else {
      e = Math.max(ms, s + 100);
    }
    // Treat full range as "no constraint" so the saved overlay stays
    // simple (no startMs/endMs).
    const noConstraint = s <= 1 && e >= durationMs - 1;
    onChange(noConstraint ? undefined : s, noConstraint ? undefined : e);
  };

  const dragRef = useRef<"start" | "end" | null>(null);

  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        ref={barRef}
        style={{
          position: "relative",
          height: 22,
          touchAction: "none",
          userSelect: "none",
        }}
        onPointerDown={(e) => {
          // Pick whichever thumb is closer to the tap point.
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = ((e.clientX - rect.left) / rect.width) * 100;
          dragRef.current = Math.abs(pct - startPct) <= Math.abs(pct - endPct) ? "start" : "end";
          e.currentTarget.setPointerCapture(e.pointerId);
          setThumb(dragRef.current, e.clientX);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          setThumb(dragRef.current, e.clientX);
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId);
          dragRef.current = null;
        }}
      >
        {/* Track */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 0,
            right: 0,
            height: 3,
            background: "rgba(255,255,255,0.18)",
            borderRadius: 2,
          }}
        />
        {/* Selected range */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
            height: 3,
            background: "#FF5C35",
            borderRadius: 2,
          }}
        />
        {/* Thumbs */}
        {(["start", "end"] as const).map((which) => (
          <div
            key={which}
            style={{
              position: "absolute",
              top: 4,
              left: `${which === "start" ? startPct : endPct}%`,
              transform: "translateX(-50%)",
              width: 14,
              height: 14,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
              border: "2px solid #FF5C35",
            }}
          />
        ))}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "rgba(255,255,255,0.55)",
          fontFamily: "DM Sans, sans-serif",
          letterSpacing: "0.04em",
        }}
      >
        {fmt(startMs ?? 0)} — {fmt(endMs ?? durationMs)}
        {startMs === undefined && endMs === undefined ? " (whole clip)" : ""}
      </div>
    </div>
  );
}

function TextOverlayEditor({
  initial,
  onSave,
  onDelete,
  onCancel,
  clipDurationMs,
}: {
  /** null → drafting a new overlay, otherwise the overlay being edited. */
  initial: TextOverlay | null;
  onSave: (o: TextOverlay) => void;
  /** Only provided in edit mode. */
  onDelete?: () => void;
  onCancel: () => void;
  /** When > 0, enables the "Timing" control so the user can scope an
   *  overlay to a sub-range of the clip. Otherwise the timing UI is
   *  hidden and the overlay shows for the whole clip. */
  clipDurationMs?: number;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [color, setColor] = useState(initial?.color ?? TEXT_COLORS[0]);
  const [bg, setBg] = useState<TextOverlayBg>(initial?.bg ?? "none");
  const [font, setFont] = useState<TextOverlayFont>(initial?.font ?? "sans");
  const [size, setSize] = useState<TextOverlaySize>(initial?.size ?? "m");
  const [startMs, setStartMs] = useState<number | undefined>(initial?.startMs);
  const [endMs, setEndMs] = useState<number | undefined>(initial?.endMs);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-focus the text input when the modal opens — keyboard pops up
  // immediately. iOS needs a small delay to honor focus after layout.
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, []);

  const handleSave = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      // Empty save behaves like cancel if drafting, or delete if editing.
      if (initial && onDelete) onDelete();
      else onCancel();
      return;
    }
    const next: TextOverlay = {
      id: initial?.id ?? Math.random().toString(36).slice(2, 10),
      text: trimmed,
      x: initial?.x ?? 50,
      y: initial?.y ?? 50,
      color,
      bg,
      font,
      size,
    };
    if (typeof initial?.scale === "number") next.scale = initial.scale;
    if (typeof startMs === "number") next.startMs = startMs;
    if (typeof endMs === "number") next.endMs = endMs;
    onSave(next);
  };

  // Live preview style for the textarea so the user sees the chosen
  // font / size / color / bg as they type.
  const previewStyle = getOverlayCss(
    { id: "preview", text: text || " ", x: 50, y: 50, color, bg, font, size },
  );

  // Instagram-style editor: full-screen translucent overlay so the
  // composer's video preview stays visible behind. Top bar (Cancel /
  // Done), centered textarea, floating controls just above the
  // keyboard. No vaul Drawer — we don't need the swipe gesture and
  // the drawer's opaque content panel was the source of the "screen
  // turns black" complaint.
  return (
    <div
      role="dialog"
      aria-label={initial ? "Edit text" : "Add text"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1300,
        display: "flex",
        flexDirection: "column",
        background: "rgba(0,0,0,0.32)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Top bar — Cancel / Save */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,255,255,0.92)",
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            padding: "8px 14px",
            borderRadius: 999,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          style={{
            padding: "8px 18px",
            borderRadius: 999,
            border: "none",
            background: "#FF5C35",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 14,
            fontWeight: 800,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(255,92,53,0.4)",
          }}
        >
          Done
        </button>
      </div>

      {/* Text input — flex grows to fill space between top bar and
          controls. Textarea picks up the live overlay style so the user
          sees the exact result while typing. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 22px",
          minHeight: 0,
        }}
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type something…"
          rows={3}
          style={{
            ...previewStyle,
            width: "100%",
            maxWidth: "100%",
            background: previewStyle.background ?? "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            caretColor: "#FF5C35",
            // While typing keep a minimum of 22px so input feels chunky
            // even when the user picked "Small". The pinned overlay still
            // renders at the chosen size — only the editor's typing
            // feedback boosts the floor.
            fontSize: Math.max(
              22,
              typeof previewStyle.fontSize === "number"
                ? previewStyle.fontSize
                : 22,
            ),
          }}
        />
      </div>

      {/* Floating controls — small, glassy, sitting just above the
          on-screen keyboard. Each row is a pill group so the layout
          stays tight on a phone. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "8px 12px 12px",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0))",
        }}
      >
        <ControlRow label="Color">
          {TEXT_COLORS.map((c) => {
            const active = c === color;
            return (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: active
                    ? "2.5px solid #fff"
                    : "1.5px solid rgba(255,255,255,0.42)",
                  boxShadow: active
                    ? "0 0 0 1px rgba(0,0,0,0.45)"
                    : undefined,
                  background: c,
                  cursor: "pointer",
                  padding: 0,
                }}
              />
            );
          })}
        </ControlRow>

        <ControlRow label="Background">
          {TEXT_OVERLAY_BGS.map((b) => (
            <PillButton
              key={b}
              active={b === bg}
              onClick={() => setBg(b)}
              aria-label={`Background ${b}`}
            >
              {b === "none" ? "None" : b === "scrim" ? "Scrim" : "Fill"}
            </PillButton>
          ))}
        </ControlRow>

        <ControlRow label="Font">
          {TEXT_OVERLAY_FONTS.map((f) => (
            <PillButton
              key={f}
              active={f === font}
              onClick={() => setFont(f)}
              aria-label={`Font ${f}`}
              style={{
                fontFamily:
                  f === "sans"
                    ? "DM Sans, sans-serif"
                    : f === "serif"
                      ? "Fraunces, Georgia, serif"
                      : "ui-monospace, Menlo, monospace",
              }}
            >
              {f === "sans" ? "Sans" : f === "serif" ? "Serif" : "Mono"}
            </PillButton>
          ))}
        </ControlRow>

        <ControlRow label="Size">
          {TEXT_OVERLAY_SIZES.map((s) => (
            <PillButton
              key={s}
              active={s === size}
              onClick={() => setSize(s)}
              aria-label={`Size ${s}`}
            >
              {s === "s" ? "S" : s === "m" ? "M" : "L"}
            </PillButton>
          ))}
        </ControlRow>

        {/* Timing — only when the composer passed a clip duration.
            Drag thumbs to scope when the overlay is visible during
            playback. Defaults to the whole clip. */}
        {clipDurationMs && clipDurationMs > 0 ? (
          <ControlRow label="When">
            <TimingRange
              durationMs={clipDurationMs}
              startMs={startMs}
              endMs={endMs}
              onChange={(s, e) => {
                setStartMs(s);
                setEndMs(e);
              }}
            />
          </ControlRow>
        ) : null}

        {/* Delete button (edit mode only) — sits below the controls so
            it's reachable without scrolling past them. */}
        {onDelete ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              paddingTop: 4,
            }}
          >
            <button
              type="button"
              onClick={onDelete}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,90,90,0.6)",
                background: "rgba(255,90,90,0.18)",
                color: "#FFB4B4",
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 700,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

type DraftRow = {
  id: string;
  content: string | null;
  media_thumbnail_url: string | null;
  edit_metadata: ClipEditMetadata | null;
  created_at: string;
};

function formatDraftWhen(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = ms / 60000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.floor(min)}m ago`;
  const hr = min / 60;
  if (hr < 24) return `${Math.floor(hr)}h ago`;
  const d = hr / 24;
  if (d < 7) return `${Math.floor(d)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function DraftsListOverlay({
  onPick,
  onCancel,
}: {
  onPick: (draft: ResumableDraft) => void;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    try {
      const r = await fetch("/api/me/clip-drafts", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) {
        setError(j?.error ?? "Could not load drafts");
        return;
      }
      setRows((j.drafts ?? []) as DraftRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load drafts");
    }
  }, []);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  const handleDelete = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this draft?")) {
      return;
    }
    // Optimistic remove; revert on failure.
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
    try {
      const r = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Delete failed");
    } catch {
      await fetchDrafts();
    }
  };

  return (
    <Drawer.Root
      open
      direction="right"
      onOpenChange={(o) => { if (!o) onCancel(); }}
    >
      <Drawer.Portal>
        <Drawer.Overlay style={composerVaulOverlayStyle} />
        <Drawer.Content
          style={{
            ...composerVaulContentStyle,
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
            fontFamily: "DM Sans, sans-serif",
          }}
          aria-describedby={undefined}
        >
          <Drawer.Title style={composerVaulHiddenTitleStyle}>Drafts</Drawer.Title>
          {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.85)",
            fontSize: 15,
            fontWeight: 600,
            padding: 4,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <span
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 18,
            fontWeight: 800,
          }}
        >
          Drafts
        </span>
        <span style={{ width: 56 }} />
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "8px 0",
        }}
      >
        {error ? (
          <p
            style={{
              padding: "32px 24px",
              color: "rgba(255,180,180,0.9)",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            {error}
          </p>
        ) : rows === null ? (
          <p
            style={{
              padding: "32px 24px",
              color: "rgba(255,255,255,0.55)",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            Loading drafts…
          </p>
        ) : rows.length === 0 ? (
          <div
            style={{
              padding: "48px 28px",
              color: "rgba(255,255,255,0.62)",
              fontSize: 14,
              textAlign: "center",
              lineHeight: 1.55,
            }}
          >
            No drafts yet. Hit <strong style={{ color: "#fff" }}>Save draft</strong>
            {" "}from the caption screen to keep a clip private until you&apos;re ready.
          </div>
        ) : (
          rows.map((d) => (
            <div
              key={d.id}
              role="button"
              onClick={() =>
                onPick({
                  id: d.id,
                  content: d.content,
                  edit_metadata: d.edit_metadata,
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 18px",
                cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {/* Thumbnail — filter on the image layer, overlays as
                  unfiltered siblings so colored text stays colored. */}
              <div
                style={{
                  position: "relative",
                  width: 56,
                  height: 88,
                  borderRadius: 8,
                  overflow: "hidden",
                  flexShrink: 0,
                  background: "#1C1C1E",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {d.media_thumbnail_url ? (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: `url(${d.media_thumbnail_url}) center/cover`,
                      filter: d.edit_metadata?.filter
                        ? FILTER_CSS[d.edit_metadata.filter]
                        : undefined,
                    }}
                  />
                ) : null}
                {d.edit_metadata?.text_overlays?.map((o) => (
                  <div
                    key={o.id}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${o.x}%`,
                      top: `${o.y}%`,
                      transform: "translate(-50%, -50%)",
                      pointerEvents: "none",
                      ...getOverlayCss(o, 0.27),
                    }}
                  >
                    {o.text}
                  </div>
                ))}
              </div>
              {/* Caption preview + time */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: d.content ? "#fff" : "rgba(255,255,255,0.55)",
                    lineHeight: 1.35,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {d.content?.trim() || "Untitled draft"}
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 11.5,
                    color: "rgba(255,255,255,0.5)",
                    letterSpacing: "0.02em",
                  }}
                >
                  {formatDraftWhen(d.created_at)}
                </div>
              </div>
              {/* Delete */}
              <button
                type="button"
                aria-label="Delete draft"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(d.id);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,140,140,0.85)",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 10px",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Cover-fit drawImage from a live <video> onto our 9:16 record canvas.
 *  The canvas is the recording's true source of truth (MediaRecorder
 *  reads from canvas.captureStream() — see startRecording below), so
 *  this is what shapes the saved clip's framing. */
function drawVideoToCanvas(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const sourceAspect = vw / vh;
  const targetAspect = cw / ch;

  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;
  if (sourceAspect > targetAspect) {
    // Source is wider than 9:16 → crop the sides.
    sh = vh;
    sw = vh * targetAspect;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    // Source is narrower than 9:16 → crop top + bottom.
    sw = vw;
    sh = vw / targetAspect;
    sx = 0;
    sy = (vh - sh) / 2;
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);
}

/** Shape of the draft data passed when resuming editing of a saved
 *  draft. Comes straight from /api/me/clip-drafts (or the publish
 *  response after the user saved). */
export type ResumableDraft = {
  id: string;
  content: string | null;
  edit_metadata: ClipEditMetadata | null;
};

type Props = {
  onClose: () => void;
  onPosted: () => void;
  /** Centre point (viewport px) the sheet grows out of on open. */
  origin?: { x: number; y: number };
  /** When provided, the composer mounts directly into the review/edit
   *  phase with the draft's video, caption, and effects pre-loaded.
   *  Publishing or re-saving from here PATCHes the existing post
   *  rather than uploading a new one. */
  initialDraft?: ResumableDraft;
  /** When true, the drafts list overlay opens immediately on mount.
   *  Used when the entry point is the Drafts tile in the profile
   *  Clips grid — the user wants to see their drafts, not the camera. */
  openDraftsOnMount?: boolean;
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

export function ClipComposerMobile({
  onClose,
  onPosted,
  origin,
  initialDraft,
  openDraftsOnMount,
}: Props) {
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
  // Held false until the <video> reports its first actual frame
  // (`onPlaying`). Lets us fade the camera in instead of flashing
  // black between "stream arrived" and "first frame painted" — the
  // gap that read as "janky" on iOS Safari.
  const [videoReady, setVideoReady] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedAccumRef = useRef(0);
  const elapsedTickRef = useRef<number | null>(null);
  const elapsedSegmentStartRef = useRef<number>(0);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Offscreen 9:16 canvas the recorder reads from instead of the live
  // camera stream. The draw loop below copies the preview video's
  // current frame onto this canvas every RAF tick, so flipping the
  // camera mid-record just changes which frames land in the canvas —
  // MediaRecorder is bound to canvas.captureStream(), not to the
  // camera, so it never notices the swap. Output is fixed at 720×1280.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRafRef = useRef<number | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  // Trim scrubber bar — used to compute pct from pointer X.
  const trimBarRef = useRef<HTMLDivElement | null>(null);
  // Gesture state for text overlays. Tracks all live pointers so we
  // can switch between single-finger drag and two-finger pinch.
  //
  // - <5px movement with one pointer = tap (opens editor on pointer up)
  // - ≥5px movement with one pointer = drag (updates x/y in real time)
  // - second pointer lands on the same overlay = pinch (updates scale)
  //   The initial distance + scale are captured when the 2nd pointer
  //   arrives; current distance / initial distance × initial scale.
  const overlayGestureRef = useRef<{
    id: string;
    pointers: Map<number, { x: number; y: number }>;
    dragged: boolean;
    startX: number;
    startY: number;
    pinching: boolean;
    initialDist: number;
    initialScale: number;
  } | null>(null);
  // If we're resuming a draft, this holds the existing post's id.
  // Cleared on Retake so a new recording publishes as a fresh post.
  const draftIdRef = useRef<string | null>(initialDraft?.id ?? null);
  // Last tap timestamp on the camera preview — second tap within 350ms
  // counts as a double-tap and flips the camera (TikTok pattern).
  const lastCameraTapRef = useRef(0);
  const focusFadeTimerRef = useRef<number | null>(null);
  // Focus indicator point (in CSS pixels relative to the video element).
  // The `key` reuses the timestamp so each tap restarts the animation.
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number; key: number } | null>(null);

  // ---------- edit-room state ----------
  // All effects are lossless (applied at playback). Persisted via the
  // posts.edit_metadata JSONB column when the clip publishes.
  const [speed, setSpeed] = useState<ClipSpeed>(1);
  const [filterPreset, setFilterPreset] = useState<FilterPreset | null>(null);
  const [trimRange, setTrimRange] = useState<{ start_ms: number; end_ms: number } | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  // Which bottom tray is showing in the edit room.
  const [activeEditTray, setActiveEditTray] = useState<"trim" | "filters" | null>(null);
  // When non-null, the text-overlay editor modal is open. `null` for a
  // brand-new overlay being drafted, otherwise the overlay being edited.
  const [editingOverlay, setEditingOverlay] = useState<TextOverlay | null | undefined>(undefined);

  // Reset all edit-room state when the user retakes — fresh clip, fresh
  // canvas. Triggered by `phase` flipping back to "intro". Also clears
  // draftIdRef so the next publish from a fresh recording creates a
  // brand-new post instead of overwriting the resumed draft.
  useEffect(() => {
    if (phase === "intro") {
      setSpeed(1);
      setFilterPreset(null);
      setTrimRange(null);
      setTextOverlays([]);
      setActiveEditTray(null);
      setEditingOverlay(undefined);
      draftIdRef.current = null;
    }
  }, [phase]);

  // Drafts box overlay — true when the user is browsing their saved
  // drafts on the intro screen. Pre-opened when the composer was
  // launched from the Drafts tile in the profile Clips grid.
  const [draftsOpen, setDraftsOpen] = useState(openDraftsOnMount ?? false);

  // Shared "load this draft into the composer" callback. Used both by
  // the initialDraft mount effect and by picking a draft from the
  // drafts list overlay.
  const loadDraft = useCallback((draft: ResumableDraft) => {
    draftIdRef.current = draft.id;
    setCaption(draft.content ?? "");
    const meta = draft.edit_metadata;
    setSpeed(meta?.speed ?? 1);
    setFilterPreset(meta?.filter ?? null);
    setTrimRange(meta?.trim ?? null);
    setTextOverlays(meta?.text_overlays ?? []);
    setRecordedUrl(`/api/posts/${draft.id}/media`);
    setPhase("review");
    setDraftsOpen(false);
  }, []);

  // Hydrate from initialDraft on first mount. Once.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (initialDraft) loadDraft(initialDraft);
  }, [initialDraft, loadDraft]);

  // Probe the loaded video's true duration so the trim scrubber and
  // any other duration-dependent UI have authoritative numbers. Runs
  // for both new recordings (where the timer's elapsedMs is best-
  // effort) and resumed drafts (where we have no timer at all).
  useEffect(() => {
    const v = playbackVideoRef.current;
    if (!v) return;
    const onLoaded = () => {
      if (v.duration && Number.isFinite(v.duration) && v.duration > 0) {
        setElapsedMs(Math.round(v.duration * 1000));
      }
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [recordedUrl]);

  // Apply playback speed live whenever it changes (or the playback
  // element first mounts).
  useEffect(() => {
    const v = playbackVideoRef.current;
    if (v) v.playbackRate = speed;
  }, [speed, recordedUrl]);

  // Apply trim range live in the edit room: clamp playback to
  // [start_ms, end_ms] and loop within that range. Same behavior as
  // ClipViewerMobile (reader side). If trimRange is null, the full
  // clip plays normally.
  useEffect(() => {
    const v = playbackVideoRef.current;
    if (!v || !trimRange) return;
    const startSec = trimRange.start_ms / 1000;
    const endSec = trimRange.end_ms / 1000;
    const onLoaded = () => {
      try {
        if (v.currentTime < startSec || v.currentTime > endSec) {
          v.currentTime = startSec;
        }
      } catch {
        /* not yet seekable */
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
  }, [trimRange, recordedUrl]);

  // Dispatch for the side-rail tool buttons in the edit room.
  // - Speed is a stateless cycle (1 → 2 → 0.5 → 1).
  // - Filters / Trim toggle a bottom tray.
  // - Text opens the overlay editor modal in "new" mode (null overlay).
  const handleEditTool = useCallback(
    (key: string) => {
      if (key === "speed") {
        setSpeed((prev) => {
          const idx = ALLOWED_SPEEDS.indexOf(prev);
          const next = ALLOWED_SPEEDS[(idx + 1) % ALLOWED_SPEEDS.length];
          return next as ClipSpeed;
        });
        return;
      }
      if (key === "filters") {
        setActiveEditTray((prev) => (prev === "filters" ? null : "filters"));
        return;
      }
      if (key === "trim") {
        setActiveEditTray((prev) => (prev === "trim" ? null : "trim"));
        return;
      }
      if (key === "text") {
        setActiveEditTray(null);
        setEditingOverlay(null);
        return;
      }
    },
    [],
  );

  // Build the effective edit_metadata to send with publish-clip. Returns
  // null when no effect is set (so the column stays NULL).
  const collectedEditMetadata = useMemo<ClipEditMetadata | null>(() => {
    const m: ClipEditMetadata = {};
    if (speed !== 1) m.speed = speed;
    if (filterPreset) m.filter = filterPreset;
    if (trimRange) m.trim = trimRange;
    if (textOverlays.length > 0) m.text_overlays = textOverlays;
    return Object.keys(m).length > 0 ? m : null;
  }, [speed, filterPreset, trimRange, textOverlays]);

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
      // No resolution / aspect-ratio constraints. iOS Safari interprets
      // either as "crop the native sensor to make this fit" — which is
      // exactly the "zoomed-in" feeling we kept hitting. With just
      // facingMode, Safari hands back its native portrait preset
      // (typically 1280×720 oriented for the device), and CSS `cover`
      // does only a tiny crop instead of a brutal one.
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next },
        // Audio constraints: keep echoCancellation (helps voice-over-mic
        // bleed) but disable noiseSuppression + autoGainControl, which
        // are the usual culprits behind "metallic / lispy / pumping"
        // audio in mobile webview recordings. Request stereo + 48kHz
        // so we don't get downsampled to mono 16kHz.
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        },
      });
      // Stop any prior tracks before swapping (front/back toggle).
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return s;
      });
      setFacing(next);
      setPermState("granted");
      // New stream → wait for the new first frame before showing.
      setVideoReady(false);
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

  // Toggle front ↔ back. Two paths:
  //  - Pre-record: full re-acquire via requestCamera() (cleans up cleanly).
  //  - Mid-record / paused: swap only the video track inside the existing
  //    MediaStream so MediaRecorder keeps consuming the same source — the
  //    recording continues with the new camera instead of ending. iOS
  //    Safari supports MediaStream.removeTrack/addTrack and MediaRecorder
  //    survives the swap with a tiny visible glitch at the seam (matches
  //    TikTok / Reels behavior). Any failure falls back to the full re-
  //    acquire, which ends recording cleanly.
  const flipCamera = useCallback(async () => {
    const next: Facing = facing === "user" ? "environment" : "user";

    if (phase !== "recording" && phase !== "paused") {
      void requestCamera(next);
      return;
    }
    if (!stream) {
      void requestCamera(next);
      return;
    }

    setVideoReady(false);
    try {
      // Audio: only request video, keep the existing audio track + recorder.
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next },
        audio: false,
      });
      const newVideo = newStream.getVideoTracks()[0];
      if (!newVideo) throw new Error("No video track on new stream");

      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
      stream.addTrack(newVideo);

      // Some browsers need a re-bind even when the MediaStream ref is the
      // same — without this iOS sometimes keeps showing the frozen last
      // frame of the old track.
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
      }
      setFacing(next);
    } catch {
      // Anything goes wrong → full restart (will end the current recording).
      void requestCamera(next);
    }
  }, [phase, facing, stream, requestCamera]);

  // Attach the live stream to the <video> preview every time the
  // stream changes (initial grant + facing-toggle re-grant). Also
  // kicks off the canvas draw loop the first time we have a stream
  // — once running, it stays running for the rest of the composer's
  // life so the recording surface is always ready.
  useEffect(() => {
    const v = previewVideoRef.current;
    if (v && stream) {
      v.srcObject = stream;
    }
    if (!stream) return;

    if (!canvasRef.current) {
      const c = document.createElement("canvas");
      c.width = 720;
      c.height = 1280;
      canvasRef.current = c;
    }

    if (drawRafRef.current === null) {
      const loop = () => {
        const vid = previewVideoRef.current;
        const cnv = canvasRef.current;
        if (vid && cnv && vid.readyState >= 2) {
          drawVideoToCanvas(cnv, vid);
        }
        drawRafRef.current = window.requestAnimationFrame(loop);
      };
      drawRafRef.current = window.requestAnimationFrame(loop);
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
      if (focusFadeTimerRef.current !== null) {
        window.clearTimeout(focusFadeTimerRef.current);
      }
      if (drawRafRef.current !== null) {
        cancelAnimationFrame(drawRafRef.current);
        drawRafRef.current = null;
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
    const canvas = canvasRef.current;
    if (!canvas) return;

    chunksRef.current = [];
    elapsedAccumRef.current = 0;
    setElapsedMs(0);

    // The recorder reads from a composite stream: canvas video track
    // (driven by the draw loop, independent of which camera is live)
    // plus the camera's audio track. Flipping the camera mid-record
    // just changes which frames the draw loop is copying — the
    // recorder's view of "the video" never changes.
    const canvasStream = canvas.captureStream(30);
    const audioTracks = stream.getAudioTracks();
    const recordingStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks,
    ]);
    recordingStreamRef.current = recordingStream;

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
    // Recorder options. Audio bitrate explicit so Safari doesn't default
    // to its ~32 kbps mono "speech codec" which sounds compressed and
    // tinny. 128 kbps is the same target as voice memos / IG / TikTok.
    // Video bitrate is left default since the canvas is already 720p-ish.
    const recorderOpts: MediaRecorderOptions = {
      audioBitsPerSecond: 128000,
    };
    if (mimeType) recorderOpts.mimeType = mimeType;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordingStream, recorderOpts);
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

  // ---------- camera tap gestures ----------

  // Single tap → focus indicator + best-effort applyConstraints
  // (iOS Safari ignores `pointsOfInterest`; on Android Chrome where it
  //  is supported, the camera will actually refocus). The indicator is
  //  the visible UX either way.
  // Double tap (within 350ms) → flip camera + cancel the focus
  //  indicator from the first tap so it doesn't linger.
  const handleCameraTap = useCallback(
    (e: React.MouseEvent<HTMLVideoElement>) => {
      const now = Date.now();
      const rect = e.currentTarget.getBoundingClientRect();
      // Mirror the X coordinate when the front camera is mirrored, so
      // the focus ring appears where the user's finger actually was.
      const rawX = e.clientX - rect.left;
      const x = facing === "user" ? rect.width - rawX : rawX;
      const y = e.clientY - rect.top;

      if (now - lastCameraTapRef.current < 350) {
        // Double-tap: wipe the focus indicator + flip.
        lastCameraTapRef.current = 0;
        if (focusFadeTimerRef.current !== null) {
          window.clearTimeout(focusFadeTimerRef.current);
          focusFadeTimerRef.current = null;
        }
        setFocusPoint(null);
        void flipCamera();
        return;
      }
      lastCameraTapRef.current = now;

      // Single-tap: show the focus ring and try the camera API.
      setFocusPoint({ x, y, key: now });
      const track = stream?.getVideoTracks?.()[0];
      if (track) {
        const caps =
          (track.getCapabilities?.() as Record<string, unknown> | undefined) ?? {};
        if ("pointsOfInterest" in caps) {
          const nx = x / rect.width;
          const ny = y / rect.height;
          track
            .applyConstraints({
              advanced: [
                {
                  pointsOfInterest: [{ x: nx, y: ny }],
                  focusMode: "single-shot",
                } as MediaTrackConstraintSet,
              ],
            })
            .catch(() => {
              /* track doesn't support it — visual indicator only */
            });
        }
      }

      if (focusFadeTimerRef.current !== null) {
        window.clearTimeout(focusFadeTimerRef.current);
      }
      focusFadeTimerRef.current = window.setTimeout(() => {
        setFocusPoint(null);
        focusFadeTimerRef.current = null;
      }, 800);
    },
    [flipCamera, stream, facing],
  );

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

  const commitClip = useCallback(async (opts: { asDraft: boolean }) => {
    setPhase("publishing");
    setError(null);
    try {
      const trimmed = caption.trim();
      const tags = extractHashtags(trimmed);

      // RESUME PATH: re-saving / publishing an existing draft. The
      // video is already in R2 and the row already exists — just
      // PATCH the row with the latest caption + effects + status.
      if (draftIdRef.current) {
        const patchRes = await fetch(`/api/posts/${draftIdRef.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: trimmed,
            edit_metadata: collectedEditMetadata,
            status: opts.asDraft ? "draft" : "published",
          }),
        }).then((r) => r.json());
        if (!patchRes?.ok) throw new Error(patchRes?.error || "Update failed");
        onPosted();
        requestClose();
        return;
      }

      // NEW CLIP PATH: needs the recorded blob + R2 upload + insert.
      if (!recordedBlob) return;

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
          edit_metadata: collectedEditMetadata,
          is_draft: opts.asDraft,
        }),
      }).then((r) => r.json());
      if (!pub?.ok) throw new Error(pub?.error || "Publish failed");

      onPosted();
      requestClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish");
      setPhase("caption");
    }
  }, [recordedBlob, caption, elapsedMs, onPosted, requestClose, collectedEditMetadata]);

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

      {/* Drafts entry — top-right corner of the intro. Same chrome
          style as the other corner buttons so it reads as part of the
          camera shell, not a separate page. */}
      <button
        type="button"
        onClick={() => setDraftsOpen(true)}
        aria-label="Open drafts"
        style={{
          ...chromeButton({
            top: "calc(env(safe-area-inset-top, 0px) + 12px)",
            right: 14,
          }),
          width: "auto",
          padding: "0 14px",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.02em",
        }}
      >
        Drafts
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
      {/* 9:16 camera box anchored to the top — matches Instagram Reels
          and TikTok. On screens taller than 9:16 (most modern iPhones)
          the bottom band stays black and the record button lives there.
          On 9:16 screens (iPhone SE) the box fills and chrome overlays
          the bottom of the camera, same as before. */}
      <video
        ref={previewVideoRef}
        autoPlay
        muted
        playsInline
        onPlaying={() => setVideoReady(true)}
        onClick={handleCameraTap}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          aspectRatio: "9 / 16",
          maxHeight: "100%",
          objectFit: "cover",
          background: "#000",
          transform: facing === "user" ? "scaleX(-1)" : "none",
          opacity: videoReady ? 1 : 0,
          transition: "opacity 220ms ease-out",
          cursor: "pointer",
        }}
      />

      {/* Focus ring — appears wherever the user single-taps the preview.
          Animation handles enter + dwell + fade out (vibeFocusPulse,
          800ms). Pointer-events off so it doesn't swallow the next tap. */}
      {focusPoint ? (
        <div
          key={focusPoint.key}
          aria-hidden
          style={{
            position: "absolute",
            left: focusPoint.x,
            top: focusPoint.y,
            width: 64,
            height: 64,
            border: "1.5px solid rgba(255, 224, 102, 0.95)",
            borderRadius: 6,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(0,0,0,0.18)",
            pointerEvents: "none",
            animation: "vibeFocusPulse 800ms ease-out forwards",
          }}
        />
      ) : null}

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

      {/* Camera flip — top-right. Allowed at any phase: while recording
          or paused, flipCamera() does an in-place video track swap so
          the recording keeps going on the new camera. */}
      <button
        type="button"
        onClick={() => void flipCamera()}
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

      {/* Bottom controls — record always dead-center via a 3-column
          grid (left flank · record · right flank). Flanks render
          conditionally; the record cell never shifts. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          justifyItems: "center",
          columnGap: 32,
          paddingInline: 24,
        }}
      >
        {/* Pause / resume — left flank, only after a segment exists */}
        <div style={{ justifySelf: "end" }}>
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
        </div>

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

        {/* Finish — right flank, only after a segment >800ms exists */}
        <div style={{ justifySelf: "start" }}>
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
          ) : null}
        </div>
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

  // Editing room layout (mobile web v1 — chrome only, tools are stubs).
  // 9:16 playback box anchored to the top, matching the live-preview
  // framing so the user's clip stays in the same visual frame across
  // record → edit. Side rail of editing tools floats over the video on
  // the right edge (TikTok pattern). Bottom band holds Retake + Next.
  const editTools: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      key: "text",
      label: "Text",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
          <text x="10" y="15" textAnchor="middle" fontFamily="DM Sans, sans-serif" fontWeight="800" fontSize="14" fill="currentColor">Aa</text>
        </svg>
      ),
    },
    {
      key: "trim",
      label: "Trim",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="6" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="6" cy="14" r="2.4" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 7l9 6M8 13l9-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      key: "filters",
      label: "Filters",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="7" cy="10" r="4.5" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="13" cy="10" r="4.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      ),
    },
    {
      key: "speed",
      label: `Speed ${speed}×`,
      icon: (
        <span
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: "0.02em",
          }}
        >
          {speed}×
        </span>
      ),
    },
  ];

  const renderReview = () => (
    <>
      {/* 9:16 playback box anchored to the top — same framing rule as
          the live preview, so the clip stays in the same on-screen box
          across the record → edit transition. */}
      <video
        ref={playbackVideoRef}
        src={recordedUrl ?? undefined}
        autoPlay
        loop
        playsInline
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          aspectRatio: "9 / 16",
          maxHeight: "100%",
          objectFit: "cover",
          background: "#000",
          filter: filterPreset ? FILTER_CSS[filterPreset] : undefined,
        }}
      />

      {/* Text overlays — positioned in %-coords inside the 9:16
          playback box. Tap to open the editor; drag (>5px) to
          reposition. Pointer capture keeps the move events glued to
          this element even when the finger slides off it. */}
      {textOverlays.map((o) => (
        <div
          key={o.id}
          role="button"
          aria-label={`Edit overlay: ${o.text}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const g = overlayGestureRef.current;
            if (g && g.id === o.id) {
              // Second (or third+) pointer on the same overlay → pinch.
              g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (g.pointers.size >= 2 && !g.pinching) {
                const pts = [...g.pointers.values()];
                g.pinching = true;
                g.initialDist = Math.hypot(
                  pts[0].x - pts[1].x,
                  pts[0].y - pts[1].y,
                );
                g.initialScale = o.scale ?? 1;
              }
            } else {
              overlayGestureRef.current = {
                id: o.id,
                pointers: new Map([
                  [e.pointerId, { x: e.clientX, y: e.clientY }],
                ]),
                dragged: false,
                startX: e.clientX,
                startY: e.clientY,
                pinching: false,
                initialDist: 0,
                initialScale: o.scale ?? 1,
              };
            }
          }}
          onPointerMove={(e) => {
            const g = overlayGestureRef.current;
            if (!g || g.id !== o.id) return;
            g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (g.pinching && g.pointers.size >= 2 && g.initialDist > 0) {
              const pts = [...g.pointers.values()];
              const dist = Math.hypot(
                pts[0].x - pts[1].x,
                pts[0].y - pts[1].y,
              );
              const scale = Math.max(
                0.4,
                Math.min(3, g.initialScale * (dist / g.initialDist)),
              );
              setTextOverlays((prev) =>
                prev.map((p) => (p.id === o.id ? { ...p, scale } : p)),
              );
              return;
            }

            // Single-pointer drag.
            const dx = e.clientX - g.startX;
            const dy = e.clientY - g.startY;
            if (!g.dragged && Math.hypot(dx, dy) > 5) g.dragged = true;
            if (!g.dragged) return;
            const rect = playbackVideoRef.current?.getBoundingClientRect();
            if (!rect) return;
            const pctX = ((e.clientX - rect.left) / rect.width) * 100;
            const pctY = ((e.clientY - rect.top) / rect.height) * 100;
            const x = Math.max(2, Math.min(98, pctX));
            const y = Math.max(2, Math.min(98, pctY));
            setTextOverlays((prev) =>
              prev.map((p) => (p.id === o.id ? { ...p, x, y } : p)),
            );
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            const g = overlayGestureRef.current;
            if (!g || g.id !== o.id) return;
            g.pointers.delete(e.pointerId);
            if (g.pointers.size === 0) {
              const wasTap = !g.dragged && !g.pinching;
              overlayGestureRef.current = null;
              if (wasTap) setEditingOverlay(o);
            } else if (g.pointers.size === 1 && g.pinching) {
              // Dropped from pinch back to a single drag — reset drag
              // tracking origin to the remaining pointer's spot.
              g.pinching = false;
              const remaining = [...g.pointers.values()][0];
              g.startX = remaining.x;
              g.startY = remaining.y;
              g.dragged = true;
            }
          }}
          onPointerCancel={(e) => {
            const g = overlayGestureRef.current;
            if (!g || g.id !== o.id) return;
            g.pointers.delete(e.pointerId);
            if (g.pointers.size === 0) overlayGestureRef.current = null;
          }}
          style={{
            position: "absolute",
            left: `${o.x}%`,
            top: `${o.y}%`,
            transform: "translate(-50%, -50%)",
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
            ...getOverlayCss(o),
          }}
        >
          {o.text}
        </div>
      ))}

      {/* Text overlay editor modal — shown when editingOverlay !== undefined.
          null means "drafting a new one", a TextOverlay means "editing it". */}
      {editingOverlay !== undefined ? (
        <TextOverlayEditor
          initial={editingOverlay}
          onSave={(o) => {
            setTextOverlays((prev) => {
              const exists = prev.some((p) => p.id === o.id);
              return exists
                ? prev.map((p) => (p.id === o.id ? o : p))
                : [...prev, o];
            });
            setEditingOverlay(undefined);
          }}
          onDelete={
            editingOverlay !== null
              ? () => {
                  const id = editingOverlay.id;
                  setTextOverlays((prev) => prev.filter((p) => p.id !== id));
                  setEditingOverlay(undefined);
                }
              : undefined
          }
          onCancel={() => setEditingOverlay(undefined)}
          clipDurationMs={elapsedMs}
        />
      ) : null}

      {/* Trim scrubber — bar + two draggable thumbs + time labels.
          Shown when the Trim tool is active. Minimum 0.5s between
          thumbs so the clip can't collapse to zero length. */}
      {activeEditTray === "trim" && elapsedMs > 0 ? (() => {
        const totalMs = elapsedMs;
        const startMs = trimRange?.start_ms ?? 0;
        const endMs = trimRange?.end_ms ?? totalMs;
        const startPct = (startMs / totalMs) * 100;
        const endPct = (endMs / totalMs) * 100;
        const updateThumb = (clientX: number, thumb: "start" | "end") => {
          const rect = trimBarRef.current?.getBoundingClientRect();
          if (!rect) return;
          const pctRaw = (clientX - rect.left) / rect.width;
          const pct = Math.max(0, Math.min(1, pctRaw));
          const ms = Math.round(pct * totalMs);
          setTrimRange((prev) => {
            const curStart = prev?.start_ms ?? 0;
            const curEnd = prev?.end_ms ?? totalMs;
            const minGap = 500;
            if (thumb === "start") {
              return {
                start_ms: Math.max(0, Math.min(ms, curEnd - minGap)),
                end_ms: curEnd,
              };
            }
            return {
              start_ms: curStart,
              end_ms: Math.min(totalMs, Math.max(ms, curStart + minGap)),
            };
          });
        };

        const thumbStyle: React.CSSProperties = {
          position: "absolute",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
          touchAction: "none",
          cursor: "grab",
        };

        return (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
              padding: "10px 22px",
            }}
          >
            <div
              ref={trimBarRef}
              style={{
                position: "relative",
                height: 36,
              }}
            >
              {/* Track */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: 6,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.22)",
                }}
              />
              {/* Selected range */}
              <div
                style={{
                  position: "absolute",
                  left: `${startPct}%`,
                  width: `${endPct - startPct}%`,
                  top: "50%",
                  transform: "translateY(-50%)",
                  height: 6,
                  borderRadius: 999,
                  background: "#FF5C35",
                }}
              />
              {/* Start thumb */}
              <div
                aria-label="Trim start"
                role="slider"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    updateThumb(e.clientX, "start");
                  }
                }}
                onPointerUp={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                style={{ ...thumbStyle, left: `${startPct}%` }}
              />
              {/* End thumb */}
              <div
                aria-label="Trim end"
                role="slider"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                    updateThumb(e.clientX, "end");
                  }
                }}
                onPointerUp={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                style={{ ...thumbStyle, left: `${endPct}%` }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 6,
                fontFamily: "DM Sans, sans-serif",
                fontWeight: 700,
                fontSize: 12,
                color: "rgba(255,255,255,0.92)",
                letterSpacing: "0.02em",
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              <span>{formatMs(startMs)}</span>
              <span>{formatMs(endMs)}</span>
            </div>
          </div>
        );
      })() : null}

      {/* Filter chip tray — sits just above the bottom action bar when
          the Filters tool is active. Tap a chip to apply (toggle off
          by tapping the same chip again, or the None chip). */}
      {activeEditTray === "filters" ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
            padding: "10px 14px",
            display: "flex",
            gap: 10,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {([null, ...FILTER_PRESETS] as const).map((p) => {
            const active = (filterPreset ?? null) === p;
            const label =
              p === null
                ? "None"
                : p === "bw"
                  ? "B&W"
                  : p[0].toUpperCase() + p.slice(1);
            return (
              <button
                key={p ?? "none"}
                type="button"
                onClick={() => setFilterPreset(p)}
                style={{
                  flexShrink: 0,
                  padding: "8px 14px",
                  borderRadius: 999,
                  border: active
                    ? "1.5px solid #FF5C35"
                    : "1px solid rgba(255,255,255,0.36)",
                  background: active
                    ? "rgba(255,92,53,0.18)"
                    : "rgba(0,0,0,0.42)",
                  color: "#fff",
                  fontFamily: "DM Sans, sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: "0.02em",
                  cursor: "pointer",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Top chrome — duration badge centered, close X top-left, "Edit"
          label top-right to set context. */}
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
      <button
        type="button"
        onClick={requestClose}
        aria-label="Discard"
        style={chromeButton({ top: "calc(env(safe-area-inset-top, 0px) + 12px)", left: 14 })}
      >
        ✕
      </button>

      {/* Right tool rail — vertical stack of icon buttons over the
          right edge of the video. Each is a stub for now (sets a
          brief "Coming soon" toast). Order roughly matches TikTok's
          edit screen: text, trim, filters, music, speed. */}
      <div
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top, 0px) + 76px)",
          right: 12,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {editTools.map((tool) => (
          <button
            key={tool.key}
            type="button"
            onClick={() => handleEditTool(tool.key)}
            aria-label={tool.label}
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.28)",
              background: "rgba(0,0,0,0.42)",
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      {/* Bottom action bar — Retake (returns to camera) / Next (caption). */}
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => void commitClip({ asDraft: true })}
            style={{
              background: "transparent",
              border: "none",
              color: "#1C1C1E",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: "7px 4px",
              opacity: 0.78,
            }}
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => void commitClip({ asDraft: false })}
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
            {draftIdRef.current ? "Publish" : "Post"}
          </button>
        </div>
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

      {/* Drafts list overlay — z-index above everything else when open. */}
      {draftsOpen ? (
        <DraftsListOverlay
          onPick={loadDraft}
          onCancel={() => setDraftsOpen(false)}
        />
      ) : null}
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
