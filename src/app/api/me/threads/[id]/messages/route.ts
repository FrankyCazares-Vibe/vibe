import { NextResponse } from "next/server";

import {
  extractMentionHandles,
  insertMentionNotifications,
  resolveMentionedUserIds,
} from "@/lib/mentions";
import {
  isR2Configured,
  MESSAGE_MEDIA_KEY_PREFIX,
  signMessageMediaGetUrl,
} from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const MAX_CONTENT = 4000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type SendBody = {
  content?: unknown;
  attachment_id?: unknown;
  attachment_kind?: unknown; // 'post' | 'clip'
  media_url?: unknown;        // R2 object key (messages/<channel>/<uuid>.ext)
  media_kind?: unknown;       // 'image' | 'video'
  parent_message_id?: unknown; // quote-reply parent
};

const MESSAGE_SELECT =
  "id, content, created_at, user_id, attachment_id, attachment_kind, media_url, media_kind, parent_message_id, " +
  "users:users!messages_user_id_fkey(id, handle, name, avatar_url), " +
  "attachment:posts!messages_attachment_id_fkey(id, type, content, media_url, media_thumbnail_url, user_id, author:users!posts_user_id_fkey(id, handle, name, avatar_url))";

type MessageRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  media_url?: string | null;
  media_kind?: string | null;
  attachment_id?: string | null;
  attachment_kind?: string | null;
  parent_message_id?: string | null;
  users?: unknown;
  attachment?: unknown;
  // Filled in by hydrate helpers below.
  parent_preview?: ParentPreview | null;
  reactions?: ReactionGroup[];
};

type ParentPreview = {
  id: string;
  content: string | null;
  user_id: string;
  author: { id: string; handle: string | null; name: string | null; avatar_url: string | null } | null;
};

type ReactionGroup = {
  emoji: string;
  count: number;
  viewer_reacted: boolean;
};

/**
 * Batch-fetch reactions for the given messages and attach a grouped
 * `reactions: [{emoji, count, viewer_reacted}]` array to each row. Stale
 * deploys: degrade silently if the table doesn't exist yet.
 */
async function hydrateReactions(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: MessageRow[],
  viewerId: string,
): Promise<void> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  const { data, error } = await supabase
    .from("message_reactions")
    .select("message_id,emoji,user_id")
    .in("message_id", ids);
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[messages.hydrateReactions]", error.message);
    }
    return;
  }
  // groups[messageId][emoji] = { count, viewerReacted }
  const groups = new Map<string, Map<string, { count: number; viewerReacted: boolean }>>();
  for (const row of data ?? []) {
    const r = row as { message_id: string; emoji: string; user_id: string };
    let perMessage = groups.get(r.message_id);
    if (!perMessage) {
      perMessage = new Map();
      groups.set(r.message_id, perMessage);
    }
    let entry = perMessage.get(r.emoji);
    if (!entry) {
      entry = { count: 0, viewerReacted: false };
      perMessage.set(r.emoji, entry);
    }
    entry.count += 1;
    if (r.user_id === viewerId) entry.viewerReacted = true;
  }
  for (const m of rows) {
    const perMessage = groups.get(m.id);
    if (!perMessage || perMessage.size === 0) {
      m.reactions = [];
      continue;
    }
    m.reactions = Array.from(perMessage.entries())
      .map(([emoji, { count, viewerReacted }]) => ({
        emoji,
        count,
        viewer_reacted: viewerReacted,
      }))
      // Stable sort: most-used first, then by emoji codepoint for ties.
      .sort((a, b) => b.count - a.count || (a.emoji < b.emoji ? -1 : 1));
  }
}

/**
 * Batch-fetch the parent message previews for any rows that have a
 * `parent_message_id`. Just enough for the quote-stub render: id, content
 * snippet, author identity. Stale deploys (no parent_message_id column)
 * degrade silently.
 */
