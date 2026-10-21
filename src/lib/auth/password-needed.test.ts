/**
 * Tests for `password-needed.ts`: the two reads that finish setup after a
 * first confirmation removed an early password (pre-registration fix,
 * Oct 2026). Against a fake of the service client: no database here.
 *
 *  - `readPasswordFlag` reads only `users.password_needed_at` for that id,
 *    returns the timestamp, and reads EVERY doubt as "nothing owed" (null):
 *    the column not there yet (42703 / PGRST204), any other error, a throw,
 *    no row, a value that is not a timestamp string. The missing column is
 *    the expected deploy state and logs nothing.
 *  - `passwordMissing` calls `account_password_missing` with `p_user`, and
 *    maps true / false through, an error, a throw or a non-boolean to null.
 *
 * Run with:
 *   node --test src/lib/auth/password-needed.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports "server-only" (a stand-in here)
 * and the missing-column helper through the `@/` alias.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test, type TestContext } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("password-needed.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = { "server-only": dataModule("") };
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

// A specifier in a variable, so the type checker leaves the `.ts` path alone.
const specifier = "./password-needed.ts";
const { passwordMissing, readPasswordFlag } = (await import(specifier)) as typeof import("./password-needed");

const ME = "11111111-1111-4111-8111-111111111111";
const FLAGGED_AT = "2026-10-22T15:04:05.123456+00:00";

type Answer = { data: unknown; error: unknown } | "throw";
type Call = { table?: string; select?: string; filters: [string, unknown][]; rpc?: string; args?: unknown };

/** A service client whose one select or rpc gives `answer`; records what was asked. */
function fakeService(answer: Answer) {
  const calls: Call[] = [];
  const settle = async () => {
    if (answer === "throw") throw new Error("fetch failed");
    return answer;
  };
  const from = (table: string) => {
    const call: Call = { table, filters: [] };
    calls.push(call);
    const chain = {
      select: (columns: string) => ((call.select = columns), chain),
      eq: (column: string, value: unknown) => (call.filters.push([column, value]), chain),
      maybeSingle: settle,
    };
    return chain;
  };
  const rpc = (name: string, args: unknown) => {
    calls.push({ rpc: name, args, filters: [] });
    return settle();
  };
  return { service: { from, rpc } as never, calls };
}

/** console.warn lines while `fn` runs. */
async function warnings(t: TestContext, fn: () => Promise<unknown>): Promise<unknown[][]> {
  const lines: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => void lines.push(args));
  await fn();
  return lines;
}

test("readPasswordFlag reads only password_needed_at for that id and returns the timestamp", async () => {
  const { service, calls } = fakeService({ data: { password_needed_at: FLAGGED_AT }, error: null });
  assert.equal(await readPasswordFlag(service, ME), FLAGGED_AT);
  assert.deepEqual(calls, [{ table: "users", select: "password_needed_at", filters: [["id", ME]] }]);
});

test("readPasswordFlag: nothing owed when the flag is empty or the row is missing", async () => {
  for (const data of [{ password_needed_at: null }, null, {}, { password_needed_at: "" }]) {
    const { service } = fakeService({ data, error: null });
    assert.equal(await readPasswordFlag(service, ME), null, JSON.stringify(data));
  }
});

test("readPasswordFlag: a value that is not a timestamp string is nothing owed", async () => {
  for (const value of [1, true, {}, ["2026-10-22"]]) {
    const { service } = fakeService({ data: { password_needed_at: value }, error: null });
    assert.equal(await readPasswordFlag(service, ME), null, JSON.stringify(value));
  }
});

test("readPasswordFlag: the column not there yet is nothing owed, and stays quiet", async (t) => {
  const missing = [
    { code: "42703", message: "column users.password_needed_at does not exist" },
    { code: "PGRST204", message: "Could not find the 'password_needed_at' column of 'users' in the schema cache" },
  ];
  for (const error of missing) {
    const { service } = fakeService({ data: null, error });
    const lines = await warnings(t, async () => assert.equal(await readPasswordFlag(service, ME), null));
    assert.deepEqual(lines, [], error.code);
    t.mock.restoreAll();
  }
});

test("readPasswordFlag: any other error, or a throw, is nothing owed, and is logged", async (t) => {
  for (const answer of [
    { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } },
    { data: { password_needed_at: FLAGGED_AT }, error: { message: "upstream connect error" } },
    "throw" as const,
  ]) {
    const { service } = fakeService(answer);
    const lines = await warnings(t, async () => assert.equal(await readPasswordFlag(service, ME), null));
    assert.equal(lines.length, 1, JSON.stringify(answer));
    // The log names the failure, never the account.
    assert.ok(!JSON.stringify(lines).includes(ME));
    t.mock.restoreAll();
  }
});

test("passwordMissing calls account_password_missing with p_user and passes true / false through", async () => {
  for (const value of [true, false]) {
    const { service, calls } = fakeService({ data: value, error: null });
    assert.equal(await passwordMissing(service, ME), value);
    assert.deepEqual(calls, [{ rpc: "account_password_missing", args: { p_user: ME }, filters: [] }]);
  }
});

test("passwordMissing: an error or a throw is 'could not tell' (null), and is logged", async (t) => {
  for (const answer of [
    { data: null, error: { code: "42501", message: "not allowed" } },
    { data: null, error: { code: "PGRST202", message: "Could not find the function public.account_password_missing(p_user)" } },
    { data: true, error: { message: "upstream connect error" } },
    "throw" as const,
  ]) {
    const { service } = fakeService(answer);
    const lines = await warnings(t, async () => assert.equal(await passwordMissing(service, ME), null));
    assert.equal(lines.length, 1, JSON.stringify(answer));
    assert.ok(!JSON.stringify(lines).includes(ME));
    t.mock.restoreAll();
  }
});

test("passwordMissing: an answer that is not a boolean is 'could not tell' (null)", async () => {
  for (const data of [null, undefined, "t", "true", 1, 0, [true], { account_password_missing: true }]) {
    const { service } = fakeService({ data, error: null });
    assert.equal(await passwordMissing(service, ME), null, JSON.stringify(data));
  }
});
