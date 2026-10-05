/**
 * Tests for `sentry-config.ts`: the handle scrub added for the store privacy
 * forms (handoffs/wave-plan-pwa/critic-s1.md item 18), next to the auth-token
 * scrub it runs after, and the Privacy Policy's row 14: no request body, no
 * cookie, no header but the browser's name, and no value from the address of
 * a database call on an error or speed report.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/sentry-config.test.ts
 *
 * The module has only an `import type` line, which type stripping erases, so
 * it loads through a dynamic import of its ".ts" path, the same pattern as
 * `src/lib/mentions.test.ts`. The specifier goes through a variable because
 * tsc refuses a literal ".ts" specifier.
 *
 * Nothing is sent. No DSN is set, and the two tests at the end that run the
 * installed kit give it a transport that only records, with a DSN on the
 * reserved `.invalid` domain.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  Scope,
  ServerRuntimeClient,
  httpHeadersToSpanAttributes,
  httpRequestToRequestData,
  requestDataIntegration,
} from "@sentry/core";

const specifier = "./sentry-config.ts";
const {
  redactHandles,
  redactAuthTokens,
  redactDbCallValues,
  scrubAuthTokensFromEvent,
  getSentryInitOptions,
} = (await import(specifier)) as typeof import("./sentry-config");

type AnyEvent = Parameters<typeof scrubAuthTokensFromEvent>[0];

/** Loose view of an event for assertions. */
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Runs the scrubber on a hand-built event and hands back a loose view. */
function scrub(event: unknown): Loose {
  return scrubAuthTokensFromEvent(event as AnyEvent) as unknown as Loose;
}

const ME = "5c1e0f2a-0000-4000-8000-000000000009";
const OTHER = "7d2f1a3b-1111-4111-8111-111111111111";
const DB = "https://abcd.supabase.co";

const PLACEHOLDER = "u" + "3f2a9c".padEnd(32, "0");

test("a profile path loses its handle and keeps the rest of the URL", () => {
  assert.equal(
    redactHandles("https://www.connectvibe.app/profile/franky_c?post=abc&welcome=1"),
    "https://www.connectvibe.app/profile/:handle?post=abc&welcome=1",
  );
  assert.equal(redactHandles("/profile/Franky"), "/profile/:handle");
  assert.equal(redactHandles("/profile/franky/"), "/profile/:handle/");
  assert.equal(redactHandles("/profile/franky#posts"), "/profile/:handle#posts");
  assert.equal(
    redactHandles("Navigated to /profile/franky from /campus"),
    "Navigated to /profile/:handle from /campus",
  );
});

test("the unclaimed placeholder handle is redacted too", () => {
  assert.equal(redactHandles(`/profile/${PLACEHOLDER}`), "/profile/:handle");
  assert.equal(redactHandles(`/api/users/${PLACEHOLDER}/posts`), "/api/users/:handle/posts");
});

test("per-handle API routes lose the handle", () => {
  assert.equal(
    redactHandles("/api/users/franky/posts?limit=20"),
    "/api/users/:handle/posts?limit=20",
  );
  assert.equal(redactHandles("GET /api/users/franky/bootstrap"), "GET /api/users/:handle/bootstrap");
});

test("search and by-id are routes, not handles", () => {
  for (const url of [
    "/api/users/search?q=fra",
    "/api/users/search",
    "/api/users/by-id/5c1e0f2a-0000-4000-8000-000000000009",
  ]) {
    assert.equal(redactHandles(url), url);
  }
});

test("chunk and source paths in stack frames are untouched", () => {
  for (const path of [
    "https://www.connectvibe.app/_next/static/chunks/app/profile/page-3f2a1b9c.js",
    "/_next/static/chunks/app/profile/%5Bhandle%5D/page-0a1b2c.js",
    "app:///_next/server/app/profile/[handle]/page.js",
    "webpack-internal:///(app-pages-browser)/./src/app/profile/profile-html-bridge.tsx",
    "./src/app/profile/ProfileSwitch.tsx",
    "/var/task/.next/server/app/api/users/[handle]/posts/route.js",
    "/html/profile.html?app=1",
  ]) {
    assert.equal(redactHandles(path), path);
  }
});

test("an encoded next= is redacted, once and twice encoded", () => {
  assert.equal(
    redactHandles("/auth/login?next=%2Fprofile%2Ffranky%3Fpost%3Dabc"),
    "/auth/login?next=%2Fprofile%2F:handle%3Fpost%3Dabc",
  );
  assert.equal(
    redactHandles("/auth/confirm?next=%252Fprofile%252Ffranky"),
    "/auth/confirm?next=%252Fprofile%252F:handle",
  );
  assert.equal(
    redactHandles("/auth/login?next=%2fapi%2fusers%2ffranky%2fposts"),
    "/auth/login?next=%2fapi%2fusers%2f:handle%2fposts",
  );
});

