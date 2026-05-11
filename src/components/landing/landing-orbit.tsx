"use client";

import Link from "next/link";

import { OttoOrb } from "@/components/the-map/OttoOrb";

import { TypewriterSequence } from "./landing-typewriter";

export type RingId = "pulse" | "scene" | "connect";

type RingDef = {
  id: RingId;
  label: string;
  color: string;
  /** Ring radius as a percentage of the system's width. */
  radiusPct: number;
  /** Full rotation duration in seconds. */
  duration: number;
  /** Reverse rotates counter-clockwise. */
  reverse: boolean;
};

const RINGS: RingDef[] = [
  { id: "pulse", label: "PULSE", color: "#FF5C35", radiusPct: 18, duration: 24, reverse: false },
  { id: "scene", label: "SCENE", color: "#F5C842", radiusPct: 30, duration: 34, reverse: true },
  { id: "connect", label: "CONNECT", color: "#7B5FE0", radiusPct: 42, duration: 48, reverse: false },
];

// When a ring is focused, both its stroke and its moon animate to this
// radius so the orbit visibly encircles the detail card.
const FOCUS_RADIUS_PCT = 30;

type Props = {
  focused: RingId | null;
  onPick: (id: RingId) => void;
  unlocked: boolean;
};

export function OrbitalRingSystem({ focused, onPick, unlocked }: Props) {
  const showSunCta = unlocked && focused === null;
  return (
    <div className="vibe-landing-orbital">
      <svg viewBox="0 0 600 600" className="vibe-landing-orbital-svg" aria-hidden>
        {RINGS.map((r) => {
          const isDim = focused !== null && focused !== r.id;
          const isFocus = focused === r.id;
          const radiusPct = isFocus ? FOCUS_RADIUS_PCT : r.radiusPct;
          const rPx = (radiusPct / 100) * 600;
          return (
            <circle
              key={r.id}
              cx={300}
              cy={300}
              r={rPx}
              fill="none"
              stroke={r.color}
              strokeOpacity={isDim ? 0 : isFocus ? 0.85 : 0.45}
              strokeWidth={isFocus ? 2 : 1.5}
              strokeDasharray="5 8"
              style={{
                transition:
                  "r 600ms cubic-bezier(0.22, 1, 0.36, 1), stroke-opacity 600ms ease, stroke-width 600ms ease",
              }}
            />
          );
        })}
      </svg>

      {showSunCta ? (
        <Link
          href="/auth/login"
          prefetch
          data-warp-trigger
          className="vibe-landing-sun-cta"
          aria-label="Step inside vibe"
        >
          <span className="vibe-landing-sun-disc">
            <span className="vibe-landing-sun-halo" aria-hidden />
            <span className="vibe-landing-sun-halo vibe-landing-sun-halo-2" aria-hidden />
            <span className="vibe-landing-sun-halo vibe-landing-sun-halo-3" aria-hidden />
            <span className="vibe-landing-sun-otto">
              <OttoOrb size={140} />
            </span>
          </span>
          <span className="vibe-landing-sun-typed" aria-hidden>
            <TypewriterSequence
              sentences={["Step inside →"]}
              speed={70}
              startDelay={900}
            />
          </span>
        </Link>
      ) : (
        <div className="vibe-landing-orbital-core">
          <OttoOrb size={88} />
        </div>
      )}

      {RINGS.map((r) => (
        <Moon
          key={r.id}
          def={r}
          focused={focused}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function Moon({
  def,
  focused,
  onPick,
}: {
  def: RingDef;
  focused: RingId | null;
  onPick: (id: RingId) => void;
}) {
  const isDim = focused !== null && focused !== def.id;
  const isFocus = focused === def.id;
  // Unfocused rings keep rotating in the background (invisible) so they're
  // already at the right angle when the user returns to the orbit view.
  const radiusPct = isFocus ? FOCUS_RADIUS_PCT : def.radiusPct;

  return (
    <div
      className="vibe-landing-orbital-spin"
      style={{
        animationName: def.reverse ? "vibe-landing-orbit-ccw" : "vibe-landing-orbit-cw",
        animationDuration: `${def.duration}s`,
        animationPlayState: isFocus ? "paused" : "running",
        opacity: isDim ? 0 : 1,
        transition: "opacity 600ms ease",
      }}
    >
      <div
        className="vibe-landing-moon-anchor"
        style={{
          left: `calc(50% + ${radiusPct}%)`,
          transition: "left 600ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          className="vibe-landing-moon-counter"
          style={{
            animationName: def.reverse ? "vibe-landing-orbit-cw" : "vibe-landing-orbit-ccw",
            animationDuration: `${def.duration}s`,
            animationPlayState: isFocus ? "paused" : "running",
          }}
        >
          <button
            type="button"
            className="vibe-landing-moon"
            style={{
              background: `${def.color}1F`,
              borderColor: `${def.color}80`,
              color: def.color,
              boxShadow: isFocus
                ? `0 0 28px ${def.color}55, inset 0 0 12px ${def.color}33`
                : `0 0 14px ${def.color}33`,
              transform: `scale(${isFocus ? 1.18 : 1})`,
            }}
            onClick={() => onPick(def.id)}
            aria-label={`Pick ${def.label.toLowerCase()} orbit`}
          >
            {def.label}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Cinematic dolly + preview cards                                          */
/* ----------------------------------------------------------------------- */

export function OrbitDetail({
  focused,
  onClose,
}: {
  focused: RingId | null;
  onClose: () => void;
}) {
  const visible = focused !== null;
  return (
    <div
      className="vibe-landing-detail-layer"
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transform: visible ? "scale(1)" : "scale(0.92)",
      }}
      aria-hidden={!visible}
    >
      {focused === "pulse" ? <PulsePreview /> : null}
      {focused === "scene" ? <ScenePreview /> : null}
      {focused === "connect" ? <ConnectPreview /> : null}

      <button
        type="button"
        onClick={onClose}
        className="vibe-landing-back"
        aria-label="Back to orbit view"
      >
        <span aria-hidden>←</span> Back to orbit
      </button>
    </div>
  );
}

function GlassCard({
  accent,
  children,
}: {
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="vibe-landing-glass"
      style={{
        boxShadow: `0 24px 60px rgba(0,0,0,0.45), 0 0 0 1px ${accent}40, 0 0 56px ${accent}30`,
      }}
    >
      {children}
    </div>
  );
}

function FeatureCard({
  accent,
  eyebrow,
  headline,
  body,
  illustration,
}: {
  accent: string;
  eyebrow: string;
  headline: string;
  body: string;
  illustration: React.ReactNode;
}) {
  return (
    <GlassCard accent={accent}>
      <div style={{ width: 300 }}>
        <div className="vibe-landing-card-eyebrow" style={{ color: accent }}>
          {eyebrow}
        </div>
        <div
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 26,
            fontWeight: 700,
            color: "#FAF7F2",
            letterSpacing: "-0.5px",
            marginTop: 8,
            lineHeight: 1.1,
          }}
        >
          {headline}
        </div>
        <p
          style={{
            margin: "10px 0 0",
            color: "#C7C2BC",
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        >
          {body}
        </p>
        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            minHeight: 64,
          }}
        >
          {illustration}
        </div>
      </div>
    </GlassCard>
  );
}

function PulseIllustration() {
  return (
    <svg viewBox="0 0 260 48" width="240" height="44" aria-hidden>
      <defs>
        <linearGradient id="vibe-pulse-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#FF5C35" stopOpacity="0" />
          <stop offset="20%" stopColor="#FF5C35" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#FF5C35" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FF5C35" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M0 24 L60 24 L80 24 L92 8 L104 40 L116 16 L128 32 L140 24 L200 24 L260 24"
        fill="none"
        stroke="url(#vibe-pulse-fade)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="130" cy="24" r="2.5" fill="#FF5C35">
        <animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function CalendarIllustration() {
  // Three abstract calendar tiles, slightly cascaded — geometric, no real data.
  return (
    <svg viewBox="0 0 260 60" width="240" height="56" aria-hidden>
      {[0, 1, 2].map((i) => {
        const x = 70 + i * 42;
        const y = 12 + i * 4;
        return (
          <g key={i} opacity={0.5 + i * 0.25}>
            <rect
              x={x}
              y={y}
              width="38"
              height="38"
              rx="6"
              fill="rgba(245,200,66,0.08)"
              stroke="#F5C842"
              strokeOpacity="0.55"
              strokeWidth="1"
            />
            <line x1={x} y1={y + 11} x2={x + 38} y2={y + 11} stroke="#F5C842" strokeOpacity="0.45" strokeWidth="1" />
            <circle cx={x + 8} cy={y + 6} r="1.2" fill="#F5C842" />
            <circle cx={x + 14} cy={y + 6} r="1.2" fill="#F5C842" />
          </g>
        );
      })}
    </svg>
  );
}

function ConnectIllustration() {
  // Network graph — 5 nodes connected by hairline edges. Pure geometry, no names.
  const nodes = [
    { x: 50, y: 30 },
    { x: 110, y: 12 },
    { x: 130, y: 50 },
    { x: 180, y: 22 },
    { x: 215, y: 42 },
  ];
  const edges: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [1, 2],
    [1, 3],
    [2, 4],
    [3, 4],
  ];
  return (
    <svg viewBox="0 0 260 60" width="240" height="56" aria-hidden>
      {edges.map(([a, b], i) => (
        <line
          key={i}
          x1={nodes[a].x}
          y1={nodes[a].y}
          x2={nodes[b].x}
          y2={nodes[b].y}
          stroke="#7B5FE0"
          strokeOpacity="0.45"
          strokeWidth="1"
        />
      ))}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r="6" fill="rgba(123,95,224,0.18)" stroke="#C8B8FF" strokeWidth="1" />
          <circle cx={n.x} cy={n.y} r="2" fill="#C8B8FF" />
        </g>
      ))}
    </svg>
  );
}

function PulsePreview() {
  return (
    <FeatureCard
      accent="#FF5C35"
      eyebrow="Pulse"
      headline="Your campus, live."
      body="See what's trending, what's loud, what just dropped — the feed updates as your campus moves."
      illustration={<PulseIllustration />}
    />
  );
}

function ScenePreview() {
  return (
    <FeatureCard
      accent="#F5C842"
      eyebrow="Scene"
      headline="What's on tonight."
      body="Events, club meetings, talks, study sessions. RSVP, see who's going, never miss out."
      illustration={<CalendarIllustration />}
    />
  );
}

function ConnectPreview() {
  return (
    <FeatureCard
      accent="#7B5FE0"
      eyebrow="Connect"
      headline="Find your people."
      body="Classmates, club mates, mutuals. vibe shows you who you actually know on campus."
      illustration={<ConnectIllustration />}
    />
  );
}
