-- S69 club chat v1, wave 1, batch B1a (contract: section 3 of
-- handoffs/chat-redesign/wave-1-contracts.md): rooms, the Board rule, and the
-- message columns the cards of wave 2 will use.
--
-- WHY THIS EXISTS. Franky's calls (wave-0-decisions.md, Sept 29): every club
-- has a Board (officers post, members reply), a Lounge (everyone talks) and
-- an Officers room; every club event has its own chat, open to the club's
-- members who said Going or Maybe and to the officers, until 7 days after the
-- event ends. Those rules have to hold for a direct PostgREST write too, so
-- they live in the database: CHECKs, five triggers, two functions, three
-- policies. The screens come later and only read what is stored here.
--
-- WHAT IT DOES (statements in the order 3.1 to 3.9 of the contract)
--   0. PRE-FLIGHT, catalog and count reads only: the two functions and the
--      three policies this file restates read exactly as LIVE STATE says,
--      every name it adds is free, and the data has the shape the backfill
--      was written for. SAE (the club with handle sae) has at most 1 member.
--   1. Columns channels.kind, channels.event_id, messages.kind (default
--      'text'), messages.thread_root_id, messages.card_event_id; 6 indexes.
--   2. Backfill of channels.kind: SAE by hand (general -> lounge AND public,
--      announcements -> board, exec -> officers, events -> room), then for
--      every club announcements -> board, general -> lounge, the first
--      private channel -> officers, the rest -> room; board / lounge /
--      officers rows take their kind as their name. No message moves.
--   3. 9 CHECK constraints (6 on channels, 3 on messages).
--   4. Five triggers and chat_repair_club(uuid). The four AFTER triggers
--      swallow their own errors (a chat bug never blocks an RSVP, an event, a
--      join or a leave); chat_repair_club repairs what a failed one missed:
--      it creates what is missing AND removes the rows that should not exist.
--      The trigger on rsvps fires on ANY update of an RSVP, so an RSVP moved
--      to another event leaves the old event room (both: S69 orchestrator's
--      decisions after the review of Sept 29; contract 3.4 names "UPDATE OF
--      status" and an insert-only repair).
--   5. can_view_org_channel restated from the t2b body with ONE new arm (an
--      event room is for officers and for members holding a row on it);
--      new can_post_org_channel(cid, uid, root).
--   6. ALTER POLICY x3: both INSERT policies on messages, and
--      channel_members_delete_own_pending.
--   7. Data: chat_repair_club for every club (the missing Officers rooms, the
--      event rooms of events inside their window, every missing row). The
--      rows the repair would remove are counted first: any is a stop.
--   9. POST-CHECK in the same transaction, the last part BY BEHAVIOUR in a
--      subtransaction that rolls itself back; then the APPLY RECORD, written
--      where a read-only query finds it (CHECK AFTER APPLYING).
--  10. notify pgrst, 'reload schema'.
--
-- DOES NOT: touch any SELECT policy, any table grant (the clean-up on
-- message_reactions and org_channel_members is its own file, contract 3.8),
-- org_members_drop_club_access (leaving a club still deletes every room row,
-- event rooms included), or any message. Nothing is deleted. No room cap.
-- messages.kind is always 'text' until wave 2 (migration B).
-- The only GRANTs are EXECUTE on the two new callable functions and the
-- restated one on can_view_org_channel.
-- Blocks in club rooms (contract 12.2, Franky's answer of Sept 29: both ways,
-- officers' Board posts excepted) need nothing from this file and are NOT
-- in it: no SELECT policy changes, so two people who blocked each other
-- still read each other in a club room until the wave that ships the rooms'
-- screens.
-- It does not narrow what co-members read of each other's channel_members
-- rows (hidden_at, muted_until, last_read_at); after step 7 every member
-- holds such rows. The column fix is its own file (contract 0).
-- Officers is owner + admin + the allow-list (decision 27): a demotion does
-- not remove an allow-list row (org_channel_members), so a demoted officer
-- who holds one keeps the Officers room.
--
-- LIVE STATE (local stack read by this batch, 2026-09-29; production read by
-- the S69 orchestrator the same day, read-only, asis section 11: every
-- function md5 and every policy text below is the same on both):
--   * md5(pg_get_functiondef) can_view_org_channel(uuid, uuid) =
--     269c1185295552f74930f1acffd7c170 (the t2b body, 20260922120500:270);
--     org_members_drop_club_access() = 0e7baa973042be8ca0decb7df1ca6407.
--   * After this file: md5(pg_get_functiondef) can_view_org_channel =
--     747ee06d2e4c3e8a788129f7530ec0ae, can_post_org_channel(uuid, uuid,
--     uuid) = 8d8be860d3f7077b9d6f9238705bdca7 (POST-CHECK e compares both;
--     the next file that restates one writes its PRE-FLIGHT against them).
--   * messages: 2 permissive INSERT policies (messages_insert_member,
--     messages_insert_org_member), no UPDATE policy; authenticated holds
--     table INSERT, no UPDATE. channel_members: 1 DELETE policy.
--   * PRODUCTION, read by the S69 orchestrator on 2026-09-29 (read-only):
--       - channels, channel_members, rsvps and events have NO trigger;
--         org_members has exactly four (org_members_clear_removal_on_join,
--         org_members_drop_club_access, org_members_imply_follow,
--         org_members_unfollow_on_leave). Local: the same.
--       - club-room messages with media_url set = 0 (local: 0);
--       - SAE has 1 member;
--       - no club has two channels named general or announcements; no club
--         channel is named board, lounge or officers;
--       - the postgres role's search_path is "$user", public, extensions,
--         as on the local stack, so the policy texts deparse without the
--         public. prefix there too (the constants below are compared
--         character for character).
--     THE ORCHESTRATOR READS THESE AGAIN RIGHT BEFORE THE APPLY (PRE-CHECK
--     below); the PRE-FLIGHT refuses the file when one of them is no longer
--     true.
--   * PRODUCTION DRY RUN (asis 11.5 / 11.6, as of 2026-09-29): 5 clubs, 12
--     club channels, all org_channel, 0 org_subchannel, 0 without a club.
--     SAE has ONE member (its owner); its general is private and holds 3
--     messages. 15 club messages, 1 reply. 2 subscription rows in total
--     (both SAE's). 13 events, 3 inside the 7-day window; 7 going/maybe
--     RSVPs.
--     What this file does to it: kind = 5 lounge, 5 board, 1 officers (SAE's
--     exec), 1 room (SAE's events); 11 renames; SAE's general turns public;
--     step 7 creates 4 Officers rooms (the test clubs) and the rooms of the
--     events still inside their window, and the rows of 7 memberships on
--     their public rooms (13 missing of 15) plus the officers' and the RSVP
--     holders' rows on those event rooms.
--     The 3 events were read on Sept 29 and none is upcoming: each leaves
--     its window 7 days after it ended, so the apply creates between 0 and
--     3 event rooms. Re-read on the apply day (PRE-CHECK 3).
--   * Local rehearsal (2026-09-29). The local database is
--     scripts/local-seed.mjs PLUS leftovers of manual tests: the club
--     test_bloomington_cycling with no member and no channel, one extra
--     membership (avery_owner in test_request_club; that account is also a
--     platform admin), two events, one RSVP by a non-member. 7 clubs, 14
--     club channels, 11 memberships, 6 subscription rows. kind = 6 lounge,
--     6 board, 1 officers, 1 room; 13 renames; backfill steps 2.4 and 2.5
--     match 0 rows (as on production; a rehearsal variant with a private
--     and an extra public channel ran them). Step 7 created 15 rooms (6
--     Officers, the Lounge and Board of the club that had no channel, 7
--     event rooms) and 31 rows. The behaviour probe ran as avery_owner, a
--     member of test_request_club. A stack rebuilt from the seed alone has
--     6 clubs and 10 memberships and gives other numbers.
--
-- PRE-CHECK (read-only, on production, on the apply day, in a UTC session:
-- the Supabase MCP and psql default). RAISE NOTICE lines do not come back
-- through the Management API, so these answers are how the person applying
-- knows beforehand what the file will do.
--   1. SAE. Expected: 1 row reading 1 / 1 / 1. No row = no SAE, fine. More
--      than 1 member, or a 0 = the PRE-FLIGHT stops the file.
--     select o.handle,
--            (select count(*) from public.org_members m where m.org_id = o.id) as members,
--            (select count(*) from public.channels c where c.org_id = o.id
--                and c.type = 'org_channel' and c.name = 'general') as general_rows,
--            (select count(*) from public.channels c where c.org_id = o.id
--                and c.type = 'org_channel' and c.name = 'exec') as exec_rows
--       from public.orgs o where o.handle = 'sae';
--   2. Who may publish (the rule of can_publish_now()). members = 0 means the
--      behaviour probe of the POST-CHECK will be SKIPPED: tell Franky before
--      the apply. officers = 0 means only the officer's Board post is not
--      probed. (The probe needs both in the SAME club; the APPLY RECORD says
--      what really ran.)
--     select count(*) filter (where m.role in ('member', 'mod')) as members_who_may_publish,
--            count(*) filter (where m.role in ('owner', 'admin')) as officers_who_may_publish
--       from public.org_members m
--       join public.users u on u.id = m.user_id
--      where u.terms_accepted_at is not null and u.age_attested_at is not null
--        and u.school_verified
--        and not exists (select 1 from public.account_restrictions r
--                         where r.user_id = u.id and r.lifted_at is null
--                           and r.starts_at <= now()
--                           and (r.ends_at is null or r.ends_at > now()));
--   3. The event rooms step 7 will create (0 to 3, see LIVE STATE).
--     select count(*) as events_in_their_window from public.events
--      where org_id is not null and ends_at + interval '7 days' > now();
--   4. The facts of LIVE STATE. Expected: 0 / 4 / 0 / 0 / 0 / 0 / f.
--     select (select count(*) from pg_trigger t where not t.tgisinternal
--                and t.tgrelid in ('public.channels'::regclass, 'public.channel_members'::regclass,
--                                  'public.rsvps'::regclass, 'public.events'::regclass)) as triggers_on_the_four,
--            (select count(*) from pg_trigger t where not t.tgisinternal
--                and t.tgrelid = 'public.org_members'::regclass) as triggers_on_org_members,
--            (select count(*) from public.messages m join public.channels c on c.id = m.channel_id
--              where c.org_id is not null and m.media_url is not null) as club_messages_with_media,
--            (select count(*) from public.channels where type = 'org_channel'
--                and lower(btrim(name)) in ('board', 'lounge', 'officers')) as names_already_taken,
--            (select count(*) from (select 1 from public.channels
--                where type = 'org_channel' and name in ('general', 'announcements')
--                group by org_id, name having count(*) > 1) d) as doubled_names,
--            (select count(*) from public.channel_members cm join public.channels c on c.id = cm.channel_id
--              where c.org_id is not null
--                and not exists (select 1 from public.org_members m
--                                 where m.org_id = c.org_id and m.user_id = cm.user_id)) as rows_of_non_members,
--            (has_table_privilege('authenticated', 'public.messages', 'UPDATE')
--             or has_table_privilege('authenticated', 'public.channels', 'INSERT')
--             or has_table_privilege('authenticated', 'public.channels', 'UPDATE')
--             or has_table_privilege('authenticated', 'public.channel_members', 'INSERT')
--             or has_table_privilege('anon', 'public.messages', 'SELECT')) as grants_differ;
--
-- APPLY ORDER vs THE DEPLOY: BEFORE the deploy (contract 3.10). The branch is
-- green -> this file is applied on production and recorded -> the branch is
-- merged to main, under 15 minutes later.
-- Inside that window old code runs on the new database (contract 3.10):
--   * sending a message works (kind defaults to 'text');
--   * a member posting on a Board is refused by RLS; the old route answers
--     its bare 500;
--   * the old inbox lists event rooms too, with the people who RSVP'd;
--   * a new club gets Lounge + Board from the BEFORE INSERT trigger but no
--     Officers room (chat_repair_club fixes it);
--   * the old desktop modal can still delete a Board, a Lounge, Officers or
--     an event room;
--   * leaving a club room from the old inbox still deletes the member's row;
--   * flipping a Board to private in the old modal is refused by the CHECK
--     before anything is deleted (500).
-- New code before this file: every changed route has a missing-schema answer.
-- Needs Franky's yes, at a quiet hour: ADD COLUMN, ADD CONSTRAINT and ALTER
-- POLICY hold ACCESS EXCLUSIVE locks on channels, messages and
-- channel_members until COMMIT (nobody reads or writes chat meanwhile);
-- CREATE TRIGGER and CREATE INDEX block writes to rsvps, events and
-- org_members for as long. lock_timeout is 5 seconds: the file gives up
-- rather than queue.
-- Apply with the Management API curl recipe in
-- 20260926100000_users_profile_layout.sql, then record it:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261001100000', 'chat_v2_rooms');
--
-- The Management API answers an empty result on success and the error text
-- on a failure: everything that must stop the apply is a RAISE EXCEPTION
-- (the whole file rolls back). A second run on a database that has the file
-- stops at once with "already applied".
--
-- CHECK AFTER APPLYING (read-only, a UTC session):
--   1. The APPLY RECORD, the last sentence of the comment: when it ran, how
--      many rooms and rows step 7 created, whether SAE was there, and
--      whether the behaviour probe passed or was SKIPPED (and why).
--     select obj_description('public.chat_repair_club(uuid)'::regprocedure, 'pg_proc') as apply_record;
--   2. Rooms and rows by kind. Production, from the dry run of Sept 29:
--      board 5, lounge 5, officers 5, room 1, event = the answer of
--      PRE-CHECK 3.
--     select c.kind, count(*) as rooms,
--            (select count(*) from public.channel_members cm
--               join public.channels c2 on c2.id = cm.channel_id
--              where c2.org_id is not null and c2.kind = c.kind) as room_rows
--       from public.channels c
--      where c.org_id is not null
--      group by c.kind order by c.kind;
--   3. scripts/sql/chat-v2-after-deploy.sql, after the deploy. For a club it
--      lists with the repair as its fix: select public.chat_repair_club('<club id>');
-- Behaviour, local only: scripts/sql/chat-v2-rooms-check.sql.
--
-- ROLLBACK (restore the previous deployment FIRST, then roll back migration B
-- if it was applied, then this; one transaction). It does NOT undo the
-- renames (general -> lounge, announcements -> board, exec -> officers), the
-- channel_members rows, or SAE's general turning public: those are manual
-- steps, with Franky, and they have ONE safe place, marked MANUAL STEPS
-- below: after the CHECKs are dropped (before that, making a Lounge private
-- is refused) and before the columns are (after that, kind is gone and an
-- event room can only be told by position = 1000). The Officers rooms and
-- event rooms this file created remain as private channels; see the DELETE
-- below. Board replies written since the apply stay as ordinary messages of
-- the Board (thread_root_id is dropped). The apply record goes with
-- chat_repair_club.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   -- With Franky's yes, BEFORE the columns are dropped (the messages of the
--   -- event rooms go with them):
--   --   DELETE FROM public.channels WHERE kind = 'event';
--   ALTER POLICY messages_insert_org_member ON public.messages WITH CHECK (
--     (auth.uid() = user_id)
--     AND EXISTS (SELECT 1 FROM public.channels c
--                  WHERE c.id = messages.channel_id AND c.org_id IS NOT NULL
--                    AND public.can_view_org_channel(c.id, auth.uid()))
--     AND public.has_recorded_consent() AND public.can_publish_now());
--   ALTER POLICY messages_insert_member ON public.messages WITH CHECK (
--     (auth.uid() = user_id)
--     AND EXISTS (SELECT 1 FROM public.channel_members cm
--                   JOIN public.channels c ON c.id = cm.channel_id
--                  WHERE cm.channel_id = messages.channel_id
--                    AND cm.user_id = auth.uid() AND c.org_id IS NULL)
--     AND NOT EXISTS (SELECT 1 FROM public.channel_members peer
--                       JOIN public.blocks b
--                         ON (b.blocker_id = auth.uid() AND b.blocked_id = peer.user_id)
--                         OR (b.blocker_id = peer.user_id AND b.blocked_id = auth.uid())
--                      WHERE peer.channel_id = messages.channel_id
--                        AND peer.user_id <> auth.uid())
--     AND public.has_recorded_consent() AND public.can_publish_now());
--   ALTER POLICY channel_members_delete_own_pending ON public.channel_members
--     USING ((auth.uid() = user_id) AND (accepted_at IS NULL));
--   -- The t2b body (20260922120500:270), character for character: its md5
--   -- must read 269c1185295552f74930f1acffd7c170 again.
--   CREATE OR REPLACE FUNCTION public.can_view_org_channel(cid uuid, uid uuid)
--    RETURNS boolean
--    LANGUAGE sql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     SELECT CASE
--       WHEN current_setting('role', true) = 'anon' THEN false
--       WHEN current_setting('role', true) = 'authenticated'
--            AND uid IS DISTINCT FROM auth.uid() THEN false
--       WHEN c.org_id IS NULL THEN false
--       WHEN NOT public.is_org_member (c.org_id, uid) THEN false
--       WHEN c.is_private = false THEN true
--       WHEN public.org_member_role (c.org_id, uid) IN ('owner','admin') THEN true
--       ELSE EXISTS (
--         SELECT 1 FROM public.org_channel_members ocm
--         WHERE ocm.channel_id = cid AND ocm.user_id = uid
--       )
--     END
--     FROM public.channels c
--     WHERE c.id = cid;
--   $function$;
--   GRANT EXECUTE ON FUNCTION public.can_view_org_channel(uuid, uuid) TO anon, authenticated, service_role;
--   DROP TRIGGER chat_channels_fill_kind ON public.channels;
--   DROP TRIGGER chat_channels_subscribe ON public.channels;
--   DROP TRIGGER chat_org_members_rooms ON public.org_members;
--   DROP TRIGGER chat_rsvps_room ON public.rsvps;
--   DROP TRIGGER chat_events_room ON public.events;
--   DROP FUNCTION public.chat_channels_fill_kind();
--   DROP FUNCTION public.chat_channels_subscribe();
--   DROP FUNCTION public.chat_org_members_rooms();
--   DROP FUNCTION public.chat_rsvps_room();
--   DROP FUNCTION public.chat_events_room();
--   DROP FUNCTION public.chat_repair_club(uuid);
--   DROP FUNCTION public.can_post_org_channel(uuid, uuid, uuid);
--   ALTER TABLE public.channels
--     DROP CONSTRAINT channels_kind_check,
--     DROP CONSTRAINT channels_kind_by_type,
--     DROP CONSTRAINT channels_org_channel_has_org,
--     DROP CONSTRAINT channels_event_shape,
--     DROP CONSTRAINT channels_open_rooms_public,
--     DROP CONSTRAINT channels_closed_rooms_private;
--   ALTER TABLE public.messages
--     DROP CONSTRAINT messages_kind_check,
--     DROP CONSTRAINT messages_card_event_shape,
--     DROP CONSTRAINT messages_thread_root_not_self;
--   -- MANUAL STEPS, each with Franky's yes, only here (the CHECKs are gone,
--   -- kind is still there). <apply time> = the time in the APPLY RECORD
--   -- (UTC). The two DELETEs also match what was written AFTER the apply:
--   -- read the rows first.
--   --   -- the core rooms step 7 made (production: 4 Officers rooms; a club
--   --   -- that had no channel at all also got its Lounge and Board), and
--   --   -- the rows it wrote:
--   --   DELETE FROM public.channels
--   --    WHERE kind IN ('board', 'lounge', 'officers')
--   --      AND created_at >= '<apply time>';
--   --   DELETE FROM public.channel_members cm USING public.channels c
--   --    WHERE c.id = cm.channel_id AND c.org_id IS NOT NULL
--   --      AND cm.created_at >= '<apply time>';
--   --   -- SAE's general, private again, and its exec:
--   --   UPDATE public.channels c SET name = 'general', is_private = true
--   --     FROM public.orgs o
--   --    WHERE o.id = c.org_id AND o.handle = 'sae' AND c.kind = 'lounge';
--   --   UPDATE public.channels c SET name = 'exec'
--   --     FROM public.orgs o
--   --    WHERE o.id = c.org_id AND o.handle = 'sae' AND c.kind = 'officers';
--   --   -- every other club's names:
--   --   UPDATE public.channels SET name = 'general'
--   --    WHERE kind = 'lounge' AND name = 'lounge';
--   --   UPDATE public.channels SET name = 'announcements'
--   --    WHERE kind = 'board' AND name = 'board';
--   DROP INDEX public.channels_event_id_key, public.channels_one_core_room,
--              public.idx_messages_thread_root, public.idx_messages_card_event,
--              public.idx_rsvps_user, public.idx_events_org;
--   ALTER TABLE public.channels DROP COLUMN kind, DROP COLUMN event_id;
--   ALTER TABLE public.messages DROP COLUMN kind, DROP COLUMN thread_root_id,
--                               DROP COLUMN card_event_id;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261001100000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
--
-- COST (contract section 11, gate 3). Local stack, 2026-09-29, Postgres 17.6,
-- EXPLAIN (ANALYZE, BUFFERS) as role authenticated with the member's claims,
-- inside BEGIN ... ROLLBACK after this file's body; rows built with
-- generate_series: 5 clubs of 41 members, per club a Lounge of 200 messages
-- and 2 open event rooms of 200 messages. The reader is a plain member with a
-- Going RSVP (the dearest arm: org_member_role + the channel_members EXISTS).
--   The message read (messages where channel_id = ? order by created_at desc):
--     54 club rooms in the database (the planner hashes the policy's subplan:
--     can_view_org_channel runs once per club room, not per message)
--       event room, limit 200   5.0 ms      event room, limit 50   4.5 ms
--       Lounge, limit 200       4.8 ms      TODAY's function, 24 rooms: 2.6 ms
--     1054 club rooms (the planner asks once per message instead)
--       event room, limit 200  31.6 ms  = 0.16 ms per message
--       event room, limit 50    7.8 ms  (an officer reads at the same cost)
--       Lounge, limit 200      18.0 ms  = 0.09 ms per message
--       TODAY's function, 1024 rooms, general, limit 200: 18.2 ms = 0.09 ms
--     So: at the same number of rooms a Lounge or Board read costs what it
--     costs today (18.0 against 18.2 ms; the 4.8 against 2.6 ms above is 54
--     rooms against 24). An event room read costs about 1.8 times that per
--     message, at most about 32 ms for the route's largest page (200). No
--     new index is needed for it.
--   /api/me/threads for a member of 5 clubs (20 rooms in their list):
--       the list source (own rows + channels)             4.2 ms
--       the peers read (620 co-member rows + users)      86.9 ms
--       the last messages read (limit = rooms x 5)        8.8 ms
--     The peers read is the dear one: channel_members_select_member runs
--     is_channel_member + can_read_channel_roster once per ROW, about 0.13 ms
--     each. That policy is not changed here, but the backfill is what gives
--     every member a row on every public room, so the old inbox now reads
--     (members x rooms) rows per club. Contract 6.4 keeps that read as it is
--     ("clubs are tiny today"); the number to watch is 0.13 ms x members x
--     rooms, e.g. one club of 200 members with 4 rooms in the list = 104 ms.
--   Measured before the repair of Sept 29; that repair changed no function
--   a read calls (can_view_org_channel is as measured).
--   Outputs: handoffs/chat-redesign/wave-1-build/B1a-cost/ (cost-gate3.out,
--   cost-gate3-large.out, cost-baseline.out).
-- ---------------------------------------------------------------------------

begin;

-- ADD COLUMN, ADD CONSTRAINT and ALTER POLICY hold ACCESS EXCLUSIVE on
-- channels, messages and channel_members until COMMIT; CREATE TRIGGER and
-- CREATE INDEX block writes to rsvps, events and org_members. Give up after
-- 5 seconds rather than queue behind a long read.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
-- Catalog reads only (never schema_migrations: the local database has the
-- 20260927 objects without their rows).
do $$
declare
  -- The three policy texts of LIVE STATE, copied from pg_policies (asis 2.2,
  -- 2.4; production = local, asis 11.2).
  was_org constant text := $w$((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM channels c
  WHERE ((c.id = messages.channel_id) AND (c.org_id IS NOT NULL) AND can_view_org_channel(c.id, auth.uid())))) AND has_recorded_consent() AND can_publish_now())$w$;
  was_dm  constant text := $w$((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM (channel_members cm
     JOIN channels c ON ((c.id = cm.channel_id)))
  WHERE ((cm.channel_id = messages.channel_id) AND (cm.user_id = auth.uid()) AND (c.org_id IS NULL)))) AND (NOT (EXISTS ( SELECT 1
   FROM (channel_members peer
     JOIN blocks b ON ((((b.blocker_id = auth.uid()) AND (b.blocked_id = peer.user_id)) OR ((b.blocker_id = peer.user_id) AND (b.blocked_id = auth.uid())))))
  WHERE ((peer.channel_id = messages.channel_id) AND (peer.user_id <> auth.uid()))))) AND has_recorded_consent() AND can_publish_now())$w$;
  was_del constant text := $w$((auth.uid() = user_id) AND (accepted_at IS NULL))$w$;
  fp  text;
  got text;
  bad text;
  n   bigint;
  sae uuid;
