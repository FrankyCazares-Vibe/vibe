/**
 * GET /api/posts/[id]: `viewer.reposted` (Oct 19, 2026, critique M1, batch
 * B1). The open post's Repost is an on/off toggle now, so the post read says
 * whether the caller has reposted it, counted from the caller's OWN repost
 * row on the cookie client, the way `viewer.liked` is.
 *
 * And (Oct 19, 2026, review r2): a count or flag the route couldn't read is
 * LEFT OUT, never sent as 0 / false, because the open post writes this answer
 * into the record the feed card shares.
 *
 * Run with:
 *   node --test src/lib/posts/post-read-route.test.ts
 *
 * WHY THE RESOLVE HOOK (as reposters-route.test.ts): the route imports
 * "next/server", both Supabase clients, moderation, mentions and push; each
 * resolves to a small data: module. The pieces the GET answer is built from
 * (engagement-counts, pair-block, post-media-url, viewer-can-delete, edit,
 * missing-column) are the real code. It lives here, not next to the route:
 * `node --test` reads its arguments as globs, and `[id]` never matches.
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
if (typeof registerHooks !== "function") throw new Error("post-read-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const dataModule = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export class NextResponse extends Response {\n" +
      "  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }); }\n" +
      "}",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__pr.client('cookie'); }"),
  "@/lib/supabase/service": dataModule(
    "export function createSupabaseServiceClient() { return globalThis.__pr.client('service'); }\n" +
      "export function isSupabaseServiceConfigured() { return true; }",
  ),
  "@/lib/moderation/access": dataModule(
    "export function contentBlockedResponse() { throw new Error('not in GET'); }\n" +
      "export async function requireCanPublish() { return null; }\n" +
      "export async function requireNotRestricted() { return null; }",
  ),
  "@/lib/moderation/text-filter": dataModule("export function checkText() { return { ok: true }; }"),
  "@/lib/mentions": dataModule(
    "export function extractMentionHandles() { return []; }\n" +
      "export async function insertMentionNotifications() {}\n" +
      "export async function resolveMentionedUserIds() { return []; }",
  ),
  "@/lib/orgs/following": dataModule("export async function loadOrgRole() { return { ok: true, role: null }; }"),
  "@/lib/orgs/hidden-org-access": dataModule("export async function orgContentAccessAsService() { return { allowed: true, hidden: false }; }"),
  "@/lib/posts/delete-media-store": dataModule("export async function purgeDeletedPostMedia() {}"),
  "@/lib/posts/honest-views": dataModule("export async function loadHonestViewRows() { return []; }"),
  "@/lib/posts/post-tag-filter": dataModule("export function firstBlockedPostTag() { return null; }"),
  "@/lib/push/dispatch": dataModule("export function kickPushDrain() {}"),
  "@/lib/rate-limit": dataModule(
    "export async function rateLimit() { return { allowed: true, retryAfterSec: 0, reason: null }; }\n" +
      "export function tooManyRequests() { return new Response('{}', { status: 429 }); }",
  ),
};
/** The only "@/" modules that load for real. */
const REAL = new Set([
  "@/lib/db/missing-column",
  "@/lib/post-media-url",
  "@/lib/posts/edit",
  "@/lib/posts/engagement-counts",
  "@/lib/posts/viewer-can-delete",
  "@/lib/safety/pair-block",
]);
registerHooks({
  resolve(specifier, context, nextResolve) {
    const stub = STUBS[specifier];
    if (stub) return { url: stub, format: "module", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      if (!REAL.has(specifier)) throw new Error(`post-read-route.test.ts: add a stand-in for ${specifier}`);
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const routeSpecifier = "../../app/api/posts/[id]/route.ts";
const { GET } = (await import(routeSpecifier)) as typeof import("../../app/api/posts/[id]/route");

const POST = "bbbbbbbb-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const AUTHOR = "22222222-0000-4000-8000-000000000001";
const OTHER = "33333333-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;

/**
 * A fake of both clients over one post. RLS is played for the two own-row
 * tables (post_likes and post_reposts serve each account its own rows on the
 * cookie client, T1), so a route that counted every repost row would answer
 * true for a post someone ELSE reposted.
 */
function setup(w: {
  user?: { id: string } | null;
  reposts?: string[];
  likes?: string[];
  repostCount?: number;
  /** Reads that answer with an error: "rpc", or a table's cookie-client head count. */
  fail?: string[];
}) {
  const log: string[] = [];
  const tables: Record<string, Row[]> = {
    posts: [
      {
        id: POST,
        user_id: AUTHOR,
        org_id: null,
        type: "post",
        content: "hello #gameday",
        tags: ["gameday"],
        media_url: null,
        media_thumbnail_url: null,
        view_count: 0,
        created_at: "2026-10-19T12:00:00Z",
        edited_at: null,
        removed_at: null,
        removed_reason: null,
        author: { id: AUTHOR, name: "Ava", handle: "ava" },
      },
    ],
    post_reposts: (w.reposts ?? []).map((user_id) => ({ post_id: POST, user_id })),
    post_likes: (w.likes ?? []).map((user_id) => ({ post_id: POST, user_id })),
    post_comments: [],
    bookmarks: [],
    blocks: [],
  };
  const chain = (who: "cookie" | "service", table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let head = false;
    const b: Record<string, unknown> = {};
    b.select = (_cols: string, opts?: { head?: boolean }) => ((head = opts?.head === true), b);
    b.eq = (col: string, v: unknown) => (filters.push((r) => r[col] === v), b);
    b.neq = (col: string, v: unknown) => (filters.push((r) => r[col] !== v), b);
    b.is = () => b;
    b.or = () => b;
    const run = () => {
      log.push(`${who}:${table}`);
      if (who === "cookie" && head && (w.fail ?? []).includes(table)) return { data: null, error: { message: "boom" }, count: null };
      let rows = tables[table] ?? [];
      if (who === "cookie" && (table === "post_reposts" || table === "post_likes")) rows = rows.filter((r) => r.user_id === ME);
      rows = rows.filter((r) => filters.every((f) => f(r)));
      return head ? { data: null, error: null, count: rows.length } : { data: rows, error: null, count: null };
    };
    b.maybeSingle = async () => {
      const r = run();
      return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
    };
    b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, bad);
    return b;
  };
  const client = (who: "cookie" | "service") => ({
    auth: { getUser: async () => ({ data: { user: w.user === undefined ? { id: ME } : w.user }, error: null }) },
    from: (table: string) => chain(who, table),
    rpc: async (_name: string, args: { p_post_ids: string[] }) =>
      (w.fail ?? []).includes("rpc")
        ? { data: null, error: { message: "boom" } }
        : {
            data: args.p_post_ids.map((id) => ({ post_id: id, like_count: (w.likes ?? []).length, repost_count: w.repostCount ?? (w.reposts ?? []).length })),
            error: null,
          },
  });
  (globalThis as unknown as { __pr: unknown }).__pr = { client };
  return { log };
}

type Answer = {
  ok: boolean;
  counts?: { reposts?: number; likes?: number; comments?: number; views?: number };
  viewer?: { liked?: boolean; saved?: boolean; reposted?: boolean };
};
const get = async () => {
  const res = await GET(new Request(`http://vibe.test/api/posts/${POST}`), { params: Promise.resolve({ id: POST }) });
  return { status: res.status, body: (await res.json()) as Answer };
};

test("viewer.reposted is true when the caller reposted the post", async () => {
  const { log } = setup({ reposts: [ME, OTHER] });
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.equal(body.viewer?.reposted, true);
  assert.equal(body.counts?.reposts, 2);
  // Read on the caller's own client, never the service role.
  assert.ok(log.includes("cookie:post_reposts"));
  assert.ok(!log.includes("service:post_reposts"));
});

test("viewer.reposted is false when only other people reposted it", async () => {
  setup({ reposts: [OTHER], likes: [OTHER] });
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.equal(body.viewer?.reposted, false);
  assert.equal(body.viewer?.liked, false);
  assert.equal(body.counts?.reposts, 1);
});

test("viewer.reposted is false on a post nobody reposted, and the other viewer keys are unchanged", async () => {
  setup({ likes: [ME] });
  const { body } = await get();
  assert.deepEqual(body.viewer, { liked: true, saved: false, reposted: false });
});

test("signed out is still a 401", async () => {
  setup({ user: null });
  assert.equal((await get()).status, 401);
});

test("a failed count RPC leaves likes and reposts out, never 0 (review r2)", async () => {
  setup({ reposts: [ME, OTHER], likes: [ME], fail: ["rpc"] });
  const { status, body } = await get();
  assert.equal(status, 200, "the post still opens");
  assert.ok(body.counts, "the counts object is still there");
  assert.equal("likes" in body.counts, false);
  assert.equal("reposts" in body.counts, false);
  assert.equal(body.counts.comments, 0, "the comment count was read, so it's sent");
  assert.deepEqual(body.viewer, { liked: true, saved: false, reposted: true });
});

test("a failed comment count or own-row read leaves just that key out", async () => {
  setup({ reposts: [ME], likes: [ME], fail: ["post_comments", "post_likes", "bookmarks"] });
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.equal(body.counts && "comments" in body.counts, false);
  assert.equal(body.counts?.likes, 1);
  assert.equal(body.counts?.reposts, 1);
  assert.deepEqual(body.viewer, { reposted: true });
});
