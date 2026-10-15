/**
 * Drift tests for the day totals' database file
 * (`supabase/migrations/20261014150000_usage_day_tally.sql`), read as text:
 * what the table may hold, who may call the check-in and the read, that the
 * browser can no longer write the last-active time, that nothing about a
 * person is ever written into the totals, and that "active now" is 0 under 5
 * and 0 on a campus under 10 (users_active_count: per campus, at least 5
 * people other than the caller on and at least 5 not). The file itself was
 * applied and checked on the local database; these keep a later edit from
 * quietly undoing what was checked.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/usage/tally-migration.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const touchSpec = "./touch.ts";
const viewSpec = "./view.ts";
const activeSpec = "./active-now.ts";
const { USAGE_DEVICES, USAGE_OPENS, OPEN_CAP_PER_ACTIVE } = (await import(touchSpec)) as typeof import("./touch");
const { TALLY_CAP_KEYS, TALLY_DAY_KEYS, TALLY_COHORT_WEEKS, TALLY_OPEN_CAP_PER_ACTIVE } = (await import(viewSpec)) as typeof import("./view");
const { ACTIVE_NOW_MIN } = (await import(activeSpec)) as typeof import("./active-now");

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");

const sql = readRoot("supabase/migrations/20261014150000_usage_day_tally.sql");
/** What Postgres runs: the file without its `--` notes. */
const code = sql.replace(/--[^\n]*/g, "");
/** The same, on one line, every run of spaces as one, lower case. */
const squash = (s: string) => s.replace(/\s+/g, " ").toLowerCase();
const flat = squash(code);

/** A function's body between its own dollar quotes, flattened. */
function bodyOf(tag: string): string {
  const m = new RegExp(`as \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$;`).exec(code);
  assert.ok(m, `the body between $${tag}$ quotes`);
  return squash(m[1]);
}
const touch = bodyOf("touch");
const tally = bodyOf("tally");
const active = bodyOf("active");

const table = (() => {
  const m = /create table if not exists public\.usage_day_tally \(([\s\S]*?)\n\);/.exec(code);
  assert.ok(m, "the table's body");
  return m[1];
})();

const count = (re: RegExp, text = code) => (text.match(re) ?? []).length;
/** The quoted words of an `in (...)` list. */
const words = (list: string) => [...list.matchAll(/'([^']*)'/g)].map((m) => m[1]);
const sorted = (xs: readonly string[]) => [...xs].sort();

/** Every key a jsonb_build_object names: its 1st, 3rd, 5th... arguments. As in migration.test.ts. */
function builtKeys(src: string): string[] {
  const keys: string[] = [];
  const opener = "jsonb_build_object(";
  for (let at = src.indexOf(opener); at !== -1; at = src.indexOf(opener, at + 1)) {
    const args: string[] = [];
    let arg = "";
    let depth = 0;
    let quoted = false;
    for (let i = at + opener.length; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === "'") quoted = !quoted;
      if (!quoted && ch === "(") depth += 1;
      if (!quoted && ch === ")" && depth-- === 0) {
        args.push(arg);
        break;
      }
      if (!quoted && ch === "," && depth === 0) {
        args.push(arg);
        arg = "";
        continue;
      }
      arg += ch;
    }
    args.forEach((a, n) => {
      if (n % 2 === 0) keys.push(a.trim());
    });
  }
  return keys;
}

