# Security report — authorization & data-exposure lenses

- Date: 2026-09-27
- Production commit: 24dac9f
- Scope: the two lenses the earlier sentinel run (`handoffs/2026-09-27-security-risk-report.md`) lost — authorization / IDOR and data exposure.
- Method: read-only. Code read at HEAD 24dac9f, read-only SQL against the live database (policies, grants, function bodies, and counts only), and anonymous GETs of the founder's own content. No writes, no live attacks.

## What this means

- Two launch-blockers are about photos that never really go away. When a moderator takes an image down, or a student deletes a post, the photo keeps loading from the storage cache for days, and there is no tool at all to remove an intimate image used as an avatar, banner, club logo, or group-chat photo. Both matter directly for the "remove within 48 hours" promise and the intimate-image law.
- The new S67 "hide this widget" control is cosmetic. A résumé (which usually carries a phone number and home address) marked "hidden · only you see it" is still handed to any signed-in account and can still be downloaded. One real account already has this set today.
- "Block" only works inside the app screens, not in the database. A blocked person can still read the blocker's posts and profile, watch when they were last online, and even comment on their posts in a way only the blocker can't see — so the target can't even report it.
- The club rules live only in the app code, not in the database. Any verified student can create a club and then write straight to the database to flood a whole campus's events list with unfiltered text, or push any word to the top of the Trending strip. Removed or demoted officers keep control of the events and posts they made.
- Several "paid" and "private" lines leak. The Vibe+ "who viewed you" list is free to anyone who opens developer tools, and the "who saved this post" count can be turned into a name-by-name reveal.
- Almost none of this is being exploited today (tiny pilot, mostly the founders' own data), but most of it turns real the moment the two campuses open in late October. The common root cause is the same one your security notes already flag: the database, not the route, has to be the boundary.
- The earlier report's High findings were closed, and its is_platform_admin leak is fixed. This report is new ground the earlier run never reached.

## Fix first (ranked)

1. **Make photo takedown real (both High).** Move Supabase to the Pro plan so the cache clears on delete/move within ~60s (and call `purgeCache` after each quarantine move), or stop serving user photos from the public bucket and serve them privately with short-lived signed URLs, as videos already are. Effort: ~half a day (plan + one code change) or ~2 days (private serving).
2. **Add an image-removal tool + fix banned-user previews (High).** Give moderators an action that clears and quarantines avatar / banner / club-logo / group-photo images, and make the `/profile/<handle>` link preview drop the name, bio, and avatar of suspended/banned users. Effort: ~1 day.
3. **Enforce hidden widgets on the server (Medium, live now).** For any non-owner, blank the fields of every hidden widget in the profile bootstrap, and refuse a hidden résumé download. Effort: ~half a day.
4. **Make blocks a database rule (Medium).** Add a `not_blocked_pair` check into the row-level rules on users, posts, and comments (a helper already exists), and add the block check to the two post/profile routes that lack it. Effort: ~1 day.
5. **Gate résumé downloads behind school verification and owner-not-banned (Medium).** Effort: ~1 hour.
6. **Move the club rules into the database (Medium).** Only verified, non-hidden clubs may publish events; cap and validate post tags; tie event/post management and admin-over-admin powers to *current* membership. This one change closes the event-flood, Trending-takeover, ex-officer, and admin-demote findings together. Effort: ~1–2 days.
7. **Gate the Vibe+ / audience reads server-side (Medium).** Read "who viewed you" and the savers/viewers counts through the service role after the paywall check, and stop filtering count-only answers by the caller's own mute list (that's what makes the oracle). Effort: ~half a day.

## Confirmed findings

### 1. Removed and deleted photos keep serving from the storage cache for days (High)

