import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * /auth/callback carries a one-time `?code=` or `#access_token` in its URL.
 * no-referrer keeps it out of the Referer header sent to fonts, Supabase and
 * anything else the page loads, and the page is never indexed.
 */
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function AuthCallbackLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
