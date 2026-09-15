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

const MAX_SCRUB_DEPTH = 12;

function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return redactAuthTokens(value);
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
      request.data = redactAuthTokens(
        `&${request.data.replace(AUTH_JSON_RE, `$1"${REDACTED}"`)}`,
      ).slice(1);
    } else if (
      request.data !== null &&
      typeof request.data === "object" &&
      !Array.isArray(request.data)
    ) {
      const body = request.data as Record<string, unknown>;
      for (const key of Object.keys(body)) {
        if (AUTH_KEY_SET.has(key.toLowerCase())) body[key] = REDACTED;
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
