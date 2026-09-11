/**
 * Failure copy: what a student sees when a request is refused
 * (silent-failure design, handoffs/2026-09-11-silent-failure-design.md §1).
 *
 * Pure and DOM-free. `vibeRequest` (./request.ts) builds the signal from the
 * response and shows the result in a toast. The first matching rule wins, in
 * the design table's order.
 *
 * The static pages can't import TS, so public/html/_persistence.js keeps a
 * copy of this table in `vibeFeedbackInit`. Change both together.
 */

export type FailureSignal = {
  status: number;
  code: string | null;
  error: string | null;
  retryAfterSec: number | null;
};

export type ToastAction = { label: string; href: string };

/** Server `error` tokens that say nothing to a student. */
const GENERIC_ERRORS = new Set([
  "unauthorized",
  "forbidden",
  "request failed",
  "unavailable",
  "not found",
  "invalid json",
  "bad request",
  "internal server error",
]);

/** The only 400 strings worth showing verbatim; the rest are developer-facing. */
const PASS_THROUGH_400 = new Set(["Comment is empty", "Message too long", "Empty message"]);
const EXCEEDS_LIMIT = /exceeds \d+ characters/;

/**
 * Conservative "reads like a sentence" check for 403/409 `error` strings: a
 * capital first letter, at least three words, everyday punctuation only, and
 * nothing code-shaped. "Join the org first" and "That handle is taken" pass;
 * "Admin only", "Forbidden" and "channel_ids must be UUIDs" don't. → … · count
 * as everyday: the org-create 403 ends "(Profile → School verification.)".
 */
function isHumanSentence(error: string | null): error is string {
  if (!error) return false;
  const s = error.trim();
  if (s.length === 0 || s.length > 160) return false;
  if (GENERIC_ERRORS.has(s.toLowerCase())) return false;
  if (!/^[A-Z]/.test(s)) return false;
  if (s.split(/\s+/).length < 3) return false;
  if (!/^[A-Za-z0-9 ,.'’"“”!?:()/&—–→…·-]+$/.test(s)) return false;
  return !/\b(json|uuid|null|undefined|ids?)\b/i.test(s);
}

/** The caller's own line, never empty, always ending in punctuation. */
function asSentence(line: string): string {
  const s = line.trim() || "Something went wrong.";
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** The caller's line plus " Try again.", unless it already says so. */
function withTryAgain(line: string): string {
  const s = asSentence(line);
  return /try again/i.test(s) ? s : `${s} Try again.`;
}

/**
 * Retry-After from `tooManyRequests` is the whole window (60 s up to an hour),
 * not the time left, so only a sub-minute value is quoted exactly and a long
 * window doesn't promise "a minute".
 */
function retryLine(sec: number | null): string {
  if (sec !== null && sec > 0 && sec < 60) {
    const n = Math.ceil(sec);
    return `Try again in ${n} second${n === 1 ? "" : "s"}.`;
  }
  if (sec !== null && sec >= 120) return "Try again later.";
  return "Try again in a minute.";
}

/**
 * One short plain-English line for a failed request, plus the action that
 * fixes it when there is one. `fallback` is the caller's own line ("Couldn't
 * post your comment."); `here` is the page to come back to after Sign in or
 * Review Terms (pathname + search).
 */
export function describeFailure(
  sig: FailureSignal,
  fallback: string,
  here: string,
): { message: string; action?: ToastAction } {
  const { status, code, error } = sig;
  const next = encodeURIComponent(here || "/");

  if (status === 0) {
    return { message: "Couldn't reach Vibe. Check your connection and try again." };
  }
  if (status === 401) {
    return {
      message: "You've been signed out. Sign in and try again.",
      action: { label: "Sign in", href: `/auth/login?next=${next}` },
    };
  }
  if (status === 403 && code === "terms_required") {
    return {
      message: "Accept the Terms first, then try again.",
      action: { label: "Review Terms", href: `/auth/terms?next=${next}` },
    };
  }
  if (status === 429) {
    return { message: `You're going a little fast. ${retryLine(sig.retryAfterSec)}` };
  }
  if (status === 403) {
    // "Unavailable" is the block check (either direction) on follows and DMs.
    if (error === "Unavailable") return { message: "You can't connect with this person." };
    if (isHumanSentence(error)) return { message: error.trim() };
    // "Forbidden", "Request failed", "Admin only"… A 403 with no JSON error
    // at all falls through to the non-JSON line at the bottom.
    if (error) return { message: "You don't have access to do that." };
  }
  if (status === 404) return { message: "That's no longer available." };
  if (status === 409 && isHumanSentence(error)) return { message: error.trim() };
  if (status === 400) {
    if (error && (PASS_THROUGH_400.has(error) || EXCEEDS_LIMIT.test(error))) {
      return { message: error };
    }
    return { message: asSentence(fallback) };
  }
  // 5xx, a non-JSON body, a 2xx with ok:false, and anything unmapped.
  return { message: withTryAgain(fallback) };
}
