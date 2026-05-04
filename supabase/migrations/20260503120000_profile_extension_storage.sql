-- Rich profile fields + work history; public profile assets bucket.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tagline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS headline text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS location_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS work_experience jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recruiter_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS banner_gradient text NOT NULL DEFAULT '';

-- ---------------------------------------------------------------------------
-- Storage: user-scoped uploads (path = {auth.uid()}/...)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profiles',
  'profiles',
  true,
  8388608,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "profiles_public_read" ON storage.objects;
CREATE POLICY "profiles_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'profiles');

DROP POLICY IF EXISTS "profiles_insert_own" ON storage.objects;
CREATE POLICY "profiles_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'profiles'
  AND (COALESCE((string_to_array(name, '/'))[1], '') = auth.uid()::text)
);

DROP POLICY IF EXISTS "profiles_update_own" ON storage.objects;
CREATE POLICY "profiles_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'profiles'
  AND (COALESCE((string_to_array(name, '/'))[1], '') = auth.uid()::text)
);

DROP POLICY IF EXISTS "profiles_delete_own" ON storage.objects;
CREATE POLICY "profiles_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'profiles'
  AND (COALESCE((string_to_array(name, '/'))[1], '') = auth.uid()::text)
);
