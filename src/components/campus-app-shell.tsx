"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import LeftNav from "@/components/LeftNav";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { OttoCorner } from "@/components/network/OttoCorner";

type Props = {
  children: ReactNode;
  /** Optional right column (e.g. feed widgets). Omit for simple two-column layouts. */
  sidebar?: ReactNode;
};

/**
 * Mounted on every campus-shelled route. The bottom-right Otto orb is the
 * unifying surface across campus / network / profile / otto.
 *
 * We hide the orb on /messages because the messaging surface already has
 * its own bottom-right composer + iframe-cursor seam, and an extra floating
 * element on top of that conflicts visually with the chat UI.
 *
 * Below the 900px breakpoint the layout collapses to a single column and
 * the MobileTabBar takes over and the desktop LeftNav + right rail
 * hide via CSS — see globals.css `.vibe-app-shell` rules. Note: as we
 * fork individual routes to use the new MobileShell + dedicated
 * mobile components, this legacy path will be retired per-route.
 */
export function CampusAppShell({ children, sidebar }: Props) {
  const pathname = usePathname();
  const showOttoCorner = !pathname?.startsWith("/messages");

  return (
    <div
      className={
        sidebar ? "vibe-app-shell vibe-app-shell--with-rail" : "vibe-app-shell"
      }
    >
      <LeftNav />
      {children}
      {sidebar ? <div className="vibe-right-rail">{sidebar}</div> : null}
      <MobileTabBar />
      {showOttoCorner ? <OttoCorner /> : null}
    </div>
  );
}
