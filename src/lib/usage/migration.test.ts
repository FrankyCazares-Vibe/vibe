/**
 * Drift tests for the Usage tab's database function
 * (`supabase/migrations/20261014120000_admin_usage_summary.sql`), read as
 * text: who may call it, and that it can only ever answer totals. The
 * function itself was checked on the local database; these keep a later
 * edit from quietly undoing what was checked.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/usage/migration.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");

const sql = readRoot("supabase/migrations/20261014120000_admin_usage_summary.sql");
/** What Postgres runs: the file without its `--` notes. */
const code = sql.replace(/--[^\n]*/g, "");
/** The same, on one line, every run of spaces as one, lower case. */
const flat = code.replace(/\s+/g, " ").toLowerCase();
const fnMatch = /as \$fn\$([\s\S]*?)\$fn\$;/.exec(code);
assert.ok(fnMatch, "the function's body, between its $fn$ quotes");
const body = fnMatch[1].replace(/\s+/g, " ").toLowerCase();

const count = (re: RegExp, text = code) => (text.match(re) ?? []).length;

/** Every key a jsonb_build_object names: its 1st, 3rd, 5th... arguments. */
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

test("it runs as its owner, with an empty search path, only reads, and can be run again", () => {
  assert.ok(
    flat.includes(
      "create or replace function public.admin_usage_summary(p_days integer default 30) returns jsonb " +
        "language plpgsql stable security definer set search_path = '' as $fn$",
    ),
  );
  // Asked for in the pre-flight and the post-check.
  assert.ok(count(/to_regprocedure\('public\.admin_usage_summary\(integer\)'\)/g) >= 2);
  // A second run replaces it; the pre-flight no longer stops on "already exists".
  assert.equal(flat.includes("already exists"), false);
  assert.ok(flat.includes("least(greatest(coalesce(p_days, 30), 7), 90)"));
});

test("the browser's two roles are refused first thing, inside, with 42501", () => {
  const afterBegin = body.slice(body.indexOf(" begin ") + " begin ".length);
  assert.ok(
    afterBegin.startsWith(
      "if current_setting('role', true) in ('anon', 'authenticated') then " +
        "raise exception 'not allowed' using errcode = '42501'; end if;",
    ),
    afterBegin.slice(0, 160),
  );
});

test("every API role keeps EXECUTE (the standing rule), PUBLIC loses it, and the post-check says so", () => {
  assert.ok(flat.includes("revoke all on function public.admin_usage_summary(integer) from public;"));
  assert.ok(
    flat.includes("grant execute on function public.admin_usage_summary(integer) to anon, authenticated, service_role;"),
  );
  // Taking EXECUTE away from a role crashes the backend on Supabase's image.
  assert.equal(/revoke\s+execute/i.test(sql), false);
  for (const revoke of flat.match(/revoke [^;]*;/g) ?? []) {
    assert.equal(/\b(anon|authenticated|service_role)\b/.test(revoke), false, revoke);
  }
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.ok(flat.includes(`has_function_privilege('${role}', f, 'execute')`), role);
  }
  assert.ok(flat.includes("a.grantee = 0"));
  assert.ok(flat.includes("is distinct from array['search_path=\"\"']"));
  assert.ok(flat.includes("p.provolatile from pg_proc p where p.oid = f) <> 's'"));
});

test("the answer's keys are the shape view.ts reads, and none of them names a person", () => {
  const keys = builtKeys(code);
  for (const k of keys) assert.match(k, /^'[a-z0-9_]+'$/, `a key that is not a plain word: ${k}`);
  const names = [...new Set(keys.map((k) => k.slice(1, -1)))].sort();
  const view = readRoot("src/lib/usage/view.ts");
  for (const k of names) assert.ok(new RegExp(`\\b${k}\\b`).test(view), `${k} is not in view.ts`);
  for (const k of names) assert.equal(/(^|_)ids?$|handle|email|referrer|otto|content|body|user/.test(k), false, k);
  // The only names it reads are a club's and a campus's, both public.
  assert.ok(flat.includes("select o.id, o.name from public.orgs o where o.hidden_at is null"));
  assert.ok(flat.includes("coalesce(ca.name, 'not picked')"));
  assert.equal(count(/\bu\.(name|handle)\b|\bhandle\b/g), 0);
});

test("never where a view came from, an address of a network, or what anyone wrote", () => {
  assert.equal(/referrer/i.test(sql), false);
  assert.equal(/\bip\b|\binet\b|forwarded|user_agent/i.test(code), false);
  // messages, posts and comments keep their words in content; events in title, description, location.
  assert.equal(/\.(content|body|text|caption|title|description|location|media_url|removed_reason|reason)\b/i.test(code), false);
  assert.equal(/\b(content|body|caption)\b/i.test(code), false);
});

