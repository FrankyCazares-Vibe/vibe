import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Block checks between the viewer and other people, read from `blocks`.
 * The one block-pair module for the week-1 wave (rulings M11): T1's list and
 * repost routes use the one-target shape, T2's DM send and like routes use
 * the N-peer shape. Don't build a second `.or()` string over `blocks`
 * anywhere else; import from here.
 *
 *   one viewer, one target   pairBlockFilter / loadPairBlock
 *   one viewer, N peers      blockPairFilter / loadAnyPairBlock / dmSendBlocked
 *   a group chat, newcomers  groupBlockFilter / loadGroupBlockConflict (S67 A2)
 *
 * Every read uses the VIEWER's client, never the service client, except the
 * group shape at the bottom, which must use the service client (it explains
 * why). RLS
 * `blocks_select_either` lets either party of a block read its row, which is
 * exactly the question asked here. Every reader fails closed: a read error or
 * a bad id comes back as `{ ok: false }`, and callers answer 500, never "not
 * blocked".
 *
 * No `server-only` and no `@/` imports (rulings M11), so `node --test` loads
 * this file directly. The only import is the type above. That is why the UUID
 * check below is a copy of `src/lib/pgrest.ts:10-11`; the test checks that
 * the two agree.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Strict RFC-4122 UUID check, the same as `isUuid` in `src/lib/pgrest.ts`. */
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

// ── one viewer, one target ──────────────────────────────────────────────────

export type PairBlock =
  | { ok: true; blocked: boolean; viewerBlockedTarget: boolean; targetBlockedViewer: boolean }
  | { ok: false; error: unknown };

/** The exact .or() string bootstrap builds at users/[handle]/bootstrap/route.ts:119-122.
 *  It interpolates both ids as they are: check them with a strict UUID test
 *  first (loadPairBlock does). */
export function pairBlockFilter(viewerId: string, targetId: string): string {
  return (
    `and(blocker_id.eq.${targetId},blocked_id.eq.${viewerId}),` +
    `and(blocker_id.eq.${viewerId},blocked_id.eq.${targetId})`
  );
}

/** Reads `blocks` with the VIEWER's client (policy blocks_select_either), never service.
 *  viewerId === targetId → ok, all false, no query. A non-UUID id → { ok: false }.
 *  A read error → { ok: false, error }: callers answer 500, never "not blocked".
 *
 *  Both ids are checked before the self shortcut, so a malformed id never
 *  passes as "you, not blocked". `blocked` is true for a block in either
 *  direction; the two flags say which way (bootstrap shows different copy).
 *
 *  Ids are compared in lower case. The UUID check accepts either case and
 *  Postgres matches uuids in either case, but it always RETURNS them in lower
 *  case, so an id taken from a request in upper case would otherwise find the
 *  block row and still miss both flags. And any row the read returns counts
 *  as blocked, whichever flag it sets: fail closed. */
export async function loadPairBlock(
  client: SupabaseClient,
  viewerId: string,
  targetId: string,
): Promise<PairBlock> {
  if (!isUuid(viewerId) || !isUuid(targetId)) return { ok: false, error: "bad id" };
  const viewer = viewerId.toLowerCase();
  const target = targetId.toLowerCase();
  if (viewer === target) {
    return { ok: true, blocked: false, viewerBlockedTarget: false, targetBlockedViewer: false };
  }
  try {
    const { data, error } = await client
      .from("blocks")
      .select("blocker_id, blocked_id")
      .or(pairBlockFilter(viewer, target));
    if (error) return { ok: false, error };
    const rows = (data ?? []) as Array<{ blocker_id?: unknown; blocked_id?: unknown }>;
    const lower = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : v);
    let viewerBlockedTarget = false;
    let targetBlockedViewer = false;
    for (const row of rows) {
      const blocker = lower(row?.blocker_id);
      const blocked = lower(row?.blocked_id);
      if (blocker === viewer && blocked === target) viewerBlockedTarget = true;
      if (blocker === target && blocked === viewer) targetBlockedViewer = true;
    }
    return {
      ok: true,
      blocked: viewerBlockedTarget || targetBlockedViewer || rows.length > 0,
      viewerBlockedTarget,
      targetBlockedViewer,
    };
  } catch (error) {
    return { ok: false, error };
  }
}

// ── one viewer, N peers ─────────────────────────────────────────────────────

export type AnyPairBlock = { ok: true; blocked: boolean } | { ok: false; error: unknown };

/** A block in either direction between the viewer and ANY of the peers:
 *  `and(blocker_id.eq.<viewer>,blocked_id.in.(<ids>)),and(blocked_id.eq.<viewer>,blocker_id.in.(<ids>))`.
 *  Returns null when peerIds is empty or any id (viewer included) fails the
 *  strict UUID check, so no request text ever reaches the filter grammar.
 *  Peers keep their order; nothing is deduped. With one peer it matches the
 *  same rows as pairBlockFilter (the test checks this). */
export function blockPairFilter(viewerId: string, peerIds: string[]): string | null {
  if (!isUuid(viewerId) || peerIds.length === 0 || !peerIds.every(isUuid)) return null;
  const ids = peerIds.join(",");
  return (
    `and(blocker_id.eq.${viewerId},blocked_id.in.(${ids})),` +
    `and(blocked_id.eq.${viewerId},blocker_id.in.(${ids}))`
  );
}

