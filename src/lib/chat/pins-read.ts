/**
 * Rows → what the Pinned and Shared routes answer
 * (handoffs/chat-redesign/wave-3-desktop/contract.md 4.3, 4d): the selects of
 * the three reads, the two mappers and the cap's count. The routes do the
 * gates and the queries; everything that turns a database row into a
 * `PinnedMessage` or a `SharedItem` is here, so `pins-routes.test.ts` can
 * call it with plain objects.
 *
 * WHICH CLIENT READ THE ROWS. The pin rows come from the SERVICE role
 * (`chat_message_pins` has no policy and no client grant, 4b.1), so nothing
 * was filtered for the viewer: `toPinnedMessages` drops a pin whose message
 * is removed and one from before the viewer's "Clear chat history" mark.
 * The AUTHORS are not in that read: a profile is the viewer's to see or not
 * (`users_select_authenticated`: a suspended or banned account's row comes
 * back to nobody else), so the route reads them on the viewer's COOKIE
 * client (`PIN_AUTHOR_SELECT`, the ids from `pinAuthorIds`) and an author
 * RLS did not return is `author: null`, as the thread read sends
 * `users: null` for the same message. The shared rows come from the COOKIE
 * client too, so RLS already chose them; `toSharedItems` only shapes them,
 * with the thread read's own last pass (`prepareForClient`), so a photo's
 * URL and a shared post look exactly as they do in the thread.
 */

import "server-only";

import { prepareForClient, type MessageRow } from "./message-read";
import { afterCleared, pinQuote } from "./pin-rules";
import type { Person, PinnedMessage, SharedItem } from "./types";

/**
 * The pin list's read (service role): each pin with its message. `removed_at`
 * is read to drop the pin, never sent. NO `users` embed: the service role
 * reads every profile, the viewer does not (see `PIN_AUTHOR_SELECT`).
 */
export const PIN_LIST_SELECT =
  "message_id, pinned_at, " +
  "message:messages!chat_message_pins_message_id_fkey(id, content, created_at, user_id, media_url, media_kind, attachment_id, removed_at)";

/**
 * The authors' read, on the viewer's COOKIE client: `users` by the ids of
 * `pinAuthorIds`. The thread read's own four columns (`MESSAGE_SELECT`).
 */
export const PIN_AUTHOR_SELECT = "id, handle, name, avatar_url";

/** The cap's read: which messages are pinned, and whether each is still live. */
export const PIN_LIVE_SELECT = "message_id, message:messages!chat_message_pins_message_id_fkey(removed_at)";

/**
 * The most pin rows one read asks for. A chat holds `PIN_CAP` live pins (21
 * after a race); a pin whose message was removed before the trigger existed
 * may sit beside them, so the read leaves room.
 */
export const PIN_ROWS_MAX = 100;

/** `?limit=` of the shared read: 1 to 60, 30 when absent or not a number. */
export const SHARED_LIMIT_DEFAULT = 30;
export const SHARED_LIMIT_MAX = 60;

/**
 * The most reads one shared request makes. A page's rows may all be skipped
 * by `toSharedItems` (a run of shared posts that are gone or hidden), so the
 * route reads on past them; this bounds it. With `SHARED_LIMIT_MAX` that is
 * at most 244 rows looked at for one answer.
 */
export const SHARED_READS_MAX = 4;

/** The message under a pin, as `PIN_LIST_SELECT` reads it. Every field optional: a test hands plain objects. */
export type PinMessageRow = {
  id?: string;
  content?: string | null;
  created_at?: string;
  user_id?: string;
  media_url?: string | null;
  media_kind?: string | null;
  attachment_id?: string | null;
  removed_at?: string | null;
};

/** One row of `chat_message_pins` with its message embedded (an object; PostgREST's types say it may be a list). */
export type PinRow = {
  message_id: string;
  pinned_at: string;
  message?: PinMessageRow | PinMessageRow[] | null;
};

function embedded(value: PinRow["message"]): PinMessageRow | null {
  const one = Array.isArray(value) ? value[0] : value;
  return one && typeof one === "object" ? one : null;
}

/** One `users` row as the screens get a person (message-read.ts `toPerson`). Null for anything that is not one. */
function person(value: unknown): Person | null {
  const row = value as { id?: unknown; handle?: unknown; name?: unknown; avatar_url?: unknown } | null | undefined;
  if (!row || typeof row !== "object" || typeof row.id !== "string") return null;
  return {
    id: row.id,
    handle: typeof row.handle === "string" ? row.handle : "",
    name: typeof row.name === "string" ? row.name : "",
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
  };
}

/** A pin the viewer gets: its message came with it, is not removed, and is after their "Clear chat history" mark. */
function shown(message: PinMessageRow | null, clearedAt: string | null): message is PinMessageRow & { created_at: string } {
  if (!message || message.removed_at) return false;
  return typeof message.created_at === "string" && afterCleared(message.created_at, clearedAt);
}

/**
 * Whose profiles the list needs: the distinct authors of the pins the viewer
 * gets (`toPinnedMessages`' own filter, so a dropped pin asks for nobody).
 * Empty = no read at all.
 */
