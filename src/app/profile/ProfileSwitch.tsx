"use client";

import { ProfileMobile } from "@/components/mobile/ProfileMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { useIsMobile } from "@/lib/use-is-mobile";

import { ProfileHtmlBridge } from "./profile-html-bridge";

/**
 * Viewport-based fork for the `/profile` route.
 *
 * Desktop  → ProfileHtmlBridge, which hops to the static
 *            public/html/profile.html?app=1 carrying the settings that page
 *            reads (?post=<id>, ?welcome=1; see forwardedProfileParams).
 *            The static page then puts /profile back in the address bar.
 * Mobile   → MobileShell + ProfileMobile.
 *
 * SSR renders the desktop branch by default. After hydration the hook
 * reports the real viewport and the right tree paints — accepting a
 * one-frame layout flicker on mobile in exchange for never showing a
 * blank flash. Mobile users stay on the mobile component regardless of
 * URL params — bouncing them to the desktop bridge for ?edit=1 (an
 * earlier attempt) breaks the mobile context.
 */
export function ProfileSwitch() {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <MobileShell>
        <ProfileMobile />
      </MobileShell>
    );
  }
  return <ProfileHtmlBridge />;
}
