import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { hasRecordedConsent, CONSENT_COLUMNS } from "@/lib/legal/terms";
import { isUuid } from "@/lib/pgrest";
import { rateLimit } from "@/lib/rate-limit";
import { loadHiddenUsers, type HiddenUsers } from "@/lib/safety/hidden-users";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

import { loadBadgeCounts } from "./badge";
import {
  isMissingPushSchema,
  pushAllowedFor,
  pushEnabled,
  pushSiteOrigin,
  warnMissingPushSchemaOnce,
} from "./config";
import {
  MAX_ATTEMPTS,
  STALE_MS,
  buildPushMessage,
  deliveryFor,
  parsePushPrefs,
  pickDevices,
  pushKindOn,
  rowOutcome,
  toFcm,
  toWebPush,
  webPushTopic,
  type PushEvent,
  type PushKind,
  type PushMessage,
  type SendOutcome,
} from "./payload";
import { sendFcm } from "./send-fcm";
import { sendWebPush } from "./send-webpush";
import type { SendResult } from "./types";

/**
 * The push dispatcher (plan §7 2D; critic-push.md items 2, 4, 6–14, 21, 25
 * and 26, which override the plan where they differ).
 *
 * THE SHAPE: a `notifications` row (a trigger in the push migration queues it)
 * or a DM / group message (enqueueMessagePush below) becomes one `push_outbox`
 * row per recipient who has a device. `drainPushOutbox()` claims rows, asks
 * every safety question again AT SEND TIME, builds one message (payload.ts)
 * and hands it to each of the recipient's devices: Web Push for browsers and
 * the Home Screen web app, FCM for both store apps.
 *
 * FAIL CLOSED. A push can't be taken back once it's on a lock screen, and a
 * browser revokes permission for a push that shows nothing, so every rule
 * (research code-notifications.md §F) is checked here, before sending:
 * blocks either way, person mutes, chat mutes, one-person-in-a-group mutes,
 * hidden clubs, removed posts / comments / messages, restricted actor or
 * recipient, Terms consent, already read, older than 30 minutes, the kind
 * switched off, the allowlist. When a check can't run, nothing is sent: the
 * row is tried again on a later claim, and ends as "check_failed" on its last.
 *
 * EVERY ROW FINISHES: `sent_at` when any device took it, or a `skipped_reason`
 * (the vocabulary lives here; the table only checks `^[a-z_]{1,40}$`). Only a
 * row every device answered "try later" is left for claim_push_outbox to hand
 * out again, and that function ends it as "gave_up" after three tries.
 *
 * NEVER LOGGED: an endpoint, an FCM token, a key or any message text. Logs
 * carry counts, reasons and database error codes.
 *
 * SAFE BEFORE THE MIGRATION: code ships first. A missing table or function
 * (isMissingPushSchema) means "nothing to do", said once per server instance.
 */

// ── Scheduling: kickPushDrain and enqueueMessagePush (critic item 2) ────────

/** When a drain was last scheduled on this server instance (0 = none pending). */
let drainScheduledAt = 0;
/**
 * Kicks inside this window share the drain already scheduled. It's a window,
 * not a plain flag, so a drain that never ran (a killed function) can't stop
 * this instance from scheduling another one forever.
 */
const KICK_COALESCE_MS = 60_000;

/**
 * Schedule a drain after the response. Call it synchronously from a route,
 * after a successful write whose notification row the database already queued
 * (likes, follows, comments, mentions, club notices). Returns nothing, never
 * throws, and costs nothing while push is off (production today): no `after()`
 * and no query.
 */
export function kickPushDrain(): void {
  try {
    if (!pushEnabled(process.env)) return;
    const now = Date.now();
    if (drainScheduledAt !== 0 && now - drainScheduledAt < KICK_COALESCE_MS) return;
    drainScheduledAt = now;
    try {
      after(runScheduledDrain);
    } catch {
      // Outside a request scope after() throws; nothing was scheduled.
      drainScheduledAt = 0;
    }
  } catch {
    // Push must never fail the write that kicked it.
  }
}

async function runScheduledDrain(): Promise<void> {
  // Cleared as the drain starts: a kick from here on schedules a fresh one,
  // and every row queued before this point is already visible to this drain.
  drainScheduledAt = 0;
  try {
    await drainPushOutbox();
  } catch (e) {
    console.error("[push.drain] unexpected", errorCode(e));
  }
}

/**
 * Queue a DM or group message for push, then drain, in ONE after() callback
 * so the drain can't run before the rows exist (critic item 2). Club channels
 * are skipped: they push only through their @mention rows. Same promises as
 * kickPushDrain: synchronous, never throws, nothing at all while push is off.
 */
