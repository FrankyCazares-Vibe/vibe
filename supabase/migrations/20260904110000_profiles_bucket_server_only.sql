-- Session 53 / A2 follow-up: `profiles` bucket writes become server-only.
--
-- The public `profiles` bucket (avatars, banners, post images, posters,
-- logos) has carried owner-scoped INSERT / UPDATE / DELETE policies on
-- storage.objects since 20260503120000 (`profiles_insert_own`,
-- `profiles_update_own`, `profiles_delete_own`). Those policies let any
-- signed-in user PUT straight to the Supabase Storage REST API with the
-- browser anon key, bypassing every route-level control on
-- /api/me/profile-upload and /api/me/profile-sync (per-user rate limits,
-- per-kind size caps) — only the bucket's 8 MB limit and mime allow-list
-- applied to such uploads.
--
-- No first-party client uploads directly (every `storage.from(` call site
-- in src/ and public/html/ is server code). All `profiles` writes now go
-- through those server routes using the service role, which bypasses RLS,
-- so the owner-write policies are dropped. This mirrors the private
-- `resumes` bucket (20260904100000), which has never had client-side
-- write policies.
--
-- Deliberately left alone:
--   * `profiles_select_own` — owner-only listing via the authenticated key.
--   * `public = true` on the bucket — public object URLs
--     (/storage/v1/object/public/profiles/...) bypass RLS entirely, so
--     existing avatar / banner / post-image URLs keep resolving.
--
-- DEPLOY ORDER: apply this ONLY AFTER the code that uploads with the
-- service role is live (src/lib/profile/storage-upload.ts and
-- src/app/api/me/profile-upload/route.ts). Dropping these policies while
-- the cookie-client upload path is still deployed would fail every
-- avatar / banner / post-image upload with "new row violates row-level
-- security policy".

DROP POLICY IF EXISTS "profiles_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "profiles_update_own" ON storage.objects;
DROP POLICY IF EXISTS "profiles_delete_own" ON storage.objects;
