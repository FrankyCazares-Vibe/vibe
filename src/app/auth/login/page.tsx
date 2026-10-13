"use client";

import { KineticWordmark } from "@/components/brand/KineticWordmark";
import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { ConfirmCodeForm } from "@/components/auth/ConfirmCodeForm";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { TurnstileBox, type TurnstileBoxHandle } from "@/components/auth/TurnstileBox";
import {
  captchaErrorMessage,
  captchaOptions,
  humanCheckWaitLabel,
  initialHumanCheck,
  isCaptchaError,
  type HumanCheck,
} from "@/lib/auth/captcha";
import { getPostLoginDestination } from "@/lib/auth/post-login";
import { sanitizeLoginNextParam } from "@/lib/auth/login-next";
import { readPendingSignupEmail } from "@/lib/auth/pending-signup";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSignupOpen } from "@/lib/waitlist/use-signup-open";

const NOT_CONFIRMED =
  "Confirm your email first: type the 8-digit code from the email we sent when you signed up, or ask for a new one.";
const WRONG_CREDENTIALS =
  "That email and password don't match. Use the email you signed up with.";
const OFFLINE = "We couldn't reach Vibe. Check your connection and try again.";
const TOO_MANY_TRIES =
  "Too many tries from this network. Wait a few minutes, then try again.";
const SOMETHING_WENT_WRONG = "Something went wrong. Try again in a minute.";
// A permanent ban (GoTrue `user_banned`). Never the reason and never a date:
// anyone can type an email into this form, so this page says only that the
// account can't sign in, and the appeal happens by email.
const ACCOUNT_CLOSED =
  "This account can't sign in. If you think this is a mistake, email help@connectvibe.app.";

/**
 * What to say when sign-in fails. Never the provider's or the browser's own
 * text: "Load failed" and "Failed to fetch" are how iOS and Chrome say "no
 * connection", and GoTrue's other messages aren't written for students.
 * `human` is the "are you a person" box as it was when the request left.
 */
function signInErrorMessage(err: AuthError, human: HumanCheck): string {
  // A fetch that threw (offline, blocked) or a 502/503/504 from the gateway.
  if (isAuthRetryableFetchError(err)) return OFFLINE;
  // Supabase refused the "are you a person" check (`captcha_failed`): its own
  // sentence, with what to do. Nothing was decided about the password.
  if (isCaptchaError(err)) return captchaErrorMessage(human);
  if (err.code === "email_not_confirmed") return NOT_CONFIRMED;
  if (err.code === "invalid_credentials") return WRONG_CREDENTIALS;
  if (err.code === "user_banned") return ACCOUNT_CLOSED;
  if (err.status === 429 || err.code === "over_request_rate_limit") {
    return TOO_MANY_TRIES;
  }
  return SOMETHING_WENT_WRONG;
}

/**
 * Where a sign-in that just succeeded goes. getPostLoginDestination answers
 * "/auth/login" when getUser finds no user, which right after signing in is
 * a network blip; reloading this page would look like the sign-in failed.
 * /onboarding forwards already-onboarded users onward.
 */
async function destinationAfterSignIn(
  supabase: ReturnType<typeof getSupabaseBrowserClient>,
  next: string | null,
): Promise<string> {
  try {
    const dest = await getPostLoginDestination(supabase, next);
    return dest === "/auth/login" ? "/onboarding" : dest;
  } catch {
    return "/onboarding";
  }
}

