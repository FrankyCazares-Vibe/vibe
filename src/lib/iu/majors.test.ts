/**
 * Tests for the majors taxonomy: campus routing, the halo lookup, the legacy
 * exports, and that public/html/_iu-majors.js matches this module.
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/iu/majors.test.ts
 *
 * Regenerate public/html/_iu-majors.js from the TS source with:
 *   VIBE_REGEN_MAJORS=1 node --test --experimental-strip-types src/lib/iu/majors.test.ts
 *
 * Node's type stripping doesn't resolve extensionless specifiers
 * ("./majors-bloomington"), which the app code uses for Next's bundler. So
 * this file registers a tiny resolve hook that retries relative specifiers
 * with ".ts", then loads the module with a dynamic import (a static import
 * would be hoisted above the hook).
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

type NextResolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, next: NextResolve) => unknown;
  }) => void;
};
registerHooks?.({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/.test(specifier)) {
        return next(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const majors = await import("./majors");
const {
  IU_SCHOOLS,
  IU_MAJORS_BY_SCHOOL,
  MAJOR_TO_SCHOOL,
  majorsForCampus,
  schoolForMajor,
  schoolForMajorIn,
} = majors;

const STATIC_FILE = new URL("../../../public/html/_iu-majors.js", import.meta.url);

// ── Static mirror generation ────────────────────────────────────────────

function legacyForStatic() {
  return IU_MAJORS_BY_SCHOOL.map((g) => ({
    school: { id: g.school.id, shortLabel: g.school.shortLabel, label: g.school.label },
    majors: g.majors,
  }));
}

function listsForStatic() {
  return {
    iuIndianapolis: majorsForCampus("indianapolis", "iu"),
    purdueIndianapolis: majorsForCampus("indianapolis", "purdue"),
    iuBloomington: majorsForCampus("iu-bloomington", "iu"),
  };
}

function indent(json: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return json.split("\n").map((line, i) => (i === 0 ? line : pad + line)).join("\n");
}

function renderStaticFile(): string {
  return `// GENERATED from src/lib/iu/majors.ts (+ majors-purdue-indianapolis.ts and
// majors-bloomington.ts). Do not hand-edit: src/lib/iu/majors.test.ts fails
// when this file drifts. Regenerate with:
//   VIBE_REGEN_MAJORS=1 node --test --experimental-strip-types src/lib/iu/majors.test.ts
//
// window.IU_MAJORS_BY_SCHOOL
//   Legacy grouped IU Indianapolis list (the desktop profile editor's
//   <select>). Same shape as before.
// window.VIBE_MAJOR_LISTS
//   The curated lists: iuIndianapolis, purdueIndianapolis, iuBloomington.
//   Each is { label, schools, majors, groups }.
// window.vibeMajorsForCampus(campusId, system)
//   Same routing as majorsForCampus() in majors.ts: a fresh copy of the list,
//   or null (free text) when the campus has no curated list.
//
// Anything that doesn't match an option here is still accepted by the
// server; it just falls into the "Other" halo on the campus map.

(function () {
  if (window.IU_MAJORS_BY_SCHOOL) return;

  const LISTS = ${indent(JSON.stringify(listsForStatic(), null, 2), 2)};

  function copyList(list) {
    return JSON.parse(JSON.stringify(list));
  }

  window.IU_MAJORS_BY_SCHOOL = ${indent(JSON.stringify(legacyForStatic(), null, 2), 2)};

  window.VIBE_MAJOR_LISTS = LISTS;

  window.vibeMajorsForCampus = function (campusId, system) {
    const id = String(campusId == null ? "" : campusId).trim().toLowerCase();
    if (id === "indianapolis") {
      if (system === "iu") return copyList(LISTS.iuIndianapolis);
      if (system === "purdue") return copyList(LISTS.purdueIndianapolis);
      return null;
    }
    if (id === "iu-bloomington" && system === "iu") {
      return copyList(LISTS.iuBloomington);
    }
    return null;
  };
})();
`;
}

if (process.env.VIBE_REGEN_MAJORS === "1") {
  writeFileSync(STATIC_FILE, renderStaticFile());
}

// ── Legacy exports ──────────────────────────────────────────────────────

test("legacy IU_SCHOOLS keeps every school id, in order", () => {
  assert.deepEqual(
    IU_SCHOOLS.map((s) => s.id),
    ["kelley", "oneill", "luddy", "engtech", "media", "liberal", "science", "herron", "health", "nursing", "med", "education", "other"],
  );
});

test("typo fix: American Sign Language", () => {
  assert.equal(MAJOR_TO_SCHOOL["americansign language"], undefined);
  assert.equal(MAJOR_TO_SCHOOL["american sign language"], "liberal");
  assert.equal(schoolForMajor("American Sign Language").id, "liberal");
  const liberal = IU_MAJORS_BY_SCHOOL.find((g) => g.school.id === "liberal")!;
  assert.ok(liberal.majors.includes("American Sign Language"));
  assert.ok(!liberal.majors.some((m) => /americansign/i.test(m)));
  const iu = majorsForCampus("indianapolis", "iu")!;
  assert.ok(iu.majors.includes("American Sign Language"));
});

test('legacy alias: a saved "Americansign Language" still lands in the same school', () => {
  const canonical = schoolForMajor("American Sign Language");
  assert.equal(canonical.id, "liberal");
  for (const saved of ["Americansign Language", "  americansign language ", "AMERICANSIGN LANGUAGE"]) {
    assert.equal(schoolForMajor(saved).id, canonical.id, saved);
    for (const system of ["iu", "purdue", null] as const) {
      assert.equal(
        schoolForMajorIn("indianapolis", system, saved).id,
        schoolForMajorIn("indianapolis", system, "American Sign Language").id,
        `${saved} / ${system}`,
      );
    }
  }
  assert.equal(schoolForMajorIn("indianapolis", "iu", "Americansign Language").id, "liberal");
  assert.equal(schoolForMajorIn("fort-wayne", "iu", "Americansign Language").id, "other"); // off Indy, like the fixed spelling
  // Lookup-only: never offered in a picker.
  assert.equal(MAJOR_TO_SCHOOL["americansign language"], undefined);
  const pickable = [
    ...IU_MAJORS_BY_SCHOOL.flatMap((g) => g.majors),
    ...majorsForCampus("indianapolis", "iu")!.majors,
    ...majorsForCampus("indianapolis", "purdue")!.majors,
    ...majorsForCampus("iu-bloomington", "iu")!.majors,
  ];
  assert.ok(!pickable.some((m) => /americansign/i.test(m)));
  assert.ok(!/americansign/i.test(readFileSync(STATIC_FILE, "utf8")));
  // Prototype keys don't resolve to a school.
  assert.equal(schoolForMajor("constructor").id, "other");
  assert.equal(schoolForMajorIn("indianapolis", "iu", "__proto__").id, "other");
});

test("Psychology is in the IU School of Science", () => {
  assert.equal(schoolForMajor("Psychology").id, "science");
  assert.equal(schoolForMajorIn("indianapolis", "iu", "psychology").id, "science");
  const iu = majorsForCampus("indianapolis", "iu")!;
  const science = iu.groups.find((g) => g.school.id === "science")!;
  const liberal = iu.groups.find((g) => g.school.id === "liberal")!;
  assert.ok(science.majors.includes("Psychology"));
  assert.ok(!liberal.majors.includes("Psychology"));
});

test("legacy schoolForMajor still groups Engineering & Technology majors", () => {
  assert.equal(schoolForMajor(" Mechanical Engineering ").id, "engtech");
  assert.equal(schoolForMajor("not a real major").id, "other");
});

// ── majorsForCampus routing ─────────────────────────────────────────────

test("indianapolis + iu → IU Indianapolis list, without Engineering & Technology", () => {
  const list = majorsForCampus("indianapolis", "iu")!;
  assert.equal(list.label, "IU Indianapolis");
  assert.ok(list.majors.includes("Informatics"));
  assert.ok(list.majors.includes("Computer Science"));
  assert.ok(!list.majors.includes("Motorsports Engineering"));
  assert.ok(!list.groups.some((g) => g.school.id === "engtech" || g.school.id === "other"));
  assert.ok(list.schools.includes("Luddy · Informatics"));
  assert.ok(!list.schools.includes("Engineering & Technology"));
  const luddy = list.groups.find((g) => g.school.id === "luddy")!;
  assert.ok(luddy.majors.includes("Computer Science"));
  assert.ok(luddy.majors.includes("Media Arts and Science"));
});

test("indianapolis + purdue → Purdue Indianapolis list", () => {
  const list = majorsForCampus("indianapolis", "purdue")!;
  assert.equal(list.label, "Purdue Indianapolis");
  assert.equal(list.majors.length, 21);
  for (const m of ["Motorsports Engineering", "Computer Science", "Data Science", "Cybersecurity", "Themed Entertainment Design"]) {
    assert.ok(list.majors.includes(m), m);
  }
  assert.ok(!list.majors.includes("Informatics"));
  assert.ok(list.schools.includes("College of Engineering"));
  const science = list.groups.find((g) => g.school.id === "purdue-science")!;
  assert.ok(science.majors.includes("Computer Science"));
});

test("iu-bloomington + iu → Bloomington list, ungrouped", () => {
  const list = majorsForCampus("iu-bloomington", "iu")!;
  assert.equal(list.label, "IU Bloomington");
  assert.equal(list.majors[0], "Undecided / Exploratory");
  assert.ok(list.majors.includes("Jazz Studies"));
  assert.ok(list.schools.includes("Jacobs School of Music"));
  assert.deepEqual(list.groups, []);
});

test("everything else → null (free text)", () => {
  const cases: [string | null | undefined, "iu" | "purdue" | null | undefined][] = [
    ["iu-bloomington", "purdue"],
    ["iu-bloomington", null],
    ["indianapolis", null],
    ["indianapolis", undefined],
    ["purdue-west-lafayette", "purdue"],
    ["purdue-northwest", "purdue"],
    ["fort-wayne", "iu"],
    ["fort-wayne", "purdue"],
    ["iu-kokomo", "iu"],
    ["bloomington", "iu"],
    ["", "iu"],
    [null, "iu"],
    [undefined, "purdue"],
  ];
  for (const [campus, system] of cases) {
    assert.equal(majorsForCampus(campus, system), null, `${campus} + ${system}`);
  }
});

test("campus ids are trimmed and case-insensitive", () => {
  assert.equal(majorsForCampus(" Indianapolis ", "iu")?.label, "IU Indianapolis");
  assert.equal(majorsForCampus("IU-BLOOMINGTON", "iu")?.label, "IU Bloomington");
});

test("each call returns a fresh copy", () => {
  const a = majorsForCampus("indianapolis", "purdue")!;
  a.majors.push("Mutated");
  a.groups[0].majors.length = 0;
  a.groups[0].school.label = "Mutated";
  const b = majorsForCampus("indianapolis", "purdue")!;
  assert.ok(!b.majors.includes("Mutated"));
  assert.ok(b.groups[0].majors.length > 0);
  assert.notEqual(b.groups[0].school.label, "Mutated");
});

test("lists have no duplicates and groups agree with the flat list", () => {
  for (const list of [majorsForCampus("indianapolis", "iu")!, majorsForCampus("indianapolis", "purdue")!]) {
    assert.equal(new Set(list.majors).size, list.majors.length, list.label);
    assert.deepEqual(
      [...new Set(list.groups.flatMap((g) => g.majors))].sort((x, y) => x.localeCompare(y)),
      list.majors,
      list.label,
    );
    assert.deepEqual(list.schools, list.groups.map((g) => g.school.label));
  }
  const bloom = majorsForCampus("iu-bloomington", "iu")!;
  assert.equal(new Set(bloom.majors).size, bloom.majors.length);
});

test("Purdue school ids never collide with IU school ids", () => {
  const iuIds = new Set(IU_SCHOOLS.map((s) => s.id));
  for (const g of majorsForCampus("indianapolis", "purdue")!.groups) {
    assert.ok(!iuIds.has(g.school.id), g.school.id);
  }
});

// ── schoolForMajorIn ────────────────────────────────────────────────────

test("schoolForMajorIn uses the student's own system first", () => {
  assert.equal(schoolForMajorIn("indianapolis", "purdue", "Computer Science").id, "purdue-science");
  assert.equal(schoolForMajorIn("indianapolis", "iu", "computer science").id, "luddy");
  assert.equal(schoolForMajorIn("indianapolis", null, "Computer Science").id, "luddy");
  assert.equal(schoolForMajorIn("indianapolis", "purdue", "Motorsports Engineering").id, "purdue-engineering");
});

test("schoolForMajorIn falls back to the other system on the shared campus", () => {
  assert.equal(schoolForMajorIn("indianapolis", "iu", "Motorsports Engineering").id, "purdue-engineering");
  assert.equal(schoolForMajorIn("indianapolis", "iu", "Mechanical Engineering Technology").id, "purdue-polytechnic");
  assert.equal(schoolForMajorIn("indianapolis", "purdue", "Informatics").id, "luddy");
});

test("schoolForMajorIn returns Other off Indianapolis or for unknown input", () => {
  assert.equal(schoolForMajorIn("iu-bloomington", "iu", "Finance").id, "other");
  assert.equal(schoolForMajorIn("purdue-west-lafayette", "purdue", "Computer Science").id, "other");
  assert.equal(schoolForMajorIn(null, "iu", "Finance").id, "other");
  assert.equal(schoolForMajorIn("indianapolis", "iu", "Underwater Basket Weaving").id, "other");
  assert.equal(schoolForMajorIn("indianapolis", "iu", "").id, "other");
  assert.equal(schoolForMajorIn("indianapolis", "iu", null).id, "other");
});

// ── Static mirror ───────────────────────────────────────────────────────

test("public/html/_iu-majors.js matches the TS source", () => {
  const code = readFileSync(STATIC_FILE, "utf8");
  assert.equal(code, renderStaticFile(), "stale: regenerate with VIBE_REGEN_MAJORS=1 (see header)");

  const window: Record<string, unknown> = {};
  runInNewContext(code, { window });
  const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(plain(window.IU_MAJORS_BY_SCHOOL), plain(legacyForStatic()));

  const forCampus = window.vibeMajorsForCampus as (c: unknown, s: unknown) => unknown;
  const routes: [string | null, "iu" | "purdue" | null][] = [
    ["indianapolis", "iu"],
    ["indianapolis", "purdue"],
    ["indianapolis", null],
    [" Indianapolis ", "iu"],
    ["iu-bloomington", "iu"],
    ["iu-bloomington", "purdue"],
    ["purdue-west-lafayette", "purdue"],
    ["fort-wayne", "iu"],
    ["fort-wayne", "purdue"],
    [null, "iu"],
  ];
  for (const [campus, system] of routes) {
    assert.deepEqual(plain(forCampus(campus, system)), plain(majorsForCampus(campus, system)), `${campus} + ${system}`);
  }

  const first = forCampus("indianapolis", "iu") as { majors: string[] };
  first.majors.push("Mutated");
  assert.ok(!(forCampus("indianapolis", "iu") as { majors: string[] }).majors.includes("Mutated"));
});