test("the table holds a day, a metric, a key and a count, and nothing about a person", () => {
  const cols = [...table.matchAll(/^\s*([a-z_]+)\s+(date|text|integer)\b/gm)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(cols, ["day date", "metric text", "key text", "count integer"]);
  assert.equal(/uuid|inet|timestamptz|user_id|\bip\b|agent|email|handle/i.test(table), false);
  assert.ok(flat.includes("primary key (day, metric, key)"));
  // The pre-flight takes a kept table only with exactly these four.
  assert.ok(flat.includes("if v_cols is distinct from 'day date, metric text, key text, count integer' then"));
});

test("only the two functions touch the table: RLS on, no policy, no grant, every API role revoked", () => {
  assert.ok(flat.includes("alter table public.usage_day_tally enable row level security;"));
  assert.equal(/create\s+policy/i.test(code), false);
  assert.equal(/grant [^;]* on (table )?public\.usage_day_tally/.test(flat), false);
  assert.ok(flat.includes("revoke all on table public.usage_day_tally from anon, authenticated, service_role;"));
  // The post-check asks again, for every privilege and every API role.
  assert.ok(flat.includes("has_table_privilege(api, 'public.usage_day_tally', 'select,insert,update,delete,truncate,references,trigger')"));
});

test("the table's lists are touch.ts's and view.ts's, and there is no free-text key", () => {
  const metrics = /metric text not null check \(metric in \(([^)]*)\)\)/.exec(flat);
  assert.ok(metrics);
  const opens = USAGE_OPENS.map((o) => `${o}_open`);
  assert.deepEqual(sorted(words(metrics[1])), sorted(["active_day", "active_week", "cohort", "device_day", ...opens]));

  const keysFor = (re: RegExp) => {
    const m = re.exec(flat);
    assert.ok(m, String(re));
    return words(m[1]);
  };
  assert.deepEqual(keysFor(/\(metric = 'active_day' and key in \(([^)]*)\)\)/), ["all", "iu", "purdue", "unknown"]);
  assert.deepEqual(keysFor(/\(metric = 'device_day' and key in \(([^)]*)\)\)/), [...USAGE_DEVICES, "unknown"]);
  assert.deepEqual(keysFor(/\(metric in \(([^)]*)\) and key in \('all', 'capped'\)\)/), opens);
  const cohortKeys = Array.from({ length: TALLY_COHORT_WEEKS }, (_, k) => `w${k}`);
  assert.deepEqual(keysFor(/\(metric = 'cohort' and key in \(([^)]*)\) and extract\(isodow from day\) = 1\)/), cohortKeys);
  assert.ok(flat.includes("(metric = 'active_week' and key = 'all' and extract(isodow from day) = 1)"));
  // No pattern-matched key anywhere: every key is one of a fixed list.
  assert.equal(/key ~/.test(flat), false);

  // The check-in takes the same words.
  assert.deepEqual(keysFor(/case when p_device in \(([^)]*)\) then p_device else 'unknown' end/), [...USAGE_DEVICES]);
  assert.deepEqual(keysFor(/if p_open is not null and p_open not in \(([^)]*)\) then/), [...USAGE_OPENS]);
  // Cohort rows reach exactly as far as the tab shows: w0 to w(N-1).
  assert.ok(touch.includes(`if v_week - v_signup between 0 and ${7 * (TALLY_COHORT_WEEKS - 1)} then`));
  assert.ok(touch.includes("values (v_week, 'cohort', 'w' || ((v_week - v_signup) / 7)::text, 1)"));
  assert.ok(tally.includes(`from generate_series(0, ${TALLY_COHORT_WEEKS - 1}) k`));
});

test("both functions run as their owner, with an empty search path, and can be run again", () => {
  assert.ok(
    flat.includes(
      "create or replace function public.usage_touch(p_user uuid, p_device text default 'unknown', p_open text default null) " +
        "returns void language plpgsql volatile security definer set search_path = '' as $touch$",
    ),
  );
  assert.ok(
    flat.includes(
      "create or replace function public.admin_usage_tally(p_days integer default 30) " +
        "returns jsonb language plpgsql stable security definer set search_path = '' as $tally$",
    ),
  );
  assert.equal(count(/create or replace function/g), 3);
  assert.ok(flat.includes("create table if not exists public.usage_day_tally ("));
  // A re-run is not stopped on "already exists"; another overload still is.
  assert.equal(flat.includes("already exists"), false);
  assert.ok(flat.includes("sits beside the ones this file makes"));
  assert.ok(tally.includes("least(greatest(coalesce(p_days, 30), 7), 90)"));
});

test("the browser's two roles are refused first thing, inside both, with 42501", () => {
  const refusal =
    "if current_setting('role', true) in ('anon', 'authenticated') then " +
    "raise exception 'not allowed' using errcode = '42501'; end if;";
  for (const [name, body] of [["usage_touch", touch], ["admin_usage_tally", tally]]) {
    const afterBegin = body.slice(body.indexOf(" begin ") + " begin ".length);
    assert.ok(afterBegin.startsWith(refusal), `${name}: ${afterBegin.slice(0, 160)}`);
  }
  // auth.uid() is null under the service role, and an id taken from a
  // signed-in caller would let anyone stamp anyone: the route passes it.
  // (users_active_count keeps 20261008120000's "the caller" test, and uses
  // auth.uid() twice more to leave the caller out of both floors; the
  // post-check looks for those two: five in all.)
  for (const body of [touch, tally]) assert.equal(/auth\.uid\(\)/.test(body), false);
  assert.equal(count(/auth\.uid\(\)/g), 5);
  assert.equal(count(/auth\.uid\(\)/g, active), 3);
  assert.ok(active.includes("u.id = (select auth.uid())"));
});

