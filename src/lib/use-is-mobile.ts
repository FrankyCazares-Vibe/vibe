"use client";

import {
  createContext,
  createElement,
  useContext,
  useDeferredValue,
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

import { LoadFailed } from "@/components/feedback/LoadFailed";

import { useClientReady } from "./use-client-ready";

/**
 * Viewport breakpoint that separates the desktop UI from the mobile UI.
 * Everything < this width gets the mobile component tree.
 *
 * Kept in sync with the legacy `.vibe-app-shell` media query at the same
 * width so a stray <CampusAppShell>-using route still collapses
 * correctly during the migration. After every route is forked, the shell
 * media queries can come out.
 */
export const MOBILE_BREAKPOINT_PX = 900;

/**
 * The breakpoint as the question the browser is asked. Exported for the few
 * places that must ask the window itself, in an effect, because the hook can
 * still be repeating the server's guess when they run.
 */
export const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(MOBILE_QUERY);
  const handler = () => callback();
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  // Older Safari
  mq.addListener(handler);
  return () => mq.removeListener(handler);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_QUERY).matches;
}

// The two answers a server render can give. Two fixed functions, not one made
// per render, so React always gets the same one for the same guess.
function serverSaysDesktop(): boolean {
  return false;
}
function serverSaysPhone(): boolean {
  return true;
}

/**
 * The server's first guess for this page, for every `useIsMobile()` under a
 * Switch (see `ScreenGuess`). False where no Switch set it: the server's old
 * answer, "desktop".
 */
const FirstGuessContext = createContext(false);

/**
 * What the hook answers on the server and while the page hydrates: the guess
 * handed to it, else the guess of the Switch above it, else desktop.
 */
export function firstAnswer(own: boolean | undefined, inherited: boolean): boolean {
  return own ?? inherited;
}

/**
 * Viewport class hook backed by `matchMedia`. Returns `true` on mobile
 * widths, `false` on desktop.
 *
 * The server can't see a window, so there it answers with a guess, and the
 * browser repeats that same guess while the page hydrates (that is what
 * keeps the two in agreement, `useSyncExternalStore`'s server snapshot).
 * Straight after hydration the real width takes over, and it is the only
 * thing that decides from then on. The guess is `firstGuess` when a caller
 * passes one (a Switch does, from `src/lib/device-hint.ts`), else whatever
 * the Switch above this component passed, else desktop.
 *
 * Note: this returns a concrete boolean, not `boolean | null`. When the
 * guess is wrong (a narrow laptop window, an iPad held upright) the page
 * paints the other layout first and swaps once after hydration. The
 * alternative, returning null first, is a blank flash for everybody, and a
 * flash of "nothing" feels worse than a flash of "the other layout".
 */
export function useIsMobile(firstGuess?: boolean): boolean {
  const guess = firstAnswer(firstGuess, useContext(FirstGuessContext));
  return useSyncExternalStore(subscribe, getSnapshot, guess ? serverSaysPhone : serverSaysDesktop);
}

// ---------------------------------------------------------------------------
// The pieces every `*Switch.tsx` file shares.
//
// A Switch has two screens, the phone one and the desktop one, and loads each
// with `next/dynamic`, so a device downloads only the one it draws. The
// server builds the screen its guess names; the browser's first paint is that
// same screen; after hydration the width decides, and if it disagrees with
// the guess the Switch swaps once.
//
// No screen is ever wrapped in a loading state (no `loading` option, no
// <Suspense>), ON PURPOSE, for two measured reasons. On the server, React
// sends a screen inside such a wrapper as "placeholder first, the real markup
// after", which would make the first paint a blank frame. In the browser, a
// placeholder that shows for even an instant holds the real screen back for
// 300 ms (React's own rule against flicker). Instead a screen whose code is
// still on its way is brought in as a background update (`useDeferredValue`):
// the page keeps what it has until the screen is ready, then changes once.
// ---------------------------------------------------------------------------

/** What a Switch draws: one of its two screens, or nothing for a moment. */
export type ScreenToShow = "phone" | "desktop" | "none";

/**
 * The decision, with nothing of React in it. `isMobile` is the hook's answer
 * right now; `settled` is that same answer once the screen it names is ready
 * to draw (it trails `isMobile` while that screen's code is downloading).
 *
 * The two agree: draw that screen. They disagree only while the answer has
 * just changed, and then it depends which way:
 *  - towards the phone screen, the desktop screen stays until the phone one
 *    is ready. Desktop screens have always sat on a phone-width window for a
 *    moment (the server used to send them to every phone), and they are
 *    written for it.
 *  - towards the desktop screen, the phone screen leaves at once and the
 *    page shows its own colour until the desktop one is ready. Phone screens
 *    were never on a wide window before, and some tidy the address bar or
 *    start a tour as they mount, so they are not left running there. (What
 *    one of them did to the address in the moment it had is undone: see
 *    `addressToPutBack`.)
 */
