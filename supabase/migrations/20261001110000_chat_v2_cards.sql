-- S70 club chat, wave 2, batch W2-B1 (contract: section 3 of
-- handoffs/chat-redesign/wave-2-contracts.md): the cards. Migration B: four
-- tables, four callable functions, one trigger. Migration A is
-- 20261001100000_chat_v2_rooms.sql (the rooms); this file needs it.
--
-- WHY THIS EXISTS. Franky's calls (wave-0-decisions.md): a club room can hold
-- a poll (names by default, an "anonymous" switch for counts only), a sign-up
-- (slots with a capacity, names always shown) and an Event card (one of the
-- club's events, with a note). A card is a messages row of kind poll /
-- event_card whose content is the card's fallback text (what every old
-- screen shows), plus its side rows here. Only the functions of this file
-- write a card: both INSERT policies of A keep every client write at
-- kind = 'text', the routes call the functions with the service key after
-- their own gates, and the functions refuse the client roles from the inside.
--
-- WHAT IT DOES (statements in the order 3.0 to 3.9 of the contract; the step
-- numbers below are the contract's subsections, so 2 and 6 have no statement
-- of their own)
--   0. PRE-FLIGHT, catalog and count reads only: not already applied, A is
--      there (its columns, can_post_org_channel, its two CHECKs on messages),
--      the three fingerprints, the two INSERT policy texts (and the SELECT
--      policy once it is pinned), the grants as found, every name free, the
--      trigger sets traced, no card row yet, the standing rule.
--   1. Tables chat_polls, chat_poll_options, chat_poll_votes and
--      chat_event_cards with 21 named constraints and 3 indexes; RLS on with
--      NO policy; revoke all from the three roles, service_role gets select,
--      insert, update, delete; a comment each.
--   2. (No statement: the SQLSTATE -> route-code table, below.)
--   3. chat_create_poll (a poll or a sign-up, with its options).
--   4. chat_create_event_card and chat_cast_vote.
--   5. chat_reply_counts (the grouped Board reply count) and the trigger
--      chat_votes_drop_access on channel_members, AFTER DELETE: a person who
--      loses a room loses their votes there; owners and admins keep theirs.
--   6. (No statement of its own: grant execute and comment on function right
--      after each function; the trigger function gets no grant statement.)
--   7. POST-CHECK by reading, in the same transaction. Its LAST block
--      compares the constants the Mac rehearsal pastes in (the SELECT policy
--      text, the 21 constraint texts, the five function md5s) and prints
--      them all when any is empty: one place, one raise.
--   8. POST-CHECK BY BEHAVIOUR in a nested block that raises P0C29 so it
--      rolls itself back; SKIPPED with a recorded reason when no fixture can
--      be found.
--   9. APPLY RECORD, appended to the comment of chat_create_poll (never to
--      chat_repair_club's: A's record lives there).
--  10. notify pgrst, 'reload schema'.
--
-- DOES NOT: change any policy, grant, column, constraint or row of messages,
-- channels, channel_members, rsvps, events, org_members or any other existing
-- table. The ONE change on an existing table is the trigger on
-- channel_members (step 5). No data step, no backfill, nothing deleted.
-- messages_kind_check already allows poll and event_card (A:839-845); nothing
-- in the schema stops a card row with thread_root_id set, and the functions
-- never write one. It does not check consent, publish or restriction (the
-- route does: contract 3.3.1), does not pin is_blocked_either_way (this file
-- never calls it), and does not fix the ACL of org_channel_members or
-- message_reactions (wave-1 contract 3.8, moved out).
--
-- THE SQLSTATE -> ROUTE-CODE TABLE (contract 3.2; every function raises with
-- one of these and the routes map them)
--   42501  the caller is anon or authenticated (the first statement of every
--          function)         -> never reached by a route (they call with the
--                               service role); over REST it is "not allowed"
--   P0C21  can_post_org_channel(channel, user, null) is false (not a member,
--          not an officer on a Board, a closed event chat, a dm)
--                            -> 403 board_officers_only or room_closed
--   P0C22  a bad shape (mode, counts, labels, capacity, note, content,
--          closes_at in the past)                       -> 400 invalid_card
--   P0C23  the event is missing, belongs to another club, has no club, or
--          has ended                                    -> 404 event_not_found
--   P0C24  the poll, option or message is not there for this person
--          (missing, removed, not viewable, option of another poll)
--                                                       -> 404 not_found
--   P0C25  past closes_at, or the room no longer accepts posts (a closed
--          event chat)                                  -> 409 poll_closed
--   P0C26  a sign-up slot at capacity                   -> 409 slot_full
--   22023  more than 200 ids to chat_reply_counts       -> never (the route
--                                                          chunks by 100)
--   P0C29  this file's own behaviour probe rolls itself back (A used P0C21;
--          this file may not: P0C21 is a refusal code here)
--   Any other error from a function: PGRST202 / 42883 (function missing) =
--   the schema is missing -> 404 not_found; anything else -> 503 try_again,
--   logged with the SQLSTATE. 22003 (a capacity past integer) cannot be
--   raised: the capacity regex is ^[0-9]{1,3}$ and the route refuses first.
--
-- DEPARTURES FROM THE WAVE-1 CONTRACT'S SECTION 4, each said out loud
-- (contract 3): (a) a fourth table chat_event_cards holds the Event card's
-- note (deriving it from messages.content breaks when the event is renamed);
-- (b) chat_create_event_card takes p_note before p_content; (c) a
-- chat_reply_counts function (carry-over C2); (d) messages.content for a card
-- is built by the route with cardFallbackContent() and checked here (1-300
-- characters); (e) chat_poll_votes carries the composite foreign key
-- (option_id, poll_id), so an option can never be counted under another poll.
--
-- LIVE STATE (what this file was written against: A's header and POST-CHECK
-- and the wave-2 database map, read in a CLOUD session on 2026-09-30, nothing
-- run; production = local for all of it, A:66-70; the S69 close says A is
-- live on production since Sept 30 00:13 UTC):
--   * md5(pg_get_functiondef) after A: can_view_org_channel(uuid, uuid) =
--     747ee06d2e4c3e8a788129f7530ec0ae; can_post_org_channel(uuid, uuid,
--     uuid) = 8d8be860d3f7077b9d6f9238705bdca7; org_members_drop_club_access()
--     = 0e7baa973042be8ca0decb7df1ca6407 (unchanged by A). This file restates
--     none of them: it calls the first two, and the third's DELETE is the row
--     path the new trigger rides on.
--   * messages: 2 permissive INSERT policies (messages_insert_member,
--     messages_insert_org_member) with the texts A left (A:1519-1528), no
--     UPDATE policy; authenticated holds table INSERT, no UPDATE; anon holds
--     no SELECT. The SELECT policy messages_select_org_member is NOT changed
--     here; its deparsed text is read on the Mac (want_select, PRE-FLIGHT d:
--     empty in this commit).
--   * Triggers: channel_members NONE; messages exactly
--     bump_org_activity_on_message and messages_check_media_ref; org_members
--     5 (org_members_clear_removal_on_join, org_members_drop_club_access,
--     org_members_imply_follow, org_members_unfollow_on_leave,
--     chat_org_members_rooms); channels 2 (chat_channels_fill_kind,
--     chat_channels_subscribe); rsvps 1 (chat_rsvps_room); events 1
--     (chat_events_room).
--   * messages.kind is 'text' on every row and card_event_id is null on every
--     row (A:51-52: nothing writes another kind before this file).
--   * None of the names this file adds exists in any migration.
--   * The constants of step 7 (want_select, the 21 want_con_*, the five
--     want_fn_*) are EMPTY in this commit: the first Mac rehearsal prints
--     them as NOTICE lines and refuses the file ("constants are empty"); the
--     paste is one edit; the second rehearsal is green (contract 13.3, Mac
--     step 1); the constants commit lands on the branch before the apply. No
--     real apply runs with an empty constant.
--   * select version() on the local stack (PRE-CHECK 5), recorded by the Mac
--     rehearsal: <filled by the Mac rehearsal>
--
-- PRE-CHECK (read-only, on production, on the apply day, in a UTC session:
-- the Supabase MCP and psql default). RAISE NOTICE lines do not come back
-- through the Management API, so these answers are how the person applying
-- knows beforehand what the file will do.
--   1. Not applied yet. Expected: null.
--     select to_regclass('public.chat_polls');
--   2. The three fingerprints. Expected: the three md5s of LIVE STATE.
--     select p.oid::regprocedure as fn, md5(pg_get_functiondef(p.oid)) as md5
--       from pg_proc p
--      where p.oid in (to_regprocedure('public.can_view_org_channel(uuid,uuid)'),
--                      to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)'),
--                      to_regprocedure('public.org_members_drop_club_access()'));
--   3. No card row. Expected: 0. Anything else = PRE-FLIGHT h stops the file
--      (Stop and ask Franky); a re-apply after a ROLLBACK that kept the rows
--      is the chat_cards.allow_orphans case of the ROLLBACK section.
--     select count(*) from public.messages where kind <> 'text';
--   4. No trigger on channel_members yet. Expected: no rows.
--     select tgname from pg_trigger
--      where tgrelid = 'public.channel_members'::regclass and not tgisinternal;
--   5. The server version equals the local stack's (the deparsed texts of
--      step 7 are server-version-dependent in principle; A's held across
--      both). Expected: the version() line of LIVE STATE.
--     select version();
--
-- APPLY ORDER vs THE DEPLOY (contract 3.10): the branch is green in the cloud
-- and pushed, the Preview build is green, the Mac gates pass, the constants
-- commit is on the branch -> the five PRE-CHECK queries -> Franky's yes ->
-- this file is applied on production and recorded -> the branch is merged to
-- main -> the flag's env vars are set for Production and the project is
-- redeployed. Inside that window old code (wave 1) runs on the new database
-- and nothing changes for it: no policy, grant or column of messages moves,
-- every client write stays kind = 'text', and the old reads already select
-- kind, thread_root_id and card_event_id. New code on a database without
-- this file answers 404 not_found on the card routes (isMissingChatSchema).
-- Needs Franky's yes, at a quiet hour. LOCKS: the five REFERENCES of step 1
-- hold SHARE ROW EXCLUSIVE on messages, channels and users from step 1 to
-- COMMIT (chat sends, the users.last_active_at heartbeat write and a
-- sign-up's users row queue behind it; reads and RI checks proceed); CREATE
-- TRIGGER takes the same class on channel_members. lock_timeout is 5
-- seconds: the file gives up rather than queue. The behaviour probe (step 8)
-- runs inside that window and stays short: one fixture search of at most 50
-- candidates, no loops over real rows.
-- Apply with the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, sending in ONE request body the
-- line
--   select set_config('chat_cards.file_md5', '<md5sum of git show origin/<branch>:supabase/migrations/20261001110000_chat_v2_cards.sql>', false);
-- followed by the file's text from that same `git show` (never the working
-- tree). The md5 is HANDED TO the file, never written in it: a file cannot
-- hold its own md5sum. Locally, one psql invocation:
--   psql -v ON_ERROR_STOP=1 -c "select set_config('chat_cards.file_md5', '<md5>', false)" -f <file>
-- (one session, so the session-level setting reaches the file), or the line
-- prepended to a copy. A rehearsal may skip it: the record then reads
-- "file md5 NOT GIVEN", not an error at apply time, but it fails CHECK AFTER
-- APPLYING (4). Then record the apply, a SEPARATE request:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261001110000', 'chat_v2_cards');
--
-- The Management API answers an empty result on success and the error text
-- on a failure: everything that must stop the apply is a RAISE EXCEPTION
-- (the whole file rolls back). A second run on a database that has the file
-- stops at once with "already applied".
--
-- CHECK AFTER APPLYING (read-only, a UTC session):
--   1. The APPLY RECORD, the last sentence of the comment of chat_create_poll:
--      when it ran, tables 4 / functions 5 / trigger 1, the file md5, whether
--      the behaviour probe passed or was skipped (and why), the notes.
--     select obj_description('public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)'::regprocedure, 'pg_proc') as apply_record;
--   2. No card yet. Expected: 0 on the apply day.
--     select count(*) from public.chat_polls;
--   3. scripts/sql/chat-v2-after-deploy.sql still prints 0 findings.
--   4. The `file md5` in the record equals `md5sum` of
--      supabase/migrations/20261001110000_chat_v2_cards.sql on main after the
--      merge (what was applied is what is merged). NOT GIVEN fails it.
-- Behaviour, local only: scripts/sql/chat-v2-cards-check.sql (every case),
-- and scripts/sql/chat-v2-rooms-check.sql still 200/200.
--
-- ROLLBACK (restore the previous deployment FIRST: Vercel's instant rollback,
-- it carries its own env; then this, in one transaction. Migration A's
-- rollback comes AFTER this one, never before). What it does NOT undo, first:
-- the messages rows of kind poll / event_card stay (A's messages_kind_check
-- allows them; the old screens show their fallback text; their replies stay
-- under them). With Franky's yes, BEFORE the tables are dropped:
--   --   DELETE FROM public.messages WHERE kind <> 'text';   -- their replies go by cascade
-- Without that DELETE this file cannot be applied again: PRE-FLIGHT h refuses
-- card rows that have no side tables. Locally: run it. On production:
-- Franky's yes, or apply again with h answered by hand,
--   select set_config('chat_cards.allow_orphans', 'yes', false);
-- in the same session before the file (under the Management API "the same
-- session" is the same request: the line is prepended to the request body,
-- never sent apart), never by editing the guard. The DROP TABLE takes locks
-- of the same class on messages, channels and users as the CREATE did (the
-- exact mode is read from pg_locks during the Mac rehearsal).
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   drop trigger chat_votes_drop_access on public.channel_members;
--   drop function public.chat_votes_drop_access();
--   drop function public.chat_reply_counts(uuid,uuid[],uuid);
--   drop function public.chat_cast_vote(uuid,uuid,uuid,boolean);
--   drop function public.chat_create_event_card(uuid,uuid,uuid,text,text);
--   drop function public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text);
--   drop table public.chat_poll_votes, public.chat_poll_options, public.chat_polls, public.chat_event_cards;
--   delete from supabase_migrations.schema_migrations where version = '20261001110000';
--   notify pgrst, 'reload schema';
--   COMMIT;
--
-- COST (contract 3.9; the Mac fills it from the local rehearsal: fixtures
-- built with generate_series inside BEGIN ... ROLLBACK after this file's
-- body; the Postgres version and the date on the first line when filled).
--   1. EXPLAIN (ANALYZE, BUFFERS) of the reply-count SELECT of step 5 as a
--      statement over a Board of 100 posts and 2,000 replies, once with a
--      literal array of 100 ids and once through `prepare ...; explain
--      execute` with a $1 array (the generic shape, what plpgsql runs), with
--      and without the `thread_root_id is not null` term (the partial index
--      idx_messages_thread_root must apply under the generic plan too):
--        <filled by the Mac rehearsal>
--   2. `select count(*) from chat_poll_votes where option_id = ?` and
--      `delete from chat_poll_votes where poll_id = ? and user_id = ?` on a
--      poll with 500 votes:
--        <filled by the Mac rehearsal>
--   3. The trigger's `delete ... using chat_polls` for one row:
--        <filled by the Mac rehearsal>
--   4. The wall time of one chat_cast_vote call (\timing):
--        <filled by the Mac rehearsal>
--   5. The wall time of the whole file, rehearsal 2 (the lock window,
--      DATABASE-M1), and the lock modes read from pg_locks during it:
--        <filled by the Mac rehearsal>
-- ---------------------------------------------------------------------------