test("every API role keeps EXECUTE (the standing rule), PUBLIC loses it, and the only revokes are these", () => {
  for (const sig of ["public.usage_touch(uuid, text, text)", "public.admin_usage_tally(integer)"]) {
    assert.ok(flat.includes(`revoke all on function ${sig} from public;`), sig);
    assert.ok(flat.includes(`grant execute on function ${sig} to anon, authenticated, service_role;`), sig);
  }
  // Taking EXECUTE away from a role crashes the backend on Supabase's image.
  assert.equal(/revoke\s+execute/i.test(sql), false);
  // Every revoke statement (they start a line); the error messages that say "revoke" are not statements.
  assert.equal(count(/\brevoke (all|update|select|insert|delete|usage|execute|truncate)\b/gi), 4);
  assert.deepEqual(sorted((code.match(/^revoke [^;]*;/gm) ?? []).map(squash)), sorted([
    "revoke all on table public.usage_day_tally from anon, authenticated, service_role;",
    "revoke all on function public.usage_touch(uuid, text, text) from public;",
    "revoke all on function public.admin_usage_tally(integer) from public;",
    "revoke update (last_active_at) on public.users from authenticated;",
  ]));
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.ok(flat.includes(`has_function_privilege('${role}', f, 'execute')`), role);
  }
  assert.ok(flat.includes("a.grantee = 0"));
  assert.ok(flat.includes("is distinct from array['search_path=\"\"']"));
  assert.ok(flat.includes("(select p.provolatile from pg_proc p where p.oid = w) <> 'v'"));
  assert.ok(flat.includes("(select p.provolatile from pg_proc p where p.oid = r) <> 's'"));
});

test("the browser can no longer write the last-active time; only the check-in does", () => {
  assert.equal(count(/revoke update \(last_active_at\) on public\.users from authenticated;/g), 1);
  assert.ok(flat.includes("if has_table_privilege('authenticated', 'public.users', 'update') then"));
  assert.ok(flat.includes("has_column_privilege(api, 'public.users', 'last_active_at', 'update')"));
  assert.ok(flat.includes("has_column_privilege(api, 'public.users', 'last_active_at', 'select')"));
  assert.ok(flat.includes("foreach api in array array['anon', 'authenticated'] loop"));
  // The revoke took one column and no other.
  assert.equal(count(/vibe\.usage_tally_other_update_cols/g), 2);
  // The one write to users anywhere: the check-in's stamp, forward only.
  assert.deepEqual(flat.match(/update public\.users [^;]*;/g), [
    "update public.users set last_active_at = greatest(v_now, coalesce(v_old, v_now)) where id = p_user;",
  ]);
  // The owner must pass RLS on users, or users_update_self would drop the stamp.
  assert.ok(flat.includes("select r.rolbypassrls from pg_roles r where r.rolname = current_user"));
  assert.ok(touch.includes("raise exception 'usage: stamp did not land' using errcode = '55000';"));
});

test("a person counts once a day and once a week, from the last-active time, and is never written in", () => {
  const at = (s: string) => {
    const i = touch.indexOf(s);
    assert.ok(i !== -1, s);
    return i;
  };
  // Lock, then decide, then stamp, then leave out, then count: in that order.
  const order = [
    "where u.id = p_user for update of u;",
    "v_first_day := v_old_day is null or v_old_day < v_today;",
    "v_first_week := v_old_day is null or v_old_day - (extract(isodow from v_old_day)::int - 1) < v_week;",
    "if v_first_day or v_first_week or v_old <= v_now - interval '60 seconds' then",
    "if v_out then return; end if;",
    "if v_first_day then insert into public.usage_day_tally",
    "if v_first_week then insert into public.usage_day_tally",
    "if p_open is not null then v_metric := p_open || '_open';",
  ].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));

  // p_user: the empty test, the restriction test, the lock and the stamp. Never a value.
  assert.equal(count(/\bp_user\b/g, touch), 4);
  const tuples = [...touch.matchAll(/ values (.*?) on conflict /g)].map((m) => m[1]);
  assert.equal(tuples.length, 5);
  for (const t of tuples) assert.equal(/p_user|v_old|v_created|auth\.|\bu\./.test(t), false, t);
  assert.equal(count(/insert into public\.usage_day_tally as t/g, touch), 5);
  assert.deepEqual([...new Set(flat.match(/insert into [a-z_.]+/g))], ["insert into public.usage_day_tally"]);
});

