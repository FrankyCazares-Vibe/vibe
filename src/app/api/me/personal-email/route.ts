import { NextResponse } from "next/server";

import {
  isSchoolAddress,
  normalizePersonalEmail,
  personalEmailCode,
  verifyPersonalEmailCode,
} from "@/lib/auth/personal-email";
import { isSchoolVerifySecretConfigured } from "@/lib/auth/school-email-token";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { sendPersonalEmailCodeEmail } from "@/lib/email/resend-transactional";
import { clientNetworkKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

/**
 * /api/me/personal-email — the personal address an account can add after
 * sign-up (school email first, S75): "so you keep your account after you
 * graduate". Private: `users.personal_email` has no client grant
 * (20261008130000), so every read and write is here, service role, scoped to
 * the session's user.
 *
 *   GET     { ok, available, personal_email, suggested }
 *           `available` false until the columns exist. `suggested`: the
 *           sign-in email is a school address and no personal one is set,
 *           which is when the app offers the step.
 *   POST    { email }        → emails an 8-digit code to it. Answers ok and
 *           sends NOTHING when another account already uses the address, so
 *           the route never says whose an address is.
 *   PUT     { email, code }  → stores the address, proven.
 *   DELETE                   → removes it.
 *
 * Only a proven address is ever stored. Nothing here changes how the account
 * signs in.
 */

const TAG = "me/personal-email";
/** The columns of 20261008130000: missing until that file is applied. */
const COLUMNS = ["personal_email", "personal_email_verified_at"] as const;
const NO_STORE = { "cache-control": "no-store" } as const;
const NOT_YET = "Adding a personal email isn't available yet.";
const SEND_WINDOW_SEC = 3600;
const TRY_WINDOW_SEC = 900;

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const fail = (status: number, code: string, error: string) => json({ ok: false, code, error }, status);

async function signedIn() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return error || !user ? null : user;
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const user = await signedIn();
  if (!user) return fail(401, "unauthorized", "Unauthorized");
  if (!isSupabaseServiceConfigured()) return json({ ok: true, available: false, personal_email: null, suggested: false });

  const { data, error } = await createSupabaseServiceClient()
    .from("users")
    .select("personal_email")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error, COLUMNS)) return json({ ok: true, available: false, personal_email: null, suggested: false });
    console.error(`[${TAG} GET]`, error.code, error.message);
    return fail(500, "request_failed", "Request failed");
  }
  const personal = typeof data?.personal_email === "string" ? data.personal_email : null;
  return json({
    ok: true,
    available: true,
    personal_email: personal,
    suggested: !personal && !!user.email && isSchoolAddress(user.email),
  });
}

export async function POST(req: Request) {
  const user = await signedIn();
  if (!user) return fail(401, "unauthorized", "Unauthorized");
  if (!isSchoolVerifySecretConfigured() || !isSupabaseServiceConfigured()) return fail(503, "not_available", NOT_YET);

  const body = await readBody(req);
  const email = normalizePersonalEmail(body?.email);
  if (!email) return fail(400, "invalid_email", "That doesn't look like an email address.");
  if (isSchoolAddress(email)) {
    return fail(400, "school_email", "That's a school email. Add a personal one, like Gmail or iCloud: it's the one you keep after you graduate.");
  }
  if (email === (user.email ?? "").trim().toLowerCase()) {
    return fail(400, "same_as_sign_in", "That's already the email you sign in with.");
  }

  const perUser = await rateLimit(`personal-email-send:${user.id}`, { limit: 5, windowSec: SEND_WINDOW_SEC, failClosed: true });
  if (!perUser.allowed) return tooManyRequests(perUser, "You've asked for a few codes. Try again in an hour.");
  const perNet = await rateLimit(`personal-email-send-net:${clientNetworkKey(req)}`, { limit: 40, windowSec: SEND_WINDOW_SEC, failClosed: true });
  if (!perNet.allowed) return tooManyRequests(perNet, "Lots of requests from this network. Try again later.");

  // Is the address someone else's already? Each matched with `.eq`, never
  // inside an `in.(…)` list. The answer below is the same either way.
  const service = createSupabaseServiceClient();
  const [asSignIn, asPersonal] = await Promise.all([
    service.from("users").select("id").eq("email", email).neq("id", user.id).limit(1),
    service.from("users").select("id").eq("personal_email", email).neq("id", user.id).limit(1),
  ]);
  if (asPersonal.error && isMissingColumnError(asPersonal.error, COLUMNS)) return fail(503, "not_available", NOT_YET);
  if (asSignIn.error || asPersonal.error) {
    console.error(`[${TAG} POST lookup]`, (asSignIn.error ?? asPersonal.error)?.code);
    return fail(500, "request_failed", "Request failed");
  }
  const taken = (asSignIn.data?.length ?? 0) > 0 || (asPersonal.data?.length ?? 0) > 0;
  if (!taken) {
    try {
      await sendPersonalEmailCodeEmail(email, personalEmailCode(user.id, email), user.id);
    } catch (err) {
      console.error(`[${TAG} POST send]`, err instanceof Error ? err.message : "failed");
      return fail(502, "send_failed", "We couldn't send the code. Try again in a minute.");
    }
  }
  return json({ ok: true, sent: true });
}

