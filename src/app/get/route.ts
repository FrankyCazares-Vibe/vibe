import { NextResponse, type NextRequest } from "next/server";

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
 * turned into an open redirect, and a store URL is used only when it starts
 * with the store's own origin (the landing's store links apply the same rule,
 * src/components/landing/home-landing.tsx). NEXT_PUBLIC_* values are inlined
 * at build time: changing one on Vercel needs a redeploy (.env.example).
 *
 * `private, no-store` + `Vary: User-Agent`, so no cache between here and the
 * phone can hand one device's redirect to another. Route handlers aren't
 * cached by default, and reading the request headers keeps this one dynamic.
 */

const APP_STORE_PREFIX = "https://apps.apple.com/";
const PLAY_STORE_PREFIX = "https://play.google.com/";

/** The listing URL if it's a real one for that store, else null. */
function storeListingUrl(raw: string | undefined, prefix: string): string | null {
  const value = (raw ?? "").trim();
  if (!value.startsWith(prefix) || value.length === prefix.length) return null;
  try {
    return new URL(value).href;
  } catch {
    return null;
  }
}

export function GET(request: NextRequest) {
  const platform = detectPlatform({
    ua: request.headers.get("user-agent") ?? "",
    maxTouchPoints: 0,
  });

  let destination = "/";
  if (isIosPlatform(platform)) {
    destination =
      storeListingUrl(process.env.NEXT_PUBLIC_APP_STORE_URL, APP_STORE_PREFIX) ?? "/campus";
  } else if (platform.startsWith("android-")) {
    destination =
      storeListingUrl(process.env.NEXT_PUBLIC_PLAY_STORE_URL, PLAY_STORE_PREFIX) ?? "/campus";
  }

  const res = NextResponse.redirect(new URL(destination, request.url), 307);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Vary", "User-Agent");
  return res;
}
