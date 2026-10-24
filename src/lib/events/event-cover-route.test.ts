/**
 * `GET /api/events/[id]/cover` (Oct 23, 2026; club view wave 3, event
 * covers, batch B1), against fakes: the event is read on the VIEWER's
 * client (so event_visible decides), only a cover of the event's own club
 * is signed, a cover moderators took down is a 404, a failed log read signs
 * nothing, and the cache header follows who the answer is for.
 *
 * Run with:
 *   node --test src/lib/events/event-cover-route.test.ts
 *
 * Lives here, not next to the route: `node --test` reads its arguments as
 * globs, so a path with `[id]` in it never matches (event-route.test.ts).
 * checkRemovedPicture and the key check are the real files.
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
if (typeof registerHooks !== "function") throw new Error("event-cover-route.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../", import.meta.url);
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "server-only": stub(""),
  "@/lib/supabase/server": stub("export async function createSupabaseServerClient() { return globalThis.__cv.cookie; }"),
  "@/lib/supabase/service": stub(
    "export function createSupabaseServiceClient() { return globalThis.__cv.service; }\n" +
      "export function isSupabaseServiceConfigured() { return true; }",
  ),
  "@/lib/r2": stub(
    "export function isR2Configured() { return globalThis.__cv.r2 !== false; }\n" +
      "export async function signOrgAssetGetUrl(key, sec) { globalThis.__cv.signed.push([key, sec]); return 'https://r2.test/' + key + '?sig=1'; }",
  ),
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

const specifier = "../../app/api/events/[id]/cover/route.ts";
const { GET } = (await import(specifier)) as typeof import("../../app/api/events/[id]/cover/route");

const EVENT = "eeeeeeee-0000-4000-8000-000000000001";
const ORG = "dddddddd-0000-4000-8000-000000000001";
const ME = "11111111-0000-4000-8000-000000000001";
const COVER = `orgs/${ORG}/events/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`;
const ROW = { id: EVENT, org_id: ORG, visibility: "everyone", cover_key: COVER };

type Err = { code: string; message: string };
type World = {
  user?: boolean;
  /** What the viewer's own read answers (null: RLS hid it, or there is none). */
  row?: Record<string, unknown> | null;
  readError?: Err;
  hidden?: boolean;
  /** A hidden club (Oct 23, 2026 review): is the viewer its member, or a platform admin? */
  member?: boolean;
  admin?: boolean;
  removed?: string[];
  logError?: Err;
  r2?: boolean;
};

function setup(w: World) {
  const reads: string[] = [];
  const signed: [string, number][] = [];
  const chain = (label: string, table: string, answer: (calls: unknown[][]) => { data: unknown; error: unknown }) => {
    reads.push(`${label}:${table}`);
    const calls: unknown[][] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "contains"]) {
      b[m] = (...args: unknown[]) => {
        calls.push([m, ...args]);
        return b;
      };
    }
    b.maybeSingle = async () => answer(calls);
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(answer(calls)).then(ok, ko);
    return b;
  };
  const cookie = {
    auth: { getUser: async () => ({ data: { user: w.user === false ? null : { id: ME } }, error: null }) },
    from: (table: string) =>
      chain("cookie", table, () => {
        assert.equal(table, "events", "the viewer's client reads the event, nothing else");
        return { data: w.row === undefined ? ROW : w.row, error: w.readError ?? null };
      }),
  };
  const service = {
    from: (table: string) =>
      chain("service", table, (calls) => {
        if (table === "orgs") return { data: { hidden_at: w.hidden ? "2026-10-01T00:00:00Z" : null }, error: null };
        // viewerMaySeeHiddenOrg (asked only for a hidden club).
        if (table === "org_members") return { data: w.member ? { user_id: ME } : null, error: null };
        if (table === "users") return { data: { is_platform_admin: w.admin === true }, error: null };
        if (table === "moderation_actions") {
          const onEvents = calls.some((c) => c[0] === "eq" && c[1] === "target_type" && c[2] === "event");
          const rows = onEvents
            ? (w.removed ?? []).map((k, i) => ({ id: `r${i}`, action: "image_remove", meta: { org_id: ORG, slots: ["cover"], previous: { cover: k } } }))
            : [];
          return { data: w.logError ? null : rows, error: w.logError ?? null };
        }
        throw new Error(`unexpected service read of ${table}`);
      }),
  };
  (globalThis as unknown as { __cv: unknown }).__cv = { cookie, service, signed, r2: w.r2 };
  return { reads, signed };
}

