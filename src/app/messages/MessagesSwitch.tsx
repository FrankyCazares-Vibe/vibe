"use client";

import dynamic from "next/dynamic";

import { CampusAppShell } from "@/components/campus-app-shell";
import { MiniFrame } from "@/components/desktop/messages/MiniFrame";
import { MessagesMobile } from "@/components/mobile/MessagesMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { useClientReady } from "@/lib/use-client-ready";
import { useIsMobile } from "@/lib/use-is-mobile";

/** The stage before the client is known, and while the desktop shell's code loads: the page colour, nothing on it. */
function EmptyStage() {
  return <div style={{ minHeight: "100vh", background: "var(--cream)" }} />;
}

/**
 * The desktop shell, client-only. `ssr: false` keeps its code off phones and
 * off laptops without the switch; it is NOT what keeps a phone from mounting
 * it. That is `useClientReady` below.
 */
const MessagesDesktop = dynamic(
  () => import("@/components/desktop/messages/MessagesDesktop").then((mod) => mod.MessagesDesktop),
  { ssr: false, loading: () => <EmptyStage /> },
);

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
 *
 * `desktopChat` is the `chat_desktop` switch for this person, worked out on
 * the server (page.tsx). Off, which is the default: everything above, and
 * nothing else. On: a laptop gets CampusAppShell + MessagesDesktop instead of
 * the iframe, and a phone gets what it gets today.
 *
 * With it on, nothing is chosen until the client is known. `useIsMobile`
 * says "desktop" on the server and all through hydration, so a phone would
 * mount the desktop shell for one frame on every hard load and run its mount
 * effects (its reads, its history writes) before its own. Until
 * `useClientReady`, the page is the app shell around an empty stage.
 */
export function MessagesSwitch({
  initialHandle,
  initialChannelId,
  desktopChat = false,
  mini = false,
}: {
  initialHandle?: string;
  initialChannelId?: string;
  desktopChat?: boolean;
  /** `?mini=1`: this page is the small Messages window's frame. */
  mini?: boolean;
}) {
  const isMobile = useIsMobile();
  // Read on every render (a hook cannot sit behind the prop); used only with the switch on.
  const ready = useClientReady();

  // The small Messages window (public/html/_miniMessenger.js and
  // MiniMessenger.tsx frame this page): the phone's Messages, no shell, no
  // tab bar. Opening a chat rewrites the frame's address to
  // `/messages?channel=<id>`, without `mini`, so a reload inside the frame
  // (a new build) is told apart by being framed at all.
  const framed = ready && typeof window !== "undefined" && window.self !== window.top;
  if (mini || framed) {
    return (
      <MiniFrame>
        <MessagesMobile mini initialHandle={initialHandle} initialChannelId={initialChannelId} />
      </MiniFrame>
    );
  }

  if (desktopChat && !ready) {
    return (
      <CampusAppShell>
        <EmptyStage />
      </CampusAppShell>
    );
  }

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

  if (desktopChat) {
    return (
      <CampusAppShell>
        <MessagesDesktop initialHandle={initialHandle} initialChannelId={initialChannelId} />
      </CampusAppShell>
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
