"use client";

import {
  isAuthRetryableFetchError,
  type AuthError,
  type EmailOtpType,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  ConfirmRecovery,
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
import {
  clearPendingSignup,
  readPendingSignupEmail,
} from "@/lib/auth/pending-signup";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type VerifyOutcome = { session: Session | null; error: AuthError | null };

/** One /verify per token: a double tap or a remount reuses the first request. */
const verifyByTokenHash = new Map<string, Promise<VerifyOutcome>>();

function verifyTokenHashOnce(
  supabase: SupabaseClient,
  tokenHash: string,
  type: EmailOtpType,
): Promise<VerifyOutcome> {
  let task = verifyByTokenHash.get(tokenHash);
  if (!task) {
    task = (async () => {
      // verifyOtp doesn't wait for the client's start-up. Let it finish
      // loading any stored session first, so a stale one that fails to
      // refresh can't be removed right after the new session is saved.
      await supabase.auth.initialize();
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      return { session: data.session, error };
    })();
    verifyByTokenHash.set(tokenHash, task);
    // A network failure or rate limit left the token unused: the retry
    // button must make a fresh request, not replay this one.
    task.then(
      ({ error }) => {
        if (error && (isAuthRetryableFetchError(error) || error.status === 429)) {
          verifyByTokenHash.delete(tokenHash);
        }
      },
      () => verifyByTokenHash.delete(tokenHash),
    );
  }
  return task;
}

type Phase =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "confirmed" }
  | { kind: "signed_in_by_link"; email: string | null }
  | {
      kind: "problem";
      problem: EmailLinkProblem;
      /** What the card becomes after "Not you? Sign out". */
      signedOutProblem: EmailLinkProblem;
    };

/** Nothing was used up by these; the card's advice is "tap the button again". */
function isRetryable(problem: EmailLinkProblem): boolean {
  return problem === "too_many_tries" || problem === "offline";
}

/**
 * Takes token_hash and type out of the address bar and this history entry
 * once the outcome is final, so the token doesn't sit in history, a copied
 * URL or a screenshot. Other params stay. Not while a retry is still
 * possible: the page keeps its own copy, but a reload needs the URL.
 */
function removeTokenFromAddressBar() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("token_hash") && !url.searchParams.has("type")) {
      return;
    }
    url.searchParams.delete("token_hash");
    url.searchParams.delete("type");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {
    // The outcome still shows; the token just stays in the address bar.
  }
}

/** localStorage has no change event worth following here; read it once per render. */
function subscribeToNothing() {
  return () => {};
}

/**
 * Tap-to-confirm page the "Confirm your Vibe account" email links to
 * (`?token_hash=…&type=email`).
 *
 * It makes no auth call and creates no Supabase client until the student
 * taps: link scanners (Microsoft Safe Links, Gmail) GET the URL before the
 * student does, and a GET that verified would use up the one-time token.
 * verifyOtp({ token_hash }) signs in whichever browser or mail app this is;
 * no PKCE verifier is involved, so it works away from the signup browser.
 *
 * Because it signs in wherever it's opened, a forwarded link signs in as
 * the sender's account. It goes straight on only when the account is the
 * one this browser signed up with; otherwise a card names the account and
 * offers "Not you? Sign out".
 *
 * `next` is ignored: the destination is always POST_EMAIL_CONFIRM_PATH, so
 * the email link carries no redirect.
 */
