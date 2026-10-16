import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { cronAuthorization } from "@/lib/cron/auth";
import { redactAddresses } from "@/lib/email/send-log-core";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { purgeExpiredWaitlist } from "@/lib/waitlist/store";

// Never cached; reads the request's Authorization header every time.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "no-store" };
/** The limiter's purge gives up after this, so it can't hold the answer to maxDuration. */
const LIMIT_PURGE_TIMEOUT_MS = 10_000;

/**
 * GET /api/cron/waitlist-purge: the daily backstop of the waitlist's
 * retention rule (the founders' rule of Oct 3: an entry is kept up to 40
 * days after it joined the list, whatever its state; unconfirmed ones up to
 * 30 days after their last confirm email). The purge deletes at 38 and 28
 * days (20261003170000): Vercel Cron calls this once a day (vercel.json
 * "crons"), at any minute of the scheduled hour and with no retry, so two
 * runs can be about 25 hours apart. The form's background step and the admin Waitlist
 * tab run the same purge at most once an hour, but only when someone uses
 * them, so on a quiet week this is what keeps the rule.
 *
 * ONLY VERCEL CRON. The request must carry `Authorization: Bearer
 * <CRON_SECRET>`, which Vercel adds when the project has a CRON_SECRET
 * environment variable (src/lib/cron/auth.ts; unset or short = every call
 * refused). Production only: Vercel runs crons on the production deployment.
 *
 * The purge itself is `purgeExpiredWaitlist` (store.ts →
 * public.waitlist_purge_expired). The answer carries only a count, never an
 * address.
 *
 * THEN THE LIMITER'S OLD COUNTS, whatever the waitlist purge did:
 * public.rate_limits_purge (20261015120000) deletes every limiter count whose
 * window started over a day ago, so the Privacy Policy's "within three days"
 * holds. /api/cron/school-checkin runs the same purge at 14:47, since a cron
 * is never retried. `rate_limits_deleted` is how many went, or null when the
 * purge failed or isn't applied yet; that is logged, and never fails the
 * waitlist purge.
 *
 * RESPONSES
 *   200 {ok:true, deleted, rate_limits_deleted} · 401 not Vercel Cron
 *   503 no service key · 500 {ok:false, error:"purge_failed", rate_limits_deleted}
 */
export async function GET(req: Request) {
  const auth = cronAuthorization(req.headers.get("authorization"), process.env.CRON_SECRET);
  if (auth !== "ok") {
    if (auth === "unconfigured") {
      console.error("[cron/waitlist-purge] CRON_SECRET is missing or shorter than 16 characters: the purge did not run");
    }
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  if (!isSupabaseServiceConfigured()) {
    console.error("[cron/waitlist-purge] no Supabase service key: the purge did not run");
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: NO_STORE });
  }

  let service: SupabaseClient | null = null;
  let deleted: number | null = null;
  try {
    service = createSupabaseServiceClient();
    deleted = await purgeExpiredWaitlist(service);
  } catch (err) {
    console.error("[cron/waitlist-purge]", redactAddresses(err instanceof Error ? err.message : String(err)));
  }
  // After the job, whether it worked or not; never this job's failure.
  const rate_limits_deleted = service ? await purgeLimitCounts(service) : null;
  if (deleted === null) {
    return NextResponse.json({ ok: false, error: "purge_failed", rate_limits_deleted }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, deleted, rate_limits_deleted }, { headers: NO_STORE });
}

/**
 * public.rate_limits_purge(): how many old limiter counts went, or null when
 * it failed (the error is logged; it holds no key, the function answers a
 * count). Never throws. The twin of the one in /api/cron/school-checkin.
 */
async function purgeLimitCounts(service: SupabaseClient): Promise<number | null> {
  try {
    const { data, error } = await service
      .rpc("rate_limits_purge")
      .abortSignal(AbortSignal.timeout(LIMIT_PURGE_TIMEOUT_MS));
    if (error) {
      console.error("[cron/waitlist-purge] limiter purge:", error.code || "no code", error.message.slice(0, 120));
      return null;
    }
    return typeof data === "number" ? data : null;
  } catch (err) {
    console.error("[cron/waitlist-purge] limiter purge:", err instanceof Error ? err.message.slice(0, 120) : "failed");
    return null;
  }
}