test("handle= and user= link values are redacted", () => {
  assert.equal(
    redactHandles("/html/profile.html?app=1&handle=franky&post=abc"),
    "/html/profile.html?app=1&handle=[redacted]&post=abc",
  );
  assert.equal(redactHandles("/html/profile.html?user=franky"), "/html/profile.html?user=[redacted]");
  assert.equal(redactHandles("/x?handle="), "/x?handle=");
  // Only those exact keys: user_id and handles= are other things.
  assert.equal(redactHandles("/rest/v1/posts?user_id=eq.1"), "/rest/v1/posts?user_id=eq.1");
});

test("tokens and handles in one link are both redacted", () => {
  const url = "/auth/confirm?token_hash=abc123&next=%2Fprofile%2Ffranky";
  assert.equal(
    redactHandles(redactAuthTokens(url)),
    "/auth/confirm?token_hash=[redacted]&next=%2Fprofile%2F:handle",
  );
});

test("a waitlist access code is redacted in a link and an encoded next=, and the body that held it is gone", () => {
  assert.equal(
    redactAuthTokens("https://www.connectvibe.app/auth/signup?access_code=VIBE-7KQ2-M9XD&src=mail"),
    "https://www.connectvibe.app/auth/signup?access_code=[redacted]&src=mail",
  );
  assert.equal(
    redactAuthTokens("/auth/login?next=%2Fauth%2Fsignup%3Faccess_code%3DVIBE-7KQ2-M9XD"),
    "/auth/login?next=%2Fauth%2Fsignup%3Faccess_code%3D[redacted]",
  );
  // The waitlist's manage link (?token=) was already covered; still is.
  assert.equal(
    redactAuthTokens("/waitlist/confirm?token=abcDEF_123-xyz&leave=1"),
    "/waitlist/confirm?token=[redacted]&leave=1",
  );
  // Only the exact key: a different name that ends in "code" is untouched.
  assert.equal(redactAuthTokens("/x?zip_code=46202"), "/x?zip_code=46202");

  const out = scrub({
    request: {
      url: "https://www.connectvibe.app/auth/signup?access_code=VIBE-7KQ2-M9XD",
      data: '{"email":"x","options":{"data":{"access_code":"VIBE-7KQ2-M9XD"}}}',
    },
  });
  assert.deepEqual(out.request, {
    url: "https://www.connectvibe.app/auth/signup?access_code=[redacted]",
  });
  assert.equal(JSON.stringify(out).includes("VIBE-7KQ2-M9XD"), false);
});

test("the event scrub reaches urls and breadcrumbs but not frames, and drops the body", () => {
  const frame = "https://www.connectvibe.app/_next/static/chunks/app/profile/page-3f2a1b9c.js";
  const event = {
    transaction: "/profile/franky",
    request: {
      url: "https://www.connectvibe.app/profile/franky?post=abc",
      data: '{"handle":"franky","name":"Franky"}',
    },
    breadcrumbs: [
      { category: "navigation", data: { from: "/campus", to: "/html/profile.html?app=1&handle=franky" } },
      { category: "fetch", data: { url: "/api/users/franky/posts" } },
    ],
    exception: { values: [{ stacktrace: { frames: [{ filename: frame, abs_path: frame }] } }] },
  } as unknown as AnyEvent;

  const out = scrubAuthTokensFromEvent(event) as unknown as {
    transaction: string;
    request: { url: string; data?: string };
    breadcrumbs: Array<{ data: Record<string, string> }>;
    exception: { values: Array<{ stacktrace: { frames: Array<{ filename: string; abs_path: string }> } }> };
  };
  assert.equal(out.transaction, "/profile/:handle");
  assert.equal(out.request.url, "https://www.connectvibe.app/profile/:handle?post=abc");
  assert.equal("data" in out.request, false);
  assert.equal(out.breadcrumbs[0].data.to, "/html/profile.html?app=1&handle=[redacted]");
  assert.equal(out.breadcrumbs[1].data.url, "/api/users/:handle/posts");
  assert.equal(out.exception.values[0].stacktrace.frames[0].filename, frame);
  assert.equal(out.exception.values[0].stacktrace.frames[0].abs_path, frame);
});

test("the request body is dropped whatever its shape: JSON text, a form, an object, a list", () => {
  for (const data of [
    '{"text":"see you at the library at nine"}',
    "handle=franky&bio=hi",
    { handle: "franky", bio: "hi", access_code: "VIBE-7KQ2-M9XD" },
    ["see you at nine"],
    "",
    null,
  ]) {
    const out = scrub({ request: { url: "https://www.connectvibe.app/api/posts", method: "POST", data } });
    assert.deepEqual(out.request, { url: "https://www.connectvibe.app/api/posts", method: "POST" });
  }
});

