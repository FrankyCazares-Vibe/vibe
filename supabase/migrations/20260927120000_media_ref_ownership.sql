-- S67 security wave, batch b: a stored media reference must point at the
-- writer's OWN file, in the database, not only in the route.
--
-- WHY THIS EXISTS. Report handoffs/2026-09-27-security-risk-report.md, [High]
-- "Any student can permanently erase other students' and clubs' videos" (and
-- its duplicate), plus risk #13 (account deletion erases other members' chat
-- files). `authenticated` holds INSERT on posts.media_url /
-- posts.media_thumbnail_url and messages.media_url, and officers hold UPDATE
-- on orgs.logo_url / orgs.banner_url. The only ownership checks lived in the
-- routes (isOwnedMediaRef in /api/me/publish-post, normalizeOrgAssetInput),
-- and the browser holds the anon key, so
--   POST /rest/v1/posts {"user_id":"<me>","status":"draft",
--                        "media_url":"clips/<victim>/<uuid>.mp4"}
-- succeeded, and DELETE /api/posts/<that id> then erased the victim's video
-- with the server's own R2 keys. The same planted row, published, re-served
-- the victim's (or a hidden club's) media as the attacker's own post; a
-- planted chat message did the same to other members' chat photos at
-- account deletion.
--
-- WHAT IT DOES
--   1. Three pure helpers (IMMUTABLE, empty search_path):
--        public.media_key_in_folder(ref, family, owner, one_segment)
--          true when ref = <family><owner uuid>/<rest>, rest is safe path
--          segments ([A-Za-z0-9._-]+ joined by single slashes; exactly one
--          segment when one_segment), no '..' anywhere, <= 1024 chars.
--        public.media_url_on_own_host(ref)
--          true when ref is https://rqopjkimxbjkwdkpkbfq.supabase.co/<path>,
--          path of [A-Za-z0-9._~/-] only (no query, no '..'), <= 2048 chars.
--        public.post_media_ref_ok(ref, user_id, org_id)
--          NULL, or own host, or clips/<user_id>/..., or (club posts only)
--          orgs/<org_id>/....
--      The same rules as src/lib/posts/media-ownership.ts (isOwnClipKey,
--      isOrgAssetKey, isChannelMediaKey, hasSafeMediaUrlShape). Keep them in
--      step: a value a route accepts but this refuses is a 500, not a 400.
--   2. BEFORE INSERT OR UPDATE triggers (SECURITY INVOKER; they only read NEW
--      and OLD, so every writer is covered: PostgREST, the routes' session
--      client and the service role alike):
--        posts_check_media_refs     media_url and media_thumbnail_url must
--                                   pass post_media_ref_ok.
--        messages_check_media_ref   media_url NULL or
--                                   messages/<channel_id>/<one file>.
--        orgs_check_asset_refs      logo_url and banner_url NULL, own host,
--                                   or orgs/<this org's id>/....
--      Refusals raise SQLSTATE 23514 (check_violation), which PostgREST
--      returns as 400.
--   3. notify pgrst, 'reload schema'.
--
-- NEW WRITES ONLY. Each trigger checks a column on INSERT, and on UPDATE only
-- when that column's value actually changes. An existing row that doesn't
-- match (none on the live DB today, see LIVE STATE) keeps working: editing
-- its caption, a moderator setting removed_at, or the posts.org_id FK's ON
-- DELETE SET NULL when a club is deleted all leave the media columns alone
-- and are never refused. (That last one is why the posts trigger does NOT
-- re-check when only org_id changes: a club post's orgs/<club>/ key would
-- fail against org_id NULL and the club deletion would roll back.)
--
-- THE HOST IS PINNED HERE. The database can't read NEXT_PUBLIC_SUPABASE_URL,
-- so media_url_on_own_host names the project host literally. If the project
-- moves or gets a custom storage domain, replace that one function
-- (CREATE OR REPLACE, same signature) in the same deploy.
--
-- DOES NOT: revoke any grant (option (a) in the report, service-role-only
-- writes of these columns, is a larger route change); revoke SELECT on raw
-- media keys; touch channels.photo_url, users.* or the profiles bucket;
-- delete any file. Deleted-post images in the `profiles` bucket and
-- uploader-scoped chat keys are separate roadmap items.
--
-- LIVE STATE (read-only MCP, 2026-09-27, schema_migrations max 20260927100000):
--   * has_column_privilege('authenticated', ...): posts.media_url INSERT true,
--     UPDATE false; messages.media_url INSERT true, UPDATE false;
--     messages.channel_id UPDATE false.
--   * posts: 21 rows. media_url 16 NULL, 2 clips/ (both under the author's
--     own clips/<user_id>/), 3 https on rqopjkimxbjkwdkpkbfq.supabase.co
--     under /storage/v1/object/public/profiles/<author>/. media_thumbnail_url
--     16 NULL, 5 https of the same shape. 0 club posts carry media; 0 orgs/
--     keys in posts.
--   * messages: 54 NULL media_url, 3 messages/<own channel_id>/<file>.
--   * orgs: logo_url 1 and banner_url 1, both orgs/<own id>/...; rest NULL.
--   * Triggers today: posts (bump_org_activity_on_post, posts_stamp_campus,
--     posts_stamp_edited), messages (bump_org_activity_on_message), orgs
--     (orgs_sync_join_policy). None reads or writes a media column.
--   * No public function named *media*. posts.org_id FK is ON DELETE SET
--     NULL; messages.channel_id FK is ON DELETE CASCADE.
--   So every existing row passes: nothing is rewritten or cleared.
--
-- PRE-FLIGHT aborts when a column is missing, a name this file creates is
-- taken, or an existing row points INTO SOMEONE ELSE'S FOLDER (a clips/ key
-- outside its author's folder, an orgs/ key outside its club, a chat key
-- outside its chat): that is the attack this file closes, and a human should
-- look at those rows before anything else. Other legacy shapes (an https URL
-- on another host, say) only raise a NOTICE with the count.
--
-- TESTED on the local database (supabase_db_vibe): as an authenticated,
-- verified student, a direct insert of a post naming another student's
-- clips/ key is refused (23514); the same student's own clips/ key, an own
-- host https image and a text-only post insert fine; a chat message naming
-- another chat's file is refused; an org logo naming another club's folder
-- is refused and its own folder passes.
--
-- DEPLOY ORDER: either order works. The routes already refuse every value
-- this refuses, except crafted input (an https URL with a query string, a
-- chat key with an unusual file name, another club's key sent to the org
-- PATCH route), which becomes a 500 instead of being stored.
--
-- HOW TO APPLY (MCP execute_sql is read-only): from the repo root,
--   export SUPABASE_ACCESS_TOKEN="$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)"
--   curl -sS -X POST "https://api.supabase.com/v1/projects/$(cat supabase/.temp/project-ref)/database/query" \
--     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
--     --data "$(jq -n --rawfile q supabase/migrations/20260927120000_media_ref_ownership.sql '{query:$q}')"
--   then: INSERT INTO supabase_migrations.schema_migrations (version, name)
--         VALUES ('20260927120000', 'media_ref_ownership');
--
-- ROLLBACK (one transaction):
--   BEGIN;
--   DROP TRIGGER IF EXISTS posts_check_media_refs ON public.posts;
--   DROP TRIGGER IF EXISTS messages_check_media_ref ON public.messages;
--   DROP TRIGGER IF EXISTS orgs_check_asset_refs ON public.orgs;
--   DROP FUNCTION IF EXISTS public.posts_check_media_refs();
--   DROP FUNCTION IF EXISTS public.messages_check_media_ref();
--   DROP FUNCTION IF EXISTS public.orgs_check_asset_refs();
--   DROP FUNCTION IF EXISTS public.post_media_ref_ok(text, uuid, uuid);
--   DROP FUNCTION IF EXISTS public.media_url_on_own_host(text);
--   DROP FUNCTION IF EXISTS public.media_key_in_folder(text, text, uuid, boolean);
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927120000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