begin
  -- A second run on a database that already has this file would stop at
  -- check a with "can_view_org_channel drifted", which points the wrong way.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'channels'
                and column_name = 'kind') then
    raise exception 'chat-rooms: already applied (channels.kind exists). Nothing to do; run scripts/sql/chat-v2-after-deploy.sql';
  end if;

  -- a. The two functions this file leans on, by fingerprint
  --    (md5(pg_get_functiondef), not md5(prosrc)).
  select md5(pg_get_functiondef(p.oid)) into fp from pg_proc p
   where p.oid = to_regprocedure('public.can_view_org_channel(uuid,uuid)');
  if fp is distinct from '269c1185295552f74930f1acffd7c170' then
    raise exception 'chat-rooms: can_view_org_channel drifted (md5 %); re-read it first',
      coalesce(fp, '(missing)');
  end if;
  select md5(pg_get_functiondef(p.oid)) into fp from pg_proc p
   where p.oid = to_regprocedure('public.org_members_drop_club_access()');
  if fp is distinct from '0e7baa973042be8ca0decb7df1ca6407' then
    raise exception 'chat-rooms: org_members_drop_club_access drifted (md5 %); re-read it first',
      coalesce(fp, '(missing)');
  end if;

  -- b. The three policies this file alters, by exact text, and nothing that
  --    would OR around them.
  select with_check into got from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_insert_org_member' and cmd = 'INSERT';
  if got is distinct from was_org then
    raise exception 'chat-rooms: messages_insert_org_member is not the one this file was written against: %',
      coalesce(got, '(missing)');
  end if;
  select with_check into got from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_insert_member' and cmd = 'INSERT';
  if got is distinct from was_dm then
    raise exception 'chat-rooms: messages_insert_member is not the one this file was written against: %',
      coalesce(got, '(missing)');
  end if;
  select qual into got from pg_policies
   where schemaname = 'public' and tablename = 'channel_members'
     and policyname = 'channel_members_delete_own_pending' and cmd = 'DELETE';
  if got is distinct from was_del then
    raise exception 'chat-rooms: channel_members_delete_own_pending is not the one this file was written against: %',
      coalesce(got, '(missing)');
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and cmd in ('INSERT', 'ALL') and permissive = 'PERMISSIVE'
     and policyname not in ('messages_insert_member', 'messages_insert_org_member');
  if bad is not null then
    raise exception 'chat-rooms: another permissive INSERT policy on messages would OR around the Board rule: %', bad;
  end if;
  select string_agg(policyname, ', ') into bad from pg_policies
   where schemaname = 'public' and tablename = 'channel_members'
     and cmd in ('DELETE', 'ALL') and permissive = 'PERMISSIVE'
     and policyname <> 'channel_members_delete_own_pending';
  if bad is not null then
    raise exception 'chat-rooms: another permissive DELETE policy on channel_members: %', bad;
  end if;
  if exists (select 1 from pg_class
              where oid in ('public.messages'::regclass, 'public.channels'::regclass,
                            'public.channel_members'::regclass)
                and not relrowsecurity) then
    raise exception 'chat-rooms: row level security is off on messages, channels or channel_members';
  end if;
  -- The grants POST-CHECK g reads again at the end, read here first so a
  -- difference stops the file before any lock is taken: a student cannot
  -- UPDATE a message or INSERT a channel or a subscription row.
  if has_table_privilege('authenticated', 'public.messages', 'UPDATE')
     or has_table_privilege('authenticated', 'public.channels', 'INSERT')
     or has_table_privilege('authenticated', 'public.channels', 'UPDATE')
     or has_table_privilege('authenticated', 'public.channel_members', 'INSERT')
     or has_table_privilege('anon', 'public.messages', 'SELECT') then
    raise exception 'chat-rooms: grants on messages, channels or channel_members are not the ones this file was written against; re-read them first';
  end if;

  -- c. Every name this file adds is free.
  select string_agg(table_name || '.' || column_name, ', ') into bad
    from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'channels' and column_name in ('kind', 'event_id'))
       or (table_name = 'messages'
           and column_name in ('kind', 'thread_root_id', 'card_event_id')));
  if bad is not null then
    raise exception 'chat-rooms: a column this file adds already exists: %', bad;
  end if;
  select string_agg(conname, ', ') into bad from pg_constraint
   where conrelid in ('public.channels'::regclass, 'public.messages'::regclass)
     and conname in ('channels_kind_check', 'channels_kind_by_type',
                     'channels_org_channel_has_org', 'channels_event_shape',
                     'channels_open_rooms_public', 'channels_closed_rooms_private',
                     'channels_event_id_fkey',
                     'messages_kind_check', 'messages_card_event_shape',
                     'messages_thread_root_not_self',
                     'messages_thread_root_id_fkey', 'messages_card_event_id_fkey');
  if bad is not null then
    raise exception 'chat-rooms: a constraint name this file adds is taken: %', bad;
  end if;
  select string_agg(c.relname, ', ') into bad from pg_class c
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('channels_event_id_key', 'channels_one_core_room',
                       'idx_messages_thread_root', 'idx_messages_card_event',
                       'idx_rsvps_user', 'idx_events_org');
  if bad is not null then
    raise exception 'chat-rooms: an index name this file adds is taken: %', bad;
  end if;
  select string_agg(p.proname, ', ') into bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('chat_channels_fill_kind', 'chat_channels_subscribe',
                       'chat_org_members_rooms', 'chat_rsvps_room',
                       'chat_events_room', 'chat_repair_club',
                       'can_post_org_channel');
  if bad is not null then
    raise exception 'chat-rooms: a function name this file adds is taken: %', bad;
  end if;
  select string_agg(t.tgname, ', ') into bad from pg_trigger t
   where not t.tgisinternal
     and t.tgrelid in ('public.channels'::regclass, 'public.org_members'::regclass,
                       'public.rsvps'::regclass, 'public.events'::regclass)
     and t.tgname in ('chat_channels_fill_kind', 'chat_channels_subscribe',
                      'chat_org_members_rooms', 'chat_rsvps_room', 'chat_events_room');
  if bad is not null then
    raise exception 'chat-rooms: a trigger name this file adds is taken: %', bad;
  end if;
  -- The trigger chains were traced against this exact set (LIVE STATE): none
  -- on channels, channel_members, rsvps and events, four on org_members.
  select string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ', ') into bad
    from pg_trigger t
   where not t.tgisinternal
     and t.tgrelid in ('public.channels'::regclass, 'public.channel_members'::regclass,
                       'public.rsvps'::regclass, 'public.events'::regclass,
                       'public.org_members'::regclass)
     and t.tgname not in ('org_members_clear_removal_on_join',
                          'org_members_drop_club_access',
                          'org_members_imply_follow',
                          'org_members_unfollow_on_leave');
  if bad is not null then
    raise exception 'chat-rooms: a trigger this file was not written against: %', bad;
  end if;
  select count(*) into n from pg_trigger t
   where not t.tgisinternal and t.tgrelid = 'public.org_members'::regclass;
  if n <> 4 then
    raise exception 'chat-rooms: org_members has % triggers, not the 4 this file was written against', n;
  end if;

  -- d. The data has the shape the backfill was written for.
  select count(*) into n from public.channels where type = 'org_subchannel';
  if n > 0 then
    raise exception 'chat-rooms: % org_subchannel rows; this file knows none', n;
  end if;
  select count(*) into n from public.channels
   where type = 'org_channel' and org_id is null;
  if n > 0 then
    raise exception 'chat-rooms: % club channels without a club', n;
  end if;
  select count(*) into n from public.channels
   where type in ('dm', 'group') and org_id is not null;
  if n > 0 then
    raise exception 'chat-rooms: % dm/group channels carry a club id', n;
  end if;
  select string_agg(o.handle || '/' || c.name, ', ') into bad
    from public.channels c
    join public.orgs o on o.id = c.org_id
   where c.type = 'org_channel'
     and lower(btrim(c.name)) in ('board', 'lounge', 'officers');
  if bad is not null then
    raise exception 'chat-rooms: a club channel is already named board, lounge or officers: %', bad;
  end if;
  select string_agg(o.handle || '/' || d.name, ', ') into bad
    from (select org_id, name from public.channels
           where type = 'org_channel' and name in ('general', 'announcements')
           group by org_id, name
          having count(*) > 1) d
    join public.orgs o on o.id = d.org_id;
  if bad is not null then
    raise exception 'chat-rooms: a club has two channels with the same name: %', bad;
  end if;
  -- Step 7 deletes nothing (contract 3.7), and chat_repair_club removes a
  -- club-room row held by someone who is not a member of the club: none may
  -- be there. (Event rooms do not exist yet, so its other delete has nothing
  -- to find.)
  select count(*) into n
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
   where c.org_id is not null
     and not exists (select 1 from public.org_members m
                      where m.org_id = c.org_id and m.user_id = cm.user_id);
  if n > 0 then
    raise exception 'chat-rooms: % club-room rows are held by people who are not members of the club; step 7 would delete them. Stop and ask Franky', n;
  end if;

  -- e. SAE by hand (step 2.1). Franky's call c (its private general becomes
  --    the public Lounge) was made on the fact that SAE has ONE member. The
  --    ids of its general and exec are kept for the POST-CHECK. No handle
  --    constant: the same file runs locally and on production.
  select id into sae from public.orgs where handle = 'sae';
  perform set_config('chat_rooms.sae_general', '', true);
  perform set_config('chat_rooms.sae_exec', '', true);
  if sae is not null then
    select count(*) into n from public.org_members where org_id = sae;
    if n > 1 then
      raise exception 'chat-rooms: SAE has % members, not 1; opening its general as the Lounge was decided for 1. Stop and ask Franky', n;
    end if;
    select count(*) into n from public.channels
     where org_id = sae and type = 'org_channel' and name = 'exec';
    if n > 1 then
      raise exception 'chat-rooms: SAE has % channels named exec', n;
    end if;
    -- Contract 3.9: SAE's Lounge IS the row that was general and its
    -- Officers IS the row that was exec. Without one of them (the old PATCH
    -- route renames any channel) step 2.1 would skip it and step 7 would
    -- make an empty room in its place.
    if not exists (select 1 from public.channels
                    where org_id = sae and type = 'org_channel' and name = 'general')
       or not exists (select 1 from public.channels
                       where org_id = sae and type = 'org_channel' and name = 'exec') then
      raise exception 'chat-rooms: SAE has no channel named general, or none named exec; step 2.1 was written for both. Re-read it first';
    end if;
    if exists (select 1 from public.channels
                where org_id = sae and type = 'org_channel'
                  and ((name = 'announcements' and is_private)
                    or (name = 'exec' and not is_private))) then
      raise exception 'chat-rooms: SAE''s announcements is private or its exec is public; a Board is public and Officers is private. Re-read it first';
    end if;
    perform set_config('chat_rooms.sae_general', coalesce((
      select c.id::text from public.channels c
       where c.org_id = sae and c.type = 'org_channel' and c.name = 'general'), ''), true);
    perform set_config('chat_rooms.sae_exec', coalesce((
      select c.id::text from public.channels c
       where c.org_id = sae and c.type = 'org_channel' and c.name = 'exec'), ''), true);
  end if;

  -- f. Nobody but an owner or admin lands in an Officers room: the private
  --    channel step 2.4 picks for each club (SAE: its exec, step 2.1) has no
  --    allow-list row for anyone else.
  select string_agg(o.handle || '/' || c.name, ', ') into bad
    from (select x.id
            from public.channels x
           where x.org_id = sae and x.type = 'org_channel' and x.name = 'exec'
          union all
          select p.id
            from (select distinct on (c2.org_id) c2.id
                    from public.channels c2
                   where c2.type = 'org_channel' and c2.is_private
                     and not (coalesce(c2.org_id = sae, false)
                              and (c2.name in ('general', 'announcements', 'exec', 'events')
                                   or exists (select 1 from public.channels e
                                               where e.org_id = sae
                                                 and e.type = 'org_channel'
                                                 and e.name = 'exec')))
                   order by c2.org_id, c2.position, c2.created_at, c2.id) p) pick
    join public.channels c on c.id = pick.id
    join public.orgs o on o.id = c.org_id
   where exists (select 1 from public.org_channel_members ocm
                  where ocm.channel_id = c.id
                    and not exists (select 1 from public.org_members m
                                     where m.org_id = c.org_id
                                       and m.user_id = ocm.user_id
                                       and m.role in ('owner', 'admin')));
  if bad is not null then
    raise exception 'chat-rooms: a channel that would become Officers lets in someone who is not an owner or admin: %', bad;
  end if;

  -- g. No photos in club rooms in v1: none may be there already.
  select count(*) into n
    from public.messages m
    join public.channels c on c.id = m.channel_id
   where c.org_id is not null and m.media_url is not null;
  if n > 0 then
    raise exception 'chat-rooms: % club-room messages carry media_url. Stop and ask Franky', n;
  end if;

  -- h. Row guards (production today: 12 club channels, 5 clubs).
  select count(*) into n from public.channels where type = 'org_channel';
  if n > 60 then
    raise exception 'chat-rooms: % club channels, far more than this file was written for (60)', n;
  end if;
  select count(*) into n from public.orgs;
  if n > 40 then
    raise exception 'chat-rooms: % clubs, far more than this file was written for (40)', n;
  end if;
