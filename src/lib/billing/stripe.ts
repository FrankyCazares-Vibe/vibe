import "server-only";

import Stripe from "stripe";

import {
  PLUS_PLANS,
  PLUS_PRICE_CENTS,
  PLUS_PRICE_CURRENCY,
  PLUS_PRICE_INTERVAL,
  PLUS_PRICE_LOOKUP,
  STRIPE_API_VERSION,
  type PlusPlan,
} from "./config";

/**
 * The one Stripe client, the Vibe+ prices, the portal configuration, and the
 * one way billing code logs a failure.
 *
 * Contract: handoffs/wave-plan-stripe/contract.md §B (plan-critic B4, B6).
 *
 * Always a client INSTANCE with the version pinned, never a global key. The
 * key is read from the environment here and nowhere else, and it never
 * appears in a log line, an error message or a response.
 */

/** Stripe or its catalog isn't set up the way this code expects. Not retryable by the student. */
export class BillingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigError";
  }
}

let client: Stripe | null = null;

/** The shared client, or null when there is no key (billing "not configured"). */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!client) {
    client = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: { name: "Vibe" },
      maxNetworkRetries: 2,
    });
  }
  return client;
}

/** getStripe() for code that cannot do anything useful without it. */
export function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) throw new BillingConfigError("Stripe is not configured");
  return stripe;
}

/** Prices and the portal configuration change by hand in the Dashboard, rarely. */
const CACHE_MS = 10 * 60 * 1000;

let priceCache: { ids: Partial<Record<PlusPlan, string>>; expiresAt: number } | null = null;

/**
 * Why a price can't be sold as this plan, or null when it can. The /plus page
 * states the amount and the period from config.ts, so a price that disagrees
 * (edited amount, wrong interval, another currency) must refuse checkout
 * instead of charging something the page didn't say.
 */
function priceProblem(price: Stripe.Price, plan: PlusPlan): string | null {
  if (!price.active) return "is not active";
  if (price.type !== "recurring" || !price.recurring) return "is not a subscription price";
  if (price.recurring.usage_type !== "licensed") return "is metered";
  if (price.recurring.interval !== PLUS_PRICE_INTERVAL[plan] || price.recurring.interval_count !== 1) {
    return `does not bill once ${PLUS_PRICE_INTERVAL[plan] === "month" ? "a month" : "a year"}`;
  }
  if (price.currency !== PLUS_PRICE_CURRENCY) return "is not in USD";
  if (price.billing_scheme !== "per_unit" || price.unit_amount !== PLUS_PRICE_CENTS[plan]) {
    return `is not ${PLUS_PRICE_CENTS[plan]} cents`;
  }
  return null;
}

/**
 * The Stripe price id for a plan, found by lookup key and checked against
 * config.ts. Both plans are fetched in one call and the good ones cached for
 * ten minutes; a missing or wrong price is never cached, so fixing it in the
 * Dashboard takes effect on the next checkout. Throws BillingConfigError.
 */
export async function getPlusPriceId(plan: PlusPlan): Promise<string> {
  const now = Date.now();
  const cached = priceCache && priceCache.expiresAt > now ? priceCache.ids[plan] : undefined;
  if (cached) return cached;

  const stripe = requireStripe();
  const list = await stripe.prices.list({
    lookup_keys: PLUS_PLANS.map((p) => PLUS_PRICE_LOOKUP[p]),
    active: true,
    limit: 10,
  });

  const ids: Partial<Record<PlusPlan, string>> = {};
  let problem = "was not found";
  for (const p of PLUS_PLANS) {
    const price = list.data.find((candidate) => candidate.lookup_key === PLUS_PRICE_LOOKUP[p]);
    const why = price ? priceProblem(price, p) : "was not found";
    if (price && why === null) ids[p] = price.id;
    else if (p === plan && why) problem = why;
  }
  priceCache = { ids, expiresAt: now + CACHE_MS };

  const id = ids[plan];
  if (!id) throw new BillingConfigError(`Vibe+ ${plan} price (${PLUS_PRICE_LOOKUP[plan]}) ${problem}`);
  return id;
}

let portalCache: { id: string; expiresAt: number } | null = null;

