import { NextResponse } from "next/server";

import { ADMIN_READ_LIMIT, adminFail, requirePlatformAdmin } from "@/lib/auth/require-platform-admin";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  type AdminUsage,
  type TallyState,
  toTallyRaw,
  toTallyView,
  toUsageRaw,
  toUsageView,
  USAGE_DAYS,
} from "@/lib/usage/view";

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * "The function isn't there (yet)": PGRST202 PostgREST's schema cache has no
 * such function; 42883 Postgres has none. The code ships before
 * 20261014120000 (the summary) and 20261014150000 (the day totals) are
 * applied, and the tab then says that counter is not switched on. Not
 * 42501: the functions refuse only anon and authenticated, so a refusal
 * here (the service role) is a real failure.
 */
const MISSING_FN_CODES = new Set(["42883", "PGRST202"]);

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  if (error.code && MISSING_FN_CODES.has(error.code)) return true;
  return (error.message ?? "").toLowerCase().includes("could not find the function");
}

/**
 * The day totals, as their own state. Never throws: whatever goes wrong
 * here, the summary beside it still shows.
 */
async function readTally(service: ReturnType<typeof createSupabaseServiceClient>): Promise<TallyState> {
  try {
    const { data, error } = await service.rpc("admin_usage_tally", { p_days: USAGE_DAYS });
    if (error) {
      if (isMissingFunction(error)) return { state: "off" };
      console.error("[admin/usage] admin_usage_tally", error.code ?? "unknown", error.message);
      return { state: "failed" };
    }
    const raw = toTallyRaw(data);
    if (!raw) {
      console.error("[admin/usage] admin_usage_tally answered a shape the tab can't read");
      return { state: "failed" };
    }
    return { state: "on", view: toTallyView(raw) };
  } catch (err) {
    console.error("[admin/usage] admin_usage_tally", err instanceof Error ? err.message : String(err));
    return { state: "failed" };
  }
}

/**
 * GET /api/admin/usage
 *
 * The founders' Usage tab: how Vibe is used, in totals. Sign-ups, school
 * checks, the waitlist and the codes per day (the door); who came back, per
 * day, per week and per sign-up week (coming back); posts, comments, likes,
 * follows, events and messages per day and all time (what gets used); the
 * visible clubs (clubs); and accounts per school and campus (where). Today
 * and the 29 days before it, UTC days, Monday weeks
 * (src/lib/usage/view.ts).
 *
 * THESE ARE TOTALS, NOT PEOPLE. `public.admin_usage_summary` answers one
 * jsonb of counts: no id, name, handle or email of a person, no message, no
 * Otto answer, no page someone came from. The founders, the store-review
 * accounts, hidden test clubs and test waves are left out of every count.
 * The Privacy Policy (section 1) says founders see totals of how Vibe is
 * used, never who.
 *
 * The function is called with the SERVICE ROLE: it reads `auth.users` for
 * confirmed and school-checked accounts, and it refuses anon and
 * authenticated inside (42501), so a student holding the public key gets
 * nothing from /rest/v1/rpc. The gate is the same as every /api/admin route.
 *
 * SMALL GROUPS read "<5" (1 to 4; nought stays nought) and club chat reads
 * as a band (0, 1–9, 10+), applied HERE so the browser never receives a raw
 * small cell. That is cosmetic, not anonymising: view.ts says why.
 *
 * `ready: false` (with no view) while the function is missing: the code
 * ships before its migration, and "nothing counted yet" must not look like
 * "the counter is working and nobody came". An answer that isn't the shape
 * is a 500, never a tab of noughts.
 *
 * THE DAY TOTALS (`tally`) come from a second function,
 * `public.admin_usage_tally` (20261014150000), asked at the same time and
 * the same way (service role, counts only, floored here). They have their
 * own state so one never hides the other: `off` while that function is
 * missing, `failed` (logged) when it errs or answers a shape the tab can't
 * read, `on` otherwise. A tally failure is never a 500; a summary failure
 * still is.
 *
 * RESPONSES
 *   200 AdminUsage · 401 · 403 · 429 · 500 request_failed
 */
export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const rl = await rateLimit(`admin-usage:${gate.userId}`, ADMIN_READ_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Slow down a moment.");

  try {
    const service = createSupabaseServiceClient();
    const [{ data, error }, tally] = await Promise.all([
      service.rpc("admin_usage_summary", { p_days: USAGE_DAYS }),
      readTally(service),
    ]);
    if (error) {
      if (isMissingFunction(error)) {
        const body: AdminUsage = { ok: true, ready: false, view: null, truncated: false, tally };
        return NextResponse.json(body, { headers: NO_STORE });
      }
      throw new Error(`${error.code ?? "unknown"}: ${error.message}`);
    }
    const raw = toUsageRaw(data);
    if (!raw) {
      console.error("[admin/usage] admin_usage_summary answered a shape the tab can't read");
      return adminFail(500, "request_failed", "Request failed");
    }
    const body: AdminUsage = { ok: true, ready: true, view: toUsageView(raw), truncated: false, tally };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (err) {
    console.error("[admin/usage]", err instanceof Error ? err.message : String(err));
    return adminFail(500, "request_failed", "Request failed");
  }
}
