import { NextResponse } from "next/server";

import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  logModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { liftRestriction } from "@/lib/moderation/actions";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type Params = { params: Promise<{ id: string }> };
type Body = { note?: unknown };

const MAX_NOTE = 2000;

/** Which HTTP status a failure from batch B's helper deserves. */
const STATUS_BY_CODE: Record<string, number> = {
  not_configured: 503,
  not_found: 404,
};

/**
 * POST /api/admin/users/[id]/lift
 * Body: { note? }
 *
 * End a suspension or a ban early. Batch B's `liftRestriction` does the work:
 * it stamps `lifted_at` on the rows in force, clears the `app_metadata`
 * mirror and takes the GoTrue ban off, so the student can sign in again and
 * the proxy stops sending them to `/account/suspended`.
 *
 * NOTHING IS UNDONE BEYOND THE RESTRICTION. A ban deleted the Stripe customer
 * with no refund (Franky's decision 7); lifting the ban does not bring a
 * subscription back, and the student re-subscribes if they want it. Saying so
 * here so nobody reads `lift` as "put everything back".
 *
 * IDEMPOTENT. Lifting nothing is a success with `lifted: 0` — the screen can
 * fire it twice, and an expired suspension that already stopped biting is not
 * an error either.
 *
 * A PARTIAL LIFT IS NOT A 500: 200 with `incomplete: ['auth_ban']` names the
 * step to retry, because leaving a student half-unbanned silently is the one
 * outcome nobody would notice.
 *
 * RESPONSES
 *   200 {ok, lifted, incomplete, logged}
 *   400 invalid_id · 401 · 403 · 404 not_found · 429 · 503 not_configured ·
 *   500 request_failed
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!isUuid(id)) return adminFail(400, "invalid_id", "Invalid id");

  // A body is optional here; an empty POST is a lift with no note.
  let body: Body = {};
  try {
    body = ((await req.json()) ?? {}) as Body;
  } catch {
    body = {};
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  const { data: targetRow, error: targetErr } = await service
    .from("users")
    .select("id, handle")
    .eq("id", id)
    .maybeSingle();
  if (targetErr) {
    console.error("[admin/users/[id]/lift target]", targetErr.message);
    return adminFail(500, "request_failed", "Request failed");
  }
  if (!targetRow) return adminFail(404, "not_found", "Not found");
  const target = targetRow as { handle: string | null };

  const result = await liftRestriction({ userId: id, actorId: gate.userId, note: note || null });
  if (!result.ok) {
    const status = STATUS_BY_CODE[result.code] ?? 500;
    if (status === 500) console.error("[admin/users/[id]/lift apply]", result.code);
    return adminFail(status, result.code, result.error);
  }

  const incomplete = result.incomplete;
  let logged = true;
  if (result.lifted > 0) {
    // Nothing lifted, nothing to record: an append-only log of "a moderator
    // tapped a button and it did nothing" is noise pretending to be history.
    logged = await logModerationAction(service, {
      actorId: gate.userId,
      action: "user_lift",
      targetType: "user",
      targetId: id,
      reason: null,
      meta: { handle: target.handle, lifted: result.lifted, has_note: !!note, incomplete },
    });
  }

  return NextResponse.json({ ok: true, lifted: result.lifted, incomplete, logged });
}
