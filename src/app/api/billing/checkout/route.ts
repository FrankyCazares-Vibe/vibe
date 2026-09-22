import { randomInt } from "node:crypto";

import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import {
  PLUS_PERIOD_LABEL,
  PLUS_PRICE_LABEL,
  billingEnabled,
  isPlusPlan,
  type PlusPlan,
} from "@/lib/billing/config";
import { getOrCreateStripeCustomer } from "@/lib/billing/customers";
import {
  BillingConfigError,
  BillingStoreError,
  getPlusPriceId,
  getStripe,
  logBillingError,
} from "@/lib/billing/stripe";
import { requireTermsAccepted } from "@/lib/legal/require-terms";
import { getEntitlement } from "@/lib/premium/require-plus";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CheckoutBody = { plan?: unknown };

/**
 * POST /api/billing/checkout — body `{ plan: "monthly" | "yearly" }`.
 *
 * Starts a Stripe-hosted Checkout for Vibe+ and answers `{ ok: true, url }`;
 * the /plus page sends the browser there. No card field ever touches Vibe.
 * The entitlement itself is written by the webhook (and the success page's
 * idempotent sync), never here: a session that is created isn't a session
 * that was paid.
 *
 * Refusals, in order: 401 signed out · 503 `billing_off` (BILLING_ENABLED not
 * "true") · 400 bad plan · 403 `terms_required` · 503 `billing_unavailable`
 * (the entitlement read failed, so we can't tell whether they already pay; or
 * Stripe isn't set up as disclosed, say a price that disagrees with the page)
 * · 409 `already_plus` ·
 * 429 · 409 `already_subscribed` (Stripe holds a live subscription the
 * entitlement hasn't caught up with yet) · 409 `checkout_open` (another tab
 * started a checkout at the same moment, and that one is kept) · 502
 * `stripe_error`.
 *
 * Design: handoffs/2026-09-12-design-paywall-monetization.md §5; contract:
 * handoffs/wave-plan-stripe/contract.md §C.
 */
const CHECKOUT_LIMIT = { limit: 10, windowSec: 600 };
const CHECKOUT_TOO_FAST = "Too many checkout attempts. Try again in a few minutes.";

/**
 * Subscription states that still bill (or can start billing again) the
 * customer. Any one of them means a second checkout would charge twice.
 * "incomplete" too: a checkout paid by a bank debit completes before the
 * money clears, and the entitlement stays empty until it does, so the page
 * offers Subscribe again. Stripe expires it within a day if it never clears.
 */
