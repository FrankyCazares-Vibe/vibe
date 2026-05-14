"use client";

import type { OttoPayload } from "@/app/api/me/otto/route";
import { CampusAppShell } from "@/components/campus-app-shell";
import { MobileShell } from "@/components/mobile/MobileShell";
import { OttoMobile } from "@/components/mobile/OttoMobile";
import { OttoPageClient } from "@/components/otto/OttoPageClient";
import { useIsMobile } from "@/lib/use-is-mobile";

/**
 * Viewport-based fork for `/otto`.
 *
 * Desktop  → CampusAppShell + the existing OttoPageClient (untouched).
 * Mobile   → MobileShell + OttoMobile (iOS-native rebuild — compact hero,
 *            swipeable Today / Stats tabs, same sub-components inside).
 */
export function OttoSwitch({ initial }: { initial: OttoPayload }) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileShell>
        <OttoMobile initial={initial} />
      </MobileShell>
    );
  }
  return (
    <CampusAppShell>
      <OttoPageClient initial={initial} />
    </CampusAppShell>
  );
}
