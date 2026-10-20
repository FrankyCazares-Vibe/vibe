-- message-deleted-note-check.sql: the behaviour tests of deleting your own
-- message (Franky's decision 8 of Oct 19, 2026, handoffs/2026-10-19-critique/
-- DECISIONS.md: a grey "Message deleted" note stays in the message's place):
--   supabase/migrations/20261019150000_message_deleted_note.sql
-- Written for the review of Oct 19, 2026 (batch B7, finding 7): the file's
-- own post-check only probes "not found" and "signed out", and the route
-- tests only fake the function's answer, so nothing ran the rules that keep
-- the Privacy Policy's promise. This does, on real rows.
--
-- LOCAL ONLY. Run it AFTER the file is applied to the local stack:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/sql/message-deleted-note-check.sql
-- Never on production: it writes (and rolls back) three accounts, a dm, an
-- event, messages, a poll, reports, reactions, pins, notifications and
-- phone-notification rows. It refuses any connection that is not the local
-- unix socket (docker exec), and its first line is a psql command, so the
-- Management API and the MCP refuse the file before anything runs.
-- Expected last line: message-deleted-note-check: all N cases passed.
-- Nothing is kept: ROLLBACK follows.
--
-- CASES
--   W  what goes: the words, the file key, a shared post, a poll (its
--      options and votes), an event card's note, reactions, pins,
--      notification rows, unsent phone notifications; what stays: who sent
--      it, when, the chat, deleted_at; a reply that quoted it stays.
--   F  the file (purge_key): a plain photo goes; a message the Vibe team or
--      a club removed keeps it; an open or actioned report keeps it; a
--      dismissed report lets it go; a key another message names keeps it.
--   B  a Board post's replies stay under its note (thread_root_id).
--   S  someone else's message reads as not found, and nothing changes;
--      a second delete answers "already"; signed out is refused (42501).
--   H  no hard delete from a browser login any more (5b): the sender's own
--      DELETE through the REST API touches 0 rows, also on a Board post.
--   D  the database keeps the shape: no browser UPDATE of deleted_at, no row
--      born deleted, and a "deleted" row with words is refused (23514).
-- It raises on the first expectation that fails ("message-deleted-note-check
-- FAILED: ...") and prints one NOTICE per case that passes.
--
-- HOW IT ACTS AS SOMEONE: role authenticated + their id in
-- request.jwt.claims, the way PostgREST runs a signed-in request.

-- A psql command: anything that is not psql refuses the file here.
\set ON_ERROR_STOP on

begin;

do $$
begin
  if inet_server_addr() is not null then
    raise exception 'message-deleted-note-check: local only. Run it through docker exec (the unix socket), never against a remote database';
  end if;
  if to_regprocedure('public.delete_own_message(uuid)') is null then
    raise exception 'message-deleted-note-check: delete_own_message is missing. Apply 20261019150000_message_deleted_note.sql to the local stack first';
  end if;
end $$;

-- Helpers, in pg_temp: they vanish with the session and the rollback. ---------
create function pg_temp.ok(p_case text, p_got text, p_want text) returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'message-deleted-note-check FAILED: % (got "%", expected "%")', p_case, coalesce(p_got, '(null)'), coalesce(p_want, '(null)');
  end if;
  perform set_config('mdn.passed', (coalesce(nullif(current_setting('mdn.passed', true), ''), '0')::int + 1)::text, true);
  raise notice 'message-deleted-note-check ok: %', p_case;
end $$;
create function pg_temp.keep(k text, v uuid) returns void language sql as $$ select set_config('mdn.' || k, v::text, true) $$;
create function pg_temp.id(k text) returns uuid language sql as $$ select nullif(current_setting('mdn.' || k, true), '')::uuid $$;
-- A statement as p_role (and p_who's claims): 'ok N', or the SQLSTATE.
create function pg_temp.run(p_role text, p_who uuid, p_sql text) returns text language plpgsql as $$
declare me text := current_user; n bigint; got text;
begin
  perform set_config('request.jwt.claims', case when p_who is null then json_build_object('role', p_role)::text else json_build_object('sub', p_who, 'role', p_role)::text end, true);
  execute format('set local role %I', p_role);
  begin execute p_sql; get diagnostics n = row_count; got := 'ok ' || n;
  exception when others then got := sqlstate; end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return got;
end $$;
-- delete_own_message as a signed-in student (or signed out: p_who null), as
-- jsonb; {"error": SQLSTATE} when it raised.
create function pg_temp.del(p_who text, p_msg text) returns jsonb language plpgsql as $$
declare me text := current_user; got jsonb; r text := case when p_who is null then 'anon' else 'authenticated' end;
begin
  perform set_config('request.jwt.claims', case when p_who is null then json_build_object('role', 'anon')::text
                                                else json_build_object('sub', pg_temp.id(p_who), 'role', 'authenticated')::text end, true);
  execute format('set local role %I', r);
  begin got := public.delete_own_message(pg_temp.id(p_msg));
  exception when others then got := jsonb_build_object('error', sqlstate); end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return got;
end $$;
-- Rows a side table holds for a message, read as postgres (the truth).
create function pg_temp.n(p_table text, p_msg text) returns text language plpgsql as $$
declare c bigint;
begin
  execute format('select count(*) from public.%I where message_id = $1', p_table) into c using pg_temp.id(p_msg);
  return c::text;
end $$;
-- One column of a message, read as postgres; '(gone)' when the row is not there.
create function pg_temp.col(p_msg text, p_col text) returns text language plpgsql as $$
declare v text; found_it boolean;
begin
  execute format('select true, %I::text from public.messages where id = $1', p_col) into found_it, v using pg_temp.id(p_msg);
  return case when found_it then coalesce(v, '(null)') else '(gone)' end;
end $$;

-- Fixtures: three accounts, a dm between a and b, a post, an event. ----------
do $$
declare k text; u uuid; v_chat uuid := gen_random_uuid(); t0 timestamptz := now();
begin
  foreach k in array array['a', 'b', 'c'] loop
    u := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'mdn-' || k || '-' || left(u::text, 8) || '@example.test',
            jsonb_build_object('full_name', 'MDN ' || k, 'terms_version', '2026-01-01', 'age_attested', true), now(), now());
    perform pg_temp.keep(k, u);
  end loop;
  perform pg_temp.keep('chat', v_chat);
  insert into public.channels (id, type, name) values (v_chat, 'dm', '');
  insert into public.channel_members (channel_id, user_id, role, accepted_at, last_read_at)
  values (v_chat, pg_temp.id('a'), 'member', t0, t0), (v_chat, pg_temp.id('b'), 'member', t0, t0);
  perform pg_temp.keep('post', gen_random_uuid());
  insert into public.posts (id, user_id, type, content) values (pg_temp.id('post'), pg_temp.id('b'), 'post', 'mdn shared post');
  perform pg_temp.keep('event', gen_random_uuid());
  insert into public.events (id, org_id, creator_id, title, starts_at, ends_at)
  values (pg_temp.id('event'), null, pg_temp.id('a'), 'MDN event', now() + interval '1 day', now() + interval '1 day 2 hours');
  perform pg_temp.ok('fixture: three accounts in public.users',
    (select count(*)::text from public.users where id in (pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c'))), '3');
end $$;

-- Fixtures: a's messages. photo..shared share one key; the rest each their own.
do $$
declare
  v_chat uuid := pg_temp.id('chat'); v_a uuid := pg_temp.id('a'); v_b uuid := pg_temp.id('b');
  k text; opt uuid := gen_random_uuid();
  key_of constant jsonb := jsonb_build_object('photo', 'p1.jpg', 'removed', 'p2.jpg', 'open', 'p3.jpg', 'actioned', 'p4.jpg',
                                              'dismissed', 'p5.jpg', 'shared1', 'p6.jpg', 'shared2', 'p6.jpg');
begin
  foreach k in array array['photo', 'removed', 'open', 'actioned', 'dismissed', 'shared1', 'shared2'] loop
    perform pg_temp.keep(k, gen_random_uuid());
    insert into public.messages (id, channel_id, user_id, content, media_url, media_kind)
    values (pg_temp.id(k), v_chat, v_a, 'mdn ' || k, 'messages/' || v_chat || '/' || (key_of->>k), 'image');
  end loop;
  update public.messages set removed_at = now(), removed_by = v_b, removed_reason = 'mdn' where id = pg_temp.id('removed');
  insert into public.reports (reporter_id, target_type, target_id, reason_code, status) values
    (v_b, 'message', pg_temp.id('open'), 'spam', 'open'),
    (v_b, 'message', pg_temp.id('actioned'), 'spam', 'actioned'),
    (v_b, 'message', pg_temp.id('dismissed'), 'spam', 'dismissed');
  -- A shared post, a poll with a vote, an event card with a note.
  perform pg_temp.keep('sharedpost', gen_random_uuid());
  insert into public.messages (id, channel_id, user_id, content, attachment_id, attachment_kind)
  values (pg_temp.id('sharedpost'), v_chat, v_a, '', pg_temp.id('post'), 'post');
  perform pg_temp.keep('poll', gen_random_uuid());
  insert into public.messages (id, channel_id, user_id, content, kind) values (pg_temp.id('poll'), v_chat, v_a, 'Poll: mdn', 'poll');
  insert into public.chat_polls (message_id, channel_id, mode, question, created_by) values (pg_temp.id('poll'), v_chat, 'poll', 'mdn?', v_a);
  insert into public.chat_poll_options (id, poll_id, position, label) values (opt, pg_temp.id('poll'), 0, 'yes');
  insert into public.chat_poll_votes (option_id, poll_id, user_id) values (opt, pg_temp.id('poll'), v_b);
  perform pg_temp.keep('card', gen_random_uuid());
  insert into public.messages (id, channel_id, user_id, content, kind, card_event_id)
  values (pg_temp.id('card'), v_chat, v_a, 'Event: mdn', 'event_card', pg_temp.id('event'));
  insert into public.chat_event_cards (message_id, note) values (pg_temp.id('card'), 'see you there');
  -- What hangs off the photo: b's reaction, a pin, a notification row, an unsent phone notification.
  insert into public.message_reactions (message_id, user_id, emoji) values (pg_temp.id('photo'), v_b, '🔥');
  insert into public.chat_message_pins (message_id, channel_id, pinned_by) values (pg_temp.id('photo'), v_chat, v_b);
  insert into public.notifications (user_id, actor_id, type, message_id) values (v_b, v_a, 'mention', pg_temp.id('photo'));
  insert into public.push_outbox (recipient_id, source, message_id) values (v_b, 'message', pg_temp.id('photo'));
  -- b's reply quoting the photo; a "Board post" by a with b's reply under it.
  perform pg_temp.keep('quote', gen_random_uuid());
  insert into public.messages (id, channel_id, user_id, content, parent_message_id) values (pg_temp.id('quote'), v_chat, v_b, 'mdn quote', pg_temp.id('photo'));
  perform pg_temp.keep('bpost', gen_random_uuid());
  insert into public.messages (id, channel_id, user_id, content) values (pg_temp.id('bpost'), v_chat, v_a, 'mdn board post');
  perform pg_temp.keep('breply', gen_random_uuid());
  insert into public.messages (id, channel_id, user_id, content, thread_root_id) values (pg_temp.id('breply'), v_chat, v_b, 'mdn board reply', pg_temp.id('bpost'));
  perform pg_temp.keep('hard', gen_random_uuid());
  insert into public.messages (id, channel_id, user_id, content) values (pg_temp.id('hard'), v_chat, v_a, 'mdn hard delete');
  perform pg_temp.ok('fixture: the photo has a reaction, a pin, a notification and a phone notification',
    pg_temp.n('message_reactions', 'photo') || pg_temp.n('chat_message_pins', 'photo') || pg_temp.n('notifications', 'photo') || pg_temp.n('push_outbox', 'photo'), '1111');
end $$;

-- S. Who may delete. ---------------------------------------------------------
do $$
begin
  perform pg_temp.ok('S1 b deleting a''s photo reads as not found', pg_temp.del('b', 'photo')::text, '{"status": "not_found"}');
  perform pg_temp.ok('S1 ...and nothing changed', pg_temp.col('photo', 'content') || ' / ' || pg_temp.n('message_reactions', 'photo'), 'mdn photo / 1');
  perform pg_temp.ok('S2 a stranger (c) too', pg_temp.del('c', 'photo')->>'status', 'not_found');
  perform pg_temp.ok('S3 signed out is refused inside (42501)', pg_temp.del(null, 'photo')->>'error', '42501');
end $$;

-- W + F1. The plain photo: everything goes, the file may go. ------------------
do $$
declare got jsonb := pg_temp.del('a', 'photo');
begin
  perform pg_temp.ok('W1 deleted', got->>'status', 'deleted');
  perform pg_temp.ok('F1 a plain photo hands back its key', got->>'purge_key', 'messages/' || pg_temp.id('chat') || '/p1.jpg');
  perform pg_temp.ok('W2 the words, the key and the kind are gone',
    pg_temp.col('photo', 'content') || '|' || pg_temp.col('photo', 'media_url') || '|' || pg_temp.col('photo', 'media_kind'), '|(null)|(null)');
  perform pg_temp.ok('W3 who, which chat and deleted_at stay',
    (pg_temp.col('photo', 'user_id') = pg_temp.id('a')::text and pg_temp.col('photo', 'channel_id') = pg_temp.id('chat')::text
       and pg_temp.col('photo', 'deleted_at') <> '(null)')::text, 'true');
  perform pg_temp.ok('W4 reactions, pins, notification rows, phone notifications: none left',
    pg_temp.n('message_reactions', 'photo') || pg_temp.n('chat_message_pins', 'photo') || pg_temp.n('notifications', 'photo') || pg_temp.n('push_outbox', 'photo'), '0000');
  perform pg_temp.ok('W5 the reply that quoted it stays, still pointing at the note',
    pg_temp.col('quote', 'content') || '|' || pg_temp.col('quote', 'parent_message_id'), 'mdn quote|' || pg_temp.id('photo'));
  perform pg_temp.ok('S4 a second delete answers already', pg_temp.del('a', 'photo')->>'status', 'already');
end $$;

-- F. When the file is kept. ----------------------------------------------------
do $$
declare got jsonb;
begin
  got := pg_temp.del('a', 'removed');
  perform pg_temp.ok('F2 a removed message becomes the note but keeps its file', (got->>'status') || '|' || coalesce(got->>'purge_key', 'kept'), 'deleted|kept');
  perform pg_temp.ok('F2 ...and stays removed', (pg_temp.col('removed', 'removed_at') <> '(null)')::text, 'true');
  got := pg_temp.del('a', 'open');
  perform pg_temp.ok('F3 an open report keeps the file', (got->>'status') || '|' || coalesce(got->>'purge_key', 'kept'), 'deleted|kept');
  got := pg_temp.del('a', 'actioned');
  perform pg_temp.ok('F4 an actioned report keeps the file', (got->>'status') || '|' || coalesce(got->>'purge_key', 'kept'), 'deleted|kept');
  got := pg_temp.del('a', 'dismissed');
  perform pg_temp.ok('F5 a dismissed report lets it go', got->>'purge_key', 'messages/' || pg_temp.id('chat') || '/p5.jpg');
  got := pg_temp.del('a', 'shared1');
  perform pg_temp.ok('F6 a key another message names is kept', (got->>'status') || '|' || coalesce(got->>'purge_key', 'kept'), 'deleted|kept');
  perform pg_temp.ok('F6 ...and that other message keeps it', pg_temp.col('shared2', 'media_url'), 'messages/' || pg_temp.id('chat') || '/p6.jpg');
  got := pg_temp.del('a', 'shared2');
  perform pg_temp.ok('F7 the last message naming the key lets it go', got->>'purge_key', 'messages/' || pg_temp.id('chat') || '/p6.jpg');
end $$;

-- W. A shared post, a poll, an event card. -------------------------------------
do $$
begin
  perform pg_temp.ok('W6 a shared post: deleted, no post link left', (pg_temp.del('a', 'sharedpost')->>'status') || '|' || pg_temp.col('sharedpost', 'attachment_id') || '|' || pg_temp.col('sharedpost', 'attachment_kind'), 'deleted|(null)|(null)');
  perform pg_temp.ok('W6 ...the post itself is untouched', (select count(*)::text from public.posts where id = pg_temp.id('post')), '1');
  perform pg_temp.ok('W7 a poll: deleted, kind text', (pg_temp.del('a', 'poll')->>'status') || '|' || pg_temp.col('poll', 'kind'), 'deleted|text');
  perform pg_temp.ok('W7 ...its poll, options and votes are gone',
    pg_temp.n('chat_polls', 'poll') || (select count(*)::text from public.chat_poll_options where poll_id = pg_temp.id('poll'))
      || (select count(*)::text from public.chat_poll_votes where poll_id = pg_temp.id('poll')), '000');
  perform pg_temp.ok('W8 an event card: deleted, no event, no note',
    (pg_temp.del('a', 'card')->>'status') || '|' || pg_temp.col('card', 'card_event_id') || '|' || pg_temp.n('chat_event_cards', 'card'), 'deleted|(null)|0');
  perform pg_temp.ok('W8 ...the event itself is untouched', (select count(*)::text from public.events where id = pg_temp.id('event')), '1');
end $$;

-- H. No hard delete from a browser login (5b). Before the policy drop the
-- sender's own DELETE took the row (and, for a post, every reply under it).
do $$
begin
  perform pg_temp.ok('H1 the sender''s own REST delete touches nothing',
    pg_temp.run('authenticated', pg_temp.id('a'), format('delete from public.messages where id = %L', pg_temp.id('hard'))), 'ok 0');
  perform pg_temp.ok('H1 ...the message is still there', pg_temp.col('hard', 'content'), 'mdn hard delete');
  perform pg_temp.ok('H2 nor on a post with a reply under it',
    pg_temp.run('authenticated', pg_temp.id('a'), format('delete from public.messages where id = %L', pg_temp.id('bpost'))), 'ok 0');
  perform pg_temp.ok('H2 ...the post and the reply are both there',
    (select count(*)::text from public.messages where id in (pg_temp.id('bpost'), pg_temp.id('breply'))), '2');
  perform pg_temp.ok('H3 nor a delete of everything of mine in the chat',
    pg_temp.run('authenticated', pg_temp.id('a'), format('delete from public.messages where channel_id = %L', pg_temp.id('chat'))), 'ok 0');
  perform pg_temp.ok('H4 no DELETE policy on messages', (select count(*)::text from pg_policy where polrelid = 'public.messages'::regclass and polcmd in ('d', '*')), '0');
end $$;

-- B. A Board post's replies stay under its note. --------------------------------
do $$
begin
  perform pg_temp.ok('B1 the post is deleted', pg_temp.del('a', 'bpost')->>'status', 'deleted');
  perform pg_temp.ok('B1 ...the reply stays, under it',
    pg_temp.col('breply', 'content') || '|' || pg_temp.col('breply', 'thread_root_id'), 'mdn board reply|' || pg_temp.id('bpost'));
end $$;

-- D. The database keeps the shape, whoever writes. --------------------------------
do $$
declare v_x uuid := gen_random_uuid();
begin
  perform pg_temp.ok('D1 a browser login cannot set deleted_at itself',
    pg_temp.run('authenticated', pg_temp.id('a'), format('update public.messages set deleted_at = now() where id = %L', pg_temp.id('hard'))), '42501');
  insert into public.messages (id, channel_id, user_id, content, deleted_at) values (v_x, pg_temp.id('chat'), pg_temp.id('a'), 'mdn born deleted', now());
  perform pg_temp.ok('D2 no row is born deleted (the insert trigger)', (select coalesce(deleted_at::text, 'null') from public.messages where id = v_x), 'null');
  begin
    update public.messages set deleted_at = now() where id = pg_temp.id('hard');
    raise exception 'message-deleted-note-check FAILED: D3 a deleted row with words was stored';
  exception when check_violation then
    perform pg_temp.ok('D3 a "deleted" row with words is refused (23514)', 'refused', 'refused');
  end;
  perform pg_temp.ok('D4 every note holds no words, no file, no card',
    (select count(*)::text from public.messages where channel_id = pg_temp.id('chat') and deleted_at is not null
        and (content <> '' or media_url is not null or attachment_id is not null or card_event_id is not null or kind <> 'text')), '0');
  perform pg_temp.ok('D5 eleven notes in the chat', (select count(*)::text from public.messages where channel_id = pg_temp.id('chat') and deleted_at is not null), '11');
end $$;

do $$
begin
  raise notice 'message-deleted-note-check: all % cases passed', current_setting('mdn.passed', true);
end $$;

rollback;
