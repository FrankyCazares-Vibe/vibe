import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * @handle mention parsing — used when publishing posts and sending
 * messages so we can fan out notifications to the mentioned users.
 *
 * Rules:
 * - Same handle format the rest of the app uses: lowercase a-z, 0-9,
 *   underscore, 3–20 chars (matches users.handle CHECK).
 * - Match `@<handle>` not preceded by a word-char (avoid emails).
 * - Returns lowercased, deduped list.
 */
const HANDLE_PATTERN = /(^|[^A-Za-z0-9_@])@([a-z0-9_]{3,20})/gi;

export function extractMentionHandles(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  HANDLE_PATTERN.lastIndex = 0;
  while ((m = HANDLE_PATTERN.exec(text)) !== null) {
    out.add(m[2]!.toLowerCase());
  }
  return Array.from(out);
}

/**
 * Resolve a list of @handles to their user ids, skipping the author so
 * mentioning yourself doesn't notify you, and skipping any unmatched.
 */
export async function resolveMentionedUserIds(
  supabase: SupabaseClient,
  handles: string[],
  excludeUserId: string,
): Promise<string[]> {
  if (handles.length === 0) return [];
  const { data, error } = await supabase
    .from("users")
    .select("id, handle")
    .in("handle", handles);
  if (error || !data) return [];
  const ids = new Set<string>();
  for (const u of data) {
    if (u.id && u.id !== excludeUserId) ids.add(u.id as string);
  }
  return Array.from(ids);
}

type NotificationKind = "post" | "message";

/** The most people one post, edit or message can notify with @mentions. */
export const MAX_MENTION_NOTIFICATIONS = 20;

/**
 * The most mention notifications one sender can cause per
 * MENTION_BUDGET_WINDOW_SEC, across posts, edits and messages together,
 * counted per person notified rather than per post or message.
 * MAX_MENTION_NOTIFICATIONS caps one post, edit or message; on its own it
 * doesn't stop someone re-editing a post or sending message after message
 * to keep pinging people.
 *
 * Why 60 an hour: that's three posts that each tag the full 20, or an hour
 * of group chat where twenty or thirty messages each tag two or three
 * friends. Real use doesn't come close; past it, the pinging is the point.
 * The window is fixed (rate_limit_hit floors to the start of each hour), so
 * up to twice the budget can land around a boundary: 60 at 1:59 and 60 more
 * at 2:00. That's still far above real use.
 */
export const MENTION_BUDGET = 60;
export const MENTION_BUDGET_WINDOW_SEC = 60 * 60;

/**
 * How many of `wanted` mention notifications this sender may still send,
 * spending one unit of budget per notification. rate_limit_hit adds exactly
 * one to the sender's counter per call and answers whether that one was
 * still within the budget, so the number of yes answers is the number of
 * slots left. The calls go out together because every caller awaits this on
 * the publish or send path.
 *
 * Calls the RPC on the caller's service client instead of going through
 * src/lib/rate-limit.ts: that module imports `server-only` and the service
 * client at runtime, and the tests load this one with plain type stripping,
 * where neither resolves.
 *
 * Fail-open, like rate-limit.ts: a call that errors or throws counts as
 * allowed, so a limiter hiccup never costs anyone a real mention. It never
 * throws. The key holds the sender's id, so the rate_limits row (not the
 * log) is where to look up who ran over.
 */
async function mentionSlotsLeft(
  writer: SupabaseClient,
  actorId: string,
  wanted: number,
): Promise<number> {
  // Every real SupabaseClient has rpc; only a test double might not.
  if (typeof (writer as { rpc?: unknown }).rpc !== "function") return wanted;
  let failures = 0;
  let firstFailure: unknown = null;
  const answers = await Promise.all(
    Array.from({ length: wanted }, async () => {
      try {
        const { data, error } = await writer.rpc("rate_limit_hit", {
          p_key: `mention:${actorId}`,
          p_limit: MENTION_BUDGET,
          p_window_seconds: MENTION_BUDGET_WINDOW_SEC,
        });
        if (!error) return data === true;
        firstFailure ??= error.message;
      } catch (e) {
        firstFailure ??= e;
      }
      failures++;
      return true;
    }),
  );
  // One line per call, however many of its checks failed.
  if (failures > 0) {
    console.error("[mentions.budget] rate_limit_hit failed; allowing", {
      failures,
      error: firstFailure,
    });
  }
  return answers.filter(Boolean).length;
}

/**
 * Insert mention notifications. Best-effort: errors are logged but not
 * thrown — failing to notify a mentionee shouldn't block the underlying
 * publish/send action. Skips if the notifications schema doesn't yet
 * include 'mention' (returns false in that case so callers can decide).
 *
 * `writer` MUST be the service-role client. Students can't insert into
 * `notifications` (T2 migration 20260922120000), so a user client here fails
 * with 42501 and nobody is notified. Call this only after your own
 * authorization succeeded (the post, edit or message write went through),
 * and take `actorId` from the session, never from the request body: the
 * service role skips RLS, so nothing else checks who the actor is.
 *
 * Before any row is built, the targets are de-duplicated, the actor is
 * dropped, and the list is cut to MAX_MENTION_NOTIFICATIONS. An empty list
 * returns without a query. Then each remaining target spends one unit of the
 * sender's MENTION_BUDGET; anyone past the budget is dropped quietly (the
 * post or message itself already went through) and the call logs once.
 *
 * Re-pings on edit are the caller's job, not this function's: PATCH
 * /api/posts/[id] passes only handles the edit added, minus anyone already
 * holding a mention from this author for this post. A first publish has no
 * earlier rows, and every message carries a new message_id.
 */
export async function insertMentionNotifications(
  writer: SupabaseClient,
  args: {
    actorId: string;
    targetUserIds: string[];
    kind: NotificationKind;
    postId?: string | null;
    messageId?: string | null;
  },
): Promise<{ inserted: number; skipped: boolean }> {
  const targets = Array.from(new Set(args.targetUserIds))
    .filter((uid) => Boolean(uid) && uid !== args.actorId)
    .slice(0, MAX_MENTION_NOTIFICATIONS);
  if (targets.length === 0) return { inserted: 0, skipped: false };
  // Budget is spent only on people who survived the filter above, so a
  // duplicate, the actor or anyone past the cap never costs the sender
  // anything. Every call is the same key, so which call came back yes
  // doesn't matter: keep the first `slots` targets, in the order written.
  const slots = await mentionSlotsLeft(writer, args.actorId, targets.length);
  const allowed = targets.slice(0, slots);
  if (allowed.length < targets.length) {
    console.warn("[mentions.budget] over the hourly mention budget; dropped", {
      kind: args.kind,
      dropped: targets.length - allowed.length,
    });
  }
  if (allowed.length === 0) return { inserted: 0, skipped: false };
  const rows = allowed.map((uid) => ({
    user_id: uid,
    actor_id: args.actorId,
    type: "mention" as const,
    post_id: args.kind === "post" ? args.postId ?? null : null,
    message_id: args.kind === "message" ? args.messageId ?? null : null,
  }));
  const { error, count } = await writer
    .from("notifications")
    .insert(rows, { count: "exact" });
  if (error) {
    // Migration lag: if 'mention' isn't in the type CHECK yet OR
    // message_id column missing, swallow the error and return skipped.
    if (
      /violates check constraint|message_id|column .* does not exist/i.test(
        error.message ?? "",
      )
    ) {
      return { inserted: 0, skipped: true };
    }
    console.error("[mentions.insertNotifications]", error);
    return { inserted: 0, skipped: false };
  }
  return { inserted: count ?? 0, skipped: false };
}