// ── The address of a database call ──────────────────────────────────────────

test("row 14's example: users?email=eq.<address> loses the address", () => {
  assert.equal(redactDbCallValues("users?email=eq.someone@iu.edu"), "users?email=eq.[redacted]");
  // The way the database client really writes it (URLSearchParams encodes the @).
  assert.equal(
    redactDbCallValues(`${DB}/rest/v1/users?select=id&email=eq.someone%40iu.edu`),
    `${DB}/rest/v1/users?select=id&email=eq.[redacted]`,
  );
});

test("eq, neq, in, like, ilike and cs lose their value; table, column and operator stay", () => {
  const cases: Array<[string, string]> = [
    [`/rest/v1/users?id=eq.${ME}`, "/rest/v1/users?id=eq.[redacted]"],
    [`/rest/v1/users?select=id&id=neq.${ME}`, "/rest/v1/users?select=id&id=neq.[redacted]"],
    [`/rest/v1/users?id=in.%28${ME}%2C${OTHER}%29&limit=2`, "/rest/v1/users?id=in.[redacted]&limit=2"],
    [`/rest/v1/users?id=in.(${ME},${OTHER})`, "/rest/v1/users?id=in.[redacted]"],
    ["/rest/v1/users?school_email=like.%25%40iu.edu", "/rest/v1/users?school_email=like.[redacted]"],
    ["/rest/v1/users?email=ilike.Someone%40IU.edu&select=id", "/rest/v1/users?email=ilike.[redacted]&select=id"],
    [`/rest/v1/threads?member_ids=cs.%7B${ME}%7D`, "/rest/v1/threads?member_ids=cs.[redacted]"],
    // Two filters in one address, and an upper-case operator.
    [
      `/rest/v1/users?select=id&school_email=eq.someone%40iu.edu&id=neq.${ME}`,
      "/rest/v1/users?select=id&school_email=eq.[redacted]&id=neq.[redacted]",
    ],
    [`/rest/v1/users?id=EQ.${ME}`, "/rest/v1/users?id=EQ.[redacted]"],
  ];
  for (const [input, expected] of cases) assert.equal(redactDbCallValues(input), expected);
});

test("the client's other operators, not., brackets, joined tables and JSON paths are covered too", () => {
  const cases: Array<[string, string]> = [
    [`/rest/v1/posts?author_id=not.in.%28${ME}%2C${OTHER}%29`, "/rest/v1/posts?author_id=not.in.[redacted]"],
    [`/rest/v1/posts?author_id=not.eq.${ME}`, "/rest/v1/posts?author_id=not.eq.[redacted]"],
    ["/rest/v1/posts?created_at=lt.2026-10-04T12%3A00%3A00Z", "/rest/v1/posts?created_at=lt.[redacted]"],
    [`/rest/v1/posts?id=gte.${ME}&order=id.asc`, "/rest/v1/posts?id=gte.[redacted]&order=id.asc"],
    ["/rest/v1/posts?removed_at=is.null", "/rest/v1/posts?removed_at=is.[redacted]"],
    ["/rest/v1/users?name=fts%28english%29.sam+lee", "/rest/v1/users?name=fts%28english%29.[redacted]"],
    ["/rest/v1/users?name=wfts(english).sam", "/rest/v1/users?name=wfts(english).[redacted]"],
    ["/rest/v1/users?name=ilike%28any%29.%7Bsam%25%2Clee%25%7D", "/rest/v1/users?name=ilike%28any%29.[redacted]"],
    [`/rest/v1/posts?tags=ov.%7B${ME}%7D`, "/rest/v1/posts?tags=ov.[redacted]"],
    [`/rest/v1/posts?creator.campus_id=in.%28${ME}%29`, "/rest/v1/posts?creator.campus_id=in.[redacted]"],
    [`/rest/v1/actions?meta-%3E%3Eorg_id=eq.${ME}`, "/rest/v1/actions?meta-%3E%3Eorg_id=eq.[redacted]"],
  ];
  for (const [input, expected] of cases) assert.equal(redactDbCallValues(input), expected);
});

