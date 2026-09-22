/**
 * Tests for `mentions.ts`: handle parsing and the mention fan-out writer
 * (`handoffs/wave-plan-week1/T2.md` A4 and Acceptance 1).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/mentions.test.ts
 *
 * The module has only an `import type` line, which type stripping erases, so
 * it loads through a dynamic import of its ".ts" path, the same pattern as
 * `src/lib/safety/pair-block.test.ts`. The specifier goes through a variable
 * because tsc refuses a literal ".ts" specifier. The fake writer records every
 * builder call and resolves the insert to one configured `{ error, count }`;
 * its `rpc` plays rate_limit_hit for the per-sender mention budget.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./mentions.ts";
const {
  MAX_MENTION_NOTIFICATIONS,
  MENTION_BUDGET,
  MENTION_BUDGET_WINDOW_SEC,
  extractMentionHandles,
  insertMentionNotifications,
} = (await import(specifier)) as typeof import("./mentions");

type Writer = Parameters<typeof insertMentionNotifications>[0];
type Row = {
  user_id: string;
  actor_id: string;
  type: string;
  post_id: string | null;
  message_id: string | null;
};

const ACTOR = "df5ab44e-0000-4000-8000-000000000001";
const POST = "5c1e0f2a-0000-4000-8000-000000000009";
const MESSAGE = "7d2e1f3b-0000-4000-8000-00000000000a";

function uid(n: number): string {
  return `923896fb-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

type RpcArgs = { p_key: string; p_limit: number; p_window_seconds: number };
type RpcResult = { data: unknown; error: unknown };
type Limiter = (args: RpcArgs) => RpcResult | Promise<RpcResult>;

/** A stand-in for rate_limit_hit: bumps one counter per call and answers
 *  whether the new count is still within the limit, as the SQL does.
 *  `used` is how much of the budget the sender had already spent. */
function counter(used: number): Limiter {
  let count = used;
  return (args) => {
    count += 1;
    return { data: count <= args.p_limit, error: null };
  };
}

/** A fake writer. `from` and `insert` calls are recorded in `calls`; the
 *  insert resolves to `result`. `rpc` calls go to `rpcCalls` (kept apart so
 *  the insert assertions read the same with or without a budget check) and
 *  answer from `limiter`, a fresh budget by default. `limiter: null` builds
 *  a writer with no `rpc` at all. */
function fakeWriter(
  result: { error: unknown; count?: number | null },
  limiter: Limiter | null = counter(0),
) {
  const calls: unknown[][] = [];
  const rpcCalls: [string, RpcArgs][] = [];
  const writer: Record<string, unknown> = {
    from(table: string) {
      calls.push(["from", table]);
      return {
        insert(rows: unknown, opts: unknown) {
          calls.push(["insert", rows, opts]);
          return Promise.resolve(result);
        },
      };
    },
  };
  if (limiter) {
    writer.rpc = (fn: string, args: RpcArgs) => {
      rpcCalls.push([fn, args]);
      return limiter(args);
    };
  }
  return { writer: writer as unknown as Writer, calls, rpcCalls };
}

