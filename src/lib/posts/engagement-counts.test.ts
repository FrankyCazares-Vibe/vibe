/**
 * Tests for `engagement-counts.ts`, the like and repost counts that moved to
 * the `post_engagement_counts` RPC (week-1 wave plan
 * `handoffs/wave-plan-week1/T1.md`, contract item 3, acceptance A).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/posts/engagement-counts.test.ts
 *
 * The module has only an `import type` line, which type stripping erases, so
 * it loads through a dynamic import of its ".ts" path, the same pattern as
 * `src/lib/posts/edit.test.ts`. The specifier goes through a variable because
 * tsc refuses a literal ".ts" specifier.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./engagement-counts.ts";
const { ENGAGEMENT_RPC_MAX_IDS, loadPostEngagementCounts, tallyEngagement } = (await import(
  specifier
)) as typeof import("./engagement-counts");

type Client = Parameters<typeof loadPostEngagementCounts>[0];

const P1 = "11111111-0000-4000-8000-000000000001";
const P2 = "11111111-0000-4000-8000-000000000002";
const P3 = "11111111-0000-4000-8000-000000000003";

/**
 * A fake client with only `rpc`. Every call is recorded as `[fn, args]`.
 * `respond` decides each call's `{ data, error }` from the call's args.
 */
function fakeClient(respond: (args: { p_post_ids: string[]; p_since: unknown }) => unknown) {
  const calls: Array<[string, { p_post_ids: string[]; p_since: unknown }]> = [];
  const client = {
    rpc(fn: string, args: { p_post_ids: string[]; p_since: unknown }) {
      calls.push([fn, args]);
      return Promise.resolve(respond(args));
    },
  };
  return { client: client as unknown as Client, calls };
}

/** Runs fn with console.error captured instead of printed. */
async function capturingErrors<T>(fn: () => Promise<T>): Promise<{ value: T; logged: unknown[][] }> {
  const original = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    return { value: await fn(), logged };
  } finally {
    console.error = original;
  }
}

function asObject(map: Map<string, unknown> | null) {
  assert.ok(map, "expected a Map");
  return Object.fromEntries(map);
}

// ── tallyEngagement ─────────────────────────────────────────────────────────

test("the RPC limit is 1000, the same as the SQL guard", () => {
  assert.equal(ENGAGEMENT_RPC_MAX_IDS, 1000);
});

test("tallyEngagement zero-fills every asked id", () => {
  assert.deepEqual(asObject(tallyEngagement([], [P1, P2])), {
    [P1]: { likes: 0, reposts: 0 },
    [P2]: { likes: 0, reposts: 0 },
  });
  assert.deepEqual(asObject(tallyEngagement(null, [P1])), { [P1]: { likes: 0, reposts: 0 } });
  assert.deepEqual(asObject(tallyEngagement({ post_id: P1 }, [P1])), {
    [P1]: { likes: 0, reposts: 0 },
  });
  assert.equal(tallyEngagement([], []).size, 0);
});

test("tallyEngagement keeps asked ids and ignores rows for ids not asked for", () => {
  const map = tallyEngagement(
    [
      { post_id: P1, like_count: 2, repost_count: 1 },
      { post_id: P3, like_count: 9, repost_count: 9 },
    ],
    [P1, P2],
  );
  assert.deepEqual(asObject(map), {
    [P1]: { likes: 2, reposts: 1 },
    [P2]: { likes: 0, reposts: 0 },
  });
  assert.equal(map.has(P3), false);
});

test("tallyEngagement skips rows with no string post_id", () => {
  const map = tallyEngagement(
    [
      null,
      "row",
      42,
      { like_count: 5, repost_count: 5 },
      { post_id: 7, like_count: 5, repost_count: 5 },
      { post_id: P1, like_count: 1, repost_count: 2 },
    ],
    [P1],
  );
  assert.deepEqual(asObject(map), { [P1]: { likes: 1, reposts: 2 } });
});

test("tallyEngagement turns \"3\" into 3 and null, -1, \"x\" or a missing count into 0", () => {
  const map = tallyEngagement(
    [
      { post_id: P1, like_count: "3", repost_count: null },
      { post_id: P2, like_count: -1, repost_count: "x" },
      { post_id: P3 },
    ],
    [P1, P2, P3],
  );
  assert.deepEqual(asObject(map), {
    [P1]: { likes: 3, reposts: 0 },
    [P2]: { likes: 0, reposts: 0 },
    [P3]: { likes: 0, reposts: 0 },
  });
  const odd = tallyEngagement([{ post_id: P1, like_count: Infinity, repost_count: 2.9 }], [P1]);
  assert.deepEqual(asObject(odd), { [P1]: { likes: 0, reposts: 2 } });
});

test("tallyEngagement: the last row wins for a repeated id", () => {
  const map = tallyEngagement(
    [
      { post_id: P1, like_count: 1, repost_count: 1 },
      { post_id: P1, like_count: 4, repost_count: 0 },
    ],
    [P1],
  );
  assert.deepEqual(asObject(map), { [P1]: { likes: 4, reposts: 0 } });
});

