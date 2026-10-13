"use client";

import dynamic from "next/dynamic";

import { MobileShell } from "@/components/mobile/MobileShell";
import { orLoadFailed, ScreenGuess, useScreen, warmScreen } from "@/lib/use-is-mobile";

// Each screen is its own download (`next/dynamic`), so a device fetches the
// one it draws and not the other. None has a `loading` option, on purpose:
// see the note above `chooseScreen` in use-is-mobile.ts. The desktop side is
// two files, the app shell and the page inside it, both built on the server.
//
// `orLoadFailed`: a file fetched after the page has loaded can fail to arrive
// (no signal, or a new build has replaced it). The screen is then the
// "couldn't load" card with a Retry, not Next's bare error page.
const CampusAppShell = dynamic(() =>
  orLoadFailed(import("@/components/campus-app-shell").then((mod) => mod.CampusAppShell)),
);
const NetworkPageClient = dynamic(() =>
  orLoadFailed(
    import("@/components/network/NetworkPageClient").then((mod) => mod.NetworkPageClient),
  ),
);
const NetworkMobile = dynamic(() =>
  orLoadFailed(import("@/components/mobile/NetworkMobile").then((mod) => mod.NetworkMobile)),
);

// Nothing preloads a screen the server didn't build (the phone one, below),
// and a wrong guess needs the other screen: fetch what the window's width
// asks for right away.
warmScreen({
  phone: () => import("@/components/mobile/NetworkMobile"),
  desktop: () =>
    Promise.all([
      import("@/components/campus-app-shell"),
      import("@/components/network/NetworkPageClient"),
    ]),
});

/**
 * Viewport-based fork for the `/network` route.
 *
 * Desktop  → CampusAppShell + NetworkPageClient (unchanged).
 * Mobile   → MobileShell + NetworkMobile, the discovery-first iOS
 *            rebuild (search + Suggestions front-and-center, with
 *            existing-relationship views behind tabs).
 *
 * The server builds the branch its guess names (`firstGuessPhone`, from
 * page.tsx) and the browser's first paint is the same one. After hydration
 * the window's width decides (`useScreen`), swapping once if the guess was
 * wrong.
 *
 * The phone branch is the shell alone on the server: NetworkMobile is drawn
 * only in the browser (`screen.inBrowser`). It picks two of its colours, the
 * sticky header and the search field, by reading the theme in the browser,
 * and on the server that read says Light, so built there a Night phone would
 * paint a cream header strip until the screen's code arrived. The server
 * sends the page colour and the tab bar instead, and the screen mounts
 * knowing the theme, as it always has. Once those two colours are tokens,
 * draw <NetworkMobile /> without the `inBrowser` check and the phone gets its
 * markup up front, like Campus.
 */
export function NetworkSwitch({ firstGuessPhone = false }: { firstGuessPhone?: boolean }) {
  const screen = useScreen(firstGuessPhone);
  if (screen.show === "phone") {
    return (
      <ScreenGuess phone={screen.guess}>
        <MobileShell>{screen.inBrowser ? <NetworkMobile /> : null}</MobileShell>
      </ScreenGuess>
    );
  }
  // The phone screen has just left a wide window and the desktop page's code
  // is still on its way: the page shows its own colour for that moment.
  if (screen.show === "none") return null;
  return (
    <ScreenGuess phone={screen.guess}>
      <CampusAppShell>
        <NetworkPageClient />
      </CampusAppShell>
    </ScreenGuess>
  );
}
