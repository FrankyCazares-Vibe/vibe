import { NextResponse } from "next/server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { eventRefsFor, type EventRow } from "@/lib/chat/event-refs";
import { chatV2For } from "@/lib/chat/flag-server";
import { readChatMessages } from "@/lib/chat/message-read";
import {
  lastShown,
  orderSpaceRooms,
  readSince,
  recentShown,
  refOfRoom,
  spaceCanPost,
  type SpaceRoomWithPosition,
} from "@/lib/chat/reads";
import { canModerate, isClubRole, isPostPolicy, isRoomKind } from "@/lib/chat/room-rules";
import { roomState } from "@/lib/chat/room-state";
import { loadRoom, notePostPolicyColumnMissing, postPolicyColumnMissing } from "@/lib/chat/rooms";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import { refusalBody, type ChatMessage, type EventRef, type PostPolicy, type SpaceResponse } from "@/lib/chat/types";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

const TAG = "orgs/[slug]/space GET";

/** What `eventRefsFor` needs of an event (5.5). */
const EVENT_COLUMNS = "id, title, starts_at, ends_at, location, org_id";

/**
 * The rooms select (wave-3 contract 4.2), and the one from before
 * `channels.post_policy`: the code ships before the column, so a database
 * without it is read again with the second and every room is `everyone`.
 */
const ROOM_COLUMNS_WITH_POLICY = "id, kind, name, event_id, position, is_private, post_policy";
const ROOM_COLUMNS = "id, kind, name, event_id, position, is_private";

/** How many Board posts the desktop panel's Announcements shows (`?panel=1`). */
const BOARD_RECENT_MAX = 3;

/** A row of the cookie `channels` read (7.2.3); `post_policy` only when the select named it. */
type ChannelRow = {
  id: string;
  kind: unknown;
  name: string | null;
  event_id: string | null;
  position: number | null;
  is_private: unknown;
  post_policy?: unknown;
};

/** My `channel_members` row on a room, for the unread rule; no row → `unread: false`. */
type MyRow = { channel_id: string; last_read_at: string | null; created_at: string };

const loadFailed = () =>
  NextResponse.json({ ok: false, error: "Couldn't load this club.", code: "load_failed" }, { status: 500 });
const requestFailed = () => NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });

/** The club's events that have not ended (service role), soonest first; `[]` and one log line on a failure. */
async function readUpcoming(service: SupabaseClient, orgId: string, limit: number, what: string): Promise<EventRow[]> {
  const { data, error } = await service
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("org_id", orgId)
    .gt("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error(`[${TAG} ${what}]`, error.code, error.message);
    return [];
  }
  return (data ?? []) as EventRow[];
}

/** The events of the event rooms (service role); `[]` and one log line on a failure. */
async function readEventsById(service: SupabaseClient, ids: string[]): Promise<EventRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await service.from("events").select(EVENT_COLUMNS).in("id", ids);
  if (error) {
    console.error(`[${TAG} room events]`, error.code, error.message);
    return [];
  }
  return (data ?? []) as EventRow[];
}

