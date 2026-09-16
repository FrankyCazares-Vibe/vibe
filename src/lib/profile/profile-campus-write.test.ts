/**
 * Tests for `profile-campus-write.ts` (plan wave 2 B6, critic A4 + C1).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/profile-campus-write.test.ts
 *
 * Same resolve hook as `onboarding-prefill.test.ts`: "@/x" → "src/x.ts", and a
 * failed extensionless relative specifier retried with ".ts". The module loads
 * through dynamic `import()` so the hook is registered first.
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
  throw new Error("profile-campus-write.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  CAMPUS_WRITE_COPY,
  campusBadgeForProfile,
  campusChangeAvailableAt,
  campusChangeTooSoonCopy,
  decideProfileCampusWrite,
  legacyCampusLabelForProfile,
  ownCampusFields,
  readCampusIntent,
} = await import("./profile-campus-write");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const RECENT = new Date(NOW - 5 * DAY).toISOString();
const OLD = new Date(NOW - 40 * DAY).toISOString();

/** An IU student at Indianapolis, campus chosen 5 days ago, onboarded. */
const IU_INDY = {
  school: "IU Indianapolis",
  school_verified: true,
  school_system: "iu",
  campus_id: "indianapolis",
  campus_set_at: RECENT,
};

function decide(body: Record<string, unknown>, row: Record<string, unknown> | null, onboarded = true) {
  return decideProfileCampusWrite({ body, row, onboarded, now: NOW });
}

// ── readCampusIntent ─────────────────────────────────────────────────────

test("intent: campus_id wins over school; school over campus; absent otherwise", () => {
  assert.deepEqual(readCampusIntent({ campus_id: "a", school: "b" }), { kind: "explicit", raw: "a" });
  assert.deepEqual(readCampusIntent({ school: "b", campus: "c" }), { kind: "legacy", raw: "b" });
  assert.deepEqual(readCampusIntent({ campus: "c" }), { kind: "legacy", raw: "c" });
  assert.deepEqual(readCampusIntent({ bio: "x" }), { kind: "absent" });
  assert.deepEqual(readCampusIntent(null), { kind: "absent" });
});

// ── Legacy shape (critic A4) ─────────────────────────────────────────────

test("legacy: no campus key → absent", () => {
  assert.deepEqual(decide({ bio: "hi" }, IU_INDY), { kind: "absent" });
});

test("legacy: '' and null are no-ops, with or without a campus", () => {
  for (const school of ["", "   ", null]) {
    assert.deepEqual(decide({ school }, IU_INDY), { kind: "noop" });
    assert.deepEqual(decide({ school }, { ...IU_INDY, campus_id: null, campus_set_at: null }), {
      kind: "noop",
    });
  }
});

test("legacy: the current campus's label is a no-op, even inside the 30 days and unstamped", () => {
  for (const school of ["IU Indianapolis", "iu indianapolis", "indianapolis", "Purdue Indianapolis"]) {
    assert.deepEqual(decide({ school }, IU_INDY), { kind: "noop" });
    // Backfilled row: campus set, never confirmed. A bio save must NOT confirm it.
    assert.deepEqual(decide({ school }, { ...IU_INDY, campus_set_at: null }), { kind: "noop" });
  }
  assert.deepEqual(decide({ campus: "IU Indianapolis" }, IU_INDY), { kind: "noop" });
});

test("legacy: junk, non-strings and IU Online are campus_invalid", () => {
  for (const school of ["iu.edu", "IU Online", 7, ["IU Indianapolis"]]) {
    const r = decide({ school }, IU_INDY);
    assert.equal(r.kind, "reject");
    if (r.kind === "reject") {
      assert.equal(r.rejection.status, 400);
      assert.equal(r.rejection.code, "campus_invalid");
    }
  }
});

