import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { blockedIdsFor } from "@/lib/chat/blocks";
import { eventRefsFor, type EventRow } from "@/lib/chat/event-refs";
import { chatV2For } from "@/lib/chat/flag-server";
import { readLatestPerRoom } from "@/lib/chat/latest-per-room";
import {
  firstPerClub,
  groupClubRooms,
  latestShownPerRoom,
  newestOf,
  notInList,
  orderInboxClubs,
  readSince,
  unreadLeftOut,
  type MembershipRow,
  type PreviewRow,
} from "@/lib/chat/reads";
import { BOARD_POSTER_ROLES, isClubRole } from "@/lib/chat/room-rules";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import { isHiddenFrom } from "@/lib/chat/stub";
import { refusalBody, type ClubRole, type InboxClub, type InboxResponse, type OrgRef, type Room } from "@/lib/chat/types";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

const TAG = "me/inbox";

/** The one-time "migration C is not in this database yet" line of the three per-room reads. */
const LATEST_TAG = `${TAG} chat_latest_per_channel`;

/** The viewer's own rows with their rooms (7.1.1); `kind` is dropped on a database without migration A. */
const MEMBERSHIP_COLUMNS = "channel_id, created_at, last_read_at, pinned_at, muted_until";

/**
 * The preview rows (7.1.4). `users!messages_user_id_fkey` is required:
 * `messages` has two foreign keys to `users` (`user_id`, `removed_by`) and a
 * bare embed answers `PGRST201`. `channel_id` tells the rooms apart in the
 * one read per kind.
 */
const PREVIEW_SELECT =
  "id, channel_id, content, created_at, user_id, kind, thread_root_id, users:users!messages_user_id_fkey(name)";

/** The service-role client for the counts, or null (said in the log) where the key is not set. Never throws. */
function serviceOrNull(): SupabaseClient | null {
  if (!isSupabaseServiceConfigured()) {
    console.error(`[${TAG}] service role not configured; counts and next_event at their empty values`);
    return null;
  }
  try {
    return createSupabaseServiceClient();
  } catch (err) {
    console.error(`[${TAG}]`, err instanceof Error ? err.message : err);
    return null;
  }
}

const requestFailed = () => NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });

