import { NextResponse } from "next/server";

import { getFollowState } from "@/lib/connections/queries";
import { GROUP_PHOTO_KEY_PREFIX, isR2Configured, signGroupPhotoGetUrl } from "@/lib/r2";
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

const MAX_GROUP_MEMBERS = 50;

type ThreadPeer = {
  id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  school: string | null;
  bio: string | null;
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
  last_message: { content: string; created_at: string; user_id: string } | null;
  unread: boolean;
  accepted_at: string | null;
  is_request: boolean;
  /** Peer's last_read_at — used to render "Read" receipts on sent 1:1 messages. */
  peer_last_read_at: string | null;
  /** Pinned at this timestamp (null = not pinned). Pinned threads sort first. */
  pinned_at: string | null;
  /** Viewer's role in this channel (admin/member) — drives kick affordance. */
  viewer_role: "admin" | "member";
};

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
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)) ids.add(t);
    else handles.add(t.toLowerCase());
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
    if (memberIds.length + 1 > MAX_GROUP_MEMBERS) {
      return NextResponse.json(
        { ok: false, error: `Max ${MAX_GROUP_MEMBERS} members per group` },
        { status: 400 },
      );
    }
    const groupName =
      typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";

    const admin = createSupabaseServiceClient();
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

  // All channels the viewer is a member of (incl. pending requests).
  // pinned_at, hidden_at, photo_url are selected separately below so any
  // missing-column situation (migration not yet applied) can't take the
  // whole route down. accepted_at/last_read_at landed in the first DM
  // migration; if those are missing, DMs aren't usable at all anyway.
  const { data: myMemberships, error: memErr } = await supabase
    .from("channel_members")
    .select(
      "channel_id, accepted_at, last_read_at, role, channels!inner(id, type, name)",
    )
    .eq("user_id", user.id);

  if (memErr) {
    console.error("[threads.GET memberships]", memErr);
    return NextResponse.json({ ok: false, error: memErr.message }, { status: 500 });
  }

  type Membership = {
    channel_id: string;
    accepted_at: string | null;
    last_read_at: string | null;
    hidden_at: string | null;
    pinned_at: string | null;
    role: "admin" | "member";
    channels: {
      id: string;
      type: ThreadEntry["type"];
      name: string;
    };
  };
  const rows: Membership[] = ((myMemberships ?? []) as unknown as Membership[]).map(
    (r) => ({ ...r, hidden_at: null, pinned_at: null }),
  );
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, threads: [], requests: [] });
  }

  const channelIds = rows.map((r) => r.channel_id);

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
      .select("channel_id, hidden_at, pinned_at")
      .eq("user_id", user.id)
      .in("channel_id", channelIds);
    const byChannel = new Map<string, { hidden_at: string | null; pinned_at: string | null }>();
    for (const e of extraRows ?? []) {
      byChannel.set(e.channel_id as string, {
        hidden_at: (e.hidden_at as string | null) ?? null,
        pinned_at: (e.pinned_at as string | null) ?? null,
      });
    }
    for (const r of rows) {
      const extra = byChannel.get(r.channel_id);
      if (extra) {
        r.hidden_at = extra.hidden_at;
        r.pinned_at = extra.pinned_at;
      }
    }
  } catch {
    /* hidden_at/pinned_at columns may not exist yet; both stay null. */
  }

  // Other members for peer hydration (1:1 dm peer = the non-viewer member)
  // and peer last_read_at for "Read" receipts.
  const { data: otherMembers, error: othersErr } = await supabase
    .from("channel_members")
    .select(
      "channel_id, user_id, last_read_at, role, users:users!channel_members_user_id_fkey(id, handle, name, avatar_url, school, bio)",
    )
    .in("channel_id", channelIds)
    .neq("user_id", user.id);

  if (othersErr) {
    console.error("[threads.GET others]", othersErr);
    return NextResponse.json({ ok: false, error: othersErr.message }, { status: 500 });
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
  const { data: lastMsgs, error: lastErr } = await supabase
    .from("messages")
    .select("channel_id, content, created_at, user_id")
    .in("channel_id", channelIds)
    .order("created_at", { ascending: false })
    .limit(channelIds.length * 5);

  if (lastErr) {
    console.error("[threads.GET lastMsgs]", lastErr);
    // Soft-fail: still render the list without previews.
  }

  const lastByChannel = new Map<string, ThreadEntry["last_message"]>();
  for (const m of lastMsgs ?? []) {
    const cid = m.channel_id as string;
    if (!lastByChannel.has(cid)) {
      lastByChannel.set(cid, {
        content: m.content as string,
        created_at: m.created_at as string,
        user_id: m.user_id as string,
      });
    }
  }

  // Block filter: hide any 1:1 thread where the peer is blocked-either-way.
  // Defensive try/catch so missing-table (migration lag) doesn't 500 the route.
  const blockedPeerIds = new Set<string>();
  try {
    const { data: blockRows } = await supabase
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
    for (const b of blockRows ?? []) {
      const blocker = b.blocker_id as string;
      const blocked = b.blocked_id as string;
      if (blocker === user.id) blockedPeerIds.add(blocked);
      else if (blocked === user.id) blockedPeerIds.add(blocker);
    }
  } catch {
    /* blocks table not yet migrated — no filter applied. */
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
    const isRequestState = r.accepted_at === null;
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
      is_request: r.accepted_at === null,
      peer_last_read_at: peerLastReadByChannel.get(r.channel_id) ?? null,
      pinned_at: r.pinned_at,
      viewer_role: r.role,
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