test("Otto's answers are tested for emptiness, never opened", () => {
  assert.equal(/otto_answers\s*(->|#>|\?|@>|<@)/.test(code), false);
  assert.equal(/jsonb_(each|object_keys|path|to_record)/.test(code), false);
  assert.equal(count(/otto_answers/g), 2);
  assert.ok(flat.includes("(jsonb_typeof(u.otto_answers) = 'object' and u.otto_answers <> '{}'::jsonb) as onboarded"));
});

test("a sign-in address is read once, for the school test, and never returned", () => {
  assert.equal(count(/\bemail\b/g), 1);
  assert.ok(flat.includes("coalesce(split_part(lower(au.email), '@', 2) ~ '(^|\\.)(iu|purdue)\\.edu$', false) as school_address"));
  // The test's answer is used in a where, never built into the answer.
  assert.equal(count(/school_address/g), 2);
  assert.equal(/recipient_(hash|domain)/.test(code), false);
});

test("the waitlist log is read for its batch only, and without the founders' actor test", () => {
  assert.equal(/\bmeta\b(?!\s*->>\s*'batch')/.test(code), false);
  assert.equal(/actor_id|target_(id|type)/.test(code), false);
  assert.ok(flat.includes("coalesce(ma.meta ->> 'batch', '') not like 'test-%'"));
});

test("founders and store-review accounts are left out; days are UTC and weeks are Monday weeks", () => {
  assert.ok(flat.includes("where u.is_platform_admin or coalesce(au.raw_app_meta_data @> '{\"vibe_review_account\": true}'::jsonb, false)"));
  // Exactly these, each named in the next test: a dropped one fails here too.
  assert.equal(count(/<> all \(v_out\)/g), 23);
  // date_trunc('week', a date) goes through the session's time zone.
  assert.equal(/date_trunc/.test(code), false);
  const zones = code.match(/at time zone '[^']*'/g) ?? [];
  assert.ok(zones.length > 0);
  for (const z of zones) assert.equal(z, "at time zone 'utc'");
  assert.ok(flat.includes("v_week := v_today - (extract(isodow from v_today)::int - 1);"));
});

/** The function's body from one marker up to the next, flattened. */
function between(from: string, to: string): string {
  const at = body.indexOf(from);
  assert.ok(at !== -1, from);
  const end = body.indexOf(to, at + from.length);
  assert.ok(end !== -1, to);
  return body.slice(at, end);
}

test("every count tests the one who acted, and every club count drops the hidden clubs", () => {
  // What gets used: one union branch per metric, each with its own tests.
  const branches = new Map<string, string>();
  for (const part of between("with used_rows (metric, day) as (", "used_days as (").split(/ union all (?=select )/)) {
    const m = /select ('[a-z_]+'|c\.type), /.exec(part);
    assert.ok(m, part.slice(0, 80));
    branches.set(m[1].replace(/'/g, ""), part);
  }
  const hidden = (alias: string) => `join public.orgs o on o.id = ${alias}.org_id and o.hidden_at is null`;
  const expected: Record<string, string[]> = {
    posts: [
      "from public.posts p",
      "p.user_id <> all (v_out)",
      "not exists (select 1 from public.orgs o where o.id = p.org_id and o.hidden_at is not null)",
    ],
    comments: ["from public.post_comments c where c.user_id <> all (v_out)"],
    likes: ["from public.post_likes l where l.user_id <> all (v_out)"],
    reposts: ["from public.post_reposts r where r.user_id <> all (v_out)"],
    saves: ["from public.bookmarks b where b.user_id <> all (v_out)"],
    events: ["from public.events e", hidden("e"), "where e.creator_id <> all (v_out)"],
    rsvps: ["from public.rsvps r", "join public.events e on e.id = r.event_id", hidden("e"), "where r.user_id <> all (v_out)"],
    people_follows: ["from public.connections f where f.follower_id <> all (v_out)"],
    club_follows: ["from public.org_followers f", hidden("f"), "where f.source <> 'join' and f.user_id <> all (v_out)"],
    club_members: ["from public.org_members m", hidden("m"), "where m.user_id <> all (v_out)"],
    club_relationships: ["from public.org_follow_firsts ff", hidden("ff"), "where ff.user_id <> all (v_out)"],
    club_chat_messages: [
      "from public.messages m",
      "join public.channels c on c.id = m.channel_id",
      hidden("c"),
      "where m.user_id <> all (v_out)",
    ],
    "c.type": ["from public.messages m", "where c.type in ('dm', 'group') and m.user_id <> all (v_out)"],
  };
  assert.deepEqual([...branches.keys()].sort(), Object.keys(expected).sort());
  for (const [metric, parts] of Object.entries(expected)) {
    for (const part of parts) assert.ok(branches.get(metric)?.includes(part), `${metric}: ${part}`);
  }

  // The door, the waves, coming back, the clubs and where: the other ten.
  for (const clause of [
    "left join auth.users au on au.id = u.id where u.id <> all (v_out) ), door_rows (kind, day) as (",
    "where u.id <> all (v_out) and coalesce(c.batch, '') not like 'test-%' group by",
    ") x where x.uid <> all (v_out) ), seen as (",
    "where s.uid <> all (v_out) group by s.uid",
    "join auth.users au on au.id = u.id where u.id <> all (v_out) and au.email_confirmed_at is not null",
    "join visible o on o.id = m.org_id where m.role in ('owner', 'admin', 'mod') and m.user_id <> all (v_out)",
    "join visible o on o.id = c.org_id where m.user_id <> all (v_out) and m.created_at >= v_now - interval '30 days'",
    "join visible o on o.id = e.org_id where e.creator_id <> all (v_out)",
    "where m.org_id = o.id and m.user_id <> all (v_out)) as members",
    "from public.users u where u.id <> all (v_out) )",
  ]) {
    assert.ok(body.includes(clause), clause);
  }
  // Per club reads only the visible ones; an officer's acts go through officers.
  assert.ok(body.includes("from visible o ) select jsonb_build_object( 'visible',"));
  assert.equal(count(/join officers f on f\.org_id = /g), 3);
});

test("a look at your own post or profile is not a look, and a view counts from the start of its day", () => {
  assert.ok(body.includes("join public.posts p on p.id = pv.post_id where p.user_id <> pv.user_id"));
  assert.ok(body.includes("where prv.viewer_user_id <> prv.profile_user_id"));
  // Views carry a day and no time: without this they would be in "did
  // something this week" and missing from "last 7 days".
  assert.ok(body.includes("select a.uid, coalesce(a.at, a.day::timestamp at time zone 'utc') as at from acts a union all"));
});
