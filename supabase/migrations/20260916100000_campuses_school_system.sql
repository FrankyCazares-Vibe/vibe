-- Plan 2026-09-15 (handoffs/2026-09-15-indy-campus-onboarding-plan.md) §5.1,
-- migration M1: the campus model. One `campuses` table, the verified
-- university on the user (`users.school_system`), the chosen home campus
-- (`users.campus_id`) and its change clock (`users.campus_set_at`), a campus
-- and registry for orgs, and a campus + university stamped onto every post by
-- the database rather than by the client.
--
-- WHAT IT DOES
--   1. public.campuses: 11 seed rows (§2.3). Two rows are SHARED by both
--      universities: `indianapolis` {iu,purdue} (the only open campus) and
--      `fort-wayne` {iu,purdue} (closed). Franky's Q4 answer, 2026-09-15.
--      Everyone signed in (and anon) can read the list; nobody but the
--      service role can write it.
--   2. public.users + school_system ('iu'|'purdue', set by the server at
--      school-email verification), campus_id (FK campuses, on update
--      cascade) and campus_set_at. `authenticated` gets SELECT on
--      school_system and campus_id, exactly like users.school today. No
--      UPDATE grant on any of the three: only the service role writes them.
--      Trigger users_campus_in_system rejects every (campus_id, school_system)
--      pair the campuses row does not allow, including a campus with no
--      system, with `campus_not_in_system` (SQLSTATE 23514). Nothing in the
--      database touches campus_set_at, so it survives a school_system change
--      (critic B3: swapping @iu.edu for @purdue.edu must not reset the 30-day
--      rule).
--   3. public.orgs + campus_id (FK, on update cascade) and system
--      ('iu'|'purdue'|null = neither). No new grant: authenticated already has
--      table-level SELECT on orgs, and orgs UPDATE is per-column, so the new
--      columns get none (critic D3).
--   4. public.posts + campus_id (FK, on update cascade) and school_system.
--      Backfilled from the authors. Trigger posts_stamp_campus overwrites both
--      on INSERT and pins both on UPDATE.
--
-- CHANGES FROM THE §5.1 DRAFT (and why)
--   * Q4: `fort-wayne` is ONE shared row {iu,purdue}. The other §2.3 rows are
--     unchanged.
--   * Critic A5, tightened past the critic's own fix. The draft took the
--     org's campus for any org_id. Live posts_insert_authenticated only checks
--     (auth.uid() = user_id AND has_recorded_consent()), so a direct PostgREST
--     insert naming any org's id would have stamped the post onto that org's
--     campus. The critic suggested is_org_member(), but membership is free:
--     org_members_insert (20260903100000_security_hardening.sql:111-121) lets
--     any signed-in student insert themselves as 'member' of any PUBLIC org,
--     /api/orgs/[slug]/join (route.ts:62-66) does the same with the service
--     role, and request approval (requests/[id]/route.ts:91) also grants
--     'member'. With is_org_member, joining a public Bloomington or West
--     Lafayette org would be enough to post onto that campus and university.
--     The trigger now takes the org's campus only when
--     public.org_member_role(new.org_id, new.user_id) IN ('owner','admin'),
--     the same rule as the only legitimate org-post writer
--     (orgs/[slug]/posts/route.ts:66). Reaching admin needs an existing
--     owner (org_members_update WITH CHECK, hardening :123-133). Everyone
--     else gets the author's campus. org_member_role(oid uuid, uid uuid) is
--     LANGUAGE sql, SECURITY DEFINER, STABLE, search_path=public
--     (20260507110000_org_channels_helpers_rls.sql:25-35; nothing later
--     redefines it).
--     Residual for the TS side: authenticated has no INSERT on orgs (hardening
--     :64), so only the service role creates orgs. The org-create route must
--     take orgs.campus_id / system from the CREATOR's row, never from the
--     request body. Otherwise a student could create an org on any campus,
--     become its owner, and post there.
--   * Critic A6: the draft pinned campus_id on every UPDATE, which would
--     reject the ON UPDATE CASCADE from renaming a campuses.id. On UPDATE the
--     trigger now returns early when pg_trigger_depth() > 1 AND the post's old
--     campus id no longer exists in campuses. That is the cascade (the FK
--     blocks deleting a referenced campus, so a vanished old id can only
--     mean a rename). Any other nested UPDATE stays pinned, so a future
--     trigger chain can't become a way to move posts.
--   * Critic A7: new posts.school_system (check iu/purdue), stamped the same
--     way and pinned the same way, so posts with no campus can still be
--     filtered by university. It is backfilled from the authors. Source rule
--     on INSERT: if the post takes the org's campus, the university is
--     coalesce(org.system, author.school_system). Otherwise it is
--     coalesce(author.school_system, org.system), where the org only counts
--     when the author is its owner or admin.
--   * Critic B3: nothing here resets campus_set_at on a system change.
--   * Supabase default privileges (read live, pg_default_acl): every new
--     table in public is auto-granted arwdDxtm to anon and authenticated, and
--     every new function EXECUTE to anon and authenticated. The draft's
--     "grant select ... no write grants" would have left INSERT/UPDATE/DELETE
--     on campuses granted. This file does REVOKE ALL on campuses first, then
--     grants SELECT. On the trigger functions it revokes from PUBLIC and anon,
--     the same as the hardening pass did for bump_org_activity_from_post.
--     Trigger functions can't be called over RPC anyway.
--   * campuses.systems also refuses a duplicate ('{iu,iu}').
--   * An index on each new FK column (users/orgs/posts.campus_id): scoped
--     reads filter on them, and a rename cascade scans them.
--   * `users_campus_in_system` also fires on INSERT (the draft already said
--     so). handle_new_user inserts campus_id null, so it never raises there.
--   * The campus backfill also requires school_system IS NOT NULL. A student
--     who PATCHes users.school = 'IU Indianapolis' before apply (still
--     UPDATE-granted until M2) would otherwise make the backfill raise
--     campus_not_in_system and abort all of M1. Such rows stay campus-less
--     and get prompted, which is the settled rule.
--   * `set local lock_timeout = '5s'`. M1 takes ACCESS EXCLUSIVE on users,
--     orgs and posts in turn and holds each until COMMIT. Without a timeout,
--     an ALTER waiting behind a long reader would queue every later users /
--     orgs / posts query behind it, stalling every page. With it, a contended
--     apply aborts cleanly with nothing changed. Just retry.
--   * A required CATCH-UP step and a documented RESTAMP recipe (below).
--     Nothing in the database derives school_system; the server stamps it at
--     verification.
--
-- LIVE STATE BEFORE THIS MIGRATION (read-only catalog SELECTs, 2026-09-15)
--   * to_regclass('public.campuses') = NULL; latest schema_migrations
--     version = 20260912102000. No public function named posts_stamp_campus
--     or users_campus_in_system.
--   * Triggers: public.users none; public.orgs none; public.posts only
--     bump_org_activity_on_post (AFTER INSERT, bump_org_activity_from_post:
--     reads NEW.org_id / NEW.created_at, updates orgs.last_activity_at).
--     auth.users: on_auth_user_created -> handle_new_user (inserts id, email,
--     handle, name, terms columns only).
--   * ACLs: users authenticated=dDxtm (no table SELECT/UPDATE; per-column
--     grants, school = rw, school_email none); orgs authenticated=rdDxtm
--     (table SELECT; per-column UPDATE incl. school); posts anon AND
--     authenticated = arwdDxtm (full table grants, so column grants/revokes
--     on posts are meaningless and the trigger is the only boundary there).
--   * Policies: posts_insert_authenticated WITH CHECK ((auth.uid() = user_id)
--     AND has_recorded_consent()); posts_update_own USING (auth.uid() =
--     user_id) WITH CHECK ((auth.uid() = user_id) AND has_recorded_consent());
--     users_update_self (auth.uid() = id); orgs_update owner/admin.
--   * Nothing depends on the posts row type: no views, no function takes or
--     returns it, and posts is in no publication.
--   * Counts: users 18; users that would get school_system='iu' 14 (all
--     verified, domain exactly iu.edu); school_email null 4; school = 'IU
--     Indianapolis' 7, 0 of them not verified iu.edu; Purdue-looking emails
--     0; orgs 5; posts 19; posts by 'IU Indianapolis' authors 9; posts by
--     the 14 IU-verified authors 19; posts with org_id 0.
--   * The Supabase MCP was unreachable during the review/repair pass (every
--     query, even `select 1`, failed). The org_member_role and
--     org_members_insert facts above come from the repo migrations, which
--     are the source of those live objects. Re-check in pre-flight step 0.
--
-- RUNS ONCE. Not idempotent: CREATE TABLE / ADD COLUMN / CREATE TRIGGER
-- without IF NOT EXISTS. A second run fails on the first statement, and the
-- whole BEGIN/COMMIT block rolls back, changing nothing. Don't "fix" that by
-- adding IF NOT EXISTS: the backfills and seed inserts are meant to run once.
--
-- DEPLOY ORDER (plan §5.5), only with Franky's go-ahead:
--   1. UPDATED 2026-09-15 after wave 1b: wave 1 is safe in EITHER order.
--      school-email-apply.ts and onboarding-step fall back when these columns
--      don't exist yet (the check only matches missing-column errors that
--      name school_system / campus_id / campus_set_at). Recommended order:
--        a. push wave 1 (verification keeps working; school_system isn't
--           stamped while M1 is absent);
--        b. apply THIS FILE with Franky's go-ahead — its one-time backfill
--           stamps every verified iu.edu row, which covers everyone who
--           verified during (a);
--        c. run the CATCH-UP block anyway (idempotent; it's a no-op when
--           there was no gap).
--      Old code is unaffected by M1 (see WHY THIS IS SAFE). Before applying,
--      and again before each push, run:
--        rg -n "school_system|campus_id|campus_set_at" src public/html
--      Any NEW writer of these columns must keep a missing-column fallback
--      until this file is applied.
--   2. REQUIRED CATCH-UP, once the deploy that makes school-email-apply stamp
--      school_system is READY on Vercel (gh api .../deployments). The backfill
--      below runs exactly once. Every student who verifies between this apply
--      and that deploy keeps school_system = NULL: they can't pick any campus
--      (users_campus_in_system), and every post they make is stamped
--      school_system NULL and then pinned. Run the CATCH-UP block below. It
--      is idempotent, so run it again after any later gap. The onboarding-step
--      log line "verified user without school_system" means a gap happened.
--   3. Wave 2 (reads/writes campus_id) ships after 1; then M2 and M1b.
--   * CHECK THE CAMPUS IDS MATCH THE CODE. The seed ids here must equal
--     CAMPUS_ROWS in src/lib/iu/campuses.ts. A campus id the code writes
--     that isn't seeded fails the FK (23503), and a rename can't split one
--     row into two or merge two into one. Checked 2026-09-15 (working tree):
--     campuses.ts has ONE `fort-wayne` {iu,purdue} sort 10, and
--     campuses.test.ts:132 asserts campusRowById("iu-fort-wayne") === null.
--     They match. Re-diff before wave 2:
--       rg -n "id: \"" src/lib/iu/campuses.ts
--
-- WHY THIS IS SAFE WITH THE CODE DEPLOYED TODAY (checked 2026-09-15)
--   * New columns are all nullable with no default. Every existing INSERT
--     and UPDATE keeps working, and ADD COLUMN on 18/5/19-row tables holds
--     its ACCESS EXCLUSIVE lock for milliseconds (lock_timeout 5s bounds the
--     wait to acquire it).
--   * users_campus_in_system: fires on INSERT and on UPDATE OF campus_id,
--     school_system. Deployed code never names those columns (they don't
--     exist), and handle_new_user inserts campus_id null, which returns
--     before any lookup. So it can't raise for today's writes.
--   * posts_stamp_campus DOES fire on every posts INSERT and UPDATE. Checked
--     against every current writer:
--       - /api/me/publish-post (user client INSERT) and
--         /api/orgs/[slug]/posts (service client INSERT, after an owner/admin
--         org_members check, the same rule the trigger now uses), plus
--         /api/posts/[id] PATCH (user client UPDATE). All three use explicit
--         .select("id, user_id, ...") column lists, so RETURNING shapes don't
--         change. The new columns never appear in their responses.
--       - record_post_view (SECURITY DEFINER RPC: UPDATE posts SET view_count
--         = view_count + 1). The UPDATE branch only copies two OLD values,
--         with no query unless the call is nested AND campus_id changed.
--       - RLS: both WITH CHECKs test only user_id and has_recorded_consent().
--         The trigger never changes user_id, so they evaluate the same as
--         today. RLS WITH CHECK runs after BEFORE triggers.
--       - bump_org_activity_on_post (AFTER INSERT) reads NEW.org_id and
--         NEW.created_at, which the trigger doesn't touch.
--       - The trigger never raises. Its lookups are SELECT INTO (no row ->
--         NULL) and org_member_role (STABLE; a non-member gives NULL, and
--         NULL IN (...) is not true). The value it stamps always satisfies
--         the new FK, because it's copied from users.campus_id /
--         orgs.campus_id, which carry the same FK. It is SECURITY DEFINER,
--         so it doesn't depend on the caller's column grants on users/orgs or
--         EXECUTE on org_member_role.
--       - No views, functions or publications depend on the posts row type.
--   * PostgREST picks up the new columns by itself (pgrst_ddl_watch event
--     trigger).
--
-- HOW TO APPLY BY HAND. The Supabase MCP execute_sql is read-only, and
-- `supabase db push` needs the DB password, which is not on this machine.
--   0. Pre-flight (read-only; the MCP execute_sql is fine). Stop if these
--      differ in a way you can't explain (new signups can raise the counts):
--        SELECT to_regclass('public.campuses') AS campuses,        -- NULL
--          (SELECT max(version) FROM supabase_migrations.schema_migrations) AS latest, -- 20260912102000
--          (SELECT count(*) FROM public.users) AS users,           -- 18
--          (SELECT count(*) FROM public.users WHERE school_verified AND school_email IS NOT NULL
--             AND (split_part(lower(school_email),'@',2) IN ('iu.edu','iupui.edu')
--                  OR split_part(lower(school_email),'@',2) LIKE '%.iu.edu')) AS iu_verified, -- 14
--          (SELECT count(*) FROM public.users WHERE school = 'IU Indianapolis') AS indy,     -- 7
--          (SELECT count(*) FROM public.users WHERE school = 'IU Indianapolis'
--             AND NOT (school_verified AND split_part(lower(coalesce(school_email,'')),'@',2) = 'iu.edu')) AS indy_not_iu, -- 0 (information only: these rows are skipped by the campus backfill and stay campus-less)
--          (SELECT count(*) FROM public.posts) AS posts,           -- 19
--          (SELECT count(*) FROM public.posts WHERE org_id IS NOT NULL) AS org_posts, -- 0
--          (SELECT pg_get_functiondef('public.org_member_role(uuid,uuid)'::regprocedure)
--             ~* 'security definer') AS role_fn_definer;           -- t
--   1. From the repo root, with SUPABASE_ACCESS_TOKEN exported from
--      .env.local (the project ref is in supabase/.temp/project-ref). Use
--      curl, not Python: urllib gets a Cloudflare 1010 block.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260916100000_campuses_school_system.sql '{query:$q}')"
--      A JSON error means nothing was applied (single transaction). `[]`
--      means success. "canceling statement due to lock timeout" means a long
--      reader held a lock: nothing changed, retry in a minute.
--   2. Record it so `db push` stays in sync. Send the same way: save to a
--      scratch .sql file and point --rawfile at it. No statements array,
--      because this file contains dollar-quoted function bodies:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260916100000', 'campuses_school_system');
--   3. Verify (read-only; the MCP execute_sql is fine). Use pg_catalog and
--      has_*_privilege, not information_schema. The MCP role
--      (supabase_read_only_user) sees 0 rows in
--      information_schema.column_privileges for these tables.
--      a. SELECT count(*) AS campuses, count(*) FILTER (WHERE is_open) AS open,
--                count(*) FILTER (WHERE cardinality(systems) = 2) AS shared
--           FROM public.campuses;
--         -- expect 11 | 1 | 2
--         SELECT id, systems, is_open, sort FROM public.campuses ORDER BY sort, id;
--         -- expect: indianapolis {iu,purdue} t 0 | fort-wayne {iu,purdue} f 10 |
--         --   iu-bloomington {iu} f 20 | purdue-west-lafayette {purdue} f 20 |
--         --   iu-columbus, iu-east, iu-kokomo, iu-northwest, iu-south-bend,
--         --   iu-southeast {iu} f 30 | purdue-northwest {purdue} f 30
--      b. SELECT school_system, count(*) FROM public.users GROUP BY 1 ORDER BY 1;
--         -- expect iu 14 | NULL 4
--      c. SELECT count(*) FILTER (WHERE campus_id = 'indianapolis') AS indy,
--                count(*) FILTER (WHERE campus_id IS NOT NULL) AS any_campus,
--                count(*) FILTER (WHERE campus_set_at IS NOT NULL) AS set_at
--           FROM public.users;
--         -- expect 7 | 7 | 0   (minus pre-flight indy_not_iu; backfilled rows
--         --   get the one-time confirm card)
--      d. SELECT count(*) AS posts, count(campus_id) AS with_campus,
--                count(*) FILTER (WHERE campus_id = 'indianapolis') AS indy,
--                count(school_system) AS with_system,
--                count(*) FILTER (WHERE school_system = 'iu') AS iu
--           FROM public.posts;
--         -- expect 19 | 9 | 9 | 19 | 19
--      e. SELECT count(campus_id), count(system) FROM public.orgs;
--         -- expect 0 | 0   (M1b applies Franky's org list later)
--      f. SELECT c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
--           FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--          WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
--            AND c.relname IN ('users','posts','orgs','campuses') ORDER BY 1, 2;
--         -- expect exactly 3 rows, all tgenabled = O:
--         --   posts | bump_org_activity_on_post | AFTER INSERT ...
--         --   posts | posts_stamp_campus | BEFORE INSERT OR UPDATE ON public.posts FOR EACH ROW ...
--         --   users | users_campus_in_system | BEFORE INSERT OR UPDATE OF campus_id, school_system ON public.users FOR EACH ROW ...
--      g. SELECT
--           has_column_privilege('authenticated','public.users','school_system','SELECT'), -- t
--           has_column_privilege('authenticated','public.users','campus_id','SELECT'),     -- t
--           has_column_privilege('authenticated','public.users','campus_set_at','SELECT'), -- f
--           has_column_privilege('authenticated','public.users','school_system','UPDATE'), -- f
--           has_column_privilege('authenticated','public.users','campus_id','UPDATE'),     -- f
--           has_column_privilege('authenticated','public.users','campus_set_at','UPDATE'), -- f
--           has_column_privilege('anon','public.users','campus_id','SELECT'),              -- f
--           has_column_privilege('authenticated','public.orgs','campus_id','SELECT'),      -- t
--           has_column_privilege('authenticated','public.orgs','campus_id','UPDATE'),      -- f
--           has_column_privilege('authenticated','public.orgs','system','UPDATE'),         -- f
--           has_table_privilege('anon','public.campuses','SELECT'),                        -- t
--           has_table_privilege('authenticated','public.campuses','SELECT'),               -- t
--           has_table_privilege('authenticated','public.campuses','INSERT'),               -- f
--           has_table_privilege('authenticated','public.campuses','UPDATE'),               -- f
--           has_table_privilege('authenticated','public.campuses','DELETE'),               -- f
--           has_table_privilege('anon','public.campuses','INSERT');                        -- f
--         (users.school UPDATE stays t until M2.) These checks are the
--         authoritative grant test; step h is a cross-check.
--      h. SELECT relrowsecurity, pg_get_userbyid(relowner) AS owner, relacl
--           FROM pg_class WHERE oid = 'public.campuses'::regclass;
--         -- expect t | <owner> | an aclitem[] in which anon and authenticated
--         --   appear exactly as `anon=r/<owner>` and `authenticated=r/<owner>`
--         --   (aclitem prints `grantee=privs/grantor`; no a, w or d for
--         --   either). The owner and service_role entries keep arwdDxtm.
--         --   Entry order may differ (REVOKE ALL removes the default entries
--         --   and GRANT re-appends them).
--         SELECT policyname, cmd, roles, qual FROM pg_policies
--          WHERE schemaname = 'public' AND tablename = 'campuses';
--         -- expect one row: campuses_select_all | SELECT | {anon,authenticated} | true
--      i. SELECT proname, prosecdef, pg_get_functiondef(oid) ~ 'org_member_role' AS officer_rule
--           FROM pg_proc
--          WHERE pronamespace = 'public'::regnamespace
--            AND proname IN ('posts_stamp_campus','users_campus_in_system') ORDER BY 1;
--         -- expect posts_stamp_campus t t | users_campus_in_system f f
--      j. SELECT max(version) FROM supabase_migrations.schema_migrations;
--         -- expect 20260916100000
--   4. Live: publish a post from the phone and edit its caption, then open the
--      feed and a profile. Nothing looks different (old code doesn't read the
--      new columns). Then confirm with SELECT that the new post has
--      campus_id / school_system matching your own row.
--   5. Negative tests (trigger raises, pinning, A5 incl. the join path,
--      A6/A7, the backfill guard, catch-up + restamp, grants): run
--      m1-tests/negative-tests.sql from the session scratchpad on a Supabase
--      branch or local stack. NEVER on prod. Copy it next to this file if it
--      should be kept.
--
-- CATCH-UP (DEPLOY ORDER step 2; REQUIRED; idempotent; a write, so Franky's
-- go-ahead and the same curl recipe as step 1 from a scratch .sql file).
-- Run it once the school_system-stamping deploy is READY, so no new gap can
-- open behind it. If PURDUE_SIGNUPS_ENABLED is already true, stop and add
-- the Purdue domains to the first UPDATE before running.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   UPDATE public.users SET school_system = 'iu'
--    WHERE school_system IS NULL
--      AND school_verified AND school_email IS NOT NULL
--      AND (split_part(lower(school_email),'@',2) IN ('iu.edu','iupui.edu')
--           OR split_part(lower(school_email),'@',2) LIKE '%.iu.edu');
--   ALTER TABLE public.posts DISABLE TRIGGER posts_stamp_campus;
--   UPDATE public.posts p
--      SET school_system = u.school_system
--     FROM public.users u
--    WHERE u.id = p.user_id
--      AND p.school_system IS NULL
--      AND u.school_system IS NOT NULL;
--   ALTER TABLE public.posts ENABLE TRIGGER posts_stamp_campus;
--   COMMIT;
-- campus_id is deliberately NOT restamped. A post whose author had no
-- school_system was made with no campus, because users_campus_in_system
-- forbids a campus without a system. So NULL is exactly what the trigger
-- stamped. Copying the author's CURRENT campus would move it onto a campus
-- it wasn't posted to (A7: old posts keep their campus).
-- Verify (read-only):
--   SELECT
--     (SELECT count(*) FROM public.users WHERE school_verified AND school_system IS NULL) AS verified_no_system, -- 0
--     (SELECT count(*) FROM public.posts p JOIN public.users u ON u.id = p.user_id
--       WHERE p.school_system IS NULL AND u.school_system IS NOT NULL) AS posts_gap,                          -- 0
--     (SELECT tgenabled FROM pg_trigger WHERE tgrelid = 'public.posts'::regclass
--       AND tgname = 'posts_stamp_campus') AS stamp_trigger;                                                   -- O
--   If verified_no_system > 0, see which domains they are (no identities):
--     SELECT split_part(lower(school_email),'@',2) AS domain, count(*) FROM public.users
--      WHERE school_verified AND school_system IS NULL GROUP BY 1;
--
-- RESTAMPING POSTS ON PURPOSE. posts_stamp_campus pins campus_id and
-- school_system on every UPDATE, including the service role's, so a plain
-- UPDATE silently changes nothing. The ONLY sanctioned way to restamp posts
-- (the catch-up above, legacy posts, M1b if org posts exist by then;
-- 0 today) is the shape above:
--   one transaction; SET LOCAL lock_timeout; ALTER TABLE public.posts DISABLE
--   TRIGGER posts_stamp_campus; UPDATE with an explicit WHERE; ALTER TABLE
--   ... ENABLE TRIGGER posts_stamp_campus; COMMIT; then check tgenabled = 'O'.
-- DDL is transactional, so an error anywhere rolls the DISABLE back too.
-- The trigger can't be left off by a failed run. Never use
-- SET session_replication_role = replica for this: it also turns off the FK
-- cascade triggers and every other trigger in the session. Never leave the
-- trigger disabled across a COMMIT.
--
-- ROLLBACK. Roll back wave 2 code and M2 first: wave 2 reads and writes
-- these columns. Roll back the school_system-stamping deploy too: it
-- would fail with the columns gone. Wave 1's onboarding-step tolerates their
-- absence. This loses every campus pick and school_system stamp. The
-- dual-written legacy users.school / orgs.school labels survive. Dropping a
-- column drops its index and grants.
--   BEGIN;
--   SET LOCAL lock_timeout = '5s';
--   DROP TRIGGER IF EXISTS posts_stamp_campus ON public.posts;
--   DROP FUNCTION IF EXISTS public.posts_stamp_campus();
--   DROP TRIGGER IF EXISTS users_campus_in_system ON public.users;
--   DROP FUNCTION IF EXISTS public.users_campus_in_system();
--   ALTER TABLE public.posts DROP COLUMN IF EXISTS school_system, DROP COLUMN IF EXISTS campus_id;
--   ALTER TABLE public.orgs  DROP COLUMN IF EXISTS system, DROP COLUMN IF EXISTS campus_id;
--   ALTER TABLE public.users DROP COLUMN IF EXISTS campus_set_at, DROP COLUMN IF EXISTS campus_id,
--                            DROP COLUMN IF EXISTS school_system;
--   DROP TABLE IF EXISTS public.campuses;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260916100000';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- Fail fast instead of queueing every users/orgs/posts query behind M1.
set local lock_timeout = '5s';

-- 1. campuses ----------------------------------------------------------------
create table public.campuses (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name        text not null,
  short_name  text not null,
  city        text not null,
  systems     text[] not null
              check (cardinality(systems) between 1 and 2
                     and systems <@ array['iu','purdue']::text[]
                     and systems[1] is distinct from systems[2]),
  is_open     boolean not null default false,
  sort        int not null default 100,
  created_at  timestamptz not null default now()
);
comment on table public.campuses is
  'Campus communities (plan 2026-09-15 §2). A row whose systems has both iu and purdue is ONE shared community (indianapolis, fort-wayne); the badge comes from users.school_system. Service role writes only.';

alter table public.campuses enable row level security;
create policy campuses_select_all on public.campuses
  for select to anon, authenticated using (true);

-- Supabase default privileges auto-grant arwdDxtm on new public tables to
-- anon and authenticated. Take them all back, then give read only.
revoke all on table public.campuses from anon, authenticated;
grant select on table public.campuses to anon, authenticated;

insert into public.campuses (id, name, short_name, city, systems, is_open, sort) values
 ('indianapolis',          'Indianapolis',          'Indianapolis',   'Indianapolis',        '{iu,purdue}', true,  0),
 ('fort-wayne',            'Fort Wayne',            'Fort Wayne',     'Fort Wayne',          '{iu,purdue}', false, 10),
 ('iu-bloomington',        'IU Bloomington',        'Bloomington',    'Bloomington',         '{iu}',        false, 20),
 ('iu-columbus',           'IU Columbus',           'Columbus',       'Columbus',            '{iu}',        false, 30),
 ('iu-east',               'IU East',               'East',           'Richmond',            '{iu}',        false, 30),
 ('iu-kokomo',             'IU Kokomo',             'Kokomo',         'Kokomo',              '{iu}',        false, 30),
 ('iu-northwest',          'IU Northwest',          'Northwest',      'Gary',                '{iu}',        false, 30),
 ('iu-south-bend',         'IU South Bend',         'South Bend',     'South Bend',          '{iu}',        false, 30),
 ('iu-southeast',          'IU Southeast',          'Southeast',      'New Albany',          '{iu}',        false, 30),
 ('purdue-west-lafayette', 'Purdue West Lafayette', 'West Lafayette', 'West Lafayette',      '{purdue}',    false, 20),
 ('purdue-northwest',      'Purdue Northwest',      'Northwest',      'Hammond / Westville', '{purdue}',    false, 30);

-- 2. users: university, home campus, change clock ----------------------------
alter table public.users
  add column school_system text check (school_system in ('iu','purdue')),
  add column campus_id     text references public.campuses(id) on update cascade,
  add column campus_set_at timestamptz;
create index users_campus_id_idx on public.users (campus_id);

comment on column public.users.school_system is
  'University proven by the verified school email (iu|purdue). Service role writes only.';
comment on column public.users.campus_id is
  'Home campus. Must be a campus whose systems contain school_system (trigger users_campus_in_system). Service role writes only.';
comment on column public.users.campus_set_at is
  'When the student last chose/confirmed a home campus: the 30-day change clock. Deliberately NOT reset when school_system changes (critic B3).';

-- Same role and shape as SELECT(school) today (authenticated has no
-- table-level SELECT on users). Deliberately NO grant on campus_set_at, and
-- NO UPDATE grant on any of the three columns.
grant select (school_system, campus_id) on public.users to authenticated;

create or replace function public.users_campus_in_system() returns trigger
language plpgsql set search_path = public as $$
begin
  -- The only rule: a set campus must be one the user's university may pick.
  -- A campus with no school_system fails too (null = any(...) is not true).
  -- Changing school_system while keeping a campus passes only if the campus
  -- is shared with the new system; otherwise the caller clears campus_id in
  -- the same UPDATE. campus_set_at is never touched here (critic B3).
  if new.campus_id is not null and not exists (
       select 1 from public.campuses c
        where c.id = new.campus_id
          and new.school_system = any (c.systems)) then
    raise exception 'campus_not_in_system' using errcode = 'check_violation';
  end if;
  return new;
end $$;
revoke all on function public.users_campus_in_system() from public, anon;

create trigger users_campus_in_system
  before insert or update of campus_id, school_system on public.users
  for each row execute function public.users_campus_in_system();

-- Backfill: system first (the trigger needs it), then campus.
update public.users set school_system = 'iu'
 where school_verified and school_email is not null
   and (split_part(lower(school_email),'@',2) in ('iu.edu','iupui.edu')
        or split_part(lower(school_email),'@',2) like '%.iu.edu');           -- expect 14
-- Only rows with a proven university. An unverified 'IU Indianapolis' label
-- (still UPDATE-granted until M2) is skipped rather than aborting M1.
update public.users set campus_id = 'indianapolis'
 where school = 'IU Indianapolis'
   and school_system is not null;                                            -- expect 7; campus_set_at stays null

-- 3. orgs --------------------------------------------------------------------
alter table public.orgs
  add column campus_id text references public.campuses(id) on update cascade,
  add column system    text check (system in ('iu','purdue'));
create index orgs_campus_id_idx on public.orgs (campus_id);
comment on column public.orgs.campus_id is
  'Community the org meets in. Service role writes only (no UPDATE grant).';
comment on column public.orgs.system is
  'Registry the org is registered with: iu, purdue, or null for neither. Service role writes only.';
-- No grant: authenticated already holds table-level SELECT on orgs (critic D3),
-- and orgs UPDATE is per-column, so these two columns get no UPDATE.

-- 4. posts: stamped by the DB, not the client --------------------------------
alter table public.posts
  add column campus_id     text references public.campuses(id) on update cascade,
  add column school_system text check (school_system in ('iu','purdue'));
create index posts_campus_id_idx on public.posts (campus_id);
comment on column public.posts.campus_id is
  'Campus the post was made on. Set by trigger posts_stamp_campus on insert, pinned on update. Restamp only via the disable-trigger recipe in migration 20260916100000.';
comment on column public.posts.school_system is
  'University the post belongs to, so campus-less posts can be filtered by university (critic A7). Set on insert, pinned on update.';

-- Backfill BEFORE the trigger exists (the trigger would pin these writes).
-- Author-only is exactly what the trigger computes today: 0 posts have an
-- org_id, and orgs.campus_id / orgs.system were all created null above.
update public.posts p
   set campus_id = u.campus_id,
       school_system = u.school_system
  from public.users u
 where u.id = p.user_id
   and (u.campus_id is not null or u.school_system is not null);             -- expect 19 rows (9 get a campus, 19 get 'iu')

create or replace function public.posts_stamp_campus() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_org_campus  text;
  v_org_system  text;
  v_user_campus text;
  v_user_system text;
begin
  if tg_op = 'UPDATE' then
    -- A post's university never moves after insert.
    new.school_system := old.school_system;

    -- Critic A6: renaming campuses.id cascades an UPDATE into posts at
    -- trigger depth 2. Let that through, and only that: a nested UPDATE
    -- whose OLD campus id has vanished from campuses. The FK forbids deleting
    -- a referenced campus, so a vanished id means a rename. Every other
    -- UPDATE, nested or not, keeps the campus it was posted to.
    if pg_trigger_depth() > 1
       and old.campus_id is not null
       and new.campus_id is distinct from old.campus_id then
      if not exists (select 1 from public.campuses c where c.id = old.campus_id) then
        return new;
      end if;
    end if;

    new.campus_id := old.campus_id;
    return new;
  end if;

  -- INSERT. Whatever the client sent is overwritten.
  -- Critic A5: the org counts only if the author is its owner or admin, the
  -- same rule as /api/orgs/[slug]/posts. Plain membership isn't enough:
  -- anyone can join a public org as 'member' (org_members_insert policy,
  -- the join route), so it would let a student post onto any campus.
  -- A non-member gets NULL, and NULL IN (...) is not true.
  if new.org_id is not null
     and public.org_member_role(new.org_id, new.user_id) in ('owner', 'admin') then
    select o.campus_id, o.system
      into v_org_campus, v_org_system
      from public.orgs o
     where o.id = new.org_id;
  end if;

  select u.campus_id, u.school_system
    into v_user_campus, v_user_system
    from public.users u
   where u.id = new.user_id;

  if v_org_campus is not null then
    new.campus_id     := v_org_campus;
    new.school_system := coalesce(v_org_system, v_user_system);
  else
    new.campus_id     := v_user_campus;
    -- Critic A7: a campus-less author still stamps their university.
    new.school_system := coalesce(v_user_system, v_org_system);
  end if;
  return new;
end $$;
revoke all on function public.posts_stamp_campus() from public, anon;

create trigger posts_stamp_campus
  before insert or update on public.posts
  for each row execute function public.posts_stamp_campus();

commit;
