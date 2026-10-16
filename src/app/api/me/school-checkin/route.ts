import { NextResponse } from "next/server";

import { checkinCode, checkinStage, verifyCheckinCode, type CheckinRow } from "@/lib/auth/school-checkin";
import { isSchoolVerifySecretConfigured } from "@/lib/auth/school-email-token";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { sendSchoolCheckinEmail } from "@/lib/email/resend-transactional";
import { clientNetworkCode, rateLimit, tooManyRequests, type RateLimitResult } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase/service";

/**
 * /api/me/school-checkin — the person's side of the yearly school check-in
 * (src/lib/auth/school-checkin.ts). The dates are private columns
 * (20261008140000): every read and write is here, service role, scoped to
 * the session's user.
 *
 *   GET            { ok, open, stage, deadline }
 *                  `open`: a check-in is waiting for its code. `deadline`:
 *                  the countdown's last day (ISO) once it runs, else null.
 *   POST { code }  → answers the check-in: fine for another year.
 *   PUT            → emails the code again, to the school address.
 *
 * Adding a personal email (PUT /api/me/personal-email) ends a check-in too.
 */

const TAG = "me/school-checkin";
const NO_STORE = { "cache-control": "no-store" } as const;
const COLUMNS = "email, school_verified, personal_email, created_at, school_confirmed_at, school_checkin_sent_at, school_grace_ends_at";
const MISSING = ["school_confirmed_at", "school_checkin_sent_at", "school_grace_ends_at", "personal_email"] as const;

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const fail = (status: number, code: string, error: string) => json({ ok: false, code, error }, status);
const NOTHING = { ok: true, open: false, stage: "exempt", deadline: null };

/** Every limit here fails closed: when the limiter can't count, these say so, not "you've asked too often". */
const SEND_DOWN = "Couldn't send the code right now. Try again in a minute.";
const CHECK_DOWN = "Couldn't check your code right now. Try again in a minute.";

/** The 429 for a refused limit: `limitCopy` when the count is spent, `downCopy` when the limiter couldn't count. */
function denied(result: RateLimitResult, limitCopy: string, downCopy: string) {
  return tooManyRequests(result, result.reason === "unavailable" ? downCopy : limitCopy);
}

/** The wait actually left, as the Retry-After header says it (rounded up to whole minutes). */
function waitLeft(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

async function load(): Promise<{ userId: string; row: CheckinRow } | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return fail(401, "unauthorized", "Unauthorized");
  if (!isSupabaseServiceConfigured()) return json(NOTHING);
  const { data, error } = await createSupabaseServiceClient().from("users").select(COLUMNS).eq("id", user.id).maybeSingle();
  if (error) {
    if (isMissingColumnError(error, MISSING)) return json(NOTHING);
    console.error(`[${TAG}]`, error.code, error.message);
    return fail(500, "request_failed", "Request failed");
  }
  if (!data) return json(NOTHING);
  return { userId: user.id, row: data as unknown as CheckinRow };
}

const isOpen = (stage: string) => stage === "waiting" || stage === "overdue" || stage === "grace" || stage === "expired";

export async function GET() {
  const me = await load();
  if (me instanceof NextResponse) return me;
  const stage = checkinStage(me.row, new Date());
  return json({ ok: true, open: isOpen(stage), stage, deadline: me.row.school_grace_ends_at ?? null });
}

export async function POST(req: Request) {
  const me = await load();
  if (me instanceof NextResponse) return me;
  if (!isSchoolVerifySecretConfigured()) return fail(503, "not_available", "Couldn't check your code right now.");
  const sentAt = me.row.school_checkin_sent_at;
  if (!isOpen(checkinStage(me.row, new Date())) || !sentAt || !me.row.email) {
    return fail(400, "nothing_open", "There's no check-in waiting on your account.");
  }

  let body: { code?: unknown } = {};
  try {
    body = (await req.json()) as { code?: unknown };
  } catch {
    return fail(400, "invalid_json", "Invalid JSON");
  }
  const code = typeof body?.code === "string" ? body.code.replace(/[\s-]/g, "") : "";
  if (!/^\d{8}$/.test(code)) return fail(400, "code_shape", "Enter the 8-digit code from the email.");

  // The only bound on guesses (10^8 codes): both fail closed. The lockout
  // says the minutes actually left (windows start on the quarter hour).
  const perUser = await rateLimit(`school-checkin-code:${me.userId}`, { limit: 5, windowSec: 900, failClosed: true });
  if (!perUser.allowed) return denied(perUser, `Too many tries. Wait ${waitLeft(perUser.retryAfterSec)}, then try again.`, CHECK_DOWN);
  // Per network, on the network's scrambled code for the day, never the
  // address. No code (no secret) refuses, as a limiter that's down does.
  const netCode = clientNetworkCode(req, "school-checkin-code-net");
  const perNet = await rateLimit(netCode === null ? null : `school-checkin-code-net:${netCode}`, { limit: 150, windowSec: 3600, failClosed: true });
  if (!perNet.allowed) return denied(perNet, "Lots of tries from this network. Try again later this hour.", CHECK_DOWN);

  if (!verifyCheckinCode(me.userId, me.row.email, sentAt, code)) {
    return fail(400, "code_invalid", "That code didn't match. Use the newest email from Vibe to your school address.");
  }
  const { error } = await createSupabaseServiceClient()
    .from("users")
    .update({ school_confirmed_at: new Date().toISOString(), school_checkin_sent_at: null, school_grace_ends_at: null })
    .eq("id", me.userId);
  if (error) {
    console.error(`[${TAG} POST]`, error.code, error.message);
    return fail(500, "request_failed", "Request failed");
  }
  return json({ ok: true, open: false, stage: "ok", deadline: null });
}

export async function PUT(req: Request) {
  const me = await load();
  if (me instanceof NextResponse) return me;
  if (!isSchoolVerifySecretConfigured()) return fail(503, "not_available", "Couldn't send the code right now.");
  const sentAt = me.row.school_checkin_sent_at;
  if (!isOpen(checkinStage(me.row, new Date())) || !sentAt || !me.row.email) {
    return fail(400, "nothing_open", "There's no check-in waiting on your account.");
  }
  const perUser = await rateLimit(`school-checkin-send:${me.userId}`, { limit: 3, windowSec: 86_400, failClosed: true });
  if (!perUser.allowed) {
    return denied(perUser, "We've sent it a few times today. Try again tomorrow, or add a personal email instead.", SEND_DOWN);
  }
  const netCode = clientNetworkCode(req, "school-checkin-send-net");
  const perNet = await rateLimit(netCode === null ? null : `school-checkin-send-net:${netCode}`, { limit: 40, windowSec: 3600, failClosed: true });
  if (!perNet.allowed) return denied(perNet, "Lots of requests from this network. Try again later.", SEND_DOWN);
  try {
    // The same code as the first email: one per check-in.
    await sendSchoolCheckinEmail(me.row.email, checkinCode(me.userId, me.row.email, sentAt), "checkin", null, me.userId);
  } catch (err) {
    console.error(`[${TAG} PUT]`, err instanceof Error ? err.message.slice(0, 120) : "failed");
    return fail(502, "send_failed", "We couldn't send the code. Try again in a minute.");
  }
  return json({ ok: true, sent: true });
}
