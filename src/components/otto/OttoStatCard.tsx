"use client";

import "./kit/sky.css";
import "./kit/desk.css";
import "./kit/more.css";

import type { ReactNode } from "react";

/**
 * One number on Otto's Stats tab (Nov 10, 2026, the Otto build's Wave 2A;
 * board D4 "dk-stat"): the number, what it is, its range, then one plain
 * line saying what it counts. Paper, ink, no coral, no arrows, no streaks.
 * OttoMetrics.tsx lays two of these out.
 */

/** A whole count the way the card prints it: exact, with thousands commas. */
export function exact(n: number): string {
  return n.toLocaleString("en-US");
}

export function OttoStatCard({
  num,
  what,
  sub,
  counts,
  label,
  icon,
  children,
}: {
  num: number;
  /** The words after the number, lower case ("views on your posts"). */
  what: string;
  /** The range line ("Last 30 days · across 4 posts"). */
  sub: string;
  /** What the number counts, after a bold "Counts". Sentence case after it. */
  counts: ReactNode;
  /** The card's name for screen readers. */
  label: string;
  /** A small mark before the range line (the shared eye, never an emoji). */
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="tx-host dk-card dk-stat" aria-label={label}>
      <i className="tx tx-paper" aria-hidden="true" />
      <div className="dk-stat-top">
        <span className="dk-stat-num">{exact(num)}</span>
        <span className="dk-stat-what">
          {what}
          <i>
            {icon}
            {sub}
          </i>
        </span>
      </div>
      {children}
      <p className="dk-stat-counts">
        <b>Counts</b> {counts}
      </p>
    </section>
  );
}

/** A card that couldn't count: a calm edge, what happened, Retry. Never a 0. */
export function OttoStatFail({ line, onRetry, busy }: { line: string; onRetry: () => void; busy: boolean }) {
  return (
    <div className="tx-host dk-card dk-fail" role="status">
      <i className="tx tx-paper" aria-hidden="true" />
      <span className="dk-fail-tag">Couldn&rsquo;t count</span>
      <p>{line}</p>
      <div className="dk-fail-go">
        <button type="button" className="dk-btn" onClick={onRetry} disabled={busy}>
          {busy ? "Trying…" : "Try again"}
        </button>
      </div>
    </div>
  );
}

/** While a card loads: Otto's lowercase line on plain paper, no fake zeros. */
export function OttoStatLoading() {
  return (
    <div className="tx-host dk-card" aria-busy="true">
      <i className="tx tx-paper" aria-hidden="true" />
      <p className="dk-stat-load dk-voice">counting&hellip;</p>
    </div>
  );
}

/** Three small windows under a number (Today / 7 days / All time). */
export function OttoStatWindows({ items }: { items: Array<{ label: string; n: number }> }) {
  return (
    <ul className="dk-stat-wins">
      {items.map((w) => (
        <li key={w.label}>
          <b>{exact(w.n)}</b>
          {w.label}
        </li>
      ))}
    </ul>
  );
}
