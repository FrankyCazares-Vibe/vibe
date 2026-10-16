/**
 * Chat and thread actions under the account budgets (rate limits and upload
 * caps, wave 3, B3.1), run for real on stand-ins:
 *   - accept, clear, decline, hide, pin, mute and leave/remove count against
 *     `threadSettings`, a per-member mute against `prefs`, a reaction against
 *     `react`, a group rename or photo against `threadEdit`
 *     (src/lib/limits/budgets.ts). Each asks once, right after sign-in and
 *     before the body or any read. Refused, it answers 429 with its own
 *     plain line and the time left, and has read nothing;
 *   - signed out, nothing is counted;
 *   - typing and read marks have no limiter at all, since a per-account count
 *     of either would record when someone is on Vibe (Privacy Policy 3d).
 *     Typing writes only when the stamp runs out within 4 s, so a ping every
 *     3 s keeps the dots on (limits critique #5); a read mark always writes,
 *     so no message is left unread (critique #4).
 * A source scan backs the order up: a later edit that slips a read in above
 * the limiter fails here too.
 *
 * Run with:
 *   node --test src/lib/chat/thread-limits.test.ts
 *
 * It lives here, not next to the routes: `node --test` reads its arguments
 * as globs, so a path with `[id]` in it never matches.
 *
 * WHY THE RESOLVE HOOK (as members-guard.test.ts): the routes import
 * "server-only" modules and the two Supabase clients. The clients, the
 * publish gate, the removed-picture store and r2 resolve to small data:
 * modules that read their fakes from globalThis. budgets.ts and rate-limit.ts
 * are the real code, so the key, limit and window the database is asked for
 * are the real ones.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { mock, test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("thread-limits.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__tl.cookie; }"),
  "@/lib/supabase/service": stub("export function createSupabaseServiceClient() { return globalThis.__tl.service; }"),
  "@/lib/moderation/access": stub(
    "export async function requireCanPublish() { globalThis.__tl.reads.push('gate'); return null; }\n" +
      "export function contentBlockedResponse() { return new Response('{}', { status: 422 }); }",
  ),
  "@/app/api/admin/images/_lib/removed-picture-store": stub(
    "export async function checkRemovedPicture() { globalThis.__tl.reads.push('removed-picture'); return 'ok'; }",
  ),
  "@/lib/r2": stub("export const GROUP_PHOTO_KEY_PREFIX = 'groups/';"),
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

// Through variables, so tsc doesn't refuse the `.ts` endings node needs.
const BUDGETS_FILE = "../limits/budgets.ts";
const EMOJI_FILE = "../messages/reaction-emoji.ts";
const { BUDGETS } = (await import(BUDGETS_FILE)) as typeof import("../limits/budgets");
const { ALLOWED_EMOJIS } = (await import(EMOJI_FILE)) as typeof import("../messages/reaction-emoji");
type BudgetName = keyof typeof BUDGETS;

// ── The routes ───────────────────────────────────────────────────────────────

const THREAD_DIR = "app/api/me/threads/[id]/";
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Method = "POST" | "DELETE" | "PATCH";
type Limited = { file: string; method: Method; budget: BudgetName; body?: Record<string, unknown> };
const LIMITED: Limited[] = [
  { file: "accept/route.ts", method: "POST", budget: "threadSettings" },
  { file: "clear/route.ts", method: "POST", budget: "threadSettings" },
  { file: "decline/route.ts", method: "POST", budget: "threadSettings" },
  { file: "hide/route.ts", method: "POST", budget: "threadSettings" },
  { file: "pin/route.ts", method: "POST", budget: "threadSettings", body: { pinned: true } },
  { file: "mute/route.ts", method: "POST", budget: "threadSettings", body: { duration_hours: 8 } },
  { file: "mute/route.ts", method: "DELETE", budget: "threadSettings" },
  { file: "members/[userId]/route.ts", method: "DELETE", budget: "threadSettings" },
  { file: "members/[userId]/mute/route.ts", method: "POST", budget: "prefs", body: { duration_hours: 1 } },
  { file: "members/[userId]/mute/route.ts", method: "DELETE", budget: "prefs" },
  { file: "messages/[messageId]/react/route.ts", method: "POST", budget: "react", body: { emoji: ALLOWED_EMOJIS[0] } },
  { file: "messages/[messageId]/react/route.ts", method: "DELETE", budget: "react", body: { emoji: ALLOWED_EMOJIS[0] } },
  { file: "route.ts", method: "PATCH", budget: "threadEdit", body: { name: "Study group" } },
];
const NO_LIMITER = ["typing/route.ts", "read/route.ts"];

async function handlerOf(file: string, method: Method): Promise<Handler> {
  const mod = (await import(`../../${THREAD_DIR}${file}`)) as Record<string, Handler | undefined>;
  const handler = mod[method];
  assert.ok(handler, `${file} exports ${method}`);
  return handler;
}

// ── The world: two fake clients and the limiter's database ──────────────────

const CHANNEL = "cccccccc-0000-4000-8000-000000000001";
const OTHER = "dddddddd-0000-4000-8000-000000000002";
const MESSAGE = "eeeeeeee-0000-4000-8000-000000000003";

type Call = [string, ...unknown[]];
type Query = { client: "cookie" | "service"; table: string; calls: Call[] };
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
type World = {
  user: { id: string } | null;
  /** What `rate_limit_hit` answers. */
  allow: boolean;
  asked: { p_key: string; p_limit: number; p_window_seconds: number }[];
  queries: Query[];
  /** Every table read or written, and the publish gate, in order. */
  reads: string[];
  answer: (q: Query) => Answer;
  cookie?: unknown;
  service?: unknown;
};

