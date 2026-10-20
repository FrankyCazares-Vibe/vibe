/**
 * How the Otto stats page writes a count (Oct 19, 2026, critique batch B9).
 *
 * WHY A SEPARATE FILE. The page printed "1 comments" and "1 saves": every
 * noun was hard-coded plural. The wording lives here, with no imports and no
 * JSX, so `node --test` can check it (metrics-count.test.ts) without a
 * bundler. OttoMetrics.tsx is the only caller.
 */

/**
 * The short form a tile or a count cell shows: 999, 1.2k, 12k, 1M, 1.5M.
 *
 * Oct 19, 2026: from 999,500 the "k" form rounded up to "1000k", 5
 * characters, which ran into the next column's icon. It switches to
 * millions there instead, so every short form stays at 4 characters or
 * fewer up to 999 million.
 */
export function fmtCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  if (n < 999_500) return Math.round(n / 1000) + "k";
  if (n < 9_950_000) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  return Math.round(n / 1e6) + "M";
}

/**
 * The noun for `n` things: singular for exactly one, plural otherwise
 * (0 comments, 1 comment, 2 comments). English only, which is all Vibe ships.
 * `pluralForm` defaults to the singular plus "s".
 */
export function pluralNoun(n: number, singular: string, pluralForm?: string): string {
  return n === 1 ? singular : (pluralForm ?? singular + "s");
}

/** What a sighted reader sees: "1 comment", "12 likes", "1.2k views". */
export function countWithNoun(n: number, singular: string, pluralForm?: string): string {
  return `${fmtCount(n)} ${pluralNoun(n, singular, pluralForm)}`;
}

/**
 * What a screen reader hears: the exact number, never the "1.2k" short form,
 * because the short form is a visual space saver and reads as "1.2 k".
 */
export function spokenCount(n: number, singular: string, pluralForm?: string): string {
  return `${n.toLocaleString("en-US")} ${pluralNoun(n, singular, pluralForm)}`;
}
