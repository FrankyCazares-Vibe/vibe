import { NextResponse } from "next/server";

import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  logModerationAction,
  type ModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
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
 * IDEMPOTENT. Restoring something that is not removed is a success with
 * `changed: false`, so a double tap on a slow connection is not an error.
 *
 * ORDER: gate → validate → rate limit → service-role write → one log row.
 *
 * RESPONSES
 *   200 {ok, changed, logged}
 *   400 invalid_body · 401 · 403 · 404 not_found · 429 · 500 request_failed
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
  const { data: row, error: readErr } = await service
    .from(table)
    .select("id, user_id, removed_at, removed_reason")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("[admin/content/restore read]", type, readErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }
  if (!row) return adminFail(404, "not_found", "Not found");

  const current = row as {
    user_id: string | null;
    removed_at: string | null;
    removed_reason: string | null;
  };
  if (!current.removed_at) {
    return NextResponse.json({ ok: true, changed: false, logged: true });
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

  return NextResponse.json({ ok: true, changed, logged });
}