test("a whole or=( … ) and and=( … ) is taken out, negated or on a joined table as well", () => {
  const blocks = `%28blocker_id.eq.${ME}%2Cblocked_id.eq.${ME}%29`;
  const cases: Array<[string, string]> = [
    [`/rest/v1/blocks?select=blocker_id&or=${blocks}`, "/rest/v1/blocks?select=blocker_id&or=[redacted]"],
    [`/rest/v1/blocks?or=(blocker_id.eq.${ME},blocked_id.eq.${ME})&limit=1`, "/rest/v1/blocks?or=[redacted]&limit=1"],
    ["/rest/v1/users?or=%28email.ilike.%25sam%25%2Chandle.ilike.%25sam%25%29", "/rest/v1/users?or=[redacted]"],
    [`/rest/v1/blocks?and=${blocks}`, "/rest/v1/blocks?and=[redacted]"],
    [`/rest/v1/blocks?not.or=${blocks}`, "/rest/v1/blocks?not.or=[redacted]"],
    [`/rest/v1/threads?select=id&members.or=${blocks}`, "/rest/v1/threads?select=id&members.or=[redacted]"],
  ];
  for (const [input, expected] of cases) assert.equal(redactDbCallValues(input), expected);
});

test("an ID in the path of a sign-in or storage call becomes :id, plain or encoded", () => {
  const cases: Array<[string, string]> = [
    [`DELETE ${DB}/auth/v1/admin/users/${ME}`, `DELETE ${DB}/auth/v1/admin/users/:id`],
    [`${DB}/auth/v1/admin/users/${ME}/factors/${OTHER}`, `${DB}/auth/v1/admin/users/:id/factors/:id`],
    [`${DB}/storage/v1/object/profiles/${ME}/avatar.jpg`, `${DB}/storage/v1/object/profiles/:id/avatar.jpg`],
    [
      `${DB}/storage/v1/object/sign/resumes/${ME}/cv.pdf?token=abc.def&download=1`,
      `${DB}/storage/v1/object/sign/resumes/:id/cv.pdf?token=abc.def&download=1`,
    ],
    [
      `/_next/image?url=https%3A%2F%2Fabcd.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fprofiles%2F${ME}%2Fa.jpg&w=640`,
      "/_next/image?url=https%3A%2F%2Fabcd.supabase.co%2Fstorage%2Fv1%2Fobject%2Fpublic%2Fprofiles%2F:id%2Fa.jpg&w=640",
    ],
  ];
  for (const [input, expected] of cases) assert.equal(redactDbCallValues(input), expected);
});

test("what is not a filter value is left alone", () => {
  for (const same of [
    // The rest of a database call.
    `${DB}/rest/v1/posts?select=id%2Cauthor%3Ausers%28id%2Cname%29&order=created_at.desc&limit=20&offset=40`,
    `${DB}/rest/v1/users?on_conflict=email&columns=%22email%22`,
    `${DB}/rest/v1/rpc/feed_page`,
    `${DB}/auth/v1/token?grant_type=refresh_token`,
    `${DB}/auth/v1/admin/users?page=1&per_page=50`,
    // The app's own addresses: a post or chat ID is not an account's sign-in.
    "/auth/login?next=%2Fcampus",
    `/api/users/by-id/${ME}`,
    `/api/me/threads/${OTHER}/messages`,
    "/campus?tab=is&sort=in",
    "/x?zip_code=46202&v=eq",
    // Stack frames: rewriting these would stop them matching the source maps.
    "https://www.connectvibe.app/_next/static/chunks/app/profile/page-3f2a1b9c.js",
    "/var/task/.next/server/app/api/users/[handle]/posts/route.js",
    "./src/lib/profile/storage-upload.ts",
    "webpack-internal:///(app-pages-browser)/./src/lib/supabase/storage.ts?eq=1",
    // No `?` or `&` in front: the keyed pass in the event scrub handles these.
    "email=eq.someone%40iu.edu",
  ]) {
    assert.equal(redactDbCallValues(same), same);
  }
});

test("a very long run of ? & and = is scrubbed quickly", () => {
  const long = `${"?&=".repeat(20000)}?email=eq.someone%40iu.edu`;
  const started = Date.now();
  const out = redactDbCallValues(long);
  assert.equal(out.endsWith("?email=eq.[redacted]"), true);
  assert.equal(Date.now() - started < 1000, true);
});

// ── The request record ─────────────────────────────────────────────────────

/** What the kit puts on a report about a server request (read off a local run of the kit). */
function serverRequest() {
  return {
    headers: {
      host: "www.connectvibe.app",
      "content-type": "application/json",
      cookie: "sb-abcd-auth-token=base64-eyJhY2Nlc3M; theme=night",
      authorization: "Bearer eyJhbGciOi",
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      "x-vercel-ip-city": "Indianapolis",
      "x-vercel-ip-latitude": "39.77",
      "x-vercel-proxied-for": "203.0.113.9",
      "x-real-ip": "203.0.113.9",
      referer: "https://www.connectvibe.app/profile/franky",
      "content-length": "62",
    },
    method: "POST",
    url: "https://www.connectvibe.app/api/me/threads/t1/messages?token_hash=abc123&x=1",
    cookies: { "sb-abcd-auth-token": "base64-eyJhY2Nlc3M", theme: "night" },
    query_string: "token_hash=abc123&x=1",
    data: '{"text":"see you at the library at nine"}',
  };
}

