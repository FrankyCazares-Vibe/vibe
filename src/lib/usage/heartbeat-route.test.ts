/**
 * POST /api/me/heartbeat against fakes of both Supabase clients: who may
 * check in, what reaches `public.usage_touch` (the account from the sign-in
 * server, never from the body), the fallback while the function is missing,
 * the 20-second gate (a repeat skipped only when nothing is opened, never
 * across a UTC midnight, the memory capped), and that every answer is
 * no-store.
 *
 * THE CLOCK is node:test's mock of Date, so the gate can be stepped through:
 * every install() moves it 21 s on, past the gate, unless told not to.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/usage/heartbeat-route.test.ts
 *
 * WHY THE RESOLVE HOOK (as src/lib/chat/otto-unread-route.test.ts): the route
 * imports "next/server" and the two Supabase clients; each resolves to a
 * small data: module. touch.ts is the real one.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { mock, test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("heartbeat-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body, headers: (init && init.headers) || {} }; } };",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__vibeBeatUser; }"),
  "@/lib/supabase/service": dataModule("export function createSupabaseServiceClient() { return globalThis.__vibeBeatService(); }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

const routeSpecifier = "../../app/api/me/heartbeat/route.ts";
type Answer = { status: number; body: { ok: boolean; error?: string }; headers: Record<string, string> };
const route = (await import(routeSpecifier)) as { POST: (req: Request) => Promise<Answer> };

const NOON_UTC = Date.parse("2026-10-16T12:00:00Z");
mock.timers.enable({ apis: ["Date"], now: NOON_UTC });

type PgError = { code?: string; message: string } | null;
type Seen = { rpc: [string, unknown][]; updates: { patch: unknown; eq: unknown[] }[] };

const ME = "11111111-1111-4111-8111-111111111111";
const SOMEONE_ELSE = "22222222-2222-4222-8222-222222222222";

/** Installs both fakes: the person's own client (sign-in and the fallback) and the service client (the check-in). */
function install(opts: {
  user?: string | null;
  rpcError?: PgError;
  rpcThrows?: boolean;
  updateError?: PgError;
  /** false: keep the clock where it is (the gate still remembers the last check-in). */
  tick?: boolean;
}): Seen {
  if (opts.tick !== false) mock.timers.tick(21_000);
  const seen: Seen = { rpc: [], updates: [] };
  const g = globalThis as Record<string, unknown>;
  g.__vibeBeatUser = {
    auth: { getUser: async () => ({ data: { user: opts.user === null ? null : { id: opts.user ?? ME } }, error: null }) },
    from(table: string) {
      assert.equal(table, "users");
      return {
        update(patch: unknown) {
          return {
            eq: async (...eq: unknown[]) => {
              seen.updates.push({ patch, eq });
              return { error: opts.updateError ?? null };
            },
          };
        },
      };
    },
  };
  g.__vibeBeatService = () => {
    if (opts.rpcThrows) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    return {
      rpc: async (fn: string, args: unknown) => {
        seen.rpc.push([fn, args]);
        return { data: null, error: opts.rpcError ?? null };
      },
    };
  };
  return seen;
}

const post = (body?: string) =>
  route.POST(new Request("http://localhost/api/me/heartbeat", { method: "POST", body, headers: { "content-type": "application/json" } }));

function assertNoStore(res: Answer) {
  assert.equal(res.headers["cache-control"], "no-store");
}

test("signed out: 401, and nothing is called", async () => {
  const seen = install({ user: null });
  const res = await post(JSON.stringify({ device: "phone" }));
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { ok: false, error: "Unauthorized" });
  assert.deepEqual(seen.rpc, []);
  assert.deepEqual(seen.updates, []);
  assertNoStore(res);
});

test("a check-in calls usage_touch with the signed-in id, the device and the open", async () => {
  const seen = install({});
  const res = await post(JSON.stringify({ device: "phone", open: "map" }));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(seen.rpc, [["usage_touch", { p_user: ME, p_device: "phone", p_open: "map" }]]);
  assert.deepEqual(seen.updates, [], "no write with the person's own client");
  assertNoStore(res);
});

test("no body (an older open tab), a bad body or an unknown word: an unknown device, no open", async () => {
  for (const body of [undefined, "", "not json", "[]", JSON.stringify({ device: "tablet", open: "feed" }), "x".repeat(200)]) {
    const seen = install({});
    const res = await post(body);
    assert.equal(res.status, 200, String(body));
    assert.deepEqual(seen.rpc, [["usage_touch", { p_user: ME, p_device: "unknown", p_open: null }]], String(body));
  }
});

test("an account named in the body is never used", async () => {
  const seen = install({});
  // Under 128 characters, so it is read; the extra field is dropped.
  const body = JSON.stringify({ device: "desktop", p_user: SOMEONE_ELSE });
  assert.ok(body.length <= 128);
  await post(body);
  assert.deepEqual(seen.rpc, [["usage_touch", { p_user: ME, p_device: "desktop", p_open: null }]]);
  assert.ok(!JSON.stringify(seen).includes(SOMEONE_ELSE));
});

