import "server-only";

import { NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * The one place that answers "does this account have Vibe+ right now".
 *
 * Mirrors src/lib/legal/require-terms.ts: a `*RequiredResponse()` for the
 * 403, and a `require*()` that returns the response to send or `null` when the
 * caller may proceed. Every Vibe+ gate calls this — there is no second copy of
 * the predicate, in SQL or anywhere else.
 *
 * Design: handoffs/2026-09-12-design-paywall-monetization.md §4.
 * Store: supabase/migrations/20260912101000_entitlements.sql.
 *
 * THIS FAILS CLOSED, UNLIKE THE RATE LIMITER — on purpose. src/lib/rate-limit.ts
 * documents that it fails OPEN ("if the RPC errors we log and allow the request
 * rather than taking the product down"). That is right for a limiter and wrong
 * for an entitlement: a limiter failing closed takes the product down, an
 * entitlement failing open gives the product away. Do not "fix" this to match.
 *
 * NEVER TRUST A CLIENT CLAIM. The entitlement is read here, server-side, with
 * the service role, on every check. The client's cached user blob is editable
 * in devtools (public/html/_persistence.js:526-528), so a client-side `plus`
 * flag may control whether an upsell renders and nothing else — the paid data
 * must already be absent from the response.
 */

/** Columns describing the subscription's state. `provider_ref` is never read here. */
const ENTITLEMENT_COLUMNS =
  "tier, status, source, started_at, current_period_end, grace_until, cancel_at_period_end";

/**
 * Postgres / PostgREST for "that table does not exist". The migration above is
 * applied by hand, so the code has to survive being deployed before it lands:
 * no entitlement store means nobody has Vibe+, which is exactly the state
 * before payments exist. That is a known answer, not a failed check — see
 * `checked` below.
 */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/**
 * Matched on the code where PostgREST sends one, and on the message where it
 * doesn't — the two layers disagree about which code a missing relation gets,
 * and guessing wrong here would turn "no store yet" into a logged error on
 * every request. Deliberately narrow: a missing COLUMN is a real fault and
 * must keep reporting itself as one.
 */
function isMissingEntitlementStore(error: { code?: string | null; message?: string | null }): boolean {
  if (MISSING_TABLE_CODES.has(error.code ?? "")) return true;
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("could not find the table")) return true;
  return message.includes("relation") && message.includes("does not exist");
}

export type EntitlementRow = {
  tier?: string | null;
  status?: string | null;
  source?: string | null;
  started_at?: string | null;
  current_period_end?: string | null;
  grace_until?: string | null;
  cancel_at_period_end?: boolean | null;
};

export type Entitlement = {
  /** The only field a gate should branch on. */
  plus: boolean;
  tier: "free" | "plus";
  status: string | null;
  source: string | null;
  started_at: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  cancel_at_period_end: boolean;
  /**
   * False when the read itself failed and the answer is "we don't know", which
   * this module reports as free. A surface that states a plan out loud (the
   * /plus page) must say it couldn't check rather than assert "you're on the
   * free plan"; a surface that gates data just uses `plus`.
   */
  checked: boolean;
};

/** Milliseconds, or null when absent OR unparseable — an unreadable date is not a date. */
function msOrNull(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The predicate, in one place:
 *
 *   plus  :=  tier = 'plus'
 *         AND (status = 'active' OR (status = 'past_due' AND grace_until > now()))
 *         AND (current_period_end IS NULL OR current_period_end > now())
 *
 * Expiry is a read-time comparison — there is no cron job and none is needed.
 * A cancel-at-period-end subscriber keeps access until the period actually
 * ends, and nothing expires late because a job didn't run.
 *
 * Exported so the rule can be exercised directly without a database.
 */
export function isPlusActive(
  row: EntitlementRow | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row || row.tier !== "plus") return false;
  const t = now.getTime();

  if (row.status !== "active") {
    const grace = msOrNull(row.grace_until);
    // past_due survives only while the grace window is open and readable.
    if (!(row.status === "past_due" && grace !== null && grace > t)) return false;
  }

  if (row.current_period_end) {
    const end = msOrNull(row.current_period_end);
    // An unparseable period end is treated as expired, never as "no end".
    if (end === null || end <= t) return false;
  }
  return true;
}

function freeEntitlement(checked: boolean): Entitlement {
  return {
    plus: false,
    tier: "free",
    status: null,
    source: null,
    started_at: null,
    current_period_end: null,
    grace_until: null,
    cancel_at_period_end: false,
    checked,
  };
}

/**
 * The account's entitlement, evaluated server-side. NEVER THROWS — a failure
 * of any kind (missing service key, dead database, unapplied migration) comes
 * back as free, and the caller keeps working.
 */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  try {
    const { data, error } = await createSupabaseServiceClient()
      .from("entitlements")
      .select(ENTITLEMENT_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      // No entitlement store yet → nobody has Vibe+. A real answer.
      if (isMissingEntitlementStore(error)) return freeEntitlement(true);
      console.error("[require-plus]", error);
      return freeEntitlement(false);
    }

    const row = (data ?? null) as EntitlementRow | null;
    // No row is the normal case for every free account.
    if (!row) return freeEntitlement(true);

    return {
      plus: isPlusActive(row),
      tier: row.tier === "plus" ? "plus" : "free",
      status: row.status ?? null,
      source: row.source ?? null,
      started_at: row.started_at ?? null,
      current_period_end: row.current_period_end ?? null,
      grace_until: row.grace_until ?? null,
      cancel_at_period_end: Boolean(row.cancel_at_period_end),
      checked: true,
    };
  } catch (err) {
    console.error("[require-plus]", err);
    return freeEntitlement(false);
  }
}

/** The one-line question most callers are actually asking. */
export async function hasPlus(userId: string): Promise<boolean> {
  return (await getEntitlement(userId)).plus;
}

/**
 * The 403 a Vibe+-only route returns. The `plus_required` code is what
 * failure-copy maps to a plain line plus a "See Vibe+" action — see the note
 * in the batch report: that copy rule is not in src/lib/feedback/failure-copy.ts
 * or its static twin yet, so until it is, this 403 falls through to the
 * generic "You don't have access to do that."
 */
export function plusRequiredResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: "That's a Vibe+ feature", code: "plus_required" },
    { status: 403 },
  );
}

/**
 * Route gate. Returns the response to send, or `null` when the caller may
 * proceed. Call order matches the existing convention:
 * getUser() → requireTermsAccepted() → rateLimit() → requirePlus().
 *
 * Use this only for a route that is entirely Vibe+. A route where the free
 * tier still gets something real (counts without names, like
 * /api/me/profile-views) branches on `hasPlus` and shapes its response
 * instead — a 403 there would take the free half away too.
 */
export async function requirePlus(userId: string): Promise<NextResponse | null> {
  return (await hasPlus(userId)) ? null : plusRequiredResponse();
}
