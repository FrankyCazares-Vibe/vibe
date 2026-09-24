/**
 * Tests for `display-mode.ts`: "is this the installed app?" and "which
 * browser is this?" (handoffs/wave-plan-pwa/plan.md §2 1E, R16–R17;
 * critic-w1.md items 10 and 11, which pin the rule and the order).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/pwa/display-mode.test.ts
 *
 * WHY THE RESOLVE HOOK: display-mode.ts imports "../native/detect" with no
 * extension (the store-app check, plan.md §6 S2A). tsc and Next resolve
 * that; Node's type stripping doesn't, and fails with ERR_MODULE_NOT_FOUND.
 * The hook retries a failed relative specifier with ".ts", the pattern in
 * `src/lib/iu/campus-request.test.ts` (critic-s2s3.md item 1). The module
 * loads through a dynamic `import()` so the hook is registered first.
 *
 * The user agents below are the shapes each browser sends (version numbers
 * are only filler). The in-app ones are as widely reported, not documented;
 * display-mode.ts marks those markers UNVERIFIED for the same reason.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("display-mode.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const { detectPlatform, isIosPlatform, isStandalone } = await import("./display-mode");

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const MAC_WEBKIT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
const ANDROID = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko)";

const UA = {
  iphoneSafari: `${IOS} Version/26.0 Mobile/15E148 Safari/604.1`,
  // An installed iOS app sends no Version/ and no Safari/ token.
  iphoneInstalled: `${IOS} Mobile/15E148`,
  ipadAsMac: `${MAC_WEBKIT} Version/26.0 Safari/605.1.15`,
  iphoneChrome: `${IOS} CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1`,
  iphoneFirefox: `${IOS} FxiOS/143.0 Mobile/15E148 Safari/605.1.15`,
  iphoneEdge: `${IOS} Version/18.0 EdgiOS/140.0.3485.94 Mobile/15E148 Safari/605.1.15`,
  iphoneInstagram: `${IOS} Mobile/15E148 Instagram 400.0.0.25.94 (iPhone15,2; iOS 18_6; en_US; en; scale=3.00; 1179x2556)`,
  iphoneFacebook: `${IOS} Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.6]`,
  iphoneTikTok: `${IOS} Mobile/15E148 musical_ly_41.0.0 JsSdk/2.0 NetType/WIFI Channel/App Store ByteLocale/en Region/US`,
  iphoneTikTokWebview: `${IOS} Mobile/15E148 BytedanceWebview/d8a21c6`,
  iphoneSnapchat: `${IOS} Mobile/15E148 Snapchat/13.50.0.40 (like Safari/8621.1.15, panda)`,
  iphoneLinkedIn: `${IOS} Mobile/15E148 [LinkedInApp]/9.30.1234`,
  androidChrome: `${ANDROID} Chrome/140.0.0.0 Mobile Safari/537.36`,
  androidSamsung: `${ANDROID} SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36`,
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 Instagram 400.0.0.25.94 Android",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36",
  androidEdge: `${ANDROID} Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0.0.0`,
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  windowsOpera:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0",
  macSafari: `${MAC_WEBKIT} Version/26.0 Safari/605.1.15`,
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:143.0) Gecko/20100101 Firefox/143.0",
  // Vibe's store apps: the web view's own user agent plus the token the
  // shell appends (mobile/capacitor.config.ts). Capacitor 8.5 puts the space
  // before it on both platforms (critic-s2s3.md item 13), but the detector
  // doesn't rely on that, so the spelling without it is pinned too.
  iphoneApp: `${IOS} Mobile/15E148 VibeApp/1 (ios)`,
  iphoneAppNoSpace: `${IOS} Mobile/15E148VibeApp/1 (ios)`,
  androidApp:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 VibeApp/1 (android)",
};

/** A phone has 5 touch points; a Mac has 0. */
const PHONE = 5;
const MAC = 0;

// ── isStandalone: each of the three signals ─────────────────────────────

