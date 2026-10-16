/**
 * Drift tests for the limiter's purge (Wave 2, B2.2), read as text:
 *   - supabase/migrations/20261015120000_rate_limits_purge.sql: the purge
 *     function, who may call it, the index, and the run at the file's end;
 *   - supabase/migrations/20261015130000_rate_limits_drop_raw_ip_rows.sql:
 *     the post-deploy delete of counts keyed on a network address;
 *   - the two crons that call the purge after their own job.
 * Both files were applied and checked on the local database; these keep a
 * later edit from quietly undoing what was checked.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/rate-limit-purge-migration.test.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

const codeSpec = "./tally/network-code.ts";
const { limiterNetworkCode } = (await import(codeSpec)) as typeof import("./tally/network-code");

const root = new URL("../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");

/** What Postgres runs: the file without its `--` notes. */
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");
/** On one line, every run of spaces as one, lower case. */
const squash = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

const purgeSql = readRoot("supabase/migrations/20261015120000_rate_limits_purge.sql");
const dropSql = readRoot("supabase/migrations/20261015130000_rate_limits_drop_raw_ip_rows.sql");
const purgeFlat = squash(strip(purgeSql));
const dropFlat = squash(strip(dropSql));

const purgeBody = (() => {
  const m = /as \$purge\$([\s\S]*?)\$purge\$;/.exec(strip(purgeSql));
  assert.ok(m, "the purge's body between $purge$ quotes");
  return squash(m[1]);
})();

/** The ten per-network limiters' prefixes (B2.1), and the reset form's old one. */
const NETWORK_PREFIXES = [
  "pw-reset-net",
  "school-email-ip",
  "school-code-ip",
  "waitlist-net",
  "waitlist-confirm-net",
  "waitlist-token-net",
  "personal-email-send-net",
  "personal-email-code-net",
  "school-checkin-send-net",
  "school-checkin-code-net",
];
const OLD_PREFIX = "pw-reset-ip";

test("the purge is a definer function on an empty search_path that answers an integer", () => {
  assert.match(
    purgeFlat,
    /create or replace function public\.rate_limits_purge\(\) returns integer language plpgsql volatile security definer set search_path = '' as \$purge\$/,
  );
  // It deletes, counts what went, and answers that count: nothing else.
  assert.match(purgeBody, /delete from public\.rate_limits where window_start < now\(\) - interval '1 day';/);
  assert.match(purgeBody, /get diagnostics v_deleted = row_count; return v_deleted;/);
  assert.equal((purgeBody.match(/\b(insert|update|delete)\b/g) ?? []).length, 1, "one write, the delete");
  assert.doesNotMatch(purgeBody, /\bselect\b/, "it never reads a key");
});

test("anon and authenticated are refused inside, before anything else", () => {
  const begin = purgeBody.indexOf(" begin ");
  assert.ok(begin >= 0);
  const firstStatement = purgeBody.slice(begin + " begin ".length);
  assert.ok(
    firstStatement.startsWith(
      "if current_setting('role', true) in ('anon', 'authenticated') then raise exception 'not allowed' using errcode = '42501'; end if;",
    ),
    "the role check is the body's first statement",
  );
});

test("every API role may call it, and nothing is revoked from one (the standing rule)", () => {
  assert.match(purgeFlat, /grant execute on function public\.rate_limits_purge\(\) to anon, authenticated, service_role;/);
  // PUBLIC's default may go; an API role's EXECUTE never does, in either file.
  for (const flat of [purgeFlat, dropFlat]) {
    for (const m of flat.matchAll(/revoke [^;]*;/g)) {
      assert.equal(m[0], "revoke all on function public.rate_limits_purge() from public;", `unexpected revoke: ${m[0]}`);
    }
  }
  assert.doesNotMatch(dropFlat, /\b(grant|revoke)\b/, "the post-deploy file changes no privilege");
  // The post-check holds the same line.
  assert.match(purgeFlat, /foreach api in array array\['anon', 'authenticated', 'service_role'\] loop if not has_function_privilege\(api, f, 'execute'\)/);
  assert.match(purgeFlat, /proconfig from pg_proc p where p\.oid = f\) is distinct from array\['search_path=""'\]/);
});

test("rate_limits gets an index on window_start, and rate_limit_hit is left alone", () => {
  assert.match(purgeFlat, /create index if not exists rate_limits_window_start_idx on public\.rate_limits \(window_start\);/);
  assert.match(purgeFlat, /to_regclass\('public\.rate_limits_window_start_idx'\)/, "the post-check looks for it");
  for (const flat of [purgeFlat, dropFlat]) {
    assert.doesNotMatch(flat, /function public\.rate_limit_hit/, "rate_limit_hit keeps its body and its 1-in-100 cleanup");
    assert.doesNotMatch(flat, /\b(alter|drop) table\b/);
  }
});