end $$;

-- 1. New columns and indexes (contract 3.1) -----------------------------------
-- messages.kind has a constant default: no table rewrite (every existing row
-- reads 'text'). The new foreign keys start all-NULL, so their validation
-- scans find nothing to check.
alter table public.channels
  add column kind text,
  add column event_id uuid references public.events(id) on delete cascade;
alter table public.messages
  add column kind text not null default 'text',
  add column thread_root_id uuid references public.messages(id) on delete cascade,
  add column card_event_id uuid references public.events(id) on delete set null;

create unique index channels_event_id_key
  on public.channels (event_id) where event_id is not null;
create unique index channels_one_core_room
  on public.channels (org_id, kind) where kind in ('board', 'lounge', 'officers');
create index idx_messages_thread_root
  on public.messages (thread_root_id, created_at) where thread_root_id is not null;
create index idx_messages_card_event
  on public.messages (card_event_id) where card_event_id is not null;
create index idx_rsvps_user on public.rsvps (user_id);   -- none leads on user_id today
create index idx_events_org on public.events (org_id);   -- none on org_id today

comment on column public.channels.kind is
  'What a club room is: board (officers post, members reply), lounge, officers, event (the chat of one event, event_id set), room (an extra room). NULL for dm and group channels. Filled by chat_channels_fill_kind when old code sends none.';
