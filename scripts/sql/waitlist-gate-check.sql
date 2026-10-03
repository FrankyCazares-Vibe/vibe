-- waitlist-gate-check.sql: the behaviour check of the waitlist migrations
-- (supabase/migrations/20261003100000_waitlist.sql, 20261003110000_waitlist_gate.sql,
-- 20261003120000_waitlist_hardening.sql, 20261003130000_waitlist_code_scrub.sql,
-- 20261003140000_waitlist_retention.sql, 20261003150000_waitlist_retention_fixes.sql,
-- 20261003160000_waitlist_line.sql and 20261003170000_waitlist_margin.sql), contract
-- BUILD.md section 5 "A, SQL", plus the review fixes (S9, S10), the 40-day
-- rule (S11), its fixes (S12), the line (S13) and the margin and the
-- restarted clock (S14).
--
-- LOCAL ONLY. Run it AFTER the eight files are applied to the local stack:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/waitlist-gate-check.sql
-- Never on production: it writes (and rolls back) waitlist, allowlist,
-- settings, auth.users, email_sends and moderation_actions rows, and for a
-- moment it adds a CHECK to public.waitlist (S5). It refuses any connection
-- that is not the local unix socket (docker exec), and its first line is a
-- psql command, so the Management API and the MCP refuse the file before
-- anything runs.
-- Expected last line: waitlist-gate-check: all N cases passed. Nothing is
-- kept: ROLLBACK follows.
--
-- WHAT IT DOES. Everything happens inside ONE transaction that ends in
-- ROLLBACK, so it can set signup_open to false without any other session
-- ever seeing it (they keep reading the committed value; nobody waits,
-- because readers never block on a row lock).
-- Cases: S1 grants (the standing rule: the API roles hold EXECUTE everywhere
-- and the writers and the hook refuse them from inside, 42501; no table
-- privilege for anon or authenticated); S2 the hook, every branch; S3 the
-- normaliser and hash vectors shared with access-code.test.ts; S4 issue and
-- revoke; S5 handle_new_user's redeem block; S6 the wider CHECKs on
-- email_sends and moderation_actions; S7 the table rules; S8 the switch;
-- S9 the typed code is stored only as its hash; S10 deleting an account
-- deletes the waitlist row it joined with; S11 retention: every row goes 38
-- days after it joined (two days inside the promised 40), whatever its
-- state, and the cohort tag outlives it; S12 a code ends with its entry, and
-- batch names are a word and a number; S13 an entry past its line counts as
-- gone before the purge reaches it (the same person joins again as a fresh
-- entry), and no code goes out in an entry's last 24 hours; S14 a new
-- confirm link restarts the clock of an entry that is still unconfirmed, and
-- of no other.
-- It raises on the first expectation that fails ("waitlist-gate-check
-- FAILED: ...") and prints one NOTICE per case that passes.
--
-- HOW IT ACTS AS SOMEONE. `set_config('role', ...)` inside a helper, the way
-- PostgREST runs a request as anon / authenticated / service_role. The hook
-- (auth_hooks.hook_waitlist_gate) is called as the owner (postgres): `postgres` is not a member of
-- supabase_auth_admin, so it can't SET ROLE to it, and the hook is SECURITY
-- DEFINER, so it behaves the same for any caller the role check lets in.
-- That supabase_auth_admin holds EXECUTE is asserted in S1.
-- Answers: 'allow', or the refusal's reason tag (access_code_required, ...);
-- 'E' + SQLSTATE = refused with an error (E42501, E23514). concat_ws prints
-- a boolean as t / f.

-- A psql command: anything that is not psql refuses the file here. With it a
-- run without -v ON_ERROR_STOP=1 still stops at the first failure.
\set ON_ERROR_STOP on

begin;

-- Only on the local stack, and only on a database that has both files.
do $$
begin
  if inet_server_addr() is not null then
    raise exception 'waitlist-gate-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if to_regprocedure('auth_hooks.hook_waitlist_gate(jsonb)') is null
     or to_regprocedure('auth_hooks.scrub_access_code(jsonb)') is null
     or to_regprocedure('public.waitlist_purge_expired(integer)') is null
     or to_regprocedure('public.waitlist_drop_if_due(text)') is null
     or to_regprocedure('public.waitlist_restart_clock()') is null then
    raise exception 'waitlist-gate-check: the hook, scrub_access_code, waitlist_purge_expired, waitlist_drop_if_due or waitlist_restart_clock is missing. Apply the eight waitlist migrations (20261003100000 to 20261003170000) to the local stack first';
  end if;
  if pg_get_functiondef('public.waitlist_purge_expired(integer)'::regprocedure) not like '%interval ''38 days''%' then
    raise exception 'waitlist-gate-check: the purge still deletes at 40 or 39 days. Apply 20261003170000_waitlist_margin.sql first';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.wc_ok(p_case text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'waitlist-gate-check FAILED: % (got "%", expected "%")',
      p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('waitlist_gate_check.passed',
    (coalesce(nullif(current_setting('waitlist_gate_check.passed', true), ''), '0')::int + 1)::text, true);
  raise notice 'waitlist-gate-check ok: %', p_case;
end $$;

-- Run p_sql (a query returning one text value) as p_role; 'E'||SQLSTATE on error.
-- Only ever called on functions every API role holds EXECUTE on (S1 checks
-- that first): a refused EXECUTE would crash this image (the standing rule).
create function pg_temp.wc_as(p_role text, p_sql text)
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

-- Run a statement as the current user: 'ok' or 'E'||SQLSTATE.
create function pg_temp.wc_try(p_sql text)
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

-- The before-user-created event, the shape GoTrue sends.
create function pg_temp.wc_event(p_email text, p_meta jsonb default '{}')
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'metadata', jsonb_build_object('name', 'before-user-created', 'uuid', gen_random_uuid()),
    'user', jsonb_build_object('email', p_email, 'user_metadata', p_meta,
      'app_metadata', '{"provider":"email","providers":["email"]}'::jsonb));
$$;

-- The gate's answer: 'allow', the reason tag, or 'bad-shape:<json>'.
create function pg_temp.wc_gate(p_email text, p_meta jsonb default '{}')
returns text
language plpgsql
as $$
declare
  res jsonb := auth_hooks.hook_waitlist_gate(pg_temp.wc_event(p_email, p_meta));
  m text[];
begin
  if res = '{}'::jsonb then
    return 'allow';
  end if;
  m := regexp_match(res #>> '{error,message}', '^\[vibe:([a-z_]+)\] \S');
  if (res #>> '{error,http_code}') = '403' and m is not null then
    return m[1];
  end if;
  return 'bad-shape:' || res::text;
end $$;

-- A waitlist row; returns its id.
create function pg_temp.wc_row(p_tag text, p_confirmed boolean default true)
returns uuid
language sql
as $$
  insert into public.waitlist (email, email_key, school_system, name, age_attested_at,
                               consent_invite_at, notice_version, confirmed_at)
  values ('wc-' || p_tag || '@iu.edu', 'wc-' || p_tag || '@iu.edu', 'iu', 'Check ' || p_tag,
          now(), now(), '2026-10-03', case when p_confirmed then now() end)
  returning id;
$$;

-- S1. Grants ---------------------------------------------------------------------
do $$
declare
  t text;
  f text;
  r text;
begin
  foreach t in array array['public.waitlist', 'public.signup_allowlist', 'public.app_settings'] loop
    foreach r in array array['anon', 'authenticated'] loop
      perform pg_temp.wc_ok(format('S1 %s holds no privilege on %s', r, t),
        has_table_privilege(r, t, 'select,insert,update,delete,truncate,references,trigger')::text, 'false');
    end loop;
    perform pg_temp.wc_ok(format('S1 RLS on, no policy: %s', t),
      (select c.relrowsecurity::text || '/' || (select count(*) from pg_policy p where p.polrelid = c.oid)
         from pg_class c where c.oid = t::regclass), 'true/0');
  end loop;

  -- The standing rule: every API role holds EXECUTE on every new function
  -- (a refused EXECUTE crashes this image), and never PUBLIC.
  foreach f in array array['public.signup_is_open()', 'public.waitlist_normalize_code(text)',
      'public.waitlist_code_hash(text)', 'public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)',
      'public.waitlist_revoke_code(uuid,text)', 'auth_hooks.hook_waitlist_gate(jsonb)'] loop
    perform pg_temp.wc_ok(format('S1 EXECUTE on %s: not PUBLIC; anon, authenticated, service_role', f),
      (select concat_ws(' ',
         'public=' || exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
         'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE'),
         'authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         'service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE'))
         from pg_proc p where p.oid = f::regprocedure),
      'public=false anon=true authenticated=true service_role=true');
  end loop;
  perform pg_temp.wc_ok('S1 supabase_auth_admin may run the hook (schema USAGE and EXECUTE)',
    (has_schema_privilege('supabase_auth_admin', 'auth_hooks', 'USAGE')
     and has_function_privilege('supabase_auth_admin', 'auth_hooks.hook_waitlist_gate(jsonb)', 'EXECUTE'))::text, 'true');
  perform pg_temp.wc_ok('S1 hook, issue and revoke are SECURITY DEFINER with search_path ""',
    (select string_agg(p.proname || ':' || p.prosecdef || ':' || array_to_string(p.proconfig, ';'), ' ' order by p.proname)
       from pg_proc p
      where p.oid in ('auth_hooks.hook_waitlist_gate(jsonb)'::regprocedure,
                      'public.waitlist_issue_code(uuid,text,uuid,text,boolean,text)'::regprocedure,
                      'public.waitlist_revoke_code(uuid,text)'::regprocedure)),
    'hook_waitlist_gate:true:search_path="" waitlist_issue_code:true:search_path="" waitlist_revoke_code:true:search_path=""');

  -- The hook is out of the REST API's reach: no public copy, and the API
  -- roles can't even look inside auth_hooks (checked in the catalog, never by
  -- calling: a refused call might crash this image). Dashboard-safe.
  perform pg_temp.wc_ok('S1 no public.hook_waitlist_gate any more',
    (to_regprocedure('public.hook_waitlist_gate(jsonb)') is null)::text, 'true');
  foreach r in array array['anon', 'authenticated', 'service_role', 'authenticator'] loop
    perform pg_temp.wc_ok(format('S1 %s has no USAGE or CREATE on schema auth_hooks', r),
      (has_schema_privilege(r, 'auth_hooks', 'USAGE') or has_schema_privilege(r, 'auth_hooks', 'CREATE'))::text, 'false');
  end loop;
  -- The second lock: were the schema ever opened, the hook still refuses the
  -- API roles from inside (42501). USAGE is granted inside this transaction
  -- only, and rolled back with it.
  grant usage on schema auth_hooks to anon, authenticated, service_role;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    perform pg_temp.wc_ok(format('S1 %s calling the hook (schema opened for the test) is refused inside (42501)', r),
      pg_temp.wc_as(r, $q$select auth_hooks.hook_waitlist_gate('{"user":{"email":"a@iu.edu","user_metadata":{"access_code":"VIBE-7KQ2-M9XD"}}}')::text$q$),
      'E42501');
  end loop;
  revoke usage on schema auth_hooks from anon, authenticated, service_role;
  foreach r in array array['anon', 'authenticated'] loop
    perform pg_temp.wc_ok(format('S1 %s calling waitlist_issue_code is refused inside (42501)', r),
      pg_temp.wc_as(r, $q$select public.waitlist_issue_code(gen_random_uuid(), 'VIBE-7KQ2-M9XD', null, null, true)::text$q$),
      'E42501');
    perform pg_temp.wc_ok(format('S1 %s calling waitlist_revoke_code is refused inside (42501)', r),
      pg_temp.wc_as(r, $q$select public.waitlist_revoke_code(gen_random_uuid(), 'VIBE-7KQ2-M9XD')::text$q$),
      'E42501');
    perform pg_temp.wc_ok(format('S1 %s reading public.waitlist is refused at the table (42501)', r),
      pg_temp.wc_as(r, 'select count(*)::text from public.waitlist'), 'E42501');
    perform pg_temp.wc_ok(format('S1 %s may ask signup_is_open()', r),
      (pg_temp.wc_as(r, 'select public.signup_is_open()::text') in ('true', 'false'))::text, 'true');
  end loop;
  perform pg_temp.wc_ok('S1 service_role may call waitlist_issue_code (an unknown id: not_found)',
    pg_temp.wc_as('service_role',
      $q$select public.waitlist_issue_code(gen_random_uuid(), 'VIBE-7KQ2-M9XD', null, null, true) ->> 'reason'$q$),
    'not_found');
end $$;

-- S3. Normaliser and hash vectors (the same as access-code.test.ts) ----------------
do $$
declare
  v record;
begin
  for v in
    select * from (values
      ('VIBE-7KQ2-M9XD', '7KQ2M9XD'), ('vibe 7kq2 m9xd', '7KQ2M9XD'), ('7kq2-m9xd', '7KQ2M9XD'),
      (E'  vibe-7KQ2-m9xd\n', '7KQ2M9XD'), ('VIBE-7KQ2-M9XO', '7KQ2M9X0'), ('vibe-ILO0-0000', '11000000'),
      ('VIBE-7KQ2-M9X', null), ('VIBE-7KQ2-M9XU', null), ('VIBE7KQ2M9XDQ', null), ('', null),
      ('VIBE', null), ('VIBE-7KQ2-M9XĐ', null), ('vıbe-7kq2-m9xd', null)
    ) as t(input, want)
  loop
    perform pg_temp.wc_ok(format('S3 normalise %L', replace(v.input, E'\n', '\n')),
      public.waitlist_normalize_code(v.input), v.want);
  end loop;
  perform pg_temp.wc_ok('S3 normalise null', public.waitlist_normalize_code(null), null);
  perform pg_temp.wc_ok('S3 hash vector',
    public.waitlist_code_hash('VIBE-7KQ2-M9XD'),
    '28260557126c16ecfa20c77a89f2da7961bbe4132ee6fc5f5c506b8595f3d165');
  perform pg_temp.wc_ok('S3 hash of an invalid code is null', public.waitlist_code_hash('VIBE-7KQ2-M9XU'), null);
end $$;

-- Fixtures for S2 / S4 / S5 (all rolled back). Codes are fixed strings in the
-- alphabet; C9 is never issued. ---------------------------------------------------
create temp table wc_ids (tag text primary key, id uuid not null);
do $$
declare
  t text;
begin
  foreach t in array array['ok', 'exp', 'used', 'take', 'unconf', 'plain', 'redeem', 'other'] loop
    insert into wc_ids values (t, pg_temp.wc_row(t, t <> 'unconf'));
  end loop;
  perform pg_temp.wc_ok('fixtures: batch codes issued',
    (select string_agg((public.waitlist_issue_code(i.id, c.code, null, 'test-1', false) ->> 'ok'), ',' order by c.tag)
       from (values ('ok', 'VIBE-WC00-0001'), ('exp', 'VIBE-WC00-0002'), ('used', 'VIBE-WC00-0003'),
                    ('take', 'VIBE-WC00-0004'), ('redeem', 'VIBE-WC00-0005'), ('other', 'VIBE-WC00-0006')) c(tag, code)
       join wc_ids i using (tag)),
    'true,true,true,true,true,true');
  update public.waitlist set code_expires_at = now() - interval '1 second'
   where id = (select id from wc_ids where tag = 'exp');
  update public.waitlist set redeemed_at = now()
   where id = (select id from wc_ids where tag = 'used');
  insert into public.signup_allowlist (email, reason) values ('wc-allow@example.test', 'manual');
end $$;

-- S2. The gate ----------------------------------------------------------------------
do $$
declare
  probe constant jsonb := '{"vibe_gate_probe": true}';
begin
  update public.app_settings set value = 'true'::jsonb where key = 'signup_open';
  perform pg_temp.wc_ok('S2 open: no code is allowed', pg_temp.wc_gate('wc-new@example.test'), 'allow');
  perform pg_temp.wc_ok('S2 open + probe: behaves closed (no code refused)',
    pg_temp.wc_gate('wc-new@example.test', probe), 'access_code_required');

  update public.app_settings set value = 'false'::jsonb where key = 'signup_open';
  perform pg_temp.wc_ok('S2 closed: no code', pg_temp.wc_gate('wc-new@example.test'), 'access_code_required');
  perform pg_temp.wc_ok('S2 closed: blank code',
    pg_temp.wc_gate('wc-new@example.test', '{"access_code": "   "}'), 'access_code_required');
  perform pg_temp.wc_ok('S2 closed: a code that is not a string',
    pg_temp.wc_gate('wc-new@example.test', '{"access_code": 70011}'), 'access_code_required');
  perform pg_temp.wc_ok('S2 closed: a valid code but no email',
    pg_temp.wc_gate('', '{"access_code": "VIBE-WC00-0001"}'), 'access_code_required');
  perform pg_temp.wc_ok('S2 closed: an empty event',
    (select coalesce(substring(auth_hooks.hook_waitlist_gate('{}') #>> '{error,message}' from '^\[vibe:([a-z_]+)\]'), 'allow')),
    'access_code_required');
  perform pg_temp.wc_ok('S2 closed: allowlisted address, no code', pg_temp.wc_gate('wc-allow@example.test'), 'allow');
  perform pg_temp.wc_ok('S2 closed: allowlisted address typed in capitals', pg_temp.wc_gate('WC-Allow@Example.Test'), 'allow');
  perform pg_temp.wc_ok('S2 closed: allowlisted address with the probe', pg_temp.wc_gate('wc-allow@example.test', probe), 'allow');
  perform pg_temp.wc_ok('S2 malformed code',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "VIBE-123"}'), 'access_code_invalid');
  perform pg_temp.wc_ok('S2 well-formed but unknown code',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "VIBE-WC00-0009"}'), 'access_code_invalid');
  perform pg_temp.wc_ok('S2 expired code',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "VIBE-WC00-0002"}'), 'access_code_expired');
  perform pg_temp.wc_ok('S2 redeemed code',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "VIBE-WC00-0003"}'), 'access_code_used');

  perform pg_temp.wc_ok('S2 valid code (typed loosely, with the probe): allowed',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "vibe wc00 0001", "vibe_gate_probe": true}'), 'allow');
  perform pg_temp.wc_ok('S2 ... and the claim is written for that address',
    (select code_claimed_email || ':' || (code_claimed_at is not null) from public.waitlist
      where id = (select id from wc_ids where tag = 'ok')), 'wc-a@example.test:true');
  perform pg_temp.wc_ok('S2 the same code, another address: in use',
    pg_temp.wc_gate('wc-b@example.test', '{"access_code": "VIBE-WC00-0001"}'), 'access_code_in_use');
  perform pg_temp.wc_ok('S2 the first address again (retry after a failed creation): allowed',
    pg_temp.wc_gate('WC-A@example.test', '{"access_code": "VIBE-WC00-0001"}'), 'allow');
  perform pg_temp.wc_ok('S2 ... still claimed by the first address',
    (select code_claimed_email from public.waitlist where id = (select id from wc_ids where tag = 'ok')),
    'wc-a@example.test');

  perform pg_temp.wc_ok('S2 a claim on another code by A',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "VIBE-WC00-0004"}'), 'allow');
  update public.waitlist set code_claimed_at = now() - interval '16 minutes'
   where id = (select id from wc_ids where tag = 'take');
  perform pg_temp.wc_ok('S2 a claim older than 15 minutes is taken over by another address',
    pg_temp.wc_gate('wc-c@example.test', '{"access_code": "VIBE-WC00-0004"}'), 'allow');
  perform pg_temp.wc_ok('S2 ... and now belongs to that address',
    (select code_claimed_email || ':' || (code_claimed_at = now()) from public.waitlist
      where id = (select id from wc_ids where tag = 'take')), 'wc-c@example.test:true');
  perform pg_temp.wc_ok('S2 ... so the first address is now refused',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "VIBE-WC00-0004"}'), 'access_code_in_use');

  -- The review fix: a stale claim whose address DID get an account (the
  -- redeem in handle_new_user failed) is never handed over.
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (gen_random_uuid(), 'wc-c@example.test', 'authenticated', 'authenticated', '{}');
  update public.waitlist set code_claimed_at = now() - interval '16 minutes', redeemed_at = null
   where id = (select id from wc_ids where tag = 'take');
  perform pg_temp.wc_ok('S2 a stale claim whose address has an account is not taken over (used)',
    pg_temp.wc_gate('wc-x@example.test', '{"access_code": "VIBE-WC00-0004"}'), 'access_code_used');
  perform pg_temp.wc_ok('S2 ... and stays with that address',
    (select code_claimed_email from public.waitlist where id = (select id from wc_ids where tag = 'take')),
    'wc-c@example.test');
end $$;

-- S4. Issue and revoke ---------------------------------------------------------------
do $$
declare
  id_unconf uuid := (select id from wc_ids where tag = 'unconf');
  id_plain  uuid := (select id from wc_ids where tag = 'plain');
  id_ok     uuid := (select id from wc_ids where tag = 'ok');
  id_used   uuid := (select id from wc_ids where tag = 'used');
  actor     uuid := (select u.id from public.users u order by u.id limit 1);
  res       jsonb;
begin
  perform pg_temp.wc_ok('S4 batch: an unconfirmed row is refused',
    public.waitlist_issue_code(id_unconf, 'VIBE-WC00-0010', actor, 'test-1', false) ->> 'reason', 'not_confirmed');
  perform pg_temp.wc_ok('S4 batch: a row that already has a code is refused',
    public.waitlist_issue_code(id_ok, 'VIBE-WC00-0010', actor, 'test-1', false) ->> 'reason', 'already_invited');
  perform pg_temp.wc_ok('S4 a bad code', public.waitlist_issue_code(id_plain, 'VIBE-WC00-001U', actor, null, false) ->> 'reason', 'bad_code');
  perform pg_temp.wc_ok('S4 an unknown row', public.waitlist_issue_code(gen_random_uuid(), 'VIBE-WC00-0010', actor, null, true) ->> 'reason', 'not_found');
  perform pg_temp.wc_ok('S4 another row''s code clashes: code_taken',
    public.waitlist_issue_code(id_plain, 'VIBE-WC00-0001', actor, null, false) ->> 'reason', 'code_taken');
  perform pg_temp.wc_ok('S4 ... and the clash changed nothing on that row',
    (select (code_hash is null)::text || ':' || invite_count from public.waitlist where id = id_plain), 'true:0');
  perform pg_temp.wc_ok('S4 a batch name that breaks the rule raises 23514',
    pg_temp.wc_try(format('select public.waitlist_issue_code(%L, %L, null, %L, false)', id_plain, 'VIBE-WC00-0010', 'Bad Batch!')),
    'E23514');

  res := public.waitlist_issue_code(id_plain, 'VIBE-WC00-0010', actor, 'test-1', false);
  perform pg_temp.wc_ok('S4 batch: a confirmed row with no code gets one',
    concat_ws(' ', res ->> 'ok', res ->> 'email', res ->> 'name',
      ((res ->> 'expires_at')::timestamptz = now() + interval '14 days')::text),
    'true wc-plain@iu.edu Check plain true');
  perform pg_temp.wc_ok('S4 ... with its hash, the actor, the batch and the count',
    (select concat_ws(' ', code_hash = public.waitlist_code_hash('VIBE-WC00-0010'), invited_by = actor, batch,
                      invite_count, code_issued_at = now())
       from public.waitlist where id = id_plain),
    't t test-1 1 t');

  perform pg_temp.wc_ok('S4 a malformed invite token hash: bad_token',
    public.waitlist_issue_code(id_ok, 'VIBE-WC00-0011', actor, '', true, 'not-a-hash') ->> 'reason', 'bad_token');

  -- Single mode replaces a claimed code: the old one stops working.
  perform pg_temp.wc_ok('S4 single mode on a claimed row: ok',
    public.waitlist_issue_code(id_ok, 'VIBE-WC00-0011', actor, '', true, repeat('b', 64)) ->> 'ok', 'true');
  perform pg_temp.wc_ok('S4 ... the invite token is set; the confirm token is untouched',
    (select (invite_token_hash = repeat('b', 64))::text || '/' || (manage_token_hash is null)::text
       from public.waitlist where id = id_ok), 'true/true');
  perform pg_temp.wc_ok('S4 ... claim cleared, count 2, batch kept when none is given',
    (select concat_ws(' ', coalesce(code_claimed_email, '-'), (code_claimed_at is null), invite_count, batch)
       from public.waitlist where id = id_ok), '- t 2 test-1');
  perform pg_temp.wc_ok('S4 ... the old code no longer matches (invalid at the gate)',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "VIBE-WC00-0001"}'), 'access_code_invalid');
  perform pg_temp.wc_ok('S4 ... the new one works',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "VIBE-WC00-0011"}'), 'allow');

  -- A failed send's undo puts the replaced code back, claim and token too.
  perform pg_temp.wc_ok('S4 another single code on the same row: ok',
    public.waitlist_issue_code(id_ok, 'VIBE-WC00-0013', actor, 'test-2', true, repeat('c', 64)) ->> 'ok', 'true');
  perform pg_temp.wc_ok('S4 revoking it (a failed send) restores the previous code',
    public.waitlist_revoke_code(id_ok, 'VIBE-WC00-0013')::text, 'true');
  perform pg_temp.wc_ok('S4 ... code, claim, invite token, batch and count are the previous ones',
    (select concat_ws(' ', code_hash = public.waitlist_code_hash('VIBE-WC00-0011'), code_claimed_email,
                      invite_token_hash = repeat('b', 64), batch, invite_count, code_prev is null)
       from public.waitlist where id = id_ok),
    't wc-a@example.test t test-1 2 t');
  perform pg_temp.wc_ok('S4 ... and the previous code still works for its claimant',
    pg_temp.wc_gate('wc-a@example.test', '{"access_code": "VIBE-WC00-0011"}'), 'allow');

  -- Single mode on a row whose code made a CONFIRMED account: refused.
  update public.waitlist set redeemed_user_id = actor where id = id_used;
  perform pg_temp.wc_ok('S4 the actor''s account is confirmed (fixture)',
    (select (email_confirmed_at is not null)::text from auth.users where id = actor), 'true');
  perform pg_temp.wc_ok('S4 single mode on a row joined by a confirmed account: joined',
    public.waitlist_issue_code(id_used, 'VIBE-WC00-0012', actor, null, true) ->> 'reason', 'joined');
  -- ... by an account never confirmed (a mistyped address): a fresh cycle.
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (gen_random_uuid(), 'wc-typo@example.test', 'authenticated', 'authenticated', '{}');
  update public.waitlist set redeemed_user_id = (select id from auth.users where email = 'wc-typo@example.test')
   where id = id_used;
  perform pg_temp.wc_ok('S4 single mode on a row joined by an unconfirmed account: ok',
    public.waitlist_issue_code(id_used, 'VIBE-WC00-0012', actor, null, true) ->> 'ok', 'true');
  perform pg_temp.wc_ok('S4 ... and the redemption is cleared (a fresh cycle)',
    (select (redeemed_at is null)::text || '/' || (redeemed_user_id is null)::text from public.waitlist where id = id_used),
    'true/true');

  perform pg_temp.wc_ok('S4 revoke with another code changes nothing',
    public.waitlist_revoke_code(id_plain, 'VIBE-WC00-0011')::text, 'false');
  perform pg_temp.wc_ok('S4 revoke with an invalid code', public.waitlist_revoke_code(id_plain, 'nope')::text, 'false');
  perform pg_temp.wc_ok('S4 revoke with its own code clears it',
    public.waitlist_revoke_code(id_plain, 'vibe-wc00-0010')::text, 'true');
  perform pg_temp.wc_ok('S4 ... every code field cleared, count back to 0',
    (select concat_ws(' ', code_hash is null, code_issued_at is null, code_expires_at is null, invite_count)
       from public.waitlist where id = id_plain), 't t t 0');
  update public.waitlist set redeemed_at = now() where id = id_used;
  perform pg_temp.wc_ok('S4 revoke never clears a redeemed code',
    public.waitlist_revoke_code(id_used, 'VIBE-WC00-0012')::text, 'false');
end $$;

-- S5. handle_new_user's redeem block (an auth.users insert fires it) -----------------
do $$
declare
  id_redeem uuid := (select id from wc_ids where tag = 'redeem');
  id_other  uuid := (select id from wc_ids where tag = 'other');
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  u4 uuid := gen_random_uuid();
  terms constant text := '2026-09-06';
  before_redeemed bigint;
begin
  -- The gate claimed VIBE-WC00-0005 for wc-d; the account is made with that address.
  perform pg_temp.wc_ok('S5 the gate claims the code for wc-d',
    pg_temp.wc_gate('wc-d@example.test', '{"access_code": "VIBE-WC00-0005"}'), 'allow');
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u1, 'wc-d@example.test', 'authenticated', 'authenticated',
          jsonb_build_object('access_code', 'VIBE-WC00-0005', 'terms_version', terms, 'age_attested', true));
  perform pg_temp.wc_ok('S5 a sign-up carrying the claimed code redeems the row with the new id',
    (select (redeemed_user_id = u1)::text || '/' || (redeemed_at = now())::text from public.waitlist where id = id_redeem),
    'true/true');
  perform pg_temp.wc_ok('S5 ... and the Terms record is written as before',
    (select concat_ws(' ', u.terms_version, (u.age_attested_at is not null)::text,
       (select count(*) from public.terms_acceptances t where t.user_id = u1 and t.source = 'signup'))
       from public.users u where u.id = u1),
    terms || ' true 1');
  perform pg_temp.wc_ok('S5 ... and the gate now says used',
    pg_temp.wc_gate('wc-e@example.test', '{"access_code": "VIBE-WC00-0005"}'), 'access_code_used');

  before_redeemed := (select count(*) from public.waitlist where redeemed_at is not null);
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u2, 'wc-f@example.test', 'authenticated', 'authenticated', jsonb_build_object('terms_version', terms, 'age_attested', true));
  perform pg_temp.wc_ok('S5 a sign-up without a code changes no waitlist row',
    (select count(*) from public.waitlist where redeemed_at is not null)::text, before_redeemed::text);
  perform pg_temp.wc_ok('S5 ... and still gets its users row and Terms record',
    (select count(*) from public.terms_acceptances t where t.user_id = u2 and t.source = 'signup')::text, '1');

  -- A code claimed by another address is not redeemed by this one.
  perform pg_temp.wc_ok('S5 the gate claims VIBE-WC00-0006 for wc-g',
    pg_temp.wc_gate('wc-g@example.test', '{"access_code": "VIBE-WC00-0006"}'), 'allow');
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u3, 'wc-h@example.test', 'authenticated', 'authenticated', '{"access_code": "VIBE-WC00-0006"}');
  perform pg_temp.wc_ok('S5 a code claimed by another address is not redeemed',
    (select (redeemed_at is null)::text from public.waitlist where id = id_other), 'true');

  -- A broken redeem update is only a WARNING: the account is still made.
  -- (NOT VALID: old rows are not checked, the redeem UPDATE is.)
  alter table public.waitlist add constraint wc_break check (redeemed_at is null) not valid;
  perform pg_temp.wc_ok('S5 the gate claims VIBE-WC00-0006 again for wc-g',
    pg_temp.wc_gate('wc-g@example.test', '{"access_code": "VIBE-WC00-0006"}'), 'allow');
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u4, 'wc-g@example.test', 'authenticated', 'authenticated', '{"access_code": "VIBE-WC00-0006"}');
  perform pg_temp.wc_ok('S5 a failing redeem (WARNING above) still makes the account',
    (select count(*) from public.users where id = u4)::text, '1');
  perform pg_temp.wc_ok('S5 ... and leaves the row unredeemed',
    (select (redeemed_at is null)::text from public.waitlist where id = id_other), 'true');
  alter table public.waitlist drop constraint wc_break;
end $$;

-- S5b. Whose code a sign-up may redeem (the review fix) -------------------------
do $$
declare
  id_x uuid := pg_temp.wc_row('allowx');
  u5 uuid := gen_random_uuid();
  u6 uuid := gen_random_uuid();
begin
  insert into wc_ids values ('allowx', id_x);
  perform pg_temp.wc_ok('S5b an unclaimed code for the next cases',
    public.waitlist_issue_code(id_x, 'VIBE-WC00-0007', null, 'test-1', false) ->> 'ok', 'true');
  -- Sign-up closed; an allowlisted address passes the gate without claiming.
  update public.app_settings set value = 'false'::jsonb where key = 'signup_open';
  insert into public.signup_allowlist (email, reason) values ('wc-allow2@example.test', 'manual');
  perform pg_temp.wc_ok('S5b closed: the allowlisted address passes the gate with someone''s code',
    pg_temp.wc_gate('wc-allow2@example.test', '{"access_code": "VIBE-WC00-0007"}'), 'allow');
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u5, 'wc-allow2@example.test', 'authenticated', 'authenticated', '{"access_code": "VIBE-WC00-0007"}');
  perform pg_temp.wc_ok('S5b ... but that unclaimed code is not marked joined by it',
    (select (redeemed_at is null)::text from public.waitlist where id = id_x), 'true');
  -- Sign-up open: an unclaimed code is redeemed by whoever signs up with it.
  update public.app_settings set value = 'true'::jsonb where key = 'signup_open';
  insert into auth.users (id, email, aud, role, raw_user_meta_data)
  values (u6, 'wc-open@example.test', 'authenticated', 'authenticated', '{"access_code": "vibe wc00 0007"}');
  perform pg_temp.wc_ok('S5b open: an unclaimed code is redeemed by the new account',
    (select (redeemed_user_id = u6)::text from public.waitlist where id = id_x), 'true');
  update public.app_settings set value = 'false'::jsonb where key = 'signup_open';