test("legacy: a different campus inside 30 days → 429 with availableAt, no write", () => {
  const r = decide({ school: "IU Bloomington" }, IU_INDY);
  assert.equal(r.kind, "reject");
  if (r.kind === "reject") {
    assert.equal(r.rejection.status, 429);
    assert.equal(r.rejection.code, "campus_change_too_soon");
    assert.equal(r.rejection.availableAt, new Date(Date.parse(RECENT) + 30 * DAY).toISOString());
    assert.equal(r.rejection.error, "You can change your campus again on October 10.");
  }
});

test("legacy: a first pick from no campus is free and dual-writes the label", () => {
  const row = { ...IU_INDY, school: "", campus_id: null, campus_set_at: null };
  assert.deepEqual(decide({ school: "IU Bloomington" }, row), {
    kind: "write",
    patch: {
      campus_id: "iu-bloomington",
      campus_set_at: new Date(NOW).toISOString(),
      school: "IU Bloomington",
    },
  });
});

test("legacy: a different campus after 30 days writes", () => {
  const r = decide({ school: "bloomington" }, { ...IU_INDY, campus_set_at: OLD });
  assert.equal(r.kind, "write");
  if (r.kind === "write") assert.equal(r.patch.campus_id, "iu-bloomington");
});

// ── Explicit campus_id ───────────────────────────────────────────────────

test("explicit: another university's campus → 400 campus_not_in_system", () => {
  const r = decide({ campus_id: "purdue-west-lafayette" }, IU_INDY);
  assert.deepEqual(r, {
    kind: "reject",
    rejection: {
      status: 400,
      code: "campus_not_in_system",
      error: "That campus isn't part of your university.",
    },
  });
});

test("explicit: unknown id, '' and null → 400 campus_invalid (no unset)", () => {
  for (const campus_id of ["nowhere", "", null, 3]) {
    const r = decide({ campus_id }, IU_INDY);
    assert.equal(r.kind, "reject");
    if (r.kind === "reject") assert.equal(r.rejection.code, "campus_invalid");
  }
});

test("explicit: confirming the unstamped current campus stamps it", () => {
  const r = decide({ campus_id: "indianapolis" }, { ...IU_INDY, campus_set_at: null });
  assert.deepEqual(r, {
    kind: "write",
    patch: {
      campus_id: "indianapolis",
      campus_set_at: new Date(NOW).toISOString(),
      school: "IU Indianapolis",
    },
  });
});

test("explicit: the same stamped campus is a no-op", () => {
  assert.deepEqual(decide({ campus_id: "indianapolis" }, IU_INDY), { kind: "noop" });
});

test("explicit: a change inside 30 days → 429; still onboarding → free", () => {
  const blocked = decide({ campus_id: "iu-kokomo" }, IU_INDY, true);
  assert.equal(blocked.kind, "reject");
  const free = decide({ campus_id: "iu-kokomo" }, IU_INDY, false);
  assert.equal(free.kind, "write");
});

test("explicit: the stamp survives a system change (critic B3)", () => {
  const row = { ...IU_INDY, school_system: "purdue", campus_id: null, school: "" };
  const r = decide({ campus_id: "purdue-west-lafayette" }, row);
  assert.equal(r.kind, "reject");
  if (r.kind === "reject") assert.equal(r.rejection.code, "campus_change_too_soon");
});

test("explicit: Purdue at Indianapolis dual-writes the Purdue label", () => {
  const row = { school: "", school_verified: true, school_system: "purdue", campus_id: null, campus_set_at: null };
  const r = decide({ campus_id: "indianapolis" }, row);
  assert.equal(r.kind, "write");
  if (r.kind === "write") assert.equal(r.patch.school, "Purdue Indianapolis");
});

