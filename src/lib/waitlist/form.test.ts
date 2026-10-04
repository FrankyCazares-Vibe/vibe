/**
 * Tests for the waitlist form parser (`form.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/form.test.ts
 *
 * WHY THE RESOLVE HOOK: form.ts imports "../auth/school-email-domains", which
 * imports "../iu/campuses", both extensionless as Next and tsc expect. Node's
 * type stripping adds no extensions, so an in-thread resolve hook retries a
 * failed relative specifier with ".ts" and the module loads through a dynamic
 * import after the hook is registered (as in school-email-domains.test.ts).
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import test from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("form.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const { WAITLIST_LIMITS, WAITLIST_NOTICE_VERSION, WAITLIST_YEAR_OPTIONS, cleanSource, parseWaitlistForm } =
  await import("./form");

const GOOD = {
  email: "  Fracazar@IU.EDU ",
  name: " Franky ",
  classYear: 3,
  major: "Informatics",
  clubs: "SAE, Coding Club",
  isOfficer: false,
  officerClub: "ignored when not an officer",
  wish: "Find out what's on tonight",
  consentAge: true,
  consentInvite: true,
  consentNews: false,
  source: "Landing",
  website: "",
};

function fails(patch: Record<string, unknown>) {
  const r = parseWaitlistForm({ ...GOOD, ...patch });
  assert.equal(r.ok, false, JSON.stringify(patch));
  return r as { ok: false; field: string; error: string };
}

test("constants", () => {
  assert.equal(WAITLIST_NOTICE_VERSION, "2026-10-03");
  assert.deepEqual(
    { ...WAITLIST_LIMITS },
    { name: 80, major: 80, clubs: 200, officerClub: 80, wish: 280, source: 40, email: 254 },
  );
  assert.deepEqual(
    WAITLIST_YEAR_OPTIONS.map((o) => o.value),
    ["", "1", "2", "3", "4", "5"],
  );
  assert.equal(WAITLIST_YEAR_OPTIONS[0].label, "Prefer not to say");
  assert.equal(WAITLIST_YEAR_OPTIONS[5].label, "5th+ / grad");
});

test("a good submit is trimmed and normalised", () => {
  const r = parseWaitlistForm(GOOD);
  assert.ok(r.ok);
  assert.deepEqual(r.value, {
    email: "fracazar@iu.edu",
    schoolSystem: "iu",
    name: "Franky",
    classYear: 3,
    major: "Informatics",
    clubs: "SAE, Coding Club",
    isOfficer: false,
    officerClub: null,
    wish: "Find out what's on tonight",
    consentNews: false,
    source: "landing",
    honeypot: false,
  });
});

test("Purdue addresses are accepted; blank optional text becomes null", () => {
  const r = parseWaitlistForm({
    ...GOOD, email: "a@purdue.edu", major: "  ", clubs: undefined, wish: "", classYear: null,
    isOfficer: true, officerClub: " Robotics ", consentNews: true,
  });
  assert.ok(r.ok);
  assert.equal(r.value.schoolSystem, "purdue");
  assert.equal(r.value.major, null);
  assert.equal(r.value.clubs, null);
  assert.equal(r.value.wish, null);
  assert.equal(r.value.classYear, null);
  assert.equal(r.value.officerClub, "Robotics");
  assert.equal(r.value.consentNews, true);
});

test("the year takes 1-5 or blank, as a number or the select's string", () => {
  for (const [raw, want] of [[1, 1], ["5", 5], ["", null], [undefined, null]] as const) {
    const r = parseWaitlistForm({ ...GOOD, classYear: raw });
    assert.ok(r.ok);
    assert.equal(r.value.classYear, want);
  }
  for (const bad of [0, 6, 2.5, "x", true]) assert.equal(fails({ classYear: bad }).field, "classYear");
});

test("school emails only, with the existing helpers' copy", () => {
  assert.equal(fails({ email: "" }).field, "email");
  assert.match(fails({ email: "me@gmail.com" }).error, /IU or Purdue school email/);
  assert.match(fails({ email: "me@iupui.edu" }).error, /IU retired @iupui\.edu addresses on Jan 1, 2026/);
  assert.match(fails({ email: "not an email" }).error, /doesn't look like an email/);
  assert.match(fails({ email: `${"a".repeat(250)}@iu.edu` }).error, /too long/);
});

test("each text field's limit, counted in characters", () => {
  assert.equal(fails({ name: "   " }).field, "name");
  for (const [field, limit] of [["name", 80], ["major", 80], ["clubs", 200], ["wish", 280]] as const) {
    const at = parseWaitlistForm({ ...GOOD, [field]: "é".repeat(limit) });
    assert.ok(at.ok, field);
    assert.equal(fails({ [field]: "a".repeat(limit + 1) }).field, field);
  }
  const officer = { isOfficer: true };
  assert.ok(parseWaitlistForm({ ...GOOD, ...officer, officerClub: "🙂".repeat(80) }).ok);
  assert.equal(fails({ ...officer, officerClub: "a".repeat(81) }).field, "officerClub");
});

test("control characters and bidi overrides become spaces, then trimmed", () => {
  const r = parseWaitlistForm({ ...GOOD, name: "\u0000Fra‮ky\u0007", wish: "a\nb" });
  assert.ok(r.ok);
  assert.equal(r.value.name, "Fra ky");
  assert.equal(r.value.wish, "a b");
});

test("both required consents must be exactly true; news is optional", () => {
  assert.equal(fails({ consentAge: false }).field, "consentAge");
  assert.equal(fails({ consentAge: "true" }).field, "consentAge");
  assert.equal(fails({ consentInvite: undefined }).field, "consentInvite");
  const r = parseWaitlistForm({ ...GOOD, consentNews: "yes" });
  assert.ok(r.ok);
  assert.equal(r.value.consentNews, false);
});

test("the honeypot passes through as a flag, never an error", () => {
  const r = parseWaitlistForm({ ...GOOD, website: "http://spam.example" });
  assert.ok(r.ok);
  assert.equal(r.value.honeypot, true);
});

test("a body that isn't an object is a form error", () => {
  for (const raw of [null, "x", 1, [GOOD]]) {
    const r = parseWaitlistForm(raw);
    assert.equal(r.ok, false);
    assert.equal((r as { field: string }).field, "form");
  }
});

test("cleanSource: a bad tag is null, never an error", () => {
  assert.equal(cleanSource("club_fair-2026"), "club_fair-2026");
  assert.equal(cleanSource(" Landing "), "landing");
  for (const bad of [null, undefined, "", "a b", "x".repeat(41), "<script>", "ü"]) {
    assert.equal(cleanSource(bad), null);
  }
  const r = parseWaitlistForm({ ...GOOD, source: "bad source!" });
  assert.ok(r.ok);
  assert.equal(r.value.source, null);
});
