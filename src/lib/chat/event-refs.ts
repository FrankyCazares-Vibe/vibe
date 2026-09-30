/**
 * `eventRefsFor` (handoffs/chat-redesign/wave-2-contracts.md 5.5): one
 * `EventRef` builder for every read (the thread room, the Event cards, the
 * inbox's `next_event`, the space's rooms and `up_next`, the calendar).
 *
 * Service role, three reads for the whole list (`rsvps`, `channels`,
 * `channel_members`, plus the viewer's `org_members` rows), then per event:
 * `state`, `room_id` (when the viewer holds a row on the room OR is an owner
 * / admin of the club), `viewer_status`, the two counts, `location` "" when
 * null. With `counts: false` the `rsvps` read is skipped and the counts are
 * 0 / 0 / null. `null` on any failed read.
 *
 * SIGNATURE STUB (W2-B2's first commit): answers null; the body is filled
 * by W2-B2.
 */

import "server-only";

import type { EventRef } from "./types";

export type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  org_id: string | null;
};

export async function eventRefsFor(
  events: EventRow[],
  viewerId: string,
  opts?: { now?: Date; counts?: boolean },
): Promise<Map<string, EventRef> | null> {
  // filled by W2-B2
  void events;
  void viewerId;
  void opts;
  return null;
}
