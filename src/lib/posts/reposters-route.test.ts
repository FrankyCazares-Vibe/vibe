/**
 * GET /api/posts/[id]/reposters (Oct 19, 2026, decision 1a), driven end to
 * end against fakes:
 *   - signed out is a 401, before the limiter or any read;
 *   - the `repostersRead` budget runs right after sign-in, before any read;
 *   - a hidden club's post is the same 404 as a missing one for a
 *     non-member (its author and its members still get the list), and so is
 *     a post across a block with its author, an id that isn't a uuid, and
 *     someone else's draft, removed post or restricted author's post;
 *   - only people the viewer follows are named; a blocked, muted, suspended
 *     or banned one is left out; everyone else is counted, never named;
 *   - the names don't depend on how many people the viewer follows, and the
 *     follow check asks at most FOLLOW_CHECK_CHUNK ids at a time;
 *   - others_total never goes below 0 and leaves the viewer's own repost out;
 *   - a read that decides who is named failing is a 500, never names;
 *   - every answer says Cache-Control: private, no-store.
 *
 * Run with:
 *   node --test src/lib/posts/reposters-route.test.ts
 *
 * WHY THE RESOLVE HOOK (as src/lib/events/attendees-route.test.ts): the route
 * imports "next/server", both Supabase clients and the limiter; each resolves
 * to a small data: module that reads its fake from globalThis. budgets,
 * pgrest, engagement-counts, reposters, hidden-users, pair-block and the
 * shared post gate (hidden-org-access) are the real code, the gate since
 * Oct 19, 2026, so the route is tested through the very helper it calls. It lives here, not next to the route:
 * `node --test` reads its arguments as globs, and `[id]` never matches.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test, type TestContext } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("reposters-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export class NextResponse extends Response {\n" +
      "  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }); }\n" +
      "}",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__rp.client('cookie'); }"),
  "@/lib/supabase/service": dataModule(
    "export function createSupabaseServiceClient() { return globalThis.__rp.client('service'); }\n" +
      "export function isSupabaseServiceConfigured() { return globalThis.__rp.serviceOn; }",
  ),
  "@/lib/rate-limit": dataModule(
    "export async function rateLimit(key, opts) { const w = globalThis.__rp; w.log.push('limit:' + key); w.limits.push({ key, opts });\n" +
      "  return w.allow ? { allowed: true, retryAfterSec: 0, reason: null } : { allowed: false, retryAfterSec: 300, reason: 'limited' }; }\n" +
      "export function tooManyRequests(result, message = 'Too many requests. Try again shortly.') {\n" +
      "  return new Response(JSON.stringify({ ok: false, error: message }),\n" +
      "    { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(Math.max(1, result.retryAfterSec)) } }); }",
  ),
};
/** The only "@/" modules that load for real. */
const REAL = new Set([
  "@/lib/limits/budgets",
  "@/lib/orgs/hidden-org-access",
  "@/lib/pgrest",
  "@/lib/posts/engagement-counts",
  "@/lib/posts/reposters",
  "@/lib/safety/hidden-users",
  "@/lib/safety/pair-block",
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      if (!REAL.has(specifier)) throw new Error(`reposters-route.test.ts: add a stand-in for ${specifier}`);
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const routeSpecifier = "../../app/api/posts/[id]/reposters/route.ts";
const { GET } = (await import(routeSpecifier)) as typeof import("../../app/api/posts/[id]/reposters/route");
type Answer = import("./reposters").RepostersResponse & { error?: string };

// ── The world: one post, its reposts, the viewer's follows, blocks and mutes ─

const POST = "bbbbbbbb-0000-4000-8000-000000000001";
const ORG = "cccccccc-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const AUTHOR = "22222222-0000-4000-8000-000000000001";
const uid = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (min: number) => new Date(Date.UTC(2026, 9, 19, 20, min)).toISOString();
const NAMES = ["Maya", "Jonah", "Priya", "Sam", "Lee", "Ava"];
const USERS = NAMES.map((name, i) => ({ id: uid(i + 1), name, handle: name.toLowerCase(), avatar_url: null }));

type Row = Record<string, unknown>;
type World = {
  user?: { id: string } | null;
  allow?: boolean;
  serviceOn?: boolean;
  /** Merged over a published personal post by AUTHOR; null for no post at all. */
  post?: Row | null;
  reposts?: Row[];
  follows?: string[];
  followers?: string[];
  blocks?: Row[];
  mutes?: Row[];
  repostCount?: number;
  hiddenClub?: boolean;
  /** Members of the club ORG. */
  members?: string[];
  /** People with a restriction in force (suspended or banned): user_visible() is false for them. */
  restricted?: string[];
  /** More profiles than USERS, for the big-list tests. */
  extraUsers?: Row[];
  fail?: Partial<Record<"posts" | "orgs" | "blocks" | "mutes" | "connections" | "post_reposts" | "users" | "rpc", boolean>>;
};

/** PostgREST's max_rows (supabase/config.toml): no read returns more, whatever .limit() asks. */
const MAX_ROWS = 1000;

/**
 * A fake of both clients over one world. Filters are applied for real (eq,
 * in, the two `blocks` .or() shapes), every read stops at MAX_ROWS, and RLS
 * is played where the route leans on it (Oct 19, 2026, review of B2):
 *   - post_reposts: the cookie client sees only the viewer's own rows (T1),
 *     so a route that read reposts on it would name nobody;
 *   - users: the cookie client never sees a restricted person but the viewer
 *     (users_select_authenticated, user_visible), so a route that read
 *     profiles on the service role would name a banned person;
 *   - posts: the cookie client sees a post only when it's the viewer's own,
 *     or published, not removed and by an author with no restriction
 *     (posts_select_authenticated), so a route that read the post on the
 *     service role would serve a list for someone else's draft.
 */
function setup(w: World) {
  const log: string[] = [];
  const limits: { key: string; opts: unknown }[] = [];
  const restricted = new Set(w.restricted ?? []);
  const tables = (): Record<string, Row[]> => ({
    posts: w.post === null ? [] : [{ id: POST, user_id: AUTHOR, org_id: null, status: "published", removed_at: null, ...w.post }],
    post_reposts: (w.reposts ?? []).map((r) => ({ post_id: POST, ...r })),
    connections: [
      ...(w.follows ?? []).map((id) => ({ follower_id: ME, following_id: id })),
      ...(w.followers ?? []).map((id) => ({ follower_id: id, following_id: ME })),
    ],
    blocks: w.blocks ?? [],
    mutes: (w.mutes ?? []).map((r) => ({ muter_id: ME, until: null, ...r })),
    users: [...USERS, ...(w.extraUsers ?? [])],
    orgs: [{ id: ORG, hidden_at: w.hiddenClub ? "2026-10-01T00:00:00Z" : null }],
    org_members: (w.members ?? []).map((user_id) => ({ org_id: ORG, user_id })),
  });
  const cookieSees = (table: string, r: Row): boolean => {
    if (table === "post_reposts") return r.user_id === ME;
    if (table === "users") return r.id === ME || !restricted.has(String(r.id));
    if (table === "posts") return r.user_id === ME || (r.status === "published" && !r.removed_at && !restricted.has(String(r.user_id)));
    return true;
  };
  const chain = (who: "cookie" | "service", table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let head = false;
    let cap = Infinity;
    const b: Record<string, unknown> = {};
    b.select = (_cols: string, opts?: { head?: boolean }) => ((head = opts?.head === true), b);
    b.eq = (col: string, v: unknown) => (filters.push((r) => r[col] === v), b);
    b.in = (col: string, vs: unknown[]) => {
      log.push(`${who}:${table}:in:${vs.length}`);
      filters.push((r) => vs.includes(r[col]));
      return b;
    };
    b.order = () => b;
    b.limit = (n: number) => ((cap = n), b);
    b.or = (expr: string) => {
      const ids: string[] = expr.match(/[0-9a-f-]{36}/g) ?? [];
      filters.push(
        expr.startsWith("and(")
          ? (r) => ids.includes(String(r.blocker_id)) && ids.includes(String(r.blocked_id))
          : (r) => r.blocker_id === ids[0] || r.blocked_id === ids[0],
      );
      return b;
    };
    const run = () => {
      log.push(`${who}:${table}`);
      if (w.fail?.[table as keyof NonNullable<World["fail"]>]) return { data: null, error: { message: `${table} down` }, count: null };
      let rows = tables()[table] ?? [];
      if (who === "cookie") rows = rows.filter((r) => cookieSees(table, r));
      rows = rows.filter((r) => filters.every((f) => f(r)));
      // A head count isn't a page of rows, so max_rows doesn't cut it.
      if (head) return { data: null, error: null, count: rows.length };
      return { data: rows.slice(0, Math.min(cap, MAX_ROWS)), error: null, count: null };
    };
    b.maybeSingle = async () => {
      const r = run();
      return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
    };
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, bad);
    return b;
  };
  const client = (who: "cookie" | "service") => ({
    auth: { getUser: async () => (log.push("getUser"), { data: { user: w.user === undefined ? { id: ME } : w.user }, error: null }) },
    from: (table: string) => chain(who, table),
    rpc: async (name: string, args: { p_post_ids: string[] }) => {
      log.push(`${who}:rpc:${name}`);
      if (w.fail?.rpc) return { data: null, error: { message: "rpc down" } };
      const count = w.repostCount ?? (w.reposts ?? []).length;
      return { data: args.p_post_ids.map((id) => ({ post_id: id, like_count: 0, repost_count: count })), error: null };
    },
  });
  (globalThis as unknown as { __rp: unknown }).__rp = { client, log, limits, allow: w.allow ?? true, serviceOn: w.serviceOn ?? true };
  return { log, limits };
}

const get = (id = POST) => GET(new Request(`http://vibe.test/api/posts/${id}/reposters`), { params: Promise.resolve({ id }) });
const body = async (res: Response) => (await res.json()) as Answer;
/** Silence the route's error logs, and keep them to check. */
function errors(t: TestContext): unknown[][] {
  const seen: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => void seen.push(args));
  return seen;
}
const reposts = (...ns: number[]) => ns.map((n, i) => ({ user_id: uid(n), created_at: at(i) }));
const noStore = (res: Response) => assert.equal(res.headers.get("cache-control"), "private, no-store");

