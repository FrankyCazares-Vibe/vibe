import {
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  isAuthWeakPasswordError,
} from "@supabase/supabase-js";

import { isPasswordTooLongError, PASSWORD_TOO_LONG } from "@/lib/auth/password-rules";

/**
 * What the "Choose your password" screen (src/app/auth/choose-password) says
 * when saving the password fails (pre-registration fix, Oct 2026), and when
 * it will not save because another tab changed the account (sessionCheckMessage).
 *
 * Always our own words, never GoTrue's or the browser's. A small mapper of
 * its own on purpose, so the reset page that every "Forgot password" depends
 * on (src/app/auth/update-password/page.tsx) is not touched; the weak-password
 * wording follows that page.
 *
 * `same_password` is not a failure here: it means this password is already
 * the one stored (a retry after a save that did land), so the screen carries
 * on and never asks this mapper about it.
 *
 * Client-safe: the choose screen's form imports it.
 */

export const OFFLINE_COPY = "We couldn't reach Vibe. Check your connection and try again.";
export const TOO_MANY_COPY = "Too many tries. Wait a few minutes, then try again.";
export const PWNED_PASSWORD_COPY = "That password has shown up in a data breach. Pick a different one.";
export const CHARACTERS_PASSWORD_COPY =
  "That password needs more kinds of characters. Mix upper and lowercase letters, numbers and symbols.";
export const SHORT_PASSWORD_COPY = "That password is too short. Pick a longer one.";
export const WEAK_PASSWORD_COPY = "That password is too easy to guess. Pick a longer or less common one.";
export const SAVE_FAILED_COPY = "We could not save your password. Try again.";

/**
 * Copy that ends in this phrase renders it as a link to /auth/forgot-password,
 * so the words say where to go and are the way there.
 */
export const RESET_LINK_PHRASE = "send yourself a reset link";

/**
 * Secure password change is on and this sign-in is older than it allows
 * (GoTrue then wants a fresh sign-in, which an account with no password
 * cannot do). A reset link from the inbox signs in fresh.
 */
export const REAUTH_COPY = `To finish, ${RESET_LINK_PHRASE}.`;

/**
 * The session is gone (signed out in another tab, or ended on the server).
 * With no password stored, the inbox is the only way back in.
 */
export const SIGNED_OUT_COPY = `You were signed out. To finish, ${RESET_LINK_PHRASE}.`;

/**
 * Copy that ends in this phrase renders it as a button that reloads the page,
 * which draws the screen again for whoever this browser is signed in as now.
 */
export const RELOAD_PHRASE = "reload this page";

/**
 * Another tab signed this browser in to a different account since the page
 * was drawn. Sessions live in cookies every tab shares, so saving would put
 * the password on that other account; nothing is saved.
 */
export const SWITCHED_COPY = `Something changed in another tab, so we did not save your password. To continue, ${RELOAD_PHRASE}.`;

const REAUTH_CODES = new Set(["reauthentication_needed", "reauthentication_not_valid", "reauth_nonce_missing"]);
const SESSION_GONE_CODES = new Set(["session_not_found", "refresh_token_not_found", "refresh_token_already_used"]);

type ErrorShape = { code?: unknown; status?: unknown };

function errorCode(error: unknown): string | null {
  const code = typeof error === "object" && error !== null ? (error as ErrorShape).code : null;
  return typeof code === "string" ? code : null;
}

function errorStatus(error: unknown): number | null {
  const status = typeof error === "object" && error !== null ? (error as ErrorShape).status : null;
  return typeof status === "number" ? status : null;
}

function weakPasswordCopy(reasons: readonly string[]): string {
  if (reasons.includes("pwned")) return PWNED_PASSWORD_COPY;
  if (reasons.includes("characters")) return CHARACTERS_PASSWORD_COPY;
  if (reasons.includes("length")) return SHORT_PASSWORD_COPY;
  return WEAK_PASSWORD_COPY;
}

/**
 * What to say when `updateUser({ password })` answers with an error (or
 * throws). Checked in order: offline, signed out, too many tries, too long,
 * weak (breached, then characters, then length), Secure password change,
 * then a plain "try again". Anything we do not recognise is the plain one.
 */
export function choosePasswordFailureMessage(error: unknown): string {
  // A fetch that threw (offline, blocked) or a 502/503/504 from the gateway.
  if (isAuthRetryableFetchError(error)) return OFFLINE_COPY;
  const code = errorCode(error);
  // Never "Auth session missing!": the browser holds no session any more.
  if (isAuthSessionMissingError(error) || (code !== null && SESSION_GONE_CODES.has(code))) {
    return SIGNED_OUT_COPY;
  }
  if (errorStatus(error) === 429 || code === "over_request_rate_limit") return TOO_MANY_COPY;
  // GoTrue's 72-byte refusal: say it is too long, not "pick a stronger one".
  if (isPasswordTooLongError(error as { code?: string | null; message?: string | null } | null)) {
    return PASSWORD_TOO_LONG;
  }
  if (isAuthWeakPasswordError(error)) return weakPasswordCopy(error.reasons ?? []);
  if (code === "weak_password") return WEAK_PASSWORD_COPY;
  if (code !== null && REAUTH_CODES.has(code)) return REAUTH_COPY;
  return SAVE_FAILED_COPY;
}

/**
 * Asked right before the save, and again before the Terms tick: is the
 * session this browser holds still the account the server drew the page for?
 *
 * auth-js reads the session from the shared cookies on every call, so a
 * sign-in in another tab changes which account `updateUser` writes to, and
 * no current password is asked. Same idea as the reset page's
 * holdRecoverySession (src/app/auth/update-password/page.tsx).
 *
 * `session` is what `getSession()` gave: the signed-in id (or null) and its
 * error, if any (a refresh that failed answers with no session and an error,
 * so offline reads as offline, not as signed out). Null means carry on;
 * anything else is what to say instead of saving. An empty page id never
 * matches, so a page drawn without one can never save.
 */
export function sessionCheckMessage(
  session: { userId: string | null; error: unknown },
  pageUserId: string,
): string | null {
  if (pageUserId !== "" && session.userId === pageUserId) return null;
  if (session.userId === null) {
    return session.error ? choosePasswordFailureMessage(session.error) : SIGNED_OUT_COPY;
  }
  return SWITCHED_COPY;
}
