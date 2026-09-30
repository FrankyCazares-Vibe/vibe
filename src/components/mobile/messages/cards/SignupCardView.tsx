"use client";

import { useState } from "react";

import type { Card, PollCard, PollCardOption } from "@/lib/chat/types";

import { toastSendFailure } from "../send-failure";
import { palette } from "../v2-tokens";
import {
  announceFilled,
  filledLine,
  firstOpenIndex,
  FULL,
  LEAVE,
  leaveLabel,
  openWord,
  personName,
  signupCardLabel,
  signupCounts,
  signupProgress,
  signupTwoLine,
  TAKE_A_SPOT,
  takeSpotLabel,
  visibleTakers,
} from "./card-rules";
import { castVote, PersonDisc, PillSpinner, Ring } from "./card-parts";

/**
 * A sign-up inside `CardBubble` (wave-2 contract 11.8, 1.2 "Cards"; mockups
 * W0_Cards 7.3 single-line, W0_Room two-line): the title; one row per slot
 * — single-line 36/44px when every label is at most 12 characters, else the
 * two-line 56px layout (open point 14.34) — with the slot label, the taker
 * chips (three, then `+N` for the rest of the VISIBLE takers), and at the
 * right `Leave` when `mine` (full or not), else `Full`, else `<K> open` +
 * `Take a spot` (the first open row gets the coral pill, the others the
 * outlined one); the footer progress (`min(Σ capacity, 12)` segments, a
 * continuous bar past 12) and `<taken> of <total> filled`.
 *
 * `Take a spot` → `PUT …/vote { option_id, on: true }`, `Leave` → `on:
 * false`, no optimistic change; `slot_full` → the toast and `onRefresh`;
 * `not_found` → `onRefresh`; `poll_closed` marks the card closed through
 * `onCard(messageId, { ...card, closed: true })` (S3-CONTRACT-2). The chip
 * row clips at a chip's edge (whole chips, never mid-name): a row that
 * cannot hold every chip beside the pill hides the rest (S3-DESIGN-7).
 */
export type SignupCardViewProps = {
  card: PollCard;
  roomId: string;
  messageId: string;
  createdAt: string;
  author: string | null;
  isMine: boolean;
  night: boolean;
  header: React.ReactNode;
  onCard: (id: string, card: Card) => void;
  onRefresh: (createdAt: string) => void;
  onAnnounce: (text: string) => void;
};

const ROW_LINE = "1px solid rgba(var(--scrim-rgb),0.07)";

/** One 20px line of chips; chips past the row's width wrap to a hidden second line, so nothing is cut mid-name. */
const CHIP_LINE: React.CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", alignContent: "flex-start", gap: "24px 8px", height: 20, overflow: "hidden" };