const BUILDER_METHODS = ["select", "update", "insert", "upsert", "delete", "eq", "is", "or", "in", "lte", "gt"];

function fakeClient(kind: Query["client"], world: World) {
  return {
    auth: { getUser: async () => ({ data: { user: world.user }, error: null }) },
    from(table: string) {
      const q: Query = { client: kind, table, calls: [] };
      world.queries.push(q);
      world.reads.push(`${kind}:${table}`);
      const settle = () => Promise.resolve().then(() => ({ data: null, error: null, ...world.answer(q) }));
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => settle().then(ok, bad),
        maybeSingle: settle,
        single: settle,
      };
      for (const name of BUILDER_METHODS) {
        builder[name] = (...args: unknown[]) => {
          q.calls.push([name, ...args]);
          return builder;
        };
      }
      return builder;
    },
    rpc(name: string, args: World["asked"][number]) {
      assert.equal(name, "rate_limit_hit", "the only call the routes make before a read is the limiter's");
      world.asked.push(args);
      return { abortSignal: async () => ({ data: world.allow, error: null, status: 200 }) };
    },
  };
}

/** A fresh account per call: the limiter's deny cache keys on the account, so no test sees another's refusal. */
function install(opts: { signedOut?: boolean; allow?: boolean; answer?: World["answer"] } = {}): World {
  const world: World = {
    user: opts.signedOut ? null : { id: randomUUID() },
    allow: opts.allow ?? true,
    asked: [],
    queries: [],
    reads: [],
    answer: opts.answer ?? (() => ({})),
  };
  world.cookie = fakeClient("cookie", world);
  world.service = fakeClient("service", world);
  (globalThis as Record<string, unknown>).__tl = world;
  return world;
}

