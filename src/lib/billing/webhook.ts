import "server-only";

import type Stripe from "stripe";

import { STRIPE_API_VERSION, stripeKeyLivemode } from "./config";
import { forgetStripeCustomer, userIdForStripeCustomer } from "./customers";
import { idOf, isStripeResourceMissing, logBillingError, requireStripe, type BillingLogIds } from "./stripe";
import { syncSubscriptionById, type SyncOutcome, type SyncResult } from "./sync";

/**
 * What a verified Stripe event means for Vibe. The route
 * (src/app/api/billing/webhook/route.ts) verifies the signature, records the
 * event once in billing_events, calls this, and stores the outcome.
 *
 * Contract: handoffs/wave-plan-stripe/contract.md §B (plan-critic B5).
 *
 * Subscription state is never read off the event: every route below ends in
 * syncSubscriptionById, which re-fetches the subscription. The event only
 * says WHICH subscription to look at.
 *
 * Refunds and disputes are RECORDED, NOT ACTED ON (contract decision): a
 * refund alone doesn't stop next month's charge, and Franky cancels in the
 * Dashboard, which fires customer.subscription.deleted.
 *
 * Throws only on a Stripe or database failure, so the route answers 500 and
 * Stripe retries. Nothing here logs a payload or an email: event id, type
 * and object id only.
 */

export type HandledEvent = {
  outcome: SyncOutcome | "recorded";
  userId: string | null;
  objectId: string | null;
};

function objectIdOf(event: Stripe.Event): string | null {
  const id = (event.data?.object as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : null;
}

/**
 * The subscription an invoice was for. On dahlia that is
 * invoice.parent.subscription_details.subscription (the old top-level
 * invoice.subscription is gone). A payload is rendered in the ENDPOINT's API
 * version, which may not be ours, so a payload from another version is
 * re-read in ours before `parent` is trusted to be there.
 */
async function subscriptionForInvoice(invoice: Stripe.Invoice, apiVersion: string | null): Promise<string | null> {
  let current = invoice;
  if (apiVersion !== STRIPE_API_VERSION) {
    try {
      current = await requireStripe().invoices.retrieve(invoice.id);
    } catch (err) {
      if (isStripeResourceMissing(err)) return null;
      throw err;
    }
  }
  return idOf(current.parent?.subscription_details?.subscription);
}

/** The account behind a customer, best effort: a record is still worth keeping without one. */
async function accountForCustomer(customerId: string | null, ids: BillingLogIds): Promise<string | null> {
  if (!customerId) return null;
  try {
    return await userIdForStripeCustomer(customerId);
  } catch (err) {
    logBillingError("couldn't look up the account for a charge", ids, err);
    return null;
  }
}

/**
 * A dispute names only its charge (Dispute has no customer field), so the
 * account is found through the charge. Needs the key to read Charges. Any
 * failure records the dispute without an account instead of failing it.
 */
async function accountForDispute(dispute: Stripe.Dispute, ids: BillingLogIds): Promise<string | null> {
  try {
    const charge =
      typeof dispute.charge === "string" ? await requireStripe().charges.retrieve(dispute.charge) : dispute.charge;
    return await accountForCustomer(idOf(charge.customer), ids);
  } catch (err) {
    logBillingError("couldn't read the disputed charge", ids, err);
    return null;
  }
}

export async function handleStripeEvent(event: Stripe.Event): Promise<HandledEvent> {
  const objectId = objectIdOf(event);
  const ids: BillingLogIds = { eventId: event.id, type: event.type, objectId };
  const ignored: HandledEvent = { outcome: "ignored", userId: null, objectId };
  const synced = (result: SyncResult): HandledEvent => ({ ...result, objectId });

  // An event from the other mode (a test event at a live endpoint, or the
  // reverse) is never acted on. An unknown key mode matches nothing.
  if (event.livemode !== stripeKeyLivemode()) return ignored;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      // With a delayed payment method, "completed" arrives while the session
      // is still unpaid; the async_payment_succeeded event follows.
      const session = event.data.object;
      if (session.mode !== "subscription" || session.payment_status === "unpaid") return ignored;
      const subId = idOf(session.subscription);
      if (!subId) return ignored;
      return synced(await syncSubscriptionById(subId, ids));
    }

    case "checkout.session.async_payment_failed":
      return ignored;

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return synced(await syncSubscriptionById(event.data.object.id, ids));

    case "invoice.paid":
    case "invoice.payment_failed": {
      const subId = await subscriptionForInvoice(event.data.object, event.api_version);
      if (!subId) return ignored;
      return synced(await syncSubscriptionById(subId, ids));
    }

    case "charge.refunded": {
      const userId = await accountForCustomer(idOf(event.data.object.customer), ids);
      return { outcome: "recorded", userId, objectId };
    }

    case "charge.dispute.created": {
      const userId = await accountForDispute(event.data.object, ids);
      // Loud on purpose: a dispute costs a fee and needs a human in the
      // Dashboard. Ids only.
      console.error("[billing] dispute opened; recorded, not acted on", ids);
      return { outcome: "recorded", userId, objectId };
    }

    case "customer.deleted": {
      // Deleted in the Dashboard (or by account deletion): forget the mapping
      // so a later checkout makes a new customer instead of failing on this
      // one. Its subscriptions end in their own subscription.deleted events.
      // "applied" only when a mapping was actually dropped; none left (say,
      // account deletion already removed it) is "ignored".
      const userId = await forgetStripeCustomer(event.data.object.id);
      return { outcome: userId ? "applied" : "ignored", userId, objectId };
    }

    default:
      return ignored;
  }
}
