-- T2 FILE 1 OF 2 -- notification writes, likes, DM blocks, and the block /
-- mute / dormant helpers (week-1 wave plan, handoffs/wave-plan-week1/T2.md,
-- as amended by handoffs/wave-plan-week1/rulings.md: the 2026-09-22 STANDING
-- RULE, H1, H2, H3, H4, M5, M8, M9, M14). File 2
-- (20260922120500_t2b_org_helper_guards.sql) holds the org-helper guard on its
-- own, with its own rollback (rulings M5).
--
-- WHY. Any signed-in student can today:
--   * POST /rest/v1/notifications {"user_id":<anyone>,"actor_id":<self>,
--     "type":"mention","post_id":<any post>} as often as they like: a fake
--     @mention in anyone's feed and badge count (policy
--     notifications_insert_as_actor checks only actor_id);
--   * rewrite actor_id / type / post_id on their own notification rows;
--   * loop POST/DELETE /rest/v1/post_likes and comment_likes, past any route
--     limit and the Terms gate, and each re-like re-notifies the owner;
--   * follow / unfollow / follow to re-notify, the same way;
--   * send into a DM with someone who blocked them, straight over REST
--     (messages_insert_member has no block clause);
--   * ask rpc/is_blocked_either_way whether ANY two people blocked each other,
--     rpc/is_muting_now whether ANY student mutes another, and
--     rpc/is_org_dormant about any club.
--
-- WHAT IT DOES
--   §A notifications: no client INSERT (policy dropped, grant revoked); UPDATE
--      only on read_at; anon loses everything. Mentions are written by the
--      three routes with the service role, after their own checks
--      (src/lib/mentions.ts insertMentionNotifications).
--   §B one like / follow notification per pair while an earlier one exists
--      (notify_on_like_insert, notify_on_connection_insert), plus the index
--      that serves it; post_likes and comment_likes are written only by the
--      like routes (service role, after auth + limit + Terms + visibility).
--   §C is_blocked_either_way / is_muting_now answer only about the caller;
--      is_org_dormant answers only the service role. EXECUTE stays GRANTED.
--   §E messages_insert_member refuses a DM / group send when any other member
--      is in a block pair with the sender.
--
-- STANDING RULE (rulings, 2026-09-22). On this Postgres image (17.6.1.111,
-- production's too) calling a public function the caller has no EXECUTE on
-- crashes the backend (signal 11). So this file REVOKES NO EXECUTE AT ALL:
--   * the three helpers T2.md planned to revoke (is_blocked_either_way,
--     is_muting_now, is_org_dormant) are rewritten to refuse inside and keep
--     their grants to anon, authenticated and service_role;
--   * the six trigger functions T2.md planned to revoke (bump_org_activity,
--     bump_org_activity_from_post, notify_on_comment_insert,
--     notify_on_connection_insert, notify_on_like_insert, posts_stamp_campus)
--     keep their ACLs as they are. That revoke was hygiene only: PostgREST
--     can't call a function that returns trigger (PGRST202), and firing a
--     trigger never checks EXECUTE. A revoke would only add a permission-denied
--     path, which is the crash.
-- The end of the body checks that 0 public non-trigger functions deny EXECUTE
-- to anon or authenticated, and aborts the whole file otherwise.
--
-- LIVE STATE BEFORE THIS FILE (read-only MCP, production, 2026-09-22; the
-- local stack agrees except where DRIFT says otherwise)
--   * schema_migrations since 20260916: 20260916100000 .. 20260916130000,
--     20260922090000 (the function-privilege guard). Nothing else of week 1.
--   * notifications policies: notifications_select_own, notifications_update_own
--     (USING and CHECK auth.uid() = user_id), notifications_delete_own,
--     notifications_insert_as_actor (CHECK auth.uid() = actor_id AND
--     type = 'mention'). relacl {postgres=arwdDxtm,anon=arwdDxtm,
--     authenticated=arwdDxtm,service_role=arwdDxtm}, no column ACLs.
--     notifications_type_check: follow, connection, like, comment, mention,
--     org_invite, org_request_approved. Rows: comment 8, follow 29 (25
--     distinct pairs), like 8 (7 distinct), mention 7. Indexes: pkey,
--     idx_notifications_user_unread, _user_recent, _message, _message_id, _org.
--   * Triggers trg_notify_on_like (post_likes), trg_notify_on_comment
--     (post_comments), trg_notify_on_connection (connections): SECURITY
--     DEFINER, owner postgres, search_path public.
--   * post_likes, comment_likes: relacl arwdDxtm for anon and authenticated;
--     policies *_select_authenticated (true), *_insert_own, *_delete_own.
--     (T1 file 2, 20260922110000, narrows the SELECT policy and trims anon,
--     UPDATE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN. The two files commute:
--     both only revoke on these two tables.)
--   * messages relacl {postgres=arwdDxtm,authenticated=ardDxtm,
--     service_role=arwdDxtm}. messages_insert_member CHECK:
--     ((auth.uid() = user_id) AND (EXISTS (channel_members cm JOIN channels c
--     ... cm.channel_id = messages.channel_id AND cm.user_id = auth.uid()
--     AND c.org_id IS NULL)) AND has_recorded_consent()), last set by
--     20260906130000_consent_db_boundary.sql. No `blocks`.
--   * md5(pg_get_functiondef) of the five functions this file replaces:
--       notify_on_like_insert        0e78c94deb59bb6b3b153ade51b266db
--       notify_on_connection_insert  68d42fc0954b94068b906a9f66db078a  (prod)
--                                    5a629d4767435ed10d2647b82b69a7f9  (local)
--       is_blocked_either_way        e21645625882ac9541fb65f870d542b4
--       is_muting_now                cc24839833f1f040db26f045eb501d51
--       is_org_dormant               884dd92b698fea228d46c76aae4493d1
--     The last three are the 20260922090000 bodies, the same on both sides.
--
-- DRIFT (rulings H4). Two function bodies differed between production and
-- the migration files:
--   * notify_on_connection_insert. Production's body (526 chars) writes one
--     'follow' row. The migration files' body (1151 chars, last defined in
--     20260504160000_notifications_connection_type.sql) also writes two
--     'connection' rows on every mutual follow; production was changed by
--     hand. This file writes production's body plus the de-dup rule on both
--     sides, so they converge. FRANKY NOTE: the "Connections" notification
--     filter is dead in production, since nothing writes 'connection' rows
--     (src/components/network/OttoSidePanel.tsx:564,761 and
--     src/app/api/me/notifications/count/route.ts:73 still read them). Drop
--     the filter or restore a writer; not a week-1 change.
--   * is_muting_now. Already converged by 20260922090000 (production's body,
--     md5 cc248398... on both sides now).
--
-- EVERY WRITER KEEPS WORKING
--   notifications: follow / like / comment rows come from the SECURITY
--   DEFINER triggers (owner postgres; table grants don't reach them).
--   Mentions: src/app/api/me/publish-post/route.ts, src/app/api/me/threads/
--   [id]/messages/route.ts and src/app/api/posts/[id]/route.ts (T1b) write
--   with the service role. org_invite / org_request_approved:
--   src/lib/orgs/membership.ts notifyOrg (service role). Every UPDATE caller
--   sets only read_at (me/notifications/mark-read, me/org-invites/[id],
--   membership.ts). DELETE and SELECT are untouched.
--   likes: src/app/api/posts/[id]/like and src/app/api/comments/[id]/like
--   write with the service role. FK cascades still work (they run as the
--   table owner).
--   messages: the only user-client insert is the messages route, which runs
--   the same block check first (src/lib/safety/pair-block.ts dmSendBlocked).
--
-- SECURITY DEFINER FUNCTIONS AFTER THIS FILE (rulings H3; with T1 file 1)
--   granted to anon + authenticated + service_role, answering only about the
--   caller, or numbers only:
--     can_view_org_channel, is_org_member, org_member_role (guarded by file 2)
--     is_blocked_either_way, is_muting_now (this file: caller only)
--     is_org_dormant (this file: null unless the service role asks)
--     has_recorded_consent, is_channel_member, record_post_view,
--     record_profile_view (auth.uid() only, unchanged)
--     rate_limit_hit (refuses anon/authenticated inside, 20260922090000)
--     T1: event_visible, can_manage_event, post_engagement_counts,
--     comment_like_counts, event_rsvp_counts, mutual_follow_counts,
--     second_degree_follows
--   triggers (ACL unchanged; not reachable over REST): bump_org_activity,
--     bump_org_activity_from_post, notify_on_comment_insert,
--     notify_on_connection_insert, notify_on_like_insert, posts_stamp_campus,
--     handle_new_user, org_followers_stamp_first, org_members_imply_follow,
--     org_members_unfollow_on_leave; event trigger rls_auto_enable.
--
-- DEPLOY ORDER. CODE FIRST (T2 Risk 1). Applied before the T2 code is live:
-- every like 500s (user-client insert → 42501), every @mention silently stops
-- notifying, and a blocked DM send is a 500 instead of a 403. Planned
-- production order for week 1 (rulings H2): T1 file 1 -> E1 -> P1 ->
-- T1 file 2 -> THIS FILE -> file 2 (20260922120500). The T2 files do not
-- depend on T1's; if the real order differs, the orchestrator renumbers first
-- (PRE-FLIGHT a says how).
-- VERCEL ROLLBACK RULE (rulings M9): while this file is live, never
-- instant-roll Vercel back to a build older than the T2 code (likes would 500
-- and mentions stop). Run this file's ROLLBACK first, then roll Vercel back.
-- Preview deployments that share the production database have the same
-- problem.
--
-- HOW TO APPLY BY HAND (orchestrator only, with Franky's explicit yes).
--   0. PRE-FLIGHT, read-only. STOP on anything you can't explain.
--      a. The version gate (rulings H2): my PLANNED predecessor present, my
--         own version absent. Never gate on max(version). The planned
--         predecessor is T1 file 2 (20260922110000). The real dependency is
--         only 20260922090000, and the md5 check at the top of the body
--         enforces it.
--           SELECT version FROM supabase_migrations.schema_migrations
--            WHERE version IN ('20260922090000', '20260922110000', '20260922120000')
--            ORDER BY 1;
--           -- expect exactly TWO rows: 20260922090000, 20260922110000.
--           -- 20260922120000 present: already applied. STOP.
--           -- 20260922090000 missing: STOP (the body would abort anyway).
--           -- 20260922110000 missing: T2 is ahead of the plan. That is safe
--           --   (T1 file 2 and this file commute: on the one table pair both
--           --   touch, post_likes / comment_likes, both only revoke), but
--           --   renumber first: give BOTH T2 files versions above every
--           --   applied version and below 20260922110000 (for example
--           --   20260922105000 and 20260922105500), so `supabase db reset`
--           --   replays the order production saw. Then run this gate again
--           --   with the new numbers.
--      b. The code gate: the Vercel production deploy holds the T2 commit(s)
--         AND T1b's (it moves the PATCH mention writes in
--         src/app/api/posts/[id]/route.ts to the service role) and is Ready:
--           gh api repos/{owner}/{repo}/deployments --jq '.[0] | {sha, environment, created_at}'
--      c. No user-client writer is left. Each prints nothing:
--           rg -n "insertMentionNotifications\(supabase" src
--           rg -n 'rpc\("(is_blocked_either_way|is_muting_now|is_org_dormant)"' src public/html
--           rg -n "rest/v1/(notifications|post_likes|comment_likes|rpc)" src public/html
--           rg -n -U 'auth\.supabase\s*\.from\("(post_likes|comment_likes)"\)' src
--      d. Live state still matches LIVE STATE above (pg_catalog, not
--         information_schema: the MCP role sees 0 rows there):
--           SELECT polname FROM pg_policy
--            WHERE polrelid = 'public.notifications'::regclass ORDER BY 1;
--           -- 4 rows, notifications_insert_as_actor among them
--           SELECT relname, relacl::text FROM pg_class
--            WHERE oid IN ('public.notifications'::regclass,
--                          'public.post_likes'::regclass,
--                          'public.comment_likes'::regclass);
--           -- notifications: arwdDxtm for anon and authenticated. The two
--           -- likes tables: the same, or T1 file 2's narrower ACL if it is
--           -- applied (authenticated=ard, no anon).
--           SELECT pg_get_expr(polwithcheck, polrelid) ~ 'blocks'
--             FROM pg_policy WHERE polname = 'messages_insert_member';  -- f
--           SELECT p.proname, md5(pg_get_functiondef(p.oid)) FROM pg_proc p
--            WHERE p.pronamespace = 'public'::regnamespace
--              AND p.proname IN ('notify_on_like_insert', 'notify_on_connection_insert',
--                  'is_blocked_either_way', 'is_muting_now', 'is_org_dormant')
--            ORDER BY 1;
--           -- the md5s in LIVE STATE. The body re-checks them and aborts the
--           -- whole file on any other body.
--      e. The local-stack acceptance for T2 (T2.md Acceptance 4, run serially
--         by the acceptance agent, rulings B5) passed, log in the handoff.
--   1. Apply with the management-API curl recipe
--      (20260916120000_org_followers.sql:443-458), --rawfile pointing at this
--      file. `[]` means success. A JSON error means nothing was applied (one
--      transaction). "canceling statement due to lock timeout": a long reader
--      held a lock; nothing changed, retry in a minute.
--   2. Record it (same recipe, a scratch .sql file):
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260922120000', 't2_notification_writes_and_helper_grants');
--      Then write the apply time and the list of week-1 versions applied
--      before it into the session handoff, so a later file applied out of
--      order can be renumbered against the real history.
--
-- POST-CHECK (read-only).
--   SELECT has_table_privilege('authenticated', 'public.notifications', 'INSERT'),            -- f
--          has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE'), -- t
--          has_column_privilege('authenticated', 'public.notifications', 'actor_id', 'UPDATE'),-- f
--          has_table_privilege('authenticated', 'public.notifications', 'SELECT'),            -- t
--          has_table_privilege('authenticated', 'public.notifications', 'DELETE'),            -- t
--          has_table_privilege('anon', 'public.notifications', 'SELECT');                     -- f
--   SELECT has_table_privilege('authenticated', 'public.post_likes', 'INSERT'),     -- f
--          has_table_privilege('authenticated', 'public.post_likes', 'DELETE'),     -- f
--          has_table_privilege('authenticated', 'public.comment_likes', 'INSERT'),  -- f
--          has_table_privilege('authenticated', 'public.comment_likes', 'DELETE'),  -- f
--          has_table_privilege('authenticated', 'public.post_likes', 'SELECT'),     -- t
--          has_table_privilege('anon', 'public.post_likes', 'SELECT');              -- f
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.notifications'::regclass ORDER BY 1;
--   -- notifications_delete_own, notifications_select_own, notifications_update_own
--   SELECT pg_get_expr(polwithcheck, polrelid) ~ 'blocks'
--     FROM pg_policy WHERE polname = 'messages_insert_member';                     -- t
--   SELECT to_regclass('public.idx_notifications_actor_dedupe') IS NOT NULL;       -- t
--   SELECT proname, prosrc ~ 'auth\.uid\(\)' FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('is_blocked_either_way', 'is_muting_now');                  -- t, t
--   The standing-rule check (the body runs it too and aborts on a miss):
--   SELECT count(*) FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--      AND format_type(p.prorettype, null) NOT IN ('trigger', 'event_trigger')
--      AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
--           OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));  -- 0
--   SMOKE, GET-ONLY (rulings M8), by the orchestrator with Franky's session
--   cookie (curl, not page loads): GET /api/feed?limit=20 → 200;
--   GET /api/me/notifications → 200 and still lists like, comment, follow and
--   mention rows; GET /api/me/notifications/count → 200; GET /api/me/threads
--   → 200. Don't open a thread or a post: those write read markers / views.
--   Local-stack behavior probes are T2.md Acceptance 4. Per the standing rule
--   they never call a function as a role that lacks EXECUTE; use
--   has_function_privilege instead.
--
-- ROLLBACK (one transaction). Restores ONLY this file's change (rulings H1):
-- likes get back INSERT and DELETE for authenticated and nothing for anon, so
-- T1 file 2's trims stay. The T2 code keeps working either way: it writes
-- with the service role and never depends on these grants being gone. After
-- it, re-run T1 file 2's POST-APPLY grant check if T1 file 2 is applied.
-- The five bodies below are production's pg_get_functiondef output from
-- 2026-09-22, verbatim, so this runs without re-reading production. To run
-- it, copy the block and strip the first five characters ("--   ") of every
-- line; the bodies then match production byte for byte.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   CREATE POLICY notifications_insert_as_actor ON public.notifications
--     FOR INSERT TO authenticated
--     WITH CHECK ((auth.uid() = actor_id) AND (type = 'mention'::text));
--   REVOKE UPDATE ON TABLE public.notifications FROM authenticated;  -- also drops the read_at column grant
--   GRANT ALL ON TABLE public.notifications TO anon, authenticated;   -- back to arwdDxtm
--   DROP INDEX IF EXISTS public.idx_notifications_actor_dedupe;
--   GRANT INSERT, DELETE ON TABLE public.post_likes, public.comment_likes TO authenticated;
--   ALTER POLICY messages_insert_member ON public.messages WITH CHECK (
--     (auth.uid() = user_id)
--     AND (EXISTS (SELECT 1 FROM public.channel_members cm
--                    JOIN public.channels c ON c.id = cm.channel_id
--                   WHERE cm.channel_id = messages.channel_id
--                     AND cm.user_id = auth.uid() AND c.org_id IS NULL))
--     AND public.has_recorded_consent());
--   CREATE OR REPLACE FUNCTION public.notify_on_like_insert()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     post_owner uuid;
--   BEGIN
--     SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
--     IF post_owner IS NULL OR post_owner = NEW.user_id THEN
--       RETURN NEW;
--     END IF;
--     INSERT INTO public.notifications (user_id, actor_id, type, post_id)
--     VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
--     RETURN NEW;
--   END;
--   $function$;
--   CREATE OR REPLACE FUNCTION public.notify_on_connection_insert()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   BEGIN
--     -- Defensive: schema CHECK already prevents follower=following, but
--     -- guard anyway so an upstream change can't accidentally self-notify.
--     IF NEW.follower_id = NEW.following_id THEN
--       RETURN NEW;
--     END IF;
--     INSERT INTO public.notifications (user_id, actor_id, type)
--     VALUES (NEW.following_id, NEW.follower_id, 'follow');
--     RETURN NEW;
--   END;
--   $function$;
--   CREATE OR REPLACE FUNCTION public.is_blocked_either_way(viewer_id uuid, other_id uuid)
--    RETURNS boolean
--    LANGUAGE sql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     SELECT CASE WHEN current_setting('role', true) = 'anon' THEN false ELSE EXISTS (
--       SELECT 1 FROM public.blocks
--       WHERE (blocker_id = viewer_id AND blocked_id = other_id)
--          OR (blocker_id = other_id AND blocked_id = viewer_id)
--     ) END;
--   $function$;
--   CREATE OR REPLACE FUNCTION public.is_muting_now(viewer_id uuid, other_id uuid)
--    RETURNS boolean
--    LANGUAGE sql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     SELECT CASE WHEN current_setting('role', true) = 'anon' THEN false ELSE EXISTS (
--       SELECT 1 FROM public.mutes
--       WHERE muter_id = viewer_id AND muted_id = other_id
--         AND (until IS NULL OR until > now ())
--     ) END;
--   $function$;
--   CREATE OR REPLACE FUNCTION public.is_org_dormant(oid uuid)
--    RETURNS boolean
--    LANGUAGE sql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--     SELECT verified = false
--        AND (last_activity_at IS NULL OR last_activity_at < now() - interval '60 days')
--       FROM public.orgs WHERE id = oid
--        AND current_setting('role', true) IS DISTINCT FROM 'anon';
--   $function$;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922120000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- CREATE OR REPLACE keeps each function's owner and ACL, so no grant is
-- needed, and none is revoked (standing rule).
-- ---------------------------------------------------------------------------

