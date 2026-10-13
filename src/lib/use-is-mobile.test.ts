/**
 * Tests for `use-is-mobile.ts`: the 899px rule, what the hook answers on the
 * server (the first guess), and the decision every `*Switch.tsx` file makes
 * from it. Stand-ins for the checks that need a build: a phone's page is
 * built as the phone screen, a laptop's as the desktop one, and neither is
 * wrapped in a loading state.
 *
 * Run with:
 *   node --test src/lib/use-is-mobile.test.ts
 *
 * The module is a client hook file: it imports "react" (resolved from
 * node_modules) and its neighbour "./use-client-ready". WHY THE RESOLVE HOOK:
 * that import is extensionless, which is what Next and tsc expect; Node's
 * type stripping adds no extension. Same pattern as org-asset-url.test.ts.
 * The server renders below are React's own `renderToString`, which
 * answers `useSyncExternalStore` with the server snapshot, exactly what a
 * request does. A hydrating browser repeats that same snapshot (React's
 * rule), which is why the first client paint matches.
 *
 * The module also imports the app's "couldn't load" card
 * (`@/components/feedback/LoadFailed`), a .tsx file Node cannot read. The
 * same hook swaps it for a stand-in that prints what it was handed, which is
 * all these tests need: the line on the card, and that no retry of its own
 * was passed (the card then reloads the page).
 *
 * The last block reads the five `*Switch.tsx` files and their pages as text:
 * each screen must be loaded with `import()`, each `import()` must be unable
 * to fail, and each page must pass the request's guess down.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("use-is-mobile.test.ts needs Node >= 22.15 (module.registerHooks)");
}
/** The stand-in card: one line of text with the props that matter. */
const LOAD_FAILED_STAND_IN =
  "data:text/javascript," +
  encodeURIComponent(
    'export function LoadFailed(props) { return "[card] " + JSON.stringify({' +
      " message: props.failure.message," +
      " hasAction: props.failure.action !== undefined," +
      ' ownRetry: typeof props.onRetry === "function" }); }',
  );
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/components/feedback/LoadFailed") {
      return { url: LOAD_FAILED_STAND_IN, shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const subject = await import("./use-is-mobile");
const {
  addressToPutBack,
  chooseScreen,
  firstAnswer,
  MOBILE_BREAKPOINT_PX,
  MOBILE_QUERY,
  orLoadFailed,
  putArrivalAddressBack,
  SCREEN_LOAD_FAILED_LINE,
  ScreenGuess,
  ScreenLoadFailed,
  useIsMobile,
  useScreen,
  warmScreen,
} = subject;

/** Prints what the hook says, as a Switch's child would see it. */
function Probe({ guess }: { guess?: boolean }): ReactNode {
  return useIsMobile(guess) ? "phone" : "desktop";
}

/** Prints the whole decision of a Switch built with this guess. */
function SwitchProbe({ guess }: { guess: boolean }): ReactNode {
  const s = useScreen(guess);
  return `${s.show}|${s.guess ? "guess-phone" : "guess-desktop"}|${s.inBrowser ? "browser" : "server"}`;
}

/** Where the pretend window says it is, unless a test says otherwise. */
const PRETEND_ADDRESS = "https://vibe.test/campus";

/**
 * Runs `fn` with a pretend browser window of the given width class, and
 * hands back the questions the window was asked. `address` is what its
 * address bar shows; every `history.replaceState` is written to `writes`.
 */
function withWindow(
  narrow: boolean,
  fn: () => void,
  address: string = PRETEND_ADDRESS,
  writes: unknown[][] = [],
): string[] {
  const g = globalThis as { window?: unknown };
  const asked: string[] = [];
  g.window = {
    matchMedia: (query: string) => {
      asked.push(query);
      return { matches: narrow, addEventListener() {}, removeEventListener() {} };
    },
    location: { href: address },
    history: { replaceState: (...args: unknown[]) => void writes.push(args) },
  };
  try {
    fn();
  } finally {
    delete g.window;
  }
  return asked;
}

test("the rule: under 900px is the phone screen", () => {
  assert.equal(MOBILE_BREAKPOINT_PX, 900);
  assert.equal(MOBILE_QUERY, "(max-width: 899px)");
});

test("first answer: own guess, else the Switch's, else desktop", () => {
  assert.equal(firstAnswer(undefined, false), false);
  assert.equal(firstAnswer(undefined, true), true);
  assert.equal(firstAnswer(true, false), true);
  assert.equal(firstAnswer(false, true), false);
});

test("server: no guess is desktop, as it always was", () => {
  assert.equal(renderToString(createElement(Probe)), "desktop");
});

test("server: the hook answers with the guess it is handed", () => {
  assert.equal(renderToString(createElement(Probe, { guess: true })), "phone");
  assert.equal(renderToString(createElement(Probe, { guess: false })), "desktop");
});

test("server: a hook inside a screen repeats the Switch's guess", () => {
  const inside = (phone: boolean, guess?: boolean) =>
    renderToString(createElement(ScreenGuess, { phone }, createElement(Probe, { guess })));
  assert.equal(inside(true), "phone");
  assert.equal(inside(false), "desktop");
  // A guess passed by hand still wins over the one above.
  assert.equal(inside(true, false), "desktop");
  assert.equal(inside(false, true), "phone");
});

test("server: the guess decides even where a window exists (what hydration repeats)", () => {
  // A wide window and a phone guess, then a narrow window and a desktop
  // guess: the server snapshot is the guess both times, and the window is
  // not even asked.
  const wide = withWindow(false, () => {
    assert.equal(renderToString(createElement(Probe, { guess: true })), "phone");
  });
  const narrow = withWindow(true, () => {
    assert.equal(renderToString(createElement(Probe, { guess: false })), "desktop");
  });
  assert.deepEqual([...wide, ...narrow], []);
});

test("the decision: the two answers agree, draw that screen", () => {
  // Phone guessed phone, laptop guessed laptop, and every moment after a
  // swap has finished.
  assert.equal(chooseScreen(true, true), "phone");
  assert.equal(chooseScreen(false, false), "desktop");
});

test("the decision: on the way to the phone screen, the desktop one stays", () => {
  // The width says phone, the phone screen is not ready yet (a phone that
  // was guessed as a laptop, a laptop window dragged narrow).
  assert.equal(chooseScreen(true, false), "desktop");
});

test("the decision: on the way to the desktop screen, the phone one leaves at once", () => {
  // The width says desktop, the desktop screen is not ready yet (a wide
  // window that was guessed as a phone, a big phone turned sideways).
  assert.equal(chooseScreen(false, true), "none");
});

test("server: a Switch builds the guessed screen, whole, and says it is not in a browser", () => {
  assert.equal(renderToString(createElement(SwitchProbe, { guess: true })), "phone|guess-phone|server");
  assert.equal(renderToString(createElement(SwitchProbe, { guess: false })), "desktop|guess-desktop|server");
  // Never "none" and never the other screen, whatever window exists.
  withWindow(false, () => {
    assert.equal(renderToString(createElement(SwitchProbe, { guess: true })), "phone|guess-phone|server");
  });
  withWindow(true, () => {
    assert.equal(renderToString(createElement(SwitchProbe, { guess: false })), "desktop|guess-desktop|server");
  });
});

test("no loading wrapper: the shared file never reaches for Suspense", () => {
  // A wrapper around a screen makes the server send a placeholder first and
  // makes the browser hold the real screen back 300 ms (the note above
  // `chooseScreen`). Screens come in as background updates instead.
  const source = readFileSync(new URL("./use-is-mobile.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(code.includes("Suspense"), false);
  assert.ok(code.includes("useDeferredValue(isMobile)"));
});

test("warming: nothing is fetched on the server", () => {
  let calls = 0;
  const load = async () => void (calls += 1);
  warmScreen({ phone: load, desktop: load });
  assert.equal(calls, 0);
});

test("warming: the window's width picks the screen to fetch, whatever the guess was", () => {
  const fetched: string[] = [];
  const load = {
    phone: async () => void fetched.push("phone"),
    desktop: async () => void fetched.push("desktop"),
  };
  const asked = withWindow(true, () => warmScreen(load));
  assert.deepEqual(fetched, ["phone"]);
  withWindow(false, () => warmScreen(load));
  assert.deepEqual(fetched, ["phone", "desktop"]);
  // The same 899px question the hook asks, nothing of its own.
  assert.deepEqual(asked, [MOBILE_QUERY]);
});

test("warming: a missing screen or a failed fetch is quiet", async () => {
  // The profile page for someone else has no desktop screen to fetch.
  withWindow(false, () => warmScreen({ phone: async () => {} }));
  // A failed fetch must not surface as an unhandled rejection.
  withWindow(true, () => warmScreen({ phone: () => Promise.reject(new Error("offline")) }));
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// ---------------------------------------------------------------------------
// A link's settings on a wide window that was guessed as a phone. The phone
// screen runs once there and deletes `?post=`, `?clip=`, `?tag=` from the
// address; the Switch puts the address back before the desktop screen mounts.
// ---------------------------------------------------------------------------

test("the address: what the phone screen deleted comes back, as path + query + hash", () => {
  const at = (rest: string) => `https://vibe.test${rest}`;
  assert.equal(addressToPutBack(at("/campus?post=p1"), at("/campus")), "/campus?post=p1");
  assert.equal(
    addressToPutBack(at("/campus?tab=feed&tag=finals"), at("/campus?tab=feed")),
    "/campus?tab=feed&tag=finals",
  );
  assert.equal(addressToPutBack(at("/campus?clip=c9#top"), at("/campus#top")), "/campus?clip=c9#top");
  assert.equal(addressToPutBack(at("/profile?welcome=1"), at("/profile")), "/profile?welcome=1");
});

test("the address: left alone when nothing changed, or when the page itself moved", () => {
  const at = (rest: string) => `https://vibe.test${rest}`;
  // No arrival address (the page did not hydrate), or nothing was deleted.
  assert.equal(addressToPutBack(null, at("/campus")), null);
  assert.equal(addressToPutBack(at("/campus?post=p1"), at("/campus?post=p1")), null);
  // Another page, or another site: something moved the page on purpose.
  assert.equal(addressToPutBack(at("/campus?tab=chat"), at("/messages")), null);
  assert.equal(addressToPutBack("https://other.test/campus?post=p1", at("/campus")), null);
  // Not an address at all.
  assert.equal(addressToPutBack("not an address", at("/campus")), null);
});

test("the address: put back only for a phone guess on a wide window", () => {
  const arrived = "https://vibe.test/campus?post=p1";
  const stripped = "https://vibe.test/campus";
  const run = (narrow: boolean, guessPhone: boolean, from: string | null, now = stripped) => {
    const writes: unknown[][] = [];
    withWindow(narrow, () => putArrivalAddressBack(from, guessPhone), now, writes);
    return writes;
  };
  // The one case: built as the phone screen, the window is wide.
  assert.deepEqual(run(false, true, arrived), [[{}, "", "/campus?post=p1"]]);
  // A phone that was guessed right keeps its own tidy-up.
  assert.deepEqual(run(true, true, arrived), []);
  // A desktop guess: no phone screen ran, on either width.
  assert.deepEqual(run(false, false, arrived), []);
  assert.deepEqual(run(true, false, arrived), []);
  // A page that did not hydrate (moving between pages inside the app).
  assert.deepEqual(run(false, true, null), []);
  // Nothing was deleted: the address bar is not touched at all.
  assert.deepEqual(run(false, true, arrived, arrived), []);
});

test("the address: a Switch never reads or writes it on the server", () => {
  // No window at all, which is the real server.
  assert.equal(renderToString(createElement(SwitchProbe, { guess: true })), "phone|guess-phone|server");
  // And with one: building the markup writes nothing (effects do not run).
  const writes: unknown[][] = [];
  withWindow(false, () => void renderToString(createElement(SwitchProbe, { guess: true })), PRETEND_ADDRESS, writes);
  assert.deepEqual(writes, []);
});

// ---------------------------------------------------------------------------
// A screen whose code does not arrive. Screens are fetched on demand now,
// some long after the page loaded, and nothing above a Switch catches a
// failed `import()`: without `orLoadFailed` it is Next's bare error page.
// ---------------------------------------------------------------------------

test("a failed fetch: the screen becomes the couldn't-load card, not an error", async () => {
  const Real = (): ReactNode => "the real screen";
  // A fetch that works is handed through untouched.
  assert.equal(await orLoadFailed(Promise.resolve(Real)), Real);
  // One that fails (offline, or a 404 after a new build) answers with the card.
  assert.equal(await orLoadFailed(Promise.reject(new Error("Loading chunk failed"))), ScreenLoadFailed);
  assert.equal(await orLoadFailed(Promise.reject(undefined)), ScreenLoadFailed);
});

test("a failed fetch: the card says so in plain words and reloads on Retry", () => {
  // The stand-in card prints its props (see the top of this file). No retry
  // of its own and no mapped action: LoadFailed then shows Retry and calls
  // window.location.reload().
  const html = renderToString(createElement(ScreenLoadFailed));
  const printed = html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
  assert.ok(printed.includes(`"message":"${SCREEN_LOAD_FAILED_LINE}"`), printed);
  assert.ok(printed.includes('"hasAction":false'));
  assert.ok(printed.includes('"ownRetry":false'));
  // Words a student reads: plain, no long dash.
  assert.equal(/[–—]/.test(SCREEN_LOAD_FAILED_LINE), false);
  // It stands in for any screen, so props meant for the real one are ignored.
  const AsAnyScreen = ScreenLoadFailed as (props: { children?: ReactNode }) => ReactNode;
  const withProps = createElement(AsAnyScreen, null, "a page inside the desktop shell");
  assert.equal(renderToString(withProps), html);
});

// ---------------------------------------------------------------------------
// The Switch files themselves, read as text. One ordinary `import` of a
// screen at the top of a Switch file puts that screen back in every device's
// download, with nothing on the page to show it happened. These checks are
// what would catch it.
// ---------------------------------------------------------------------------

const REPO_ROOT = new URL("../../", import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, REPO_ROOT), "utf8");

/** Each Switch, the page that feeds it, and the screens it must load on demand. */
const SWITCHES = [
  {
    file: "src/app/campus/CampusSwitch.tsx",
    page: "src/app/campus/page.tsx",
    screens: ["@/components/mobile/CampusMobile", "./campus-home"],
  },
  {
    file: "src/app/profile/ProfileSwitch.tsx",
    page: "src/app/profile/page.tsx",
    screens: ["@/components/mobile/ProfileMobile"],
  },
  {
    file: "src/app/profile/[handle]/ProfileHandleSwitch.tsx",
    page: "src/app/profile/[handle]/page.tsx",
    screens: ["@/components/mobile/ProfileMobile"],
  },
  {
    file: "src/app/network/NetworkSwitch.tsx",
    page: "src/app/network/page.tsx",
    screens: [
      "@/components/mobile/NetworkMobile",
      "@/components/network/NetworkPageClient",
      "@/components/campus-app-shell",
    ],
  },
  {
    file: "src/app/otto/OttoSwitch.tsx",
    page: "src/app/otto/page.tsx",
    screens: [
      "@/components/mobile/OttoMobile",
      "@/components/otto/OttoPageClient",
      "@/components/campus-app-shell",
    ],
  },
];

/** Every `from "<module>"` in a file whose import is real code, not `import type`. */
function staticImports(source: string): string[] {
  const found: string[] = [];
  const re = /^import\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gm;
  for (let m = re.exec(source); m; m = re.exec(source)) found.push(m[1]);
  return found;
}

test("the checker itself: sees a plain import, skips a type import and an import()", () => {
  const sample = [
    'import { A } from "./a";',
    'import type { B } from "./b";',
    "import {",
    "  C,",
    '} from "./c";',
    'const D = dynamic(() => import("./d"));',
  ].join("\n");
  assert.deepEqual(staticImports(sample), ["./a", "./c"]);
});

for (const s of SWITCHES) {
  test(`${s.file}: its screens are fetched on demand, never imported at the top`, () => {
    const source = read(s.file);
    const top = staticImports(source);
    for (const screen of s.screens) {
      assert.equal(top.includes(screen), false, `${screen} is imported at the top`);
      assert.ok(source.includes(`import("${screen}")`), `${screen} is not loaded with import()`);
    }
    assert.ok(top.includes("next/dynamic"));
    assert.ok(source.includes("useScreen(firstGuessPhone)"), "starts from the server's guess");
    // No loading state around a screen, in any spelling.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of ["Suspense", "loading:", "ssr: false"]) {
      assert.equal(code.includes(banned), false, `${banned} in ${s.file}`);
    }
    // Every screen's fetch is one that cannot fail, with the `import()`
    // written out inside the `dynamic()` call, where Next looks for it.
    const dynamics = code.match(/\bdynamic\(/g) ?? [];
    const guarded = code.match(/\bdynamic\(\(\) =>\s*orLoadFailed\(\s*import\(/g) ?? [];
    assert.ok(dynamics.length > 0);
    assert.equal(guarded.length, dynamics.length, `a dynamic() without orLoadFailed in ${s.file}`);
  });

  test(`${s.page}: hands its Switch the request's guess`, () => {
    const source = read(s.page);
    assert.ok(source.includes('from "@/lib/device-hint"'));
    assert.ok(/firstGuessPhone=\{isPhoneRequest\(/.test(source));
    // A page is server code: any screen it imports itself is sent to every
    // visitor as a script tag, drawn or not (why OttoOffline lives in
    // OttoSwitch.tsx).
    for (const screen of s.screens) {
      if (screen.startsWith("@/")) assert.equal(staticImports(source).includes(screen), false, screen);
    }
  });
}
