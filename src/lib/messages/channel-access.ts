import { isRoomKind } from "@/lib/chat/room-rules";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import type { RoomKind } from "@/lib/chat/types";
import { isUuid } from "@/lib/pgrest";
import { MESSAGE_MEDIA_KEY_PREFIX, MESSAGE_MEDIA_KEY_RE } from "@/lib/r2";
import { isChannelMediaKey } from "@/lib/posts/media-ownership";
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
      /** `channels.kind`; null or absent on a database without the column. */
      kind?: RoomKind | null;
      /** `channels.event_id`, set on an event's chat only. */
      eventId?: string | null;
    }
  | { ok: false; status: number };

/**
 * Verify the viewer can READ this channel (posting is asked apart).
 * - DM/group channels (channel_members.row exists): returns accepted_at for
 *   the implicit-accept flow.
 * - Org channels (channels.org_id IS NOT NULL): defers to can_view_org_channel,
 *   which checks org_members + per-channel privacy.
 * - A channel the caller can't read at all (no such id, or a club channel RLS
 *   hides because they left or were removed): 403, before either branch.
 *
 * CLUB MODEL (Franky's calls of Oct 16; 20261017110000): an `ok` for a club
 * room no longer means "a member". `can_view_org_channel` also lets a
 * FOLLOWER read the club's Board (following, not hidden, the club allows
 * it, not barred, removed or blocked by its officers), and nothing else.
 * Only members type, so a route that writes in a club room (send, react,
 * vote, card, remove) asks the club role too and answers a reader without
 * one 403 `members_only` (the send route reads it with `clubRoleAnswer`).
 * A follower holds no `channel_members` row, so a write to the caller's own
 * row (read, typing, hide, mute, clear) changes nothing for them.
 *
 * Also the gate for `/api/me/messages-upload-url` and the chat @mention
 * search (`/api/users/search?channel_id=`), so minting an upload URL or
 * reading a roster asks the same question as reading the messages. Both
 * stay shut to a follower on the Board: the upload route refuses every
 * club room (`club_media_off`), and the roster read finds no row of theirs
 * (`can_read_channel_roster` also asks for membership since 20261017110000).
 */
export async function ensureMember(
  supabase: ServerClient,
  channelId: string,
  userId: string,
): Promise<ChannelAccess> {
  // A malformed id can't name a channel; answer it like any other miss
  // rather than letting the uuid cast surface as a 500.
  if (!isUuid(channelId)) return { ok: false, status: 403 };

  // Quick lookup: does this channel belong to an org? Read with the CALLER's
  // client, so RLS answers "can you see this channel at all":
  // channels_select_member (a DM/group you have a row in) or
  // channels_select_org_member (can_view_org_channel).
  //
  // `kind` and `event_id` ride on the same read (chat rooms, wave 1), so the
  // routes know which room this is without asking twice. On a database
  // without the two columns the read is repeated with `org_id` alone and both
  // answer null: today's behaviour, never a 500 (contract section 3.10).
  async function readRow(withRoomColumns: boolean) {
    return supabase
      .from("channels")
      .select(withRoomColumns ? "org_id, kind, event_id" : "org_id")
      .eq("id", channelId)
      .maybeSingle();
  }
  let { data: found, error: channelErr } = await readRow(true);
  if (channelErr && isMissingChatSchema(channelErr)) {
    warnMissingChatSchemaOnce("messages.ensureMember");
    const bare = await readRow(false);
    found = bare.data;
    channelErr = bare.error;
  }
  if (channelErr) {
    console.error("[messages.ensureMember channel]", channelErr);
    return { ok: false, status: 500 };
  }
  const channel = found as unknown as {
    org_id: string | null;
    kind?: unknown;
    event_id?: unknown;
  } | null;

  // UNREADABLE CHANNEL = NOT A MEMBER (security wave 2, report #14). An
  // ex-member's club channel is hidden by channels RLS, so it used to read as
  // "no org" and fall into the DM branch below, where a leftover
  // channel_members row answered ok. Nobody who can't read the channel row
  // gets past this line; a real DM/group member always can.
  if (!channel) return { ok: false, status: 403 };

  if (channel.org_id) {
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
      orgId: channel.org_id,
      accepted_at: null,
      cleared_at: null,
      // Null on a database without the columns (the bare read above).
      kind: isRoomKind(channel.kind) ? channel.kind : null,
      eventId: typeof channel.event_id === "string" && channel.event_id !== "" ? channel.event_id : null,
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
    key.startsWith(`${MESSAGE_MEDIA_KEY_PREFIX}${channelId}/`) &&
    // The database trigger (20260927120000) allows one safe file name only;
    // checking the same rule here turns a crafted key into a 400, not a 500.
    isChannelMediaKey(key, channelId)
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
