/**
 * Tests for `dm-bridge.ts` (handoffs/chat-redesign/wave-3-desktop/contract.md
 * 5.3): the guards on what the page says, the shape of what the shell says,
 * the frame check, the frame's URL.
 *
 * Run with:
 *   node --test src/components/desktop/messages/dm-bridge.test.ts
 *
 * The file has no imports, so it loads through a dynamic import of its ".ts"
 * path. The specifier goes through a variable because tsc refuses a literal
 * ".ts" specifier (the push/config.test.ts pattern).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

const specifier = "./dm-bridge.ts";
const bridge = (await import(specifier)) as typeof import("./dm-bridge");
type DmPageEvent = import("./dm-bridge").DmPageEvent;
type DmShellCommand = import("./dm-bridge").DmShellCommand;

/** What the page's `__paneSay` puts on the wire (5.2 item 1). */
const say = (type: string, extra: Record<string, unknown> = {}) => ({ source: "vibe-dm", v: 1, type, ...extra });

test("paneSrc: the one frame URL, with app, embedded, pane and the version; never `to` or `channel`", () => {
  assert.equal(bridge.DM_BRIDGE_VERSION, 1);
  const src = bridge.paneSrc();
  assert.equal(src, "/html/messages.html?app=1&embedded=1&pane=1&v=1");
  const q = new URLSearchParams(src.split("?")[1]);
  assert.equal(q.get("app"), "1");
  assert.equal(q.get("embedded"), "1");
  assert.equal(q.get("pane"), "1");
  assert.equal(q.get("v"), String(bridge.DM_BRIDGE_VERSION));
  assert.equal(q.has("to"), false);
  assert.equal(q.has("channel"), false);
  // The page's own test for pane mode (5.1) must match it.
  assert.ok(/[?&]pane=1(&|$)/.test(src.slice(src.indexOf("?"))));
  assert.equal(bridge.paneSrc(), src);
});

test("parsePageEvent: every type, given back with its pinned fields only", () => {
  const cases: DmPageEvent[] = [
    { type: "ready" },
    { type: "opened", channelId: "c1", kind: "dm", isRequest: false },
    { type: "opened", channelId: "c1", kind: "group", isRequest: true },
    { type: "open-failed", channelId: "c1", message: "Couldn't open this chat." },
    { type: "read", channelId: "c1" },
    { type: "activity", channelId: "c1", reason: "sent" },
    { type: "activity", channelId: "c1", reason: "received" },
    { type: "list-changed" },
    { type: "escape" },
    { type: "info-opened" },
    { type: "pins-toggle", channelId: "c1" },
    { type: "pins-changed", channelId: "c1" },
    { type: "jump-missed", messageId: "m1" },
  ];
  for (const event of cases) {
    const { type, ...fields } = event;
    assert.deepEqual(bridge.parsePageEvent(say(type, fields)), event, type);
    // Anything else on the message is dropped, not passed on.
    assert.deepEqual(bridge.parsePageEvent(say(type, { ...fields, extra: "x", html: "<b>" })), event, `${type} + extras`);
  }
});

test("parsePageEvent: closed with each of its five reasons; an unknown or missing reason is null", () => {
  for (const reason of ["declined", "blocked", "deleted", "left", "lost"] as const) {
    assert.deepEqual(bridge.parsePageEvent(say("closed", { channelId: "c1", reason })), { type: "closed", channelId: "c1", reason });
  }
  assert.equal(bridge.parsePageEvent(say("closed", { channelId: "c1", reason: "kicked" })), null);
  assert.equal(bridge.parsePageEvent(say("closed", { channelId: "c1", reason: "" })), null);
  assert.equal(bridge.parsePageEvent(say("closed", { channelId: "c1" })), null);
  assert.equal(bridge.parsePageEvent(say("closed", { channelId: "c1", reason: 1 })), null);
  assert.equal(bridge.parsePageEvent(say("closed", { reason: "lost" })), null);
});

