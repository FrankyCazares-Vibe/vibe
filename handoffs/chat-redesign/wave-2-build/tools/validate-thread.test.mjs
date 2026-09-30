/**
 * The fixture test of validate-thread.mjs (wave-2 contract 5.4, 13.3):
 *   node --test handoffs/chat-redesign/wave-2-build/tools/validate-thread.test.mjs
 *
 * Every fixture under fixtures/ (one page per room kind, one stub, one of
 * each card) passes for its role and room; a page bent in one place fails
 * naming that place; the key sets come from the real types.ts; the CLI
 * answers 0 / 1 / 2.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_TYPES, STUB_PINNED, typeKeys, validateThread } from "./validate-thread.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "validate-thread.mjs");
const fixture = (name) => JSON.parse(readFileSync(join(HERE, "fixtures", `${name}.json`), "utf8"));
const typesSource = readFileSync(DEFAULT_TYPES, "utf8");
const run = (body, role, room) => validateThread(body, { role, room, typesSource });
const clone = (v) => JSON.parse(JSON.stringify(v));

/** name → [role, room], one page per room kind, one stub, one of each card. */
const FIXTURES = {
  board: ["officer", "board"],
  lounge: ["member", "lounge"],
  event: ["member", "event"],
  dm: ["member", "dm"],
  stub: ["member", "lounge"],
  poll: ["member", "lounge"],
  signup: ["member", "lounge"],
  "event-card": ["member", "lounge"],
};

for (const [name, [role, room]] of Object.entries(FIXTURES)) {
  test(`fixture ${name} validates as ${role} in ${room}`, () => {
    const { problems, summary } = run(fixture(name), role, room);
    assert.deepEqual(problems, []);
    assert.match(summary, /^validate-thread: \d+ message\(s\)/);
  });
}

test("the summary counts messages, cards and stubs", () => {
  assert.match(run(fixture("stub"), "member", "lounge").summary, /3 message\(s\), 0 card\(s\), 0 card row\(s\) without a card, 1 stub\(s\)/);
  assert.match(run(fixture("event-card"), "member", "lounge").summary, /2 message\(s\), 2 card\(s\)/);
});

test("the key sets are read from types.ts itself", () => {
  assert.deepEqual(typeKeys(typesSource, "ViewerInRoom"), ["role", "can_post", "can_reply", "can_moderate"]);
  assert.deepEqual(typeKeys(typesSource, "EventCard"), ["type", "note", "event"]);
  assert.ok(typeKeys(typesSource, "ChatMessage").includes("hidden"));
  assert.deepEqual(typeKeys(typesSource, "ChatMessage").length, 20);
  assert.throws(() => typeKeys(typesSource, "NoSuchType"), /has no/);
  // A field added to ChatMessage in types.ts fails every fixture until the JSON carries it.
  const grown = typesSource.replace("  hidden: boolean;\n", "  hidden: boolean;\n  brand_new: string;\n");
  const { problems } = validateThread(fixture("lounge"), { role: "member", room: "lounge", typesSource: grown });
  assert.ok(problems.some((p) => p.startsWith("messages[0]: missing field(s) brand_new")), problems.join("\n"));
});

test("a stub with any pinned field off its value fails at that field (8.1)", () => {
  for (const [field, wrong] of [["content", "x"], ["user_id", "aaaaaaaa-0000-4000-8000-000000000004"], ["kind", "poll"], ["reactions", [{ emoji: "👍", count: 1, viewer_reacted: false }]], ["users", { id: "x" }], ["reply_count", 0]]) {
    const body = clone(fixture("stub"));
    body.messages[1][field] = wrong;
    const { problems } = run(body, "member", "lounge");
    assert.ok(problems.some((p) => p.startsWith(`messages[1].${field}: a stub pins`)), `${field}: ${problems.join("\n")}`);
  }
  assert.equal(Object.keys(STUB_PINNED).length, 17, "the 20 fields less id, created_at, thread_root_id");
});

