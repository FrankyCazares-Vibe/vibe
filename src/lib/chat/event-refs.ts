/**
 * `eventRefsFor` (handoffs/chat-redesign/wave-2-contracts.md 5.5): one
 * `EventRef` builder for every read (the Event cards of a page, the inbox's
 * `next_event`, the space's rooms and `up_next`, the calendar's three
 * fields).
 *
 * Service role, three reads for the whole list — `rsvps` (skipped with
 * `counts: false`), `channels`, `channel_members` — plus the viewer's
 * `org_members` rows for the events' clubs. Then per event: `state` by
 * `roomState`; `room_id` = the room's id when the viewer holds a row on it
 * OR is an owner / admin of the club (the rule of `can_view_org_channel`'s
 * event arm, DM:3.6), else null; `viewer_status` from the viewer's own RSVP;
 * `going_count` / `maybe_count` from all RSVPs; `location` "" when null.
 * `null` on any failed read (logged). Not `event_rsvp_counts()`: it applies
 * `event_visible` to the caller and the service role has no `auth.uid()`.
 *
 * On a database without migration A (`channels.event_id` missing) the
 * `channels` read fails: null, one log line (contract 3.10, the calendar row).
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { BOARD_POSTER_ROLES, isClubRole } from "./room-rules";
import { roomState } from "./room-state";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "./schema";
import type { EventRef } from "./types";

export type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  org_id: string | null;
};

const TAG = "chat/event-refs";

/** Ids sent in one `in (...)` filter: keeps the request line well under the proxy's limit. */
const IDS_PER_READ = 100;

/** Going and maybe RSVPs read in one go per chunk of events; past this the counts are asked apart. */
const RSVPS_READ_MAX = 500;

type Status = "going" | "maybe";

type Tally = { going: Map<string, number>; maybe: Map<string, number>; mine: Map<string, Status> };

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

/** One log line for a failed read; a database without the chat schema is said once. */
function logFailed(what: string, error: { code?: string; message?: string }): void {
  if (isMissingChatSchema(error)) warnMissingChatSchemaOnce(TAG);
  else console.error(`[${TAG} ${what}]`, error.code, error.message);
}

/**
 * The going / maybe RSVPs of one chunk of events, in one read with the exact
 * total. More rows than one read holds: the two counts and the viewer's own
 * answer are asked apart, per event of the chunk, as `readRoomEvent` does.
 */
async function tallyRsvps(service: SupabaseClient, chunk: string[], viewerId: string, tally: Tally): Promise<boolean> {
  const { data, error, count } = await service
    .from("rsvps")
    .select("event_id, user_id, status", { count: "exact" })
    .in("event_id", chunk)
    .in("status", ["going", "maybe"])
    .limit(RSVPS_READ_MAX);
  if (error) {
    logFailed("rsvps", error);
    return false;
  }
  const rows = (data ?? []) as { event_id: string; user_id: string; status: unknown }[];
  const whole = typeof count === "number" ? count <= rows.length : rows.length < RSVPS_READ_MAX;
  if (whole) {
    for (const row of rows) {
      if (row.status !== "going" && row.status !== "maybe") continue;
      const bucket = row.status === "going" ? tally.going : tally.maybe;
      bucket.set(row.event_id, (bucket.get(row.event_id) ?? 0) + 1);
      if (row.user_id === viewerId) tally.mine.set(row.event_id, row.status);
    }
    return true;
  }
  for (const eventId of chunk) {
    const countOf = (s: Status) =>
      service.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", s);
    const [going, maybe, mine] = await Promise.all([
      countOf("going"),
      countOf("maybe"),
      service.from("rsvps").select("status").eq("event_id", eventId).eq("user_id", viewerId).maybeSingle(),
    ]);
    for (const res of [going, maybe, mine]) {
      if (res.error) {
        logFailed("rsvps counts", res.error);
        return false;
      }
    }
    tally.going.set(eventId, going.count ?? 0);
    tally.maybe.set(eventId, maybe.count ?? 0);
    const status = (mine.data as { status?: unknown } | null)?.status;
    if (status === "going" || status === "maybe") tally.mine.set(eventId, status);
  }
  return true;
}

