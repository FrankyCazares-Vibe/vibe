# Facts: profile, posts, comments, media files, and what the public can see  (read on 2026-10-03, main c71e9a4 + landing-night 21af1a5)

How to read this file:
- Paths are relative to the repo root. `mig/` is short for `supabase/migrations/`.
- "LIVE NOW" = branch main. "LANDING-NIGHT ONLY" = not live until that branch is merged.
- I read code and migrations only. I did not query the database or touch production.
- Production database level comes from a handoff, not from me:
  `handoffs/2026-10-02-session-71-close-and-next-up.md:5` says production is at migration `20261001120000`.
  `handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md:169` says `billing_stripe` and `push_notifications` are NOT applied there.
  So every migration cited below up to Oct 1 is live, except those two.
- Also checked against the Sept 29 Terms v2 (`handoffs/legal-2026-09-29/02-terms-of-service-v2.md`), because both documents must say the same thing. Conflicts are in section 7c.

## 1. What is collected or stored

### 1a. Profile

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F1 | Display name, handle, when the handle last changed | `users.name`, `users.handle`, `users.handle_changed_at` | Name and handle: anyone on the internet. Handle-change time: any signed-in account, through the data API (no screen shows it) | `mig/20260430190000_phase1_initial_schema.sql:17-18`; `mig/20260903100000_security_hardening.sql:41-48`; `src/app/api/users/[handle]/bootstrap/route.ts:34-35` |
| F2 | University (IU or Purdue) and campus; old free-text school label; when the campus was last set | `users.school_system`, `users.campus_id`, `users.school`, `users.campus_set_at` | University and campus badge: anyone. When it was set: owner only | `mig/20260916100000_campuses_school_system.sql:444-446,459`; `src/lib/profile/profile-campus-write.ts:62`; `bootstrap/route.ts:37-46` |
| F3 | Year, major, department | `users.year`, `users.major`, `users.department` | Anyone (major and year are shown as the headline) | `phase1:19-21`; `src/lib/profile/build-vibe-user-v1.ts:37-46` |
| F4 | Tagline, headline, location (free text you type), website | `users.tagline`, `users.headline`, `users.location_text`, `users.website` | Anyone | `mig/20260503120000_profile_extension_storage.sql:4-7`; `build-vibe-user-v1.ts:76-84` |
| F5 | Bio | `users.bio` | Anyone, unless the owner hid the bio widget. The column is server-only since Sept 28 | `mig/20260928160000_users_profile_widgets_server_only.sql:155`; `src/lib/profile/hidden-fields.ts:62` |
| F6 | Interests (shown as tags), skills | `users.interests`, `users.skills` | Interests: anyone. Skills: anyone unless hidden | `phase1:27-28`; `hidden-fields.ts:67` |
| F7 | Work experience, up to 15 entries: title, company, dates, location, description (up to 4,000 characters), logo address; and whether the order is manual | `users.work_experience` (JSON), `users.work_order_manual` | Anyone, unless hidden | `src/lib/profile/work-experience.ts:1-52`; `hidden-fields.ts:63-66` |
| F8 | "Working on", up to 10 entries: icon, text (160 characters), logo address | `users.current_on` (JSON) | Anyone, unless hidden | `src/lib/profile/current-on.ts:6-18,45-64` |
| F9 | "What are you here for?" answers | `users.looking_for` | Owner only. Blanked for every other viewer, signed in or not. Column is server-only | `bootstrap/route.ts:252-263,329-332`; `mig/20260922130000_users_profile_detail_server_only.sql:163` |
| F10 | Profile photo, cover photo, cover colour preset | `users.avatar_url`, `users.banner_url`, `users.banner_gradient`; files in the PUBLIC bucket `profiles` at `<user id>/avatar-*` and `<user id>/banner-*` | Anyone who has the file link. The two columns may only name the owner's own file on Vibe's storage | `src/app/api/me/profile-upload/route.ts:204-220`; `src/lib/media/profile-photo-replace.ts:10-14`; `mig/20260912102000_users_media_url_host_lock.sql` |
| F11 | Logos on work and "working on" entries | A file in the PUBLIC bucket `profiles` at `<user id>/logos/logo-*`, OR any outside web address the student typed | Anyone who can see the entry | `profile-upload/route.ts:48-55`; `work-experience.ts:26-46`; `current-on.ts:22-35`; `src/lib/moderation/media-quarantine-images.ts:9-11` ("or any outside address") |
| F12 | Résumé / portfolio documents, up to 3: name, type, and either an uploaded file or an outside link | `users.resume_docs` (JSON), `users.resume_url`; files in the PRIVATE bucket `resumes` at `<user id>/resume-*` | See F49. Columns are server-only | `src/lib/profile/resume-docs.ts:10-25`; `src/lib/profile/resume-storage.ts:94-116`; `mig/20260905100000_revoke_resume_redactions_select.sql:38` |
| F13 | Redaction bars drawn on a résumé, and the redacted copies the server makes | `users.resume_redactions` (JSON); copies in `resumes/<user id>/redacted/` | Bars: owner only, never sent to anyone else. Copies: what every other viewer gets | `bootstrap/route.ts:291-328`; `resume-storage.ts:302-359` |
| F14 | Profile layout: widget order, which widgets are hidden, bio on the side or not | `users.profile_layout` (JSON) | Order: anyone. The hidden list: owner only (others always get an empty list) | `mig/20260926100000_users_profile_layout.sql:124`; `hidden-fields.ts:50-60` |
| F15 | Pinned post | `users.pinned_post_id` | Anyone (the id is in the public profile answer) | `mig/20260504170000_user_pinned_post.sql:9`; `bootstrap/route.ts:371-386` |
| F16 | Old "recruiter snapshot" | `users.recruiter_snapshot` (JSON). The column still exists. No code reads or writes it. It held data on 7 accounts on Sept 21 | Server only | `mig/20260922130000_users_profile_detail_server_only.sql:35-45,64-66,163`; `src/lib/profile/self-write-columns.ts:15-16` |
| F17 | Lifetime count of profile views | `users.profile_view_count` | Owner sees it on the metrics screen. Any signed-in account can read anyone's number through the data API | `mig/20260513000000_profile_views_and_user_view_count.sql:27-28`; `mig/20260903100000_security_hardening.sql:41-48` |
| F18 | Last active time | `users.last_active_at` | Any signed-in account can read anyone's, through the data API. The app itself only shows a count ("active now") | `src/app/api/me/heartbeat/route.ts:27-30`; `mig/20260903100000_security_hardening.sql:41-48` |
| F19 | Date the account was created | `users.created_at` | Any signed-in account, through the data API | `phase1:31`; `mig/20260903100000_security_hardening.sql:41-48` |

The closed list of profile fields a student can save is in `src/lib/profile/self-write-columns.ts:27-50`:
name, tagline, website, headline, location_text, bio, major, department, year, interests, skills, looking_for, work_experience, work_order_manual, current_on, resume_redactions, resume_url, resume_docs, avatar_url, banner_url, banner_gradient, profile_layout.

