/**
 * The message read shared by the thread routes and, from wave 2, the card
 * routes (handoffs/chat-redesign/wave-1-contracts.md section 6.1).
 *
 * Created in wave 1 (batch B0) by MOVING four pieces out of
 * `src/app/api/me/threads/[id]/messages/route.ts`, unchanged:
 * `MESSAGE_SELECT`, `hydrateReactions`, `hydrateParentPreviews`,
 * `prepareForClient`, and the row types they need. Nothing else was touched:
 * same columns, same queries, same defaults.
 *
 * Batch B4 (wave 1) added, HERE and not in the route: the new columns, the
 * missing-schema retry, `readChatMessages()` / `readChatMessage()`, the new
 * message fields (`toChatMessages`) and the room of a thread read
 * (`readThreadRoom`). Section 6.1 is the contract for all of it.
 *
 * Wave 2 (W2-B2; handoffs/chat-redesign/wave-2-contracts.md section 9)
 * added, here too: the viewer's block set and the stubs of section 8
 * (`buildChatMessages`, `readGoing`), the cards (`hydrateCards`, 5.2), the
 * `invalid_after` code (9.2) and the grouped reply count (9.4).
 *
 * WHICH CLIENT READS WHAT. The messages, their reactions, the quoted parents
 * and the people are read on the client the caller hands over. The routes
 * hand it the viewer's cookie client, so RLS decides which rows come back.
 * The service role reads only what is a fact about the room and not about
 * the viewer: the authors' roles, the reply counts, an event's counts.
 *
 * ON A DATABASE WITHOUT THE CHAT ROOMS SCHEMA (section 3.10) the read
 * answers today's data with every new field at its default.
 */

import {
  ensureMember,
  isChannelMessageMediaKey,
  messageMediaProxyUrl,
  type ChannelAccess,
} from "@/lib/messages/channel-access";
import {
  groupMessageReactions,
  type ReactionGroup,
  type ReactionRow,
} from "@/lib/messages/reaction-emoji";
import { orgAssetProxyUrl } from "@/lib/org-asset-url";
import { isUuid } from "@/lib/pgrest";
import { postMediaProxyUrl } from "@/lib/post-media-url";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { blockedIdsFor } from "./blocks";
import { hydrateCards, type CardRow } from "./cards/hydrate";
import { OFFICER_REMOVED_REASON, canModerate, isClubRole, postRuleLine } from "./room-rules";
import { roomState } from "./room-state";
import { canPostAnswer, clubRole, loadRoom } from "./rooms";
import { isMissingChatSchema, warnMissingChatSchemaOnce } from "./schema";
import { asStub, isHiddenFrom } from "./stub";
import {
  refusalBody,
  type Card,
  type ChatMessage,
  type ClubRole,
  type MessageKind,
  type OrgRef,
  type Person,
  type Refusal,
  type RefusalCode,
  type RemovedInfo,
  type Room,
  type ThreadRoom,
  type ViewerInRoom,
} from "./types";

/** The columns every message read shares, the joins aside. */
const MESSAGE_COLUMNS =
  "id, content, created_at, user_id, attachment_id, attachment_kind, media_url, media_kind, parent_message_id";

const MESSAGE_JOINS =
  "users:users!messages_user_id_fkey(id, handle, name, avatar_url), " +
  "attachment:posts!messages_attachment_id_fkey(id, type, content, media_url, media_thumbnail_url, user_id, author:users!posts_user_id_fkey(id, handle, name, avatar_url))";

/**
 * What a message read selects. `removed_at`, `removed_reason` and
 * `card_event_id` are read to build `removed` and, in wave 2, the card; they
 * never reach the JSON (`toChatMessages` lists the fields it sends).
 */
export const MESSAGE_SELECT =
  `${MESSAGE_COLUMNS}, kind, thread_root_id, card_event_id, removed_at, removed_reason, ` + MESSAGE_JOINS;

/** MESSAGE_SELECT as it was before the chat rooms migration, for a database without its columns. */
export const MESSAGE_SELECT_BEFORE_ROOMS = `${MESSAGE_COLUMNS}, ` + MESSAGE_JOINS;

/** The oldest fallback, kept from the route: no attachment, media or parent columns at all. */
export const MESSAGE_SELECT_BARE =
  "id, content, created_at, user_id, users:users!messages_user_id_fkey(id, handle, name, avatar_url)";

/** The errors the route has always answered with the bare select. */
const BARE_RETRY = /attachment|media|relationship|column|fkey/i;

export type MessageRow = {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  media_url?: string | null;
  media_kind?: string | null;
  attachment_id?: string | null;
  attachment_kind?: string | null;
  parent_message_id?: string | null;
  users?: unknown;
  attachment?: AttachmentRow | null;
  // Chat rooms (wave 1). Absent on a database without the columns.
  kind?: unknown;
  thread_root_id?: string | null;
  card_event_id?: string | null;
  removed_at?: string | null;
  removed_reason?: string | null;
  /** Only `readChatMessage` selects it; never sent. */
  channel_id?: string;
  // Filled in by hydrate helpers below.
  parent_preview?: ParentPreview | null;
  reactions?: ReactionGroup[];
};

// The shared post/clip joined via messages_attachment_id_fkey. null when the
// post is gone or RLS hides it from the viewer.
export type AttachmentRow = {
  id: string;
  type: string;
  content: string;
  media_url: string | null;
  media_thumbnail_url: string | null;
  user_id: string;
  author: { id: string; handle: string; name: string; avatar_url: string | null } | null;
};

export type ParentPreview = {
  id: string;
  content: string | null;
  user_id: string;
  author: { id: string; handle: string | null; name: string | null; avatar_url: string | null } | null;
  media_kind: "image" | "video" | null;
  attachment_kind: "post" | "clip" | null;
};

