import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PROFILES_BUCKET_ID } from "@/lib/moderation/media-quarantine";
import { quarantineProfilesObjects } from "@/lib/moderation/media-quarantine-store";

import type { ProfilePhotoColumns } from "./profile-photo-replace";

/**
 * The storage half of "replacing a profile photo or cover deletes the old
 * file" (S67 security wave B, B3). WHICH files is decided by the pure
 * ./profile-photo-replace.ts; this file reads the row, checks files exist and
 * takes stale ones offline, all with the service role.
 *
 * EVIDENCE FIRST (waveB-build product call 3): while a report about this
 * student is OPEN, an old photo is MOVED to the private `quarantine` bucket
 * instead of deleted, so a moderator can still see what was reported after
 * the student swapped it. A failed report read counts as "open": when in
 * doubt, keep the evidence.
 *
 * Best-effort throughout: a failure here is logged and never fails the save.
 * The worst outcome is an orphaned file, which is what every replace left
 * behind before this batch.
 */

/** The row's two photo columns, or null when the read failed. */
export async function readProfilePhotoColumns(
  service: SupabaseClient,
  userId: string,
): Promise<ProfilePhotoColumns | null> {
  const { data, error } = await service
    .from("users")
    .select("avatar_url,banner_url")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[profile-photo] read columns", error.message);
    return null;
  }
  return data as ProfilePhotoColumns;
}

/**
 * The first of these `profiles` paths that is confirmed MISSING, or null.
 * A check that errors lets the path through: this guards a stale client
 * against setting a broken image, it is not a security gate (the path was
 * already proven to be the student's own file).
 */
export async function firstMissingProfilePhoto(
  service: SupabaseClient,
  paths: string[],
): Promise<string | null> {
  for (const path of paths) {
    try {
      const { data } = await service.storage.from(PROFILES_BUCKET_ID).exists(path);
      if (data === false) return path;
    } catch (e) {
      console.error("[profile-photo] exists check", e instanceof Error ? e.message : e);
    }
  }
  return null;
}

/**
 * Paths some OTHER row still shows: another student's photo column or a
 * club's logo/banner (both accept a URL on our host). Post media can't name
 * a root photo file (post_media_ref_ok pins `posts/` and `posters/`), and
 * group photos are R2 keys only. Null when a read failed (keep everything).
 */
async function namedElsewhere(
  service: SupabaseClient,
  userId: string,
  paths: string[],
): Promise<Set<string> | null> {
  const bucket = service.storage.from(PROFILES_BUCKET_ID);
  const byUrl = new Map(paths.map((p) => [bucket.getPublicUrl(p).data.publicUrl, p]));
  const urls = [...byUrl.keys()];
  const reads = await Promise.all([
    service.from("users").select("avatar_url").neq("id", userId).in("avatar_url", urls).limit(10),
    service.from("users").select("banner_url").neq("id", userId).in("banner_url", urls).limit(10),
    service.from("orgs").select("logo_url").in("logo_url", urls).limit(10),
    service.from("orgs").select("banner_url").in("banner_url", urls).limit(10),
  ]);
  const named = new Set<string>();
  for (const { data, error } of reads) {
    if (error) {
      console.error("[profile-photo] reference check", error.message);
      return null;
    }
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      for (const value of Object.values(row)) {
        const path = typeof value === "string" ? byUrl.get(value) : undefined;
        if (path) named.add(path);
      }
    }
  }
  return named;
}

/**
 * Take the student's replaced/removed photo files offline: quarantine them
 * while a report about the student is open, delete them otherwise. Paths
 * must come from staleProfilePhotoPaths (own avatar/cover files the saved
 * row no longer names). Never throws.
 */
export async function retireProfilePhotos(
  service: SupabaseClient,
  userId: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  try {
    const elsewhere = await namedElsewhere(service, userId, paths);
    if (!elsewhere) return;
    const free = paths.filter((p) => !elsewhere.has(p));
    if (free.length < paths.length) {
      console.log(`[profile-photo] kept ${paths.length - free.length} file(s) another row still shows`);
    }
    if (free.length === 0) return;

    const { count, error } = await service
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", "user")
      .eq("target_id", userId)
      .eq("status", "open");
    if (error || (count ?? 0) > 0) {
      if (error) console.error("[profile-photo] open-report read", error.message);
      const moved = await quarantineProfilesObjects(service, free);
      console.log(
        `[profile-photo] retired ${moved.moved} (quarantined)` +
          (moved.failed.length ? `, ${moved.failed.length} failed` : ""),
      );
      return;
    }

    const { error: rmErr } = await service.storage.from(PROFILES_BUCKET_ID).remove(free);
    if (rmErr) {
      console.error("[profile-photo] remove", rmErr.message);
      return;
    }
    console.log(`[profile-photo] retired ${free.length} (deleted)`);
  } catch (e) {
    console.error("[profile-photo] retire", e instanceof Error ? e.message : e);
  }
}
