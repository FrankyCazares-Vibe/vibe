"use client";

import { useEffect, useRef, useState } from "react";

import { rasterizePdf } from "@/lib/pdfjs-cdn";
import type { RedactionBar } from "@/lib/profile/resume-redactions";

type Props = {
  url: string;
  /** "pdf" → rasterize via pdf.js. "image" → render the URL directly. */
  type: "pdf" | "image";
  name: string;
  /** Persisted bars to overlay. Already filtered to the right docIndex
   *  by the caller; we just split them per page on render. */
  bars: RedactionBar[];
  /** Index of this doc in `users.resume_docs`. Stamped onto every bar
   *  the user draws here so the server can scope bars per doc. */
  docIndex?: number;
  /** Owner-only — true on /profile (own page), false in visitor mode.
   *  When true, an "Edit bars" toggle appears and the viewer can draw
   *  new bars or remove existing ones. */
  editable?: boolean;
  /** Called when the user adds or removes a bar in edit mode. Parent
   *  is responsible for merging this back into the full
   *  `users.resume_redactions` array (others docs' bars stay intact). */
  onBarsChange?: (barsForDoc: RedactionBar[]) => void;
  onClose: () => void;
};

/**
 * Full-screen mobile viewer for the user's resume / portfolio.
 * View-only — no drawing or editing on mobile (that surface lives on
 * profile.html). Redaction bars are pulled from
 * `vibeUser.resumeRedactions` (server-persisted, cross-device).
 *
 * For PDFs we rasterize each page to JPEG via pdf.js at scale 1.6,
 * stack the page images vertically, and overlay bars as
 * percentage-positioned absolute children of each page wrap — same
 * coordinate space the desktop viewer uses, so a bar drawn on
 * desktop lands in the right spot on phone.
 *
 * For images, the URL is rendered as a single page so the same
 * page-wrap + bars rendering path applies.
 */
// Pinch-zoom range. 0.8 lets users fit a wider scan into the viewport;
// 4 is enough to read fine print in scanned résumés without exhausting
// the rasterized JPEG (already 1.6× scale during rasterize, so a 4× view
// zoom is ~6.4× effective — still inside the readable range).
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 4;