-- CREATE TRIGGER takes a SHARE ROW EXCLUSIVE lock on each table until COMMIT.
set local lock_timeout = '5s';

-- 0. PRE-FLIGHT ----------------------------------------------------------------
do $$
declare
  missing text;
  taken text;
  n_cross bigint;
begin
  select string_agg(want.t || '.' || want.c, ', ') into missing
    from (values ('posts', 'media_url'), ('posts', 'media_thumbnail_url'),
                 ('posts', 'user_id'), ('posts', 'org_id'),
                 ('messages', 'media_url'), ('messages', 'channel_id'),
                 ('orgs', 'id'), ('orgs', 'logo_url'), ('orgs', 'banner_url')) as want(t, c)
   where not exists (select 1 from information_schema.columns ic
                      where ic.table_schema = 'public' and ic.table_name = want.t
                        and ic.column_name = want.c);
  if missing is not null then
    raise exception 'media-refs: missing column(s): %', missing;
  end if;

  select string_agg(p.proname, ', ') into taken from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('media_key_in_folder', 'media_url_on_own_host', 'post_media_ref_ok',
                       'posts_check_media_refs', 'messages_check_media_ref',
                       'orgs_check_asset_refs');
  if taken is not null then
    raise exception 'media-refs: function name(s) already taken: %; stop and re-read them', taken;
  end if;
  if exists (select 1 from pg_trigger
              where not tgisinternal
                and tgname in ('posts_check_media_refs', 'messages_check_media_ref',
                               'orgs_check_asset_refs')) then
    raise exception 'media-refs: a trigger name this file creates is already taken';
  end if;

  -- Rows pointing into someone else's folder: the attack itself. Stop.
  select (select count(*) from public.posts p
           where (p.media_url like 'clips/%'
                  and p.media_url not like 'clips/' || p.user_id::text || '/%')
              or (p.media_thumbnail_url like 'clips/%'
                  and p.media_thumbnail_url not like 'clips/' || p.user_id::text || '/%')
              or (p.media_url like 'orgs/%'
                  and (p.org_id is null or p.media_url not like 'orgs/' || p.org_id::text || '/%'))
              or (p.media_thumbnail_url like 'orgs/%'
                  and (p.org_id is null
                       or p.media_thumbnail_url not like 'orgs/' || p.org_id::text || '/%')))
       + (select count(*) from public.messages m
           where m.media_url like 'messages/%'
             and m.media_url not like 'messages/' || m.channel_id::text || '/%')
       + (select count(*) from public.orgs o
           where (o.logo_url like 'orgs/%' and o.logo_url not like 'orgs/' || o.id::text || '/%')
              or (o.banner_url like 'orgs/%' and o.banner_url not like 'orgs/' || o.id::text || '/%'))
    into n_cross;
  if n_cross > 0 then
    raise exception 'media-refs: % existing row(s) point into another owner''s folder; investigate before applying', n_cross;
  end if;
