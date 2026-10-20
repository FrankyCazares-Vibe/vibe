import { NextResponse } from "next/server";

import { DELETED_LINE, hasDeletedShape } from "@/lib/chat/deleted-note";
import { readLatestPerRoom } from "@/lib/chat/latest-per-room";
import { BOARD_POSTER_ROLES, clubRoomLabel, isClubRole, isRoomKind } from "@/lib/chat/room-rules";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import type { ClubRole, OrgRef, RoomKind, ThreadEntryRoomFields } from "@/lib/chat/types";
import { getFollowState } from "@/lib/connections/queries";
import {
  GROUP_CREATE_REFUSED,
  MAX_GROUP_MEMBERS,
  groupSizeAllowed,
} from "@/lib/messages/group-rules";
import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { checkText } from "@/lib/moderation/text-filter";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { isUuid } from "@/lib/pgrest";
import { GROUP_PHOTO_KEY_PREFIX, isR2Configured, signGroupPhotoGetUrl } from "@/lib/r2";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { loadHiddenUsers } from "@/lib/safety/hidden-users";
import { loadGroupBlockConflict } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type CreateBody = {
  /** 1:1 DM by target user id. */
  target_id?: unknown;
  /** 1:1 DM by target handle. */
  handle?: unknown;
  /** Set to "group" to create a group chat instead of a DM. */
  type?: unknown;
  /** Optional group name. */
  name?: unknown;
  /** Group members — array of user handles or ids. Min 2, max 49 (plus viewer = 50). */
  members?: unknown;
};

/**
 * The other person in a 1:1 thread. No `bio` (S67 security wave 2, A2): the
 * inbox subtitle is the school, else blank (waveA-build.md product call 2),
 * and A1's migration takes `bio` away from the data API, so a cookie-client
 * embed naming it would fail the whole inbox. The group cap
 * (MAX_GROUP_MEMBERS) lives in src/lib/messages/group-rules.ts, shared with
 * the add route.
 */
type ThreadPeer = {
  id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  school: string | null;
};

/** Lightweight member info for group threads (avatars + names + role for the row). */
type ThreadMember = {
  id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  role: "admin" | "member";
};

type ThreadEntry = {
  id: string;
  type: "dm" | "group" | "org_channel" | "org_subchannel";
  name: string;
  /** Group photo (R2 object key) — null for 1:1 dms or unset groups. */
  photo_url: string | null;
  peer: ThreadPeer | null;
  /** All non-viewer members for groups (empty for 1:1). */
  members: ThreadMember[];
  /** media_kind / attachment_kind let a photo-only message preview as "Photo". */
  last_message: {
    content: string;
    created_at: string;
    user_id: string;
    media_kind: "image" | "video" | null;
    attachment_kind: "post" | "clip" | null;
    /** Its sender deleted it (Oct 19, 2026): `content` is "Message deleted"; the row draws it like the note. */
    deleted?: true;
  } | null;
  unread: boolean;
  accepted_at: string | null;
  is_request: boolean;
  /** Peer's last_read_at — used to render "Read" receipts on sent 1:1 messages. */
  peer_last_read_at: string | null;
  /** Pinned at this timestamp (null = not pinned). Pinned threads sort first. */
  pinned_at: string | null;
  /** Viewer's role in this channel (admin/member) — drives kick affordance. */
  viewer_role: "admin" | "member";
  /** Muted until this timestamp (null = not muted). Drives unread-badge silence. */
  muted_until: string | null;
} & Partial<ThreadEntryRoomFields>;
// The three club-room fields (`org`, `room_kind`, `can_post`) are on club
// rooms only, and only on a database that has the chat rooms schema
// (contract 6.4 and 3.10). A dm or a group never carries them.

async function resolveTargetId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  body: CreateBody,
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  if (typeof body.target_id === "string" && body.target_id.length > 0) {
    return { ok: true, id: body.target_id };
  }
  if (typeof body.handle === "string" && body.handle.length > 0) {
    const handle = body.handle.trim().toLowerCase();
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .eq("handle", handle)
      .maybeSingle();
    if (error) {
      console.error("[threads.resolveTargetId]", error);
      return { ok: false, status: 500, error: "Lookup failed" };
    }
    if (!data?.id) return { ok: false, status: 404, error: "User not found" };
    return { ok: true, id: data.id as string };
  }
  return { ok: false, status: 400, error: "Missing target_id or handle" };
}

