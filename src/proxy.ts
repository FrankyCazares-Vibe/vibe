import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { isGlobalFeedSurfaceEnabled } from "@/lib/feature-flags";

/**
 * Request proxy — Next 16's name for middleware.
 *
 * Lives in `src/` on purpose. The dev server only watches
 * `src/{proxy,middleware}.*`, while `next build` also accepts the repo root,
 * so the old root-level `middleware.ts` ran in production and was silently
 * skipped by every local dev server (found in S55). Keep it here so dev and
 * prod agree.
 *
 * What it does:
 *  1. Refreshes the Supabase session cookie on every request (updateSession).
 *  2. Guards the static pages under public/html/**. Since S55 there is no
 *     anonymous demo: two of them are the signed-in DESKTOP app when loaded
 *     with `?app=1` (profile.html, messages.html), onboarding.html is served
 *     through /onboarding/classic, and the only static page a logged-out
 *     visitor may load is the public profile viewer,
 *     `/html/profile.html?handle=<h>`, which desktop share links land on.
 *  3. Two clean-URL conveniences: `/profile` bounces anonymous visitors to
 *     login, and `/feed` goes straight to /campus while the global feed flag
 *     is off.
 */

/** Clean route each static URL belongs to — the redirect target and the login `next`. */
const HTML_TO_CLEAN: Record<string, string> = {
  "/html/profile.html": "/profile",
  "/html/messages.html": "/messages",
  "/html/onboarding.html": "/onboarding",
  // Retired prototypes (deleted in S55). Old links still land somewhere sane.
  "/html/feed.html": "/feed",
  "/html/campus.html": "/campus",
  "/html/network.html": "/network",
  "/html/otto.html": "/otto",
  "/html/opportunities.html": "/campus",
  "/html/landing.html": "/",
};

/** Static pages that ARE the signed-in desktop app when loaded with `?app=1`. */
const APP_HTML = new Set(["/html/profile.html", "/html/messages.html"]);

function forwardCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value, c);
  });
  return to;
}

function redirectTo(
  request: NextRequest,
  session: NextResponse,
  path: string,
  query?: Record<string, string>,
) {
  const dest = new URL(path, request.url);
  for (const [k, v] of Object.entries(query ?? {})) dest.searchParams.set(k, v);
  return forwardCookies(session, NextResponse.redirect(dest));
}

function loginFor(request: NextRequest, session: NextResponse, next: string) {
  return redirectTo(request, session, "/auth/login", { next });
}

export async function proxy(request: NextRequest) {
  const { response: sessionResponse, user } = await updateSession(request);
  const { pathname, searchParams } = request.nextUrl;

  if (pathname.startsWith("/html/") && pathname.endsWith(".html")) {
    const clean = HTML_TO_CLEAN[pathname] ?? "/";
    const fromApp = searchParams.get("app") === "1";

    if (pathname === "/html/profile.html") {
      // Legacy `?user=<slug>` → the clean share URL, where generateMetadata
      // emits the real person's OG title.
      const slug = searchParams.get("user");
      if (slug) {
        return redirectTo(
          request,
          sessionResponse,
          `/profile/${encodeURIComponent(slug)}`,
        );
      }
      // Public viewer mode: anyone holding a share link, signed in or not.
      if ((searchParams.get("handle") || "").trim()) return sessionResponse;
    }

    // Everything else behind the static URLs is the signed-in app or a
    // retired prototype: logged-out visitors go to login and come back to
    // the clean route, never to a fabricated page.
    if (!user) return loginFor(request, sessionResponse, clean);
    if (fromApp && APP_HTML.has(pathname)) return sessionResponse;
    // Signed in but not in app mode (bookmark, typed URL, retired page): the
    // clean route owns the consent/campus/onboarding gates and re-enters
    // app mode itself. Bouncing `?app=1` here would loop — hence the check.
    return redirectTo(request, sessionResponse, clean);
  }

  // "/profile" is the signed-in app route; anonymous visitors log in first.
  if (pathname === "/profile" && !user) {
    const next =
      pathname +
      (searchParams.toString() ? `?${searchParams.toString()}` : "");
    return loginFor(request, sessionResponse, next);
  }

  // Signed-in users hitting `/feed` while the global feed flag is off get the
  // campus page directly — avoids a React mount + client redirect roundtrip.
  if (pathname === "/feed" && user && !isGlobalFeedSurfaceEnabled()) {
    return redirectTo(request, sessionResponse, "/campus");
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
