import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Like and repost counts per post, from the `post_engagement_counts` RPC
 * (migration `20260922100000_t1_count_and_visibility_fns.sql`).
 *
 * WHY AN RPC. Once T1's policy file lands, `post_likes` and `post_reposts`
 * return only the viewer's own rows, so "fetch every like and count them"
 * would read 0 or 1. The RPC counts every row and returns numbers only, never
 * who liked or reposted. It answers only for posts the caller can see
 * (published, or their own), the same rule as `posts_select_authenticated`.
 *
 * Pass the viewer's cookie client. The RPC keys on `auth.uid()`, so under the
 * service client a draft counts as invisible (no row, so 0).
 *
 * No `server-only` and no `@/` imports, so `node --test` loads this file
 * directly. The only import is the type above.
 */

export type PostEngagement = { likes: number; reposts: number };

/** The RPC refuses more ids than this (SQLSTATE 22023). Callers chunk at it. */
export const ENGAGEMENT_RPC_MAX_IDS = 1000;

/** A count from the RPC as a whole number: NaN, negatives, non-finite or missing → 0. */
function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Every id in postIds gets an entry (zero-filled). Rows for ids not asked for are ignored.
 *  like_count / repost_count go through Number(); NaN, negatives or missing → 0.
 *  A malformed row (no string post_id) is skipped. A repeated id: the last row wins.
 *
 *  Rows match asked ids in lower case, and the Map keeps the caller's own
 *  spelling as its keys. Postgres matches uuids in either case but returns
 *  them in lower case, so an id taken from a URL in upper case would
 *  otherwise always read 0 even though the RPC counted it. */
export function tallyEngagement(rows: unknown, postIds: string[]): Map<string, PostEngagement> {
  const byLower = new Map<string, PostEngagement>();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const r = row as { post_id?: unknown; like_count?: unknown; repost_count?: unknown };
      if (typeof r.post_id !== "string") continue;
      byLower.set(r.post_id.toLowerCase(), {
        likes: toCount(r.like_count),
        reposts: toCount(r.repost_count),
      });
    }
  }
  const out = new Map<string, PostEngagement>();
  for (const id of postIds) {
    const hit = byLower.get(id.toLowerCase());
    out.set(id, hit ? { ...hit } : { likes: 0, reposts: 0 });
  }
  return out;
}

/** Dedupes ids, chunks at 1000, calls rpc("post_engagement_counts",
 *  { p_post_ids, p_since: since ?? null }). [] → empty Map, no call. Any error →
 *  console.error("[engagement-counts]", error) and returns null ("we do not know").
 *
 *  `since` (an ISO timestamp) limits both counts to rows created at or after
 *  it: creator-stats' 7- and 30-day windows. A windowed call answers only for
 *  the caller's OWN posts (the RPC returns no row for anyone else's, so they
 *  zero-fill); an all-time call answers for every post the caller can see.
 *  Callers decide what `null` means on their screen (zeros, or a 500). Never
 *  treat it as "no likes". */
export async function loadPostEngagementCounts(
  client: SupabaseClient,
  postIds: string[],
  since?: string | null,
): Promise<Map<string, PostEngagement> | null> {
  const ids = Array.from(new Set(postIds));
  if (ids.length === 0) return new Map();

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ENGAGEMENT_RPC_MAX_IDS) {
    chunks.push(ids.slice(i, i + ENGAGEMENT_RPC_MAX_IDS));
  }

  try {
    const results = await Promise.all(
      chunks.map((chunk) =>
        client.rpc("post_engagement_counts", { p_post_ids: chunk, p_since: since ?? null }),
      ),
    );
    const rows: unknown[] = [];
    for (const res of results) {
      if (res.error) {
        console.error("[engagement-counts]", res.error);
        return null;
      }
      if (Array.isArray(res.data)) rows.push(...(res.data as unknown[]));
    }
    return tallyEngagement(rows, ids);
  } catch (error) {
    console.error("[engagement-counts]", error);
    return null;
  }
}
