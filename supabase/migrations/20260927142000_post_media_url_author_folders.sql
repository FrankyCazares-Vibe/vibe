-- A post's photo must be the author's OWN post photo (S67 security wave,
-- batch d, repair round 1; follow-up to 20260927120000_media_ref_ownership).
--
-- WHY THIS EXISTS. 20260927120000 let posts.media_url / media_thumbnail_url
-- be ANY https path on our Supabase host (media_url_on_own_host). Two holes
-- came through that door, both replayed on the local database:
--   1. A moderator's removal could leave the photo online and report
--      success. Removal (POST /api/admin/content/remove) moves a post's files
--      into the private `quarantine` bucket, but only from the author's own
--      profiles/<uid>/posts/ and posters/ folders (media-quarantine.ts); it
--      will never move anything else, because that could be someone else's
--      picture. So an intimate image uploaded as kind=banner (it lands at
--      profiles/<uid>/banner-<uuid>.jpg) and posted by URL was STORED, and on
--      removal the route answered 200 with quarantined:0. The photo stayed
--      public and the TAKE IT DOWN Act's 48 hours ran out while the admin
--      screen said it was done.
--   2. Anyone could post another student's photo (their avatar, their post
--      photo) as their own, straight through PostgREST.
--
-- WHAT IT DOES
--   1. PRE-FLIGHT (aborts the file): post_media_ref_ok(text, uuid, uuid) must
--      be exactly the 20260927120000 version, its trigger must be in place,
--      and no existing post may carry an https photo on our host OUTSIDE its
--      author's post folders (that is the hole itself: a human looks first).
--   2. Replaces post_media_ref_ok (same signature, so the posts trigger and
--      the grants carry over untouched). A post's media reference is now:
--        NULL, or
--        https://rqopjkimxbjkwdkpkbfq.supabase.co/storage/v1/object/public/
--          profiles/<user_id>/(posts|posters)/<file>
--          where <file> is [A-Za-z0-9_-][A-Za-z0-9._-]* (no leading dot), no
--          '..' anywhere, at most 2048 characters, no query string, or
--        the author's own clips/<user_id>/... key (unchanged), or
--        (club posts only) an orgs/<org_id>/... key (unchanged).
--      That is exactly the set media-quarantine.ts can take offline
--      (isAuthorPostPhotoUrl there is the same rule in TypeScript), so every
--      photo a post can carry is one a moderator's removal takes down.
--   3. POST-CHECK inside the transaction, then notify pgrst.
--
-- DOES NOT: touch the triggers, media_url_on_own_host (orgs.logo_url /
-- banner_url still use it), media_key_in_folder, messages, or any row. The
-- posts trigger checks a column on INSERT and when it changes, so an old row
-- is never re-checked (none would fail in production anyway, see LIVE STATE).
--
-- LEGITIMATE FLOWS (checked in code): every composer uploads a post photo
-- with /api/me/profile-upload kind=post (-> <uid>/posts/post-<uuid>.<ext>)
-- and a video's poster frame with kind=poster (-> <uid>/posters/...):
-- campus-home.tsx, PostComposerMobile.tsx, public/html/profile.html. The club
-- composer (orgs/[handle]/admin-actions.tsx) sends an orgs/<org>/ R2 key. The
-- only posts writers are /api/me/publish-post and /api/orgs/[slug]/posts.
--
-- LIVE STATE (read-only MCP, 2026-09-27):
--   * schema_migrations max 20260927100000: 20260927120000 is NOT applied to
--     production yet, so post_media_ref_ok does not exist there. Apply that
--     file first; this one aborts in pre-flight without it.
--   * posts: 23 rows; https media_url 3, https media_thumbnail_url 5; 0 rows
--     with an https media_url or thumbnail outside
--     profiles/<author>/(posts|posters)/<file>; 0 club posts with media.
--   * Local test DB (supabase_db_vibe): 120000 applied, same 0.
--
-- DEPLOY ORDER. After 20260927120000. Either order against the code: no
-- composer sends anything this refuses. Until /api/me/publish-post's
-- isOwnedMediaRef is narrowed the same way (batch b's file), a CRAFTED
-- request naming a non-post path gets a 500 there instead of a 400; it is
-- never stored either way.
--
-- HOW TO APPLY (MCP execute_sql is read-only): from the repo root,
--   export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--   curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
--     --data "$(jq -n --rawfile q supabase/migrations/20260927142000_post_media_url_author_folders.sql '{query:$q}')"
--   then: INSERT INTO supabase_migrations.schema_migrations (version, name)
--         VALUES ('20260927142000', 'post_media_url_author_folders');
--
-- POST-CHECK (read-only, after applying):
--   SELECT public.post_media_ref_ok(
--     'https://rqopjkimxbjkwdkpkbfq.supabase.co/storage/v1/object/public/profiles/'
--       || '11111111-1111-4111-8111-111111111111/banner-x.jpg',
--     '11111111-1111-4111-8111-111111111111', null);   -- false
--
-- ROLLBACK (one transaction; restores the 20260927120000 body exactly):
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.post_media_ref_ok(p_ref text, p_user_id uuid, p_org_id uuid)
--   RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
--   AS $$
--     select p_ref is null
--         or public.media_url_on_own_host(p_ref)
--         or public.media_key_in_folder(p_ref, 'clips/', p_user_id, false)
--         or public.media_key_in_folder(p_ref, 'orgs/', p_org_id, false);
--   $$;
--   COMMENT ON FUNCTION public.post_media_ref_ok(text, uuid, uuid) IS
--     'S67 media ownership: a post''s media_url / media_thumbnail_url is NULL, an https URL on the project host, the author''s own clips/<user_id>/ key, or (club posts) an orgs/<org_id>/ key.';
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927142000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- CREATE OR REPLACE FUNCTION locks only the function's catalog row; nothing
-- here should wait, so fail fast if something does.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT ----------------------------------------------------------------
do $$
declare
  body text;
  n_outside bigint;
begin
  select btrim(regexp_replace(p.prosrc, '\s+', ' ', 'g')) into body
    from pg_proc p
   where p.oid = to_regprocedure('public.post_media_ref_ok(text, uuid, uuid)');
  if body is distinct from
     'select p_ref is null or public.media_url_on_own_host(p_ref) or public.media_key_in_folder(p_ref, ''clips/'', p_user_id, false) or public.media_key_in_folder(p_ref, ''orgs/'', p_org_id, false);'
  then
    raise exception 'post-photo-folders: post_media_ref_ok is not the 20260927120000 version this file narrows (apply that first, or re-read it): %',
      coalesce(body, '(missing)');
  end if;

  if to_regprocedure('public.media_key_in_folder(text, text, uuid, boolean)') is null
     or to_regprocedure('public.media_url_on_own_host(text)') is null then
    raise exception 'post-photo-folders: a 20260927120000 helper is missing';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgname = 'posts_check_media_refs'
                    and t.tgrelid = 'public.posts'::regclass
                    and t.tgenabled = 'O' and not t.tgisinternal) then
    raise exception 'post-photo-folders: trigger posts_check_media_refs is missing or disabled';
  end if;

  -- A photo on our host outside its author's post folders: the hole itself.
  select count(*) into n_outside
    from public.posts p
   where (public.media_url_on_own_host(p.media_url)
          and p.media_url !~ ('^https://rqopjkimxbjkwdkpkbfq\.supabase\.co/storage/v1/object/public/profiles/'
                              || p.user_id::text || '/(posts|posters)/[A-Za-z0-9_-][A-Za-z0-9._-]*$'))
      or (public.media_url_on_own_host(p.media_thumbnail_url)
          and p.media_thumbnail_url !~ ('^https://rqopjkimxbjkwdkpkbfq\.supabase\.co/storage/v1/object/public/profiles/'
                                        || p.user_id::text || '/(posts|posters)/[A-Za-z0-9_-][A-Za-z0-9._-]*$'));
  if n_outside > 0 then
    raise exception 'post-photo-folders: % post(s) carry a photo on our host outside the author''s post folders; look at them (and quarantine the files by hand) before applying',
      n_outside;
  end if;
