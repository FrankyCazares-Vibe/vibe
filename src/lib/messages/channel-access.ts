import { MESSAGE_MEDIA_KEY_PREFIX, MESSAGE_MEDIA_KEY_RE } from "@/lib/r2";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Channel gate + message-media helpers shared by the thread messages route
 * (`/api/me/threads/[id]/messages`) and its media proxy
 * (`.../messages/[messageId]/media`). One copy of the gate, so the proxy can
 * never serve a file the thread view itself would refuse to show.
 */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ChannelAccess =
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
export async function ensureMember(
  supabase: ServerClient,
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
 * The one rule for what counts as an inline chat photo/video: an R2 key in
 * THIS channel's folder, in exactly the shape `/api/me/messages-upload-url`
 * mints (`messages/<channel uuid>/<file>` — the same MESSAGE_MEDIA_KEY_RE
 * the account-deletion purge enforces). The send path checks writes with it
 * and the media proxy checks reads with it, so a key lifted from another
 * channel is refused on both sides.
 */
export function isChannelMessageMediaKey(key: string, channelId: string): boolean {
  return (
    MESSAGE_MEDIA_KEY_RE.test(key) &&
    key.startsWith(`${MESSAGE_MEDIA_KEY_PREFIX}${channelId}/`)
  );
}

/**
 * Stable same-origin URL for a message's photo/video. Clients put it
 * straight into `<img src>` / `<video src>`; the proxy signs a fresh R2 URL
 * per request and 307s to it, so a thread left open never goes stale.
 */
export function messageMediaProxyUrl(channelId: string, messageId: string): string {
  return `/api/me/threads/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/media`;
}
