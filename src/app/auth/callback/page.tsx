"use client";

import type { AuthError, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import {
  EmailLinkProblemCard,
  SignedInByLinkCard,
} from "@/components/auth/EmailLinkProblem";
import { POST_EMAIL_CONFIRM_PATH } from "@/lib/auth/email-confirm-redirect";
import {
  classifyEmailLinkProblem,
  isSameEmail,
  readAuthUrlParams,
  type EmailLinkProblem,
} from "@/lib/auth/email-link-errors";
import { isSafeRelativePath } from "@/lib/auth/login-next";
import {
  clearPendingSignup,
  readPendingSignupEmail,
} from "@/lib/auth/pending-signup";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function safeNextPath(next: string | null): string | null {
  return isSafeRelativePath(next) ? next : null;
}

/** A hash-token sign-in, with the address of the account it signed in as. */
type HashSignIn = { error: AuthError | null; email: string | null };

const hashSessionByKey = new Map<string, Promise<HashSignIn>>();

function setSessionFromHashOnce(
  supabase: SupabaseClient,
  access_token: string,
  refresh_token: string,
): Promise<HashSignIn> {
  const key = `${access_token}::${refresh_token}`;
  let task = hashSessionByKey.get(key);
  if (!task) {
    task = supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ data, error }) => ({
        error,
        email: data.session?.user.email ?? null,
      }));
    hashSessionByKey.set(key, task);
  }
  return task;
}

