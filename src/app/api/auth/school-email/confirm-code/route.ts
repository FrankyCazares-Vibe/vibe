import { NextResponse } from "next/server";

import { applySchoolEmailVerification } from "@/lib/auth/school-email-apply";
import {
  isSchoolVerifySecretConfigured,
  normalizeSchoolEmail,
  verifySchoolEmailCode,
} from "@/lib/auth/school-email-token";
import {
  clientNetworkKey,
  rateLimit,
  tooManyRequests,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseServiceConfigured } from "@/lib/supabase/service";

type Body = { schoolEmail?: string; code?: string };

const PER_USER_WINDOW_SEC = 900;
const PER_IP_WINDOW_SEC = 3600;

const TOO_MANY_TRIES =
  "Too many tries. Wait 15 minutes, or tap the link in the email while signed in.";
const TOO_MANY_FROM_NETWORK =
  "Lots of tries from this network. Try again later this hour, or tap the link in the email while you're signed in.";
const LIMITER_DOWN = "Couldn't check your code right now. Try again in a minute.";

/**
 * The 429 for a denied limiter. rateLimit reports a real limit hit with the
 * whole window as retryAfterSec, and its own failure (failClosed) with a
 * short 60s retry, so anything shorter than the window is "the limiter is
 * down", not "you tried too often".
 */
function denied(result: RateLimitResult, windowSec: number, limitCopy: string) {
  return tooManyRequests(
    result,
    result.retryAfterSec < windowSec ? LIMITER_DOWN : limitCopy,
  );
}

/**
 * P1-006 — verify the school email with the 8-digit code from the email instead of
 * the link, for students who read the email on another device or in an app
 * browser that isn't signed in to Vibe.
 *
 * Same trust model as confirm/route.ts: the code is bound to the signed-in
 * user id + address (school-email-token.ts), so a victim cannot verify an
 * attacker's account by accident — they would have to hand over the code.
 *
 * Order matters:
 * - 401 before any rate-limit write, so anonymous calls write nothing.
 * - Both limiters fail CLOSED: the code space is 10^8 and these limits are
 *   the only thing bounding guesses, so a DB hiccup must deny, not allow.
 * - The per-user limit is the real brute-force bound (a code only works for
 *   the account typing it). The per-network one is a backstop sized for a
 *   signup table on shared campus Wi-Fi, where one IPv4 address can be a
 *   whole room; IPv6 is bucketed by /64 so rotating addresses doesn't help.
 */
export async function POST(req: Request) {
  if (!isSchoolVerifySecretConfigured() || !isSupabaseServiceConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Server misconfiguration." },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const schoolEmail =
    typeof body.schoolEmail === "string"
      ? normalizeSchoolEmail(body.schoolEmail)
      : null;
  if (!schoolEmail) {
    return NextResponse.json(
      { ok: false, error: "Enter the school email you sent the code to." },
      { status: 400 },
    );
  }

  // Email apps and people paste "1234 5678" / "1234-5678"; anything else that
  // isn't exactly 8 digits after that is rejected before touching a limiter.
  const code =
    typeof body.code === "string" ? body.code.replace(/[\s-]/g, "") : "";
  if (!/^\d{8}$/.test(code)) {
    return NextResponse.json(
      { ok: false, error: "Enter the 8-digit code from the email." },
      { status: 400 },
    );
  }

  const perUser = await rateLimit(`school-code:${user.id}`, {
    limit: 5,
    windowSec: PER_USER_WINDOW_SEC,
    failClosed: true,
  });
  if (!perUser.allowed) {
    return denied(perUser, PER_USER_WINDOW_SEC, TOO_MANY_TRIES);
  }

  const perIp = await rateLimit(`school-code-ip:${clientNetworkKey(req)}`, {
    limit: 150,
    windowSec: PER_IP_WINDOW_SEC,
    failClosed: true,
  });
  if (!perIp.allowed) {
    return denied(perIp, PER_IP_WINDOW_SEC, TOO_MANY_FROM_NETWORK);
  }

  if (!verifySchoolEmailCode(user.id, schoolEmail, code)) {
    return NextResponse.json(
      {
        ok: false,
        code: "code_invalid",
        error: "That code didn't match. Check the newest email — codes work for 30 minutes.",
      },
      { status: 400 },
    );
  }

  const r = await applySchoolEmailVerification(user.id, schoolEmail);
  return NextResponse.json(r.body, { status: r.status });
}
