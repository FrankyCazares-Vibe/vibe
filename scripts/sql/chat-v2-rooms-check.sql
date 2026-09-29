-- chat-v2-rooms-check.sql: the behaviour check of migration A
-- (supabase/migrations/20261001100000_chat_v2_rooms.sql), gate 2 of
-- handoffs/chat-redesign/wave-1-contracts.md section 11 (S69, batch B1a).
--
-- LOCAL ONLY. Run it AFTER the migration has been applied to the local stack:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/chat-v2-rooms-check.sql
-- Never on production: it writes (and rolls back) users, clubs and messages,
-- and for a moment it creates a function in public and two triggers.
-- It refuses any connection that is not the local unix socket (docker exec),
-- and its first line is a psql command, so the Management API and the MCP
-- refuse the file before anything runs.
-- Expected last line: chat-check: all 200 cases passed. Nothing is kept:
-- ROLLBACK follows.
--
-- WHAT IT DOES. Everything happens inside ONE transaction that ends in
-- ROLLBACK, so nothing it writes stays. It builds its own fixtures (seven
-- throwaway accounts, two clubs, their events), so it does not depend on the
-- seed or on what is in the database. It raises on the first expectation
-- that fails ("chat-check FAILED: ...") and prints one NOTICE per case that
-- passes ("chat-check ok: ..."). The last line says how many cases passed.
--
-- HOW IT ACTS AS SOMEONE. Students: role authenticated + their id in
-- request.jwt.claims, the way PostgREST runs a signed-in request, so every
-- policy applies. Routes that use the service key: role service_role.
-- Three cases of gate 2 go through an HTTP route in the app. They are done
-- here at SQL level with the same statement the route issues, and say so:
--   * creating an event   = INSERT INTO events as the service role
--                           (POST /api/events, src/app/api/events/route.ts:509)
--   * cancelling an event = DELETE FROM events ... RETURNING id as the
--                           signed-in officer (DELETE /api/events/[id],
--                           src/app/api/events/[id]/route.ts:176)
--   * an RSVP             = the upsert of PUT /api/events/[id]/rsvp as the
--                           signed-in student (rsvp/route.ts:168)
-- What a route does around its statement (rate limits, notices, its own
-- refusals) is not checked here; that is B1b / B4 and the browser walk.
-- STILL TO RUN OVER HTTP (the orchestrator, after the real local apply, on
-- the dev server it starts; gate 2 words these three as route calls):
--   * POST /api/events as an officer -> the room exists with the officers'
--     rows;
--   * PUT /api/events/[id]/rsvp as a member (the row appears) and as a
--     non-member (200, no row);
--   * DELETE /api/events/[id] on an event with 2 RSVPs and 3 room messages
--     -> 200, and event, room, rows and messages are gone;
--   * then scripts/sql/chat-v2-after-deploy.sql prints 0 findings.
-- Until the real local apply this script has only run in ONE transaction
-- with the migration's body (the rehearsal). Its first run on its own, after
-- a committed apply, is the orchestrator's.
--
-- WARNINGS. Section E breaks chat on purpose and prints 9 lines "WARNING:
-- chat-rooms: ... failed: chat-check: deliberate failure" (every one of the
-- four AFTER triggers, failing on an INSERT, on a DELETE and on its write
-- to channels). Any chat-rooms warning WITHOUT "deliberate failure" means
-- one of the four failed for real and swallowed it: treat it as a failed
-- run.
--   ... | grep 'WARNING' | grep -v 'deliberate failure'     must print nothing
--
-- Answers: 'ok N' = the statement ran and touched N rows; otherwise the
-- SQLSTATE that refused it (42501 = refused by a policy or a grant, 23514 = a
-- CHECK, 23505 = a unique index).

-- A psql command: anything that is not psql refuses the file here. With it a
-- run without -v ON_ERROR_STOP=1 still stops at the first failure.
\set ON_ERROR_STOP on

begin;

