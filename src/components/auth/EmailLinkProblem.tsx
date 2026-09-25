"use client";

import Link from "next/link";
import { useEffect, useState, type JSX, type ReactNode } from "react";

import { ConfirmCodeForm } from "@/components/auth/ConfirmCodeForm";
import { ResendConfirmation } from "@/components/auth/ResendConfirmation";
import {
  EMAIL_LINK_COPY,
  EMAIL_SLOT,
  SIGNED_IN_BY_LINK_COPY,
  SIGNED_IN_NO_EMAIL_BODY,
  SIGNED_OUT_COPY,
  SIGN_OUT_FAILED,
  type EmailLinkProblem,
} from "@/lib/auth/email-link-errors";
import { clearPendingSignup } from "@/lib/auth/pending-signup";
import { getPostLoginDestination } from "@/lib/auth/post-login";
import { leaveDeviceClean } from "@/lib/pwa/leave-device-clean";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Outcomes where a fresh email or the typed code is the way forward. */
const OFFERS_RECOVERY = new Set<EmailLinkProblem>([
  "link_used_or_expired",
  "unknown",
  "incomplete_link",
  // The browser may hold someone else's account; the student's own still
  // needs its code or a new email.
  "already_signed_in",
]);

/** Brand mark and headline; titles end in a period, drawn as the brand's dot. */
function CardHead({ title }: { title: string }): JSX.Element {
  const text = title.endsWith(".") ? title.slice(0, -1) : title;
  return (
    <>
      <div className="vibe-auth-brand" aria-hidden>
        vibe<span className="vibe-auth-dot">.</span>
      </div>
      <h1 className="vibe-auth-headline vibe-auth-headline--compact">
        {text}
        <span className="vibe-auth-dot">.</span>
      </h1>
    </>
  );
}

/** A copy string with the account's address in bold at its `{email}` slot. */
function WithEmail({ text, email }: { text: string; email: string }) {
  const [before, after = ""] = text.split(EMAIL_SLOT);
  return (
    <>
      {before}
      <strong>{email}</strong>
      {after}
    </>
  );
}

/**
 * leaveDeviceClean behind our own guard. It promises never to throw and to be
 * done within ~3 s; this makes sure, so a push clean-up problem can't stop
 * the sign-out after it: any error is dropped, and after 4 s we move on
 * whatever it's still doing.
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
 * "Not you? Sign out" for a browser holding an account the student may not
 * own. Local scope: only this browser's session ends, not the account's
 * other devices. auth-js keeps the session when the logout call fails for
 * any reason but an already-dead token, so a failure says so and stays put.
 */
function useSignOutHere(onSignedOut: () => void) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    let ok = false;
    try {
      // Take this device off this account's push first: delete its row,
      // unsubscribe, clear the screen and the cached account data. BEFORE
      // signOut, because the row delete needs the session signOut ends (plan
      // §8 W7). The helper never navigates, so the card still flips in place.
      // Can't throw; over within 4 s.
      await leaveDeviceSafely({ serverDelete: true });
      const { error } = await getSupabaseBrowserClient().auth.signOut({
        scope: "local",
      });
      ok = !error;
    } catch {
      // Treated as a failure below.
    }
    setSigningOut(false);
    if (ok) onSignedOut();
    else setSignOutError(SIGN_OUT_FAILED);
  }

  return { signingOut, signOutError, signOut };
}

/**
 * Continue stays disabled while the page navigates away; re-arm it if the
 * browser restores this page from the back/forward cache.
 */
