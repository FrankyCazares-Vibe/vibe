import { NextResponse } from "next/server";

import { DELETED_SHAPE_COLUMNS, hasDeletedShape, type DeletedShapeInput } from "@/lib/chat/deleted-note";
import { chatV2For } from "@/lib/chat/flag-server";
import { PIN_CAP, afterCleared } from "@/lib/chat/pin-rules";
import { PIN_LIVE_SELECT, PIN_ROWS_MAX, pinSlots, type PinRow } from "@/lib/chat/pins-read";
import { isMissingChatSchema } from "@/lib/chat/schema";
import { refusalBody, type PinMessageResponse, type RefusalCode } from "@/lib/chat/types";
import { ensureMember, type ChannelAccess } from "@/lib/messages/channel-access";
import { requireNotRestricted } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { dmSendBlocked } from "@/lib/safety/pair-block";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string; messageId: string }> };
type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;
type ChatAccess = Extract<ChannelAccess, { ok: true; isOrgChannel: false }>;

/** A refusal from the contract's table (wave-3 contract 4.3): the sentence and its code. */
function refuse(code: RefusalCode, status: number) {
  return NextResponse.json(refusalBody(code), { status });
}

function answer(body: PinMessageResponse) {
  return NextResponse.json(body);
}

type Entered =
  | { ok: true; supabase: ServerClient; userId: string; channelId: string; messageId: string; member: ChatAccess }
  | { ok: false; res: Response };

/**
 * The gates PUT and DELETE share, in the contract's order (4.3): signed in,
 * the flag, two ids that can name a chat and a message, a member, a dm or a
 * group, the pin bucket, Terms and restriction, and no pending request (the
 * caller has not accepted the chat yet: `accepted_at` is null).
 */
async function enter(ctx: RouteCtx): Promise<Entered> {
  const { id: channelId, messageId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const stop = (res: Response): Entered => ({ ok: false, res });

  // 1. auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return stop(NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }));

  // 2. the flag (`chat_desktop` implies `chat_v2`)
  if (!(await chatV2For(user.id))) return stop(refuse("not_found", 404));

  // 3. ids that cannot name a chat or a message
  if (!isUuid(channelId) || !isUuid(messageId)) return stop(refuse("not_found", 404));

  // 4. membership, and a dm or a group: a club room has no pinned messages
  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) return stop(NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status }));
  if (member.isOrgChannel) return stop(refuse("pins_chats_only", 400));

  // 5. the pin bucket (one for pin and unpin), then Terms and restriction
  const rl = await rateLimit(`message-pin:${user.id}`, { limit: 30, windowSec: 600 });
  if (!rl.allowed) return stop(tooManyRequests(rl));
  const gate = await requireNotRestricted(user.id);
  if (gate) return stop(gate);

  // 6. a pending message request pins nothing and unpins nothing (D14)
  if (member.accepted_at === null) return stop(refuse("pin_not_allowed", 403));

  return { ok: true, supabase, userId: user.id, channelId, messageId, member };
}

/** The service client for `chat_message_pins` (no policy, no client grant: 4b.1), or null where the key is not set. */
function pinsClient(log: string): ServiceClient | null {
  if (!isSupabaseServiceConfigured()) {
    console.error(`[${log}] service role not configured`);
    return null;
  }
  return createSupabaseServiceClient();
}

/**
 * PUT (no body): pin a MESSAGE for everyone in a dm or a group chat
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 4.3, 4d.3).
 *
 * NOT `/api/me/threads/[id]/pin`: that one pins a CHAT in my own list
 * (`channel_members.pinned_at`, "Pin to top"). This one writes
 * `chat_message_pins`: one row per message, read by
 * `GET /api/me/threads/[id]/message-pins`.
 *
 * After the shared gates: not in a blocked pair or a group holding one for
 * the caller (the send's own rule, `dmSendBlocked`; unpin stays allowed).
 * The message is read on the VIEWER's client, scoped to [id], so RLS answers
 * "may you see it": a message of another chat, one from before the caller's
 * "Clear chat history" mark, and a removed one (its author still reads their
 * own removed row; the trigger only drops a pin at the moment of removal, so
 * a pin made afterwards would stay and take a slot) are all 404 `not_found`.
 * Then the cap: `PIN_CAP` pins on messages that are still live, counted with
 * the service role; a message pinned already passes the cap and the insert's
 * duplicate key answers `already`. Two people pinning the 20th at the same
 * moment may leave 21: accepted.
 */
