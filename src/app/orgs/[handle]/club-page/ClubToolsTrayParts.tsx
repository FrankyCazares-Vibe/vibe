"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, type CSSProperties, type JSX, type ReactNode } from "react";

import { LoadFailed, type LoadFailure } from "@/components/feedback/LoadFailed";
import { ineligibleLine } from "@/components/orgs/tools/member-rules";
import { RISE_PX, SPRING_POP, SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion/springs";
import { ORG_COPY } from "@/lib/orgs/join-copy";

import { ARC_TOOLS, bubbleLabel, chipText, displayName, type ArcCounts, type ArcTool, type ArcToolId } from "./club-tools-arc";
import { ARC_ICON, ArcAvatar, ArcGlyph, ghostStyle, metaStyle, nameStyle, pillStyle, primaryStyle } from "./ClubToolsLauncherParts";
import { PLANET_SURFACE } from "./ClubToolsLauncherPlanet";
import type { RequestRow } from "./use-join-requests";

/**
 * The phone's Club tools tray, its pieces (Oct 23, 2026; PLAN-6.md, Franky
 * picked the Inline tray, `PhoneE.dc.html`; the row and the tray itself are
 * ClubToolsTray.tsx): the pill's little planet, the tray's first view (Needs
 * you, then the seven tools as small bubbles with their names under them,
 * and All Club tools), and keeping the open tray clear of the phone tab bar.
 * Dark in Light and Night alike, like the Arc's cards: the tray is a
 * `vibe-night-island`, so the theme tokens here read as Night. Motion on
 * transform and opacity only, from springs.ts; with reduce motion on,
 * MotionRoot leaves the fades.
 */

/** The pill's little planet: the Arc's handle in miniature (ClubToolsLauncherPlanet.tsx), the coral count on its shoulder. */
export function TrayPlanet({ count }: { count: string | null }): JSX.Element {
  return (
    <span aria-hidden style={{ position: "relative", width: 22, height: 22, flexShrink: 0 }}>
      <span style={planetBodyStyle}>
        <span className="vibe-arc-sway" style={{ position: "absolute", inset: 0, borderRadius: "50%", background: PLANET_SURFACE }} />
        <span style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 1px 1px 2px rgba(255,230,206,0.6)" }} />
      </span>
      <svg width="8" height="8" viewBox="0 0 24 24" style={{ position: "absolute", left: 1, top: -3, fill: "var(--charcoal)" }}>
        <path d="M12 0c.5 7 4.6 11.4 12 12-7.4.6-11.5 5-12 12-.5-7-4.6-11.4-12-12 7.4-.6 11.5-5 12-12Z" />
      </svg>
      {count ? <span style={planetBadgeStyle}>{count}</span> : null}
    </span>
  );
}

/** What the tray knows about the people waiting (useJoinRequests, read as it opens). */
export type TrayNeeds = {
  /** Null until read, and while a card's change is read again (no stale Approve meanwhile). */
  rows: RequestRow[] | null;
  failure: LoadFailure | null;
  busy: ReadonlySet<string>;
  /** The page says someone waits: the strip keeps its place while the first read runs. */
  expected: boolean;
  act: (row: RequestRow, action: "approve" | "deny") => void;
  retry: () => void;
};

/**
 * The tray's first view: Needs you (only while someone waits), then the
 * seven tools in a 4 + 4 grid whose eighth cell is All Club tools. `back`:
 * the tool whose card it came back from (null the first time it shows):
 * then it slides in from the left, as the card went out to the right, and
 * that tool's bubble takes focus; the first time, the bubbles pop in one
 * after another instead and focus stays on the pill.
 */
export function TrayHome({
  needs,
  hidden,
  counts,
  toolsHref,
  back,
  onPick,
  onLeave,
}: {
  needs: TrayNeeds;
  hidden: boolean;
  counts: ArcCounts;
  toolsHref: string;
  back: ArcToolId | null;
  onPick: (id: ArcToolId) => void;
  onLeave: (href: string) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (back) ref.current?.querySelector<HTMLElement>(`[data-tray-tool="${back}"]`)?.focus({ preventScroll: true });
  }, [back]);
  const first = back === null;
  return (
    <motion.div
      ref={ref}
      initial={first ? false : { opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24, transition: SPRING_SNAPPY }}
      transition={SPRING_SOFT}
      style={homeStyle}
    >
      <span aria-hidden style={glowCoralStyle} />
      <span aria-hidden style={glowVioletStyle} />
      <span aria-hidden style={orbitStyle} />
      <div style={{ position: "relative" }}>
        <NeedsYou needs={needs} hidden={hidden} rise={first} onMore={() => onPick("requests")} />
        <nav aria-label="Club tools" style={gridStyle}>
          {ARC_TOOLS.map((t, i) => (
            <TrayBubble key={t.id} tool={t} index={i} counts={counts} pop={first} onPick={() => onPick(t.id)} />
          ))}
          <TrayPop index={ARC_TOOLS.length} pop={first}>
            <Link href={toolsHref} className="vibe-press" onNavigate={() => onLeave(toolsHref)} style={{ ...cellStyle, textDecoration: "none" }}>
              <span aria-hidden style={allBubbleStyle}>
                <ArcGlyph d={ARROW} size={17} />
              </span>
              <span style={{ ...toolNameStyle, color: "var(--ink-2)" }}>All Club tools</span>
            </Link>
          </TrayPop>
        </nav>
      </div>
    </motion.div>
  );
}