test("the file runs the purge once, after the grants, and checks nothing older than a day is left", () => {
  const grant = purgeFlat.indexOf("grant execute on function public.rate_limits_purge()");
  const run = purgeFlat.indexOf("n := public.rate_limits_purge();");
  const check = purgeFlat.indexOf("post-check failed: the function is missing");
  const left = purgeFlat.indexOf(
    "if exists (select 1 from public.rate_limits where window_start < now() - interval '1 day') then",
  );
  const commit = purgeFlat.lastIndexOf("commit;");
  assert.ok(grant > 0 && run > grant, "the run comes after the grants");
  assert.ok(check > run && left > check, "the post-check, with its no-old-rows line, comes after the run");
  assert.ok(commit > left, "all inside the transaction");
  assert.ok(purgeFlat.trimStart().startsWith("begin; set local lock_timeout = '5s';"));
  assert.match(purgeFlat, /notify pgrst, 'reload schema'; commit;\s*$/);
});

test("'over a day ago' is past the end of every window the limiter allows", () => {
  // A window that started over a day ago has ended only if no window is
  // longer than a day: rate-limit.ts refuses any other.
  const limiter = readRoot("src/lib/rate-limit.ts");
  assert.match(limiter, /const DAY_SEC = 86_400;/);
  assert.match(limiter, /windowSec <= DAY_SEC && DAY_SEC % windowSec === 0/);
});

// ---------------------------------------------------------------------------
// The post-deploy file
// ---------------------------------------------------------------------------

/** The quoted words of the `prefixes text[] := array[...]` list. */
const listed = (() => {
  const m = /prefixes text\[\] := array\[([^\]]*)\]/.exec(dropFlat);
  assert.ok(m, "the prefix list");
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
})();

/** The pattern a code must match, read from the delete. */
const codePattern = (() => {
  const m = /substr\(key, length\(split_part\(key, ':', 1\)\) \+ 2\) !~ '([^']+)'/.exec(dropFlat);
  assert.ok(m, "the delete's code pattern");
  return new RegExp(m[1]);
})();

/** The delete's rule, as Postgres runs it: a listed prefix and a rest that isn't a code. */
function deletes(key: string): boolean {
  const prefix = key.split(":")[0];
  return listed.includes(prefix) && !codePattern.test(key.slice(prefix.length + 1));
}

/** The three address shapes the post-check refuses under any prefix, read from the file. */
const shapes = (() => {
  const v4 = /where key ~ '([^']+)'/.exec(dropFlat);
  const bucket = /or key ~\* '([^']+)'/.exec(dropFlat);
  const v6 = /or substr\(key, strpos\(key, ':'\) \+ 1\) ~\* '([^']+)'/.exec(dropFlat);
  assert.ok(v4 && bucket && v6, "the three address shapes");
  return { v4: new RegExp(v4[1]), bucket: new RegExp(bucket[1], "i"), v6: new RegExp(v6[1], "i") };
})();
const addressShaped = (key: string) =>
  shapes.v4.test(key) || shapes.bucket.test(key) || shapes.v6.test(key.slice(key.indexOf(":") + 1));

test("the post-deploy file says when to apply it, and needs the purge first", () => {
  assert.match(dropSql, /POST-DEPLOY\. APPLY ONLY AFTER THE CODE IS LIVE/);
  assert.match(dropFlat, /if to_regprocedure\('public\.rate_limits_purge\(\)'\) is null then raise exception/);
  assert.doesNotMatch(dropFlat, /create (or replace )?function/);
});

test("it lists the ten per-network prefixes and the old reset one, each still a limiter in src/", () => {
  assert.deepEqual([...listed].sort(), [...NETWORK_PREFIXES, OLD_PREFIX].sort());
  const sources: string[] = [];
  const walk = (dir: URL) => {
    for (const name of readdirSync(dir)) {
      const at = new URL(name, dir);
      if (statSync(at).isDirectory()) walk(new URL(`${name}/`, dir));
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) sources.push(readFileSync(at, "utf8"));
    }
  };
  walk(new URL("src/", root));
  const all = sources.join("\n");
  for (const prefix of NETWORK_PREFIXES) {
    assert.ok(all.includes(`${prefix}:`) || all.includes(`"${prefix}"`), `${prefix} is no longer a limiter prefix in src/`);
  }
});

test("address keys under the list go, codes and every other key stay", () => {
  const secret = "test-secret-at-least-16-chars";
  for (const prefix of [...NETWORK_PREFIXES, OLD_PREFIX]) {
    const code = limiterNetworkCode(prefix, "203.0.113.7", "2026-10-15", secret);
    assert.ok(code, prefix);
    assert.equal(deletes(`${prefix}:${code}`), false, `${prefix}: a real code is kept`);
    for (const rest of ["203.0.113.7", "2001:db8:85a3:1234::/64", "2001:DB8::1", "unknown", ""]) {
      assert.equal(deletes(`${prefix}:${rest}`), true, `${prefix}:${rest} goes`);
    }
  }
  // Not listed: never touched by the delete, whatever the rest is.
  for (const key of ["tally-open-net:203.0.113.7", "waitlist-global", "pw-reset-email:abc", "waitlist-net-day:203.0.113.7"]) {
    assert.equal(deletes(key), false, key);
  }
});

