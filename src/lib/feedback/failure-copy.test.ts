/**
 * Tests for the Retry rule in `failure-copy.ts` (wave B, B5): which failed
 * loads show a Retry button, and the static twin in
 * public/html/_persistence.js keeping the same list.
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test src/lib/feedback/failure-copy.test.ts
 *
 * WHY THE RESOLVE HOOK: failure-copy.ts imports "@/lib/native/detect", which
 * plain node can't resolve. Same hook as avatar-upload.test.ts ("@/x" →
 * "src/x.ts", extensionless relative specifiers retried with ".ts").
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { readFile } from "node:fs/promises";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("failure-copy.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
const REPO_ROOT = new URL("../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const { NO_RETRY_STATUSES, describeFailure, failureRetryable } = await import("./failure-copy");

const sig = (status: number, error: string | null = null, code: string | null = null) => ({
  status,
  code,
  error,
  retryAfterSec: null,
});

test("failureRetryable: offline, timeouts, conflicts, rate limits and server errors keep Retry", () => {
  for (const status of [0, 200, 408, 409, 429, 500, 502, 503]) {
    assert.equal(failureRetryable(status), true, `status ${status}`);
  }
});

test("failureRetryable: 400, 403, 404 and 422 show no Retry", () => {
  for (const status of [400, 403, 404, 422]) {
    assert.equal(failureRetryable(status), false, `status ${status}`);
  }
  assert.deepEqual([...NO_RETRY_STATUSES], [400, 403, 404, 422]);
  assert.ok(Object.isFrozen(NO_RETRY_STATUSES));
});

test("failureRetryable: the real lines for those statuses never ask for a retry", () => {
  const cases: Array<[ReturnType<typeof sig>, string]> = [
    [sig(404, "Not found"), "gone post"],
    [sig(403, "Forbidden"), "generic refusal"],
    [sig(403, "Unavailable"), "block refusal"],
    [sig(403, "Join the club to see this"), "server sentence"],
    [sig(400, "Invalid id"), "bad request"],
    [sig(400, "Comment is empty"), "pass-through 400"],
    [sig(422, "Blocked", "content_blocked"), "word filter"],
  ];
  for (const [s, label] of cases) {
    const { message } = describeFailure(s, "Couldn't load this post.", "/");
    assert.equal(failureRetryable(s.status, message), false, `${label}: ${message}`);
  }
});

test("failureRetryable: a line that says Try again keeps its button", () => {
  // A 403 or 422 whose body isn't our JSON falls through to the caller's
  // line + " Try again.": the button must not disappear under that line.
  for (const s of [sig(403), sig(422, null, "something_else")]) {
    const { message } = describeFailure(s, "Couldn't load this post.", "/");
    assert.match(message, /Try again\.$/);
    assert.equal(failureRetryable(s.status, message), true, message);
  }
});

test("describeFailure: a gone post's line keeps its exact shape (no new keys)", () => {
  assert.deepEqual(describeFailure(sig(404), "Couldn't load this post.", "/"), {
    message: "That's no longer available.",
  });
});

/**
 * DRIFT TRIPWIRE for public/html/_persistence.js: it can't import TS, so it
 * keeps its own NO_RETRY list and the same "Try again" exception.
 */
test("drift: public/html/_persistence.js NO_RETRY matches NO_RETRY_STATUSES", async () => {
  const js = await readFile(new URL("public/html/_persistence.js", REPO_ROOT), "utf8");
  const m = js.match(/const NO_RETRY = \[([^\]]*)\];/);
  assert.ok(m, "public/html/_persistence.js must declare `const NO_RETRY = [...]` in vibeFeedbackInit.");
  const list = m[1]
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n));
  assert.deepEqual(list, [...NO_RETRY_STATUSES]);
  assert.ok(
    js.includes("/\\bTry again\\b/.test("),
    "public/html/_persistence.js retryable() must keep the same \"Try again\" exception.",
  );
});
