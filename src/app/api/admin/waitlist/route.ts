import { NextResponse } from "next/server";

import { ADMIN_READ_LIMIT, adminFail, requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { redactAddresses } from "@/lib/email/send-log-core";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { toAdminWaitlistRow } from "@/lib/waitlist/admin-view";
import { listWaitlist, purgeExpiredWaitlistIfDue, readEmailViewers, readWaitlistBudget } from "@/lib/waitlist/store";
import type { AdminWaitlistList } from "@/lib/waitlist/types";

/**
 * GET /api/admin/waitlist
 *
 * The founders' waitlist: newest first, at most 2000 rows (`truncated` says
 * when there were more). The page filters and counts in the browser.
 *
 * NO ADDRESS LEAVES THIS ROUTE. Each row carries `maskedEmail`
 * (`f*****@iu.edu`) and no hash; a full address is one person at a time,
 * through `/[id]/reveal`, for the ids in `app_settings.waitlist_email_viewers`
 * only (`canReveal`), and every reveal is logged.
 *
 * `budget` is the access-code emails sent in the trailing 24 hours against
 * `WAITLIST_EMAIL_DAILY_CAP`; `confirmBudget` is the form's confirm emails
 * against `WAITLIST_CONFIRM_DAILY_CAP`, a separate allowance.
 *
 * Opening the tab runs the retention purge first, at most once an hour per
 * server (store.ts `purgeExpiredWaitlistIfDue`: every entry goes 38 days
 * after it joined, inside the promised 40), so the list rarely shows an
 * entry past its time. Each row carries `deletesAt`, its own date. A failed
 * purge is logged and the list still loads; the daily cron is the backstop.
 *
 * RESPONSES
 *   200 AdminWaitlistList · 401 · 403 · 429 · 500 request_failed
 */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const rl = await rateLimit(`admin-waitlist:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Slow down a moment.");

  try {
    const service = createSupabaseServiceClient();
    await purgeExpiredWaitlistIfDue(service);
    const [list, viewers, budget, confirmBudget] = await Promise.all([
      listWaitlist(service),
      readEmailViewers(service),
      readWaitlistBudget(service, "waitlist_invite"),
      readWaitlistBudget(service, "waitlist_confirm"),
    ]);
    const now = new Date();
    const rows = list.rows.map((r) =>
      toAdminWaitlistRow(r, r.redeemed_user_id ? (list.handles.get(r.redeemed_user_id) ?? null) : null, now),
    );
    const body: AdminWaitlistList = {
      ok: true,
      rows,
      truncated: list.truncated,
      canReveal: viewers.includes(gate.userId),
      budget,
      confirmBudget,
    };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error("[admin/waitlist]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return adminFail(500, "request_failed", "Request failed");
  }
}
