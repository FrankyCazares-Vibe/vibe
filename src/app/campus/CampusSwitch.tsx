"use client";

import { CampusMobile } from "@/components/mobile/CampusMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { CampusAccountCard } from "@/components/settings/PersonalEmail";
import { useIsMobile } from "@/lib/use-is-mobile";

import { CampusHome } from "./campus-home";

/**
 * Viewport-based fork for `/campus`.
 *
 * Desktop  → CampusHome (the existing 13k-line responsive component).
 * Mobile   → MobileShell + CampusMobile (iOS-native rebuild with the
 *            cream banner, swipeable Feed / Events / Orgs tabs, and
 *            an FAB that opens the existing post/clip composers).
 *
 * `desktopChat` is the `chat_desktop` switch, worked out on the server
 * (page.tsx). Only CampusHome reads it: with it on, the desktop Campus has
 * no Chat tab. The phone is decided by `chat_v2` alone, inside CampusMobile.
 */
export function CampusSwitch({
  showSchoolVerifiedBanner,
  desktopChat = false,
}: {
  showSchoolVerifiedBanner: boolean;
  desktopChat?: boolean;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileShell>
        <CampusMobile />
        {/* School email first: the yearly check-in while one is open, else the
            one-time "add a personal email" card. */}
        <CampusAccountCard />
      </MobileShell>
    );
  }
  return (
    <>
      <CampusHome showSchoolVerifiedBanner={showSchoolVerifiedBanner} desktopChat={desktopChat} />
      <CampusAccountCard />
    </>
  );
}