test("a server request record keeps only the address, the method and the browser's name", () => {
  const out = scrub({ request: { ...serverRequest(), env: { REMOTE_ADDR: "203.0.113.9" }, fragment: "x" } });
  assert.deepEqual(out.request, {
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
    method: "POST",
    url: "https://www.connectvibe.app/api/me/threads/t1/messages?token_hash=[redacted]&x=1",
  });
  const text = JSON.stringify(out);
  for (const gone of ["library", "eyJhY2Nlc3M", "sb-abcd", "eyJhbGciOi", "Indianapolis", "39.77", "203.0.113.9", "franky"]) {
    assert.equal(text.includes(gone), false, gone);
  }
});

test("the browser's request record keeps User-Agent, in its own spelling, and loses Referer", () => {
  const out = scrub({
    request: {
      url: "https://www.connectvibe.app/campus",
      headers: { Referer: "https://www.connectvibe.app/profile/franky", "User-Agent": "Mozilla/5.0 Safari" },
    },
  });
  assert.deepEqual(out.request, {
    url: "https://www.connectvibe.app/campus",
    headers: { "User-Agent": "Mozilla/5.0 Safari" },
  });
});

test("headers with no user-agent, or in a shape that is not a plain record, are dropped whole", () => {
  assert.deepEqual(scrub({ request: { url: "/x", headers: { cookie: "a=b" } } }).request, { url: "/x" });
  assert.deepEqual(scrub({ request: { url: "/x", headers: [["cookie", "a=b"]] } }).request, { url: "/x" });
  assert.deepEqual(scrub({ request: { url: "/x", headers: "cookie: a=b" } }).request, { url: "/x" });
  assert.deepEqual(scrub({ request: { url: "/x", headers: { "user-agent": 7 } } }).request, { url: "/x" });
  // The kit builds headers on a record with no prototype (headersToDict).
  const bare = Object.assign(Object.create(null) as Record<string, string>, { cookie: "a=b", "user-agent": "UA" });
  assert.deepEqual(scrub({ request: { url: "/x", headers: bare } }).request, { url: "/x", headers: { "user-agent": "UA" } });
});

test("a request that is not a plain record is dropped, and an event without one gains none", () => {
  for (const request of ["POST /api/posts", ["cookie", "a=b"], new Map([["cookie", "a=b"]])]) {
    assert.equal("request" in scrub({ message: "x", request }), false);
  }
  assert.deepEqual(scrub({ message: "x" }), { message: "x" });
  assert.deepEqual(scrub({ message: "x", request: undefined }), { message: "x", request: undefined });
  assert.deepEqual(scrub({ message: "x", request: null }), { message: "x", request: null });
});

// ── The copies: trace context, spans, trail ─────────────────────────────────

/** The root span of a server request, as the kit writes it into `contexts.trace.data`. */
function serverTraceData() {
  return {
    "sentry.op": "http.server",
    "http.method": "POST",
    "http.target": "/api/me/threads/t1/messages?token_hash=abc123&x=1",
    "http.url": "https://www.connectvibe.app/api/me/threads/t1/messages?token_hash=abc123&x=1",
    "http.query": "token_hash=abc123&x=1",
    "http.user_agent": "Mozilla/5.0 (iPhone)",
    "http.client_ip": "203.0.113.9",
    "user.ip_address": "203.0.113.9",
    "http.request.body.data": '{"text":"see you at the library at nine"}',
    "http.request.header.cookie.sb_abcd_auth_token": "[Filtered]",
    "http.request.header.cookie.theme": "night",
    "http.request.header.cookie": "[Filtered]",
    "http.request.header.authorization": "[Filtered]",
    "http.request.header.user_agent": "Mozilla/5.0 (iPhone)",
    "http.request.header.x_vercel_ip_city": "[Filtered]",
    "http.request.header.x_vercel_proxied_for": "203.0.113.9",
    "http.request.header.referer": "https://www.connectvibe.app/profile/franky",
    "http.request.header.content_length": "62",
    "http.response.header.set_cookie.sb_abcd_auth_token": "base64-eyJhY2Nlc3M",
    "http.response.header.content_type": "application/json",
    "http.response.status_code": 500,
  };
}

test("the trace context loses the body, every header but user_agent, the cookies and the IP address", () => {
  const out = scrub({ type: "transaction", contexts: { trace: { op: "http.server", data: serverTraceData() } } });
  assert.deepEqual(out.contexts.trace.data, {
    "sentry.op": "http.server",
    "http.method": "POST",
    "http.target": "/api/me/threads/t1/messages?token_hash=[redacted]&x=1",
    "http.url": "https://www.connectvibe.app/api/me/threads/t1/messages?token_hash=[redacted]&x=1",
    // No `?` in front of the first pair: the kit cuts it off.
    "http.query": "token_hash=[redacted]&x=1",
    "http.user_agent": "Mozilla/5.0 (iPhone)",
    "http.request.header.user_agent": "Mozilla/5.0 (iPhone)",
    "http.response.header.content_type": "application/json",
    "http.response.status_code": 500,
  });
  assert.equal(out.contexts.trace.op, "http.server");
});

