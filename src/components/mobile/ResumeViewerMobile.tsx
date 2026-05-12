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

export function ResumeViewerMobile({ url, type, name, bars, onClose }: Props) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
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
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          active: true,
          baseDist: dist(e.touches[0]!, e.touches[1]!),
          baseZoom: zoom,
        };
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
  }, [zoom]);

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
          pages.map((pageUrl, i) => (
            <PageWrap
              key={`${i}-${pageUrl.slice(0, 32)}`}
              pageUrl={pageUrl}
              pageNumber={i + 1}
              bars={bars.filter((b) => b.pageNumber === i + 1)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PageWrap({
  pageUrl,
  pageNumber,
  bars,
}: {
  pageUrl: string;
  pageNumber: number;
  bars: RedactionBar[];
}) {
  return (
    <div
      data-page={pageNumber}
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
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pageUrl}
        alt={`Page ${pageNumber}`}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
        }}
      />
      {bars.map((bar, j) => (
        <div
          key={`bar-${j}`}
          aria-hidden
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
          }}
        />
      ))}
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