// ── The tests ────────────────────────────────────────────────────────────────

test("signed out is a 401, before the limiter or any read", async () => {
  const { log } = setup({ user: null });
  const res = await get();
  assert.equal(res.status, 401);
  noStore(res);
  assert.deepEqual(log, ["getUser"]);
});

test("the repostersRead budget runs right after sign-in, before any read", async () => {
  const { log, limits } = setup({ allow: false, reposts: reposts(1) });
  const res = await get();
  assert.equal(res.status, 429);
  noStore(res);
  assert.deepEqual(log, ["getUser", `limit:budget-repostersRead:${ME}`]);
  assert.deepEqual(limits[0]?.opts, { limit: 600, windowSec: 86_400 });
});

test("a hidden club's post is a 404 for a non-member, and no repost is read", async () => {
  const { log } = setup({ post: { id: POST, user_id: AUTHOR, org_id: ORG }, hiddenClub: true, reposts: reposts(1), follows: [uid(1)] });
  const res = await get();
  assert.equal(res.status, 404);
  noStore(res);
  assert.equal((await body(res)).error, "Post not found");
  // The shared gate asked about the club, on the service role.
  assert.ok(log.includes("service:orgs"));
  assert.ok(!log.some((l) => l.endsWith("post_reposts")));
});

test("the author of a hidden club's post still gets its list, and so does a member", async () => {
  const { log } = setup({ post: { id: POST, user_id: ME, org_id: ORG }, hiddenClub: true, reposts: reposts(1), follows: [uid(1)] });
  const res = await get();
  assert.equal(res.status, 200);
  assert.deepEqual((await body(res)).followed.map((p) => p.name), ["Maya"]);
  assert.ok(!log.includes("service:orgs"));
  setup({ post: { id: POST, user_id: AUTHOR, org_id: ORG }, hiddenClub: true, members: [ME], reposts: reposts(1), follows: [uid(1)] });
  assert.deepEqual((await body(await get())).followed.map((p) => p.name), ["Maya"]);
});

