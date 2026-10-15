/**
 * Tests for the use totals' browser rules (`touch.ts`) and drift tests for
 * where they are called from: every page checks in, Otto and map opens are
 * counted where a person opens them, and no browser writes the last-active
 * time any more.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/usage/touch.test.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const specifier = "./touch.ts";
const {
  COARSE_QUERY,
  deviceClass,
  isMissingFunction,
  OPEN_AT_KEY_PREFIX,
  OPEN_CAP_PER_ACTIVE,
  OPEN_EVERY_MS,
  PHONE_QUERY,
  readTouchBody,
  TOUCH_AT_KEY,
  TOUCH_BODY_MAX_CHARS,
  TOUCH_EVERY_MS,
  TOUCH_PATH,
  TOUCH_TICK_MS,
  touchBody,
  touchDue,
  USAGE_DEVICES,
  USAGE_OPENS,
} = (await import(specifier)) as typeof import("./touch");

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
const count = (re: RegExp, text: string) => (text.match(re) ?? []).length;

test("the device kind: installed first, then a narrow touch screen, else a computer", () => {
  for (const coarsePointer of [true, false]) {
    for (const narrow of [true, false]) {
      assert.equal(deviceClass({ standalone: true, coarsePointer, narrow }), "installed");
    }
  }
  assert.equal(deviceClass({ standalone: false, coarsePointer: true, narrow: true }), "phone");
  // A phone held sideways (wide) and a narrow laptop window (a mouse): a computer.
  assert.equal(deviceClass({ standalone: false, coarsePointer: true, narrow: false }), "desktop");
  assert.equal(deviceClass({ standalone: false, coarsePointer: false, narrow: true }), "desktop");
  assert.equal(deviceClass({ standalone: false, coarsePointer: false, narrow: false }), "desktop");
  assert.deepEqual([...USAGE_DEVICES], ["phone", "desktop", "installed"]);
  assert.deepEqual([...USAGE_OPENS], ["otto", "map"]);
});

test("a check-in's body is the device kind and the open, nothing else", () => {
  assert.equal(touchBody("phone"), '{"device":"phone"}');
  assert.equal(touchBody("installed", "map"), '{"device":"installed","open":"map"}');
  for (const device of USAGE_DEVICES) {
    for (const open of [undefined, ...USAGE_OPENS]) {
      const body = touchBody(device, open);
      assert.ok(body.length <= TOUCH_BODY_MAX_CHARS);
      assert.deepEqual(Object.keys(JSON.parse(body)), open ? ["device", "open"] : ["device"]);
      assert.deepEqual(readTouchBody(body), { device, open: open ?? null });
    }
  }
});

test("reading a body: anything that isn't ours counts as an unknown device with no open", () => {
  const none = { device: "unknown", open: null };
  for (const text of [undefined, null, "", "{", "not json", "[]", '["phone"]', "null", "42", '"phone"']) {
    assert.deepEqual(readTouchBody(text), none, String(text));
  }
  assert.deepEqual(readTouchBody(`{"device":"phone","x":"${"a".repeat(TOUCH_BODY_MAX_CHARS)}"}`), none);
  assert.deepEqual(readTouchBody('{"device":"tablet","open":"settings"}'), none);
  assert.deepEqual(readTouchBody('{"device":"PHONE"}'), none);
  assert.deepEqual(readTouchBody('{"open":"otto"}'), { device: "unknown", open: "otto" });
  // An extra field (an account id, a browser name) is dropped, never passed on.
  const read = readTouchBody('{"device":"desktop","open":"map","user":"x","agent":"y"}');
  assert.deepEqual(read, { device: "desktop", open: "map" });
  assert.deepEqual(Object.keys(read), ["device", "open"]);
});

test("due: none on record, the gap passed, or the clock set back", () => {
  const T = 1_780_000_000_000;
  assert.equal(touchDue(T, null, TOUCH_EVERY_MS), true);
  assert.equal(touchDue(T, Number.NaN, TOUCH_EVERY_MS), true);
  assert.equal(touchDue(T, T, TOUCH_EVERY_MS), false);
  assert.equal(touchDue(T + TOUCH_EVERY_MS - 1, T, TOUCH_EVERY_MS), false);
  assert.equal(touchDue(T + TOUCH_EVERY_MS, T, TOUCH_EVERY_MS), true);
  assert.equal(touchDue(T - 1, T, TOUCH_EVERY_MS), true);
  assert.equal(touchDue(T + OPEN_EVERY_MS - 1, T, OPEN_EVERY_MS), false);
});

test("the gaps: inside the five-minute active-now window, and the phone width is the app's", () => {
  assert.ok(TOUCH_EVERY_MS < 5 * 60 * 1000);
  assert.ok(TOUCH_TICK_MS < TOUCH_EVERY_MS);
  assert.ok(OPEN_EVERY_MS >= TOUCH_EVERY_MS);
  assert.equal(OPEN_CAP_PER_ACTIVE, 10);
  assert.equal(TOUCH_PATH, "/api/me/heartbeat");
  assert.equal(TOUCH_AT_KEY, "vibe_touch_at");
  assert.equal(OPEN_AT_KEY_PREFIX, "vibe_open_at_");
  assert.equal(COARSE_QUERY, "(pointer: coarse)");
  const mobile = readRoot("src/lib/use-is-mobile.ts");
  const px = /MOBILE_BREAKPOINT_PX = (\d+);/.exec(mobile);
  assert.ok(px, "MOBILE_BREAKPOINT_PX in use-is-mobile.ts");
  assert.equal(PHONE_QUERY, `(max-width: ${Number(px[1]) - 1}px)`);
});

test("a missing function is PGRST202 or 42883, never a refusal", () => {
  assert.equal(isMissingFunction({ code: "PGRST202" }), true);
  assert.equal(isMissingFunction({ code: "42883" }), true);
  assert.equal(isMissingFunction({ message: "Could not find the function public.usage_touch" }), true);
  assert.equal(isMissingFunction({ code: "42501", message: "not allowed" }), false);
  assert.equal(isMissingFunction({}), false);
});

// ── Where it is called from ───────────────────────────────────────────────

test("every page checks in: one <ActivityTouch /> in the root layout, after BuildRefresh", () => {
  const layout = readRoot("src/app/layout.tsx");
  assert.equal(count(/<ActivityTouch \/>/g, layout), 1);
  assert.ok(layout.indexOf("<BuildRefresh />") < layout.indexOf("<ActivityTouch />"));
  const touch = readRoot("src/components/usage/ActivityTouch.tsx");
  assert.match(touch, /window\.top !== window\.self/, "skips inside a frame");
  assert.match(touch, /visibilityState !== "visible"/, "only on screen");
  assert.match(touch, /setInterval\(attempt, TOUCH_TICK_MS\)/);
});

test("ActivityTouch reads the sign-in cookie's name, so the cookie must stay readable", () => {
  const options = readRoot("src/lib/supabase/cookie-options.ts");
  assert.doesNotMatch(options.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ""), /httpOnly:\s*true/);
  assert.match(readRoot("src/lib/usage/touch-client.ts"), /carriesSignInCookie\(document\.cookie\)/);
});

test("Campus no longer beats on its own: it waits for the tab's check-in, then reads", () => {
  const campus = readRoot("src/app/campus/campus-home.tsx");
  assert.equal(campus.includes("/api/me/heartbeat"), false);
  assert.match(campus, /await touchActivity\(\);\s*await refresh\(\);/);
});

test("Otto and map opens are counted where a person opens them", () => {
  const sites: [string, RegExp][] = [
    ["src/app/otto/OttoSwitch.tsx", /useEffect\(\(\) => \{\s*countOpen\("otto"\);\s*\}, \[\]\);/],
    // The side panel opens on the tab it was left on: Messages is not Otto.
    [
      "src/components/network/OttoSidePanel.tsx",
      /if \(open && \(!withMessages \|\| tab === "otto"\)\) countOpen\("otto"\);\s*\}, \[open, tab, withMessages\]\);/,
    ],
    ["src/components/mobile/CampusMobile.tsx", /if \(tab === "map" && !mapHidden\) countOpen\("map"\);/],
    ["src/app/campus/campus-home.tsx", /export function MapTabBody\(\) \{[\s\S]{0,200}?countOpen\("map"\);/],
  ];
  for (const [file, line] of sites) assert.match(readRoot(file), line, file);
  // Not on the corner button: that would count Messages use as Otto.
  assert.equal(readRoot("src/components/network/OttoCorner.tsx").includes("countOpen"), false);
  // Not on MapMobile's mount: the phone pager mounts it on every Campus load.
  assert.equal(readRoot("src/components/mobile/MapMobile.tsx").includes("countOpen"), false);
});

test("the static profile's panel: an open on its Messages tab is not an Otto open", () => {
  const otto = readRoot("public/html/_otto.js");
  const open = otto.slice(otto.indexOf("function openOttoPanel() {"));
  const first = open.split("\n").find((line) => line.includes("__vibeCountOpen"));
  assert.ok(first, "openOttoPanel counts the open");
  assert.ok(open.indexOf(first) < open.indexOf("buildPanel()"), "before anything else in it");
  assert.match(first, /__vibeOttoTab\(\) === 'messages'/);
  assert.match(first, /window\.__vibeCountOpen\('otto'\)/);
  const mini = readRoot("public/html/_miniMessenger.js");
  assert.match(mini, /window\.__vibeOttoTab = function \(\) \{ return ottoTab; \};/);
  // A "Message" button picks the Messages tab BEFORE it opens the panel.
  const button = mini.slice(mini.indexOf("window.openMiniMessenger"));
  assert.ok(button.indexOf('ottoTab = "messages";') < button.indexOf("window.__ottoOpenPanel();"));
  // From Messages back to Otto in the open panel counts.
  assert.match(mini, /if \(ottoOpen && was !== "otto" && ottoTab === "otto" && [^\n]*window\.__vibeCountOpen\('otto'\)/);
});

test("the device kind comes from the screen alone: no browser name, no store-app tag", () => {
  for (const file of ["src/lib/usage/touch.ts", "src/lib/usage/touch-client.ts", "public/html/_usageTouch.js"]) {
    const text = readRoot(file);
    assert.doesNotMatch(text, /userAgent|appShellOnClient|detectAppShell|navigator\.vendor|navigator\.platform/, file);
  }
});

/** Every file under `dir` (relative to the repo) with one of `exts`. */
function filesUnder(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(new URL(dir, root))) {
    const rel = `${dir}/${name}`;
    if (statSync(new URL(rel, root)).isDirectory()) out.push(...filesUnder(rel, exts));
    else if (exts.some((ext) => name.endsWith(ext))) out.push(rel);
  }
  return out;
}

