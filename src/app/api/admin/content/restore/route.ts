import { NextResponse } from "next/server";

import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  logModerationAction,
  type ModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { planPostQuarantine } from "@/lib/moderation/media-quarantine";
import { releaseQuarantinedObjects } from "@/lib/moderation/media-quarantine-store";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = { type?: unknown; id?: unknown; reason?: unknown };

/** The same three tables `remove` writes to. */
const TABLES: Record<string, string> = {
  post: "posts",
  comment: "post_comments",
  message: "messages",
};

const MAX_REASON = 500;

/**
 * POST /api/admin/content/restore
 * Body: { type: 'post'|'comment'|'message', id, reason? }
 *
 * Put removed content back. Clears `removed_at`, `removed_by` and
 * `removed_reason`, so the post, comment or message is ordinary again and the
 * author's "Removed by Vibe moderators" notice goes away.
 *
 * CHANGE BOTH TOGETHER: `restoreContent` in src/lib/moderation/actions.ts does
 * the same steps for callers that aren't a route, down to the
 * `moderation_actions.meta` keys.
 *
 * IT DOES NOT REOPEN THE REPORTS. Restoring says the content was fine; the
 * reports about it were looked at and answered, and dragging them back into
 * the queue would ask the same question twice. A moderator who wants them open
 * again says so on the reports themselves.
 *
 * A POST'S PHOTO COMES BACK TOO (security wave S67, repair round 1). Removal
 * moves the post's photo and a video's poster frame into the private
 * `quarantine` bucket at the same path (see /remove). Clearing `removed_at`
 * alone would put the post back with a broken image, so restoring moves those
 * files back into the public `profiles` bucket, planned from the row's own
 * `media_url` / `media_thumbnail_url` exactly as the removal planned them.
 * One exception: a file another of the author's REMOVED posts also names stays
 * in quarantine (`held`), or restoring one post would put the other post's
 * picture back online while that post is still down.
 *
 * IDEMPOTENT. Restoring something that is not removed is a success with
 * `changed: false`, so a double tap on a slow connection is not an error. For
 * a post it still moves the files back, which is how a restore whose move
 * failed is finished: press Restore again and only the move repeats.
 *
 * ORDER: gate → validate → rate limit → service-role write → one log row →
 * a post's files out of quarantine. If that last step fails, the answer is a
 * 500 that says the photo is still offline.
 *
 * RESPONSES
 *   200 {ok, changed, logged, released, held}
 *   400 invalid_body · 401 · 403 · 404 not_found · 429 · 500 request_failed
 *   500 media_still_quarantined (restored, but its photo is still offline; retry)
 */