comment on column public.channels.event_id is
  'kind = event only: the event this chat belongs to. One room per event (channels_event_id_key). Cancelling the event deletes the room and its messages.';
comment on column public.messages.kind is
  'text, poll or event_card. Always text until the cards of wave 2; a client insert can only ever be text (both INSERT policies).';
comment on column public.messages.thread_root_id is
  'A reply under a Board post: the id of that post. ON DELETE CASCADE, so the replies go with their post (parent_message_id is SET NULL and keeps its meaning: the message being quoted).';
comment on column public.messages.card_event_id is
  'kind = event_card only: the event the card shows.';

-- 2. Backfill of kind (contract 3.2) -------------------------------------------
-- Before the constraints, and before the triggers exist. Each step only
-- touches club channels whose kind is still NULL. No message is moved or
-- deleted and no room is created here (that is step 7).

-- 2.1 SAE by hand (skipped when there is no club with that handle). Its
--     general becomes the Lounge AND public: Franky's call c.
update public.channels c
   set kind = 'lounge', is_private = false
  from public.orgs o
 where o.id = c.org_id and o.handle = 'sae'
   and c.type = 'org_channel' and c.kind is null and c.name = 'general';
update public.channels c
   set kind = 'board'
  from public.orgs o
 where o.id = c.org_id and o.handle = 'sae'
   and c.type = 'org_channel' and c.kind is null and c.name = 'announcements';
update public.channels c
   set kind = 'officers'
  from public.orgs o
 where o.id = c.org_id and o.handle = 'sae'
   and c.type = 'org_channel' and c.kind is null and c.name = 'exec';
update public.channels c
   set kind = 'room'
  from public.orgs o
 where o.id = c.org_id and o.handle = 'sae'
   and c.type = 'org_channel' and c.kind is null and c.name = 'events';

-- 2.2 Any club: its public announcements is the Board, if it has none yet.
update public.channels c
   set kind = 'board'
 where c.type = 'org_channel' and c.kind is null
   and c.is_private = false and c.name = 'announcements'
   and not exists (select 1 from public.channels b
                    where b.org_id = c.org_id and b.kind = 'board');

-- 2.3 Any club: its public general is the Lounge, if it has none yet.
update public.channels c
   set kind = 'lounge'
 where c.type = 'org_channel' and c.kind is null
   and c.is_private = false and c.name = 'general'
   and not exists (select 1 from public.channels l
                    where l.org_id = c.org_id and l.kind = 'lounge');

-- 2.4 Any club with no Officers room: its first private channel.
update public.channels c
   set kind = 'officers'
  from (select distinct on (p.org_id) p.id
          from public.channels p
         where p.type = 'org_channel' and p.kind is null and p.is_private
           and not exists (select 1 from public.channels k
                            where k.org_id = p.org_id and k.kind = 'officers')
         order by p.org_id, p.position, p.created_at, p.id) pick
 where c.id = pick.id;

-- 2.5 Everything left is an extra room.
update public.channels
   set kind = 'room'
 where type = 'org_channel' and kind is null;

-- 2.6 The three core rooms are named after their kind.
update public.channels
   set name = kind
 where kind in ('board', 'lounge', 'officers') and name is distinct from kind;

-- The PRE-FLIGHT promised it (0.f); read it again from what the backfill
-- really picked.
do $$
declare bad text;
begin
  select string_agg(o.handle, ', ') into bad
    from public.channels c
    join public.orgs o on o.id = c.org_id
   where c.kind = 'officers'
     and exists (select 1 from public.org_channel_members ocm
                  where ocm.channel_id = c.id
                    and not exists (select 1 from public.org_members m
                                     where m.org_id = c.org_id
                                       and m.user_id = ocm.user_id
                                       and m.role in ('owner', 'admin')));
  if bad is not null then
    raise exception 'chat-rooms: the Officers room of % lets in someone who is not an owner or admin', bad;
  end if;
end $$;

-- 3. Constraints (contract 3.3) -------------------------------------------------
-- Event rooms and Officers are private on purpose: every old code path that
-- does not know kind then treats them as private and fails closed.
alter table public.channels
  add constraint channels_kind_check
    check (kind is null or kind in ('board', 'lounge', 'officers', 'event', 'room')),
  add constraint channels_kind_by_type
    check ((type = 'org_channel') = (kind is not null)),
  add constraint channels_org_channel_has_org
    check (type <> 'org_channel' or org_id is not null),
  add constraint channels_event_shape
    check (coalesce(kind = 'event', false) = (event_id is not null)),
  add constraint channels_open_rooms_public
    check (kind is null or kind not in ('board', 'lounge') or is_private = false),
  add constraint channels_closed_rooms_private
    check (kind is null or kind not in ('officers', 'event') or is_private = true);
alter table public.messages
  add constraint messages_kind_check
    check (kind in ('text', 'poll', 'event_card')),
  add constraint messages_card_event_shape
    check (card_event_id is null or kind = 'event_card'),
  add constraint messages_thread_root_not_self
    check (thread_root_id is distinct from id);

