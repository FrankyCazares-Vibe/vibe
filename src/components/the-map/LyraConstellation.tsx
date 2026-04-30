"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { OttoOrb } from "./OttoOrb";
import { stages, type Stage } from "./stages";

/* -------------------------------------------------------------------------- */
/*                                Constants                                   */
/* -------------------------------------------------------------------------- */

const VIEW_W = 800;
const VIEW_H = 600;
const WARP_MS = 750;

const fontDisplay = "Fraunces, serif";
const fontBody = "DM Sans, sans-serif";

/* -------------------------------------------------------------------------- */
/*                            Deterministic stars                             */
/* -------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type BgStar = {
  cx: number;
  cy: number;
  r: number;
  delay: number;
  duration: number;
  baseOpacity: number;
};

function generateBgStars(count: number, seed: number): BgStar[] {
  const rand = mulberry32(seed);
  const out: BgStar[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      cx: rand() * VIEW_W,
      cy: rand() * VIEW_H,
      r: 0.4 + rand() * 1.4,
      delay: rand() * 6,
      duration: 2.5 + rand() * 4,
      baseOpacity: 0.2 + rand() * 0.6,
    });
  }
  return out;
}

type Streak = {
  angle: number;
  delay: number;
  duration: number;
  length: number;
  thickness: number;
};

function generateStreaks(count: number, seed: number): Streak[] {
  const rand = mulberry32(seed);
  const out: Streak[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      angle: rand() * 360,
      delay: rand() * 0.18,
      duration: 0.45 + rand() * 0.35,
      length: 35 + rand() * 55, // % of viewport (radius from center to outer)
      thickness: 0.8 + rand() * 1.6,
    });
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                              Main component                                */
/* -------------------------------------------------------------------------- */

