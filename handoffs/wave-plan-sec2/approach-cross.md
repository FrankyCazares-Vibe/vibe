# Critique result: cross (go-with-changes)

## Recommended approach

Full critique is in /Users/franciscocazares/vibe/handoffs/wave-plan-sec2/critique-cross.md.

1. COVERAGE. All 18 confirmed findings have a batch. #1 is deferred on purpose, and B1 carries the moderator cache note. Some parts of confirmed findings have no owner:
- #5 raises the broader question of whether non-students may read student data. That is a product call.
- #9 notes that 88 of the 100 objects in the profiles bucket are already orphans. Nothing cleans them up.
- #11 points at the campus events list, which filters on hidden_at but not verified (events/route.ts:258-266). A4 owns that file, but A4's row does not mention it.
- #18 covers the "free viewers" count too. `src/app/api/me/posts/[id]/viewers/route.ts` computes `total` after `loadHiddenUsers`, so it is the same oracle, but no batch owns the file.
Four Lows/Infos fell through with no reason given:
- Chat reactions name every reactor.
- `user_visible()` tells any caller whether a user is restricted. The report's fix (revoke EXECUTE) is wrong and would break every policy that calls it.
- Account deletion wipes quarantined evidence (a lawyer question).
- The restore guard can be defeated. B2's "author can't hard-delete a removed post" fix closes this only if it changes both the policy and the route. Write that into B2's row.
One Low is assigned but can't be built as written: A5's "channel_members settings columns hidden from other members" (see W2 below).

2. COLLISIONS AND OWNERS.
F5, the most important break. `src/app/api/me/reports/route.ts:77-104,297` (`readTarget`) reads the reported target with the reporter's own cookie client and deliberately skips block checks, so that someone who blocked a harasser can still report them.
- A2's block clauses in posts/post_comments/users SELECT would refuse exactly that report as not_found.
- A1's optional revoke of users.bio would make every user report error out, because the user snapshot selects `id,handle,name,bio,tagline` with the cookie client.
- Owner: A2 takes this file in wave A. Keep the cookie read. When it comes back empty and loadPairBlock says the pair is blocked, re-read with the service role and re-apply the route's own non-block checks (deleted, draft, hidden club, chat membership). A1 sends A2 a request about `bio`.
- Add a review probe: blake blocks casey, then reports casey's post, comment and profile. Each must return 201.

F2. Give A3 three more files by name:
- `src/app/api/me/profile-views/route.ts`. It reads `profile_views` with the cookie client (lines 115-121 and 172-186), including `viewer_user_id`, and feeds the Otto side panel tiles.
- `src/lib/metrics/profile-viewers.ts` (cookie-client read at :237).
- The post viewers route above.
Without the first two, dropping the policy silently zeroes everyone's profile-view tiles.

F1. A5 owns `src/lib/orgs/**`, which about 30 other files import, including A2's posts routes and the unowned `me/org-invites/[id]` (admitMember). A1 owns `build-vibe-user-v1.ts` and `profile-layout.ts`, which the unowned `me/profile-bootstrap`, `me/profile-sync` and `me/profile` import. Rule: exports change only additively. A1 also owns the existing tests beside those files. A5 keeps `ensureMember`'s signature, because unowned message routes call it.

P1, posts policies:
- A2 owns posts_select_authenticated.
- A5 owns posts_update_own and adds a NEW permissive policy, `posts_delete_club_officer`, with `removed_at is null` from day one. It does not alter posts_delete_own.
- B2 later alters posts_delete_own only.
- Every pre-flight asserts only the text of the policy it changes, never how many policies a table has.

P2. The comment and repost insert checks already do `EXISTS (select from posts)` under the caller's RLS, so A2's posts SELECT block clause carries into both automatically. Prove it with a probe before adding anything more.

P4. A4 and A5 both use the existing `org_member_role`. Neither creates a new shared helper; A4's version sorts before A5's, so A4 could not depend on one.

P5. A5's club-visible clause on channel_members_select_member must go through a SECURITY DEFINER helper. A subquery on `channels` loops back, because channels_select_member runs EXISTS on channel_members. DMs and groups (org_id null) must stay visible to their members.

P6. A5's AFTER DELETE trigger on org_members must be SECURITY DEFINER, like the live `org_members_unfollow_on_leave`. The leave route deletes with the cookie client, and channel_members has no DELETE policy for accepted rows, so an invoker trigger would delete nothing. Consider clearing `org_channel_members` too.

No other file overlaps exist between A1 through A5. `users/search` already filters blocks at lines 177-196.