### 1b. Posts, comments and reactions

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F20 | Posts: text (up to 2,000 characters), tags, type, photo or video reference, club, campus and university stamp, created time, edited time, view counter, video text overlays | `posts.content`, `tags`, `type`, `media_url`, `media_thumbnail_url`, `org_id`, `campus_id`, `school_system`, `created_at`, `edited_at`, `view_count`, `edit_metadata` | Every signed-in account, at any campus, verified or not. Not shown: to a blocked pair; a hidden club's posts to non-members; a post a moderator removed; posts by a suspended or banned author. See section 2 for what signed-out people get | `phase1:48-57`; `src/app/api/me/publish-post/route.ts:24`; `mig/20260916130000_post_edited_at.sql:9-14,265`; `handoffs/legal-2026-09-29/00-code-facts.md:183-187` |
| F21 | Drafts | `posts.status = 'draft'` | Author only. A draft's media link answers 404 to everyone else | `mig/20260516100000_post_drafts.sql:8`; `src/app/api/posts/[id]/media/route.ts:84-91` |
| F22 | A post's photo | PUBLIC bucket `profiles` at `<user id>/posts/post-*` | Anyone with the file link | `profile-upload/route.ts:48-55,204` |
| F23 | A post's video, and its poster frame (the still shown before it plays) | Video: Cloudflare R2 at `clips/<user id>/<random>.mp4|mov|webm`. Poster: PUBLIC bucket `profiles` at `<user id>/posters/poster-*` | Video: anyone, through `/api/posts/<id>/media` (no login). Poster: anyone with the file link | `src/app/api/me/clip-upload-url/route.ts:88`; `posts/[id]/media/route.ts:27-31,143-144` |
| F24 | Photos and videos on a club's posts; club logo and banner | Cloudflare R2 at `orgs/<club id>/posts/`, `/logo/`, `/banner/` | Anyone, through `/api/posts/<id>/media` and `/api/orgs/<handle>/asset/<kind>` (no login), unless the club is hidden | `src/app/api/orgs/[slug]/upload-url/route.ts:167-172`; `src/app/api/orgs/[slug]/asset/[kind]/route.ts:18-19,52-59` |
| F25 | Comments and replies (up to 1,000 characters; replies one level deep) | `post_comments` | Every signed-in account that can see the post. Hidden from a blocked pair | `src/app/api/posts/[id]/comments/route.ts:13,118-145` |
| F26 | Likes on posts and on comments | `post_likes`, `comment_likes` | The count: everyone who sees the post. WHO liked: only the liker can read their own rows. The post's author still gets a notification naming the liker | `mig/20260922110000_t1_close_world_readable_selects.sql:13-17,60-66` |
| F27 | Reposts, with an optional note (up to 500 characters) | `post_reposts` | The repost shows on the reposter's profile to signed-in viewers. The table itself: own rows only | `mig/20260508100000_post_reposts.sql:13-19`; `src/app/api/users/[handle]/reposts/route.ts` (401 without login) |
| F28 | Saved posts | `bookmarks`. `collection_id` is always written as null. The `bookmark_collections` table exists but no code uses it: there are no named collections today | The saver only. The post's author sees HOW MANY people saved it, never who | `src/app/api/posts/[id]/save/route.ts:105`; `phase1:59-73,295-303`; `src/app/api/me/posts/[id]/savers/route.ts:7-13` |
| F29 | Tags | `posts.tags`, re-read from the text by the server on every edit | Same as the post. Counted for "trending" on the viewer's campus over 7 days | `src/app/api/posts/[id]/route.ts:566-570`; `src/app/api/trending/hashtags/route.ts` (WINDOW_DAYS = 7) |
| F30 | @mentions | A notification row for the person mentioned | That person | `posts/[id]/route.ts:602-621` |

### 1c. Things Vibe records by itself

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F31 | Profile views: whose profile, WHO looked, the date, the web address the viewer came from (up to 80 characters), the time. One row per viewer per profile per day. Own views and signed-out views are not recorded | `profile_views`, plus the counter in F17 | Server only (no client role can read the table since Sept 28). The profile's owner gets counts free and names with Vibe+ (F46) | `mig/20260513000000_profile_views_and_user_view_count.sql:30-37,49-80`; `mig/20260928140000_profile_views_server_only.sql:14-19`; `src/app/api/profile-views/route.ts:26-55`; `src/components/mobile/ProfileMobile.tsx:599-600` |
| F32 | Post views: which post, WHO viewed, the date. One row per viewer per post per day. The author's own views and signed-out views are not recorded | `post_views`, plus `posts.view_count` | Server only. The author gets the count free and names with Vibe+ (F47) | `mig/20260508110000_post_views.sql:18-32`; `mig/20260912100500_post_views_self_guard.sql`; `src/app/api/posts/[id]/view/route.ts:36-41` |
| F33 | Last active time. Sent when the Campus page opens and about every 30 seconds while it is on screen. No other page sends it | `users.last_active_at` | See F18 and F48 | `src/app/campus/campus-home.tsx:4661-4673`; `src/app/api/me/heartbeat/route.ts:6-15` |
| F34 | A copy of reported content, taken when a report is filed. Post: text, photo and video references, club, created time. Comment: text. Person: profile fields plus bio. Always with the owner's handle and name at that moment | `reports.target_snapshot` (JSON), `reports.target_owner_id` | Platform admins only | `src/app/api/me/reports/route.ts:90-92,361,366-386` |
| F35 | Photos a moderator took down, or that were replaced or deleted while a report was open | PRIVATE bucket `quarantine`, same path as the original | Server only. A platform admin can open a 2-minute link | `mig/20260927130000_quarantine_bucket.sql:16-25`; `src/app/api/admin/images/route.ts` (PREVIEW_SEC = 120) |
| F36 | Search words | Not stored on the server. The search routes read `?q=` and answer. The words travel in the web address, so the host's request log can hold them (my inference; log contents are not in code) | No one on Vibe | `src/app/api/search/route.ts`; `src/app/api/users/search/route.ts` (no insert in either) |

### 1d. Kept in the browser (localStorage), for this area

| # | Key | What it holds | Evidence |
|---|---|---|---|
| F37 | `vibe_user_v1` | A copy of your own profile | `src/lib/profile/build-vibe-user-v1.ts:47-49`; `public/html/_persistence.js` |
| F38 | `vibe_posts_v1`, `vibe_vibes_v1` | A copy of your own posts (desktop profile page) | `public/html/_persistence.js:13-14`; `public/html/profile.html:9612-9646` |
| F39 | `vibe_relationships_v1` | Your follow list | `src/lib/pwa/leave-device-clean.ts:47` |
| F40 | `vibe_recent_searches_v1` | Your recent search words | `src/app/campus/campus-home.tsx:5445`; `public/html/profile.html:7159` |
| F41 | `vibe_profile_tour_seen_v1`, `vibe_campus_tour_seen_v1`, `vibe_network_tour_seen_v1`, `vibe_tour_pending` | Whether you saw each tour | `src/components/settings/SettingsClient.tsx:164-166` |

F42. These keys are now wiped at sign-out and at account deletion, not only when you clear site data.
The wipe list: `vibe_user_v1`, `vibe_posts_v1`, `vibe_vibes_v1`, `vibe_relationships_v1`, `vibe_otto_lastpost_v1`, `vibe_otto_v1`, `vibe_cal_events_v1`, `vibe_recent_searches_v1`, plus the push keys.
The tour flags stay on purpose.
Evidence: `src/lib/pwa/leave-device-clean.ts:36-56,74-80`.

