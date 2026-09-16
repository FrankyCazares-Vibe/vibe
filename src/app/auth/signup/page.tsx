"use client";

import {
  isAuthRetryableFetchError,
  isAuthWeakPasswordError,
  type AuthError,
} from "@supabase/supabase-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ConfirmCodeForm } from "@/components/auth/ConfirmCodeForm";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import {
  getAuthEmailCallbackUrl,
  getBrowserSiteOrigin,
} from "@/lib/auth/email-confirm-redirect";
import { parseRetryAfterSeconds } from "@/lib/auth/email-link-errors";
import {
  clearPendingSignup,
  rememberPendingSignup,
} from "@/lib/auth/pending-signup";
import { isSchoolEmail } from "@/lib/auth/school-email-domains";
import {
  MIN_AGE,
  TERMS_METADATA_KEYS,
  TERMS_VERSION,
} from "@/lib/legal/terms";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Cap enforced on submit, never via maxLength (which truncates silently). */
const MAX_PASSWORD_LENGTH = 20;

/** GoTrue's per-address resend cooldown. */
const RESEND_COOLDOWN_SEC = 60;

const OFFLINE = "We couldn't reach Vibe. Check your connection and try again.";
const EMAIL_CAP =
  "We can't send confirmation emails right now. Try again in a few minutes.";
const TOO_MANY_TRIES =
  "Too many tries from this network. Wait a few minutes, then try again.";
const BAD_ADDRESS =
  "That email address doesn't look right. Check it for typos.";
const WEAK_PASSWORD =
  "Pick a stronger password — 8 to 20 characters, and not an easy one to guess.";
const PASSWORD_LENGTH = "Use 8 to 20 characters.";
const PASSWORD_CHARACTERS = "Mix in letters and numbers.";
const PASSWORD_PWNED =
  "That password has shown up in a data breach. Pick a different one.";
const SOMETHING_WENT_WRONG = "Something went wrong. Try again in a minute.";

/**
 * What to say when signUp fails. Never the browser's own text ("Load failed",
 * "Failed to fetch") or GoTrue's. A weak password says what to fix from
 * auth-js's `reasons` ("length" | "characters" | "pwned"), in that order when
 * there are several; with none it falls back to the general hint.
 */
function signUpErrorMessage(err: AuthError): string {
  // A fetch that threw (offline, blocked) or a 502/503/504 from the gateway.
  if (isAuthRetryableFetchError(err)) return OFFLINE;
  const message = (err.message ?? "").trim();
  if (isAuthWeakPasswordError(err)) {
    const reasons: string[] = err.reasons ?? [];
    const fixes = [
      reasons.includes("length") ? PASSWORD_LENGTH : null,
      reasons.includes("characters") ? PASSWORD_CHARACTERS : null,
      reasons.includes("pwned") ? PASSWORD_PWNED : null,
    ].filter((fix): fix is string => fix !== null);
    return fixes.length ? fixes.join(" ") : WEAK_PASSWORD;
  }
  if (
    err.code === "weak_password" ||
    (err.code === "validation_failed" && /password/i.test(message))
  ) {
    return WEAK_PASSWORD;
  }
  if (
    err.code === "email_address_invalid" ||
    (err.code === "validation_failed" && /email/i.test(message))
  ) {
    return BAD_ADDRESS;
  }
  // The project-wide email cap: same code as the per-address cooldown, but
  // no seconds, and nothing went to this address.
  if (err.code === "over_email_send_rate_limit") return EMAIL_CAP;
  if (err.status === 429 || err.code === "over_request_rate_limit") {
    return TOO_MANY_TRIES;
  }
  return SOMETHING_WENT_WRONG;
}

/**
 * The "Check your email" view shown after signUp sends (or recently sent) a
 * confirmation email. `rateLimitedUntil` (epoch ms) is set when this submit
 * hit the per-address cooldown instead of sending.
 */
