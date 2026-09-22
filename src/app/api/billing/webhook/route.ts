import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripeKeyLivemode, webhookSecretSet } from "@/lib/billing/config";
import {
  getStripe,
  logBillingError,
  shortBillingError,
  type BillingLogIds,
} from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

// Signature checks need the exact bytes Stripe sent, and the Stripe SDK needs
// Node. Nothing here may be cached or prerendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/billing/webhook — Stripe's only way in.
 *
 * Webhooks drive the Vibe+ entitlement: renewals, failed cards and
 * cancellations all happen long after checkout, so this is where they land.
 * No session cookie is involved: src/proxy.ts refreshes the (absent) session
 * and passes the request through with its body untouched.
 *
 * Every event is recorded in `billing_events` (service role; no payload, so
 * no personal data at rest) keyed by Stripe's event id, which makes retries
 * safe:
 *   - first delivery → row inserted, event handled, row stamped processed_at;
 *   - a retry of a PROCESSED event → 200 `duplicate: true`, nothing redone;
 *   - a retry of an event that failed before → handled again. processed_at is
 *     stamped ONLY on success: stamping a failure would turn every retry into
 *     a "duplicate" and lose the event for good.
 * A failure answers 500 so Stripe retries (for up to three days in live mode).
 *
 * Nothing about the request is ever logged — not the signature header, not
 * the body, not the secret — and the whole handler is wrapped so no error can
 * escape to the error reporter carrying any of them.
 */
const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status });

/**
 * Anyone can POST here, and the body is read in full before its signature can
 * be checked. Stripe events are a few KB, so a declared size far past that is
 * refused unread. Generous on purpose: a real event refused here would be
 * retried for days and then lost, so it is logged (the size only).
 */
const MAX_BODY_BYTES = 1024 * 1024;

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) return json({ error: "Missing signature" }, 400);

    const stripe = getStripe();
    // webhookSecretSet refuses a placeholder: .env.example's is public, and a
    // secret anyone knows would let anyone sign an event.
    const secret = webhookSecretSet() ? process.env.STRIPE_WEBHOOK_SECRET?.trim() : undefined;
    const keyLivemode = stripeKeyLivemode();
    if (!stripe || !secret || keyLivemode === null || !isSupabaseServiceConfigured()) {
      // 503, not 200: Stripe keeps the event and retries once we're set up.
      console.error("[billing] webhook: not configured");
      return json({ error: "Not configured" }, 503);
    }

    const declared = Number(req.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      console.error("[billing] webhook: body too large", { bytes: declared });
      return json({ error: "Payload too large" }, 413);
    }

    const body = await req.text();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
    } catch {
      // Says only that it happened: a burst of these means a wrong or rotated
      // STRIPE_WEBHOOK_SECRET (or someone knocking). Never the header or body.
      console.warn("[billing] webhook: signature check failed");
      return json({ error: "Invalid signature" }, 400);
    }

    const service = createSupabaseServiceClient();
    const objectId = eventObjectId(event);
    const ids: BillingLogIds = { eventId: event.id, type: event.type, objectId };

    const { error: insertErr } = await service.from("billing_events").insert({
      provider_event_id: event.id,
      type: event.type,
      livemode: event.livemode,
      object_id: objectId,
    });
    if (insertErr) {
      if (insertErr.code !== "23505") {
        logBillingError("webhook: record", ids, insertErr);
        return json({ error: "Request failed" }, 500);
      }
      // Seen before. Done only if an earlier delivery finished the job.
      const { data: prior, error: priorErr } = await service
        .from("billing_events")
        .select("processed_at")
        .eq("provider_event_id", event.id)
        .maybeSingle();
      if (priorErr) {
        logBillingError("webhook: read prior", ids, priorErr);
        return json({ error: "Request failed" }, 500);
      }
      if (prior?.processed_at) return json({ received: true, duplicate: true });
    }

    // A test event reaching a live key (or the reverse) is about objects this
    // key can't see. Keep the record, act on nothing, and don't make Stripe retry.
    if (event.livemode !== keyLivemode) {
      return finish(service, event.id, ids, { outcome: "ignored", userId: null, objectId });
    }

    let handled: Awaited<ReturnType<typeof handleStripeEvent>>;
    try {
      handled = await handleStripeEvent(event);
    } catch (err) {
      logBillingError("webhook: handle", ids, err);
      const { error: markErr } = await service
        .from("billing_events")
        .update({ outcome: "error", error: shortBillingError(err) })
        .eq("provider_event_id", event.id);
      if (markErr) logBillingError("webhook: mark error", ids, markErr);
      return json({ error: "Request failed" }, 500);
    }
    return finish(service, event.id, ids, {
      ...handled,
      objectId: handled.objectId ?? objectId,
    });
  } catch (err) {
    logBillingError("webhook", {}, err);
    return json({ error: "Request failed" }, 500);
  }
}

/** Stamp the event done. If the stamp fails, 500 → Stripe retries, and the
 *  handler is idempotent (it re-reads the subscription before every write). */
async function finish(
  service: ReturnType<typeof createSupabaseServiceClient>,
  eventId: string,
  ids: BillingLogIds,
  handled: { outcome: string; userId: string | null; objectId: string | null },
) {
  const { error } = await service
    .from("billing_events")
    .update({
      processed_at: new Date().toISOString(),
      outcome: handled.outcome,
      user_id: handled.userId,
      object_id: handled.objectId,
      error: null,
    })
    .eq("provider_event_id", eventId);
  if (error) {
    logBillingError("webhook: finish", ids, error);
    return json({ error: "Request failed" }, 500);
  }
  return json({ received: true });
}

/** The id of the object the event is about (sub_, cs_, in_, ch_, dp_…), if any. */
function eventObjectId(event: Stripe.Event): string | null {
  const id = (event.data?.object as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : null;
}
