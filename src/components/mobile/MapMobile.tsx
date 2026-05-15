"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "vaul";

import { IU_SCHOOLS, schoolForMajor } from "@/lib/iu/majors";

/**
 * Mobile-native campus social map.
 *
 * Replaces the squished embed of desktop's MapTabBody with a touch-first
 * rebuild:
 *
 *   - SVG bubble map over a dark, space-y backdrop. "You are here" at
 *     center, major bubbles fan around in per-school clusters.
 *   - Gestures: one-finger pan, two-finger pinch-zoom. The transform
 *     stays anchored at the gesture's midpoint so the bubble under
 *     the user's fingers doesn't slide away during a zoom.
 *   - Tap a bubble → vaul bottom sheet slides up with that zone's
 *     people (Discover / Mutuals / Connected tabs), fetched from
 *     /api/campus-map/zone.
 *   - Layout math is a slim variant of the desktop algorithm:
 *     school-grouped, wedge-distributed, with collision relaxation.
 *
 * The desktop component keeps its own elaborate version (school halos,
 * starfield, connection lines, search-to-jump). Those polishes can be
 * back-ported to mobile later; this is the v1 native rebuild.
 */

// ---------- Types (mirror campus-home so we can hit the same API) ----------

type MapMajor = {
  name: string;
  total: number;
  connected: number;
  mutuals: number;
};

type MapOrg = {
  id: string;
  handle: string;
  name: string;
  logo_url: string | null;
  verified: boolean;
  is_public: boolean;
  member_count: number;
};

type MapSummary = {
  ok: boolean;
  demo?: boolean;
  you: {
    id: string;
    name: string | null;
    handle: string | null;
    major: string | null;
    avatar_url: string | null;
  };
  majors: MapMajor[];
  orgs: MapOrg[];
};

type ZoneSelection =
  | { kind: "major"; key: string; label: string; schoolId: string }
  | { kind: "org"; key: string; label: string };

type ZoneRow = {
  id: string;
  name: string | null;
  handle: string | null;
  major: string | null;
  year: number | null;
  avatar_url: string | null;
  mutual_count?: number;
};

// ---------- Layout helpers ----------

const BUBBLE_MIN = 28;
const BUBBLE_MAX = 48;
// "You are here" keep-out — bubbles can't crowd the avatar. Pulled all
// the way in (92 → 60 → 38) so the closest zones sit right next to the
// "you" node on a phone screen.
const YOU_KEEPOUT = 38;

