import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingColumnError } from "@/lib/db/missing-column";
import { isUuid } from "@/lib/pgrest";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";

import {
  CLUB_POST_MODERATION_COLUMNS,
  CLUB_POST_READ_LIMIT,
  isMissingRestrictionsStore,
} from "./club-posts";

/**
 * The reads behind a club's recent-posts list on the club page grid
 * (`src/app/orgs/[handle]/page.tsx`; S67 security wave 2, integration I1).
 * `GET /api/orgs/[slug]/profile` shared them until it was deleted on Oct 15
 * (B1.3), unused. `club-posts.ts` holds the rule and says which piece of
 * `posts_select_authenticated` each read stands in for; `visibleClubPosts`
 * applies the author filters these return.
 *
 * Any caller goes through `readClubPostsForViewer`: blocked authors are known
 * before the posts read, so they come off inside the query (before the
 * limit). A restriction can only be judged once the rows are in (it lives in
 * another table, and the author list isn't known until then), so restricted
 * authors are still filtered after the read.
 *
 * Every loader answers `ok: false` on a real failure, and the caller then
 * shows no posts: "restriction unknown" and "block unknown" fail closed.
 */

/**
 * Author ids ready for PostgREST's `not.in.(…)`: UUIDs only (`isUuid`, so no
 * id can add filter syntax to the URL), lower case, no duplicates, sorted so
 * the same set always builds the same URL.
 */
function authorExclusionList(ids: Iterable<string> | undefined): string[] {
  if (!ids) return [];
  const out = new Set<string>();
  for (const id of ids) if (isUuid(id)) out.add(id.toLowerCase());
  return Array.from(out).sort();
}

/**
 * The club's newest published `type='post'` rows that no moderator removed,
 * read with the SERVICE role. A deploy that doesn't have `removed_at` yet
 * answers exactly as it did before (nothing could be removed there) instead
 * of an empty club page.
 *
 * `excludeAuthors` (optional) leaves those authors out INSIDE the query,
 * before the row limit, the way `loadHiddenUsers` asks every caller to: a
 * blocked author who posts a lot then can't push other officers' posts out
 * of the {@link CLUB_POST_READ_LIMIT} window. `posts.user_id` is NOT NULL, so
 * `not.in` never drops a row for having no author.
 */
export async function readClubPostRows(
  service: SupabaseClient,
  orgId: string,
  select: string,
  excludeAuthors?: Iterable<string>,
): Promise<{ data: unknown[] | null; error: unknown }> {
  const exclude = authorExclusionList(excludeAuthors);
  const run = async (moderation: boolean) => {
    let q = service
      .from("posts")
      .select(select)
      .eq("org_id", orgId)
      .eq("type", "post")
      .eq("status", "published");
    if (exclude.length > 0) q = q.notIn("user_id", exclude);
    if (moderation) q = q.is("removed_at", null);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(CLUB_POST_READ_LIMIT);
    return { data: (data as unknown[] | null) ?? null, error: error ?? null };
  };
  const first = await run(true);
  if (first.error && isMissingColumnError(first.error, CLUB_POST_MODERATION_COLUMNS)) {
    return run(false);
  }
  return first;
}

/**
 * Which of these authors have a restriction in force (`user_visible` is
 * false): not lifted, started, and either permanent or not yet run out, the
 * same read-time expiry every other check uses (no job clears a suspension).
 * A missing `account_restrictions` table is "nobody"; any other error fails
 * closed.
 */
export async function loadRestrictedAuthors(
  service: SupabaseClient,
  userIds: readonly string[],
): Promise<{ ok: true; ids: Set<string> } | { ok: false; ids: null }> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return { ok: true, ids: new Set() };
  const nowIso = new Date().toISOString();
  const { data, error } = await service
    .from("account_restrictions")
    .select("user_id")
    .in("user_id", ids)
    .is("lifted_at", null)
    .lte("starts_at", nowIso)
    .or(`ends_at.is.null,ends_at.gt.${nowIso}`);
  if (error) {
    if (isMissingRestrictionsStore(error)) return { ok: true, ids: new Set() };
    console.error("[club-routes restricted authors]", error);
    return { ok: false, ids: null };
  }
  const rows = (data ?? []) as Array<{ user_id: string | null }>;
  return {
    ok: true,
    ids: new Set(rows.map((r) => r.user_id).filter((id): id is string => !!id)),
  };
}

/**
 * Everyone in a block pair with the viewer, either way (ruling 13): their
 * posts come off the club list the way RLS takes them off every cookie-client
 * surface. Mutes are not included; a mute quiets the feed, it doesn't hide a
 * club's page the viewer opened on purpose. Signed out, nobody.
 *
 * Read with the viewer's OWN client (`blocks_select_either` lets it see both
 * directions), exactly as `loadHiddenUsers` documents.
 */
export async function loadBlockedAuthors(
  supabase: SupabaseClient,
  viewerId: string | null,
): Promise<{ ok: true; ids: Set<string> } | { ok: false; ids: null }> {
  if (!viewerId) return { ok: true, ids: new Set() };
  const res = await loadHiddenUsers(supabase, viewerId);
  if (!res.ok) {
    console.error("[club-routes blocked authors]", res.error);
    return { ok: false, ids: null };
  }
  const ids = new Set(res.hidden.blocked);
  // Never hide the viewer's own posts from them (a stray self-block row).
  ids.delete(viewerId);
  return { ok: true, ids };
}

export type BlockedAuthorsResult = Awaited<ReturnType<typeof loadBlockedAuthors>>;

/**
 * The club's post rows for THIS viewer: their blocked authors (ruling 13) are
 * read first and left out inside the posts query, before the limit
 * ({@link readClubPostRows}), so the window is filled with posts the viewer
 * may actually see. `blocked` still comes back for `visibleClubPosts`, which
 * filters again after the read (belt and braces), along with the restricted
 * authors that can only be judged once the rows are in.
 *
 * A failed blocks read skips the posts query (`data: null, error: null`):
 * the caller already shows no posts when `blocked.ok` is false.
 */
export async function readClubPostsForViewer(
  service: SupabaseClient,
  supabase: SupabaseClient,
  viewerId: string | null,
  orgId: string,
  select: string,
): Promise<{
  posts: { data: unknown[] | null; error: unknown };
  blocked: BlockedAuthorsResult;
}> {
  const blocked = await loadBlockedAuthors(supabase, viewerId);
  if (!blocked.ok) return { posts: { data: null, error: null }, blocked };
  const posts = await readClubPostRows(service, orgId, select, blocked.ids);
  return { posts, blocked };
}
