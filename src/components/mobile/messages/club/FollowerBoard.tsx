"use client";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import { useEffect } from "react";

import type { ChatMessage, OrgRef, PollCard } from "@/lib/chat/types";
import type { RoomPoll } from "@/lib/chat/use-room-poll";
import { eventWhen, rowTime, rowTimeSpoken } from "@/lib/chat/when";
import { ORG_COPY } from "@/lib/orgs/join-copy";

import { clubGradient } from "../avatar";
import { cardWord, deviceZone, EVENT_CANCELLED_LINE, eventPlaceLine, fallbackEventTitle, filledLine, goingWord, pollBarWidth, signupCounts } from "../cards/card-rules";
import { initialsOf } from "../format";
import { markBoardSeen } from "../home/board-seen";
import { FONT, palette, SERIF } from "../v2-tokens";
import { countWord, followerBoardIntro, followerPostLabel, isEmptyRoom, reactionCountLabel } from "./helpers";

/**
 * The Board as a FOLLOWER reads it (club model, Franky's calls of Oct 16):
 * only members type, react or vote; a follower the database lets in reads
 * the club's officers' posts and nothing else. Phone (`ClubSpace`) and
 * desktop (`ClubPane`) both draw this in `BoardView`'s place.
 *
 * What the follower's page holds (message-read.ts `readFollowerPage`): live
 * top-level posts by the club's current owners and admins, each shown as
 * the CLUB's (`users` null, `user_id` "", `author_role` null), no reply
 * counts, cards with counts only (`voters: []`), reactions as counts. So
 * every post here is bylined with the club's mark and name, never a
 * person's; there is no replies fold (a follower never reads the replies:
 * `?root=` answers 403), no long press, no hover toolbar, no vote, no
 * sign-up, no RSVP, no reaction to add, no Report or Remove menu. A poll
 * shows its bars and counts, a sign-up its filled spots, an event card its
 * time, place and going count (`ReadOnlyCard` below).
 *
 * Reads through the room's polling hook on the Board's id, newest first
 * like `BoardView`; `Earlier messages` under the last post. States: the
 * skeleton, `Nothing on the Board yet.`, `LoadFailed` with Retry.
 */
export type FollowerBoardProps = {
  poll: RoomPoll;
  /** The club from the space read; the thread read's `room.org` stands in until it answers. */
  club: OrgRef | null;
  night: boolean;
  now: Date;
};

const SKELETON_DISC = "rgba(var(--scrim-rgb),0.06)";
const SKELETON_BAR = "rgba(var(--scrim-rgb),0.08)";
const SKELETON_BAR_SOFT = "rgba(var(--scrim-rgb),0.05)";

