# dataexp-storage lens notes (S67, HEAD 24dac9f) — files/media exposure, buckets, quarantine, R2, resume

## Live storage state (read-only SQL, 2026-09-27)
- buckets: profiles public=true (8MB, img+pdf mime), resumes public=false, quarantine public=false (no size/mime limit).
- storage.objects policies: ONLY `profiles_select_own` (authenticated, bucket=profiles AND first path seg = auth.uid()). No INSERT/UPDATE/DELETE policies, none for resumes/quarantine -> those are service-role only. SOUND for listing: a student can list only their own profiles/<uid>/ folder; anon can't list.
- storage.buckets: RLS on, no policies -> bucket metadata not listable by students (fine).
- counts: profiles 100 objects (7 posts, 35 avatar, 48 banner); resumes 40.
- migrations 20260927110000..142000 ARE applied on prod (schema_migrations rows present) despite commit msg saying "not on prod yet".

## FINDING A (new S67, Medium): hidden resume widget still served to every signed-in viewer
- UI promises "hidden · only you can see this" (public/html/profile.html:7757) / "hidden · only you see it" (src/components/mobile/ProfileMobile.tsx:370).
- src/app/api/users/[handle]/bootstrap/route.ts:219-227 strips resume_url/resume_docs ONLY for signed-out viewers; layout.hidden never consulted (grep: no hidden handling). build-vibe-user-v1.ts:171-177 even ships `profileLayout.hidden` so viewer learns what was hidden.
- src/app/api/resume/[...path]/route.ts:164-176 serves any key referenced by owner's resume_url/resume_docs to any signed-in user (block check only) -> hidden resume downloadable.
- bio/skills/work_experience/current_on: authenticated has column SELECT on users (live has_column_privilege) -> hidden experience/skills/working_on readable via PostgREST too; anon bootstrap also returns them.
- ALSO: src/app/profile/[handle]/page.tsx:25-35,63-70 generateMetadata (service role, anon) puts tagline||bio into og:description -> a HIDDEN bio still goes to signed-out visitors & link unfurls. No restriction (ban/suspend) check either.

## FINDING B (Medium, new variant of report #4/#16): post OG metadata ignores removal / hidden club / restricted author
- src/app/posts/[id]/page.tsx:29-42 service-role read `.eq("status","published")` only -> og:title "<author>: <content[0:60]>", og:description content[0:137] for REMOVED posts, hidden-club posts, suspended/banned authors.
- Live: anonymous curl of a founder post (3f859f35-...) -> 307 to login BUT body carries og:title/og:description/og:type (checked presence only; both bot and browser UA). So a signed-out visitor/unfurler with the link reads the text.
- prod today: 0 removed posts, 0 hidden-club posts -> latent. Image is guarded (profiles URL quarantined; clip thumb via media proxy which 404s removed).
- Page body :112-118 existence check has no status filter -> draft id => 307, missing => 404 (tiny existence oracle).

## FINDING C (High, variant of report #4): no takedown path for avatar/banner/org logo/group photo
- /api/admin/content/remove TABLES = post|comment|message only (route.ts:21-25); quarantine only for type=post (:181 in file). No admin route touches avatar_url/banner_url/logo_url/photo_url (grep src/app/api/admin).
- reports can target user/org/channel/event (reports.ts:29-37) with intimate_image; legal/community page.tsx:~190-200 + support page.tsx:84 promise "remove within 48 hours" and "Report ... the post, message or profile".
- Ban leaves profiles/<uid>/avatar-*.jpg public; profile generateMetadata (profile/[handle]/page.tsx:25-35) has no restriction filter -> anon og:image keeps pointing at it. Live: anon curl /profile/frankycazares -> 200 with og:image = rqopjkimxbjkwdkpkbfq.supabase.co public profiles URL (presence only).
- Manual workaround exists (dashboard delete) but no tooling, and restoring logic doesn't exist.
- A live evidence: anon GET /api/users/frankycazares/bootstrap -> 200 with vibeUser.bio/skills/workExperience + profileLayout (hidden list) (key presence only). Prod count: 1 account has 'resume' in profile_layout.hidden AND a resume doc stored -> exposed today.

