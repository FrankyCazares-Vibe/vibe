"use client";

import { useRef, useState } from "react";

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
   *  Defaults to a tame 2.5° — noticeable but not dramatic. */
  tilt = 2.5,
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

  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        el.style.setProperty("--mx", `${x}px`);
        el.style.setProperty("--my", `${y}px`);
        // Tilt math: % offset from center → degrees, capped by `tilt`.
        if (tilt > 0 && tiltLayerRef.current) {
          const px = (x / rect.width - 0.5) * 2; // -1 .. 1
          const py = (y / rect.height - 0.5) * 2;
          const rotY = px * tilt;
          const rotX = -py * tilt;
          tiltLayerRef.current.style.transform =
            `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        }
      }}
      onPointerEnter={() => setActive(true)}
      onPointerLeave={() => {
        setActive(false);
        if (tiltLayerRef.current) {
          tiltLayerRef.current.style.transform =
            `perspective(900px) rotateX(0deg) rotateY(0deg)`;
        }
      }}
      className={className}
      style={{ position: "relative", overflow: "visible", ...style }}
    >
      <div
        ref={tiltLayerRef}
        style={{
          position: "relative",
          transformStyle: "preserve-3d",
          transform: "perspective(900px) rotateX(0deg) rotateY(0deg)",
          transition: "transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          willChange: "transform",
          borderRadius: "inherit",
          overflow: "hidden",
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
