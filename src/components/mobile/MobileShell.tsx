"use client";

import type { ReactNode } from "react";

import { MobileTabBar } from "@/components/mobile/MobileTabBar";

type Props = {
  children: ReactNode;
};

/**
 * Wraps every mobile-forked route. Provides the bottom tab bar +
 * bottom-edge padding so page content doesn't slide under the tabs.
 *
 * Per-page headers (covers, banners, hero sections) are responsible
 * for their OWN top-edge safe-area handling — that lets each screen
 * own its full-bleed top edge the iOS-native way (think Instagram
 * Profile: cover photo sits flush with the status bar, not below a
 * shared chrome bar).
 *
 * Pages using this shell are the ones that have been forked into the
 * `src/components/mobile/*` tree. The legacy CampusAppShell still
 * handles the routes that haven't been forked yet.
 */
export function MobileShell({ children }: Props) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        // Reserve space for the bottom tab bar (64px + iOS home indicator)
        // so the last item of the page doesn't get covered.
        paddingBottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
        background: "#FAF7F2",
      }}
    >
      {children}
      <MobileTabBar />
    </div>
  );
}
