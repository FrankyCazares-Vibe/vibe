import { NextResponse } from "next/server";

import { isMissingPushSchema, warnMissingPushSchemaOnce } from "@/lib/push/config";
import { addressFromBody } from "@/lib/push/device-address";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * /api/me/sessions — Settings' "Where you're signed in" card
 * (handoffs/2026-10-11-browser-rule-plan.md). Franky, Oct 11: no Supabase
 * Pro, so sign-ins never time out on their own; this is the student's way to
 * end the ones they forgot.
 *
 *   GET     { ok, count }  how many sign-ins this account has open
 *           (`public.my_session_count()`, 20261011100000). One per sign-in,
 *           not per device, so the card says "sign-ins". `count` is null
 *           while the function is missing or not callable (code ships first).
 *   DELETE  { push_address? } → ends every sign-in except this one
 *           (auth-js `signOut({ scope: "others" })`) and forgets the push
 *           devices that go with them.
 *
 * A restricted student may still DELETE (src/proxy.ts restrictedApiAllowed):
 * ending your own other sign-ins only protects you, like block and mute.
 */

const TAG = "me/sessions";
const NO_STORE = { "cache-control": "no-store" } as const;
/** The DELETE body is at most `{ push_address }`; anything bigger is ignored. */
const MAX_BODY_CHARS = 8192;
const SIGNOUT_FAILED = "Couldn't sign out your other devices.";

/**
 * "The function isn't there (yet)" and "it's there but can't be called":
 * PGRST202 PostgREST's schema cache has no such function; 42883 Postgres has
 * no such function; 42501 permission denied, i.e. it was created by a role
 * that can't read auth.sessions (skeptic amendment 5). All three mean "no
 * number today", not a failure worth an error log on every Settings open.
 */
const MISSING_FN_CODES = new Set(["PGRST202", "42883", "42501"]);
const warnedCodes = new Set<string>();

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const fail = (status: number, code: string, error: string) => json({ ok: false, code, error }, status);

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  if (error.code && MISSING_FN_CODES.has(error.code)) return true;
  return (error.message ?? "").toLowerCase().includes("could not find the function");
}

/** Once per code per server instance: the card asks on every Settings open. */
function warnMissingOnce(code: string) {
  if (warnedCodes.has(code)) return;
  warnedCodes.add(code);
  console.warn(`[${TAG} GET] my_session_count unavailable (${code}); answering count: null until 20261011100000 is applied as postgres`);
}

/**
 * The optional JSON body, or null, with /api/auth/logout's tolerance: an
 * empty, oversized or broken body is "no address", never a 400.
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
 * Forget the push devices of the sign-ins that are about to end: every row
 * of this student's except this device's own (`keepAddress`). With no
 * address, all of them go, and this device registers again on its next open,
 * exactly as after /api/auth/logout. Left in place, a signed-out lab computer
 * would keep putting "Name: message text" on its screen.
 *
 * Never throws and never blocks the sign-out: a missing table (code before
 * migration) is nothing to delete, and errors are logged by code only, never
 * with an address.
 */
async function forgetOtherPushDevices(userId: string, keepAddress: string | null) {
  try {
    let query = createSupabaseServiceClient().from("push_devices").delete().eq("user_id", userId);
    if (keepAddress) query = query.neq("address", keepAddress);
    const { error } = await query;
    if (!error) return;
    if (isMissingPushSchema(error)) warnMissingPushSchemaOnce(`${TAG} DELETE`);
    else console.error(`[${TAG} DELETE] push devices`, error.code);
  } catch (err) {
    console.error(`[${TAG} DELETE] push devices`, err instanceof Error ? err.name : "unknown");
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return fail(401, "unauthorized", "Unauthorized");

  const { data, error } = await supabase.rpc("my_session_count");
  if (error) {
    if (isMissingFunction(error)) {
      warnMissingOnce(error.code || "missing");
      return json({ ok: true, count: null });
    }
    console.error(`[${TAG} GET]`, error.code, error.message);
    return fail(500, "request_failed", "Request failed");
  }
  const n = typeof data === "number" ? data : Number(data);
  // The caller is signed in, so at least this sign-in exists: anything below
  // 1 (or not a number) is a reading we can't trust, shown as "couldn't count".
  return json({ ok: true, count: Number.isInteger(n) && n >= 1 ? n : null });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return fail(401, "unauthorized", "Unauthorized");

  // Cost control, not a security boundary: fail-open like the other limits.
  const limited = await rateLimit(`sessions:others:${user.id}`, { limit: 10, windowSec: 3600 });
  if (!limited.allowed) return tooManyRequests(limited, "You've done that a few times. Try again in an hour.");

  // Push rows first, while the other sign-ins still exist: a failed sign-out
  // below then costs those devices only a re-register on their next open.
  await forgetOtherPushDevices(user.id, addressFromBody(await optionalBody(req), "push_address"));

  // scope "others" revokes every other refresh token and keeps this cookie
  // session as it is (no SIGNED_OUT, nothing removed here). Their access
  // tokens still work until they expire, at most about an hour: the same
  // window the Sign out card already states.
  //
  // Known and accepted: auth-js swallows a 401/403/404 from GoTrue on this
  // call and answers error: null, so if this very token was revoked between
  // getUser() above and now (a global sign-out landing from another device),
  // the answer is ok and nothing was revoked. The card re-reads the count
  // straight after, so the number on screen is right even then.
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    console.error(`[${TAG} DELETE] signOut`, error.status ?? "", error.code ?? error.name);
    return fail(502, "signout_failed", SIGNOUT_FAILED);
  }
  return json({ ok: true });
}
