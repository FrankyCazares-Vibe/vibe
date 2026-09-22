/**
 * Tests for `config.ts`: the Vibe+ plans, prices and the billing switches
 * (handoffs/wave-plan-stripe/contract.md §B, plan-critic B1).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/billing/config.test.ts
 *
 * The module has no imports at all, so it loads through a dynamic import of
 * its ".ts" path, the same pattern as `src/lib/mentions.test.ts`. The
 * specifier goes through a variable because tsc refuses a literal ".ts"
 * specifier. Every env below is a fake object; no real key is ever read, and
 * the key-shaped strings are prefixes plus filler, not keys.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./config.ts";
const {
  PAST_DUE_GRACE_DAYS,
  PLUS_PERIOD_LABEL,
  PLUS_PLANS,
  PLUS_PRICE_CENTS,
  PLUS_PRICE_CURRENCY,
  PLUS_PRICE_INTERVAL,
  PLUS_PRICE_LABEL,
  PLUS_PRICE_LOOKUP,
  STRIPE_API_VERSION,
  billingEnabled,
  isPlusPlan,
  stripeConfigured,
  stripeKeyLivemode,
} = (await import(specifier)) as typeof import("./config");

const TEST_KEY = "sk_test_" + "x".repeat(24);
const LIVE_KEY = "sk_live_" + "x".repeat(24);
const WEBHOOK = "whsec_" + "x".repeat(24);

function env(values: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

test("the plans are exactly monthly and yearly", () => {
  assert.deepEqual([...PLUS_PLANS], ["monthly", "yearly"]);
  assert.equal(isPlusPlan("monthly"), true);
  assert.equal(isPlusPlan("yearly"), true);
  for (const bad of ["Monthly", "annual", "", null, undefined, 1, {}, ["monthly"]]) {
    assert.equal(isPlusPlan(bad), false, `isPlusPlan(${JSON.stringify(bad)})`);
  }
});

test("lookup keys match the contract, never price ids", () => {
  assert.deepEqual(PLUS_PRICE_LOOKUP, {
    monthly: "vibe_plus_monthly",
    yearly: "vibe_plus_yearly",
  });
  for (const plan of PLUS_PLANS) {
    assert.doesNotMatch(PLUS_PRICE_LOOKUP[plan], /^price_/);
  }
});

test("the price the page shows is the price Stripe must charge", () => {
  assert.deepEqual(PLUS_PRICE_LABEL, { monthly: "$3.99", yearly: "$24.99" });
  assert.deepEqual(PLUS_PERIOD_LABEL, { monthly: "a month", yearly: "a year" });
  assert.deepEqual(PLUS_PRICE_INTERVAL, { monthly: "month", yearly: "year" });
  assert.equal(PLUS_PRICE_CURRENCY, "usd");
  for (const plan of PLUS_PLANS) {
    const label = "$" + (PLUS_PRICE_CENTS[plan] / 100).toFixed(2);
    assert.equal(label, PLUS_PRICE_LABEL[plan], `${plan} label agrees with its cents`);
  }
});

test("pinned API version and grace length", () => {
  assert.equal(STRIPE_API_VERSION, "2026-08-26.dahlia");
  assert.equal(PAST_DUE_GRACE_DAYS, 7);
});

test("stripeConfigured needs only a non-blank key", () => {
  assert.equal(stripeConfigured(env({})), false);
  assert.equal(stripeConfigured(env({ STRIPE_SECRET_KEY: "" })), false);
  assert.equal(stripeConfigured(env({ STRIPE_SECRET_KEY: "   " })), false);
  assert.equal(stripeConfigured(env({ STRIPE_SECRET_KEY: TEST_KEY })), true);
  // No webhook secret and no switch: the portal and account deletion still work.
  assert.equal(stripeConfigured(env({ STRIPE_SECRET_KEY: TEST_KEY, BILLING_ENABLED: "false" })), true);
});

test("billingEnabled needs the switch, the key AND the webhook secret", () => {
  const full = { BILLING_ENABLED: "true", STRIPE_SECRET_KEY: TEST_KEY, STRIPE_WEBHOOK_SECRET: WEBHOOK };
  assert.equal(billingEnabled(env(full)), true);
  assert.equal(billingEnabled(env({ ...full, STRIPE_WEBHOOK_SECRET: undefined })), false);
  assert.equal(billingEnabled(env({ ...full, STRIPE_WEBHOOK_SECRET: "  " })), false);
  // .env.example's placeholder is public; pasted in as-is it must not count.
  assert.equal(billingEnabled(env({ ...full, STRIPE_WEBHOOK_SECRET: "YOUR_WEBHOOK_SIGNING_SECRET" })), false);
  assert.equal(billingEnabled(env({ ...full, STRIPE_WEBHOOK_SECRET: "whsec_" })), false);
  assert.equal(billingEnabled(env({ ...full, STRIPE_SECRET_KEY: undefined })), false);
  assert.equal(billingEnabled(env({ ...full, BILLING_ENABLED: undefined })), false);
  for (const almost of ["TRUE", "True", "1", "yes", " true", "true "]) {
    assert.equal(billingEnabled(env({ ...full, BILLING_ENABLED: almost })), false, almost);
  }
});

test("stripeKeyLivemode reads only the prefix", () => {
  assert.equal(stripeKeyLivemode(env({ STRIPE_SECRET_KEY: TEST_KEY })), false);
  assert.equal(stripeKeyLivemode(env({ STRIPE_SECRET_KEY: "rk_test_" + "y".repeat(24) })), false);
  assert.equal(stripeKeyLivemode(env({ STRIPE_SECRET_KEY: LIVE_KEY })), true);
  assert.equal(stripeKeyLivemode(env({ STRIPE_SECRET_KEY: "rk_live_" + "y".repeat(24) })), true);
  assert.equal(stripeKeyLivemode(env({ STRIPE_SECRET_KEY: "  " + TEST_KEY + "  " })), false);
  assert.equal(stripeKeyLivemode(env({})), null);
  assert.equal(stripeKeyLivemode(env({ STRIPE_SECRET_KEY: "" })), null);
  assert.equal(stripeKeyLivemode(env({ STRIPE_SECRET_KEY: "pk_test_" + "z".repeat(24) })), null);
  assert.equal(stripeKeyLivemode(env({ STRIPE_SECRET_KEY: "whsec_" + "z".repeat(24) })), null);
});

test("defaults read process.env", () => {
  const saved = { ...process.env };
  try {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.BILLING_ENABLED;
    assert.equal(stripeConfigured(), false);
    assert.equal(billingEnabled(), false);
    assert.equal(stripeKeyLivemode(), null);
  } finally {
    process.env = saved;
  }
});