test("a stub in a dm, a card in a dm, and a hidden false stub-shaped row are refused", () => {
  const dm = clone(fixture("dm"));
  dm.messages.push({ ...clone(fixture("stub")).messages[1], created_at: "2026-10-08T21:00:00+00:00" });
  assert.ok(run(dm, "member", "dm").problems.some((p) => p === "messages[2].hidden: a dm or a group never stubs"));
  const card = clone(fixture("dm"));
  card.messages[0].kind = "poll";
  card.messages[0].card = clone(fixture("poll")).messages[0].card;
  assert.ok(run(card, "member", "dm").problems.some((p) => p === "messages[0].kind: a card in a dm or a group"));
});

test("the viewer's own removed card row carries no card and is not a 3.10 row (5.2, 6.2)", () => {
  const body = clone(fixture("poll"));
  body.messages[0].user_id = body.viewer_id;
  body.messages[0].removed = { by: "officer", at: "2026-10-08T21:00:00+00:00", reason: null };
  body.messages[0].card = null;
  const { problems, summary } = run(body, "member", "lounge");
  assert.deepEqual(problems, []);
  assert.match(summary, /1 message\(s\), 0 card\(s\), 0 card row\(s\) without a card/);
  // The same row live: a card row without a card is the 3.10 count.
  body.messages[0].removed = null;
  assert.match(run(body, "member", "lounge").summary, /1 card row\(s\) without a card/);
});

test("a PollCard bent in one place fails there (5.2's rules)", () => {
  const cases = [
    ["options.1.full", true, "messages[0].card.options[1].full"],
    ["options.0.capacity", 0, "messages[0].card.options[0].capacity"],
    ["question", "", "messages[0].card.question"],
    ["type", "quiz", "messages[0].card.type"],
    ["closes_at", "2026-10-09 00:00", "messages[0].card.closes_at"],
  ];
  for (const [path, value, at] of cases) {
    const body = clone(fixture("signup"));
    body.messages[0].card.anonymous = false;
    const keys = path.split(".");
    let target = body.messages[0].card;
    for (const k of keys.slice(0, -1)) target = target[k];
    target[keys.at(-1)] = value;
    const { problems } = run(body, "member", "lounge");
    assert.ok(problems.some((p) => p.startsWith(`${at}:`)), `${path}: ${problems.join("\n")}`);
  }
  const poll = clone(fixture("poll"));
  poll.messages[0].card.options[0].voters = [{ id: "aaaaaaaa-0000-4000-8000-000000000001", handle: "v", name: "V", avatar_url: null }];
  assert.ok(run(poll, "member", "lounge").problems.some((p) => p === "messages[0].card.options[0].voters: an anonymous poll names nobody"));
  // A poll names 12 at most; a sign-up names them all (13 voters on a slot of capacity 50 is fine).
  const many = Array.from({ length: 13 }, (_, i) => ({ id: `aaaaaaaa-0000-4000-8000-${String(100 + i).padStart(12, "0")}`, handle: "h", name: "n", avatar_url: null }));
  const named = clone(fixture("poll"));
  named.messages[0].card.anonymous = false;
  named.messages[0].card.options[0].count = 13;
  named.messages[0].card.options[0].voters = many;
  assert.ok(run(named, "member", "lounge").problems.some((p) => p === "messages[0].card.options[0].voters: a poll names at most 12"));
  const slots = clone(fixture("signup"));
  slots.messages[0].card.options[1].capacity = 50;
  slots.messages[0].card.options[1].count = 13;
  slots.messages[0].card.options[1].voters = many;
  assert.deepEqual(run(slots, "member", "lounge").problems, []);
});