test("a browser tab with no signals is not standalone", () => {
  assert.equal(
    isStandalone({ navigatorStandalone: undefined, matchStandalone: false, matchFullscreen: false }),
    false,
  );
  // iPhone Safari in a tab: navigator.standalone is false, nothing matches.
  assert.equal(
    isStandalone({ navigatorStandalone: false, matchStandalone: false, matchFullscreen: false }),
    false,
  );
});

test("navigator.standalone true alone means standalone (older iOS)", () => {
  assert.equal(
    isStandalone({ navigatorStandalone: true, matchStandalone: false, matchFullscreen: false }),
    true,
  );
});

test("display-mode: standalone alone means standalone (Android, desktop app windows)", () => {
  assert.equal(
    isStandalone({ navigatorStandalone: undefined, matchStandalone: true, matchFullscreen: false }),
    true,
  );
});

test("display-mode: fullscreen counts on iOS WebKit (bug 264218)", () => {
  // Today's installed iPhone app: fullscreen matches, standalone doesn't.
  assert.equal(
    isStandalone({ navigatorStandalone: true, matchStandalone: false, matchFullscreen: true }),
    true,
  );
  // navigator.standalone is a boolean, so this is iOS WebKit: fullscreen alone counts.
  assert.equal(
    isStandalone({ navigatorStandalone: false, matchStandalone: false, matchFullscreen: true }),
    true,
  );
});

test("display-mode: fullscreen alone does not count off iOS (F11, a full-screen video)", () => {
  assert.equal(
    isStandalone({ navigatorStandalone: undefined, matchStandalone: false, matchFullscreen: true }),
    false,
  );
});

test("only a real true in navigator.standalone counts", () => {
  for (const value of ["true", 1, "yes", null, {}]) {
    assert.equal(
      isStandalone({ navigatorStandalone: value, matchStandalone: false, matchFullscreen: false }),
      false,
      `navigator.standalone ${JSON.stringify(value)}`,
    );
  }
  // And a non-boolean doesn't unlock fullscreen either.
  assert.equal(
    isStandalone({ navigatorStandalone: "true", matchStandalone: false, matchFullscreen: true }),
    false,
  );
});

// ── detectPlatform ──────────────────────────────────────────────────────

test("Vibe's iPhone app is ios-app, with or without the space", () => {
  assert.equal(detectPlatform({ ua: UA.iphoneApp, maxTouchPoints: PHONE }), "ios-app");
  assert.equal(detectPlatform({ ua: UA.iphoneAppNoSpace, maxTouchPoints: PHONE }), "ios-app");
  // The server has no touch count (src/app/get/route.ts passes 0).
  assert.equal(detectPlatform({ ua: UA.iphoneApp, maxTouchPoints: MAC }), "ios-app");
  assert.equal(detectPlatform({ ua: UA.iphoneApp }), "ios-app");
});

test("Vibe's Android app is android-app, though its web view says '; wv)'", () => {
  assert.equal(detectPlatform({ ua: UA.androidApp, maxTouchPoints: PHONE }), "android-app");
  assert.equal(detectPlatform({ ua: UA.androidApp, maxTouchPoints: MAC }), "android-app");
});

test("the store-app check runs first, before every other rule", () => {
  // Before the in-app markers, which were rule 1 in critic-w1.md item 11.
  assert.equal(
    detectPlatform({ ua: `${UA.iphoneInstagram} VibeApp/1 (ios)`, maxTouchPoints: PHONE }),
    "ios-app",
  );
  assert.equal(
    detectPlatform({ ua: `${UA.androidInstagram} VibeApp/1 (android)`, maxTouchPoints: PHONE }),
    "android-app",
  );
  // Before iOS, iPadOS-as-Mac included, and before the other iOS browsers.
  assert.equal(detectPlatform({ ua: `${UA.ipadAsMac} VibeApp/1 (ios)`, maxTouchPoints: PHONE }), "ios-app");
  assert.equal(detectPlatform({ ua: `${UA.iphoneChrome} VibeApp/1 (ios)`, maxTouchPoints: PHONE }), "ios-app");
  // Before Samsung Internet and Chrome on Android.
  assert.equal(
    detectPlatform({ ua: `${UA.androidSamsung} VibeApp/1 (android)`, maxTouchPoints: PHONE }),
    "android-app",
  );
  // The token names the platform; the rest of the user agent doesn't get a say.
  assert.equal(detectPlatform({ ua: `${UA.androidChrome} VibeApp/1 (ios)`, maxTouchPoints: PHONE }), "ios-app");
});