function ConfirmInner() {
  const searchParams = useSearchParams();
  // Read once: the address bar loses the token when the outcome is final,
  // and a retry or a back/forward-cache restore still needs it.
  const [link] = useState(() => {
    const { tokenHash, type } = readAuthUrlParams(`?${searchParams.toString()}`);
    const otpType: EmailOtpType = type === "signup" ? "signup" : "email";
    return { tokenHash, otpType };
  });
  const { tokenHash, otpType } = link;
  const pendingEmail = useSyncExternalStore(
    subscribeToNothing,
    readPendingSignupEmail,
    () => null,
  );
  const [phase, setPhase] = useState<Phase>(() =>
    tokenHash
      ? { kind: "idle" }
      : {
          kind: "problem",
          problem: "incomplete_link",
          signedOutProblem: "incomplete_link",
        },
  );
  const inFlight = useRef(false);

  // The page stays on "confirming" while it navigates away. If iOS Safari
  // or an in-app browser restores it from the back/forward cache, re-arm the
  // button; a second tap replays the finished request instead of a new one.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      inFlight.current = false;
      setPhase((p) =>
        p.kind === "confirming" || p.kind === "confirmed"
          ? { kind: "idle" }
          : p,
      );
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function onConfirm() {
    if (!tokenHash || inFlight.current) return;
    inFlight.current = true;
    setPhase({ kind: "confirming" });
    let leaving = false;
    try {
      const supabase = getSupabaseBrowserClient();
      const { session, error } = await verifyTokenHashOnce(
        supabase,
        tokenHash,
        otpType,
      );
      if (!error) {
        removeTokenFromAddressBar();
        if (!session) {
          // Confirmed, but no session came back: let them sign in.
          clearPendingSignup();
          setPhase({
            kind: "problem",
            problem: "confirmed_sign_in",
            signedOutProblem: "confirmed_sign_in",
          });
          return;
        }
        const email = session.user.email ?? null;
        if (!isSameEmail(email, readPendingSignupEmail())) {
          // Not the signup this browser remembers (or none is): name the
          // account before anything happens in it.
          setPhase({ kind: "signed_in_by_link", email });
          return;
        }
        clearPendingSignup();
        leaving = true;
        setPhase({ kind: "confirmed" });
        // Full navigation so the proxy sees the new auth cookies; replace so
        // Back doesn't return to a spent link.
        window.location.replace(POST_EMAIL_CONFIRM_PATH);
        return;
      }
      const networkError = isAuthRetryableFetchError(error);
      // Only a spent or rejected token can mean "this browser already did
      // it". A network failure or rate limit left the link unused, so a
      // session here says nothing about this link.
      let hasSession = false;
      if (!networkError && error.status !== 429) {
        try {
          const { data } = await supabase.auth.getSession();
          hasSession = Boolean(data.session);
        } catch {
          // The token was still rejected: say why from its error below,
          // not "We couldn't reach Vibe".
        }
      }
      const facts = {
        hasCode: false,
        hasToken: true,
        errorCode: error.code,
        errorDescription: error.message,
        status: error.status,
        networkError,
      };
      const problem = classifyEmailLinkProblem({ ...facts, hasSession });
      if (!isRetryable(problem)) removeTokenFromAddressBar();
      setPhase({
        kind: "problem",
        problem,
        signedOutProblem: classifyEmailLinkProblem({
          ...facts,
          hasSession: false,
        }),
      });
    } catch {
      setPhase({
        kind: "problem",
        problem: "offline",
        signedOutProblem: "offline",
      });
    } finally {
      if (!leaving) inFlight.current = false;
    }
  }

  const confirmButtonLabel = (
    <>
      Confirm my account
      <span aria-hidden style={{ marginLeft: 8 }}>
        →
      </span>
    </>
  );

  if (phase.kind === "signed_in_by_link") {
    return (
      <div className="vibe-auth-page">
        <SignedInByLinkCard
          email={phase.email}
          destination={POST_EMAIL_CONFIRM_PATH}
        />
      </div>
    );
  }

  if (phase.kind === "problem") {
    return (
      <div className="vibe-auth-page">
        <EmailLinkProblemCard
          problem={phase.problem}
          signedOutProblem={phase.signedOutProblem}
          email={pendingEmail}
        >
          {isRetryable(phase.problem) && tokenHash ? (
            <div className="vibe-auth-form">
              <button
                type="button"
                className="vibe-auth-submit"
                onClick={() => void onConfirm()}
              >
                {confirmButtonLabel}
              </button>
            </div>
          ) : null}
        </EmailLinkProblemCard>
      </div>
    );
  }

  return (
    <div className="vibe-auth-page">
      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        <h1 className="vibe-auth-headline">
          Confirm your account<span className="vibe-auth-dot">.</span>
        </h1>
        <p className="vibe-auth-sub">
          Tap below to finish. We wait for your tap so email security scanners
          can&apos;t use up your link.
        </p>

        {phase.kind === "confirmed" ? (
          <div
            role="status"
            className="vibe-auth-banner vibe-auth-banner--success"
          >
            You&apos;re confirmed. Taking you to the next step…
          </div>
        ) : (
          <>
            <div className="vibe-auth-form">
              <button
                type="button"
                className="vibe-auth-submit"
                disabled={phase.kind === "confirming"}
                onClick={() => void onConfirm()}
              >
                {phase.kind === "confirming" ? "Confirming…" : confirmButtonLabel}
              </button>
            </div>

            {/* Creates no client until the code or resend is tapped. */}
            <ConfirmRecovery
              rememberedEmail={pendingEmail}
              codeLabel="Have the 8-digit code instead?"
              resendWithCodeOnly
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="vibe-auth-page">
          <p className="vibe-auth-loading">Loading…</p>
        </div>
      }
    >
      <ConfirmInner />
    </Suspense>
  );
}
