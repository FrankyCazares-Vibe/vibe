import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { quarantineProfilesObjects } from "@/lib/moderation/media-quarantine-store";
import { isUuid } from "@/lib/pgrest";
import { evidenceToKeep, type PostMediaRow } from "@/lib/posts/delete-media";
import { purgeableMessageMediaKeys } from "@/lib/posts/media-ownership";
import { RESUME_BUCKET } from "@/lib/profile/resume-doc-url";
import {
  CLIP_KEY_PREFIX,
  deleteR2FolderExcept,
  deleteR2Keys,
} from "@/lib/r2";
import { getSupabaseUrl } from "@/lib/supabase/env";
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
 *   Supabase `quarantine` (private): <uid>/** — files a moderator took down
 *                        (removed posts' photos and poster frames, and, from
 *                        wave B, removed avatars/covers/logos), plus files
 *                        moved there because a report was open. KEPT: this
 *                        purge never touches the quarantine bucket. They are
 *                        the record of what was removed, kept for up to a
 *                        year until the lawyer says how long (S67 security
 *                        wave 2, B2; waveB-build.md product call 3).
 *   R2 (R2_BUCKET_NAME): clips/<uid>/* — except the videos of the user's
 *                        moderator-removed posts and of posts with an open
 *                        or actioned report, which stay (evidence).
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
 * EVIDENCE FIRST (B2). Before the `profiles` sweep, the files that are
 * evidence are MOVED to quarantine (see loadEvidence): the photo / poster of
 * a moderator-removed post whose earlier move didn't finish, the files of
 * posts with an open or actioned report, and the current avatar/cover when a
 * report about the user is open. A move that fails THROWS, so the account
 * is not deleted while evidence could still be erased; the retry finishes
 * it. The response's counts never say what was kept (that could reveal an
 * open report); the server log does.
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
  /**
   * Files erased from the private `quarantine` bucket: always 0 since B2
   * (quarantined evidence survives the account). Kept for the response shape.
   */
  quarantine: number;
  /** Objects removed under `clips/<uid>/` in R2 (evidence videos excluded). */
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

const EVIDENCE_PAGE = 1000;

/**
 * What must survive this account deletion (B2, waveB-build.md call 3): the
 * media rows of the user's moderator-removed posts and of report snapshots
 * about their posts (open or actioned; a dismissed report keeps nothing), and
 * the current avatar/cover when a report about the user is open. Service
 * role; any read error THROWS (the deletion stops rather than risk erasing
 * evidence). Report snapshots carry the post's media columns
 * (me/reports POST_SNAPSHOT_COLUMNS), so a post deleted while a report was
 * open still has its video kept.
 */
async function loadEvidence(
  uid: string,
): Promise<{ postRows: PostMediaRow[]; profileRefs: unknown[] }> {
  const db = createSupabaseServiceClient();
  const postRows: PostMediaRow[] = [];

  let afterId: string | null = null;
  for (;;) {
    let query = db
      .from("posts")
      .select("id, user_id, media_url, media_thumbnail_url")
      .eq("user_id", uid)
      .not("removed_at", "is", null)
      .order("id", { ascending: true })
      .limit(EVIDENCE_PAGE);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw new Error(`removed posts lookup: ${error.message}`);
    const page = (data ?? []) as Array<PostMediaRow & { id: string }>;
    postRows.push(...page);
    if (page.length < EVIDENCE_PAGE) break;
    afterId = page[page.length - 1].id;
  }

  afterId = null;
  for (;;) {
    let query = db
      .from("reports")
      .select("id, target_snapshot")
      .eq("target_type", "post")
      .eq("target_owner_id", uid)
      .in("status", ["open", "actioned"])
      .order("id", { ascending: true })
      .limit(EVIDENCE_PAGE);
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query;
    if (error) throw new Error(`post reports lookup: ${error.message}`);
    const page = (data ?? []) as Array<{ id: string; target_snapshot: unknown }>;
    for (const r of page) {
      const snap = r.target_snapshot as Record<string, unknown> | null;
      if (snap && typeof snap === "object") {
        postRows.push({
          user_id: snap.user_id,
          media_url: snap.media_url,
          media_thumbnail_url: snap.media_thumbnail_url,
        });
      }
    }
    if (page.length < EVIDENCE_PAGE) break;
    afterId = page[page.length - 1].id;
  }

  const { count, error: userReportErr } = await db
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("target_type", "user")
    .eq("target_id", uid)
    .eq("status", "open");
  if (userReportErr) throw new Error(`user reports lookup: ${userReportErr.message}`);
  const profileRefs: unknown[] = [];
  if ((count ?? 0) > 0) {
    const { data, error } = await db
      .from("users")
      .select("avatar_url, banner_url")
      .eq("id", uid)
      .maybeSingle();
    if (error) throw new Error(`reported user images lookup: ${error.message}`);
    profileRefs.push(data?.avatar_url, data?.banner_url);
  }
  return { postRows, profileRefs };
}

/**
 * Remove everything a user uploaded EXCEPT evidence: `profiles/<uid>/**`,
 * `resumes/<uid>/**`, R2 `clips/<uid>/*` and every R2
 * `messages/<channelId>/<file>` object referenced by the user's own
 * messages. `quarantine/<uid>/**` is never touched, and evidence still in
 * `profiles` is moved there first (see the file header). Throws on the first
 * storage error; nothing is rolled back (the purge is idempotent, so retrying
 * finishes the job). MUST run before `auth.admin.deleteUser` — the `messages`
 * and `posts` rows cascade away with the user, taking the only record of
 * those keys.
 */
export async function purgeUserUploads(uid: string): Promise<PurgeResult> {
  if (!isUuid(uid)) {
    throw new Error("purgeUserUploads: uid must be a UUID");
  }
  const { postRows, profileRefs } = await loadEvidence(uid);
  const evidence = evidenceToKeep(postRows, profileRefs, uid, getSupabaseUrl());
  if (evidence.profilesPaths.length > 0) {
    const moved = await quarantineProfilesObjects(
      createSupabaseServiceClient(),
      evidence.profilesPaths,
    );
    if (moved.failed.length > 0) {
      throw new Error(`evidence quarantine: ${moved.failed.length} file(s) still in profiles`);
    }
  }
  const profiles = await purgeStorageFolder(PROFILES_BUCKET, uid);
  const resumes = await purgeStorageFolder(RESUME_BUCKET, uid);
  const clips = await deleteR2FolderExcept(
    `${CLIP_KEY_PREFIX}${uid}/`,
    new Set(evidence.clipKeys),
  );
  const messageMedia = await deleteR2Keys(await listUserMessageMediaKeys(uid));
  if (evidence.profilesPaths.length > 0 || clips.kept > 0) {
    console.info(
      `[purgeUserUploads] kept evidence: ${evidence.profilesPaths.length} photo(s) in quarantine, ${clips.kept} video file(s) in R2`,
    );
  }
  return { profiles, resumes, quarantine: 0, clips: clips.deleted, messageMedia };
}
