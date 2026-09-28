import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PROFILES_BUCKET_ID, QUARANTINE_BUCKET_ID } from "@/lib/moderation/media-quarantine";

/**
 * Moving a removed post's files between the public `profiles` bucket and the
 * private `quarantine` bucket (migration 20260927130000_quarantine_bucket.sql).
 * WHICH files may move is decided in ./media-quarantine.ts; this file only
 * moves them, with the service role (no policy lets anyone else near the
 * quarantine bucket).
 *
 * Both directions keep the object path, so the post's `media_url` is right
 * again the moment a file is moved back.
 */

export type MoveOutcome = {
  /** Moved by this call. */
  moved: number;
  /** Not in the source bucket: already moved by an earlier try, or never there. */
  alreadyGone: number;
  /** Paths still sitting in the source bucket after this call. */
  failed: string[];
};

type StorageErrorLike = { message?: string; status?: number; statusCode?: string };

function isAlreadyThere(err: StorageErrorLike): boolean {
  return (
    err.statusCode === "409" ||
    err.status === 409 ||
    /already exists|duplicate/i.test(err.message ?? "")
  );
}

/**
 * Is the object still in `bucket`? true / false, or null when storage would
 * not say. Asked after a failed move instead of trusting the error text: a
 * missing DESTINATION bucket also says "not found", and reading that as
 * "already moved" would report a photo as offline while it is still public.
 */
async function stillIn(service: SupabaseClient, bucket: string, path: string): Promise<boolean | null> {
  try {
    const { data } = await service.storage.from(bucket).exists(path);
    return data;
  } catch {
    return null;
  }
}

async function moveAll(
  service: SupabaseClient,
  from: string,
  to: string,
  paths: string[],
  log: string,
): Promise<MoveOutcome> {
  const out: MoveOutcome = { moved: 0, alreadyGone: 0, failed: [] };
  for (const path of paths) {
    const { error } = await service.storage
      .from(from)
      .move(path, path, { destinationBucket: to });
    if (!error) {
      out.moved += 1;
      continue;
    }
    const still = await stillIn(service, from, path);
    if (still === false) {
      // Nothing at this path in the source bucket (an earlier try moved it,
      // or it never existed), so nothing is left to take down.
      out.alreadyGone += 1;
      continue;
    }
    const err = error as StorageErrorLike;
    if (still === true && isAlreadyThere(err)) {
      // A copy already sits at the destination (an earlier try got that far).
      // The copy is safe, so only the source needs to go.
      const { error: rmErr } = await service.storage.from(from).remove([path]);
      if (!rmErr && (await stillIn(service, from, path)) === false) {
        out.moved += 1;
        continue;
      }
      console.error(`${log} remove after duplicate`, from, rmErr?.message ?? "still there");
    } else {
      console.error(`${log} move`, from, "->", to, err.message);
    }
    out.failed.push(path);
  }
  return out;
}

/**
 * Take these `profiles` objects offline by moving them into quarantine.
 * Idempotent: a path already moved counts as `alreadyGone`, not a failure.
 */
export function quarantineProfilesObjects(
  service: SupabaseClient,
  paths: string[],
): Promise<MoveOutcome> {
  return moveAll(service, PROFILES_BUCKET_ID, QUARANTINE_BUCKET_ID, paths, "[media-quarantine]");
}

/**
 * Put quarantined objects back in `profiles` (an appeal the moderators
 * granted). Same paths, so the post's `media_url` works again. Plan the paths
 * with planPostQuarantine on the post row, exactly as the removal did.
 */
export function releaseQuarantinedObjects(
  service: SupabaseClient,
  paths: string[],
): Promise<MoveOutcome> {
  return moveAll(service, QUARANTINE_BUCKET_ID, PROFILES_BUCKET_ID, paths, "[media-quarantine release]");
}