begin;

-- The five REFERENCES of step 1 hold SHARE ROW EXCLUSIVE on messages,
-- channels and users until COMMIT; CREATE TRIGGER takes the same class on
-- channel_members. Give up after 5 seconds rather than queue behind a long
-- read.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (contract 3.0; a to i = 3.0.1 to 3.0.9) -----------------------
-- Catalog and count reads only (never schema_migrations: the local database
-- has the 20260927 objects without their rows). It compares only values
-- known before the file was written; every value that must be read from a
-- rehearsal is checked in ONE place, the last block of step 7.
do $$
declare
  -- The two INSERT policy texts as A left them (A:1519-1528), character for
  -- character. The functions of this file insert into messages as the table
  -- owner, so neither policy is evaluated for them, but the refusal codes of
  -- this file are built on these exact terms (contract 3.3.1).
  want_org constant text := $w$((auth.uid() = user_id) AND (kind = 'text'::text) AND (card_event_id IS NULL) AND (media_url IS NULL) AND (media_kind IS NULL) AND (removed_at IS NULL) AND (removed_by IS NULL) AND (removed_reason IS NULL) AND (EXISTS ( SELECT 1
   FROM channels c
  WHERE ((c.id = messages.channel_id) AND (c.org_id IS NOT NULL) AND can_post_org_channel(c.id, auth.uid(), messages.thread_root_id)))) AND has_recorded_consent() AND can_publish_now())$w$;
  want_dm  constant text := $w$((auth.uid() = user_id) AND (kind = 'text'::text) AND (card_event_id IS NULL) AND (thread_root_id IS NULL) AND (removed_at IS NULL) AND (removed_by IS NULL) AND (removed_reason IS NULL) AND (EXISTS ( SELECT 1
   FROM (channel_members cm
     JOIN channels c ON ((c.id = cm.channel_id)))
  WHERE ((cm.channel_id = messages.channel_id) AND (cm.user_id = auth.uid()) AND (c.org_id IS NULL)))) AND (NOT (EXISTS ( SELECT 1
   FROM (channel_members peer
     JOIN blocks b ON ((((b.blocker_id = auth.uid()) AND (b.blocked_id = peer.user_id)) OR ((b.blocker_id = peer.user_id) AND (b.blocked_id = auth.uid())))))
  WHERE ((peer.channel_id = messages.channel_id) AND (peer.user_id <> auth.uid()))))) AND has_recorded_consent() AND can_publish_now())$w$;
  -- The SELECT policy the visibility rule of chat_cast_vote assumes
  -- (messages_select_org_member USING). Copied from pg_policies after the
  -- Mac rehearsal (the last block of step 7 prints it as
  -- "want_select := $w$<text>$w$"), never typed. Declared ONCE, here, and
  -- carried to step 7 through chat_cards.want_select. Empty (as in this
  -- commit) = "select policy unpinned": a NOTICE, a note in the APPLY
  -- RECORD, and step 7 refuses the file until it is pasted. An empty value
  -- is written as two single quotes on purpose: an empty dollar-quoted
  -- string would put two dollar signs in a row and end this block early.
  want_select constant text := '';
  fp  text;
  got text;
  bad text;
  n   bigint;
  m   bigint;
  f   record;
