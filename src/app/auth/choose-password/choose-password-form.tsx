"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Arrow } from "@/components/brand/Arrow";
import {
  choosePasswordFailureMessage,
  RELOAD_PHRASE,
  RESET_LINK_PHRASE,
  sessionCheckMessage,
} from "@/lib/auth/choose-password-copy";
import { MIN_PASSWORD_LENGTH, PASSWORD_HINT, passwordLengthProblem } from "@/lib/auth/password-rules";
import { MIN_AGE, TERMS_VERSION } from "@/lib/legal/terms";
import { openInBrowser } from "@/lib/native/bridge";
import { appShellOnClient } from "@/lib/native/detect";
import { clearDraft } from "@/lib/onboarding/draft";
import { pushLogoutBody } from "@/lib/pwa/device-push";
import { leaveDeviceClean } from "@/lib/pwa/leave-device-clean";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const FORGOT_PASSWORD_PATH = "/auth/forgot-password";

/**
 * leaveDeviceClean behind our own guard, as on the Terms page. It promises
 * never to throw and to be done within ~3 s; this makes sure, so a push
 * clean-up problem can't stop Sign out: any error is dropped, and after 4 s
 * we move on whatever it's still doing.
 */
function leaveDeviceSafely(opts: { serverDelete: boolean }): Promise<void> {
  return Promise.race([
    Promise.resolve()
      .then(() => leaveDeviceClean(opts))
      .catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, 4000)),
  ]);
}

/**
 * The account this browser's session belongs to right now, as `updateUser`
 * will see it: auth-js reads the shared cookies on every call, so a sign-in
 * in another tab changes it. A refresh that failed gives no session and its
 * error; a throw counts as one too.
 */
async function readHeldSession(): Promise<{ userId: string | null; error: unknown }> {
  try {
    const { data, error } = await getSupabaseBrowserClient().auth.getSession();
    return { userId: data.session?.user?.id ?? null, error };
  } catch (err) {
    return { userId: null, error: err };
  }
}

/**
 * The Terms and Privacy links open in a new tab so the half-filled form stays
 * put. The store apps have no new tab, so there the page opens in the in-app
 * browser sheet, on top of the form (same as the sign-up page). The default
 * is stopped first, so the app's own link handler leaves this click alone.
 */
function openLegalInApp(e: React.MouseEvent<HTMLAnchorElement>) {
  if (appShellOnClient() === null) return;
  e.preventDefault();
  void openInBrowser(e.currentTarget.href);
}

/**
 * Client half of `/auth/choose-password` (see page.tsx).
 *
 * A real `<form>` with the address as a read-only `username` field and a
 * `new-password` field, so Safari, Chrome and password managers offer to
 * save the pair under the right account. Then the same 18+ / Terms / Privacy
 * box as the sign-up page: the first signer's tick was cleared at the
 * confirmation, and this one is the inbox holder's.
 *
 * "Save and continue" first makes sure this browser is still signed in to
 * `userId`, the account the server drew the page for: sessions live in
 * cookies every tab shares, and no current password is asked (there is
 * none), so after a sign-in as someone else in another tab the save would
 * land on that account. Then it sets the password, checks once more, records
 * the tick (the server decides it is `confirm`), and goes on to `next`. A failed save keeps the form and says
 * why in our words; Save tries again. A failed tick only means the Terms page
 * asks once more, so it never holds the student here.
 */