-- Only on the local stack, and only on a database that has migration A.
do $$
begin
  if inet_server_addr() is not null then
    raise exception 'chat-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'channels'
                    and column_name = 'kind') then
    raise exception 'chat-check: channels.kind is missing. Apply 20261001100000_chat_v2_rooms.sql to the local stack first';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.chat_ok(p_case text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'chat-check FAILED: % (got %, expected %)',
      p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('chat_check.passed',
    (coalesce(nullif(current_setting('chat_check.passed', true), ''), '0')::int + 1)::text,
    true);
  raise notice 'chat-check ok: %', p_case;
end $$;

-- Runs one statement as a role (and, for a student, as that student).
create function pg_temp.chat_run(p_role text, p_who uuid, p_sql text)
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

create function pg_temp.chat_as(p_who uuid, p_sql text)
returns text language sql
as $$ select pg_temp.chat_run('authenticated', p_who, p_sql) $$;

create function pg_temp.chat_service(p_sql text)
returns text language sql
as $$ select pg_temp.chat_run('service_role', null, p_sql) $$;

-- Reads one value as a student (through the SELECT policies).
create function pg_temp.chat_read(p_who uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  me  text := current_user;
  got text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into got;
  exception when others then
    got := sqlstate;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return got;
end $$;

-- Reads one value as this role. A function, not an inline subquery: a
-- subquery in the same statement as a write does not see that write.
create function pg_temp.chat_get(p_sql text)
returns text
language plpgsql
as $$
declare got text;
begin
  execute p_sql into got;
  return got;
end $$;

-- Ids travel between the blocks as transaction-local settings.
create function pg_temp.chat_keep(p_key text, p_id uuid)
returns void language sql
as $$ select set_config('chat_check.' || p_key, p_id::text, true) $$;

create function pg_temp.chat_id(p_key text)
returns uuid language sql
as $$ select nullif(current_setting('chat_check.' || p_key, true), '')::uuid $$;

-- Does this person hold a row on this room? 'yes' / 'no'.
create function pg_temp.chat_row(p_room uuid, p_who uuid)
returns text language sql
as $$ select case when exists (select 1 from public.channel_members cm
                                where cm.channel_id = p_room and cm.user_id = p_who)
                  then 'yes' else 'no' end $$;

-- Everything chat holds for one club, as one fingerprint.
create function pg_temp.chat_print(p_org uuid)
returns text language sql
as $$
  select md5(coalesce((
           select string_agg(concat_ws('|', c.id, c.kind, c.name, c.is_private,
                                       c.position, c.event_id), ',' order by c.id)
             from public.channels c where c.org_id = p_org), ''))
      || md5(coalesce((
           select string_agg(concat_ws('|', cm.id, cm.channel_id, cm.user_id, cm.role,
                                       cm.accepted_at, cm.last_read_at, cm.created_at),
                             ',' order by cm.id)
             from public.channel_members cm
             join public.channels c on c.id = cm.channel_id
            where c.org_id = p_org), ''))
$$;

-- 0. Fixtures ------------------------------------------------------------------
-- Seven accounts that may publish (Terms, age, a verified school email):
--   owner, admin, member, mod  the club's people
--   outsider                   never joins; RSVPs to the club's events
--   leaver                     leaves, re-joins, is removed
--   goner                      an admin whose account is deleted at the end
do $$
declare
  k text;
  u uuid;
begin
  foreach k in array array['owner', 'admin', 'member', 'mod', 'outsider', 'leaver', 'goner']
  loop
    u := gen_random_uuid();
    -- handle_new_user() writes the public.users row, consent included.
    insert into auth.users (id, instance_id, aud, role, email,
                            raw_user_meta_data, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'chat-check-' || k || '-' || left(u::text, 8) || '@example.test',
            jsonb_build_object('full_name', 'Chat Check ' || k,
                               'terms_version', '2026-01-01', 'age_attested', true),
            now(), now());
    update public.users
       set school_verified = true,
           school_system = 'iu',
           school_email = 'chat-check-' || k || '-' || left(u::text, 8) || '@iu.edu',
           campus_id = 'indianapolis',
           campus_set_at = now(),
           school = 'IU Indianapolis'
     where id = u;
    perform pg_temp.chat_keep(k, u);
    perform pg_temp.chat_ok('fixture: ' || k || ' may publish',
      pg_temp.chat_read(u, 'select (public.can_publish_now() and public.has_recorded_consent())::text'),
      'true');
  end loop;
end $$;

-- A. A new club, the way POST /api/orgs makes one after the deploy -----------------
-- (contract section 8: the club row, the owner's membership row, then
-- chat_repair_club with the service role).
do $$
declare
  v_owner  uuid := pg_temp.chat_id('owner');
  v_club   uuid := gen_random_uuid();
  v_lounge uuid;
  v_board  uuid;
  v_off    uuid;
  v_print  text;
  k        text;
begin
  perform pg_temp.chat_keep('club', v_club);
  perform pg_temp.chat_ok('A1 the club row is written (service role)',
    pg_temp.chat_service(format(
      'insert into public.orgs (id, handle, name, owner_id, join_policy, campus_id, school, verified)
       values (%L, %L, %L, %L, %L, %L, %L, true)',
      v_club, 'chat_check_' || left(v_club::text, 8), 'Chat Check Club', v_owner,
      'open', 'indianapolis', 'IU Indianapolis')), 'ok 1');
  perform pg_temp.chat_ok('A2 the owner''s membership row is written',
    pg_temp.chat_service(format(
      'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)',
      v_club, v_owner, 'owner')), 'ok 1');
  perform pg_temp.chat_ok('A3 chat_repair_club runs for the service role',
    pg_temp.chat_service(format('select public.chat_repair_club(%L)', v_club)), 'ok 1');

  perform pg_temp.chat_ok('A4 the club has Lounge (0, public), Board (1, public), Officers (2, private)',
    (select string_agg(concat_ws(':', c.kind, c.name, c.position, c.is_private), ' ' order by c.position)
       from public.channels c where c.org_id = v_club),
    'lounge:lounge:0:f board:board:1:f officers:officers:2:t');

  select id into v_lounge from public.channels where org_id = v_club and kind = 'lounge';
  select id into v_board  from public.channels where org_id = v_club and kind = 'board';
  select id into v_off    from public.channels where org_id = v_club and kind = 'officers';
  perform pg_temp.chat_keep('lounge', v_lounge);
  perform pg_temp.chat_keep('board', v_board);
  perform pg_temp.chat_keep('officers', v_off);

  perform pg_temp.chat_ok('A5 the owner holds a row on Lounge and Board, none on Officers',
    pg_temp.chat_row(v_lounge, v_owner) || pg_temp.chat_row(v_board, v_owner)
      || pg_temp.chat_row(v_off, v_owner), 'yesyesno');
  perform pg_temp.chat_ok('A6 a new row is accepted and read (the room does not start as unread)',
    (select count(*)::text from public.channel_members cm
      where cm.channel_id in (v_lounge, v_board) and cm.user_id = v_owner
        and cm.role = 'member' and cm.accepted_at is not null
        and cm.last_read_at is not null), '2');

  -- The others join (the membership row is written with the service role).
  foreach k in array array['admin', 'member', 'mod', 'leaver', 'goner']
  loop
    perform pg_temp.chat_ok('A7 ' || k || ' joins',
      pg_temp.chat_service(format(
        'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)',
        v_club, pg_temp.chat_id(k),
        case k when 'admin' then 'admin' when 'goner' then 'admin'
               when 'mod' then 'mod' else 'member' end)), 'ok 1');
    perform pg_temp.chat_ok('A8 ' || k || ' holds a row on Lounge and Board, none on Officers',
      pg_temp.chat_row(v_lounge, pg_temp.chat_id(k)) || pg_temp.chat_row(v_board, pg_temp.chat_id(k))
        || pg_temp.chat_row(v_off, pg_temp.chat_id(k)), 'yesyesno');
  end loop;

  -- The seed and the join routes upsert: the role is "updated" to itself.
  v_print := pg_temp.chat_print(v_club);
  perform pg_temp.chat_ok('A9 a membership upsert with the same role runs',
    pg_temp.chat_service(format(
      'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)
       on conflict (org_id, user_id) do update set role = excluded.role',
      v_club, pg_temp.chat_id('member'), 'member')), 'ok 1');
  perform pg_temp.chat_ok('A10 and changes no room and no row',
    pg_temp.chat_print(v_club), v_print);
end $$;

-- B. The Board rule and plain messages, as students through the policies ---------
-- Every insert is the one PostgREST issues for a signed-in student
-- (INSERT ... RETURNING under role authenticated).
do $$
declare
  v_owner    uuid := pg_temp.chat_id('owner');
  v_admin    uuid := pg_temp.chat_id('admin');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_outsider uuid := pg_temp.chat_id('outsider');
  v_lounge   uuid := pg_temp.chat_id('lounge');
  v_board    uuid := pg_temp.chat_id('board');
  v_off      uuid := pg_temp.chat_id('officers');
  v_post     uuid;
  v_reply    uuid;
  v_gone     uuid;
  ins        constant text :=
    'insert into public.messages (channel_id, user_id, content) values (%L, %L, %L) returning id';
  ins_root   constant text :=
    'insert into public.messages (channel_id, user_id, content, thread_root_id) values (%L, %L, %L, %L) returning id';
begin
  -- Accepted first, so a refusal below cannot be "everything is refused".
  perform pg_temp.chat_ok('B1 the owner posts on the Board',
    pg_temp.chat_as(v_owner, format(ins, v_board, v_owner, 'chat-check: owner post')), 'ok 1');
  perform pg_temp.chat_ok('B2 an admin posts on the Board',
    pg_temp.chat_as(v_admin, format(ins, v_board, v_admin, 'chat-check: admin post')), 'ok 1');
  select id into v_post from public.messages
   where channel_id = v_board and content = 'chat-check: owner post';
  perform pg_temp.chat_ok('B3 a member replies under a Board post',
    pg_temp.chat_as(v_member, format(ins_root, v_board, v_member, 'chat-check: member reply', v_post)), 'ok 1');
  perform pg_temp.chat_ok('B4 an officer replies under a Board post',
    pg_temp.chat_as(v_admin, format(ins_root, v_board, v_admin, 'chat-check: admin reply', v_post)), 'ok 1');
  perform pg_temp.chat_ok('B5 a member writes in the Lounge',
    pg_temp.chat_as(v_member, format(ins, v_lounge, v_member, 'chat-check: member lounge')), 'ok 1');
  perform pg_temp.chat_ok('B6 an admin writes in Officers',
    pg_temp.chat_as(v_admin, format(ins, v_off, v_admin, 'chat-check: admin officers')), 'ok 1');
  perform pg_temp.chat_ok('B7 a member reads the Board post and its replies',
    pg_temp.chat_read(v_member, format(
      'select count(*) from public.messages where channel_id = %L', v_board)), '4');

  -- Refused.
  perform pg_temp.chat_ok('B8 a member''s top-level Board post is refused',
    pg_temp.chat_as(v_member, format(ins, v_board, v_member, 'chat-check: member board')), '42501');
  perform pg_temp.chat_ok('B9 a mod''s top-level Board post is refused (officers = owner, admin)',
    pg_temp.chat_as(v_mod, format(ins, v_board, v_mod, 'chat-check: mod board')), '42501');
  perform pg_temp.chat_ok('B10 kind = poll is refused',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, kind) values (%L, %L, %L, %L)',
      v_lounge, v_member, 'chat-check: poll', 'poll')), '42501');
  perform pg_temp.chat_ok('B11 media in a club room is refused',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, media_url, media_kind) values (%L, %L, %L, %L, %L)',
      v_lounge, v_member, 'chat-check: media', 'messages/' || v_lounge || '/check.jpg', 'image')), '42501');
  perform pg_temp.chat_ok('B12 a forged removed_at is refused',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, removed_at) values (%L, %L, %L, now())',
      v_lounge, v_member, 'chat-check: forged')), '42501');
  perform pg_temp.chat_ok('B13 a forged removed_by or removed_reason is refused',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, removed_by) values (%L, %L, %L, %L)',
      v_lounge, v_member, 'chat-check: forged by', v_owner))
    || pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, removed_reason) values (%L, %L, %L, %L)',
      v_lounge, v_member, 'chat-check: forged reason', 'spam')), '4250142501');
  perform pg_temp.chat_ok('B14 a reply to a post that does not exist is refused',
    pg_temp.chat_as(v_member, format(ins_root, v_board, v_member, 'chat-check: no root', gen_random_uuid())), '42501');
  perform pg_temp.chat_ok('B15 a Board post sent as the root of a Lounge message is refused',
    pg_temp.chat_as(v_member, format(ins_root, v_lounge, v_member, 'chat-check: root in lounge', v_post)), '42501');
  select id into v_reply from public.messages
   where channel_id = v_board and content = 'chat-check: member reply';
  perform pg_temp.chat_ok('B16 a reply under a reply is refused (the root is a top-level post)',
    pg_temp.chat_as(v_member, format(ins_root, v_board, v_member, 'chat-check: nested', v_reply)), '42501');
  select id into v_gone from public.messages
   where channel_id = v_board and content = 'chat-check: admin post';
  update public.messages
     set removed_at = now(), removed_by = v_owner, removed_reason = 'chat-check'
   where id = v_gone;
  perform pg_temp.chat_ok('B17 a reply under a removed post is refused',
    pg_temp.chat_as(v_member, format(ins_root, v_board, v_member, 'chat-check: under removed', v_gone)), '42501');
  perform pg_temp.chat_ok('B18 a member cannot write in Officers',
    pg_temp.chat_as(v_member, format(ins, v_off, v_member, 'chat-check: member officers')), '42501');
  perform pg_temp.chat_ok('B19 someone outside the club cannot write in the Lounge',
    pg_temp.chat_as(v_outsider, format(ins, v_lounge, v_outsider, 'chat-check: outsider')), '42501');
  perform pg_temp.chat_ok('B20 a message in someone else''s name is refused',
    pg_temp.chat_as(v_member, format(ins, v_lounge, v_owner, 'chat-check: not me')), '42501');
  perform pg_temp.chat_ok('B21 no refused message was stored',
    (select count(*)::text from public.messages m
       join public.channels c on c.id = m.channel_id
      where c.org_id = pg_temp.chat_id('club')), '6');

  -- Deleting a Board post takes its replies with it (thread_root_id cascades).
  perform pg_temp.chat_ok('B22 the owner deletes their own Board post',
    pg_temp.chat_as(v_owner, format('delete from public.messages where id = %L', v_post)), 'ok 1');
  perform pg_temp.chat_ok('B23 its replies went with it',
    (select count(*)::text from public.messages where thread_root_id = v_post), '0');

  -- The member's own club-room row: "set my accepted_at to null, then delete
  -- my pending row" no longer works.
  perform pg_temp.chat_ok('B24 a member can still update their own row (accepted_at)',
    pg_temp.chat_as(v_member, format(
      'update public.channel_members set accepted_at = null where channel_id = %L and user_id = %L',
      v_lounge, v_member)), 'ok 1');
  perform pg_temp.chat_ok('B25 but the delete of that pending club-room row removes nothing',
    pg_temp.chat_as(v_member, format(
      'delete from public.channel_members where channel_id = %L and user_id = %L',
      v_lounge, v_member)), 'ok 0');
  perform pg_temp.chat_ok('B26 the row is still there',
    pg_temp.chat_row(v_lounge, v_member), 'yes');
  update public.channel_members set accepted_at = now()
   where channel_id = v_lounge and user_id = v_member;
end $$;

-- B'. DMs keep working under the restated messages_insert_member ---------------
do $$
declare
  v_member   uuid := pg_temp.chat_id('member');
  v_outsider uuid := pg_temp.chat_id('outsider');
  v_dm       uuid := gen_random_uuid();
  v_first    uuid;
begin
  insert into public.channels (id, type, name) values (v_dm, 'dm', '');
  insert into public.channel_members (channel_id, user_id, role, accepted_at)
  values (v_dm, v_member, 'member', now()), (v_dm, v_outsider, 'member', null);
  perform pg_temp.chat_ok('B27 a dm has no kind, even when one is sent',
    (select coalesce(kind, '(null)') from public.channels where id = v_dm), '(null)');
  insert into public.channels (type, name, kind) values ('group', 'chat-check group', 'room');
  perform pg_temp.chat_ok('B28 a group sent with a kind is stored without one',
    (select coalesce(kind, '(null)') from public.channels where name = 'chat-check group'), '(null)');

  perform pg_temp.chat_ok('B29 a DM message is accepted',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content) values (%L, %L, %L) returning id',
      v_dm, v_member, 'chat-check: dm')), 'ok 1');
  perform pg_temp.chat_ok('B30 a DM photo is still accepted (media is off in club rooms only)',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, media_url, media_kind) values (%L, %L, %L, %L, %L) returning id',
      v_dm, v_member, '', 'messages/' || v_dm || '/check.jpg', 'image')), 'ok 1');
  select id into v_first from public.messages
   where channel_id = v_dm and content = 'chat-check: dm';
  perform pg_temp.chat_ok('B31 a DM with kind = poll is refused',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, kind) values (%L, %L, %L, %L)',
      v_dm, v_member, 'chat-check: dm poll', 'poll')), '42501');
  perform pg_temp.chat_ok('B32 a DM with a thread root is refused',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, thread_root_id) values (%L, %L, %L, %L)',
      v_dm, v_member, 'chat-check: dm root', v_first)), '42501');
  perform pg_temp.chat_ok('B33 a DM with a forged removal is refused',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, removed_at) values (%L, %L, %L, now())',
      v_dm, v_member, 'chat-check: dm forged')), '42501');
  perform pg_temp.chat_ok('B34 a pending DM request can still be declined (own pending row deleted)',
    pg_temp.chat_as(v_outsider, format(
      'delete from public.channel_members where channel_id = %L and user_id = %L',
      v_dm, v_outsider)), 'ok 1');
