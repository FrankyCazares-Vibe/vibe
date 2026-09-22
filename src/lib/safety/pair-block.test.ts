/**
 * Tests for `pair-block.ts`, the one block-pair module of the week-1 wave
 * (`handoffs/wave-plan-week1/T1.md` contract item 4 and acceptance A, T2.md
 * E2, rulings M11).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/safety/pair-block.test.ts
 *
 * The module has only an `import type` line (rulings M11: zero `@/` imports),
 * which type stripping erases, so it loads through a dynamic import of its
 * ".ts" path, the same pattern as `src/lib/posts/edit.test.ts`. The specifier
 * goes through a variable because tsc refuses a literal ".ts" specifier. The
 * fake client is the chainable recorder of `src/lib/orgs/following.test.ts`,
 * with one configured `{ data, error }` per table.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./pair-block.ts";
const {
  blockPairFilter,
  dmSendBlocked,
  loadAnyPairBlock,
  loadPairBlock,
  pairBlockFilter,
} = (await import(specifier)) as typeof import("./pair-block");

type Client = Parameters<typeof loadPairBlock>[0];

const VIEWER = "df5ab44e-0000-4000-8000-000000000001";
const TARGET = "923896fb-0000-4000-8000-000000000002";
const PEER2 = "017339fe-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const CHANNEL = "5c1e0f2a-0000-4000-8000-000000000009";

/**
 * A fake PostgREST client. Every builder call is recorded as `[method,
 * ...args]` (`from` included). Awaiting a builder resolves to the result
 * configured for its table; a table with no entry resolves to a loud error.
 */
function fakeClient(results: Record<string, unknown>) {
  const calls: unknown[][] = [];
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      const result =
        table in results ? results[table] : { data: null, error: { message: `no fake for ${table}` } };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "in", "or", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(
          resolve,
          reject,
        );
      return builder;
    },
  };
  return { client: client as unknown as Client, calls };
}

const tablesRead = (calls: unknown[][]) => calls.filter((c) => c[0] === "from").map((c) => c[1]);

// ── the copied UUID check ───────────────────────────────────────────────────

test("the UUID regex is a byte-for-byte copy of src/lib/pgrest.ts", () => {
  const grab = (path: string) => {
    const src = readFileSync(new URL(path, import.meta.url), "utf8");
    const m = src.match(/const UUID_RE =\s*(\/.+\/[a-z]*);/);
    assert.ok(m, `no UUID_RE in ${path}`);
    return m[1];
  };
  assert.equal(grab("./pair-block.ts"), grab("../pgrest.ts"));
});

// ── one viewer, one target ──────────────────────────────────────────────────

test("pairBlockFilter is the bootstrap string byte for byte", () => {
  // users/[handle]/bootstrap/route.ts:119-122 at 1b5b351, with targetIdRaw =
  // TARGET and viewer.id = VIEWER.
  const bootstrap =
    `and(blocker_id.eq.${TARGET},blocked_id.eq.${VIEWER}),` +
    `and(blocker_id.eq.${VIEWER},blocked_id.eq.${TARGET})`;
  assert.equal(pairBlockFilter(VIEWER, TARGET), bootstrap);
  assert.equal(
    pairBlockFilter(VIEWER, TARGET),
    "and(blocker_id.eq.923896fb-0000-4000-8000-000000000002,blocked_id.eq.df5ab44e-0000-4000-8000-000000000001)," +
      "and(blocker_id.eq.df5ab44e-0000-4000-8000-000000000001,blocked_id.eq.923896fb-0000-4000-8000-000000000002)",
  );
});

test("loadPairBlock: self is ok and not blocked, with no query", async () => {
  const { client, calls } = fakeClient({});
  assert.deepEqual(await loadPairBlock(client, VIEWER, VIEWER), {
    ok: true,
    blocked: false,
    viewerBlockedTarget: false,
    targetBlockedViewer: false,
  });
  assert.equal(calls.length, 0);
});

