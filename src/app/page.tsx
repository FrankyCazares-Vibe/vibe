import { redirect } from "next/navigation";

import { HomeLanding } from "@/components/landing/home-landing";
import { appShellFromRequest } from "@/lib/native/server";

export const dynamic = "force-dynamic";

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
export default async function Home() {
  if (await appShellFromRequest()) redirect("/campus");
  return <HomeLanding />;
}
