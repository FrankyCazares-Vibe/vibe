"use client";

import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { useEffect, useRef, useState, type JSX } from "react";

import { POST_EMAIL_CONFIRM_PATH } from "@/lib/auth/email-confirm-redirect";
import {
  EMAIL_LINK_COPY,
  classifyEmailLinkProblem,
  type EmailLinkProblem,
} from "@/lib/auth/email-link-errors";
import { clearPendingSignup } from "@/lib/auth/pending-signup";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const CODE_LENGTH = 8;
const CODE_DIDNT_WORK =
  "That code didn't work. It may be mistyped, already used, or older than an hour — send a new email below.";
const ENTER_EMAIL = "Enter the email you signed up with.";
const SOMETHING_WRONG = "Something went wrong. Try again in a minute.";

/**
 * Only a spent or wrong code says "mistyped / already used": a GoTrue 500 or
 * a malformed address is not the student's code, and saying so sends them
 * back to their inbox for nothing.
 */
function codeErrorMessage(
  problem: EmailLinkProblem,
  errorCode: string | undefined,
): string {
  if (problem === "link_used_or_expired") return CODE_DIDNT_WORK;
  if (problem === "too_many_tries" || problem === "offline") {
    return EMAIL_LINK_COPY[problem].body;
  }
  if (errorCode === "email_address_invalid") return ENTER_EMAIL;
  return SOMETHING_WRONG;
}

/**
 * Confirm the account by typing the 8-digit code from the "Confirm your Vibe
 * account" email, for students who can't tap the link or opened it on
 * another device. verifyOtp({ email, token, type: "email" }) signs in
 * whichever browser this is; no PKCE verifier is involved.
 *
 * With `askEmail` false and an `initialEmail`, the address comes from the
 * parent (signup's pending view, login's email field) at submit time.
 * With `hideEmailField`, it always does, even while empty: the parent shows
 * one address field for this form and the resend under it. Otherwise the
 * field shows, prefilled when an address is known.
 *
 * Renders no <form> (it can sit inside the login form); Enter confirms
 * without submitting the outer form, and `form=""` detaches the inputs from
 * any outer form so a half-typed address here can't block its submit.
 */
export function ConfirmCodeForm({
  initialEmail,
  askEmail,
  hideEmailField,
}: {
  initialEmail?: string | null;
  askEmail?: boolean;
  hideEmailField?: boolean;
}): JSX.Element {
  const seedEmail = initialEmail?.trim() ?? "";
  const askForEmail =
    hideEmailField !== true && (askEmail === true || !seedEmail);
  const [email, setEmail] = useState(seedEmail);
  const [touched, setTouched] = useState(false);
  const [seenSeed, setSeenSeed] = useState(seedEmail);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Follow a prefill that arrives after mount unless the student typed.
  if (seedEmail !== seenSeed) {
    setSeenSeed(seedEmail);
    if (!touched) setEmail(seedEmail);
  }

  // The button stays disabled while the page navigates away. If iOS Safari
  // or an in-app browser restores this page from the back/forward cache
  // (Back from the IU email step), re-arm it instead of leaving it dead.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      inFlight.current = false;
      setBusy(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function onConfirm() {
    if (inFlight.current) return;
    const target = (askForEmail ? email : seedEmail).trim();
    setError(null);
    if (!target.includes("@")) {
      setError(ENTER_EMAIL);
      return;
    }
    if (code.length !== CODE_LENGTH) {
      setError("Enter the 8-digit code from the email.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    let leaving = false;
    try {
      const supabase = getSupabaseBrowserClient();
      // verifyOtp doesn't wait for the client's start-up (same guard as
      // /auth/confirm). Let it finish loading any stored session first, so a
      // stale one that fails to refresh can't remove the new session.
      await supabase.auth.initialize();
      const { data, error: verifyErr } = await supabase.auth.verifyOtp({
        email: target,
        token: code,
        type: "email",
      });
      if (verifyErr) {
        const networkError = isAuthRetryableFetchError(verifyErr);
        // Confirmed by the link in another tab of this browser: the code is
        // spent, but this browser is signed in as that same, now-confirmed
        // account, so just carry on. Any other session (a roommate's laptop,
        // a second account) must not turn a wrong code into a success.
        if (!networkError) {
          const { data: current } = await supabase.auth.getSession();
          const signedIn = current.session?.user;
          if (
            signedIn?.email_confirmed_at &&
            signedIn.email?.toLowerCase() === target.toLowerCase()
          ) {
            leaving = true;
            clearPendingSignup();
            window.location.assign(POST_EMAIL_CONFIRM_PATH);
            return;
          }
        }
        const problem = classifyEmailLinkProblem({
          hasCode: false,
          hasToken: true,
          hasSession: false,
          errorCode: verifyErr.code,
          errorDescription: verifyErr.message,
          status: verifyErr.status,
          networkError,
        });
        setError(codeErrorMessage(problem, verifyErr.code));
        return;
      }
      leaving = true;
      clearPendingSignup();
      if (!data.session) {
        // Confirmed, but no session came back: let them sign in.
        window.location.assign(
          EMAIL_LINK_COPY.confirmed_sign_in.primaryHref ?? "/auth/login",
        );
        return;
      }
      // Full navigation so the proxy sees the new auth cookies.
      window.location.assign(POST_EMAIL_CONFIRM_PATH);
    } catch {
      setError(EMAIL_LINK_COPY.offline.body);
    } finally {
      // Stay disabled while the page navigates away.
      if (!leaving) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void onConfirm();
  }

  return (
    <div className="vibe-auth-form">
      {askForEmail ? (
        <label className="vibe-auth-field">
          <span className="vibe-auth-label-row">
            <span className="vibe-auth-label">Personal email</span>
            <span className="vibe-auth-label-hint">
              the one you signed up with
            </span>
          </span>
          <input
            form=""
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@gmail.com"
            value={email}
            onChange={(e) => {
              setTouched(true);
              setEmail(e.target.value);
            }}
            onKeyDown={onEnter}
            className="vibe-auth-input"
          />
        </label>
      ) : null}

      <label className="vibe-auth-field">
        <span className="vibe-auth-label-row">
          <span className="vibe-auth-label">8-digit code</span>
        </span>
        {/* No maxLength: it silently truncates a paste like "1234 5678".
            Non-digits are stripped and the value capped here instead. */}
        <input
          form=""
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          spellCheck={false}
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
          }
          onKeyDown={onEnter}
          className="vibe-auth-input vibe-auth-code-input"
        />
      </label>

      {error ? (
        <p role="alert" className="vibe-auth-error">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="vibe-auth-submit"
        disabled={busy}
        onClick={() => void onConfirm()}
      >
        {busy ? "Confirming…" : "Confirm with code"}
      </button>
    </div>
  );
}
