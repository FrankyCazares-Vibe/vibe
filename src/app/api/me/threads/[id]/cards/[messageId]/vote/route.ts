import { NextResponse } from "next/server";

import { blockedIdsFor } from "@/lib/chat/blocks";
import { hydrateCards } from "@/lib/chat/cards/hydrate";
import { chatV2For } from "@/lib/chat/flag-server";
import { roomOf } from "@/lib/chat/message-read";
import { clubRole } from "@/lib/chat/rooms";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "@/lib/chat/schema";
import { refusalBody, type ClubRole, type InvalidCardRefusal, type RefusalCode, type VoteResponse } from "@/lib/chat/types";
import { ensureMember } from "@/lib/messages/channel-access";
import { requireNotRestricted } from "@/lib/moderation/access";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { membersOnly } from "../../../_lib/club-follower";
import { rpcRefusal } from "../../_lib/rpc-refusal";

type RouteCtx = { params: Promise<{ id: string; messageId: string }> };

const LOG = "cards.vote";

/** The two refusals of `chat_cast_vote` a follower can meet: can't take part (P0C21), closed (P0C25). */
const FOLLOWER_SQLSTATES: ReadonlySet<string> = new Set(["P0C21", "P0C25"]);

/** An RPC error's SQLSTATE as rpcRefusal reads it. */
function sqlState(error: { code?: unknown }): string {
  return typeof error.code === "string" ? error.code.trim().toUpperCase() : "";
}

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
 *
 * A follower reading a club's Board reads its polls and never votes
 * (Franky, Oct 16): the database refuses, and this route answers that
 * refusal as 403 `members_only` (../../../_lib/club-follower.ts).
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
    // The role is read at most once, here or by rpcRefusal's P0C21.
    let role: ClubRole | null | undefined;
    const roleOf = async () => (role === undefined ? (role = await clubRole(member.orgId, user.id)) : role);
    // A follower reading the Board never votes (Franky, Oct 16). What they
    // get today is step 9's 404 `not_found`: since 20261017110000 a
    // follower reads no club message on their own client, and the follower's
    // Board offers no vote (FollowerBoard.tsx). This is a BACKSTOP for the
    // day that read widens (wave-3 review, finding 10): the vote rule refuses
    // them as "closed" (P0C25) or "can't post" (P0C21); with no role in the
    // club, the answer is `members_only`, not "This one is closed". Asked
    // only after the database said no, so a member's vote costs nothing more.
    if (FOLLOWER_SQLSTATES.has(sqlState(rpcError)) && (await roleOf()) === null) return membersOnly();
    const refused = await rpcRefusal(rpcError, { room, roleOf, invalidField: "option_id", log: LOG });
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
