"use client";

import { CampusAppShell } from "@/components/campus-app-shell";
import { MessagesMobile } from "@/components/mobile/MessagesMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { useIsMobile } from "@/lib/use-is-mobile";

/**
 * Viewport-based fork for /messages.
 *
 * Desktop  → CampusAppShell + the legacy messages.html iframe (untouched).
 * Mobile   → MobileShell + MessagesMobile (iOS-native thread list +
 *            conversation view; no more squished desktop layout).
 *
 * The ?to=<handle> query param is threaded through both branches so a
 * link like /messages?to=alex opens the right conversation regardless
 * of viewport.
 */
export function MessagesSwitch({
  initialHandle,
  initialChannelId,
}: {
  initialHandle?: string;
  initialChannelId?: string;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <MobileShell>
        <MessagesMobile
          initialHandle={initialHandle}
          initialChannelId={initialChannelId}
        />
      </MobileShell>
    );
  }

  const params = new URLSearchParams({ app: "1", embedded: "1" });
  if (initialHandle) params.set("to", initialHandle);
  if (initialChannelId) params.set("channel", initialChannelId);
  const src = `/html/messages.html?${params.toString()}`;
  return (
    <CampusAppShell>
      <iframe
        src={src}
        title="Messages"
        className="vibe-messages-iframe"
        style={{
          width: "100%",
          height: "100vh",
          border: "none",
          display: "block",
          background: "#FAF7F2",
        }}
      />
    </CampusAppShell>
  );
}
