"use client";

import { useEffect, useRef } from "react";

// Ring follow time constant: the ring covers 90% of a jump in ~40ms,
// whatever the refresh rate.
const RING_TAU_MS = 17;

/**
 * Custom cursor — coral dot that snaps to the pointer + a thin ring that
 * eases behind it. Both dot and ring grow + brighten when hovering over
 * anything interactive. Skipped on touch / coarse-pointer devices via the
 * `(pointer: fine)` media query.
 *
 * The native cursor is hidden, so the dot IS the pointer: it is written
 * straight from mousemove, with no easing. The ring follows on a
 * time-based curve, a = 1 - e^(-dt/TAU), so it trails the same at 60Hz,
 * 120Hz or a throttled 30fps (a fixed per-frame lerp slowed down with
 * the refresh rate). Its rAF loop stops once the ring has caught up and
 * the next move restarts it, so a still mouse costs no frames.
 * public/html/profile.html, messages.html and onboarding.html run the
 * same follow.
 *
 * One cursor across iframe boundaries. iframes are an event boundary —
 * once the pointer enters one, the parent doc stops getting mousemove. To
 * keep a single cursor following the pointer seamlessly across (e.g.
 * LeftNav ↔ /messages iframe content), embedded iframe pages drop their
 * internal cursor and postMessage their mouse state up here. We translate
 * the iframe-relative coords into parent viewport coords using the
 * iframe's bounding rect.
 */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let rx = mx;
    let ry = my;
    let raf = 0;
    let last = 0;

    dot.style.transform = `translate3d(${mx - 4}px, ${my - 4}px, 0)`;
    ring.style.transform = `translate3d(${rx - 14}px, ${ry - 14}px, 0)`;
    document.body.classList.add("vibe-cursor-active");

    function hideCursor() {
      dot!.classList.add("vibe-cursor-hidden");
      ring!.classList.add("vibe-cursor-hidden");
    }
    function showCursor() {
      dot!.classList.remove("vibe-cursor-hidden");
      ring!.classList.remove("vibe-cursor-hidden");
    }
    function setHover(on: boolean) {
      if (on) {
        dot!.classList.add("hover");
        ring!.classList.add("hover");
      } else {
        dot!.classList.remove("hover");
        ring!.classList.remove("hover");
      }
    }

    // Both the document's mousemove and the iframe's forwarded moves land
    // here, so the ring restarts from either.
    function applyPosition(x: number, y: number) {
      mx = x;
      my = y;
      dot!.style.transform = `translate3d(${mx - 4}px, ${my - 4}px, 0)`;
      if (dot!.classList.contains("vibe-cursor-hidden")) showCursor();
      kick();
    }

    function onMove(e: MouseEvent) {
      applyPosition(e.clientX, e.clientY);
    }
    function onDown() {
      dot!.classList.add("clicking");
    }
    function onUp() {
      dot!.classList.remove("clicking");
    }

    const HOVER_SEL =
      "a, button, input, select, textarea, label, [role='button'], [role='tab'], [data-cursor-hover]";
    function onOver(e: MouseEvent) {
      const t = e.target as Element | null;
      if (t && t.closest?.(HOVER_SEL)) setHover(true);
    }
    function onOut(e: MouseEvent) {
      const t = e.target as Element | null;
      if (t && t.closest?.(HOVER_SEL)) setHover(false);
    }

    function tick(t: number) {
      // The first frame after a rest has no previous timestamp: assume one
      // 60Hz frame. The clamp bounds the step after a stall or a hidden tab.
      const dt = last ? Math.min(t - last, 64) : 16.7;
      last = t;
      const a = 1 - Math.exp(-dt / RING_TAU_MS);
      rx += (mx - rx) * a;
      ry += (my - ry) * a;
      ring!.style.transform = `translate3d(${rx - 14}px, ${ry - 14}px, 0)`;
      if (Math.abs(mx - rx) + Math.abs(my - ry) < 0.2) {
        raf = 0;
        last = 0;
      } else {
        raf = requestAnimationFrame(tick);
      }
    }
    function kick() {
      if (!raf) raf = requestAnimationFrame(tick);
    }

    // ── iframe → parent cursor forwarding ─────────────────────────────
    // Embedded iframe pages (e.g. /messages → /html/messages.html) skip
    // their own cursor and postMessage their mouse state up here so a
    // single cursor follows the pointer across the boundary. We look up
    // the originating iframe by matching event.source against each
    // iframe.contentWindow.
    function iframeForSource(src: MessageEventSource | null): HTMLIFrameElement | null {
      if (!src) return null;
      const frames = document.querySelectorAll("iframe");
      for (const f of Array.from(frames)) {
        if ((f as HTMLIFrameElement).contentWindow === src) return f as HTMLIFrameElement;
      }
      return null;
    }
    function onMessage(e: MessageEvent) {
      const d = e.data as { source?: string; type?: string; x?: number; y?: number } | null;
      if (!d || d.source !== "vibe-cursor") return;
      const frame = iframeForSource(e.source);
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      switch (d.type) {
        case "move":
          if (typeof d.x === "number" && typeof d.y === "number") {
            applyPosition(rect.left + d.x, rect.top + d.y);
          }
          break;
        case "down":
          dot!.classList.add("clicking");
          break;
        case "up":
          dot!.classList.remove("clicking");
          break;
        case "hover-on":
          setHover(true);
          break;
        case "hover-off":
          setHover(false);
          break;
      }
    }
    window.addEventListener("message", onMessage);

    // Off-window hide so the cursor doesn't sit frozen at the edge.
    document.documentElement.addEventListener("mouseleave", hideCursor);
    document.documentElement.addEventListener("mouseenter", showCursor);

    // No loop yet: the ring starts on the dot, and the first move kicks it.
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("message", onMessage);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.documentElement.removeEventListener("mouseleave", hideCursor);
      document.documentElement.removeEventListener("mouseenter", showCursor);
      document.body.classList.remove("vibe-cursor-active");
    };
  }, []);

  return (
    <>
      <div ref={dotRef} className="vibe-cursor vibe-cursor--dot" aria-hidden />
      <div ref={ringRef} className="vibe-cursor vibe-cursor--ring" aria-hidden />
    </>
  );
}
