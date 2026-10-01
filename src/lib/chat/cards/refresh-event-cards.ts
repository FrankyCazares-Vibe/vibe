/**
 * An Event card's stored text follows its event (S71 amendment, F03; the
 * contract is `handoffs/chat-redesign/wave-2-build/S71-amendment.md`, B1-B3).
 *
 * `messages.content` of an Event card is written once, at creation
 * (`Event: <title> · <Thu Oct 8, 7:30 PM>[ — <note>]`, `fallback.ts`). The
 * phone card shows live data, but the old screens, the old inbox, previews
 * and reports show that text, so after an officer moves, renames or cancels
 * the event they would keep the old day and time. This file rewrites the
 * text; `PATCH` and `DELETE /api/events/[id]` call it.
 *
 *   loadEventCardMessages    the live Event cards of one event + their notes
 *   rewriteEventCardTexts    set the new text on those messages
 *   refreshEventCardTexts    both, for the PATCH (an edit)
 *
 * The DELETE splits the two on purpose: the FK `messages.card_event_id`
 * nulls itself when the event row goes, so the cards are loaded BEFORE the
 * delete and rewritten only after it was confirmed.
 *
 * NOTHING HERE EVER THROWS and nothing changes an answer: a failed read or
 * write is logged (`[chat/refresh-event-cards]`, the code and the message,
 * never a person) and reported in the result, which the routes only log. A
 * database without the chat tables or columns (`isMissingChatSchema`) has no
 * cards, so that read is an empty result and silent.
 *
 * SERVICE ROLE ONLY (the caller passes the client): `messages` is not
 * writable by clients for a stranger's row and `chat_event_cards` has no
 * policy. No `server-only` import and no `@/` import beyond what
 * `fallback.ts` reaches, so `node --test` loads it with a stub client
 * (refresh-event-cards.test.ts).
 *
 * BOUNDED WORK (S71 repair R2): an edit keeps each card's own note, so the
 * number of update statements is the number of DISTINCT notes, and any club
 * member can post Event cards. The rewrite therefore sends at most
 * `MAX_REWRITE_STATEMENTS` statements, `REWRITE_CONCURRENCY` at a time, and
 * starts no new one after `REWRITE_BUDGET_MS`. The newest cards come first
 * (the load is newest first); the rest keep their old text, are said in the
 * log once and make `ok` false. A cancel is one text for every card, so it
 * is at most five statements.
 *
 * LIMITS (documented, not built): a raw data-API edit or delete of an event,
 * the officer raw delete (audit M2) and cascade deletes do not refresh the
 * text; an event room that already closed is not touched; editing only the
 * `note` of a card is not a feature; past the bounds above (or past
 * `EVENT_CARD_CAP` cards) the oldest cards keep the stale day and time.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingChatSchema } from "../schema";
import { cardFallbackContent } from "./fallback";

const TAG = "[chat/refresh-event-cards]";

/** The most cards of one event read; an event has a handful, the cap is a runaway guard. */
export const EVENT_CARD_CAP = 500;

/** Ids sent in one `in (...)` filter, as `hydrate.ts` does: the request line stays far under the proxy's limit. */
const IDS_PER_REQUEST = 100;

/** The most `update` statements one rewrite sends; an edit needs one per distinct note (S71 repair R2). */
export const MAX_REWRITE_STATEMENTS = 50;

/** How many of those statements are in flight at once. */
export const REWRITE_CONCURRENCY = 10;

/** No new statement starts once a rewrite has run this long (milliseconds). */
export const REWRITE_BUDGET_MS = 5000;

/** The three bounds of one rewrite and the clock; the defaults are the constants above, the overrides are for tests. */
export type RewriteLimits = { maxStatements?: number; concurrency?: number; budgetMs?: number; now?: () => number };

/** The live Event cards of one event: their message ids and each one's `note`. */
export type EventCardMessages = { ids: string[]; notes: Map<string, string | null> };

/** What happened to the event: an edit (the new title and start) or a cancel (the title it had). */
export type EventCardChange =
  | { kind: "update"; title: string; starts_at: string }
  | { kind: "cancel"; title: string };

/** `ok` is false when any read or write failed; `updated` counts the messages really rewritten. */
export type RefreshResult = { ok: boolean; updated: number };

/** One log line: the tag, what failed, the error's code and message (an Error has no code). */
function logFailure(what: string, error: unknown): void {
  const { code, message } = (error && typeof error === "object" ? error : {}) as { code?: unknown; message?: unknown };
  console.error(`${TAG} ${what}`, code, message);
}

function inChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

const emptyResult = (): EventCardMessages => ({ ids: [], notes: new Map() });

/**
 * The Event cards of `eventId` that nobody removed (`kind = 'event_card'`,
 * `card_event_id = eventId`, `removed_at is null`; at most `EVENT_CARD_CAP`,
 * newest first, said in the log when the cap is hit) and each one's `note`
 * from `chat_event_cards`. `null` = a read failed (logged). A database
 * without the chat schema has no cards: an empty result, silently.
 */
