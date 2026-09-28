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
import { quarantineProfilesObjects } from "@/lib/moderation/media-quarantine-store";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Body = { type?: unknown; id?: unknown; reason?: unknown; reportIds?: unknown };

/** The three things a moderator can take down, and the table each one lives in. */
const TABLES: Record<string, string> = {
  post: "posts",
  comment: "post_comments",
  message: "messages",
};

const MAX_REASON = 500;
const MAX_IDS = 100;

/**
 * POST /api/admin/content/remove
 * Body: { type: 'post'|'comment'|'message', id, reason, reportIds?: string[] }
 *
 * Take content down. SOFT REMOVAL, always: the row stays, with `removed_at`,
 * `removed_by` and `removed_reason` set. It disappears for everyone else, its
 * author sees "Removed by Vibe moderators" and the reason, and the evidence a
 * report points at is still there if the student appeals (Franky's decision 2).
 *
 * A POST'S PHOTO GOES OFFLINE TOO (security report 2026-09-27). Hiding the
 * row left the picture at a permanent public URL in the `profiles` bucket, so
 * anyone who had copied the link could still open it signed out. The photo
 * and a video's poster frame are now MOVED into the private `quarantine`
 * bucket (migration 20260927130000) at the same path; `media_url` stays on
 * the row as the record of where it came from, so granting an appeal is one
 * move back (releaseQuarantinedObjects). Only files in the author's own
 * `posts/` and `posters/` folders move — a post can name another student's
 * file, and that student's photo must not go down with it
 * (src/lib/moderation/media-quarantine.ts). An R2 video (`clips/…`) stays in
 * R2: it was never public, and the media route refuses a removed post.
 * The move runs LAST, after the log row; if it fails, the answer is a 500
 * that says the photo is still online, and pressing Remove again retries just
 * the move (the row is already removed, so nothing else happens twice).
 *
 * THE REASON IS SHOWN TO THE STUDENT. Write it the way you would say it to
 * them — plain, specific, not a code.
 *
 * CHANGE BOTH TOGETHER: `removeContent` in src/lib/moderation/actions.ts does
 * the same steps for callers that aren't a route, and the two agree field for
 * field, `moderation_actions.meta` keys included. That table refuses UPDATE and
 * DELETE, so a log row the other half writes differently can never be fixed.
 *
 * REMOVING ALSO CLOSES THE REPORTS IT CAME FROM, as `actioned`: the named
 * `reportIds`, or every open report on this piece of content when the caller
 * names none. Leaving them open would put the same decision back in the queue
 * tomorrow. Either way only reports about THIS content are touched.
 *
 * IDEMPOTENT. Removing something already removed is a success with
 * `changed: false` — the first removal's reason and timestamp are the true
 * ones and are left alone — and it still closes any reports left open.
 *
 * ORDER: gate → validate → rate limit → service-role write → reports → one
 * log row → a post's files into quarantine. The log is written after the
 * effect and never undoes it.
 *
 * RESPONSES
 *   200 {ok, changed, resolvedReports, logged, quarantined, left_online, left_online_note}
 *       `left_online` counts media references this removal could not take down
 *       (another student's folder, or another site); `left_online_note` is a
 *       sentence for the moderator when it is above 0, otherwise null.
 *   400 invalid_body · 401 · 403 · 404 not_found · 429 · 500 request_failed
 *   500 media_still_online (removed, but a file is still public; retry)
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
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, MAX_REASON) : "";
  if (!reason) return adminFail(400, "invalid_body", "reason is required");
  const rawIds = Array.isArray(body.reportIds) ? body.reportIds : [];
  const reportIds = [...new Set(rawIds.filter(isUuid))];
  if (reportIds.length !== rawIds.length || reportIds.length > MAX_IDS) {
    return adminFail(400, "invalid_body", "reportIds must be up to 100 report ids");
  }

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();

  // Service role, and no `removed_at IS NULL` filter here: the queue has to be
  // able to act on a row RLS would already be hiding.
  const { data: row, error: readErr } = await service
    .from(table)
    .select("id, user_id, removed_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[admin/content/remove read]", type, readErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }
  if (!row) return adminFail(404, "not_found", "Not found");

  const alreadyRemoved = !!(row as { removed_at: string | null }).removed_at;
  let changed = false;
  if (!alreadyRemoved) {
    const { data: updated, error: updErr } = await service
      .from(table)
      .update({
        removed_at: new Date().toISOString(),
        removed_by: gate.userId,
        removed_reason: reason,
      })
      .eq("id", id)
      .is("removed_at", null)
      .select("id");
    if (updErr) {
      console.error("[admin/content/remove update]", type, updErr.message);
      return adminFail(500, "request_failed", "Request failed");
    }
    changed = (updated ?? []).length > 0;
  }

  const closedIds = await closeReports(service, {
    adminId: gate.userId,
    type,
    id,
    reportIds,
    note: reason,
  });
  const resolvedReports = closedIds.length;

  let logged = true;
  if (changed || resolvedReports > 0) {
    logged = await logModerationAction(service, {
      actorId: gate.userId,
      action: `${type}_remove` as ModerationAction,
      targetType: type,
      targetId: id,
      // The reports this removal ACTUALLY closed, not the ones the screen
      // named. `closeReports` refuses ids belonging to other content on
      // purpose; linking the log row to one of those anyway would name a
      // report the action never touched, and a trigger refuses UPDATE and
      // DELETE on this table, so a wrong row here can never be corrected.
      reportId: closedIds[0] ?? null,
      reason,
      meta: {
        changed,
        already_removed: alreadyRemoved,
        resolved_reports: resolvedReports,
        resolved_report_ids: closedIds,
        author_id: (row as { user_id: string | null }).user_id ?? null,
      },
    });
  }

  // Last, and on every call — an earlier try that failed here is finished by
  // pressing Remove again, even though the row is already removed.
  const quarantine =
    type === "post" ? await quarantinePostMedia(service, id) : { ok: true, moved: 0, leftOnline: 0 };
  if (!quarantine.ok) {
    return adminFail(
      500,
      "media_still_online",
      "The post is hidden, but its photo may still be online. Press Remove again to take it down.",
    );
  }
  const quarantined = quarantine.moved;
  // Files this removal could NOT take down (another student's folder, or
  // another site). Still a 200 — the post is down and nothing is worth
  // retrying — but the moderator working a takedown has to hear about it, so
  // the count comes back with a sentence the desk can print as it stands.
  const left_online = quarantine.leftOnline;
  const left_online_note = left_online > 0 ? LEFT_ONLINE_NOTE : null;

  return NextResponse.json({
    ok: true,
    changed,
    resolvedReports,
    logged,
    quarantined,
    left_online,
    left_online_note,
  });
}

/** What the moderator reads when a removed post's image is still public. */
const LEFT_ONLINE_NOTE =
  "This post's image is stored outside the author's post folder and is still online.";

