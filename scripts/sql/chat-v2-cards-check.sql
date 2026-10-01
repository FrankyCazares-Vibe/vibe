-- chat-v2-cards-check.sql: the behaviour check of migration B
-- (supabase/migrations/20261001110000_chat_v2_cards.sql), contract
-- handoffs/chat-redesign/wave-2-contracts.md section 3.9 (wave 2, W2-B1).
--
-- LOCAL ONLY. Run it AFTER the migration has been applied to the local stack:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/chat-v2-cards-check.sql
-- Never on production: it writes (and rolls back) users, clubs, events,
-- messages and votes, and for a moment it creates functions in pg_temp.
-- It refuses any connection that is not the local unix socket (docker exec),
-- and its first line is a psql command, so the Management API and the MCP
-- refuse the file before anything runs.
-- Expected last line: chat-cards-check: all N cases passed. Nothing is kept:
-- ROLLBACK follows.
--
-- WHAT IT DOES. Everything happens inside ONE transaction that ends in
-- ROLLBACK, so nothing it writes stays. It builds its own fixtures (six
-- throwaway accounts, two clubs, their events), so it does not depend on the
-- seed or on what is in the database. It repeats the cases of the
-- migration's own POST-CHECK BY BEHAVIOUR (contract 3.8) and adds the paths
-- the migration cannot reach with real rows: a dm, the Officers room, the
-- event chat of an upcoming event, a leave and a removal through
-- org_members_drop_club_access, an RSVP withdrawn, an event cancelled, the
-- 200-id limit of chat_reply_counts, the catalog facts (RLS on, no policy,
-- no client grant) and the "for update" x2 assertion on chat_cast_vote. It
-- raises on the first expectation that fails ("chat-cards-check FAILED: ...")
-- and prints one NOTICE per case that passes ("chat-cards-check ok: ...").
--
-- HOW IT ACTS AS SOMEONE. The routes call every function with the service
-- key after their own gates (contract 3.3.1: consent, publish and
-- restriction are the route's; the functions check the room rule and the
-- shape), so the calls here run as role service_role. Students: role
-- authenticated + their id in request.jwt.claims, the way PostgREST runs a
-- signed-in request, so every policy applies. Rows the file itself sets up
-- (a removed message, a poll past its closes_at) are written as postgres.
--
-- THE VOTE RACE is proven by construction, not by this script (contract 3.9,
-- DATABASE-L8): section G asserts that chat_cast_vote's definition contains
-- "for update" twice (the poll row, then the option row). The two-terminal
-- walk (begin; select chat_cast_vote(...) in one, the same in the other,
-- commit the first, the second answers P0C26) is an optional manual step of
-- 13.3, not part of this file.
--
-- WARNINGS. Section E deletes a club room row while a poll is being counted
-- and cancels an event whose chat holds a poll: the cascade fires
-- chat_votes_drop_access on rows whose room is already gone, which must
-- return quietly. Any "WARNING: chat-cards: ... failed" line means the
-- trigger raised for real and swallowed it: treat it as a failed run.
--   ... | grep 'WARNING'     must print nothing
--
-- Answers: 'ok N' = the statement ran and touched N rows; a uuid = the card
-- the function made; otherwise the SQLSTATE that refused it (42501 = the
-- role guard, a policy or a grant; P0C21..P0C26 = the codes of contract 3.2;
-- 22023 = too many ids; 23514 = a CHECK; 23505 = a unique index).

-- A psql command: anything that is not psql refuses the file here. With it a
-- run without -v ON_ERROR_STOP=1 still stops at the first failure.
\set ON_ERROR_STOP on

begin;

-- Only on the local stack, and only on a database that has migration B.
do $$
begin
  if inet_server_addr() is not null then
    raise exception 'chat-cards-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if to_regclass('public.chat_polls') is null then
    raise exception 'chat-cards-check: chat_polls is missing. Apply 20261001110000_chat_v2_cards.sql to the local stack first';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.chat_ok(p_case text, p_got text, p_want text)
returns void
language plpgsql
as $$
begin
  if p_got is distinct from p_want then
    raise exception 'chat-cards-check FAILED: % (got %, expected %)',
      p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('chat_cards_check.passed',
    (coalesce(nullif(current_setting('chat_cards_check.passed', true), ''), '0')::int + 1)::text,
    true);
  raise notice 'chat-cards-check ok: %', p_case;
end $$;

-- Runs one statement as a role (and, for a student, as that student):
-- 'ok N' or the SQLSTATE.
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

-- Runs one statement that answers ONE value (a function returning a uuid)
-- as a role: the value as text, or the SQLSTATE.
create function pg_temp.chat_call(p_role text, p_who uuid, p_sql text)
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

-- The routes' shape: the function called with the service key. A uuid or
-- the SQLSTATE.
create function pg_temp.chat_rpc(p_sql text)
returns text language sql
as $$ select pg_temp.chat_call('service_role', null, p_sql) $$;

-- Reads one value as a student (through the SELECT policies and grants).
create function pg_temp.chat_read(p_who uuid, p_sql text)
returns text language sql
as $$ select pg_temp.chat_call('authenticated', p_who, p_sql) $$;

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
as $$ select set_config('chat_cards_check.' || p_key, p_id::text, true) $$;

create function pg_temp.chat_id(p_key text)
returns uuid language sql
as $$ select nullif(current_setting('chat_cards_check.' || p_key, true), '')::uuid $$;

-- The votes a person holds on the polls of one room, as a count.
create function pg_temp.chat_votes(p_room uuid, p_who uuid)
returns text language sql
as $$ select count(*)::text from public.chat_poll_votes v
        join public.chat_polls p on p.message_id = v.poll_id
       where p.channel_id = p_room and v.user_id = p_who $$;

-- The option at one position of a poll.
create function pg_temp.chat_opt(p_poll uuid, p_pos integer)
returns uuid language sql
as $$ select o.id from public.chat_poll_options o where o.poll_id = p_poll and o.position = p_pos $$;

-- 0. Fixtures ------------------------------------------------------------------
-- Six accounts that may publish (Terms, age, a verified school email):
--   owner, admin, member, mod  the club's people (member RSVPs to its events)
--   outsider                   in no club; shares a dm with member
--   other                      the owner of a second club
do $$
declare
  k text;
  u uuid;
begin
  foreach k in array array['owner', 'admin', 'member', 'mod', 'outsider', 'other']
  loop
    u := gen_random_uuid();
    -- handle_new_user() writes the public.users row, consent included.
    insert into auth.users (id, instance_id, aud, role, email,
                            raw_user_meta_data, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'chat-cards-' || k || '-' || left(u::text, 8) || '@example.test',
            jsonb_build_object('full_name', 'Chat Cards ' || k,
                               'terms_version', '2026-01-01', 'age_attested', true),
            now(), now());
    update public.users
       set school_verified = true,
           school_system = 'iu',
           school_email = 'chat-cards-' || k || '-' || left(u::text, 8) || '@iu.edu',
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

-- Two clubs the way POST /api/orgs makes them (the club row, the owner's
-- membership row, chat_repair_club with the service role); the members join;
-- the club's events (POST /api/events inserts as the service role, and the
-- AFTER INSERT trigger makes each event's chat); a dm.
do $$
declare
  v_owner    uuid := pg_temp.chat_id('owner');
  v_other    uuid := pg_temp.chat_id('other');
  v_member   uuid := pg_temp.chat_id('member');
  v_outsider uuid := pg_temp.chat_id('outsider');
  v_club     uuid := gen_random_uuid();
  v_club2    uuid := gen_random_uuid();
  v_upcoming uuid := gen_random_uuid();
  v_ended    uuid := gen_random_uuid();
  v_closed   uuid := gen_random_uuid();
  v_foreign  uuid := gen_random_uuid();
  v_dm       uuid := gen_random_uuid();
  v_room     uuid;
  k          text;