test("the function missing (PGRST202 or 42883): the old stamp with the person's own client, 200", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const seen = install({ rpcError: { code, message: "Could not find the function public.usage_touch" } });
    const res = await post(JSON.stringify({ device: "phone" }));
    assert.equal(res.status, 200, code);
    assert.equal(seen.updates.length, 1, code);
    const { patch, eq } = seen.updates[0];
    assert.deepEqual(Object.keys(patch as object), ["last_active_at"]);
    assert.deepEqual(eq, ["id", ME]);
    assertNoStore(res);
  }
});

test("the fallback refused (the minute after the change) or failing: 500, nothing more", async () => {
  for (const code of ["42501", "XX000"]) {
    const seen = install({ rpcError: { code: "PGRST202", message: "not in the schema cache" }, updateError: { code, message: "no" } });
    const res = await post(JSON.stringify({ device: "phone" }));
    assert.equal(res.status, 500, code);
    assert.deepEqual(res.body, { ok: false, error: "Request failed" });
    assert.equal(seen.updates.length, 1);
    assertNoStore(res);
  }
});

test("any other error from the check-in: 500, and no fallback write", async () => {
  for (const rpcError of [{ code: "42501", message: "not allowed" }, { code: "55000", message: "usage: stamp did not land" }]) {
    const seen = install({ rpcError });
    const res = await post(JSON.stringify({ device: "phone" }));
    assert.equal(res.status, 500, rpcError.code);
    assert.deepEqual(res.body, { ok: false, error: "Request failed" });
    assert.deepEqual(seen.updates, [], "a refusal is not a missing function");
    assertNoStore(res);
  }
  const seen = install({ rpcThrows: true });
  const res = await post(JSON.stringify({ device: "phone" }));
  assert.equal(res.status, 500);
  assert.deepEqual(seen.updates, []);
});

test("the gate: a repeat within 20 s with nothing opened answers 200 and calls nothing; an open always goes through", async () => {
  const seen = install({});
  await post(JSON.stringify({ device: "phone" }));
  assert.equal(seen.rpc.length, 1);

  mock.timers.tick(5_000);
  const skipped = await post(JSON.stringify({ device: "phone" }));
  assert.equal(skipped.status, 200);
  assert.deepEqual(skipped.body, { ok: true });
  assertNoStore(skipped);
  await post(undefined);
  assert.equal(seen.rpc.length, 1, "no database call for a repeat");
  assert.deepEqual(seen.updates, [], "and no fallback write either");

  // Otto and map opens are counted, so they are never skipped.
  await post(JSON.stringify({ device: "phone", open: "otto" }));
  await post(JSON.stringify({ device: "phone", open: "map" }));
  assert.deepEqual(seen.rpc.slice(1), [
    ["usage_touch", { p_user: ME, p_device: "phone", p_open: "otto" }],
    ["usage_touch", { p_user: ME, p_device: "phone", p_open: "map" }],
  ]);

  // 20 s after the last one that landed (the map open), a check-in goes through again.
  mock.timers.tick(19_999);
  await post(JSON.stringify({ device: "phone" }));
  assert.equal(seen.rpc.length, 3);
  mock.timers.tick(1);
  await post(JSON.stringify({ device: "phone" }));
  assert.equal(seen.rpc.length, 4);
});

test("the gate is per account, and remembers only a check-in that landed", async () => {
  let seen = install({});
  await post(JSON.stringify({ device: "phone" }));
  assert.equal(seen.rpc.length, 1);
  seen = install({ user: SOMEONE_ELSE, tick: false });
  await post(JSON.stringify({ device: "phone" }));
  assert.deepEqual(seen.rpc, [["usage_touch", { p_user: SOMEONE_ELSE, p_device: "phone", p_open: null }]]);

  // A failed check-in is not remembered: the next one is tried at once.
  seen = install({ rpcError: { code: "XX000", message: "down" } });
  assert.equal((await post(JSON.stringify({ device: "phone" }))).status, 500);
  seen = install({ tick: false });
  await post(JSON.stringify({ device: "phone" }));
  assert.equal(seen.rpc.length, 1);
});

test("the gate never skips a day's first check-in (UTC midnight)", async () => {
  install({});
  mock.timers.setTime(Date.parse("2026-10-16T23:59:55Z"));
  const seen = install({ tick: false });
  await post(JSON.stringify({ device: "phone" }));
  mock.timers.tick(10_000);
  await post(JSON.stringify({ device: "phone" }));
  assert.equal(seen.rpc.length, 2, "00:00:05 is a new UTC day");
  mock.timers.tick(5_000);
  await post(JSON.stringify({ device: "phone" }));
  assert.equal(seen.rpc.length, 2, "and within the new day the gate holds again");
});

test("the gate's memory stays capped at 10,000 accounts: the oldest goes first", async () => {
  const seen = install({});
  await post(JSON.stringify({ device: "desktop" }));
  const g = globalThis as Record<string, unknown>;
  for (let n = 0; n < 10_000; n += 1) {
    const id = `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
    g.__vibeBeatUser = { auth: { getUser: async () => ({ data: { user: { id } }, error: null }) } };
    await post(JSON.stringify({ device: "desktop" }));
  }
  assert.equal(seen.rpc.length, 10_001);
  // All within the same second, so only the cap can have let ME go.
  const again = install({ tick: false });
  await post(JSON.stringify({ device: "desktop" }));
  assert.equal(again.rpc.length, 1, "the oldest account was dropped, so it is checked in again");
});
