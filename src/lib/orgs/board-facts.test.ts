/**
 * `board-facts.ts` (wave-2 repair, findings 15 and 16): who the club page
 * offers the Announcement Board card to, against stand-ins of the two
 * Supabase clients, and the TS copy of `can_view_org_channel`'s follower arm
 * checked against the newest migration that restates the function.
 *
 * Run with:
 *   node --test src/lib/orgs/board-facts.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("board-facts.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const facts = (await import(new URL("lib/orgs/board-facts.ts", SRC_ROOT).href)) as typeof import("./board-facts");
const { OFFICER_ROLES } = (await import(new URL("lib/orgs/join-state.ts", SRC_ROOT).href)) as typeof import("./join-state");
type Client = Parameters<typeof facts.loadBoardFacts>[0];

// ── Stand-in clients ─────────────────────────────────────────────────────────

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown };
function fakeClient(answer: (table: string, calls: Call[]) => Answer) {
  const log: string[] = [];
  const chain = (table: string, calls: Call[]) => {
    const settle = () => {
      const a = answer(table, calls);
      return { data: a.data ?? null, error: a.error ?? null };
    };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "limit"]) b[m] = (...args: unknown[]) => (calls.push([m, ...args]), b);
    b.maybeSingle = () => Promise.resolve().then(() => {
      const r = settle();
      return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
    });
    b.then = (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve().then(settle).then(ok, no);
    return b;
  };
  return {
    log,
    client: {
      from: (t: string) => (log.push(t), chain(t, [])),
      rpc: (fn: string, args: unknown) => (log.push(`rpc:${fn}`), chain(`rpc:${fn}`, [["rpc", args]])),
    } as unknown as Client,
  };
}

const uuid = (n: number, c: string) => `${c.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = uuid(1, "d");
const ME = uuid(1, "a");
const OWNER = uuid(2, "a");
const BOARD = uuid(1, "c");

type World = { board?: "none" | "error" | "private"; switch?: boolean | "error"; verified?: boolean; barred?: boolean; blockedBy?: string | null; readsFail?: boolean; canView?: boolean | "error" };
function world(w: World = {}) {
  const service = fakeClient((table, calls) => {
    if (table === "channels") return w.board === "error" ? { error: { code: "XX000", message: "boom" } } : { data: w.board === "none" ? null : { id: BOARD, is_private: w.board === "private" } };
    if (table === "orgs") {
      if (String(calls[0]?.[1]).includes("owner_id")) return { data: { owner_id: OWNER } };
      return w.switch === "error" ? { error: { code: "42703", message: "no column" } } : { data: { followers_read_board: w.switch ?? true } };
    }
    if (table === "users") return w.readsFail ? { error: { code: "XX000", message: "boom" } } : { data: { school_verified: w.verified ?? true } };
    if (table === "org_board_bars") return { data: w.barred ? { user_id: ME } : null };
    if (table === "org_members") return { data: [] };
    if (table === "blocks") {
      const blockedIsMe = calls.some((c) => c[0] === "eq" && c[1] === "blocked_id" && c[2] === ME);
      return { data: blockedIsMe && w.blockedBy ? [{ blocker_id: w.blockedBy }] : [] };
    }
    throw new Error(`unexpected service read of ${table}`);
  });
  const cookie = fakeClient((table) => {
    if (table === "rpc:can_view_org_channel") return w.canView === "error" ? { error: { code: "XX000", message: "x" } } : { data: w.canView ?? true };
    throw new Error(`unexpected cookie read of ${table}`);
  });
  return { service, cookie };
}

type Asked = Partial<Parameters<typeof facts.loadBoardFacts>[2]>;
async function ask(w: World, a: Asked = {}) {
  const { service, cookie } = world(w);
  const quiet = console.error;
  console.error = () => {};
  try {
    const out = await facts.loadBoardFacts(service.client, cookie.client, { orgId: ORG, hidden: false, viewerId: ME, isMember: false, following: false, removed: false, ...a });
    return { out, service: service.log, cookie: cookie.log };
  } finally {
    console.error = quiet;
  }
}

// ── The card's facts ─────────────────────────────────────────────────────────

test("a verified visitor nothing bars is asked to follow; signed out there is no card", async () => {
  assert.equal((await ask({})).out.followWouldRead, true);
  const out = (await ask({}, { viewerId: null })).out;
  assert.deepEqual([out.followWouldRead, out.verifyToRead, out.boardReadable, out.readersOn], [false, false, null, null], "signed out: nothing to compare against a barred account");
});

test("barred, removed, blocked by an officer, switch off, hidden, private Board: no card, and no Verify either", async () => {
  for (const [label, w, a] of [
    ["barred", { barred: true }, {}],
    ["removed", {}, { removed: true }],
    ["blocked by the owner", { blockedBy: OWNER }, {}],
    ["switch off", { switch: false }, {}],
    ["switch unknown", { switch: "error" }, {}],
    ["hidden club", {}, { hidden: true }],
    ["private Board", { board: "private" }, {}],
    ["no Board", { board: "none" }, {}],
    ["Board read failed", { board: "error" }, {}],
    ["eligibility read failed", { readsFail: true }, {}],
  ] as Array<[string, World, Asked]>) {
    for (const verified of [true, false]) {
      const { out } = await ask({ ...w, verified }, a);
      assert.equal(out.followWouldRead, false, `${label}, verified ${verified}`);
      assert.equal(out.verifyToRead, false, `${label}, verified ${verified}`);
    }
  }
});

test("unverified: Verify, never Follow, follower or not; a follower's own answer comes from the database", async () => {
  const visitor = (await ask({ verified: false })).out;
  assert.deepEqual([visitor.followWouldRead, visitor.verifyToRead], [false, true]);
  const follower = await ask({ verified: false, canView: false }, { following: true });
  assert.deepEqual([follower.out.boardReadable, follower.out.verifyToRead, follower.out.followWouldRead], [false, true, false]);
  const reads = await ask({}, { following: true });
  assert.deepEqual([reads.out.boardReadable, reads.out.verifyToRead], [true, false]);
  assert.ok(!reads.service.includes("users"), "a follower the database lets in pays for no eligibility read");
  const unknown = (await ask({ canView: "error" }, { following: true })).out;
  assert.deepEqual([unknown.boardReadable, unknown.verifyToRead], [null, false]);
});

test("a member: the database's answer, and the club's switch for the leave line and the officers' row", async () => {
  const on = (await ask({}, { isMember: true, following: true })).out;
  assert.deepEqual([on.boardReadable, on.readersOn, on.followWouldRead], [true, true, false]);
  assert.equal((await ask({ switch: false }, { isMember: true })).out.readersOn, false);
  assert.equal((await ask({ switch: "error" }, { isMember: true })).out.readersOn, null, "unknown, never a guess");
  for (const a of [{}, { following: true }] as Asked[]) assert.equal((await ask({}, a)).out.readersOn, null, "never to anyone but a member");
});

// ── The TS copy of the SQL rule ──────────────────────────────────────────────

test("followerArmHolds is can_view_org_channel's follower arm, condition for condition", () => {
  const dir = new URL("../../../supabase/migrations/", import.meta.url);
  const newest = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().reverse()
    .find((f) => readFileSync(new URL(f, dir), "utf8").includes("FUNCTION public.can_view_org_channel"));
  assert.ok(newest, "a migration defines can_view_org_channel");
  const sql = readFileSync(new URL(newest, dir), "utf8");
  const fn = sql.slice(sql.indexOf("FUNCTION public.can_view_org_channel"));
  const arm = fn.slice(fn.indexOf("WHEN NOT public.is_org_member"), fn.indexOf("WHEN c.kind = 'event'"));
  assert.ok(arm.length > 100, `${newest}: the follower arm`);
  const flat = arm.replace(/\s+/g, " ");
  for (const [field, line] of Object.entries(facts.FOLLOWER_ARM_SQL)) assert.ok(flat.includes(line), `${newest}: ${field} → ${line}`);
  // Every condition at the EXISTS's top level is mirrored (or is the follow row's own key).
  const indent = /^(\s*)AND u\.school_verified/m.exec(arm)?.[1];
  assert.ok(indent !== undefined);
  const top = arm.split("\n").filter((l) => l.startsWith(`${indent}AND `) && !l.startsWith(`${indent} `)).map((l) => l.trim());
  const mirrored = Object.values(facts.FOLLOWER_ARM_SQL).filter((l) => l.startsWith("AND "));
  assert.deepEqual(top.filter((l) => l !== "AND f.user_id = uid").map((l) => mirrored.find((m) => l.startsWith(m)) ?? l).sort(), [...mirrored].sort(), `${newest}: a new SQL condition needs a field in FollowerArmFacts`);
  // The block test's officers are loadOrgBlocks's side. The SQL still lists
  // 'mod': 20261021100000 turned every mod into an officer and made the role
  // impossible, but left that branch in place (dead, so the function was not
  // restated). The list minus 'mod' is the TS list.
  const sqlRoles = /m\.role IN \(([^)]*)\)/.exec(flat)?.[1].split(",").map((r) => r.trim().replace(/'/g, ""));
  assert.ok(sqlRoles, `${newest}: the block test's role list`);
  assert.deepEqual(sqlRoles.filter((r) => r !== "mod").sort(), [...OFFICER_ROLES].sort());
  // And each field matters.
  const all = { board: true, boardPrivate: false, verified: true, hidden: false, switchOn: true, barred: false, removed: false, blockedByOfficer: false };
  assert.equal(facts.followerArmHolds(all), true);
  for (const [k, v] of Object.entries(all)) assert.equal(facts.followerArmHolds({ ...all, [k]: k === "boardPrivate" ? null : !v }), false, k);
});

test("the page and the club GET share this module; the page's member count is floored", () => {
  const page = readFileSync(new URL("app/orgs/[handle]/page.tsx", SRC_ROOT), "utf8");
  const route = readFileSync(new URL("app/api/orgs/[slug]/route.ts", SRC_ROOT), "utf8");
  assert.match(page, /import \{ NO_BOARD, loadBoardFacts \} from "@\/lib\/orgs\/board-facts"/);
  assert.ok(!/async function loadBoardFacts|org_board_bars|school_verified/.test(page), "no second copy of the rule on the page");
  assert.match(page, /member_count: memberRes\.error \? null : publicMemberCount\(memberRes\.count, viewerRole\)/);
  assert.match(page, /boardReadersOn=\{viewerRole && boardFacts\.boardId \? boardFacts\.readersOn : null\}/);
  assert.match(route, /import \{ loadBoardReadable \} from "@\/lib\/orgs\/board-facts"/);
  assert.ok(!/async function loadBoardReadable/.test(route));
  assert.match(route, /followers_read_board: ctx\.role \? boardSetting\(org\.followers_read_board\) : null/);
});
