import { NextResponse } from "next/server";

import {
  ADMIN_READ_LIMIT,
  adminFail,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import {
  decodeFollowCursor,
  encodeFollowCursor,
  followKeysetOrFilter,
} from "@/lib/orgs/following";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const PAGE_MAX = 50;

type ActionRow = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  report_id: string | null;
  reason: string | null;
  meta: unknown;
  created_at: string;
};

/**
 * GET /api/admin/actions?cursor=&limit=
 *
 * The moderation log, newest first: every removal, restore, resolve, hide,
 * verify, suspension, ban and lift, and who did it.
 *
 * WHY IT EXISTS. `is_platform_admin` is set by hand in SQL and gives one
 * person the power to take anyone's posts down. Until this table there was no
 * record at all of who used it. The table is append-only — no client grants,
 * no policies, and a trigger that refuses UPDATE and DELETE — so this route
 * reads it with the service role, which is the only role that can.
 *
 * `meta` is passed through as stored. Nothing that writes it puts an email, a
 * token or a student's reported text in there; the text lives on the report
 * and the private note lives on the restriction row.
 *
 * RESPONSES
 *   200 {ok, actions:[{id,actorId,actorHandle,action,targetType,targetId,
 *        reportId,reason,meta,createdAt}], next_cursor}
 *   400 invalid_cursor · 401 · 403 · 429 · 500 request_failed
 */
export async function GET(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const decoded = decodeFollowCursor(url.searchParams.get("cursor"));
  if (!decoded.ok) return adminFail(400, "invalid_cursor", "Invalid cursor");
  const limit = parseLimit(url.searchParams.get("limit"));

  const rl = await rateLimit(`admin-actions:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Slow down a moment.");

  const service = createSupabaseServiceClient();
  let query = service
    .from("moderation_actions")
    .select("id, actor_id, action, target_type, target_id, report_id, reason, meta, created_at");
  if (decoded.cursor) query = query.or(followKeysetOrFilter("created_at", decoded.cursor));
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) {
    console.error("[admin/actions]", error.message);
    return adminFail(500, "request_failed", "Request failed");
  }

  const all = (data ?? []) as ActionRow[];
  const page = all.slice(0, limit);
  const last = page[page.length - 1];
  const next_cursor =
    all.length > limit && last ? encodeFollowCursor(last.created_at, last.id) : null;

  const actorIds = [...new Set(page.map((a) => a.actor_id).filter((v): v is string => !!v))];
  const handles = new Map<string, string | null>();
  if (actorIds.length > 0) {
    const { data: actors, error: actorErr } = await service
      .from("users")
      .select("id, handle")
      .in("id", actorIds);
    if (actorErr) console.error("[admin/actions actors]", actorErr.message);
    for (const a of (actors ?? []) as Array<{ id: string; handle: string | null }>) {
      handles.set(a.id, a.handle);
    }
  }

  const actions = page.map((a) => ({
    id: a.id,
    actorId: a.actor_id,
    // Null when the moderator's own account is gone — `actor_id` is ON DELETE
    // SET NULL, because the log outlives the people in it.
    actorHandle: a.actor_id ? handles.get(a.actor_id) ?? null : null,
    action: a.action,
    targetType: a.target_type,
    targetId: a.target_id,
    reportId: a.report_id,
    reason: a.reason,
    meta: a.meta ?? {},
    createdAt: a.created_at,
  }));

  return NextResponse.json({ ok: true, actions, next_cursor });
}

function parseLimit(raw: string | null): number {
  const n = raw == null || raw.trim() === "" ? NaN : Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return PAGE_MAX;
  return Math.min(n, PAGE_MAX);
}
