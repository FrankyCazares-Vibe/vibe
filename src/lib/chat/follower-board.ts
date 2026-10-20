/**
 * A FOLLOWER's read of a club's Announcement Board (club model, Franky's
 * calls of Oct 16; 20261017110000, repair of review finding 1).
 *
 * Only members type in a club's chats; a follower reads the Board and
 * nothing else. The database lets a follower see THAT they may read it
 * (`can_view_org_channel`, asked as the viewer: `ensureMember`, or the
 * `channels` read whose policy is that function), but it never hands them a
 * message row: `messages_select_org_member` is members-only, because every
 * row carries its author's id and the Board's history holds members' words
 * too (the old announcements room became the Board with its history; a
 * demoted officer's posts stay where they were).
 *
 * So the app reads a follower's Board with the service role, and ONLY:
 *   - after the database said yes for this viewer and this Board;
 *   - top-level posts (never a reply), live (never a removed one);
 *   - written by someone who is an owner or admin of the club NOW
 *     (`BOARD_POSTER_ROLES`), so a legacy post or a demoted officer's post
 *     never reaches a follower, as the club's post or by id.
 * The screens show each post as the club's (no author), so no member's name
 * leaves the server.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { BOARD_POSTER_ROLES } from "./room-rules";
import { isMissingChatSchema } from "./schema";

/** Clubs asked about in one `in (...)` filter (the follows list is capped at 50). */
const ORGS_PER_READ = 100;

/**
 * The current Board posters (owners and admins) of each club, read with the
 * service role. Null when the read fails: the caller shows nothing rather
 * than guess. A club with no poster maps to an empty set.
 */
export async function boardPostersOf(
  service: SupabaseClient,
  orgIds: readonly string[],
  tag: string,
): Promise<Map<string, Set<string>> | null> {
  const posters = new Map<string, Set<string>>();
  const ids = Array.from(new Set(orgIds));
  for (const id of ids) posters.set(id, new Set());
  for (let start = 0; start < ids.length; start += ORGS_PER_READ) {
    const chunk = ids.slice(start, start + ORGS_PER_READ);
    const { data, error } = await service
      .from("org_members")
      .select("org_id, user_id")
      .in("org_id", chunk)
      .in("role", [...BOARD_POSTER_ROLES]);
    if (error) {
      console.error(`[${tag} board posters]`, error.code, error.message);
      return null;
    }
    for (const row of (data ?? []) as { org_id?: unknown; user_id?: unknown }[]) {
      if (typeof row.org_id === "string" && typeof row.user_id === "string") {
        posters.get(row.org_id)?.add(row.user_id);
      }
    }
  }
  return posters;
}

/** A row a follower may be shown: top-level, live, by a current owner or admin. */
export function isFollowerBoardPost(
  row: { user_id?: unknown; thread_root_id?: unknown; removed_at?: unknown },
  posters: ReadonlySet<string> | undefined,
): boolean {
  if (!posters || typeof row.user_id !== "string") return false;
  if (row.thread_root_id !== null && row.thread_root_id !== undefined) return false;
  if (row.removed_at !== null && row.removed_at !== undefined) return false;
  return posters.has(row.user_id);
}

export type FollowerPageQuery = {
  channelId: string;
  orgId: string;
  select: string;
  limit: number;
  before?: string;
  after?: string;
  oldestFirst: boolean;
};

/**
 * One page of a Board for a follower, with the service role: the same page
 * a member's read gives (newest `limit`, or from `after`, or before
 * `before`), narrowed to `isFollowerBoardPost`. The caller has asked
 * `can_view_org_channel` as the viewer for this Board first. `{ data,
 * error }` like a PostgREST read; no poster, no rows.
 */
export async function readFollowerBoardPage(
  service: SupabaseClient,
  q: FollowerPageQuery,
  tag: string,
): Promise<{ data: unknown[] | null; error: { code?: string; message: string } | null }> {
  const posters = await boardPostersOf(service, [q.orgId], tag);
  if (!posters) return { data: null, error: { message: "board posters could not be read" } };
  const ids = Array.from(posters.get(q.orgId) ?? []);
  if (ids.length === 0) return { data: [], error: null };
  // A post its officer deleted (Oct 19, 2026) is not on a follower's Board,
  // so it is left out HERE, in the read: filtered after the read, a page of
  // `limit` came back short, the screens took a short page for the oldest
  // one, and the posts before it could no longer be reached (review of Oct
  // 19, 2026). A database without `deleted_at` (20261019150000) has no
  // deleted post: the same read without the filter.
  const run = (liveOnly: boolean) => {
    let read = service
      .from("messages")
      .select(q.select)
      .eq("channel_id", q.channelId)
      .is("thread_root_id", null)
      .is("removed_at", null)
      .in("user_id", ids);
    if (liveOnly) read = read.is("deleted_at", null);
    if (q.before) read = read.lt("created_at", q.before);
    if (q.after) read = read.gte("created_at", q.after);
    return read.order("created_at", { ascending: q.oldestFirst }).limit(q.limit);
  };
  let { data, error } = await run(true);
  if (error && isMissingChatSchema(error)) ({ data, error } = await run(false));
  return { data: (data ?? null) as unknown[] | null, error: error ?? null };
}
