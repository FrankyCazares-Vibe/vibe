/**
 * Which files a moderator's post removal takes offline (S67 security wave,
 * batch c; report 2026-09-27, "[High] … a moderator's removal leaves the file
 * online" and "[Medium] … moderator-removed images stay reachable").
 *
 * WHY THIS EXISTS. Removing a post used to be a soft delete only: the row was
 * hidden, but its photo stayed at a permanent public URL in the `profiles`
 * bucket, so anyone who had copied the link could still open it signed out.
 * POST /api/admin/content/remove now MOVES that photo (and a video's poster
 * frame) into the private `quarantine` bucket
 * (migration 20260927130000_quarantine_bucket.sql). This file decides WHICH
 * objects may be moved; the move itself is in media-quarantine-store.ts.
 *
 * THE RULE: only an object in the post author's OWN post-media folders,
 * `<authorId>/posts/<file>` or `<authorId>/posters/<file>`, on our own
 * project's public `profiles` URL. `media_url` is a column a student can
 * write, so a hostile post can point at another student's avatar or photo;
 * quarantining THAT file would take the victim's picture down on the
 * strength of the attacker's removal. Anything else is left alone and counted:
 *   - "r2":       an R2 key (`clips/…`, `orgs/…`). Not public; the media route
 *                 refuses to sign a removed post's key (batch b).
 *   - "foreign":  our `profiles` bucket, but outside the author's post
 *                 folders. Never touched here.
 *   - "external": any other address. Nothing Vibe can take down.
 *
 * WHAT A POST MAY STORE IS THE SAME SET (repair round 1). A removal used to
 * miss a photo the author uploaded as a banner or avatar and then posted by
 * URL: the database took any path on our host, this module moved nothing,
 * and the route answered success. Since migration
 * 20260927142000_post_media_url_author_folders.sql the database's
 * post_media_ref_ok only stores a photo in the author's own posts/ or
 * posters/ folder, which is exactly what {@link authorPostMediaPath} moves.
 * {@link isAuthorPostPhotoUrl} is that storing rule in TypeScript, for the
 * routes that write posts (publish-post). So "foreign" below only counts rows
 * written before that migration; production had none.
 *
 * THE KEY DOES NOT CHANGE. The quarantined copy sits at the same object path
 * in the `quarantine` bucket, and the post row keeps its `media_url` /
 * `media_thumbnail_url` untouched: that IS the record of where the file came
 * from, so an appeal restore is one move back and the old URL works again.
 *
 * This module has NO imports so node:test can load it directly.
 */

/** The public bucket post photos and poster frames are uploaded to. */
export const PROFILES_BUCKET_ID = "profiles";
/** The private bucket a removed post's files are moved into. */
export const QUARANTINE_BUCKET_ID = "quarantine";

/**
 * The folders under `<uid>/` that profile-upload writes post media into
 * (kind=post and kind=poster). The ONLY folders a post's photo may come from:
 * the database refuses anything else (post_media_ref_ok, 20260927142000).
 */
const POST_MEDIA_FOLDERS = new Set(["posts", "posters"]);
/** A user folder: a UUID as Postgres prints it. */
const OWNER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A file name: letters, digits, `.`, `_`, `-`; never `..`. */
const FILE_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
/** Longest media reference we look at (publish-post's own cap). */
const MAX_REF_LEN = 2048;
/** What a public object URL looks like after the project origin. */
const PUBLIC_PREFIX = `/storage/v1/object/public/${PROFILES_BUCKET_ID}/`;

export type LeftOnlineKind = "r2" | "foreign" | "external";

/**
 * The `profiles` object path a post media reference points at, when — and
 * only when — it is inside `authorId`'s own `posts/` or `posters/` folder on
 * this project (`supabaseUrl`, e.g. NEXT_PUBLIC_SUPABASE_URL). Otherwise null.
 * A query string or hash (a cache-buster) is ignored.
 */