/** Runs `fn` with console.error and console.warn captured. */
async function withLogs<T>(fn: () => Promise<T>) {
  const originalError = console.error;
  const originalWarn = console.warn;
  const errors: unknown[][] = [];
  const warns: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  console.warn = (...args: unknown[]) => {
    warns.push(args);
  };
  try {
    const out = await fn();
    return { out, errors, warns };
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
}

function insertedRows(calls: unknown[][]): Row[] {
  const insert = calls.find((c) => c[0] === "insert");
  assert.ok(insert, "expected an insert call");
  return insert[1] as Row[];
}

test("extractMentionHandles lowercases and dedupes", () => {
  assert.deepEqual(extractMentionHandles("hi @Bob and @bob"), ["bob"]);
});

test("extractMentionHandles skips emails and too-short handles", () => {
  assert.deepEqual(extractMentionHandles("mail a@b.com"), []);
  assert.deepEqual(extractMentionHandles("@ab"), []);
  assert.deepEqual(extractMentionHandles(""), []);
});

test("the cap is 20", () => {
  assert.equal(MAX_MENTION_NOTIFICATIONS, 20);
});

test("25 targets with the actor and a duplicate write exactly 20 rows, none to the actor", async () => {
  const targets = [ACTOR, uid(1), uid(1)];
  for (let i = 2; i <= 23; i++) targets.push(uid(i));
  assert.equal(targets.length, 25);
  const { writer, calls, rpcCalls } = fakeWriter({ error: null, count: 20 });

  const out = await insertMentionNotifications(writer, {
    actorId: ACTOR,
    targetUserIds: targets,
    kind: "post",
    postId: POST,
  });

  assert.deepEqual(out, { inserted: 20, skipped: false });
  assert.deepEqual(calls[0], ["from", "notifications"]);
  const rows = insertedRows(calls);
  assert.equal(rows.length, 20);
  assert.equal(new Set(rows.map((r) => r.user_id)).size, 20);
  for (const r of rows) {
    assert.notEqual(r.user_id, ACTOR);
    assert.equal(r.actor_id, ACTOR);
    assert.equal(r.type, "mention");
  }
  // Order is kept: the first 20 distinct non-actor ids.
  assert.equal(rows[0]!.user_id, uid(1));
  assert.equal(rows[19]!.user_id, uid(20));
  assert.deepEqual(calls[1]![2], { count: "exact" });
  // Budget is spent after the filter: one unit per row, none for the actor,
  // the duplicate or anyone past the cap.
  assert.equal(rpcCalls.length, 20);
});

test("kind post sets post_id and nulls message_id", async () => {
  const { writer, calls } = fakeWriter({ error: null, count: 1 });
  await insertMentionNotifications(writer, {
    actorId: ACTOR,
    targetUserIds: [uid(1)],
    kind: "post",
    postId: POST,
    messageId: MESSAGE,
  });
  assert.deepEqual(insertedRows(calls), [
    { user_id: uid(1), actor_id: ACTOR, type: "mention", post_id: POST, message_id: null },
  ]);
});

test("kind message sets message_id and nulls post_id", async () => {
  const { writer, calls } = fakeWriter({ error: null, count: 1 });
  await insertMentionNotifications(writer, {
    actorId: ACTOR,
    targetUserIds: [uid(1)],
    kind: "message",
    postId: POST,
    messageId: MESSAGE,
  });
  assert.deepEqual(insertedRows(calls), [
    { user_id: uid(1), actor_id: ACTOR, type: "mention", post_id: null, message_id: MESSAGE },
  ]);
});

test("an empty list makes no query", async () => {
  const { writer, calls, rpcCalls } = fakeWriter({ error: null, count: 0 });
  const out = await insertMentionNotifications(writer, {
    actorId: ACTOR,
    targetUserIds: [],
    kind: "post",
    postId: POST,
  });
  assert.deepEqual(out, { inserted: 0, skipped: false });
  assert.equal(calls.length, 0);
  assert.equal(rpcCalls.length, 0);
});

test("a list holding only the actor makes no query", async () => {
  const { writer, calls, rpcCalls } = fakeWriter({ error: null, count: 0 });
  const out = await insertMentionNotifications(writer, {
    actorId: ACTOR,
    targetUserIds: [ACTOR, ACTOR],
    kind: "message",
    messageId: MESSAGE,
  });
  assert.deepEqual(out, { inserted: 0, skipped: false });
  assert.equal(calls.length, 0);
  assert.equal(rpcCalls.length, 0);
});

test("a check-constraint error is reported as skipped", async () => {
  const { writer } = fakeWriter({
    error: { message: 'new row violates check constraint "notifications_type_check"' },
  });
  const out = await insertMentionNotifications(writer, {
    actorId: ACTOR,
    targetUserIds: [uid(1)],
    kind: "post",
    postId: POST,
  });
  assert.deepEqual(out, { inserted: 0, skipped: true });
});

test("any other error is logged and not skipped", async () => {
  const { writer } = fakeWriter({
    error: { message: 'permission denied for table notifications', code: "42501" },
  });
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const out = await insertMentionNotifications(writer, {
      actorId: ACTOR,
      targetUserIds: [uid(1)],
      kind: "post",
      postId: POST,
    });
    assert.deepEqual(out, { inserted: 0, skipped: false });
  } finally {
    console.error = originalError;
  }
  assert.equal(logged.length, 1);
  assert.equal(logged[0]![0], "[mentions.insertNotifications]");
});

