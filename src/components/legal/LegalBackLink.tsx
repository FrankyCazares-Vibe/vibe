"use client";

import Link from "next/link";

import { useIsStandalone } from "@/lib/pwa/use-standalone";

/**
 * "← Back to Vibe" at the top of every legal page. Its own client file so
 * `LegalLayout` stays a server component (critic-w1.md item 9).
 *
 * In a browser tab it goes to "/", as it always has. In the installed app
 * it goes to /campus instead (R16): "/" is the logged-out landing page, and
 * the app has no address bar or browser back button to leave it by.
 * Server render and hydration say "/", then the real target.
 */
export function LegalBackLink() {
  const standalone = useIsStandalone();
  return (
    <Link
      href={standalone ? "/campus" : "/"}
      style={{
        fontFamily: "DM Sans, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: "#5C5853",
        textDecoration: "none",
      }}
    >
      ← Back to Vibe
    </Link>
  );
}