begin
  perform pg_temp.chat_keep('club', v_club);
  perform pg_temp.chat_keep('club2', v_club2);
  perform pg_temp.chat_ok('fixture: the club and the other club are written (service role)',
    pg_temp.chat_service(format(
      'insert into public.orgs (id, handle, name, owner_id, join_policy, campus_id, school, verified)
       values (%L, %L, %L, %L, %L, %L, %L, true), (%L, %L, %L, %L, %L, %L, %L, true)',
      v_club,  'chat_cards_' || left(v_club::text, 8),  'Chat Cards Club',  v_owner, 'open', 'indianapolis', 'IU Indianapolis',
      v_club2, 'chat_cards_' || left(v_club2::text, 8), 'Chat Cards Other', v_other, 'open', 'indianapolis', 'IU Indianapolis')),
    'ok 2');
  perform pg_temp.chat_ok('fixture: the two owner rows are written',
    pg_temp.chat_service(format(
      'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L), (%L, %L, %L)',
      v_club, v_owner, 'owner', v_club2, v_other, 'owner')), 'ok 2');
  perform pg_temp.chat_ok('fixture: chat_repair_club for both',
    pg_temp.chat_service(format('select public.chat_repair_club(%L), public.chat_repair_club(%L)', v_club, v_club2)),
    'ok 1');
  perform pg_temp.chat_keep('lounge',   (select id from public.channels where org_id = v_club and kind = 'lounge'));
  perform pg_temp.chat_keep('board',    (select id from public.channels where org_id = v_club and kind = 'board'));
  perform pg_temp.chat_keep('officers', (select id from public.channels where org_id = v_club and kind = 'officers'));
  perform pg_temp.chat_keep('lounge2',  (select id from public.channels where org_id = v_club2 and kind = 'lounge'));

  foreach k in array array['admin', 'member', 'mod']
  loop
    perform pg_temp.chat_ok('fixture: ' || k || ' joins the club',
      pg_temp.chat_service(format(
        'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)',
        v_club, pg_temp.chat_id(k), k)), 'ok 1');
  end loop;
  perform pg_temp.chat_ok('fixture: every member holds a row on the Lounge and the Board',
    (select count(*)::text from public.channel_members cm
      where cm.channel_id in (pg_temp.chat_id('lounge'), pg_temp.chat_id('board'))), '8');

  -- The events: one upcoming, one ended yesterday (its chat is still open
  -- for 7 days), one ended 10 days ago (its chat is closed), one of the
  -- other club. Each gets its room from chat_events_room.
  perform pg_temp.chat_ok('fixture: the four events are written (service role)',
    pg_temp.chat_service(format(
      'insert into public.events (id, org_id, creator_id, title, starts_at, ends_at, location) values
         (%L, %L, %L, %L, now() + interval ''2 days'', now() + interval ''2 days 2 hours'', ''x''),
         (%L, %L, %L, %L, now() - interval ''1 day 2 hours'', now() - interval ''1 day'', ''x''),
         (%L, %L, %L, %L, now() - interval ''10 days 2 hours'', now() - interval ''10 days'', ''x''),
         (%L, %L, %L, %L, now() + interval ''3 days'', now() + interval ''3 days 2 hours'', ''x'')',
      v_upcoming, v_club,  v_owner, 'Chat Cards Upcoming',
      v_ended,    v_club,  v_owner, 'Chat Cards Ended',
      v_closed,   v_club,  v_owner, 'Chat Cards Closed',
      v_foreign,  v_club2, v_other, 'Chat Cards Foreign')), 'ok 4');
  perform pg_temp.chat_keep('upcoming', v_upcoming);
  perform pg_temp.chat_keep('ended', v_ended);
  perform pg_temp.chat_keep('closed', v_closed);
  perform pg_temp.chat_keep('foreign', v_foreign);
  perform pg_temp.chat_keep('room_upcoming', (select id from public.channels where event_id = v_upcoming));
  perform pg_temp.chat_keep('room_ended',    (select id from public.channels where event_id = v_ended));
  perform pg_temp.chat_keep('room_closed',   (select id from public.channels where event_id = v_closed));
  perform pg_temp.chat_ok('fixture: the three event chats of the club exist',
    (select count(*)::text from public.channels where org_id = v_club and kind = 'event'), '3');

  -- The member says Going to the upcoming event (the student's upsert of
  -- PUT /api/events/[id]/rsvp): chat_rsvps_room gives them the room.
  perform pg_temp.chat_ok('fixture: the member RSVPs going to the upcoming event',
    pg_temp.chat_as(v_member, format(
      'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
       on conflict (event_id, user_id) do update
         set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status',
      v_upcoming, v_member, 'going')), 'ok 1');
  perform pg_temp.chat_ok('fixture: the member holds a row on that event chat, the mod does not',
    (select count(*)::text from public.channel_members cm
      where cm.channel_id = pg_temp.chat_id('room_upcoming') and cm.user_id = v_member)
    || (select count(*)::text from public.channel_members cm
         where cm.channel_id = pg_temp.chat_id('room_upcoming') and cm.user_id = pg_temp.chat_id('mod')), '10');

  -- A dm between member and outsider (no club: org_id null).
  insert into public.channels (id, type, name) values (v_dm, 'dm', '');
  insert into public.channel_members (channel_id, user_id, role, accepted_at)
  values (v_dm, v_member, 'member', now()), (v_dm, v_outsider, 'member', now());
  perform pg_temp.chat_keep('dm', v_dm);
end $$;

-- A. Cards made the way the routes make them: the function, service role -----
do $$
declare
  v_owner    uuid := pg_temp.chat_id('owner');
  v_admin    uuid := pg_temp.chat_id('admin');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_lounge   uuid := pg_temp.chat_id('lounge');
  v_board    uuid := pg_temp.chat_id('board');
  v_off      uuid := pg_temp.chat_id('officers');
  v_upcoming uuid := pg_temp.chat_id('upcoming');
  v_room_up  uuid := pg_temp.chat_id('room_upcoming');
  v_room_end uuid := pg_temp.chat_id('room_ended');
  got        text;
  poll constant text := 'select public.chat_create_poll(%L, %L, %L, %L, %L, %s, %s, %L, %L)';
  card constant text := 'select public.chat_create_event_card(%L, %L, %L, %L, %L)';
  two  constant text := '[{"label":"a"},{"label":"b"}]';
  ten  constant text := '[{"label":"0"},{"label":"1"},{"label":"2"},{"label":"3"},{"label":"4"},{"label":"5"},{"label":"6"},{"label":"7"},{"label":"8"},{"label":"9"}]';
