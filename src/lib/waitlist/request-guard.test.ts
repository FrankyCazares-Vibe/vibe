/**
 * Tests for the waitlist form's same-page rule (`request-guard.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/request-guard.test.ts
 */

import assert from "node:assert/strict";
import test from "node:test";

const specifier = "./request-guard.ts";
const { WAITLIST_UNAVAILABLE, waitlistPostRefusal, waitlistStoreRefusal } = (await import(
  specifier
)) as typeof import("./request-guard");

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

test("a switch that can't be read is 503 with the form's own sentence: no thank-you for an entry that can't be saved", () => {
  assert.deepEqual(waitlistStoreRefusal(null), { status: 503, error: WAITLIST_UNAVAILABLE });
  assert.equal(WAITLIST_UNAVAILABLE, "The waitlist isn't available right now. Try again later.");
});

test("a switch that answers passes, closed or open: the switch is wording, not a gate on the form", () => {
  assert.equal(waitlistStoreRefusal(false), null);
  assert.equal(waitlistStoreRefusal(true), null);
});