-- 4. Triggers and the repair function (contract 3.4) ---------------------------
-- THE INVARIANT: every current member of a club holds a row on every public
-- room of that club (board, lounge, public room), and on each event room
-- they may enter.
-- All of them: plpgsql, SECURITY DEFINER, search_path '', tables read
-- directly (never the guarded helpers, which answer about auth.uid() only).
-- Every trigger finds its club and room with a join; no row found = return,
-- never raise (an event, club or user may already be gone when a cascade
-- fires it). Every row they write is (channel_id, user_id, 'member',
-- accepted_at now(), last_read_at now()) ON CONFLICT DO NOTHING:
-- last_read_at = now() so a room does not start as "unread".
-- The four AFTER functions wrap their body in EXCEPTION WHEN OTHERS: a chat
-- bug never blocks an RSVP, an event, a join or a leave. chat_repair_club
-- repairs what a failed trigger missed; the warning is in the database log.

-- 4.1 BEFORE INSERT on channels: old code sends no kind. Not wrapped, never
--     raises, no room cap.
--     As contract 3.4 words it, a general / announcements that becomes the
--     Lounge / Board is made PUBLIC even when old code sent it as private
--     (the backfill, steps 2.2 and 2.3, only takes public ones). That can
--     only happen while a club has no Lounge or Board: inside the apply
--     window, or after the old desktop modal deleted one.
create function public.chat_channels_fill_kind()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.type is distinct from 'org_channel' then
    new.kind := null;
    return new;
  end if;
  if new.kind is not null then
    return new;
  end if;
  if new.name = 'general'
     and not exists (select 1 from public.channels c
                      where c.org_id = new.org_id and c.kind = 'lounge') then
    new.kind := 'lounge';
    new.name := 'lounge';
    new.is_private := false;
  elsif new.name = 'announcements'
     and not exists (select 1 from public.channels c
                      where c.org_id = new.org_id and c.kind = 'board') then
    new.kind := 'board';
    new.name := 'board';
    new.is_private := false;
  else
    new.kind := 'room';
  end if;
  return new;
end $$;

comment on function public.chat_channels_fill_kind() is
  'BEFORE INSERT on channels. A dm or group never has a kind. A club channel sent without one (old code): general -> the Lounge and announcements -> the Board when the club has none yet (renamed, made public), anything else -> room. Never raises.';

-- 4.2 AFTER INSERT OR UPDATE OF is_private on channels.
create function public.chat_channels_subscribe()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  begin
    if new.type is distinct from 'org_channel'
       or new.kind is null or new.org_id is null then
      return null;
    end if;

    if tg_op = 'INSERT' then
      if new.kind = 'event' then
        -- The officers, and the members who said Going or Maybe.
        insert into public.channel_members
               (channel_id, user_id, role, accepted_at, last_read_at)
        select new.id, m.user_id, 'member', now(), now()
          from public.org_members m
         where m.org_id = new.org_id
           and (m.role in ('owner', 'admin')
                or exists (select 1 from public.rsvps r
                            where r.event_id = new.event_id
                              and r.user_id = m.user_id
                              and r.status in ('going', 'maybe')))
        on conflict (channel_id, user_id) do nothing;
      elsif new.kind in ('board', 'lounge', 'room') and new.is_private = false then
        insert into public.channel_members
               (channel_id, user_id, role, accepted_at, last_read_at)
        select new.id, m.user_id, 'member', now(), now()
          from public.org_members m
         where m.org_id = new.org_id
        on conflict (channel_id, user_id) do nothing;
      end if;
      -- An Officers room or a private room: nothing.

    elsif new.kind = 'room' and new.is_private is distinct from old.is_private then
      if new.is_private = false then
        -- A room turned public: everyone in the club is in it.
        insert into public.channel_members
               (channel_id, user_id, role, accepted_at, last_read_at)
        select new.id, m.user_id, 'member', now(), now()
          from public.org_members m
         where m.org_id = new.org_id
        on conflict (channel_id, user_id) do nothing;
      else
        -- A room turned private: its rows go (the purge the channel route
        -- did by hand, channels/[channelId]/route.ts:143-151). Owners and
        -- admins still pass can_view_org_channel; everyone else is re-added
        -- through the allow-list.
        delete from public.channel_members cm where cm.channel_id = new.id;
      end if;
    end if;
  exception when others then
    raise warning 'chat-rooms: % failed: %', tg_name, sqlerrm;
  end;
  return null;                                   -- ignored: AFTER ROW trigger
end $$;

comment on function public.chat_channels_subscribe() is
  'AFTER INSERT OR UPDATE OF is_private on channels. A public club room (new, or a room turned public) gets a row for every member; a room turned private loses its rows; a new event room gets the officers and the members holding a going/maybe RSVP. Swallows its own errors (chat_repair_club repairs).';

-- 4.3 AFTER INSERT OR UPDATE OF role on org_members.
--     TimeZone is pinned: "ends_at + interval '7 days'" is day arithmetic in
--     the session's time zone, and a PostgREST client chooses that zone
--     (Prefer: timezone=). In UTC 7 days are always 168 hours, which is what
--     the routes compute (src/lib/chat/room-state.ts).
create function public.chat_org_members_rooms()
returns trigger
language plpgsql
security definer
set search_path to ''
set timezone to 'UTC'
as $$
declare
  was_officer boolean := false;
  is_officer  boolean;
begin
  begin
    is_officer := coalesce(new.role in ('owner', 'admin'), false);

    if tg_op = 'INSERT' then
      -- A new member: every public room of the club ...
      insert into public.channel_members
             (channel_id, user_id, role, accepted_at, last_read_at)
      select c.id, new.user_id, 'member', now(), now()
        from public.channels c
       where c.org_id = new.org_id
         and c.type = 'org_channel'
         and c.kind in ('board', 'lounge', 'room')
         and c.is_private = false
      on conflict (channel_id, user_id) do nothing;
      -- ... and each open event room they hold a going/maybe RSVP for.
      insert into public.channel_members
             (channel_id, user_id, role, accepted_at, last_read_at)
      select c.id, new.user_id, 'member', now(), now()
        from public.channels c
        join public.events e on e.id = c.event_id
       where c.org_id = new.org_id
         and c.kind = 'event'
         and e.ends_at + interval '7 days' > now()
         and exists (select 1 from public.rsvps r
                      where r.event_id = e.id
                        and r.user_id = new.user_id
                        and r.status in ('going', 'maybe'))
      on conflict (channel_id, user_id) do nothing;
    else
      was_officer := coalesce(old.role in ('owner', 'admin'), false);
    end if;

    if is_officer and not was_officer then
      -- Becomes an owner or admin: every open event room of the club.
      insert into public.channel_members
             (channel_id, user_id, role, accepted_at, last_read_at)
      select c.id, new.user_id, 'member', now(), now()
        from public.channels c
        join public.events e on e.id = c.event_id
       where c.org_id = new.org_id
         and c.kind = 'event'
         and e.ends_at + interval '7 days' > now()
      on conflict (channel_id, user_id) do nothing;
    elsif was_officer and not is_officer then
      -- Drops below admin: out of the event rooms they hold no RSVP for.
      delete from public.channel_members cm
       using public.channels c
       where c.id = cm.channel_id
         and c.org_id = new.org_id
         and c.kind = 'event'
         and cm.user_id = new.user_id
         and not exists (select 1 from public.rsvps r
                          where r.event_id = c.event_id
                            and r.user_id = new.user_id
                            and r.status in ('going', 'maybe'));
    end if;
  exception when others then
    raise warning 'chat-rooms: % failed: %', tg_name, sqlerrm;
  end;
  return null;                                   -- ignored: AFTER ROW trigger
end $$;

comment on function public.chat_org_members_rooms() is
  'AFTER INSERT OR UPDATE OF role on org_members. A new member gets a row on every public room of the club and on each open event room (event not past ends_at + 7 days) they hold a going/maybe RSVP for; a new owner/admin gets every open event room; someone dropping below admin leaves the event rooms they hold no RSVP for. Leaving the club is org_members_drop_club_access. Swallows its own errors.';

-- 4.4 AFTER INSERT OR UPDATE OR DELETE on rsvps. Covers direct PostgREST
--     writes (rsvps_insert_own / rsvps_update_own / rsvps_delete_own) and the
--     RSVP deletes issued by org_members_drop_club_access.
--     ANY update, not only "OF status" (S69 orchestrator's decision after the
--     review of Sept 29; contract 3.4 names the narrower list): a student
--     holds UPDATE on rsvps.event_id, and rsvps_update_own lets them move
--     their own RSVP to another event. With "OF status" that write fired
--     nothing and the person kept the old event room without an RSVP.
--     An update is "OLD leaves, NEW arrives":
--       OLD (UPDATE, DELETE): the (event, person) row goes, unless the person
--         is an owner or admin of the club or still holds a going/maybe RSVP
--         for that event (read AFTER the write, so a change of status only,
--         going -> maybe, keeps the row).
--       NEW (INSERT, UPDATE): going/maybe by a member of the event's club
--         adds the row; 'no' removes it under the same two exceptions.
--     Each part finds its club and room with a join: no row found = nothing.
create function public.chat_rsvps_room()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_room uuid;
  v_org  uuid;
begin
  begin
    -- OLD leaves.
    if tg_op in ('UPDATE', 'DELETE') then
      delete from public.channel_members cm
       using public.channels c
       where c.id = cm.channel_id
         and c.kind = 'event'
         and c.event_id = old.event_id
         and cm.user_id = old.user_id
         and not exists (select 1 from public.org_members m
                          where m.org_id = c.org_id
                            and m.user_id = old.user_id
                            and m.role in ('owner', 'admin'))
         and not exists (select 1 from public.rsvps r
                          where r.event_id = old.event_id
                            and r.user_id = old.user_id
                            and r.status in ('going', 'maybe'));
    end if;

    -- NEW arrives.
    if tg_op in ('INSERT', 'UPDATE') then
      if new.status in ('going', 'maybe') then
        select c.id, c.org_id into v_room, v_org
          from public.events e
          join public.channels c on c.event_id = e.id and c.kind = 'event'
         where e.id = new.event_id
           and e.org_id is not null;
        -- Members only (v1): an RSVP by a non-member writes no row.
        if v_room is not null
           and exists (select 1 from public.org_members m
                        where m.org_id = v_org and m.user_id = new.user_id) then
          insert into public.channel_members
                 (channel_id, user_id, role, accepted_at, last_read_at)
          values (v_room, new.user_id, 'member', now(), now())
          on conflict (channel_id, user_id) do nothing;
        end if;
      else
        -- 'no'. Officers keep their row.
        delete from public.channel_members cm
         using public.channels c
         where c.id = cm.channel_id
           and c.kind = 'event'
           and c.event_id = new.event_id
           and cm.user_id = new.user_id
           and not exists (select 1 from public.org_members m
                            where m.org_id = c.org_id
                              and m.user_id = new.user_id
                              and m.role in ('owner', 'admin'))
           and not exists (select 1 from public.rsvps r
                            where r.event_id = new.event_id
                              and r.user_id = new.user_id
                              and r.status in ('going', 'maybe'));
      end if;
    end if;
  exception when others then
    raise warning 'chat-rooms: % failed: %', tg_name, sqlerrm;
  end;
  return null;                                   -- ignored: AFTER ROW trigger
end $$;

