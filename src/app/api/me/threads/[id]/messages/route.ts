import { NextResponse } from "next/server";

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
};

const MESSAGE_SELECT =
  "id, content, created_at, user_id, attachment_id, attachment_kind, media_url, media_kind, " +
  "users:users!messages_user_id_fkey(id, handle, name, avatar_url), " +
  "attachment:posts!messages_attachment_id_fkey(id, type, content, media_url, media_thumbnail_url, user_id)";

type MessageRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  media_url?: string | null;
  media_kind?: string | null;
  attachment_id?: string | null;
  attachment_kind?: string | null;
  users?: unknown;
  attachment?: unknown;
};

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

async function ensureMember(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  channelId: string,
  userId: string,
): Promise<{ ok: true; accepted_at: string | null } | { ok: false; status: number }> {
  const { data, error } = await supabase
    .from("channel_members")
    .select("accepted_at")
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[messages.ensureMember]", error);
    return { ok: false, status: 500 };
  }
  if (!data) return { ok: false, status: 403 };
  return { ok: true, accepted_at: (data.accepted_at as string | null) ?? null };
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
  async function runQuery(select: string) {
    let q = supabase
      .from("messages")
      .select(select)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (before) q = q.lt("created_at", before);
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
  await signMediaUrls((data ?? []) as unknown as MessageRow[]);

  // Peer's last_read_at — drives the "Read" receipt on sent messages.
  // (For 1:1 dms there's exactly one peer; for groups we take the max so
  // "everyone has read up to here" is a safe lower bound.)
  const { data: others } = await supabase
    .from("channel_members")
    .select("last_read_at")
    .eq("channel_id", channelId)
    .neq("user_id", user.id);
  const peerLastReadAt = (others ?? [])
    .map((o) => (o.last_read_at as string | null) ?? "")
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  // Return oldest-first so the UI can append straight to the bottom.
  const messages = (data ?? []).slice().reverse();
  return NextResponse.json({ ok: true, messages, peer_last_read_at: peerLastReadAt });
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

  const insertRow: Record<string, string | null> = {
    channel_id: channelId,
    user_id: user.id,
    content: content,
    attachment_id: attachmentId,
    attachment_kind: attachmentKind,
    media_url: mediaUrl,
    media_kind: mediaKind,
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

  // Implicit-accept: replying clears your own pending state.
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

  // Update viewer's last_read_at since they just saw the channel state.
  await supabase
    .from("channel_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("user_id", user.id);

  if (inserted) await signMediaUrls([inserted as unknown as MessageRow]);
  return NextResponse.json({ ok: true, message: inserted });
}
