import { test } from "node:test";
import assert from "node:assert/strict";

// Node's type stripping needs the ".ts" on disk; tsc refuses a literal ".ts"
// import (TS5097) and next build type-checks this file. A variable specifier
// keeps both happy, the display-mode.test.ts pattern.
const specifier = "./detect.ts";
const { detectAppShell } = (await import(specifier)) as typeof import("./detect");

const IOS_WKWEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_WEBVIEW =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36";

test("the iPhone app's token, with or without a space before it", () => {
  assert.equal(detectAppShell(`${IOS_WKWEBVIEW} VibeApp/1 (ios)`), "ios-app");
  assert.equal(detectAppShell(`${IOS_WKWEBVIEW}VibeApp/1 (ios)`), "ios-app");
});

test("the Android app's token", () => {
  assert.equal(detectAppShell(`${ANDROID_WEBVIEW} VibeApp/1 (android)`), "android-app");
});

test("a later major version still counts", () => {
  assert.equal(detectAppShell(`${IOS_WKWEBVIEW} VibeApp/2 (ios)`), "ios-app");
});

test("browsers and bare web views are not the app", () => {
  assert.equal(detectAppShell(IOS_WKWEBVIEW), null);
  assert.equal(detectAppShell(ANDROID_WEBVIEW), null);
  assert.equal(
    detectAppShell("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1"),
    null,
  );
  assert.equal(detectAppShell(""), null);
  assert.equal(detectAppShell(null), null);
  assert.equal(detectAppShell(undefined), null);
});

test("a look-alike token with another platform is not the app", () => {
  assert.equal(detectAppShell(`${IOS_WKWEBVIEW} VibeApp/1 (windows)`), null);
  assert.equal(detectAppShell(`${IOS_WKWEBVIEW} VibeApp/x (ios)`), null);
});