const ARROW = "M5 12h14M13 5l7 7-7 7";

/** One line of the first view rising into place, the first time only. */
function TrayRise({ rise, index, style, children }: { rise: boolean; index: number; style?: CSSProperties; children: ReactNode }): JSX.Element {
  return (
    <motion.div
      initial={rise ? { opacity: 0, y: RISE_PX } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_SOFT, delay: 0.08 + index * 0.04 }}
      style={style}
    >
      {children}
    </motion.div>
  );
}

/** A grid cell popping in, a beat after the one before it, the first time only. */
function TrayPop({ index, pop, children }: { index: number; pop: boolean; children: ReactNode }): JSX.Element {
  const delay = 0.12 + index * 0.035;
  return (
    <motion.div
      initial={pop ? { opacity: 0, y: 6, scale: 0.5 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ default: { ...SPRING_SOFT, delay }, scale: { ...SPRING_POP, delay } }}
      style={{ display: "flex", justifyContent: "center", minWidth: 0 }}
    >
      {children}
    </motion.div>
  );
}
/**
 * One tool: a small tinted bubble (the Arc's tint and glyph), its count on
 * the shoulder (`chipText`, coral on Join requests) and its name always
 * shown under it. Join requests wears a coral ring, and a slow glow while
 * someone waits (CSS, behind reduce motion, as on the Arc's planet).
 */
function TrayBubble({
  tool,
  index,
  counts,
  pop,
  onPick,
}: {
  tool: ArcTool;
  index: number;
  counts: ArcCounts;
  pop: boolean;
  onPick: () => void;
}): JSX.Element {
  const count = tool.id === "requests" ? counts.requests : tool.id === "members" ? counts.members : tool.id === "followers" ? counts.followers : null;
  const chip = chipText(count);
  return (
    <TrayPop index={index} pop={pop}>
      <button type="button" className="vibe-press" data-tray-tool={tool.id} aria-label={bubbleLabel(tool.id, counts)} onClick={onPick} style={cellStyle}>
        <span aria-hidden style={{ position: "relative", display: "block", width: 44, height: 44, flexShrink: 0 }}>
          {tool.hot && chip ? <span className="vibe-arc-glow--hot" style={hotGlowStyle} /> : null}
          <span style={bubbleStyle(tool)}>
            <ArcGlyph d={ARC_ICON[tool.id]} size={19} />
          </span>
          {chip ? <span style={chipStyle(tool.hot)}>{chip}</span> : null}
        </span>
        <span aria-hidden style={{ ...toolNameStyle, color: tool.hot ? "var(--tag-ink)" : "var(--charcoal)" }}>
          {tool.name}
        </span>
      </button>
    </TrayPop>
  );
}