/**
 * Batch-fetch reactions for the given messages and attach a grouped
 * `reactions: [{emoji, count, viewer_reacted}]` array to each row. Stale
 * deploys: degrade silently if the table doesn't exist yet.
 */
export async function hydrateReactions(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: MessageRow[],
  viewerId: string,
): Promise<void> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  const { data, error } = await supabase
    .from("message_reactions")
    .select("message_id,emoji,user_id")
    .in("message_id", ids);
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[messages.hydrateReactions]", error.message);
    }
    return;
  }
  // Grouped per message, most-used first. A stored emoji that isn't on the
  // allow-list is dropped here, before anything is counted: the database
  // refuses new ones (message_reactions_emoji_check), and this keeps any row
  // written before that from ever reaching the chat screens, which show one
  // member's reaction to everyone else in the thread.
  const groups = groupMessageReactions((data ?? []) as ReactionRow[], viewerId);
  for (const m of rows) {
    m.reactions = groups.get(m.id) ?? [];
  }
}

/**
 * Batch-fetch the parent message previews for any rows that have a
 * `parent_message_id`. Just enough for the quote-stub render: id, content
 * snippet, author identity, plus media_kind / attachment_kind so a stub for
 * a photo, video or shared-post parent can say so instead of "Attachment".
 * Stale deploys (no parent_message_id column) degrade silently — which also
 * means a bad column in this select silently drops every stub in production,
 * so check a stub live after changing it.
 */
export async function hydrateParentPreviews(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: MessageRow[],
): Promise<void> {
  const parentIds = Array.from(
    new Set(
      rows
        .map((r) => r.parent_message_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );
  if (parentIds.length === 0) return;
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, content, user_id, media_kind, attachment_kind, author:users!messages_user_id_fkey(id, handle, name, avatar_url)",
    )
    .in("id", parentIds);
  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[messages.hydrateParentPreviews]", error.message);
    }
    return;
  }
  const byId = new Map<string, ParentPreview>();
  for (const p of data ?? []) {
    const row = p as unknown as ParentPreview;
    byId.set(row.id, {
      id: row.id,
      content: row.content,
      user_id: row.user_id,
      author: row.author ?? null,
      media_kind: row.media_kind ?? null,
      attachment_kind: row.attachment_kind ?? null,
    });
  }
  for (const m of rows) {
    if (m.parent_message_id) m.parent_preview = byId.get(m.parent_message_id) ?? null;
  }
}

/**
 * Last pass before rows go to the client. `media_url` becomes the stable
 * same-origin proxy (/api/me/threads/<channel>/messages/<id>/media) instead
 * of a signed R2 URL minted here: those died after 5 minutes, and desktop
 * only re-renders a bubble when its id changes, so an open thread's photos
 * and videos went dead until reload. A shared post's stored media is often
 * an R2 key too (org posts, clips), so it goes through the post media proxy
 * the same way. Hydrated fields get their empty defaults so every row has
 * the same keys.
 */
export function prepareForClient(rows: MessageRow[], channelId: string): void {
  for (const m of rows) {
    // Only a key the proxy will actually serve — anything else would render
    // as a broken image, so it's dropped here instead.
    m.media_url =
      m.media_url && isChannelMessageMediaKey(m.media_url, channelId)
        ? messageMediaProxyUrl(channelId, m.id)
        : null;
    m.media_kind = m.media_kind ?? null;
    const at = m.attachment ?? null;
    if (at) {
      at.media_url = postMediaProxyUrl(at.id, at.media_url, "media");
      at.media_thumbnail_url = postMediaProxyUrl(at.id, at.media_thumbnail_url, "thumbnail");
    }
    m.attachment = at;
    m.attachment_id = m.attachment_id ?? null;
    m.attachment_kind = m.attachment_kind ?? null;
    m.parent_message_id = m.parent_message_id ?? null;
    m.parent_preview = m.parent_preview ?? null;
    m.reactions = m.reactions ?? [];
  }
}

// ── Chat rooms, wave 1 (contract 6.1) ────────────────────────────────────────

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/** Ids sent in one `in (...)` filter: keeps the request line well under the proxy's limit. */
const IDS_PER_READ = 100;

/** Rows PostgREST hands back per read; the reply count reads page by page. */
const ROWS_PER_PAGE = 1000;

/** The most pages one reply count reads (5,000 replies under one page of posts). */
const REPLY_PAGES_MAX = 5;

/** The people shown as going in an event's chat. */
const GOING_SHOWN = 8;

/** Going and maybe RSVPs read in one go for an event's chat; past this the counts are asked apart. */
const RSVPS_READ_MAX = 500;

function inChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

/** The service-role client, or null (said once) where the key is not set. Never throws. */
function serviceOrNull(tag: string): ServiceClient | null {
  if (!isSupabaseServiceConfigured()) {
    console.error(`[${tag}] service role not configured`);
    return null;
  }
  try {
    return createSupabaseServiceClient();
  } catch (err) {
    console.error(`[${tag}]`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * A timestamp as the server sends `created_at`: a date, a time, and its
 * zone. `?after=` must be one of these, echoed unchanged.
 */
const SENT_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2})(?::?(\d{2}))?)$/i;

/** The same with the zone's "+" read as a space, which is what a query string does to a bare "+". */
const PLUS_LOST = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?) (\d{2}(?::?\d{2})?)$/;

/** Whether the fields of a `SENT_TIMESTAMP` match name a moment that exists (no month 13, no 25 o'clock). */
function namesARealMoment(match: RegExpExecArray): boolean {
  const [, y, mo, d, h, mi, s, zh, zm] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  // Day 0 of the next month is the last day of this one (UTC, so no zone moves it).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    year >= 1 &&
    month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth &&
    Number(h) <= 23 &&
    Number(mi) <= 59 &&
    (s === undefined || Number(s) <= 59) &&
    (zh === undefined || Number(zh) <= 15) &&
    (zm === undefined || Number(zm) <= 59)
  );
}

