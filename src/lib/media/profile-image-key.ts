/**
 * Is this photo reference one of the owner's OWN files in the public
 * `profiles` bucket, and which kind? (S67 security wave B, shared contract B0.)
 *
 * WHO USES IT.
 *  - The moderator image-removal tool (B1) decides which file a takedown may
 *    move into the private `quarantine` bucket.
 *  - The upload routes (B3) accept an avatar/banner value only when it names
 *    the student's own file, and delete the previous own file on a replace.
 *
 * WHY IT MUST BE STRICT. `users.avatar_url` / `banner_url` and the profile
 * logo fields are values a student can send. A hostile value can name ANOTHER
 * student's file (`<victim>/avatar-….jpg`) or the student's own live post
 * photo. Moving or deleting "whatever the column says" would then take the
 * victim's picture down, or a live post's photo, on the strength of the
 * attacker's own action. So a path comes back only when it sits in
 * `<ownerId>/…`; everything else is null.
 *
 * ACT ON `slot`, NEVER ON "NOT NULL". A non-null answer only proves the file
 * is the owner's. An avatar column that names the owner's own post photo
 * answers `{ slot: "post" }`: retiring or quarantining it as an avatar would
 * delete a live post's photo. Check the slot you expect.
 *
 * THE SHAPES WRITTEN TODAY (profile-upload KIND_PATH_PREFIX,
 * storage-upload.ts uploadProfileDataUrl):
 *   `<uid>/avatar-<uuid>.<ext>`        slot "avatar"
 *   `<uid>/banner-<uuid>.<ext>`        slot "banner"
 *   `<uid>/logos/logo-<uuid>.<ext>`    slot "logo"   (experience / working-on)
 *   `<uid>/posts/post-<uuid>.<ext>`    slot "post"
 *   `<uid>/posters/poster-<uuid>.jpg`  slot "poster" (a video's frame)
 * Root avatar/banner files match any `avatar-<safe>.<ext>` spelling (the
 * re-encode may change extensions); inside a folder, the folder decides.
 * "other" = still the owner's folder and a well-formed name, but no shape any
 * upload writes today (a legacy root `resume-….pdf`, an unknown subfolder).
 *
 * WHAT IS ACCEPTED, exactly:
 *  - the public object URL, spelled exactly
 *    `<project origin>/storage/v1/object/public/profiles/<path>` (the origin
 *    as `new URL(supabaseUrl).origin` prints it: no upper-case host, no
 *    port, no user info), or
 *  - the bare object path `<ownerId>/…` inside the bucket.
 * Refused (null): another folder, another host or bucket, a query string or
 * hash, `%` escapes, `..`, whitespace, empty or deeper segments, more than
 * 2048 characters, an owner id that isn't a lower-case UUID.
 *
 * `supabaseUrl` defaults to NEXT_PUBLIC_SUPABASE_URL (the spec's two-argument
 * call); tests and callers that already hold it pass it in.
 *
 * NO IMPORTS, so node:test loads it directly.
 */

export type ProfileImageSlot = "avatar" | "banner" | "logo" | "post" | "poster" | "other";

export type ProfileImageKey = {
  /** The object path inside the `profiles` bucket, `<ownerId>/…`. */
  path: string;
  slot: ProfileImageSlot;
};

/** A user folder: a UUID as Postgres prints it. */
const OWNER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A folder or file name: letters, digits, `.`, `_`, `-`; never starts with `.`. */
const SEGMENT_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;
/** A root profile photo or cover, whatever the upload named its extension. */
const ROOT_IMAGE_RE = /^(avatar|banner)-[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5}$/;
/** Longest reference we look at (publish-post's media cap). */
const MAX_REF_LEN = 2048;
/** What a public object URL looks like after the project origin. */
const PUBLIC_PREFIX = "/storage/v1/object/public/profiles/";

/**
 * The folders under `<uid>/` that profile-upload writes into. A Map, not an
 * object literal: `"constructor"` is a well-formed folder name, and an object
 * lookup would hand back Object.prototype's member instead of undefined.
 */
const FOLDER_SLOTS: ReadonlyMap<string, ProfileImageSlot> = new Map([
  ["logos", "logo"],
  ["posts", "post"],
  ["posters", "poster"],
]);

function isSafeSegment(segment: string): boolean {
  return SEGMENT_RE.test(segment) && !segment.includes("..");
}

/** `https://<project>` (or the local `http://127.0.0.1:54321`), else null. */
function projectOrigin(supabaseUrl: string | null | undefined): string | null {
  if (typeof supabaseUrl !== "string" || supabaseUrl.trim() === "") return null;
  try {
    const url = new URL(supabaseUrl);
    // Any other scheme prints its origin as the string "null".
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The owner's own `profiles` object this reference names, with its kind, or
 * null. See the file header for exactly what is accepted.
 */
export function ownProfileImageKey(
  ref: string | null | undefined,
  ownerId: string,
  supabaseUrl: string | null | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): ProfileImageKey | null {
  if (typeof ref !== "string" || typeof ownerId !== "string") return null;
  if (!OWNER_ID_RE.test(ownerId)) return null;
  if (ref.length === 0 || ref.length > MAX_REF_LEN) return null;

  let path: string;
  if (ref.startsWith(`${ownerId}/`)) {
    path = ref;
  } else {
    const origin = projectOrigin(supabaseUrl);
    if (!origin) return null;
    const prefix = `${origin}${PUBLIC_PREFIX}`;
    if (!ref.startsWith(prefix)) return null;
    path = ref.slice(prefix.length);
  }

  // Every character after the prefix is checked segment by segment, so a
  // query, hash, `%`, backslash or space never survives to the answer.
  const parts = path.split("/");
  if (parts[0] !== ownerId || !parts.slice(1).every(isSafeSegment)) return null;

  if (parts.length === 2) {
    const root = ROOT_IMAGE_RE.exec(parts[1]);
    return { path, slot: root ? (root[1] as "avatar" | "banner") : "other" };
  }
  if (parts.length === 3) {
    return { path, slot: FOLDER_SLOTS.get(parts[1]) ?? "other" };
  }
  return null;
}
