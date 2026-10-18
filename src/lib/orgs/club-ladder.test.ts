/**
 * The club ladder's rungs that no other test pinned yet (wave 3D checks).
 * Behaviour tests run the real routes on stand-ins of the two Supabase
 * clients; the last two are source checks over the whole app:
 *   - the owner can't leave their club, with or without "Keep following",
 *     and nothing about their follow changes on the way to that refusal;
 *   - a member can't unfollow (409 member_follows): leaving is the way out;
 *     a follower's unfollow deletes only their own row;
 *   - muting a club's posts never reaches its chats: no chat, thread, push
 *     or Messages code reads the mutes, and the mute route writes one table;
 *   - clubs never follow people: every follow a route writes is the
 *     signed-in student's own.
 *
 * Run with: node --test src/lib/orgs/club-ladder.test.ts
 * Same harness as club-model-routes.test.ts (a `[slug]` path never matches
 * `node --test`'s globs, so the file lives here).
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("club-ladder.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const W = "globalThis.__cl";
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/supabase/server": stub(`export async function createSupabaseServerClient() { return ${W}.cookie; }`),
  "@/lib/supabase/service": stub(`export function createSupabaseServiceClient() { return ${W}.service; }`),
  "@/lib/rate-limit": stub(
    "export async function rateLimit() { return { allowed: true, retryAfterSec: 0 }; }\n" +
      "export function tooManyRequests() { return new Response('{}', { status: 429 }); }",
  ),
  "@/lib/legal/require-terms": stub("export async function requireTermsAccepted() { return null; }"),
  "@/lib/orgs/membership": stub(
    "export async function loadViewerOrgContext() { return null; }\nexport async function expireStaleInvites() {}\n" +
      "export async function admitMember() { return { ok: true }; }",
  ),
  "@/lib/orgs/org-blocks": stub("export async function loadOrgBlocks() { return { ok: true, blockedByOfficer: false }; }"),
};
registerHooks({
  resolve(specifier, context, nextResolve) {
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

// ── A fake PostgREST client: every chain is recorded and answered whole ──────

type Call = [string, ...unknown[]];
type Query = { client: "cookie" | "service"; table: string; calls: Call[] };
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };
const METHODS = ["select", "eq", "in", "is", "or", "order", "limit", "neq", "not", "update", "insert", "upsert", "delete"];
type World = { user: { id: string } | null; queries: Query[]; cookie?: unknown; service?: unknown };

function fakeClient(kind: Query["client"], world: World, answer: (q: Query) => Answer) {
  const settle = (q: Query, single: boolean) => {
    const a = answer(q);
    const data = single && Array.isArray(a.data) ? (a.data[0] ?? null) : (a.data ?? null);
    return { data, error: a.error ?? null, count: a.count ?? null };
  };
  const chain = (q: Query) => {
    const builder: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(() => settle(q, false)).then(ok, bad),
      maybeSingle: () => (q.calls.push(["maybeSingle"]), Promise.resolve().then(() => settle(q, true))),
      single: () => (q.calls.push(["single"]), Promise.resolve().then(() => settle(q, true))),
    };
    for (const name of METHODS) builder[name] = (...args: unknown[]) => (q.calls.push([name, ...args]), builder);
    return builder;
  };
  return {
    auth: { getUser: async () => ({ data: { user: world.user }, error: null }) },
    from(table: string) {
      const q: Query = { client: kind, table, calls: [] };
      world.queries.push(q);
      return chain(q);
    },
  };
}

const uuid = (n: number, tail: string) => `${tail.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = uuid(1, "a");
const ORG = uuid(1, "d");
const WRITES = ["insert", "upsert", "update", "delete"];

function install(answer: (q: Query) => Answer): World {
  const world: World = { user: { id: ME }, queries: [] };
  world.cookie = fakeClient("cookie", world, answer);
  world.service = fakeClient("service", world, answer);
  (globalThis as unknown as { __cl: World }).__cl = world;
  return world;
}
const writesTo = (w: World, table: string) => w.queries.filter((q) => q.table === table && q.calls.some((c) => WRITES.includes(c[0])));
const req = (method: string, body?: unknown) =>
  new Request("https://vibe.test/", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
async function json(res: Response) {
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
/** A route file by path: through a variable, so tsc never sees a `.ts` import (TS5097). */
const routeFile = (path: string): string => path;

const join = (await import(routeFile("../../app/api/orgs/[slug]/join/route.ts"))) as typeof import("../../app/api/orgs/[slug]/join/route");
const follow = (await import(routeFile("../../app/api/orgs/[slug]/follow/route.ts"))) as typeof import("../../app/api/orgs/[slug]/follow/route");

