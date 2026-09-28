/**
 * The chat reaction emoji: the one list every layer agrees on.
 *
 * A reaction is shown to everyone else in the chat, so the stored value is
 * treated as untrusted. Three layers use this list:
 *   - POST/DELETE /api/me/threads/[id]/messages/[messageId]/react refuses
 *     anything not on it.
 *   - The database refuses it too: message_reactions_emoji_check allows only
 *     these exact strings (migration 20260927110000). That matters because the
 *     browser can write to message_reactions directly, skipping the route.
 *   - GET /api/me/threads/[id]/messages drops any stored reaction not on it
 *     before grouping, so an old or smuggled row never reaches a renderer.
 *
 * Changing the list means a new migration for the CHECK as well; the test
 * next to this file compares this list with the one in the migration.
 *
 * No imports, so node --test can load this file on its own.
 */

/** Exact strings, compared byte for byte. The heart carries U+FE0F. */
export const ALLOWED_EMOJIS = [
  "❤️", // ❤️
  "\u{1F44D}", // 👍
  "\u{1F44E}", // 👎
  "\u{1F602}", // 😂
  "\u{1F525}", // 🔥
  "\u{1F62E}", // 😮
  "\u{1F622}", // 😢
] as const;

export type ReactionEmoji = (typeof ALLOWED_EMOJIS)[number];

const ALLOWED_SET: ReadonlySet<string> = new Set<string>(ALLOWED_EMOJIS);

/** True only for a string that is exactly one of ALLOWED_EMOJIS. */
export function isAllowedReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === "string" && ALLOWED_SET.has(value);
}

/** One stored row of message_reactions, as the messages route reads it. */
export type ReactionRow = {
  message_id: string;
  emoji: string;
  user_id: string;
};

/** What the messages route returns per message. */
export type ReactionGroup = {
  emoji: string;
  count: number;
  viewer_reacted: boolean;
};

/**
 * Group stored reaction rows per message: one entry per emoji with a count
 * and whether the viewer is among the reactors. Rows whose emoji isn't on
 * the list are dropped here, before anything is counted. Each message's
 * groups are sorted most-used first, then by the emoji string for ties (the
 * order the route has always used).
 */
export function groupMessageReactions(
  rows: readonly ReactionRow[],
  viewerId: string,
): Map<string, ReactionGroup[]> {
  const counts = new Map<string, Map<string, { count: number; viewerReacted: boolean }>>();
  for (const r of rows) {
    if (!r || typeof r.message_id !== "string" || !isAllowedReactionEmoji(r.emoji)) continue;
    let perMessage = counts.get(r.message_id);
    if (!perMessage) {
      perMessage = new Map();
      counts.set(r.message_id, perMessage);
    }
    let entry = perMessage.get(r.emoji);
    if (!entry) {
      entry = { count: 0, viewerReacted: false };
      perMessage.set(r.emoji, entry);
    }
    entry.count += 1;
    if (r.user_id === viewerId) entry.viewerReacted = true;
  }
  const out = new Map<string, ReactionGroup[]>();
  for (const [messageId, perMessage] of counts) {
    out.set(
      messageId,
      Array.from(perMessage.entries())
        .map(([emoji, { count, viewerReacted }]) => ({
          emoji,
          count,
          viewer_reacted: viewerReacted,
        }))
        .sort((a, b) => b.count - a.count || (a.emoji < b.emoji ? -1 : 1)),
    );
  }
  return out;
}
