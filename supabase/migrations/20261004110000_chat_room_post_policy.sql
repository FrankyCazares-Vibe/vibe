-- Messages on desktop, wave 3 (handoffs/chat-redesign/wave-3-desktop/
-- contract.md, sections 4b and 4b.2; the rules are 4c): WHO CAN POST in an
-- extra room of a club. ONE new column, channels.post_policy, with two
-- CHECKs, and TWO functions restated: can_post_org_channel and chat_cast_vote.
--
-- WHY THIS EXISTS. A club's extra rooms (kind = 'room') have one rule today:
-- whoever can see the room can post in it. Officers asked for rooms where
-- only some people type and everyone else reads (a room for announcements of
-- one committee, a sign-up room). The rule is one column with THREE values:
--   everyone  whoever can see the room posts (the default: the rule before
--             this column)
--   officers  owners and admins post
--   listed    owners, admins and the people on the room's allow list
--             (org_channel_members: the list that already says who may ENTER
--             a private room) post
-- Extra rooms only. The Board keeps its own rule (officers post, members
-- reply), event chats theirs (open until 7 days after the event), the Lounge
-- and the Officers room theirs (whoever can see them), dms and groups have no
-- such rule at all: for every one of those the column is always 'everyone'
-- and the second CHECK refuses anything else. A room with a rule other than
-- 'everyone' has no replies (a root outside a Board was never allowed).
--
-- WHAT IT CHANGES FOR EVERYONE: nothing until an officer sets a rule. Every
-- existing row gets 'everyone'; with that value can_post_org_channel answers
-- exactly as before for every room, and chat_cast_vote's "closed" test
-- answers exactly as before for every room that exists (see step 3). The app
-- runs WITHOUT this file: every read that names post_policy falls back on
-- the missing column (isMissingChatSchema) and treats each room as
-- 'everyone', a create or an edit that sends another value answers 503
-- try_again, so the code and this file may land in either order.
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: not applied yet ("already applied"
--      when the column and both constraints exist; "half applied" when only
--      some do); public.org_channel_members exists; the md5 of
--      pg_get_functiondef for can_post_org_channel, chat_cast_vote and
--      can_view_org_channel are the three of LIVE STATE (a drifted function
--      is re-read by a person before this file restates it).
--   1. channels.post_policy text not null default 'everyone'; CHECK
--      channels_post_policy_check (one of the three values); CHECK
--      channels_post_policy_rooms_only (anything but 'everyone' needs kind =
--      'room'); a comment on the column.
--   2. can_post_org_channel(cid, uid, root) restated whole with CREATE OR
--      REPLACE: migration A's body (20261001100000:1362-1394) with exactly
--      TWO arms added, between the event arm and the "lounge, officers, room
--      -> true" arm: a room with 'officers' -> owner or admin; a room with
--      'listed' -> owner, admin, or a row in org_channel_members. Same
--      signature, sql, STABLE, SECURITY DEFINER, search_path '', TimeZone
--      UTC. Its comment restated ("Rooms: by post_policy."), its grant
--      restated.
--   3. chat_cast_vote(p_poll, p_option, p_user, p_on) restated whole with
--      CREATE OR REPLACE: migration B's body (20261001110000:836-889)
--      verbatim with ONE change, in the "closed" test:
--        before:  v_kind <> 'board' and not can_post_org_channel(...)
--        after:   v_kind = 'event'  and not can_post_org_channel(...)
--      The function has already required can_view_org_channel two tests
--      earlier, and in a Lounge, an Officers room and an 'everyone' room
--      whoever can view can post, so for those kinds the old arm could never
--      fire: only an event chat past its 7 days ever closed a vote, and it
--      still does. What changes: in a room where only some people post, a
--      person who can read the room can still vote and take a sign-up slot.
--      Signature, lock order and SQLSTATEs (42501, P0C22, P0C24, P0C25,
--      P0C26) unchanged; its comment and its grant restated.
--   4. POST-CHECK by catalog: the column as written; both constraints there,
--      validated, reading as written; no row holds anything but 'everyone';
--      the two restated functions read as written (their md5s are the two of
--      LIVE STATE AFTER, and are not the old ones); can_view_org_channel's
--      md5 is unchanged; all three keep SECURITY DEFINER, their volatility,
--      search_path and TimeZone, and EXECUTE for anon, authenticated and
--      service_role.
--   5. POST-CHECK BY BEHAVIOUR, in a nested block that raises P0C59 (this
--      file's own code) so it rolls itself back. In the oldest club that has
--      an owner or admin AND a plain member it builds its OWN room (kind
--      room, public) with one message in it and asks can_post_org_channel
--      under each rule, for the member, the officer and a person outside the
--      club, with and without a root: everyone -> member yes; officers ->
--      member no, officer yes; listed -> member no, yes once the member has
--      an org_channel_members row, officer yes; the outsider never; a reply
--      never. In the 'officers' room the officer makes a poll
--      (chat_create_poll) and the MEMBER's vote on it is accepted. Three
--      refusals by the CHECKs (23514): 'officers' on the Lounges, a value
--      outside the three, a dm with 'listed'. After the block: no probe room,
--      no probe message, no allow-list row and no rule other than 'everyone'
--      is left (checked). SKIPPED, with the reason recorded (step 6), when no
--      club has both an officer and a plain member; the vote alone is
--      skipped, and recorded, when the poll fixture cannot be built.
--   6. The APPLY RECORD, appended to the comment of can_post_org_channel
--      (NOTICE lines do not come back through the Management API): when it
--      ran and what the behaviour check did or why it was skipped.
--   7. notify pgrst, 'reload schema'.
--
-- DOES NOT: touch can_view_org_channel (who can SEE a room is unchanged, and
-- its md5 is compared before and after); touch a policy (messages_insert_
-- org_member already calls can_post_org_channel, so the new rule reaches
-- every direct insert and the three card functions without a policy change);
-- touch a trigger, a grant on a table, or a row of channel_members or
-- org_channel_members; give anyone a way to SET the rule (authenticated holds
-- no UPDATE on channels: the room routes write it with the service role
-- after their officer guard; read on production with PRE-CHECK 6); turn the Board, the Lounge, the Officers room
-- or an event chat into a post_policy room (the second CHECK); cap the number
-- of extra rooms (the route's job, EXTRA_ROOM_CAP); let a moderator (role
-- mod) post in an 'officers' room (officers = owner and admin here, as on
-- the Board: a mod reads and votes there like any member).
--
-- LIVE STATE (read on the LOCAL stack, PostgreSQL 17.6, 2026-10-03, newest
-- schema_migrations row 20261004100000 chat_message_pins; production is read
-- by the orchestrator before the apply, PRE-CHECK below):
--   * public.channels: 13 columns, none named post_policy; 82 rows (16 clubs
--     with a Board, a Lounge, an Officers room and 16 event chats between
--     them, ONE extra room, 17 dms and groups). Its CHECKs are the six of
--     migration A plus channels_type_check; its non-internal triggers are
--     chat_channels_fill_kind (BEFORE INSERT) and chat_channels_subscribe
--     (AFTER INSERT OR UPDATE OF is_private): neither fires on an update of
--     post_policy.
--   * Grants on channels (relacl authenticated=rdDxtm): authenticated holds
--     select and delete (and truncate, references, trigger, maintain), NO
--     insert and NO update; anon nothing; service_role all. So only the
--     service role can write post_policy, and no policy on channels needs to
--     know the column (RLS is on and channels has no UPDATE policy either;
--     its one write policy, channels_insert_authenticated, is dead without
--     the INSERT grant). No column of channels carries a grant of its own.
--     This is the LOCAL catalog and nothing in the file checks it: production
--     is read with PRE-CHECK 6 before the apply.
--   * public.org_channel_members (channel_id, user_id, added_at, added_by):
--     0 rows locally.
--   * The other tables the behaviour check writes, itself or through a
--     trigger or a card function, and their non-internal triggers locally:
--     messages (bump_org_activity_on_message AFTER INSERT, which moves
--     orgs.last_activity_at; messages_check_media_ref BEFORE INSERT OR UPDATE
--     OF media_url, channel_id; chat_pins_drop_removed AFTER UPDATE OF
--     removed_at); channel_members (chat_votes_drop_access AFTER DELETE: the
--     probe deletes no row, its rows go by rollback, so it does not fire);
--     orgs (orgs_check_asset_refs, orgs_sync_join_policy, both BEFORE INSERT
--     OR UPDATE OF other columns, and orgs_keep_removed_posts BEFORE DELETE:
--     none fires on last_activity_at); org_channel_members, chat_polls,
--     chat_poll_options and chat_poll_votes have none.
--   * md5(pg_get_functiondef) BEFORE this file:
--       can_post_org_channel(uuid, uuid, uuid)     8d8be860d3f7077b9d6f9238705bdca7
--       chat_cast_vote(uuid, uuid, uuid, boolean)  a8f2efe48f8c892b609a188deb132551
--       can_view_org_channel(uuid, uuid)           747ee06d2e4c3e8a788129f7530ec0ae
--     (the first and the third are the values migration A recorded,
--     20261001100000:72-75; the second is B's, 20261001110000:1256).
--   * LIVE STATE AFTER this file, read from the catalog after the first local
--     apply (POST-CHECK e compares both; the next file that restates one of
--     them writes its PRE-FLIGHT against these):
--       can_post_org_channel(uuid, uuid, uuid)     ae485a1fb463cfd6f6ace3448d986fb9
--       chat_cast_vote(uuid, uuid, uuid, boolean)  0ba4681e8816cecaa5c066ee6b03bedd
--       can_view_org_channel(uuid, uuid)           747ee06d2e4c3e8a788129f7530ec0ae (not touched)
--   * The callers of can_post_org_channel, none of them changed here: the
--     INSERT policy messages_insert_org_member, chat_create_poll,
--     chat_create_event_card, chat_cast_vote, and the send gate of the
--     routes (src/lib/chat/rooms.ts, asked as the sender through the cookie
--     client). chat_cast_vote is called by the vote route alone (service
--     client).
--   * Locally the oldest club with an officer and a plain member is
--     test_request_club (1 officer, 1 member): the behaviour check runs there.
--
-- THE STANDING RULE (20260922090000_guard_function_privileges; restated in
-- 20261001120000): on this image a public function is NEVER refused to anon,
-- authenticated or service_role by a REVOKE ("permission denied for function"
-- crashes the backend). This file revokes nothing. Both functions keep
-- EXECUTE for the three roles (restated, checked in step 4); chat_cast_vote
-- still refuses anon and authenticated INSIDE (42501), can_post_org_channel
-- still answers false to anon and, under authenticated, about anyone but the
-- caller.
--
-- LOCK. ADD COLUMN with a constant default does not rewrite the table, but
-- it takes ACCESS EXCLUSIVE on channels, and that lock is held until COMMIT,
-- which includes both post-checks: every chat read and every send (their
-- policies read channels) waits for those milliseconds. The two CHECKs are
-- validated by one scan of channels inside the same statement (82 rows
-- locally; a small table on production too). Measured on the local stack on
-- Oct 3 (pg_locks just before the commit): AccessExclusiveLock and
-- ShareUpdateExclusiveLock (the column's comment) on channels, and nothing
-- above ROW SHARE on any other table: CREATE OR REPLACE FUNCTION locks no
-- table, and what the behaviour check takes (row locks on its own rows, on
-- the probe club's orgs row through bump_org_activity_on_message, on the
-- three users rows its foreign keys name) goes when its block rolls back.
-- Production = a quiet hour, like migration A. lock_timeout 5s makes the file
-- fail whole instead of queueing behind a long transaction with every chat
-- read behind it; then simply run it again.
--
-- PRE-CHECK (read-only, on production, before applying). Expected answers in
-- brackets.
--   1. Not applied yet, every name free [f | 0]:
--     select exists (select 1 from pg_attribute where attrelid = 'public.channels'::regclass
--                     and attname = 'post_policy' and not attisdropped),
--            (select count(*) from pg_constraint where conrelid = 'public.channels'::regclass
--              and conname in ('channels_post_policy_check', 'channels_post_policy_rooms_only'));
--   2. The three fingerprints [8d8be860d3f7077b9d6f9238705bdca7 |
--      a8f2efe48f8c892b609a188deb132551 | 747ee06d2e4c3e8a788129f7530ec0ae].
--      Another value: do NOT apply; read that function on production, carry
--      its change into steps 2 and 3 and into the ROLLBACK text first.
--     select md5(pg_get_functiondef('public.can_post_org_channel(uuid,uuid,uuid)'::regprocedure)),
--            md5(pg_get_functiondef('public.chat_cast_vote(uuid,uuid,uuid,boolean)'::regprocedure)),
--            md5(pg_get_functiondef('public.can_view_org_channel(uuid,uuid)'::regprocedure));
--   3. The allow list is there [org_channel_members]:
--     select to_regclass('public.org_channel_members');
--   4. The behaviour check builds a room, a message and a poll of its own in
--      one real club and rolls them back. The club it will use [one handle;
--      no row = the check is skipped with a line in the APPLY RECORD and the
--      file still applies]:
--     select o.handle from public.orgs o
--      where exists (select 1 from public.org_members m where m.org_id = o.id and m.role in ('owner', 'admin'))
--        and exists (select 1 from public.org_members m where m.org_id = o.id and m.role = 'member')
--      order by o.created_at, o.id limit 1;
--      And the triggers on the EIGHT tables it writes: channels and messages
--      itself, channel_members through chat_channels_subscribe, orgs through
--      bump_org_activity_on_message, org_channel_members for the allow-list
--      row, chat_polls and chat_poll_options through chat_create_poll,
--      chat_poll_votes through chat_cast_vote. The file does not refuse on a
--      different list: this read is the only check. [four rows, no row for
--      the other four tables:
--        channel_members | chat_votes_drop_access
--        channels        | chat_channels_fill_kind, chat_channels_subscribe
--        messages        | bump_org_activity_on_message, chat_pins_drop_removed, messages_check_media_ref
--        orgs            | orgs_check_asset_refs, orgs_keep_removed_posts, orgs_sync_join_policy
--      (chat_pins_drop_removed only once the pins file is in). Any other
--      name, or a row for another table: read that trigger with
--      pg_get_triggerdef(oid) and its function for what it does on the
--      probe's INSERTs and UPDATEs before applying; LIVE STATE says why none
--      of these does anything that outlives the rollback]:
--     select c.relname, string_agg(t.tgname, ', ' order by t.tgname collate "C")
--       from pg_trigger t join pg_class c on c.oid = t.tgrelid
--      where t.tgrelid in ('public.channels'::regclass, 'public.messages'::regclass,
--                          'public.channel_members'::regclass, 'public.org_channel_members'::regclass,
--                          'public.chat_polls'::regclass, 'public.chat_poll_options'::regclass,
--                          'public.chat_poll_votes'::regclass, 'public.orgs'::regclass)
--        and not t.tgisinternal
--      group by c.relname order by c.relname;
--   5. This file sorts after the newest applied row [a version below
--      20261004110000]:
--     select max(version) from supabase_migrations.schema_migrations;
--   6. Who may write the rule: the service role alone. LIVE STATE and DOES
--      NOT say so from the LOCAL catalog, and nothing in this file checks it
--      (PRE-FLIGHT reads names and fingerprints, not grants): these three
--      reads are the only check production gets.
--      a. anon and authenticated hold neither INSERT nor UPDATE on channels,
--         on the table or on any one column (a column's own grant does not
--         show in relacl), and RLS is on [anon | f | f | t and
--         authenticated | f | f | t]:
--     select r, has_any_column_privilege(r, 'public.channels', 'insert'),
--            has_any_column_privilege(r, 'public.channels', 'update'),
--            (select relrowsecurity from pg_class where oid = 'public.channels'::regclass)
--       from (values ('anon'), ('authenticated')) as v (r) order by 1;
--      b. The ACL as it stands [authenticated=rdDxtm; no anon entry; no entry
--         with nothing before its "=", which would be PUBLIC]:
--     select relacl from pg_class where oid = 'public.channels'::regclass;
--      c. No policy on channels covers UPDATE [no row]:
--     select polname from pg_policy where polrelid = 'public.channels'::regclass and polcmd in ('w', '*');
--      A "t" under INSERT or UPDATE in a, or an "f" under RLS: do NOT apply.
--      A signed-in person could then set a room's rule (UPDATE, once a policy
--      lets the row through or RLS is off) or make a room born with one
--      (INSERT, through channels_insert_authenticated: an owner or admin
--      there) past the room routes' officer guard and the cap. Tell
--      Franky first; what closes it is a revoke on the TABLE in a file of its
--      own (the standing rule is about functions), and LIVE STATE's grants
--      line is rewritten to what production reads. A row on c with a as
--      expected: nobody can use that policy without the grant; read it and
--      correct LIVE STATE before applying. b differing with a as expected
--      (another owner, an entry for a role no student ever is): nothing to
--      fix; keep what it read with the apply's notes.
--
-- APPLY ORDER: after migrations A and B (20261001100000, 20261001110000: it
-- restates one function of each). It does not need the pins file
-- (20261004100000) and the pins file does not need it. Code first or this
-- file first are both safe (see WHAT IT CHANGES). At a QUIET HOUR (see LOCK).
-- On production only the orchestrator applies it, after Franky says yes
-- (contract 4b.3 step 4), with the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql (the file's text from
-- `git show <branch>:<this file>`, never the working tree), then records it
-- in a SEPARATE request:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261004110000', 'chat_room_post_policy');
-- and runs scripts/sql/chat-v2-after-deploy.sql. Locally, one psql run
-- through the unix socket, then the same INSERT through the same docker exec:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261004110000_chat_room_post_policy.sql
-- Never `supabase db push`. The Management API answers an empty result on
-- success and the error text on a failure: everything that must stop the
-- apply is a RAISE EXCEPTION (the whole file rolls back). A second run stops
-- at once: "chat-post-policy: already applied".
--
-- CHECK AFTER APPLYING (read-only):
--   1. The APPLY RECORD, the last sentence of the comment: when it ran, and
--      "behaviour check passed: ..." with every probe, or why it was skipped.
--     select obj_description('public.can_post_org_channel(uuid,uuid,uuid)'::regprocedure, 'pg_proc');
--   2. The column and its CHECKs [text | t | 'everyone'::text | 2 | 0]:
--     select format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid),
--            (select count(*) from pg_constraint c where c.conrelid = a.attrelid and c.convalidated
--              and c.conname in ('channels_post_policy_check', 'channels_post_policy_rooms_only')),
--            (select count(*) from public.channels where post_policy <> 'everyone')
--       from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
--      where a.attrelid = 'public.channels'::regclass and a.attname = 'post_policy';
--   3. The three fingerprints [ae485a1fb463cfd6f6ace3448d986fb9 |
--      0ba4681e8816cecaa5c066ee6b03bedd | 747ee06d2e4c3e8a788129f7530ec0ae]:
--      PRE-CHECK 2's query.
--   4. scripts/sql/chat-v2-after-deploy.sql still prints 0 findings.
--   5. Behaviour, LOCAL only: scripts/sql/chat-room-post-policy-check.sql ends
--      "chat-room-post-policy-check: all 104 cases passed", and
--      scripts/sql/chat-v2-rooms-check.sql, chat-v2-cards-check.sql and
--      chat-message-pins-check.sql still end "all N cases passed" unchanged.
--
-- ROLLBACK (one transaction; the code needs no change: every reader of
-- post_policy falls back on the missing column and treats each room as
-- 'everyone'). Read these four things first:
--   * It deletes every rule anyone has set, and there is no other copy: each
--     'officers' or 'listed' room becomes a room where everyone who can see
--     it posts. Read the rows and keep the answer before running it:
--       select id, org_id, name, post_policy from public.channels where post_policy <> 'everyone';
--   * ORDER. This rollback comes BEFORE the rollbacks of migrations B and A
--     (theirs DROP the two functions this one puts back, and A's DROP COLUMN
--     kind would silently take channels_post_policy_rooms_only with it).
--   * The functions go back FIRST, the column after: restored the other way
--     round, can_post_org_channel would name a column that is gone and every
--     send in every club room would fail until the function is replaced.
--     The guard in the middle raises, and the whole rollback rolls back,
--     unless both functions read exactly as migrations A and B left them.
--   * It BLOCKS READS like the apply: DROP CONSTRAINT and DROP COLUMN take
--     ACCESS EXCLUSIVE on channels until COMMIT. A quiet hour; the 5 s
--     lock_timeout makes it fail instead of queueing, then run it again.
-- To run it: strip the first five characters ("--" and three spaces) from
-- every line of the block; the ONE line that is "--" alone is the empty line
-- inside chat_cast_vote's body and must stay an empty line (the md5 is of the
-- exact text). Locally:
--   sed -n '/^--   BEGIN;$/,/^--   COMMIT;$/p' <this file> | sed -E 's/^--( {3})?//'
--
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   -- Migration A's text (20261001100000:1362-1399), character for character:
--   -- its md5 must read 8d8be860d3f7077b9d6f9238705bdca7 again.
--   create or replace function public.can_post_org_channel(cid uuid, uid uuid, root uuid)
--   returns boolean
--   language sql
--   stable
--   security definer
--   set search_path to ''
--   set timezone to 'UTC'
--   as $$
--     select coalesce((
--       select case
--         when current_setting('role', true) = 'anon' then false
--         when current_setting('role', true) = 'authenticated'
--              and uid is distinct from auth.uid() then false
--         when not coalesce(public.can_view_org_channel(c.id, uid), false) then false
--         when c.kind = 'board' and root is null then
--           coalesce(public.org_member_role(c.org_id, uid) in ('owner', 'admin'), false)
--         when c.kind = 'board' then
--           exists (select 1 from public.messages m
--                    where m.id = root
--                      and m.channel_id = c.id
--                      and m.thread_root_id is null
--                      and m.removed_at is null)
--         when root is not null then false
--         when c.kind = 'event' then
--           coalesce((select now() < e.ends_at + interval '7 days'
--                       from public.events e
--                      where e.id = c.event_id), false)
--         when c.kind in ('lounge', 'officers', 'room') then true
--         else false
--       end
--         from public.channels c
--        where c.id = cid), false);
--   $$;
--   comment on function public.can_post_org_channel(uuid, uuid, uuid) is
--     'May uid write in club room cid (root = the Board post replied to, NULL for a top-level message)? Board: owners and admins post, any member replies under a live top-level post of that Board. Event chat: until 7 days after the event ends. Lounge, Officers, rooms: anyone who can see them. Under the authenticated role it only answers about the caller. False for a room that does not exist.';
--   grant execute on function public.can_post_org_channel(uuid, uuid, uuid) to anon, authenticated, service_role;
--   -- Migration B's text (20261001110000:836-894), character for character:
--   -- its md5 must read a8f2efe48f8c892b609a188deb132551 again.
--   create or replace function public.chat_cast_vote(p_poll uuid, p_option uuid, p_user uuid, p_on boolean)
--   returns void
--   language plpgsql volatile security definer
--   set search_path to '' set timezone to 'UTC'
--   as $$
--   declare
--     v_poll     public.chat_polls%rowtype;
--     v_removed  timestamptz;
--     v_kind     text;
--     v_cap      smallint;
--     v_taken    integer;
--   begin
--     if current_setting('role', true) in ('anon', 'authenticated') then
--       raise exception 'not allowed' using errcode = '42501';
--     end if;
--     if p_poll is null or p_option is null or p_user is null or p_on is null then
--       raise exception 'chat-cards: bad shape' using errcode = 'P0C22';
--     end if;
--     -- One vote at a time per poll: the poll row is the lock.
--     select p.* into v_poll from public.chat_polls p where p.message_id = p_poll for update;
--     if not found then raise exception 'chat-cards: no such poll' using errcode = 'P0C24'; end if;
--     select m.removed_at, c.kind into v_removed, v_kind
--       from public.messages m join public.channels c on c.id = m.channel_id
--      where m.id = p_poll;
--     if not found or v_removed is not null
--        or not coalesce(public.can_view_org_channel(v_poll.channel_id, p_user), false) then
--       raise exception 'chat-cards: no such poll' using errcode = 'P0C24';
--     end if;
--     select o.capacity into v_cap from public.chat_poll_options o
--      where o.id = p_option and o.poll_id = p_poll for update;
--     if not found then raise exception 'chat-cards: no such option' using errcode = 'P0C24'; end if;
--     if (v_poll.closes_at is not null and v_poll.closes_at <= now())
--        or (v_kind <> 'board' and not coalesce(public.can_post_org_channel(v_poll.channel_id, p_user, null), false)) then
--       raise exception 'chat-cards: closed' using errcode = 'P0C25';
--     end if;
--
--     if p_on then
--       if exists (select 1 from public.chat_poll_votes v where v.option_id = p_option and v.user_id = p_user) then
--         return;                                   -- already theirs: nothing to do, never "slot full"
--       end if;
--       if v_poll.mode = 'signup' then
--         select count(*) into v_taken from public.chat_poll_votes v where v.option_id = p_option;
--         if v_cap is not null and v_taken >= v_cap then
--           raise exception 'chat-cards: slot full' using errcode = 'P0C26';
--         end if;
--       elsif not v_poll.multi then
--         delete from public.chat_poll_votes v where v.poll_id = p_poll and v.user_id = p_user;
--       end if;
--       insert into public.chat_poll_votes (option_id, poll_id, user_id)
--       values (p_option, p_poll, p_user) on conflict do nothing;
--     else
--       delete from public.chat_poll_votes v where v.option_id = p_option and v.user_id = p_user;
--     end if;
--   end $$;
--   comment on function public.chat_cast_vote(uuid,uuid,uuid,boolean) is
--     'Turns one vote on or off (wave-2 contract 3.4): the poll row is the lock, a single-choice poll drops the person''s other vote first, a sign-up slot at capacity refuses, off is idempotent; in a Board any viewer may vote. Raises 42501 (anon or authenticated), P0C22 (a bad shape), P0C24 (no such poll or option for this person: missing, removed, not viewable, an option of another poll), P0C25 (closed: past closes_at, or the room no longer accepts posts), P0C26 (slot full). Does not check consent, publish or restriction: the route does.';
--   grant execute on function public.chat_cast_vote(uuid,uuid,uuid,boolean) to anon, authenticated, service_role;
--   -- The guard: both functions read as A and B left them, and
--   -- can_view_org_channel was never touched. Otherwise nothing is dropped.
--   do $guard$
--   begin
--     if md5(pg_get_functiondef('public.can_post_org_channel(uuid,uuid,uuid)'::regprocedure)) <> '8d8be860d3f7077b9d6f9238705bdca7'
--        or md5(pg_get_functiondef('public.chat_cast_vote(uuid,uuid,uuid,boolean)'::regprocedure)) <> 'a8f2efe48f8c892b609a188deb132551'
--        or md5(pg_get_functiondef('public.can_view_org_channel(uuid,uuid)'::regprocedure)) <> '747ee06d2e4c3e8a788129f7530ec0ae' then
--       raise exception 'chat-post-policy rollback: a function does not read as migrations A and B left it; nothing was changed';
--     end if;
--   end $guard$;
--   alter table public.channels
--     drop constraint channels_post_policy_rooms_only,
--     drop constraint channels_post_policy_check,
--     drop column post_policy;
--   delete from supabase_migrations.schema_migrations where version = '20261004110000';
--   notify pgrst, 'reload schema';
--   COMMIT;
-- REHEARSED on the local stack on Oct 3, 2026: applied, recorded, the check
-- script passed (102), chat-v2-rooms-check (200), chat-v2-cards-check (181)
-- and chat-message-pins-check (43) passed unchanged; then the ROLLBACK above,
-- as written, taken out of this header with the sed line. After it: the md5s
-- read 8d8be860..., a8f2efe4... and 747ee06d... again, both comments are A's
-- and B's again, no column, no constraint, the schema_migrations row gone.
-- pg_locks just before its COMMIT: AccessExclusiveLock on channels and
-- nothing else above ROW EXCLUSIVE (no DROP TRIGGER here, so none of the
-- auth / storage locks the rollbacks of 20261001110000 and 20261004100000
-- warn about). Then this file applied again and recorded, the four check
-- scripts passed again, and one more run stopped at "already applied".
-- channels, channel_members, messages, org_channel_members, chat_polls and
-- chat_poll_votes counted the same before and after (82, 138, 229, 0, 22, 23).
-- AFTER THE REVIEW (same day, comments only in this file: no statement
-- changed, so the applied database was left as it was and the three md5s
-- read the same): PRE-CHECK 6 added and PRE-CHECK 4's trigger read widened
-- from two tables to eight; all nine PRE-CHECK queries run as written on the
-- local stack and answer as their brackets say (1 and 2 read "t | 2" and the
-- AFTER md5s there, the file being applied). The check script gained two
-- cases (C11, K15) and ends "all 104 cases passed".
-- ---------------------------------------------------------------------------

