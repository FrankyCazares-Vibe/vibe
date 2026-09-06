import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isUuid } from "@/lib/pgrest";
import { RESUME_BUCKET } from "@/lib/profile/resume-doc-url";
import {
  CLIP_KEY_PREFIX,
  deleteR2Keys,
  deleteR2Prefix,
  MESSAGE_MEDIA_KEY_RE,
} from "@/lib/r2";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Account-deletion storage purge (S53 A4, from the S52 risk report).
 *
 * `auth.admin.deleteUser` cascades the Postgres rows but leaves every
 * uploaded object behind, so a "deleted" user's avatar, banner, post
 * images, org logos / posters, resume originals, burned-in redacted
 * derivatives, clips and inline chat media would stay readable forever
 * (the `profiles` bucket is public). `purgeUserUploads(uid)` removes all
 * three user-owned prefixes plus the user's message media and THROWS on
 * any storage error so the caller can refuse to delete the account until
 * the files are actually gone. It is idempotent — re-running after a
 * partial failure is safe.
 *
 * Layout owned by a user (everything else in these buckets is shared):
 *   Supabase `profiles`: <uid>/avatar-*, <uid>/banner-*, <uid>/posts/*,
 *                        <uid>/posters/*, <uid>/logos/*
 *   Supabase `resumes`:  <uid>/resume-*, <uid>/redacted/*
 *   R2 (R2_BUCKET_NAME): clips/<uid>/*
 *   R2 message media:    messages/<channelId>/<uuid>.<ext> — keyed by the
 *                        CHANNEL, not the user, so there is no user prefix
 *                        to list. The purge instead reads every
 *                        `messages.media_url` where `user_id = uid` (service
 *                        role, BEFORE the auth user is deleted — the rows
 *                        cascade away with the user) and deletes those
 *                        exact keys via `deleteR2Keys` (F4 in the A4 review).
 *
 * Supabase `storage.list()` is NON-recursive: subfolders come back as
 * entries with `id === null` and no metadata, so `purgeStorageFolder`
 * recurses into them explicitly.
 */

export const PROFILES_BUCKET = "profiles";

const LIST_PAGE = 1000;
const REMOVE_BATCH = 100;

type StorageBucketApi = ReturnType<SupabaseClient["storage"]["from"]>;

export type PurgeResult = {
  /** Objects removed from the `profiles` bucket. */
  profiles: number;
  /** Objects removed from the private `resumes` bucket (incl. redacted/). */
  resumes: number;
  /** Objects removed under `clips/<uid>/` in R2. */
  clips: number;
  /** Inline chat uploads (`messages/<channelId>/<file>` in R2) removed. */
  messageMedia: number;
};

function normalizeFolder(folder: string): string {
  const f = folder.trim().replace(/^\/+|\/+$/g, "");
  if (!f) {
    throw new Error("purgeStorageFolder: folder must be non-empty");
  }
  return f;
}

/**
 * Every entry directly inside `folder`, across all pages. Collected in full
 * BEFORE anything is removed so offset pagination is not disturbed by the
 * deletions.
 */
async function listFolder(
  storage: StorageBucketApi,
  folder: string,
): Promise<Array<{ name: string; id: string | null }>> {
  const entries: Array<{ name: string; id: string | null }> = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await storage.list(folder, {
      limit: LIST_PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      throw new Error(`storage list ${folder}: ${error.message}`);
    }
    const page = data ?? [];
    for (const entry of page) {
      if (!entry.name) continue;
      entries.push({ name: entry.name, id: entry.id ?? null });
    }
    if (page.length < LIST_PAGE) break;
    offset += page.length;
  }
  return entries;
}