test("an EventCard and an EventRef bent in one place fail there (5.5)", () => {
  const body = clone(fixture("event-card"));
  body.messages[0].card.event.state = "over";
  body.messages[0].card.event.location = null;
  body.messages[0].card.note = "n".repeat(201);
  const { problems } = run(body, "member", "lounge");
  for (const at of ["messages[0].card.event.state", "messages[0].card.event.location", "messages[0].card.note"]) {
    assert.ok(problems.some((p) => p.startsWith(`${at}:`)), `${at}: ${problems.join("\n")}`);
  }
});

test("room and viewer against --room and --role", () => {
  assert.ok(run(fixture("board"), "officer", "lounge").problems.some((p) => p === "room.kind: --room lounge"));
  assert.ok(run(fixture("board"), "member", "board").problems.some((p) => p === "viewer.role: --role member"));
  assert.ok(run(fixture("lounge"), "officer", "lounge").problems.some((p) => p === "viewer.role: --role officer is owner|admin"));
  assert.ok(run(fixture("lounge"), "member", "dm").problems.some((p) => p === "room: null for a dm or a group"));
  assert.ok(run(fixture("dm"), "member", "lounge").problems.some((p) => p.startsWith("room: a club room's page carries its room")));
  const board = clone(fixture("board"));
  board.viewer.can_reply = false;
  assert.ok(run(board, "officer", "board").problems.some((p) => p === "viewer.can_reply: true only in a Board"));
  const event = clone(fixture("event"));
  event.room.event.going.push(...Array.from({ length: 8 }, (_, i) => ({ id: `aaaaaaaa-0000-4000-8000-${String(200 + i).padStart(12, "0")}`, handle: "h", name: "n", avatar_url: null })));
  assert.ok(run(event, "member", "event").problems.some((p) => p === "room.event.going: the first 8 at most"));
  const lounge = clone(fixture("lounge"));
  lounge.room.event = clone(fixture("event")).room.event;
  assert.ok(run(lounge, "member", "lounge").problems.some((p) => p === "room.event: only an event chat has an event"));
});

test("a missing or an extra field on a message, an id twice, and the wrong order are named", () => {
  const body = clone(fixture("lounge"));
  delete body.messages[0].hidden;
  body.messages[1].extra = 1;
  body.messages[2].id = body.messages[0].id;
  body.messages[2].created_at = "2026-10-08T19:00:00+00:00";
  const { problems } = run(body, "member", "lounge");
  assert.ok(problems.includes("messages[0]: missing field(s) hidden"));
  assert.ok(problems.includes("messages[1]: unexpected field(s) extra"));
  assert.ok(problems.includes("messages: an id appears twice"));
  assert.ok(problems.includes("messages[2].created_at: not oldest first"));
});

test("the CLI: exit 0 with the summary, exit 1 with every problem, exit 2 on usage or bad JSON", () => {
  const out = execFileSync("node", [TOOL, join(HERE, "fixtures", "poll.json"), "--role", "member", "--room", "lounge"], { encoding: "utf8" });
  assert.match(out, /^validate-thread: 1 message\(s\), 1 card\(s\)/);
  const dir = mkdtempSync(join(tmpdir(), "validate-thread-"));
  const broken = join(dir, "broken.json");
  const body = clone(fixture("stub"));
  body.messages[1].content = "leak";
  writeFileSync(broken, JSON.stringify(body));
  for (const [args, code, pattern] of [
    [[broken, "--role", "member", "--room", "lounge"], 1, /messages\[1\]\.content: a stub pins content at ""/],
    [[broken, "--role", "member"], 2, /usage:/],
    [[join(dir, "missing.json"), "--role", "member", "--room", "lounge"], 2, /missing\.json/],
    [[broken, "--role", "guest", "--room", "lounge"], 2, /--role must be/],
  ]) {
    try {
      execFileSync("node", [TOOL, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      assert.fail(`exit 0 for ${args.join(" ")}`);
    } catch (err) {
      assert.equal(err.status, code, `${args.join(" ")}: ${err.stderr}`);
      assert.match(String(err.stderr), pattern);
    }
  }
});
