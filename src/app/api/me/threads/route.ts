import { NextResponse } from "next/server";

import { getFollowState } from "@/lib/connections/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type CreateBody = {
  target_id?: unknown;
  handle?: unknown;
};

type ThreadPeer = {
  id: string;
  handle: string | null;
  name: string | null;
  avatar_url: string | null;
  school: string | null;
  bio: string | null;
};

type ThreadEntry = {
  id: string;
  type: "dm" | "group" | "org_channel" | "org_subchannel";
  name: string;
  peer: ThreadPeer | null;
  last_message: { content: string; created_at: string; user_id: string } | null;
  unread: boolean;
  accepted_at: string | null;
  is_request: boolean;
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
 * Returns the channel id or null.
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
  return (hits?.[0]?.channel_id as string | undefined) ?? null;
}

/**
 * POST: find or create a 1:1 DM channel between viewer and target.
 * Idempotent — returns existing channel id if one exists.
 *
 * Acceptance rule: if viewer and target are already mutually connected,
 * both members are auto-accepted. Otherwise the target's row stays NULL
 * (lands in their "requests" tab) until they accept or reply.
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
    // Best-effort cleanup so we don't orphan an empty channel.
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
  const { data: myMemberships, error: memErr } = await supabase
    .from("channel_members")
    .select("channel_id, accepted_at, last_read_at, channels!inner(id, type, name)")
    .eq("user_id", user.id);

  if (memErr) {
    console.error("[threads.GET memberships]", memErr);
    return NextResponse.json({ ok: false, error: memErr.message }, { status: 500 });
  }

  type Membership = {
    channel_id: string;
    accepted_at: string | null;
    last_read_at: string | null;
    channels: { id: string; type: ThreadEntry["type"]; name: string };
  };
  const rows = (myMemberships ?? []) as unknown as Membership[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, threads: [], requests: [] });
  }

  const channelIds = rows.map((r) => r.channel_id);

  // Other members for peer hydration (1:1 dm peer = the non-viewer member).
  const { data: otherMembers, error: othersErr } = await supabase
    .from("channel_members")
    .select(
      "channel_id, user_id, users:users!channel_members_user_id_fkey(id, handle, name, avatar_url, school, bio)",
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
    users: ThreadPeer | null;
  };
  const peerByChannel = new Map<string, ThreadPeer>();
  for (const o of (otherMembers ?? []) as unknown as OtherRow[]) {
    if (o.users && !peerByChannel.has(o.channel_id)) {
      peerByChannel.set(o.channel_id, o.users);
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

  const threads: ThreadEntry[] = [];
  const requests: ThreadEntry[] = [];

  for (const r of rows) {
    const last = lastByChannel.get(r.channel_id) ?? null;
    const peer = peerByChannel.get(r.channel_id) ?? null;
    const unread =
      !!last &&
      last.user_id !== user.id &&
      (!r.last_read_at || new Date(last.created_at) > new Date(r.last_read_at));

    const entry: ThreadEntry = {
      id: r.channel_id,
      type: r.channels.type,
      name: r.channels.name || peer?.name || "",
      peer,
      last_message: last,
      unread,
      accepted_at: r.accepted_at,
      is_request: r.accepted_at === null,
    };

    if (entry.is_request) requests.push(entry);
    else threads.push(entry);
  }

  // Most-recent first (by last message, then by membership).
  const byRecency = (a: ThreadEntry, b: ThreadEntry) => {
    const at = a.last_message?.created_at ?? "";
    const bt = b.last_message?.created_at ?? "";
    return bt.localeCompare(at);
  };

  // Defense-in-depth: dedupe 1:1 DMs by peer id. The pre-RLS-fix bug created
  // duplicate channels with the same peer because findExistingDm couldn't see
  // existing rows. Future clicks won't duplicate, but legacy orphans linger.
  // Keep the most-recent one per peer; the orphans stay in the DB (no
  // destructive cleanup from a read endpoint) but the UI sees one row.
  const dedupeByPeer = (entries: ThreadEntry[]): ThreadEntry[] => {
    const seen = new Map<string, ThreadEntry>();
    const result: ThreadEntry[] = [];
    for (const e of [...entries].sort(byRecency)) {
      const key = e.type === "dm" && e.peer?.id ? e.peer.id : e.id;
      if (seen.has(key)) continue;
      seen.set(key, e);
      result.push(e);
    }
    return result;
  };

  return NextResponse.json({
    ok: true,
    threads: dedupeByPeer(threads),
    requests: dedupeByPeer(requests),
  });
}
