import type { BrowserOptions } from "@sentry/nextjs";

/** The events Sentry hands these hooks, read off the options (@sentry/nextjs doesn't export TransactionEvent). */
type SentryErrorEvent = Parameters<NonNullable<BrowserOptions["beforeSend"]>>[0];
type SentryTransactionEvent = Parameters<
  NonNullable<BrowserOptions["beforeSendTransaction"]>
>[0];

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

/**
 * Link parameters whose value signs someone in, resets a password, verifies
 * an email, or (`access_code`, the waitlist's `/auth/signup?access_code=`)
 * lets one new account through the sign-up gate.
 */
const AUTH_PARAM_KEYS =
  "token_hash|token|access_token|refresh_token|code|provider_token|access_code";

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

const REDACTED = "[redacted]";

/**
 * Replaces the values of auth link parameters (token_hash, token,
 * access_token, refresh_token, code, provider_token, access_code) in a URL or any text
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

/**
 * Every filter operator the database client can write after `column=`
 * (@supabase/postgrest-js PostgrestFilterBuilder): `id=eq.<value>`,
 * `email=ilike.<value>`, `id=in.(<a>,<b>)` and the rest.
 */
const DB_FILTER_OPS =
  "eq|neq|gt|gte|lt|lte|like|ilike|match|imatch|in|is|isdistinct|" +
  "fts|plfts|phfts|wfts|cs|cd|ov|sl|sr|nxl|nxr|adj";

/**
 * `column=eq.<value>` after `?` or `&`. Also `not.` in front (`id=not.in.(…)`)
 * and a bracket after the operator (`like(any).`, `fts(english).`), which
 * reaches a web address as `%28…%29`. The column can be on a joined table
 * (`creator.campus_id`) or a JSON path (`meta->>org_id`). The value runs to
 * the next delimiter.
 */
const DB_FILTER_RE = new RegExp(
  `([?&][^&#=?\\s"']{1,80}=(?:not\\.)?(?:${DB_FILTER_OPS})` +
    `(?:(?:\\(|%28)[a-z_]{1,40}(?:\\)|%29))?\\.)[^&#\\s"']+`,
  "gi",
);

