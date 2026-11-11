/**
 * The desk's lists, the pure half (Otto polish, Nov 11, 2026; Franky: "make
 * the lists be dropdowns maybe, or like a time frame option"). Every desk
 * section folds open or closed and shows a few rows with "Show all"; Otto
 * saw and Earlier get a "This week / 30 days / All" picker.
 *
 * - `DESK_RANGES` / `inDeskRange`: the picker's three steps, by a row's
 *   `whenISO` (a row with no date always shows).
 * - `fewOf`: the first few rows and how many wait behind "Show all".
 * - `readFolds` / `writeFold`: which sections are folded, remembered on this
 *   device only (localStorage, `otto.desk.folds`); a blocked or broken
 *   storage just means everything starts open.
 *
 * PURE: no React, no DOM beyond the storage handed in. DeskSection.tsx and
 * DeskTimeFilter.tsx draw these; desk-lists.test.ts holds them.
 */

export type DeskRange = "week" | "30d" | "all";

export const DESK_RANGES: readonly { value: DeskRange; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];

const DAY_MS = 86_400_000;
const RANGE_DAYS: Record<DeskRange, number> = { week: 7, "30d": 30, all: Infinity };

/** True when the row falls in the range. Undated or unreadable dates always show. */
export function inDeskRange(item: { whenISO?: string }, range: DeskRange, nowMs: number): boolean {
  if (range === "all" || !item.whenISO) return true;
  const t = Date.parse(item.whenISO);
  if (!Number.isFinite(t)) return true;
  return nowMs - t <= RANGE_DAYS[range] * DAY_MS;
}

/** How many rows a section shows before "Show all": lists 4, Ready (big cards) 3. */
export const FEW = { list: 4, ready: 3 } as const;

/** The rows to draw and how many sit behind "Show all" (0 when none, or when showing all). */
export function fewOf<T>(items: readonly T[], few: number, all: boolean): { shown: readonly T[]; more: number } {
  if (all || items.length <= few) return { shown: items, more: 0 };
  // One more row is never worth a button: show it instead.
  if (items.length === few + 1) return { shown: items, more: 0 };
  return { shown: items.slice(0, few), more: items.length - few };
}

export const FOLDS_KEY = "otto.desk.folds";

type Store = Pick<Storage, "getItem" | "setItem"> | null | undefined;

/** The folded sections' keys, or none when storage is missing, blocked or holds junk. */
export function readFolds(store: Store): Record<string, true> {
  try {
    const raw = store?.getItem(FOLDS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, true> = {};
    for (const [k, v] of Object.entries(parsed)) if (v === true && k.length <= 40) out[k] = true;
    return out;
  } catch {
    return {};
  }
}

/** Remember one section folded (true) or open (false). Returns the new map; storage errors are ignored. */
export function writeFold(store: Store, key: string, folded: boolean): Record<string, true> {
  const next = { ...readFolds(store) };
  if (folded) next[key] = true;
  else delete next[key];
  try {
    store?.setItem(FOLDS_KEY, JSON.stringify(next));
  } catch {
    // Private window or full storage: the fold still works for this visit.
  }
  return next;
}