begin;

-- ADD COLUMN and ADD CONSTRAINT take ACCESS EXCLUSIVE on channels until COMMIT
-- (the header's LOCK note): give up rather than queue behind a long
-- transaction with every chat read waiting behind this file. A failure here
-- is not a defect in the file: run it again.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
do $$
declare
  -- md5(pg_get_functiondef) read on the local stack on Oct 3, 2026. The first
  -- and the third are the values migration A recorded for the next file that
  -- restates one of them (20261001100000:72-75); the second is B's
  -- (20261001110000:1256).
  old_post constant text := '8d8be860d3f7077b9d6f9238705bdca7';
  old_vote constant text := 'a8f2efe48f8c892b609a188deb132551';
  old_view constant text := '747ee06d2e4c3e8a788129f7530ec0ae';
  taken text[];
  got   text;
begin
  -- a. Not applied yet, and every name free. All three there = already
  --    applied; some of them = half there, or something else owns a name:
  --    stop and look. This runs BEFORE the fingerprints: on a database that
  --    has the file the two restated functions no longer read as the old
  --    ones, and "drifted" would point the wrong way.
  select array_agg(x.what order by x.o) into taken
    from (
      select 1 as o, 'the column public.channels.post_policy' as what
       where exists (select 1 from pg_attribute a
                      where a.attrelid = 'public.channels'::regclass
                        and a.attname = 'post_policy' and not a.attisdropped)
      union all
      select 2, 'the constraint channels_post_policy_check'
       where exists (select 1 from pg_constraint c
                      where c.conrelid = 'public.channels'::regclass
                        and c.conname = 'channels_post_policy_check')
      union all
      select 3, 'the constraint channels_post_policy_rooms_only'
       where exists (select 1 from pg_constraint c
                      where c.conrelid = 'public.channels'::regclass
                        and c.conname = 'channels_post_policy_rooms_only')
    ) x;
  if cardinality(taken) = 3 then
    raise exception 'chat-post-policy: already applied: public.channels.post_policy and its two constraints all exist';
  elsif taken is not null then
    raise exception 'chat-post-policy: a name this file creates is taken (half applied, or something else owns it): %', array_to_string(taken, '; ');
  end if;

  -- b. The allow list the 'listed' arm reads (20260922120500), and the three
  --    functions this file restates or leans on.
  if to_regclass('public.org_channel_members') is null then
    raise exception 'chat-post-policy: public.org_channel_members is missing; the listed rule has nothing to read';
  end if;
  if to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)') is null
     or to_regprocedure('public.can_view_org_channel(uuid,uuid)') is null then
    raise exception 'chat-post-policy: migration A (20261001100000) is missing: no can_post_org_channel(uuid,uuid,uuid) or no can_view_org_channel(uuid,uuid)';
  end if;
  if to_regprocedure('public.chat_cast_vote(uuid,uuid,uuid,boolean)') is null then
    raise exception 'chat-post-policy: migration B (20261001110000) is missing: no chat_cast_vote(uuid,uuid,uuid,boolean)';
  end if;

  -- c. The three functions read as the files that wrote them left them. A
  --    different md5 means someone changed one by hand, or another file
  --    restated it: read it first, then carry its change into steps 2 and 3
  --    (and into the ROLLBACK text) before applying.
  select md5(pg_get_functiondef(p.oid)) into got from pg_proc p
   where p.oid = to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)');
  if got is distinct from old_post then
    raise exception 'chat-post-policy: can_post_org_channel drifted (md5 %, expected %); re-read it first', got, old_post;
  end if;
  select md5(pg_get_functiondef(p.oid)) into got from pg_proc p
   where p.oid = to_regprocedure('public.chat_cast_vote(uuid,uuid,uuid,boolean)');
  if got is distinct from old_vote then
    raise exception 'chat-post-policy: chat_cast_vote drifted (md5 %, expected %); re-read it first', got, old_vote;
  end if;
  select md5(pg_get_functiondef(p.oid)) into got from pg_proc p
   where p.oid = to_regprocedure('public.can_view_org_channel(uuid,uuid)');
  if got is distinct from old_view then
    raise exception 'chat-post-policy: can_view_org_channel drifted (md5 %, expected %); re-read it first', got, old_view;
  end if;
  raise notice 'chat-post-policy: pre-flight ok: every name free, org_channel_members there, the three functions read as migrations A and B left them';
