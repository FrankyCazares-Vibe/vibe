/**
 * Tests for the waitlist form's same-page rule (`request-guard.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/request-guard.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

const specifier = "./request-guard.ts";
const { waitlistPostRefusal } = (await import(specifier)) as typeof import("./request-guard");

test("our page's fetch passes: JSON, same-origin (or no header at all)", () => {
  assert.equal(waitlistPostRefusal({ contentType: "application/json", secFetchSite: "same-origin" }), null);
  assert.equal(waitlistPostRefusal({ contentType: "Application/JSON; charset=utf-8", secFetchSite: null }), null);
  assert.equal(waitlistPostRefusal({ contentType: "application/json", secFetchSite: "" }), null);
});

test("a simple cross-site post (text/plain, a form) is 415", () => {
  for (const contentType of ["text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded",
    "multipart/form-data; boundary=x", "", null, "application/jsonp", "application/json-patch+json"]) {
    assert.equal(waitlistPostRefusal({ contentType, secFetchSite: "same-origin" })?.status, 415, String(contentType));
  }
});

test("a browser saying the post came from another site is 403", () => {
  for (const secFetchSite of ["cross-site", "same-site", "none", "CROSS-SITE"]) {
    assert.equal(waitlistPostRefusal({ contentType: "application/json", secFetchSite })?.status, 403, secFetchSite);
  }
});
