/**
 * Tests for `rooms-dialog-rules.ts` (handoffs/chat-redesign/wave-3-desktop/
 * contract.md 4c.2, 4c.5, section 9; W3-5-rooms): the dialog's lines, options
 * and validity, and, by reading `RoomsDialog.tsx` as text, the Agent checks
 * of section 8 that need no browser.
 *
 * Run with:
 *   node --test src/components/desktop/messages/rooms-dialog-rules.test.ts
 *
 * The resolve hook is the `desktop-rules.test.ts` pattern: the module imports
 * through the "@/…" alias, which Node's type stripping does not resolve.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { test } from "node:test";

type NextResolve = (specifier: string, context?: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as {
  registerHooks?: (hooks: {
    resolve: (specifier: string, context: unknown, nextResolve: NextResolve) => unknown;
  }) => void;
};
if (typeof registerHooks !== "function") throw new Error("rooms-dialog-rules.test.ts needs Node >= 22.15 (module.registerHooks)");
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

const specifier = "./rooms-dialog-rules.ts";
const rules = (await import(specifier)) as typeof import("./rooms-dialog-rules");
type RoomRow = import("./rooms-dialog-rules").RoomRow;
type RoomForm = import("./rooms-dialog-rules").RoomForm;

function row(over: Partial<RoomRow> = {}): RoomRow {
  return { id: "r1", name: "study-group", topic: null, is_private: false, kind: "room", post_policy: "everyone", ...over };
}
function form(over: Partial<RoomForm> = {}): RoomForm {
  return { name: "Study group", topic: "", isPrivate: false, policy: "everyone", ...over };
}

// ── The routes ───────────────────────────────────────────────────────────────

test("the three addresses of 4c.5; the roster's carries no filter", () => {
  assert.equal(rules.roomsUrl("sae"), "/api/orgs/sae/channels");
  assert.equal(rules.roomUrl("sae", "abc"), "/api/orgs/sae/channels/abc");
  assert.equal(rules.rosterUrl("sae"), "/api/orgs/sae/members");
  assert.ok(!rules.rosterUrl("sae").includes("visible"), "an officer sees every member here (1.3 K4)");
  assert.ok(!rules.rosterUrl("sae").includes("?"));
  assert.equal(rules.roomsUrl("a b/c"), "/api/orgs/a%20b%2Fc/channels", "the handle is one path segment");
});

// ── The rows ─────────────────────────────────────────────────────────────────

test("toRoomRows: the server's order, a missing post_policy is everyone, an event chat and a non-row are dropped", () => {
  const rows = rules.toRoomRows([
    { id: "l", name: "lounge", kind: "lounge", is_private: false, topic: null },
    { id: "b", name: "board", kind: "board", is_private: false, post_policy: "everyone" },
    { id: "e", name: "Fall Formal", kind: "event", is_private: true },
    { id: "x", name: "exec-only", kind: "room", is_private: true, post_policy: "officers", topic: "Rush plans" },
    { id: "y", name: "alumni", kind: "room", is_private: false, post_policy: "nobody", topic: "   " },
    { id: "z", name: "old", is_private: false },
    null,
    "room",
    { name: "no-id" },
    { id: "", name: "empty-id" },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["l", "b", "x", "y", "z"]);
  assert.equal(rows[0].post_policy, "everyone", "no key (a database without the column)");
  assert.deepEqual(rows[2], { id: "x", name: "exec-only", topic: "Rush plans", is_private: true, kind: "room", post_policy: "officers" });
  assert.equal(rows[3].post_policy, "everyone", "a value outside the three");
  assert.equal(rows[3].topic, null, "a blank topic is no topic");
  assert.equal(rows[4].kind, null, "a database without channels.kind");
  assert.deepEqual(rules.toRoomRows(undefined), []);
  assert.deepEqual(rules.toRoomRows({ channels: [] }), []);
});

test("answeredPolicy: the rule in a create's or a save's answer, or null", () => {
  assert.equal(rules.answeredPolicy({ ok: true, channel: { id: "x", post_policy: "officers" } }), "officers");
  assert.equal(rules.answeredPolicy({ channel: { post_policy: "listed" } }), "listed");
  assert.equal(rules.answeredPolicy({ channel: { post_policy: "everyone" } }), "everyone");
  assert.equal(rules.answeredPolicy({ channel: { id: "x", name: "alumni" } }), null, "a save whose body did not name the rule");
  assert.equal(rules.answeredPolicy({ channel: { post_policy: "nobody" } }), null, "a value outside the three");
  for (const data of [null, undefined, "", 7, {}, { channel: null }, { channel: "x" }, { post_policy: "officers" }]) assert.equal(rules.answeredPolicy(data), null);
});

test("toRoomRows: a rule this dialog's write was answered with stands in where the list carries none", () => {
  // The list read after a save, from a server that still remembers the column as missing: no post_policy on any row.
  const list = [
    { id: "b", name: "board", kind: "board", is_private: false },
    { id: "x", name: "exec-only", kind: "room", is_private: false },
    { id: "y", name: "alumni", kind: "room", is_private: false },
    { id: "z", name: "old", is_private: false },
  ];
  const answered = new Map<string, RoomRow["post_policy"]>([["x", "officers"], ["b", "officers"], ["z", "listed"], ["gone", "listed"]]);
  const rows = rules.toRoomRows(list, answered);
  assert.deepEqual(rows.map((r) => [r.id, r.post_policy]), [["b", "everyone"], ["x", "officers"], ["y", "everyone"], ["z", "everyone"]], "only an extra room has a rule to remember");
  assert.equal(rules.roomRuleLine(rows[1]), "Every member sees it. Only officers post.", "the row reads as it was saved");
  // The form opened on that row holds the saved rule: Save is off again.
  assert.equal(rules.checkForm({ ...rules.formOf(rows[1]) }, rows[1], []).ok, false);
  // A listed room keeps its people list.
  assert.equal(rules.peopleTitle(rules.toRoomRows(list, new Map([["x", "listed" as const]]))[1]), "People who can post");
  // A row that carries a rule always wins over what is remembered.
  const carried = rules.toRoomRows([{ id: "x", name: "exec-only", kind: "room", is_private: false, post_policy: "everyone" }], answered);
  assert.equal(carried[0].post_policy, "everyone");
  // No map, or an empty one: as before.
  assert.equal(rules.toRoomRows(list)[1].post_policy, "everyone");
  assert.equal(rules.toRoomRows(list, new Map())[1].post_policy, "everyone");
});

test("roomSection: Board and Lounge are fixed, Officers has its people list, everything else is an extra room", () => {
  assert.equal(rules.roomSection({ kind: "board" }), "fixed");
  assert.equal(rules.roomSection({ kind: "lounge" }), "fixed");
  assert.equal(rules.roomSection({ kind: "officers" }), "officers");
  assert.equal(rules.roomSection({ kind: "room" }), "extra");
  assert.equal(rules.roomSection({ kind: null }), "extra");
});

test("roomTitle and roomMark: the chips' words, the megaphone, the lock", () => {
  assert.equal(rules.roomTitle({ kind: "board", name: "board" }), "Board");
  assert.equal(rules.roomTitle({ kind: "lounge", name: "general" }), "Lounge");
  assert.equal(rules.roomTitle({ kind: "officers", name: "exec" }), "Officers");
  assert.equal(rules.roomTitle({ kind: "room", name: "exec-only" }), "Exec only");
  assert.equal(rules.roomTitle({ kind: null, name: "rush_chairs" }), "Rush chairs");
  assert.equal(rules.roomMark({ kind: "board", is_private: false }), "megaphone");
  assert.equal(rules.roomMark({ kind: "officers", is_private: true }), "lock");
  assert.equal(rules.roomMark({ kind: "officers", is_private: false }), "lock", "Officers is locked whatever its row says");
  assert.equal(rules.roomMark({ kind: "room", is_private: true }), "lock");
  assert.equal(rules.roomMark({ kind: "room", is_private: false }), null);
  assert.equal(rules.roomMark({ kind: "lounge", is_private: false }), null);
});

// ── The line under each room (4c.2, row by row) ──────────────────────────────

test("roomRuleLine: who sees it, who posts, for every kind of room", () => {
  const line = (kind: RoomRow["kind"], is_private: boolean, post_policy: RoomRow["post_policy"]) => rules.roomRuleLine({ kind, is_private, post_policy });
  assert.equal(line("lounge", false, "everyone"), "Every member sees it and can post.");
  assert.equal(line("board", false, "everyone"), "Every member sees it. Only officers post; any member can reply under a post.");
  assert.equal(line("officers", true, "everyone"), "Officers and people added by name see it. Everyone who sees it can post.");
  assert.equal(line("room", false, "everyone"), "Every member sees it and can post.");
  assert.equal(line("room", false, "officers"), "Every member sees it. Only officers post.");
  assert.equal(line("room", false, "listed"), "Every member sees it. Only officers and people you pick post.");
  assert.equal(line("room", true, "everyone"), "Only officers and people you pick see it. Everyone who sees it can post.");
  assert.equal(line("room", true, "officers"), "Only officers and people you pick see it. Only officers post.");
  assert.equal(line("room", true, "listed"), line("room", true, "everyone"), "listed equals everyone in a private room (4c.2's last row)");
  assert.equal(line(null, false, "everyone"), "Every member sees it and can post.");
});

test("the pinned sentences, word for word", () => {
  assert.equal(rules.FIXED_ROOM_LINE, "Every club has this room. It can't be renamed or removed.");
  assert.equal(rules.PRIVATE_CONFIRM_LINE, "Make this room private? Members who are not officers or on the list lose it, and their unread marks and votes in it are cleared.");
  assert.equal(rules.LISTED_PUBLIC_LINE, "Everyone in the club can read. Only officers and the people below can post.");
  assert.equal(rules.NAME_TAKEN_LINE, "A room with that name already exists.");
  assert.equal(rules.deleteConfirmLine({ kind: "room", name: "study-group" }), "Delete Study group? Its messages are deleted too.");
  assert.equal(rules.savedAsLine("exec-only"), "Saved as exec-only");
  assert.equal(rules.TOPIC_MAX, 200);
  assert.deepEqual([...rules.OFFICER_SKIP_ROLES], ["owner", "admin"], "officers are owner and admin; a mod is listed like anyone");
});

// ── The two questions ────────────────────────────────────────────────────────

test("Who can see it: two options, in 4c.5's words", () => {
  assert.deepEqual(rules.SEE_OPTIONS.map((o) => [o.isPrivate, o.label]), [
    [false, "Everyone in the club"],
    [true, "Only officers and people you pick"],
  ]);
});

test("Who can post: three options for a room everyone sees, two for a private one", () => {
  assert.deepEqual(rules.postOptions(false).map((o) => [o.policy, o.label]), [
    ["everyone", "Everyone who can see it"],
    ["officers", "Only officers"],
    ["listed", "Officers and people you pick"],
  ]);
  assert.deepEqual(rules.postOptions(true).map((o) => [o.policy, o.label]), [
    ["everyone", "Everyone who can see it"],
    ["officers", "Only officers"],
  ]);
});

test("effectivePolicy: listed on a private room is everyone; nothing else moves", () => {
  assert.equal(rules.effectivePolicy(true, "listed"), "everyone");
  assert.equal(rules.effectivePolicy(false, "listed"), "listed");
  assert.equal(rules.effectivePolicy(true, "officers"), "officers");
  assert.equal(rules.effectivePolicy(false, "everyone"), "everyone");
  // Every option the dialog offers is its own effective rule: the picked radio is always one of them.
  for (const isPrivate of [false, true]) {
    for (const o of rules.postOptions(isPrivate)) assert.equal(rules.effectivePolicy(isPrivate, o.policy), o.policy);
  }
});

test("peopleTitle: the three titles of 4c.5, and no list anywhere else", () => {
  assert.equal(rules.peopleTitle(row({ kind: "officers", is_private: true })), "Also in this room");
  assert.equal(rules.peopleTitle(row({ is_private: true })), "People who can see this room");
  assert.equal(rules.peopleTitle(row({ is_private: true, post_policy: "officers" })), "People who can see this room");
  assert.equal(rules.peopleTitle(row({ is_private: true, post_policy: "listed" })), "People who can see this room");
  assert.equal(rules.peopleTitle(row({ post_policy: "listed" })), "People who can post");
  assert.equal(rules.peopleTitle(row()), null, "public, everyone posts: hidden");
  assert.equal(rules.peopleTitle(row({ post_policy: "officers" })), null, "public, officers post: hidden");
  assert.equal(rules.peopleTitle(row({ kind: "board" })), null);
  assert.equal(rules.peopleTitle(row({ kind: "lounge" })), null);
});

test("the cap line at 5: only extra rooms count", () => {
  const core = [row({ kind: "board" }), row({ kind: "lounge" }), row({ kind: "officers" })];
  const extras = (n: number) => Array.from({ length: n }, (_, i) => row({ id: `x${i}`, name: `room-${i}` }));
  assert.equal(rules.capLine([...core, ...extras(4)]), null);
  assert.equal(rules.capLine([...core, ...extras(5)]), "This club already has 5 extra rooms. Delete one first.");
  assert.equal(rules.capLine([...core, ...extras(6)]), "This club already has 5 extra rooms. Delete one first.", "rooms over the cap that already exist are kept");
  assert.equal(rules.capLine([...extras(4), row({ kind: null })]), null, "a row whose kind cannot be read is not counted, as in the route");
  assert.equal(rules.extraRoomCount([...core, ...extras(3)]), 3);
  assert.equal(rules.capLine([]), null);
});

// ── The form ─────────────────────────────────────────────────────────────────

test("checkRoomName: a new room's name goes through roomSlug", () => {
  assert.deepEqual(rules.checkRoomName("Exec only", null, []), { ok: true, slug: "exec-only", renamed: false });
  assert.deepEqual(rules.checkRoomName("  Rush Chairs!  ", null, []), { ok: true, slug: "rush-chairs", renamed: false });
  assert.deepEqual(rules.checkRoomName("", null, []), { ok: false, line: null }, "empty: nothing to say yet");
  assert.deepEqual(rules.checkRoomName("   ", null, []), { ok: false, line: null });
  // Too short, or nothing a slug can be made of.
  assert.deepEqual(rules.checkRoomName("a", null, []), { ok: false, line: rules.NAME_SHAPE_LINE });
  assert.deepEqual(rules.checkRoomName("!!!", null, []), { ok: false, line: rules.NAME_SHAPE_LINE });
  assert.deepEqual(rules.checkRoomName("_ab", null, []), { ok: false, line: rules.NAME_SHAPE_LINE }, "a slug starts with a letter or a number");
  // 31 characters: a longer name is cut, not refused.
  const long = rules.checkRoomName("a".repeat(40), null, []);
  assert.deepEqual(long, { ok: true, slug: "a".repeat(31), renamed: false });
  assert.deepEqual(rules.checkRoomName("b".repeat(31), null, []), { ok: true, slug: "b".repeat(31), renamed: false });
});

test("NAME_SHAPE_LINE says what is true of every name it is shown under", () => {
  assert.equal(rules.NAME_SHAPE_LINE, "Use at least two letters or numbers (a-z, 0-9), and start with one.");
  // What the line asks for: the first character is a-z or 0-9 (any case), and there are two of them at least.
  const doesWhatItSays = (input: string) => /^[a-z0-9]/i.test(input.trim()) && (input.match(/[a-z0-9]/gi) ?? []).length >= 2;
  const inputs = ["a", "7", "!!!", "_ab", "__", "_", "a-", "a é", "é", "日本語クラブ", "Клуб", "a 日本", "-", "ab", "a1", "A!b", "a_", "a b", "!ab", "Exec only", "9 to 5", `a${"!".repeat(40)}b`, `a${"_".repeat(40)}b`, `${"_".repeat(31)}ab`, "日本 ab"];
  for (const input of inputs) {
    const check = rules.checkRoomName(input, null, []);
    // Shown: the name does not do what the line says, so the line is no lie (a name in another alphabet included).
    if (!check.ok && check.line === rules.NAME_SHAPE_LINE) assert.equal(doesWhatItSays(input), false, input);
    // Followed: the line is never shown.
    if (doesWhatItSays(input)) assert.equal(check.ok, true, input);
  }
  for (const input of ["日本語クラブ", "Клуб", "é", "_ab", "a"]) assert.deepEqual(rules.checkRoomName(input, null, []), { ok: false, line: rules.NAME_SHAPE_LINE }, input);
});

test("checkRoomName: Board, Lounge and Officers are refused before the request, in any case", () => {
  for (const name of ["Board", "board", "LOUNGE", " Officers ", "officers!", "-lounge-"]) {
    assert.deepEqual(rules.checkRoomName(name, null, ["board", "lounge", "exec"]), { ok: false, line: rules.NAME_CORE_LINE }, name);
  }
  assert.equal(rules.checkRoomName("Board games", null, ["board"]).ok, true, "only the bare name is a core name");
  // Renaming an extra room to one of them is refused the same way.
  assert.deepEqual(rules.checkRoomName("Lounge", row(), ["lounge"]), { ok: false, line: rules.NAME_CORE_LINE });
});

test("checkRoomName: a clash is judged on the words shown, not on the slug", () => {
  const others = ["board", "lounge", "exec", "exec_only", "Alumni"];
  assert.deepEqual(rules.checkRoomName("Exec only", null, others), { ok: false, line: rules.NAME_TAKEN_LINE }, "exec-only would show the same words as exec_only");
  assert.deepEqual(rules.checkRoomName("exec_only", null, others), { ok: false, line: rules.NAME_TAKEN_LINE });
  assert.deepEqual(rules.checkRoomName("alumni", null, others), { ok: false, line: rules.NAME_TAKEN_LINE }, "case does not make a new name");
  assert.deepEqual(rules.checkRoomName("Exec", null, others), { ok: false, line: rules.NAME_TAKEN_LINE }, "the Officers room's stored name is taken too");
  assert.equal(rules.checkRoomName("Exec team", null, others).ok, true);
});

test("checkRoomName: editing keeps the stored name unless the words change", () => {
  const stored = row({ name: "exec_only" });
  assert.deepEqual(rules.checkRoomName("Exec only", stored, []), { ok: true, slug: "exec_only", renamed: false }, "the words the field opened with");
  assert.deepEqual(rules.checkRoomName("exec_only", stored, []), { ok: true, slug: "exec_only", renamed: false }, "the stored slug typed out");
  assert.deepEqual(rules.checkRoomName("Exec team", stored, []), { ok: true, slug: "exec-team", renamed: true });
  // An old name today's rule would refuse is still no rename, so the room's other answers can be saved.
  const old = row({ name: "x" });
  assert.deepEqual(rules.checkRoomName("X", old, []), { ok: true, slug: "x", renamed: false });
});

test("checkForm: a new room needs a good name; a saved room needs a change", () => {
  assert.deepEqual(rules.checkForm(form({ name: "" }), null, []), { ok: false, slug: null, nameLine: null, changed: true });
  assert.deepEqual(rules.checkForm(form(), null, []), { ok: true, slug: "study-group", nameLine: null, changed: true });
  assert.deepEqual(rules.checkForm(form({ name: "Board" }), null, []), { ok: false, slug: null, nameLine: rules.NAME_CORE_LINE, changed: true });
  assert.equal(rules.checkForm(form({ topic: "t".repeat(201) }), null, []).ok, false, "What it's for: 200 at most");
  assert.equal(rules.checkForm(form({ topic: ` ${"t".repeat(200)} ` }), null, []).ok, true);

  const saved = row({ topic: "Finals week" });
  const same = rules.formOf(saved);
  assert.deepEqual(same, { name: "Study group", topic: "Finals week", isPrivate: false, policy: "everyone" });
  assert.deepEqual(rules.checkForm(same, saved, ["board"]), { ok: false, slug: "study-group", nameLine: null, changed: false });
  assert.equal(rules.checkForm({ ...same, topic: "Finals" }, saved, []).ok, true);
  assert.equal(rules.checkForm({ ...same, topic: "  Finals week " }, saved, []).ok, false, "spaces at the ends are no change");
  assert.equal(rules.checkForm({ ...same, isPrivate: true }, saved, []).ok, true);
  assert.equal(rules.checkForm({ ...same, policy: "officers" }, saved, []).ok, true);
  assert.equal(rules.checkForm({ ...same, name: "Study hall" }, saved, []).ok, true);
  assert.equal(rules.checkForm({ ...same, name: "Lounge", topic: "x" }, saved, []).ok, false, "a bad name holds the save back whatever else changed");
  // A private room stored with `listed` reads as everyone: opening it is no change.
  const odd = row({ is_private: true, post_policy: "listed" });
  assert.equal(rules.checkForm(rules.formOf(odd), odd, []).changed, false);
});

test("needsPrivateConfirm: only a saved room everyone sees, about to turn private", () => {
  assert.equal(rules.needsPrivateConfirm(row(), true), true);
  assert.equal(rules.needsPrivateConfirm(row(), false), false);
  assert.equal(rules.needsPrivateConfirm(row({ is_private: true }), true), false, "already private");
  assert.equal(rules.needsPrivateConfirm(null, true), false, "a new room has nobody to lose it");
});

// ── What is sent ─────────────────────────────────────────────────────────────

test("createBody: { name: the slug, topic, is_private, post_policy }", () => {
  assert.deepEqual(rules.createBody(form({ name: "Study Group", topic: " Finals week " }), "study-group"), {
    name: "study-group",
    topic: "Finals week",
    is_private: false,
    post_policy: "everyone",
  });
  assert.deepEqual(rules.createBody(form({ isPrivate: true, policy: "listed" }), "study-group"), {
    name: "study-group",
    topic: null,
    is_private: true,
    post_policy: "everyone",
  });
  assert.equal(rules.createBody(form({ policy: "listed" }), "study-group").post_policy, "listed");
});

test("saveBody: the name only when renamed, post_policy only for a room whose kind reads `room`", () => {
  const saved = row({ name: "exec_only", topic: "Old" });
  assert.deepEqual(rules.saveBody(form({ name: "Exec only", topic: "", policy: "officers" }), saved, "exec_only"), {
    topic: null,
    is_private: false,
    post_policy: "officers",
  });
  assert.deepEqual(rules.saveBody(form({ name: "Exec team", topic: "New", isPrivate: true, policy: "listed" }), saved, "exec-team"), {
    name: "exec-team",
    topic: "New",
    is_private: true,
    post_policy: "everyone",
  });
  // A database without channels.kind has no post_policy either: the field would be refused (409 room_locked).
  const unread = row({ kind: null });
  assert.equal("post_policy" in rules.saveBody(form(), unread, "study-group"), false);
});

// ── A refused write ──────────────────────────────────────────────────────────

test("writeFailureLine and refusedField: the name clash reads in the dialog's words and marks the name", () => {
  const clash = { status: 409, code: null, error: "Channel name already exists", message: "Channel name already exists" };
  assert.equal(rules.writeFailureLine(clash), "A room with that name already exists.");
  assert.equal(rules.refusedField(clash), "name");
  const other = { status: 500, code: null, error: "Failed to update channel", message: "Couldn't save the room. Try again." };
  assert.equal(rules.writeFailureLine(other), "Couldn't save the room. Try again.");
  assert.equal(rules.refusedField(other), null);
  // The word filter names its field.
  const blocked = { status: 422, code: "content_blocked", error: null, message: "That includes words that aren't allowed on Vibe. Edit it and try again." };
  assert.equal(rules.refusedField({ ...blocked, field: "name" }), "name");
  assert.equal(rules.refusedField({ ...blocked, field: "topic" }), "topic");
  assert.equal(rules.refusedField({ ...blocked, field: "bio" }), null);
  assert.equal(rules.writeFailureLine({ ...blocked, field: "topic" }), blocked.message);
  // The same words under another status are not the clash.
  assert.equal(rules.refusedField({ ...clash, status: 400 }), null);
});

// ── The dialog, read as text (section 8, W3-5-rooms, the Agent line) ─────────

const dialog = readFileSync(new URL("./RoomsDialog.tsx", import.meta.url), "utf8");
const count = (re: RegExp) => (dialog.match(re) ?? []).length;

test("the dialog asks only the routes of 4c.5, each through its address in the rules", () => {
  assert.equal(count(/\/api\//g), 0, "no address is written out in the dialog");
  assert.equal(count(/\bfetch\(/g), 0);
  const calls = count(/\bvibeRequest[<(]/g);
  assert.equal(calls, 5, "the list, the roster, create, save, delete");
  assert.equal(count(/\bvibeRequest(?:<[^>]*>)?\((?:roomsUrl|roomUrl|rosterUrl)\(/g), calls, "every request goes to one of the three addresses");
  assert.equal(count(/vibeRequest<RosterResponse>\(rosterUrl\(orgHandle\)/g), 1, "ONE roster read (made again only after it failed)");
  assert.match(dialog, /method: "PATCH", json: saveBody\(/);
  assert.match(dialog, /method: "DELETE"/);
  assert.match(dialog, /json: createBody\(/);
});

test("the roster is read with no block filter and handed to RoomPeople", () => {
  // `:focus-visible` in the CSS is the only "visible" the file may hold.
  assert.equal(count(/visible/g), count(/focus-visible/g), "1.3 K4: an officer sees every member here");
  assert.equal(count(/[?&]\w+=/g), 0, "no query string is built in the dialog");
  assert.match(dialog, /import type \{ RoomsDialogProps, RosterResponse, RosterRow \} from "\.\/contracts";/, "nobody re-derives the roster shape");
  assert.match(dialog, /<RoomPeople orgHandle=\{orgHandle\} roomId=\{room\.id\} night=\{night\} title=\{title\} roster=\{roster\} skipRoles=\{OFFICER_SKIP_ROLES\} onChanged=\{onChanged\} \/>/);
  assert.equal(count(/<RoomPeople /g), 1, "every people list is the one component, under peopleTitle's three titles");
  assert.equal(count(/\/u\//g), 0);
});

test("Board and Lounge have no input: their branch draws their lines and nothing else", () => {
  const from = dialog.indexOf('{section === "fixed" ? (');
  const to = dialog.indexOf(") : (", from);
  assert.ok(from > 0 && to > from);
  const branch = dialog.slice(from, to);
  assert.match(branch, /<RoomLines room=\{room\} t=\{t\} fixed \/>/);
  for (const tag of ["<input", "<button", "<RoomEditor", "<RoomPeople", "peopleOf("]) assert.ok(!branch.includes(tag), tag);
  assert.match(dialog, /\{fixed \? <span [^>]*>\{FIXED_ROOM_LINE\}<\/span> : null\}/);
});

test("the private-flip confirm exists, and so does the delete confirm", () => {
  assert.match(dialog, /if \(needsPrivateConfirm\(room, isPrivate\)\) setConfirm\("private"\);/);
  assert.match(dialog, /line=\{PRIVATE_CONFIRM_LINE\}/);
  assert.match(dialog, /line=\{deleteConfirmLine\(room\)\}/);
  // The flip itself is written only on the question's answer, or where no question is needed.
  assert.equal(count(/change\(\{ isPrivate/g), 2);
});

test("the words of 4c.5 are drawn from the rules; every write that went through calls onChanged", () => {
  assert.match(dialog, /title=\{`Rooms in \$\{clubName\}`\}/);
  assert.match(dialog, /width=\{520\}/);
  for (const name of ["savedAsLine(check.slug)", "{LISTED_PUBLIC_LINE}", "capLine(rooms)", "SEE_OPTIONS.map(", "postOptions(form.isPrivate).map(", "roomRuleLine(room)"]) {
    assert.ok(dialog.includes(name), name);
  }
  assert.match(dialog, /chatRefusalLine\(r\) \?\? writeFailureLine\(r\)/, "a refusal shows its sentence");
  assert.match(dialog, /const afterWrite = async \(\) => \{\s*onChanged\(\);/);
  assert.equal(count(/if \(r\.ok\) await afterWrite\(\);/g), 3, "create, save, delete");
});

test("a roster read that failed is said and can be made again, from the one call site", () => {
  assert.match(dialog, /\}, \[orgHandle, rosterSeq\]\);/, "the roster's effect runs again when its count is bumped");
  assert.match(dialog, /setRosterFailure\(members \? null : asLoadFailure\(r, ROSTER_FAILURE\)\);/, "the failure is kept, not dropped");
  assert.match(dialog, /const retryRoster = \(\) => \{\s*if \(!rosterFailure\) return;/, "never a second read while one is out or after one went through");
  assert.match(dialog, /<LoadFailed failure=\{rosterFailure\} [^>]*onRetry=\{retryRoster\} \/>/, "said under a people list, with Retry");
  assert.equal(count(/\bretryRoster\(\);/g), 2, "the list's Retry and a section opening try it again too");
  assert.match(dialog, /if \(!open\) retryRoster\(\);/);
});

test("the saved rule is read from the write's answer and laid under the list's rows", () => {
  assert.equal(count(/if \(r\.ok\) keepRule\((?:id|room\.id), r\.data\);\s*if \(r\.ok\) await afterWrite\(\);/g), 2, "create and save, before the list is read again");
  assert.match(dialog, /const policy = answeredPolicy\(data\);\s*if \(roomId && policy\) answeredRef\.current\.set\(roomId, policy\);/);
  assert.equal(count(/readRooms\(orgHandle, answeredRef\.current\)/g), 2, "the first read and the read after a write");
  assert.match(dialog, /toRoomRows\(r\.data\.channels, answered\)/);
});

test("a press that moves the layout under the pointer ignores the second click of a double click", () => {
  // The question's two answers, a room's row, the New room Cancel (as-built wave 4's rule; a key press counts 0).
  assert.equal(count(/if \(e\.detail > 1\) return;/g), 4);
  const confirm = dialog.slice(dialog.indexOf("function Confirm("), dialog.indexOf("/** The room list, or why"));
  assert.equal((confirm.match(/if \(e\.detail > 1\) return;\s*if \(!busy\) on(?:No|Yes)\(\);/g) ?? []).length, 2);
  assert.match(dialog, /if \(e\.detail > 1\) return;\s*if \(busy\) return;[\s\S]{0,200}setOpenId\(open \? null : room\.id\);/);
  assert.match(dialog, /if \(e\.detail > 1\) return;\s*if \(!busy\) onCancel\(\);/);
});

test("Calm: no hex colour and no rgb literal but the scrim tint", () => {
  assert.equal(count(/#[0-9a-fA-F]{3,8}\b/g), 0);
  assert.equal(count(/rgba?\(/g), count(/rgba\(var\(--scrim-rgb\), /g));
  const rulesText = readFileSync(new URL("./rooms-dialog-rules.ts", import.meta.url), "utf8");
  assert.equal((rulesText.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).length, 0);
});