## Checked, sound
- storage listing: profiles_select_own only; resumes/quarantine no policies; no SECURITY DEFINER storage fns; storage.buckets not listable.
- public objects served `cache-control: no-cache` (HEAD founder avatar + post photo) -> Supabase CDN won't serve a quarantined photo from cache. /_next/image refuses supabase URLs (400) -> no optimizer cache copy. /api/posts/[id]/media 307 is `public, max-age=0, must-revalidate`, x-vercel-cache MISS.
- /api/resume: owner id taken from key path, key must be in THAT owner's resume_url/resume_docs, block check, redacted derivative, 300s signed URL. Planting another user's key in own resume_url gives nothing new.
- messages media route: RLS hides removed (removed_at) + cleared_at + channel-folder check; 1h signed URL, 5 min private redirect cache.
- media triggers live: posts_check_media_refs / messages_check_media_ref / orgs_check_asset_refs (own folders); posts UPDATE grant = content,tags,status only.
- channels.photo_url INSERT-able with no trigger, but no channel_members INSERT policy -> planted channel never shows in threads list; not exploitable.
- restore route holds a path another REMOVED post of the same author names.

## FINDING D (High, undermines S67 fix for report #4 and every future #16 fix): CDN keeps serving moved/deleted public photos
- Org plan = FREE (get_organization bjbutegxvbusnmgeiaqa -> plan free). Smart CDN auto-invalidation on update/delete and the purge API are Pro+ only (Supabase docs smart-cdn, purge-cdn-cache).
- Live: GET (Range 0-0) of founder's own post photo profiles/df5ab44e.../posts/post-7c48...jpg -> `cf-cache-status: HIT`, `age: 477659` (~5.5 days), `cache-control: max-age=3600`. Edge holds public objects far past max-age.
- storage.objects metadata: all 100 profiles objects cacheControl max-age=3600 (browser cache 1h too).
- media-quarantine-store.ts:61-63 only moves the object; nothing purges CDN (and can't on free plan). So a removed photo's URL keeps working from any warm edge. Needs a test: founder test post -> view -> remove -> curl URL, watch cf-cache-status.
- (earlier HEAD said no-cache/MISS: HEAD differs; GET is what matters.)

## FINDING E (Medium, needs a test): post photos/videos keep EXIF/GPS
- Post composers send the raw File: PostComposerMobile.tsx:285, campus-home.tsx:6371, profile.html:6529 -> /api/me/profile-upload stores bytes as-is (route.ts:156-160, no sharp/re-encode; sharp only in resume-redact.ts). Videos: clip/org/message presigned PUT of raw bytes (r2.ts sign*PutUrl), no transcode.
- Avatars/banners go through the cropper canvas (profile.html:4334, ProfileMobile.tsx ~846) -> stripped. Posts are not.
- Served publicly (profiles bucket URL; /api/posts/[id]/media anon). Did NOT fetch any object to read EXIF (rules). Desktop uploads keep GPS for sure; iOS/Android pickers may strip.

## FINDING F (Low): restore "held" guard defeated by author deleting the other removed post
- restore/route.ts:216-221 holds a path only if another REMOVED post row still names it; author can DELETE own removed post (posts_delete_own has no removed_at guard; posts/[id]/route.ts:364), then an appeal restore of the sibling post releases the quarantined file back to public.

## Info G: account deletion wipes quarantine evidence (storage-purge.ts:260) incl. child_safety images.

## Still exploitable from prior report
- #16: DELETE /api/posts/[id] leaves profiles photo + poster public (route.ts:318-319 comment says so); avatars/banners never removed on replace; direct PostgREST DELETE (posts_delete_own) skips even R2 cleanup. D means even a future delete fix is incomplete on free plan.
## Not reachable
- Cloudflare R2 bucket public-access / r2.dev setting (no dashboard access); code has no public R2 host. removeContent() in src/lib/moderation/actions.ts:719 has no quarantine step but has no callers today.
DONE — returned via StructuredOutput.
