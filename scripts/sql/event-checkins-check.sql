-- event-checkins-check.sql: the behaviour tests of event check-in's migration
-- (Franky's calls of Oct 19, 2026; handoffs/2026-10-19-checkin-build/CONTRACT.md
-- section 6):
--   supabase/migrations/20261019120000_event_checkins.sql
-- An officer starts check-in and their screen shows a 4-digit code and a QR
-- link that change every 30 seconds; anyone who may see the event checks in
-- with one of them (through the route, as the service role); officers mark
-- people who said Going or Interested, take one off or clear all; everyone
-- else sees only how many, from 5 up. Nothing records a time or a place.
--
-- LOCAL ONLY. Run it AFTER the file is applied to the local stack:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/event-checkins-check.sql
-- Never on production: it writes (and rolls back) accounts, two clubs, six
-- events, RSVPs, a restriction, check-in sessions and check-ins, and deletes
-- an account, an event and a club to prove the cascades. It refuses any
-- connection that is not the local unix socket (docker exec), and its first
-- line is a psql command, so the Management API and the MCP refuse the file
-- before anything runs. One builder on the local database at a time: not
-- beside another check script or the seed.
-- Expected last line: event-checkins-check: all N cases passed.
-- Nothing is kept: ROLLBACK follows.
--
-- WHAT IT DOES. ONE transaction that ends in ROLLBACK, with its own fixtures
-- (it does not lean on the seed): an owner, an admin, a member, six
-- strangers (both sides of 5), a restricted student, an admin who is then
-- restricted, a student who never accepted the Terms; a verified live club
-- with a live event (started 30 min ago, ends in 2 h), a future one (+1 day),
-- one that ended 3 h ago and one that ended 25 h ago; a hidden club's live
-- event; an org-less live event.
-- Cases:
--   O  start check-in: open, already open, not a manager, outside the
--      window, a hidden club, a restricted officer, signed out (42501).
--   S  a student checks in (event_checkin_self_as, as the service role):
--      this step's and the last step's code, an older code, a code made to
--      miss, the QR token 3 steps back and 4 steps back, outside the window,
--      a hidden club, a missing event, an org-less event for a stranger,
--      restricted, no Terms, both or neither (22023), a browser role (42501).
--   D  the door's feed: this step's and the next step's codes, the exact count.
--   M  Mark as here: the list rule, the 24 h window, the gates.
--   F  the count from 5 up (event_checkin_state), and is_open.
--   R  the table's policies, straight from the database.
--   U  take one off, clear all.
--   C  stop check-in: the codes die, a new start makes new ones, open tidies
--      a dead session.
--   Y  my check-ins (event_checkin_mine), for Settings.
--   X  the cascades: an account, an event, a club.
-- NOT here: the routes (src/lib/events/checkin-routes.test.ts,
-- attendees-route.test.ts), the file's catalog shape
-- (src/lib/events/checkin-migration.test.ts), its own in-file post-checks.
-- It raises on the first expectation that fails ("event-checkins-check
-- FAILED: ...") and prints one NOTICE per case that passes.
--
-- TIME. now() is fixed inside one transaction, so every function here sees
-- the same 30-second step s = floor(epoch(now()) / 30) and nothing drifts.
-- Codes are derived as postgres from the session's secret at s + k.
--
-- HOW IT ACTS AS SOMEONE. Students: role authenticated + their id in
-- request.jwt.claims, the way PostgREST runs a signed-in request. The
-- check-in route calls event_checkin_self_as with the SERVICE client: role
-- service_role, no claims. Answers: 'ok N' = the statement ran and touched N
-- rows; otherwise the value, or the SQLSTATE that refused it (42501 = a
-- policy, a grant or the function's own refusal; 22023 = a bad argument).

-- A psql command: anything that is not psql refuses the file here.
\set ON_ERROR_STOP on

begin;

-- Only on the local stack, and only on a database that has the file. ---------
do $$
begin
  if inet_server_addr() is not null then
    raise exception 'event-checkins-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if to_regclass('public.event_checkins') is null or to_regprocedure('public.event_checkin_self_as(uuid,uuid,text,text)') is null then
    raise exception 'event-checkins-check: event check-in is missing. Apply 20261019120000_event_checkins.sql to the local stack first';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.ok(p_case text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'event-checkins-check FAILED: % (got "%", expected "%")', p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('ecc.passed', (coalesce(nullif(current_setting('ecc.passed', true), ''), '0')::int + 1)::text, true);
  raise notice 'event-checkins-check ok: %', p_case;
end $$;
-- Runs a statement as p_role (and p_who's claims): 'ok N', or the SQLSTATE.
create function pg_temp.run(p_role text, p_who uuid, p_sql text) returns text language plpgsql as $$
declare me text := current_user; n bigint; got text;
begin
  perform set_config('request.jwt.claims', case when p_who is null then '' else json_build_object('sub', p_who, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count; got := 'ok ' || n;
  exception when others then got := sqlstate; end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return got;
end $$;
-- One value of a query as p_role (and p_who's claims), or the SQLSTATE.
create function pg_temp.val(p_role text, p_who uuid, p_sql text) returns text language plpgsql as $$
declare me text := current_user; got text;
begin
  perform set_config('request.jwt.claims', case when p_who is null then '' else json_build_object('sub', p_who, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql into got; exception when others then got := sqlstate; end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return got;
end $$;
create function pg_temp.keep(k text, v uuid) returns void language sql as $$ select set_config('ecc.' || k, v::text, true) $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select nullif(current_setting('ecc.' || k, true), '')::uuid $$;
-- A value as a signed-in student, or the SQLSTATE.
create function pg_temp.as_(who text, p_sql text) returns text language sql as $$
  select pg_temp.val('authenticated', pg_temp.id(who), p_sql) $$;
-- A statement as a signed-in student: 'ok N', or the SQLSTATE.
create function pg_temp.do_(who text, p_sql text) returns text language sql as $$
  select pg_temp.run('authenticated', pg_temp.id(who), p_sql) $$;
-- The check-in route's call, as the service role: one word, or the SQLSTATE.
create function pg_temp.self(who text, ev text, p_code text, p_token text) returns text language sql as $$
  select pg_temp.val('service_role', null, format('select public.event_checkin_self_as(%L::uuid, %L::uuid, %L::text, %L::text)',
                                                  pg_temp.id(who), pg_temp.id(ev), p_code, p_token)) $$;
-- An officer function as a student, e.g. pg_temp.off('owner', 'open', 'live').
create function pg_temp.off(who text, fn text, ev text) returns text language sql as $$
  select pg_temp.as_(who, format('select public.event_checkin_%s(%L::uuid)::text', fn, pg_temp.id(ev))) $$;
-- The live step: s = floor(epoch(now()) / 30), the same in every function.
create function pg_temp.step() returns bigint language sql as $$ select floor(extract(epoch from now()) / 30)::bigint $$;
-- The code and the QR token of an event's open session at step s + k (as postgres).
create function pg_temp.code_at(ev text, k int) returns text language sql as $$
  select d.code from public.event_checkin_sessions s, public.event_checkin_derive(s.secret, s.event_id, pg_temp.step() + k) d
   where s.event_id = pg_temp.id(ev) $$;
create function pg_temp.token_at(ev text, k int) returns text language sql as $$
  select d.token from public.event_checkin_sessions s, public.event_checkin_derive(s.secret, s.event_id, pg_temp.step() + k) d
   where s.event_id = pg_temp.id(ev) $$;
-- How many check-ins an event holds, read as postgres (the truth).
create function pg_temp.here(ev text) returns text language sql as $$
  select count(*)::text from public.event_checkins where event_id = pg_temp.id(ev) $$;
-- One column of event_checkin_state for one event, as a student.
create function pg_temp.state(who text, ev text, col text) returns text language sql as $$
  select pg_temp.as_(who, format('select coalesce(%I::text, ''null'') from public.event_checkin_state(array[%L]::uuid[])', col, pg_temp.id(ev))) $$;

-- Fixtures: accounts. All accepted the Terms but 'noterms'. -------------------
do $$
declare k text; u uuid;
begin
  foreach k in array array['owner','admin','member','s1','s2','s3','s4','s5','s6','restricted','offrest','noterms'] loop
    u := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'ecc-' || k || '-' || left(u::text, 8) || '@example.test',
            case when k = 'noterms' then jsonb_build_object('full_name', 'ECC ' || k)
                 else jsonb_build_object('full_name', 'ECC ' || k, 'terms_version', '2026-01-01', 'age_attested', true) end,
            now(), now());
    perform pg_temp.keep(k, u);
  end loop;
  perform pg_temp.ok('fixture: twelve accounts, eleven with the Terms',
    (select count(*) filter (where terms_accepted_at is not null and age_attested_at is not null)::text || '/' || count(*)::text
       from public.users where id in (select pg_temp.id(x) from unnest(array['owner','admin','member','s1','s2','s3','s4','s5','s6','restricted','offrest','noterms']) x)),
    '11/12');
end $$;

-- Fixtures: a verified live club and a hidden one, six events, RSVPs. ---------
do $$
declare
  v_owner uuid := pg_temp.id('owner');
  v_club uuid := gen_random_uuid(); v_hid uuid := gen_random_uuid();
  k text; v uuid;
begin
  perform pg_temp.keep('club', v_club); perform pg_temp.keep('hidclub', v_hid);
  insert into public.orgs (id, handle, name, owner_id, join_policy, is_public, campus_id, school, verified, hidden_at) values
    (v_club, 'ecc_' || left(v_club::text, 8), 'ECC Club', v_owner, 'invite', false, 'indianapolis', 'IU Indianapolis', true, null),
    (v_hid, 'ecch_' || left(v_hid::text, 8), 'ECC Hidden', v_owner, 'open', true, 'indianapolis', 'IU Indianapolis', true, now());
  insert into public.org_members (org_id, user_id, role) values
    (v_club, v_owner, 'owner'), (v_club, pg_temp.id('admin'), 'admin'), (v_club, pg_temp.id('member'), 'member'),
    (v_club, pg_temp.id('offrest'), 'admin'), (v_hid, v_owner, 'owner');
  foreach k in array array['live','future','ended3','ended25','hidlive','orgless'] loop
    v := gen_random_uuid();
    perform pg_temp.keep(k, v);
    insert into public.events (id, org_id, creator_id, title, starts_at, ends_at, location)
    values (v,
            case k when 'hidlive' then v_hid when 'orgless' then null else v_club end,
            v_owner, 'ECC ' || k,
            now() + case k when 'future' then interval '1 day' when 'ended3' then interval '-5 hours'
                           when 'ended25' then interval '-27 hours' else interval '-30 minutes' end,
            now() + case k when 'future' then interval '1 day 2 hours' when 'ended3' then interval '-3 hours'
                           when 'ended25' then interval '-25 hours' else interval '2 hours' end,
            'x');
  end loop;
  -- The member said Going to the live event and the two ended ones; s1
  -- said Interested to the live one, s2 "Can't go".
  insert into public.rsvps (event_id, user_id, status) values
    (pg_temp.id('live'), pg_temp.id('member'), 'going'), (pg_temp.id('ended3'), pg_temp.id('member'), 'going'),
    (pg_temp.id('ended25'), pg_temp.id('member'), 'going'), (pg_temp.id('live'), pg_temp.id('s1'), 'maybe'),
    (pg_temp.id('live'), pg_temp.id('s2'), 'no');
  -- 'restricted' is suspended for a week; 'offrest' (an admin) too, from the start.
  insert into public.account_restrictions (identity_key, key_kind, user_id, kind, starts_at, ends_at, reason_code) values
    ('ecc-restricted-' || pg_temp.id('restricted'), 'school', pg_temp.id('restricted'), 'suspension', now() - interval '1 hour', now() + interval '7 days', 'other'),
    ('ecc-offrest-' || pg_temp.id('offrest'), 'school', pg_temp.id('offrest'), 'suspension', now() - interval '1 hour', now() + interval '7 days', 'other');
  perform pg_temp.ok('fixture: six events, five RSVPs, two restrictions, no check-in yet',
    (select count(*)::text from public.events where id in (select pg_temp.id(x) from unnest(array['live','future','ended3','ended25','hidlive','orgless']) x))
    || '/' || (select count(*)::text from public.rsvps where user_id in (pg_temp.id('member'), pg_temp.id('s1'), pg_temp.id('s2')))
    || '/' || (select count(*)::text from public.account_restrictions where user_id in (pg_temp.id('restricted'), pg_temp.id('offrest')))
    || '/' || (select count(*)::text from public.event_checkins c join public.events e on e.id = c.event_id where e.org_id = v_club or e.creator_id = v_owner),
    '6/5/2/0');
  perform pg_temp.ok('fixture: the restricted admin is restricted, the owner is not',
    pg_temp.as_('offrest', 'select public.is_restricted_now()::text') || '/' || pg_temp.as_('owner', 'select public.is_restricted_now()::text'), 'true/false');
end $$;

-- O. Start check-in --------------------------------------------------------------
do $$
begin
  perform pg_temp.ok('O1 the owner starts check-in on the live event', pg_temp.off('owner', 'open', 'live'), 'open');
  perform pg_temp.ok('O1 one session row, 32 random bytes',
    (select count(*)::text || '/' || max(octet_length(secret))::text from public.event_checkin_sessions where event_id = pg_temp.id('live')), '1/32');
  perform pg_temp.keep('secret1', md5((select secret from public.event_checkin_sessions where event_id = pg_temp.id('live')))::uuid);
  perform pg_temp.ok('O2 an admin starting it again keeps the same codes', pg_temp.off('admin', 'open', 'live'), 'already_open');
  perform pg_temp.ok('O2 the secret did not change',
    md5((select secret from public.event_checkin_sessions where event_id = pg_temp.id('live')))::uuid::text, pg_temp.id('secret1')::text);
  perform pg_temp.ok('O3 a member is not a manager', pg_temp.off('member', 'open', 'live'), 'not_manager');
  perform pg_temp.ok('O3 nor a stranger', pg_temp.off('s1', 'open', 'live'), 'not_manager');
  perform pg_temp.ok('O4 the future event is outside the window', pg_temp.off('owner', 'open', 'future'), 'outside_window');
  perform pg_temp.ok('O4 so is the event that ended 3 h ago', pg_temp.off('owner', 'open', 'ended3'), 'outside_window');
  perform pg_temp.ok('O5 a hidden club''s event, for its own owner', pg_temp.off('owner', 'open', 'hidlive'), 'org_hidden');
  perform pg_temp.ok('O6 a restricted officer cannot start it', pg_temp.off('offrest', 'open', 'live'), 'restricted');
  perform pg_temp.ok('O7 a missing event', pg_temp.as_('owner', format('select public.event_checkin_open(%L::uuid)', gen_random_uuid())), 'not_found');
  perform pg_temp.ok('O8 signed out: refused (42501)',
    pg_temp.val('anon', null, format('select public.event_checkin_open(%L::uuid)', pg_temp.id('live'))), '42501');
  perform pg_temp.ok('O9 no session was made by any refusal',
    (select count(*)::text from public.event_checkin_sessions where event_id in (pg_temp.id('future'), pg_temp.id('ended3'), pg_temp.id('hidlive'))), '0');
end $$;

-- S. A student checks in (the route's service-role call) ---------------------
do $$
declare
  c0 text := pg_temp.code_at('live', 0);
  c1 text := pg_temp.code_at('live', -1);
  c2 text := pg_temp.code_at('live', -2);
  miss text;
  k int := 1;
begin
  perform pg_temp.ok('S0 the codes are 4 digits, the tokens 22 characters',
    (c0 ~ '^[0-9]{4}$')::text || '/' || (pg_temp.token_at('live', 0) ~ '^[A-Za-z0-9_-]{22}$')::text, 'true/true');
  perform pg_temp.ok('S1 s1 checks in with this step''s code', pg_temp.self('s1', 'live', c0, null), 'checked_in');
  perform pg_temp.ok('S1 again: already', pg_temp.self('s1', 'live', c0, null), 'already');
  perform pg_temp.ok('S2 s2 (who said Can''t go) checks in with the last step''s code', pg_temp.self('s2', 'live', c1, null), 'checked_in');
  -- The secret is random per run: an old code can equal a live one by chance.
  if c2 is distinct from c0 and c2 is distinct from c1 then
    perform pg_temp.ok('S3 a code two steps old is wrong', pg_temp.self('s3', 'live', c2, null), 'wrong_code');
  else
    raise notice 'event-checkins-check: S3 skipped (the old code matches a live one this run)';
  end if;
  loop
    miss := lpad(((c0::int + k) % 10000)::text, 4, '0');
    exit when miss is distinct from c0 and miss is distinct from c1;
    k := k + 1;
  end loop;
  perform pg_temp.ok('S4 a code that matches neither live one is wrong', pg_temp.self('s3', 'live', miss, null), 'wrong_code');
  perform pg_temp.ok('S4 a malformed code is wrong too (same word, nothing told)',
    pg_temp.self('s3', 'live', '12a4', null) || '/' || pg_temp.self('s3', 'live', c0 || '0', null) || '/' || pg_temp.self('s3', 'live', ' ' || c0, null),
    'wrong_code/wrong_code/wrong_code');
  perform pg_temp.ok('S5 s4 checks in with the QR token three steps old', pg_temp.self('s4', 'live', null, pg_temp.token_at('live', -3)), 'checked_in');
  perform pg_temp.ok('S6 a token four steps old has expired', pg_temp.self('s5', 'live', null, pg_temp.token_at('live', -4)), 'link_expired');
  perform pg_temp.ok('S6 so has a malformed one, and a code where a token goes',
    pg_temp.self('s5', 'live', null, left(pg_temp.token_at('live', 0), 21)) || '/' || pg_temp.self('s5', 'live', null, c0),
    'link_expired/link_expired');
  perform pg_temp.ok('S6 a token is never accepted as a code', pg_temp.self('s5', 'live', pg_temp.token_at('live', 0), null), 'wrong_code');
  perform pg_temp.ok('S7 the future event is outside the window', pg_temp.self('s3', 'future', c0, null), 'outside_window');
  perform pg_temp.ok('S8 a hidden club''s live event: not found, even for its owner',
    pg_temp.self('s3', 'hidlive', c0, null) || '/' || pg_temp.self('owner', 'hidlive', c0, null), 'not_found/not_found');
  perform pg_temp.ok('S8 a missing event',
    pg_temp.val('service_role', null, format('select public.event_checkin_self_as(%L::uuid, %L::uuid, %L, null)', pg_temp.id('s3'), gen_random_uuid(), c0)), 'not_found');
  perform pg_temp.ok('S8 an org-less event, for a stranger', pg_temp.self('s3', 'orgless', c0, null), 'not_found');
  perform pg_temp.ok('S8 the org-less event''s creator gets past that (not open yet)', pg_temp.self('owner', 'orgless', c0, null), 'not_open');
  perform pg_temp.ok('S9 a restricted student', pg_temp.self('restricted', 'live', c0, null), 'restricted');
  perform pg_temp.ok('S10 a student who never accepted the Terms', pg_temp.self('noterms', 'live', c0, null), 'terms_required');
  perform pg_temp.ok('S11 both a code and a token, or neither: 22023',
    pg_temp.self('s3', 'live', c0, pg_temp.token_at('live', 0)) || '/' || pg_temp.self('s3', 'live', null, null), '22023/22023');
  perform pg_temp.ok('S12 a signed-in student calling it straight: 42501 (the limiter can''t be gone around)',
    pg_temp.as_('s3', format('select public.event_checkin_self_as(%L::uuid, %L::uuid, %L, null)', pg_temp.id('s3'), pg_temp.id('live'), c0)), '42501');
  perform pg_temp.ok('S12 nor for someone else, nor signed out',
    pg_temp.as_('s3', format('select public.event_checkin_self_as(%L::uuid, %L::uuid, %L, null)', pg_temp.id('s6'), pg_temp.id('live'), c0))
    || '/' || pg_temp.val('anon', null, format('select public.event_checkin_self_as(%L::uuid, %L::uuid, %L, null)', pg_temp.id('s6'), pg_temp.id('live'), c0)),
    '42501/42501');
  perform pg_temp.ok('S13 the record: s1, s2 and s4, and nobody refused', pg_temp.here('live')
    || '/' || (select count(*)::text from public.event_checkins where event_id = pg_temp.id('live') and user_id in (pg_temp.id('s1'), pg_temp.id('s2'), pg_temp.id('s4'))), '3/3');
end $$;

-- One key of the door's feed, as a student.
create function pg_temp.door(who text, ev text, key text) returns text language sql as $$
  select pg_temp.as_(who, format('select coalesce(public.event_checkin_door(%L::uuid)->>%L, ''null'')', pg_temp.id(ev), key)) $$;

-- D. The door's feed --------------------------------------------------------------
do $$
declare s bigint := pg_temp.step();
begin
  perform pg_temp.ok('D1 the owner''s feed: ok and open', pg_temp.door('owner', 'live', 'status') || '/' || pg_temp.door('owner', 'live', 'is_open'), 'ok/true');
  perform pg_temp.ok('D1 this step''s code and token, and the next step''s',
    concat_ws('/', pg_temp.door('owner', 'live', 'code'), pg_temp.door('owner', 'live', 'token'),
                   pg_temp.door('owner', 'live', 'next_code'), pg_temp.door('owner', 'live', 'next_token')),
    concat_ws('/', pg_temp.code_at('live', 0), pg_temp.token_at('live', 0), pg_temp.code_at('live', 1), pg_temp.token_at('live', 1)));
  perform pg_temp.ok('D1 an admin sees the same codes', pg_temp.door('admin', 'live', 'code'), pg_temp.code_at('live', 0));
  perform pg_temp.ok('D1 the exact count, even under 5', pg_temp.door('owner', 'live', 'here_count'), pg_temp.here('live'));
  perform pg_temp.ok('D1 the step''s times: s * 30, 30 s long, then the next',
    pg_temp.as_('owner', format(
      'select ((d->>''step_starts_at'')::timestamptz = to_timestamp(%s * 30))::text || ''/'' ||
              ((d->>''step_ends_at'')::timestamptz - (d->>''step_starts_at'')::timestamptz)::text || ''/'' ||
              ((d->>''next_ends_at'')::timestamptz - (d->>''step_ends_at'')::timestamptz)::text || ''/'' ||
              ((d->>''opens_at'')::timestamptz = e.starts_at - interval ''1 hour'')::text || ''/'' ||
              ((d->>''closes_at'')::timestamptz = e.ends_at + interval ''1 hour'')::text || ''/'' ||
              ((d->>''server_now'')::timestamptz = now())::text
         from public.events e, public.event_checkin_door(e.id) d where e.id = %L', s, pg_temp.id('live'))),
    'true/00:00:30/00:00:30/true/true/true');
  perform pg_temp.ok('D2 a member and a stranger: not a manager, and no codes',
    pg_temp.door('member', 'live', 'status') || '/' || pg_temp.door('member', 'live', 'code') || '/' || pg_temp.door('s1', 'live', 'status'),
    'not_manager/null/not_manager');
  perform pg_temp.ok('D3 the future event: ok, not open, no code, nobody',
    concat_ws('/', pg_temp.door('owner', 'future', 'status'), pg_temp.door('owner', 'future', 'is_open'),
                   pg_temp.door('owner', 'future', 'code'), pg_temp.door('owner', 'future', 'next_token'), pg_temp.door('owner', 'future', 'here_count')),
    'ok/false/null/null/0');
  perform pg_temp.ok('D4 a restricted officer gets no codes', pg_temp.door('offrest', 'live', 'status') || '/' || pg_temp.door('offrest', 'live', 'code'), 'restricted/null');
  perform pg_temp.ok('D5 a hidden club''s event', pg_temp.door('owner', 'hidlive', 'status'), 'org_hidden');
  perform pg_temp.ok('D6 a missing event', pg_temp.as_('owner', format('select public.event_checkin_door(%L::uuid)->>''status''', gen_random_uuid())), 'not_found');
  perform pg_temp.ok('D7 signed out: 42501', pg_temp.val('anon', null, format('select public.event_checkin_door(%L::uuid)::text', pg_temp.id('live'))), '42501');
end $$;

-- An officer function with a person, e.g. pg_temp.mark('owner', 'mark', 'live', 'member').
create function pg_temp.mark(who text, fn text, ev text, target text) returns text language sql as $$
  select pg_temp.as_(who, format('select public.event_checkin_%s(%L::uuid, %L::uuid)', fn, pg_temp.id(ev), pg_temp.id(target))) $$;

-- M. Mark as here ---------------------------------------------------------------
do $$
begin
  perform pg_temp.ok('M1 the owner marks the member who said Going', pg_temp.mark('owner', 'mark', 'live', 'member'), 'marked');
  perform pg_temp.ok('M1 again: already', pg_temp.mark('admin', 'mark', 'live', 'member'), 'already');
  perform pg_temp.ok('M2 someone who said Interested and checked in: already', pg_temp.mark('owner', 'mark', 'live', 's1'), 'already');
  perform pg_temp.ok('M3 a stranger without an RSVP is not on the list', pg_temp.mark('owner', 'mark', 'live', 's3'), 'not_on_list');
  perform pg_temp.ok('M3 nor is someone who said Can''t go', pg_temp.mark('owner', 'mark', 'live', 's2'), 'not_on_list');
  perform pg_temp.ok('M4 the event that ended 3 h ago, check-in never started: marked', pg_temp.mark('owner', 'mark', 'ended3', 'member'), 'marked');
  perform pg_temp.ok('M5 the event that ended 25 h ago is past the day', pg_temp.mark('owner', 'mark', 'ended25', 'member'), 'outside_window');
  perform pg_temp.ok('M6 a member cannot mark anyone', pg_temp.mark('member', 'mark', 'live', 's1'), 'not_manager');
  perform pg_temp.ok('M7 a restricted officer cannot mark', pg_temp.mark('offrest', 'mark', 'ended3', 'member'), 'restricted');
  perform pg_temp.ok('M8 a hidden club''s event', pg_temp.mark('owner', 'mark', 'hidlive', 'member'), 'org_hidden');
  perform pg_temp.ok('M9 signed out: 42501',
    pg_temp.val('anon', null, format('select public.event_checkin_mark(%L::uuid, %L::uuid)', pg_temp.id('live'), pg_temp.id('s3'))), '42501');
  perform pg_temp.ok('M10 the record: four at the live event, one at the ended one, none at 25 h',
    pg_temp.here('live') || '/' || pg_temp.here('ended3') || '/' || pg_temp.here('ended25'), '4/1/0');
end $$;

-- F. The count from 5 up, and is_open (event_checkin_state) ----------------------
do $$
begin
  perform pg_temp.ok('F1 a student who isn''t in, at 4 check-ins: open, not in, no number',
    concat_ws('/', pg_temp.state('s3', 'live', 'is_open'), pg_temp.state('s3', 'live', 'viewer_checked_in'), pg_temp.state('s3', 'live', 'checked_in_count')),
    'true/false/null');
  perform pg_temp.ok('F1 nor for the students who are in, nor the member',
    pg_temp.state('s1', 'live', 'checked_in_count') || '/' || pg_temp.state('member', 'live', 'checked_in_count'), 'null/null');
  perform pg_temp.ok('F2 the owner and an admin get the exact 4',
    pg_temp.state('owner', 'live', 'checked_in_count') || '/' || pg_temp.state('admin', 'live', 'checked_in_count'), '4/4');
  perform pg_temp.ok('F3 viewer_checked_in is true only for the viewer',
    concat_ws('/', pg_temp.state('s1', 'live', 'viewer_checked_in'), pg_temp.state('member', 'live', 'viewer_checked_in'),
                   pg_temp.state('owner', 'live', 'viewer_checked_in'), pg_temp.state('s5', 'live', 'viewer_checked_in')),
    'true/true/false/false');
  perform pg_temp.ok('F4 s5 checks in: 5', pg_temp.self('s5', 'live', pg_temp.code_at('live', 0), null), 'checked_in');
  perform pg_temp.ok('F4 at 5 every signed-in viewer gets the number',
    pg_temp.state('s3', 'live', 'checked_in_count') || '/' || pg_temp.state('s5', 'live', 'checked_in_count') || '/' || pg_temp.state('owner', 'live', 'checked_in_count'),
    '5/5/5');
  perform pg_temp.ok('F5 signed out and the service role: no rows',
    pg_temp.val('anon', null, format('select count(*)::text from public.event_checkin_state(array[%L]::uuid[])', pg_temp.id('live')))
    || '/' || pg_temp.val('service_role', null, format('select count(*)::text from public.event_checkin_state(array[%L]::uuid[])', pg_temp.id('live'))),
    '0/0');
  perform pg_temp.ok('F6 a missing event: no row', pg_temp.as_('s3', format('select count(*)::text from public.event_checkin_state(array[%L]::uuid[])', gen_random_uuid())), '0');
  perform pg_temp.ok('F7 more than 1000 ids: 22023',
    pg_temp.as_('s3', 'select count(*)::text from public.event_checkin_state((select array_agg(gen_random_uuid()) from generate_series(1, 1001)))'), '22023');
  perform pg_temp.ok('F8 one row per visible event, for several at once',
    pg_temp.as_('s3', format('select count(*)::text from public.event_checkin_state(array[%L, %L, %L, %L]::uuid[])',
      pg_temp.id('live'), pg_temp.id('future'), pg_temp.id('ended3'), pg_temp.id('hidlive'))), '3');
  perform pg_temp.ok('F9 the future event: not open, no number', pg_temp.state('s3', 'future', 'is_open') || '/' || pg_temp.state('owner', 'future', 'checked_in_count'), 'false/0');
end $$;

-- F (forgotten sessions). A session left on an event that ended, and one on a
-- hidden club's event (written as postgres: no officer could start either).
do $$
begin
  insert into public.event_checkin_sessions (event_id, secret) values
    (pg_temp.id('ended3'), extensions.gen_random_bytes(32)), (pg_temp.id('hidlive'), extensions.gen_random_bytes(32));
  perform pg_temp.ok('F10 the two forgotten sessions are there',
    (select count(*)::text from public.event_checkin_sessions where event_id in (pg_temp.id('ended3'), pg_temp.id('hidlive'))), '2');
  perform pg_temp.ok('F10 the event that ended 3 h ago: not open, by the window', pg_temp.state('owner', 'ended3', 'is_open'), 'false');
  perform pg_temp.ok('F10 its live-looking code is refused (outside the window)',
    pg_temp.self('s3', 'ended3', pg_temp.code_at('ended3', 0), null), 'outside_window');
  perform pg_temp.ok('F10 its door shows no code', pg_temp.door('owner', 'ended3', 'is_open') || '/' || pg_temp.door('owner', 'ended3', 'code'), 'false/null');
  perform pg_temp.ok('F11 a hidden club''s event: its owner (a member) sees it closed; a stranger sees nothing',
    pg_temp.state('owner', 'hidlive', 'is_open') || '/' || coalesce(pg_temp.state('s3', 'hidlive', 'is_open'), '(no row)'), 'false/(no row)');
  perform pg_temp.ok('F11 and nobody checks in there, even with its code',
    pg_temp.self('owner', 'hidlive', pg_temp.code_at('hidlive', 0), null), 'not_found');
end $$;

-- R. The table's policies, straight from the database ------------------------------
do $$
begin
  perform pg_temp.ok('R1 a student reads only their own row',
    pg_temp.as_('s1', 'select count(*)::text from public.event_checkins') || '/'
    || pg_temp.as_('s3', format('select count(*)::text from public.event_checkins where event_id = %L', pg_temp.id('live'))), '1/0');
  perform pg_temp.ok('R2 the owner and an admin read every row of their events; the member only their own',
    concat_ws('/', pg_temp.as_('owner', format('select count(*)::text from public.event_checkins where event_id = %L', pg_temp.id('live'))),
                   pg_temp.as_('admin', format('select count(*)::text from public.event_checkins where event_id = %L', pg_temp.id('live'))),
                   pg_temp.as_('member', format('select count(*)::text from public.event_checkins where event_id = %L', pg_temp.id('live')))),
    '5/5/1');
  perform pg_temp.ok('R3 nobody reads the sessions: a student, an officer, signed out, the service role (42501)',
    concat_ws('/', pg_temp.as_('s1', 'select count(*)::text from public.event_checkin_sessions'),
                   pg_temp.as_('owner', 'select count(*)::text from public.event_checkin_sessions'),
                   pg_temp.val('anon', null, 'select count(*)::text from public.event_checkin_sessions'),
                   pg_temp.val('service_role', null, 'select count(*)::text from public.event_checkin_sessions')),
    '42501/42501/42501/42501');
  perform pg_temp.ok('R4 no one inserts or updates a check-in straight (42501)',
    concat_ws('/', pg_temp.do_('s3', format('insert into public.event_checkins (event_id, user_id) values (%L, %L)', pg_temp.id('live'), pg_temp.id('s3'))),
                   pg_temp.do_('owner', format('insert into public.event_checkins (event_id, user_id) values (%L, %L)', pg_temp.id('live'), pg_temp.id('s3'))),
                   pg_temp.do_('s1', format('update public.event_checkins set event_id = %L where user_id = %L', pg_temp.id('future'), pg_temp.id('s1'))),
                   pg_temp.run('service_role', null, format('insert into public.event_checkins (event_id, user_id) values (%L, %L)', pg_temp.id('live'), pg_temp.id('s3')))),
    '42501/42501/42501/42501');
  perform pg_temp.ok('R5 signed out reads nothing (42501)',
    pg_temp.val('anon', null, 'select count(*)::text from public.event_checkins'), '42501');
  perform pg_temp.ok('R6 a stranger deleting someone else''s row touches nothing; nor does an officer (they use unmark)',
    pg_temp.do_('s3', format('delete from public.event_checkins where user_id = %L', pg_temp.id('s1')))
    || '/' || pg_temp.do_('owner', format('delete from public.event_checkins where user_id = %L', pg_temp.id('s1'))), 'ok 0/ok 0');
  perform pg_temp.ok('R7 a student deletes their own', pg_temp.do_('s1', format('delete from public.event_checkins where user_id = %L', pg_temp.id('s1'))), 'ok 1');
  perform pg_temp.ok('R7 the live event now holds 4', pg_temp.here('live'), '4');
end $$;

-- Y. My check-ins, for Settings (event_checkin_mine) ------------------------------
do $$
begin
  perform pg_temp.ok('Y1 the member''s own, newest event first, with the club',
    pg_temp.as_('member', 'select string_agg(title || ''@'' || coalesce(org_name, ''-''), '','' order by starts_at desc) from public.event_checkin_mine()'),
    'ECC live@ECC Club,ECC ended3@ECC Club');
  perform pg_temp.ok('Y1 the function''s own order matches',
    pg_temp.as_('member', 'select string_agg(title, '','') from public.event_checkin_mine()'), 'ECC live,ECC ended3');
  perform pg_temp.ok('Y2 a stranger with none, signed out, the service role: nothing',
    concat_ws('/', pg_temp.as_('s3', 'select count(*)::text from public.event_checkin_mine()'),
                   pg_temp.val('anon', null, 'select count(*)::text from public.event_checkin_mine()'),
                   pg_temp.val('service_role', null, 'select count(*)::text from public.event_checkin_mine()')),
    '0/0/0');
  -- An org-less event: its creator runs check-in and checks in there.
  perform pg_temp.ok('Y3 the org-less event''s creator starts check-in', pg_temp.off('owner', 'open', 'orgless'), 'open');
  perform pg_temp.ok('Y3 and checks in with its code', pg_temp.self('owner', 'orgless', pg_temp.code_at('orgless', 0), null), 'checked_in');
  perform pg_temp.ok('Y3 their list shows it with no club',
    pg_temp.as_('owner', 'select string_agg(title || ''@'' || coalesce(org_name, ''-'') || ''@'' || coalesce(org_handle, ''-''), '','') from public.event_checkin_mine()'),
    'ECC orgless@-@-');
  -- A club hidden since: a student still sees their own and removes it.
  update public.orgs set hidden_at = now() where id = pg_temp.id('club');
  perform pg_temp.ok('Y4 the club hidden since: s5 still sees their check-in',
    pg_temp.as_('s5', 'select count(*)::text from public.event_checkin_mine()'), '1');
  perform pg_temp.ok('Y4 and removes it', pg_temp.do_('s5', format('delete from public.event_checkins where user_id = %L', pg_temp.id('s5'))), 'ok 1');
  update public.orgs set hidden_at = null where id = pg_temp.id('club');
  perform pg_temp.ok('Y4 the live event now holds 3', pg_temp.here('live'), '3');
end $$;

-- U. Take one off, clear all --------------------------------------------------------
do $$
begin
  perform pg_temp.ok('U1 a member can take no one off, nor clear',
    pg_temp.mark('member', 'unmark', 'live', 's2') || '/' || pg_temp.as_('member', format('select public.event_checkin_clear(%L::uuid)->>''status''', pg_temp.id('live'))),
    'not_manager/not_manager');
  perform pg_temp.ok('U2 the owner takes s2 off, and again (idempotent)',
    pg_temp.mark('owner', 'unmark', 'live', 's2') || '/' || pg_temp.mark('owner', 'unmark', 'live', 's2') || '/' || pg_temp.here('live'), 'removed/removed/2');
  perform pg_temp.ok('U3 a restricted officer may still take one off (it only takes away)',
    pg_temp.mark('offrest', 'unmark', 'live', 's4') || '/' || pg_temp.here('live'), 'removed/1');
  perform pg_temp.ok('U4 the owner clears the ended event: one cleared, none left',
    pg_temp.as_('owner', format('select public.event_checkin_clear(%L::uuid)::text', pg_temp.id('ended3'))) || '/' || pg_temp.here('ended3'),
    '{"status": "cleared", "cleared": 1}/0');
  perform pg_temp.ok('U4 clearing an empty event clears 0',
    pg_temp.as_('owner', format('select public.event_checkin_clear(%L::uuid)->>''cleared''', pg_temp.id('ended25'))), '0');
  perform pg_temp.ok('U5 a missing event',
    pg_temp.as_('owner', format('select public.event_checkin_unmark(%L::uuid, %L::uuid)', gen_random_uuid(), pg_temp.id('s2')))
    || '/' || pg_temp.as_('owner', format('select public.event_checkin_clear(%L::uuid)->>''status''', gen_random_uuid())), 'not_found/not_found');
  perform pg_temp.ok('U6 signed out: 42501',
    pg_temp.val('anon', null, format('select public.event_checkin_unmark(%L::uuid, %L::uuid)', pg_temp.id('live'), pg_temp.id('member')))
    || '/' || pg_temp.val('anon', null, format('select public.event_checkin_clear(%L::uuid)::text', pg_temp.id('live'))), '42501/42501');
  perform pg_temp.ok('U7 the member is still in at the live event', pg_temp.state('member', 'live', 'viewer_checked_in'), 'true');
end $$;

-- C. Stop check-in --------------------------------------------------------------------
do $$
declare old_code text := pg_temp.code_at('live', 0);
begin
  perform pg_temp.ok('C1 a member cannot stop it; a missing event; signed out',
    pg_temp.off('member', 'close', 'live') || '/' || pg_temp.as_('owner', format('select public.event_checkin_close(%L::uuid)', gen_random_uuid()))
    || '/' || pg_temp.val('anon', null, format('select public.event_checkin_close(%L::uuid)', pg_temp.id('live'))), 'not_manager/not_found/42501');
  perform pg_temp.ok('C2 a restricted officer may stop it (it only takes away)', pg_temp.off('offrest', 'close', 'live'), 'closed');
  perform pg_temp.ok('C2 the session is gone; the check-ins stay',
    (select count(*)::text from public.event_checkin_sessions where event_id = pg_temp.id('live')) || '/' || pg_temp.here('live'), '0/1');
  perform pg_temp.ok('C3 the code on screen a moment ago no longer works', pg_temp.self('s3', 'live', old_code, null), 'not_open');
  perform pg_temp.ok('C3 nor any token', pg_temp.self('s3', 'live', null, 'UVxxReBJ3ewsgZRtrv3ISQ'), 'not_open');
  perform pg_temp.ok('C4 the door and the state say closed',
    pg_temp.door('owner', 'live', 'is_open') || '/' || pg_temp.door('owner', 'live', 'code') || '/' || pg_temp.state('s3', 'live', 'is_open'), 'false/null/false');
  perform pg_temp.ok('C5 stopping again is fine', pg_temp.off('owner', 'close', 'live'), 'closed');
  perform pg_temp.ok('C6 starting again makes a new secret', pg_temp.off('owner', 'open', 'live'), 'open');
  perform pg_temp.ok('C6 not the old one',
    (md5((select secret from public.event_checkin_sessions where event_id = pg_temp.id('live')))::uuid = pg_temp.id('secret1'))::text, 'false');
  perform pg_temp.ok('C7 a later start (any event''s) tidied the forgotten session of the event that ended 3 h ago; the hidden club''s (not ended) stays',
    (select count(*)::text from public.event_checkin_sessions where event_id = pg_temp.id('ended3'))
    || '/' || (select count(*)::text from public.event_checkin_sessions where event_id = pg_temp.id('hidlive')), '0/1');
  perform pg_temp.ok('C8 s3 and s6 check in with the new code and the new link',
    pg_temp.self('s3', 'live', pg_temp.code_at('live', 0), null) || '/' || pg_temp.self('s6', 'live', null, pg_temp.token_at('live', 0)), 'checked_in/checked_in');
end $$;

-- X. The cascades: an account, an event, a club --------------------------------------
do $$
begin
  perform pg_temp.ok('X0 the member is marked at the ended event again', pg_temp.mark('owner', 'mark', 'ended3', 'member'), 'marked');
  delete from auth.users where id = pg_temp.id('s6');
  perform pg_temp.ok('X1 an account deleted: its check-ins go, nobody else''s',
    (select count(*)::text from public.event_checkins where user_id = pg_temp.id('s6')) || '/' || pg_temp.here('live'), '0/2');
  delete from public.events where id = pg_temp.id('live');
  perform pg_temp.ok('X2 an event deleted: its check-ins and its session go',
    (select count(*)::text from public.event_checkins where event_id = pg_temp.id('live'))
    || '/' || (select count(*)::text from public.event_checkin_sessions where event_id = pg_temp.id('live')), '0/0');
  delete from public.orgs where id = pg_temp.id('club');
  perform pg_temp.ok('X3 a club deleted: its events go, and their check-ins with them',
    (select count(*)::text from public.events where org_id = pg_temp.id('club') or id = pg_temp.id('ended3'))
    || '/' || (select count(*)::text from public.event_checkins where event_id = pg_temp.id('ended3')), '0/0');
  perform pg_temp.ok('X4 the org-less event''s check-in is untouched', pg_temp.here('orgless'), '1');
end $$;

do $$ begin
  raise notice 'event-checkins-check: all % cases passed', current_setting('ecc.passed', true);
end $$;

rollback;
