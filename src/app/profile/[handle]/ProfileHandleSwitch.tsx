"use client";

import { useEffect } from "react";

import { ProfileMobile } from "@/components/mobile/ProfileMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { useIsMobile } from "@/lib/use-is-mobile";

type Props = {
  handle: string;
  /** Forwarded by the server page so the Otto spotlight tour can fire
   *  when arriving via /profile/<handle>?welcome=1. */
  welcome?: boolean;
};

/**
 * Viewport-based fork for the `/profile/[handle]` route.
 *
 * Desktop  → window.location.replace to /html/profile.html, exactly
 *            what the previous server-side redirect did.
 * Mobile   → MobileShell + ProfileMobile rendered in visitor mode
 *            (handle prop set). Owner chrome hides, Connect / Follow
 *            CTA appears in place of Edit, Posts / Clips / Portfolio
 *            tabs all read from the public per-handle endpoints.
 *
 * Doing the redirect client-side lets us branch on viewport without
 * UA sniffing on the server. SSR renders nothing (returns null until
 * the hook resolves) so we don't briefly paint the desktop tree on
 * mobile.
 */
export function ProfileHandleSwitch({ handle, welcome }: Props) {
  const isMobile = useIsMobile();

  // Desktop redirect — preserves the existing behavior (load the
  // static prototype with the visited user's handle). Runs in an
  // effect so it doesn't fire during SSR / first paint.
  useEffect(() => {
    if (isMobile) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    params.set("app", "1");
    params.set("handle", handle.toLowerCase());
    if (welcome) params.set("welcome", "1");
    window.location.replace(`/html/profile.html?${params.toString()}`);
  }, [isMobile, handle, welcome]);

  if (isMobile) {
    return (
      <MobileShell>
        <ProfileMobile targetHandle={handle} />
      </MobileShell>
    );
  }
  // Desktop: brief loading state while the redirect kicks in.
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        fontSize: 15,
        color: "#444",
      }}
    >
      Loading profile…
    </div>
  );
}