export async function PUT(_req: Request, ctx: RouteCtx) {
  const LOG = "message-pin.PUT";
  const entered = await enter(ctx);
  if (!entered.ok) return entered.res;
  const { supabase, userId, channelId, messageId, member } = entered;

  // 7. a blocked pair pins nothing. Fails closed: a check that cannot run is not "not blocked".
  const check = await dmSendBlocked(supabase, channelId, userId);
  if (!check.ok) {
    console.error(`[${LOG} block-check]`, check.error);
    return refuse("try_again", 503);
  }
  if (check.blocked) return refuse("pin_not_allowed", 403);

  // 8. the message, on the viewer's client, in THIS chat. A message its
  // sender deleted (its "Message deleted" note) is not there to pin: the
  // other person's open chat may still show the old bubble and its menu
  // (review of Oct 19, 2026). Told by the note's shape (DELETED_SHAPE_COLUMNS):
  // a row with no words, no file and no card holds nothing to pin anyway.
  const { data: found, error: lookupErr } = await supabase
    .from("messages")
    .select(`id, created_at, removed_at, ${DELETED_SHAPE_COLUMNS}`)
    .eq("id", messageId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (lookupErr) {
    if (isMissingChatSchema(lookupErr)) return refuse("not_found", 404);
    console.error(`[${LOG} lookup]`, lookupErr.code, lookupErr.message);
    return refuse("try_again", 503);
  }
  const message = found as ({ id: string; created_at: string; removed_at: string | null } & DeletedShapeInput) | null;
  if (!message || message.removed_at || hasDeletedShape(message)) return refuse("not_found", 404);
  if (!afterCleared(message.created_at, member.cleared_at)) return refuse("not_found", 404);

  // 9. the cap, over pins whose message is still live
  const service = pinsClient(LOG);
  if (!service) return refuse("try_again", 503);
  const { data: pinned, error: countErr } = await service
    .from("chat_message_pins")
    .select(PIN_LIVE_SELECT)
    .eq("channel_id", channelId)
    .limit(PIN_ROWS_MAX);
  if (countErr) {
    if (isMissingChatSchema(countErr)) return refuse("not_found", 404);
    console.error(`[${LOG} count]`, countErr.code, countErr.message);
    return refuse("try_again", 503);
  }
  const slots = pinSlots((pinned ?? []) as unknown as PinRow[], messageId);
  if (slots.live >= PIN_CAP && !slots.among) return refuse("pin_limit", 409);

  // 10. the pin. A duplicate key: pinned already (by anyone). A foreign key
  // that fails: the message was deleted a moment ago.
  const { error: insertErr } = await service
    .from("chat_message_pins")
    .insert({ message_id: messageId, channel_id: channelId, pinned_by: userId });
  if (insertErr) {
    if (insertErr.code === "23505") return answer({ ok: true, pinned: true, already: true });
    if (insertErr.code === "23503" || isMissingChatSchema(insertErr)) return refuse("not_found", 404);
    console.error(`[${LOG} insert]`, insertErr.code, insertErr.message);
    return refuse("try_again", 503);
  }
  return answer({ ok: true, pinned: true });
}

/**
 * DELETE: unpin a message, for everyone in the chat. Anyone in the chat may
 * unpin what anyone pinned (R7), a blocked pair included; a pending request
 * and a restricted account may not (the shared gates). The message itself is
 * not read: a pin on a message the caller cleared or can no longer see is
 * still theirs to take down. Zero rows deleted is the same answer.
 */
export async function DELETE(_req: Request, ctx: RouteCtx) {
  const LOG = "message-pin.DELETE";
  const entered = await enter(ctx);
  if (!entered.ok) return entered.res;
  const { channelId, messageId } = entered;

  const service = pinsClient(LOG);
  if (!service) return refuse("try_again", 503);
  const { error } = await service
    .from("chat_message_pins")
    .delete()
    .eq("message_id", messageId)
    .eq("channel_id", channelId);
  if (error) {
    if (isMissingChatSchema(error)) return refuse("not_found", 404);
    console.error(`[${LOG}]`, error.code, error.message);
    return refuse("try_again", 503);
  }
  return answer({ ok: true, pinned: false });
}