test("parsePageEvent: a wrong source, a wrong version or no object at all is null", () => {
  assert.equal(bridge.parsePageEvent({ source: "vibe-shell", v: 1, type: "ready" }), null);
  assert.equal(bridge.parsePageEvent({ source: "someone-else", v: 1, type: "ready" }), null);
  assert.equal(bridge.parsePageEvent({ v: 1, type: "ready" }), null);
  assert.equal(bridge.parsePageEvent({ source: "vibe-dm", v: 2, type: "ready" }), null);
  assert.equal(bridge.parsePageEvent({ source: "vibe-dm", v: "1", type: "ready" }), null);
  assert.equal(bridge.parsePageEvent({ source: "vibe-dm", type: "ready" }), null);
  for (const data of [null, undefined, "ready", 1, true, [], () => {}]) assert.equal(bridge.parsePageEvent(data), null);
  // The cursor bridge and the other frames' messages share the window (D13): not ours.
  assert.equal(bridge.parsePageEvent({ type: "vibe-cursor", x: 1, y: 2 }), null);
});

test("parsePageEvent: an unknown type, or a shell command played back, is null", () => {
  assert.equal(bridge.parsePageEvent(say("opened-ish")), null);
  assert.equal(bridge.parsePageEvent({ source: "vibe-dm", v: 1 }), null);
  assert.equal(bridge.parsePageEvent(say("open", { channelId: "c1" })), null);
  assert.equal(bridge.parsePageEvent(say("close")), null);
  assert.equal(bridge.parsePageEvent(say("jump", { messageId: "m1" })), null);
  assert.equal(bridge.parsePageEvent(say("panel-state", { open: true })), null);
  assert.equal(bridge.parsePageEvent(say("toString")), null);
});

test("parsePageEvent: a missing or mistyped field is null", () => {
  const bad: [string, Record<string, unknown>][] = [
    ["opened", {}],
    ["opened", { channelId: "c1", kind: "dm" }],
    ["opened", { channelId: "c1", kind: "dm", isRequest: "false" }],
    ["opened", { channelId: "c1", kind: "org", isRequest: false }],
    ["opened", { channelId: 7, kind: "dm", isRequest: false }],
    ["opened", { channelId: "", kind: "dm", isRequest: false }],
    ["open-failed", { channelId: "c1" }],
    ["open-failed", { channelId: "c1", message: null }],
    ["open-failed", { message: "no" }],
    ["read", {}],
    ["read", { channelId: null }],
    ["read", { channelId: ["c1"] }],
    ["activity", { channelId: "c1" }],
    ["activity", { channelId: "c1", reason: "typed" }],
    ["activity", { reason: "sent" }],
    ["pins-toggle", {}],
    ["pins-toggle", { channelId: 1 }],
    ["pins-changed", {}],
    ["pins-changed", { channelId: {} }],
    ["jump-missed", {}],
    ["jump-missed", { messageId: 12 }],
    ["jump-missed", { channelId: "c1" }],
  ];
  for (const [type, fields] of bad) assert.equal(bridge.parsePageEvent(say(type, fields)), null, `${type} ${JSON.stringify(fields)}`);
});

test("shellMessage: every command under the shell's source and version", () => {
  const commands: DmShellCommand[] = [
    { type: "open", channelId: "c1" },
    { type: "close" },
    { type: "jump", messageId: "m1" },
    { type: "pins-changed", channelId: "c1" },
    { type: "panel-state", open: true },
    { type: "panel-state", open: false },
  ];
  for (const command of commands) {
    const before = { ...command };
    assert.deepEqual(bridge.shellMessage(command), { source: "vibe-shell", v: 1, ...command });
    assert.deepEqual(command, before, "the command itself is not written to");
  }
  // What the shell says is never taken for something the page said.
  assert.equal(bridge.parsePageEvent(bridge.shellMessage({ type: "pins-changed", channelId: "c1" })), null);
});

test("fromFrame: our origin AND the frame's own window, nothing less", () => {
  const frame = { name: "frame" };
  const other = { name: "other" };
  const origin = "http://localhost:3000";
  assert.equal(bridge.fromFrame({ origin, source: frame }, origin, frame), true);
  assert.equal(bridge.fromFrame({ origin: "https://evil.example", source: frame }, origin, frame), false);
  assert.equal(bridge.fromFrame({ origin, source: other }, origin, frame), false);
  assert.equal(bridge.fromFrame({ origin: "null", source: frame }, origin, frame), false);
  assert.equal(bridge.fromFrame({ origin: "", source: frame }, origin, frame), false);
  // No frame yet: an event with no source must not pass as "the same nothing".
  assert.equal(bridge.fromFrame({ origin, source: null }, origin, null), false);
  assert.equal(bridge.fromFrame({ origin, source: undefined }, origin, undefined), false);
  assert.equal(bridge.fromFrame({ origin, source: null }, origin, frame), false);
});
