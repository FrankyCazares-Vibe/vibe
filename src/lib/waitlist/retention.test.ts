/**
 * The waitlist's retention numbers can't drift apart: the pages' copy and the
 * purge's lines (types.ts), the database's deletion moment, purge and code
 * rules (20261003170000_waitlist_margin.sql, which replaced those three of
 * 20261003160000_waitlist_line.sql), the one-person drop (20261003160000),
 * the restart of an unconfirmed entry's clock (20261003170000), the batch
 * rule (20261003150000), the last-day rule (view.ts), the admin tab's "send
 * by day N" hint, and the daily Vercel Cron (vercel.json → the route file)
 * must agree.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/waitlist/retention.test.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const specifier = "./types.ts";
const {
  WAITLIST_BATCH_RE,
  WAITLIST_PURGE_AFTER_DAYS,
  WAITLIST_PURGE_MARGIN_DAYS,
  WAITLIST_RETENTION_DAYS,
  WAITLIST_UNCONFIRMED_PURGE_AFTER_DAYS,
  WAITLIST_UNCONFIRMED_RETENTION_DAYS,
} = (await import(specifier)) as typeof import("./types");
const accessCode = "./access-code.ts";
const { ACCESS_CODE_TTL_DAYS } = (await import(accessCode)) as typeof import("./access-code");
const viewPath = "./view.ts";
const { WAITLIST_CODE_MIN_LEFT_HOURS } = (await import(viewPath)) as typeof import("./view");

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
const read = (file: string) => readRoot(`supabase/migrations/${file}`);
/** The batch rule's file, the one-person drop's file, and the newest file holding the retention functions. */
const fixes = read("20261003150000_waitlist_retention_fixes.sql");
const line = read("20261003160000_waitlist_line.sql");
const migration = read("20261003170000_waitlist_margin.sql");

/** One function's body in a file: from its `create [or replace]` to the closing `$$;`. */
function body(name: string, sql: string = migration): string {
  const m = new RegExp(`create (or replace )?function public\\.${name}\\(`).exec(sql);
  assert.ok(m, `${name} is not in the file`);
  const end = sql.indexOf("$$;", sql.indexOf("as $$", m.index));
  return sql.slice(m.index, end);
}

const days = (sql: string) => [...sql.matchAll(/interval '(\d+) days'/g)].map((m) => Number(m[1]));

test("the founders' numbers: the copy promises up to 40 (30); the purge runs two days inside them", () => {
  assert.equal(WAITLIST_RETENTION_DAYS, 40);
  assert.equal(WAITLIST_UNCONFIRMED_RETENTION_DAYS, 30);
  // Vercel's Hobby cron runs at any minute of its hour and is not retried:
  // two runs can be about 25 hours apart. Two days keeps 40 (30) even then.
  assert.equal(WAITLIST_PURGE_MARGIN_DAYS, 2);
  assert.equal(WAITLIST_PURGE_AFTER_DAYS, 38);
  assert.equal(WAITLIST_UNCONFIRMED_PURGE_AFTER_DAYS, 28);
  assert.ok(WAITLIST_PURGE_AFTER_DAYS * 24 + 25 < WAITLIST_RETENTION_DAYS * 24, "a late run breaks the promise");
});

test("the database deletes at the purge lines, never at the promised numbers", () => {
  // The deletion moment, written once: 38 days, or 28 after the last confirm email.
  const at = days(body("waitlist_deletes_at"));
  assert.deepEqual([...new Set(at)].sort((a, b) => a - b), [
    WAITLIST_UNCONFIRMED_PURGE_AFTER_DAYS,
    WAITLIST_PURGE_AFTER_DAYS,
  ]);
  // The purge and the one-person drop read it; the send-log backstop is the 38-day line.
  const purge = body("waitlist_purge_expired");
  assert.match(purge, /public\.waitlist_deletes_at\(w\) < now\(\)/);
  assert.deepEqual(days(purge), [WAITLIST_PURGE_AFTER_DAYS]);
  const drop = body("waitlist_drop_if_due", line);
  assert.match(drop, /public\.waitlist_deletes_at\(w\) < now\(\)/);
  assert.deepEqual(days(drop), [], "the drop has its own line instead of reading waitlist_deletes_at");
});

