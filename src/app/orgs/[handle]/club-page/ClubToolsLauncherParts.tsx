"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useId, useRef, type CSSProperties, type JSX, type ReactNode } from "react";

import { RISE_PX, SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";

import { avatarTint, initials, type ArcPersonLine, type ArcTool, type ArcToolId } from "./club-tools-arc";

/**
 * What every card of the Arc shares (Oct 22, 2026; the launcher is
 * ClubToolsLauncher.tsx): the card itself, springing in from the arc, its
 * header (the tool's glyph, its name, a grey line, ×), a person's row, a
 * plain row with a glyph, the pill buttons and the way to the tool's full
 * page. Dark in Light and Night alike, like the club page under it: the
 * launcher is a `vibe-night-island`, so the theme tokens here read as Night.
 * Motion on transform and opacity only, from springs.ts; with reduce motion
 * on, MotionRoot leaves the fades.
 */

/** The board's line glyphs (24-unit boxes, drawn at 1.8 stroke). */
export const ARC_ICON: Record<ArcToolId | "lock" | "campus" | "exit" | "link" | "share" | "eye", string> = {
  invite: "M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  share: "M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6",
  members: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  followers: "M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16M6 19a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
  requests: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM19 8v6M22 11h-6",
  officers: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  events: "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM16 2v4M8 2v4M3 10h18M9 16l2 2 4-4",
  settings: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  lock: "M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM8 11V7a4 4 0 0 1 8 0v4",
  campus: "M3 10l9-6 9 6M5 10v9M19 10v9M9.7 10v9M14.3 10v9M3 21h18",
  exit: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3",
  link: "M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
};

export function ArcGlyph({ d, size = 20 }: { d: string; size?: number }): JSX.Element {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** The board's four avatar gradients, for a person with no photo. */
const AVATAR_TINTS = [
  "linear-gradient(135deg,#FF7A50,#C2410C)",
  "linear-gradient(135deg,#A07BFF,#5B35D5)",
  "linear-gradient(135deg,#4FD1C5,#1F7A73)",
  "linear-gradient(135deg,#F2C25B,#A06410)",
];

export function ArcAvatar({ id, name, handle, url }: { id: string; name: string | null; handle: string | null; url: string | null }): JSX.Element {
  return (
    <span
      aria-hidden
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        // JSON.stringify quotes the URL, so a ")" in it can't end the url().
        background: url ? `url(${JSON.stringify(url)}) center/cover` : AVATAR_TINTS[avatarTint(id, AVATAR_TINTS.length)],
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: 13,
        color: "var(--charcoal)",
      }}
    >
      {url ? null : initials(name, handle)}
    </span>
  );
}

/**
 * A tool's card, beside the arc. It springs in from the arc's side and goes
 * back the same way when another bubble swaps it (AnimatePresence in
 * ClubToolsLauncherArc.tsx). It takes focus when it comes, so a keyboard
 * lands in it; × and Escape give focus back to its bubble.
 */
export function ArcCardFrame({
  tool,
  title,
  sub,
  onClose,
  footer,
  children,
}: {
  tool: ArcTool;
  title: string;
  sub: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const titleId = useId();
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <motion.section
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="vibe-arc-card"
      data-arc-card={tool.id}
      initial={{ opacity: 0, x: 44, scale: 0.94 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.97, transition: SPRING_SNAPPY }}
      transition={SPRING_SOFT}
      style={{ ...cardStyle, boxShadow: `0 30px 80px rgba(0,0,0,0.55), 0 0 40px rgba(${tool.tint},0.16)` }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          right: -60,
          top: -80,
          width: 260,
          height: 220,
          background: `radial-gradient(closest-side, rgba(${tool.tint},0.30), rgba(${tool.tint},0))`,
          pointerEvents: "none",
        }}
      />
      <ArcRise index={0} style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 0" }}>
        <span
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            background: `rgba(${tool.tint},0.18)`,
            border: `1px solid rgba(${tool.tint},0.36)`,
            color: "var(--charcoal)",
          }}
        >
          <ArcGlyph d={ARC_ICON[tool.id]} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id={titleId} style={titleStyle}>
            {title}
          </h2>
          <div style={{ marginTop: 2, fontSize: 13, color: "var(--ink-2)", overflowWrap: "anywhere" }}>{sub}</div>
        </div>
        <button type="button" className="vibe-arc-ghost" aria-label={`Close ${title}`} onClick={onClose} style={closeStyle}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </ArcRise>
      <div style={{ position: "relative", flex: 1, minHeight: 0, overflowY: "auto", padding: "14px 20px 0" }}>{children}</div>
      {footer ? <div style={{ position: "relative", padding: "14px 20px 18px" }}>{footer}</div> : <div style={{ height: 18 }} />}
    </motion.section>
  );
}

