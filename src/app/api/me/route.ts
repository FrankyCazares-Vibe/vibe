import { NextResponse } from "next/server";

import { stripeKeyLivemode } from "@/lib/billing/config";
import { billingCustomerForUser } from "@/lib/billing/customers";
import {
  getStripe,
  isStripeResourceMissing,
  logBillingError,
} from "@/lib/billing/stripe";
import { purgeUserUploads, type PurgeResult } from "@/lib/profile/storage-purge";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DeleteBody = { confirm_handle?: unknown };

/**
 * Permanent account deletion. Required for legal compliance with .edu
 * email hosting + lets users exercise the right-to-be-forgotten.
 *
 * Flow:
 *   1. Verify the signed-in user.
 *   2. Require `confirm_handle` to match the user's actual handle — guards
 *      against accidental double-clicks and confused-deputy attacks (a
 *      malicious site can't trigger this without knowing the handle).
 *   3. Stop Vibe+ billing (Stripe v1): if we ever made this account a Stripe
 *      customer, delete that customer, which cancels every subscription at
 *      once with no refund. This comes before anything is removed so a
 *      deleted account can never go on being charged: if Stripe can't
 *      confirm it, we return 503 and delete nothing. A customer that is
 *      already gone counts as done, and a test-mode customer the key can't
 *      reach is skipped (it can't charge real money). See
 *      stopVibePlusBilling below.
 *   4. Purge every object the user uploaded (S53 A4): `profiles/<uid>/**`
 *      (avatar, banner, posts/, posters/, logos/), the private
 *      `resumes/<uid>/**` (originals + redacted/ derivatives), R2
 *      `clips/<uid>/*` and every R2 `messages/<channelId>/<file>` object
 *      referenced by the user's own `messages.media_url` rows (inline chat
 *      uploads live under the channel, so they are looked up by row, not
 *      by prefix — and they must be looked up BEFORE step 5 cascades the
 *      rows away). Deleting the auth user only cascades DB rows, so
 *      without this step the files would stay readable forever. If the
 *      purge throws we return 500 and DO NOT delete the account — the
 *      purge is idempotent, so the user simply retries.
 *   5. Delete the auth user via the service role. The `users` row +
 *      everything that references it (posts, connections, reactions,
 *      messages, terms_acceptances, …) cascade via the existing FK
 *      constraints. If THIS step fails the files are already gone; the
 *      500 says so and asks the user to retry (the purge then finds
 *      nothing and the deletion proceeds).
 *   6. Sign the cookie session out so the next request goes to /login.
 *
 * Response: `{ ok: true, purged: { profiles, resumes, clips, messageMedia } }`
 * with the object counts removed from each location.
 */