export function chooseScreen(isMobile: boolean, settled: boolean): ScreenToShow {
  if (isMobile === settled) return isMobile ? "phone" : "desktop";
  return isMobile ? "desktop" : "none";
}

/** What `useScreen` hands a Switch. */
export type ScreenChoice = {
  /** The screen to draw now. */
  show: ScreenToShow;
  /** The guess this page was built with, for `ScreenGuess`. */
  guess: boolean;
  /**
   * False on the server and in the browser's first paint, true after. For a
   * screen that must never be built on the server: draw it only when this is
   * true. It turns true as a background update, so that screen's code can
   * finish downloading without a placeholder taking its place.
   */
  inBrowser: boolean;
};

/**
 * The address to put back in the bar after a phone screen has run on a window
 * too wide for it, or null to leave the bar alone. `arrived` is the address
 * the page was opened at, `now` is the bar as the phone screen left it; both
 * are whole addresses (`window.location.href`). The answer is the path, the
 * query and the #hash, the form `history.replaceState` is given everywhere
 * else in the app.
 *
 * Only ever the same page with its link settings back. If the path or the
 * site differs, something moved the page on purpose and it is left alone.
 */
export function addressToPutBack(arrived: string | null, now: string): string | null {
  if (!arrived || arrived === now) return null;
  let was: URL;
  let is: URL;
  try {
    was = new URL(arrived);
    is = new URL(now);
  } catch {
    return null;
  }
  if (was.origin !== is.origin || was.pathname !== is.pathname) return null;
  return was.pathname + was.search + was.hash;
}

/**
 * Keeps a link's settings for the desktop screen when the server's guess was
 * "phone" and the window turned out to be wide (an iPad mini or a big phone
 * held sideways, an unfolded foldable, a laptop browser sending a phone's
 * user agent).
 *
 * The phone screen has to be the first thing the browser runs there, to match
 * the server's markup, so its mount effects run once before the Switch takes
 * it away. Some of them read a link's setting and then delete it from the
 * address (`?post=`, `?clip=`, `?tag=`, a seen `?welcome=1`). The desktop
 * screen mounts next, looks at the address, finds nothing, and the link's
 * target is lost. Before the server guessed, such a device got the desktop
 * screen from the start and the link worked.
 *
 * So the address is remembered as the page arrived (read while this Switch
 * hydrates, before any effect has run) and put back in this Switch's own
 * mount effect. React runs a child's effects before its parent's, and the
 * re-render that removes the phone screen comes after both, so this lands
 * after the phone screen's tidy-up and before anything of the desktop screen
 * exists.
 *
 * Nothing happens on a page that is not hydrating (moving between pages
 * inside the app: the width decides from the first render there, so a phone
 * screen never touches a wide window), on a phone-width window, or when the
 * guess was "desktop".
 */
function useArrivalAddressKept(guessPhone: boolean, ready: boolean): void {
  // `ready` is false only on the server and while the page hydrates.
  const [arrived] = useState(() =>
    ready || typeof window === "undefined" ? null : window.location.href,
  );
  useEffect(() => {
    putArrivalAddressBack(arrived, guessPhone);
  }, [arrived, guessPhone]);
}

/**
 * The effect of `useArrivalAddressKept`, on its own so a test can run it
 * against a pretend window. `arrived` is null for a page that did not
 * hydrate; `guessPhone` says the phone screen is the one that just ran.
 */
export function putArrivalAddressBack(arrived: string | null, guessPhone: boolean): void {
  if (arrived === null || !guessPhone || getSnapshot()) return;
  const back = addressToPutBack(arrived, window.location.href);
  if (back === null) return;
  try {
    // A fresh `{}`, like the screens' own tidy-ups. Not the entry's current
    // state: handed its own notes back, Next skips telling `useSearchParams`
    // (viewing-campus.ts). Not null either: on a first load this runs before
    // Next starts listening, and an entry left holding null is ignored on
    // Back (the address changes, the page does not), where `{}` reloads.
    window.history.replaceState({}, "", back);
  } catch {
    /* unsupported / sandbox */
  }
}