function bubbleR(total: number): number {
  return BUBBLE_MIN + Math.min(BUBBLE_MAX - BUBBLE_MIN, total * 0.4);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type Pos = { x: number; y: number; r: number; schoolId: string };
type SchoolAnchor = {
  id: string;
  ax: number;
  ay: number;
  clusterR: number;
};

type Layout = {
  majors: Map<string, Pos>;
  schools: Map<string, SchoolAnchor>;
};

function computeLayout(data: MapSummary | null): Layout | null {
  if (!data || !data.majors) return null;

  // Bucket majors by their IU school.
  const grouped = new Map<string, MapMajor[]>();
  for (const m of data.majors) {
    const s = schoolForMajor(m.name).id;
    if (!grouped.has(s)) grouped.set(s, []);
    grouped.get(s)!.push(m);
  }

  const active = IU_SCHOOLS.filter((s) => grouped.has(s.id));
  const positions = new Map<string, Pos>();
  const schools = new Map<string, SchoolAnchor>();
  if (active.length === 0) return { majors: positions, schools };

  // Per-cluster radius estimate so an over-packed school gets a wider
  // anchor radius and doesn't bleed into a neighbor. Pulled all the way
  // in for mobile so the cluster doesn't dictate a huge anchor distance.
  const clusterRadiusOf = (majors: MapMajor[]): number => {
    let area = 0;
    for (const m of majors) {
      const r = bubbleR(m.total);
      area += Math.PI * r * r;
    }
    return Math.min(Math.sqrt(area / Math.PI) * 0.95 + 10, 92);
  };

  const wedgeDeg = 360 / active.length;
  const wedgeRad = (wedgeDeg * Math.PI) / 180;
  // Padding between adjacent clusters — minimal so neighbors can sit
  // tight; collision relaxation still keeps individual bubbles apart.
  const PAD_BETWEEN = 8;
  const clusterRadii = active.map((s) => clusterRadiusOf(grouped.get(s.id)!));
  const maxClusterR = clusterRadii.reduce((a, b) => Math.max(a, b), 0);

  // Anchor distance from center: large enough to fit the biggest
  // cluster outside the "you" keep-out, AND large enough that every
  // consecutive neighbor pair has room for their clusters + padding.
  let anchorR = YOU_KEEPOUT + maxClusterR;
  const sinHalf = Math.sin(wedgeRad / 2);
  if (sinHalf > 0.0001) {
    for (let i = 0; i < active.length; i++) {
      const n = (i + 1) % active.length;
      const needed =
        (clusterRadii[i]! + clusterRadii[n]! + PAD_BETWEEN) / (2 * sinHalf);
      if (needed > anchorR) anchorR = needed;
    }
  }

  // Place each school's anchor + fan its majors inside the wedge.
  active.forEach((school, i) => {
    const angleDeg = i * wedgeDeg + wedgeDeg / 2 - 90; // start at top
    const a = (angleDeg * Math.PI) / 180;
    const ax = Math.cos(a) * anchorR;
    const ay = Math.sin(a) * anchorR;
    schools.set(school.id, { id: school.id, ax, ay, clusterR: clusterRadii[i]! });

    const majors = grouped.get(school.id)!;
    const fanDeg = Math.min(96, 20 + majors.length * 13);
    majors.forEach((m, j) => {
      const seed = hashStr(m.name);
      const t = majors.length === 1 ? 0 : j / (majors.length - 1) - 0.5;
      const local =
        a +
        ((t * fanDeg) * Math.PI) / 180 +
        (((seed % 11) - 5) * Math.PI) / 220;
      // Local fan radius — how far each major sits from its school's
      // anchor. Pulled all the way in for mobile (52+24 → 34+18 → 18+12)
      // so the cluster hugs its anchor instead of blooming outward.
      const dist = 18 + ((seed >> 4) % 12);
      positions.set(m.name, {
        x: ax + Math.cos(local) * dist,
        y: ay + Math.sin(local) * dist,
        r: bubbleR(m.total),
        schoolId: school.id,
      });
    });
  });

  // Collision relaxation — same idea as desktop but fewer iterations
  // since the mobile bubble set is smaller and we have less screen.
  // Tight node padding so bubbles can sit shoulder-to-shoulder.
  const entries = Array.from(positions.entries());
  const NODE_PAD = 4;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]![1];
        const b = entries[j]![1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const minD = a.r + b.r + NODE_PAD;
        if (d < minD) {
          const push = (minD - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
          moved = true;
        }
      }
    }
    // Center keep-out.
    for (const [, node] of entries) {
      const d = Math.sqrt(node.x * node.x + node.y * node.y) || 0.01;
      const min = node.r + YOU_KEEPOUT;
      if (d < min) {
        const push = min - d;
        const ux = node.x / d;
        const uy = node.y / d;
        node.x += ux * push;
        node.y += uy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return { majors: positions, schools };
}

// ---------- Component ----------

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.4;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function MapMobile() {
  const [data, setData] = useState<MapSummary | null>(null);
  const [selection, setSelection] = useState<ZoneSelection | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Active pointers and the last pinch reading so we can compute deltas
  // across move events without re-deriving from scratch.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
  } | null>(null);
  // How far the last pointer-down has traveled. If it crosses the
  // threshold we treat the gesture as a pan and swallow the click on
  // pointer-up so a tap+drag doesn't open a random zone.
  const moveAccumRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/campus-map", { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        setData(j?.ok ? (j as MapSummary) : ({ ok: false } as MapSummary));
      } catch {
        if (!cancelled) setData({ ok: false } as MapSummary);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const layout = useMemo(() => computeLayout(data), [data]);
  const hasData = !!data?.ok && (data.majors?.length ?? 0) > 0;

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moveAccumRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const prev = pointersRef.current.get(e.pointerId);
      if (!prev) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      moveAccumRef.current += Math.abs(dx) + Math.abs(dy);

      if (pointersRef.current.size === 1) {
        setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
        return;
      }

      if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
        const midX = (pts[0]!.x + pts[1]!.x) / 2;
        const midY = (pts[0]!.y + pts[1]!.y) / 2;

        if (lastPinchRef.current) {
          const ratio = dist / lastPinchRef.current.dist;
          const newZoom = clamp(zoom * ratio, ZOOM_MIN, ZOOM_MAX);
          const midDx = midX - lastPinchRef.current.midX;
          const midDy = midY - lastPinchRef.current.midY;
          setZoom(newZoom);
          // Move pan by the midpoint delta so the gesture's anchor
          // stays approximately under the user's fingers.
          setPan((p) => ({ x: p.x + midDx, y: p.y + midDy }));
        }
        lastPinchRef.current = { dist, midX, midY };
      }
    },
    [zoom],
  );

  const onPointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) lastPinchRef.current = null;
    },
    [],
  );

  const recenter = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const pickMajor = useCallback((m: MapMajor) => {
    // Swallow taps that were actually pans.
    if (moveAccumRef.current > 8) return;
    setSelection({
      kind: "major",
      key: m.name,
      label: m.name,
      schoolId: schoolForMajor(m.name).id,
    });
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "calc(100dvh - 220px)",
        minHeight: 460,
        position: "relative",
        overflow: "hidden",
        borderRadius: 16,
        background:
          "radial-gradient(120% 80% at 50% 30%, rgba(70,140,255,0.16) 0%, rgba(70,140,255,0) 55%)," +
          "radial-gradient(80% 60% at 80% 80%, rgba(255,92,53,0.10) 0%, rgba(255,92,53,0) 60%)," +
          "linear-gradient(180deg, #07091A 0%, #03050C 100%)",
        border: "1px solid rgba(120,200,255,0.12)",
        boxShadow:
          "inset 0 1px 0 rgba(120,200,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.4), 0 12px 36px rgba(0,0,0,0.4)",
      }}
    >
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{
          width: "100%",
          height: "100%",
          touchAction: "none",
          cursor: "grab",
          position: "relative",
        }}
      >
        {data === null ? (
          <MapOverlay>Scanning campus…</MapOverlay>
        ) : !hasData ? (
          <MapOverlay subtle>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: 17, color: "#fff", marginBottom: 6 }}>
              No zones yet
            </div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, maxWidth: 280, textAlign: "center", lineHeight: 1.55 }}>
              We&apos;ll start lighting zones up once more students at your school set a major on their profile.
            </div>
          </MapOverlay>
        ) : (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              width: 0,
              height: 0,
              pointerEvents: "none",
              transition: "transform 80ms ease-out",
            }}
          >
            <SchoolHalos schools={layout?.schools ?? new Map()} />
            <YouNode you={data!.you} />
            {data!.majors.map((m) => {
              const pos = layout?.majors.get(m.name);
              if (!pos) return null;
              return (
                <MajorBubble
                  key={m.name}
                  major={m}
                  x={pos.x}
                  y={pos.y}
                  r={pos.r}
                  onTap={() => pickMajor(m)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Recenter button — bottom-right, doesn't fight the bottom tab bar
          because the map pane sits above it. */}
      {hasData ? (
        <button
          type="button"
          aria-label="Recenter map"
          onClick={recenter}
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            width: 42,
            height: 42,
            borderRadius: 999,
            border: "1px solid rgba(120,200,255,0.32)",
            background: "rgba(8,12,28,0.78)",
            color: "rgba(245,247,252,0.95)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
            zIndex: 4,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 2v3M11 17v3M2 11h3M17 11h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}

      {selection ? (
        <ZoneSheet
          selection={selection}
          demo={!!data?.demo}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </div>
  );
}

// ---------- Sub-components ----------

function MapOverlay({
  children,
  subtle,
}: {
  children: React.ReactNode;
  subtle?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: subtle ? undefined : "#fff",
        fontFamily: "Fraunces, serif",
        fontSize: 16,
      }}
    >
      {children}
    </div>
  );
}

function SchoolHalos({
  schools,
}: {
  schools: Map<string, SchoolAnchor>;
}) {
  return (
    <>
      {Array.from(schools.values()).map((s) => {
        const school = IU_SCHOOLS.find((x) => x.id === s.id);
        if (!school) return null;
        const r = s.clusterR + 32;
        return (
          <div
            key={s.id}
            aria-hidden
            style={{
              position: "absolute",
              left: s.ax - r,
              top: s.ay - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${school.color}33 0%, ${school.color}00 65%)`,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </>
  );
}

function YouNode({
  you,
}: {
  you: MapSummary["you"];
}) {
  const initials =
    (you.name || you.handle || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: -34,
        top: -34,
        width: 68,
        height: 68,
        borderRadius: "50%",
        background: you.avatar_url
          ? `url(${you.avatar_url}) center/cover`
          : "linear-gradient(135deg, #FFB58A 0%, #FF5C35 100%)",
        border: "2px solid rgba(255,255,255,0.7)",
        boxShadow:
          "0 0 0 5px rgba(255,140,90,0.18), 0 10px 24px rgba(255,92,53,0.32)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontFamily: "Fraunces, serif",
        fontWeight: 800,
        fontSize: 18,
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      {!you.avatar_url ? initials : null}
    </div>
  );
}

function MajorBubble({
  major,
  x,
  y,
  r,
  onTap,
}: {
  major: MapMajor;
  x: number;
  y: number;
  r: number;
  onTap: () => void;
}) {
  const school = schoolForMajor(major.name);
  const hasSignal = major.connected > 0 || major.mutuals > 0;

  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${major.name} — ${major.total} students`}
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        border: hasSignal
          ? `2px solid ${school.color}`
          : "1px solid rgba(255,255,255,0.18)",
        background: `radial-gradient(circle at 35% 30%, ${school.color}88 0%, ${school.color}44 55%, ${school.color}22 100%)`,
        color: "#fff",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        pointerEvents: "auto",
        boxShadow: hasSignal
          ? `0 0 0 4px ${school.color}28, 0 10px 24px rgba(0,0,0,0.32)`
          : "0 6px 18px rgba(0,0,0,0.32)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 4,
        fontFamily: "DM Sans, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: Math.max(9, Math.min(11, r * 0.18)),
          fontWeight: 800,
          letterSpacing: "-0.01em",
          textAlign: "center",
          lineHeight: 1.1,
          maxWidth: r * 1.7,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          wordBreak: "break-word",
        }}
      >
        {major.name}
      </div>
      <div
        style={{
          marginTop: 2,
          fontSize: 10,
          fontWeight: 700,
          color: "rgba(255,255,255,0.78)",
        }}
      >
        {major.total}
        {major.mutuals > 0 ? (
          <span style={{ color: "#FFB58A" }}> · {major.mutuals}m</span>
        ) : null}
      </div>
    </button>
  );
}

// ---------- Zone bottom sheet ----------

function ZoneSheet({
  selection,
  demo,
  onClose,
}: {
  selection: ZoneSelection;
  demo: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    connected: ZoneRow[];
    mutuals: ZoneRow[];
    discover: ZoneRow[];
  } | null>(null);
  const [tab, setTab] = useState<"discover" | "mutuals" | "connected">(
    "discover",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const base =
          selection.kind === "major"
            ? `/api/campus-map/zone?major=${encodeURIComponent(selection.key)}`
            : `/api/campus-map/zone?org=${encodeURIComponent(selection.key)}`;
        const url = demo ? `${base}&demo=1` : base;
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json();
        if (cancelled) return;
        if (j?.ok) {
          setData({
            connected: j.connected ?? [],
            mutuals: j.mutuals ?? [],
            discover: j.discover ?? [],
          });
          // Bias default tab toward the strongest signal.
          if ((j.mutuals ?? []).length > 0) setTab("mutuals");
          else if ((j.discover ?? []).length > 0) setTab("discover");
          else if ((j.connected ?? []).length > 0) setTab("connected");
        } else {
          setData({ connected: [], mutuals: [], discover: [] });
        }
      } catch {
        if (!cancelled)
          setData({ connected: [], mutuals: [], discover: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection, demo]);

  const rows =
    data === null
      ? null
      : tab === "connected"
        ? data.connected
        : tab === "mutuals"
          ? data.mutuals
          : data.discover;

  const accent =
    selection.kind === "major"
      ? IU_SCHOOLS.find((s) => s.id === selection.schoolId)?.color ?? "#78C8FF"
      : "#78C8FF";

  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 1200,
          }}
        />
        <Drawer.Content
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "82dvh",
            background:
              "linear-gradient(180deg, rgba(8,12,28,0.95) 0%, rgba(4,6,18,0.98) 100%)",
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            border: "1px solid rgba(120,200,255,0.22)",
            boxShadow:
              "inset 0 1px 0 rgba(120,200,255,0.22), 0 -16px 40px rgba(0,0,0,0.5)",
            zIndex: 1201,
            outline: "none",
            display: "flex",
            flexDirection: "column",
            color: "#fff",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
          aria-describedby={undefined}
        >
          <div
            aria-hidden
            style={{
              alignSelf: "center",
              margin: "10px 0 6px",
              width: 38,
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,0.22)",
            }}
          />
          <Drawer.Title
            style={{
              padding: "4px 18px 8px",
              fontFamily: "Fraunces, serif",
              fontSize: 19,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.01em",
              borderBottom: "1px solid rgba(120,200,255,0.14)",
            }}
          >
            <div
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: accent,
                fontWeight: 800,
                marginBottom: 2,
              }}
            >
              {selection.kind === "major" ? "Major zone" : "Org"}
            </div>
            <div
              style={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {selection.label}
            </div>
          </Drawer.Title>

          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "10px 14px",
              borderBottom: "1px solid rgba(120,200,255,0.10)",
            }}
          >
            {(
              [
                { key: "discover", label: "Discover", count: data?.discover.length },
                { key: "mutuals", label: "Mutuals", count: data?.mutuals.length },
                { key: "connected", label: "Connected", count: data?.connected.length },
              ] as const
            ).map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    borderRadius: 10,
                    border: active
                      ? `1px solid ${accent}88`
                      : "1px solid rgba(255,255,255,0.10)",
                    background: active
                      ? `${accent}24`
                      : "rgba(255,255,255,0.04)",
                    color: active ? "#fff" : "rgba(255,255,255,0.75)",
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {t.label}
                  {typeof t.count === "number" ? (
                    <span style={{ marginLeft: 6, opacity: 0.7 }}>{t.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              padding: "8px 12px 16px",
            }}
          >
            {rows === null ? (
              <div
                style={{
                  padding: "24px 12px",
                  textAlign: "center",
                  color: "rgba(255,255,255,0.6)",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                }}
              >
                Loading…
              </div>
            ) : rows.length === 0 ? (
              <div
                style={{
                  padding: "40px 18px",
                  textAlign: "center",
                  color: "rgba(255,255,255,0.62)",
                  fontFamily: "DM Sans, sans-serif",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {tab === "connected"
                  ? "You don't have connections in this zone yet."
                  : tab === "mutuals"
                    ? "No mutuals here yet."
                    : "Nobody to discover here right now."}
              </div>
            ) : (
              rows.map((u) => <ZonePersonRow key={u.id} u={u} accent={accent} />)
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ZonePersonRow({
  u,
  accent,
}: {
  u: ZoneRow;
  accent: string;
}) {
  const initials =
    (u.name || u.handle || "?")
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  const href = u.handle ? `/profile/${u.handle}` : "#";
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 10px",
        borderRadius: 12,
        textDecoration: "none",
        color: "#fff",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          background: u.avatar_url
            ? `url(${u.avatar_url}) center/cover`
            : `linear-gradient(135deg, ${accent}88 0%, ${accent}44 100%)`,
          border: "1px solid rgba(255,255,255,0.14)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontFamily: "Fraunces, serif",
          fontWeight: 800,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {!u.avatar_url ? initials : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "Fraunces, serif",
            fontSize: 14.5,
            fontWeight: 800,
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {u.name || (u.handle ? `@${u.handle}` : "Member")}
        </div>
        <div
          style={{
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11.5,
            color: "rgba(255,255,255,0.55)",
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {u.handle ? `@${u.handle}` : null}
          {u.handle && u.major ? " · " : null}
          {u.major}
          {u.year ? ` · ${u.year}` : ""}
        </div>
      </div>
      {typeof u.mutual_count === "number" && u.mutual_count > 0 ? (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            background: `${accent}24`,
            border: `1px solid ${accent}55`,
            color: "#fff",
            fontFamily: "DM Sans, sans-serif",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {u.mutual_count}m
        </span>
      ) : null}
    </Link>
  );
}
