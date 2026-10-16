/**
 * Club officer and org actions each count against a per-account budget
 * (limits plan, wave 3, B3.3), run for real on stand-ins:
 *   - every officer write (a room's edit and delete, the room order, the
 *     room access list, roles and removals, taking an invite back) counts on
 *     `orgOfficer`, 300 per 10 minutes, since a chapter's setup takes 100+
 *     calls (critique #18);
 *   - "join all public rooms" counts on `orgSubscribe`, leaving a club on
 *     `org-join:<uid>` at the join's own numbers, deleting a club on
 *     `bigDelete` (shared with deleting an account);
 *   - each limiter runs right after getUser and before anything else: no
 *     database read, no restriction check, no staff guard, no Terms read, so
 *     a refused caller costs nothing;
 *   - a refusal is a 429 with a plain line and the time left;
 *   - the room access list's GET is a read and carries no budget.
 *
 * Run with:
 *   node --test src/lib/orgs/officer-limits.test.ts
 *
 * WHY THE RESOLVE HOOK (as src/lib/uploads/upload-routes.test.ts): the routes
 * import "next/server", "server-only" modules and the two Supabase clients;
 * each resolves to a small data: module that reads its fake from globalThis.
 * The guards themselves (officer-guard, moderation/access, require-terms,
 * membership) and budgets.ts are the real code, so the log below sees every
 * database call they make, in order.
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
if (typeof registerHooks !== "function") throw new Error("officer-limits.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export const NextResponse = { json(body, init) { return Response.json(body, init); } };\n" +
      "export function after(fn) { globalThis.__vibeOfficer.log.push('after'); }",
  ),
  "@/lib/supabase/server": dataModule(
    "export async function createSupabaseServerClient() { return globalThis.__vibeOfficer.client('cookie'); }",
  ),
  "@/lib/supabase/service": dataModule(
    "export function createSupabaseServiceClient() { const w = globalThis.__vibeOfficer; w.log.push('service'); return w.client('service'); }\n" +
      "export function isSupabaseServiceConfigured() { return true; }",
  ),
  // web-push's CommonJS exports don't link from a stand-alone ESM import; no push leaves here anyway.
  "@/lib/push/dispatch": dataModule(
    "export function kickPushDrain() {}\nexport function enqueueMessagePush() {}\nexport async function drainPushOutbox() { return null; }",
  ),
  "@/lib/rate-limit": dataModule(
    "export async function rateLimit(key, opts) { const w = globalThis.__vibeOfficer; w.log.push('limit'); w.limits.push({ key, opts });\n" +
      "  return w.allow ? { allowed: true, retryAfterSec: 0, reason: null } : { allowed: false, retryAfterSec: 240, reason: 'limited' }; }\n" +
      "export function tooManyRequests(result, message = 'Too many requests. Try again shortly.', code) {\n" +
      "  return new Response(JSON.stringify(code ? { ok: false, code, error: message } : { ok: false, error: message }),\n" +
      "    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(Math.max(1, result.retryAfterSec)) } }); }",
  ),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

// ── The world ────────────────────────────────────────────────────────────────

const ME = "11111111-1111-4111-8111-111111111111";
const ROOM = "bbbbbbbb-0000-4000-8000-000000000002";
const OTHER = "22222222-2222-4222-8222-222222222222";
const INVITE = "cccccccc-0000-4000-8000-000000000003";

type World = {
  allow: boolean;
  log: string[];
  limits: { key: string; opts: Record<string, unknown> }[];
  client: (label: string) => unknown;
};
const world: World = { allow: false, log: [], limits: [], client: fakeClient };
(globalThis as unknown as { __vibeOfficer: World }).__vibeOfficer = world;

/** Any chain (`.select().eq()…maybeSingle()`) answers "no rows"; the call that opens it lands in the log. */
function chain(): unknown {
  const fn = () => chain();
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: null, error: null, count: 0 });
      return fn;
    },
  });
}

function fakeClient(label: string) {
  return {
    auth: {
      getUser: async () => {
        world.log.push("getUser");
        return { data: { user: { id: ME } }, error: null };
      },
    },
    from(table: string) {
      world.log.push(`${label}:from:${table}`);
      return chain();
    },
    rpc(fn: string) {
      world.log.push(`${label}:rpc:${fn}`);
      return chain();
    },
  };
}

// ── The routes ───────────────────────────────────────────────────────────────

const { BUDGETS, budgetKey } = await import("@/lib/limits/budgets");

type Limit = { limit: number; windowSec: number };
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Case = {
  name: string;
  file: string;
  method: "POST" | "PATCH" | "DELETE";
  params: Record<string, string>;
  body?: unknown;
  key: string;
  opts: Limit;
  message: string;
};

const OFFICER_BUSY = "Too many club changes at once. Try again in a few minutes.";
const TOO_MANY_TRIES = "Too many tries. Try again in a few minutes.";
const JOIN_LIMIT: Limit = { limit: 30, windowSec: 600 };

