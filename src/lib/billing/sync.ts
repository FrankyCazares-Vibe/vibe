import "server-only";

import type Stripe from "stripe";

import { isUuid } from "@/lib/pgrest";
import { isPlusActive } from "@/lib/premium/require-plus";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { stripeKeyLivemode } from "./config";
import { billingCustomerForUser, userIdForStripeCustomer } from "./customers";
import { entitlementFromSubscription, type EntitlementPatch, type PriorEntitlement } from "./entitlement-map";
import { BillingStoreError, idOf, isStripeResourceMissing, requireStripe, type BillingLogIds } from "./stripe";

/**
 * The one writer of Stripe entitlements. The webhook and the checkout success
 * page both come through here, so a subscription is written the same way no
 * matter which arrives first, and writing it twice changes nothing.
 *
 * Contract: handoffs/wave-plan-stripe/contract.md §B (plan-critic B3).
 *
 * ALWAYS RE-FETCHED. Events arrive late and out of order, so an event's copy
 * of the subscription is never written; Stripe's current copy is. An old
 * "past_due" event processed after the "active" one then writes "active".
 *
 * NEVER AN OLDER COPY OVER A NEWER ONE. Two deliveries can run at once (a
 * retry, or Franky canceling while an update is in flight), and the slower
 * one must not write the snapshot it fetched first. So the copy that gets
 * written is fetched after the row it replaces was read, and the write lands
 * only if the row is still the one that was read (updated_at, which every
 * writer stamps, the comp recipe included). A write that lost the race
 * starts over from the row that won.
 *
 * WHOSE IS IT. subscription → customer → billing_customers.user_id. The
 * subscription's metadata.vibe_user_id is a fallback only for a customer with
 * no mapping (say, after customer.deleted dropped it), and only for an
 * account that exists and has no customer of its own. When the mapping and
 * the metadata disagree, nothing is written.
 *
 * NEVER OVER A COMP. A Vibe+ row that didn't come from Stripe (a comp today,
 * Apple later) and is still on is never touched by a Stripe event
 * (`skipped_comp`).
 *
 * ONE ROW, TWO SUBSCRIPTIONS. entitlements has one row per account, but a
 * customer can hold two subscriptions (a double checkout, one made in the
 * Dashboard). The row must show the one the student is really paying for,
 * not whichever sent the last event: when a subscription is ending or over,
 * the customer's other subscriptions are asked for, and the best one still
 * on is written instead. Canceling the extra one then never switches off the
 * one still being paid for.
 */

export type SyncOutcome = "applied" | "ignored" | "unmatched" | "skipped_comp";
export type SyncResult = { outcome: SyncOutcome; userId: string | null };
export type CheckoutSyncResult = { outcome: SyncOutcome | "mismatch" | "unpaid"; userId: string | null };

type PriorRow = NonNullable<PriorEntitlement> & { tier: string | null; updated_at: string };
const PRIOR_COLUMNS = "tier, status, source, grace_until, current_period_end, provider_ref, updated_at";

/** Stripe statuses that can still mean Vibe+ (entitlement-map.ts maps them to active or past_due). */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Server clocks agree to well within this; a row written inside it counts as "maybe newer". */
const CLOCK_SKEW_MS = 5_000;

/** Tries at the conditional write before handing the event back to Stripe to retry later. */
const MAX_WRITE_ATTEMPTS = 3;

type Fetched = { sub: Stripe.Subscription; fetchedAtMs: number };

/** Stripe's current copy of a subscription, stamped with when we asked; null when it doesn't exist. */
async function fetchSubscription(stripe: Stripe, subId: string): Promise<Fetched | null> {
  const fetchedAtMs = Date.now();
  try {
    return { sub: await stripe.subscriptions.retrieve(subId), fetchedAtMs };
  } catch (err) {
    if (isStripeResourceMissing(err)) return null;
    throw err;
  }
}

async function userExists(userId: string): Promise<boolean> {
  const { data, error } = await createSupabaseServiceClient()
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new BillingStoreError("users read", error);
  return Boolean(data);
}

