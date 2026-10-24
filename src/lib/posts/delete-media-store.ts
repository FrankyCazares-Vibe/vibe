import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { PROFILES_BUCKET_ID } from "@/lib/moderation/media-quarantine";
import { quarantineProfilesObjects } from "@/lib/moderation/media-quarantine-store";
import {
  orgKeysNamedIn,
  planPostMediaDelete,
  type PostMediaRow,
} from "@/lib/posts/delete-media";
import { deleteR2FolderExcept, getR2S3Client, isR2Configured } from "@/lib/r2";
import { getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Removing a deleted post's files (S67 security wave 2, B2; report #9). WHICH
 * files is decided in ./delete-media.ts; this file reads what it needs with
 * the service role and does the removal.
 *
 * Runs only AFTER the post row is gone (the route deletes with `.select("id")`
 * and calls this only when exactly one row came back), so a refused or silent
 * 0-row delete never touches storage.
 *
 * AN OPEN REPORT KEEPS THE FILES (waveB-build.md product call 3). When a
 * report about this post is still open, its `profiles` photo / poster frame is
 * MOVED to the private `quarantine` bucket instead of deleted, and its R2
 * video stays where it is (private; nothing signs a deleted post's key). If
 * the report can't be read, the post is treated as reported: this fails
 * toward keeping evidence, never toward erasing it.
 *
 * Fails CLOSED toward keeping files: any read error means nothing is removed
 * (logged with `[post-delete purge]`, which is also what explains a leftover
 * file to the orphan counter, scripts/sql/profiles-orphans-count.sql).
 * NEVER throws: the post is already deleted, so a storage hiccup must not turn
 * the answer into an error.
 *
 * The CDN can still serve a copy of a public photo for a few days after it is
 * removed (the cache fix is deferred by Franky).
 */

export type DeletedPostRow = PostMediaRow & {
  id: string;
  user_id: string;
  org_id: string | null;
  media_url: string | null;
  media_thumbnail_url: string | null;
};

export type PostMediaPurge = {
  /** `profiles` objects deleted. */
  profiles: number;
  /** `profiles` objects moved to quarantine (an open report). */
  quarantined: number;
  /** R2 keys deleted. */
  r2: number;
  /** Files kept because another row or column still names them, or a report is open. */
  held: number;
  /** Set when the purge was skipped entirely (a read failed). */
  skipped?: "read_failed" | "error";
};

const MEDIA_COLS = "id,user_id,org_id,media_url,media_thumbnail_url";
const LOG = "[post-delete purge]";

/** Rows (other than `post`) that may still name the same files. */
async function loadOthers(
  service: SupabaseClient,
  post: DeletedPostRow,
): Promise<PostMediaRow[] | null> {
  const mine = await service
    .from("posts")
    .select(MEDIA_COLS)
    .eq("user_id", post.user_id)
    .neq("id", post.id)
    .or("media_url.not.is.null,media_thumbnail_url.not.is.null");
  if (mine.error) {
    console.error(LOG, "author posts read", mine.error.message);
    return null;
  }
  const rows = (mine.data ?? []) as PostMediaRow[];
  if (post.org_id) {
    const club = await service
      .from("posts")
      .select(MEDIA_COLS)
      .eq("org_id", post.org_id)
      .neq("id", post.id)
      .or("media_url.not.is.null,media_thumbnail_url.not.is.null");
    if (club.error) {
      console.error(LOG, "club posts read", club.error.message);
      return null;
    }
    rows.push(...((club.data ?? []) as PostMediaRow[]));
  }
  return rows;
}

/** Column values that keep their file: the author's avatar/cover, the club's logo/banner. */
async function loadKeepRefs(service: SupabaseClient, post: DeletedPostRow): Promise<unknown[] | null> {
  const user = await service
    .from("users")
    .select("avatar_url,banner_url")
    .eq("id", post.user_id)
    .maybeSingle();
  if (user.error) {
    console.error(LOG, "author read", user.error.message);
    return null;
  }
  const refs: unknown[] = [user.data?.avatar_url, user.data?.banner_url];
  if (post.org_id) {
    const org = await service
      .from("orgs")
      .select("logo_url,banner_url")
      .eq("id", post.org_id)
      .maybeSingle();
    if (org.error) {
      console.error(LOG, "club read", org.error.message);
      return null;
    }
    refs.push(org.data?.logo_url, org.data?.banner_url);
  }
  return refs;
}

/** Is a report about this post still open? A failed read answers true (keep). */
export async function hasOpenPostReport(service: SupabaseClient, postId: string): Promise<boolean> {
  const { count, error } = await service
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("target_type", "post")
    .eq("target_id", postId)
    .eq("status", "open");
  if (error) {
    console.error(LOG, "open-report read", error.message);
    return true;
  }
  return (count ?? 0) > 0;
}

async function deleteR2KeysBestEffort(keys: string[]): Promise<number> {
  if (keys.length === 0 || !isR2Configured()) return 0;
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!bucket) return 0;
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = getR2S3Client();
  let n = 0;
  for (const key of keys) {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    n += 1;
  }
  return n;
}

/**
 * Remove (or, under an open report, quarantine) the files of a post whose row
 * was just deleted. See the file header for the rules. `extraOthers` are rows
 * the database can no longer tie to this post's club (the removed posts a club
 * deletion detached): whatever they name is held too.
 */
export async function purgeDeletedPostMedia(
  service: SupabaseClient,
  post: DeletedPostRow,
  extraOthers: ReadonlyArray<PostMediaRow> = [],
): Promise<PostMediaPurge> {
  const out: PostMediaPurge = { profiles: 0, quarantined: 0, r2: 0, held: 0 };
  try {
    if (!post.media_url && !post.media_thumbnail_url) return out;
    const loaded = await loadOthers(service, post);
    const others = loaded ? [...loaded, ...extraOthers] : null;
    const keepRefs = others ? await loadKeepRefs(service, post) : null;
    if (!others || !keepRefs) return { ...out, skipped: "read_failed" };

    const plan = planPostMediaDelete(post, others, keepRefs, getSupabaseUrl());
    out.held = plan.held;
    if (plan.profilesPaths.length === 0 && plan.r2Keys.length === 0) return out;

    if (await hasOpenPostReport(service, post.id)) {
      if (plan.profilesPaths.length > 0) {
        const moved = await quarantineProfilesObjects(service, plan.profilesPaths);
        out.quarantined = moved.moved;
        if (moved.failed.length > 0) console.error(LOG, "quarantine failed", post.id, moved.failed.length);
      }
      out.held += plan.r2Keys.length;
      console.info(LOG, "open report: kept files", post.id);
      return out;
    }

    if (plan.profilesPaths.length > 0) {
      const { error } = await service.storage.from(PROFILES_BUCKET_ID).remove(plan.profilesPaths);
      if (error) console.error(LOG, "profiles remove", post.id, error.message);
      else out.profiles = plan.profilesPaths.length;
    }
    out.r2 = await deleteR2KeysBestEffort(plan.r2Keys);
    if (out.held > 0) console.info(LOG, "held files another row names", post.id, out.held);
    return out;
  } catch (e) {
    console.error(LOG, "unexpected", post.id, e);
    return { ...out, skipped: "error" };
  }
}

const ID_CHUNK = 100;

/** `orgs/<orgId>/…` keys that must survive the club's folder sweep, or null on a read error. */
async function clubKeysToKeep(
  service: SupabaseClient,
  orgId: string,
  postIds: string[],
  detachedRemoved: ReadonlyArray<PostMediaRow>,
): Promise<Set<string> | null> {
  const named: unknown[] = detachedRemoved.flatMap((p) => [p.media_url, p.media_thumbnail_url]);
  // A logo or banner a moderator took down stays in place as the record (B1
  // keeps R2 evidence where it is and writes the key into the action's meta).
  const actions = await service
    .from("moderation_actions")
    .select("meta")
    .eq("target_type", "org")
    .eq("target_id", orgId);
  if (actions.error) {
    console.error(LOG, "club actions read", actions.error.message);
    return null;
  }
  named.push(...(actions.data ?? []).map((a) => a.meta));
  // So does an event cover a moderator took down (Oct 23, 2026). That row's
  // target is the EVENT, gone with the club by now (events cascade), so it is
  // found by the club's id the routes write into its meta (imageLogScope).
  const eventActions = await service
    .from("moderation_actions")
    .select("meta")
    .eq("target_type", "event")
    .contains("meta", { org_id: orgId });
  if (eventActions.error) {
    console.error(LOG, "club event actions read", eventActions.error.message);
    return null;
  }
  named.push(...(eventActions.data ?? []).map((a) => a.meta));
  // An open report about one of the club's events keeps that event's cover
  // (Oct 23, 2026): the snapshot holds its `cover_key`, and its `org_id` says
  // whose event it was (the event ids can't be read any more).
  const eventReports = await service
    .from("reports")
    .select("target_snapshot")
    .eq("status", "open")
    .eq("target_type", "event")
    .eq("target_snapshot->>org_id", orgId);
  if (eventReports.error) {
    console.error(LOG, "club event reports read", eventReports.error.message);
    return null;
  }
  named.push(...(eventReports.data ?? []).map((r) => r.target_snapshot));
  // Anything an open report about the club or one of its posts snapshotted.
  const ids = [orgId, ...postIds];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const reports = await service
      .from("reports")
      .select("target_snapshot")
      .eq("status", "open")
      .in("target_id", ids.slice(i, i + ID_CHUNK));
    if (reports.error) {
      console.error(LOG, "club reports read", reports.error.message);
      return null;
    }
    named.push(...(reports.data ?? []).map((r) => r.target_snapshot));
  }
  return orgKeysNamedIn(named, orgId);
}

