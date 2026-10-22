import { NextResponse } from "next/server";

import { readCreateCardBody, type CleanCardBody } from "@/lib/chat/cards/body";
import { cardFallbackContent } from "@/lib/chat/cards/fallback";
import { chatV2For } from "@/lib/chat/flag-server";
import { readChatMessage, roomOf } from "@/lib/chat/message-read";
import { clubRole, clubRoleAnswer } from "@/lib/chat/rooms";
import {
  refusalBody,
  type ClubRole,
  type CreateCardResponse,
  type InvalidCardRefusal,
  type RefusalCode,
} from "@/lib/chat/types";
import { eventVisibilityOf } from "@/lib/events/validate";
import { ensureMember } from "@/lib/messages/channel-access";
import { contentBlockedResponse, requireCanPublish } from "@/lib/moderation/access";
import { checkText } from "@/lib/moderation/text-filter";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { membersOnly } from "../_lib/club-follower";
import { rpcRefusal } from "./_lib/rpc-refusal";

type RouteCtx = { params: Promise<{ id: string }> };

const LOG = "cards.POST";

/** A refusal from the contract's table (section 1.3): the sentence and its code. */
function refuse(code: RefusalCode, status: number) {
  return NextResponse.json(refusalBody(code), { status });
}

const invalidJson = () => NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });

/**
 * The word filter over the card's text, in the contract's order: the
 * question / title, every option label, the note (4.1.7). The first field
 * that fails is answered; a card carries no @mentions.
 */
function blockedField(card: CleanCardBody): string | null {
  if (card.type === "event") return card.note !== null && !checkText(card.note).ok ? "note" : null;
  if (!checkText(card.question).ok) return "question";
  for (let n = 0; n < card.options.length; n += 1) {
    if (!checkText(card.options[n].label).ok) return `options.${n}`;
  }
  return null;
}

