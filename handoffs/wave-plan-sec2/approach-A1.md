# Critique result: A1 profile privacy (go-with-changes)

## Recommended approach

Critique file: /Users/franciscocazares/vibe/handoffs/wave-plan-sec2/critique-A1.md

1. New pure module src/lib/profile/hidden-fields.ts (+ hidden-fields.test.ts). Only `import type` is allowed. `npm test` is plain `node --test` over .ts files, so a value import of "./profile-layout" with no .ts extension will not resolve (follow the dynamic-import pattern in self-write-columns.test.ts). Export `blankHiddenWidgets(profile, { isOwner })`. For a non-owner it returns a copy where:
   - bio becomes ""
   - experience: work_experience becomes [] and work_order_manual becomes false
   - skills becomes []
   - working_on: current_on becomes []
   - resume: resume_url becomes null, resume_docs and resume_redactions become []
   - profile_layout.hidden becomes [], while `order` and `bioSide` stay as they are
   - posts is never touched.
   For the owner it returns the profile unchanged.

2. bootstrap/route.ts: call it right after normalizeProfileView (line 230), next to the looking_for strip, for `!viewer || viewer.id !== profile.id`. It must run on the ProfileView BEFORE buildVibeUserV1FromProfile. build-vibe-user-v1.ts:64 fills an empty tagline from the first line of bio, so blanking vibeUser after the build still leaks the bio as the header tagline. Sending `hidden: []` together with blank fields needs no client change: profile.html:677 hides `.widget-empty` in viewer mode, and ProfileMobile.tsx:372 already skips empty widgets for visitors. build-vibe-user-v1.ts and profile-layout.ts then need no logic change; only the comment at profile-layout.ts:34 changes.
   - #5 in the bootstrap: for a signed-in non-owner whose row has a résumé, read the viewer's `school_verified` with the service role. If it is false, null resume_url and resume_docs the same way the anonymous branch does. Do the read only when the target row actually has a résumé (4 of 20 rows), because this is the busiest read in the app.
   - The fallback select (bootstrap:108-114) drops profile_layout, which fails open. It never runs today because the column is live. On that path, still null the résumé keys for non-owners.

3. resume/[...path]/route.ts:
   - Add `profile_layout` to the owner-row select at line 145.
   - Apply three new checks for `!isOwner` only, NOT for `asViewer`. The owner's own phone "Open" button uses `?view=public` (ResumeViewerMobile.tsx:126-132,180), so gating asViewer would 404 the owner's own hidden résumé. The checks: the viewer's school_verified (service read), getActiveRestriction(ownerId) where a failed read is 500, and `layout.hidden` including "resume". All three answer the route's existing uniform 404. No admin exception.

4. users/[handle]/posts/route.ts:
   - Signed-out branch: after the target lookup, call getActiveRestriction(target.id). A restriction gives 404 "User not found"; a failed read gives 500. Add `.is("org_id", null)`. That is exactly the database's own rule: org_content_visible() is false for role anon for every club.
   - Signed-in branch: replace the block read at :66-75, which ignores its error and fails open, with loadPairBlock (fails closed).

5. posts/[id]/page.tsx generateMetadata:
   - Add `user_id,org_id,removed_at,org:orgs!posts_org_id_fkey(hidden_at)` to the select, plus `.is("removed_at", null)`.
   - Call getActiveRestriction(user_id). A failed read, an active restriction or a hidden club all return a generic `{ title: "Post · Vibe" }` with no description and no image.
   - Leave the body's existence check at :113-118 without a removed_at filter (see breakage risks). Optional: move the auth redirect above the existence check so signed-out visitors always get a 307.

6. profile/[handle]/page.tsx:
   - Add `profile_layout` to the loadPublicProfile select.
   - generateMetadata: a restricted user returns exactly the unknown-handle metadata `{ title: "@<handle> · Vibe" }`. When the layout hides bio, the description skips bio (tagline, else "<name>'s profile on Vibe"). The hidden-bio leak here is not in the plan's #2b line, but A1 owns the file.
   - Metadata changes only. Do not notFound() the body unless a platform admin is let through.

7. Revoke rather than change the copy. Evidence:
   - skills, work_experience and current_on have zero cookie-client readers in src and zero direct PostgREST calls in public/html.
   - bio has two cookie-client readers: GET /api/me/threads (embed at threads/route.ts:465) and POST /api/me/reports (spec at reports/route.ts:119).
   - The threads embed already leaks a hidden bio to DM partners through a route (messages.html:2014 subtitle `peer.school || peer.bio`), so it must change either way.
   - So A1 takes threads/route.ts: drop `bio` from the embed and from ThreadPeer. messages.html needs no edit; it falls back to school, else ''.
   - A1 also takes reports/route.ts: the user spec becomes `id,handle,name,tagline` on the cookie client for the visibility check, then bio is read with the service role into the snapshot so moderators keep it.

