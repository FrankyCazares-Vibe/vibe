# V3: profile, media, public pages, views, résumés, deletion of single items

Checker 3, 2026-10-03. Text checked: `handoffs/legal-2026-10-03-privacy/privacy-policy-v2.md`.
Sections: 3b, the "Photo details" paragraph of 3c, three lines of 3d (Views, Last active, Search words), 3e, 5a, 5b, 5c, 5d, and six bullets of section 8.

How I checked: every row was re-opened in the code. Paths are relative to the repo root. Every file cited here is byte-identical on `main` and `landing-night` (`git diff --stat main origin/landing-night` over all of them is empty; the only difference near my area is the proxy matcher skipping `.avif/.mp4/.webm`). No database queries, no network.

Result: 56 rows. 48 CONFIRMED, 8 not confirmed (1 WRONG, 6 OVERSTATED, 1 UNSUPPORTED).

## The eight problems, worst first

1. **V3-30 WRONG.** The policy says your list of posts is not public. It is. A signed-out visitor to `/profile/<handle>` gets every published personal post.
2. **V3-9 OVERSTATED.** A post view is recorded when a post sits half on screen in the Campus feed for one second, not only when you "open" it. Profile views also store the exact time, not just the day.
3. **V3-21 OVERSTATED.** The list of what the public profile page shows leaves out the posts grid, the pinned post and the account id.
4. **V3-35 OVERSTATED.** The save count is sent to every signed-in account that opens the post, not only to the author.
5. **V3-38 OVERSTATED.** "No screen shows it" is not true of club member lists: the Map's club zone lists a club's members.
6. **V3-13 OVERSTATED.** Search words are not in our database, but they are not scrubbed from Sentry reports.
7. **V3-48 OVERSTATED.** Post files are removed on a best-effort basis; a failed step leaves them in storage and nothing retries.
8. **V3-50 UNSUPPORTED.** "A few days" in a cache is a code comment, not a setting anywhere in the code.

## Rows

Format: id | section | sentence (shortened) | verdict | evidence | corrected sentence (only when not CONFIRMED)

### Section 3b, your profile

V3-1 | 3b | "What you type or upload: name, handle, year, major, department, tagline, headline, location (free text), website, bio, interests, skills, work experience, 'working on', profile photo, cover, logos, a pinned post and the order of your profile sections." | CONFIRMED | `src/lib/profile/self-write-columns.ts:26-49` (the closed list of writable profile columns); handle through `src/app/api/me/handle/route.ts`; pinned post `src/app/api/me/pinned/route.ts`; section order is `profile_layout.order` (`src/lib/profile/hidden-fields.ts:41-49`). Also stored and not listed, all harmless: cover colour (`banner_gradient`), `work_order_manual`.

V3-2 | 3b | "Also up to three résumé or portfolio documents (a file or an outside link)" | CONFIRMED | `src/lib/profile/resume-docs.ts:23` (`MAX_ITEMS = 3`), `:30-41` (outside http/https links kept).

V3-3 | 3b | "the redaction bars you draw on them, which sections you hid" | CONFIRMED | `resume_redactions` and `profile_layout` in `self-write-columns.ts:43,48`; hidden set in `src/lib/profile/hidden-fields.ts:51-69`.

V3-4 | 3b | "your 'What are you here for?' answers, which only you see" | CONFIRMED | `src/app/api/users/[handle]/bootstrap/route.ts:255-263` (signed out) and `:332` (every other signed-in viewer, admins included); the column is not readable from the database by other accounts: `supabase/migrations/20260922130000_users_profile_detail_server_only.sql:163`.

V3-5 | 3b | "An old 'recruiter snapshot' field that Vibe no longer uses still holds data on a few early accounts until they are deleted." | CONFIRMED | Column created `supabase/migrations/20260503120000_profile_extension_storage.sql:9`; no file under `src/` or `public/html/` names it any more; read and write revoked `20260922130000…:155-163`. The "few accounts" part comes from that migration's own header (`:35`, "non-empty on 7 rows" of 20 users, measured 22 Sept). Re-count before publishing; I did not query the database.

