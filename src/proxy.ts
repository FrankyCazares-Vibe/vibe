import type { User } from "@supabase/supabase-js";
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
 *  2. Holds a suspended or banned student at /account/suspended: every page
 *     goes there, every write is refused, and the handful of things they keep
 *     (sign out, delete the account, stop Vibe+, block and mute) still work.
 *  3. Guards the static pages under public/html/**. Since S55 there is no
 *     anonymous demo: two of them are the signed-in DESKTOP app when loaded
 *     with `?app=1` (profile.html, messages.html), onboarding.html is served
 *     through /onboarding/classic, and the only static page a logged-out
 *     visitor may load is the public profile viewer,
 *     `/html/profile.html?app=1&handle=<h>`, which /profile/<h> hops to on
 *     desktop. Share links hand out /profile/<h> itself; an old link to
 *     `/html/profile.html?handle=<h>` (no `app=1`) or `?user=<h>` is sent
 *     there, so it gets the person's real preview card and the phone view.
 *  4. Two clean-URL conveniences: `/profile` bounces anonymous visitors to
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

/** The one page a restricted student sees, and the only page they land on. */
const SUSPENDED_PAGE = "/account/suspended";

/** What the admin API mirrors into auth `app_metadata` when it restricts an account. */
type RestrictionMirror = { kind?: unknown; ends_at?: unknown };

/**
 * Is the restriction on this session still in force?
 *
 * `updateSession` has already asked GoTrue for the user, so `app_metadata`
 * comes back FRESH on every request: a restriction applied — or lifted — a
 * second ago is seen on the very next one, with no read of our own. We compare
 * `ends_at` to now here, so a suspension that has run out frees the student
 * without an admin touching anything.
 *
 * Anything we can't read counts as still in force. A ban is permanent and
 * carries `ends_at: null` by design; a suspension with a missing or unreadable
 * end date is a bug in the mirror, not permission to carry on.
 */
function restrictionInForce(user: User | null): boolean {
  const restriction = user?.app_metadata?.restriction as
    | RestrictionMirror
    | null
    | undefined;
  if (!restriction || typeof restriction !== "object") return false;
  const endsAt = restriction.ends_at;
  if (typeof endsAt !== "string" || !endsAt.trim()) return true;
  const at = Date.parse(endsAt);
  if (Number.isNaN(at)) return true;
  return at > Date.now();
}

/**
 * Extensions that mean "an asset, not a page". The matcher at the bottom only
 * skips image extensions, so `/html/_postViewer.js`, `/manifest.json` and any
 * service worker we add later arrive here too — and answering a script request
 * with a redirect to an HTML page breaks the page that asked for it.
 *
 * `.html` is deliberately NOT on the list: the static shells under /html ARE
 * the desktop app, so a restricted student meets the same gate there as on any
 * other page.
 */
const ASSET_EXTENSIONS = new Set([
  "js", "mjs", "css", "map", "json", "webmanifest",
  "txt", "xml", "ico", "avif", "mp4", "webm",
  "woff", "woff2", "ttf", "otf",
]);

/**
 * A file, not a page.
 *
 * Spelled out as a list rather than "the last segment has a dot in it",
 * because that shorter rule was an allow-list keyed on punctuation: any route
 * segment that could ever carry a dot — an email-shaped segment, a versioned
 * slug, a file-name-ish share id — would have skipped the restriction gate and
 * handed a suspended student the page. Nothing reachable spells one that way
 * today (handles are /^[a-z0-9_]{3,20}$/, org slugs /^[A-Za-z0-9_-]+$/), and
 * this keeps it that way without anyone having to remember.
 */
function isFileRequest(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  if (dot < 1) return false;
  return ASSET_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
}

/**
 * The only two /auth pages a restricted student still needs.
 *
 * `/auth/*` used to be allowed wholesale, and that produced the worst screen in
 * the app. A banned student who never verified a school email is sent to
 * /auth/school-email after sign-in (src/lib/auth/post-login.ts), reads a form
 * asking her to finish setting up an account that no longer exists for her,
 * submits it, and gets nothing on screen — the route answers a bare
 * `account_restricted` 403 that page has no branch for. She never reaches the
 * notice that would tell her what happened or how to appeal.
 *
 * These two stay because they are where an email link becomes a session
 * (sign-in link, address confirmation, password recovery): they have to run
 * before anyone can say who is asking. Sign-out needs nothing here — the whole
 * gate only fires for a live session, so once `POST /api/auth/logout` has
 * cleared it, /auth/login loads like it does for anyone signed out.
 *
 * Nothing else is on the list. School-email verification, the terms
 * interstitial, sign-up and a password change are all things a restricted
 * account cannot use, so they go to the notice with every other page — an
 * answer instead of a form that silently refuses.
 */