/**
 * `?after=` as the database can read it, or null when it is not a timestamp
 * the server could have sent: the wrong shape, or a moment that does not
 * exist (the database would refuse it). The string is never re-formatted (a
 * JavaScript `Date` would lose the microseconds); the one repair is a "+"
 * that arrived as a space because the client did not encode it.
 */
export function cleanAfterParam(raw: string): string | null {
  const text = raw.trim();
  const lost = PLUS_LOST.exec(text);
  const cleaned = lost ? `${lost[1]}+${lost[2]}` : text;
  const match = SENT_TIMESTAMP.exec(cleaned);
  return match && namesARealMoment(match) ? cleaned : null;
}

/** The most messages one read returns, and how many it returns when no limit is given. */
export const READ_LIMIT_MAX = 200;
export const READ_LIMIT_DEFAULT = 50;

/**
 * A page size the database can take: a whole number from 1 to 200. Not a
 * number: 50, or 200 for the replies under one post (they come whole).
 */
export function clampReadLimit(raw: unknown, root: boolean): number {
  const fallback = root ? READ_LIMIT_MAX : READ_LIMIT_DEFAULT;
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : fallback;
  return Math.min(READ_LIMIT_MAX, Math.max(1, n));
}

/**
 * Each person's role in the club, read once per page (service role). A
 * person who left has none. Null when the roles could not be read (a chunk
 * failed, or no service role): the caller never sends that as "no longer a
 * member".
 */
async function readRoles(orgId: string, userIds: string[]): Promise<Map<string, ClubRole> | null> {
  const roles = new Map<string, ClubRole>();
  const ids = Array.from(new Set(userIds.filter((id) => isUuid(id))));
  if (ids.length === 0) return roles;
  if (!isUuid(orgId)) return null;
  const service = serviceOrNull("chat/message-read.roles");
  if (!service) return null;
  const reads = inChunks(ids, IDS_PER_READ).map((chunk) =>
    service.from("org_members").select("user_id, role").eq("org_id", orgId).in("user_id", chunk),
  );
  for (const { data, error } of await Promise.all(reads)) {
    if (error) {
      console.error("[chat/message-read.roles]", error.code, error.message);
      return null;
    }
    for (const row of (data ?? []) as { user_id: string; role: unknown }[]) {
      if (isClubRole(row.role)) roles.set(row.user_id, row.role);
    }
  }
  return roles;
}

/**
 * How many replies stand under each Board post of the page, counted over the
 * page's post ids (service role). It counts what the viewer can open with
 * `?root=`: the live replies and the viewer's own removed ones (RLS shows a
 * member their own removed message), so a post never says "1 reply" above
 * two rows.
 *
 * Null when the count could not be read, so a screen never shows a wrong
 * number: a read that failed, or more replies than one read may walk
 * through (REPLY_PAGES_MAX pages per 100 posts). The first page carries the
 * exact total, and the walk stops when it has seen that many rows, so a
 * server that hands back shorter pages than asked is still counted whole.
 *
 * Wave 2 (contract 9.4): `chat_reply_counts` (migration B) answers the
 * grouped count per chunk of 100 post ids, the same numbers; a root with no
 * live reply returns no row, so every post starts at 0. On a database
 * without the function (`isMissingChatSchema`) the wave-1 walk below is the
 * fallback, warned once; any other error is null (the caller answers 503).
 */
async function readReplyCounts(
  channelId: string,
  postIds: string[],
  viewerId: string,
): Promise<Map<string, number> | null> {
  const counts = new Map<string, number>();
  const ids = postIds.filter((id) => isUuid(id));
  if (ids.length === 0) return counts;
  const service = serviceOrNull("chat/message-read.replyCounts");
  if (!service) return null;
  for (const id of ids) counts.set(id, 0);
  for (const chunk of inChunks(ids, IDS_PER_READ)) {
    const { data, error } = await service.rpc("chat_reply_counts", {
      p_channel: channelId,
      p_roots: chunk,
      p_viewer: viewerId,
    });
    if (error) {
      if (isMissingChatSchema(error)) {
        warnMissingChatSchemaOnce("chat/message-read.replyCounts");
        return walkReplyCounts(service, channelId, ids, viewerId);
      }
      console.error("[chat/message-read.replyCounts]", error.code, error.message);
      return null;
    }
    for (const row of (data ?? []) as { root: unknown; n: unknown }[]) {
      if (typeof row.root === "string" && counts.has(row.root) && typeof row.n === "number") counts.set(row.root, row.n);
    }
  }
  return counts;
}

/** The wave-1 reply count, kept as it was: the walk over `messages` (contract 3.10, the `readReplyCounts` row). */
async function walkReplyCounts(
  service: ServiceClient,
  channelId: string,
  ids: string[],
  viewerId: string,
): Promise<Map<string, number> | null> {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, 0);
  // The viewer's id comes from auth, a uuid, so it is safe inside the filter.
  const openable = isUuid(viewerId) ? `removed_at.is.null,user_id.eq.${viewerId}` : null;
  for (const chunk of inChunks(ids, IDS_PER_READ)) {
    let expected = 0;
    let seen = 0;
    for (let page = 0; ; page++) {
      if (page >= REPLY_PAGES_MAX) {
        console.error("[chat/message-read.replyCounts] more replies than one read counts", { channelId, expected });
        return null;
      }
      let query = service
        .from("messages")
        .select("thread_root_id", page === 0 ? { count: "exact" } : undefined)
        .eq("channel_id", channelId)
        .in("thread_root_id", chunk);
      query = openable ? query.or(openable) : query.is("removed_at", null);
      const { data, error, count } = await query
        .order("id", { ascending: true })
        .range(seen, seen + ROWS_PER_PAGE - 1);
      if (error) {
        console.error("[chat/message-read.replyCounts]", error.code, error.message);
        return null;
      }
      if (page === 0) {
        if (typeof count !== "number") return null;
        expected = count;
      }
      const rows = (data ?? []) as { thread_root_id: string | null }[];
      for (const row of rows) {
        if (row.thread_root_id) counts.set(row.thread_root_id, (counts.get(row.thread_root_id) ?? 0) + 1);
      }
      seen += rows.length;
      // Every row counted, or nothing more came back (replies deleted meanwhile).
      if (seen >= expected || rows.length === 0) break;
    }
  }
  return counts;
}

