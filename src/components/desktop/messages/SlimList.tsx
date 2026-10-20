"use client";

import { useEffect, useRef } from "react";

import { clubGradient, personColor } from "@/components/mobile/messages/avatar";
import { initialsOf } from "@/components/mobile/messages/format";
import { FONT, palette, type Palette, SERIF } from "@/components/mobile/messages/v2-tokens";

import type { SlimListProps } from "./contracts";
import type { SlimRow } from "./desktop-rules";

/**
 * The slim list of desktop Messages (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 3.2, H3, H14, section 8 W3-4-lists; the board's steps 1 to 5):
 * the 232px column of names beside an open chat. The `Messages` control goes
 * back to the full list; under it, every chat of the full list, in its order
 * (Oct 19, 2026, critique D5: the column scrolls), 44px each: a 26px mark,
 * the name on one line, the dot.
 *
 * It decides nothing: `rows` are `slimRows(...)` (which rows, their order,
 * the dot, the spoken name, the address). Rows are links, so Cmd / Ctrl /
 * Shift / middle click open the chat in a new tab; a plain left click is
 * handed to the shell (`onOpen`), which writes the history itself (3.5 rule
 * 3). The open row is the chat on screen: it carries `aria-current="page"`
 * and a plain click on it opens nothing (its `target` is never acted on).
 *
 * No cap (H14): the column of names scrolls. The root is the body row's flex
 * item (3.2: `flex 0 0 232`): mount it straight in that row.
 */

const SLIM_CSS = `
.vibe-slim-home { background: transparent; }
.vibe-slim-row:hover, .vibe-slim-home:hover { background: rgba(var(--scrim-rgb), 0.045); }
.vibe-slim-row[aria-current="page"] { background: rgba(var(--scrim-rgb), 0.07); }
.vibe-slim-row:focus-visible, .vibe-slim-home:focus-visible { outline: 2px solid var(--coral); outline-offset: -2px; }
`;

/** A plain left click: the shell opens the chat in place. Anything else is the browser's (a new tab, a new window, the menu). */
const plainClick = (e: React.MouseEvent): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export function SlimList({ rows, night, onHome, onOpen }: SlimListProps) {
  const t = palette(night);
  const navRef = useRef<HTMLElement>(null);
  const openKey = rows.find((r) => r.open)?.key ?? null;
  // Every chat is in the column since Oct 19, 2026 (critique D5), so the open one can sit below its fold.
  // Bring it into view only when a different chat opens, never against the person's own scrolling; no
  // smooth scroll, so reduced motion holds.
  useEffect(() => {
    if (!openKey) return;
    navRef.current?.querySelector<HTMLElement>('a[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [openKey]);
  return (
    <div style={{ flex: "0 0 232px", width: 232, height: "100%", minHeight: 0, boxSizing: "border-box", padding: "0 10px", display: "flex", flexDirection: "column", color: t.ink, fontFamily: FONT }}>
      <style>{SLIM_CSS}</style>
      <div style={{ height: 64, flexShrink: 0, display: "flex", alignItems: "center" }}>
        <button
          type="button"
          className="vibe-slim-home"
          onClick={onHome}
          aria-label="Messages. Show the full list"
          style={{ height: 36, padding: "0 12px 0 6px", border: "none", borderRadius: 999, color: t.ink, fontFamily: SERIF, fontWeight: 800, fontSize: 18, letterSpacing: "-0.4px", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.secondary} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Messages
        </button>
      </div>
      <nav ref={navRef} aria-label="Your chats" style={{ flex: "1 1 0", minHeight: 0, overflowX: "hidden", overflowY: "auto", overscrollBehavior: "contain", paddingBottom: 16, display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map((row) => {
          const club = row.kind === "club";
          // The open chat and an unread one read in full ink; a pinned, read one steps back (the board's two weights).
          const strong = row.open || row.dot === "coral";
          return (
            <a
              key={row.key}
              href={row.href}
              className="vibe-slim-row"
              aria-label={row.label}
              aria-current={row.open ? "page" : undefined}
              onClick={(e) => {
                if (!plainClick(e)) return;
                e.preventDefault();
                // The second click of a double click was aimed at what stood here at the first one (a row of
                // the wide list, which tucked under the pointer): it opens nothing. A key press counts 0.
                if (e.detail > 1) return;
                if (!row.open) onOpen(row);
              }}
              style={{ height: 44, flexShrink: 0, boxSizing: "border-box", padding: "0 12px 0 10px", borderRadius: 12, display: "flex", alignItems: "center", gap: 10, textDecoration: "none", transition: "background 240ms ease" }}
            >
              <Mark row={row} t={t} night={night} />
              <span
                style={{
                  flexGrow: 1,
                  minWidth: 0,
                  fontFamily: club ? SERIF : FONT,
                  fontSize: club ? 15 : 14,
                  letterSpacing: club ? "-0.2px" : undefined,
                  fontWeight: club ? (strong ? 800 : 700) : strong ? 700 : 500,
                  lineHeight: "20px",
                  color: strong ? t.ink : t.secondary,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {row.name}
              </span>
              {row.dot === "coral" ? (
                <span aria-hidden="true" style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 999, background: t.coral }} />
              ) : row.dot === "ring" ? (
                // Only new Lounge messages (H3): a hollow ring, never the coral.
                <span aria-hidden="true" style={{ width: 7, height: 7, flexShrink: 0, boxSizing: "border-box", borderRadius: 999, border: `1.5px solid ${t.muted}` }} />
              ) : null}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * The 26px mark: a club's logo or its initials on `clubGradient(seed)`; a
 * person's or a group's photo, or initials on `personColor(seed)` (a row
 * carries one seed, so a group without a photo is one disc, not the phone's
 * two).
 */
function Mark({ row, t, night }: { row: SlimRow; t: Palette; night: boolean }) {
  const base: React.CSSProperties = { width: 26, height: 26, flexShrink: 0, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" };
  if (row.avatarUrl) return <span aria-hidden="true" style={{ ...base, background: `url(${row.avatarUrl}) center/cover` }} />;
  if (row.kind === "club") {
    return (
      // The gradients are dark in both themes: the initials take the theme's light colour (the page in Light, the ink in Night).
      <span aria-hidden="true" style={{ ...base, background: clubGradient(row.seed), boxShadow: `inset 0 0 0 1px ${t.hairline}`, color: night ? t.ink : t.page, fontFamily: SERIF, fontSize: 10.5, fontWeight: 800 }}>
        {initialsOf(row.name)}
      </span>
    );
  }
  const c = personColor(row.seed);
  return (
    <span aria-hidden="true" style={{ ...base, background: c.bg, color: c.ink, fontSize: 9.5, fontWeight: 700 }}>
      {/* A person with no name yet is titled `@handle`: the initial is the handle's. */}
      {initialsOf(row.name.replace(/^@/, ""))}
    </span>
  );
}
