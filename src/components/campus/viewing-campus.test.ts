/**
 * Tests for `viewing-campus.ts` (S67 wave 4, contracts C5): reading the viewed
 * campus off the URL, the one fetch helper both shells share, the page-URL
 * rewrite, the labels, the 45-day date on the home row and the "Look around."
 * picker's groups.
 *
 * Run with:
 *   node --test src/components/campus/viewing-campus.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `rolling-strip-view.test.ts` ("@/x" →
 * "src/x.ts", extensionless relative specifiers retried with ".ts"). The
 * module under test also holds `useViewingCampus`, so "react" and
 * "next/navigation" resolve to tiny data: stubs (as `handle-change.test.ts`
 * stubs the service client): only the pure helpers run here.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("viewing-campus.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS = new Map<string, string>([
  ["react", stub("export const useState = () => { throw new Error('stub'); }; export const useCallback = (f) => f;")],
  ["next/navigation", stub("export const useSearchParams = () => null;")],
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stubbed = STUBS.get(specifier);
    if (stubbed) return { url: stubbed, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
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

const vc = await import("./viewing-campus");
const {
  parseViewingCampus,
  withCampus,
  hrefWithViewing,
  isVisitingCampus,
  isOpenCampus,
  campusViewName,
  visitingEyebrow,
  visitingBannerText,
  visitingComposerNote,
  homeChangeDay,
  browsePickerGroups,
  VISITING_COPY,
  BROWSE_PICKER_INTRO,
  BROWSE_PICKER_FOOTER,
  NO_STUDENTS_YET,
} = vc;

const HOME = "indianapolis";
const BLOOM = "iu-bloomington";

test("parseViewingCampus: nothing named is home", () => {
  assert.deepEqual(parseViewingCampus("", HOME), { viewingId: HOME, isVisiting: false });
  assert.deepEqual(parseViewingCampus("?limit=5", HOME), { viewingId: HOME, isVisiting: false });
});

test("parseViewingCampus: another campus is visiting, with or without the '?'", () => {
  assert.deepEqual(parseViewingCampus(`?campus=${BLOOM}`, HOME), { viewingId: BLOOM, isVisiting: true });
  assert.deepEqual(parseViewingCampus(`campus=${BLOOM}`, HOME), { viewingId: BLOOM, isVisiting: true });
  assert.deepEqual(parseViewingCampus("?tab=events&campus=fort-wayne", HOME), {
    viewingId: "fort-wayne",
    isVisiting: true,
  });
});

test("parseViewingCampus: ids are canonicalised (case, spaces)", () => {
  assert.deepEqual(parseViewingCampus("?campus=%20IU-Bloomington%20", HOME), { viewingId: BLOOM, isVisiting: true });
});

test("parseViewingCampus: naming home, 'all' or junk is home", () => {
  assert.deepEqual(parseViewingCampus(`?campus=${HOME}`, HOME), { viewingId: HOME, isVisiting: false });
  assert.deepEqual(parseViewingCampus("?campus=all", HOME), { viewingId: HOME, isVisiting: false });
  assert.deepEqual(parseViewingCampus("?campus=bloomington", HOME), { viewingId: HOME, isVisiting: false });
  assert.deepEqual(parseViewingCampus("?campus=", HOME), { viewingId: HOME, isVisiting: false });
});

test("parseViewingCampus: unknown home — nothing named is null, a named campus reads visiting", () => {
  assert.deepEqual(parseViewingCampus("", null), { viewingId: null, isVisiting: false });
  assert.deepEqual(parseViewingCampus(`?campus=${BLOOM}`, null), { viewingId: BLOOM, isVisiting: true });
  assert.deepEqual(parseViewingCampus(`?campus=${BLOOM}`, "not-a-campus"), { viewingId: BLOOM, isVisiting: true });
});

test("isVisitingCampus", () => {
  assert.equal(isVisitingCampus(BLOOM, HOME), true);
  assert.equal(isVisitingCampus(HOME, HOME), false);
  assert.equal(isVisitingCampus(null, HOME), false);
  assert.equal(isVisitingCampus("junk", HOME), false);
});

test("withCampus: at home the url comes back untouched", () => {
  assert.equal(withCampus("/api/feed", null, HOME), "/api/feed");
  assert.equal(withCampus("/api/feed", HOME, HOME), "/api/feed");
  assert.equal(withCampus("/api/feed?limit=50", HOME, HOME), "/api/feed?limit=50");
  assert.equal(withCampus("/api/feed", null, null), "/api/feed");
  assert.equal(withCampus("/api/feed", "junk", HOME), "/api/feed");
});

test("withCampus: visiting adds ?campus= to a bare url", () => {
  assert.equal(withCampus("/api/campus-map", BLOOM, HOME), `/api/campus-map?campus=${BLOOM}`);
});

test("withCampus: visiting appends to a ?limit= url", () => {
  assert.equal(withCampus("/api/feed?limit=50", BLOOM, HOME), `/api/feed?limit=50&campus=${BLOOM}`);
  assert.equal(
    withCampus("/api/trending/hashtags?limit=8&days=7", "fort-wayne", HOME),
    "/api/trending/hashtags?limit=8&days=7&campus=fort-wayne",
  );
});

test("withCampus: a url that already names a campus gets it replaced, never doubled", () => {
  const out = withCampus("/api/events?campus=indianapolis&limit=50", BLOOM, HOME);
  assert.equal(out, `/api/events?campus=${BLOOM}&limit=50`);
  assert.equal(new URLSearchParams(out.split("?")[1]).getAll("campus").length, 1);
});

test("withCampus: canonicalises the id and works with no home", () => {
  assert.equal(withCampus("/api/feed", "IU-Bloomington", HOME), `/api/feed?campus=${BLOOM}`);
  assert.equal(withCampus("/api/feed", BLOOM, null), `/api/feed?campus=${BLOOM}`);
});

test("hrefWithViewing: sets or drops the param, keeps path, other params and hash", () => {
  assert.equal(hrefWithViewing("https://www.connectvibe.app/campus?tab=events#top", BLOOM), `/campus?tab=events&campus=${BLOOM}#top`);
  assert.equal(hrefWithViewing(`/campus?campus=${BLOOM}&tab=events`, null), "/campus?tab=events");
  assert.equal(hrefWithViewing(`/campus?campus=${BLOOM}`, null), "/campus");
});

test("isOpenCampus: only Indianapolis today", () => {
  assert.equal(isOpenCampus(HOME), true);
  assert.equal(isOpenCampus(BLOOM), false);
  assert.equal(isOpenCampus("fort-wayne"), false);
  assert.equal(isOpenCampus(null), false);
  assert.equal(isOpenCampus("junk"), false);
});

test("campusViewName: short names, full names for the two Northwests", () => {
  assert.equal(campusViewName(BLOOM), "Bloomington");
  assert.equal(campusViewName(HOME), "Indianapolis");
  assert.equal(campusViewName("purdue-west-lafayette"), "West Lafayette");
  assert.equal(campusViewName("iu-northwest"), "IU Northwest");
  assert.equal(campusViewName("purdue-northwest"), "Purdue Northwest");
  assert.equal(campusViewName("junk"), null);
});

test("visitingEyebrow: the viewed campus's university, then JUST LOOKING", () => {
  assert.equal(visitingEyebrow(BLOOM), "IU · JUST LOOKING");
  assert.equal(visitingEyebrow("purdue-west-lafayette"), "PURDUE · JUST LOOKING");
  assert.equal(visitingEyebrow("fort-wayne"), "IU + PURDUE · JUST LOOKING");
  assert.equal(visitingEyebrow(null), null);
});

test("visitingBannerText and visitingComposerNote", () => {
  assert.equal(visitingBannerText(BLOOM, HOME), "Viewing Bloomington · home is Indianapolis");
  assert.equal(visitingBannerText(BLOOM, null), "Viewing Bloomington");
  assert.equal(visitingBannerText(null, HOME), null);
  assert.equal(visitingComposerNote(HOME), "You're just looking. New posts go to Indianapolis.");
  assert.equal(visitingComposerNote(null), "You're just looking. New posts go to your home campus.");
});

test("copy matches contracts C5 word for word", () => {
  assert.equal(
    BROWSE_PICKER_INTRO,
    "Browse any campus. Follow people and message them anywhere. RSVPs work on your home campus and in clubs you're a member of.",
  );
  assert.equal(BROWSE_PICKER_FOOTER, "home stays home for 45 days after you pick it.");
  assert.equal(NO_STUDENTS_YET, "No students yet · still viewable");
  assert.deepEqual(
    { ...VISITING_COPY },
    {
      rsvpTitle: "RSVP works on your home campus",
      rsvpNote: "RSVP works at home",
      emptyFeed: "Nobody's posted here yet.",
      emptyEvents: "No events here yet.",
      emptyClubs: "No clubs here yet.",
    },
  );
});

const NOW = Date.parse("2026-09-27T15:00:00Z");

test("homeChangeDay: short month on Indiana's calendar; past, junk and null say nothing", () => {
  assert.equal(homeChangeDay("2026-11-09T17:00:00Z", NOW), "Nov 9");
  // 02:00 UTC on Nov 10 is still Nov 9 in Indianapolis.
  assert.equal(homeChangeDay("2026-11-10T02:00:00Z", NOW), "Nov 9");
  assert.equal(homeChangeDay("2026-09-01T00:00:00Z", NOW), null);
  assert.equal(homeChangeDay("not a date", NOW), null);
  assert.equal(homeChangeDay(null, NOW), null);
});

test("browsePickerGroups: Shared · IU · Purdue, all 11 campuses once", () => {
  const groups = browsePickerGroups({ homeId: HOME, now: NOW });
  assert.deepEqual(
    groups.map((g) => [g.key, g.label, g.rows.length]),
    [
      ["shared", "SHARED · IU + PURDUE", 2],
      ["iu", "IU", 7],
      ["purdue", "PURDUE", 2],
    ],
  );
  const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
  assert.equal(ids.length, 11);
  assert.equal(new Set(ids).size, 11);
  assert.deepEqual(groups[0].rows.map((r) => r.name), ["Indianapolis", "Fort Wayne"]);
  assert.deepEqual(
    groups[1].rows.map((r) => r.name),
    ["Bloomington", "Columbus", "East", "Kokomo", "Northwest", "South Bend", "Southeast"],
  );
  assert.deepEqual(groups[2].rows.map((r) => r.name), ["West Lafayette", "Northwest"]);
});

test("browsePickerGroups: full rows for shared, home and a big group's first; tiles for the rest", () => {
  const groups = browsePickerGroups({ homeId: HOME, now: NOW });
  const size = (id: string) => groups.flatMap((g) => g.rows).find((r) => r.id === id)?.size;
  assert.equal(size(HOME), "full");
  assert.equal(size("fort-wayne"), "full");
  assert.equal(size(BLOOM), "full");
  assert.equal(size("iu-kokomo"), "compact");
  assert.equal(size("purdue-west-lafayette"), "compact");
  // A home campus in a system group gets a full row too.
  const kokomoHome = browsePickerGroups({ homeId: "iu-kokomo", now: NOW }).flatMap((g) => g.rows);
  assert.equal(kokomoHome.find((r) => r.id === "iu-kokomo")?.size, "full");
});

test("browsePickerGroups: the home row's sub-line, with and without the date", () => {
  const withDate = browsePickerGroups({ homeId: HOME, homeChangeAvailableAt: "2026-11-09T17:00:00Z", now: NOW });
  const home = withDate[0].rows[0];
  assert.equal(home.isHome, true);
  assert.equal(home.sub, "Home · you can change it on Nov 9");
  const noDate = browsePickerGroups({ homeId: HOME, now: NOW });
  assert.equal(noDate[0].rows[0].sub, "Home");
  const lapsed = browsePickerGroups({ homeId: HOME, homeChangeAvailableAt: "2026-09-01T00:00:00Z", now: NOW });
  assert.equal(lapsed[0].rows[0].sub, "Home");
});

test("browsePickerGroups: counts — 0 reads 'No students yet', unknown or more says nothing", () => {
  const rows = browsePickerGroups({ homeId: HOME, counts: { [BLOOM]: 0, "fort-wayne": 12 }, now: NOW }).flatMap(
    (g) => g.rows,
  );
  assert.equal(rows.find((r) => r.id === BLOOM)?.sub, NO_STUDENTS_YET);
  assert.equal(rows.find((r) => r.id === "fort-wayne")?.sub, null);
  assert.equal(rows.find((r) => r.id === "iu-kokomo")?.sub, null);
  // Home keeps its own line even with a 0.
  const zeroHome = browsePickerGroups({ homeId: HOME, counts: { [HOME]: 0 }, now: NOW });
  assert.equal(zeroHome[0].rows[0].sub, "Home");
});

test("browsePickerGroups: the viewed campus is flagged; home never is", () => {
  const visiting = browsePickerGroups({ homeId: HOME, viewingId: BLOOM, now: NOW }).flatMap((g) => g.rows);
  assert.deepEqual(visiting.filter((r) => r.isViewing).map((r) => r.id), [BLOOM]);
  const atHome = browsePickerGroups({ homeId: HOME, viewingId: HOME, now: NOW }).flatMap((g) => g.rows);
  assert.equal(atHome.some((r) => r.isViewing), false);
  const noHome = browsePickerGroups({ homeId: null, now: NOW }).flatMap((g) => g.rows);
  assert.equal(noHome.some((r) => r.isHome), false);
});
