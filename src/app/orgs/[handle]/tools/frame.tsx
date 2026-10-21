import type { ReactNode } from "react";

import { LoadFailed } from "@/components/feedback/LoadFailed";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { columnStyle, pageStyle } from "@/components/orgs/club-tool-styles";

/**
 * Every Club tools page's frame: the setup page's cream page and one
 * centred column, with the phone's tab bar inside `<main>`, so
 * `.vibe-tabbar-page:has([aria-modal])` hides the bar while one of the
 * page's inline dialogs is open (the sheets sit above it on their own).
 */
export function ToolsPage({ children }: { children: ReactNode }) {
  return (
    <main className="vibe-tabbar-page" style={pageStyle}>
      <div style={columnStyle}>{children}</div>
      <MobileTabBar />
    </main>
  );
}

/** The frame when the club couldn't be read: the line and a Retry (a reload). */
export function ToolsFailed() {
  return (
    <ToolsPage>
      <LoadFailed failure={{ message: "Couldn't load your club. Try again." }} />
    </ToolsPage>
  );
}