test("loadPairBlock: a non-UUID id is ok:false with no query", async () => {
  const { client, calls } = fakeClient({ blocks: { data: [], error: null } });
  for (const [v, t] of [
    [VIEWER, "x),or(true"],
    ["not-a-uuid", TARGET],
    ["not-a-uuid", "not-a-uuid"],
    [VIEWER, ""],
  ]) {
    const res = await loadPairBlock(client, v, t);
    assert.equal(res.ok, false, `${v} / ${t}`);
  }
  assert.equal(calls.length, 0);
});

test("loadPairBlock: no rows is ok and not blocked, read with the bootstrap filter", async () => {
  const { client, calls } = fakeClient({ blocks: { data: [], error: null } });
  assert.deepEqual(await loadPairBlock(client, VIEWER, TARGET), {
    ok: true,
    blocked: false,
    viewerBlockedTarget: false,
    targetBlockedViewer: false,
  });
  assert.deepEqual(calls, [
    ["from", "blocks"],
    ["select", "blocker_id, blocked_id"],
    ["or", pairBlockFilter(VIEWER, TARGET)],
  ]);
});

test("loadPairBlock: the viewer blocked the target", async () => {
  const { client } = fakeClient({
    blocks: { data: [{ blocker_id: VIEWER, blocked_id: TARGET }], error: null },
  });
  assert.deepEqual(await loadPairBlock(client, VIEWER, TARGET), {
    ok: true,
    blocked: true,
    viewerBlockedTarget: true,
    targetBlockedViewer: false,
  });
});

test("loadPairBlock: the target blocked the viewer", async () => {
  const { client } = fakeClient({
    blocks: { data: [{ blocker_id: TARGET, blocked_id: VIEWER }], error: null },
  });
  assert.deepEqual(await loadPairBlock(client, VIEWER, TARGET), {
    ok: true,
    blocked: true,
    viewerBlockedTarget: false,
    targetBlockedViewer: true,
  });
});

test("loadPairBlock: both directions set both flags", async () => {
  const { client } = fakeClient({
    blocks: {
      data: [
        { blocker_id: TARGET, blocked_id: VIEWER },
        { blocker_id: VIEWER, blocked_id: TARGET },
      ],
      error: null,
    },
  });
  assert.deepEqual(await loadPairBlock(client, VIEWER, TARGET), {
    ok: true,
    blocked: true,
    viewerBlockedTarget: true,
    targetBlockedViewer: true,
  });
});

test("loadPairBlock: an upper-case id still finds the block, with the right flag", async () => {
  // Postgres matches uuids in either case but returns them in lower case.
  const { client, calls } = fakeClient({
    blocks: { data: [{ blocker_id: TARGET, blocked_id: VIEWER }], error: null },
  });
  assert.deepEqual(await loadPairBlock(client, VIEWER, TARGET.toUpperCase()), {
    ok: true,
    blocked: true,
    viewerBlockedTarget: false,
    targetBlockedViewer: true,
  });
  // The filter is built from the lower-cased ids.
  assert.ok(calls.some((c) => c[0] === "or" && c[1] === pairBlockFilter(VIEWER, TARGET)));

  const mine = fakeClient({
    blocks: { data: [{ blocker_id: VIEWER, blocked_id: TARGET }], error: null },
  });
  assert.deepEqual(await loadPairBlock(mine.client, VIEWER.toUpperCase(), TARGET), {
    ok: true,
    blocked: true,
    viewerBlockedTarget: true,
    targetBlockedViewer: false,
  });
});

test("loadPairBlock: self in mixed case is still self, with no query", async () => {
  const { client, calls } = fakeClient({});
  assert.deepEqual(await loadPairBlock(client, VIEWER, VIEWER.toUpperCase()), {
    ok: true,
    blocked: false,
    viewerBlockedTarget: false,
    targetBlockedViewer: false,
  });
  assert.equal(calls.length, 0);
});

test("loadPairBlock: any row the read returns is blocked (fail closed)", async () => {
  const { client } = fakeClient({ blocks: { data: [{ blocker_id: null }], error: null } });
  const res = await loadPairBlock(client, VIEWER, TARGET);
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.blocked, true);
});