export function enqueueMessagePush(args: { messageId: string; channelId: string; senderId: string }): void {
  try {
    if (!pushEnabled(process.env)) return;
    const { messageId, channelId, senderId } = args ?? ({} as typeof args);
    if (!isUuid(messageId) || !isUuid(channelId) || !isUuid(senderId)) return;
    try {
      after(async () => {
        try {
          await enqueueNow(messageId.toLowerCase(), channelId.toLowerCase(), senderId.toLowerCase());
        } catch (e) {
          console.error("[push.enqueue] unexpected", errorCode(e));
        }
        try {
          await drainPushOutbox();
        } catch (e) {
          console.error("[push.drain] unexpected", errorCode(e));
        }
      });
    } catch {
      // Outside a request scope: nothing scheduled.
    }
  } catch {
    // Never fail the send.
  }
}

/**
 * One outbox row per member of a DM or group except the sender, pending
 * request or not, and only for people with a registered device (the rest
 * would only be skipped). The message is read back rather than trusted from
 * the caller: it must be this sender's, in this channel.
 */
async function enqueueNow(messageId: string, channelId: string, senderId: string): Promise<void> {
  if (!isSupabaseServiceConfigured()) return;
  const service = createSupabaseServiceClient();

  const [msgRes, channelRes] = await Promise.all([
    service.from("messages").select("id, channel_id, user_id").eq("id", messageId).maybeSingle(),
    service.from("channels").select("id, type, org_id").eq("id", channelId).maybeSingle(),
  ]);
  if (msgRes.error || channelRes.error) {
    console.error("[push.enqueue] read", errorCode(msgRes.error ?? channelRes.error));
    return;
  }
  const msg = msgRes.data as { channel_id?: string; user_id?: string } | null;
  const channel = channelRes.data as { type?: string; org_id?: string | null } | null;
  if (!msg || msg.channel_id !== channelId || msg.user_id !== senderId) return;
  if (!channel || channel.org_id || (channel.type !== "dm" && channel.type !== "group")) return;

  const membersRes = await service
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", channelId)
    .neq("user_id", senderId);
  if (membersRes.error) {
    console.error("[push.enqueue] members", errorCode(membersRes.error));
    return;
  }
  // The allowlist is pure, so it trims the list before any device read.
  const recipients = unique(
    ((membersRes.data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id),
  ).filter((id) => pushAllowedFor(id, process.env));
  if (recipients.length === 0) return;

  const devicesRes = await service.from("push_devices").select("user_id").in("user_id", recipients);
  if (devicesRes.error) {
    if (isMissingPushSchema(devicesRes.error)) warnMissingPushSchemaOnce("push.enqueue");
    else console.error("[push.enqueue] devices", errorCode(devicesRes.error));
    return;
  }
  const withDevices = unique(((devicesRes.data ?? []) as Array<{ user_id: string }>).map((d) => d.user_id));
  if (withDevices.length === 0) return;

  // ON CONFLICT DO NOTHING on UNIQUE(message_id, recipient_id): a repeat call
  // for the same message never queues a second push.
  const { error } = await service.from("push_outbox").upsert(
    withDevices.map((recipient_id) => ({ recipient_id, source: "message", message_id: messageId })),
    { onConflict: "message_id,recipient_id", ignoreDuplicates: true },
  );
  if (error) {
    if (isMissingPushSchema(error)) warnMissingPushSchemaOnce("push.enqueue");
    else console.error("[push.enqueue] insert", errorCode(error));
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

function unique(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === "string" && id !== "")));
}

/** A database error's code and message, never a whole object (it may hold more). */
function errorCode(e: unknown): { code?: string; message?: string } | string {
  if (e && typeof e === "object") {
    const { code, message } = e as { code?: unknown; message?: unknown };
    return {
      code: typeof code === "string" ? code : undefined,
      message: typeof message === "string" ? message.slice(0, 200) : undefined,
    };
  }
  return typeof e === "string" ? e.slice(0, 200) : "unknown";
}

const time = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

// ── Rows as the database returns them ───────────────────────────────────────