end $$;

-- S9. The typed code is stored only as its hash ----------------------------------
do $$
declare
  u uuid := (select id from auth.users where email = 'wc-open@example.test');
  want constant text := public.waitlist_code_hash('VIBE-WC00-0007');
begin
  perform pg_temp.wc_ok('S9 the new account''s metadata holds the hash, not the code',
    (select concat_ws(' ', raw_user_meta_data ? 'access_code', raw_user_meta_data ->> 'access_code_hash' = want)
       from auth.users where id = u), 'f t');
  update auth.users set raw_user_meta_data = raw_user_meta_data || '{"access_code": "VIBE-7KQ2-M9XD"}' where id = u;
  perform pg_temp.wc_ok('S9 an update writing a code back is scrubbed too',
    (select concat_ws(' ', raw_user_meta_data ? 'access_code',
       raw_user_meta_data ->> 'access_code_hash' = public.waitlist_code_hash('VIBE-7KQ2-M9XD'))
       from auth.users where id = u), 'f t');
  update auth.users set raw_user_meta_data = raw_user_meta_data || '{"access_code": "VIBE-7KQ2-M9XU"}' where id = u;
  perform pg_temp.wc_ok('S9 an invalid code is dropped, with any stale hash',
    (select concat_ws(' ', raw_user_meta_data ? 'access_code', raw_user_meta_data ? 'access_code_hash')
       from auth.users where id = u), 'f f');
  insert into auth.identities (provider_id, user_id, identity_data, provider)
  values (u::text, u, '{"sub":"x","access_code":"VIBE-WC00-0007"}', 'email');
  perform pg_temp.wc_ok('S9 the identity row keeps the hash, not the code',
    (select concat_ws(' ', identity_data ? 'access_code', identity_data ->> 'access_code_hash' = want)
       from auth.identities where user_id = u and provider = 'email'), 'f t');