/** One database call as a span of a speed report (read off a local run of the kit). */
function dbSpan(path: string, query: string) {
  return {
    span_id: "a6b523075f48d198",
    op: "http.client",
    description: `GET ${DB}${path}`,
    data: {
      "sentry.origin": "auto.http.otel.node_fetch",
      "url.full": `${DB}${path}${query ? `?${query}` : ""}`,
      "url.path": path,
      "url.query": query ? `?${query}` : "",
      url: `${DB}${path}`,
      "http.query": query,
      "http.request.header.authorization": ["Bearer service-key"],
      "http.request.body.data": '{"email":"someone@iu.edu"}',
      "http.response.status_code": 200,
    },
  };
}

test("each span loses the same keys, and a database call's address loses its values", () => {
  const out = scrub({
    type: "transaction",
    spans: [
      dbSpan("/rest/v1/users", `email=eq.someone%40iu.edu&select=id&id=neq.${ME}`),
      dbSpan("/rest/v1/blocks", `or=%28blocker_id.eq.${ME}%2Cblocked_id.eq.${ME}%29&select=blocker_id`),
      dbSpan(`/auth/v1/admin/users/${ME}`, ""),
      dbSpan(`/storage/v1/object/profiles/${ME}/avatar.jpg`, ""),
    ],
  });
  assert.deepEqual(out.spans[0], {
    span_id: "a6b523075f48d198",
    op: "http.client",
    description: `GET ${DB}/rest/v1/users`,
    data: {
      "sentry.origin": "auto.http.otel.node_fetch",
      "url.full": `${DB}/rest/v1/users?email=eq.[redacted]&select=id&id=neq.[redacted]`,
      "url.path": "/rest/v1/users",
      "url.query": "?email=eq.[redacted]&select=id&id=neq.[redacted]",
      url: `${DB}/rest/v1/users`,
      "http.query": "email=eq.[redacted]&select=id&id=neq.[redacted]",
      "http.response.status_code": 200,
    },
  });
  assert.equal(out.spans[1].data["url.full"], `${DB}/rest/v1/blocks?or=[redacted]&select=blocker_id`);
  assert.equal(out.spans[1].data["http.query"], "or=[redacted]&select=blocker_id");
  assert.equal(out.spans[2].description, `GET ${DB}/auth/v1/admin/users/:id`);
  assert.equal(out.spans[2].data["url.path"], "/auth/v1/admin/users/:id");
  assert.equal(out.spans[2].data["http.query"], "");
  assert.equal(out.spans[3].description, `GET ${DB}/storage/v1/object/profiles/:id/avatar.jpg`);
  const text = JSON.stringify(out);
  for (const gone of [ME, "someone", "service-key"]) assert.equal(text.includes(gone), false, gone);
});

test("the trail loses the same things: database calls, log lines and copied keys", () => {
  const out = scrub({
    breadcrumbs: [
      {
        category: "http",
        type: "http",
        data: {
          status_code: 200,
          url: `${DB}/rest/v1/users`,
          "http.method": "GET",
          "http.query": `?select=id&school_email=eq.someone%40iu.edu&id=neq.${ME}`,
        },
      },
      { category: "http", data: { url: `${DB}/auth/v1/admin/users/${ME}`, "http.method": "DELETE" } },
      {
        category: "console",
        message: `waitlist lookup /rest/v1/waitlist?email_key=eq.someone@iu.edu failed for /profile/franky`,
        data: { arguments: ["waitlist lookup", `/rest/v1/waitlist?email_key=eq.someone@iu.edu`], logger: "console" },
      },
      { category: "fetch", data: { method: "POST", url: "/api/posts", "http.request.body.data": "hello" } },
      // A fragment the kit stores with its `#` cut off.
      { category: "navigation", data: { "http.fragment": "access_token=abc&refresh_token=def&type=recovery" } },
    ],
  });
  assert.equal(out.breadcrumbs[0].data["http.query"], "?select=id&school_email=eq.[redacted]&id=neq.[redacted]");
  assert.equal(out.breadcrumbs[0].data.status_code, 200);
  assert.equal(out.breadcrumbs[1].data.url, `${DB}/auth/v1/admin/users/:id`);
  assert.equal(
    out.breadcrumbs[2].message,
    "waitlist lookup /rest/v1/waitlist?email_key=eq.[redacted] failed for /profile/:handle",
  );
  assert.deepEqual(out.breadcrumbs[2].data.arguments, ["waitlist lookup", "/rest/v1/waitlist?email_key=eq.[redacted]"]);
  assert.deepEqual(out.breadcrumbs[3].data, { method: "POST", url: "/api/posts" });
  assert.equal(
    out.breadcrumbs[4].data["http.fragment"],
    "access_token=[redacted]&refresh_token=[redacted]&type=recovery",
  );
});