export function authorPostMediaPath(
  ref: unknown,
  supabaseUrl: string,
  authorId: unknown,
): string | null {
  if (typeof ref !== "string" || typeof authorId !== "string") return null;
  if (!OWNER_ID_RE.test(authorId)) return null;
  if (ref.length === 0 || ref.length > MAX_REF_LEN) return null;
  // The URL parser would quietly resolve `..` (and `%2e%2e`) segments, so a
  // path that needs resolving is refused before it gets the chance.
  const beforeQuery = ref.split(/[?#]/, 1)[0];
  if (beforeQuery.includes("..") || beforeQuery.includes("%")) return null;
  let url: URL;
  let project: URL;
  try {
    url = new URL(ref);
    project = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.origin !== project.origin) return null;
  if (!url.pathname.startsWith(PUBLIC_PREFIX)) return null;
  const parts = url.pathname.slice(PUBLIC_PREFIX.length).split("/");
  if (parts.length !== 3) return null;
  const [owner, folder, file] = parts;
  if (owner !== authorId) return null;
  if (!POST_MEDIA_FOLDERS.has(folder)) return null;
  if (!FILE_RE.test(file) || file.includes("..")) return null;
  return `${owner}/${folder}/${file}`;
}

/** A stored photo URL: https, then safe path characters only (no query, no hash). */
const STORED_PHOTO_URL_RE = /^https:\/\/[a-z0-9.-]+\/[A-Za-z0-9._~/-]*$/;

/**
 * May a post by `authorId` STORE `ref` as its photo or poster frame? True only
 * for a plain https URL of an object in the author's own `posts/` or
 * `posters/` folder on this project (`supabaseUrl`): no query string, no
 * hash, no `..`, at most 2048 characters. The same rule as the database's
 * post_media_ref_ok photo arm (migration 20260927142000, which pins the
 * production host), and a strict subset of what {@link authorPostMediaPath}
 * takes offline, so a photo a post can carry is always one a moderator's
 * removal can move. R2 keys (`clips/`, `orgs/`) are not photos; check those
 * with src/lib/posts/media-ownership.ts.
 */
export function isAuthorPostPhotoUrl(
  ref: unknown,
  supabaseUrl: string,
  authorId: unknown,
): boolean {
  if (typeof ref !== "string" || !STORED_PHOTO_URL_RE.test(ref)) return false;
  if (ref.length > MAX_REF_LEN || ref.includes("..")) return false;
  let origin: string;
  try {
    origin = new URL(supabaseUrl).origin;
  } catch {
    return false;
  }
  // The exact spelling the database checks: no upper-case host, no port
  // games, no path the URL parser would rewrite.
  if (!ref.startsWith(`${origin}${PUBLIC_PREFIX}`)) return false;
  return authorPostMediaPath(ref, supabaseUrl, authorId) !== null;
}

/** Why a reference was left where it is — for the log, never for the student. */
export function leftOnlineKind(ref: string, supabaseUrl: string): LeftOnlineKind {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(ref)) return "r2";
  try {
    const url = new URL(ref);
    const project = new URL(supabaseUrl);
    if (url.origin === project.origin && url.pathname.startsWith(PUBLIC_PREFIX)) {
      return "foreign";
    }
  } catch {
    // An unparseable reference is nothing we host.
  }
  return "external";
}

export type QuarantinePlan = {
  /** `profiles` object paths to move, each once. */
  paths: string[];
  /** References left where they are, by kind (for the log line). */
  left: Record<LeftOnlineKind, number>;
};

/**
 * Everything a removal of this post should take offline: its photo and its
 * poster frame, deduplicated (an image post stores the same URL in both
 * columns). Empty references are skipped silently; the rest are counted.
 */
export function planPostQuarantine(
  post: { user_id: unknown; media_url?: unknown; media_thumbnail_url?: unknown },
  supabaseUrl: string,
): QuarantinePlan {
  const plan: QuarantinePlan = { paths: [], left: { r2: 0, foreign: 0, external: 0 } };
  for (const ref of [post.media_url, post.media_thumbnail_url]) {
    if (typeof ref !== "string" || ref.trim() === "") continue;
    const path = authorPostMediaPath(ref.trim(), supabaseUrl, post.user_id);
    if (path) {
      if (!plan.paths.includes(path)) plan.paths.push(path);
    } else {
      plan.left[leftOnlineKind(ref.trim(), supabaseUrl)] += 1;
    }
  }
  return plan;
}
