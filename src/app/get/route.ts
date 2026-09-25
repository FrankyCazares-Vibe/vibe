import { NextResponse, type NextRequest } from "next/server";

import { storeUrlFor } from "@/lib/native/store-links";
import { detectPlatform, isIosPlatform } from "@/lib/pwa/display-mode";

/**
 * GET /get — one stable link for QR codes, posters and emails ("get the
 * app"), answered by the device that opens it:
 *   - iPhone / iPad → the App Store listing, once NEXT_PUBLIC_APP_STORE_URL is set
 *   - Android      → the Google Play listing, once NEXT_PUBLIC_PLAY_STORE_URL is set
 *   - a phone whose store isn't set yet → /campus (the web app; it sends a
 *     signed-out visitor to log in)
 *   - anything else, computers included → / (the landing)
 *
 * The user agent is all a server can see. iPadOS Safari sends a Mac user agent
 * by default, and the touch-point count that tells it apart only exists in the
 * browser, so `maxTouchPoints: 0` makes every "Macintosh" a computer: that
 * iPad gets the landing. Accepted, because the app is iPhone-only
 * (critic-s1 item 14).
 *
 * The destination is never read from the query string, so /get can't be
 * turned into an open redirect. Which listing a phone gets, and the rule that
 * a store URL counts only when it starts with that store's own origin, live in
 * src/lib/native/store-links.ts (shared with the landing's store links and
 * Settings). NEXT_PUBLIC_* values are inlined at build time: changing one on
 * Vercel needs a redeploy (.env.example).
 *
 * `private, no-store` + `Vary: User-Agent`, so no cache between here and the
 * phone can hand one device's redirect to another. Route handlers aren't
 * cached by default, and reading the request headers keeps this one dynamic.
 */

export function GET(request: NextRequest) {
  const platform = detectPlatform({
    ua: request.headers.get("user-agent") ?? "",
    maxTouchPoints: 0,
  });

  let destination = "/";
  if (platform === "ios-app" || platform === "android-app") {
    // Already inside the store app: a /get link (a poster's QR code, a
    // shared "get the app" link) shouldn't send them out to a store listing.
    destination = "/campus";
  } else if (isIosPlatform(platform) || platform.startsWith("android-")) {
    // A phone's browser: its own store's listing (storeUrlFor), or the web
    // app while that listing isn't set yet.
    destination = storeUrlFor(platform) ?? "/campus";
  }

  const res = NextResponse.redirect(new URL(destination, request.url), 307);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Vary", "User-Agent");
  return res;
}
