/**
 * Tests for "send a code" as steps (`send-code-core.ts`): the order, and the
 * undo after a failed send. The database and the email are fakes.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/send-code-core.test.ts
 *
 * send-code-core.ts has no imports, so it loads through a dynamic import of
 * its ".ts" path, like tokens.test.ts.
 */

import assert from "node:assert/strict";
import test from "node:test";

import type { IssuedCode, SendCodeSteps } from "./send-code-core";

const specifier = "./send-code-core.ts";
const { runSendAccessCode } = (await import(specifier)) as typeof import("./send-code-core");

const ENDS = "2026-10-17T18:14:00.000Z";
const ISSUED: IssuedCode = { ok: true, code: "VIBE-7KQ2-M9XD", email: "sam@iu.edu", name: "Sam", expiresAt: ENDS };

/** Fake steps that record every call, in order. */
function fake(over: Partial<SendCodeSteps> = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const steps: SendCodeSteps = {
    mintToken: () => {
      calls.push("mint");
      return { token: "tok", hash: "a".repeat(64) };
    },
    issue: async (hash) => {
      calls.push(`issue:${hash.slice(0, 3)}`);
      return ISSUED;
    },
    send: async (issued, token) => {
      calls.push(`send:${issued.code}:${token}:${issued.expiresAt}`);
    },
    revoke: async (code) => {
      calls.push(`revoke:${code}`);
      return true;
    },
    logError: (message) => {
      logs.push(message);
    },
    ...over,
  };
  return { steps, calls, logs };
}

test("a good send: mint, issue with the token's hash, send with the token; no undo", async () => {
  const f = fake();
  assert.deepEqual(await runSendAccessCode(f.steps), { outcome: "sent" });
  // The email gets the code's real end, as the database set it.
  assert.deepEqual(f.calls, ["mint", "issue:aaa", `send:VIBE-7KQ2-M9XD:tok:${ENDS}`]);
  assert.deepEqual(f.logs, []);
});

test("a failed send revokes that very code, and says send_failed", async () => {
  const f = fake({
    send: async () => {
      throw new Error("resend said no");
    },
  });
  assert.deepEqual(await runSendAccessCode(f.steps), { outcome: "failed", reason: "send_failed" });
  assert.deepEqual(f.calls, ["mint", "issue:aaa", "revoke:VIBE-7KQ2-M9XD"]);
  assert.deepEqual(f.logs, ["[waitlist] invite failed"]);
});

test("an undo that throws or changes nothing is logged, and the answer is still send_failed", async () => {
  for (const revoke of [async () => false, async () => Promise.reject(new Error("db down"))]) {
    const f = fake({ send: async () => Promise.reject(new Error("no")), revoke });
    assert.deepEqual(await runSendAccessCode(f.steps), { outcome: "failed", reason: "send_failed" });
    assert.equal(f.logs.length, 2);
    assert.match(f.logs[1], /undo after a failed invite/);
  }
});

test("the database saying no is skipped, with its reason, and nothing is sent", async () => {
  for (const reason of ["not_found", "not_confirmed", "already_invited", "joined", "entry_expired", "entry_expiring"]) {
    const f = fake({ issue: async () => ({ ok: false, reason }) });
    assert.deepEqual(await runSendAccessCode(f.steps), { outcome: "skipped", reason });
    assert.deepEqual(f.calls, ["mint"]);
  }
});

test("a database error while issuing is store_failed, and nothing is sent or revoked", async () => {
  const f = fake({ issue: async () => Promise.reject(new Error("timeout")) });
  assert.deepEqual(await runSendAccessCode(f.steps), { outcome: "failed", reason: "store_failed" });
  assert.deepEqual(f.calls, ["mint"]);
  assert.deepEqual(f.logs, ["[waitlist] issue failed"]);
});
