"use client";

import { CampusAppShell } from "@/components/campus-app-shell";
import { MobileShell } from "@/components/mobile/MobileShell";
import { NetworkMobile } from "@/components/mobile/NetworkMobile";
import { NetworkPageClient } from "@/components/network/NetworkPageClient";
import { useIsMobile } from "@/lib/use-is-mobile";

/**
 * Viewport-based fork for the `/network` route.
 *
 * Desktop  → CampusAppShell + NetworkPageClient (unchanged).
 * Mobile   → MobileShell + NetworkMobile, the discovery-first iOS
 *            rebuild (search + Suggestions front-and-center, with
 *            existing-relationship views behind tabs).
 *
 * SSR renders the desktop branch; after hydration the hook flips and
 * mobile users see the rebuild on the first commit.
 */
export function NetworkSwitch() {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileShell>
        <NetworkMobile />
      </MobileShell>
    );
  }
  return (
    <CampusAppShell>
      <NetworkPageClient />
    </CampusAppShell>
  );
}
