import { NextResponse } from "next/server";

import { blockedIdsFor } from "@/lib/chat/blocks";
import { hydrateCards } from "@/lib/chat/cards/hydrate";
import { chatV2For } from "@/lib/chat/flag-server";
import { roomOf } from "@/lib/chat/message-read";
import { clubRole } from "@/lib/chat/rooms";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import { refusalBody, type InvalidCardRefusal, type RefusalCode, type VoteResponse } from "@/lib/chat/types";
import { ensureMember } from "@/lib/messages/channel-access";
import { requireNotRestricted } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { rpcRefusal } from "../../_lib/rpc-refusal";

type RouteCtx = { params: Promise<{ id: string; messageId: string }> };

const LOG = "cards.vote";

/** A refusal from the contract's table (section 1.3): the sentence and its code. */
function refuse(code: RefusalCode, status: number) {
  return NextResponse.json(refusalBody(code), { status });
}

const invalidJson = () => NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

function invalidCard(field: "option_id" | "on") {
  const refused: InvalidCardRefusal = { ...refusalBody("invalid_card"), field };
  return NextResponse.json(refused, { status: 400 });
}

/**
 * PUT: a vote on a poll or a sign-up slot, on or off
 * (handoffs/chat-redesign/wave-2-contracts.md 4.3; the gates in its order).
 * The message is re-read on the viewer's client, scoped to this room, before
 * anything is written; `chat_cast_vote` (3.4) re-checks visibility and the
 * room rule with the service role; the card comes back through
 * `hydrateCards` with the viewer's block set (5.2), never with a name the
 * viewer may not see.
 */
export async function PUT(req: Request, ctx: RouteCtx) {
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

  // 2. the flag
  if (!(await chatV2For(user.id))) return refuse("not_found", 404);

  // 2b. a [messageId] that cannot name a message
  if (!isUuid(messageId)) return refuse("not_found", 404);

  // 3. the vote bucket
  const rl = await rateLimit(`card-vote:${user.id}`, { limit: 120, windowSec: 600 });
  if (!rl.allowed) return tooManyRequests(rl);

  // 4. Terms and restriction
  const gate = await requireNotRestricted(user.id);
  if (gate) return gate;

  // 5. JSON and the two fields
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalidJson();
  const { option_id: optionId, on } = body as { option_id?: unknown; on?: unknown };
  if (!isUuid(optionId)) return invalidCard("option_id");
  if (typeof on !== "boolean") return invalidCard("on");

  // 6. membership
  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status });
  }

  // 7. a club room only
  if (!member.isOrgChannel) return refuse("cards_club_rooms_only", 400);

  // 8. which room (as 4.1.10)
  const found = await roomOf(channelId, member);
  if (found.failed || (found.room === null && member.kind)) return refuse("try_again", 503);
  if (found.room === null) return refuse("not_found", 404);
  const room = found.room;

  // 9. the message, on the viewer's client and scoped to this room; never
  // `.maybeSingle()` on a read that may match twice. The viewer's own
  // removed poll comes back through RLS, so `removed_at` is checked here.
  const { data: rows, error: readError } = await supabase
    .from("messages")
    .select("id, kind, user_id, card_event_id, removed_at")
    .eq("id", messageId)
    .eq("channel_id", channelId)
    .limit(1);
  if (readError) {
    if (isMissingChatSchema(readError)) {
      warnMissingChatSchemaOnce(LOG);
      return refuse("not_found", 404);
    }
    console.error(`[${LOG} read]`, readError.code, readError.message);
    return refuse("try_again", 503);
  }
  const row = ((rows ?? []) as { id: string; kind?: unknown; user_id: string; card_event_id?: string | null; removed_at?: string | null }[])[0];
  if (!row || row.kind !== "poll" || (row.removed_at ?? null) !== null) return refuse("not_found", 404);

  // 10. the viewer's block set, read once
  const blocked = await blockedIdsFor(supabase, user.id);
  if (!blocked) return refuse("try_again", 503);

  // 11. the vote, with the service role (3.4)
  if (!isSupabaseServiceConfigured()) {
    console.error(`[${LOG}] service role not configured`);
    return refuse("try_again", 503);
  }
  const service = createSupabaseServiceClient();
  const { error: rpcError } = await service.rpc("chat_cast_vote", {
    p_poll: messageId,
    p_option: optionId,
    p_user: user.id,
    p_on: on,
  });
  if (rpcError) {
    const refused = await rpcRefusal(rpcError, {
      room,
      roleOf: () => clubRole(member.orgId, user.id),
      invalidField: "option_id",
      log: LOG,
    });
    return NextResponse.json(refused.body, { status: refused.status });
  }

  // 12. the card as the viewer now sees it (5.2)
  const cards = await hydrateCards(
    supabase,
    [{ id: row.id, kind: "poll", user_id: row.user_id, card_event_id: row.card_event_id ?? null }],
    user.id,
    { room, blocked },
  );
  const card = cards?.get(row.id) ?? null;
  if (!card || card.type === "event") {
    console.error(`[${LOG}] the card could not be read back`, { channelId, messageId });
    return refuse("try_again", 503);
  }
  const answer: VoteResponse = { ok: true, card };
  return NextResponse.json(answer);
}