/**
 * POST: a poll, a sign-up or an Event card in a club room
 * (handoffs/chat-redesign/wave-2-contracts.md 4.1; the gates in its order).
 * The RPCs of migration B (3.3, 3.4) write the message and its side rows in
 * one transaction, with the service role, after this route's gates; the
 * room rule and the shape are re-checked there (the second wall), the
 * person's gates are not (3.3.1). The new message is read back on the
 * viewer's client, so it comes through the same hydration and block set as
 * the thread read (9.1). No push, no mention notification, no
 * `last_read_at` bump.
 *
 * A follower reading a club's Board passes `ensureMember` (they can read it)
 * and never posts (Franky, Oct 16): the RPC's room rule refuses, and this
 * route answers that as 403 `members_only` (../_lib/club-follower.ts).
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const { id: channelId } = await ctx.params;
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

  // 3. the send bucket, shared with the message send
  const rl = await rateLimit(`message-send:${user.id}`, { limit: 60, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl);

  // 4. Terms, restriction, a verified school email
  const gate = await requireCanPublish(user.id);
  if (gate) return gate;

  // 5. JSON
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return invalidJson();
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return invalidJson();

  // 6. the shape (4.2)
  const now = new Date();
  const shape = readCreateCardBody(body, now);
  if (!shape.ok) {
    const refused: InvalidCardRefusal = { ...refusalBody("invalid_card"), field: shape.field };
    return NextResponse.json(refused, { status: 400 });
  }
  const card = shape.value;

  // 7. the word filter
  const blocked = blockedField(card);
  if (blocked) return contentBlockedResponse(blocked);

  // 8. membership
  const member = await ensureMember(supabase, channelId, user.id);
  if (!member.ok) {
    return NextResponse.json({ ok: false, error: "Not a member" }, { status: member.status });
  }

  // 9. a club room only
  if (!member.isOrgChannel) return refuse("cards_club_rooms_only", 400);

  // 10. which room. `ensureMember` named a kind and the room could not be
  // read: a read that failed. No kind at all: a database without migration A.
  const found = await roomOf(channelId, member);
  if (found.failed || (found.room === null && member.kind)) return refuse("try_again", 503);
  if (found.room === null) return refuse("not_found", 404);
  const room = found.room;

  if (!isSupabaseServiceConfigured()) {
    console.error(`[${LOG}] service role not configured`);
    return refuse("try_again", 503);
  }
  const service = createSupabaseServiceClient();

  // 11. the fallback text (5.1); an Event card's title and time come from
  // the event itself, which must be this club's and not over (the RPC's
  // `P0C23` is the second wall). A members-only event (Oct 22, 2026) never
  // goes on the Board, which followers read: 400 `event_members_only` (the
  // RPC's `P0C27` is the second wall). Any other club room is members-only,
  // so it may go there.
  let content: string;
  if (card.type === "event") {
    const { data, error } = await service
      .from("events")
      .select("id, title, starts_at, org_id, ends_at, visibility")
      .eq("id", card.event_id)
      .maybeSingle();
    if (error) {
      console.error(`[${LOG} event]`, error.code, error.message);
      return refuse("try_again", 503);
    }
    const event = data as { title?: unknown; starts_at?: unknown; org_id?: unknown; ends_at?: unknown; visibility?: unknown } | null;
    const endsAt = typeof event?.ends_at === "string" ? Date.parse(event.ends_at) : Number.NaN;
    if (!event || event.org_id !== member.orgId || !(endsAt > now.getTime()) || typeof event.starts_at !== "string") {
      return refuse("event_not_found", 404);
    }
    if (eventVisibilityOf(event.visibility) === "members") {
      // Someone outside the club (a follower on the Board) can't see this
      // event at all: the answer for an event they can't see, never a hint
      // that it exists. Asked only for a members-only event.
      const role = await clubRoleAnswer(member.orgId, user.id);
      if (role === "failed") return refuse("try_again", 503);
      if (role === null) return refuse("event_not_found", 404);
      if (room.kind === "board") return refuse("event_members_only", 400);
    }
    content = cardFallbackContent({
      type: "event",
      title: typeof event.title === "string" ? event.title : "",
      starts_at: event.starts_at,
      note: card.note,
    });
  } else {
    content = cardFallbackContent({ type: card.type, question: card.question });
  }

  // 12. the RPC, with the service role (3.3, 3.4)
  const rpc =
    card.type === "event"
      ? service.rpc("chat_create_event_card", {
          p_channel: channelId,
          p_user: user.id,
          p_event: card.event_id,
          p_note: card.note,
          p_content: content,
        })
      : service.rpc("chat_create_poll", {
          p_channel: channelId,
          p_user: user.id,
          p_mode: card.type,
          p_question: card.question,
          p_options: card.options,
          p_anonymous: card.type === "poll" ? card.anonymous : false,
          p_multi: card.type === "poll" ? card.multi : true,
          p_closes_at: card.closes_at,
          p_content: content,
        });
  const { data: created, error: rpcError } = await rpc;
  if (rpcError) {
    // The role is read at most once, here or by rpcRefusal's P0C21.
    let role: ClubRole | null | undefined;
    const roleOf = async () => (role === undefined ? (role = await clubRole(member.orgId, user.id)) : role);
    // A follower reading the Board never posts a card (Franky, Oct 16): the
    // room rule says no (P0C21), and with no role in the club the answer is
    // `members_only`, not "Only officers post here". Asked only after the
    // database said no.
    const code = typeof rpcError.code === "string" ? rpcError.code.trim().toUpperCase() : "";
    if (code === "P0C21" && (await roleOf()) === null) return membersOnly();
    // The event turned members-only between the check above and the RPC.
    if (code === "P0C27") return refuse("event_members_only", 400);
    const refused = await rpcRefusal(rpcError, {
      room,
      roleOf,
      // The one shape rule this route cannot pin: the moment may pass
      // between its check and the RPC's; an Event card's RPC checks the note.
      invalidField: card.type === "event" ? "note" : "closes_at",
      log: LOG,
    });
    return NextResponse.json(refused.body, { status: refused.status });
  }
  const messageId = typeof created === "string" ? created : null;
  if (!messageId) {
    console.error(`[${LOG}] the rpc answered no id`, { channelId });
    return refuse("try_again", 503);
  }

  // 13. read back on the viewer's client (9.1's hydration and block set),
  // tried once more before giving up: the row exists, so the sheet closes
  // and the room reloads on the 503; no second card is posted.
  const known = { viewerId: user.id, access: member };
  let message = await readChatMessage(supabase, messageId, known);
  if (!message) message = await readChatMessage(supabase, messageId, known);
  if (!message) {
    console.error(`[${LOG}] the new card could not be read back`, { channelId, messageId });
    return refuse("try_again", 503);
  }
  const answer: CreateCardResponse = { ok: true, message };
  return NextResponse.json(answer, { status: 201 });
}
