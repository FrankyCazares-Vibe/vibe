/**
 * A count as the feed prints it: "999", "1.2K", "12K", "1.2M" (Oct 19, 2026,
 * critique B1 review r3).
 *
 * WHY ONE HELPER. The desktop row's buttons printed "1.2K" while the repost
 * line above them printed "and 1233 others", and the phone card printed a bare
 * "1234". Now the desktop row's buttons, the phone card's buttons and the
 * repost line ("Maya and 1.2K others reposted", and its spoken label) all
 * print a count the same way. It is the desktop row's old
 * `formatEngagementCount` rule, moved here; the one change is that 999,500
 * and up reads "1M", not "1000K".
 *
 * Pure, no imports. Junk (NaN, negative) reads as "0".
 */
export function compactCount(n: unknown): string {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  if (v < 1000) return String(v);
  if (v < 10_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  // 999,500 and up would round to "1000K": that reads better as "1M".
  if (v < 999_500) return `${Math.round(v / 1000)}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