end $$;

-- S10. Deleting an account deletes the waitlist row it joined with ---------------
do $$
declare
  id_x uuid := (select id from wc_ids where tag = 'allowx');
  id_other uuid := (select id from wc_ids where tag = 'other');
begin
  perform pg_temp.wc_ok('S10 fixture: wc-g still claims VIBE-WC00-0006',
    (select code_claimed_email from public.waitlist where id = id_other), 'wc-g@example.test');
  delete from auth.users where email in ('wc-open@example.test', 'wc-g@example.test');
  perform pg_temp.wc_ok('S10 the row the deleted account joined with is gone',
    (select count(*) from public.waitlist where id = id_x)::text, '0');
  perform pg_temp.wc_ok('S10 a claim by a deleted account''s address is cleared',
    (select (code_claimed_email is null and code_claimed_at is null)::text from public.waitlist where id = id_other),
    'true');
end $$;

-- S6. The wider CHECKs -------------------------------------------------------------
do $$
declare
  k text;
begin
  foreach k in array array['waitlist_confirm', 'waitlist_invite', 'bogus_kind'] loop
    perform pg_temp.wc_ok(format('S6 email_sends kind %s', k),
      pg_temp.wc_try(format('insert into public.email_sends (kind, recipient_domain, ok) values (%L, %L, true)', k, 'iu.edu')),
      case when k = 'bogus_kind' then 'E23514' else 'ok' end);
  end loop;
  foreach k in array array['waitlist_invite', 'waitlist_add', 'waitlist_remove', 'waitlist_reveal', 'waitlist_bogus'] loop
    perform pg_temp.wc_ok(format('S6 moderation action %s on a waitlist target', k),
      pg_temp.wc_try(format('insert into public.moderation_actions (action, target_type, target_id) values (%L, %L, gen_random_uuid())',
        k, 'waitlist')),
      case when k = 'waitlist_bogus' then 'E23514' else 'ok' end);
  end loop;
  perform pg_temp.wc_ok('S6 an unknown target type is still refused',
    pg_temp.wc_try($q$insert into public.moderation_actions (action, target_type, target_id) values ('waitlist_add', 'bogus', gen_random_uuid())$q$),
    'E23514');
  perform pg_temp.wc_ok('S6 the old kinds still pass',
    pg_temp.wc_try($q$insert into public.moderation_actions (action, target_type, target_id) values ('image_remove', 'user', gen_random_uuid())$q$),
    'ok');