/**
 * Move a removed post's photo and poster frame out of the public `profiles`
 * bucket into the private `quarantine` bucket (see the header). `ok: false`
 * means something may still be public: the media columns couldn't be read,
 * or a move failed. Idempotent: a file already moved is not a failure.
 */
async function quarantinePostMedia(
  service: ReturnType<typeof createSupabaseServiceClient>,
  id: string,
): Promise<{ ok: boolean; moved: number; leftOnline: number }> {
  let leftOnline = 0;
  try {
    const { data: post, error } = await service
      .from("posts")
      .select("user_id, media_url, media_thumbnail_url")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.error("[admin/content/remove quarantine read]", error.message);
      return { ok: false, moved: 0, leftOnline };
    }
    if (!post) return { ok: true, moved: 0, leftOnline };
    const plan = planPostQuarantine(post, getSupabaseUrl());
    // Not ours to move (another student's file, or another site): counted
    // for the answer and logged, so a moderator chasing a takedown knows to
    // look further. An R2 key is not counted — it was never public, and the
    // media route refuses a removed post.
    leftOnline = plan.left.foreign + plan.left.external;
    if (leftOnline > 0) {
      console.warn("[admin/content/remove media left online]", id, plan.left);
    }
    if (plan.paths.length === 0) return { ok: true, moved: 0, leftOnline };
    const result = await quarantineProfilesObjects(service, plan.paths);
    return { ok: result.failed.length === 0, moved: result.moved, leftOnline };
  } catch (err) {
    console.error("[admin/content/remove quarantine] unexpected", err);
    return { ok: false, moved: 0, leftOnline };
  }
}

/**
 * Close the reports this removal answers, as `actioned`. Named ids when the
 * screen sends them, otherwise every report still open on this content.
 *
 * Best-effort: the content is already down by the time this runs, so a failure
 * here costs a stale queue row, not the removal. It is logged and reported as
 * nothing closed.
 *
 * Returns the ids it really changed, which is what the log row is built from —
 * the ids the screen asked for and the ids that were closed are not the same
 * list, and only one of them is true.
 */
async function closeReports(
  service: ReturnType<typeof createSupabaseServiceClient>,
  args: { adminId: string; type: string; id: string; reportIds: string[]; note: string },
): Promise<string[]> {
  try {
    // Always scoped to THIS content, even when ids are named. A screen that
    // sent the wrong ids would otherwise close reports about something else
    // on the strength of an unrelated removal.
    let query = service
      .from("reports")
      .update({
        status: "actioned",
        resolved_by: args.adminId,
        resolved_at: new Date().toISOString(),
        resolution_note: args.note,
      })
      .eq("status", "open")
      .eq("target_type", args.type)
      .eq("target_id", args.id);
    if (args.reportIds.length > 0) query = query.in("id", args.reportIds);
    const { data, error } = await query.select("id");
    if (error) {
      console.error("[admin/content/remove close reports]", error.message);
      return [];
    }
    return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  } catch (err) {
    console.error("[admin/content/remove close reports] unexpected", err);
    return [];
  }
}