3. ORDER AGAINST THE DEPLOY. The plan's "apply in order, then push" is wrong for the migrations that take access away.
- A5 (20260928140000) adds a removals table, a trigger and a helper that A5's new code reads. Its tightenings are all tolerated by today's code, because officer writes already use the service role. Apply it BEFORE the push. Then apply 140500 or skip it: 0 stale rows live, so it is a no-op today.
- Push, wait for Vercel READY, and check that the served JS is the new build.
- Then, in order: A2 (110000, and only once the F5 fix is live), A4 (130000), A3 (120000; old routes would read zero), A1 (100000, last).
- A3 should count with the service role in the route, not add an RPC. A new RPC that the new code calls would force the migration to split around the deploy.
- Recommend renumbering the after-push migrations above 140000, and moving wave B to 20260929*, so schema_migrations lists them in the order they were applied.
- No wave-A migration depends on another's objects, as long as P1 and P4 hold.

4. WHERE THE PLAN IS WRONG ABOUT THE LIVE DB.
- W1: authenticated holds table-level SELECT/INSERT/UPDATE/DELETE on profile_views. A column revoke does nothing, so "narrow" the policy means dropping it.
- W2: authenticated holds table-level SELECT on channel_members, so a column revoke is a no-op. A table revoke plus column re-grant would break `/api/me/threads` (:434-438), `/api/me/otto` (:407-409) and `lib/push/badge.ts` (:84-86), which read their own settings columns. Pull this Low out of wave A.
- W3: can_manage_event already grants current officers. The fix is to drop its creator branch for club events. The live escape route is `org_id = null` in the same UPDATE, so the org_id column revoke is the key line.
- W4: authenticated has no UPDATE grant on events title/description/location. A4's officer edit route must write with the service role.
- W5: 12 of 13 live events start in the past. A table CHECK on the start date would fail to add, so the guard goes in the INSERT policy or a BEFORE INSERT trigger. Pre-flight counts rows over each new length cap.
- W6: 20260927100000 is applied live. The RSVP follow-up goes in A4's new file; never edit the applied one.
- W7: 0 stale club-chat rows live.
- W8: the self-leave branch of org_members_delete must stay outside the new owner-only-over-admins clause, or admins can't leave.
- W9: trigger functions fire without EXECUTE.
- W10: see the `user_visible()` item in part 1.
- W11: see the local-DB fact under liveFacts.

## Ownership changes