// ── The report is always sent ──────────────────────────────────────────────

test("both hooks hand back the same event, cleaned, never null", () => {
  const options = getSentryInitOptions();
  assert.equal(options.sendDefaultPii, false);
  const hint = {};
  const error = { request: serverRequest(), exception: { values: [{ type: "Error", value: "send failed" }] } };
  const sentError = options.beforeSend?.(error as never, hint);
  assert.equal(sentError, error);
  assert.deepEqual(Object.keys(error.request).sort(), ["headers", "method", "url"]);

  const speed = { type: "transaction", request: serverRequest(), spans: [], contexts: { trace: { data: serverTraceData() } } };
  const sentSpeed = options.beforeSendTransaction?.(speed as never, hint);
  assert.equal(sentSpeed, speed);
  assert.deepEqual(Object.keys(speed.request).sort(), ["headers", "method", "url"]);
  assert.equal("http.request.body.data" in speed.contexts.trace.data, false);
});

test("the kit's own working data is left for the kit", () => {
  const metadata = { normalizedRequest: serverRequest(), spanCountBeforeProcessing: 3 };
  const out = scrub({ message: "x", sdkProcessingMetadata: metadata });
  assert.equal(out.sdkProcessingMetadata, metadata);
  assert.deepEqual(out.sdkProcessingMetadata.normalizedRequest, serverRequest());
});

test("a value that throws when read does not stop the report or the rest of the cleaning", () => {
  const extra = { ok: "/profile/franky" } as Record<string, unknown>;
  Object.defineProperty(extra, "boom", {
    enumerable: true,
    get() {
      throw new Error("unreadable");
    },
  });
  const list = ["/profile/franky"];
  Object.defineProperty(list, 1, {
    enumerable: true,
    get() {
      throw new Error("unreadable");
    },
  });
  const event = {
    request: serverRequest(),
    extra,
    tags: list,
    transaction: "/profile/franky",
    breadcrumbs: [{ data: { url: "/api/users/franky/posts" } }],
  };
  const out = scrub(event);
  assert.equal(out, event);
  assert.deepEqual(Object.keys(out.request).sort(), ["headers", "method", "url"]);
  assert.equal(out.extra.ok, "/profile/:handle");
  assert.equal(out.tags[0], "/profile/:handle");
  assert.equal(out.transaction, "/profile/:handle");
  assert.equal(out.breadcrumbs[0].data.url, "/api/users/:handle/posts");
});

test("a request record that cannot be edited is dropped whole, and the report still goes", () => {
  const event = { request: Object.freeze(serverRequest()), transaction: "/profile/franky" };
  const out = scrub(event);
  assert.equal(out, event);
  assert.equal("request" in out, false);
  assert.equal(out.transaction, "/profile/:handle");
});

test("an event that cannot be edited at all comes back as it was, with no throw", () => {
  const frozen = Object.freeze({ request: Object.freeze({ data: "x" }), transaction: "/profile/franky" });
  assert.equal(scrub(frozen), frozen);
  for (const odd of [null, undefined, "text", 7]) {
    assert.equal(scrubAuthTokensFromEvent(odd as unknown as AnyEvent), odd);
  }
});

test("a loop in the data and very deep data both end", () => {
  const loop: Loose = { url: "/profile/franky" };
  loop.self = loop;
  loop.list = [loop, "/profile/franky"];
  const out = scrub({ extra: loop });
  assert.equal(out.extra.url, "/profile/:handle");
  assert.equal(out.extra.list[1], "/profile/:handle");

  let deep: Loose = { url: "/profile/franky" };
  for (let i = 0; i < 40; i++) deep = { next: deep };
  assert.doesNotThrow(() => scrub({ extra: deep }));
});

test("class-shaped values are left alone", () => {
  class Box {
    url = "/profile/franky";
  }
  const box = new Box();
  const when = new Date(0);
  const out = scrub({ extra: { box, when } });
  assert.equal(out.extra.box, box);
  assert.equal(box.url, "/profile/franky");
  assert.equal(out.extra.when, when);
});

// ── Through the installed kit ──────────────────────────────────────────────
//
// The tests above feed the scrubber events typed by hand. These two let the
// installed kit build the report itself, from a request like the one a phone
// sends with a chat message, and read what the kit would put on the wire.

