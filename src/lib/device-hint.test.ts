/**
 * Tests for `device-hint.ts`: the server's first guess at "phone or not",
 * which decides the screen a `*Switch.tsx` file builds on the server.
 *
 * Run with:
 *   node --test src/lib/device-hint.test.ts
 *
 * The subject loads through a variable specifier: a literal ".ts" import
 * breaks `tsc` (TS5097), and the module has no imports, so no resolve hook
 * is needed.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./device-hint.ts";
const hint = (await import(specifier)) as typeof import("./device-hint");
const { guessPhone, isPhoneRequest, isPhoneUserAgent, MOBILE_HINT_HEADER, readMobileHint } = hint;

// Real user agents, one per kind of device the app sees.
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22F76 Instagram 390.0.0.28.85 (iPhone16,1; iOS 18_5; en_US; en; scale=3.00; 1179x2556; 766489137)",
  iphoneStoreApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 VibeApp/1 (ios)",
  // "Request Desktop Website" on an iPhone: Safari says it is a Mac.
  iphoneDesktopSite:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0",
  androidStoreApp:
    "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP4A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 VibeApp/1 (android)",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  // An iPad's own Safari: it says it is a Mac.
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  ipadMobileSite:
    "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
  // What Chrome on Android sends with "Desktop site" ticked.
  androidDesktopSite:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

/** A request's headers, as `await headers()` hands them over (names in any case). */
function request(values: Record<string, string>): { get(name: string): string | null } {
  const h = new Headers(values);
  return { get: (name) => h.get(name) };
}

test("the hint: ?1 is a phone, ?0 is not, anything else is no answer", () => {
  assert.equal(readMobileHint("?1"), true);
  assert.equal(readMobileHint("?0"), false);
  assert.equal(readMobileHint(" ?1 "), true);
  assert.equal(readMobileHint(null), null);
  assert.equal(readMobileHint(undefined), null);
  assert.equal(readMobileHint(""), null);
  assert.equal(readMobileHint("1"), null);
  assert.equal(readMobileHint("true"), null);
});

test("user agent: every phone browser and both store apps read as a phone", () => {
  for (const key of [
    "iphoneSafari",
    "iphoneChrome",
    "iphoneInstagram",
    "iphoneStoreApp",
    "androidChrome",
    "androidFirefox",
    "androidStoreApp",
    "ipadMobileSite",
  ] as const) {
    assert.equal(isPhoneUserAgent(UA[key]), true, key);
  }
});

test("user agent: laptops, tablets and an iPad that says it is a Mac read as desktop", () => {
  for (const key of [
    "macSafari",
    "macChrome",
    "windowsEdge",
    "windowsFirefox",
    "androidTablet",
    "ipadAsMac",
    "iphoneDesktopSite",
    "androidDesktopSite",
  ] as const) {
    assert.equal(isPhoneUserAgent(UA[key]), false, key);
  }
});

test("user agent: none at all is desktop, the answer the server always gave", () => {
  assert.equal(isPhoneUserAgent(null), false);
  assert.equal(isPhoneUserAgent(undefined), false);
  assert.equal(isPhoneUserAgent(""), false);
});

test("the guess: the hint decides when the browser sends one", () => {
  // Chrome on a phone.
  assert.equal(guessPhone("?1", UA.androidChrome), true);
  // Chrome on a laptop.
  assert.equal(guessPhone("?0", UA.macChrome), false);
  // A phone set to "Desktop site": the hint says no and is believed.
  assert.equal(guessPhone("?0", UA.androidDesktopSite), false);
  // The two disagree (a laptop's device toolbar with only the user agent
  // changed, say): the hint wins either way.
  assert.equal(guessPhone("?0", UA.iphoneSafari), false);
  assert.equal(guessPhone("?1", UA.macChrome), true);
});

test("the guess: without a hint the user agent decides", () => {
  assert.equal(guessPhone(null, UA.iphoneSafari), true);
  assert.equal(guessPhone(undefined, UA.androidFirefox), true);
  assert.equal(guessPhone(null, UA.macSafari), false);
  assert.equal(guessPhone(null, UA.ipadAsMac), false);
  assert.equal(guessPhone("", UA.iphoneSafari), true);
  assert.equal(guessPhone(null, null), false);
});

test("a request: reads the two headers by name, whatever their case", () => {
  assert.equal(MOBILE_HINT_HEADER, "sec-ch-ua-mobile");
  assert.equal(isPhoneRequest(request({ "User-Agent": UA.iphoneSafari })), true);
  assert.equal(isPhoneRequest(request({ "user-agent": UA.macSafari })), false);
  assert.equal(
    isPhoneRequest(request({ "Sec-CH-UA-Mobile": "?1", "User-Agent": UA.androidChrome })),
    true,
  );
  assert.equal(
    isPhoneRequest(request({ "Sec-CH-UA-Mobile": "?0", "User-Agent": UA.windowsEdge })),
    false,
  );
  assert.equal(isPhoneRequest(request({})), false);
});