begin;

-- ACCESS EXCLUSIVE on notifications, post_likes, comment_likes and messages
-- for milliseconds; fail fast rather than queue every read behind a long one.
set local lock_timeout = '5s';

-- 0. The bodies this file replaces must be the ones read on 2026-09-22.
--    Any other body aborts the whole file, so nothing unexpected is
--    overwritten (and a second run stops here).
do $$
declare
  expected jsonb := jsonb_build_object(
    'notify_on_like_insert',       jsonb_build_array('0e78c94deb59bb6b3b153ade51b266db'),
    -- production, and the drifted migration-file body the local stack builds
    'notify_on_connection_insert', jsonb_build_array('68d42fc0954b94068b906a9f66db078a',
                                                     '5a629d4767435ed10d2647b82b69a7f9'),
    'is_blocked_either_way',       jsonb_build_array('e21645625882ac9541fb65f870d542b4'),
    'is_muting_now',               jsonb_build_array('cc24839833f1f040db26f045eb501d51'),
    'is_org_dormant',              jsonb_build_array('884dd92b698fea228d46c76aae4493d1'));
  r record;
  n int := 0;
begin
  for r in
    select p.proname, md5(pg_get_functiondef(p.oid)) as h
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
       and p.proname in (select jsonb_object_keys(expected))
  loop
    n := n + 1;
    if not (expected -> r.proname) ? r.h then
      raise exception 't2: % has an unexpected body (md5 %); stop and re-read it', r.proname, r.h;
    end if;
  end loop;
  if n <> 5 then
    raise exception 't2: expected 5 functions, found %', n;
  end if;