export function ChoosePasswordForm({
  userId,
  email,
  next,
  again,
}: {
  /** The signed-in account the server drew the page for; nothing saves to any other. */
  userId: string;
  email: string;
  next: string;
  /** The sign-up page or the login code box tried to save it and could not. */
  again: boolean;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const submitting = useRef(false);

  // Save and Sign out stay busy while the page navigates away; re-arm them
  // if the browser restores this page from the back/forward cache.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      submitting.current = false;
      setSaving(false);
      setSigningOut(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current || signingOut) return;
    setError(null);
    if (!agreed) {
      setError(`Confirm you're ${MIN_AGE} or older and agree to the Terms to continue.`);
      return;
    }
    // The 8–72 rule, checked here instead of letting the input truncate. A
    // maxLength once cut a pasted password down to the cap, so a password
    // manager saved a credential the student never saw. Never add one.
    const lengthProblem = passwordLengthProblem(password);
    if (lengthProblem) {
      setError(lengthProblem.message);
      return;
    }
    submitting.current = true;
    setSaving(true);

    // Still the account this page names? If another tab switched accounts,
    // or signed out, say so and save nothing.
    let failure = sessionCheckMessage(await readHeldSession(), userId);
    if (failure) {
      submitting.current = false;
      setSaving(false);
      setError(failure);
      return;
    }
    try {
      const { error: pwErr } = await getSupabaseBrowserClient().auth.updateUser({ password });
      // `same_password`: this password is already the stored one (a retry
      // after a save that did land), so carry on.
      if (pwErr && pwErr.code !== "same_password") failure = choosePasswordFailureMessage(pwErr);
    } catch (err) {
      failure = choosePasswordFailureMessage(err);
    }
    if (failure) {
      submitting.current = false;
      setSaving(false);
      setError(failure);
      return;
    }

    // The tick goes by the same cookies, so check once more: if the account
    // changed meanwhile, record nothing and draw the page again for whoever
    // is signed in now (a saved password then goes on to the Terms page).
    if (sessionCheckMessage(await readHeldSession(), userId) !== null) {
      window.location.reload();
      return;
    }

    // Only now, with a password saved: the server refuses the tick while the
    // account has none. A failure here only means the Terms page asks once
    // more on the way, so it is not waited on beyond its own answer.
    await fetch("/api/me/accept-terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms_version: TERMS_VERSION }),
    }).catch(() => undefined);

    // A full load, so the next server page reads the fresh consent and the
    // proxy sees the session as it is now. Save stays busy while we leave.
    window.location.assign(next);
  }

  // "Not you?": the same sign-out as the Terms page.
  async function onSignOut() {
    if (signingOut || submitting.current) return;
    setSigningOut(true);
    let signedOut = false;
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // This device's push address, so the route drops its row too.
        body: JSON.stringify(pushLogoutBody()),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      signedOut = res.ok && data.ok === true;
    } catch {
      // Best-effort; the login page copes with a lingering session.
    }
    // Take this device off push and drop the account's cached data. After a
    // good logout the route already dropped every row, so no server delete;
    // after a failed one, delete this device's row ourselves. It can't throw
    // or navigate and is over within 4 s.
    await leaveDeviceSafely({ serverDelete: !signedOut });
    // Drop every onboarding draft on this browser, then a hard load so the
    // cookie clear is reflected everywhere.
    clearDraft();
    window.location.href = "/auth/login";
  }

  const busy = saving || signingOut;

  return (
    <div className="vibe-auth-page">
      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        <h1 className="vibe-auth-headline">
          Choose your password<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub" style={{ overflowWrap: "anywhere" }}>
          {again ? (
            "Your email is confirmed, but your password did not save. Type it once more."
          ) : email ? (
            <>
              Your email <strong>{email}</strong> is confirmed. Choose the password you will sign in
              with, on any device.
            </>
          ) : (
            "Your email is confirmed. Choose the password you will sign in with, on any device."
          )}
        </p>

        <form onSubmit={onSubmit} className="vibe-auth-form">
          {/* The account the password is for, for password managers to save
              it under. Read-only: the address was just proven. */}
          {email ? (
            <label className="vibe-auth-field">
              <span className="vibe-auth-label-row">
                <span className="vibe-auth-label">Email</span>
                <span className="vibe-auth-label-hint">confirmed</span>
              </span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                readOnly
                value={email}
                className="vibe-auth-input"
                style={readOnlyStyle}
              />
            </label>
          ) : null}

          <div className="vibe-auth-field">
            <span className="vibe-auth-label-row">
              <label htmlFor="choose-password" className="vibe-auth-label">
                Password
              </label>
              <span className="vibe-auth-label-hint">{PASSWORD_HINT}</span>
            </span>
            <div style={{ position: "relative" }}>
              <input
                id="choose-password"
                name="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="vibe-auth-input"
                style={passwordInputStyle}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-controls="choose-password"
                aria-pressed={showPassword}
                style={toggleStyle}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* The same box and words as the sign-up page. */}
          <label className={`vibe-auth-consent${agreed ? " vibe-auth-consent--checked" : ""}`}>
            <input
              type="checkbox"
              required
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-describedby="choose-consent-note"
            />
            <span>
              I&apos;m <strong>{MIN_AGE} or older</strong> and I agree to the{" "}
              <Link
                href="/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="vibe-auth-link"
                onClick={openLegalInApp}
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="vibe-auth-link"
                onClick={openLegalInApp}
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {!agreed ? (
            <p id="choose-consent-note" className="vibe-auth-consent-note">
              Required — check the box above to continue.
            </p>
          ) : null}
          {/* Said where it is agreed to (Privacy Policy, short version item
              6), as on the sign-up page: someone who confirmed off that page
              may never have seen it. */}
          <p className="vibe-auth-consent-note">
            Good to know: people can see that you viewed their profile or post.
          </p>

          {error ? (
            <p role="alert" className="vibe-auth-error">
              <CopyWithAction text={error} />
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || !agreed}
            className={`vibe-auth-submit${!agreed ? " vibe-auth-submit--locked" : ""}`}
          >
            {saving ? "Saving…" : "Save and continue"}
            {saving ? null : <Arrow direction="right" style={{ marginLeft: 8 }} />}
          </button>
        </form>

        <p className="vibe-auth-tail">
          Not you?{" "}
          <button
            type="button"
            onClick={onSignOut}
            disabled={busy}
            aria-busy={signingOut}
            className="vibe-auth-link vibe-auth-link--tap"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </p>
        {/* The owner may sign out too, and this account may hold no password
            yet: say how to get back in, with the sign-in page's own label. */}
        <p className="vibe-auth-tail" style={{ marginTop: 8, fontSize: 12.5 }}>
          If it is you and you sign out now, get back in with{" "}
          <strong>Forgot?</strong> on the sign-in page: it sends a reset to this
          inbox.
        </p>
      </div>
    </div>
  );
}

