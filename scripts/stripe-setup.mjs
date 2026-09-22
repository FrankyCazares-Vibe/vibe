#!/usr/bin/env node
// Set up Vibe+ in a Stripe SANDBOX: the "Vibe+" product, its two prices and
// the Customer Portal settings. The app finds every one of them by name (the
// product id, the price lookup keys, the portal's metadata), so no Stripe id
// ever goes into env or code.
//
//   node scripts/stripe-setup.mjs                create or fix what's missing
//   node scripts/stripe-setup.mjs --check        read and report, change nothing
//   node scripts/stripe-setup.mjs --live         LIVE key: print the plan, change nothing
//   node scripts/stripe-setup.mjs --live --check LIVE key: read and report, change nothing
//   node scripts/stripe-setup.mjs --live --yes   LIVE key: really do it
//
// Exit codes: 0 all good, 1 error or refusal, 2 bad option, 3 --check found
// something to fix.
//
// Re-runnable: everything is looked up first, and a second run changes
// nothing and says so.
//
// THE KEY. STRIPE_SECRET_KEY from the process environment, else from the env
// files `next dev` reads (.env.development.local first), loaded with
// @next/env. It must be a test key (sk_test_ / rk_test_) unless --live is
// passed. No part of it is ever printed, and Stripe's own error messages are
// scrubbed of it before they are (an auth error echoes the key's last four).
//
// A LIVE RUN needs its own short-lived key with Products write, Prices write
// and Customer portal write. The production restricted key (.env.example)
// cannot run this, on purpose. Delete the setup key after the run, and never
// put it on Vercel.
//
// PRICES ARE IMMUTABLE. A lookup key that points at a wrong price (amount,
// currency, interval, product) gets a new, right price, the key moves to it
// (transfer_lookup_key) and the old one is archived. Subscriptions already on
// the old price keep its amount; nothing here moves them. tax_behavior is left
// unset on purpose: it can never be changed once set, and automatic_tax is off
// (no tax registration exists).
//
// THE PORTAL. Stripe's API can't make a configuration the account default
// (is_default is read-only there), so the portal route passes this one's id
// explicitly. It finds it as the one ACTIVE configuration with metadata
// vibe = "true", and this script keeps exactly one such.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import Stripe from "stripe";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Keep in step with src/lib/billing/config.ts (PLUS_PRICE_LOOKUP,
// PLUS_PRICE_LABEL, STRIPE_API_VERSION). Plain Node can't import that file.
const STRIPE_API_VERSION = "2026-08-26.dahlia";
const PRODUCT = {
  id: "vibe_plus",
  name: "Vibe+",
  // Only what exists today: customization isn't sold until it's built (the
  // /plus page promises exactly that).
  description: "See who viewed your profile, who viewed your posts, and who saved them.",
};
const PRICES = [
  { lookupKey: "vibe_plus_monthly", amount: 399, interval: "month", nickname: "Vibe+ monthly" },
  { lookupKey: "vibe_plus_yearly", amount: 2499, interval: "year", nickname: "Vibe+ yearly" },
];
const PORTAL_NAME = "Vibe+ (scripts/stripe-setup.mjs)";
const PRIVACY_URL = "https://www.connectvibe.app/legal/privacy";
const TERMS_URL = "https://www.connectvibe.app/legal/terms";
const CANCEL_REASONS = ["too_expensive", "missing_features", "unused", "switched_service", "other"];

const USAGE = [
  "Usage: node scripts/stripe-setup.mjs [--check] [--live [--yes]]",
  "  --check  read and report, change nothing",
  "  --live   allow a live key: prints the plan, and changes things only with --yes",
];

function fail(code, ...lines) {
  for (const line of lines) console.error(line);
  process.exit(code);
}

// ---------------------------------------------------------------------------
// Options.
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE.join("\n"));
  process.exit(0);
}
const unknown = args.filter((a) => !["--check", "--live", "--yes"].includes(a));
if (unknown.length > 0) fail(2, `Unknown option: ${unknown.join(" ")}`, ...USAGE);
const CHECK = args.includes("--check");
const LIVE = args.includes("--live");
const YES = args.includes("--yes");
if (YES && !LIVE) fail(2, "--yes only means something with --live.", ...USAGE);
if (YES && CHECK) fail(2, "--check changes nothing, so it never needs --yes.", ...USAGE);

