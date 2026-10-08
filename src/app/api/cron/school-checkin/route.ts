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
 * The answer carries counts only.
 *   200 {ok, checkins_sent, countdowns_started, deleted, would_delete, skipped_billing, failed}
 *   200 {ok, skipped:"not_applied"} before 20261008140000 · 401 · 503 · 500
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
  // Before the columns exist there is nothing to do.
  const probe = await service.from("users").select("school_grace_ends_at").limit(1);
  if (probe.error && isMissingColumnError(probe.error, ["school_grace_ends_at"])) {
    return NextResponse.json({ ok: true, skipped: "not_applied" }, { headers: NO_STORE });
  }
  try {
    const result = await runSchoolCheckin(service, new Date(), {
      deleteEnabled: process.env.SCHOOL_CHECKIN_DELETE_ENABLED === "true",
    });
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (err) {
    console.error("[cron/school-checkin]", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return NextResponse.json({ ok: false, error: "run_failed" }, { status: 500, headers: NO_STORE });
  }
}
