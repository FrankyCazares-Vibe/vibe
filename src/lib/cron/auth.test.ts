/**
 * Tests for the Vercel Cron check (`auth.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/cron/auth.test.ts
 *
 * auth.ts imports only `node:crypto`, so it loads through a dynamic import
 * of its ".ts" path, like the waitlist tests.
 */

import assert from "node:assert/strict";
import test from "node:test";

const specifier = "./auth.ts";
const { CRON_SECRET_MIN_LENGTH, cronAuthorization } = (await import(specifier)) as typeof import("./auth");

const SECRET = "s3cr3t-0123456789abcdef";

test("the exact bearer passes", () => {
  assert.equal(cronAuthorization(`Bearer ${SECRET}`, SECRET), "ok");
});

test("anything else is denied", () => {
  for (const header of [
    null,
    undefined,
    "",
    SECRET,
    `bearer ${SECRET}`,
    `Bearer  ${SECRET}`,
    `Bearer ${SECRET} `,
    `Bearer ${SECRET.slice(0, -1)}`,
    `Bearer ${SECRET}x`,
    "Bearer undefined",
    "Basic abc",
  ]) {
    assert.equal(cronAuthorization(header, SECRET), "denied", String(header));
  }
});

test("no usable secret refuses every call, even a matching-looking one", () => {
  assert.equal(CRON_SECRET_MIN_LENGTH, 16);
  for (const secret of [undefined, null, "", "short", "x".repeat(CRON_SECRET_MIN_LENGTH - 1)]) {
    assert.equal(cronAuthorization(`Bearer ${secret}`, secret), "unconfigured", String(secret));
    assert.equal(cronAuthorization("Bearer undefined", secret), "unconfigured", String(secret));
  }
  assert.equal(cronAuthorization(`Bearer ${"x".repeat(16)}`, "x".repeat(16)), "ok");
});
