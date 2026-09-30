"use client";

import { useState } from "react";

import type { Card, PollCard, PollCardOption } from "@/lib/chat/types";

import { toastSendFailure } from "../send-failure";
import { palette } from "../v2-tokens";
import { announceVotes, optionAriaLabel, pollBarWidth, pollCardLabel, pollFooter, YOUR_PICK } from "./card-rules";
import { castVote, CoralDisc, Eye, EyeOff, PersonDisc, Ring, VoteSpinner } from "./card-parts";

/**
 * A poll inside `CardBubble` (wave-2 contract 11.8, 1.2 "Cards"; mockup
 * W0_Cards 7.1, 7.2): the question, the options as a radio group
 * (checkboxes when `multi`), each a 44px hit area around the 36px row with
 * the result bar (`count / max(total_voters, 1)`), the mark, `Your pick`,
 * up to two 20px voter avatars (none when anonymous) and the count; the
 * footer `<N> voted · names shown | anonymous`, or `Closed · <N> voted`.
 *
 * A tap → `PUT …/vote { option_id, on: !mine }`, with NO optimistic change:
 * the tapped option shows the spinner in the mark's place until the
 * answer's `card` replaces this one through `onCard`. Refusals per 1.3:
 * the toast; `poll_closed` also marks the card closed locally — through
 * `onCard(messageId, { ...card, closed: true })`, the same path a vote's
 * answer takes, so the footer, the label, the taps and the bubble's 70 %
 * all read `card.closed` (S3-CONTRACT-2); `not_found` →
 * `onRefresh(created_at)`. A closed card takes no taps.
 */
export type PollCardViewProps = {
  card: PollCard;
  roomId: string;
  messageId: string;
  createdAt: string;
  /** The author's name for the card's label; null when `users` is null (`someone`). */
  author: string | null;
  isMine: boolean;
  night: boolean;
  /** The `<Name> · Poll` line, drawn by the bubble. */
  header: React.ReactNode;
  onCard: (id: string, card: Card) => void;
  onRefresh: (createdAt: string) => void;
  /** The bubble's one polite live region. */
  onAnnounce: (text: string) => void;
};

export function PollCardView({ card, roomId, messageId, createdAt, author, isMine, night, header, onCard, onRefresh, onAnnounce }: PollCardViewProps) {
  const t = palette(night);
  const [busy, setBusy] = useState<string | null>(null);
  const closed = card.closed;

  const vote = async (option: PollCardOption) => {
    if (closed || busy !== null) return;
    setBusy(option.id);
    const r = await castVote(roomId, messageId, option.id, !option.mine);
    setBusy(null);
    if (r.ok) {
      const next = r.data?.card;
      if (next && next.type === "poll") {
        onCard(messageId, next);
        onAnnounce(announceVotes(next.total_voters));
      } else {
        onRefresh(createdAt);
      }
      return;
    }
    toastSendFailure(r);
    if (r.code === "poll_closed") onCard(messageId, { ...card, closed: true });
    else if (r.code === "not_found") onRefresh(createdAt);
  };

  return (
    <div role="group" aria-label={pollCardLabel(card, author, isMine)}>
      {header}
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, lineHeight: 1.3, overflowWrap: "anywhere" }}>{card.question}</div>
      <div role={card.multi ? "group" : "radiogroup"} aria-label={card.question} style={{ marginTop: 2, display: "flex", flexDirection: "column" }}>
        {card.options.map((option) => {
          const chrome = option.mine ? t.pickedOption : t.unpickedOption;
          const width = pollBarWidth(option.count, card.total_voters);
          const spinning = busy === option.id;
          const blocked = closed || busy !== null;
          const voters = card.anonymous ? [] : option.voters.slice(0, 2);
          return (
            <button
              key={option.id}
              type="button"
              role={card.multi ? "checkbox" : "radio"}
              aria-checked={option.mine}
              aria-label={optionAriaLabel(option, card.anonymous)}
              aria-disabled={blocked || undefined}
              onClick={() => void vote(option)}
              style={{
                width: "100%",
                height: 44,
                boxSizing: "border-box",
                padding: "4px 0",
                border: "none",
                background: "transparent",
                color: t.ink,
                fontFamily: "inherit",
                textAlign: "left",
                cursor: blocked ? "default" : "pointer",
                display: "block",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              <span style={{ position: "relative", height: 36, boxSizing: "border-box", padding: "0 10px", borderRadius: 12, overflow: "hidden", border: `1px solid ${chrome.border}`, background: chrome.bg, display: "flex", alignItems: "center", gap: 7 }}>
                <span aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${width}%`, background: chrome.bar }} />
                {spinning ? <VoteSpinner color={t.coralText} /> : option.mine ? <CoralDisc /> : <Ring color={t.ringGrey} />}
                <span style={{ position: "relative", minWidth: 0, flexShrink: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", overflow: "hidden" }}>
                  <span style={{ maxWidth: "100%", fontSize: 14, fontWeight: 700, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{option.label}</span>
                  {option.mine ? <span style={{ fontSize: 10.5, fontWeight: 700, lineHeight: "12px", color: t.coralMark, whiteSpace: "nowrap" }}>{YOUR_PICK}</span> : null}
                </span>
                {voters.length > 0 ? (
                  <span aria-hidden style={{ position: "relative", marginLeft: "auto", flexShrink: 0, display: "flex", gap: 3 }}>
                    {voters.map((v) => (
                      <PersonDisc key={v.id} person={v} size={20} fontSize={8} />
                    ))}
                  </span>
                ) : null}
                <span style={{ position: "relative", marginLeft: voters.length > 0 ? 0 : "auto", flexShrink: 0, minWidth: 10, textAlign: "right", fontSize: 13, fontWeight: 800, color: option.mine ? t.coralMark : t.secondary }}>{option.count}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, lineHeight: "16px", color: t.muted }}>
        {card.anonymous ? <EyeOff color={t.muted} /> : <Eye color={t.muted} />}
        {pollFooter(card)}
      </div>
    </div>
  );
}