/**
 * GET /api/me/inbox — the Messages home's club list
 * (handoffs/chat-redesign/wave-2-contracts.md 7.1), one `InboxClub` per
 * club the viewer holds a Board and a Lounge row on.
 *
 * The cookie client for anything RLS decides (the rooms, the club refs, the
 * roles, the block set, the previews); the service role for the counts and
 * the events only; never a roster. A failed cookie read that decides what
 * the viewer sees → 500; a failed count → its empty value, logged.
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

  // 1. My rooms (cookie): the thread list's read, with its no-`kind` retry.
  // A database without migration A has no rooms: `{ ok: true, clubs: [] }`.
  const readMemberships = (withKind: boolean) =>
    supabase
      .from("channel_members")
      .select(
        withKind
          ? `${MEMBERSHIP_COLUMNS}, channels!inner(id, org_id, kind, name)`
          : `${MEMBERSHIP_COLUMNS}, channels!inner(id, org_id, name)`,
      )
      .eq("user_id", user.id)
      .not("channels.org_id", "is", null);
  let { data: memberships, error: memErr } = await readMemberships(true);
  if (memErr && isMissingChatSchema(memErr)) {
    warnMissingChatSchemaOnce(TAG);
    ({ data: memberships, error: memErr } = await readMemberships(false));
    if (memErr) {
      console.error(`[${TAG} memberships]`, memErr.code, memErr.message);
      return requestFailed();
    }
    const none: InboxResponse = { ok: true, clubs: [] };
    return NextResponse.json(none);
  }
  if (memErr) {
    console.error(`[${TAG} memberships]`, memErr.code, memErr.message);
    return requestFailed();
  }
  const clubs = groupClubRooms((memberships ?? []) as unknown as MembershipRow[]);
  if (clubs.length === 0) {
    const none: InboxResponse = { ok: true, clubs: [] };
    return NextResponse.json(none);
  }
  const orgIds = clubs.map((club) => club.orgId);

  // 2. Club refs and my roles (cookie). Fails closed, as the thread list does:
  // a club without its ref or the viewer's role cannot be shown.
  const [orgsRes, rolesRes] = await Promise.all([
    supabase.from("orgs").select("id, handle, name, logo_url, banner_url, verified").in("id", orgIds),
    supabase.from("org_members").select("org_id, role").eq("user_id", user.id).in("org_id", orgIds),
  ]);
  if (orgsRes.error || rolesRes.error) {
    const err = orgsRes.error ?? rolesRes.error;
    console.error(`[${TAG} clubs]`, err?.code, err?.message);
    return requestFailed();
  }
  type OrgRow = { id: string; handle: string; name: string; logo_url: string | null; banner_url: string | null; verified: boolean | null };
  const orgById = new Map<string, OrgRef>();
  for (const o of (orgsRes.data ?? []) as unknown as OrgRow[]) {
    orgById.set(o.id, {
      id: o.id,
      handle: o.handle,
      name: o.name,
      logo_url: orgAssetProxyUrl(o.handle, o.logo_url, "logo"),
      banner_url: orgAssetProxyUrl(o.handle, o.banner_url, "banner"),
      verified: o.verified === true,
    });
  }
  const roleByOrg = new Map<string, ClubRole>();
  for (const m of (rolesRes.data ?? []) as unknown as { org_id: string; role: unknown }[]) {
    if (isClubRole(m.role)) roleByOrg.set(m.org_id, m.role);
  }

  // 3. The block set (cookie, 5.4), once for the request.
  const blocked = await blockedIdsFor(supabase, user.id);
  if (!blocked) return requestFailed();

  // The rooms behind the preview rows, for the rule of 8.2.
  const roomById = new Map<string, Room>();
  for (const club of clubs) {
    roomById.set(club.board.channel_id, { id: club.board.channel_id, kind: "board", name: club.board.channels?.name ?? "", org_id: club.orgId, event: null });
    roomById.set(club.lounge.channel_id, { id: club.lounge.channel_id, kind: "lounge", name: club.lounge.channels?.name ?? "", org_id: club.orgId, event: null });
  }

  // 4. Previews (cookie): two reads, one per room kind, the newest 5 rows of
  // EACH room through `chat_latest_per_channel` (S71 amendment 2), newest
  // first, top-level only and never a removed row (RLS shows an author their
  // own removed message; it is not a preview: 7.1.4, INT-ADJUDICATE-9). A
  // database without migration C reads today's window of `ids.length * 5`
  // rows shared by the rooms; so does a function that answers any other
  // error (`fallbackOnAnyError`: this select carries the `users` embed, and
  // an embed PostgREST refused on the function would otherwise blank every
  // preview of the Messages home). The thread list's pattern: when that
  // window fails too, those rooms have no preview, logged.
  const boardIds = clubs.map((club) => club.board.channel_id);
  const loungeIds = clubs.map((club) => club.lounge.channel_id);
  const readPreviews = async (ids: string[], what: string): Promise<PreviewRow[]> => {
    if (ids.length === 0) return [];
    const sharedWindow = () =>
      supabase
        .from("messages")
        .select(PREVIEW_SELECT)
        .in("channel_id", ids)
        .is("thread_root_id", null)
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .limit(ids.length * 5);
    const { data, error } = await readLatestPerRoom(
      supabase,
      { ids, per: 5, topLevelOnly: true, liveOnly: true, select: PREVIEW_SELECT, tag: LATEST_TAG, fallbackOnAnyError: true },
      sharedWindow,
    );
    if (error) {
      console.error(`[${TAG} ${what} previews]`, error.code, error.message);
      return [];
    }
    return (data ?? []) as unknown as PreviewRow[];
  };
  const [boardRows, loungeRows] = await Promise.all([readPreviews(boardIds, "board"), readPreviews(loungeIds, "lounge")]);

  const service = serviceOrNull();

  // The Board's officer exception (8.2, 8.3): a top-level Board row by a
  // blocked author who is a CURRENT owner / admin of the club still shows.
  // One service-role `org_members` read for everyone blocked, if any (the
  // unread counts below ask the same of authors no preview row shows); a
  // failed read keeps their rows hidden and out of the counts.
  const officerRole = new Map<string, ClubRole>();
  if (blocked.size > 0 && service) {
    const { data, error } = await service
      .from("org_members")
      .select("org_id, user_id, role")
      .in("user_id", Array.from(blocked))
      .in("org_id", orgIds);
    if (error) console.error(`[${TAG} officer roles]`, error.code, error.message);
    for (const row of (data ?? []) as { org_id: string; user_id: string; role: unknown }[]) {
      if (isClubRole(row.role)) officerRole.set(`${row.org_id}:${row.user_id}`, row.role);
    }
  }
  const hidden = (row: PreviewRow): boolean => {
    const room = roomById.get(row.channel_id) ?? null;
    const authorRole = room ? (officerRole.get(`${room.org_id}:${row.user_id}`) ?? null) : null;
    return isHiddenFrom({ user_id: row.user_id, thread_root_id: row.thread_root_id ?? null }, blocked, room, authorRole);
  };
  const boardLatest = latestShownPerRoom(boardRows, hidden);
  const loungeLatest = latestShownPerRoom(loungeRows, hidden);

  // 5. Unread (service role, counts): top-level, not removed, by others,
  // newer than my last_read_at (a null one reads as my row's created_at).
  // Never a message the viewer cannot see: an author blocked either way is
  // left out, but for a current owner / admin on their club's Board.
  const officersOf = (orgId: string): Set<string> => {
    const ids = new Set<string>();
    for (const id of blocked) {
      const role = officerRole.get(`${orgId}:${id}`);
      if (role && BOARD_POSTER_ROLES.includes(role)) ids.add(id);
    }
    return ids;
  };
  const unreadCount = async (channelId: string, since: string, kind: "board" | "lounge", orgId: string): Promise<number> => {
    if (!service) return 0;
    let query = service
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId)
      .is("thread_root_id", null)
      .is("removed_at", null)
      .neq("user_id", user.id)
      .gt("created_at", since);
    const leftOut = unreadLeftOut(blocked, kind, officersOf(orgId));
    if (leftOut.length > 0) query = query.not("user_id", "in", notInList(leftOut));
    const { count, error } = await query;
    if (error) {
      console.error(`[${TAG} unread]`, error.code, error.message);
      return 0;
    }
    return count ?? 0;
  };

  // 6. The clubs' events that have not ended (service role), soonest first,
  // `clubs.length * 10` of them; the first per club is its next event.
  const readEvents = async (): Promise<EventRow[]> => {
    if (!service) return [];
    const { data, error } = await service
      .from("events")
      .select("id, title, starts_at, ends_at, location, org_id")
      .in("org_id", orgIds)
      .gt("ends_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(clubs.length * 10);
    if (error) {
      console.error(`[${TAG} events]`, error.code, error.message);
      return [];
    }
    return (data ?? []) as EventRow[];
  };

  // 7. The event rooms I hold a row on (cookie): the newest top-level message
  // per room that is not removed, for `last_activity_at` (7.1.7). One row of
  // EACH room through `chat_latest_per_channel`; a database without
  // migration C reads today's window of `eventRoomIds.length * 3` rows.
  const eventRoomIds = clubs.flatMap((club) => club.eventRooms.map((row) => row.channel_id));
  const readEventActivity = async (): Promise<Map<string, string>> => {
    const newest = new Map<string, string>();
    if (eventRoomIds.length === 0) return newest;
    const select = "channel_id, created_at";
    const sharedWindow = () =>
      supabase
        .from("messages")
        .select(select)
        .in("channel_id", eventRoomIds)
        .is("thread_root_id", null)
        .is("removed_at", null)
        .order("created_at", { ascending: false })
        .limit(eventRoomIds.length * 3);
    const { data, error } = await readLatestPerRoom(
      supabase,
      { ids: eventRoomIds, per: 1, topLevelOnly: true, liveOnly: true, select, tag: LATEST_TAG },
      sharedWindow,
    );
    if (error) {
      console.error(`[${TAG} event rooms]`, error.code, error.message);
      return newest;
    }
    for (const row of (data ?? []) as { channel_id: string; created_at: string }[]) {
      if (!newest.has(row.channel_id)) newest.set(row.channel_id, row.created_at);
    }
    return newest;
  };

  // Steps 5, 6 and 7 do not depend on each other.
  const [boardUnread, loungeUnread, events, eventActivity] = await Promise.all([
    Promise.all(clubs.map((club) => unreadCount(club.board.channel_id, readSince(club.board), "board", club.orgId))),
    Promise.all(clubs.map((club) => unreadCount(club.lounge.channel_id, readSince(club.lounge), "lounge", club.orgId))),
    readEvents(),
    readEventActivity(),
  ]);
  const nextByClub = firstPerClub(events);
  const refs = nextByClub.size > 0 ? await eventRefsFor(Array.from(nextByClub.values()), user.id) : new Map();
  if (refs === null) console.error(`[${TAG} next_event] event refs could not be built; next_event null`);

  // 8, 9. Assemble, then order: pinned first (newest pin first), then
  // last_activity_at desc (nulls last), then the club's name.
  const out: InboxClub[] = [];
  clubs.forEach((club, i) => {
    const org = orgById.get(club.orgId);
    const role = roleByOrg.get(club.orgId);
    if (!org || !role) return;
    const board = { room_id: club.board.channel_id, latest: boardLatest.get(club.board.channel_id) ?? null, unread: boardUnread[i] > 0 };
    const lounge = { room_id: club.lounge.channel_id, latest: loungeLatest.get(club.lounge.channel_id) ?? null, unread_count: Math.min(loungeUnread[i], 99) };
    const next = nextByClub.get(club.orgId);
    const next_event = next && refs ? (refs.get(next.id) ?? null) : null;
    const last_activity_at = newestOf(
      board.latest?.created_at,
      lounge.latest?.created_at,
      ...club.eventRooms.map((row) => eventActivity.get(row.channel_id)),
    );
    out.push({
      org,
      viewer_role: role,
      board,
      lounge,
      next_event,
      last_activity_at,
      pinned_at: club.lounge.pinned_at,
      muted_until: club.lounge.muted_until,
    });
  });
  const body: InboxResponse = { ok: true, clubs: orderInboxClubs(out) };
  return NextResponse.json(body);
}