/**
 * Find an existing 1:1 DM channel between viewer and target, if any.
 * If multiple exist (legacy RLS-recursion duplicates), returns the one with
 * the most recent message — same selection rule as the GET dedupe, so the
 * id POST returns and the id the UI sees in its thread list always agree.
 */
async function findExistingDm(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  viewerId: string,
  targetId: string,
): Promise<string | null> {
  const { data: viewerRows, error: viewerErr } = await supabase
    .from("channel_members")
    .select("channel_id, channels!inner(type)")
    .eq("user_id", viewerId)
    .eq("channels.type", "dm");

  if (viewerErr) {
    console.error("[threads.findExistingDm viewer]", viewerErr);
    return null;
  }
  const ids = (viewerRows ?? []).map((r) => r.channel_id as string);
  if (ids.length === 0) return null;

  const { data: hits, error: hitsErr } = await supabase
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", targetId)
    .in("channel_id", ids);

  if (hitsErr) {
    console.error("[threads.findExistingDm hits]", hitsErr);
    return null;
  }
  const candidates = (hits ?? []).map((h) => h.channel_id as string);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  // Multiple matches → pick the channel with the latest message. Falls back
  // to any candidate if none have messages yet.
  const { data: latest } = await supabase
    .from("messages")
    .select("channel_id, created_at")
    .in("channel_id", candidates)
    .order("created_at", { ascending: false })
    .limit(1);
  return (latest?.[0]?.channel_id as string | undefined) ?? candidates[0]!;
}

/**
 * Resolve a list of mixed handles/ids into a deduped set of user ids.
 * Used for group-chat creation.
 */
async function resolveMembers(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  raw: unknown,
): Promise<{ ok: true; ids: string[] } | { ok: false; status: number; error: string }> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, status: 400, error: "members must be a non-empty array" };
  }
  const ids = new Set<string>();
  const handles = new Set<string>();
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    // A strict uuid in lower case, so one person can't be listed twice in two
    // spellings (a duplicate member row) and every id is safe for the block
    // filter; anything else is looked up as a handle.
    const lower = t.toLowerCase();
    if (isUuid(t)) ids.add(lower);
    else handles.add(lower);
  }
  if (handles.size > 0) {
    const { data, error } = await supabase
      .from("users")
      .select("id, handle")
      .in("handle", Array.from(handles));
    if (error) {
      console.error("[threads.resolveMembers handles]", error);
      return { ok: false, status: 500, error: "Member lookup failed" };
    }
    for (const u of data ?? []) ids.add(u.id as string);
  }
  if (ids.size === 0) {
    return { ok: false, status: 404, error: "No valid members" };
  }
  return { ok: true, ids: Array.from(ids) };
}

