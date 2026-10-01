/**
 * Tests for `latest-per-room.ts` (S71 amendment 2, section 3): the call to
 * `chat_latest_per_channel`, its chunks of 500, and the fallback to today's
 * shared window on a database without migration C, against a fake client.
 * The function itself (k rows per room, RLS as the caller) is tested in SQL
 * by scripts/sql/chat-latest-check.sql.
 *
 * Run with:
 *   node --test src/lib/chat/latest-per-room.test.ts
 *
 * The resolve hook adds `.ts` to the module's extensionless `./schema`.
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
if (typeof registerHooks !== "function") throw new Error("latest-per-room.test.ts needs Node >= 22.15 (module.registerHooks)");
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = "./latest-per-room.ts";
const { readLatestPerRoom, LATEST_IDS_PER_CALL, LATEST_ROWS_PER_CALL, LATEST_PER_ROOM_FN, idsPerCall } = (await import(specifier)) as typeof import("./latest-per-room");
type Client = Parameters<typeof readLatestPerRoom>[0];

type Call = unknown[];
type Answer = { data?: unknown; error?: unknown };
type RpcArgs = { p_channels: string[]; p_per: number; p_top_level_only: boolean; p_live_only: boolean };

/** A client whose `rpc()` chain logs every call and answers `answer(args, n)` (n = the nth rpc call). */
function fakeClient(answer: (args: RpcArgs, n: number) => Answer) {
  const log: { fn: string; calls: Call[] }[] = [];
  const client = {
    rpc(fn: string, args: RpcArgs) {
      const n = log.length;
      const calls: Call[] = [["rpc", args]];
      log.push({ fn, calls });
      const builder: Record<string, unknown> = {};
      for (const m of ["select", "order"]) {
        builder[m] = (...a: unknown[]) => {
          calls.push([m, ...a]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => {
            const a = answer(args, n);
            return { data: a.data ?? null, error: a.error ?? null };
          })
          .then(resolve, reject);
      return builder;
    },
    from() {
      throw new Error("the helper never reads a table itself");
    },
  };
  return { client: client as unknown as Client, log };
}

/** Today's read, counted. */
function window(answer: Answer = { data: [{ channel_id: "w", created_at: "t" }] }) {
  const called = { n: 0 };
  const read = () => {
    called.n += 1;
    return Promise.resolve({ data: answer.data ?? null, error: (answer.error ?? null) as never });
  };
  return { read, called };
}

const MISSING_FN = { code: "PGRST202", message: "Could not find the function public.chat_latest_per_channel(p_channels, p_live_only, p_per, p_top_level_only) in the schema cache" };
const NO_FN_PG = { code: "42883", message: "function public.chat_latest_per_channel(uuid[], integer, boolean, boolean) does not exist" };
const BOOM = { code: "XX000", message: "boom" };
const DENIED = { code: "42501", message: "permission denied for function chat_latest_per_channel" };
const SELECT = "id, channel_id, content, created_at, user_id, kind, thread_root_id, users:users!messages_user_id_fkey(name)";
const opts = (over: Partial<Parameters<typeof readLatestPerRoom>[1]> = {}) => ({
  ids: ["a", "b"],
  per: 5,
  topLevelOnly: true,
  liveOnly: true,
  select: SELECT,
  tag: `test ${Math.random()}`,
  ...over,
});
const silenceWarn = (t: TestContext) => t.mock.method(console, "warn", () => {});

test("the function: one call, the four arguments, the caller's select list and newest first", async () => {
  const rows = [
    { channel_id: "a", created_at: "2026-10-01T12:00:00+00:00" },
    { channel_id: "b", created_at: "2026-10-01T11:00:00+00:00" },
  ];
  const { client, log } = fakeClient(() => ({ data: rows }));
  const shared = window();
  const res = await readLatestPerRoom(client, opts({ topLevelOnly: false, liveOnly: true, per: 3 }), shared.read);
  assert.deepEqual(res, { data: rows, error: null, perRoom: true });
  assert.equal(shared.called.n, 0, "today's window is not read when the function answers");
  assert.equal(LATEST_PER_ROOM_FN, "chat_latest_per_channel");
  assert.deepEqual(log, [
    {
      fn: "chat_latest_per_channel",
      calls: [
        ["rpc", { p_channels: ["a", "b"], p_per: 3, p_top_level_only: false, p_live_only: true }],
        ["select", SELECT],
        ["order", "created_at", { ascending: false }],
      ],
    },
  ]);
});

test("no ids: no call at all", async () => {
  const { client, log } = fakeClient(() => ({ data: [] }));
  const shared = window();
  assert.deepEqual(await readLatestPerRoom(client, opts({ ids: [] }), shared.read), { data: [], error: null, perRoom: true });
  assert.equal(log.length, 0);
  assert.equal(shared.called.n, 0);
});

test("ids are deduped and chunked by the row cap (1000 rows a call), never past 500 ids; rows come back from every chunk", async () => {
  assert.equal(LATEST_IDS_PER_CALL, 500);
  assert.equal(LATEST_ROWS_PER_CALL, 1000);
  // per 5 -> 200 ids a call, per 3 -> 333, per 1 or 2 -> 500 (the function's own cap), per 20 -> 50.
  assert.deepEqual([1, 2, 3, 5, 20, 0, 99].map(idsPerCall), [500, 500, 333, 200, 50, 500, 50]);
  const ids = Array.from({ length: 1201 }, (_, i) => `room-${i}`);
  const run = async (per: number) => {
    const { client, log } = fakeClient((args) => ({ data: args.p_channels.map((id) => ({ channel_id: id })) }));
    const res = await readLatestPerRoom(client, opts({ ids: [...ids, "room-0", "room-700"], per }), window().read);
    return { res, log };
  };
  const five = await run(5);
  assert.deepEqual(five.log.map((l) => (l.calls[0][1] as RpcArgs).p_channels.length), [200, 200, 200, 200, 200, 200, 1]);
  assert.ok(five.log.every((l) => (l.calls[0][1] as RpcArgs).p_channels.length * 5 <= LATEST_ROWS_PER_CALL), "no chunk can exceed the row cap");
  assert.deepEqual(five.log.flatMap((l) => (l.calls[0][1] as RpcArgs).p_channels), ids, "each id once, in order");
  assert.equal(five.res.perRoom, true);
  assert.equal(five.res.error, null);
  assert.deepEqual((five.res.data as { channel_id: string }[]).map((r) => r.channel_id), ids, "a room's rows never span two chunks");
  const one = await run(1);
  assert.deepEqual(one.log.map((l) => (l.calls[0][1] as RpcArgs).p_channels.length), [500, 500, 201]);
});

test("a missing function (PGRST202 or 42883) runs today's shared window instead, once, and says so once per tag", async (t) => {
  for (const missing of [MISSING_FN, NO_FN_PG]) {
    const warn = silenceWarn(t);
    const tag = `test missing ${missing.code}`;
    const { client, log } = fakeClient(() => ({ error: missing }));
    const shared = window({ data: [{ channel_id: "a", created_at: "t" }] });
    const res = await readLatestPerRoom(client, opts({ tag }), shared.read);
    assert.deepEqual(res, { data: [{ channel_id: "a", created_at: "t" }], error: null, perRoom: false });
    assert.equal(shared.called.n, 1);
    assert.equal(log.length, 1);
    await readLatestPerRoom(client, opts({ tag }), shared.read);
    assert.equal(shared.called.n, 2, "every request still falls back");
    assert.equal(warn.mock.callCount(), 1, "the warning is logged once per tag");
    assert.match(String(warn.mock.calls[0].arguments[0]), new RegExp(`^\\[${tag}\\] `));
    warn.mock.restore();
  }
});

test("the fallback's own error is handed back for the caller's handling (data null)", async (t) => {
  silenceWarn(t);
  const { client } = fakeClient(() => ({ error: MISSING_FN }));
  const shared = window({ error: BOOM });
  assert.deepEqual(await readLatestPerRoom(client, opts(), shared.read), { data: null, error: BOOM, perRoom: false });
  const empty = window({ data: null });
  assert.deepEqual(await readLatestPerRoom(client, opts(), empty.read), { data: [], error: null, perRoom: false });
});

test("any other error is handed back as it is: no fallback, no warning (today's error handling)", async (t) => {
  const warn = silenceWarn(t);
  for (const err of [BOOM, DENIED]) {
    const { client } = fakeClient(() => ({ error: err }));
    const shared = window();
    assert.deepEqual(await readLatestPerRoom(client, opts(), shared.read), { data: null, error: err, perRoom: true });
    assert.equal(shared.called.n, 0);
  }
  assert.equal(warn.mock.callCount(), 0);
});

test("chunks: one missing answer falls back for all; one failed chunk fails the read", async (t) => {
  silenceWarn(t);
  const ids = Array.from({ length: 600 }, (_, i) => `r${i}`);
  const half = fakeClient((_, n) => (n === 1 ? { error: MISSING_FN } : { data: [{ channel_id: "r0" }] }));
  const shared = window({ data: [{ channel_id: "shared" }] });
  assert.deepEqual(await readLatestPerRoom(half.client, opts({ ids }), shared.read), { data: [{ channel_id: "shared" }], error: null, perRoom: false });
  const failed = fakeClient((_, n) => (n === 1 ? { error: BOOM } : { data: [{ channel_id: "r0" }] }));
  assert.deepEqual(await readLatestPerRoom(failed.client, opts({ ids }), window().read), { data: null, error: BOOM, perRoom: true });
});