type OutboxRow = {
  id: string;
  recipient_id: string;
  source: string;
  notification_id: string | null;
  message_id: string | null;
  created_at: string;
  attempts: number | null;
};
type NotificationRow = {
  id: string;
  user_id: string;
  actor_id: string;
  type: string;
  post_id: string | null;
  comment_id: string | null;
  message_id: string | null;
  org_id: string | null;
  read_at: string | null;
  created_at: string;
};
type MessageRow = {
  id: string;
  channel_id: string;
  user_id: string;
  content: string | null;
  created_at: string;
  media_kind: string | null;
  attachment_kind: string | null;
  removed_at: string | null;
};
type ChannelRow = { id: string; type: string; org_id: string | null; name: string | null };
type PostRow = { id: string; org_id: string | null; content: string | null; removed_at: string | null; status: string | null };
type CommentRow = { id: string; content: string | null; removed_at: string | null };
type OrgRow = {
  id: string;
  handle: string | null;
  name: string | null;
  hidden_at: string | null;
  join_policy: string | null;
  audience: string | null;
  is_public: boolean | null;
};
type UserRow = {
  id: string;
  name: string | null;
  handle: string | null;
  otto_settings: unknown;
  terms_version: string | null;
  terms_accepted_at: string | null;
  age_attested_at: string | null;
};
type DeviceRow = {
  id: string;
  user_id: string;
  transport: string;
  address: string;
  p256dh: string | null;
  auth: string | null;
  platform: string | null;
  origin: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  failures: number | null;
};
type MemberRow = {
  channel_id: string;
  user_id: string;
  accepted_at: string | null;
  last_read_at: string | null;
  muted_until: string | null;
};
type ChatMuteRow = { channel_id: string; muter_id: string; muted_user_id: string; until: string | null };

// ── The drain ───────────────────────────────────────────────────────────────

/** Rows per claim: every bulk read below covers one claim (critic item 14). */
const CLAIM_BATCH = 25;
/** Rows one drain may finish before it hands over to the next kick. */
const DRAIN_ROW_LIMIT = 200;
/** Stop claiming after this long; what's left waits for the next kick. */
const DRAIN_BUDGET_MS = 20_000;

export type DrainSummary = { claimed: number; sent: number; retry: number; skipped: Record<string, number> };

/**
 * Claim, check, send, finish, until the queue is empty, `limit` rows are done
 * or 20 seconds have passed. Safe to run from several places at once: the
 * claim uses FOR UPDATE SKIP LOCKED, so two drains never take the same row.
 */
export async function drainPushOutbox(opts: { limit?: number } = {}): Promise<DrainSummary> {
  const summary: DrainSummary = { claimed: 0, sent: 0, retry: 0, skipped: {} };
  // No push origin (a Preview deploy, a test run): don't even claim. Preview
  // shares the production database, so a claim here would steal real rows.
  const origin = pushSiteOrigin(process.env);
  if (!origin || !isSupabaseServiceConfigured()) return summary;
  const enabled = pushEnabled(process.env);
  const service = createSupabaseServiceClient();
  const limit = Math.max(1, Math.min(Math.floor(opts.limit ?? DRAIN_ROW_LIMIT), 1000));
  const deadline = Date.now() + DRAIN_BUDGET_MS;

  while (summary.claimed < limit && Date.now() < deadline) {
    const want = Math.min(CLAIM_BATCH, limit - summary.claimed);
    const { data, error } = await service.rpc("claim_push_outbox", { p_limit: want });
    if (error) {
      if (isMissingPushSchema(error)) warnMissingPushSchemaOnce("push.drain");
      else console.error("[push.drain] claim", errorCode(error));
      break;
    }
    const rows = ((data ?? []) as OutboxRow[]).filter((r) => r && typeof r.id === "string");
    if (rows.length === 0) break;
    summary.claimed += rows.length;

    // Push switched off after these were queued: finish them, send nothing.
    const outcomes = enabled
      ? await processBatch(service, rows, origin)
      : rows.map((r) => ({ id: r.id, outcome: { kind: "skip", reason: "disabled" } as const }));
    await finishRows(service, outcomes, summary);
    if (rows.length < want) break;
  }

  if (summary.claimed > 0) console.info("[push.drain]", summary);
  return summary;
}

type Outcome = { kind: "sent" } | { kind: "retry" } | { kind: "skip"; reason: string };
type RowResult = { id: string; outcome: Outcome };

/** Mark each row sent or skipped, in one update per outcome. Retries stay claimed. */
async function finishRows(service: SupabaseClient, results: RowResult[], summary: DrainSummary) {
  const nowIso = new Date().toISOString();
  const sent: string[] = [];
  const byReason = new Map<string, string[]>();
  for (const { id, outcome } of results) {
    if (outcome.kind === "sent") sent.push(id);
    else if (outcome.kind === "retry") summary.retry += 1;
    else byReason.set(outcome.reason, [...(byReason.get(outcome.reason) ?? []), id]);
  }
  const writes: Array<PromiseLike<{ error: unknown }>> = [];
  if (sent.length > 0) writes.push(service.from("push_outbox").update({ sent_at: nowIso }).in("id", sent));
  for (const [reason, ids] of byReason) {
    writes.push(service.from("push_outbox").update({ skipped_reason: reason }).in("id", ids));
    summary.skipped[reason] = (summary.skipped[reason] ?? 0) + ids.length;
  }
  summary.sent += sent.length;
  const done = await Promise.all(writes);
  for (const { error } of done) if (error) console.error("[push.drain] finish", errorCode(error));
}

