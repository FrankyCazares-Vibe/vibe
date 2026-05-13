"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Drop-in image cropper.
 *
 * Flow: caller supplies a `File` (or a URL), the modal renders the source
 * image with a fixed-aspect crop frame, the user pans + zooms inside that
 * frame, and on confirm we draw the visible region to a canvas and return
 * a JPEG/PNG `Blob`.
 *
 * The cropper output is always rectangular. Round avatars / squircle org
 * logos are visual-only via CSS at the consume site; the underlying blob
 * stays rectangular which is what every upload pipeline expects.
 */
export type AspectOption = {
  label: string;
  value: number; // width / height
};

/**
 * Optional preview guide rendered on top of the crop viewport. Use to
 * show users what each display surface will actually crop from their
 * banner — e.g. "Desktop" (wide + short, top/bottom clipped) vs "Phone"
 * (narrow + tall, left/right clipped).
 */
export type SafeAreaGuide = {
  label: string;
  /** Aspect ratio (width / height) of the destination display surface. */
  containerAspect: number;
  /** Stroke + label-chip color. */
  color: string;
};

type Props = {
  src: File | string;
  /** When `aspect` is fixed, the user can't change it. When `aspectChoices`
   *  is given, the user picks from the toggle bar (default to first). */
  aspect?: number;
  aspectChoices?: AspectOption[];
  shape?: "rect" | "circle";
  /** Max dimension of the longer output edge, in px. */
  outputMaxSize?: number;
  outputType?: "image/jpeg" | "image/png" | "image/webp";
  outputQuality?: number;
  title?: string;
  /** Outlined preview rectangles drawn on top of the crop frame so the
   *  user can see what each display surface will actually show. */
  safeAreaGuides?: SafeAreaGuide[];
  onCancel: () => void;
  onConfirm: (blob: Blob, info: { width: number; height: number; aspect: number }) => void;
};