end $$;

-- 1. The column and its two CHECKs ------------------------------------------------
-- A constant default: no rewrite of the table, every existing row reads
-- 'everyone' at once. The first CHECK names the three values (the app's
-- POST_POLICIES); the second keeps the rule to extra rooms: coalesce because
-- kind is null for a dm or a group, and a null there must refuse, not pass.
-- Both are validated in this statement by one scan of channels.
alter table public.channels
  add column post_policy text not null default 'everyone',
  add constraint channels_post_policy_check
    check (post_policy in ('everyone', 'officers', 'listed')),
  add constraint channels_post_policy_rooms_only
    check (post_policy = 'everyone' or coalesce(kind = 'room', false));
comment on column public.channels.post_policy is
  'Who may post a new message in an extra room (kind = room): everyone who can see it (default, the rule before this column), officers (owner and admin), or listed (owner, admin and the people in org_channel_members). Every other kind is always everyone here; the Board, event chats and dms keep their own rules.';

-- 2. can_post_org_channel, restated whole ------------------------------------------
-- Migration A's body (20261001100000:1362-1394) with exactly TWO arms added,
-- the ones that name post_policy. Where they sit matters:
--   * after "cannot view -> false": a rule never lets in someone who cannot
--     see the room (an allow-list row of a person who left the club gives
--     nothing);
--   * after "root is not null -> false": a room has no replies under any
--     rule;
--   * before "lounge, officers, room -> true": a room with 'everyone' falls
--     through to that arm and answers as it always did.
-- The role guards, the Board arms and the event arm are A's, untouched.
-- CREATE OR REPLACE keeps the owner and the ACL but NOT the other attributes:
-- STABLE, SECURITY DEFINER, search_path and TimeZone are restated here.
create or replace function public.can_post_org_channel(cid uuid, uid uuid, root uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
set timezone to 'UTC'
as $$
  select coalesce((
    select case
      when current_setting('role', true) = 'anon' then false
      when current_setting('role', true) = 'authenticated'
           and uid is distinct from auth.uid() then false
      when not coalesce(public.can_view_org_channel(c.id, uid), false) then false
      when c.kind = 'board' and root is null then
        coalesce(public.org_member_role(c.org_id, uid) in ('owner', 'admin'), false)
      when c.kind = 'board' then
        exists (select 1 from public.messages m
                 where m.id = root
                   and m.channel_id = c.id
                   and m.thread_root_id is null
                   and m.removed_at is null)
      when root is not null then false
      when c.kind = 'event' then
        coalesce((select now() < e.ends_at + interval '7 days'
                    from public.events e
                   where e.id = c.event_id), false)
      when c.kind = 'room' and c.post_policy = 'officers' then
        coalesce(public.org_member_role(c.org_id, uid) in ('owner', 'admin'), false)
      when c.kind = 'room' and c.post_policy = 'listed' then
        coalesce(public.org_member_role(c.org_id, uid) in ('owner', 'admin'), false)
        or exists (select 1 from public.org_channel_members ocm
                    where ocm.channel_id = c.id and ocm.user_id = uid)
      when c.kind in ('lounge', 'officers', 'room') then true
      else false
    end
      from public.channels c
     where c.id = cid), false);
$$;

comment on function public.can_post_org_channel(uuid, uuid, uuid) is
  'May uid write in club room cid (root = the Board post replied to, NULL for a top-level message)? Board: owners and admins post, any member replies under a live top-level post of that Board. Event chat: until 7 days after the event ends. Lounge, Officers: anyone who can see them. Rooms: by post_policy. everyone = anyone who can see the room; officers = owners and admins; listed = owners, admins and the people in org_channel_members; never a reply. Under the authenticated role it only answers about the caller. False for a room that does not exist.';

-- CREATE OR REPLACE keeps the ACL; restate it so the standing rule holds even
-- if someone changed it by hand. Nothing is revoked.
grant execute on function public.can_post_org_channel(uuid, uuid, uuid) to anon, authenticated, service_role;

-- 3. chat_cast_vote, restated whole --------------------------------------------------
-- Migration B's body (20261001110000:836-889) verbatim with ONE change, the
-- second half of the "closed" test: v_kind <> 'board' became v_kind = 'event'.
-- B asked "does the room still accept posts FROM THIS PERSON" for every kind
-- but the Board; the only room where that could be false for someone who
-- passed can_view_org_channel two tests earlier was an event chat past its 7
-- days. With post_policy it would also be false for a reader of an
-- 'officers' or 'listed' room, and a poll nobody but its authors can answer
-- is no poll: so the test now names the one kind it was ever about. Lock
-- order (the poll row, then the option row), the 42501 guard and every
-- SQLSTATE are B's. plpgsql, VOLATILE, SECURITY DEFINER, search_path '' and
-- TimeZone UTC restated, as in step 2.
create or replace function public.chat_cast_vote(p_poll uuid, p_option uuid, p_user uuid, p_on boolean)
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
     or (v_kind = 'event' and not coalesce(public.can_post_org_channel(v_poll.channel_id, p_user, null), false)) then
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
  'Turns one vote on or off (wave-2 contract 3.4): the poll row is the lock, a single-choice poll drops the person''s other vote first, a sign-up slot at capacity refuses, off is idempotent; anyone who can view the room may vote, also on a Board and in a room where only some people post (post_policy). Raises 42501 (anon or authenticated), P0C22 (a bad shape), P0C24 (no such poll or option for this person: missing, removed, not viewable, an option of another poll), P0C25 (closed: past closes_at, or an event chat past its 7 days), P0C26 (slot full). Does not check consent, publish or restriction: the route does.';

grant execute on function public.chat_cast_vote(uuid,uuid,uuid,boolean) to anon, authenticated, service_role;

-- 4. POST-CHECK by catalog (same transaction): any miss aborts the whole file ----
do $$
declare
  old_post  constant text := '8d8be860d3f7077b9d6f9238705bdca7';
  old_vote  constant text := 'a8f2efe48f8c892b609a188deb132551';
  old_view  constant text := '747ee06d2e4c3e8a788129f7530ec0ae';
  -- md5(pg_get_functiondef) of the two functions as this file leaves them,
  -- copied from the catalog after the first local rehearsal (Oct 3, 2026),
  -- never typed by hand. An empty constant = the check prints both and raises
  -- "function fingerprints are empty". No real apply runs with one. The next
  -- file that restates one of them writes its PRE-FLIGHT against these.
  want_post constant text := 'ae485a1fb463cfd6f6ace3448d986fb9';
  want_vote constant text := '0ba4681e8816cecaa5c066ee6b03bedd';
  got_post  text;
  got_vote  text;
  got       text;
  n         bigint;
  f         record;
  bad       text := '';
begin
  -- a. The column: text, not null, the constant default.
  select format('%s %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
                case when a.attnotnull then ' not null' else '' end,
                coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), ''))
    into got
    from pg_attribute a
    left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'public.channels'::regclass and a.attname = 'post_policy' and not a.attisdropped;
  if got is distinct from 'post_policy text not null default ''everyone''::text' then
    bad := bad || format(' the column is "%s";', coalesce(got, '(missing)'));
  end if;

  -- b. The two CHECKs: there, validated, and reading as written (the text
  --    Postgres gives back for them).
  select string_agg(c.conname || ' ' || pg_get_constraintdef(c.oid), ' | ' order by c.conname collate "C")
    into got
    from pg_constraint c
   where c.conrelid = 'public.channels'::regclass and c.contype = 'c' and c.convalidated
     and c.conname in ('channels_post_policy_check', 'channels_post_policy_rooms_only');
  if got is distinct from
       'channels_post_policy_check CHECK ((post_policy = ANY (ARRAY[''everyone''::text, ''officers''::text, ''listed''::text])))'
    || ' | channels_post_policy_rooms_only CHECK (((post_policy = ''everyone''::text) OR COALESCE((kind = ''room''::text), false)))' then
    bad := bad || format(' the constraints are "%s";', coalesce(got, '(missing)'));
  end if;

  -- c. Nobody has a rule yet: every row reads the default.
  select count(*) into n from public.channels c where c.post_policy <> 'everyone';
  if n <> 0 then
    bad := bad || format(' %s rows hold a post_policy other than everyone;', n);
  end if;

  -- d. The functions: SECURITY DEFINER, the volatility, search_path and
  --    TimeZone each had before (CREATE OR REPLACE resets what is not
  --    restated), EXECUTE for all three roles.
  for f in
    select * from (values
      ('public.can_post_org_channel(uuid,uuid,uuid)',      's', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_cast_vote(uuid,uuid,uuid,boolean)',    'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.can_view_org_channel(uuid,uuid)',           's', array['search_path=public'])
    ) as t (sig, vol, cfg)
  loop
    if not exists (select 1 from pg_proc p
                    where p.oid = to_regprocedure(f.sig)
                      and p.prosecdef
                      and p.provolatile = f.vol
                      and p.proconfig = f.cfg) then
      bad := bad || format(' %s is missing, not SECURITY DEFINER, or has another volatility, search_path or TimeZone;', f.sig);
    end if;
    if not (has_function_privilege('anon', f.sig, 'execute')
        and has_function_privilege('authenticated', f.sig, 'execute')
        and has_function_privilege('service_role', f.sig, 'execute')) then
      bad := bad || format(' %s must be executable by anon, authenticated and service_role;', f.sig);
    end if;
  end loop;

  -- e. The fingerprints: can_view_org_channel as it was; the two restated
  --    functions read as written, which is not as they were.
  select md5(pg_get_functiondef(p.oid)) into got from pg_proc p
   where p.oid = to_regprocedure('public.can_view_org_channel(uuid,uuid)');
  if got is distinct from old_view then
    bad := bad || format(' can_view_org_channel changed (md5 %s);', got);
  end if;
  select md5(pg_get_functiondef(p.oid)) into got_post from pg_proc p
   where p.oid = to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)');
  select md5(pg_get_functiondef(p.oid)) into got_vote from pg_proc p
   where p.oid = to_regprocedure('public.chat_cast_vote(uuid,uuid,uuid,boolean)');
  if want_post = '' or want_vote = '' then
    raise notice 'chat-post-policy: md5 can_post_org_channel = %', got_post;
    raise notice 'chat-post-policy: md5 chat_cast_vote = %', got_vote;
    raise exception 'chat-post-policy: function fingerprints are empty';
  end if;
  if got_post is distinct from want_post or got_post = old_post then
    bad := bad || format(' can_post_org_channel does not read as written (md5 %s);', got_post);
  end if;
  if got_vote is distinct from want_vote or got_vote = old_vote then
    bad := bad || format(' chat_cast_vote does not read as written (md5 %s);', got_vote);
  end if;

  if bad <> '' then
    raise exception 'chat-post-policy: post-check failed:%', bad;
  end if;
  raise notice 'chat-post-policy: post-check ok: post_policy text not null default everyone, both CHECKs validated, no row with a rule, can_post_org_channel % and chat_cast_vote % read as written, can_view_org_channel unchanged, all three executable by anon, authenticated and service_role', got_post, got_vote;