begin
  -- a. Not already applied. First, before any fingerprint: a second run
  --    would otherwise stop at a name that is taken, which points the wrong
  --    way.
  if to_regclass('public.chat_polls') is not null then
    raise exception 'chat-cards: already applied (chat_polls exists). Nothing to do';
  end if;
  perform set_config('chat_cards.want_org', want_org, true);
  perform set_config('chat_cards.want_dm', want_dm, true);
  perform set_config('chat_cards.want_select', want_select, true);
  perform set_config('chat_cards.notes', '', true);

  -- b. Migration A is there: its five columns, can_post_org_channel and the
  --    two CHECKs on messages this file leans on.
  select string_agg(w.t || '.' || w.c, ', ') into bad
    from (values ('messages', 'kind'), ('messages', 'thread_root_id'),
                 ('messages', 'card_event_id'), ('channels', 'kind'),
                 ('channels', 'event_id')) as w (t, c)
   where not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = w.t
                        and column_name = w.c);
  if bad is not null then
    raise exception 'chat-cards: migration A (20261001100000_chat_v2_rooms) is missing: no column %', bad;
  end if;
  if to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)') is null then
    raise exception 'chat-cards: migration A is missing: no can_post_org_channel(uuid,uuid,uuid)';
  end if;
  select string_agg(w.c, ', ') into bad
    from (values ('messages_kind_check'), ('messages_card_event_shape')) as w (c)
   where not exists (select 1 from pg_constraint k
                      where k.conrelid = 'public.messages'::regclass and k.conname = w.c);
  if bad is not null then
    raise exception 'chat-cards: migration A is missing: no constraint % on messages', bad;
  end if;

  -- c. The three fingerprints (md5(pg_get_functiondef), never md5(prosrc)):
  --    the two functions this file calls, and the DELETE the new trigger
  --    rides on.
  select md5(pg_get_functiondef(p.oid)) into fp from pg_proc p
   where p.oid = to_regprocedure('public.can_view_org_channel(uuid,uuid)');
  if fp is distinct from '747ee06d2e4c3e8a788129f7530ec0ae' then
    raise exception 'chat-cards: can_view_org_channel drifted (md5 %); re-read it first',
      coalesce(fp, '(missing)');
  end if;
  select md5(pg_get_functiondef(p.oid)) into fp from pg_proc p
   where p.oid = to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)');
  if fp is distinct from '8d8be860d3f7077b9d6f9238705bdca7' then
    raise exception 'chat-cards: can_post_org_channel drifted (md5 %); re-read it first',
      coalesce(fp, '(missing)');
  end if;
  select md5(pg_get_functiondef(p.oid)) into fp from pg_proc p
   where p.oid = to_regprocedure('public.org_members_drop_club_access()');
  if fp is distinct from '0e7baa973042be8ca0decb7df1ca6407' then
    raise exception 'chat-cards: org_members_drop_club_access drifted (md5 %); re-read it first',
      coalesce(fp, '(missing)');
  end if;

  -- d. The policy texts by exact pg_policies text; the SELECT policy only
  --    once it is pinned; exactly two permissive INSERT policies on messages;
  --    RLS on for messages, channels and channel_members.
  select with_check into got from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_insert_org_member' and cmd = 'INSERT';
  if got is distinct from want_org then
    raise exception 'chat-cards: messages_insert_org_member is not the one this file was written against: %',
      coalesce(got, '(missing)');
  end if;
  select with_check into got from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_insert_member' and cmd = 'INSERT';
  if got is distinct from want_dm then
    raise exception 'chat-cards: messages_insert_member is not the one this file was written against: %',
      coalesce(got, '(missing)');
  end if;
  select qual into got from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_select_org_member' and cmd = 'SELECT';
  if want_select = '' then
    raise notice 'chat-cards: select policy unpinned';
    perform set_config('chat_cards.notes', 'select policy unpinned', true);
  elsif got is distinct from want_select then
    raise exception 'chat-cards: messages_select_org_member is not the one this file was written against: %',
      coalesce(got, '(missing)');
  end if;
  select string_agg(policyname, ', ' order by policyname) into bad from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and cmd in ('INSERT', 'ALL') and permissive = 'PERMISSIVE';
  if bad is distinct from 'messages_insert_member, messages_insert_org_member' then
    raise exception 'chat-cards: the permissive INSERT policies on messages are not the two expected: %',
      coalesce(bad, '(none)');
  end if;
  if exists (select 1 from pg_class
              where oid in ('public.messages'::regclass, 'public.channels'::regclass,
                            'public.channel_members'::regclass)
                and not relrowsecurity) then
    raise exception 'chat-cards: row level security is off on messages, channels or channel_members';
  end if;

  -- e. Grants as found: a student cannot UPDATE a message or INSERT a
  --    channel or a room row, anon cannot read messages, and the two A
  --    functions are executable by the three roles (the standing rule).
  if has_table_privilege('authenticated', 'public.messages', 'UPDATE')
     or has_table_privilege('authenticated', 'public.channels', 'INSERT')
     or has_table_privilege('authenticated', 'public.channel_members', 'INSERT')
     or has_table_privilege('anon', 'public.messages', 'SELECT') then
    raise exception 'chat-cards: grants on messages, channels or channel_members are not the ones this file was written against; re-read them first';
  end if;
  for f in
    select * from (values
      ('public.can_view_org_channel(uuid,uuid)'),
      ('public.can_post_org_channel(uuid,uuid,uuid)')
    ) as t (sig)
  loop
    if not (has_function_privilege('anon', f.sig, 'execute')
        and has_function_privilege('authenticated', f.sig, 'execute')
        and has_function_privilege('service_role', f.sig, 'execute')) then
      raise exception 'chat-cards: % is not executable by anon, authenticated and service_role; re-read the grants first', f.sig;
    end if;
  end loop;

  -- f. Every name this file adds is free: the four tables, the 21
  --    constraints, the nine relations (three indexes and the six
  --    constraint-backed ones: a primary key or a unique constraint is a
  --    relation too), the five functions, the trigger.
  select string_agg(w.t, ', ') into bad
    from (values ('public.chat_polls'), ('public.chat_poll_options'),
                 ('public.chat_poll_votes'), ('public.chat_event_cards')) as w (t)
   where to_regclass(w.t) is not null;
  if bad is not null then
    raise exception 'chat-cards: a table this file adds already exists: %', bad;
  end if;
  select string_agg(c.conname, ', ') into bad from pg_constraint c
   where c.connamespace = 'public'::regnamespace
     and c.conname in ('chat_polls_pkey', 'chat_polls_message_id_fkey',
                       'chat_polls_channel_id_fkey', 'chat_polls_mode_check',
                       'chat_polls_question_check', 'chat_polls_created_by_fkey',
                       'chat_polls_signup_shape',
                       'chat_poll_options_pkey', 'chat_poll_options_poll_id_fkey',
                       'chat_poll_options_position_check', 'chat_poll_options_label_check',
                       'chat_poll_options_capacity_check',
                       'chat_poll_options_poll_id_position_key',
                       'chat_poll_options_id_poll_id_key',
                       'chat_poll_votes_poll_id_fkey', 'chat_poll_votes_user_id_fkey',
                       'chat_poll_votes_pkey', 'chat_poll_votes_option_fkey',
                       'chat_event_cards_pkey', 'chat_event_cards_message_id_fkey',
                       'chat_event_cards_note_check');
  if bad is not null then
    raise exception 'chat-cards: a constraint name this file adds is taken: %', bad;
  end if;
  select string_agg(c.relname, ', ') into bad from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('idx_chat_polls_channel', 'idx_chat_poll_votes_poll_user',
                       'idx_chat_poll_votes_user', 'chat_polls_pkey',
                       'chat_poll_options_pkey', 'chat_poll_options_poll_id_position_key',
                       'chat_poll_options_id_poll_id_key', 'chat_poll_votes_pkey',
                       'chat_event_cards_pkey');
  if bad is not null then
    raise exception 'chat-cards: an index name this file adds is taken: %', bad;
  end if;
  select string_agg(p.proname, ', ') into bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('chat_create_poll', 'chat_create_event_card', 'chat_cast_vote',
                       'chat_reply_counts', 'chat_votes_drop_access');
  if bad is not null then
    raise exception 'chat-cards: a function name this file adds is taken: %', bad;
  end if;
  if exists (select 1 from pg_trigger t
              where not t.tgisinternal
                and t.tgrelid = 'public.channel_members'::regclass
                and t.tgname = 'chat_votes_drop_access') then
    raise exception 'chat-cards: the trigger name chat_votes_drop_access on channel_members is taken';
  end if;

  -- g. The trigger sets were traced against this exact set (LIVE STATE):
  --    none on channel_members, two on messages, five on org_members, two on
  --    channels, one on rsvps, one on events. Any other name is a trigger
  --    this file was not written against; a missing one is a drift too.
  select string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ', ') into bad
    from pg_trigger t
   where not t.tgisinternal
     and t.tgrelid in ('public.channel_members'::regclass, 'public.messages'::regclass,
                       'public.org_members'::regclass, 'public.channels'::regclass,
                       'public.rsvps'::regclass, 'public.events'::regclass)
     and (t.tgrelid, t.tgname) not in (
           ('public.messages'::regclass,    'bump_org_activity_on_message'),
           ('public.messages'::regclass,    'messages_check_media_ref'),
           ('public.org_members'::regclass, 'org_members_clear_removal_on_join'),
           ('public.org_members'::regclass, 'org_members_drop_club_access'),
           ('public.org_members'::regclass, 'org_members_imply_follow'),
           ('public.org_members'::regclass, 'org_members_unfollow_on_leave'),
           ('public.org_members'::regclass, 'chat_org_members_rooms'),
           ('public.channels'::regclass,    'chat_channels_fill_kind'),
           ('public.channels'::regclass,    'chat_channels_subscribe'),
           ('public.rsvps'::regclass,       'chat_rsvps_room'),
           ('public.events'::regclass,      'chat_events_room'));
  if bad is not null then
    raise exception 'chat-cards: a trigger this file was not written against: %', bad;
  end if;
  select string_agg(w.t || ' has ' || coalesce(k.n, 0) || ' triggers, not ' || w.n, ', ') into bad
    from (values ('public.channel_members', 0), ('public.messages', 2),
                 ('public.org_members', 5), ('public.channels', 2),
                 ('public.rsvps', 1), ('public.events', 1)) as w (t, n)
    left join (select t.tgrelid, count(*) as n from pg_trigger t
                where not t.tgisinternal group by t.tgrelid) k
      on k.tgrelid = w.t::regclass
   where coalesce(k.n, 0) <> w.n;
  if bad is not null then
    raise exception 'chat-cards: %; this file was written against LIVE STATE', bad;
  end if;

  -- h. Data shape: no card row exists before this file makes them possible
  --    (a kind other than text, a card_event_id), unless a re-apply after a
  --    ROLLBACK that kept the rows says so by hand (ROLLBACK section). The
  --    row guards keep the behaviour probe's fixture search small; this
  --    file has no data step, so they are not a correctness guard.
  select count(*) into n from public.messages where kind <> 'text';
  select count(*) into m from public.messages where card_event_id is not null;
  if n > 0 or m > 0 then
    if current_setting('chat_cards.allow_orphans', true) = 'yes' then
      raise notice 'chat-cards: % card rows without side tables are allowed by hand (chat_cards.allow_orphans)', n;
      perform set_config('chat_cards.notes',
        concat_ws('; ', nullif(current_setting('chat_cards.notes', true), ''),
                  'orphans allowed: ' || n), true);
    else
      raise exception 'chat-cards: % messages of a kind other than text and % with card_event_id set, before this file made them possible. Stop and ask Franky', n, m;
    end if;
  end if;
  select count(*) into n from public.channels where type = 'org_channel';
  if n > 60 then
    raise exception 'chat-cards: % club channels, far more than this file was written for (60)', n;
  end if;
  select count(*) into n from public.orgs;
  if n > 40 then
    raise exception 'chat-cards: % clubs, far more than this file was written for (40)', n;
  end if;

  -- i. The standing rule (20260922090000): no public, non-trigger function
  --    denies EXECUTE to anon or authenticated. Read again in step 7.
  select string_agg(p.proname, ', ') into bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if bad is not null then
    raise exception 'chat-cards: functions without EXECUTE for anon or authenticated (a crash button): %', bad;
  end if;
end $$;

-- 1. Tables, constraints, indexes (contract 3.1) --------------------------------
-- Every constraint is named, so PRE-FLIGHT f and the ROLLBACK list are exact.
-- A sign-up is a poll with mode = 'signup': the "question" is its title,
-- each option is a slot with a capacity, a person may take more than one
-- slot (multi = true by the CHECK), names always show (anonymous = false). A
-- poll's options have capacity null. A poll has 2-10 options, a sign-up
-- 1-10 (the functions decide; labels need not be unique). No edits in v1.
-- The composite foreign key of chat_poll_votes makes chat_cast_vote's
-- "o.poll_id = p_poll" test structural (a mismatched row cannot exist); the
-- poll_id -> chat_polls key stays for the poll-level cascade and the
-- (poll_id, user_id) index.
create table public.chat_polls (
  message_id  uuid constraint chat_polls_pkey primary key
              constraint chat_polls_message_id_fkey references public.messages(id) on delete cascade,
  channel_id  uuid not null constraint chat_polls_channel_id_fkey references public.channels(id) on delete cascade,
  mode        text not null constraint chat_polls_mode_check check (mode in ('poll', 'signup')),
  question    text not null constraint chat_polls_question_check check (char_length(btrim(question)) between 1 and 200),
  anonymous   boolean not null default false,
  multi       boolean not null default false,
  closes_at   timestamptz,
  created_by  uuid not null constraint chat_polls_created_by_fkey references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint chat_polls_signup_shape check (mode = 'poll' or (anonymous = false and multi = true))
);
create table public.chat_poll_options (
  id        uuid constraint chat_poll_options_pkey primary key default gen_random_uuid(),
  poll_id   uuid not null constraint chat_poll_options_poll_id_fkey references public.chat_polls(message_id) on delete cascade,
  position  smallint not null constraint chat_poll_options_position_check check (position between 0 and 9),
  label     text not null constraint chat_poll_options_label_check check (char_length(btrim(label)) between 1 and 80),
  capacity  smallint constraint chat_poll_options_capacity_check check (capacity is null or capacity between 1 and 50),
  constraint chat_poll_options_poll_id_position_key unique (poll_id, position),
  constraint chat_poll_options_id_poll_id_key unique (id, poll_id)
);
create table public.chat_poll_votes (
  option_id  uuid not null,
  poll_id    uuid not null constraint chat_poll_votes_poll_id_fkey references public.chat_polls(message_id) on delete cascade,
  user_id    uuid not null constraint chat_poll_votes_user_id_fkey references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint chat_poll_votes_pkey primary key (option_id, user_id),
  constraint chat_poll_votes_option_fkey foreign key (option_id, poll_id)
    references public.chat_poll_options (id, poll_id) on delete cascade
);
create table public.chat_event_cards (
  message_id  uuid constraint chat_event_cards_pkey primary key
              constraint chat_event_cards_message_id_fkey references public.messages(id) on delete cascade,
  note        text constraint chat_event_cards_note_check check (note is null or char_length(btrim(note)) between 1 and 200),
  created_at  timestamptz not null default now()
);
create index idx_chat_polls_channel        on public.chat_polls (channel_id);
create index idx_chat_poll_votes_poll_user on public.chat_poll_votes (poll_id, user_id);
create index idx_chat_poll_votes_user      on public.chat_poll_votes (user_id);

-- RLS on with NO policy, and no grant for the client roles: the default ACL
-- would hand anon the table (the pattern of 20260923090000:1935-1936). Only
-- the functions of this file, as their owner, and the service role touch
-- these rows; voter names never leak by a direct read.
alter table public.chat_polls       enable row level security;
alter table public.chat_poll_options enable row level security;
alter table public.chat_poll_votes  enable row level security;
alter table public.chat_event_cards enable row level security;
revoke all on table public.chat_polls        from anon, authenticated, service_role;
revoke all on table public.chat_poll_options from anon, authenticated, service_role;
revoke all on table public.chat_poll_votes   from anon, authenticated, service_role;
revoke all on table public.chat_event_cards  from anon, authenticated, service_role;
grant select, insert, update, delete on table public.chat_polls        to service_role;
grant select, insert, update, delete on table public.chat_poll_options to service_role;
grant select, insert, update, delete on table public.chat_poll_votes   to service_role;
grant select, insert, update, delete on table public.chat_event_cards  to service_role;

comment on table public.chat_polls is
  'A poll (mode poll) or a sign-up (mode signup) shown as the card of the messages row message_id (kind poll, content = the fallback text); wave-2 contract 3.1. Service role only: no policy, no client grant.';
comment on table public.chat_poll_options is
  'The options of a poll (positions 0-9, capacity null) or the slots of a sign-up (capacity 1-50); wave-2 contract 3.1. Service role only.';
comment on table public.chat_poll_votes is
  'One row per (option, person); the composite key (option_id, poll_id) keeps a vote under its own poll; wave-2 contract 3.1. Service role only: voter names never leak by a direct read.';
comment on table public.chat_event_cards is
  'The note of an Event card (the messages row message_id, kind event_card, card_event_id = the event); wave-2 contract 3.1. Service role only.';

