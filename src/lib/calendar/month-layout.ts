/**
 * My Calendar's month layout (Oct 19, 2026, critique B8 repair). Pure, so
 * the numbers are tested without a browser. No `@/` imports: node's test
 * runner loads it bare.
 *
 * Why: the first even grid drew six fixed 96px rows every month, plus the
 * key. On a 1366x768 or 1280x720 laptop that was taller than the modal, so
 * the last row was cut and the colour key sat below the fold. Now the month
 * draws only the rows it needs (most months fit in five), the rows share the
 * height the modal has (never under 64px), and each day shows as many chips
 * as its row can hold, up to two, before "+N more".
 */

/** The fewest rows of seven that hold this month (Sunday first): 4, 5 or 6. */
export function monthRowCount(year: number, month: number): number {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Math.ceil((firstDay + daysInMonth) / 7);
}

/** The shortest a day may get; below this the month scrolls instead. */
export const CAL_MIN_DAY_HEIGHT = 64;
/** At most this many chips a day, then "+N more" (the plan's rule). */
export const CAL_MAX_CHIPS = 2;

// A day's own parts, in px (CalModalDay in LeftNav.tsx): 1px border and 6px
// padding top and bottom, the 24px day number, then each 18px chip and the
// 12px "+N more" line, each after a 2px gap.
const DAY_FRAME = 2 + 12 + 24;
const CHIP_STEP = 18 + 2;
const MORE_STEP = 12 + 2;

/**
 * How many of a day's `count` entries get a chip in a row `rowHeight` px
 * tall: the most (up to CAL_MAX_CHIPS) that fit along with the "+N more"
 * line when some are left over. A height that isn't known yet gives the
 * full two.
 */
export function chipsThatFit(rowHeight: number | null, count: number): number {
  const most = Math.min(Math.max(0, Math.floor(count)), CAL_MAX_CHIPS);
  if (rowHeight === null || !Number.isFinite(rowHeight)) return most;
  for (let n = most; n > 0; n--) {
    const need = DAY_FRAME + n * CHIP_STEP + (count > n ? MORE_STEP : 0);
    if (need <= rowHeight) return n;
  }
  return 0;
}

/** One row's height when `rows` rows and their 6px gaps share `gridHeight`. */
export function rowHeightFor(gridHeight: number, rows: number, gap = 6): number {
  if (rows <= 0) return 0;
  return Math.max(CAL_MIN_DAY_HEIGHT, (gridHeight - (rows - 1) * gap) / rows);
}