end $$;

-- 5. POST-CHECK BY BEHAVIOUR (rolls itself back) -----------------------------------
-- As the file's role (postgres): under it can_post_org_channel answers about
-- any uid (its guards name anon and authenticated only), which is how the
-- card functions ask it. The same cases run as signed-in students through
-- the INSERT policy in scripts/sql/chat-room-post-policy-check.sql (local
-- only). The PEOPLE are real:
-- the oldest club that has an owner or admin AND a plain member gives the
-- officer (an admin when it has one) and the member; the outsider is the
-- oldest users row that is not in that club (an id nobody has when everyone
-- is). The ROOM is this block's own: a public extra room in that club, with
-- one message of the officer's as the root the reply probes name.
-- chat_channels_subscribe gives every member of the club a channel_members
-- row on it; bump_org_activity_on_message moves the club's last_activity_at;
-- all of that, the rules set, the allow-list row, the poll and the vote go
-- when the inner block raises P0C59 (this file's own code, used nowhere
-- else). Any OTHER error leaves this block and aborts the whole file.
-- SKIPPED with a NOTICE and a line in the APPLY RECORD when no club has both
-- an officer and a plain member; the vote alone is skipped (and says so)
-- when the poll fixture cannot be built.
do $$
declare
  me        text := current_user;
  v_room    constant uuid := gen_random_uuid();
  v_org     uuid;
  v_officer uuid;
  v_member  uuid;
  v_out     uuid;
  v_root    uuid;
  v_poll    uuid;
  v_opt     uuid;
  v_con     text;
  pol       text;
  can_m     boolean;                             -- the member, a new message
  can_o     boolean;                             -- the officer, a new message
  can_x     boolean;                             -- the outsider, a new message
  rep_m     boolean;                             -- the member, a reply
  rep_o     boolean;                             -- the officer, a reply
  n         bigint;
  res       text := '';
  want      text;
  state     text;
  poll_why  text;
