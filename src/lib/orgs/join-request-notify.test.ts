/**
 * The officers' "asked to join" notification and the "not this time" read
 * (Oct 22, 2026), run for real against a stand-in service client:
 *   - `notifyOfficersOfJoinRequest` tells the owner and every officer, never
 *     the student and never an officer the student blocked; once per student
 *     per club per day; a database that doesn't know the type yet (23514 on
 *     `notifications_type_check`, the migration written but not applied) is
 *     logged ONCE and never throws; a failed side read writes nothing;
 *   - `settleJoinRequestNotifications` marks only that student's unread rows
 *     for that club read;
 *   - `loadViewerOrgContext` reads the newest dated `denied` request as
 *     `declinedAt`, and a failed read of it fails closed (`ok: false`).
 *
 * Run with:
 *   node --test src/lib/orgs/join-request-notify.test.ts
 *
 * WHY THE RESOLVE HOOK: `membership.ts` starts with `import "server-only"`
 * and pulls the push dispatcher (next/server's `after`), so both resolve to
 * small data: modules. Everything else is the real code.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test, type TestContext } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("join-request-notify.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/push/dispatch": stub("export function kickPushDrain() { globalThis.__jrKicks = (globalThis.__jrKicks ?? 0) + 1; }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    const hit = STUBS[specifier];
    if (hit) return { url: hit, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const membershipSpecifier = "./membership.ts";
const m = (await import(membershipSpecifier)) as typeof import("./membership");

const ORG = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const OWNER = "33333333-3333-4333-8333-333333333333";
const OFFICER = "44444444-4444-4444-8444-444444444444";
const BLOCKED_OFFICER = "55555555-5555-4555-8555-555555555555";

type Call = unknown[];
type Op = { table: string; op: "select" | "insert" | "update"; payload?: unknown; calls: Call[] };
type Answer = { data?: unknown; error?: unknown };
const CHAIN = ["select", "eq", "in", "not", "order", "limit", "gte", "is"] as const;

/** A service client whose every query is logged and answered by `answer`. */
function fakeService(answer: (op: Op) => Answer) {
  const log: Op[] = [];
  const query = (table: string, op: Op["op"], payload?: unknown) => {
    const entry: Op = { table, op, payload, calls: [] };
    log.push(entry);
    const settle = () => {
      const a = answer(entry);
      return { data: a.data ?? null, error: a.error ?? null };
    };
    const b: Record<string, unknown> = {
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve().then(settle).then(res, rej),
      maybeSingle: () => Promise.resolve().then(settle),
    };
    for (const name of CHAIN) {
      b[name] = (...args: unknown[]) => {
        entry.calls.push([name, ...args]);
        return b;
      };
    }
    return b;
  };
  const client = {
    from: (table: string) => ({
      select: (...args: unknown[]) => (query(table, "select").select as (...a: unknown[]) => unknown)(...args),
      insert: (rows: unknown) => query(table, "insert", rows),
      update: (patch: unknown) => query(table, "update", patch),
    }),
  };
  return { client: client as unknown as SupabaseClient, log };
}

const has = (op: Op, ...call: unknown[]) => op.calls.some((c) => call.every((v, i) => c[i] === v));
const kicks = () => (globalThis as { __jrKicks?: number }).__jrKicks ?? 0;

/** The club side (owner + two officers + a member), and `recent` / `insert` answers. */
function clubWorld(opts: { recent?: Answer; insert?: Answer; side?: Answer } = {}) {
  return fakeService((op) => {
    if (op.table === "orgs") return opts.side ?? { data: { owner_id: OWNER } };
    if (op.table === "org_members") {
      return { data: [{ user_id: OFFICER, role: "admin" }, { user_id: BLOCKED_OFFICER, role: "admin" }, { user_id: ME, role: "member" }] };
    }
    if (op.table === "notifications" && op.op === "select") return opts.recent ?? { data: [] };
    if (op.table === "notifications" && op.op === "insert") return opts.insert ?? {};
    throw new Error(`unexpected ${op.op} on ${op.table}`);
  });
}

function quiet(t: TestContext) {
  return t.mock.method(console, "error", () => {});
}

test("asked to join: one row per owner and officer, never the student or an officer they blocked", async (t) => {
  quiet(t);
  const before = kicks();
  const w = clubWorld();
  await m.notifyOfficersOfJoinRequest(w.client, { orgId: ORG, requesterId: ME, excludeIds: [BLOCKED_OFFICER.toUpperCase()] });
  const inserts = w.log.filter((o) => o.table === "notifications" && o.op === "insert");
  assert.equal(inserts.length, 1, "one insert for everybody");
  const rows = inserts[0].payload as Array<Record<string, unknown>>;
  assert.deepEqual(rows.map((r) => r.user_id).sort(), [OWNER, OFFICER].sort());
  for (const r of rows) assert.deepEqual({ ...r, user_id: null }, { user_id: null, actor_id: ME, type: "org_join_request", org_id: ORG });
  assert.equal(kicks(), before + 1, "the push drain is kicked once");
  // The day's memory: same type, same student, same club, the last 24 hours.
  const recent = w.log.find((o) => o.table === "notifications" && o.op === "select");
  assert.ok(recent && has(recent, "eq", "type", "org_join_request") && has(recent, "eq", "actor_id", ME) && has(recent, "eq", "org_id", ORG));
  const since = recent.calls.find((c) => c[0] === "gte" && c[1] === "created_at")?.[2];
  assert.ok(typeof since === "string" && Math.abs(Date.now() - 24 * 3600_000 - Date.parse(since)) < 60_000);
});

