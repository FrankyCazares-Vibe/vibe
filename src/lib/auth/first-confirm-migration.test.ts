/**
 * Drift tests for the pre-registration fix's database half
 * (`supabase/migrations/20261022100000_password_needed_column.sql` and
 * `20261022110000_first_confirm_drops_password.sql`, written Oct 20 2026), read as
 * text, the src/lib/usage/migration.test.ts idiom. The files' behaviour is
 * checked on the local stack by scripts/sql/first-confirm-check.sql and
 * scripts/prereg-e2e.mjs; these keep a later edit from quietly undoing it:
 * which writes the trigger sees, what it removes, that it never blocks a
 * confirmation, who may call the password question, and that no API role
 * can ever read the new column.
 *
 * Run with:
 *   node --test src/lib/auth/first-confirm-migration.test.ts
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const readRoot = (file: string) => readFileSync(new URL(file, root), "utf8");
const A_FILE = "supabase/migrations/20261022100000_password_needed_column.sql";
const B_FILE = "supabase/migrations/20261022110000_first_confirm_drops_password.sql";
const rawA = readRoot(A_FILE);
const rawB = readRoot(B_FILE);

/** What Postgres runs: the file without its `--` notes, every run of spaces as one. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
/** The same, lower case, with no space next to a parenthesis (so "( a )" = "(a)"). */
const norm = (sql: string) => code(sql).toLowerCase().replace(/\s*([()])\s*/g, "$1");
const a = norm(rawA);
const b = norm(rawB);
const count = (needle: string, text: string) => text.split(norm(needle)).length - 1;
const between = (text: string, start: string, end: string) => {
  const s = text.indexOf(norm(start));
  assert.ok(s >= 0, `start: ${start}`);
  const from = s + norm(start).length;
  const e = text.indexOf(norm(end), from);
  assert.ok(e > from, `end: ${end}`);
  return text.slice(from, e);
};

// The trigger function's body, its two arms and the trigger's WHEN.
const body = between(b, "create function auth_hooks.first_confirm_drops_password() returns trigger", "$$;");
const arm1 = between(body, "begin if", "then new.encrypted_password := null;");
const arm2 = between(body, "return new; end if; if", "then if current_setting(");
const when = between(b, "for each row when(", ")execute function auth_hooks.first_confirm_drops_password();");

const ARM1 = [
  "old.email_confirmed_at is null",
  "new.email_confirmed_at is not null",
  "(old.confirmation_sent_at is not null or old.recovery_sent_at is not null)",
  "new.encrypted_password is not distinct from old.encrypted_password",
];
const ARM2 = [
  "old.email_confirmed_at is not null",
  "coalesce(old.encrypted_password, '') = ''",
  "coalesce(new.encrypted_password, '') <> ''",
  "(new.confirmation_sent_at is not null or new.recovery_sent_at is not null)",
  "new.confirmation_sent_at is not distinct from old.confirmation_sent_at",
  "new.recovery_sent_at is not distinct from old.recovery_sent_at",
];

test("the trigger: BEFORE UPDATE OF the two columns on auth.users, row by row, one function", () => {
  assert.equal(
    count("create trigger first_confirm_drops_password before update of email_confirmed_at, encrypted_password on auth.users for each row when (", b),
    1,
  );
  assert.equal(count("create trigger", b), 1);
  assert.equal(count("execute function auth_hooks.first_confirm_drops_password();", b), 1);
});

test("arm 1 has its four conditions and arm 2 its six, and the WHEN is exactly the two arms", () => {
  for (const c of ARM1) assert.ok(arm1.includes(norm(c)), `arm 1: ${c}`);
  for (const c of ARM2) assert.ok(arm2.includes(norm(c)), `arm 2: ${c}`);
  assert.equal(arm1.split(/\band\b/).length, ARM1.length, "arm 1 has no other condition");
  assert.equal(arm2.split(/\band\b/).length, ARM2.length, "arm 2 has no other condition");
  assert.equal(when, `(${arm1.trim()})or(${arm2.trim()})`, "the WHEN keeps every other write out of the function, and lets both arms in");
});

test("no time rule: the attacker chooses when the confirmation happens", () => {
  assert.equal(count("created_at", b), 0);
  assert.equal(count("interval", b), 0);
});