test("the same web views without the app's token are not the app", () => {
  // A bare WKWebView sends no Safari token and sorts with installed Safari;
  // a bare Android WebView is android-other. Only the token makes it the app.
  assert.equal(detectPlatform({ ua: `${IOS} Mobile/15E148`, maxTouchPoints: PHONE }), "ios-safari");
  assert.equal(detectPlatform({ ua: UA.androidWebView, maxTouchPoints: PHONE }), "android-other");
  // Look-alikes: another platform, a non-numeric version, a lowercase name.
  assert.equal(detectPlatform({ ua: `${IOS} Mobile/15E148 VibeApp/1 (windows)`, maxTouchPoints: PHONE }), "ios-safari");
  assert.equal(detectPlatform({ ua: `${IOS} Mobile/15E148 VibeApp/x (ios)`, maxTouchPoints: PHONE }), "ios-safari");
  assert.equal(detectPlatform({ ua: `${UA.androidChrome} vibeapp/1 (android)`, maxTouchPoints: PHONE }), "android-chrome");
});

test("iPhone Safari, in a tab and installed, is ios-safari", () => {
  assert.equal(detectPlatform({ ua: UA.iphoneSafari, maxTouchPoints: PHONE }), "ios-safari");
  assert.equal(detectPlatform({ ua: UA.iphoneInstalled, maxTouchPoints: PHONE }), "ios-safari");
});

test("an iPad sending a Mac user agent is iOS when it has touch", () => {
  assert.equal(detectPlatform({ ua: UA.ipadAsMac, maxTouchPoints: PHONE }), "ios-safari");
  // One touch point isn't enough: the rule is more than one.
  assert.equal(detectPlatform({ ua: UA.ipadAsMac, maxTouchPoints: 1 }), "desktop-safari");
});

test("Chrome, Firefox and Edge on iOS are ios-other-browser", () => {
  assert.equal(detectPlatform({ ua: UA.iphoneChrome, maxTouchPoints: PHONE }), "ios-other-browser");
  assert.equal(detectPlatform({ ua: UA.iphoneFirefox, maxTouchPoints: PHONE }), "ios-other-browser");
  assert.equal(detectPlatform({ ua: UA.iphoneEdge, maxTouchPoints: PHONE }), "ios-other-browser");
});

test("Instagram, Facebook, TikTok, Snapchat and LinkedIn on iOS are ios-in-app", () => {
  for (const ua of [
    UA.iphoneInstagram,
    UA.iphoneFacebook,
    UA.iphoneTikTok,
    UA.iphoneTikTokWebview,
    UA.iphoneSnapchat,
    UA.iphoneLinkedIn,
  ]) {
    assert.equal(detectPlatform({ ua, maxTouchPoints: PHONE }), "ios-in-app", ua);
  }
});

test("in-app markers win over everything else in the user agent but Vibe's app token", () => {
  // Snapchat says "Safari"; an in-app Chrome on iOS would say "CriOS".
  assert.equal(
    detectPlatform({ ua: `${UA.iphoneChrome} Instagram 400.0`, maxTouchPoints: PHONE }),
    "ios-in-app",
  );
  // An in-app view on an iPad sending a Mac user agent is still iOS.
  assert.equal(
    detectPlatform({ ua: `${UA.ipadAsMac} Instagram 400.0`, maxTouchPoints: PHONE }),
    "ios-in-app",
  );
  // Android's in-app views can't install either: android-other, not Chrome.
  assert.equal(detectPlatform({ ua: UA.androidInstagram, maxTouchPoints: PHONE }), "android-other");
  // Off iOS and Android there's no in-app bucket.
  assert.equal(detectPlatform({ ua: `${UA.windowsChrome} Instagram`, maxTouchPoints: MAC }), "other");
});

test("Android Chrome is android-chrome", () => {
  assert.equal(detectPlatform({ ua: UA.androidChrome, maxTouchPoints: PHONE }), "android-chrome");
});

