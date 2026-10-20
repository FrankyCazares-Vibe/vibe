"use client";

import { useState } from "react";

import {
  friendRepostLine,
  friendRepostOthers,
  friendRepostText,
  repostFirstName,
  type RepostLinePerson,
} from "@/lib/feed/friend-repost-label";

import { RepostersPopover } from "./RepostersPopover";
import { RepostersSheet } from "./RepostersSheet";

/**
 * The quiet repost line above a post's author (Oct 19, 2026, critique M2,
 * decision 2a): up to 3 tiny overlapping faces of people you follow, then
 * "Maya and 6 others reposted" in small grey words, with green kept only for
 * the little repost arrows. It replaces the filled green pill on the phone
 * card (CampusMobile) and the desktop row (campus-home), the same on both.
 *
 * Only as wide as its words (`alignSelf: flex-start`), and never under the
 * card's ⋯: the desktop ⋯ floats over the card's top-right corner, so the
 * line stops 44px short of the edge.
 *
 * Tap it for "Reposted by" (batch B2): the bottom sheet on the phone, the
 * small pop-up on desktop. Both read the list themselves when they open; the
 * line passes only the post id. The pop-up's anchor is kept as state, set
 * from the click (B2's contract), and a second click on the line closes it.
 *
 * Names: only the people the feed already names (people you follow). Faces
 * show their photo, or their first initial when there's none (the old pill
 * drew a blank peach disc). Nothing new about anyone is shown.
 *
 * Review r3 (Oct 19, 2026):
 * - A long name is what gets the "…", never "and 6 others reposted": the
 *   names shrink, the tail doesn't, so the line is always a whole sentence.
 * - "others" prints like the card's buttons ("1.2K", compactCount).
 * - On the phone the tap area is 44px tall (it was 24px), with negative
 *   margins so the line and the author row don't move.
 */

export type RepostLineFace = RepostLinePerson & { id: string; avatar_url?: string | null };

export function FriendRepostLine({
  postId,
  reposters,
  repostCount,
  viewerReposted,
  variant,
  onPress,
}: {
  postId: string;
  /** `friend_reposters` from /api/feed: people the viewer follows, newest first. */
  reposters: readonly RepostLineFace[] | null | undefined;
  /** The post's live repost count (the shared engagement record). */
  repostCount: number;
  /** Whether the viewer reposted it (the shared record): never one of the "others". */
  viewerReposted: boolean;
  variant: "phone" | "desktop";
  /** Runs first on a tap: the phone card drops its own pending tap-to-open. */
  onPress?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const line = friendRepostLine({ reposters, repostCount, viewerReposted });
  if (!line || !reposters) return null;
  const faces = reposters.slice(0, 3);
  const words = friendRepostText(line);
  const phone = variant === "phone";

  return (
    <>
      <button
        type="button"
        className="vibe-press"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${words}. See who reposted`}
        onClick={(e) => {
          // The phone card is itself a tap-to-open box: this tap is the line's.
          e.stopPropagation();
          onPress?.();
          if (variant === "desktop") setAnchor(e.currentTarget);
          setOpen((o) => !o);
        }}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          maxWidth: phone ? "100%" : "calc(100% - 44px)",
          // Phone: a 44px thumb target; -10px above and -2px below give back
          // the 20px of extra padding, so it sits where the 24px line did.
          minHeight: phone ? 44 : 24,
          margin: phone ? "-10px 0 -2px 0" : "0 0 8px 0",
          padding: phone ? "10px 0" : "2px 0",
          boxSizing: "border-box",
          border: "none",
          background: "none",
          color: "var(--ink-muted)",
          fontFamily: "DM Sans, sans-serif",
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.3,
          textAlign: "left",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <RepostArrows />
        <span aria-hidden style={{ display: "inline-flex", flexShrink: 0 }}>
          {faces.map((p, i) => (
            <Face key={p.id} person={p} first={i === 0} />
          ))}
        </span>
        <span aria-hidden style={{ display: "flex", minWidth: 0, whiteSpace: "pre" }}>
          {/* The names take the "…"; the tail always shows. */}
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {line.names.map((n, i) => (
              <span key={i}>
                {i > 0 ? " and " : null}
                <span style={{ color: "var(--ink-2)", fontWeight: 700 }}>{n}</span>
              </span>
            ))}
          </span>
          <span style={{ flexShrink: 0 }}>{`${friendRepostOthers(line)} reposted`}</span>
        </span>
      </button>
      {variant === "phone" ? (
        <RepostersSheet postId={postId} open={open} onClose={() => setOpen(false)} />
      ) : (
        <RepostersPopover postId={postId} open={open} onClose={() => setOpen(false)} anchor={anchor} />
      )}
    </>
  );
}

/** One 16px face: the photo, or an initial on a solid neutral disc (no see-through overlap). */
function Face({ person, first }: { person: RepostLineFace; first: boolean }) {
  const initial = initialOf(person);
  return (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: 999,
        marginLeft: first ? 0 : -5,
        boxSizing: "border-box",
        border: "1.5px solid var(--cream)",
        background: person.avatar_url
          ? `url(${person.avatar_url}) center/cover, var(--cream)`
          : "linear-gradient(rgba(var(--scrim-rgb),0.14), rgba(var(--scrim-rgb),0.14)), var(--cream)",
        color: "var(--ink-2)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 8,
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: 0,
        flexShrink: 0,
      }}
    >
      {person.avatar_url ? null : initial}
    </span>
  );
}

/** One letter: two initials at this size were a smudge ("MO" read as "MC"). */
function initialOf(p: RepostLinePerson): string {
  // "Maya Okafor" → "M"; no name, "@maya" → "M"; neither → "S" (Someone).
  return repostFirstName(p).replace(/^@/, "").slice(0, 1).toUpperCase();
}

/** The phone card's own two-arrow drawing, in the repost green. */
function RepostArrows() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 22 22"
      fill="none"
      stroke="var(--ok-ink)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <path d="M4 9V7a2 2 0 0 1 2-2h10l-2.5-2.5" />
      <path d="M18 13v2a2 2 0 0 1-2 2H6l2.5 2.5" />
    </svg>
  );
}