/**
 * Needs you: the oldest request (the list comes oldest first), with Approve
 * and Decline as on the Arc's Join requests card: no Approve on a hidden
 * club or for someone who can't be let in, and a grey line why.
 * More than one waiting: "and N more" opens that card. Nothing when nobody
 * waits; while the first read runs and the page says someone does, a quiet
 * placeholder holds the place, and a failed read says so with Retry.
 */
function NeedsYou({ needs, hidden, rise, onMore }: { needs: TrayNeeds; hidden: boolean; rise: boolean; onMore: () => void }): JSX.Element | null {
  const { rows, failure, busy, expected, act, retry } = needs;
  const first = rows?.[0] ?? null;
  if (rows && !first) return null;
  if (!rows && !expected) return null;
  const more = rows ? rows.length - 1 : 0;
  let body: ReactNode;
  if (first) body = <NeedsYouStrip row={first} hidden={hidden} busy={busy.has(first.id)} act={act} />;
  else if (failure) body = <div style={{ marginTop: 8 }}><LoadFailed failure={failure} tone="dark" compact onRetry={retry} /></div>;
  else body = <StripPlaceholder />;
  return (
    <TrayRise rise={rise} index={0} style={{ marginBottom: more > 0 ? 2 : 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 4px" }}>
        <span style={eyebrowStyle}>
          <span aria-hidden style={dotStyle} />
          Needs you
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: "var(--ink-muted)" }}>
          <ArcGlyph d={ARC_ICON.lock} size={11} />
          Only officers
        </span>
      </div>
      {body}
      {more > 0 ? (
        <button type="button" className="vibe-arc-row" onClick={onMore} style={moreStyle}>
          and {more.toLocaleString("en-US")} more
          <ArcGlyph d="M9 6l6 6-6 6" size={14} />
        </button>
      ) : null}
    </TrayRise>
  );
}