// ── Bulk reads: one set per claimed batch (critic item 14) ──────────────────

type Batch = {
  notifications: Map<string, NotificationRow>;
  messages: Map<string, MessageRow>;
  channels: Map<string, ChannelRow>;
  posts: Map<string, PostRow>;
  comments: Map<string, CommentRow>;
  orgs: Map<string, OrgRow>;
  users: Map<string, UserRow>;
  /** Actors and recipients with a restriction in force. */
  restricted: Set<string>;
  devices: Map<string, DeviceRow[]>;
  /** channel_members rows, keyed `${channel}:${user}`. */
  members: Map<string, MemberRow>;
  chatMutes: ChatMuteRow[];
  /** `${follower}:${following}`, for recipients following actors. */
  follows: Set<string>;
};

const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

const MESSAGE_COLUMNS = "id, channel_id, user_id, content, created_at, media_kind, attachment_kind, removed_at";

/** A query's rows; a read error throws. */
async function rowsOf<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

/** `.in(column, ids)` on one table; no ids, no query. */
function readIn<T>(service: SupabaseClient, table: string, select: string, column: string, ids: string[]) {
  return ids.length === 0 ? Promise.resolve([] as T[]) : rowsOf<T>(service.from(table).select(select).in(column, ids));
}

/**
 * Everything the checks need, in four rounds of parallel reads instead of ~15
 * per row. Service role throughout: consent, otto_settings and restrictions
 * are service-only, and each read is scoped by the ids in hand. Any error
 * throws, and the caller fails the whole batch closed.
 */
async function loadBatch(service: SupabaseClient, rows: OutboxRow[]): Promise<Batch> {
  const recipients = unique(rows.map((r) => r.recipient_id));
  const [notifs, sourceMsgs, devices] = await Promise.all([
    readIn<NotificationRow>(
      service,
      "notifications",
      "id, user_id, actor_id, type, post_id, comment_id, message_id, org_id, read_at, created_at",
      "id",
      unique(rows.map((r) => (r.source === "notification" ? r.notification_id : null))),
    ),
    readIn<MessageRow>(
      service,
      "messages",
      MESSAGE_COLUMNS,
      "id",
      unique(rows.map((r) => (r.source === "message" ? r.message_id : null))),
    ),
    readIn<DeviceRow>(
      service,
      "push_devices",
      "id, user_id, transport, address, p256dh, auth, platform, origin, last_seen_at, created_at, failures",
      "user_id",
      recipients,
    ),
  ]);

  const actors = unique([...notifs.map((n) => n.actor_id), ...sourceMsgs.map((m) => m.user_id)]);
  const people = unique([...actors, ...recipients]);
  const chatChannels = unique(sourceMsgs.map((m) => m.channel_id));
  const loaded = new Set(sourceMsgs.map((m) => m.id));
  const nowIso = new Date().toISOString();
  const none = <T>() => Promise.resolve([] as T[]);

  const [mentionMsgs, posts, comments, users, restrictions, follows, members, chatMutes] = await Promise.all([
    readIn<MessageRow>(
      service,
      "messages",
      MESSAGE_COLUMNS,
      "id",
      unique(notifs.map((n) => n.message_id)).filter((id) => !loaded.has(id)),
    ),
    readIn<PostRow>(service, "posts", "id, org_id, content, removed_at, status", "id", unique(notifs.map((n) => n.post_id))),
    readIn<CommentRow>(service, "post_comments", "id, content, removed_at", "id", unique(notifs.map((n) => n.comment_id))),
    readIn<UserRow>(service, "users", `id, name, handle, otto_settings, ${CONSENT_COLUMNS}`, "id", people),
    // getActiveRestriction's own predicate (moderation/access.ts), for many
    // people in one read: not lifted, started, and permanent or not yet over.
    people.length === 0
      ? none<{ user_id: string }>()
      : rowsOf<{ user_id: string }>(
          service
            .from("account_restrictions")
            .select("user_id")
            .in("user_id", people)
            .is("lifted_at", null)
            .lte("starts_at", nowIso)
            .or(`ends_at.is.null,ends_at.gt.${nowIso}`),
        ),
    // Does the recipient follow the actor? (critic item 7)
    recipients.length === 0 || actors.length === 0
      ? none<{ follower_id: string; following_id: string }>()
      : rowsOf<{ follower_id: string; following_id: string }>(
          service
            .from("connections")
            .select("follower_id, following_id")
            .in("follower_id", recipients)
            .in("following_id", actors),
        ),
    chatChannels.length === 0
      ? none<MemberRow>()
      : rowsOf<MemberRow>(
          service
            .from("channel_members")
            .select("channel_id, user_id, accepted_at, last_read_at, muted_until")
            .in("channel_id", chatChannels)
            .in("user_id", recipients),
        ),
    chatChannels.length === 0
      ? none<ChatMuteRow>()
      : rowsOf<ChatMuteRow>(
          service
            .from("channel_member_mutes")
            .select("channel_id, muter_id, muted_user_id, until")
            .in("channel_id", chatChannels)
            .in("muter_id", recipients),
        ),
  ]);

  const messages = [...sourceMsgs, ...mentionMsgs];
  const channels = await readIn<ChannelRow>(
    service,
    "channels",
    "id, type, org_id, name",
    "id",
    unique(messages.map((m) => m.channel_id)),
  );
  const orgs = await readIn<OrgRow>(
    service,
    "orgs",
    "id, handle, name, hidden_at, join_policy, audience, is_public",
    "id",
    unique([...notifs.map((n) => n.org_id), ...posts.map((p) => p.org_id), ...channels.map((c) => c.org_id)]),
  );

  const devicesByUser = new Map<string, DeviceRow[]>();
  for (const d of devices) devicesByUser.set(d.user_id, [...(devicesByUser.get(d.user_id) ?? []), d]);
  return {
    notifications: byId(notifs),
    messages: byId(messages),
    channels: byId(channels),
    posts: byId(posts),
    comments: byId(comments),
    orgs: byId(orgs),
    users: byId(users),
    restricted: new Set(restrictions.map((r) => r.user_id)),
    devices: devicesByUser,
    members: new Map(members.map((m) => [`${m.channel_id}:${m.user_id}`, m])),
    chatMutes,
    follows: new Set(follows.map((f) => `${f.follower_id}:${f.following_id}`)),
  };
}