async function hydrateParentPreviews(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: MessageRow[],
): Promise<void> {
  const parentIds = Array.from(
    new Set(
      rows
        .map((r) => r.parent_message_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  if (parentIds.length === 0) return;
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, content, user_id, author:users!messages_user_id_fkey(id, handle, name, avatar_url)",
    )
    .in("id", parentIds);
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[messages.hydrateParentPreviews]", error.message);
    }
    return;
  }
  const byId = new Map<string, ParentPreview>();
  for (const p of data ?? []) {
    const row = p as unknown as ParentPreview;
    byId.set(row.id, {
      id: row.id,
      content: row.content,
      user_id: row.user_id,
      author: row.author ?? null,
    });
  }
  for (const m of rows) {
    if (m.parent_message_id) m.parent_preview = byId.get(m.parent_message_id) ?? null;
  }
}

/**
 * Replace stored R2 keys in `media_url` with short-lived signed GET URLs
 * so the browser can render images/videos directly. No-ops when R2 isn't
 * configured or media_url is already a public URL.
 */
async function signMediaUrls(rows: MessageRow[]): Promise<void> {
  if (!isR2Configured()) return;
  await Promise.all(
    rows.map(async (m) => {
      const key = m.media_url;
      if (!key || !key.startsWith(MESSAGE_MEDIA_KEY_PREFIX)) return;
      try {
        m.media_url = await signMessageMediaGetUrl(key);
      } catch (err) {
        console.error("[messages.signMediaUrls]", err);
        m.media_url = null;
      }
    }),
  );
}

type RouteCtx = { params: Promise<{ id: string }> };

type ChannelAccess =
  | {
      ok: true;
      isOrgChannel: false;
      orgId: null;
      accepted_at: string | null;
      cleared_at: string | null;
    }
  | {
      ok: true;
      isOrgChannel: true;
      orgId: string;
      accepted_at: null;
      cleared_at: null;
    }
  | { ok: false; status: number };

/**
 * Verify the viewer can read/post in this channel.
 * - DM/group channels (channel_members.row exists): returns accepted_at for
 *   the implicit-accept flow.
 * - Org channels (channels.org_id IS NOT NULL): defers to can_view_org_channel,
 *   which checks org_members + per-channel privacy.
 */
async function ensureMember(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  channelId: string,
  userId: string,
): Promise<ChannelAccess> {
  // Quick lookup: does this channel belong to an org?
  const { data: channel } = await supabase
    .from("channels")
    .select("org_id")
    .eq("id", channelId)
    .maybeSingle();

  if (channel?.org_id) {
    const { data: canView, error: rpcErr } = await supabase.rpc(
      "can_view_org_channel",
      { cid: channelId, uid: userId },
    );
    if (rpcErr) {
      console.error("[messages.ensureMember can_view_org_channel]", rpcErr);
      return { ok: false, status: 500 };
    }
    if (canView !== true) return { ok: false, status: 403 };
    return {
      ok: true,
      isOrgChannel: true,
      orgId: channel.org_id as string,
      accepted_at: null,
      cleared_at: null,
    };
  }

  // DM/group path — original channel_members check.
  // cleared_at is selected on the same row so the messages GET can filter
  // out anything stamped before the viewer's last "Clear chat" call.
  // Wrapped in a second try without cleared_at for deploy-lag safety
  // (the column lands in 20260509100000 — fall back if missing).
  async function readMember(includeCleared: boolean) {
    return supabase
      .from("channel_members")
      .select(includeCleared ? "accepted_at, cleared_at" : "accepted_at")
      .eq("channel_id", channelId)
      .eq("user_id", userId)
      .maybeSingle();
  }
  let { data, error } = await readMember(true);
  if (error && /cleared_at|column .* does not exist/i.test(error.message ?? "")) {
    const fb = await readMember(false);
    data = fb.data;
    error = fb.error;
  }
  if (error) {
    console.error("[messages.ensureMember]", error);
    return { ok: false, status: 500 };
  }
  if (!data) return { ok: false, status: 403 };
  const row = data as unknown as {
    accepted_at: string | null;
    cleared_at?: string | null;
  };
  return {
    ok: true,
    isOrgChannel: false,
    orgId: null,
    accepted_at: row.accepted_at ?? null,
    cleared_at: row.cleared_at ?? null,
  };
}