8. Migration 20260928100000_users_profile_widgets_server_only.sql (grants only, so no policy to restate):
   - Change: `revoke select (bio, skills, work_experience, current_on) on public.users from authenticated;` (also from anon and public; harmless).
   - PRE-FLIGHT: authenticated has SELECT on those four; authenticated has no SELECT on profile_layout, resume_url, resume_docs or resume_redactions; no pg_proc or pg_views body names the four.
   - POST-CHECK:
     - has_column_privilege is false for the four.
     - It is still true for id, name, handle, avatar_url, school, major, year, tagline, campus_id and school_system (every users embed in src uses only these).
     - Behaviour: inside the transaction, as `set local role authenticated`, `select bio from public.users` raises 42501 (catch insufficient_privilege) and `select id,handle,name,avatar_url,school` succeeds.
   - Then `notify pgrst`.
   - ROLLBACK: the matching grant.
   - Apply it AFTER the code deploy. Applied first, every inbox load (GET /api/me/threads) and every user report 500s. The new code is safe under both grant states.

9. With the revoke in place, the "hidden · only you see it" copy (ProfileMobile.tsx:370, profile.html:7757) becomes true. Make no copy edits.

10. Local tests:
   - The local DB is in step with prod (quarantine bucket present, is_platform_admin revoked), even though local schema_migrations only records up to 20260926100000.
   - Probe the migration as the authenticated role.
   - Walk it as blake at 375px with a hidden résumé and bio, set in a rolled-back or restored local row: visitor bootstrap, /api/resume as a non-owner (verified vs unverified), the owner's view=public, and /api/me/threads plus a user report after the revoke.

## Ownership changes

