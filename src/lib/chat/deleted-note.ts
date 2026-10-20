/**
 * The "Message deleted" note (Oct 19, 2026; decision 8 in
 * handoffs/2026-10-19-critique/DECISIONS.md). When the sender deletes their
 * own message, its words and attachments go for everyone and a grey line
 * stays in its place. The database keeps the row with `deleted_at` set and
 * nothing anyone wrote (`messages_deleted_is_empty`,
 * supabase/migrations/20261019150000_message_deleted_note.sql).
 *
 * PURE: type-only imports, so the server read, the routes, the screens and
 * `node --test` all load the same words and the same shape.
 */

import type { ChatMessage } from "./types";

/** The line in a deleted message's place. */
export const DELETED_LINE = "Message deleted";

/** The same line for a deleted Board post (its replies stay under it). */
export const DELETED_POST_LINE = "Post deleted";

/**
 * The columns `hasDeletedShape` reads, for a select that must tell a note
 * from a message (the pin and reaction routes, the pin reads; review of Oct
 * 19, 2026). All of them exist wherever pins and reactions do (chat rooms,
 * 20261001100000), so no read needs a missing-column fallback for them.
 */
export const DELETED_SHAPE_COLUMNS = "content, kind, media_url, media_kind, attachment_id, attachment_kind, card_event_id";

/** What `hasDeletedShape` reads of a stored row. */
export type DeletedShapeInput = {
  content?: unknown;
  kind?: unknown;
  media_url?: unknown;
  media_kind?: unknown;
  attachment_id?: unknown;
  attachment_kind?: unknown;
  card_event_id?: unknown;
};

const empty = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Whether a stored row has the shape a deleted one must have: no words, no
 * file, no shared post, no card. NECESSARY, NOT SUFFICIENT: the send route
 * never stores such a row (it needs words, a file or a post), but the REST
 * API could. The thread read confirms with `deleted_at`; the list previews,
 * which only label a row, go by the shape alone.
 */
export function hasDeletedShape(row: DeletedShapeInput): boolean {
  return (
    row.content === "" &&
    (row.kind === undefined || row.kind === null || row.kind === "text") &&
    empty(row.media_url) &&
    empty(row.media_kind) &&
    empty(row.attachment_id) &&
    empty(row.attachment_kind) &&
    empty(row.card_event_id)
  );
}

/**
 * The note in a message's place, as the screens get it: who sent it and when
 * stay (`users`, `user_id`, `created_at`), and so do the fields keys and
 * paging read (`id`, `thread_root_id`) and a Board post's `reply_count` (its
 * replies stay). Everything that was written or shared is emptied.
 */
export function asDeletedNote<T extends ChatMessage>(m: T): T {
  return {
    ...m,
    kind: "text",
    content: "",
    attachment: null,
    attachment_id: null,
    attachment_kind: null,
    media_url: null,
    media_kind: null,
    parent_message_id: null,
    parent_preview: null,
    card: null,
    reactions: [],
    removed: null,
    deleted: true,
  };
}

/** What a quote (`parent_preview`) holds that the note empties; both list shapes have these. */
export type QuoteFields = {
  id: string;
  content: string | null;
  media_kind?: string | null;
  attachment_kind?: string | null;
  deleted?: boolean;
};

/**
 * The quote of a message its sender deleted, as the server read sends it
 * (message-read.ts): "Message deleted", no photo or post kind, `deleted`.
 */
export function asDeletedQuote<Q extends QuoteFields>(q: Q): Q {
  return { ...q, content: DELETED_LINE, media_kind: null, attachment_kind: null, deleted: true };
}

/**
 * Every row that quotes the message `id`, after its sender deleted it
 * (review of Oct 19, 2026): with a note left (`note`), the quote reads
 * "Message deleted", the way the server's next read sends it, so its words
 * leave the screen at once and not only when a poll or a reopen brings it;
 * after a hard delete (a database without the note) the quote goes, as the
 * server's `ON DELETE SET NULL` takes `parent_message_id`. The same array
 * when no row quotes it. Twin: `__dmDeleteMessage` in public/html/messages.html.
 */
export function withDeletedQuotes<T extends { id: string; parent_preview?: QuoteFields | null; parent_message_id?: string | null }>(
  rows: readonly T[],
  id: string,
  note: boolean,
): readonly T[] {
  const quotes = (m: T) => m.id !== id && !!m.parent_preview && m.parent_preview.id === id;
  if (!rows.some(quotes)) return rows;
  return rows.map((m) => {
    if (!quotes(m) || !m.parent_preview) return m;
    return note ? { ...m, parent_preview: asDeletedQuote(m.parent_preview) } : { ...m, parent_preview: null, parent_message_id: null };
  });
}
