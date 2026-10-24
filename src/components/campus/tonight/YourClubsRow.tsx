"use client";

/**
 * "Your clubs" on the phone's Feed (Oct 24 2026, the first-run plan's week-1
 * item, pulled in by Franky before the freeze): the phone's twin of the
 * desktop panel (YourClubsPanel.tsx). Same data (useYourClubs, read by
 * CampusMobile and handed in), same words (TONIGHT_COPY), same rows: each
 * club I'm in or follow, with the newest line on its Board, opening that
 * Board in Messages. A row of tiles that scrolls sideways, so it costs the
 * Feed one short band above the Tonight card.
 *
 * Loading: two still tiles shaped like the real ones (no jump when the clubs
 * land). Empty: the panel's line and "Find clubs on campus", which opens the
 * Orgs tab. Both reads failed: nothing at all, like the desktop panel.
 *
 * First light (src/lib/tour/first-light.ts) holds `.your-clubs-row` with the
 * other "clubs" parts, and the phone tour points at it as its own bubble.
 */
import Link from "next/link";

import { Reveal } from "@/lib/motion/Reveal";

import { ClubMark, IconChevron } from "./TonightBits";
import "./your-clubs-phone.css";
import { TONIGHT_COPY } from "./tonight-view";
import type { YourClubRow, YourClubsPanelProps } from "./types";
import { useBoardNow } from "./use-your-clubs";
import { YOUR_CLUBS_MAX, relativeAge, yourClubLabel } from "./your-clubs-view";

/** The Board in Messages (members and followers alike open it this way). */
function boardHref(row: YourClubRow): string {
  return "/messages?channel=" + encodeURIComponent(row.room_id);
}

/** "See all" alone is vague out of context; its name starts with the visible words. */
const SEE_ALL_LABEL = `${TONIGHT_COPY.seeAll} your clubs in Messages`;

export function YourClubsRow({ state, onFindClubs }: YourClubsPanelProps) {
  const now = useBoardNow();
  if (state.status === "error") return null;
  const rows = state.rows.slice(0, YOUR_CLUBS_MAX);
  const empty = state.status === "ready" && rows.length === 0;
  return (
    <Reveal>
      <section className="your-clubs-row" aria-label={TONIGHT_COPY.yourClubs} aria-busy={state.status === "loading" ? true : undefined}>
        <div className="your-clubs-row-head">
          <h2 className="your-clubs-row-h">{TONIGHT_COPY.yourClubs}</h2>
          {rows.length > 0 ? (
            <Link href="/messages" className="your-clubs-row-all vibe-press" aria-label={SEE_ALL_LABEL}>
              {TONIGHT_COPY.seeAll}
              <IconChevron size={11} />
            </Link>
          ) : null}
        </div>
        {state.status === "loading" ? (
          <div className="your-clubs-row-list" role="status">
            <span className="tonight-sr-only">Loading your clubs</span>
            {[0, 1].map((i) => (
              <div key={i} className="your-clubs-tile your-clubs-tile--skel" aria-hidden="true">
                <span className="tonight-skel your-clubs-tile-skelmark" />
                <span className="your-clubs-tile-text">
                  <span className="tonight-skel" style={{ width: "62%", height: 12 }} />
                  <span className="tonight-skel" style={{ width: "88%", height: 10 }} />
                </span>
              </div>
            ))}
          </div>
        ) : empty ? (
          <div className="your-clubs-row-empty">
            <p className="your-clubs-row-empty-line">{TONIGHT_COPY.noClubs}</p>
            <button type="button" className="your-clubs-row-find tonight-focus vibe-press" onClick={onFindClubs}>
              {TONIGHT_COPY.findClubs}
              <IconChevron size={12} />
            </button>
          </div>
        ) : (
          <ul className="your-clubs-row-list vibe-no-scrollbar">
            {rows.map((row) => (
              <li key={row.org.id} className="your-clubs-row-item">
                <ClubTile row={row} now={now} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </Reveal>
  );
}

/** One club: its mark, its name and the age of the newest Board post, then that post's words (two lines at most). */
function ClubTile({ row, now }: { row: YourClubRow; now: number }) {
  const age = row.latest && now ? relativeAge(row.latest.created_at, now) : "";
  // A photo-only post has no words: the same line Messages shows for it.
  const line = row.latest?.text.trim() ?? "";
  return (
    <Link
      href={boardHref(row)}
      className="your-clubs-tile tonight-focus vibe-press"
      aria-label={yourClubLabel(row, now, TONIGHT_COPY.boardEmpty)}
    >
      <ClubMark org={row.org} size={32} radius={10} />
      <span className="your-clubs-tile-text">
        <span className="your-clubs-tile-namerow">
          <span className="your-clubs-tile-name">{row.org.name}</span>
          {age ? <span className="your-clubs-tile-age">{age}</span> : null}
        </span>
        {line ? (
          <span className="your-clubs-tile-line tonight-clamp2">{line}</span>
        ) : (
          <span className="your-clubs-tile-line your-clubs-tile-line--empty">{TONIGHT_COPY.boardEmpty}</span>
        )}
      </span>
    </Link>
  );
}