test("loadPairBlock: a read error is ok:false, never 'not blocked'", async () => {
  const failure = { code: "42501", message: "permission denied for table blocks" };
  const { client } = fakeClient({ blocks: { data: null, error: failure } });
  assert.deepEqual(await loadPairBlock(client, VIEWER, TARGET), { ok: false, error: failure });

  const boom = new Error("fetch failed");
  const thrower = fakeClient({ blocks: boom });
  assert.deepEqual(await loadPairBlock(thrower.client, VIEWER, TARGET), { ok: false, error: boom });
});

// ── one viewer, N peers ─────────────────────────────────────────────────────

test("blockPairFilter: the exact string for one peer and for two peers", () => {
  assert.equal(
    blockPairFilter(VIEWER, [TARGET]),
    `and(blocker_id.eq.${VIEWER},blocked_id.in.(${TARGET})),` +
      `and(blocked_id.eq.${VIEWER},blocker_id.in.(${TARGET}))`,
  );
  assert.equal(
    blockPairFilter(VIEWER, [TARGET, PEER2]),
    `and(blocker_id.eq.${VIEWER},blocked_id.in.(${TARGET},${PEER2})),` +
      `and(blocked_id.eq.${VIEWER},blocker_id.in.(${TARGET},${PEER2}))`,
  );
});

test("blockPairFilter: null for [], for an injected peer, and for a non-UUID viewer", () => {
  assert.equal(blockPairFilter(VIEWER, []), null);
  assert.equal(blockPairFilter(VIEWER, ["x),or(true"]), null);
  assert.equal(blockPairFilter(VIEWER, [TARGET, "x),or(true"]), null);
  assert.equal(blockPairFilter("not-a-uuid", [TARGET]), null);
  // Version digit 9 is outside the strict check's [1-8], even in upper case.
  assert.equal(blockPairFilter(VIEWER, [TARGET.toUpperCase().replace("4000", "9000")]), null);
});

/** Split a PostgREST logic string at commas outside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Evaluate the small `and(col.eq.v,col.in.(a,b)),and(...)` grammar both filters use. */
function matches(filter: string, row: Record<string, string>): boolean {
  return splitTop(filter).some((group) => {
    const m = group.match(/^and\((.*)\)$/);
    assert.ok(m, `not an and() group: ${group}`);
    return splitTop(m[1]).every((cond) => {
      const [col, op, ...rest] = cond.split(".");
      const val = rest.join(".");
      if (op === "eq") return row[col] === val;
      if (op === "in") return val.slice(1, -1).split(",").includes(row[col]);
      throw new Error(`unknown operator ${op}`);
    });
  });
}

test("with one peer, both filter shapes match exactly the same block rows (critic M11)", () => {
  const people = [VIEWER, TARGET, PEER2];
  const one = pairBlockFilter(VIEWER, TARGET);
  const many = blockPairFilter(VIEWER, [TARGET]);
  assert.ok(many);
  const hits: string[] = [];
  for (const blocker_id of people) {
    for (const blocked_id of people) {
      if (blocker_id === blocked_id) continue;
      const row = { blocker_id, blocked_id };
      assert.equal(matches(many, row), matches(one, row), `${blocker_id} -> ${blocked_id}`);
      if (matches(one, row)) hits.push(`${blocker_id}>${blocked_id}`);
    }
  }
  assert.deepEqual(hits.sort(), [`${VIEWER}>${TARGET}`, `${TARGET}>${VIEWER}`].sort());
  // Two peers: a block with either peer, either way, and nothing between the peers.
  const two = blockPairFilter(VIEWER, [TARGET, PEER2]);
  assert.ok(two);
  assert.equal(matches(two, { blocker_id: PEER2, blocked_id: VIEWER }), true);
  assert.equal(matches(two, { blocker_id: VIEWER, blocked_id: PEER2 }), true);
  assert.equal(matches(two, { blocker_id: TARGET, blocked_id: PEER2 }), false);
});

test("loadAnyPairBlock: no peers is not blocked with no query; a bad id is ok:false", async () => {
  const { client, calls } = fakeClient({ blocks: { data: [], error: null } });
  assert.deepEqual(await loadAnyPairBlock(client, VIEWER, []), { ok: true, blocked: false });
  assert.deepEqual(await loadAnyPairBlock(client, VIEWER, ["x),or(true"]), {
    ok: false,
    error: "bad id",
  });
  assert.deepEqual(await loadAnyPairBlock(client, "not-a-uuid", []), {
    ok: false,
    error: "bad id",
  });
  assert.equal(calls.length, 0);
});

