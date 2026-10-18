import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * MUTE A CLUB'S POSTS (club model gap 2, Oct 16): the rules and reads the
 * mute route, the feed and the "muted" marks share.
 *
 * A mute takes a club's posts out of ONE student's feed and nothing else.
 * They stay in every chat, keep following, and nobody who runs the club is
 * told. That is why it is its own table and not a column on
 * `org_followers`: a club's owner and admins can read their follower rows.
 *
 * THE TABLE (`public.org_post_mutes`, migration 20261017100000): one row per
 * (user_id, org_id). Signed-in students read only their own rows; nobody has
 * a direct write grant, so writes go through `/api/orgs/[slug]/mute` on the
 * service client.
 *
 * No `@/` imports and no `server-only`, so `org-mutes.test.ts` runs under
 * plain `node --test`. Nothing here throws: a failed read or write comes back
 * as `{ ok: false }` and the caller decides.
 */

export const ORG_POST_MUTES_TABLE = "org_post_mutes";

/**
 * How many of a viewer's club mutes the feed reads, newest first. All of them
 * feed the TypeScript check, so a muted club past the filter cap still never
 * reaches the page; it only costs a slot in the candidate pool.
 */
export const MUTED_ORG_READ_LIMIT = 200;

/**
 * How many muted clubs ride in the feed query's `.or()` filter. Each id is
 * ~40 characters of URL, on top of the lane, the hidden people and the
 * reported posts, so the list is bounded. Nobody is near it.
 */
export const MUTED_ORG_FILTER_CAP = 50;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Strict RFC-4122 UUID check, the same as `isUuid` in `src/lib/pgrest.ts`. */
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

type PgLikeError = { code?: unknown; message?: unknown } | null | undefined;

/**
 * Is this "the table isn't there"? Postgres says 42P01, PostgREST says
 * PGRST205. Matched by code AND by the table's name, the same test as
 * `isMissingRemovalsTable`. The migration goes in before the deploy; if a
 * build ever runs without it, the true answer is "nothing is muted" (nothing
 * could have been written), and the feed must not go dark over it.
 */
export function isMissingOrgMutesTable(error: PgLikeError): boolean {
  if (!error || typeof error !== "object") return false;
  const code = typeof error.code === "string" ? error.code : "";
  if (code !== "42P01" && code !== "PGRST205") return false;
  const message = typeof error.message === "string" ? error.message : "";
  return message.includes(ORG_POST_MUTES_TABLE);
}

// ── Pure ────────────────────────────────────────────────────────────────────

/**
 * The feed query's mute filter, or null when nothing is muted.
 *
 * NULL-SAFE ON PURPOSE. A personal post has `org_id` null, and SQL's
 * `NULL NOT IN (…)` is never true, so a plain `.notIn("org_id", ids)` would
 * drop every personal post. The viewer's own posts stay too: a mute never
 * hides what you wrote yourself.
 *
 * postgrest-js sends each `.or()` as its own `or=` param and PostgREST ANDs
 * them, so this sits beside the lane filter without widening it (checked on
 * the local stack, Oct 16). Ids are screened, lower-cased, deduped and capped
 * at {@link MUTED_ORG_FILTER_CAP}, newest first as given.
 */
export function mutedOrgOrFilter(mutedOrgIds: readonly string[], viewerId: string): string | null {
  const ids = Array.from(
    new Set(mutedOrgIds.filter(isUuid).map((id) => id.toLowerCase())),
  ).slice(0, MUTED_ORG_FILTER_CAP);
  if (ids.length === 0) return null;
  const mine = isUuid(viewerId) ? `,user_id.eq.${viewerId.toLowerCase()}` : "";
  return `org_id.is.null,org_id.not.in.(${ids.join(",")})${mine}`;
}

/**
 * The same rule in TypeScript, for the feed's backup check: true when this
 * post was made as a club the viewer muted and they didn't write it. Use the
 * RAW `org_id`, before a hidden club's id is nulled for the response.
 */
export function postHiddenByOrgMute(
  post: { org_id?: string | null; user_id?: string | null },
  mutedOrgIds: ReadonlySet<string>,
  viewerId: string,
): boolean {
  const orgId = typeof post?.org_id === "string" ? post.org_id.toLowerCase() : null;
  if (!orgId || !mutedOrgIds.has(orgId)) return false;
  return post.user_id?.toLowerCase() !== viewerId.toLowerCase();
}

/**
 * Followed club ids minus the muted ones, order kept. A muted club loses its
 * off-campus reach and its ranking boost along with its posts.
 */