const get = (id = EVENT) =>
  GET(new Request(`http://vibe.test/api/events/${id}/cover?v=x.jpg`), { params: Promise.resolve({ id }) });

function quiet(t: TestContext) {
  t.mock.method(console, "error", () => {});
}

test("a visible Everyone event's cover: 307 to an hour-long signed link, kept five minutes in the browser", async (t) => {
  quiet(t);
  const { reads, signed } = setup({});
  const res = await get();
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), `https://r2.test/${COVER}?sig=1`);
  assert.equal(res.headers.get("cache-control"), "private, max-age=300");
  assert.deepEqual(signed, [[COVER, 3600]]);
  assert.equal(reads[0], "cookie:events", "the viewer's own client first: RLS decides");
});

test("a Members only event, or any event of a hidden club: private, no-store", async (t) => {
  quiet(t);
  for (const w of [{ row: { ...ROW, visibility: "members" } }, { hidden: true, member: true }, { hidden: true, admin: true }] as World[]) {
    setup(w);
    const res = await get();
    assert.equal(res.status, 307, JSON.stringify(w));
    assert.equal(res.headers.get("cache-control"), "private, no-store", JSON.stringify(w));
  }
});

test("a hidden club's cover: a non-member event_visible let in (an RSVP from before) gets the same 404, nothing signed", async (t) => {
  quiet(t);
  const { reads, signed } = setup({ hidden: true });
  const res = await get();
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { ok: false, error: "Not found", code: "not_found" });
  assert.deepEqual(signed, []);
  assert.ok(reads.includes("service:org_members"), "membership is asked only because the club is hidden");
  const visible = setup({});
  assert.equal((await get()).status, 307);
  assert.ok(!visible.reads.includes("service:org_members"), "a visible club costs no membership read");
});

test("signed out, a bad id, an event the viewer can't see, no cover, an org-less event: the same 404, nothing signed", async (t) => {
  quiet(t);
  for (const [w, id] of [
    [{ user: false }, EVENT],
    [{}, "not-a-uuid"],
    [{ row: null }, EVENT],
    [{ row: { ...ROW, cover_key: null } }, EVENT],
    [{ row: { ...ROW, org_id: null } }, EVENT],
  ] as [World, string][]) {
    const { signed, reads } = setup(w);
    const res = await get(id);
    assert.equal(res.status, 404, JSON.stringify(w));
    assert.deepEqual(await res.json(), { ok: false, error: "Not found", code: "not_found" });
    assert.equal(res.headers.get("location"), null);
    assert.deepEqual(signed, []);
    assert.ok(!reads.some((r) => r.startsWith("service:")), "no service read for a 404 the viewer's read decided");
  }
});

test("a key that isn't a cover of the event's own club is never signed", async (t) => {
  quiet(t);
  for (const key of [
    `orgs/eeeeeeee-0000-4000-8000-000000000009/events/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`,
    `orgs/${ORG}/banner/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`,
    `orgs/${ORG}/events/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.mp4`,
    "https://evil.example/a.jpg",
  ]) {
    const { signed } = setup({ row: { ...ROW, cover_key: key } });
    assert.equal((await get()).status, 404, key);
    assert.deepEqual(signed, []);
  }
});

test("a cover moderators took down is a 404; a failed log read is a 500; neither signs anything", async (t) => {
  quiet(t);
  const removed = setup({ removed: [COVER] });
  assert.equal((await get()).status, 404);
  assert.deepEqual(removed.signed, []);
  const other = setup({ removed: [`orgs/${ORG}/events/9a8b7c6d-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg`] });
  assert.equal((await get()).status, 307, "another removed cover doesn't hide this one");
  assert.equal(other.signed.length, 1);
  const failed = setup({ logError: { code: "XX000", message: "boom" } });
  const res = await get();
  assert.equal(res.status, 500);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(failed.signed, []);
});

test("a failed event read is a 500 logged with its code only; storage not configured is a 503", async (t) => {
  const seen: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => seen.push(args));
  setup({ readError: { code: "XX000", message: `boom ${EVENT}` } });
  assert.equal((await get()).status, 500);
  assert.deepEqual(seen, [["[events/:id/cover read]", { code: "XX000" }]]);
  const off = setup({ r2: false });
  assert.equal((await get()).status, 503);
  assert.deepEqual(off.signed, []);
});