// The per-sender budget.

test("the budget is 60 an hour", () => {
  assert.equal(MENTION_BUDGET, 60);
  assert.equal(MENTION_BUDGET_WINDOW_SEC, 3600);
});

test("under the budget every target is written, one check each on the sender's key", async () => {
  const { writer, calls, rpcCalls } = fakeWriter({ error: null, count: 5 }, counter(10));
  const targets = [uid(1), uid(2), uid(3), uid(4), uid(5)];
  const { out, errors, warns } = await withLogs(() =>
    insertMentionNotifications(writer, {
      actorId: ACTOR,
      targetUserIds: targets,
      kind: "message",
      messageId: MESSAGE,
    }),
  );
  assert.deepEqual(out, { inserted: 5, skipped: false });
  assert.deepEqual(
    insertedRows(calls).map((r) => r.user_id),
    targets,
  );
  assert.equal(rpcCalls.length, 5);
  for (const [fn, args] of rpcCalls) {
    assert.equal(fn, "rate_limit_hit");
    assert.deepEqual(args, {
      p_key: `mention:${ACTOR}`,
      p_limit: 60,
      p_window_seconds: 3600,
    });
  }
  assert.equal(errors.length, 0);
  assert.equal(warns.length, 0);
});

test("landing exactly on the budget writes them all; the next one is dropped", async () => {
  // 40 already spent + 20 now = 60: the last one is still inside.
  const limiter = counter(40);
  const first = fakeWriter({ error: null, count: 20 }, limiter);
  const targets = Array.from({ length: 20 }, (_, i) => uid(i + 1));
  const a = await withLogs(() =>
    insertMentionNotifications(first.writer, {
      actorId: ACTOR,
      targetUserIds: targets,
      kind: "post",
      postId: POST,
    }),
  );
  assert.deepEqual(a.out, { inserted: 20, skipped: false });
  assert.equal(insertedRows(first.calls).length, 20);
  assert.equal(a.warns.length, 0);

  // Same sender, same window, budget now spent: nothing is inserted at all.
  const second = fakeWriter({ error: null, count: 0 }, limiter);
  const b = await withLogs(() =>
    insertMentionNotifications(second.writer, {
      actorId: ACTOR,
      targetUserIds: [uid(21)],
      kind: "post",
      postId: POST,
    }),
  );
  assert.deepEqual(b.out, { inserted: 0, skipped: false });
  assert.equal(second.rpcCalls.length, 1);
  assert.equal(second.calls.length, 0);
  assert.equal(b.warns.length, 1);
  assert.equal(b.errors.length, 0);
});

test("over the budget writes the first ones that fit and logs once", async () => {
  // 55 spent, 10 asked: 5 fit. The first five mentioned are the ones kept.
  const { writer, calls, rpcCalls } = fakeWriter({ error: null, count: 5 }, counter(55));
  const targets = Array.from({ length: 10 }, (_, i) => uid(i + 1));
  const { out, errors, warns } = await withLogs(() =>
    insertMentionNotifications(writer, {
      actorId: ACTOR,
      targetUserIds: targets,
      kind: "post",
      postId: POST,
    }),
  );
  assert.deepEqual(out, { inserted: 5, skipped: false });
  assert.deepEqual(
    insertedRows(calls).map((r) => r.user_id),
    targets.slice(0, 5),
  );
  assert.equal(rpcCalls.length, 10);
  assert.equal(warns.length, 1);
  assert.equal(warns[0]![0], "[mentions.budget] over the hourly mention budget; dropped");
  assert.deepEqual(warns[0]![1], { kind: "post", dropped: 5 });
  assert.equal(errors.length, 0);
});


