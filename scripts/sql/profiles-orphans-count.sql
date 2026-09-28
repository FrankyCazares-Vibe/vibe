-- profiles-orphans-count.sql — how many files in the public `profiles` bucket
-- nothing points at any more (S67 security wave 2, B2; report #9 "88 of 100
-- objects orphaned").
--
-- READ-ONLY. One SELECT, no writes, no deletes, no service key. It prints
-- counts by file SHAPE only, never a file name, user id or URL.
--
-- Run locally:
--   docker exec -i supabase_db_vibe psql -U postgres -d postgres -f - < scripts/sql/profiles-orphans-count.sql
-- Production: the orchestrator pastes it into the read-only Supabase MCP
-- (execute_sql). Never run it with .env.local credentials.
--
-- "Referenced" means some stored value still names the object's path
-- `<uid>/…` anywhere in it: a public URL, a bare path, or inside JSON (a
-- moderation log entry names bare paths). Over-matching only counts a file as
-- referenced, never as an orphan.
-- Where references live (critique-B2, critique-Bcross §2):
--   users.avatar_url, users.banner_url, users.work_experience (jsonb: company
--   logos), users.current_on (jsonb: working-on logos), orgs.logo_url /
--   banner_url, channels.photo_url, posts.media_url / media_thumbnail_url,
--   messages.media_url / content, reports.target_snapshot (evidence),
--   moderation_actions.meta (evidence).
-- The private `quarantine` bucket is counted on its own last line and is
-- never "orphaned": it is moderator evidence, kept on purpose.
--
-- A file listed as orphaned is NOT proof it is safe to delete: a cleanup is a
-- separate, founder-approved step (follow-up), and should re-run this first.
-- Expected on production 2026-09-28 (critique-B2): 100 objects, 15
-- referenced, 85 orphaned (avatar 35/4, banner 48/3, logos 3/3, posters 7/2,
-- posts 7/3).

with refs as (
  select r as ref from (
    select avatar_url as r from public.users
    union all select banner_url from public.users
    union all select work_experience::text from public.users
    union all select current_on::text from public.users
    union all select logo_url from public.orgs
    union all select banner_url from public.orgs
    union all select photo_url from public.channels
    union all select media_url from public.posts
    union all select media_thumbnail_url from public.posts
    union all select media_url from public.messages
    union all select content from public.messages
    union all select target_snapshot::text from public.reports
    union all select meta::text from public.moderation_actions
  ) all_refs
  where r is not null and r ~ '[0-9a-f-]{36}/'
),
objs as (
  select o.name,
         case
           when o.name ~ '^[0-9a-f-]{36}/avatar-[^/]+$' then 'avatar'
           when o.name ~ '^[0-9a-f-]{36}/banner-[^/]+$' then 'banner'
           when o.name ~ '^[0-9a-f-]{36}/posts/[^/]+$' then 'posts'
           when o.name ~ '^[0-9a-f-]{36}/posters/[^/]+$' then 'posters'
           when o.name ~ '^[0-9a-f-]{36}/logos/[^/]+$' then 'logos'
           when o.name ~ '/\.emptyFolderPlaceholder$' then 'placeholder'
           else 'other'
         end as shape
    from storage.objects o
   where o.bucket_id = 'profiles'
),
marked as (
  select shape,
         exists (
           select 1 from refs
            where strpos(refs.ref, objs.name) > 0
         ) as referenced
    from objs
)
select shape,
       count(*) as total,
       count(*) filter (where referenced) as referenced,
       count(*) filter (where not referenced) as orphaned
  from marked
 group by shape
union all
select 'ALL (profiles)', count(*), count(*) filter (where referenced),
       count(*) filter (where not referenced)
  from marked
union all
select 'quarantine (evidence, never orphaned)', count(*), null, null
  from storage.objects
 where bucket_id = 'quarantine'
 order by 1;
