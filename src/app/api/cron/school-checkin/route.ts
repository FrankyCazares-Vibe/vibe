import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { runSchoolCheckin } from "@/lib/auth/school-checkin-job";
import { isSchoolVerifySecretConfigured } from "@/lib/auth/school-email-token";
import { cronAuthorization } from "@/lib/cron/auth";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

// Never cached; reads the request's Authorization header every time.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "no-store" };
/** The limiter's purge gives up after this, so it can't hold the answer to maxDuration. */
const LIMIT_PURGE_TIMEOUT_MS = 10_000;

/**
 * GET /api/cron/school-checkin: the daily pass of the yearly school
 * check-in (src/lib/auth/school-checkin-job.ts): opens check-ins that are
 * due, starts the 90-day countdown on the ones nobody answered in 14 days,
 * and deletes the accounts whose countdown ended.
 *
 * ONLY VERCEL CRON (`Authorization: Bearer <CRON_SECRET>`, src/lib/cron/auth.ts).
 *
 * DELETES NOTHING unless the Vercel variable SCHOOL_CHECKIN_DELETE_ENABLED
 * is exactly "true". Without it an ended countdown is only counted
 * (`would_delete`), so the first deletions are a person's decision, made
 * after reading that number.
 *
 * THEN THE LIMITER'S OLD COUNTS, whatever the pass did: public.rate_limits_purge
 * (20261015120000) deletes every limiter count whose window started over a
 * day ago, so the Privacy Policy's "within three days" holds. The same purge
 * as /api/cron/waitlist-purge at 08:17, run twice a day since a cron is never
 * retried. `rate_limits_deleted` is how many went, or null when the purge
 * failed or isn't applied yet; that is logged, and never fails the pass.
 *
 * The answer carries counts only, each with rate_limits_deleted.
 *   200 {ok, checkins_sent, countdowns_started, deleted, would_delete, skipped_billing, failed}
 *   200 {ok, skipped:"not_applied"} before 20261008140000 · 401 · 503 (nothing runs)
 *   500 {ok:false, error:"run_failed"}
 */
export async function GET(req: Request) {
  const auth = cronAuthorization(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth !== "ok") {
    if (auth === "unconfigured") console.error("[cron/school-checkin] CRON_SECRET is missing or too short: the pass did not run");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!isSupabaseServiceConfigured() || !isSchoolVerifySecretConfigured()) {
    console.error("[cron/school-checkin] no service key or code secret: the pass did not run");
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
  const service = createSupabaseServiceClient();
  const pass = await checkinPass(service);
  // After the pass, whether it worked or not; never the pass's failure.
  const rate_limits_deleted = await purgeLimitCounts(service);
  return NextResponse.json({ ...pass.body, rate_limits_deleted }, { status: pass.status, headers: NO_STORE });
}

/** The check-in pass itself: the answer's body (counts only) and status. Never throws. */
async function checkinPass(service: SupabaseClient): Promise<{ status: number; body: Record<string, unknown> }> {
  // Before the columns exist there is nothing to do.
  const probe = await service.from("users").select("school_grace_ends_at").limit(1);
  if (probe.error && isMissingColumnError(probe.error, ["school_grace_ends_at"])) {
    return { status: 200, body: { ok: true, skipped: "not_applied" } };
  }
  try {
    const result = await runSchoolCheckin(service, new Date(), {
      deleteEnabled: process.env.SCHOOL_CHECKIN_DELETE_ENABLED === "true",
    });
    return { status: 200, body: { ok: true, ...result } };
  } catch (err) {
    console.error("[cron/school-checkin]", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return { status: 500, body: { ok: false, error: "run_failed" } };
  }
}

/**
 * public.rate_limits_purge(): how many old limiter counts went, or null when
 * it failed (the error is logged; it holds no key, the function answers a
 * count). Never throws. The twin of the one in /api/cron/waitlist-purge.
 */
async function purgeLimitCounts(service: SupabaseClient): Promise<number | null> {
  try {
    const { data, error } = await service
      .rpc("rate_limits_purge")
      .abortSignal(AbortSignal.timeout(LIMIT_PURGE_TIMEOUT_MS));
    if (error) {
      console.error("[cron/school-checkin] limiter purge:", error.code || "no code", error.message.slice(0, 120));
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (err) {
    console.error("[cron/school-checkin] limiter purge:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return null;
  }
}