export async function POST(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return adminFail(400, "invalid_body", "Invalid JSON");
  }

  const type = typeof body.type === "string" ? body.type : "";
  const table = TABLES[type];
  if (!table) return adminFail(400, "invalid_body", "type must be post, comment or message");
  if (!isUuid(body.id)) return adminFail(400, "invalid_body", "id must be a uuid");
  const id = body.id;
  // Optional here, unlike `remove`: nobody is shown this one, it is only for
  // the log, so a restore does not need a sentence before it can happen.
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, MAX_REASON) : "";

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();

  // Service role: a removed row is invisible to every policy in the app,
  // including a platform admin's own session.
  // A post also brings its media columns: they are the record of which files
  // the removal moved, and so of which files to move back.
  const { data: row, error: readErr } = await service
    .from(table)
    .select(
      type === "post"
        ? "id, user_id, removed_at, removed_reason, media_url, media_thumbnail_url"
        : "id, user_id, removed_at, removed_reason",
    )
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[admin/content/restore read]", type, readErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }
  if (!row) return adminFail(404, "not_found", "Not found");

  const current = row as unknown as {
    user_id: string | null;
    removed_at: string | null;
    removed_reason: string | null;
    media_url?: string | null;
    media_thumbnail_url?: string | null;
  };
  if (!current.removed_at) {
    // Already live. For a post, finish any move back an earlier restore left
    // undone (the retry path); nothing else happens twice.
    if (type !== "post") return NextResponse.json({ ok: true, changed: false, logged: true });
    const release = await releasePostMedia(service, id, current);
    if (!release.ok) return stillQuarantined();
    return NextResponse.json({
      ok: true,
      changed: false,
      logged: true,
      released: release.released,
      held: release.held,
    });
  }

  const { data: updated, error: updErr } = await service
    .from(table)
    .update({ removed_at: null, removed_by: null, removed_reason: null })
    .eq("id", id)
    .not("removed_at", "is", null)
    .select("id");
  if (updErr) {
    console.error("[admin/content/restore update]", type, updErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }
  const changed = (updated ?? []).length > 0;

  let logged = true;
  if (changed) {
    logged = await logModerationAction(service, {
      actorId: gate.userId,
      action: `${type}_restore` as ModerationAction,
      targetType: type,
      targetId: id,
      reason: reason || null,
      meta: {
        author_id: current.user_id,
        // What the student was told while it was down, kept in the trail
        // because the row no longer carries it.
        previous_reason: current.removed_reason,
        removed_at: current.removed_at,
      },
    });
  }

  // Last, after the row is live and the log is written: the post's files come
  // out of quarantine. A failure here leaves the post live with a broken
  // image; pressing Restore again repeats just this move (see above).
  if (type !== "post") return NextResponse.json({ ok: true, changed, logged });
  const release = await releasePostMedia(service, id, current);
  if (!release.ok) return stillQuarantined();
  return NextResponse.json({
    ok: true,
    changed,
    logged,
    released: release.released,
    held: release.held,
  });
}

/** The 500 a moderator sees when the post is back but its photo is not. */
function stillQuarantined() {
  return adminFail(
    500,
    "media_still_quarantined",
    "The post is back, but its photo is still offline. Press Restore again to bring it back.",
  );
}

/**
 * Move a restored post's photo and poster frame from the private `quarantine`
 * bucket back into the public `profiles` bucket (releaseQuarantinedObjects).
 * The paths are planned from the post row with planPostQuarantine, the same
 * plan the removal used, so only files in the author's own `posts/` and
 * `posters/` folders are ever touched.
 *
 * A path another REMOVED post by the same author also names is `held`: it
 * stays in quarantine, because that post is still down. Only the author's own
 * posts can plan a path in the author's folder, so looking at the author's
 * removed posts is enough.
 *
 * `ok: false` means a file may still be offline: the other posts couldn't be
 * read, or a move failed. Idempotent: a file already back (or never moved)
 * counts as done, not a failure.
 */
async function releasePostMedia(
  service: ReturnType<typeof createSupabaseServiceClient>,
  id: string,
  post: { user_id: string | null; media_url?: string | null; media_thumbnail_url?: string | null },
): Promise<{ ok: boolean; released: number; held: number }> {
  try {
    const supabaseUrl = getSupabaseUrl();
    const plan = planPostQuarantine(post, supabaseUrl);
    if (plan.paths.length === 0 || !post.user_id) return { ok: true, released: 0, held: 0 };

    const { data: others, error } = await service
      .from("posts")
      .select("user_id, media_url, media_thumbnail_url")
      .eq("user_id", post.user_id)
      .not("removed_at", "is", null)
      .neq("id", id);
    if (error) {
      console.error("[admin/content/restore release read]", error.message);
      return { ok: false, released: 0, held: 0 };
    }
    const stillDown = new Set(
      (others ?? []).flatMap((other) => planPostQuarantine(other, supabaseUrl).paths),
    );
    const paths = plan.paths.filter((path) => !stillDown.has(path));
    const held = plan.paths.length - paths.length;
    if (held > 0) {
      console.warn("[admin/content/restore media held]", id, held);
    }
    if (paths.length === 0) return { ok: true, released: 0, held };

    const result = await releaseQuarantinedObjects(service, paths);
    return { ok: result.failed.length === 0, released: result.moved, held };
  } catch (err) {
    console.error("[admin/content/restore release] unexpected", err);
    return { ok: false, released: 0, held: 0 };
  }
}