### 1e. Photo details (EXIF, GPS location, camera, owner name): which uploads remove them

How it works: the server decodes the picture and writes it back in the same format with no metadata, turned upright, and shrunk if large.
Only JPEG, PNG, GIF and WebP are accepted. Evidence: `src/lib/media/strip-image.ts:5-25,87-142`.

| # | Upload | Goes through | Details removed? | Evidence |
|---|---|---|---|---|
| F43a | Profile photo (max 6 MB, shrunk to 1024 px) | `/api/me/profile-upload` or the profile save | YES | `profile-upload/route.ts:19-26,39-46,158-189`; `src/lib/profile/storage-upload.ts:27-32,51-58` |
| F43b | Cover photo (max 6 MB, shrunk to 2560 px) | same | YES | same |
| F43c | Photo on your own post (max 8 MB, shrunk to 2048 px) | `/api/me/profile-upload` kind `post` | YES | `profile-upload/route.ts:23,43`; `src/components/mobile/PostComposerMobile.tsx:287-288` |
| F43d | A video's poster frame (max 2 MB, shrunk to 1920 px) | `/api/me/profile-upload` kind `poster` | YES | `profile-upload/route.ts:24,44`; `PostComposerMobile.tsx:258-259` |
| F43e | Work logo you upload (max 2 MB, shrunk to 512 px) | `/api/me/profile-upload` kind `logo` | YES | `profile-upload/route.ts:25,45` |
| F43f | Résumé or portfolio IMAGE (max 8 MB, full size kept) | `/api/me/profile-upload` kind `resume`, or the desktop profile save | YES | `profile-upload/route.ts:82-88`; `resume-storage.ts:120-129` |
| F43g | Résumé PDF | same | NO. "PDFs are stored as sent." A PDF's own properties (author name, software) stay in the file | `profile-upload/route.ts:88,158-163` |
| F43h | Video on a post (max 200 MB) | Browser sends it straight to Cloudflare R2 | NO | `src/app/api/me/clip-upload-url/route.ts:19-29,88-93` |
| F43i | Photo or video on a CLUB post (15 MB / 200 MB) | Browser sends it straight to R2 | NO | `src/app/api/orgs/[slug]/upload-url/route.ts:36-41,167-178`; `src/app/orgs/[handle]/admin-actions.tsx:575-603` |
| F43j | Club logo (5 MB) and club banner (10 MB) | Browser straight to R2 | NO | `orgs/[slug]/upload-url/route.ts:36-41` |
| F43k | Photo or video sent in a chat (15 MB / 200 MB) | Browser straight to R2 | NO | `src/app/api/me/messages-upload-url/route.ts:16-17,38-44` |
| F43l | Group chat picture (10 MB) | Browser straight to R2 | NO | `src/app/api/me/group-photo-upload-url/route.ts:14` |

F43m. The copy of a résumé that other people get, when the owner drew redaction bars, has no metadata either way.
A redacted PDF is rebuilt as pictures of each page: "no text layer, no fonts, no original content streams".
Evidence: `src/lib/profile/resume-redact.ts:21-30`.
A résumé PDF with NO bars is served as the original file.
Evidence: `resume-storage.ts:302-306` ("the document has no redaction bars → `key` (original is fine)").

## 2. Who can see it

### 2a. Anyone on the internet (no account)

F44a. The profile share page `connectvibe.app/profile/<handle>` and its data answer `/api/users/<handle>/bootstrap` work with no login.
A signed-out visitor gets: the internal account id, name, handle, tagline, headline (major and year), location text or campus, website, bio, interests, skills, the school badge with campus, profile photo, cover photo or colour, work experience, "working on", widget order, follower / following / connection COUNTS, and the pinned post's id.
Evidence: `src/app/api/users/[handle]/bootstrap/route.ts:34-46,247-263,338-388`; `src/lib/profile/build-vibe-user-v1.ts:76-180`; `src/app/profile/[handle]/page.tsx:134-136` ("Intentionally not campus-gated").

F44b. A signed-out visitor does NOT get: sign-in email, school email, résumé documents or links, redaction bars, the "here for" answers, the list of hidden widgets, or the fields of any widget the owner hid (bio, experience, skills, working on, résumé).
A hidden widget "reads exactly like one never filled in".
Evidence: `bootstrap/route.ts:28-31,255-273`; `src/lib/profile/hidden-fields.ts:39-71`.

F44c. A signed-out visitor does NOT get the person's posts. The posts, reposts, followers, following, connections and mutuals routes all answer 401 without a login.
Evidence: `src/app/api/users/[handle]/posts/route.ts:49`; same check in `followers`, `following`, `connections`, `mutuals`, `reposts`.

F44d. A suspended or banned account's profile answers the same 404 as a handle that does not exist, to everyone except the person and platform admins. Its link preview is the bare `@handle · Vibe` title.
Evidence: `bootstrap/route.ts:189-201`; `src/app/profile/[handle]/page.tsx:85-88,165-174`.

F44e. The profile's link preview tags (what chat apps and social sites show) carry: name, handle, the tagline, or else the first 160 characters of the bio unless the bio is hidden, and the profile photo's file address.
Evidence: `src/app/profile/[handle]/page.tsx:90-117`; `hidden-fields.ts:109-119`.

F44f. Search engines are allowed to index these pages. `robots.txt` allows everything, and the profile and club pages carry no "noindex".
Evidence: `src/app/robots.ts:13-27`; `grep -rn "noindex\|robots:" src/app` finds it only on auth pages and the suspended page.

F44g. Files in the public bucket `profiles` (profile photos, covers, post photos, poster frames, uploaded work logos) open for anyone who has the exact link. The links never expire. The bucket cannot be listed.
Evidence: `profile-upload/route.ts:74-78,219-220`; `mig/20260904100000_private_resumes_bucket.sql:9-13`.

F44h. A post's video or club media: `/api/posts/<id>/media` needs no login and redirects to a storage link that lasts 1 hour.
It answers 404 for a draft (except to its author), for a post a moderator removed, for a post whose author is suspended or banned, and for a hidden club's post.
Evidence: `src/app/api/posts/[id]/media/route.ts:27-47,84-114,143-144`.

F44i. A post's share link `connectvibe.app/posts/<id>`: the page itself sends a signed-out visitor to the login page. Its preview tags are public and carry: the author's name (or @handle), the first 60 characters of the text in the title, up to 140 characters of the text in the description (137 plus "…" when longer), and the post's photo or poster frame.
The preview is generic ("Post · Vibe") for a removed post, a hidden club's post, a suspended or banned author, and a draft.
Evidence: `src/app/posts/[id]/page.tsx:36-144,158-164`.

F44j. Club pages `connectvibe.app/orgs/<handle>` and `/api/orgs/<handle>/profile` need no login. They show: name, description, logo, banner, links, philanthropy text, verified mark, join rule and audience, member count, follower count once it reaches 5, and the club's newest posts (up to 12) with each author's name, handle and photo. This is true for clubs you must ask or be invited to join. A hidden club is a 404 to everyone outside it.
Evidence: `src/app/orgs/[handle]/page.tsx:139-146,184-187,240-281`; `src/app/api/orgs/[slug]/profile/route.ts:22-52`; `src/lib/club-routes/club-posts.ts:25,28`; `src/lib/orgs/join-copy.ts:106,616-618`.