end $$;

-- §A notifications: clients never insert; they may only mark read. -----------
-- Mentions come from the routes through the service role; follow, like and
-- comment rows come from the SECURITY DEFINER triggers.
drop policy if exists notifications_insert_as_actor on public.notifications;
revoke all on table public.notifications from anon;
revoke insert, update, truncate, references, trigger on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- Serves both de-dup lookups below and the edit route's "already mentioned"
-- read. Not unique: live data already holds duplicate like and follow rows.
create index if not exists idx_notifications_actor_dedupe
  on public.notifications (user_id, actor_id, type);

-- §B one like / follow notification per pair while an earlier one exists. ----
-- Read or unread: like, unlike, like again notifies once. If the owner
-- deleted the notification, the next like notifies again.
CREATE OR REPLACE FUNCTION public.notify_on_like_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.posts WHERE id = NEW.post_id;
  IF post_owner IS NULL OR post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = post_owner AND n.actor_id = NEW.user_id
      AND n.type = 'like' AND n.post_id = NEW.post_id
  ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications (user_id, actor_id, type, post_id)
  VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
  RETURN NEW;
END;
$function$;

-- Production's body (writes one 'follow' row, no 'connection' rows; see
-- DRIFT), plus the same de-dup rule: follow, unfollow, follow notifies once.
CREATE OR REPLACE FUNCTION public.notify_on_connection_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Defensive: schema CHECK already prevents follower=following, but
  -- guard anyway so an upstream change can't accidentally self-notify.
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.following_id AND n.actor_id = NEW.follower_id
      AND n.type = 'follow'
  ) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$function$;