async function purgeFolderRecursive(
  storage: StorageBucketApi,
  folder: string,
): Promise<number> {
  const entries = await listFolder(storage, folder);
  let removed = 0;

  // Folders first (id === null) so nested files go before their parents'
  // siblings are batched — order does not matter for correctness, it just
  // keeps the log readable.
  for (const entry of entries) {
    if (entry.id === null) {
      removed += await purgeFolderRecursive(storage, `${folder}/${entry.name}`);
    }
  }

  const keys = entries
    .filter((entry) => entry.id !== null)
    .map((entry) => `${folder}/${entry.name}`);
  for (let i = 0; i < keys.length; i += REMOVE_BATCH) {
    const batch = keys.slice(i, i + REMOVE_BATCH);
    const { error } = await storage.remove(batch);
    if (error) {
      throw new Error(`storage remove ${folder}: ${error.message}`);
    }
    removed += batch.length;
  }
  return removed;
}

/**
 * Recursively remove every object under `folder` in `bucket` (subfolders
 * included, `.emptyFolderPlaceholder` files included). Returns the number
 * of objects removed. Throws on any list / remove error. Listing a folder
 * that does not exist returns 0 (Supabase returns an empty page, not an
 * error).
 */
export async function purgeStorageFolder(
  bucket: string,
  folder: string,
): Promise<number> {
  const storage = createSupabaseServiceClient().storage.from(bucket);
  return purgeFolderRecursive(storage, normalizeFolder(folder));
}

const MESSAGES_PAGE = 1000;

/**
 * Every R2 key referenced by a `messages.media_url` the user wrote. Reads
 * with the service role (RLS would only show channels the caller is still a
 * member of, and there is no session during deletion). Paginates by `id`
 * so the result is complete regardless of how many messages the user sent.
 *
 * Only keys that match `MESSAGE_MEDIA_KEY_RE` are returned — anything else
 * in the column (a legacy public URL, or a malformed value) is not
 * something we ever signed and is skipped with a warning rather than
 * blocking the deletion.
 */
async function listUserMessageMediaKeys(uid: string): Promise<string[]> {
  const db = createSupabaseServiceClient();
  const keys = new Set<string>();
  let skipped = 0;
  let afterId: string | null = null;
  for (;;) {
    let query = db
      .from("messages")
      .select("id, media_url")
      .eq("user_id", uid)
      .not("media_url", "is", null)
      .order("id", { ascending: true })
      .limit(MESSAGES_PAGE);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) {
      throw new Error(`messages media lookup: ${error.message}`);
    }
    const page = (data ?? []) as Array<{ id: string; media_url: string | null }>;
    for (const row of page) {
      const key = String(row.media_url ?? "").trim();
      if (!key) continue;
      if (MESSAGE_MEDIA_KEY_RE.test(key)) keys.add(key);
      else skipped += 1;
    }
    if (page.length < MESSAGES_PAGE) break;
    afterId = page[page.length - 1].id;
  }
  if (skipped > 0) {
    console.warn(
      `[purgeUserUploads] skipped ${skipped} messages.media_url value(s) that are not messages/<channelId>/<file> keys`,
    );
  }
  return Array.from(keys);
}

/**
 * Remove everything a user uploaded: `profiles/<uid>/**`, `resumes/<uid>/**`,
 * R2 `clips/<uid>/*` and every R2 `messages/<channelId>/<file>` object
 * referenced by the user's own messages. Throws on the first storage error;
 * nothing is rolled back (the purge is idempotent, so retrying finishes the
 * job). MUST run before `auth.admin.deleteUser` — the `messages` rows
 * cascade away with the user, taking the only record of those keys.
 */
export async function purgeUserUploads(uid: string): Promise<PurgeResult> {
  if (!isUuid(uid)) {
    throw new Error("purgeUserUploads: uid must be a UUID");
  }
  const profiles = await purgeStorageFolder(PROFILES_BUCKET, uid);
  const resumes = await purgeStorageFolder(RESUME_BUCKET, uid);
  const clips = await deleteR2Prefix(`${CLIP_KEY_PREFIX}${uid}/`);
  const messageMedia = await deleteR2Keys(await listUserMessageMediaKeys(uid));
  return { profiles, resumes, clips, messageMedia };
}