function useContinuing() {
  const [continuing, setContinuing] = useState(false);
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setContinuing(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return [continuing, setContinuing] as const;
}

/**
 * The typed code and "Send a new email", for the problem cards and the
 * /auth/confirm idle screen. Code first, resend under it: a failed code says
 * "send a new email below".
 *
 * With an address this browser remembers, the code box asks for it
 * prefilled and the resend shows "Sending to … Change". Without one, a
 * single email field serves both, so the student never types it twice.
 *
 * `resendWithCodeOnly` (the idle confirm screen) shows the field and resend
 * only once the code disclosure is open; there the field sits under the
 * disclosure so opening it doesn't move the button. On the cards the field
 * leads the section.
 */
export function ConfirmRecovery({
  rememberedEmail,
  codeLabel,
  codeInitiallyOpen = false,
  resendWithCodeOnly = false,
}: {
  rememberedEmail?: string | null;
  codeLabel: string;
  codeInitiallyOpen?: boolean;
  resendWithCodeOnly?: boolean;
}): JSX.Element {
  const remembered = rememberedEmail?.trim() || null;
  const [codeOpen, setCodeOpen] = useState(codeInitiallyOpen);
  const [typedEmail, setTypedEmail] = useState("");
  const showResend = codeOpen || !resendWithCodeOnly;
  const sharedField = !remembered && showResend;

  const field = sharedField ? (
    <label className="vibe-auth-field">
      <span className="vibe-auth-label-row">
        <span className="vibe-auth-label">Personal email</span>
        <span className="vibe-auth-label-hint">the one you signed up with</span>
      </span>
      <input
        form=""
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="you@gmail.com"
        value={typedEmail}
        onChange={(e) => setTypedEmail(e.target.value)}
        className="vibe-auth-input"
      />
    </label>
  ) : null;

  const codeForm = remembered ? (
    <ConfirmCodeForm initialEmail={remembered} askEmail />
  ) : (
    <ConfirmCodeForm initialEmail={typedEmail} hideEmailField />
  );

  return (
    <div className="vibe-auth-recovery">
      {resendWithCodeOnly ? null : field}

      <div>
        <button
          type="button"
          className="vibe-auth-disclosure"
          aria-expanded={codeOpen}
          onClick={() => setCodeOpen((open) => !open)}
        >
          {codeLabel}
        </button>
        {codeOpen ? (
          resendWithCodeOnly && field ? (
            <div className="vibe-auth-form">
              {field}
              {codeForm}
            </div>
          ) : (
            codeForm
          )
        ) : null}
      </div>

      {showResend ? (
        remembered ? (
          <ResendConfirmation initialEmail={remembered} />
        ) : (
          <ResendConfirmation initialEmail={typedEmail} hideEmailField />
        )
      ) : null}
    </div>
  );
}

/** After "Not you? Sign out": no account here any more, so point at their own. */
function SignedOutCard(): JSX.Element {
  return (
    <div className="vibe-auth-card">
      <CardHead title={SIGNED_OUT_COPY.title} />
      <p role="status" className="vibe-auth-sub">
        {SIGNED_OUT_COPY.body}
      </p>
      <div className="vibe-auth-form">
        <Link href="/auth/signup" className="vibe-auth-submit">
          Sign up
          <span aria-hidden style={{ marginLeft: 8 }}>
            →
          </span>
        </Link>
      </div>
      <p className="vibe-auth-tail">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="vibe-auth-link vibe-auth-link--tap"
          style={{ whiteSpace: "nowrap" }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

/**
 * A confirmation link just signed this browser in, but not as the address
 * this browser signed up with, or no signup is remembered here (the email
 * opened in the Gmail app). A forwarded link would otherwise carry the
 * student into someone else's account and on to binding their IU email to
 * it, so name the account before going on.
 *
 * `destination` is where the page would have gone by itself.
 */
export function SignedInByLinkCard({
  email,
  destination,
}: {
  email: string | null;
  destination: string;
}): JSX.Element {
  const [continuing, setContinuing] = useContinuing();
  const [signedOut, setSignedOut] = useState(false);
  const { signingOut, signOutError, signOut } = useSignOutHere(() =>
    setSignedOut(true),
  );

  if (signedOut) return <SignedOutCard />;

  function onContinue() {
    if (continuing) return;
    setContinuing(true);
    clearPendingSignup();
    // Full navigation so the proxy sees the auth cookies; replace so Back
    // doesn't return to a spent link.
    window.location.replace(destination);
  }

  const copy = SIGNED_IN_BY_LINK_COPY;
  return (
    <div className="vibe-auth-card">
      <CardHead title={copy.title} />
      <p className="vibe-auth-sub" style={{ overflowWrap: "anywhere" }}>
        {email ? <WithEmail text={copy.body} email={email} /> : copy.bodyNoEmail}
      </p>

      <div className="vibe-auth-form">
        <button
          type="button"
          className="vibe-auth-submit"
          disabled={continuing || signingOut}
          onClick={onContinue}
        >
          {copy.primaryLabel}
          <span aria-hidden style={{ marginLeft: 8 }}>
            →
          </span>
        </button>
        <button
          type="button"
          className="vibe-auth-secondary"
          disabled={continuing || signingOut}
          onClick={() => void signOut()}
        >
          {signingOut ? "Signing out…" : copy.signOutLabel}
        </button>
        {signOutError ? (
          <p role="alert" className="vibe-auth-error">
            {signOutError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type AccountRead =
  | { status: "loading" }
  | { status: "signed_in"; email: string | null }
  | { status: "signed_out" }
  | { status: "unreadable" };

/**
 * The honest explanation for an account-confirmation link that didn't sign
 * the student in here, from /auth/confirm or /auth/callback.
 *
 * Renders the `.vibe-auth-card` (brand, title, body, primary action); the
 * page supplies the `.vibe-auth-page` around it. `children` render under the
 * primary action, e.g. the page's own "Confirm my account" retry button for
 * `too_many_tries` and `offline`.
 *
 * `already_signed_in` names the account this browser holds, and offers
 * "Not you? Sign out". Once signed out (or if the session turns out to be
 * gone) the card becomes `signedOutProblem`: what the page would have said
 * with no session here.
 */
export function EmailLinkProblemCard({
  problem,
  signedOutProblem = "unknown",
  email,
  children,
}: {
  problem: EmailLinkProblem;
  signedOutProblem?: EmailLinkProblem;
  email?: string | null;
  children?: ReactNode;
}): JSX.Element {
  const [continuing, setContinuing] = useContinuing();
  const [account, setAccount] = useState<AccountRead>({ status: "loading" });
  const [signedOut, setSignedOut] = useState(false);
  const [seenProblem, setSeenProblem] = useState(problem);
  const { signingOut, signOutError, signOut } = useSignOutHere(() =>
    setSignedOut(true),
  );

  // A page that keeps this card and swaps the outcome (offline → retry →
  // link_used_or_expired) gets the new outcome's starting state. The
  // recovery section below is keyed by the shown outcome so its resend and
  // code state start fresh too.
  if (problem !== seenProblem) {
    setSeenProblem(problem);
    setContinuing(false);
    setAccount({ status: "loading" });
    setSignedOut(false);
  }

  const noSessionHere =
    problem === "already_signed_in" &&
    (signedOut || account.status === "signed_out");
  const shown: EmailLinkProblem = noSessionHere
    ? signedOutProblem === "already_signed_in"
      ? "unknown"
      : signedOutProblem
    : problem;

  // Continue goes into whichever account this browser holds, so name it
  // first. The card only shows this outcome after a session was found, so
  // the client already exists; this is a local read, not a new auth call.
  useEffect(() => {
    if (problem !== "already_signed_in") return;
    let cancelled = false;
    getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setAccount(
          data.session
            ? { status: "signed_in", email: data.session.user.email ?? null }
            : { status: "signed_out" },
        );
      })
      .catch(() => {
        if (!cancelled) setAccount({ status: "unreadable" });
      });
    return () => {
      cancelled = true;
    };
  }, [problem]);

  async function onContinue() {
    if (continuing) return;
    setContinuing(true);
    let dest = "/onboarding";
    try {
      dest = await getPostLoginDestination(getSupabaseBrowserClient(), null);
    } catch {
      // /onboarding forwards already-onboarded users onward.
    }
    // Replace so Back doesn't return to a spent link.
    window.location.replace(dest);
  }

  const copy = EMAIL_LINK_COPY[shown];
  const offersRecovery = OFFERS_RECOVERY.has(shown);
  const signedInEmail =
    account.status === "signed_in" ? account.email : null;
  const isSignedInCard = shown === "already_signed_in";

  return (
    <div className="vibe-auth-card">
      <CardHead title={copy.title} />
      {isSignedInCard ? (
        <p className="vibe-auth-sub" style={{ overflowWrap: "anywhere" }}>
          {signedInEmail ? (
            <WithEmail text={copy.body} email={signedInEmail} />
          ) : (
            SIGNED_IN_NO_EMAIL_BODY
          )}
        </p>
      ) : (
        <p className="vibe-auth-sub">{copy.body}</p>
      )}

      {copy.primaryLabel ? (
        <div className="vibe-auth-form">
          {copy.primaryHref ? (
            <Link href={copy.primaryHref} className="vibe-auth-submit">
              {copy.primaryLabel}
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            </Link>
          ) : (
            <button
              type="button"
              className="vibe-auth-submit"
              // Not until the account it continues into is on screen.
              disabled={continuing || signingOut || !signedInEmail}
              onClick={() => void onContinue()}
            >
              {copy.primaryLabel}
              <span aria-hidden style={{ marginLeft: 8 }}>
                →
              </span>
            </button>
          )}
          {isSignedInCard ? (
            <button
              type="button"
              className="vibe-auth-secondary"
              disabled={continuing || signingOut}
              onClick={() => void signOut()}
            >
              {signingOut ? "Signing out…" : SIGNED_IN_BY_LINK_COPY.signOutLabel}
            </button>
          ) : null}
          {isSignedInCard && signOutError ? (
            <p role="alert" className="vibe-auth-error">
              {signOutError}
            </p>
          ) : null}
        </div>
      ) : null}

      {children}

      {offersRecovery ? (
        <ConfirmRecovery
          key={shown}
          rememberedEmail={email}
          codeLabel="Have the 8-digit code?"
          // A cut link has no primary action; the code is the likeliest way in.
          codeInitiallyOpen={shown === "incomplete_link"}
        />
      ) : null}

      {offersRecovery && !copy.primaryLabel ? (
        <p className="vibe-auth-tail">
          Already confirmed?{" "}
          <Link
            href="/auth/login"
            className="vibe-auth-link vibe-auth-link--tap"
            style={{ whiteSpace: "nowrap" }}
          >
            Sign in
          </Link>
        </p>
      ) : null}
    </div>
  );
}
