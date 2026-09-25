import { NextResponse } from "next/server";

import { isMissingPushSchema, warnMissingPushSchemaOnce } from "@/lib/push/config";
import { addressFromBody } from "@/lib/push/device-address";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** A logout body is at most `{ push_address }`; anything bigger is ignored. */
const MAX_BODY_CHARS = 8192;

/**
 * The optional JSON body, or null. Every caller today posts no body at all,
 * so an empty, oversized or broken one is simply "nothing to add", never a 400:
 * signing out has to work whatever the page sends.
 */
async function optionalBody(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (!text || text.length > MAX_BODY_CHARS) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Forget the push devices that must stop showing this student's notifications
 * (handoffs/wave-plan-pwa/critic-push.md item 5):
 *
 * - EVERY device of the signed-in student, not just this one. `signOut()`
 *   below is global (auth-js defaults to scope "global"), so it also ends the
 *   session on the lab computer and the old phone; left registered, those
 *   would keep putting "Name: message text" on a lock screen nobody is
 *   signed in behind. The devices still in use register again on next open.
 * - The device this request came from (`push_address`), whoever it is
 *   registered to, signed in or not. Only the device itself holds that
 *   address, and it is saying it is signing out; a row still pointing at the
 *   previous student (a shared phone that never re-registered) must stop too.
 *   The answer is `{ ok: true }` either way, so it reveals nothing.
 *
 * Never throws and never fails the sign-out: a missing table (code ships
 * before the migration) is nothing to delete, and any other error is logged
 * by code only, never with an address.
 */
async function forgetPushDevices(userId: string | null, pushAddress: string | null) {
  if (!userId && !pushAddress) return;
  try {
    const service = createSupabaseServiceClient();
    const deletes = [];
    if (userId) deletes.push(service.from("push_devices").delete().eq("user_id", userId));
    if (pushAddress) deletes.push(service.from("push_devices").delete().eq("address", pushAddress));
    for (const { error } of await Promise.all(deletes)) {
      if (!error) continue;
      if (isMissingPushSchema(error)) warnMissingPushSchemaOnce("auth.logout");
      else console.error("[auth.logout] push devices", error.code);
    }
  } catch (err) {
    console.error("[auth.logout] push devices", err instanceof Error ? err.name : "unknown");
  }
}

/**
 * Sign the current user out. Idempotent — calling without a session is a
 * no-op success. The cookie session is cleared via the SSR helper so the
 * next page navigation lands on `/auth/login`.
 *
 * Optional body `{ push_address }`: this device's push endpoint or app token
 * (wave 3′'s client sends it). The push rows go BEFORE the sign-out, while we
 * still know whose they are.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  // Who is leaving. A GoTrue failure here must not block the sign-out itself:
  // it only means we can't name the student's devices.
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  await forgetPushDevices(userId, addressFromBody(await optionalBody(req), "push_address"));

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
