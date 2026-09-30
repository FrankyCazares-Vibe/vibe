/**
 * `hydrateCards` (handoffs/chat-redesign/wave-2-contracts.md 5.2): the
 * `card` of every poll, sign-up and Event card of a page, read from the side
 * tables with the service role and shaped for the viewer (the hidden-voter
 * rule, `closed`, `mine`).
 *
 * `client` is the viewer's cookie client: it may only be given rows that
 * came out of a viewer-scoped read (its callers are `buildChatMessages` and
 * the vote route), never a service-role page. Rows with `kind === "text"`
 * are skipped. `null` = a read failed (logged); the caller answers 503
 * `try_again`. On a database without migration B: an empty map, warned once.
 *
 * SIGNATURE STUB (W2-B2's first commit): answers an empty map so the reads
 * build against the final signature; the body is filled by W2-B2.
 */

import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

import type { Card, MessageKind, Room } from "../types";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type CardRow = { id: string; kind: MessageKind; user_id: string; card_event_id: string | null };

export type HydrateOpts = { room: Room | null; blocked: ReadonlySet<string>; now?: Date };

export async function hydrateCards(
  client: ServerClient,
  rows: CardRow[],
  viewerId: string,
  opts: HydrateOpts,
): Promise<Map<string, Card> | null> {
  // filled by W2-B2
  void client;
  void rows;
  void viewerId;
  void opts;
  return new Map<string, Card>();
}
