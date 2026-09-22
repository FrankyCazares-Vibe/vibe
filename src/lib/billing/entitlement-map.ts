import type Stripe from "stripe";

/**
 * Stripe subscription → the one entitlements row, as a pure function.
 *
 * Contract: handoffs/wave-plan-stripe/contract.md §B. Store:
 * supabase/migrations/20260912101000_entitlements.sql (every patch satisfies
 * its tier/status/source checks). Reader: src/lib/premium/require-plus.ts.
 *
 * FAILS CLOSED. `isPlusActive` reads a null `current_period_end` as "no end",
 * which is right for a comp row and would be Vibe+ forever for a paying one.
 * So an active, trialing or past_due subscription whose item has no readable
 * period end maps to null ("write nothing"), never to a row with no end. An
 * unknown status maps to null too: the SDK's Status type admits any string.
 *
 * No `server-only` and no runtime imports (the Stripe import is type-only and
 * erased), so `node --test` loads this file directly. That is why the grace
 * length below is a copy of PAST_DUE_GRACE_DAYS in config.ts; the test checks
 * that the two agree.
 */

const PAST_DUE_GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type EntitlementPatch = {
  tier: "plus";
  status: "active" | "past_due" | "canceled" | "expired";
  source: "stripe";
  provider_ref: string;
  started_at: string;
  current_period_end: string | null;
  grace_until: string | null;
  cancel_at_period_end: boolean;
  updated_at: string;
};

/** The row as it stood before this write (null when the account has none). */
export type PriorEntitlement = {
  status: string | null;
  source: string | null;
  grace_until: string | null;
  current_period_end: string | null;
  provider_ref: string | null;
} | null;

/** Unix seconds → milliseconds, or null when absent or not a real number. */
function unixMs(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value * 1000;
}

function isoMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * On dahlia the period end lives on each subscription ITEM, not on the
 * subscription. With several items the earliest end wins; one unreadable item
 * makes the whole answer unreadable, rather than quietly trusting the rest.
 */
function itemPeriodEndMs(sub: Stripe.Subscription): number | null {
  const items = sub.items?.data ?? [];
  if (items.length === 0) return null;
  let earliest: number | null = null;
  for (const item of items) {
    const end = unixMs(item?.current_period_end);
    if (end === null) return null;
    if (earliest === null || end < earliest) earliest = end;
  }
  return earliest;
}

/** When the current (on past_due: the unpaid) period began, from the latest item start; null when unreadable. */
function itemPeriodStartMs(sub: Stripe.Subscription): number | null {
  let latest: number | null = null;
  for (const item of sub.items?.data ?? []) {
    const start = unixMs(item?.current_period_start);
    if (start !== null && (latest === null || start > latest)) latest = start;
  }
  return latest;
}

export function entitlementFromSubscription(
  sub: Stripe.Subscription,
  prior: PriorEntitlement,
  now: Date,
): EntitlementPatch | null {
  const nowMs = now.getTime();
  const nowIso = new Date(nowMs).toISOString();
  const cancelAtMs = unixMs(sub.cancel_at);

  const base = {
    tier: "plus" as const,
    source: "stripe" as const,
    provider_ref: sub.id,
    started_at: new Date(unixMs(sub.start_date) ?? nowMs).toISOString(),
    // A scheduled cancel date means "ends then" even when Stripe leaves
    // cancel_at_period_end false (a cancel set for a specific date).
    cancel_at_period_end: Boolean(sub.cancel_at_period_end) || cancelAtMs !== null,
    updated_at: nowIso,
  };

  // Paid (or paying late): the row needs a real end, or it is not written.
  const paidThrough = (): string | null => {
    const itemEnd = itemPeriodEndMs(sub);
    if (itemEnd === null) return null;
    const end = cancelAtMs !== null ? Math.min(cancelAtMs, itemEnd) : itemEnd;
    return new Date(end).toISOString();
  };

  // Over: the period ends when the subscription did, or now.
  const endedAt = (): string => new Date(unixMs(sub.ended_at) ?? nowMs).toISOString();

  switch (sub.status) {
    case "active":
    case "trialing": {
      const end = paidThrough();
      if (end === null) return null;
      return { ...base, status: "active", current_period_end: end, grace_until: null };
    }

    case "past_due": {
      const end = paidThrough();
      if (end === null) return null;
      // Repeat failure events for the SAME subscription keep the window that
      // the first failure opened; they never push it out again. A stored
      // window that can't be read counts as already over.
      const sameFailure = prior?.status === "past_due" && prior.provider_ref === sub.id;
      let grace: string;
      if (sameFailure) {
        const priorGrace = isoMs(prior?.grace_until);
        grace = new Date(priorGrace ?? nowMs).toISOString();
      } else {
        // The first window counts from when the unpaid period began (Stripe's
        // clock), not from when we got the event: an endpoint that was down
        // for three days must not turn seven days into ten. Never more than
        // seven days from now; from now only when Stripe gives no start.
        const graceMs = PAST_DUE_GRACE_DAYS * DAY_MS;
        const periodStart = itemPeriodStartMs(sub);
        const latest = nowMs + graceMs;
        grace = new Date(periodStart === null ? latest : Math.min(periodStart + graceMs, latest)).toISOString();
      }
      return { ...base, status: "past_due", current_period_end: end, grace_until: grace };
    }

    case "unpaid":
    case "paused":
      return { ...base, status: "canceled", current_period_end: nowIso, grace_until: null };

    case "canceled":
      return { ...base, status: "canceled", current_period_end: endedAt(), grace_until: null };

    case "incomplete_expired":
      return { ...base, status: "expired", current_period_end: endedAt(), grace_until: null };

    // First payment still pending: nothing to grant or take away yet.
    case "incomplete":
      return null;

    default:
      return null;
  }
}
