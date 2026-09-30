import { NextResponse } from "next/server";

import { roomOf } from "@/lib/chat/message-read";
import { OFFICER_REMOVED_REASON, ROOM_MODERATOR_ROLES, outranks } from "@/lib/chat/room-rules";
import { clubRole } from "@/lib/chat/rooms";
import { refusalBody, type RefusalCode, type RemoveMessageResponse } from "@/lib/chat/types";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { ensureMember } from "@/lib/messages/channel-access";
import { requireNotRestricted } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string; messageId: string }> };

const LOG = "messages.DELETE";

/** A refusal from the contract's table (section 1.3): the sentence and its code. */
function refuse(code: RefusalCode, status: number) {
  return NextResponse.json(refusalBody(code), { status });
}

/** The moderator's answer (`RemoveMessageResponse`); the sender's own delete answers `{ ok: true }` as before. */
function removed(already: boolean) {
  const body: RemoveMessageResponse = already ? { ok: true, removed: true, already: true } : { ok: true, removed: true };
  return NextResponse.json(body);
}

/**
 * Delete a single message.
 *
 * THE SENDER: unchanged. RLS (`messages_delete_own`) restricts the hard
 * delete to the original sender; the cascade takes the reactions, a card's
 * side rows (`chat_polls` → options → votes, `chat_event_cards`) and, for a
 * Board post, its replies. Answers `{ ok: true }` as it always has.
 *
 * AN OFFICER OR A MOD OF THE CLUB (wave-2 contract 6.1, the gates in its
 * order): someone else's message in a club room is not deleted but marked
 * `removed_at` / `removed_by` / `removed_reason = OFFICER_REMOVED_REASON`
 * with the service role, so its author still reads it (with
 * `removed: { by: "officer" }`) and everyone else stops seeing it. The
 * caller must be at least a mod, must not be outranked by the author, and
 * the message must carry no open report (Vibe's moderators handle those).
 * Never a hard delete, no `moderation_actions` row, no report closed.
 *
 * A dm or a group has no officers: only the sender deletes there.
 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const { id: channelId, messageId } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  // 1. auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // 1b. a [messageId] that cannot name a message (after auth: an
  // unauthenticated call keeps its 401). A non-uuid [id] falls through: the
  // cookie read below has no row for it and `ensureMember` answers 403.
  if (!isUuid(messageId)) return refuse("not_found", 404);

  // 2. the row on the viewer's client, scoped to [id]. A non-uuid [id] can
  // match no row (PostgREST would answer 22P02 for it), so the read is
  // skipped for the same 0-row result.
  type Row = { id: string; user_id: string; channel_id: string };
  let msg: Row | null = null;
  if (isUuid(channelId)) {
    const { data, error: lookupErr } = await supabase
      .from("messages")
      .select("id, user_id, channel_id")
      .eq("id", messageId)
      .eq("channel_id", channelId)
      .maybeSingle();
    if (lookupErr) {
      console.error(`[${LOG} lookup]`, lookupErr);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    msg = (data as Row | null) ?? null;
  }

  // The sender's own delete: today's path, unlimited, also for a card and
  // also when a report is open (wave-1 contract 12.6).
  if (msg && msg.user_id === user.id) {
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", messageId)
      .eq("user_id", user.id);
    if (error) {
      console.error(`[${LOG}]`, error);
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // 3. someone else's row, or no row: a member of the channel, and a club room
  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status });
  }
  if (!member.isOrgChannel) return refuse("not_allowed", 403);

  // 4. the remove bucket, then Terms and restriction (after the sender's
  // path on purpose: their own delete is never limited)
  const rl = await rateLimit(`message-remove:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);
  const gate = await requireNotRestricted(user.id);
  if (gate) return gate;

  // 5. which room. `ensureMember` named a kind and the room cannot be read:
  // the read failed. No room (no chat schema): nothing to moderate.
  const found = await roomOf(channelId, member);
  if (found.failed) return refuse("try_again", 503);
  if (found.room === null) return refuse("not_found", 404);

  // 6. the caller's role: at least a mod (checked before the rank)
  const callerRole = await clubRole(member.orgId, user.id);
  if (callerRole === null || !ROOM_MODERATOR_ROLES.includes(callerRole)) return refuse("not_allowed", 403);

  if (!isSupabaseServiceConfigured()) {
    console.error(`[${LOG}] service role not configured`);
    return refuse("try_again", 503);
  }
  const service = createSupabaseServiceClient();

  // 7. no row on the viewer's client: RLS hides someone else's removed
  // message. One service read tells "removed already" (200) from "cannot
  // read it" (a private room they are not in, the Officers room to a mod:
  // 404) and from "no such message" (404).
  if (!msg) {
    const { data, error } = await service
      .from("messages")
      .select("id, user_id, removed_at")
      .eq("id", messageId)
      .eq("channel_id", channelId)
      .maybeSingle();
    if (error) {
      console.error(`[${LOG} service read]`, error.code, error.message);
      return refuse("try_again", 503);
    }
    const hidden = data as { id: string; user_id: string; removed_at: string | null } | null;
    if (!hidden) return refuse("not_found", 404);
    if (hidden.removed_at) return removed(true);
    return refuse("not_found", 404);
  }

  // 8. the author's rank now (null when they left the club): the caller
  // must not be outranked; equal rank is allowed.
  const authorRole = await clubRole(member.orgId, msg.user_id);
  if (!outranks(callerRole, authorRole)) return refuse("not_allowed", 403);

  // 9. an open report on this message is Vibe's moderators' to handle. On a
  // database without `reports.status` every report is an open one.
  const openReports = (withStatus: boolean) => {
    const q = service.from("reports").select("id").eq("target_type", "message").eq("target_id", messageId);
    return (withStatus ? q.eq("status", "open") : q).limit(1);
  };
  let reports = await openReports(true);
  if (reports.error && isMissingColumnError(reports.error, ["status"])) reports = await openReports(false);
  if (reports.error) {
    // Never removes over a report it could not read, never says "open" for
    // a read that failed.
    console.error(`[${LOG} reports]`, reports.error.code, reports.error.message);
    return refuse("try_again", 503);
  }
  if ((reports.data ?? []).length > 0) return refuse("report_open", 409);

  // 10. the mark, with the service role, only on a row nobody removed yet.
  // 0 rows: removed a moment ago (by someone else, or twice).
  const { data: marked, error: updateErr } = await service
    .from("messages")
    .update({ removed_at: new Date().toISOString(), removed_by: user.id, removed_reason: OFFICER_REMOVED_REASON })
    .eq("id", messageId)
    .eq("channel_id", channelId)
    .is("removed_at", null)
    .select("id");
  if (updateErr) {
    console.error(`[${LOG} update]`, updateErr.code, updateErr.message);
    return refuse("try_again", 503);
  }
  return removed((marked ?? []).length === 0);
}
