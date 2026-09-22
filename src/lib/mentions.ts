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
 * returns without a query.
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
  const rows = targets.map((uid) => ({
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