/** The path of a `next` value, without its query or hash. */
function pathOf(next: string | null): string | null {
  return next ? (next.split(/[?#]/)[0] ?? null) : null;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const signupOpen = useSignupOpen();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // The address a sign-in just failed with as unconfirmed.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(
    null,
  );
  const [signedIn, setSignedIn] = useState<{ email: string | null } | null>(
    null,
  );
  const [continuing, setContinuing] = useState(false);
  const [resendOpen, setResendOpen] = useState(false);
  const [resendEmail, setResendEmail] = useState<string | null>(null);
  // The "are you a person" box (TurnstileBox). With no site key it is "off"
  // for good: no box, the button never waits, and sign-in sends what it
  // always sent.
  const [human, setHuman] = useState<HumanCheck>(initialHumanCheck);
  const humanBox = useRef<TurnstileBoxHandle>(null);
  const humanWait = humanCheckWaitLabel(human);

  const urlError = searchParams.get("error");
  const schoolVerifiedHint = searchParams.get("school_verified") === "1";
  const confirmedNotice = searchParams.get("notice") === "confirmed";
  const next = sanitizeLoginNextParam(searchParams.get("next"));
  const nextPath = pathOf(next);
  const callbackFailed = urlError === "auth_callback";

  // A signed-in visitor gets a Continue button, never an automatic
  // redirect: sign-out in Settings hard-navigates here, and bouncing a
  // session that is still readable straight back into the app would loop.
  useEffect(() => {
    let cancelled = false;
    getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled && data.session) {
          setSignedIn({ email: data.session.user.email ?? null });
        }
      })
      .catch(() => {
        // No banner; the form still works.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sign in and Continue stay disabled while the page navigates away. If
  // iOS Safari or an in-app browser restores this page from the
  // back/forward cache, re-arm them instead of leaving them dead.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setLoading(false);
      setContinuing(false);
      // Whatever token the box held went with the sign-in that left this page.
      humanBox.current?.reset();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The button is disabled while the box is still checking; this is the
    // same rule for a submit that arrives any other way.
    if (loading || humanWait !== null) return;
    const address = email.trim();
    setError(null);
    // unconfirmedEmail is left alone until the answer is in: the same
    // address failing as unconfirmed again keeps its resend countdown.
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    let signedInNow = false;
    try {
      const { data: signData, error: signErr } =
        await supabase.auth.signInWithPassword({
          email: address,
          password,
          // { captchaToken } when the box has one, else {} and the request
          // is the one it always was.
          options: captchaOptions(human),
        });
      if (signErr) {
        setUnconfirmedEmail(
          signErr.code === "email_not_confirmed" ? address : null,
        );
        setError(signInErrorMessage(signErr, human));
        return;
      }
      if (!signData.session) {
        setUnconfirmedEmail(null);
        setError(SOMETHING_WENT_WRONG);
        return;
      }
      signedInNow = true;
    } catch {
      // Thrown rather than returned (storage blocked, an unexpected bug).
      setError(SOMETHING_WENT_WRONG);
      return;
    } finally {
      if (!signedInNow) setLoading(false);
      // A token works once: a new check after every try, good or bad.
      humanBox.current?.reset();
    }
    const dest = await destinationAfterSignIn(supabase, next);
    // Full navigation so middleware always sees the new auth cookies.
    window.location.assign(dest);
  }

  async function onContinue() {
    if (continuing) return;
    setContinuing(true);
    let dest = "/onboarding";
    try {
      dest = await getPostLoginDestination(getSupabaseBrowserClient(), next);
    } catch {
      // /onboarding forwards already-onboarded users onward.
    }
    if (dest === "/auth/login") {
      // The stored session has no account behind it any more. Going
      // "onward" would reload this page, so drop the banner instead.
      setSignedIn(null);
      setContinuing(false);
      return;
    }
    window.location.assign(dest);
  }

  function onToggleResend() {
    // Seed on open until there is an address: the one typed above, else the
    // one this browser signed up with. Once seeded it stays put, so
    // reopening never swaps the address under a running countdown.
    if (!resendOpen && !resendEmail) {
      setResendEmail(email.trim() || readPendingSignupEmail());
    }
    setResendOpen((open) => !open);
  }

  let contextBanner: React.ReactNode = null;
  if (schoolVerifiedHint) {
    contextBanner = (
      <div className="vibe-auth-banner vibe-auth-banner--success">
        <strong>Campus email verified.</strong> Sign in with the personal
        email you used to sign up — we&apos;ll take you right back where you
        left off.
      </div>
    );
  } else if (confirmedNotice) {
    contextBanner = (
      <div className="vibe-auth-banner vibe-auth-banner--success">
        Your email is confirmed. Sign in to keep going.
      </div>
    );
  } else if (callbackFailed) {
    // Old bookmarks and tabs from before /auth/callback stopped redirecting
    // here. The account is often already confirmed by then.
    contextBanner = (
      <div className="vibe-auth-banner vibe-auth-banner--info">
        That link didn&apos;t sign you in here — but your email may already be
        confirmed. Try signing in. If it says your email isn&apos;t confirmed,
        send a new email below.
      </div>
    );
  } else if (nextPath === "/auth/verify-school") {
    contextBanner = (
      <div className="vibe-auth-banner vibe-auth-banner--info">
        Sign in to finish verifying your school email. Use the email you log in
        with.
      </div>
    );
  } else if (nextPath === "/auth/school-email") {
    contextBanner = (
      <div className="vibe-auth-banner vibe-auth-banner--info">
        Sign in to pick up where you left off.
      </div>
    );
  }

  return (
    <div className="vibe-auth-page">
      <Link href="/" className="vibe-auth-back">
        <span aria-hidden>←</span> back
      </Link>

      <div className="vibe-auth-card">
        <div className="vibe-auth-brand vibe-auth-brand--kinetic">
          <KineticWordmark dotClassName="vibe-auth-dot" />
        </div>

        <h1 className="vibe-auth-headline">
          Welcome back<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          Sign in with <strong>the email you signed up with</strong>. For most
          people that is their school{" "}
          <code className="vibe-auth-code">.edu</code>.
        </p>

        {signedIn ? (
          <div
            role="status"
            className="vibe-auth-banner vibe-auth-banner--info"
          >
            <strong>You&apos;re already signed in.</strong>
            {signedIn.email ? (
              <>
                {" "}
                Signed in as <strong>{signedIn.email}</strong>.
              </>
            ) : null}
            <button
              type="button"
              className="vibe-auth-secondary"
              disabled={continuing}
              onClick={() => void onContinue()}
              style={{ display: "flex", width: "100%", marginTop: 10 }}
            >
              Continue
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            </button>
          </div>
        ) : (
          contextBanner
        )}

        <form onSubmit={onSubmit} className="vibe-auth-form">
          <label className="vibe-auth-field">
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">Email</span>
              <span className="vibe-auth-label-hint">the one you signed up with</span>
            </span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@iu.edu"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="vibe-auth-input"
            />
          </label>

          <label className="vibe-auth-field">
            <span className="vibe-auth-label-row">
              <span className="vibe-auth-label">Password</span>
              <Link
                href="/auth/forgot-password"
                className="vibe-auth-label-link vibe-auth-link--tap"
              >
                Forgot?
              </Link>
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="vibe-auth-input"
            />
          </label>

          {/* Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. */}
          <TurnstileBox ref={humanBox} action="sign-in" onChange={setHuman} />

          {error ? (
            <p role="alert" className="vibe-auth-error">
              {error}
            </p>
          ) : null}

          {/* While the box is still checking, the button waits and says so. */}
          <button
            type="submit"
            disabled={loading || humanWait !== null}
            className="vibe-auth-submit"
          >
            {loading ? "Signing in…" : (humanWait ?? "Sign in")}
            {loading || humanWait !== null ? null : (
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            )}
          </button>
        </form>

        {unconfirmedEmail ? (
          <div key={unconfirmedEmail} className="vibe-auth-recovery">
            {/* Code first, resend under it: a failed code says "send a new
                email below", same order as signup's pending view. */}
            <ConfirmCodeForm initialEmail={unconfirmedEmail} askEmail={false} />
            <ResendConfirmation initialEmail={unconfirmedEmail} />
          </div>
        ) : null}
        {/* Hidden, never unmounted, while collapsed or while the unconfirmed
            block above is up: unmounting would drop a running resend
            countdown and offer "Send a new email" that GoTrue then refuses.
            `hidden` sits on plain wrappers because .vibe-auth-recovery's
            display:flex would override it. */}
        {callbackFailed && !signedIn ? (
          <div hidden={Boolean(unconfirmedEmail)}>
            <div className="vibe-auth-recovery">
              <div>
                <button
                  type="button"
                  className="vibe-auth-disclosure"
                  aria-expanded={resendOpen}
                  aria-controls="login-resend"
                  onClick={onToggleResend}
                >
                  Need a new confirmation email?
                </button>
              </div>
              <div id="login-resend" hidden={!resendOpen}>
                <ResendConfirmation initialEmail={resendEmail} />
              </div>
            </div>
          </div>
        ) : null}

        {/* Sign-up open: today's line. Closed: the two ways in for someone
            without an account, a code they were sent or the waitlist. Still
            asking (null): an empty line that holds the place. So an open
            sign-up never shows the waitlist wording for a moment on every
            load, and nobody is sent to a form that would refuse them. */}
        {signupOpen === null ? (
          <p className="vibe-auth-tail" aria-hidden="true">
            &nbsp;
          </p>
        ) : signupOpen ? (
          <p className="vibe-auth-tail">
            New to Vibe?{" "}
            <Link href="/auth/signup" className="vibe-auth-link vibe-auth-link--tap">
              Create an account
            </Link>
          </p>
        ) : (
          <>
            <p className="vibe-auth-tail">
              New to Vibe?{" "}
              <Link href="/waitlist" className="vibe-auth-link vibe-auth-link--tap">
                Join the waitlist
              </Link>
            </p>
            {/* 28px, not the tail's 24: the two links' tap areas (47 and 50px)
                then meet without overlapping. The link is a box so that, where
                the line wraps, every word of it gets the tall area. */}
            <p className="vibe-auth-tail" style={{ marginTop: 28 }}>
              <Link
                href="/auth/signup"
                className="vibe-auth-link--tap"
                style={{ display: "inline-block", color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Got an access code? Create your account
              </Link>
            </p>
          </>
        )}
        {/* The policy and the Terms, on the first screen a signed-out person
            (and a store reviewer) sees. Full strength: at 0.75 these small
            links failed the contrast check in Light. */}
        <p className="vibe-auth-tail" style={{ marginTop: 28, fontSize: 12.5 }}>
          <Link href="/legal/privacy" className="vibe-auth-link--tap" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/legal/terms" className="vibe-auth-link--tap" style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}>
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="vibe-auth-page">
          <p className="vibe-auth-loading">Loading…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