/** The unread head count of 7.1.5 `> 0`; a failed count → false, logged. */
async function unreadIn(service: SupabaseClient, channelId: string, viewerId: string, since: string): Promise<boolean> {
  const { count, error } = await service
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("channel_id", channelId)
    .is("thread_root_id", null)
    .is("removed_at", null)
    .neq("user_id", viewerId)
    .gt("created_at", since);
  if (error) {
    console.error(`[${TAG} unread]`, error.code, error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * GET /api/orgs/[slug]/space — one club's space for the phone
 * (handoffs/chat-redesign/wave-2-contracts.md 7.2): the club, the viewer,
 * the room chips, the Board's latest post, the next three events, and with
 * `?events=1` the club's not-ended events for the Share-an-event sheet.
 *
 * Wave 3 (handoffs/chat-redesign/wave-3-desktop/contract.md 4.2): each room
 * carries `locked` and `post_policy`, `can_post` follows the room's rule,
 * and with `?panel=1` the answer gains `board_recent`, the desktop panel's
 * Announcements, cut from the Board page already read.
 *
 * The gate sweep is the channels list's, copied (`channels/route.ts:41-95`):
 * the org and the viewer's role load on the SERVICE client so a non-member
 * of a visible club gets 403 `members_only` and a hidden club answers 404 to
 * anyone outside it. The rooms read stays on the COOKIE client so
 * `can_view_org_channel` keeps Officers and the event rooms behind their
 * rules.
 */
export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }
  if (!(await chatV2For(user.id))) {
    return NextResponse.json(refusalBody("not_found"), { status: 404 });
  }

  const service = createSupabaseServiceClient();
  const { data: orgRow, error: orgError } = await service
    .from("orgs")
    .select("id, handle, name, logo_url, banner_url, verified, hidden_at")
    .eq("handle", slug)
    .maybeSingle();
  if (orgError) {
    console.error(`[${TAG}] org`, orgError.code, orgError.message);
    return loadFailed();
  }
  if (!orgRow) {
    return NextResponse.json(refusalBody("not_found"), { status: 404 });
  }
  const orgData = orgRow as unknown as {
    id: string;
    handle: string;
    name: string;
    logo_url: string | null;
    banner_url: string | null;
    verified: boolean | null;
    hidden_at: string | null;
  };

  const { data: membership, error: memberError } = await service
    .from("org_members")
    .select("role")
    .eq("org_id", orgData.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError) {
    console.error(`[${TAG}] membership`, memberError.code, memberError.message);
    return loadFailed();
  }
  const role = isClubRole(membership?.role) ? membership.role : null;
  if (!role) {
    return orgData.hidden_at
      ? NextResponse.json(refusalBody("not_found"), { status: 404 })
      : NextResponse.json(refusalBody("members_only"), { status: 403 });
  }
  const orgId = orgData.id;

  // 1. The club ref and its member count (service role; a failed count → 0).
  // 3. The rooms (cookie): RLS leaves out Officers unless I may enter it and
  //    event rooms I hold no row on unless I am an officer. The select names
  //    `post_policy` unless its absence is remembered; when it fails as
  //    missing schema it is asked ONCE more without the column.
  const readRooms = async (columns: string) => {
    const res = await supabase.from("channels").select(columns).eq("org_id", orgId).eq("type", "org_channel");
    return { data: res.data as unknown, error: res.error };
  };
  let hasPolicy = !postPolicyColumnMissing();
  const readRoomsOnce = async () => {
    const first = await readRooms(hasPolicy ? ROOM_COLUMNS_WITH_POLICY : ROOM_COLUMNS);
    if (!first.error || !hasPolicy || !isMissingChatSchema(first.error)) return first;
    notePostPolicyColumnMissing();
    hasPolicy = false;
    return readRooms(ROOM_COLUMNS);
  };
  const [memberCountRes, channelsRes] = await Promise.all([
    service.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", orgId),
    readRoomsOnce(),
  ]);
  if (memberCountRes.error) {
    console.error(`[${TAG} member count]`, memberCountRes.error.code, memberCountRes.error.message);
  }
  const org: SpaceResponse["org"] = {
    id: orgData.id,
    handle: orgData.handle,
    name: orgData.name,
    logo_url: orgAssetProxyUrl(orgData.handle, orgData.logo_url, "logo"),
    banner_url: orgAssetProxyUrl(orgData.handle, orgData.banner_url, "banner"),
    verified: orgData.verified === true,
    member_count: memberCountRes.error ? 0 : (memberCountRes.count ?? 0),
  };
  if (channelsRes.error) {
    // A gated route on a database without the schema answers 404 (1.3).
    if (isMissingChatSchema(channelsRes.error)) {
      warnMissingChatSchemaOnce(TAG);
      return NextResponse.json(refusalBody("not_found"), { status: 404 });
    }
    console.error(`[${TAG} rooms]`, channelsRes.error.code, channelsRes.error.message);
    return requestFailed();
  }
  const channels = ((channelsRes.data ?? []) as unknown as ChannelRow[]).filter((row) => isRoomKind(row.kind));
  const roomIds = channels.map((row) => row.id);
  const eventIds = channels.map((row) => row.event_id).filter((id): id is string => typeof id === "string");
  const board = channels.find((row) => row.kind === "board") ?? null;
  const query = new URL(req.url).searchParams;
  const wantsUpcoming = query.get("events") === "1";
  const wantsPanel = query.get("panel") === "1";
  // Each room's post rule: the column's value, `everyone` on a database
  // without it or for anything else it holds.
  const policyOf = (row: ChannelRow): PostPolicy =>
    hasPolicy && isPostPolicy(row.post_policy) ? row.post_policy : "everyone";
  const anyListed = channels.some((row) => policyOf(row) === "listed");

  // My rows on those rooms (cookie), the events behind the event rooms, the
  // next events, the Board room, and (only when some room's rule is
  // `listed`) the rooms whose by-name list I am on: none depends on another.
  const [myRowsRes, roomEvents, upNextRows, upcomingRows, boardRoom, listedRes] = await Promise.all([
    roomIds.length > 0
      ? supabase.from("channel_members").select("channel_id, last_read_at, created_at").in("channel_id", roomIds).eq("user_id", user.id)
      : Promise.resolve({ data: [] as MyRow[], error: null }),
    readEventsById(service, eventIds),
    readUpcoming(service, orgId, 3, "up_next"),
    wantsUpcoming ? readUpcoming(service, orgId, 50, "upcoming") : Promise.resolve([] as EventRow[]),
    board ? loadRoom(board.id) : Promise.resolve(null),
    anyListed
      ? supabase.from("org_channel_members").select("channel_id").eq("user_id", user.id).in("channel_id", roomIds)
      : Promise.resolve({ data: [] as { channel_id: string }[], error: null }),
  ]);
  if (myRowsRes.error) {
    console.error(`[${TAG} my rows]`, myRowsRes.error.code, myRowsRes.error.message);
  }
  const myRowByRoom = new Map<string, MyRow>();
  for (const row of (myRowsRes.data ?? []) as MyRow[]) myRowByRoom.set(row.channel_id, row);
  // A failed list read answers the closed side for a `listed` room (logged):
  // the thread read's `viewer.can_post` is the database's and wins on open.
  if (listedRes.error) {
    console.error(`[${TAG} listed rooms]`, listedRes.error.code, listedRes.error.message);
  }
  const listedRooms = new Set<string>();
  for (const row of (listedRes.data ?? []) as { channel_id: string }[]) listedRooms.add(row.channel_id);

  // 4. The Board's latest post: the page read of the thread GET, limit 6,
  // oldest first; the last message that is not hidden. No Board (the
  // after-deploy check lists such a club) → null, one log line.
  let boardLatest: ChatMessage | null = null;
  if (!board) {
    console.error(`[${TAG}] club ${orgId} has no board room; board_latest null`);
  } else if (!boardRoom) {
    return NextResponse.json(refusalBody("try_again"), { status: 503 });
  }

  // The unread counts (service role), the event refs (one call, counts on),
  // and the Board page.
  const [unreadFlags, refs, boardRead] = await Promise.all([
    Promise.all(
      channels.map((row) => {
        const mine = myRowByRoom.get(row.id);
        return mine ? unreadIn(service, row.id, user.id, readSince(mine)) : Promise.resolve(false);
      }),
    ),
    eventRefsFor([...roomEvents, ...upNextRows, ...upcomingRows], user.id),
    board && boardRoom
      ? readChatMessages(
          supabase,
          board.id,
          { limit: 6 },
          {
            viewerId: user.id,
            access: { ok: true, isOrgChannel: true, orgId, accepted_at: null, cleared_at: null, kind: "board", eventId: null },
            room: boardRoom,
          },
        )
      : Promise.resolve(null),
  ]);
  if (refs === null) console.error(`[${TAG}] event refs could not be built; rooms' events, up_next and upcoming empty`);
  // `board_recent` (`?panel=1`) is cut from the SAME page: no second read.
  let boardRecent: ChatMessage[] = [];
  if (boardRead) {
    if (!boardRead.ok) return NextResponse.json(boardRead.body, { status: boardRead.status });
    boardLatest = lastShown(boardRead.messages);
    boardRecent = recentShown(boardRead.messages, BOARD_RECENT_MAX);
  }

  // An event room's state and start: from its `EventRef`; when the refs
  // could not be built, from the event row read above (`roomState` is pure),
  // so a room whose event is over is still left out and `can_post` false.
  const now = new Date();
  const eventById = new Map(roomEvents.map((ev) => [ev.id, ev]));
  const rooms: SpaceRoomWithPosition[] = channels.map((row, i) => {
    const kind = row.kind as SpaceRoomWithPosition["kind"];
    const event = kind === "event" ? refOfRoom(row.event_id, refs) : null;
    const known = kind === "event" && row.event_id !== null ? (eventById.get(row.event_id) ?? null) : null;
    const state = event?.state ?? (known ? roomState(known.starts_at, known.ends_at, now) : null);
    const policy = policyOf(row);
    return {
      id: row.id,
      kind,
      name: typeof row.name === "string" ? row.name : "",
      unread: unreadFlags[i],
      can_post: spaceCanPost(kind, role, state, policy, listedRooms.has(row.id)),
      event,
      locked: row.is_private === true,
      post_policy: policy,
      position: typeof row.position === "number" ? row.position : null,
      state,
      starts_at: event?.starts_at ?? known?.starts_at ?? null,
    };
  });
  const refsOf = (list: EventRow[]): EventRef[] =>
    refs ? list.map((row) => refs.get(row.id)).filter((ref): ref is EventRef => ref !== undefined) : [];

  const body: SpaceResponse = {
    ok: true,
    org,
    viewer: { role, can_moderate: canModerate(role) },
    rooms: orderSpaceRooms(rooms),
    board_latest: boardLatest,
    up_next: refsOf(upNextRows),
  };
  if (wantsUpcoming) body.upcoming = refsOf(upcomingRows);
  if (wantsPanel) body.board_recent = boardRecent;
  return NextResponse.json(body);
}
