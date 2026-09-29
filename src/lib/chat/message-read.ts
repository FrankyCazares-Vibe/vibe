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
 * Batch B4 owns this file from here and adds the new columns, the
 * missing-schema retry, `readChatMessages()` / `readChatMessage()` and the
 * new response fields HERE, not in the route.
 *
 * Every read runs on the client it is handed. The routes hand it the
 * viewer's cookie client, so RLS decides which rows come back.
 */

import {
  isChannelMessageMediaKey,
  messageMediaProxyUrl,
} from "@/lib/messages/channel-access";
import {
  groupMessageReactions,
  type ReactionGroup,
  type ReactionRow,
} from "@/lib/messages/reaction-emoji";
import { postMediaProxyUrl } from "@/lib/post-media-url";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

export const MESSAGE_SELECT =
  "id, content, created_at, user_id, attachment_id, attachment_kind, media_url, media_kind, parent_message_id, " +
  "users:users!messages_user_id_fkey(id, handle, name, avatar_url), " +
  "attachment:posts!messages_attachment_id_fkey(id, type, content, media_url, media_thumbnail_url, user_id, author:users!posts_user_id_fkey(id, handle, name, avatar_url))";

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
