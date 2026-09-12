import "server-only";

import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

/**
 * Post view counts, read from the `post_views` ledger with each post's own
 * author left out.
 *
 * Why not `posts.view_count`: `record_post_view` had no self-view guard
 * until 20260912100500_post_views_self_guard.sql, so the denormalized
 * counter (and the ledger rows behind it) include authors refreshing their
 * own posts. Measured on the live DB 2026-09-12: 71 of 149 ledger rows are
 * self-views, 54 of them on one account whose screens therefore said 74
 * where the honest number is 20. The migration stops new self-views; these
 * helpers make the numbers already on screen honest. The stored counter is
 * deliberately left alone — rewriting it is a production write and a
 * separate decision — so anything still reading `posts.view_count` will
 * disagree with these figures until it is backfilled.
 *
 * Why the service role: `post_views` has RLS enabled with zero SELECT
 * policies (20260508110000_post_views.sql), so a cookie client reads zero
 * rows without erroring — which is how "Views 7d/30d" silently rendered 0
 * for months. These helpers never return a viewer's identity: `user_id` is
 * used to drop the author's rows and is then discarded, so only aggregate
 * counts can reach a response. Keep it that way — who viewed a post is the
 * paid, owner-only surface, and it is not this file's job.
 *
 * SCALE / ROW CAP. This reads ledger ROWS, not a COUNT, so it is subject to
 * PostgREST's row ceiling (`max_rows = 1000`, supabase/config.toml:18) in a
 * way the `count: 'exact', head: true` queries it replaced were not. A
 * truncated response carries no error, so an unpaged read would return a
 * SHORT array and every view number would drift quietly downward — the same
 * class of lie this file exists to remove, pointed the other way. Hence the
 * paging loop below. Measured live 2026-09-12: the whole ledger is 149 rows
 * across 25 posts (max 19 on any one post, 74 across the heaviest author's
 * posts), so nothing is truncated today — but the feed asks for up to 200
 * posts at a time, so the rows behind ONE request cross 1000 long before the
 * table looks big. If this ever gets hot, the right fix is an aggregate:
 * a SECURITY DEFINER RPC returning `(post_id, count)` grouped with the
 * author-exclusion done in SQL, which also drops the payload from N rows to
 * N posts. Not needed at 149 rows, so it is not written yet.
 */

/**
 * Rows per ledger request. The loop advances by the number of rows actually
 * returned and stops on an EMPTY page rather than a short one, so it stays
 * correct even if the deployed PostgREST caps pages below this number.
 */
const LEDGER_PAGE = 1000;

/**
 * Refuse to answer rather than scan the world. Past this many rows for a
 * single call we return `null` ("we do not know") instead of a number built
 * from a partial scan — the whole point of this file is that a figure we
 * cannot stand behind must not reach a screen.
 */
const LEDGER_SCAN_CAP = 50_000;

export type HonestViewRow = {
  post_id: string;
  /** `YYYY-MM-DD`. The ledger stores a date, not a timestamp — there is no
   *  time-of-day and no ordering within a day. */
  viewed_on: string;
};

/**
 * Ledger rows for `postIds`, minus every row written by the post's own
 * author.
 *
 * `authorByPostId` maps post id -> that post's `posts.user_id`; the caller
 * already has it from the rows it is rendering, which keeps this to one
 * query with no join.
 *
 * Returns `null` — never an empty array — when the count could not be read
 * at all: no service role configured, the query failed, or the scan ran past
 * `LEDGER_SCAN_CAP` so what we have is only part of the ledger. Callers must
 * tell those two apart: `[]` means nobody has viewed these posts, `null`
 * means we do not know, and a `null` must never be rendered as 0.
 */
export async function loadHonestViewRows(
  postIds: string[],
  authorByPostId: Map<string, string>,
): Promise<HonestViewRow[] | null> {
  if (postIds.length === 0) return [];

  if (!isSupabaseServiceConfigured()) {
    console.error(
      "[honest-views] SUPABASE_SERVICE_ROLE_KEY missing — post views cannot be counted",
    );
    return null;
  }

  const service = createSupabaseServiceClient();
  type LedgerRow = { post_id: string; user_id: string; viewed_on: string };
  const kept: HonestViewRow[] = [];
  let scanned = 0;

  // Paged because a truncated PostgREST response is not an error — see the
  // row-cap note at the top of this file. Ordered by the primary key
  // (post_id, user_id, viewed_on), which is unique, so the pages form one
  // total order with no row landing in two of them and none skipped.
  for (;;) {
    const { data, error } = await service
      .from("post_views")
      .select("post_id,user_id,viewed_on")
      .in("post_id", postIds)
      .order("post_id", { ascending: true })
      .order("user_id", { ascending: true })
      .order("viewed_on", { ascending: true })
      .range(scanned, scanned + LEDGER_PAGE - 1);

    if (error) {
      console.error("[honest-views]", error);
      return null;
    }

    const page = (data ?? []) as LedgerRow[];
    // Empty, not short: if the deployed row cap is lower than LEDGER_PAGE
    // every page comes back short, and stopping on a short page would
    // undercount by exactly the amount we are trying to stop undercounting.
    if (page.length === 0) break;

    for (const r of page) {
      if (r.user_id !== authorByPostId.get(r.post_id)) {
        kept.push({ post_id: r.post_id, viewed_on: r.viewed_on });
      }
    }
    scanned += page.length;

    if (scanned >= LEDGER_SCAN_CAP) {
      console.error(
        `[honest-views] ledger scan hit ${LEDGER_SCAN_CAP} rows for ${postIds.length} posts — refusing to report a partial count`,
      );
      return null;
    }
  }

  return kept;
}

/**
 * Rows -> per-post totals. Seeded with 0 for every requested id so a post
 * nobody has viewed gets a real 0 rather than a missing key.
 */
export function tallyViews(
  rows: HonestViewRow[],
  postIds: string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of postIds) counts.set(id, 0);
  for (const r of rows) counts.set(r.post_id, (counts.get(r.post_id) ?? 0) + 1);
  return counts;
}