end $$;

-- 1. The narrower rule -----------------------------------------------------------
-- Same signature, so the posts trigger, the grants (anon, authenticated,
-- service_role: EXECUTE) and the owner all carry over.
create or replace function public.post_media_ref_ok(p_ref text, p_user_id uuid, p_org_id uuid)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_ref is null
      -- A photo or poster frame in the author's OWN post folders. A UUID's
      -- text is hex and dashes only, so it is safe inside the pattern.
      or coalesce(
           length(p_ref) <= 2048
       and strpos(p_ref, '..') = 0
       and p_ref ~ ('^https://rqopjkimxbjkwdkpkbfq\.supabase\.co/storage/v1/object/public/profiles/'
                    || p_user_id::text || '/(posts|posters)/[A-Za-z0-9_-][A-Za-z0-9._-]*$'),
         false)
      or public.media_key_in_folder(p_ref, 'clips/', p_user_id, false)
      or public.media_key_in_folder(p_ref, 'orgs/', p_org_id, false);
$$;

comment on function public.post_media_ref_ok(text, uuid, uuid) is
  'S67 media ownership (narrowed by 20260927142000): a post''s media_url / media_thumbnail_url is NULL, the author''s own photo https://<project>/storage/v1/object/public/profiles/<user_id>/(posts|posters)/<file>, the author''s own clips/<user_id>/ key, or (club posts) an orgs/<org_id>/ key. The photo arm is the set media-quarantine.ts can take offline (isAuthorPostPhotoUrl).';