export function ResumeViewerMobile({
  url,
  type,
  name,
  bars,
  docIndex = 0,
  editable = false,
  onBarsChange,
  onClose,
}: Props) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  // Local copy of bars-for-this-doc so the user sees their drawing
  // immediately (parent sync is async via onBarsChange). Re-seeded
  // whenever the prop changes, e.g. after a server-confirmed save.
  const [localBars, setLocalBars] = useState<RedactionBar[]>(bars);
  useEffect(() => {
    setLocalBars(bars);
  }, [bars]);
  // Owner-only "draw mode" toggle. Off by default — pinch-zoom +
  // scrolling stay on. On flips the pointer handlers in PageWrap from
  // "ignore" to "draw a new bar / tap to delete".
  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinchRef = useRef<{ baseDist: number; baseZoom: number; active: boolean }>({
    baseDist: 0,
    baseZoom: 1,
    active: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (type === "image") {
          if (!cancelled) setPages([url]);
          return;
        }
        const rasterized = await rasterizePdf(url);
        if (cancelled) return;
        if (rasterized.length === 0) {
          setError("Could not render this PDF");
        } else {
          setPages(rasterized);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not open this file");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, type]);

  // Lock page scroll while the viewer is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Pinch-to-zoom on the scroll container. Single-finger touches pass
  // through to native vertical pan; the moment a second finger lands we
  // capture the gesture, preventDefault to suppress scrolling, and drive
  // a CSS variable on the page stack. The variable scales each page
  // wrapper's max-width — bars positioned as % of the wrap scale with it.
  //
  // Also wires double-tap to toggle between 1× and 2× — same gesture
  // iOS Photos uses, gives users a quick "fit / fill" alternative to
  // pinching.
  const lastTapRef = useRef<{ t: number; x: number; y: number }>({
    t: 0,
    x: 0,
    y: 0,
  });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const onStart = (e: TouchEvent) => {
      // While editing bars, pinch + double-tap-to-zoom are suppressed
      // so a finger drawing a rect doesn't accidentally also zoom or
      // toggle the page. Bars are drawn at 1× zoom anyway.
      if (editing) return;
      if (e.touches.length === 2) {
        pinchRef.current = {
          active: true,
          baseDist: dist(e.touches[0]!, e.touches[1]!),
          baseZoom: zoom,
        };
        return;
      }
      // Single-tap path — record for double-tap detection.
      if (e.touches.length === 1) {
        const t = e.touches[0]!;
        const now = Date.now();
        const prev = lastTapRef.current;
        const dt = now - prev.t;
        const dx = Math.abs(t.clientX - prev.x);
        const dy = Math.abs(t.clientY - prev.y);
        if (dt < 320 && dx < 30 && dy < 30) {
          // Double tap → toggle zoom. 1 → 2, anything else → 1.
          setZoom((z) => (z > 1.05 ? 1 : 2));
          lastTapRef.current = { t: 0, x: 0, y: 0 };
        } else {
          lastTapRef.current = { t: now, x: t.clientX, y: t.clientY };
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current.active) {
        e.preventDefault();
        const d = dist(e.touches[0]!, e.touches[1]!);
        const next = Math.max(
          ZOOM_MIN,
          Math.min(
            ZOOM_MAX,
            pinchRef.current.baseZoom * (d / pinchRef.current.baseDist),
          ),
        );
        setZoom(next);
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current.active = false;
    };
    // passive:false so preventDefault during the pinch actually works.
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [zoom, editing]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} viewer`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(20,18,16,0.96)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar — safe-area-padded so it clears the iOS notch */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding:
            "calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          color: "#fff",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
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
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: "DM Sans, sans-serif",
            fontWeight: 600,
            fontSize: 14,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        {editable ? (
          <button
            type="button"
            onClick={() => {
              if (editing) setZoom(1); // reset zoom so the page coords line up
              setEditing((v) => !v);
            }}
            aria-pressed={editing}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: editing
                ? "1px solid #FF5C35"
                : "1px solid rgba(255,255,255,0.18)",
              background: editing ? "#FF5C35" : "rgba(255,255,255,0.06)",
              color: "#fff",
              fontFamily: "DM Sans, sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            {editing ? "Done" : "Edit bars"}
          </button>
        ) : null}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open original"
          style={{
            padding: "8px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          Open
        </a>
      </header>

      {/* Zoom reset pill — only visible when the user has zoomed past
          1×. Pinch ↔ this button are the two ways back to fit-to-width. */}
      {zoom > 1.02 ? (
        <button
          type="button"
          onClick={() => setZoom(1)}
          aria-label="Reset zoom"
          style={{
            position: "absolute",
            top: "calc(env(safe-area-inset-top, 0px) + 56px)",
            right: 14,
            zIndex: 2,
            padding: "6px 12px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.22)",
            background: "rgba(20,18,16,0.78)",
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {Math.round(zoom * 100)}% · Reset
        </button>
      ) : null}

      {/* Scroll area with stacked pages. When the user pinches past 1x
          the pages widen past the viewport, so overflowX flips to auto
          to allow horizontal pan. `touch-action: pan-y` makes single-
          finger gestures continue to vertical-scroll naturally — two
          fingers go to our pinch handler via the useEffect above. */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: zoom > 1 ? "auto" : "hidden",
          overscrollBehavior: "contain",
          padding: "16px 12px calc(24px + env(safe-area-inset-bottom, 0px))",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          touchAction: "pan-x pan-y",
          // CSS var that PageWrap reads to scale its max-width. Cast
          // through `as` since React's CSS types don't know custom vars.
          ["--rv-zoom" as never]: zoom,
        } as React.CSSProperties}
      >
        {error ? (
          <div
            style={{
              color: "#FFB199",
              padding: "32px 18px",
              textAlign: "center",
              fontSize: 14,
            }}
          >
            {error}
          </div>
        ) : pages === null ? (
          <ViewerSkeleton />
        ) : (
          pages.map((pageUrl, i) => {
            const pageNum = i + 1;
            const pageBars = localBars.filter((b) => b.pageNumber === pageNum);
            return (
              <PageWrap
                key={`${i}-${pageUrl.slice(0, 32)}`}
                pageUrl={pageUrl}
                pageNumber={pageNum}
                bars={pageBars}
                editing={editing}
                onAddBar={(bar) => {
                  const next = [
                    ...localBars,
                    { ...bar, docIndex, pageNumber: pageNum },
                  ];
                  setLocalBars(next);
                  onBarsChange?.(next);
                }}
                onDeleteBar={(barIdxOnPage) => {
                  // Translate page-local idx to absolute idx in localBars.
                  const target = pageBars[barIdxOnPage];
                  if (!target) return;
                  const next = localBars.filter((b) => b !== target);
                  setLocalBars(next);
                  onBarsChange?.(next);
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function PageWrap({
  pageUrl,
  pageNumber,
  bars,
  editing = false,
  onAddBar,
  onDeleteBar,
}: {
  pageUrl: string;
  pageNumber: number;
  bars: RedactionBar[];
  /** When true, pointer drag on the page draws a new bar and tap on a
   *  bar deletes it. When false (the default), bars are static. */
  editing?: boolean;
  onAddBar?: (bar: Pick<RedactionBar, "x" | "y" | "w" | "h">) => void;
  onDeleteBar?: (idxOnPage: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Drag-to-draw state. Stored in % coords (relative to the page wrap)
  // so we can preview the rect using the same coordinate system as
  // persisted bars.
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  const pctFromEvent = (e: React.PointerEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 0, y: 0 };
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!editing || !onAddBar) return;
    // Skip if the press landed on an existing bar — those have their
    // own onClick to delete. Without this, tapping a bar would also
    // start a 0×0 drag.
    const target = e.target as HTMLElement;
    if (target.dataset.bar === "1") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = pctFromEvent(e);
    drawStartRef.current = p;
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!editing || !drawStartRef.current) return;
    const p = pctFromEvent(e);
    const start = drawStartRef.current;
    setDraft({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      w: Math.abs(p.x - start.x),
      h: Math.abs(p.y - start.y),
    });
  };
  const handlePointerEnd = () => {
    if (!editing) return;
    const d = draft;
    drawStartRef.current = null;
    setDraft(null);
    // Drop the rect if it's basically a tap (no drag distance). 1.5% on
    // either axis is roughly a pixel or two of finger travel on phone —
    // anything below that, treat as accidental.
    if (!d || d.w < 1.5 || d.h < 1.5) return;
    onAddBar?.({ x: d.x, y: d.y, w: d.w, h: d.h });
  };

  return (
    <div
      ref={wrapRef}
      data-page={pageNumber}
      onPointerDown={editing ? handlePointerDown : undefined}
      onPointerMove={editing ? handlePointerMove : undefined}
      onPointerUp={editing ? handlePointerEnd : undefined}
      onPointerCancel={editing ? handlePointerEnd : undefined}
      style={{
        position: "relative",
        // Width = viewport-fit base × pinch zoom. At zoom 1 the page
        // tracks the container; at zoom > 1 the page widens past the
        // viewport so the scroll container can horizontal-pan.
        // `flexShrink: 0` keeps the row from collapsing the page when
        // it overflows the cross-axis.
        width: "calc(min(100%, 720px) * var(--rv-zoom, 1))",
        flexShrink: 0,
        borderRadius: 8,
        overflow: "hidden",
        boxShadow: "0 12px 28px rgba(0,0,0,0.35)",
        background: "#fff",
        cursor: editing ? "crosshair" : "default",
        // Suppress native scroll/pinch handling on the page itself
        // while editing — otherwise a one-finger drag tries to scroll.
        touchAction: editing ? "none" : undefined,
        outline: editing ? "2px dashed rgba(255,92,53,0.55)" : "none",
        outlineOffset: editing ? -2 : 0,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pageUrl}
        alt={`Page ${pageNumber}`}
        draggable={false}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          pointerEvents: editing ? "none" : "auto",
        }}
      />
      {bars.map((bar, j) => (
        <div
          key={`bar-${j}`}
          data-bar="1"
          aria-label={editing ? "Tap to remove bar" : undefined}
          onClick={
            editing && onDeleteBar
              ? (e) => {
                  e.stopPropagation();
                  if (
                    typeof window !== "undefined" &&
                    !window.confirm("Remove this bar?")
                  ) {
                    return;
                  }
                  onDeleteBar(j);
                }
              : undefined
          }
          style={{
            position: "absolute",
            left: `${bar.x}%`,
            top: `${bar.y}%`,
            width: `${bar.w}%`,
            height: `${bar.h}%`,
            background: "#1c1c1e",
            // Subtle inner highlight so the bar reads as a deliberate
            // redaction rather than a missing image region.
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.25)",
            cursor: editing ? "pointer" : "default",
            outline: editing ? "1px solid rgba(255,92,53,0.6)" : "none",
          }}
        />
      ))}

      {/* Live draft of the rect being drawn. Same coord system as
          persisted bars; pointer-events none so it doesn't block its
          own pointermove. */}
      {draft ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: `${draft.x}%`,
            top: `${draft.y}%`,
            width: `${draft.w}%`,
            height: `${draft.h}%`,
            background: "rgba(28,28,30,0.6)",
            border: "1px solid rgba(255,92,53,0.95)",
            pointerEvents: "none",
          }}
        />
      ) : null}
    </div>
  );
}

function ViewerSkeleton() {
  return (
    <>
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            width: "100%",
            maxWidth: 720,
            aspectRatio: "8.5/11",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 8,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.08) 50%, transparent 70%)",
              animation: "viewerShimmer 1.4s ease-in-out infinite",
              width: "40%",
            }}
          />
        </div>
      ))}
      <style>{`@keyframes viewerShimmer {
        0% { transform: translateX(-120%); }
        100% { transform: translateX(380%); }
      }`}</style>
    </>
  );
}
