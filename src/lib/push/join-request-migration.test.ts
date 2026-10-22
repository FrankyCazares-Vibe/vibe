/**
 * Tests for `supabase/migrations/20261024100000_org_join_request_notification.sql`
 * (Oct 22, 2026; handoffs/2026-10-22-club-tools-arc/PLAN.md decision 5): the
 * one word it adds to `notifications_type_check`, read as text, since no
 * database runs under `node --test` (and this batch applied nothing).
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/push/join-request-migration.test.ts
 *
 * What it holds: the new CHECK keeps EVERY value the last definition had
 * (20260930100000), in the same order, plus 'org_join_request'; the
 * pre-flight's "as it is today" text is exactly what 20260930100000's own
 * post-check says it left; the file is one transaction; and the type the
 * code reads (dispatch.ts, notification-orgs.ts, the Otto rows) is the one
 * the CHECK lets in.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const SQL = read("../../../supabase/migrations/20261024100000_org_join_request_notification.sql");
const PREVIOUS = read("../../../supabase/migrations/20260930100000_event_cancel_notices.sql");

/** The statements, with `--` comments dropped. */
const body = SQL.split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

const OLD_TYPES = [
  "follow",
  "connection",
  "like",
  "comment",
  "mention",
  "org_invite",
  "org_request_approved",
  "event_cancelled",
];

/** pg_get_constraintdef's spelling of `check (type in (…))`, as in SQL source (quotes doubled). */
const defOf = (types: string[]) =>
  `CHECK ((type = ANY (ARRAY[${types.map((t) => `''${t}''::text`).join(", ")}])))`;

test("the previous definition is the 8 values this file starts from", () => {
  assert.ok(PREVIOUS.includes(defOf(OLD_TYPES)), "20260930100000's post-check reads as the old list");
  assert.ok(
    /check \(type in \('follow', 'connection', 'like', 'comment', 'mention',\s+'org_invite', 'org_request_approved', 'event_cancelled'\)\)/.test(PREVIOUS),
  );
});

test("the new CHECK keeps every old value, same order, plus org_join_request", () => {
  const add = body.match(/add constraint notifications_type_check\s+check \(type in \(([^)]*)\)\)/);
  assert.ok(add, "the file adds notifications_type_check");
  const listed = (add[1] ?? "").split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
  assert.deepEqual(listed, [...OLD_TYPES, "org_join_request"]);
});

test("the pre-flight accepts today's CHECK or this file's, and the post-check wants this file's", () => {
  assert.ok(body.includes(defOf(OLD_TYPES)), "pre-flight: as 20260930100000 left it");
  const NEW = defOf([...OLD_TYPES, "org_join_request"]);
  assert.equal(body.split(NEW).length - 1, 2, "pre-flight (a second run) and post-check");
  assert.match(body, /raise exception 'org-join-request: notifications_type_check drifted/);
  assert.match(body, /has_table_privilege\('authenticated', 'public\.notifications', 'INSERT'\)/);
});

test("one transaction, a lock timeout, and nothing but the CHECK changes", () => {
  const statements = body.trim();
  assert.ok(statements.startsWith("begin;"), "begins the transaction first");
  assert.ok(statements.endsWith("commit;"), "commits last");
  assert.match(body, /set local lock_timeout = '5s';/);
  for (const forbidden of [/\bgrant\b/i, /\brevoke\b/i, /\bcreate policy\b/i, /\badd column\b/i, /\bdelete from\b/i, /\binsert into\b/i]) {
    assert.doesNotMatch(body, forbidden, `no ${forbidden} outside the comments`);
  }
});

test("the code reads the same type the CHECK lets in", () => {
  for (const file of [
    "./dispatch.ts",
    "./payload.ts",
    "../orgs/notification-orgs.ts",
    "../../components/network/OttoSidePanel.tsx",
    "../../components/otto/OttoActivity.tsx",
  ]) {
    assert.ok(read(file).includes('"org_join_request"'), `${file} handles org_join_request`);
  }
});