// ── Deciding one row ────────────────────────────────────────────────────────

/** A row that may push: who, from whom, and what it will say. */
type Go = {
  go: true;
  kind: PushKind;
  actorId: string;
  recipientId: string;
  event: PushEvent;
  previews: boolean;
  /** For the request limiter (critic item 8). */
  channelId?: string;
};
type Stop = { go: false; outcome: Outcome };
const skip = (reason: string): Stop => ({ go: false, outcome: { kind: "skip", reason } });
/** A check that couldn't run: try again on a later claim, give up on the last. */
const unsure = (row: OutboxRow): Stop =>
  (row.attempts ?? 1) >= MAX_ATTEMPTS ? skip("check_failed") : { go: false, outcome: { kind: "retry" } };

const NOTIFICATION_KINDS: ReadonlySet<string> = new Set([
  "follow", "like", "comment", "mention", "org_invite", "org_request_approved",
]);

type Memo = {
  hidden: Map<string, Promise<HiddenUsers | null>>;
  badge: Map<string, Promise<number | null>>;
};

async function decide(
  service: SupabaseClient,
  row: OutboxRow,
  b: Batch,
  memo: Memo,
  now: number,
): Promise<Go | Stop> {
  const recipientId = row.recipient_id;

  // 1. The source, and who did it.
  let notif: NotificationRow | undefined;
  let msg: MessageRow | undefined;
  if (row.source === "notification") {
    notif = b.notifications.get(row.notification_id ?? "");
    if (!notif) return skip("source_gone");
    if (notif.user_id !== recipientId) return skip("mismatch");
    if (notif.type === "connection") return skip("connection");
    if (!NOTIFICATION_KINDS.has(notif.type)) return skip("unknown_kind");
    if (notif.read_at) return skip("read");
  } else if (row.source === "message") {
    msg = b.messages.get(row.message_id ?? "");
    if (!msg) return skip("source_gone");
  } else {
    return skip("unknown_source");
  }
  const actorId = notif ? notif.actor_id : msg!.user_id;
  const createdAt = time(notif ? notif.created_at : msg!.created_at);

  // 2. The checks every kind shares.
  if (!(now - createdAt <= STALE_MS)) return skip("stale");
  if (!pushAllowedFor(recipientId, process.env)) return skip("not_allowed");
  if (actorId === recipientId) return skip("self");
  const recipient = b.users.get(recipientId);
  const actor = b.users.get(actorId);
  if (!recipient || !actor) return skip("source_gone");
  if (!hasRecordedConsent(recipient)) return skip("no_consent");
  if (b.restricted.has(recipientId)) return skip("recipient_restricted");
  if (b.restricted.has(actorId)) return skip("actor_restricted");
  const hidden = await hiddenFor(service, memo, recipientId);
  if (!hidden) return unsure(row);
  if (hidden.blocked.has(actorId)) return skip("blocked");
  if (hidden.muted.has(actorId)) return skip("muted");

  // 3. The kind, with its own checks.
  const who = { name: actor.name, handle: actor.handle };
  const follows = b.follows.has(`${recipientId}:${actorId}`);
  const prefs = parsePushPrefs(recipient.otto_settings);
  const ready = (kind: PushKind, event: PushEvent, channelId?: string): Go | Stop =>
    pushKindOn(prefs, kind)
      ? { go: true, kind, actorId, recipientId, event, previews: prefs.previews, channelId }
      : skip("kind_off");

  if (msg) return decideMessage(row, b, msg, who, follows, now, ready);

  const n = notif!;
  switch (n.type) {
    case "follow":
      return ready("follow", { kind: "follow", actor: who });
    case "like":
    case "comment": {
      const post = postGate(b, n.post_id);
      if (typeof post === "string") return skip(post);
      if (n.type === "like") return ready("like", { kind: "like", actor: who, postId: post.id });
      const comment = n.comment_id ? b.comments.get(n.comment_id) : undefined;
      if (n.comment_id && !comment) return skip("source_gone");
      if (comment?.removed_at) return skip("removed");
      return ready("comment", {
        kind: "comment", actor: who, postId: post.id, text: comment?.content ?? null, recipientFollowsActor: follows,
      });
    }
    case "mention":
      return decideMention(service, row, b, n, who, follows, ready);
    default: {
      // org_invite / org_request_approved
      const org = n.org_id ? b.orgs.get(n.org_id) : undefined;
      if (!org) return skip("source_gone");
      if (org.hidden_at) return skip("hidden_club");
      const kind = n.type as "org_invite" | "org_request_approved";
      return ready(kind, { kind, actor: who, orgId: org.id, club: org });
    }
  }
}

