/**
 * Tests for the v:2 Finish / Skip rules (`finish.ts`, plan §3.4, question 3).
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/onboarding/finish.test.ts
 *
 * WHY THE RESOLVE HOOK: same reason as
 * `src/lib/profile/onboarding-prefill.test.ts` — Node's type stripping doesn't
 * resolve the "@/…" alias or add file extensions, so an in-thread resolve hook
 * is registered before the module loads through dynamic `import()`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

import type { FinishRow } from "./finish";

type NextResolve = (specifier: string, context?: unknown) => unknown;
// `module.registerHooks` exists from Node 22.15 / 23.5; the repo's
// @types/node is 20.x and doesn't declare it, hence the narrow cast.
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("finish.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  FINISH_ERROR_COPY,
  ONBOARDING_NEXT_PATH,
  SCHOOL_EMAIL_PATH,
  finishDecision,
  legacyCampusPatch,
  ottoAnswersForFinish,
} = await import("./finish");

const TRIGGER_HANDLE = "u0f1e2d3c4b5a69788796a5b4c3d2e1f0";

/** A row that passes every rule: verified, real identity, campus in system. */
function ready(overrides: Partial<FinishRow> = {}): FinishRow {
  return {
    school_verified: true,
    school_system: "iu",
    campus_id: "indianapolis",
    name: "Franky Cazares",
    handle: "franky",
    email: "fgcazares04@example.com",
    handle_changed_at: null,
    ...overrides,
  };
}

// ── the gates, in order ──────────────────────────────────────────────────

test("finish: no row is a 404, not a silent pass", () => {
  for (const row of [null, undefined]) {
    const d = finishDecision({ row, skip: false });
    assert.equal(d.ok, false);
    if (!d.ok) {
      assert.equal(d.status, 404);
      assert.equal(d.code, "profile_not_found");
    }
  }
});

test("finish: an unverified row can never mark onboarding done", () => {
  for (const verified of [false, null, undefined, "true"]) {
    for (const skip of [false, true]) {
      const d = finishDecision({ row: ready({ school_verified: verified }), skip });
      assert.equal(d.ok, false);
      if (!d.ok) {
        assert.equal(d.status, 403);
        assert.equal(d.code, "school_unverified");
      }
    }
  }
});

test("finish: a name is required, and the trigger's email-prefix default isn't one", () => {
  const cases: Partial<FinishRow>[] = [
    { name: "" },
    { name: "   " },
    { name: 7 },
    // handle_new_user writes split_part(email, '@', 1) as the name.
    { name: "fgcazares04", email: "fgcazares04@example.com" },
  ];
  for (const overrides of cases) {
    const d = finishDecision({ row: ready(overrides), skip: false });
    assert.equal(d.ok, false);
    if (!d.ok) {
      assert.equal(d.status, 400);
      assert.equal(d.code, "name_required");
      assert.equal(d.field, "name");
      assert.equal(d.error, FINISH_ERROR_COPY.name_required);
    }
  }
});

test("finish: a handle is required, and the u<hex> placeholder isn't one", () => {
  for (const handle of ["", "   ", TRIGGER_HANDLE, TRIGGER_HANDLE.toUpperCase().toLowerCase()]) {
    const d = finishDecision({ row: ready({ handle }), skip: false });
    assert.equal(d.ok, false);
    if (!d.ok) {
      assert.equal(d.code, "handle_required");
      assert.equal(d.field, "handle");
    }
  }
});

test("finish: identity is required on SKIP too (question 3, option B)", () => {
  const noName = finishDecision({ row: ready({ name: "" }), skip: true });
  assert.equal(noName.ok, false);
  if (!noName.ok) assert.equal(noName.code, "name_required");

  const noHandle = finishDecision({ row: ready({ handle: TRIGGER_HANDLE }), skip: true });
  assert.equal(noHandle.ok, false);
  if (!noHandle.ok) assert.equal(noHandle.code, "handle_required");
});

// ── campus: required at Finish, optional on Skip ─────────────────────────

test("finish: a campus is required, and its absence reads differently from a bad one", () => {
  for (const campus_id of [null, undefined, "", "   "]) {
    const d = finishDecision({ row: ready({ campus_id }), skip: false });
    assert.equal(d.ok, false);
    if (!d.ok) {
      assert.equal(d.code, "campus_required");
      assert.equal(d.field, "campus_id");
      assert.equal(d.error, "Pick your campus to continue.");
    }
  }
});