end $$;

-- S7. Table rules ------------------------------------------------------------------
do $$
begin
  perform pg_temp.wc_ok('S7 a founder row may skip the consents',
    pg_temp.wc_try($q$insert into public.waitlist (email, email_key, origin, name, is_officer, officer_club, confirmed_at)
                      values ('wc-officer@gmail.com', 'wc-officer@gmail.com', 'founder', 'Officer', true, 'Robotics', now())$q$),
    'ok');
  perform pg_temp.wc_ok('S7 a form row may not',
    pg_temp.wc_try($q$insert into public.waitlist (email, email_key, name) values ('wc-x@iu.edu', 'wc-x@iu.edu', 'X')$q$),
    'E23514');
  perform pg_temp.wc_ok('S7 one row per email_key',
    pg_temp.wc_try($q$insert into public.waitlist (email, email_key, origin, name) values ('wc-ok+2@iu.edu', 'wc-ok@iu.edu', 'founder', 'Dup')$q$),
    'E23505');
  perform pg_temp.wc_ok('S7 an address in capitals is refused (stored lowercase)',
    pg_temp.wc_try($q$insert into public.waitlist (email, email_key, origin, name) values ('WC-Y@iu.edu', 'wc-y@iu.edu', 'founder', 'Y')$q$),
    'E23514');
  perform pg_temp.wc_ok('S7 a code hash without its dates is refused',
    pg_temp.wc_try(format($q$insert into public.waitlist (email, email_key, origin, name, code_hash) values ('wc-z@iu.edu', 'wc-z@iu.edu', 'founder', 'Z', %L)$q$,
      repeat('a', 64))),
    'E23514');
  perform pg_temp.wc_ok('S7 a bad source tag is refused by the table (the form drops it first)',
    pg_temp.wc_try($q$insert into public.waitlist (email, email_key, origin, name, source) values ('wc-s@iu.edu', 'wc-s@iu.edu', 'founder', 'S', 'Bad Tag')$q$),
    'E23514');
  perform pg_temp.wc_ok('S7 signup_open must be a jsonb boolean',
    pg_temp.wc_try($q$update public.app_settings set value = '"true"' where key = 'signup_open'$q$), 'E23514');
  perform pg_temp.wc_ok('S7 waitlist_email_viewers must be a jsonb array',
    pg_temp.wc_try($q$update public.app_settings set value = '"x"' where key = 'waitlist_email_viewers'$q$), 'E23514');
  perform pg_temp.wc_ok('S7 allowlist addresses are stored lowercase',
    pg_temp.wc_try($q$insert into public.signup_allowlist (email, reason) values ('WC-Up@example.test', 'manual')$q$), 'E23514');
  perform pg_temp.wc_ok('S7 allowlist reasons are review, founder or manual',
    pg_temp.wc_try($q$insert into public.signup_allowlist (email, reason) values ('wc-r@example.test', 'friend')$q$), 'E23514');
