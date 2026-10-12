/**
 * The Numbers tab's pure helpers: which days it shows, how a row read from
 * `public.page_open_tally` is cleaned, and the totals per page. Only type
 * imports (erased), so `node --test` loads it as is.
 *
 * DAYS ARE UTC DATES, the way the database counts them
 * (`tally_page_open` stamps `(now() at time zone 'utc')::date`). A day here
 * starts at 8 pm Indiana time in summer and 7 pm in winter; the tab says so.
 */

import type { TallyPage } from "./open";

/** How far back the tab reads: today and the 29 days before it. */
export const NUMBERS_DAYS = 30;

/** The short total: today and the 6 days before it. */
export const NUMBERS_WEEK_DAYS = 7;

/** One row of the tally, as the tab shows it. `label` is "" for no label. */
export type OpenRow = { day: string; page: TallyPage; label: string; opens: number };

export type OpenTotals = Record<TallyPage, { last7: number; last30: number }>;

/** What GET /api/admin/numbers answers. */
export type AdminNumbers = {
  ok: true;
  /** False while the tally's migration (20261012180000) is not applied: nothing is counted yet. */
  ready: boolean;
  /** The server's own day (UTC), so the tab never trusts the laptop's clock. */
  today: string;
  /** The first day in `rows` and in the 30-day totals. */
  since: string;
  rows: OpenRow[];
  totals: OpenTotals;
  /** True when there were more rows than the route reads; the totals are then short. */
  truncated: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_ORDER: Record<TallyPage, number> = { home: 0, waitlist: 1, signup: 2 };

/** `now` as a UTC date (YYYY-MM-DD), or the date `daysBack` days before it. */
export function utcDay(now: Date, daysBack = 0): string {
  return new Date(now.getTime() - daysBack * DAY_MS).toISOString().slice(0, 10);
}

/** The first day of a window of `days` days that ends today. */
export function windowStart(now: Date, days: number): string {
  return utcDay(now, Math.max(1, Math.floor(days)) - 1);
}

/**
 * Rows as the database sent them, cleaned: an unknown page, a day that isn't
 * a date or a count that isn't a whole number from 0 up is dropped rather
 * than shown as something it isn't. Sorted newest day first, then front
 * page, waitlist, sign-up, then the most-opened label.
 */
export function toOpenRows(raw: readonly unknown[] | null | undefined): OpenRow[] {
  const rows: OpenRow[] = [];
  for (const item of raw ?? []) {
    if (item === null || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const page = r.page;
    if (page !== "home" && page !== "waitlist" && page !== "signup") continue;
    if (typeof r.day !== "string" || !DAY_RE.test(r.day)) continue;
    // A bigint column can arrive as a string; both read the same here.
    const opens = typeof r.opens === "string" ? Number(r.opens) : r.opens;
    if (typeof opens !== "number" || !Number.isSafeInteger(opens) || opens < 0) continue;
    rows.push({ day: r.day, page, label: typeof r.label === "string" ? r.label : "", opens });
  }
  return rows.sort(
    (a, b) =>
      b.day.localeCompare(a.day) ||
      PAGE_ORDER[a.page] - PAGE_ORDER[b.page] ||
      b.opens - a.opens ||
      a.label.localeCompare(b.label),
  );
}

/**
 * Opens per page over the last 7 and the last 30 days, today included (so
 * today's part is still growing). Dates compare as text: YYYY-MM-DD sorts
 * the way the calendar does.
 */
export function totalOpens(rows: readonly OpenRow[], now: Date): OpenTotals {
  const week = windowStart(now, NUMBERS_WEEK_DAYS);
  const month = windowStart(now, NUMBERS_DAYS);
  const today = utcDay(now);
  const totals: OpenTotals = {
    home: { last7: 0, last30: 0 },
    waitlist: { last7: 0, last30: 0 },
    signup: { last7: 0, last30: 0 },
  };
  for (const r of rows) {
    if (r.day > today || r.day < month) continue;
    totals[r.page].last30 += r.opens;
    if (r.day >= week) totals[r.page].last7 += r.opens;
  }
  return totals;
}
