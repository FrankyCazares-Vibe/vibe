/**
 * "Members only" events, the server's two smaller walls (Oct 22, 2026;
 * handoffs/2026-10-22-club-tools-arc/PLAN-2.md, batch E1), against fakes:
 *   - PUT /api/events/[id]/rsvp answers 404 to anyone outside the club of a
 *     members-only event (the database refuses the same RSVP:
 *     rsvps_insert_own's event_audience_ok, 20261025100000), and lets a
 *     member through; an Everyone event costs no membership read at home;
 *   - collectCancelRecipients' `membersOf`: a members-only event's cancel
 *     notice goes to the club's CURRENT members only, and a failed members
 *     read is `{ ok: false }` (the DELETE then deletes nothing).
 *
 * Run with:
 *   node --test src/lib/events/members-only-routes.test.ts
 *
 * Lives here, not next to the route: `node --test` reads its arguments as
 * globs, so a path with `[id]` in it never matches (event-route.test.ts).
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
if (typeof registerHooks !== "function") throw new Error("members-only-routes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const EMPTY_MODULE = "data:text/javascript,";
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__mo.cookie; }"),
  "@/lib/supabase/service": stub(
    "export function createSupabaseServiceClient() { return globalThis.__mo.service; }\n" +
      "export function isSupabaseServiceConfigured() { return true; }",
  ),
  "@/lib/rate-limit": stub(
    "export async function rateLimit() { return { allowed: true, retryAfterSec: 0 }; }\n" +
      "export function tooManyRequests() { return new Response('{}', { status: 429 }); }",
  ),
  "@/lib/legal/require-terms": stub("export async function requireTermsAccepted() { return null; }"),
  "@/lib/push/dispatch": stub("export function kickPushDrain() {}"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY_MODULE, format: "module", shortCircuit: true };
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    if (STUBS[specifier]) return { url: STUBS[specifier], format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const rsvpSpec = "../../app/api/events/[id]/rsvp/route.ts";
const { PUT } = (await import(rsvpSpec)) as typeof import("../../app/api/events/[id]/rsvp/route");
const notifySpec = "./notify-cancel.ts";
const { collectCancelRecipients } = (await import(notifySpec)) as typeof import("./notify-cancel");

// ── A fake PostgREST client: every chain is logged, answered by table ───────

type Call = [string, ...unknown[]];
type Logged = { table: string; calls: Call[] };
type Answer = { data?: unknown; error?: unknown };

function fakeClient(answer: (table: string, calls: Call[]) => Answer, log: Logged[]) {
  const chain = (table: string) => {
    const calls: Call[] = [];
    log.push({ table, calls });
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "range", "upsert", "delete"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    const settle = () => {
      const a = answer(table, calls);
      return { data: a.data ?? null, error: a.error ?? null };
    };
    builder.maybeSingle = () =>
      Promise.resolve().then(() => {
        const r = settle();
        const rows = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];
        return { data: rows[0] ?? null, error: r.error };
      });
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve().then(settle).then(resolve, reject);
    return builder;
  };
  return { from: chain };
}

const EVENT = "eeeeeeee-0000-4000-8000-000000000001";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const OTHER = "11111111-0000-4000-8000-000000000002";
const LEFT = "11111111-0000-4000-8000-000000000003";
const at = (call: Call[], method: string, column: string) => call.find((c) => c[0] === method && c[1] === column)?.[2];

type RsvpWorld = { visibility?: string; member?: boolean; memberError?: boolean; viewerCampus?: string | null };

function rsvpWorld(w: RsvpWorld) {
  const serviceLog: Logged[] = [];
  const cookieLog: Logged[] = [];
  const service = fakeClient((table) => {
    if (table === "events") return { data: { id: EVENT, org_id: ORG, creator_id: OTHER, ...(w.visibility ? { visibility: w.visibility } : {}) } };
    if (table === "orgs") return { data: { hidden_at: null, campus_id: "iu-bloomington" } };
    if (table === "users") return { data: { campus_id: w.viewerCampus === undefined ? "iu-bloomington" : w.viewerCampus } };
    if (table === "org_members") return w.memberError ? { error: { code: "57014", message: "x" } } : { data: w.member ? [{ user_id: ME }] : [] };
    throw new Error(`unexpected service read of ${table}`);
  }, serviceLog);
  const cookie = {
    auth: { getUser: async () => ({ data: { user: { id: ME } }, error: null }) },
    ...fakeClient((table) => {
      if (table === "rsvps") return { data: null };
      throw new Error(`unexpected cookie read of ${table}`);
    }, cookieLog),
  };
  (globalThis as unknown as { __mo: unknown }).__mo = { service, cookie };
  return { serviceLog, cookieLog };
}

const put = async (status = "going") =>
  PUT(new Request("http://vibe.test/", { method: "PUT", body: JSON.stringify({ status }) }), { params: Promise.resolve({ id: EVENT }) });

test("RSVP to a members-only event: 404 not_found for a non-member, nothing written", async (t) => {
  t.mock.method(console, "error", () => {});
  const { serviceLog, cookieLog } = rsvpWorld({ visibility: "members", member: false });
  const res = await put();
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { ok: false, error: "Event not found", code: "not_found" });
  assert.equal(cookieLog.some((l) => l.table === "rsvps"), false, "no upsert");
  const membership = serviceLog.find((l) => l.table === "org_members")!.calls;
  assert.deepEqual([at(membership, "eq", "org_id"), at(membership, "eq", "user_id")], [ORG, ME]);
  // Same answer, and still no write, for a viewer with no home campus (that rule can't be skipped past).
  rsvpWorld({ visibility: "members", member: false, viewerCampus: null });
  assert.equal((await put()).status, 404);
});

test("RSVP to a members-only event: a member goes through, with ONE membership read", async () => {
  const { serviceLog, cookieLog } = rsvpWorld({ visibility: "members", member: true });
  const res = await put("maybe");
  assert.equal(res.status, 200);
  const upsert = cookieLog.find((l) => l.table === "rsvps")!.calls[0];
  assert.deepEqual(upsert[1], { event_id: EVENT, user_id: ME, status: "maybe" });
  assert.equal(serviceLog.filter((l) => l.table === "org_members").length, 1);
});

test("RSVP: a failed membership read on a members-only event is a 500, never a guess", async (t) => {
  t.mock.method(console, "error", () => {});
  const { cookieLog } = rsvpWorld({ visibility: "members", memberError: true });
  assert.equal((await put()).status, 500);
  assert.equal(cookieLog.some((l) => l.table === "rsvps"), false);
});

test("RSVP to an Everyone event (or a row without the column) at home: no membership read at all", async () => {
  for (const visibility of ["everyone", undefined]) {
    const { serviceLog } = rsvpWorld({ visibility, member: false });
    assert.equal((await put()).status, 200, String(visibility));
    assert.equal(serviceLog.some((l) => l.table === "org_members"), false, String(visibility));
  }
});

// ── collectCancelRecipients' membersOf ───────────────────────────────────────

function noticeService(memberIds: string[] | "error") {
  const log: Logged[] = [];
  const service = fakeClient((table, calls) => {
    if (table === "rsvps") {
      return { data: [{ user_id: ME, status: "going" }, { user_id: OTHER, status: "going" }, { user_id: LEFT, status: "maybe" }] };
    }
    if (table === "org_members") {
      if (memberIds === "error") return { error: { code: "57014", message: "canceling statement" } };
      assert.equal(at(calls, "eq", "org_id"), ORG);
      const asked = (at(calls, "in", "user_id") as string[]) ?? [];
      return { data: asked.filter((id) => memberIds.includes(id)).map((user_id) => ({ user_id })) };
    }
    throw new Error(`unexpected read of ${table}`);
  }, log);
  return { service: service as unknown as Parameters<typeof collectCancelRecipients>[0], log };
}

test("cancel notices: without membersOf, everyone who RSVP'd but the officer; no members read", async () => {
  const { service, log } = noticeService([]);
  assert.deepEqual(await collectCancelRecipients(service, EVENT, ME), { ok: true, ids: [OTHER, LEFT] });
  assert.deepEqual(await collectCancelRecipients(service, EVENT, ME, { membersOf: null }), { ok: true, ids: [OTHER, LEFT] });
  assert.equal(log.some((l) => l.table === "org_members"), false);
});

test("cancel notices for a members-only event: current members only; a failed members read is ok: false", async (t) => {
  const { service } = noticeService([OTHER]);
  assert.deepEqual(await collectCancelRecipients(service, EVENT, ME, { membersOf: ORG }), { ok: true, ids: [OTHER] }, "someone who left hears nothing");
  t.mock.method(console, "error", () => {});
  const failing = noticeService("error");
  assert.deepEqual(await collectCancelRecipients(failing.service, EVENT, ME, { membersOf: ORG }), { ok: false });
});