test("finish: a campus outside the student's university is campus_invalid", () => {
  const wrongSystem = finishDecision({
    row: ready({ campus_id: "purdue-west-lafayette", school_system: "iu" }),
    skip: false,
  });
  assert.equal(wrongSystem.ok, false);
  if (!wrongSystem.ok) {
    assert.equal(wrongSystem.code, "campus_invalid");
    assert.equal(wrongSystem.error, "Pick one of your university's campuses.");
  }

  // No stamped system: nothing is allowed, so a campus on the row can't pass.
  for (const school_system of [null, undefined, "harvard"]) {
    const d = finishDecision({ row: ready({ school_system }), skip: false });
    assert.equal(d.ok, false);
    if (!d.ok) assert.equal(d.code, "campus_invalid");
  }
});

test("finish: the shared campus works from both universities", () => {
  for (const school_system of ["iu", "purdue"] as const) {
    const d = finishDecision({ row: ready({ school_system }), skip: false });
    assert.equal(d.ok, true);
  }
});

test("skip: a campus-less student may leave, and keeps everything saved", () => {
  const d = finishDecision({ row: ready({ campus_id: null }), skip: true });
  assert.equal(d.ok, true);
});

// ── the handle cooldown clock ────────────────────────────────────────────

test("finish: the handle cooldown starts here, but never re-arms an existing one", () => {
  // Onboarding claims leave the clock null; Finish starts it.
  const fresh = finishDecision({ row: ready({ handle_changed_at: null }), skip: false });
  assert.equal(fresh.ok, true);
  if (fresh.ok) assert.equal(fresh.stampHandleChangedAt, true);

  // A row already inside a cooldown (a replay, a retry) is left alone.
  const stamped = finishDecision({
    row: ready({ handle_changed_at: "2026-09-10T12:00:00.000Z" }),
    skip: false,
  });
  assert.equal(stamped.ok, true);
  if (stamped.ok) assert.equal(stamped.stampHandleChangedAt, false);

  // Skip starts the clock the same way.
  const skipped = finishDecision({ row: ready({ campus_id: null }), skip: true });
  assert.equal(skipped.ok, true);
  if (skipped.ok) assert.equal(skipped.stampHandleChangedAt, true);
});

// ── otto_answers ─────────────────────────────────────────────────────────

test("otto answers: a real config is written through untouched", () => {
  const config = { tone: "warm", topics: ["clubs"] };
  assert.deepEqual(ottoAnswersForFinish(config, false), config);
  assert.deepEqual(ottoAnswersForFinish(config, true), config);
});

test("otto answers: Finish refuses a value that wouldn't mark onboarding done", () => {
  for (const raw of [undefined, null, {}, "", 0, [], [1], "{}"]) {
    assert.equal(ottoAnswersForFinish(raw, false), null);
  }
});

test("otto answers: Skip with nothing gets an honest marker, not a fake config", () => {
  assert.deepEqual(ottoAnswersForFinish(undefined, true), { skipped: true });
  assert.deepEqual(ottoAnswersForFinish(null, true), { skipped: true });
  assert.deepEqual(ottoAnswersForFinish({}, true), { skipped: true });
  // Still non-empty, so isOttoOnboardingComplete() reads it as done and the
  // app stops sending the student back to /onboarding.
  assert.ok(Object.keys(ottoAnswersForFinish({}, true) ?? {}).length > 0);
  // A wrong-typed body is still refused, even on Skip.
  assert.equal(ottoAnswersForFinish([], true), null);
  assert.equal(ottoAnswersForFinish("done", true), null);
});

// ── where the student lands ──────────────────────────────────────────────

test("next: both branches send a verified student to the campus tour", () => {
  assert.equal(ONBOARDING_NEXT_PATH, "/campus?welcome=1");
  assert.equal(SCHOOL_EMAIL_PATH, "/auth/school-email");
  // Today's bundles append their own welcome=1; the result must still parse
  // to the same first value (critic D8).
  const doubled = new URL(`https://vibe.test${ONBOARDING_NEXT_PATH}&welcome=1`);
  assert.equal(doubled.searchParams.get("welcome"), "1");
  assert.equal(doubled.pathname, "/campus");
});

