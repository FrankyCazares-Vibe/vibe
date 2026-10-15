/**
 * Signed-out quick wins (rate limits and upload caps, Oct 15, B1.3), against
 * fakes of the cookie client and the service client. No database here.
 *
 *  1. `GET /api/users/[handle]/posts` signed out answers at most 24 posts,
 *     reads 25 to know, and says `more: true` only when the 25th exists.
 *     Signed in it is unchanged: 100 by default, 500 at most, no `more`.
 *     Either way `?limit=` reaches the database as a whole number.
 *  2. The public 307 answers of `/api/posts/[id]/media` and
 *     `/api/orgs/[slug]/asset/[kind]` carry `Cache-Control: private,
 *     max-age=300`; an answer that depended on who asked never does.
 *  3. `/api/orgs/[slug]/profile` is gone, and nothing in src/ or public/
 *     still calls it.
 *
 * Run with:
 *   node --test src/lib/security/signed-out-reads.test.ts
 *
 * WHY THE RESOLVE HOOK (the reads-routes.test.ts precedent): the routes
 * import "next/server", "server-only" modules (r2, moderation/access,
 * hidden-org-access) and the two Supabase clients; each resolves to a small
 * data: module that answers from `globalThis`. `post-media-url`,
 * `missing-column`, `org-asset-url` and `media-ownership` are the real code.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("signed-out-reads.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const REPO_ROOT = new URL("../../../", import.meta.url);
const dataModule = (code: string) => `data:text/javascript,${encodeURIComponent(code)}`;
const STUBS: Record<string, string> = {
  "server-only": dataModule(""),
  "next/server": dataModule(
    "export const NextResponse = {\n" +
      "  json(body, init) { return { status: (init && init.status) || 200, body, headers: new Headers() }; },\n" +
      "  redirect(url, status) { return { status, body: null, headers: new Headers({ location: String(url) }) }; },\n" +
      "};",
  ),
  "@/lib/supabase/server": dataModule("export async function createSupabaseServerClient() { return globalThis.__soCookie; }"),
  "@/lib/supabase/service": dataModule(
    "export function createSupabaseServiceClient() { if (!globalThis.__soService) throw new Error('no service'); return globalThis.__soService; }",
  ),
  "@/lib/moderation/access": dataModule(
    "export async function getActiveRestriction() { return globalThis.__soRestriction ?? { ok: true, restriction: null }; }",
  ),
  "@/lib/safety/pair-block": dataModule("export async function loadPairBlock() { return { ok: true, blocked: false }; }"),
  "@/lib/orgs/hidden-org-access": dataModule(
    "export async function orgContentAccess() { return globalThis.__soOrgAccess ?? { allowed: true, hidden: false }; }\n" +
      "export async function viewerMaySeeHiddenOrg() { return globalThis.__soHiddenAllowed === true; }",
  ),
  "@/lib/r2": dataModule(
    "export const CLIP_KEY_PREFIX = 'clips/';\nexport const ORG_ASSET_KEY_PREFIX = 'orgs/';\n" +
      "export async function signClipGetUrl(key) { return 'https://r2.example/' + key + '?sig=1'; }\n" +
      "export async function signOrgAssetGetUrl(key) { return 'https://r2.example/' + key + '?sig=1'; }",
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

// `isSupabaseHttpsUrl` (org-asset-url.ts) compares against this host.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";

type Answer = { status: number; body: Record<string, unknown> | null; headers: Headers };
type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Answer>;
// Specifiers in variables, so the type checker leaves the `.ts` paths alone.
const postsSpecifier = "../../app/api/users/[handle]/posts/route.ts";
const mediaSpecifier = "../../app/api/posts/[id]/media/route.ts";
const assetSpecifier = "../../app/api/orgs/[slug]/asset/[kind]/route.ts";
const postsRoute = (await import(postsSpecifier)) as { GET: Handler<{ handle: string }> };
const mediaRoute = (await import(mediaSpecifier)) as { GET: Handler<{ id: string }> };
const assetRoute = (await import(assetSpecifier)) as { GET: Handler<{ slug: string; kind: string }> };

// ── A fake PostgREST client ──────────────────────────────────────────────────

type Call = unknown[];
type Tables = Record<string, (calls: Call[]) => { data?: unknown; error?: unknown }>;

/** Each `from()` logs its calls; awaiting it (or `.maybeSingle()`) asks `tables[table]`. */
function fakeClient(tables: Tables, userId: string | null) {
  const reads: Array<{ table: string; calls: Call[] }> = [];
  const from = (table: string) => {
    const calls: Call[] = [];
    reads.push({ table, calls });
    const settle = () => {
      const a = tables[table]?.(calls) ?? {};
      return { data: a.data ?? null, error: a.error ?? null };
    };
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "order", "limit"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve(settle());
    builder.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(settle()).then(ok, bad);
    return builder;
  };
  const auth = { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null }) };
  return { from, auth, reads };
}

