/**
 * Wiring tests for `use-room-poll.ts` (S71 amendment 3, C and D; audit F05,
 * F08; and the repair: the read frontier and the list epoch). The hook needs React and a DOM, so its two decisions live in
 * `page-merge.ts` as pure functions (tested in `page-merge.test.ts`); these
 * tests read the hook's source and hold it to calling them, the way
 * `group-rules.test.ts` holds its routes to the one cap.
 *
 * Run with:
 *   node --test src/lib/chat/use-room-poll.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const hook = read("./use-room-poll.ts");

/** The source without its comments, so a rule quoted in prose proves nothing. */
const code = hook
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

/** `const <name> = useCallback(` up to its own closing `  );` (the hook's two-space indent). */
function callbackBody(name: string): string {
  const start = code.indexOf(`  const ${name} = useCallback(`);
  assert.notEqual(start, -1, `${name} exists`);
  const end = code.indexOf("\n  );\n", start);
  assert.notEqual(end, -1, `${name} closes`);
  return code.slice(start, end);
}

test("D: the full read goes through applyFullPage with the page limit and the read frontier, and a gap sets hasEarlier", () => {
  const body = callbackBody("readFull");
  assert.match(body, /applyFullPage\(prev\.messages \?\? \[\], page\.messages, ROOM_PAGE_LIMIT, prev\.readFrontier\)/);
  assert.match(body, /messages: applied\.messages/);
  assert.match(body, /readFrontier: applied\.frontier/);
  assert.match(body, /hasEarlier: [^\n]*applied\.gap \|\| prev\.hasEarlier/);
  assert.doesNotMatch(code, /mergeFullPage\(/, "the hook never merges a full page without the gap check");
});

/** `const <name> = useCallback(` up to the dependency list of a callback written on one level (`  }, [`). */
function plainCallbackBody(name: string): string {
  const start = code.indexOf(`  const ${name} = useCallback(`);
  assert.notEqual(start, -1, `${name} exists`);
  const end = code.indexOf("\n  }, [", start);
  const alt = code.indexOf("\n  );\n", start);
  const stop = end === -1 ? alt : alt === -1 ? end : Math.min(end, alt);
  assert.notEqual(stop, -1, `${name} closes`);
  return code.slice(start, stop);
}

test("D (repair): the frontier is written by reads only; the composer's append / replace / remove never touch it", () => {
  for (const name of ["append", "replace", "remove", "replaceCard", "refreshOne", "loadEarlier"]) {
    assert.doesNotMatch(plainCallbackBody(name), /readFrontier\s*:/, `${name} does not write the frontier`);
  }
  const writes = code.match(/readFrontier: (?!string)[\w.()]+/g) ?? [];
  assert.deepEqual(
    writes.sort(),
    ["readFrontier: applied.frontier", "readFrontier: applied.frontier", "readFrontier: newestCreatedAt(page.messages)", "readFrontier: null"].sort(),
    "EMPTY, the first page, the full read, the ?after= read: nowhere else",
  );
});

test("D (repair): the 4-s cursor is the read frontier, not the newest row on screen", () => {
  assert.match(code, /void run\(full, cur\.roomId === id \? cur\.readFrontier : null\);/);
  assert.doesNotMatch(code, /cursorOf/, "no cursor is computed from the list");
});

test("D (repair): a gap replace starts a new list, and a read asked on the old one is dropped", () => {
  const full = callbackBody("readFull");
  assert.match(full, /if \(applied\.gap && prev\.messages !== null\) epochRef\.current \+= 1;/);
  assert.ok(full.indexOf("epochRef.current += 1;") < full.indexOf("commit({\n        roomId: id,"), "bumped before the new list is committed");

  const after = callbackBody("readAfter");
  assert.match(after, /const epoch = epochRef\.current;\n\s+const r = await vibeRequest/, "captured before the await");
  assert.match(after, /if \(epochRef\.current !== epoch \|\| !afterAnswerJoins\(cursor, prev\.readFrontier\)\) return;/);
  assert.ok(after.indexOf("epochRef.current !== epoch") < after.indexOf("applyAfterRows("), "checked before any row is added");
  assert.match(after, /applyAfterRows\(prev\.messages, r\.data\.messages, prev\.readFrontier\)/);

  const earlier = plainCallbackBody("loadEarlier");
  assert.match(earlier, /const epoch = epochRef\.current;\n\s+const r = await vibeRequest/, "captured before the await");
  assert.match(earlier, /if \(epochRef\.current !== epoch \|\| oldestOf\(cur\.messages\) !== oldest\) return;/);
  assert.ok(earlier.indexOf("epochRef.current !== epoch") < earlier.indexOf("commit("), "checked before the rows are prepended");
});

test("C: every mark goes through markReadDecision (no bare markRead call)", () => {
  const calls = code.match(/[^\n]*\bmarkRead\(id\)[^\n]*/g) ?? [];
  assert.equal(calls.length, 2, "settleMark and the cleanup, nowhere else");
  for (const line of calls) assert.match(line, /if \((next|last)\.mark\) markRead\(id\);/);
  assert.equal((code.match(/markReadDecision\(/g) ?? []).length, 2);
});

test("C: settleMark marks only the room whose schedule is running, and asks the page's visibility", () => {
  const body = callbackBody("settleMark");
  assert.match(body, /if \(onScreenRef\.current !== id\) return;/);
  assert.match(body, /markReadDecision\(\{ arrived, owed: owedRef\.current, visible: isVisible\(\) \}\)/);
  assert.match(body, /owedRef\.current = next\.owed;/);
});

test("C: a 4-s read settles once, on rows by someone else, even when it brought nothing", () => {
  const body = callbackBody("readAfter");
  const settles = body.match(/settleMark\(/g) ?? [];
  assert.equal(settles.length, 1, "at most one mark per tick");
  assert.match(body, /settleMark\(id, arrivedFromOthers\(applied\.fresh, prev\.viewerId\)\);/);
  assert.doesNotMatch(body, /if \(fresh\.length === 0\) return;/, "an owed mark must not wait for the next row");
});

test("C: a full read settles once, on the rows it brought", () => {
  const body = callbackBody("readFull");
  assert.equal((body.match(/settleMark\(/g) ?? []).length, 1);
  assert.match(body, /settleMark\(id, brought\);/);
});

test("C: the schedule marks on mount through the decision, and its cleanup sends what is owed unless hidden", () => {
  const start = code.indexOf("onScreenRef.current = id;");
  const end = code.indexOf("}, [enabled, roomId, readFull, readAfter, markRead, settleMark]);");
  assert.ok(start !== -1 && end > start, "the schedule effect");
  const effect = code.slice(start, end);
  assert.match(effect, /owedRef\.current = false;/);
  assert.match(effect, /settleMark\(id, true\);/, "the mount's mark");
  const cleanup = effect.slice(effect.indexOf("return () => {"));
  assert.match(cleanup, /markReadDecision\(\{ arrived: false, owed: owedRef\.current, visible: isVisible\(\) \}\)/);
  assert.match(cleanup, /onScreenRef\.current = null;/);
  assert.ok(cleanup.indexOf("if (last.mark) markRead(id);") < cleanup.indexOf("genRef.current = gen + 1;"));
});

test("C: the chip of the room being shown never draws the unread dot", () => {
  const chips = read("../../components/mobile/messages/club/RoomChips.tsx");
  assert.match(chips, /const unread = room\.unread && !active;/);
  assert.match(chips, /const dot = room\.kind === "board" && unread;/);
  assert.doesNotMatch(chips, /const dot = room\.kind === "board" && room\.unread;/);
});
