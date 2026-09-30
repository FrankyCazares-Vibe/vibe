"use client";

import Link from "next/link";

import { FONT, palette, SERIF } from "../v2-tokens";

/**
 * A brand new club, the officer's view (handoffs/chat-redesign/wave-2-contracts.md
 * 11.9.3, 1.2; mockup `W0_EmptyClub:45-75`, MK:12): shown in the Lounge's
 * place when `org.member_count === 1`, `up_next` is empty and the Lounge's
 * first page is empty. `It's just you so far.` / `Three things to do before
 * people arrive.` / three 52px rows: 1 `Post a welcome on the Board`
 * (switches to the Board chip and focuses the composer), 2 `Add your first
 * event` (→ `/campus?tab=events`), 3 `Invite your members` (→
 * `/orgs/<handle>`). The header stays the one of every club screen (11.3;
 * MK:16.10), the Up next block shows its dashed button (UpNext.tsx).
 */
export type ClubEmptyProps = {
  orgHandle: string;
  night: boolean;
  onPostWelcome: () => void;
};

function Chevron({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function ClubEmpty({ orgHandle, night, onPostWelcome }: ClubEmptyProps) {
  const t = palette(night);
  const ring: React.CSSProperties = {
    width: 28,
    height: 28,
    flexShrink: 0,
    boxSizing: "border-box",
    borderRadius: 999,
    border: `1.5px solid ${t.ringGrey}`,
    color: t.secondary,
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const quietRow: React.CSSProperties = {
    height: 52,
    boxSizing: "border-box",
    padding: "0 0 0 12px",
    color: t.ink,
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: 12,
  };
  const quietLabel: React.CSSProperties = {
    flexGrow: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: 600,
    lineHeight: 1.3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
  return (
    <section aria-labelledby="lounge-start-heading" style={{ boxSizing: "border-box", padding: "16px 16px 12px", display: "flex", flexDirection: "column", fontFamily: FONT }}>
      <h2 id="lounge-start-heading" style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 22, lineHeight: 1.15, letterSpacing: -0.4, color: t.ink }}>
        It&rsquo;s just you so far.
      </h2>
      <p style={{ margin: "6px 0 0", fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: t.secondary }}>Three things to do before people arrive.</p>
      <ol style={{ margin: "14px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
        <li>
          <button
            type="button"
            onClick={onPostWelcome}
            style={{ width: "100%", height: 52, boxSizing: "border-box", padding: "0 12px", borderRadius: 16, border: "none", background: t.coralButton.bg, color: t.coralButton.ink, fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
          >
            <span aria-hidden="true" style={{ ...ring, border: "none", background: "#140806", color: "#FF8A66", fontWeight: 800 }}>1</span>
            <span style={{ ...quietLabel, fontWeight: 800 }}>Post a welcome on the Board</span>
            <Chevron color="currentColor" />
          </button>
        </li>
        <li>
          <Link href="/campus?tab=events" style={quietRow}>
            <span aria-hidden="true" style={ring}>2</span>
            <span style={{ flexGrow: 1, minWidth: 0, alignSelf: "stretch", boxSizing: "border-box", paddingRight: 12, borderBottom: `1px solid ${t.hairline}`, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={quietLabel}>Add your first event</span>
              <Chevron color={t.muted} />
            </span>
          </Link>
        </li>
        <li>
          <Link href={`/orgs/${encodeURIComponent(orgHandle)}`} style={quietRow}>
            <span aria-hidden="true" style={ring}>3</span>
            <span style={{ flexGrow: 1, minWidth: 0, alignSelf: "stretch", boxSizing: "border-box", paddingRight: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={quietLabel}>Invite your members</span>
              <Chevron color={t.muted} />
            </span>
          </Link>
        </li>
      </ol>
    </section>
  );
}
