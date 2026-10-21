/**
 * POST /api/me/accept-terms, run for real on stand-ins (pre-registration fix,
 * Oct 2026). The route decides the history row's `source` itself, from the
 * `users.password_needed_at` flag that the first confirmation sets:
 *
 *  - no flag: `interstitial`, and the users update never names the flag
 *    (so a database without the column behaves exactly as before);
 *  - flag + a password exists: `confirm`, and the update clears the flag;
 *  - flag + no password: 409 `password_needed`, nothing written;
 *  - flag + the check failed: `confirm`, the flag kept (fail open);
 *  - the flag read failing (the column not there yet): `interstitial`;
 *  - a `source` in the body is ignored, always;
 *  - signed out, a stale version or bad JSON stop before any read, and the
 *    limiter key is still `accept-terms:<id>`.
 *
 * Run with:
 *   node --test src/app/api/me/accept-terms/route.test.ts
 *
 * WHY THE RESOLVE HOOK (the school-events/route.test.ts pattern): the route
 * imports "next/server", the limiter and both Supabase clients; each resolves
 * to a small data: module that answers from one `globalThis.__at` world.
 * `password-needed.ts` (behind a stand-in "server-only"), the Terms constants
 * and the missing-column helper are the real code.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const W = "globalThis.__at";
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "next/server": stub("export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };"),
  "@/lib/rate-limit": stub(
    `export async function rateLimit(key, opts) { ${W}.limits.push(key); return { allowed: true, retryAfterSec: 0, reason: null }; }\n` +
      "export function tooManyRequests() { return { status: 429, body: { ok: false } }; }",
  ),
  "@/lib/supabase/server": stub(
    `export async function createSupabaseServerClient() {\n` +
      `  return { auth: { getUser: async () => ({ data: { user: ${W}.user }, error: null }) } };\n}`,
  ),
  "@/lib/supabase/service": stub(`export function createSupabaseServiceClient() { return ${W}.service(); }`),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const found = STUBS[specifier];
    if (found) return { url: found, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

const { TERMS_VERSION } = await import("@/lib/legal/terms");
// A specifier in a variable, so the type checker leaves the `.ts` path alone.
const routeSpecifier = "./route.ts";
const route = (await import(routeSpecifier)) as {
  POST: (req: Request) => Promise<{ status: number; body: Record<string, unknown> }>;
};

// ── The world ────────────────────────────────────────────────────────────────

const ME = "11111111-1111-4111-8111-111111111111";
const FLAGGED_AT = "2026-10-22T15:04:05+00:00";
type Answer = { data: unknown; error: unknown };
type Write = { table: string; op: "insert" | "update"; payload: Record<string, unknown>; filters: [string, unknown][] };
type World = {
  user: { id: string } | null;
  /** The flag read's answer. */
  flag: Answer;
  /** account_password_missing's answer. */
  missing: Answer;
  limits: string[];
  reads: string[];
  rpcs: { name: string; args: unknown }[];
  writes: Write[];
  service: () => unknown;
};

function world(over: Partial<Pick<World, "user" | "flag" | "missing">> = {}): World {
  const w: World = {
    user: { id: ME },
    flag: { data: { password_needed_at: null }, error: null },
    missing: { data: false, error: null },
    limits: [],
    reads: [],
    rpcs: [],
    writes: [],
    service: () => ({ from, rpc: async (name: string, args: unknown) => (w.rpcs.push({ name, args }), w.missing) }),
    ...over,
  };
  function from(table: string) {
    let write: Write | null = null;
    let columns = "";
    const chain = {
      select: (cols: string) => ((columns = cols), chain),
      eq: (column: string, value: unknown) => (write?.filters.push([column, value]), chain),
      maybeSingle: async () => {
        if (write) return { data: { terms_version: TERMS_VERSION, terms_accepted_at: write.payload.terms_accepted_at }, error: null };
        w.reads.push(`${table}:${columns}`);
        return w.flag;
      },
      insert: async (payload: Record<string, unknown>) => (w.writes.push({ table, op: "insert", payload, filters: [] }), { error: null }),
      update: (payload: Record<string, unknown>) => {
        write = { table, op: "update", payload, filters: [] };
        w.writes.push(write);
        return chain;
      },
    };
    return chain;
  }
  (globalThis as unknown as { __at: World }).__at = w;
  return w;
}