async function call(file: string, method: Method, body?: Record<string, unknown>): Promise<Response> {
  const handler = await handlerOf(file, method);
  const req = new Request(`https://vibe.test/api/me/threads/${CHANNEL}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  return handler(req, { params: Promise.resolve({ id: CHANNEL, userId: OTHER, messageId: MESSAGE }) });
}

// ── The limited routes ───────────────────────────────────────────────────────

const label = (r: Limited) => `${r.method} ${r.file}`;

/** One refusal line per budget: two routes that share a budget say the same thing. */
const LINE: Record<string, string> = {
  threadSettings: "You're changing chat settings too fast. Try again in a few minutes.",
  threadEdit: "You're changing this group too fast. Try again in a few minutes.",
  react: "You're reacting too fast. Try again in a few minutes.",
  prefs: "Too many changes at once. Try again in a few minutes.",
};

test("refused: 429 with the budget's plain line and the time left, and nothing read", async () => {
  for (const route of LIMITED) {
    const world = install({ allow: false });
    const res = await call(route.file, route.method, route.body);
    assert.equal(res.status, 429, label(route));
    const body = (await res.json()) as { ok: boolean; error: string };
    assert.equal(body.ok, false, label(route));
    assert.equal(body.error, LINE[route.budget], label(route));
    const retry = Number(res.headers.get("retry-after"));
    const { limit, windowSec } = BUDGETS[route.budget];
    assert.ok(Number.isInteger(retry) && retry >= 1 && retry <= windowSec, `${label(route)}: retry ${retry}`);
    assert.deepEqual(world.reads, [], `${label(route)} read nothing before the limiter`);
    assert.deepEqual(
      world.asked,
      [{ p_key: `budget-${route.budget}:${world.user!.id}`, p_limit: limit, p_window_seconds: windowSec }],
      label(route),
    );
  }
});

test("allowed: one count against the route's budget, then the route goes on", async () => {
  for (const route of LIMITED) {
    const world = install();
    const res = await call(route.file, route.method, route.body);
    assert.notEqual(res.status, 429, label(route));
    assert.equal(world.asked.length, 1, label(route));
    assert.equal(world.asked[0].p_key, `budget-${route.budget}:${world.user!.id}`, label(route));
    assert.ok(world.reads.length > 0, `${label(route)} went on past the limiter`);
  }
});

test("signed out: 401, nothing counted, nothing read", async () => {
  for (const route of LIMITED) {
    const world = install({ signedOut: true });
    const res = await call(route.file, route.method, route.body);
    assert.equal(res.status, 401, label(route));
    assert.deepEqual(world.asked, [], label(route));
    assert.deepEqual(world.reads, [], label(route));
  }
});

// ── Typing and read marks: no limiter, bounded by the write itself ──────────

/** The typing route's one update, against one stored stamp: a fake that applies the `or` filter the way PostgREST would. */
function typingWorld(stamp: { value: string | null }) {
  return install({
    answer: (q) => {
      const filter = q.calls.find((c) => c[0] === "or")?.[1];
      const set = q.calls.find((c) => c[0] === "update")?.[1] as { typing_until: string } | undefined;
      const m = /^typing_until\.is\.null,typing_until\.lte\.(.+)$/.exec(String(filter));
      assert.ok(m && set, `a conditional typing write, got ${String(filter)}`);
      if (stamp.value === null || Date.parse(stamp.value) <= Date.parse(m[1])) stamp.value = set.typing_until;
      return {};
    },
  });
}

test("typing: no count, and the stamp is written 5 s ahead only when it has 4 s or less left", async () => {
  const world = typingWorld({ value: null });
  const before = Date.now();
  const res = await call("typing/route.ts", "POST");
  assert.equal(res.status, 200);
  assert.deepEqual(world.asked, []);
  assert.equal(world.queries.length, 1);
  const [q] = world.queries;
  assert.equal(q.table, "channel_members");
  const until = Date.parse((q.calls.find((c) => c[0] === "update")![1] as { typing_until: string }).typing_until);
  const fresh = Date.parse(/lte\.(.+)$/.exec(String(q.calls.find((c) => c[0] === "or")![1]))![1]);
  assert.ok(Math.abs(until - before - 5000) < 1000, "typing_until is now + 5 s");
  assert.equal(until - fresh, 1000, "the write line sits 1 s under the new stamp: now + 4 s");
});

test("typing: a ping every 3 s, give or take the network, keeps the dots on; one under 1 s after a write is skipped", async () => {
  const t0 = Date.UTC(2026, 9, 16, 20, 0, 0);
  mock.timers.enable({ apis: ["Date"], now: t0 });
  try {
    const stamp: { value: string | null } = { value: null };
    const writes: number[] = [];
    // When each ping reaches the server: every 3 s, some early, some late,
    // plus a double send at 3.4 s and 9.5 s. A 2 s line skips the 2.9 s ping
    // and the dots go out before 8.8 s (critique #5).
    for (const at of [0, 2900, 3400, 5800, 8800, 9500, 11700]) {
      mock.timers.setTime(t0 + at);
      // The dots are on at every ping after the first: the stamp hasn't run out.
      if (at > 0) assert.ok(Date.parse(stamp.value!) > t0 + at, `the dots were still on at ${at} ms`);
      const prior = stamp.value;
      typingWorld(stamp);
      assert.equal((await call("typing/route.ts", "POST")).status, 200);
      if (stamp.value !== prior) writes.push(at);
    }
    assert.deepEqual(writes, [0, 2900, 5800, 8800, 11700], "the 3.4 s and 9.5 s pings found more than 4 s left");
  } finally {
    mock.timers.reset();
  }
});

test("typing: a missing column is skipped quietly, a refused filter is not", async () => {
  install({ answer: () => ({ error: { code: "42703", message: "column channel_members.typing_until does not exist" } }) });
  const missing = await call("typing/route.ts", "POST");
  assert.deepEqual([missing.status, await missing.json()], [200, { ok: true, skipped: true }]);
  install({ answer: () => ({ error: { code: "PGRST100", message: "failed to parse logic tree ((typing_until.is.null,…))" } }) });
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal((await call("typing/route.ts", "POST")).status, 500);
  } finally {
    console.error = origError;
  }
});

test("read: no count, and every mark writes, however soon after the last", async () => {
  for (let i = 0; i < 3; i += 1) {
    const world = install();
    assert.equal((await call("read/route.ts", "POST")).status, 200);
    assert.deepEqual(world.asked, []);
    assert.equal(world.queries.length, 1);
    const calls = world.queries[0].calls;
    assert.equal(calls[0][0], "update");
    assert.ok("last_read_at" in (calls[0][1] as object));
    assert.deepEqual(calls.slice(1).map((c) => [c[0], c[1]]), [["eq", "channel_id"], ["eq", "user_id"]], "no condition on the stamp");
  }
});

// ── The source, as a second look ────────────────────────────────────────────

/** The code only: block comments, then whole-line `//` comments. */
const codeOnly = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const source = (file: string) => codeOnly(readFileSync(new URL(`${THREAD_DIR}${file}`, SRC_ROOT), "utf8"));

function handlerSource(file: string, method: Method): string {
  const text = source(file);
  const start = text.indexOf(`export async function ${method}(`);
  assert.ok(start >= 0, `${file} has ${method}`);
  const next = text.indexOf("\nexport ", start + 1);
  return text.slice(start, next < 0 ? undefined : next);
}

/** The sign-in check, then the limiter as the very next statement, then its refusal. */
const LIMITER_AFTER_SIGN_IN =
  /(?:\{ status: 401 \}\);\s*\}|if \(!auth\.ok\) return auth\.res;)\s*const rl = await limitFor\("(\w+)", (?:user\.id|auth\.userId)\);\s*if \(!rl\.allowed\) return tooManyRequests\(rl, [A-Z_]+\);/;
const FIRST_READS = [".from(", ".rpc(", "requireCanPublish(", "blockedIdsFor(", "req.json("];

test("source: each limited handler counts right after sign-in, before the body or any read", () => {
  for (const route of LIMITED) {
    const body = handlerSource(route.file, route.method);
    const m = LIMITER_AFTER_SIGN_IN.exec(body);
    assert.ok(m, `${label(route)}: the limiter is the statement right after the sign-in check`);
    assert.equal(m[1], route.budget, label(route));
    assert.equal(body.split("limitFor(").length - 1, 1, `${label(route)} counts once`);
    for (const read of FIRST_READS) {
      const at = body.indexOf(read);
      assert.ok(at < 0 || at > m.index, `${label(route)}: ${read} comes after the limiter`);
    }
  }
});

test("source: typing and read marks have no limiter, and no per-account key", () => {
  for (const file of NO_LIMITER) {
    const text = source(file);
    for (const piece of ["limitFor(", "rateLimit(", "@/lib/rate-limit", "@/lib/limits/budgets"]) {
      assert.ok(!text.includes(piece), `${file} has no ${piece}`);
    }
  }
});
