/**
 * Tests for `settings-campus-card.ts` (plan wave 3 B15, critic W3 L4 + L5).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/profile/settings-campus-card.test.ts
 *
 * Same resolve hook as `profile-campus-write.test.ts`: "@/x" → "src/x.ts", and
 * a failed extensionless relative specifier retried with ".ts". The module
 * loads through dynamic `import()` so the hook is registered first.
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
  throw new Error("settings-campus-card.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  CAMPUS_CONFIRM_LOCK_COPY,
  CAMPUS_SAVE_FAILURE_COPY,
  CAMPUS_SWITCH_LOCK_COPY,
  campusOptionLabel,
  campusPickStep,
  campusSaveFailure,
  nextAvailableAfterWrite,
  settingsCampusCardView,
} = await import("./settings-campus-card");
const { campusesForSystem } = await import("../iu/campuses");

const DAY = 24 * 60 * 60 * 1000;
/** 2026-09-17, 8am in Indianapolis. */
const NOW = Date.parse("2026-09-17T12:00:00.000Z");

/** A verified IU student at Indianapolis, confirmed, onboarded, no clock running. */
const BASE = {
  schoolVerified: true,
  schoolSystem: "iu" as "iu" | "purdue" | null,
  campusId: "indianapolis" as string | null,
  campusConfirmed: true,
  campusChangeAvailableAt: null as string | null,
  onboarded: true,
};

const view = (over: Partial<typeof BASE> = {}) =>
  settingsCampusCardView({ ...BASE, ...over }, NOW);

// ── mode ─────────────────────────────────────────────────────────────────

test("unverified: school email not verified, or no system → no options, no select value", () => {
  for (const v of [view({ schoolVerified: false }), view({ schoolSystem: null })]) {
    assert.equal(v.mode, "unverified");
    assert.deepEqual(v.options, []);
    assert.equal(v.value, "");
    assert.equal(v.shortName, null);
    assert.equal(v.sub, null);
    assert.equal(v.locked, false);
    assert.equal(v.note, null);
  }
});

test("pick: no campus → value '', options start Indianapolis then 'Fort Wayne — not open yet'", () => {
  const v = view({ campusId: null, campusConfirmed: false });
  assert.equal(v.mode, "pick");
  assert.equal(v.value, "");
  assert.equal(v.shortName, null);
  assert.equal(v.sub, null);
  assert.deepEqual(v.options[0], { id: "indianapolis", label: "Indianapolis" });
  assert.deepEqual(v.options[1], { id: "fort-wayne", label: "Fort Wayne — not open yet" });
  assert.equal(v.options.length, campusesForSystem("iu").length);
  assert.ok(!v.options.some((o) => /not set/i.test(o.label)), "no 'Not set' option");
});

test("pick: a campus outside the student's university is not offered back as the value", () => {
  const v = view({ schoolSystem: "purdue", campusId: "iu-bloomington", campusConfirmed: true });
  assert.equal(v.mode, "pick");
  assert.equal(v.value, "");
  assert.equal(view({ campusId: "not-a-campus" }).mode, "pick");
});

test("confirm: a campus that was never stamped asks to be confirmed", () => {
  const v = view({ campusConfirmed: false });
  assert.equal(v.mode, "confirm");
  assert.equal(v.value, "indianapolis");
  assert.equal(v.shortName, "Indianapolis");
  assert.equal(v.sub, "IU Indianapolis · one community with Purdue Indianapolis (formerly IUPUI)");
  assert.equal(v.locked, false);
  assert.equal(v.note, null);
});

test("set: sub-line for a single-system campus is its full name", () => {
  const v = view({ campusId: "iu-bloomington" });
  assert.equal(v.mode, "set");
  assert.equal(v.value, "iu-bloomington");
  assert.equal(v.shortName, "Bloomington");
  assert.equal(v.sub, "IU Bloomington");
});

// ── the 30-day rule ──────────────────────────────────────────────────────

test("set + locked: a future availableAt disables the select with the dated note", () => {
  const v = view({ campusChangeAvailableAt: "2026-10-15T16:00:00.000Z" });
  assert.equal(v.mode, "set");
  assert.equal(v.locked, true);
  assert.equal(v.note, "You can change your campus again on October 15.");
});