test("a code is capped at its entry's deletion moment, and none goes out in its last day", () => {
  const issue = body("waitlist_issue_code");
  assert.match(issue, new RegExp(`v_ends := r\\.created_at \\+ interval '${WAITLIST_PURGE_AFTER_DAYS} days'`));
  assert.match(issue, new RegExp(`least\\(now\\(\\) \\+ interval '${ACCESS_CODE_TTL_DAYS} days', v_ends\\)`));
  assert.match(issue, /v_gone := public\.waitlist_deletes_at\(r\)/);
  assert.match(issue, /'reason', 'entry_expired'/);
  assert.match(issue, new RegExp(`v_gone < now\\(\\) \\+ interval '${WAITLIST_CODE_MIN_LEFT_HOURS} hours'`));
  assert.match(issue, /'reason', 'entry_expiring'/);
});

test("the admin tab's hint: a full 14-day code goes out by day 24", () => {
  assert.equal(WAITLIST_PURGE_AFTER_DAYS - ACCESS_CODE_TTL_DAYS, 24);
  // Worked out from the two numbers, never typed in.
  const client = readRoot("src/app/admin/waitlist-client.tsx");
  assert.match(client, /const FULL_CODE_BY_DAY = WAITLIST_PURGE_AFTER_DAYS - ACCESS_CODE_TTL_DAYS;/);
  assert.match(client, /send it by day \$\{FULL_CODE_BY_DAY\}/);
});

test("signing up again restarts only an unconfirmed entry's clock", () => {
  const trigger = /create trigger waitlist_restart_clock\s+before update of manage_token_hash on public\.waitlist[\s\S]*?execute function public\.waitlist_restart_clock\(\);/.exec(migration);
  assert.ok(trigger, "no waitlist_restart_clock trigger in 20261003170000");
  for (const cond of [
    "new.manage_token_hash is distinct from old.manage_token_hash",
    "old.confirmed_at is null and new.confirmed_at is null",
    "old.code_hash is null and new.code_hash is null",
    "old.redeemed_at is null and new.redeemed_at is null",
  ]) {
    assert.ok(trigger[0].includes(cond), `the trigger lacks: ${cond}`);
  }
  assert.match(body("waitlist_restart_clock"), /new\.created_at := now\(\);/);
  // The one writer of manage_token_hash on an existing row asks for the same state.
  const store = readRoot("src/lib/waitlist/store.ts");
  const renew = store.slice(store.indexOf("export async function renewConfirmToken"));
  assert.match(renew.slice(0, renew.indexOf("\n}\n")), /\.is\("confirmed_at", null\)\s*\.is\("code_hash", null\)/);
});

test("the batch rule is the same in the database and in types.ts", () => {
  const checks = [...fixes.matchAll(/add constraint (\w+) check \(batch ~ '([^']+)'\)/g)];
  assert.deepEqual(checks.map((m) => m[1]).sort(), ["user_cohorts_batch_check", "waitlist_batch_check"]);
  for (const m of checks) assert.equal(m[2], WAITLIST_BATCH_RE.source);
});

test("vercel.json runs the purge route once a day", () => {
  const config = JSON.parse(readRoot("vercel.json")) as {
    crons?: { path: string; schedule: string }[];
  };
  const job = config.crons?.find((c) => c.path === "/api/cron/waitlist-purge");
  assert.ok(job, "no cron for /api/cron/waitlist-purge");
  // Daily: fixed minute and hour, every day (Vercel Hobby allows at most one a
  // day, run any time in that hour). That gap is why the purge lines sit two
  // days inside the copy.
  assert.match(job.schedule, /^\d{1,2} \d{1,2} \* \* \*$/);
  assert.equal(WAITLIST_RETENTION_DAYS - WAITLIST_PURGE_AFTER_DAYS, WAITLIST_PURGE_MARGIN_DAYS);
  assert.ok(existsSync(new URL("src/app/api/cron/waitlist-purge/route.ts", root)), "the cron path has no route file");
});