test("asked to join: told already today, a failed memory read, or a failed side read write nothing", async (t) => {
  quiet(t);
  const before = kicks();
  const told = clubWorld({ recent: { data: [{ id: "n1" }] } });
  await m.notifyOfficersOfJoinRequest(told.client, { orgId: ORG, requesterId: ME });
  const unsure = clubWorld({ recent: { error: { code: "57014", message: "canceling statement due to statement timeout" } } });
  await m.notifyOfficersOfJoinRequest(unsure.client, { orgId: ORG, requesterId: ME });
  const noSide = clubWorld({ side: { error: { code: "08006", message: "connection failure" } } });
  await m.notifyOfficersOfJoinRequest(noSide.client, { orgId: ORG, requesterId: ME });
  for (const w of [told, unsure, noSide]) {
    assert.equal(w.log.filter((o) => o.op === "insert").length, 0);
  }
  assert.equal(kicks(), before, "no push without a row");
  // Nobody to tell (the student is the only officer left): no reads past the side.
  const alone = fakeService((op) => (op.table === "orgs" ? { data: { owner_id: ME } } : { data: [] }));
  await m.notifyOfficersOfJoinRequest(alone.client, { orgId: ORG, requesterId: ME });
  assert.deepEqual(alone.log.map((o) => o.table).sort(), ["org_members", "orgs"]);
});

test("asked to join: before the migration, 23514 on notifications_type_check is logged once and never throws", async (t) => {
  const errors = quiet(t);
  const refused = {
    error: { code: "23514", message: 'new row for relation "notifications" violates check constraint "notifications_type_check"' },
  };
  const before = kicks();
  for (let i = 0; i < 3; i++) {
    await m.notifyOfficersOfJoinRequest(clubWorld({ insert: refused }).client, { orgId: ORG, requesterId: ME });
  }
  const lines = errors.mock.calls.filter((c) => String(c.arguments[0]).includes("notifications_type_check"));
  assert.equal(lines.length, 1, "once per server process, however many requests");
  assert.equal(kicks(), before);
  // A thrown client is swallowed too: the request is the record.
  const broken = { from: () => { throw new Error("boom"); } } as unknown as SupabaseClient;
  await assert.doesNotReject(m.notifyOfficersOfJoinRequest(broken, { orgId: ORG, requesterId: ME }));
});

test("cancel: only this student's unread 'asked to join' rows for this club are marked read", async (t) => {
  quiet(t);
  const w = fakeService(() => ({}));
  await m.settleJoinRequestNotifications(w.client, ORG, ME);
  assert.equal(w.log.length, 1);
  const [op] = w.log;
  assert.equal(op.op, "update");
  assert.equal(op.table, "notifications");
  assert.deepEqual(Object.keys(op.payload as object), ["read_at"]);
  assert.ok(has(op, "eq", "type", "org_join_request") && has(op, "eq", "actor_id", ME) && has(op, "eq", "org_id", ORG));
  assert.ok(has(op, "is", "read_at", null), "already-read rows keep their time");
});

/** The six reads of `loadViewerOrgContext`, with the denied one answered by `denied`. */
function contextWorld(denied: Answer) {
  return fakeService((op) => {
    if (op.table === "users") return { data: { school_system: "iu", campus_id: null, is_platform_admin: false } };
    if (op.table === "org_join_requests" && has(op, "eq", "status", "denied")) return denied;
    return { data: null };
  });
}

test("loadViewerOrgContext: the newest dated 'no' is declinedAt; none is null; a failed read fails closed", async (t) => {
  quiet(t);
  const at = "2026-10-20T15:00:00.000Z";
  const w = contextWorld({ data: { resolved_at: at } });
  const ctx = await m.loadViewerOrgContext(w.client, ORG, ME);
  assert.equal(ctx.ok, true);
  assert.equal(ctx.declinedAt, at);
  const read = w.log.find((o) => o.table === "org_join_requests" && has(o, "eq", "status", "denied"));
  assert.ok(read && has(read, "eq", "user_id", ME) && has(read, "eq", "org_id", ORG));
  assert.ok(has(read, "not", "resolved_at", "is", null), "an undated row never reads as 'just now'");
  assert.ok(has(read, "order", "resolved_at") && has(read, "limit", 1), "newest first, one row");

  assert.equal((await m.loadViewerOrgContext(contextWorld({ data: null }).client, ORG, ME)).declinedAt, null);
  assert.equal((await m.loadViewerOrgContext(contextWorld({ data: { resolved_at: 42 } }).client, ORG, ME)).declinedAt, null);
  const failed = await m.loadViewerOrgContext(contextWorld({ error: { code: "57014", message: "timeout" } }).client, ORG, ME);
  assert.equal(failed.ok, false);
  assert.equal(failed.declinedAt, null);
});
