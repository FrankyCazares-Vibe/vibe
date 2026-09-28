/**
 * Which club posts a viewer may see on the club's own page, when the posts
 * were read with the SERVICE role (S67 security wave 2, integration I1).
 *
 * Two surfaces read a club's recent posts past RLS: the club page grid
 * (`src/app/orgs/[handle]/page.tsx`) and `GET /api/orgs/[slug]/profile`.
 * No policy runs on those reads, so each has to write
 * `posts_select_authenticated` out by hand:
 *
 *   status = 'published' AND removed_at IS NULL      -> in the query
 *   type = 'post' (video posts are parked)           -> in the query
 *   user_visible(user_id)  (author not restricted)   -> `restricted` below
 *   org_content_visible(org_id)  (hidden club)       -> the 404 before the read
 *   NOT is_blocked_either_way(viewer, user_id)       -> `hiddenAuthors` below
 *
 * THE BLOCK RULE (ruling 13): a block hides the posts a person WROTE, club
 * posts included, on every surface. Only the author is judged: another
 * officer's posts on the same club stay, and joining is untouched.
 *
 * PURE ON PURPOSE (no imports), so `club-posts.test.ts` loads it under plain
 * `node --test`; `club-posts-read.ts` (server-only) does the queries.
 */

/** How many rows each read asks for, before the author filters thin it. */
export const CLUB_POST_READ_LIMIT = 24;

/** How many posts a club page shows. */
export const CLUB_POST_SHOW_LIMIT = 12;

/** The moderation column the read filters on; it arrived with 20260923090000. */
export const CLUB_POST_MODERATION_COLUMNS = ["removed_at"] as const;

/** A post row as far as these filters care: who wrote it. */
export type ClubPostAuthored = { user: { id: string } | null };

export type ClubPostAuthorFilter = {
  /** Authors with a restriction in force (`user_visible` is false). */
  restricted: ReadonlySet<string>;
  /** Authors in a block pair with the viewer, either way. Empty when signed out. */
  hiddenAuthors: ReadonlySet<string>;
};

/**
 * The rows the viewer may see, newest-first order kept, at most `limit`.
 * A row with no author embed (the account is gone) is kept, as the grid
 * always has: there is nobody left to be restricted or blocked. Ids are
 * compared in lower case, the way Postgres returns uuids.
 */
export function visibleClubPosts<T extends ClubPostAuthored>(
  rows: readonly T[],
  filter: ClubPostAuthorFilter,
  limit: number = CLUB_POST_SHOW_LIMIT,
): T[] {
  const drop = new Set<string>();
  for (const id of filter.restricted) drop.add(id.toLowerCase());
  for (const id of filter.hiddenAuthors) drop.add(id.toLowerCase());
  const out: T[] = [];
  for (const row of rows) {
    if (out.length >= limit) break;
    const authorId = typeof row.user?.id === "string" ? row.user.id.toLowerCase() : null;
    if (authorId && drop.has(authorId)) continue;
    out.push(row);
  }
  return out;
}

type PgLikeError = { code?: unknown; message?: unknown } | null | undefined;

/**
 * Is this "the `account_restrictions` table isn't there yet"? Between a code
 * deploy and its migration that is exactly "nobody is restricted", so it is
 * not a failure; every OTHER error fails closed. Same matcher the club page
 * has used since the moderation wave (copied from src/lib/moderation/access.ts,
 * which doesn't export it).
 */
export function isMissingRestrictionsStore(error: PgLikeError): boolean {
  if (!error || typeof error !== "object") return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = (typeof error.message === "string" ? error.message : "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}
