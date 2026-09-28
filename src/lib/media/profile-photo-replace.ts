/**
 * Which profile-photo files a save may accept, check and retire
 * (S67 security wave B, B3; finding #9b: "replacing a photo never deleted the
 * old one", 76 of the 88 orphaned files live).
 *
 * The two columns are `users.avatar_url` (profile photo) and
 * `users.banner_url` (cover). Both hold the public URL of a file in the
 * `profiles` bucket, written by the service role after a route validated it.
 *
 * THE RULES, all built on B0's `ownProfileImageKey`:
 *  - A column may name only the student's OWN profile photo or cover file
 *    (`<uid>/avatar-*` or `<uid>/banner-*`). Another student's file, the
 *    student's own post photo or work logo, another host: refused. Either
 *    file may sit in either column (a photo reused as the cover is fine).
 *  - A file is stale when the row named it before the save and names it in
 *    NEITHER column after. Only such files are retired, so a save can never
 *    take down a photo that is still on the profile.
 *  - "Names it" after the save is a plain substring test on the stored text,
 *    not a parse: any spelling of the same file (a cache-buster, an odd
 *    host case) keeps it. Erring toward keeping leaves an orphan, the
 *    pre-B3 status quo; erring the other way breaks a live photo.
 *
 * Pure: one value import (B0's parser), so the test needs the resolve hook.
 */

import { ownProfileImageKey } from "./profile-image-key";

export type ProfilePhotoColumns = {
  avatar_url?: unknown;
  banner_url?: unknown;
};

const COLUMNS = ["avatar_url", "banner_url"] as const;

/**
 * The student's own avatar/cover object path this value names, or null.
 * `supabaseUrl` defaults to NEXT_PUBLIC_SUPABASE_URL (inside B0's parser).
 */
export function ownProfilePhotoPath(
  ref: unknown,
  ownerId: string,
  supabaseUrl?: string | null,
): string | null {
  if (typeof ref !== "string") return null;
  const key = ownProfileImageKey(ref, ownerId, supabaseUrl ?? undefined);
  if (!key || (key.slot !== "avatar" && key.slot !== "banner")) return null;
  return key.path;
}

function ownPaths(
  row: ProfilePhotoColumns | null | undefined,
  ownerId: string,
  supabaseUrl?: string | null,
): string[] {
  if (!row) return [];
  const out: string[] = [];
  for (const column of COLUMNS) {
    const path = ownProfilePhotoPath(row[column], ownerId, supabaseUrl);
    if (path && !out.includes(path)) out.push(path);
  }
  return out;
}

/**
 * Files this save points a column at that the row did not name before (so
 * nobody has seen them exist yet). The caller confirms each still exists: a
 * stale client re-sending a photo that was already replaced and deleted
 * would otherwise set a broken image. `before` null (couldn't read) means
 * every incoming file is new.
 */
export function newProfilePhotoPaths(
  before: ProfilePhotoColumns | null | undefined,
  incoming: ProfilePhotoColumns,
  ownerId: string,
  supabaseUrl?: string | null,
): string[] {
  const known = ownPaths(before, ownerId, supabaseUrl);
  return ownPaths(incoming, ownerId, supabaseUrl).filter((p) => !known.includes(p));
}

/**
 * The student's own photo/cover files the row named before the save and
 * names in neither column after it. `after` missing (the re-read failed)
 * retires nothing: without the saved row there is no proof a file is free.
 */
export function staleProfilePhotoPaths(
  before: ProfilePhotoColumns | null | undefined,
  after: ProfilePhotoColumns | null | undefined,
  ownerId: string,
  supabaseUrl?: string | null,
): string[] {
  if (!before || !after) return [];
  const stillNamed = COLUMNS.map((c) => after[c]).filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  return ownPaths(before, ownerId, supabaseUrl).filter(
    (path) => !stillNamed.some((value) => value.includes(path)),
  );
}