/** A chat message arriving at the server, as Node hands it to the kit. */
const INCOMING = {
  method: "POST",
  url: "/api/me/threads/t1/messages?token_hash=abc123&x=1",
  headers: {
    host: "www.connectvibe.app",
    "x-forwarded-proto": "https",
    "content-type": "application/json",
    cookie: "sb-abcd-auth-token=base64-eyJhY2Nlc3M; theme=night",
    authorization: "Bearer eyJhbGciOi",
    "user-agent": "Mozilla/5.0 (iPhone)",
    "x-vercel-ip-city": "Bloomington",
    "x-vercel-proxied-for": "203.0.113.9",
  },
};
const BODY = '{"text":"see you at the library at nine"}';
const SECRETS = ["library", "eyJhY2Nlc3M", "sb-abcd", "eyJhbGciOi", "Bloomington", "203.0.113.9", "abc123", "someone", ME];

/** Sends one error report and one speed report through the kit; returns what it would have sent. */
async function throughKit(withScrubber: boolean): Promise<string[]> {
  const sent: string[] = [];
  const ours = getSentryInitOptions();
  const client = new ServerRuntimeClient({
    dsn: "https://public@o0.ingest.sentry.invalid/1",
    sendDefaultPii: ours.sendDefaultPii,
    beforeSend: withScrubber ? ours.beforeSend : undefined,
    beforeSendTransaction: withScrubber ? ours.beforeSendTransaction : undefined,
    integrations: [requestDataIntegration()],
    stackParser: () => [],
    // Records and sends nothing.
    transport: () => ({
      send: async (envelope: unknown) => {
        sent.push(JSON.stringify(envelope));
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  } as unknown as ConstructorParameters<typeof ServerRuntimeClient>[0]);
  client.init();

  // The two writes the kit makes for a server request: the request line,
  // headers and cookies when it arrives (httpRequestToRequestData), then the
  // body once it has been read (patchRequestToCaptureBody).
  const forRequest = () => {
    const isolationScope = new Scope();
    isolationScope.setSDKProcessingMetadata({ normalizedRequest: httpRequestToRequestData(INCOMING) });
    isolationScope.setSDKProcessingMetadata({ normalizedRequest: { data: BODY } });
    return { capturedSpanScope: new Scope(), capturedSpanIsolationScope: isolationScope };
  };
  client.captureEvent({
    exception: { values: [{ type: "Error", value: "send failed" }] },
    breadcrumbs: [
      { category: "http", data: { url: `${DB}/rest/v1/users`, "http.query": `?id=eq.${ME}&email=eq.someone%40iu.edu` } },
    ],
    sdkProcessingMetadata: forRequest(),
  });
  client.captureEvent({
    type: "transaction",
    transaction: "POST /api/me/threads/[id]/messages",
    contexts: {
      trace: {
        trace_id: "ad769f85f10942a3bf7e6e7342454981",
        span_id: "91adf8cd17635e0a",
        op: "http.server",
        data: {
          "http.target": INCOMING.url,
          // The call @sentry/nextjs makes for the root span (addHeadersAsAttributes).
          ...httpHeadersToSpanAttributes(INCOMING.headers, client.getDataCollectionOptions()),
        },
      },
    },
    spans: [dbSpan("/rest/v1/users", `id=eq.${ME}&email=eq.someone%40iu.edu`)] as never,
    sdkProcessingMetadata: forRequest(),
  });
  await client.flush(2000);
  await client.close(2000);
  return sent;
}

test("control: without the scrubber the installed kit does copy the body, the cookie and the headers", async () => {
  const sent = await throughKit(false);
  const text = sent.join("\n");
  // If this fails the kit changed what it copies: read it again before trusting the test below.
  for (const present of ["library", "eyJhY2Nlc3M", "203.0.113.9", "abc123"]) {
    assert.equal(text.includes(present), true, present);
  }
});

test("with the scrubber both reports are still sent, and none of it is in them", async () => {
  const sent = await throughKit(true);
  const error = sent.find((envelope) => envelope.includes('"type":"event"'));
  const speed = sent.find((envelope) => envelope.includes('"type":"transaction"'));
  assert.ok(error, "the error report was sent");
  assert.ok(speed, "the speed report was sent");
  for (const envelope of [error, speed]) {
    for (const secret of SECRETS) assert.equal(envelope.includes(secret), false, secret);
    assert.equal(envelope.includes("Mozilla/5.0 (iPhone)"), true);
    assert.equal(envelope.includes('"data":"{'), false);
    assert.equal(envelope.includes('"cookies"'), false);
  }
  assert.equal(error.includes("send failed"), true);
  assert.equal(speed.includes("token_hash=[redacted]"), true);
  assert.equal(speed.includes("email=eq.[redacted]"), true);
});
