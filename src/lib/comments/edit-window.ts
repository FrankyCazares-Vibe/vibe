/**
 * Your own comment: delete it any time, edit it for 3 minutes after sending
 * (Franky, Nov 16, 2026).
 *
 * The window is the rule the student sees: Edit shows only while it is open.
 * The server allows a short grace on top, so a save sent in the last seconds
 * isn't refused on the way. The static popup (public/html/_postViewer.js)
 * carries its own copy of the 3 minutes; edit-window.test.ts holds them equal.
 */

export const COMMENT_EDIT_WINDOW_MS = 3 * 60 * 1000;

/** Slack for the save's round trip and a slightly slow device clock. */
export const COMMENT_EDIT_GRACE_MS = 20 * 1000;

/** Same limit as the comment route (`MAX_CONTENT`). */
export const COMMENT_MAX_CHARS = 1000;

function sentAt(createdAt: unknown): number | null {
  if (typeof createdAt !== "string") return null;
  const t = Date.parse(createdAt);
  return Number.isNaN(t) ? null : t;
}

/** May the author still see Edit on a comment sent at `createdAt`? */
export function canEditComment(createdAt: unknown, now: number = Date.now()): boolean {
  const t = sentAt(createdAt);
  return t !== null && now - t < COMMENT_EDIT_WINDOW_MS;
}

/** Milliseconds of the window left (0 when shut), for hiding Edit on time. */
export function commentEditMsLeft(createdAt: unknown, now: number = Date.now()): number {
  const t = sentAt(createdAt);
  if (t === null) return 0;
  return Math.max(0, COMMENT_EDIT_WINDOW_MS - (now - t));
}

/** The oldest `created_at` the server still lets its author edit. */
export function commentEditCutoffIso(now: number = Date.now()): string {
  return new Date(now - COMMENT_EDIT_WINDOW_MS - COMMENT_EDIT_GRACE_MS).toISOString();
}