begin
  -- Accepted first, so a refusal below cannot be "everything is refused".
  got := pg_temp.chat_rpc(format(poll, v_lounge, v_member, 'poll', '  Pizza or tacos?  ',
           '[{"label":" Pizza "},{"label":"Tacos"}]', 'false', 'false', null, 'Poll: Pizza or tacos?'));
  perform pg_temp.chat_ok('A1 a member''s poll on the Lounge is made', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_keep('poll', got::uuid);
  perform pg_temp.chat_ok('A2 its messages row: kind poll, the fallback text, no root, no event',
    pg_temp.chat_get(format(
      'select concat_ws(''/'', m.kind, m.content, coalesce(m.thread_root_id::text, ''null''),
              coalesce(m.card_event_id::text, ''null''), coalesce(m.media_url, ''null''),
              coalesce(m.removed_at::text, ''null''), (m.user_id = %L)::text, (m.channel_id = %L)::text)
         from public.messages m where m.id = %L', v_member, v_lounge, got)),
    'poll/Poll: Pizza or tacos?/null/null/null/null/true/true');
  perform pg_temp.chat_ok('A3 its poll row: mode poll, question trimmed, names shown, single choice, no close, by the member',
    pg_temp.chat_get(format(
      'select concat_ws(''/'', p.mode, p.question, p.anonymous::text, p.multi::text, coalesce(p.closes_at::text, ''null''),
              (p.created_by = %L)::text, (p.channel_id = %L)::text) from public.chat_polls p where p.message_id = %L',
      v_member, v_lounge, got)),
    'poll/Pizza or tacos?/false/false/null/true/true');
  perform pg_temp.chat_ok('A4 its options: positions 0 and 1, labels trimmed, no capacity',
    pg_temp.chat_get(format(
      'select string_agg(o.position || '':'' || o.label || '':'' || coalesce(o.capacity::text, ''null''), '','' order by o.position)
         from public.chat_poll_options o where o.poll_id = %L', got)),
    '0:Pizza:null,1:Tacos:null');

  got := pg_temp.chat_rpc(format(poll, v_lounge, v_admin, 'signup', 'Bring something',
           '[{"label":"Snacks","capacity":2},{"label":"Drinks","capacity":1}]', 'true', 'false', null, 'Sign-up: Bring something'));
  perform pg_temp.chat_ok('A5 an admin''s sign-up on the Lounge is made', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_keep('signup', got::uuid);
  perform pg_temp.chat_ok('A6 a sign-up always shows names and allows several slots, whatever was sent',
    pg_temp.chat_get(format(
      'select concat_ws(''/'', p.mode, p.anonymous::text, p.multi::text,
              (select string_agg(o.position || '':'' || o.capacity, '','' order by o.position)
                 from public.chat_poll_options o where o.poll_id = p.message_id))
         from public.chat_polls p where p.message_id = %L', got)),
    'signup/false/true/0:2,1:1');

  got := pg_temp.chat_rpc(format(poll, v_board, v_owner, 'poll', 'Board poll', two, 'false', 'false', null, 'Poll: Board poll'));
  perform pg_temp.chat_ok('A7 the owner''s poll on the Board is made', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_keep('bpoll', got::uuid);
  got := pg_temp.chat_rpc(format(poll, v_off, v_admin, 'poll', 'Officers poll', two, 'false', 'false', null, 'Poll: Officers poll'));
  perform pg_temp.chat_ok('A8 an admin''s poll in Officers is made', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_keep('opoll', got::uuid);
  got := pg_temp.chat_rpc(format(poll, v_room_up, v_member, 'poll', 'Event chat poll', two, 'false', 'false', null, 'Poll: Event chat poll'));
  perform pg_temp.chat_ok('A9 the member (Going) makes a poll in the upcoming event''s chat', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_keep('epoll', got::uuid);
  got := pg_temp.chat_rpc(format(poll, v_room_end, v_owner, 'poll', 'After poll', two, 'false', 'false', null, 'Poll: After poll'));
  perform pg_temp.chat_ok('A10 a poll in the chat of an event that ended yesterday (still open) is made', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  got := pg_temp.chat_rpc(format(poll, v_lounge, v_mod, 'poll', 'Multi', two, 'false', 'true', null, 'Poll: Multi'));
  perform pg_temp.chat_ok('A11 the mod''s multi-choice poll on the Lounge is made', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_keep('mpoll', got::uuid);
  got := pg_temp.chat_rpc(format(poll, v_lounge, v_member, 'poll', 'Anon', two, 'true', 'false', null, 'Poll: Anon'));
  perform pg_temp.chat_ok('A12 an anonymous poll is stored anonymous',
    pg_temp.chat_get(format('select p.anonymous::text from public.chat_polls p where p.message_id = %L', got)), 'true');
  got := pg_temp.chat_rpc(format(poll, v_lounge, v_member, 'poll', 'Closing', two, 'false', 'false',
           (now() + interval '1 hour')::text, 'Poll: Closing'));
  perform pg_temp.chat_ok('A13 a poll with a closes_at in the future is made and keeps it',
    pg_temp.chat_get(format('select (p.closes_at > now())::text from public.chat_polls p where p.message_id = %L', got)), 'true');
  perform pg_temp.chat_keep('cpoll', got::uuid);
  got := pg_temp.chat_rpc(format(poll, v_lounge, v_member, 'poll', 'Ten', ten, 'false', 'false', null, 'Poll: Ten'));
  perform pg_temp.chat_ok('A14 ten options are the most, at positions 0 to 9',
    pg_temp.chat_get(format(
      'select string_agg(o.position::text, '''' order by o.position) from public.chat_poll_options o where o.poll_id = %L', got)),
    '0123456789');
  got := pg_temp.chat_rpc(format(poll, v_lounge, v_owner, 'signup', 'One slot', '[{"label":"s","capacity":1}]', 'false', 'true', null, 'Sign-up: One slot'));
  perform pg_temp.chat_ok('A15 a sign-up with one slot is made', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_keep('slot1', got::uuid);

  got := pg_temp.chat_rpc(format(card, v_lounge, v_member, v_upcoming, '  ride?  ', 'Event: Chat Cards Upcoming'));
  perform pg_temp.chat_ok('A16 a member''s Event card on the Lounge is made', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_keep('card', got::uuid);
  perform pg_temp.chat_ok('A17 its messages row: kind event_card, the event, no root; the note trimmed in chat_event_cards',
    pg_temp.chat_get(format(
      'select concat_ws(''/'', m.kind, (m.card_event_id = %L)::text, coalesce(m.thread_root_id::text, ''null''),
              (select e.note from public.chat_event_cards e where e.message_id = m.id))
         from public.messages m where m.id = %L', v_upcoming, got)),
    'event_card/true/null/ride?');
  got := pg_temp.chat_rpc(format(card, v_lounge, v_member, v_upcoming, '   ', 'Event: Chat Cards Upcoming'));
  perform pg_temp.chat_ok('A18 a blank note is stored as null',
    pg_temp.chat_get(format('select coalesce(e.note, ''null'') from public.chat_event_cards e where e.message_id = %L', got)), 'null');
  got := pg_temp.chat_rpc(format(card, v_board, v_owner, v_upcoming, null, 'Event: Chat Cards Upcoming'));
  perform pg_temp.chat_ok('A19 an officer''s Event card on the Board is made', (got ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_ok('A20 every card bumped the club''s activity (bump_org_activity_on_message)',
    pg_temp.chat_get(format(
      'select (o.last_activity_at >= (select max(m.created_at) from public.messages m where m.id = %L))::text
         from public.orgs o where o.id = %L', got, pg_temp.chat_id('club'))), 'true');
end $$;

-- B. Refusals of a create (the codes of contract 3.2) ---------------------------
do $$
declare
  v_owner    uuid := pg_temp.chat_id('owner');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_outsider uuid := pg_temp.chat_id('outsider');
  v_other    uuid := pg_temp.chat_id('other');
  v_lounge   uuid := pg_temp.chat_id('lounge');
  v_board    uuid := pg_temp.chat_id('board');
  v_off      uuid := pg_temp.chat_id('officers');
  v_dm       uuid := pg_temp.chat_id('dm');
  v_room_up  uuid := pg_temp.chat_id('room_upcoming');
  v_room_cl  uuid := pg_temp.chat_id('room_closed');
  v_upcoming uuid := pg_temp.chat_id('upcoming');
  v_ended    uuid := pg_temp.chat_id('ended');
  v_foreign  uuid := pg_temp.chat_id('foreign');
  c          record;
  poll constant text := 'select public.chat_create_poll(%L, %L, %L, %L, %L, %s, %s, %L, %L)';
  card constant text := 'select public.chat_create_event_card(%L, %L, %L, %L, %L)';
  two  constant text := '[{"label":"a"},{"label":"b"}]';
  eleven text := (select jsonb_agg(jsonb_build_object('label', 'l' || i, 'capacity', 1)) from generate_series(1, 11) i)::text;
begin
  for c in
    select * from (values
      ('B1 a member''s top-level Board poll',                     format(poll, v_board, v_member, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C21'),
      ('B2 a mod''s top-level Board poll (officers = owner, admin)', format(poll, v_board, v_mod, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C21'),
      ('B3 a member''s poll in Officers',                          format(poll, v_off, v_member, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C21'),
      ('B4 someone outside the club on the Lounge',                format(poll, v_lounge, v_outsider, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C21'),
      ('B5 the other club''s owner on the Lounge',                 format(poll, v_lounge, v_other, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C21'),
      ('B6 a poll in a dm (cards are for club rooms)',             format(poll, v_dm, v_member, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C21'),
      ('B7 the closed event chat, even for the owner',             format(poll, v_room_cl, v_owner, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C21'),
      ('B8 the mod (no RSVP, not an officer) in the upcoming event chat', format(poll, v_room_up, v_mod, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C21'),
      ('B9 a room that does not exist',                            format(poll, gen_random_uuid(), v_member, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C21'),
      ('B10 a poll with one option',                               format(poll, v_lounge, v_member, 'poll', 'q', '[{"label":"a"}]', 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B11 a poll with eleven options',                           format(poll, v_lounge, v_member, 'poll', 'q', eleven, 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B12 a sign-up with no slot',                               format(poll, v_lounge, v_member, 'signup', 's', '[]', 'false', 'true', null, 'Sign-up: s'), 'P0C22'),
      ('B13 a sign-up with eleven slots',                          format(poll, v_lounge, v_member, 'signup', 's', eleven, 'false', 'true', null, 'Sign-up: s'), 'P0C22'),
      ('B14 a sign-up slot without a capacity',                    format(poll, v_lounge, v_member, 'signup', 's', '[{"label":"s"}]', 'false', 'true', null, 'Sign-up: s'), 'P0C22'),
      ('B15 a poll option with a capacity',                        format(poll, v_lounge, v_member, 'poll', 'q', '[{"label":"a","capacity":2},{"label":"b"}]', 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B16 a label of 81 characters',                             format(poll, v_lounge, v_member, 'poll', 'q', jsonb_build_array(jsonb_build_object('label', repeat('x', 81)), jsonb_build_object('label', 'b'))::text, 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B17 a blank label',                                        format(poll, v_lounge, v_member, 'poll', 'q', '[{"label":"  "},{"label":"b"}]', 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B18 an option that is not an object',                      format(poll, v_lounge, v_member, 'poll', 'q', '["a","b"]', 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B19 options that are not an array',                        format(poll, v_lounge, v_member, 'poll', 'q', '{"label":"a"}', 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B20 a closes_at in the past',                              format(poll, v_lounge, v_member, 'poll', 'q', two, 'false', 'false', (now() - interval '1 minute')::text, 'Poll: q'), 'P0C22'),
      ('B21 a content of 301 characters',                          format(poll, v_lounge, v_member, 'poll', 'q', two, 'false', 'false', null, repeat('c', 301)), 'P0C22'),
      ('B22 a blank content',                                      format(poll, v_lounge, v_member, 'poll', 'q', two, 'false', 'false', null, '  '), 'P0C22'),
      ('B23 a question of 201 characters',                         format(poll, v_lounge, v_member, 'poll', repeat('q', 201), two, 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B24 a blank question',                                     format(poll, v_lounge, v_member, 'poll', ' ', two, 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B25 a mode that is not poll or signup',                    format(poll, v_lounge, v_member, 'x', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B26 a capacity of 1000',                                   format(poll, v_lounge, v_member, 'signup', 's', '[{"label":"s","capacity":1000}]', 'false', 'true', null, 'Sign-up: s'), 'P0C22'),
      ('B27 a capacity of 0',                                      format(poll, v_lounge, v_member, 'signup', 's', '[{"label":"s","capacity":0}]', 'false', 'true', null, 'Sign-up: s'), 'P0C22'),
      ('B28 a capacity of 51',                                     format(poll, v_lounge, v_member, 'signup', 's', '[{"label":"s","capacity":51}]', 'false', 'true', null, 'Sign-up: s'), 'P0C22'),
      ('B29 a capacity that is a string',                          format(poll, v_lounge, v_member, 'signup', 's', '[{"label":"s","capacity":"2"}]', 'false', 'true', null, 'Sign-up: s'), 'P0C22'),
      ('B30 a capacity with a fraction',                           format(poll, v_lounge, v_member, 'signup', 's', '[{"label":"s","capacity":1.5}]', 'false', 'true', null, 'Sign-up: s'), 'P0C22'),
      ('B31 a null room',                                          format(poll, null, v_member, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B32 a null person',                                        format(poll, v_lounge, null, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B33 the shape is checked before the room (a bad poll on the Board by a member reads P0C22, not P0C21)', format(poll, v_board, v_member, 'poll', 'q', '[{"label":"a"}]', 'false', 'false', null, 'Poll: q'), 'P0C22'),
      ('B34 an Event card for an event of another club',           format(card, v_lounge, v_member, v_foreign, null, 'Event: x'), 'P0C23'),
      ('B35 an Event card for an event that has ended',            format(card, v_lounge, v_member, v_ended, null, 'Event: x'), 'P0C23'),
      ('B36 an Event card for an event that does not exist',       format(card, v_lounge, v_member, gen_random_uuid(), null, 'Event: x'), 'P0C23'),
      ('B37 an Event card in a dm',                                format(card, v_dm, v_member, v_upcoming, null, 'Event: x'), 'P0C21'),
      ('B38 an Event card by someone outside the club',            format(card, v_lounge, v_outsider, v_upcoming, null, 'Event: x'), 'P0C21'),
      ('B39 a note of 201 characters',                             format(card, v_lounge, v_member, v_upcoming, repeat('n', 201), 'Event: x'), 'P0C22'),
      ('B40 an Event card with a blank content',                   format(card, v_lounge, v_member, v_upcoming, null, ' '), 'P0C22'),
      ('B41 an Event card with a null event',                      format(card, v_lounge, v_member, null, null, 'Event: x'), 'P0C22')
    ) as t (name, sql, want)
  loop
    perform pg_temp.chat_ok(c.name, pg_temp.chat_rpc(c.sql), c.want);
  end loop;
  perform pg_temp.chat_ok('B42 a poll option with "capacity": null is accepted',
    (pg_temp.chat_rpc(format(poll, v_lounge, v_member, 'poll', 'q', '[{"label":"a","capacity":null},{"label":"b"}]', 'false', 'false', null, 'Poll: q'))
       ~ '^[0-9a-f-]{36}$')::text, 'true');
  perform pg_temp.chat_ok('B43 no refused card was stored (12 polls, 3 event cards in this club)',
    (select count(*)::text from public.chat_polls p join public.channels ch on ch.id = p.channel_id
      where ch.org_id = pg_temp.chat_id('club'))
    || '/' || (select count(*)::text from public.chat_event_cards e
                 join public.messages m on m.id = e.message_id
                 join public.channels ch on ch.id = m.channel_id
                where ch.org_id = pg_temp.chat_id('club')), '12/3');
end $$;

-- C. Votes ------------------------------------------------------------------------
do $$
declare
  v_owner    uuid := pg_temp.chat_id('owner');
  v_admin    uuid := pg_temp.chat_id('admin');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_outsider uuid := pg_temp.chat_id('outsider');
  v_other    uuid := pg_temp.chat_id('other');
  v_poll     uuid := pg_temp.chat_id('poll');
  v_mpoll    uuid := pg_temp.chat_id('mpoll');
  v_cpoll    uuid := pg_temp.chat_id('cpoll');
  v_bpoll    uuid := pg_temp.chat_id('bpoll');
  v_opoll    uuid := pg_temp.chat_id('opoll');
  v_epoll    uuid := pg_temp.chat_id('epoll');
  v_signup   uuid := pg_temp.chat_id('signup');
  v_room_cl  uuid := pg_temp.chat_id('room_closed');
  a          uuid := pg_temp.chat_opt(pg_temp.chat_id('poll'), 0);
  b          uuid := pg_temp.chat_opt(pg_temp.chat_id('poll'), 1);
  snacks     uuid := pg_temp.chat_opt(pg_temp.chat_id('signup'), 0);
  drinks     uuid := pg_temp.chat_opt(pg_temp.chat_id('signup'), 1);
  v_closedp  uuid := gen_random_uuid();
  v_closedo  uuid;
  vote constant text := 'select public.chat_cast_vote(%L, %L, %L, %s)';
  rows constant text := 'select count(*) from public.chat_poll_votes v where v.poll_id = %L and v.user_id = %L';
begin
  perform pg_temp.chat_ok('C1 the member votes a', pg_temp.chat_service(format(vote, v_poll, a, v_member, 'true')), 'ok 1');
  perform pg_temp.chat_ok('C2 one row, on a',
    pg_temp.chat_get(format('select string_agg(v.option_id::text, '','') from public.chat_poll_votes v where v.poll_id = %L and v.user_id = %L', v_poll, v_member)), a::text);
  perform pg_temp.chat_ok('C3 the member votes b on the single-choice poll', pg_temp.chat_service(format(vote, v_poll, b, v_member, 'true')), 'ok 1');
  perform pg_temp.chat_ok('C4 a is gone, b stays',
    pg_temp.chat_get(format('select string_agg(v.option_id::text, '','') from public.chat_poll_votes v where v.poll_id = %L and v.user_id = %L', v_poll, v_member)), b::text);
  perform pg_temp.chat_ok('C5 the mod votes a; the member''s b is untouched (one vote per person, not per poll)',
    pg_temp.chat_service(format(vote, v_poll, a, v_mod, 'true')) || '/' || pg_temp.chat_get(format(rows, v_poll, v_member)), 'ok 1/1');
  perform pg_temp.chat_ok('C6 on a multi-choice poll both choices stay',
    pg_temp.chat_service(format(vote, v_mpoll, pg_temp.chat_opt(v_mpoll, 0), v_member, 'true'))
    || pg_temp.chat_service(format(vote, v_mpoll, pg_temp.chat_opt(v_mpoll, 1), v_member, 'true'))
    || '/' || pg_temp.chat_get(format(rows, v_mpoll, v_member)), 'ok 1ok 1/2');
  perform pg_temp.chat_ok('C7 off deletes the vote', pg_temp.chat_service(format(vote, v_poll, b, v_member, 'false')) || '/' || pg_temp.chat_get(format(rows, v_poll, v_member)), 'ok 1/0');
  perform pg_temp.chat_ok('C8 off again is no error', pg_temp.chat_service(format(vote, v_poll, b, v_member, 'false')), 'ok 1');
  perform pg_temp.chat_ok('C9 on twice is no error and one row',
    pg_temp.chat_service(format(vote, v_poll, b, v_member, 'true')) || pg_temp.chat_service(format(vote, v_poll, b, v_member, 'true'))
    || '/' || pg_temp.chat_get(format(rows, v_poll, v_member)), 'ok 1ok 1/1');

  -- Closed: a poll past its closes_at (moved by hand: set local cannot move
  -- now()), and a poll in the closed event chat (written by hand: nothing
  -- else can put one there).
  update public.chat_polls set closes_at = now() - interval '1 minute' where message_id = v_cpoll;
  perform pg_temp.chat_ok('C10 a vote after closes_at is refused', pg_temp.chat_service(format(vote, v_cpoll, pg_temp.chat_opt(v_cpoll, 0), v_member, 'true')), 'P0C25');
  perform pg_temp.chat_ok('C11 and so is turning one off after closes_at', pg_temp.chat_service(format(vote, v_cpoll, pg_temp.chat_opt(v_cpoll, 0), v_member, 'false')), 'P0C25');
  insert into public.messages (id, channel_id, user_id, content, kind) values (v_closedp, v_room_cl, v_owner, 'Poll: closed room', 'poll');
  insert into public.chat_polls (message_id, channel_id, mode, question, created_by) values (v_closedp, v_room_cl, 'poll', 'closed room', v_owner);
  insert into public.chat_poll_options (poll_id, position, label) values (v_closedp, 0, 'a') returning id into v_closedo;
  perform pg_temp.chat_ok('C12 a vote in a closed event chat is refused, even for the owner who can still read it',
    pg_temp.chat_service(format(vote, v_closedp, v_closedo, v_owner, 'true')), 'P0C25');

  -- Slots: Snacks holds 2, Drinks holds 1; a person may take several.
  perform pg_temp.chat_ok('C13 the admin and the member take Snacks (2 spots)',
    pg_temp.chat_service(format(vote, v_signup, snacks, v_admin, 'true')) || pg_temp.chat_service(format(vote, v_signup, snacks, v_member, 'true')), 'ok 1ok 1');
  perform pg_temp.chat_ok('C14 the mod is refused: Snacks is full', pg_temp.chat_service(format(vote, v_signup, snacks, v_mod, 'true')), 'P0C26');
  perform pg_temp.chat_ok('C15 the member also takes Drinks (a second slot of the same sign-up)', pg_temp.chat_service(format(vote, v_signup, drinks, v_member, 'true')), 'ok 1');
  perform pg_temp.chat_ok('C16 the owner is refused: Drinks is full', pg_temp.chat_service(format(vote, v_signup, drinks, v_owner, 'true')), 'P0C26');
  perform pg_temp.chat_ok('C17 the member taking Drinks again is no error and still one row',
    pg_temp.chat_service(format(vote, v_signup, drinks, v_member, 'true'))
    || '/' || pg_temp.chat_get(format('select count(*) from public.chat_poll_votes v where v.option_id = %L', drinks)), 'ok 1/1');
  perform pg_temp.chat_ok('C18 the member leaves Drinks and the owner takes the spot',
    pg_temp.chat_service(format(vote, v_signup, drinks, v_member, 'false')) || pg_temp.chat_service(format(vote, v_signup, drinks, v_owner, 'true')), 'ok 1ok 1');
  perform pg_temp.chat_ok('C19 the member still holds Snacks', pg_temp.chat_get(format(rows, v_signup, v_member)), '1');

  -- Not there for this person.
  perform pg_temp.chat_ok('C20 an option of another poll', pg_temp.chat_service(format(vote, v_poll, pg_temp.chat_opt(v_mpoll, 0), v_member, 'true')), 'P0C24');
  update public.messages set removed_at = now(), removed_by = v_owner, removed_reason = 'chat-cards-check' where id = v_mpoll;
  perform pg_temp.chat_ok('C21 a removed poll', pg_temp.chat_service(format(vote, v_mpoll, pg_temp.chat_opt(v_mpoll, 0), v_member, 'true')), 'P0C24');
  perform pg_temp.chat_ok('C22 someone outside the club', pg_temp.chat_service(format(vote, v_poll, a, v_outsider, 'true')), 'P0C24');
  perform pg_temp.chat_ok('C23 the other club''s owner', pg_temp.chat_service(format(vote, v_poll, a, v_other, 'true')), 'P0C24');
  perform pg_temp.chat_ok('C24 a poll that does not exist', pg_temp.chat_service(format(vote, gen_random_uuid(), a, v_member, 'true')), 'P0C24');
  perform pg_temp.chat_ok('C25 an option that does not exist', pg_temp.chat_service(format(vote, v_poll, gen_random_uuid(), v_member, 'true')), 'P0C24');
  perform pg_temp.chat_ok('C26 a null p_on', pg_temp.chat_service(format(vote, v_poll, a, v_member, 'null::boolean')), 'P0C22');
  perform pg_temp.chat_ok('C27 a member votes in Officers'' poll: not there for them', pg_temp.chat_service(format(vote, v_opoll, pg_temp.chat_opt(v_opoll, 0), v_member, 'true')), 'P0C24');
  perform pg_temp.chat_ok('C28 the admin votes there', pg_temp.chat_service(format(vote, v_opoll, pg_temp.chat_opt(v_opoll, 0), v_admin, 'true')), 'ok 1');

  -- Where any viewer may vote, and where the room must still accept posts.
  perform pg_temp.chat_ok('C29 a member votes on the owner''s Board poll (any viewer may)', pg_temp.chat_service(format(vote, v_bpoll, pg_temp.chat_opt(v_bpoll, 0), v_member, 'true')), 'ok 1');
  perform pg_temp.chat_ok('C30 so does a mod', pg_temp.chat_service(format(vote, v_bpoll, pg_temp.chat_opt(v_bpoll, 1), v_mod, 'true')), 'ok 1');
  perform pg_temp.chat_ok('C31 in the upcoming event chat: the member (Going) and the owner vote, the mod (no row) cannot',
    pg_temp.chat_service(format(vote, v_epoll, pg_temp.chat_opt(v_epoll, 0), v_member, 'true'))
    || pg_temp.chat_service(format(vote, v_epoll, pg_temp.chat_opt(v_epoll, 0), v_owner, 'true'))
    || pg_temp.chat_service(format(vote, v_epoll, pg_temp.chat_opt(v_epoll, 0), v_mod, 'true')), 'ok 1ok 1P0C24');
end $$;

-- D. As students, through the role guard, the grants and the policies ----------
do $$
declare
  v_owner    uuid := pg_temp.chat_id('owner');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_lounge   uuid := pg_temp.chat_id('lounge');
  v_board    uuid := pg_temp.chat_id('board');
  v_upcoming uuid := pg_temp.chat_id('upcoming');
  v_poll     uuid := pg_temp.chat_id('poll');
  v_bpoll    uuid := pg_temp.chat_id('bpoll');
  v_apoll    uuid;
  c          record;
  poll constant text := 'select public.chat_create_poll(%L, %L, %L, %L, %L, %s, %s, %L, %L)';
  two  constant text := '[{"label":"a"},{"label":"b"}]';
begin
  for c in
    select * from (values
      ('D1 chat_create_poll refuses a student (the route calls it with the service key)',
         format(poll, v_lounge, v_member, 'poll', 'q', two, 'false', 'false', null, 'Poll: q'), '42501'),
      ('D2 chat_create_event_card refuses a student',
         format('select public.chat_create_event_card(%L, %L, %L, null, %L)', v_lounge, v_member, v_upcoming, 'Event: x'), '42501'),
      ('D3 chat_cast_vote refuses a student',
         format('select public.chat_cast_vote(%L, %L, %L, true)', v_poll, pg_temp.chat_opt(v_poll, 0), v_member), '42501'),
      ('D4 chat_reply_counts refuses a student',
         format('select * from public.chat_reply_counts(%L, array[%L]::uuid[], %L)', v_board, v_bpoll, v_member), '42501'),
      ('D5 a student cannot read chat_polls',        'select count(*) from public.chat_polls', '42501'),
      ('D6 a student cannot read chat_poll_options', 'select count(*) from public.chat_poll_options', '42501'),
      ('D7 a student cannot read chat_poll_votes (voter names never leak)', 'select count(*) from public.chat_poll_votes', '42501'),
      ('D8 a student cannot read chat_event_cards',  'select count(*) from public.chat_event_cards', '42501'),
      ('D9 a student cannot write chat_polls',
         format('insert into public.chat_polls (message_id, channel_id, mode, question, created_by) values (%L, %L, %L, %L, %L)', v_poll, v_lounge, 'poll', 'x', v_member), '42501'),
      ('D10 a student cannot insert a message of kind poll (A''s policy, unchanged)',
         format('insert into public.messages (channel_id, user_id, content, kind) values (%L, %L, %L, %L)', v_lounge, v_member, 'Poll: forged', 'poll'), '42501'),
      ('D11 nor an event_card with a card_event_id',
         format('insert into public.messages (channel_id, user_id, content, kind, card_event_id) values (%L, %L, %L, %L, %L)', v_lounge, v_member, 'Event: forged', 'event_card', v_upcoming), '42501'),
      ('D12 a member replies under the owner''s Board poll (allowed on purpose: a Board post may be a poll)',
         format('insert into public.messages (channel_id, user_id, content, thread_root_id) values (%L, %L, %L, %L)', v_board, v_member, 'chat-cards-check: reply', v_bpoll), 'ok 1'),
      ('D13 a member quotes a poll in the Lounge (parent_message_id keeps its meaning)',
         format('insert into public.messages (channel_id, user_id, content, parent_message_id) values (%L, %L, %L, %L)', v_lounge, v_member, 'chat-cards-check: quote', v_poll), 'ok 1'),
      ('D14 a student cannot mark a card removed (no UPDATE on messages)',
         format('update public.messages set removed_at = now() where id = %L', v_poll), '42501')
    ) as t (name, sql, want)
  loop
    perform pg_temp.chat_ok(c.name, pg_temp.chat_as(v_member, c.sql), c.want);
  end loop;

  -- The sender's own delete of a card (today's route): the cascade takes
  -- the side rows.
  select m.id into v_apoll from public.messages m where m.channel_id = v_lounge and m.content = 'Poll: Anon';
  perform pg_temp.chat_ok('D15 the mod votes on the member''s anonymous poll',
    pg_temp.chat_service(format('select public.chat_cast_vote(%L, %L, %L, true)', v_apoll, pg_temp.chat_opt(v_apoll, 0), v_mod)), 'ok 1');
  perform pg_temp.chat_ok('D16 the member deletes their own poll message (messages_delete_own)',
    pg_temp.chat_as(v_member, format('delete from public.messages where id = %L', v_apoll)), 'ok 1');
  perform pg_temp.chat_ok('D17 its poll, options and votes went with it',
    pg_temp.chat_get(format(
      'select concat_ws(''/'', (select count(*) from public.chat_polls where message_id = %1$L),
              (select count(*) from public.chat_poll_options where poll_id = %1$L),
              (select count(*) from public.chat_poll_votes where poll_id = %1$L))', v_apoll)), '0/0/0');
  perform pg_temp.chat_ok('D18 a student cannot delete someone else''s poll',
    pg_temp.chat_as(v_mod, format('delete from public.messages where id = %L', v_poll)), 'ok 0');
end $$;

-- E. chat_votes_drop_access on every path that deletes a room row -------------
-- Before this section: member holds 4 Lounge votes (b, Snacks, two on the
-- removed multi poll), 1 Board vote, 1 in the upcoming event chat; owner 1
-- Lounge (Drinks), 1 event chat; admin 1 Lounge (Snacks), 1 in Officers'
-- poll; mod 1 Lounge (a), 1 Board.
do $$
declare
  v_club     uuid := pg_temp.chat_id('club');
  v_owner    uuid := pg_temp.chat_id('owner');
  v_admin    uuid := pg_temp.chat_id('admin');
  v_member   uuid := pg_temp.chat_id('member');
  v_mod      uuid := pg_temp.chat_id('mod');
  v_lounge   uuid := pg_temp.chat_id('lounge');
  v_board    uuid := pg_temp.chat_id('board');
  v_off      uuid := pg_temp.chat_id('officers');
  v_room_up  uuid := pg_temp.chat_id('room_upcoming');
  v_upcoming uuid := pg_temp.chat_id('upcoming');
  v_poll     uuid := pg_temp.chat_id('poll');
  v_epoll    uuid := pg_temp.chat_id('epoll');
  v_card     uuid := pg_temp.chat_id('card');
  v_dm       uuid := pg_temp.chat_id('dm');
  b          uuid := pg_temp.chat_opt(pg_temp.chat_id('poll'), 1);
begin
  perform pg_temp.chat_ok('E0 the votes as this section expects them (member Lounge/Board/event, owner Lounge, admin Lounge/Officers, mod Lounge/Board)',
    concat_ws('/', pg_temp.chat_votes(v_lounge, v_member), pg_temp.chat_votes(v_board, v_member), pg_temp.chat_votes(v_room_up, v_member),
                   pg_temp.chat_votes(v_lounge, v_owner), pg_temp.chat_votes(v_lounge, v_admin), pg_temp.chat_votes(v_off, v_admin),
                   pg_temp.chat_votes(v_lounge, v_mod), pg_temp.chat_votes(v_board, v_mod)), '4/1/1/1/1/1/1/1');

  -- A room row deleted by itself (chat_repair_club 5a/5b, a room turned private).
  perform pg_temp.chat_ok('E1 the member loses the Lounge: their Lounge votes go, the Board vote and everyone else''s stay',
    pg_temp.chat_service(format('delete from public.channel_members where channel_id = %L and user_id = %L', v_lounge, v_member))
    || '/' || concat_ws('/', pg_temp.chat_votes(v_lounge, v_member), pg_temp.chat_votes(v_board, v_member),
                             pg_temp.chat_votes(v_lounge, v_owner), pg_temp.chat_votes(v_lounge, v_admin), pg_temp.chat_votes(v_lounge, v_mod)),
    'ok 1/0/1/1/1/1');
  insert into public.channel_members (channel_id, user_id, role, accepted_at, last_read_at)
  values (v_lounge, v_member, 'member', now(), now());
  perform pg_temp.chat_ok('E2 back in the Lounge the member votes again',
    pg_temp.chat_service(format('select public.chat_cast_vote(%L, %L, %L, true)', v_poll, b, v_member)) || '/' || pg_temp.chat_votes(v_lounge, v_member), 'ok 1/1');
  perform pg_temp.chat_ok('E3 the owner loses the Lounge row: an officer keeps their votes',
    pg_temp.chat_service(format('delete from public.channel_members where channel_id = %L and user_id = %L', v_lounge, v_owner))
    || '/' || pg_temp.chat_votes(v_lounge, v_owner), 'ok 1/1');
  insert into public.channel_members (channel_id, user_id, role, accepted_at, last_read_at)
  values (v_lounge, v_owner, 'member', now(), now());

  -- A leave and a removal (org_members_drop_club_access deletes every room
  -- row of the person; the trigger fires inside it).
  perform pg_temp.chat_ok('E4 the mod leaves the club: their Lounge and Board votes go',
    pg_temp.chat_service(format('delete from public.org_members where org_id = %L and user_id = %L', v_club, v_mod))
    || '/' || pg_temp.chat_votes(v_lounge, v_mod) || '/' || pg_temp.chat_votes(v_board, v_mod), 'ok 1/0/0');
  perform pg_temp.chat_ok('E5 the admin is removed: their Lounge votes go too (the org_members row is gone before the trigger looks); the Officers vote survives (that room has no rows: the known gap)',
    pg_temp.chat_service(format('delete from public.org_members where org_id = %L and user_id = %L', v_club, v_admin))
    || '/' || pg_temp.chat_votes(v_lounge, v_admin) || '/' || pg_temp.chat_votes(v_off, v_admin), 'ok 1/0/1');

  -- An RSVP withdrawn (chat_rsvps_room deletes the event-room row).
  perform pg_temp.chat_ok('E6 the member says No to the event: their vote in that chat goes, the Lounge vote stays',
    pg_temp.chat_as(v_member, format(
      'insert into public.rsvps (event_id, user_id, status) values (%L, %L, %L)
       on conflict (event_id, user_id) do update
         set event_id = excluded.event_id, user_id = excluded.user_id, status = excluded.status',
      v_upcoming, v_member, 'no'))
    || '/' || pg_temp.chat_votes(v_room_up, v_member) || '/' || pg_temp.chat_votes(v_lounge, v_member)
    || '/' || pg_temp.chat_votes(v_room_up, v_owner), 'ok 1/0/1/1');

  -- An event cancelled (DELETE /api/events/[id] as the signed-in officer):
  -- the room, its messages and their poll rows go by cascade; the Event
  -- card in the Lounge keeps its row with a null event; the trigger sees
  -- rows whose room is already gone and must stay quiet (no WARNING line).
  perform pg_temp.chat_ok('E7 the owner cancels the event',
    pg_temp.chat_as(v_owner, format('delete from public.events where id = %L returning id', v_upcoming)), 'ok 1');
  perform pg_temp.chat_ok('E8 after: the chat, its poll and the votes are gone; the Event card stays with a null event and its note',
    pg_temp.chat_get(format(
      'select concat_ws(''/'', (select count(*) from public.channels where id = %L),
              (select count(*) from public.chat_polls where message_id = %L),
              (select count(*) from public.chat_poll_votes where poll_id = %L),
              (select m.kind || '':'' || coalesce(m.card_event_id::text, ''null'') from public.messages m where m.id = %L),
              (select e.note from public.chat_event_cards e where e.message_id = %L))',
      v_room_up, v_epoll, v_epoll, v_card, v_card)), '0/0/0/event_card:null/ride?');
  -- A dm deleted (org_id null: the trigger returns at once).
  delete from public.channels where id = v_dm;
  perform pg_temp.chat_ok('E9 a dm deleted fires the trigger on rows with no club: nothing happens',
    (select count(*)::text from public.channel_members where channel_id = v_dm), '0');
end $$;

-- F. chat_reply_counts ------------------------------------------------------------
do $$
declare
  v_owner  uuid := pg_temp.chat_id('owner');
  v_member uuid := pg_temp.chat_id('member');
  v_lounge uuid := pg_temp.chat_id('lounge');
  v_board  uuid := pg_temp.chat_id('board');
  v_bpoll  uuid := pg_temp.chat_id('bpoll');
  v_post   uuid;
  v_reply  uuid;
  cnt constant text :=
    'select coalesce(string_agg(r.root::text || '':'' || r.n, '','' order by r.root), ''none'') from public.chat_reply_counts(%L, %s, %L) r';
begin
  select m.id into v_reply from public.messages m where m.thread_root_id = v_bpoll and m.content = 'chat-cards-check: reply';
  perform pg_temp.chat_ok('F1 the Board poll has one live reply (D12) for the member',
    pg_temp.chat_get(format(cnt, v_board, format('array[%L]::uuid[]', v_bpoll), v_member)), v_bpoll::text || ':1');
  perform pg_temp.chat_ok('F2 and for the owner', pg_temp.chat_get(format(cnt, v_board, format('array[%L]::uuid[]', v_bpoll), v_owner)), v_bpoll::text || ':1');
  update public.messages set removed_at = now(), removed_by = v_owner, removed_reason = 'chat-cards-check' where id = v_reply;
  perform pg_temp.chat_ok('F3 removed by the owner: nothing for the owner', pg_temp.chat_get(format(cnt, v_board, format('array[%L]::uuid[]', v_bpoll), v_owner)), 'none');
  perform pg_temp.chat_ok('F4 still one for the member (their own removed reply)', pg_temp.chat_get(format(cnt, v_board, format('array[%L]::uuid[]', v_bpoll), v_member)), v_bpoll::text || ':1');

  perform pg_temp.chat_ok('F5 the owner posts on the Board and the member replies three times',
    pg_temp.chat_as(v_owner, format('insert into public.messages (channel_id, user_id, content) values (%L, %L, %L)', v_board, v_owner, 'chat-cards-check: post')), 'ok 1');
  select m.id into v_post from public.messages m where m.channel_id = v_board and m.content = 'chat-cards-check: post';
  perform pg_temp.chat_ok('F6 three replies',
    pg_temp.chat_as(v_member, format('insert into public.messages (channel_id, user_id, content, thread_root_id) values (%1$L, %2$L, %3$L, %4$L), (%1$L, %2$L, %3$L, %4$L), (%1$L, %2$L, %3$L, %4$L)',
      v_board, v_member, 'chat-cards-check: r', v_post)), 'ok 3');
  perform pg_temp.chat_ok('F7 two roots at once: 3 and 1 for the member',
    pg_temp.chat_get(format(cnt, v_board, format('array[%L, %L]::uuid[]', v_bpoll, v_post), v_member)),
    (select string_agg(x, ',' order by x) from unnest(array[v_bpoll::text || ':1', v_post::text || ':3']) x));
  perform pg_temp.chat_ok('F8 a root asked with another room answers nothing', pg_temp.chat_get(format(cnt, v_lounge, format('array[%L]::uuid[]', v_post), v_member)), 'none');
  perform pg_temp.chat_ok('F9 an empty array answers nothing', pg_temp.chat_get(format(cnt, v_board, 'array[]::uuid[]', v_member)), 'none');
  perform pg_temp.chat_ok('F10 a null array answers nothing', pg_temp.chat_get(format(cnt, v_board, 'null::uuid[]', v_member)), 'none');
  perform pg_temp.chat_ok('F11 200 ids are accepted',
    pg_temp.chat_service(format('select * from public.chat_reply_counts(%L, (select array_agg(gen_random_uuid()) from generate_series(1, 200)), %L)', v_board, v_member)), 'ok 0');
  perform pg_temp.chat_ok('F12 201 ids are refused (the route chunks by 100)',
    pg_temp.chat_service(format('select * from public.chat_reply_counts(%L, (select array_agg(gen_random_uuid()) from generate_series(1, 201)), %L)', v_board, v_member)), '22023');
  perform pg_temp.chat_ok('F13 the service role gets the same answer as this role',
    pg_temp.chat_call('service_role', null, format(cnt, v_board, format('array[%L]::uuid[]', v_post), v_member)), v_post::text || ':3');
end $$;

-- G. The catalog, and the vote race by construction ------------------------------
do $$
declare
  def text := pg_get_functiondef('public.chat_cast_vote(uuid,uuid,uuid,boolean)'::regprocedure);
  f   record;
begin
  perform pg_temp.chat_ok('G1 chat_cast_vote locks the poll row, then the option row: "for update" twice',
    ((length(def) - length(replace(def, 'for update', ''))) / length('for update'))::text, '2');
  for f in
    select * from (values ('public.chat_polls'), ('public.chat_poll_options'),
                          ('public.chat_poll_votes'), ('public.chat_event_cards')) as t (rel)
  loop
    perform pg_temp.chat_ok('G2 ' || f.rel || ': RLS on, no policy, no client privilege, service_role without truncate',
      concat_ws('/',
        (select c.relrowsecurity from pg_class c where c.oid = f.rel::regclass)::text,
        (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = split_part(f.rel, '.', 2)),
        (has_table_privilege('anon', f.rel, 'SELECT') or has_table_privilege('authenticated', f.rel, 'SELECT')
          or has_table_privilege('anon', f.rel, 'INSERT') or has_table_privilege('authenticated', f.rel, 'INSERT'))::text,
        (has_table_privilege('service_role', f.rel, 'SELECT') and has_table_privilege('service_role', f.rel, 'INSERT')
          and has_table_privilege('service_role', f.rel, 'UPDATE') and has_table_privilege('service_role', f.rel, 'DELETE'))::text,
        has_table_privilege('service_role', f.rel, 'TRUNCATE')::text),
      'true/0/false/true/false');
  end loop;
  perform pg_temp.chat_ok('G3 the trigger is the enabled AFTER DELETE row trigger on channel_members',
    (select concat_ws('/', t.tgenabled, t.tgtype, cardinality(t.tgattr::int2[]))
       from pg_trigger t where t.tgrelid = 'public.channel_members'::regclass and t.tgname = 'chat_votes_drop_access'),
    'O/9/0');
  for f in
    select * from (values
      ('public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)', 'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_create_event_card(uuid,uuid,uuid,text,text)',                              'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_cast_vote(uuid,uuid,uuid,boolean)',                                        'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_reply_counts(uuid,uuid[],uuid)',                                           's', array['search_path=""']),
      ('public.chat_votes_drop_access()',                                                      'v', array['search_path=""'])
    ) as t (sig, vol, cfg)
  loop
    perform pg_temp.chat_ok('G4 ' || f.sig || ': SECURITY DEFINER, volatility, search_path, TimeZone',
      (select (p.prosecdef and p.provolatile = f.vol and p.proconfig = f.cfg)::text from pg_proc p where p.oid = to_regprocedure(f.sig)), 'true');
  end loop;
  perform pg_temp.chat_ok('G5 the four callable functions are executable by the three roles (the standing rule)',
    (select bool_and(has_function_privilege('anon', s.sig, 'execute') and has_function_privilege('authenticated', s.sig, 'execute')
                     and has_function_privilege('service_role', s.sig, 'execute'))::text
       from unnest(array['public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)',
                         'public.chat_create_event_card(uuid,uuid,uuid,text,text)',
                         'public.chat_cast_vote(uuid,uuid,uuid,boolean)',
                         'public.chat_reply_counts(uuid,uuid[],uuid)']) as s (sig)), 'true');
end $$;

do $$
begin
  raise notice 'chat-cards-check: all % cases passed', current_setting('chat_cards_check.passed', true);
end $$;

rollback;
