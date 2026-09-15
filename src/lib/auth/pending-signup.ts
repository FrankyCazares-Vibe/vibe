/**
 * The address this browser just signed up with, kept for 24 hours so
 * "Send a new email" and the 8-digit code box can be one tap on the confirm
 * pages. It lives in localStorage only, never in a URL, and is cleared once
 * the account is confirmed here.
 *
 * Client-safe. Storage can be missing (server render) or throw (private
 * mode, blocked site data, some in-app browsers), so every access is guarded
 * and a failure simply means nothing is remembered.
 */

const PENDING_SIGNUP_KEY = "vibe.pendingSignup.v1";
const PENDING_SIGNUP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function rememberPendingSignup(email: string): void {
  const trimmed = email.trim();
  if (!trimmed) return;
  try {
    storage()?.setItem(
      PENDING_SIGNUP_KEY,
      JSON.stringify({ email: trimmed, at: Date.now() }),
    );
  } catch {
    // Quota or blocked storage: the forms just ask for the address.
  }
}

/** Null when nothing is stored, the entry is over 24h old, or storage throws. */
export function readPendingSignupEmail(): string | null {
  try {
    const s = storage();
    const raw = s?.getItem(PENDING_SIGNUP_KEY);
    if (!s || !raw) return null;
    const parsed = JSON.parse(raw) as { email?: unknown; at?: unknown };
    const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
    const at = typeof parsed.at === "number" ? parsed.at : NaN;
    const age = Date.now() - at;
    if (!email || !Number.isFinite(age) || age > PENDING_SIGNUP_MAX_AGE_MS) {
      s.removeItem(PENDING_SIGNUP_KEY);
      return null;
    }
    return email;
  } catch {
    return null;
  }
}

export function clearPendingSignup(): void {
  try {
    storage()?.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // Nothing to do: an entry we can't reach expires on its own.
  }
}
