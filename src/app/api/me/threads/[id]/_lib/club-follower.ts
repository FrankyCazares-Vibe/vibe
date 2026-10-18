/**
 * A FOLLOWER READING A CLUB'S BOARD (Franky, Oct 16): followers of a club
 * read its Board and nothing else, and only members type. A follower never
 * posts, reacts, votes, pins or leaves any trace in a club room. The Board
 * is the only club room `can_view_org_channel` opens to someone who is not
 * a member, so "can read this club room, holds no membership" IS "a
 * follower reading the Board"; nothing here re-states that rule.
 *
 * THE DATABASE IS THE WALL: the follower arm of `can_view_org_channel`, the
 * members-only send, reaction and vote rules. These helpers only let a route
 * refuse a follower with the chat's own refusal instead of a bare 500, or a
 * "closed" that isn't true. A follower holds no `channel_members` row, so the
 * routes that write only the caller's own row (read, typing, hide, mute,
 * clear) already change nothing for them.
 *
 * THE ANSWER is the one the chat read path gives a follower for anything
 * beyond reading (src/lib/chat/types.ts): 403 `members_only`, "Members
 * only.", built by `refusalBody`, so every route says the same thing.
 *
 * No `server-only` import, so `node --test` can load it.
 */

import { NextResponse } from "next/server";

import { refusalBody } from "@/lib/chat/types";
import { isUuid } from "@/lib/pgrest";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** 403 `members_only`: what a follower reading the Board gets for any write in it. */
export function membersOnly(): NextResponse {
  return NextResponse.json(refusalBody("members_only"), { status: 403 });
}

/**
 * The viewer in a club whose room they can read: a member, or a follower
 * (no membership row), or "failed" when the read didn't answer.
 *
 * Read on the VIEWER's client: `org_members_select` always shows a member
 * their own row, and a follower has none. Call it only for a club whose room
 * the viewer can read (ensureMember answered ok, or RLS showed the room);
 * for any other club "follower" would be a wrong word for "not a member".
 */
export async function standingInClub(
  supabase: ServerClient,
  orgId: string,
  userId: string,
): Promise<"member" | "follower" | "failed"> {
  const { data, error } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[threads club-follower standing]", error.code, error.message);
    return "failed";
  }
  return data ? "member" : "follower";
}

/**
 * The same question for a channel id from the URL. "not_club": the id names
 * nothing the viewer can read, or a dm or a group. The channel row is read on
 * the viewer's client, so a room they cannot read is "not_club" and the route
 * answers as it always has: nobody learns a room exists.
 */
export async function standingInRoom(
  supabase: ServerClient,
  channelId: string,
  userId: string,
): Promise<"member" | "follower" | "failed" | "not_club"> {
  if (!isUuid(channelId)) return "not_club";
  const { data, error } = await supabase
    .from("channels")
    .select("org_id")
    .eq("id", channelId)
    .maybeSingle();
  if (error) {
    console.error("[threads club-follower room]", error.code, error.message);
    return "failed";
  }
  const orgId = (data as { org_id?: unknown } | null)?.org_id;
  if (typeof orgId !== "string" || orgId === "") return "not_club";
  return standingInClub(supabase, orgId, userId);
}
