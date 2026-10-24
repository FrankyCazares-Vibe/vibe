/**
 * The phone's "Your clubs" band (YourClubsRow.tsx, Oct 24 2026): read as
 * text, like the other component checks here (the component imports React
 * and Next, which these tests don't load). Its data and its row view are the
 * desktop panel's and are tested in your-clubs-view.test.ts.
 *
 * Run with:
 *   node --test src/components/campus/tonight/your-clubs-row.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(new URL(`../../../../${file}`, import.meta.url), "utf8");

const row = read("src/components/campus/tonight/YourClubsRow.tsx");
const css = read("src/components/campus/tonight/your-clubs-phone.css");
const phone = read("src/components/mobile/CampusMobile.tsx");

test("the band says what the desktop panel says, and opens each club's Board", () => {
  for (const key of ["yourClubs", "seeAll", "noClubs", "findClubs", "boardEmpty"]) {
    assert.ok(row.includes(`TONIGHT_COPY.${key}`), key);
  }
  assert.match(row, /"\/messages\?channel=" \+ encodeURIComponent\(row\.room_id\)/);
  assert.match(row, /YOUR_CLUBS_MAX/);
});

test("both reads failed: nothing at all; loading: still tiles; empty: Find clubs on campus", () => {
  assert.match(row, /if \(state\.status === "error"\) return null;/);
  assert.match(row, /state\.status === "loading"/);
  assert.match(row, /onClick=\{onFindClubs\}/);
});

test("the Feed shows it above Tonight, and its empty state opens the Orgs tab", () => {
  const band = phone.indexOf("<YourClubsRow");
  const tonight = phone.indexOf("<TonightCard");
  assert.ok(band > 0 && tonight > band, "Your clubs sits above the Tonight card");
  assert.match(phone.slice(band, band + 300), /setTab\("orgs"\)/);
  assert.match(phone, /const yourClubs = useYourClubs\(\);/);
});

test("its stylesheet uses the theme's tokens only, so Night needs no twin", () => {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b/i, "no hex colours");
  assert.doesNotMatch(body, /rgba?\(/i, "no literal colours");
  assert.doesNotMatch(body, /transition|animation/, "motion comes from Reveal (the springs)");
});
