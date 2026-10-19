import type { BrowserOptions } from "@sentry/nextjs";

/** The events Sentry hands these hooks, read off the options (@sentry/nextjs doesn't export TransactionEvent). */
type SentryErrorEvent = Parameters<NonNullable<BrowserOptions["beforeSend"]>>[0];
type SentryTransactionEvent = Parameters<
  NonNullable<BrowserOptions["beforeSendTransaction"]>
>[0];

/** One integration, and the client the kit hands it, read off the options the same way. */
type SentryIntegration = Extract<
  NonNullable<BrowserOptions["integrations"]>,
  readonly unknown[]
>[number];
type SentryClient = Parameters<NonNullable<SentryIntegration["setup"]>>[0];

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

/**
 * Link parameters whose value signs someone in, resets a password, verifies
 * an email, (`access_code`, the waitlist's `/auth/signup?access_code=`)
 * lets one new account through the sign-up gate, or (`checkin`, the QR on a
 * club's door screen, `/campus/checkin/<event>?checkin=`) is good for
 * checking in at that event for up to two minutes.
 */
const AUTH_PARAM_KEYS =
  "token_hash|token|access_token|refresh_token|code|provider_token|access_code|checkin";

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
 * access_token, refresh_token, code, provider_token, access_code) and of an
 * event check-in link's `checkin` in a URL or any text holding one. Pure:
 * same input, same output.
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

/**
 * Where the kit starts to write one of an element's four labels,
 * `[aria-label="`, `[alt="`, `[title="` or `[name="`, and everything after it
 * to the end of the string. A backslash in front of the quote is allowed for:
 * that is the same text once it has been copied into JSON.
 */