-- §B likes are written only by the like routes (service role, after auth,
-- the like:<user> limit, the Terms gate and the visibility check). SELECT
-- stays for authenticated: the feed and the viewers read like state.
-- MAINTAIN is left alone (T1 file 2 trims it).
revoke all on table public.post_likes from anon;
revoke insert, update, delete, truncate, references, trigger on table public.post_likes from authenticated;
revoke all on table public.comment_likes from anon;
revoke insert, update, delete, truncate, references, trigger on table public.comment_likes from authenticated;

-- §C helpers no client needs: they answer only about the caller. -------------
-- NOT revoked (standing rule): EXECUTE stays with anon, authenticated and
-- service_role, and each one refuses from inside. The bodies are the
-- 20260922090000 bodies plus the caller check:
--   anon                          false / null, as before;
--   authenticated                 answers only when the caller is one of the
--                                 two people asked about (is_muting_now: only
--                                 when the caller is the muter);
--   anyone else (service_role,    answers normally; no code calls these with
--   postgres, triggers)           the service role today.
-- is_blocked_either_way answers the same question blocks_select_either
-- already lets the caller read. is_muting_now never tells anyone whether
-- someone is muting THEM: mutes are private to the muter.
-- `role` is the request role PostgREST sets; a SECURITY DEFINER function
-- runs as its owner but does not change it (20260922090000 relies on it).
CREATE OR REPLACE FUNCTION public.is_blocked_either_way(viewer_id uuid, other_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN current_setting('role', true) = 'anon' THEN false
    WHEN current_setting('role', true) = 'authenticated'
         AND viewer_id IS DISTINCT FROM auth.uid()
         AND other_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.blocks
      WHERE (blocker_id = viewer_id AND blocked_id = other_id)
         OR (blocker_id = other_id AND blocked_id = viewer_id)
    )
  END;
