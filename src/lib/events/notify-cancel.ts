/**
 * Telling everyone who RSVP'd that a club event is off (S68 officer tools,
 * B1; contract C1/C2). The rules are pure, in cancel-notice.ts; this file is
 * the two reads/writes around the DELETE in src/app/api/events/[id]/route.ts:
 *
 *   collect (before the delete: rsvps cascade with the event)
 *     -> delete (the caller's own client; must remove exactly one row)
 *     -> send (after it; a failed send never undoes the delete)
 *
 * SERVICE ROLE ONLY. `rsvps` under the officer's client is the officer's own
 * row plus the rows of events they manage, which is right today but is a
 * policy detail this must not depend on; and T2 (20260922120000) took INSERT
 * on notifications away from every signed-in client.
 *
 * ALWAYS DELIVERED (ruling 14): nothing here reads blocks or mutes. A
 * student who blocked the officer still hears that the club's event is off;
 * the notice names the club, never the officer (B2 renders it that way).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { kickPushDrain } from "@/lib/push/dispatch";

import {
  cancelNoticeRows,
  cancelRecipientIds,
  NOTIFIED_RSVP_STATUSES,
  type CancelledEvent,
} from "./cancel-notice";

/** PostgREST's default max rows; pages are read until one comes back short. */
const PAGE = 1000;
/** A runaway guard far above any club's RSVP list (SAE rush: dozens). */
const MAX_RECIPIENTS = 20_000;
/** Rows per insert. In practice every cancel is one insert. */
const INSERT_CHUNK = 1000;

export type CollectResult = { ok: true; ids: string[] } | { ok: false };

/**
 * Everyone with a going/maybe RSVP to the event, minus `actorId`. A read
 * error is `{ ok: false }`: the caller must NOT delete then, because once the
 * event is gone its RSVPs are too and nobody could be told.
 */
export async function collectCancelRecipients(
  service: SupabaseClient,
  eventId: string,
  actorId: string,
): Promise<CollectResult> {
  const rows: { user_id?: unknown; status?: unknown }[] = [];
  for (let from = 0; from < MAX_RECIPIENTS; from += PAGE) {
    const { data, error } = await service
      .from("rsvps")
      .select("user_id,status")
      .eq("event_id", eventId)
      .in("status", [...NOTIFIED_RSVP_STATUSES])
      .order("user_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("[events notify-cancel collect]", { eventId, code: error.code, message: error.message });
      return { ok: false };
    }
    const page = (data as { user_id?: unknown; status?: unknown }[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  if (rows.length >= MAX_RECIPIENTS) {
    console.warn("[events notify-cancel collect] recipient cap reached", { eventId, cap: MAX_RECIPIENTS });
  }
  return { ok: true, ids: cancelRecipientIds(rows, actorId) };
}

export type SendResult = { notified: number; failed: boolean };

/**
 * One C1 row per recipient, inserted with the service role, then a push
 * drain. LOGS, NEVER THROWS: the event is already deleted when this runs.
 * `notified` counts rows that were really written; `failed` is true when any
 * insert was refused (e.g. the migration isn't applied yet: 23514 or a
 * missing column). The log names the event and counts, never a student.
 */
export async function sendCancelNotices(
  service: SupabaseClient,
  input: { event: CancelledEvent; recipientIds: readonly string[]; actorId: string },
): Promise<SendResult> {
  const rows = cancelNoticeRows(input.event, input.recipientIds, input.actorId);
  let notified = 0;
  let failed = false;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    try {
      const { error } = await service.from("notifications").insert(chunk);
      if (error) {
        failed = true;
        console.error("[events notify-cancel send]", {
          eventId: input.event.id,
          rows: chunk.length,
          code: error.code,
          message: error.message,
        });
        continue;
      }
      notified += chunk.length;
    } catch (e) {
      failed = true;
      console.error("[events notify-cancel send]", { eventId: input.event.id, error: e });
    }
  }
  // The notifications trigger queued a push per row; drain after the
  // response. Returns at once and never throws (src/lib/push/dispatch.ts).
  if (notified > 0) kickPushDrain();
  return { notified, failed };
}