test("founders, store-review accounts and restricted accounts are never counted", () => {
  assert.ok(touch.includes(
    "u.is_platform_admin or coalesce(au.raw_app_meta_data @> '{\"vibe_review_account\": true}'::jsonb, false) into v_old, v_school, v_created, v_out",
  ));
  assert.ok(touch.includes(
    "from public.account_restrictions r where r.user_id = p_user and r.lifted_at is null and r.starts_at <= v_now " +
      "and (r.ends_at is null or r.ends_at > v_now)) then return; end if;",
  ));
});

test("days are UTC dates and weeks are Monday weeks, in date arithmetic only", () => {
  assert.equal(/date_trunc/.test(code), false);
  const zones = code.match(/at time zone '[^']*'/g) ?? [];
  assert.ok(zones.length >= 4);
  for (const z of zones) assert.equal(z, "at time zone 'utc'");
  assert.ok(touch.includes("v_week := v_today - (extract(isodow from v_today)::int - 1);"));
  assert.ok(tally.includes("v_week := v_today - (extract(isodow from v_today)::int - 1);"));
  // Series run over whole numbers, never over timestamps (the session zone).
  for (const g of flat.match(/generate_series\([^)]*\)/g) ?? []) {
    assert.match(g, /^generate_series\(\d+, (\d+|v_days - 1)\)$/);
  }
});

test("a day's opens stop at ten times its active people, the same ten as touch.ts and view.ts, and a turned-away open marks the day", () => {
  assert.equal(OPEN_CAP_PER_ACTIVE, 10);
  assert.equal(TALLY_OPEN_CAP_PER_ACTIVE, OPEN_CAP_PER_ACTIVE);
  assert.ok(touch.includes(`if v_opens < ${OPEN_CAP_PER_ACTIVE} * greatest(v_active, 1) then`));
  assert.ok(touch.includes("from public.usage_day_tally t where t.day = v_today and t.metric in ('active_day', v_metric);"));
  // The opens counted, never the mark, are what the stop compares.
  assert.ok(touch.includes("coalesce(sum(t.count) filter (where t.metric = v_metric and t.key = 'all'), 0) into v_active, v_opens"));
  // Past the stop: the mark, once (a loop past it writes nothing more).
  assert.ok(touch.includes(
    "else insert into public.usage_day_tally as t (day, metric, key, count) values (v_today, v_metric, 'capped', 1) " +
      "on conflict (day, metric, key) do nothing; end if;",
  ));
  // The read keeps the mark out of the opens and answers it as true or false.
  assert.ok(tally.includes("coalesce(sum(t.count) filter (where t.metric = 'otto_open' and t.key = 'all'), 0) as otto_open"));
  assert.ok(tally.includes("coalesce(sum(t.count) filter (where t.metric = 'map_open' and t.key = 'all'), 0) as map_open"));
  assert.ok(tally.includes("coalesce(bool_or(t.metric = 'otto_open' and t.key = 'capped'), false) as otto_capped"));
  assert.ok(tally.includes("coalesce(bool_or(t.metric = 'map_open' and t.key = 'capped'), false) as map_capped"));
});