function install(cookie: ReturnType<typeof fakeClient>, service: ReturnType<typeof fakeClient> | null) {
  const g = globalThis as Record<string, unknown>;
  g.__soCookie = cookie;
  g.__soService = service ?? undefined;
  g.__soRestriction = undefined;
  g.__soOrgAccess = undefined;
  g.__soHiddenAllowed = undefined;
}

// ── 1. The signed-out posts cap ──────────────────────────────────────────────

const AUTHOR = "11111111-1111-4111-8111-111111111111";
const VIEWER = "22222222-2222-4222-8222-222222222222";

/** A grid of `total` posts; a read gets as many as its `.limit()` allows. */
function gridTables(total: number): Tables {
  return {
    users: () => ({ data: { id: AUTHOR } }),
    posts: (calls) => {
      const limit = calls.find((c) => c[0] === "limit")?.[1] as number;
      const n = Math.min(total, limit);
      return {
        data: Array.from({ length: n }, (_, i) => ({
          id: `post-${i}`, user_id: AUTHOR, type: "post", content: `post ${i}`,
          media_url: null, media_thumbnail_url: null, created_at: "2026-10-15T00:00:00Z", edited_at: null,
        })),
      };
    },
  };
}

async function readGrid(total: number, signedIn: boolean, query = "") {
  const tables = gridTables(total);
  const cookie = fakeClient(signedIn ? tables : {}, signedIn ? VIEWER : null);
  const service = fakeClient(signedIn ? {} : tables, null);
  install(cookie, service);
  const res = await postsRoute.GET(new Request(`https://vibe.test/api/users/ann/posts${query}`), {
    params: Promise.resolve({ handle: "ann" }),
  });
  const reader = signedIn ? cookie : service;
  const postsRead = reader.reads.find((r) => r.table === "posts");
  const limit = postsRead?.calls.find((c) => c[0] === "limit")?.[1];
  return { res, limit, posts: (res.body?.posts ?? []) as unknown[] };
}

test("signed out: 30 posts answer 24, read 25, and say more", async () => {
  const { res, limit, posts } = await readGrid(30, false, "?limit=100");
  assert.equal(res.status, 200);
  assert.equal(limit, 25);
  assert.equal(posts.length, 24);
  assert.equal(res.body?.more, true);
});

test("signed out: exactly 24 posts answer all 24 and no more", async () => {
  const { limit, posts, res } = await readGrid(24, false);
  assert.equal(limit, 25);
  assert.equal(posts.length, 24);
  assert.equal(res.body?.more, false);
});

test("signed out: a short grid (today's case, 11 posts) is untouched", async () => {
  const { posts, res } = await readGrid(11, false);
  assert.equal(posts.length, 11);
  assert.equal(res.body?.more, false);
});

test("signed out: ?limit=500 is still the cap; a smaller ask is kept and never says more", async () => {
  const big = await readGrid(600, false, "?limit=500");
  assert.equal(big.limit, 25);
  assert.equal(big.posts.length, 24);
  const small = await readGrid(30, false, "?limit=10");
  assert.equal(small.limit, 10);
  assert.equal(small.posts.length, 10);
  assert.equal(small.res.body?.more, false);
});

test("a fraction or junk in ?limit reaches .limit() as a whole number, never past either cap", async () => {
  // PostgREST ignores a limit that isn't a whole number and reads up to its
  // 1,000-row ceiling (`limit=23.5` did, Oct 15 repair), so the fake's
  // number alone proves nothing: it has to be an integer.
  const cases: Array<[query: string, signedIn: boolean, read: number]> = [
    ["?limit=23.5", false, 23],
    ["?limit=1.5", false, 1],
    ["?limit=0.5", false, 25],
    ["?limit=abc", false, 25],
    ["?limit=-3", false, 25],
    ["?limit=Infinity", false, 25],
    ["?limit=499.5", true, 499],
    ["?limit=1e9", true, 500],
  ];
  for (const [query, signedIn, read] of cases) {
    const { limit } = await readGrid(600, signedIn, query);
    assert.ok(Number.isInteger(limit), `${query}: .limit(${String(limit)})`);
    assert.equal(limit, read, query);
    if (!signedIn) assert.ok((limit as number) <= 25, `${query}: signed out never reads more than 25`);
  }
});