/** What `toChatMessages` needs to know about where the rows came from. */
export type MessageContext = {
  channelId: string;
  viewerId: string;
  /** The club room the rows are in; null for a dm, a group, or a database without the schema. */
  room: Room | null;
  /**
   * The rows are replies read with `?root=`, or one message just sent: no
   * reply count is read (a reply has none, a new post has 0).
   */
  skipReplyCounts?: boolean;
  /** A message just sent has no reactions yet: the read is skipped. */
  skipReactions?: boolean;
  /**
   * Also read this person's role (the viewer's, for `viewer.role`), in the
   * same `org_members` read as the authors'. Club rooms only.
   */
  alsoRoleOf?: string;
  /**
   * The viewer's block set (wave-2 contract 9.1, `blockedIdsFor`), when the
   * caller read it already. Absent in a club room: `buildChatMessages` reads
   * it itself, once. Never read for a dm or a group.
   */
  blocked?: ReadonlySet<string>;
};

/** What `buildChatMessages` read. */
type Built = {
  messages: ChatMessage[];
  /**
   * False when the authors' roles of a club room could not be read: every
   * `author_role` would say "no longer a member". A read answers 503
   * `try_again` for it.
   */
  complete: boolean;
  /** The roles that were read (authors and `alsoRoleOf`); null for a dm, a group, or a read that failed. */
  roles: Map<string, ClubRole> | null;
};

function messageKind(value: unknown): MessageKind {
  return value === "poll" || value === "event_card" ? value : "text";
}

/** The author as the screens get them. Null when their row is not readable. */
function toPerson(value: unknown): Person | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { id?: unknown; handle?: unknown; name?: unknown; avatar_url?: unknown };
  if (typeof row.id !== "string") return null;
  return {
    id: row.id,
    // Both are NOT NULL in `users` (checked Sept 29); the empty string keeps
    // the type's promise should that ever change (section 14.8).
    handle: typeof row.handle === "string" ? row.handle : "",
    name: typeof row.name === "string" ? row.name : "",
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
  };
}

/**
 * Only on the viewer's OWN removed message. `by` is "officer" when the stored
 * reason is the officers' exact text, else "moderator"; an officer's removal
 * carries no reason.
 */
function removedInfo(row: MessageRow, viewerId: string): RemovedInfo | null {
  if (!row.removed_at || row.user_id !== viewerId) return null;
  const officer = row.removed_reason === OFFICER_REMOVED_REASON;
  return {
    by: officer ? "officer" : "moderator",
    at: row.removed_at,
    reason: officer ? null : (row.removed_reason ?? null),
  };
}

/**
 * Rows as the screens get them (`ChatMessage`), in the order given. Reads the
 * reactions and the quoted parents on `client`, the authors' roles and the
 * reply counts with the service role, and lists every field it sends: a
 * column that is only read (`removed_at`, `removed_reason`, `card_event_id`,
 * `channel_id`) cannot reach the JSON.
 *
 * Someone else's removed message is dropped. RLS already hides it from the
 * viewer's client; this holds for any client the rows were read on.
 *
 * When the authors' roles cannot be read, `author_role` is null on every
 * row; this is for a message already stored (the send's answer), where a 503
 * would invite a resend. A read goes through `buildChatMessages` and answers
 * 503 `try_again` instead.
 */
export async function toChatMessages(
  client: ServerClient,
  rows: MessageRow[],
  ctx: MessageContext,
): Promise<ChatMessage[]> {
  return (await buildChatMessages(client, rows, ctx)).messages;
}

/**
 * `toChatMessages`, saying also whether every club fact could be read, and
 * the roles it read.
 *
 * Blocking in club rooms (wave-2 contract 8.3, 9.1). With the roles in
 * hand, a row by someone in the viewer's block set is replaced whole by the
 * stub of 8.1 (`isHiddenFrom`: a dm or a group never; a top-level Board post
 * by a current officer never), its card dropped with it. The quote under a
 * visible message (`parent_preview`) is nulled when its author is in the
 * set — no Board exception — and `parent_message_id` stays as sent.
 */