const LIVE_SUBSCRIPTION = new Set(["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]);

const refuse = (status: number, code: string, error: string) =>
  NextResponse.json({ ok: false, code, error }, { status });

// The 409 sentences are shown as they are, so they can't say "Vibe+": the "+"
// fails failure-copy's sentence check. The 503 one is kept plain to match.
const billingOff = () => refuse(503, "billing_off", "Checkout isn't open yet.");
const unavailable = () =>
  refuse(503, "billing_unavailable", "Vibe+ checkout is unavailable right now. Try again in a few minutes.");
const alreadySubscribed = () =>
  refuse(409, "already_subscribed", "You already have a subscription. Manage it on this page.");
const CHECKOUT_OPEN = "Checkout is already open in another tab. Finish it there, or try again.";

/**
 * The line Stripe shows above the Subscribe button. Built from the same
 * price and period labels as the /plus page, so the two can't drift apart,
 * and getPlusPriceId refuses a Stripe price that doesn't match them.
 */
function autoRenewLine(plan: PlusPlan): string {
  return (
    `Vibe+ renews automatically at ${PLUS_PRICE_LABEL[plan]} ${PLUS_PERIOD_LABEL[plan]} ` +
    "until you cancel. Cancel anytime from Manage subscription on Vibe."
  );
}

/**
 * Stripe asks for a per-flow label with an 8-letter random suffix, so
 * Checkout sessions can be compared by flow in the Dashboard.
 */
function integrationIdentifier(): string {
  let suffix = "";
  for (let i = 0; i < 8; i += 1) suffix += String.fromCharCode(97 + randomInt(26));
  return `vibe_plus_web_${suffix}`;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!billingEnabled()) return billingOff();

  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const plan = body?.plan;
  if (!isPlusPlan(plan)) {
    return NextResponse.json(
      { ok: false, error: "Choose monthly or yearly" },
      { status: 400 },
    );
  }

  const termsGate = await requireTermsAccepted(user.id);
  if (termsGate) return termsGate;

  // Never start a checkout on an unknown state: a failed read reports "free",
  // and a subscriber who retries through a hiccup would be charged twice.
  const entitlement = await getEntitlement(user.id);
  if (!entitlement.checked) return unavailable();
  // Comp and past_due-in-grace count too; the /plus page offers Manage instead.
  // The sentence can't say "Vibe+": the "+" fails failure-copy's sentence check.
  if (entitlement.plus) {
    return refuse(409, "already_plus", "You already have this plan.");
  }

  const rl = await rateLimit(`billing-checkout:${user.id}`, CHECKOUT_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, CHECKOUT_TOO_FAST);

  const stripe = getStripe();
  if (!stripe) return billingOff();

  // String concatenation on purpose: URL/searchParams would percent-encode the
  // braces, and Stripe would then never swap in the real session id.
  const site = getSiteOriginForRequest(req);
  const successUrl = `${site}/plus?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${site}/plus?checkout=canceled`;

  try {
    const price = await getPlusPriceId(plan);
    const customer = await getOrCreateStripeCustomer(user.id);

    // The entitlement can lag Stripe by a webhook (a checkout finished in
    // another tab a second ago, or a subscription made in the Dashboard).
    // Stripe is the one that would charge twice, so ask it directly. No status
    // filter: Stripe's default leaves canceled ones out, so a long history of
    // cancel-and-resubscribe can't push a live subscription off the page.
    const subs = await stripe.subscriptions.list({ customer, limit: 100 });
    if (subs.data.some((s) => LIVE_SUBSCRIPTION.has(s.status))) return alreadySubscribed();

    // Close any checkout still open for this customer (a second tab, a back
    // button), so only the new one can be paid.
    if ((await closeOpenCheckouts(stripe, customer)) === "paid") return alreadySubscribed();

    const params: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { vibe_user_id: user.id },
      subscription_data: { metadata: { vibe_user_id: user.id } },
      integration_identifier: integrationIdentifier(),
      custom_text: { submit: { message: autoRenewLine(plan) } },
    };
    const session = await stripe.checkout.sessions.create(params);

    // Two requests at the same moment (two tabs) both got past the sweep above,
    // and both just made a session. So every request sweeps again and keeps
    // only the newest; they all pick the same one, and a request whose session
    // lost never hands its URL out. At most one URL can then be paid.
    const kept = await closeOpenCheckouts(stripe, customer, session);
    if (kept === "paid") return alreadySubscribed();
    if (kept !== session.id) return refuse(409, "checkout_open", CHECKOUT_OPEN);

    if (!session.url) {
      console.error("[billing] checkout: session has no url", { objectId: session.id });
      return refuse(502, "stripe_error", "Request failed");
    }
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    // A missing or mismatched price (or table) is our setup, not a Stripe
    // outage. Not billing_off: /plus decides "on sale" from the environment
    // alone, so its reload would land on the same Subscribe cards. A toast
    // that says "try again later" is the honest answer until it's fixed.
    if (err instanceof BillingConfigError) {
      logBillingError("checkout: not set up", {}, err);
      return unavailable();
    }
    logBillingError("checkout", {}, err);
    // Our own table failed, not Stripe: the plain 500 every route uses.
    if (err instanceof BillingStoreError) {
      return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
    }
    return refuse(502, "stripe_error", "Request failed");
  }
}

/**
 * Newest first. `created` is whole seconds, so two sessions made in the same
 * second are ordered by id: any fixed order works, as long as every request
 * uses the same one and so keeps the same session.
 */
function newestFirst(a: Stripe.Checkout.Session, b: Stripe.Checkout.Session): number {
  if (a.created !== b.created) return b.created - a.created;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Expire the customer's open checkouts. With `own` (the session this request
 * just made), keep the newest of them and of `own`, and return its id; `own`
 * is counted even if the list hasn't caught up with it yet. Returns "paid"
 * when one of them turned out to be paid a moment ago; then nothing is kept,
 * because a second payable checkout is exactly what this prevents.
 */
async function closeOpenCheckouts(
  stripe: Stripe,
  customer: string,
  own?: Stripe.Checkout.Session,
): Promise<string | null | "paid"> {
  const open = await stripe.checkout.sessions.list({ customer, status: "open", limit: 10 });
  const sessions = [...open.data];
  if (own && !sessions.some((s) => s.id === own.id)) sessions.push(own);
  sessions.sort(newestFirst);

  const keep = own ? sessions.shift() ?? null : null;
  let paid = false;
  for (const s of sessions) {
    if ((await closeCheckout(stripe, s.id)) === "paid") paid = true;
  }
  if (!paid) return keep?.id ?? null;
  if (keep) await closeCheckout(stripe, keep.id);
  return "paid";
}

/**
 * Expire one checkout. It may have stopped being open since the list: a
 * request running alongside expired it first (fine), or the student paid it a
 * moment ago ("paid": the caller must not hand out another). Stripe refuses to
 * expire either one, so a refusal is checked against the session's status;
 * anything else is a real failure and throws.
 */
async function closeCheckout(stripe: Stripe, id: string): Promise<"closed" | "paid"> {
  try {
    await stripe.checkout.sessions.expire(id);
    return "closed";
  } catch (err) {
    const current = await stripe.checkout.sessions.retrieve(id).catch(() => null);
    if (current?.status === "expired") return "closed";
    if (current?.status === "complete") return "paid";
    throw err;
  }
}