export async function PUT(req: Request) {
  const user = await signedIn();
  if (!user) return fail(401, "unauthorized", "Unauthorized");
  if (!isSchoolVerifySecretConfigured() || !isSupabaseServiceConfigured()) return fail(503, "not_available", NOT_YET);

  const body = await readBody(req);
  const email = normalizePersonalEmail(body?.email);
  if (!email || isSchoolAddress(email)) return fail(400, "invalid_email", "Enter the personal email you sent the code to.");
  const code = typeof body?.code === "string" ? body.code.replace(/[\s-]/g, "") : "";
  if (!/^\d{8}$/.test(code)) return fail(400, "code_shape", "Enter the 8-digit code from the email.");

  // The only bound on guesses (10^8 codes): both fail closed.
  const perUser = await rateLimit(`personal-email-code:${user.id}`, { limit: 5, windowSec: TRY_WINDOW_SEC, failClosed: true });
  if (!perUser.allowed) return tooManyRequests(perUser, "Too many tries. Wait 15 minutes, then ask for a new code.");
  const perNet = await rateLimit(`personal-email-code-net:${clientNetworkKey(req)}`, { limit: 150, windowSec: 3600, failClosed: true });
  if (!perNet.allowed) return tooManyRequests(perNet, "Lots of tries from this network. Try again later this hour.");

  if (!verifyPersonalEmailCode(user.id, email, code)) {
    return fail(400, "code_invalid", "That code didn't match. Check the newest email: codes work for 30 minutes.");
  }

  const { error } = await createSupabaseServiceClient()
    .from("users")
    .update({ personal_email: email, personal_email_verified_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    if (isMissingColumnError(error, COLUMNS)) return fail(503, "not_available", NOT_YET);
    // Another account proved the same address first (users_personal_email_key).
    if (error.code === "23505") return fail(409, "not_added", "That address can't be added. Try another one.");
    console.error(`[${TAG} PUT]`, error.code, error.message);
    return fail(500, "request_failed", "Request failed");
  }
  return json({ ok: true, personal_email: email });
}

export async function DELETE() {
  const user = await signedIn();
  if (!user) return fail(401, "unauthorized", "Unauthorized");
  if (!isSupabaseServiceConfigured()) return fail(503, "not_available", NOT_YET);
  const { error } = await createSupabaseServiceClient()
    .from("users")
    .update({ personal_email: null, personal_email_verified_at: null })
    .eq("id", user.id);
  if (error) {
    if (isMissingColumnError(error, COLUMNS)) return fail(503, "not_available", NOT_YET);
    console.error(`[${TAG} DELETE]`, error.code, error.message);
    return fail(500, "request_failed", "Request failed");
  }
  return json({ ok: true, personal_email: null });
}