export function FollowerBoard({ poll, club, night, now }: FollowerBoardProps) {
  const t = palette(night);
  const { messages, room, failure } = poll;
  const org = club ?? room?.org ?? null;
  // The newest post on screen is "seen": the Messages list drops its dot.
  const newestAt = messages && messages.length > 0 ? messages[messages.length - 1].created_at : null;
  useEffect(() => {
    if (room?.id && newestAt) markBoardSeen(room.id, newestAt);
  }, [room?.id, newestAt]);

  if (failure) {
    return (
      <div style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: "16px 12px" }}>
        <LoadFailed failure={failure} onRetry={() => void poll.reload()} tone={night ? "dark" : "light"} />
      </div>
    );
  }
  if (messages === null) {
    return (
      <div aria-hidden="true" style={{ flexGrow: 1, minHeight: 0, boxSizing: "border-box", padding: "8px 12px 0", display: "flex", flexDirection: "column", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ boxSizing: "border-box", padding: "10px 12px", borderRadius: 16, border: `1px solid ${t.hairline}`, background: t.surface, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: 999, background: SKELETON_DISC }} />
              <span style={{ width: 90, height: 12, borderRadius: 6, background: SKELETON_BAR }} />
            </div>
            <span style={{ width: ["85%", "60%", "72%"][i], height: 14, borderRadius: 6, background: SKELETON_BAR_SOFT }} />
          </div>
        ))}
      </div>
    );
  }

  // A follower never wrote here, so no row of theirs is ever removed; a stub or a removed row is simply not drawn.
  const posts = messages.filter((m) => !m.hidden && m.removed === null).slice().reverse();
  const empty = isEmptyRoom(messages) || posts.length === 0;
  const name = org?.name ?? "";

  return (
    <section
      aria-label="Board posts, newest first"
      style={{ flexGrow: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", boxSizing: "border-box", padding: "8px 12px 8px", display: "flex", flexDirection: "column", gap: 8, fontFamily: FONT }}
    >
      <p style={{ flexShrink: 0, margin: 0, padding: "2px 4px 0", color: t.muted, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{followerBoardIntro(name)}</p>
      {empty ? (
        <div style={{ padding: "48px 18px", textAlign: "center", color: t.secondary, fontSize: 13.5, lineHeight: 1.5 }}>{ORG_COPY.board.empty}</div>
      ) : (
        posts.map((post) => <FollowerPost key={post.id} post={post} org={org} night={night} now={now} />)
      )}
      {poll.hasEarlier ? (
        <button
          type="button"
          onClick={() => void poll.loadEarlier()}
          style={{ alignSelf: "center", flexShrink: 0, height: 44, padding: "0 16px", border: "none", background: "transparent", color: t.secondary, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
        >
          Earlier messages
        </button>
      ) : null}
    </section>
  );
}

/** The club's 28px mark: its logo, or its initials on `clubGradient` (the header's mark, smaller). */
export function ClubMark({ org, size }: { org: OrgRef | null; size: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, borderRadius: 999, background: org?.logo_url ? `url(${org.logo_url}) center/cover` : clubGradient(org?.id ?? ""), boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, fontWeight: 800, fontSize: Math.round(size * 0.36), color: "#FAF7F2" }}
    >
      {org?.logo_url ? null : initialsOf(org?.name ?? "")}
    </span>
  );
}

/** One post: the club's byline and the time, the text or the card (read only), the reaction counts. */
function FollowerPost({ post, org, night, now }: { post: ChatMessage; org: OrgRef | null; night: boolean; now: Date }) {
  const t = palette(night);
  const name = org?.name ?? "";
  return (
    <article
      aria-label={followerPostLabel(name, rowTimeSpoken(post.created_at, now))}
      style={{ flexShrink: 0, boxSizing: "border-box", padding: "10px 12px 12px", borderRadius: 16, border: `1px solid ${t.hairline}`, background: t.surface, boxShadow: night ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "0 1px 2px rgba(20,20,22,0.04)", color: t.ink, fontFamily: FONT, minWidth: 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", minWidth: 0 }}>
        <ClubMark org={org} size={28} />
        <span style={{ minWidth: 0, fontSize: 13.5, fontWeight: 700, lineHeight: "18px", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
        <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 12, fontWeight: 600, lineHeight: "18px", color: t.muted }}>{rowTime(post.created_at, now)}</span>
      </div>
      {post.kind === "text" ? (
        <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 500, lineHeight: 1.35, textWrap: "pretty", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{post.content}</p>
      ) : (
        <div style={{ marginTop: 8 }}>
          <ReadOnlyCard message={post} night={night} />
        </div>
      )}
      {post.reactions.length > 0 ? <ReactionCounts reactions={post.reactions} night={night} /> : null}
    </article>
  );
}

/**
 * A card post, read only: what the card says and its counts, never a
 * control and never a person. A poll: the question, each option's bar and
 * count, `N voted` (`Closed · N voted`). A sign-up: the title, each slot's
 * `taken of capacity`, `K of M filled`. An event: the title, `<place> ·
 * <when>`, `N going` (no RSVP, no event chat: a follower never enters one).
 * A card the read could not build (`card` null) shows the stored text.
 */
export function ReadOnlyCard({ message, night }: { message: ChatMessage; night: boolean }) {
  const t = palette(night);
  const card = message.card;
  const box: React.CSSProperties = { boxSizing: "border-box", padding: "10px 12px", borderRadius: 14, border: `1px solid ${t.hairline}`, background: "rgba(var(--scrim-rgb),0.02)", minWidth: 0 };
  const word = <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: "15px", color: t.muted }}>{cardWord(message)}</div>;
  const foot = (text: string) => <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, lineHeight: "16px", color: t.muted }}>{text}</div>;
  if (!card) {
    return (
      <div style={box}>
        {word}
        <p style={{ margin: "4px 0 0", fontSize: 14.5, lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.content}</p>
      </div>
    );
  }
  if (card.type === "event") {
    const event = card.event;
    const title = event ? event.title : fallbackEventTitle(message.content);
    return (
      <div style={box}>
        {word}
        <h3 style={{ margin: "4px 0 0", fontFamily: SERIF, fontWeight: 700, fontSize: 18, lineHeight: 1.15, letterSpacing: -0.3, overflowWrap: "anywhere" }}>{title}</h3>
        <div style={{ marginTop: 3, fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: t.secondary, overflowWrap: "anywhere" }}>
          {event ? eventPlaceLine(event.location, eventWhen(event.starts_at, deviceZone())) : EVENT_CANCELLED_LINE}
        </div>
        {event ? foot(goingWord(event.going_count)) : null}
        {card.note ? <p style={{ margin: "6px 0 0", fontSize: 13.5, lineHeight: 1.35, color: t.secondary, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{card.note}</p> : null}
      </div>
    );
  }
  return (
    <div style={box}>
      {word}
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, lineHeight: 1.3, overflowWrap: "anywhere" }}>{card.question}</div>
      <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {card.options.map((option) => (
          <OptionRow key={option.id} card={card} label={option.label} count={option.count} capacity={option.capacity} night={night} />
        ))}
      </ul>
      {foot(card.type === "signup" ? signupLine(card) : `${card.closed ? "Closed · " : ""}${card.total_voters} voted`)}
    </div>
  );
}

function signupLine(card: PollCard): string {
  const { taken, total } = signupCounts(card.options);
  return filledLine(taken, total, card.closed);
}

/** One option: the bar (a poll's share of the voters, a slot's share of its spots) behind the label and the count. */
function OptionRow({ card, label, count, capacity, night }: { card: PollCard; label: string; count: number; capacity: number | null; night: boolean }) {
  const t = palette(night);
  const signup = card.type === "signup";
  const width = signup ? pollBarWidth(count, Math.max(capacity ?? 0, 1)) : pollBarWidth(count, card.total_voters);
  const counted = signup && capacity !== null ? `${count} of ${capacity}` : String(count);
  const spoken = signup && capacity !== null ? `${label}, ${count} of ${capacity} spots taken` : `${label}, ${countWord(count, "vote")}`;
  return (
    <li aria-label={spoken} style={{ position: "relative", height: 36, boxSizing: "border-box", padding: "0 10px", borderRadius: 12, overflow: "hidden", border: `1px solid ${t.unpickedOption.border}`, background: t.unpickedOption.bg, display: "flex", alignItems: "center", gap: 8 }}>
      <span aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${width}%`, background: t.unpickedOption.bar }} />
      <span aria-hidden="true" style={{ position: "relative", minWidth: 0, flexGrow: 1, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span aria-hidden="true" style={{ position: "relative", flexShrink: 0, fontSize: 13, fontWeight: 800, color: t.secondary }}>{counted}</span>
    </li>
  );
}

/** The reactions under a post, as counts: plain marks, never a button (only members react). */
export function ReactionCounts({ reactions, night }: { reactions: ChatMessage["reactions"]; night: boolean }) {
  const t = palette(night);
  return (
    <ul aria-label="Reactions" style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
      {reactions.map((r) => (
        <li
          key={r.emoji}
          aria-label={reactionCountLabel(r.emoji, r.count)}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 24, boxSizing: "border-box", padding: "0 8px", borderRadius: 999, border: `1px solid ${t.hairline}`, background: "rgba(var(--scrim-rgb),0.04)", color: t.secondary, fontSize: 12, fontWeight: 700 }}
        >
          <span aria-hidden="true" style={{ fontSize: 13 }}>{r.emoji}</span>
          <span aria-hidden="true">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}
