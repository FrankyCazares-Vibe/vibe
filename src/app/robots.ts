import type { MetadataRoute } from "next";

/**
 * Googlebot-Image must be able to fetch the favicon for it to show in
 * search results. A missing robots.txt 404s today; this allow-all file
 * makes that crawl explicit.
 *
 * `/journal/` is excluded: the product journal is a real internal document
 * (security model, past vulnerabilities, business plans) that happens to be
 * served from public/. Its only in-app link is on /the-map, which is
 * platform-admin only since S55. Excluding it keeps it out of search results
 * without breaking the link for anyone who has it. Whether it should be
 * behind auth at all is a founder decision — see the S55 handoff.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/journal/"],
      },
      {
        userAgent: "Googlebot-Image",
        allow: ["/", "/favicon.ico", "/icon.png", "/favicon-48.png"],
      },
    ],
  };
}
