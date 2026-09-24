import type { BrowserOptions } from "@sentry/nextjs";

/** The events Sentry hands these hooks, read off the options (@sentry/nextjs doesn't export TransactionEvent). */
type SentryErrorEvent = Parameters<NonNullable<BrowserOptions["beforeSend"]>>[0];
type SentryTransactionEvent = Parameters<
  NonNullable<BrowserOptions["beforeSendTransaction"]>
>[0];

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

/** Link parameters whose value signs someone in, resets a password or verifies an email. */
const AUTH_PARAM_KEYS =
  "token_hash|token|access_token|refresh_token|code|provider_token";

/**
 * `key=value` after `?`, `&` or `#`, plus the percent-encoded forms a link
 * takes inside another link's `next=` (once or twice encoded). The value runs
 * to the next delimiter, so the rest of the URL survives.
 */
const AUTH_PARAM_RE = new RegExp(
  `((?:[?&#]|%3F|%26|%23|%253F|%2526|%2523)(?:${AUTH_PARAM_KEYS})(?:=|%3D|%253D))` +
    `(?:(?!%26|%23|%2526|%2523)[^&#\\s"'<>])*`,
  "gi",
);

/** `"token": "…"` in a captured JSON request body. */
const AUTH_JSON_RE = new RegExp(
  `("(?:${AUTH_PARAM_KEYS})"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`,
  "gi",
);

const AUTH_KEY_SET = new Set(AUTH_PARAM_KEYS.split("|"));

const REDACTED = "[redacted]";

/**
 * Replaces the values of auth link parameters (token_hash, token,
 * access_token, refresh_token, code, provider_token) in a URL or any text
 * holding one. Pure: same input, same output.
 */
export function redactAuthTokens(s: string): string {
  return s.replace(AUTH_PARAM_RE, `$1${REDACTED}`);
}

/**
 * A person's handle as a path segment: 3–20 of `[a-z0-9_]`
 * (src/lib/profile/handle.ts HANDLE_FORMAT_RE), or the `u<32 hex>` placeholder
 * an account carries until it claims one (onboarding-prefill.ts
 * TRIGGER_DEFAULT_HANDLE_RE), which is 33 characters and so needs its own arm.
 */
const HANDLE_SEGMENT = "u[0-9a-f]{32}|[a-z0-9_]{3,20}";

/** `/`, or the `%2F` / `%252F` a path becomes inside another link's `next=`. */
const SLASH = "(?:/|%2F|%252F)";

/**
 * `/profile/<handle>` and `/api/users/<handle>`, plain or encoded. The handle
 * has to end at a URL delimiter or the end of the string, never at `.` or `-`:
 * a build chunk like `app/profile/page-3f2a.js` and a source path like
 * `src/app/profile/profile-params.ts` reach Sentry in every stack frame, and
 * rewriting them would stop the frames matching the source maps.
 */
const HANDLE_PATH_RE = new RegExp(
  `(${SLASH}(?:profile|api${SLASH}users)${SLASH})(${HANDLE_SEGMENT})` +
    `(?=[/?#&%"'\`\\s),;<>\\]]|$)`,
  "gi",
);

/**
 * Route folders under /api/users that fit the handle shape but aren't one.
 * `by-id/<id>` never matches: "by" is two characters and then a `-`.
 */
const FIXED_USER_SEGMENTS = new Set(["search"]);

/**
 * `handle=` and the legacy `user=` on /html/profile.html, the desktop page
 * /profile/<handle> hops to, anchored the same way as AUTH_PARAM_RE. An empty
 * value is left alone.
 */
const HANDLE_PARAM_RE = new RegExp(
  `((?:[?&#]|%3F|%26|%23|%253F|%2526|%2523)(?:handle|user)(?:=|%3D|%253D))` +
    `(?:(?!%26|%23|%2526|%2523)[^&#\\s"'<>])+`,
  "gi",
);