-- 3. chat_create_poll (contract 3.3, exact body) --------------------------------
-- The messages insert runs as the function's owner (postgres, the table
-- owner with BYPASSRLS), so the two INSERT policies are not evaluated; the
-- BEFORE trigger messages_check_media_ref sees media_url null and passes,
-- bump_org_activity_on_message moves orgs.last_activity_at. The row's
-- thread_root_id, card_event_id, media_* and removed_* stay null. The shape
-- checks run BEFORE can_post_org_channel so a bad body never costs a policy
-- call; the route checks the same shape first and this is the second wall.
-- The capacity regex admits three digits (1-50 with room), so the ::integer
-- cast can never raise 22003. TimeZone pinned: the closes_at compare and
-- can_post_org_channel's 7 days must read the same in every session.
create function public.chat_create_poll(
  p_channel uuid, p_user uuid, p_mode text, p_question text, p_options jsonb,
  p_anonymous boolean, p_multi boolean, p_closes_at timestamptz, p_content text
) returns uuid
language plpgsql volatile security definer
set search_path to '' set timezone to 'UTC'
as $$
declare
  v_msg       uuid;
  v_n         integer;
  v_i         integer := 0;
  v_question  text := btrim(coalesce(p_question, ''));
  v_content   text := btrim(coalesce(p_content, ''));
  v_anonymous boolean := coalesce(p_anonymous, false);
  v_multi     boolean := coalesce(p_multi, false);
  v_opt       jsonb;
  v_label     text;
  v_cap       smallint;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_channel is null or p_user is null or p_mode not in ('poll', 'signup')
     or char_length(v_question) not between 1 and 200
     or char_length(v_content) not between 1 and 300
     or (p_closes_at is not null and p_closes_at <= now())
     or jsonb_typeof(p_options) is distinct from 'array' then
    raise exception 'chat-cards: bad shape' using errcode = 'P0C22';
  end if;
  v_n := jsonb_array_length(p_options);
  if (p_mode = 'poll' and v_n not between 2 and 10) or (p_mode = 'signup' and v_n not between 1 and 10) then
    raise exception 'chat-cards: bad shape (options)' using errcode = 'P0C22';
  end if;
  if not coalesce(public.can_post_org_channel(p_channel, p_user, null), false) then
    raise exception 'chat-cards: not allowed to post here' using errcode = 'P0C21';
  end if;
  if p_mode = 'signup' then v_anonymous := false; v_multi := true; end if;

  insert into public.messages (channel_id, user_id, content, kind)
  values (p_channel, p_user, v_content, 'poll') returning id into v_msg;
  insert into public.chat_polls (message_id, channel_id, mode, question, anonymous, multi, closes_at, created_by)
  values (v_msg, p_channel, p_mode, v_question, v_anonymous, v_multi, p_closes_at, p_user);

  for v_opt in select value from jsonb_array_elements(p_options) loop
    if jsonb_typeof(v_opt) <> 'object' then
      raise exception 'chat-cards: bad shape (option)' using errcode = 'P0C22';
    end if;
    v_label := btrim(coalesce(v_opt ->> 'label', ''));
    if char_length(v_label) not between 1 and 80 then
      raise exception 'chat-cards: bad shape (label)' using errcode = 'P0C22';
    end if;
    if p_mode = 'signup' then
      if jsonb_typeof(v_opt -> 'capacity') is distinct from 'number'
         or (v_opt ->> 'capacity') !~ '^[0-9]{1,3}$' then
        raise exception 'chat-cards: bad shape (capacity)' using errcode = 'P0C22';
      end if;
      v_cap := (v_opt ->> 'capacity')::integer;
      if v_cap not between 1 and 50 then
        raise exception 'chat-cards: bad shape (capacity)' using errcode = 'P0C22';
      end if;
    else
      if v_opt ? 'capacity' and jsonb_typeof(v_opt -> 'capacity') <> 'null' then
        raise exception 'chat-cards: bad shape (capacity on a poll)' using errcode = 'P0C22';
      end if;
      v_cap := null;
    end if;
    insert into public.chat_poll_options (poll_id, position, label, capacity)
    values (v_msg, v_i, v_label, v_cap);
    v_i := v_i + 1;
  end loop;
  return v_msg;
end $$;

comment on function public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text) is
  'Writes a poll or a sign-up (wave-2 contract 3.3): the messages row (kind poll, content = the fallback text) and its chat_polls and chat_poll_options rows, as the table owner. Raises 42501 (anon or authenticated), P0C22 (a bad shape), P0C21 (can_post_org_channel is false: not a member, not an officer on a Board, a closed event chat, a dm). Does not check consent, publish or restriction: the route does.';

grant execute on function public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text) to anon, authenticated, service_role;

-- 4. chat_create_event_card and chat_cast_vote (contract 3.4, exact bodies) -----
-- 4.1 An Event card: the event must be the club's own and not ended; the
--     messages row carries card_event_id (ON DELETE SET NULL: a cancelled
--     event leaves a card with a null event), the note lives here.
create function public.chat_create_event_card(
  p_channel uuid, p_user uuid, p_event uuid, p_note text, p_content text
) returns uuid
language plpgsql volatile security definer
set search_path to '' set timezone to 'UTC'
as $$
declare
  v_msg     uuid;
  v_org     uuid;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_content text := btrim(coalesce(p_content, ''));
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_channel is null or p_user is null or p_event is null
     or (v_note is not null and char_length(v_note) > 200)
     or char_length(v_content) not between 1 and 300 then
    raise exception 'chat-cards: bad shape' using errcode = 'P0C22';
  end if;
  if not coalesce(public.can_post_org_channel(p_channel, p_user, null), false) then
    raise exception 'chat-cards: not allowed to post here' using errcode = 'P0C21';
  end if;
  select c.org_id into v_org from public.channels c where c.id = p_channel;
  if v_org is null or not exists (
       select 1 from public.events e
        where e.id = p_event and e.org_id = v_org and e.ends_at > now()) then
    raise exception 'chat-cards: event not found' using errcode = 'P0C23';
  end if;
  insert into public.messages (channel_id, user_id, content, kind, card_event_id)
  values (p_channel, p_user, v_content, 'event_card', p_event) returning id into v_msg;
  insert into public.chat_event_cards (message_id, note) values (v_msg, v_note);
  return v_msg;
end $$;

comment on function public.chat_create_event_card(uuid,uuid,uuid,text,text) is
  'Writes an Event card (wave-2 contract 3.4): the messages row (kind event_card, card_event_id = the event, content = the fallback text) and its chat_event_cards row with the note, as the table owner. Raises 42501 (anon or authenticated), P0C22 (a bad shape), P0C21 (cannot post here), P0C23 (the event is missing, belongs to another club, has no club, or has ended). Does not check consent, publish or restriction: the route does.';

grant execute on function public.chat_create_event_card(uuid,uuid,uuid,text,text) to anon, authenticated, service_role;

-- 4.2 A vote on or off. In a Board any viewer may vote (a member cannot post
--     there, but v_kind <> 'board' skips the post check); in every other kind
--     the room must still accept posts, which only an event chat past its 7
--     days refuses. can_view_org_channel answers about any uid under the
--     service role: a person who left the club, or a non-member, gets P0C24
--     (the poll "is not there" for them), never a hint that it exists. A
--     single-choice poll deletes the person's other vote on the poll first; a
--     multi poll and a sign-up keep them. Turning a vote off is idempotent.
--     The race on a 1-spot slot is settled by construction: FOR UPDATE on
--     the poll row serialises every vote on one poll, then the option row.
create function public.chat_cast_vote(p_poll uuid, p_option uuid, p_user uuid, p_on boolean)
returns void
language plpgsql volatile security definer
set search_path to '' set timezone to 'UTC'
as $$
declare
  v_poll     public.chat_polls%rowtype;
  v_removed  timestamptz;
  v_kind     text;
  v_cap      smallint;
  v_taken    integer;
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_poll is null or p_option is null or p_user is null or p_on is null then
    raise exception 'chat-cards: bad shape' using errcode = 'P0C22';
  end if;
  -- One vote at a time per poll: the poll row is the lock.
  select p.* into v_poll from public.chat_polls p where p.message_id = p_poll for update;
  if not found then raise exception 'chat-cards: no such poll' using errcode = 'P0C24'; end if;
  select m.removed_at, c.kind into v_removed, v_kind
    from public.messages m join public.channels c on c.id = m.channel_id
   where m.id = p_poll;
  if not found or v_removed is not null
     or not coalesce(public.can_view_org_channel(v_poll.channel_id, p_user), false) then
    raise exception 'chat-cards: no such poll' using errcode = 'P0C24';
  end if;
  select o.capacity into v_cap from public.chat_poll_options o
   where o.id = p_option and o.poll_id = p_poll for update;
  if not found then raise exception 'chat-cards: no such option' using errcode = 'P0C24'; end if;
  if (v_poll.closes_at is not null and v_poll.closes_at <= now())
     or (v_kind <> 'board' and not coalesce(public.can_post_org_channel(v_poll.channel_id, p_user, null), false)) then
    raise exception 'chat-cards: closed' using errcode = 'P0C25';
  end if;

  if p_on then
    if exists (select 1 from public.chat_poll_votes v where v.option_id = p_option and v.user_id = p_user) then
      return;                                   -- already theirs: nothing to do, never "slot full"
    end if;
    if v_poll.mode = 'signup' then
      select count(*) into v_taken from public.chat_poll_votes v where v.option_id = p_option;
      if v_cap is not null and v_taken >= v_cap then
        raise exception 'chat-cards: slot full' using errcode = 'P0C26';
      end if;
    elsif not v_poll.multi then
      delete from public.chat_poll_votes v where v.poll_id = p_poll and v.user_id = p_user;
    end if;
    insert into public.chat_poll_votes (option_id, poll_id, user_id)
    values (p_option, p_poll, p_user) on conflict do nothing;
  else
    delete from public.chat_poll_votes v where v.option_id = p_option and v.user_id = p_user;
  end if;
end $$;

comment on function public.chat_cast_vote(uuid,uuid,uuid,boolean) is
  'Turns one vote on or off (wave-2 contract 3.4): the poll row is the lock, a single-choice poll drops the person''s other vote first, a sign-up slot at capacity refuses, off is idempotent; in a Board any viewer may vote. Raises 42501 (anon or authenticated), P0C22 (a bad shape), P0C24 (no such poll or option for this person: missing, removed, not viewable, an option of another poll), P0C25 (closed: past closes_at, or the room no longer accepts posts), P0C26 (slot full). Does not check consent, publish or restriction: the route does.';

grant execute on function public.chat_cast_vote(uuid,uuid,uuid,boolean) to anon, authenticated, service_role;

-- 5. chat_reply_counts and the trigger chat_votes_drop_access (contract 3.5) ----
-- 5.1 The grouped reply count under Board posts (carry-over C2). Served by
--     idx_messages_thread_root (thread_root_id, created_at) where
--     thread_root_id is not null. The explicit "thread_root_id is not null"
--     is there so the partial index applies under plpgsql's generic plan too
--     (a Param array does not prove the predicate; COST 1 sees it for real).
--     It counts the viewer's OWN removed replies (B4's rule), so a post never
--     says "1 reply" above two rows. A root with no live reply returns no row
--     (the caller fills 0). STABLE (no write), with the role guard.
create function public.chat_reply_counts(p_channel uuid, p_roots uuid[], p_viewer uuid)
returns table (root uuid, n integer)
language plpgsql stable security definer
set search_path to ''
as $$
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_roots), 0) > 200 then
    raise exception 'too many ids (max 200)' using errcode = '22023';
  end if;
  return query
    select m.thread_root_id, count(*)::integer
      from public.messages m
     where m.channel_id = p_channel
       and m.thread_root_id is not null
       and m.thread_root_id = any (p_roots)
       and (m.removed_at is null or m.user_id = p_viewer)
     group by m.thread_root_id;
end $$;

comment on function public.chat_reply_counts(uuid,uuid[],uuid) is
  'The live reply count under each Board post of p_roots in room p_channel (wave-2 contract 3.5), counting the viewer''s own removed replies too; a root with no live reply returns no row. Raises 42501 (anon or authenticated), 22023 (more than 200 ids). Does not check consent, publish or restriction: the route does.';

grant execute on function public.chat_reply_counts(uuid,uuid[],uuid) to anon, authenticated, service_role;