test("the read answers the shape view.ts reads, totals only, and none of its keys names a person", () => {
  const keys = builtKeys(code);
  for (const k of keys) assert.match(k, /^'[a-z0-9_]+'$/, `a key that is not a plain word: ${k}`);
  const names = sorted([...new Set(keys.map((k) => k.slice(1, -1)))]);
  const expected = [
    ...["today", "since", "days", "started", "first_week", "by_day", "by_week", "cohorts"],
    ...["day", ...TALLY_DAY_KEYS, ...TALLY_CAP_KEYS],
    ...["week", "active", "partial", "seen"],
  ];
  assert.deepEqual(names, sorted([...new Set(expected)]));
  const view = readRoot("src/lib/usage/view.ts");
  for (const k of names) assert.ok(new RegExp(`\\b${k}\\b`).test(view), `${k} is not in view.ts`);
  for (const k of names) assert.equal(/(^|_)ids?$|user|email|handle|name|ip|agent/.test(k), false, k);
  // It reads the tally and nothing else.
  assert.deepEqual([...new Set(tally.match(/from public\.[a-z_]+/g))], ["from public.usage_day_tally"]);
  // `started` comes from rows dated by the day itself, and the first whole
  // week is the Monday after the week it falls in.
  assert.ok(tally.includes("select min(t.day) into v_started from public.usage_day_tally t where t.metric in ('active_day', 'device_day', 'otto_open', 'map_open');"));
  assert.ok(tally.includes("v_first_week := v_started - (extract(isodow from v_started)::int - 1) + 7;"));
  assert.ok(tally.includes("when g.week + 7 * k > v_week then null"));
  assert.ok(tally.includes("when v_first_week is null or g.week + 7 * k < v_first_week then null"));
  assert.ok(tally.includes("'partial', v_first_week is null or w.week < v_first_week"));
});

test("the post-check runs both bodies and tries rows the table must refuse", () => {
  assert.ok(flat.includes("perform public.usage_touch('00000000-0000-0000-0000-000000000000'::uuid, 'phone', 'otto');"));
  assert.ok(flat.includes("perform public.admin_usage_tally(30);"));
  assert.ok(flat.includes("exception when check_violation then null;"));
  for (const probe of ["'active_day', 'someone'", "'device_day', 'tablet'", "'cohort', 'w5'", "'signed_up', 'all'", "'map_open', 'all', -1"]) {
    assert.ok(flat.includes(probe), probe);
  }
  // ...and one of each row the check-in writes, undone by a raise: a kept
  // table with an older CHECK stops the file, not the check-ins.
  for (const row of ["'otto_open', 'all', 1", "'map_open', 'capped', 1", "'cohort', 'w4', 1", "'device_day', 'unknown', 1"]) {
    assert.ok(flat.includes(row), row);
  }
  assert.ok(flat.includes("refuses a row the check-in writes"));
  assert.ok(flat.includes("when raise_exception then null;"));
  assert.ok(flat.includes("notify pgrst, 'reload schema';"));
  assert.ok(/^begin;$/m.test(code) && /^commit;$/m.test(code));
});