end $$;

-- 1. The helpers ----------------------------------------------------------------

-- Is p_ref a key inside <p_family><p_owner>/ ? The shape rules are those of
-- src/lib/posts/media-ownership.ts (isUnderFolder). NULL owner or ref: false.
create function public.media_key_in_folder(
  p_ref text, p_family text, p_owner uuid, p_one_segment boolean)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
           p_ref is not null
       and p_owner is not null
       and length(p_ref) <= 1024
       and strpos(p_ref, '..') = 0
       and starts_with(p_ref, p_family || p_owner::text || '/')
       and substr(p_ref, length(p_family || p_owner::text || '/') + 1)
           ~ case when p_one_segment then '^[A-Za-z0-9._-]+$'
                  else '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$' end,
         false);
$$;

comment on function public.media_key_in_folder(text, text, uuid, boolean) is
  'S67 media ownership: true when p_ref is <p_family><p_owner>/<safe path> (one segment when p_one_segment), no "..", <= 1024 chars. Pure; the same rule as isUnderFolder in src/lib/posts/media-ownership.ts.';

-- Is p_ref a plain https URL on this project's own Supabase host?
create function public.media_url_on_own_host(p_ref text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(
           length(p_ref) <= 2048
       and strpos(p_ref, '..') = 0
       and p_ref ~ '^https://rqopjkimxbjkwdkpkbfq\.supabase\.co/[A-Za-z0-9._~/-]*$',
         false);
$$;

comment on function public.media_url_on_own_host(text) is
  'S67 media ownership: true for https://rqopjkimxbjkwdkpkbfq.supabase.co/<plain path> (no query, no "..", <= 2048 chars). The host is pinned here because the database cannot read NEXT_PUBLIC_SUPABASE_URL; replace this function if the project host changes.';

-- May a posts row with this author / club store p_ref as media?
create function public.post_media_ref_ok(p_ref text, p_user_id uuid, p_org_id uuid)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_ref is null
      or public.media_url_on_own_host(p_ref)
      or public.media_key_in_folder(p_ref, 'clips/', p_user_id, false)
      or public.media_key_in_folder(p_ref, 'orgs/', p_org_id, false);
$$;

comment on function public.post_media_ref_ok(text, uuid, uuid) is
  'S67 media ownership: a post''s media_url / media_thumbnail_url is NULL, an https URL on the project host, the author''s own clips/<user_id>/ key, or (club posts) an orgs/<org_id>/ key.';

-- Standing rule: every role that could reach them may call them. They are
-- pure functions of their arguments and read no table.
grant execute on function public.media_key_in_folder(text, text, uuid, boolean)
  to anon, authenticated, service_role;
grant execute on function public.media_url_on_own_host(text)
  to anon, authenticated, service_role;
grant execute on function public.post_media_ref_ok(text, uuid, uuid)
  to anon, authenticated, service_role;

-- Any existing row that would NOT pass as a new write (another host, an odd
-- file name): reported and left alone; the triggers only check new values.
do $$
declare
  n bigint;
begin
  select (select count(*) from public.posts p
           where not public.post_media_ref_ok(p.media_url, p.user_id, p.org_id)
              or not public.post_media_ref_ok(p.media_thumbnail_url, p.user_id, p.org_id))
       + (select count(*) from public.messages m
           where m.media_url is not null
             and not public.media_key_in_folder(m.media_url, 'messages/', m.channel_id, true))
       + (select count(*) from public.orgs o
           where (o.logo_url is not null and not public.media_url_on_own_host(o.logo_url)
                  and not public.media_key_in_folder(o.logo_url, 'orgs/', o.id, false))
              or (o.banner_url is not null and not public.media_url_on_own_host(o.banner_url)
                  and not public.media_key_in_folder(o.banner_url, 'orgs/', o.id, false)))
    into n;
  raise notice 'media-refs: % existing row(s) would not pass as a new write (left as they are)', n;
end $$;

-- 2. The triggers ---------------------------------------------------------------
-- Each column is checked on INSERT, and on UPDATE only when its value changes.

create function public.posts_check_media_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.media_url is distinct from old.media_url)
     and not public.post_media_ref_ok(new.media_url, new.user_id, new.org_id) then
    raise exception using
      errcode = '23514',
      message = 'posts.media_url must be empty, an image on Vibe''s own storage, or one of your own uploads',
      hint = 'media_ref_not_owned';
  end if;
  if (tg_op = 'INSERT' or new.media_thumbnail_url is distinct from old.media_thumbnail_url)
     and not public.post_media_ref_ok(new.media_thumbnail_url, new.user_id, new.org_id) then
    raise exception using
      errcode = '23514',
      message = 'posts.media_thumbnail_url must be empty, an image on Vibe''s own storage, or one of your own uploads',
      hint = 'media_ref_not_owned';
  end if;
  return new;