test("the post-check finds an address under any prefix, and none of the app's own key shapes", () => {
  const uuid = "6f1c2d3e-0000-4000-8000-000000000001";
  const code = limiterNetworkCode("tally-open-net", "203.0.113.7", "2026-10-15", "test-secret-at-least-16-chars");
  for (const key of ["x:192.0.2.1", "x:y:192.0.2.1", "x:2001:db8:1:2::/64", "x:2001:db8::1", "x:2001:DB8:0:0:0:0:0:9", "x:::ffff:192.0.2.1"]) {
    assert.equal(addressShaped(key), true, key);
  }
  for (const key of [
    `like:${uuid}`,
    `push-tag:${uuid}:chat`,
    `push:${uuid}:activity`,
    `push-request:${uuid}:${uuid}`,
    `upload:org-upload-url:${uuid}`,
    `tally-open-net:${code}`,
    `pw-reset-email:${"ab".repeat(32)}`,
    "waitlist-global",
    "tally-open-all",
  ]) {
    assert.equal(addressShaped(key), false, key);
  }
  // Both checks stop the file; neither prints a key.
  assert.match(dropFlat, /if n_left > 0 then raise exception/);
  assert.match(dropFlat, /if shaped is not null then raise exception/);
  assert.match(dropFlat, /string_agg\(distinct split_part\(key, ':', 1\)/);
  // The delete, then the purge, then the checks.
  const del = dropFlat.indexOf("delete from public.rate_limits");
  const purge = dropFlat.indexOf("n_purged := public.rate_limits_purge();");
  const check = dropFlat.indexOf("select count(*) into n_left");
  assert.ok(del > 0 && purge > del && check > purge);
});

// ---------------------------------------------------------------------------
// The two crons
// ---------------------------------------------------------------------------

const CRONS = [
  { path: "/api/cron/waitlist-purge", job: "deleted = await purgeExpiredWaitlist(service);" },
  { path: "/api/cron/school-checkin", job: "const pass = await checkinPass(service);" },
];

test("both daily crons are scheduled, and each runs the purge after its own job", () => {
  const config = JSON.parse(readRoot("vercel.json")) as { crons?: { path: string }[] };
  for (const { path, job } of CRONS) {
    assert.ok(config.crons?.some((c) => c.path === path), `vercel.json no longer runs ${path}`);
    const src = readRoot(`src/app${path}/route.ts`);
    const jobAt = src.indexOf(job);
    const purgeAt = src.indexOf("await purgeLimitCounts(service)");
    assert.ok(jobAt > 0, `${path}: its own job`);
    assert.ok(purgeAt > jobAt, `${path}: the purge runs after the job`);
    assert.equal(src.split('.rpc("rate_limits_purge")').length - 1, 1, `${path}: one call to the purge`);
  }
});

test("a failed purge is logged and answered as null, never as the job failing", () => {
  for (const { path } of CRONS) {
    const src = readRoot(`src/app${path}/route.ts`);
    const helper = /async function purgeLimitCounts\([^)]*\): Promise<number \| null> \{([\s\S]*?)\n\}/.exec(src);
    assert.ok(helper, `${path}: the purge helper`);
    const body = helper[1];
    // Cut off before maxDuration, caught, and a number or null: never rows or a key.
    assert.match(body, /\.abortSignal\(AbortSignal\.timeout\(LIMIT_PURGE_TIMEOUT_MS\)\)/);
    assert.match(body, /try \{[\s\S]*\} catch \(err\) \{[\s\S]*return null;/);
    assert.match(body, /if \(error\) \{[\s\S]*?return null;\s*\}/);
    assert.match(body, /return typeof data === "number" \? data : null;/);
    assert.doesNotMatch(body, /console\.\w+\([^;]*\bdata\b/, "the log never prints the answer");
    // The answer carries the count beside the job's own, whatever the job did.
    assert.ok((src.match(/rate_limits_deleted/g) ?? []).length >= 2, `${path}: the answer says how many went`);
    assert.doesNotMatch(src, /return NextResponse\.json\(\{ ok: false, error: "(purge|run)_failed" \}/, "a job failure still waits for the purge");
  }
  const wait = readRoot("src/app/api/cron/waitlist-purge/route.ts");
  assert.match(wait, /const rate_limits_deleted = service \? await purgeLimitCounts\(service\) : null;/);
  assert.match(wait, /\{ ok: false, error: "purge_failed", rate_limits_deleted \}, \{ status: 500/);
  const checkin = readRoot("src/app/api/cron/school-checkin/route.ts");
  assert.match(checkin, /NextResponse\.json\(\{ \.\.\.pass\.body, rate_limits_deleted \}, \{ status: pass\.status/);
});
