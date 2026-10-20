import { NextResponse } from "next/server";

import { hasDeletedShape } from "@/lib/chat/deleted-note";
import { chatV2For } from "@/lib/chat/flag-server";
import { readLatestPerRoom } from "@/lib/chat/latest-per-room";
import { latestShownPerRoom, orderFollowedBoards, type PreviewRow } from "@/lib/chat/reads";
import { boardPostersOf, isFollowerBoardPost } from "@/lib/chat/follower-board";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import {
  refusalBody,
  type FollowedBoard,
  type FollowedBoardsResponse,
  type OrgRef,
} from "@/lib/chat/types";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

const TAG = "me/club-boards";

/** The one-time "migration C is not in this database yet" line of the preview read. */
const LATEST_TAG = `${TAG} chat_latest_per_channel`;

/**
 * The newest follows looked at: the feed's own bound (it reads the newest 50
 * followed clubs), a bound on one request however many clubs a script
 * followed, and an `in.(...)` list that keeps each URL short.
 */
const FOLLOWS_MAX = 50;

/**
 * The preview rows, WITHOUT the author's name: on a follower's list the
 * Board speaks for the club, so `latest.author_name` is always "" and the
 * screens print the club's name. No member's name leaves this route.
 */
const PREVIEW_SELECT = "id, channel_id, content, created_at, user_id, kind, thread_root_id, attachment_kind";

const requestFailed = () => NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });

function answer(boards: FollowedBoard[]) {
  const body: FollowedBoardsResponse = { ok: true, boards: orderFollowedBoards(boards) };
  return NextResponse.json(body);
}

type BoardRow = { id: string; org_id: string; name: string | null };
type OrgRow = { id: string; handle: string; name: string | null; logo_url: string | null; banner_url: string | null; verified: boolean | null };