end $$;

-- C. Event rooms ------------------------------------------------------------------
do $$
declare
  v_club     uuid := pg_temp.chat_id('club');
  v_owner    uuid := pg_temp.chat_id('owner');
  v_admin    uuid := pg_temp.chat_id('admin');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_outsider uuid := pg_temp.chat_id('outsider');
  v_goner    uuid := pg_temp.chat_id('goner');
  v_event    uuid := gen_random_uuid();
  v_room     uuid;
  -- PUT /api/events/[id]/rsvp: supabase.from("rsvps").upsert(..., onConflict event_id,user_id)
  rsvp       constant text :=
    'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
     on conflict (event_id, user_id) do update
       set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status';
begin
  perform pg_temp.chat_keep('event', v_event);

  -- POST /api/events at SQL level: the route inserts with the service role.
  perform pg_temp.chat_ok('C1 an event is created (the statement POST /api/events issues)',
    pg_temp.chat_service(format(
      'insert into public.events (id, creator_id, org_id, title, description, location, starts_at, ends_at)
       values (%L, %L, %L, %L, %L, %L, now() + interval ''2 days'', now() + interval ''2 days 2 hours'')
       returning id',
      v_event, v_admin, v_club, 'Chat Check Formal', '', 'Campus Center')), 'ok 1');
  perform pg_temp.chat_ok('C2 its room appears: private, kind event, named after it, position 1000',
    (select concat_ws(':', c.type, c.kind, c.name, c.is_private, c.position, c.org_id = v_club)
       from public.channels c where c.event_id = v_event),
    'org_channel:event:Chat Check Formal:t:1000:t');
  select id into v_room from public.channels where event_id = v_event;
  perform pg_temp.chat_keep('room', v_room);
  perform pg_temp.chat_ok('C3 with the officers'' rows (owner and both admins), and nobody else''s',
    (select string_agg(u.name, ', ' order by u.name)
       from public.channel_members cm join public.users u on u.id = cm.user_id
      where cm.channel_id = v_room),
    'Chat Check admin, Chat Check goner, Chat Check owner');

  -- An RSVP by someone who is not in the club.
  perform pg_temp.chat_ok('C4 an RSVP by a non-member succeeds',
    pg_temp.chat_as(v_outsider, format(rsvp, v_event, v_outsider, 'going')), 'ok 1');
  perform pg_temp.chat_ok('C5 and writes no row on the event room',
    pg_temp.chat_row(v_room, v_outsider), 'no');
  perform pg_temp.chat_ok('C6 a non-member with an RSVP does not see the event room',
    pg_temp.chat_read(v_outsider, format('select count(*) from public.channels where id = %L', v_room))
    || '/' || pg_temp.chat_read(v_outsider, format('select public.can_view_org_channel(%L, %L)', v_room, v_outsider)),
    '0/false');

  -- going -> no -> going, through PostgREST as the member.
  perform pg_temp.chat_ok('C7 a member without an RSVP does not see the event room',
    pg_temp.chat_read(v_member, format('select count(*) from public.channels where id = %L', v_room)), '0');
  perform pg_temp.chat_ok('C8 the member says Going',
    pg_temp.chat_as(v_member, format(rsvp, v_event, v_member, 'going')), 'ok 1');
  perform pg_temp.chat_ok('C9 and holds a row on the event room',
    pg_temp.chat_row(v_room, v_member), 'yes');
  perform pg_temp.chat_ok('C10 the member changes to no (a direct PostgREST update)',
    pg_temp.chat_as(v_member, format(
      'update public.rsvps set status = %L where event_id = %L and user_id = %L',
      'no', v_event, v_member)), 'ok 1');
  perform pg_temp.chat_ok('C11 and the row is gone',
    pg_temp.chat_row(v_room, v_member), 'no');
  perform pg_temp.chat_ok('C12 the member says Going again',
    pg_temp.chat_as(v_member, format(rsvp, v_event, v_member, 'going')), 'ok 1');
  perform pg_temp.chat_ok('C13 and the row is back',
    pg_temp.chat_row(v_room, v_member), 'yes');
  perform pg_temp.chat_ok('C14 Maybe keeps the row',
    pg_temp.chat_as(v_member, format(rsvp, v_event, v_member, 'maybe'))
    || '/' || pg_temp.chat_row(v_room, v_member), 'ok 1/yes');
  perform pg_temp.chat_ok('C15 taking the RSVP back (DELETE) removes the row',
    pg_temp.chat_as(v_member, format(
      'delete from public.rsvps where event_id = %L and user_id = %L', v_event, v_member))
    || '/' || pg_temp.chat_row(v_room, v_member), 'ok 1/no');
  perform pg_temp.chat_ok('C16 Going once more, for the cases below',
    pg_temp.chat_as(v_member, format(rsvp, v_event, v_member, 'going'))
    || '/' || pg_temp.chat_row(v_room, v_member), 'ok 1/yes');
end $$;

-- M. An RSVP moved to another event (any update of an RSVP fires the trigger) --------
-- A student holds UPDATE on rsvps.event_id and rsvps_update_own lets them
-- move their own RSVP. The row has to follow the RSVP: "OLD leaves, NEW
-- arrives". This block ends where block C ended: the member Going on the
-- first event, the non-member's RSVP on it, the second event cancelled.
do $$
declare
  v_club     uuid := pg_temp.chat_id('club');
  v_owner    uuid := pg_temp.chat_id('owner');
  v_admin    uuid := pg_temp.chat_id('admin');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_outsider uuid := pg_temp.chat_id('outsider');
  v_event    uuid := pg_temp.chat_id('event');
  v_room     uuid := pg_temp.chat_id('room');
  v_event2   uuid := gen_random_uuid();
  v_room2    uuid;
  rsvp       constant text :=
    'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
     on conflict (event_id, user_id) do update
       set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status';
  move_to    constant text :=
    'update public.rsvps set event_id = %L where event_id = %L and user_id = %L';
begin
  perform pg_temp.chat_ok('M1 a second event is created; the member is not in its room',
    pg_temp.chat_service(format(
      'insert into public.events (id, creator_id, org_id, title, description, location, starts_at, ends_at)
       values (%L, %L, %L, %L, %L, %L, now() + interval ''5 days'', now() + interval ''5 days 2 hours'')',
      v_event2, v_owner, v_club, 'Chat Check Second Night', '', 'Campus Center'))
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channel_members cm join public.channels c on c.id = cm.channel_id
        where c.event_id = %L and cm.user_id = %L', v_event2, v_member)), 'ok 1/0');
  select id into v_room2 from public.channels where event_id = v_event2;

  perform pg_temp.chat_ok('M2 the member moves their RSVP to the second event (event_id only, no status in the SET list)',
    pg_temp.chat_as(v_member, format(move_to, v_event2, v_event, v_member)), 'ok 1');
  perform pg_temp.chat_ok('M3 the row followed: gone from the first room, there on the second',
    pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room2, v_member), 'noyes');
  perform pg_temp.chat_ok('M4 and the first room is closed to them: not seen, not written in',
    pg_temp.chat_read(v_member, format('select count(*) from public.channels where id = %L', v_room))
    || '/' || pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content) values (%L, %L, %L) returning id',
      v_room, v_member, 'chat-check: moved away')), '0/42501');
  perform pg_temp.chat_ok('M5 moved back with a status in the SET list (maybe)',
    pg_temp.chat_as(v_member, format(
      'update public.rsvps set event_id = %L, status = %L where event_id = %L and user_id = %L',
      v_event, 'maybe', v_event2, v_member))
    || '/' || pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room2, v_member), 'ok 1/yesno');
  perform pg_temp.chat_ok('M6 an update that changes neither the event nor the status keeps the row',
    pg_temp.chat_as(v_member, format(
      'update public.rsvps set created_at = now() where event_id = %L and user_id = %L', v_event, v_member))
    || '/' || pg_temp.chat_row(v_room, v_member), 'ok 1/yes');
  perform pg_temp.chat_ok('M7 moved with status no: no row on either room',
    pg_temp.chat_as(v_member, format(
      'update public.rsvps set event_id = %L, status = %L where event_id = %L and user_id = %L',
      v_event2, 'no', v_event, v_member))
    || '/' || pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room2, v_member), 'ok 1/nono');
  perform pg_temp.chat_ok('M8 back on the first event, Going: the row is there, and only there',
    pg_temp.chat_as(v_member, format(
      'update public.rsvps set event_id = %L, status = %L where event_id = %L and user_id = %L',
      v_event, 'going', v_event2, v_member))
    || '/' || pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room2, v_member), 'ok 1/yesno');

  -- An officer keeps both rows wherever their RSVP goes.
  perform pg_temp.chat_ok('M9 an admin says Going, moves the RSVP, takes it back: both rows stay',
    pg_temp.chat_as(v_admin, format(rsvp, v_event, v_admin, 'going'))
    || '/' || pg_temp.chat_as(v_admin, format(move_to, v_event2, v_event, v_admin))
    || '/' || pg_temp.chat_row(v_room, v_admin) || pg_temp.chat_row(v_room2, v_admin)
    || '/' || pg_temp.chat_as(v_admin, format(
      'delete from public.rsvps where event_id = %L and user_id = %L', v_event2, v_admin))
    || '/' || pg_temp.chat_row(v_room, v_admin) || pg_temp.chat_row(v_room2, v_admin),
    'ok 1/ok 1/yesyes/ok 1/yesyes');

  -- The non-member of C4 moves theirs: nothing to remove, nothing to add.
  perform pg_temp.chat_ok('M10 a non-member moves their RSVP there and back: no row on either room',
    pg_temp.chat_as(v_outsider, format(move_to, v_event2, v_event, v_outsider))
    || '/' || pg_temp.chat_row(v_room, v_outsider) || pg_temp.chat_row(v_room2, v_outsider)
    || '/' || pg_temp.chat_as(v_outsider, format(move_to, v_event, v_event2, v_outsider))
    || '/' || pg_temp.chat_row(v_room, v_outsider) || pg_temp.chat_row(v_room2, v_outsider),
    'ok 1/nono/ok 1/nono');

  -- A student cannot give their RSVP to someone else (rsvps_update_own); the
  -- service role can, and the rows follow the person.
  perform pg_temp.chat_ok('M11 a member cannot hand their RSVP to another person',
    pg_temp.chat_as(v_member, format(
      'update public.rsvps set user_id = %L where event_id = %L and user_id = %L',
      v_mod, v_event, v_member))
    || '/' || pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room, v_mod), '42501/yesno');
  perform pg_temp.chat_ok('M12 user_id changed by the service role: the old holder leaves, the new one arrives',
    pg_temp.chat_service(format(
      'update public.rsvps set user_id = %L where event_id = %L and user_id = %L',
      v_mod, v_event, v_member))
    || '/' || pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room, v_mod), 'ok 1/noyes');
  perform pg_temp.chat_ok('M13 and changed back: as before',
    pg_temp.chat_service(format(
      'update public.rsvps set user_id = %L where event_id = %L and user_id = %L',
      v_member, v_event, v_mod))
    || '/' || pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room, v_mod), 'ok 1/yesno');

  perform pg_temp.chat_ok('M14 the second event is cancelled: its room and rows go, the first room is untouched',
    pg_temp.chat_as(v_owner, format('delete from public.events where id = %L returning id', v_event2))
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channels where id = %L', v_room2))
    || '/' || pg_temp.chat_get(format(
      'select status from public.rsvps where event_id = %L and user_id = %L', v_event, v_member))
    || '/' || pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room, v_owner),
    'ok 1/0/going/yesyes');
