/**
 * Tests for the onboarding step validators and prefill in
 * `onboarding-prefill.ts` (plan §3.3–3.4, contract C3), plus a regression
 * pin on the legacy `sanitizeOnboardingProfile`.
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/profile/onboarding-prefill.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports through the "@/…" path alias and
 * extensionless specifiers, which Next's bundler and tsc resolve but Node's
 * type stripping doesn't. An in-thread resolve hook maps "@/x" to "src/x.ts"
 * and retries a failed relative specifier with ".ts" (same pattern as
 * `src/lib/iu/campuses.test.ts`). The module loads through dynamic `import()`
 * so the hook is registered first. Its dependency chain (campuses, handle,
 * resume-doc-url, work-experience) has no further imports.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("onboarding-prefill.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
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

const {
  CAMPUS_CHANGE_COOLDOWN_MS,
  ONBOARDING_STEP_ERROR_COPY,
  buildOnboardingPrefill,
  campusChangeDecision,
  isTriggerDefaultHandle,
  isTriggerDefaultName,
  sanitizeCampusStep,
  sanitizeOnboardingProfile,
  sanitizeProfileStep,
} = await import("./onboarding-prefill");

const TRIGGER_HANDLE = "u0f1e2d3c4b5a69788796a5b4c3d2e1f0";

// ── sanitizeProfileStep ──────────────────────────────────────────────────

test("profile step: name is required and checked before the handle", () => {
  for (const body of [{}, { name: "" }, { name: "   " }, { name: 7, handle: "ok_handle" }]) {
    const r = sanitizeProfileStep(body);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "name_required");
      assert.equal(r.field, "name");
      assert.equal(r.error, ONBOARDING_STEP_ERROR_COPY.name_required);
    }
  }
});

test("profile step: handle required / invalid / reserved", () => {
  const cases: [unknown, string][] = [
    [undefined, "handle_required"],
    ["", "handle_required"],
    ["   ", "handle_required"],
    [42, "handle_required"],
    ["ab", "handle_invalid"],
    ["a".repeat(21), "handle_invalid"],
    ["bad-handle", "handle_invalid"],
    ["has space", "handle_invalid"],
    ["@franky", "handle_invalid"],
    [TRIGGER_HANDLE, "handle_invalid"],
    ["admin", "handle_reserved"],
    ["  Otto ", "handle_reserved"],
  ];
  for (const [handle, code] of cases) {
    const r = sanitizeProfileStep({ name: "Franky", handle });
    assert.equal(r.ok, false, String(handle));
    if (!r.ok) {
      assert.equal(r.code, code, String(handle));
      assert.equal(r.field, "handle");
      assert.equal(r.error, ONBOARDING_STEP_ERROR_COPY[r.code]);
    }
  }
});

test("profile step: non-object bodies are profile_invalid", () => {
  for (const body of [null, undefined, "x", 3, []]) {
    const r = sanitizeProfileStep(body);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "profile_invalid");
  }
});

test("profile step: normalizes the handle and writes only name when nothing else is sent", () => {
  const r = sanitizeProfileStep({ name: "  Franky C ", handle: " Franky_C " });
  assert.deepEqual(r, { ok: true, value: { handle: "franky_c", patch: { name: "Franky C" } } });
});

test("profile step: optional fields, with explicit empties clearing the column", () => {
  const r = sanitizeProfileStep({
    step: "profile",
    name: "N".repeat(200),
    handle: "franky",
    bio: "  hi  ",
    major: null,
    department: "",
    year: "3",
    interests: [" music ", 5, "", "art"],
    skills: null,
    looking_for: ["exploring", "bogus", " exploring", "finding-clubs"],
    otto_answers: { done: true },
    school: "IU Indianapolis",
    campus_id: "indianapolis",
    resume_url: "https://example.com/r.pdf",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.deepEqual(r.value.patch, {
      name: "N".repeat(120),
      bio: "hi",
      major: "",
      department: "",
      year: 3,
      interests: ["music", "art"],
      skills: [],
      looking_for: ["exploring", "finding-clubs"],
    });
    const keys = Object.keys(r.value.patch);
    for (const never of ["otto_answers", "school", "campus_id", "handle", "resume_url", "step"]) {
      assert.equal(keys.includes(never), false, never);
    }
  }
});

test("profile step: year accepts 1–12 as number or digit string, null/'' clear it", () => {
  const year = (y: unknown) => {
    const r = sanitizeProfileStep({ name: "F", handle: "franky", year: y });
    return r.ok ? r.value.patch.year : r.code;
  };
  assert.equal(year(1), 1);
  assert.equal(year(12), 12);
  assert.equal(year(" 4 "), 4);
  assert.equal(year(null), null);
  assert.equal(year(""), null);
  for (const bad of [0, 13, 2.5, "3rd", "abc", true, [3]]) {
    assert.equal(year(bad), "profile_invalid", String(bad));
  }
});

test("profile step: wrong types name the bad field", () => {
  const field = (body: Record<string, unknown>) => {
    const r = sanitizeProfileStep({ name: "F", handle: "franky", ...body });
    return r.ok ? null : [r.code, r.field];
  };
  assert.deepEqual(field({ bio: 5 }), ["profile_invalid", "bio"]);
  assert.deepEqual(field({ major: ["x"] }), ["profile_invalid", "major"]);
  assert.deepEqual(field({ interests: "music, art" }), ["profile_invalid", "interests"]);
  assert.deepEqual(field({ skills: { a: 1 } }), ["profile_invalid", "skills"]);
  assert.deepEqual(field({ looking_for: "exploring" }), ["profile_invalid", "looking_for"]);
  assert.deepEqual(field({ year: 99 }), ["profile_invalid", "year"]);
});

// ── sanitizeCampusStep ───────────────────────────────────────────────────

test("campus step: the allowed set of the verified system", () => {
  assert.deepEqual(sanitizeCampusStep({ campus_id: "indianapolis" }, "iu"), {
    ok: true,
    value: { campusId: "indianapolis" },
  });
  assert.deepEqual(sanitizeCampusStep({ campus_id: " Indianapolis " }, "purdue"), {
    ok: true,
    value: { campusId: "indianapolis" },
  });
  assert.equal(sanitizeCampusStep({ campus_id: "purdue-west-lafayette" }, "purdue").ok, true);
  const wrongSystem = sanitizeCampusStep({ campus_id: "purdue-west-lafayette" }, "iu");
  assert.deepEqual(wrongSystem, {
    ok: false,
    code: "campus_invalid",
    field: "campus_id",
    error: ONBOARDING_STEP_ERROR_COPY.campus_invalid,
  });
  assert.equal(sanitizeCampusStep({ campus_id: "iu-bloomington" }, "purdue").ok, false);
});

test("campus step: Fort Wayne is one shared campus (Franky, Q4)", () => {
  assert.equal(sanitizeCampusStep({ campus_id: "fort-wayne" }, "iu").ok, true);
  assert.equal(sanitizeCampusStep({ campus_id: "fort-wayne" }, "purdue").ok, true);
  // The pre-Q4 split ids never shipped.
  assert.equal(sanitizeCampusStep({ campus_id: "iu-fort-wayne" }, "iu").ok, false);
  assert.equal(sanitizeCampusStep({ campus_id: "purdue-fort-wayne" }, "purdue").ok, false);
});

test("campus step: legacy labels and ids map to the canonical id", () => {
  assert.deepEqual(sanitizeCampusStep({ campus_id: "IU Indianapolis" }, "iu"), {
    ok: true,
    value: { campusId: "indianapolis" },
  });
  assert.deepEqual(sanitizeCampusStep({ campus_id: "bloomington" }, "iu"), {
    ok: true,
    value: { campusId: "iu-bloomington" },
  });
  assert.equal(sanitizeCampusStep({ campus_id: "IU Online" }, "iu").ok, false);
});

test("campus step: missing, junk, or no system is campus_invalid", () => {
  for (const [body, system] of [
    [{}, "iu"],
    [{ campus_id: "" }, "iu"],
    [{ campus_id: 3 }, "iu"],
    [{ campus_id: "iu.edu" }, "iu"],
    [null, "iu"],
    [{ campus_id: "indianapolis" }, null],
    [{ campus_id: "indianapolis" }, undefined],
    [{ campus_id: "indianapolis" }, "harvard"],
  ] as [unknown, never][]) {
    const r = sanitizeCampusStep(body, system);
    assert.equal(r.ok, false, JSON.stringify([body, system]));
  }
});

// ── campusChangeDecision (the 30-day rule) ───────────────────────────────

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();

test("campus decision: a first pick (no stamp) is free, onboarded or not", () => {
  for (const onboarded of [false, true]) {
    assert.deepEqual(
      campusChangeDecision({ currentId: null, setAt: null, nextId: "indianapolis", onboarded, now: NOW }),
      { kind: "write" },
    );
  }
});

test("campus decision: confirming a backfilled campus (same id, no stamp) writes the stamp", () => {
  assert.deepEqual(
    campusChangeDecision({ currentId: "indianapolis", setAt: null, nextId: "indianapolis", onboarded: true, now: NOW }),
    { kind: "write" },
  );
  // An onboarded backfilled row changing away from the silent default is still a first pick.
  assert.deepEqual(
    campusChangeDecision({ currentId: "indianapolis", setAt: null, nextId: "iu-bloomington", onboarded: true, now: NOW }),
    { kind: "write" },
  );
});

test("campus decision: any change mid-onboarding is free", () => {
  assert.deepEqual(
    campusChangeDecision({
      currentId: "indianapolis",
      setAt: iso(NOW - 60_000),
      nextId: "iu-bloomington",
      onboarded: false,
      now: NOW,
    }),
    { kind: "write" },
  );
});

test("campus decision: an onboarded change waits out 30 days from the stamp", () => {
  const setAt = iso(NOW - 10 * DAY_MS);
  assert.deepEqual(
    campusChangeDecision({ currentId: "indianapolis", setAt, nextId: "iu-bloomington", onboarded: true, now: NOW }),
    { kind: "too_soon", availableAt: iso(NOW - 10 * DAY_MS + CAMPUS_CHANGE_COOLDOWN_MS) },
  );
  assert.deepEqual(
    campusChangeDecision({
      currentId: "indianapolis",
      setAt: iso(NOW - 31 * DAY_MS),
      nextId: "iu-bloomington",
      onboarded: true,
      now: NOW,
    }),
    { kind: "write" },
  );
  assert.deepEqual(
    campusChangeDecision({
      currentId: "indianapolis",
      setAt: iso(NOW - CAMPUS_CHANGE_COOLDOWN_MS),
      nextId: "iu-bloomington",
      onboarded: true,
      now: NOW,
    }),
    { kind: "write" },
    "exactly 30 days is allowed",
  );
});

test("campus decision: a campus cleared by a system change keeps its clock (critic B3)", () => {
  const setAt = iso(NOW - 2 * DAY_MS);
  for (const currentId of [null, "", undefined]) {
    const d = campusChangeDecision({ currentId, setAt, nextId: "purdue-west-lafayette", onboarded: true, now: NOW });
    assert.equal(d.kind, "too_soon", String(currentId));
    if (d.kind === "too_soon") assert.equal(d.availableAt, iso(NOW - 2 * DAY_MS + CAMPUS_CHANGE_COOLDOWN_MS));
  }
  assert.deepEqual(
    campusChangeDecision({
      currentId: null,
      setAt: iso(NOW - 40 * DAY_MS),
      nextId: "purdue-west-lafayette",
      onboarded: true,
      now: NOW,
    }),
    { kind: "write" },
  );
});

test("campus decision: re-saving the stamped campus is a no-op, even inside 30 days", () => {
  for (const onboarded of [false, true]) {
    assert.deepEqual(
      campusChangeDecision({
        currentId: "indianapolis",
        setAt: iso(NOW - DAY_MS),
        nextId: "indianapolis",
        onboarded,
        now: NOW,
      }),
      { kind: "noop" },
    );
  }
});

// ── trigger defaults + prefill ───────────────────────────────────────────

test("trigger default handle is exactly u + 32 lowercase hex", () => {
  assert.equal(isTriggerDefaultHandle(TRIGGER_HANDLE), true);
  assert.equal(isTriggerDefaultHandle(` ${TRIGGER_HANDLE} `), true);
  assert.equal(isTriggerDefaultHandle(TRIGGER_HANDLE.toUpperCase()), false);
  assert.equal(isTriggerDefaultHandle(TRIGGER_HANDLE.slice(0, -1)), false);
  assert.equal(isTriggerDefaultHandle("franky"), false);
  assert.equal(isTriggerDefaultHandle(null), false);
});

test("trigger default name is the email's local part, exactly", () => {
  assert.equal(isTriggerDefaultName("fgcazares04", "fgcazares04@gmail.com"), true);
  assert.equal(isTriggerDefaultName(" fgcazares04 ", "fgcazares04@gmail.com"), true);
  assert.equal(isTriggerDefaultName("Fgcazares04", "fgcazares04@gmail.com"), false);
  assert.equal(isTriggerDefaultName("Franky Cazares", "fgcazares04@gmail.com"), false);
  assert.equal(isTriggerDefaultName("no-at-sign", "no-at-sign"), true);
  assert.equal(isTriggerDefaultName("", "a@b.c"), false);
  assert.equal(isTriggerDefaultName("a", null), false);
});

test("prefill blanks the trigger defaults and reports no real handle", () => {
  const p = buildOnboardingPrefill({
    email: "jdoe12@iu.edu",
    name: "jdoe12",
    handle: TRIGGER_HANDLE,
    bio: "",
    major: "",
    department: "",
    year: null,
    interests: [],
    skills: [],
    looking_for: [],
    avatar_url: "",
  });
  assert.deepEqual(p, {
    name: "",
    handle: "",
    bio: "",
    major: "",
    department: "",
    year: null,
    interests: [],
    skills: [],
    looking_for: [],
    campusId: null,
    campusConfirmed: false,
    avatarUrl: null,
    hasRealHandle: false,
  });
});

test("prefill campus: confirmed only when campus_set_at is set", () => {
  const backfilled = buildOnboardingPrefill({ campus_id: "indianapolis", campus_set_at: null });
  assert.equal(backfilled.campusId, "indianapolis");
  assert.equal(backfilled.campusConfirmed, false, "a backfilled campus is unconfirmed");
  const chosen = buildOnboardingPrefill({ campus_id: "indianapolis", campus_set_at: "2026-09-01T00:00:00Z" });
  assert.equal(chosen.campusConfirmed, true);
  assert.equal(buildOnboardingPrefill({ campus_id: "indianapolis", campus_set_at: "" }).campusConfirmed, false);
});

test("prefill campus: legacy school label only when the row has no campus_id column", () => {
  const preM1 = buildOnboardingPrefill({ school: "IU Indianapolis" });
  assert.equal(preM1.campusId, "indianapolis");
  assert.equal(preM1.campusConfirmed, false);
  assert.equal(buildOnboardingPrefill({ school: "IU Fort Wayne" }).campusId, "fort-wayne");
  assert.equal(buildOnboardingPrefill({ school: "IU Online" }).campusId, null);
  assert.equal(buildOnboardingPrefill({ school: "" }).campusId, null);
  // After M1 the column wins, even when null (e.g. cleared by a system change).
  assert.equal(buildOnboardingPrefill({ campus_id: null, school: "IU Indianapolis" }).campusId, null);
  assert.equal(
    buildOnboardingPrefill({ campus_id: "iu-bloomington", school: "IU Indianapolis" }).campusId,
    "iu-bloomington",
  );
});

test("prefill keeps real values and sanitizes the rest", () => {
  const p = buildOnboardingPrefill({
    email: "jdoe12@iu.edu",
    name: "Jordan Doe",
    handle: "jordan",
    bio: " builds things ",
    major: "Computer Science",
    department: "Luddy",
    year: 13,
    interests: ["music", 3, " "],
    skills: "not a list",
    looking_for: ["exploring", "nope", "exploring"],
    campus_id: "indianapolis",
    avatar_url: "https://cdn.example/a.jpg",
  });
  assert.equal(p.name, "Jordan Doe");
  assert.equal(p.handle, "jordan");
  assert.equal(p.hasRealHandle, true);
  assert.equal(p.bio, "builds things");
  assert.equal(p.year, null);
  assert.deepEqual(p.interests, ["music"]);
  assert.deepEqual(p.skills, []);
  assert.deepEqual(p.looking_for, ["exploring"]);
  assert.equal(p.campusId, "indianapolis");
  assert.equal(p.avatarUrl, "https://cdn.example/a.jpg");
  assert.equal(buildOnboardingPrefill({ campus_id: "bloomington" }).campusId, null, "legacy ids aren't campus ids");
});

test("prefill of a missing row is all blank", () => {
  const p = buildOnboardingPrefill(null);
  assert.equal(p.name, "");
  assert.equal(p.handle, "");
  assert.equal(p.hasRealHandle, false);
  assert.equal(p.campusId, null);
});

// ── legacy sanitizeOnboardingProfile (unchanged for onboarding-complete) ─

test("sanitizeOnboardingProfile keeps its legacy shape", () => {
  assert.deepEqual(sanitizeOnboardingProfile(undefined), {});
  assert.equal(sanitizeOnboardingProfile(null), null);
  assert.equal(sanitizeOnboardingProfile({ year: 20 }), null);
  assert.equal(sanitizeOnboardingProfile({ school: "Narnia" }), null);
  assert.deepEqual(
    sanitizeOnboardingProfile({
      name: " F ",
      campus: "indianapolis",
      bio: "",
      year: "2",
      interests: ["a", ""],
      looking_for: ["exploring", "x"],
    }),
    { name: "F", school: "IU Indianapolis", year: 2, interests: ["a"], looking_for: ["exploring"] },
  );
  assert.deepEqual(sanitizeOnboardingProfile({ school: "" }), { school: "" });
});
