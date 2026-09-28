/**
 * Who owns a stored media reference (S67 security wave, batch b).
 *
 * WHY THIS EXISTS. `posts.media_url`, `posts.media_thumbnail_url` and
 * `messages.media_url` hold R2 object keys. Routes that run with the server's
 * own keys trust those columns: DELETE /api/posts/[id] erased whatever
 * `clips/` key the row named, /api/posts/[id]/media signed any `clips/` or
 * `orgs/` key, and account deletion erased every `messages/<any chat>/` key.
 * A student can write those columns straight through PostgREST, so a planted
 * row could point at someone else's file (report 2026-09-27, [High] "Any
 * student can permanently erase other students' and clubs' videos").
 *
 * Every question here is "is this key inside THAT owner's folder?", answered
 * the same way the database trigger answers it (migration
 * 20260927120000_media_ref_ownership.sql). Keep the two in step: a key the
 * route accepts but the database refuses turns a clean 400 into a 500.
 *
 * The rules for a key:
 *  - it starts with `<family>/<owner id>/`, where the owner id is a UUID as
 *    Postgres prints it (lower-case hex and dashes, 36 characters);
 *  - the rest is one or more path segments made of letters, digits, `.`,
 *    `_` and `-`, joined by single slashes (no empty segment, no trailing
 *    slash, no backslash, no spaces or control characters);
 *  - it never contains `..` anywhere, even inside a file name;
 *  - it is at most 1024 characters.
 *
 * This module has NO imports so node:test can load it directly.
 */

/** R2 key families. Copies of the constants in src/lib/r2.ts (that file pulls in the S3 SDK). */
export const CLIP_FOLDER = "clips/";
export const ORG_FOLDER = "orgs/";
export const MESSAGE_FOLDER = "messages/";

/** Longest key we accept. Real keys are under 120 characters. */
export const MAX_MEDIA_KEY_LEN = 1024;
/** Longest https media URL we accept (publish-post's old cap). */
export const MAX_MEDIA_URL_LEN = 2048;

/** A folder id: a UUID in the text form Postgres emits. */
const OWNER_ID_RE = /^[0-9a-f-]{36}$/;
/** What may follow the owner folder: safe segments joined by single slashes. */
const KEY_REST_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
/** Chat media sits directly in the chat's folder: exactly one segment. */
const ONE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

function isUnderFolder(key: unknown, family: string, ownerId: unknown, oneSegment: boolean): boolean {
  if (typeof key !== "string" || typeof ownerId !== "string") return false;
  if (!OWNER_ID_RE.test(ownerId)) return false;
  if (key.length > MAX_MEDIA_KEY_LEN || key.includes("..")) return false;
  const head = `${family}${ownerId}/`;
  if (!key.startsWith(head)) return false;
  const rest = key.slice(head.length);
  return (oneSegment ? ONE_SEGMENT_RE : KEY_REST_RE).test(rest);
}

/** True when `key` is a video (or poster) the user uploaded: `clips/<userId>/…`. */
export function isOwnClipKey(key: unknown, userId: unknown): boolean {
  return isUnderFolder(key, CLIP_FOLDER, userId, false);
}

/** True when `key` is one of this club's files: `orgs/<orgId>/…`. */
export function isOrgAssetKey(key: unknown, orgId: unknown): boolean {
  return isUnderFolder(key, ORG_FOLDER, orgId, false);
}

/** True when `key` is a file sent in this chat: `messages/<channelId>/<file>`. */
export function isChannelMediaKey(key: unknown, channelId: unknown): boolean {
  return isUnderFolder(key, MESSAGE_FOLDER, channelId, true);
}

const HTTPS_MEDIA_URL_RE = /^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~/-]*$/;

/**
 * The SHAPE an https media URL must have to be stored: https, a lower-case
 * host with no port, and a path of safe characters only (no query string,
 * no `..`, no quotes, brackets or spaces). It does not check WHICH host;
 * pair it with isSupabaseHttpsUrl (src/lib/org-asset-url.ts). The database
 * pins the host itself.
 */
export function hasSafeMediaUrlShape(url: unknown): boolean {
  if (typeof url !== "string") return false;
  if (url.length > MAX_MEDIA_URL_LEN || url.includes("..")) return false;
  return HTTPS_MEDIA_URL_RE.test(url);
}

/**
 * Which R2 files deleting this post may erase: the post's video and poster
 * frame, only when each is the caller's own `clips/<callerId>/` upload.
 * Anything else (another student's key, a club's key, a URL) stays put.
 * Duplicates collapse, so a post whose poster is its video is deleted once.
 */
export function ownClipKeysToDelete(
  refs: ReadonlyArray<string | null | undefined>,
  callerId: string,
): string[] {
  const out: string[] = [];
  for (const ref of refs) {
    if (isOwnClipKey(ref, callerId) && !out.includes(ref as string)) out.push(ref as string);
  }
  return out;
}

/**
 * How /api/posts/[id]/media may sign a stored key for this post:
 *  - "clip" when it sits in the post author's own `clips/<user_id>/` folder;
 *  - "org"  when the post is a club post and it sits in `orgs/<org_id>/`;
 *  - null   for anything else, which the route answers as not found.
 */
export function postMediaKeyKind(
  stored: unknown,
  post: { user_id: unknown; org_id: unknown },
): "clip" | "org" | null {
  if (isOwnClipKey(stored, post.user_id)) return "clip";
  if (typeof post.org_id === "string" && post.org_id && isOrgAssetKey(stored, post.org_id)) {
    return "org";
  }
  return null;
}

/**
 * Account deletion: which chat files the leaving student's own messages may
 * take with them. A key counts only when it sits in the folder of the chat
 * its message was sent in, AND no other member's message points at the same
 * file (`sharedWithOthers`). A row planted to name another chat's file, or
 * another member's photo in the same chat, therefore erases nothing.
 */
export function purgeableMessageMediaKeys(
  rows: ReadonlyArray<{ channel_id: unknown; media_url: unknown }>,
  sharedWithOthers: ReadonlySet<string> = new Set(),
): { keys: string[]; skipped: number; shared: number } {
  const keys = new Set<string>();
  let skipped = 0;
  let shared = 0;
  for (const row of rows) {
    const key = typeof row.media_url === "string" ? row.media_url : "";
    if (!key) continue;
    if (!isChannelMediaKey(key, row.channel_id)) {
      skipped += 1;
      continue;
    }
    if (sharedWithOthers.has(key)) {
      shared += 1;
      continue;
    }
    keys.add(key);
  }
  return { keys: Array.from(keys), skipped, shared };
}
