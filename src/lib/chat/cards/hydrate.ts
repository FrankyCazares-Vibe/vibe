/**
 * `hydrateCards` (handoffs/chat-redesign/wave-2-contracts.md 5.2): the
 * `card` of every poll, sign-up and Event card of a page, read from the side
 * tables with the service role and shaped for the viewer (the hidden-voter
 * rule, `closed`, `mine`).
 *
 * `client` is the viewer's cookie client (PRIVACY-M1). The side tables
 * (`chat_polls`, `chat_poll_options`, `chat_poll_votes`, `chat_event_cards`)
 * have no policy and are read with the service role, so this may only be
 * given rows that came out of a viewer-scoped read: its callers are
 * `buildChatMessages` (9.1) and the vote route (4.3.12). Rows with
 * `kind === "text"` are skipped; a removed message is never given to it.
 * The voters' `Person`s are read on `client` (`users_select_authenticated`),
 * so a restricted account's row does not come back and that voter is not
 * named.
 *
 * THE HIDDEN-VOTER RULE (one rule for blocked and unreadable people): for an
 * option, `all` = its votes in vote order; `visible` = the voters not in
 * `blocked` whose `Person` came back. `count` = `all.length` (counts never
 * change, D1). `voters` = the first 12 of `visible` (a poll) or all of
 * `visible` (a sign-up); `voters_more` = what a poll left out. `anonymous`
 * → `voters: []`, `voters_more: 0` for everyone, the creator included.
 *
 * `null` = a read failed (logged); the caller answers 503 `try_again`,
 * never a page with a card-less poll. On a database without migration B
 * (`isMissingChatSchema`): an empty map, warned once (3.10).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { eventRefsFor, type EventRow } from "../event-refs";
import { roomState } from "../room-state";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "../schema";
import type { Card, MessageKind, Person, PollCard, PollCardOption, Room } from "../types";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type CardRow = { id: string; kind: MessageKind; user_id: string; card_event_id: string | null };

export type HydrateOpts = { room: Room | null; blocked: ReadonlySet<string>; now?: Date };

const TAG = "chat/cards.hydrate";

/** Ids sent in one `in (...)` filter: keeps the request line well under the proxy's limit. */
const IDS_PER_READ = 100;

/** How many voters a poll's option names; a sign-up names them all. */
const POLL_VOTERS_SHOWN = 12;

type PollRow = {
  message_id: string;
  mode: unknown;
  question: unknown;
  anonymous: unknown;
  multi: unknown;
  closes_at: string | null;
};
type OptionRow = { id: string; poll_id: string; position: number; label: unknown; capacity: number | null };
type VoteRow = { option_id: string; poll_id: string; user_id: string };
type NoteRow = { message_id: string; note: string | null };

/** Why a read gave no rows: the schema is missing (3.10), or the read failed (logged). */
type Failure = "missing" | "failed";

type ReadError = { code?: string; message?: string } | null;

function inChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

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

/** Every row of `run` over `ids` in chunks of 100, in order; nothing is read for no ids. */
async function readAll<T>(
  what: string,
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: unknown; error: ReadError }>,
): Promise<T[] | Failure> {
  const rows: T[] = [];
  for (const chunk of inChunks(ids, IDS_PER_READ)) {
    const { data, error } = await run(chunk);
    if (error) {
      if (isMissingChatSchema(error)) return "missing";
      console.error(`[${TAG} ${what}]`, error.code, error.message);
      return "failed";
    }
    if (Array.isArray(data)) rows.push(...(data as T[]));
  }
  return rows;
}

/** A voter as the screens get them, from a `users` row the viewer could read. */
function toPerson(value: unknown): Person | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { id?: unknown; handle?: unknown; name?: unknown; avatar_url?: unknown };
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    // Both are NOT NULL in `users` (DM:5.2); the empty string keeps the type's promise.
    handle: typeof row.handle === "string" ? row.handle : "",
    name: typeof row.name === "string" ? row.name : "",
    // The stored value, unproxied, as `toPerson` in message-read.ts does (N23).
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
  };
}

/** `closes_at <= now`: a `timestamptz` string the database sent always parses; anything else is not "closed". */
function pastClosesAt(closesAt: string | null, now: Date): boolean {
  if (typeof closesAt !== "string") return false;
  const ms = Date.parse(closesAt);
  return Number.isFinite(ms) && ms <= now.getTime();
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group) group.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

function toPollCard(
  poll: PollRow,
  options: OptionRow[],
  votes: VoteRow[],
  people: Map<string, Person>,
  viewerId: string,
  opts: HydrateOpts,
  now: Date,
): PollCard {
  const anonymous = poll.anonymous === true;
  const type = poll.mode === "signup" ? "signup" : "poll";
  const votesByOption = groupBy(votes, (vote) => vote.option_id);
  const room = opts.room;
  const roomClosed =
    room !== null && room.kind === "event" && room.event !== null &&
    roomState(room.event.starts_at, room.event.ends_at, now) === "closed";
  const cardOptions = options
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((option): PollCardOption => {
      const all = votesByOption.get(option.id) ?? [];
      const visible: Person[] = [];
      for (const vote of all) {
        if (opts.blocked.has(vote.user_id)) continue;
        const person = people.get(vote.user_id);
        if (person) visible.push(person);
      }
      const voters = anonymous ? [] : type === "poll" ? visible.slice(0, POLL_VOTERS_SHOWN) : visible;
      const votersMore = anonymous || type !== "poll" ? 0 : visible.length - voters.length;
      const capacity = typeof option.capacity === "number" ? option.capacity : null;
      return {
        id: option.id,
        label: typeof option.label === "string" ? option.label : "",
        count: all.length,
        capacity,
        full: capacity !== null && all.length >= capacity,
        mine: all.some((vote) => vote.user_id === viewerId),
        voters,
        voters_more: votersMore,
      };
    });
  return {
    type,
    question: typeof poll.question === "string" ? poll.question : "",
    anonymous,
    multi: poll.multi === true,
    closes_at: typeof poll.closes_at === "string" ? poll.closes_at : null,
    closed: pastClosesAt(poll.closes_at, now) || roomClosed,
    total_voters: new Set(votes.map((vote) => vote.user_id)).size,
    options: cardOptions,
  };
}