/** The post behind a like, comment or post mention, or why it can't push. */
function postGate(b: Batch, postId: string | null): PostRow | string {
  const post = postId ? b.posts.get(postId) : undefined;
  if (!post) return "source_gone";
  if (post.removed_at) return "removed";
  if (post.status && post.status !== "published") return "removed";
  // A club post of a hidden club (critic item 26). A club we can't read at
  // all counts as hidden: fail closed.
  if (post.org_id) {
    const org = b.orgs.get(post.org_id);
    if (!org || org.hidden_at) return "hidden_club";
  }
  return post;
}

type Ready = (kind: PushKind, event: PushEvent, channelId?: string) => Go | Stop;
type Who = { name: string | null; handle: string | null };

/** A DM or group message: chat mutes, read state, and request or not. */
function decideMessage(
  row: OutboxRow,
  b: Batch,
  msg: MessageRow,
  who: Who,
  follows: boolean,
  now: number,
  ready: Ready,
): Go | Stop {
  if (msg.removed_at) return skip("removed");
  const channel = b.channels.get(msg.channel_id);
  if (!channel) return skip("source_gone");
  // Club channels push only through their @mention rows (plan §7).
  if (channel.org_id || (channel.type !== "dm" && channel.type !== "group")) return skip("club_channel");
  const member = b.members.get(`${channel.id}:${row.recipient_id}`);
  if (!member) return skip("not_member");
  // The mute copy promises "no unread badge or notification ping".
  if (member.muted_until && time(member.muted_until) > now) return skip("chat_muted");
  const personMuted = b.chatMutes.some(
    (m) =>
      m.channel_id === channel.id &&
      m.muter_id === row.recipient_id &&
      m.muted_user_id === msg.user_id &&
      (m.until === null || time(m.until) > now),
  );
  if (personMuted) return skip("person_muted");
  if (member.last_read_at && time(member.last_read_at) >= time(msg.created_at)) return skip("read");

  const content = { text: msg.content, mediaKind: msg.media_kind, attachmentKind: msg.attachment_kind };
  if (member.accepted_at === null) {
    return ready(
      "message_request",
      { kind: "message_request", actor: who, channelId: channel.id, content, recipientFollowsActor: follows },
      channel.id,
    );
  }
  if (channel.type === "dm") {
    return ready("dm", { kind: "dm", actor: who, channelId: channel.id, messageId: msg.id, content });
  }
  return ready("group_message", {
    kind: "group_message", actor: who, channelId: channel.id, messageId: msg.id, groupName: channel.name, content,
  });
}

