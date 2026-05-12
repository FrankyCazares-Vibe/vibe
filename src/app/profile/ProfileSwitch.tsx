"use client";

import { useEffect, useState } from "react";

import { ProfileMobile } from "@/components/mobile/ProfileMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { useIsMobile } from "@/lib/use-is-mobile";

import { ProfileHtmlBridge } from "./profile-html-bridge";

/**
 * Viewport-based fork for the `/profile` route.
 *
 * Desktop  → ProfileHtmlBridge (existing static profile.html, untouched).
 * Mobile   → MobileShell + ProfileMobile, the iOS-native view-only fork.
 * Anyone with `?edit=1` falls through to ProfileHtmlBridge regardless of
 *   viewport — mobile-native editing isn't built yet, so the pencil
 *   icon on ProfileMobile sends the user into the desktop editor (the
 *   static page is already responsive at phone widths).
 *
 * SSR renders the desktop branch by default. After hydration the hook
 * reports the real viewport and the right tree paints — accepting a
 * one-frame layout flicker on mobile in exchange for never showing a
 * blank flash.
 */
function useIsEditingFromUrl(): boolean {
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        setEditing(sp.get("edit") === "1");
      } catch {
        setEditing(false);
      }
    };
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return editing;
}

export function ProfileSwitch() {
  const isMobile = useIsMobile();
  const editing = useIsEditingFromUrl();
  if (isMobile && !editing) {
    return (
      <MobileShell>
        <ProfileMobile />
      </MobileShell>
    );
  }
  return <ProfileHtmlBridge />;
}