end;
$$;

create function public.messages_check_media_ref()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT'
      or new.media_url is distinct from old.media_url
      or new.channel_id is distinct from old.channel_id)
     and new.media_url is not null
     and not public.media_key_in_folder(new.media_url, 'messages/', new.channel_id, true) then
    raise exception using
      errcode = '23514',
      message = 'messages.media_url must be empty or a file uploaded to this chat',
      hint = 'media_ref_not_owned';
  end if;
  return new;
end;
$$;

create function public.orgs_check_asset_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- On INSERT the id default (gen_random_uuid()) is already in NEW, so a new
  -- club can only start with NULL or an own-host URL: no key is its own yet.
  if (tg_op = 'INSERT' or new.logo_url is distinct from old.logo_url)
     and new.logo_url is not null
     and not public.media_url_on_own_host(new.logo_url)
     and not public.media_key_in_folder(new.logo_url, 'orgs/', new.id, false) then
    raise exception using
      errcode = '23514',
      message = 'orgs.logo_url must be empty, an image on Vibe''s own storage, or this club''s own upload',
      hint = 'media_ref_not_owned';
  end if;
  if (tg_op = 'INSERT' or new.banner_url is distinct from old.banner_url)
     and new.banner_url is not null
     and not public.media_url_on_own_host(new.banner_url)
     and not public.media_key_in_folder(new.banner_url, 'orgs/', new.id, false) then
    raise exception using
      errcode = '23514',
      message = 'orgs.banner_url must be empty, an image on Vibe''s own storage, or this club''s own upload',
      hint = 'media_ref_not_owned';
  end if;
  return new;