-- 2. POST-CHECK inside the transaction: any miss aborts the whole file -----------
do $$
declare
  a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
  pub text := 'https://rqopjkimxbjkwdkpkbfq.supabase.co/storage/v1/object/public/profiles/';
  p oid := to_regprocedure('public.post_media_ref_ok(text, uuid, uuid)');
begin
  if p is null
     or (select provolatile <> 'i' or prosecdef
                or proconfig is distinct from array['search_path=""']
           from pg_proc where oid = p)
     or not has_function_privilege('authenticated', p, 'execute')
     or not has_function_privilege('service_role', p, 'execute') then
    raise exception 'post-photo-folders: post_media_ref_ok lost IMMUTABLE / INVOKER / its search_path / its grants';
  end if;

  -- What every composer sends, and what a club post and a video post store.
  if not (public.post_media_ref_ok(null, a, null)
          and public.post_media_ref_ok(pub || a || '/posts/post-2b7c1e0a-1111-4222-8333-944455556666.jpg', a, null)
          and public.post_media_ref_ok(pub || a || '/posters/poster-2b7c1e0a.jpg', a, null)
          and public.post_media_ref_ok('clips/' || a || '/2b7c1e0a.mp4', a, null)
          and public.post_media_ref_ok('orgs/' || b || '/posts/x.jpg', a, b)) then
    raise exception 'post-photo-folders: the rule refuses a legitimate post';
  end if;

  -- The two holes, and the edges around them.
  if public.post_media_ref_ok(pub || a || '/banner-x.jpg', a, null)           -- own banner
     or public.post_media_ref_ok(pub || a || '/avatar-x.jpg', a, null)        -- own avatar
     or public.post_media_ref_ok(pub || a || '/logos/logo-x.png', a, null)    -- own logo
     or public.post_media_ref_ok(pub || b || '/posts/p.jpg', a, null)         -- someone else's photo
     or public.post_media_ref_ok(pub || b || '/posts/p.jpg', a, b)            -- ... on a club post
     or public.post_media_ref_ok(pub || a || '/posts/sub/p.jpg', a, null)     -- a subfolder
     or public.post_media_ref_ok(pub || a || '/posts/.p', a, null)            -- leading dot
     or public.post_media_ref_ok(pub || a || '/posts/..p', a, null)           -- '..'
     or public.post_media_ref_ok(pub || a || '/posts/p.jpg?x=1', a, null)     -- query string
     or public.post_media_ref_ok(pub || a || '/posts/', a, null)              -- no file
     or public.post_media_ref_ok(pub || a || '/posts/p.jpg', null, null)      -- no author
     or public.post_media_ref_ok(replace(pub, 'https:', 'http:') || a || '/posts/p.jpg', a, null)
     or public.post_media_ref_ok(replace(pub, '/public/', '/sign/') || a || '/posts/p.jpg', a, null)
     or public.post_media_ref_ok(replace(pub, '/profiles/', '/quarantine/') || a || '/posts/p.jpg', a, null)
     or public.post_media_ref_ok('https://rqopjkimxbjkwdkpkbfq.supabase.co/x.png', a, null)
     or public.post_media_ref_ok('https://evil.example/storage/v1/object/public/profiles/' || a || '/posts/p.jpg', a, null)
     or public.post_media_ref_ok('clips/' || b || '/x.mp4', a, null)
     or public.post_media_ref_ok('', a, null) then
    raise exception 'post-photo-folders: the rule accepts a value it must refuse';
  end if;

  if not exists (select 1 from pg_trigger t
                  where t.tgname = 'posts_check_media_refs'
                    and t.tgrelid = 'public.posts'::regclass
                    and t.tgenabled = 'O' and not t.tgisinternal) then
    raise exception 'post-photo-folders: trigger posts_check_media_refs is missing or disabled';
  end if;
end $$;

-- 3. tell PostgREST (delivered at commit) ------------------------------------
notify pgrst, 'reload schema';

commit;
