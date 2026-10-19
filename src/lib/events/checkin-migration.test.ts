/**
 * Drift tests for event check-in's database half
 * (`supabase/migrations/20261019120000_event_checkins.sql`, Oct 19 2026),
 * read as text, the src/lib/usage/migration.test.ts idiom: who may call what,
 * what the record holds, and that the database's numbers equal the ones in
 * event-checkin.ts the routes and screens use. The file's behaviour is
 * checked on the local stack by scripts/sql/event-checkins-check.sql; these
 * keep a later edit from quietly undoing it.
 *
 * Run with:
 *   node --test --experimental-strip-types src/lib/events/checkin-migration.test.ts
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const spec = "./event-checkin.ts";
const m = (await import(spec)) as typeof import("./event-checkin");

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
const sql = readRoot("supabase/migrations/20261019120000_event_checkins.sql");
/** What Postgres runs: the file without its `--` notes. */
const code = sql.replace(/--[^\n]*/g, "");
/** The same, on one line, every run of spaces as one, lower case. */
const flat = code.replace(/\s+/g, " ").toLowerCase();
const count = (needle: string, text = flat) => text.split(needle).length - 1;

/** Each `create function`, from its name to the end of its body. */
type Fn = { name: string; types: string; text: string };
const fns: Fn[] = [];
for (const match of flat.matchAll(/create function public\.(\w+)\(([^)]*)\)/g)) {
  const start = match.index ?? 0;
  const tag = /as (\$fn\$|\$\$)/.exec(flat.slice(start));
  assert.ok(tag, `the body of ${match[1]}`);
  const bodyAt = start + tag.index + tag[0].length;
  const end = flat.indexOf(`${tag[1]};`, bodyAt);
  assert.ok(end > bodyAt, `the end of ${match[1]}`);
  const types = match[2]
    .split(",")
    .map((arg) => arg.trim().split(" ").pop() ?? "")
    .filter(Boolean)
    .join(", ");
  fns.push({ name: match[1], types, text: flat.slice(start, end) });
}
const fn = (name: string): Fn => {
  const found = fns.find((f) => f.name === name);
  assert.ok(found, `function ${name}`);
  return found;
};

const OFFICER_FNS = [
  "event_checkin_open",
  "event_checkin_close",
  "event_checkin_door",
  "event_checkin_mark",
  "event_checkin_unmark",
  "event_checkin_clear",
];

test("exactly the two tables and the ten functions", () => {
  assert.deepEqual(
    [...flat.matchAll(/create table public\.(\w+)/g)].map((x) => x[1]),
    ["event_checkins", "event_checkin_sessions"],
  );
  assert.deepEqual(
    fns.map((f) => f.name).sort(),
    [
      "event_checkin_clear",
      "event_checkin_close",
      "event_checkin_derive",
      "event_checkin_door",
      "event_checkin_mark",
      "event_checkin_mine",
      "event_checkin_open",
      "event_checkin_self_as",
      "event_checkin_state",
      "event_checkin_unmark",
    ],
  );
  assert.equal(count("create or replace"), 0, "a second apply must fail, not overwrite");
  assert.equal(count("alter function"), 0);
  assert.equal(count("drop "), 0, "the file drops nothing (the rollback sits in its notes)");
});

test("each function is SECURITY DEFINER with an empty search_path", () => {
  for (const f of fns) {
    assert.ok(f.text.includes("security definer"), `${f.name}: security definer`);
    assert.ok(f.text.includes("set search_path = ''"), `${f.name}: search_path ''`);
  }
});

test("each function: revoke all from public, EXECUTE to every API role, never a revoke of EXECUTE", () => {
  for (const f of fns) {
    const sig = `public.${f.name}(${f.types})`;
    assert.equal(count(`revoke all on function ${sig} from public;`), 1, `revoke ${sig}`);
    assert.equal(count(`grant execute on function ${sig} to anon, authenticated, service_role;`), 1, `grant ${sig}`);
  }
  assert.equal(count("revoke execute"), 0, "a revoke is a crash button (20260922090000)");
  assert.equal(count("grant execute"), fns.length);
});

