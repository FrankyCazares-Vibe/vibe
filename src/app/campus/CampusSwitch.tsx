"use client";

import dynamic from "next/dynamic";

import { MobileShell } from "@/components/mobile/MobileShell";
import { CampusAccountCard } from "@/components/settings/PersonalEmail";
import { orLoadFailed, ScreenGuess, useScreen, warmScreen } from "@/lib/use-is-mobile";

// Each screen is its own download (`next/dynamic`), so a device fetches the
// one it draws and not the other. Both are still built on the server (no
// `ssr: false`): the page arrives with the guessed screen already in it, and
// with a preload for that screen's file. Neither has a `loading` option, on
// purpose: see the note above `chooseScreen` in use-is-mobile.ts.
//
// `orLoadFailed`: the other screen is fetched when the window's width first
// asks for it, which can be long after the page loaded. If that fetch fails
// (no signal, or a new build has replaced the file), the screen is the
// "couldn't load" card with a Retry, not Next's bare error page.
const CampusMobile = dynamic(() =>
  orLoadFailed(import("@/components/mobile/CampusMobile").then((mod) => mod.CampusMobile)),
);
const CampusHome = dynamic(() =>
  orLoadFailed(import("./campus-home").then((mod) => mod.CampusHome)),
);

// A wrong guess (a narrow laptop window, an iPad held upright): fetch the
// screen the width asks for alongside the guessed one.
warmScreen({
  phone: () => import("@/components/mobile/CampusMobile"),
  desktop: () => import("./campus-home"),
});

/**
 * Viewport-based fork for `/campus`.
 *
 * Desktop  → CampusHome (the existing 13k-line responsive component).
 * Mobile   → MobileShell + CampusMobile (iOS-native rebuild with the
 *            cream banner, swipeable Feed / Events / Orgs tabs, and
 *            an FAB that opens the existing post/clip composers).
 *
 * `firstGuessPhone` is the server's guess at which of the two this device
 * needs (page.tsx, from the request). The server builds that screen and the
 * browser's first paint is the same one; after hydration the window's width
 * decides (`useScreen`), swapping once if the guess was wrong. Until this, the
 * server built CampusHome for everybody and every phone ran it before its own
 * screen.
 *
 * The other wrong guess, "phone" on a wide window (a big phone or small
 * tablet held sideways), runs CampusMobile once before CampusHome, and
 * CampusMobile deletes `?post=`, `?clip=` and `?tag=` from the address as it
 * mounts. `useScreen` puts the address back as the page arrived before
 * CampusHome exists, so a shared post or hashtag link still lands.
 *
 * `desktopChat` is the `chat_desktop` switch, worked out on the server
 * (page.tsx). Only CampusHome reads it: with it on, the desktop Campus has
 * no Chat tab. The phone is decided by `chat_v2` alone, inside CampusMobile.
 */
export function CampusSwitch({
  showSchoolVerifiedBanner,
  desktopChat = false,
  firstGuessPhone = false,
}: {
  showSchoolVerifiedBanner: boolean;
  desktopChat?: boolean;
  firstGuessPhone?: boolean;
}) {
  const screen = useScreen(firstGuessPhone);
  if (screen.show === "phone") {
    return (
      <ScreenGuess phone={screen.guess}>
        <MobileShell>
          <CampusMobile />
          {/* School email first: the yearly check-in while one is open, else the
              one-time "add a personal email" card. */}
          <CampusAccountCard />
        </MobileShell>
      </ScreenGuess>
    );
  }
  // The phone screen has just left a wide window and CampusHome's code is
  // still on its way: the page shows its own colour for that moment.
  if (screen.show === "none") return null;
  return (
    <ScreenGuess phone={screen.guess}>
      <CampusHome showSchoolVerifiedBanner={showSchoolVerifiedBanner} desktopChat={desktopChat} />
      <CampusAccountCard />
    </ScreenGuess>
  );
}
