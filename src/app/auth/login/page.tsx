"use client";

import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { ConfirmCodeForm } from "@/components/auth/ConfirmCodeForm";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import { getPostLoginDestination } from "@/lib/auth/post-login";
import { sanitizeLoginNextParam } from "@/lib/auth/login-next";
import { readPendingSignupEmail } from "@/lib/auth/pending-signup";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const NOT_CONFIRMED =
  "Confirm your email first — we sent a link when you signed up.";
const WRONG_CREDENTIALS =
  "That email and password don't match. Use the email you signed up with.";
const OFFLINE = "We couldn't reach Vibe. Check your connection and try again.";
const TOO_MANY_TRIES =
  "Too many tries from this network. Wait a few minutes, then try again.";
const SOMETHING_WENT_WRONG = "Something went wrong. Try again in a minute.";

/**
 * What to say when sign-in fails. Never the provider's or the browser's own
 * text: "Load failed" and "Failed to fetch" are how iOS and Chrome say "no
 * connection", and GoTrue's other messages aren't written for students.
 */
function signInErrorMessage(err: AuthError): string {
  // A fetch that threw (offline, blocked) or a 502/503/504 from the gateway.
  if (isAuthRetryableFetchError(err)) return OFFLINE;
  if (err.code === "email_not_confirmed") return NOT_CONFIRMED;
  if (err.code === "invalid_credentials") return WRONG_CREDENTIALS;
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
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
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
        });
      if (signErr) {
        setUnconfirmedEmail(
          signErr.code === "email_not_confirmed" ? address : null,
        );
        setError(signInErrorMessage(signErr));
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
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        <h1 className="vibe-auth-headline">
          Welcome back<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          Use your <strong>personal email</strong> — the one you actually check.
          Your school <code className="vibe-auth-code">.edu</code> is verified
          separately.
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
              <span className="vibe-auth-label">Personal email</span>
              <span className="vibe-auth-label-hint">the one you signed up with</span>
            </span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@gmail.com"
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

          {error ? (
            <p role="alert" className="vibe-auth-error">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={loading} className="vibe-auth-submit">
            {loading ? "Signing in…" : "Sign in"}
            {loading ? null : (
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

        <p className="vibe-auth-tail">
          New to vibe?{" "}
          <Link href="/auth/signup" className="vibe-auth-link">
            Create an account
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
