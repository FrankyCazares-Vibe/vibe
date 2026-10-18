-- club-model-check.sql: the negative tests of the club model's three
-- migrations (Franky's calls of Oct 16, 2026; batch 1A, repaired after the
-- wave-1 review):
--   supabase/migrations/20261017100000_club_model_data.sql         (M1)
--   supabase/migrations/20261017110000_board_follower_read.sql      (M2)
--   supabase/migrations/20261017120000_member_lists_members_only.sql (M3)
-- Followers (signed in, following a club) may READ its Announcement Board
-- and nothing else; only members type, react or vote; no member's name
-- reaches a non-member, through the app or straight from the database.
--
-- LOCAL ONLY. Run it AFTER the three files are applied to the local stack:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/club-model-check.sql
-- Never on production: it writes (and rolls back) accounts, two clubs, rooms,
-- messages, a poll, follows, bars, removals and blocks. It refuses any
-- connection that is not the local unix socket (docker exec), and its first
-- line is a psql command, so the Management API and the MCP refuse the file
-- before anything runs. One builder on the local database at a time: not
-- beside another check script or the seed.
-- Expected last line: club-model-check: all N cases passed.
-- Nothing is kept: ROLLBACK follows.
--
-- WHAT IT DOES. ONE transaction that ends in ROLLBACK, with its own fixtures
-- (it does not lean on the seed): fifteen throwaway accounts, a live club
-- shaped like SAE (invite only, not public) with every kind of room, a
-- hidden club, a Board post by an admin with a member's reply, a member's
-- reaction and a poll by the owner.
-- Cases:
--   R  reading: a follower is LET IN to the Board (can_view_org_channel as
--      themselves, and the Board's channels row) but reads no message row,
--      no reaction, no roster and no member list straight from the
--      database; the app serves their Board with the service role
--      (src/lib/chat/follower-board.ts). A member reads everything as before,
--      but only five columns of the member list (M3 1b): never anyone's
--      profile choices, order, title or title stamp.
--   F  who is kept off the Board: not following, barred (org_board_bars),
--      removed from the club, blocked by the owner, an admin or a mod, a
--      hidden club, the club's switch off, an unverified school email; a
--      follower's own block of an officer does not keep them off; joining
--      spends the bar.
--   O  the club's follower list (org_followers_select): the owner and admins
--      read it, never the follow of someone in a block pair with them
--      (asking to join follows the club, source 'request').
--   W  every write a follower could try, refused; the server-only tables.
--   M  a member, unaffected.
-- NOT here: the routes (src/lib/chat/*followers*.test.ts,
-- src/lib/orgs/follower-board-routes.test.ts, club-model-routes.test.ts);
-- each migration's own catalog and behaviour post-checks.
-- It raises on the first expectation that fails ("club-model-check FAILED:
-- ...") and prints one NOTICE per case that passes.
--
-- HOW IT ACTS AS SOMEONE. Students: role authenticated + their id in
-- request.jwt.claims, the way PostgREST runs a signed-in request, so every
-- policy and grant applies. The routes write with the SERVICE client: role
-- service_role, no claims. Answers: 'ok N' = the statement ran and touched N
-- rows; otherwise the SQLSTATE that refused it (42501 = a policy or a grant,
-- P0C24 = no such poll for this person, P0C25 = closed).

-- A psql command: anything that is not psql refuses the file here.
\set ON_ERROR_STOP on

begin;

-- Only on the local stack, and only on a database that has the three files.
do $$
begin
  if inet_server_addr() is not null then
    raise exception 'club-model-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if to_regclass('public.org_board_bars') is null then
    raise exception 'club-model-check: public.org_board_bars is missing. Apply 20261017100000, 20261017110000 and 20261017120000 to the local stack first';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.ok(p_case text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'club-model-check FAILED: % (got "%", expected "%")', p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('cmc.passed', (coalesce(nullif(current_setting('cmc.passed', true), ''), '0')::int + 1)::text, true);
  raise notice 'club-model-check ok: %', p_case;
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
create function pg_temp.keep(k text, v uuid) returns void language sql as $$ select set_config('cmc.' || k, v::text, true) $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select nullif(current_setting('cmc.' || k, true), '')::uuid $$;
-- As a student: a count, or the SQLSTATE.
create function pg_temp.cnt(who text, p_sql text) returns text language sql as $$
  select pg_temp.val('authenticated', pg_temp.id(who), 'select count(*)::text from (' || p_sql || ') x') $$;
create function pg_temp.as_(who text, p_sql text) returns text language sql as $$
  select pg_temp.run('authenticated', pg_temp.id(who), p_sql) $$;
create function pg_temp.svc(p_sql text) returns text language sql as $$
  select pg_temp.run('service_role', null, p_sql) $$;
-- How many messages of a room the student reads straight from the database.
create function pg_temp.reads(who text, room text) returns text language sql as $$
  select pg_temp.cnt(who, format('select 1 from public.messages where channel_id = %L', pg_temp.id(room))) $$;
-- Whether the database lets the student into a room: can_view_org_channel
-- asked as themselves, then how many channels rows of it they see
-- (channels_select_org_member is that function). 'true/1' or 'false/0'.
create function pg_temp.may(who text, room text) returns text language sql as $$
  select pg_temp.val('authenticated', pg_temp.id(who),
           format('select coalesce(public.can_view_org_channel(%L, %L), false)::text', pg_temp.id(room), pg_temp.id(who)))
      || '/' || pg_temp.cnt(who, format('select 1 from public.channels where id = %L', pg_temp.id(room))) $$;

-- Fixtures: accounts that may publish (all but 'unverified' have a verified
-- school email). ---------------------------------------------------------------
do $$
declare k text; u uuid;
begin
  foreach k in array array['owner','admin','mod','member','follower','outsider','barred','blk_admin','blk_mod',
                           'blk_owner','removed','hid_fol','unverified','they_blocked','requester'] loop
    u := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'cmc-' || k || '-' || left(u::text, 8) || '@example.test',
            jsonb_build_object('full_name', 'CMC ' || k, 'terms_version', '2026-01-01', 'age_attested', true), now(), now());
    if k <> 'unverified' then
      update public.users set school_verified = true, school_system = 'iu',
             school_email = 'cmc-' || k || '-' || left(u::text, 8) || '@iu.edu',
             campus_id = 'indianapolis', campus_set_at = now(), school = 'IU Indianapolis'
       where id = u;
    end if;
    perform pg_temp.keep(k, u);
  end loop;
end $$;

-- The clubs: one live (invite only, not public: SAE's shape), one hidden. ------
do $$
declare
  v_owner uuid := pg_temp.id('owner');
  v_club uuid := gen_random_uuid(); v_hid uuid := gen_random_uuid();
  v_room uuid := gen_random_uuid(); v_priv uuid := gen_random_uuid(); v_ev uuid := gen_random_uuid();
  v_post uuid; v_reply uuid; v_poll uuid; k text;
begin
  perform pg_temp.keep('club', v_club); perform pg_temp.keep('hidclub', v_hid);
  perform pg_temp.ok('fixture: two clubs', pg_temp.svc(format(
    'insert into public.orgs (id, handle, name, owner_id, join_policy, is_public, campus_id, school, verified) values
       (%L, %L, ''CMC Club'', %L, ''invite'', false, ''indianapolis'', ''IU Indianapolis'', true),
       (%L, %L, ''CMC Hidden'', %L, ''open'', true, ''indianapolis'', ''IU Indianapolis'', true)',
    v_club, 'cmc_' || left(v_club::text, 8), v_owner, v_hid, 'cmch_' || left(v_hid::text, 8), v_owner)), 'ok 2');
  perform pg_temp.svc(format('insert into public.org_members (org_id, user_id, role) values (%L, %L, ''owner''), (%L, %L, ''owner'')', v_club, v_owner, v_hid, v_owner));
  perform pg_temp.svc(format('select public.chat_repair_club(%L)', v_club));
  perform pg_temp.svc(format('select public.chat_repair_club(%L)', v_hid));
  foreach k in array array['admin','mod','member'] loop
    perform pg_temp.ok('fixture: ' || k || ' joins', pg_temp.svc(format(
      'insert into public.org_members (org_id, user_id, role) values (%L, %L, %L)', v_club, pg_temp.id(k), k)), 'ok 1');
  end loop;
  foreach k in array array['follower','barred','blk_admin','blk_mod','blk_owner','removed','unverified','they_blocked'] loop
    perform pg_temp.ok('fixture: ' || k || ' follows', pg_temp.svc(format(
      'insert into public.org_followers (org_id, user_id, source) values (%L, %L, ''profile'')', v_club, pg_temp.id(k))), 'ok 1');
  end loop;
  -- Asking to join follows the club (the join route, source 'request').
  perform pg_temp.ok('fixture: requester asks to join, and so follows', pg_temp.svc(format(
    'insert into public.org_followers (org_id, user_id, source) values (%L, %L, ''request'')', v_club, pg_temp.id('requester'))), 'ok 1');
  perform pg_temp.svc(format('insert into public.org_followers (org_id, user_id, source) values (%L, %L, ''profile'')', v_hid, pg_temp.id('hid_fol')));
  perform pg_temp.svc(format('update public.orgs set hidden_at = now() where id = %L', v_hid));
  perform pg_temp.svc(format('insert into public.org_board_bars (org_id, user_id, barred_by) values (%L, %L, %L)', v_club, pg_temp.id('barred'), pg_temp.id('admin')));
  perform pg_temp.svc(format('insert into public.org_removals (org_id, user_id, removed_by) values (%L, %L, %L)', v_club, pg_temp.id('removed'), pg_temp.id('admin')));
  insert into public.blocks (blocker_id, blocked_id) values
    (pg_temp.id('admin'), pg_temp.id('blk_admin')), (pg_temp.id('mod'), pg_temp.id('blk_mod')),
    (v_owner, pg_temp.id('blk_owner')), (pg_temp.id('they_blocked'), pg_temp.id('admin')),
    (pg_temp.id('requester'), v_owner);
  perform pg_temp.keep('board',    (select id from public.channels where org_id = v_club and kind = 'board'));
  perform pg_temp.keep('lounge',   (select id from public.channels where org_id = v_club and kind = 'lounge'));
  perform pg_temp.keep('officers', (select id from public.channels where org_id = v_club and kind = 'officers'));
  perform pg_temp.keep('hidboard', (select id from public.channels where org_id = v_hid and kind = 'board'));
  perform pg_temp.svc(format('insert into public.channels (id, org_id, type, name, is_private, position, kind) values
    (%L, %L, ''org_channel'', ''cmc-open'', false, 3, ''room''), (%L, %L, ''org_channel'', ''cmc-priv'', true, 4, ''room'')',
    v_room, v_club, v_priv, v_club));
  perform pg_temp.keep('room', v_room); perform pg_temp.keep('priv', v_priv);
  perform pg_temp.svc(format('insert into public.events (id, org_id, creator_id, title, starts_at, ends_at, location) values
    (%L, %L, %L, ''CMC Soon'', now() + interval ''2 days'', now() + interval ''2 days 2 hours'', ''x'')', v_ev, v_club, v_owner));
  perform pg_temp.keep('event', (select id from public.channels where event_id = v_ev));
  perform pg_temp.ok('fixture: the club has its rooms', (select count(*)::text from public.channels where org_id = v_club), '6');
  -- One message in each room (as postgres), the Board post with a reply, a
  -- member's reaction, a poll by the owner on the Board, one in the hidden club's Board.
  insert into public.messages (channel_id, user_id, content) values
    (pg_temp.id('lounge'), pg_temp.id('member'), 'cmc lounge'), (pg_temp.id('officers'), v_owner, 'cmc officers'),
    (v_room, pg_temp.id('member'), 'cmc room'), (v_priv, v_owner, 'cmc priv'),
    (pg_temp.id('event'), v_owner, 'cmc event'), (pg_temp.id('hidboard'), v_owner, 'cmc hidden board');
  insert into public.messages (channel_id, user_id, content) values (pg_temp.id('board'), pg_temp.id('admin'), 'cmc board post') returning id into v_post;
  insert into public.messages (channel_id, user_id, content, thread_root_id) values (pg_temp.id('board'), pg_temp.id('member'), 'cmc reply', v_post) returning id into v_reply;
  insert into public.message_reactions (message_id, user_id, emoji) values (v_post, pg_temp.id('member'), '👍');
  perform pg_temp.keep('post', v_post); perform pg_temp.keep('reply', v_reply);
  v_poll := public.chat_create_poll(pg_temp.id('board'), v_owner, 'poll', 'cmc poll', '[{"label":"a"},{"label":"b"}]'::jsonb, false, false, null, 'cmc poll');
  perform pg_temp.keep('poll', v_poll);
  perform pg_temp.keep('opt', (select id from public.chat_poll_options where poll_id = v_poll and position = 0));
end $$;

-- R. Reading: a follower is let in to the Board, and reads no row of it ------
do $$
declare k text;
begin
  perform pg_temp.ok('R1 the database lets a follower into the Board (the function and the channels row)', pg_temp.may('follower', 'board'), 'true/1');
  foreach k in array array['lounge','officers','room','priv','event'] loop
    perform pg_temp.ok('R2 a follower is let into nothing else: ' || k, pg_temp.may('follower', k), 'false/0');
  end loop;
  -- Every message row carries its author's id, and a Board's history holds
  -- members' posts: a follower reads none of them directly (review finding
  -- 1); the app serves the Board's officer posts with the service role.
  perform pg_temp.ok('R3 a follower reads no message row of the Board: the post, the poll and the reply', pg_temp.reads('follower', 'board'), '0');
  perform pg_temp.ok('R3 nor the officer''s post by id, with its author',
    pg_temp.cnt('follower', format('select 1 from public.messages m join public.users u on u.id = m.user_id where m.id = %L', pg_temp.id('post'))), '0');
  perform pg_temp.ok('R3 a member reads all three', pg_temp.reads('member', 'board'), '3');
  foreach k in array array['lounge','officers','room','priv','event'] loop
    perform pg_temp.ok('R4 a follower reads nothing in ' || k, pg_temp.reads('follower', k), '0');
  end loop;
  perform pg_temp.ok('R5 a follower reads no one''s reaction',
    pg_temp.cnt('follower', format('select 1 from public.message_reactions where message_id = %L', pg_temp.id('post'))), '0');
  perform pg_temp.ok('R5 a member reads it',
    pg_temp.cnt('member', format('select 1 from public.message_reactions where message_id = %L', pg_temp.id('post'))), '1');
  perform pg_temp.ok('R6 a follower reads no roster of the Board',
    pg_temp.cnt('follower', format('select 1 from public.channel_members where channel_id = %L', pg_temp.id('board'))), '0');
  perform pg_temp.ok('R6 a member does',
    pg_temp.cnt('member', format('select 1 from public.channel_members where channel_id = %L', pg_temp.id('board'))), '4');
  perform pg_temp.ok('R7 a follower reads no member list (M3)',
    pg_temp.cnt('follower', format('select 1 from public.org_members where org_id = %L', pg_temp.id('club'))), '0');
  perform pg_temp.ok('R7 a member reads it',
    pg_temp.cnt('member', format('select 1 from public.org_members where org_id = %L', pg_temp.id('club'))), '4');
  -- M3 1b (wave-3 review, finding 1): the five columns, never the profile
  -- choices or the title stamps, even of their own club's other members.
  perform pg_temp.ok('R7 a member reads the five columns of the list',
    pg_temp.cnt('member', format('select id, org_id, user_id, role, joined_at from public.org_members where org_id = %L', pg_temp.id('club'))), '4');
  perform pg_temp.ok('R7 a member reads no one''s profile choices, order, title or title stamp straight from the database',
    pg_temp.cnt('member', format('select show_on_profile from public.org_members where org_id = %L and user_id <> %L', pg_temp.id('club'), pg_temp.id('member')))
    || '/' || pg_temp.cnt('member', format('select show_title, profile_rank from public.org_members where org_id = %L', pg_temp.id('club')))
    || '/' || pg_temp.cnt('member', format('select title from public.org_members where org_id = %L', pg_temp.id('club')))
    || '/' || pg_temp.cnt('member', format('select title_set_by, title_set_at from public.org_members where org_id = %L', pg_temp.id('club')))
    || '/' || pg_temp.cnt('owner', format('select 1 from public.org_members m where m.org_id = %L and m.show_on_profile', pg_temp.id('club'))),
    '42501/42501/42501/42501/42501');
  perform pg_temp.ok('R8 can_view_org_channel never answers about someone else',
    pg_temp.val('authenticated', pg_temp.id('follower'), format('select public.can_view_org_channel(%L, %L)::text', pg_temp.id('board'), pg_temp.id('member'))), 'false');
  perform pg_temp.ok('R9 the latest-per-room read gives a follower nothing either',
    pg_temp.cnt('follower', format('select 1 from public.chat_latest_per_channel(array[%L, %L]::uuid[], 20, false, false)', pg_temp.id('board'), pg_temp.id('lounge'))), '0');
  perform pg_temp.ok('R10 signed out: no grant at all',
    pg_temp.val('anon', null, format('select count(*)::text from public.messages where channel_id = %L', pg_temp.id('board'))), '42501');
end $$;

-- F. Who is kept off the Board ---------------------------------------------------
do $$
declare k text;
begin
  foreach k in array array['outsider','barred','blk_admin','blk_mod','blk_owner','removed'] loop
    perform pg_temp.ok('F1 ' || k || ' is not let into the Board', pg_temp.may(k, 'board'), 'false/0');
  end loop;
  perform pg_temp.ok('F2 a hidden club''s follower is not let into its Board', pg_temp.may('hid_fol', 'hidboard'), 'false/0');
  perform pg_temp.ok('F3 a follower who blocked an officer still is (one way, as for joining)', pg_temp.may('they_blocked', 'board'), 'true/1');
  perform pg_temp.ok('F4 a follower without a verified school email is not (review finding 3)', pg_temp.may('unverified', 'board'), 'false/0');
  perform pg_temp.svc(format('update public.orgs set followers_read_board = false where id = %L', pg_temp.id('club')));
  perform pg_temp.ok('F5 the switch off: the follower is not let in', pg_temp.may('follower', 'board'), 'false/0');
  perform pg_temp.ok('F5 the member still reads', pg_temp.may('member', 'board') || ' ' || pg_temp.reads('member', 'board'), 'true/1 3');
  perform pg_temp.svc(format('update public.orgs set followers_read_board = true where id = %L', pg_temp.id('club')));
  perform pg_temp.svc(format('delete from public.org_board_bars where org_id = %L and user_id = %L', pg_temp.id('club'), pg_temp.id('barred')));
  perform pg_temp.ok('F6 the bar lifted: they are let in again', pg_temp.may('barred', 'board'), 'true/1');
  perform pg_temp.svc(format('insert into public.org_board_bars (org_id, user_id) values (%L, %L)', pg_temp.id('club'), pg_temp.id('barred')));
  perform pg_temp.svc(format('insert into public.org_members (org_id, user_id, role) values (%L, %L, ''member'')', pg_temp.id('club'), pg_temp.id('barred')));
  perform pg_temp.ok('F7 joining spends the bar', (select count(*)::text from public.org_board_bars where org_id = pg_temp.id('club') and user_id = pg_temp.id('barred')), '0');
end $$;

-- O. The club's follower list, through the database (review finding 2) --------
do $$
declare
  rows_of constant text := 'select 1 from public.org_followers where org_id = %L and user_id = %L';
begin
  perform pg_temp.ok('O1 the owner and an admin read a plain follower''s follow',
    pg_temp.cnt('owner', format(rows_of, pg_temp.id('club'), pg_temp.id('follower'))) || '/'
    || pg_temp.cnt('admin', format(rows_of, pg_temp.id('club'), pg_temp.id('follower'))), '1/1');
  perform pg_temp.ok('O2 a mod and a member read no one else''s follow',
    pg_temp.cnt('mod', format(rows_of, pg_temp.id('club'), pg_temp.id('follower'))) || '/'
    || pg_temp.cnt('member', format(rows_of, pg_temp.id('club'), pg_temp.id('follower'))), '0/0');
  perform pg_temp.ok('O3 a student who asked to join and blocked the owner: the owner never reads that follow; an admin does',
    pg_temp.cnt('owner', format(rows_of, pg_temp.id('club'), pg_temp.id('requester'))) || '/'
    || pg_temp.cnt('admin', format(rows_of, pg_temp.id('club'), pg_temp.id('requester'))), '0/1');
  perform pg_temp.ok('O4 either way: the admin who blocked a follower, and the admin a follower blocked, read neither follow',
    pg_temp.cnt('admin', format(rows_of, pg_temp.id('club'), pg_temp.id('blk_admin'))) || '/'
    || pg_temp.cnt('admin', format(rows_of, pg_temp.id('club'), pg_temp.id('they_blocked'))), '0/0');
  perform pg_temp.ok('O5 everyone reads their own follow',
    pg_temp.cnt('requester', format(rows_of, pg_temp.id('club'), pg_temp.id('requester'))), '1');
end $$;

-- W. Every trace a follower could leave, refused; the server-only tables -------
do $$
begin
  perform pg_temp.ok('W1 a follower posts on the Board: refused', pg_temp.as_('follower', format(
    'insert into public.messages (channel_id, user_id, content) values (%L, %L, ''cmc x'')', pg_temp.id('board'), pg_temp.id('follower'))), '42501');
  perform pg_temp.ok('W2 a follower replies on the Board: refused', pg_temp.as_('follower', format(
    'insert into public.messages (channel_id, user_id, content, thread_root_id) values (%L, %L, ''cmc x'', %L)',
    pg_temp.id('board'), pg_temp.id('follower'), pg_temp.id('post'))), '42501');
  perform pg_temp.ok('W3 a follower posts in the Lounge: refused', pg_temp.as_('follower', format(
    'insert into public.messages (channel_id, user_id, content) values (%L, %L, ''cmc x'')', pg_temp.id('lounge'), pg_temp.id('follower'))), '42501');
  perform pg_temp.ok('W4 a follower reacts on the Board: refused', pg_temp.as_('follower', format(
    'insert into public.message_reactions (message_id, user_id, emoji) values (%L, %L, ''🔥'')', pg_temp.id('post'), pg_temp.id('follower'))), '42501');
  perform pg_temp.ok('W5 a follower votes (the vote route''s call): closed', pg_temp.svc(format(
    'select public.chat_cast_vote(%L, %L, %L, true)', pg_temp.id('poll'), pg_temp.id('opt'), pg_temp.id('follower'))), 'P0C25');
  perform pg_temp.ok('W5 someone who cannot read the room: no such poll', pg_temp.svc(format(
    'select public.chat_cast_vote(%L, %L, %L, true)', pg_temp.id('poll'), pg_temp.id('opt'), pg_temp.id('outsider'))), 'P0C24');
  perform pg_temp.ok('W6 can_post for a follower, top level and reply',
    pg_temp.val('authenticated', pg_temp.id('follower'), format('select public.can_post_org_channel(%L, %L, null)::text || ''/'' || public.can_post_org_channel(%L, %L, %L)::text',
      pg_temp.id('board'), pg_temp.id('follower'), pg_temp.id('board'), pg_temp.id('follower'), pg_temp.id('post'))), 'false/false');
  perform pg_temp.ok('W7 a follower deletes a member''s reaction: nothing', pg_temp.as_('follower', format(
    'delete from public.message_reactions where message_id = %L', pg_temp.id('post'))), 'ok 0');
  perform pg_temp.ok('W8 a follower turns the switch on a club: no grant', pg_temp.as_('follower', format(
    'update public.orgs set followers_read_board = true where id = %L', pg_temp.id('club'))), '42501');
  perform pg_temp.ok('W9 a member sets their own title or profile choice directly: no grant', pg_temp.as_('member', format(
    'update public.org_members set show_on_profile = false where org_id = %L and user_id = %L', pg_temp.id('club'), pg_temp.id('member'))), '42501');
  perform pg_temp.ok('W10 a mute written directly: no grant', pg_temp.as_('follower', format(
    'insert into public.org_post_mutes (user_id, org_id) values (%L, %L)', pg_temp.id('follower'), pg_temp.id('club'))), '42501');
  perform pg_temp.ok('W11 the bars table: no grant to read', pg_temp.cnt('barred', 'select 1 from public.org_board_bars'), '42501');
  perform pg_temp.ok('W12 a follow written directly: no grant', pg_temp.as_('outsider', format(
    'insert into public.org_followers (org_id, user_id, source) values (%L, %L, ''request'')', pg_temp.id('club'), pg_temp.id('outsider'))), '42501');
  -- Mutes: each reads their own.
  perform pg_temp.svc(format('insert into public.org_post_mutes (user_id, org_id) values (%L, %L), (%L, %L)',
    pg_temp.id('follower'), pg_temp.id('club'), pg_temp.id('member'), pg_temp.id('club')));
  perform pg_temp.ok('W13 a person reads only their own mutes', pg_temp.cnt('follower', 'select 1 from public.org_post_mutes'), '1');
  perform pg_temp.ok('W13 an officer does not see who muted the club', pg_temp.cnt('owner', 'select 1 from public.org_post_mutes'), '0');
end $$;

-- M. A member, unaffected ----------------------------------------------------------
do $$
begin
  perform pg_temp.ok('M1 a member replies on the Board', pg_temp.as_('member', format(
    'insert into public.messages (channel_id, user_id, content, thread_root_id) values (%L, %L, ''cmc m'', %L)',
    pg_temp.id('board'), pg_temp.id('member'), pg_temp.id('post'))), 'ok 1');
  perform pg_temp.ok('M2 a member posts in the Lounge and the open room', pg_temp.as_('member', format(
    'insert into public.messages (channel_id, user_id, content) values (%L, %L, ''cmc m''), (%L, %L, ''cmc m'')',
    pg_temp.id('lounge'), pg_temp.id('member'), pg_temp.id('room'), pg_temp.id('member'))), 'ok 2');
  perform pg_temp.ok('M3 a member reacts', pg_temp.as_('member', format(
    'insert into public.message_reactions (message_id, user_id, emoji) values (%L, %L, ''🔥'')', pg_temp.id('post'), pg_temp.id('member'))), 'ok 1');
  perform pg_temp.ok('M4 a member votes', pg_temp.svc(format(
    'select public.chat_cast_vote(%L, %L, %L, true)', pg_temp.id('poll'), pg_temp.id('opt'), pg_temp.id('member'))), 'ok 1');
  perform pg_temp.ok('M5 a member does not read the private room; the owner does',
    pg_temp.reads('member', 'priv') || '/' || pg_temp.reads('owner', 'priv'), '0/1');
  perform pg_temp.ok('M6 a mod reads the Officers room? no; the admin does',
    pg_temp.reads('mod', 'officers') || '/' || pg_temp.reads('admin', 'officers'), '0/1');
end $$;

do $$ begin
  raise notice 'club-model-check: all % cases passed', current_setting('cmc.passed', true);
end $$;

rollback;
