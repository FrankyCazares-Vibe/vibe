-- first-confirm-check.sql: the behaviour check of the pre-registration fix
-- (supabase/migrations/20261022100000_password_needed_column.sql and
-- 20261022110000_first_confirm_drops_password.sql; prereg-design.md section
-- 12, "SQL, LOCAL").
--
-- LOCAL ONLY. Run it AFTER both files are applied to the local stack:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/first-confirm-check.sql
-- Never on production: it writes (and rolls back) auth.users, public.users
-- and terms_acceptances rows, and for a moment it adds a CHECK to
-- public.users (S9b, inside its own sub-transaction, so the lock goes when
-- the case ends). It refuses any connection that is not the local unix
-- socket (docker exec), and its first line is a psql command, so the
-- Management API and the MCP refuse the file before anything runs.
-- Expected last line: first-confirm-check: all N cases passed. Nothing is
-- kept: ROLLBACK follows.
--
-- WHAT IT DOES. One transaction that ends in ROLLBACK. Test accounts are
-- inserted straight into auth.users (handle_new_user makes their
-- public.users rows and 'signup' Terms records, as at a real sign-up), and
-- each GoTrue write is played as the UPDATE GoTrue sends:
--   Confirm        = set confirmation_token, email_confirmed_at, updated_at
--   UpdatePassword = set encrypted_password and clear confirmation_* and recovery_*
--   re-encrypt     = set encrypted_password only (token.go:139-151)
-- Cases: S0 the catalog (trigger, function, grants, the column's privileges);
-- S1 a mailed code (confirmation_sent_at) -> password gone, flag set, Terms
-- tick and 18+ gone, name 'Member', the 'signup' history row kept; S2 only
-- recovery_sent_at (GoTrue's /recover, after Recover) -> the same; S3 nothing
-- mailed (admin / auto-confirm) -> untouched; S4 already confirmed, confirmed
-- again -> untouched; S5 confirm and a new password in one write -> kept; S6
-- a stale hash written back in the wiping transaction -> the wipe is kept
-- (WARNING); S7 the same write from "another request" -> refused P0001, also
-- on a different row; S8 the UpdatePassword shape on an emptied row -> kept,
-- flag kept (accept-terms clears it); S9 no public.users row -> the
-- confirmation still succeeds and the password goes; S9b a failing
-- public.users write -> only a WARNING, the password still goes; S10
-- account_password_missing: anon and authenticated refused 42501, service
-- role and postgres answered; S11 the 'confirm' Terms source accepted, an
-- unknown one refused; S12 other writes on a pending account (sign-in time,
-- metadata as Confirm's own second write, a resent code, a password set
-- while still pending) change nothing the trigger guards.
-- It raises on the first expectation that fails ("first-confirm-check
-- FAILED: ...") and prints one NOTICE per case that passes. The two WARNINGs
-- (S6, S9b) are expected; S7's refusals are caught and counted as passes.
--
-- HOW IT ACTS AS SOMEONE. set_config('role', ...) inside a helper, the way
-- PostgREST runs a request as anon / authenticated / service_role, and only
-- on a function every API role holds EXECUTE on (S0 checks that first: a
-- refused EXECUTE would crash this image, 20260922090000).

-- A psql command: anything that is not psql refuses the file here.
\set ON_ERROR_STOP on

begin;

set local lock_timeout = '3s';

-- Only on the local stack, and only on a database that has both files.
do $$
begin
  if inet_server_addr() is not null then
    raise exception 'first-confirm-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if to_regprocedure('public.account_password_missing(uuid)') is null
     or to_regprocedure('auth_hooks.first_confirm_drops_password()') is null then
    raise exception 'first-confirm-check: apply 20261022100000 and 20261022110000 to the local stack first';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.fc_ok(p_case text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'first-confirm-check FAILED: % (got "%", expected "%")',
      p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('first_confirm_check.passed',
    (coalesce(nullif(current_setting('first_confirm_check.passed', true), ''), '0')::int + 1)::text, true);
  raise notice 'first-confirm-check ok: %', p_case;
end $$;

-- Run p_sql (a query returning one text value) as p_role; 'E'||SQLSTATE on error.
create function pg_temp.fc_as(p_role text, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  begin
    perform set_config('role', p_role, true);
    execute p_sql into v;
    perform set_config('role', 'none', true);
    return coalesce(v, '(null)');
  exception when others then
    return 'E' || sqlstate;
  end;
end $$;

-- Run a statement as the current user: 'ok' or 'E'||SQLSTATE (nothing kept on error).
create function pg_temp.fc_try(p_sql text)
returns text
language plpgsql
as $$
begin
  begin
    execute p_sql;
    return 'ok';
  exception when others then
    return 'E' || sqlstate;
  end;
end $$;

-- A test account as a sign-up leaves it: the planted password 'fc-planted-<tag>'
-- (not a real hash: nothing here signs in), the Terms tick and 18+ in the
-- metadata, the name 'Planted', made two days ago. p_mailed: 'confirmation',
-- 'recovery', 'both' or 'none' (which *_sent_at is set). Returns its id.
create function pg_temp.fc_user(p_tag text, p_mailed text, p_confirmed boolean default false)
returns uuid
language plpgsql
as $$
declare
  v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, email, aud, role, encrypted_password,
                          confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at,
                          email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values (v, '00000000-0000-0000-0000-000000000000', 'fc-' || p_tag || '@example.test',
          'authenticated', 'authenticated', 'fc-planted-' || p_tag,
          '', case when p_mailed in ('confirmation', 'both') then now() - interval '5 minutes' end,
          '', case when p_mailed in ('recovery', 'both') then now() - interval '5 minutes' end,
          case when p_confirmed then now() - interval '1 day' end,
          jsonb_build_object('terms_version', '2026-09-06', 'age_attested', true, 'full_name', 'Planted'),
          '{"provider":"email","providers":["email"]}'::jsonb, now() - interval '2 days', now() - interval '2 days');
  return v;
end $$;

-- GoTrue's Confirm (models/user.go:524-544): only these columns.
create function pg_temp.fc_confirm(p uuid)
returns void
language sql
as $$
  update auth.users set confirmation_token = '', email_confirmed_at = now(), updated_at = now() where id = p;
$$;

-- "<password> <confirmed> <flag> <terms> <name>": planted / new / other / no-pw,
-- confirmed / unconfirmed, flag / no-flag, terms / no-terms, the name.
create function pg_temp.fc_state(p uuid)
returns text
language sql
as $$
  select concat_ws(' ',
    case when coalesce(a.encrypted_password, '') = '' then 'no-pw'
         when a.encrypted_password like 'fc-planted-%' then 'planted'
         when a.encrypted_password like 'fc-new-%' then 'new' else 'other' end,
    case when a.email_confirmed_at is null then 'unconfirmed' else 'confirmed' end,
    case when u.id is null then '(no users row)'
         else concat_ws(' ',
           case when u.password_needed_at is null then 'no-flag' else 'flag' end,
           case when u.terms_version is null and u.terms_accepted_at is null and u.age_attested_at is null
                then 'no-terms' else 'terms' end,
           u.name) end)
    from auth.users a left join public.users u on u.id = a.id where a.id = p;
$$;

create temp table fc_ids (tag text primary key, id uuid not null);

-- S0. The catalog ---------------------------------------------------------------
do $$
declare
  f  regprocedure := 'auth_hooks.first_confirm_drops_password()'::regprocedure;
  rp regprocedure := 'public.account_password_missing(uuid)'::regprocedure;
  r  text;
begin
  perform pg_temp.fc_ok('S0 the trigger is on auth.users, enabled, BEFORE UPDATE OF the two columns',
    (select t.tgenabled::text || ' ' || (pg_get_triggerdef(t.oid) like '%BEFORE UPDATE OF email_confirmed_at, encrypted_password ON auth.users FOR EACH ROW WHEN%')::text
       from pg_trigger t where t.tgrelid = 'auth.users'::regclass and t.tgname = 'first_confirm_drops_password'),
    'O true');
  perform pg_temp.fc_ok('S0 both functions are SECURITY DEFINER with search_path ''''',
    (select string_agg((p.prosecdef and p.proconfig = array['search_path=""'])::text, ' ' order by p.proname)
       from pg_proc p where p.oid in (f, rp)),
    'true true');
  perform pg_temp.fc_ok('S0 the trigger function: supabase_auth_admin may run it, PUBLIC and the API roles hold no EXECUTE',
    concat_ws(' ', has_function_privilege('supabase_auth_admin', f, 'execute'),
      exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0),
      exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f
               and a.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole))),
    't f f');
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    perform pg_temp.fc_ok(format('S0 %s holds EXECUTE on account_password_missing (never a revoke)', r),
      has_function_privilege(r, rp, 'execute')::text, 'true');
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    perform pg_temp.fc_ok(format('S0 %s holds no SELECT, INSERT or UPDATE on users.password_needed_at', r),
      concat_ws(' ', has_column_privilege(r, 'public.users', 'password_needed_at', 'SELECT'),
        has_column_privilege(r, 'public.users', 'password_needed_at', 'INSERT'),
        has_column_privilege(r, 'public.users', 'password_needed_at', 'UPDATE')),
      'f f f');
  end loop;
end $$;

-- S1 to S5. Which confirmations remove the password ------------------------------------
do $$
declare
  u uuid;
begin
  u := pg_temp.fc_user('s1', 'confirmation');
  insert into fc_ids values ('s1', u);
  perform pg_temp.fc_ok('S1 a pending account as the first signer left it',
    pg_temp.fc_state(u), 'planted unconfirmed no-flag terms Planted');
  perform pg_temp.fc_confirm(u);
  perform pg_temp.fc_ok('S1 a mailed code (confirmation_sent_at) confirms -> password NULL, flag, no tick, name Member',
    pg_temp.fc_state(u), 'no-pw confirmed flag no-terms Member');
  perform pg_temp.fc_ok('S1 ... the password is NULL (not ''''), the flag is now, and the email stays confirmed',
    (select concat_ws(' ', a.encrypted_password is null, u2.password_needed_at = now(), a.confirmed_at is not null)
       from auth.users a join public.users u2 on u2.id = a.id where a.id = u),
    't t t');
  perform pg_temp.fc_ok('S1 ... the first signer''s ''signup'' history row is kept (append-only)',
    (select count(*) from public.terms_acceptances t where t.user_id = u and t.source = 'signup')::text, '1');

  -- GoTrue's /recover path: Recover writes recovery_token only, then Confirm.
  u := pg_temp.fc_user('s2', 'recovery');
  insert into fc_ids values ('s2', u);
  update auth.users set recovery_token = '', updated_at = now() where id = u;
  perform pg_temp.fc_ok('S2 ... after Recover (recovery_token only) nothing has changed yet',
    pg_temp.fc_state(u), 'planted unconfirmed no-flag terms Planted');
  perform pg_temp.fc_confirm(u);
  perform pg_temp.fc_ok('S2 only recovery_sent_at set (a recovery link or code) -> the same wipe',
    pg_temp.fc_state(u), 'no-pw confirmed flag no-terms Member');

  u := pg_temp.fc_user('s3', 'none');
  perform pg_temp.fc_confirm(u);
  perform pg_temp.fc_ok('S3 nothing mailed (admin createUser / auto-confirm shape) -> untouched',
    pg_temp.fc_state(u), 'planted confirmed no-flag terms Planted');

  u := pg_temp.fc_user('s4', 'both', true);
  perform pg_temp.fc_confirm(u);
  perform pg_temp.fc_ok('S4 already confirmed, confirmed again (both *_sent_at set) -> untouched',
    pg_temp.fc_state(u), 'planted confirmed no-flag terms Planted');

  u := pg_temp.fc_user('s5', 'confirmation');
  update auth.users set confirmation_token = '', email_confirmed_at = now(), encrypted_password = 'fc-new-s5',
                        updated_at = now() where id = u;
  perform pg_temp.fc_ok('S5 confirm and a new password in one write -> the new password is kept, nothing reset',
    pg_temp.fc_state(u), 'new confirmed no-flag terms Planted');
end $$;

-- S6 to S8. Arm 2: a password written back onto an emptied row -------------------------
do $$
declare
  u6 uuid;
  u1 uuid := (select id from fc_ids where tag = 's1');
  write_back constant text := 'update auth.users set encrypted_password = %L, updated_at = now() where id = %L';
begin
  u6 := pg_temp.fc_user('s6', 'confirmation');
  perform pg_temp.fc_confirm(u6);
  perform pg_temp.fc_ok('S6 (a fresh wipe in this transaction)', pg_temp.fc_state(u6), 'no-pw confirmed flag no-terms Member');
  perform pg_temp.fc_ok('S6 ... it marked the wipe for this row', current_setting('vibe.first_confirm_wiped', true), u6::text);
  -- A future GoTrue writing its stale hash back later in the same request.
  perform pg_temp.fc_ok('S6 the stale hash written back in the wiping transaction (*_sent_at unchanged) -> no error (WARNING)',
    pg_temp.fc_try(format(write_back, 'fc-planted-s6', u6)), 'ok');
  perform pg_temp.fc_ok('S6 ... and the wipe is kept', pg_temp.fc_state(u6), 'no-pw confirmed flag no-terms Member');

  -- "Another request": the mark is not there (the re-encrypt race at sign-in).
  perform set_config('vibe.first_confirm_wiped', '', true);
  perform pg_temp.fc_ok('S7 the same write from another request -> refused P0001',
    pg_temp.fc_try(format(write_back, 'fc-planted-s6', u6)), 'EP0001');
  perform pg_temp.fc_ok('S7 ... nothing changed', pg_temp.fc_state(u6), 'no-pw confirmed flag no-terms Member');
  perform set_config('vibe.first_confirm_wiped', u6::text, true);
  perform pg_temp.fc_ok('S7 a mark for a DIFFERENT row does not let a write onto S1''s row through -> P0001',
    pg_temp.fc_try(format(write_back, 'fc-planted-s1', u1)), 'EP0001');
  perform pg_temp.fc_ok('S7 a write that keeps the row password-less ('''') is not arm 2 -> ok',
    pg_temp.fc_try(format(write_back, '', u1)), 'ok');

  -- GoTrue's UpdatePassword (models/user.go:435-449): the hash and every token cleared together.
  update auth.users
     set encrypted_password = 'fc-new-s8', confirmation_token = '', confirmation_sent_at = null,
         recovery_token = '', recovery_sent_at = null, updated_at = now()
   where id = u1;
  perform pg_temp.fc_ok('S8 the UpdatePassword shape on an emptied row -> the new password is kept, the flag stays for accept-terms',
    pg_temp.fc_state(u1), 'new confirmed flag no-terms Member');
end $$;

-- S9. The public.users write can never block a confirmation ---------------------------
do $$
declare
  u uuid;
  got text;
begin
  u := pg_temp.fc_user('s9', 'confirmation');
  delete from public.users where id = u;
  perform pg_temp.fc_ok('S9 no public.users row: the confirmation succeeds and the password goes',
    pg_temp.fc_try(format('select pg_temp.fc_confirm(%L)', u)) || ' ' || pg_temp.fc_state(u),
    'ok no-pw confirmed (no users row)');

  -- A users write that fails (a CHECK that refuses the name 'Member'). In its
  -- own sub-transaction, ended on purpose, so the lock on public.users goes
  -- with it; the variable keeps what was read.
  begin
    alter table public.users add constraint fc_break check (name <> 'Member') not valid;
    u := pg_temp.fc_user('s9b', 'confirmation');
    got := pg_temp.fc_try(format('select pg_temp.fc_confirm(%L)', u)) || ' ' || pg_temp.fc_state(u);
    raise exception using errcode = 'FC999', message = 'end of S9b';
  exception when sqlstate 'FC999' then
    null;
  end;
  perform pg_temp.fc_ok('S9b a failing users write is only a WARNING: confirmed, password gone, no flag, tick kept',
    got, 'ok no-pw confirmed no-flag terms Planted');
end $$;

-- S10. account_password_missing ---------------------------------------------------
do $$
declare
  u1 uuid := (select id from fc_ids where tag = 's1');
  u2 uuid := (select id from fc_ids where tag = 's2');
  q constant text := 'select public.account_password_missing(%L)::text';
begin
  perform pg_temp.fc_ok('S10 anon -> refused 42501', pg_temp.fc_as('anon', format(q, u2)), 'E42501');
  perform pg_temp.fc_ok('S10 authenticated -> refused 42501', pg_temp.fc_as('authenticated', format(q, u2)), 'E42501');
  perform pg_temp.fc_ok('S10 service_role, an emptied account -> true', pg_temp.fc_as('service_role', format(q, u2)), 'true');
  perform pg_temp.fc_ok('S10 postgres, an emptied account -> true', public.account_password_missing(u2)::text, 'true');
  perform pg_temp.fc_ok('S10 postgres, S8''s account with its new password -> false', public.account_password_missing(u1)::text, 'false');
  perform pg_temp.fc_ok('S10 no such account -> NULL', coalesce(public.account_password_missing(gen_random_uuid())::text, '(null)'), '(null)');
end $$;

-- S11. The Terms history's sources ---------------------------------------------------
do $$
declare
  u1 uuid := (select id from fc_ids where tag = 's1');
  ins constant text := 'insert into public.terms_acceptances (user_id, terms_version, accepted_at, age_attested, source) '
                       'values (%L, ''2026-09-06'', now(), true, %L)';
begin
  perform pg_temp.fc_ok('S11 a ''confirm'' row is accepted', pg_temp.fc_try(format(ins, u1, 'confirm')), 'ok');
  perform pg_temp.fc_ok('S11 ''signup'' and ''interstitial'' still are',
    pg_temp.fc_try(format(ins, u1, 'signup')) || ' ' || pg_temp.fc_try(format(ins, u1, 'interstitial')), 'ok ok');
  perform pg_temp.fc_ok('S11 any other source is refused (23514)', pg_temp.fc_try(format(ins, u1, 'client')), 'E23514');
end $$;

-- S12. Other writes never enter the trigger ----------------------------------------------
do $$
declare
  u uuid := pg_temp.fc_user('s12', 'confirmation');
begin
  update auth.users set last_sign_in_at = now(), updated_at = now() where id = u;
  update auth.users set raw_user_meta_data = raw_user_meta_data || '{"email_verified": true}' where id = u;
  update auth.users set confirmation_token = 'fc-new-token-s12', confirmation_sent_at = now() where id = u;
  perform pg_temp.fc_ok('S12 sign-in time, metadata and a resent code on a pending account -> untouched',
    pg_temp.fc_state(u), 'planted unconfirmed no-flag terms Planted');
  update auth.users set encrypted_password = 'fc-new-s12', updated_at = now() where id = u;
  perform pg_temp.fc_ok('S12 a password write on a PENDING account (not arm 2) -> kept',
    pg_temp.fc_state(u), 'new unconfirmed no-flag terms Planted');
end $$;

-- The end. -----------------------------------------------------------------------
do $$
begin
  raise notice 'first-confirm-check: all % cases passed',
    coalesce(nullif(current_setting('first_confirm_check.passed', true), ''), '0');
end $$;

rollback;
