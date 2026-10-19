"use client";

import dynamic from "next/dynamic";
import { startTransition, useEffect, useState } from "react";

import { MobileShell } from "@/components/mobile/MobileShell";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  MOBILE_QUERY,
  orLoadFailed,
  ScreenGuess,
  useScreen,
  warmScreen,
} from "@/lib/use-is-mobile";

import { forwardedProfileParams, staticProfileHref } from "../profile-html-bridge";

type Props = {
  handle: string;
  /** The address's query string, read by the server page. Only the
   *  settings forwardedProfileParams allows are carried anywhere. */
  query?: string;
  /** The server's guess at "is this a phone" (page.tsx, from the request). */
  firstGuessPhone?: boolean;
};

// The phone screen is its own download (`next/dynamic`): a laptop only hops
// to the static page from here and never fetches it. It is never part of the
// server's markup on this route (the self-check below holds it back), so
// nothing preloads it; `warmScreen` starts the fetch as soon as this file
// runs on a phone, while the self-check is still asking.
//
// `orLoadFailed`: if the file does not arrive (no signal, or a new build has
// replaced it), the screen is the "couldn't load" card with a Retry, not
// Next's bare error page.
const ProfileMobile = dynamic(() =>
  orLoadFailed(import("@/components/mobile/ProfileMobile").then((mod) => mod.ProfileMobile)),
);
warmScreen({ phone: () => import("@/components/mobile/ProfileMobile") });

/**
 * Viewport-based fork for the `/profile/[handle]` route.
 *
 * Desktop  → window.location.replace to
 *            /html/profile.html?app=1&handle=<handle>, carrying the
 *            settings that page reads (?post=<id> from notification and
 *            mention links, ?welcome=1 for the tour; see
 *            forwardedProfileParams). The static page renders viewer mode,
 *            then puts /profile/<handle> back in the address bar.
 * Mobile   → MobileShell + ProfileMobile rendered in visitor mode
 *            (handle prop set). Owner chrome hides, the Follow
 *            button appears in place of Edit, Posts / Clips / Portfolio
 *            tabs all read from the public per-handle endpoints. The
 *            exception is your own handle, which hands off to /profile
 *            (your own profile, behind that route's Terms, school-email
 *            and onboarding gates).
 *
 * The server builds the branch its guess names (`firstGuessPhone`): the
 * empty phone shell for a phone, the "Loading profile…" line for a laptop.
 * The redirect itself stays on the client, where the window's real width is
 * known, so a wrong guess can never send a phone to the desktop page.
 */
export function ProfileHandleSwitch({ handle, query = "", firstGuessPhone = false }: Props) {
  const screen = useScreen(firstGuessPhone);
  // "none" (the phone screen has just left a wide window) counts as desktop
  // here: that branch is one line of text and the hop, nothing to wait for.
  const isMobile = screen.show === "phone";
  // The signed-in viewer's own handle, for the mobile self-check:
  // undefined while it's being looked up, null when signed out or unknown.
  const [viewerHandle, setViewerHandle] = useState<string | null | undefined>(undefined);

  // Desktop hop to the static page with the visited user's handle. Runs in
  // an effect so it doesn't fire during SSR / first paint.
  useEffect(() => {
    if (isMobile) return;
    if (typeof window === "undefined") return;
    // Until hydration finishes the hook repeats the server's guess, and the
    // guess can be "desktop" on a phone (Safari's "Request Desktop Website",
    // any browser the request doesn't give away), so this effect can run
    // once with isMobile=false there. Ask the viewport itself (as
    // profile-html-bridge.tsx does), or a shared profile link opened on
    // such a phone lands on the desktop page.
    if (window.matchMedia(MOBILE_QUERY).matches) return;
    window.location.replace(
      staticProfileHref(new URLSearchParams(query), window.location.hash, handle),
    );
  }, [isMobile, handle, query]);

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
      // As a background update: ProfileMobile's code may still be on its
      // way, and this way the empty shell simply stays until it is in. A
      // plain update would need a placeholder in its place, and React then
      // holds the real screen back 300 ms.
      if (!cancelled) startTransition(() => setViewerHandle(own));
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
  // the tour's pending flag still fires there. The link's settings (the
  // tour's ?welcome=1, a ?post=<id>) come along; a shared link's ?clear=1
  // never does.
  useEffect(() => {
    if (!isMobile || !isSelf) return;
    const kept = forwardedProfileParams(new URLSearchParams(query), {
      own: false,
    }).toString();
    window.location.replace(
      `/profile${kept ? `?${kept}` : ""}${window.location.hash}`,
    );
  }, [isMobile, isSelf, query]);

  if (isMobile) {
    // Hold the profile until the self-check answers, so your own link
    // never flashes the visitor view (a Follow button on yourself) first,
    // and stays blank while it hands off to /profile.
    const held = viewerHandle === undefined || isSelf;
    return (
      <ScreenGuess phone={screen.guess}>
        <MobileShell>
          {held ? null : <ProfileMobile targetHandle={handle} />}
        </MobileShell>
      </ScreenGuess>
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
        fontSize: 15,
        color: "#444",
      }}
    >
      Loading profile…
    </div>
  );
}
