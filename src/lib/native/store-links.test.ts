/**
 * Tests for `store-links.ts`: the "get the app" listings and which phone is
 * sent to which store (plan §8.2, wave 3′; the rule came from /get).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/native/store-links.test.ts
 *
 * APP_STORE_URL and PLAY_STORE_URL are read once, when the module loads. So
 * the env is set BEFORE the first import, and a second copy of the module is
 * loaded with the env cleared (a "?unset" query makes Node treat it as a
 * separate module). Node's type stripping needs the ".ts" on disk and tsc
 * refuses a literal ".ts" import (TS5097), hence the variable specifiers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Platform } from "@/lib/pwa/display-mode";

const APP = "https://apps.apple.com/us/app/vibe/id0000000000";
const PLAY = "https://play.google.com/store/apps/details?id=app.connectvibe";

process.env.NEXT_PUBLIC_APP_STORE_URL = `  ${APP}  `;
process.env.NEXT_PUBLIC_PLAY_STORE_URL = PLAY;
const specifier = "./store-links.ts";
const set = (await import(specifier)) as typeof import("./store-links");

delete process.env.NEXT_PUBLIC_APP_STORE_URL;
delete process.env.NEXT_PUBLIC_PLAY_STORE_URL;
const unsetSpecifier = "./store-links.ts?unset";
const unset = (await import(unsetSpecifier)) as typeof import("./store-links");

const IOS_BROWSERS: Platform[] = ["ios-safari", "ios-other-browser", "ios-in-app"];
const ANDROID_BROWSERS: Platform[] = ["android-chrome", "android-samsung", "android-other"];
const NO_STORE: Array<Platform | null> = [
  "ios-app",
  "android-app",
  "desktop-chromium",
  "desktop-safari",
  "firefox",
  "other",
  null,
];

test("storeListingUrl keeps a real listing for that store (trimmed)", () => {
  const { storeListingUrl, APP_STORE_PREFIX, PLAY_STORE_PREFIX } = set;
  assert.equal(storeListingUrl(` ${APP}\n`, APP_STORE_PREFIX), APP);
  assert.equal(storeListingUrl(PLAY, PLAY_STORE_PREFIX), PLAY);
});

test("storeListingUrl refuses anything that isn't that store's listing", () => {
  const { storeListingUrl, APP_STORE_PREFIX, PLAY_STORE_PREFIX } = set;
  assert.equal(storeListingUrl(undefined, APP_STORE_PREFIX), null);
  assert.equal(storeListingUrl("", APP_STORE_PREFIX), null);
  assert.equal(storeListingUrl("   ", APP_STORE_PREFIX), null);
  // The bare origin isn't a listing.
  assert.equal(storeListingUrl(APP_STORE_PREFIX, APP_STORE_PREFIX), null);
  // The other store, plain http, and look-alike hosts.
  assert.equal(storeListingUrl(PLAY, APP_STORE_PREFIX), null);
  assert.equal(storeListingUrl(APP, PLAY_STORE_PREFIX), null);
  assert.equal(storeListingUrl("http://apps.apple.com/us/app/vibe", APP_STORE_PREFIX), null);
  assert.equal(storeListingUrl("https://apps.apple.com.evil.test/x", APP_STORE_PREFIX), null);
  assert.equal(storeListingUrl("https://evil.test/https://apps.apple.com/", APP_STORE_PREFIX), null);
});

test("the listings come from the env, trimmed and checked", () => {
  assert.equal(set.APP_STORE_URL, APP);
  assert.equal(set.PLAY_STORE_URL, PLAY);
  assert.equal(unset.APP_STORE_URL, null);
  assert.equal(unset.PLAY_STORE_URL, null);
});

test("iPhone browsers get the App Store, Android browsers get Google Play", () => {
  for (const p of IOS_BROWSERS) assert.equal(set.storeUrlFor(p), APP, p);
  for (const p of ANDROID_BROWSERS) assert.equal(set.storeUrlFor(p), PLAY, p);
});

test("the store apps, computers and unknown devices get no store", () => {
  for (const p of NO_STORE) assert.equal(set.storeUrlFor(p), null, String(p));
});

test("a store whose URL isn't set yet is never offered", () => {
  for (const p of [...IOS_BROWSERS, ...ANDROID_BROWSERS, ...NO_STORE]) {
    assert.equal(unset.storeUrlFor(p), null, String(p));
  }
});
