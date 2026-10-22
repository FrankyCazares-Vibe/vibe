/**
 * Drift test for 20261026100000_club_backdrop_presets.sql (Oct 22, 2026,
 * batch K3), read as text. The database's rule about which background names
 * a club may hold (orgs_backdrop_preset_check) and the code's list
 * (backdrops.ts) must say the same thing: a name the code offers and the
 * rule refuses is a save that never lands (409 backdrop_not_ready), and a
 * name the rule allows that the code can't paint is a page on the default.
 * The file was rehearsed on the local stack (its header); this keeps a later
 * edit to either side from quietly undoing what was checked.
 *
 * Run with:
 *   node --test src/lib/orgs/backdrop-migration.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const specifier = "./backdrops.ts";
const { BACKDROPS, DEFAULT_BACKDROP, storableBackdropKeys } = (await import(specifier)) as typeof import("./backdrops");

const root = new URL("../../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");

const FILE = "supabase/migrations/20261026100000_club_backdrop_presets.sql";
const raw = read(FILE);
/** What Postgres runs: the file without its `--` notes, on one line, spaces squeezed. */
const code = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const lower = code.toLowerCase();

/** The quoted names in a `backdrop_preset in (...)` list. */
const namesIn = (list: string) => [...list.matchAll(/'([^']*)'/g)].map((m) => m[1]);

/** What pg_get_constraintdef prints for `check (backdrop_preset in (...names))`. */
const printed = (names: readonly string[]) =>
  `CHECK ((backdrop_preset = ANY (ARRAY[${names.map((n) => `'${n}'::text`).join(", ")}])))`;

/** Every `name constant text := '...' '...';` in the code, its literals joined and un-doubled. */
function constants(name: string): string[] {
  const re = new RegExp(`${name} constant text := ((?:'(?:[^']|'')*' ?)+);`, "g");
  return [...code.matchAll(re)].map((m) =>
    [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((l) => l[1].replace(/''/g, "'")).join(""),
  );
}

// The six the rule holds today, from the file that last wrote it.
const oldSix = namesIn(
  read("supabase/migrations/20260508140000_orgs_cream_backdrop.sql").match(/backdrop_preset IN \(([^)]*)\)/)![1],
);
const newFive = BACKDROPS.filter((b) => b.isNew).map((b) => b.key as string);

test("one transaction that gives up rather than queueing", () => {
  assert.ok(code.startsWith("begin; set local lock_timeout = '5s';"));
  assert.ok(code.endsWith("notify pgrst, 'reload schema'; commit;"));
});

test("the new rule is the six of 20260508140000, same order, then the five new ones: storableBackdropKeys(true)", () => {
  assert.deepEqual(oldSix, ["cream", "sand-purple", "ember", "deep-violet", "forest", "midnight"]);
  const adds = [...code.matchAll(/add constraint orgs_backdrop_preset_check check \(backdrop_preset in \(([^)]*)\)\)/g)];
  assert.equal(adds.length, 1);
  const rule = namesIn(adds[0][1]);
  assert.deepEqual(rule, [...oldSix, ...newFive]);
  assert.deepEqual([...rule].sort(), [...storableBackdropKeys(true)].sort());
  assert.deepEqual([...oldSix].sort(), [...storableBackdropKeys(false)].sort());
});

test("the pre-flight's and post-check's expected texts are what Postgres prints for those lists", () => {
  assert.deepEqual(constants("old_def"), [printed(oldSix)]);
  assert.deepEqual(constants("new_def"), [printed([...oldSix, ...newFive]), printed([...oldSix, ...newFive])]);
  // "Nothing outside the new list" counts against the same eleven.
  const outside = code.match(/where backdrop_preset not in \(([^)]*)\)/);
  assert.ok(outside);
  assert.deepEqual(namesIn(outside[1]), [...oldSix, ...newFive]);
});

test("the drop and the add sit in one DO block, after the pre-flight, so there is never a moment without the rule", () => {
  const drop = lower.indexOf("alter table public.orgs drop constraint orgs_backdrop_preset_check;");
  const add = lower.indexOf("alter table public.orgs add constraint orgs_backdrop_preset_check");
  assert.ok(drop > -1 && add > drop);
  assert.equal(lower.split("drop constraint").length - 1, 1);
  const blockStart = lower.lastIndexOf("do $$", drop);
  const blockEnd = lower.indexOf("end $$;", drop);
  assert.ok(blockStart > -1 && add < blockEnd, "drop and add in the same DO block");
  assert.ok(lower.indexOf("not the six of 20260508140000", blockStart) < drop, "the pre-flight refuses a drifted rule first");
  assert.ok(lower.indexOf("return;", blockStart) < drop, "a second run leaves the rule alone");
});

test("the pre-flight and the post-check both refuse a second CHECK on the column", () => {
  // A second rule naming backdrop_preset would still refuse the five after
  // this file, under a name the route doesn't turn into a 409.
  const guard =
    "c.contype = 'c' and a.attname = 'backdrop_preset' and c.conname <> 'orgs_backdrop_preset_check'";
  const first = lower.indexOf(guard);
  const second = lower.indexOf(guard, first + 1);
  assert.ok(first > -1 && second > -1, "the guard twice");
  assert.ok(first < lower.indexOf("drop constraint"), "the pre-flight's before the drop");
  assert.ok(second > lower.indexOf("comment on constraint"), "the post-check's after the comment");
});

test("no data change, no grant, no function, no policy", () => {
  for (const word of ["grant ", "revoke ", "create ", "policy", "update public.", "insert ", "delete ", "truncate"]) {
    assert.ok(!lower.includes(word), `the code holds "${word.trim()}"`);
  }
});

test("the written-out ROLLBACK moves clubs off the five new names to the default first, then restores the six", () => {
  const notes = raw.slice(raw.indexOf("-- ROLLBACK"), raw.indexOf("-- REHEARSED"));
  const body = notes
    .slice(notes.indexOf("--   begin;"), notes.indexOf("--   commit;") + "--   commit;".length)
    .split("\n")
    .map((line) => line.replace(/^--\s+/, ""))
    .join(" ")
    .replace(/\s+/g, " ");
  const update = body.match(/update public\.orgs set backdrop_preset = '([^']+)' where backdrop_preset in \(([^)]*)\);/);
  assert.ok(update, "the rollback's update");
  assert.equal(update[1], DEFAULT_BACKDROP);
  assert.ok(oldSix.includes(DEFAULT_BACKDROP));
  assert.deepEqual(namesIn(update[2]), newFive);
  const readd = body.match(/add constraint orgs_backdrop_preset_check check \(backdrop_preset in \(([^)]*)\)\);/);
  assert.ok(readd, "the rollback's rule");
  assert.deepEqual(namesIn(readd[1]), oldSix);
  assert.ok(body.indexOf("update public.orgs") < body.indexOf("drop constraint"), "the update before the old rule");
  assert.ok(body.includes("delete from supabase_migrations.schema_migrations where version = '20261026100000';"));
});

test("the header's apply line records this file's own version", () => {
  assert.ok(
    raw.includes(
      "values ('20261026100000', 'club_backdrop_presets') on conflict (version) do nothing;",
    ),
  );
});
