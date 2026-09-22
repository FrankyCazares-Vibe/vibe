/**
 * Vibe+ billing settings: the two plans, what they cost, and whether Stripe
 * is switched on in this environment.
 *
 * Contract: handoffs/wave-plan-stripe/contract.md §B.
 *
 * No `server-only` and no runtime `@/` imports, so `node --test` loads this
 * file directly (config.test.ts). Only erasable TypeScript here: no enum, no
 * namespace, no parameter properties, or type stripping refuses the file.
 *
 * The prices live in Stripe and are found by LOOKUP KEY, never by a price id
 * in env or code. The labels and cents below are what the /plus page tells a
 * student they will pay; src/lib/billing/stripe.ts checks the real Stripe
 * price against them before every checkout, so the words on the page can
 * never disagree with the charge.
 *
 * Environment (all server-only, never NEXT_PUBLIC_):
 *   STRIPE_SECRET_KEY      sk_test_/rk_test_ locally; a restricted live key later
 *   STRIPE_WEBHOOK_SECRET  whsec_… for POST /api/billing/webhook
 *   BILLING_ENABLED        exactly "true" turns on Subscribe; anything else is off
 */

export type PlusPlan = "monthly" | "yearly";

export const PLUS_PLANS: readonly PlusPlan[] = ["monthly", "yearly"];

export const PLUS_PRICE_LOOKUP: Record<PlusPlan, string> = {
  monthly: "vibe_plus_monthly",
  yearly: "vibe_plus_yearly",
};

export const PLUS_PRICE_LABEL: Record<PlusPlan, string> = {
  monthly: "$3.99",
  yearly: "$24.99",
};

export const PLUS_PERIOD_LABEL: Record<PlusPlan, string> = {
  monthly: "a month",
  yearly: "a year",
};

/** What the Stripe price must say for each plan (stripe.ts refuses anything else). */
export const PLUS_PRICE_CENTS: Record<PlusPlan, number> = {
  monthly: 399,
  yearly: 2499,
};

export const PLUS_PRICE_INTERVAL: Record<PlusPlan, "month" | "year"> = {
  monthly: "month",
  yearly: "year",
};

export const PLUS_PRICE_CURRENCY = "usd";

/**
 * Pinned, and `as const` on purpose: the SDK types `apiVersion` as its one
 * LatestApiVersion literal, so a plain `string` here fails tsc at
 * `new Stripe(key, { apiVersion })`. Webhook payloads rendered in any other
 * version are re-fetched before their fields are read (webhook.ts).
 */
export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

/**
 * A failed renewal keeps Vibe+ this long. Stripe's own retries run about two
 * weeks; seven days is shorter on purpose, so a dead card doesn't hold a paid
 * feature for a fortnight (design §4, "Grace, expiry, refunds, chargebacks").
 */
export const PAST_DUE_GRACE_DAYS = 7;

export function isPlusPlan(v: unknown): v is PlusPlan {
  return v === "monthly" || v === "yearly";
}

function isSet(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

/**
 * A real signing secret, not a placeholder. .env.example's placeholder is
 * public, so a copy of it pasted in as-is would let anyone sign a webhook
 * (and customer.deleted is acted on as sent). Only the prefix is read.
 */
export function webhookSecretSet(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^whsec_\S+$/.test(env.STRIPE_WEBHOOK_SECRET?.trim() ?? "");
}

/**
 * Stripe can be called at all: there is a key. The portal and the
 * account-deletion cancel need only this, because a subscriber must always be
 * able to cancel, even while new checkouts are switched off.
 */
export function stripeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return isSet(env.STRIPE_SECRET_KEY);
}

/**
 * New subscriptions may be sold here. Needs the switch AND the key AND the
 * webhook secret: with checkout on and no webhook, cancellations, failed
 * renewals and renewals would never reach the entitlement, and a student
 * would keep (or lose) Vibe+ for the wrong reasons.
 */
export function billingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.BILLING_ENABLED === "true" &&
    isSet(env.STRIPE_SECRET_KEY) &&
    webhookSecretSet(env)
  );
}

/**
 * Which Stripe mode the configured key talks to: true for a live key, false
 * for a test key, null when there is no key or its prefix is unknown. Every
 * stored customer and every webhook event carries its own livemode, and one
 * from the other mode is never acted on. Reads only the prefix.
 */
export function stripeKeyLivemode(env: NodeJS.ProcessEnv = process.env): boolean | null {
  const key = env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return true;
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return false;
  return null;
}