### Section 3c, "Photo details"

V3-6 | 3c | "Our server rebuilds these photos without their hidden details, including location: your profile photo and cover, photos on your own posts, work logos and résumé images." | CONFIRMED | `src/app/api/me/profile-upload/route.ts:158-189` (every image kind goes through `stripImage`; kinds at `:19-26` are avatar, banner, resume, post, poster, logo); `src/lib/media/strip-image.ts:88-150` (decode, rotate, re-encode, never `withMetadata`); desktop data-URL path `src/lib/profile/storage-upload.ts:52-58`; résumé images sent as data URLs `src/lib/profile/resume-storage.ts:143-156`. A video's poster frame on your own post is rebuilt too (kind `poster`).

V3-7 | 3c | "These keep their original details: videos, photos on a club's posts, club logos and banners, photos and videos sent in chats, group chat pictures, and résumé PDFs" | CONFIRMED | All are browser-to-storage uploads through a signed link, so the server never touches the bytes: videos `src/app/api/me/clip-upload-url/route.ts:88-93`; club post photos, logos, banners `src/app/api/orgs/[slug]/upload-url/route.ts:168-178`; chat media `src/app/api/me/messages-upload-url/route.ts:139-145`; group pictures `src/app/api/me/group-photo-upload-url/route.ts:116`; PDFs stored as sent `profile-upload/route.ts:158-163`.

V3-8 | 3c | "Photos uploaded before late September 2026 may also still carry theirs." | CONFIRMED | The strip shipped in commit `db901c7`, dated 2026-09-28 (`git log -- src/lib/media/strip-image.ts`). No script re-encodes old files (`scripts/count-exif-uploads.mjs` only counts them).

### Section 3d, three lines

V3-9 | 3d | "Views. When you are signed in and open someone's profile or post, we record who you are, what you viewed and the day, once per day." | OVERSTATED | Two things are narrower in the text than in the code. (a) A post view is also recorded from the Campus feed without opening anything: `src/app/campus/campus-home.tsx:7588-7617` fires `POST /api/posts/<id>/view` once a feed row is at least half visible for 1 second. (b) A profile view stores the exact time, not only the day: `supabase/migrations/20260513000000_profile_views_and_user_view_count.sql:30-37` (`first_viewed_at timestamptz`), and that timestamp is sent to a Vibe+ owner with each name (`src/lib/metrics/profile-viewers.ts:216-218`). Post views store a date only (`supabase/migrations/20260508110000_post_views.sql:18-23`). Once per UTC day is right. | "Views. When you are signed in and open someone's profile, open a post, or a post stays on your screen in the feed for about a second, we record who you are, what you viewed and the day, once per day. For a profile we also record the time of your first look that day."

V3-10 | 3d | "For a profile we also store the web address you came from (up to 80 characters); nothing reads it." | CONFIRMED | `src/app/api/profile-views/route.ts:49-50` (`slice(0, 80)`); sent from `src/components/mobile/ProfileMobile.tsx:600` and `public/html/profile.html:11578`; no select anywhere names `referrer` (the two reads in `profile-viewers.ts:264` and `src/app/api/me/profile-views/route.ts:133-138` leave it out).

V3-11 | 3d | "Your own views and signed-out views are not recorded." | CONFIRMED | Signed out: `profile-views/route.ts:26-28`, `src/app/api/posts/[id]/view/route.ts:38-42`. Own views: `20260513000000…:66-69` (profile), `supabase/migrations/20260923090000_moderation_foundation.sql:2681-2684` (post).

V3-12 | 3d | "Last active. While the Campus page is open your browser pings us about every 30 seconds, and we store the latest time." | CONFIRMED | `src/app/api/me/heartbeat/route.ts:27-30`; timer `src/app/campus/campus-home.tsx:4700-4704` (30 000 ms, skipped while the tab is hidden); the hook is mounted only by the Campus header (`campus-home.tsx:4736, 5132`).

