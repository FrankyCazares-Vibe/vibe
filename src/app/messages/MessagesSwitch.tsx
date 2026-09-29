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
          // The page's own cream (#FAF7F2 in Light, #0C0B0B in Night) shows
          // while messages.html loads; a hardcoded cream flashed in Night.
          background: "var(--cream)",
          // Chrome paints an OPAQUE canvas (white, for a light document)
          // behind an iframe whose document's color-scheme differs from the
          // iframe element's. In Night the element inherits `dark` while the
          // blank document it starts on is `normal`, so every open flashed
          // white. `normal` here matches that blank document; once
          // messages.html (dark) paints, it covers its canvas itself.
          colorScheme: "normal",
        }}
      />
    </CampusAppShell>
  );
}
