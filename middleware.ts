import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/** Static prototype only — no matching App Router page. */
const STATIC_ONLY_HTML: Record<string, string> = {
  "/opportunities": "/html/opportunities.html",
  "/otto": "/html/otto.html",
};

/** Demo shell: App routes exist for logged-in users; anonymous users get the HTML prototype. */
const ANON_REWRITE_HTML: Record<string, string> = {
  "/feed": "/html/feed.html",
  "/network": "/html/network.html",
  "/campus": "/html/campus.html",
  "/messages": "/html/messages.html",
};

const LEGACY_HTML_TO_CLEAN: Record<string, string> = {
  "/html/feed.html": "/feed",
  "/html/network.html": "/network",
  "/html/campus.html": "/campus",
  "/html/messages.html": "/messages",
  "/html/opportunities.html": "/opportunities",
  "/html/otto.html": "/otto",
};

function forwardCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((c) => {
    to.cookies.set(c.name, c.value, c);
  });
  return to;
}

export async function middleware(request: NextRequest) {
  const { response: sessionResponse, user } = await updateSession(request);
  const { pathname, searchParams } = request.nextUrl;

  // Legacy /html/profile.html → clean URL when we can resolve intent; else serve the static demo file.
  if (pathname === "/html/profile.html") {
    const slug = searchParams.get("user");
    if (slug) {
      const dest = new URL(
        `/profile/${encodeURIComponent(slug)}`,
        request.url,
      );
      const redir = NextResponse.redirect(dest);
      return forwardCookies(sessionResponse, redir);
    }
    // Signed-in full profile UI: `/profile` seeds localStorage then sends users here with `app=1`.
    const fromApp = searchParams.get("app") === "1";
    if (user && !fromApp) {
      const dest = new URL("/profile", request.url);
      const redir = NextResponse.redirect(dest);
      return forwardCookies(sessionResponse, redir);
    }
    return sessionResponse;
  }

  if (LEGACY_HTML_TO_CLEAN[pathname]) {
    const dest = new URL(LEGACY_HTML_TO_CLEAN[pathname], request.url);
    const redir = NextResponse.redirect(dest);
    return forwardCookies(sessionResponse, redir);
  }

  const staticTarget = STATIC_ONLY_HTML[pathname];
  if (staticTarget) {
    const url = request.nextUrl.clone();
    url.pathname = staticTarget;
    const rw = NextResponse.rewrite(url);
    return forwardCookies(sessionResponse, rw);
  }

  // "/profile" is the signed-in app route; never rewrite it to the Maya HTML prototype (breaks real users).
  if (pathname === "/profile" && !user) {
    const dest = new URL("/auth/login", request.url);
    const next =
      pathname +
      (searchParams.toString() ? `?${searchParams.toString()}` : "");
    dest.searchParams.set("next", next);
    const redir = NextResponse.redirect(dest);
    return forwardCookies(sessionResponse, redir);
  }

  const anonTarget = !user ? ANON_REWRITE_HTML[pathname] : undefined;
  if (anonTarget) {
    const url = request.nextUrl.clone();
    url.pathname = anonTarget;
    const rw = NextResponse.rewrite(url);
    return forwardCookies(sessionResponse, rw);
  }

  const profileSlugMatch = /^\/profile\/([^/]+)$/.exec(pathname);
  if (profileSlugMatch && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/html/profile.html";
    url.searchParams.set("user", decodeURIComponent(profileSlugMatch[1]));
    const rw = NextResponse.rewrite(url);
    return forwardCookies(sessionResponse, rw);
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