end;
$$;

-- Trigger functions are never called directly (20260916130000's pattern).
revoke all on function public.posts_check_media_refs() from public, anon, authenticated;
revoke all on function public.messages_check_media_ref() from public, anon, authenticated;
revoke all on function public.orgs_check_asset_refs() from public, anon, authenticated;

create trigger posts_check_media_refs
  before insert or update of media_url, media_thumbnail_url on public.posts
  for each row execute function public.posts_check_media_refs();

create trigger messages_check_media_ref
  before insert or update of media_url, channel_id on public.messages
  for each row execute function public.messages_check_media_ref();

create trigger orgs_check_asset_refs
  before insert or update of logo_url, banner_url on public.orgs
  for each row execute function public.orgs_check_asset_refs();

-- 3. POST-CHECK -----------------------------------------------------------------
-- The triggers are in place and enabled, the helpers are what section 1 says,
-- and they answer the attack and the normal flows the way the routes do.
do $$
declare
  a uuid := '11111111-1111-4111-8111-111111111111';
  b uuid := '22222222-2222-4222-8222-222222222222';
  bad text;
begin
  select string_agg(w.tg, ', ') into bad
    from (values ('posts_check_media_refs', 'public.posts'),
                 ('messages_check_media_ref', 'public.messages'),
                 ('orgs_check_asset_refs', 'public.orgs')) as w(tg, rel)
   where not exists (select 1 from pg_trigger t
                      where t.tgname = w.tg and t.tgrelid = w.rel::regclass
                        and t.tgenabled = 'O' and not t.tgisinternal);
  if bad is not null then
    raise exception 'media-refs: trigger(s) missing or disabled: %', bad;
  end if;

  select string_agg(p.proname, ', ') into bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('media_key_in_folder', 'media_url_on_own_host', 'post_media_ref_ok')
     and (p.provolatile <> 'i' or p.prosecdef
          or p.proconfig is distinct from array['search_path=""']
          or not has_function_privilege('authenticated', p.oid, 'execute')
          or not has_function_privilege('service_role', p.oid, 'execute'));
  if bad is not null then
    raise exception 'media-refs: helper(s) not IMMUTABLE INVOKER with an empty search_path, or not executable: %', bad;
  end if;

  -- The attack: my row naming your video, your club's file, traversal.
  if public.post_media_ref_ok('clips/' || b || '/x.mp4', a, null)
     or public.post_media_ref_ok('clips/' || a || '/../' || b || '/x.mp4', a, null)
     or public.post_media_ref_ok('orgs/' || b || '/posts/x.jpg', a, null)
     or public.post_media_ref_ok('orgs/' || b || '/posts/x.jpg', a, a)
     or public.post_media_ref_ok('https://evil.example/x.png', a, null)
     or public.post_media_ref_ok('https://rqopjkimxbjkwdkpkbfq.supabase.co/x.png?y=1', a, null)
     or public.post_media_ref_ok('', a, null)
     or public.media_key_in_folder('messages/' || b || '/x.jpg', 'messages/', a, true)
     or public.media_key_in_folder('messages/' || a || '/sub/x.jpg', 'messages/', a, true) then
    raise exception 'media-refs: a helper accepted a value it must refuse';
  end if;

  -- The normal flows: text-only, own video, own-host image, club file, chat file.
  if not (public.post_media_ref_ok(null, a, null)
          and public.post_media_ref_ok('clips/' || a || '/3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.mp4', a, null)
          and public.post_media_ref_ok(
                'https://rqopjkimxbjkwdkpkbfq.supabase.co/storage/v1/object/public/profiles/'
                || a || '/post-3f0e7c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6.jpg', a, null)
          and public.post_media_ref_ok('orgs/' || b || '/posts/x.jpg', a, b)
          and public.media_key_in_folder('messages/' || a || '/x.jpg', 'messages/', a, true)) then
    raise exception 'media-refs: a helper refused a value the app writes';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