test("explicit: unverified → 403, verified without system → 503, missing columns → 503", () => {
  const unverified = decide({ campus_id: "indianapolis" }, { school_verified: false, school_system: null, campus_id: null, campus_set_at: null });
  assert.equal(unverified.kind === "reject" && unverified.rejection.code, "school_unverified");
  assert.equal(unverified.kind === "reject" && unverified.rejection.status, 403);
  const noSystem = decide({ campus_id: "indianapolis" }, { school_verified: true, school_system: null, campus_id: null, campus_set_at: null });
  assert.equal(noSystem.kind === "reject" && noSystem.rejection.code, "system_missing");
  const preM1 = decide({ school: "IU Bloomington" }, { school: "IU Indianapolis", school_verified: true });
  assert.equal(preM1.kind === "reject" && preM1.rejection.code, "campus_not_ready");
  // …but before M1 the legacy label on the row still makes a re-send a no-op.
  assert.deepEqual(decide({ school: "IU Indianapolis" }, { school: "IU Indianapolis", school_verified: true }), {
    kind: "noop",
  });
});

test("copy: CAMPUS_WRITE_COPY carries the plan's campus_not_in_system line", () => {
  assert.equal(CAMPUS_WRITE_COPY.campus_not_in_system, "That campus isn't part of your university.");
  assert.equal(campusChangeTooSoonCopy("nope"), "You changed your campus recently. Try again later.");
});

// ── Read-outs ────────────────────────────────────────────────────────────

test("campusChangeAvailableAt: future only", () => {
  assert.equal(campusChangeAvailableAt(RECENT, NOW), new Date(Date.parse(RECENT) + 30 * DAY).toISOString());
  assert.equal(campusChangeAvailableAt(OLD, NOW), null);
  assert.equal(campusChangeAvailableAt(null, NOW), null);
  assert.equal(campusChangeAvailableAt("garbage", NOW), null);
});

test("badge: the legacy label still speaks when campus_id is null (repair window)", () => {
  // A legacy finish before verification leaves the label, legacyCampusPatch
  // can't stamp a campus with no system yet, and verification stamps only the
  // system. The badge and the picker must not go blank in that window.
  const row = { school_verified: true, school_system: "iu", campus_id: null, school: "IU Indianapolis" };
  assert.equal(campusBadgeForProfile(row), "IU Indianapolis");
  assert.equal(legacyCampusLabelForProfile(row), "IU Indianapolis");
  // …but never a label from the OTHER university's campus list.
  const purdue = { school_verified: true, school_system: "purdue", campus_id: null, school: "IU Bloomington" };
  assert.equal(campusBadgeForProfile(purdue), "Purdue verified");
  assert.equal(legacyCampusLabelForProfile(purdue), null);
  // A shared campus reads in the row's own system.
  const purdueIndy = { school_verified: true, school_system: "purdue", campus_id: null, school: "IU Indianapolis" };
  assert.equal(campusBadgeForProfile(purdueIndy), "Purdue Indianapolis");
  // campus_id still wins over a stale label.
  assert.equal(
    campusBadgeForProfile({ school_verified: true, school_system: "iu", campus_id: "iu-east", school: "IU Indianapolis" }),
    "IU East",
  );
  // The column stays the only source for SCOPE reads.
  assert.equal(ownCampusFields({ ...row, campus_set_at: null }, NOW).campusId, null);
  assert.equal(ownCampusFields({ ...row, campus_set_at: null }, NOW).campusConfirmed, false);
});

