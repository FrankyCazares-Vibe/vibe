import type { SupabaseClient } from "@supabase/supabase-js";

import { FOLLOWER_COUNT_FLOOR } from "@/lib/orgs/following";
import { isUuid } from "@/lib/pgrest";

/**
 * The numbers a club's officers see on its page (the club's view, wave 2;
 * handoffs/2026-10-20-club-view/WAVE2-DESIGN.md C7): the header's two counts,
 * exact for them, and the "needs you" line under it ("2 want to join · +6
 * followers this week").
 *
 * SERVER ONLY, with the SERVICE client (the COUNTS RULE in `following.ts`:
 * under a user's client these reads are 1-or-0). No `import "server-only"`,
 * so `officer-counts.test.ts` loads it under `node --test`; nothing here
 * creates a client. Nothing throws: a failed read is logged and answers null,
 * and a null is never shown as zero.
 */

export type OfficerCounts = { pendingRequests: number | null; newFollowersThisWeek: number | null };

/**
 * "This week": people who first followed in the last 7 days
 * (`org_followers.first_followed_at`), so an unfollow and a follow back never
 * count twice. Only current followers: the row goes when they unfollow.
 */
export const NEW_FOLLOWER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A head count as PostgREST sends it, or null. */
function asCount(count: unknown): number | null {
  return typeof count === "number" && Number.isInteger(count) && count >= 0 ? count : null;
}

type HeadQuery = PromiseLike<{ count: number | null; error: unknown }>;

async function headCount(label: string, query: () => HeadQuery): Promise<number | null> {
  try {
    const { count, error } = await query();
    if (error) {
      console.error(`[orgs/officer-counts ${label}]`, error);
      return null;
    }
    return asCount(count);
  } catch (err) {
    console.error(`[orgs/officer-counts ${label}]`, err);
    return null;
  }
}

/**
 * Two head-count reads with the service client; each null when its read
 * failed. `excludeUserIds` (optional) leaves people out of both counts: pass
 * the viewing officer's block pairs (`loadHiddenUsers(...).hidden.blocked`) so
 * the line never counts a request or a follower the officer's own lists hide
 * from them (the requests and followers routes' BLOCKS rule), which would tell
 * them someone who blocked them asked or followed. Ids that aren't uuids are
 * dropped, never sent.
 */
export async function loadOfficerCounts(
  service: SupabaseClient,
  orgId: string,
  nowMs: number,
  excludeUserIds?: Iterable<string>,
): Promise<OfficerCounts> {
  const excluded = [...new Set(excludeUserIds ?? [])].filter(isUuid);
  const pending = headCount("pending", () => {
    let q = service
      .from("org_join_requests")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending");
    if (excluded.length > 0) q = q.not("user_id", "in", `(${excluded.join(",")})`);
    return q;
  });
  const since = Number.isFinite(nowMs) ? new Date(nowMs - NEW_FOLLOWER_WINDOW_MS).toISOString() : null;
  const followers = since
    ? headCount("followers", () => {
        let q = service
          .from("org_followers")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("first_followed_at", since);
        if (excluded.length > 0) q = q.not("user_id", "in", `(${excluded.join(",")})`);
        return q;
      })
    : Promise.resolve(null);
  const [pendingRequests, newFollowersThisWeek] = await Promise.all([pending, followers]);
  return { pendingRequests, newFollowersThisWeek };
}

/** The header's number: exact for officers, else null below FOLLOWER_COUNT_FLOOR (5); null stays null. */
export function headerCount(raw: number | null, exact: boolean): number | null {
  const n = asCount(raw);
  if (n === null) return null;
  if (exact) return n;
  return n < FOLLOWER_COUNT_FLOOR ? null : n;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** "2 want to join · +6 followers this week", or null when both are 0 or unknown. "1 wants to join". */
export function needsYouText(c: OfficerCounts): string | null {
  const pending = asCount(c.pendingRequests) ?? 0;
  const fresh = asCount(c.newFollowersThisWeek) ?? 0;
  const parts: string[] = [];
  if (pending > 0) parts.push(`${fmt(pending)} ${pending === 1 ? "wants" : "want"} to join`);
  if (fresh > 0) parts.push(`+${fmt(fresh)} ${fresh === 1 ? "follower" : "followers"} this week`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
