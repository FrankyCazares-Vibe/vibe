/**
 * The server's first guess at which screen a visitor needs: the phone one or
 * the desktop one.
 *
 * Why guess at all. The screen is really chosen by the window's width
 * (`use-is-mobile.ts`: under 900px is the phone screen), and the server can't
 * see a window. It used to build the desktop screen for everybody, so every
 * phone downloaded and ran the desktop page, then swapped to its own. With a
 * guess the server builds the screen the device most likely needs, and the
 * browser fetches only that one (the `*Switch.tsx` files). The width still
 * has the last word once the page is running: a wrong guess costs one swap,
 * which is what every phone paid before.
 *
 * Two signals, in this order:
 *  1. `Sec-CH-UA-Mobile`. Chrome, Edge and the Android web view send it with
 *     every request: `?1` on a phone, `?0` on a laptop, on a tablet, and on a
 *     phone set to "Desktop site". When it is there, it decides.
 *  2. The user agent, for the browsers that send no such hint (Safari,
 *     Firefox, the iPhone app's web view). Every phone browser puts the word
 *     "Mobi" in it.
 *
 * An iPad says it is a Mac and sends no hint, so it reads as desktop, as it
 * always has. Held upright it is under 900px wide, so it swaps to the phone
 * screen after load, also as before. (An iPad that asks for the mobile site
 * says "iPad ... Mobile" and reads as a phone.)
 *
 * Nothing here is stored or logged: the two headers are read for this one
 * answer and dropped.
 *
 * Pure: no React, no `server-only`, no `@/` imports, so `node --test` loads
 * it directly (device-hint.test.ts). Only erasable TypeScript.
 */

/** Where the two headers are read from. A request's `Headers` fits as it is. */
export type HeaderSource = { get(name: string): string | null };

/** The browser's own yes/no, where it sends one. */
export const MOBILE_HINT_HEADER = "sec-ch-ua-mobile";

/**
 * "Mobi" covers iPhone Safari ("Mobile/15E148"), Chrome and Firefox on
 * Android ("Mobile Safari", "Mobile; rv:") and both store-app web views. An
 * Android tablet leaves the word out, which is how a tablet is told from a
 * phone there. iPhone and iPod are named as well, for an in-app browser that
 * drops it.
 */
const PHONE_UA = /Mobi|iPhone|iPod/i;

/**
 * `Sec-CH-UA-Mobile` as an answer: true for `?1`, false for `?0`, null when
 * the header is missing or says anything else (then the user agent decides).
 */
export function readMobileHint(value: string | null | undefined): boolean | null {
  const v = (value ?? "").trim();
  if (v.startsWith("?1")) return true;
  if (v.startsWith("?0")) return false;
  return null;
}

/** Does this user agent belong to a phone browser? No user agent: no. */
export function isPhoneUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && PHONE_UA.test(userAgent);
}

/**
 * The guess from the two raw header values. The hint wins when it is there:
 * a phone set to "Desktop site" sends `?0` and gets the desktop screen it
 * asked for.
 */
export function guessPhone(
  mobileHint: string | null | undefined,
  userAgent: string | null | undefined,
): boolean {
  return readMobileHint(mobileHint) ?? isPhoneUserAgent(userAgent);
}

/**
 * The guess for one request. Call it from a page with `await headers()`:
 * every page already renders per request (the root layout reads the headers
 * for the browser rule's nonce), so this costs nothing new.
 */
export function isPhoneRequest(headers: HeaderSource): boolean {
  return guessPhone(headers.get(MOBILE_HINT_HEADER), headers.get("user-agent"));
}