F44k. API routes in this area that answer with no login: `/api/users/<handle>/bootstrap`, `/api/orgs/<handle>/profile`, `/api/orgs/<handle>/asset/logo|banner`, `/api/posts/<id>/media`. `/api/profile-views` and `/api/posts/<id>/view` accept a signed-out call but record nothing.
Evidence: a scan of every `src/app/api/**/route.ts` for a 401; `src/app/api/profile-views/route.ts:26-28`; `src/app/api/posts/[id]/view/route.ts:38-42`.

F44l. LANDING-NIGHT ONLY. The new landing page plays a demo film stored on Vercel Blob (a public file host). The code comment says: "The film shows the founders' own photos with real people in them".
Evidence: `src/lib/landing/demo-media.ts:4-8,27` on branch `landing-night`.

### 2b. Every signed-in account

F45a. Everything in 2a, plus other people's published posts, comments, reposts and the people on their follower, following and connection lists.
The read routes need a login but not a verified school email, and posts are readable at every campus.
Evidence: `handoffs/legal-2026-09-29/00-code-facts.md:183-187`; `src/app/api/users/[handle]/posts/route.ts:120-128`.

F45b. Follower / following / connection LISTS (not only counts) are shown to any signed-in viewer. Each row is a profile card: name, handle, photo, cover, major, year, mutual count. Limits: 120 list reads a minute per viewer; a blocked pair gets an empty list; people in a block pair with the viewer are left out.
The database itself no longer lets one student read other people's follow rows: only the routes do.
Evidence: `src/app/api/users/[handle]/followers/route.ts:24-41`; `src/lib/connections/queries.ts:374-385,424`; `mig/20260922110000_t1_close_world_readable_selects.sql:13-18`.

F45c. A signed-in viewer still does NOT get: hidden widgets' fields, the "here for" answers, redaction bars, either email address.
Evidence: `bootstrap/route.ts:265-273,304-332`.

F45d. A blocked pair: the profile answer carries only id, name, handle and photo, with "Profile unavailable". Posts between a blocked pair are hidden by the database too.
Evidence: `bootstrap/route.ts:217-245`; `mig/20260928120000_blocks_in_rls.sql`.

F45e. Search (people, clubs, events) needs a login. People are matched by name or handle only. A result shows id, name, handle, school label, major, year and photo. People search reaches every campus and both universities. Accounts that are not school-verified or not onboarded are left out. Blocked pairs are left out.
Evidence: `src/app/api/search/route.ts:205,214` (`.eq("school_verified", true)`, select `id,name,handle,school,major,year,avatar_url`); `src/app/api/users/search/route.ts:118,125`.

F45f. Through the database's data API (not through any screen), any signed-in account can read these columns of ANY account: id, school, school_verified, name, handle, year, major, department, photo and cover addresses, interests, tagline, website, headline, location text, cover colour, pinned post, work-order flag, university, campus, AND `created_at`, `last_active_at`, `handle_changed_at`, `profile_view_count`.
A suspended or banned account's row is hidden.
Evidence: `mig/20260903100000_security_hardening.sql:39-48` minus the later revokes (`20260905100000:38`, `20260922130000:163`, `20260927141000:124`, `20260928160000:155`); `mig/20260916100000_campuses_school_system.sql:459`; `mig/20260923090000_moderation_foundation.sql:2330-2333`.
Searched for a later revoke of those four activity columns: `grep -n -i "revoke.*\(last_active_at\|profile_view_count\|handle_changed_at\|created_at\)" supabase/migrations/*.sql` → NOT FOUND for `users`.

### 2c. Only the owner, or only with Vibe+

F46. Who viewed your profile.
- Free: four counts (today, 7 days, 30 days, all time) and, on the web, one line: "{N} people looked at your profile this week." with a "See who · Vibe+" link. No names are sent to a free account at all ("`recent` is ABSENT FROM THE RESPONSE BODY").
- Vibe+: the list of viewers for the last 90 days, newest first, 25 at a time (max 50 per page), each as a profile card with the day they last looked. People the owner blocked or muted are left out of the list, not out of the counts.
- The viewer cannot opt out and is not told. There is no private browsing mode.
- Production today: billing is OFF, so nobody can buy Vibe+. An entitlement can still be granted by hand (`source = 'comp'`). A migration header recorded "1 entitlements row" on production on Sept 27.
Evidence: `src/app/api/me/profile-views/route.ts:17-35,69-71,236-248`; `src/app/api/me/profile-viewers/route.ts:8-9,56-60`; `src/lib/metrics/profile-viewers.ts:86` (WINDOW_DAYS = 90); `src/components/otto/OttoMetrics.tsx:318-332`; `mig/20260912101000_entitlements.sql:146,196-198`; `mig/20260928140000_profile_views_server_only.sql:10-12,64`.

F47. Who viewed your post.
- Free: the number of people. No names ("the response contains NO `users` key at all").
- Vibe+: the names, as profile cards, 25 at a time. All time, no window.
- The author's own views never count.
Evidence: `src/app/api/me/posts/[id]/viewers/route.ts:15-28,60-63`; `src/lib/metrics/post-audience.ts:189-244`.

F48. "Active now". The Campus banner shows how many people on your campus pinged in the last 5 minutes. It is a count; no screen shows one person's status. The raw timestamp is still readable per person through the data API (F45f).
Evidence: `src/app/api/stats/campus/route.ts:9-12,48`; `grep -rn "last_active_at" src` finds only the heartbeat write and this count.

F49. Résumé and portfolio documents. Another person can open one only when ALL of these hold: they are signed in; they have a verified school email; neither has blocked the other; the owner is not suspended or banned; the owner did not hide the résumé widget; the document is still listed on the owner's profile.
The link lasts 5 minutes. With redaction bars the viewer gets the burned-in copy, never the original; if that copy cannot be made the answer is an error, not the original.
An outside-link document that has bars is hidden from other viewers entirely.
There is no "recruiter" role and no admin exception.
Limit: 120 opens per 10 minutes per viewer.
Evidence: `src/app/api/resume/[...path]/route.ts:28,118-157,175,239-256`; `src/lib/profile/hidden-fields.ts:87-103`; `bootstrap/route.ts:275-328`.

F50. Saves. Only you see what you saved ("Only you can see your saves."). The post's author sees a COUNT of other people who saved it, on every tier, and never a name.
Evidence: `public/html/profile.html:3824`; `src/app/api/me/posts/[id]/savers/route.ts:7-13,41`.

F51. Creator stats screen (owner only): totals and 7-day / 30-day numbers for views, likes, comments, reposts and saves across your own posts, and your top 5 posts. Numbers only.
Evidence: `src/app/api/me/creator-stats/route.ts:8-58`.

F52. Drafts, the hidden-widget list, redaction bars, "here for" answers, and when you last set your campus: owner only. (F9, F13, F14, F21, F2.)

### 2d. Club owners and admins

F53. A current owner or admin of a club can delete any post made as that club, including one an earlier officer wrote. Mods cannot. They cannot edit someone else's club post.
Evidence: `src/app/api/posts/[id]/route.ts:405-415`; `mig/20260929110000_post_club_deletes.sql:37-42`.