$function$;

CREATE OR REPLACE FUNCTION public.is_muting_now(viewer_id uuid, other_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN current_setting('role', true) = 'anon' THEN false
    WHEN current_setting('role', true) = 'authenticated'
         AND viewer_id IS DISTINCT FROM auth.uid() THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.mutes
      WHERE muter_id = viewer_id AND muted_id = other_id
        AND (until IS NULL OR until > now ())
    )
  END;
$function$;

-- No policy, function or route calls is_org_dormant, and it takes no user,
-- so there is no "about the caller" answer to give: students (anon and
-- authenticated) get null, the service role gets the answer.
CREATE OR REPLACE FUNCTION public.is_org_dormant(oid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT verified = false
     AND (last_activity_at IS NULL OR last_activity_at < now() - interval '60 days')
    FROM public.orgs WHERE id = oid
     AND current_setting('role', true) IS DISTINCT FROM 'anon'
     AND current_setting('role', true) IS DISTINCT FROM 'authenticated';
$function$;

-- CREATE OR REPLACE keeps the ACL; restate the grants so the standing rule
-- holds even if someone changed them by hand.
GRANT EXECUTE ON FUNCTION public.is_blocked_either_way(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_muting_now(uuid, uuid)         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_dormant(uuid)              TO anon, authenticated, service_role;

-- §E a DM / group send is refused when any other member is in a block pair
-- with the sender (either direction). The same group rule the messages route
-- enforces: one block in a group chat stops the sender there. The subquery
-- reads channel_members (channel_members_select_member) and blocks
-- (blocks_select_either) under the sender's own RLS, which expose exactly
-- these rows; an error aborts the insert. messages_insert_org_member is
-- untouched, and no SELECT policy changes.
alter policy messages_insert_member on public.messages
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.channel_members cm
        join public.channels c on c.id = cm.channel_id
       where cm.channel_id = messages.channel_id
         and cm.user_id = auth.uid()
         and c.org_id is null
    )
    and not exists (
      select 1 from public.channel_members peer
        join public.blocks b
          on (b.blocker_id = auth.uid() and b.blocked_id = peer.user_id)
          or (b.blocker_id = peer.user_id and b.blocked_id = auth.uid())
       where peer.channel_id = messages.channel_id
         and peer.user_id <> auth.uid()
    )
    and public.has_recorded_consent()
  );