end $$;

-- C'. Inside an event room; the closed room; officers; a new title ------------------
do $$
declare
  v_club     uuid := pg_temp.chat_id('club');
  v_owner    uuid := pg_temp.chat_id('owner');
  v_admin    uuid := pg_temp.chat_id('admin');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_outsider uuid := pg_temp.chat_id('outsider');
  v_event    uuid := pg_temp.chat_id('event');
  v_room     uuid := pg_temp.chat_id('room');
  v_old      uuid := gen_random_uuid();
  v_oldroom  uuid;
  v_first    uuid;
  ins        constant text :=
    'insert into public.messages (channel_id, user_id, content) values (%L, %L, %L) returning id';
  rsvp       constant text :=
    'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
     on conflict (event_id, user_id) do update
       set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status';
begin
  perform pg_temp.chat_ok('C17 the member with a row sees the event room and writes in it',
    pg_temp.chat_read(v_member, format('select count(*) from public.channels where id = %L', v_room))
    || '/' || pg_temp.chat_as(v_member, format(ins, v_room, v_member, 'chat-check: event hello')),
    '1/ok 1');
  perform pg_temp.chat_ok('C18 an officer writes in it without an RSVP',
    pg_temp.chat_as(v_owner, format(ins, v_room, v_owner, 'chat-check: event officer')), 'ok 1');
  select id into v_first from public.messages
   where channel_id = v_room and content = 'chat-check: event hello';
  perform pg_temp.chat_ok('C19 a thread root in an event room is refused (replies are for the Board)',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, thread_root_id) values (%L, %L, %L, %L)',
      v_room, v_member, 'chat-check: event root', v_first)), '42501');
  perform pg_temp.chat_ok('C20 a member without an RSVP (the mod) cannot read or write in it',
    pg_temp.chat_read(v_mod, format('select count(*) from public.messages where channel_id = %L', v_room))
    || '/' || pg_temp.chat_as(v_mod, format(ins, v_room, v_mod, 'chat-check: event mod')),
    '0/42501');
  perform pg_temp.chat_ok('C21 the non-member with an RSVP cannot read or write in it',
    pg_temp.chat_read(v_outsider, format('select count(*) from public.messages where channel_id = %L', v_room))
    || '/' || pg_temp.chat_as(v_outsider, format(ins, v_room, v_outsider, 'chat-check: event outsider')),
    '0/42501');

  -- Officers keep their row whatever their RSVP says.
  perform pg_temp.chat_ok('C22 an admin says Going, then no: the row stays',
    pg_temp.chat_as(v_admin, format(rsvp, v_event, v_admin, 'going'))
    || '/' || pg_temp.chat_as(v_admin, format(
         'update public.rsvps set status = %L where event_id = %L and user_id = %L',
         'no', v_event, v_admin))
    || '/' || pg_temp.chat_row(v_room, v_admin), 'ok 1/ok 1/yes');
  perform pg_temp.chat_ok('C23 the admin deletes the RSVP: the row stays',
    pg_temp.chat_as(v_admin, format(
      'delete from public.rsvps where event_id = %L and user_id = %L', v_event, v_admin))
    || '/' || pg_temp.chat_row(v_room, v_admin), 'ok 1/yes');

  -- A new title renames the room (PATCH /api/events/[id] updates with the
  -- service role); a long one is cut at 80 characters.
  perform pg_temp.chat_ok('C24 a new title renames the room',
    pg_temp.chat_service(format(
      'update public.events set title = %L where id = %L', 'Chat Check Fall Formal', v_event))
    || '/' || pg_temp.chat_get(format('select name from public.channels where id = %L', v_room)),
    'ok 1/Chat Check Fall Formal');
  perform pg_temp.chat_ok('C25 a 120-character title gives an 80-character room name',
    pg_temp.chat_service(format(
      'update public.events set title = %L where id = %L', repeat('x', 120), v_event))
    || '/' || pg_temp.chat_get(format('select length(name) from public.channels where id = %L', v_room)),
    'ok 1/80');
  perform pg_temp.chat_ok('C26 an edit that does not touch the title leaves the room alone',
    pg_temp.chat_service(format(
      'update public.events set location = %L where id = %L', 'Somewhere else', v_event))
    || '/' || pg_temp.chat_get(format('select length(name) from public.channels where id = %L', v_room)),
    'ok 1/80');

  -- The closed room: an event that ended 10 days ago.
  perform pg_temp.chat_keep('old_event', v_old);
  perform pg_temp.chat_ok('C27 an event that ended 10 days ago is written',
    pg_temp.chat_service(format(
      'insert into public.events (id, creator_id, org_id, title, description, location, starts_at, ends_at)
       values (%L, %L, %L, %L, %L, %L, now() - interval ''10 days 2 hours'', now() - interval ''10 days'')',
      v_old, v_admin, v_club, 'Chat Check Old Night', '', 'Campus Center')), 'ok 1');
  select id into v_oldroom from public.channels where event_id = v_old;
  perform pg_temp.chat_keep('old_room', v_oldroom);
  perform pg_temp.chat_ok('C28 a late RSVP still gives the member a row (accepted for v1)',
    pg_temp.chat_as(v_member, format(rsvp, v_old, v_member, 'going'))
    || '/' || pg_temp.chat_row(v_oldroom, v_member), 'ok 1/yes');
  perform pg_temp.chat_ok('C29 the member reads the closed room',
    pg_temp.chat_read(v_member, format('select count(*) from public.channels where id = %L', v_oldroom)), '1');
  perform pg_temp.chat_ok('C30 a message in the closed event room is refused, for a member',
    pg_temp.chat_as(v_member, format(ins, v_oldroom, v_member, 'chat-check: closed member')), '42501');
  perform pg_temp.chat_ok('C31 and for an officer',
    pg_temp.chat_as(v_owner, format(ins, v_oldroom, v_owner, 'chat-check: closed officer')), '42501');
  perform pg_temp.chat_ok('C32 can_post_org_channel says so: open room true, closed room false, no room false',
    concat_ws('/',
      pg_temp.chat_read(v_member, format('select public.can_post_org_channel(%L, %L, null)', v_room, v_member)),
      pg_temp.chat_read(v_member, format('select public.can_post_org_channel(%L, %L, null)', v_oldroom, v_member)),
      pg_temp.chat_read(v_member, format('select public.can_post_org_channel(%L, %L, null)', gen_random_uuid(), v_member)),
      pg_temp.chat_read(v_member, format('select public.can_post_org_channel(%L, %L, null)', v_room, v_owner))),
    'true/false/false/false');
end $$;

-- T. The 7 days do not depend on the session's time zone ------------------------------
-- "ends_at + interval '7 days'" is day arithmetic in the session's zone, and
-- a PostgREST client picks that zone (Prefer: timezone=). The three functions
-- that compute the window pin TimeZone to UTC. The session here runs in a
-- made-up zone whose clocks went FORWARD one hour three days ago: there 7
-- days are 167 hours. The event ended 167 hours 30 minutes ago, so its chat
-- is open for another half hour. The block leaves the zone as it found it.
do $$
declare
  v_club   uuid := pg_temp.chat_id('club');
  v_owner  uuid := pg_temp.chat_id('owner');
  v_member uuid := pg_temp.chat_id('member');
  v_mod    uuid := pg_temp.chat_id('mod');
  v_tevent uuid := gen_random_uuid();
  v_troom  uuid;
  zone_was text := current_setting('TimeZone');
  d        int  := extract(doy from (now() at time zone 'UTC') - interval '3 days')::int - 1;
  zone     text;
  rsvp     constant text :=
    'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
     on conflict (event_id, user_id) do update
       set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status';
  role_to  constant text :=
    'update public.org_members set role = %L where org_id = %L and user_id = %L';
begin
  -- POSIX form: standard time = UTC, summer time from day d to day d + 100.
  zone := 'CHK0CHD,' || d || '/0,' || ((d + 100) % 365) || '/0';

  perform pg_temp.chat_ok('T1 an event that ended 167 h 30 min ago is written; the member says Going and holds its row',
    pg_temp.chat_service(format(
      'insert into public.events (id, creator_id, org_id, title, description, location, starts_at, ends_at)
       values (%L, %L, %L, %L, %L, %L, now() - interval ''169 hours 30 minutes'',
               now() - interval ''167 hours 30 minutes'')',
      v_tevent, v_owner, v_club, 'Chat Check Last Hour', '', 'Campus Center'))
    || '/' || pg_temp.chat_as(v_member, format(rsvp, v_tevent, v_member, 'going'))
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channel_members cm join public.channels c on c.id = cm.channel_id
        where c.event_id = %L and cm.user_id = %L', v_tevent, v_member)), 'ok 1/ok 1/1');
  select id into v_troom from public.channels where event_id = v_tevent;

  perform set_config('TimeZone', zone, true);
  perform pg_temp.chat_ok('T2 in this session 7 days after its end is already past; 168 hours after it is not',
    pg_temp.chat_get(format(
      'select (e.ends_at + interval ''7 days'' > now())::text || ''/''
              || (e.ends_at + interval ''168 hours'' > now())::text
         from public.events e where e.id = %L', v_tevent)), 'false/true');
  perform pg_temp.chat_ok('T3 can_post_org_channel still says open, and the message is accepted',
    pg_temp.chat_read(v_member, format('select public.can_post_org_channel(%L, %L, null)', v_troom, v_member))
    || '/' || pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content) values (%L, %L, %L) returning id',
      v_troom, v_member, 'chat-check: last half hour')), 'true/ok 1');
  perform pg_temp.chat_ok('T4 a new officer gets this room (chat_org_members_rooms); back to member, it goes',
    pg_temp.chat_service(format(role_to, 'admin', v_club, v_mod))
    || '/' || pg_temp.chat_row(v_troom, v_mod)
    || '/' || pg_temp.chat_service(format(role_to, 'member', v_club, v_mod))
    || '/' || pg_temp.chat_row(v_troom, v_mod), 'ok 1/yes/ok 1/no');
  delete from public.channels where id = v_troom;
  perform pg_temp.chat_ok('T5 its room is lost; chat_repair_club makes it again, with the rows of the member and the owner',
    pg_temp.chat_service(format('select public.chat_repair_club(%L)', v_club))
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channel_members cm join public.channels c on c.id = cm.channel_id
        where c.event_id = %L and c.kind = ''event'' and cm.user_id in (%L, %L)',
      v_tevent, v_member, v_owner)), 'ok 1/2');
  perform set_config('TimeZone', zone_was, true);

  perform pg_temp.chat_ok('T6 the zone is back; the event is cancelled and its room is gone',
    current_setting('TimeZone')
    || '/' || pg_temp.chat_as(v_owner, format('delete from public.events where id = %L returning id', v_tevent))
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channels where event_id = %L', v_tevent)),
    zone_was || '/ok 1/0');
