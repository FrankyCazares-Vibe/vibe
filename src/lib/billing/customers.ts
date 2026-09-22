import "server-only";

import type Stripe from "stripe";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { stripeKeyLivemode } from "./config";
import { BillingConfigError, BillingStoreError, isStripeResourceMissing, requireStripe } from "./stripe";

/**
 * Vibe account ↔ Stripe customer, one row per account in billing_customers.
 *
 * Contract: handoffs/wave-plan-stripe/contract.md §B (plan-critic B4c).
 * Table: supabase/migrations/20260922150000_billing_stripe.sql (RLS on, no
 * policies, service role only), so every read and write here uses the
 * service client.
 *
 * This mapping is how every webhook event finds its account: subscription →
 * customer → user. It is written once, when checkout first needs a customer,
 * and it is the only thing Vibe sends Stripe about the student: an opaque
 * account id in metadata. No name, no email (Checkout asks for the email).
 *
 * MISSING TABLE = NO ROW. Production runs this code before the migration
 * exists (billing stays off there), and DELETE /api/me reads the mapping for
 * every account deletion. A missing table must read as "this account has no
 * Stripe customer", never as a failure.
 *
 * ONE MODE AT A TIME. Each row records whether its customer is a live or a
 * test customer. A row from the other mode is invisible to the lookups below,
 * and getOrCreateStripeCustomer replaces a test row under a live key instead
 * of handing a test customer to a live checkout. The reverse (a live row
 * under a test key) is refused, never replaced.
 */

type MappingRow = { user_id: string; stripe_customer_id: string; livemode: boolean };
const MAPPING_COLUMNS = "user_id, stripe_customer_id, livemode";

/** Postgres / PostgREST for "that table does not exist" (same as require-plus.ts:42-56). */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/**
 * The missing-table matcher from src/lib/premium/require-plus.ts, copied
 * because that one isn't exported. Deliberately narrow: a missing COLUMN is a
 * real fault and must keep reporting itself as one.
 */
export function isMissingTableError(error: { code?: string | null; message?: string | null }): boolean {
  if (MISSING_TABLE_CODES.has(error.code ?? "")) return true;
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("could not find the table")) return true;
  return message.includes("relation") && message.includes("does not exist");
}

async function readMapping(
  column: "user_id" | "stripe_customer_id",
  value: string,
): Promise<{ row: MappingRow | null; tableMissing: boolean }> {
  const { data, error } = await createSupabaseServiceClient()
    .from("billing_customers")
    .select(MAPPING_COLUMNS)
    .eq(column, value)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { row: null, tableMissing: true };
    throw new BillingStoreError("billing_customers read", error);
  }
  return { row: (data as MappingRow | null) ?? null, tableMissing: false };
}

/**
 * The account's customer in EITHER mode, with its mode. For DELETE /api/me,
 * which must refuse (fail closed) when the row belongs to a mode the current
 * key can't reach, rather than skip cancelling a real subscription.
 */
export async function billingCustomerForUser(
  userId: string,
): Promise<{ customerId: string; livemode: boolean } | null> {
  const { row } = await readMapping("user_id", userId);
  return row ? { customerId: row.stripe_customer_id, livemode: row.livemode } : null;
}

/** The account's customer in the key's mode, or null. */
export async function stripeCustomerForUser(userId: string): Promise<string | null> {
  const { row } = await readMapping("user_id", userId);
  if (!row || row.livemode !== stripeKeyLivemode()) return null;
  return row.stripe_customer_id;
}

/** The account a customer belongs to, in the key's mode, or null. */
export async function userIdForStripeCustomer(customerId: string): Promise<string | null> {
  const { row } = await readMapping("stripe_customer_id", customerId);
  if (!row || row.livemode !== stripeKeyLivemode()) return null;
  return row.user_id;
}

/**
 * The customer was deleted in Stripe (customer.deleted): drop its mapping so
 * the account's next checkout makes a new customer instead of failing on the
 * deleted one. Returns the account it belonged to, or null.
 */
export async function forgetStripeCustomer(customerId: string): Promise<string | null> {
  const { data, error } = await createSupabaseServiceClient()
    .from("billing_customers")
    .delete()
    .eq("stripe_customer_id", customerId)
    .select("user_id");
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new BillingStoreError("billing_customers delete", error);
  }
  const rows = (data ?? []) as Array<{ user_id: string }>;
  return rows[0]?.user_id ?? null;
}