export default function LyraConstellation() {
  const [activeN, setActiveN] = useState(1);
  const active = stages[activeN - 1];

  const [isWarping, setIsWarping] = useState(false);
  const prevActiveRef = useRef(activeN);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasAutoPlayedRef = useRef(false);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const bgStars = useMemo(() => generateBgStars(140, 1850), []);

  /* trigger warp whenever activeN changes */
  useEffect(() => {
    if (prevActiveRef.current === activeN) return;
    prevActiveRef.current = activeN;
    setIsWarping(true);
    const t = setTimeout(() => setIsWarping(false), WARP_MS);
    return () => clearTimeout(t);
  }, [activeN]);

  /* keyboard navigation */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        setActiveN((n) => Math.min(stages.length, n + 1));
      } else if (e.key === "ArrowLeft") {
        setActiveN((n) => Math.max(1, n - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* auto-advance on first scroll-into-view */
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasAutoPlayedRef.current) {
            hasAutoPlayedRef.current = true;
            (async () => {
              setIsAutoPlaying(true);
              for (let i = 1; i <= stages.length; i++) {
                setActiveN(i);
                await wait(1100);
              }
              await wait(500);
              setActiveN(1);
              setIsAutoPlaying(false);
            })();
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <section
      ref={containerRef}
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, #131830 0%, #0A0E1F 70%, #0A0E1F 100%)",
        color: "#FAF7F2",
        padding: "120px 24px 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* dawn horizon at the very bottom */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 240,
          background:
            "linear-gradient(180deg, rgba(10,14,31,0) 0%, rgba(45,31,61,0.45) 30%, rgba(255,92,53,0.22) 75%, rgba(255,208,138,0.22) 100%)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1180,
          margin: "0 auto",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,229,219,0.55)",
              marginBottom: 16,
            }}
          >
            the roadmap · six stars · one journey
          </div>
          <h2
            style={{
              fontFamily: fontDisplay,
              fontWeight: 700,
              fontSize: "clamp(36px, 5.4vw, 64px)",
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
              margin: 0,
            }}
          >
            The Lyra{" "}
            <span style={{ fontStyle: "italic", color: "#FFD08A" }}>
              Constellation.
            </span>
          </h2>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 16,
              lineHeight: 1.55,
              color: "rgba(255,229,219,0.6)",
              maxWidth: 580,
              margin: "16px auto 0",
            }}
          >
            Six stages. Six stars. Otto holds the center — we warp from one to
            the next, ending at Vega, the ascending north star.
          </p>
        </div>

        {/* floating stage quote */}
        <div style={{ textAlign: "center", minHeight: 36, marginBottom: 8 }}>
          <AnimatePresence mode="wait">
            <motion.p
              key={`quote-${active.n}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
              style={{
                fontFamily: fontDisplay,
                fontStyle: "italic",
                fontSize: 18,
                lineHeight: 1.5,
                color: "rgba(255,229,219,0.75)",
                margin: 0,
              }}
            >
              &ldquo;{active.quote}&rdquo;
            </motion.p>
          </AnimatePresence>
        </div>

        {/* desktop hyperspace viewport */}
        <div className="hidden md:block">
          <div className="mt-8 grid gap-8 lg:grid-cols-[480px_1fr] lg:items-start lg:gap-10">
            <div className="lg:sticky lg:top-6 lg:self-start">
              <HyperspaceViewport
                activeN={activeN}
                isWarping={isWarping}
                isAutoPlaying={isAutoPlaying}
                bgStars={bgStars}
              />
              <NavigationRow activeN={activeN} setActiveN={setActiveN} />
            </div>
            <div>
              <Separator className="mx-auto mb-6 max-w-[920px] bg-[rgba(255,229,219,0.08)] lg:hidden" />
              <StageDetail stage={active} />
            </div>
          </div>
        </div>

        {/* mobile fallback */}
        <div className="block md:hidden">
          <MobileStageList activeN={activeN} setActiveN={setActiveN} />
        </div>
      </div>

      <div style={{ height: 120 }} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Hyperspace viewport                             */
/* -------------------------------------------------------------------------- */

function HyperspaceViewport({
  activeN,
  isWarping,
  isAutoPlaying,
  bgStars,
}: {
  activeN: number;
  isWarping: boolean;
  isAutoPlaying: boolean;
  bgStars: BgStar[];
}) {
  const active = stages[activeN - 1];
  const isVega = active.n === stages.length;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 760,
        margin: "32px auto 0",
        aspectRatio: "4 / 3",
        borderRadius: 28,
        overflow: "hidden",
        background:
          "radial-gradient(ellipse at center, #131830 0%, #0A0E1F 70%, #060816 100%)",
        border: "1px solid rgba(255,229,219,0.08)",
        boxShadow: isVega
          ? "0 30px 80px -30px rgba(255,208,138,0.22), 0 0 0 1px rgba(255,208,138,0.12)"
          : "0 30px 80px -30px rgba(255,92,53,0.18)",
      }}
    >
      {/* twinkling background stars — dim during warp */}
      <motion.svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid slice"
        initial={false}
        animate={{ opacity: isWarping ? 0.35 : 1 }}
        transition={{ duration: 0.18 }}
        style={{
          position: "absolute",
          inset: 0,
          display: "block",
        }}
        aria-hidden
      >
        {bgStars.map((s, i) => (
          <circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            fill="#FFE5DB"
            opacity={s.baseOpacity}
            style={{
              animation: `vibe-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
              transformOrigin: `${s.cx}px ${s.cy}px`,
            }}
          />
        ))}
      </motion.svg>

      {/* the destination star (halo + spikes if Vega) — fades in/out per stage */}
      <AnimatePresence mode="wait">
        <StarShowcase
          key={`showcase-${activeN}`}
          stage={active}
          isVega={isVega}
        />
      </AnimatePresence>

      {/* Otto orb — persistent at the center, the camera/traveler */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 4,
          pointerEvents: "none",
        }}
      >
        <OttoOrb size={64} />
      </div>

      {/* warp streaks — only during warp, key includes activeN for fresh paint */}
      <AnimatePresence>
        {isWarping ? <WarpStreaks key={`warp-${activeN}`} /> : null}
      </AnimatePresence>

      {/* tour caption */}
      <AnimatePresence>
        {isAutoPlaying ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              fontFamily: fontBody,
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255,229,219,0.6)",
              background: "rgba(10,14,31,0.65)",
              border: "1px solid rgba(255,229,219,0.14)",
              borderRadius: 999,
              padding: "4px 10px",
              zIndex: 5,
            }}
          >
            tour · sit back
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* stage caption (bottom of viewport) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 28,
          textAlign: "center",
          zIndex: 3,
          pointerEvents: "none",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={`caption-${activeN}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.4, delay: isWarping ? 0.25 : 0 }}
          >
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,229,219,0.6)",
                marginBottom: 6,
              }}
            >
              stage 0{active.n} · {active.star}
            </div>
            <div
              style={{
                fontFamily: fontDisplay,
                fontStyle: "italic",
                fontWeight: 700,
                fontSize: 36,
                lineHeight: 1,
                letterSpacing: "-0.025em",
                color: isVega ? "#FFD08A" : "#FAF7F2",
                filter: isVega
                  ? "drop-shadow(0 0 12px rgba(255,208,138,0.5))"
                  : "drop-shadow(0 0 8px rgba(255,229,219,0.35))",
              }}
            >
              {active.name}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Star showcase (per stage)                         */
/* -------------------------------------------------------------------------- */

function StarShowcase({ stage, isVega }: { stage: Stage; isVega: boolean }) {
  const haloSize = isVega ? 480 : 380;
  const haloGradient = isVega
    ? "radial-gradient(circle, rgba(255,229,219,0.95) 0%, rgba(255,208,138,0.7) 18%, rgba(255,92,53,0.32) 45%, rgba(124,92,252,0.12) 75%, transparent 100%)"
    : "radial-gradient(circle, rgba(255,229,219,0.85) 0%, rgba(255,208,138,0.55) 22%, rgba(255,92,53,0.32) 55%, rgba(45,31,61,0.12) 85%, transparent 100%)";

  return (
    <motion.div
      key={stage.n}
      initial={{ opacity: 0, scale: 0.55 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.6 }}
      transition={{
        duration: 0.55,
        ease: "easeOut",
        delay: 0.2, // arrive after warp peak
      }}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        marginLeft: -haloSize / 2,
        marginTop: -haloSize / 2,
        width: haloSize,
        height: haloSize,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: haloGradient,
          filter: "blur(16px)",
        }}
      />
      <motion.div
        style={{
          position: "absolute",
          inset: "20%",
          borderRadius: "50%",
          background: haloGradient,
        }}
        initial={{ scale: 1, opacity: 0.85 }}
        animate={{
          scale: [1, 1.06, 1],
          opacity: [0.85, 1, 0.85],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      {isVega ? <VegaSpikes haloSize={haloSize} /> : null}
    </motion.div>
  );
}

function VegaSpikes({ haloSize }: { haloSize: number }) {
  const len = haloSize * 1.05;
  return (
    <svg
      viewBox={`-${len / 2} -${len / 2} ${len} ${len}`}
      width={len}
      height={len}
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        marginLeft: -len / 2,
        marginTop: -len / 2,
        overflow: "visible",
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id="vega-spike-h" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#FFE5DB" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFE5DB" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#FFE5DB" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="vega-spike-v" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#FFE5DB" stopOpacity="0" />
          <stop offset="50%" stopColor="#FFE5DB" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#FFE5DB" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect
        x={-len / 2}
        y={-1.4}
        width={len}
        height={2.8}
        fill="url(#vega-spike-h)"
      />
      <rect
        x={-1.4}
        y={-len / 2}
        width={2.8}
        height={len}
        fill="url(#vega-spike-v)"
      />
      <g transform="rotate(45)">
        <rect
          x={-len / 2.6}
          y={-0.8}
          width={len / 1.3}
          height={1.6}
          fill="url(#vega-spike-h)"
          opacity={0.55}
        />
        <rect
          x={-0.8}
          y={-len / 2.6}
          width={1.6}
          height={len / 1.3}
          fill="url(#vega-spike-v)"
          opacity={0.55}
        />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Warp streaks                                */
/* -------------------------------------------------------------------------- */

function WarpStreaks() {
  // Fresh randomness per warp event.
  const streaks = useMemo(
    () => generateStreaks(110, Math.floor(Math.random() * 1_000_000)),
    []
  );
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 5,
        pointerEvents: "none",
      }}
    >
      {streaks.map((s, i) => (
        <motion.div
          key={i}
          initial={{ scaleX: 0, x: 0, opacity: 0 }}
          animate={{
            scaleX: 1,
            x: "260%",
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            ease: "easeIn",
            opacity: {
              duration: s.duration,
              delay: s.delay,
              times: [0, 0.2, 0.7, 1],
            },
          }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: `${s.length}%`,
            height: s.thickness,
            transformOrigin: "0 50%",
            transform: `rotate(${s.angle}deg)`,
            background:
              "linear-gradient(90deg, rgba(255,229,219,0) 0%, rgba(255,229,219,0.95) 45%, rgba(255,208,138,0.75) 75%, rgba(255,229,219,0) 100%)",
            borderRadius: 2,
            mixBlendMode: "screen",
          }}
        />
      ))}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Navigation row                              */
/* -------------------------------------------------------------------------- */

function NavigationRow({
  activeN,
  setActiveN,
}: {
  activeN: number;
  setActiveN: (n: number) => void;
}) {
  return (
    <div
      style={{
        marginTop: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        flexWrap: "wrap",
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        disabled={activeN === 1}
        onClick={() => setActiveN(Math.max(1, activeN - 1))}
        className="h-9 rounded-full border border-[rgba(255,229,219,0.18)] bg-transparent px-4 text-[13px] tracking-[0.06em] text-[#FAF7F2] hover:border-[rgba(255,229,219,0.35)] hover:bg-[rgba(255,229,219,0.06)] hover:text-[#FAF7F2] disabled:border-[rgba(255,229,219,0.08)] disabled:text-[rgba(255,229,219,0.25)]"
      >
        <span style={{ fontSize: 18, lineHeight: 1, marginRight: 6 }}>‹</span>
        prev
      </Button>

      <div style={{ display: "flex", gap: 10 }}>
        {stages.map((s) => {
          const isActive = s.n === activeN;
          const isVisited = s.n < activeN;
          const isVega = s.n === stages.length;
          return (
            <button
              key={s.n}
              type="button"
              onClick={() => setActiveN(s.n)}
              aria-label={`Stage ${s.n}: ${s.name}`}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: isActive
                  ? isVega
                    ? "#FFD08A"
                    : "#FF5C35"
                  : isVisited
                  ? "rgba(255,92,53,0.22)"
                  : "transparent",
                border: isActive
                  ? `1px solid ${isVega ? "#FFD08A" : "#FF5C35"}`
                  : "1px solid rgba(255,229,219,0.18)",
                color: isActive
                  ? isVega
                    ? "#1C1C1E"
                    : "#FAF7F2"
                  : isVisited
                  ? "#FFE5DB"
                  : "rgba(255,229,219,0.55)",
                fontFamily: fontBody,
                fontWeight: 500,
                fontSize: 13,
                cursor: "pointer",
                transition: "all 200ms ease",
                boxShadow: isActive
                  ? `0 0 18px ${isVega ? "rgba(255,208,138,0.7)" : "rgba(255,92,53,0.55)"}`
                  : "none",
              }}
            >
              {s.n}
            </button>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="sm"
        disabled={activeN === stages.length}
        onClick={() => setActiveN(Math.min(stages.length, activeN + 1))}
        className="h-9 rounded-full border border-[rgba(255,229,219,0.18)] bg-transparent px-4 text-[13px] tracking-[0.06em] text-[#FAF7F2] hover:border-[rgba(255,229,219,0.35)] hover:bg-[rgba(255,229,219,0.06)] hover:text-[#FAF7F2] disabled:border-[rgba(255,229,219,0.08)] disabled:text-[rgba(255,229,219,0.25)]"
      >
        next
        <span style={{ fontSize: 18, lineHeight: 1, marginLeft: 6 }}>›</span>
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Stage detail card                             */
/* -------------------------------------------------------------------------- */

function StageDetail({ stage }: { stage: Stage }) {
  const isVega = stage.n === stages.length;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`stage-${stage.n}`}
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{
          marginTop: 40,
          maxWidth: 920,
          marginInline: "auto",
          background: "rgba(19,24,48,0.7)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,229,219,0.08)",
          borderRadius: 24,
          padding: 36,
          color: "#FAF7F2",
          boxShadow: isVega
            ? "0 30px 80px -30px rgba(255,208,138,0.18), 0 0 0 1px rgba(255,208,138,0.15)"
            : "0 30px 80px -30px rgba(255,92,53,0.16)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,229,219,0.55)",
                marginBottom: 8,
              }}
            >
              stage 0{stage.n} · {stage.star}
            </div>
            <h3
              style={{
                fontFamily: fontDisplay,
                fontWeight: 700,
                fontSize: "clamp(32px, 4vw, 44px)",
                lineHeight: 1,
                letterSpacing: "-0.03em",
                margin: 0,
              }}
            >
              <span
                style={{
                  fontStyle: "italic",
                  color: isVega ? "#FFD08A" : "#FF5C35",
                }}
              >
                {stage.name}
              </span>
            </h3>
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 14,
              color: "rgba(255,229,219,0.7)",
              padding: "6px 12px",
              border: "1px solid rgba(255,229,219,0.18)",
              borderRadius: 999,
            }}
          >
            {stage.time}
          </div>
        </div>

        <div
          style={{
            borderLeft: `3px solid ${isVega ? "#FFD08A" : "#FF5C35"}`,
            paddingLeft: 18,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,229,219,0.55)",
              marginBottom: 8,
            }}
          >
            the goal
          </div>
          <p
            style={{
              fontFamily: fontDisplay,
              fontStyle: "italic",
              fontWeight: 500,
              fontSize: 20,
              lineHeight: 1.4,
              color: "#FAF7F2",
              margin: 0,
            }}
          >
            {stage.goal}
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 28,
            marginBottom: 28,
          }}
        >
          <DetailList
            label="what we build"
            items={stage.build}
            dotColor="#FF5C35"
          />
          <DetailList
            label="who does what"
            items={stage.team}
            dotColor="#C8B8FF"
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              background: "rgba(255,92,53,0.08)",
              border: "1px solid rgba(255,92,53,0.25)",
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#FFD08A",
                marginBottom: 8,
              }}
            >
              proof that unlocks the next stage
            </div>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 14.5,
                lineHeight: 1.55,
                color: "#FAF7F2",
                margin: 0,
              }}
            >
              {stage.proof}
            </p>
          </div>
          <div
            style={{
              background: "rgba(255,229,219,0.04)",
              border: "1px solid rgba(255,229,219,0.12)",
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,229,219,0.55)",
                marginBottom: 8,
              }}
            >
              what kills us here
            </div>
            <p
              style={{
                fontFamily: fontBody,
                fontSize: 14.5,
                lineHeight: 1.55,
                color: "rgba(255,229,219,0.85)",
                margin: 0,
              }}
            >
              {stage.kills}
            </p>
          </div>
        </div>

        <div
          style={{
            textAlign: "right",
            fontFamily: fontDisplay,
            fontStyle: "italic",
            fontSize: 13,
            color: "rgba(255,229,219,0.55)",
          }}
        >
          {stage.cost}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function DetailList({
  label,
  items,
  dotColor,
}: {
  label: string;
  items: string[];
  dotColor: string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255,229,219,0.55)",
          marginBottom: 14,
        }}
      >
        {label}
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {items.map((item, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              fontFamily: fontBody,
              fontSize: 14.5,
              lineHeight: 1.55,
              color: "rgba(255,229,219,0.88)",
              marginBottom: 10,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: dotColor,
                marginTop: 8,
                flexShrink: 0,
                boxShadow: `0 0 6px ${dotColor}88`,
              }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Mobile fallback                               */
/* -------------------------------------------------------------------------- */

function MobileStageList({
  activeN,
  setActiveN,
}: {
  activeN: number;
  setActiveN: (n: number) => void;
}) {
  return (
    <div
      style={{
        marginTop: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {stages.map((s) => {
        const isActive = s.n === activeN;
        const isVega = s.n === stages.length;
        return (
          <button
            key={s.n}
            type="button"
            onClick={() => setActiveN(s.n)}
            style={{
              textAlign: "left",
              padding: 20,
              background: isActive
                ? isVega
                  ? "rgba(255,208,138,0.10)"
                  : "rgba(255,92,53,0.08)"
                : "rgba(19,24,48,0.5)",
              border: isActive
                ? `1px solid ${isVega ? "rgba(255,208,138,0.5)" : "rgba(255,92,53,0.45)"}`
                : "1px solid rgba(255,229,219,0.08)",
              borderRadius: 16,
              color: "#FAF7F2",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontFamily: fontBody,
                  fontSize: 11,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(255,229,219,0.55)",
                }}
              >
                stage 0{s.n} · {s.star}
              </div>
              <div
                style={{
                  fontFamily: fontBody,
                  fontSize: 11,
                  color: "rgba(255,229,219,0.55)",
                }}
              >
                {s.time}
              </div>
            </div>
            <div
              style={{
                fontFamily: fontDisplay,
                fontStyle: "italic",
                fontWeight: 600,
                fontSize: 24,
                color: isVega ? "#FFD08A" : "#FF5C35",
              }}
            >
              {s.name}
            </div>
            {isActive ? (
              <p
                style={{
                  marginTop: 12,
                  fontFamily: fontDisplay,
                  fontStyle: "italic",
                  fontSize: 16,
                  lineHeight: 1.4,
                  color: "rgba(255,229,219,0.88)",
                  borderLeft: `2px solid ${isVega ? "#FFD08A" : "#FF5C35"}`,
                  paddingLeft: 12,
                }}
              >
                {s.goal}
              </p>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

function wait(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