test("someone else's draft, removed post or restricted author's post is a 404; my own draft isn't", async () => {
  for (const post of [{ status: "draft" }, { removed_at: "2026-10-18T00:00:00Z" }]) {
    setup({ post, reposts: reposts(1), follows: [uid(1)] });
    assert.equal((await get()).status, 404, JSON.stringify(post));
  }
  setup({ restricted: [AUTHOR], reposts: reposts(1), follows: [uid(1)] });
  assert.equal((await get()).status, 404, "a restricted author");
  setup({ post: { user_id: ME, status: "draft" }, reposts: reposts(1), follows: [uid(1)] });
  assert.equal((await get()).status, 200, "my own draft");
});

test("a missing post, a block with its author, or a non-uuid id is the same 404", async () => {
  setup({ post: null });
  assert.equal((await get()).status, 404);
  setup({ blocks: [{ blocker_id: AUTHOR, blocked_id: ME }], reposts: reposts(1), follows: [uid(1)] });
  assert.equal((await get()).status, 404);
  const { log } = setup({});
  assert.equal((await get("not-a-uuid")).status, 404);
  assert.ok(!log.some((l) => l.includes(":posts")));
});

test("names only followed reposters, newest first; the rest are counted, not named", async () => {
  const { log } = setup({ reposts: reposts(1, 2, 3, 4, 5), follows: [uid(1), uid(3)], followers: [uid(3)] });
  const res = await get();
  assert.equal(res.status, 200);
  noStore(res);
  const a = await body(res);
  assert.deepEqual(a.followed.map((p) => [p.name, p.handle, p.follows_you]), [["Priya", "priya", true], ["Maya", "maya", false]]);
  assert.equal(a.followed_total, 2);
  assert.equal(a.others_total, 3);
  assert.equal(a.viewer_reposted, false);
  assert.equal(a.total, 5);
  const text = JSON.stringify(a);
  for (const n of [2, 4, 5]) assert.ok(!text.includes(uid(n)) && !text.includes(NAMES[n - 1]!), `reposter ${n} is not named`);
  // Other people's repost rows come from the service client (T1), by post.
  assert.ok(log.includes("service:post_reposts"));
});