/**
 * POST: create or find a thread.
 * - Default: 1:1 DM, idempotent — returns existing channel id if one exists.
 *   Acceptance rule: if viewer and target are mutually connected, both
 *   members are auto-accepted. Otherwise target lands in their "requests"
 *   tab until they accept or reply.
 * - With `{ type: "group", name?, members: [handles_or_ids] }`: creates a
 *   new group channel with the viewer as admin and listed users as members.
 *   All group members are auto-accepted on creation. No find-or-reuse —
 *   each call creates a fresh group.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`thread-create:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  // Starting a DM or a group chat is a publishing surface: Terms, a verified
  // school email, no restriction in force. It sits where the Terms gate sat,
  // after the limiter. Reading threads (GET) is untouched — a student who
  // can't start a new chat can still read the ones they are in.
  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // ── Group creation path ─────────────────────────────────────────────
  if (body.type === "group") {
    const resolved = await resolveMembers(supabase, body.members);
    if (!resolved.ok) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
    }
    const memberIds = resolved.ids.filter((id) => id !== user.id);
    if (memberIds.length < 2) {
      return NextResponse.json(
        { ok: false, error: "Group chats need at least 2 other people" },
        { status: 400 },
      );
    }
    if (!groupSizeAllowed(memberIds.length)) {
      return NextResponse.json(
        { ok: false, error: `Max ${MAX_GROUP_MEMBERS} members per group` },
        { status: 400 },
      );
    }
    // Same rule as adding someone to an existing group: you can only pull
    // people you're mutually connected with into a chat. Without this,
    // group creation was a way to bypass the 1:1 message-request inbox.
    const states = await Promise.all(
      memberIds.map((id) => getFollowState(supabase, user.id, id)),
    );
    const notConnected = memberIds.filter((_, i) => states[i] !== "connected");
    if (notConnected.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "You can only add people you're connected with",
          not_connected: notConnected,
        },
        { status: 403 },
      );
    }
    const groupName =
      typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    // Everyone pulled into the chat sees this name in their inbox, and they
    // didn't choose to be there — so it is held to the same filter as the
    // messages inside it.
    if (groupName && !checkText(groupName).ok) return contentBlockedResponse("name");

    // Nobody in a block pair with anyone else in the new chat, either way,
    // the creator included (S67 A2; group-rules.ts). One block inside a group
    // stops both people in it from sending (messages_insert_member). SERVICE
    // client: the pairs between two invitees are invisible to the creator's
    // own client (loadGroupBlockConflict explains). The copy names nobody.
    const admin = createSupabaseServiceClient();
    const conflict = await loadGroupBlockConflict(admin, memberIds, [user.id]);
    if (!conflict.ok) {
      console.error("[threads.POST group block-check]", conflict.error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    if (conflict.blocked) {
      return NextResponse.json({ ok: false, error: GROUP_CREATE_REFUSED }, { status: 403 });
    }

    const { data: chan, error: chanErr } = await admin
      .from("channels")
      .insert({ type: "group", name: groupName })
      .select("id")
      .single();
    if (chanErr || !chan) {
      console.error("[threads.POST group channel]", chanErr);
      return NextResponse.json(
        { ok: false, error: "Channel create failed" },
        { status: 500 },
      );
    }

    const now = new Date().toISOString();
    const rows = [
      { channel_id: chan.id, user_id: user.id, role: "admin", accepted_at: now },
      ...memberIds.map((id) => ({
        channel_id: chan.id as string,
        user_id: id,
        role: "member",
        accepted_at: now,
      })),
    ];
    const { error: membersErr } = await admin.from("channel_members").insert(rows);
    if (membersErr) {
      console.error("[threads.POST group members]", membersErr);
      await admin.from("channels").delete().eq("id", chan.id);
      return NextResponse.json(
        { ok: false, error: "Membership create failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      channel_id: chan.id as string,
      created: true,
      type: "group",
    });
  }

  // ── 1:1 DM path (default) ───────────────────────────────────────────
  const target = await resolveTargetId(supabase, body);
  if (!target.ok) {
    return NextResponse.json({ ok: false, error: target.error }, { status: target.status });
  }
  if (target.id === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot DM yourself" }, { status: 400 });
  }

  const existing = await findExistingDm(supabase, user.id, target.id);
  if (existing) {
    // Re-engaging an existing DM should always re-surface it in the inbox.
    // If the viewer previously hid this thread (Delete conversation, or as
    // a side-effect of blocking), they're explicitly trying to open it now,
    // so clear `hidden_at`. Best-effort; non-fatal.
    try {
      await supabase
        .from("channel_members")
        .update({ hidden_at: null })
        .eq("channel_id", existing)
        .eq("user_id", user.id);
    } catch (e) {
      console.error("[threads.POST unhide existing]", e);
    }
    return NextResponse.json({ ok: true, channel_id: existing, created: false });
  }

  const state = await getFollowState(supabase, user.id, target.id);
  const targetAccepted = state === "connected" ? new Date().toISOString() : null;

  const admin = createSupabaseServiceClient();
  const { data: chan, error: chanErr } = await admin
    .from("channels")
    .insert({ type: "dm", name: "" })
    .select("id")
    .single();

  if (chanErr || !chan) {
    console.error("[threads.POST channel]", chanErr);
    return NextResponse.json({ ok: false, error: "Channel create failed" }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: membersErr } = await admin.from("channel_members").insert([
    { channel_id: chan.id, user_id: user.id, role: "admin", accepted_at: now },
    { channel_id: chan.id, user_id: target.id, role: "member", accepted_at: targetAccepted },
  ]);

  if (membersErr) {
    console.error("[threads.POST members]", membersErr);
    await admin.from("channels").delete().eq("id", chan.id);
    return NextResponse.json({ ok: false, error: "Membership create failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, channel_id: chan.id as string, created: true });
}

/**
 * GET: list the viewer's threads + pending requests.
 * Each entry includes peer info (for 1:1), last message, and unread flag.
 *
 * Club rooms (chat rooms, wave 1, contract 6.4):
 *   - `?scope=chats` lists dms and groups only, and still `requests`.
 *   - With no param: event rooms are left out; a club room's `name` is
 *     "<club> · <Board | Lounge | Officers | the room's name>"; its preview
 *     ignores replies under a Board post; it carries `org`, `room_kind` and
 *     `can_post`.
 *   - A club room is never a message request, whatever `accepted_at` says.
 * On a database without the chat rooms schema the answer is today's: club
 * rooms keep their plain name and carry none of the three fields (3.10).
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const chatsOnly = new URL(req.url).searchParams.get("scope") === "chats";

  // All channels the viewer is a member of (incl. pending requests).
  // pinned_at, hidden_at, photo_url are selected separately below so any
  // missing-column situation (migration not yet applied) can't take the
  // whole route down. accepted_at/last_read_at landed in the first DM
  // migration; if those are missing, DMs aren't usable at all anyway.
  //
  // `kind` rides on the same read. A database without the column answers the
  // read again without it (`roomsReady` false): today's list.
  const readMemberships = (withKind: boolean) =>
    supabase
      .from("channel_members")
      .select(
        withKind
          ? "channel_id, accepted_at, last_read_at, role, channels!inner(id, type, name, org_id, kind)"
          : "channel_id, accepted_at, last_read_at, role, channels!inner(id, type, name, org_id)",
      )
      .eq("user_id", user.id);
  let roomsReady = true;
  let { data: myMemberships, error: memErr } = await readMemberships(true);
  if (memErr && isMissingChatSchema(memErr)) {
    warnMissingChatSchemaOnce("threads.GET");
    roomsReady = false;
    ({ data: myMemberships, error: memErr } = await readMemberships(false));
  }

  if (memErr) {
    console.error("[threads.GET memberships]", memErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  type Membership = {
    channel_id: string;
    accepted_at: string | null;
    last_read_at: string | null;
    hidden_at: string | null;
    pinned_at: string | null;
    muted_until: string | null;
    role: "admin" | "member";
    channels: {
      id: string;
      type: ThreadEntry["type"];
      name: string;
      /** Set on a club's room, null on a dm or a group. */
      org_id?: string | null;
      /** `channels.kind`; absent on a database without the column. */
      kind?: unknown;
    };
  };
  /** A club's room: it belongs to a club. A dm or a group never does. */
  const isClubRoom = (r: Membership): boolean =>
    (typeof r.channels.org_id === "string" && r.channels.org_id !== "") ||
    r.channels.type === "org_channel" ||
    r.channels.type === "org_subchannel";
  const rows: Membership[] = ((myMemberships ?? []) as unknown as Membership[])
    .map((r) => ({ ...r, hidden_at: null, pinned_at: null, muted_until: null }))
    // `?scope=chats`: dms and groups only. Otherwise every thread but the
    // event chats, which the old screens never list. Dropped here, before
    // any other read, so neither their rosters nor their messages are loaded.
    .filter((r) => (chatsOnly ? !isClubRoom(r) : r.channels.kind !== "event"));
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, threads: [], requests: [] });
  }

  const channelIds = rows.map((r) => r.channel_id);

  // Club rooms: the club behind each room and the viewer's role in it. One
  // read each for all the viewer's clubs, on the viewer's own client (a
  // member reads their club and their own membership rows). Soft-fail: a
  // read that fails leaves the rooms with today's plain entries.
  const orgById = new Map<string, OrgRef>();
  const roleByOrg = new Map<string, ClubRole>();
  const clubIds = Array.from(
    new Set(
      rows
        .filter((r) => roomsReady && isClubRoom(r) && isRoomKind(r.channels.kind))
        .map((r) => r.channels.org_id)
        .filter((id): id is string => typeof id === "string" && id !== ""),
    ),
  );
  if (clubIds.length > 0) {
    const [orgsRes, rolesRes] = await Promise.all([
      supabase.from("orgs").select("id, handle, name, logo_url, banner_url, verified").in("id", clubIds),
      supabase.from("org_members").select("org_id, role").eq("user_id", user.id).in("org_id", clubIds),
    ]);
    // Fails closed, like the co-member and hidden-user reads below: a club
    // room without its club would go out under its bare name with none of
    // its fields, and a Board without the viewer's role would tell an officer
    // they may not post there (the share pickers drop such rows).
    if (orgsRes.error || rolesRes.error) {
      console.error("[threads.GET clubs]", orgsRes.error ?? rolesRes.error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    type OrgRow = {
      id: string;
      handle: string;
      name: string;
      logo_url: string | null;
      banner_url: string | null;
      verified: boolean | null;
    };
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
    for (const m of (rolesRes.data ?? []) as unknown as { org_id: string; role: unknown }[]) {
      if (isClubRole(m.role)) roleByOrg.set(m.org_id, m.role);
    }
  }

  // Optional columns fetched separately so a migration-lag situation
  // (column missing) doesn't take the whole route down.
  const photoByChannel = new Map<string, string | null>();
  try {
    const { data: photoRows } = await supabase
      .from("channels")
      .select("id, photo_url")
      .in("id", channelIds);
    for (const p of photoRows ?? []) {
      photoByChannel.set(p.id as string, (p.photo_url as string | null) ?? null);
    }
  } catch {
    /* channels.photo_url may not exist yet; treat all photos as null. */
  }
  try {
    const { data: extraRows } = await supabase
      .from("channel_members")
      .select("channel_id, hidden_at, pinned_at, muted_until")
      .eq("user_id", user.id)
      .in("channel_id", channelIds);
    type Extra = { hidden_at: string | null; pinned_at: string | null; muted_until: string | null };
    const byChannel = new Map<string, Extra>();
    for (const e of extraRows ?? []) {
      byChannel.set(e.channel_id as string, {
        hidden_at: (e.hidden_at as string | null) ?? null,
        pinned_at: (e.pinned_at as string | null) ?? null,
        muted_until: (e.muted_until as string | null) ?? null,
      });
    }
    for (const r of rows) {
      const extra = byChannel.get(r.channel_id);
      if (extra) {
        r.hidden_at = extra.hidden_at;
        r.pinned_at = extra.pinned_at;
        r.muted_until = extra.muted_until;
      }
    }
  } catch {
    /* hidden_at/pinned_at/muted_until columns may not exist yet; stay null. */
  }

  // Other members for peer hydration (1:1 dm peer = the non-viewer member)
  // and peer last_read_at for "Read" receipts.
  const { data: otherMembers, error: othersErr } = await supabase
    .from("channel_members")
    .select(
      "channel_id, user_id, last_read_at, role, users:users!channel_members_user_id_fkey(id, handle, name, avatar_url, school)",
    )
    .in("channel_id", channelIds)
    .neq("user_id", user.id);

  if (othersErr) {
    console.error("[threads.GET others]", othersErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  type OtherRow = {
    channel_id: string;
    user_id: string;
    last_read_at: string | null;
    role: "admin" | "member";
    users: ThreadPeer | null;
  };
  const peerByChannel = new Map<string, ThreadPeer>();
  const membersByChannel = new Map<string, ThreadMember[]>();
  const peerLastReadByChannel = new Map<string, string | null>();
  for (const o of (otherMembers ?? []) as unknown as OtherRow[]) {
    if (o.users && !peerByChannel.has(o.channel_id)) {
      peerByChannel.set(o.channel_id, o.users);
    }
    if (o.users) {
      const arr = membersByChannel.get(o.channel_id) ?? [];
      arr.push({
        id: o.users.id,
        handle: o.users.handle,
        name: o.users.name,
        avatar_url: o.users.avatar_url,
        role: o.role,
      });
      membersByChannel.set(o.channel_id, arr);
    }
    // For 1:1 dms there's exactly one other member so first-write-wins is
    // fine; for groups we'd need a per-message-author check but read
    // receipts are intentionally not surfaced for groups in v1.
    if (!peerLastReadByChannel.has(o.channel_id)) {
      peerLastReadByChannel.set(o.channel_id, o.last_read_at ?? null);
    }
  }

  // Last message per channel — fetch all candidates and reduce client-side
  // (cheap for v1; revisit if a user has many active threads).
  // media_kind / attachment_kind let a photo-only last message preview as
  // "Photo" instead of a blank line. This read is soft-fail, but the
  // phantom-request guard below needs `last`: with no last message, every
  // pending thread is hidden. So if the wider select ever errors, retry with
  // the base columns rather than lose every preview and every request.
  //
  // A reply under a Board post is never a room's preview (`thread_root_id is
  // null`): it would put a member's reply where the officers' post belongs
  // and flip `unread`. A dm or a group has no replies of that kind, so the
  // filter changes nothing for them. On a database without the column the
  // read is repeated without the filter: today's previews.
  //
  // The newest 5 rows of EACH channel, through `chat_latest_per_channel`
  // (S71 amendment 2; src/lib/chat/latest-per-room.ts), on the viewer's own
  // client: one busy channel can no longer push another channel's last
  // message out (no preview, no unread, a request dropped, a hidden dm not
  // coming back). Two reads still, the dms and groups and the club rooms, so
  // a database without migration C falls back to today's two shared windows
  // of `ids.length * 5` rows, where a dm competes only with dms and groups.
  type LastMsgRow = {
    channel_id: string;
    content: string;
    created_at: string;
    user_id: string;
    // Absent from the fallback select; check-constrained to these values.
    media_kind?: "image" | "video" | null;
    attachment_kind?: "post" | "clip" | null;
  };
  const readLastMessages = async (ids: string[]): Promise<LastMsgRow[]> => {
    if (ids.length === 0) return [];
    // Today's read, unchanged: the fallback for a database without migration C.
    const sharedWindow = (select: string, topLevelOnly: boolean) => {
      const q = supabase.from("messages").select(select).in("channel_id", ids);
      return (topLevelOnly ? q.is("thread_root_id", null) : q)
        .order("created_at", { ascending: false })
        .limit(ids.length * 5);
    };
    const query = (select: string, topLevelOnly: boolean) =>
      readLatestPerRoom(
        supabase,
        { ids, per: 5, topLevelOnly, liveOnly: false, select, tag: "threads.GET lastMsgs chat_latest_per_channel" },
        () => sharedWindow(select, topLevelOnly),
      );
    const wide = "channel_id, content, created_at, user_id, media_kind, attachment_kind";
    let topLevelOnly = roomsReady;
    let { data, error } = await query(wide, topLevelOnly);
    if (error && topLevelOnly && isMissingChatSchema(error)) {
      warnMissingChatSchemaOnce("threads.GET lastMsgs");
      topLevelOnly = false;
      ({ data, error } = await query(wide, topLevelOnly));
    }
    if (error) {
      console.error("[threads.GET lastMsgs]", error);
      ({ data, error } = await query("channel_id, content, created_at, user_id", topLevelOnly));
      if (error) {
        console.error("[threads.GET lastMsgs fallback]", error);
        // Soft-fail: still render the list without previews.
        return [];
      }
    }
    return (data ?? []) as unknown as LastMsgRow[];
  };
  const clubRoomIds = new Set(rows.filter(isClubRoom).map((r) => r.channel_id));
  const [chatLast, roomLast] = await Promise.all([
    readLastMessages(channelIds.filter((id) => !clubRoomIds.has(id))),
    readLastMessages(channelIds.filter((id) => clubRoomIds.has(id))),
  ]);
  const lastMsgs = [...chatLast, ...roomLast];

  // Block filter: hide any 1:1 thread where the peer is blocked-either-way.
  // Through the shared helper, and failing closed like /api/feed and
  // /api/me/notifications: this used to read `blocks` itself and keep only
  // `data`, so a failed query left the filter empty and listed chats with
  // blocked people as if nothing were wrong — a failure served as data.
  // Mutes are deliberately not used here: muting someone silences their
  // posts and notifications, it doesn't hide the conversation you have.
  const hiddenRes = await loadHiddenUsers(supabase, user.id);
  if (!hiddenRes.ok) {
    console.error("[me/threads GET] hidden users", hiddenRes.error);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const blockedPeerIds = hiddenRes.hidden.blocked;

  // A club room's preview is the newest row of its 5-row window by someone
  // the viewer is not in a block pair with (wave-2 contract 12.4, 8.3): the
  // thread stubs those rows, so the list never previews what the thread
  // hides. No Board exception here (this list reads no roles; the officer's
  // post still opens in the thread). None visible in the window: no preview
  // ("No messages yet"). A dm or a group is untouched.
  const lastByChannel = new Map<string, ThreadEntry["last_message"]>();
  for (const m of lastMsgs) {
    const cid = m.channel_id as string;
    if (clubRoomIds.has(cid) && blockedPeerIds.has(m.user_id as string)) continue;
    if (!lastByChannel.has(cid)) {
      // A message its sender deleted (Oct 19, 2026) previews as the note
      // the thread shows in its place, not as "Attachment", flagged so the
      // row draws it quietly (review of Oct 19, 2026). Only on the wide
      // read: the fallback select has no media columns, and a photo with no
      // caption must not read as deleted there.
      const deleted = "media_kind" in m && hasDeletedShape(m);
      lastByChannel.set(cid, {
        content: deleted ? DELETED_LINE : (m.content as string),
        created_at: m.created_at as string,
        user_id: m.user_id as string,
        media_kind: m.media_kind ?? null,
        attachment_kind: m.attachment_kind ?? null,
        ...(deleted ? { deleted: true as const } : {}),
      });
    }
  }

  const threads: ThreadEntry[] = [];
  const requests: ThreadEntry[] = [];

  for (const r of rows) {
    const last = lastByChannel.get(r.channel_id) ?? null;
    const peer = peerByChannel.get(r.channel_id) ?? null;

    // Block filter: hide 1:1 dms where the peer is blocked-either-way.
    // Groups stay visible (per-message filtering is a future polish).
    if (
      r.channels.type === "dm" &&
      peer &&
      blockedPeerIds.has(peer.id)
    ) {
      continue;
    }

    // Phantom-request guard: a real "request" is an inbound DM from a
    // non-connection. A pending row with NO inbound message at all is
    // legacy noise (the pre-RLS-fix duplicate-channel bug created stub
    // channels where the viewer was added with accepted_at = NULL but
    // no message ever followed). Hide those.
    //
    // A club's room is never a request, whatever `accepted_at` says (a
    // member can null their own through the data API): it is listed as the
    // room it is, with or without messages.
    const clubRoom = isClubRoom(r);
    const isRequestState = r.accepted_at === null && !clubRoom;
    if (isRequestState) {
      const hasInbound = !!last && last.user_id !== user.id;
      if (!hasInbound) continue;
    }

    // Soft-hide: skip threads the viewer hid, UNLESS a new message has
    // arrived since they hid it (Instagram-style un-hide on activity).
    if (r.hidden_at) {
      const reactivated =
        last && new Date(last.created_at) > new Date(r.hidden_at);
      if (!reactivated) continue;
    }

    const unread =
      !!last &&
      last.user_id !== user.id &&
      (!r.last_read_at || new Date(last.created_at) > new Date(r.last_read_at));

    const members = membersByChannel.get(r.channel_id) ?? [];
    // Group display name: explicit channel.name → first 3 member first-names
    // joined → "Group chat" as a last resort.
    let displayName = r.channels.name?.trim() || "";
    if (!displayName) {
      if (r.channels.type === "dm") {
        displayName = peer?.name || "";
      } else {
        const firstNames = members
          .slice(0, 3)
          .map((m) => (m.name?.split(/\s+/)[0] ?? m.handle ?? "").trim())
          .filter(Boolean);
        displayName = firstNames.length > 0 ? firstNames.join(", ") : "Group chat";
      }
    }

    // A club's room goes by its club: "Salsa Club · Lounge". Every old list
    // then shows a usable label with no change of its own. Only with the
    // chat rooms schema and a club the viewer can read; otherwise the entry
    // stays today's.
    let roomFields: ThreadEntryRoomFields | null = null;
    const roomKind: RoomKind | null =
      roomsReady && clubRoom && isRoomKind(r.channels.kind) ? r.channels.kind : null;
    const org = roomKind && r.channels.org_id ? orgById.get(r.channels.org_id) ?? null : null;
    if (roomKind && org) {
      displayName = clubRoomLabel(org.name, roomKind, r.channels.name ?? "");
      const role = roleByOrg.get(org.id) ?? null;
      roomFields = {
        org,
        room_kind: roomKind,
        // A new top-level message. On a Board that is the officers' alone;
        // the database decides again at the send.
        can_post: roomKind === "board" ? role !== null && BOARD_POSTER_ROLES.includes(role) : true,
      };
    }

    const entry: ThreadEntry = {
      id: r.channel_id,
      type: r.channels.type,
      name: displayName,
      photo_url: photoByChannel.get(r.channel_id) ?? null,
      peer,
      members: r.channels.type === "dm" ? [] : members,
      last_message: last,
      unread,
      accepted_at: r.accepted_at,
      is_request: isRequestState,
      peer_last_read_at: peerLastReadByChannel.get(r.channel_id) ?? null,
      pinned_at: r.pinned_at,
      viewer_role: r.role,
      muted_until: r.muted_until,
      ...(roomFields ?? {}),
    };

    if (entry.is_request) requests.push(entry);
    else threads.push(entry);
  }

  // Sort: pinned first (newest pin at the top of the pinned bucket), then
  // by last-message recency. 1:1 DMs are deduped by peer id (legacy
  // duplicates from the RLS-recursion bug); groups are keyed by channel id.
  const cmp = (a: ThreadEntry, b: ThreadEntry) => {
    const aPin = a.pinned_at ?? "";
    const bPin = b.pinned_at ?? "";
    if (aPin && !bPin) return -1;
    if (!aPin && bPin) return 1;
    if (aPin && bPin && aPin !== bPin) return bPin.localeCompare(aPin);
    const at = a.last_message?.created_at ?? "";
    const bt = b.last_message?.created_at ?? "";
    return bt.localeCompare(at);
  };
  const dedupeAndSort = (entries: ThreadEntry[]): ThreadEntry[] => {
    const seen = new Map<string, ThreadEntry>();
    const result: ThreadEntry[] = [];
    for (const e of [...entries].sort(cmp)) {
      const key = e.type === "dm" && e.peer?.id ? e.peer.id : e.id;
      if (seen.has(key)) continue;
      seen.set(key, e);
      result.push(e);
    }
    return result;
  };

  const finalThreads = dedupeAndSort(threads);
  const finalRequests = dedupeAndSort(requests);

  // Replace stored object keys with short-lived signed GET URLs so the
  // browser can render the group photo directly. Skip non-R2 strings
  // (already-public URLs) and bail to a null photo on signing failure.
  if (isR2Configured()) {
    const signOne = async (e: ThreadEntry) => {
      if (!e.photo_url) return;
      if (!e.photo_url.startsWith(GROUP_PHOTO_KEY_PREFIX)) return;
      try {
        e.photo_url = await signGroupPhotoGetUrl(e.photo_url);
      } catch (err) {
        console.error("[threads.GET signGroupPhoto]", err);
        e.photo_url = null;
      }
    };
    await Promise.all([...finalThreads, ...finalRequests].map(signOne));
  }

  return NextResponse.json({
    ok: true,
    threads: finalThreads,
    requests: finalRequests,
  });
}
