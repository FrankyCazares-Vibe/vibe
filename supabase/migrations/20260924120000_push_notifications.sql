-- Push notifications / wave 2′ batch 2A: the database side of ONE push
-- pipeline for browsers (Web Push) and the two store apps (FCM).
-- push_devices says where a student's pushes may go; push_outbox is the queue
-- of "this person should hear about this", one row per recipient.
--
-- Contract: handoffs/wave-plan-pwa/plan.md §7 (2A), as amended by
-- handoffs/wave-plan-pwa/critic-push.md items 4, 23 and 24 (those win).
-- Background: handoffs/wave-plan-pwa/research/code-notifications.md §A, §B, §H.
--
-- WHY THIS EXISTS
--   * Vibe tells nobody anything unless they have it open. Follows, likes and
--     comments become notifications inside SECURITY DEFINER triggers the
--     moment their row lands; mentions and club notices are written by the
--     service role after the route's own checks. No route sees all of them.
--     The notifications table does, so the queue is fed by an AFTER INSERT
--     trigger on it. Direct and group messages never write a notification;
--     the messages route queues those itself (enqueueMessagePush, batch 2D).
--   * The push goes out after the request that caused it has answered, and
--     every safety rule is checked again at send time (blocks, mutes,
--     restrictions, removal, read state). Between the two, the outbox row is
--     the only record that a push is owed. It carries no text at all: the
--     dispatcher reads the source row when it sends, and a deleted comment,
--     message or notification takes its pending push with it (on delete
--     cascade).
--   * One device table for both transports. A store app registers an FCM
--     token; a browser or the Home Screen web app registers a Web Push
--     endpoint and its two keys. The dispatcher builds one neutral message and
--     hands it to whichever transport each device uses.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DOES
--   1. public.push_devices: id, user_id (-> users, on delete cascade),
--      transport ('webpush' | 'fcm'), address (the endpoint or the FCM token,
--      unique), p256dh and auth (required for webpush, null for fcm),
--      platform ('ios-app' | 'android-app' | 'ios-web' | 'android-web' |
--      'desktop-web' | 'other'), app_version, origin, created_at,
--      last_seen_at, last_ok_at, failures.
--   2. public.push_outbox: id, recipient_id (-> users, cascade), source
--      ('notification' | 'message'), notification_id (-> notifications,
--      cascade), message_id (-> messages, cascade), created_at, claimed_at,
--      attempts, sent_at, skipped_reason. Exactly one of the two source ids is
--      set, matching source. unique (notification_id), unique (message_id,
--      recipient_id), and a partial index over the pending rows.
--   3. Row level security on both with zero policies. Every privilege is
--      revoked from anon, authenticated AND service_role, and service_role
--      gets SELECT, INSERT, UPDATE and DELETE back by name (no TRUNCATE).
--      Both keys are uuid, so there is no sequence to revoke.
--   4. public.push_on_notification_insert() and trg_push_on_notification,
--      AFTER INSERT FOR EACH ROW on notifications. It queues a row only when
--      the recipient has a registered device, never for the dead
--      'connection' kind, ON CONFLICT (notification_id) DO NOTHING, and it
--      swallows its own errors with a WARNING carrying the SQLSTATE.
--   5. public.claim_push_outbox(p_limit int) returns setof push_outbox,
--      VOLATILE, SECURITY DEFINER. It refuses anon and authenticated from the
--      inside, closes rows that will never go, claims up to 100 pending rows
--      with FOR UPDATE SKIP LOCKED, and now and then deletes finished rows
--      older than 7 days. EXECUTE is granted to anon, authenticated and
--      service_role (standing rule).
--
-- DOES NOT: add a constraint or an index to notifications (production holds
-- duplicate follow and like rows, 29 follow rows over 25 pairs and 8 like rows
-- over 7, 20260922120000:62-63, so a unique index would fail the file);
-- backfill the outbox (an old notification must never buzz a phone); touch any
-- existing function, trigger, policy, grant or row; revoke EXECUTE on
-- anything. There is no text column on purpose: no message, comment, name or
-- club sits in the queue. skipped_reason is one short word; its vocabulary
-- lives in src/lib/push/dispatch.ts, the CHECK only keeps it a word.
--
-- WHY THESE SHAPES
--   * Grants, not routes, are the boundary (20260906130000). pg_default_acl
--     for schema public (read-only psql on the local stack, 2026-09-24) gives
--     anon, authenticated AND service_role arwdDxtm on every new table, for
--     both postgres and supabase_admin. So the revoke names all three, and the
--     grant line says something true instead of restating a default: the four
--     the routes and the dispatcher use, and not TRUNCATE. This is the
--     account_restrictions shape (20260923090000, section 1).
--   * Zero policies, and no client grant even for "your own devices". An
--     address plus its keys is a bearer capability: whoever holds a Web Push
--     endpoint and its keys can push to that browser. Registration and removal
--     go through /api/me/push-devices with the service role, after the Origin,
--     rate limit, restriction and allowlist gates (critic-push items 21, 22).
--   * address is unique on its own, not per user. A lab computer or a phone
--     that changes hands re-points its one row to whoever registered last, so
--     the previous student's pushes stop landing on a device they no longer
--     hold (plan §7 2B).
--   * address is capped at 2048 characters, not the 4096 critic-push item 23
--     names. A btree entry tops out at 2704 bytes, so a longer random token
--     could never enter the unique index anyway (it fails with 54000); 2048
--     makes that a plain CHECK failure. Real FCM tokens are about 160
--     characters, and Web Push endpoints are held to 1024 (critic-push item
--     20). The FCM token pattern in src/lib/push/device-address.ts should stop
--     at 2048 too.
--   * p256dh and auth are required for webpush and null for fcm, and fcm is
--     exactly the two app platforms: a Web Push row without its keys cannot be
--     encrypted to, and an FCM token on a web platform would be a client lying
--     about what it is.
--   * origin is the site that registered the device, pushSiteOrigin() at
--     registration (critic-push item 21). Vercel Preview shares the production
--     database, so the dispatcher sends only to rows whose origin is the one
--     it is running on. NOT NULL, shaped like an origin (scheme and host, no
--     path), at most 100 characters. app_version at most 40.
--   * The outbox is unique on notification_id, and on (message_id,
--     recipient_id). The trigger fires once per notification, but a replay is
--     then a no-op instead of a second push; enqueueMessagePush inserts with
--     ON CONFLICT DO NOTHING on the pair, so running it twice for one message
--     never doubles a push. A chat @mention notification carries a message_id
--     of its own, but its outbox row is source 'notification' with message_id
--     null; the dispatcher reads notifications.message_id.
--   * Indexes: push_devices (user_id) for the trigger's EXISTS and the
--     dispatcher's device load; push_outbox (recipient_id) for the users
--     cascade; push_outbox (created_at) WHERE sent_at IS NULL AND
--     skipped_reason IS NULL, the only question the claim asks. The message
--     and notification cascades use the two unique indexes.
--   * Everything cascades. Deleting an account removes its devices and its
--     queue; deleting a notification (the student cleared it, an invite was
--     revoked, a club was hidden) or a message removes its pending push. A
--     referential action runs as the owner of the referencing table, so a
--     student deleting their own notification through PostgREST needs no
--     privilege here (LOCAL ACCEPTANCE P8 proves it).
--
-- THE TRIGGER
--   * SECURITY DEFINER with search_path pinned and every name qualified, the
--     idiom of the notify_on_* triggers (20260922120000). Mentions and club
--     notices arrive as service_role, follow/like/comment rows as the
--     notify_on_* owner; definer makes the push side independent of both.
--   * FAILS OPEN: a like, a follow or a mention must never fail because of
--     push. But a swallowed error is also an invisible one, and a privilege or
--     ON CONFLICT mistake would mean no push is ever queued (critic-push item
--     23). So it logs `push_outbox enqueue failed: <SQLSTATE>` as a WARNING
--     (the code only: SQLERRM can quote row values), the post-check below
--     proves the function's owner holds the privileges it uses, and the LOCAL
--     ACCEPTANCE PROBES prove a row appears for every writer family.
--   * 'connection' is skipped: nothing writes it in production
--     (code-notifications.md §A, "Known drift"), and if a writer ever comes
--     back it must not buzz a phone without a decision.
--   * A recipient with no device costs one index probe and nothing else.
--
-- THE CLAIM
--   * VOLATILE, because PostgREST runs STABLE functions in a read-only
--     transaction and the UPDATE would fail.
--   * Refuses anon and authenticated with 42501 from the inside, the
--     rate_limit_hit idiom (20260922090000). The grant stays: a public
--     function without EXECUTE crashes this Postgres image (rulings.md). The
--     REST authenticator can only become anon, authenticated or service_role
--     (pg_auth_members, local, 2026-09-24), so what passes is the service
--     role and direct postgres sessions.
--   * One call, in this order (critic-push item 4): close pending rows that
--     will never go (attempts >= 3: 'gave_up'; older than 30 minutes:
--     'stale'), claim up to least(greatest(p_limit, 1), 100) of the rest,
--     oldest first, setting claimed_at and attempts + 1, and on 1 call in 100
--     delete finished rows older than 7 days (the rate_limit_hit cleanup).
--   * A row claimed less than 2 minutes ago is in flight: it is neither
--     closed nor claimed again. Both row pickers take FOR UPDATE SKIP LOCKED,
--     so two drains running at once (Next runs after() callbacks
--     concurrently, critic-push item 2) take disjoint rows and never wait on
--     each other (LOCAL ACCEPTANCE P12).
--   * What happens to a claimed row afterwards (sent_at, a skipped_reason, or
--     left for re-claim) is the dispatcher's, src/lib/push/dispatch.ts.
--
-- LOCKING. The four foreign keys take SHARE ROW EXCLUSIVE on users,
-- notifications and messages until COMMIT, and CREATE TRIGGER takes it on
-- notifications again: every write to those tables waits for these
-- milliseconds. lock_timeout 5s makes the file fail whole instead of queueing
-- behind a long transaction and stalling every like and message behind it;
-- then simply run it again.
--
-- ---------------------------------------------------------------------------
-- PRODUCTION: code first, this file second (plan §7), and harmless either way
-- while PUSH_ENABLED is unset.
--   * Code first, this file not yet: the push code treats a missing table or
--     function (42P01, PGRST205, PGRST202, 42883) as "push is off"
--     (isMissingPushSchema, critic-push item 25). Nothing 500s.
--   * This file first, code not yet: nothing can register a device, so the
--     trigger's EXISTS is always false and the outbox stays empty.
--   * With both live and PUSH_ENABLED unset, POST /api/me/push-devices refuses
--     (push_unavailable), so again no device and no queue.
--   * Vercel instant-rollback past the wave 2′ code while devices exist: the
--     trigger keeps queueing rows nobody drains. Harmless (no text; the first
--     claim after the code is back closes them as 'stale'), but switch
--     PUSH_ENABLED off first (rulings M9).
-- NUMBERING. The predecessor is 20260923090000 (moderation_foundation),
-- applied to production. 20260922150000 (billing) is on the local copy only;
-- this file does not depend on it. If billing is renumbered into a slot above
-- 20260923090000 before this file lands, that slot becomes this file's
-- predecessor (rulings H2); if this file must land below an applied version,
-- renumber it so `supabase db reset` replays production's order. The only real
-- dependencies are users, notifications and messages.
--
-- LOCAL APPLY (rulings H5; never `supabase db reset`):
--   export PATH="/Applications/Docker.app/Contents/Resources/bin:/usr/local/bin:$PATH"
--   PSQL() { docker exec -i supabase_db_vibe psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
--   PSQL -f - < supabase/migrations/20260924120000_push_notifications.sql
--   PSQL -c "INSERT INTO supabase_migrations.schema_migrations (version, name)
--            VALUES ('20260924120000', 'push_notifications');"
-- (`supabase migration up --local` works too while the local copy is in sync,
-- 75 files and 75 rows on 2026-09-24: it applies this file and records it.)
-- Applied to the local test copy on 2026-09-24 (session 65) with the recipe
-- above, and P1-P13 passed there. NOT applied to production.
--
-- HOW TO APPLY BY HAND (orchestrator only, with Franky's explicit yes, after
-- the wave 2′ code is deployed and Ready).
--   0. PRE-FLIGHT, read-only. STOP on anything you can't explain.
--      a. Version gate (rulings H2): the predecessor present, this version
--         absent. Never gate on max(version): billing is still unapplied.
--           SELECT version FROM supabase_migrations.schema_migrations
--            WHERE version IN ('20260923090000', '20260924120000')
--            ORDER BY 1;
--           -- expect exactly ONE row: 20260923090000.
--           -- 20260924120000 present: already applied. STOP.
--      b. The state this file was written against (the body re-checks the
--         names and aborts otherwise):
--           SELECT to_regclass('public.users'), to_regclass('public.notifications'),
--                  to_regclass('public.messages');              -- three names
--           SELECT to_regclass('public.push_devices'),
--                  to_regclass('public.push_outbox');           -- null, null
--           SELECT to_regprocedure('public.claim_push_outbox(integer)'),
--                  to_regprocedure('public.push_on_notification_insert()');  -- null, null
--           SELECT tgname, tgenabled, pg_get_triggerdef(oid)
--             FROM pg_trigger
--            WHERE tgrelid = 'public.notifications'::regclass AND NOT tgisinternal;
--           -- 0 rows. A row here is a hand-made trigger or a dashboard
--           -- webhook, which is how the `connection` drift happened. STOP and
--           -- read it; the body aborts on it too.
--           SELECT defaclrole::regrole, defaclobjtype, defaclacl
--             FROM pg_default_acl
--            WHERE defaclnamespace = 'public'::regnamespace;
--           -- anon, authenticated and service_role on 'r': why this file
--           -- revokes from all three.
--           SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role';  -- t
--           SELECT count(*) FROM pg_proc p
--            WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--              AND format_type(p.prorettype, null) NOT IN ('trigger', 'event_trigger')
--              AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
--                   OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--           -- 0 (standing rule), or the body aborts: it checks the database
--           -- it lands on, not only what it adds.
--      c. No long transaction to queue behind:
--           SELECT pid, now() - xact_start, state, left(query, 80)
--             FROM pg_stat_activity
--            WHERE xact_start < now() - interval '30 seconds';   -- 0 rows
--      d. The local-stack acceptance for this wave passed, logged in the
--         handoff, and PUSH_ENABLED is unset on Vercel Production.
--   1. Apply with the management-API curl recipe (Supabase MCP execute_sql is
--      read-only). From the repo root, SUPABASE_ACCESS_TOKEN from .env.local,
--      the project ref in supabase/.temp/project-ref. curl, not Python:
--      urllib gets a Cloudflare 1010 block.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260924120000_push_notifications.sql '{query:$q}')"
--      `[]` means success; a JSON error means nothing was applied.
--   2. Record it:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260924120000', 'push_notifications');
--
-- POST-CHECK (read-only; the body also checks all of this and aborts).
--   SELECT c.relname, c.relrowsecurity,
--          (SELECT count(*) FROM pg_policies p
--            WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
--     FROM pg_class c
--    WHERE c.oid IN ('public.push_devices'::regclass, 'public.push_outbox'::regclass);
--   -- both rows: t | 0
--   SELECT r, t,
--          has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS any_table,
--          has_any_column_privilege(r, t, 'SELECT,INSERT,UPDATE,REFERENCES') AS any_column
--     FROM unnest(array['anon', 'authenticated']) r,
--          unnest(array['public.push_devices', 'public.push_outbox']) t;
--   -- four rows, every one f | f
--   SELECT t, p, has_table_privilege('service_role', t, p)
--     FROM unnest(array['public.push_devices', 'public.push_outbox']) t,
--          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p;
--   -- t for the four, f for TRUNCATE, on both
--   SELECT tgname, tgenabled, pg_get_triggerdef(oid)
--     FROM pg_trigger
--    WHERE tgrelid = 'public.notifications'::regclass AND NOT tgisinternal;
--   -- one row: trg_push_on_notification | O | ... AFTER INSERT ... FOR EACH ROW
--   SELECT r, has_function_privilege(r, 'public.claim_push_outbox(integer)', 'EXECUTE')
--     FROM unnest(array['anon', 'authenticated', 'service_role']) r;   -- t, t, t
--   SELECT count(*) FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
--      AND format_type(p.prorettype, null) NOT IN ('trigger', 'event_trigger')
--      AND (NOT has_function_privilege('anon', p.oid, 'EXECUTE')
--           OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE'));
--   -- 0 (standing rule)
--   SMOKE: none on production (rulings M8). Anon REST calls stay out of it
--   too: a refused claim is safe, but it is still a write-path RPC.
--
-- LOCAL ACCEPTANCE PROBES (local stack only, after LOCAL APPLY, on the seed
-- from scripts/local-seed.mjs). P1-P11 are one psql script in one transaction
-- that ends in ROLLBACK, so nothing they write survives. Copy the block and
-- strip the first five characters ("--   ") of each line, then feed it to
-- `PSQL -f -`. Every function is called only by a role that holds EXECUTE
-- (checked first), so none of this can hit the EXECUTE crash.
--   BEGIN;
--   SELECT id AS avery FROM public.users WHERE handle = 'avery_owner' \gset
--   SELECT id AS blake FROM public.users WHERE handle = 'blake_iu' \gset
--   SELECT id AS casey FROM public.users WHERE handle = 'casey_purdue' \gset
--   SELECT id AS emery FROM public.users WHERE handle = 'emery_admin' \gset
--   SELECT id AS post FROM public.posts
--    WHERE user_id = :'avery' AND org_id IS NULL AND removed_at IS NULL LIMIT 1 \gset
--   SELECT id AS club FROM public.orgs ORDER BY created_at LIMIT 1 \gset
--   -- avery has one device; blake has none.
--   INSERT INTO public.push_devices (user_id, transport, address, platform, origin)
--   VALUES (:'avery', 'fcm', 'probe:' || repeat('x', 160), 'ios-app', 'http://localhost:3000');
--   -- P1 follow, user client -> notify_on_connection_insert -> this trigger.
--   -- P6 the same for blake, who has no device: no row.
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', json_build_object('sub', :'emery', 'role', 'authenticated')::text, true);
--   INSERT INTO public.connections (follower_id, following_id) VALUES (:'emery', :'avery');
--   INSERT INTO public.connections (follower_id, following_id) VALUES (:'emery', :'blake');
--   RESET ROLE;
--   -- P2 like, service role (the like route's client).
--   SET LOCAL ROLE service_role;
--   INSERT INTO public.post_likes (post_id, user_id) VALUES (:'post', :'casey');
--   RESET ROLE;
--   -- P3 comment, user client.
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', json_build_object('sub', :'casey', 'role', 'authenticated')::text, true);
--   INSERT INTO public.post_comments (post_id, user_id, content) VALUES (:'post', :'casey', 'probe');
--   RESET ROLE;
--   -- P4 mention and P5 org_invite, service role (mentions.ts, notifyOrg).
--   SET LOCAL ROLE service_role;
--   INSERT INTO public.notifications (user_id, actor_id, type, post_id)
--   VALUES (:'avery', :'casey', 'mention', :'post');
--   INSERT INTO public.notifications (user_id, actor_id, type, org_id)
--   VALUES (:'avery', :'emery', 'org_invite', :'club');
--   RESET ROLE;
--   -- P7 the dead 'connection' kind never queues.
--   INSERT INTO public.notifications (user_id, actor_id, type) VALUES (:'avery', :'casey', 'connection');
--   SELECT string_agg(n.type, ',' ORDER BY n.type) AS queued,
--          count(*) FILTER (WHERE o.recipient_id = :'blake') AS for_blake,
--          bool_and(o.source = 'notification' AND o.message_id IS NULL
--                   AND o.attempts = 0 AND o.claimed_at IS NULL) AS shape_ok
--     FROM public.push_outbox o JOIN public.notifications n ON n.id = o.notification_id;
--   -- comment,follow,like,mention,org_invite | 0 | t
--   -- P8 avery clears her follow notification through her own session: the
--   -- delete works (no privilege on push_outbox needed) and the row goes too.
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', json_build_object('sub', :'avery', 'role', 'authenticated')::text, true);
--   DELETE FROM public.notifications WHERE user_id = :'avery' AND actor_id = :'emery' AND type = 'follow';
--   RESET ROLE;
--   SELECT count(*) AS queued_after_delete FROM public.push_outbox WHERE recipient_id = :'avery';  -- 4
--   -- P9 fails open: with the queue renamed away, a notification still lands.
--   ALTER TABLE public.push_outbox RENAME TO push_outbox_probe;
--   INSERT INTO public.notifications (user_id, actor_id, type, post_id)
--   VALUES (:'avery', :'emery', 'like', :'post');
--   -- INSERT 0 1, and WARNING:  push_outbox enqueue failed: 42P01
--   ALTER TABLE public.push_outbox_probe RENAME TO push_outbox;
--   -- P10 the claim refuses the client roles, from the inside.
--   SELECT has_function_privilege('anon', 'public.claim_push_outbox(integer)', 'EXECUTE')
--      AND has_function_privilege('authenticated', 'public.claim_push_outbox(integer)', 'EXECUTE')
--      AS safe_to_call;   -- t. If f, STOP: calling it would crash the database.
--   SET LOCAL ROLE anon;
--   DO $$ BEGIN PERFORM public.claim_push_outbox(5); RAISE EXCEPTION 'P10: anon was not refused';
--   EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'P10 anon refused'; END $$;
--   RESET ROLE;
--   SET LOCAL ROLE authenticated;
--   DO $$ BEGIN PERFORM public.claim_push_outbox(5); RAISE EXCEPTION 'P10: authenticated was not refused';
--   EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'P10 authenticated refused'; END $$;
--   RESET ROLE;
--   -- P11 the service role claims; a claimed row is in flight for 2 minutes;
--   -- then rows that will never go are closed and the rest are claimed again.
--   SET LOCAL ROLE service_role;
--   SELECT count(*) AS claimed, min(attempts), max(attempts) FROM public.claim_push_outbox(10);  -- 4 | 1 | 1
--   SELECT count(*) AS claimed_again FROM public.claim_push_outbox(10);                            -- 0
--   RESET ROLE;
--   UPDATE public.push_outbox o
--      SET claimed_at = now() - interval '3 minutes',
--          attempts   = CASE WHEN n.type = 'mention' THEN 3 ELSE o.attempts END,
--          created_at = CASE WHEN n.type = 'comment' THEN now() - interval '31 minutes' ELSE o.created_at END
--     FROM public.notifications n
--    WHERE n.id = o.notification_id AND o.recipient_id = :'avery';
--   SET LOCAL ROLE service_role;
--   SELECT count(*) AS reclaimed FROM public.claim_push_outbox(10);                                -- 2
--   RESET ROLE;
--   SELECT n.type, o.attempts, o.skipped_reason
--     FROM public.push_outbox o JOIN public.notifications n ON n.id = o.notification_id
--    ORDER BY n.type;
--   -- comment 1 stale | like 2 | mention 3 gave_up | org_invite 2
--   ROLLBACK;
-- P12 SKIP LOCKED needs two sessions and committed rows, so it runs apart:
--   commit a device for avery and three service-role notifications to her,
--   then in session A `BEGIN; SET LOCAL ROLE service_role; SELECT id FROM
--   public.claim_push_outbox(1); SELECT pg_sleep(8); ROLLBACK;` and within
--   those 8 seconds in session B `SET statement_timeout = '3s'; SET ROLE
--   service_role; SELECT id FROM public.claim_push_outbox(10);`. B answers at
--   once with the other two rows, never A's, and never times out. Then
--   delete the notifications and the device (the outbox rows cascade).
-- P13 over REST, anon key from `supabase status`:
--   POST /rest/v1/rpc/claim_push_outbox {"p_limit":1}, anon key and signed
--   in -> 401/403 with code 42501, never a 503 (the EXECUTE crash).
--   GET /rest/v1/push_devices?select=id and /rest/v1/push_outbox?select=id,
--   anon key and signed in -> 401/403 (42501) or 404 PGRST205, never a 2xx;
--   with the service key -> 200 [].
--
-- ROLLBACK (one transaction; restores ONLY this file's change). Copy the block
-- and strip the first five characters ("--   ") of each line. The trigger goes
-- first, so no notification insert can reach a half-dropped queue; then the
-- functions (claim_push_outbox returns the outbox's row type, so it must go
-- before the table); then the tables. Nothing else references them.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   DROP TRIGGER IF EXISTS trg_push_on_notification ON public.notifications;
--   DROP FUNCTION IF EXISTS public.push_on_notification_insert();
--   DROP FUNCTION IF EXISTS public.claim_push_outbox(integer);
--   DROP TABLE IF EXISTS public.push_outbox;
--   DROP TABLE IF EXISTS public.push_devices;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260924120000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- Switch PUSH_ENABLED off first. Dropping push_devices forgets every
-- registered device; after a re-apply each app or browser registers again on
-- its next open (wave 3′ re-syncs on every open). Nothing a student wrote is
-- lost: the queue holds no text. Dropping a function is not revoking EXECUTE,
-- so the standing-rule count stays 0, and the code reads a missing table or
-- function as "push is off" (critic-push item 25).
-- ---------------------------------------------------------------------------

begin;

-- The foreign keys and the trigger below lock users, notifications and
-- messages until COMMIT. This makes the file fail whole instead of queueing
-- behind a long transaction and holding up every like and message behind it.
set local lock_timeout = '5s';

-- 0. The three tables this file hangs off exist, every name it creates is
--    free, and nothing else fires on notifications yet. A second run stops
--    here.
do $$
declare
  bad text;
begin
  if to_regclass('public.users') is null
     or to_regclass('public.notifications') is null
     or to_regclass('public.messages') is null then
    raise exception 'push: users, notifications or messages is missing; the foreign keys need all three';
  end if;
  if to_regclass('public.push_devices') is not null
     or to_regclass('public.push_outbox') is not null
     or to_regprocedure('public.claim_push_outbox(integer)') is not null
     or to_regprocedure('public.push_on_notification_insert()') is not null then
    raise exception 'push: a push table or function already exists; stop and re-read it';
  end if;
  -- Hand-made triggers and dashboard webhooks are how the `connection` drift
  -- happened (code-notifications.md §A). Anything already firing here must be
  -- read before a second writer joins it.
  select string_agg(tgname, ', ') into bad
    from pg_trigger
   where tgrelid = 'public.notifications'::regclass and not tgisinternal;
  if bad is not null then
    raise exception 'push: notifications already has a trigger (%); stop and read it', bad;
  end if;
end $$;

-- 1. push_devices -------------------------------------------------------------
-- One row per place a student's pushes may go. Written only by
-- /api/me/push-devices (upsert by address) and the dispatcher (last_ok_at,
-- failures, and deleting a device the push service says is gone).
create table public.push_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  transport    text not null,
  address      text not null,
  p256dh       text,
  auth         text,
  platform     text not null,
  app_version  text,
  origin       text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_ok_at   timestamptz,
  failures     integer not null default 0,
  constraint push_devices_address_key unique (address),
  constraint push_devices_transport_check check (transport in ('webpush', 'fcm')),
  constraint push_devices_platform_check check (platform in (
    'ios-app', 'android-app', 'ios-web', 'android-web', 'desktop-web', 'other')),
  -- An FCM token belongs to a store app and only to a store app.
  constraint push_devices_transport_platform_check
    check ((transport = 'fcm') = (platform in ('ios-app', 'android-app'))),
  -- Web Push cannot encrypt without both keys; FCM has none.
  constraint push_devices_keys_check check (
    (transport = 'webpush' and p256dh is not null and auth is not null)
    or (transport = 'fcm' and p256dh is null and auth is null)),
  -- Under btree's 2704-byte entry limit (WHY THESE SHAPES).
  constraint push_devices_address_length check (length(address) between 1 and 2048),
  constraint push_devices_key_lengths check (
    (p256dh is null or length(p256dh) between 1 and 128)
    and (auth is null or length(auth) between 1 and 64)),
  constraint push_devices_app_version_length
    check (app_version is null or length(app_version) between 1 and 40),
  -- An origin, not a URL: scheme, host and an optional port, no path.
  constraint push_devices_origin_shape
    check (length(origin) <= 100 and origin ~ '^https?://[a-z0-9.-]+(:[0-9]{1,5})?$'),
  constraint push_devices_failures_check check (failures >= 0)
);

create index push_devices_user on public.push_devices (user_id);

comment on table public.push_devices is
  'Push v1: where a student''s pushes may go (a Web Push endpoint with its keys, or an FCM token from a store app). address is a bearer capability and unique across accounts: a device that changes hands follows its latest registration. origin = the site that registered it; the dispatcher sends only to its own. Service role only (RLS on, no policies, anon/authenticated revoked).';
comment on column public.push_devices.address is
  'The Web Push endpoint URL or the FCM registration token. Never logged.';
comment on column public.push_devices.origin is
  'pushSiteOrigin() at registration (https://www.connectvibe.app, or http://localhost:3000 in development). Preview shares this database, so the dispatcher filters on it.';

-- 2. push_outbox --------------------------------------------------------------
-- One row per recipient per thing they should hear about. No text: the
-- dispatcher reads the source row at send time. Every row ends with sent_at or
-- a skipped_reason; claim_push_outbox closes the ones the dispatcher never
-- finished.
create table public.push_outbox (
  id              uuid primary key default gen_random_uuid(),
  recipient_id    uuid not null references public.users (id) on delete cascade,
  source          text not null,
  notification_id uuid references public.notifications (id) on delete cascade,
  message_id      uuid references public.messages (id) on delete cascade,
  created_at      timestamptz not null default now(),
  claimed_at      timestamptz,
  attempts        integer not null default 0,
  sent_at         timestamptz,
  skipped_reason  text,
  constraint push_outbox_source_check check (source in ('notification', 'message')),
  -- Exactly one source id, the one source names.
  constraint push_outbox_one_source check (
    (source = 'notification' and notification_id is not null and message_id is null)
    or (source = 'message' and message_id is not null and notification_id is null)),
  constraint push_outbox_attempts_check check (attempts >= 0),
  -- One short word; the vocabulary lives in src/lib/push/dispatch.ts.
  constraint push_outbox_skipped_reason_shape check (skipped_reason ~ '^[a-z_]{1,40}$'),
  -- A replay of the trigger, or a second enqueueMessagePush for the same
  -- message, is a no-op instead of a second push.
  constraint push_outbox_notification_key unique (notification_id),
  constraint push_outbox_message_recipient_key unique (message_id, recipient_id)
);

-- The only question the claim asks: which rows are still owed, oldest first.
create index push_outbox_pending
  on public.push_outbox (created_at)
  where sent_at is null and skipped_reason is null;
-- Deleting an account cascades here by recipient_id.
create index push_outbox_recipient on public.push_outbox (recipient_id);

comment on table public.push_outbox is
  'Push v1: one row per recipient per notification (queued by trg_push_on_notification) or per DM/group message (queued by the messages route). No text at all; the dispatcher re-reads the source and re-checks every safety rule at send time. Claimed only through claim_push_outbox(). Service role only (RLS on, no policies, anon/authenticated revoked).';
comment on column public.push_outbox.skipped_reason is
  'Why this row ended without a send: one lower-case word (stale, gave_up, and the dispatcher''s own reasons in src/lib/push/dispatch.ts).';

-- 3. Access -------------------------------------------------------------------
-- RLS on, zero policies: service_role (BYPASSRLS) is the only way in.
alter table public.push_devices enable row level security;
alter table public.push_outbox enable row level security;

-- pg_default_acl handed anon, authenticated AND service_role arwdDxtm on both
-- tables (WHY THESE SHAPES). Take it all back, then give service_role exactly
-- the four the routes and the dispatcher use. No TRUNCATE for anybody.
revoke all on table public.push_devices, public.push_outbox from anon, authenticated, service_role;
grant select, insert, update, delete on table public.push_devices, public.push_outbox to service_role;

-- 4. The notification trigger ---------------------------------------------------
-- Queues one outbox row when a notification lands for someone with a device.
-- SECURITY DEFINER with every name qualified: the owner (who owns both push
-- tables) does the reading and the writing, whoever inserted the notification.
-- A trigger function returns trigger, so the standing EXECUTE rule does not
-- apply to it and the post-check's function count does not include it.
create function public.push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- The dead kind (no writer in production) never buzzes a phone.
  if new.type = 'connection' then
    return new;
  end if;
  -- FAILS OPEN: a like, a follow or a mention must never fail because of
  -- push. The block is its own subtransaction, so an error here undoes only
  -- the outbox insert. The WARNING carries the SQLSTATE and nothing else
  -- (SQLERRM can quote row values), so a queue that silently stopped filling
  -- still shows up in the Postgres logs.
  begin
    if exists (select 1 from public.push_devices d where d.user_id = new.user_id) then
      insert into public.push_outbox (recipient_id, source, notification_id)
      values (new.user_id, 'notification', new.id)
      on conflict (notification_id) do nothing;
    end if;
  exception when others then
    raise warning 'push_outbox enqueue failed: %', sqlstate;
  end;
  return new;
end;
$$;

comment on function public.push_on_notification_insert() is
  'Push v1: AFTER INSERT on notifications. Queues a push_outbox row when the recipient has a device; skips the dead connection kind; never fails the notification insert (errors become a WARNING with the SQLSTATE).';

create trigger trg_push_on_notification
  after insert on public.notifications
  for each row execute function public.push_on_notification_insert();

-- 5. claim_push_outbox ----------------------------------------------------------
-- The dispatcher's only way to take work. VOLATILE (PostgREST runs a STABLE
-- function read-only and the UPDATEs would fail). Refuses the client roles from
-- the inside, the rate_limit_hit idiom; EXECUTE stays granted (standing rule).
-- A row claimed less than 2 minutes ago is in flight: nothing here touches it.
-- Both row pickers take FOR UPDATE SKIP LOCKED, so drains running at the same
-- time take disjoint rows and never wait on each other.
create function public.claim_push_outbox(p_limit integer default 25)
returns setof public.push_outbox
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- 1. Close the rows that will never go: three attempts spent, or owed for
  --    more than 30 minutes (a push that late is noise). Three attempts wins
  --    the name when both are true.
  update public.push_outbox o
     set skipped_reason = case when o.attempts >= 3 then 'gave_up' else 'stale' end
    from (select p.id
            from public.push_outbox p
           where p.sent_at is null and p.skipped_reason is null
             and (p.claimed_at is null or p.claimed_at < now() - interval '2 minutes')
             and (p.attempts >= 3 or p.created_at < now() - interval '30 minutes')
             for update skip locked) done
   where o.id = done.id;

  -- 2. Now and then, forget finished rows older than a week (the
  --    rate_limit_hit cleanup). Nothing reads them; they only prove a push
  --    went or why it didn't, and a week is enough to debug with.
  if random() < 0.01 then
    delete from public.push_outbox
     where (sent_at is not null or skipped_reason is not null)
       and created_at < now() - interval '7 days';
  end if;

  -- 3. Claim the oldest owed rows, at most 100 per call.
  return query
  update public.push_outbox o
     set claimed_at = now(), attempts = o.attempts + 1
    from (select p.id
            from public.push_outbox p
           where p.sent_at is null and p.skipped_reason is null
             and p.attempts < 3
             and p.created_at >= now() - interval '30 minutes'
             and (p.claimed_at is null or p.claimed_at < now() - interval '2 minutes')
           order by p.created_at
           limit least(greatest(coalesce(p_limit, 25), 1), 100)
             for update skip locked) picked
   where o.id = picked.id
  returning o.*;
  return;
end;
$$;

comment on function public.claim_push_outbox(integer) is
  'Push v1: the dispatcher''s claim. Service role only (refuses anon/authenticated with 42501 inside; EXECUTE stays granted, standing rule). Closes rows that will never go (gave_up, stale), sometimes deletes finished rows older than 7 days, then claims up to 100 owed rows oldest first with FOR UPDATE SKIP LOCKED, setting claimed_at and attempts + 1.';

-- Standing rule (rulings.md): granted to every role that could reach it, and
-- refused inside. A revoke here would be a crash button.
grant execute on function public.claim_push_outbox(integer) to anon, authenticated, service_role;

-- 6. Post-check inside the transaction: any miss aborts the whole file.
do $$
declare
  pd    regclass := to_regclass('public.push_devices');
  po    regclass := to_regclass('public.push_outbox');
  claim regprocedure := to_regprocedure('public.claim_push_outbox(integer)');
  trgfn regprocedure := to_regprocedure('public.push_on_notification_insert()');
  owner name;
  cols  text;
  bad   text;
  n     int;
begin
  if pd is null or po is null or claim is null or trgfn is null then
    raise exception 'push: a table or function is missing';
  end if;

  -- The columns the code is written against (plan §7 2A), in order.
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then ' not null' else '' end, ', ' order by a.attnum)
    into cols
    from pg_attribute a
   where a.attrelid = pd and a.attnum > 0 and not a.attisdropped;
  if cols is distinct from 'id uuid not null, user_id uuid not null, transport text not null, address text not null, p256dh text, auth text, platform text not null, app_version text, origin text not null, created_at timestamp with time zone not null, last_seen_at timestamp with time zone not null, last_ok_at timestamp with time zone, failures integer not null' then
    raise exception 'push: push_devices columns are not the contract''s: %', cols;
  end if;
  select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                    || case when a.attnotnull then ' not null' else '' end, ', ' order by a.attnum)
    into cols
    from pg_attribute a
   where a.attrelid = po and a.attnum > 0 and not a.attisdropped;
  if cols is distinct from 'id uuid not null, recipient_id uuid not null, source text not null, notification_id uuid, message_id uuid, created_at timestamp with time zone not null, claimed_at timestamp with time zone, attempts integer not null, sent_at timestamp with time zone, skipped_reason text' then
    raise exception 'push: push_outbox columns are not the contract''s: %', cols;
  end if;

  -- Four foreign keys, every one ON DELETE CASCADE, to the right tables.
  select count(*) into n
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and c.confdeltype = 'c' and cardinality(c.conkey) = 1
     and ((c.conrelid = pd and a.attname = 'user_id' and c.confrelid = 'public.users'::regclass)
       or (c.conrelid = po and a.attname = 'recipient_id' and c.confrelid = 'public.users'::regclass)
       or (c.conrelid = po and a.attname = 'notification_id' and c.confrelid = 'public.notifications'::regclass)
       or (c.conrelid = po and a.attname = 'message_id' and c.confrelid = 'public.messages'::regclass));
  if n <> 4 or (select count(*) from pg_constraint where conrelid in (pd, po) and contype = 'f') <> 4 then
    raise exception 'push: expected exactly the 4 cascading foreign keys of plan §7 2A, found % matching', n;
  end if;

  -- The unique keys ON CONFLICT relies on, spelled out column by column.
  select count(*) into n
    from pg_constraint c
   where c.contype = 'u'
     and ((c.conrelid = pd and c.conkey = array[(select attnum from pg_attribute where attrelid = pd and attname = 'address')])
       or (c.conrelid = po and c.conkey = array[(select attnum from pg_attribute where attrelid = po and attname = 'notification_id')])
       or (c.conrelid = po and c.conkey = array[(select attnum from pg_attribute where attrelid = po and attname = 'message_id'),
                                                 (select attnum from pg_attribute where attrelid = po and attname = 'recipient_id')]));
  if n <> 3 then
    raise exception 'push: expected unique (address), unique (notification_id) and unique (message_id, recipient_id), found %', n;
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'push_devices_user')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'push_outbox_recipient')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'push_outbox_pending'
                     and indexdef like '%WHERE ((sent_at IS NULL) AND (skipped_reason IS NULL))') then
    raise exception 'push: an index is missing (push_devices_user, push_outbox_recipient, push_outbox_pending)';
  end if;

  -- RLS on, zero policies, and the service role gets past RLS.
  select string_agg(c.relname, ', ') into bad
    from pg_class c
   where c.oid in (pd, po) and not c.relrowsecurity;
  if bad is not null then
    raise exception 'push: row level security is off on: %', bad;
  end if;
  select count(*) into n
    from pg_policies
   where schemaname = 'public' and tablename in ('push_devices', 'push_outbox');
  if n <> 0 then
    raise exception 'push: expected zero policies on the push tables, found %', n;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role' and rolbypassrls) then
    raise exception 'push: service_role lacks BYPASSRLS, so it could not read tables with zero policies';
  end if;

  -- anon and authenticated hold nothing, by table or by column, and the raw
  -- ACLs name neither of them nor PUBLIC (grantee 0), which also catches
  -- privileges the calls don't name (MAINTAIN on Postgres 17).
  select string_agg(format('%s on %s', r, t), '; ') into bad
    from unnest(array['anon', 'authenticated']) r,
         unnest(array['public.push_devices', 'public.push_outbox']) t
   where has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(r, t, 'SELECT,INSERT,UPDATE,REFERENCES');
  if bad is not null then
    raise exception 'push: a client role still holds a table or column privilege: %', bad;
  end if;
  select string_agg(format('%s: %s', c.relname, x.privilege_type), ', ') into bad
    from pg_class c, aclexplode(c.relacl) x
   where c.oid in (pd, po)
     and x.grantee in (0::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid);
  if bad is not null then
    raise exception 'push: anon, authenticated or PUBLIC is still in an ACL: %', bad;
  end if;

  -- service_role holds exactly the four, one by one, and not TRUNCATE.
  select string_agg(format('%s %s', p, t), '; ') into bad
    from unnest(array['public.push_devices', 'public.push_outbox']) t,
         unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
   where not has_table_privilege('service_role', t, p);
  if bad is not null then
    raise exception 'push: service_role is missing: %', bad;
  end if;
  if has_table_privilege('service_role', pd, 'TRUNCATE') or has_table_privilege('service_role', po, 'TRUNCATE') then
    raise exception 'push: service_role still holds TRUNCATE on a push table';
  end if;

  -- The trigger: the only one on notifications besides the foreign keys',
  -- enabled, AFTER INSERT, FOR EACH ROW, calling this file's function.
  -- tgtype bits: 1 = ROW, 2 = BEFORE, 4 = INSERT, 64 = INSTEAD; 5 is exactly
  -- AFTER INSERT FOR EACH ROW.
  select string_agg(tgname, ', ') into bad
    from pg_trigger
   where tgrelid = 'public.notifications'::regclass and not tgisinternal
     and not (tgname = 'trg_push_on_notification' and tgenabled = 'O'
              and tgtype = 5 and tgfoid = trgfn);
  if bad is not null or not exists (select 1 from pg_trigger
                                     where tgrelid = 'public.notifications'::regclass
                                       and tgname = 'trg_push_on_notification') then
    raise exception 'push: notifications must carry exactly trg_push_on_notification (AFTER INSERT, FOR EACH ROW, enabled); other: %', bad;
  end if;

  -- Both functions: SECURITY DEFINER with search_path pinned; the claim
  -- VOLATILE and returning the outbox's rows.
  select string_agg(p.proname, ', ') into bad
    from pg_proc p
   where p.oid in (claim, trgfn)
     and not (p.prosecdef and p.proconfig @> array['search_path=public']);
  if bad is not null then
    raise exception 'push: not SECURITY DEFINER with search_path=public: %', bad;
  end if;
  if not exists (select 1 from pg_proc p
                  where p.oid = claim and p.provolatile = 'v' and p.proretset
                    and p.prorettype = 'public.push_outbox'::regtype) then
    raise exception 'push: claim_push_outbox must be VOLATILE and return setof public.push_outbox';
  end if;

  -- The trigger runs as its owner and swallows its errors, so a missing
  -- privilege would only ever be a WARNING. Prove the owner has what it uses.
  select p.proowner::regrole::name into owner from pg_proc p where p.oid = trgfn;
  if not (has_table_privilege(owner, pd, 'SELECT')
          and has_table_privilege(owner, po, 'INSERT')
          and has_table_privilege(owner, po, 'SELECT')) then
    raise exception 'push: the trigger''s owner (%) cannot read push_devices or write push_outbox', owner;
  end if;

  -- The claim is callable by every role that could reach it (and refuses the
  -- client roles inside).
  select string_agg(r, ', ') into bad
    from unnest(array['anon', 'authenticated', 'service_role']) r
   where not has_function_privilege(r, claim, 'EXECUTE');
  if bad is not null then
    raise exception 'push: claim_push_outbox must be EXECUTE-able by anon, authenticated and service_role; missing: %', bad;
  end if;

  -- Standing rule (rulings.md): no public, non-trigger function denies
  -- EXECUTE to anon or authenticated, anywhere in the database it lands on.
  select count(*) into n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and format_type(p.prorettype, null) not in ('trigger', 'event_trigger')
     and (not has_function_privilege('anon', p.oid, 'EXECUTE')
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n <> 0 then
    raise exception 'push: % public functions deny EXECUTE (standing rule)', n;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