/** Which account a subscription belongs to, or null (write nothing). */
async function accountForSubscription(sub: Stripe.Subscription, ids: BillingLogIds): Promise<string | null> {
  const customerId = idOf(sub.customer);
  const mapped = customerId ? await userIdForStripeCustomer(customerId) : null;
  const claimed = sub.metadata?.vibe_user_id || null;

  if (mapped) {
    if (claimed && claimed !== mapped) {
      console.warn("[billing] subscription metadata disagrees with the customer mapping; nothing written", ids);
      return null;
    }
    return mapped;
  }

  if (!claimed || !isUuid(claimed)) return null;
  if (!(await userExists(claimed))) return null;
  // An account that already has a customer (in either mode) is reached
  // through that customer or not at all.
  if (await billingCustomerForUser(claimed)) {
    console.warn("[billing] subscription metadata names an account with another customer; nothing written", ids);
    return null;
  }
  return claimed;
}

async function readPrior(userId: string): Promise<PriorRow | null> {
  const { data, error } = await createSupabaseServiceClient()
    .from("entitlements")
    .select(PRIOR_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new BillingStoreError("entitlements read", error);
  return (data ?? null) as PriorRow | null;
}

/**
 * True when the row may have been written from a copy newer than ours: it
 * was written after (or about when) ours was fetched. A row written before
 * that came from a copy fetched before ours, so ours is at least as new.
 * An unreadable stamp counts as newer.
 */
function writtenSince(prior: PriorRow, fetchedAtMs: number): boolean {
  const updatedMs = new Date(prior.updated_at).getTime();
  return !Number.isFinite(updatedMs) || updatedMs >= fetchedAtMs - CLOCK_SKEW_MS;
}

/** Better for the student first: on now, then paid (not in grace), then renewing, then the later end. */
function outranks(a: EntitlementPatch, b: EntitlementPatch, now: Date): boolean {
  const score = (p: EntitlementPatch): number[] => [
    isPlusActive(p, now) ? 1 : 0,
    p.status === "active" ? 1 : 0,
    p.cancel_at_period_end ? 0 : 1,
    p.current_period_end ? new Date(p.current_period_end).getTime() || 0 : 0,
  ];
  const sa = score(a);
  const sb = score(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sa[i] > sb[i];
  }
  return false;
}

/**
 * What the account's row should say, given this subscription. A renewing,
 * active subscription says it on its own. Anything else (ending, in grace,
 * over) first lists the customer's other subscriptions that aren't canceled,
 * and the best one wins. `listed` holds every id the listing saw (null when
 * there was no listing). Null: this subscription says nothing yet.
 */
async function chooseEntitlement(
  stripe: Stripe,
  sub: Stripe.Subscription,
  prior: PriorRow | null,
  now: Date,
): Promise<{ patch: EntitlementPatch; listed: Set<string> | null } | null> {
  const own = entitlementFromSubscription(sub, prior, now);
  if (!own) return null;
  if (own.status === "active" && !own.cancel_at_period_end) return { patch: own, listed: null };

  const customerId = idOf(sub.customer);
  if (!customerId) return { patch: own, listed: null };
  // No status filter: Stripe then lists every subscription that isn't canceled.
  const others = await stripe.subscriptions.list({ customer: customerId, limit: 100 });
  let best = own;
  for (const other of others.data) {
    if (other.id === sub.id || other.livemode !== sub.livemode || !LIVE_STATUSES.has(other.status)) continue;
    const candidate = entitlementFromSubscription(other, prior, now);
    if (candidate && outranks(candidate, best, now)) best = candidate;
  }
  return { patch: best, listed: new Set(others.data.map((s) => s.id)) };
}

/**
 * One statement on entitlements(user_id), and only onto the row we read:
 * insert when there was none, else update where updated_at still matches.
 * "changed": another write landed first (start over). "taken": this
 * subscription is already on ANOTHER account's row, the (source,
 * provider_ref) index; not something a retry fixes.
 */
async function writeIfUnchanged(
  userId: string,
  prior: PriorRow | null,
  patch: EntitlementPatch,
): Promise<"written" | "changed" | "taken"> {
  const table = createSupabaseServiceClient().from("entitlements");
  const { data, error } = prior
    ? await table.update(patch).eq("user_id", userId).eq("updated_at", prior.updated_at).select("user_id")
    : await table.insert({ user_id: userId, ...patch }).select("user_id");
  if (error) {
    if (error.code === "23505") {
      // An update never changes user_id, so its conflict is always the
      // provider_ref index. An insert's is the primary key (the row appeared
      // since we read "none") unless the message names that index.
      if (prior || (error.message ?? "").includes("entitlements_source_provider_ref_idx")) return "taken";
      return "changed";
    }
    throw new BillingStoreError("entitlements write", error);
  }
  return (data ?? []).length > 0 ? "written" : "changed";
}

/**
 * Re-read one subscription from Stripe and write what it means to its
 * account's entitlements row. `ids` only labels log lines. Throws on a Stripe
 * or database failure (the webhook answers 500 and Stripe retries).
 */
export async function syncSubscriptionById(subId: string, ids: BillingLogIds = {}): Promise<SyncResult> {
  const stripe = requireStripe();
  let fetched = await fetchSubscription(stripe, subId);
  if (!fetched) return { outcome: "unmatched", userId: null };
  if (fetched.sub.livemode !== stripeKeyLivemode()) return { outcome: "ignored", userId: null };

  const logIds: BillingLogIds = { ...ids, objectId: ids.objectId ?? fetched.sub.id };
  const userId = await accountForSubscription(fetched.sub, logIds);
  if (!userId) return { outcome: "unmatched", userId: null };

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const prior = await readPrior(userId);
    if (prior && prior.source !== "stripe" && isPlusActive(prior)) return { outcome: "skipped_comp", userId };

    // Our copy must be newer than the one behind the row we replace.
    if (attempt > 1 || (prior && writtenSince(prior, fetched.fetchedAtMs))) {
      fetched = await fetchSubscription(stripe, subId);
      if (!fetched) return { outcome: "unmatched", userId: null };
    }

    const chosen = await chooseEntitlement(stripe, fetched.sub, prior, new Date());
    if (!chosen) return { outcome: "ignored", userId };
    const { patch, listed } = chosen;

    // The row shows ANOTHER Stripe subscription that is still on and that
    // the listing couldn't see (canceled a moment ago, or on another
    // customer). An ending or ended subscription doesn't replace it; that
    // subscription's own events will.
    if (
      patch.status !== "active" &&
      prior?.source === "stripe" &&
      prior.provider_ref !== patch.provider_ref &&
      !(prior.provider_ref && listed?.has(prior.provider_ref)) &&
      isPlusActive(prior)
    ) {
      return { outcome: "ignored", userId };
    }

    const written = await writeIfUnchanged(userId, prior, patch);
    if (written === "written") return { outcome: "applied", userId };
    if (written === "taken") {
      console.warn("[billing] subscription already belongs to another account; nothing written", logIds);
      return { outcome: "unmatched", userId: null };
    }
  }
  throw new BillingStoreError("entitlements write", { message: "the row kept changing under this sync" });
}