const post = (body: unknown) =>
  route.POST(
    new Request("http://localhost:3102/api/me/accept-terms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const history = (w: World) => w.writes.filter((x) => x.table === "terms_acceptances");
const userUpdates = (w: World) => w.writes.filter((x) => x.table === "users" && x.op === "update");

// ── Tests ────────────────────────────────────────────────────────────────────

test("no flag: recorded as interstitial, the update never names the flag, no password check", async () => {
  const w = world();
  const answer = await post({ terms_version: TERMS_VERSION });
  assert.equal(answer.status, 200);
  assert.equal(answer.body.ok, true);
  assert.deepEqual(w.reads, ["users:password_needed_at"]);
  assert.deepEqual(w.rpcs, []);
  assert.equal(history(w).length, 1);
  assert.equal(history(w)[0].payload.source, "interstitial");
  assert.deepEqual(history(w)[0].payload.user_id, ME);
  const [update] = userUpdates(w);
  assert.deepEqual(Object.keys(update.payload).sort(), ["age_attested_at", "terms_accepted_at", "terms_version"]);
  assert.deepEqual(update.filters, [["id", ME]]);
  assert.deepEqual(w.limits, [`accept-terms:${ME}`]);
});

test("flag + a password exists: recorded as confirm, and the update clears the flag", async () => {
  const w = world({ flag: { data: { password_needed_at: FLAGGED_AT }, error: null }, missing: { data: false, error: null } });
  const answer = await post({ terms_version: TERMS_VERSION });
  assert.equal(answer.status, 200);
  assert.deepEqual(w.rpcs, [{ name: "account_password_missing", args: { p_user: ME } }]);
  assert.equal(history(w)[0].payload.source, "confirm");
  const [update] = userUpdates(w);
  assert.ok("password_needed_at" in update.payload);
  assert.equal(update.payload.password_needed_at, null);
  assert.equal(update.payload.terms_version, TERMS_VERSION);
});

test("flag + no password yet: 409 password_needed, nothing written", async () => {
  const w = world({ flag: { data: { password_needed_at: FLAGGED_AT }, error: null }, missing: { data: true, error: null } });
  const answer = await post({ terms_version: TERMS_VERSION });
  assert.equal(answer.status, 409);
  assert.deepEqual(answer.body, { ok: false, code: "password_needed", error: "Choose your password first." });
  assert.deepEqual(w.writes, []);
});

test("flag + the password check failed: recorded as confirm, the flag kept (fail open)", async (t) => {
  t.mock.method(console, "warn", () => {});
  for (const missing of [{ data: null, error: { code: "57014", message: "timeout" } }, { data: "t", error: null }]) {
    const w = world({ flag: { data: { password_needed_at: FLAGGED_AT }, error: null }, missing });
    const answer = await post({ terms_version: TERMS_VERSION });
    assert.equal(answer.status, 200, JSON.stringify(missing));
    assert.equal(history(w)[0].payload.source, "confirm");
    assert.ok(!("password_needed_at" in userUpdates(w)[0].payload));
  }
});

test("the flag read failing (column not there yet, or a blip): interstitial, no password check", async (t) => {
  t.mock.method(console, "warn", () => {});
  for (const error of [
    { code: "42703", message: "column users.password_needed_at does not exist" },
    { code: "57014", message: "canceling statement due to statement timeout" },
  ]) {
    const w = world({ flag: { data: null, error }, missing: { data: true, error: null } });
    const answer = await post({ terms_version: TERMS_VERSION });
    assert.equal(answer.status, 200, error.code);
    assert.deepEqual(w.rpcs, []);
    assert.equal(history(w)[0].payload.source, "interstitial");
    assert.ok(!("password_needed_at" in userUpdates(w)[0].payload));
  }
});

test("a source in the body is ignored: the server decides", async () => {
  let w = world();
  await post({ terms_version: TERMS_VERSION, source: "confirm" });
  assert.equal(history(w)[0].payload.source, "interstitial");
  w = world({ flag: { data: { password_needed_at: FLAGGED_AT }, error: null } });
  await post({ terms_version: TERMS_VERSION, source: "signup", password_needed_at: null });
  assert.equal(history(w)[0].payload.source, "confirm");
  w = world({ flag: { data: { password_needed_at: FLAGGED_AT }, error: null }, missing: { data: true, error: null } });
  assert.equal((await post({ terms_version: TERMS_VERSION, source: "interstitial" })).status, 409);
  assert.deepEqual(w.writes, []);
});

test("signed out, a stale version or bad JSON stop before any read or write", async () => {
  let w = world({ user: null });
  assert.equal((await post({ terms_version: TERMS_VERSION })).status, 401);
  assert.deepEqual([w.reads, w.rpcs, w.writes, w.limits], [[], [], [], []]);

  w = world({ flag: { data: { password_needed_at: FLAGGED_AT }, error: null } });
  const stale = await post({ terms_version: "2020-01-01" });
  assert.equal(stale.status, 400);
  assert.equal(stale.body.code, "terms_version_mismatch");
  assert.deepEqual([w.reads, w.rpcs, w.writes], [[], [], []]);

  w = world();
  assert.equal((await post("{not json")).status, 400);
  assert.deepEqual([w.reads, w.rpcs, w.writes], [[], [], []]);
});