/**
 * The hook a Switch calls with the server's guess (a prop from its page).
 *
 * The guess is kept as it was when the Switch mounted: a later answer from
 * the server (a refresh of the same page) changes nothing here, the window's
 * width is already deciding by then.
 */
export function useScreen(firstGuessPhone: boolean): ScreenChoice {
  const [guess] = useState(firstGuessPhone);
  const isMobile = useIsMobile(guess);
  const settled = useDeferredValue(isMobile);
  const ready = useClientReady();
  const inBrowser = useDeferredValue(ready);
  useArrivalAddressKept(guess, ready);
  return { show: chooseScreen(isMobile, settled), guess, inBrowser };
}

/**
 * Hands the server's guess to every `useIsMobile()` below it, so a component
 * inside a screen answers the same as the Switch that chose the screen while
 * the page hydrates. Without it a hook inside the phone screen would say
 * "desktop" on the server and draw its desktop variant into the phone page.
 */
export function ScreenGuess({ phone, children }: { phone: boolean; children?: ReactNode }): ReactElement {
  return createElement(FirstGuessContext.Provider, { value: phone }, children);
}

/** A screen's code, asked for the way `next/dynamic` asks for it. */
type ScreenLoader = () => Promise<unknown>;

/**
 * Start fetching the code of the screen this window's WIDTH asks for, the
 * moment a Switch file runs in the browser. Call it once, at the top of the
 * file, with the same `import()`s the file gives `next/dynamic`.
 *
 * When the server guessed right this asks for a file the page already
 * preloads, so it costs nothing. It earns its keep when the guess was wrong
 * (the right screen then downloads alongside the wrong one, instead of
 * starting only after the wrong one has hydrated) and for a screen the
 * server never builds, which nothing else preloads. Does nothing on the
 * server.
 */
export function warmScreen(load: { phone?: ScreenLoader; desktop?: ScreenLoader }): void {
  if (typeof window === "undefined") return;
  const wanted = getSnapshot() ? load.phone : load.desktop;
  // A failure here is not reported: React asks for the same file when it
  // draws the screen, and that is the request whose failure the page shows
  // (`orLoadFailed`).
  wanted?.().catch(() => {});
}

// ---------------------------------------------------------------------------
// When a screen's code cannot be fetched.
//
// Both screens used to be part of the page's own files, so changing the
// window's width never needed the network. Now the other screen is fetched
// when the width first asks for it, which can be hours after the page loaded:
// a laptop window snapped to half the display, a big phone turned sideways.
// That fetch fails when the signal drops, and when a new build has gone live
// since (the old file's address then answers 404). Nothing above a Switch
// catches a failed `import()`, so without the two pieces below it would take
// the whole app down to Next's bare error page, with no button on it.
// ---------------------------------------------------------------------------

/** The line on the card below. The same Retry answers both causes above. */
export const SCREEN_LOAD_FAILED_LINE =
  "Couldn't load this page. Check your connection and try again.";

const SCREEN_LOAD_FAILED_BOX: CSSProperties = {
  minHeight: "60vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  padding: 24,
};

/**
 * What a Switch draws in a screen's place when that screen's code did not
 * arrive: the app's own "couldn't load" card in the middle of the page. No
 * `onRetry` is given, so the card's Retry button reloads the page, which
 * fetches the files of whatever build is live. A tap is the student's own
 * action, so this does not go against the rule that the store apps are never
 * reloaded on their own (BuildRefresh).
 *
 * It takes no props and ignores any it is handed, so it can stand in for any
 * screen, the desktop shell with a page inside it included.
 */
export function ScreenLoadFailed(): ReactElement {
  return createElement(
    "div",
    { style: SCREEN_LOAD_FAILED_BOX },
    createElement(LoadFailed, { failure: { message: SCREEN_LOAD_FAILED_LINE } }),
  );
}

/**
 * Wraps a screen's `import()` so it cannot fail: if the file does not arrive,
 * the answer is the card above instead of an error. Use it inside every
 * `next/dynamic` call of a Switch, around the whole `import(...).then(...)`:
 *
 *   dynamic(() => orLoadFailed(import("./screen").then((mod) => mod.Screen)))
 *
 * The `import()` stays written out inside the `dynamic()` call, which is
 * where Next looks for it to preload the file with the page.
 *
 * React keeps the first answer for as long as the page lives, so after a
 * failure that screen is the card until the student taps Retry.
 */
export function orLoadFailed<T>(screen: Promise<T>): Promise<T | typeof ScreenLoadFailed> {
  return screen.catch(() => ScreenLoadFailed);
}
