/**
 * Tests for event icons (`event-icons.ts`, Oct 23, 2026; club view wave 3,
 * batch B4), and the drift test for their database half
 * (`supabase/migrations/20261027100000_event_icons.sql`), read as text: the
 * rule's twelve keys are the code's twelve, in order, so a key the picker
 * offers is never one the database refuses (a 500 on save), and a key the
 * rule allows always has a shape to draw. The file was rehearsed on the
 * local stack (its REHEARSED note); this keeps a later edit to either side
 * from quietly undoing what was checked.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/event-icons.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spec = "./event-icons.ts";
const { EVENT_ICON_DEFAULT, EVENT_ICON_KEYS, EVENT_ICONS, eventIconOf, eventIconShape, isEventIcon } =
  (await import(spec)) as typeof import("./event-icons");

const PLAN = [
  ["meeting", "Meeting"],
  ["social", "Social"],
  ["food", "Food"],
  ["music", "Music"],
  ["sports", "Sports"],
  ["games", "Games"],
  ["study", "Study"],
  ["talk", "Talk"],
  ["service", "Service"],
  ["arts", "Arts"],
  ["trip", "Trip"],
  ["party", "Party"],
];

test("the twelve keys and names of the plan, in its order", () => {
  assert.deepEqual(
    EVENT_ICON_KEYS.map((k) => [k, EVENT_ICONS[k].name]),
    PLAN,
  );
  assert.deepEqual(Object.keys(EVENT_ICONS), [...EVENT_ICON_KEYS], "the shapes in the same order, none extra");
  assert.equal(EVENT_ICON_DEFAULT.name, "Calendar");
});

test("every shape is one plain stroke path, and no two are the same", () => {
  const all = [EVENT_ICON_DEFAULT, ...EVENT_ICON_KEYS.map((k) => EVENT_ICONS[k])];
  for (const shape of all) {
    assert.match(shape.path, /^M/, shape.name);
    // Path commands and numbers only: nothing a page could load or run.
    assert.match(shape.path, /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/, shape.name);
    // Every number fits the 24 grid (relative steps included, loosely).
    for (const n of shape.path.match(/-?\d*\.?\d+/g) ?? []) {
      assert.ok(Math.abs(Number(n)) <= 24, `${shape.name}: ${n}`);
    }
  }
  assert.equal(new Set(all.map((s) => s.path)).size, all.length);
});

test("isEventIcon and eventIconOf: only an exact key; junk reads as none", () => {
  for (const key of EVENT_ICON_KEYS) {
    assert.equal(isEventIcon(key), true, key);
    assert.equal(eventIconOf(key), key, key);
  }
  for (const junk of ["Food", " food", "food ", "", "calendar", "toString", "__proto__", null, undefined, 3, ["food"], {}]) {
    assert.equal(isEventIcon(junk), false, JSON.stringify(junk));
    assert.equal(eventIconOf(junk), null, JSON.stringify(junk));
  }
});

test("eventIconShape: its own shape, else the calendar", () => {
  assert.equal(eventIconShape("music"), EVENT_ICONS.music);
  assert.equal(eventIconShape(null), EVENT_ICON_DEFAULT);
  assert.equal(eventIconShape(undefined), EVENT_ICON_DEFAULT);
  assert.equal(eventIconShape("Music"), EVENT_ICON_DEFAULT);
});

// ── The migration, read as text ─────────────────────────────────────────────

const root = new URL("../../../", import.meta.url);
const raw = readFileSync(new URL("supabase/migrations/20261027100000_event_icons.sql", root), "utf8");
/** What Postgres runs: the file without its `--` notes, on one line, spaces squeezed. */
const code = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const lower = code.toLowerCase();
const namesIn = (list: string) => [...list.matchAll(/'([^']*)'/g)].map((m) => m[1]);
/** What pg_get_constraintdef prints for `check (icon in (...keys))`. */
const printed = (keys: readonly string[]) =>
  `CHECK ((icon = ANY (ARRAY[${keys.map((k) => `'${k}'::text`).join(", ")}])))`;

test("one transaction that gives up rather than queueing", () => {
  assert.ok(code.startsWith("begin; set local lock_timeout = '5s';"));
  assert.ok(code.endsWith("notify pgrst, 'reload schema'; commit;"));
});

test("the column is plain nullable text, added only if absent", () => {
  assert.equal([...lower.matchAll(/add column if not exists icon text;/g)].length, 1);
  assert.ok(!/add column if not exists icon text (not null|default)/.test(lower));
});

test("the rule lists EVENT_ICON_KEYS, in order, and is added only when absent", () => {
  const adds = [...code.matchAll(/add constraint events_icon_check check \(icon in \(([^)]*)\)\)/g)];
  assert.equal(adds.length, 1);
  assert.deepEqual(namesIn(adds[0][1]), [...EVENT_ICON_KEYS]);
  const add = lower.indexOf("add constraint events_icon_check");
  assert.ok(lower.lastIndexOf("if not exists", add) > lower.lastIndexOf("do $$", add), "inside its DO block's guard");
});

test("the pre-flight's and post-check's expected text is what Postgres prints for that list", () => {
  const re = /new_def constant text := ((?:'(?:[^']|'')*' ?)+);/g;
  const defs = [...code.matchAll(re)].map((m) =>
    [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((l) => l[1].replace(/''/g, "'")).join(""),
  );
  assert.deepEqual(defs, [printed(EVENT_ICON_KEYS), printed(EVENT_ICON_KEYS)]);
});

test("no data change, no grant, no function, no policy", () => {
  for (const word of ["grant ", "revoke ", "create ", "policy", "update public.", "insert ", "delete ", "truncate", "drop "]) {
    assert.ok(!lower.includes(word), `the code holds "${word.trim()}"`);
  }
});

test("the written-out ROLLBACK drops the column and the row, in one transaction", () => {
  const notes = raw.slice(raw.indexOf("-- ROLLBACK"), raw.indexOf("-- REHEARSED"));
  const body = notes
    .slice(notes.indexOf("--   begin;"), notes.indexOf("--   commit;") + "--   commit;".length)
    .split("\n")
    .map((line) => line.replace(/^--\s+/, ""))
    .join(" ");
  assert.ok(body.includes("alter table public.events drop column if exists icon;"));
  assert.ok(body.includes("delete from supabase_migrations.schema_migrations where version = '20261027100000';"));
  assert.ok(body.indexOf("set local lock_timeout") < body.indexOf("drop column"));
});