comment on function public.chat_rsvps_room() is
  'AFTER INSERT OR UPDATE OR DELETE on rsvps (any update: an RSVP moved to another event leaves the old room). going/maybe by a member of the event''s club adds their row on the event room; no, a deleted RSVP or an RSVP moved away removes it, unless they are an owner or admin or still hold a going/maybe RSVP for that event. A non-member''s RSVP writes nothing. Swallows its own errors: what that costs is a member staying in an event chat after changing their RSVP (chat_repair_club removes such a row).';

-- 4.5 AFTER INSERT OR UPDATE OF title on events. Cancelling an event deletes
--     it, and the room goes with it (channels.event_id ON DELETE CASCADE).
create function public.chat_events_room()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  begin
    if tg_op = 'INSERT' then
      if new.org_id is not null
         and exists (select 1 from public.orgs o where o.id = new.org_id) then
        insert into public.channels
               (org_id, type, kind, event_id, name, is_private, position)
        values (new.org_id, 'org_channel', 'event', new.id,
                left(new.title, 80), true, 1000)
        on conflict do nothing;
      end if;
    elsif new.title is distinct from old.title then
      update public.channels c
         set name = left(new.title, 80)
       where c.event_id = new.id and c.kind = 'event';
    end if;
  exception when others then
    raise warning 'chat-rooms: % failed: %', tg_name, sqlerrm;
  end;
  return null;                                   -- ignored: AFTER ROW trigger
end $$;

comment on function public.chat_events_room() is
  'AFTER INSERT OR UPDATE OF title on events. A club event gets its chat: a private club channel of kind event named after it (first 80 characters), position 1000; chat_channels_subscribe then adds the officers and the RSVP holders. A new title renames the room. Swallows its own errors.';

create trigger chat_channels_fill_kind
  before insert on public.channels
  for each row execute function public.chat_channels_fill_kind();
create trigger chat_channels_subscribe
  after insert or update of is_private on public.channels
  for each row execute function public.chat_channels_subscribe();
create trigger chat_org_members_rooms
  after insert or update of role on public.org_members
  for each row execute function public.chat_org_members_rooms();
create trigger chat_rsvps_room
  after insert or update or delete on public.rsvps
  for each row execute function public.chat_rsvps_room();
create trigger chat_events_room
  after insert or update of title on public.events
  for each row execute function public.chat_events_room();

-- 4.6 The repair function: makes one club whole, any number of times. It is
--     the backfill (step 7), what club creation calls (contract section 8)
--     and the repair after the apply window (contract 3.10).
--     VOLATILE (PostgREST runs a STABLE function read-only). Refuses the
--     client roles from the inside, the rate_limit_hit idiom; EXECUTE stays
--     granted (standing rule, 20260922090000). TimeZone pinned as in 4.3.
--     Steps 1 to 4 are contract 3.4. Steps 5 and 6 were added by the S69
--     orchestrator's decision after the review of Sept 29: a row that should
--     NOT exist is part of "repair" too (what a swallowed DELETE or an RSVP
--     moved before this file leaves behind), and a club-room row is never a
--     pending request.
--     What it cannot see coming: two writes at the same moment (a join and a
--     new room, a join and an RSVP) can each miss the other's row, with no
--     warning in the log. The after-deploy check lists it and this function
--     repairs it.
create function public.chat_repair_club(p_org uuid)
returns void
language plpgsql
volatile
security definer
set search_path to ''
set timezone to 'UTC'
as $$
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_org is null
     or not exists (select 1 from public.orgs o where o.id = p_org) then
    return;
  end if;

  -- 1. The three core rooms.
  insert into public.channels (org_id, type, kind, name, is_private, position)
  select p_org, 'org_channel', k.kind, k.kind, k.is_private, k.position
    from (values ('lounge',   false, 0),
                 ('board',    false, 1),
                 ('officers', true,  2)) as k (kind, is_private, position)
   where not exists (select 1 from public.channels c
                      where c.org_id = p_org and c.kind = k.kind)
  on conflict do nothing;

  -- 2. The room of every event still inside its window (the same row
  --    chat_events_room writes).
  insert into public.channels
         (org_id, type, kind, event_id, name, is_private, position)
  select e.org_id, 'org_channel', 'event', e.id, left(e.title, 80), true, 1000
    from public.events e
   where e.org_id = p_org
     and e.ends_at + interval '7 days' > now()
     and not exists (select 1 from public.channels c where c.event_id = e.id)
  on conflict do nothing;

  -- 3. Every missing (member, public room) row.
  insert into public.channel_members
         (channel_id, user_id, role, accepted_at, last_read_at)
  select c.id, m.user_id, 'member', now(), now()
    from public.channels c
    join public.org_members m on m.org_id = c.org_id
   where c.org_id = p_org
     and c.type = 'org_channel'
     and c.kind in ('board', 'lounge', 'room')
     and c.is_private = false
  on conflict (channel_id, user_id) do nothing;

  -- 4. Every missing (owner/admin, open event room) and (member with a
  --    going/maybe RSVP, open event room) row.
  insert into public.channel_members
         (channel_id, user_id, role, accepted_at, last_read_at)
  select c.id, m.user_id, 'member', now(), now()
    from public.channels c
    join public.events e on e.id = c.event_id
    join public.org_members m on m.org_id = c.org_id
   where c.org_id = p_org
     and c.kind = 'event'
     and e.ends_at + interval '7 days' > now()
     and (m.role in ('owner', 'admin')
          or exists (select 1 from public.rsvps r
                      where r.event_id = e.id
                        and r.user_id = m.user_id
                        and r.status in ('going', 'maybe')))
  on conflict (channel_id, user_id) do nothing;

  -- 5. Rows that should not exist.
  --    a. On any room of the club: held by someone who is not a member of it.
  delete from public.channel_members cm
   using public.channels c
   where c.id = cm.channel_id
     and c.org_id = p_org
     and c.type = 'org_channel'
     and not exists (select 1 from public.org_members m
                      where m.org_id = c.org_id
                        and m.user_id = cm.user_id);
  --    b. On an event room (open or past its 7 days): held by someone who is
  --       neither an owner or admin of the club nor the holder of a
  --       going/maybe RSVP for that event.
  delete from public.channel_members cm
   using public.channels c
   where c.id = cm.channel_id
     and c.org_id = p_org
     and c.kind = 'event'
     and not exists (select 1 from public.org_members m
                      where m.org_id = c.org_id
                        and m.user_id = cm.user_id
                        and m.role in ('owner', 'admin'))
     and not exists (select 1 from public.rsvps r
                      where r.event_id = c.event_id
                        and r.user_id = cm.user_id
                        and r.status in ('going', 'maybe'));

  -- 6. A club-room row is never a pending request (a member can still set
  --    their own accepted_at to null; the old inbox then hides the room).
  update public.channel_members cm
     set accepted_at = now()
    from public.channels c
   where c.id = cm.channel_id
     and c.org_id = p_org
     and c.type = 'org_channel'
     and cm.accepted_at is null;
end $$;

comment on function public.chat_repair_club(uuid) is
  'Makes one club''s chat whole: the missing Lounge, Board and Officers rooms, the room of every event not past ends_at + 7 days, every missing (member, public room) row and every missing officer / going-or-maybe row on an open event room. Removes the rows that should not exist: a row on a room of the club held by someone who is not a member, and an event-room row of someone who is neither an owner or admin nor the holder of a going/maybe RSVP for that event. Sets accepted_at where a club-room row has none. Safe to run any number of times. Service role only (raises 42501 for anon and authenticated).';

grant execute on function public.chat_repair_club(uuid) to anon, authenticated, service_role;

-- 5. Functions (contract 3.5) ----------------------------------------------------
-- 5.1 can_view_org_channel: the t2b body (20260922120500:270) with ONE new
--     arm, after "not a club member -> false" and before "public -> true".
--     Still sql, STABLE, SECURITY DEFINER, search_path 'public', both role
--     guards. Members-only is guaranteed by the arm before the new one.
--     Every policy and route that calls it picks the change up.
CREATE OR REPLACE FUNCTION public.can_view_org_channel(cid uuid, uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN current_setting('role', true) = 'anon' THEN false
    WHEN current_setting('role', true) = 'authenticated'
         AND uid IS DISTINCT FROM auth.uid() THEN false
    WHEN c.org_id IS NULL THEN false
    WHEN NOT public.is_org_member (c.org_id, uid) THEN false
    WHEN c.kind = 'event' THEN
         public.org_member_role (c.org_id, uid) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.channel_members cm
                  WHERE cm.channel_id = cid AND cm.user_id = uid)
    WHEN c.is_private = false THEN true
    WHEN public.org_member_role (c.org_id, uid) IN ('owner','admin') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.org_channel_members ocm
      WHERE ocm.channel_id = cid AND ocm.user_id = uid
    )
  END
  FROM public.channels c
  WHERE c.id = cid;
$function$;

-- CREATE OR REPLACE keeps the ACL; restate it so the standing rule holds
-- even if someone changed it by hand. Nothing is revoked.
GRANT EXECUTE ON FUNCTION public.can_view_org_channel(uuid, uuid) TO anon, authenticated, service_role;

-- 5.2 can_post_org_channel: may uid write in room cid? root = the Board post
--     being replied to, NULL for a new top-level message.
--       any room                 false unless can_view_org_channel is true
--       board, root NULL         a current owner or admin of the club
--       board, root set          root is a message in THIS room with
--                                thread_root_id NULL and removed_at NULL
--       event, root NULL         while now() < events.ends_at + 7 days
--       lounge, officers, room   true with root NULL
--       everything else          false (a root outside a Board)
--     Returns false, never NULL, for a room that does not exist.
--     TimeZone pinned as in 4.3: the same event room must not be open for
--     one request and closed for another.
create function public.can_post_org_channel(cid uuid, uid uuid, root uuid)
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
      when c.kind in ('lounge', 'officers', 'room') then true
      else false
    end
      from public.channels c
     where c.id = cid), false);
$$;

comment on function public.can_post_org_channel(uuid, uuid, uuid) is
  'May uid write in club room cid (root = the Board post replied to, NULL for a top-level message)? Board: owners and admins post, any member replies under a live top-level post of that Board. Event chat: until 7 days after the event ends. Lounge, Officers, rooms: anyone who can see them. Under the authenticated role it only answers about the caller. False for a room that does not exist.';

grant execute on function public.can_post_org_channel(uuid, uuid, uuid) to anon, authenticated, service_role;

-- 6. Policies (contract 3.6) -----------------------------------------------------
-- ALTER POLICY keeps each policy's name, command and roles (INSERT / DELETE,
-- authenticated). It holds an ACCESS EXCLUSIVE lock on the table until
-- COMMIT. SELECT policies are not touched.
-- After this a direct PostgREST write can only ever be a plain text message,
-- cannot forge a removal, cannot post top-level on a Board unless the sender
-- is an officer, cannot write into a closed event room, cannot attach media
-- in a club room, and cannot delete its own club-room row.
alter policy messages_insert_org_member on public.messages
  with check (
    (auth.uid() = user_id)
    and (kind = 'text') and (card_event_id is null)
    and (media_url is null) and (media_kind is null)   -- no photos in club rooms in v1
    and (removed_at is null) and (removed_by is null) and (removed_reason is null)
    and (exists (select 1 from public.channels c
                  where c.id = messages.channel_id and c.org_id is not null
                    and public.can_post_org_channel(c.id, auth.uid(), messages.thread_root_id)))
    and public.has_recorded_consent() and public.can_publish_now());