/**
 * After a club is deleted (its posts went with it: posts_org_id_fkey CASCADE,
 * 20260929110000): remove each deleted post's own files, then sweep the
 * club's R2 folder `orgs/<orgId>/` (logo, banner, post media, event covers,
 * stale uploads), keeping the files of the club's posts that survived it
 * (`detachedRemoved`: the moderator-removed posts the database detached,
 * trigger orgs_keep_removed_posts), any logo, banner or event cover a
 * moderator took down, and anything an open report names (an event's cover
 * included, Oct 23, 2026).
 * Best-effort and NEVER throws; a read error skips the sweep (keeps files).
 */
export async function purgeDeletedClubMedia(
  service: SupabaseClient,
  orgId: string,
  deletedPosts: ReadonlyArray<DeletedPostRow>,
  detachedRemoved: ReadonlyArray<PostMediaRow>,
): Promise<{ posts: number; swept: number; kept: number; skipped?: "read_failed" | "error" }> {
  const out = { posts: 0, swept: 0, kept: 0 };
  try {
    for (const post of deletedPosts) {
      if (!post.media_url && !post.media_thumbnail_url) continue;
      await purgeDeletedPostMedia(service, post, detachedRemoved);
      out.posts += 1;
    }
    if (!isR2Configured()) return out;
    const keep = await clubKeysToKeep(
      service,
      orgId,
      deletedPosts.map((p) => p.id),
      detachedRemoved,
    );
    if (!keep) return { ...out, skipped: "read_failed" };
    const swept = await deleteR2FolderExcept(`orgs/${orgId}/`, keep);
    return { ...out, swept: swept.deleted, kept: swept.kept };
  } catch (e) {
    console.error(LOG, "club sweep", orgId, e);
    return { ...out, skipped: "error" };
  }
}