end $$;

-- S11. Retention (20261003140000, lines moved by 20261003150000 and
-- 20261003170000): every row goes 38 days after it joined, whatever its
-- state; unconfirmed form rows 28
-- days after their last confirm email; the cohort tag set at redemption
-- outlives the row ------------------------------------------------------------
do $$
declare
  st text;
  age int;
  v_tag text;
  code text;
  rid uuid;
  uid uuid;
  r text;
  v_first text[];
  v_rest text[];
  f constant regprocedure := 'public.waitlist_purge_expired(integer)'::regprocedure;
begin
  -- Who may run it, and what the tag table may hold.
  perform pg_temp.wc_ok('S11 EXECUTE on waitlist_purge_expired: not PUBLIC; anon, authenticated, service_role',
    concat_ws(' ',
      'public=' || exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0),
      'anon=' || has_function_privilege('anon', f, 'EXECUTE'),
      'authenticated=' || has_function_privilege('authenticated', f, 'EXECUTE'),
      'service_role=' || has_function_privilege('service_role', f, 'EXECUTE'),
      'definer=' || (select p.prosecdef from pg_proc p where p.oid = f),
      (select array_to_string(p.proconfig, ';') from pg_proc p where p.oid = f)),
    'public=false anon=true authenticated=true service_role=true definer=true search_path=""');
  foreach r in array array['anon', 'authenticated'] loop
    perform pg_temp.wc_ok(format('S11 %s calling waitlist_purge_expired is refused inside (42501)', r),
      pg_temp.wc_as(r, 'select count(*)::text from public.waitlist_purge_expired()'), 'E42501');
    perform pg_temp.wc_ok(format('S11 %s holds no privilege on public.user_cohorts', r),
      has_table_privilege(r, 'public.user_cohorts', 'select,insert,update,delete,truncate,references,trigger')::text, 'false');
  end loop;
  perform pg_temp.wc_ok('S11 user_cohorts: RLS on, no policy',
    (select c.relrowsecurity::text || '/' || (select count(*) from pg_policy p where p.polrelid = c.oid)
       from pg_class c where c.oid = 'public.user_cohorts'::regclass), 'true/0');
  perform pg_temp.wc_ok('S11 user_cohorts has no personal column',
    (select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a
      where a.attrelid = 'public.user_cohorts'::regclass and a.attnum > 0 and not a.attisdropped),
    'user_id,batch,origin,invited_on,joined_on');

  -- One row per state, 39 and 37 days old. Codes come from batch 'wave-1';
  -- a joined row is redeemed the real way (the gate claims, then an
  -- auth.users insert runs handle_new_user).
  foreach st in array array['unconfirmed', 'waiting', 'invited', 'expired', 'joined', 'founder'] loop
    foreach age in array array[39, 37] loop
      v_tag := format('r11-%s-%s', st, age);
      rid := pg_temp.wc_row(v_tag, st <> 'unconfirmed');
      insert into wc_ids values (v_tag, rid);
      if st in ('invited', 'expired', 'joined') then
        code := format('VIBE-WC1%s-00%s', case st when 'invited' then '1' when 'expired' then '2' else '3' end, age);
        perform pg_temp.wc_ok(format('S11 fixture: %s gets a code', v_tag),
          public.waitlist_issue_code(rid, code, null, 'wave-1', false) ->> 'ok', 'true');
      end if;
      if st = 'expired' then
        update public.waitlist set code_expires_at = now() - interval '1 day' where id = rid;
      elsif st = 'joined' then
        uid := gen_random_uuid();
        insert into wc_ids values ('user-' || v_tag, uid);
        perform pg_temp.wc_ok(format('S11 fixture: the gate claims %s', v_tag),
          pg_temp.wc_gate(format('wc-%s@example.test', v_tag), jsonb_build_object('access_code', code)), 'allow');
        insert into auth.users (id, email, aud, role, raw_user_meta_data)
        values (uid, format('wc-%s@example.test', v_tag), 'authenticated', 'authenticated',
                jsonb_build_object('access_code', code));
        perform pg_temp.wc_ok(format('S11 redeeming %s tags the account: batch, origin, the day let in, the day joined', v_tag),
          (select concat_ws(' ', c.batch, c.origin, (c.invited_on = (now() at time zone 'utc')::date)::text,
                            (c.joined_on = (now() at time zone 'utc')::date)::text)
             from public.user_cohorts c where c.user_id = uid),
          'wave-1 form true true');
      elsif st = 'founder' then
        update public.waitlist set origin = 'founder' where id = rid;
      elsif st = 'unconfirmed' then
        -- A recent confirm email: only the 38-day line can take it.
        update public.waitlist set confirm_sent_at = now() - interval '2 days' where id = rid;
      end if;
      update public.waitlist set created_at = now() - make_interval(days => age) where id = rid;
    end loop;
  end loop;

  -- The 28-day line: unconfirmed, no code, last confirm email over 28 days ago.
  insert into wc_ids values ('r11-u30-old', pg_temp.wc_row('r11-u30-old', false)),
                            ('r11-u30-renewed', pg_temp.wc_row('r11-u30-renewed', false)),
                            ('r11-u30-coded', pg_temp.wc_row('r11-u30-coded', false));
  perform public.waitlist_issue_code((select id from wc_ids w where w.tag = 'r11-u30-coded'), 'VIBE-WC14-0031', null, null, true);
  update public.waitlist w
     set created_at = now() - interval '31 days',
         confirm_sent_at = now() - case when w.email like 'wc-r11-u30-renewed@%' then interval '27 days' else interval '31 days' end
   where w.email like 'wc-r11-u30-%';

  -- The send log: a waitlist hash over 38 days old is forgotten, others stay.
  insert into public.email_sends (kind, recipient_domain, recipient_hash, ok, created_at) values
    ('waitlist_confirm', 'iu.edu', repeat('d', 64), true, now() - interval '40 days'),
    ('waitlist_invite', 'iu.edu', repeat('e', 64), true, now() - interval '37 days'),
    ('password_reset', 'iu.edu', repeat('f', 64), true, now() - interval '41 days');

  -- Paging: p_limit 1 deletes exactly one row; the next call takes the rest.
  v_first := array(select p.email from public.waitlist_purge_expired(1) p);
  perform pg_temp.wc_ok('S11 p_limit 1 deletes exactly one row', cardinality(v_first)::text, '1');
  v_rest := array(select p.email from public.waitlist_purge_expired() p);
  perform pg_temp.wc_ok('S11 deleted: every 39-day row, whatever its state, and the 31-day unconfirmed one',
    array_to_string(array(select x from unnest(v_first || v_rest) x where x like 'wc-r11-%' order by x collate "C"), ','),
    'wc-r11-expired-39@iu.edu,wc-r11-founder-39@iu.edu,wc-r11-invited-39@iu.edu,wc-r11-joined-39@iu.edu,'
    || 'wc-r11-u30-old@iu.edu,wc-r11-unconfirmed-39@iu.edu,wc-r11-waiting-39@iu.edu');
  perform pg_temp.wc_ok('S11 kept: every 37-day row, a renewed confirm and an unconfirmed row with a code',
    (select string_agg(w.email, ',' order by w.email collate "C") from public.waitlist w where w.email like 'wc-r11-%'),
    'wc-r11-expired-37@iu.edu,wc-r11-founder-37@iu.edu,wc-r11-invited-37@iu.edu,wc-r11-joined-37@iu.edu,'
    || 'wc-r11-u30-coded@iu.edu,wc-r11-u30-renewed@iu.edu,wc-r11-unconfirmed-37@iu.edu,wc-r11-waiting-37@iu.edu');
  perform pg_temp.wc_ok('S11 service_role may run it; nothing is left to delete',
    pg_temp.wc_as('service_role', 'select count(*)::text from public.waitlist_purge_expired()'), '0');
  perform pg_temp.wc_ok('S11 the send log: the 40-day waitlist hash is forgotten, the 37-day one and the rest stay',
    (select string_agg(left(coalesce(s.recipient_hash, '-'), 1), '' order by s.kind)
       from public.email_sends s where s.recipient_hash in (repeat('d', 64), repeat('e', 64), repeat('f', 64))
          or (s.recipient_hash is null and s.kind = 'waitlist_confirm' and s.created_at = now() - interval '40 days')),
    'f-e');
  perform pg_temp.wc_ok('S11 a live code died with its entry (invalid at the gate)',
    pg_temp.wc_gate('wc-late@example.test', '{"access_code": "VIBE-WC11-0039"}'), 'access_code_invalid');

  -- The account and its tag outlive the row; the tag goes with the account.
  uid := (select id from wc_ids w where w.tag = 'user-r11-joined-39');
  perform pg_temp.wc_ok('S11 the joined-39 account and its cohort tag survive the purge',
    (select concat_ws(' ', (select count(*) from public.users u where u.id = uid),
                      c.batch, c.origin, (c.invited_on = (now() at time zone 'utc')::date)::text)
       from public.user_cohorts c where c.user_id = uid),
    '1 wave-1 form true');
  uid := (select id from wc_ids w where w.tag = 'user-r11-joined-37');
  delete from auth.users where id = uid;
  perform pg_temp.wc_ok('S11 deleting an account deletes its cohort tag',
    (select count(*) from public.user_cohorts c where c.user_id = uid)::text, '0');