test('"active now" from 5 up and never on a campus under 10: users_active_count is 20261008120000\'s, floored twice per campus, with its grants kept', () => {
  const old = readRoot("supabase/migrations/20261008120000_users_last_active_private.sql").replace(/--[^\n]*/g, "");
  const m = /(create function public\.users_active_count\([\s\S]*?)\nas \$\$([\s\S]*?)\$\$;/.exec(old);
  assert.ok(m, "20261008120000's function");
  const oldHead = squash(m[1]).trim();
  const oldRows = /from public\.users u where (.*)(?=;)/.exec(squash(m[2]));
  assert.ok(oldRows, "20261008120000's rows");
  // 20261008120000's window, and its where without it: the same people, on or not.
  const window = "u.last_active_at >= now() - interval '5 minutes'";
  assert.ok(oldRows[1].startsWith(`${window} and `), oldRows[1]);
  const people = oldRows[1].slice(`${window} and `.length);
  const notCaller = "u.id is distinct from (select auth.uid())";

  // The same signature, language, volatility, SECURITY DEFINER and search_path.
  assert.ok(flat.includes(`${oldHead.replace("create function", "create or replace function")} as $active$`));
  assert.ok(flat.includes(
    "create or replace function public.users_active_count(p_campus_ids text[] default null) " +
      "returns bigint language sql stable security definer set search_path = public as $active$",
  ));
  // The same people, counted per campus, the window moved into the counts. A campus adds
  // nothing until 5 people OTHER than the caller are on (the caller switching their own
  // check-in on and off must not turn 0 into 5, "exactly 4 others") AND 5 other than the
  // caller are not on (Franky, Oct 14: who is NOT on; so never on a campus under 10), and
  // the caller still counts in a shown number.
  assert.equal(
    active.trim(),
    `select coalesce(sum(c.n) filter (where c.others >= ${ACTIVE_NOW_MIN} and c.m - c.others >= ${ACTIVE_NOW_MIN}), 0)::bigint ` +
      `from (select count(*) filter (where ${window}) as n, ` +
      `count(*) filter (where ${window} and ${notCaller}) as others, ` +
      `count(*) filter (where ${notCaller}) as m ` +
      `from public.users u where ${people} group by u.campus_id) c;`,
  );
  // Each floor on its own, so dropping either one fails here.
  assert.ok(active.includes(`(where c.others >= ${ACTIVE_NOW_MIN} `), "the floor of 5 others on");
  assert.ok(active.includes(` c.m - c.others >= ${ACTIVE_NOW_MIN})`), "the floor of 5 others not on");
  assert.equal(/c\.n >=/.test(active), false, "the floor is on the others, not on everyone with the caller");
  // The reviewer's draft counted the caller among those not on (count(*) as m, c.m - c.n):
  // switching their own check-in off and on would then answer the count, then 0.
  assert.equal(/count\(\*\) as m|c\.m - c\.n/.test(active), false, "the caller is left out of who is not on too");
  // The window is in the counts only, never in the where (that would make everyone "on").
  assert.equal(active.split(" from public.users u where ")[1].includes("last_active_at"), false);
  assert.equal(count(/group by/g, active), 1);

  // No grant and no revoke for it: create or replace keeps who may call it.
  assert.equal(/(grant|revoke)[^;]*users_active_count/.test(flat), false);
  // The pre-flight wants it there and alone, and keeps its grants for the post-check.
  assert.ok(flat.includes("if to_regprocedure('public.users_active_count(text[])') is null then"));
  assert.ok(flat.includes("sits beside users_active_count(text[])"));
  assert.equal(count(/vibe\.usage_tally_active_acl/g), 2);
  assert.ok(flat.includes("is distinct from current_setting('vibe.usage_tally_active_acl', true) then"));
  assert.ok(flat.includes("if not has_function_privilege(api, ac, 'execute') then"));

  // The post-check finds both floors in the body (each on its own, read with every run of
  // spaces as one) and asks it everywhere, per campus (0 under 10 people) and for no campus.
  assert.ok(flat.includes("select regexp_replace(p.prosrc, '\\s+', ' ', 'g') into src from pg_proc p where p.oid = ac;"));
  assert.ok(flat.includes(`if src not like '%count(*) filter (where ${window.replaceAll("'", "''")} and ${notCaller}) as others,%'`));
  assert.ok(flat.includes(`or src not like '%sum(c.n) filter (where c.others >= ${ACTIVE_NOW_MIN}%'`));
  assert.ok(flat.includes("or src not like '%group by u.campus_id) c;%' then"));
  assert.ok(flat.includes(`if src not like '%count(*) filter (where ${notCaller}) as m from public.users u where %'`));
  assert.ok(flat.includes(`or src not like '%c.m - c.others >= ${ACTIVE_NOW_MIN}), 0)::bigint%' then`));
  assert.ok(flat.includes(" users_active_count has no floor of 5 others active per campus;"));
  assert.ok(flat.includes(" users_active_count has no floor of 5 others not active per campus;"));
  assert.ok(flat.includes("and p.proconfig = array['search_path=public']"));
  assert.ok(flat.includes(`shown := public.users_active_count(null); if shown between 1 and ${ACTIVE_NOW_MIN - 1} then`));
  assert.ok(flat.includes(
    `shown := public.users_active_count(array[camp]); if shown between 1 and ${ACTIVE_NOW_MIN - 1} ` +
      "or (shown > 0 and (select count(*) from public.users u where u.campus_id = camp and public.user_visible(u.id)) " +
      `< ${2 * ACTIVE_NOW_MIN}) then`,
  ));
  assert.ok(flat.includes("if public.users_active_count(array[]::text[]) <> 0 then"));

  // Its comment says so.
  assert.ok(flat.includes("a campus adds nothing unless at least 5 people other than the caller are active there and "));
  assert.ok(flat.includes("at least 5 other than the caller are not, so the answer is 0 or 5 and up (\"active now\" is shown only from 5 up), a "));
  assert.ok(flat.includes("campus under 10 people never shows, and the caller''s own check-in never decides it. "));
});
