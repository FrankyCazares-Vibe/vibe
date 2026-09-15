/**
 * Tests for `handle-change.ts`: the pure `handleClaimPolicy`, and
 * `changeHandleForUser` against an in-memory fake of the service client, so
 * the default two-argument path (used by /api/me/handle and /api/me/profile)
 * is pinned alongside the `{ onboarding: true }` branch.
 *
 * Uses node:test (built-in, no deps). Run with:
 *   node --test --experimental-strip-types src/lib/profile/handle-change.test.ts
 *
 * WHY THE RESOLVE HOOK: same as `onboarding-prefill.test.ts` ("@/x" → "src/x.ts",
 * extensionless relative specifiers retried with ".ts"). In addition,
 * "@/lib/supabase/service" (which imports "server-only" and needs env keys)
 * resolves to a data: module whose `createSupabaseServiceClient` returns the
 * fake set on `globalThis` by each test. Nothing touches a real database.
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
  throw new Error("handle-change.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
const SERVICE_STUB_URL = `data:text/javascript,${encodeURIComponent(
  "export function createSupabaseServiceClient() { return globalThis.__vibeFakeServiceClient; }",
)}`;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/supabase/service") {
      return { url: SERVICE_STUB_URL, format: "module", shortCircuit: true };
    }
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

const { changeHandleForUser, handleClaimPolicy } = await import("./handle-change");
const { HANDLE_COOLDOWN_DAYS } = await import("./handle");

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

type Row = Record<string, unknown>;

/**
 * Minimal fake of the calls changeHandleForUser makes:
 *   from("users").select(cols).eq("id", uid).single()        (self read)
 *   from("users").select("id").eq("handle", h).maybeSingle() (taken check)
 *   from("users").update(payload).eq("id", uid)              (write)
 */
function installFakeService(self: Row | null, owners: Record<string, string> = {}) {
  const log = { selects: [] as string[], updates: [] as { payload: Row; id: unknown }[] };
  const client = {
    from(table: string) {
      assert.equal(table, "users");
      return {
        select(cols: string) {
          log.selects.push(cols);
          const filters: Row = {};
          const builder = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return builder;
            },
            async single() {
              assert.equal(filters.id, USER);
              if (!self) return { data: null, error: { message: "no rows" } };
              const data: Row = {};
              for (const c of cols.split(",")) data[c] = self[c] ?? null;
              return { data, error: null };
            },
            async maybeSingle() {
              const id = owners[String(filters.handle)];
              return { data: id ? { id } : null, error: null };
            },
          };
          return builder;
        },
        update(payload: Row) {
          return {
            async eq(col: string, val: unknown) {
              assert.equal(col, "id");
              log.updates.push({ payload, id: val });
              return { error: null };
            },
          };
        },
      };
    },
  };
  (globalThis as unknown as { __vibeFakeServiceClient: unknown }).__vibeFakeServiceClient = client;
  return log;
}

// ── handleClaimPolicy ────────────────────────────────────────────────────

test("policy: an onboarding claim before Finish is free", () => {
  for (const ottoAnswers of [null, undefined, {}, [], "x"]) {
    assert.deepEqual(
      handleClaimPolicy({ onboarding: true, ottoAnswers, handleChangedAt: daysAgo(1) }),
      { freeClaim: true, cooldownDaysLeft: 0 },
      JSON.stringify(ottoAnswers),
    );
  }
});

test("policy: after Finish, or without the flag, the cooldown applies", () => {
  const recent = daysAgo(1);
  const expected = { freeClaim: false, cooldownDaysLeft: HANDLE_COOLDOWN_DAYS - 1 };
  assert.deepEqual(handleClaimPolicy({ onboarding: true, ottoAnswers: { a: 1 }, handleChangedAt: recent }), expected);
  assert.deepEqual(handleClaimPolicy({ handleChangedAt: recent }), expected);
  assert.deepEqual(handleClaimPolicy({ onboarding: false, ottoAnswers: {}, handleChangedAt: recent }), expected);
  assert.deepEqual(handleClaimPolicy({ handleChangedAt: null }), { freeClaim: false, cooldownDaysLeft: 0 });
  assert.deepEqual(handleClaimPolicy({ handleChangedAt: daysAgo(HANDLE_COOLDOWN_DAYS + 1) }), {
    freeClaim: false,
    cooldownDaysLeft: 0,
  });
});

// ── changeHandleForUser: the default two-argument path (unchanged) ───────