end $$;

-- S12. Retention fixes (20261003150000): a code ends with its entry, an
-- entry past its line gets none, the purge's exact line, and batch names
-- are a word and a number -----------------------------------------------------
do $$
declare
  r30 uuid := pg_temp.wc_row('r12-day30');
  r20 uuid := pg_temp.wc_row('r12-day20');
  r24 uuid := pg_temp.wc_row('r12-day24');
  rold uuid := pg_temp.wc_row('r12-past');
  res jsonb;
begin
  update public.waitlist set created_at = now() - interval '30 days' where id = r30;
  update public.waitlist set created_at = now() - interval '20 days' where id = r20;
  update public.waitlist set created_at = now() - interval '24 days' where id = r24;
  update public.waitlist set created_at = now() - interval '38 days 1 minute' where id = rold;

  res := public.waitlist_issue_code(r30, 'VIBE-WC20-0001', null, 'wave-2', false);
  perform pg_temp.wc_ok('S12 a code sent on day 30 ends when the entry is deleted (day 38), not in 14 days',
    concat_ws(' ', res ->> 'ok', ((res ->> 'expires_at')::timestamptz = now() + interval '8 days')::text,
      (select (code_expires_at = created_at + interval '38 days')::text from public.waitlist where id = r30)),
    'true true true');
  res := public.waitlist_issue_code(r20, 'VIBE-WC20-0002', null, 'wave-2', false);
  perform pg_temp.wc_ok('S12 a code sent on day 20 keeps its 14 days',
    concat_ws(' ', res ->> 'ok', ((res ->> 'expires_at')::timestamptz = now() + interval '14 days')::text), 'true true');
  res := public.waitlist_issue_code(r24, 'VIBE-WC20-0005', null, 'wave-2', false);
  perform pg_temp.wc_ok('S12 a code sent on day 24 still gets its full 14 days (the admin tab: send by day 24)',
    concat_ws(' ', res ->> 'ok', ((res ->> 'expires_at')::timestamptz = now() + interval '14 days')::text), 'true true');
  perform pg_temp.wc_ok('S12 an entry past its line gets no code, in either mode',
    concat_ws(' ', public.waitlist_issue_code(rold, 'VIBE-WC20-0003', null, 'wave-2', false) ->> 'reason',
                   public.waitlist_issue_code(rold, 'VIBE-WC20-0003', null, 'wave-2', true) ->> 'reason'),
    'entry_expired entry_expired');
  perform pg_temp.wc_ok('S12 ... and nothing on it changed',
    (select concat_ws(' ', code_hash is null, invite_count, coalesce(batch, '-')) from public.waitlist where id = rold),
    't 0 -');

  -- The exact line: past 38 days goes, just under it stays.
  insert into wc_ids values ('r12-under', pg_temp.wc_row('r12-under'));
  update public.waitlist set created_at = now() - interval '37 days 23 hours'
   where id = (select id from wc_ids where tag = 'r12-under');
  perform pg_temp.wc_ok('S12 the purge takes the entry 38 days and a minute old, and no younger one',
    array_to_string(array(select p.email from public.waitlist_purge_expired() p where p.email like 'wc-r12-%'), ','),
    'wc-r12-past@iu.edu');

  -- Batch names: a word and a number, in both tables.
  perform pg_temp.wc_ok('S12 waitlist.batch takes wave-style names',
    pg_temp.wc_try(format('update public.waitlist set batch = %L where id = %L', 'officers-12', r20)), 'ok');
  perform pg_temp.wc_ok('S12 waitlist.batch refuses a name, free text or a big number',
    concat_ws(' ',
      pg_temp.wc_try(format('update public.waitlist set batch = %L where id = %L', 'sam-smith', r20)),
      pg_temp.wc_try(format('update public.waitlist set batch = %L where id = %L', 'wave-1000', r20)),
      pg_temp.wc_try(format('update public.waitlist set batch = %L where id = %L', 'wc-check', r20))),
    'E23514 E23514 E23514');
  perform pg_temp.wc_ok('S12 waitlist_issue_code refuses a free-text batch (23514)',
    pg_temp.wc_try(format('select public.waitlist_issue_code(%L, %L, null, %L, true)', r20, 'VIBE-WC20-0004', 'jamie-r')),
    'E23514');
  -- A check runs before the foreign key, so a good name gets as far as the FK.
  perform pg_temp.wc_ok('S12 user_cohorts.batch: a free-text name is refused; a wave name passes the check',
    concat_ws(' ',
      pg_temp.wc_try($q$insert into public.user_cohorts (user_id, batch, origin, invited_on, joined_on)
                       values (gen_random_uuid(), 'sam', 'form', current_date, current_date)$q$),
      pg_temp.wc_try($q$insert into public.user_cohorts (user_id, batch, origin, invited_on, joined_on)
                       values (gen_random_uuid(), 'friends-3', 'form', current_date, current_date)$q$)),
    'E23514 E23503');