### 2e. Platform admins and the server

Who is a platform admin is a flag set by hand in the database (`users.is_platform_admin`), not something the code decides. I did not read the database, so I cannot say which accounts hold it today.

F54. Platform admins can see: reported content with its snapshot (F34), posts and comments a moderator removed, quarantined photos through 2-minute links, and every photo slot of an account, club or group chat. They see no email addresses on those screens.
Evidence: `src/app/api/admin/images/route.ts` (docblock: "No emails, no other profile fields"); `handoffs/legal-2026-09-29/00-code-facts.md:433`.

F55. Anyone holding the server's master database key (today: the operator) can read everything, including the server-only columns and tables above. Nothing in the code records such reads.
Evidence: the service-role client is used for every server-only read cited above; `grep -rn -i "audit" src/lib/supabase` → NOT FOUND.

## 3. How long it is kept and what deletes it

### 3a. Deleting or changing one thing

F56. Editing a post. The new text replaces the old text in place. No earlier version is kept by the edit. The database stamps `edited_at` when a PUBLISHED post's text changes; saving the same text, or editing a draft, stamps nothing. A published post cannot go back to draft. Only the text can be edited (tags are re-read from it); the photo or video cannot be swapped. 30 edits per 10 minutes.
One exception to "no earlier version": if someone reported the post before the edit, the report keeps its own copy of the text as it was (F34).
Evidence: `src/app/api/posts/[id]/route.ts:566-606,632`; `mig/20260916130000_post_edited_at.sql:277-285,301-302`; `src/app/api/me/reports/route.ts:91`.

F57. Deleting a post (your own, or a club post as its owner/admin). The row is deleted at once. Its likes, comments, saves, reposts, view rows and notifications go with it. Then the files go: the photo and poster frame in `profiles`, the video in R2 `clips/`, and a club post's file in R2 `orgs/<club>/posts/`.
The file step is best-effort: "a storage failure is logged and never fails the answer". A file another post or the author's photo/cover still uses is kept.
"A copy of a public photo can stay in the CDN's cache for a few days".
30 deletes per 10 minutes.
Evidence: `src/app/api/posts/[id]/route.ts:427-440,459,508-543`; `src/lib/posts/delete-media-store.ts:15-39,159-199`; `src/lib/posts/delete-media.ts:12-22`.

F58. Deleting a post while a report about it is open: the photo and poster frame are MOVED to the private `quarantine` bucket instead of deleted, and the video stays in R2 (nothing serves it). If the report cannot be read, the post is treated as reported.
Evidence: `delete-media-store.ts:24-29,176-185`.

F59. A post a moderator removed cannot be deleted or edited by its author: "409 `post_removed`". The row and its files are kept as the record. The author still sees it with a "Removed by Vibe moderators" notice.
Evidence: `posts/[id]/route.ts:416-418,499-504,584-586`; `mig/20260929110000_post_club_deletes.sql:33-36`.

F60. Deleting a comment: there is NO way in the app. No route deletes a comment and no screen has the button. A comment goes only when its post is deleted, when its author's account is deleted, or when a moderator removes it (hidden, row kept).
The database policy `post_comments_delete_own` would allow the author to delete it; nothing calls it.
Evidence: `src/app/api/posts/[id]/comments/route.ts` exports only GET and POST (`:147,338`); `grep -rn -i "delete comment\|deleteComment\|comment.*delete\|removeComment" src/components src/app public/html` → no delete feature; `mig/20260504130000_post_likes_comments.sql:58-60`.

F61. Unliking, un-reposting, un-saving, unfollowing: the row is deleted at once.
Evidence: `src/app/api/posts/[id]/like/route.ts:131`; `repost/route.ts:215`; `save/route.ts:124` (DELETE handlers).

