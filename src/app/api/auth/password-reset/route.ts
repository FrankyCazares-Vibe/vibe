import type { SupabaseClient } from "@supabase/supabase-js";
import { after, NextResponse } from "next/server";

import {
  firstRefusal,
  resetAddressLimits,
  resetHintLimit,
  resetNetworkLimit,
  resetRefusalCode,
  resetSendLimits,
  type ResetLimit,
  type ResetLimitResult,
} from "@/lib/auth/password-reset-limits";
import { normalizePersonalEmail } from "@/lib/auth/personal-email";
import { isRetiredIuDomain, normalizeSchoolEmail } from "@/lib/auth/school-email-domains";
import {
  hintCandidate,
  hintLookupKey,
  signinHintDecision,
  type HintLookup,
} from "@/lib/auth/signin-hint";
import { getSiteUrl } from "@/lib/auth/site-url";
import { isMissingColumnError } from "@/lib/db/missing-column";
import { recipientRateKey, redactAddresses } from "@/lib/email/send-log-core";
import {
  sendPasswordResetEmail,
  sendSigninHintEmail,
} from "@/lib/email/resend-transactional";
import { getActiveRestriction } from "@/lib/moderation/access";
import { clientNetworkCode, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createSupabaseServiceClient,
  isSupabaseServiceConfigured,
} from "@/lib/supabase/service";

type Body = { email?: string };

/** One ask of the shared limiter for a limit from password-reset-limits.ts. */
function hit(limit: ResetLimit) {
  return rateLimit(limit.key, limit);
}

/**
 * The 429 for a refused request. Its `code` says whether the count is spent
 * ("rate_limited") or the limiter couldn't count ("limiter_unavailable"), so
 * the forgot-password page words each one right; the same for an address
 * with or without an account.
 */
function refused(result: ResetLimitResult) {
  return tooManyRequests(result, undefined, resetRefusalCode(result));
}

/** A read that is skipped: the typed address cannot be in that column. */
const NO_ROWS = { data: [], error: null };

/** The columns of 20261008130000: missing on a database that file has not reached. */
const PERSONAL_EMAIL_COLUMNS = ["personal_email", "personal_email_verified_at"] as const;

/**
 * The "you sign in with a different email" note (Franky, Oct 13 2026; the
 * rule, the mask and the words are in src/lib/auth/signin-hint.ts).
 *
 * Reached only when no reset link could be made for the typed address. If
 * that address is the verified school email of exactly one account, or the
 * personal email one account added, a short note goes to THAT inbox: the
 * account signs in with a different email, "g•••@gmail.com", use that one.
 * 15 of the 20 accounts sign in with a different address than their school
 * email, and without this they typed the school one and got silence.
 *
 * Called from inside `after()`, so the answer has gone out already and
 * nothing here can change it or slow it down. It never throws.
 *
 * `users.school_email` and `users.personal_email` are private columns: read
 * here with the service client, each by exact match, never by a pattern,
 * and only when the typed address is already written the way the column
 * stores it. Any other spelling of it finds nobody and counts nothing.
 */
async function sendSigninNote(
  admin: SupabaseClient,
  email: string,
  emailKey: string,
): Promise<void> {
  try {
    // A retired IU domain (@iupui.edu and the rest) no longer receives mail.
    // A note there can only bounce, and a hard bounce counts against a small
    // sender, so it is not looked up at all.
    if (isRetiredIuDomain(email)) return;

    // How each column stores an address, kept only when that IS what was
    // typed (null: do not look in that column). "name@iu.edu." is stored as
    // "name@iu.edu" and shares its once-a-day count, so looking it up spent
    // the student's note for the day on a send to the dotted address
    // (`hintLookupKey` has the whole story).
    const schoolKey = hintLookupKey(email, normalizeSchoolEmail(email));
    const personalKey = hintLookupKey(email, normalizePersonalEmail(email));
    const [signIn, school, personal] = await Promise.all([
      admin.from("users").select("id").eq("email", email).limit(2),
      schoolKey
        ? admin.from("users").select("id, school_verified").eq("school_email", schoolKey).limit(2)
        : NO_ROWS,
      personalKey
        ? admin.from("users").select("id, personal_email_verified_at").eq("personal_email", personalKey).limit(2)
        : NO_ROWS,
    ]);
    // No personal-email columns yet means nobody has a personal email.
    const noPersonalColumns = isMissingColumnError(personal.error, PERSONAL_EMAIL_COLUMNS);
    const failed = signIn.error ?? school.error ?? (noPersonalColumns ? null : personal.error);
    if (failed) {
      // The code only: these reads were filtered on an address, and the
      // error text can carry it back.
      console.error("[auth/password-reset] sign-in note: lookup failed", failed.code ?? "");
      return;
    }
    const lookup: HintLookup = {
      signIn: signIn.data ?? [],
      school: school.data ?? [],
      personal: noPersonalColumns ? [] : (personal.data ?? []),
    };

    const candidate = hintCandidate(lookup);
    if (!candidate.ok) return;

    // The two things the rule still needs, for that one account only: is it
    // suspended or banned (no note then), and the address it signs in with,
    // asked of the sign-in system itself because that is where a reset goes.
    const [restriction, account] = await Promise.all([
      getActiveRestriction(candidate.userId),
      admin.auth.admin.getUserById(candidate.userId),
    ]);
    const decision = signinHintDecision({
      typed: email,
      lookup,
      restricted: restriction.ok ? restriction.restriction !== null : null,
      signInEmail: account.error ? null : (account.data?.user?.email ?? null),
    });
    if (decision.action !== "send") return;

    // One note a day for this address. Asked only now, when a note is really
    // about to go, and before the cap below, so a repeat stops here and
    // never counts against the reset emails. Quiet: a repeat is expected.
    if (await firstRefusal([resetHintLimit(emailKey)], hit)) return;

    // The note is one more email out of the cap on reset emails as a whole.
    if (await firstRefusal(resetSendLimits(), hit)) {
      console.warn(
        "[auth/password-reset] the cap on reset emails is spent, or the limiter is down: a sign-in note was not sent",
      );
      return;
    }

    // To the typed address and nowhere else. The account's id goes into the
    // send log, as it does for a reset email.
    await sendSigninHintEmail(email, decision.masked, decision.userId);
  } catch (err) {
    // Logged only, with any address taken out.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[auth/password-reset] sign-in note:", redactAddresses(message));
  }
}