/** True when Stripe says the customer was deleted (or no longer exists in this mode). */
async function isDeletedCustomer(stripe: Stripe, customerId: string): Promise<boolean> {
  try {
    const current = await stripe.customers.retrieve(customerId);
    return "deleted" in current && Boolean(current.deleted);
  } catch (err) {
    if (isStripeResourceMissing(err)) return true;
    throw err;
  }
}

/** Customers deleted within a day of each other before we stop and report it. */
const MAX_REPLAYED_DELETED = 3;

/**
 * Make the Stripe customer for an account. The idempotency key means a double
 * click, or two tabs, get ONE customer. But for 24 hours Stripe replays the
 * first answer to that key even if the customer has been deleted since, which
 * is exactly when we come back here (forgetStripeCustomer dropped the row).
 * So a replayed answer is checked, and a deleted one replaced.
 *
 * The replacement's key is named after the deleted customer, not the clock,
 * so two checkouts racing here still make ONE new customer instead of leaving
 * an orphan that nothing maps (and whose payment would never reach Vibe+).
 */
async function createCustomer(stripe: Stripe, userId: string): Promise<string> {
  const params = { metadata: { vibe_user_id: userId } };
  let idempotencyKey = `vibe-customer-${userId}`;
  for (let i = 0; i <= MAX_REPLAYED_DELETED; i++) {
    const created = await stripe.customers.create(params, { idempotencyKey });
    if (created.lastResponse?.headers?.["idempotent-replayed"] !== "true") return created.id;
    if (!(await isDeletedCustomer(stripe, created.id))) return created.id;
    idempotencyKey = `vibe-customer-${userId}-after-${created.id}`;
  }
  // Not a setup problem (BillingConfigError would switch /plus to "not yet").
  throw new Error("This account's Stripe customer was deleted several times today");
}

/**
 * The account's Stripe customer in the key's mode, made on first use.
 * Mapping first; else create the customer and store the mapping. Losing a
 * race (another request stored a row first) means using the stored one.
 * Throws BillingConfigError when Stripe or the table isn't set up, and
 * BillingStoreError / Stripe errors on failure.
 */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const stripe = requireStripe();
  const livemode = stripeKeyLivemode();
  if (livemode === null) throw new BillingConfigError("The Stripe key's mode can't be told from its prefix");

  const { row, tableMissing } = await readMapping("user_id", userId);
  // Checking for a table before making a customer, so a missing migration
  // doesn't leave a customer in Stripe that nothing points at.
  if (tableMissing) throw new BillingConfigError("billing_customers does not exist yet");
  if (row && row.livemode === livemode) return row.stripe_customer_id;
  // A LIVE customer is never replaced by a test one. If a test key ever
  // reached production, replacing it would cut the only link to a real
  // subscription, and account deletion would stop cancelling it.
  if (row && row.livemode && !livemode) {
    throw new BillingConfigError("This account has a live Stripe customer; a test key can't replace it");
  }

  const customerId = await createCustomer(stripe, userId);
  const service = createSupabaseServiceClient();

  if (row) {
    // The stored customer is a test one left behind when the live key went
    // in. Replace it, but only if it is still the row we read; otherwise
    // another request got there first.
    const { data, error } = await service
      .from("billing_customers")
      .update({ stripe_customer_id: customerId, livemode })
      .eq("user_id", userId)
      .eq("stripe_customer_id", row.stripe_customer_id)
      .select("user_id");
    if (error) throw new BillingStoreError("billing_customers replace", error);
    if ((data ?? []).length > 0) return customerId;
  } else {
    const { error } = await service
      .from("billing_customers")
      .insert({ user_id: userId, stripe_customer_id: customerId, livemode });
    if (!error) return customerId;
    // 23505: a row for this account landed first. Anything else is a fault.
    if (error.code !== "23505") throw new BillingStoreError("billing_customers insert", error);
  }

  const { row: stored } = await readMapping("user_id", userId);
  if (stored && stored.livemode === livemode) return stored.stripe_customer_id;
  throw new BillingStoreError("billing_customers", { message: "the customer mapping could not be saved" });
}