async function buildChatMessages(client: ServerClient, rows: MessageRow[], ctx: MessageContext): Promise<Built> {
  const { channelId, viewerId, room } = ctx;
  const shown = rows.filter((row) => !row.removed_at || row.user_id === viewerId);

  // The viewer's block set (wave-2 contract 9.1): the empty set for a dm or
  // a group, no read made; in a club room, read here FIRST only when no
  // caller passed it. A failed read is `complete: false`: a read answers 503
  // `try_again`; the send's answer, through `toChatMessages`, keeps its own
  // row with nothing hidden and no quote (never quote a blocked person on a
  // guess), said once in the log.
  let blocked: ReadonlySet<string> = room === null ? NO_BLOCKS : (ctx.blocked ?? NO_BLOCKS);
  let blocksRead = true;
  if (room !== null && ctx.blocked === undefined) {
    const read = await blockedIdsFor(client, viewerId);
    if (read) blocked = read;
    else blocksRead = false;
  }
  if (!blocksRead) warnBlocksUnreadOnce();

  const board = room !== null && room.kind === "board";
  const postIds = board && !ctx.skipReplyCounts
    ? shown.filter((row) => !row.thread_root_id).map((row) => row.id)
    : [];
  const roleIds = shown.map((row) => row.user_id);
  if (ctx.alsoRoleOf) roleIds.push(ctx.alsoRoleOf);
  // The cards of the page (wave-2 contract 5.2, 9.1): `shown` is a
  // viewer-scoped read, so its side tables may be read with the service
  // role. A removed message is never given to it (5.2, 6.2): the viewer's
  // own removed poll goes out with `removed` set and `card: null`. Not when
  // the block set is unknown either: the page is 503 then, and the send's
  // answer (`toChatMessages`) carries the sender's own text row, which has
  // no card — hydrating with an empty set would name a blocked voter on a
  // guess.
  const cardRows: CardRow[] = shown
    .filter((row) => !row.removed_at && messageKind(row.kind) !== "text")
    .map((row) => ({ id: row.id, kind: messageKind(row.kind), user_id: row.user_id, card_event_id: row.card_event_id ?? null }));
  const [roles, replyCounts, cards] = await Promise.all([
    room ? readRoles(room.org_id, roleIds) : Promise.resolve(null),
    postIds.length > 0 ? readReplyCounts(channelId, postIds, viewerId) : Promise.resolve(new Map<string, number>()),
    cardRows.length > 0 && blocksRead
      ? hydrateCards(client, cardRows, viewerId, { room, blocked })
      : Promise.resolve(new Map<string, Card>()),
    ctx.skipReactions ? Promise.resolve() : hydrateReactions(client, shown, viewerId),
    hydrateParentPreviews(client, shown),
  ]);
  // After hydration, so the empty defaults only fill what hydration left.
  prepareForClient(shown, channelId);

  const messages = shown.map((row): ChatMessage => {
    const authorRole = roles ? (roles.get(row.user_id) ?? null) : null;
    if (isHiddenFrom(row, blocked, room, authorRole)) return asStub(row);
    const topLevel = !row.thread_root_id;
    let replyCount: number | null = null;
    if (board && topLevel) {
      if (ctx.skipReplyCounts) replyCount = 0;
      else replyCount = replyCounts ? (replyCounts.get(row.id) ?? 0) : null;
    }
    const preview = row.parent_preview ?? null;
    const quoteShown = blocksRead && (preview === null || !blocked.has(preview.user_id));
    return {
      id: row.id,
      content: row.content,
      created_at: row.created_at,
      user_id: row.user_id,
      attachment_id: row.attachment_id ?? null,
      attachment_kind: row.attachment_kind ?? null,
      media_url: row.media_url ?? null,
      media_kind: row.media_kind ?? null,
      parent_message_id: row.parent_message_id ?? null,
      users: toPerson(row.users),
      attachment: row.attachment ?? null,
      parent_preview: quoteShown ? preview : null,
      reactions: row.reactions ?? [],
      kind: messageKind(row.kind),
      thread_root_id: row.thread_root_id ?? null,
      card: cards ? (cards.get(row.id) ?? null) : null,
      reply_count: replyCount,
      author_role: authorRole,
      hidden: false,
      removed: removedInfo(row, viewerId),
    };
  });
  return {
    messages,
    complete: (room === null || roles !== null) && blocksRead && cards !== null,
    roles,
  };
}

/** The block set of a dm or a group: nothing, and nothing read. */
const NO_BLOCKS: ReadonlySet<string> = new Set<string>();

let warnedBlocksUnread = false;

/** Said once per server instance: the send's answer went out with no quote because the block set could not be read (9.1). */
function warnBlocksUnreadOnce(): void {
  if (warnedBlocksUnread) return;
  warnedBlocksUnread = true;
  console.warn("[chat/message-read] the block set could not be read; the answer hides nothing and quotes nothing (a read answers 503 instead)");
}

/** `before` and `limit` as today; `after` and `root` as section 6.1 writes them. */
export type ReadOptions = { before?: string; after?: string; root?: string; limit: number };

/**
 * What the caller already asked, so it is not asked twice. Every field is
 * optional: a caller that knows nothing (the card routes of wave 2) leaves
 * it out and the read works it out.
 */
export type ReadKnown = {
  /** The signed-in person. */
  viewerId?: string;
  /** `ensureMember`'s yes for this channel and this person. */
  access?: Extract<ChannelAccess, { ok: true }>;
  /**
   * What `roomOf` answered for this channel. Null is an answer too (a dm, a
   * group, a database without the schema): when the field is there, the read
   * does not ask again.
   */
  room?: Room | null;
  /**
   * The viewer's block set, read once by the route (wave-2 contract 9.1,
   * `blockedIdsFor`). Absent: the read gets it itself in a club room.
   */
  blocked?: ReadonlySet<string>;
};

export type ReadFailure = {
  ok: false;
  status: number;
  body: Refusal | { ok: false; error: string };
};

export type ReadMessagesResult =
  | {
      ok: true;
      /** Oldest first. */
      messages: ChatMessage[];
      /** The club room that was read; null for a dm, a group, or a database without the schema. */
      room: Room | null;
      /**
       * The viewer's role in the room's club, read with the authors' roles
       * (one `org_members` read). Null for a dm, a group, a database without
       * the schema, or a viewer who is no longer in the club.
       */
      viewerRole: ClubRole | null;
    }
  | ReadFailure;

const failed = (status: number, error: string): ReadFailure => ({ ok: false, status, body: { ok: false, error } });
const refusal = (code: RefusalCode, status: number): ReadFailure => ({ ok: false, status, body: refusalBody(code) });
const postMissing = (): ReadFailure => refusal("board_post_missing", 404);
const tryAgain = (): ReadFailure => refusal("try_again", 503);

