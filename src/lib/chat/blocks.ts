/**
 * The viewer's block set for club rooms (handoffs/chat-redesign/wave-2-contracts.md
 * 5.4, section 8): the people in a block pair with the viewer, either way.
 *
 * ONE `blocks` read on the viewer's cookie client, the `loadHiddenUsers`
 * shape (safety/hidden-users.ts): RLS `blocks_select_either` shows exactly
 * the viewer's pairs, so the caller's own client is enough. Both directions
 * go in; the viewer is removed (a stray self-row must never hide their own
 * rows). Mutes hide nothing in club rooms.
 *
 * Read ONCE per request: the thread GET reads it and hands it down; the vote
 * route once; the inbox once; `buildChatMessages` reads it itself only when
 * no caller did. `null` = the read failed (logged): a read answers 503
 * `try_again` for it; the send's answer never does (9.1).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function blockedIdsFor(client: SupabaseClient, viewerId: string): Promise<Set<string> | null> {
  const { data, error } = await client
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`);
  if (error) {
    console.error("[chat/blocks]", error.code, error.message);
    return null;
  }
  const blocked = new Set<string>();
  for (const row of (data ?? []) as { blocker_id: string; blocked_id: string }[]) {
    blocked.add(row.blocker_id === viewerId ? row.blocked_id : row.blocker_id);
  }
  blocked.delete(viewerId);
  return blocked;
}
