import { test } from "node:test";
import assert from "node:assert/strict";

// Node's type stripping needs the ".ts" on disk; tsc refuses a literal ".ts"
// import (TS5097) and next build type-checks this file. A variable specifier
// keeps both happy, the display-mode.test.ts pattern.
const specifier = "./bridge.ts";
const { pushTapPath } = (await import(specifier)) as typeof import("./bridge");

const LIVE = "https://www.connectvibe.app";
const DEV = "http://localhost:3000";

test("a link on the live site opens as its path, query and hash", () => {
  assert.equal(pushTapPath(`${LIVE}/messages?channel=abc#m-1`, LIVE), "/messages?channel=abc#m-1");
  assert.equal(pushTapPath(`${LIVE}/posts/123`, LIVE), "/posts/123");
  assert.equal(pushTapPath(`${LIVE}/`, LIVE), "/");
});

test("a live-site link still opens when the app runs on a dev server", () => {
  assert.equal(pushTapPath(`${LIVE}/campus?tab=people`, DEV), "/campus?tab=people");
});

test("the page's own origin is accepted, so a dev app's local pushes open", () => {
  assert.equal(pushTapPath(`${DEV}/messages?channel=abc#latest`, DEV), "/messages?channel=abc#latest");
});

test("another localhost port, or localhost from the live app, is refused", () => {
  assert.equal(pushTapPath("http://localhost:4000/messages", DEV), null);
  assert.equal(pushTapPath(`${DEV}/messages`, LIVE), null);
});

test("other hosts are refused, look-alikes included", () => {
  assert.equal(pushTapPath("https://evil.example/messages", LIVE), null);
  assert.equal(pushTapPath("https://connectvibe.app/messages", LIVE), null);
  assert.equal(pushTapPath("https://www.connectvibe.app.evil.example/messages", LIVE), null);
  assert.equal(pushTapPath("https://www.connectvibe.app:8443/messages", LIVE), null);
});

test("plain http on the live host is refused", () => {
  assert.equal(pushTapPath("http://www.connectvibe.app/messages", LIVE), null);
});

test("javascript: and data: are refused, even against an opaque page origin", () => {
  assert.equal(pushTapPath("javascript:alert(1)", LIVE), null);
  assert.equal(pushTapPath("javascript:alert(1)", "null"), null);
  assert.equal(pushTapPath("data:text/html,<p>hi</p>", "null"), null);
  assert.equal(pushTapPath("blob:https://www.connectvibe.app/1234", LIVE), null);
});

test("leading slashes collapse, so the path can't name another site", () => {
  assert.equal(pushTapPath(`${LIVE}//evil.example/x`, LIVE), "/evil.example/x");
  assert.equal(pushTapPath(`${DEV}//evil.example`, DEV), "/evil.example");
  assert.equal(pushTapPath(`${LIVE}/\\evil.example`, LIVE), "/evil.example");
});

test("relative links, junk and non-strings are refused", () => {
  assert.equal(pushTapPath("/messages", LIVE), null);
  assert.equal(pushTapPath("", LIVE), null);
  assert.equal(pushTapPath("not a url", LIVE), null);
  assert.equal(pushTapPath(null, LIVE), null);
  assert.equal(pushTapPath(undefined, LIVE), null);
  assert.equal(pushTapPath(42, LIVE), null);
  assert.equal(pushTapPath({ url: `${LIVE}/messages` }, LIVE), null);
});
