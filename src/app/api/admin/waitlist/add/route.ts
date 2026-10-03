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
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { parseAddRequest, remainingBudget } from "@/lib/waitlist/admin-view";
import { insertFounderRow, readWaitlistBudget, sendAccessCode } from "@/lib/waitlist/store";
import type { AdminWaitlistAddResponse } from "@/lib/waitlist/types";

export const maxDuration = 30;

/**
 * POST /api/admin/waitlist/add
 * Body: { email, name, isOfficer, officerClub?, clubs?, issueCode, batch? }
 *
 * "Add someone": a club officer who wrote in skips the line. Any real
 * address (officers write from Gmail). The row is already confirmed
 * (`origin = 'founder'`, no consents: the person asked a founder in person
 * or by email). With `issueCode` the code goes out at once (single mode);
 * if the day's email budget is spent, or the send fails, the row stays and
 * `emailed` is false with a `reason`, and "Send code" works later.
 *
 * Logs `waitlist_add`, plus `waitlist_invite` when a code went. `meta`
 * never holds the address.
 *
 * ALREADY ON THE LIST is not an error: 200 `{ok, id, emailed:false,
 * existing:true}` with that person's row id and nothing changed or sent, so
 * the page can take the founder to the row ("Send a new code" is one tap
 * from there). Someone who lost their code and wrote in is found this way.
 * An entry past its line counts as gone: it is dropped first and the person
 * is added as a fresh row (store.ts `insertFounderRow`), never handed back.
 *
 * RESPONSES
 *   200 {ok, id, emailed, existing?, reason?, logged} · 400 invalid_* · 401 ·
 *   403 · 429 · 500 request_failed
 */
export async function POST(req: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return adminFail(400, "invalid_body", "Invalid request");
  }
  const parsed = parseAddRequest(raw);
  if (!parsed.ok) return adminFail(400, parsed.code, parsed.error);
  const value = parsed.value;

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  let inserted: Awaited<ReturnType<typeof insertFounderRow>>;
  try {
    inserted = await insertFounderRow(service, value, gate.userId);
  } catch (err) {
    console.error("[admin/waitlist/add]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return adminFail(500, "request_failed", "Request failed");
  }
  if (!inserted.ok) {
    if (!inserted.existingId) return adminFail(500, "request_failed", "Request failed");
    const body: AdminWaitlistAddResponse & { logged: boolean } = {
      ok: true,
      id: inserted.existingId,
      emailed: false,
      existing: true,
      logged: true,
    };
    return NextResponse.json(body);
  }
  const id = inserted.id;
  let logged = await logModerationAction(service, {
    actorId: gate.userId,
    action: "waitlist_add",
    targetType: "waitlist",
    targetId: id,
    meta: { officer: value.isOfficer, issue_code: value.issueCode, batch: value.batch },
  });

  let emailed = false;
  let reason: string | undefined;
  if (value.issueCode) {
    let left = 0;
    try {
      const budget = await readWaitlistBudget(service, "waitlist_invite");
      left = remainingBudget(budget.used, budget.cap);
    } catch {
      left = 0;
    }
    if (left < 1) {
      reason = "email_budget";
    } else {
      const site = getSiteOriginForRequest(req);
      const r = await sendAccessCode(service, { id, actorId: gate.userId, batch: value.batch, single: true, site });
      if (r.outcome === "sent") {
        emailed = true;
        const ok = await logModerationAction(service, {
          actorId: gate.userId,
          action: "waitlist_invite",
          targetType: "waitlist",
          targetId: id,
          meta: { batch: value.batch, single: true },
        });
        logged = logged && ok;
      } else {
        reason = r.reason;
      }
    }
  }

  const body: AdminWaitlistAddResponse & { reason?: string; logged: boolean } = {
    ok: true,
    id,
    emailed,
    ...(reason ? { reason } : {}),
    logged,
  };
  return NextResponse.json(body);
}
