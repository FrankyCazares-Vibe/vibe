import { NextResponse } from "next/server";

import { ADMIN_READ_LIMIT, adminFail, requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { type AdminNumbers, NUMBERS_DAYS, toOpenRows, totalOpens, utcDay, windowStart } from "@/lib/tally/view";

/** PostgREST hands back at most 1000 rows a request on this project, so the read pages. */
const PAGE_ROWS = 1000;
/**
 * 30 days hold at most about 2,300 rows (3 pages, 25 rows a day each: the
 * ceiling inside `tally_page_open`), so this is never reached in practice.
 * `truncated` says so if it ever is.
 */
const MAX_ROWS = 5000;

/**
 * "The table isn't there (yet)": 42P01 Postgres has no such table; PGRST205
 * PostgREST's schema cache has none. The code ships before 20261012180000 is
 * applied, and the tab then says the counter is not switched on.
 */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

type ReadResult = { rows: unknown[]; truncated: boolean } | "missing";

/** Every tally row from `since` on, a page at a time, in a fixed order so no row is read twice. */
async function readOpens(since: string): Promise<ReadResult> {
  const service = createSupabaseServiceClient();
  const rows: unknown[] = [];
  let total: number | null = null;
  while (rows.length < MAX_ROWS) {
    const { data, error, count } = await service
      .from("page_open_tally")
      .select("day, page, label, opens", { count: "exact" })
      .gte("day", since)
      .order("day", { ascending: false })
      .order("page", { ascending: true })
      .order("label", { ascending: true })
      .range(rows.length, Math.min(rows.length + PAGE_ROWS, MAX_ROWS) - 1);
    if (error) {
      if (error.code && MISSING_TABLE_CODES.has(error.code)) return "missing";
      throw new Error(`${error.code ?? "unknown"}: ${error.message}`);
    }
    if (typeof count === "number") total = count;
    const got = data ?? [];
    rows.push(...got);
    // Done when the count says so, or when a page comes back empty.
    if (got.length === 0 || (total !== null && rows.length >= total)) break;
  }
  return { rows, truncated: total !== null && total > rows.length };
}

/**
 * GET /api/admin/numbers
 *
 * The founders' Numbers tab: how many times the front page, the waitlist
 * page and the sign-up page were opened, per day and per link label, for
 * today and the 29 days before it, with a total per page for the last 7 and
 * the last 30 days (src/lib/tally/view.ts).
 *
 * THESE ARE TOTALS, NOT PEOPLE. `public.page_open_tally` holds a day (UTC),
 * a page name, a `?src=` label and a number, so there is nothing here to
 * mask and nothing a founder could trace to a visitor. It is still founders
 * only: the same gate as every /api/admin route, and the table has RLS on
 * with no policy, so no browser reads it any other way.
 *
 * `ready: false` (with no rows) while the table is missing: the code ships
 * before its migration, and "nothing counted yet" must not look like "the
 * counter is working and nobody came".
 *
 * RESPONSES
 *   200 AdminNumbers · 401 · 403 · 429 · 500 request_failed
 */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const rl = await rateLimit(`admin-numbers:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Slow down a moment.");

  try {
    const now = new Date();
    const since = windowStart(now, NUMBERS_DAYS);
    const read = await readOpens(since);
    const rows = read === "missing" ? [] : toOpenRows(read.rows);
    const body: AdminNumbers = {
      ok: true,
      ready: read !== "missing",
      today: utcDay(now),
      since,
      rows,
      totals: totalOpens(rows, now),
      truncated: read !== "missing" && read.truncated,
    };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[admin/numbers]", err instanceof Error ? err.message : String(err));
    return adminFail(500, "request_failed", "Request failed");
  }
}