-- Today's text (asis 2.2) plus the six plain-message terms right after
-- (auth.uid() = user_id).
alter policy messages_insert_member on public.messages
  with check (
    (auth.uid() = user_id)
    and (kind = 'text') and (card_event_id is null) and (thread_root_id is null)
    and (removed_at is null) and (removed_by is null) and (removed_reason is null)
    and (exists (select 1
                   from public.channel_members cm
                   join public.channels c on c.id = cm.channel_id
                  where cm.channel_id = messages.channel_id
                    and cm.user_id = auth.uid()
                    and c.org_id is null))
    and (not (exists (select 1
                        from public.channel_members peer
                        join public.blocks b
                          on ((b.blocker_id = auth.uid() and b.blocked_id = peer.user_id)
                           or (b.blocker_id = peer.user_id and b.blocked_id = auth.uid()))
                       where peer.channel_id = messages.channel_id
                         and peer.user_id <> auth.uid())))
    and public.has_recorded_consent() and public.can_publish_now());

-- Today's text (asis 2.4) plus: never a club room (the path "set my
-- accepted_at to null, then delete my pending row").
alter policy channel_members_delete_own_pending on public.channel_members
  using (
    (auth.uid() = user_id) and (accepted_at is null)
    and (not (exists (select 1 from public.channels c
                       where c.id = channel_members.channel_id
                         and c.org_id is not null))));

-- 7. Data steps (contract 3.7): after the triggers and functions exist ---------
-- chat_repair_club for every club: the missing core rooms, the event rooms of
-- events inside their window, every missing row. Nothing is deleted: the
-- rows the repair would remove are counted first, and any is a stop.
-- What it did is kept for step 9.3 (NOTICE lines do not come back through
-- the Management API).
do $$
declare
  rooms_before bigint;
  rows_before  bigint;
  rooms_made   bigint;
  rows_made    bigint;
  pending      bigint;
  n            bigint;
begin
  select count(*) into n
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
   where c.org_id is not null
     and (not exists (select 1 from public.org_members m
                       where m.org_id = c.org_id and m.user_id = cm.user_id)
          or (c.kind = 'event'
              and not exists (select 1 from public.org_members m
                               where m.org_id = c.org_id and m.user_id = cm.user_id
                                 and m.role in ('owner', 'admin'))
              and not exists (select 1 from public.rsvps r
                               where r.event_id = c.event_id and r.user_id = cm.user_id
                                 and r.status in ('going', 'maybe'))));
  if n > 0 then
    raise exception 'chat-rooms: the repair would delete % rows; this file deletes nothing. Stop and ask Franky', n;
  end if;
  select count(*) into pending
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
   where c.org_id is not null and cm.accepted_at is null;

  select count(*) into rooms_before from public.channels where org_id is not null;
  select count(*) into rows_before
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
   where c.org_id is not null;

  perform public.chat_repair_club(o.id) from public.orgs o;

  select count(*) - rooms_before into rooms_made
    from public.channels where org_id is not null;
  select count(*) - rows_before into rows_made
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
   where c.org_id is not null;
  if rooms_made > 60 or rows_made > 400 then
    raise exception 'chat-rooms: the repair would create % rooms and % rows, far more than this file was written for (60, 400)',
      rooms_made, rows_made;
  end if;
  perform set_config('chat_rooms.step7',
    format('step 7 created %s rooms and %s rows, deleted 0 rows, set accepted_at on %s rows',
           rooms_made, rows_made, pending), true);
  raise notice 'chat-rooms: %', current_setting('chat_rooms.step7', true);
end $$;

-- 9. POST-CHECK inside the transaction: any miss aborts the whole file -----------
-- 9.1 By reading.
do $$
declare
  -- The intended texts, copied by script from pg_policies after a local
  -- rehearsal (2026-09-29), never typed by hand. An empty constant = the
  -- check prints the three deparsed texts and raises "policy constants are
  -- empty" (how the first rehearsal ran). No real apply runs with one.
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
  want_del constant text := $w$((auth.uid() = user_id) AND (accepted_at IS NULL) AND (NOT (EXISTS ( SELECT 1
   FROM channels c
  WHERE ((c.id = channel_members.channel_id) AND (c.org_id IS NOT NULL))))))$w$;
  -- md5(pg_get_functiondef) of the two functions as this file leaves them,
  -- copied by script from the catalog after a local rehearsal (2026-09-29).
  -- An empty constant = the check prints both and raises "function
  -- fingerprints are empty". No real apply runs with one.
  want_view constant text := '747ee06d2e4c3e8a788129f7530ec0ae';
  want_post constant text := '8d8be860d3f7077b9d6f9238705bdca7';
  got_org  text;
  got_dm   text;
  got_del  text;
  got_view text;
  got_post text;
  bad      text;
  n        bigint;
  sae      uuid;
  v_was    text;
  f        record;
begin
  -- a. Rooms.
  select string_agg(o.handle, ', ') into bad
    from public.orgs o
   where (select count(*) from public.channels c
           where c.org_id = o.id and c.kind = 'board') <> 1
      or (select count(*) from public.channels c
           where c.org_id = o.id and c.kind = 'lounge') <> 1
      or (select count(*) from public.channels c
           where c.org_id = o.id and c.kind = 'officers') <> 1;
  if bad is not null then
    raise exception 'chat-rooms: clubs without exactly one board, one lounge and one officers: %', bad;
  end if;
  select count(*) into n from public.channels
   where type = 'org_channel' and kind is null;
  if n > 0 then
    raise exception 'chat-rooms: % club channels have no kind', n;
  end if;
  select count(*) into n from public.channels
   where type <> 'org_channel' and kind is not null;
  if n > 0 then
    raise exception 'chat-rooms: % dm/group channels have a kind', n;
  end if;

  -- b. The invariant: every member holds a row on every public room of
  --    their clubs.
  select count(*) into n
    from public.org_members m
    join public.channels c
      on c.org_id = m.org_id and c.type = 'org_channel' and c.is_private = false
   where not exists (select 1 from public.channel_members cm
                      where cm.channel_id = c.id and cm.user_id = m.user_id);
  if n > 0 then
    raise exception 'chat-rooms: % (member, public room) pairs have no row', n;
  end if;
  -- Nobody holds a row that should not exist, and no club-room row is a
  -- pending request.
  select count(*) into n
    from public.channel_members cm
    join public.channels c on c.id = cm.channel_id
   where c.org_id is not null
     and (cm.accepted_at is null
          or not exists (select 1 from public.org_members m
                          where m.org_id = c.org_id and m.user_id = cm.user_id)
          or (c.kind = 'event'
              and not exists (select 1 from public.org_members m
                               where m.org_id = c.org_id and m.user_id = cm.user_id
                                 and m.role in ('owner', 'admin'))
              and not exists (select 1 from public.rsvps r
                               where r.event_id = c.event_id and r.user_id = cm.user_id
                                 and r.status in ('going', 'maybe'))));
  if n > 0 then
    raise exception 'chat-rooms: % club-room rows should not exist or are not accepted', n;
  end if;
  -- The PRE-FLIGHT read this before any lock was held (0.g). messages is
  -- locked since step 1, so this second read is final.
  select count(*) into n
    from public.messages m
    join public.channels c on c.id = m.channel_id
   where c.org_id is not null and m.media_url is not null;
  if n > 0 then
    raise exception 'chat-rooms: % club-room messages carry media_url (one was sent during the apply). Stop and ask Franky', n;
  end if;

  -- c. SAE, when it exists: its Lounge is the row that was general, its
  --    Officers is the row that was exec (ids kept by the PRE-FLIGHT), and
  --    the Lounge is public. A missing id is a stop (contract 3.9), and so
  --    is a second member: org_members is locked against writes since the
  --    triggers were created, so this read is final.
  select id into sae from public.orgs where handle = 'sae';
  if sae is not null then
    select count(*) into n from public.org_members where org_id = sae;
    if n > 1 then
      raise exception 'chat-rooms: SAE has % members now, not 1 (someone joined during the apply). Stop and ask Franky', n;
    end if;
    v_was := nullif(current_setting('chat_rooms.sae_general', true), '');
    if v_was is null then
      raise exception 'chat-rooms: SAE has no channel named general, or none named exec; step 2.1 was written for both. Re-read it first';
    elsif not exists (select 1 from public.channels c
                       where c.id = v_was::uuid and c.org_id = sae
                         and c.kind = 'lounge' and c.name = 'lounge'
                         and c.is_private = false) then
      raise exception 'chat-rooms: SAE''s Lounge is not the public row that was general (%)', v_was;
    end if;
    v_was := nullif(current_setting('chat_rooms.sae_exec', true), '');
    if v_was is null then
      raise exception 'chat-rooms: SAE has no channel named general, or none named exec; step 2.1 was written for both. Re-read it first';
    elsif not exists (select 1 from public.channels c
                       where c.id = v_was::uuid and c.org_id = sae
                         and c.kind = 'officers' and c.name = 'officers'
                         and c.is_private) then
      raise exception 'chat-rooms: SAE''s Officers is not the private row that was exec (%)', v_was;
    end if;
  end if;

  -- d. The three policies read as intended; still INSERT / DELETE for
  --    authenticated; still exactly two permissive INSERT policies on
  --    messages.
  select with_check into got_org from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_insert_org_member'
     and cmd = 'INSERT' and roles = array['authenticated']::name[] and qual is null;
  select with_check into got_dm from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and policyname = 'messages_insert_member'
     and cmd = 'INSERT' and roles = array['authenticated']::name[] and qual is null;
  select qual into got_del from pg_policies
   where schemaname = 'public' and tablename = 'channel_members'
     and policyname = 'channel_members_delete_own_pending'
     and cmd = 'DELETE' and roles = array['authenticated']::name[];
  if want_org = '' or want_dm = '' or want_del = '' then
    raise notice E'chat-rooms: messages_insert_org_member WITH CHECK:\n%', got_org;
    raise notice E'chat-rooms: messages_insert_member WITH CHECK:\n%', got_dm;
    raise notice E'chat-rooms: channel_members_delete_own_pending USING:\n%', got_del;
    raise exception 'chat-rooms: policy constants are empty';
  end if;
  if got_org is distinct from want_org then
    raise exception 'chat-rooms: messages_insert_org_member does not read as written: %',
      coalesce(got_org, '(missing)');
  end if;
  if got_dm is distinct from want_dm then
    raise exception 'chat-rooms: messages_insert_member does not read as written: %',
      coalesce(got_dm, '(missing)');
  end if;
  if got_del is distinct from want_del then
    raise exception 'chat-rooms: channel_members_delete_own_pending does not read as written: %',
      coalesce(got_del, '(missing)');
  end if;
  select string_agg(policyname, ', ' order by policyname) into bad from pg_policies
   where schemaname = 'public' and tablename = 'messages'
     and cmd in ('INSERT', 'ALL') and permissive = 'PERMISSIVE';
  if bad is distinct from 'messages_insert_member, messages_insert_org_member' then
    raise exception 'chat-rooms: the permissive INSERT policies on messages are not the two expected: %', bad;
  end if;

  -- e. The functions: SECURITY DEFINER, the search_path and volatility the
  --    contract names (and TimeZone UTC on the three that compute the 7
  --    days), EXECUTE for all three roles.
  for f in
    select * from (values
      ('public.can_view_org_channel(uuid,uuid)',      's', array['search_path=public']),
      ('public.can_post_org_channel(uuid,uuid,uuid)', 's', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_repair_club(uuid)',               'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_channels_fill_kind()',            'v', array['search_path=""']),
      ('public.chat_channels_subscribe()',            'v', array['search_path=""']),
      ('public.chat_org_members_rooms()',             'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_rsvps_room()',                    'v', array['search_path=""']),
      ('public.chat_events_room()',                   'v', array['search_path=""'])
    ) as t (sig, vol, cfg)
  loop
    if not exists (select 1 from pg_proc p
                    where p.oid = to_regprocedure(f.sig)
                      and p.prosecdef
                      and p.provolatile = f.vol
                      and p.proconfig = f.cfg) then
      raise exception 'chat-rooms: % is missing, not SECURITY DEFINER, or has another volatility, search_path or TimeZone', f.sig;
    end if;
  end loop;
  -- The two functions the policies call, read back as written: the next
  -- file that restates one of them writes its PRE-FLIGHT against these.
  select md5(pg_get_functiondef(p.oid)) into got_view from pg_proc p
   where p.oid = to_regprocedure('public.can_view_org_channel(uuid,uuid)');
  select md5(pg_get_functiondef(p.oid)) into got_post from pg_proc p
   where p.oid = to_regprocedure('public.can_post_org_channel(uuid,uuid,uuid)');
  if want_view = '' or want_post = '' then
    raise notice 'chat-rooms: md5 can_view_org_channel = %', got_view;
    raise notice 'chat-rooms: md5 can_post_org_channel = %', got_post;
    raise exception 'chat-rooms: function fingerprints are empty';
  end if;
  if got_view is distinct from want_view then
    raise exception 'chat-rooms: can_view_org_channel does not read as written (md5 %)', got_view;
  end if;
  if got_post is distinct from want_post then
    raise exception 'chat-rooms: can_post_org_channel does not read as written (md5 %)', got_post;
  end if;
  for f in
    select * from (values
      ('public.can_view_org_channel(uuid,uuid)'),
      ('public.can_post_org_channel(uuid,uuid,uuid)'),
      ('public.chat_repair_club(uuid)')
    ) as t (sig)
  loop
    if not (has_function_privilege('anon', f.sig, 'execute')
        and has_function_privilege('authenticated', f.sig, 'execute')
        and has_function_privilege('service_role', f.sig, 'execute')) then
      raise exception 'chat-rooms: % must be executable by anon, authenticated and service_role', f.sig;
    end if;
  end loop;

  -- f. The five triggers, enabled, on their tables.
  select count(*) into n from pg_trigger t
   where not t.tgisinternal and t.tgenabled = 'O'
     and (t.tgrelid, t.tgname) in (
           ('public.channels'::regclass,    'chat_channels_fill_kind'),
           ('public.channels'::regclass,    'chat_channels_subscribe'),
           ('public.org_members'::regclass, 'chat_org_members_rooms'),
           ('public.rsvps'::regclass,       'chat_rsvps_room'),
           ('public.events'::regclass,      'chat_events_room'));
  if n <> 5 then
    raise exception 'chat-rooms: % of the 5 triggers are in place', n;
  end if;
  -- chat_rsvps_room fires AFTER INSERT, DELETE and ANY UPDATE, for each row
  -- (tgtype 29 = row 1 + insert 4 + delete 8 + update 16; no column list):
  -- with a column list an RSVP moved to another event fires nothing.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.rsvps'::regclass
                    and t.tgname = 'chat_rsvps_room'
                    and t.tgtype = 29
                    and cardinality(t.tgattr::int2[]) = 0) then
    raise exception 'chat-rooms: chat_rsvps_room does not fire on every update of an RSVP';
  end if;

  -- g. Grants as they were: a student still cannot UPDATE a message or
  --    INSERT a channel or a subscription row.
  if has_table_privilege('authenticated', 'public.messages', 'UPDATE')
     or has_table_privilege('authenticated', 'public.channels', 'INSERT')
     or has_table_privilege('authenticated', 'public.channels', 'UPDATE')
     or has_table_privilege('authenticated', 'public.channel_members', 'INSERT')
     or has_table_privilege('anon', 'public.messages', 'SELECT') then
    raise exception 'chat-rooms: grants on messages, channels or channel_members are not as this file found them';
  end if;

  -- h. The standing rule (20260922090000): no public, non-trigger function
  --    denies EXECUTE to anon or authenticated.
  select string_agg(p.proname, ', ') into bad
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if bad is not null then
    raise exception 'chat-rooms: functions without EXECUTE for anon or authenticated (a crash button): %', bad;
  end if;