test("a suspended followed reposter is counted, not named", async () => {
  setup({ reposts: reposts(1, 2), follows: [uid(1), uid(2)], restricted: [uid(2)] });
  const a = await body(await get());
  assert.deepEqual(a.followed.map((p) => p.name), ["Maya"]);
  assert.equal(a.followed_total, 1);
  assert.equal(a.others_total, 1);
  assert.equal(a.total, 2);
  assert.ok(!JSON.stringify(a).includes("Jonah"));
});

test("names don't depend on how many people I follow; the follow check goes 100 ids at a time", async () => {
  // 1,500 follows: a read of the whole list would stop at 1,000 (max_rows)
  // and miss the reposter followed 1,200th.
  const many = Array.from({ length: 1500 }, (_, i) => uid(1000 + i));
  const extraUsers = [{ id: uid(2200), name: "Rae", handle: "rae", avatar_url: null }];
  const rows = [...reposts(1), ...Array.from({ length: 249 }, (_, i) => ({ user_id: uid(3000 + i), created_at: at(1) })), { user_id: uid(2200), created_at: at(2) }];
  const { log } = setup({ reposts: rows, follows: [...many, uid(1)], extraUsers });
  const a = await body(await get());
  assert.deepEqual(a.followed.map((p) => p.name).sort(), ["Maya", "Rae"]);
  assert.equal(a.others_total, 249);
  assert.equal(a.total, 251);
  assert.deepEqual(log.filter((l) => l.startsWith("cookie:connections:in:")).slice(0, 3), ["cookie:connections:in:100", "cookie:connections:in:100", "cookie:connections:in:51"]);
});

test("a post with more than 1,000 reposts names among its newest 1,000 and counts the rest", async () => {
  const rows = Array.from({ length: 1200 }, (_, i) => ({ user_id: uid(5000 + i), created_at: at(0) }));
  rows.push({ user_id: uid(1), created_at: at(1) });
  setup({ reposts: rows, follows: [uid(1)] });
  const a = await body(await get());
  // The fake returns rows in insertion order, so Maya (last) falls past the cut: counted, not named.
  assert.deepEqual(a.followed, []);
  assert.equal(a.others_total, 1201);
});

test("a blocked or muted reposter is left out, and still counted", async () => {
  setup({
    reposts: reposts(1, 2, 3),
    follows: [uid(1), uid(2), uid(3)],
    blocks: [{ blocker_id: uid(2), blocked_id: ME }],
    mutes: [{ muted_id: uid(3) }],
  });
  const a = await body(await get());
  assert.deepEqual(a.followed.map((p) => p.name), ["Maya"]);
  assert.equal(a.followed_total, 1);
  assert.equal(a.others_total, 2);
});

test("an expired mute names them again", async () => {
  setup({ reposts: reposts(1), follows: [uid(1)], mutes: [{ muted_id: uid(1), until: "2020-01-01T00:00:00Z" }] });
  assert.deepEqual((await body(await get())).followed.map((p) => p.name), ["Maya"]);
});

test("others_total never goes below 0, and my own repost is not in it", async () => {
  setup({ reposts: reposts(1, 2), follows: [uid(1), uid(2)], repostCount: 1 });
  assert.equal((await body(await get())).others_total, 0);
  setup({ reposts: [...reposts(1, 4), { user_id: ME, created_at: at(9) }], follows: [uid(1)] });
  const mine = await body(await get());
  assert.equal(mine.viewer_reposted, true);
  assert.equal(mine.others_total, 1);
  assert.ok(!mine.followed.some((p) => p.id === ME));
});

test("a read that decides who is named failing is a 500, never names", async (t) => {
  const seen = errors(t);
  for (const table of ["posts", "orgs", "blocks", "mutes", "connections", "post_reposts", "users", "rpc"] as const) {
    if (table === "orgs") {
      // A club check that fails is "not allowed" (fail closed): the 404.
      setup({ post: { org_id: ORG }, reposts: reposts(1), follows: [uid(1)], fail: { orgs: true } });
      const res = await get();
      assert.equal(res.status, 404, "orgs failing");
      assert.ok(!JSON.stringify(await body(res)).includes("Maya"));
      continue;
    }
    setup({ reposts: reposts(1), follows: [uid(1)], fail: { [table]: true } });
    const res = await get();
    assert.equal(res.status, 500, `${table} failing`);
    noStore(res);
    assert.ok(!JSON.stringify(await body(res)).includes("Maya"));
  }
  setup({ reposts: reposts(1), follows: [uid(1)], serviceOn: false });
  assert.equal((await get()).status, 500);
  assert.ok(seen.length > 0);
});
