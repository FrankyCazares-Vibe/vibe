/**
 * Tests for `club-campus-bar.ts` (the Campus bar on a club page; Oct 22,
 * 2026): where its tab pills and its Campuses picker go, at home and while
 * visiting another campus.
 *
 * Run with:
 *   node --test "src/app/orgs/[handle]/club-page/club-campus-bar.test.ts"
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./club-campus-bar.ts";
const bar = (await import(specifier)) as typeof import("./club-campus-bar");
const { CLUB_CAMPUS_TABS, clubCampusPickHref, clubCampusTabHref } = bar;

/** The club page's own Back address (page.tsx `backHref`), for comparison. */
function pageBackHref(visitedCampusId: string | null): string {
  return visitedCampusId
    ? `/campus?${new URLSearchParams({ tab: "orgs", campus: visitedCampusId })}`
    : "/campus?tab=orgs";
}

test("the bar's five tabs, in Campus's order", () => {
  assert.deepEqual([...CLUB_CAMPUS_TABS], ["feed", "events", "orgs", "chat", "map"]);
});

test("at home every tab goes to its Campus tab, with no campus on it", () => {
  assert.equal(clubCampusTabHref("feed", null), "/campus?tab=feed");
  assert.equal(clubCampusTabHref("events", null), "/campus?tab=events");
  assert.equal(clubCampusTabHref("chat", null), "/campus?tab=chat");
  assert.equal(clubCampusTabHref("map", null), "/campus?tab=map");
});

test("Orgs goes back to the clubs list, exactly where the page's Back goes", () => {
  assert.equal(clubCampusTabHref("orgs", null), pageBackHref(null));
  assert.equal(clubCampusTabHref("orgs", "iu-bloomington"), pageBackHref("iu-bloomington"));
});

test("visiting, every tab keeps the campus the student was browsing", () => {
  for (const tab of CLUB_CAMPUS_TABS) {
    const href = clubCampusTabHref(tab, "iu-bloomington");
    const u = new URL(href, "http://x");
    assert.equal(u.pathname, "/campus", tab);
    assert.equal(u.searchParams.get("tab"), tab);
    assert.equal(u.searchParams.get("campus"), "iu-bloomington", tab);
  }
  assert.equal(clubCampusTabHref("events", "fort-wayne"), "/campus?tab=events&campus=fort-wayne");
});

test("an empty visited id counts as home", () => {
  assert.equal(clubCampusTabHref("feed", ""), "/campus?tab=feed");
});

test("the campus id is encoded, never pasted into the address raw", () => {
  const u = new URL(clubCampusTabHref("feed", "a&tab=map"), "http://x");
  assert.equal(u.searchParams.get("tab"), "feed");
  assert.equal(u.searchParams.get("campus"), "a&tab=map");
});

test("a tab nothing knows lands on the clubs list", () => {
  const unknown = "otto" as unknown as (typeof CLUB_CAMPUS_TABS)[number];
  assert.equal(clubCampusTabHref(unknown, null), "/campus?tab=orgs");
});

test("picking another campus opens its Orgs list", () => {
  assert.equal(
    clubCampusPickHref("iu-bloomington", "indianapolis"),
    "/campus?tab=orgs&campus=iu-bloomington",
  );
});

test("picking home goes to home's Orgs list and drops campus", () => {
  assert.equal(clubCampusPickHref("indianapolis", "indianapolis"), "/campus?tab=orgs");
});

test("with home not known yet, the campus picked is kept", () => {
  assert.equal(clubCampusPickHref("indianapolis", null), "/campus?tab=orgs&campus=indianapolis");
});

test("an unknown pick (canonicalised to null) goes home", () => {
  assert.equal(clubCampusPickHref(null, "indianapolis"), "/campus?tab=orgs");
  assert.equal(clubCampusPickHref(null, null), "/campus?tab=orgs");
});
