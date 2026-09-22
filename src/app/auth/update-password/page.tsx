"use client";

import {
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
  type AuthError,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Same 8–72 rule as signup (`@/lib/auth/password-rules`). The cap is enforced
// on submit, never via maxLength (which truncates silently).
import {
  isPasswordTooLongError,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HINT,
  PASSWORD_TOO_LONG,
  passwordLengthProblem,
} from "@/lib/auth/password-rules";
import { getPostLoginDestination } from "@/lib/auth/post-login";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/** How long "Password updated for …" stays up before we move on: long enough to read which account it was. */
const SUCCESS_PAUSE_MS = 1500;

const OFFLINE_COPY =
  "We couldn't reach Vibe. Check your connection and try again.";
const USED_COPY =
  "This reset link was already used or has expired. Only the newest reset email works.";
const INCOMPLETE_COPY = "This reset link is incomplete or was already used.";
const UNCHECKED_COPY =
  "We couldn't check this reset link. Try again, or send a new reset link.";
const SAME_PASSWORD_COPY = "That's already your password. Pick a different one.";
const TOO_MANY_COPY = "Too many tries. Wait a few minutes, then try again.";
const PWNED_PASSWORD_COPY =
  "That password has shown up in a data breach. Pick a different one.";
const CHARACTERS_PASSWORD_COPY =
  "That password needs more kinds of characters. Mix upper and lowercase letters, numbers and symbols.";
const SHORT_PASSWORD_COPY = "That password is too short. Pick a longer one.";
const WEAK_PASSWORD_COPY =
  "That password is too easy to guess. Pick a longer or less common one.";
const REAUTH_COPY = "To change this password, send a new reset link.";
const SAVE_FAILED_COPY =
  "We couldn't save your new password. Try again, or send a new reset link.";
const SWITCHED_COPY =
  "Something changed in another tab, so we didn't save your password. Send a new reset link to try again.";

/** Copy ending in this phrase renders it as a link to /auth/forgot-password. */
const NEW_LINK_PHRASE = "send a new reset link";

/**
 * The reset token, per tab, once it's out of the address bar: a reload still
 * has it, and it never sits in the URL where history and error reports would
 * keep it. Cleared as soon as the token is spent or reported used.
 */
const RECOVERY_TOKEN_KEY = "vibe.recoveryToken.v1";

function rememberRecoveryToken(tokenHash: string): void {
  try {
    window.sessionStorage.setItem(
      RECOVERY_TOKEN_KEY,
      JSON.stringify({ tokenHash, type: "recovery" }),
    );
  } catch {
    // Private mode / blocked storage: a reload just loses the link.
  }
}

function readRecoveryToken(): string | null {
  try {
    const raw = window.sessionStorage.getItem(RECOVERY_TOKEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { tokenHash?: unknown; type?: unknown } | null;
    if (!v || v.type !== "recovery") return null;
    return typeof v.tokenHash === "string" && v.tokenHash ? v.tokenHash : null;
  } catch {
    return null;
  }
}

function forgetRecoveryToken(): void {
  try {
    window.sessionStorage.removeItem(RECOVERY_TOKEN_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

type View =
  | "checking"
  | "form"
  | "done"
  | "signed_in"
  | "used"
  | "incomplete"
  | "switched"
  | "unchecked"
  | "offline";

type AuthFailure =
  | { kind: "used" }
  | { kind: "incomplete" }
  | { kind: "offline" }
  | { kind: "too_many" }
  /** The link check failed in a way we don't recognise; the token may be unspent. */
  | { kind: "unchecked" }
  | { kind: "message"; message: string };

type SaveOutcome =
  | AuthFailure
  | { kind: "saved"; email: string | null }
  /** The token was spent, but this browser is signed in: offer that account by name. */
  | { kind: "signed_in"; email: string | null }
  /** Another tab put a different account's session here; nothing was saved. */
  | { kind: "switched" };

/** A spent reset token: the account it signed in and the session it created. */
type Verified = { kind: "verified"; userId: string; session: Session };

type ResetLink = {
  tokenHash: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

/** Reads both link shapes: `?token_hash=` (current emails) and `#access_token=` / `#error=` (emails sent before the switch). */
function readResetLink(href: string): ResetLink {
  const url = new URL(href);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const pick = (key: string) => query.get(key) || hash.get(key) || null;
  return {
    tokenHash: query.get("token_hash") || null,
    accessToken: hash.get("access_token") || null,
    refreshToken: hash.get("refresh_token") || null,
    errorCode: pick("error_code") ?? pick("error"),
    errorDescription: pick("error_description"),
  };
}

const USED_OR_EXPIRED_CODES = new Set([
  "otp_expired",
  "flow_state_expired",
  "flow_state_not_found",
  "refresh_token_already_used",
  "refresh_token_not_found",
  "session_expired",
]);

function isLinkUsedOrExpired(
  code: string | null | undefined,
  message: string | null | undefined,
): boolean {
  if (code && USED_OR_EXPIRED_CODES.has(code)) return true;
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("invalid or has expired") ||
    m.includes("expired or is invalid") ||
    m.includes("already used")
  );
}

/** Outcomes that read the same whether checking the link or saving the password; null when it's neither. */
function classifyCommonFailure(error: AuthError): AuthFailure | null {
  if (isAuthRetryableFetchError(error)) return { kind: "offline" };
  // Never show the raw "Auth session missing!" — it means the link is gone.
  // A mangled #access_token (invalid_jwt) is a cut link too.
  if (isAuthSessionMissingError(error) || error.code === "invalid_jwt") {
    return { kind: "incomplete" };
  }
  if (error.status === 429 || error.code === "over_request_rate_limit") {
    return { kind: "too_many" };
  }
  if (isLinkUsedOrExpired(error.code, error.message)) return { kind: "used" };
  return null;
}

/** verifyOtp and setSession: anything unrecognised is "we couldn't check", never the server's message. */
function classifyLinkFailure(error: AuthError): AuthFailure {
  return classifyCommonFailure(error) ?? { kind: "unchecked" };
}

function weakPasswordCopy(reasons: readonly string[]): string {
  if (reasons.includes("pwned")) return PWNED_PASSWORD_COPY;
  if (reasons.includes("characters")) return CHARACTERS_PASSWORD_COPY;
  if (reasons.includes("length")) return SHORT_PASSWORD_COPY;
  return WEAK_PASSWORD_COPY;
}

/** updateUser: our own copy for every case, never the server's message. */
function classifyPasswordFailure(error: AuthError): AuthFailure {
  const common = classifyCommonFailure(error);
  if (common) return common;
  if (error.code === "same_password") {
    return { kind: "message", message: SAME_PASSWORD_COPY };
  }
  // GoTrue's 72-byte refusal; without this it falls through to SAVE_FAILED_COPY.
  if (isPasswordTooLongError(error)) {
    return { kind: "message", message: PASSWORD_TOO_LONG };
  }
  if (isAuthWeakPasswordError(error)) {
    return { kind: "message", message: weakPasswordCopy(error.reasons) };
  }
  // Secure password change on an older sign-in: a fresh reset link covers it.
  if (
    error.code === "reauthentication_needed" ||
    error.code === "reauthentication_not_valid" ||
    error.code === "reauth_nonce_missing"
  ) {
    return { kind: "message", message: REAUTH_COPY };
  }
  return { kind: "message", message: SAVE_FAILED_COPY };
}

type AuthTask = Promise<AuthFailure | null>;
type VerifyTask = Promise<AuthFailure | Verified>;

/**
 * One request per link — a double tap, a double submit or React Strict Mode
 * would otherwise spend the token and then report it as used. Only final
 * answers are kept: success (null, or "verified") and a spent link. Anything
 * else (offline, a 429, an answer we don't recognise) may have left the token
 * unspent, so the next tap reaches the network again.
 */
function runOncePerKey<T extends { kind: string } | null>(
  cache: Map<string, Promise<T>>,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  let task = cache.get(key);
  if (!task) {
    task = run();
    cache.set(key, task);
    void task.then((result) => {
      const final =
        result === null || result.kind === "used" || result.kind === "verified";
      if (!final) cache.delete(key);
    });
  }
  return task;
}

const recoveryVerifyByTokenHash = new Map<string, VerifyTask>();

function verifyRecoveryOnce(
  supabase: SupabaseClient,
  tokenHash: string,
): VerifyTask {
  return runOncePerKey(recoveryVerifyByTokenHash, tokenHash, () =>
    // verifyOtp doesn't wait for the client's start-up (same guard as
    // /auth/confirm). Let it finish loading any stored session first, so a
    // stale one refreshing late can't overwrite or remove the recovery
    // session, and updateUser can't land on the wrong account.
    supabase.auth
      .initialize()
      .then(() =>
        supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }),
      )
      .then(({ data, error }): AuthFailure | Verified => {
        if (error) return classifyLinkFailure(error);
        const session = data.session;
        if (!session) return { kind: "incomplete" };
        return {
          kind: "verified",
          userId: data.user?.id ?? session.user.id,
          session,
        };
      })
      .catch((): AuthFailure => ({ kind: "offline" })),
  );
}

const hashSessionByKey = new Map<string, AuthTask>();

function setSessionFromHashOnce(
  supabase: SupabaseClient,
  access_token: string,
  refresh_token: string,
): AuthTask {
  return runOncePerKey(
    hashSessionByKey,
    `${access_token}::${refresh_token}`,
    () =>
      supabase.auth
        .setSession({ access_token, refresh_token })
        .then(({ error }) => (error ? classifyLinkFailure(error) : null))
        .catch((): AuthFailure => ({ kind: "offline" })),
  );
}

/** The account this browser is signed in to, or null. Runs only after the client has started, never on page load. */
async function readSignedInUser(
  supabase: SupabaseClient,
): Promise<{ email: string | null } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session ? { email: data.session.user.email ?? null } : null;
  } catch {
    return null;
  }
}

/** The user id of the session this browser holds, or null. */
async function readSessionUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/**
 * verifyOtp stores its session without taking the client's lock, so a
 * refresh or a sign-in in another tab can store a different account's
 * session right after it. Before saving, make sure the session updateUser
 * will use belongs to the account the reset link signed in, putting the
 * link's session back once if it doesn't. False: still another account.
 */
async function holdRecoverySession(
  supabase: SupabaseClient,
  recovery: Verified,
): Promise<boolean> {
  if ((await readSessionUserId(supabase)) === recovery.userId) return true;
  try {
    await supabase.auth.setSession({
      access_token: recovery.session.access_token,
      refresh_token: recovery.session.refresh_token,
    });
  } catch {
    // Checked below either way.
  }
  return (await readSessionUserId(supabase)) === recovery.userId;
}

/**
 * Spends the reset token (once) when there is one, then saves the password
 * on the session that created, or on the session this browser already has.
 * `onTokenDone` fires once the token can't be used again, so the caller
 * stops sending it and drops it from the URL and this tab's storage. When
 * the token signed an account in, it gets that account and session; pass
 * them back as `recovery` on later submits so every save checks the session
 * still belongs to that account.
 */
async function saveNewPassword(
  supabase: SupabaseClient,
  tokenHash: string | null,
  password: string,
  onTokenDone: (recovery?: Verified) => void,
  recovery: Verified | null = null,
): Promise<SaveOutcome> {
  let held = recovery;
  if (tokenHash) {
    const verified = await verifyRecoveryOnce(supabase, tokenHash);
    if (verified.kind === "used") {
      onTokenDone();
      // Tapped again after an earlier reset, or in a second tab: the token
      // is gone, but a real session here can still set a password. Name it
      // rather than assume whose it is.
      const user = await readSignedInUser(supabase);
      return user ? { kind: "signed_in", email: user.email } : verified;
    }
    if (verified.kind !== "verified") return verified;
    // Spent. A second submit (say, after "pick a different password") or a
    // reload must reuse the recovery session, not replay the token.
    onTokenDone(verified);
    held = verified;
  }
  if (held && !(await holdRecoverySession(supabase, held))) {
    return { kind: "switched" };
  }
  try {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) return classifyPasswordFailure(error);
    return { kind: "saved", email: data.user?.email ?? null };
  } catch {
    return { kind: "offline" };
  }
}

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("checking");
  /** The signed-in account a password would change, when we know it without a token. */
  const [account, setAccount] = useState<string | null>(null);
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [continuing, setContinuing] = useState(false);
  const tokenHashRef = useRef<string | null>(null);
  /** The account and session a spent reset link signed in; every save re-checks it. */
  const recoveryRef = useRef<Verified | null>(null);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const link = readResetLink(window.location.href);

      if (link.tokenHash) {
        // Scanner-safe: no Supabase client and no network call on load. Outlook
        // Safe Links or Gmail fetching this page leaves the token unspent; it
        // is spent only when the student submits a new password.
        tokenHashRef.current = link.tokenHash;
        // Out of the address bar, history and error reports right away. This
        // tab keeps it, so a reload still works.
        rememberRecoveryToken(link.tokenHash);
        window.history.replaceState(null, "", window.location.pathname);
        setView("form");
        return;
      }

      if (link.errorCode || link.errorDescription) {
        // An older email whose GoTrue link was already spent (`#error=…`).
        setView(
          isLinkUsedOrExpired(link.errorCode, link.errorDescription)
            ? "used"
            : "incomplete",
        );
        return;
      }

      if (!(link.accessToken && link.refreshToken)) {
        // A reload after the token left the URL: same token, and still no
        // Supabase client or network call until the student submits.
        const storedTokenHash = readRecoveryToken();
        if (storedTokenHash) {
          tokenHashRef.current = storedTokenHash;
          setView("form");
          return;
        }
      }

      const supabase = getSupabaseBrowserClient();

      if (link.accessToken && link.refreshToken) {
        // Reset emails sent before the token_hash switch still land here with
        // implicit tokens in the hash. A PKCE client refuses to read those
        // itself, so set the session by hand.
        const failure = await setSessionFromHashOnce(
          supabase,
          link.accessToken,
          link.refreshToken,
        );
        if (cancelled) return;
        if (
          failure?.kind === "offline" ||
          failure?.kind === "unchecked" ||
          failure?.kind === "too_many"
        ) {
          // Keep the hash so "Try again" can retry the same tokens.
          setView(failure.kind === "offline" ? "offline" : "unchecked");
          return;
        }
        window.history.replaceState(null, "", window.location.pathname);
        if (failure) {
          setView(failure.kind === "used" ? "used" : "incomplete");
          return;
        }
        const user = await readSignedInUser(supabase);
        if (cancelled) return;
        setAccount(user?.email ?? null);
        setView("form");
        return;
      }

      // No link at all: only someone already signed in (or with a recovery
      // session from an earlier tap) can set a password here.
      const { data, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setAccount(data.session.user.email ?? null);
        setView("form");
      } else if (sessionErr && isAuthRetryableFetchError(sessionErr)) {
        setView("offline");
      } else setView("incomplete");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Continue stays disabled while the page navigates away; re-arm it if the
  // browser restores this page from the back/forward cache.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setContinuing(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function onContinue() {
    if (continuing) return;
    setContinuing(true);
    let dest = "/onboarding";
    try {
      dest = await getPostLoginDestination(getSupabaseBrowserClient(), null);
    } catch {
      // /onboarding forwards already-onboarded users onward.
    }
    window.location.assign(dest);
  }

  function onSetPasswordHere() {
    setError(null);
    setView("form");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);
    // Validate the 8–72 rule instead of letting the input truncate. A
    // maxLength here silently cut a pasted password down to the cap (20
    // then), so a password manager could create (or reset to) a credential
    // the user never saw and could not reproduce at login. Never add one.
    const lengthProblem = passwordLengthProblem(password);
    if (lengthProblem) {
      setError(lengthProblem.message);
      return;
    }
    submittingRef.current = true;
    setLoading(true);

    const outcome = await saveNewPassword(
      getSupabaseBrowserClient(),
      tokenHashRef.current,
      password,
      (recovery) => {
        tokenHashRef.current = null;
        if (recovery) recoveryRef.current = recovery;
        forgetRecoveryToken();
        window.history.replaceState(null, "", window.location.pathname);
      },
      recoveryRef.current,
    );

    if (outcome.kind !== "saved") {
      submittingRef.current = false;
      setLoading(false);
      if (outcome.kind === "signed_in") {
        setAccount(outcome.email);
        setView("signed_in");
      } else if (
        outcome.kind === "used" ||
        outcome.kind === "incomplete" ||
        outcome.kind === "switched"
      ) {
        setView(outcome.kind);
      } else if (outcome.kind === "offline") setError(OFFLINE_COPY);
      else if (outcome.kind === "too_many") setError(TOO_MANY_COPY);
      else if (outcome.kind === "unchecked") setError(UNCHECKED_COPY);
      else setError(outcome.message);
      return;
    }

    // The recovery session signed the student in, so go straight on instead
    // of sending them back to log in — after saying which account changed.
    setSavedFor(outcome.email);
    setView("done");
    const [dest] = await Promise.all([
      getPostLoginDestination(getSupabaseBrowserClient(), null).catch(
        () => "/onboarding",
      ),
      new Promise((resolve) => setTimeout(resolve, SUCCESS_PAUSE_MS)),
    ]);
    // Full navigation so the proxy always sees the new auth cookies.
    window.location.assign(dest);
  }

  if (view === "checking") {
    return (
      <div className="vibe-auth-page">
        <p className="vibe-auth-loading">Loading…</p>
      </div>
    );
  }

  return (
    <div className="vibe-auth-page">
      <Link href="/auth/login" className="vibe-auth-back">
        <span aria-hidden>←</span> back
      </Link>

      <div className="vibe-auth-card">
        <div className="vibe-auth-brand" aria-hidden>
          vibe<span className="vibe-auth-dot">.</span>
        </div>

        <h1 className="vibe-auth-headline">
          New password<span className="vibe-auth-dot">.</span>
        </h1>

        {view === "form" ? (
          <>
            <p className="vibe-auth-sub" style={{ overflowWrap: "anywhere" }}>
              {account ? (
                <>
                  Choose a new password for <strong>{account}</strong>.
                </>
              ) : (
                "Choose a new password for your account."
              )}
            </p>

            <form onSubmit={onSubmit} className="vibe-auth-form">
              <div className="vibe-auth-field">
                <span className="vibe-auth-label-row">
                  <label htmlFor="new-password" className="vibe-auth-label">
                    New password
                  </label>
                  <span className="vibe-auth-label-hint">{PASSWORD_HINT}</span>
                </span>
                <div style={{ position: "relative" }}>
                  <input
                    id="new-password"
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
                    aria-controls="new-password"
                    aria-pressed={showPassword}
                    style={toggleStyle}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {error ? (
                <p className="vibe-auth-error" role="alert">
                  <CopyWithNewLink text={error} />
                </p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="vibe-auth-submit"
              >
                {loading ? "Saving…" : "Update password"}
                {loading ? null : (
                  <span aria-hidden style={{ marginLeft: 8 }}>
                    →
                  </span>
                )}
              </button>
            </form>
          </>
        ) : null}

        {view === "done" ? (
          <div
            className="vibe-auth-banner vibe-auth-banner--success"
            role="status"
            style={{ overflowWrap: "anywhere" }}
          >
            {savedFor ? (
              <>
                Password updated for <strong>{savedFor}</strong>.
              </>
            ) : (
              "Password updated."
            )}
          </div>
        ) : null}

        {view === "signed_in" ? (
          <>
            <p className="vibe-auth-sub">This reset link was already used.</p>
            <div
              role="status"
              className="vibe-auth-banner vibe-auth-banner--info"
              style={{ overflowWrap: "anywhere" }}
            >
              <strong>
                You&apos;re already signed in
                {account ? null : "."}
              </strong>
              {account ? (
                <>
                  {" "}
                  as <strong>{account}</strong>.
                </>
              ) : null}{" "}
              You can set a new password for this account now.
            </div>
            <div className="vibe-auth-form">
              <button
                type="button"
                className="vibe-auth-submit"
                onClick={onSetPasswordHere}
              >
                Set a new password
                <span aria-hidden style={{ marginLeft: 8 }}>
                  →
                </span>
              </button>
              <button
                type="button"
                className="vibe-auth-secondary"
                disabled={continuing}
                onClick={() => void onContinue()}
                style={{ marginTop: 10 }}
              >
                Continue
              </button>
            </div>
          </>
        ) : null}

        {view === "used" || view === "incomplete" || view === "switched" ? (
          <div className="vibe-auth-form">
            <p className="vibe-auth-error" role="alert">
              {view === "used"
                ? USED_COPY
                : view === "switched"
                  ? SWITCHED_COPY
                  : INCOMPLETE_COPY}
            </p>
            <Link
              href="/auth/forgot-password"
              className="vibe-auth-submit"
              style={linkButtonStyle}
            >
              Send a new reset link
            </Link>
          </div>
        ) : null}

        {view === "offline" || view === "unchecked" ? (
          <div className="vibe-auth-form">
            <p className="vibe-auth-error" role="alert">
              {view === "offline" ? (
                OFFLINE_COPY
              ) : (
                <CopyWithNewLink text={UNCHECKED_COPY} />
              )}
            </p>
            <button
              type="button"
              className="vibe-auth-submit"
              onClick={() => window.location.reload()}
            >
              Try again
            </button>
          </div>
        ) : null}

        {view === "signed_in" ? (
          <p className="vibe-auth-tail">
            Not your account?{" "}
            <Link
              href="/auth/forgot-password"
              className="vibe-auth-link vibe-auth-link--tap"
            >
              Send a new reset link
            </Link>
          </p>
        ) : view !== "done" ? (
          <p className="vibe-auth-tail">
            <Link
              href="/auth/login"
              className="vibe-auth-link vibe-auth-link--tap"
            >
              Back to log in
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Renders "…send a new reset link." with the phrase as a link, so the copy says where to go and is the way there. */
function CopyWithNewLink({ text }: { text: string }) {
  const at = text.lastIndexOf(NEW_LINK_PHRASE);
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Link
        href="/auth/forgot-password"
        className="vibe-auth-link vibe-auth-link--tap"
      >
        {NEW_LINK_PHRASE}
      </Link>
      {text.slice(at + NEW_LINK_PHRASE.length)}
    </>
  );
}

/** 16px keeps iOS Safari from zooming on focus (the shared input class is 16px too); the right padding clears the toggle. */
const passwordInputStyle: React.CSSProperties = {
  fontSize: 16,
  paddingRight: 76,
};

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
  color: "#ff5c35",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const linkButtonStyle: React.CSSProperties = {
  textDecoration: "none",
  marginTop: 0,
};