test("event_checkins: everything revoked, then SELECT and DELETE for signed-in students only", () => {
  assert.equal(count("revoke all on table public.event_checkins from anon, authenticated, service_role;"), 1);
  const grants = [...flat.matchAll(/grant ([a-z, ]+) on table public\.event_checkins to ([a-z_, ]+);/g)];
  assert.deepEqual(grants.map((g) => [g[1], g[2]]), [["select, delete", "authenticated"]]);
  assert.ok(flat.includes("alter table public.event_checkins enable row level security;"));
  assert.deepEqual(
    [...flat.matchAll(/create policy (\w+) on public\.event_checkins for (\w+) to (\w+)/g)].map((p) => [p[1], p[2], p[3]]),
    [
      ["event_checkins_select_own_or_manager", "select", "authenticated"],
      ["event_checkins_delete_own", "delete", "authenticated"],
    ],
  );
  assert.ok(flat.includes("using (user_id = (select auth.uid()) or public.can_manage_event(event_id));"));
  assert.ok(flat.includes("for delete to authenticated using (user_id = (select auth.uid()));"));
});

test("event_checkin_sessions: revoked, RLS on, and no grant and no policy at all", () => {
  assert.equal(count("revoke all on table public.event_checkin_sessions from anon, authenticated, service_role;"), 1);
  assert.ok(flat.includes("alter table public.event_checkin_sessions enable row level security;"));
  assert.equal(count("on table public.event_checkin_sessions to"), 0);
  assert.equal(count("on public.event_checkin_sessions for"), 0);
  assert.ok(flat.includes("check (octet_length(secret) = 32)"));
  assert.ok(flat.includes("extensions.gen_random_bytes(32)"));
});

test("the three foreign keys cascade on delete, and nothing else references anything", () => {
  assert.equal(count("references public.events (id) on delete cascade"), 2);
  assert.equal(count("references public.users (id) on delete cascade"), 1);
  assert.equal(count("references "), 3);
  assert.equal(count("foreign key ("), 3);
  assert.equal(count("set null"), 0, "no SET NULL key (the moderation_actions trap)");
  assert.equal(count("create trigger"), 0, "no trigger can refuse an account delete's cascade");
});