test("the note's day is Indianapolis's calendar day, not UTC's", () => {
  // 02:30 UTC on Oct 16 is still Oct 15 in Indianapolis.
  const v = view({ campusChangeAvailableAt: "2026-10-16T02:30:00.000Z" });
  assert.equal(v.note, "You can change your campus again on October 15.");
});

test("a past availableAt is not locked", () => {
  const v = view({ campusChangeAvailableAt: new Date(NOW - DAY).toISOString() });
  assert.equal(v.locked, false);
  assert.equal(v.note, null);
});

test("an unparseable availableAt is not locked", () => {
  assert.equal(view({ campusChangeAvailableAt: "soon" }).locked, false);
});

test("not onboarded yet: the server starts no clock, so a future availableAt doesn't lock", () => {
  const v = view({ onboarded: false, campusChangeAvailableAt: "2026-10-15T16:00:00.000Z" });
  assert.equal(v.locked, false);
  assert.equal(v.note, null);
});

// ── options per university ───────────────────────────────────────────────

test("Purdue options have no IU-only campus, and share Indianapolis + Fort Wayne first", () => {
  const v = view({ schoolSystem: "purdue", campusId: "indianapolis" });
  const ids = v.options.map((o) => o.id);
  assert.deepEqual(ids.slice(0, 2), ["indianapolis", "fort-wayne"]);
  assert.ok(!ids.some((id) => id.startsWith("iu-")), `IU-only campus in ${ids.join(",")}`);
  assert.ok(ids.includes("purdue-west-lafayette"));
  assert.ok(v.options.some((o) => o.label === "West Lafayette — not open yet"));
  assert.equal(v.sub, "Purdue Indianapolis · one community with IU Indianapolis (formerly IUPUI)");
});

test("IU options have no Purdue-only campus", () => {
  assert.ok(!view().options.some((o) => o.id.startsWith("purdue-")));
});

test("campusOptionLabel marks closed campuses only", () => {
  assert.equal(campusOptionLabel({ shortName: "Indianapolis", isOpen: true }), "Indianapolis");
  assert.equal(campusOptionLabel({ shortName: "Kokomo", isOpen: false }), "Kokomo — not open yet");
});

// ── nextAvailableAfterWrite ──────────────────────────────────────────────

test("nextAvailableAfterWrite: null before onboarding is done, now + 30 days after", () => {
  assert.equal(nextAvailableAfterWrite(false), null);
  assert.equal(nextAvailableAfterWrite(false, NOW), null);
  assert.equal(nextAvailableAfterWrite(true, NOW), new Date(NOW + 30 * DAY).toISOString());
  // A card fed the write's own availableAt locks straight away.
  const after = view({ campusChangeAvailableAt: nextAvailableAfterWrite(true, NOW) });
  assert.equal(after.locked, true);
  assert.equal(after.note, "You can change your campus again on October 17.");
});

// ── picking in the select ────────────────────────────────────────────────

test("campusPickStep: onboarded + no campus yet stages 'Make … your campus?' with the 30-day line", () => {
  assert.deepEqual(campusPickStep(view({ campusId: null, campusConfirmed: false }), true, "indianapolis"), {
    kind: "stage",
    title: "Make Indianapolis your campus?",
    body: "You can't change your campus again for 30 days.",
  });
});

test("campusPickStep: onboarded + a closed campus says it isn't open yet", () => {
  assert.deepEqual(campusPickStep(view(), true, "fort-wayne"), {
    kind: "stage",
    title: "Switch to Fort Wayne?",
    body: "Fort Wayne isn't open yet. You can't change your campus again for 30 days.",
  });
  // pick mode, closed campus
  const pick = campusPickStep(view({ campusId: null, campusConfirmed: false }), true, "iu-bloomington");
  assert.equal(pick.kind, "stage");
  assert.equal(pick.kind === "stage" && pick.title, "Make Bloomington your campus?");
});

test("campusPickStep: confirm mode + Change to a different campus asks to switch; the same campus unstages", () => {
  const confirm = view({ campusConfirmed: false });
  assert.equal(confirm.mode, "confirm");
  const step = campusPickStep(confirm, true, "iu-kokomo");
  assert.equal(step.kind, "stage");
  assert.equal(step.kind === "stage" && step.title, "Switch to Kokomo?");
  assert.deepEqual(campusPickStep(confirm, true, "indianapolis"), { kind: "unstage" });
});

