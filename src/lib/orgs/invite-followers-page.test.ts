/**
 * Tests for `invite-followers-page.ts` — one page of the invite sheet's
 * followers list and its cursor (wave plan
 * `handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md` §7 F3; critic
 * `wave-plan-sections/critic-W2.md` H-1 and M-2). This is the pure stand-in
 * for the branch acceptance "45 followers with shared `first_followed_at` page
 * through without duplicates or gaps", which needs a seeded database that
 * doesn't exist yet.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/orgs/invite-followers-page.test.ts
 *
 * WHY THE RESOLVE HOOK: the module imports through the "@/…" path alias and
 * extensionless specifiers, which Next's bundler and tsc resolve but Node's
 * type stripping doesn't. Same hook as `following.test.ts`. The module loads
 * through dynamic `import()` so the hook is registered first.
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
  throw new Error("invite-followers-page.test.ts needs Node >= 22.15 (module.registerHooks)");
}
const SRC_ROOT = new URL("../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});

const pageSpecifier = "./invite-followers-page.ts";
const followingSpecifier = "./following.ts";
const {
  FOLLOWERS_PAGE_FETCHED,
  FOLLOWERS_PAGE_MAX,
  FOLLOWERS_PAGE_MAX_READS,
  collectFollowersPage,
  followersPage,
} = (await import(
  pageSpecifier
)) as typeof import("./invite-followers-page");
const { decodeFollowCursor } = (await import(followingSpecifier)) as typeof import("./following");

// ── Fixtures ────────────────────────────────────────────────────────────────

type Row = { id: string; user_id: string; first_followed_at: string };

/** A deterministic v4-shaped uuid whose sort order is NOT its creation order. */
function uuidFor(n: number): string {
  const scrambled = ((n + 1) * 2654435761) % 0xffffffffffff;
  return `00000000-0000-4000-8000-${scrambled.toString(16).padStart(12, "0")}`;
}

/**
 * `count` follow rows sharing `distinctTimes` timestamps. The timestamps keep
 * PostgREST's raw microsecond shape, all the same length, so string order is
 * time order.
 */
function seedRows(count: number, distinctTimes: number): Row[] {
  const rows: Row[] = [];
  for (let n = 0; n < count; n++) {
    const bucket = n % Math.max(1, distinctTimes);
    const micros = String(100000 + bucket * 111).padStart(6, "0");
    rows.push({
      id: uuidFor(n),
      user_id: uuidFor(n + 100000),
      first_followed_at: `2026-09-16T12:00:00.${micros}+00:00`,
    });
  }
  return rows;
}