-- Post-check inside the transaction: any miss aborts the whole file. --------
do $$
declare n int;
begin
  -- The standing rule: no REST-reachable public function denies EXECUTE.
  select count(*) into n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n <> 0 then
    raise exception 't2: % public functions deny EXECUTE (standing rule)', n;
  end if;

  if has_table_privilege('authenticated', 'public.notifications', 'INSERT')
     or has_table_privilege('authenticated', 'public.notifications', 'UPDATE')
     or has_column_privilege('authenticated', 'public.notifications', 'actor_id', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.notifications', 'read_at', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.notifications', 'SELECT')
     or not has_table_privilege('authenticated', 'public.notifications', 'DELETE')
     or has_table_privilege('anon', 'public.notifications', 'SELECT') then
    raise exception 't2: notifications grants are not as intended';
  end if;

  if has_table_privilege('authenticated', 'public.post_likes', 'INSERT')
     or has_table_privilege('authenticated', 'public.post_likes', 'DELETE')
     or has_table_privilege('authenticated', 'public.comment_likes', 'INSERT')
     or has_table_privilege('authenticated', 'public.comment_likes', 'DELETE')
     or not has_table_privilege('authenticated', 'public.post_likes', 'SELECT')
     or not has_table_privilege('authenticated', 'public.comment_likes', 'SELECT') then
    raise exception 't2: post_likes / comment_likes grants are not as intended';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
