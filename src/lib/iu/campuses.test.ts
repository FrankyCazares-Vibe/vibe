/**
 * Tests for the campus model (`campuses.ts`) and scope V2 (`campus-scope.ts`).
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/iu/campuses.test.ts
 *
 * WHY THE RESOLVE HOOK: Node's type stripping doesn't add file extensions,
 * but these modules import each other extensionless ("./campuses"), which is
 * what Next's bundler and tsc's `moduleResolution: "bundler"` expect. (That's
 * why `parse-reminder.test.ts` fails with ERR_MODULE_NOT_FOUND on Node 25.)
 * An in-thread resolve hook retries a failed relative specifier with ".ts".
 * The modules under test then load through dynamic `import()`, so the hook is
 * registered first (static imports would be hoisted above it). tsc still
 * type-checks those imports normally.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { readFileSync } from "node:fs";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("campuses.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const {
  CAMPUSES,
  IU_CAMPUSES,
  SCHOOL_SYSTEMS,
  SYSTEM_LABEL,
  allowedCampusId,
  campusBadgeFor,
  campusBadgeLabel,
  campusById,
  campusByLabel,
  campusIdFromLegacyLabel,
  campusPickerSub,
  campusRowById,
  campusesForSystem,
  isCampusAllowed,
  isSchoolSystem,
  isSharedCampus,
  legacyLabel,
  normalizeCampusLabel,
  sharedWithCopy,
} = await import("./campuses");
const { allowedCampusIdsFor, campusOrFilter, resolveCampusScope, resolveScopeV2, scopeCampusIds } =
  await import("./campus-scope");

const ids = (list: readonly { id: string }[]) => list.map((c) => c.id);

// ── Wave 1 acceptance (plan §6) ────────────────────────────────────────────

test("acceptance: Indianapolis heads the Purdue list", () => {
  assert.equal(campusesForSystem("purdue")[0].id, "indianapolis");
});

test("acceptance: a Purdue-only campus isn't allowed for IU", () => {
  assert.equal(isCampusAllowed("purdue-west-lafayette", "iu"), false);
});

test("acceptance: shared badge says Purdue Indianapolis", () => {
  assert.equal(campusBadgeFor("indianapolis", "purdue"), "Purdue Indianapolis");
});

test("acceptance: verified Purdue with no campus", () => {
  assert.equal(campusBadgeFor(null, "purdue"), "Purdue verified");
});

test("acceptance: legacy IU Indianapolis label", () => {
  assert.equal(campusIdFromLegacyLabel("IU Indianapolis"), "indianapolis");
});

// ── Seed shape (plan §2.3, Fort Wayne shared per Franky's Q4) ──────────────

test("seed: the 11 expected campuses, valid ids, IU Online dropped, IU Columbus added", () => {
  assert.deepEqual([...ids(CAMPUSES)].sort(), [
    "fort-wayne",
    "indianapolis",
    "iu-bloomington",
    "iu-columbus",
    "iu-east",
    "iu-kokomo",
    "iu-northwest",
    "iu-south-bend",
    "iu-southeast",
    "purdue-northwest",
    "purdue-west-lafayette",
  ]);
  for (const c of CAMPUSES) {
    assert.match(c.id, /^[a-z0-9-]{2,40}$/, c.id); // M1's CHECK
    assert.ok(c.systems.length >= 1 && c.systems.length <= 2, c.id);
    assert.ok(c.systems.every(isSchoolSystem), c.id);
    assert.equal(campusRowById(c.id), c);
  }
  assert.equal(campusRowById("online"), null);
});

test("seed: Indianapolis and Fort Wayne are shared; only Indianapolis is open", () => {
  assert.deepEqual(ids(CAMPUSES.filter(isSharedCampus)), ["indianapolis", "fort-wayne"]);
  assert.deepEqual(ids(CAMPUSES.filter((c) => c.isOpen)), ["indianapolis"]);
  assert.deepEqual(campusRowById("fort-wayne"), {
    id: "fort-wayne",
    name: "Fort Wayne",
    shortName: "Fort Wayne",
    city: "Fort Wayne",
    systems: ["iu", "purdue"],
    isOpen: false,
    sort: 10,
  });
  // The split ids from before Q4 was answered are gone.
  assert.equal(campusRowById("iu-fort-wayne"), null);
  assert.equal(campusRowById("purdue-fort-wayne"), null);
});

test("seed: CAMPUSES mirrors the M1 migration's INSERT row for row", () => {
  const sql = readFileSync(
    new URL("../../../supabase/migrations/20260916100000_campuses_school_system.sql", import.meta.url),
    "utf8",
  );
  const insert = /insert into public\.campuses\s*\(id, name, short_name, city, systems, is_open, sort\)\s*values([\s\S]*?);/i.exec(sql);
  assert.ok(insert, "campuses INSERT not found in the M1 migration");
  const row = /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'\{([^}]*)\}'\s*,\s*(true|false)\s*,\s*(-?\d+)\s*\)/g;
  const seeded = [...insert[1].matchAll(row)].map((m) => ({
    id: m[1],
    name: m[2],
    shortName: m[3],
    city: m[4],
    systems: m[5].split(",").map((s) => s.trim()),
    isOpen: m[6] === "true",
    sort: Number(m[7]),
  }));
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  assert.deepEqual(
    seeded.sort(byId),
    CAMPUSES.map((c) => ({ ...c, systems: [...c.systems] })).sort(byId),
  );
});

test("seed: names and badge labels are unique, so labels map back unambiguously", () => {
  const byText = new Map<string, string>();
  for (const c of CAMPUSES) {
    for (const text of new Set([c.name, ...c.systems.map((s) => legacyLabel(c.id, s))])) {
      const prev = byText.get(text.toLowerCase());
      assert.ok(prev === undefined || prev === c.id, `"${text}" used by ${prev} and ${c.id}`);
      byText.set(text.toLowerCase(), c.id);
    }
  }
});

test("seed: rows and the table are frozen; lists are fresh arrays", () => {
  assert.ok(Object.isFrozen(CAMPUSES));
  for (const c of CAMPUSES) {
    assert.ok(Object.isFrozen(c) && Object.isFrozen(c.systems), c.id);
  }
  const a = campusesForSystem("iu");
  a.pop();
  assert.equal(campusesForSystem("iu").length, 9);
  assert.deepEqual(SCHOOL_SYSTEMS, ["iu", "purdue"]);
  assert.deepEqual(SYSTEM_LABEL, { iu: "IU", purdue: "Purdue" });
});

// ── Allowed sets ───────────────────────────────────────────────────────────

test("campusesForSystem: picker order, shared first (Indianapolis, then Fort Wayne)", () => {
  assert.deepEqual(ids(campusesForSystem("iu")), [
    "indianapolis",
    "fort-wayne",
    "iu-bloomington",
    "iu-columbus",
    "iu-east",
    "iu-kokomo",
    "iu-northwest",
    "iu-south-bend",
    "iu-southeast",
  ]);
  assert.deepEqual(ids(campusesForSystem("purdue")), [
    "indianapolis",
    "fort-wayne",
    "purdue-west-lafayette",
    "purdue-northwest",
  ]);
  assert.deepEqual(campusesForSystem("harvard" as never), []);
});

test("isCampusAllowed / allowedCampusId", () => {
  assert.equal(isCampusAllowed("indianapolis", "iu"), true);
  assert.equal(isCampusAllowed("indianapolis", "purdue"), true);
  assert.equal(isCampusAllowed("purdue-west-lafayette", "purdue"), true);
  assert.equal(isCampusAllowed("iu-bloomington", "purdue"), false);
  assert.equal(isCampusAllowed("fort-wayne", "iu"), true);
  assert.equal(isCampusAllowed("fort-wayne", "purdue"), true);
  assert.equal(isCampusAllowed("purdue-northwest", "iu"), false);
  assert.equal(isCampusAllowed("iu-fort-wayne", "iu"), false); // pre-Q4 split id
  assert.equal(allowedCampusId(" Fort-Wayne ", "purdue"), "fort-wayne");
  assert.equal(isCampusAllowed("indianapolis", null), false); // unverified picks nothing
  assert.equal(isCampusAllowed(null, "iu"), false);
  assert.equal(isCampusAllowed("bloomington", "iu"), false); // legacy id isn't a campus id
  assert.equal(allowedCampusId("  IU-Kokomo ", "iu"), "iu-kokomo"); // canonical id to store
  assert.equal(allowedCampusId(42, "iu"), null);
  assert.equal(allowedCampusId("indianapolis", "IU" as never), null);
});

// ── Badges (plan §2.5) ─────────────────────────────────────────────────────

test("campusBadgeFor: every §2.5 case", () => {
  assert.equal(campusBadgeFor("indianapolis", "iu"), "IU Indianapolis");
  assert.equal(campusBadgeFor("iu-bloomington", "iu"), "IU Bloomington");
  assert.equal(campusBadgeFor("purdue-west-lafayette", "purdue"), "Purdue West Lafayette");
  assert.equal(campusBadgeFor("fort-wayne", "iu"), "IU Fort Wayne");
  assert.equal(campusBadgeFor("fort-wayne", "purdue"), "Purdue Fort Wayne");
  assert.equal(campusBadgeFor("purdue-fort-wayne", "purdue"), "Purdue verified"); // pre-Q4 split id
  assert.equal(campusBadgeFor(null, "iu"), "IU verified");
  assert.equal(campusBadgeFor("nowhere", "iu"), "IU verified");
  // A campus outside the system never produces the other university's badge.
  assert.equal(campusBadgeFor("purdue-west-lafayette", "iu"), "IU verified");
  assert.equal(campusBadgeFor("indianapolis", null), null); // unverified: no badge
  assert.equal(campusBadgeFor(null, undefined), null);
});

// ── Legacy labels ──────────────────────────────────────────────────────────

test("campusIdFromLegacyLabel: every label and id IU_CAMPUSES can produce", () => {
  const expected: Record<string, string | null> = {
    "IU Indianapolis": "indianapolis",
    "IU Bloomington": "iu-bloomington",
    "IU East": "iu-east",
    "IU Fort Wayne": "fort-wayne",
    "IU Kokomo": "iu-kokomo",
    "IU Northwest": "iu-northwest",
    "IU South Bend": "iu-south-bend",
    "IU Southeast": "iu-southeast",
    "IU Online": null,
  };
  assert.deepEqual(Object.keys(expected).sort(), IU_CAMPUSES.map((c) => c.label).sort());
  for (const old of IU_CAMPUSES) {
    const want = expected[old.label];
    assert.equal(campusIdFromLegacyLabel(old.label), want, old.label);
    assert.equal(campusIdFromLegacyLabel(old.id), want, old.id); // what normalizeCampusLabel accepted
    assert.equal(campusIdFromLegacyLabel(`  ${old.label.toUpperCase()} `), want, "casing/whitespace");
    if (want) assert.ok(isCampusAllowed(want, "iu"), `${want} must be an IU campus`);
  }
});

test("campusIdFromLegacyLabel: model labels, new ids, junk", () => {
  assert.equal(campusIdFromLegacyLabel("Purdue Indianapolis"), "indianapolis");
  assert.equal(campusIdFromLegacyLabel("purdue west lafayette"), "purdue-west-lafayette");
  assert.equal(campusIdFromLegacyLabel("IU Columbus"), "iu-columbus");
  assert.equal(campusIdFromLegacyLabel("Indianapolis"), "indianapolis");
  assert.equal(campusIdFromLegacyLabel("purdue-northwest"), "purdue-northwest");
  assert.equal(campusIdFromLegacyLabel("northwest"), "iu-northwest"); // legacy id wins
  assert.equal(campusIdFromLegacyLabel("Purdue Fort Wayne"), "fort-wayne");
  assert.equal(campusIdFromLegacyLabel("Fort Wayne"), "fort-wayne");
  assert.equal(campusIdFromLegacyLabel("fort-wayne"), "fort-wayne");
  assert.equal(campusIdFromLegacyLabel("iu-fort-wayne"), null); // pre-Q4 split ids never shipped
  assert.equal(campusIdFromLegacyLabel("purdue-fort-wayne"), null);
  assert.equal(campusIdFromLegacyLabel(""), null);
  assert.equal(campusIdFromLegacyLabel("iu.edu"), null);
  assert.equal(campusIdFromLegacyLabel("constructor"), null);
  assert.equal(campusIdFromLegacyLabel(null), null);
});

test("legacyLabel: IU dual-write is exactly the old label, so old readers still work", () => {
  for (const old of IU_CAMPUSES) {
    const id = campusIdFromLegacyLabel(old.label);
    if (!id) continue; // IU Online
    const label = legacyLabel(id, "iu");
    assert.equal(label, old.label);
    assert.equal(campusByLabel(label)?.id, old.id);
    assert.equal(campusBadgeLabel(label), old.label);
    assert.equal(normalizeCampusLabel(label), old.label);
  }
  assert.equal(legacyLabel("iu-columbus", "iu"), "IU Columbus");
  // Fort Wayne dual-writes exactly the old IU label too.
  assert.equal(legacyLabel("fort-wayne", "iu"), "IU Fort Wayne");
  assert.equal(campusByLabel(legacyLabel("fort-wayne", "iu"))?.id, "fort-wayne");
});

test("legacyLabel: Purdue values, invalid pairs, and the round trip", () => {
  assert.equal(legacyLabel("indianapolis", "purdue"), "Purdue Indianapolis");
  assert.equal(legacyLabel("purdue-west-lafayette", "purdue"), "Purdue West Lafayette");
  assert.equal(legacyLabel("fort-wayne", "purdue"), "Purdue Fort Wayne");
  assert.equal(legacyLabel("iu-bloomington", "purdue"), "");
  assert.equal(legacyLabel("nowhere", "iu"), "");
  assert.equal(legacyLabel("indianapolis", null), "");
  // Old readers see Purdue labels as "no campus" (documented trade-off).
  assert.equal(campusByLabel(legacyLabel("indianapolis", "purdue")), null);
  for (const s of SCHOOL_SYSTEMS) {
    for (const c of campusesForSystem(s)) {
      assert.equal(campusIdFromLegacyLabel(legacyLabel(c.id, s)), c.id, `${c.id}/${s}`);
      assert.equal(legacyLabel(c.id, s), campusBadgeFor(c.id, s), `${c.id}/${s} label = badge`);
    }
  }
});

// ── Picker copy (plan §3.5) ────────────────────────────────────────────────

test("sharedWithCopy / campusPickerSub", () => {
  const indy = campusRowById("indianapolis")!;
  const bloom = campusRowById("iu-bloomington")!;
  assert.equal(
    sharedWithCopy(indy, "iu"),
    "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)",
  );
  assert.equal(
    sharedWithCopy(indy, "purdue"),
    "Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)",
  );
  assert.equal(sharedWithCopy(bloom, "iu"), null);
  assert.equal(sharedWithCopy(bloom, "purdue"), null);
  // Fort Wayne gets the generic shared copy, without "formerly".
  const fortWayne = campusRowById("fort-wayne")!;
  assert.equal(sharedWithCopy(fortWayne, "iu"), "IU Fort Wayne · one community with Purdue Fort Wayne");
  assert.equal(sharedWithCopy(fortWayne, "purdue"), "Purdue Fort Wayne · one community with IU Fort Wayne");
  assert.equal(campusPickerSub(fortWayne, "purdue"), "Purdue Fort Wayne · one community with IU Fort Wayne");
  assert.equal(campusPickerSub(bloom, "iu"), "IU Bloomington");
  assert.equal(campusPickerSub(indy, "purdue"), sharedWithCopy(indy, "purdue"));
});

// ── Legacy exports unchanged (critic A1) ───────────────────────────────────

test("legacy exports keep their shapes and behaviour", () => {
  assert.equal(IU_CAMPUSES.length, 9);
  assert.deepEqual(campusById("fort-wayne"), {
    id: "fort-wayne",
    label: "IU Fort Wayne",
    shortLabel: "Fort Wayne",
    city: "Fort Wayne",
  });
  assert.equal(normalizeCampusLabel("bloomington"), "IU Bloomington");
  assert.equal(normalizeCampusLabel("iu-bloomington"), null);
  assert.equal(campusBadgeLabel(null), "IU verified");
  assert.deepEqual(resolveCampusScope(null, "IU Indianapolis"), {
    ok: true,
    scope: "indianapolis",
    campusLabel: "IU Indianapolis",
    viewerCampus: "IU Indianapolis",
    explicit: false,
  });
  assert.deepEqual(resolveCampusScope("nowhere", null), {
    ok: false,
    error: 'Unknown campus "nowhere"',
    viewerCampus: null,
  });
  assert.equal(campusOrFilter("school", "IU Kokomo"), 'school.eq."IU Kokomo",school.eq."",school.is.null');
});

// ── resolveScopeV2 ─────────────────────────────────────────────────────────

const IU_INDY = { campusId: "indianapolis", system: "iu" } as const;
const PURDUE_WL = { campusId: "purdue-west-lafayette", system: "purdue" } as const;

test("scope: no param → home campus", () => {
  assert.deepEqual(resolveScopeV2(null, IU_INDY), { kind: "campus", campusId: "indianapolis" });
  assert.deepEqual(resolveScopeV2("  ", PURDUE_WL), { kind: "campus", campusId: "purdue-west-lafayette" });
});

test("scope: explicit campus inside the allowed set", () => {
  assert.deepEqual(resolveScopeV2("iu-kokomo", IU_INDY), { kind: "campus", campusId: "iu-kokomo" });
  assert.deepEqual(resolveScopeV2(" Indianapolis ", PURDUE_WL), { kind: "campus", campusId: "indianapolis" });
  assert.deepEqual(resolveScopeV2("fort-wayne", IU_INDY), { kind: "campus", campusId: "fort-wayne" });
  assert.deepEqual(resolveScopeV2("fort-wayne", PURDUE_WL), { kind: "campus", campusId: "fort-wayne" });
});

test("scope: forbidden when the campus is outside the allowed set", () => {
  assert.deepEqual(resolveScopeV2("purdue-west-lafayette", IU_INDY), {
    kind: "forbidden",
    reason: "campus_not_in_system",
  });
  assert.deepEqual(resolveScopeV2("iu-kokomo", PURDUE_WL), {
    kind: "forbidden",
    reason: "campus_not_in_system",
  });
});

test("scope: forbidden for unknown ids, legacy ids and labels", () => {
  for (const raw of ["nowhere", "bloomington", "iu-fort-wayne", "purdue-fort-wayne", "IU Indianapolis"]) {
    assert.deepEqual(resolveScopeV2(raw, IU_INDY), { kind: "forbidden", reason: "unknown_campus" }, raw);
  }
});

test('scope: "all" → every campus in the viewer\'s system', () => {
  assert.deepEqual(resolveScopeV2("all", IU_INDY), { kind: "system", campusIds: ids(campusesForSystem("iu")) });
  assert.deepEqual(resolveScopeV2(" ALL ", PURDUE_WL), {
    kind: "system",
    campusIds: ["indianapolis", "fort-wayne", "purdue-west-lafayette", "purdue-northwest"],
  });
});

test("scope: no home campus → none = the allowed set (critic A7)", () => {
  assert.deepEqual(resolveScopeV2(null, { campusId: null, system: "purdue" }), {
    kind: "none",
    campusIds: ids(campusesForSystem("purdue")),
  });
  // A home outside the system (trigger bypass) isn't trusted.
  assert.deepEqual(resolveScopeV2(undefined, { campusId: "iu-bloomington", system: "purdue" }), {
    kind: "none",
    campusIds: ids(campusesForSystem("purdue")),
  });
  assert.deepEqual(resolveScopeV2(null, { campusId: "not-a-campus", system: "iu" }), {
    kind: "none",
    campusIds: ids(campusesForSystem("iu")),
  });
});

test("scope: null system → every campus (documented straggler fallback)", () => {
  const every = ids(CAMPUSES);
  const viewer = { campusId: null, system: null };
  assert.deepEqual(allowedCampusIdsFor(null), every);
  assert.deepEqual(resolveScopeV2(null, viewer), { kind: "none", campusIds: every });
  assert.deepEqual(resolveScopeV2("all", viewer), { kind: "system", campusIds: every });
  assert.deepEqual(resolveScopeV2("purdue-west-lafayette", viewer), {
    kind: "campus",
    campusId: "purdue-west-lafayette",
  });
});

test("scope: scopeCampusIds, and results never share arrays", () => {
  assert.deepEqual(scopeCampusIds({ kind: "campus", campusId: "iu-east" }), ["iu-east"]);
  const first = resolveScopeV2("all", IU_INDY);
  assert.equal(first.kind, "system");
  if (first.kind !== "system") return;
  const list = scopeCampusIds(first);
  list.length = 0;
  first.campusIds.push("junk");
  const again = resolveScopeV2("all", IU_INDY);
  assert.ok(again.kind === "system" && again.campusIds.length === 9 && !again.campusIds.includes("junk"));
});