test("signed in: unchanged, 100 by default and 500 at most, with no `more`", async () => {
  const dflt = await readGrid(150, true);
  assert.equal(dflt.limit, 100);
  assert.equal(dflt.posts.length, 100);
  assert.equal("more" in (dflt.res.body ?? {}), false);
  const max = await readGrid(600, true, "?limit=9999");
  assert.equal(max.limit, 500);
  assert.equal(max.posts.length, 500);
  assert.equal("more" in (max.res.body ?? {}), false);
});

// ── 2. Cache-Control on the public 307 answers only ──────────────────────────

const PUBLIC_CACHE = "private, max-age=300";
const CLUB = "33333333-3333-4333-8333-333333333333";
const POST = "44444444-4444-4444-8444-444444444444";

/** `extra` lands on `globalThis` after `install`, e.g. a restriction or a hidden club. */
async function media(row: Record<string, unknown> | null, viewer: string | null, variant = "", extra: Record<string, unknown> = {}) {
  install(fakeClient({}, viewer), fakeClient({ posts: () => ({ data: row }), users: () => ({ data: null }) }, null));
  Object.assign(globalThis, extra);
  return mediaRoute.GET(new Request(`https://vibe.test/api/posts/${POST}/media${variant}`), {
    params: Promise.resolve({ id: POST }),
  });
}

const livePost = {
  id: POST, user_id: AUTHOR, status: "published", org_id: null, removed_at: null,
  media_url: `clips/${AUTHOR}/a.mp4`, media_thumbnail_url: `clips/${AUTHOR}/a.jpg`,
};

test("media: a public post's 307 is kept five minutes, in the browser only", async () => {
  const res = await media(livePost, null);
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("Cache-Control"), PUBLIC_CACHE);
  const thumb = await media(livePost, null, "?variant=thumbnail");
  assert.equal(thumb.headers.get("Cache-Control"), PUBLIC_CACHE);
  const clubPost = { ...livePost, org_id: CLUB, media_url: `orgs/${CLUB}/posts/b.jpg` };
  assert.equal((await media(clubPost, null)).headers.get("Cache-Control"), PUBLIC_CACHE);
  const stored = { ...livePost, media_url: "https://proj.supabase.co/storage/v1/object/public/profiles/x.jpg" };
  assert.equal((await media(stored, null)).headers.get("Cache-Control"), PUBLIC_CACHE);
});

test("media: an answer that depended on who asked is never kept", async () => {
  const draft = await media({ ...livePost, status: "draft" }, AUTHOR);
  assert.equal(draft.status, 307);
  assert.equal(draft.headers.get("Cache-Control"), "private, no-store");
  const removed = await media({ ...livePost, removed_at: "2026-10-15T00:00:00Z" }, AUTHOR);
  assert.equal(removed.headers.get("Cache-Control"), "private, no-store");
  const suspended = { __soRestriction: { ok: true, restriction: { kind: "suspension" } } };
  const own = await media(livePost, AUTHOR, "", suspended);
  assert.equal(own.status, 307, "the author still sees their own");
  assert.equal(own.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await media(livePost, null, "", suspended)).status, 404, "a stranger gets nothing");
  const clubPost = { ...livePost, org_id: CLUB, media_url: `orgs/${CLUB}/posts/b.jpg` };
  const hidden = await media(clubPost, VIEWER, "", { __soOrgAccess: { allowed: true, hidden: true } });
  assert.equal(hidden.status, 307);
  assert.equal(hidden.headers.get("Cache-Control"), "private, no-store");
});

test("media: a 404 carries no cache header", async () => {
  const missing = await media(null, null);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("Cache-Control"), null);
  const draft = await media({ ...livePost, status: "draft" }, null);
  assert.equal(draft.status, 404);
  assert.equal(draft.headers.get("Cache-Control"), null);
});

async function asset(org: Record<string, unknown> | null, kind = "logo") {
  install(fakeClient({}, null), fakeClient({ orgs: () => ({ data: org }) }, null));
  return assetRoute.GET(new Request(`https://vibe.test/api/orgs/sae/asset/${kind}`), {
    params: Promise.resolve({ slug: "sae", kind }),
  });
}

