"use client";

import { useEffect, useState } from "react";

import { ProfileMobile } from "@/components/mobile/ProfileMobile";
import { MobileShell } from "@/components/mobile/MobileShell";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { MOBILE_BREAKPOINT_PX, useIsMobile } from "@/lib/use-is-mobile";

type Props = {
  handle: string;
  /** Forwarded by the server page so the Otto spotlight tour can fire
   *  when arriving via /profile/<handle>?welcome=1. */
  welcome?: boolean;
};

const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

/**
 * Viewport-based fork for the `/profile/[handle]` route.
 *
 * Desktop  → window.location.replace to /html/profile.html, exactly
 *            what the previous server-side redirect did.
 * Mobile   → MobileShell + ProfileMobile rendered in visitor mode
 *            (handle prop set). Owner chrome hides, Connect / Follow
 *            CTA appears in place of Edit, Posts / Clips / Portfolio
 *            tabs all read from the public per-handle endpoints. The
 *            exception is your own handle, which hands off to /profile
 *            (your own profile, behind that route's Terms, school-email
 *            and onboarding gates).
 *
 * Doing the redirect client-side lets us branch on viewport without
 * UA sniffing on the server. SSR renders nothing (returns null until
 * the hook resolves) so we don't briefly paint the desktop tree on
 * mobile.
 */
export function ProfileHandleSwitch({ handle, welcome }: Props) {
  const isMobile = useIsMobile();
  // The signed-in viewer's own handle, for the mobile self-check:
  // undefined while it's being looked up, null when signed out or unknown.
  const [viewerHandle, setViewerHandle] = useState<string | null | undefined>(undefined);

  // Desktop redirect — preserves the existing behavior (load the
  // static prototype with the visited user's handle). Runs in an
  // effect so it doesn't fire during SSR / first paint.
  useEffect(() => {
    if (isMobile) return;
    if (typeof window === "undefined") return;
    // useIsMobile reports desktop until hydration finishes, so this effect
    // runs once with isMobile=false on phones too. Ask the viewport itself
    // (as profile-html-bridge.tsx does), or every shared profile link
    // opened on a phone lands on the desktop page.
    if (window.matchMedia(MOBILE_QUERY).matches) return;
    const params = new URLSearchParams();
    params.set("app", "1");
    params.set("handle", handle.toLowerCase());
    if (welcome) params.set("welcome", "1");
    window.location.replace(`/html/profile.html?${params.toString()}`);
  }, [isMobile, handle, welcome]);

  // Mobile self-check: your own share link opens your profile, not the
  // visitor view of it (which has no owner chrome and no tour).
  useEffect(() => {
    if (!isMobile) return;
    let cancelled = false;
    void (async () => {
      let own: string | null = null;
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const uid = session?.user.id;
        if (uid) {
          // users.handle is readable by any signed-in user. The timeout
          // keeps a stalled lookup from holding the profile back.
          const { data } = await supabase
            .from("users")
            .select("handle")
            .eq("id", uid)
            .abortSignal(AbortSignal.timeout(3000))
            .maybeSingle();
          const h = (data as { handle?: unknown } | null)?.handle;
          own = typeof h === "string" ? h.trim().toLowerCase() : null;
        }
      } catch {
        // Can't tell who's looking: show the visitor view, as before.
        own = null;
      }
      if (!cancelled) setViewerHandle(own);
    })();
    return () => {
      cancelled = true;
    };
  }, [isMobile]);

  const isSelf = viewerHandle === handle.toLowerCase();

  // Your own link hands off to /profile instead of rendering owner mode
  // here. This route has no gates, and the owner bootstrap refuses an
  // account that hasn't accepted the Terms, which ProfileMobile can only
  // show as a bare "Could not load profile". /profile's server gates send
  // that account to the Terms (then school email, onboarding) instead, and
  // the tour's pending flag still fires there.
  useEffect(() => {
    if (!isMobile || !isSelf) return;
    window.location.replace(welcome ? "/profile?welcome=1" : "/profile");
  }, [isMobile, isSelf, welcome]);

  if (isMobile) {
    // Hold the profile until the self-check answers, so your own link
    // never flashes the visitor view (a Connect button on yourself) first,
    // and stays blank while it hands off to /profile.
    if (viewerHandle === undefined || isSelf) return <MobileShell>{null}</MobileShell>;
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
