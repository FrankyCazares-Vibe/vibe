"use client";

import type { ChatMessage } from "@/lib/chat/types";

import { FONT, palette } from "../v2-tokens";
import { authorName, boardStripLabel } from "./helpers";

/**
 * The Board strip (handoffs/chat-redesign/wave-2-contracts.md 11.3, 1.2;
 * mockup `W0_Club:59-64`, `W0_Room:72-77`, MK:4): a 44px button showing the
 * latest Board post, `Board · <Author> · <text>` with the text = `content` (a
 * card's fallback text), the dot when the Board is unread, a chevron. Shown
 * on every room but the Board when `board_latest !== null`; tap → the Board
 * chip. The word is "Latest", never "Pinned" (1.1, MK:15).
 */
export type BoardStripProps = {
  latest: ChatMessage;
  unread: boolean;
  night: boolean;
  /** `6px 12px 0` on the space, `4px 12px 0` under the event chat's About. */
  margin?: string;
  onOpen: () => void;
};

export function BoardStrip({ latest, unread, night, margin = "6px 12px 0", onOpen }: BoardStripProps) {
  const t = palette(night);
  const author = authorName(latest.users);
  const text = latest.content;
  return (
    <button
      type="button"
      aria-label={boardStripLabel(author, text, unread)}
      onClick={onOpen}
      style={{
        flexShrink: 0,
        margin,
        height: 44,
        boxSizing: "border-box",
        padding: "0 10px 0 12px",
        borderRadius: 16,
        border: `1px solid ${t.hairline}`,
        background: t.surface,
        boxShadow: night ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "0 1px 2px rgba(20,20,22,0.04)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: t.ink,
        fontFamily: FONT,
        textAlign: "left",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.coralText} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1z" />
        <path d="M16 9a4.5 4.5 0 0 1 0 6" />
        <path d="M18.5 6.5a8 8 0 0 1 0 11" />
      </svg>
      <span style={{ flexGrow: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.secondary }}>
        <span style={{ fontWeight: 800, color: t.ink }}>Board</span>
        {" · "}
        {author}
        {" · "}
        <span style={{ color: t.ink }}>{text}</span>
      </span>
      {unread ? <span aria-hidden="true" style={{ width: 7, height: 7, flexShrink: 0, borderRadius: 999, background: t.coral }} /> : null}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
