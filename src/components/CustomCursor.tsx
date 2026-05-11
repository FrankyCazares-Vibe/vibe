"use client";

import { useEffect, useRef } from "react";

/**
 * Custom cursor — coral dot that snaps to the pointer + a thin ring that
 * eases behind it. Both dot and ring grow + brighten when hovering over
 * anything interactive. Skipped on touch / coarse-pointer devices via the
 * `(pointer: fine)` media query.
 *
 * Iframes are an event boundary — once the pointer enters one, the parent
 * doc stops receiving mousemove. To avoid a "stuck twin cursor at the
 * iframe edge" (the static prototype pages embedded in `/messages` etc.
 * run their own dot+ring), we directly attach `mouseenter`/`mouseleave`
 * to every <iframe> in the document and toggle a hidden class. A
 * MutationObserver picks up iframes that mount after first paint.
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

    dot.style.transform = `translate(${mx - 4}px, ${my - 4}px)`;
    ring.style.transform = `translate(${Math.round(rx) - 14}px, ${Math.round(ry) - 14}px)`;
    document.body.classList.add("vibe-cursor-active");

    function hideCursor() {
      dot!.classList.add("vibe-cursor-hidden");
      ring!.classList.add("vibe-cursor-hidden");
    }
    function showCursor() {
      dot!.classList.remove("vibe-cursor-hidden");
      ring!.classList.remove("vibe-cursor-hidden");
    }

    function onMove(e: MouseEvent) {
      mx = e.clientX;
      my = e.clientY;
      dot!.style.transform = `translate(${mx - 4}px, ${my - 4}px)`;
      // Defensive: if a mousemove fires while we're flagged hidden (we re-
      // entered the parent doc through some path that didn't trigger
      // mouseleave on the iframe — rare but happens with rapid moves), un-hide.
      if (dot!.classList.contains("vibe-cursor-hidden")) showCursor();
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
      if (t && t.closest?.(HOVER_SEL)) {
        dot!.classList.add("hover");
        ring!.classList.add("hover");
      }
    }
    function onOut(e: MouseEvent) {
      const t = e.target as Element | null;
      if (t && t.closest?.(HOVER_SEL)) {
        dot!.classList.remove("hover");
        ring!.classList.remove("hover");
      }
    }

    function tick() {
      rx += (mx - rx) * 0.22;
      ry += (my - ry) * 0.22;
      ring!.style.transform = `translate(${Math.round(rx) - 14}px, ${Math.round(ry) - 14}px)`;
      raf = requestAnimationFrame(tick);
    }

    // ── iframe handlers ────────────────────────────────────────────────
    // Direct mouseenter/mouseleave on each <iframe> is far more reliable
    // than checking event.target in a delegated mouseover listener —
    // browsers consistently fire these on the element at the moment of
    // crossing, regardless of the iframe capturing inner events.
    const observed = new WeakSet<HTMLIFrameElement>();
    function bindIframe(frame: HTMLIFrameElement) {
      if (observed.has(frame)) return;
      observed.add(frame);
      frame.addEventListener("mouseenter", hideCursor);
      frame.addEventListener("mouseleave", showCursor);
    }
    function bindAllIframes() {
      document.querySelectorAll("iframe").forEach((f) => bindIframe(f as HTMLIFrameElement));
    }
    bindAllIframes();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLIFrameElement) bindIframe(n);
          else if (n instanceof Element) {
            n.querySelectorAll("iframe").forEach((f) => bindIframe(f as HTMLIFrameElement));
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // ── off-window handling — also useful so the cursor doesn't sit at
    // the edge when the user moves off the browser window entirely.
    document.documentElement.addEventListener("mouseleave", hideCursor);
    document.documentElement.addEventListener("mouseenter", showCursor);

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.querySelectorAll("iframe").forEach((f) => {
        f.removeEventListener("mouseenter", hideCursor);
        f.removeEventListener("mouseleave", showCursor);
      });
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