begin
  select o.id into v_org
    from public.orgs o
   where exists (select 1 from public.org_members m
                  where m.org_id = o.id and m.role in ('owner', 'admin'))
     and exists (select 1 from public.org_members m
                  where m.org_id = o.id and m.role = 'member')
   order by o.created_at, o.id
   limit 1;
  if v_org is null then
    perform set_config('chat_post_policy.probe',
      'behaviour check SKIPPED: no club has an owner or admin and a plain member', true);
    raise notice 'chat-post-policy: behaviour check SKIPPED: no club has an owner or admin and a plain member';
    return;
  end if;
  select m.user_id into v_officer from public.org_members m
   where m.org_id = v_org and m.role in ('owner', 'admin')
   order by (m.role = 'admin') desc, m.joined_at, m.user_id limit 1;
  select m.user_id into v_member from public.org_members m
   where m.org_id = v_org and m.role = 'member'
   order by m.joined_at, m.user_id limit 1;
  select u.id into v_out from public.users u
   where not exists (select 1 from public.org_members m
                      where m.org_id = v_org and m.user_id = u.id)
   order by u.created_at, u.id limit 1;
  v_out := coalesce(v_out, gen_random_uuid());

  want := 'everyone:member=true,officer=true,outsider=false,member_reply=false,officer_reply=false;'
       || 'officers:member=false,officer=true,outsider=false,member_reply=false,officer_reply=false;'
       || 'officers:member_vote=accepted 1;'
       || 'listed:member=false,officer=true,outsider=false,member_reply=false,officer_reply=false;'
       || 'listed+row:member=true,member_reply=false;'
       || case when exists (select 1 from public.channels ch where ch.kind = 'lounge')
               then 'lounge=23514 channels_post_policy_rooms_only;'
               else 'lounge=updated 0;' end
       || 'value=23514 channels_post_policy_check;'
       || 'dm=23514 channels_post_policy_rooms_only;';

  begin
    -- the room (kind sent, so chat_channels_fill_kind leaves it alone) and
    -- the message the reply probes name as their root
    insert into public.channels (id, org_id, type, kind, name, is_private)
    values (v_room, v_org, 'org_channel', 'room', 'post-policy-probe', false);
    insert into public.messages (channel_id, user_id, content)
    values (v_room, v_officer, 'chat-post-policy probe: root')
    returning id into v_root;

    foreach pol in array array['everyone', 'officers', 'listed'] loop
      update public.channels set post_policy = pol where id = v_room;
      select public.can_post_org_channel(v_room, v_member, null),
             public.can_post_org_channel(v_room, v_officer, null),
             public.can_post_org_channel(v_room, v_out, null),
             public.can_post_org_channel(v_room, v_member, v_root),
             public.can_post_org_channel(v_room, v_officer, v_root)
        into can_m, can_o, can_x, rep_m, rep_o;
      res := res || format('%s:member=%s,officer=%s,outsider=%s,member_reply=%s,officer_reply=%s;',
                           pol, can_m::text, can_o::text, can_x::text, rep_m::text, rep_o::text);

      if pol = 'officers' then
        -- The officer makes a poll here (the card functions ask
        -- can_post_org_channel: only an officer can); the member, who can
        -- read the room but not post in it, votes. Before step 3 this vote
        -- was "closed" (P0C25).
        begin
          v_poll := public.chat_create_poll(v_room, v_officer, 'poll', 'chat-post-policy probe',
                      '[{"label": "a"}, {"label": "b"}]'::jsonb, false, false, null,
                      'chat-post-policy probe: poll');
          select o.id into v_opt from public.chat_poll_options o
           where o.poll_id = v_poll and o.position = 0;
        exception when others then
          poll_why := sqlstate || ' ' || sqlerrm;
          v_poll := null;
        end;
        if v_poll is null or v_opt is null then
          poll_why := coalesce(poll_why, 'the poll has no option');
          res := res || 'officers:member_vote=skipped;';
        else
          begin
            perform public.chat_cast_vote(v_poll, v_opt, v_member, true);
            select count(*) into n from public.chat_poll_votes v
             where v.poll_id = v_poll and v.user_id = v_member;
            res := res || 'officers:member_vote=accepted ' || n || ';';
          exception when others then
            res := res || 'officers:member_vote=' || sqlstate || ';';
          end;
        end if;
      end if;

      if pol = 'listed' then
        -- the allow list: the same rows that let a person into a private room
        insert into public.org_channel_members (channel_id, user_id, added_by)
        values (v_room, v_member, v_officer);
        select public.can_post_org_channel(v_room, v_member, null),
               public.can_post_org_channel(v_room, v_member, v_root)
          into can_m, rep_m;
        res := res || format('listed+row:member=%s,member_reply=%s;', can_m::text, rep_m::text);
      end if;
    end loop;

    -- The CHECKs, by trying. 'officers' on the Lounges (every one of them:
    -- the statement fails whole on the first row, so none changes); a value
    -- outside the three on the probe room; a dm with a rule (kind is null
    -- there: the coalesce must refuse, not pass).
    begin
      update public.channels set post_policy = 'officers' where kind = 'lounge';
      get diagnostics n = row_count;
      res := res || 'lounge=updated ' || n || ';';
    exception when check_violation then
      get stacked diagnostics v_con = constraint_name;
      res := res || 'lounge=' || sqlstate || ' ' || v_con || ';';
    end;
    begin
      update public.channels set post_policy = 'nobody' where id = v_room;
      get diagnostics n = row_count;
      res := res || 'value=updated ' || n || ';';
    exception when check_violation then
      get stacked diagnostics v_con = constraint_name;
      res := res || 'value=' || sqlstate || ' ' || v_con || ';';
    end;
    begin
      insert into public.channels (type, name, post_policy) values ('dm', '', 'listed');
      res := res || 'dm=inserted;';
    exception when check_violation then
      get stacked diagnostics v_con = constraint_name;
      res := res || 'dm=' || sqlstate || ' ' || v_con || ';';
    end;

    raise exception using errcode = 'P0C59', message = res;
  exception when sqlstate 'P0C59' then
    state := sqlerrm;
  end;

  if poll_why is not null then
    -- No poll could be built (the reason is in the record): the vote was not
    -- probed, everything else was.
    want := replace(want, 'officers:member_vote=accepted 1;', 'officers:member_vote=skipped;');
  end if;
  if state is distinct from want then
    raise exception 'chat-post-policy: the behaviour probes read "%", expected "%"', coalesce(state, '(none)'), want;
  end if;
  if current_user <> me then
    raise exception 'chat-post-policy: the post-check did not return to role %', me;
  end if;
  if exists (select 1 from public.channels ch where ch.id = v_room)
     or exists (select 1 from public.messages m
                 where m.channel_id = v_room or m.content like 'chat-post-policy probe%')
     or exists (select 1 from public.org_channel_members ocm where ocm.channel_id = v_room)
     or exists (select 1 from public.channel_members cm where cm.channel_id = v_room) then
    raise exception 'chat-post-policy: the probe room % or one of its rows survived the post-check', v_room;
  end if;
  if exists (select 1 from public.channels ch where ch.post_policy <> 'everyone') then
    raise exception 'chat-post-policy: a room holds a rule other than everyone after the post-check';
  end if;
  perform set_config('chat_post_policy.probe',
    'behaviour check passed'
    || case when poll_why is not null
            then ' (the vote in an officers room was NOT probed: no poll fixture, ' || poll_why || ')'
            else '' end
    || ': ' || state, true);
  raise notice 'chat-post-policy: behaviour check passed: %', state;
end $$;

-- 6. The apply record ---------------------------------------------------------------
-- NOTICE lines do not come back through the Management API, so what this run
-- did is written where a read-only query finds it afterwards: at the end of
-- the comment of can_post_org_channel (CHECK AFTER APPLYING, query 1), the
-- way migrations A and B keep theirs. A comment is not part of
-- pg_get_functiondef: the md5s of step 4 are not moved by it.
do $$
declare
  was text := obj_description('public.can_post_org_channel(uuid,uuid,uuid)'::regprocedure, 'pg_proc');
  rec text;
begin
  rec := 'APPLY RECORD '
      || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC: '
      || 'column 1, checks 2, functions restated 2; '
      || coalesce(nullif(current_setting('chat_post_policy.probe', true), ''), 'the behaviour check left no record')
      || '.';
  execute format('comment on function public.can_post_org_channel(uuid, uuid, uuid) is %L',
                 coalesce(was, '') || ' ' || rec);
  raise notice 'chat-post-policy: %', rec;
end $$;

-- 7. tell PostgREST about the new column (delivered at commit) -------------------
notify pgrst, 'reload schema';

commit;
