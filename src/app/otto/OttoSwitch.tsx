"use client";

import dynamic from "next/dynamic";

import type { OttoPayload } from "@/app/api/me/otto/route";
import { MobileShell } from "@/components/mobile/MobileShell";
import { orLoadFailed, ScreenGuess, useScreen, warmScreen } from "@/lib/use-is-mobile";

// Each screen is its own download (`next/dynamic`), so a device fetches the
// one it draws and not the other. All three are still built on the server
// (no `ssr: false`), with Otto's payload already in them, and none has a
// `loading` option, on purpose: see the note above `chooseScreen` in
// use-is-mobile.ts. The desktop side is two files, the app shell and the
// page inside it.
//
// `orLoadFailed`: a file fetched after the page has loaded can fail to arrive
// (no signal, or a new build has replaced it). The screen is then the
// "couldn't load" card with a Retry, not Next's bare error page.
const OttoMobile = dynamic(() =>
  orLoadFailed(import("@/components/mobile/OttoMobile").then((mod) => mod.OttoMobile)),
);
const CampusAppShell = dynamic(() =>
  orLoadFailed(import("@/components/campus-app-shell").then((mod) => mod.CampusAppShell)),
);
const OttoPageClient = dynamic(() =>
  orLoadFailed(import("@/components/otto/OttoPageClient").then((mod) => mod.OttoPageClient)),
);

// A wrong guess (a narrow laptop window, an iPad held upright): fetch the
// screen the width asks for alongside the guessed one.
warmScreen({
  phone: () => import("@/components/mobile/OttoMobile"),
  desktop: () =>
    Promise.all([
      import("@/components/campus-app-shell"),
      import("@/components/otto/OttoPageClient"),
    ]),
});

/**
 * Viewport-based fork for `/otto`.
 *
 * Desktop  → CampusAppShell + the existing OttoPageClient (untouched).
 * Mobile   → MobileShell + OttoMobile (iOS-native rebuild — compact hero,
 *            swipeable Today / Stats tabs, same sub-components inside).
 *
 * The server builds the screen its guess names (`firstGuessPhone`, from
 * page.tsx) and the browser's first paint is the same one. After hydration
 * the window's width decides (`useScreen`), swapping once if the guess was
 * wrong.
 */
export function OttoSwitch({
  initial,
  firstGuessPhone = false,
}: {
  initial: OttoPayload;
  firstGuessPhone?: boolean;
}) {
  const screen = useScreen(firstGuessPhone);
  if (screen.show === "phone") {
    return (
      <ScreenGuess phone={screen.guess}>
        <MobileShell>
          <OttoMobile initial={initial} />
        </MobileShell>
      </ScreenGuess>
    );
  }
  // The phone screen has just left a wide window and the desktop page's code
  // is still on its way: the page shows its own colour for that moment.
  if (screen.show === "none") return null;
  return (
    <ScreenGuess phone={screen.guess}>
      <CampusAppShell>
        <OttoPageClient initial={initial} />
      </CampusAppShell>
    </ScreenGuess>
  );
}

/**
 * `/otto` when Otto's data could not be read: the app shell around one line,
 * for every device, as it has always been.
 *
 * It lives here and not in page.tsx because of how a page's code is sent:
 * every client file a server page imports goes to every visitor as a script
 * tag, drawn or not. With the shell imported there, each phone would
 * download the desktop shell on every visit to `/otto` for a branch it
 * almost never sees. Here it is the `next/dynamic` one, fetched only when
 * drawn.
 */
export function OttoOffline() {
  return (
    <CampusAppShell>
      <main className="otto-room">
        <div className="otto-room-main">
          <p className="otto-room-empty">otto&rsquo;s offline. try again in a sec.</p>
        </div>
      </main>
    </CampusAppShell>
  );
}
