import { NextResponse } from "next/server";

import { chatV2For } from "@/lib/chat/flag-server";
import { PIN_CAP } from "@/lib/chat/pin-rules";
import {
  PIN_AUTHOR_SELECT,
  PIN_LIST_SELECT,
  PIN_ROWS_MAX,
  pinAuthorIds,
  pinAuthors,
  toPinnedMessages,
  type PinRow,
} from "@/lib/chat/pins-read";
import { isMissingChatSchema } from "@/lib/chat/schema";
import { refusalBody, type MessagePinsResponse, type RefusalCode } from "@/lib/chat/types";
import { ensureMember } from "@/lib/messages/channel-access";
import { isUuid } from "@/lib/pgrest";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

type RouteCtx = { params: Promise<{ id: string }> };

const LOG = "message-pins.GET";

/** Per person and never stored: the list changes with every pin, and with the viewer's "Clear chat history". */
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** A refusal from the contract's table (wave-3 contract 4.3): the sentence and its code. */
function refuse(code: RefusalCode, status: number) {
  return NextResponse.json(refusalBody(code), { status, headers: NO_STORE });
}

/**
 * GET: the messages pinned in a dm or a group chat, newest pin first
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 4.3, 4d; the gates in
 * its order).
 *
 * NOT `/api/me/threads/[id]/pin`: that one pins a CHAT in my own list
 * (`channel_members.pinned_at`, "Pin to top"). This one lists the MESSAGES
 * pinned for everyone in the chat (`chat_message_pins`); its writes are
 * `PUT` / `DELETE /api/me/threads/[id]/messages/[messageId]/pin`.
 *
 * The rows are read with the service role, after the gates: the table has
 * no policy and no client grant (4b.1). What the viewer must not see is
 * dropped by `toPinnedMessages`: a pin whose message is removed, and one
 * from before their "Clear chat history" mark.
 *
 * The AUTHORS are read on the viewer's own client, never with the service
 * role: `users_select_authenticated` hides a suspended or banned account's
 * profile from everyone else, and the thread sends `users: null` for that
 * message, so the pin says `author: null` too. That read failing costs the
 * names, not the list (every author null, no 503).
 *
 * A database without the table (production until the migration is applied)
 * answers 404 `not_found`, which the screens read as "no pins here": every
 * pin control hides. Read-only, so no rate limit, and a pending request or a
 * restricted account may still read.
 */
export async function GET(_req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  // 1. auth
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  // 2. the flag (`chat_desktop` implies `chat_v2`, so this one answer gates both screens)
  if (!(await chatV2For(user.id))) return refuse("not_found", 404);

  // 3. an [id] that cannot name a chat
  if (!isUuid(channelId)) return refuse("not_found", 404);

  // 4. membership, and a dm or a group: a club room has no pinned messages
  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status, headers: NO_STORE });
  }
  if (member.isOrgChannel) return refuse("pins_chats_only", 400);

  // 5. the pins, with the service role
  if (!isSupabaseServiceConfigured()) {
    console.error(`[${LOG}] service role not configured`);
    return refuse("try_again", 503);
  }
  const { data, error } = await createSupabaseServiceClient()
    .from("chat_message_pins")
    .select(PIN_LIST_SELECT)
    .eq("channel_id", channelId)
    .order("pinned_at", { ascending: false })
    .limit(PIN_ROWS_MAX);
  if (error) {
    if (isMissingChatSchema(error)) return refuse("not_found", 404);
    console.error(`[${LOG}]`, error.code, error.message);
    return refuse("try_again", 503);
  }

  const rows = (data ?? []) as unknown as PinRow[];

  // 6. the authors, as the VIEWER may read them (RLS decides; a hidden profile stays hidden)
  const authorIds = pinAuthorIds(rows, member.cleared_at);
  let people: unknown[] | null = null;
  if (authorIds.length > 0) {
    const { data: found, error: peopleError } = await supabase.from("users").select(PIN_AUTHOR_SELECT).in("id", authorIds);
    if (peopleError) console.error(`[${LOG}] authors`, peopleError.code, peopleError.message);
    else people = found ?? [];
  }

  const body: MessagePinsResponse = {
    ok: true,
    pins: toPinnedMessages(rows, member.cleared_at, pinAuthors(people)),
    cap: PIN_CAP,
  };
  return NextResponse.json(body, { headers: NO_STORE });
}
