"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Soft radial-gradient spotlight that tracks the pointer inside the
 * wrapper, plus an optional subtle tilt. Use when you want the
 * "underwater shimmer" feel on a card without the GlareCard's
 * dramatic theatrics.
 *
 * Implementation
 * - Spotlight: absolute-positioned span with a radial gradient whose
 *   center is driven by CSS custom properties (--mx / --my) updated
 *   on every onPointerMove. No React state churn per frame.
 * - Tilt: rotateX + rotateY proportional to cursor distance from the
 *   card's center, capped by `tilt` (max degrees in each axis).
 *   Resets to flat on pointer leave.
 * - Pointer-events-none on the gradient layer so taps reach content.
 */
export function MouseSpotlight({
  children,
  size = 220,
  color = "rgba(255, 92, 53, 0.16)",
  /** Max rotation in degrees in either axis. 0 disables tilt entirely.
   *  Defaults to 5° — visible but well short of GlareCard's old ~14°.
   *  Tune per-surface via `tilt={n}` on the call site. */
  tilt = 5,
  className,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  tilt?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tiltLayerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  // Touch-primary devices (phones / most tablets) skip the spotlight +
  // tilt entirely. Hover doesn't exist there and tap-driven glows feel
  // weird more than they feel premium. Use matchMedia after mount so
  // SSR and hydration stay aligned.
  const [touchPrimary, setTouchPrimary] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mm = window.matchMedia?.("(hover: none) and (pointer: coarse)");
    if (!mm) return;
    setTouchPrimary(mm.matches);
    const onChange = (e: MediaQueryListEvent) => setTouchPrimary(e.matches);
    mm.addEventListener?.("change", onChange);
    return () => mm.removeEventListener?.("change", onChange);
  }, []);

  if (touchPrimary) {
    // Render a plain wrapper that still applies the caller's styling
    // (background, border, radius, etc.) so the card looks identical —
    // just without the spotlight gradient and tilt.
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  // The visual `style` (background, border, radius) is applied to the
  // INNER tilt layer so the whole card surface — bg, borders, content —
  // rotates together. The outer wrapper is invisible chrome that only
  // tracks the pointer and provides perspective.
  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const inner = tiltLayerRef.current;
        if (inner) {
          inner.style.setProperty("--mx", `${x}px`);
          inner.style.setProperty("--my", `${y}px`);
          if (tilt > 0) {
            const px = (x / rect.width - 0.5) * 2; // -1 .. 1
            const py = (y / rect.height - 0.5) * 2;
            const rotY = px * tilt;
            const rotX = -py * tilt;
            inner.style.transform =
              `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
          }
        }
      }}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => {
        setActive(false);
        if (tiltLayerRef.current) {
          tiltLayerRef.current.style.transform =
            "rotateX(0deg) rotateY(0deg)";
        }
      }}
      className={className}
      style={{
        position: "relative",
        perspective: "900px",
        // Outer holds NO visual styles — kept invisible. style.height/
        // width still propagate so callers can size the wrapper.
        width: style?.width,
        height: style?.height,
      }}
    >
      <div
        ref={tiltLayerRef}
        style={{
          position: "relative",
          transform: "rotateX(0deg) rotateY(0deg)",
          transformStyle: "preserve-3d",
          transition: "transform 380ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          willChange: "transform",
          overflow: "hidden",
          // Forwarded visual styles end up here so the bg / border / radius
          // rotate WITH the content. Width/height pulled out above.
          ...style,
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: active ? 1 : 0,
            transition: "opacity 220ms ease",
            background: `radial-gradient(${size}px circle at var(--mx, 50%) var(--my, 50%), ${color}, transparent 70%)`,
            zIndex: 0,
          }}
        />
        <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
      </div>
    </div>
  );
}
