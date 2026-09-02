import type { MetadataRoute } from "next";

/**
 * Googlebot-Image must be able to fetch the favicon for it to show in
 * search results. A missing robots.txt 404s today; this allow-all file
 * makes that crawl explicit.
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