const visibleClub = { id: CLUB, hidden_at: null, logo_url: `orgs/${CLUB}/logo.png`, banner_url: `orgs/${CLUB}/banner.jpg` };

test("asset: a visible club's logo and banner are kept five minutes, in the browser only", async () => {
  for (const kind of ["logo", "banner"]) {
    const res = await asset(visibleClub, kind);
    assert.equal(res.status, 307);
    assert.equal(res.headers.get("Cache-Control"), PUBLIC_CACHE);
  }
  const stored = { ...visibleClub, logo_url: "https://proj.supabase.co/storage/v1/object/public/profiles/l.png" };
  assert.equal((await asset(stored)).headers.get("Cache-Control"), PUBLIC_CACHE);
});

test("asset: a hidden club's answer never gets the header, and a 404 has none", async () => {
  const hiddenClub = { ...visibleClub, hidden_at: "2026-10-01T00:00:00Z" };
  install(fakeClient({}, CLUB), fakeClient({ orgs: () => ({ data: hiddenClub }) }, null));
  (globalThis as Record<string, unknown>).__soHiddenAllowed = true;
  const member = await assetRoute.GET(new Request("https://vibe.test/api/orgs/sae/asset/logo"), {
    params: Promise.resolve({ slug: "sae", kind: "logo" }),
  });
  assert.equal(member.status, 307);
  assert.equal(member.headers.get("Cache-Control"), null);
  const stranger = await asset(hiddenClub);
  assert.equal(stranger.status, 404);
  assert.equal(stranger.headers.get("Cache-Control"), null);
  const missing = await asset(null);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("Cache-Control"), null);
});

const urlSpecifier = "../org-asset-url.ts";
const { orgAssetProxyUrl } = (await import(urlSpecifier)) as typeof import("../org-asset-url");

test("asset: a replaced logo or banner is a new URL, so the kept redirect never shows the old one", async () => {
  const before = orgAssetProxyUrl("sae", `orgs/${CLUB}/logo/aaaa.png`, "logo");
  const after = orgAssetProxyUrl("sae", `orgs/${CLUB}/logo/bbbb.png`, "logo");
  assert.equal(before, "/api/orgs/sae/asset/logo?v=aaaa.png");
  assert.notEqual(before, after);
  assert.equal(orgAssetProxyUrl("sae", `orgs/${CLUB}/banner/cccc.jpg`, "banner"), "/api/orgs/sae/asset/banner?v=cccc.jpg");
  // The route reads what is stored now, whatever the version says.
  install(fakeClient({}, null), fakeClient({ orgs: () => ({ data: visibleClub }) }, null));
  const res = await assetRoute.GET(new Request(`https://vibe.test${before}`), {
    params: Promise.resolve({ slug: "sae", kind: "logo" }),
  });
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), `https://r2.example/${visibleClub.logo_url}?sig=1`);
});

// ── 3. The unused club profile route is gone ─────────────────────────────────

const SCANNED = /\.(?:ts|tsx|js|mjs|cjs|html)$/;
const THIS_FILE = "src/lib/security/signed-out-reads.test.ts";

/** Every file under `dir` (repo-relative) the scan reads, skipping this test. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(new URL(dir, REPO_ROOT))) {
    const rel = `${dir}/${name}`;
    if (statSync(new URL(rel, REPO_ROOT)).isDirectory()) walk(rel, out);
    else if (SCANNED.test(name) && rel !== THIS_FILE) out.push(rel);
  }
  return out;
}

test("/api/orgs/[slug]/profile is deleted", () => {
  assert.equal(existsSync(new URL("src/app/api/orgs/[slug]/profile/route.ts", REPO_ROOT)), false);
  assert.equal(existsSync(new URL("src/app/api/orgs/[slug]/profile", REPO_ROOT)), false, "no folder left behind");
});

test("nothing in src/ or public/ calls the deleted route", () => {
  // A real call names a club (`${slug}`, a literal handle, or a string joined
  // with `+`); a comment about the route names it as `[slug]`, which is fine.
  const calls = [
    /api\/orgs\/(?!\[slug\])[^\s"'`/]+\/profile\b/,
    /api\/orgs\/["'`]\s*\+[^\n;]*["'`]\/profile\b/,
  ];
  const hits: string[] = [];
  for (const file of [...walk("src"), ...walk("public")]) {
    const text = readFileSync(new URL(file, REPO_ROOT), "utf8");
    for (const re of calls) if (re.test(text)) hits.push(`${file} ${re}`);
  }
  assert.deepEqual(hits, []);
});
