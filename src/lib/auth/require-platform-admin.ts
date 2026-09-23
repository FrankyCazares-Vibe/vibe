import "server-only";
import { notFound, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

/**
 * Gate for operator-only route handlers (health probes, admin tooling).
 *
 * Session comes from the cookie/RLS client; the `is_platform_admin` flag is
 * read with the service client filtered to that user id, so it works even
 * when `authenticated` cannot select private `users` columns.
 *
 * 401 when signed out, 403 when signed in but not a platform admin.
 */
export async function requirePlatformAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; response: Response }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized", code: "unauthorized" },
        { status: 401 },
      ),
    };
  }

  if (!isSupabaseServiceConfigured()) {
    // Without the service role we cannot prove admin status; fail closed.
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Forbidden", code: "platform_admin_only" },
        { status: 403 },
      ),
    };
  }

  const admin = createSupabaseServiceClient();
  const { data: row, error } = await admin
    .from("users")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[require-platform-admin] lookup failed", error.message);
  }

  if (!row?.is_platform_admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Forbidden", code: "platform_admin_only" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, userId: user.id };
}

/**
 * The same gate for a SERVER PAGE, where a JSON body is no use.
 *
 * Signed out → the login page with `next` so the admin lands back here.
 * Anyone else → `notFound()`, the `/the-map` pattern: the URL does not even
 * admit the page exists.
 *
 * NOTE FOR WAVE 2 (batch F). `/admin/page.tsx` still runs its own inline check
 * and `redirect("/campus")` for a non-admin — two behaviours for the same
 * question. This function is the one the moderation screens are built on, and
 * F converts `/admin` to it, so we end up with one answer instead of two.
 *
 * Returns the admin's user id. It never returns for anyone else.
 */
export async function requirePlatformAdminPage(path: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(path)}`);

  // Without the service role we cannot prove admin status; fail closed, and
  // fail closed the same way a non-admin does so the page stays invisible.
  if (!isSupabaseServiceConfigured()) notFound();

  const { data: row } = await createSupabaseServiceClient()
    .from("users")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!row?.is_platform_admin) notFound();

  return user.id;
}

/** The error shape every admin route speaks: `{ ok: false, error, code }`. */
export function adminFail(status: number, code: string, error: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * Limits for the admin API, per admin, applied AFTER validation.
 *
 * Writes follow the plan's 60 per 10 minutes. Reads get their own, looser
 * budget: the queue is four tabs that page and refresh, and one admin working
 * through a morning of reports would spend the write budget on GETs alone.
 *
 * The two existing club routes keep their own `admin-org-hide` key and its
 * 30 per 10 minutes — an established number, not worth re-rolling here.
 */
export const ADMIN_WRITE_LIMIT = { limit: 60, windowSec: 600 } as const;
export const ADMIN_READ_LIMIT = { limit: 240, windowSec: 600 } as const;

/**
 * ONE key for every moderation write, not one per route. 60 actions in ten
 * minutes is a person working a queue; a key per route would quietly multiply
 * that by the number of routes and stop being a limit at all.
 */
export function adminWriteKey(adminId: string): string {
  return `admin-write:${adminId}`;
}

/** Every kind of thing a moderator can do, as stored in `moderation_actions.action`. */
export type ModerationAction =
  | "report_dismiss"
  | "report_action"
  | "post_remove"
  | "post_restore"
  | "comment_remove"
  | "comment_restore"
  | "message_remove"
  | "message_restore"
  | "org_hide"
  | "org_unhide"
  | "org_verify"
  | "org_unverify"
  | "user_suspend"
  | "user_ban"
  | "user_lift";

export type ModerationLogEntry = {
  actorId: string;
  action: ModerationAction;
  /** 'post' | 'comment' | 'message' | 'user' | 'org' | 'report' | … */
  targetType: string;
  /** Always the row's UUID — never a handle. Handles move; ids don't. */
  targetId: string;
  reportId?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown> | null;
};

/**
 * Append one row to the moderation log.
 *
 * WRITTEN AFTER THE EFFECT, AND NEVER ALLOWED TO UNDO IT. The same shape as
 * the invite sweep in the club-hide route: by the time this runs the post is
 * already removed or the student is already suspended, so a failed INSERT
 * costs us a line in the log, not the action. It is logged loudly and the
 * route answers `logged: false` so the screen can say so out loud rather than
 * pretending the trail is complete.
 *
 * `moderation_actions` has no client grants and no policies; only the service
 * role reaches it, and a trigger refuses UPDATE and DELETE.
 */
export async function logModerationAction(
  service: SupabaseClient,
  entry: ModerationLogEntry,
): Promise<boolean> {
  try {
    const { error } = await service.from("moderation_actions").insert({
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      report_id: entry.reportId ?? null,
      // `reason` is NOT NULL DEFAULT '' in the migration: an action with no
      // sentence attached stores an empty one rather than a null.
      reason: entry.reason ?? "",
      meta: entry.meta ?? {},
    });
    if (error) {
      console.error("[moderation-log]", entry.action, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[moderation-log] unexpected", entry.action, err);
    return false;
  }
}
