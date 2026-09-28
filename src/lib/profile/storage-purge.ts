import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { QUARANTINE_BUCKET_ID } from "@/lib/moderation/media-quarantine";
import { isUuid } from "@/lib/pgrest";
import { purgeableMessageMediaKeys } from "@/lib/posts/media-ownership";
import { RESUME_BUCKET } from "@/lib/profile/resume-doc-url";
import {
  CLIP_KEY_PREFIX,
  deleteR2Keys,
  deleteR2Prefix,
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
 * four user-owned prefixes plus the user's message media and THROWS on
 * any storage error so the caller can refuse to delete the account until
 * the files are actually gone. It is idempotent — re-running after a
 * partial failure is safe.
 *
 * Layout owned by a user (everything else in these buckets is shared):
 *   Supabase `profiles`: <uid>/avatar-*, <uid>/banner-*, <uid>/posts/*,
 *                        <uid>/posters/*, <uid>/logos/*
 *   Supabase `resumes`:  <uid>/resume-*, <uid>/redacted/*
 *   Supabase `quarantine` (private): <uid>/posts/*, <uid>/posters/* — the
 *                        photos and poster frames of the user's posts a
 *                        moderator removed, moved out of `profiles` at the
 *                        SAME path (src/lib/moderation/media-quarantine.ts).
 *                        They are still the user's uploads, and nothing in
 *                        "What we keep" on /legal/delete-account lists them,
 *                        so they go with the account (S67 security wave).
 *   R2 (R2_BUCKET_NAME): clips/<uid>/*
 *   R2 message media:    messages/<channelId>/<uuid>.<ext> — keyed by the
 *                        CHANNEL, not the user, so there is no user prefix
 *                        to list. The purge instead reads every
 *                        `messages.media_url` where `user_id = uid` (service
 *                        role, BEFORE the auth user is deleted — the rows
 *                        cascade away with the user) and deletes those
 *                        exact keys via `deleteR2Keys` (F4 in the A4 review),
 *                        only when each sits in its own message's chat
 *                        folder and no other member's message names it
 *                        (S67 security wave).
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
  /** Removed-post files erased from the private `quarantine` bucket. */
  quarantine: number;
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

/** How many keys go into one `media_url IN (...)` lookup. */
const SHARED_KEY_CHUNK = 100;

/**
 * Every R2 chat file the user's own messages may take with them. Reads
 * with the service role (RLS would only show channels the caller is still a
 * member of, and there is no session during deletion). Paginates by `id`
 * so the result is complete regardless of how many messages the user sent.
 *
 * S67 security wave (report risk #13): `messages.media_url` can be written
 * straight through PostgREST, so a student could plant a message naming
 * another member's photo and then delete their account to erase it. A key
 * is purged only when (a) it sits in the folder of the chat its own message
 * was sent in (`messages/<that channel_id>/<file>`) and (b) no other
 * member's message points at the same file. Anything else is skipped with
 * a warning rather than blocking the deletion. The pure rule is
 * `purgeableMessageMediaKeys` in src/lib/posts/media-ownership.ts.
 */
async function listUserMessageMediaKeys(uid: string): Promise<string[]> {
  const db = createSupabaseServiceClient();
  const rows: Array<{ channel_id: string | null; media_url: string | null }> = [];
  let afterId: string | null = null;
  for (;;) {
    let query = db
      .from("messages")
      .select("id, channel_id, media_url")
      .eq("user_id", uid)
      .not("media_url", "is", null)
      .order("id", { ascending: true })
      .limit(MESSAGES_PAGE);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) {
      throw new Error(`messages media lookup: ${error.message}`);
    }
    const page = (data ?? []) as Array<{
      id: string;
      channel_id: string | null;
      media_url: string | null;
    }>;
    rows.push(...page);
    if (page.length < MESSAGES_PAGE) break;
    afterId = page[page.length - 1].id;
  }

  // Candidates first (own-chat keys), then ask which of them another
  // member's message also names. A failed read throws: guessing "not
  // shared" could erase someone else's photo.
  const candidates = purgeableMessageMediaKeys(rows).keys;
  const shared = new Set<string>();
  for (let i = 0; i < candidates.length; i += SHARED_KEY_CHUNK) {
    const chunk = candidates.slice(i, i + SHARED_KEY_CHUNK);
    const { data, error } = await db
      .from("messages")
      .select("media_url")
      .in("media_url", chunk)
      .neq("user_id", uid);
    if (error) {
      throw new Error(`messages shared-media lookup: ${error.message}`);
    }
    for (const r of (data ?? []) as Array<{ media_url: string | null }>) {
      if (r.media_url) shared.add(r.media_url);
    }
  }

  const { keys, skipped, shared: sharedCount } = purgeableMessageMediaKeys(rows, shared);
  if (skipped > 0) {
    console.warn(
      `[purgeUserUploads] skipped ${skipped} messages.media_url value(s) that are not messages/<own channel>/<file> keys`,
    );
  }
  if (sharedCount > 0) {
    console.warn(
      `[purgeUserUploads] kept ${sharedCount} chat file reference(s) another member's message also points at`,
    );
  }
  return keys;
}

/**
 * Remove everything a user uploaded: `profiles/<uid>/**`, `resumes/<uid>/**`,
 * `quarantine/<uid>/**`, R2 `clips/<uid>/*` and every R2
 * `messages/<channelId>/<file>` object referenced by the user's own
 * messages. Throws on the first storage error;
 * nothing is rolled back (the purge is idempotent, so retrying finishes the
 * job). MUST run before `auth.admin.deleteUser` — the `messages` rows
 * cascade away with the user, taking the only record of those keys.
 */
export async function purgeUserUploads(uid: string): Promise<PurgeResult> {
  if (!isUuid(uid)) {
    throw new Error("purgeUserUploads: uid must be a UUID");
  }
  const profiles = await purgeStorageFolder(PROFILES_BUCKET, uid);
  // After `profiles` on purpose: a moderator removal that moves a photo out of
  // `profiles` while this runs lands it in quarantine before we sweep there.
  // A missing bucket lists as empty (checked on the local stack), so this is 0
  // until migration 20260927130000 creates `quarantine`, never an error.
  const quarantine = await purgeStorageFolder(QUARANTINE_BUCKET_ID, uid);
  const resumes = await purgeStorageFolder(RESUME_BUCKET, uid);
  const clips = await deleteR2Prefix(`${CLIP_KEY_PREFIX}${uid}/`);
  const messageMedia = await deleteR2Keys(await listUserMessageMediaKeys(uid));
  return { profiles, resumes, quarantine, clips, messageMedia };
}