-- 5.2 AFTER DELETE on channel_members: a person who loses a club room loses
--     their votes on that room's polls; an owner or admin of the club keeps
--     theirs (they keep the room). Where it fires: inside
--     org_members_drop_club_access's DELETE (a leave or a removal: the
--     org_members row is already gone, so owners lose theirs too), inside
--     chat_org_members_rooms (a demotion), chat_rsvps_room (an RSVP
--     withdrawn), chat_repair_club steps 5a/5b, and on every FK cascade from
--     channels or users (the parent row is gone before this AFTER ROW trigger
--     runs: v_org is null, return; the votes are already going by cascade).
--     No row found = return, never raise (A's rule); the wrap means a votes
--     bug never blocks a leave. Known gaps, accepted: the Officers room has
--     no channel_members rows, so votes there survive a demotion, a leave and
--     a removal; a room turned private and public again loses its members'
--     votes; a vote in a CLOSED event chat goes with the RSVP too.
create function public.chat_votes_drop_access() returns trigger
language plpgsql security definer
set search_path to ''
as $$
declare
  v_org uuid;
begin
  begin
    select c.org_id into v_org from public.channels c where c.id = old.channel_id;
    if v_org is null then return null; end if;               -- a dm/group row, or the room is already gone
    if exists (select 1 from public.org_members m
                where m.org_id = v_org and m.user_id = old.user_id and m.role in ('owner', 'admin')) then
      return null;                                            -- officers keep their votes (they keep the room)
    end if;
    delete from public.chat_poll_votes v
     using public.chat_polls p
     where p.message_id = v.poll_id and p.channel_id = old.channel_id and v.user_id = old.user_id;
  exception when others then
    raise warning 'chat-cards: % failed: %', tg_name, sqlerrm;
  end;
  return null;
end $$;
create trigger chat_votes_drop_access
  after delete on public.channel_members
  for each row execute function public.chat_votes_drop_access();

comment on function public.chat_votes_drop_access() is
  'AFTER DELETE on channel_members (wave-2 contract 3.5). A person who loses a club room loses their votes on that room''s polls; an owner or admin of the club keeps theirs; a dm/group row or a room already gone is nothing. Swallows its own errors (a votes bug never blocks a leave). No grant statement: a trigger function is not reachable over REST.';

-- 7. POST-CHECK inside the transaction: any miss aborts the whole file -----------
-- 7.1 By reading (contract 3.7): what this file made, as made; what it left
--     alone, as found. The constants the Mac pastes are in 7.2, LAST.
do $$
declare
  bad text;
  n   bigint;
  fp  text;
  got text;
  f   record;
begin
  -- a. The four tables: there, RLS on, no policy, no client privilege,
  --    service_role select/insert/update/delete and NOT truncate.
  for f in
    select * from (values ('public.chat_polls'), ('public.chat_poll_options'),
                          ('public.chat_poll_votes'), ('public.chat_event_cards')) as t (rel)
  loop
    if to_regclass(f.rel) is null then
      raise exception 'chat-cards: % was not created', f.rel;
    end if;
    if not exists (select 1 from pg_class c where c.oid = f.rel::regclass and c.relrowsecurity) then
      raise exception 'chat-cards: row level security is off on %', f.rel;
    end if;
    select count(*) into n from pg_policies p
     where p.schemaname = 'public' and p.tablename = split_part(f.rel, '.', 2);
    if n <> 0 then
      raise exception 'chat-cards: % has % policies; it must have none', f.rel, n;
    end if;
    if has_table_privilege('anon', f.rel, 'SELECT') or has_table_privilege('anon', f.rel, 'INSERT')
       or has_table_privilege('anon', f.rel, 'UPDATE') or has_table_privilege('anon', f.rel, 'DELETE')
       or has_table_privilege('authenticated', f.rel, 'SELECT') or has_table_privilege('authenticated', f.rel, 'INSERT')
       or has_table_privilege('authenticated', f.rel, 'UPDATE') or has_table_privilege('authenticated', f.rel, 'DELETE') then
      raise exception 'chat-cards: anon or authenticated holds a privilege on %', f.rel;
    end if;
    if not (has_table_privilege('service_role', f.rel, 'SELECT') and has_table_privilege('service_role', f.rel, 'INSERT')
        and has_table_privilege('service_role', f.rel, 'UPDATE') and has_table_privilege('service_role', f.rel, 'DELETE')) then
      raise exception 'chat-cards: service_role lacks select, insert, update or delete on %', f.rel;
    end if;
    if has_table_privilege('service_role', f.rel, 'TRUNCATE') then
      raise exception 'chat-cards: service_role may truncate %', f.rel;
    end if;
  end loop;

  -- b. The 21 constraints, each on its table; every foreign key cascades.
  select string_agg(w.rel || '.' || w.con, ', ') into bad
    from (values
      ('public.chat_polls', 'chat_polls_pkey'), ('public.chat_polls', 'chat_polls_message_id_fkey'),
      ('public.chat_polls', 'chat_polls_channel_id_fkey'), ('public.chat_polls', 'chat_polls_mode_check'),
      ('public.chat_polls', 'chat_polls_question_check'), ('public.chat_polls', 'chat_polls_created_by_fkey'),
      ('public.chat_polls', 'chat_polls_signup_shape'),
      ('public.chat_poll_options', 'chat_poll_options_pkey'), ('public.chat_poll_options', 'chat_poll_options_poll_id_fkey'),
      ('public.chat_poll_options', 'chat_poll_options_position_check'), ('public.chat_poll_options', 'chat_poll_options_label_check'),
      ('public.chat_poll_options', 'chat_poll_options_capacity_check'), ('public.chat_poll_options', 'chat_poll_options_poll_id_position_key'),
      ('public.chat_poll_options', 'chat_poll_options_id_poll_id_key'),
      ('public.chat_poll_votes', 'chat_poll_votes_poll_id_fkey'), ('public.chat_poll_votes', 'chat_poll_votes_user_id_fkey'),
      ('public.chat_poll_votes', 'chat_poll_votes_pkey'), ('public.chat_poll_votes', 'chat_poll_votes_option_fkey'),
      ('public.chat_event_cards', 'chat_event_cards_pkey'), ('public.chat_event_cards', 'chat_event_cards_message_id_fkey'),
      ('public.chat_event_cards', 'chat_event_cards_note_check')
    ) as w (rel, con)
   where not exists (select 1 from pg_constraint c
                      where c.conrelid = w.rel::regclass and c.conname = w.con);
  if bad is not null then
    raise exception 'chat-cards: constraints missing or on the wrong table: %', bad;
  end if;
  select count(*) into n from pg_constraint c
   where c.conrelid in ('public.chat_polls'::regclass, 'public.chat_poll_options'::regclass,
                        'public.chat_poll_votes'::regclass, 'public.chat_event_cards'::regclass);
  if n <> 21 then
    raise exception 'chat-cards: the four tables carry % constraints, not 21', n;
  end if;
  select string_agg(c.conname, ', ') into bad from pg_constraint c
   where c.conrelid in ('public.chat_polls'::regclass, 'public.chat_poll_options'::regclass,
                        'public.chat_poll_votes'::regclass, 'public.chat_event_cards'::regclass)
     and c.contype = 'f' and c.confdeltype <> 'c';
  if bad is not null then
    raise exception 'chat-cards: a foreign key does not cascade on delete: %', bad;
  end if;

  -- c. The five functions: SECURITY DEFINER, the volatility, search_path and
  --    TimeZone the contract names (the trigger function too); EXECUTE for
  --    the three roles on the four callable ones.
  for f in
    select * from (values
      ('public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)', 'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_create_event_card(uuid,uuid,uuid,text,text)',                              'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_cast_vote(uuid,uuid,uuid,boolean)',                                        'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_reply_counts(uuid,uuid[],uuid)',                                           's', array['search_path=""']),
      ('public.chat_votes_drop_access()',                                                      'v', array['search_path=""'])
    ) as t (sig, vol, cfg)
  loop
    if not exists (select 1 from pg_proc p
                    where p.oid = to_regprocedure(f.sig)
                      and p.prosecdef
                      and p.provolatile = f.vol
                      and p.proconfig = f.cfg) then
      raise exception 'chat-cards: % is missing, not SECURITY DEFINER, or has another volatility, search_path or TimeZone', f.sig;
    end if;
  end loop;
  for f in
    select * from (values
      ('public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)'),
      ('public.chat_create_event_card(uuid,uuid,uuid,text,text)'),
      ('public.chat_cast_vote(uuid,uuid,uuid,boolean)'),
      ('public.chat_reply_counts(uuid,uuid[],uuid)')
    ) as t (sig)
  loop
    if not (has_function_privilege('anon', f.sig, 'execute')
        and has_function_privilege('authenticated', f.sig, 'execute')
        and has_function_privilege('service_role', f.sig, 'execute')) then
      raise exception 'chat-cards: % must be executable by anon, authenticated and service_role', f.sig;
    end if;
  end loop;

  -- d. The trigger: on channel_members, enabled, AFTER DELETE FOR EACH ROW
  --    (tgtype 9 = row 1 + delete 8), no column list.
  if not exists (select 1 from pg_trigger t
                  where not t.tgisinternal
                    and t.tgrelid = 'public.channel_members'::regclass
                    and t.tgname = 'chat_votes_drop_access'
                    and t.tgenabled = 'O'
                    and t.tgtype = 9
                    and cardinality(t.tgattr::int2[]) = 0
                    and t.tgfoid = to_regprocedure('public.chat_votes_drop_access()')) then
    raise exception 'chat-cards: chat_votes_drop_access is not the enabled AFTER DELETE row trigger on channel_members';
  end if;

  -- e. Unchanged: the three fingerprints (org_members_drop_club_access stays
  --    pinned although this file never calls it: its DELETE is the row path
  --    the new trigger rides on), the two INSERT policy texts, the grants,
  --    and the trigger sets of PRE-FLIGHT g plus exactly the one new trigger
  --    on channel_members.
  for f in
    select * from (values
      ('public.can_view_org_channel(uuid,uuid)',      '747ee06d2e4c3e8a788129f7530ec0ae'),
      ('public.can_post_org_channel(uuid,uuid,uuid)', '8d8be860d3f7077b9d6f9238705bdca7'),
      ('public.org_members_drop_club_access()',       '0e7baa973042be8ca0decb7df1ca6407')
    ) as t (sig, md5)
  loop
    select md5(pg_get_functiondef(p.oid)) into fp from pg_proc p where p.oid = to_regprocedure(f.sig);
    if fp is distinct from f.md5 then
      raise exception 'chat-cards: % changed during the apply (md5 %)', f.sig, coalesce(fp, '(missing)');
    end if;
  end loop;
  select with_check into got from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_insert_org_member'
     and cmd = 'INSERT' and roles = array['authenticated']::name[] and qual is null;
  if got is distinct from current_setting('chat_cards.want_org', true) then
    raise exception 'chat-cards: messages_insert_org_member changed during the apply: %', coalesce(got, '(missing)');
  end if;
  select with_check into got from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_insert_member'
     and cmd = 'INSERT' and roles = array['authenticated']::name[] and qual is null;
  if got is distinct from current_setting('chat_cards.want_dm', true) then
    raise exception 'chat-cards: messages_insert_member changed during the apply: %', coalesce(got, '(missing)');
  end if;
  if has_table_privilege('authenticated', 'public.messages', 'UPDATE')
     or has_table_privilege('authenticated', 'public.channels', 'INSERT')
     or has_table_privilege('authenticated', 'public.channel_members', 'INSERT')
     or has_table_privilege('anon', 'public.messages', 'SELECT') then
    raise exception 'chat-cards: grants on messages, channels or channel_members are not as this file found them';
  end if;
  select string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ', ') into bad
    from pg_trigger t
   where not t.tgisinternal
     and t.tgrelid in ('public.channel_members'::regclass, 'public.messages'::regclass,
                       'public.org_members'::regclass, 'public.channels'::regclass,
                       'public.rsvps'::regclass, 'public.events'::regclass)
     and (t.tgrelid, t.tgname) not in (
           ('public.channel_members'::regclass, 'chat_votes_drop_access'),
           ('public.messages'::regclass,    'bump_org_activity_on_message'),
           ('public.messages'::regclass,    'messages_check_media_ref'),
           ('public.org_members'::regclass, 'org_members_clear_removal_on_join'),
           ('public.org_members'::regclass, 'org_members_drop_club_access'),
           ('public.org_members'::regclass, 'org_members_imply_follow'),
           ('public.org_members'::regclass, 'org_members_unfollow_on_leave'),
           ('public.org_members'::regclass, 'chat_org_members_rooms'),
           ('public.channels'::regclass,    'chat_channels_fill_kind'),
           ('public.channels'::regclass,    'chat_channels_subscribe'),
           ('public.rsvps'::regclass,       'chat_rsvps_room'),
           ('public.events'::regclass,      'chat_events_room'));
  if bad is not null then
    raise exception 'chat-cards: a trigger appeared during the apply: %', bad;
  end if;
  select string_agg(w.t || ' has ' || coalesce(k.n, 0) || ' triggers, not ' || w.n, ', ') into bad
    from (values ('public.channel_members', 1), ('public.messages', 2),
                 ('public.org_members', 5), ('public.channels', 2),
                 ('public.rsvps', 1), ('public.events', 1)) as w (t, n)
    left join (select t.tgrelid, count(*) as n from pg_trigger t
                where not t.tgisinternal group by t.tgrelid) k
      on k.tgrelid = w.t::regclass
   where coalesce(k.n, 0) <> w.n;
  if bad is not null then
    raise exception 'chat-cards: %', bad;
  end if;

  -- f. The standing rule (20260922090000): no public, non-trigger function
  --    denies EXECUTE to anon or authenticated.
  select string_agg(p.proname, ', ') into bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if bad is not null then
    raise exception 'chat-cards: functions without EXECUTE for anon or authenticated (a crash button): %', bad;
  end if;
