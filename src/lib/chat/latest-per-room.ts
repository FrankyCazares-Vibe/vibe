/**
 * The newest k messages PER ROOM, for the lists that show one preview (or one
 * unread dot) per room: the thread list, the Messages home, the Otto unread-DM
 * count and the app-icon badge (S71 amendment 2, sections 1-3).
 *
 * THE BUG IT FIXES: those reads used to ask for the newest messages of many
 * rooms in ONE query, `.in("channel_id", ids).limit(ids.length * k)`. That is
 * one window SHARED by every room, not k rows each: one busy room pushes every
 * other room's newest message out of it (a blank preview, a wrong unread dot,
 * a wrong club order, a stranger's request missing from Requests).
 *
 * THE FIX: `public.chat_latest_per_channel` (migration C,
 * supabase/migrations/20261001120000_chat_latest_per_room.sql), one call,
 * k rows per room, newest first. It is `security invoker`: it runs with the
 * CALLER's RLS, so it is called on the same client as today's read (the
 * cookie client for a student's own lists) and can never hand back a row the
 * caller could not read directly.
 *
 * BEFORE MIGRATION C: the code ships first. A missing function (PostgREST
 * `PGRST202`, Postgres `42883`: `isMissingChatSchema`) logs once per tag and
 * runs the caller's `sharedWindow` read, which is TODAY's query unchanged, so
 * a database without C answers exactly as it did. Any other error is handed
 * back for the caller's own handling, as today's read's error was.
 *
 * `fallbackOnAnyError` (S71b repair; the Messages home's previews set it): a
 * read whose select PostgREST could refuse on the FUNCTION while accepting it
 * on the table (an embed it cannot resolve there: `PGRST200`, `PGRST201`)
 * would otherwise show no preview at all from the day C lands. With the
 * option, any error of the function that is not "missing" is logged and
 * today's shared window is read once instead: an old preview beats none.
 *
 * TWO POSTGREST FACTS (14.5, proven against a clone of the local schema in a
 * throwaway PostgREST, `scratchpad/s71b/review/repair2/`): the `users` embed
 * with its `!messages_user_id_fkey` hint resolves on the function's rows as
 * on the table's (a bare `users(...)` is `PGRST201` on both: two foreign
 * keys); and `order=created_at.desc` on a function needs `created_at` IN the
 * select list (else `42703`, which reads as "missing" and would fall back to
 * the shared window for good), so every select passed here lists it.
 *
 * No `server-only` import, so `node --test` can load it.
 */

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { isMissingChatSchema, warnMissingChatSchemaOnce } from "./schema";

/** The function name, as PostgREST exposes it. */
export const LATEST_PER_ROOM_FN = "chat_latest_per_channel";

/**
 * The function reads only the first 500 ids of its array (a bound on one
 * call); a longer list is sent in chunks, so nobody's 501st room silently
 * loses its preview.
 */
export const LATEST_IDS_PER_CALL = 500;

/**
 * PostgREST caps ANY answer at `max_rows` (1000: `supabase/config.toml`, and
 * Supabase's hosted default), functions included, and this call orders newest
 * first. A chunk that could return more rows than that would be cut to the
 * 1000 newest overall: the shared window again, for the quiet rooms. So a
 * chunk never asks for more than this many rows.
 */
export const LATEST_ROWS_PER_CALL = 1000;

/** Ids per call for `per` rows a room: 200 at 5, 333 at 3, 500 at 1 or 2. */
export function idsPerCall(per: number): number {
  const k = Math.min(20, Math.max(1, Math.trunc(Number.isFinite(per) ? per : 1)));
  return Math.max(1, Math.min(LATEST_IDS_PER_CALL, Math.floor(LATEST_ROWS_PER_CALL / k)));
}

export type LatestPerRoomOptions = {
  /** The rooms; duplicates are dropped. */
  ids: readonly string[];
  /** Rows per room (the function clamps it to 1..20). */
  per: number;
  /** Only rows with `thread_root_id is null` (no replies under a Board post). */
  topLevelOnly: boolean;
  /** Only rows with `removed_at is null` (RLS shows an author their own removed row). */
  liveOnly: boolean;
  /**
   * The PostgREST select list, the same one today's read uses (embeds work:
   * the function returns `setof messages`). It MUST list `created_at`: the
   * call orders by it, and PostgREST refuses to order a function's rows by a
   * column the select leaves out.
   */
  select: string;
  /** The caller's log tag for the one-time "not in this database yet" line. */
  tag: string;
  /**
   * Also read `sharedWindow()` when the function answers any OTHER error
   * (logged every time, with the tag). Default false: the error is handed
   * back, today's handling.
   */
  fallbackOnAnyError?: boolean;
};

/** The shape both reads answer with: today's `{ data, error }`. */
type Answer = { data: unknown; error: PostgrestError | null };

