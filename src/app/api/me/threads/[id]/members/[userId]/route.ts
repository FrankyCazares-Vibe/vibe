import { NextResponse } from "next/server";

import { refusalBody } from "@/lib/chat/types";
import { limitFor } from "@/lib/limits/budgets";
import { isUuid } from "@/lib/pgrest";
import { tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string; userId: string }> };

/** What a refusal on the `threadSettings` budget says: the same line on every route that shares it (the numbers are in src/lib/limits/budgets.ts). */
const SETTINGS_TOO_FAST = "You're changing chat settings too fast. Try again in a few minutes.";

/**
 * Remove a member from a group chat.
 *   - If userId === viewer → leave the group (always allowed).
 *   - Else → kick. Only admins can kick. Admins cannot kick themselves
 *     through this path (use leave instead).
 *
 * A CLUB'S ROOM CANNOT BE LEFT (chat rooms, wave 1, contract 6.6): the row is
 * what lists the room for the member, and nothing would bring it back. A club
 * room answers 400 `club_room`, for self and for others; the way out is to
 * leave the club. Asked first on the viewer's own client, before any other
 * read; then with the service role right before the delete (which runs with
 * the service role and so is held by no policy) whenever the first read
 * could not settle it: a kick, or a channel the viewer's read did not show.
 *
 * Leaving and removing count against the account's `threadSettings` budget
 * (rate limits, wave 3), right after sign-in and before that first read.
 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { id: channelId, userId: targetUserId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const rl = await limitFor("threadSettings", user.id);
  if (!rl.allowed) return tooManyRequests(rl, SETTINGS_TOO_FAST);

  // The club-room guard, first. Read on the viewer's client, so a room the
  // viewer cannot see answers like any other thread they are not in (403
  // below), never "this id is a club's room". An id that is not a uuid names
  // no room and goes on to the same 403.
  // `seenByViewer`: the viewer's own read showed the channel, and it is not
  // a club's room (a dm or a group).
  let seenByViewer = false;
  if (isUuid(channelId)) {
    const { data: room, error: roomErr } = await supabase
      .from("channels")
      .select("org_id")
      .eq("id", channelId)
      .maybeSingle();
    if (roomErr) {
      // Fail closed: a row is never deleted on a read that did not answer.
      console.error("[threads.members.DELETE room]", roomErr);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    if (room?.org_id) {
      return NextResponse.json(refusalBody("club_room"), { status: 400 });
    }
    seenByViewer = room !== null;
  }

  // Verify viewer is a member, capture role.
  const { data: viewerRow } = await supabase
    .from("channel_members")
    .select("role")
    .eq("channel_id", channelId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!viewerRow) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: 403 });
  }

  const isSelf = targetUserId === user.id;
  if (!isSelf && viewerRow.role !== "admin") {
    return NextResponse.json(
      { ok: false, error: "Only admins can remove other members" },
      { status: 403 },
    );
  }

  const admin = createSupabaseServiceClient();

  // The second look, with the client that deletes, only where it adds
  // something: a kick (it needs the type anyway), or a channel the viewer's
  // own read could not show (a row left over from a club they are no longer
  // in is still a club's room). Leaving a dm or a group the viewer's own
  // read showed goes straight to the delete, as it always has.
  if (!isSelf || !seenByViewer) {
    const { data: chan, error: chanErr } = await admin
      .from("channels")
      .select("type, org_id")
      .eq("id", channelId)
      .maybeSingle();
    if (chanErr) {
      console.error("[threads.members.DELETE channel]", chanErr);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    if (chan?.org_id) {
      return NextResponse.json(refusalBody("club_room"), { status: 400 });
    }

    // Kicks are a group-chat concept. The DM initiator is stored as "admin",
    // which must not let them evict the other party from a 1:1 thread.
    if (!isSelf && (!chan || chan.type !== "group")) {
      return NextResponse.json(
        { ok: false, error: "Members can only be removed from group chats" },
        { status: 403 },
      );
    }
  }
  const { error: delErr } = await admin
    .from("channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", targetUserId);
  if (delErr) {
    console.error("[threads.members.DELETE]", delErr);
    return NextResponse.json({ ok: false, error: "Could not remove member" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