end $$;

-- 7.2 The constants block, LAST (contract 3.7, DATABASE-M2): one place, one
--     raise. Every constant below is copied from the catalog after the Mac
--     rehearsal, never typed by hand: the first rehearsal prints them ALL as
--     NOTICE lines in paste order (want_select first, then the 21 want_con_*,
--     then the five want_fn_*) and raises "constants are empty"; the paste
--     is one edit (want_select goes into the PRE-FLIGHT, the rest here); the
--     second rehearsal is green. No real apply runs with an empty constant.
--     An empty value is written as two single quotes on purpose (an empty
--     dollar-quoted string would end this block early); a pasted text goes
--     between $w$ and $w$, a pasted md5 between single quotes.
--     The five own-function md5s are what a later file fingerprints.
do $$
declare
  want_select text := coalesce(current_setting('chat_cards.want_select', true), '');
  -- pg_get_constraintdef of the 21 constraints of step 1, in DDL order.
  want_con_chat_polls_pkey                     constant text := '';
  want_con_chat_polls_message_id_fkey          constant text := '';
  want_con_chat_polls_channel_id_fkey          constant text := '';
  want_con_chat_polls_mode_check               constant text := '';
  want_con_chat_polls_question_check           constant text := '';
  want_con_chat_polls_created_by_fkey          constant text := '';
  want_con_chat_polls_signup_shape             constant text := '';
  want_con_chat_poll_options_pkey              constant text := '';
  want_con_chat_poll_options_poll_id_fkey      constant text := '';
  want_con_chat_poll_options_position_check    constant text := '';
  want_con_chat_poll_options_label_check       constant text := '';
  want_con_chat_poll_options_capacity_check    constant text := '';
  want_con_chat_poll_options_poll_id_position_key constant text := '';
  want_con_chat_poll_options_id_poll_id_key    constant text := '';
  want_con_chat_poll_votes_poll_id_fkey        constant text := '';
  want_con_chat_poll_votes_user_id_fkey        constant text := '';
  want_con_chat_poll_votes_pkey                constant text := '';
  want_con_chat_poll_votes_option_fkey         constant text := '';
  want_con_chat_event_cards_pkey               constant text := '';
  want_con_chat_event_cards_message_id_fkey    constant text := '';
  want_con_chat_event_cards_note_check         constant text := '';
  -- md5(pg_get_functiondef) of the five functions as this file leaves them.
  want_fn_chat_create_poll        constant text := '';
  want_fn_chat_create_event_card  constant text := '';
  want_fn_chat_cast_vote          constant text := '';
  want_fn_chat_reply_counts       constant text := '';
  want_fn_chat_votes_drop_access  constant text := '';
  got_select text;
  got        text;
  f          record;
  names      text[] := '{}';
  kinds      text[] := '{}';
  gots       text[] := '{}';
  wants      text[] := '{}';
  any_empty  boolean := want_select = '';
  i          integer;
begin
  select qual into got_select from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_select_org_member' and cmd = 'SELECT';
  for f in
    select * from (values
      ( 1, 'con', 'chat_polls_pkey',                        'public.chat_polls',        want_con_chat_polls_pkey),
      ( 2, 'con', 'chat_polls_message_id_fkey',             'public.chat_polls',        want_con_chat_polls_message_id_fkey),
      ( 3, 'con', 'chat_polls_channel_id_fkey',             'public.chat_polls',        want_con_chat_polls_channel_id_fkey),
      ( 4, 'con', 'chat_polls_mode_check',                  'public.chat_polls',        want_con_chat_polls_mode_check),
      ( 5, 'con', 'chat_polls_question_check',              'public.chat_polls',        want_con_chat_polls_question_check),
      ( 6, 'con', 'chat_polls_created_by_fkey',             'public.chat_polls',        want_con_chat_polls_created_by_fkey),
      ( 7, 'con', 'chat_polls_signup_shape',                'public.chat_polls',        want_con_chat_polls_signup_shape),
      ( 8, 'con', 'chat_poll_options_pkey',                 'public.chat_poll_options', want_con_chat_poll_options_pkey),
      ( 9, 'con', 'chat_poll_options_poll_id_fkey',         'public.chat_poll_options', want_con_chat_poll_options_poll_id_fkey),
      (10, 'con', 'chat_poll_options_position_check',       'public.chat_poll_options', want_con_chat_poll_options_position_check),
      (11, 'con', 'chat_poll_options_label_check',          'public.chat_poll_options', want_con_chat_poll_options_label_check),
      (12, 'con', 'chat_poll_options_capacity_check',       'public.chat_poll_options', want_con_chat_poll_options_capacity_check),
      (13, 'con', 'chat_poll_options_poll_id_position_key', 'public.chat_poll_options', want_con_chat_poll_options_poll_id_position_key),
      (14, 'con', 'chat_poll_options_id_poll_id_key',       'public.chat_poll_options', want_con_chat_poll_options_id_poll_id_key),
      (15, 'con', 'chat_poll_votes_poll_id_fkey',           'public.chat_poll_votes',   want_con_chat_poll_votes_poll_id_fkey),
      (16, 'con', 'chat_poll_votes_user_id_fkey',           'public.chat_poll_votes',   want_con_chat_poll_votes_user_id_fkey),
      (17, 'con', 'chat_poll_votes_pkey',                   'public.chat_poll_votes',   want_con_chat_poll_votes_pkey),
      (18, 'con', 'chat_poll_votes_option_fkey',            'public.chat_poll_votes',   want_con_chat_poll_votes_option_fkey),
      (19, 'con', 'chat_event_cards_pkey',                  'public.chat_event_cards',  want_con_chat_event_cards_pkey),
      (20, 'con', 'chat_event_cards_message_id_fkey',       'public.chat_event_cards',  want_con_chat_event_cards_message_id_fkey),
      (21, 'con', 'chat_event_cards_note_check',            'public.chat_event_cards',  want_con_chat_event_cards_note_check),
      (22, 'fn',  'chat_create_poll',       'public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)', want_fn_chat_create_poll),
      (23, 'fn',  'chat_create_event_card', 'public.chat_create_event_card(uuid,uuid,uuid,text,text)',                              want_fn_chat_create_event_card),
      (24, 'fn',  'chat_cast_vote',         'public.chat_cast_vote(uuid,uuid,uuid,boolean)',                                        want_fn_chat_cast_vote),
      (25, 'fn',  'chat_reply_counts',      'public.chat_reply_counts(uuid,uuid[],uuid)',                                           want_fn_chat_reply_counts),
      (26, 'fn',  'chat_votes_drop_access', 'public.chat_votes_drop_access()',                                                      want_fn_chat_votes_drop_access)
    ) as t (ord, kind, name, sig, want)
    order by t.ord
  loop
    if f.kind = 'con' then
      select pg_get_constraintdef(c.oid) into got from pg_constraint c
       where c.conrelid = f.sig::regclass and c.conname = f.name;
    else
      select md5(pg_get_functiondef(p.oid)) into got from pg_proc p
       where p.oid = to_regprocedure(f.sig);
    end if;
    names := names || f.name;
    kinds := kinds || f.kind;
    gots  := gots  || coalesce(got, '(missing)');
    wants := wants || f.want;
    if f.want = '' then any_empty := true; end if;
  end loop;

  if any_empty then
    raise notice 'chat-cards: want_select := $w$%$w$', got_select;
    for i in 1 .. cardinality(names) loop
      if kinds[i] = 'con' then
        raise notice 'chat-cards: want_con_% := $w$%$w$', names[i], gots[i];
      else
        raise notice 'chat-cards: want_fn_% := ''%''', names[i], gots[i];
      end if;
    end loop;
    raise exception 'chat-cards: constants are empty';
  end if;

  if got_select is distinct from want_select then
    raise exception 'chat-cards: messages_select_org_member does not read as written: %',
      coalesce(got_select, '(missing)');
  end if;
  for i in 1 .. cardinality(names) loop
    if gots[i] is distinct from wants[i] then
      raise exception 'chat-cards: % does not read as written: % (wanted %)', names[i], gots[i], wants[i];
    end if;
  end loop;
end $$;