end $$;

-- C''. member -> admin -> member; a cancelled event -----------------------------------
do $$
declare
  v_club     uuid := pg_temp.chat_id('club');
  v_owner    uuid := pg_temp.chat_id('owner');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_leaver   uuid := pg_temp.chat_id('leaver');
  v_room     uuid := pg_temp.chat_id('room');
  v_oldroom  uuid := pg_temp.chat_id('old_room');
  v_cancel   uuid := gen_random_uuid();
  v_croom    uuid;
  role_to    constant text :=
    'update public.org_members set role = %L where org_id = %L and user_id = %L';
  ins        constant text :=
    'insert into public.messages (channel_id, user_id, content) values (%L, %L, %L) returning id';
  rsvp       constant text :=
    'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
     on conflict (event_id, user_id) do update
       set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status';
begin
  -- The mod holds no RSVP anywhere; the member holds Going on the open event
  -- and on the old one.
  perform pg_temp.chat_ok('C33 before: the mod is in no event room',
    pg_temp.chat_row(v_room, v_mod) || pg_temp.chat_row(v_oldroom, v_mod), 'nono');
  perform pg_temp.chat_ok('C34 the mod becomes an admin',
    pg_temp.chat_service(format(role_to, 'admin', v_club, v_mod)), 'ok 1');
  perform pg_temp.chat_ok('C35 and is in the open event room, not in the one past its 7 days',
    pg_temp.chat_row(v_room, v_mod) || pg_temp.chat_row(v_oldroom, v_mod), 'yesno');
  perform pg_temp.chat_ok('C36 back to member',
    pg_temp.chat_service(format(role_to, 'member', v_club, v_mod)), 'ok 1');
  perform pg_temp.chat_ok('C37 and out of the event room again (no RSVP)',
    pg_temp.chat_row(v_room, v_mod) || pg_temp.chat_row(v_oldroom, v_mod), 'nono');
  perform pg_temp.chat_ok('C38 the member becomes an admin and a member again',
    pg_temp.chat_service(format(role_to, 'admin', v_club, v_member))
    || '/' || pg_temp.chat_service(format(role_to, 'member', v_club, v_member)), 'ok 1/ok 1');
  perform pg_temp.chat_ok('C39 and keeps the rooms they hold an RSVP for',
    pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_oldroom, v_member), 'yesyes');
  perform pg_temp.chat_ok('C40 the public rooms were never touched by a role change',
    pg_temp.chat_row(pg_temp.chat_id('lounge'), v_mod) || pg_temp.chat_row(pg_temp.chat_id('board'), v_mod)
    || pg_temp.chat_row(pg_temp.chat_id('officers'), v_mod), 'yesyesno');

  -- An event with 2 RSVPs and 3 room messages is cancelled.
  perform pg_temp.chat_ok('C41 a second event is created',
    pg_temp.chat_service(format(
      'insert into public.events (id, creator_id, org_id, title, description, location, starts_at, ends_at)
       values (%L, %L, %L, %L, %L, %L, now() + interval ''3 days'', now() + interval ''3 days 2 hours'')',
      v_cancel, v_owner, v_club, 'Chat Check Cancelled Night', '', 'Campus Center')), 'ok 1');
  select id into v_croom from public.channels where event_id = v_cancel;
  perform pg_temp.chat_ok('C42 two members RSVP (going, maybe)',
    pg_temp.chat_as(v_member, format(rsvp, v_cancel, v_member, 'going'))
    || '/' || pg_temp.chat_as(v_leaver, format(rsvp, v_cancel, v_leaver, 'maybe')), 'ok 1/ok 1');
  perform pg_temp.chat_ok('C43 three messages are written in its room',
    pg_temp.chat_as(v_member, format(ins, v_croom, v_member, 'chat-check: cancel 1'))
    || '/' || pg_temp.chat_as(v_leaver, format(ins, v_croom, v_leaver, 'chat-check: cancel 2'))
    || '/' || pg_temp.chat_as(v_owner, format(ins, v_croom, v_owner, 'chat-check: cancel 3')),
    'ok 1/ok 1/ok 1');
  perform pg_temp.chat_ok('C44 before: 1 room, 5 rows (3 officers, 2 RSVPs), 3 messages, 2 RSVPs',
    pg_temp.chat_get(format(
      'select concat_ws(''/'',
         (select count(*) from public.channels where event_id = %1$L),
         (select count(*) from public.channel_members where channel_id = %2$L),
         (select count(*) from public.messages where channel_id = %2$L),
         (select count(*) from public.rsvps where event_id = %1$L))', v_cancel, v_croom)),
    '1/5/3/2');
  -- DELETE /api/events/[id] at SQL level: the route deletes as the signed-in
  -- officer (events_delete_manager), with RETURNING id.
  perform pg_temp.chat_ok('C45 a member cannot cancel it',
    pg_temp.chat_as(v_member, format(
      'delete from public.events where id = %L returning id', v_cancel)), 'ok 0');
  perform pg_temp.chat_ok('C46 the owner cancels it (the statement DELETE /api/events/[id] issues): no error',
    pg_temp.chat_as(v_owner, format(
      'delete from public.events where id = %L returning id', v_cancel)), 'ok 1');
  perform pg_temp.chat_ok('C47 after: event, room, rows, messages and RSVPs are gone',
    pg_temp.chat_get(format(
      'select concat_ws(''/'',
         (select count(*) from public.events where id = %1$L),
         (select count(*) from public.channels where event_id = %1$L or id = %2$L),
         (select count(*) from public.channel_members where channel_id = %2$L),
         (select count(*) from public.messages where channel_id = %2$L),
         (select count(*) from public.rsvps where event_id = %1$L))', v_cancel, v_croom)),
    '0/0/0/0/0');
  perform pg_temp.chat_ok('C48 the other event and its room are untouched',
    pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room, v_owner), 'yesyes');
end $$;

-- D. Leaving, re-joining, a removal, the repair ------------------------------------
do $$
declare
  v_club   uuid := pg_temp.chat_id('club');
  v_owner  uuid := pg_temp.chat_id('owner');
  v_member uuid := pg_temp.chat_id('member');
  v_leaver uuid := pg_temp.chat_id('leaver');
  v_event  uuid := pg_temp.chat_id('event');
  v_room   uuid := pg_temp.chat_id('room');
  v_lounge uuid := pg_temp.chat_id('lounge');
  v_board  uuid := pg_temp.chat_id('board');
  v_off    uuid := pg_temp.chat_id('officers');
  v_print  text;
  rows_of  constant text :=
    'select count(*) from public.channel_members cm
       join public.channels c on c.id = cm.channel_id
      where c.org_id = %L and cm.user_id = %L';
  rsvp     constant text :=
    'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
     on conflict (event_id, user_id) do update
       set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status';
begin
  perform pg_temp.chat_ok('D1 the leaver says Going: rows on Lounge, Board and the event room',
    pg_temp.chat_as(v_leaver, format(rsvp, v_event, v_leaver, 'going'))
    || '/' || pg_temp.chat_get(format(rows_of, v_club, v_leaver)), 'ok 1/3');

  -- Leaving: the student deletes their own membership row.
  perform pg_temp.chat_ok('D2 the leaver leaves the club',
    pg_temp.chat_as(v_leaver, format(
      'delete from public.org_members where org_id = %L and user_id = %L', v_club, v_leaver)), 'ok 1');
  perform pg_temp.chat_ok('D3 after leaving: every room row in the club is gone',
    pg_temp.chat_get(format(rows_of, v_club, v_leaver)), '0');
  perform pg_temp.chat_ok('D4 a voluntary leave keeps the RSVP (it stays on their calendar)',
    pg_temp.chat_get(format(
      'select status from public.rsvps where event_id = %L and user_id = %L', v_event, v_leaver)), 'going');
  perform pg_temp.chat_ok('D5 and the event room is closed to them',
    pg_temp.chat_read(v_leaver, format('select count(*) from public.channels where org_id = %L', v_club)), '0');

  perform pg_temp.chat_ok('D6 the leaver re-joins',
    pg_temp.chat_service(format(
      'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)',
      v_club, v_leaver, 'member')), 'ok 1');
  perform pg_temp.chat_ok('D7 after re-joining: the rows are back (Lounge, Board, the event room of the kept RSVP)',
    pg_temp.chat_row(v_lounge, v_leaver) || pg_temp.chat_row(v_board, v_leaver)
    || pg_temp.chat_row(v_room, v_leaver) || pg_temp.chat_row(v_off, v_leaver), 'yesyesyesno');

  -- A removal: the route records it in org_removals, then deletes the
  -- membership row (service role). org_members_drop_club_access then deletes
  -- the RSVPs to events that have not ended, which fires chat_rsvps_room.
  perform pg_temp.chat_ok('D8 the leaver is removed by an officer',
    pg_temp.chat_service(format(
      'insert into public.org_removals (org_id, user_id, removed_by) values (%L, %L, %L)',
      v_club, v_leaver, v_owner))
    || '/' || pg_temp.chat_service(format(
      'delete from public.org_members where org_id = %L and user_id = %L', v_club, v_leaver)),
    'ok 1/ok 1');
  perform pg_temp.chat_ok('D9 a removal deletes the RSVPs and the rows',
    pg_temp.chat_get(format(
      'select count(*) from public.rsvps where event_id = %L and user_id = %L', v_event, v_leaver))
    || '/' || pg_temp.chat_get(format(rows_of, v_club, v_leaver)), '0/0');

  -- The repair. First what it is for: a room and a row go missing (the old
  -- desktop modal can still delete Officers inside the apply window).
  delete from public.channels where id = v_off;
  delete from public.channel_members where channel_id = v_lounge and user_id = v_member;
  delete from public.channel_members where channel_id = v_room and user_id = v_owner;
  delete from public.channel_members
   where channel_id = pg_temp.chat_id('old_room') and user_id = v_owner;
  perform pg_temp.chat_ok('D10 chat_repair_club runs',
    pg_temp.chat_service(format('select public.chat_repair_club(%L)', v_club)), 'ok 1');
  perform pg_temp.chat_ok('D11 and puts back the Officers room, the member''s Lounge row, the officer''s event row',
    pg_temp.chat_get(format(
      'select count(*) from public.channels where org_id = %L and kind = ''officers''', v_club))
    || pg_temp.chat_row(v_lounge, v_member) || pg_temp.chat_row(v_room, v_owner), '1yesyes');
  perform pg_temp.chat_ok('D12 it leaves the room past its 7 days alone (the officer''s missing row there stays missing)',
    pg_temp.chat_row(pg_temp.chat_id('old_room'), v_owner), 'no');
  v_print := pg_temp.chat_print(v_club);
  perform pg_temp.chat_ok('D13 chat_repair_club runs a second time',
    pg_temp.chat_service(format('select public.chat_repair_club(%L)', v_club)), 'ok 1');
  perform pg_temp.chat_ok('D14 and changes nothing: same rooms, same rows, same read marks',
    pg_temp.chat_print(v_club), v_print);
  perform pg_temp.chat_ok('D15 it refuses a student and a signed-out caller (42501), and ignores a club that does not exist',
    pg_temp.chat_as(v_owner, format('select public.chat_repair_club(%L)', v_club))
    || '/' || pg_temp.chat_run('anon', null, format('select public.chat_repair_club(%L)', v_club))
    || '/' || pg_temp.chat_service(format('select public.chat_repair_club(%L)', gen_random_uuid())),
    '42501/42501/ok 1');
end $$;

-- X. The repair also removes the rows that should not exist ---------------------------
-- What a swallowed DELETE, an RSVP moved before the trigger knew about it, or
-- a row written by hand leaves behind. The outsider never joined and the
-- leaver was removed in D8: neither is a member. The mod holds no RSVP.
do $$
declare
  v_club     uuid := pg_temp.chat_id('club');
  v_owner    uuid := pg_temp.chat_id('owner');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_outsider uuid := pg_temp.chat_id('outsider');
  v_leaver   uuid := pg_temp.chat_id('leaver');
  v_room     uuid := pg_temp.chat_id('room');
  v_oldroom  uuid := pg_temp.chat_id('old_room');
  v_lounge   uuid := pg_temp.chat_id('lounge');
  v_board    uuid := pg_temp.chat_id('board');
  v_off      uuid;
  v_print    text;
begin
  -- The Officers room of D11 is a new row: look it up.
  select id into v_off from public.channels where org_id = v_club and kind = 'officers';
  insert into public.channel_members (channel_id, user_id, role, accepted_at, last_read_at)
  values (v_lounge,  v_outsider, 'member', now(), now()),   -- not a member, a public room
         (v_off,     v_outsider, 'member', now(), now()),   -- not a member, Officers
         (v_room,    v_leaver,   'member', now(), now()),   -- not a member, an event room
         (v_room,    v_mod,      'member', now(), now()),   -- a member, no RSVP, no officer
         (v_oldroom, v_mod,      'member', now(), now());   -- the same, a room past its 7 days
  update public.channel_members set accepted_at = null
   where channel_id = v_board and user_id = v_member;

  perform pg_temp.chat_ok('X1 before: a row is access, the mod reads the event room without an RSVP',
    pg_temp.chat_read(v_mod, format('select public.can_view_org_channel(%L, %L)', v_room, v_mod)), 'true');
  perform pg_temp.chat_ok('X2 chat_repair_club runs',
    pg_temp.chat_service(format('select public.chat_repair_club(%L)', v_club)), 'ok 1');
  perform pg_temp.chat_ok('X3 the rows of the two people who are not members are gone (public room, Officers, event room)',
    pg_temp.chat_row(v_lounge, v_outsider) || pg_temp.chat_row(v_off, v_outsider)
    || pg_temp.chat_row(v_room, v_leaver), 'nonono');
  perform pg_temp.chat_ok('X4 so are the event-room rows of the member without an RSVP, open room and closed room',
    pg_temp.chat_row(v_room, v_mod) || pg_temp.chat_row(v_oldroom, v_mod)
    || '/' || pg_temp.chat_read(v_mod, format('select public.can_view_org_channel(%L, %L)', v_room, v_mod)),
    'nono/false');
  perform pg_temp.chat_ok('X5 the member''s Board row is accepted again',
    pg_temp.chat_get(format(
      'select (accepted_at is not null)::text from public.channel_members
        where channel_id = %L and user_id = %L', v_board, v_member)), 'true');
  perform pg_temp.chat_ok('X6 kept: the rows of the RSVP holder (open room, closed room), of the officer, and the mod''s public rooms',
    pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_oldroom, v_member)
    || pg_temp.chat_row(v_room, v_owner)
    || pg_temp.chat_row(v_lounge, v_mod) || pg_temp.chat_row(v_board, v_mod), 'yesyesyesyesyes');
  v_print := pg_temp.chat_print(v_club);
  perform pg_temp.chat_ok('X7 a second run changes nothing',
    pg_temp.chat_service(format('select public.chat_repair_club(%L)', v_club))
    || '/' || (pg_temp.chat_print(v_club) = v_print)::text, 'ok 1/true');
end $$;

-- D'. Rooms turning private and public; old code; the CHECKs -------------------------
do $$
declare
  v_club   uuid := pg_temp.chat_id('club');
  v_owner  uuid := pg_temp.chat_id('owner');
  v_member uuid := pg_temp.chat_id('member');
  v_extra  uuid := gen_random_uuid();
  v_club2  uuid := gen_random_uuid();
  n_rows   constant text := 'select count(*) from public.channel_members where channel_id = %L';
begin
  -- POST .../channels after the deploy always sends kind = 'room'.
  perform pg_temp.chat_ok('D16 an extra public room is created',
    pg_temp.chat_service(format(
      'insert into public.channels (id, org_id, type, kind, name, is_private, position)
       values (%L, %L, %L, %L, %L, false, 3)', v_extra, v_club, 'org_channel', 'room', 'study-group')), 'ok 1');
  perform pg_temp.chat_ok('D17 every member of the club holds a row on it (5)',
    pg_temp.chat_get(format(n_rows, v_extra)), '5');
  perform pg_temp.chat_ok('D18 turned private, its rows go',
    pg_temp.chat_service(format('update public.channels set is_private = true where id = %L', v_extra))
    || '/' || pg_temp.chat_get(format(n_rows, v_extra)), 'ok 1/0');
  perform pg_temp.chat_ok('D19 turned public again, the rows are back',
    pg_temp.chat_service(format('update public.channels set is_private = false where id = %L', v_extra))
    || '/' || pg_temp.chat_get(format(n_rows, v_extra)), 'ok 1/5');
  perform pg_temp.chat_ok('D20 an extra room created private has no rows',
    pg_temp.chat_service(format(
      'insert into public.channels (org_id, type, kind, name, is_private, position)
       values (%L, %L, %L, %L, true, 4)', v_club, 'org_channel', 'room', 'planning'))
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channel_members cm join public.channels c on c.id = cm.channel_id
        where c.org_id = %L and c.name = ''planning''', v_club)), 'ok 1/0');

  -- Old code (the apply window): club creation inserts general and
  -- announcements in one statement, with no kind.
  insert into public.orgs (id, handle, name, owner_id, join_policy, campus_id, school)
  values (v_club2, 'chat_check2_' || left(v_club2::text, 8), 'Chat Check Two', v_owner,
          'open', 'indianapolis', 'IU Indianapolis');
  insert into public.org_members (org_id, user_id, role) values (v_club2, v_owner, 'owner');
  perform pg_temp.chat_ok('D21 old club creation: two channels sent without a kind',
    pg_temp.chat_service(format(
      'insert into public.channels (org_id, type, name, position, is_private)
       values (%1$L, ''org_channel'', ''general'', 0, false),
              (%1$L, ''org_channel'', ''announcements'', 1, false)', v_club2)), 'ok 2');
  perform pg_temp.chat_ok('D22 become the Lounge and the Board, with the owner''s rows',
    pg_temp.chat_get(format(
      'select string_agg(concat_ws('':'', c.kind, c.name, c.is_private,
                (select count(*) from public.channel_members cm where cm.channel_id = c.id)),
              '' '' order by c.position)
         from public.channels c where c.org_id = %L', v_club2)),
    'lounge:lounge:f:1 board:board:f:1');
  perform pg_temp.chat_ok('D23 a second general, or any other name, is an extra room',
    pg_temp.chat_service(format(
      'insert into public.channels (org_id, type, name, position)
       values (%1$L, ''org_channel'', ''general'', 5), (%1$L, ''org_channel'', ''memes'', 6)', v_club2))
    || '/' || pg_temp.chat_get(format(
      'select string_agg(c.kind || '':'' || c.name, '' '' order by c.position)
         from public.channels c where c.org_id = %L and c.position >= 5', v_club2)),
    'ok 2/room:general room:memes');
  perform pg_temp.chat_ok('D24 the club old code made has no Officers room until the repair runs',
    pg_temp.chat_get(format(
      'select count(*) from public.channels where org_id = %L and kind = ''officers''', v_club2))
    || '/' || pg_temp.chat_service(format('select public.chat_repair_club(%L)', v_club2))
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channels where org_id = %L and kind = ''officers''', v_club2)),
    '0/ok 1/1');

  -- The CHECKs and the unique indexes.
  perform pg_temp.chat_ok('D25 a Board cannot be made private (23514)',
    pg_temp.chat_service(format(
      'update public.channels set is_private = true where id = %L', pg_temp.chat_id('board'))), '23514');
  perform pg_temp.chat_ok('D26 Officers and an event room cannot be made public (23514)',
    pg_temp.chat_service(format(
      'update public.channels set is_private = false where org_id = %L and kind = ''officers''', v_club))
    || '/' || pg_temp.chat_service(format(
      'update public.channels set is_private = false where id = %L', pg_temp.chat_id('room'))),
    '23514/23514');
  perform pg_temp.chat_ok('D27 a club cannot have a second Lounge (23505)',
    pg_temp.chat_service(format(
      'insert into public.channels (org_id, type, kind, name) values (%L, ''org_channel'', ''lounge'', ''lounge'')',
      v_club)), '23505');
  perform pg_temp.chat_ok('D28 an event cannot have a second room (23505), a room of kind event needs its event (23514)',
    pg_temp.chat_service(format(
      'insert into public.channels (org_id, type, kind, name, is_private, event_id)
       values (%L, ''org_channel'', ''event'', ''twin'', true, %L)', v_club, pg_temp.chat_id('event')))
    || '/' || pg_temp.chat_service(format(
      'insert into public.channels (org_id, type, kind, name, is_private)
       values (%L, ''org_channel'', ''event'', ''no event'', true)', v_club)),
    '23505/23514');
  perform pg_temp.chat_ok('D29 an unknown room kind and an unknown message kind are refused (23514)',
    pg_temp.chat_service(format(
      'insert into public.channels (org_id, type, kind, name) values (%L, ''org_channel'', ''lobby'', ''x'')', v_club))
    || '/' || pg_temp.chat_service(format(
      'insert into public.messages (channel_id, user_id, content, kind) values (%L, %L, ''x'', ''sticker'')',
      pg_temp.chat_id('lounge'), v_owner)),
    '23514/23514');
  perform pg_temp.chat_keep('club2', v_club2);

  -- Someone who joins as an officer (the leaver, removed above, is invited
  -- back as an admin).
  perform pg_temp.chat_ok('D30 someone joins as an admin',
    pg_temp.chat_service(format(
      'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)',
      v_club, pg_temp.chat_id('leaver'), 'admin')), 'ok 1');
  perform pg_temp.chat_ok('D31 and holds Lounge, Board and the open event room; not the room past its 7 days, not Officers',
    pg_temp.chat_row(pg_temp.chat_id('lounge'), pg_temp.chat_id('leaver'))
    || pg_temp.chat_row(pg_temp.chat_id('board'), pg_temp.chat_id('leaver'))
    || pg_temp.chat_row(pg_temp.chat_id('room'), pg_temp.chat_id('leaver'))
    || pg_temp.chat_row(pg_temp.chat_id('old_room'), pg_temp.chat_id('leaver'))
    || pg_temp.chat_get(format(
         'select count(*) from public.channel_members cm join public.channels c on c.id = cm.channel_id
           where c.org_id = %L and c.kind = ''officers''', v_club)),
    'yesyesyesno0');
end $$;

-- E. A chat bug never blocks an RSVP, an event, a join or a role change ---------------
-- (contract 3.4, 12.16). The bug is made on purpose, in two steps: first
-- every INSERT and every DELETE on channel_members fails, then every INSERT
-- and UPDATE on channels fails as well. The four AFTER triggers must swallow
-- it, so THESE BLOCKS PRINT "WARNING: chat-rooms: ... failed: chat-check:
-- deliberate failure" LINES ON PURPOSE. A chat-rooms warning that does not
-- say "deliberate failure", anywhere in the output, is a real failure.
-- Not done while chat is broken: cancelling an event and leaving a club.
-- Their cascades and org_members_drop_club_access delete room rows
-- themselves, outside the chat triggers, so the deliberate failure would stop
-- them: that would be this break, not the migration.
create function public.chat_check_break_tmp()
returns trigger
language plpgsql
as $$
begin
  raise exception 'chat-check: deliberate failure';
end $$;
create trigger chat_check_break_rows
  before insert or delete on public.channel_members
  for each row execute function public.chat_check_break_tmp();

-- E, step 1: no row can be written to or deleted from channel_members.
do $$
declare
  v_club   uuid := pg_temp.chat_id('club');
  v_owner  uuid := pg_temp.chat_id('owner');
  v_admin  uuid := pg_temp.chat_id('admin');
  v_member uuid := pg_temp.chat_id('member');
  v_mod    uuid := pg_temp.chat_id('mod');
  v_out    uuid := pg_temp.chat_id('outsider');
  v_room   uuid := pg_temp.chat_id('room');
  v_event  uuid := pg_temp.chat_id('event');
  v_extra  uuid;
  n_extra  text;
  v_fevent uuid := gen_random_uuid();
  v_froom  uuid;
  rsvp     constant text :=
    'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
     on conflict (event_id, user_id) do update
       set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status';
  n_rows   constant text := 'select count(*) from public.channel_members where channel_id = %L';
begin
  -- The extra public room of D16 ('study-group') and how many rows it holds.
  select id into v_extra from public.channels
   where org_id = v_club and kind = 'room' and name = 'study-group';
  n_extra := pg_temp.chat_get(format(n_rows, v_extra));
  perform pg_temp.chat_keep('extra', v_extra);
  perform set_config('chat_check.extra_rows', n_extra, true);
  perform pg_temp.chat_keep('f_event', v_fevent);

  -- The INSERT inside chat_rsvps_room fails.
  perform pg_temp.chat_ok('E1 with chat broken, a member''s RSVP still succeeds',
    pg_temp.chat_as(v_mod, format(rsvp, v_event, v_mod, 'going')), 'ok 1');
  perform pg_temp.chat_ok('E2 the RSVP is stored; the room row is what was lost',
    pg_temp.chat_get(format(
      'select status from public.rsvps where event_id = %L and user_id = %L', v_event, v_mod))
    || '/' || pg_temp.chat_row(v_room, v_mod), 'going/no');

  -- The three DELETEs inside the swallowing blocks fail.
  perform pg_temp.chat_ok('E3 with chat broken, a member still changes Going to no (chat_rsvps_room cannot delete)',
    pg_temp.chat_as(v_member, format(
      'update public.rsvps set status = %L where event_id = %L and user_id = %L',
      'no', v_event, v_member)), 'ok 1');
  perform pg_temp.chat_ok('E4 the RSVP says no; the row that should have gone is still there',
    pg_temp.chat_get(format(
      'select status from public.rsvps where event_id = %L and user_id = %L', v_event, v_member))
    || '/' || pg_temp.chat_row(v_room, v_member), 'no/yes');
  perform pg_temp.chat_ok('E5 with chat broken, an admin is still made a member (chat_org_members_rooms cannot delete)',
    pg_temp.chat_service(format(
      'update public.org_members set role = %L where org_id = %L and user_id = %L',
      'member', v_club, v_admin)), 'ok 1');
  perform pg_temp.chat_ok('E6 the role is stored; their event-room row is still there',
    pg_temp.chat_get(format(
      'select role from public.org_members where org_id = %L and user_id = %L', v_club, v_admin))
    || '/' || pg_temp.chat_row(v_room, v_admin), 'member/yes');
  perform pg_temp.chat_ok('E7 with chat broken, a public room is still turned private (chat_channels_subscribe cannot delete)',
    pg_temp.chat_service(format(
      'update public.channels set is_private = true where id = %L', v_extra)), 'ok 1');
  perform pg_temp.chat_ok('E8 it is private; its rows are still there, all of them',
    pg_temp.chat_get(format('select is_private::text from public.channels where id = %L', v_extra))
    || '/' || (pg_temp.chat_get(format(n_rows, v_extra)) = n_extra and n_extra::int > 0)::text,
    'true/true');

  -- The INSERTs inside chat_channels_subscribe and chat_org_members_rooms fail.
  perform pg_temp.chat_ok('E9 with chat broken, an event is still created',
    pg_temp.chat_service(format(
      'insert into public.events (id, creator_id, org_id, title, description, location, starts_at, ends_at)
       values (%L, %L, %L, %L, %L, %L, now() + interval ''6 days'', now() + interval ''6 days 2 hours'')',
      v_fevent, v_owner, v_club, 'Chat Check Broken Night', '', 'Campus Center')), 'ok 1');
  select id into v_froom from public.channels where event_id = v_fevent;
  perform pg_temp.chat_keep('f_room', v_froom);
  perform pg_temp.chat_ok('E10 its room exists, without rows',
    pg_temp.chat_get(format('select count(*) from public.channels where event_id = %L', v_fevent))
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channel_members where channel_id = %L', v_froom)), '1/0');
  perform pg_temp.chat_ok('E11 with chat broken, someone still joins the club',
    pg_temp.chat_service(format(
      'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)',
      v_club, v_out, 'member')), 'ok 1');
  perform pg_temp.chat_ok('E12 the membership is stored; the room rows are what was lost',
    pg_temp.chat_get(format(
      'select role from public.org_members where org_id = %L and user_id = %L', v_club, v_out))
    || '/' || pg_temp.chat_row(pg_temp.chat_id('lounge'), v_out), 'member/no');
  perform pg_temp.chat_ok('E13 and a role change still goes through',
    pg_temp.chat_service(format(
      'update public.org_members set role = %L where org_id = %L and user_id = %L',
      'admin', v_club, v_out)), 'ok 1');
end $$;

-- E, step 2: no room can be created or renamed either (chat_events_room's own
-- writes to channels fail).
create trigger chat_check_break_rooms
  before insert or update on public.channels
  for each row execute function public.chat_check_break_tmp();

do $$
declare
  v_club    uuid := pg_temp.chat_id('club');
  v_owner   uuid := pg_temp.chat_id('owner');
  v_fevent  uuid := pg_temp.chat_id('f_event');
  v_fevent2 uuid := gen_random_uuid();
begin
  perform pg_temp.chat_keep('f_event2', v_fevent2);
  perform pg_temp.chat_ok('E14 with rooms broken too, an event is still created',
    pg_temp.chat_service(format(
      'insert into public.events (id, creator_id, org_id, title, description, location, starts_at, ends_at)
       values (%L, %L, %L, %L, %L, %L, now() + interval ''7 days'', now() + interval ''7 days 2 hours'')',
      v_fevent2, v_owner, v_club, 'Chat Check Roomless Night', '', 'Campus Center')), 'ok 1');
  perform pg_temp.chat_ok('E15 the event is stored; its room is what was lost',
    pg_temp.chat_get(format('select count(*) from public.events where id = %L', v_fevent2))
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channels where event_id = %L', v_fevent2)), '1/0');
  perform pg_temp.chat_ok('E16 with rooms broken, an event''s title still changes',
    pg_temp.chat_service(format(
      'update public.events set title = %L where id = %L', 'Chat Check Renamed Night', v_fevent)), 'ok 1');
  perform pg_temp.chat_ok('E17 the title is stored; the room kept its old name',
    pg_temp.chat_get(format('select title from public.events where id = %L', v_fevent))
    || '/' || pg_temp.chat_get(format(
      'select name from public.channels where event_id = %L', v_fevent)),
    'Chat Check Renamed Night/Chat Check Broken Night');
end $$;

drop trigger chat_check_break_rooms on public.channels;
drop trigger chat_check_break_rows on public.channel_members;
drop function public.chat_check_break_tmp();

-- E, step 3: chat works again. What the repair mends, and what it does not.
do $$
declare
  v_club    uuid := pg_temp.chat_id('club');
  v_owner   uuid := pg_temp.chat_id('owner');
  v_admin   uuid := pg_temp.chat_id('admin');
  v_member  uuid := pg_temp.chat_id('member');
  v_mod     uuid := pg_temp.chat_id('mod');
  v_out     uuid := pg_temp.chat_id('outsider');
  v_room    uuid := pg_temp.chat_id('room');
  v_oldroom uuid := pg_temp.chat_id('old_room');
  v_froom   uuid := pg_temp.chat_id('f_room');
  v_extra   uuid := pg_temp.chat_id('extra');
  n_extra   text := current_setting('chat_check.extra_rows', true);
  n_rows    constant text := 'select count(*) from public.channel_members where channel_id = %L';
begin
  perform pg_temp.chat_ok('E18 the repair gives back what the failed INSERTs missed, the lost room and its officers'' rows included',
    pg_temp.chat_service(format('select public.chat_repair_club(%L)', v_club))
    || '/' || pg_temp.chat_row(v_room, v_mod)
    || pg_temp.chat_row(pg_temp.chat_id('lounge'), v_out)
    || pg_temp.chat_row(pg_temp.chat_id('board'), v_out)
    || pg_temp.chat_row(v_froom, v_out)
    || pg_temp.chat_row(v_froom, v_owner)
    || '/' || pg_temp.chat_get(format(
      'select count(*) from public.channel_members cm join public.channels c on c.id = cm.channel_id
        where c.event_id = %L and c.kind = ''event'' and cm.user_id = %L',
      pg_temp.chat_id('f_event2'), v_owner)),
    'ok 1/yesyesyesyesyes/1');
  perform pg_temp.chat_ok('E19 and removes what the failed DELETEs left in the event rooms (the member who said no, the former admin)',
    pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room, v_admin)
    || pg_temp.chat_row(v_oldroom, v_admin), 'nonono');
  -- What stays behind after the repair. The rows on the room that turned
  -- private open nothing (a private room is opened by the role or the
  -- allow-list, never by a row). The name is listed by
  -- scripts/sql/chat-v2-after-deploy.sql (event_room_name).
  perform pg_temp.chat_ok('E20 it does not mend: the rows on the room that turned private (the member cannot see it), the event room''s old name',
    (pg_temp.chat_get(format(n_rows, v_extra)) = n_extra)::text
    || '/' || pg_temp.chat_read(v_member, format('select public.can_view_org_channel(%L, %L)', v_extra, v_member))
    || '/' || pg_temp.chat_get(format('select name from public.channels where id = %L', v_froom)),
    'true/false/Chat Check Broken Night');

  -- Back to where section F expects the club.
  perform pg_temp.chat_ok('E21 put back by hand: the room is renamed (the fix the after-deploy check prints), the extra room is public, the admin an admin, the member Going',
    pg_temp.chat_service(format(
      'update public.channels c set name = left(e.title, 80)
         from public.events e where e.id = c.event_id and c.id = %L', v_froom))
    || '/' || pg_temp.chat_get(format('select name from public.channels where id = %L', v_froom))
    || '/' || pg_temp.chat_service(format(
      'update public.channels set is_private = false where id = %L', v_extra))
    || '/' || pg_temp.chat_service(format(
      'update public.org_members set role = %L where org_id = %L and user_id = %L',
      'admin', v_club, v_admin))
    || '/' || pg_temp.chat_as(v_member, format(
      'update public.rsvps set status = %L where event_id = %L and user_id = %L',
      'going', pg_temp.chat_id('event'), v_member)),
    'ok 1/Chat Check Renamed Night/ok 1/ok 1/ok 1');
  perform pg_temp.chat_ok('E22 clean-up: the outsider leaves, the mod takes the RSVP back, both events are cancelled',
    pg_temp.chat_service(format(
      'delete from public.org_members where org_id = %L and user_id = %L', v_club, v_out))
    || '/' || pg_temp.chat_as(v_mod, format(
      'delete from public.rsvps where event_id = %L and user_id = %L', pg_temp.chat_id('event'), v_mod))
    || '/' || pg_temp.chat_as(v_owner, format(
      'delete from public.events where id in (%L, %L) returning id',
      pg_temp.chat_id('f_event'), pg_temp.chat_id('f_event2'))),
    'ok 1/ok 1/ok 2');
  perform pg_temp.chat_ok('E23 none of their rows is left, the member is back in the event room, the extra room holds the rows it held',
    pg_temp.chat_row(v_room, v_mod)
    || pg_temp.chat_row(pg_temp.chat_id('lounge'), v_out)
    || pg_temp.chat_get(format(
         'select count(*) from public.channels where event_id in (%L, %L)',
         pg_temp.chat_id('f_event'), pg_temp.chat_id('f_event2')))
    || pg_temp.chat_row(v_room, v_member) || pg_temp.chat_row(v_room, v_admin)
    || '/' || (pg_temp.chat_get(format(n_rows, v_extra)) = n_extra)::text,
    'nono0yesyes/true');
end $$;

-- F. An account is deleted; a club is deleted ---------------------------------------
do $$
declare
  v_club   uuid := pg_temp.chat_id('club');
  v_owner  uuid := pg_temp.chat_id('owner');
  v_member uuid := pg_temp.chat_id('member');
  v_goner  uuid := pg_temp.chat_id('goner');
  v_event  uuid := pg_temp.chat_id('event');
  v_room   uuid := pg_temp.chat_id('room');
  v_lounge uuid := pg_temp.chat_id('lounge');
  v_board  uuid := pg_temp.chat_id('board');
  v_gevent uuid := gen_random_uuid();
  v_groom  uuid;
  v_gpost  uuid;
  ins      constant text :=
    'insert into public.messages (channel_id, user_id, content) values (%L, %L, %L) returning id';
  rsvp     constant text :=
    'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
     on conflict (event_id, user_id) do update
       set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status';
  left_of  constant text :=
    'select concat_ws(''/'',
       (select count(*) from public.users where id = %1$L),
       (select count(*) from public.org_members where user_id = %1$L),
       (select count(*) from public.channel_members where user_id = %1$L),
       (select count(*) from public.rsvps where user_id = %1$L),
       (select count(*) from public.messages where user_id = %1$L),
       (select count(*) from public.events where creator_id = %1$L))';
begin
  -- The goner is an admin: they created an event, posted on the Board (a
  -- member replied), wrote in the Lounge and in two event rooms, and RSVP'd.
  perform pg_temp.chat_ok('F1 the goner creates an event; a member RSVPs and writes in its room',
    pg_temp.chat_service(format(
      'insert into public.events (id, creator_id, org_id, title, description, location, starts_at, ends_at)
       values (%L, %L, %L, %L, %L, %L, now() + interval ''4 days'', now() + interval ''4 days 2 hours'')',
      v_gevent, v_goner, v_club, 'Chat Check Goner Night', '', 'Campus Center'))
    || '/' || pg_temp.chat_as(v_member, format(rsvp, v_gevent, v_member, 'going')), 'ok 1/ok 1');
  select id into v_groom from public.channels where event_id = v_gevent;
  perform pg_temp.chat_ok('F2 messages: the goner''s Board post, Lounge and event messages, the member''s replies',
    concat_ws('/',
      pg_temp.chat_as(v_goner, format(ins, v_board, v_goner, 'chat-check: goner post')),
      pg_temp.chat_as(v_goner, format(ins, v_lounge, v_goner, 'chat-check: goner lounge')),
      pg_temp.chat_as(v_goner, format(ins, v_room, v_goner, 'chat-check: goner event')),
      pg_temp.chat_as(v_goner, format(ins, v_groom, v_goner, 'chat-check: goner own event')),
      pg_temp.chat_as(v_member, format(ins, v_groom, v_member, 'chat-check: member in goner event')),
      pg_temp.chat_as(v_goner, format(rsvp, v_event, v_goner, 'maybe'))),
    'ok 1/ok 1/ok 1/ok 1/ok 1/ok 1');
  select id into v_gpost from public.messages
   where channel_id = v_board and content = 'chat-check: goner post';
  perform pg_temp.chat_ok('F3 the member replies under the goner''s Board post',
    pg_temp.chat_as(v_member, format(
      'insert into public.messages (channel_id, user_id, content, thread_root_id) values (%L, %L, %L, %L) returning id',
      v_board, v_member, 'chat-check: reply to goner', v_gpost)), 'ok 1');
  -- 6 rows: Lounge, Board, the extra public room, three event rooms.
  perform pg_temp.chat_ok('F4 before: 1 account, 1 membership, 6 room rows, 1 RSVP, 4 messages, 1 event',
    pg_temp.chat_get(format(left_of, v_goner)), '1/1/6/1/4/1');

  -- What deleting an account does (auth.admin.deleteUser): the auth.users
  -- row goes and everything cascades from it.
  perform pg_temp.chat_ok('F5 the account is deleted: no error',
    pg_temp.chat_get(format(
      'with gone as (delete from auth.users where id = %L returning 1) select count(*) from gone',
      v_goner)), '1');
  perform pg_temp.chat_ok('F6 after: nothing of theirs is left',
    pg_temp.chat_get(format(left_of, v_goner)), '0/0/0/0/0/0');
  perform pg_temp.chat_ok('F7 the event they created, its room and the messages in it went with them (contract 12.7)',
    pg_temp.chat_get(format(
      'select concat_ws(''/'',
         (select count(*) from public.channels where id = %1$L),
         (select count(*) from public.messages where channel_id = %1$L),
         (select count(*) from public.channel_members where channel_id = %1$L),
         (select count(*) from public.rsvps where event_id = %2$L))', v_groom, v_gevent)), '0/0/0/0');
  perform pg_temp.chat_ok('F8 and so did the reply under their Board post',
    pg_temp.chat_get(format(
      'select count(*) from public.messages where thread_root_id = %L', v_gpost)), '0');
  perform pg_temp.chat_ok('F9 the club, its rooms and the other members are untouched',
    pg_temp.chat_get(format(
      'select count(*) from public.channels where org_id = %L and kind in (''board'', ''lounge'', ''officers'')', v_club))
    || pg_temp.chat_row(v_lounge, v_member) || pg_temp.chat_row(v_room, v_member), '3yesyes');

  -- DELETE /api/orgs/[slug] deletes the club with the service role.
  perform pg_temp.chat_ok('F10 the club is deleted: no error',
    pg_temp.chat_service(format('delete from public.orgs where id = %L', v_club)), 'ok 1');
  perform pg_temp.chat_ok('F11 after: its rooms, rows, events, RSVPs and messages are gone',
    pg_temp.chat_get(format(
      'select concat_ws(''/'',
         (select count(*) from public.channels where org_id = %1$L or id in (%2$L, %3$L)),
         (select count(*) from public.channel_members where channel_id in (%2$L, %3$L, %4$L)),
         (select count(*) from public.messages where channel_id in (%2$L, %3$L, %4$L)),
         (select count(*) from public.events where org_id = %1$L),
         (select count(*) from public.rsvps where event_id = %5$L),
         (select count(*) from public.org_members where org_id = %1$L))',
      v_club, v_lounge, v_room, v_board, v_event)), '0/0/0/0/0/0');
  perform pg_temp.chat_ok('F12 the other club is untouched',
    pg_temp.chat_get(format(
      'select count(*) from public.channels where org_id = %L and kind in (''board'', ''lounge'', ''officers'')',
      pg_temp.chat_id('club2'))), '3');
end $$;

do $$
begin
  raise notice 'chat-check: all % cases passed. Nothing is kept: ROLLBACK follows.',
    current_setting('chat_check.passed', true);
end $$;

rollback;
