/**
 * Deleting your own message, on every chat screen (Oct 19, 2026; batch B7 of
 * handoffs/2026-10-19-critique/PLAN.md, decisions 8 and 9 of DECISIONS.md):
 * who sees Delete, what the confirm says, and what the list does with the
 * server's answer. The note itself (its words, its shape) is
 * src/lib/chat/deleted-note.ts, shared with the server read.
 *
 * Delete is the sender's alone. An officer's Remove on someone else's
 * message stays what it was (hidden, not deleted; RoomThread / BoardView).
 *
 * PURE: type-only imports plus deleted-note.ts (itself pure), so
 * `node --test` loads it (delete-rules.test.ts).
 */

import { DELETED_LINE, DELETED_POST_LINE, withDeletedQuotes, type QuoteFields } from "@/lib/chat/deleted-note";
import type { DeleteOwnResponse } from "@/lib/chat/types";

/** What the rules read of a message, in either list's shape (`ChatMessage` or `MessageRow`). */
export type DeletableMessage = {
  id: string;
  user_id: string;
  thread_root_id?: string | null;
  removed?: unknown;
  hidden?: boolean;
  deleted?: boolean;
};

/** A row the composer put on screen before the server answered. */
const isTemp = (m: { id: string }) => m.id.startsWith("temp_");

/**
 * Delete shows on the viewer's own message, poll, sign-up, event card or
 * Board reply. Never on someone else's, on a row still sending (no id to
 * delete), on a note already, on a block stub, or on a message the Vibe team
 * or a club removed (that row is the "removed" card, which has its own way
 * out), and never before the screen knows who the viewer is.
 */
export function canDeleteOwn(m: DeletableMessage, viewerId: string | null | undefined): boolean {
  if (!viewerId || m.user_id === "" || m.user_id !== viewerId) return false;
  if (isTemp(m) || m.deleted === true || m.hidden === true) return false;
  return m.removed === null || m.removed === undefined;
}

/**
 * Delete on a Board post: the viewer's own top-level post (decision 9).
 * Only the club's owner and admins can post there, so an own post is an
 * officer's. A former officer keeps Delete on what they wrote: the words are
 * theirs, and the server allows the sender always.
 */
export function canDeleteBoardPost(post: DeletableMessage, viewerId: string | null | undefined): boolean {
  return !post.thread_root_id && canDeleteOwn(post, viewerId);
}

/** The menu row's word ("Delete", never "Unsend"). */
export const DELETE_LABEL = "Delete";

/** The toast when the delete did not go through. */
export const DELETE_FAILED = "Couldn't delete this message.";

/** The confirm's words: the title, the sentence, the button. */
export type DeleteCopy = { title: string; body: string; confirm: string };

const NOTIFIED = "Anyone who already got a notification may still see it there.";

/**
 * "Delete for everyone?" and what happens. A Board post says its replies
 * stay (they are other members' words), with the count when it has any.
 */
export function deleteConfirmCopy(target: { boardPost?: boolean; replies?: number | null } = {}): DeleteCopy {
  if (target.boardPost) {
    const n = Math.max(0, Math.trunc(target.replies ?? 0));
    const replies = n === 0 ? "" : n === 1 ? " Its 1 reply stays." : ` Its ${n} replies stay.`;
    return {
      title: "Delete for everyone?",
      body: `It's removed from the Board for everyone, and a grey "${DELETED_POST_LINE}" note stays in its place.${replies} ${NOTIFIED}`,
      confirm: DELETE_LABEL,
    };
  }
  return {
    title: "Delete for everyone?",
    body: `It's removed from this chat for everyone, and a grey "${DELETED_LINE}" note stays in its place. ${NOTIFIED}`,
    confirm: DELETE_LABEL,
  };
}

/** Whether the answer left a note (true) or took the row away whole (false: a database without the note, 20261019150000). */
export function leftNote(answer: DeleteOwnResponse | null | undefined): boolean {
  return answer?.deleted === true;
}

/** The fields a list row empties when it turns into the note (`MessageRow`; `asDeletedNote` is the `ChatMessage` twin). */
type NoteFields = {
  content: string;
  media_url?: string | null;
  media_kind?: string | null;
  attachment_id?: string | null;
  attachment_kind?: string | null;
  attachment?: unknown;
  parent_message_id?: string | null;
  parent_preview?: QuoteFields | null;
  reactions?: unknown[];
  removed?: unknown;
  deleted?: boolean;
};

/** One list row as the note: who and when stay; nothing written or shared does. */
export function asDeletedRow<T extends NoteFields>(m: T): T {
  return {
    ...m,
    content: "",
    media_url: null,
    media_kind: null,
    attachment_id: null,
    attachment_kind: null,
    attachment: null,
    parent_message_id: null,
    parent_preview: null,
    reactions: [],
    removed: null,
    deleted: true,
  };
}

/**
 * The list after a delete the server answered: the row becomes the note
 * (`deleted: true`), or goes when the server took it away whole. Every reply
 * that quoted it quotes the note from now on, or loses its quote after a
 * hard delete (`withDeletedQuotes`; review of Oct 19, 2026: the words stayed
 * readable inside the quotes). A list that neither holds nor quotes the row
 * stays as it was (the same array).
 */
export function listAfterDelete<T extends NoteFields & { id: string }>(
  rows: readonly T[],
  id: string,
  answer: DeleteOwnResponse | null | undefined,
): readonly T[] {
  const note = leftNote(answer);
  const own = !rows.some((m) => m.id === id)
    ? rows
    : note
      ? rows.map((m) => (m.id === id ? asDeletedRow(m) : m))
      : rows.filter((m) => m.id !== id);
  return withDeletedQuotes(own, id, note);
}