/** `ORDER BY first_followed_at DESC, id DESC`, as the route asks Postgres. */
function dbOrder(rows: readonly Row[]): Row[] {
  return [...rows].sort((a, b) => {
    if (a.first_followed_at !== b.first_followed_at) {
      return a.first_followed_at < b.first_followed_at ? 1 : -1;
    }
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

/**
 * What the route's follow read returns for a cursor: the keyset filter
 * `first_followed_at < t OR (first_followed_at = t AND id < i)`, the order,
 * and the limit. The cursor goes through `decodeFollowCursor`, like the route.
 */
function simulateRead(rows: readonly Row[], cursorRaw: string | null, limit: number): Row[] {
  const decoded = decodeFollowCursor(cursorRaw);
  assert.ok(decoded.ok, `cursor ${cursorRaw} must decode`);
  const c = decoded.cursor;
  return dbOrder(rows)
    .filter(
      (r) =>
        !c || r.first_followed_at < c.t || (r.first_followed_at === c.t && r.id < c.i),
    )
    .slice(0, limit);
}

/** Every page from the first to a null cursor, with a runaway guard. */
function walk(
  rows: readonly Row[],
  keep: (row: Row) => boolean,
): { pages: Row[][]; cursors: string[] } {
  const pages: Row[][] = [];
  const cursors: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 200; guard++) {
    const raw = simulateRead(rows, cursor, FOLLOWERS_PAGE_FETCHED);
    const { emitted, nextCursor } = followersPage(raw, keep);
    assert.ok(emitted.length <= FOLLOWERS_PAGE_MAX, "a page never exceeds the max");
    pages.push(emitted);
    if (nextCursor === null) return { pages, cursors };
    assert.ok(!cursors.includes(nextCursor), "the cursor always moves forward");
    cursors.push(nextCursor);
    cursor = nextCursor;
  }
  assert.fail("the walk never reached a null cursor");
}

/** The decoded `{t, i}` of a cursor, for asserting which row it points at. */
function cursorRow(cursor: string | null): { t: string; i: string } | null {
  const decoded = decodeFollowCursor(cursor);
  assert.ok(decoded.ok);
  return decoded.cursor;
}

const at = (row: Row) => ({ t: row.first_followed_at, i: row.id });
const all = () => true;

// ── Defaults ────────────────────────────────────────────────────────────────

test("defaults match the route: 20 out of a 30-row read", () => {
  assert.equal(FOLLOWERS_PAGE_MAX, 20);
  assert.equal(FOLLOWERS_PAGE_FETCHED, 30);
});

test("an empty read is an empty page with no cursor", () => {
  const { emitted, nextCursor } = followersPage([] as Row[], all);
  assert.deepEqual(emitted, []);
  assert.equal(nextCursor, null);
});

// ── The cursor rule (critic M-2) ────────────────────────────────────────────

test("a full page points at the row that produced the 20th result, not the last row read", () => {
  const raw = dbOrder(seedRows(30, 30));
  const { emitted, nextCursor } = followersPage(raw, all);
  assert.equal(emitted.length, 20);
  assert.deepEqual(emitted, raw.slice(0, 20));
  assert.deepEqual(cursorRow(nextCursor), at(raw[19]));
});

test("a full page with filtered rows before it points at the 20th survivor's row", () => {
  const raw = dbOrder(seedRows(30, 4));
  const dropped = new Set([raw[2].id, raw[5].id, raw[11].id]);
  const { emitted, nextCursor } = followersPage(raw, (r) => !dropped.has(r.id));
  assert.equal(emitted.length, 20);
  // 3 rows dropped among the first 23, so the 20th survivor is raw[22].
  assert.equal(emitted[19], raw[22]);
  assert.deepEqual(cursorRow(nextCursor), at(raw[22]));
});

test("a full page from a full read with nothing kept after it still pages on", () => {
  const raw = dbOrder(seedRows(30, 3));
  const { emitted, nextCursor } = followersPage(raw, (r) => raw.indexOf(r) < 20);
  assert.equal(emitted.length, 20);
  assert.deepEqual(cursorRow(nextCursor), at(raw[19]));
});

test("a full page that ends a short read has no next page", () => {
  const raw = dbOrder(seedRows(20, 2));
  const { emitted, nextCursor } = followersPage(raw, all);
  assert.equal(emitted.length, 20);
  assert.equal(nextCursor, null);
});

test("a full page from a short read with only dropped rows after it has no next page", () => {
  const raw = dbOrder(seedRows(25, 2));
  const { emitted, nextCursor } = followersPage(raw, (r) => raw.indexOf(r) < 20);
  assert.equal(emitted.length, 20);
  assert.equal(nextCursor, null);
});

test("a full page from a short read with a survivor after it pages on", () => {
  const raw = dbOrder(seedRows(21, 2));
  const { emitted, nextCursor } = followersPage(raw, all);
  assert.equal(emitted.length, 20);
  assert.deepEqual(cursorRow(nextCursor), at(raw[19]));
});

test("a short page from a full read points at the last row read", () => {
  const raw = dbOrder(seedRows(30, 5));
  const { emitted, nextCursor } = followersPage(raw, (r) => raw.indexOf(r) % 6 === 0);
  assert.equal(emitted.length, 5);
  assert.deepEqual(cursorRow(nextCursor), at(raw[29]));
});

test("a full read where nothing survives still advances past it", () => {
  const raw = dbOrder(seedRows(30, 1));
  const { emitted, nextCursor } = followersPage(raw, () => false);
  assert.deepEqual(emitted, []);
  assert.deepEqual(cursorRow(nextCursor), at(raw[29]));
});

test("a short page from a short read is the end of the list", () => {
  const raw = dbOrder(seedRows(29, 5));
  const { emitted, nextCursor } = followersPage(raw, (r) => raw.indexOf(r) % 2 === 0);
  assert.equal(emitted.length, 15);
  assert.equal(nextCursor, null);
});

test("the cursor keeps the raw microsecond timestamp", () => {
  const raw = dbOrder(seedRows(30, 30));
  const { nextCursor } = followersPage(raw, all);
  const c = cursorRow(nextCursor);
  assert.ok(c);
  assert.match(c.t, /\.\d{6}\+00:00$/);
  assert.equal(c.t, raw[19].first_followed_at);
});

// ── Walking every page (the 45-follower acceptance, critic H-1 / M-2) ───────

/**
 * Walks the list and checks the union of pages is exactly the expected set,
 * in database order: no duplicate (a row on two pages) and no gap (a
 * survivor on no page).
 */
function assertWalkCovers(
  seeded: readonly Row[],
  hiddenInSql: ReadonlySet<string>,
  keep: (row: Row) => boolean,
  label: string,
): Row[][] {
  const visible = seeded.filter((r) => !hiddenInSql.has(r.user_id));
  const expected = dbOrder(visible).filter(keep);
  const { pages } = walk(visible, keep);
  const shown = pages.flat();
  const ids = shown.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: no follower appears twice`);
  assert.deepEqual(
    ids,
    expected.map((r) => r.id),
    `${label}: every survivor appears once, in follow order`,
  );
  return pages;
}

test("45 followers sharing 3 timestamps page through with no duplicate and no gap", () => {
  const seeded = seedRows(45, 3);
  // Muted or blocked by the officer: excluded in SQL, before the limit.
  const hidden = new Set([seeded[4].user_id, seeded[17].user_id, seeded[30].user_id]);
  // Members (follow-then-join), a block against the owner, a stranded account:
  // dropped in TypeScript, after the read.
  const dropped = new Set([seeded[1].id, seeded[8].id, seeded[9].id, seeded[22].id, seeded[44].id]);
  const keep = (r: Row) => !dropped.has(r.id);
  const pages = assertWalkCovers(seeded, hidden, keep, "45 followers");
  assert.equal(pages.flat().length, 45 - 3 - 5);
  assert.deepEqual(
    pages.map((p) => p.length),
    [20, 17],
  );
});

test("45 followers all on one timestamp, nothing dropped, page 20 / 20 / 5", () => {
  const pages = assertWalkCovers(seedRows(45, 1), new Set(), all, "one timestamp");
  assert.deepEqual(
    pages.map((p) => p.length),
    [20, 20, 5],
  );
});

test("a run of 30+ dropped followers doesn't end the list early", () => {
  const seeded = seedRows(70, 2);
  const order = dbOrder(seeded);
  // The first 35 in follow order are all members.
  const dropped = new Set(order.slice(0, 35).map((r) => r.id));
  const pages = assertWalkCovers(seeded, new Set(), (r) => !dropped.has(r.id), "long run");
  // `followersPage` alone; the route's `collectFollowersPage` reads past this
  // (see the read-loop tests below).
  assert.equal(pages[0].length, 0, "the first page is empty but carries a cursor");
  assert.equal(pages.flat().length, 35);
});

test("every size and filter pattern pages without duplicates or gaps", () => {
  const sizes = [0, 1, 19, 20, 21, 29, 30, 31, 39, 40, 41, 45, 59, 60, 61, 100];
  const timeBuckets = [1, 2, 3, 7, 1000];
  const patterns: Array<[string, (n: number) => boolean]> = [
    ["keep all", () => true],
    ["drop every 2nd", (n) => n % 2 !== 0],
    ["drop every 3rd", (n) => n % 3 !== 0],
    ["keep every 4th", (n) => n % 4 === 0],
    ["drop 10..34", (n) => n < 10 || n > 34],
    ["drop none of the first 20, all after", (n) => n < 20],
    ["drop all", () => false],
  ];
  for (const size of sizes) {
    for (const buckets of timeBuckets) {
      const seeded = seedRows(size, buckets);
      const index = new Map(seeded.map((r, n) => [r.id, n]));
      const hidden = new Set(seeded.filter((_, n) => n % 11 === 5).map((r) => r.user_id));
      for (const [name, rule] of patterns) {
        const keep = (r: Row) => rule(index.get(r.id) ?? -1);
        assertWalkCovers(seeded, hidden, keep, `${size} rows / ${buckets} times / ${name}`);
      }
    }
  }
});

// ── The read loop: an empty page with a cursor is read past (repair) ────────

/**
 * A `read` for `collectFollowersPage` over a seeded set: the same keyset,
 * order and limit as `simulateRead`, counting the reads it served. The cursor
 * arrives decoded, as the route's `readFollowers` gets it.
 */
function readerOver(rows: readonly Row[], keep: (row: Row) => boolean) {
  const served: Array<{ t: string; i: string } | null> = [];
  const read = async (from: { t: string; i: string } | null) => {
    served.push(from);
    const raw = dbOrder(rows)
      .filter(
        (r) =>
          !from ||
          r.first_followed_at < from.t ||
          (r.first_followed_at === from.t && r.id < from.i),
      )
      .slice(0, FOLLOWERS_PAGE_FETCHED);
    const context = { firstId: raw[0]?.id ?? null };
    return { ok: true as const, read: { rows: raw, keep, context } };
  };
  return { read, served };
}

/** Every response from the first to a null cursor, through the loop. */
async function walkCollected(
  rows: readonly Row[],
  keep: (row: Row) => boolean,
): Promise<{ pages: Row[][]; reads: number[] }> {
  const pages: Row[][] = [];
  const reads: number[] = [];
  let start: { t: string; i: string } | null = null;
  for (let guard = 0; guard < 200; guard++) {
    const { read } = readerOver(rows, keep);
    const res = await collectFollowersPage(start, read);
    assert.ok(res.ok);
    assert.ok(res.reads <= FOLLOWERS_PAGE_MAX_READS, "never more reads than the bound");
    pages.push(res.emitted);
    reads.push(res.reads);
    if (res.nextCursor === null) return { pages, reads };
    start = cursorRow(res.nextCursor);
  }
  assert.fail("the collected walk never reached a null cursor");
}

test("the read bound is 4 reads (120 raw rows)", () => {
  assert.equal(FOLLOWERS_PAGE_MAX_READS, 4);
});

test("35 dropped followers, then survivors: the first response has rows", async () => {
  const seeded = seedRows(70, 2);
  const order = dbOrder(seeded);
  // The 35 newest follows are all follow-then-join members.
  const dropped = new Set(order.slice(0, 35).map((r) => r.id));
  const keep = (r: Row) => !dropped.has(r.id);
  const { read, served } = readerOver(seeded, keep);
  const res = await collectFollowersPage(null, read);
  assert.ok(res.ok);
  assert.equal(res.reads, 2, "the empty first read is read past once");
  assert.equal(served.length, 2);
  assert.equal(served[0], null);
  assert.deepEqual(served[1], at(order[29]), "the second read starts after the last row read");
  assert.deepEqual(
    res.emitted.map((r) => r.id),
    order.slice(35, 55).map((r) => r.id),
    "the first 20 survivors, in follow order",
  );
  assert.deepEqual(cursorRow(res.nextCursor), at(order[54]));
  assert.equal(res.context.firstId, order[30].id, "the context is the answering read's");
});

test("a first read with rows answers on its own", async () => {
  const seeded = seedRows(45, 3);
  const { read, served } = readerOver(seeded, all);
  const res = await collectFollowersPage(null, read);
  assert.ok(res.ok);
  assert.equal(res.reads, 1);
  assert.equal(served.length, 1);
  assert.equal(res.emitted.length, 20);
});

test("a short read that keeps nobody ends the list without another read", async () => {
  const seeded = seedRows(12, 2);
  const { read, served } = readerOver(seeded, () => false);
  const res = await collectFollowersPage(null, read);
  assert.ok(res.ok);
  assert.equal(served.length, 1);
  assert.deepEqual(res.emitted, []);
  assert.equal(res.nextCursor, null);
});

test("more dropped rows than the bound can read: an empty page and a cursor, after 4 reads", async () => {
  const seeded = seedRows(160, 3);
  const order = dbOrder(seeded);
  const dropped = new Set(order.slice(0, 150).map((r) => r.id));
  const keep = (r: Row) => !dropped.has(r.id);
  const { read, served } = readerOver(seeded, keep);
  const res = await collectFollowersPage(null, read);
  assert.ok(res.ok);
  assert.equal(res.reads, FOLLOWERS_PAGE_MAX_READS);
  assert.equal(served.length, FOLLOWERS_PAGE_MAX_READS);
  assert.deepEqual(res.emitted, []);
  assert.deepEqual(cursorRow(res.nextCursor), at(order[4 * FOLLOWERS_PAGE_FETCHED - 1]));
  // The next request picks up there and finds the survivors.
  const next = await collectFollowersPage(cursorRow(res.nextCursor), readerOver(seeded, keep).read);
  assert.ok(next.ok);
  assert.deepEqual(
    next.emitted.map((r) => r.id),
    order.slice(150).map((r) => r.id),
  );
  assert.equal(next.nextCursor, null);
});

test("a failed read stops the loop and hands back its failure", async () => {
  const seeded = seedRows(70, 2);
  const order = dbOrder(seeded);
  const dropped = new Set(order.slice(0, 40).map((r) => r.id));
  const inner = readerOver(seeded, (r) => !dropped.has(r.id));
  let calls = 0;
  const read = async (from: { t: string; i: string } | null) => {
    calls++;
    if (calls === 2) return { ok: false as const, failure: "boom" };
    return inner.read(from);
  };
  const res = await collectFollowersPage(null, read);
  assert.deepEqual(res, { ok: false, failure: "boom" });
  assert.equal(calls, 2, "no read after the failure");
});

test("walking through the loop still has no duplicate and no gap", async () => {
  const sizes = [0, 1, 20, 30, 31, 45, 61, 100, 150];
  const timeBuckets = [1, 3, 1000];
  const patterns: Array<[string, (n: number) => boolean]> = [
    ["keep all", () => true],
    ["drop every 2nd", (n) => n % 2 !== 0],
    ["keep every 9th", (n) => n % 9 === 0],
    ["drop the first 35", (n) => n >= 35],
    ["drop the first 130", (n) => n >= 130],
    ["drop all", () => false],
  ];
  for (const size of sizes) {
    for (const buckets of timeBuckets) {
      const seeded = seedRows(size, buckets);
      const order = dbOrder(seeded);
      const rank = new Map(order.map((r, n) => [r.id, n]));
      for (const [name, rule] of patterns) {
        const keep = (r: Row) => rule(rank.get(r.id) ?? -1);
        const label = `${size} rows / ${buckets} times / ${name}`;
        const { pages } = await walkCollected(seeded, keep);
        const ids = pages.flat().map((r) => r.id);
        assert.equal(new Set(ids).size, ids.length, `${label}: no follower appears twice`);
        assert.deepEqual(
          ids,
          order.filter(keep).map((r) => r.id),
          `${label}: every survivor appears once, in follow order`,
        );
        const expectedCount = order.filter(keep).length;
        const reachable = order.findIndex(keep) < FOLLOWERS_PAGE_MAX_READS * FOLLOWERS_PAGE_FETCHED;
        if (expectedCount > 0 && reachable) {
          assert.ok(pages[0].length > 0, `${label}: a reachable survivor is on the first response`);
        }
      }
    }
  }
});
