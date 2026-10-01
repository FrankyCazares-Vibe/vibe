-- chat-latest-check.sql: the behaviour check of migration C
-- (supabase/migrations/20261001120000_chat_latest_per_room.sql), contract
-- handoffs/chat-redesign/wave-2-build/S71-amendment-2.md section 2: the
-- function chat_latest_per_channel (the newest k messages PER ROOM, read as
-- the caller).
--
-- LOCAL ONLY. Run it AFTER migration C has been applied to the local stack:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/chat-latest-check.sql
-- or, before C is applied, in ONE transaction with it (C without its final
-- "commit;", then this file without its "begin;"; this file's ROLLBACK ends
-- both). Never on production: it writes (and rolls back) rooms, room members
-- and messages, and for a moment it creates functions in pg_temp. It refuses
-- any connection that is not the local unix socket (docker exec), and its
-- first line is a psql command, so the Management API and the MCP refuse the
-- file before anything runs.
-- Expected last line: chat-latest-check: all N cases passed. Nothing is kept:
-- ROLLBACK follows.
--
-- WHAT IT DOES. Everything happens inside ONE transaction that ends in
-- ROLLBACK. Two kinds of fixtures:
--   * the PEOPLE and the CLUB ROOMS are the seed's, read from the database:
--     the caller is a plain member (role 'member') of a club that has a
--     Lounge and an Officers room and holds a row on that Lounge; the officer
--     is an owner or admin of the same club; a club the caller is not in; a
--     dm or group the caller is not in; one the caller is in. Probe rows are
--     written into those rooms as postgres, an hour newer than anything there.
--   * three THROWAWAY dm rooms (members: the caller and the officer): busy
--     (30 live top-level rows), quiet (1 row, a day older) and mixed (thread
--     replies and removed rows of both people).
-- Cases: A the per-room windows (the bug of today's shared window, pinned
-- first); K the clamp of p_per; F the two filters, RLS before the LIMIT, an
-- author's own removed row; L the 500-id cap and odd arrays; R the caller's
-- RLS on the seed rooms (a dm they are not in, a club they are not in, the
-- Officers room for a plain member), each beside a contrast that proves the
-- probe row is there; G grants and catalog facts (the real anon call, 42501,
-- runs only where it cannot crash the server: see THE SUPAUTILS CRASH in G).
-- E records the plan of the function's body (an index scan per room on the
-- (channel_id, created_at) index), NOT a hard assertion: on the tiny local
-- table the planner may pick another plan, and the NOTICE says which.
-- It raises on the first expectation that fails ("chat-latest-check FAILED:
-- ...") and prints one NOTICE per case that passes ("chat-latest-check ok: ...").
--
-- HOW IT ACTS AS SOMEONE. The routes call the function with the COOKIE
-- client: role authenticated with the student's id in request.jwt.claims, the
-- way PostgREST runs a signed-in request, so every policy of messages
-- applies. That is how every A, K, F, L and R case runs, unless it names
-- service_role (the other granted role, which bypasses RLS) or anon.
--
-- Answers: a list "label=count" (rooms, in label order) or the probe rows'
-- names in the function's own output order (WITH ORDINALITY); '' = no row;
-- 'E' + SQLSTATE = refused (E42501 for anon = "permission denied for table
-- messages": anon holds EXECUTE on the function and nothing on the table).

-- A psql command: anything that is not psql refuses the file here. With it a
-- run without -v ON_ERROR_STOP=1 still stops at the first failure.
\set ON_ERROR_STOP on

begin;

-- Only on the local stack, and only on a database that has migration C.
do $$
begin
  if inet_server_addr() is not null then
    raise exception 'chat-latest-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if to_regprocedure('public.chat_latest_per_channel(uuid[],integer,boolean,boolean)') is null then
    raise exception 'chat-latest-check: chat_latest_per_channel is missing. Apply 20261001120000_chat_latest_per_room.sql to the local stack first (or run both in one transaction)';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.lt_ok(p_case text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'chat-latest-check FAILED: % (got "%", expected "%")',
      p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('chat_latest_check.passed',
    (coalesce(nullif(current_setting('chat_latest_check.passed', true), ''), '0')::int + 1)::text,
    true);
  raise notice 'chat-latest-check ok: %', p_case;
end $$;

-- Runs one statement that answers ONE value as a role (and, with p_who, as
-- that person): the value, or 'E' + the SQLSTATE that refused it.
create function pg_temp.lt_call(p_role text, p_who uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  me  text := current_user;
  got text;
begin
  perform set_config('request.jwt.claims',
    case when p_who is null then ''
         else json_build_object('sub', p_who, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into got;
  exception when others then
    got := 'E' || sqlstate;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return got;
end $$;

-- Ids travel between the blocks as transaction-local settings; a room's id
-- also maps back to its label (chat_latest_check.l_<id with _ for ->).
create function pg_temp.lt_keep(p_key text, p_id uuid)
returns void
language plpgsql
as $$
begin
  if p_id is null then
    raise exception 'chat-latest-check: fixture % was not found in the local database (the seed is needed: node scripts/local-seed.mjs)', p_key;
  end if;
  perform set_config('chat_latest_check.' || p_key, p_id::text, true);
  perform set_config('chat_latest_check.l_' || replace(p_id::text, '-', '_'), p_key, true);
end $$;

create function pg_temp.lt_id(p_key text)
returns uuid language sql
as $$ select nullif(current_setting('chat_latest_check.' || p_key, true), '')::uuid $$;

-- A uuid[] literal of the rooms named, in that order.
create function pg_temp.lt_ids(variadic p_keys text[])
returns text language sql
as $$ select quote_literal(array_agg(pg_temp.lt_id(k) order by o)::text) || '::uuid[]'
        from unnest(p_keys) with ordinality as t(k, o) $$;

-- The rooms the function answered for (as that role and person), with how
-- many rows each: 'busy=5,quiet=1'; '' = no row.
create function pg_temp.lt_rooms(p_role text, p_who uuid, p_args text)
returns text
language plpgsql
as $$
declare
  raw text;
  res text;
begin
  raw := pg_temp.lt_call(p_role, p_who,
    'select coalesce(string_agg(m.channel_id::text, '','' order by m.ordinality), '''')
       from public.chat_latest_per_channel(' || p_args || ') with ordinality as m');
  if raw like 'E%' then
    return raw;
  end if;
  select coalesce(string_agg(s.l || '=' || s.n, ',' order by s.l), '') into res
    from (select coalesce(nullif(current_setting('chat_latest_check.l_' || replace(u, '-', '_'), true), ''), '?') as l,
                 count(*) as n
            from unnest(string_to_array(nullif(raw, ''), ',')) u
           group by 1) s;
  return res;
end $$;

-- The rooms only, without the counts: 'lounge,own_dm'.
create function pg_temp.lt_roomset(p_role text, p_who uuid, p_args text)
returns text language sql
as $$ select regexp_replace(pg_temp.lt_rooms(p_role, p_who, p_args), '=[0-9]+', '', 'g') $$;

-- The PROBE rows the function answered, by name, in its own output order
-- (seed rows of the real rooms are left out): 'b01,b02,q1'.
create function pg_temp.lt_rows(p_role text, p_who uuid, p_args text)
returns text language sql
as $$ select pg_temp.lt_call(p_role, p_who,
  'select coalesce(string_agg(replace(m.content, ''chat-latest-check: '', ''''), '','' order by m.ordinality)
                     filter (where m.content like ''chat-latest-check: %''), '''')
     from public.chat_latest_per_channel(' || p_args || ') with ordinality as m') $$;

-- 0. Fixtures ------------------------------------------------------------------
-- The seed's people and club rooms (read, not made), then the throwaway rooms.
do $$
declare
  v_me      uuid;
  v_org     uuid;
  v_officer uuid;
  v_outside uuid;   -- the Lounge of a club the caller is not in
  v_out_by  uuid;   -- a member of that club (authors its probe row)
  v_foreign uuid;   -- a dm or group the caller is not in
  v_for_by  uuid;   -- someone else (authors its probe row)
  v_own     uuid;   -- a dm or group the caller is in
  v_busy    uuid := gen_random_uuid();
  v_quiet   uuid := gen_random_uuid();
  v_mixed   uuid := gen_random_uuid();
  v_root    uuid := gen_random_uuid();
  t0        timestamptz := now();
  t1        timestamptz := now() + interval '1 hour';   -- newer than any seed row
begin
  -- The caller: a plain member of a club with a Lounge and an Officers room,
  -- holding a row on that Lounge; the one in the fewest clubs first.
  select m.user_id, m.org_id into v_me, v_org
    from public.org_members m
   where m.role = 'member'
     and exists (select 1 from public.channels c where c.org_id = m.org_id and c.kind = 'officers')
     and exists (select 1 from public.channel_members cm join public.channels c on c.id = cm.channel_id
                  where c.org_id = m.org_id and c.kind = 'lounge' and cm.user_id = m.user_id)
     and exists (select 1 from public.org_members o
                  where o.org_id = m.org_id and o.role in ('owner', 'admin'))
   order by (select count(*) from public.org_members x where x.user_id = m.user_id), m.joined_at, m.user_id
   limit 1;
  perform pg_temp.lt_keep('me', v_me);
  perform pg_temp.lt_keep('club', v_org);
  select o.user_id into v_officer from public.org_members o
   where o.org_id = v_org and o.role in ('owner', 'admin')
   order by (o.role = 'owner') desc, o.joined_at, o.user_id limit 1;
  perform pg_temp.lt_keep('officer', v_officer);
  perform pg_temp.lt_keep('lounge',   (select id from public.channels where org_id = v_org and kind = 'lounge'));
  perform pg_temp.lt_keep('officers', (select id from public.channels where org_id = v_org and kind = 'officers'));

  select c.id, (select o.user_id from public.org_members o where o.org_id = c.org_id
                 order by (o.role = 'owner') desc, o.user_id limit 1)
    into v_outside, v_out_by
    from public.channels c
   where c.kind = 'lounge'
     and not exists (select 1 from public.org_members o where o.org_id = c.org_id and o.user_id = v_me)
     and exists (select 1 from public.org_members o where o.org_id = c.org_id)
   order by c.created_at, c.id limit 1;
  perform pg_temp.lt_keep('outside', v_outside);
  perform pg_temp.lt_keep('outside_by', v_out_by);

  select c.id, coalesce((select cm.user_id from public.channel_members cm
                          where cm.channel_id = c.id order by cm.user_id limit 1), v_officer)
    into v_foreign, v_for_by
    from public.channels c
   where c.org_id is null and c.type in ('dm', 'group')
     and not exists (select 1 from public.channel_members cm where cm.channel_id = c.id and cm.user_id = v_me)
   order by (select count(*) from public.channel_members cm where cm.channel_id = c.id) desc, c.created_at, c.id
   limit 1;
  perform pg_temp.lt_keep('foreign_dm', v_foreign);
  perform pg_temp.lt_keep('foreign_by', v_for_by);

  select c.id into v_own
    from public.channels c join public.channel_members cm on cm.channel_id = c.id
   where c.org_id is null and c.type in ('dm', 'group') and cm.user_id = v_me
   order by c.created_at, c.id limit 1;
  perform pg_temp.lt_keep('own_dm', v_own);

  raise notice 'chat-latest-check: caller % (member of club %), officer %, outside club room %, foreign dm %, own dm %',
    (select handle from public.users where id = v_me), (select handle from public.orgs where id = v_org),
    (select handle from public.users where id = v_officer), v_outside, v_foreign, v_own;

  -- Probe rows in the seed rooms, written as postgres, newer than any row
  -- there. Lounge: the officer's live row, the caller's own removed row, the
  -- officer's removed row.
  insert into public.messages (channel_id, user_id, content, created_at, removed_at, removed_by, removed_reason)
  values (pg_temp.lt_id('lounge'),   v_officer, 'chat-latest-check: L-live',          t1 + interval '3 minutes', null, null, null),
         (pg_temp.lt_id('lounge'),   v_me,      'chat-latest-check: L-mine-removed',  t1 + interval '2 minutes', t1, v_officer, 'chat-latest-check'),
         (pg_temp.lt_id('lounge'),   v_officer, 'chat-latest-check: L-other-removed', t1 + interval '1 minute',  t1, v_officer, 'chat-latest-check'),
         (pg_temp.lt_id('officers'), v_officer, 'chat-latest-check: O1',              t1, null, null, null),
         (v_outside,                 v_out_by,  'chat-latest-check: X1',              t1, null, null, null),
         (v_foreign,                 v_for_by,  'chat-latest-check: D-foreign',       t1, null, null, null),
         (v_own,                     v_me,      'chat-latest-check: D-own',           t1, null, null, null);

  -- The throwaway rooms: dms with the caller and the officer as members.
  insert into public.channels (id, type, name) values (v_busy, 'dm', ''), (v_quiet, 'dm', ''), (v_mixed, 'dm', '');
  insert into public.channel_members (channel_id, user_id, role, accepted_at, last_read_at)
  select r, u, 'member', t0, t0
    from unnest(array[v_busy, v_quiet, v_mixed]) r cross join unnest(array[v_me, v_officer]) u;
  perform pg_temp.lt_keep('busy', v_busy);
  perform pg_temp.lt_keep('quiet', v_quiet);
  perform pg_temp.lt_keep('mixed', v_mixed);
  -- busy: b01 (newest) .. b30, a minute apart, both people, all live top-level.
  insert into public.messages (channel_id, user_id, content, created_at)
  select v_busy, case when i % 2 = 0 then v_me else v_officer end,
         'chat-latest-check: b' || lpad(i::text, 2, '0'), t0 - make_interval(mins => i)
    from generate_series(1, 30) i;
  -- quiet: q1, a day older than every busy row.
  insert into public.messages (channel_id, user_id, content, created_at)
  values (v_quiet, v_officer, 'chat-latest-check: q1', t0 - interval '1 day');
  -- mixed, newest first: m1 the officer's thread reply under m4; m2 the
  -- caller's removed row; m3 the officer's removed row; m4 the officer's
  -- live row (the thread root); m5 the caller's; m6 the officer's.
  insert into public.messages (id, channel_id, user_id, content, created_at)
  values (v_root, v_mixed, v_officer, 'chat-latest-check: m4', t0 - interval '4 minutes');
  insert into public.messages (channel_id, user_id, content, created_at, thread_root_id, removed_at, removed_by, removed_reason)
  values (v_mixed, v_officer, 'chat-latest-check: m1', t0 - interval '1 minute', v_root, null, null, null),
         (v_mixed, v_me,      'chat-latest-check: m2', t0 - interval '2 minutes', null, t0, v_officer, 'chat-latest-check'),
         (v_mixed, v_officer, 'chat-latest-check: m3', t0 - interval '3 minutes', null, t0, v_officer, 'chat-latest-check'),
         (v_mixed, v_me,      'chat-latest-check: m5', t0 - interval '5 minutes', null, null, null, null),
         (v_mixed, v_officer, 'chat-latest-check: m6', t0 - interval '6 minutes', null, null, null, null);
end $$;

-- A. Per-room windows (as the caller) ----------------------------------------------
do $$
declare
  me uuid := pg_temp.lt_id('me');
begin
  perform pg_temp.lt_ok('A1 fixture: the caller reads all 30 busy rows and the quiet row directly',
    pg_temp.lt_call('authenticated', me, format(
      'select count(*)::text from public.messages where channel_id in (%L, %L)',
      pg_temp.lt_id('busy'), pg_temp.lt_id('quiet'))), '31');
  perform pg_temp.lt_ok('A2 the bug: today''s shared window (2 rooms x 5 = limit 10) holds no quiet row',
    pg_temp.lt_call('authenticated', me, format(
      'select count(*) filter (where x.channel_id = %L)::text
         from (select m.channel_id from public.messages m
                where m.channel_id = any (%s) and m.thread_root_id is null and m.removed_at is null
                order by m.created_at desc limit 10) x',
      pg_temp.lt_id('quiet'), pg_temp.lt_ids('busy', 'quiet'))), '0');
  perform pg_temp.lt_ok('A3 the function: 5 rows of the busy room AND the quiet room''s row',
    pg_temp.lt_rooms('authenticated', me, pg_temp.lt_ids('busy', 'quiet') || ', 5, true, true'),
    'busy=5,quiet=1');
  perform pg_temp.lt_ok('A4 the busy rows are its newest five, newest first overall, the quiet row last',
    pg_temp.lt_rows('authenticated', me, pg_temp.lt_ids('busy', 'quiet') || ', 5, true, true'),
    'b01,b02,b03,b04,b05,q1');
  perform pg_temp.lt_ok('A5 the order of the ids does not matter: quiet first in, still last out',
    pg_temp.lt_rows('authenticated', me, pg_temp.lt_ids('quiet', 'busy') || ', 2'),
    'b01,b02,q1');
end $$;

-- K. The clamp of p_per (1..20; null = 1) ----------------------------------------
do $$
declare
  me uuid := pg_temp.lt_id('me');
  ids text := pg_temp.lt_ids('busy', 'quiet');
begin
  perform pg_temp.lt_ok('K1 p_per 0 reads 1 per room',    pg_temp.lt_rooms('authenticated', me, ids || ', 0'),    'busy=1,quiet=1');
  perform pg_temp.lt_ok('K2 p_per -3 reads 1 per room',   pg_temp.lt_rooms('authenticated', me, ids || ', -3'),   'busy=1,quiet=1');
  perform pg_temp.lt_ok('K3 p_per null reads 1 per room', pg_temp.lt_rooms('authenticated', me, ids || ', null'), 'busy=1,quiet=1');
  perform pg_temp.lt_ok('K4 p_per 20 reads 20',           pg_temp.lt_rooms('authenticated', me, ids || ', 20'),   'busy=20,quiet=1');
  perform pg_temp.lt_ok('K5 p_per 21 reads 20',           pg_temp.lt_rooms('authenticated', me, ids || ', 21'),   'busy=20,quiet=1');
  perform pg_temp.lt_ok('K6 p_per 50 reads 20',           pg_temp.lt_rooms('authenticated', me, ids || ', 50'),   'busy=20,quiet=1');
end $$;

-- F. The filters, RLS before the LIMIT, an author's own removed row ----------------
-- mixed, newest first: m1 officer's reply (under m4), m2 caller's removed,
-- m3 officer's removed, m4 officer's root, m5 caller's, m6 officer's.
do $$
declare
  me  uuid := pg_temp.lt_id('me');
  off uuid := pg_temp.lt_id('officer');
  ids text := pg_temp.lt_ids('mixed');
begin
  perform pg_temp.lt_ok('F1 the defaults (top-level only, removed too): the caller''s own removed m2, never the officer''s m3, still 3 rows',
    pg_temp.lt_rows('authenticated', me, ids || ', 3'), 'm2,m4,m5');
  perform pg_temp.lt_ok('F2 the defaults said out loud answer the same',
    pg_temp.lt_rows('authenticated', me, ids || ', 3, true, false'), 'm2,m4,m5');
  perform pg_temp.lt_ok('F3 top-level and live only (the inbox previews): no removed row, not even the caller''s',
    pg_temp.lt_rows('authenticated', me, ids || ', 3, true, true'), 'm4,m5,m6');
  perform pg_temp.lt_ok('F4 every row (the thread list''s wide read): the reply m1 comes back',
    pg_temp.lt_rows('authenticated', me, ids || ', 3, false, false'), 'm1,m2,m4');
  perform pg_temp.lt_ok('F5 replies but live only',
    pg_temp.lt_rows('authenticated', me, ids || ', 3, false, true'), 'm1,m4,m5');
  perform pg_temp.lt_ok('F6 the officer sees their own removed m3, not the caller''s m2',
    pg_temp.lt_rows('authenticated', off, ids || ', 3'), 'm3,m4,m5');
  perform pg_temp.lt_ok('F7 service_role (granted, bypasses RLS) sees both removed rows',
    pg_temp.lt_rows('service_role', null, ids || ', 3'), 'm2,m3,m4');
end $$;

-- L. The 500-id cap and odd arrays -----------------------------------------------
do $$
declare
  me     uuid := pg_temp.lt_id('me');
  q      uuid := pg_temp.lt_id('quiet');
  pad499 text := (select string_agg(gen_random_uuid()::text, ',') from generate_series(1, 499));
  pad500 text := (select string_agg(gen_random_uuid()::text, ',') from generate_series(1, 500));
begin
  perform pg_temp.lt_ok('L1 the quiet room as id 501: not read',
    pg_temp.lt_rooms('authenticated', me, quote_literal('{' || pad500 || ',' || q || '}') || '::uuid[], 5'), '');
  perform pg_temp.lt_ok('L2 the quiet room as id 500: read',
    pg_temp.lt_rooms('authenticated', me, quote_literal('{' || pad499 || ',' || q || '}') || '::uuid[], 5'), 'quiet=1');
  perform pg_temp.lt_ok('L3 a null array reads nothing',
    pg_temp.lt_rooms('authenticated', me, 'null::uuid[], 5'), '');
  perform pg_temp.lt_ok('L4 an empty array reads nothing',
    pg_temp.lt_rooms('authenticated', me, '''{}''::uuid[], 5'), '');
  perform pg_temp.lt_ok('L5 a null id reads nothing, the next id is read',
    pg_temp.lt_rooms('authenticated', me, format('array[null, %L]::uuid[], 5', q)), 'quiet=1');
  perform pg_temp.lt_ok('L6 an id given twice is read twice (the callers pass distinct ids)',
    pg_temp.lt_rooms('authenticated', me, pg_temp.lt_ids('quiet', 'quiet') || ', 5'), 'quiet=2');
  -- A 2-D array (PostgREST's JSON body can send one): the cap counts POSITIONS,
  -- so the quiet room at flat position 501 of a [1:2][1:251] array is not read
  -- (a slice [1:500] bounds only the first dimension and let it through).
  perform pg_temp.lt_ok('L7 a 2-D array: the quiet room at flat position 501 is not read',
    pg_temp.lt_rooms('authenticated', me,
      format('(select array_agg(row_ids) from (select array_agg(case when g = 501 then %L::uuid else gen_random_uuid() end order by g) as row_ids from generate_series(1, 502) g group by (g - 1) / 251) t), 5', q)), '');
  perform pg_temp.lt_ok('L8 a 2-D array: the quiet room at flat position 500 is read',
    pg_temp.lt_rooms('authenticated', me,
      format('(select array_agg(row_ids) from (select array_agg(case when g = 500 then %L::uuid else gen_random_uuid() end order by g) as row_ids from generate_series(1, 502) g group by (g - 1) / 251) t), 5', q)), 'quiet=1');
end $$;

-- R. RLS as the caller, on the seed's rooms -----------------------------------------
-- Each "nothing" sits beside a contrast that proves the probe row is there.
do $$
declare
  me   uuid := pg_temp.lt_id('me');
  off  uuid := pg_temp.lt_id('officer');
  five text := pg_temp.lt_ids('lounge', 'officers', 'outside', 'foreign_dm', 'own_dm');
begin
  perform pg_temp.lt_ok('R1 fixture: the caller is a plain member of the club',
    (select m.role from public.org_members m where m.org_id = pg_temp.lt_id('club') and m.user_id = me), 'member');
  perform pg_temp.lt_ok('R2 one call over five rooms: only the two the caller may read answer',
    pg_temp.lt_roomset('authenticated', me, five || ', 20, false, false'), 'lounge,own_dm');
  perform pg_temp.lt_ok('R3 contrast: service_role gets all five',
    pg_temp.lt_roomset('service_role', null, five || ', 20, false, false'), 'foreign_dm,lounge,officers,outside,own_dm');
  perform pg_temp.lt_ok('R4 a dm the caller is not in: nothing from it',
    pg_temp.lt_rooms('authenticated', me, pg_temp.lt_ids('foreign_dm') || ', 20, false, false'), '');
  perform pg_temp.lt_ok('R5 contrast: its probe row is there (service_role)',
    pg_temp.lt_rows('service_role', null, pg_temp.lt_ids('foreign_dm') || ', 1'), 'D-foreign');
  perform pg_temp.lt_ok('R6 the Lounge of a club the caller is not in: nothing from it',
    pg_temp.lt_rooms('authenticated', me, pg_temp.lt_ids('outside') || ', 20, false, false'), '');
  perform pg_temp.lt_ok('R7 contrast: a member of that club reads its probe row',
    pg_temp.lt_rows('authenticated', pg_temp.lt_id('outside_by'), pg_temp.lt_ids('outside') || ', 1'), 'X1');
  perform pg_temp.lt_ok('R8 the Officers room, for a plain member: nothing from it',
    pg_temp.lt_rooms('authenticated', me, pg_temp.lt_ids('officers') || ', 20, false, false'), '');
  perform pg_temp.lt_ok('R9 contrast: the officer reads its probe row',
    pg_temp.lt_rows('authenticated', off, pg_temp.lt_ids('officers') || ', 1'), 'O1');
  perform pg_temp.lt_ok('R10 the caller''s Lounge, p_live_only false: the live row and their OWN removed row, never the officer''s',
    pg_temp.lt_rows('authenticated', me, pg_temp.lt_ids('lounge') || ', 20, true, false'), 'L-live,L-mine-removed');
  perform pg_temp.lt_ok('R11 the same, p_live_only true: the live row only',
    pg_temp.lt_rows('authenticated', me, pg_temp.lt_ids('lounge') || ', 20, true, true'), 'L-live');
  perform pg_temp.lt_ok('R12 the officer on the Lounge: their own removed row, not the caller''s',
    pg_temp.lt_rows('authenticated', off, pg_temp.lt_ids('lounge') || ', 20, true, false'), 'L-live,L-other-removed');
  perform pg_temp.lt_ok('R13 a dm the caller is in: its newest row',
    pg_temp.lt_rows('authenticated', me, pg_temp.lt_ids('own_dm') || ', 1'), 'D-own');
  perform pg_temp.lt_ok('R14 authenticated with no person in the claims: nothing at all',
    pg_temp.lt_rooms('authenticated', null,
      pg_temp.lt_ids('lounge', 'officers', 'outside', 'foreign_dm', 'own_dm', 'busy', 'quiet', 'mixed') || ', 20, false, false'), '');
end $$;

-- G. Grants and the catalog ------------------------------------------------------
-- THE STANDING RULE (S63; met again in S71b). On this image
-- (supabase/postgres 17.6.1.111, local and production) a "permission denied
-- for FUNCTION" error for anon, authenticated or service_role SEGFAULTS the
-- backend (supautils' hint code), so a public function is never refused to
-- those roles. Migration C therefore grants anon EXECUTE, and an anonymous
-- call is refused at the table: "permission denied for table messages"
-- (42501), which is safe. G1 / G2 make that call ONLY when anon really holds
-- EXECUTE (otherwise the call itself would crash the server); G3 asserts the
-- grants.
do $$
declare
  f    oid := to_regprocedure('public.chat_latest_per_channel(uuid[],integer,boolean,boolean)');
  safe boolean := has_function_privilege('anon', to_regprocedure('public.chat_latest_per_channel(uuid[],integer,boolean,boolean)'), 'EXECUTE');
begin
  if safe then
    perform pg_temp.lt_ok('G1 an anonymous call is refused at the messages table (42501), and the server stays up',
      pg_temp.lt_call('anon', null, 'select count(*)::text from public.chat_latest_per_channel(''{}''::uuid[], 1)'), 'E42501');
    perform pg_temp.lt_ok('G2 the same with a person''s id in the claims',
      pg_temp.lt_call('anon', pg_temp.lt_id('me'),
        'select count(*)::text from public.chat_latest_per_channel(' || pg_temp.lt_ids('lounge') || ', 1)'), 'E42501');
  else
    raise exception 'chat-latest-check: anon does not hold EXECUTE on chat_latest_per_channel. G1/G2 not run (the call would crash this server); the grants are wrong (the standing rule)';
  end if;
  perform pg_temp.lt_ok('G3 EXECUTE: not PUBLIC; anon, authenticated and service_role (never refuse a function to them on this image)',
    (select concat_ws(' ',
       'public=' || exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'),
       'anon=' || has_function_privilege('anon', f, 'EXECUTE'),
       'authenticated=' || has_function_privilege('authenticated', f, 'EXECUTE'),
       'service_role=' || has_function_privilege('service_role', f, 'EXECUTE'))
       from pg_proc p where p.oid = f),
    'public=false anon=true authenticated=true service_role=true');
  perform pg_temp.lt_ok('G4 security invoker, stable, sql, setof messages, search_path ""',
    (select concat_ws(' ',
       case when p.prosecdef then 'definer' else 'invoker' end,
       case p.provolatile when 's' then 'stable' when 'v' then 'volatile' else 'immutable' end,
       l.lanname,
       case when p.proretset and p.prorettype = 'public.messages'::regtype then 'setof-messages' else 'other' end,
       array_to_string(p.proconfig, ';'))
       from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = f),
    'invoker stable sql setof-messages search_path=""');
end $$;

-- E. The plan, RECORDED (not asserted) ---------------------------------------------
-- A non-inlined sql function is planned once per call without its argument
-- values (a generic plan), so the body is PREPAREd from pg_proc.prosrc with
-- $1..$4 and EXPLAINed with plan_cache_mode = force_generic_plan, as the
-- caller (RLS applies). Wanted: an Index Scan per room on the (channel_id,
-- created_at) index. A Seq Scan on the tiny local table is reported, not failed.
do $$
declare
  me   text := current_user;
  ids  text := pg_temp.lt_ids('busy', 'quiet');
  who  uuid := pg_temp.lt_id('me');
  body text;
  r    record;
  hit  text;
  plan text := '';
begin
  select replace(replace(replace(replace(p.prosrc,
           'p_channels', '$1'), 'p_per', '$2'), 'p_top_level_only', '$3'), 'p_live_only', '$4')
    into body
    from pg_proc p where p.oid = to_regprocedure('public.chat_latest_per_channel(uuid[],integer,boolean,boolean)');
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
  set local role authenticated;
  set local plan_cache_mode = force_generic_plan;
  execute 'prepare chat_latest_check_body(uuid[], integer, boolean, boolean) as ' || body;
  for r in execute 'explain (costs off) execute chat_latest_check_body(' || ids || ', 5, true, true)' loop
    plan := plan || r."QUERY PLAN" || E'\n';
    if hit is null and r."QUERY PLAN" ~ '(Index|Index Only|Bitmap Index|Seq) Scan.* on messages' then
      hit := btrim(r."QUERY PLAN");
    end if;
  end loop;
  deallocate chat_latest_check_body;
  execute format('set local role %I', me);
  set local plan_cache_mode = auto;
  perform set_config('request.jwt.claims', '', true);
  raise notice E'chat-latest-check plan (generic, as the caller):\n%', plan;
  if hit ~ 'idx_messages_channel_created' then
    raise notice 'chat-latest-check plan line: % (an index scan per room on the (channel_id, created_at) index)', hit;
  else
    raise notice 'chat-latest-check plan line: % (NOT the (channel_id, created_at) index: the planner chose another scan on this table; recorded, not failed)', coalesce(hit, '(no scan line on messages)');
  end if;
end $$;

-- The end. -----------------------------------------------------------------------
do $$
begin
  raise notice 'chat-latest-check: all % cases passed',
    coalesce(nullif(current_setting('chat_latest_check.passed', true), ''), '0');
end $$;

rollback;
