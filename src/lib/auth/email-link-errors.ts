/**
 * What went wrong with an account-confirmation email link, and what to tell
 * the student. Shared by /auth/confirm (token_hash + verifyOtp), the
 * /auth/callback fallback for older emails (?code= / #access_token), and the
 * resend + typed-code components.
 *
 * Before this, every failure redirected to one "invalid or expired… or sign
 * up again" message, including for students whose account was already
 * confirmed. Each outcome now gets its own honest copy.
 *
 * Pure: no imports, safe on the server, in the browser and in scratch tests.
 */

export type EmailLinkProblem =
  | "confirmed_sign_in" // ?code= arrived (so /verify confirmed), no session here
  | "link_used_or_expired" // otp_expired | flow_state_expired | flow_state_not_found | "invalid or has expired" | "expired or is invalid"
  | "already_signed_in" // a token failed but this browser has a session
  | "too_many_tries" // status 429 | over_request_rate_limit
  | "offline" // fetch threw
  | "incomplete_link" // no token_hash, no code, no hash tokens, no error params
  | "unknown";

/** GoTrue error codes that mean "this one-time link or code is spent". */
const EXPIRED_CODES = new Set([
  "otp_expired",
  "flow_state_expired",
  "flow_state_not_found",
]);

/**
 * GoTrue's messages for the same thing, for errors that arrive without a
 * code: "Email link is invalid or has expired" on redirects, "Token has
 * expired or is invalid" from POST /verify.
 */
const EXPIRED_DESCRIPTION = /invalid or has expired|expired or is invalid/i;

/**
 * Precedence: a session here beats everything (the card names that account);
 * then a ?code=, which GoTrue only redirects with after /verify confirmed the
 * account, so it says "confirmed" whatever went wrong signing in; then
 * offline, rate limit, spent link; nothing usable at all means the mail app
 * cut the link.
 */
export function classifyEmailLinkProblem(i: {
  hasCode: boolean;
  hasSession: boolean;
  hasToken: boolean;
  errorCode?: string | null;
  errorDescription?: string | null;
  status?: number | null;
  networkError?: boolean;
}): EmailLinkProblem {
  if (i.hasSession) return "already_signed_in";
  if (i.hasCode) return "confirmed_sign_in";
  if (i.networkError) return "offline";
  if (i.status === 429 || i.errorCode === "over_request_rate_limit") {
    return "too_many_tries";
  }
  if (
    (i.errorCode && EXPIRED_CODES.has(i.errorCode)) ||
    (i.errorDescription && EXPIRED_DESCRIPTION.test(i.errorDescription))
  ) {
    return "link_used_or_expired";
  }
  if (!i.hasToken && !i.errorCode && !i.errorDescription) {
    return "incomplete_link";
  }
  return "unknown";
}

/**
 * Every auth parameter an email link can carry. GoTrue puts errors in the
 * query or the hash depending on the flow, so those read from either (query
 * first). Session tokens only ever arrive in the hash. Empty values read as
 * null so `?code=` counts as no code.
 */
export function readAuthUrlParams(href: string): {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  next: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
} {
  let query = new URLSearchParams();
  let hash = new URLSearchParams();
  try {
    const url = new URL(href, "http://localhost");
    query = url.searchParams;
    hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  } catch {
    // Unparseable href: every field stays null.
  }
  const read = (p: URLSearchParams, key: string) => p.get(key) || null;
  const either = (key: string) => read(query, key) ?? read(hash, key);
  return {
    code: read(query, "code"),
    tokenHash: read(query, "token_hash"),
    type: read(query, "type"),
    next: read(query, "next"),
    accessToken: read(hash, "access_token"),
    refreshToken: read(hash, "refresh_token"),
    error: either("error"),
    errorCode: either("error_code"),
    errorDescription: either("error_description"),
  };
}