test("default path: reads handle columns only, stamps now, 14-day result", async () => {
  const log = installFakeService({ handle: "old_one", handle_changed_at: null });
  const before = Date.now();
  const r = await changeHandleForUser(USER, " New_One ");
  assert.deepEqual(log.selects, ["handle,handle_changed_at", "id"]);
  assert.equal(log.updates.length, 1);
  assert.equal(log.updates[0].id, USER);
  assert.deepEqual(Object.keys(log.updates[0].payload).sort(), ["handle", "handle_changed_at"]);
  assert.equal(log.updates[0].payload.handle, "new_one");
  const stamp = Date.parse(String(log.updates[0].payload.handle_changed_at));
  assert.ok(stamp >= before && stamp <= Date.now());
  assert.deepEqual(r, {
    ok: true,
    handle: "new_one",
    unchanged: false,
    handle_changed_at: log.updates[0].payload.handle_changed_at,
    cooldown_days: HANDLE_COOLDOWN_DAYS,
  });
});

test("default path: cooldown, unchanged, taken and invalid behave as before", async () => {
  let log = installFakeService({ handle: "old_one", handle_changed_at: daysAgo(1) });
  assert.deepEqual(await changeHandleForUser(USER, "new_one"), {
    ok: false,
    status: 429,
    error: `You can change your handle again in ${HANDLE_COOLDOWN_DAYS - 1} days`,
    cooldown_days_left: HANDLE_COOLDOWN_DAYS - 1,
  });
  assert.equal(log.updates.length, 0);

  log = installFakeService({ handle: "same_one", handle_changed_at: daysAgo(1) });
  assert.deepEqual(await changeHandleForUser(USER, "same_one"), { ok: true, handle: "same_one", unchanged: true });
  assert.equal(log.updates.length, 0);

  log = installFakeService({ handle: "old_one", handle_changed_at: null }, { taken_one: OTHER });
  assert.deepEqual(await changeHandleForUser(USER, "taken_one"), { ok: false, status: 409, error: "Taken" });
  assert.equal(log.updates.length, 0);

  log = installFakeService({ handle: "old_one", handle_changed_at: null });
  const bad = await changeHandleForUser(USER, "no");
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.status, 400);
  assert.equal(log.selects.length, 0, "invalid handles never reach the DB");

  installFakeService(null);
  assert.deepEqual(await changeHandleForUser(USER, "new_one"), {
    ok: false,
    status: 404,
    error: "Profile not found",
  });
});

test("{ onboarding: false } is the default path", async () => {
  const log = installFakeService({ handle: "old_one", handle_changed_at: daysAgo(1), otto_answers: {} });
  const r = await changeHandleForUser(USER, "new_one", { onboarding: false });
  assert.deepEqual(log.selects, ["handle,handle_changed_at"]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 429);
});

// ── changeHandleForUser: { onboarding: true } ────────────────────────────

test("onboarding claim before Finish: skips the cooldown and writes handle_changed_at = null", async () => {
  const log = installFakeService({
    handle: "u0f1e2d3c4b5a69788796a5b4c3d2e1f0",
    handle_changed_at: daysAgo(1),
    otto_answers: {},
  });
  const r = await changeHandleForUser(USER, "franky", { onboarding: true });
  assert.deepEqual(log.selects, ["handle,handle_changed_at,otto_answers", "id"]);
  assert.deepEqual(log.updates, [{ payload: { handle: "franky", handle_changed_at: null }, id: USER }]);
  assert.deepEqual(r, {
    ok: true,
    handle: "franky",
    unchanged: false,
    handle_changed_at: null,
    cooldown_days: 0,
    onboarding: true,
  });
});

test("onboarding claim before Finish: still 409 when taken, no-op when unchanged", async () => {
  let log = installFakeService({ handle: "old_one", handle_changed_at: null, otto_answers: null }, { franky: OTHER });
  assert.deepEqual(await changeHandleForUser(USER, "franky", { onboarding: true }), {
    ok: false,
    status: 409,
    error: "Taken",
  });
  assert.equal(log.updates.length, 0);

  log = installFakeService({ handle: "franky", handle_changed_at: null, otto_answers: null }, { franky: USER });
  assert.deepEqual(await changeHandleForUser(USER, "franky", { onboarding: true }), {
    ok: true,
    handle: "franky",
    unchanged: true,
  });
  assert.equal(log.updates.length, 0);
});

test("onboarding claim after Finish: same cooldown and stamp as the default path", async () => {
  let log = installFakeService({ handle: "old_one", handle_changed_at: daysAgo(1), otto_answers: { done: true } });
  const blocked = await changeHandleForUser(USER, "new_one", { onboarding: true });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.status, 429);
    assert.equal(blocked.cooldown_days_left, HANDLE_COOLDOWN_DAYS - 1);
  }
  assert.equal(log.updates.length, 0);

  log = installFakeService({ handle: "old_one", handle_changed_at: null, otto_answers: { done: true } });
  const r = await changeHandleForUser(USER, "new_one", { onboarding: true });
  assert.equal(log.updates.length, 1);
  assert.equal(typeof log.updates[0].payload.handle_changed_at, "string");
  assert.equal(r.ok, true);
  assert.equal("onboarding" in r, false);
  if (r.ok && !r.unchanged) assert.equal(r.cooldown_days, HANDLE_COOLDOWN_DAYS);
});