- Area: data exposure / storage. Prior report: residual of #4; also weakens #16.
- What an attacker does: anyone who holds a photo's public URL (the poster, any viewer who saw it, or a link-preview crawler) keeps requesting it after a moderator quarantines the post.
- What they get: the image keeps returning 200 from the CDN edge after the moderator tool reports it "quarantined", because nothing clears the cache and the project can't clear it. The quarantine move keeps the object at the same URL on purpose (for appeals) and never blanks `media_url`, so the old URL stays the same cache key.
- Evidence: `src/lib/moderation/media-quarantine-store.ts:61-63` only moves the object between buckets; there is no cache purge anywhere in `src`. `src/app/api/admin/content/remove/route.ts` then reports it removed. The org is on the free plan (`get_organization` → plan "free"), and Supabase's Smart CDN auto-invalidation and the purge API are both "Pro Plan and above". A live anonymous range request of the founder's own post photo returned `cf-cache-status: HIT` with `age` ~5.5 days against a `max-age=3600`, so warm edges keep objects far past their max-age. The public promise is live at `src/app/support/page.tsx:84` and `src/app/legal/community/page.tsx:198`.
- Latent today (0 removed posts, quarantine bucket empty), turns real on the first takedown after launch.
- Fix: move to Supabase Pro (auto-invalidation within ~60s) and call `purgeCache` after each quarantine move or delete; or serve post images privately through a proxy with short-lived signed URLs, like videos. Until then, tell moderators a takedown can take days to clear every cache.

### 2. No way to take down an intimate image used as an avatar, banner, club logo, or group photo; a ban leaves it public and in link previews (High)