export function pinAuthorIds(rows: PinRow[] | null, clearedAt: string | null): string[] {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    const message = embedded(row.message);
    if (shown(message, clearedAt) && typeof message.user_id === "string" && message.user_id !== "") ids.add(message.user_id);
  }
  return [...ids];
}

/**
 * The rows of the authors' read (`PIN_AUTHOR_SELECT`, the viewer's cookie
 * client) by id. A profile RLS did not return is simply not in the map; a
 * read that failed (null) is the empty map: every author is null, the pins
 * still show.
 */
export function pinAuthors(rows: unknown[] | null): Map<string, Person> {
  const byId = new Map<string, Person>();
  for (const row of rows ?? []) {
    const one = person(row);
    if (one) byId.set(one.id, one);
  }
  return byId;
}

/** A photo unless the row says video; null when the message carries no media. */
function mediaKind(url: unknown, kind: unknown): "image" | "video" | null {
  if (typeof url !== "string" || url === "") return null;
  return kind === "video" ? "video" : "image";
}

/** Newest pin first. Postgres prints one shape, so equal milliseconds are settled by the strings (the microseconds). */
function newestPinFirst(a: PinRow, b: PinRow): number {
  const byMs = Date.parse(b.pinned_at) - Date.parse(a.pinned_at);
  if (byMs !== 0 && !Number.isNaN(byMs)) return byMs;
  if (a.pinned_at === b.pinned_at) return 0;
  return a.pinned_at < b.pinned_at ? 1 : -1;
}

/**
 * The chat's pins for one viewer, newest pin first. Dropped: a pin whose
 * message did not come with it, whose message is removed (`removed_at` set:
 * the trigger drops such a pin, the list does not count on it), or whose
 * message is not after the viewer's "Clear chat history" mark (`clearedAt`;
 * null = no mark). `text` is the one-line quote, `full_text` the whole
 * content trimmed (D6: the panel opens it in place when it cannot jump).
 * `authors` is `pinAuthors(...)` of the viewer's own read: an author who is
 * not in it (their profile is hidden from this viewer, or that read failed)
 * is `author: null`, never a name the viewer could not have read.
 */
export function toPinnedMessages(
  rows: PinRow[] | null,
  clearedAt: string | null,
  authors: ReadonlyMap<string, Person>,
): PinnedMessage[] {
  const pins: PinnedMessage[] = [];
  for (const row of [...(rows ?? [])].sort(newestPinFirst)) {
    const message = embedded(row.message);
    if (!shown(message, clearedAt)) continue;
    const content = typeof message.content === "string" ? message.content : "";
    pins.push({
      message_id: row.message_id,
      pinned_at: row.pinned_at,
      created_at: message.created_at,
      text: pinQuote(content),
      full_text: content.trim(),
      author: (typeof message.user_id === "string" ? authors.get(message.user_id) : undefined) ?? null,
      media_kind: mediaKind(message.media_url, message.media_kind),
      has_post: typeof message.attachment_id === "string" && message.attachment_id !== "",
    });
  }
  return pins;
}

/**
 * The cap's two facts from `PIN_LIVE_SELECT` rows: how many pins sit on a
 * message that is still live (a pin on a removed message takes no slot: the
 * wave-1 review), and whether `messageId` is pinned already (re-pinning at
 * the cap answers `already`, not `pin_limit`).
 */
export function pinSlots(rows: PinRow[] | null, messageId: string): { live: number; among: boolean } {
  const wanted = messageId.toLowerCase();
  let live = 0;
  let among = false;
  for (const row of rows ?? []) {
    if (typeof row.message_id === "string" && row.message_id.toLowerCase() === wanted) among = true;
    const message = embedded(row.message);
    if (message && !message.removed_at) live += 1;
  }
  return { live, among };
}

/** `?limit=` as the shared read takes it: a whole number from 1 to 60; anything else is 30. */
export function clampSharedLimit(raw: string | null): number {
  const n = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(n)) return SHARED_LIMIT_DEFAULT;
  return Math.min(SHARED_LIMIT_MAX, Math.max(1, Math.floor(n)));
}

/**
 * The photos, videos and shared posts of a page, in the order given. The
 * rows are CHANGED in place by `prepareForClient` (the thread read's last
 * pass): `media_url` becomes the same-origin proxy URL or null, never the
 * stored key, and a shared post's media goes through the post proxy. A row
 * left with neither (its post is gone or hidden from the viewer, and it has
 * no photo or video the proxy would serve) is skipped.
 */
export function toSharedItems(rows: MessageRow[] | null, channelId: string): SharedItem[] {
  const page = rows ?? [];
  prepareForClient(page, channelId);
  const items: SharedItem[] = [];
  for (const row of page) {
    const mediaUrl = row.media_url ?? null;
    const attachment = row.attachment ?? null;
    if (mediaUrl === null && attachment === null) continue;
    items.push({
      message_id: row.id,
      created_at: row.created_at,
      user_id: row.user_id,
      media_url: mediaUrl,
      media_kind: mediaKind(mediaUrl, row.media_kind),
      attachment,
    });
  }
  return items;
}