export type LatestPerRoomResult = {
  /** Newest first within each room; `null` only with an error. */
  data: unknown[] | null;
  error: PostgrestError | null;
  /** True when the answer (rows or error) is the function's, false when it is today's shared window's. */
  perRoom: boolean;
};

function chunked(ids: readonly string[], per: number): string[][] {
  const unique = Array.from(new Set(ids));
  const size = idsPerCall(per);
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += size) out.push(unique.slice(i, i + size));
  return out;
}

/**
 * The newest `per` rows of each room in `ids`, through the function; on a
 * database without it, `sharedWindow()` (today's read) instead.
 *
 * Rows of one room are always newest first (the function orders them and
 * the call adds `order=created_at.desc`; a room's rows never span two
 * chunks), so a caller's "the first row of a room is its newest" stays true.
 */
export async function readLatestPerRoom(
  client: SupabaseClient,
  opts: LatestPerRoomOptions,
  sharedWindow: () => PromiseLike<Answer>,
): Promise<LatestPerRoomResult> {
  const chunks = chunked(opts.ids, opts.per);
  if (chunks.length === 0) return { data: [], error: null, perRoom: true };

  const answers: Answer[] = await Promise.all(
    chunks.map((chunk) =>
      client
        .rpc(LATEST_PER_ROOM_FN, {
          p_channels: chunk,
          p_per: opts.per,
          p_top_level_only: opts.topLevelOnly,
          p_live_only: opts.liveOnly,
        })
        .select(opts.select)
        .order("created_at", { ascending: false }),
    ),
  );

  const missing = answers.find((a) => a.error && isMissingChatSchema(a.error));
  if (missing) {
    warnMissingChatSchemaOnce(opts.tag);
    const { data, error } = await sharedWindow();
    return { data: error ? null : ((data ?? []) as unknown[]), error, perRoom: false };
  }
  const failed = answers.find((a) => a.error);
  if (failed?.error) {
    if (!opts.fallbackOnAnyError) return { data: null, error: failed.error, perRoom: true };
    console.error(`[${opts.tag}] the function refused this read; today's shared window instead:`, failed.error.code, failed.error.message);
    const { data, error } = await sharedWindow();
    return { data: error ? null : ((data ?? []) as unknown[]), error, perRoom: false };
  }

  const rows: unknown[] = [];
  for (const a of answers) if (Array.isArray(a.data)) rows.push(...(a.data as unknown[]));
  return { data: rows, error: null, perRoom: true };
}

/**
 * The column `readLatestPerRoomWithDeleted` adds to the select: set on a
 * message its sender deleted (the "Message deleted" note, Oct 19, 2026;
 * supabase/migrations/20261019150000_message_deleted_note.sql).
 */
export const DELETED_AT_COLUMN = "deleted_at";

/**
 * `readLatestPerRoom` for an UNREAD rule (Oct 20, 2026): the same read with
 * `deleted_at` in the select, so `newestLivePerRoom` can step over a note. A
 * note is nothing new to read, the way the club Board and Lounge counts
 * already leave it out (`/api/me/inbox`, review of Oct 19, 2026); the DM and
 * group unread dots, the Otto count and the app badge read through this.
 *
 * `sharedWindow(select)` is today's read for the select it is given. A
 * database without the column answers "missing" to the wider select, on the
 * function and on the table alike; the read is then made once more with
 * `opts.select` alone, today's read exactly, where no row is a note. (The
 * missing column also reads as a missing function inside `readLatestPerRoom`
 * and logs its one line per tag: only on a database without the migration.)
 */
export async function readLatestPerRoomWithDeleted(
  client: SupabaseClient,
  opts: LatestPerRoomOptions,
  sharedWindow: (select: string) => PromiseLike<Answer>,
): Promise<LatestPerRoomResult> {
  const wider = `${opts.select}, ${DELETED_AT_COLUMN}`;
  const first = await readLatestPerRoom(client, { ...opts, select: wider }, () => sharedWindow(wider));
  if (!first.error || !isMissingChatSchema(first.error)) return first;
  return readLatestPerRoom(client, opts, () => sharedWindow(opts.select));
}

/**
 * The newest row of each room that is not a note (`deleted_at` unset), from
 * rows newest first within each room, as `readLatestPerRoom` hands them. A
 * room whose every row read is a note has no entry: nothing in it to read.
 * `skip` leaves out more rows the same way (a club room's blocked authors).
 */
export function newestLivePerRoom<R extends { channel_id: string; deleted_at?: string | null }>(
  rows: readonly R[],
  skip?: (row: R) => boolean,
): Map<string, R> {
  const out = new Map<string, R>();
  for (const row of rows) {
    if (out.has(row.channel_id)) continue;
    if (row.deleted_at) continue;
    if (skip && skip(row)) continue;
    out.set(row.channel_id, row);
  }
  return out;
}
