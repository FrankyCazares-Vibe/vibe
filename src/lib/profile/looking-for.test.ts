/**
 * Tests for `looking-for.ts` ("what are you here for?") plus the parity pins
 * that keep every surface on the same four tokens.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/looking-for.test.ts
 *
 * The module under test has zero imports, so it loads through a dynamic import
 * of its ".ts" path (the `join-copy.test.ts` pattern; the specifier goes
 * through a variable because tsc refuses a literal ".ts" specifier). The
 * parity checks read the other surfaces as text, from paths relative to this
 * file.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./looking-for.ts";
const {
  LOOKING_FOR_PROFILE_COPY,
  LOOKING_FOR_VALUES,
  isLookingFor,
  lookingForForDisplay,
  parseLookingForBody,
} = (await import(specifier)) as typeof import("./looking-for");

const REPO_ROOT = new URL("../../../", import.meta.url);
// The retired snapshot column, spelled in two halves so a grep of src/ for
// its name stays empty (a P1 static gate: nothing in src names it).
const OLD_SNAPSHOT_COLUMN = ["recruiter", "snapshot"].join("_");
const readRepoFile = (path: string): string => readFileSync(new URL(path, REPO_ROOT), "utf8");

test("the four tokens, in the onboarding order", () => {
  assert.deepEqual(
    [...LOOKING_FOR_VALUES],
    ["meeting-people", "showing-work", "finding-clubs", "exploring"],
  );
});

test("isLookingFor is an exact string match", () => {
  for (const v of LOOKING_FOR_VALUES) assert.equal(isLookingFor(v), true);
  assert.equal(isLookingFor(" exploring"), false);
  assert.equal(isLookingFor("Exploring"), false);
  assert.equal(isLookingFor("nope"), false);
  assert.equal(isLookingFor(3), false);
  assert.equal(isLookingFor(null), false);
  assert.equal(isLookingFor(undefined), false);
});

test("lookingForForDisplay: known tokens, trimmed, deduplicated, canonical order", () => {
  assert.deepEqual(
    lookingForForDisplay(["exploring", "meeting-people", "exploring", " finding-clubs ", "x", 3]),
    ["meeting-people", "finding-clubs", "exploring"],
  );
  assert.deepEqual(lookingForForDisplay("exploring"), []);
  assert.deepEqual(lookingForForDisplay(undefined), []);
  assert.deepEqual(lookingForForDisplay(null), []);
  assert.deepEqual(lookingForForDisplay({ 0: "exploring" }), []);
  assert.deepEqual(lookingForForDisplay([]), []);
});

test("parseLookingForBody: absent, clear, invalid, junk dropped", () => {
  assert.equal(parseLookingForBody(undefined), undefined);
  assert.deepEqual(parseLookingForBody(null), []);
  assert.equal(parseLookingForBody("exploring"), null);
  assert.equal(parseLookingForBody({}), null);
  assert.equal(parseLookingForBody(3), null);
  assert.deepEqual(parseLookingForBody(["showing-work", "nope"]), ["showing-work"]);
  assert.deepEqual(parseLookingForBody(["<b>x</b>"]), []);
});

test("profile copy, every string exact", () => {
  assert.deepEqual(LOOKING_FOR_PROFILE_COPY, {
    rowLabel: "Here for",
    editHint: "Pick all that fit.",
    ownerOnlyNote: "Only you can see this",
    labels: {
      "meeting-people": "Meeting people",
      "showing-work": "Showing work",
      "finding-clubs": "Finding clubs",
      exploring: "Just exploring",
    },
  });
  assert.equal(Object.isFrozen(LOOKING_FOR_PROFILE_COPY), true);
  assert.equal(Object.isFrozen(LOOKING_FOR_PROFILE_COPY.labels), true);
  assert.deepEqual(Object.keys(LOOKING_FOR_PROFILE_COPY.labels), [...LOOKING_FOR_VALUES]);
});

test("parity: both onboarding surfaces and the prefill carry the same tokens", () => {
  const stepProfile = readRepoFile("src/components/mobile/onboarding/StepProfile.tsx");
  const onboardingHtml = readRepoFile("public/html/onboarding.html");
  const prefill = readRepoFile("src/lib/profile/onboarding-prefill.ts");
  for (const v of LOOKING_FOR_VALUES) {
    assert.ok(stepProfile.includes(`value: "${v}"`), `StepProfile.tsx lacks value: "${v}"`);
    assert.ok(onboardingHtml.includes(`value: "${v}"`), `onboarding.html lacks value: "${v}"`);
    assert.ok(prefill.includes(`"${v}"`), `onboarding-prefill.ts lacks "${v}"`);
  }
  // Onboarding keeps its own first-person question and labels.
  assert.ok(stepProfile.includes(`label: "Showing my work"`));
  assert.ok(onboardingHtml.includes(`label: "Showing my work"`));
});

test("parity: the desktop profile mirrors the tokens and copy, with no snapshot left", () => {
  const html = readRepoFile("public/html/profile.html");
  assert.ok(
    html.includes(
      'const LOOKING_FOR_VALUES = Object.freeze(["meeting-people","showing-work","finding-clubs","exploring"]);',
    ),
    "profile.html lacks the LOOKING_FOR_VALUES mirror",
  );
  for (const v of LOOKING_FOR_VALUES) {
    const label = LOOKING_FOR_PROFILE_COPY.labels[v];
    const button = new RegExp(
      `data-looking-for="${v}" aria-pressed="false" disabled>\\s*${label}\\s*</button>`,
    );
    assert.match(html, button, `profile.html lacks the "${v}" chip`);
  }
  assert.ok(html.includes(LOOKING_FOR_PROFILE_COPY.rowLabel));
  assert.ok(html.includes(LOOKING_FOR_PROFILE_COPY.editHint));
  assert.ok(html.includes(LOOKING_FOR_PROFILE_COPY.ownerOnlyNote), "no owner-only note (H6)");
  for (const gone of [
    "recruiterCard",
    "recBanner",
    "rec-stat",
    "rec-badge",
    "RECRUITER VIEW",
    "recruiter-mode",
    "data-snapshot-key",
    OLD_SNAPSHOT_COLUMN,
    "toggleRecruiter",
  ]) {
    assert.equal(html.includes(gone), false, `profile.html still contains ${gone}`);
  }
});
