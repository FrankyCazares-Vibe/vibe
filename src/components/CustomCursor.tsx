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

    // This page is a frame inside one of ours (the small Messages window in
    // Otto's panel, `/messages?mini=1`): the page around it draws the one
    // cursor, so this one forwards instead (polish 1, Nov 11).
    const host = framingPage();
    if (host) {
      dotRef.current?.classList.add("vibe-cursor-hidden");
      ringRef.current?.classList.add("vibe-cursor-hidden");
      return forwardCursor(host);
    }

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

    // Hidden until the first move: until then mx/my are the middle of the
    // window, not the pointer, and the dot sat there mid-page (the landing's
    // hero) until the mouse moved.
    let moved = false;
    function hideCursor() {
      dot!.classList.add("vibe-cursor-hidden");
      ring!.classList.add("vibe-cursor-hidden");
    }
    function showCursor() {
      if (!moved) return;
      dot!.classList.remove("vibe-cursor-hidden");
      ring!.classList.remove("vibe-cursor-hidden");
    }
    hideCursor();
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
      if (!moved) {
        // The ring starts on the pointer, not trailing in from the middle.
        moved = true;
        rx = x;
        ry = y;
      }
      mx = x;
      my = y;
      dot!.style.transform = `translate3d(${mx - 4}px, ${my - 4}px, 0)`;
      if (dot!.classList.contains("vibe-cursor-hidden")) showCursor();
      kick();
    }

    // When this page last saw the pointer itself: a frame's "leave" that
    // lands just after the pointer crossed onto this page is not an exit.
    let hostMoveAt = 0;
    function onMove(e: MouseEvent) {
      hostMoveAt = performance.now();
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
    // Set either way: a pressed button that goes away under the pointer
    // sends no mouseout, so the next mouseover has to clear the hover look.
    function onOver(e: MouseEvent) {
      const t = e.target as Element | null;
      setHover(Boolean(t && t.closest?.(HOVER_SEL)));
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
        // The pointer left the frame: out of the window (hide, as this page's
        // own mouseleave does), unless it crossed onto this page just now.
        case "leave":
          if (performance.now() - hostMoveAt > 120) hideCursor();
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

/** The `source` of the cursor messages a frame sends the page around it (public/html/messages.html sends the same). */
export const CURSOR_SOURCE = "vibe-cursor";
/** On a forwarding frame's <html> while the page around it draws the dot: the native arrow goes. */
const FORWARD_CLASS = "vibe-cursor-forward";
const FORWARD_HOVER_SEL =
  "a, button, input, select, textarea, label, [role='button'], [role='tab'], [data-cursor-hover]";

/** The page framing this one, when it is ours (same origin); null when this page is the whole tab. */
function framingPage(): Window | null {
  try {
    if (window.self === window.top) return null;
    const host = window.parent;
    // Reading another origin's address throws: that page is not ours.
    return host.location.origin === window.location.origin ? host : null;
  } catch {
    return null;
  }
}

/**
 * Does the page around draw a dot right now? CustomCursor's (`.vibe-cursor--dot`)
 * or a static page's own (`#cursor`, public/html/profile.html), unless its
 * CSS hides it (a narrow window, a coarse pointer).
 */
function hostDraws(host: Window): boolean {
  try {
    const dot = host.document.querySelector(".vibe-cursor--dot, #cursor");
    return !!dot && host.getComputedStyle(dot).display !== "none";
  } catch {
    return false;
  }
}

/**
 * Forward this frame's pointer to the page around it, which moves its own
 * dot and ring over the frame (CustomCursor's "message" listener, and
 * public/html/_miniMessenger.js on the static profile). The native arrow is
 * hidden only while that page draws a dot: otherwise there'd be no pointer.
 */
function forwardCursor(host: Window): () => void {
  const root = document.documentElement;
  const post = (type: string, extra?: { x: number; y: number }) => {
    try {
      host.postMessage({ source: CURSOR_SOURCE, type, ...extra }, window.location.origin);
    } catch {
      // The page around went away.
    }
  };
  const style = document.createElement("style");
  style.textContent = `@media (pointer: fine){html.${FORWARD_CLASS},html.${FORWARD_CLASS} *{cursor:none !important}}`;
  document.head.appendChild(style);
  const sync = () => root.classList.toggle(FORWARD_CLASS, hostDraws(host));
  sync();

  let entered = false;
  const onMove = (e: MouseEvent) => {
    if (!entered) {
      entered = true;
      sync();
    }
    post("move", { x: e.clientX, y: e.clientY });
  };
  const onLeave = () => {
    entered = false;
    // The page around hides its dot unless the pointer crossed onto it (review, Nov 11: it froze at the frame's edge).
    post("leave");
  };
  const onDown = () => post("down");
  const onUp = () => post("up");
  const onOver = (e: MouseEvent) => {
    const t = e.target as Element | null;
    post(t?.closest?.(FORWARD_HOVER_SEL) ? "hover-on" : "hover-off");
  };
  document.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mousedown", onDown);
  document.addEventListener("mouseup", onUp);
  document.addEventListener("mouseover", onOver, true);
  root.addEventListener("mouseleave", onLeave);
  return () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("mouseup", onUp);
    document.removeEventListener("mouseover", onOver, true);
    root.removeEventListener("mouseleave", onLeave);
    root.classList.remove(FORWARD_CLASS);
    style.remove();
  };
}
