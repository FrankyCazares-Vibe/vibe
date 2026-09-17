/**
 * Tests for the onboarding draft (`draft.ts`, plan §3.3 layer L1).
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/onboarding/draft.test.ts
 *
 * WHY THE RESOLVE HOOK: same reason as `src/lib/iu/campuses.test.ts`. Node's
 * type stripping doesn't add file extensions, and tsc (without
 * `allowImportingTsExtensions`) refuses an import ending in ".ts", so the
 * module loads extensionless through dynamic `import()` after an in-thread
 * resolve hook that retries a failed relative specifier with ".ts".
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
  throw new Error("draft.test.ts needs Node >= 22.15 (module.registerHooks)");
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
  ONBOARDING_DRAFT_FIELD_KEYS,
  ONBOARDING_DRAFT_KEY_PREFIX,
  ONBOARDING_DRAFT_SAVE_DELAY_MS,
  ONBOARDING_DRAFT_TTL_MS,
  clearDraft,
  createDraftSaver,
  flushDraftOnHide,
  loadDraft,
  onboardingDraftKey,
  onboardingResumeStep,
  onboardingStartStep,
  saveDraft,
  typedDraftFields,
} = await import("./draft");

const T0 = Date.UTC(2026, 8, 15, 12, 0, 0);
const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

function throwingStorage() {
  const boom = () => {
    throw new Error("SecurityError: storage is disabled");
  };
  return {
    get length(): number {
      return boom();
    },
    key: boom,
    getItem: boom,
    setItem: boom,
    removeItem: boom,
  };
}

const at = (ms: number) => () => ms;

test("key is vibe_onb_draft_v1:<userId>; blank or non-string ids have no key", () => {
  assert.equal(ONBOARDING_DRAFT_KEY_PREFIX, "vibe_onb_draft_v1:");
  assert.equal(onboardingDraftKey(USER), `vibe_onb_draft_v1:${USER}`);
  assert.equal(onboardingDraftKey(`  ${USER} `), `vibe_onb_draft_v1:${USER}`);
  assert.equal(onboardingDraftKey(""), null);
  assert.equal(onboardingDraftKey("   "), null);
  assert.equal(onboardingDraftKey(null), null);
  assert.equal(onboardingDraftKey(42), null);
});

test("save then load round-trips the {v, step, maxStep, fields, at} schema", () => {
  const storage = memoryStorage();
  const ok = saveDraft(
    USER,
    { step: 3, maxStep: 3, fields: { name: "Franky", year: 3, lookingFor: ["exploring"], here: true } },
    { storage, now: at(T0) },
  );
  assert.equal(ok, true);
  const stored = JSON.parse(storage.map.get(`vibe_onb_draft_v1:${USER}`) as string);
  assert.deepEqual(stored, {
    v: 1,
    step: 3,
    maxStep: 3,
    fields: { name: "Franky", year: 3, lookingFor: ["exploring"], here: true },
    at: T0,
  });
  assert.deepEqual(loadDraft(USER, { storage, now: at(T0 + 1000) }), stored);
});

test("drafts are per user", () => {
  const storage = memoryStorage();
  saveDraft(USER, { step: 2, maxStep: 2, fields: { campus: "indianapolis" } }, { storage, now: at(T0) });
  assert.equal(loadDraft(OTHER, { storage, now: at(T0) }), null);
  assert.equal(loadDraft(USER, { storage, now: at(T0) })?.fields.campus, "indianapolis");
});

test("TTL: alive until 14 days, gone (and removed) at 14 days", () => {
  assert.equal(ONBOARDING_DRAFT_TTL_MS, 14 * 24 * 60 * 60 * 1000);
  const storage = memoryStorage();
  saveDraft(USER, { step: 4, maxStep: 5, fields: {} }, { storage, now: at(T0) });
  assert.ok(loadDraft(USER, { storage, now: at(T0 + ONBOARDING_DRAFT_TTL_MS - 1) }));
  assert.equal(storage.map.size, 1);
  assert.equal(loadDraft(USER, { storage, now: at(T0 + ONBOARDING_DRAFT_TTL_MS) }), null);
  assert.equal(storage.map.size, 0, "expired draft is removed");
});

test("a draft stamped far in the future is treated as corrupt", () => {
  const storage = memoryStorage();
  saveDraft(USER, { step: 2, maxStep: 2, fields: {} }, { storage, now: at(T0 + 3 * 24 * 60 * 60 * 1000) });
  assert.equal(loadDraft(USER, { storage, now: at(T0) }), null);
  assert.equal(storage.map.size, 0);
});

test("unreadable drafts load as null and are removed", () => {
  const key = `vibe_onb_draft_v1:${USER}`;
  const bad = [
    "{not json",
    "null",
    "[]",
    JSON.stringify({ v: 2, step: 2, maxStep: 2, fields: {}, at: T0 }),
    JSON.stringify({ v: 1, step: 0, maxStep: 2, fields: {}, at: T0 }),
    JSON.stringify({ v: 1, step: 7, maxStep: 7, fields: {}, at: T0 }),
    JSON.stringify({ v: 1, step: 2.5, maxStep: 3, fields: {}, at: T0 }),
    JSON.stringify({ v: 1, step: 2, maxStep: 2, fields: [], at: T0 }),
    JSON.stringify({ v: 1, step: 2, maxStep: 2, fields: {}, at: "yesterday" }),
  ];
  for (const raw of bad) {
    const storage = memoryStorage({ [key]: raw });
    assert.equal(loadDraft(USER, { storage, now: at(T0) }), null, raw);
    assert.equal(storage.map.has(key), false, `removed: ${raw}`);
  }
});

test("maxStep is never below step; out-of-range steps are refused on save", () => {
  const storage = memoryStorage();
  assert.equal(saveDraft(USER, { step: 4, maxStep: 2, fields: {} }, { storage, now: at(T0) }), true);
  assert.equal(loadDraft(USER, { storage, now: at(T0) })?.maxStep, 4);
  assert.equal(saveDraft(USER, { step: 0, maxStep: 2, fields: {} }, { storage, now: at(T0) }), false);
  assert.equal(saveDraft(USER, { step: 9, maxStep: 9, fields: {} }, { storage, now: at(T0) }), false);
  assert.equal(saveDraft("", { step: 2, maxStep: 2, fields: {} }, { storage, now: at(T0) }), false);
});

test("fields keep only JSON-safe shapes and can't pollute prototypes", () => {
  const storage = memoryStorage();
  const fields = JSON.parse(
    '{"name":"A","n":1,"list":["x",2,"y"],"obj":{"a":1},"__proto__":{"polluted":true}}',
  );
  fields.fn = () => 1;
  fields.inf = Infinity;
  saveDraft(USER, { step: 3, maxStep: 3, fields }, { storage, now: at(T0) });
  const draft = loadDraft(USER, { storage, now: at(T0) });
  assert.deepEqual(draft?.fields, { name: "A", n: 1, list: ["x", "y"] });
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

test("storage that throws on every access: load null, save false, clear quiet", () => {
  const storage = throwingStorage();
  assert.equal(loadDraft(USER, { storage, now: at(T0) }), null);
  assert.equal(saveDraft(USER, { step: 2, maxStep: 2, fields: {} }, { storage, now: at(T0) }), false);
  assert.doesNotThrow(() => clearDraft(USER, { storage }));
  assert.doesNotThrow(() => clearDraft(undefined, { storage }));
});

test("no storage at all (null) is handled", () => {
  assert.equal(loadDraft(USER, { storage: null }), null);
  assert.equal(saveDraft(USER, { step: 2, maxStep: 2, fields: {} }, { storage: null }), false);
  assert.doesNotThrow(() => clearDraft(USER, { storage: null }));
});

test("a quota error on write returns false", () => {
  const storage = memoryStorage();
  storage.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  assert.equal(saveDraft(USER, { step: 2, maxStep: 2, fields: {} }, { storage, now: at(T0) }), false);
});

test("the default localStorage accessor throwing is handled", (t) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  if (original && !original.configurable) {
    t.skip("globalThis.localStorage is not configurable in this runtime");
    return;
  }
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("SecurityError: The operation is insecure.");
    },
  });
  try {
    assert.equal(loadDraft(USER), null);
    assert.equal(saveDraft(USER, { step: 2, maxStep: 2, fields: {} }), false);
    assert.doesNotThrow(() => clearDraft(USER));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});

test("clearDraft(userId) removes one draft; clearDraft() removes every draft and nothing else", () => {
  const storage = memoryStorage({ vibe_tour_pending: "campus", other: "keep" });
  saveDraft(USER, { step: 2, maxStep: 2, fields: {} }, { storage, now: at(T0) });
  saveDraft(OTHER, { step: 3, maxStep: 3, fields: {} }, { storage, now: at(T0) });
  clearDraft(USER, { storage });
  assert.equal(storage.map.has(`vibe_onb_draft_v1:${USER}`), false);
  assert.equal(storage.map.has(`vibe_onb_draft_v1:${OTHER}`), true);
  saveDraft(USER, { step: 2, maxStep: 2, fields: {} }, { storage, now: at(T0) });
  clearDraft(undefined, { storage });
  assert.deepEqual([...storage.map.keys()].sort(), ["other", "vibe_tour_pending"]);
});

test("saver debounces 300 ms and writes only the latest draft", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const storage = memoryStorage();
  const saver = createDraftSaver(USER, { storage, now: at(T0) });
  assert.equal(ONBOARDING_DRAFT_SAVE_DELAY_MS, 300);
  saver.schedule({ step: 3, maxStep: 3, fields: { name: "F" } });
  t.mock.timers.tick(200);
  saver.schedule({ step: 3, maxStep: 3, fields: { name: "Fr" } });
  t.mock.timers.tick(299);
  assert.equal(storage.map.size, 0, "nothing written before 300 ms of quiet");
  assert.equal(saver.hasPending(), true);
  t.mock.timers.tick(1);
  assert.equal(loadDraft(USER, { storage, now: at(T0) })?.fields.name, "Fr");
  assert.equal(saver.hasPending(), false);
});

test("saver flush writes immediately; cancel drops the queued write", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const storage = memoryStorage();
  const saver = createDraftSaver(USER, { storage, now: at(T0) });
  saver.schedule({ step: 2, maxStep: 2, fields: { campus: "indianapolis" } });
  assert.equal(saver.flush(), true);
  assert.equal(loadDraft(USER, { storage, now: at(T0) })?.fields.campus, "indianapolis");
  assert.equal(saver.flush(), false, "nothing left to flush");

  saver.schedule({ step: 3, maxStep: 3, fields: { campus: "iu-bloomington" } });
  saver.cancel();
  t.mock.timers.tick(1000);
  assert.equal(loadDraft(USER, { storage, now: at(T0) })?.fields.campus, "indianapolis");
});

test("a clearDraft after schedule discards the queued write (no resurrection after Finish)", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const storage = memoryStorage();
  const saver = createDraftSaver(USER, { storage, now: at(T0) });
  saver.schedule({ step: 6, maxStep: 6, fields: { name: "F" } });
  clearDraft(USER, { storage });
  t.mock.timers.tick(1000);
  assert.equal(storage.map.size, 0);
  assert.equal(saver.flush(), false);

  saver.schedule({ step: 2, maxStep: 2, fields: {} });
  assert.equal(saver.flush(), true, "later schedules still write");
});

test("flushDraftOnHide is a safe no-op outside the browser", () => {
  let flushed = 0;
  const off = flushDraftOnHide({ flush: () => ++flushed > 0 });
  assert.equal(typeof off, "function");
  assert.doesNotThrow(off);
  assert.equal(flushed, 0);
});

test("start step: draft wins (capped at maxStep); else confirmed campus + handle", () => {
  const confirmed = { campusId: "indianapolis", campusConfirmed: true };
  assert.equal(onboardingStartStep({ step: 5, maxStep: 5 }, { campusId: null }), 5);
  assert.equal(onboardingStartStep({ step: 5, maxStep: 3 }, confirmed), 3);
  assert.equal(onboardingStartStep(null, { ...confirmed, hasRealHandle: true }), 4);
  assert.equal(onboardingStartStep(null, { ...confirmed, hasRealHandle: false }), 3);
  assert.equal(onboardingStartStep(null, { campusId: null, hasRealHandle: true }), 1);
  assert.equal(onboardingStartStep(undefined, {}), 1);
});

test("start step: a backfilled (unconfirmed) campus doesn't skip the campus screen", () => {
  assert.equal(
    onboardingStartStep(null, { campusId: "indianapolis", campusConfirmed: false, hasRealHandle: true }),
    1,
  );
  assert.equal(onboardingStartStep(null, { campusId: "indianapolis", hasRealHandle: true }), 1);
  // A stamp kept across a system change with the campus cleared isn't a saved campus.
  assert.equal(onboardingStartStep(null, { campusId: null, campusConfirmed: true, hasRealHandle: true }), 1);
});

test("resume step: the draft's step, pulled back to an unsaved campus or handle", () => {
  assert.equal(onboardingResumeStep({ step: 5, maxStep: 5 }, {}), 2);
  assert.equal(
    onboardingResumeStep({ step: 5, maxStep: 5 }, { campusId: "indianapolis", campusConfirmed: true }),
    3,
  );
  assert.equal(
    onboardingResumeStep(
      { step: 6, maxStep: 6 },
      { campusId: "indianapolis", campusConfirmed: true, hasRealHandle: true },
    ),
    6,
  );
  assert.equal(onboardingResumeStep({ step: 4, maxStep: 4 }, { systemKnown: false, hasRealHandle: true }), 4);
  assert.equal(onboardingResumeStep({ step: 4, maxStep: 4 }, { systemKnown: false }), 3);
  assert.equal(
    onboardingResumeStep(
      { step: 5, maxStep: 3 },
      { campusId: "indianapolis", campusConfirmed: true, hasRealHandle: true },
    ),
    3,
  );
  // An unconfirmed (backfilled) campus isn't a saved one.
  assert.equal(
    onboardingResumeStep({ step: 4, maxStep: 4 }, { campusId: "indianapolis", campusConfirmed: false, hasRealHandle: true }),
    2,
  );
  // Nothing to pull back from on the first two screens.
  assert.equal(onboardingResumeStep({ step: 2, maxStep: 5 }, {}), 2);
  assert.equal(onboardingResumeStep({ step: 1, maxStep: 1 }, {}), 1);
});

test("resume step: with no draft it equals the start step, for every saved combination", () => {
  for (const campusId of [null, "indianapolis"]) {
    for (const campusConfirmed of [true, false, undefined]) {
      for (const hasRealHandle of [true, false]) {
        for (const systemKnown of [true, false, undefined]) {
          const saved = { campusId, campusConfirmed, hasRealHandle, systemKnown };
          assert.equal(
            onboardingResumeStep(null, saved),
            onboardingStartStep(null, saved),
            JSON.stringify(saved),
          );
        }
      }
    }
  }
});

test("draft field keys: the exact ten, in order, frozen", () => {
  assert.deepEqual(
    [...ONBOARDING_DRAFT_FIELD_KEYS],
    ["campus_id", "name", "handle", "bio", "major", "department", "year", "interests", "skills", "looking_for"],
  );
  assert.equal(Object.isFrozen(ONBOARDING_DRAFT_FIELD_KEYS), true);
});

test("typedDraftFields keeps only well-typed known keys", () => {
  assert.deepEqual(typedDraftFields(null), {});
  assert.deepEqual(typedDraftFields(undefined), {});
  assert.deepEqual(typedDraftFields({ name: "Ana", year: "3" }), { name: "Ana", year: "3" });
  assert.deepEqual(typedDraftFields({ name: "Ana", year: 3 }), { name: "Ana" });
  assert.deepEqual(typedDraftFields({ year: "7" }), {});
  assert.deepEqual(typedDraftFields({ year: "" }), { year: "" });
  assert.deepEqual(typedDraftFields({ interests: ["a"], skills: "Figma, Python" }), { skills: "Figma, Python" });
  assert.deepEqual(typedDraftFields({ work_experience: "x", resume_url: "https://x" }), {});
  assert.deepEqual(typedDraftFields({ campus_id: null, handle: 7, bio: true }), {});
  assert.deepEqual(
    typedDraftFields({ looking_for: ["exploring", "exploring", "finding-clubs"] }),
    { looking_for: ["exploring", "finding-clubs"] },
  );
  assert.deepEqual(typedDraftFields({ looking_for: "exploring" }), {});
});

test("typedDraftFields: a saveDraft → loadDraft round trip of all ten keys comes back unchanged", () => {
  const storage = memoryStorage();
  const fields = {
    campus_id: "indianapolis",
    name: "Ana Ruiz",
    handle: "ana_r",
    bio: "Line one\nline two",
    major: "Informatics",
    department: "Luddy School of Informatics",
    year: "5",
    interests: "robots, film\nclimbing",
    skills: "Figma, Python",
    looking_for: ["meeting-people", "exploring"],
  };
  assert.equal(saveDraft(USER, { step: 3, maxStep: 4, fields }, { storage, now: () => T0 }), true);
  const loaded = loadDraft(USER, { storage, now: () => T0 + 1000 });
  assert.ok(loaded);
  assert.deepEqual(typedDraftFields(loaded.fields), fields);
  assert.deepEqual(Object.keys(typedDraftFields(loaded.fields)), [...ONBOARDING_DRAFT_FIELD_KEYS]);
});
