import { NextResponse } from "next/server";

import { cronAuthorization } from "@/lib/cron/auth";
import { redactAddresses } from "@/lib/email/send-log-core";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";
import { purgeExpiredWaitlist } from "@/lib/waitlist/store";

// Never cached; reads the request's Authorization header every time.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "no-store" };

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
 * RESPONSES
 *   200 {ok:true, deleted} · 401 not Vercel Cron · 503 no service key · 500 purge_failed
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

  try {
    const deleted = await purgeExpiredWaitlist(createSupabaseServiceClient());
    return NextResponse.json({ ok: true, deleted }, { headers: NO_STORE });
  } catch (err) {
    console.error("[cron/waitlist-purge]", redactAddresses(err instanceof Error ? err.message : String(err)));
    return NextResponse.json({ ok: false, error: "purge_failed" }, { status: 500, headers: NO_STORE });
  }
}