async function viewerOf(client: ServerClient, known?: ReadKnown): Promise<string | null> {
  if (known?.viewerId) return known.viewerId;
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

/**
 * The room behind a channel the viewer may enter. `failed` when
 * `ensureMember` named a kind and the room could not be read: that is a read
 * that failed, never a dm (rooms.ts `loadRoom`).
 */
export async function roomOf(
  channelId: string,
  access: Extract<ChannelAccess, { ok: true }>,
): Promise<{ room: Room | null; failed: boolean }> {
  if (!access.isOrgChannel || !access.kind) return { room: null, failed: false };
  const room = await loadRoom(channelId);
  return { room, failed: room === null };
}

/**
 * The root of `?root=`, read on the viewer's client first. A root that is
 * not visible, removed, or not a top-level Board post of this room is
 * missing ("no": 404 `board_post_missing`). A read that failed says nothing
 * about the post ("failed": 503 `try_again`), so a screen never drops a live
 * post on it. A database without the columns has no Board posts ("no").
 */
async function rootState(
  client: ServerClient,
  channelId: string,
  room: Room | null,
  root: string,
): Promise<"yes" | "no" | "failed"> {
  if (!room || room.kind !== "board" || !isUuid(root)) return "no";
  const { data, error } = await client
    .from("messages")
    .select("id, channel_id, thread_root_id, removed_at")
    .eq("id", root)
    .maybeSingle();
  if (error) {
    if (isMissingChatSchema(error)) return "no";
    console.error("[chat/message-read.root]", error.code, error.message);
    return "failed";
  }
  const row = data as { channel_id?: unknown; thread_root_id?: string | null; removed_at?: string | null } | null;
  if (!row) return "no";
  // The database compares uuids whatever their case; so does this.
  const sameRoom = typeof row.channel_id === "string" && row.channel_id.toLowerCase() === channelId.toLowerCase();
  return sameRoom && !row.thread_root_id && !row.removed_at ? "yes" : "no";
}

/**
 * One page of a thread, oldest first, as the screens get it.
 *
 *   no `after`, no `root`   the newest `limit` messages (older than `before`)
 *   `after`                 the first `limit` messages with created_at >= after
 *   `root`                  the replies under that Board post, from the oldest
 *   `before` with either    the newest `limit` rows before `before`, as
 *                           without them (`before` always pages backwards)
 *
 * In a club room, without `root`, only top-level messages are read: a reply
 * under a Board post is never shown as a post. A dm or a group keeps the
 * viewer's "Clear chat" line.
 *
 * `limit` is clamped here (1 to 200) and `after` checked here, whoever calls:
 * an `after` that is not a timestamp the server could have sent answers 400
 * `invalid_after` (wave-2 contract 9.2) and never reaches the database.
 */
export async function readChatMessages(
  client: ServerClient,
  channelId: string,
  opts: ReadOptions,
  known?: ReadKnown,
): Promise<ReadMessagesResult> {
  const root = opts.root;
  const limit = clampReadLimit(opts.limit, root !== undefined);
  let after: string | undefined;
  if (opts.after) {
    const cleaned = cleanAfterParam(opts.after);
    if (!cleaned) return refusal("invalid_after", 400);
    after = cleaned;
  }
  const before = opts.before || undefined;

  const viewerId = await viewerOf(client, known);
  if (!viewerId) return failed(401, "Unauthorized");
  const access = known?.access ?? (await ensureMember(client, channelId, viewerId));
  if (!access.ok) return failed(access.status, "Not a member");

  let room: Room | null;
  if (known && known.room !== undefined) {
    room = known.room;
  } else {
    const found = await roomOf(channelId, access);
    if (found.failed) return tryAgain();
    room = found.room;
  }

  if (root !== undefined) {
    const state = await rootState(client, channelId, room, root);
    if (state === "failed") return tryAgain();
    if (state === "no") return postMissing();
  }

  const clearedAt = access.isOrgChannel ? null : access.cleared_at;
  const oldestFirst = (after !== undefined || root !== undefined) && before === undefined;
  const run = (select: string, rooms: boolean) => {
    let q = client.from("messages").select(select).eq("channel_id", channelId);
    if (root !== undefined) q = q.eq("thread_root_id", root);
    else if (rooms && access.isOrgChannel) q = q.is("thread_root_id", null);
    if (before) q = q.lt("created_at", before);
    if (after) q = q.gte("created_at", after);
    if (clearedAt) q = q.gt("created_at", clearedAt);
    return q.order("created_at", { ascending: oldestFirst }).limit(limit);
  };

  // The full select first. A database without the chat rooms columns reads
  // again as before the migration; after that, the route's old bare retry.
  let rooms = true;
  let { data, error } = await run(MESSAGE_SELECT, rooms);
  if (error && isMissingChatSchema(error)) {
    warnMissingChatSchemaOnce("chat/message-read");
    if (root !== undefined) return postMissing();
    rooms = false;
    ({ data, error } = await run(MESSAGE_SELECT_BEFORE_ROOMS, rooms));
  }
  if (error && BARE_RETRY.test(error.message ?? "")) {
    ({ data, error } = await run(MESSAGE_SELECT_BARE, rooms));
    if (error && rooms && root === undefined && isMissingChatSchema(error)) {
      rooms = false;
      ({ data, error } = await run(MESSAGE_SELECT_BARE, rooms));
    }
  }
  if (error) {
    console.error("[chat/message-read]", error);
    return failed(500, "Request failed");
  }

  const rows = (data ?? []) as unknown as MessageRow[];
  const readRoom = rooms ? room : null;
  const built = await buildChatMessages(client, rows, {
    channelId,
    viewerId,
    room: readRoom,
    skipReplyCounts: root !== undefined,
    alsoRoleOf: viewerId,
    blocked: known?.blocked,
  });
  // A club room whose authors' roles could not be read: never a page that
  // says everyone left the club.
  if (!built.complete) return tryAgain();
  const messages = built.messages;
  if (!oldestFirst) messages.reverse();
  return {
    ok: true,
    messages,
    room: readRoom,
    viewerRole: readRoom && built.roles ? (built.roles.get(viewerId) ?? null) : null,
  };
}

/**
 * One message by id, as the screens get it, or null: no such message, not
 * visible on `client`, or a read that failed (logged). The card routes of
 * wave 2 read their new message back with this.
 */
export async function readChatMessage(
  client: ServerClient,
  id: string,
  known?: ReadKnown,
): Promise<ChatMessage | null> {
  if (!isUuid(id)) return null;
  const viewerId = await viewerOf(client, known);
  if (!viewerId) return null;

  const run = (select: string) => client.from("messages").select(`channel_id, ${select}`).eq("id", id).maybeSingle();
  let rooms = true;
  let { data, error } = await run(MESSAGE_SELECT);
  if (error && isMissingChatSchema(error)) {
    warnMissingChatSchemaOnce("chat/message-read");
    rooms = false;
    ({ data, error } = await run(MESSAGE_SELECT_BEFORE_ROOMS));
  }
  if (error) {
    console.error("[chat/message-read.one]", error.code, error.message);
    return null;
  }
  const row = data as unknown as MessageRow | null;
  if (!row || typeof row.channel_id !== "string") return null;

  // Null for a dm or a group; a club room that cannot be read is a failure,
  // never a message that looks like a dm's (no roles, no reply count).
  const room = rooms ? await loadRoom(row.channel_id) : null;
  if (rooms && !room) {
    const access = known?.access ?? (await ensureMember(client, row.channel_id, viewerId));
    if (!access.ok || (access.isOrgChannel && access.kind)) return null;
  }
  const built = await buildChatMessages(client, [row], {
    channelId: row.channel_id,
    viewerId,
    room,
    blocked: known?.blocked,
  });
  // The author's role could not be read: a read that failed, not "left the club".
  if (!built.complete) return null;
  return built.messages[0] ?? null;
}

/** The viewer of a dm, a group, or a club room on a database without the schema (section 3.10). */
export const VIEWER_OUTSIDE_ROOMS: ViewerInRoom = Object.freeze({
  role: null,
  can_post: true,
  can_reply: false,
  can_moderate: false,
});

/** The club behind a room, read on the viewer's client (a member reads their club). */
async function readOrgRef(client: ServerClient, orgId: string): Promise<OrgRef | null> {
  const { data, error } = await client
    .from("orgs")
    .select("id, handle, name, logo_url, banner_url, verified")
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    console.error("[chat/message-read.org]", error.code, error.message);
    return null;
  }
  const row = data as {
    id: string;
    handle: string;
    name: string;
    logo_url: string | null;
    banner_url: string | null;
    verified: boolean | null;
  } | null;
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    logo_url: orgAssetProxyUrl(row.handle, row.logo_url, "logo"),
    banner_url: orgAssetProxyUrl(row.handle, row.banner_url, "banner"),
    verified: row.verified === true,
  };
}