test("loadAnyPairBlock: one row is blocked, zero rows is not, and the read stops at one", async () => {
  const hit = fakeClient({ blocks: { data: [{ blocker_id: PEER2 }], error: null } });
  assert.deepEqual(await loadAnyPairBlock(hit.client, VIEWER, [TARGET, PEER2]), {
    ok: true,
    blocked: true,
  });
  assert.deepEqual(hit.calls, [
    ["from", "blocks"],
    ["select", "blocker_id"],
    ["or", blockPairFilter(VIEWER, [TARGET, PEER2])],
    ["limit", 1],
  ]);
  const miss = fakeClient({ blocks: { data: [], error: null } });
  assert.deepEqual(await loadAnyPairBlock(miss.client, VIEWER, [TARGET]), {
    ok: true,
    blocked: false,
  });
});

test("loadAnyPairBlock: a read error is ok:false", async () => {
  const failure = { message: "boom" };
  const { client } = fakeClient({ blocks: { data: null, error: failure } });
  assert.deepEqual(await loadAnyPairBlock(client, VIEWER, [TARGET]), { ok: false, error: failure });
});

// ── dmSendBlocked (T2.md E2) ────────────────────────────────────────────────

test("dmSendBlocked: a members read error is ok:false and blocks is never read", async () => {
  const failure = { message: "members down" };
  const { client, calls } = fakeClient({
    channel_members: { data: null, error: failure },
    blocks: { data: [], error: null },
  });
  assert.deepEqual(await dmSendBlocked(client, CHANNEL, VIEWER), { ok: false, error: failure });
  assert.deepEqual(tablesRead(calls), ["channel_members"]);
});

test("dmSendBlocked: no peers is not blocked and blocks is never read", async () => {
  const { client, calls } = fakeClient({
    channel_members: { data: [], error: null },
    blocks: { data: [{ blocker_id: TARGET }], error: null },
  });
  assert.deepEqual(await dmSendBlocked(client, CHANNEL, VIEWER), { ok: true, blocked: false });
  assert.deepEqual(calls, [
    ["from", "channel_members"],
    ["select", "user_id"],
    ["eq", "channel_id", CHANNEL],
    ["neq", "user_id", VIEWER],
  ]);
});

test("dmSendBlocked: a peer with a bad id is ok:false 'bad id'", async () => {
  const { client, calls } = fakeClient({
    channel_members: { data: [{ user_id: "x),or(true" }], error: null },
    blocks: { data: [], error: null },
  });
  assert.deepEqual(await dmSendBlocked(client, CHANNEL, VIEWER), { ok: false, error: "bad id" });
  assert.deepEqual(tablesRead(calls), ["channel_members"]);
});

test("dmSendBlocked: a blocks error is ok:false; one row is blocked; zero rows is not", async () => {
  const members = { data: [{ user_id: TARGET }, { user_id: PEER2 }], error: null };
  const failure = { message: "blocks down" };
  const err = fakeClient({ channel_members: members, blocks: { data: null, error: failure } });
  assert.deepEqual(await dmSendBlocked(err.client, CHANNEL, VIEWER), { ok: false, error: failure });

  const hit = fakeClient({ channel_members: members, blocks: { data: [{ blocker_id: PEER2 }], error: null } });
  assert.deepEqual(await dmSendBlocked(hit.client, CHANNEL, VIEWER), { ok: true, blocked: true });
  assert.deepEqual(tablesRead(hit.calls), ["channel_members", "blocks"]);
  assert.ok(hit.calls.some((c) => c[0] === "or" && c[1] === blockPairFilter(VIEWER, [TARGET, PEER2])));

  const miss = fakeClient({ channel_members: members, blocks: { data: [], error: null } });
  assert.deepEqual(await dmSendBlocked(miss.client, CHANNEL, VIEWER), { ok: true, blocked: false });
});