export function ImageCropperModal({
  src,
  aspect,
  aspectChoices,
  shape = "rect",
  outputMaxSize = 1600,
  outputType = "image/jpeg",
  outputQuality = 0.92,
  title = "Adjust image",
  safeAreaGuides,
  onCancel,
  onConfirm,
}: Props) {
  // Resolve the source to a URL the <img> can render. We deliberately
  // don't revoke the object URL on unmount — React 19 strict mode
  // double-mounts components and the cleanup pass would invalidate the
  // URL before the second mount uses it (cropper renders blank). The
  // browser GCs the blob automatically when the document unloads, so
  // the leak is bounded to a few KB per cropper open.
  const imgUrl = useMemo(() => {
    if (typeof src === "string") return src;
    return URL.createObjectURL(src);
  }, [src]);

  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);

  const initialAspect =
    aspect ?? aspectChoices?.[0]?.value ?? 1;
  const [activeAspect, setActiveAspect] = useState<number>(initialAspect);

  // The crop viewport is a fixed-size container; we shrink it to fit the
  // available modal width while keeping the chosen aspect ratio. On
  // narrow viewports (phones < 580px) cap the longest edge to the
  // actual screen width minus the modal's outer + inner padding so the
  // crop frame doesn't bleed off-screen. Updates on resize so rotating
  // the device works.
  const [viewportCap, setViewportCap] = useState(() =>
    typeof window === "undefined"
      ? 540
      : Math.max(220, Math.min(540, window.innerWidth - 76)),
  );
  useEffect(() => {
    const onResize = () => {
      setViewportCap(Math.max(220, Math.min(540, window.innerWidth - 76)));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const viewport = useMemo(() => {
    const w = activeAspect >= 1 ? viewportCap : viewportCap * activeAspect;
    const h = activeAspect >= 1 ? viewportCap / activeAspect : viewportCap;
    return { w, h };
  }, [activeAspect, viewportCap]);

  // Pan / zoom state. `scale` is multiplied against the image's natural
  // size; `pos` is the top-left offset inside the viewport.
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOriginRef = useRef<{
    px: number;
    py: number;
    sx: number;
    sy: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Whenever the image loads OR the aspect/viewport-cap changes,
  // recompute the "minimum scale to cover" so the crop frame is never
  // empty, and recenter the image.
  const fitImage = useCallback(
    (dims: { w: number; h: number }, aspectVal: number) => {
      const vw = aspectVal >= 1 ? viewportCap : viewportCap * aspectVal;
      const vh = aspectVal >= 1 ? viewportCap / aspectVal : viewportCap;
      // "Cover" — image must fully fill the frame. Pick the larger ratio.
      const fit = Math.max(vw / dims.w, vh / dims.h);
      setScale(fit);
      const dispW = dims.w * fit;
      const dispH = dims.h * fit;
      setPos({
        x: (vw - dispW) / 2,
        y: (vh - dispH) / 2,
      });
    },
    [viewportCap],
  );

  // Re-fit when the viewport cap changes (rotate / resize) so the
  // image stays inside the new frame. Defer to the next animation
  // frame so the setState calls don't fire synchronously inside the
  // effect body (which the React 19 hook-lint flags as cascading).
  useEffect(() => {
    if (!imgDims) return;
    const id = window.requestAnimationFrame(() => {
      fitImage(imgDims, activeAspect);
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportCap]);

  const onImgLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const el = e.currentTarget;
      const dims = { w: el.naturalWidth, h: el.naturalHeight };
      setImgDims(dims);
      fitImage(dims, activeAspect);
    },
    [activeAspect, fitImage],
  );

  // User picks a new aspect ratio: recenter against the new frame.
  const pickAspect = (next: number) => {
    setActiveAspect(next);
    if (imgDims) fitImage(imgDims, next);
  };

  // Drag handlers — drag image inside the frame.
  const onPointerDown = (e: React.PointerEvent) => {
    dragOriginRef.current = {
      px: e.clientX,
      py: e.clientY,
      sx: pos.x,
      sy: pos.y,
    };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const o = dragOriginRef.current;
    if (!o) return;
    const dx = e.clientX - o.px;
    const dy = e.clientY - o.py;
    const dispW = (imgDims?.w ?? 0) * scale;
    const dispH = (imgDims?.h ?? 0) * scale;
    // Clamp so the image always covers the viewport.
    const minX = viewport.w - dispW;
    const minY = viewport.h - dispH;
    setPos({
      x: clamp(o.sx + dx, Math.min(minX, 0), 0),
      y: clamp(o.sy + dy, Math.min(minY, 0), 0),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragOriginRef.current = null;
    setDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // Zoom slider value: 1 = "fit" (cover), 4x = max zoom.
  const minScale = useMemo(() => {
    if (!imgDims) return 1;
    return Math.max(viewport.w / imgDims.w, viewport.h / imgDims.h);
  }, [imgDims, viewport]);
  const maxScale = minScale * 4;
  const sliderValue = useMemo(() => {
    if (maxScale === minScale) return 0;
    return (scale - minScale) / (maxScale - minScale);
  }, [scale, minScale, maxScale]);

  const setSliderValue = (v: number) => {
    if (!imgDims) return;
    const newScale = minScale + (maxScale - minScale) * v;
    // Zoom around the viewport center.
    const cx = viewport.w / 2;
    const cy = viewport.h / 2;
    const ratio = newScale / scale;
    const nx = cx - (cx - pos.x) * ratio;
    const ny = cy - (cy - pos.y) * ratio;
    const dispW = imgDims.w * newScale;
    const dispH = imgDims.h * newScale;
    setPos({
      x: clamp(nx, Math.min(viewport.w - dispW, 0), 0),
      y: clamp(ny, Math.min(viewport.h - dispH, 0), 0),
    });
    setScale(newScale);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!imgDims) return;
    const delta = -e.deltaY * 0.001;
    const next = clamp(scale * (1 + delta), minScale, maxScale);
    if (next === scale) return;
    const ratio = next / scale;
    // Zoom around cursor position relative to viewport.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const nx = cx - (cx - pos.x) * ratio;
    const ny = cy - (cy - pos.y) * ratio;
    const dispW = imgDims.w * next;
    const dispH = imgDims.h * next;
    setPos({
      x: clamp(nx, Math.min(viewport.w - dispW, 0), 0),
      y: clamp(ny, Math.min(viewport.h - dispH, 0), 0),
    });
    setScale(next);
  };

  const confirm = useCallback(async () => {
    if (!imgDims || !imgUrl || busy) return;
    setBusy(true);
    try {
      // Compute crop region in source-image pixels.
      const srcX = -pos.x / scale;
      const srcY = -pos.y / scale;
      const srcW = viewport.w / scale;
      const srcH = viewport.h / scale;

      // Output canvas. Pivotal: size off the chosen output resolution
      // (cap at the source image's native pixels — never upscale, that
      // would just add blur without detail). Sizing off the on-screen
      // viewport, like the original code did, capped output at ~540px and
      // looked terrible on retina.
      const viewportLongest = Math.max(viewport.w, viewport.h);
      const srcLongest = Math.max(srcW, srcH);
      const outLongest = Math.min(outputMaxSize, srcLongest);
      const outScale = outLongest / viewportLongest;
      const outW = Math.round(viewport.w * outScale);
      const outH = Math.round(viewport.h * outScale);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imgUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
      });
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, outputType, outputQuality),
      );
      if (!blob) throw new Error("Could not encode image");
      onConfirm(blob, { width: outW, height: outH, aspect: activeAspect });
    } catch (e) {
      console.error("[cropper]", e);
    } finally {
      setBusy(false);
    }
  }, [
    imgDims,
    imgUrl,
    busy,
    pos,
    scale,
    viewport,
    outputMaxSize,
    outputType,
    outputQuality,
    activeAspect,
    onConfirm,
  ]);

  if (typeof document === "undefined" || !imgUrl) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 11000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          background: "#FFFFFF",
          borderRadius: 18,
          padding: 18,
          boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          fontFamily: "DM Sans, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontWeight: 800,
            fontSize: 18,
            color: "#1C1C1E",
          }}
        >
          {title}
        </div>

        {aspectChoices && aspectChoices.length > 1 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {aspectChoices.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => pickAspect(c.value)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  border:
                    activeAspect === c.value
                      ? "1px solid #1C1C1E"
                      : "1px solid rgba(28,28,30,0.14)",
                  background:
                    activeAspect === c.value ? "#1C1C1E" : "transparent",
                  color: activeAspect === c.value ? "#fff" : "#1C1C1E",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}

        <div
          style={{
            position: "relative",
            margin: "0 auto",
            width: viewport.w,
            height: viewport.h,
            background: "#000",
            overflow: "hidden",
            borderRadius: shape === "circle" ? "50%" : 12,
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
            userSelect: "none",
            // The <img> inside is absolutely positioned; without a
            // positioned ancestor here it would escape the viewport
            // and render at the document origin (invisible to the user).
            isolation: "isolate",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgUrl}
            alt=""
            onLoad={onImgLoad}
            draggable={false}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              width: imgDims ? imgDims.w * scale : "auto",
              height: imgDims ? imgDims.h * scale : "auto",
              maxWidth: "none",
              pointerEvents: "none",
            }}
          />
          {safeAreaGuides?.length && shape !== "circle"
            ? safeAreaGuides.map((g) => {
                // Each guide outlines the region the destination
                // surface will actually display, given that surface's
                // aspect ratio and `center/cover` framing. If the
                // surface is wider than our crop (e.g. desktop banner
                // 6:1 vs our crop 3:1) the top + bottom get clipped, so
                // the visible band is shorter. If it's narrower (e.g.
                // phone 2:1 vs 3:1) the left + right get clipped.
                let widthPct = 1;
                let heightPct = 1;
                if (g.containerAspect > activeAspect) {
                  heightPct = activeAspect / g.containerAspect;
                } else if (g.containerAspect < activeAspect) {
                  widthPct = g.containerAspect / activeAspect;
                }
                const leftPct = (1 - widthPct) / 2;
                const topPct = (1 - heightPct) / 2;
                return (
                  <div
                    key={g.label}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${leftPct * 100}%`,
                      top: `${topPct * 100}%`,
                      width: `${widthPct * 100}%`,
                      height: `${heightPct * 100}%`,
                      border: `1.5px dashed ${g.color}`,
                      boxShadow: `0 0 0 1px rgba(0,0,0,0.35) inset`,
                      pointerEvents: "none",
                      borderRadius: 2,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: -9,
                        left: 6,
                        background: g.color,
                        color: "#fff",
                        fontFamily: "DM Sans, sans-serif",
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                        lineHeight: 1,
                      }}
                    >
                      {g.label}
                    </span>
                  </div>
                );
              })
            : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#8A8580" }}>
            ZOOM
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={sliderValue}
            onChange={(e) => setSliderValue(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: "#FF5C35" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: "1px solid rgba(28,28,30,0.12)",
              background: "transparent",
              color: "#1C1C1E",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !imgDims}
            style={{
              padding: "8px 18px",
              borderRadius: 999,
              border: "none",
              background:
                busy || !imgDims ? "rgba(28,28,30,0.18)" : "#FF5C35",
              color: "#fff",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 700,
              cursor: busy || !imgDims ? "default" : "pointer",
              boxShadow:
                busy || !imgDims ? "none" : "0 4px 14px rgba(255,92,53,0.32)",
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
