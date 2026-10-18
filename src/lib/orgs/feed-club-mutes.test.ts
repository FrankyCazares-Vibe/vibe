/**
 * Behaviour tests for the feed's club mutes (club model gap 2, batch 1E;
 * added by the wave-1 repair, review finding 13), run for real on
 * GET /api/feed with stand-ins of the two Supabase clients:
 *   - a muted club adds a SECOND `or=` to the posts query, null-safe
 *     (`org_id.is.null,org_id.not.in.(…),user_id.eq.<me>`), beside the lane;
 *   - a muted club's post that reaches the route anyway is dropped on its
 *     raw `org_id` (the TypeScript backup), the viewer's own post stays;
 *   - a muted club leaves the followed-club set first: no off-campus reach
 *     through the lane, no card read for it as a follow;
 *   - nothing muted: one `or=`, nothing dropped.
 *
 * Run with:
 *   node --test src/lib/orgs/feed-club-mutes.test.ts
 *
 * It lives here, not next to the route, like club-model-routes.test.ts. The
 * server-only helpers resolve to small data: modules; the pure ones (org
 * mutes, following, community scope, campuses) are the real files.
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: { resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown }) => void;
};
if (typeof registerHooks !== "function") throw new Error("feed-club-mutes.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const W = "globalThis.__feed";
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/supabase/server": stub(`export async function createSupabaseServerClient() { return ${W}.cookie; }`),
  "@/lib/supabase/service": stub(
    `export function createSupabaseServiceClient() { return ${W}.service; }\nexport function isSupabaseServiceConfigured() { return true; }`,
  ),
  "@/lib/moderation/access": stub("export async function requireNotRestricted() { return null; }"),
  "@/lib/posts/honest-views": stub("export async function loadHonestViewRows() { return null; }\nexport function tallyViews() { return new Map(); }"),
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

// ── A fake PostgREST client: any chain is recorded and answered whole ───────

type Call = [string, ...unknown[]];
type Query = { client: "cookie" | "service"; table: string; calls: Call[] };
type Answer = { data?: unknown; error?: unknown };
type World = { queries: Query[]; cookie: unknown; service: unknown };

function fakeClient(kind: Query["client"], world: World, answer: (q: Query) => Answer) {
  const settle = (q: Query, single: boolean) => {
    const a = answer(q);
    const data = single && Array.isArray(a.data) ? (a.data[0] ?? null) : (a.data ?? null);
    return { data, error: a.error ?? null, count: null };
  };
  const chain = (q: Query): unknown =>
    new Proxy({}, {
      get(_t, name) {
        if (name === "then") return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(() => settle(q, false)).then(ok, bad);
        if (name === "maybeSingle" || name === "single") return () => Promise.resolve().then(() => settle(q, true));
        return (...args: unknown[]) => (q.calls.push([String(name), ...args]), chain(q));
      },
    });
  const open = (table: string, first?: Call) => {
    const q: Query = { client: kind, table, calls: first ? [first] : [] };
    world.queries.push(q);
    return chain(q);
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: ME } }, error: null }) },
    from: (table: string) => open(table),
    rpc: (fn: string, args: unknown) => open(`rpc:${fn}`, ["rpc", args]),
  };
}

const uuid = (n: number, tail: string) => `${tail.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ME = uuid(1, "a");
const OTHER = uuid(2, "a");
const MUTED = uuid(1, "d"); // a club the viewer follows and muted
const KEPT = uuid(2, "d"); // a club the viewer follows
const FAR = { campus_id: "bloomington", school_system: "iu" }; // off the viewer's campus
const HOME = { campus_id: "indianapolis", school_system: "iu" };
const post = (n: number, user_id: string, org_id: string | null, where = HOME) => ({
  id: uuid(n, "b"), user_id, org_id, type: "post", content: `p${n}`, tags: [], media_url: null, media_thumbnail_url: null,
  view_count: 0, created_at: `2026-10-16T12:0${n}:00+00:00`, edited_at: null, removed_at: null, removed_reason: null, ...where,
  author: { id: user_id, name: "N", handle: "h", school: "IU Indianapolis", ...HOME, major: null, year: null, avatar_url: null },
});
const PERSONAL = post(1, OTHER, null);
const MUTED_POST = post(2, OTHER, MUTED);
const MY_MUTED_POST = post(3, ME, MUTED);
const KEPT_FAR_POST = post(4, OTHER, KEPT, FAR);

function install(mutes: string[]): World {
  const world = { queries: [] } as unknown as World;
  const answer = (q: Query): Answer => {
    switch (q.table) {
      case "users": return { data: [{ school: "IU Indianapolis", ...HOME }] };
      case "org_followers": return { data: [{ org_id: MUTED }, { org_id: KEPT }] };
      case "org_post_mutes": return { data: mutes.map((org_id) => ({ org_id })) };
      case "orgs": {
        const ids = (q.calls.find((c) => c[0] === "in" && c[1] === "id")?.[2] ?? []) as string[];
        return { data: ids.map((id) => ({ id, handle: `c${id.slice(-1)}`, name: "Club", logo_url: null, verified: true, is_public: true })) };
      }
      // Answered whole, as a database that let every row past the filters would.
      case "posts": return { data: [PERSONAL, MUTED_POST, MY_MUTED_POST, KEPT_FAR_POST] };
      default: return { data: [] };
    }
  };
  world.cookie = fakeClient("cookie", world, answer);
  world.service = fakeClient("service", world, answer);
  (globalThis as unknown as { __feed: World }).__feed = world;
  return world;
}

// Through variables, so tsc never sees a `.ts` import (TS5097).
const FEED_ROUTE: string = "../../app/api/feed/route.ts";
const ORG_MUTES: string = "./org-mutes.ts";
const feedRoute = (await import(FEED_ROUTE)) as typeof import("../../app/api/feed/route");
const { mutedOrgOrFilter } = (await import(ORG_MUTES)) as typeof import("./org-mutes");

async function read(world: World) {
  const res = await feedRoute.GET(new Request("https://vibe.test/api/feed?sort=recent"));
  const body = (await res.json()) as { ok: boolean; feed: { post: { id: string } }[] };
  const posts = world.queries.find((q) => q.table === "posts")!;
  const ors = posts.calls.filter((c) => c[0] === "or").map((c) => String(c[1]));
  return { status: res.status, ids: body.feed.map((e) => e.post.id), ors };
}

test("a muted club: a second, null-safe or= beside the lane, and its posts dropped on the raw org_id", async () => {
  const world = install([MUTED]);
  const { status, ids, ors } = await read(world);
  assert.equal(status, 200);
  assert.equal(ors.length, 2, "the lane, then the mutes: PostgREST ANDs the two");
  assert.equal(ors[1], `org_id.is.null,org_id.not.in.(${MUTED}),user_id.eq.${ME}`);
  assert.equal(ors[1], mutedOrgOrFilter([MUTED], ME));
  assert.ok(!ids.includes(MUTED_POST.id), "someone else's post as the muted club never shows");
  assert.ok(ids.includes(MY_MUTED_POST.id), "the viewer's own post as that club stays");
  assert.ok(ids.includes(PERSONAL.id), "a personal post (org_id null) is never caught by the mute");
});

test("a muted club leaves the followed set first: no reach through the lane, no follow card read", async () => {
  const world = install([MUTED]);
  const { ors, ids } = await read(world);
  assert.equal(ors[0].includes(MUTED), false, "the lane carries no muted club");
  assert.ok(ors[0].includes(KEPT), "a followed club that is not muted keeps its reach");
  const followCards = world.queries.find((q) => q.client === "service" && q.table === "orgs")!;
  assert.deepEqual(followCards.calls.find((c) => c[0] === "in")?.[2], [KEPT]);
  assert.ok(ids.includes(KEPT_FAR_POST.id), "the kept club's post from another campus rides in on the follow");
});

test("nothing muted: one or= (the lane), and every post the lane lets in shows", async () => {
  const world = install([]);
  const { status, ids, ors } = await read(world);
  assert.equal(status, 200);
  assert.equal(ors.length, 1);
  assert.ok(ors[0].includes(MUTED) && ors[0].includes(KEPT));
  for (const p of [PERSONAL, MUTED_POST, MY_MUTED_POST, KEPT_FAR_POST]) assert.ok(ids.includes(p.id), p.content);
});