// ── the legacy branch's campus fill (§5.5 step 4) ─────────────────────────

test("legacy campus: the label today's bundles send fills campus_id too", () => {
  // Exactly what OnboardingMobile.tsx:331 and onboarding.html:847 send.
  assert.deepEqual(
    legacyCampusPatch("IU Indianapolis", { school_system: "iu", campus_id: null }),
    { campus_id: "indianapolis", school: "IU Indianapolis" },
  );
  // Renamed ids still land: the old picker's "IU Bloomington" is iu-bloomington.
  assert.deepEqual(
    legacyCampusPatch("IU Bloomington", { school_system: "iu", campus_id: null }),
    { campus_id: "iu-bloomington", school: "IU Bloomington" },
  );
  // The shared community works from the Purdue side too, and the label it
  // dual-writes says Purdue rather than claiming the student is at IU.
  assert.deepEqual(
    legacyCampusPatch("Purdue Indianapolis", { school_system: "purdue", campus_id: null }),
    { campus_id: "indianapolis", school: "Purdue Indianapolis" },
  );
});

test("legacy campus: a campus already on the row is never moved, and the label follows it", () => {
  // The old picker preselects Indianapolis (OnboardingMobile.tsx:179), so a
  // finish must not move a student who chose Bloomington on the step route —
  // and must not leave "IU Indianapolis" behind in the legacy column either.
  assert.deepEqual(
    legacyCampusPatch("IU Indianapolis", {
      school_system: "iu",
      campus_id: "iu-bloomington",
    }),
    { school: "IU Bloomington" },
  );
  // Same campus, same label: the save is a no-op in everything but name.
  assert.deepEqual(
    legacyCampusPatch("IU Indianapolis", {
      school_system: "iu",
      campus_id: "indianapolis",
    }),
    { school: "IU Indianapolis" },
  );
});

test("legacy campus: nothing is written that the DB trigger would reject", () => {
  const noWrite = [
    // No system stamped (unverified, or a pre-M1 row): `null = any(systems)`
    // is null, so users_campus_in_system raises on ANY campus.
    ["IU Indianapolis", { school_system: null, campus_id: null }],
    ["IU Indianapolis", { campus_id: null }],
    ["IU Indianapolis", { school_system: "purdue-ish", campus_id: null }],
    // The other university's campus.
    ["Purdue West Lafayette", { school_system: "iu", campus_id: null }],
    ["IU Bloomington", { school_system: "purdue", campus_id: null }],
    // Labels with no campus behind them.
    ["IU Online", { school_system: "iu", campus_id: null }],
    ["iu.edu", { school_system: "iu", campus_id: null }],
  ] as const;
  for (const [label, row] of noWrite) {
    assert.deepEqual(legacyCampusPatch(label, row), {}, `${label} should write nothing`);
  }
});

test("legacy campus: a row holding a campus it may not keep is treated as unset", () => {
  // Only reachable by bypassing the DB trigger. The bad campus is left alone
  // (this branch never clears one), and no new one is written on top of it.
  assert.deepEqual(
    legacyCampusPatch("IU Indianapolis", {
      school_system: "iu",
      campus_id: "purdue-west-lafayette",
    }),
    {},
  );
});

test("legacy campus: a save that carries no campus changes none", () => {
  const row = { school_system: "iu", campus_id: null };
  // `sanitizeOnboardingProfile` omits the key when the body sent no campus…
  assert.deepEqual(legacyCampusPatch(undefined, row), {});
  // …and writes "" for an explicit "Not set". Clearing is not this branch's
  // job: the student keeps whatever campus they have.
  assert.deepEqual(legacyCampusPatch("", row), {});
  assert.deepEqual(legacyCampusPatch("   ", row), {});
  assert.deepEqual(legacyCampusPatch(null, row), {});
  assert.deepEqual(legacyCampusPatch(42, row), {});
  // A missing row (the read failed) is not a reason to guess.
  assert.deepEqual(legacyCampusPatch("IU Indianapolis", null), {});
  assert.deepEqual(legacyCampusPatch("IU Indianapolis", undefined), {});
});
