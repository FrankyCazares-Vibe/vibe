import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireNotRestricted } from "@/lib/moderation/access";
import {
  isMissingPushSchema,
  pushAllowedFor,
  pushSiteOrigin,
  warnMissingPushSchemaOnce,
} from "@/lib/push/config";
import {
  addressFromBody,
  isAllowedRegistrationRequest,
  parseDeviceRegistration,
} from "@/lib/push/device-address";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * This student's push devices: a browser's Web Push subscription or a store
 * app's FCM token (handoffs/wave-plan-pwa/plan.md §7 2B; critic-push.md items
 * 20-22). `push_devices` is service-role only, so both handlers write with the
 * service client, always filtered or stamped with the caller's own id.
 *
 * POST `{ transport, address, keys?: { p256dh, auth }, platform, app_version? }`
 * registers this device, or refreshes it: the client re-sends it on every open,
 * which is what keeps `last_seen_at` fresh (devices unseen for 60 days are
 * dropped by the sender). Upserted by `address`, so a shared device that
 * changes hands follows whoever registered it last.
 * Refusals, in order: 403 `wrong_origin` (not JSON, or not from the one origin
 * pushes are sent for; always on Preview) · 401 · 400 · 429 · 403
 * `terms_required` / `account_restricted` · 403 `push_unavailable` (push is off,
 * or this student isn't on the allowlist yet) · 503 `push_unavailable` (the
 * tables aren't there yet: code ships before the migration).
 *
 * DELETE `{ address }` removes one of the caller's devices. Gated by nothing
 * but sign-in and a rate limit, on purpose: a suspended student, or anyone
 * after push has been switched off, must still be able to stop notifications
 * (the proxy lets this one through for restricted accounts too). No table yet
 * means no row: `{ ok: true }`.
 *
 * NEVER LOG AN ADDRESS OR A KEY: an endpoint or token is a bearer capability to
 * reach this student's lock screen. Database errors are logged by code only,
 * because a constraint error's details carry the failing row.
 */
const REGISTER_LIMIT = { limit: 20, windowSec: 3600 };
const REMOVE_LIMIT = { limit: 30, windowSec: 3600 };
/** The newest this many devices per student are kept; older ones are dropped. */
const MAX_DEVICES = 10;
/** A real body is well under 3 KB (a token is at most 2048 characters). */
const MAX_BODY_CHARS = 8192;

const refuse = (status: number, code: string, error: string) =>
  NextResponse.json({ ok: false, code, error }, { status });

const pushUnavailable = (status: 403 | 503) =>
  refuse(status, "push_unavailable", "Notifications aren't available yet");

const failed = () => NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });

type JsonBody = { ok: true; body: unknown } | { ok: false; error: string };

async function readJson(req: Request): Promise<JsonBody> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  if (text.length > MAX_BODY_CHARS) return { ok: false, error: "Body too large" };
  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
}

async function signedInUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return error || !user ? null : user.id;
}

/**
 * Keep the newest MAX_DEVICES of this student's devices (by `last_seen_at`) and
 * drop the rest: a phone that was reset or a browser profile that was deleted
 * never says goodbye. The row just written is the newest, so it always stays.
 * Best effort: a failure here leaves an extra row, never a failed request.
 */
async function trimDevices(service: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await service
    .from("push_devices")
    .select("id")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(MAX_DEVICES, MAX_DEVICES + 49);
  if (error) {
    console.error("[push-devices.POST] trim read", error.code);
    return;
  }
  const ids = (data ?? []).map((row) => (row as { id: string }).id);
  if (ids.length === 0) return;
  const { error: delError } = await service
    .from("push_devices")
    .delete()
    .eq("user_id", userId)
    .in("id", ids);
  if (delError) console.error("[push-devices.POST] trim delete", delError.code);
}

export async function POST(req: Request) {
  // Before anything else: this write means "send this student's private
  // messages to that address", so it has to come from our own page (critic-
  // push.md item 21). Null off production and local dev, so Preview, which
  // shares the production database, can never register a device.
  const siteOrigin = pushSiteOrigin(process.env);
  const sameSite = isAllowedRegistrationRequest(
    { contentType: req.headers.get("content-type"), origin: req.headers.get("origin") },
    siteOrigin,
  );
  if (!sameSite || !siteOrigin) {
    return refuse(403, "wrong_origin", "Notifications can only be turned on from Vibe itself");
  }

  const userId = await signedInUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const json = await readJson(req);
  if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: 400 });
  const parsed = parseDeviceRegistration(json.body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const device = parsed.device;

  const rl = await rateLimit(`push-devices:${userId}`, REGISTER_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many notification changes. Try again later.");

  // Terms and restriction in one read (requireNotRestricted includes the
  // Terms check, so requireTermsAccepted would only read consent twice).
  const gate = await requireNotRestricted(userId);
  if (gate) return gate;
  if (!pushAllowedFor(userId, process.env)) return pushUnavailable(403);

  const service = createSupabaseServiceClient();
  // `created_at`, `id` and `last_ok_at` aren't named, so a refresh keeps them.
  // `failures` starts over: the device just proved it is alive.
  const { error } = await service.from("push_devices").upsert(
    {
      user_id: userId,
      transport: device.transport,
      address: device.address,
      p256dh: device.p256dh,
      auth: device.auth,
      platform: device.platform,
      app_version: device.appVersion,
      origin: siteOrigin,
      last_seen_at: new Date().toISOString(),
      failures: 0,
    },
    { onConflict: "address" },
  );
  if (error) {
    if (isMissingPushSchema(error)) {
      warnMissingPushSchemaOnce("push-devices");
      return pushUnavailable(503);
    }
    console.error("[push-devices.POST] upsert", error.code);
    return failed();
  }

  await trimDevices(service, userId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const userId = await signedInUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const json = await readJson(req);
  if (!json.ok) return NextResponse.json({ ok: false, error: json.error }, { status: 400 });
  const address = addressFromBody(json.body, "address");
  if (!address) return NextResponse.json({ ok: false, error: "Missing address" }, { status: 400 });

  // Its own bucket: a busy day of re-registering must never stop a student
  // from turning notifications off.
  const rl = await rateLimit(`push-devices-remove:${userId}`, REMOVE_LIMIT);
  if (!rl.allowed) return tooManyRequests(rl, "Too many notification changes. Try again later.");

  // Only the caller's own row: an address someone else holds is left alone,
  // and the answer is the same either way, so it reveals nothing.
  const { error } = await createSupabaseServiceClient()
    .from("push_devices")
    .delete()
    .eq("user_id", userId)
    .eq("address", address);
  if (error) {
    if (isMissingPushSchema(error)) {
      warnMissingPushSchemaOnce("push-devices");
      return NextResponse.json({ ok: true });
    }
    console.error("[push-devices.DELETE]", error.code);
    return failed();
  }
  return NextResponse.json({ ok: true });
}
