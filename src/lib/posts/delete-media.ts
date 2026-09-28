/**
 * Which stored files go when a post (or a whole club) is deleted, and which
 * must stay (S67 security wave 2, batch B2; report #9 "Deleted posts ... stay
 * reachable", waveB-build.md product calls 1-3).
 *
 * WHY THIS EXISTS. Deleting a photo post used to delete the row only: the
 * photo (and a video's poster frame) stayed at a permanent public URL in the
 * `profiles` bucket. Now the route removes the author's own files, and this
 * module decides WHICH ones, with the same rules the moderator removal uses
 * (src/lib/moderation/media-quarantine.ts) so the two can never disagree.
 *
 * THE RULES
 *  - Only the author's own files: `profiles/<author>/(posts|posters)/<file>`
 *    (planPostQuarantine), R2 `clips/<author>/…` (ownClipKeysToDelete), and
 *    for a club post R2 `orgs/<club>/posts/…`. Never a club's logo or banner
 *    (they share the `orgs/<club>/` folder), never another student's file.
 *  - Never a file something else still names: another post (removed ones
 *    included, so a quarantined twin stays the record), or a `keepRefs`
 *    value (the author's avatar/cover, the club's logo/banner).
 *  - Evidence is never deleted: a moderator-removed post's files, and a
 *    reported post's files, are kept (see evidenceToKeep; the store decides
 *    quarantine vs delete from the open-report check).
 *
 * PURE. Its only imports are the two import-free rule modules and B0's
 * profile-image-key (import-free), so node:test loads it with the resolve
 * hook in delete-media.test.ts.
 */

import { ownProfileImageKey } from "../media/profile-image-key";
import { planPostQuarantine } from "../moderation/media-quarantine";
import { isOrgAssetKey, ownClipKeysToDelete } from "./media-ownership";

/** The media columns of a post row (or of a report's post snapshot). */
export type PostMediaRow = {
  user_id: unknown;
  org_id?: unknown;
  media_url?: unknown;
  media_thumbnail_url?: unknown;
};

export type PostMediaPlan = {
  /** `profiles` object paths to remove (or quarantine), each once. */
  profilesPaths: string[];
  /** R2 keys to delete (or keep, when the post is under report), each once. */
  r2Keys: string[];
  /** Candidate files kept because another row or a keep ref names them. */
  held: number;
};

function refsOf(row: PostMediaRow): string[] {
  const out: string[] = [];
  for (const ref of [row.media_url, row.media_thumbnail_url]) {
    if (typeof ref === "string" && ref !== "" && !out.includes(ref)) out.push(ref);
  }
  return out;
}

/** True for a club post's own media key: `orgs/<orgId>/posts/<…>`. */
export function isClubPostMediaKey(key: unknown, orgId: unknown): boolean {
  return (
    typeof key === "string" &&
    typeof orgId === "string" &&
    isOrgAssetKey(key, orgId) &&
    key.startsWith(`orgs/${orgId}/posts/`)
  );
}

/**
 * The files deleting `post` may take with it. `others` are the rows that may
 * still name the same files: the author's other posts (every status, removed
 * included) and, for a club post, the club's other posts. `keepRefs` are
 * column values that must keep their file (avatar/cover, club logo/banner).
 * Rows in `others` are trusted only for what they NAME, never for ownership:
 * a candidate is always the deleted post's own file first.
 */
export function planPostMediaDelete(
  post: PostMediaRow,
  others: ReadonlyArray<PostMediaRow>,
  keepRefs: ReadonlyArray<unknown>,
  supabaseUrl: string,
): PostMediaPlan {
  const candidatesProfiles = planPostQuarantine(post, supabaseUrl).paths;
  const refs = refsOf(post);
  const candidatesR2 = ownClipKeysToDelete(refs, String(post.user_id ?? ""));
  if (typeof post.org_id === "string" && post.org_id) {
    for (const ref of refs) {
      if (isClubPostMediaKey(ref, post.org_id) && !candidatesR2.includes(ref)) {
        candidatesR2.push(ref);
      }
    }
  }

  const heldPaths = new Set<string>();
  const heldRefs = new Set<string>();
  for (const other of others) {
    for (const path of planPostQuarantine(other, supabaseUrl).paths) heldPaths.add(path);
    for (const ref of refsOf(other)) heldRefs.add(ref);
  }
  for (const ref of keepRefs) {
    if (typeof ref !== "string" || ref === "") continue;
    heldRefs.add(ref);
    const path = planPostQuarantine(
      { user_id: post.user_id, media_url: ref },
      supabaseUrl,
    ).paths[0];
    if (path) heldPaths.add(path);
  }

  const profilesPaths = candidatesProfiles.filter((p) => !heldPaths.has(p));
  const r2Keys = candidatesR2.filter((k) => !heldRefs.has(k));
  const held =
    candidatesProfiles.length - profilesPaths.length + (candidatesR2.length - r2Keys.length);
  return { profilesPaths, r2Keys, held };
}

export type EvidenceSet = {
  /** `profiles` paths to move into quarantine before the account sweep. */
  profilesPaths: string[];
  /** R2 `clips/<uid>/` keys the account sweep must leave in place. */
  clipKeys: string[];
};

/**
 * Account self-delete: the files that are evidence and must survive it.
 * `postRows` are the user's moderator-removed posts plus the snapshots of
 * reports about their posts; `profileRefs` are the avatar/cover values to keep
 * when an open report is about the user. Only files in `uid`'s own folders
 * count; a row naming anyone else's file adds nothing.
 */
export function evidenceToKeep(
  postRows: ReadonlyArray<PostMediaRow>,
  profileRefs: ReadonlyArray<unknown>,
  uid: string,
  supabaseUrl: string,
): EvidenceSet {
  const paths = new Set<string>();
  const clips = new Set<string>();
  for (const row of postRows) {
    if (row.user_id !== uid) continue;
    for (const path of planPostQuarantine(row, supabaseUrl).paths) paths.add(path);
    for (const key of ownClipKeysToDelete(refsOf(row), uid)) clips.add(key);
  }
  for (const ref of profileRefs) {
    if (typeof ref !== "string") continue;
    const own = ownProfileImageKey(ref, uid, supabaseUrl);
    if (own && (own.slot === "avatar" || own.slot === "banner")) paths.add(own.path);
  }
  return { profilesPaths: Array.from(paths), clipKeys: Array.from(clips) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Every `orgs/<orgId>/…` key mentioned anywhere inside `values` (strings, or
 * JSON such as moderation_actions.meta and report snapshots). Club deletion
 * keeps these when it sweeps the club's R2 folder: a logo a moderator removed
 * stays where it is as the record (B1), and so does a reported post's file.
 * Over-matching only keeps a file; it can never delete one.
 */
export function orgKeysNamedIn(values: ReadonlyArray<unknown>, orgId: string): Set<string> {
  const out = new Set<string>();
  if (!UUID_RE.test(orgId)) return out;
  const re = new RegExp(`orgs/${orgId}/[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*`, "g");
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    for (const m of text.matchAll(re)) out.add(m[0]);
  }
  return out;
}
