"use client";

import { useId } from "react";

import type { FollowedBoard } from "@/lib/chat/types";
import { rowTime } from "@/lib/chat/when";
import { ORG_COPY } from "@/lib/orgs/join-copy";

import { clubGradient } from "../avatar";
import { boardHasNew, followedBoardLabel } from "../club/helpers";
import { initialsOf } from "../format";
import { useNightTheme } from "../theme";
import { FONT, palette, SERIF } from "../v2-tokens";
import { markBoardSeen, useBoardSeen } from "./board-seen";
import { ROW_FRAME, ROW_PICTURE, ROW_TEXT } from "./PersonRow";

/**
 * "Boards you follow" on the Messages home (club model, Franky's calls of
 * Oct 16): the clubs I follow but am not in, whose Announcement Board the
 * database lets me read (`GET /api/me/club-boards`, read with the inbox by
 * `useHomeData`). Only members type, so these are not chats: a follower has
 * no mute and no pin (no `channel_members` row), and a row says only the
 * club, its newest post and its time. Never an author: the Board speaks for
 * the club (`latest.author_name` is always ""). A post newer than the last
 * one this browser showed gets the coral dot (`board-seen.ts`, wave-2
 * repair, finding 12): the server keeps no read mark for a follower.
 *
 * A tap opens the club space on the Board (`onOpen`), which reads it as a
 * follower's (`FollowerBoard`, the members-only tile). The phone home and
 * the desktop wide list both draw this under the clubs, in the All and
 * Clubs filters; nothing is drawn while the list is empty or unread.
 */
export function FollowedBoards({ boards, now, onOpen }: { boards: FollowedBoard[]; now: Date; onOpen: (board: FollowedBoard) => void }) {
  const night = useNightTheme();
  const t = palette(night);
  const headingId = useId();
  const seen = useBoardSeen();
  if (boards.length === 0) return null;
  return (
    <section aria-labelledby={headingId} style={{ flexShrink: 0, fontFamily: FONT }}>
      <h2 id={headingId} style={{ margin: 0, padding: "16px 16px 4px", fontSize: 12.5, fontWeight: 700, lineHeight: "16px", color: t.muted }}>
        {ORG_COPY.board.followedHeading}
      </h2>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column" }}>
        {boards.map((board) => (
          <FollowedBoardRow key={board.room_id} board={board} now={now} isNew={boardHasNew(board.latest?.created_at, seen[board.room_id])} onOpen={() => onOpen(board)} />
        ))}
      </ul>
    </section>
  );
}

/**
 * One Board I follow: the club's 48px mark, its name and the time, the
 * megaphone and the newest post (`ClubRow`'s shape). Oct 19, 2026 (critique
 * D4): it uses the list's shared `ROW_FRAME` / `ROW_TEXT`, so it is 66px at
 * least and lines up with the club and people rows above it.
 */
export function FollowedBoardRow({ board, now, isNew, onOpen }: { board: FollowedBoard; now: Date; isNew: boolean; onOpen: () => void }) {
  const night = useNightTheme();
  const t = palette(night);
  const org = board.org;
  const latest = board.latest;
  return (
    <li style={{ listStyle: "none" }}>
      <button
        type="button"
        onClick={() => {
          markBoardSeen(board.room_id, latest?.created_at);
          onOpen();
        }}
        aria-label={followedBoardLabel(board, now, isNew)}
        style={{ ...ROW_FRAME, color: t.ink, fontFamily: FONT }}
      >
        <span
          aria-hidden="true"
          style={{ width: ROW_PICTURE, height: ROW_PICTURE, flexShrink: 0, borderRadius: 999, background: org.logo_url ? `url(${org.logo_url}) center/cover` : clubGradient(org.id), boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, fontWeight: 800, fontSize: 18, color: "#FAF7F2" }}
        >
          {org.logo_url ? null : initialsOf(org.name)}
        </span>
        <span style={{ ...ROW_TEXT, borderBottom: `1px solid ${t.hairline}`, gap: 3 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ minWidth: 0, fontFamily: SERIF, fontWeight: 800, fontSize: 16.5, lineHeight: 1.25, letterSpacing: "-0.3px", color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{org.name}</span>
            <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 12, fontWeight: isNew ? 700 : 600, color: isNew ? t.ink : t.muted }}>{latest ? rowTime(latest.created_at, now) : ""}</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, fontSize: 13.5, lineHeight: 1.35, fontWeight: isNew ? 600 : 400, color: isNew ? t.ink : t.secondary }}>
            <Megaphone color={t.muted} />
            <span style={{ minWidth: 0, flexGrow: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {latest?.text.trim() ? latest.text : <span style={{ color: t.muted }}>{ORG_COPY.board.followedEmpty}</span>}
            </span>
            {isNew ? <span aria-hidden="true" style={{ width: 9, height: 9, flexShrink: 0, borderRadius: 999, background: "var(--coral)" }} /> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The Board's mark (the room chip's megaphone), 13px, before the preview. */
function Megaphone({ color }: { color: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1z" />
      <path d="M16 9a4.5 4.5 0 0 1 0 6" />
      <path d="M18.5 6.5a8 8 0 0 1 0 11" />
    </svg>
  );
}
