/**
 * Tests for `mobile-tab-active.ts`, the rule for which phone tab lights
 * (wave plan week 1, batch C1). The club page lights Campus and /plus
 * lights Profile; the five tabs keep their old exact-or-subpath rule.
 * Switched to a club (wave 2, C4), that club's page lights Profile.
 *
 * Run with:
 *   node --test --experimental-strip-types src/components/mobile/mobile-tab-active.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `src/lib/onboarding/finish.test.ts` — Node's
 * type stripping doesn't add file extensions, and tsc refuses a `.ts` one.
 * The module under test has zero imports, so the hook only resolves it.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("mobile-tab-active.test.ts needs Node >= 22.15 (module.registerHooks)");
}
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const { MOBILE_TAB_HREFS, MOBILE_TAB_SECTIONS, activeMobileTab, isClubPath } = await import(
  "./mobile-tab-active"
);

test("the five tabs keep their exact-or-subpath rule", () => {
  const cases: Array<[string, string]> = [
    ["/campus", "/campus"],
    ["/campus/x", "/campus"],
    ["/network", "/network"],
    ["/otto", "/otto"],
    ["/messages", "/messages"],
    ["/profile", "/profile"],
    ["/profile/alice", "/profile"],
  ];
  for (const [pathname, tab] of cases) {
    assert.equal(activeMobileTab(pathname), tab, pathname);
  }
});

test("a club page lights Campus", () => {
  for (const pathname of ["/orgs/sae", "/orgs", "/orgs/sae/x"]) {
    assert.equal(activeMobileTab(pathname), "/campus", pathname);
  }
});

test("switched to a club, its page and everything under it light Profile", () => {
  for (const pathname of ["/orgs/sae", "/orgs/sae/", "/orgs/sae/tools/members", "/orgs/sae/setup", "/orgs/SAE", "/orgs/Sae/tools"]) {
    assert.equal(activeMobileTab(pathname, "sae"), "/profile", pathname);
  }
  // The stored handle is lower-cased, but a mixed-case one still matches.
  assert.equal(activeMobileTab("/orgs/sae/tools", "SAE"), "/profile");
  assert.equal(activeMobileTab("/orgs/s%61e", "sae"), "/profile", "an encoded segment is decoded");
});

test("switched, every other club page still lights Campus, and the tabs keep their rule", () => {
  for (const pathname of ["/orgs/chess", "/orgs/saex", "/orgs/sa", "/orgs", "/orgs/chess/tools/members"]) {
    assert.equal(activeMobileTab(pathname, "sae"), "/campus", pathname);
  }
  assert.equal(activeMobileTab("/profile", "sae"), "/profile");
  assert.equal(activeMobileTab("/messages", "sae"), "/messages");
  assert.equal(activeMobileTab("/orgs/%E0%A4%A", "sae"), "/campus", "a segment that won't decode is no match");
  for (const none of [null, undefined, ""]) {
    assert.equal(activeMobileTab("/orgs/sae", none), "/campus", `not switched (${String(none)})`);
  }
  assert.equal(isClubPath("/orgs/sae", "  "), false, "a blank handle matches nothing");
  assert.equal(isClubPath("/orgsx/sae", "sae"), false);
});

test("/plus lights Profile", () => {
  for (const pathname of ["/plus", "/plus/x"]) {
    assert.equal(activeMobileTab(pathname), "/profile", pathname);
  }
});

test("everything else lights no tab", () => {
  const none = [
    "/",
    "",
    null,
    undefined,
    "/posts/123",
    "/settings",
    "/feed",
    "/auth/login",
    "/orgsx",
    "/plushy",
    "/campusx",
    "/html/profile.html",
  ];
  for (const pathname of none) {
    assert.equal(activeMobileTab(pathname), null, String(pathname));
  }
});

test("the tab list and the section map agree", () => {
  assert.deepEqual([...MOBILE_TAB_HREFS], ["/campus", "/network", "/otto", "/messages", "/profile"]);
  const tabs: readonly string[] = MOBILE_TAB_HREFS;
  for (const [base, tab] of MOBILE_TAB_SECTIONS) {
    assert.ok(tabs.includes(tab), `${base} maps to ${tab}, which is not a tab`);
  }
  assert.equal(Object.isFrozen(MOBILE_TAB_SECTIONS), true);
});

test("drift guard: MobileTabBar uses this rule and lists the same tabs", () => {
  const src = readFileSync(new URL("./MobileTabBar.tsx", import.meta.url), "utf8");
  assert.ok(
    src.includes("activeMobileTab(pathname, switched?.handle)"),
    "MobileTabBar no longer calls activeMobileTab(pathname, switched?.handle)",
  );
  assert.ok(!src.includes("pathname.startsWith("), "MobileTabBar has its own startsWith rule again");
  const hrefs = [...src.matchAll(/href: "(\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, [...MOBILE_TAB_HREFS]);
});
