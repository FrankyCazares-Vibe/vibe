"use client";

import { CampusMobile } from "@/components/mobile/CampusMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { useIsMobile } from "@/lib/use-is-mobile";

import { CampusHome } from "./campus-home";

/**
 * Viewport-based fork for `/campus`.
 *
 * Desktop  → CampusHome (the existing 13k-line responsive component).
 * Mobile   → MobileShell + CampusMobile (iOS-native rebuild with the
 *            cream banner, swipeable Feed / Events / Orgs tabs, and
 *            an FAB that opens the existing post/clip composers).
 */
export function CampusSwitch({
  showSchoolVerifiedBanner,
}: {
  showSchoolVerifiedBanner: boolean;
}) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileShell>
        <CampusMobile />
      </MobileShell>
    );
  }
  return <CampusHome showSchoolVerifiedBanner={showSchoolVerifiedBanner} />;
}