V3-13 | 3d | "Search words are not stored in our database. They travel to our host in the request address, and your recent searches stay on your device." | OVERSTATED | True as far as it goes: search is `GET /api/search?q=…` and `GET /api/users/search?q=…` with no insert (`src/app/api/search/route.ts:73-90`), no table holds searches, and the recent list is `localStorage` key `vibe_recent_searches_v1` (`campus-home.tsx:5445-5468`, the 8 people you last tapped, not the words). What it leaves out: the Sentry scrubber redacts only sign-in tokens and handles (`src/lib/sentry-config.ts:12-13, 107-109`), and it keeps the rest of a request address ("The URL above it keeps the query, redacted", `:157-159`). So a `?q=` value can ride along in an error report or in the one-in-ten performance sample. | "Search words are not stored in our database. They travel to our host in the request address, where they can also be picked up by an error report or performance sample sent to Sentry. Your recent searches stay on your device (section 7)."

### Section 3e, what we do not collect

V3-14 | 3e | "No analytics or advertising tracker." | CONFIRMED | `package.json` has no analytics or ad package (only `@sentry/nextjs` for errors); no gtag, PostHog, Mixpanel, Segment, Vercel Analytics, Meta pixel string anywhere in `src/`, `public/html/` or `next.config.ts`.

V3-15 | 3e | "No location: Vibe never asks your device for it, our page headers block it, and we never work it out from your IP address." | CONFIRMED | Header `Permissions-Policy: … geolocation=()` on every response (`next.config.ts:70, 87-91`); no `geolocation`, `getCurrentPosition` or `watchPosition` call in `src/`, `public/` or `mobile/`; no read of Vercel's geo headers or any IP-lookup service. "The Map" (`src/app/api/campus-map/`) is a map of majors and clubs, not of places.

V3-16 | 3e | "No date of birth, no phone number, no contact list, and no sign-in through Google, Apple or anyone else." | CONFIRMED | No such column in any migration and no such field in any route; no `signInWithOAuth` / `signInWithIdToken` call in `src/`; no contacts API call.

V3-17 | 3e | "No card numbers." | CONFIRMED | Checkout is a redirect to Stripe's hosted page (`src/app/api/billing/checkout/route.ts:34, 178`); no card field in the app.

V3-18 | 3e | "No image scanning." | CONFIRMED | No vision, hashing or scanning service or package anywhere. `sharp` only decodes and re-encodes (`strip-image.ts`); it does not look at what a picture shows.

V3-19 | 3e | "One automated check exists: a short word list is checked before text is saved." | CONFIRMED | `src/lib/moderation/text-filter.ts:1-28`, list in `text-filter-list.ts` (102 lines). Called before the write in posts, edits, comments, repost quotes, profile text, handles, club names and descriptions, events, group names, poll cards and messages. Note for the wording: "text" includes private messages (`src/app/api/me/threads/[id]/messages/route.ts:299`). See MISSING 5.

