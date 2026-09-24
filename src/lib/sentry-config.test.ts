/**
 * Tests for `sentry-config.ts`: the handle scrub added for the store privacy
 * forms (handoffs/wave-plan-pwa/critic-s1.md item 18), next to the auth-token
 * scrub it runs after.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/sentry-config.test.ts
 *
 * The module has only an `import type` line, which type stripping erases, so
 * it loads through a dynamic import of its ".ts" path, the same pattern as
 * `src/lib/mentions.test.ts`. The specifier goes through a variable because
 * tsc refuses a literal ".ts" specifier. No DSN is set, so nothing is sent.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./sentry-config.ts";
const { redactHandles, redactAuthTokens, scrubAuthTokensFromEvent } = (await import(
  specifier
)) as typeof import("./sentry-config");

type AnyEvent = Parameters<typeof scrubAuthTokensFromEvent>[0];

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

test("the event scrub reaches urls, breadcrumbs and bodies but not frames", () => {
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
    request: { url: string; data: string };
    breadcrumbs: Array<{ data: Record<string, string> }>;
    exception: { values: Array<{ stacktrace: { frames: Array<{ filename: string; abs_path: string }> } }> };
  };
  assert.equal(out.transaction, "/profile/:handle");
  assert.equal(out.request.url, "https://www.connectvibe.app/profile/:handle?post=abc");
  assert.equal(out.request.data, '{"handle":"[redacted]","name":"Franky"}');
  assert.equal(out.breadcrumbs[0].data.to, "/html/profile.html?app=1&handle=[redacted]");
  assert.equal(out.breadcrumbs[1].data.url, "/api/users/:handle/posts");
  assert.equal(out.exception.values[0].stacktrace.frames[0].filename, frame);
  assert.equal(out.exception.values[0].stacktrace.frames[0].abs_path, frame);
});

test("a form body's first handle= and an object body's handle key are redacted", () => {
  const form = { request: { data: "handle=franky&bio=hi" } } as unknown as AnyEvent;
  assert.equal(
    (scrubAuthTokensFromEvent(form) as unknown as { request: { data: string } }).request.data,
    "handle=[redacted]&bio=hi",
  );
  const obj = { request: { data: { handle: "franky", bio: "hi" } } } as unknown as AnyEvent;
  assert.deepEqual(
    (scrubAuthTokensFromEvent(obj) as unknown as { request: { data: unknown } }).request.data,
    { handle: "[redacted]", bio: "hi" },
  );
});