test("a limiter that errors lets everyone through and logs once", async () => {
  const failing: Limiter = () => ({
    data: null,
    error: { message: "function rate_limit_hit does not exist" },
  });
  const { writer, calls, rpcCalls } = fakeWriter({ error: null, count: 3 }, failing);
  const { out, errors, warns } = await withLogs(() =>
    insertMentionNotifications(writer, {
      actorId: ACTOR,
      targetUserIds: [uid(1), uid(2), uid(3)],
      kind: "post",
      postId: POST,
    }),
  );
  assert.deepEqual(out, { inserted: 3, skipped: false });
  assert.equal(insertedRows(calls).length, 3);
  assert.equal(rpcCalls.length, 3);
  // One line for the whole call, not one per failed check.
  assert.equal(errors.length, 1);
  assert.equal(errors[0]![0], "[mentions.budget] rate_limit_hit failed; allowing");
  assert.deepEqual(errors[0]![1], {
    failures: 3,
    error: "function rate_limit_hit does not exist",
  });
  assert.equal(warns.length, 0);
});

test("a limiter that throws never throws out and lets everyone through", async () => {
  const throwing: Limiter = () => {
    throw new Error("fetch failed");
  };
  const { writer, calls } = fakeWriter({ error: null, count: 2 }, throwing);
  const { out, errors } = await withLogs(() =>
    insertMentionNotifications(writer, {
      actorId: ACTOR,
      targetUserIds: [uid(1), uid(2)],
      kind: "message",
      messageId: MESSAGE,
    }),
  );
  assert.deepEqual(out, { inserted: 2, skipped: false });
  assert.equal(insertedRows(calls).length, 2);
  assert.equal(errors.length, 1);
});

test("a failed check still counts as allowed next to a no", async () => {
  // Calls go out in target order here: yes, error, no.
  const answers: RpcResult[] = [
    { data: true, error: null },
    { data: null, error: { message: "timeout" } },
    { data: false, error: null },
  ];
  let i = 0;
  const mixed: Limiter = () => answers[i++]!;
  const { writer, calls } = fakeWriter({ error: null, count: 2 }, mixed);
  const { out, errors, warns } = await withLogs(() =>
    insertMentionNotifications(writer, {
      actorId: ACTOR,
      targetUserIds: [uid(1), uid(2), uid(3)],
      kind: "post",
      postId: POST,
    }),
  );
  assert.deepEqual(out, { inserted: 2, skipped: false });
  assert.deepEqual(
    insertedRows(calls).map((r) => r.user_id),
    [uid(1), uid(2)],
  );
  assert.equal(errors.length, 1);
  assert.equal(warns.length, 1);
});

test("a writer with no rpc writes everyone without logging", async () => {
  const { writer, calls } = fakeWriter({ error: null, count: 2 }, null);
  const { out, errors, warns } = await withLogs(() =>
    insertMentionNotifications(writer, {
      actorId: ACTOR,
      targetUserIds: [uid(1), uid(2)],
      kind: "post",
      postId: POST,
    }),
  );
  assert.deepEqual(out, { inserted: 2, skipped: false });
  assert.equal(insertedRows(calls).length, 2);
  assert.equal(errors.length, 0);
  assert.equal(warns.length, 0);
});

test("the budget checks run at the same time, not one after another", async () => {
  let inFlight = 0;
  let most = 0;
  const slow: Limiter = async () => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return { data: true, error: null };
  };
  const { writer } = fakeWriter({ error: null, count: 4 }, slow);
  await insertMentionNotifications(writer, {
    actorId: ACTOR,
    targetUserIds: [uid(1), uid(2), uid(3), uid(4)],
    kind: "post",
    postId: POST,
  });
  assert.equal(most, 4);
});