test("no browser writes the last-active time: only the heartbeat route's fallback does", () => {
  const column = ["last", "active", "at"].join("_");
  const writes = new RegExp(`${column}\\s*:|set\\s+${column}\\s*=`, "g");
  const writers = filesUnder("src", [".ts", ".tsx"])
    .concat(filesUnder("public/html", [".js", ".html"]))
    .filter((file) => !file.endsWith(".test.ts"))
    .filter((file) => count(writes, readRoot(file)) > 0);
  assert.deepEqual(writers, ["src/app/api/me/heartbeat/route.ts"]);
  const route = readRoot("src/app/api/me/heartbeat/route.ts");
  assert.equal(count(writes, route), 1);
  // ...and that one write is the fallback: the route checks in through the
  // function first (heartbeat-route.test.ts runs it). An old route that only
  // stamps passes the count above and fails here.
  assert.ok(route.includes('rpc("usage_touch", {'), "the route calls usage_touch");
  assert.ok(route.indexOf('rpc("usage_touch"') < route.indexOf(`${column}:`), "the function before the fallback");
  assert.ok(route.includes("if (!isMissingFunction(error)) {"), "the fallback only while the function is missing");
  // The new files never name the column at all, not even in a note.
  for (const file of [
    "src/lib/usage/touch.ts",
    "src/lib/usage/touch-client.ts",
    "src/components/usage/ActivityTouch.tsx",
    "public/html/_usageTouch.js",
  ]) {
    assert.equal(readRoot(file).includes(column), false, file);
  }
});