export async function eventRefsFor(
  events: EventRow[],
  viewerId: string,
  opts?: { now?: Date; counts?: boolean },
): Promise<Map<string, EventRef> | null> {
  const refs = new Map<string, EventRef>();
  // Each event once, the first row given; nothing is read for an empty list.
  const rows: EventRow[] = [];
  const seen = new Set<string>();
  for (const row of events) {
    if (typeof row?.id !== "string" || seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  if (rows.length === 0) return refs;
  const now = opts?.now ?? new Date();
  const withCounts = opts?.counts !== false;
  const service = serviceOrNull();
  if (!service) return null;
  const ids = rows.map((row) => row.id);
  const orgIds = Array.from(new Set(rows.map((row) => row.org_id).filter((id): id is string => typeof id === "string")));

  const tally: Tally = { going: new Map(), maybe: new Map(), mine: new Map() };
  const roomOfEvent = new Map<string, string>();
  const officerOf = new Set<string>();

  // The RSVPs, the rooms and the viewer's roles do not depend on each other.
  const rsvpsRead = withCounts
    ? (async () => {
        for (const chunk of inChunks(ids, IDS_PER_READ)) {
          if (!(await tallyRsvps(service, chunk, viewerId, tally))) return false;
        }
        return true;
      })()
    : Promise.resolve(true);
  const roomsRead = (async () => {
    for (const chunk of inChunks(ids, IDS_PER_READ)) {
      const { data, error } = await service.from("channels").select("id, event_id").in("event_id", chunk);
      if (error) {
        logFailed("channels", error);
        return false;
      }
      for (const row of (data ?? []) as { id: string; event_id: string | null }[]) {
        if (typeof row.event_id === "string" && !roomOfEvent.has(row.event_id)) roomOfEvent.set(row.event_id, row.id);
      }
    }
    return true;
  })();
  const rolesRead = (async () => {
    for (const chunk of inChunks(orgIds, IDS_PER_READ)) {
      const { data, error } = await service
        .from("org_members")
        .select("org_id, role")
        .eq("user_id", viewerId)
        .in("org_id", chunk);
      if (error) {
        logFailed("org_members", error);
        return false;
      }
      for (const row of (data ?? []) as { org_id: string; role: unknown }[]) {
        if (isClubRole(row.role) && BOARD_POSTER_ROLES.includes(row.role)) officerOf.add(row.org_id);
      }
    }
    return true;
  })();
  const [rsvpsOk, roomsOk, rolesOk] = await Promise.all([rsvpsRead, roomsRead, rolesRead]);
  if (!rsvpsOk || !roomsOk || !rolesOk) return null;

  // The rooms the viewer holds a row on.
  const held = new Set<string>();
  for (const chunk of inChunks(Array.from(roomOfEvent.values()), IDS_PER_READ)) {
    const { data, error } = await service
      .from("channel_members")
      .select("channel_id")
      .in("channel_id", chunk)
      .eq("user_id", viewerId);
    if (error) {
      logFailed("channel_members", error);
      return null;
    }
    for (const row of (data ?? []) as { channel_id: string }[]) held.add(row.channel_id);
  }

  for (const row of rows) {
    const roomId = roomOfEvent.get(row.id) ?? null;
    const mayEnter =
      roomId !== null && (held.has(roomId) || (typeof row.org_id === "string" && officerOf.has(row.org_id)));
    refs.set(row.id, {
      id: row.id,
      title: typeof row.title === "string" ? row.title : "",
      // The two dates exactly as the database sent them (`roomState` reads the zone).
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      location: typeof row.location === "string" ? row.location : "",
      state: roomState(row.starts_at, row.ends_at, now),
      room_id: mayEnter ? roomId : null,
      viewer_status: withCounts ? (tally.mine.get(row.id) ?? null) : null,
      going_count: withCounts ? (tally.going.get(row.id) ?? 0) : 0,
      maybe_count: withCounts ? (tally.maybe.get(row.id) ?? 0) : 0,
    });
  }
  return refs;
}
