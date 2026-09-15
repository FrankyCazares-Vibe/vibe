import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * /auth/update-password carries a one-time `?token_hash=` in its URL until
 * the new password is submitted. no-referrer keeps it out of the Referer
 * header sent to fonts, Supabase and anything else the page loads, and the
 * page is never indexed.
 */
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function AuthUpdatePasswordLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