/** A club whose owner may be the viewer; `role` is the viewer's membership. */
function clubWorld(ownerIsMe: boolean, role: string | null) {
  return install((q) => {
    if (q.table === "orgs") return { data: [{ id: ORG, owner_id: ownerIsMe ? ME : uuid(2, "a"), hidden_at: null }] };
    if (q.table === "org_members" && q.calls.some((c) => c[0] === "delete")) return { count: 1 };
    if (q.table === "org_members") return { data: role ? [{ role }] : [] };
    if (q.table === "org_followers" && q.calls.some((c) => c[0] === "delete")) return { count: 1 };
    if (q.table === "org_followers") return { data: [{ source: "join" }], count: 7 };
    throw new Error(`unexpected read of ${q.table}`);
  });
}

test("leave: the owner can't leave, keep following or not, and nothing about their follow changes first", async () => {
  for (const body of [undefined, { keep_following: true }, { keep_following: false }]) {
    const w = clubWorld(true, "owner");
    const res = await json(await join.DELETE(req("DELETE", body), params("chess")));
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.code, "owner_cannot_leave");
    assert.equal(writesTo(w, "org_followers").length, 0, "no relabel, insert or delete before the refusal");
    assert.equal(writesTo(w, "org_members").length, 0);
  }
});

test("unfollow: every member is told to leave instead (409), and their follow stays", async () => {
  for (const role of ["member", "mod", "admin", "owner"]) {
    const w = clubWorld(role === "owner", role);
    const res = await json(await follow.DELETE(req("DELETE"), params("chess")));
    assert.equal(res.status, 409, role);
    assert.equal(res.body.code, "member_follows", role);
    assert.equal(writesTo(w, "org_followers").length, 0, role);
  }
  const w = clubWorld(false, null);
  const res = await json(await follow.DELETE(req("DELETE"), params("chess")));
  assert.equal(res.status, 200);
  assert.equal(res.body.org_follow_state, "not_following");
  const [del] = writesTo(w, "org_followers");
  assert.ok(del.calls.some((c) => c[0] === "eq" && c[1] === "user_id" && c[2] === ME), "only my own follow row");
  assert.ok(del.calls.some((c) => c[0] === "eq" && c[1] === "org_id" && c[2] === ORG));
});

// ── Source checks over the app ───────────────────────────────────────────────

const REPO_ROOT = new URL("../../../", import.meta.url);
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(new URL(dir, REPO_ROOT))) {
    const path = `${dir}/${name}`;
    if (statSync(new URL(path, REPO_ROOT)).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path);
  }
  return out;
}
const read = (path: string) => readFileSync(new URL(path, REPO_ROOT), "utf8");

test("a club mute stays out of the chats: no chat, thread, push or Messages code reads it", () => {
  const chatSide = [
    ...walk("src/lib/chat"),
    ...walk("src/lib/push"),
    ...walk("src/app/api/me/threads"),
    ...walk("src/app/api/me/club-boards"),
    ...walk("src/app/api/orgs/[slug]/space"),
    ...walk("src/components/mobile/messages"),
    ...walk("src/components/desktop/messages"),
  ];
  assert.ok(chatSide.length > 40, "the walk found the chat code");
  for (const path of chatSide) {
    assert.doesNotMatch(read(path), /org_post_mutes|orgs\/org-mutes|loadMutedOrg/, path);
  }
  const route = read("src/app/api/orgs/[slug]/mute/route.ts");
  assert.doesNotMatch(route, /from\("(org_followers|org_members|channel_members|messages)"\)/, "muting writes only the mute");
});

test("clubs never follow people: every follow a route writes is the signed-in student's own", () => {
  const api = walk("src/app/api");
  let inserts = 0;
  for (const path of api) {
    const src = read(path);
    for (const m of src.matchAll(/from\("org_followers"\)\s*\.(insert|upsert)\(\{([^}]*)\}/g)) {
      inserts += 1;
      assert.match(m[2], /user_id: (user\.id|userId)\b/, `${path}: ${m[2]}`);
    }
    // A helper that takes the id is only ever called with the viewer's own.
    for (const m of src.matchAll(/followOnRequest\(service, [\w.]+, ([\w.]+)\)/g)) assert.equal(m[1], "user.id", path);
  }
  assert.ok(inserts >= 3, "follow, request and keep-following all write follows");
  for (const path of api) {
    assert.doesNotMatch(read(path), /from\("follows"\)[^;]*insert\(\{[^}]*org_id/, `${path}: a club in the people follow table`);
  }
});