test("campusPickStep: before onboarding is done a pick saves straight away", () => {
  assert.deepEqual(campusPickStep(view({ onboarded: false }), false, "fort-wayne"), { kind: "save" });
  assert.deepEqual(
    campusPickStep(view({ campusId: null, campusConfirmed: false, onboarded: false }), false, "indianapolis"),
    { kind: "save" },
  );
});

test("campusPickStep: locked, unverified, or a campus outside the university does nothing", () => {
  const locked = view({ campusChangeAvailableAt: new Date(NOW + 5 * DAY).toISOString() });
  assert.equal(locked.locked, true);
  assert.deepEqual(campusPickStep(locked, true, "fort-wayne"), { kind: "ignore" });
  assert.deepEqual(campusPickStep(view({ schoolVerified: false }), true, "indianapolis"), { kind: "ignore" });
  assert.deepEqual(campusPickStep(view(), true, "purdue-west-lafayette"), { kind: "ignore" });
  assert.deepEqual(campusPickStep(view(), true, ""), { kind: "ignore" });
  assert.deepEqual(campusPickStep(view(), true, "nowhere"), { kind: "ignore" });
});

// ── failures ─────────────────────────────────────────────────────────────

test("campusSaveFailure: too soon shows the server's dated line and locks", () => {
  assert.deepEqual(
    campusSaveFailure({
      code: "campus_change_too_soon",
      error: "You can change your campus again on October 15.",
      message: "You're going a little fast. Try again in a minute.",
    }),
    { text: "You can change your campus again on October 15.", locked: true },
  );
  assert.deepEqual(
    campusSaveFailure({ code: "campus_change_too_soon", error: null, message: "x" }),
    { text: "You changed your campus recently. Try again later.", locked: true },
  );
});

test("campusSaveFailure: campus codes show server copy; everything else the mapped message", () => {
  assert.deepEqual(
    campusSaveFailure({ code: "campus_not_in_system", error: "That campus isn't part of your university.", message: "m" }),
    { text: "That campus isn't part of your university.", locked: false },
  );
  assert.deepEqual(
    campusSaveFailure({ code: null, error: "Unauthorized", message: "You've been signed out. Sign in and try again." }),
    { text: "You've been signed out. Sign in and try again.", locked: false },
  );
  assert.deepEqual(
    campusSaveFailure({ code: "terms_required", error: "Terms", message: "Accept the Terms first, then try again." }),
    { text: "Accept the Terms first, then try again.", locked: false },
  );
  assert.deepEqual(
    campusSaveFailure({ code: null, error: null, message: CAMPUS_SAVE_FAILURE_COPY }),
    { text: "Couldn't save your campus. Try again.", locked: false },
  );
});

test("campusSaveFailure: a Sign in / Review Terms action rides along; campus codes carry none", () => {
  const terms = { label: "Review Terms", href: "/auth/terms?next=%2Fsettings" };
  assert.deepEqual(
    campusSaveFailure({ code: "terms_required", error: "Terms", message: "Accept the Terms first, then try again.", action: terms }),
    { text: "Accept the Terms first, then try again.", locked: false, action: terms },
  );
  const signIn = { label: "Sign in", href: "/auth/login?next=%2Fsettings" };
  assert.deepEqual(
    campusSaveFailure({ code: null, error: "Unauthorized", message: "You've been signed out. Sign in and try again.", action: signIn }),
    { text: "You've been signed out. Sign in and try again.", locked: false, action: signIn },
  );
  assert.deepEqual(
    campusSaveFailure({ code: "campus_change_too_soon", error: "You can change your campus again on October 15.", message: "m", action: signIn }),
    { text: "You can change your campus again on October 15.", locked: true },
  );
});

test("copy constants", () => {
  assert.equal(CAMPUS_CONFIRM_LOCK_COPY, "Confirming locks your campus for 30 days.");
  assert.equal(CAMPUS_SWITCH_LOCK_COPY, "You can't change your campus again for 30 days.");
});