test("repair: an old bundle echoing the row's own label fills campus_id without stamping", () => {
  const row = {
    school: "IU Indianapolis",
    school_verified: true,
    school_system: "iu",
    campus_id: null,
    campus_set_at: null,
  };
  assert.deepEqual(decide({ school: "IU Indianapolis" }, row), {
    kind: "write",
    patch: { campus_id: "indianapolis", school: "IU Indianapolis" },
  });
  // Same for the `campus` key and a legacy id, and while still onboarding.
  assert.deepEqual(decide({ campus: "indianapolis" }, row, false), {
    kind: "write",
    patch: { campus_id: "indianapolis", school: "IU Indianapolis" },
  });
  // A DIFFERENT campus than the row's label is a real pick and does stamp.
  const pick = decide({ school: "IU Bloomington" }, row);
  assert.equal(pick.kind, "write");
  if (pick.kind === "write") assert.equal(pick.patch.campus_set_at, new Date(NOW).toISOString());
  // An explicit campus_id for that same campus IS the "Confirm your campus"
  // tap, so it stamps even though the label already named it.
  const confirm = decide({ campus_id: "indianapolis" }, row);
  assert.equal(confirm.kind, "write");
  if (confirm.kind === "write") assert.equal(confirm.patch.campus_set_at, new Date(NOW).toISOString());
  // A label outside the student's system is still refused, repair or not.
  const wrong = decide({ school: "IU Bloomington" }, { ...row, school: "IU Bloomington", school_system: "purdue" });
  assert.equal(wrong.kind === "reject" && wrong.rejection.code, "campus_not_in_system");
});

test("badge: system + campus, verified fallbacks, legacy label fallback, unverified none", () => {
  assert.equal(campusBadgeForProfile({ school_verified: true, school_system: "iu", campus_id: "indianapolis" }), "IU Indianapolis");
  assert.equal(campusBadgeForProfile({ school_verified: true, school_system: "purdue", campus_id: "indianapolis" }), "Purdue Indianapolis");
  assert.equal(campusBadgeForProfile({ school_verified: true, school_system: "purdue", campus_id: null }), "Purdue verified");
  assert.equal(campusBadgeForProfile({ school_verified: true, school_system: "iu", campus_id: "purdue-west-lafayette" }), "IU verified");
  // No system on the row (select without M1, or a missed backfill): the legacy label model.
  assert.equal(campusBadgeForProfile({ school_verified: true, school: "IU Indianapolis" }), "IU Indianapolis");
  assert.equal(campusBadgeForProfile({ school_verified: true, school: "iu.edu" }), "IU verified");
  assert.equal(campusBadgeForProfile({ school_verified: false, school_system: "iu", campus_id: "indianapolis" }), null);
});

test("legacy campus label for old bundles", () => {
  assert.equal(legacyCampusLabelForProfile({ school_system: "iu", campus_id: "indianapolis" }), "IU Indianapolis");
  assert.equal(legacyCampusLabelForProfile({ school_system: "purdue", campus_id: "indianapolis" }), "Purdue Indianapolis");
  assert.equal(legacyCampusLabelForProfile({ school_system: "iu", campus_id: null, school: "IU Indianapolis" }), "IU Indianapolis");
  assert.equal(legacyCampusLabelForProfile({ school_system: "iu", campus_id: null, school: "" }), null);
  assert.equal(legacyCampusLabelForProfile({ school: "IU Bloomington" }), "IU Bloomington");
  assert.equal(legacyCampusLabelForProfile({ school: "" }), null);
});

test("ownCampusFields: bootstrap shape", () => {
  assert.deepEqual(ownCampusFields({ ...IU_INDY }, NOW), {
    schoolSystem: "iu",
    campusId: "indianapolis",
    campusBadge: "IU Indianapolis",
    campusChangeAvailableAt: new Date(Date.parse(RECENT) + 30 * DAY).toISOString(),
    campusConfirmed: true,
  });
  assert.deepEqual(ownCampusFields({ school_verified: true, school_system: "iu", campus_id: "indianapolis", campus_set_at: null }, NOW), {
    schoolSystem: "iu",
    campusId: "indianapolis",
    campusBadge: "IU Indianapolis",
    campusChangeAvailableAt: null,
    campusConfirmed: false,
  });
  const fields = ownCampusFields({ school_verified: false, school_system: null, campus_id: null, campus_set_at: null }, NOW);
  assert.equal(fields.campusBadge, null);
  assert.equal(fields.schoolSystem, null);
  assert.ok(!("school_email" in fields));
});
