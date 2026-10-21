/**
 * Tests for `clubs-in.ts` (Oct 21, 2026): the shape checks for the clubs I'm
 * a member of, and the two-minute cache in page memory (shared ask, signed
 * out empties it and is never cached, a failure keeps nothing). The hook
 * needs React to render and is left to the browser pass.
 *
 * Run with:
 *   node --test src/lib/orgs/clubs-in.test.ts
 *
 * WHY THE RESOLVE HOOK: Node's type stripping doesn't resolve the "@/…"
 * alias. The request wrapper is stubbed (it pulls in the native bridge): it
 * answers whatever `globalThis.__answer` holds, and nothing goes out.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") {
  throw new Error("clubs-in.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const STUBS: Record<string, string> = {
  "@/lib/feedback/request": stub(
    "export async function vibeRequest(url) { globalThis.__asked = (globalThis.__asked || 0) + 1; return globalThis.__answer; }",
  ),
};
const CLUB_SWITCH_URL = new URL("./club-switch.ts", import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (STUBS[specifier]) return { url: STUBS[specifier], format: "module", shortCircuit: true };
    if (specifier === "@/lib/orgs/club-switch") return nextResolve(CLUB_SWITCH_URL, context);
    return nextResolve(specifier, context);
  },
});

const specifier = "./clubs-in.ts";
const m = (await import(specifier)) as typeof import("./clubs-in");

const CLUB = { org_id: "o1", handle: "Chess-Club", name: " Chess Club ", logo_url: "/api/orgs/chess-club/asset/logo" };

test("a row is read with a lower-cased handle and a trimmed name", () => {
  assert.deepEqual(m.parseClubIn(CLUB), {
    org_id: "o1",
    handle: "chess-club",
    name: "Chess Club",
    logo_url: "/api/orgs/chess-club/asset/logo",
  });
});

test("junk rows are dropped: no id, a bad handle, no name, not an object", () => {
  assert.equal(m.parseClubIn({ ...CLUB, org_id: "" }), null);
  assert.equal(m.parseClubIn({ ...CLUB, handle: "../admin" }), null);
  assert.equal(m.parseClubIn({ ...CLUB, name: "   " }), null);
  assert.equal(m.parseClubIn(["o1"]), null);
  assert.equal(m.parseClubIn(null), null);
});

test("a logo that is neither same-site nor https draws the initial instead", () => {
  assert.equal(m.parseClubIn({ ...CLUB, logo_url: "javascript:alert(1)" })?.logo_url, null);
  assert.equal(m.parseClubIn({ ...CLUB, logo_url: "//evil.example/x.png" })?.logo_url, null);
  assert.equal(m.parseClubIn({ ...CLUB, logo_url: "https://cdn.example/x.png" })?.logo_url, "https://cdn.example/x.png");
});

test("the body: not that shape is null; the same club twice is kept once", () => {
  assert.equal(m.readClubsIn(null), null);
  assert.equal(m.readClubsIn({ ok: true }), null);
  assert.deepEqual(
    m.readClubsIn({ ok: true, clubs: [CLUB, { ...CLUB, org_id: "o2" }, { nope: 1 }] })?.map((c) => c.org_id),
    ["o1"],
  );
});

test("the cache lasts two minutes, then reads as empty", () => {
  m.clearClubsInCache();
  const t0 = 1_000_000;
  m.writeClubsInCache([m.parseClubIn(CLUB)!], t0);
  assert.equal(m.readClubsInCache(t0 + 1)?.length, 1);
  assert.equal(m.readClubsInCache(t0 + m.CLUBS_IN_CACHE_MS - 1)?.length, 1);
  assert.equal(m.readClubsInCache(t0 + m.CLUBS_IN_CACHE_MS), null);
  // A clock that went backwards never serves the old list.
  assert.equal(m.readClubsInCache(t0 - 1), null);
  m.clearClubsInCache();
  assert.equal(m.readClubsInCache(t0 + 1), null);
});

test("one ask fills the cache; the next read comes from it", async () => {
  m.clearClubsInCache();
  const g = globalThis as unknown as { __answer: unknown; __asked: number };
  g.__asked = 0;
  g.__answer = { ok: true, status: 200, data: { ok: true, clubs: [CLUB] } };
  const first = await m.loadClubsIn();
  assert.deepEqual(first.ok && first.clubs.map((c) => c.handle), ["chess-club"]);
  await m.loadClubsIn();
  assert.equal(g.__asked, 1);
});

test("two readers at once share one ask", async () => {
  m.clearClubsInCache();
  const g = globalThis as unknown as { __answer: unknown; __asked: number };
  g.__asked = 0;
  g.__answer = { ok: true, status: 200, data: { ok: true, clubs: [CLUB] } };
  await Promise.all([m.loadClubsIn(), m.loadClubsIn()]);
  assert.equal(g.__asked, 1);
});

test("signed out reads as no clubs and empties the cache", async () => {
  const g = globalThis as unknown as { __answer: unknown; __asked: number };
  m.writeClubsInCache([m.parseClubIn(CLUB)!]);
  m.clearClubsInCache();
  g.__answer = { ok: false, status: 401 };
  const out = await m.loadClubsIn();
  assert.deepEqual(out, { ok: true, clubs: [] });
  assert.equal(m.readClubsInCache(), null);
});

test("a failure is a failure, and nothing is cached", async () => {
  m.clearClubsInCache();
  const g = globalThis as unknown as { __answer: unknown };
  g.__answer = { ok: false, status: 500 };
  assert.deepEqual(await m.loadClubsIn(), { ok: false });
  g.__answer = { ok: true, status: 200, data: { ok: false } };
  assert.deepEqual(await m.loadClubsIn(), { ok: false });
  assert.equal(m.readClubsInCache(), null);
});
