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
import { parseInviteRequest, remainingBudget } from "@/lib/waitlist/admin-view";
import { readWaitlistBudget, sendAccessCode } from "@/lib/waitlist/store";
import type { AdminWaitlistInviteResponse, AdminWaitlistInviteResult, WaitlistEmailBudget } from "@/lib/waitlist/types";

/** 25 sends about 600 ms apart, plus their database calls, fit well inside this. */
export const maxDuration = 60;

/** Between two emails, so a batch stays under Resend's per-second limit. */
const SEND_GAP_MS = 600;

/**
 * POST /api/admin/waitlist/invite
 * Body: { ids: string[] (1-25), batch: string }
 *
 * "Send codes" for a batch the founders picked. One by one: a fresh access
 * code (batch mode: the person must be confirmed and have no code yet), a
 * fresh "take me off the list" link, and the email. A failed send revokes
 * that code. One `waitlist_invite` log row per person emailed, `meta {batch}`.
 *
 * THE BUDGET IS CHECKED FIRST: more ids than the day has access-code emails
 * left is a 409 `email_budget` with `remaining`, and nothing is sent. Only
 * `waitlist_invite` sends count here; the public form's confirm emails have
 * their own allowance and can never use this one up.
 *
 * RESPONSES
 *   200 {ok, results:[{id, outcome:"sent"|"skipped"|"failed", reason?}], budget, logged}
 *   400 invalid_body · invalid_ids · too_many · invalid_batch · 401 · 403 ·
 *   409 email_budget · 429 · 500 request_failed
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
  const parsed = parseInviteRequest(raw);
  if (!parsed.ok) return adminFail(400, parsed.code, parsed.error);

  const rl = await rateLimit(adminWriteKey(gate.userId), ADMIN_WRITE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many actions at once. Try again shortly.");

  const service = createSupabaseServiceClient();
  let budget: WaitlistEmailBudget;
  try {
    budget = await readWaitlistBudget(service, "waitlist_invite");
  } catch (err) {
    console.error("[admin/waitlist/invite budget]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return adminFail(500, "request_failed", "Request failed");
  }
  const remaining = remainingBudget(budget.used, budget.cap);
  if (parsed.ids.length > remaining) {
    return NextResponse.json(
      {
        ok: false,
        code: "email_budget",
        error: `Only ${remaining} access-code ${remaining === 1 ? "email" : "emails"} left for today.`,
        remaining,
        budget,
      },
      { status: 409 },
    );
  }

  const site = getSiteOriginForRequest(req);
  const results: AdminWaitlistInviteResult[] = [];
  let logged = true;
  let lastSent = false;
  for (const id of parsed.ids) {
    if (lastSent) await new Promise((resolve) => setTimeout(resolve, SEND_GAP_MS));
    const r = await sendAccessCode(service, { id, actorId: gate.userId, batch: parsed.batch, single: false, site });
    lastSent = r.outcome === "sent";
    if (r.outcome === "sent") {
      results.push({ id, outcome: "sent" });
      const ok = await logModerationAction(service, {
        actorId: gate.userId,
        action: "waitlist_invite",
        targetType: "waitlist",
        targetId: id,
        meta: { batch: parsed.batch },
      });
      logged = logged && ok;
    } else {
      results.push({ id, outcome: r.outcome, reason: r.reason });
    }
  }

  let after = budget;
  try {
    after = await readWaitlistBudget(service, "waitlist_invite");
  } catch {
    // The sends are done; an old count on the screen is the only cost.
  }
  const body: AdminWaitlistInviteResponse & { logged: boolean } = { ok: true, results, budget: after, logged };
  return NextResponse.json(body);
}