/**
 * Renders "…send yourself a reset link." with the phrase as a link to Forgot
 * password: the way back in when this session can't set a password (Secure
 * password change on an older sign-in, or signed out meanwhile). The reset
 * email signs in fresh, and its page sets the password.
 *
 * "…reload this page." (another tab switched accounts) renders the phrase as
 * a button that reloads, which draws the screen for whoever is signed in now.
 */
function CopyWithAction({ text }: { text: string }) {
  const reloadAt = text.lastIndexOf(RELOAD_PHRASE);
  if (reloadAt !== -1) {
    return (
      <>
        {text.slice(0, reloadAt)}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="vibe-auth-link vibe-auth-link--tap"
        >
          {RELOAD_PHRASE}
        </button>
        {text.slice(reloadAt + RELOAD_PHRASE.length)}
      </>
    );
  }
  const at = text.lastIndexOf(RESET_LINK_PHRASE);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Link href={FORGOT_PASSWORD_PATH} className="vibe-auth-link vibe-auth-link--tap">
        {RESET_LINK_PHRASE}
      </Link>
      {text.slice(at + RESET_LINK_PHRASE.length)}
    </>
  );
}

/** Reads as filled in, not as a field to type in; tokens only, so Night and Light both hold. */
const readOnlyStyle: React.CSSProperties = {
  background: "rgba(var(--scrim-rgb), 0.04)",
  color: "var(--ink-sub)",
  cursor: "default",
};

/** 16px keeps iOS Safari from zooming on focus; the right padding clears the toggle. */
const passwordInputStyle: React.CSSProperties = {
  fontSize: 16,
  paddingRight: 76,
};

/** The Show / Hide toggle, as on the reset page: a 44px target inside the field's right edge. */
const toggleStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  minWidth: 64,
  minHeight: 44,
  padding: "0 16px",
  border: 0,
  borderRadius: "0 12px 12px 0",
  background: "none",
  color: "var(--tag-ink)",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
