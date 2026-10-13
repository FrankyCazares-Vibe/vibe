"use client";

import dynamic from "next/dynamic";

import { MobileShell } from "@/components/mobile/MobileShell";
import { orLoadFailed, ScreenGuess, useScreen, warmScreen } from "@/lib/use-is-mobile";

import { ProfileHtmlBridge } from "./profile-html-bridge";

// The phone screen is its own download (`next/dynamic`): a laptop only hops
// to the static page, so it has no use for it. Still built on the server for
// a phone, and no `loading` option, on purpose (see the note above
// `chooseScreen` in use-is-mobile.ts). The desktop side, ProfileHtmlBridge,
// is a few lines and stays in this file's own code.
//
// `orLoadFailed`: a laptop window dragged narrow fetches this file long after
// the page loaded. If that fails, the screen is the "couldn't load" card with
// a Retry, not Next's bare error page.
const ProfileMobile = dynamic(() =>
  orLoadFailed(import("@/components/mobile/ProfileMobile").then((mod) => mod.ProfileMobile)),
);

// A phone the server took for a laptop: fetch its screen without waiting.
warmScreen({ phone: () => import("@/components/mobile/ProfileMobile") });

/**
 * Viewport-based fork for the `/profile` route.
 *
 * Desktop  → ProfileHtmlBridge, which hops to the static
 *            public/html/profile.html?app=1 carrying the settings that page
 *            reads (?post=<id>, ?welcome=1; see forwardedProfileParams).
 *            The static page then puts /profile back in the address bar.
 * Mobile   → MobileShell + ProfileMobile.
 *
 * The server builds the branch its guess names (`firstGuessPhone`, from
 * page.tsx) and the browser's first paint is the same one. After hydration
 * the window's width decides (`useScreen`); a wrong guess swaps once. A phone
 * that was guessed as a laptop paints the bridge's "Loading your profile…"
 * first, which is what every phone painted before, and the bridge itself
 * never hops on a phone-width window. Mobile users stay on the mobile
 * component regardless of URL params — bouncing them to the desktop bridge
 * for ?edit=1 (an earlier attempt) breaks the mobile context.
 */
export function ProfileSwitch({ firstGuessPhone = false }: { firstGuessPhone?: boolean }) {
  const screen = useScreen(firstGuessPhone);
  if (screen.show === "phone") {
    return (
      <ScreenGuess phone={screen.guess}>
        <MobileShell>
          <ProfileMobile />
        </MobileShell>
      </ScreenGuess>
    );
  }
  // "none" (the phone screen has just left a wide window) is the bridge too:
  // it is this file's own code, so there is nothing to wait for.
  return (
    <ScreenGuess phone={screen.guess}>
      <ProfileHtmlBridge />
    </ScreenGuess>
  );
}
