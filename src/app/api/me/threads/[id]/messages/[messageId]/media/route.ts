import { NextResponse } from "next/server";

import {
  ensureMember,
  isChannelMessageMediaKey,
} from "@/lib/messages/channel-access";
import { signMessageMediaGetUrl } from "@/lib/r2";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteCtx = { params: Promise<{ id: string; messageId: string }> };

// The signed URL lives an hour; the browser keeps the redirect for only 5
// minutes — the window the old inline signed URLs gave — so clearing a chat
// or leaving a group cuts access about as fast as before, while re-renders
// inside that window reuse the file already fetched.
const SIGN_EXPIRES_SEC = 60 * 60;
const REDIRECT_CACHE_CONTROL = "private, max-age=300";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every denial looks identical, so a non-member can't probe which ids exist. */
function notFound() {
  return NextResponse.json(
    { ok: false, error: "Not found" },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function failed(error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * GET /api/me/threads/[id]/messages/[messageId]/media
 *
 * Stable URL for an inline chat photo/video (paperclip upload). The messages
 * list returns this path instead of a signed R2 URL: a list-time signature
 * died after 5 minutes, and desktop only re-renders a bubble when its id
 * changes, so an open thread's media went dead until reload. Here each
 * request signs fresh (1h) and 307-redirects; the redirect is cached
 * privately so re-renders reuse one signed URL instead of re-downloading.
 *
 * Same gate as the thread view: signed-in viewer, member of the channel
 * (ensureMember — channel_members for DM/group, can_view_org_channel for
 * org channels, plus RLS on messages), message in this channel, and newer
 * than the viewer's "Clear chat" stamp. Deleted messages are hard-deleted,
 * so they miss by construction; blocks aren't a read filter in the thread
 * view either, so they aren't one here.
 */
export async function GET(_req: Request, ctx: RouteCtx) {
  const { id: channelId, messageId } = await ctx.params;
  // A malformed id would surface as a Postgres uuid-cast error (500) —
  // answer it like any other miss.
  if (!UUID_RE.test(channelId) || !UUID_RE.test(messageId)) return notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return notFound();

  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return member.status === 500 ? failed("Request failed") : notFound();
  }

  // cleared_at: the messages GET drops everything at or before the viewer's
  // last "Clear chat" — drop the media the same way (same strict gt).
  const clearedAt = !member.isOrgChannel ? member.cleared_at : null;
  let q = supabase
    .from("messages")
    .select("media_url")
    .eq("id", messageId)
    .eq("channel_id", channelId);
  if (clearedAt) q = q.gt("created_at", clearedAt);
  const { data: msg, error } = await q.maybeSingle();
  if (error) {
    console.error("[messages/[messageId]/media lookup]", error);
    return failed("Request failed");
  }

  const stored = (msg as { media_url: string | null } | null)?.media_url ?? null;
  if (!stored || !isChannelMessageMediaKey(stored, channelId)) return notFound();

  try {
    const signed = await signMessageMediaGetUrl(stored, SIGN_EXPIRES_SEC);
    const res = NextResponse.redirect(signed, 307);
    res.headers.set("Cache-Control", REDIRECT_CACHE_CONTROL);
    return res;
  } catch (e) {
    console.error("[messages/[messageId]/media GET]", e);
    return failed("Could not sign media");
  }
}