function NeedsYouStrip({
  row,
  hidden,
  busy,
  act,
}: {
  row: RequestRow;
  hidden: boolean;
  busy: boolean;
  act: TrayNeeds["act"];
}): JSX.Element {
  const who = displayName(row.name, row.handle);
  const canApprove = !hidden && row.eligible !== false && row.can_approve !== false;
  // A hidden club takes nobody new, so only Decline shows; the line says why,
  // as the Join requests card's note does.
  const base =
    row.eligible === false ? ineligibleLine(row.ineligible_reason) : hidden ? "wants to join, but the club is hidden" : "wants to join";
  const line = row.removed_before ? `${base} · ${ORG_COPY.meta.removedBefore}` : base;
  return (
    <div style={stripStyle}>
      <span style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 128px", minWidth: 0 }}>
        <ArcAvatar id={row.user_id} name={row.name} handle={row.handle} url={row.avatar_url} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={nameStyle}>{who}</span>
          <span style={{ ...metaStyle, whiteSpace: "normal" }}>{line}</span>
        </span>
      </span>
      <span style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
        {canApprove ? (
          <button
            type="button"
            className="vibe-arc-primary vibe-press"
            disabled={busy}
            aria-label={`Approve ${who}`}
            onClick={() => act(row, "approve")}
            style={{ ...pillStyle, ...primaryStyle, padding: "0 15px", boxShadow: "0 6px 16px rgba(255,92,53,0.32)", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? ORG_COPY.buttons.busy : "Approve"}
          </button>
        ) : null}
        <button
          type="button"
          className="vibe-arc-ghost vibe-press"
          disabled={busy}
          aria-label={`Decline ${who}`}
          onClick={() => act(row, "deny")}
          style={{ ...pillStyle, ...ghostStyle, padding: "0 13px", opacity: busy ? 0.6 : 1 }}
        >
          Decline
        </button>
      </span>
    </div>
  );
}

/** The strip's place while the list is read: an avatar and two grey lines. */
function StripPlaceholder(): JSX.Element {
  return (
    <div aria-hidden style={{ ...stripStyle, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
      <span style={{ ...skeletonStyle, width: 36, height: 36, borderRadius: 999 }} />
      <span style={{ flex: 1 }}>
        <span style={{ ...skeletonStyle, display: "block", width: "46%", height: 12 }} />
        <span style={{ ...skeletonStyle, display: "block", width: "30%", height: 10, marginTop: 7 }} />
      </span>
    </div>
  );
}
// ─── Keeping it in view ───────────────────────────────────────────────────

/** Room kept below the tray, over the tab bar, and above the row, under the notch. */
const VIEW_ROOM = 12;

/**
 * When the open tray's bottom sits under the phone tab bar
 * (`.vibe-mobile-tabbar`, about 84px with the home indicator), the page
 * scrolls by the difference, smoothly or at once with reduce motion; never
 * so far that the row with the pill goes off the top, under the notch
 * (`.vibe-mobile-safe-top`). Measured from layout, not from what is drawn,
 * so the tray settling in (scale and y) doesn't shift the sum, and the
 * target is a place on the page, so asking again mid-scroll lands on the
 * same spot. It only ever scrolls down.
 */
export function keepInView(tray: HTMLElement, row: HTMLElement | null, reduce: boolean): void {
  const box = tray.offsetParent;
  if (!(box instanceof HTMLElement)) return;
  const bottom = box.getBoundingClientRect().top + tray.offsetTop + tray.offsetHeight;
  const bar = document.querySelector<HTMLElement>(".vibe-mobile-tabbar")?.getBoundingClientRect();
  const floor = bar && bar.height > 0 ? Math.min(window.innerHeight, bar.top) : window.innerHeight;
  const need = bottom + VIEW_ROOM - floor;
  if (need < 1) return;
  const safe = document.querySelector<HTMLElement>(".vibe-mobile-safe-top");
  const notch = safe ? Number.parseFloat(window.getComputedStyle(safe).paddingTop) || 0 : 0;
  const top = (row ?? box).getBoundingClientRect().top;
  const by = Math.min(need, top - notch - VIEW_ROOM);
  if (by < 1) return;
  window.scrollTo({ top: window.scrollY + by, behavior: reduce ? "auto" : "smooth" });
}

// ─── Looks ────────────────────────────────────────────────────────────────

/** The tray's top colour, for the pointer up to the pill over the first view. */
export const TRAY_TOP = "#2A1B2C";

/** The first view's rounded glass: dark, like the Arc's cards, a coral warmth at the top. */
const homeStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  boxSizing: "border-box",
  padding: "12px 12px 10px",
  borderRadius: 22,
  background: `linear-gradient(180deg, ${TRAY_TOP} 0%, #1F1629 30%, #17121F 100%)`,
  border: "1px solid rgba(255,255,255,0.13)",
  boxShadow: "0 22px 44px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.09)",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
};

const glowBase: CSSProperties = { position: "absolute", pointerEvents: "none" };
const glowCoralStyle: CSSProperties = {
  ...glowBase,
  right: -120,
  top: 26,
  width: 300,
  height: 230,
  background: "radial-gradient(closest-side, rgba(255,110,60,0.17), rgba(255,110,60,0.05) 60%, rgba(255,110,60,0))",
};
const glowVioletStyle: CSSProperties = {
  ...glowBase,
  left: -140,
  bottom: -150,
  width: 380,
  height: 320,
  background: "radial-gradient(closest-side, rgba(123,95,224,0.20), rgba(123,95,224,0.05) 62%, rgba(123,95,224,0))",
};
/** A faint orbit line through the glass, as on the board. */
const orbitStyle: CSSProperties = {
  ...glowBase,
  left: -180,
  top: -330,
  width: 820,
  height: 820,
  borderRadius: "50%",
  border: "1px solid rgba(255,190,160,0.08)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  rowGap: 10,
  columnGap: 2,
};

/** A grid cell: the whole cell is the target (75px tall), the bubble and the name in it. */
const cellStyle: CSSProperties = {
  width: "100%",
  minHeight: 75,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  boxSizing: "border-box",
  padding: "2px 0 4px",
  border: "none",
  borderRadius: 14,
  background: "transparent",
  color: "var(--charcoal)",
  fontFamily: "DM Sans, sans-serif",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const toolNameStyle: CSSProperties = {
  marginTop: 5,
  maxWidth: 78,
  fontSize: 12,
  fontWeight: 700,
  lineHeight: "13px",
  textAlign: "center",
  textWrap: "balance",
  overflowWrap: "anywhere",
};
/** A tool's bubble, 44px: the Arc's glass (ClubToolsLauncherArc.tsx), its tint rising from below. */
function bubbleStyle(tool: ArcTool): CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    borderRadius: "50%",
    background: `radial-gradient(circle at 34% 26%, rgba(255,255,255,0.17), rgba(255,255,255,0.03) 58%), radial-gradient(circle at 50% 120%, rgba(${tool.tint},0.46), rgba(${tool.tint},0) 72%), rgba(16,12,24,0.94)`,
    border: `1px solid ${tool.hot ? "rgba(255,140,100,0.62)" : "rgba(255,255,255,0.14)"}`,
    boxShadow: `0 8px 18px rgba(0,0,0,0.42), 0 0 16px rgba(${tool.tint},0.22)`,
    color: "var(--charcoal)",
  };
}

/** The count on a bubble's shoulder: coral on Join requests, a quiet dark chip on the others. */
function chipStyle(hot: boolean): CSSProperties {
  return {
    position: "absolute",
    right: -7,
    top: -4,
    minWidth: 19,
    height: 19,
    padding: "0 5px",
    boxSizing: "border-box",
    borderRadius: 999,
    background: hot ? "var(--coral)" : "#3B3249",
    color: hot ? "var(--on-coral)" : "var(--charcoal)",
    fontSize: 10.5,
    fontWeight: 800,
    lineHeight: "19px",
    textAlign: "center",
    boxShadow: hot ? "0 0 0 2px #1C1526, 0 0 10px rgba(255,92,53,0.6)" : "0 0 0 2px #1C1526",
  };
}

const hotGlowStyle: CSSProperties = {
  position: "absolute",
  inset: -13,
  borderRadius: "50%",
  background: "radial-gradient(closest-side, rgba(255,92,53,0.42), rgba(255,92,53,0.10) 62%, rgba(255,92,53,0))",
  pointerEvents: "none",
};

/** All Club tools: a dashed ring with an arrow, quieter than the tools. */
const allBubbleStyle: CSSProperties = {
  width: 44,
  height: 44,
  flexShrink: 0,
  boxSizing: "border-box",
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "1px dashed rgba(var(--scrim-rgb),0.34)",
  background: "rgba(var(--scrim-rgb),0.03)",
  color: "var(--ink-2)",
};

const eyebrowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--eyebrow-ink)",
};

