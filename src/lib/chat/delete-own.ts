import { NextResponse } from "next/server";

import { isMissingChatSchema } from "@/lib/chat/schema";
import { refusalBody, type DeleteOwnResponse } from "@/lib/chat/types";
import { isChannelMediaKey } from "@/lib/posts/media-ownership";
import { deleteR2Keys, isR2Configured } from "@/lib/r2";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The sender's own delete (Oct 19, 2026; decision 8: a "Message deleted"
 * note stays in the message's place). Called by
 * `DELETE /api/me/threads/[id]/messages/[messageId]` once the cookie read
 * showed the row is the caller's.
 *
 * ONE database call, `delete_own_message` (20261019150000), on the caller's
 * own login: it checks the sender itself (auth.uid()), locks the row, takes
 * away the words, the file key, a shared post, a card, the reactions, pins,
 * notification rows and unsent phone notifications, and stamps `deleted_at`,
 * all in one transaction. A message the Vibe team or a club removed becomes
 * the note too (still hidden from everyone but its author), and keeps its
 * file as evidence.
 *
 * THE FILE. The function hands back the photo or video's storage key only
 * when nothing else needs it (no other message names it, it was not removed,
 * no report about it is open or acted on). It is deleted from storage here, after
 * the database said yes; a failure is logged (the code only) and never
 * changes the answer, like a deleted post's files.
 *
 * WITHOUT THE MIGRATION (production before Franky's yes, a Vercel preview):
 * the function is missing and the delete is today's hard delete, answered
 * `{ ok: true }` as before. The screens drop the row then.
 *
 * Never limited, also when a report is open: deleting your own words is
 * always allowed (wave-1 contract 12.6).
 */

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const LOG = "messages.DELETE own";

/** What `delete_own_message` answers. */
type FunctionAnswer = {
  status?: unknown;
  deleted_at?: unknown;
  purge_key?: unknown;
};

export async function deleteOwnMessage(
  supabase: ServerClient,
  { channelId, messageId, userId }: { channelId: string; messageId: string; userId: string },
): Promise<NextResponse> {
  const { data, error } = await supabase.rpc("delete_own_message", { p_message_id: messageId });
  if (error && isMissingChatSchema(error)) return hardDelete(supabase, messageId, userId);
  if (error) {
    console.error(`[${LOG}]`, error.code, error.message);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const answer = (data ?? {}) as FunctionAnswer;
  const deletedAt = typeof answer.deleted_at === "string" ? answer.deleted_at : undefined;
  switch (answer.status) {
    case "deleted": {
      if (typeof answer.purge_key === "string") await purgeFile(answer.purge_key, channelId);
      const body: DeleteOwnResponse = { ok: true, deleted: true, ...(deletedAt ? { deleted_at: deletedAt } : {}) };
      return NextResponse.json(body);
    }
    case "already": {
      const body: DeleteOwnResponse = { ok: true, deleted: true, already: true, ...(deletedAt ? { deleted_at: deletedAt } : {}) };
      return NextResponse.json(body);
    }
    case "not_found":
      // The cookie read showed it a moment ago: deleted whole by another tab, or the account changed.
      return NextResponse.json(refusalBody("not_found"), { status: 404 });
    default:
      console.error(`[${LOG}] unexpected answer`, typeof answer.status === "string" ? answer.status : typeof answer.status);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
}

/**
 * Today's delete, for a database without 20261019150000: RLS
 * (`messages_delete_own`) keeps it to the sender. Only reached there: the
 * same file drops that policy (Oct 19, 2026 review), so once it is applied
 * no login can hard-delete a message and skip the note. Counted: a delete
 * that touched no row (gone a moment ago, or a database that refused it,
 * e.g. the function not yet in PostgREST's cache right after the file ran)
 * is 404 `not_found`, never an `{ ok: true }` for a message still there.
 */
async function hardDelete(supabase: ServerClient, messageId: string, userId: string): Promise<NextResponse> {
  const { error, count } = await supabase.from("messages").delete({ count: "exact" }).eq("id", messageId).eq("user_id", userId);
  if (error) {
    console.error(`[${LOG} hard delete]`, error.code, error.message);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  if (count === 0) return NextResponse.json(refusalBody("not_found"), { status: 404 });
  return NextResponse.json({ ok: true } satisfies DeleteOwnResponse);
}

/**
 * The deleted message's photo or video, out of storage. Only a key in this
 * chat's own folder (`messages/<channelId>/<file>`; the database trigger
 * allows no other on a message, and this is checked again so a crafted key
 * can never reach another folder). Never throws.
 */
async function purgeFile(key: string, channelId: string): Promise<void> {
  if (!isChannelMediaKey(key, channelId)) {
    console.warn(`[${LOG} file] the key is not in this chat's folder; kept`);
    return;
  }
  if (!isR2Configured()) {
    console.warn(`[${LOG} file] storage is not configured here; the file stays`);
    return;
  }
  try {
    await deleteR2Keys([key]);
  } catch (err) {
    console.error(`[${LOG} file] delete failed; the file stays`, err instanceof Error ? err.name : "unknown error");
  }
}
