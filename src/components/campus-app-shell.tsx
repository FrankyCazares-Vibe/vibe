"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import LeftNav from "@/components/LeftNav";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { OttoCorner } from "@/components/network/OttoCorner";

type Props = {
  children: ReactNode;
  /**
   * Optional right column (e.g. feed widgets). Omit for simple two-column
   * layouts. It shows from 1100px wide (globals.css `--with-rail`).
   */
  sidebar?: ReactNode;
  /**
   * The page draws its own <MobileTabBar /> inside its <main> and pads
   * itself for it: the club pages (/orgs/<handle>, its setup and Club tools),
   * standalone pages until they moved into this frame (Oct 21, 2026). Their
   * bar sits inside <main> so `.vibe-tabbar-page:has([aria-modal])` can hide
   * it under the page's inline dialogs. The shell then draws no bar and,
   * below 900px, steps aside (globals.css), so a narrow window lays the page
   * out exactly as it did on its own.
   */
  pageTabBar?: boolean;
  /** Where the left menu's Campus item goes, when not `/campus` (the club pages: Campus → Orgs). */
  campusHref?: string;
};

/**
 * Mounted on every campus-shelled route. The bottom-right Otto orb is the
 * unifying surface across campus / network / profile / otto.
 *
 * We hide the orb on /messages because the messaging surface already has
 * its own bottom-right composer + iframe-cursor seam, and an extra floating
 * element on top of that conflicts visually with the chat UI. CampusHome
 * separately toggles `body.vibe-hide-otto` when on the Chat tab — same
 * effect, driven from the page's internal tab state since tab changes
 * don't push to the URL.
 *
 * Below the 900px breakpoint the layout collapses to a single column and
 * the MobileTabBar takes over and the desktop LeftNav + right rail
 * hide via CSS — see globals.css `.vibe-app-shell` rules. Note: as we
 * fork individual routes to use the new MobileShell + dedicated
 * mobile components, this legacy path will be retired per-route.
 */
export function CampusAppShell({ children, sidebar, pageTabBar = false, campusHref }: Props) {
  const pathname = usePathname();
  const showOttoCorner = !pathname?.startsWith("/messages");

  return (
    <div
      className={[
        "vibe-app-shell",
        sidebar ? "vibe-app-shell--with-rail" : null,
        pageTabBar ? "vibe-app-shell--page-tabbar" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <LeftNav campusHref={campusHref} />
      {children}
      {sidebar ? <div className="vibe-right-rail">{sidebar}</div> : null}
      {pageTabBar ? null : <MobileTabBar />}
      {/* `display: contents`, so the orb, its panel and its toast are still
          the shell's own fixed layers; the class lets a club page stand them
          down under its dialogs (globals.css). */}
      {showOttoCorner ? (
        <div className="vibe-shell-otto">
          <OttoCorner />
        </div>
      ) : null}
    </div>
  );
}
