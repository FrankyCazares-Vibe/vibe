/**
 * Event cover photos (`event-cover-url.ts`, Oct 23, 2026; club view wave 3,
 * event covers, batch B1): which keys are a cover of a club's events, the
 * address a cover is shown at, and the migration that holds the same rule
 * (`supabase/migrations/20261028100000_event_covers.sql`, read as text):
 * its extensions are the code's, in order, and its header carries every
 * section a production migration needs.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/event-cover-url.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const spec = "./event-cover-url.ts";
const { EVENT_COVER_EXTENSIONS, EVENT_COVER_SUBDIR, eventCoverProxyUrl, isEventCoverKey } =
  (await import(spec)) as typeof import("./event-cover-url");

const ORG = "dddddddd-0000-4000-8000-000000000001";
const OTHER = "eeeeeeee-0000-4000-8000-000000000002";
const FILE = "3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6";
const EVENT = "aaaaaaaa-0000-4000-8000-000000000003";
const key = (ext: string, org = ORG) => `orgs/${org}/events/${FILE}.${ext}`;

test("the folder and the three extensions", () => {
  assert.equal(EVENT_COVER_SUBDIR, "events");
  assert.deepEqual([...EVENT_COVER_EXTENSIONS], ["jpg", "png", "webp"]);
});

test("isEventCoverKey: the key upload-url writes, for this club, passes", () => {
  for (const ext of EVENT_COVER_EXTENSIONS) assert.equal(isEventCoverKey(key(ext), ORG), true, ext);
});

test("isEventCoverKey: anything else is refused", () => {
  const refused: [unknown, unknown, string][] = [
    [key("jpg", OTHER), ORG, "another club's cover"],
    [key("jpg"), OTHER, "this cover, asked about another club"],
    [`orgs/${ORG}/banner/${FILE}.jpg`, ORG, "the club's banner"],
    [`orgs/${ORG}/posts/${FILE}.jpg`, ORG, "a club post's media"],
    [`orgs/${ORG}/events/sub/${FILE}.jpg`, ORG, "a nested path"],
    [`orgs/${ORG}/events/../${OTHER}/events/${FILE}.jpg`, ORG, "traversal"],
    [`orgs/${ORG}/events/${FILE}.gif`, ORG, "a gif"],
    [`orgs/${ORG}/events/${FILE}.mp4`, ORG, "a video"],
    [`orgs/${ORG}/events/${FILE}.JPG`, ORG, "upper-case extension"],
    [`orgs/${ORG}/events/${FILE.toUpperCase()}.jpg`, ORG, "upper-case file"],
    [`orgs/${ORG}/events/cover.jpg`, ORG, "a file that isn't a UUID"],
    [`orgs/${ORG}/events/${FILE}.jpg/`, ORG, "a trailing slash"],
    [`orgs/${ORG}/events/`, ORG, "the folder itself"],
    [` ${key("jpg")}`, ORG, "a leading space"],
    [`https://rqopjkimxbjkwdkpkbfq.supabase.co/${FILE}.jpg`, ORG, "a URL"],
    [`clips/${ORG}/${FILE}.jpg`, ORG, "a student's clip folder"],
    ["", ORG, "empty"],
    [null, ORG, "null"],
    [5, ORG, "a number"],
    [key("jpg"), null, "no club"],
    [key("jpg"), "not-a-uuid", "a club id that isn't one"],
    [`orgs/not-a-uuid/events/${FILE}.jpg`, "not-a-uuid", "a junk club folder"],
  ];
  for (const [k, org, why] of refused) assert.equal(isEventCoverKey(k, org), false, why);
});

test("eventCoverProxyUrl: the event's cover address, the file name as ?v=, never the key", () => {
  const url = eventCoverProxyUrl(EVENT, key("webp"));
  assert.equal(url, `/api/events/${EVENT}/cover?v=${FILE}.webp`);
  assert.ok(url && !url.includes(ORG) && !url.includes("orgs/"), "the club folder stays on the server");
  // A new upload is a new file name, so a new address.
  assert.notEqual(eventCoverProxyUrl(EVENT, key("jpg")), eventCoverProxyUrl(EVENT, key("png")));
});

test("eventCoverProxyUrl: no cover, or something that isn't a storage key, is null", () => {
  for (const stored of [null, undefined, "", "https://example.com/a.jpg", "clips/x/a.jpg", `orgs/${ORG}/events/`]) {
    assert.equal(eventCoverProxyUrl(EVENT, stored), null, String(stored));
  }
  assert.equal(eventCoverProxyUrl("", key("jpg")), null, "no event id");
});

// ── The migration, read as text ─────────────────────────────────────────────

const root = new URL("../../../", import.meta.url);
const raw = readFileSync(new URL("supabase/migrations/20261028100000_event_covers.sql", root), "utf8");
const code = raw
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

test("the migration's rule names the code's extensions, in order, and the events folder", () => {
  const rule = code.match(/~ '\^\[A-Za-z0-9_-\]\[A-Za-z0-9\._-\]\*\\\.\(([a-z|]+)\)\$'/);
  assert.ok(rule, "the file-name pattern is in event_cover_key_ok");
  assert.deepEqual(rule[1].split("|"), [...EVENT_COVER_EXTENSIONS]);
  assert.match(code, /starts_with\(p_key, 'orgs\/' \|\| p_org_id::text \|\| '\/events\/'\)/);
  assert.match(code, /strpos\(p_key, '\.\.'\) = 0/);
});

test("the migration adds one nullable text column and one trigger on it, and writes no row", () => {
  const lower = code.toLowerCase();
  assert.equal([...lower.matchAll(/add column if not exists cover_key text;/g)].length, 1);
  assert.match(lower, /before insert or update of cover_key on public\.events/);
  assert.match(lower, /new\.cover_key is distinct from old\.cover_key/);
  for (const word of ["insert into", "update public.", "delete from", "truncate", "create policy", "alter policy"]) {
    assert.ok(!lower.includes(word), `the body never says "${word}"`);
  }
  assert.ok(lower.trimStart().startsWith("begin;"), "the body opens the transaction");
  assert.ok(lower.trimEnd().endsWith("commit;"));
});

test("the migration's header carries every section, the rollback drops what it made", () => {
  for (const part of ["PLAIN ENGLISH", "PRE-FLIGHT on PRODUCTION", "HOW TO APPLY", "DEPLOY ORDER: THIS FILE FIRST", "POST-CHECK", "ROLLBACK", "REHEARSED on the local stack"]) {
    assert.ok(raw.includes(part), part);
  }
  for (const line of [
    "drop trigger if exists events_check_cover_key on public.events;",
    "drop function if exists public.events_check_cover_key();",
    "drop function if exists public.event_cover_key_ok(text, uuid);",
    "alter table public.events drop column if exists cover_key;",
    "delete from supabase_migrations.schema_migrations where version = '20261028100000';",
  ]) {
    assert.ok(raw.includes(`--   ${line}`), line);
  }
});
