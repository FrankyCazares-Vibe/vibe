import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * /auth/login is a client page, so it can't export metadata itself; this
 * layout names it for the tab, search results and link previews. The
 * canonical address makes every `?next=` variant (the club page and the
 * signed-out post page link here with one) count as the one login page.
 */
export const metadata: Metadata = {
  title: "Log in · Vibe",
  description: "Log in to Vibe to see what's happening on your campus.",
  alternates: { canonical: "/auth/login" },
};

export default function AuthLoginLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