-- 8. POST-CHECK BY BEHAVIOUR (contract 3.8) -------------------------------------
-- As the file's role (psql as postgres with no SET ROLE: current_setting(
-- 'role', true) is 'none', so the role guard passes, as A's step 7 did) and,
-- for the 42501 rows, as authenticated with a student's claims. Fixtures from
-- real rows: a club with a Lounge, a Board, an owner or admin, one event that
-- has not ended, and a member below admin who passes can_publish_now() and
-- has_recorded_consent() (asked with that member's claims); the closed event
-- chat, an ended event, an event of another club and a person outside the
-- club when they exist (a probe that needs one is otherwise left out of both
-- strings and named in the record). The probes that must be ACCEPTED run
-- first, so a refusal further down cannot be "everything is refused". Every
-- outcome is appended to one string beside the expected one; all of it is
-- undone by raising P0C29 at the end of the inner block (never P0C21..P0C26:
-- those are refusal codes here), which rolls the subtransaction back (rows,
-- claims and role). No fixture = SKIPPED with a recorded reason, never a
-- stop.
do $$
declare
  me         text := current_user;
  cand       record;
  probe      record;
  passes     boolean;
  why        text := 'no club has a Lounge, a Board, an upcoming event, an owner or admin and a member below admin';
  v_org      uuid;
  v_member   uuid;
  v_officer  uuid;
  v_outsider uuid;   -- not a member of the probe club, when one exists
  v_board    uuid;
  v_lounge   uuid;
  v_event    uuid;   -- an event of the club that has not ended
  v_ended    uuid;   -- an event of the club that has ended, when one exists
  v_foreign  uuid;   -- an event of another club, when one exists
  v_closed   uuid;   -- a closed event chat (any club), when one exists ...
  v_closed_officer uuid;   -- ... and an owner or admin of that club
  v_poll     uuid;   -- the member's single-choice poll on the Lounge (options a, b)
  v_a        uuid;
  v_b        uuid;
  v_signup   uuid;   -- the member's 1-spot sign-up on the Lounge (slot s)
  v_slot     uuid;
  v_bpoll    uuid;   -- the officer's poll on the Board (option ba)
  v_ba       uuid;
  v_multi    uuid;   -- the member's multi poll on the Lounge (options ma, mb)
  v_ma       uuid;
  v_mb       uuid;
  v_past     uuid;   -- a poll with a past closes_at, written directly (option pa)
  v_pa       uuid;
  v_card     uuid;   -- the member's Event card on the Lounge
  v_reply    uuid;   -- the member's reply under the officer's Board poll
  eleven     jsonb := (select jsonb_agg(jsonb_build_object('label', 'l' || i, 'capacity', 1))
                         from generate_series(1, 11) i);
  got        text;
  n          bigint;
  res        text := '';
  want       text := '';
  left_out   text := '';
  state      text;
begin
  -- The fixture club and its member (A's idiom: at most 50 candidates, each
  -- asked with their own claims whether they may publish).
  for cand in
    select m.org_id, m.user_id
      from public.org_members m
     where m.role in ('member', 'mod')
       and exists (select 1 from public.channels c where c.org_id = m.org_id and c.kind = 'lounge')
       and exists (select 1 from public.channels c where c.org_id = m.org_id and c.kind = 'board')
       and exists (select 1 from public.events e where e.org_id = m.org_id and e.ends_at > now())
       and exists (select 1 from public.org_members o
                    where o.org_id = m.org_id and o.role in ('owner', 'admin')
                      and exists (select 1 from public.channel_members cm
                                    join public.channels c on c.id = cm.channel_id
                                   where c.org_id = m.org_id and c.kind = 'lounge'
                                     and cm.user_id = o.user_id))
       and exists (select 1 from public.channel_members cm
                     join public.channels c on c.id = cm.channel_id
                    where c.org_id = m.org_id and c.kind = 'lounge' and cm.user_id = m.user_id)
     order by (m.role = 'member') desc, m.joined_at, m.user_id
     limit 50
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', cand.user_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    passes := public.can_publish_now() and public.has_recorded_consent();
    execute format('set local role %I', me);
    if passes then
      v_org := cand.org_id;
      v_member := cand.user_id;
      exit;
    end if;
    why := 'no member below admin of a club with a Lounge, a Board, an upcoming event and an officer passes can_publish_now() (Terms, age, verified school email, not restricted)';
  end loop;
  perform set_config('request.jwt.claims', '', true);
  if v_member is null then
    perform set_config('chat_cards.probe', 'skipped: ' || why, true);
    raise notice 'chat-cards: behaviour check skipped: %', why;
    return;
  end if;

  -- The rest of the fixture: read, never made (the candidate query above
  -- guarantees the officer, the Board, the Lounge and the upcoming event).
  select m.user_id into v_officer from public.org_members m
   where m.org_id = v_org and m.role in ('owner', 'admin')
     and exists (select 1 from public.channel_members cm
                   join public.channels c on c.id = cm.channel_id
                  where c.org_id = v_org and c.kind = 'lounge' and cm.user_id = m.user_id)
   order by (m.role = 'owner') desc, m.joined_at, m.user_id
   limit 1;
  select c.id into v_board  from public.channels c where c.org_id = v_org and c.kind = 'board';
  select c.id into v_lounge from public.channels c where c.org_id = v_org and c.kind = 'lounge';
  select e.id into v_event from public.events e
   where e.org_id = v_org and e.ends_at > now() order by e.ends_at, e.id limit 1;
  select e.id into v_ended from public.events e
   where e.org_id = v_org and e.ends_at <= now() order by e.ends_at desc, e.id limit 1;
  select e.id into v_foreign from public.events e
   where e.org_id is not null and e.org_id <> v_org order by e.created_at desc, e.id limit 1;
  select u.id into v_outsider from public.users u
   where not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = u.id)
   limit 1;
  select c.id, o.user_id into v_closed, v_closed_officer
    from public.channels c
    join public.events e on e.id = c.event_id
    join public.org_members o on o.org_id = c.org_id and o.role in ('owner', 'admin')
   where c.kind = 'event' and e.ends_at + interval '7 days' <= now()
   order by e.ends_at desc, (o.role = 'owner') desc, o.joined_at, o.user_id
   limit 1;
  left_out := concat_ws(', ',
    case when v_closed   is null then 'the closed event chat' end,
    case when v_foreign  is null then 'an event of another club' end,
    case when v_ended    is null then 'an ended event' end,
    case when v_outsider is null then 'a vote by someone outside the club' end);

  begin
    -- 1. Accepted first: the member's poll, sign-up and Event card on the
    --    Lounge, the officer's poll on the Board, the member's multi poll.
    begin
      v_poll := public.chat_create_poll(v_lounge, v_member, 'poll', 'chat-cards probe: q',
                  '[{"label":"a"},{"label":"b"}]', false, false, null, 'Poll: q');
      got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'poll_lounge_member=' || got || ';';
    want := want || 'poll_lounge_member=accepted;';
    select concat_ws('/', m.kind, m.content, coalesce(m.thread_root_id::text, 'null'),
                     coalesce(m.card_event_id::text, 'null'),
                     (select string_agg(o.position || ':' || coalesce(o.capacity::text, 'null'), ',' order by o.position)
                        from public.chat_poll_options o where o.poll_id = m.id))
      into got from public.messages m where m.id = v_poll;
    res := res || 'poll_shape=' || coalesce(got, 'missing') || ';';
    want := want || 'poll_shape=poll/Poll: q/null/null/0:null,1:null;';
    select o.id into v_a from public.chat_poll_options o where o.poll_id = v_poll and o.position = 0;
    select o.id into v_b from public.chat_poll_options o where o.poll_id = v_poll and o.position = 1;

    begin
      v_signup := public.chat_create_poll(v_lounge, v_member, 'signup', 'chat-cards probe: s',
                    '[{"label":"s","capacity":1}]', true, false, null, 'Sign-up: s');
      got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'signup_lounge_member=' || got || ';';
    want := want || 'signup_lounge_member=accepted;';
    select concat_ws('/', p.mode, p.anonymous, p.multi,
                     (select string_agg(o.position || ':' || coalesce(o.capacity::text, 'null'), ',' order by o.position)
                        from public.chat_poll_options o where o.poll_id = p.message_id))
      into got from public.chat_polls p where p.message_id = v_signup;
    res := res || 'signup_shape=' || coalesce(got, 'missing') || ';';
    want := want || 'signup_shape=signup/false/true/0:1;';
    select o.id into v_slot from public.chat_poll_options o where o.poll_id = v_signup and o.position = 0;

    begin
      v_bpoll := public.chat_create_poll(v_board, v_officer, 'poll', 'chat-cards probe: b',
                   '[{"label":"ba"},{"label":"bb"}]', false, false, null, 'Poll: b');
      got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'poll_board_officer=' || got || ';';
    want := want || 'poll_board_officer=accepted;';
    select o.id into v_ba from public.chat_poll_options o where o.poll_id = v_bpoll and o.position = 0;

    begin
      v_multi := public.chat_create_poll(v_lounge, v_member, 'poll', 'chat-cards probe: m',
                   '[{"label":"ma"},{"label":"mb"}]', false, true, null, 'Poll: m');
      got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'poll_multi_member=' || got || ';';
    want := want || 'poll_multi_member=accepted;';
    select o.id into v_ma from public.chat_poll_options o where o.poll_id = v_multi and o.position = 0;
    select o.id into v_mb from public.chat_poll_options o where o.poll_id = v_multi and o.position = 1;

    begin
      v_card := public.chat_create_event_card(v_lounge, v_member, v_event, 'ride?', 'Event: probe');
      got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'event_card_lounge_member=' || got || ';';
    want := want || 'event_card_lounge_member=accepted;';
    select concat_ws('/', m.kind, (m.card_event_id = v_event)::text, coalesce(m.thread_root_id::text, 'null'),
                     (select e.note from public.chat_event_cards e where e.message_id = m.id))
      into got from public.messages m where m.id = v_card;
    res := res || 'event_card_shape=' || coalesce(got, 'missing') || ';';
    want := want || 'event_card_shape=event_card/true/null/ride?;';

    -- 2. Refusals of a create, each run as this role; a probe whose fixture
    --    is missing is left out of both strings.
    for probe in
      select * from (values
        ( 1, 'poll_board_member',     format($q$select public.chat_create_poll(%L, %L, 'poll', 'chat-cards probe: q', '[{"label":"a"},{"label":"b"}]', false, false, null, 'Poll: q')$q$, v_board, v_member), 'P0C21'),
        ( 2, 'poll_one_option',       format($q$select public.chat_create_poll(%L, %L, 'poll', 'chat-cards probe: q', '[{"label":"a"}]', false, false, null, 'Poll: q')$q$, v_lounge, v_member), 'P0C22'),
        ( 3, 'signup_zero_options',   format($q$select public.chat_create_poll(%L, %L, 'signup', 'chat-cards probe: s', '[]', false, true, null, 'Sign-up: s')$q$, v_lounge, v_member), 'P0C22'),
        ( 4, 'signup_eleven_options', format($q$select public.chat_create_poll(%L, %L, 'signup', 'chat-cards probe: s', %L, false, true, null, 'Sign-up: s')$q$, v_lounge, v_member, eleven::text), 'P0C22'),
        ( 5, 'signup_no_capacity',    format($q$select public.chat_create_poll(%L, %L, 'signup', 'chat-cards probe: s', '[{"label":"s"}]', false, true, null, 'Sign-up: s')$q$, v_lounge, v_member), 'P0C22'),
        ( 6, 'poll_with_capacity',    format($q$select public.chat_create_poll(%L, %L, 'poll', 'chat-cards probe: q', '[{"label":"a","capacity":2},{"label":"b"}]', false, false, null, 'Poll: q')$q$, v_lounge, v_member), 'P0C22'),
        ( 7, 'label_81',              format($q$select public.chat_create_poll(%L, %L, 'poll', 'chat-cards probe: q', %L, false, false, null, 'Poll: q')$q$, v_lounge, v_member, jsonb_build_array(jsonb_build_object('label', repeat('x', 81)), jsonb_build_object('label', 'b'))::text), 'P0C22'),
        ( 8, 'closes_at_past',        format($q$select public.chat_create_poll(%L, %L, 'poll', 'chat-cards probe: q', '[{"label":"a"},{"label":"b"}]', false, false, %L, 'Poll: q')$q$, v_lounge, v_member, now() - interval '1 minute'), 'P0C22'),
        ( 9, 'content_301',           format($q$select public.chat_create_poll(%L, %L, 'poll', 'chat-cards probe: q', '[{"label":"a"},{"label":"b"}]', false, false, null, %L)$q$, v_lounge, v_member, repeat('c', 301)), 'P0C22'),
        (10, 'capacity_1000',         format($q$select public.chat_create_poll(%L, %L, 'signup', 'chat-cards probe: s', '[{"label":"s","capacity":1000}]', false, true, null, 'Sign-up: s')$q$, v_lounge, v_member), 'P0C22'),
        (11, 'closed_event_chat',     case when v_closed is null then null else format($q$select public.chat_create_poll(%L, %L, 'poll', 'chat-cards probe: q', '[{"label":"a"},{"label":"b"}]', false, false, null, 'Poll: q')$q$, v_closed, v_closed_officer) end, 'P0C21'),
        (12, 'event_of_another_club', case when v_foreign is null then null else format($q$select public.chat_create_event_card(%L, %L, %L, null, 'Event: probe')$q$, v_lounge, v_member, v_foreign) end, 'P0C23'),
        (13, 'event_ended',           case when v_ended is null then null else format($q$select public.chat_create_event_card(%L, %L, %L, null, 'Event: probe')$q$, v_lounge, v_member, v_ended) end, 'P0C23'),
        (14, 'event_random',          format($q$select public.chat_create_event_card(%L, %L, %L, null, 'Event: probe')$q$, v_lounge, v_member, gen_random_uuid()), 'P0C23'),
        (15, 'note_201',              format($q$select public.chat_create_event_card(%L, %L, %L, %L, 'Event: probe')$q$, v_lounge, v_member, v_event, repeat('n', 201)), 'P0C22')
      ) as t (ord, name, sql, want_state)
      where t.sql is not null
      order by t.ord
    loop
      begin
        execute probe.sql;
        got := 'accepted';
      exception when others then got := sqlstate; end;
      res := res || probe.name || '=' || got || ';';
      want := want || probe.name || '=' || probe.want_state || ';';
    end loop;

    -- 3. Votes, as this role.
    begin perform public.chat_cast_vote(v_poll, v_a, v_member, true); got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'vote_a=' || got || ';';  want := want || 'vote_a=accepted;';
    select count(*) into n from public.chat_poll_votes v
     where v.poll_id = v_poll and v.user_id = v_member and v.option_id = v_a;
    res := res || 'vote_a_rows=' || n || ';';  want := want || 'vote_a_rows=1;';

    begin perform public.chat_cast_vote(v_poll, v_b, v_member, true); got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'vote_b_single=' || got || ';';  want := want || 'vote_b_single=accepted;';
    select string_agg(case when v.option_id = v_a then 'a' else 'b' end, ',' order by v.option_id = v_a desc)
      into got from public.chat_poll_votes v where v.poll_id = v_poll and v.user_id = v_member;
    res := res || 'single_choice=' || coalesce(got, 'none') || ';';  want := want || 'single_choice=b;';

    begin
      perform public.chat_cast_vote(v_multi, v_ma, v_member, true);
      perform public.chat_cast_vote(v_multi, v_mb, v_member, true);
      got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'vote_multi=' || got || ';';  want := want || 'vote_multi=accepted;';
    select count(*) into n from public.chat_poll_votes v where v.poll_id = v_multi and v.user_id = v_member;
    res := res || 'multi_rows=' || n || ';';  want := want || 'multi_rows=2;';

    begin perform public.chat_cast_vote(v_poll, v_b, v_member, false); got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'vote_off=' || got || ';';  want := want || 'vote_off=accepted;';
    select count(*) into n from public.chat_poll_votes v where v.poll_id = v_poll and v.user_id = v_member;
    res := res || 'vote_off_rows=' || n || ';';  want := want || 'vote_off_rows=0;';

    -- A poll past its closes_at, written directly as this role (set local
    -- cannot move now()).
    insert into public.messages (channel_id, user_id, content, kind)
    values (v_lounge, v_member, 'chat-cards probe: past', 'poll') returning id into v_past;
    insert into public.chat_polls (message_id, channel_id, mode, question, closes_at, created_by)
    values (v_past, v_lounge, 'poll', 'chat-cards probe: past', now() - interval '1 minute', v_member);
    insert into public.chat_poll_options (poll_id, position, label)
    values (v_past, 0, 'pa') returning id into v_pa;
    begin perform public.chat_cast_vote(v_past, v_pa, v_member, true); got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'vote_closed=' || got || ';';  want := want || 'vote_closed=P0C25;';

    -- The 1-spot slot: the officer takes it, the member is refused, the
    -- officer again is no error and still one row.
    begin perform public.chat_cast_vote(v_signup, v_slot, v_officer, true); got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'slot_officer=' || got || ';';  want := want || 'slot_officer=accepted;';
    begin perform public.chat_cast_vote(v_signup, v_slot, v_member, true); got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'slot_member=' || got || ';';  want := want || 'slot_member=P0C26;';
    begin perform public.chat_cast_vote(v_signup, v_slot, v_officer, true); got := 'accepted';
    exception when others then got := sqlstate; end;
    select count(*) into n from public.chat_poll_votes v where v.option_id = v_slot;
    res := res || 'slot_officer_twice=' || got || '/' || n || ';';  want := want || 'slot_officer_twice=accepted/1;';

    begin perform public.chat_cast_vote(v_poll, v_ma, v_member, true); got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'option_of_another_poll=' || got || ';';  want := want || 'option_of_another_poll=P0C24;';

    update public.messages set removed_at = now(), removed_by = v_officer where id = v_multi;
    begin perform public.chat_cast_vote(v_multi, v_ma, v_member, true); got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'vote_removed=' || got || ';';  want := want || 'vote_removed=P0C24;';

    if v_outsider is not null then
      begin perform public.chat_cast_vote(v_poll, v_a, v_outsider, true); got := 'accepted';
      exception when others then got := sqlstate; end;
      res := res || 'vote_outsider=' || got || ';';  want := want || 'vote_outsider=P0C24;';
    end if;

    begin perform public.chat_cast_vote(v_bpoll, v_ba, v_member, true); got := 'accepted';
    exception when others then got := sqlstate; end;
    res := res || 'vote_board_member=' || got || ';';  want := want || 'vote_board_member=accepted;';

    -- 4. As authenticated, with the member's claims: every function refuses,
    --    a direct read of chat_polls and a direct poll insert are refused,
    --    a reply under the officer's Board poll is accepted (allowed on
    --    purpose: can_post_org_channel checks the root's thread_root_id and
    --    removed_at, not its kind; open point 14.28).
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    for probe in
      select * from (values
        (1, 'rpc_create_poll',       format($q$select public.chat_create_poll(%L, %L, 'poll', 'chat-cards probe: q', '[{"label":"a"},{"label":"b"}]', false, false, null, 'Poll: q')$q$, v_lounge, v_member), '42501'),
        (2, 'rpc_create_event_card', format($q$select public.chat_create_event_card(%L, %L, %L, null, 'Event: probe')$q$, v_lounge, v_member, v_event), '42501'),
        (3, 'rpc_cast_vote',         format($q$select public.chat_cast_vote(%L, %L, %L, true)$q$, v_poll, v_a, v_member), '42501'),
        (4, 'rpc_reply_counts',      format($q$select * from public.chat_reply_counts(%L, array[%L]::uuid[], %L)$q$, v_board, v_bpoll, v_member), '42501'),
        (5, 'select_chat_polls',     'select 1 from public.chat_polls', '42501'),
        (6, 'insert_poll_kind',      format($q$insert into public.messages (channel_id, user_id, content, kind) values (%L, %L, 'chat-cards probe: poll kind', 'poll')$q$, v_lounge, v_member), '42501')
      ) as t (ord, name, sql, want_state)
      order by t.ord
    loop
      begin
        execute probe.sql;
        got := 'accepted';
      exception when others then got := sqlstate; end;
      res := res || probe.name || '=' || got || ';';
      want := want || probe.name || '=' || probe.want_state || ';';
    end loop;
    begin
      execute format($q$insert into public.messages (channel_id, user_id, content, thread_root_id)
                       values (%L, %L, 'chat-cards probe: reply', %L) returning id$q$, v_board, v_member, v_bpoll)
         into v_reply;
      got := 'accepted';
    exception when others then got := sqlstate; end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    res := res || 'reply_under_board_poll=' || got || ';';  want := want || 'reply_under_board_poll=accepted;';

    -- 5. The trigger: the member loses the Lounge, their Lounge votes go
    --    (the two on the removed multi poll), the officer's stay (the slot),
    --    the member's Board vote stays; the row is re-inserted; the officer
    --    loses the Lounge, their votes stay. Each string is
    --    member-on-Lounge / officer-on-Lounge / member-on-Board.
    select concat_ws('/',
      (select count(*) from public.chat_poll_votes v join public.chat_polls p on p.message_id = v.poll_id
        where p.channel_id = v_lounge and v.user_id = v_member),
      (select count(*) from public.chat_poll_votes v join public.chat_polls p on p.message_id = v.poll_id
        where p.channel_id = v_lounge and v.user_id = v_officer),
      (select count(*) from public.chat_poll_votes v where v.poll_id = v_bpoll and v.user_id = v_member))
      into got;
    res := res || 'votes_before=' || got || ';';  want := want || 'votes_before=2/1/1;';
    delete from public.channel_members cm where cm.channel_id = v_lounge and cm.user_id = v_member;
    select concat_ws('/',
      (select count(*) from public.chat_poll_votes v join public.chat_polls p on p.message_id = v.poll_id
        where p.channel_id = v_lounge and v.user_id = v_member),
      (select count(*) from public.chat_poll_votes v join public.chat_polls p on p.message_id = v.poll_id
        where p.channel_id = v_lounge and v.user_id = v_officer),
      (select count(*) from public.chat_poll_votes v where v.poll_id = v_bpoll and v.user_id = v_member))
      into got;
    res := res || 'member_dropped=' || got || ';';  want := want || 'member_dropped=0/1/1;';
    insert into public.channel_members (channel_id, user_id, role, accepted_at, last_read_at)
    values (v_lounge, v_member, 'member', now(), now());
    delete from public.channel_members cm where cm.channel_id = v_lounge and cm.user_id = v_officer;
    select concat_ws('/',
      (select count(*) from public.chat_poll_votes v join public.chat_polls p on p.message_id = v.poll_id
        where p.channel_id = v_lounge and v.user_id = v_member),
      (select count(*) from public.chat_poll_votes v join public.chat_polls p on p.message_id = v.poll_id
        where p.channel_id = v_lounge and v.user_id = v_officer),
      (select count(*) from public.chat_poll_votes v where v.poll_id = v_bpoll and v.user_id = v_member))
      into got;
    res := res || 'officer_dropped=' || got || ';';  want := want || 'officer_dropped=0/1/1;';
    insert into public.channel_members (channel_id, user_id, role, accepted_at, last_read_at)
    values (v_lounge, v_officer, 'member', now(), now());

    -- 6. Reply counts: (post, 1) after the member's live reply; nothing for
    --    the officer once the officer removed that reply; still (post, 1)
    --    for the member (their own removed reply).
    select string_agg(r.root::text || ':' || r.n, ',') into got
      from public.chat_reply_counts(v_board, array[v_bpoll], v_member) r;
    res := res || 'reply_count_live=' || case when got = v_bpoll::text || ':1' then '1' else coalesce(got, 'none') end || ';';
    want := want || 'reply_count_live=1;';
    update public.messages
       set removed_at = now(), removed_by = v_officer, removed_reason = 'chat-cards probe'
     where id = v_reply;
    select string_agg(r.root::text || ':' || r.n, ',') into got
      from public.chat_reply_counts(v_board, array[v_bpoll], v_officer) r;
    res := res || 'reply_count_removed_other=' || coalesce(got, 'none') || ';';
    want := want || 'reply_count_removed_other=none;';
    select string_agg(r.root::text || ':' || r.n, ',') into got
      from public.chat_reply_counts(v_board, array[v_bpoll], v_member) r;
    res := res || 'reply_count_removed_own=' || case when got = v_bpoll::text || ':1' then '1' else coalesce(got, 'none') end || ';';
    want := want || 'reply_count_removed_own=1;';

    raise exception using errcode = 'P0C29', message = res;
  exception when sqlstate 'P0C29' then
    state := sqlerrm;
  end;

  -- 7. Nothing of it stays, and this role is back.
  if state is distinct from want then
    raise exception 'chat-cards: the behaviour probes read "%", expected "%"',
      coalesce(state, '(none)'), want;
  end if;
  if current_user <> me then
    raise exception 'chat-cards: the post-check did not return to role %', me;
  end if;
  if exists (select 1 from public.messages where content like 'chat-cards probe:%') then
    raise exception 'chat-cards: a probe row survived the post-check';
  end if;
  if exists (select 1 from public.chat_polls) or exists (select 1 from public.chat_event_cards) then
    raise exception 'chat-cards: a probe side row survived the post-check';
  end if;
  perform set_config('chat_cards.probe',
    'passed' || case when left_out <> '' then ' (not probed: ' || left_out || ')' else '' end
    || ': ' || state, true);
  raise notice 'chat-cards: behaviour check passed: %', state;