export function SignupCardView({ card, roomId, messageId, createdAt, author, isMine, night, header, onCard, onRefresh, onAnnounce }: SignupCardViewProps) {
  const t = palette(night);
  const [busy, setBusy] = useState<string | null>(null);
  const closed = card.closed;
  const twoLine = signupTwoLine(card.options.map((o) => o.label));
  const { taken, total } = signupCounts(card.options);
  const progress = signupProgress(total, taken);
  const coralIndex = firstOpenIndex(card.options);
  const emptySegment = "rgba(var(--scrim-rgb),0.12)";

  const act = async (option: PollCardOption, on: boolean) => {
    if (closed || busy !== null) return;
    setBusy(option.id);
    const r = await castVote(roomId, messageId, option.id, on);
    setBusy(null);
    if (r.ok) {
      const next = r.data?.card;
      if (next && next.type === "signup") {
        onCard(messageId, next);
        const counts = signupCounts(next.options);
        onAnnounce(announceFilled(counts.taken, counts.total));
      } else {
        onRefresh(createdAt);
      }
      return;
    }
    toastSendFailure(r);
    if (r.code === "slot_full" || r.code === "not_found") onRefresh(createdAt);
    else if (r.code === "poll_closed") onCard(messageId, { ...card, closed: true });
  };

  const pill = (coral: boolean): React.CSSProperties => ({
    position: "relative",
    height: 32,
    boxSizing: "border-box",
    padding: "0 14px",
    borderRadius: 999,
    border: coral ? "none" : "1px solid rgba(var(--scrim-rgb),0.16)",
    background: coral ? t.coralButton.bg : "rgba(var(--scrim-rgb),0.04)",
    color: coral ? t.coralButton.ink : t.ink,
    fontSize: 13,
    fontWeight: coral ? 800 : 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const actionButton = (option: PollCardOption, kind: "take" | "leave", open: number, coral: boolean) => {
    const spinning = busy === option.id;
    const blocked = closed || busy !== null;
    const text = kind === "take" ? TAKE_A_SPOT : LEAVE;
    return (
      <button
        type="button"
        aria-label={kind === "take" ? takeSpotLabel(option.label, open) : leaveLabel(option.label)}
        aria-disabled={blocked || undefined}
        onClick={() => void act(option, kind === "take")}
        style={{ marginLeft: "auto", flexShrink: 0, height: 44, padding: 0, border: "none", background: "transparent", fontFamily: "inherit", cursor: blocked ? "default" : "pointer", display: "flex", alignItems: "center", WebkitTapHighlightColor: "transparent" }}
      >
        <span style={pill(coral)}>
          <span style={{ visibility: spinning ? "hidden" : "visible" }}>{text}</span>
          {spinning ? (
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PillSpinner color={coral ? t.coralButton.ink : t.ink} />
            </span>
          ) : null}
        </span>
      </button>
    );
  };

  const chips = (option: PollCardOption, open: number, showOpen: boolean) => {
    const takers = visibleTakers(card.anonymous ? [] : option.voters);
    return (
      <>
        {takers.shown.map((v) => (
          <span key={v.id} style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: t.secondary }}>
            <PersonDisc person={v} size={20} fontSize={8} />
            {personName(v)}
          </span>
        ))}
        {takers.more > 0 ? <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: t.muted }}>+{takers.more}</span> : null}
        {showOpen ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: t.secondary }}>
            <Ring size={20} color="rgba(var(--scrim-rgb),0.35)" dashed />
            {openWord(open)}
          </span>
        ) : null}
      </>
    );
  };

  return (
    <div role="group" aria-label={signupCardLabel(card.question, taken, total, author, isMine)}>
      {header}
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, lineHeight: 1.3, overflowWrap: "anywhere" }}>{card.question}</div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column" }}>
        {card.options.map((option, i) => {
          const open = Math.max(0, (option.capacity ?? 0) - option.count);
          const kind: "leave" | "full" | "take" = option.mine ? "leave" : option.full || open === 0 ? "full" : "take";
          const right =
            kind === "full" ? (
              <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 12, fontWeight: 600, color: t.muted }}>{FULL}</span>
            ) : (
              actionButton(option, kind, open, kind === "take" && i === coralIndex)
            );
          if (twoLine) {
            return (
              <div key={option.id} style={{ minHeight: 56, boxSizing: "border-box", padding: "6px 0", borderTop: ROW_LINE, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, lineHeight: "16px", overflow: "hidden", textOverflow: "ellipsis" }}>{option.label}</span>
                  <div style={CHIP_LINE}>{chips(option, open, kind === "take")}</div>
                </div>
                {right}
              </div>
            );
          }
          return (
            <div key={option.id} style={{ height: kind === "full" ? 36 : 44, boxSizing: "border-box", borderTop: ROW_LINE, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <span style={{ width: 62, flexShrink: 0, fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{option.label}</span>
              <span style={{ ...CHIP_LINE, flex: "1 1 auto", minWidth: 0 }}>{chips(option, open, kind === "take")}</span>
              {right}
            </div>
          );
        })}
      </div>
      <div style={{ boxSizing: "border-box", paddingTop: 8, borderTop: ROW_LINE, display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, lineHeight: "16px", color: t.muted }}>
        {progress.kind === "segments" ? (
          <span aria-hidden style={{ width: 84, flexShrink: 0, display: "grid", gridTemplateColumns: `repeat(${Math.max(progress.segments, 1)}, minmax(0, 1fr))`, gap: 3 }}>
            {Array.from({ length: progress.segments }, (_, n) => (
              <span key={n} style={{ height: 5, borderRadius: 999, background: n < progress.filled ? t.secondary : emptySegment, display: "block" }} />
            ))}
          </span>
        ) : (
          <span aria-hidden style={{ width: 84, height: 5, flexShrink: 0, borderRadius: 999, background: emptySegment, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.round(progress.fraction * 100)}%`, borderRadius: 999, background: t.secondary }} />
          </span>
        )}
        <span>{filledLine(taken, total, closed)}</span>
      </div>
    </div>
  );
}