type PendingSignup = {
  email: string;
  cooldownSec: number;
  rateLimitedUntil: number | null;
};

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [maybeExisting, setMaybeExisting] = useState(false);
  const [pending, setPending] = useState<PendingSignup | null>(null);
  const submitting = useRef(false);

  const schoolEmailTyped = isSchoolEmail(email.trim());
  const rateLimitedUntil = pending?.rateLimitedUntil ?? null;

  // "We just sent an email" points at the resend countdown below, so it goes
  // when that countdown ends. Checked against the deadline on return too:
  // iOS pauses timers while the student is off in their mail app.
  useEffect(() => {
    if (rateLimitedUntil === null) return;
    const clear = () =>
      setPending((p) =>
        p && p.rateLimitedUntil === rateLimitedUntil
          ? { ...p, rateLimitedUntil: null }
          : p,
      );
    const onVisible = () => {
      if (Date.now() >= rateLimitedUntil) clear();
    };
    const id = window.setTimeout(
      clear,
      Math.max(0, rateLimitedUntil - Date.now()),
    );
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [rateLimitedUntil]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // One signUp at a time, and none while the pending view is up. Every
    // signUp from this browser writes a new PKCE code verifier, which breaks
    // the ?code= link in an email that is already on its way. "Wrong
    // address? Start over" is the only way back to this form.
    if (submitting.current || pending) return;
    setError(null);
    setMaybeExisting(false);
    if (!agreed) {
      setError(
        `Confirm you're ${MIN_AGE} or older and agree to the Terms to create an account.`,
      );
      return;
    }
    // Validate the length cap instead of letting the input truncate. A
    // maxLength here silently cut a pasted password down to 20 characters,
    // so a password manager could create (or reset to) a credential the
    // user never saw and could not reproduce at login.
    if (password.length > MAX_PASSWORD_LENGTH) {
      setError(`Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`);
      return;
    }
    const address = email.trim();
    submitting.current = true;
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signErr } = await supabase.auth.signUp({
        email: address,
        password,
        options: {
          emailRedirectTo: getAuthEmailCallbackUrl(getBrowserSiteOrigin()),
          // Lands in auth.users.raw_user_meta_data; the on_auth_user_created
          // trigger copies it into users.terms_version / terms_accepted_at /
          // age_attested_at so the consent record is born with the row.
          data: {
            [TERMS_METADATA_KEYS.version]: TERMS_VERSION,
            [TERMS_METADATA_KEYS.age]: true,
          },
        },
      });
      if (signErr) {
        if (signErr.code === "over_email_send_rate_limit") {
          const retryAfter = parseRetryAfterSeconds(signErr.message);
          if (retryAfter !== null) {
            // "…only request this after 57 seconds": this address got a
            // confirmation email in the last minute, so show the pending
            // view for it. GoTrue truncates, so it can say 0; clamp to 1.
            const sec = Math.max(1, retryAfter);
            rememberPendingSignup(address);
            setPending({
              email: address,
              cooldownSec: sec,
              rateLimitedUntil: Date.now() + sec * 1000,
            });
            return;
          }
          // Otherwise it's the project-wide cap ("Email rate limit
          // exceeded"): nothing went to this address, so don't claim it did.
        }
        // A confirmed account with this address, on a project that says so
        // outright instead of answering with an empty user.
        if (
          signErr.code === "user_already_exists" ||
          signErr.code === "email_exists"
        ) {
          setMaybeExisting(true);
          return;
        }
        setError(signUpErrorMessage(signErr));
        return;
      }
      if (data.session) {
        clearPendingSignup();
        router.push("/auth/school-email");
        router.refresh();
        return;
      }
      // A confirmed account with this address: GoTrue answers with a user
      // that has no identities and sends nothing, so "check your inbox"
      // would be a lie.
      if (data.user?.identities?.length === 0) {
        setMaybeExisting(true);
        return;
      }
      rememberPendingSignup(address);
      setPending({
        email: address,
        cooldownSec: RESEND_COOLDOWN_SEC,
        rateLimitedUntil: null,
      });
    } catch {
      // Thrown rather than returned (storage blocked, an unexpected bug).
      setError(SOMETHING_WENT_WRONG);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  // Back to the form with its values kept, so a typo is a one-field fix.
  function onStartOver() {
    clearPendingSignup();
    setPending(null);
    setError(null);
    setMaybeExisting(false);
  }

  if (pending) {
    return (
      <div className="vibe-auth-page">
        <Link href="/" className="vibe-auth-back">
          <span aria-hidden>←</span> back
        </Link>

        <div className="vibe-auth-card">
          <div className="vibe-auth-brand" aria-hidden>
            vibe<span className="vibe-auth-dot">.</span>
          </div>

          <h1 className="vibe-auth-headline">
            Check your email<span className="vibe-auth-dot">.</span>
          </h1>
          <p className="vibe-auth-sub" style={{ overflowWrap: "anywhere" }}>
            We sent a link to <strong>{pending.email}</strong> from
            noreply@connectvibe.app. Tap Confirm in that email — any browser or
            phone works. Or type the 8-digit code from the email here.
          </p>

          {/* No number here: the resend button below counts down live, and
              a second, static count would disagree with it. */}
          {rateLimitedUntil !== null ? (
            <div
              role="status"
              className="vibe-auth-banner vibe-auth-banner--info"
            >
              We just sent an email to this address. You can ask for another in
              a moment — see the countdown below.
            </div>
          ) : null}

          <ConfirmCodeForm initialEmail={pending.email} askEmail={false} />

          <div className="vibe-auth-recovery">
            <ResendConfirmation
              initialEmail={pending.email}
              autoStartCooldownSec={pending.cooldownSec}
            />
            <div>
              <button
                type="button"
                className="vibe-auth-disclosure"
                onClick={onStartOver}
              >
                Wrong address? Start over
              </button>
            </div>
          </div>

          <p className="vibe-auth-tail">
            Confirmed on another device or app?{" "}
            <Link
              href="/auth/login?notice=confirmed"
              className="vibe-auth-link vibe-auth-link--tap"
              style={{ whiteSpace: "nowrap" }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="vibe-auth-page">
      <Link href="/" className="vibe-auth-back">
        <span aria-hidden>←</span> back
      </Link>

      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        <h1 className="vibe-auth-headline">
          Create your account<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          Use your <strong>personal email</strong> — the one you actually check.
          Your school <code className="vibe-auth-code">.edu</code> is verified
          separately in the next step.
        </p>

        <div className="vibe-auth-steps" aria-hidden>
          <div className="vibe-auth-step vibe-auth-step--active">
            <span className="vibe-auth-step-num">1</span>
            <span className="vibe-auth-step-label">Account</span>
          </div>
          <span className="vibe-auth-step-divider" />
          <div className="vibe-auth-step">
            <span className="vibe-auth-step-num">2</span>
            <span className="vibe-auth-step-label">
              <code className="vibe-auth-code">.edu</code>
            </span>
          </div>
          <span className="vibe-auth-step-divider" />
          <div className="vibe-auth-step">
            <span className="vibe-auth-step-num">3</span>
            <span className="vibe-auth-step-label">Otto</span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="vibe-auth-form">
          <label className="vibe-auth-field">
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">Personal email</span>
              <span className="vibe-auth-label-hint">not your .edu</span>
            </span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@gmail.com"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setMaybeExisting(false);
              }}
              aria-describedby={
                schoolEmailTyped ? "signup-email-tip" : undefined
              }
              className="vibe-auth-input"
            />
          </label>
          {/* A hint, not a block: the confirm page no longer lets IU's link
              scanner burn the email, so an IU address still works. */}
          {schoolEmailTyped ? (
            <p
              id="signup-email-tip"
              className="vibe-auth-tip"
              style={{ marginTop: -8 }}
            >
              Heads up: use a personal email here — you&apos;ll add your school
              email in the next step.
            </p>
          ) : null}

          <label className="vibe-auth-field">
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">Password</span>
              <span className="vibe-auth-label-hint">8–20 characters</span>
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="vibe-auth-input"
            />
          </label>

          <label
            className={`vibe-auth-consent${agreed ? " vibe-auth-consent--checked" : ""}`}
          >
            <input
              type="checkbox"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-describedby="signup-consent-note"
            />
            <span>
              I&apos;m <strong>{MIN_AGE} or older</strong> and I agree to the{" "}
              <Link
                href="/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="vibe-auth-link"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="vibe-auth-link"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {!agreed ? (
            <p id="signup-consent-note" className="vibe-auth-consent-note">
              Required — check the box above to create your account.
            </p>
          ) : null}

          {error ? <p className="vibe-auth-error">{error}</p> : null}
          {maybeExisting ? (
            <div
              role="status"
              className="vibe-auth-banner vibe-auth-banner--info"
            >
              <strong>This email may already have an account.</strong>
              <span
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px 24px",
                  marginTop: 8,
                }}
              >
                <Link
                  href="/auth/login"
                  className="vibe-auth-link vibe-auth-link--tap"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/forgot-password"
                  className="vibe-auth-link vibe-auth-link--tap"
                >
                  Forgot password?
                </Link>
              </span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || !agreed}
            className={`vibe-auth-submit${!agreed ? " vibe-auth-submit--locked" : ""}`}
          >
            {loading ? "Creating…" : "Create account"}
            {loading ? null : (
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            )}
          </button>
        </form>

        <p className="vibe-auth-tail">
          Already have an account?{" "}
          <Link href="/auth/login" className="vibe-auth-link">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
