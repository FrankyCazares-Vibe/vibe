import { headers } from "next/headers";
import type { ReactNode } from "react";

import { isPhoneRequest } from "@/lib/device-hint";

import { ClubShell } from "./ClubShell";

/**
 * The app frame around the club's pages on a computer (Oct 21, 2026, Franky:
 * going to a club page felt like leaving the app). /orgs/<handle>, its setup
 * list and Club tools sit in CampusAppShell, the left menu and all, like
 * Campus, Network and Messages.
 *
 * Only when the server's device guess is a computer (device-hint.ts). A
 * phone gets the page with no frame around it at all, exactly as before, and
 * never downloads the frame (ClubShell.tsx); a computer window under 900px
 * gets the frame, which hides its menu and steps aside there (globals.css
 * `--page-tabbar`), so it reads the same. A wrong guess shows the standalone
 * page, which every width had until now.
 *
 * Every page here draws its own phone tab bar inside its <main>
 * (`pageTabBar`). The club page frames signed-in viewers only: the menu is
 * all signed-in places, and a visitor keeps the page's own "Sign in".
 */
export async function showsAppFrame(): Promise<boolean> {
  return !isPhoneRequest(await headers());
}

/** Where the left menu's Campus goes from a club's pages: back to Campus → Orgs. */
export const CLUB_CAMPUS_HREF = "/campus?tab=orgs";

export async function ClubAppFrame({
  children,
  sidebar,
  campusHref = CLUB_CAMPUS_HREF,
}: {
  children: ReactNode;
  sidebar?: ReactNode;
  /**
   * The left menu's Campus link. It does the old top bar's "Return to
   * Organizations" job: the club page passes its own, which keeps the campus
   * a visiting student was browsing.
   */
  campusHref?: string;
}) {
  if (!(await showsAppFrame())) return <>{children}</>;
  return (
    <ClubShell sidebar={sidebar} campusHref={campusHref}>
      {children}
    </ClubShell>
  );
}