end $$;

-- S13. The line (20261003160000): one deletion moment for the purge, the
-- drop and the code; an entry past it counts as gone before the purge
-- reaches it, so the same person joins again as a fresh entry; and no code
-- goes out in an entry's last 24 hours -----------------------------------------
do $$
declare
  r text;
  v_old uuid;
  v_new uuid;
  res jsonb;
  drop_sql constant text := $q$select coalesce(public.waitlist_drop_if_due(%L), '-')$q$;
begin
  perform pg_temp.wc_ok('S13 EXECUTE on waitlist_deletes_at and waitlist_drop_if_due: not PUBLIC; the three API roles',
    (select string_agg(concat_ws(' ', p.proname,
         'public=' || exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0),
         'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE'),
         'authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE'),
         'service_role=' || has_function_privilege('service_role', p.oid, 'EXECUTE'),
         'definer=' || p.prosecdef, array_to_string(p.proconfig, ';')), ' | ' order by p.proname)
       from pg_proc p
      where p.oid in ('public.waitlist_deletes_at(public.waitlist)'::regprocedure, 'public.waitlist_drop_if_due(text)'::regprocedure)),
    'waitlist_deletes_at public=false anon=true authenticated=true service_role=true definer=false search_path="" | '
    || 'waitlist_drop_if_due public=false anon=true authenticated=true service_role=true definer=true search_path=""');
  foreach r in array array['anon', 'authenticated'] loop
    perform pg_temp.wc_ok(format('S13 %s calling waitlist_drop_if_due is refused inside (42501)', r),
      pg_temp.wc_as(r, format(drop_sql, 'wc-nobody@iu.edu')), 'E42501');
  end loop;

  -- The same vectors as admin-view.test.ts (types.ts waitlistDeletesAt).
  perform pg_temp.wc_ok('S13 waitlist_deletes_at gives the dates the pages show (admin-view.test.ts vectors)',
    (select string_agg(to_char(public.waitlist_deletes_at(jsonb_populate_record(null::public.waitlist, v.j)) at time zone 'utc',
                               'MM-DD"T"HH24:MI'), ' ' order by v.n)
       from (values
         (1, '{"origin":"form","created_at":"2026-10-01T00:00:00Z","confirm_sent_at":"2026-10-01T00:00:05Z","confirmed_at":"2026-10-01T01:00:00Z"}'::jsonb),
         (2, '{"origin":"form","created_at":"2026-10-01T00:00:00Z","confirm_sent_at":"2026-10-05T00:00:00Z"}'),
         (3, '{"origin":"form","created_at":"2026-10-01T00:00:00Z"}'),
         (4, '{"origin":"form","created_at":"2026-10-01T00:00:00Z","confirm_sent_at":"2026-10-25T00:00:00Z"}'),
         (5, jsonb_build_object('origin', 'form', 'created_at', '2026-10-01T00:00:00Z', 'confirm_sent_at', '2026-10-05T00:00:00Z',
                                'code_hash', repeat('a', 64))),
         (6, '{"origin":"founder","created_at":"2026-10-01T00:00:00Z","confirm_sent_at":"2026-10-05T00:00:00Z"}')) v(n, j)),
    '11-08T00:00 11-02T00:00 10-29T00:00 11-08T00:00 11-08T00:00 11-08T00:00');

  -- Past the line but not purged yet: the form (and "Add someone") drop it first.
  v_old := pg_temp.wc_row('r13-past');
  update public.waitlist set created_at = now() - interval '38 days 1 minute', source = 'old' where id = v_old;
  insert into wc_ids values ('r13-under', pg_temp.wc_row('r13-under')), ('r13-u28', pg_temp.wc_row('r13-u28', false)),
                            ('r13-fpast', pg_temp.wc_row('r13-fpast'));
  update public.waitlist set created_at = now() - interval '37 days 23 hours' where email = 'wc-r13-under@iu.edu';
  update public.waitlist set created_at = now() - interval '31 days', confirm_sent_at = now() - interval '28 days 1 minute'
   where email = 'wc-r13-u28@iu.edu';
  update public.waitlist set created_at = now() - interval '40 days' where email = 'wc-r13-fpast@iu.edu';
  perform pg_temp.wc_ok('S13 without the drop, the same person can''t be added (one row per email_key: the old row comes back)',
    pg_temp.wc_try($q$insert into public.waitlist (email, email_key, origin, name) values ('wc-r13-fpast@iu.edu', 'wc-r13-fpast@iu.edu', 'founder', 'F')$q$),
    'E23505');
  -- One statement per step: a later statement sees what an earlier one deleted.
  perform pg_temp.wc_ok('S13 drop_if_due: an entry 38 days and a minute old goes now, and its address comes back',
    pg_temp.wc_as('service_role', format(drop_sql, 'wc-r13-past@iu.edu')), 'wc-r13-past@iu.edu');
  perform pg_temp.wc_ok('S13 ... the row is gone', (select count(*) from public.waitlist where id = v_old)::text, '0');
  perform pg_temp.wc_ok('S13 drop_if_due: an unconfirmed entry past its 28-day line goes too',
    pg_temp.wc_as('service_role', format(drop_sql, 'wc-r13-u28@iu.edu')), 'wc-r13-u28@iu.edu');
  perform pg_temp.wc_ok('S13 drop_if_due: an entry 37 days 23 hours old stays; an unknown address is nothing',
    concat_ws(' ', pg_temp.wc_as('service_role', format(drop_sql, 'wc-r13-under@iu.edu')),
      (select count(*) from public.waitlist where email = 'wc-r13-under@iu.edu'),
      pg_temp.wc_as('service_role', format(drop_sql, 'wc-r13-nobody@iu.edu'))), '- 1 -');
  v_new := pg_temp.wc_row('r13-past', false);
  perform pg_temp.wc_ok('S13 joining again after the drop: a fresh entry (new id, unconfirmed, no code, no old answers, its own 28 days)',
    (select concat_ws(' ', w.id <> v_old, w.confirmed_at is null, w.code_hash is null, coalesce(w.source, '-'),
                      public.waitlist_deletes_at(w) = w.created_at + interval '28 days')
       from public.waitlist w where w.id = v_new), 't t t - t');
  perform pg_temp.wc_ok('S13 "Add someone" for an entry past its line: the drop first',
    pg_temp.wc_as('service_role', format(drop_sql, 'wc-r13-fpast@iu.edu')), 'wc-r13-fpast@iu.edu');
  perform pg_temp.wc_ok('S13 ... then a fresh founder row goes in',
    pg_temp.wc_try($q$insert into public.waitlist (email, email_key, origin, name) values ('wc-r13-fpast@iu.edu', 'wc-r13-fpast@iu.edu', 'founder', 'F')$q$),
    'ok');
  perform pg_temp.wc_ok('S13 ... dated today, with its own 38 days',
    (select concat_ws(' ', origin, created_at = now(), public.waitlist_deletes_at(w) = now() + interval '38 days')
       from public.waitlist w where w.email = 'wc-r13-fpast@iu.edu'), 'founder t t');

  -- No code in an entry's last 24 hours (the admin tab: "Leaves within a day", no Send code).
  insert into wc_ids values ('r13-23h', pg_temp.wc_row('r13-23h')), ('r13-25h', pg_temp.wc_row('r13-25h')),
                            ('r13-u23h', pg_temp.wc_row('r13-u23h', false)), ('r13-upast', pg_temp.wc_row('r13-upast', false));
  update public.waitlist set created_at = now() - interval '37 days 1 hour' where email = 'wc-r13-23h@iu.edu';
  update public.waitlist set created_at = now() - interval '36 days 23 hours' where email = 'wc-r13-25h@iu.edu';
  update public.waitlist set created_at = now() - interval '28 days', confirm_sent_at = now() - interval '27 days 1 hour'
   where email = 'wc-r13-u23h@iu.edu';
  update public.waitlist set created_at = now() - interval '30 days', confirm_sent_at = now() - interval '28 days 1 minute'
   where email = 'wc-r13-upast@iu.edu';
  v_old := (select id from wc_ids where tag = 'r13-23h');
  perform pg_temp.wc_ok('S13 23 hours left: no code, in either mode (entry_expiring)',
    concat_ws(' ', public.waitlist_issue_code(v_old, 'VIBE-WC30-0001', null, 'wave-3', false) ->> 'reason',
                   public.waitlist_issue_code(v_old, 'VIBE-WC30-0001', null, 'wave-3', true) ->> 'reason'),
    'entry_expiring entry_expiring');
  perform pg_temp.wc_ok('S13 ... and nothing on it changed',
    (select concat_ws(' ', code_hash is null, invite_count, coalesce(batch, '-')) from public.waitlist where id = v_old), 't 0 -');
  v_new := (select id from wc_ids where tag = 'r13-25h');
  res := public.waitlist_issue_code(v_new, 'VIBE-WC30-0002', null, 'wave-3', false);
  perform pg_temp.wc_ok('S13 25 hours left: the code goes, and ends when the entry is deleted',
    concat_ws(' ', res ->> 'ok',
      ((res ->> 'expires_at')::timestamptz = (select created_at + interval '38 days' from public.waitlist where id = v_new))::text),
    'true true');
  perform pg_temp.wc_ok('S13 an unconfirmed entry 23 hours from its 28-day line: no code (entry_expiring)',
    public.waitlist_issue_code((select id from wc_ids where tag = 'r13-u23h'), 'VIBE-WC30-0003', null, null, true) ->> 'reason',
    'entry_expiring');
  perform pg_temp.wc_ok('S13 an unconfirmed entry past its 28-day line counts as gone: no code (entry_expired)',
    public.waitlist_issue_code((select id from wc_ids where tag = 'r13-upast'), 'VIBE-WC30-0004', null, null, true) ->> 'reason',
    'entry_expired');
