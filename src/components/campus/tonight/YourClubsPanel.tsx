"use client";

/**
 * "Your clubs" on the desktop Feed (C2_Desk's left panel, Oct 19 2026): the
 * newest line on each club's Board, for the clubs I'm in and the ones I
 * follow. Board lines on purpose, not events: events already live in the
 * "today." strip and in Tonight. No author and no unread dot (a follower
 * never sees who posted, and the board draws none). CONTRACT.md §6.1.
 *
 * Two exports: the panel (1400px and up, the left column) and its folded
 * strip of club tiles (1100-1399px, on top of the right column). Which one
 * shows is CSS only (feed-side.css), so both are always mounted.
 */
import Link from "next/link";

import { ClubMark, IconChevron } from "./TonightBits";
// After TonightBits (which brings tonight.css): the layout file wins ties.
import "./feed-side.css";
import { TONIGHT_COPY } from "./tonight-view";
import type { YourClubRow, YourClubsFoldProps, YourClubsPanelProps } from "./types";
import { useBoardNow } from "./use-your-clubs";
import { YOUR_CLUBS_FOLD_MAX, YOUR_CLUBS_MAX, relativeAge, yourClubLabel } from "./your-clubs-view";

/** The Board in Messages (members and followers alike open it this way). */
function boardHref(row: YourClubRow): string {
  return "/messages?channel=" + encodeURIComponent(row.room_id);
}

/** "See all" alone is vague out of context; each name starts with the visible words. */
const SEE_ALL_LABEL = `${TONIGHT_COPY.seeAll} your clubs in Messages`;
const FOLD_LINK_LABEL = `${TONIGHT_COPY.yourClubs}: ${TONIGHT_COPY.seeAll.toLowerCase()} in Messages`;

export function YourClubsPanel({ state, onFindClubs }: YourClubsPanelProps) {
  // Ticks the "3h" ages once a minute on the real clock (never Tonight's
  // dev-faked one); 0 until the page is hydrated.
  const now = useBoardNow();
  // Both reads failed: no panel and no error box beside the feed.
  if (state.status === "error") return null;
  const rows = state.rows.slice(0, YOUR_CLUBS_MAX);
  return (
    <div className="tonight-tray" aria-busy={state.status === "loading" ? true : undefined}>
      <div className="tonight-side-head">
        <div className="tonight-side-headrow">
          <h2 className="tonight-eyebrow">{TONIGHT_COPY.yourClubs}</h2>
          <Link href="/messages" className="tonight-quiet-link vibe-press" aria-label={SEE_ALL_LABEL}>
            {TONIGHT_COPY.seeAll}
          </Link>
        </div>
        <p className="tonight-side-sub">{TONIGHT_COPY.yourClubsSub}</p>
      </div>
      {state.status === "loading" ? (
        <ClubsSkeleton />
      ) : rows.length === 0 ? (
        <p className="tonight-clubs-empty">{TONIGHT_COPY.noClubs}</p>
      ) : (
        <ul className="tonight-club-list">
          {rows.map((row) => (
            <li key={row.org.id}>
              <ClubRow row={row} now={now} />
            </li>
          ))}
        </ul>
      )}
      <div className="tonight-side-foot">
        <button type="button" className="tonight-link tonight-find tonight-focus vibe-press" onClick={onFindClubs}>
          {TONIGHT_COPY.findClubs}
          <IconChevron size={12} />
        </button>
      </div>
    </div>
  );
}

/**
 * Three static rows shaped like the real ones (a mark and two lines), so the
 * panel doesn't jump when the clubs land. Its own, not TonightSkeleton,
 * because that one is announced as "Loading tonight".
 */
function ClubsSkeleton() {
  return (
    <div className="tonight-clubs-loading" role="status" aria-busy="true">
      <span className="tonight-sr-only">Loading your clubs</span>
      {["72%", "58%", "66%"].map((width) => (
        <div key={width} className="tonight-clubs-skel-row" aria-hidden="true">
          <span className="tonight-skel tonight-clubs-skel-mark" />
          <span className="tonight-clubs-skel-lines">
            <span className="tonight-skel" style={{ width, height: 12 }} />
            <span className="tonight-skel" style={{ width: "86%", height: 10 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** One club: its mark, its name and the age of the newest Board post, then that post's words (two lines at most). */
function ClubRow({ row, now }: { row: YourClubRow; now: number }) {
  const age = row.latest && now ? relativeAge(row.latest.created_at, now) : "";
  // A photo-only post has no words: the same line Messages shows for it.
  const line = row.latest?.text.trim() ?? "";
  return (
    <Link
      href={boardHref(row)}
      className="tonight-row tonight-club-row vibe-press"
      aria-label={yourClubLabel(row, now, TONIGHT_COPY.boardEmpty)}
    >
      <ClubMark org={row.org} size={36} radius={10} />
      <span className="tonight-club-text">
        <span className="tonight-club-namerow">
          <span className="tonight-club-name">{row.org.name}</span>
          {age ? <span className="tonight-club-age">{age}</span> : null}
        </span>
        {line ? (
          <span className="tonight-club-line tonight-clamp2">{line}</span>
        ) : (
          <span className="tonight-club-line tonight-club-line--empty">{TONIGHT_COPY.boardEmpty}</span>
        )}
      </span>
    </Link>
  );
}

/**
 * The folded strip (1100-1399px): "Your clubs ›" into Messages and a few
 * club tiles, each opening its Board. Only once the clubs are in and there
 * is at least one: a loading or empty strip would just be a frame.
 */
export function YourClubsFold({ state }: YourClubsFoldProps) {
  const now = useBoardNow();
  if (state.status !== "ready" || state.rows.length === 0) return null;
  const rows = state.rows.slice(0, YOUR_CLUBS_FOLD_MAX);
  return (
    <section className="tonight-fold" aria-label={TONIGHT_COPY.yourClubs}>
      <Link href="/messages" className="tonight-eyebrow tonight-fold-link vibe-press" aria-label={FOLD_LINK_LABEL}>
        {TONIGHT_COPY.yourClubs}
        <IconChevron size={10} />
      </Link>
      <ul className="tonight-fold-tiles">
        {rows.map((row) => (
          <li key={row.org.id}>
            <Link
              href={boardHref(row)}
              className="tonight-fold-tile vibe-press"
              title={row.org.name}
              aria-label={yourClubLabel(row, now, TONIGHT_COPY.boardEmpty)}
            >
              <ClubMark org={row.org} size={32} radius={10} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