- ADD src/app/api/me/threads/route.ts (A1): drop `bio` from the channel_members -> users embed at :465 and from the ThreadPeer type at :33. This must land before the revoke, and it also stops a hidden bio leaking to DM partners. A2 owns only threads/[id]/**, so there is no conflict.
- ADD src/app/api/me/reports/route.ts (A1): the type=user snapshot reads bio with the service role after the cookie-client visibility read (spec at :119). Otherwise user reports 500 after the revoke. No other batch owns this file.
- ADD src/lib/profile/hidden-fields.ts + src/lib/profile/hidden-fields.test.ts (already implied by the plan): zero value imports.
- DROP the copy edits in src/components/mobile/ProfileMobile.tsx and public/html/profile.html from A1: with the revoke landed the copy is true. That also removes any overlap with B3, which owns profile.html's composer path in wave B.
- build-vibe-user-v1.ts and profile-layout.ts: keep ownership, but expect no logic change. Blanking happens on the ProfileView in the bootstrap; profile-layout.ts:34 needs only a comment update.
- public/html/messages.html needs NO edit (`peer.school || peer.bio || ''` falls back cleanly). Nobody needs to own it.
- Cross-batch FYI for A2: if A2 adds a block clause to users_select_authenticated, the signed-in handle lookup in users/[handle]/posts returns null for a blocked pair and answers 404 instead of {posts:[],blocked:true}. Harmless, because the bootstrap answers blocked pairs first with the service role, but A2's reviewer should know.
- Follow-up, not A1: authenticated still holds column UPDATE on users.current_on, resume_url, resume_docs, resume_redactions, work_order_manual, website, year, department, voice_samples, otto_settings and last_active_at. Direct writes to current_on or resume_docs skip the profile word filter and link check. There is no cookie-client writer except heartbeat (last_active_at). Give it to a later batch.

## Breakage risks

- Revoke applied before the deploy: GET /api/me/threads (every inbox load, threads/route.ts:462-472) and POST /api/me/reports type=user both 500 on 42501. Fix: code first, migration after, and say so in the migration header.
- Blanking vibeUser after buildVibeUserV1FromProfile: an empty tagline is filled from the first line of bio (build-vibe-user-v1.ts:64), so the hidden bio still shows in the header. Fix: blank the ProfileView before the build.
- Gating the résumé proxy on `asViewer` instead of `!isOwner`: the owner's own phone 'Open' button (`?view=public`, ResumeViewerMobile.tsx:132) and the desktop 'View as others see it' would 404 their own hidden or unverified résumé. Fix: the three new checks run for non-owners only.
- Adding removed_at to the existence check in the /posts/[id] page body: GET /api/posts/[id] (route.ts:123-127) serves a removed post to its author so they see the removal notice, and the page would 404 that author first. Fix: change only generateMetadata.
- Returning notFound() from the /profile/[handle] page body for a restricted user with no admin exception: moderation screens link straight to /profile/<handle> (bootstrap docblock). Fix: change metadata only, or let a platform admin through.
- hidden-fields.ts with a value import (e.g. of sanitizeProfileLayout from './profile-layout'): `node --test` can't resolve an extensionless relative import, so npm test fails. Fix: only `import type`, and operate on plain arrays.
- The bootstrap fallback select without profile_layout fails open (default layout, nothing hidden). The path is dead today because the column is live. Fix: on that path, still null the résumé keys for non-owners.
- Restriction reads in metadata must fail closed to the generic title and never throw: getActiveRestriction returns {ok:false} on error, and it must be treated as restricted in metadata. In the bootstrap and the posts grid it answers 500, matching the existing pattern.
- Sending an empty `hidden` list while fields stay non-empty would draw the 'hidden' widgets to visitors. Both changes must ship together in the same helper (and the unit test should assert the pair).
- A viewer's school_verified must be read with the service role or the cookie client. It is granted to authenticated, so either works, but moderation/access.ts readAccess isn't exported, so write one narrow select rather than widening another module.

## Live facts

- public.users grants are COLUMN-level. Table SELECT for authenticated is false. attacl: bio, skills, work_experience = {authenticated=r/postgres}; current_on = {authenticated=rw/postgres}; profile_layout = none. anon has no SELECT on users at all. A per-column REVOKE works; no table re-grant is needed.
- authenticated has NO SELECT on resume_url, resume_docs, resume_redactions, profile_layout, looking_for, email, school_email, is_platform_admin or campus_set_at. It still HAS column UPDATE on resume_url, resume_docs, resume_redactions, current_on, work_order_manual, website, year, department, voice_samples, otto_settings and last_active_at.
- No public function or view body references bio, skills, work_experience or current_on (pg_proc and pg_views scan: none).
- users_select_authenticated (SELECT, authenticated): `((id = ( SELECT auth.uid() AS uid)) OR user_visible(id))`. users_update_self WITH CHECK: `((auth.uid() = id) AND (NOT is_restricted_now()))`.
- posts_select_authenticated: `(((status = 'published'::text) AND (removed_at IS NULL) AND user_visible(user_id) AND ((org_id IS NULL) OR org_content_visible(org_id))) OR (user_id = ( SELECT auth.uid() AS uid)))`.
- org_content_visible(p_org_id) is SECURITY DEFINER, search_path '' and begins `current_setting('role', true) is distinct from 'anon'`, so the DB treats ALL club content as invisible to signed-out users. user_visible(p_user_id) is SECURITY DEFINER with search_path 'public' (not '') and checks for an active account_restrictions row. anon has EXECUTE on both.
- posts FKs: posts_user_id_fkey, posts_org_id_fkey, posts_campus_id_fkey, posts_removed_by_fkey.
- Counts for the header: 20 users. 1 has any hidden widget (hides experience, skills and resume, and holds a résumé doc). 0 hide bio, 0 hide working_on. 4 hold a résumé. 6 are not school-verified, and 0 of those hold a résumé. 0 active restrictions, 0 removed posts, 0 club posts, 21 published posts. 5 orgs, 4 of them hidden.
- Latest prod migration: 20260927142000_post_media_url_author_folders. Local schema_migrations stops at 20260926100000, but the local DB has the later effects (quarantine bucket, is_platform_admin revoked, org_content_visible), so it is in step for testing. Local has 7 users.

## Questions for Franky (ruled in waveA-build.md)

- Revoke the direct-API read of bio, skills, experience and working-on for every signed-in account (not just hidden ones), so these fields reach other people only through the profile page, which respects 'hidden'? Recommended: yes. Nothing in the app reads them that way except the DM inbox subtitle and the report snapshot, and both get fixed in this batch.
- The DM inbox shows a person's bio as the subtitle under their name when they have no school set. Drop that fallback (subtitle becomes school, else blank)? Recommended: yes. Otherwise a hidden bio still shows to everyone you message.
- Should moderators (platform admins) see a student's hidden widgets and hidden résumé when they open the profile? Recommended: no. They see what visitors see, and reports already keep a snapshot of the bio. Keep one rule for everyone who isn't the owner.
- Link previews for a public (not hidden) club's post shared to signed-out people: keep showing the text and author? Recommended: keep them. Share previews are marketing. Only hidden clubs, removed posts and banned authors get the generic 'Post · Vibe' card.