/**
 * The first 8 people going, by RSVP time, room members only: an RSVP by
 * someone who is not in the club writes no row in the room, and that person
 * is not named in it. `goingIds` are the going RSVPs, oldest first. The
 * room's rows are read with the service role, the people on the viewer's
 * client, a step at a time: a person the viewer cannot read (a restricted
 * account) or in the viewer's block set (wave-2 contract 8.3, `blocked`) is
 * left out AND the next room member going takes their place: still "the
 * first 8 visible". Null when a read failed (never a list with holes in it).
 */
async function readGoing(
  client: ServerClient,
  service: ServiceClient,
  room: Room,
  goingIds: string[],
  blocked: ReadonlySet<string>,
): Promise<Person[] | null> {
  const going: Person[] = [];
  for (const step of inChunks(goingIds, IDS_PER_READ)) {
    const { data: inRoom, error } = await service
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", room.id)
      .in("user_id", step);
    if (error) {
      console.error("[chat/message-read.going rows]", error.code, error.message);
      return null;
    }
    const members = new Set(((inRoom ?? []) as { user_id: string }[]).map((r) => r.user_id));
    const candidates = step.filter((id) => members.has(id) && !blocked.has(id));
    if (candidates.length === 0) continue;

    const { data: people, error: peopleError } = await client
      .from("users")
      .select("id, handle, name, avatar_url")
      .in("id", candidates);
    if (peopleError) {
      console.error("[chat/message-read.going people]", peopleError.code, peopleError.message);
      return null;
    }
    const byId = new Map<string, Person>();
    for (const row of people ?? []) {
      const person = toPerson(row);
      if (person) byId.set(person.id, person);
    }
    for (const id of candidates) {
      const person = byId.get(id);
      if (person) going.push(person);
      if (going.length >= GOING_SHOWN) return going;
    }
  }
  return going;
}

