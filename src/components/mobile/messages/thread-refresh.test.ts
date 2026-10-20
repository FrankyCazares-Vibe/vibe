/**
 * The phone's open dm or group, kept current (Oct 20, 2026;
 * thread-refresh.ts): when a refresh read is dropped, what it does to the
 * list, the note arriving in place, a new message, and the rows that went.
 *
 * Run with:
 *   node --test src/components/mobile/messages/thread-refresh.test.ts
 */

import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

// thread-refresh.ts imports "@/lib/chat/page-merge": the delete-rules.test.ts hook.
type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("thread-refresh.test.ts needs Node >= 22.15 (module.registerHooks)");
const SRC_ROOT = new URL("../../../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) return nextResolve(new URL(`${specifier.slice(2)}.ts`, SRC_ROOT).href, context);
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) return nextResolve(`${specifier}.ts`, context);
      throw err;
    }
  },
});

const specifier = "./thread-refresh.ts";
const { applyThreadRefresh, THREAD_REFRESH_MS, THREAD_REFRESH_STUCK_MS } = (await import(specifier)) as typeof import("./thread-refresh");

const ME = "11111111-0000-4000-8000-000000000001";
const PEER = "22222222-0000-4000-8000-000000000002";
type Row = { id: string; created_at: string; user_id: string; content: string; deleted?: boolean; reactions?: { emoji: string; count: number }[] };
const at = (minute: number) => `2026-10-20T10:${String(minute).padStart(2, "0")}:00.000000+00:00`;
const row = (id: string, minute: number, user_id: string, content: string, over: Partial<Row> = {}): Row => ({ id, created_at: at(minute), user_id, content, ...over });

const screen = (): Row[] => [row("m1", 1, PEER, "hey"), row("m2", 2, ME, "hi"), row("m3", 3, PEER, "see you at 8")];
/** The server's next answer for the same rows: new objects, the same JSON. */
const sameAgain = (rows: Row[]) => rows.map((m) => ({ ...m }));

test("the desktop pane's schedule: every 2 s, a read out for 8 s counts as settled", () => {
  assert.equal(THREAD_REFRESH_MS, 2000);
  assert.equal(THREAD_REFRESH_STUCK_MS, 8000);
});

test("dropped: a change of mine is out, the list changed since the read went out, or nothing loaded yet", () => {
  const current = screen();
  const page = sameAgain(current);
  assert.equal(applyThreadRefresh(current, current, page, ME, true), null, "busy");
  assert.equal(applyThreadRefresh(current, screen(), page, ME, false), null, "another list: a send, a reaction or a delete landed meanwhile");
  assert.equal(applyThreadRefresh(null, null, page, ME, false), null, "the first read owns an empty screen");
});

test("nothing new: the same array back, changed false (no re-render every 2 s)", () => {
  const current = screen();
  const next = applyThreadRefresh(current, current, sameAgain(current), ME, false);
  assert.ok(next);
  assert.equal(next.changed, false);
  assert.equal(next.messages, current);
  assert.equal(next.arrived, false);
  assert.deepEqual(next.goneIds, []);
});

test("the other person deleted a message: the note takes its place, its neighbours stay the same objects", () => {
  const current = screen();
  const page = sameAgain(current);
  page[2] = row("m3", 3, PEER, "", { deleted: true });
  const next = applyThreadRefresh(current, current, page, ME, false);
  assert.ok(next);
  assert.equal(next.changed, true);
  assert.deepEqual(next.messages.map((m) => [m.id, m.content, m.deleted === true]), [["m1", "hey", false], ["m2", "hi", false], ["m3", "", true]]);
  assert.equal(next.messages[0], current[0], "unchanged rows keep their objects");
  assert.equal(next.messages[1], current[1]);
  assert.deepEqual(next.goneIds, ["m3"], "a reply to it lets go, the pins are read again");
  assert.equal(next.arrived, false, "a note in place is not a new message");
});

test("a hard delete (a database without the note) or a removal: the row goes and is named", () => {
  const current = screen();
  const page = sameAgain(current).filter((m) => m.id !== "m2");
  const next = applyThreadRefresh(current, current, page, ME, false);
  assert.ok(next);
  assert.deepEqual(next.messages.map((m) => m.id), ["m1", "m3"]);
  assert.deepEqual(next.goneIds, ["m2"]);
});

test("a new message from the other person arrives at the end and marks the chat read; my own does not", () => {
  const current = screen();
  const fromPeer = applyThreadRefresh(current, current, [...sameAgain(current), row("m4", 4, PEER, "running late")], ME, false);
  assert.ok(fromPeer);
  assert.deepEqual(fromPeer.messages.map((m) => m.id), ["m1", "m2", "m3", "m4"]);
  assert.equal(fromPeer.arrived, true);
  const fromMe = applyThreadRefresh(current, current, [...sameAgain(current), row("m4", 4, ME, "sent from my laptop")], ME, false);
  assert.ok(fromMe);
  assert.equal(fromMe.arrived, false);
});

test("a reaction catches up; an unsent temp_ row and rows older than the page stay", () => {
  const older = row("m0", 0, PEER, "earlier, past the page");
  const temp = row("temp_1", 9, ME, "sending…");
  const current = [older, ...screen(), temp];
  const page = sameAgain(screen());
  page[0] = { ...page[0], reactions: [{ emoji: "❤️", count: 1 }] };
  const next = applyThreadRefresh(current, current, page, ME, false);
  assert.ok(next);
  assert.deepEqual(next.messages.map((m) => m.id), ["m0", "m1", "m2", "m3", "temp_1"]);
  assert.deepEqual(next.messages[1].reactions, [{ emoji: "❤️", count: 1 }]);
  assert.equal(next.messages[0], older);
  assert.equal(next.messages[4], temp);
  assert.deepEqual(next.goneIds, []);
});