/**
 * The Customer Portal configuration made for Vibe (metadata vibe = "true").
 * The portal route passes it explicitly: configurations can't be made the
 * default through the API, and a fresh sandbox with no default saved in the
 * Dashboard refuses a portal session without one. Null when none exists;
 * only a found id is cached.
 */
export async function getPortalConfigurationId(): Promise<string | null> {
  const now = Date.now();
  if (portalCache && portalCache.expiresAt > now) return portalCache.id;

  const stripe = requireStripe();
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const ours = list.data
    .filter((config) => config.metadata?.vibe === "true")
    // Newest by `created`, the same pick scripts/stripe-setup.mjs keeps.
    .sort((a, b) => b.created - a.created)[0];
  if (!ours) return null;

  portalCache = { id: ours.id, expiresAt: now + CACHE_MS };
  return ours.id;
}

// ── errors and logging ──────────────────────────────────────────────────────
//
// Never hand a Stripe or Supabase error object to console.error. A StripeError
// carries `raw` and `headers`, a Postgres error's `details` echoes the failing
// row, and either can hold a customer's email. Billing code logs only the ids
// it is working on plus the summary below, and the webhook route stores the
// same summary (cut short) in billing_events.error.

export type BillingLogIds = {
  eventId?: string | null;
  type?: string | null;
  objectId?: string | null;
};

export type BillingErrorSummary = {
  errType: string | null;
  code: string | null;
  requestId: string | null;
  message: string;
};

const MESSAGE_MAX = 200;
const SECRET_RE = /\b(?:sk|rk|pk|whsec)_[A-Za-z0-9_]+/g;
const EMAIL_RE = /[^\s@'"<>(),;:]+@[^\s@'"<>(),;:]+/g;

/** A message safe to log: no key-shaped or email-shaped text, at most 200 characters. */
function cleanMessage(message: unknown): string {
  const text = typeof message === "string" ? message : "";
  return text.replace(SECRET_RE, "[redacted]").replace(EMAIL_RE, "[email]").slice(0, MESSAGE_MAX);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** The loggable parts of any thrown value: Stripe, Supabase or plain Error. */
export function billingErrorSummary(err: unknown): BillingErrorSummary {
  if (err && typeof err === "object") {
    const e = err as { type?: unknown; name?: unknown; code?: unknown; requestId?: unknown; message?: unknown };
    return {
      errType: stringOrNull(e.type) ?? stringOrNull(e.name),
      code: stringOrNull(e.code),
      requestId: stringOrNull(e.requestId),
      message: cleanMessage(e.message),
    };
  }
  return { errType: typeof err, code: null, requestId: null, message: cleanMessage(String(err)) };
}

/** One short line for billing_events.error: "StripeInvalidRequestError/resource_missing: No such …". */
export function shortBillingError(err: unknown): string {
  const { errType, code, message } = billingErrorSummary(err);
  const head = [errType ?? "Error", code].filter(Boolean).join("/");
  return `${head}: ${message}`.slice(0, MESSAGE_MAX);
}

/** console.error with the ids and the summary, never the error object itself. */
export function logBillingError(where: string, ids: BillingLogIds, err: unknown): void {
  console.error(`[billing] ${where}`, {
    eventId: ids.eventId ?? null,
    type: ids.type ?? null,
    objectId: ids.objectId ?? null,
    ...billingErrorSummary(err),
  });
}

/**
 * A billing table read or write failed. Carries only the summary: the
 * Supabase error it replaces has a `details` field that echoes row values,
 * and anything thrown from here may reach a route's console.error.
 */
export class BillingStoreError extends Error {
  readonly code: string | null;
  constructor(where: string, error: unknown) {
    super(`${where}: ${shortBillingError(error)}`.slice(0, MESSAGE_MAX));
    this.name = "BillingStoreError";
    this.code = billingErrorSummary(error).code;
  }
}

/** Stripe's "that object doesn't exist (in this mode)": a deleted customer, a bad id. */
export function isStripeResourceMissing(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: unknown }).code === "resource_missing");
}

/** The id of an expandable Stripe field, whether Stripe sent the id or the object. */
export function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id ?? null;
}
