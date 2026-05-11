"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { OttoOrb } from "@/components/the-map/OttoOrb";

import { OrbitalRingSystem, OrbitDetail, type RingId } from "./landing-orbit";
import { TypewriterSequence } from "./landing-typewriter";

const WARP_DURATION_MS = 750;
const LOGIN_HREF = "/auth/login";

const RING_ORDER: RingId[] = ["pulse", "scene", "connect"];
const RING_COLOR: Record<RingId, string> = {
  pulse: "#FF5C35",
  scene: "#F5C842",
  connect: "#7B5FE0",
};

export function HomeLanding() {
  const router = useRouter();
  const [focused, setFocused] = useState<RingId | null>(null);
  const [introDone, setIntroDone] = useState(false);
  const [warping, setWarping] = useState(false);
  const [visited, setVisited] = useState<Set<RingId>>(() => new Set());
  const unlocked = visited.size === RING_ORDER.length;

  const handlePick = (id: RingId) => {
    setFocused(id);
    setVisited((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  // Hyperdrive: intercept any element marked data-warp-trigger, play the
  // streak animation, then navigate. Capture phase + stopPropagation so we
  // beat Next.js Link's onClick (which would otherwise navigate immediately
  // and skip the animation). Skip modifier-clicks so cmd/ctrl/middle-click
  // still open in a new tab. Gated until the visitor has clicked all three
  // moons.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (warping) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const trigger = target?.closest("[data-warp-trigger]");
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();
      if (!unlocked) return;
      setWarping(true);
      router.prefetch(LOGIN_HREF);
      window.setTimeout(() => router.push(LOGIN_HREF), WARP_DURATION_MS);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router, warping, unlocked]);

  // When a ring gets focused, scroll the orbital section into view so the
  // dolly transition isn't happening below the fold.
  useEffect(() => {
    if (!focused) return;
    const el = document.getElementById("vibe-landing-orbit-section");
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focused]);

  // Allow ESC to back out of orbit detail.
  useEffect(() => {
    if (!focused) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFocused(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focused]);

  return (
    <div className={`vibe-landing-root ${warping ? "vibe-landing-warp" : ""}`}>
      <Starfield />

      {/* ---- Hero — typewriter ----------------------------------------- */}
      <section className="vibe-landing-hero">
        <div className="vibe-landing-hero-orb">
          <OttoOrb size={56} />
        </div>
        <TypewriterSequence
          sentences={[
            "Hey, welcome to vibe.",
            "I'm Otto. This is your campus, all in one place.",
          ]}
          speed={60}
          pauseBetween={700}
          onDone={() => setIntroDone(true)}
        />
        <div
          className="vibe-landing-scrollcue"
          style={{ opacity: introDone ? 1 : 0 }}
          aria-hidden
        >
          <span className="vibe-landing-scrollcue-line" />
          <span style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            scroll
          </span>
        </div>
      </section>

      {/* ---- Orbital scene --------------------------------------------- */}
      <section id="vibe-landing-orbit-section" className="vibe-landing-orbit-section">
        <div className="vibe-landing-orbit-eyebrow">
          {focused
            ? "What this form does"
            : unlocked
              ? "All three explored. You're in."
              : `Pick a form to see how it works · ${visited.size}/${RING_ORDER.length}`}
        </div>
        <div className="vibe-landing-orbit-stage">
          <OrbitalRingSystem focused={focused} onPick={handlePick} unlocked={unlocked} />
          <OrbitDetail focused={focused} onClose={() => setFocused(null)} />
        </div>
      </section>

      {/* ---- Bottom rail: progress + hint + schools ------------------- */}
      <section className="vibe-landing-cta">
        <div className="vibe-landing-cta-progress" aria-label={`${visited.size} of ${RING_ORDER.length} forms explored`}>
          {RING_ORDER.map((id) => {
            const isVisited = visited.has(id);
            return (
              <span
                key={id}
                className={`vibe-landing-cta-progress-dot${isVisited ? " is-visited" : ""}`}
                style={{
                  borderColor: RING_COLOR[id],
                  background: isVisited ? RING_COLOR[id] : "transparent",
                  boxShadow: isVisited ? `0 0 12px ${RING_COLOR[id]}90` : "none",
                }}
              />
            );
          })}
        </div>

        <p className="vibe-landing-cta-hint">
          {unlocked
            ? "Tap the sun to step inside."
            : `Tap each form above to keep going · ${visited.size}/${RING_ORDER.length}`}
        </p>

        <div className="vibe-landing-schools">
          <span>IU</span>
          <span className="vibe-landing-schools-soon">live</span>
        </div>

        <p className="vibe-landing-cta-foot">
          Sign in with your school email. Your campus, your career, one profile.
        </p>
      </section>

      <footer className="vibe-landing-footer">
        <span>vibe · prototype</span>
        <span>early access</span>
      </footer>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Sparse twinkling star field — deterministic so SSR + client match.       */
/* ---------------------------------------------------------------------- */

function Starfield() {
  // Pre-stringified at fixed precision so SSR + client render byte-identical
  // inline styles. Also emits per-star radial vectors (--sc/--ss/--sa) the
  // hyperdrive keyframe reads to streak each star outward from page center.
  const stars = useMemo(() => {
    const noise = (i: number, k: number) => {
      const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
      return ((v % 1) + 1) % 1;
    };
    const fix = (n: number, d: number) => n.toFixed(d);
    return Array.from({ length: 70 }, (_, i) => {
      const xPct = noise(i, 1) * 100;
      const yPct = noise(i, 2) * 100;
      const dx = xPct - 50;
      const dy = yPct - 50;
      // Avoid divide-by-zero for stars exactly at center; nudge outward.
      const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
      const cos = dx / len;
      const sin = dy / len;
      const angle = Math.atan2(dy, dx);
      const size = fix(1 + noise(i, 3) * 1.8, 2);
      return {
        left: `${fix(xPct, 3)}%`,
        top: `${fix(yPct, 3)}%`,
        width: `${size}px`,
        height: `${size}px`,
        opacity: fix(0.25 + noise(i, 6) * 0.55, 3),
        animationDelay: `${fix(noise(i, 4) * 4, 2)}s`,
        animationDuration: `${fix(3 + noise(i, 5) * 4, 2)}s`,
        sc: fix(cos, 4),
        ss: fix(sin, 4),
        sa: `${fix(angle, 4)}rad`,
      };
    });
  }, []);

  return (
    <div className="vibe-landing-stars" aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          style={
            {
              left: s.left,
              top: s.top,
              width: s.width,
              height: s.height,
              opacity: s.opacity,
              animationDelay: s.animationDelay,
              animationDuration: s.animationDuration,
              "--sc": s.sc,
              "--ss": s.ss,
              "--sa": s.sa,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