/** Checkout session ids as Stripe issues them; anything else never reaches the API. */
const SESSION_ID_RE = /^cs_[A-Za-z0-9_]{1,250}$/;

/**
 * The /plus success page's sync: the session id comes from the URL, so it is
 * proven to be this account's before anything about it is acted on or
 * reported. It must name this account (client_reference_id) AND belong to
 * this account's customer, and be complete; otherwise `mismatch`. Then it
 * must be a paid subscription checkout, or `unpaid` (a bank debit still
 * clearing; Vibe+ turns on when the webhook confirms). The write itself is syncSubscriptionById, same as the webhook.
 */
export async function syncCheckoutSession(
  sessionId: string,
  expectedUserId: string,
): Promise<CheckoutSyncResult> {
  const mismatch: CheckoutSyncResult = { outcome: "mismatch", userId: null };
  if (!SESSION_ID_RE.test(sessionId) || !isUuid(expectedUserId)) return mismatch;

  const stripe = requireStripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    if (isStripeResourceMissing(err)) return mismatch;
    throw err;
  }

  if (session.livemode !== stripeKeyLivemode()) return mismatch;
  if (session.client_reference_id !== expectedUserId) return mismatch;
  const customerId = idOf(session.customer);
  if (!customerId || (await userIdForStripeCustomer(customerId)) !== expectedUserId) return mismatch;

  if (session.mode !== "subscription") return { outcome: "ignored", userId: expectedUserId };
  // Stripe only sends a student to the success URL once the session is
  // complete, so an open or expired one came from a hand-made link: nothing
  // was paid, and "still processing" (which hides Subscribe) would be untrue.
  if (session.status !== "complete") return mismatch;
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (!paid) return { outcome: "unpaid", userId: expectedUserId };

  const subId = idOf(session.subscription);
  if (!subId) return { outcome: "ignored", userId: expectedUserId };
  return syncSubscriptionById(subId, { type: "checkout.success_page", objectId: session.id });
}
