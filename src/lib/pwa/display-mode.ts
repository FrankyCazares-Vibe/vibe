/**
 * Is Vibe running as the installed app, and on what kind of browser?
 *
 * Contract: handoffs/wave-plan-pwa/plan.md §2 (1E), rulings R16–R17, and
 * critic-w1.md item 11. `src/lib/pwa/use-standalone.ts` feeds these from
 * `window` for React; wave 3 builds on the same two functions.
 *
 * No React, no `server-only` and no runtime `@/` imports, so `node --test`
 * loads this file directly (display-mode.test.ts). Only erasable TypeScript
 * here: no enum, no namespace, no parameter properties, or type stripping
 * refuses the file.
 */

/** The three signals a page can read about how it was opened. */
export type DisplayModeEnv = {
  /**
   * `navigator.standalone`. A boolean only in iPhone / iPad WebKit; every
   * other browser leaves it undefined, so it arrives untyped.
   */
  navigatorStandalone?: unknown;
  /** `matchMedia("(display-mode: standalone)").matches` */
  matchStandalone: boolean;
  /** `matchMedia("(display-mode: fullscreen)").matches` */
  matchFullscreen: boolean;
};

/**
 * True when the page is the installed app (a Home Screen or desktop app
 * window), not a browser tab.
 *
 * iOS reports an installed `display: standalone` app as `fullscreen`, not
 * `standalone` (WebKit bug 264218), so fullscreen has to count. But Chrome
 * also matches `fullscreen` for F11 and for a video played full screen, and
 * Vibe has video posts. So fullscreen only counts where `navigator.standalone`
 * is a boolean, which is iPhone / iPad WebKit and nowhere else.
 */
export function isStandalone(env: DisplayModeEnv): boolean {
  if (env.navigatorStandalone === true) return true;
  if (env.matchStandalone === true) return true;
  return env.matchFullscreen === true && typeof env.navigatorStandalone === "boolean";
}

/**
 * Where the student is, as far as install and sign-in behave differently.
 * A union of strings, not an enum (type stripping can't run an enum).
 */
export type Platform =
  | "ios-safari"
  | "ios-other-browser"
  | "ios-in-app"
  | "android-chrome"
  | "android-samsung"
  | "android-other"
  | "desktop-chromium"
  | "desktop-safari"
  | "firefox"
  | "other";

/** What `detectPlatform` reads: `navigator.userAgent` and `navigator.maxTouchPoints`. */
export type PlatformEnv = {
  ua?: unknown;
  maxTouchPoints?: unknown;
};

/**
 * Apps that open links in their own web view: no Add to Home Screen, and on
 * an iPhone a sign-in there is not the Safari one. UNVERIFIED: these are the
 * markers each app is widely reported to add to its user agent; none of the
 * apps documents them, so they can change without notice.
 *   Instagram                            Instagram
 *   FBAN / FBAV                          Facebook, Messenger
 *   musical_ly / BytedanceWebview / TikTok   TikTok
 *   Snapchat                             Snapchat
 *   LinkedInApp                          LinkedIn
 */
const IN_APP = /Instagram|FBAN|FBAV|musical_ly|BytedanceWebview|TikTok|Snapchat|LinkedInApp/;

/** Chrome, Firefox and Edge on iOS. All three are WebKit underneath. */
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS/;

/**
 * Android's plain WebView marks itself `; wv)` (Chrome's user-agent docs).
 * An app showing a page that way can't install it, whatever else it says.
 */
const ANDROID_WEBVIEW = /;\s*wv\)/;

/** Chromium browsers on Android that aren't Chrome: Edge and Opera. */
const ANDROID_NOT_CHROME = /EdgA\/|OPR\//;

function isIosUa(ua: string, touchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS Safari asks for desktop sites by default, so it sends a Mac user
  // agent. Macs have no touch screen, so touch points give the iPad away.
  return /Macintosh/.test(ua) && touchPoints > 1;
}

/**
 * Sort a user agent into a `Platform`. The order is the contract
 * (critic-w1.md item 11) and the test pins it:
 *   1. an in-app web view (on iOS → "ios-in-app"; on Android → "android-other")
 *   2. iOS, iPadOS-as-Mac included: Chrome / Firefox / Edge → "ios-other-browser",
 *      else "ios-safari". No "Safari" token is required: the installed app's
 *      user agent is reported to drop it.
 *   3. Android: Samsung Internet before Chrome, because its user agent
 *      contains "Chrome" too; a WebView, Edge or Opera → "android-other"
 *   4. desktop Chromium (Chrome, Chromium, Edge); Opera → "other"
 *   5. desktop Safari
 *   6. Firefox
 *   7. anything else → "other"
 */
export function detectPlatform(env: PlatformEnv): Platform {
  const ua = typeof env.ua === "string" ? env.ua : "";
  const touchPoints =
    typeof env.maxTouchPoints === "number" && Number.isFinite(env.maxTouchPoints)
      ? env.maxTouchPoints
      : 0;
  const ios = isIosUa(ua, touchPoints);
  const android = /Android/.test(ua);

  if (IN_APP.test(ua)) {
    if (ios) return "ios-in-app";
    return android ? "android-other" : "other";
  }
  if (ios) return IOS_OTHER_BROWSER.test(ua) ? "ios-other-browser" : "ios-safari";
  if (android) {
    if (/SamsungBrowser/.test(ua)) return "android-samsung";
    if (ANDROID_WEBVIEW.test(ua) || ANDROID_NOT_CHROME.test(ua)) return "android-other";
    return /Chrome\//.test(ua) ? "android-chrome" : "android-other";
  }
  if (/Chrome|Chromium|Edg/.test(ua)) {
    return /OPR\//.test(ua) ? "other" : "desktop-chromium";
  }
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return "desktop-safari";
  if (/Firefox\//.test(ua)) return "firefox";
  return "other";
}

/**
 * True for the iPhone / iPad platforms. Only there does the installed app
 * keep its own sign-in, apart from Safari's, so only there do email links
 * and new windows land somewhere signed out (critic-w1.md item 10).
 */
export function isIosPlatform(platform: Platform | null | undefined): boolean {
  return (
    platform === "ios-safari" || platform === "ios-other-browser" || platform === "ios-in-app"
  );
}