/**
 * P1-006 — password reset via Resend: admin generateLink (recovery) + custom email.
 *
 * The email links to our own `/auth/update-password?token_hash=…&type=recovery`,
 * never to GoTrue's `action_link`. A plain GET on `action_link` spends the
 * one-time token, and mail scanners (Outlook Safe Links, Gmail) GET links
 * before the student taps them — 3 of the 8 "One-time token not found"
 * errors on 2026-09-14 were reset links. The page spends the token with
 * verifyOtp only when the student submits a new password, and it works in
 * any browser because no PKCE verifier is involved.
 *
 * Every non-config outcome returns the same constant body so the endpoint
 * cannot be used to enumerate which emails have accounts.
 *
 * Three limits (numbers and keys in src/lib/auth/password-reset-limits.ts),
 * because every reset email comes out of the daily email allowance sign-up
 * codes share: per network and per address before the answer (a 429, the
 * same for an address with or without an account), and a cap on reset emails
 * as a whole after it, which never changes the answer.
 *
 * An address no account signs in with gets no reset email. When it is an
 * account's school or personal email, that inbox gets the short note of
 * `sendSigninNote` above instead, at most once a day and out of the same
 * cap. The answer is the same sentence either way, and it has gone out
 * before any of that is looked up.
 */
export async function POST(req: Request) {
  const generic = {
    ok: true,
    message:
      "If an account exists for that email, you'll receive reset instructions shortly.",
  };

  // The network's scrambled code for the day, never the address (IPv6
  // counts by /64, so one device can't pick a new address for a fresh
  // count). Refuses when the limiter is down or there is no code, as the cap
  // below does, so neither is ever an open door to the email allowance.
  const perNetwork = await firstRefusal(
    [resetNetworkLimit(clientNetworkCode(req, "pw-reset-net"))],
    hit,
  );
  if (perNetwork) return refused(perNetwork);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json(generic);
  }

  // Keyed on a hash, never the address: public.rate_limits used to hold
  // every reset address in plaintext (the E1 migration deleted those rows).
  // Counted for every address typed, account or not, so the 429 says nothing
  // about who is on Vibe.
  const emailKey = recipientRateKey(email, process.env.SCHOOL_EMAIL_VERIFY_SECRET);
  const perAddress = await firstRefusal(resetAddressLimits(emailKey), hit);
  if (perAddress) return refused(perAddress);

  if (!isSupabaseServiceConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Password reset is not configured (missing SUPABASE_SERVICE_ROLE_KEY on server).",
      },
      { status: 503 },
    );
  }

  // Only a real account costs a generated link and an email send, so doing
  // them before answering made real accounts measurably slower to respond.
  // They run after the response instead: every answer above takes the same
  // path (the limits, validation), and nothing below can reach the caller.
  after(async () => {
    try {
      const admin = createSupabaseServiceClient();

      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      const hashedToken = data?.properties?.hashed_token;
      if (error || !hashedToken) {
        if (error) {
          console.error("[auth/password-reset] generateLink", error.message);
        }
        // No reset link: almost always because no account signs in with
        // this address. It may still be an account's school or personal
        // email, and then that inbox gets a note saying which one to type.
        await sendSigninNote(admin, email, emailKey);
        return;
      }

      // The cap on reset emails as a whole. Counted here and nowhere earlier:
      // only an address with an account gets this far, so requests for
      // addresses with no account can't spend it. The answer has already
      // gone out, so a spent cap looks the same to the caller as a send.
      // The link above is already made, so while the cap is spent an older
      // reset email for this address stops working with no new one sent.
      if (await firstRefusal(resetSendLimits(), hit)) {
        console.warn(
          "[auth/password-reset] the cap on reset emails is spent, or the limiter is down: a reset email was not sent",
        );
        return;
      }

      const resetUrl = `${getSiteUrl()}/auth/update-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
      // The user id goes into the send log (src/lib/email/send-log.ts). An
      // address with no account never gets here, so it never gets a row.
      await sendPasswordResetEmail(email, resetUrl, data?.user?.id ?? null);
    } catch (err) {
      // Logged only; the response has already gone out.
      const message = err instanceof Error ? err.message : String(err);
      console.error("[auth/password-reset]", message);
    }
  });

  return NextResponse.json(generic);
}