/**
 * A mention in a post, or in a chat.
 * - DM / group chat: always "covered_by_message" (critic item 13). The
 *   message's own push covers it, so one message never buzzes twice, and a
 *   mention doesn't break a chat mute.
 * - Club chat: only if the student can read that channel right now (a private
 *   sub-channel is for its members and the officers, critic item 6), and
 *   never naming the club or the channel.
 */
async function decideMention(
  service: SupabaseClient,
  row: OutboxRow,
  b: Batch,
  n: NotificationRow,
  who: Who,
  follows: boolean,
  ready: Ready,
): Promise<Go | Stop> {
  if (n.message_id) {
    const msg = b.messages.get(n.message_id);
    if (!msg) return skip("source_gone");
    if (msg.removed_at) return skip("removed");
    const channel = b.channels.get(msg.channel_id);
    if (!channel) return skip("source_gone");
    if (!channel.org_id) return skip("covered_by_message");
    const org = b.orgs.get(channel.org_id);
    if (!org || org.hidden_at) return skip("hidden_club");
    // SECURITY DEFINER, and answers the service role truthfully.
    const { data, error } = await service.rpc("can_view_org_channel", { cid: channel.id, uid: row.recipient_id });
    if (error) return unsure(row);
    if (data !== true) return skip("no_access");
    return ready("mention", {
      kind: "mention", where: "club_chat", actor: who, club: org, messageId: msg.id,
      content: { text: msg.content, mediaKind: msg.media_kind, attachmentKind: msg.attachment_kind },
    });
  }
  const post = postGate(b, n.post_id);
  if (typeof post === "string") return skip(post);
  return ready("mention", {
    kind: "mention", where: "post", actor: who, postId: post.id, text: post.content, recipientFollowsActor: follows,
  });
}

/** loadHiddenUsers once per recipient per batch; null when it couldn't be read. */
function hiddenFor(service: SupabaseClient, memo: Memo, userId: string): Promise<HiddenUsers | null> {
  let p = memo.hidden.get(userId);
  if (!p) {
    p = loadHiddenUsers(service, userId).then(
      (res) => (res.ok ? res.hidden : null),
      () => null,
    );
    memo.hidden.set(userId, p);
  }
  return p;
}

/** The icon count once per recipient per batch; null (left out) when it can't be read. */
function badgeFor(service: SupabaseClient, memo: Memo, userId: string, hidden: HiddenUsers): Promise<number | null> {
  let p = memo.badge.get(userId);
  if (!p) {
    p = loadBadgeCounts(service, userId, hidden).then(
      (res) => (res.ok ? res.total : null),
      () => null,
    );
    memo.badge.set(userId, p);
  }
  return p;
}

// ── Sending ─────────────────────────────────────────────────────────────────

/** What happened to devices across one batch, written once at the end. */
type DeviceBook = { ok: Set<string>; remove: Set<string>; failed: Map<string, number> };

const FAILED: SendResult = { ok: false, gone: false, retry: false, config: false };

/** Check, send and settle every row of one claim. Rows run side by side. */
async function processBatch(service: SupabaseClient, rows: OutboxRow[], origin: string): Promise<RowResult[]> {
  let batch: Batch;
  try {
    batch = await loadBatch(service, rows);
  } catch (e) {
    if (isMissingPushSchema(e)) warnMissingPushSchemaOnce("push.drain");
    else console.error("[push.drain] load", errorCode(e));
    return rows.map((r) => ({ id: r.id, outcome: unsure(r).outcome }));
  }
  const memo: Memo = { hidden: new Map(), badge: new Map() };
  const book: DeviceBook = { ok: new Set(), remove: new Set(), failed: new Map() };
  const now = Date.now();

  const results = await Promise.all(
    rows.map(async (row): Promise<RowResult> => {
      try {
        const d = await decide(service, row, batch, memo, now);
        const outcome = d.go ? await deliver(service, row, d, batch, memo, book, origin, now) : d.outcome;
        return { id: row.id, outcome };
      } catch (e) {
        console.error("[push.drain] row", errorCode(e));
        return { id: row.id, outcome: unsure(row).outcome };
      }
    }),
  );
  await settleDevices(service, book);
  return results;
}

/**
 * Past every check that costs nothing: pick the devices, spend the limits,
 * read the badge, send. The limits are spent here, last, and only on a row's
 * first try, so a re-claimed row never pays twice (critic item 10). Each
 * limit spends one unit even when it says no, so they run one at a time and
 * the first "no" stops the rest. Most specific first.
 */
