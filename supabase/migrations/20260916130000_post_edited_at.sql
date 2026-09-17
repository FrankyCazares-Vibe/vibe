-- Post EDITING groundwork (plan handoffs/2026-09-16-wave-plan-follow-onboarding-edit.md
-- §6 E0, open questions Q18 and Q21). Two things in one file, on purpose:
--   * posts.edited_at, the "Edited" marker, stamped by a trigger;
--   * the posts UPDATE column lock, which closes a live gap (below).
-- Q21's default ships them together: the marker is only honest if the app
-- can't write anything else on a post.
--
-- LIVE STATE BEFORE THIS MIGRATION (read-only, 2026-09-16, at f23bc5d):
--   * public.posts columns: id, user_id, org_id, type, content, media_url,
--     media_thumbnail_url, created_at, tags, view_count, edit_metadata,
--     status, campus_id, school_system. No edited_at.
--     edit_metadata holds video-post text overlays (2 rows). It is NOT an
--     edit marker. Don't reuse it, and this file doesn't touch it.
--   * status is CHECK (status in ('draft','published')): 20 published, 1 draft.
--   * Non-internal triggers: posts_stamp_campus (BEFORE INSERT OR UPDATE,
--     SECURITY DEFINER), bump_org_activity_on_post (AFTER INSERT).
--   * Policies: posts_select_authenticated, posts_insert_authenticated,
--     posts_update_own (authenticated; USING auth.uid() = user_id; WITH CHECK
--     auth.uid() = user_id AND has_recorded_consent()), posts_delete_own.
--   * relacl {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm,
--     service_role=arwdDxtm}. No column-level ACLs (pg_attribute.attacl null
--     on every column). has_column_privilege(..., 'UPDATE') is true on all 14
--     columns for authenticated AND anon.
--   * FKs: posts.user_id -> users ON DELETE CASCADE, posts.org_id -> orgs
--     ON DELETE SET NULL, posts.campus_id -> campuses ON UPDATE CASCADE.
--
-- THE GAP (Q21). The browser holds the anon key, and posts_update_own only
-- checks WHO owns the row, not WHAT changes. So today a signed-in student can
--   PATCH /rest/v1/posts?id=eq.<own post> {"created_at":"2030-01-01", "view_count":99999}
-- and move their own post to the top of every date-sorted list, inflate its
-- views (a vanity metric the product promises not to fake), or point
-- media_url at any object key. The same request can set org_id, which
-- posts_stamp_campus ignores on UPDATE but the org page reads. After this
-- file, `authenticated` can UPDATE only content, tags and status, and `anon`
-- can UPDATE nothing.
--
-- WHAT IT DOES
--   1. Adds posts.edited_at timestamptz, NULL = never edited. No backfill.
--   2. posts_stamp_edited() + BEFORE UPDATE trigger. When a PUBLISHED post's
--      content changes, edited_at := now(). Every other UPDATE copies the old
--      value back, so whatever a client (or a future route) sends for
--      edited_at is thrown away. Editing a draft, and the draft -> published
--      flip, don't stamp: a post isn't "edited" before anyone could see it.
--      Saving the same text again doesn't stamp either (IS DISTINCT FROM).
--      The same trigger refuses any status change on a PUBLISHED post
--      (42501, "published posts cannot return to draft"). Otherwise
--      published -> draft, edit the draft, draft -> published would change
--      text people already saw with no mark (Q18), and the PATCH route would
--      send that text's @mentions a second time on the re-publish (Q17). With
--      it, a draft is always a post nobody has seen, so not stamping drafts
--      stays honest. It lives in the trigger, not only in the route, because
--      status stays grantable through PostgREST.
--      NOT security definer: it only assigns NEW fields and reads no table.
--   3. revoke update on posts from anon, authenticated; then
--      grant update (content, tags, status) to authenticated. Revoking a
--      table-level privilege also revokes that privilege's column grants, so
--      this starts from a clean slate. INSERT gets the same column-list shape; SELECT and DELETE are untouched.
--   4. Revokes EXECUTE on the trigger function from public, anon and
--      authenticated (critic C22's lesson: Supabase's default privileges grant
--      EXECUTE on every new public function to both API roles). A trigger
--      doesn't need the invoker to hold EXECUTE; CREATE TRIGGER checks it once,
--      for the role creating the trigger.
--   5. notify pgrst, 'reload schema', so PostgREST sees the new column and
--      grants without waiting for its periodic reload.
--
-- WHY THE LOCK IS SAFE FOR EVERY CURRENT WRITER
--   * /api/posts/[id] PATCH (src/app/api/posts/[id]/route.ts:356-363) is the
--     ONLY user-client UPDATE on posts. At f23bc5d its patch holds content
--     and/or status, both still granted. Batch E1 (wave 2) adds tags, also
--     granted, and lets the trigger own edited_at. It .select()s its columns
--     back, which needs SELECT, not UPDATE, and SELECT is untouched.
--   * A PostgREST PATCH naming any other column now fails WHOLE with 42501
--     "permission denied for table posts". No deployed code sends one.
--   * Nothing moves a published post back to draft. The PATCH route accepts
--     status "draft" (route.ts:340), but no client in src/ or public/html
--     sends it: grep -rnE "['\"]draft['\"]" src public/html finds only that
--     route's own two checks. So the trigger's refusal only meets
--     hand-crafted requests, which get the route's 500 "Request failed" (or
--     PostgREST's 403) and no change. Batch E1 should reject status "draft"
--     on a published post with a 4xx before its UPDATE, so the route never
--     reaches that 500. The refusal binds every role, the service role and
--     table owner included; no admin tool unpublishes today, and one that
--     ever needs to must change this trigger on purpose.
--   * record_post_view (SECURITY DEFINER, owner postgres) does
--     UPDATE posts SET view_count = view_count + 1. It runs as the owner, so
--     the revoke doesn't reach it. posts_stamp_edited fires on it, sees the
--     content unchanged, and keeps edited_at as it was.
--   * FK actions (orgs delete -> SET NULL on posts.org_id, campus rename ->
--     CASCADE on posts.campus_id) run as the table owner, not as the
--     deleting user, so the revoke doesn't reach them either. The trigger
--     keeps edited_at on both.
--   * The service role (/api/orgs/[slug]/posts insert, any admin tool) keeps
--     arwdDxtm. Only anon and authenticated change.
--   * No other function in schema public writes posts (checked 2026-09-16:
--     functions whose source matches "update posts" -> record_post_view only;
--     triggers on other tables that mention posts -> notify_on_comment_insert,
--     notify_on_like_insert, both SECURITY DEFINER and read-only on posts).
--   * Trigger order. BEFORE triggers fire in name order: posts_stamp_campus,
--     then posts_stamp_edited. Neither touches the other's columns.
--   * RLS WITH CHECK runs after BEFORE triggers; the trigger never changes
--     user_id, so posts_update_own evaluates exactly as today.
--
-- INSERT IS LOCKED THE SAME WAY (added at orchestrator review, 2026-09-16).
-- Table-wide INSERT let a direct PostgREST INSERT set created_at, view_count
-- or edited_at on a brand-new post the student owns: a backdated post, or a
-- fake view count (the "no vanity metrics" line). Every posts insert in src/
-- was checked: src/app/api/orgs/[slug]/posts/route.ts:172 uses the SERVICE
-- client (unaffected), and src/app/api/me/publish-post/route.ts:176 uses the
-- USER client with exactly user_id, type, content, tags, media_url,
-- media_thumbnail_url. Nothing in public/html writes posts. Column defaults
-- (id, created_at, view_count, status) need no INSERT privilege, and the
-- BEFORE INSERT trigger posts_stamp_campus assigns campus_id/school_system on
-- NEW, which needs none either. status stays insertable so a future draft
-- save through the user client keeps working; a draft is invisible to others.
--
-- DEPLOY ORDER. Gate G1: after wave 1 is live on Vercel and BEFORE wave 2 is
-- pushed, with Franky's yes. Wave 2's E1 and F4 select edited_at; pushed
-- first, /api/feed and /api/posts/[id] return 500 (42703). Wave 1 code and
-- f23bc5d are both safe with this applied (see WHY THE LOCK IS SAFE).
--
-- PRE-CHECK (all must pass; read-only):
--   1. The only user-client writer of posts is still the PATCH route, and its
--      patch names only content, tags and/or status; the only user-client
--      INSERT is publish-post, naming only the six insert-granted columns:
--        rg -n -U "from\(['\"]posts['\"]\)[\s\S]{0,300}?\.(update|upsert|insert)\(" src public/html
--        rg -n "rest/v1/posts" src public/html
--      Expect one hit, src/app/api/posts/[id]/route.ts, and nothing in
--      public/html. Read the route's `patch` keys.
--   2. The column doesn't exist yet and the grants are still today's:
--        SELECT count(*) FROM information_schema.columns
--         WHERE table_schema='public' AND table_name='posts' AND column_name='edited_at';  -- 0
--        SELECT relacl FROM pg_class WHERE oid='public.posts'::regclass;
--        -- {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--      Don't run POST-CHECK b's second query (the one naming 'edited_at')
--      before applying: has_column_privilege RAISES on a column that doesn't
--      exist. Its first query (the pg_attribute walk) is safe either way.
--   3. Nothing new writes posts from inside the database:
--        SELECT p.proname, p.prosecdef FROM pg_proc p
--          JOIN pg_namespace n ON n.oid = p.pronamespace
--         WHERE n.nspname = 'public' AND p.prosrc ~* 'update\s+(public\.)?posts\M';
--        -- record_post_view | t   (and nothing that is prosecdef f)
--   4. Wave 1 is the production deploy and wave 2 is NOT:
--        gh api repos/{owner}/{repo}/deployments --jq '.[0] | {sha, environment, created_at}'
--      The sha must be the wave 1 commit (or later wave 1 repairs), and no
--      wave 2 commit may be on main yet.
--
-- HOW TO APPLY BY HAND. The Supabase MCP execute_sql is read-only, and
-- `supabase db push` needs the DB password, which is not on this machine.
--   1. From the repo root, with SUPABASE_ACCESS_TOKEN exported from
--      .env.local (the project ref is in supabase/.temp/project-ref). Use
--      curl, not Python: urllib gets a Cloudflare 1010 block.
--        export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--        curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
--          -H "Content-Type: application/json" \
--          --data "$(jq -n --rawfile q supabase/migrations/20260916130000_post_edited_at.sql '{query:$q}')"
--   2. Record it so `db push` stays in sync. Send the same way: save to a
--      scratch .sql file and point --rawfile at it:
--        INSERT INTO supabase_migrations.schema_migrations (version, name)
--        VALUES ('20260916130000', 'post_edited_at');
--
-- POST-CHECK (read-only; plan §4.3 G1 step 3).
--   a. The column exists, nullable, no default, and nothing is stamped yet:
--        SELECT data_type, is_nullable, column_default FROM information_schema.columns
--         WHERE table_schema='public' AND table_name='posts' AND column_name='edited_at';
--        -- timestamp with time zone | YES | null
--        SELECT count(*) FROM public.posts WHERE edited_at IS NOT NULL;  -- 0
--   b. UPDATE is exactly content, status, tags for authenticated, and nothing
--      for anon. The query walks pg_attribute, so a column added later can't
--      slip past it, and edited_at is included:
--        SELECT string_agg(a.attname::text, ',' ORDER BY a.attname)
--                 FILTER (WHERE has_column_privilege('authenticated', a.attrelid, a.attnum, 'UPDATE')) AS auth_update_cols,
--               count(*) FILTER (WHERE has_column_privilege('anon', a.attrelid, a.attnum, 'UPDATE'))          AS anon_update_cols,
--               count(*) FILTER (WHERE has_column_privilege('service_role', a.attrelid, a.attnum, 'UPDATE'))  AS svc_update_cols,
--               count(*) AS total_cols
--          FROM pg_attribute a
--         WHERE a.attrelid = 'public.posts'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
--        -- content,status,tags | 0 | 15 | 15
--        -- (Before this file the same query returned all 14 names | 14 | 14 | 14.)
--        SELECT has_column_privilege('authenticated','public.posts','edited_at','UPDATE') AS auth_edited,  -- f
--               has_column_privilege('authenticated','public.posts','edited_at','SELECT') AS auth_sel,     -- t
--               has_table_privilege('authenticated','public.posts','INSERT')              AS auth_ins,     -- f (column grants only)
--               has_column_privilege('authenticated','public.posts','edited_at','INSERT') AS auth_ins_edited, -- f
--               has_table_privilege('authenticated','public.posts','DELETE')              AS auth_del;     -- t (unchanged)
--   b2. INSERT is exactly the publish route's columns for authenticated, and
--      nothing for anon:
--        SELECT string_agg(a.attname::text, ',' ORDER BY a.attname)
--                 FILTER (WHERE has_column_privilege('authenticated', a.attrelid, a.attnum, 'INSERT')) AS auth_insert_cols,
--               count(*) FILTER (WHERE has_column_privilege('anon', a.attrelid, a.attnum, 'INSERT'))          AS anon_insert_cols
--          FROM pg_attribute a
--         WHERE a.attrelid = 'public.posts'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
--        -- content,media_thumbnail_url,media_url,status,tags,type,user_id | 0
--   c. The trigger and its function:
--        SELECT t.tgname, pg_get_triggerdef(t.oid), p.prosecdef, p.proconfig
--          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
--         WHERE t.tgrelid = 'public.posts'::regclass AND NOT t.tgisinternal ORDER BY 1;
--        -- bump_org_activity_on_post | AFTER INSERT ...
--        -- posts_stamp_campus        | BEFORE INSERT OR UPDATE ... | t | {search_path=public}
--        -- posts_stamp_edited        | BEFORE UPDATE ...           | f | {search_path=public}
--        SELECT tgname FROM pg_trigger WHERE tgname = 'posts_stamp_edited';  -- 1 row
--        SELECT prosrc ~ 'cannot return to draft' FROM pg_proc
--         WHERE oid = 'public.posts_stamp_edited()'::regprocedure;  -- t (the unpublish refusal shipped)
--        SELECT has_function_privilege('authenticated','public.posts_stamp_edited()','EXECUTE'),
--               has_function_privilege('anon','public.posts_stamp_edited()','EXECUTE');  -- f | f
--   d. Recorded:
--        SELECT max(version) FROM supabase_migrations.schema_migrations;  -- 20260916130000
--
-- G1 REGRESSION, live, read-only, done as Franky right after apply:
--   * /api/feed?limit=20 -> 200.
--   * Open one post in the viewer -> its view count still goes up
--     (record_post_view is SECURITY DEFINER, so the revoke can't reach it).
-- Positive and negative write tests (Franky, or a Supabase branch; never an
-- agent against prod):
--   * PATCH /api/posts/<own published post> {"content":"new text"} -> 200,
--     and SELECT edited_at FROM posts WHERE id = ... is now set. The same
--     PATCH again with the same text leaves edited_at where it was.
--   * Publish a draft -> edited_at stays null.
--   * PATCH /rest/v1/posts?id=eq.<own post> {"view_count":1} with a user JWT
--     -> 403 with code 42501, and the row is unchanged.
--   * Publish a new post from the phone composer -> it appears (the publish
--     route's six columns are insert-granted). POST /rest/v1/posts with
--     {"user_id":<me>,"content":"x","view_count":999} and a user JWT -> 403
--     42501, nothing inserted.
--   * PATCH /rest/v1/posts?id=eq.<own PUBLISHED post> {"status":"draft"} with
--     a user JWT -> 403 with code 42501 ("published posts cannot return to
--     draft"), and SELECT status FROM posts WHERE id = ... is still
--     'published'. Through PATCH /api/posts/<id> {"status":"draft"} the row
--     is likewise unchanged (500 at wave 1; a 4xx once E1 rejects it first),
--     and no mention notification is sent.
--   * PATCH /rest/v1/posts?id=eq.<own post> {"status":"published"} on a post
--     that is already published -> 204, no error (IS DISTINCT FROM: same
--     status is not a change).
--
-- ROLLBACK. Two steps, because wave 2 reads the column.
--   Step 1, safe at any time: restores today's grants and removes the stamp.
--   This REOPENS the Q21 gap. The first REVOKE clears the three column grants
--   so the ACL ends exactly as it was.
--     BEGIN;
--     DROP TRIGGER IF EXISTS posts_stamp_edited ON public.posts;
--     DROP FUNCTION IF EXISTS public.posts_stamp_edited();
--     REVOKE UPDATE ON public.posts FROM authenticated;
--     GRANT UPDATE ON public.posts TO anon, authenticated;
--     REVOKE INSERT ON public.posts FROM authenticated;
--     GRANT INSERT ON public.posts TO anon, authenticated;
--     NOTIFY pgrst, 'reload schema';
--     COMMIT;
--   Step 2, ONLY after wave 2's E1 and F4 are rolled back (they select
--   edited_at; dropping it first makes /api/feed and /api/posts/[id] 500):
--     BEGIN;
--     ALTER TABLE public.posts DROP COLUMN IF EXISTS edited_at;
--     DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260916130000';
--     NOTIFY pgrst, 'reload schema';
--     COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- Fail fast instead of queueing every posts read and write behind the
-- ACCESS EXCLUSIVE lock ADD COLUMN takes (21 rows; held for milliseconds).
set local lock_timeout = '5s';

-- 1. the marker --------------------------------------------------------------
-- No backfill: NULL means never edited. Edits made before this file left no
-- record, so those posts stay unmarked.
alter table public.posts add column if not exists edited_at timestamptz;

comment on column public.posts.edited_at is
  'When a PUBLISHED post''s content last changed. NULL = never edited. Set only by trigger posts_stamp_edited; clients cannot write it (no UPDATE grant). Not edit_metadata, which is video text overlays.';

-- 2. the stamp ---------------------------------------------------------------
-- Always overwrites NEW.edited_at, so the column has one writer. Not
-- SECURITY DEFINER: it reads no table, it only assigns a NEW field.
-- A published post never goes back to draft. Without that, published ->
-- draft -> edit -> published changes seen text with no mark, because none of
-- the three UPDATEs starts from 'published'. So a draft is always a post
-- nobody has seen, and leaving drafts unstamped stays honest.
create or replace function public.posts_stamp_edited() returns trigger language plpgsql set search_path = public as $$
begin
  if old.status = 'published' and new.status is distinct from old.status then
    raise exception 'published posts cannot return to draft' using errcode = '42501';
  end if;
  if old.status = 'published' and new.content is distinct from old.content then new.edited_at := now();
  else new.edited_at := old.edited_at; end if;
  return new;
end $$;

comment on function public.posts_stamp_edited() is
  'BEFORE UPDATE on posts: sets edited_at when a published post''s content changes, and otherwise keeps the old value, so a client-sent edited_at never lands. Refuses (42501) any status change on a published post, so a post can''t be unpublished, edited and republished unmarked. Draft edits and the draft -> published flip do not stamp. Plan 2026-09-16 E0.';

revoke all on function public.posts_stamp_edited() from public, anon, authenticated;

drop trigger if exists posts_stamp_edited on public.posts;
create trigger posts_stamp_edited
  before update on public.posts
  for each row execute function public.posts_stamp_edited();

-- 3. the column lock (Q21) ---------------------------------------------------
-- Table-level REVOKE also clears any column grants for the same privilege,
-- so the GRANT below is the whole of what authenticated can UPDATE. anon
-- gets nothing back. SELECT and DELETE are not touched.
revoke update on public.posts from anon, authenticated;
grant update (content, tags, status) on public.posts to authenticated;

-- Same shape for INSERT: exactly the columns publish-post sends, plus status.
-- created_at, view_count, edited_at, org_id, campus_id, school_system and
-- edit_metadata come from defaults, triggers or the service role only.
revoke insert on public.posts from anon, authenticated;
grant insert (user_id, type, content, tags, media_url, media_thumbnail_url, status)
  on public.posts to authenticated;

-- 4. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