/** An event's chat: where, how many, the viewer's own answer, and the first people going (the block set handed down, 8.3). */
async function readRoomEvent(
  client: ServerClient,
  room: Room,
  viewerId: string,
  blocked: ReadonlySet<string>,
): Promise<ThreadRoom["event"] | "failed"> {
  const event = room.event;
  if (room.kind !== "event" || !event) return null;
  const service = serviceOrNull("chat/message-read.event");
  if (!service) return "failed";

  // Every going and maybe RSVP in one read, oldest first, with the exact
  // total: the two counts, the viewer's own answer and the order of the
  // people going all come from it.
  const [place, rsvps] = await Promise.all([
    service.from("events").select("location").eq("id", event.id).maybeSingle(),
    service
      .from("rsvps")
      .select("user_id, status", { count: "exact" })
      .eq("event_id", event.id)
      .in("status", ["going", "maybe"])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(RSVPS_READ_MAX),
  ]);
  for (const res of [place, rsvps]) {
    if (res.error) {
      console.error("[chat/message-read.event]", res.error.code, res.error.message);
      return "failed";
    }
  }
  const rows = (rsvps.data ?? []) as { user_id: string; status: unknown }[];
  const goingIds = rows.filter((r) => r.status === "going").map((r) => r.user_id);
  let goingCount = goingIds.length;
  let maybeCount = rows.filter((r) => r.status === "maybe").length;
  let status: unknown = rows.find((r) => r.user_id === viewerId)?.status;

  // More RSVPs than one read holds: the counts and the viewer's own answer
  // are asked on their own (the people going come from the first 500).
  const whole = typeof rsvps.count === "number" ? rsvps.count <= rows.length : rows.length < RSVPS_READ_MAX;
  if (!whole) {
    const countOf = (s: "going" | "maybe") =>
      service.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", event.id).eq("status", s);
    const [going, maybe, mine] = await Promise.all([
      countOf("going"),
      countOf("maybe"),
      service.from("rsvps").select("status").eq("event_id", event.id).eq("user_id", viewerId).maybeSingle(),
    ]);
    for (const res of [going, maybe, mine]) {
      if (res.error) {
        console.error("[chat/message-read.event counts]", res.error.code, res.error.message);
        return "failed";
      }
    }
    goingCount = going.count ?? 0;
    maybeCount = maybe.count ?? 0;
    status = (mine.data as { status?: unknown } | null)?.status;
  }

  const people = await readGoing(client, service, room, goingIds, blocked);
  if (!people) return "failed";
  const location = (place.data as { location?: unknown } | null)?.location;
  return {
    id: event.id,
    title: event.title,
    // The two dates exactly as the database sent them (`roomState` reads the zone).
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    location: typeof location === "string" ? location : "",
    state: roomState(event.starts_at, event.ends_at),
    // The viewer is in the room: they passed `ensureMember` for it.
    room_id: room.id,
    viewer_status: status === "going" || status === "maybe" ? status : null,
    going_count: goingCount,
    maybe_count: maybeCount,
    going: people,
  };
}

/** What a club room looks like to the viewer, all but their role (`viewerInRoom` adds it). */
export type RoomDescription = {
  room: ThreadRoom;
  /** The database's answer for a new top-level message by the viewer. */
  mayPost: boolean;
};

/**
 * `room` of a thread read (section 6.1) and the viewer's `can_post`, for a
 * club room the viewer passed `ensureMember` for. Null when the room cannot
 * be described (its club or its event could not be read): the route answers
 * 503 `try_again`, never a room with holes in it.
 *
 * `can_post` is the database's own answer for a new top-level message
 * (`can_post_org_channel`), so a Board says no to a member and an event's
 * chat says no once its 7 days are over. A question that could not be asked
 * is not a no: it answers null here too (503 `try_again`), so no screen
 * shows "Only officers post here." on a read that failed.
 *
 * The viewer's role is not read here: the thread read gets it in the same
 * `org_members` read as the authors' roles (`readChatMessages`,
 * `viewerRole`), one read fewer on every poll. `blocked` is the viewer's
 * block set, read once by the route (`blockedIdsFor`, wave-2 contract 9.1)
 * and handed down to `readGoing` (8.3).
 */
export async function describeRoom(
  client: ServerClient,
  room: Room,
  viewerId: string,
  blocked: ReadonlySet<string>,
): Promise<RoomDescription | null> {
  const [org, mayPost, event] = await Promise.all([
    readOrgRef(client, room.org_id),
    canPostAnswer(client, room.id, viewerId, null),
    readRoomEvent(client, room, viewerId, blocked),
  ]);
  if (!org || event === "failed" || mayPost === "failed") return null;
  return {
    room: { id: room.id, kind: room.kind, name: room.name, org, event },
    mayPost: mayPost === "yes",
  };
}

/**
 * `viewer` in a club room, or null when the viewer has no role in its club.
 * Everyone who passed `ensureMember` for a club room is a member of the club
 * (`can_view_org_channel` asks that first), so no role means a read that
 * failed or someone who left a moment ago: the route answers 503
 * `try_again`, never `role: null`, which section 6.0 keeps for a dm or a
 * group.
 *
 * `post_line` (wave-3 contract 4c.3) is the room's rule in words, set only
 * for a viewer the database refused in an extra room whose `post_policy` is
 * not `everyone`; the key is absent in every other case. A `Room` written by
 * hand has no `post_policy`: absent reads `everyone`, as `postRefusal` reads
 * it.
 */
export function viewerInRoom(room: Room, role: ClubRole | null, mayPost: boolean): ViewerInRoom | null {
  if (role === null) return null;
  const viewer: ViewerInRoom = {
    role,
    can_post: mayPost,
    can_reply: room.kind === "board",
    can_moderate: canModerate(role),
  };
  const policy = room.post_policy ?? "everyone";
  if (!mayPost && room.kind === "room" && policy !== "everyone") {
    const line = postRuleLine(policy);
    if (line) viewer.post_line = line;
  }
  return viewer;
}

/**
 * `room` and `viewer` together, for a caller that has not read the viewer's
 * role (the thread GET gets it with the page instead). It reads the block
 * set itself (wave-2 contract 9.1). Null when anything cannot be read: 503
 * `try_again`.
 */
export async function readThreadRoom(
  client: ServerClient,
  room: Room,
  viewerId: string,
): Promise<{ room: ThreadRoom; viewer: ViewerInRoom } | null> {
  const blocked = await blockedIdsFor(client, viewerId);
  if (!blocked) return null;
  const [described, role] = await Promise.all([
    describeRoom(client, room, viewerId, blocked),
    clubRole(room.org_id, viewerId),
  ]);
  if (!described) return null;
  const viewer = viewerInRoom(room, role, described.mayPost);
  return viewer ? { room: described.room, viewer } : null;
}