export async function hydrateCards(
  client: ServerClient,
  rows: CardRow[],
  viewerId: string,
  opts: HydrateOpts,
): Promise<Map<string, Card> | null> {
  const cards = new Map<string, Card>();
  const pollIds: string[] = [];
  const eventCards: CardRow[] = [];
  for (const row of rows) {
    if (row.kind === "poll") pollIds.push(row.id);
    else if (row.kind === "event_card") eventCards.push(row);
  }
  if (pollIds.length === 0 && eventCards.length === 0) return cards;
  const now = opts.now ?? new Date();
  const service = serviceOrNull();
  if (!service) return null;
  const cardIds = eventCards.map((row) => row.id);
  const eventIds = Array.from(
    new Set(eventCards.map((row) => row.card_event_id).filter((id): id is string => typeof id === "string")),
  );

  // The side tables, then the events, all with the service role and none
  // depending on another. A side table that is not there is 3.10: no cards.
  const [polls, options, votes, notes, events] = await Promise.all([
    readAll<PollRow>("polls", pollIds, (chunk) =>
      service.from("chat_polls").select("message_id, mode, question, anonymous, multi, closes_at").in("message_id", chunk),
    ),
    readAll<OptionRow>("options", pollIds, (chunk) =>
      service
        .from("chat_poll_options")
        .select("id, poll_id, position, label, capacity")
        .in("poll_id", chunk)
        .order("position", { ascending: true }),
    ),
    readAll<VoteRow>("votes", pollIds, (chunk) =>
      service
        .from("chat_poll_votes")
        .select("option_id, poll_id, user_id")
        .in("poll_id", chunk)
        .order("created_at", { ascending: true })
        .order("user_id", { ascending: true }),
    ),
    readAll<NoteRow>("notes", cardIds, (chunk) =>
      service.from("chat_event_cards").select("message_id, note").in("message_id", chunk),
    ),
    readAll<EventRow>("events", eventIds, (chunk) =>
      service.from("events").select("id, title, starts_at, ends_at, location, org_id").in("id", chunk),
    ),
  ]);
  const sideTables = [polls, options, votes, notes];
  if (sideTables.includes("missing")) {
    warnMissingChatSchemaOnce(TAG);
    return cards;
  }
  if (sideTables.includes("failed") || typeof events === "string") return null;
  if (typeof polls === "string" || typeof options === "string" || typeof votes === "string" || typeof notes === "string") {
    return null;
  }

  // The voters, on the viewer's client (a person the viewer cannot read is
  // left out), and the Event cards' events, side by side.
  const voterIds = Array.from(new Set(votes.map((vote) => vote.user_id)));
  const [people, refs] = await Promise.all([
    readAll<unknown>("voters", voterIds, (chunk) =>
      client.from("users").select("id, handle, name, avatar_url").in("id", chunk),
    ),
    eventIds.length > 0 ? eventRefsFor(events, viewerId, { now }) : Promise.resolve(new Map()),
  ]);
  if (typeof people === "string" || refs === null) return null;
  const personById = new Map<string, Person>();
  for (const row of people) {
    const person = toPerson(row);
    if (person) personById.set(person.id, person);
  }

  const optionsByPoll = groupBy(options, (option) => option.poll_id);
  const votesByPoll = groupBy(votes, (vote) => vote.poll_id);
  for (const poll of polls) {
    if (typeof poll.message_id !== "string") continue;
    const card = toPollCard(
      poll,
      optionsByPoll.get(poll.message_id) ?? [],
      votesByPoll.get(poll.message_id) ?? [],
      personById,
      viewerId,
      opts,
      now,
    );
    cards.set(poll.message_id, card);
  }

  const noteOf = new Map<string, string | null>();
  for (const row of notes) noteOf.set(row.message_id, typeof row.note === "string" ? row.note : null);
  for (const row of eventCards) {
    // No side row (never after B: the RPC writes both in one transaction): no card.
    if (!noteOf.has(row.id)) continue;
    const note = noteOf.get(row.id) ?? null;
    if (row.card_event_id === null) {
      // The event was cancelled: the FK set the column null.
      cards.set(row.id, { type: "event", note, event: null });
      continue;
    }
    const event = refs.get(row.card_event_id) ?? null;
    if (!event) console.warn(`[${TAG}] the event of card ${row.id} could not be read`);
    cards.set(row.id, { type: "event", note, event });
  }
  return cards;
}