test("arm 1 empties the password, marks the wipe and resets the profile, never blocking a confirmation", () => {
  assert.equal(count("new.encrypted_password := null;", body), 1);
  assert.match(body, /begin perform set_config\('vibe\.first_confirm_wiped', new\.id::text, true\); exception when others then raise warning/);
  assert.match(
    body,
    /begin update public\.users set password_needed_at = now\(\), name = '[^']+', terms_version = null, terms_accepted_at = null, age_attested_at = null where id = new\.id; exception when others then raise warning/,
  );
  assert.equal(count("update public.users", b), 1, "the only write outside auth.users");
  assert.equal(count("raise exception", body), 1, "arm 1 never raises");
});

test("arm 2 keeps the wipe in the wiping request and refuses any other with P0001", () => {
  assert.equal(count("if current_setting('vibe.first_confirm_wiped', true) = new.id::text then", body), 1);
  assert.equal(count("new.encrypted_password := old.encrypted_password; return new;", body), 1);
  assert.match(body, /raise exception 'first_confirm_drops_password: [^']+' using errcode = 'p0001';/);
});

test("the name it resets to is the app's TRIGGER_FALLBACK_NAME, and the pre-flight checks handle_new_user still uses it", () => {
  const prefill = readRoot("src/lib/profile/onboarding-prefill.ts");
  const name = /export const TRIGGER_FALLBACK_NAME = "([^"]+)";/.exec(prefill)?.[1];
  assert.ok(name, "TRIGGER_FALLBACK_NAME in onboarding-prefill.ts");
  assert.ok(code(rawB).includes(`name = '${name}',`), `the reset writes '${name}'`);
  assert.ok(code(rawB).includes(`position('''${name}''' in v_def) = 0`), "the pre-flight reads handle_new_user's default");
});

test("each file makes one function, SECURITY DEFINER with an empty search_path, and nothing is CREATE OR REPLACE", () => {
  for (const [sql, name] of [[a, "public.account_password_missing"], [b, "auth_hooks.first_confirm_drops_password"]]) {
    const heads = [...sql.matchAll(/create function ([\w.]+)\([^)]*\)returns ([^$]+)as \$\$/g)];
    assert.deepEqual(heads.map((h) => h[1]), [name]);
    assert.match(heads[0][2], /security definer set search_path = '' $/, `${name}: security definer, search_path ''`);
    assert.equal(count("create or replace", sql), 0, "a second apply must fail, not overwrite");
    assert.equal(count("security invoker", sql), 0);
  }
});

test("the trigger function: no EXECUTE for PUBLIC, EXECUTE for supabase_auth_admin only", () => {
  assert.equal(count("revoke all on function auth_hooks.first_confirm_drops_password() from public;", b), 1);
  assert.equal(count("grant execute on function auth_hooks.first_confirm_drops_password() to supabase_auth_admin;", b), 1);
  assert.equal([...b.matchAll(/\bgrant /g)].length, 1, "no other grant");
});

test("account_password_missing refuses anon and authenticated inside (42501); every API role keeps EXECUTE", () => {
  const fn = between(a, "create function public.account_password_missing(p_user uuid)", "$$;");
  assert.ok(
    fn.includes(norm("begin if current_setting('role', true) in ('anon', 'authenticated') then raise exception 'not allowed' using errcode = '42501'; end if;")),
    "the refusal comes first",
  );
  assert.ok(fn.includes(norm("return (select coalesce(u.encrypted_password, '') = '' from auth.users u where u.id = p_user);")));
  assert.ok(fn.includes(" stable "), "a read: stable");
  assert.equal(count("grant execute on function public.account_password_missing(uuid) to anon, authenticated, service_role;", a), 1);
  assert.equal(count("revoke all on function public.account_password_missing(uuid) from public;", a), 1);
  for (const sql of [a, b]) {
    assert.equal(count("revoke execute", sql), 0, "a revoke is a crash button (20260922090000)");
    assert.doesNotMatch(sql, /revoke [^;]* from [^;]*\b(anon|authenticated|service_role)\b/);
  }
});