- ADD to A2: src/app/api/me/reports/route.ts (F5: block-aware fallback in readTarget so a student can still report someone they blocked or were blocked by; also handles A1's bio request)
- ADD to A3: src/app/api/me/profile-views/route.ts, src/lib/metrics/profile-viewers.ts, src/app/api/me/posts/[id]/viewers/route.ts (cookie readers of profile_views and the second #18 oracle)
- ADD to A1: the existing src/lib/profile/build-vibe-user-v1.test.ts and src/lib/profile/profile-layout.test.ts
- ADD to A4's row: the #11 campus-list 'verified' filter in src/app/api/events/route.ts:258-266 (A4 already owns the file)
- RULE for A1 and A5: shared libs (build-vibe-user-v1.ts, profile-layout.ts, src/lib/orgs/**, channel-access.ts) change additively only; no signature or return-shape change, because about 30 unowned files import them
- REMOVE from A5: the Low 'channel_members settings columns not readable by other members' (table-level SELECT grant; making it work would break me/threads, me/otto and push/badge, which A5 doesn't own). Defer it with that reason
- A5 officer post delete = a NEW policy posts_delete_club_officer with removed_at is null built in; B2 alters only posts_delete_own in wave B. The A5 orgs route that deletes a club post leaves media cleanup to B2 and does not reuse the author-only R2 purge
- State in B2's row that 'author can't hard-delete a removed post' must cover both the policy and the DELETE route, which also closes the Info 'restore guard defeated'. The route must refuse before the R2 purge, because an RLS-filtered delete returns no error and the route would then purge a removed post's video
- Explicitly LEAVE OUT with reasons: user_visible() moderation-status leak (the same bit is visible via users_select_authenticated; the report's REVOKE EXECUTE fix would break every policy); chat reactor names (product call); account-deletion evidence wipe (lawyer via James)
- Unassigned: cleanup of the 88 existing orphan objects (#9). Assign a local-only count script to B2, or defer it with the cache decision
- Renumber the after-push wave-A migrations (A2, A4, A3, A1) above A5's 20260928140000 and move wave B to 20260929*, so schema_migrations matches apply order

## Breakage risks

- Reports break for blocked pairs. me/reports readTarget uses the reporter's cookie client with no block check, on purpose. A2's block clauses would make reporting a blocked harasser return not_found. Avoid: A2 owns the route and adds a service-role fallback when loadPairBlock says blocked.
- User reports error out if A1 revokes users.bio. The report snapshot selects id,handle,name,bio,tagline with the cookie client, which then fails with permission denied. Avoid: A2 drops bio from the snapshot or reads it with the service role before A1's revoke is applied (A1 goes last, after push).
- Profile-view tiles go to zero. /api/me/profile-views and lib/metrics/profile-viewers.ts read profile_views with the cookie client, so dropping profile_views_owner_select silently zeroes the Otto panel and profile tiles. Avoid: A3 owns both, moves them to the service role, and the migration is applied after the deploy is confirmed.
- Thread list 500s. A column-level hide on channel_members settings needs a table SELECT revoke, which fails /api/me/threads, /api/me/otto and push badge (own-row reads of hidden_at/pinned_at/muted_until). Avoid: defer that Low.
- Policy recursion. A channel_members_select_member clause with a subquery on channels loops through channels_select_member (EXISTS channel_members) and raises infinite recursion on every chat read. Avoid: use a SECURITY DEFINER helper, and keep DM/group channels (org_id null) visible.
- Leaving a club reports success but does nothing. The leave route deletes org_members with the cookie client via the self branch of org_members_delete. If #16's owner-only clause wraps the whole USING, an admin's leave is silently filtered. Avoid: put the clause only inside the officer branch, and probe that an admin can leave.
- Stale chat rosters stay. A5's AFTER DELETE trigger as an invoker function deletes nothing, because channel_members has no DELETE policy for accepted rows. Avoid: make it SECURITY DEFINER like org_members_unfollow_on_leave.
- Officer event edit 500s. authenticated has no UPDATE grant on events.title/description/location, so a cookie-client edit route fails with permission denied. Avoid: write with the service role after the route's checks.
- Migration fails to apply. A table CHECK on events starts_at >= now() fails against the 12 past events, and would block later edits of past events. Avoid: guard INSERT only (policy WITH CHECK or a BEFORE INSERT trigger).
- Pre-flight abort. If any wave-A pre-flight asserts a policy count on posts (A5 adds one) or checks schema_migrations rows (local stops at 20260926100000 even though the objects exist), it aborts locally or on the second apply. Avoid: assert only the text of the policy being changed, via catalog reads.
- Apply-order outage. The plan applies all migrations before the push. A3's drop and A1's revoke then hit old code for the whole deploy window, and A5's new code would 500 if A5 went after. Avoid: A5 before push; A2, A4, A3, A1 after the served build is verified.
- Shared-lib breakage. A signature change in src/lib/orgs/** (admitMember, loadOrgRole, join-state types), build-vibe-user-v1 or ensureMember breaks unowned callers such as me/org-invites/[id], me/profile-bootstrap and the message routes. Avoid: additive exports only; tsc gate.
- Evidence loss through officer delete. A new officer delete route that reuses the author R2 purge, or an officer policy without removed_at is null, lets a moderator-removed club post and its media be hard-deleted. Avoid: put removed_at is null in the new policy, and leave media cleanup to B2.

## Live facts

- Last applied live migration is 20260927142000; every 20260928* version is free. Local DB: schema_migrations stops at 20260926100000, but the Sept 27 objects exist locally, and the policy text on posts/events/org_members/channel_members/users/profile_views/rsvps/post_comments/post_reposts/orgs/channels hashes identical to live (md5 91e2db470a9d56672c55683fe727f23b).
- posts_select_authenticated: ((status='published' AND removed_at IS NULL AND user_visible(user_id) AND (org_id IS NULL OR org_content_visible(org_id))) OR user_id = (select auth.uid())). posts_update_own USING auth.uid()=user_id, WITH CHECK auth.uid()=user_id AND has_recorded_consent() AND can_publish_now(). posts_delete_own USING auth.uid()=user_id.
- post_comments_insert_own and post_reposts_insert_own WITH CHECK include EXISTS (SELECT 1 FROM posts p WHERE p.id = ...post_id), evaluated under the caller's posts RLS. post_comments_select_authenticated = own OR (removed_at IS NULL AND user_visible(user_id) AND EXISTS posts).
- users_select_authenticated = (id = (select auth.uid())) OR user_visible(id). users grants to authenticated are column-level only (no table SELECT). bio/skills/work_experience/current_on/location_text/last_active_at are SELECT-granted; profile_layout, email, is_platform_admin and resume_docs are not.
- can_manage_event(p_event_id) = exists event where creator_id = auth.uid() OR (org_id not null AND caller is owner/admin in org_members). It already includes current officers; the creator branch is the hole.
- events policies: insert WITH CHECK = creator self + consent + can_publish_now + (org_id null OR org_member_role IN owner/admin). update USING creator self, WITH CHECK also requires officer for org events. delete USING creator AND (org_id null OR NOT is_restricted_now()). select = event_visible(org_id, creator_id, id), where event_visible includes creator, non-hidden org or member, and anyone with an RSVP.
- events grants to authenticated: table-level INSERT/SELECT/DELETE; UPDATE is column-level on id, org_id, creator_id, starts_at, ends_at, created_at only (no UPDATE on title/description/location). Only CHECK is ends_at >= starts_at. No triggers on events.
- Live events: 13 total, all club events, 12 with past starts, 3 on hidden (test) verified clubs, 0 on unverified clubs, 0 whose creator is no longer an officer. 0 RSVPs by non-members on hidden-club events.
- rsvps_insert_own WITH CHECK = auth.uid()=user_id AND NOT is_restricted_now() AND rsvp_on_home_campus(event_id). No visibility check (the hidden-club gap). rsvps_select_own_or_manager = own OR can_manage_event(event_id).
- profile_views: only policy is profile_views_owner_select (SELECT, auth.uid() = profile_user_id); authenticated holds TABLE-level SELECT/INSERT/UPDATE/DELETE; 43 rows. post_views: RLS on, no policies.
- channel_members: authenticated holds TABLE-level SELECT and DELETE; UPDATE column-level on accepted_at, last_read_at, hidden_at, pinned_at, typing_until, muted_until, cleared_at. Policies: select_member = is_channel_member(channel_id); update_own; delete_own_pending (accepted_at IS NULL only). 2 club-chat rows, 0 stale.
- channels_select_member = org_id IS NULL AND EXISTS channel_members (recursion hazard for any channel_members policy that subqueries channels). can_view_org_channel(cid, uid) returns false for org_id-null channels.
- org_members: UPDATE column-level on role only; table-level DELETE. org_members_delete USING (role <> 'owner') AND (user_id = auth.uid() OR (officer AND NOT is_restricted_now())). org_members_update WITH CHECK requires owner only when the new role is admin. Triggers: org_members_imply_follow (AFTER INSERT), org_members_unfollow_on_leave (AFTER DELETE), both SECURITY DEFINER with NO authenticated EXECUTE, and both fire fine.
- orgs: UPDATE column-level on name, description, logo_url, banner_url, tags, backdrop_preset, updated_at, links, philanthropy. Every orgs update in code goes through the service role (orgs/[slug]/route.ts:632, admin verify/hide).
- All helpers exist, SECURITY DEFINER, EXECUTE granted to anon and authenticated: user_visible, is_blocked_either_way(viewer_id, other_id) (returns false unless one argument is auth.uid()), org_content_visible, org_member_role, can_manage_event, event_visible, rsvp_on_home_campus, is_channel_member, can_view_org_channel, is_org_member, is_muting_now.
- Counts: 0 blocks, 0 mutes, 0 org admins, 0 club posts, 0 removed posts, 0 active restrictions, 5 orgs (1 visible), 20 users (6 not school-verified), 1 account hides a résumé it holds.
- Local seed users: blake_iu 6979e030-690b-4092-bb91-fd6f00a6a988 (verified), casey_purdue be3e2af2-f457-4414-8f22-8746bdf9bf59 (verified), drew_new 8dc49662-65fd-437f-9692-20741e00a298 (NOT verified, good for #5 probes), avery_owner c3b9dbb5-df1f-4674-9a9b-134a487ae1a2.

## Questions for Franky (ruled in waveA-build.md)

- Should accounts that are not school-verified be able to read student data at all? This is the broader question #5 raises. Recommendation: this wave gates only résumés (A1); put the broader rule on the pre-launch list.
- Should chat reactions keep naming who reacted to chat members? Recommendation: yes, leave it (normal in chat apps) and record it as decided rather than leaving the Low open.
- What happens to the 88 orphaned photos already in the public profiles bucket? Recommendation: B2 writes a local-only count/list script now; deleting them waits for your yes, together with the photo-cache decision.
- Account deletion currently wipes quarantined evidence, including possible child-safety images. Recommendation: keep quarantined objects out of the self-delete purge until the lawyer (via James) confirms how long they must be preserved.