/** `or=(a.eq.<x>,b.eq.<y>)` and `and=(…)`, alone, negated or on a joined table. */
const DB_LOGIC_RE = /([?&](?:[a-z0-9_]{1,80}\.)?(?:not\.)?(?:or|and)=)[^&#\s"']+/gi;

/**
 * The path of a call to the sign-in system or to file storage, plain or
 * encoded: `/auth/v1/admin/users/<account ID>`,
 * `/storage/v1/object/profiles/<account ID>/<file>`. The app's own pages live
 * under /auth/login and the like, never /auth/v1.
 */
const DB_ID_PATH_RE = new RegExp(
  `${SLASH}(?:auth|storage)${SLASH}v1${SLASH}[^?#&\\s"'<>]+`,
  "gi",
);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Takes the values out of the address of a database call:
 * `users?email=eq.<address>` becomes `users?email=eq.[redacted]`, a whole
 * `or=(…)` becomes `or=[redacted]`, and an ID in the path of a sign-in or
 * storage call becomes `:id`. Table, column and operator stay, so the report
 * still says which call it was. Pure: same input, same output.
 *
 * Why: the kit lists every call the server makes while it handles a request,
 * with its full address (the trail of an error report, the spans of a speed
 * report). Those addresses hold account IDs, and at a few steps an email
 * address.
 */
export function redactDbCallValues(s: string): string {
  return s
    .replace(DB_FILTER_RE, `$1${REDACTED}`)
    .replace(DB_LOGIC_RE, `$1${REDACTED}`)
    .replace(DB_ID_PATH_RE, (path: string) => path.replace(UUID_RE, ":id"));
}

/** Every string scrubber, in order. */
function scrubString(s: string): string {
  return redactDbCallValues(redactHandles(redactAuthTokens(s)));
}

/**
 * Keys the kit fills with a query string or fragment whose leading `?` / `#`
 * is cut off (span data `http.query`, `http.fragment`), so the first
 * `key=value` has nothing to anchor on.
 */
const BARE_QUERY_KEYS = new Set([
  "http.query",
  "http.fragment",
  "url.query",
  "url.fragment",
  "query_string",
]);

function scrubKeyedString(key: string, s: string): string {
  if (!BARE_QUERY_KEYS.has(key) || /^[?&#]/.test(s)) return scrubString(s);
  return scrubString(`&${s}`).slice(1);
}

/**
 * Span and trail keys that are a copy of something the request record held:
 * the body (`http.request.body.data`), a request header or cookie
 * (`http.request.header.<name>`, `http.request.header.cookie.<name>`), a
 * cookie the server set (`http.response.header.set_cookie…`) and the caller's
 * IP address. Only the browser's name (`user_agent`) stays.
 */
function isRequestCopyKey(key: string): boolean {
  if (key.startsWith("http.request.header.")) {
    return key !== "http.request.header.user_agent";
  }
  return (
    key === "http.request.body.data" ||
    key === "http.client_ip" ||
    key === "user.ip_address" ||
    key.startsWith("http.response.header.set_cookie")
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

const MAX_SCRUB_DEPTH = 12;

/**
 * Walks plain data in place: scrubs every string and drops every key that is
 * a copy of the request record. Each value is tried alone, so one that cannot
 * be read or written is left as it was and the rest is still scrubbed.
 */
function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object" || depth > MAX_SCRUB_DEPTH) {
    return value;
  }
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      try {
        value[i] = scrubValue(value[i], depth + 1, seen);
      } catch {
        // Left as it was; the walk goes on.
      }
    }
    return value;
  }
  // Events are plain data by now; leave anything class-shaped alone.
  if (!isPlainRecord(value)) return value;
  for (const key of Object.keys(value)) {
    try {
      if (isRequestCopyKey(key)) {
        delete value[key];
        continue;
      }
      const item = value[key];
      value[key] =
        typeof item === "string"
          ? scrubKeyedString(key, item)
          : scrubValue(item, depth + 1, seen);
    } catch {
      // Left as it was; the walk goes on.
    }
  }
  return value;
}

/** What stays of the request record. `headers` is cut down to the browser's name. */
const REQUEST_KEEP = new Set(["url", "method", "headers"]);

/**
 * Cuts the request record down to the address, the method and the
 * `user-agent` header (the browser's name). Gone: the body (`data`), the
 * cookies, every other header, `query_string` (pairs with no `?` or `&` to
 * anchor on; `url` keeps the query, redacted) and anything else the kit adds.
 *
 * Why: on the server the kit copies the body of the request (up to 10,000
 * bytes: the message, post or form a person was sending), every cookie (the
 * sign-in cookie among them) and every header (`authorization`, Vercel's
 * `x-vercel-ip-*` rough location, `x-vercel-proxied-for`) onto each error and
 * speed report. `sendDefaultPii: false` does not stop that.
 */
function stripRequestRecord(event: Record<string, unknown>): void {
  const request = event.request;
  if (request === undefined || request === null) return;
  if (!isPlainRecord(request)) {
    delete event.request;
    return;
  }
  for (const key of Object.keys(request)) {
    if (!REQUEST_KEEP.has(key)) delete request[key];
  }
  const kept: Record<string, string> = {};
  if (isPlainRecord(request.headers)) {
    for (const [name, value] of Object.entries(request.headers)) {
      if (name.toLowerCase() === "user-agent" && typeof value === "string") {
        kept[name] = value;
      }
    }
  }
  if (Object.keys(kept).length > 0) request.headers = kept;
  else delete request.headers;
}

/**
 * Cleans an error or speed report before it leaves. Both `beforeSend` and
 * `beforeSendTransaction` call it. First the request record is cut down
 * (stripRequestRecord): no body, no cookies, no header but the browser's
 * name. Then one pass over the whole event does two things:
 *
 * - Every copy the kit keeps of those is dropped (isRequestCopyKey), from the
 *   trace context, from each span and from the trail.
 * - Every string is scrubbed (scrubString): the request URL, the transaction
 *   name, the trail (fetch and navigation url, from, to, message, query),
 *   trace and span data, span descriptions, messages and stack frames (an
 *   inline script's frame is the page URL, query included).
 *
 * Why the strings: the browser SDK records `location.href` with its query
 * and hash, and server spans record the request target. An unspent
 * `/auth/update-password?token_hash=…` in Sentry is a password reset for
 * anyone who can read the event. The same pass takes handles out
 * (redactHandles), so an event never names the student whose profile was
 * open, and the values out of the server's database calls
 * (redactDbCallValues).
 *
 * The report is always sent: this never returns null and never throws. A
 * step that fails is skipped (for the request record, the whole record is
 * dropped instead), and the event goes out with the rest of the cleaning
 * done.
 */
export function scrubAuthTokensFromEvent<
  T extends SentryErrorEvent | SentryTransactionEvent,
>(
  event: T,
): T {
  try {
    if (event === null || typeof event !== "object") return event;
    const record = event as unknown as Record<string, unknown>;
    try {
      stripRequestRecord(record);
    } catch {
      try {
        delete record.request;
      } catch {
        // Nothing left to try; the report still goes.
      }
    }
    const seen = new WeakSet<object>();
    for (const key of Object.keys(record)) {
      // SDK internals, dropped before the envelope is built.
      if (key === "sdkProcessingMetadata") continue;
      try {
        record[key] = scrubValue(record[key], 1, seen);
      } catch {
        // Left as it was; the other keys are still scrubbed.
      }
    }
  } catch {
    // A bug here must not cost the report.
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
    // Both hooks run the same scrub. A span sent on its own passes neither.
    // Today that is only the browser's INP measurement: the tapped element and
    // the page's route name, no request and no database call. Span streaming
    // (`traceLifecycle: "stream"`, off) would send every span that way, so it
    // needs a `beforeSendSpan` that does the same before anyone turns it on.
    beforeSend: (event) => scrubAuthTokensFromEvent(event),
    beforeSendTransaction: (event) => scrubAuthTokensFromEvent(event),
  };
}

export function isSentryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}