end $$;

-- 9.2 BY BEHAVIOUR, as real students, through the policies. The probe builds
--     its own fixtures: it picks a club with a member below admin who passes
--     can_publish_now() (asked with that member's claims) and inserts a Board
--     post as this role. The probes that must be ACCEPTED run first, so a
--     refusal further down cannot be "everything is refused". All of it is
--     undone by raising a private SQLSTATE at the end of the inner block,
--     which rolls the subtransaction back (rows, claims and role).
do $$
declare
  me        text := current_user;
  cand      record;
  passes    boolean;
  why       text := 'no club has a member below admin';
  v_org     uuid;
  v_member  uuid;
  v_officer uuid;
  v_author  uuid;
  v_board   uuid;
  v_lounge  uuid;
  v_root    uuid;
  v_id      uuid;
  probe     record;
  res       text := '';
  want      text;
  state     text;
begin
  for cand in
    select m.org_id, m.user_id
      from public.org_members m
     where m.role in ('member', 'mod')
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
    why := 'no member below admin passes can_publish_now() (Terms, age, verified school email, not restricted)';
  end loop;

  if v_member is null then
    perform set_config('request.jwt.claims', '', true);
    perform set_config('chat_rooms.probe', 'behaviour check SKIPPED: ' || why, true);
    raise notice 'chat-rooms: behaviour check skipped: %', why;
    return;
  end if;

  -- An officer of the same club who may publish, for the officer's probe.
  for cand in
    select m.user_id
      from public.org_members m
     where m.org_id = v_org and m.role in ('owner', 'admin')
     order by (m.role = 'owner') desc, m.joined_at, m.user_id
     limit 10
  loop
    v_author := coalesce(v_author, cand.user_id);
    perform set_config('request.jwt.claims',
      json_build_object('sub', cand.user_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    passes := public.can_publish_now() and public.has_recorded_consent();
    execute format('set local role %I', me);
    if passes then
      v_officer := cand.user_id;
      exit;
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  if v_officer is null then
    raise notice 'chat-rooms: no owner or admin of the probe club passes can_publish_now(); the officer''s Board post is not probed';
  end if;

  select id into v_board from public.channels where org_id = v_org and kind = 'board';
  select id into v_lounge from public.channels where org_id = v_org and kind = 'lounge';
  want := case when v_officer is not null then 'officer_board=accepted;' else '' end
       || 'member_reply=accepted;member_lounge=accepted;'
       || 'member_board=42501;poll=42501;forged_removal=42501;media=42501;'
       || 'missing_root=42501;root_in_lounge=42501;';

  begin
    -- The fixture: a Board post, written as this role (no policy applies).
    insert into public.messages (channel_id, user_id, content)
    values (v_board, coalesce(v_author, v_member), 'chat-rooms probe: fixture')
    returning id into v_root;

    for probe in
      select t.*
        from (values
          -- accepted
          (1, 'officer_board',  v_officer, v_board,  'text', null::uuid,        false, false),
          (2, 'member_reply',   v_member,  v_board,  'text', v_root,            false, false),
          (3, 'member_lounge',  v_member,  v_lounge, 'text', null::uuid,        false, false),
          -- refused (42501: the row violates the INSERT policy)
          (4, 'member_board',   v_member,  v_board,  'text', null::uuid,        false, false),
          (5, 'poll',           v_member,  v_lounge, 'poll', null::uuid,        false, false),
          (6, 'forged_removal', v_member,  v_lounge, 'text', null::uuid,        true,  false),
          (7, 'media',          v_member,  v_lounge, 'text', null::uuid,        false, true),
          (8, 'missing_root',   v_member,  v_board,  'text', gen_random_uuid(), false, false),
          (9, 'root_in_lounge', v_member,  v_lounge, 'text', v_root,            false, false)
        ) as t (ord, name, who, room, kind, root, forged, media)
       where t.who is not null
       order by t.ord
    loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', probe.who, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      begin
        -- media_url is a well-formed key of this room, so the media trigger
        -- (messages_check_media_ref) lets it through to the policy.
        insert into public.messages
               (channel_id, user_id, content, kind, thread_root_id,
                removed_at, media_url, media_kind)
        values (probe.room, probe.who, 'chat-rooms probe: ' || probe.name,
                probe.kind, probe.root,
                case when probe.forged then now() end,
                case when probe.media then 'messages/' || probe.room::text || '/probe.jpg' end,
                case when probe.media then 'image' end)
        returning id into v_id;
        res := res || probe.name || '=accepted;';
      exception when others then
        res := res || probe.name || '=' || sqlstate || ';';
      end;
      execute format('set local role %I', me);
    end loop;

    raise exception using errcode = 'P0C21', message = res;
  exception when sqlstate 'P0C21' then
    state := sqlerrm;
  end;

  if state is distinct from want then
    raise exception 'chat-rooms: the behaviour probes read "%", expected "%"',
      coalesce(state, '(none)'), want;
  end if;
  if current_user <> me then
    raise exception 'chat-rooms: the post-check did not return to role %', me;
  end if;
  if exists (select 1 from public.messages where content like 'chat-rooms probe:%') then
    raise exception 'chat-rooms: a probe row survived the post-check';
  end if;
  perform set_config('chat_rooms.probe',
    'behaviour check passed'
    || case when v_officer is null
            then ' (the officer''s Board post was NOT probed: no owner or admin of the probe club may publish)'
            else '' end
    || ': ' || state, true);
  raise notice 'chat-rooms: behaviour check passed: %', state;
end $$;

-- 9.3 The apply record. NOTICE lines do not come back through the Management
--     API, so what this run did is written where a read-only query finds it
--     afterwards: at the end of the comment of chat_repair_club (CHECK AFTER
--     APPLYING, query 1).
do $$
declare
  was text := obj_description('public.chat_repair_club(uuid)'::regprocedure, 'pg_proc');
  rec text;
begin
  rec := 'APPLY RECORD '
      || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC: '
      || coalesce(nullif(current_setting('chat_rooms.step7', true), ''), 'step 7 left no record')
      || '; SAE '
      || case when exists (select 1 from public.orgs where handle = 'sae')
              then 'is there: its Lounge is the row that was general, its Officers the row that was exec'
              else 'is not in this database' end
      || '; '
      || coalesce(nullif(current_setting('chat_rooms.probe', true), ''), 'the behaviour check left no record')
      || '.';
  execute format('comment on function public.chat_repair_club(uuid) is %L',
                 coalesce(was, '') || ' ' || rec);
  raise notice 'chat-rooms: %', rec;
end $$;

-- 10. tell PostgREST about the new columns and functions (delivered at commit) --
notify pgrst, 'reload schema';

commit;