test("tallyEngagement matches an upper- or mixed-case asked id to the RPC's lower-case row", () => {
  // Postgres matches uuids in either case but returns them in lower case, and
  // GET /api/posts/[id] passes the id straight from the URL.
  const lower = "df5ab44e-0000-4000-8000-00000000abcd";
  const upper = lower.toUpperCase();
  const mixed = "923896fb-0000-4000-8000-00000000Ef01";
  const map = tallyEngagement(
    [
      { post_id: lower, like_count: 2, repost_count: 1 },
      { post_id: mixed.toLowerCase(), like_count: 5, repost_count: 0 },
    ],
    [upper, mixed, P2],
  );
  assert.deepEqual(asObject(map), {
    [upper]: { likes: 2, reposts: 1 },
    [mixed]: { likes: 5, reposts: 0 },
    [P2]: { likes: 0, reposts: 0 },
  });
  // The Map keeps the caller's own spelling as its keys.
  assert.equal(map.has(lower), false);
  // Asking for the same post in two spellings fills both keys, as separate objects.
  const both = tallyEngagement([{ post_id: lower, like_count: 3, repost_count: 3 }], [lower, upper]);
  assert.deepEqual(both.get(lower), { likes: 3, reposts: 3 });
  assert.deepEqual(both.get(upper), { likes: 3, reposts: 3 });
  assert.notEqual(both.get(lower), both.get(upper));
});

// ── loadPostEngagementCounts ────────────────────────────────────────────────

test("loadPostEngagementCounts makes no call for []", async () => {
  const { client, calls } = fakeClient(() => ({ data: [], error: null }));
  const map = await loadPostEngagementCounts(client, []);
  assert.ok(map instanceof Map);
  assert.equal(map.size, 0);
  assert.equal(calls.length, 0);
});

test("loadPostEngagementCounts dedupes ids and passes p_since: null when since is omitted", async () => {
  const { client, calls } = fakeClient(() => ({
    data: [{ post_id: P1, like_count: 2, repost_count: 2 }],
    error: null,
  }));
  const map = await loadPostEngagementCounts(client, [P1, P2, P1, P2]);
  assert.deepEqual(calls, [["post_engagement_counts", { p_post_ids: [P1, P2], p_since: null }]]);
  assert.deepEqual(asObject(map), {
    [P1]: { likes: 2, reposts: 2 },
    [P2]: { likes: 0, reposts: 0 },
  });
});

test("loadPostEngagementCounts passes since through, and null stays null", async () => {
  const since = "2026-09-15T00:00:00.000Z";
  const { client, calls } = fakeClient(() => ({ data: [], error: null }));
  await loadPostEngagementCounts(client, [P1], since);
  await loadPostEngagementCounts(client, [P1], null);
  assert.deepEqual(
    calls.map(([, args]) => args.p_since),
    [since, null],
  );
});

test("loadPostEngagementCounts splits 1001 ids into calls of 1000 and 1", async () => {
  const ids = Array.from(
    { length: 1001 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  const { client, calls } = fakeClient((args) => ({
    data: args.p_post_ids.map((id) => ({ post_id: id, like_count: 1, repost_count: 0 })),
    error: null,
  }));
  const map = await loadPostEngagementCounts(client, ids);
  assert.deepEqual(
    calls.map(([fn, args]) => [fn, args.p_post_ids.length]),
    [
      ["post_engagement_counts", 1000],
      ["post_engagement_counts", 1],
    ],
  );
  assert.deepEqual(calls[1][1].p_post_ids, [ids[1000]]);
  assert.ok(map);
  assert.equal(map.size, 1001);
  assert.deepEqual(map.get(ids[1000]), { likes: 1, reposts: 0 });
});

test("loadPostEngagementCounts returns null and logs [engagement-counts] when any chunk errors", async () => {
  const ids = Array.from(
    { length: 1001 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
  );
  const failure = { code: "22023", message: "too many ids (max 1000)" };
  const { client } = fakeClient((args) =>
    args.p_post_ids.length === 1 ? { data: null, error: failure } : { data: [], error: null },
  );
  const { value, logged } = await capturingErrors(() => loadPostEngagementCounts(client, ids));
  assert.equal(value, null);
  assert.deepEqual(logged, [["[engagement-counts]", failure]]);
});

test("loadPostEngagementCounts returns null when the client throws", async () => {
  const boom = new Error("fetch failed");
  const client = {
    rpc() {
      return Promise.reject(boom);
    },
  } as unknown as Client;
  const { value, logged } = await capturingErrors(() => loadPostEngagementCounts(client, [P1]));
  assert.equal(value, null);
  assert.deepEqual(logged, [["[engagement-counts]", boom]]);
});

test("loadPostEngagementCounts zero-fills posts the RPC does not return (drafts you can't see)", async () => {
  const { client } = fakeClient(() => ({
    data: [{ post_id: P1, like_count: 2, repost_count: 2 }],
    error: null,
  }));
  const map = await loadPostEngagementCounts(client, [P1, P2, P3]);
  assert.deepEqual(asObject(map), {
    [P1]: { likes: 2, reposts: 2 },
    [P2]: { likes: 0, reposts: 0 },
    [P3]: { likes: 0, reposts: 0 },
  });
});
