/**
 * Tests for the group-chat shape of `pair-block.ts` (S67 security wave 2,
 * batch A2): groupBlockFilter / loadGroupBlockConflict. The rest of the
 * module is covered by pair-block.test.ts; this file copies its loading
 * pattern and its fake client.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/safety/pair-block-group.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./pair-block.ts";
const { groupBlockFilter, loadGroupBlockConflict } = (await import(specifier)) as typeof import(
  "./pair-block"
);

type Client = Parameters<typeof loadGroupBlockConflict>[0];

const ADDER = "df5ab44e-0000-4000-8000-000000000001";
const MEMBER = "923896fb-0000-4000-8000-000000000002";
const NEWBIE = "017339fe-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const NEWBIE2 = "5c1e0f2a-0000-4000-8000-000000000009";

/** The chainable recorder of pair-block.test.ts: one `{ data, error }` per table. */
function fakeClient(results: Record<string, unknown>) {
  const calls: unknown[][] = [];
  const client = {
    from(table: string) {
      calls.push(["from", table]);
      const result =
        table in results ? results[table] : { data: null, error: { message: `no fake for ${table}` } };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "or", "limit"]) {
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

/** Evaluate the `and(col.in.(a,b),col.in.(c)),and(...)` grammar the filter uses. */
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

test("groupBlockFilter: the exact string, newcomers counted among everyone", () => {
  assert.equal(
    groupBlockFilter([NEWBIE], [ADDER, MEMBER]),
    `and(blocker_id.in.(${NEWBIE}),blocked_id.in.(${NEWBIE},${ADDER},${MEMBER})),` +
      `and(blocked_id.in.(${NEWBIE}),blocker_id.in.(${NEWBIE},${ADDER},${MEMBER}))`,
  );
});

test("groupBlockFilter: ids are lower-cased and deduped, first seen first", () => {
  assert.equal(
    groupBlockFilter([NEWBIE.toUpperCase(), NEWBIE], [ADDER, NEWBIE, ADDER]),
    `and(blocker_id.in.(${NEWBIE}),blocked_id.in.(${NEWBIE},${ADDER})),` +
      `and(blocked_id.in.(${NEWBIE}),blocker_id.in.(${NEWBIE},${ADDER}))`,
  );
});

test("groupBlockFilter: null with no newcomer or any id that isn't a strict UUID", () => {
  assert.equal(groupBlockFilter([], [ADDER]), null);
  assert.equal(groupBlockFilter(["x),or(true"], [ADDER]), null);
  assert.equal(groupBlockFilter([NEWBIE], [ADDER, "x),or(true"]), null);
  assert.equal(groupBlockFilter([NEWBIE], ["not-a-uuid"]), null);
});

test("groupBlockFilter: matches newcomer pairs either way, never two people already there", () => {
  const f = groupBlockFilter([NEWBIE, NEWBIE2], [ADDER, MEMBER]);
  assert.ok(f);
  const people = [ADDER, MEMBER, NEWBIE, NEWBIE2];
  const hits: string[] = [];
  for (const blocker_id of people) {
    for (const blocked_id of people) {
      if (blocker_id === blocked_id) continue;
      if (matches(f, { blocker_id, blocked_id })) hits.push(`${blocker_id}>${blocked_id}`);
    }
  }
  // Every ordered pair except ADDER<->MEMBER (both already in the chat).
  const want = people
    .flatMap((a) => people.filter((b) => b !== a).map((b) => `${a}>${b}`))
    .filter((p) => p !== `${ADDER}>${MEMBER}` && p !== `${MEMBER}>${ADDER}`);
  assert.deepEqual(hits.sort(), want.sort());
  // An outsider is never matched.
  const OUT = "11111111-1111-4111-8111-111111111111";
  assert.equal(matches(f, { blocker_id: OUT, blocked_id: NEWBIE }), false);
  assert.equal(matches(f, { blocker_id: NEWBIE, blocked_id: OUT }), false);
});

test("loadGroupBlockConflict: no newcomer is not blocked, a bad id is ok:false, neither queries", async () => {
  const { client, calls } = fakeClient({ blocks: { data: [], error: null } });
  assert.deepEqual(await loadGroupBlockConflict(client, [], [ADDER]), { ok: true, blocked: false });
  assert.deepEqual(await loadGroupBlockConflict(client, ["x),or(true"], [ADDER]), {
    ok: false,
    error: "bad id",
  });
  assert.equal(calls.length, 0);
});

test("loadGroupBlockConflict: one row is blocked, read with the filter, stopping at one", async () => {
  const hit = fakeClient({ blocks: { data: [{ blocker_id: MEMBER }], error: null } });
  assert.deepEqual(await loadGroupBlockConflict(hit.client, [NEWBIE], [ADDER, MEMBER]), {
    ok: true,
    blocked: true,
  });
  assert.deepEqual(hit.calls, [
    ["from", "blocks"],
    ["select", "blocker_id"],
    ["or", groupBlockFilter([NEWBIE], [ADDER, MEMBER])],
    ["limit", 1],
  ]);
  const miss = fakeClient({ blocks: { data: [], error: null } });
  assert.deepEqual(await loadGroupBlockConflict(miss.client, [NEWBIE], [ADDER]), {
    ok: true,
    blocked: false,
  });
});

test("loadGroupBlockConflict: a read error or a throw is ok:false, never 'not blocked'", async () => {
  const err = { message: "boom" };
  const bad = fakeClient({ blocks: { data: null, error: err } });
  assert.deepEqual(await loadGroupBlockConflict(bad.client, [NEWBIE], [ADDER]), {
    ok: false,
    error: err,
  });
  const thrown = new Error("network");
  const threw = fakeClient({ blocks: thrown });
  assert.deepEqual(await loadGroupBlockConflict(threw.client, [NEWBIE], [ADDER]), {
    ok: false,
    error: thrown,
  });
});