/**
 * Whether two addresses are the same account email: trimmed, case-insensitive.
 * False when either is missing, so "nothing remembered" never counts as a
 * match.
 */
export function isSameEmail(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const x = a?.trim().toLowerCase();
  const y = b?.trim().toLowerCase();
  return Boolean(x) && x === y;
}

/**
 * Seconds from GoTrue's rate-limit message, e.g. "For security purposes, you
 * can only request this after 57 seconds." Null when the message has none.
 */
export function parseRetryAfterSeconds(
  message: string | null | undefined,
): number | null {
  if (!message) return null;
  const m = /after (\d+) seconds?/i.exec(message);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export const INBOX_TIP =
  "Not there after a minute? Check Spam or Junk. On IU Outlook, also check Quarantine.";

/** Where a copy string puts the account's address (rendered in bold). */
export const EMAIL_SLOT = "{email}";

/**
 * Card copy per outcome. `already_signed_in` has no fixed href: its Continue
 * button computes the destination with getPostLoginDestination. Its body
 * names the account at EMAIL_SLOT; until the address is known the card shows
 * SIGNED_IN_NO_EMAIL_BODY instead.
 */
export const EMAIL_LINK_COPY: Record<
  EmailLinkProblem,
  {
    title: string;
    body: string;
    primaryLabel: string | null;
    primaryHref: string | null;
  }
> = {
  confirmed_sign_in: {
    title: "Your email is confirmed.",
    body: "Your email is confirmed, but this page couldn't sign you in. Sign in with your email and password.",
    primaryLabel: "Sign in",
    primaryHref: "/auth/login?notice=confirmed",
  },
  link_used_or_expired: {
    title: "This link was already used or has expired.",
    body: "If you tapped it before, your account is already confirmed — just sign in. If not, send yourself a new email below. Only the newest email works.",
    primaryLabel: "Sign in",
    primaryHref: "/auth/login",
  },
  already_signed_in: {
    title: "You're already signed in.",
    body: "This browser is signed in as {email}.",
    primaryLabel: "Continue",
    primaryHref: null,
  },
  too_many_tries: {
    title: "Too many tries from this network.",
    body: "Wait a few minutes, then tap the button again. Your link keeps working until it expires.",
    primaryLabel: null,
    primaryHref: null,
  },
  offline: {
    title: "We couldn't reach Vibe.",
    body: "Check your connection and tap the button again.",
    primaryLabel: null,
    primaryHref: null,
  },
  incomplete_link: {
    title: "This link is incomplete.",
    body: "Some mail apps cut long links. Tap the button in the email instead of copying the link, or type the 8-digit code from the email.",
    primaryLabel: null,
    primaryHref: null,
  },
  unknown: {
    title: "We couldn't confirm you from this link.",
    body: "Try signing in. If it says your email isn't confirmed, send a new email below.",
    primaryLabel: "Sign in",
    primaryHref: "/auth/login",
  },
};

export const SIGNED_IN_NO_EMAIL_BODY = "This browser is signed in.";

/**
 * A link that just signed this browser in, when the account isn't the one
 * this browser signed up with (or no signup is remembered, as when the email
 * is opened in the Gmail app). A forwarded link would otherwise walk the
 * student into someone else's account and on to binding their IU email to
 * it, so the card names the account and offers a way out.
 */
export const SIGNED_IN_BY_LINK_COPY = {
  title: "You're confirmed.",
  body: "Signed in as {email}. If that's your email, keep going.",
  bodyNoEmail: "This browser is signed in. If this was your own email, keep going.",
  primaryLabel: "Continue",
  signOutLabel: "Not you? Sign out",
} as const;

/** After "Not you? Sign out" on the card above. */
export const SIGNED_OUT_COPY = {
  title: "Signed out.",
  body: "Open your own confirmation email, or sign up.",
} as const;

export const SIGN_OUT_FAILED =
  "Couldn't sign out. Check your connection and try again.";
