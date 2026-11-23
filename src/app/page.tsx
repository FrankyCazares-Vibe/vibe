import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { preload } from "react-dom";

import { HomeLanding } from "@/components/landing/home-landing";
import { SystemLanding } from "@/components/landing/system/system-landing";
import { CookieNotice } from "@/components/legal/CookieNotice";
import { OpenBeacon } from "@/components/tally/OpenBeacon";
import { appShellFromRequest } from "@/lib/native/server";
import { WORDMARK_FONT_PATH } from "@/lib/theme/fonts";
import { isSignupOpen } from "@/lib/waitlist/signup-open";
import { parseSignupOverride } from "@/lib/waitlist/types";

export const dynamic = "force-dynamic";

const TITLE = "Vibe: the social app for your campus";
const DESCRIPTION =
  "Vibe is the social app for your campus, built around clubs. Find your clubs, your events, and each other. Free with your school email.";

// Search results and link previews for the landing. openGraph and twitter
// replace the layout's objects whole (metadata merges shallowly), so they
// repeat its fields; the picture still comes from src/app/opengraph-image.tsx.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Vibe", locale: "en_US", url: "/", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

// The landing is always Night, so the browser bars are too, in either app
// theme (syncThemeColorMeta in src/lib/theme/theme.ts keeps "/" dark after load).
export const viewport: Viewport = { themeColor: "#0C0B0B" };

/**
 * The landing page, for browsers only. Inside the store apps every "← back"
 * to `/` (login, signup, the legal pages) lands on /campus instead, which
 * sends a signed-out student on to log in. The landing sells the app and
 * carries store badges, Google Play's included, and App Review guideline
 * 2.3.10 doesn't allow another platform's store inside an iPhone app
 * (critic-s2s3.md item 7).
 *
 * `/` is never served from a cache today (next.config.ts: max-age=0,
 * must-revalidate). If it ever gets CDN caching, it needs
 * `Vary: User-Agent` first, or one visitor's redirect would be handed to
 * the next.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await appShellFromRequest()) redirect("/campus");
  // The launch switch decides the buttons: "Join the waitlist" while Vibe
  // opens in waves, "Sign up" once it is open (no deploy either way). The
  // dev-only `?signup=open|closed` previews either state locally.
  const raw = (await searchParams).signup;
  const override = parseSignupOverride(Array.isArray(raw) ? raw[0] : raw, process.env.NODE_ENV);
  // Nov 18, 2026: both logos here moved to the wordmark face, which is
  // font-display block. Asked for up front, as on the sign-in page, so the
  // top bar's letters don't land while still invisible. 1.4 KB, same origin.
  preload(WORDMARK_FONT_PATH, { as: "font", type: "font/woff2" });
  const signupOpen = await isSignupOpen(override);
  // Nov 23, 2026: "find your system" (system-landing.tsx) is the landing.
  // LANDING=classic in Vercel's env brings back the Oct-Nov landing (the
  // night sky with six lights) with no deploy of code: the rollback, kept
  // for a week or so. Read per request (the page is force-dynamic).
  const classic = process.env.LANDING === "classic";
  return (
    <>
      {classic ? <HomeLanding signupOpen={signupOpen} /> : <SystemLanding signupOpen={signupOpen} />}
      {/* Counts this open in Vibe's own day totals (a number, nothing about the visitor). */}
      <OpenBeacon page="home" />
      {/* The one-time cookie notice of the signed-out pages (a notice, nothing to accept). */}
      <CookieNotice tone="night" />
    </>
  );
}
