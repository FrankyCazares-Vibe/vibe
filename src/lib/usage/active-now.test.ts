/**
 * Tests for "active now" from 5 up (`active-now.ts`, Franky, Oct 14 2026):
 * the route's floor, the header line, and that the route and the campus
 * header use them. The database's floor (users_active_count,
 * 20261014150000) is checked in tally-migration.test.ts against the same
 * ACTIVE_NOW_MIN.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/usage/active-now.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spec = "./active-now.ts";
const { ACTIVE_NOW_MIN, activeNowShown, campusStatsLine, floorActiveNow } = (await import(spec)) as typeof import("./active-now");
type CampusStats = import("./active-now").CampusStats;

const readRoot = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");

const stats = (over: Partial<CampusStats> = {}): CampusStats => ({
  totalUsers: 40,
  activeNow: 9,
  campusUsers: 12,
  campusActiveNow: 6,
  campusId: "iu-indianapolis",
  ...over,
});

test("the line is 5", () => {
  assert.equal(ACTIVE_NOW_MIN, 5);
});

test("floorActiveNow: under 5 is 0 (not shown), 5 and up is the count, not a count is 0", () => {
  for (const n of [0, 1, 2, 3, 4, 4.9]) assert.equal(floorActiveNow(n), 0, String(n));
  for (const n of [5, 6, 12, 1500]) assert.equal(floorActiveNow(n), n, String(n));
  for (const n of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -3]) {
    assert.equal(floorActiveNow(n), 0, String(n));
  }
});

test("activeNowShown: null under 5, the count from 5 up", () => {
  for (const n of [0, 1, 4, null, undefined]) assert.equal(activeNowShown(n), null, String(n));
  assert.equal(activeNowShown(5), 5);
  assert.equal(activeNowShown(23), 23);
});

test("the campus line: '{n} at {campus}', with ' · {m} active now' only from 5 up", () => {
  const at = (campusActiveNow: number | null) =>
    campusStatsLine(stats({ campusActiveNow }), "Indianapolis", "iu-indianapolis");
  assert.equal(at(6), "12 at Indianapolis · 6 active now");
  assert.equal(at(5), "12 at Indianapolis · 5 active now");
  // 0 from the floored route; 1 to 4 from a route before the floor.
  for (const n of [0, 1, 2, 3, 4, null]) assert.equal(at(n), "12 at Indianapolis", String(n));
});

test("the everyone line: '{total} on Vibe', with ' · {m} active now' only from 5 up", () => {
  const all = (activeNow: number) => campusStatsLine(stats({ activeNow }), null, null);
  assert.equal(all(9), "40 on Vibe · 9 active now");
  for (const n of [0, 1, 4]) assert.equal(all(n), "40 on Vibe", String(n));
  // A count of another campus (or none) is never printed under this one's name.
  assert.equal(campusStatsLine(stats({ campusId: "iu-bloomington" }), "Indianapolis", "iu-indianapolis"), "40 on Vibe · 9 active now");
  assert.equal(campusStatsLine(stats({ campusUsers: null, activeNow: 2 }), "Indianapolis", "iu-indianapolis"), "40 on Vibe");
  assert.equal(campusStatsLine(null, "Indianapolis", "iu-indianapolis"), "");
});

test("never '0 active now', nor any count under 5", () => {
  for (let n = 0; n < ACTIVE_NOW_MIN; n += 1) {
    for (const line of [
      campusStatsLine(stats({ campusActiveNow: n, activeNow: n }), "Indianapolis", "iu-indianapolis"),
      campusStatsLine(stats({ campusActiveNow: n, activeNow: n }), null, null),
    ]) {
      assert.equal(/active now/.test(line), false, line);
    }
  }
});

test("the route floors both ways of counting, and the campus header uses the shared line", () => {
  const route = readRoot("src/app/api/stats/campus/route.ts");
  assert.ok(route.includes('import { floorActiveNow } from "@/lib/usage/active-now";'));
  assert.ok(route.includes('floorActiveNow(typeof data === "number" ? data : Number(data ?? 0))'));
  assert.ok(route.includes("floorActiveNow(old.count)"));
  assert.ok(route.includes("campusActiveNow: communityRes ? (communityRes[1].count ?? 0) : null"));

  const home = readRoot("src/app/campus/campus-home.tsx");
  assert.ok(home.includes('import { campusStatsLine, type CampusStats } from "@/lib/usage/active-now";'));
  assert.ok(home.includes("campusStatsLine(stats, label, campus?.id ?? null)"));
  // No second place builds the line by hand (a template ending "} active now").
  assert.equal(/\$\{[^}]*\} active now/.test(home), false);
  assert.equal(/bannerStatsLine/.test(home), false);
});