V3-20 | 3e | "A match is refused, and nothing about the attempt is kept." | CONFIRMED | `src/lib/moderation/access.ts:134-144` returns a 422 and writes nothing; no call site logs the text, the word or the account. (Vercel's request log still shows a 422 on that address, with no text.)

### Section 5a, anyone on the internet

V3-21 | 5a | "Your profile page: name, handle, tagline, major and year, location text or campus, website, bio, interests, skills, the verified badge and campus, profile and cover photo, work experience, 'working on', and your follower, following and connection counts." | OVERSTATED | Every item listed is really sent to a signed-out visitor (`src/app/api/users/[handle]/bootstrap/route.ts:34-35, 255-263, 338-367`; `src/lib/profile/build-vibe-user-v1.ts:77-148`). The list is incomplete. The same page also loads, with no sign-in: your published personal posts (see V3-30), the id of your pinned post (`bootstrap/route.ts:373-386`), and your internal account id (`build-vibe-user-v1.ts:78`; it is also inside every public file link, `profile-upload/route.ts:204`). | "Your profile page: name, handle, tagline, major and year, location text or campus, website, bio, interests, skills, the verified badge and campus, profile and cover photo, work experience, 'working on', your follower, following and connection counts, and your published posts that were not made as a club (text, tags, photo or video, date), including which one you pinned."

V3-22 | 5a | "Not shown: either email address, résumés, 'here for' answers, or anything in a profile section you hid." | CONFIRMED | Email columns are not in the select (`bootstrap/route.ts:28-35`); résumé keys and "here for" blanked for signed-out visitors (`:255-263`); hidden sections blanked on the server (`:273`, `hidden-fields.ts:51-69`); the link preview skips a hidden bio (`src/app/profile/[handle]/page.tsx:91-96`).

V3-23 | 5a | "Files with a public link: profile photos, covers, photos on your own posts, video poster frames and uploaded logos open for anyone with the exact link." | CONFIRMED | Bucket `profiles` is public (`supabase/migrations/20260503120000_profile_extension_storage.sql:16-20`); all five kinds are written there (`profile-upload/route.ts:48-55, 204-220`).

V3-24 | 5a | "The links do not expire." | CONFIRMED | `getPublicUrl` (`profile-upload/route.ts:219`), an unsigned address.

V3-25 | 5a | "The folder cannot be listed." | CONFIRMED | The world-readable list policy was dropped (`supabase/migrations/20260904100000_private_resumes_bucket.sql:28`). Small print: a signed-in account can list its own folder (`:30-37`), nobody else's.

V3-26 | 5a | "Post videos and club media open without sign-in, through a link on our site that hands out a storage link good for one hour." | CONFIRMED | `src/app/api/posts/[id]/media/route.ts:55-71, 143-144` (no sign-in for a published post; `60 * 60`); `src/app/api/orgs/[slug]/asset/[kind]/route.ts:35-80` (logo and banner, 1 h). Refused for drafts, removed posts, a suspended author and hidden clubs (`media/route.ts:87-114`).

V3-27 | 5a | "A post's share link: the page asks for sign-in, but its preview shows the author's name, up to 140 characters of the text, and the photo or poster frame." | CONFIRMED | `src/app/posts/[id]/page.tsx:106-139` (name or @handle, 137 characters plus "…", thumbnail first), sign-in redirect `:158-164`. Generic card for removed posts, hidden clubs and restricted authors (`:54-74`).

V3-28 | 5a | "Club pages: name, description, links, logo, banner, who can join, member count, follower count from 5 up, and the 12 newest posts with each author's name, handle and photo, even for clubs you must ask or be invited to join." | CONFIRMED | Page `src/app/orgs/[handle]/page.tsx:139-146, 264-282`; open API `src/app/api/orgs/[slug]/profile/route.ts:61-70, 178-258`; 12 posts `src/lib/club-routes/club-posts.ts:28, 48-62`; follower floor `src/lib/orgs/join-copy.ts:106, 617-620` and `src/lib/orgs/following.ts:89-103`. Also on the page and not listed: each post's text, media and date, the club's "philanthropy" text, its verified or dormant badge and its IU-only / Purdue-only tag.

V3-29 | 5a | "Search engines and link previews: profile and club pages may be indexed, and any service a link is pasted into fetches the preview." | CONFIRMED | `src/app/robots.ts:13-26` allows everything; neither page sets `noindex`; previews built in `profile/[handle]/page.tsx:77-120` and `orgs/[handle]/page.tsx:116-132`.

V3-30 | 5a | "Not public: your list of posts, follower and following lists, chats, RSVP lists and member lists." | WRONG | The list of posts is public. `GET /api/users/<handle>/posts` answers a signed-out caller with the service role (`src/app/api/users/[handle]/posts/route.ts:45-47`) and returns every published personal post, newest first, up to 500 per call: id, text, tags, photo or video address, date, edited mark (`:117-135`, limit `:11-12, 98-102`). Only club posts, removed posts and a suspended author are held back (`:73-81, 128, 133`). The public profile page calls it for every visitor: phone `src/components/mobile/ProfileMobile.tsx:614-619`, desktop `public/html/profile.html:9755-9761`. The file's own header calls them "Public posts for a visited user" (`:23-31`). The other four items are right: follower, following and connection lists answer 401 signed out (`src/app/api/users/[handle]/followers/route.ts:53-55`, `following/route.ts:52-54`, `connections/route.ts:55-57`), reposts too (`reposts/route.ts:101-103`), attendee lists (`src/app/api/events/[id]/attendees/route.ts:40-46`), member lists (`src/app/api/orgs/[slug]/members/route.ts:44-50`). | "Not public: your reposts, follower and following lists, chats, RSVP lists and member lists." (and add the posts to the profile bullet, V3-21). If the founders would rather the sentence were true as written, the fix is a code change: make that route answer 401 when signed out.

V3-31 | 5a | "A club we have hidden, and the profile of a suspended or banned account, look like pages that do not exist." | CONFIRMED | Club: `orgs/[handle]/page.tsx:187`, `orgs/[slug]/profile/route.ts:130-135`, asset route `:52-59`. Profile: `profile/[handle]/page.tsx:165-175`, `bootstrap/route.ts:189-201`, posts route `:73-81`.

V3-32 | 5a | "A block cannot reach people who are signed out: they still see your public profile and any club posts you made." | CONFIRMED | The block check runs only when there is a signed-in viewer (`bootstrap/route.ts:217`; `src/lib/club-routes/club-posts-read.ts:130`). With V3-30 in mind the sentence should also say "and your posts".

### Section 5b, every signed-in account

V3-33 | 5b | "Every signed-in account, verified or not, at every campus … Everything above, plus your published posts, comments and reposts, and the lists of who you follow and who follows you." | CONFIRMED | These routes check only that a session exists, never `school_verified` or campus: feed `src/app/api/feed/route.ts:175-183`, post `src/app/api/posts/[id]/route.ts:133-146`, comments `comments/route.ts:147-160`, reposts `users/[handle]/reposts/route.ts:60-103`, follow lists `followers/route.ts:22-40`. A block in either direction empties all of them for that pair.

V3-34 | 5b | "Like totals. Who liked is not shown to others, though the author gets a notification naming the liker." | CONFIRMED | Rows readable only by the liker: `supabase/migrations/20260922110000_t1_close_world_readable_selects.sql:286-293`; totals from a count function; notification trigger `supabase/migrations/20260504150000_notifications.sql:97-98`.

V3-35 | 5b | "Saves are private: the author sees how many people saved a post, never who." | OVERSTATED | "Never who" is right (`src/app/api/me/posts/[id]/savers/route.ts:7-16`; the `bookmarks` table is readable only by the saver). "The author sees how many" is narrower than the code: `GET /api/posts/<id>` puts `counts.saves` in its answer to every signed-in account that can open the post (`src/app/api/posts/[id]/route.ts:272, 296-304`, no owner check). Only the screen limits it to the author (`src/components/mobile/PostViewerMobile.tsx:997`). | "Saves are private: nobody sees who saved a post. The number of saves is shown to the author on screen, and is included in what our server sends to any signed-in account that opens the post."

V3-36 | 5b | "Club events, with Going and Interested totals." | CONFIRMED | `src/app/api/events/route.ts:105-113, 373-374`; names only for the event's managers (`events/[id]/attendees/route.ts:61-71`).

V3-37 | 5b | "Search finds verified, set-up accounts by name or handle, across both universities." | CONFIRMED | `src/app/api/search/route.ts:46-55` (global; unverified, not-onboarded and placeholder-handle accounts dropped), name and handle filters `:104-105`; same helper in `src/app/api/users/search/route.ts`.

V3-38 | 5b | "From our database, though no screen shows it: the member list of a club anyone can join, and for any account the day it was made, when it was last active, when its handle last changed and its lifetime profile-view count." | OVERSTATED | The database facts are right. Member rows of an open, public, not-hidden club are readable by any signed-in account (`supabase/migrations/20260916103000_org_join_policy_invites.sql:779-788`). `created_at`, `last_active_at`, `handle_changed_at` and `profile_view_count` are in the column grant (`supabase/migrations/20260903100000_security_hardening.sql:41-48`) and no later migration takes them back; suspended and banned accounts are hidden (`20260923090000_moderation_foundation.sql:2330-2334`). What is not right is "no screen shows it" for the member list: the Map's club zone reads `org_members` with the viewer's own session and lists those members by name, handle, major, year and photo (`src/app/api/campus-map/zone/route.ts:133-152, 222-262`; callers `campus-home.tsx:14909-14910`, `src/components/mobile/MapMobile.tsx:772-773`). It only lights up for a club that has a campus set (`:142-146`). | "The member list of a club anyone can join can be read from our database by any signed-in account, and the Map lists those members for a club on that campus. From our database, though no screen shows it: for any account the day it was made, when it was last active, when its handle last changed and its lifetime profile-view count."

### Section 5c, résumés

V3-39 | 5c | "Another person can open your résumé only if they are signed in with a verified school email, neither of you has blocked the other, you are not suspended or banned, and you have not hidden it." | CONFIRMED | `src/app/api/resume/[...path]/route.ts:171-173` (signed in), `:222-237` (block either way), `:83-110, 246-256` (verified viewer, owner not restricted, not hidden); no admin exception (`:242-243`). The profile payload applies the same rule before it hands out any résumé reference, outside links included (`bootstrap/route.ts:217-245, 280-289`), and the résumé columns cannot be read from the database by other accounts (`supabase/migrations/20260905100000_revoke_resume_redactions_select.sql:38`).

V3-40 | 5c | "The link lasts 5 minutes." | CONFIRMED | `resume/[...path]/route.ts:28` (`SIGNED_TTL_SEC = 300`), `:299`. Applies to files we host; an outside link is the outside site's own address.

V3-41 | 5c | "If you drew redaction bars, everyone else gets a copy with the bars burned in, never the original." | CONFIRMED | `resume/[...path]/route.ts:259-294` (503 rather than the original when the copy cannot be made); bar positions never leave the server (`bootstrap/route.ts:328`). An outside-link document with bars is not shown to others at all (`bootstrap/route.ts:304-327`), which is stricter than the sentence.

V3-42 | 5c | "If you give an outside link as a résumé or as a work logo, a viewer's browser fetches it from that outside site, which then sees the viewer's IP address." | CONFIRMED | Outside résumé links kept as given (`resume-docs.ts:30-41`); outside logo links kept (`src/lib/profile/work-experience.ts:24-49`, `src/lib/profile/current-on.ts:58-60`). On the public profile this includes signed-out visitors' browsers for logos.

### Section 5d, who viewed you

V3-43 | 5d | "You see how many people viewed your profile and each of your posts." | CONFIRMED | Profile `src/app/api/me/profile-views/route.ts:229-247`; post `src/app/api/me/posts/[id]/viewers/route.ts:114-131`. See MISSING 2: the post count is not only yours to see.

V3-44 | 5d | "With Vibe+ you also see who: profile viewers for the last 90 days, post viewers with no time limit." | CONFIRMED | Paywall `src/app/api/me/profile-viewers/route.ts:57-61`, `me/posts/[id]/viewers/route.ts:112-114`; 90 days `src/lib/metrics/profile-viewers.ts:86, 124-127`; post list has no date filter (`src/lib/metrics/post-audience.ts:195-204`).

V3-45 | 5d | "People you blocked or muted are left off the profile list." | CONFIRMED | `profile-viewers.ts:161-190`. Two additions the text could carry: the same filter runs on the post list (`me/posts/[id]/viewers/route.ts:134-145`), and "blocked" means a block in either direction (`src/lib/safety/hidden-users.ts:40-44`). They are left off the list of names only; the counts still include them.

V3-46 | 5d | "There is no private viewing mode." | CONFIRMED | Neither recording route has an opt-out or setting (`profile-views/route.ts`, `posts/[id]/view/route.ts`); no such column or flag exists.

V3-47 | 5d | "Billing is off today, but we can give Vibe+ to an account by hand." | CONFIRMED | Hand-given Vibe+ is the `comp` source (`supabase/migrations/20260912101000_entitlements.sql:146, 195-198`). "Billing is off" is a production switch, not something the code shows; I took it from the task brief.

### Section 8, deleting one thing (six bullets)

V3-48 | 8 | "A post is deleted at once with its likes, comments, saves and view records, and then its files are removed." | OVERSTATED | The row and its likes, comments, saves, views, reposts and notifications do go at once: `src/app/api/posts/[id]/route.ts:508-520`, with `ON DELETE CASCADE` on all of them (`supabase/migrations/20260504130000_post_likes_comments.sql:6, 17`, `20260430190000_phase1_initial_schema.sql:69`, `20260508110000_post_views.sql:19`, `20260508100000_post_reposts.sql:14`, `20260504150000_notifications.sql:17`). The files are a best-effort step afterwards (`route.ts:532`; `src/lib/posts/delete-media-store.ts:31-35`): if a read fails nothing is removed (`:170`), a failed storage delete is only logged (`:188-189`), a file another post or your photo/cover still names is kept, and nothing retries. | "A post is deleted at once with its likes, comments, saves, reposts and view records. We then try to remove its files; if that step fails they stay in storage, with nothing trying again, until your account (or, for a club post, the club) is deleted."

V3-49 | 8 | "If a report about it is open, its photo is moved to a locked evidence folder and its video is kept." | CONFIRMED | `delete-media-store.ts:176-185` (photo and poster frame moved to the private `quarantine` bucket, video left in place); an unreadable report counts as open (`:126-137`). A club post's photo sits in the other storage, so it is kept in place rather than moved.

V3-50 | 8 | "A copy of a public photo can stay in a cache for a few days." | UNSUPPORTED | The only source is two code comments (`posts/[id]/route.ts:438-439`, `delete-media-store.ts:37-38`). No cache lifetime is set anywhere in the code: uploads pass no `cacheControl` (`profile-upload/route.ts:206-209`; no `cacheControl` anywhere in `src/`), so the lifetime is whatever Supabase's storage and CDN default to. Nobody can point to "a few days" in the code. | "A copy of a public photo can stay in a cache for a while after it is deleted. How long is set by our storage provider, and we have not measured it." (or measure it and state the number)

V3-51 | 8 | "A post a moderator removed cannot be deleted or edited by its author." | CONFIRMED | Delete: `posts/[id]/route.ts:499-504` (409 `post_removed`); edit: `:706`; the database refuses both too (`supabase/migrations/20260929110000_post_club_deletes.sql`).

V3-52 | 8 | "An edit replaces the old text. Only the time of the edit is kept, though a report filed before the edit keeps the text as it was." | CONFIRMED | Trigger stamps `edited_at` and nothing else (`supabase/migrations/20260916130000_post_edited_at.sql:277-285`); no history table exists; a report stores a snapshot of its target when filed (`src/app/api/me/reports/route.ts:548-563`).

V3-53 | 8 | "A comment has no delete button today. It goes when its post or your account is deleted." | CONFIRMED | `src/app/api/posts/[id]/comments/route.ts` exports only GET (`:147`) and POST (`:338`); no component or page calls a comment delete; cascade on post and on account (`20260504130000_post_likes_comments.sql:17-18`). Small print: the database still carries an old "delete your own comment" rule (`:58-60`), so the missing piece is the button, not the permission.

V3-54 | 8 | "A profile photo or cover you replace is deleted, or moved to the evidence folder if a report about you is open." | CONFIRMED | `src/lib/media/profile-photo-retire.ts:107-141`, called from both save routes (`src/app/api/me/profile/route.ts:469`, `src/app/api/me/profile-sync/route.ts:858`). Best-effort like V3-48: a failure is logged and the old file stays (`:22-24`). A file another account or a club still shows is also kept (`:66-101`).

V3-55 | 8 | "A work logo you replace stays at its public link until you delete your account." | CONFIRMED | Only profile photo and cover files are ever retired (`src/lib/media/profile-photo-replace.ts:46`); nothing deletes `<uid>/logos/` except account deletion (`src/lib/profile/storage-purge.ts:33`). The same is true of a logo you remove, a "working on" logo, and any photo you uploaded but never saved or posted.

V3-56 | 8 | "A résumé file is deleted when you remove it." | CONFIRMED | `src/app/api/me/profile-sync/route.ts:830-847` (the file, best-effort) and `:868-900` (the burned-in copies). Both the phone and the desktop remove résumés through this route (`ProfileMobile.tsx:1126-1143`). Small print: `PATCH /api/me/profile` also accepts `resume_url` (`src/app/api/me/profile/route.ts:320-330`) and does not delete the old file; no screen uses it for removal today.

## MISSING: things the code does in my area that the policy does not say

1. **Your posts are public on your profile page.** Covered by V3-30 and V3-21. This is the largest gap: the text promises the opposite. `src/app/api/users/[handle]/posts/route.ts:45-47, 117-135`.

2. **Post view counts are shown to everyone, not only to you.** Section 5d says "you see how many people viewed … each of your posts". The same number is on every post for every signed-in account: `src/app/api/feed/route.ts:517` (`view_count` on each feed row), `src/app/api/posts/[id]/route.ts:283, 300` (`counts.views`). Section 5b lists like totals but not view totals. Suggested line for 5b: "View totals on each post."

3. **Scrolling past a post in the feed counts as a view with your name on it.** Covered by V3-9. The short version at the top ("when you … open a profile or a post, we record it") has the same gap. `src/app/campus/campus-home.tsx:7588-7617`.

4. **A Vibe+ owner is told when you looked, not only that you looked.** The profile list carries the day and the exact time of your first look that day; the post list carries the day. `src/lib/metrics/profile-viewers.ts:216-218`, `src/app/api/me/posts/[id]/viewers/route.ts:176-179`. Section 5d says "who" and nothing about when.

5. **The word list is also applied to private messages.** Section 3e says "before text is saved", which is true, but a reader of section 5h ("we read private messages only when…") may not expect any automated check on a direct message. `src/app/api/me/threads/[id]/messages/route.ts:299`. Suggested: "…is checked before text is saved, including messages."

6. **The Map lists people by major and by club.** Any signed-in account can open a major on a campus's map and get up to 180 people there (name, handle, major, year, photo), and the members of a club on that map. `src/app/api/campus-map/zone/route.ts:122-152, 222-262`. Section 5b mentions search but not this browse-by-major screen.

7. **Your internal account id is public.** It is in the signed-out profile payload (`src/lib/profile/build-vibe-user-v1.ts:78`), in every public photo link (`src/app/api/me/profile-upload/route.ts:204`) and in each club post's author field (`src/app/api/orgs/[slug]/profile/route.ts:183`). Low stakes, but section 3a describes it as "internal".

8. **When someone you blocked opens your profile, the answer tells them a block exists.** The blocked-pair answer still carries your name, handle and photo, plus flags saying which side blocked (`src/app/api/users/[handle]/bootstrap/route.ts:223-243`). Section 5g says "the person you blocked is not notified"; true, but they can see it. That sentence belongs to another checker; flagged here because the evidence is in my files.

9. **Uploads you never use stay public.** A photo sent to the upload route and then not saved (a cropped photo you cancelled, a post photo for a post you never published) sits at its public link until account deletion. Nothing sweeps it on a schedule; the only sweep is the one a moderator's photo takedown runs over unused profile photos and covers (`src/app/api/admin/images/_lib/sweep.ts:10-17`). `src/app/api/me/profile-upload/route.ts:204-220` writes the file before any row names it. Section 8 covers replaced work logos only.