async function deliver(
  service: SupabaseClient,
  row: OutboxRow,
  go: Go,
  b: Batch,
  memo: Memo,
  book: DeviceBook,
  origin: string,
  now: number,
): Promise<Outcome> {
  const { send, expired } = pickDevices(b.devices.get(go.recipientId) ?? [], { origin, now });
  for (const d of expired) book.remove.add(d.id);
  if (send.length === 0) return { kind: "skip", reason: "no_device" };

  const draft = buildPushMessage(go.event, { origin, previews: go.previews, badge: null });
  if ((row.attempts ?? 1) <= 1) {
    for (const l of limitsFor(go, draft)) {
      const res = await rateLimit(l.key, { limit: l.limit, windowSec: l.windowSec });
      if (!res.allowed) return { kind: "skip", reason: l.reason };
    }
  }

  const hidden = await hiddenFor(service, memo, go.recipientId);
  const badge = hidden ? await badgeFor(service, memo, go.recipientId, hidden) : null;
  const message: PushMessage = { ...draft, badge };
  const delivery = deliveryFor(go.kind);
  const webPayload = toWebPush(message);
  const topic = webPushTopic(message);

  const settled = await Promise.allSettled(
    send.map((d): Promise<SendResult> => {
      if (d.transport === "webpush") {
        if (!d.p256dh || !d.auth) return Promise.resolve(FAILED);
        return sendWebPush({ address: d.address, p256dh: d.p256dh, auth: d.auth }, webPayload, { ...delivery, topic });
      }
      if (d.transport === "fcm") return sendFcm(toFcm(message, d.address), delivery);
      return Promise.resolve(FAILED);
    }),
  );
  const answers: SendOutcome[] = settled.map((s, i) => {
    const device = send[i];
    // The senders never throw; if one somehow does, treat it as "try later".
    const r: SendResult = s.status === "fulfilled" ? s.value : { ok: false, gone: false, retry: true, config: false };
    if (r.ok) book.ok.add(device.id);
    else if (r.gone) book.remove.add(device.id);
    else if (!r.retry && !r.config) book.failed.set(device.id, (device.failures ?? 0) + 1);
    return r;
  });
  return rowOutcome(answers, row.attempts ?? 1);
}

type Limit = { key: string; limit: number; windowSec: number; reason: string };

/** Critic items 8–10. Keys never repeat the mention budget (`mention:<actor>`). */
function limitsFor(go: Go, m: PushMessage): Limit[] {
  const r = go.recipientId;
  const limits: Limit[] = [];
  // Likes and follows buzz once per tag per 10 minutes; the in-app row stays.
  if (go.kind === "like" || go.kind === "follow") {
    limits.push({ key: `push-tag:${r}:${m.tag}`, limit: 1, windowSec: 600, reason: "throttled" });
  }
  // A request nobody has accepted buzzes once per 6 hours.
  if (go.kind === "message_request" && go.channelId) {
    limits.push({ key: `push-request:${go.channelId}:${r}`, limit: 1, windowSec: 21_600, reason: "throttled" });
  }
  limits.push({ key: `push-pair:${go.actorId}:${r}`, limit: 10, windowSec: 60, reason: "pair_limit" });
  // Two buckets, so a burst of likes can't silence the next DM.
  limits.push(
    m.chat
      ? { key: `push:${r}:chat`, limit: 30, windowSec: 600, reason: "recipient_limit" }
      : { key: `push:${r}:activity`, limit: 20, windowSec: 600, reason: "recipient_limit" },
  );
  return limits;
}

/**
 * Devices: gone or unseen for 60 days → deleted; took a push → `last_ok_at`
 * and failures back to 0; a failure retrying won't fix → one more failure.
 * "Try later" and "our config is wrong" change nothing: never delete a device
 * over our own mistake.
 */
async function settleDevices(service: SupabaseClient, book: DeviceBook): Promise<void> {
  const nowIso = new Date().toISOString();
  const remove = [...book.remove];
  const ok = [...book.ok].filter((id) => !book.remove.has(id));
  const failed = [...book.failed].filter(([id]) => !book.remove.has(id) && !book.ok.has(id));
  const writes: Array<PromiseLike<{ error: unknown }>> = [];
  if (remove.length > 0) writes.push(service.from("push_devices").delete().in("id", remove));
  if (ok.length > 0) writes.push(service.from("push_devices").update({ last_ok_at: nowIso, failures: 0 }).in("id", ok));
  for (const [id, failures] of failed) {
    writes.push(service.from("push_devices").update({ failures }).eq("id", id));
  }
  const done = await Promise.all(writes);
  for (const { error } of done) if (error) console.error("[push.drain] devices", errorCode(error));
}
