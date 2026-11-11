/**
 * DELETE /api/me/notifications (Otto polish, Nov 11, 2026: clear with Undo),
 * run for real on stand-ins. The rules:
 *
 *  - own rows only: every delete is filtered by the caller's user_id (row
 *    security is the second wall), and `ids` narrows it, never widens it;
 *  - ids are validated as uuids: one bad id is a 400, never a silent filter;
 *  - `{ all: true, before }` deletes the caller's rows created at or before
 *    `before` (never one that arrived after the list was drawn; a future
 *    time is read as now), and nothing else; `all` without a time is a 400;
 *  - an empty body, `{}`, `{ ids: [] }`, both shapes at once, bad JSON or
 *    more than 200 ids are refused before any write;
 *  - signed out is a 401 before the limiter; the `notificationsClear` budget
 *    counts right after sign-in, and a refusal touches nothing;
 *  - a restriction in force refuses the write (403) before the delete.
 *
 * Run with:
 *   node --test src/app/api/me/notifications/route.test.ts
 *
 * WHY THE RESOLVE HOOK (the accept-terms/route.test.ts pattern): the route
 * imports "next/server", the limiter, both Supabase clients, the moderation
 * gate and the GET handler's helpers; each resolves to a small data: module
 * that answers from one `globalThis.__nt` world. budgets.ts and pgrest.ts
 * (the uuid check) are the real code.
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
const W = "globalThis.__nt";
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "next/server": stub("export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };"),
  "@/lib/rate-limit": stub(
    `export async function rateLimit(key, opts) { ${W}.log.push("limit:" + key); ${W}.limitOpts.push(opts); return { allowed: ${W}.allow, retryAfterSec: 240, reason: null }; }\n` +
      "export function tooManyRequests(rl, error) { return { status: 429, body: { ok: false, error } }; }",
  ),
  "@/lib/supabase/server": stub(
    `export async function createSupabaseServerClient() {\n` +
      `  return { auth: { getUser: async () => (${W}.log.push("getUser"), { data: { user: ${W}.user }, error: null }) }, from: (t) => ${W}.from(t) };\n}`,
  ),
  "@/lib/supabase/service": stub(`export function createSupabaseServiceClient() { throw new Error("DELETE never uses the service client"); }`),
  "@/lib/moderation/access": stub(
    `export async function requireNotRestricted(id) { ${W}.log.push("restriction:" + id); return ${W}.restricted ? { status: 403, body: { ok: false, code: "account_restricted" } } : null; }`,
  ),
  "@/lib/orgs/notification-orgs": stub("export async function attachNotificationOrgs(_c, rows) { return rows; }"),
  "@/lib/post-media-url": stub("export function withPostMediaUrls(p) { return p; }"),
  "@/lib/push/event-notice": stub(
    "export function visibleActorFilter() { return ''; }\nexport async function withEventNotices(_c, rows) { return rows; }",
  ),
  "@/lib/safety/hidden-users": stub("export async function loadHiddenUsers() { return { ok: true, hidden: { ids: [] } }; }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const found = STUBS[specifier];
    if (found) return { url: found, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    return nextResolve(specifier, context);
  },
});

// A specifier in a variable, so the type checker leaves the `.ts` path alone.
const routeSpecifier = "./route.ts";
const route = (await import(routeSpecifier)) as {
  DELETE: (req: Request) => Promise<{ status: number; body: Record<string, unknown> }>;
};
const budgetsSpecifier = "@/lib/limits/budgets";
const { BUDGETS } = (await import(budgetsSpecifier)) as { BUDGETS: Record<string, unknown> };

// ── The world: a notifications table with my rows and someone else's ───────

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";
const MINE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MINE_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const THEIRS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

type Row = { id: string; user_id: string; created_at: string };
type Delete = { table: string; options: unknown; filters: [string, string, unknown][] };
type World = {
  user: { id: string } | null;
  allow: boolean;
  restricted: boolean;
  log: string[];
  limitOpts: unknown[];
  rows: Row[];
  deletes: Delete[];
  from: (table: string) => unknown;
};

function world(over: Partial<Pick<World, "user" | "allow" | "restricted">> = {}): World {
  const w: World = {
    user: { id: ME },
    allow: true,
    restricted: false,
    log: [],
    limitOpts: [],
    rows: [
      { id: MINE_A, user_id: ME, created_at: "2026-11-11T15:00:00.000Z" },
      { id: MINE_B, user_id: ME, created_at: "2026-11-11T16:00:00.000Z" },
      { id: THEIRS, user_id: THEM, created_at: "2026-11-11T15:00:00.000Z" },
    ],
    deletes: [],
    from(table: string) {
      return {
        delete(options: unknown) {
          const d: Delete = { table, options, filters: [] };
          w.deletes.push(d);
          w.log.push("delete");
          const chain = {
            eq: (col: string, val: unknown) => (d.filters.push(["eq", col, val]), chain),
            in: (col: string, val: unknown) => (d.filters.push(["in", col, val]), chain),
            lte: (col: string, val: unknown) => (d.filters.push(["lte", col, val]), chain),
            // Awaiting the chain runs it: keep the rows that match every filter out.
            then(resolve: (v: { error: null; count: number }) => void) {
              const match = (r: Row) =>
                d.filters.every(([op, col, val]) =>
                  op === "eq" ? r[col as keyof Row] === val
                  : op === "lte" ? Date.parse(r[col as keyof Row]) <= Date.parse(String(val))
                  : (val as string[]).includes(r[col as keyof Row]),
                );
              const gone = w.rows.filter(match);
              w.rows = w.rows.filter((r) => !match(r));
              resolve({ error: null, count: gone.length });
            },
          };
          return chain;
        },
      };
    },
    ...over,
  };
  (globalThis as unknown as { __nt: World }).__nt = w;
  return w;
}

const del = (body?: unknown) =>
  route.DELETE(
    new Request("http://localhost:3106/api/me/notifications", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const ids = (w: World) => w.rows.map((r) => r.id).sort();

// ── Tests ────────────────────────────────────────────────────────────────────

test("ids: deletes only the caller's own rows; someone else's id is left alone", async () => {
  const w = world();
  const answer = await del({ ids: [MINE_A, THEIRS] });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { ok: true, deleted: 1 });
  assert.deepEqual(ids(w), [MINE_B, THEIRS].sort());
  assert.deepEqual(w.deletes[0].filters, [
    ["eq", "user_id", ME],
    ["in", "id", [MINE_A, THEIRS]],
  ]);
  assert.deepEqual(w.deletes[0].options, { count: "exact" });
});

test("ids: duplicates collapse to one", async () => {
  const w = world();
  await del({ ids: [MINE_A, MINE_A] });
  assert.deepEqual(w.deletes[0].filters[1], ["in", "id", [MINE_A]]);
});

test("all + before deletes the caller's rows up to that time, none newer and none of anyone else's", async () => {
  const w = world();
  const answer = await del({ all: true, before: "2026-11-11T15:30:00.000Z" });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body, { ok: true, deleted: 1 });
  assert.deepEqual(ids(w), [MINE_B, THEIRS].sort(), "the row that came after the list was drawn stays");
  assert.deepEqual(w.deletes[0].filters, [
    ["eq", "user_id", ME],
    ["lte", "created_at", "2026-11-11T15:30:00.000Z"],
  ]);
});

test("all + a time in the future is read as now", async () => {
  const w = world();
  const t0 = Date.now();
  await del({ all: true, before: "2999-01-01T00:00:00.000Z" });
  const at = Date.parse(String(w.deletes[0].filters[1][2]));
  assert.ok(at >= t0 - 1000 && at <= Date.now() + 1000);
});

test("ids are validated as uuids: one bad id refuses the whole call, nothing is deleted", async () => {
  for (const bad of ["not-a-uuid", "", 42, null, `${MINE_A},id.neq.0`, "notification:" + MINE_A]) {
    const w = world();
    const answer = await del({ ids: [MINE_A, bad] });
    assert.equal(answer.status, 400, String(bad));
    assert.equal(answer.body.ok, false);
    assert.equal(w.deletes.length, 0, String(bad));
    assert.equal(ids(w).length, 3);
  }
});

test("an empty or shapeless body is refused before any write", async () => {
  for (const body of [undefined, "", "{nope", {}, { ids: [] }, { ids: "x" }, { all: "true" }, { all: false }, [], null, { all: true, ids: [MINE_A], before: "2026-11-11T15:00:00.000Z" }, { all: true }, { all: true, before: "soon" }, { all: true, before: 5 }, { ids: [MINE_A], before: "2026-11-11T15:00:00.000Z" }]) {
    const w = world();
    const answer = await del(body);
    assert.equal(answer.status, 400, JSON.stringify(body));
    assert.equal(w.deletes.length, 0, JSON.stringify(body));
    assert.ok(!w.log.some((l) => l.startsWith("restriction:")), "no restriction read for a refused body");
  }
});

test("more than 200 ids is a 400, never a silent cut", async () => {
  const w = world();
  const many = Array.from({ length: 201 }, () => MINE_A);
  const answer = await del({ ids: many });
  assert.equal(answer.status, 400);
  assert.equal(w.deletes.length, 0);
});

test("signed out: 401, before the limiter", async () => {
  const w = world({ user: null });
  const answer = await del({ all: true, before: "2026-11-11T15:00:00.000Z" });
  assert.equal(answer.status, 401);
  assert.deepEqual(w.log, ["getUser"]);
});

test("the notificationsClear budget counts right after sign-in; a refusal deletes nothing", async () => {
  const w = world({ allow: false });
  const answer = await del({ all: true, before: "2026-11-11T15:00:00.000Z" });
  assert.equal(answer.status, 429);
  assert.match(String(answer.body.error), /^[A-Z][^]*\.$/);
  assert.deepEqual(w.log, ["getUser", `limit:budget-notificationsClear:${ME}`]);
  assert.deepEqual(w.limitOpts, [BUDGETS.notificationsClear]);
  assert.equal(ids(w).length, 3);
});

test("a restriction in force refuses the write before the delete", async () => {
  const w = world({ restricted: true });
  const answer = await del({ ids: [MINE_A] });
  assert.equal(answer.status, 403);
  assert.equal(w.deletes.length, 0);
  assert.deepEqual(w.log, ["getUser", `limit:budget-notificationsClear:${ME}`, `restriction:${ME}`]);
});

test("the order on an allowed call: sign-in, budget, restriction, delete", async () => {
  const w = world();
  await del({ ids: [MINE_B] });
  assert.deepEqual(w.log, ["getUser", `limit:budget-notificationsClear:${ME}`, `restriction:${ME}`, "delete"]);
});