test("the record holds no time and no method: event_id and user_id only", () => {
  const start = flat.indexOf("create table public.event_checkins (");
  const end = flat.indexOf(");", start);
  const table = flat.slice(start, end);
  for (const word of ["timestamptz", "timestamp", "method", "created_at", "inet", "location", "officer", "marked_by"]) {
    assert.equal(table.includes(word), false, `event_checkins holds ${word}`);
  }
  const columns = [...table.matchAll(/[(,] (\w+) (uuid|bytea|text|integer|bigint|boolean)\b/g)].map((c) => c[1]);
  assert.deepEqual(columns, ["event_id", "user_id"]);
});

test("self_as refuses every browser role with 42501; it alone takes p_user", () => {
  const self = fn("event_checkin_self_as");
  assert.ok(
    self.text.includes("begin if current_setting('role', true) in ('anon', 'authenticated') then raise exception 'not allowed' using errcode = '42501';"),
    "the role check is the first statement",
  );
  assert.ok(self.text.includes("if (p_code is null) = (p_token is null) then raise exception 'exactly one of p_code and p_token' using errcode = '22023';"));
  assert.equal(self.text.includes("auth.uid()"), false, "under the service role auth.uid() is null: never read");
  assert.deepEqual(fns.filter((f) => f.text.includes("p_user uuid")).map((f) => f.name), ["event_checkin_self_as"]);
});

test("every officer function refuses a call with no account (42501) before reading anything", () => {
  for (const name of OFFICER_FNS) {
    const f = fn(name);
    const begin = f.text.indexOf(" begin ");
    assert.ok(begin > 0, `${name}: begin`);
    assert.ok(
      f.text.slice(begin).startsWith(" begin if (select auth.uid()) is null then raise exception 'not allowed' using errcode = '42501'; end if;"),
      `${name}: the null-caller refusal comes first`,
    );
    assert.ok(f.text.includes("public.can_manage_event(p_event_id)"), `${name}: asks can_manage_event`);
  }
  // Starting, showing codes and marking are refused to a restricted officer;
  // stopping, taking one off and clearing only take away, so they are not.
  for (const name of ["event_checkin_open", "event_checkin_door", "event_checkin_mark"]) {
    assert.ok(fn(name).text.includes("if public.is_restricted_now() then"), `${name}: restriction`);
  }
  for (const name of ["event_checkin_close", "event_checkin_unmark", "event_checkin_clear"]) {
    assert.equal(fn(name).text.includes("is_restricted_now"), false, `${name}: no restriction gate`);
  }
});

/** A TS duration as the SQL interval the file writes: '1 hour', '24 hours'. */
const pgHours = (ms: number) => {
  const h = ms / 3_600_000;
  assert.ok(Number.isInteger(h) && h > 0, `${ms} ms is a whole number of hours`);
  return `interval '${h} ${h === 1 ? "hour" : "hours"}'`;
};

test("the window in SQL equals the window in TypeScript", () => {
  // The functions read the times as e.starts_at / e.ends_at or into v_starts / v_ends.
  const edge = (text: string, col: "starts" | "ends", sign: "-" | "+", ms: number) =>
    text.includes(`.${col}_at ${sign} ${pgHours(ms)}`) || text.includes(`v_${col} ${sign} ${pgHours(ms)}`);
  for (const name of ["event_checkin_open", "event_checkin_door", "event_checkin_self_as", "event_checkin_state"]) {
    const t = fn(name).text;
    assert.ok(edge(t, "starts", "-", m.CHECKIN_OPENS_BEFORE_MS), `${name}: opens an hour before the start`);
    assert.ok(edge(t, "ends", "+", m.CHECKIN_CLOSES_AFTER_MS), `${name}: closes an hour after the end`);
  }
  const mark = fn("event_checkin_mark").text;
  assert.ok(edge(mark, "starts", "-", m.CHECKIN_OPENS_BEFORE_MS), "mark: from an hour before the start");
  assert.ok(edge(mark, "ends", "+", m.CHECKIN_MARK_CLOSES_AFTER_MS), "mark: to a day after the end");
  assert.equal(edge(mark, "ends", "+", m.CHECKIN_CLOSES_AFTER_MS), false, "mark runs to a day after, not an hour");
  // Every interval in the file is one of these two.
  const intervals = new Set([...flat.matchAll(/interval '[^']*'/g)].map((x) => x[0]));
  assert.deepEqual([...intervals].sort(), [pgHours(m.CHECKIN_CLOSES_AFTER_MS), pgHours(m.CHECKIN_MARK_CLOSES_AFTER_MS)].sort());
  assert.equal(m.CHECKIN_OPENS_BEFORE_MS, m.CHECKIN_CLOSES_AFTER_MS);
});

test("the step, the code and the token in SQL equal the TypeScript numbers", () => {
  const steps = [...flat.matchAll(/floor\(extract\(epoch from now\(\)\) \/ (\d+)\)/g)].map((x) => Number(x[1]));
  assert.equal(steps.length, 2, "door and self_as each take the step");
  for (const s of steps) assert.equal(s, m.CHECKIN_STEP_SEC);
  const stamps = [...flat.matchAll(/to_timestamp\(\(?v_step(?: \+ \d)?\)? \* (\d+)\)/g)].map((x) => Number(x[1]));
  assert.equal(stamps.length, 3);
  for (const s of stamps) assert.equal(s, m.CHECKIN_STEP_SEC);
  // The code: 4 digits (mod 10^4, padded to 4); the token: 16 bytes = 22 base64url characters.
  assert.ok(flat.includes(`% ${10 ** m.CHECKIN_CODE_DIGITS})::text, ${m.CHECKIN_CODE_DIGITS}, '0')`));
  assert.ok(flat.includes("substring(h.hl from 1 for 16)"));
  assert.equal(Math.ceil((16 * 8) / 6), m.CHECKIN_TOKEN_LENGTH);
  assert.ok(flat.includes(`p_code ~ '^[0-9]{${m.CHECKIN_CODE_DIGITS}}$'`));
  const tokenRe = /p_token ~ '([^']+)'/.exec(code)?.[1];
  assert.equal(tokenRe, `^[A-Za-z0-9_-]{${m.CHECKIN_TOKEN_LENGTH}}$`);
  // The SQL shape and isCheckinToken agree on every probe.
  const sqlToken = new RegExp(tokenRe);
  for (const probe of ["UVxxReBJ3ewsgZRtrv3ISQ", "qlMyCJLtE-U9y9KYwGZWXQ", "UVxxReBJ3ewsgZRtrv3IS", "UVxxReBJ3ewsgZRtrv3IS+", "UVxxReBJ3ewsgZRtrv3ISQ="]) {
    assert.equal(sqlToken.test(probe), m.isCheckinToken(probe), probe);
  }
  // A typed code lives two steps (this one and the one before); a QR token four.
  assert.ok(fn("event_checkin_self_as").text.includes("for i in 0..1 loop"));
  assert.ok(fn("event_checkin_self_as").text.includes("for i in 0..3 loop"));
  assert.equal(count("for i in"), 2);
});

test("derive's math, redone with Node's HMAC, gives the post-check's fixed values", () => {
  const key = Buffer.alloc(32, 0xab);
  const derive = (event: string, step: number) => {
    const hc = createHmac("sha256", key).update(`${event}:${step}:code`).digest();
    const hl = createHmac("sha256", key).update(`${event}:${step}:link`).digest();
    const codeOut = String(hc.readUInt32BE(0) % 10 ** m.CHECKIN_CODE_DIGITS).padStart(m.CHECKIN_CODE_DIGITS, "0");
    return `${codeOut}/${hl.subarray(0, 16).toString("base64url")}`;
  };
  const one = "00000000-0000-0000-0000-000000000001";
  for (const step of [0, 1]) {
    const want = derive(one, step);
    assert.ok(code.includes(`if got is distinct from '${want}' then`), `step ${step}: ${want}`);
    const [c, t] = want.split("/");
    assert.equal(m.isDoorCode(c), true);
    assert.equal(m.isCheckinToken(t), true);
  }
  assert.ok(flat.includes("extensions.hmac(convert_to(p_event_id::text || ':' || p_step::text || ':code', 'utf8'), p_secret, 'sha256')"));
  assert.ok(flat.includes("extensions.hmac(convert_to(p_event_id::text || ':' || p_step::text || ':link', 'utf8'), p_secret, 'sha256')"));
});

test("the from-5 floor sits in event_checkin_state, and the list fits its id cap", () => {
  const state = fn("event_checkin_state");
  assert.ok(state.text.includes(`case when n.total >= ${m.CHECKIN_PUBLIC_FLOOR} or public.can_manage_event(e.id) then n.total end`));
  assert.ok(state.text.includes("and public.event_visible(e.org_id, e.creator_id, e.id)"));
  assert.ok(state.text.includes("if (select auth.uid()) is null then return;"), "nothing for anon or the service role");
  const cap = Number(/cardinality\(p_event_ids\), 0\) > (\d+)/.exec(state.text)?.[1]);
  const listMax = Number(/const MAX_LIMIT = (\d+);/.exec(readRoot("src/app/api/events/route.ts"))?.[1]);
  assert.ok(listMax > 0 && listMax <= cap, `the list sends at most ${listMax} ids; the cap is ${cap}`);
});

test("the pre-flight pins the four helpers by md5, and the behaviour check undoes itself", () => {
  for (const [name, md5] of [
    ["can_manage_event(uuid)", "f09163bbf84c24ae3c17d7922ce9c2e7"],
    ["event_visible(uuid,uuid,uuid)", "ca3d34f65cb01af1a826df053d97b384"],
    ["is_restricted_now()", "b98aa3d1c7e1cbb55b8d4aa95e0def02"],
    ["has_recorded_consent()", "23121c3d37d2a99826699353fd13036d"],
  ]) {
    assert.ok(code.includes(`to_regprocedure('public.${name}')`), name);
    assert.ok(code.includes(`got is distinct from '${md5}'`), `${name} ${md5}`);
  }
  assert.ok(code.includes("using errcode = 'P0C91'") && code.includes("exception when sqlstate 'P0C91' then"));
  assert.ok(/^begin;$/m.test(code) && /^commit;$/m.test(code));
  assert.ok(flat.includes("set local lock_timeout = '5s';"));
  assert.ok(flat.includes("notify pgrst, 'reload schema';"));
});