- Area: data exposure / storage. Prior report: new variant of #4 (S67 quarantine covers post photos only).
- What an attacker does: uploads an intimate image of a victim as their own avatar or banner, a club logo/banner, or a group-chat photo.
- What they get: the victim reports it, but moderators have no tool to remove it — the removal route only accepts post / comment / message. The only lever is to ban the uploader, and after a ban the file stays at its permanent public URL. The `/profile/<handle>` link preview still emits the banned user's name, bio, and avatar to signed-out visitors and unfurlers, because that page reads the user with the service role and applies no restriction check.
- Evidence: `src/app/api/admin/content/remove/route.ts:21-25` (`TABLES` = post/comment/message only); no admin route writes `avatar_url`/`banner_url`/`logo_url`/`photo_url`. `restrictUser` in `src/lib/moderation/actions.ts` only inserts an account-restriction row. `src/app/profile/[handle]/page.tsx:25-35` selects name/bio/avatar with no restriction check and feeds og:image at :63-90; a live anonymous GET of `/profile/frankycazares` returned 200 with an og:image on the Supabase host. The 48-hour promise names "profile" explicitly (`legal/community/page.tsx:198`).
- Fix: add an admin "remove image" action that clears the column (service role) and quarantines the object (plus the cache fix in #1); make the profile page metadata (and public bootstrap) drop name/bio/avatar for users with an active restriction; keep the legal copy in step with what the tools can remove.

### 3. "Hidden" profile widgets still send their data to everyone; a hidden résumé is still downloadable (Medium)

- Area: data exposure / profiles. New S67 surface (wave 2). Merges four duplicate findings.
- What an attacker does: opens the victim's public profile bootstrap, or (for the résumé) opens it while signed in with any account, including a non-student Gmail account.
- What they get: hiding a widget only stops the browser drawing it. The server never reads the hidden list, so bio, experience, skills, "working on", and the résumé keys still ship in the response — and the response even lists which widgets were hidden. A signed-in viewer then downloads the "hidden" résumé through the résumé proxy, which never checks the layout. Bio / skills / experience / current-on can also be read straight from the public data API by any signed-in account. Résumés commonly carry a phone number and home address.
- Evidence: UI promises at `src/components/mobile/ProfileMobile.tsx:370` ("hidden · only you see it") and `public/html/profile.html:7757`; `src/lib/profile/profile-layout.ts:34` says outright "A view flag: hiding deletes nothing." `src/app/api/users/[handle]/bootstrap/route.ts:28-40` selects all these fields and never filters on `profile_layout.hidden`; `src/lib/profile/build-vibe-user-v1.ts:171-177` forwards the hidden list beside the full data. `src/app/api/resume/[...path]/route.ts` checks session, key ownership, and blocks, but never the layout. Live grants: authenticated can SELECT bio/skills/work_experience/current_on (résumé columns are not granted, so the résumé leaks only through the bootstrap + proxy). Live count: 1 account already hides its résumé while holding a résumé document (the founder's own).
- Fix: in the bootstrap, for any non-owner, blank the fields of each hidden widget (résumé → null out url/docs); make `/api/resume` return 404 to non-owners when the layout hides "resume"; stop sending the hidden list to visitors. For bio/skills/experience/current-on, either move them behind a layout-aware view or change the copy to "hidden from your page".

### 4. Blocks are enforced only in app routes; the database lets a blocked user read and comment (Medium)

- Area: authorization / data exposure. Merges the authz-posts and dataexp-profiles versions. Prior report: signed-in, writing variant of #9/#25.
- What an attacker does: a blocked, signed-in student uses the public data API with their own session, plus two app routes that skip the block check.
- What they get: they find the victim by name, read every published post and comment, read the victim's last-online time (a stalking signal) and typed location, and post comments on the victim's posts. The comment thread hides a blocked person's comment only from the blocker, so everyone else sees it and the victim never does — meaning the victim can't report it. Message text is not exposed (the DM rules do check blocks).
- Evidence: live policies `posts_select_authenticated`, `users_select_authenticated`, `post_comments_insert_own`, and `user_visible()` contain no block check; the only policies in the schema that mention blocks are the blocks table's own and `messages_insert_member`. `src/app/api/posts/[id]/route.ts` (GET) and `src/app/api/users/by-id/[id]/route.ts` have no block check, while `bootstrap`, the follow-list routes, and `/api/resume` do — so the rule lives only in routes. UI promises at `public/html/_safetyActions.js:145` and `src/components/mobile/MessagesMobile.tsx:2427`. Live: 0 blocks today.
- Fix: add a `not_blocked_pair(a,b)` (an `is_blocked_either_way` helper already exists) into the SELECT rules on users, posts, and comments and the WITH CHECK on comment/repost inserts; add the block check to GET `/api/posts/[id]` and `/api/users/by-id/[id]`.

### 5. Unverified (non-student) accounts can download every student's résumé (Medium)

- Area: data exposure / profiles. Prior report: still-exploitable, more sensitive variant of #8.
- What an attacker does: signs up with any email (e.g. Gmail), confirms it, never verifies a school address, then reads any student's profile bootstrap and calls the résumé proxy.
- What they get: the (redacted) résumé PDF of any student, plus name/bio/experience by direct data-API read. The résumé route checks only that the caller is signed in; it never checks school verification, and never checks whether the résumé's owner is banned — so a banned student's résumé keeps loading for anyone who holds a key.
- Evidence: `src/app/api/resume/[...path]/route.ts:125-133` requires only a session; `:141-200` never reads the owner's restriction. `src/app/api/users/[handle]/bootstrap/route.ts:220-228` strips résumés for anonymous callers only. `src/proxy.ts` has no school-verified gate. Live: 6 of 20 accounts are not school-verified; 4 have résumés.
- Fix: in `/api/resume`, require the viewer to be school-verified and return 404 when the owner has an active restriction; in the bootstrap, give résumé keys only to verified viewers. Decide the broader #8 question (non-students reading student data at all).

### 6. The signed-out user-posts grid skips the ban check and the hidden-club check (Medium)

- Area: data exposure / profiles. Prior report: variant of #25 (the restriction/hidden-club gap is new).
- What an attacker does: with no sign-in, requests a user's post grid by handle.
- What they get: for a suspended or banned student it still returns their published posts; for an officer of a hidden club it returns the club posts they wrote (text, tags, dates). Signed-in reads are protected by the database rules; the signed-out path reads with the service role and skips them. (The org's UUID is not in the response, so the club link itself is not exposed, only the text.)
- Evidence: `src/app/api/users/[handle]/posts/route.ts:43` switches to the service-role client when there is no viewer; the target lookup (`:50-54`) and grid query (`:96-107`) apply no restriction and no org/hidden filter. Compare `bootstrap/route.ts:155-166`, which 404s restricted profiles. The `/account/suspended` page promises posts "aren't visible to anyone." Live: 0 active restrictions, 0 hidden-club posts today.
- Fix: on the signed-out branch, run the same restriction check as bootstrap and 404; drop rows whose org is hidden (or filter `org_id IS NULL`). Better, stop reading with the service role for signed-out visitors.

### 7. Post share-page previews leak removed, hidden-club, and banned-user post text + author to signed-out visitors (Medium)

- Area: data exposure. Merges the dataexp-profiles and dataexp-storage versions. Prior report: not covered (previews were only listed as a lens).
- What an attacker does: with no sign-in, requests `/posts/<id>` (or a chat/Discord/iMessage bot unfurls a re-shared link).
- What they get: the page 307s to login, but the response body already carries og:title ("<author>: <first 60 chars>") and og:description (first ~137 chars). The preview read is filtered on `status='published'` only, and a moderator removal never changes status — so a removed post, a hidden club's post, and a banned author's post all still show their text and author name to anyone with the link. This is exactly what the database rules hide from signed-in students.
- Evidence: `src/app/posts/[id]/page.tsx:34-42` (service-role read, `.eq('status','published')` only, no `removed_at`/restriction/hidden-org check); title/description built at `:64-90`. Removal sets only `removed_at`/`removed_by`/`removed_reason` (`src/app/api/admin/content/remove/route.ts:128-136`). A live anonymous GET (Discordbot UA) of the founder's post returned 307 with the og:title/description present. Latent today (0 removed / hidden-club / restricted-author posts).
- Fix: in `generateMetadata`, add `removed_at IS NULL`, and fall back to a generic "Post · Vibe" title when the author has an active restriction or the club is hidden; apply the same filters to the body's existence check.

### 8. Post photos and videos keep their original EXIF/GPS metadata and are served publicly (Medium)

- Area: data exposure / storage. New (no EXIF/GPS item in the prior report).
- What an attacker does: opens a post image's public URL (or, for video, the no-login media route) and reads its EXIF/GPS tags with any viewer.
- What they get: the precise location where a photo was taken, often a dorm or home. The mobile and campus-feed composers are safe (they re-encode through a canvas cropper, which drops EXIF), but the legacy desktop own-profile composer uploads the raw file, and every video path uploads the original file with no transcode. Avatars and banners are safe (cropper).
- Evidence: raw path at `public/html/profile.html:6515-6531` (appends the raw file, kind=post); `src/app/api/me/profile-upload/route.ts:124-160` stores the bytes unchanged (sharp is used only for résumé redaction). Video is a raw presigned PUT to R2 served through `src/app/api/posts/[id]/media/route.ts` (no login by design). The safe composers re-encode at `src/components/ImageCropperModal.tsx:322-341`. Live: 2 of 7 stored post objects are non-JPEG (only possible via the raw path); one is >1.5MB. (Not confirmed by downloading an object.)
- Fix: re-encode post/logo images server-side with sharp (`.rotate()`, no `withMetadata`), or route the legacy composer through the existing cropper; strip video location metadata or warn the uploader; backfill existing raw uploads.

### 9. Deleted post photos and replaced avatars/banners stay public (Medium)

- Area: data exposure / storage. Prior report: #16, still exploitable (only the moderator half was fixed).
- What an attacker does: holds the old URL after the victim deletes a photo post or replaces an avatar/banner.
- What they get: the old public URL keeps returning the image. The delete route deletes only the post row (and the author's own R2 video keys); it never touches the Supabase `profiles` bucket. Re-uploading an avatar writes a new object and never removes the old one. 88 of 100 objects in the bucket are already unreferenced orphans.
- Evidence: `src/app/api/posts/[id]/route.ts:318-319` (comment: profiles-bucket photos "are not touched here"); `src/app/api/me/profile-upload/route.ts` uploads with `upsert:false` and never removes the prior object; no DELETE policy on `storage.objects` (so students can't clean up either). Live: `profiles` bucket public; 88/100 objects orphaned.
- Fix: on delete, remove the author's own `posts/` and `posters/` objects; after an avatar/banner replace, delete the previous object; add cache purge (see #1) or move to private serving.

### 10. The Trending strip can be pushed to any count, with any text, by one post written to the database (Medium)

- Area: authorization / content integrity. Prior report: #19 covers direct writes generally; the Trending amplification and tag-filter bypass are new.
- What an attacker does: any verified student writes (or edits) a published post directly through the data API with a large, repeated tag array.
- What they get: the strip counts each array element once with no per-post or per-author de-duplication, so one post can put any phrase (a slur, a scam word, text about a named student) at #1 for a whole campus, including visitors browsing it. The word filter runs only on post content in the route, never on tags, so even the normal publish flow lets a one-word slur tag through. Editing tags after posting leaves no "edited" mark, so a moderator's view can differ from what shows later. (No XSS — tags render as escaped text.)
- Evidence: `src/app/api/trending/hashtags/route.ts:116-123` (adds 1 per element, no dedupe); `src/app/api/me/publish-post/route.ts:167` runs `checkText` on content only; live: authenticated holds INSERT/UPDATE on `posts.tags`, no CHECK on tags, no trigger touches tags. Live: 23 posts, none with >10 tags or repeats yet.
- Fix: add a DB CHECK/trigger on `posts.tags` (≤10 tags, word-character pattern, no duplicates); run `checkText` on tags in publish and edit; count each tag once per post (ideally per author) in the route.

### 11. Any verified student can post campus-wide club events, bypassing the verified-club rule, the word filter, and the length checks, and can bury real events (Medium)

- Area: authorization / clubs. Prior report: partial overlap with the storage "one account can fill the DB" Medium; the verified-org bypass, word-filter bypass, and list flooding are new.
- What an attacker does: creates a club (open to any verified student, which makes them owner of an unverified club), then writes events directly to the database.
- What they get: the database's insert rule for events checks only that the caller is the creator, has consented, can publish, and is an owner/admin of the org — it never checks that the club is verified or unhidden, never checks title/description/location length, never runs the word filter, and never checks the start date. So the attacker publishes unlimited, unfiltered "events" that other students see on the campus events tab (sorted by start time, so a back-dated event pins to the top and buries real ones). A related variant: officers can rename their club directly, skipping the name filter.
- Evidence: route-only checks at `src/app/api/events/route.ts:487` (checkText), `:534` ("Only verified orgs can post events"), plus the length/past-start checks; the live `events_insert_authenticated` rule has none of these; authenticated holds INSERT on every events column; no events triggers; only CHECK is `ends_at >= starts_at`. The campus list at `:258-266` filters org ids only on `hidden_at`, not `verified`. Live: 13 events, 0 on unverified clubs today.
- Fix: move the rule into the database — require the event's org to be verified and not hidden (via a SECURITY DEFINER helper), add length CHECKs and a past-start guard; or revoke INSERT on events from authenticated and insert with the service role after the route's checks.

### 12. A removed or demoted club officer keeps control of every event they created (Medium)

- Area: authorization / clubs. New.
- What an attacker does: a former club owner/admin (e.g. one kicked out for misconduct) acts on the events they created before removal.
- What they get: they can still read the full attendee list (names, majors, years, including people who RSVP after the removal), delete the club's event (cascading its RSVPs, with no way for current officers to restore it), or detach it from the club and re-time it so it drops off the club page but stays on attendees' calendars. Management follows the row's creator, not current club membership. Current officers have no edit/delete route for the club's events.
- Evidence: `src/app/api/events/[id]/attendees/route.ts:53` checks `creator_id` only; live `can_manage_event()` and `events_update_creator`/`events_delete_creator` are creator-scoped with no current-membership test; authenticated holds column UPDATE on `events.org_id`/`creator_id`/`starts_at`/`ends_at`. Owners can't be demoted/removed, so the real attacker is a demoted admin. Live: 0 events whose creator is no longer an officer.
- Fix: for club events, make management follow current owner/admin role in `can_manage_event`, the attendees route, and the event UPDATE/DELETE rules; revoke UPDATE on `events.org_id`/`creator_id`; add an officer-facing edit/delete route.

### 13. A removed or demoted officer can still rewrite the club's posts, and the club can't take them down (Medium)

- Area: authorization / clubs. Prior report: new variant of #19.
- What an attacker does: after removal, edits (through the data API) a post they made while an officer.
- What they get: they deface or impersonate the club on its own posts, which render with the club's attribution in the campus feed, skipping the word filter. The post's edit rule is author-only and never re-checks club role. Current officers get "Not your post" and have no route to edit or delete it — only a platform admin can.
- Evidence: route guard at `src/app/api/posts/[id]/route.ts:545-561` (loadOrgRole); the live `posts_update_own` rule is author-only (`auth.uid()=user_id`), authenticated holds UPDATE on content/tags/status, and no trigger checks org role. Club posts are stored with `user_id` = the officer. Live: 0 club posts today.
- Fix: add `org_id IS NULL OR org_member_role(...) IN ('owner','admin')` to `posts_update_own` (or a BEFORE UPDATE trigger); give current officers a way to delete club posts.

### 14. Ex-members keep seeing who is in the club chat (Medium)

- Area: authorization / chat. New (related to the lost authz lens).
- What an attacker does: a former member of a club (including invite-only and hidden clubs) who left or was removed reads the club-chat membership directly through the data API.
- What they get: leaving or removal deletes only the org-membership row; nobody deletes the club-chat subscription rows, and the chat-roster rule checks only chat membership, not club membership. So the ex-member keeps reading the roster (who belongs, who joins later), plus each person's last-read and typing timestamps — a signal of when specific people are active. They can also keep minting file-upload URLs at Vibe's cost. Message text stays protected. This breaks the rule that hidden clubs are invisible to non-members and that removal cuts access.
- Evidence: `src/lib/orgs/membership.ts:206` subscribes to public channels on join; the leave/remove routes (`join/route.ts:268-272`, `members/[userId]/route.ts:150-154`) delete only `org_members`; the only `org_members` triggers don't touch `channel_members`; the live `channel_members_select_member` rule uses `is_channel_member(channel_id)` with no org check. Live: 2 org-channel chat rows, 0 stale today.
- Fix: add an AFTER DELETE trigger on `org_members` that removes the matching `channel_members` rows, and clean up existing ones; tighten `channel_members_select_member` to also require the channel's org be visible to the caller; have the upload-URL and user-search routes use the same membership check.

### 15. Blocks and removals don't keep people out of a club (Medium)

- Area: authorization / clubs. New.
- What an attacker does: a blocked or removed student sends a join request to a club, or re-joins an open club.
- What they get: for a request-policy club (or any open club they're "visiting"), a blocked student's request lands in front of the officers who blocked them, with their name and a 500-character message and no cooldown between denials. For an open club on their home campus, a removed member re-joins with one tap, which also re-subscribes them to the club chat and restores their posting rights. The join path never checks blocks or records removals, even though the invite path already guards the same thing in the other direction.
- Evidence: `src/app/api/orgs/[slug]/join/route.ts` and `src/lib/orgs/membership.ts` read no blocks; `src/lib/orgs/join-state.ts:151` notes "nothing records removals yet"; the requests list (`requests/route.ts:97`) has no block filter; the invite route does check (`invites/route.ts:439`). Live: 1 visible club (invite-only) today, so latent.
- Fix: run the invite route's block check (`isBlockedWithOrg` against owner + all officers) before admitting or accepting a request; record removals and treat a recorded removal as invite-only for that user; filter blocked users out of the requests list.

### 16. Club admins can remove or demote the other admins directly through the database (Medium)

- Area: authorization / clubs. New (answers an open question from the lost lens).
- What an attacker does: a club admin (not the owner) writes to the membership table directly to remove or demote a co-admin.
- What they get: they strip every other admin/mod out of the club, leaving themselves the only officer under the owner. The app route blocks this ("Only the owner can remove/demote admins"), but the database rule only stops promotion to admin, not admin-over-admin removal or demotion. No self-escalation is possible; the owner row is protected. Latent today (0 admins), turns real as soon as clubs appoint admins.
- Evidence: route guard at `src/app/api/orgs/[slug]/members/[userId]/route.ts:85,143`; live `org_members_update`/`org_members_delete` rules allow an owner/admin caller to change any non-owner row, and the WITH CHECK only requires owner rights when the new role is admin. Live: 5 owners, 2 members, 0 admins.
- Fix: add `(role <> 'admin' OR caller is owner)` to the USING clause of both `org_members_update` and `org_members_delete`; or revoke UPDATE/DELETE on `org_members` from authenticated (the routes already use the service role) and keep only a self-only DELETE for leaving.

### 17. The Vibe+ "who viewed your profile" list can be read for free straight from the database (Medium)

- Area: data exposure / paywall. Merges the dataexp-profiles and dataexp-audiences versions. Prior report: related to #15/#24.
- What an attacker does: any signed-in student reads their own `profile_views` rows through the data API, then resolves the viewer ids to names.
- What they get: the full named history of who viewed their profile, free — the paywall is enforced only in the route. The direct read also ignores the route's 90-day window and its block/mute filter, so they see viewers they blocked and the entire history. Billing is off in production today, so the impact is that the core paid line will be trivially free the day Vibe+ turns on, and that viewers are named before any disclosure to them exists.
- Evidence: live `profile_views_owner_select` allows any owner to read viewer ids; the route (`src/app/api/me/profile-viewers/route.ts`) reads with the caller's own client after `requirePlus`, which is why the owner-read rule exists; `src/lib/metrics/profile-viewers.ts` applies the window and hidden-user filter only in code. Contrast `post_views`, which has row security and no read policy (sound). Live: 43 view rows across 14 owners, 1 entitlement row.
- Fix: drop or narrow `profile_views_owner_select` (revoke SELECT on viewer_user_id/referrer from authenticated); read the ledger with the service role after `requirePlus`; serve the free distinct count through a count-only RPC. Must land before paid Vibe+ turns on.

### 18. The "who saved / viewed this post" counts can be turned into a name-by-name reveal (mute-and-recount oracle) (Medium)

- Area: data exposure / audiences. Prior report: new bypass of the #24 fix.
- What an attacker does: on their own post, silently mutes a suspect, re-reads the count-only savers (or free viewers) total, then unmutes.
- What they get: the total drops by exactly 1 when the suspect saved/viewed the post, because the count is computed after the caller's own mute/block list is removed and muting is instant, silent, and unlimited. Muting a group and bisecting names every saver in a few rounds. This defeats the "Only you can see your saves" promise the security wave was meant to restore, and gives free accounts the paid "who viewed this post" data.
- Evidence: `src/app/api/me/posts/[id]/savers/route.ts` returns `total` after `loadHiddenUsers` filtering; `src/lib/metrics/post-audience.ts:330-334` skips hidden users in the count; live mute policies are owner-only with no rate limit and no notification; `is_muting_now` returns false when queried about someone else, so the probe is undetectable. Live: 0 mutes, 2 bookmarks today.
- Fix: never filter a count-only answer by the caller's own mute/block set — return the unfiltered distinct count; apply the hidden filter only to the Vibe+ identity *list*, never to a total shown next to it.

## Could not settle

None. Every finding above was traced to a definite verdict; no item was left unresolved.

## Smaller notes (Low / Info)

These are low-impact or informational. Fix opportunistically; none is a launch blocker on its own.

- Group chats can put someone in a chat with a person they blocked, and adding members skips the 50-person cap (add is only gated by mutual-follow, not blocks or the cap). `threads/[id]/members/route.ts`.
- Other chat members can read each person's private chat settings (muted / hidden / cleared / pinned) through the data API, because the roster rule returns every column. `channel_members` grants.
- Renaming a group chat skips the word filter that creating one applies. `threads/[id]/route.ts:73`.
- Chat reactions are count-only in the app, but the data API names every reactor to any channel member (a product call — matters only if "who reacted" should be private). `message_reactions`.
- Club officers can rewrite the club name, description, tags, and links directly, skipping the word filter, length caps, link check, and Terms gate (no XSS — React neutralises `javascript:` URLs). `orgs` column UPDATE grants.
- The RSVP database rule is looser than the route: a non-member with an event's UUID can RSVP to a hidden club's event and then read it, and the Terms gate and rate limit can be skipped. `rsvps_insert_own` / `event_visible`.
- Officer-only club routes answer 403 (not 404) for a hidden club, confirming the club exists. `orgs/[slug]/requests` and siblings.
- The campus events list ships each club event's creator identity (name/handle/avatar/campus) to every student, though the UI shows only the club. `events/route.ts:186`.
- Resetting onboarding through the legacy finish route turns off the 45-day home-campus lock and the 14-day handle cooldown, and that route also skips the restriction gate and profile word filter. `me/onboarding-complete/route.ts`.
- The author can hard-delete a post a moderator removed (and its R2 video), breaking the "soft removal, the row stays for appeals" rule. `posts_delete_own`.
- The club-post route writes with the service role and skips the restriction, school-verified, and word-filter checks. `orgs/[slug]/posts/route.ts`.
- A former officer keeps the RSVP attendee list of events they created (same root cause as confirmed #12). `events/[id]/attendees/route.ts:53`.
- A banned/suspended student's `/profile/<handle>` page still returns 200 with their name, bio, and avatar in the link preview (same root cause as confirmed #2). `profile/[handle]/page.tsx`.
- The `user_visible()` database function answers "is this user suspended/banned?" for any user id, leaking moderation status. Revoke EXECUTE from anon/authenticated (policies still call it).
- Profile owners can read who viewed them without Vibe+ through the data API (same root cause as confirmed #17). `profile_views_owner_select`.
- (Info) Known, documented gap still open: a non-member holding a hidden club's event UUID can RSVP directly and then read the event. `20260922110000_..._world_readable_selects.sql:50-57`.
- (Info) Account deletion wipes quarantined evidence, including child-safety images — US law expects reported content to be preserved; have the lawyer confirm the duty. `storage-purge.ts:260`.
- (Info) The restore guard that keeps a shared quarantined photo offline can be defeated by the author deleting the other removed post that names it. `admin/content/restore/route.ts`.

## Checked and sound

Areas the audit reached and found holding up, grouped by lens.

- Chat (authz-chat): prior #1 (reaction markup) and #13 (deletion purging others' chat files) are fixed. Thread message read/write, club-chat @mention push (re-checks visibility + blocks), the media proxy, message delete (own-only), reactions, all own-row routes (accept/decline/hide/clear/mute/pin/read/typing), group kick (admin-only), group rename/photo membership checks, thread list and DM create, and all club-channel management routes were traced and are sound. The static chat pages make no direct data-API calls.
- Clubs (authz-clubs): no role escalation is possible (no INSERT for authenticated on `org_members`; owner/hidden/verified/campus columns are not user-writable; no ownership-transfer route). Invites, join-requests, and followers are SELECT-only for authenticated. Posts can't be attached to a club directly. The RSVP campus rule matches between route and database. Org GET/profile/follow/followers/members/channels/upload/asset/hide and the org list, plus events GET/attendees/ics and search, were traced and are sound.
- Posts & admin scope (authz-posts): post writes are column-limited and own-only; the media-ref triggers cover INSERT and UPDATE and fire for service-role writes; the post DELETE and media routes are folder-scoped with removal/restriction/hidden checks; profile columns are locked down; all 12 admin routes call `requirePlatformAdmin` (self/admin targets refused); entitlements aren't client-writable; `?campus=` browsing reads under the viewer's own rules and leaks no hidden-club or removed content.
- Profiles (data exposure): the public and owner bootstraps, follow lists, reposts, user search, résumé proxy ownership/redaction/block checks, and the users column grants were traced. Prior #38/#50 (is_platform_admin readable) is FIXED. Password reset and school-email request are enumeration-safe; savers is now count-only; `post_views` has no read policy; bookmarks/likes/reposts are owner-only.
- Audiences (data exposure): the savers count-only change, the viewers free/paid split, creator-stats, `requirePlus`, and the row-level rules on bookmarks/likes/reposts/notifications/org_followers/rsvps/connections/mutes/blocks were traced and are sound. The SECURITY DEFINER helpers force `uid = auth.uid()`. The rolling strip, events counts, campus browsing, org rosters, and notifications leak no audience identities.
- Storage (data exposure): buckets are correctly public/private with `profiles_select_own` the only object policy (no cross-user listing). All S67 migrations are applied. The media/résumé/chat-media/org-asset routes are folder- and ownership-scoped with short-lived signed URLs. Account deletion purges the expected folders. Hidden orgs are hidden by the org rules.

## Dismissed on review

None. No finding in this batch was refuted; the two votes recorded for several items differed only on Medium-vs-Low severity, not on whether the issue is real.