export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const confirm =
    typeof body.confirm_handle === "string" ? body.confirm_handle.trim().toLowerCase() : "";
  if (!confirm) {
    return NextResponse.json(
      { ok: false, error: "Type your handle to confirm" },
      { status: 400 },
    );
  }

  const { data: row, error: lookupErr } = await supabase
    .from("users")
    .select("handle")
    .eq("id", user.id)
    .maybeSingle();
  if (lookupErr) {
    console.error("[me.DELETE lookup]", lookupErr);
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }
  const actualHandle = String(row?.handle ?? "").trim().toLowerCase();
  if (!actualHandle || confirm !== actualHandle) {
    return NextResponse.json(
      { ok: false, error: "Handle confirmation didn't match" },
      { status: 400 },
    );
  }

  if (!isSupabaseServiceConfigured()) {
    console.error("[me.DELETE] missing SUPABASE_SERVICE_ROLE_KEY");
    return NextResponse.json(
      { ok: false, error: "Account deletion not configured" },
      { status: 500 },
    );
  }

  const billingStop = await stopVibePlusBilling(user.id);
  if (billingStop instanceof NextResponse) return billingStop;
  const vibePlusClosed = billingStop;

  // Files first, account second: once the auth user is gone we have no
  // handle on the uploads any more, so a purge failure must abort here.
  let purged: PurgeResult;
  try {
    purged = await purgeUserUploads(user.id);
  } catch (e) {
    console.error("[me.DELETE purgeUserUploads]", e);
    return NextResponse.json(
      {
        ok: false,
        // Once a Vibe+ subscription is closed, "nothing was deleted" would be
        // false: say what did happen.
        error: vibePlusClosed
          ? "Your Vibe+ subscription is canceled, but we couldn't remove your uploaded files, so your account is still here. Please try again."
          : "Couldn't remove your uploaded files. Nothing was deleted — please try again.",
      },
      { status: 500 },
    );
  }

  // Service role required: deleting an auth user is admin-scope.
  // The public.users row + all FK-cascaded content (posts, connections,
  // reactions, reposts, channel memberships, etc.) drop with it.
  const admin = createSupabaseServiceClient();
  const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
  if (deleteErr) {
    console.error("[me.DELETE auth.admin.deleteUser]", { purged, error: deleteErr });
    return NextResponse.json(
      {
        ok: false,
        error:
          "Your uploaded files were removed, but the account itself couldn't be deleted. Please try again — the retry will finish the deletion.",
        purged,
      },
      { status: 500 },
    );
  }

  await supabase.auth.signOut();

  return NextResponse.json({ ok: true, purged });
}

const BILLING_NOT_CLOSED =
  "We couldn't close your Vibe+ subscription, so your account wasn't deleted. Try again in a few minutes.";

/**
 * Step 3: make sure a deleted account can't go on being charged. Returns the
 * 503 to send, or whether a Stripe customer is now closed (true) or there was
 * nothing to close (false) when deletion may go ahead.
 *
 * `customers.del` cancels every subscription the customer has, immediately
 * and with no refund, and Stripe keeps its own records of past payments.
 *
 * Fails CLOSED, with two known exceptions:
 *   - Production runs this before the billing tables exist: the helper
 *     reports a missing billing_customers table as "no customer", and an
 *     account that never checked out has nothing to stop.
 *   - A TEST-mode customer the key can't reach (no key, or the live key once
 *     it is in): test customers only ever pay with test cards, so no real
 *     money can move. Stripe keeps it in the sandbox and our row goes with
 *     the account. Refusing here would block the deletion for good.
 * Every other doubt keeps the account:
 *   - the lookup failed → we don't know whether they pay;
 *   - a LIVE customer with no key or a non-live key → the delete would come
 *     back "no such customer" and a live subscription would keep charging a
 *     deleted account;
 *   - any Stripe failure other than "already gone" in the matching mode.
 * The SettingsClient delete screen shows `error`, so the student reads the
 * sentence and can retry.
 */
async function stopVibePlusBilling(userId: string): Promise<NextResponse | boolean> {
  const notClosed = () =>
    NextResponse.json({ ok: false, error: BILLING_NOT_CLOSED }, { status: 503 });

  let customer: Awaited<ReturnType<typeof billingCustomerForUser>>;
  try {
    customer = await billingCustomerForUser(userId);
  } catch (e) {
    logBillingError("me.DELETE: customer lookup", {}, e);
    return notClosed();
  }
  if (!customer) return false;

  const stripe = getStripe();
  const keyLivemode = stripeKeyLivemode();
  if (!stripe || customer.livemode !== keyLivemode) {
    if (!customer.livemode) return false;
    console.error("[me.DELETE billing] no live Stripe key for this live customer", {
      customerLivemode: customer.livemode,
      keyLivemode,
    });
    return notClosed();
  }

  try {
    await stripe.customers.del(customer.customerId);
  } catch (e) {
    // Deleted earlier (a retry after a later step failed, or by hand in the
    // Dashboard): its subscriptions went with it.
    if (isStripeResourceMissing(e)) return true;
    logBillingError("me.DELETE: customers.del", {}, e);
    return notClosed();
  }
  return true;
}