// ---------------------------------------------------------------------------
// The key: process env first, then the env files. Never printed.
// ---------------------------------------------------------------------------
let keySource = "the environment";
if (!process.env.STRIPE_SECRET_KEY) {
  // An empty STRIPE_SECRET_KEY= in the shell would stop @next/env from
  // filling it in from the files, so drop it first.
  delete process.env.STRIPE_SECRET_KEY;
  const { loadedEnvFiles } = nextEnv.loadEnvConfig(REPO_ROOT, true);
  // Files are listed in precedence order, and the first one that sets the
  // key is the one that won.
  const from = loadedEnvFiles.find((f) => Object.hasOwn(f.env ?? {}, "STRIPE_SECRET_KEY"));
  if (from) keySource = from.path;
}
const KEY = process.env.STRIPE_SECRET_KEY ?? "";
if (!KEY) {
  fail(
    1,
    "STRIPE_SECRET_KEY is not set. Put a sandbox test key in .env.development.local",
    "(Stripe Dashboard → your sandbox → Developers → API keys), or export it for this run.",
  );
}
const isTestKey = /^(sk|rk)_test_/.test(KEY);
const isLiveKey = /^(sk|rk)_live_/.test(KEY);
if (!isTestKey && !isLiveKey) {
  fail(1, `The STRIPE_SECRET_KEY from ${keySource} is not a secret (sk_) or restricted (rk_) key. Refusing.`);
}
if (isLiveKey && !LIVE) {
  fail(
    1,
    `The STRIPE_SECRET_KEY from ${keySource} is a live key. This script sets up a sandbox and`,
    "refuses live keys unless you pass --live (which prints the plan first).",
  );
}
if (isTestKey && LIVE) {
  fail(1, `--live was passed, but the STRIPE_SECRET_KEY from ${keySource} is a test key. Drop --live.`);
}

// ---------------------------------------------------------------------------
// A live key without --yes: say what would happen and stop.
// ---------------------------------------------------------------------------
if (LIVE && !YES && !CHECK) {
  console.log(
    [
      "LIVE MODE. Nothing has been changed. With --yes this run would, in the LIVE account:",
      `  1. create product ${PRODUCT.id} "${PRODUCT.name}", or fix its name and description`,
      "  2. make sure these prices exist, creating any that are missing. A wrong one is replaced,",
      "     never edited (prices are immutable), and the old one is archived:",
      ...PRICES.map((p) => `       ${p.lookupKey}  ${money(p.amount)} ${per(p.interval)}`),
      "  3. create or update the Vibe+ Customer Portal configuration: cancel at period end with a",
      "     reason, card update, invoice history, email update, switch between monthly and yearly",
      "",
      "A live run needs its own short-lived key with Products write, Prices write and Customer",
      "portal write. The production restricted key can't do this, on purpose. Delete the setup",
      "key after the run, and never put it on Vercel.",
      "",
      "See what's there first:  node scripts/stripe-setup.mjs --live --check",
      "Then do it:              node scripts/stripe-setup.mjs --live --yes",
    ].join("\n"),
  );
  process.exit(0);
}

// A client instance, never a global key. The version is pinned so this script
// reads the same object shapes the app does.
const stripe = new Stripe(KEY, {
  apiVersion: STRIPE_API_VERSION,
  maxNetworkRetries: 2,
  appInfo: { name: "Vibe setup script" },
});

