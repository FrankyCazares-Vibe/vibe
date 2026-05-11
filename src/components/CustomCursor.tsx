"use client";

import { useEffect, useRef } from "react";

/**
 * Custom cursor — coral dot that snaps to the pointer + a thin ring that
 * eases behind it. Both dot and ring grow + brighten when hovering over
 * anything interactive. Skipped on touch / coarse-pointer devices via the
 * `(pointer: fine)` media query.
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

    // Seed positions so the cursor isn't stuck at (0,0) before the first move.
    dot.style.transform = `translate(${mx - 4}px, ${my - 4}px)`;
    ring.style.transform = `translate(${Math.round(rx) - 14}px, ${Math.round(ry) - 14}px)`;
    document.body.classList.add("vibe-cursor-active");

    function onMove(e: MouseEvent) {
      mx = e.clientX;
      my = e.clientY;
      dot!.style.transform = `translate(${mx - 4}px, ${my - 4}px)`;
    }
    function onDown() {
      dot!.classList.add("clicking");
    }
    function onUp() {
      dot!.classList.remove("clicking");
    }

    const HOVER_SEL = "a, button, input, select, textarea, label, [role='button'], [role='tab'], [data-cursor-hover]";
    function onOver(e: MouseEvent) {
      const t = e.target as Element | null;
      // Pointer entered an iframe (e.g. /messages embeds /html/messages.html
      // and that page has its own cursor) — hide ours so we don't double up.
      if (t instanceof HTMLIFrameElement) {
        dot!.classList.add("vibe-cursor-hidden");
        ring!.classList.add("vibe-cursor-hidden");
        return;
      }
      // Back inside the parent doc — show the cursor again.
      if (dot!.classList.contains("vibe-cursor-hidden")) {
        dot!.classList.remove("vibe-cursor-hidden");
        ring!.classList.remove("vibe-cursor-hidden");
      }
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

    // When the pointer enters an iframe (e.g. the embedded static prototype
    // on /messages) the parent doc stops getting mousemove events and our
    // cursor would freeze in place while the iframe's own cursor takes
    // over — two visible cursors. mouseleave/enter on the document lets us
    // hide ours whenever the iframe (or off-window) owns the pointer.
    function onLeave() {
      dot!.classList.add("vibe-cursor-hidden");
      ring!.classList.add("vibe-cursor-hidden");
    }
    function onEnter() {
      dot!.classList.remove("vibe-cursor-hidden");
      ring!.classList.remove("vibe-cursor-hidden");
    }

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.documentElement.addEventListener("mouseenter", onEnter);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.documentElement.removeEventListener("mouseenter", onEnter);
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
