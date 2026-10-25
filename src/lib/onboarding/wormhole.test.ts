/**
 * Otto's wormhole (Oct 25 2026): the colour the screen turns into on the way
 * out, and how both onboardings use the engine. The pages are read as text,
 * like the other page checks here; the engine's springs are pinned in
 * spring-curve.test.ts.
 *
 * Run with:
 *   node --test src/lib/onboarding/wormhole.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A URL import, so node loads the .ts file without a resolve hook.
const { appColour } = (await import(new URL("./wormhole.ts", import.meta.url).href)) as typeof import("./wormhole");

const read = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");

const css = read("src/app/globals.css");
const phone = read("src/components/mobile/OnboardingMobile.tsx");
const computer = read("public/html/onboarding.html");
const engine = read("public/html/_otto-wormhole.js");

test("the leave lands in the app's own page colour, Light and Night", () => {
  assert.equal(appColour("light"), "#FAF7F2");
  assert.equal(appColour(undefined), "#FAF7F2");
  assert.equal(appColour("dark"), "#0C0B0B");
  assert.match(css, /--cream: #FAF7F2;/);
  assert.match(css, /--cream: #0C0B0B;/);
  // The computer page answers the same.
  assert.match(computer, /=== 'dark' \? '#0C0B0B' : '#FAF7F2'/);
});

test("the phone holds step 1 while Otto arrives, and lets go whatever happens", () => {
  assert.match(phone, /useState<"hold" \| "rise" \| null>\(\(\) => \(boot\.step === 1 \? "hold" : null\)\)/);
  assert.match(phone, /data-onb-arrive=\{arrive \?\? undefined\}/);
  assert.match(phone, /onReveal: endHold/);
  // No script: show the page; the last resort lets go after 4s.
  assert.match(phone, /if \(!wormhole\) \{\s*endHold\(\);/);
  assert.match(phone, /arrive === "hold" \? 4000 : 1000/);
  // Held parts can't be tapped or focused.
  assert.match(phone, /\.onb-owh-line \{ visibility: hidden; \}/);
});

test("Finish leaves through Otto on both devices, with the old warp as the fallback", () => {
  assert.equal(phone.match(/leaveThroughOtto\("\/campus"\)|leaveThroughOtto\(dest\)/g)?.length, 2);
  assert.match(phone, /if \(!wormhole\) return warp\(\);/);
  assert.match(phone, /if \(leavingRef\.current\) return;/);
  assert.equal(computer.match(/leaveForApp\(/g)?.length, 3, "succeed, the replay Finish, and its definition");
  assert.match(computer, /<script src="\/html\/_otto-wormhole\.js"><\/script>/);
  // The computer's last resort, set before anything else runs.
  assert.match(computer, /classList\.add\('owh-arriving'\);setTimeout\(function\(\)\{document\.body\.classList\.remove\('owh-arriving'\);\},4000\);/);
});

test("Otto scrolled out of sight (Finish at the bottom of a long step) leaves from mid-screen", () => {
  assert.match(engine, /if \(x >= 0 && x <= vw && y >= 0 && y <= vh\) return/);
  assert.match(engine, /moved: true/);
  assert.match(engine, /orb\.classList\.add\(at\.moved \? 'on' : 'hold'\)/);
});
