/**
 * Otto's Stats card wording and window (src/lib/otto/stats.ts, Nov 10, 2026,
 * the Otto build's Wave 2A): the same 30 days creator-stats counts, honest
 * words (once a day per person, own opens left out, never who), no claim that
 * Otto did anything, and a body that doesn't check out is "couldn't count",
 * never 0.
 *
 * Run with:
 *   node --test src/lib/otto/stats.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// A URL import, so node loads the .ts file without a resolve hook.
const S = (await import(new URL("./stats.ts", import.meta.url).href)) as typeof import("./stats");
const {
  STATS_DAYS,
  countViewsSince,
  isStatsClubParam,
  parseStats,
  rangeLabel,
  shortDay,
  statsWindow,
  viewsCounts,
  viewsSub,
  viewsWhat,
} = S;

const NOW = new Date("2026-11-10T15:00:00Z");
const CLUB = { name: "Canal Run Club", handle: "canalrun" };

test("the window is creator-stats' 30 days, as ledger dates", () => {
  assert.equal(STATS_DAYS, 30);
  assert.deepEqual(statsWindow(NOW), { since: "2026-10-11", until: "2026-11-10" });
  // creator-stats: new Date(now - 30 days).toISOString().slice(0, 10)
  assert.equal(statsWindow(NOW).since, new Date(NOW.getTime() - 30 * 86400000).toISOString().slice(0, 10));
});

test("rows count from the first day of the window, inclusive", () => {
  const rows = [{ viewed_on: "2026-10-10" }, { viewed_on: "2026-10-11" }, { viewed_on: "2026-11-10" }];
  assert.equal(countViewsSince(rows, "2026-10-11"), 2);
  assert.equal(countViewsSince([], "2026-10-11"), 0);
});

test("dates read as short days and a range", () => {
  assert.equal(shortDay("2026-10-11"), "Oct 11");
  assert.equal(shortDay("2026-01-05"), "Jan 5");
  assert.equal(shortDay("2026-13-05"), "");
  assert.equal(shortDay("nope"), "");
  assert.equal(rangeLabel("2026-10-11", "2026-11-10"), "Oct 11 to Nov 10");
  assert.equal(rangeLabel("bad", "2026-11-10"), "");
});

test("whose posts, singular and plural", () => {
  assert.equal(viewsWhat(null, 12), "views on your posts");
  assert.equal(viewsWhat(null, 1), "view on your posts");
  assert.equal(viewsWhat(CLUB, 0), "views on Canal Run Club’s posts");
  assert.equal(viewsSub(1), "Last 30 days · across 1 post");
  assert.equal(viewsSub(4), "Last 30 days · across 4 posts");
});

test("the counts line is honest: once a day per person, own opens out, never who", () => {
  for (const line of [viewsCounts(null), viewsCounts(CLUB)]) {
    assert.match(line, /once a day/);
    assert.match(line, /own opens are left out/);
    assert.match(line, /never who/);
    // The ledger dedupes, so "every open" would overcount the claim.
    assert.doesNotMatch(line, /every open|counts twice/i);
  }
});

test("stats.ts stays pure: no imports", () => {
  assert.doesNotMatch(readFileSync(new URL("./stats.ts", import.meta.url), "utf8"), /^import\s/m);
});

test("nothing on the card says Otto did, sent or drafted anything", () => {
  const src = readFileSync(new URL("./stats.ts", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const card = readFileSync(new URL("../../components/otto/OttoMetrics.tsx", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
    "",
  );
  for (const text of [src, card]) {
    assert.doesNotMatch(text, /otto (did|sent|drafted|will)|things otto/i);
    assert.doesNotMatch(text, /view_count/);
  }
  // Exact numbers on this card, never "1.2k".
  assert.doesNotMatch(card, /fmtCount/);
});

test("a body that doesn't check out is null, never zeros", () => {
  const ok = { ok: true, views: 3, posts: 2, since: "2026-10-11", until: "2026-11-10", club: null };
  assert.deepEqual(parseStats(ok), { views: 3, posts: 2, since: "2026-10-11", until: "2026-11-10", club: null });
  assert.deepEqual(parseStats({ ...ok, club: CLUB })?.club, CLUB);
  assert.equal(parseStats(null), null);
  assert.equal(parseStats({ ...ok, views: undefined }), null);
  assert.equal(parseStats({ ...ok, views: -1 }), null);
  assert.equal(parseStats({ ...ok, views: 1.5 }), null);
  assert.equal(parseStats({ ...ok, since: 5 }), null);
  assert.equal(parseStats({ ...ok, club: { name: "x" } }), null);
});

test("?club= takes a plain handle only", () => {
  assert.equal(isStatsClubParam("canalrun"), true);
  assert.equal(isStatsClubParam("canal.run_club-2"), true);
  assert.equal(isStatsClubParam(null), false);
  assert.equal(isStatsClubParam(""), false);
  assert.equal(isStatsClubParam("a,b"), false);
  assert.equal(isStatsClubParam("x)or(id.eq.1"), false);
  assert.equal(isStatsClubParam("Caps"), false);
});

test("the route reads views from the honest ledger and checks the club role first", () => {
  const route = readFileSync(new URL("../../app/api/me/otto/stats/route.ts", import.meta.url), "utf8");
  assert.match(route, /loadHonestViewRows/);
  assert.doesNotMatch(route.replace(/\/\*[\s\S]*?\*\//g, ""), /view_count/);
  const role = route.indexOf('.in("role", ["owner", "admin"])');
  const clubPosts = route.indexOf('.eq("org_id", org.id)\n      .eq("type", "post")');
  assert.ok(role > 0 && clubPosts > role, "the officer check comes before the club's posts are read");
  // Not an officer reads the same as no such club.
  assert.equal(route.split('fail(404, "not_found", "Not found")').length - 1, 2);
});
