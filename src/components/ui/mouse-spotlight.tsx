"use client";

import { useRef, useState } from "react";

/**
 * Soft radial-gradient spotlight that tracks the pointer inside the
 * wrapper. Subtle by design — no tilt, no glare. Use when you want
 * the "underwater shimmer" feel on a card without the GlareCard
 * theatrics.
 *
 * The spotlight is a single absolutely-positioned div with a radial
 * gradient whose center is driven by CSS custom properties updated
 * on every onPointerMove. Opacity fades in on enter and out on leave.
 * Pointer-events-none so it never blocks taps.
 */
export function MouseSpotlight({
  children,
  size = 220,
  color = "rgba(255, 92, 53, 0.16)",
  className,
  style,
}: {
  children: React.ReactNode;
  /** Diameter of the gradient blob in px. Smaller = tighter spotlight. */
  size?: number;
  /** rgba color of the spotlight's center. Goes to transparent at the edge. */
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
        el.style.setProperty("--my", `${e.clientY - rect.top}px`);
      }}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => setActive(false)}
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
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
  );
}
