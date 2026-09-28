-- S67 security wave, batch c: a private `quarantine` bucket, so a moderator's
-- removal takes a post's photo offline instead of only hiding the row.
--
-- WHY THIS EXISTS. Security report 2026-09-27, "[High] No way to get an
-- intimate photo taken down, and 'removed' photos stay online" and "[Medium]
-- Deleted photos … and 'removed' images stay online". POST
-- /api/admin/content/remove was a soft delete only: the post row got
-- `removed_at`, but its photo stayed at a permanent URL in the PUBLIC
-- `profiles` bucket (/storage/v1/object/public/profiles/<uid>/posts/<file>),
-- so anyone who had copied the link could still open it signed out. The route
-- now MOVES the photo, and a video's poster frame, from `profiles` into this
-- bucket at the SAME object path (src/lib/moderation/media-quarantine.ts and
-- media-quarantine-store.ts). The post keeps its `media_url`, which is the
-- record of where the file came from, so an appeal restore is one move back.
--
-- WHAT THIS FILE DOES
--   1. Creates storage bucket `quarantine`: public = false, no size or type
--      limit (nothing is uploaded here; the service role only moves files in
--      that `profiles` already checked on the way in).
--   2. Adds NO storage.objects policy for it. With RLS on storage.objects and
--      no policy naming this bucket, anon and signed-in students can't list,
--      read, sign, write or delete anything in it. Only the service role
--      (server routes) can, which is the same model as the private `resumes`
--      bucket (20260904100000_private_resumes_bucket.sql).
--   3. notify pgrst, 'reload schema' (house format; storage isn't served by
--      PostgREST, so this is a no-op there).
--
-- DOES NOT: touch `profiles`, `resumes`, any existing policy, any grant, or
-- any post row. It moves no file; the route does that, one removal at a time.
--
-- LIVE STATE (read-only MCP, 2026-09-27, at c72aaa2): storage.buckets holds
-- exactly `profiles` (public, 8 MB, jpeg/png/webp/gif/pdf) and `resumes`
-- (private). storage.objects has ONE policy, `profiles_select_own` (SELECT,
-- authenticated, `bucket_id = 'profiles' AND` first folder = auth.uid()).
-- No `quarantine` bucket. 21 posts: 3 image posts whose media_url and
-- media_thumbnail_url are the same `profiles/<uid>/posts/…` URL, 2 video posts
-- with an R2 `clips/…` key and a `profiles/<uid>/posters/…` poster. 0 posts
-- are removed today, so there is nothing to back-fill.
--
-- ORDER AGAINST THE DEPLOY: apply this BEFORE the route ships. Until the
-- bucket exists every removal of a post with a photo answers 500 ("still
-- online, press Remove again") after the row is already hidden.
--
-- PRE-FLIGHT aborts if the bucket already exists, or if any storage.objects
-- policy could reach it (one that names `quarantine`, or one not scoped to a
-- single bucket by `bucket_id = '…'`). POST-CHECK re-reads both.
--
-- Tested on the local database (docker supabase_db_vibe), then a move from
-- `profiles` into `quarantine` and back through the local storage API.
-- Apply via the management API, then insert the schema_migrations row
-- (version 20260927130000).
--
-- ROLLBACK (only once the bucket is empty: move any quarantined file back to
-- `profiles` or delete it through the storage API first; storage refuses a
-- direct DELETE on storage.objects and on a non-empty bucket):
--   BEGIN;
--   DELETE FROM storage.buckets WHERE id = 'quarantine';
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927130000';
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
-- ---------------------------------------------------------------------------

begin;

set local lock_timeout = '5s';

-- 0. PRE-FLIGHT --------------------------------------------------------------
do $$
declare
  bad text;
begin
  if exists (select 1 from storage.buckets where id = 'quarantine' or name = 'quarantine') then
    raise exception 'quarantine-bucket: a bucket named quarantine already exists; stop and re-read it';
  end if;

  select string_agg(policyname, ', ') into bad
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* 'quarantine';
  if bad is not null then
    raise exception 'quarantine-bucket: a storage.objects policy already names quarantine: %', bad;
  end if;

  -- A policy with no `bucket_id = '<one bucket>'` in it applies to EVERY
  -- bucket, this new one included.
  select string_agg(policyname, ', ') into bad
    from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
         !~ 'bucket_id = ''[a-z0-9_-]+''::text';
  if bad is not null then
    raise exception 'quarantine-bucket: storage.objects policy not scoped to one bucket would reach quarantine: %', bad;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass) then
    raise exception 'quarantine-bucket: row level security is off on storage.objects';
  end if;
end $$;

-- 1. The bucket --------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quarantine', 'quarantine', false, null, null);

-- 2. No policy. Deliberately nothing here: service role only.

-- 3. POST-CHECK --------------------------------------------------------------
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'quarantine' and public = false) then
    raise exception 'quarantine-bucket: bucket missing or public after insert';
  end if;
  if exists (select 1 from pg_policies
              where schemaname = 'storage' and tablename = 'objects'
                and ((coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* 'quarantine'
                     or (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
                        !~ 'bucket_id = ''[a-z0-9_-]+''::text')) then
    raise exception 'quarantine-bucket: a storage.objects policy can reach quarantine';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
