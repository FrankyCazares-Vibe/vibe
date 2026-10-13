import type { Metadata } from "next";
import type { ReactNode } from "react";

import { CookieNotice } from "@/components/legal/CookieNotice";

/**
 * /auth/forgot-password is a client page, so it can't export metadata
 * itself; this layout names it for the tab, search results and link
 * previews. The address carries no token (that is /auth/update-password),
 * so it needs no referrer or noindex line.
 */
export const metadata: Metadata = {
  title: "Reset your password · Vibe",
  description: "Forgot your Vibe password? We'll email you a link to set a new one.",
};

export default function AuthForgotPasswordLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      {/* The one-time cookie notice of the signed-out pages (a notice, nothing to accept). */}
      <CookieNotice />
    </>
  );
}
