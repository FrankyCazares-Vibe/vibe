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
 * builder call and resolves the insert to one configured `{ error, count }`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./mentions.ts";
const { MAX_MENTION_NOTIFICATIONS, extractMentionHandles, insertMentionNotifications } =
  (await import(specifier)) as typeof import("./mentions");

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

/** A fake writer. `from` and `insert` calls are recorded; the insert resolves
 *  to `result`. */
function fakeWriter(result: { error: unknown; count?: number | null }) {
  const calls: unknown[][] = [];
  const writer = {
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
  return { writer: writer as unknown as Writer, calls };
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
  const { writer, calls } = fakeWriter({ error: null, count: 20 });

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
  const { writer, calls } = fakeWriter({ error: null, count: 0 });
  const out = await insertMentionNotifications(writer, {
    actorId: ACTOR,
    targetUserIds: [],
    kind: "post",
    postId: POST,
  });
  assert.deepEqual(out, { inserted: 0, skipped: false });
  assert.equal(calls.length, 0);
});

test("a list holding only the actor makes no query", async () => {
  const { writer, calls } = fakeWriter({ error: null, count: 0 });
  const out = await insertMentionNotifications(writer, {
    actorId: ACTOR,
    targetUserIds: [ACTOR, ACTOR],
    kind: "message",
    messageId: MESSAGE,
  });
  assert.deepEqual(out, { inserted: 0, skipped: false });
  assert.equal(calls.length, 0);
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