test("the Terms history accepts exactly signup, interstitial and confirm; the old check is found by its definition", () => {
  assert.equal(
    count("alter table public.terms_acceptances add constraint terms_acceptances_source_check check (source in ('signup', 'interstitial', 'confirm'));", a),
    1,
  );
  assert.ok(a.includes(norm("pg_get_constraintdef(oid) ilike '%source%'")), "found by definition, not by an assumed name");
  assert.ok(a.includes(norm("if n <> 1 then raise exception")), "exactly one must match");
  assert.ok(b.includes(norm("pg_get_constraintdef(oid) like '%confirm%'")), "B refuses to run before the wider check");
});

test("password_needed_at: timestamptz, no default, and no migration ever grants it to anyone", () => {
  assert.equal(count("alter table public.users add column password_needed_at timestamptz;", a), 1);
  assert.equal(count("default", between(a, "add column password_needed_at", ";")), 0);
  const dir = new URL("supabase/migrations/", root);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = norm(readFileSync(new URL(file, dir), "utf8"));
    assert.doesNotMatch(sql, /grant [^;]*password_needed_at/, `${file} grants password_needed_at`);
  }
  // A table-level SELECT would expose it: A refuses to run when one exists.
  assert.ok(a.includes(norm("has_table_privilege('authenticated', 'public.users', 'SELECT')")));
  assert.ok(a.includes(norm("has_table_privilege('anon', 'public.users', 'SELECT')")));
});

test("each file is one transaction with a lock timeout and refuses a second apply", () => {
  for (const [sql, tag] of [[a, "password-needed"], [b, "first-confirm"]]) {
    assert.ok(sql.startsWith("begin; set local lock_timeout = '5s';"), `${tag}: begins with the transaction`);
    assert.ok(sql.endsWith("notify pgrst, 'reload schema'; commit;"), `${tag}: ends with the commit`);
    assert.equal(count("commit;", sql), 1);
    assert.ok(sql.includes(`raise exception '${tag}: already applied'`), `${tag}: a second apply stops`);
  }
});

test("B's pre-flight: A first, the columns it reads, and no confirmed account without a password unless this trigger emptied it", () => {
  assert.ok(b.includes(norm("raise exception 'first-confirm: apply 20261022100000 first'")));
  assert.ok(b.includes(norm("'encrypted_password', 'email_confirmed_at', 'confirmation_sent_at', 'recovery_sent_at')) <> 4")));
  assert.ok(b.includes(norm("raise exception 'first-confirm: encrypted_password not nullable'")));
  const preflight = between(b, "begin; set local lock_timeout = '5s'; do $$", "end $$;");
  // The accounts an earlier apply emptied carry the flag and are what arm 2 is for, so a re-apply after a
  // rollback (prereg-design.md section 10) is not refused by them; any other confirmed account with no
  // password still stops the file.
  assert.ok(
    preflight.includes(norm(
      "if exists (select 1 from auth.users a where a.email_confirmed_at is not null and coalesce(a.encrypted_password, '') = '' " +
      "and not exists (select 1 from public.users p where p.id = a.id and p.password_needed_at is not null)) " +
      "then raise exception 'first-confirm: a confirmed account already has no password and no password_needed_at'",
    )),
    "refuses only a confirmed, password-less account with no flag",
  );
  assert.ok(preflight.includes(norm("raise notice 'first-confirm: % emptied account(s) still choosing a password")), "the re-apply count is printed");
  assert.match(rawB, /^-- RE-APPLY after a rollback/m, "the header says how to re-apply");
});

test("the production migrations write no person's row (no synthetic-row check in either file)", () => {
  for (const sql of [a, b]) {
    for (const verb of ["insert into auth.users", "update auth.users", "delete from auth.users", "insert into public.users", "delete from public.users"]) {
      assert.equal(count(verb, sql), 0, verb);
    }
  }
});

test("both headers carry the house sections", () => {
  for (const raw of [rawA, rawB]) {
    for (const section of ["PLAIN ENGLISH", "WHAT IT DOES", "PRE-FLIGHT", "POST-CHECK", "HOW TO APPLY", "ROLLBACK"]) {
      assert.match(raw, new RegExp(`^-- ${section}`, "m"), section);
    }
    // The connector records its own auto-timestamped row: the house line (20261019120000) says to delete it.
    assert.ok(raw.includes("--   (and delete the connector's own auto-timestamped row for this body)"), "the delete-its-row line");
  }
  assert.ok(rawB.includes("drop trigger if exists first_confirm_drops_password on auth.users;"), "B's rollback is in its notes");
});