export function withoutMutedOrgs(
  orgIds: readonly string[],
  mutedOrgIds: ReadonlySet<string>,
): string[] {
  if (mutedOrgIds.size === 0) return [...orgIds];
  return orgIds.filter((id) => !mutedOrgIds.has(id.toLowerCase()));
}

/** Lower-cased uuids from rows, deduped, order kept. */
function orgIdsFrom(rows: readonly unknown[] | null | undefined): string[] {
  const out = new Set<string>();
  for (const row of rows ?? []) {
    const id = (row as { org_id?: unknown } | null)?.org_id;
    if (isUuid(id)) out.add(id.toLowerCase());
  }
  return Array.from(out);
}

// ── Reads (the viewer's own rows) ───────────────────────────────────────────

export type MutedOrgIdsResult = { ok: true; ids: string[] } | { ok: false; error: unknown };

/**
 * The clubs a viewer muted, newest first. Either client works: the select
 * policy returns only the caller's rows, and the `user_id` filter is ALWAYS
 * applied so the service client can never return someone else's. A missing
 * table reads as "nothing muted" (see {@link isMissingOrgMutesTable}); any
 * other error is `{ ok: false }`, and the feed fails closed on it.
 */
export async function loadViewerMutedOrgIds(
  client: SupabaseClient,
  viewerId: string,
  opts?: { limit?: number },
): Promise<MutedOrgIdsResult> {
  if (!isUuid(viewerId)) return { ok: false, error: "bad id" };
  try {
    const { data, error } = await client
      .from(ORG_POST_MUTES_TABLE)
      .select("org_id")
      .eq("user_id", viewerId)
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? MUTED_ORG_READ_LIMIT);
    if (error) {
      if (isMissingOrgMutesTable(error)) {
        console.error("[orgs/org-mutes] org_post_mutes is not deployed");
        return { ok: true, ids: [] };
      }
      return { ok: false, error };
    }
    return { ok: true, ids: orgIdsFrom(data) };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Which of `orgIds` the viewer muted, as a Set of lower-case ids: the
 * "Muted" mark on a club page, a Following list or a Clubs section. Asks only
 * about the clubs on screen, so it is one bounded read.
 */
export async function loadMutedOrgSet(
  client: SupabaseClient,
  viewerId: string,
  orgIds: readonly string[],
): Promise<{ ok: true; ids: Set<string> } | { ok: false; error: unknown }> {
  const ids = Array.from(new Set(orgIds.filter(isUuid).map((id) => id.toLowerCase())));
  if (ids.length === 0) return { ok: true, ids: new Set() };
  if (!isUuid(viewerId)) return { ok: false, error: "bad id" };
  try {
    const { data, error } = await client
      .from(ORG_POST_MUTES_TABLE)
      .select("org_id")
      .eq("user_id", viewerId)
      .in("org_id", ids);
    if (error) {
      if (isMissingOrgMutesTable(error)) return { ok: true, ids: new Set() };
      return { ok: false, error };
    }
    return { ok: true, ids: new Set(orgIdsFrom(data)) };
  } catch (error) {
    return { ok: false, error };
  }
}

// ── Writes (service role only) ──────────────────────────────────────────────

/**
 * Mute one club's posts for one student. Idempotent: a second mute hits the
 * primary key and comes back `already: true` without touching the row.
 * Writes only the two ids; `created_at` belongs to the database.
 */
export async function muteOrgPosts(
  service: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<{ ok: true; already: boolean } | { ok: false; error: unknown }> {
  if (!isUuid(orgId) || !isUuid(userId)) return { ok: false, error: "bad id" };
  try {
    const { error } = await service
      .from(ORG_POST_MUTES_TABLE)
      .insert({ user_id: userId, org_id: orgId });
    if (!error) return { ok: true, already: false };
    const code = (error as { code?: unknown }).code;
    if (code === "23505") return { ok: true, already: true };
    return { ok: false, error };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Unmute. Idempotent; `removed` is how many rows went (0 or 1). */
export async function unmuteOrgPosts(
  service: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<{ ok: true; removed: number } | { ok: false; error: unknown }> {
  if (!isUuid(orgId) || !isUuid(userId)) return { ok: false, error: "bad id" };
  try {
    const { error, count } = await service
      .from(ORG_POST_MUTES_TABLE)
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("org_id", orgId);
    if (error) return { ok: false, error };
    return { ok: true, removed: typeof count === "number" ? count : 0 };
  } catch (error) {
    return { ok: false, error };
  }
}