const ELEMENT_LABEL_RE = /\[(aria-label|alt|title|name)=\\*"[\s\S]*$/i;

/**
 * Blanks the labels in the name the kit gives a page element:
 * `button[type="button"] > img[alt="Photo posted by Jane Doe"]` becomes
 * `button[type="button"] > img[alt=""]`. The attribute's name stays, so the
 * report still says the element had a label. Pure: same input, same output.
 *
 * Why: to say which element was the largest thing painted, which one moved
 * and which one was tapped, the kit writes the element out as a selector
 * (htmlTreeAsString in @sentry/browser-utils), with the full text of its
 * `aria-label`, `name`, `title` and `alt`. Ours hold students' names ("Open
 * Jane Doe's profile", "Photo posted by Jane Doe") and what a person typed
 * (`No matches for "…"`). Privacy Policy 3d says our own code puts no name
 * on these reports.
 *
 * Everything from the first label to the END OF THE STRING goes, not only up
 * to the next `"]`. The kit writes a label as it is, quotes and brackets
 * included, so a label can hold `"]`, ` > `, or text that reads as a whole
 * second element, and nothing in the string says where it really stops. A
 * string cut short has no closing `"]` at all. So nothing after the first
 * label can be trusted, and none of it is sent.
 *
 * What stands in front of the first label is never part of one, and stays:
 * tags, ids, classes, a `[type="button"]` (the kit writes `type` after
 * `aria-label` and before the other three), and the names the kit prints in
 * place of a selector for `data-sentry-element` / `data-sentry-component`.
 * The price is what follows a labelled element: a `type` on that same
 * element and the elements inside it are not sent either.
 */
export function redactElementLabels(s: string): string {
  return s.replace(ELEMENT_LABEL_RE, '[$1=""]');
}

/**
 * An element's id as the kit writes it into a selector: `#`, then everything
 * up to the next space. The kit puts a space before the next element and
 * none inside this one, so the classes and the `[type="…"]` it writes
 * straight after the id come along, and an id that holds a bracket or a
 * quote is still taken whole.
 */
const ELEMENT_ID_RUN_RE = /#\S*/g;

/**
 * Takes a database ID out of an element's id: `input#<account ID>-days`
 * becomes `input#:id-days`. The rest of the id stays, so the report still
 * says which box it was. Pure: same input, same output.
 *
 * Why: the kit writes an element's id into the same selector as its labels,
 * in front of them, so cutting the labels (redactElementLabels) leaves the id
 * standing. A few ids are built from an ID in the database. On the founders'
 * admin pages that is another person's account ID
 * (src/app/admin/users-client.tsx: `<account ID>-days`, `-code`, `-note`),
 * and typing in that box is a measured tap. Privacy Policy 3d says our own
 * code puts no account on these reports.
 *
 * Every ID of that shape after a `#`, up to the next space, goes, whatever it
 * is the ID of (a post's `#post-<ID>` as well): nothing in the string says
 * which kind it is. The same rule takes one out of the `#…` end of a web
 * address, which costs nothing we need. An ID with no `#` in front of it is
 * not an element's id; the other scrubbers decide about those.
 */
export function redactElementIds(s: string): string {
  return s.replace(ELEMENT_ID_RUN_RE, (run: string) => run.replace(UUID_RE, ":id"));
}

/** Every string scrubber, in order. */
function scrubString(s: string): string {
  return redactElementIds(
    redactElementLabels(redactDbCallValues(redactHandles(redactAuthTokens(s)))),
  );
}

/**
 * Keys the kit fills with an element's id alone, no `#` in front: the id of
 * the largest thing painted (`lcp.id`, and `browser.web_vital.lcp.id` when
 * spans are streamed).
 */
const ELEMENT_ID_KEYS = new Set(["lcp.id", "browser.web_vital.lcp.id"]);

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
  if (ELEMENT_ID_KEYS.has(key)) return scrubString(s.replace(UUID_RE, ":id"));
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
 * `beforeSendTransaction` call it, and reportScrubIntegration calls it once
 * more for every event, the ones that skip those two included. First the
 * request record is cut down (stripRequestRecord): no body, no cookies, no
 * header but the browser's name. Then one pass over the whole event does two
 * things:
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
 * open, the values out of the server's database calls (redactDbCallValues),
 * and the labels and database IDs out of the element names on a speed
 * report: `lcp.element`, `lcp.id`, `cls.source.N`, the name of a tap's span
 * (redactElementLabels, redactElementIds).
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

/**
 * The same pass as scrubAuthTokensFromEvent's second half, for a record the
 * kit hands over that is not an event: every string scrubbed, every copy of
 * the request record dropped, in place. Always hands back what it was given
 * and never throws.
 */
function scrubRecordInPlace<T>(record: T): T {
  try {
    if (record === null || typeof record !== "object") return record;
    const fields = record as unknown as Record<string, unknown>;
    const seen = new WeakSet<object>();
    for (const key of Object.keys(fields)) {
      try {
        fields[key] = scrubValue(fields[key], 1, seen);
      } catch {
        // Left as it was; the other keys are still scrubbed.
      }
    }
  } catch {
    // A bug here must not cost the span.
  }
  return record;
}

/**
 * Cleans one span: its name (`description`), its data and the rest. This is
 * `beforeSendSpan`.
 *
 * Why: the browser sends some spans on their own, outside any speed report,
 * and those pass neither `beforeSend` nor `beforeSendTransaction`. Today
 * that is the INP measurement (how fast the page answered a tap). Its name
 * is the tapped element as the kit writes it, labels and id included
 * (redactElementLabels, redactElementIds), and its data holds the page's
 * route.
 *
 * The span is always sent: this hands back the span it was given, cleaned in
 * place, never null (the kit warns and sends the span as it was if a hook
 * returns nothing) and never throws.
 */
export function scrubSpan<T>(span: T): T {
  return scrubRecordInPlace(span);
}

/**
 * Cleans the trace header the kit builds for a report (its "dynamic sampling
 * context": trace ID, environment, release and `transaction`, the name of the
 * trace's first span). reportScrubIntegration hands it over, at the moment
 * the kit builds it.
 *
 * Why: the header goes out next to the report, and no `beforeSend…` hook
 * sees it. A span sent on its own that starts its own trace is that trace's
 * first span, so its name, the tapped element with its labels, would be
 * copied into `transaction` here after scrubSpan had cleaned the span itself.
 * The kit normally reuses the header of the page load, which names the
 * route; this covers the case where there is none to reuse.
 */
export function scrubTraceHeader<T>(header: T): T {
  return scrubRecordInPlace(header);
}

/** The name the kit lists this integration under (`sdk.integrations` on a report). */
export const REPORT_SCRUB_INTEGRATION_NAME = "VibeReportScrub";

/**
 * The two places no `beforeSend…` option reaches, cleaned from inside the
 * kit. An integration is the kit's own way to be handed its client while it
 * starts, before anything can be sent. getSentryInitOptions lists this one,
 * so the browser, the server and the edge runtime all get it. A setup file
 * that writes its own `integrations` list replaces ours and has to name this
 * one again: src/instrumentation-client.ts does, and a test reads all three
 * setup files to keep it so.
 *
 * - "createDsc": the trace header sent next to a report (scrubTraceHeader has
 *   the why). It is cleaned once, where the kit builds it, before anything
 *   copies it.
 * - "beforeSendEvent": every event, at the last step before it is packed.
 *   Most have been through `beforeSend` or `beforeSendTransaction` by then,
 *   and the second pass changes nothing. The one that has not is the kit's
 *   report about its own failure: when a step of its event pipeline throws,
 *   it drops the event it was working on and sends the failure as a new one,
 *   and that one skips both options (_processEvent in @sentry/core client.js,
 *   `isInternalException`). It is built from the same scope, so it carries
 *   the trail (every page opened and request made, with its address) and the
 *   page's name. Here it gets the same scrub as any other report.
 *
 * Neither listener may throw. The kit does not catch what a listener throws:
 * out of "beforeSendEvent" it would count as one more failure of its own and
 * be reported the same way, through this listener again. Both scrubs catch
 * everything themselves, and each listener is wrapped once more to be sure.
 */
export function reportScrubIntegration(): SentryIntegration {
  return {
    name: REPORT_SCRUB_INTEGRATION_NAME,
    setup(client: SentryClient): void {
      try {
        client.on("createDsc", (header) => {
          try {
            scrubTraceHeader(header);
          } catch {
            // The header goes as it was.
          }
        });
        client.on("beforeSendEvent", (event) => {
          try {
            scrubAuthTokensFromEvent(event as SentryErrorEvent);
          } catch {
            // The event goes as it was.
          }
        });
      } catch {
        // A client with no hooks: the `beforeSend…` options still do their part.
      }
    },
  };
}

/**
 * Error messages that come from other people's software, not from Vibe. They
 * are dropped before they are counted, so a real error stands out. Both
 * turned up in the 30 days to October 12, 2026:
 *
 * - "Object Not Found Matching Id:" is thrown by a mail service's link
 *   scanner when it opens a link from one of our emails to check it. The
 *   kit's own list only has the `MethodName:simulateEvent` flavour.
 * - "SCDynimacBridge" is a name another app's built-in browser looks for on
 *   the page. The spelling is theirs.
 *
 * Each is matched anywhere in the message, on top of the kit's own list
 * (@sentry/core eventFilters). Only a browser ever throws either one. The
 * server and edge runtimes share these options and have nothing to match.
 */
export const OUTSIDE_SOFTWARE_ERRORS: readonly RegExp[] = [
  /Object Not Found Matching Id:/,
  /SCDynimacBridge/,
];

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
    // A copy, so the kit can't change our list.
    ignoreErrors: [...OUTSIDE_SOFTWARE_ERRORS],
    // Three hooks, one scrub. `beforeSend` cleans an error report,
    // `beforeSendTransaction` a speed report, and `beforeSendSpan` a span the
    // browser sends on its own, which passes neither of the other two. Today
    // that is only the INP measurement (how fast the page answered a tap): the
    // tapped element and the page's route name, no request and no database
    // call. Read in @sentry/core 10.73.0: createSpanEnvelope (envelope.js)
    // runs `beforeSendSpan` on such a span, and on the LCP and CLS spans the
    // kit can send the same way (`_experiments.enableStandaloneLcpSpans` and
    // `enableStandaloneClsSpans`, both off).
    //
    // What comes with `beforeSendSpan`, also read there (processBeforeSend in
    // client.js) and seen in a local run of the kit:
    // - The kit runs it on every span of a speed report too, before
    //   `beforeSendTransaction`. Those are scrubbed twice, which changes
    //   nothing: the scrub gives the same result the second time.
    // - To do that it rebuilds the report's trace context from the first
    //   span, and the rebuilt one has no `links` (in the browser, the pointer
    //   from one page load to the one before it). The same pointer still goes
    //   out in the data, as `sentry.previous_trace`.
    //
    // What the three hooks do not reach, and what does:
    // - The trace header sent next to a report, and the report the kit sends
    //   about a failure of its own, which skips `beforeSend`. Both are
    //   cleaned by reportScrubIntegration, listed under `integrations` below
    //   for all three runtimes.
    // - Span streaming (`traceLifecycle: "stream"`, off). A streamed span only
    //   passes a hook wrapped in `withStreamedSpan`, and with this plain one
    //   set the kit's streaming integration falls back to not streaming.
    //   Before anyone turns streaming on, wrap the same scrub that way.
    beforeSend: (event) => scrubAuthTokensFromEvent(event),
    beforeSendTransaction: (event) => scrubAuthTokensFromEvent(event),
    beforeSendSpan: (span) => scrubSpan(span),
    // Added to the kit's own integrations, not in place of them. A setup file
    // that sets `integrations` itself must list reportScrubIntegration() too.
    integrations: [reportScrubIntegration()],
  };
}

export function isSentryConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}
