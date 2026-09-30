/**
 * `snapshotCard` (handoffs/chat-redesign/wave-2-contracts.md 5.3): what a
 * report's message snapshot carries for a card, as the reporter saw it.
 * Service role. No voter names, no ids of people: the votes are read as
 * `option_id` only and counted. The report route calls it after
 * `readTarget` proved the reporter can read the message on their own
 * client; the snapshot never returns to the reporter.
 *
 * `null` for a text message, a missing card row, or a database without
 * migration B (`isMissingChatSchema`, warned once; 3.10: the snapshot has
 * `card: null`). A read that failed is logged and answers null too: a
 * report is never lost over its evidence.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { isMissingChatSchema, warnMissingChatSchemaOnce } from "../schema";
import type { CardSnapshot } from "../types";

const TAG = "chat/cards.snapshot";

type ReadError = { code?: string; message?: string } | null;

/** The service-role client, or null (said in the log) where the key is not set. Never throws. */
function serviceOrNull(): SupabaseClient | null {
  if (!isSupabaseServiceConfigured()) {
    console.error(`[${TAG}] service role not configured`);
    return null;
  }
  try {
    return createSupabaseServiceClient();
  } catch (err) {
    console.error(`[${TAG}]`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** True when the read failed; a database without the chat schema is said once, anything else logged. */
function failed(what: string, error: ReadError): boolean {
  if (!error) return false;
  if (isMissingChatSchema(error)) warnMissingChatSchemaOnce(TAG);
  else console.error(`[${TAG} ${what}]`, error.code, error.message);
  return true;
}

async function snapshotPoll(service: SupabaseClient, messageId: string): Promise<CardSnapshot | null> {
  const [poll, options, votes] = await Promise.all([
    service.from("chat_polls").select("mode, question, anonymous, multi, closes_at").eq("message_id", messageId).maybeSingle(),
    service
      .from("chat_poll_options")
      .select("id, position, label, capacity")
      .eq("poll_id", messageId)
      .order("position", { ascending: true }),
    // The option only: no `user_id` is ever selected here.
    service.from("chat_poll_votes").select("option_id").eq("poll_id", messageId),
  ]);
  if (failed("poll", poll.error) || failed("options", options.error) || failed("votes", votes.error)) return null;
  const row = poll.data as { mode?: unknown; question?: unknown; anonymous?: unknown; multi?: unknown; closes_at?: unknown } | null;
  if (!row) return null;
  const counts = new Map<string, number>();
  for (const vote of (votes.data ?? []) as { option_id: string }[]) {
    counts.set(vote.option_id, (counts.get(vote.option_id) ?? 0) + 1);
  }
  const optionRows = (options.data ?? []) as { id: string; position: number; label: unknown; capacity: unknown }[];
  return {
    type: row.mode === "signup" ? "signup" : "poll",
    question: typeof row.question === "string" ? row.question : "",
    anonymous: row.anonymous === true,
    multi: row.multi === true,
    closes_at: typeof row.closes_at === "string" ? row.closes_at : null,
    options: optionRows
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((option) => ({
        label: typeof option.label === "string" ? option.label : "",
        capacity: typeof option.capacity === "number" ? option.capacity : null,
        count: counts.get(option.id) ?? 0,
      })),
  };
}

async function snapshotEventCard(
  service: SupabaseClient,
  messageId: string,
  eventId: string | null,
): Promise<CardSnapshot | null> {
  const [card, event] = await Promise.all([
    service.from("chat_event_cards").select("note").eq("message_id", messageId).maybeSingle(),
    eventId !== null
      ? service.from("events").select("id, title, starts_at").eq("id", eventId).maybeSingle()
      : Promise.resolve({ data: null, error: null as ReadError }),
  ]);
  if (failed("event card", card.error) || failed("event", event.error)) return null;
  const note = (card.data as { note?: unknown } | null)?.note;
  if (!card.data) return null;
  // The event was cancelled (the FK set the column null), or is gone since.
  const row = event.data as { title?: unknown; starts_at?: unknown } | null;
  return {
    type: "event",
    event_id: eventId,
    title: typeof row?.title === "string" ? row.title : null,
    starts_at: typeof row?.starts_at === "string" ? row.starts_at : null,
    note: typeof note === "string" ? note : null,
  };
}

export async function snapshotCard(messageId: string): Promise<CardSnapshot | null> {
  const service = serviceOrNull();
  if (!service) return null;
  const message = await service.from("messages").select("kind, card_event_id").eq("id", messageId).maybeSingle();
  if (failed("message", message.error)) return null;
  const row = message.data as { kind?: unknown; card_event_id?: unknown } | null;
  if (!row) return null;
  if (row.kind === "poll") return snapshotPoll(service, messageId);
  if (row.kind === "event_card") {
    return snapshotEventCard(service, messageId, typeof row.card_event_id === "string" ? row.card_event_id : null);
  }
  return null;
}
