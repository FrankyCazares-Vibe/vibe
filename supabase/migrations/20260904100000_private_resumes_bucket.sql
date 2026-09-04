-- Session 53 / A1: resumes + portfolio docs move out of the public
-- `profiles` bucket into a private `resumes` bucket.
--
-- 1. `resumes` bucket: public = false. There are deliberately NO
--    storage.objects policies for it — only the service role (server
--    routes) can upload, sign, list, or delete. Viewing goes through
--    GET /api/resume/<uid>/resume-<uuid>.<ext>, which checks auth + blocks
--    and issues a short-TTL signed URL.
-- 2. `profiles` bucket stays public for avatars / banners / post images,
--    but the world-listable SELECT policy (`profiles_public_read`, granted
--    to the `public` role → anon key could enumerate every user's folder)
--    is replaced with owner-only SELECT. Public object URLs keep working
--    because `public = true` buckets bypass RLS on /object/public/.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resumes',
  'resumes',
  false,
  8388608,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "profiles_public_read" ON storage.objects;

DROP POLICY IF EXISTS "profiles_select_own" ON storage.objects;
CREATE POLICY "profiles_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'profiles'
  AND COALESCE((string_to_array(name, '/'))[1], '') = auth.uid()::text
);