test("Samsung Internet is android-samsung, though its user agent says Chrome", () => {
  assert.equal(detectPlatform({ ua: UA.androidSamsung, maxTouchPoints: PHONE }), "android-samsung");
});

test("other Android browsers and web views are android-other", () => {
  assert.equal(detectPlatform({ ua: UA.androidWebView, maxTouchPoints: PHONE }), "android-other");
  assert.equal(detectPlatform({ ua: UA.androidEdge, maxTouchPoints: PHONE }), "android-other");
  assert.equal(detectPlatform({ ua: UA.androidFirefox, maxTouchPoints: PHONE }), "android-other");
});

test("desktop Chrome and Edge are desktop-chromium, touch screen or not", () => {
  assert.equal(detectPlatform({ ua: UA.macChrome, maxTouchPoints: MAC }), "desktop-chromium");
  assert.equal(detectPlatform({ ua: UA.windowsChrome, maxTouchPoints: MAC }), "desktop-chromium");
  assert.equal(detectPlatform({ ua: UA.windowsEdge, maxTouchPoints: MAC }), "desktop-chromium");
  // A Windows touch laptop: touch points only matter with a Mac user agent.
  assert.equal(detectPlatform({ ua: UA.windowsChrome, maxTouchPoints: 10 }), "desktop-chromium");
});

test("desktop Opera is other", () => {
  assert.equal(detectPlatform({ ua: UA.windowsOpera, maxTouchPoints: MAC }), "other");
});

test("Safari on a Mac is desktop-safari", () => {
  assert.equal(detectPlatform({ ua: UA.macSafari, maxTouchPoints: MAC }), "desktop-safari");
});

test("desktop Firefox is firefox, on Windows and on a Mac", () => {
  assert.equal(detectPlatform({ ua: UA.windowsFirefox, maxTouchPoints: MAC }), "firefox");
  assert.equal(detectPlatform({ ua: UA.macFirefox, maxTouchPoints: MAC }), "firefox");
});

test("an empty, missing or odd user agent is other", () => {
  assert.equal(detectPlatform({ ua: "", maxTouchPoints: MAC }), "other");
  assert.equal(detectPlatform({}), "other");
  assert.equal(detectPlatform({ ua: 42, maxTouchPoints: "5" }), "other");
  assert.equal(detectPlatform({ ua: "curl/8.7.1" }), "other");
});

test("a touch count that isn't a finite number reads as none", () => {
  assert.equal(detectPlatform({ ua: UA.ipadAsMac, maxTouchPoints: "5" }), "desktop-safari");
  assert.equal(detectPlatform({ ua: UA.ipadAsMac, maxTouchPoints: Number.NaN }), "desktop-safari");
  assert.equal(detectPlatform({ ua: UA.ipadAsMac }), "desktop-safari");
});

// ── isIosPlatform ───────────────────────────────────────────────────────

test("isIosPlatform is true for the three iOS platforms only", () => {
  assert.equal(isIosPlatform("ios-safari"), true);
  assert.equal(isIosPlatform("ios-other-browser"), true);
  assert.equal(isIosPlatform("ios-in-app"), true);
  for (const p of [
    "android-chrome",
    "android-samsung",
    "android-other",
    "desktop-chromium",
    "desktop-safari",
    "firefox",
    "other",
  ] as const) {
    assert.equal(isIosPlatform(p), false, p);
  }
  // Before the hook has read the browser (server, first render).
  assert.equal(isIosPlatform(null), false);
  assert.equal(isIosPlatform(undefined), false);
});

test("isIosPlatform is false inside Vibe's own apps, the iPhone one included", () => {
  // The Safari / Home Screen copy (R16) must never show in the store app;
  // app-only rules ask useAppShell() instead (critic-s2s3.md items 9, 17).
  assert.equal(isIosPlatform("ios-app"), false);
  assert.equal(isIosPlatform("android-app"), false);
  // And the whole way through: a real app user agent never reads as iOS.
  assert.equal(isIosPlatform(detectPlatform({ ua: UA.iphoneApp, maxTouchPoints: PHONE })), false);
});
