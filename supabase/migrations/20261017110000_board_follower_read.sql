-- ---------------------------------------------------------------------------
-- 20261017110000_board_follower_read.sql
--
-- APPLY AFTER THE PUSH, once Vercel is READY and the served build is the new
-- one (M2 of the club model, batch 1A; the order since the wave-3 review,
-- finding 7). It needs 20261017100000 (orgs.followers_read_board,
-- public.org_board_bars) and refuses to run without it. Why after: the OLD
-- build's @mention fan-out and push dispatcher ask only can_view_org_channel,
-- which this file opens to a club's followers on the Board, so with the old
-- build still serving, a member's Board reply that @mentions a follower would
-- notify and push to them. The new build asks for membership too (rooms.ts
-- filterRoomReaders, push/dispatch.ts decideMention). Until this file is in,
-- the new build shows followers no Board (can_view_org_channel says no) and
-- members see no change; this file creates nothing the new build needs.
--
-- PLAIN ENGLISH
-- Franky's calls of Oct 16: only MEMBERS type in a club's chats. A club's
-- FOLLOWERS (signed in, following it) may READ its Announcement Board, and
-- nothing else: never the Lounge, the Officers room, an extra room or an event
-- chat; no posting, no replying, no reacting, no voting, anywhere. On the
-- Board they read the posts of its current owners and admins, shown as the
-- club's, never the members' replies (no member names to non-members,
-- through the app or straight from the database). A follower stops reading
-- the moment any of these is true: they unfollow, the club is hidden,
-- officers turn followers_read_board off, an officer removed them as a
-- follower (org_board_bars), an officer removed them from the club
-- (org_removals), the owner, an admin or a mod blocked them (review #4), or
-- their school email is not verified (the spec's access table).
--
-- WHAT A FOLLOWER CAN DO, BY TABLE, after this file (signed in, through the
-- database's web interface; the app asks the same rules):
--   channels           read the club's Board row (name, id): yes. That row
--                      and can_view_org_channel are how the app learns they
--                      may read the Board.
--   messages           no row of any club room, the Board included: every
--                      row carries its author's id, and the Board's history
--                      holds members' posts (the old announcements room
--                      became the Board; a demoted officer's posts stay).
--                      The app serves them the Board's live top-level posts
--                      by its CURRENT owners and admins with the service
--                      role (src/lib/chat/follower-board.ts; review
--                      finding 1). Write: no.
--   message_reactions  none (they read no club message, and the rule also
--                      keeps a non-member to their own rows); add: no
--   org_followers      their own follow, as before. An officer reads the
--                      club's follows, never one of someone in a block pair
--                      with them (asking to join follows; review finding 2)
--   channel_members    no (they hold no row, and the roster rule now also
--                      asks for membership)
--   chat_poll_votes, chat_polls, chat_message_pins: no grant at all (server
--                      only, unchanged)
--   org_members        unchanged here; M3 (20261017120000, just before the
--                      push) makes member lists members-only
--
-- WHAT IT DOES
--   0. PRE-FLIGHT, catalog reads only: 20261017100000 is in; each of the four
--      functions reads as the file that wrote it left it, or as this file
--      leaves it (a second run); each of the four policies reads as it does
--      today, or as this file leaves it.
--   1. can_view_org_channel(cid, uid), restated whole: 20261001100000's body
--      with ONE arm changed. "Not a member -> false" becomes "not a member ->
--      the follower arm", which is true only for a Board (kind 'board', not
--      private) when ALL hold: a follow row for (club, uid); uid's school
--      email is verified; the club is not hidden;
--      orgs.followers_read_board; no org_board_bars row; no
--      org_removals row; no blocks row whose blocker is the club's owner_id
--      or an owner, admin or mod of the club and whose blocked is uid. Every
--      other arm, both role guards, sql, STABLE, SECURITY DEFINER and
--      search_path 'public' as before.
--   2. can_post_org_channel(cid, uid, root), restated whole: 20261004110000's
--      body with ONE arm added right after "cannot view -> false": "not a
--      member -> false". It sits before the Board arms, so a follower can
--      neither post nor reply on the Board, and every insert policy and card
--      function that asks it (messages_insert_org_member, chat_create_poll,
--      chat_create_event_card) refuses them.
--   3. chat_cast_vote(...), restated whole: 20261004110000's body with ONE
--      test added right after "no such poll" (P0C24): a person who is not a
--      member of the poll's club gets P0C25 ("closed"), before any option row
--      is locked. The vote route pre-checks and answers its own code
--      (review #10); this is the backstop.
--   4. can_read_channel_roster(cid), restated whole: 20260928150000's body
--      with "and is a member of the club" beside can_view_org_channel, so the
--      follower arm can never widen a roster read, even through a stray row.
--   5. Four policies, by ALTER POLICY (name, command and role unchanged):
--        messages_select_org_member: members of the club only (until now
--          can_view_org_channel meant that; review finding 1);
--        message_reactions_select_member: in a club room, a person who is not
--          a member reads only their own rows (review #1);
--        message_reactions_insert_member: in a club room, members only;
--        org_followers_select: the officer arm skips anyone in a block pair
--          with the officer (review finding 2).
--   6. POST-CHECK by catalog: the four md5s are the pinned ones (and not the
--      old ones), their attributes and EXECUTE for anon, authenticated and
--      service_role (the standing rule), the four policies' text.
--   7. POST-CHECK BY BEHAVIOUR, in a block that raises P0C79 (this file's
--      own code) and so rolls itself back, as postgres: in a real club, with
--      a real person outside it made a follower for the block, every arm of
--      the follower rule answers as above, a member is unaffected, the
--      follower's vote is refused and a member's is not. SKIPPED, and
--      recorded, when there is no such club or person.
--   8. The APPLY RECORD in the comment of can_view_org_channel; one sentence
--      ("Members only") put once in front of can_post_org_channel's comment,
--      which keeps 20261004110000's text and record; notify pgrst.
--
-- DOES NOT: give a follower a channel_members row (the Board stays out of
-- their inbox list, and no unread dot); change chat_channels_subscribe or
-- chat_repair_club (they still give rows to members only); touch the DM arms
-- of either reactions policy; touch messages_insert_org_member (it asks
-- can_post_org_channel); revoke EXECUTE on anything (the standing rule,
-- 20260922090000:47-50); read or write a real person's row outside the
-- rolled-back probe.
--
-- WHAT THE APP DOES BESIDE IT (not SQL; batches 1B, 1C and the wave-1
-- repair; all in the same deploy):
--   * A follower's Board page, the /space follower mode and the
--     /api/me/club-boards previews are read with the service role, after
--     the database said yes for this viewer (ensureMember, or the channels
--     read on their client), and only live top-level posts by the club's
--     CURRENT owners and admins (src/lib/chat/follower-board.ts). Each is
--     shown as the club's: no author, no author id, no role.
--   * Reaction counts for a follower from the service client: review #1.
--   * Polls and sign-ups on the Board: counts only for a follower, no voter
--     names (chat_poll_votes is server-only): review #2.
--   * Mentions and pushes from a club room reach members only (rooms.ts
--     filterRoomReaders; push/dispatch.ts decideMention asks is_org_member
--     after can_view_org_channel): review #3.
--   * Every write route in a club room answers a reader without a role 403
--     members_only; the upload ticket refuses every club room
--     (club_media_off); orgs/[slug]/channels was members-only already.
--   * The club page GET carries board_readable, this viewer's own answer
--     from can_view_org_channel, so no screen offers a barred follower a
--     Board that answers 403.
--   * scripts/sql/chat-room-post-policy-check.sql pins this file's three
--     function md5s and its four policies (review #22).
--
-- LIVE STATE (read on the LOCAL stack, PostgreSQL 17.6, Oct 16, 2026, with
-- 20261017100000 applied). md5(pg_get_functiondef) BEFORE this file:
--     can_view_org_channel(uuid, uuid)             747ee06d2e4c3e8a788129f7530ec0ae
--       (20261001100000:1319-1343; 20261004110000:701-707 pins the same)
--     can_post_org_channel(uuid, uuid, uuid)       ae485a1fb463cfd6f6ace3448d986fb9
--       (20261004110000:577-614)
--     chat_cast_vote(uuid, uuid, uuid, boolean)    0ba4681e8816cecaa5c066ee6b03bedd
--       (20261004110000:636-680)
--     can_read_channel_roster(uuid)                204c4e0128439646a760fc4dd18b99d5
--       (20260928150000:255-268)
--   AFTER this file: the want_* constants of step 6 (the next file that
--   restates one of them writes its PRE-FLIGHT against those).
--   md5 of pg_get_expr of each policy's expression BEFORE this file (the
--   texts are in ROLLBACK below):
--     messages_select_org_member        USING  76a5397b077c1c337d2c52febbc8f91d
--     message_reactions_select_member   USING  8bb05336eab5e464b8bfd07d65a4b17f
--     message_reactions_insert_member   CHECK  aed6614c35b6b5c93628d894dd1c2232
--     org_followers_select              USING  283d38b74e5ad6be5f58886af798f74b
--       (20260916120000:726-731)
--   pg_get_expr prints public names bare when public is on the search_path
--   (it is, for the API roles and for postgres): read with the same path.
--   Callers of can_view_org_channel: the policies channels_select_org_member,
--   messages_select_org_member and both reactions policies; the functions
--   can_post_org_channel, chat_cast_vote, can_read_channel_roster; and the
--   routes (src/app/api/orgs/[slug]/space, me/threads/[id]/messages and
--   media, me/messages-upload-url, orgs/[slug]/channels). chat_polls,
--   chat_poll_options, chat_poll_votes and chat_message_pins have no grant
--   for anon or authenticated (service_role=arwd): no direct read to guard.
--
-- SAFE TO RUN AGAIN: create or replace for the four functions with the same
-- text (their md5s are checked as "the old one or this file's"), ALTER POLICY
-- for the four policies (checked the same way). A second run leaves the
-- database as the first did.
--
-- LOCK. CREATE OR REPLACE FUNCTION locks no table. ALTER POLICY takes ACCESS
-- EXCLUSIVE on messages, message_reactions and org_followers until COMMIT,
-- which includes both post-checks: every chat read and send, and every follow
-- read, waits those milliseconds. A
-- quiet hour; lock_timeout 5s makes the file fail whole instead of
-- queueing behind a long transaction; then run it again.
--
-- PRE-CHECK (read-only, on production, before applying; catalog only).
--   1. 20261017100000 is in [t | t]:
--     select exists (select 1 from pg_attribute where attrelid = 'public.orgs'::regclass
--                     and attname = 'followers_read_board' and not attisdropped),
--            to_regclass('public.org_board_bars') is not null;
--   2. The four fingerprints [the four BEFORE values in LIVE STATE]:
--     select md5(pg_get_functiondef('public.can_view_org_channel(uuid,uuid)'::regprocedure)),
--            md5(pg_get_functiondef('public.can_post_org_channel(uuid,uuid,uuid)'::regprocedure)),
--            md5(pg_get_functiondef('public.chat_cast_vote(uuid,uuid,uuid,boolean)'::regprocedure)),
--            md5(pg_get_functiondef('public.can_read_channel_roster(uuid)'::regprocedure));
--      Another value: do NOT apply; read that function on production, carry
--      its change into this file and its ROLLBACK first.
--   3. The four policies [the four BEFORE values in LIVE STATE]:
--     select polname, md5(coalesce(pg_get_expr(polqual, polrelid), '')),
--            md5(coalesce(pg_get_expr(polwithcheck, polrelid), ''))
--       from pg_policy where polname in ('messages_select_org_member',
--            'message_reactions_select_member', 'message_reactions_insert_member',
--            'org_followers_select') order by 1;
--   4. Nobody but the server reads polls, votes or pins [six rows of f]:
--     select t, has_table_privilege(r, t, 'select') from
--       (values ('public.chat_poll_votes'), ('public.chat_polls'), ('public.chat_message_pins')) a (t),
--       (values ('anon'), ('authenticated')) b (r);
--
-- HOW TO APPLY. Locally:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261017110000_board_follower_read.sql
-- On production only the main session applies it, after the push, once the
-- served build is the new one, and after Franky says yes, with the
-- connector's apply_migration (the body without begin/commit), then renames
-- the row to:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20261017110000', 'board_follower_read') ON CONFLICT (version) DO NOTHING;
--
-- CHECK AFTER APPLYING (read-only):
--   1. The APPLY RECORD:
--     select obj_description('public.can_view_org_channel(uuid,uuid)'::regprocedure, 'pg_proc');
--   2. PRE-CHECK 2 and 3 read the AFTER values of step 6.
--   3. Locally: scripts/sql/club-model-check.sql ends "all N cases passed"
--      (a follower let into the Board and reading no row of it, every
--      follower write refused, every bar holding), and so does
--      scripts/sql/chat-room-post-policy-check.sql (it pins this file's).
--
-- ROLLBACK (one transaction; BEFORE the rollback of 20261017100000, whose
-- columns and table this file's can_view_org_channel names). Followers stop
-- reading every Board at once; the app answers them as before.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   -- each body as the file that wrote it, with its grant (and its comment
--   -- where named), character for character; the md5s must read the BEFORE
--   -- values of LIVE STATE again. For the roster read its "create function"
--   -- as "create or replace function".
--   --   can_view_org_channel     20261001100000:1319-1348
--   --   can_post_org_channel     20261004110000:577-615 and 620-622 (NOT its
--   --                            comment, which keeps its APPLY RECORD: the
--   --                            do block below takes this file's sentence out)
--   --   chat_cast_vote           20261004110000:636-694
--   --   can_read_channel_roster  20260928150000:255-275
--   do $c$ begin
--     execute format('comment on function public.can_post_org_channel(uuid, uuid, uuid) is %L',
--       replace(obj_description('public.can_post_org_channel(uuid,uuid,uuid)'::regprocedure, 'pg_proc'),
--               'Members only (20261017110000): a follower who reads the Board never posts or replies. ', ''));
--   end $c$;
--   comment on function public.can_view_org_channel(uuid, uuid) is null;
--   alter policy messages_select_org_member on public.messages using (((removed_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid))) AND (EXISTS ( SELECT 1 FROM channels c WHERE ((c.id = messages.channel_id) AND (c.org_id IS NOT NULL) AND can_view_org_channel(c.id, auth.uid())))));
--   alter policy message_reactions_select_member on public.message_reactions using (EXISTS ( SELECT 1 FROM (messages m JOIN channels c ON ((c.id = m.channel_id))) WHERE ((m.id = message_reactions.message_id) AND (((c.org_id IS NULL) AND is_channel_member(m.channel_id)) OR ((c.org_id IS NOT NULL) AND can_view_org_channel(m.channel_id, auth.uid()))))));
--   alter policy message_reactions_insert_member on public.message_reactions with check ((auth.uid() = user_id) AND (EXISTS ( SELECT 1 FROM (messages m JOIN channels c ON ((c.id = m.channel_id))) WHERE ((m.id = message_reactions.message_id) AND (((c.org_id IS NULL) AND is_channel_member(m.channel_id)) OR ((c.org_id IS NOT NULL) AND can_view_org_channel(m.channel_id, auth.uid())))))) AND (NOT is_restricted_now()));
--   alter policy org_followers_select on public.org_followers using ((user_id = auth.uid()) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])));
--   delete from supabase_migrations.schema_migrations where version = '20261017110000';
--   notify pgrst, 'reload schema';
--   COMMIT;
-- REHEARSED on the local stack on Oct 16, 2026: applied three times in a row
-- (pre-flight ok, post-check ok, behaviour check passed each time); then the
-- ROLLBACK above, built from the line ranges it names and its own lines
-- (sed -E 's/^--( {3})?//'): the four md5s and the three policy md5s read
-- the BEFORE values of LIVE STATE again and chat-room-post-policy-check
-- passed unchanged (104); then applied again. After it: the batch 1A
-- negative-test script (66 cases, every follower write refused, the Board
-- read allowed, the rest refused), chat-v2-rooms-check (200),
-- chat-v2-cards-check (181), chat-message-pins-check (43), and
-- chat-room-post-policy-check with its three pinned md5s swapped for this
-- file's (104) all passed. No public function lacks EXECUTE for anon or
-- authenticated (20260922090000's POST-CHECK query: 0 rows).
-- REHEARSED AGAIN on Oct 18, 2026, after the wave-1 repair (review findings
-- 1 to 3: messages members only, the follower list's block test, a verified
-- school email): the ROLLBACK above, four policies included, put the four
-- function md5s and the four policy md5s back to LIVE STATE's BEFORE
-- values; then applied twice (pre-flight, post-check and behaviour check
-- each time); then scripts/sql/club-model-check.sql (76 cases),
-- chat-room-post-policy-check (105, pinning this file's values),
-- chat-v2-rooms-check, chat-v2-cards-check and chat-message-pins-check all
-- passed.
-- ---------------------------------------------------------------------------

begin;

-- The header's LOCK note: give up rather than queue.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT (catalog reads only) -------------------------------------------
-- Each fingerprint must be the BEFORE value (LIVE STATE) or this file's own
-- (step 6's want_*: a second run). The constants are pairs: old, new.
do $$
declare
  f    record;
  got  text;
begin
  -- a. 20261017100000 is in: the follower arm reads its column and its table.
  if not exists (select 1 from pg_attribute a
                  where a.attrelid = 'public.orgs'::regclass
                    and a.attname = 'followers_read_board' and not a.attisdropped)
     or to_regclass('public.org_board_bars') is null
     or to_regclass('public.org_removals') is null
     or to_regclass('public.org_followers') is null
     or to_regclass('public.blocks') is null then
    raise exception 'board-follower-read: apply 20261017100000 first (orgs.followers_read_board, public.org_board_bars), or org_removals, org_followers or blocks is missing';
  end if;

  -- b. The four functions.
  for f in
    select * from (values
      ('public.can_view_org_channel(uuid,uuid)',          '747ee06d2e4c3e8a788129f7530ec0ae', '09cdfa379e3d374c9f0cd2924cf56357'),
      ('public.can_post_org_channel(uuid,uuid,uuid)',     'ae485a1fb463cfd6f6ace3448d986fb9', '73fa24f050bb574b296b9f16e52e166c'),
      ('public.chat_cast_vote(uuid,uuid,uuid,boolean)',   '0ba4681e8816cecaa5c066ee6b03bedd', '794460bb81986bd638e7c236afcdb66d'),
      ('public.can_read_channel_roster(uuid)',            '204c4e0128439646a760fc4dd18b99d5', '6b7a47df42508400b6ac777b71da1c3c')
    ) as t (sig, old_md5, new_md5)
  loop
    select md5(pg_get_functiondef(p.oid)) into got from pg_proc p where p.oid = to_regprocedure(f.sig);
    if got is null then
      raise exception 'board-follower-read: % is missing', f.sig;
    elsif got <> f.old_md5 and got is distinct from nullif(f.new_md5, '') then
      raise exception 'board-follower-read: % drifted (md5 %, expected %); re-read it first', f.sig, got, f.old_md5;
    end if;
  end loop;

  -- c. The four policies: the expression this file replaces, or its own.
  for f in
    select * from (values
      ('public.messages',          'messages_select_org_member',      'r', 'q', '76a5397b077c1c337d2c52febbc8f91d', '046a4e83025b53c75039933569f11b3c'),
      ('public.message_reactions', 'message_reactions_select_member', 'r', 'q', '8bb05336eab5e464b8bfd07d65a4b17f', '6fc0edb6fb1af666ade0cb8facd3be64'),
      ('public.message_reactions', 'message_reactions_insert_member', 'a', 'c', 'aed6614c35b6b5c93628d894dd1c2232', '0b38d4e7775fba427d18fb7e90004f36'),
      ('public.org_followers',     'org_followers_select',            'r', 'q', '283d38b74e5ad6be5f58886af798f74b', 'ab843a01700b34039388c85bbe582ab2')
    ) as t (tbl, pol, cmd, part, old_md5, new_md5)
  loop
    select md5(pg_get_expr(case when f.part = 'q' then p.polqual else p.polwithcheck end, p.polrelid))
      into got
      from pg_policy p
     where p.polrelid = f.tbl::regclass and p.polname = f.pol and p.polcmd = f.cmd
       and p.polroles = array['authenticated'::regrole::oid] and p.polpermissive;
    if got is null then
      raise exception 'board-follower-read: policy % on % is missing, or not a permissive % policy for authenticated', f.pol, f.tbl, f.cmd;
    elsif got <> f.old_md5 and got is distinct from nullif(f.new_md5, '') then
      raise exception 'board-follower-read: policy % drifted (md5 %, expected %); re-read it first', f.pol, got, f.old_md5;
    end if;
  end loop;

  -- d. Polls, votes and pins stay server-only: a follower reads the Board
  --    message of a poll, and the voters must stay out of reach.
  if has_table_privilege('authenticated', 'public.chat_poll_votes', 'select')
     or has_table_privilege('anon', 'public.chat_poll_votes', 'select')
     or has_table_privilege('authenticated', 'public.chat_polls', 'select')
     or has_table_privilege('authenticated', 'public.chat_message_pins', 'select') then
    raise exception 'board-follower-read: signed-in accounts can read polls, votes or pins directly; a follower on the Board would see who voted. Tell Franky first';
  end if;
  raise notice 'board-follower-read: pre-flight ok';
end $$;

-- 1. can_view_org_channel, restated whole -------------------------------------------
-- 20261001100000:1319-1343 with ONE arm changed: "not a member -> false"
-- became "not a member -> the follower arm". The inner CASE asks the cheap
-- things first (a Board, not private, a person), then one EXISTS that holds
-- every other condition, so a member never pays for it and a person who
-- follows nothing stops at the follow row. The follower's school email must
-- be verified (the spec's access table; Privacy Policy 5b: an unverified
-- account reads only what 5b lists; repair of review finding 3: relaxing it
-- is Franky's call and a policy change). Every table it reads is read as
-- the function's owner (SECURITY DEFINER), so org_board_bars and
-- org_removals (server only) and the club's officer list (hidden from
-- non-members by org_members_select) are visible to the rule and to nobody
-- else. The block test is one way, as for joining (src/lib/orgs/
-- org-blocks.ts): an officer's block keeps the follower out; the follower's
-- own block of an officer does not.
-- CREATE OR REPLACE keeps the owner and the ACL but not the other
-- attributes: sql, STABLE, SECURITY DEFINER and search_path 'public' are
-- restated as they were.
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
    WHEN NOT public.is_org_member (c.org_id, uid) THEN
      CASE
        WHEN uid IS NULL OR c.kind IS DISTINCT FROM 'board'
             OR c.is_private IS DISTINCT FROM false THEN false
        ELSE EXISTS (
          SELECT 1
            FROM public.org_followers f
            JOIN public.orgs o ON o.id = f.org_id
            JOIN public.users u ON u.id = f.user_id
           WHERE f.org_id = c.org_id
             AND f.user_id = uid
             AND u.school_verified
             AND o.hidden_at IS NULL
             AND o.followers_read_board
             AND NOT EXISTS (SELECT 1 FROM public.org_board_bars bb
                              WHERE bb.org_id = c.org_id AND bb.user_id = uid)
             AND NOT EXISTS (SELECT 1 FROM public.org_removals r
                              WHERE r.org_id = c.org_id AND r.user_id = uid)
             AND NOT EXISTS (SELECT 1 FROM public.blocks b
                              WHERE b.blocked_id = uid
                                AND (b.blocker_id = o.owner_id
                                     OR EXISTS (SELECT 1 FROM public.org_members m
                                                 WHERE m.org_id = c.org_id
                                                   AND m.user_id = b.blocker_id
                                                   AND m.role IN ('owner','admin','mod'))))
        )
      END
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

-- Restated so the standing rule holds even if someone changed it by hand.
-- Nothing is revoked.
GRANT EXECUTE ON FUNCTION public.can_view_org_channel(uuid, uuid) TO anon, authenticated, service_role;

-- 2. can_post_org_channel, restated whole --------------------------------------------
-- 20261004110000:577-614 with ONE arm added, right after "cannot view ->
-- false": "not a member -> false". Before the Board arms on purpose: a
-- follower who can read the Board must neither post on it (the officer arm
-- would say no anyway) nor reply under a post (the reply arm would say yes).
-- Everything else, the attributes and the grant as they were.
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
      when not coalesce(public.is_org_member(c.org_id, uid), false) then false
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

-- Its comment keeps 20261004110000's text and APPLY RECORD; step 8 adds one
-- sentence to it, once.

grant execute on function public.can_post_org_channel(uuid, uuid, uuid) to anon, authenticated, service_role;

-- 3. chat_cast_vote, restated whole ----------------------------------------------------
-- 20261004110000:636-680 with ONE test added and the club read beside the
-- kind: right after "no such poll" (P0C24), a person who is not a member of
-- the poll's club gets P0C25, before the option row is locked. A follower
-- reads a poll on the Board (can_view_org_channel) and never answers it; a
-- person who can't read the room still gets P0C24, as before. The vote route
-- answers a follower with its own code before it calls this (review #10).
-- Lock order, the 42501 guard, every other SQLSTATE, plpgsql, VOLATILE,
-- SECURITY DEFINER, search_path '' and TimeZone UTC as they were.
create or replace function public.chat_cast_vote(p_poll uuid, p_option uuid, p_user uuid, p_on boolean)
returns void
language plpgsql volatile security definer
set search_path to '' set timezone to 'UTC'
as $$
declare
  v_poll     public.chat_polls%rowtype;
  v_removed  timestamptz;
  v_kind     text;
  v_org      uuid;
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
  select m.removed_at, c.kind, c.org_id into v_removed, v_kind, v_org
    from public.messages m join public.channels c on c.id = m.channel_id
   where m.id = p_poll;
  if not found or v_removed is not null
     or not coalesce(public.can_view_org_channel(v_poll.channel_id, p_user), false) then
    raise exception 'chat-cards: no such poll' using errcode = 'P0C24';
  end if;
  -- Members only (20261017110000): a follower reads the Board, never votes.
  if not coalesce(public.is_org_member(v_org, p_user), false) then
    raise exception 'chat-cards: closed: members only' using errcode = 'P0C25';
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
  'Turns one vote on or off (wave-2 contract 3.4): the poll row is the lock, a single-choice poll drops the person''s other vote first, a sign-up slot at capacity refuses, off is idempotent; any MEMBER who can view the room may vote, also on a Board and in a room where only some people post (post_policy). Raises 42501 (anon or authenticated), P0C22 (a bad shape), P0C24 (no such poll or option for this person: missing, removed, not viewable, an option of another poll), P0C25 (closed: past closes_at, an event chat past its 7 days, or the person is not a member: a follower reading the Board, 20261017110000), P0C26 (slot full). Does not check consent, publish or restriction: the route does.';

grant execute on function public.chat_cast_vote(uuid,uuid,uuid,boolean) to anon, authenticated, service_role;

-- 4. can_read_channel_roster, restated whole ------------------------------------------
-- 20260928150000:255-268 with ONE condition added beside can_view_org_channel:
-- for a club channel the caller must also be a member of the club. Before
-- this file can_view_org_channel already meant that; now that a follower
-- passes it on the Board, the roster keeps its old answer. (A follower holds
-- no channel_members row, so channel_members_select_member's
-- is_channel_member already refuses them; this is the second lock, for a
-- stray row.) sql, STABLE, SECURITY DEFINER, search_path '' as they were.
create or replace function public.can_read_channel_roster(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select current_setting('role', true) is distinct from 'anon'
     and coalesce((
           select c.org_id is null
               or (public.can_view_org_channel(c.id, (select auth.uid()))
                   and public.is_org_member(c.org_id, (select auth.uid())))
             from public.channels c
            where c.id = cid),
         false);
$$;

comment on function public.can_read_channel_roster(uuid) is
  'S67 sec wave 2 (A5b) policy helper for channel_members_select_member: true for a DM/group channel, and for a club channel only when the caller is a MEMBER of the club and public.can_view_org_channel(cid, auth.uid()) (private channels need owner/admin or org_channel_members). A follower who reads the Board never reads its roster (20261017110000). False for anon and for a missing channel. SECURITY DEFINER so the channels read is not filtered by channels RLS (which would hide the club channel and recurse through channel_members).';

grant execute on function public.can_read_channel_roster(uuid) to anon, authenticated, service_role;

-- 5. Four policies, by ALTER POLICY ----------------------------------------------------
-- Each is the expression it has today (ROLLBACK quotes them) with ONE
-- condition added. Name, command, role and permissiveness do not change; an
-- ALTER POLICY with the same text is a no-op on a second run.
--
-- a. Messages in a club room: MEMBERS ONLY, as before this file (until now
--    can_view_org_channel meant "a member"). A follower never reads a
--    message row straight from the database: every row carries its
--    author's user_id, and the Board's history holds members' posts too
--    (the old 'announcements' room became the Board with its history,
--    20261001100000:766-772; a demoted officer's posts stay). The app
--    serves a follower the Board's live top-level posts by its CURRENT
--    owners and admins, with the service role, after asking
--    can_view_org_channel as the follower, and shows them as the club's
--    (src/lib/chat/follower-board.ts; repair of review finding 1).
alter policy messages_select_org_member on public.messages
  using (
    ((removed_at IS NULL) OR (user_id = ( SELECT auth.uid() AS uid)))
    AND (EXISTS ( SELECT 1
           FROM public.channels c
          WHERE ((c.id = messages.channel_id)
                 AND (c.org_id IS NOT NULL)
                 AND public.can_view_org_channel(c.id, auth.uid())
                 AND public.is_org_member(c.org_id, auth.uid())))));

-- b. Reactions, read (review #1): in a club room, a person who is not a
--    member reads only their own rows. Without this a follower could list
--    every member who ever reacted to a Board post, by id. (Since a. a
--    non-member reads no club message, so this arm finds nothing for them:
--    the second lock.) The DM arm is as it was.
alter policy message_reactions_select_member on public.message_reactions
  using (
    EXISTS ( SELECT 1
       FROM (public.messages m
         JOIN public.channels c ON ((c.id = m.channel_id)))
      WHERE ((m.id = message_reactions.message_id)
             AND (((c.org_id IS NULL) AND public.is_channel_member(m.channel_id))
                  OR ((c.org_id IS NOT NULL)
                      AND public.can_view_org_channel(m.channel_id, auth.uid())
                      AND (public.is_org_member(c.org_id, auth.uid())
                           OR (message_reactions.user_id = auth.uid())))))));

-- c. Reactions, add: in a club room, members only. The DM arm and the
--    restriction test are as they were.
alter policy message_reactions_insert_member on public.message_reactions
  with check (
    (auth.uid() = user_id)
    AND (EXISTS ( SELECT 1
           FROM (public.messages m
             JOIN public.channels c ON ((c.id = m.channel_id)))
          WHERE ((m.id = message_reactions.message_id)
                 AND (((c.org_id IS NULL) AND public.is_channel_member(m.channel_id))
                      OR ((c.org_id IS NOT NULL)
                          AND public.can_view_org_channel(m.channel_id, auth.uid())
                          AND public.is_org_member(c.org_id, auth.uid()))))))
    AND (NOT public.is_restricted_now()));

-- d. A club's follower list (repair of review finding 2): the club's owner
--    and admins read its follower rows, as since 20260916120000:726-731, but
--    never the row of someone in a block pair with them, the test
--    org_join_requests_select already makes. Asking to join now follows the
--    club (source 'request'), and the join route keeps a request hidden
--    from an officer the student blocked; without this the follow row would
--    tell that officer, through the database, that the student asked. The
--    app's /followers list already hides blocked people. The student's own
--    arm is as it was.
alter policy org_followers_select on public.org_followers
  using (
    (user_id = auth.uid())
    OR ((public.org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text]))
        AND (NOT public.is_blocked_either_way(auth.uid(), user_id))));

-- 6. POST-CHECK by catalog (same transaction): any miss aborts the whole file ----
do $$
declare
  f    record;
  got  text;
  r    text;
  bad  text := '';
  empty boolean := false;
begin
  -- a. The four functions: read as written (md5s copied from the catalog
  --    after the first local apply, Oct 16, 2026, never typed by hand; an
  --    empty one = print them all and stop), not as they were; their
  --    attributes; EXECUTE for every API role (the standing rule).
  for f in
    select * from (values
      ('public.can_view_org_channel(uuid,uuid)',        '747ee06d2e4c3e8a788129f7530ec0ae', '09cdfa379e3d374c9f0cd2924cf56357', 's', array['search_path=public']),
      ('public.can_post_org_channel(uuid,uuid,uuid)',   'ae485a1fb463cfd6f6ace3448d986fb9', '73fa24f050bb574b296b9f16e52e166c', 's', array['search_path=""', 'TimeZone=UTC']),
      ('public.chat_cast_vote(uuid,uuid,uuid,boolean)', '0ba4681e8816cecaa5c066ee6b03bedd', '794460bb81986bd638e7c236afcdb66d', 'v', array['search_path=""', 'TimeZone=UTC']),
      ('public.can_read_channel_roster(uuid)',          '204c4e0128439646a760fc4dd18b99d5', '6b7a47df42508400b6ac777b71da1c3c', 's', array['search_path=""'])
    ) as t (sig, old_md5, want_md5, vol, cfg)
  loop
    select md5(pg_get_functiondef(p.oid)) into got from pg_proc p where p.oid = to_regprocedure(f.sig);
    if f.want_md5 = '' then
      raise notice 'board-follower-read: md5 % = %', f.sig, got;
      empty := true;
    elsif got is distinct from f.want_md5 or got = f.old_md5 then
      bad := bad || format(' %s does not read as written (md5 %s);', f.sig, got);
    end if;
    if not exists (select 1 from pg_proc p
                    where p.oid = to_regprocedure(f.sig)
                      and p.prosecdef and p.provolatile = f.vol and p.proconfig = f.cfg) then
      bad := bad || format(' %s is not SECURITY DEFINER, or has another volatility or settings;', f.sig);
    end if;
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if not has_function_privilege(r, f.sig, 'execute') then
        bad := bad || format(' %s is refused to %s (the standing rule);', f.sig, r);
      end if;
    end loop;
  end loop;

  -- b. The four policies: read as written, same command, role and kind.
  for f in
    select * from (values
      ('public.messages',          'messages_select_org_member',      'r', 'q', '046a4e83025b53c75039933569f11b3c'),
      ('public.message_reactions', 'message_reactions_select_member', 'r', 'q', '6fc0edb6fb1af666ade0cb8facd3be64'),
      ('public.message_reactions', 'message_reactions_insert_member', 'a', 'c', '0b38d4e7775fba427d18fb7e90004f36'),
      ('public.org_followers',     'org_followers_select',            'r', 'q', 'ab843a01700b34039388c85bbe582ab2')
    ) as t (tbl, pol, cmd, part, want_md5)
  loop
    select md5(pg_get_expr(case when f.part = 'q' then p.polqual else p.polwithcheck end, p.polrelid))
      into got
      from pg_policy p
     where p.polrelid = f.tbl::regclass and p.polname = f.pol and p.polcmd = f.cmd
       and p.polroles = array['authenticated'::regrole::oid] and p.polpermissive;
    if f.want_md5 = '' then
      raise notice 'board-follower-read: md5 policy % = %', f.pol, got;
      empty := true;
    elsif got is distinct from f.want_md5 then
      bad := bad || format(' policy %s does not read as written (md5 %s);', f.pol, coalesce(got, '(missing)'));
    end if;
  end loop;

  if empty then
    raise exception 'board-follower-read: fingerprints are empty';
  end if;
  if bad <> '' then
    raise exception 'board-follower-read: post-check failed:%', bad;
  end if;
  raise notice 'board-follower-read: post-check ok';
end $$;

-- 7. POST-CHECK BY BEHAVIOUR (rolls itself back) -----------------------------------
-- As the file's role (postgres) for the functions, which then answer about
-- any uid; as a signed-in student (role authenticated, their id in
-- request.jwt.claims, the way PostgREST runs a request) for the policies.
-- The CLUB is real: the oldest one that is not hidden and has a Board, a
-- Lounge, an Officers room, an owner or admin and a plain member. The
-- FOLLOWER is real: the oldest account in that club in no way (no
-- membership, follow, bar, removal, nor any block with anyone in it); the
-- block makes them follow. It also makes, in that club, an extra room, a
-- Board post by the officer, a member's reply, two reactions and a poll.
-- Everything, and what the triggers do, goes when the inner block raises
-- P0C79 (this file's own code). Nothing about the people leaves the block
-- but pass or fail. Any OTHER error aborts the whole file.
do $$
declare
  me        text := current_user;
  v_room    constant uuid := gen_random_uuid();
  v_org     uuid;
  v_owner   uuid;
  v_board   uuid;
  v_lounge  uuid;
  v_offroom uuid;
  v_event   uuid;
  v_officer uuid;
  v_member  uuid;
  v_fol     uuid;
  v_post    uuid;
  v_reply   uuid;
  v_poll    uuid;
  v_opt     uuid;
  poll_why  text;
  got       text;
  n         bigint;
  res       text := '';
  want      text;
  state     text;
begin
  select o.id, o.owner_id into v_org, v_owner from public.orgs o
   where o.hidden_at is null
     and exists (select 1 from public.channels c where c.org_id = o.id and c.kind = 'board')
     and exists (select 1 from public.channels c where c.org_id = o.id and c.kind = 'lounge')
     and exists (select 1 from public.channels c where c.org_id = o.id and c.kind = 'officers')
     and exists (select 1 from public.org_members m where m.org_id = o.id and m.role in ('owner', 'admin'))
     and exists (select 1 from public.org_members m where m.org_id = o.id and m.role = 'member')
   order by o.created_at, o.id limit 1;
  select u.id into v_fol from public.users u
   where v_org is not null
     and u.school_verified
     and not exists (select 1 from public.org_members m where m.org_id = v_org and m.user_id = u.id)
     and not exists (select 1 from public.org_followers f where f.org_id = v_org and f.user_id = u.id)
     and not exists (select 1 from public.org_board_bars b where b.org_id = v_org and b.user_id = u.id)
     and not exists (select 1 from public.org_removals r where r.org_id = v_org and r.user_id = u.id)
     and not exists (select 1 from public.blocks b
                      where (b.blocked_id = u.id or b.blocker_id = u.id)
                        and (b.blocker_id = v_owner or b.blocked_id = v_owner
                             or exists (select 1 from public.org_members m
                                         where m.org_id = v_org
                                           and m.user_id in (b.blocker_id, b.blocked_id))))
   order by u.created_at, u.id limit 1;
  if v_org is null or v_fol is null then
    perform set_config('board_follower_read.probe',
      'behaviour check SKIPPED: no club with a Board, a Lounge, an Officers room, an officer and a member, or nobody outside it', true);
    raise notice 'board-follower-read: behaviour check SKIPPED';
    return;
  end if;
  select c.id into v_board from public.channels c where c.org_id = v_org and c.kind = 'board' order by c.created_at, c.id limit 1;
  select c.id into v_lounge from public.channels c where c.org_id = v_org and c.kind = 'lounge' order by c.created_at, c.id limit 1;
  select c.id into v_offroom from public.channels c where c.org_id = v_org and c.kind = 'officers' order by c.created_at, c.id limit 1;
  select c.id into v_event from public.channels c where c.org_id = v_org and c.kind = 'event' order by c.created_at, c.id limit 1;
  select m.user_id into v_officer from public.org_members m
   where m.org_id = v_org and m.role in ('owner', 'admin')
   order by (m.role = 'admin') desc, m.joined_at, m.user_id limit 1;
  select m.user_id into v_member from public.org_members m
   where m.org_id = v_org and m.role = 'member' order by m.joined_at, m.user_id limit 1;

  want := 'follower:board=true,lounge=false,officers=false,room=false,event='
       || case when v_event is null then 'none' else 'false' end || ';'
       || 'follower:post=false,reply=false;'
       || 'member:board=true,reply=true,lounge=true,room=true;'
       || 'vote:follower=P0C25,member=1;'
       || 'rls:post=0,reply=0,reactions=0,roster=0,insert_post=42501,insert_reply=42501,react=42501;'
       || 'rls_member:post=1,reply=1,reactions=2;'
       || 'officer_reads_follow=1;'
       || 'off=false;bar=false;removed=false;blocked_by_officer=false;blocked_by_owner=false;'
       || 'blocked_by_mod=false;they_blocked_officer=true,officer_reads_follow=0;unverified=false;'
       || 'hidden=false;unfollowed=false;';

  begin
    -- Fixtures: the follow, an extra room (public: every member gets a row
    -- through chat_channels_subscribe), a Board post, a member's reply under
    -- it, a reaction by the member and one by the follower (a row left from
    -- days as a member), and a stray Board row for the follower (it must not
    -- open the roster).
    insert into public.org_followers (org_id, user_id, source) values (v_org, v_fol, 'profile');
    insert into public.channels (id, org_id, type, kind, name, is_private)
    values (v_room, v_org, 'org_channel', 'room', 'board-follower-probe', false);
    insert into public.messages (channel_id, user_id, content)
    values (v_board, v_officer, 'board-follower-read probe: post') returning id into v_post;
    insert into public.messages (channel_id, user_id, content, thread_root_id)
    values (v_board, v_member, 'board-follower-read probe: reply', v_post) returning id into v_reply;
    insert into public.message_reactions (message_id, user_id, emoji)
    values (v_post, v_member, '👍'), (v_post, v_fol, '🔥');
    insert into public.channel_members (channel_id, user_id, role, accepted_at)
    values (v_board, v_fol, 'member', now());

    -- The follower: the Board and nothing else; no post, no reply.
    res := res || format('follower:board=%s,lounge=%s,officers=%s,room=%s,event=%s;',
      public.can_view_org_channel(v_board, v_fol)::text, public.can_view_org_channel(v_lounge, v_fol)::text,
      public.can_view_org_channel(v_offroom, v_fol)::text, public.can_view_org_channel(v_room, v_fol)::text,
      case when v_event is null then 'none' else public.can_view_org_channel(v_event, v_fol)::text end);
    res := res || format('follower:post=%s,reply=%s;',
      public.can_post_org_channel(v_board, v_fol, null)::text, public.can_post_org_channel(v_board, v_fol, v_post)::text);
    -- A member, unaffected.
    res := res || format('member:board=%s,reply=%s,lounge=%s,room=%s;',
      public.can_view_org_channel(v_board, v_member)::text, public.can_post_org_channel(v_board, v_member, v_post)::text,
      public.can_post_org_channel(v_lounge, v_member, null)::text, public.can_post_org_channel(v_room, v_member, null)::text);

    -- A poll on the Board (the officer, as the card route makes one): the
    -- follower's vote is refused, the member's counts.
    begin
      v_poll := public.chat_create_poll(v_board, v_officer, 'poll', 'board-follower-read probe',
                  '[{"label": "a"}, {"label": "b"}]'::jsonb, false, false, null,
                  'board-follower-read probe: poll');
      select o.id into v_opt from public.chat_poll_options o where o.poll_id = v_poll and o.position = 0;
    exception when others then
      poll_why := sqlstate || ' ' || sqlerrm;
      v_poll := null;
    end;
    if v_poll is null or v_opt is null then
      poll_why := coalesce(poll_why, 'the poll has no option');
      res := res || 'vote:skipped;';
    else
      begin
        perform public.chat_cast_vote(v_poll, v_opt, v_fol, true);
        got := 'accepted';
      exception when others then
        got := sqlstate;
      end;
      perform public.chat_cast_vote(v_poll, v_opt, v_member, true);
      select count(*) into n from public.chat_poll_votes v where v.poll_id = v_poll;
      res := res || format('vote:follower=%s,member=%s;', got, n);
    end if;

    -- Through the policies, as the follower: no message row at all (the
    -- app serves the Board's posts; repair of review finding 1), so no
    -- reaction either, not even their own, no roster even with a stray row,
    -- and every write refused (42501: a policy said no).
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_fol, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.messages m where m.id = v_post;
    res := res || format('rls:post=%s,', n);
    select count(*) into n from public.messages m where m.id = v_reply;
    res := res || format('reply=%s,', n);
    select count(*) into n from public.message_reactions x where x.message_id = v_post;
    res := res || format('reactions=%s,', n);
    select count(*) into n from public.channel_members cm where cm.channel_id = v_board;
    res := res || format('roster=%s,', n);
    begin
      insert into public.messages (channel_id, user_id, content)
      values (v_board, v_fol, 'board-follower-read probe: follower post');
      got := 'inserted';
    exception when others then got := sqlstate;
    end;
    res := res || format('insert_post=%s,', got);
    begin
      insert into public.messages (channel_id, user_id, content, thread_root_id)
      values (v_board, v_fol, 'board-follower-read probe: follower reply', v_post);
      got := 'inserted';
    exception when others then got := sqlstate;
    end;
    res := res || format('insert_reply=%s,', got);
    begin
      insert into public.message_reactions (message_id, user_id, emoji) values (v_post, v_fol, '❤️');
      got := 'inserted';
    exception when others then got := sqlstate;
    end;
    res := res || format('react=%s;', got);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- As the member: the post, the reply and every reaction.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.messages m where m.id = v_post;
    res := res || format('rls_member:post=%s,', n);
    select count(*) into n from public.messages m where m.id = v_reply;
    res := res || format('reply=%s,', n);
    select count(*) into n from public.message_reactions x where x.message_id = v_post;
    res := res || format('reactions=%s;', n);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- As the officer: the club's follower list shows the follower.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.org_followers f where f.org_id = v_org and f.user_id = v_fol;
    res := res || format('officer_reads_follow=%s;', n);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- Each thing that ends the follower's reading, one at a time, undone
    -- before the next.
    update public.orgs set followers_read_board = false where id = v_org;
    res := res || format('off=%s;', public.can_view_org_channel(v_board, v_fol)::text);
    update public.orgs set followers_read_board = true where id = v_org;

    insert into public.org_board_bars (org_id, user_id, barred_by) values (v_org, v_fol, v_officer);
    res := res || format('bar=%s;', public.can_view_org_channel(v_board, v_fol)::text);
    delete from public.org_board_bars where org_id = v_org and user_id = v_fol;

    insert into public.org_removals (org_id, user_id, removed_by) values (v_org, v_fol, v_officer);
    res := res || format('removed=%s;', public.can_view_org_channel(v_board, v_fol)::text);
    delete from public.org_removals where org_id = v_org and user_id = v_fol;

    insert into public.blocks (blocker_id, blocked_id) values (v_officer, v_fol);
    res := res || format('blocked_by_officer=%s;', public.can_view_org_channel(v_board, v_fol)::text);
    delete from public.blocks where blocker_id = v_officer and blocked_id = v_fol;

    -- The owner by orgs.owner_id (the officer above may be an admin; with no
    -- owner_id the officer stands in, and the answer is the same).
    insert into public.blocks (blocker_id, blocked_id) values (coalesce(v_owner, v_officer), v_fol);
    res := res || format('blocked_by_owner=%s;', public.can_view_org_channel(v_board, v_fol)::text);
    delete from public.blocks where blocker_id = coalesce(v_owner, v_officer) and blocked_id = v_fol;

    -- A mod: the member made one for this case.
    update public.org_members set role = 'mod' where org_id = v_org and user_id = v_member;
    insert into public.blocks (blocker_id, blocked_id) values (v_member, v_fol);
    res := res || format('blocked_by_mod=%s;', public.can_view_org_channel(v_board, v_fol)::text);
    delete from public.blocks where blocker_id = v_member and blocked_id = v_fol;
    update public.org_members set role = 'member' where org_id = v_org and user_id = v_member;

    -- One way, as for joining: the follower's own block of an officer does
    -- not keep them out. Both ways for the follower list: that officer no
    -- longer reads the follow row (review finding 2).
    insert into public.blocks (blocker_id, blocked_id) values (v_fol, v_officer);
    res := res || format('they_blocked_officer=%s,', public.can_view_org_channel(v_board, v_fol)::text);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_officer, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.org_followers f where f.org_id = v_org and f.user_id = v_fol;
    res := res || format('officer_reads_follow=%s;', n);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    delete from public.blocks where blocker_id = v_fol and blocked_id = v_officer;

    -- A follower whose school email is not verified (review finding 3).
    update public.users set school_verified = false where id = v_fol;
    res := res || format('unverified=%s;', public.can_view_org_channel(v_board, v_fol)::text);
    update public.users set school_verified = true where id = v_fol;

    update public.orgs set hidden_at = now() where id = v_org;
    res := res || format('hidden=%s;', public.can_view_org_channel(v_board, v_fol)::text);
    update public.orgs set hidden_at = null where id = v_org;

    delete from public.org_followers where org_id = v_org and user_id = v_fol;
    res := res || format('unfollowed=%s;', public.can_view_org_channel(v_board, v_fol)::text);

    raise exception using errcode = 'P0C79', message = res;
  exception when sqlstate 'P0C79' then
    state := sqlerrm;
  end;

  if poll_why is not null then
    want := replace(want, 'vote:follower=P0C25,member=1;', 'vote:skipped;');
  end if;
  if state is distinct from want then
    raise exception 'board-follower-read: the behaviour probes read "%", expected "%"', coalesce(state, '(none)'), want;
  end if;
  if current_user <> me then
    raise exception 'board-follower-read: the post-check did not return to role %', me;
  end if;
  if exists (select 1 from public.channels c where c.id = v_room)
     or exists (select 1 from public.messages m where m.content like 'board-follower-read probe%')
     or exists (select 1 from public.org_followers f where f.org_id = v_org and f.user_id = v_fol)
     or exists (select 1 from public.channel_members cm where cm.channel_id = v_board and cm.user_id = v_fol)
     or exists (select 1 from public.users u where u.id = v_fol and not u.school_verified)
     or exists (select 1 from public.orgs o where o.id = v_org and (o.hidden_at is not null or not o.followers_read_board)) then
    raise exception 'board-follower-read: a probe row or change survived the behaviour check';
  end if;
  perform set_config('board_follower_read.probe',
    'behaviour check passed'
    || case when poll_why is not null then ' (votes NOT probed: no poll fixture, ' || poll_why || ')' else '' end
    || ': ' || state, true);
  raise notice 'board-follower-read: behaviour check passed: %', state;
end $$;

-- 8. The apply record, then PostgREST ------------------------------------------------
-- In the comment of can_view_org_channel (it had none), restated whole each
-- run so a second run does not pile up records. can_post_org_channel's
-- comment keeps what 20261004110000 wrote (its rule and its APPLY RECORD,
-- which scripts/sql/chat-room-post-policy-check.sql C7 reads) and gains one
-- sentence, once. A comment is not part of pg_get_functiondef: step 6's md5s
-- are not moved by it.
do $$
declare
  was text := obj_description('public.can_post_org_channel(uuid,uuid,uuid)'::regprocedure, 'pg_proc');
begin
  if coalesce(was, '') not like '%(20261017110000)%' then
    execute format('comment on function public.can_post_org_channel(uuid, uuid, uuid) is %L',
      'Members only (20261017110000): a follower who reads the Board never posts or replies. ' || coalesce(was, ''));
  end if;
  execute format('comment on function public.can_view_org_channel(uuid, uuid) is %L',
    'May uid read club room cid? Members: the Board, the Lounge and public rooms; private rooms for owners, admins and '
    || 'the allow list; an event chat for owners, admins and the holders of a row. Followers who are not members: the '
    || 'Board only, while they follow, their school email is verified, the club is not hidden, '
    || 'orgs.followers_read_board is on, and no bar '
    || '(org_board_bars), removal (org_removals) or block by the owner, an admin or a mod stands (20261017110000). '
    || 'Reading only, and through the app: the messages policy, can_post_org_channel, chat_cast_vote and the '
    || 'reactions policy ask for membership, so the app serves a follower the Board''s posts. Under the '
    || 'authenticated role it only answers about the caller; anon: false. '
    || 'APPLY RECORD ' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC: functions restated 4, '
    || 'policies altered 4; '
    || coalesce(nullif(current_setting('board_follower_read.probe', true), ''), 'the behaviour check left no record') || '.');
end $$;

notify pgrst, 'reload schema';

commit;