/** `"handle": "…"` in a captured JSON request body (PATCH /api/me/handle). */
const HANDLE_JSON_RE = /("handle"\s*:\s*)"(?:[^"\\]|\\.)*"/gi;

/**
 * Replaces the handle in `/profile/<handle>` and `/api/users/<handle>` with
 * `:handle`, and the value of a `handle=` / `user=` link parameter with
 * `[redacted]`. Pure: same input, same output.
 *
 * Why: a handle names a student, and Sentry sees every page and API address
 * they open. With handles out, crash and performance data stay not linked to
 * a person, which is what the App Store and Play privacy forms get told.
 */
export function redactHandles(s: string): string {
  return s
    .replace(HANDLE_PATH_RE, (whole: string, prefix: string, handle: string) =>
      FIXED_USER_SEGMENTS.has(handle.toLowerCase()) ? whole : `${prefix}:handle`,
    )
    .replace(HANDLE_PARAM_RE, `$1${REDACTED}`);
}

/** Every string scrubber, in order. */
function scrubString(s: string): string {
  return redactHandles(redactAuthTokens(s));
}

const MAX_SCRUB_DEPTH = 12;

function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object" || depth > MAX_SCRUB_DEPTH) {
    return value;
  }
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = scrubValue(value[i], depth + 1, seen);
    }
    return value;
  }
  // Events are plain data by now; leave anything class-shaped alone.
  const proto = Object.getPrototypeOf(value) as unknown;
  if (proto !== Object.prototype && proto !== null) return value;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    record[key] = scrubValue(record[key], depth + 1, seen);
  }
  return value;
}

/**
 * Strips auth tokens from everything an event carries: request URL, headers
 * and body, transaction name, breadcrumbs (fetch/navigation url, from, to,
 * message), trace context and span data, span descriptions, messages and
 * stack frames (an inline script's frame is the page URL, query included).
 *
 * Why: the browser SDK records `location.href` with its query and hash, and
 * server spans record the request target. An unspent
 * `/auth/update-password?token_hash=…` in Sentry is a password reset for
 * anyone who can read the event.
 *
 * The same pass takes handles out (redactHandles), so an event never names
 * the student whose profile was open.
 */
export function scrubAuthTokensFromEvent<
  T extends SentryErrorEvent | SentryTransactionEvent,
>(
  event: T,
): T {
  const request = event.request;
  if (request) {
    // Key/value pairs with no `?` or `&` to anchor on; the URL above it
    // keeps the query, redacted.
    delete request.query_string;
    if (typeof request.data === "string") {
      const json = request.data
        .replace(AUTH_JSON_RE, `$1"${REDACTED}"`)
        .replace(HANDLE_JSON_RE, `$1"${REDACTED}"`);
      // The leading `&` anchors a form body's first `key=value`.
      request.data = scrubString(`&${json}`).slice(1);
    } else if (
      request.data !== null &&
      typeof request.data === "object" &&
      !Array.isArray(request.data)
    ) {
      const body = request.data as Record<string, unknown>;
      for (const key of Object.keys(body)) {
        const lower = key.toLowerCase();
        if (AUTH_KEY_SET.has(lower) || lower === "handle") body[key] = REDACTED;
      }
    }
  }
  const seen = new WeakSet<object>();
  const record = event as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    // SDK internals, dropped before the envelope is built.
    if (key === "sdkProcessingMetadata") continue;
    record[key] = scrubValue(record[key], 1, seen);
  }
  return event;
}

/** Shared defaults — browser + Node + Edge. Disabled when DSN unset (local dev without Sentry). */
export function getSentryInitOptions(): BrowserOptions {
  const enabled = Boolean(dsn);
  return {
    dsn: enabled ? dsn : undefined,
    enabled,
    environment:
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      "development",
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
    sendDefaultPii: false,
    beforeSend: (event) => scrubAuthTokensFromEvent(event),
    beforeSendTransaction: (event) => scrubAuthTokensFromEvent(event),
  };
}

export function isSentryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}