const dotStyle: CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  background: "var(--coral)",
  boxShadow: "0 0 8px rgba(255,92,53,0.9)",
};

/** The oldest request: a coral-warm strip; the two answers wrap under the name on a narrow phone. */
const stripStyle: CSSProperties = {
  marginTop: 8,
  minHeight: 60,
  boxSizing: "border-box",
  padding: 8,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  borderRadius: 16,
  background:
    "linear-gradient(120deg, rgba(255,92,53,0.19) 0%, rgba(255,92,53,0.07) 60%, rgba(255,92,53,0.03) 100%), rgba(18,13,24,0.7)",
  border: "1px solid rgba(255,128,90,0.32)",
};

const moreStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  minHeight: 44,
  width: "100%",
  boxSizing: "border-box",
  padding: "0 8px",
  border: "none",
  borderRadius: 12,
  background: "transparent",
  color: "var(--tag-ink)",
  fontFamily: "DM Sans, sans-serif",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const skeletonStyle: CSSProperties = { flexShrink: 0, borderRadius: 6, background: "rgba(255,255,255,0.08)" };

const planetBodyStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  borderRadius: "50%",
  overflow: "hidden",
  boxShadow: "0 0 0 1px rgba(255,196,160,0.3), 0 0 10px rgba(255,110,60,0.45)",
};

/** Dark number on coral, on the little planet's shoulder, as on the Arc's planet. */
const planetBadgeStyle: CSSProperties = {
  position: "absolute",
  right: -7,
  top: -6,
  minWidth: 15,
  height: 15,
  padding: "0 4px",
  boxSizing: "border-box",
  borderRadius: 999,
  background: "var(--coral)",
  color: "var(--on-coral)",
  fontSize: 9.5,
  fontWeight: 800,
  lineHeight: "15px",
  textAlign: "center",
  boxShadow: "0 0 0 2px #2A2234",
};