/** Is the viewer in a block pair with any of the peers? Viewer's client only.
 *  No peers → { ok: true, blocked: false } with no query. A bad id →
 *  { ok: false, error: "bad id" }. A read error → { ok: false, error }.
 *  One row is enough, so the read stops at one. */
export async function loadAnyPairBlock(
  client: SupabaseClient,
  viewerId: string,
  peerIds: string[],
): Promise<AnyPairBlock> {
  if (!isUuid(viewerId)) return { ok: false, error: "bad id" };
  if (peerIds.length === 0) return { ok: true, blocked: false };
  const filter = blockPairFilter(viewerId, peerIds);
  if (filter === null) return { ok: false, error: "bad id" };
  try {
    const { data, error } = await client.from("blocks").select("blocker_id").or(filter).limit(1);
    if (error) return { ok: false, error };
    return { ok: true, blocked: (data ?? []).length > 0 };
  } catch (error) {
    return { ok: false, error };
  }
}

/** T2's DM send guard (T2.md E2), here so there is one block module (rulings M11).
 *  For non-org channels; the messages route skips org channels itself.
 *    1. channel_members.select("user_id").eq("channel_id", channelId)
 *       .neq("user_id", viewerId). An error → { ok: false }.
 *    2. No peers → { ok: true, blocked: false }, and `blocks` is never read.
 *    3. A bad id → { ok: false, error: "bad id" }.
 *    4. blocks.select("blocker_id").or(blockPairFilter(...)).limit(1). An error
 *       → { ok: false }. Any row → blocked (one block stops a group send too).
 *  Uses the caller's user client: RLS channel_members_select_member and
 *  blocks_select_either allow exactly these reads. */
export async function dmSendBlocked(
  supabase: SupabaseClient,
  channelId: string,
  viewerId: string,
): Promise<AnyPairBlock> {
  let peerIds: string[];
  try {
    const { data, error } = await supabase
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .neq("user_id", viewerId);
    if (error) return { ok: false, error };
    peerIds = ((data ?? []) as Array<{ user_id?: unknown }>).map((r) => r?.user_id as string);
  } catch (error) {
    return { ok: false, error };
  }
  if (peerIds.length === 0) return { ok: true, blocked: false };
  return loadAnyPairBlock(supabase, viewerId, peerIds);
}

// ── a group chat: newcomers against everyone (SERVICE client) ──────────────
//
// The one exception to "the viewer's client only" above, and on purpose.
// Adding someone to a group asks about pairs the viewer is NOT part of (the
// newcomer and each person already in the chat). blocks_select_either hides
// those rows from the viewer, and is_blocked_either_way answers false for
// them, so the viewer's client would pass every add: it fails OPEN. The
// caller passes the service client and uses only the yes/no, never the rows,
// so nobody learns who blocked whom (waveA-build.md product call 6).
//
// Why it matters: messages_insert_member refuses a send when the sender is in
// a block pair with ANY other member of a non-club channel, so one blocked pair
// inside a group silences both people in it.

/** Any block, either way, between a newcomer and anyone in the chat after the
 *  add (the people already there and the other newcomers):
 *  `and(blocker_id.in.(<new>),blocked_id.in.(<all>)),and(blocked_id.in.(<new>),blocker_id.in.(<all>))`
 *  with all = new ∪ existing, deduped, first-seen order. A pair of two people
 *  already in the chat is NOT asked about: they are there already, and one
 *  more member doesn't change what they can send. Null when there is no
 *  newcomer, or any id fails the strict UUID check. */
export function groupBlockFilter(newIds: string[], existingIds: string[]): string | null {
  if (newIds.length === 0) return null;
  if (!newIds.every(isUuid) || !existingIds.every(isUuid)) return null;
  const fresh = Array.from(new Set(newIds.map((id) => id.toLowerCase())));
  const all = Array.from(new Set([...fresh, ...existingIds.map((id) => id.toLowerCase())]));
  const n = fresh.join(",");
  const a = all.join(",");
  return (
    `and(blocker_id.in.(${n}),blocked_id.in.(${a})),` +
    `and(blocked_id.in.(${n}),blocker_id.in.(${a}))`
  );
}

/** Would this group have a blocked pair in it once the newcomers are in?
 *  SERVICE client only (see above). No newcomers → { ok: true, blocked:
 *  false } with no query. A bad id → { ok: false, error: "bad id" }. A read
 *  error → { ok: false, error }: callers answer 500, never "not blocked".
 *  `blocks_check` (blocker_id <> blocked_id) means any row is a real pair, so
 *  the read stops at one. */
export async function loadGroupBlockConflict(
  service: SupabaseClient,
  newIds: string[],
  existingIds: string[],
): Promise<AnyPairBlock> {
  if (newIds.length === 0) return { ok: true, blocked: false };
  const filter = groupBlockFilter(newIds, existingIds);
  if (filter === null) return { ok: false, error: "bad id" };
  try {
    const { data, error } = await service.from("blocks").select("blocker_id").or(filter).limit(1);
    if (error) return { ok: false, error };
    return { ok: true, blocked: (data ?? []).length > 0 };
  } catch (error) {
    return { ok: false, error };
  }
}