/**
 * GET: list messages in a channel, oldest-first.
 * `?before=<iso>` paginates older messages; `?limit=<n>` caps results.
 */
export async function GET(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status });
  }

  const url = new URL(req.url);
  const before = url.searchParams.get("before");
  const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT));

  // Try the join-rich select first; if attachment columns/FK aren't in
  // the DB yet, retry with the simpler select so the page still renders.
  // cleared_at filters out everything older than the viewer's last
  // "Clear chat" call — viewer-side soft-delete; peer's view is intact.
  const clearedAt = !member.isOrgChannel ? member.cleared_at : null;
  async function runQuery(select: string) {
    let q = supabase
      .from("messages")
      .select(select)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (before) q = q.lt("created_at", before);
    if (clearedAt) q = q.gt("created_at", clearedAt);
    return q;
  }
  let { data, error } = await runQuery(MESSAGE_SELECT);
  if (error) {
    if (/attachment|media|relationship|column|fkey/i.test(error.message)) {
      const fallback = await runQuery(
        "id, content, created_at, user_id, users:users!messages_user_id_fkey(id, handle, name, avatar_url)",
      );
      data = fallback.data;
      error = fallback.error;
    }
  }
  if (error) {
    console.error("[messages.GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  // Sign R2 keys in media_url so the browser can render directly.
  const messageRows = (data ?? []) as unknown as MessageRow[];
  await signMediaUrls(messageRows);
  await Promise.all([
    hydrateReactions(supabase, messageRows, user.id),
    hydrateParentPreviews(supabase, messageRows),
  ]);

  // Org channels don't have channel_members rows — skip the peer/typing query
  // entirely. (Org-channel read state + typing indicators are out of scope
  // for v1; can be added later via a separate org_channel_reads table.)
  if (member.isOrgChannel) {
    const messages = (data ?? []).slice().reverse();
    return NextResponse.json({
      ok: true,
      messages,
      peer_last_read_at: null,
      peer_typing: [],
    });
  }

  // Peer last_read_at + typing — both come from the same query so we only
  // hit channel_members once per poll cycle. typing_until column is optional
  // (separate migration) so we try-include and ignore on column-missing.
  type OtherSnapshot = {
    user_id: string;
    last_read_at: string | null;
    typing_until: string | null;
    users: { id: string; handle: string | null; name: string | null; avatar_url: string | null } | null;
  };
  let others: OtherSnapshot[] = [];
  const tryFull = await supabase
    .from("channel_members")
    .select(
      "user_id, last_read_at, typing_until, users:users!channel_members_user_id_fkey(id, handle, name, avatar_url)",
    )
    .eq("channel_id", channelId)
    .neq("user_id", user.id);
  if (tryFull.error && /typing_until|column/i.test(tryFull.error.message)) {
    const fallback = await supabase
      .from("channel_members")
      .select(
        "user_id, last_read_at, users:users!channel_members_user_id_fkey(id, handle, name, avatar_url)",
      )
      .eq("channel_id", channelId)
      .neq("user_id", user.id);
    others = (fallback.data ?? []).map((o) => ({
      user_id: o.user_id as string,
      last_read_at: (o.last_read_at as string | null) ?? null,
      typing_until: null,
      users: (o.users as unknown as OtherSnapshot["users"]) ?? null,
    }));
  } else {
    others = (tryFull.data ?? []) as unknown as OtherSnapshot[];
  }

  const peerLastReadAt = others
    .map((o) => o.last_read_at ?? "")
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  const now = Date.now();
  const peerTyping = others
    .filter((o) => o.users && o.typing_until && new Date(o.typing_until).getTime() > now)
    .map((o) => ({
      user_id: o.users!.id,
      handle: o.users!.handle,
      name: o.users!.name,
      avatar_url: o.users!.avatar_url,
    }));

  // Return oldest-first so the UI can append straight to the bottom.
  const messages = (data ?? []).slice().reverse();
  return NextResponse.json({
    ok: true,
    messages,
    viewer_id: user.id,
    peer_last_read_at: peerLastReadAt,
    peer_typing: peerTyping,
  });
}

/**
 * POST: send a message in a channel.
 * If the sender's own row is still pending (request state), this reply
 * implicitly accepts the request.
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  const parentMessageIdRaw =
    typeof body.parent_message_id === "string" && body.parent_message_id.length > 0
      ? body.parent_message_id
      : null;
  const attachmentId =
    typeof body.attachment_id === "string" && body.attachment_id.length > 0
      ? body.attachment_id
      : null;
  const attachmentKindRaw =
    typeof body.attachment_kind === "string" ? body.attachment_kind : null;
  const mediaUrlRaw =
    typeof body.media_url === "string" && body.media_url.length > 0
      ? body.media_url
      : null;
  const mediaKindRaw =
    typeof body.media_kind === "string" ? body.media_kind : null;

  if (!content && !attachmentId && !mediaUrlRaw) {
    return NextResponse.json({ ok: false, error: "Empty message" }, { status: 400 });
  }
  if (content.length > MAX_CONTENT) {
    return NextResponse.json({ ok: false, error: "Message too long" }, { status: 400 });
  }

  // Validate media: only accept R2 keys we'd have signed ourselves
  // (channel-scoped path), and only known kinds.
  let mediaUrl: string | null = null;
  let mediaKind: "image" | "video" | null = null;
  if (mediaUrlRaw) {
    if (
      !mediaUrlRaw.startsWith(`${MESSAGE_MEDIA_KEY_PREFIX}${channelId}/`)
    ) {
      return NextResponse.json(
        { ok: false, error: "Invalid media key" },
        { status: 400 },
      );
    }
    if (mediaKindRaw !== "image" && mediaKindRaw !== "video") {
      return NextResponse.json(
        { ok: false, error: "Invalid media_kind" },
        { status: 400 },
      );
    }
    mediaUrl = mediaUrlRaw;
    mediaKind = mediaKindRaw;
  }

  // Verify the attachment exists and is visible to the sender (RLS gates
  // SELECT, so a SELECT that returns null = either missing or invisible —
  // both should reject). Ensure attachment_kind agrees with posts.type.
  let attachmentKind: "post" | "clip" | null = null;
  if (attachmentId) {
    if (attachmentKindRaw !== "post" && attachmentKindRaw !== "clip") {
      return NextResponse.json(
        { ok: false, error: "Invalid attachment_kind" },
        { status: 400 },
      );
    }
    const { data: post } = await supabase
      .from("posts")
      .select("id, type")
      .eq("id", attachmentId)
      .maybeSingle();
    if (!post) {
      return NextResponse.json(
        { ok: false, error: "Attachment not found" },
        { status: 404 },
      );
    }
    const expected = post.type === "clip" ? "clip" : "post";
    if (attachmentKindRaw !== expected) {
      return NextResponse.json(
        { ok: false, error: "Attachment kind mismatch" },
        { status: 400 },
      );
    }
    attachmentKind = expected;
  }

  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status });
  }

  // Verify the parent message (if any) belongs to this channel — prevents
  // cross-channel quote-replies. Stale deploys without the column degrade
  // silently to a non-reply.
  let parentMessageId: string | null = null;
  if (parentMessageIdRaw) {
    const { data: parent, error: parentErr } = await supabase
      .from("messages")
      .select("id, channel_id")
      .eq("id", parentMessageIdRaw)
      .maybeSingle();
    if (parentErr) {
      console.error("[messages.POST parent check]", parentErr);
    } else if (parent && parent.channel_id === channelId) {
      parentMessageId = parentMessageIdRaw;
    } else if (parent) {
      return NextResponse.json(
        { ok: false, error: "Parent message belongs to a different channel" },
        { status: 400 },
      );
    }
    // No row found → silently drop the parent rather than rejecting the send.
  }

  // Block guard: in DM/group channels, if any peer blocks the sender (or
  // vice versa), reject the send. Skipped on org channels — orgs are larger
  // groups where one block shouldn't silence a whole community channel.
  if (!member.isOrgChannel) {
    try {
      const { data: others } = await supabase
        .from("channel_members")
        .select("user_id")
        .eq("channel_id", channelId)
        .neq("user_id", user.id);
      for (const o of others ?? []) {
        const { data: blocked } = await supabase.rpc("is_blocked_either_way", {
          viewer_id: user.id,
          other_id: o.user_id as string,
        });
        if (blocked === true) {
          return NextResponse.json(
            { ok: false, error: "Couldn't send this message" },
            { status: 403 },
          );
        }
      }
    } catch (e) {
      // If the helper isn't installed yet (migration lag), don't block
      // sends — the safety net is a polish, not a correctness gate.
      if (process.env.NODE_ENV !== "production") {
        console.warn("[messages.POST block-check]", e);
      }
    }
  }

  const insertRow: Record<string, string | null> = {
    channel_id: channelId,
    user_id: user.id,
    content: content,
    attachment_id: attachmentId,
    attachment_kind: attachmentKind,
    media_url: mediaUrl,
    media_kind: mediaKind,
    parent_message_id: parentMessageId,
  };
  // Defensive for migration lag — if either pair of optional columns is
  // missing, retry with the bare minimum so the message still goes through.
  let insertResult = await supabase
    .from("messages")
    .insert(insertRow)
    .select(MESSAGE_SELECT)
    .single();
  if (insertResult.error && /attachment|media|column/i.test(insertResult.error.message)) {
    insertResult = await supabase
      .from("messages")
      .insert({ channel_id: channelId, user_id: user.id, content })
      .select(
        "id, content, created_at, user_id, users:users!messages_user_id_fkey(id, handle, name, avatar_url)",
      )
      .single();
  }
  const { data: inserted, error: insErr } = insertResult;

  if (insErr || !inserted) {
    console.error("[messages.POST insert]", insErr);
    return NextResponse.json({ ok: false, error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // DM/group housekeeping: implicit-accept on first reply, bump last_read_at.
  // Org channels skip both — they don't use channel_members.
  if (!member.isOrgChannel) {
    if (member.accepted_at === null) {
      const { error: accErr } = await supabase
        .from("channel_members")
        .update({ accepted_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .eq("user_id", user.id);
      if (accErr) {
        console.error("[messages.POST implicit-accept]", accErr);
        // Non-fatal; the message went through.
      }
    }
    await supabase
      .from("channel_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("channel_id", channelId)
      .eq("user_id", user.id);
  }

  // @mention fan-out — only notifies people who can actually see this
  // channel, so a stray @somebody outside the chat doesn't ping strangers.
  // For DM/group: members come from channel_members. For org: from
  // org_members on the channel's org. Best-effort; failures don't block the send.
  if (content) {
    const handles = extractMentionHandles(content);
    if (handles.length > 0) {
      try {
        const ids = await resolveMentionedUserIds(supabase, handles, user.id);
        if (ids.length > 0) {
          let validTargets: string[] = [];
          if (member.isOrgChannel) {
            const { data: orgMembers } = await supabase
              .from("org_members")
              .select("user_id")
              .eq("org_id", member.orgId)
              .in("user_id", ids);
            validTargets = (orgMembers ?? []).map((m) => m.user_id as string);
          } else {
            const { data: chMembers } = await supabase
              .from("channel_members")
              .select("user_id")
              .eq("channel_id", channelId)
              .in("user_id", ids);
            validTargets = (chMembers ?? []).map((m) => m.user_id as string);
          }
          const insertedRow = inserted as { id?: string } | null;
          if (validTargets.length > 0 && insertedRow?.id) {
            await insertMentionNotifications(supabase, {
              actorId: user.id,
              targetUserIds: validTargets,
              kind: "message",
              messageId: insertedRow.id,
            });
          }
        }
      } catch (e) {
        console.error("[messages.POST mentions]", e);
      }
    }
  }

  if (inserted) {
    const insertedRows = [inserted as unknown as MessageRow];
    await signMediaUrls(insertedRows);
    // New row has no reactions yet, but if it's a reply we want to embed
    // the parent preview so the optimistic-render quote stub is correct.
    await hydrateParentPreviews(supabase, insertedRows);
    if (insertedRows[0].reactions === undefined) insertedRows[0].reactions = [];
  }
  return NextResponse.json({ ok: true, message: inserted });
}
