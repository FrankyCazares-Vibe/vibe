import { NextResponse } from "next/server";

import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import {
  ADMIN_WRITE_LIMIT,
  adminFail,
  adminWriteKey,
  logModerationAction,
  requirePlatformAdmin,
} from "@/lib/auth/require-platform-admin";
import { redactAddresses } from "@/lib/email/send-log-core";
import { isUuid } from "@/lib/pgrest";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { parseSendCodeRequest, remainingBudget } from "@/lib/waitlist/admin-view";
import { readWaitlistBudget, sendAccessCode } from "@/lib/waitlist/store";

export const maxDuration = 30;

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/waitlist/[id]/send-code
 * Body: { batch? } (optional; no body is fine)
 *
 * "Send code" and "Send a new code" on one person. Single mode: any row,
 * confirmed or not, and any old code dies (its claim with it), so the page
 * asks first when the person is invited or joined. A row whose code already
 * made a CONFIRMED account is refused (409 joined); one whose account was
 * never confirmed (a mistyped sign-up address) gets a fresh cycle. A failed
 * send revokes the new code and gives the person back the one they had.
 *
 * Logs `waitlist_invite` with `meta {batch, single: true}`.
 *
 * RESPONSES
 *   200 {ok, logged} · 400 invalid_id · invalid_body · invalid_batch · 401 ·
 *   403 · 404 not_found · 409 email_budget {remaining} · 409 joined ·
 *   409 entry_expired (past its line) · 409 entry_expiring (less than a day
 *   left before its deletion, too late for a code) · 429 ·
 *   502 send_failed · 500 request_failed
 */
export async function POST(req: Request, { params }: Params) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  if (!isUuid(id)) return adminFail(400, "invalid_id", "Invalid id");

  let raw: unknown = undefined;
  const text = await req.text().catch(() => "");
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      return adminFail(400, "invalid_body", "Invalid request");
    }
  }
  const parsed = parseSendCodeRequest(raw);
  if (!parsed.ok) return adminFail(400, parsed.code, parsed.error);

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  let remaining: number;
  try {
    const budget = await readWaitlistBudget(service, "waitlist_invite");
    remaining = remainingBudget(budget.used, budget.cap);
  } catch (err) {
    console.error("[admin/waitlist/send-code budget]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return adminFail(500, "request_failed", "Request failed");
  }
  if (remaining < 1) {
    return NextResponse.json(
      { ok: false, code: "email_budget", error: "No access-code emails left for today.", remaining },
      { status: 409 },
    );
  }

  const site = getSiteOriginForRequest(req);
  const r = await sendAccessCode(service, {
    id: id.toLowerCase(),
    actorId: gate.userId,
    batch: parsed.batch,
    single: true,
    site,
  });
  if (r.outcome === "skipped") {
    if (r.reason === "not_found") return adminFail(404, "not_found", "Not found");
    if (r.reason === "joined") {
      return adminFail(409, "joined", "Their code already made an account that is confirmed, so no new code went out.");
    }
    if (r.reason === "entry_expired") {
      return adminFail(
        409,
        "entry_expired",
        "Their entry is past its date and is being deleted, so no code went out. They can join the list again now, as a fresh entry, or you can add them again.",
      );
    }
    if (r.reason === "entry_expiring") {
      return adminFail(
        409,
        "entry_expiring",
        "Their entry is deleted in less than a day, too late for a code, so none went out. Once it's deleted they can join the list again, or you can add them again.",
      );
    }
    return adminFail(409, r.reason, "The code wasn't issued.");
  }
  if (r.outcome === "failed") {
    return r.reason === "send_failed"
      ? adminFail(502, "send_failed", "The email didn't send, so no new code was issued. Their old code still works. Try again.")
      : adminFail(500, "request_failed", "Request failed");
  }

  const logged = await logModerationAction(service, {
    actorId: gate.userId,
    action: "waitlist_invite",
    targetType: "waitlist",
    targetId: id.toLowerCase(),
    meta: { batch: parsed.batch, single: true },
  });
  return NextResponse.json({ ok: true, logged });
}