const officer = (name: string, file: string, method: Case["method"], params: Record<string, string>, body?: unknown): Case => ({
  name,
  file,
  method,
  params: { slug: "sae", ...params },
  body,
  key: budgetKey("orgOfficer", ME),
  opts: BUDGETS.orgOfficer,
  message: OFFICER_BUSY,
});

const CASES: Case[] = [
  officer("edit a room", "channels/[channelId]", "PATCH", { channelId: ROOM }, { topic: "Rush week" }),
  officer("delete a room", "channels/[channelId]", "DELETE", { channelId: ROOM }),
  officer("reorder the rooms", "channels/reorder", "POST", {}, { channel_ids: [ROOM] }),
  officer("add someone to a room", "channels/[channelId]/members", "POST", { channelId: ROOM }, { user_id: OTHER }),
  officer("take someone off a room", "channels/[channelId]/members/[userId]", "DELETE", { channelId: ROOM, userId: OTHER }),
  officer("change a role", "members/[userId]", "PATCH", { userId: OTHER }, { role: "mod" }),
  officer("remove a member", "members/[userId]", "DELETE", { userId: OTHER }),
  officer("take an invite back", "invites/[id]", "DELETE", { id: INVITE }),
  {
    name: "join every public room",
    file: "channels/subscribe-public",
    method: "POST",
    params: { slug: "sae" },
    key: budgetKey("orgSubscribe", ME),
    opts: BUDGETS.orgSubscribe,
    message: TOO_MANY_TRIES,
  },
  { name: "leave a club", file: "join", method: "DELETE", params: { slug: "sae" }, key: `org-join:${ME}`, opts: JOIN_LIMIT, message: TOO_MANY_TRIES },
  {
    name: "delete a club",
    file: ".",
    method: "DELETE",
    params: { slug: "sae" },
    key: budgetKey("bigDelete", ME),
    opts: BUDGETS.bigDelete,
    message: TOO_MANY_TRIES,
  },
];

async function handlerFor(file: string, method: string): Promise<Handler> {
  const mod = (await import(`../../app/api/orgs/[slug]/${file === "." ? "" : `${file}/`}route.ts`)) as Record<string, Handler>;
  const handler = mod[method];
  assert.equal(typeof handler, "function", `${file} has no ${method}`);
  return handler;
}

/** One call with a fresh log. A guard that throws on the stand-ins still leaves its calls in the log. */
async function run(file: string, method: string, params: Record<string, string>, body: unknown, allow: boolean) {
  world.allow = allow;
  world.log = [];
  world.limits = [];
  const handler = await handlerFor(file, method);
  const init: RequestInit = { method };
  if (body !== undefined) init.body = JSON.stringify(body);
  const req = new Request(`http://localhost/api/orgs/${params.slug}`, init);
  const res = await handler(req, { params: Promise.resolve(params) }).catch(() => null);
  return { res, log: [...world.log], limits: [...world.limits] };
}

// ── The tests ────────────────────────────────────────────────────────────────

test("orgOfficer is sized for a chapter's setup (critique #18)", () => {
  assert.deepEqual(BUDGETS.orgOfficer, { limit: 300, windowSec: 600 });
});

for (const c of CASES) {
  test(`${c.name}: refused before any database call, with a plain 429`, async () => {
    const { res, log, limits } = await run(c.file, c.method, c.params, c.body, false);
    assert.ok(res, "the route threw");
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "240");
    assert.deepEqual(await res.json(), { ok: false, error: c.message });
    assert.deepEqual(log, ["getUser", "limit"]);
    assert.deepEqual(limits, [{ key: c.key, opts: c.opts }]);
  });

  test(`${c.name}: allowed, the limiter is still the first thing after getUser`, async () => {
    const { log, limits } = await run(c.file, c.method, c.params, c.body, true);
    assert.deepEqual(log.slice(0, 2), ["getUser", "limit"]);
    assert.ok(log.length > 2, `the route stopped after the limiter: ${log.join(", ")}`);
    assert.equal(limits.length, 1);
  });
}

test("joining and leaving count on the same key, limit and window", async () => {
  const join = await run("join", "POST", { slug: "sae" }, {}, false);
  const leave = await run("join", "DELETE", { slug: "sae" }, undefined, false);
  assert.equal(join.res?.status, 429);
  assert.deepEqual(join.limits, leave.limits);
  assert.deepEqual(join.limits, [{ key: `org-join:${ME}`, opts: JOIN_LIMIT }]);
  // One key, one sentence: a refused join and a refused leave read the same.
  assert.equal(((await join.res?.json()) as { error?: string }).error, TOO_MANY_TRIES);
  assert.equal(((await leave.res?.json()) as { error?: string }).error, TOO_MANY_TRIES);
});

test("reading a room's access list carries no budget", async () => {
  const { log, limits } = await run("channels/[channelId]/members", "GET", { slug: "sae", channelId: ROOM }, undefined, false);
  assert.deepEqual(limits, []);
  assert.ok(log.length > 1, "the read never reached the database");
});
