import type { MetadataRoute } from "next";

/** The canonical host, the same one as `metadataBase` in layout.tsx. */
const SITE_ORIGIN = "https://www.connectvibe.app";

/**
 * The nine pages meant to be found in search: the front page, the waitlist,
 * the legal pages, Support and Vibe+. Served at /sitemap.xml, and robots.ts
 * points at it.
 *
 * A fixed list, on purpose. No student profiles, no clubs and no posts, ever:
 * this file is public, and built from the database it would be a ready-made
 * list of every student's handle for anyone to download. Search engines may
 * still find a profile or a club by following a link (the Privacy Policy
 * says so); they just don't get handed the whole list here.
 *
 * Also out: /auth/*, /waitlist/confirm, /html/* and everything behind
 * sign-in. Nothing is read from the request or the database, so Next builds
 * this once and serves it from cache.
 */
const PUBLIC_PATHS = [
  "/",
  "/waitlist",
  "/legal/privacy",
  "/legal/terms",
  "/legal/community",
  "/legal/child-safety",
  "/legal/delete-account",
  "/support",
  "/plus",
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({ url: `${SITE_ORIGIN}${path}` }));
}