end $$;

-- S14. The restarted clock (20261003170000; its 38 / 28-day lines are in S11 to
-- S13): a new confirm link (the form's renewal, as store.ts renewConfirmToken
-- sends it) makes an unconfirmed entry's join date now, so its 28 days, and
-- its 38 once confirmed, start again; any other entry keeps its date --------------
do $$
declare
  v_u uuid := pg_temp.wc_row('r14-unconfirmed', false);
  v_c uuid := pg_temp.wc_row('r14-confirmed');
  v_k uuid := pg_temp.wc_row('r14-coded', false);
  v_o uuid := pg_temp.wc_row('r14-other', false);
  f constant regprocedure := 'public.waitlist_restart_clock()'::regprocedure;
  renew constant text := $q$update public.waitlist set name = 'Again', manage_token_hash = %L,
    confirm_sent_at = now(), updated_at = now() where id = %L returning 'renewed'$q$;
begin
  perform pg_temp.wc_ok('S14 waitlist_restart_clock: a trigger function only (no API role, no PUBLIC, not definer)',
    concat_ws(' ',
      'public=' || exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = f and a.grantee = 0),
      'anon=' || has_function_privilege('anon', f, 'EXECUTE'),
      'authenticated=' || has_function_privilege('authenticated', f, 'EXECUTE'),
      'definer=' || (select p.prosecdef from pg_proc p where p.oid = f),
      (select array_to_string(p.proconfig, ';') from pg_proc p where p.oid = f)),
    'public=false anon=false authenticated=false definer=false search_path=""');

  -- Four entries 20 days old, their last confirm email 20 days ago. The link
  -- first, then the dates, in two statements: the trigger would date a row
  -- given both in one update today.
  perform public.waitlist_issue_code(v_k, 'VIBE-WC40-0001', null, null, true);
  update public.waitlist set manage_token_hash = repeat('1d', 32) where id = v_o;
  update public.waitlist set created_at = now() - interval '20 days', confirm_sent_at = now() - interval '20 days'
   where id in (v_u, v_c, v_k, v_o);
  perform pg_temp.wc_ok('S14 fixture: the unconfirmed entry has 8 days left (its 28-day line)',
    (select (public.waitlist_deletes_at(w) = now() + interval '8 days')::text from public.waitlist w where w.id = v_u),
    'true');

  -- One statement per step: a later statement sees what an earlier one wrote.
  perform pg_temp.wc_ok('S14 signing up again while unconfirmed (the renewal, as the service role)',
    pg_temp.wc_as('service_role', format(renew, repeat('1a', 32), v_u)), 'renewed');
  perform pg_temp.wc_ok('S14 ... makes its join date now: 28 days from today, not 8',
    (select concat_ws(' ', w.created_at = now(), public.waitlist_deletes_at(w) = now() + interval '28 days')
       from public.waitlist w where w.id = v_u), 't t');
  update public.waitlist set confirmed_at = now() where id = v_u;
  perform pg_temp.wc_ok('S14 ... and confirming then keeps it the full 38 days',
    (select (public.waitlist_deletes_at(w) = now() + interval '38 days')::text from public.waitlist w where w.id = v_u),
    'true');

  perform pg_temp.wc_ok('S14 a new link written on a confirmed entry (the store never does; the trigger holds anyway)',
    pg_temp.wc_as('service_role', format(renew, repeat('1b', 32), v_c)), 'renewed');
  perform pg_temp.wc_ok('S14 ... the confirmed entry keeps its date',
    (select (created_at = now() - interval '20 days')::text from public.waitlist where id = v_c), 'true');
  perform pg_temp.wc_ok('S14 a new link written on an unconfirmed entry with a code',
    pg_temp.wc_as('service_role', format(renew, repeat('1c', 32), v_k)), 'renewed');
  perform pg_temp.wc_ok('S14 ... the entry with a code keeps its date',
    (select (created_at = now() - interval '20 days')::text from public.waitlist where id = v_k), 'true');
  update public.waitlist set name = 'Again', confirm_sent_at = now() where id = v_o;
  update public.waitlist set manage_token_hash = repeat('1d', 32) where id = v_o;
  perform pg_temp.wc_ok('S14 other writes, or the same link again, leave an unconfirmed entry''s date alone',
    (select (created_at = now() - interval '20 days')::text from public.waitlist where id = v_o), 'true');
end $$;

-- S8. The switch -------------------------------------------------------------------
do $$
begin
  update public.app_settings set value = 'true'::jsonb where key = 'signup_open';
  perform pg_temp.wc_ok('S8 signup_is_open() follows the row (true)', public.signup_is_open()::text, 'true');
  update public.app_settings set value = 'false'::jsonb where key = 'signup_open';
  perform pg_temp.wc_ok('S8 signup_is_open() follows the row (false)', public.signup_is_open()::text, 'false');
  delete from public.app_settings where key = 'signup_open';
  perform pg_temp.wc_ok('S8 no row at all reads as closed', public.signup_is_open()::text, 'false');
  perform pg_temp.wc_ok('S8 ... and the gate is closed', pg_temp.wc_gate('wc-new@example.test'), 'access_code_required');
end $$;

-- The end. -----------------------------------------------------------------------
do $$
begin
  raise notice 'waitlist-gate-check: all % cases passed',
    coalesce(nullif(current_setting('waitlist_gate_check.passed', true), ''), '0');
end $$;

rollback;