/**
 * GET /api/me/club-boards: the Boards I read as a FOLLOWER (club model,
 * Franky, Oct 16), for the Messages home beside `/api/me/inbox`'s clubs.
 * Followers read a club's Announcement Board and nothing else; only members
 * type. `FollowedBoardsResponse` (src/lib/chat/types.ts).
 *
 * WHO IS LISTED: a club I follow, am not a member of (members find the Board
 * in the inbox), that is not hidden, and whose Board THE DATABASE lets me
 * read. That last one is never re-coded here: the Boards are read on MY
 * client, and `channels_select_org_member` is `can_view_org_channel` itself,
 * once per row (critique #7). So a club that turned the Board off for
 * followers, one whose officer removed me (the Board bar) or blocked me, or
 * a Board I may not read for any other reason, is simply not listed, and
 * nothing here says why: nobody is told they were removed.
 *
 * WHICH CLIENT: my follows, my memberships and the Boards on MY client
 * (RLS decides who is listed). The clubs' names and logos with the service
 * role, because `orgs_select` hides SAE from a follower who isn't a member;
 * the club page shows the same to anyone. The previews with the service
 * role too, because the database shows a follower no message row: only
 * live top-level posts by the club's current owners and admins
 * (`withPreviews`; repair of review finding 1). Never a roster, never a
 * count, never an author.
 *
 * NO LIMITER, like the inbox: a read, and a per-account count of opening
 * Messages would be a record of when someone is on Vibe. The reads are
 * bounded instead (FOLLOWS_MAX).
 *
 * RESPONSES
 *   200 FollowedBoardsResponse   (boards: [] on a database without rooms)
 *   401 Unauthorized · 404 not_found (chat flag off) · 500 Request failed
 */
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!(await chatV2For(user.id))) {
    return NextResponse.json(refusalBody("not_found"), { status: 404 });
  }

  // 1. My follows, newest first. The user_id filter is not optional:
  // `org_followers_select` also shows an officer their club's followers.
  const { data: followData, error: followErr } = await supabase
    .from("org_followers")
    .select("org_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(FOLLOWS_MAX);
  if (followErr) {
    console.error(`[${TAG} follows]`, followErr.code, followErr.message);
    return requestFailed();
  }
  const orgIds = Array.from(new Set(((followData ?? []) as { org_id: string }[]).map((row) => row.org_id)));
  if (orgIds.length === 0) return answer([]);
  if (!isSupabaseServiceConfigured()) {
    console.error(`[${TAG}] service role not configured; the clubs can't be named`);
    return requestFailed();
  }
  const service = createSupabaseServiceClient();

  // 2. My memberships among them, their Boards as the database lets me read
  // them, and the clubs (not hidden). All three decide who is listed, so a
  // failure of any is a 500, never a guessed list.
  const [memberRes, boardRes, orgRes] = await Promise.all([
    supabase.from("org_members").select("org_id").eq("user_id", user.id).in("org_id", orgIds),
    supabase.from("channels").select("id, org_id, name").in("org_id", orgIds).eq("kind", "board"),
    service
      .from("orgs")
      .select("id, handle, name, logo_url, banner_url, verified")
      .in("id", orgIds)
      .is("hidden_at", null),
  ]);
  if (boardRes.error && isMissingChatSchema(boardRes.error)) {
    // A database without rooms (migration A): no Boards to read.
    warnMissingChatSchemaOnce(TAG);
    return answer([]);
  }
  const failed = memberRes.error ?? boardRes.error ?? orgRes.error;
  if (failed) {
    console.error(`[${TAG} clubs]`, failed.code, failed.message);
    return requestFailed();
  }

  const memberOf = new Set(((memberRes.data ?? []) as { org_id: string }[]).map((row) => row.org_id));
  const boardOf = new Map<string, BoardRow>();
  for (const board of (boardRes.data ?? []) as BoardRow[]) {
    if (!boardOf.has(board.org_id)) boardOf.set(board.org_id, board);
  }
  const orgOf = new Map<string, OrgRef>();
  for (const o of (orgRes.data ?? []) as OrgRow[]) {
    orgOf.set(o.id, {
      id: o.id,
      handle: o.handle,
      name: typeof o.name === "string" ? o.name : "",
      logo_url: orgAssetProxyUrl(o.handle, o.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(o.handle, o.banner_url, "banner"),
      verified: o.verified === true,
    });
  }
  const listed = orgIds.filter((id) => !memberOf.has(id) && orgOf.has(id) && boardOf.has(id));
  if (listed.length === 0) return answer([]);

  const boards = await withPreviews({ service, listed, orgOf, boardOf });
  return boards ? answer(boards) : requestFailed();
}

type Listed = {
  service: ReturnType<typeof createSupabaseServiceClient>;
  /** The clubs to list, each with a ref and a Board. */
  listed: string[];
  orgOf: Map<string, OrgRef>;
  boardOf: Map<string, BoardRow>;
};

/**
 * Each listed Board with its newest post a follower may be shown (repair of
 * review finding 1): the database shows a follower no message row, so the
 * newest 5 top-level, live rows of each Board are read with the SERVICE
 * role through `chat_latest_per_channel`, and only a post by a CURRENT owner
 * or admin of the club is kept (`isFollowerBoardPost`): a legacy post or a
 * demoted officer's never previews. Every Board here was read on MY client
 * first (step 2), so the database already said I may read it. Blocks need
 * no test: a top-level Board post by an owner or admin is shown through
 * blocks (the officer exception), and nothing else is shown at all. Null
 * when the posters can't be read (fails closed); a preview read that fails
 * leaves every `latest` null, logged, and the list still stands.
 */
async function withPreviews(l: Listed): Promise<FollowedBoard[] | null> {
  const posters = await boardPostersOf(l.service, l.listed, TAG);
  if (!posters) return null;

  const orgOfRoom = new Map<string, string>();
  for (const orgId of l.listed) orgOfRoom.set(l.boardOf.get(orgId)!.id, orgId);
  const ids = Array.from(orgOfRoom.keys());
  const sharedWindow = () =>
    l.service
      .from("messages")
      .select(PREVIEW_SELECT)
      .in("channel_id", ids)
      .is("thread_root_id", null)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(ids.length * 5);
  const { data, error } = await readLatestPerRoom(
    l.service,
    { ids, per: 5, topLevelOnly: true, liveOnly: true, select: PREVIEW_SELECT, tag: LATEST_TAG, fallbackOnAnyError: true },
    sharedWindow,
  );
  if (error) console.error(`[${TAG} previews]`, error.code, error.message);
  const rows = (error ? [] : (data ?? [])) as unknown as PreviewRow[];
  // A deleted post (Oct 19, 2026) is not shown to a follower: their Board
  // leaves it out, so its preview does too (the post before it previews).
  const hidden = (row: PreviewRow): boolean => {
    const orgId = orgOfRoom.get(row.channel_id);
    return hasDeletedShape(row) || !isFollowerBoardPost(row, orgId ? posters.get(orgId) : undefined);
  };
  const latest = latestShownPerRoom(rows, hidden);

  return l.listed.map((orgId) => {
    const roomId = l.boardOf.get(orgId)!.id;
    const shown = latest.get(roomId) ?? null;
    // No author's name on a follower's list (PREVIEW_SELECT): "" always.
    return { org: l.orgOf.get(orgId)!, room_id: roomId, latest: shown ? { ...shown, author_name: "" } : null };
  });
}
