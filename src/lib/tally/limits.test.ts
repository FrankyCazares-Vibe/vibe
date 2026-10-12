/**
 * Tests for the page-open tally's limits and its dropped-open log line
 * (`limits.ts`).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/tally/limits.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const specifier = "./limits.ts";
const {
  createDropNotes,
  DROP_NOTE_EVERY_MS,
  OPENS_ALL_NETWORKS_PER_HOUR,
  OPENS_PER_NETWORK_PER_DAY,
  OPENS_PER_NETWORK_PER_HOUR,
} = (await import(specifier)) as typeof import("./limits");

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");

test("the limits: a demo day fits one network's hour, and the ceiling sits well above one network", () => {
  assert.equal(OPENS_PER_NETWORK_PER_HOUR, 300);
  assert.equal(OPENS_PER_NETWORK_PER_DAY, 1000);
  assert.equal(OPENS_ALL_NETWORKS_PER_HOUR, 3000);
  assert.ok(OPENS_PER_NETWORK_PER_DAY > OPENS_PER_NETWORK_PER_HOUR);
  assert.ok(OPENS_ALL_NETWORKS_PER_HOUR >= 10 * OPENS_PER_NETWORK_PER_HOUR);
});

test("the first dropped open is said at once, with which limit and its number", () => {
  const note = createDropNotes();
  assert.equal(note("network-hour", 0), "one network passed its 300 opens for this hour: an open was not counted");
  assert.equal(note("network-day", 0), "one network passed its 1000 opens for today: an open was not counted");
  const all = note("all-networks", 0);
  assert.ok(all?.startsWith("all networks together passed 3000 opens this hour"));
  assert.ok(all?.endsWith(": an open was not counted"));
});

test("a flood writes a line a minute, not a line a post, and the next line says how many", () => {
  const note = createDropNotes();
  assert.notEqual(note("network-hour", 1_000), null);
  for (let i = 1; i <= 500; i += 1) {
    assert.equal(note("network-hour", 1_000 + i), null);
  }
  assert.equal(note("network-hour", 1_000 + DROP_NOTE_EVERY_MS - 1), null);
  // 500 + 1 held in the minute, and this one.
  assert.equal(
    note("network-hour", 1_000 + DROP_NOTE_EVERY_MS),
    "one network passed its 300 opens for this hour: 502 opens were not counted",
  );
  // The count starts again after a line.
  assert.equal(note("network-hour", 1_000 + DROP_NOTE_EVERY_MS + 1), null);
  assert.equal(
    note("network-hour", 1_000 + 2 * DROP_NOTE_EVERY_MS),
    "one network passed its 300 opens for this hour: 2 opens were not counted",
  );
});

test("each limit keeps its own minute, and each server its own notes", () => {
  const note = createDropNotes(10);
  assert.notEqual(note("network-hour", 0), null);
  // A different limit a moment later is still said: it is a different fact.
  assert.notEqual(note("all-networks", 1), null);
  assert.equal(note("network-hour", 2), null);
  assert.equal(note("all-networks", 2), null);
  assert.notEqual(createDropNotes(10)("network-hour", 2), null);
  // A clock that steps back holds the line, it never throws or floods.
  assert.equal(note("network-hour", -5), null);
});

test("a line never has room for the network or the label", () => {
  const note = createDropNotes(0);
  for (const reason of ["network-hour", "network-day", "all-networks"] as const) {
    const line = note(reason, 0) ?? "";
    assert.equal(/\d+\.\d+\.\d+\.\d+|::|src=/.test(line), false, line);
  }
  // The words are built from which limit and the clock: the function is handed nothing else.
  assert.equal(note.length, 2);
});

test("the route uses these numbers and says every drop", () => {
  const route = readRoot("src/app/api/tally/open/route.ts");
  assert.ok(route.includes('from "@/lib/tally/limits"'));
  assert.ok(route.includes("limit: OPENS_PER_NETWORK_PER_HOUR"));
  assert.ok(route.includes("limit: OPENS_PER_NETWORK_PER_DAY"));
  assert.ok(route.includes("limit: OPENS_ALL_NETWORKS_PER_HOUR"));
  assert.ok(route.includes('if (!perHour.allowed) return warnDropped("network-hour")'));
  assert.ok(route.includes('if (!perDay.allowed) return warnDropped("network-day")'));
  assert.ok(route.includes('if (!everyone.allowed) return warnDropped("all-networks")'));
  // The all-networks key holds no network, and its limiter is not fail-closed:
  // a limiter that is down must not stop the count.
  assert.ok(route.includes('rateLimit("tally-open-all", {'));
  assert.equal(route.includes("failClosed"), false);
  // One network's own limits are asked before the ceiling, so a capped
  // network can't spend the ceiling for everyone else.
  assert.ok(route.indexOf("tally-open-net-day:") < route.indexOf("tally-open-all"));
  // The log line carries the tag and the note, nothing from the request.
  assert.ok(route.includes("if (line) console.warn(`[${TAG}] ${line}`)"));
});

test("the Numbers tab tells the founders the same numbers", () => {
  const tab = readRoot("src/app/admin/numbers-client.tsx");
  assert.ok(tab.includes('from "@/lib/tally/limits"'));
  for (const name of ["OPENS_PER_NETWORK_PER_HOUR", "OPENS_PER_NETWORK_PER_DAY", "OPENS_ALL_NETWORKS_PER_HOUR"]) {
    assert.ok(tab.includes(`COUNT.format(${name})`), name);
  }
  assert.ok(tab.includes("[tally/open]"));
});