end $$;

-- 9. The apply record (contract 3.9). NOTICE lines do not come back through
--    the Management API, so what this run did is written where a read-only
--    query finds it afterwards: at the end of the comment of chat_create_poll
--    (CHECK AFTER APPLYING, query 1). The file md5 is read from
--    chat_cards.file_md5, handed in by the applier in the same session or
--    request (APPLY ORDER); NOT GIVEN is not an error here (a rehearsal may
--    skip it) but fails CHECK AFTER APPLYING (4).
do $$
declare
  was text := obj_description('public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text)'::regprocedure, 'pg_proc');
  rec text;
begin
  rec := 'APPLY RECORD '
      || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC: '
      || 'tables 4, functions 5, trigger 1; file md5 '
      || coalesce(nullif(current_setting('chat_cards.file_md5', true), ''), 'NOT GIVEN')
      || '; probe: '
      || coalesce(nullif(current_setting('chat_cards.probe', true), ''), 'skipped: the behaviour check left no record')
      || '; notes: '
      || coalesce(nullif(current_setting('chat_cards.notes', true), ''), 'none')
      || '.';
  execute format('comment on function public.chat_create_poll(uuid,uuid,text,text,jsonb,boolean,boolean,timestamptz,text) is %L',
                 coalesce(was, '') || ' ' || rec);
  raise notice 'chat-cards: %', rec;
end $$;

-- 10. tell PostgREST about the new tables and functions (delivered at commit) --
notify pgrst, 'reload schema';

commit;