/** One line of a card rising into place, a beat after the one above. */
export function ArcRise({ index, style, children }: { index: number; style?: CSSProperties; children: ReactNode }): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: RISE_PX }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SOFT, delay: 0.08 + Math.min(index, 8) * 0.05 }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/** A person in a card: photo, name, a grey line, a chip; `below` for their note or buttons. */
export function ArcPersonRow({
  person,
  index,
  end,
  below,
}: {
  person: ArcPersonLine;
  index: number;
  end?: ReactNode;
  below?: ReactNode;
}): JSX.Element {
  return (
    <ArcRise index={index + 1} style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40 }}>
        <ArcAvatar id={person.id} name={person.name} handle={person.handle} url={person.avatarUrl} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={nameStyle}>{person.name}</span>
          {person.line ? <span style={metaStyle}>{person.line}</span> : null}
        </span>
        {person.tag ? <span style={tagStyle}>{person.tag}</span> : null}
        {end}
      </div>
      {below ? <div style={{ margin: "8px 0 0 48px" }}>{below}</div> : null}
    </ArcRise>
  );
}

/** The way to the tool's whole page: a ghost pill. Following it closes the launcher (`onLeave`). */
export function ArcPageLink({ href, label, onLeave }: { href: string; label: string; onLeave: (href: string) => void }): JSX.Element {
  return (
    <Link href={href} className="vibe-arc-ghost" onNavigate={() => onLeave(href)} style={{ ...pillStyle, ...ghostStyle, width: "100%" }}>
      {label}
    </Link>
  );
}

/** A quiet line in a card (an empty list, why something can't be done). */
export function ArcNote({ children }: { children: ReactNode }): JSX.Element {
  return <p style={{ margin: "2px 0 6px", fontSize: 13.5, lineHeight: 1.45, color: "var(--ink-2)" }}>{children}</p>;
}

/** Grey rows while a card's first read runs. */
export function ArcSkeleton({ rows = 3 }: { rows?: number }): JSX.Element {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56 }}>
          <span style={{ ...skeletonStyle, width: 36, height: 36, borderRadius: 999 }} />
          <span style={{ flex: 1 }}>
            <span style={{ ...skeletonStyle, display: "block", width: "52%", height: 12 }} />
            <span style={{ ...skeletonStyle, display: "block", width: "34%", height: 10, marginTop: 7 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Looks ────────────────────────────────────────────────────────────────

const cardStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxHeight: "100%",
  boxSizing: "border-box",
  overflow: "hidden",
  borderRadius: 24,
  background: "linear-gradient(180deg, #17121F, #0D0A14)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  transformOrigin: "100% 50%",
  pointerEvents: "auto",
  outline: "none",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: "var(--font-display)",
  fontWeight: 800,
  fontSize: 21,
  lineHeight: 1.15,
  color: "var(--charcoal)",
  overflowWrap: "anywhere",
};

const closeStyle: CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  padding: 0,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--charcoal)",
  cursor: "pointer",
};

export const nameStyle: CSSProperties = {
  display: "block",
  fontSize: 14.5,
  fontWeight: 700,
  color: "var(--charcoal)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const metaStyle: CSSProperties = {
  display: "block",
  marginTop: 1,
  fontSize: 12.5,
  color: "var(--ink-2)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export const tagStyle: CSSProperties = {
  flexShrink: 0,
  maxWidth: 120,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 11.5,
  fontWeight: 700,
  padding: "4px 9px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.08)",
  color: "var(--charcoal)",
};

/** A 44px pill: the card's buttons and links. */
export const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 44,
  boxSizing: "border-box",
  padding: "0 16px",
  borderRadius: 999,
  fontFamily: "DM Sans, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  textDecoration: "none",
  whiteSpace: "nowrap",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

export const primaryStyle: CSSProperties = { border: "none", background: "var(--coral)", color: "var(--on-coral)" };

export const ghostStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.07)",
  color: "var(--charcoal)",
};

/** A pill that only says where a row stands ("Invited", "Member"): no fill, no tap. */
export const statusStyle: CSSProperties = {
  ...pillStyle,
  minHeight: 32,
  padding: "0 10px",
  border: "1px solid rgba(255,255,255,0.10)",
  background: "transparent",
  color: "var(--ink-2)",
  fontSize: 12.5,
  cursor: "default",
};

const skeletonStyle: CSSProperties = { flexShrink: 0, borderRadius: 6, background: "rgba(255,255,255,0.08)" };
