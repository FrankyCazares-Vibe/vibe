/**
 * Tests for `leave-rsvps.ts` (Oct 22, 2026, PLAN-3.md): leaving a club takes
 * you off its Members only events.
 *   - the preview reads only this student's Going / Interested RSVPs to this
 *     club's members-only events that haven't ended, soonest first;
 *   - the drop deletes this student's RSVPs on exactly those events, counts
 *     only the Going / Interested ones, and never throws.
 *
 * Run with:
 *   node --test src/lib/orgs/leave-rsvps.test.ts
 *
 * The module's only import is a type (erased), so it loads directly; the
 * fake client records every chain and answers it whole.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./leave-rsvps.ts";
const { LEAVE_DROP_ROUNDS, LEAVE_RSVPS_MAX, dropMembersOnlyRsvpsOnLeave, membersOnlyRsvpsOnLeave } = (await import(specifier)) as typeof import("./leave-rsvps");

type Call = [string, ...unknown[]];
type Query = { table: string; calls: Call[] };
type Answer = { data?: unknown; error?: { code?: string; message?: string } | null };
const METHODS = ["select", "eq", "in", "gt", "order", "limit", "delete"];

function fakeClient(answer: (q: Query) => Answer) {
  const queries: Query[] = [];
  const client = {
    from(table: string) {
      const q: Query = { table, calls: [] };
      queries.push(q);
      const builder: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
          Promise.resolve()
            .then(() => {
              const a = answer(q);
              return { data: a.data ?? null, error: a.error ?? null };
            })
            .then(ok, bad),
      };
      for (const name of METHODS) builder[name] = (...args: unknown[]) => (q.calls.push([name, ...args]), builder);
      return builder;
    },
  };
  return { client: client as unknown as Parameters<typeof membersOnlyRsvpsOnLeave>[0], queries };
}

const ORG = "dddddddd-0000-4000-8000-000000000001";
const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const has = (q: Query, ...call: unknown[]) => q.calls.some((c) => c.length === call.length && c.every((v, i) => (Array.isArray(v) ? JSON.stringify(v) === JSON.stringify(call[i]) : v === call[i])));
const quietly = async <T>(fn: () => Promise<T>): Promise<T> => {
  const quiet = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = quiet;
  }
};

const ev = (id: string, starts_at: string, title = `Event ${id}`) => ({ id, title, starts_at, ends_at: "2099-01-01T00:00:00Z", org_id: ORG, visibility: "members" });

test("preview: my Going and Interested RSVPs to the club's members-only events that haven't ended, soonest first", async () => {
  const { client, queries } = fakeClient(() => ({
    data: [
      { status: "maybe", event: ev("e2", "2026-11-03T23:00:00Z", "Formal") },
      { status: "going", event: ev("e1", "2026-10-30T23:00:00Z", "Chapter dinner") },
      { status: "going", event: null },
    ],
  }));
  const res = await membersOnlyRsvpsOnLeave(client, ORG, ME);
  assert.deepEqual(res, {
    ok: true,
    events: [
      { id: "e1", title: "Chapter dinner", starts_at: "2026-10-30T23:00:00Z", viewer_status: "going" },
      { id: "e2", title: "Formal", starts_at: "2026-11-03T23:00:00Z", viewer_status: "maybe" },
    ],
  });
  const [q] = queries;
  assert.equal(q.table, "rsvps");
  assert.match(String(q.calls[0][1]), /event:events!inner\(/, "the embedded filter drops rows, not just the event");
  assert.ok(has(q, "eq", "user_id", ME), "only mine");
  assert.ok(has(q, "eq", "event.org_id", ORG), "only this club's");
  assert.ok(has(q, "eq", "event.visibility", "members"), "only members-only events");
  assert.ok(has(q, "in", "status", ["going", "maybe"]), "a Can't go isn't one they're going to");
  const upcoming = q.calls.find((c) => c[0] === "gt" && c[1] === "event.ends_at");
  assert.ok(upcoming && Math.abs(Date.parse(String(upcoming[2])) - Date.now()) < 60_000, "ends_at > now, the trigger's test");
  assert.ok(has(q, "limit", LEAVE_RSVPS_MAX));
});

test("preview: a failed read is ok:false, never an empty list that reads as 'nothing to lose'", async () => {
  const { client } = fakeClient(() => ({ error: { code: "42703", message: "column events.visibility does not exist" } }));
  assert.deepEqual(await quietly(() => membersOnlyRsvpsOnLeave(client, ORG, ME)), { ok: false });
  const thrower = fakeClient(() => {
    throw new Error("socket");
  });
  assert.deepEqual(await quietly(() => membersOnlyRsvpsOnLeave(thrower.client, ORG, ME)), { ok: false });
});

test("drop: reads the same events, then deletes only my RSVPs on them; the count is Going + Interested", async () => {
  const { client, queries } = fakeClient((q) => {
    if (q.calls.some((c) => c[0] === "delete")) return { data: [{ status: "going" }, { status: "maybe" }, { status: "no" }] };
    return { data: [{ status: "going", event: ev("e1", "x") }, { status: "maybe", event: ev("e2", "x") }, { status: "no", event: ev("e3", "x") }, { status: "going", event: ev("e1", "x") }] };
  });
  assert.deepEqual(await dropMembersOnlyRsvpsOnLeave(client, ORG, ME), { ok: true, dropped: 2 });
  const [read, del] = queries;
  assert.ok(has(read, "eq", "event.org_id", ORG) && has(read, "eq", "event.visibility", "members"));
  assert.ok(read.calls.some((c) => c[0] === "gt" && c[1] === "event.ends_at"));
  assert.ok(!read.calls.some((c) => c[0] === "in" && c[1] === "status"), "every status comes off, a Can't go too");
  assert.equal(del.table, "rsvps");
  assert.ok(has(del, "eq", "user_id", ME), "never anyone else's");
  assert.ok(has(del, "in", "event_id", ["e1", "e2", "e3"]), "each event once");
  assert.equal(queries.length, 2);
});

test("drop: nothing to drop writes nothing; a failed read or delete is logged, never thrown", async () => {
  const empty = fakeClient(() => ({ data: [] }));
  assert.deepEqual(await dropMembersOnlyRsvpsOnLeave(empty.client, ORG, ME), { ok: true, dropped: 0 });
  assert.equal(empty.queries.length, 1, "no delete");
  const badRead = fakeClient(() => ({ error: { code: "57014" } }));
  assert.deepEqual(await quietly(() => dropMembersOnlyRsvpsOnLeave(badRead.client, ORG, ME)), { ok: false, dropped: 0 });
  assert.equal(badRead.queries.length, 1);
  const badDelete = fakeClient((q) => (q.calls.some((c) => c[0] === "delete") ? { error: { code: "57014" } } : { data: [{ status: "going", event: ev("e1", "x") }] }));
  assert.deepEqual(await quietly(() => dropMembersOnlyRsvpsOnLeave(badDelete.client, ORG, ME)), { ok: false, dropped: 0 });
  const thrower = fakeClient(() => {
    throw new Error("socket");
  });
  assert.deepEqual(await quietly(() => dropMembersOnlyRsvpsOnLeave(thrower.client, ORG, ME)), { ok: false, dropped: 0 });
});

test("drop: the read is capped, so the delete's id list stays short", async () => {
  const { client, queries } = fakeClient((q) => (q.calls.some((c) => c[0] === "delete") ? { data: [] } : { data: [{ status: "going", event: ev("e1", "x") }] }));
  await dropMembersOnlyRsvpsOnLeave(client, ORG, ME);
  assert.ok(has(queries[0], "limit", LEAVE_RSVPS_MAX));
  assert.equal(LEAVE_RSVPS_MAX, 100);
});

// Review, Oct 22, 2026: one capped read left everything past the first page.
test("drop: a full page reads again until a short one, so nothing past the cap is left behind", async () => {
  // The fake's "database": 130 Going RSVPs; each delete takes its ids out.
  let left = Array.from({ length: 130 }, (_, i) => `e${i}`);
  const { client, queries } = fakeClient((q) => {
    const del = q.calls.find((c) => c[0] === "in" && c[1] === "event_id");
    if (del) {
      const ids = del[2] as string[];
      left = left.filter((id) => !ids.includes(id));
      return { data: ids.map(() => ({ status: "going" })) };
    }
    return { data: left.slice(0, LEAVE_RSVPS_MAX).map((id) => ({ status: "going", event: ev(id, "x") })) };
  });
  assert.deepEqual(await dropMembersOnlyRsvpsOnLeave(client, ORG, ME), { ok: true, dropped: 130 });
  assert.equal(left.length, 0);
  assert.equal(queries.length, 4, "read 100, delete, read 30, delete; the short page ends it");
  for (const q of queries.filter((x) => x.calls.some((c) => c[0] === "delete"))) assert.ok(has(q, "eq", "user_id", ME));
});

test("drop: the pages are bounded, and a delete that takes nothing stops them", async () => {
  const full = () => ({ data: Array.from({ length: LEAVE_RSVPS_MAX }, (_, i) => ({ status: "going", event: ev(`e${i}`, "x") })) });
  const stuck = fakeClient((q) => (q.calls.some((c) => c[0] === "delete") ? { data: [] } : full()));
  assert.deepEqual(await dropMembersOnlyRsvpsOnLeave(stuck.client, ORG, ME), { ok: true, dropped: 0 });
  assert.equal(stuck.queries.length, 2, "nothing came off: no second read");
  const endless = fakeClient((q) => (q.calls.some((c) => c[0] === "delete") ? { data: [{ status: "going" }] } : full()));
  assert.deepEqual(await dropMembersOnlyRsvpsOnLeave(endless.client, ORG, ME), { ok: true, dropped: LEAVE_DROP_ROUNDS });
  assert.equal(endless.queries.length, LEAVE_DROP_ROUNDS * 2);
  // A later page failing keeps the count of what already came off.
  let reads = 0;
  const late = fakeClient((q) => {
    if (q.calls.some((c) => c[0] === "delete")) return { data: [{ status: "going" }, { status: "maybe" }] };
    reads += 1;
    return reads === 1 ? full() : { error: { code: "57014" } };
  });
  assert.deepEqual(await quietly(() => dropMembersOnlyRsvpsOnLeave(late.client, ORG, ME)), { ok: false, dropped: 2 });
});