const RESTRICTED_AUTH_PAGES = new Set(["/auth/callback", "/auth/confirm"]);

/** Pages a restricted student may still read: the notice, the legal pages, those two. */
function restrictedPageAllowed(pathname: string): boolean {
  // Next folds `/auth/callback/` into `/auth/callback`, but only AFTER the
  // proxy has run, so trim the trailing slash ONCE, here, and match everything
  // against the trimmed spelling. Trimming for the auth set alone is how
  // `/account/suspended/` — a typed URL, an old bookmark, browser autocomplete
  // — earned itself a pointless 307 back to the one page it was already on,
  // and how the next path added to this list would inherit whichever half of
  // the rule its author happened to read.
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === SUSPENDED_PAGE) return true;
  if (path === "/legal" || path.startsWith("/legal/")) return true;
  return RESTRICTED_AUTH_PAGES.has(path);
}

/**
 * The few writes a restricted student keeps: leaving (sign out, delete the
 * account), stopping the money (the Vibe+ portal), and protecting themselves
 * (block, mute — being restricted doesn't mean someone else gets to harass
 * you). Everything else that writes is refused.
 *
 * The portal line is a door with no handle on it in wave 1, and saying so here
 * is the point: /plus and /settings both come here like every other page, and
 * /account/suspended renders Sign out and Delete account only, so nothing on
 * screen ever POSTs it. A suspension leaves Vibe+ billing alone (decision 7
 * stops it for a ban), so until the notice grows a Manage-subscription button
 * the page tells a paused student to write to support instead. The exemption
 * stays because it is the right answer the moment that button exists, and
 * because a student who can't cancel is the one complaint we can't answer.
 */
function restrictedApiAllowed(pathname: string, method: string): boolean {
  if (pathname === "/api/auth/logout") return true;
  if (pathname === "/api/me" && method === "DELETE") return true;
  if (pathname === "/api/billing/portal") return true;
  return pathname === "/api/me/block" || pathname === "/api/me/mute";
}

/**
 * The 403 every write route speaks when a restriction is in force. Written out
 * here rather than imported: `accountRestrictedResponse` in
 * src/lib/moderation/access.ts is server-only and pulls in the service client,
 * which the proxy runtime must not load. The two bodies have to stay identical
 * — every client branches on `code`.
 */
function restrictedResponse(session: NextResponse) {
  return forwardCookies(
    session,
    NextResponse.json(
      { ok: false, error: "Your account is restricted", code: "account_restricted" },
      { status: 403 },
    ),
  );
}

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

  // A suspended or banned student gets one page and almost nothing else. It
  // sits above everything below on purpose: it covers the static `?app=1`
  // shells and the phone UI in one place, so no screen has to repeat it.
  // Reading is still reading — what a restriction stops is writing — so GET,
  // HEAD and OPTIONS go through. Next answers HEAD for any GET route handler,
  // and a preflight has to reach the few routes a restricted student keeps.
  //
  // This is the fast path, not the wall. `updateSession` drops the GoTrue
  // error (src/lib/supabase/middleware.ts), so a blip over there hands us
  // `user: null` and this check quietly doesn't fire. What can't be skipped is
  // the pair underneath it: the route helpers (requireNotRestricted /
  // requireCanPublish) and the RLS policies, which read the restriction
  // themselves on every write.
  if (restrictionInForce(user)) {
    const method = request.method;
    const reading = method === "GET" || method === "HEAD" || method === "OPTIONS";
    if (pathname.startsWith("/api/")) {
      if (!reading && !restrictedApiAllowed(pathname, method)) {
        return restrictedResponse(sessionResponse);
      }
    } else if (!isFileRequest(pathname) && !restrictedPageAllowed(pathname)) {
      return redirectTo(request, sessionResponse, SUSPENDED_PAGE);
    }
  }

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
      const handle = (searchParams.get("handle") || "").trim();
      if (handle) {
        // Public viewer mode, reached from /profile/<h>: anyone may load
        // it, signed in or not.
        if (fromApp) return sessionResponse;
        // An old share link or bookmark: the clean address unfurls with the
        // person's preview card and picks the phone or desktop view. It hops
        // back here WITH `?app=1`, so this never loops. The settings the
        // static page acts on ride along (forwardedProfileParams) — dropped,
        // `embedded=1` gave an old host frame its sidebar back mid-session.
        const carried: Record<string, string> = {};
        const post = (searchParams.get("post") || "").trim();
        if (post && post.length <= 128) carried.post = post;
        if (searchParams.get("welcome") === "1") carried.welcome = "1";
        if (searchParams.get("embedded") === "1") carried.embedded = "1";
        return redirectTo(
          request,
          sessionResponse,
          `/profile/${encodeURIComponent(handle.toLowerCase())}`,
          carried,
        );
      }
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
