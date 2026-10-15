/**
 * The typed school code's 429s (POST /api/auth/school-email/confirm-code),
 * against fakes of the limiter and the Supabase clients. Rate limits plan,
 * critique #6: once the limiter's retry became the time actually left, the
 * route could no longer tell "you tried too often" from "the limiter is down"
 * by comparing the retry with the window, so it reads `reason` instead. If
 * that ever slips back, a real brute-force lockout would read "Couldn't
 * check your code right now", and this file is what fails.
 *
 *  - "limited" on the per-user count: the lockout line, with the minutes
 *    actually left (the Retry-After header's own number, rounded up);
 *  - "limited" on the per-network count: the network line;
 *  - "unavailable" on either (failClosed refusing): the limiter-down line;
 *  - both limiters fail closed.
 *
 * Run with:
 *   node --test src/lib/auth/school-code-confirm.test.ts
 *
 * WHY THE RESOLVE HOOK (as src/lib/uploads/upload-routes.test.ts): the route
 * imports "next/server", the limiter and the Supabase clients; each resolves
 * to a small data: module that reads its fake from globalThis.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("school-code-confirm.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "next/server": dataModule(
    "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
  ),
  "@/lib/supabase/server": dataModule(
    "export async function createSupabaseServerClient() {\n" +
      "  return { auth: { getUser: async () => ({ data: { user: { id: 'u-1' } }, error: null }) } };\n" +
      "}",
  ),
  "@/lib/supabase/service": dataModule("export function isSupabaseServiceConfigured() { return true; }"),
  "@/lib/auth/school-email-token": dataModule(
    "export function isSchoolVerifySecretConfigured() { return true; }\n" +
      "export function normalizeSchoolEmail(s) { return s.trim().toLowerCase(); }\n" +
      "export function verifySchoolEmailCode() { return true; }",
  ),
  "@/lib/auth/school-email-apply": dataModule(
    "export async function applySchoolEmailVerification() { return { status: 200, body: { ok: true } }; }",
  ),
  "@/lib/rate-limit": dataModule(
    // Both network helpers, so moving the route to the scrambled code (Wave 2) needs no change here.
    "export function clientNetworkKey() { return '203.0.113.7'; }\n" +
      "export function clientNetworkCode() { return '0123456789abcdef0123456789abcdef'; }\n" +
      "export async function rateLimit(key, opts) {\n" +
      "  globalThis.__scc.limits.push({ key, opts });\n" +
      "  return globalThis.__scc.answers.shift() ?? { allowed: true, retryAfterSec: 0, reason: null };\n" +
      "}\n" +
      "export function tooManyRequests(result, message) {\n" +
      "  return { status: 429, body: { ok: false, error: message }, retryAfter: Math.max(1, result.retryAfterSec) };\n" +
      "}",
  ),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

type Answer = { status: number; body: { ok: boolean; error?: string }; retryAfter?: number };
type Limit = { allowed: boolean; retryAfterSec: number; reason: "limited" | "unavailable" | null };
// A specifier in a variable, so the type checker leaves the `.ts` path alone.
const routeSpecifier = "../../app/api/auth/school-email/confirm-code/route.ts";
const route = (await import(routeSpecifier)) as { POST: (req: Request) => Promise<Answer> };

const OK: Limit = { allowed: true, retryAfterSec: 0, reason: null };
const LIMITER_DOWN = "Couldn't check your code right now. Try again in a minute.";
const FROM_NETWORK = "Lots of tries from this network. Try again later this hour.";

/** One typed code, with the per-user and per-network answers in that order. */
async function confirm(...answers: Limit[]) {
  const state = { limits: [] as Array<{ key: string; opts: Record<string, unknown> }>, answers };
  (globalThis as Record<string, unknown>).__scc = state;
  const res = await route.POST(
    new Request("https://vibe.test/api/auth/school-email/confirm-code", {
      method: "POST",
      body: JSON.stringify({ schoolEmail: "ann@iu.edu", code: "1234 5678" }),
    }),
  );
  return { res, limits: state.limits };
}

test("a real lockout says so, with the minutes actually left, never 'the limiter is down'", async () => {
  const cases: Array<[retryAfterSec: number, line: string]> = [
    [1, "Too many tries. Wait a minute, then ask for a new code."],
    [30, "Too many tries. Wait a minute, then ask for a new code."],
    [61, "Too many tries. Wait 2 minutes, then ask for a new code."],
    [600, "Too many tries. Wait 10 minutes, then ask for a new code."],
    [900, "Too many tries. Wait 15 minutes, then ask for a new code."],
  ];
  for (const [retryAfterSec, line] of cases) {
    const { res, limits } = await confirm({ allowed: false, retryAfterSec, reason: "limited" });
    assert.equal(res.status, 429);
    assert.equal(res.body.error, line, `retry ${retryAfterSec}s`);
    assert.equal(res.retryAfter, retryAfterSec);
    assert.equal(limits.length, 1, "the network count is never spent on a locked-out account");
  }
});

test("a network over its count gets the network line", async () => {
  const { res } = await confirm(OK, { allowed: false, retryAfterSec: 1200, reason: "limited" });
  assert.equal(res.status, 429);
  assert.equal(res.body.error, FROM_NETWORK);
});

test("a limiter that couldn't count (failClosed) says it is down, on either count", async () => {
  const down: Limit = { allowed: false, retryAfterSec: 60, reason: "unavailable" };
  const perUser = await confirm(down);
  assert.equal(perUser.res.status, 429);
  assert.equal(perUser.res.body.error, LIMITER_DOWN);
  const perNetwork = await confirm(OK, down);
  assert.equal(perNetwork.res.body.error, LIMITER_DOWN);
});

test("both counts fail closed, per account then per network, and a good code goes through", async () => {
  const { res, limits } = await confirm(OK, OK);
  assert.equal(res.status, 200);
  assert.equal(limits.length, 2);
  assert.equal(limits[0].key, "school-code:u-1");
  assert.match(limits[1].key, /^school-code-ip:/);
  assert.deepEqual(limits.map((l) => l.opts.failClosed), [true, true]);
});