F62. Deleting one chat message you sent: the message row is deleted. Its attached photo or video file is NOT deleted. Because the row is gone, account deletion cannot find the file later either. The file stays in R2. It is private: nothing can make a link to it any more.
Evidence: `src/app/api/me/threads/[id]/messages/[messageId]/route.ts` (the sender's path is a plain row delete at `:96-102`; `grep -n -i "media\|r2\|purge"` in that file → NOT FOUND); `src/lib/profile/storage-purge.ts:46-55` (the purge reads keys from rows that still exist).

F63. Group chat pictures are never deleted by any code path: not when replaced, not when the group ends, not at account deletion. The only R2 delete helpers accept `messages/…` keys, `clips/<id>/` folders and `orgs/<id>/` folders.
Evidence: `src/lib/r2.ts:287-290,301-307,419-447` ("`groups/<channelId>/` … is shared, not user-owned, and must survive an account deletion").

F64. Replacing or removing your profile photo or cover: the old file is deleted from the public bucket. While a report about you is open, it is moved to `quarantine` instead. Best-effort: "a failure here is logged and never fails the save".
Older stray copies from before this fix (Sept 28) were not swept: the code comment counts "76 of the 88 orphaned files live". They go at account deletion, or when a moderator takes the photo down.
Evidence: `src/lib/media/profile-photo-retire.ts:10-25,107-147`; `src/lib/media/profile-photo-replace.ts:2-4`; `src/app/api/admin/images/_lib/sweep.ts:10-16`.

F65. Replacing or removing a work logo you uploaded: the old file is NOT deleted. Only photo and cover files are retired. It stays at its public link until account deletion.
Evidence: `src/lib/media/profile-photo-replace.ts:44-47` (only slots `avatar` and `banner`); `src/lib/media/profile-image-key.ts:26-28`.

F66. Removing a résumé or portfolio document: the file is deleted from the private bucket in the same save (best-effort), and the redacted copies are thrown away and rebuilt on the next view.
Evidence: `src/app/api/me/profile-sync/route.ts:827-843,866-898`; `src/lib/profile/resume-storage.ts:202-213,361-395`.

F67. Hiding a profile widget does not delete anything. It stops the server sending those fields to anyone else.
Evidence: `src/lib/profile/hidden-fields.ts:8-12`.

### 3b. Things with no time limit

F68. Profile-view rows and post-view rows are never pruned. The paid list shows 90 days, but the rows stay until the viewer's account, the viewed account, or the post is deleted. The stored `referrer` is never read by any route.
Evidence: no `DELETE FROM … profile_views|post_views` and no `cron.schedule` in `supabase/migrations/` (grep → NOT FOUND); `grep -rn "referrer" src/lib/metrics src/app/api/me src/app/api/admin` → NOT FOUND.

F69. Quarantined files (F35) have no deletion job. The pages say "up to a year"; the code comment says "kept for up to a year until the lawyer says how long". Nothing in the code deletes them at a year, or ever. The only scheduled job in the repo is the waitlist purge (LANDING-NIGHT ONLY).
Evidence: `src/lib/profile/storage-purge.ts:35-42`; `grep -rn "from(QUARANTINE_BUCKET_ID)" src` finds only a signed-URL read; `vercel.json` does not exist on main; on `landing-night` it holds one cron, `/api/cron/waitlist-purge`.

F70. Report snapshots (F34) are kept with no time limit. The reporter's id is cleared when the reporter deletes their account; the snapshot and the reported person's old id stay.
Evidence: `handoffs/legal-2026-09-29/00-code-facts.md:328-330,380-381`; `src/app/legal/delete-account/page.tsx:33-35`.

### 3c. Deleting the account (Settings → Danger zone, type your handle)

F71. Order: stop Vibe+ billing; delete every uploaded file; delete the login, which cascades to every row keyed to the account; sign out. If the file step fails, the account is NOT deleted and the person retries.
Files removed: all of `profiles/<user id>/` (photo, cover, post photos, poster frames, logos, older copies), all of `resumes/<user id>/` (originals and redacted copies), R2 `clips/<user id>/`, and the R2 files of chat messages the person still has.
Evidence: `src/app/api/me/route.ts:19-57,109-131`; `src/lib/profile/storage-purge.ts:343-382`.

F72. Rows removed by the cascade, for this area: profile, posts and drafts (including posts made as a club), comments on anyone's posts, likes, reposts, saves, follows in both directions, profile-view rows in both directions, post-view rows.
Evidence: `phase1:12,50,61,68-69,77-78`; `mig/20260513000000_profile_views_and_user_view_count.sql:31-32`; `mig/20260508110000_post_views.sql:19-20`; `handoffs/legal-2026-09-29/00-code-facts.md:368-377`.

F73. What survives account deletion, for this area:
- Files in `quarantine` (moderator takedowns, and files kept because a report was open). Before the sweep, the purge MOVES evidence there: photos of removed posts, files of posts with an open or acted-on report, and the current photo and cover when a report about the account is open. Evidence videos stay in R2.
- Report snapshots about the person's content (text, file references, handle and name at the time).
- Photos and videos the person posted as a club: the post rows go, the files in R2 `orgs/<club>/posts/` stay until the club itself is deleted.
- Files of chat messages they had deleted one by one (F62). Group pictures (F63).
- The handle becomes free for someone else at once.
- Copies in the CDN cache for a few days; copies and screenshots other people made.
Evidence: `storage-purge.ts:35-45,57-64,271-341,354-381`; `src/lib/posts/delete-media-store.ts:240-277` (club folder sweep runs only on club deletion); `src/app/legal/delete-account/page.tsx:194-203`.

F74. LANDING-NIGHT ONLY. Account deletion also deletes the waitlist row the account's access code came from (school address, name, answers).
Evidence: `git diff main origin/landing-night -- src/app/api/me/route.ts` (adds `forgetWaitlistForUser`).

## 4. Third parties that receive it

| # | Who | What they get, in this area | Evidence |
|---|---|---|---|
| F75 | Supabase | The database (all rows above). Three storage buckets: `profiles` (public), `resumes` (private), `quarantine` (private). Its CDN serves the public files | `profile-upload/route.ts:206`; `resume-storage.ts:109`; `mig/20260927130000_quarantine_bucket.sql` |
| F76 | Cloudflare R2 | Post videos (`clips/`), club logos / banners / post media (`orgs/`), chat photos and videos (`messages/`), group pictures (`groups/`). All private; served through signed links. Uploads go from the browser straight to R2 | `src/lib/r2.ts:13-16`; F43h–F43l |
| F77 | Vercel | Runs the site and the server code that receives profile, post and résumé uploads. Its request logs can hold the path, so search words (`?q=`) and profile handles (inference; unsure whether query strings are logged) | `src/app/api/search/route.ts`; hosting is not in code (see the infrastructure reader's file) |
| F78 | Whoever a link is pasted to | A profile, post or club link pasted into a chat app or social site lets that service fetch the public preview (F44e, F44i) and the photo | `src/app/posts/[id]/page.tsx:26-34` |
| F79 | Search engines | May index profile and club pages (F44f) | `src/app/robots.ts:13-27` |
| F80 | Any outside website a student names as a work logo | When a profile with such a logo is drawn, the VIEWER's browser fetches the image from that site, which then sees the viewer's IP address. This includes signed-out visitors. The admin panel refuses to load such addresses for exactly this reason | `src/lib/profile/work-experience.ts:26-46`; `public/html/profile.html:10344-10346`; `src/app/api/admin/images/route.ts` docblock ("it would tell that site the moderator's IP") |
| F81 | Cloudflare cdnjs and Google Fonts | Loaded by the profile page (PDF viewer library, typefaces). Covered by the infrastructure reader; listed here because the public profile page triggers them | `handoffs/legal-2026-09-29/00-code-facts.md:415-416` |
| F82 | Vercel Blob. LANDING-NIGHT ONLY | Hosts the landing page's demo film; a landing visitor's browser fetches it from `…public.blob.vercel-storage.com` | `src/lib/landing/demo-media.ts:27` on `landing-night` |
| F83 | Other students | Anything a viewer can see can be screenshotted or saved. Vibe cannot recall those copies | n/a |

NOT FOUND in this area: any analytics or advertising service receiving profile or post data (`grep` of `package.json` and `src/` per `00-code-facts.md:406-408`); any AI or image-scanning vendor receiving uploads (`00-code-facts.md:333`).

## 5. Live page: claims that are false or missing

The live page is `src/app/legal/privacy/page.tsx` (effective "September 28, 2026"). Line numbers are that file's.

FALSE or misleading:

L1. `:49-54` "When you upload a photo to your profile or a post, we remove its location details before it's stored."
False for photos on CLUB posts: they go straight to R2 and are not re-encoded (F43i). The list of exceptions that follows ("Videos, photos sent in chats, club logos and banners, and group chat pictures") leaves club post photos out. It also leaves out PDF résumés, which keep their document properties (F43g).

L2. `:85-87` "Other Vibe users see your public profile, posts, comments, reactions, RSVPs…"
- Understates: people with NO account see almost the whole profile, every non-hidden club page with its recent posts and who wrote them, post link previews, and post media through a no-login link (F44a, F44h, F44i, F44j).
- Overstates: other users do not see who liked a post or comment. They see a count. Only the post's author learns the liker's name, by notification (F26).

L3. `:60-63` "Pages you visit on Vibe, actions you take … approximate location derived from IP."
No page-visit analytics and no IP-to-location code exist (`00-code-facts.md:397-408`). What IS recorded in this area, and not said: every profile you open and every post you view is stored with your identity and the date (F31, F32), and the profile's owner or post's author can be shown your name with Vibe+ (F46, F47).

L4. `:124-125` "Deletion permanently removes your profile, posts, comments, reactions, connections, RSVPs, messages, and chat reactions." and `:145-147` "we remove your data from our live systems immediately."
Not complete. Kept: quarantined files, report snapshots, club post files, files of messages deleted one by one, group pictures, CDN copies for a few days (F73). The page's own `:156-160` covers only the quarantine part.

L5. `:156-160` "…may be kept for up to a year for safety and legal reasons".
No code deletes those files at a year or at any time (F69). Today the true statement is "kept until we delete them by hand".

L6. `:147-148` "Encrypted backups may retain copies for up to 30 days".
Cannot be confirmed from code. The Sept 7 draft (line 217) and the Sept 29 Terms v2 (§14 "Backups") both say there are NO backups. `src/app/legal/delete-account/page.tsx:47-48` has an open TODO: "no backup-retention number until you confirm the Supabase plan's backup window". The three texts disagree.

L7. `:43` "Posts, clips, comments, replies…". "Clips" are parked; the product says "video posts" (project memory, "Clips are parked").

MISSING (true today, not on the page):

L8. That the profile, club pages and post previews are public on the internet and can be indexed by search engines (F44a, F44f, F44j).
L9. Profile views and post views with identity; counts free, names with Vibe+; no way to browse privately (F31, F32, F46, F47).
L10. Résumé rules: who can open one, 5-minute links, redaction copies (F49).
L11. Hidden widgets: hiding one really withholds it from everyone else (F44b, F67).
L12. "What are you here for" answers are shown to the owner only (F9).
L13. What happens to the FILE when a post, photo, logo, résumé, message or comment is deleted (F57–F66). In particular: comments cannot be deleted one by one (F60); a deleted message's file stays (F62).
L14. Edits: no history kept, "Edited" time kept, a report may hold the earlier text (F56).
L15. Saves are private; the author sees a count (F50).
L16. Last-active time and the "active now" count (F33, F48).
L17. Follower and following lists are visible to every signed-in account; counts are public (F45b, F44a).
L18. Browser storage: a copy of your profile, posts, follow list and recent searches is kept on the device and wiped at sign-out (F37–F42).
L19. `:36-40` the profile field list omits: résumé/portfolio documents and redaction bars, "working on", "here for", profile layout, pinned post.
L20. Outside logo addresses and what the viewer's browser sends to them (F80).
L21. Moderator copies: the report snapshot and the quarantine bucket are described only as "content our moderators removed"; the snapshot of merely REPORTED content is not mentioned (F34).
L22. `:49-51` says nothing about photos uploaded before the re-encode shipped (late September). Unless the one-off re-encode was run on production, those still carry their details (S15, Q7).

## 6. Sept 7 draft: claims that are stale, false or missing

The draft is `handoffs/legal-drafts/2026-09-07-privacy-policy.md`. Line numbers are that file's.

STALE or now FALSE:

D1. `:55` "a recruiter snapshot" as a profile field. Removed from the app. The column still holds old data that no code reads (F16).

D2. `:62` "Posts (text, tags, images, video clips), … saves and saved collections." "Clips" wording; and there are no collections: every save is written with no collection (F28).

D3. `:76` "You can see your recent viewers." Now: counts free, names only with Vibe+, 90 days, table server-only (F46). The draft's `:120` and `:125` ("shown to the profile owner with your name, handle, and avatar"; "up to your 25 most recent viewers") are stale the same way.

D4. `:77` "Post views … Only the count is shown to anyone." False now: a Vibe+ author sees who viewed (F47). Also new: the author's own views are not counted (F32).

D5. `:105` logged-out visitors see everything "except your resume/portfolio documents and links, your recruiter snapshot, and your redaction bars". Now also withheld: "here for" answers, the hidden-widget list, and every hidden widget's fields; and a suspended or banned account's profile is a 404 (F44b, F44d).

D6. `:108` "the first 137 characters of the post text". The title also carries the first 60 characters, and the description is the whole text when it is 140 characters or fewer. New: the preview is generic for removed posts, hidden clubs and restricted authors (F44i).

D7. `:113` "Your full profile (section 3b) … and your published posts, comments, likes, and reposts." Likes are no longer readable by other users (count only). Hidden widgets and "here for" are not part of what others see (F26, F45c).

D8. `:115` résumés open to "Any signed-in user who has not blocked you and whom you have not blocked". Now also required: the viewer's verified school email, the owner not restricted, the résumé not hidden (F49). Same fix at `:283`.

D9. `:157` and `:284` "Chat photos/videos and group photos are served through links that expire after 5 minutes." Chat photos and videos now use a 1-hour link (the browser keeps the redirect 5 minutes). Group pictures are still 5 minutes.
Evidence: `src/app/api/me/threads/[id]/messages/[messageId]/media/route.ts:12-17`; `src/lib/r2.ts:18` (default 300 s); `src/app/api/me/threads/route.ts:879`.

D10. `:155` Supabase row lists two buckets. There are three: add the private `quarantine` bucket (F35).

D11. `:195` local storage "is cleared when you clear site data". Now also wiped at sign-out and account deletion (F42).

D12. `:201` "The poster frame … is **not** removed with the post". Stale: it is removed (F57).

D13. `:202` "Image posts: … the image file stays in storage". Stale: it is deleted, or quarantined under an open report (F57, F58).

D14. `:203` "Posts you made into an org: images and videos … are **not** removed when the post is deleted". Stale for post deletion: the file is deleted. Still true at ACCOUNT deletion: the files stay until the club is deleted (F73).

D15. `:206` "Files you replace or remove from your profile (a profile photo, banner, or work-experience logo): the previous file is not removed". Stale for photo and cover (F64). Still true for work logos (F65). Same fix at `:223` ("photos you remove from your profile stay in storage").

D16. `:227` "a report does not keep a copy of the post's text". False now: the report keeps a snapshot (F34). Also `:212` should say the snapshot is kept, not only "the report text".

D17. `:239` "Delete every file you uploaded". Now with exceptions: quarantined evidence and club post files (F73).

D18. `:285` upload description. Still right on sizes (all re-checked against the routes). Missing: photos are now re-encoded, turned upright and shrunk before storage (F43a–F43f).

D19. `:286` list of server-only data. Add: bio, skills, work experience, "working on", "here for", profile layout, the profile-view table (F5–F9, F14, F31).

STILL TRUE (re-checked on purpose, because the draft flagged them as leaks):

D20. `:204` deleting a single message does not delete its attached file, and account deletion cannot find it afterwards (F62).
D21. `:205` and `:223` you cannot delete an individual comment (F60).
D22. `:209` each edit overwrites the earlier text (F56), with the report-snapshot caveat.
D23. `:211` profile-view history has no retention window (F68).
D24. `:106` public bucket links do not expire by themselves (F44g).
D25. `:107` post media through `/api/posts/<id>/media`, no sign-in, 1-hour storage link (F44h).
D26. `:109` club pages: up to 12 recent posts with author name, handle and photo, follower count from 5 (F44j).
D27. `:78` last-active ping from the Campus page only, about every 30 seconds (F33).
D28. `:114` follower / following / connection lists visible to signed-in users (F45b).

MISSING from the draft (shipped after Sept 17):

D29. EXIF / GPS removal and its exceptions (section 1e).
D30. Profile layout and hidden widgets (F14, F44b).
D31. Moderator removal of posts, comments and photos; the "Removed by Vibe moderators" notice; quarantine; removed posts cannot be deleted by their author (F35, F59).
D32. Club owners and admins can delete any club post (F53).
D33. Saves: the author sees a count (F50). Creator stats screen (F51).
D34. Suspended or banned accounts: profile, posts, comments and post media hidden from everyone else (F44d, F44h).
D35. Search engines and link-preview services (F78, F79).
D36. Outside logo addresses (F80).
D37. Group pictures are never deleted (F63).

## 7. Surprises and open questions

### 7a. Surprises (things a privacy regulator or an App Store reviewer would ask about)

S1. Outside logo addresses leak the viewer's IP (F80). A student can set a work or "working on" logo to any web address. Every viewer's browser, signed in or not, then fetches it from that site. There is no Content-Security-Policy header to stop it (`next.config.ts:86-90` sets only Referrer-Policy and Permissions-Policy). Profile photo and cover are locked to Vibe's own storage; logos are not.
Recommendation: lock logos to Vibe's storage in code, then the policy needs no sentence about it. Until then the policy must disclose it.

S2. The live page's photo-location promise is wrong for club post photos (L1, F43i). A club officer's phone photo, posted as the club, keeps its GPS position, and the file is reachable with no login through `/api/posts/<id>/media`.
Recommendation: fix in code (send club post photos through the same re-encode), or add "photos on club posts" to the exception list now.

S3. "Up to a year" has no code behind it (F69, L5). Quarantined photos are kept forever unless someone deletes them by hand.

S4. Any signed-in account, verified or not, can read anyone's last-active time, account creation date, handle-change time and lifetime profile-view count straight from the data API (F45f). No screen shows these per person. The Sept 7 draft says "active now" is visible to signed-in users, which covers the first one only.

S5. Profile-view and post-view rows are identity logs with no retention limit (F68), and the viewer cannot opt out. The /plus page promises this on purpose: "No hiding that you viewed someone." (`src/app/plus/page.tsx:708-710`). The policy has to say it plainly, including that the names can be shown to a paying account.

S6. The /plus page says: "Three things the database already keeps private from everyone, including from us on the free tier" (`src/app/plus/page.tsx:651-652`). Read literally ("from us" = Vibe), it is not true: the server and the operator can read both view tables (F31, F32, F55). The Privacy Policy must not repeat it.

S7. Comments cannot be deleted by their author (F60). The Sept 29 Terms v2 says they can (7c, T1).

S8. Files that are never deleted: the file of a chat message deleted one by one (F62), group pictures (F63), work logos replaced before account deletion (F65), and, at account deletion, files the person posted as a club (F73). All but the logos are private (no link can be made), but they are still stored.

S9. A deleted public photo can stay in the CDN cache "for a few days" (F57). The code comment says the cache fix is "deferred by Franky".

S10. PDF résumés are stored and served as sent (F43g, F43m). A PDF's document properties (often the author's full name, sometimes a home-computer user name) reach every verified viewer unless the owner drew a redaction bar, which forces the picture-only copy.

S11. The public profile answer hands a signed-out visitor the account's internal id and the pinned post's id (F44a). Harmless alone, but it is an identifier, and report snapshots keep that same id after the account is deleted (F70).

S12. The old "recruiter snapshot" data is still in the database for the accounts that had it (7 on Sept 21), unread and unshown (F16). It goes only when each account is deleted.

S13. The stored `referrer` on a profile view is the browser's full referring address, cut to 80 characters (F31). It can be an outside site. Nothing reads it (F68). It is collected for no current use.

S14. Search engines may index profiles and club pages (F44f). A student who later hides a widget or deletes the account cannot pull back what a search engine or a chat app already cached.

S15. Photos uploaded BEFORE the re-encode shipped (commit `db901c7`, about Sept 28-29) were stored as sent, with their location details. A script exists to re-encode them in place, but it refuses to run anywhere except the local stack, and its header says: "A production run is a separate founder yes". I found no record that it was run on production. If it was not, the live page's sentence is true only for new uploads.
Evidence: `scripts/count-exif-uploads.mjs:2-25`; `handoffs/2026-09-28-session-67-waves-2-4-and-security.md:49`.

S16. The team already lists two of these as known follow-ups: "EXIF on R2 uploads (chat, club and video)" and "a `last_active_at` count RPC plus revoke".
Evidence: `handoffs/2026-09-28-session-67-waves-2-4-and-security.md:38`.

S17. LANDING-NIGHT ONLY. The landing film shows "the founders' own photos with real people in them" on a public file host (F44l, F82). Question for the founders: did the people in those photos agree to be on a marketing page?

### 7b. Open questions (not answerable from code)

Q1. Backups. The live page says 30 days of encrypted backups; the Sept 7 draft and Terms v2 say none; the delete-account page has a TODO (`src/app/legal/delete-account/page.tsx:47-48`). Which is true is a Supabase dashboard setting. One answer must go in all three documents.

Q2. Does any production account hold a hand-granted ("comp") Vibe+ entitlement today? A migration header counted one row on Sept 27 (`mig/20260928140000_profile_views_server_only.sql:64`). If yes, the policy cannot say "nobody sees viewer names yet".

Q3. How long may quarantined files and report snapshots be kept? The code comment waits on "the lawyer" (`storage-purge.ts:40-42`). Terms v2 guesses "up to a year" for media and "default 3 years" for moderation records. Pick numbers, then build the deletion job, or say "until we remove them".

Q4. Were the ~76 stray old profile photos (F64) and any other leftover public files cleaned up, or do they still sit at public links? There is a counter script (`scripts/sql/profiles-orphans-count.sql`, named in `delete-media-store.ts:32-33`); I did not run it.

Q5. Supabase's CDN cache lifetime for the public bucket: the "few days" figure is a code comment, not a setting in the repo.

Q6. Is "what are you here for" staying owner-only? The migration says "until Franky decides otherwise" (`mig/20260922130000_users_profile_detail_server_only.sql:16-23`). The policy should describe today's rule and not promise it forever.

Q7. Was the old-photo re-encode (S15) ever run on production? If not, run it or soften the sentence to "photos uploaded since late September 2026".

Q8. Should the logged-out profile be trimmed (the Sept 7 draft's open DECISION at its `:105`)? Still undecided in code: the full card is public today.

### 7c. Conflicts with the Sept 29 Terms v2 (both documents must agree)

File: `handoffs/legal-2026-09-29/02-terms-of-service-v2.md`.

T1. `:108` "You can delete your own posts, comments and messages". Comments: not possible in the app (F60). Either build the button or change the sentence.

T2. `:106` "resumes are visible only to signed-in users you have not blocked". Incomplete: also needs the viewer's verified school email, the owner not restricted, the résumé not hidden (F49).

T3. `:167` "Vibe+ unlocks extra profile customization". NOT FOUND in code: the only Vibe+ checks are the two viewer lists (`grep -rn "requirePlus(\|hasPlus(" src` → profile-views, profile-viewers, posts/[id]/viewers). The /plus page itself says the customization is "Still being built; nothing here is charged for until it exists" (`src/app/plus/page.tsx:666-669`).

T4. `:248` "Files that deletion cannot find: … media uploaded into a club's own storage". Half stale: deleting the POST now deletes its club file (F57). It stays true only for account deletion (F73). The Privacy Policy "section 8" it points to must match.

T5. `:108` "what happens to attached files is set out in the Privacy Policy, section 8". The new policy must keep a section that does this, and the section number must match, or the Terms must be re-pointed.

T6. `:250` "We do not currently keep our own database backups". Conflicts with the live Privacy page's 30 days (Q1).

T7. `:189` "We keep a snapshot of what was reported so that later edits or deletions do not hide it." Matches the code (F34). The Privacy Policy must say the same, and say that the snapshot outlives account deletion (F70).

T8. `:106` "almost your whole profile, every club page with its recent posts and who posted them, and post link previews are reachable by anyone on the internet". Matches the code (F44a, F44i, F44j), with the hidden-widget and "here for" exceptions (F44b) and hidden clubs.