async function waitForBrowserSession(
  supabase: SupabaseClient,
  attempts = 12,
  delayMs = 50,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * The user id an `#access_token` belongs to, read without verifying it. Only
 * used to tell whether a session already in this browser is the link's own
 * account; a forged value can at most match a session this browser already
 * holds, which still has to pass the signup-address check below.
 */
function accessTokenUserId(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

/**
 * The card for a callback that didn't sign this browser in with this link.
 *
 * A session here that the link didn't create is some account this browser
 * already holds, possibly someone else's on a shared phone: name it on the
 * already_signed_in card rather than walking into it.
 *
 * Any `?code=` without that is "confirmed": GoTrue's /verify only redirects
 * with a code after confirming the account. Whether this browser holds no
 * PKCE verifier, the exchange was refused or the connection dropped, the
 * true next step is signing in with the password.
 */
function callbackProblem(i: {
  hasCode: boolean;
  hasHashTokens: boolean;
  hasSession: boolean;
  errorCode: string | null | undefined;
  errorDescription: string | null | undefined;
}): EmailLinkProblem {
  return classifyEmailLinkProblem({
    hasCode: i.hasCode,
    // Hash tokens that wouldn't set a session are a spent or broken link,
    // not a cut one.
    hasToken: i.hasHashTokens,
    hasSession: i.hasSession,
    errorCode: i.errorCode,
    errorDescription: i.errorDescription,
  });
}

function stripUrlHash() {
  if (window.location.hash) {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}

type Outcome =
  | {
      kind: "problem";
      problem: EmailLinkProblem;
      /** What the card becomes after "Not you? Sign out". */
      signedOutProblem: EmailLinkProblem;
      email: string | null;
    }
  | { kind: "signed_in_by_link"; email: string | null; destination: string };

/**
 * Fallback for account-confirmation emails that still link here: ones sent
 * before the template moved to /auth/confirm (`?code=`, PKCE) and resent
 * emails (`#access_token`). Either way GoTrue's /verify already confirmed
 * the account before redirecting here; this page only tries to sign in.
 *
 * The client exchanges `?code=` by itself while it starts up, once, and only
 * in the browser holding the PKCE verifier (the signup browser). This page
 * used to exchange the same code again; the verifier was gone by then, so
 * every same-browser tap signed in and then showed "invalid or expired".
 * Now it only waits for that session, and when there is none it says what
 * actually happened instead of redirecting to one error for everything.
 *
 * It goes straight on only when this link signed the browser in, and into
 * this browser's own signup: a `?code=` is bound to the signup browser's
 * verifier, but an `#access_token` signs in wherever it's opened, so a
 * forwarded one would land in the sender's account. That, or a session that
 * was already here, gets a card that names the account instead.
 */
export default function AuthCallbackPage() {
  const ran = useRef(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      // Read the URL before the client exists: its start-up exchanges and
      // strips `?code=`.
      const params = readAuthUrlParams(window.location.href);
      const { accessToken, refreshToken } = params;
      const hasHashTokens = Boolean(accessToken && refreshToken);
      const hasErrorParams = Boolean(
        params.error || params.errorCode || params.errorDescription,
      );

      if (!params.code && !hasHashTokens && !hasErrorParams) {
        setOutcome({
          kind: "problem",
          problem: "incomplete_link",
          signedOutProblem: "incomplete_link",
          email: readPendingSignupEmail(),
        });
        return;
      }

      let hashError: AuthError | null = null;
      let signedInByLink = false;
      // The account a hash-token link signed this browser in as.
      let linkEmail: string | null = null;
      let hasSession = false;
      try {
        const supabase = getSupabaseBrowserClient();
        // Waits for start-up, including its one `?code=` exchange, and hands
        // back that start-up's error; getSession() doesn't report it.
        const { error: startupError } = await supabase.auth.initialize();
        const { data } = await supabase.auth.getSession();
        const existing = data.session;

        if (params.code) {
          // auth-js removes `?code=` from the address bar only after its
          // exchange succeeded; without a verifier here it never tries, and
          // a start-up error means GoTrue refused it.
          const codeStillInUrl = new URL(
            window.location.href,
          ).searchParams.has("code");
          signedInByLink =
            !startupError && Boolean(existing) && !codeStillInUrl;
        } else if (accessToken && refreshToken) {
          if (existing) {
            // Don't set the link's session over one that's here: if its
            // token has to refresh and can't, auth-js signs this browser
            // out. It counts only when it's the link's own account.
            signedInByLink =
              existing.user.id === accessTokenUserId(accessToken);
            linkEmail = existing.user.email ?? null;
          } else {
            // A PKCE client refuses to pick up `#access_token` by itself
            // (start-up's error for that is expected and ignored), and
            // resent emails arrive that way.
            const hashSignIn = await setSessionFromHashOnce(
              supabase,
              accessToken,
              refreshToken,
            );
            hashError = hashSignIn.error;
            linkEmail = hashSignIn.email;
            signedInByLink = !hashError;
          }
        }

        hasSession = signedInByLink
          ? await waitForBrowserSession(supabase)
          : Boolean(existing);
      } catch {
        // No session here; the card below still tells the truth.
      }

      // Session tokens don't belong in the address bar or history either way.
      stripUrlHash();

      if (signedInByLink && hasSession) {
        const destination =
          safeNextPath(params.next) ?? POST_EMAIL_CONFIRM_PATH;
        if (
          params.code ||
          isSameEmail(linkEmail, readPendingSignupEmail())
        ) {
          clearPendingSignup();
          window.location.replace(destination);
          return;
        }
        setOutcome({ kind: "signed_in_by_link", email: linkEmail, destination });
        return;
      }

      const facts = {
        hasCode: Boolean(params.code),
        hasHashTokens,
        errorCode: params.errorCode ?? hashError?.code,
        errorDescription: params.errorDescription ?? hashError?.message,
      };
      setOutcome({
        kind: "problem",
        problem: callbackProblem({ ...facts, hasSession }),
        signedOutProblem: callbackProblem({ ...facts, hasSession: false }),
        email: readPendingSignupEmail(),
      });
    })();
  }, []);

  if (outcome?.kind === "signed_in_by_link") {
    return (
      <div className="vibe-auth-page">
        <SignedInByLinkCard
          email={outcome.email}
          destination={outcome.destination}
        />
      </div>
    );
  }

  if (outcome) {
    return (
      <div className="vibe-auth-page">
        <EmailLinkProblemCard
          problem={outcome.problem}
          signedOutProblem={outcome.signedOutProblem}
          email={outcome.email}
        />
      </div>
    );
  }

  return (
    <div className="vibe-auth-page">
      <p role="status" className="vibe-auth-loading">
        Signing you in…
      </p>
    </div>
  );
}