// ---------------------------------------------------------------------------
// Reporting.
// ---------------------------------------------------------------------------
const rows = [];
let needsFixing = 0;
let changes = 0;

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function per(interval) {
  return interval === "month" ? "a month" : interval === "year" ? "a year" : `per ${interval}`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function describePrice(price) {
  const amount = price.unit_amount == null ? "no fixed amount" : `${price.unit_amount} ${price.currency}`;
  const every = price.recurring
    ? `every ${plural(price.recurring.interval_count, price.recurring.interval)}`
    : "one-time";
  return `${amount}, ${every}${price.active ? "" : ", archived"}`;
}

// What --check found wrong, or what a real run changed.
function report(what, id, status) {
  rows.push(`  ${what.padEnd(26)} ${String(id ?? "-").padEnd(32)} ${status}`);
}

function drift(what, id, problem) {
  needsFixing += 1;
  report(what, id, `NEEDS FIXING: ${problem}`);
}

function changed(what, id, status) {
  changes += 1;
  report(what, id, status);
}

function sameSet(a, b) {
  const x = [...new Set(a ?? [])].sort();
  const y = [...new Set(b ?? [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// Stripe errors in plain words. The key never reaches the screen: an
// authentication error echoes its last four characters, so that message is
// replaced outright, and every other message is scrubbed of anything shaped
// like a key before it is shown.
function describeError(err) {
  const scrub = (s) =>
    String(s ?? "")
      .split(KEY)
      .join("[key]")
      .replace(/\b(sk|rk|pk)_(test|live)_[A-Za-z0-9*.]+/g, "[key]");
  const req = err?.requestId ? ` (request ${err.requestId})` : "";
  switch (err?.type) {
    case "StripeAuthenticationError":
      return `Stripe refused the key from ${keySource}. Check the key is current and belongs to the right account.${req}`;
    case "StripePermissionError":
      return `The key from ${keySource} lacks a permission this step needs (Products, Prices or Customer portal write): ${scrub(err.message)}${req}`;
    case "StripeConnectionError":
      return "Couldn't reach Stripe. Check the network and try again.";
    case "StripeRateLimitError":
      return `Stripe asked us to slow down. Wait a minute and run it again.${req}`;
    default:
      if (typeof err?.type === "string" && err.type.startsWith("Stripe")) {
        const code = err.code ? `, ${err.code}` : "";
        const param = err.param ? `, param ${err.param}` : "";
        return `Stripe said: ${scrub(err.message)} (${err.type}${code}${param})${req}`;
      }
      return `Stopped: ${scrub(err?.message ?? err)}`;
  }
}

// Every object this script reads must be in the mode the key says. A mismatch
// can't happen with a real Stripe key, so it means something is badly off.
function assertMode(obj, what) {
  if (obj.livemode !== isLiveKey) {
    throw new Error(`${what} came back with livemode ${obj.livemode}, but the key is a ${isLiveKey ? "live" : "test"} key.`);
  }
}

// ---------------------------------------------------------------------------
// 1. The product, by its fixed id.
// ---------------------------------------------------------------------------
async function ensureProduct() {
  let product = null;
  try {
    product = await stripe.products.retrieve(PRODUCT.id);
  } catch (err) {
    // Missing is the one expected answer; anything else stops the run.
    if (err?.code !== "resource_missing") throw err;
  }

  if (!product) {
    if (CHECK) return drift("product", PRODUCT.id, "missing");
    product = await stripe.products.create({
      id: PRODUCT.id,
      name: PRODUCT.name,
      description: PRODUCT.description,
    });
    assertMode(product, "The new product");
    return changed("product", product.id, `created "${product.name}"`);
  }

  assertMode(product, "The product");
  const problems = [];
  if (product.name !== PRODUCT.name) problems.push(`name is "${product.name}"`);
  if ((product.description ?? "") !== PRODUCT.description) problems.push("description differs");
  // An archived product can't be sold, so Checkout would refuse its prices.
  if (!product.active) problems.push("archived");
  if (problems.length === 0) return report("product", product.id, `ok "${product.name}"`);
  if (CHECK) return drift("product", product.id, problems.join(", "));

  await stripe.products.update(product.id, {
    name: PRODUCT.name,
    description: PRODUCT.description,
    active: true,
  });
  changed("product", product.id, `updated (${problems.join(", ")})`);
}

// ---------------------------------------------------------------------------
// 2. The two prices, by lookup key.
// ---------------------------------------------------------------------------
function productIdOf(price) {
  return typeof price.product === "string" ? price.product : price.product?.id;
}

// Everything that has to be true of a price for the app to sell it. An empty
// list means it is right.
function priceProblems(price, spec) {
  const problems = [];
  if (productIdOf(price) !== PRODUCT.id) problems.push(`on product ${productIdOf(price)}`);
  if (price.currency !== "usd") problems.push(`currency ${price.currency}`);
  if (price.billing_scheme !== "per_unit" || price.unit_amount !== spec.amount) {
    problems.push(`amount ${price.unit_amount ?? "not fixed"}, want ${spec.amount}`);
  }
  const r = price.recurring;
  if (price.type !== "recurring" || !r) {
    problems.push("not recurring");
  } else if (r.interval !== spec.interval || r.interval_count !== 1 || r.usage_type !== "licensed") {
    problems.push(`bills every ${plural(r.interval_count, r.interval)} (${r.usage_type}), want every 1 ${spec.interval}`);
  }
  if (!price.active) problems.push("archived");
  return problems;
}

// Returns { [lookupKey]: priceId | null } for the portal step.
async function ensurePrices() {
  // No `active` filter: an archived price can still hold a lookup key, and
  // it has to be found to be replaced or brought back.
  const listed = await stripe.prices.list({
    lookup_keys: PRICES.map((p) => p.lookupKey),
    limit: 10,
  });
  const ids = {};

  for (const spec of PRICES) {
    const label = `price ${spec.lookupKey}`;
    const want = `${money(spec.amount)} ${per(spec.interval)}`;
    const held = listed.data.find((p) => p.lookup_key === spec.lookupKey) ?? null;
    if (held) assertMode(held, `Price ${held.id}`);
    const problems = held ? priceProblems(held, spec) : ["missing"];

    if (problems.length === 0) {
      ids[spec.lookupKey] = held.id;
      report(label, held.id, `ok ${want}`);
      continue;
    }

    // Right in every way but archived: bring it back rather than make a twin.
    if (held && problems.length === 1 && problems[0] === "archived") {
      ids[spec.lookupKey] = held.id;
      if (CHECK) {
        drift(label, held.id, "archived");
        continue;
      }
      await stripe.prices.update(held.id, { active: true });
      changed(label, held.id, `unarchived ${want}`);
      continue;
    }

    if (CHECK) {
      ids[spec.lookupKey] = null;
      drift(label, held?.id, held ? `${problems.join("; ")} (holds ${describePrice(held)})` : "missing");
      continue;
    }

    // Prices can't be edited. Make the right one and move the key to it.
    const created = await stripe.prices.create({
      product: PRODUCT.id,
      currency: "usd",
      unit_amount: spec.amount,
      recurring: { interval: spec.interval },
      lookup_key: spec.lookupKey,
      transfer_lookup_key: true,
      nickname: spec.nickname,
    });
    assertMode(created, "The new price");
    ids[spec.lookupKey] = created.id;
    if (!held) {
      changed(label, created.id, `created ${want}`);
      continue;
    }
    // Archive the old one so nobody can be put on it again, but only if it is
    // a Vibe+ price. A price of some other product only loses the key.
    const ours = productIdOf(held) === PRODUCT.id;
    if (ours && held.active) await stripe.prices.update(held.id, { active: false });
    const after = ours ? "which is now archived" : `left as it was (it belongs to product ${productIdOf(held)})`;
    changed(label, created.id, `created ${want}; the key moved off ${held.id} (${describePrice(held)}), ${after}`);
    rows.push(`  ${"".padEnd(26)} Subscriptions already on ${held.id} keep its amount; nothing here moves them.`);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// 3. The Customer Portal configuration, found by its metadata.
// ---------------------------------------------------------------------------
// Cancel at the end of the paid period (with a reason), update the card, see
// invoices, change the email, switch between the two Vibe+ prices. Nothing
// else: no quantity, no promotion codes, no address or tax id collection.
function portalParams(priceIds) {
  return {
    name: PORTAL_NAME,
    metadata: { vibe: "true" },
    business_profile: {
      headline: "Vibe+",
      privacy_policy_url: PRIVACY_URL,
      terms_of_service_url: TERMS_URL,
    },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email"] },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        cancellation_reason: { enabled: true, options: CANCEL_REASONS },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        // Stripe turns quantity changes ON when this is left out, and a
        // student who picked "2" would pay for Vibe+ twice. Say it outright.
        products: [{ product: PRODUCT.id, prices: priceIds, adjustable_quantity: { enabled: false } }],
      },
    },
  };
}

function portalProblems(config, priceIds) {
  const f = config.features ?? {};
  const bp = config.business_profile ?? {};
  const problems = [];
  if (bp.headline !== "Vibe+") problems.push("headline");
  if (bp.privacy_policy_url !== PRIVACY_URL) problems.push("privacy link");
  if (bp.terms_of_service_url !== TERMS_URL) problems.push("terms link");
  if (!f.invoice_history?.enabled) problems.push("invoice history off");
  if (!f.payment_method_update?.enabled) problems.push("card update off");
  if (!f.customer_update?.enabled || !sameSet(f.customer_update.allowed_updates, ["email"])) {
    problems.push("customer update is not email only");
  }
  const cancel = f.subscription_cancel;
  if (!cancel?.enabled || cancel.mode !== "at_period_end") problems.push("cancel is not at period end");
  if (!cancel?.cancellation_reason?.enabled || !sameSet(cancel.cancellation_reason.options, CANCEL_REASONS)) {
    problems.push("cancellation reasons");
  }
  const upd = f.subscription_update;
  if (!upd?.enabled || !sameSet(upd.default_allowed_updates, ["price"]) || upd.proration_behavior !== "create_prorations") {
    problems.push("plan switching settings");
  }
  if (upd?.products === undefined) {
    // Not returned unless expanded. If Stripe wouldn't expand it, restate it.
    problems.push("plan switching prices unreadable");
  } else {
    const products = upd.products ?? [];
    const ours = products.length === 1 && products[0].product === PRODUCT.id ? products[0] : null;
    // After a price was replaced, this is what would still point at the old one.
    if (!ours || !sameSet(ours.prices, priceIds)) problems.push("plan switching points at other prices");
    if (ours?.adjustable_quantity?.enabled) problems.push("quantity can be changed");
  }
  return problems;
}

// Every ACTIVE configuration marked as ours, newest first.
async function listOurPortalConfigs() {
  const collect = async (params) => {
    const found = [];
    for await (const c of stripe.billingPortal.configurations.list(params)) {
      if (c.metadata?.vibe === "true") found.push(c);
    }
    return found.sort((a, b) => b.created - a.created);
  };
  const params = { active: true, limit: 100 };
  try {
    // products is left out of the configuration unless it is expanded.
    return await collect({ ...params, expand: ["data.features.subscription_update.products"] });
  } catch (err) {
    if (err?.type !== "StripeInvalidRequestError" || !/expand/i.test(err.message ?? "")) throw err;
    return collect(params);
  }
}

async function ensurePortal(ids) {
  const priceIds = PRICES.map((p) => ids[p.lookupKey]);
  if (!CHECK && priceIds.some((id) => !id)) {
    throw new Error("A price id is missing after the price step, so the portal can't be set up.");
  }
  const [config, ...extra] = await listOurPortalConfigs();

  let portalId = null;
  if (!config) {
    if (CHECK) {
      drift("portal", null, "missing");
    } else {
      const created = await stripe.billingPortal.configurations.create(portalParams(priceIds));
      assertMode(created, "The new portal configuration");
      portalId = created.id;
      changed("portal", created.id, "created");
    }
  } else {
    assertMode(config, "The portal configuration");
    portalId = config.id;
    const problems = portalProblems(config, priceIds);
    if (problems.length === 0) report("portal", config.id, "ok");
    else if (CHECK) drift("portal", config.id, problems.join(", "));
    else {
      await stripe.billingPortal.configurations.update(config.id, portalParams(priceIds));
      changed("portal", config.id, `updated (${problems.join(", ")})`);
    }
  }

  // The portal route takes the one active Vibe+ configuration. Two would make
  // its pick depend on list order, so only the newest stays active.
  for (const old of extra) {
    assertMode(old, "A portal configuration");
    if (CHECK) drift("portal (extra)", old.id, "a second active Vibe+ configuration");
    else {
      await stripe.billingPortal.configurations.update(old.id, { active: false });
      changed("portal (extra)", old.id, "deactivated: only one Vibe+ configuration stays active");
    }
  }
  return portalId;
}

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------
async function main() {
  const mode = isLiveKey ? "LIVE" : "test";
  console.log(
    `Stripe setup in ${mode} mode (livemode ${isLiveKey}), ${isLiveKey ? "live" : "test"} key from ${keySource}, ` +
      `API ${STRIPE_API_VERSION}${CHECK ? ", read only" : ""}.`,
  );

  await ensureProduct();
  const ids = await ensurePrices();
  const portalId = await ensurePortal(ids);

  console.log(rows.join("\n"));
  console.log("");
  if (portalId) {
    console.log(
      `The portal route passes configuration ${portalId} explicitly (the one active configuration with\n` +
        'metadata vibe = "true"). Stripe\'s API can\'t make it the account default, and it doesn\'t need to be.',
    );
  }
  if (CHECK) {
    if (needsFixing > 0) {
      const how = isLiveKey ? "node scripts/stripe-setup.mjs --live --yes" : "node scripts/stripe-setup.mjs";
      console.log(`${needsFixing} thing${needsFixing === 1 ? "" : "s"} to fix. Run \`${how}\` to fix ${needsFixing === 1 ? "it" : "them"}.`);
      process.exit(3);
    }
    console.log("Everything is in place.");
    return;
  }
  console.log(changes === 0 ? "Everything was already in place. Nothing changed." : `Done: ${changes} change${changes === 1 ? "" : "s"}.`);
}

try {
  await main();
} catch (err) {
  // Show what did happen before the step that failed, then why it failed.
  if (rows.length > 0) console.log(rows.join("\n"));
  fail(
    1,
    describeError(err),
    "The run stopped at that step. Fix it and run the script again: it looks everything up first, so it picks up where it stopped.",
  );
}