export async function loadEventCardMessages(
  service: SupabaseClient,
  eventId: string,
): Promise<EventCardMessages | null> {
  try {
    const { data, error } = await service
      .from("messages")
      .select("id")
      .eq("kind", "event_card")
      .eq("card_event_id", eventId)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
      .limit(EVENT_CARD_CAP);
    if (error) {
      if (isMissingChatSchema(error)) return emptyResult();
      logFailure("read of the event's cards", error);
      return null;
    }
    const rows = Array.isArray(data) ? (data as { id?: unknown }[]) : [];
    const ids = rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
    if (rows.length >= EVENT_CARD_CAP) {
      console.warn(`${TAG} the event has ${EVENT_CARD_CAP} or more cards; only the newest ${EVENT_CARD_CAP} are refreshed`);
    }
    const notes = new Map<string, string | null>();
    for (const chunk of inChunks(ids, IDS_PER_REQUEST)) {
      const { data: noteRows, error: noteError } = await service
        .from("chat_event_cards")
        .select("message_id, note")
        .in("message_id", chunk);
      if (noteError) {
        if (isMissingChatSchema(noteError)) return emptyResult();
        logFailure("read of the cards' notes", noteError);
        return null;
      }
      for (const row of Array.isArray(noteRows) ? (noteRows as { message_id?: unknown; note?: unknown }[]) : []) {
        if (typeof row.message_id === "string") notes.set(row.message_id, typeof row.note === "string" ? row.note : null);
      }
    }
    return { ids, notes };
  } catch (err) {
    logFailure("read threw", err);
    return null;
  }
}

/** The text one card gets for `change`; `note` is the card's own (an edit keeps it, a cancel has none). */
function contentFor(change: EventCardChange, note: string | null): string {
  return change.kind === "cancel"
    ? cardFallbackContent({ type: "event_cancelled", title: change.title })
    : cardFallbackContent({ type: "event", title: change.title, starts_at: change.starts_at, note });
}

/**
 * `messages.content` of every card in `cards` set to the text of `change`:
 * `update messages set content where id in (...) and kind = 'event_card'`,
 * once per distinct text (a cancel is one text for every card, an edit one
 * per note) in batches of 100 ids. The statements run `REWRITE_CONCURRENCY`
 * at a time, at most `MAX_REWRITE_STATEMENTS` of them, and none starts after
 * `REWRITE_BUDGET_MS`; they start in the order the texts were first seen, so
 * the newest cards win. What was not sent is logged once and counts against
 * `ok`. One failed statement is logged and the others still run. Never
 * throws; `ok` is false if any statement failed or was left unsent, `updated`
 * counts the rows the database says it changed.
 */
export async function rewriteEventCardTexts(
  service: SupabaseClient,
  cards: EventCardMessages,
  change: EventCardChange,
  limits: RewriteLimits = {},
): Promise<RefreshResult> {
  const maxStatements = limits.maxStatements ?? MAX_REWRITE_STATEMENTS;
  const concurrency = Math.max(1, limits.concurrency ?? REWRITE_CONCURRENCY);
  const budgetMs = limits.budgetMs ?? REWRITE_BUDGET_MS;
  const now = limits.now ?? Date.now;
  const started = now();

  const byContent = new Map<string, string[]>();
  for (const id of cards.ids) {
    const content = contentFor(change, cards.notes.get(id) ?? null);
    const group = byContent.get(content);
    if (group) group.push(id);
    else byContent.set(content, [id]);
  }
  const statements: { content: string; ids: string[] }[] = [];
  for (const [content, ids] of byContent) {
    for (const chunk of inChunks(ids, IDS_PER_REQUEST)) statements.push({ content, ids: chunk });
  }
  const planned = statements.slice(0, Math.max(0, maxStatements));

  let ok = true;
  let updated = 0;
  let next = 0;
  const worker = async (): Promise<void> => {
    // `next` moves only here, with no await between the checks and the take
    while (next < planned.length && now() - started < budgetMs) {
      const { content, ids } = planned[next++];
      try {
        const { data, error } = await service
          .from("messages")
          .update({ content })
          .in("id", ids)
          .eq("kind", "event_card")
          .select("id");
        if (error) {
          ok = false;
          logFailure("rewrite of the cards' text", error);
          continue;
        }
        updated += Array.isArray(data) ? data.length : 0;
      } catch (err) {
        ok = false;
        logFailure("rewrite threw", err);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, planned.length) }, worker));

  const unsent = statements.slice(next);
  if (unsent.length > 0) {
    ok = false;
    const cardsLeft = unsent.reduce((sum, statement) => sum + statement.ids.length, 0);
    console.warn(
      `${TAG} over the bounds (${maxStatements} statements, ${budgetMs} ms): ${unsent.length} statements, ${cardsLeft} cards kept their old text`,
    );
  }
  return { ok, updated };
}

/** `loadEventCardMessages` then `rewriteEventCardTexts`: the PATCH's case (the event row stays, so the FK still finds its cards). */
export async function refreshEventCardTexts(
  service: SupabaseClient,
  eventId: string,
  change: EventCardChange,
): Promise<RefreshResult> {
  const cards = await loadEventCardMessages(service, eventId);
  if (cards === null) return { ok: false, updated: 0 };
  return rewriteEventCardTexts(service, cards, change);
}
