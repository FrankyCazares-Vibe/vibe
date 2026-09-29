import type { MetadataRoute } from "next";

/**
 * Googlebot-Image must be able to fetch the favicon for it to show in
 * search results. A missing robots.txt 404s today; this allow-all file
 * makes that crawl explicit.
 *
 * Nothing internal is listed here on purpose: robots.txt is public, so a
 * Disallow line only advertises the path. Private pages are kept private by
 * not being served at all (the product journal left public/ in S68) or by
 * an auth check on the route, never by this file.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
      },
      {
        userAgent: "Googlebot-Image",
        allow: ["/", "/favicon.ico", "/icon.png", "/favicon-48.png"],
      },
    ],
  };
}
