-- chat-room-post-policy-check.sql: the check of
-- supabase/migrations/20261004110000_chat_room_post_policy.sql (contract
-- handoffs/chat-redesign/wave-3-desktop/contract.md 4b.2, section 9): the
-- column channels.post_policy with its two CHECKs, and the two functions the
-- file restates, can_post_org_channel and chat_cast_vote.
--
-- LOCAL ONLY. Run it AFTER the migration has been applied to the local stack
-- and its schema_migrations row recorded:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/chat-room-post-policy-check.sql
-- Never on production: it writes (and rolls back) users, a club, rooms,
-- messages, polls and votes, and for a moment it creates functions in
-- pg_temp. It refuses any connection that is not the local unix socket
-- (docker exec), and its first line is a psql command, so the Management API
-- and the MCP refuse the file before anything runs. One builder on the local
-- database at a time (contract 4b): do not run it beside another check
-- script or the seed.
-- Expected last line: chat-room-post-policy-check: all N cases passed.
-- Nothing is kept: ROLLBACK follows.
--
-- WHAT IT DOES. Everything happens inside ONE transaction that ends in
-- ROLLBACK. It builds its own fixtures, the way chat-v2-rooms-check.sql
-- does, so it does not depend on the seed: six throwaway accounts that may
-- publish, one club made the way POST /api/orgs makes one, and in it two
-- extra rooms (one public, one private), an event chat that is open and one
-- whose event ended 10 days ago (closed), and a dm.
-- Cases: C the catalog again (the column, both CHECKs, the three function
-- fingerprints, their attributes and grants, the comments, the recorded
-- row, and who holds INSERT or UPDATE on channels: the migration header's
-- PRE-CHECK 6); K the CHECKs by trying, and who may write the column at all,
-- by an update or by a room born with a rule; P
-- posting in the public room under each rule, as signed-in students through
-- the INSERT policy; L the allow list of 'listed'; R the private room, where
-- one list says who may enter and, under 'listed', who may post; V polls and
-- votes (the card functions obey the rule, a reader still votes, and what
-- closed a vote before still closes it); U the rooms that have no rule
-- (Lounge, Board, Officers) answer as they always did.
-- NOT here: the routes around these statements (the officer guard, the cap
-- of 5, the 503 on a missing column: src/lib/chat/room-routes.test.ts), and
-- everything chat-v2-rooms-check.sql and chat-v2-cards-check.sql already
-- cover; both are run again after this file's migration and must still end
-- "all N cases passed".
-- It raises on the first expectation that fails ("chat-room-post-policy-check
-- FAILED: ...") and prints one NOTICE per case that passes.
--
-- HOW IT ACTS AS SOMEONE. Students: role authenticated + their id in
-- request.jwt.claims, the way PostgREST runs a signed-in request, so every
-- policy and grant applies. The room routes, the allow-list route and the
-- card routes write with the SERVICE client: role service_role, no claims.
-- Answers: 'ok N' = the statement ran and touched N rows; otherwise the
-- SQLSTATE that refused it (42501 = a policy or a grant, 23514 = a CHECK,
-- 23502 = not null, P0C21 = may not post here, P0C24 = no such poll for this
-- person, P0C25 = closed).

-- A psql command: anything that is not psql refuses the file here. With it a
-- run without -v ON_ERROR_STOP=1 still stops at the first failure.
\set ON_ERROR_STOP on

begin;

-- Only on the local stack, and only on a database that has the migration.
do $$
begin
  if inet_server_addr() is not null then
    raise exception 'chat-room-post-policy-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.channels'::regclass
                    and a.attname = 'post_policy' and not a.attisdropped) then
    raise exception 'chat-room-post-policy-check: channels.post_policy is missing. Apply 20261004110000_chat_room_post_policy.sql to the local stack first';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.pp_ok(p_case text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'chat-room-post-policy-check FAILED: % (got "%", expected "%")',
      p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('chat_post_policy_check.passed',
    (coalesce(nullif(current_setting('chat_post_policy_check.passed', true), ''), '0')::int + 1)::text,
    true);
  raise notice 'chat-room-post-policy-check ok: %', p_case;
end $$;

-- Runs one statement as a role (and, for a student, as that student):
-- 'ok N' or the SQLSTATE that refused it.
create function pg_temp.pp_run(p_role text, p_who uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  me  text := current_user;
  n   bigint;
  got text;
begin
  perform set_config('request.jwt.claims',
    case when p_who is null then ''
         else json_build_object('sub', p_who, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    got := 'ok ' || n;
  exception when others then
    got := sqlstate;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return got;
end $$;

create function pg_temp.pp_as(p_who uuid, p_sql text)
returns text language sql
as $$ select pg_temp.pp_run('authenticated', p_who, p_sql) $$;

create function pg_temp.pp_service(p_sql text)
returns text language sql
as $$ select pg_temp.pp_run('service_role', null, p_sql) $$;

-- Runs one statement that answers ONE value as a role: the value as text, or
-- the SQLSTATE.
create function pg_temp.pp_call(p_role text, p_who uuid, p_sql text)
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
    got := sqlstate;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return got;
end $$;

-- Reads one value as a student (through the policies and grants).
create function pg_temp.pp_read(p_who uuid, p_sql text)
returns text language sql
as $$ select pg_temp.pp_call('authenticated', p_who, p_sql) $$;

-- The routes' shape: a function called with the service key. Its value as
-- text (a uuid, 'true'), or the SQLSTATE.
create function pg_temp.pp_rpc(p_sql text)
returns text language sql
as $$ select pg_temp.pp_call('service_role', null, p_sql) $$;

-- Ids travel between the blocks as transaction-local settings.
create function pg_temp.pp_keep(p_key text, p_id uuid)
returns void language sql
as $$ select set_config('chat_post_policy_check.' || p_key, p_id::text, true) $$;

create function pg_temp.pp_id(p_key text)
returns uuid language sql
as $$ select nullif(current_setting('chat_post_policy_check.' || p_key, true), '')::uuid $$;

-- The four things every case below does, by fixture name.
-- A new message in a room, as that student (the insert PostgREST issues).
create function pg_temp.pp_post(p_who text, p_room text)
returns text language sql
as $$ select pg_temp.pp_as(pg_temp.pp_id(p_who), format(
        'insert into public.messages (channel_id, user_id, content) values (%L, %L, %L) returning id',
        pg_temp.pp_id(p_room), pg_temp.pp_id(p_who), 'chat-room-post-policy-check: ' || p_who)) $$;

-- A reply under a message, as that student.
create function pg_temp.pp_reply(p_who text, p_room text, p_root text)
returns text language sql
as $$ select pg_temp.pp_as(pg_temp.pp_id(p_who), format(
        'insert into public.messages (channel_id, user_id, content, thread_root_id) values (%L, %L, %L, %L) returning id',
        pg_temp.pp_id(p_room), pg_temp.pp_id(p_who), 'chat-room-post-policy-check: reply of ' || p_who,
        pg_temp.pp_id(p_root))) $$;

-- What can_post_org_channel answers that student about themselves.
create function pg_temp.pp_can(p_who text, p_room text)
returns text language sql
as $$ select pg_temp.pp_read(pg_temp.pp_id(p_who), format(
        'select public.can_post_org_channel(%L, %L, null)::text',
        pg_temp.pp_id(p_room), pg_temp.pp_id(p_who))) $$;

-- The rule of a room, set the way PATCH /api/orgs/[slug]/channels/[id] sets
-- it: an update with the service role.
create function pg_temp.pp_rule(p_room text, p_policy text)
returns text language sql
as $$ select pg_temp.pp_service(format(
        'update public.channels set post_policy = %L where id = %L', p_policy, pg_temp.pp_id(p_room))) $$;

-- A vote, the way the vote route casts it: the function, service role.
create function pg_temp.pp_vote(p_poll text, p_who text, p_on boolean)
returns text language sql
as $$ select pg_temp.pp_service(format(
        'select public.chat_cast_vote(%L, %L, %L, %L)', pg_temp.pp_id(p_poll),
        (select o.id from public.chat_poll_options o
          where o.poll_id = pg_temp.pp_id(p_poll) and o.position = 0),
        pg_temp.pp_id(p_who), p_on)) $$;

-- How many votes that person holds on that poll, read as postgres. A
-- function, not an inline subquery: beside pp_vote in ONE expression it
-- reads with a fresh snapshot and sees what the vote just wrote.
create function pg_temp.pp_votes(p_poll text, p_who text)
returns text language sql
as $$ select count(*)::text from public.chat_poll_votes v
       where v.poll_id = pg_temp.pp_id(p_poll) and v.user_id = pg_temp.pp_id(p_who) $$;

-- 0. Fixtures ------------------------------------------------------------------
-- Six accounts that may publish (Terms, age, a verified school email):
--   owner, admin   the club's officers
--   mod            a moderator: NOT an officer for this rule
--   member         a plain member, never on an allow list
--   picked         a plain member the officers put on the allow lists
--   outsider       in no club
do $$
declare
  k text;
  u uuid;
begin
  foreach k in array array['owner', 'admin', 'mod', 'member', 'picked', 'outsider']
  loop
    u := gen_random_uuid();
    -- handle_new_user() writes the public.users row, consent included.
    insert into auth.users (id, instance_id, aud, role, email,
                            raw_user_meta_data, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'post-policy-check-' || k || '-' || left(u::text, 8) || '@example.test',
            jsonb_build_object('full_name', 'Post Policy Check ' || k,
                               'terms_version', '2026-01-01', 'age_attested', true),
            now(), now());
    update public.users
       set school_verified = true,
           school_system = 'iu',
           school_email = 'post-policy-check-' || k || '-' || left(u::text, 8) || '@iu.edu',
           campus_id = 'indianapolis',
           campus_set_at = now(),
           school = 'IU Indianapolis'
     where id = u;
    perform pg_temp.pp_keep(k, u);
    perform pg_temp.pp_ok('fixture: ' || k || ' may publish',
      pg_temp.pp_read(u, 'select (public.can_publish_now() and public.has_recorded_consent())::text'),
      'true');
  end loop;
end $$;

-- The club, the way POST /api/orgs makes one (the club row, the owner's
-- membership row, chat_repair_club, all with the service role); the others
-- join; then the rooms, the way POST /api/orgs/[slug]/channels makes them
-- (an insert with the service role, post_policy not sent: the default).
do $$
declare
  v_owner  uuid := pg_temp.pp_id('owner');
  v_club   uuid := gen_random_uuid();
  v_open   uuid := gen_random_uuid();
  v_closed uuid := gen_random_uuid();
  v_soon   uuid := gen_random_uuid();
  v_old    uuid := gen_random_uuid();
  v_dm     uuid := gen_random_uuid();
  k        text;
begin
  perform pg_temp.pp_keep('club', v_club);
  perform pg_temp.pp_ok('fixture: the club row is written (service role)',
    pg_temp.pp_service(format(
      'insert into public.orgs (id, handle, name, owner_id, join_policy, campus_id, school, verified)
       values (%L, %L, %L, %L, %L, %L, %L, true)',
      v_club, 'post_policy_' || left(v_club::text, 8), 'Post Policy Check Club', v_owner,
      'open', 'indianapolis', 'IU Indianapolis')), 'ok 1');
  perform pg_temp.pp_ok('fixture: the owner''s membership row, then chat_repair_club',
    pg_temp.pp_service(format(
      'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)', v_club, v_owner, 'owner'))
    || '/' || pg_temp.pp_service(format('select public.chat_repair_club(%L)', v_club)), 'ok 1/ok 1');
  foreach k in array array['admin', 'mod', 'member', 'picked']
  loop
    perform pg_temp.pp_ok('fixture: ' || k || ' joins',
      pg_temp.pp_service(format(
        'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)',
        v_club, pg_temp.pp_id(k), case when k in ('admin', 'mod') then k else 'member' end)), 'ok 1');
  end loop;
  perform pg_temp.pp_keep('lounge',   (select id from public.channels where org_id = v_club and kind = 'lounge'));
  perform pg_temp.pp_keep('board',    (select id from public.channels where org_id = v_club and kind = 'board'));
  perform pg_temp.pp_keep('officers', (select id from public.channels where org_id = v_club and kind = 'officers'));

  perform pg_temp.pp_ok('fixture: two extra rooms are made, one public and one private (the route''s insert, no post_policy sent)',
    pg_temp.pp_service(format(
      'insert into public.channels (id, org_id, type, name, topic, is_private, position, kind) values
         (%L, %L, ''org_channel'', ''pp-open'', null, false, 3, ''room''),
         (%L, %L, ''org_channel'', ''pp-closed'', null, true, 4, ''room'')',
      v_open, v_club, v_closed, v_club)), 'ok 2');
  perform pg_temp.pp_keep('open', v_open);
  perform pg_temp.pp_keep('closed', v_closed);

  -- Two events of the club: one in two days (its chat is open), one that
  -- ended 10 days ago (its chat closed 3 days ago). chat_events_room makes
  -- each its room; the officers hold a row on both.
  perform pg_temp.pp_ok('fixture: two events are written (service role)',
    pg_temp.pp_service(format(
      'insert into public.events (id, org_id, creator_id, title, starts_at, ends_at, location) values
         (%L, %L, %L, %L, now() + interval ''2 days'', now() + interval ''2 days 2 hours'', ''x''),
         (%L, %L, %L, %L, now() - interval ''10 days 2 hours'', now() - interval ''10 days'', ''x'')',
      v_soon, v_club, v_owner, 'Post Policy Soon', v_old, v_club, v_owner, 'Post Policy Old')), 'ok 2');
  perform pg_temp.pp_ok('fixture: each event has its chat',
    (select count(*)::text from public.channels where org_id = v_club and kind = 'event'), '2');
  perform pg_temp.pp_keep('room_soon', (select id from public.channels where event_id = v_soon));
  perform pg_temp.pp_keep('room_old',  (select id from public.channels where event_id = v_old));

  -- A dm between member and outsider (no club: kind is null).
  insert into public.channels (id, type, name) values (v_dm, 'dm', '');
  insert into public.channel_members (channel_id, user_id, role, accepted_at)
  values (v_dm, pg_temp.pp_id('member'), 'member', now()), (v_dm, pg_temp.pp_id('outsider'), 'member', now());
  perform pg_temp.pp_keep('dm', v_dm);
end $$;

-- C. The catalog, again (before any rule is set below) ------------------------------
do $$
declare
  post constant text := 'public.can_post_org_channel(uuid,uuid,uuid)';
  vote constant text := 'public.chat_cast_vote(uuid,uuid,uuid,boolean)';
  view constant text := 'public.can_view_org_channel(uuid,uuid)';
begin
  perform pg_temp.pp_ok('C1 the column: text, not null, default everyone',
    (select format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                   case when a.attnotnull then ' not null' else '' end,
                   coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
       from pg_attribute a
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = 'public.channels'::regclass and a.attname = 'post_policy' and not a.attisdropped),
    'post_policy text not null default ''everyone''::text');
  perform pg_temp.pp_ok('C2 both CHECKs are there, validated, and read as written',
    (select string_agg(c.conname || ' ' || pg_get_constraintdef(c.oid), ' | ' order by c.conname collate "C")
       from pg_constraint c
      where c.conrelid = 'public.channels'::regclass and c.contype = 'c' and c.convalidated
        and c.conname like 'channels_post_policy%'),
    'channels_post_policy_check CHECK ((post_policy = ANY (ARRAY[''everyone''::text, ''officers''::text, ''listed''::text])))'
    || ' | channels_post_policy_rooms_only CHECK (((post_policy = ''everyone''::text) OR COALESCE((kind = ''room''::text), false)))');
  perform pg_temp.pp_ok('C3 a room made without a rule reads everyone (both of this script''s), and nothing that is not an extra room holds a rule',
    (select string_agg(c.post_policy, '/' order by c.name)
       from public.channels c where c.id in (pg_temp.pp_id('open'), pg_temp.pp_id('closed')))
    || ' ' || (select count(*) from public.channels c
                where c.post_policy <> 'everyone' and c.kind is distinct from 'room'),
    'everyone/everyone 0');
  perform pg_temp.pp_ok('C4 the fingerprints: the two restated functions read as the migration left them, can_view_org_channel as before it',
    concat_ws(' ', md5(pg_get_functiondef(post::regprocedure)), md5(pg_get_functiondef(vote::regprocedure)),
              md5(pg_get_functiondef(view::regprocedure))),
    'ae485a1fb463cfd6f6ace3448d986fb9 0ba4681e8816cecaa5c066ee6b03bedd 747ee06d2e4c3e8a788129f7530ec0ae');
  perform pg_temp.pp_ok('C5 both kept what CREATE OR REPLACE would reset: security definer, volatility, search_path, TimeZone',
    (select string_agg(concat_ws(' ', p.proname, case when p.prosecdef then 'definer' else 'invoker' end,
                                 l.lanname, p.provolatile::text, array_to_string(p.proconfig, ';')),
                       ' | ' order by p.proname)
       from pg_proc p join pg_language l on l.oid = p.prolang
      where p.oid in (post::regprocedure, vote::regprocedure)),
    'can_post_org_channel definer sql s search_path="";TimeZone=UTC | chat_cast_vote definer plpgsql v search_path="";TimeZone=UTC');
  perform pg_temp.pp_ok('C6 all three are executable by anon, authenticated and service_role (the standing rule: never revoked)',
    (select string_agg(has_function_privilege(r.r, f.f, 'execute')::text, '' order by f.f, r.r)
       from (values ('anon'), ('authenticated'), ('service_role')) as r (r)
       cross join (values (post), (vote), (view)) as f (f)),
    repeat('true', 9));
  perform pg_temp.pp_ok('C7 the comment of can_post_org_channel names the rule and carries the APPLY RECORD (the behaviour check passed, or says why it was skipped)',
    (select (obj_description(post::regprocedure, 'pg_proc')
             like '%Rooms: by post_policy.%APPLY RECORD %behaviour check %')::text),
    'true');
  perform pg_temp.pp_ok('C8 chat_cast_vote''s closed test names the event chat, and no longer "every kind but the Board"',
    (select concat_ws('/', (d like '%v_kind = ''event'' and not coalesce(public.can_post_org_channel(%')::text,
                      (d like '%v_kind <> ''board''%')::text)
       from pg_get_functiondef(vote::regprocedure) d),
    'true/false');
  perform pg_temp.pp_ok('C9 the column''s comment names the three values',
    (select (col_description('public.channels'::regclass, a.attnum) like 'Who may post a new message in an extra room%everyone%officers%listed%')::text
       from pg_attribute a where a.attrelid = 'public.channels'::regclass and a.attname = 'post_policy'),
    'true');
  perform pg_temp.pp_ok('C10 the migration''s row is recorded',
    (select string_agg(m.name, ',') from supabase_migrations.schema_migrations m where m.version = '20261004110000'),
    'chat_room_post_policy');
  -- The migration header's PRE-CHECK 6, a and c, as one case: the answers it
  -- prints in brackets are the ones read here. has_any_column_privilege is
  -- true for a grant on the table OR on one column (a column's own grant
  -- does not show in relacl), and counts PUBLIC and inherited roles.
  perform pg_temp.pp_ok('C11 who may write the rule: anon and authenticated hold neither INSERT nor UPDATE on channels (the table or any one column), RLS is on, no policy covers UPDATE',
    (select string_agg(concat_ws(' ', r.r, has_any_column_privilege(r.r, 'public.channels', 'insert')::text,
                                 has_any_column_privilege(r.r, 'public.channels', 'update')::text),
                       ' | ' order by r.r)
       from (values ('anon'), ('authenticated')) as r (r))
    || ' | rls ' || (select c.relrowsecurity::text from pg_class c where c.oid = 'public.channels'::regclass)
    || ' | update policies ' || (select count(*) from pg_policy p
                                  where p.polrelid = 'public.channels'::regclass and p.polcmd in ('w', '*')),
    'anon false false | authenticated false false | rls true | update policies 0');
end $$;

-- K. The CHECKs by trying, and who may write the column -----------------------------
do $$
declare
  v_club uuid := pg_temp.pp_id('club');
  set_to constant text := 'update public.channels set post_policy = %L where id = %L';
  r      record;
begin
  perform pg_temp.pp_ok('K1 the service role sets officers, then listed, then everyone on an extra room',
    concat_ws('/', pg_temp.pp_rule('open', 'officers'), pg_temp.pp_rule('open', 'listed'),
              pg_temp.pp_rule('open', 'everyone')), 'ok 1/ok 1/ok 1');
  perform pg_temp.pp_ok('K2 a value outside the three is refused (CHECK)',
    pg_temp.pp_rule('open', 'nobody'), '23514');
  perform pg_temp.pp_ok('K3 no rule at all is refused (not null)',
    pg_temp.pp_service(format('update public.channels set post_policy = null where id = %L', pg_temp.pp_id('open'))), '23502');
  -- Every kind that is not an extra room: the second CHECK.
  for r in
    select * from (values
      (4, 'the Lounge',          'lounge',    'officers'),
      (5, 'the Board',           'board',     'listed'),
      (6, 'the Officers room',   'officers',  'officers'),
      (7, 'an open event chat',  'room_soon', 'officers'),
      (8, 'a closed event chat', 'room_old',  'listed'),
      (9, 'a dm',                'dm',        'officers')) as t (n, what, room, policy)
    order by 1
  loop
    perform pg_temp.pp_ok(format('K%s %s cannot hold a rule (%s is refused)', r.n, r.what, r.policy),
      pg_temp.pp_rule(r.room, r.policy), '23514');
  end loop;
  perform pg_temp.pp_ok('K10 a new group chat sent with a rule is refused; a new extra room sent with one is made (the route''s insert for a non-default rule)',
    pg_temp.pp_service('insert into public.channels (type, name, post_policy) values (''group'', ''x'', ''listed'')')
    || '/' || pg_temp.pp_service(format(
      'insert into public.channels (org_id, type, name, is_private, position, kind, post_policy)
       values (%L, ''org_channel'', ''pp-born-listed'', false, 5, ''room'', ''listed'')', v_club)),
    '23514/ok 1');
  perform pg_temp.pp_ok('K11 old code that sends no kind and no rule still makes a room (chat_channels_fill_kind)',
    pg_temp.pp_service(format(
      'insert into public.channels (org_id, type, name, is_private) values (%L, ''org_channel'', ''pp-old-code'', false)', v_club)),
    'ok 1');
  perform pg_temp.pp_ok('K11 and that room reads everyone; the one born listed reads listed',
    (select string_agg(concat_ws(':', c.name, c.kind, c.post_policy), ' ' order by c.name)
       from public.channels c where c.org_id = v_club and c.name in ('pp-old-code', 'pp-born-listed')),
    'pp-born-listed:room:listed pp-old-code:room:everyone');

  -- Who may write it. authenticated holds no UPDATE on channels at all: an
  -- officer changes the rule through the route (officer guard, then the
  -- service role), never with a direct statement; a member and a signed-out
  -- visitor neither.
  perform pg_temp.pp_ok('K12 an admin''s direct update of the rule is refused (no grant)',
    pg_temp.pp_as(pg_temp.pp_id('admin'), format(set_to, 'officers', pg_temp.pp_id('open'))), '42501');
  perform pg_temp.pp_ok('K13 a member''s direct update of the rule is refused',
    pg_temp.pp_as(pg_temp.pp_id('member'), format(set_to, 'officers', pg_temp.pp_id('open'))), '42501');
  perform pg_temp.pp_ok('K14 a signed-out visitor''s is refused',
    pg_temp.pp_run('anon', null, format(set_to, 'officers', pg_temp.pp_id('open'))), '42501');
  -- Nor a room born with a rule: no INSERT grant either, so the INSERT policy
  -- (owner or admin of the club) is never reached and the route's cap of 5
  -- cannot be walked around.
  perform pg_temp.pp_ok('K15 an admin''s direct insert of a room born with a rule is refused (no grant)',
    pg_temp.pp_as(pg_temp.pp_id('admin'), format(
      'insert into public.channels (org_id, type, name, is_private, position, kind, post_policy)
       values (%L, ''org_channel'', ''pp-direct'', false, 6, ''room'', ''officers'')', v_club)),
    '42501');
  perform pg_temp.pp_ok('K16 after all of that the room still reads everyone, and no room was made by the direct insert',
    (select c.post_policy from public.channels c where c.id = pg_temp.pp_id('open'))
    || ' ' || (select count(*) from public.channels c where c.org_id = v_club and c.name = 'pp-direct'),
    'everyone 0');
end $$;

-- P. Posting in the public room under each rule, as students ------------------------
-- Every insert is the one PostgREST issues for a signed-in student, through
-- messages_insert_org_member (which asks can_post_org_channel). The root of
-- the reply cases is the owner's first message in the room.
do $$
declare
  who text;
begin
  -- everyone: whoever can see the room posts (the rule before the column).
  perform pg_temp.pp_ok('P1 everyone: the owner posts (this message is the root of the reply cases)',
    pg_temp.pp_post('owner', 'open'), 'ok 1');
  perform pg_temp.pp_keep('root', (select m.id from public.messages m
                                    where m.channel_id = pg_temp.pp_id('open') and m.user_id = pg_temp.pp_id('owner')));
  foreach who in array array['admin', 'mod', 'member', 'picked'] loop
    perform pg_temp.pp_ok('P2 everyone: ' || who || ' posts', pg_temp.pp_post(who, 'open'), 'ok 1');
  end loop;
  perform pg_temp.pp_ok('P3 everyone: a person outside the club is refused',
    pg_temp.pp_post('outsider', 'open'), '42501');
  perform pg_temp.pp_ok('P4 everyone: a reply is refused (a room has no replies), for a member and for the owner',
    pg_temp.pp_reply('member', 'open', 'root') || '/' || pg_temp.pp_reply('owner', 'open', 'root'), '42501/42501');
  perform pg_temp.pp_ok('P5 everyone: can_post_org_channel says member true, outsider false',
    pg_temp.pp_can('member', 'open') || '/' || pg_temp.pp_can('outsider', 'open'), 'true/false');

  -- officers: owner and admin post; everyone else reads.
  perform pg_temp.pp_ok('P6 the rule becomes officers', pg_temp.pp_rule('open', 'officers'), 'ok 1');
  foreach who in array array['owner', 'admin'] loop
    perform pg_temp.pp_ok('P7 officers: ' || who || ' posts', pg_temp.pp_post(who, 'open'), 'ok 1');
  end loop;
  foreach who in array array['mod', 'member', 'picked', 'outsider'] loop
    perform pg_temp.pp_ok('P8 officers: ' || who || ' is refused', pg_temp.pp_post(who, 'open'), '42501');
  end loop;
  perform pg_temp.pp_ok('P9 officers: a reply is refused, for a member and for an admin',
    pg_temp.pp_reply('member', 'open', 'root') || '/' || pg_temp.pp_reply('admin', 'open', 'root'), '42501/42501');
  perform pg_temp.pp_ok('P10 officers: can_post_org_channel says owner true, admin true, mod false, member false, outsider false',
    concat_ws('/', pg_temp.pp_can('owner', 'open'), pg_temp.pp_can('admin', 'open'), pg_temp.pp_can('mod', 'open'),
              pg_temp.pp_can('member', 'open'), pg_temp.pp_can('outsider', 'open')),
    'true/true/false/false/false');
  perform pg_temp.pp_ok('P11 officers: the member still READS the room (the seven messages posted so far)',
    pg_temp.pp_read(pg_temp.pp_id('member'), format(
      'select count(*) from public.messages where channel_id = %L', pg_temp.pp_id('open'))), '7');
  perform pg_temp.pp_ok('P12 the guards are A''s: a student asking about someone else gets false, a signed-out visitor gets false',
    pg_temp.pp_read(pg_temp.pp_id('member'), format(
      'select public.can_post_org_channel(%L, %L, null)::text', pg_temp.pp_id('open'), pg_temp.pp_id('admin')))
    || '/' || pg_temp.pp_call('anon', null, format(
      'select public.can_post_org_channel(%L, %L, null)::text', pg_temp.pp_id('open'), pg_temp.pp_id('admin'))),
    'false/false');
  perform pg_temp.pp_ok('P13 under the service role it answers about anyone (how the card functions ask): admin true, member false',
    pg_temp.pp_rpc(format('select public.can_post_org_channel(%L, %L, null)::text', pg_temp.pp_id('open'), pg_temp.pp_id('admin')))
    || '/' || pg_temp.pp_rpc(format('select public.can_post_org_channel(%L, %L, null)::text', pg_temp.pp_id('open'), pg_temp.pp_id('member'))),
    'true/false');
end $$;

-- L. listed: owner, admin and the room's allow list ----------------------------------
-- The allow list is org_channel_members, written the way the room's members
-- route writes it (service role, after its officer guard).
do $$
declare
  v_open uuid := pg_temp.pp_id('open');
  who    text;
  allow  constant text := 'insert into public.org_channel_members (channel_id, user_id, added_by) values (%L, %L, %L)';
begin
  perform pg_temp.pp_ok('L1 the rule becomes listed', pg_temp.pp_rule('open', 'listed'), 'ok 1');
  foreach who in array array['mod', 'member', 'picked', 'outsider'] loop
    perform pg_temp.pp_ok('L2 listed, nobody on the list yet: ' || who || ' is refused', pg_temp.pp_post(who, 'open'), '42501');
  end loop;
  foreach who in array array['owner', 'admin'] loop
    perform pg_temp.pp_ok('L3 listed: ' || who || ' posts without being on the list', pg_temp.pp_post(who, 'open'), 'ok 1');
  end loop;
  perform pg_temp.pp_ok('L4 a member cannot put themselves on the list (the allow list''s own INSERT policy: owner and admin only)',
    pg_temp.pp_as(pg_temp.pp_id('member'), format(allow, v_open, pg_temp.pp_id('member'), pg_temp.pp_id('member'))), '42501');
  perform pg_temp.pp_ok('L5 an officer puts picked on the list (the route: service role)',
    pg_temp.pp_service(format(allow, v_open, pg_temp.pp_id('picked'), pg_temp.pp_id('admin'))), 'ok 1');
  perform pg_temp.pp_ok('L6 listed: picked posts now, and can_post_org_channel says so',
    pg_temp.pp_post('picked', 'open') || '/' || pg_temp.pp_can('picked', 'open'), 'ok 1/true');
  perform pg_temp.pp_ok('L7 listed: the member and the mod are still refused',
    pg_temp.pp_post('member', 'open') || '/' || pg_temp.pp_post('mod', 'open'), '42501/42501');
  perform pg_temp.pp_ok('L8 listed: a reply is refused even for a person on the list',
    pg_temp.pp_reply('picked', 'open', 'root'), '42501');
  perform pg_temp.pp_ok('L9 a row on the list gives a person outside the club nothing (they cannot see the room)',
    pg_temp.pp_service(format(allow, v_open, pg_temp.pp_id('outsider'), pg_temp.pp_id('admin')))
    || '/' || pg_temp.pp_post('outsider', 'open') || '/' || pg_temp.pp_can('outsider', 'open'), 'ok 1/42501/false');
  perform pg_temp.pp_ok('L10 the list means nothing under officers: picked is refused, the admin posts',
    pg_temp.pp_rule('open', 'officers') || '/' || pg_temp.pp_post('picked', 'open') || '/' || pg_temp.pp_post('admin', 'open'),
    'ok 1/42501/ok 1');
  perform pg_temp.pp_ok('L11 back to listed, picked taken off the list: refused again',
    pg_temp.pp_rule('open', 'listed') || '/' || pg_temp.pp_service(format(
      'delete from public.org_channel_members where channel_id = %L and user_id = %L', v_open, pg_temp.pp_id('picked')))
    || '/' || pg_temp.pp_post('picked', 'open'), 'ok 1/ok 1/42501');
  perform pg_temp.pp_ok('L12 back to everyone: the member posts again',
    pg_temp.pp_rule('open', 'everyone') || '/' || pg_temp.pp_post('member', 'open'), 'ok 1/ok 1');
end $$;

-- R. The private room: one list says who may enter; under listed it also ----------
-- says who may post. picked is on its list, member is not.
do $$
declare
  v_closed uuid := pg_temp.pp_id('closed');
begin
  perform pg_temp.pp_ok('R1 an officer puts picked on the private room''s list',
    pg_temp.pp_service(format(
      'insert into public.org_channel_members (channel_id, user_id, added_by) values (%L, %L, %L)',
      v_closed, pg_temp.pp_id('picked'), pg_temp.pp_id('owner'))), 'ok 1');
  perform pg_temp.pp_ok('R2 everyone: picked and the admin post, the member (not let in) is refused',
    concat_ws('/', pg_temp.pp_post('picked', 'closed'), pg_temp.pp_post('admin', 'closed'), pg_temp.pp_post('member', 'closed')),
    'ok 1/ok 1/42501');
  perform pg_temp.pp_ok('R3 officers: picked is refused but still reads the room''s two messages; the admin posts',
    concat_ws('/', pg_temp.pp_rule('closed', 'officers'), pg_temp.pp_post('picked', 'closed'),
              pg_temp.pp_read(pg_temp.pp_id('picked'), format(
                'select count(*) from public.messages where channel_id = %L', v_closed)),
              pg_temp.pp_post('admin', 'closed')),
    'ok 1/42501/2/ok 1');
  perform pg_temp.pp_ok('R4 listed: picked posts (the same list), the member is refused and reads nothing',
    concat_ws('/', pg_temp.pp_rule('closed', 'listed'), pg_temp.pp_post('picked', 'closed'), pg_temp.pp_post('member', 'closed'),
              pg_temp.pp_read(pg_temp.pp_id('member'), format(
                'select count(*) from public.messages where channel_id = %L', v_closed))),
    'ok 1/ok 1/42501/0');
  perform pg_temp.pp_ok('R5 turning the room public keeps its rule: the member now reads it and is still refused',
    concat_ws('/', pg_temp.pp_service(format('update public.channels set is_private = false where id = %L', v_closed)),
              pg_temp.pp_read(pg_temp.pp_id('member'), format(
                'select count(*) from public.messages where channel_id = %L', v_closed)),
              pg_temp.pp_post('member', 'closed'),
              (select c.post_policy from public.channels c where c.id = v_closed)),
    'ok 1/4/42501/listed');
end $$;

-- V. Polls and votes -------------------------------------------------------------------
-- The card functions are called the way the routes call them: service role.
-- chat_create_poll asks can_post_org_channel, so only someone who may post
-- makes a poll; chat_cast_vote lets anyone who can VIEW the room vote, and
-- closes a vote only past closes_at or in an event chat past its 7 days.
do $$
declare
  v_open    uuid := pg_temp.pp_id('open');
  v_oldpoll uuid := gen_random_uuid();
  got       text;
  two  constant text := '[{"label": "a"}, {"label": "b"}]';
  poll constant text := 'select public.chat_create_poll(%L, %L, %L, %L, %L::jsonb, false, false, null, %L)';
begin
  perform pg_temp.pp_ok('V1 the public room is officers again', pg_temp.pp_rule('open', 'officers'), 'ok 1');
  perform pg_temp.pp_ok('V2 officers: a member cannot make a poll there (P0C21: the card functions obey the rule)',
    pg_temp.pp_rpc(format(poll, v_open, pg_temp.pp_id('member'), 'poll', 'q', two, 'Poll: q')), 'P0C21');
  got := pg_temp.pp_rpc(format(poll, v_open, pg_temp.pp_id('admin'), 'poll', 'q', two, 'Poll: q'));
  perform pg_temp.pp_ok('V3 officers: the admin makes one',
    (got ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')::text || ' ' || got, 'true ' || got);
  perform pg_temp.pp_keep('poll', got::uuid);
  perform pg_temp.pp_ok('V4 officers: the member, who can read but not post, votes (before the migration: P0C25 closed)',
    pg_temp.pp_vote('poll', 'member', true) || '/' || pg_temp.pp_votes('poll', 'member'), 'ok 1/1');
  perform pg_temp.pp_ok('V5 officers: the mod votes too, and the member takes the vote back',
    concat_ws('/', pg_temp.pp_vote('poll', 'mod', true), pg_temp.pp_votes('poll', 'mod'),
              pg_temp.pp_vote('poll', 'member', false), pg_temp.pp_votes('poll', 'member')), 'ok 1/1/ok 1/0');
  perform pg_temp.pp_ok('V6 a person outside the club: the poll is not there for them (P0C24)',
    pg_temp.pp_vote('poll', 'outsider', true), 'P0C24');
  perform pg_temp.pp_ok('V7 a student calling chat_cast_vote directly is still refused inside (42501)',
    pg_temp.pp_as(pg_temp.pp_id('member'), format('select public.chat_cast_vote(%L, %L, %L, true)', pg_temp.pp_id('poll'),
      (select o.id from public.chat_poll_options o where o.poll_id = pg_temp.pp_id('poll') and o.position = 1),
      pg_temp.pp_id('member'))), '42501');
  perform pg_temp.pp_ok('V8 listed: the member, not on the list, votes',
    pg_temp.pp_rule('open', 'listed') || '/' || pg_temp.pp_vote('poll', 'member', true)
    || '/' || pg_temp.pp_votes('poll', 'member'), 'ok 1/ok 1/1');

  -- A sign-up in the officers room: the slot rule is B's, untouched.
  perform pg_temp.pp_rule('open', 'officers');
  got := pg_temp.pp_rpc(format(poll, v_open, pg_temp.pp_id('owner'), 'signup', 'bring', '[{"label": "snacks", "capacity": 1}]', 'Sign-up: bring'));
  perform pg_temp.pp_keep('signup', got::uuid);
  perform pg_temp.pp_ok('V9 officers: the member takes the one slot of a sign-up, the mod finds it full (P0C26)',
    pg_temp.pp_vote('signup', 'member', true) || '/' || pg_temp.pp_vote('signup', 'mod', true), 'ok 1/P0C26');

  -- What closed a vote before still closes it. closes_at is moved by hand
  -- (set local cannot move now()); the poll in the closed event chat is
  -- written by hand (nothing else can put one there), as chat-v2-cards-check
  -- does for its C12.
  update public.chat_polls set closes_at = now() - interval '1 minute' where message_id = pg_temp.pp_id('poll');
  perform pg_temp.pp_ok('V10 a vote after closes_at is refused (P0C25), on and off',
    pg_temp.pp_vote('poll', 'mod', false) || '/' || pg_temp.pp_vote('poll', 'picked', true), 'P0C25/P0C25');
  insert into public.messages (id, channel_id, user_id, content, kind)
  values (v_oldpoll, pg_temp.pp_id('room_old'), pg_temp.pp_id('owner'), 'Poll: old room', 'poll');
  insert into public.chat_polls (message_id, channel_id, mode, question, created_by)
  values (v_oldpoll, pg_temp.pp_id('room_old'), 'poll', 'old room', pg_temp.pp_id('owner'));
  insert into public.chat_poll_options (poll_id, position, label) values (v_oldpoll, 0, 'a');
  perform pg_temp.pp_keep('oldpoll', v_oldpoll);
  perform pg_temp.pp_ok('V11 a vote in an event chat past its 7 days is refused (P0C25), even for the owner who still reads it',
    pg_temp.pp_vote('oldpoll', 'owner', true), 'P0C25');
  got := pg_temp.pp_rpc(format(poll, pg_temp.pp_id('room_soon'), pg_temp.pp_id('owner'), 'poll', 'q', two, 'Poll: q'));
  perform pg_temp.pp_keep('soonpoll', got::uuid);
  perform pg_temp.pp_ok('V12 an open event chat takes a poll and a vote as before',
    pg_temp.pp_vote('soonpoll', 'admin', true) || '/' || pg_temp.pp_votes('soonpoll', 'admin'), 'ok 1/1');
  got := pg_temp.pp_rpc(format(poll, pg_temp.pp_id('board'), pg_temp.pp_id('admin'), 'poll', 'q', two, 'Poll: q'));
  perform pg_temp.pp_keep('boardpoll', got::uuid);
  perform pg_temp.pp_ok('V13 the Board as before: a member cannot make a poll there (P0C21) and votes on the officer''s',
    pg_temp.pp_rpc(format(poll, pg_temp.pp_id('board'), pg_temp.pp_id('member'), 'poll', 'q', two, 'Poll: q'))
    || '/' || pg_temp.pp_vote('boardpoll', 'member', true) || '/' || pg_temp.pp_votes('boardpoll', 'member'), 'P0C21/ok 1/1');
  got := pg_temp.pp_rpc(format(poll, pg_temp.pp_id('lounge'), pg_temp.pp_id('member'), 'poll', 'q', two, 'Poll: q'));
  perform pg_temp.pp_keep('loungepoll', got::uuid);
  perform pg_temp.pp_ok('V14 the Lounge as before: a member makes a poll, the mod votes',
    pg_temp.pp_vote('loungepoll', 'mod', true) || '/' || pg_temp.pp_votes('loungepoll', 'mod'), 'ok 1/1');
end $$;

-- U. The rooms without a rule answer as they always did --------------------------------
do $$
begin
  perform pg_temp.pp_ok('U1 the Lounge: a member posts',
    pg_temp.pp_post('member', 'lounge'), 'ok 1');
  perform pg_temp.pp_ok('U2 the Board: a member''s top-level post is refused, the admin''s is accepted',
    pg_temp.pp_post('member', 'board') || '/' || pg_temp.pp_post('admin', 'board'), '42501/ok 1');
  perform pg_temp.pp_keep('broot', (select m.id from public.messages m
                                     where m.channel_id = pg_temp.pp_id('board')
                                       and m.user_id = pg_temp.pp_id('admin') and m.kind = 'text'));
  perform pg_temp.pp_ok('U3 the Board: a member replies under the admin''s post',
    pg_temp.pp_reply('member', 'board', 'broot'), 'ok 1');
  perform pg_temp.pp_ok('U4 the Officers room: the admin posts, a member is refused',
    pg_temp.pp_post('admin', 'officers') || '/' || pg_temp.pp_post('member', 'officers'), 'ok 1/42501');
  perform pg_temp.pp_ok('U5 event chats: the owner posts in the open one and is refused in the one that closed',
    pg_temp.pp_post('owner', 'room_soon') || '/' || pg_temp.pp_post('owner', 'room_old'), 'ok 1/42501');
  perform pg_temp.pp_ok('U6 a room that does not exist: false, never null',
    pg_temp.pp_read(pg_temp.pp_id('member'), format(
      'select public.can_post_org_channel(%L, %L, null)::text', gen_random_uuid(), pg_temp.pp_id('member'))), 'false');
end $$;

-- The end. -----------------------------------------------------------------------
do $$
begin
  if current_user <> session_user then
    raise exception 'chat-room-post-policy-check: the run did not return to its own role (now %)', current_user;
  end if;
  raise notice 'chat-room-post-policy-check: all % cases passed',
    coalesce(nullif(current_setting('chat_post_policy_check.passed', true), ''), '0');
end $$;

rollback;
