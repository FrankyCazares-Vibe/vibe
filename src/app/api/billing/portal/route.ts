import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getSiteOriginForRequest } from "@/lib/auth/site-url";
import { stripeKeyLivemode } from "@/lib/billing/config";
import { billingCustomerForUser } from "@/lib/billing/customers";
import {
  getPortalConfigurationId,
  getStripe,
  isStripeResourceMissing,
  logBillingError,
} from "@/lib/billing/stripe";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/billing/portal — opens Stripe's Customer Portal for the signed-in
 * student and answers `{ ok: true, url }`. Cancel, card update, invoices and
 * switching monthly/yearly all happen there, on Stripe's page.
 *
 * Deliberately NOT gated on BILLING_ENABLED or the Terms: a subscriber must
 * always be able to cancel, even after checkout is switched off or while a
 * new Terms version waits for their consent. Only a configured Stripe key
 * and a customer of our own are required.
 *
 * Refusals: 401 signed out · 503 `billing_off` (no Stripe key) · 404
 * `no_customer` (never checked out, or only in the other Stripe mode) · 429 ·
 * 502 `stripe_error`.
 */
const PORTAL_LIMIT = { limit: 20, windowSec: 600 };
const PORTAL_TOO_FAST = "Too many tries. Try again in a few minutes.";

const refuse = (status: number, code: string, error: string) =>
  NextResponse.json({ ok: false, code, error }, { status });

const noCustomer = () => refuse(404, "no_customer", "No subscription to manage yet");

/**
 * Stripe's API can't make our portal configuration the account default, so
 * every session names it (a fresh sandbox with no default saved in the
 * Dashboard refuses a session without one). If ours can't be found, a
 * Dashboard-saved default may still work: say so once and go on.
 */
let warnedNoConfiguration = false;

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // getStripe() is null exactly when stripeConfigured() is false (no key).
  const stripe = getStripe();
  // No "Vibe+" in the sentence: the "+" fails failure-copy's sentence check.
  if (!stripe) return refuse(503, "billing_off", "Subscriptions aren't set up yet.");

  // A missing billing_customers table (production before billing ships) comes
  // back as null from the helper, the same as a student who never checked out.
  let mapping: Awaited<ReturnType<typeof billingCustomerForUser>>;
  try {
    mapping = await billingCustomerForUser(user.id);
  } catch (err) {
    logBillingError("portal: customer lookup", {}, err);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  // A test-mode customer means nothing to a live key (and the reverse):
  // Stripe would answer "no such customer". There is nothing here to manage.
  if (!mapping || mapping.livemode !== stripeKeyLivemode()) return noCustomer();

  const rl = await rateLimit(`billing-portal:${user.id}`, PORTAL_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, PORTAL_TOO_FAST);

  // Finding our configuration is a nicety, not a gate: if the lookup fails (a
  // Stripe blip, or a restricted key without Customer Portal read), still try
  // the account default, because cancelling must always work.
  let configuration: string | null = null;
  try {
    configuration = await getPortalConfigurationId();
    if (!configuration && !warnedNoConfiguration) {
      warnedNoConfiguration = true;
      console.error("[billing] portal: no configuration tagged vibe=true; using the account default");
    }
  } catch (err) {
    logBillingError("portal: configuration lookup", {}, err);
  }

  try {
    const params: Stripe.BillingPortal.SessionCreateParams = {
      customer: mapping.customerId,
      return_url: `${getSiteOriginForRequest(req)}/plus`,
    };
    if (configuration) params.configuration = configuration;

    const session = await stripe.billingPortal.sessions.create(params);
    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    // The customer was deleted in the Dashboard and the customer.deleted
    // webhook hasn't removed our row yet: same answer as never subscribed.
    if (isMissingCustomer(err)) return noCustomer();
    logBillingError("portal", {}, err);
    return refuse(502, "stripe_error", "Request failed");
  }
}

/** "No such customer", and not a missing configuration (param "configuration"). */
function isMissingCustomer(err: unknown): boolean {
  return isStripeResourceMissing(err) && (err as { param?: unknown }).param === "customer";
}
