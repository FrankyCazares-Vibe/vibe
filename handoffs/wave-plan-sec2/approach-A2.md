# Critique result: A2 blocks in the database (go-with-changes)

## Recommended approach

Critique file: /Users/franciscocazares/vibe/handoffs/wave-plan-sec2/critique-A2.md

1. MIGRATION supabase/migrations/20260928110000_blocks_in_rls.sql (house format). Two ALTER POLICYs, each restating the live text word for word plus one clause:
   - posts_select_authenticated USING (((status = 'published'::text) AND (removed_at IS NULL) AND user_visible(user_id) AND ((org_id IS NULL) OR org_content_visible(org_id)) AND (NOT is_blocked_either_way((SELECT auth.uid()), user_id))) OR (user_id = (SELECT auth.uid())))
   - post_comments_select_authenticated USING ((user_id = (SELECT auth.uid())) OR ((removed_at IS NULL) AND user_visible(user_id) AND (NOT is_blocked_either_way((SELECT auth.uid()), user_id)) AND (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_comments.post_id))))
   Do NOT rewrite post_comments_insert_own, post_reposts_insert_own/update_own or bookmarks_all_own. Their WITH CHECK already runs EXISTS(SELECT 1 FROM posts p WHERE p.id = ...) under the caller's RLS, so the posts clause carries over to them: a blocked pair can no longer comment on, repost or bookmark each other's posts. Restating four more expressions would only add drift risk. In the header, say this is how the report's "WITH CHECK on comment/repost inserts" is met.
   Leave post_likes and comment_likes alone. authenticated has no INSERT on either, and the like route writes with the service role after loadPairBlock.
   PRE-FLIGHT: pin md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) for the two changed policies and the four cascade policies, plus users_select_authenticated (fingerprints under liveFacts). Assert these are the ONLY SELECT/ALL policies on posts and post_comments. Pin md5(prosrc)=11a5c6dc6e744b30bf18ecc5c515716e for is_blocked_either_way, and check it is SECURITY DEFINER, STABLE and EXECUTE-able by authenticated. Check RLS is on for both tables. Pin ONLY what you change or depend on; A5 and B2 will change the posts UPDATE/DELETE policies later.
   POST-CHECK: catalog check that both quals contain is_blocked_either_way and the pinned others are unchanged. Behaviour check (prod has 0 blocks, so read-only): as authenticated with a real sub, count(*) on posts and post_comments is unchanged from before the ALTER. Then notify pgrst, 'reload schema'.
   Optional, low priority: CREATE OR REPLACE record_post_view (md5 f67cc5ce...) with an early `IF public.is_blocked_either_way(v_user_id, v_author) THEN RETURN false; END IF;`. The view route already stops blocked pairs through postAccessForCaller; this only closes the direct RPC. Skip post_engagement_counts and comment_like_counts: they return numbers only, and list them under DOES NOT in the header.
   LOCAL TESTS: the local fingerprints match live, and local already holds blake_iu (6979e030-690b-4092-bb91-fd6f00a6a988) blocking casey_purdue (be3e2af2-f457-4414-8f22-8746bdf9bf59). Run as casey: blake's 3 posts are gone. INSERT post_comments, post_reposts or bookmarks on a blake post: expect 42501. casey still sees casey's own post. Run as drew_new (8dc49662-65fd-437f-9692-20741e00a298): sees all of blake's posts and casey's comments. Run as blake: casey's comments on a third party's post are hidden, and DELETE of an old repost still works.

2. users SELECT: NO CHANGE (see breakageRisks). The plan asked to "prefer hiding from search/profile", and that is already done by users/search (:177-196), /api/search (:273-281) and bootstrap. A2 adds the by-id route.

3. src/app/api/users/by-id/[id]/route.ts: 404 on a malformed id (isUuid from src/lib/pgrest.ts; today a bad id gives a 22P02 error, which is a 500). After reading the row, run loadPairBlock(supabase, user.id, data.id): blocked either way gives 404 "User not found"; !ok gives 500 (fail closed, like the sibling routes). The only caller (public/html/profile.html:7051) falls back to /profile/<cached handle>, and bootstrap there already renders the blocked state, so nothing breaks.

4. src/app/api/posts/[id]/route.ts GET only: after the row read (:144) and before the hidden-club check (:179), when authorId !== user.id run loadPairBlock: blocked gives the same 404 "Post not found"; !ok gives 500. Once the migration is live this is belt-and-braces, because RLS already returns null there.

5. src/app/api/posts/[id]/comments/route.ts: no logic change needed. POST already calls authorBlockCheck (:46-70, :345-355), GET already drops blocked commenters, and parent lookups answer 400 cleanly. Update the stale docblock at :124 ("RLS only hides removed comments").

6. src/app/api/me/reports/route.ts (ADD to A2): in readTarget, when the post branch (postAccessForCaller, :110) or the comment branch returns not_found:
   - re-read the row with the service role;
   - if loadPairBlock(viewer client, viewerId, owner) is not blocked, keep not_found;
   - if blocked, judge the row by the pre-A2 rule: published, removed_at null, author user_visible, club passes orgContentAccessAsService; for a comment, the comment is not removed, its author is visible, and its post passes the same rule; check the pair against both the comment author and the post author.
   Put the rule in a pure src/lib/moderation/report-visibility.ts with a test beside it. This keeps the route's documented promise that reporting works across a block.

7. src/app/api/me/threads/[id]/members/route.ts: switch requireTermsAccepted to requireCanPublish, as group create does.
   - Cap: service head-count channel_members for the channel; 50 or more gives 409 "This chat is full (50 people)".
   - Block check: target vs every current member, read from blocks with the SERVICE client. blocks_select_either hides third-party rows, and is_blocked_either_way returns false for authenticated when neither id is auth.uid(), so loadAnyPairBlock with the viewer's client would silently pass everyone. A hit gives 403 with generic copy "You can't add this person to this chat."
   - Add a service-role N-by-M helper (e.g. loadGroupBlockConflict(service, ids, peerIds)) to src/lib/safety/pair-block.ts plus a test. That file is the one block module; its header forbids a second .or() over blocks.

8. src/app/api/me/threads/route.ts (ADD to A2, group-create branch only): run the same pairwise check across creator and invitees before insert. Move MAX_GROUP_MEMBERS (:25) into a shared const that both routes import.

9. src/app/api/me/threads/[id]/route.ts PATCH: switch to requireCanPublish. If update.name is non-empty and checkText(update.name) is not ok, return contentBlockedResponse("name"), mirroring threads/route.ts:264. Both clients print j.error.

10. ORDER: deploy the code FIRST, then apply the migration. The reports fallback must be live before RLS starts hiding blocked pairs; every other code change works with or without the migration. Live has 0 blocks, so the window is harmless in practice, but write "after the deploy" in the header.

## Ownership changes

- ADD src/app/api/me/reports/route.ts (readTarget post + comment branches, and possibly the user-snapshot columns, see the A1 conflict below). Owned by no batch in either wave. Without it the posts/comments RLS change makes reports across a block return 404.
- ADD new src/lib/moderation/report-visibility.ts + report-visibility.test.ts (the pure cross-block report rule).
- ADD src/lib/safety/pair-block.ts + pair-block.test.ts (a service-role N-by-M group block helper). It is the single block module (header rule M11), and no other batch needs it.
- ADD src/app/api/me/threads/route.ts (group-create branch: pairwise block check + shared 50 cap). Owned by no batch. If A5's channel_members settings-column change needs the own-settings reads here (:385, :435-436 read hidden_at/pinned_at/muted_until with the cookie client), A5 must send a request rather than co-own the file.
- Optional ADD src/app/api/search/route.ts (unowned): fail closed when the blocks read errors (it ignores blockRowsRes.error today, :273-283).
- REQUEST to A5: users/search/route.ts:177-196 swallows a blocks-read error and shows unfiltered results. Switch it to loadHiddenUsers and fail closed while A5 is in that file.
- CONFLICT with A1: if A1 revokes SELECT on users.bio (or skills/work_experience/current_on) from authenticated, two A2-owned files break with 42501 on cookie reads: reports/route.ts readTarget user spec 'id,handle,name,bio,tagline' (:120) and threads/route.ts:465 roster embed 'users(id, handle, name, avatar_url, school, bio)'. A1 must list them. Because A2 owns both files now, A2 drops bio from those reads (or reads via service) in the same wave, and A1's migration must apply after that deploy.
- Cross-batch note for A3: after this change, comment counts read with the cookie client (posts/[id] GET :197-200) leave out comments from the viewer's block pairs. That is not a #18 identity leak, because comments are public content, but tell the cross-batch skeptic so it isn't flagged.
- Migration pre-flights: A2 (110000) pins only posts SELECT and post_comments SELECT (+ the cascade policies). A5 (140000) and B2 (150000) change posts UPDATE/DELETE and must not assert posts_select_authenticated's old text.
- No change needed in src/app/api/posts/[id]/comments/** beyond a docblock line. Leave postAccessForCaller (src/lib/orgs/hidden-org-access.ts) untouched: it is A5's.

## Breakage risks

- Reports across a block (the main risk): src/app/api/me/reports/route.ts:76-126 deliberately reads the reported post/comment through the reporter's cookie client and documents that it relies on RLS having no block check. After the migration, reporting a blocked pair's post or comment answers 404 "That's not there anymore". The worst case is block-to-evade: a harasser blocks the victim first, and their posts and comments become unreportable by the victim. Fix: the service-role fallback in approach step 6, deployed BEFORE the migration.
- users SELECT block clause (rejected), what it would break: (a) /settings Blocked users list, /api/me/block GET :41-44, where names/handles/avatars vanish on the screen people unblock from; (b) group-chat sender names, messages/route.ts:45,249,525 and threads/route.ts:465 embeds (null users; no crash because the peerTyping filter at :322 guards it, but senders show nameless); (c) stats/campus/route.ts:95-110 users head-counts become viewer-relative and pay a SECURITY DEFINER call per row; (d) reports of a user across a block would 404. Keep users policy unchanged.
- Group add without a service-role block read: messages_insert_member refuses a send when the sender is in a block pair with ANY member of a non-club channel. Adding a blocked person to a group therefore makes the group read-only for both people in the pair. A check through the viewer's client (loadAnyPairBlock or rpc is_blocked_either_way) fails OPEN, because RLS and the helper both hide third-party pairs. It must read blocks with the service role.
- Group create has the same hole: threads/route.ts:224-265 never checks invitees against each other. It must be fixed in the same batch, or a creator can put a blocked pair in one chat and silence both.
- Cap race: a count-then-insert can land at 51 under concurrent adds. Acceptable (largest live channel has 3 members); say so in notes rather than adding a trigger.
- No route 500s from the posts/comments change: comments POST, repost POST/PATCH, save, like and view all read the post through the cookie client or postAccessForCaller first and already answer 404. Repost DELETE and comment DELETE have no EXISTS(posts) check, so removing your own repost or comment still works across a block. The PATCH own-post .single() at posts/[id]/route.ts:634 is served by the own-row branch.
- Null embeds: the notifications route (post embed, filters hidden actors at :79) and the chat shared-post attachment (MessagesMobile.tsx:153/4050, messages.html:2364-2370) already handle a null post. The feed and bookmarks use `posts!inner` and simply drop the row.
- Known inconsistency (not A2's file): the club page grid (src/app/orgs/[handle]/page.tsx:254) reads club posts with the service role, so a blocked officer's club post still shows there while the feed (feed/route.ts:357 notIn user_id) and now RLS hide it. Note it for a follow-up.
- Local walk: the local seed already has blake_iu blocking casey_purdue. After the migration casey's post disappears for blake in the 375px walk. That is expected, not a regression.
- by-id bad id: loadPairBlock returns ok:false for a non-UUID, so validate with isUuid first and answer 404. Otherwise a bad id becomes a 500 (today it is already a 22P02 500).

## Live facts

- Counts (live, 2026-09-27): blocks 0, posts 23, post_comments 11, post_reposts 5, users 20, channels 22, channel_members 25, largest channel 3 members.
- posts_select_authenticated (authenticated, only SELECT policy on posts): (((status = 'published'::text) AND (removed_at IS NULL) AND user_visible(user_id) AND ((org_id IS NULL) OR org_content_visible(org_id))) OR (user_id = ( SELECT auth.uid() AS uid)))
- post_comments_select_authenticated (only SELECT policy on post_comments): ((user_id = ( SELECT auth.uid() AS uid)) OR ((removed_at IS NULL) AND user_visible(user_id) AND (EXISTS ( SELECT 1 FROM posts p WHERE (p.id = post_comments.post_id)))))
- post_comments_insert_own WC: ((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now() AND (EXISTS ( SELECT 1 FROM posts p WHERE (p.id = post_comments.post_id)))). post_reposts_insert_own WC is the same shape; post_reposts_update_own WC: ((auth.uid() = user_id) AND can_publish_now() AND (EXISTS ...posts...)); bookmarks_all_own WC has EXISTS posts; post_reposts SELECT is own-only.
- users_select_authenticated: ((id = ( SELECT auth.uid() AS uid)) OR user_visible(id)).
- Policy fingerprints, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')), identical live and local: posts_select_authenticated 997152785d7c4188e10394c7c98a1c16; post_comments_select_authenticated bc9bd5d608e9cff736fc284ee225abe3; post_comments_insert_own 111c5d0a128e36a6cf4bbf936561d9a9; post_reposts_insert_own 32d525cf1ed184b48bfa645414add24a; post_reposts_update_own e44b86b68e06a9dd5ada830f10664128; bookmarks_all_own 1f1a49c2d42e2473b2e2abac2ca41643; users_select_authenticated e52bb54d505c551afd51cf78fd24668b.
- Function md5(prosrc), identical live and local: is_blocked_either_way 11a5c6dc6e744b30bf18ecc5c515716e; user_visible 58f1d9227ad4f90bf4630bbbb8751caa; org_content_visible 771be32197d1da4b92665c1e0a1256a9; record_post_view f67cc5ce01cb7782c8241a813846a81d; post_engagement_counts ba7ed25c8d5f2794b904f7f9ae0a2559; comment_like_counts cf13a87cabb7a962c180d178c37ff38f.
- is_blocked_either_way(viewer_id uuid, other_id uuid): SECURITY DEFINER, STABLE, search_path=public, EXECUTE for anon and authenticated. Returns false for anon, and false for authenticated when neither argument is auth.uid(); otherwise it checks the blocks table in both directions. blocks has indexes on (blocker_id, blocked_id), blocker_id and blocked_id. blocks_select_either lets a user read only rows they are a party to.
- Grants: authenticated has NO INSERT on post_likes or comment_likes (dead insert policies, not a hole). It has INSERT on post_comments (all 9 cols), post_reposts (4), bookmarks, channels. It has no UPDATE on channels and no INSERT on channel_members, so rename and member add go through the service role.
- users columns SELECT-able by authenticated include last_active_at and location_text (the report's stalking signals); anon has none. anon has column SELECT on posts/post_comments but no anon policy exists.
- messages_insert_member WC refuses a send if the sender is in a block pair with any other member of a non-club channel, so a blocked pair inside one group chat means neither can send.
- Triggers: trg_notify_on_comment (post_comments) and trg_notify_on_like (post_likes) are SECURITY DEFINER and notify the post owner. There are no triggers on post_reposts or blocks. No Realtime (postgres_changes) is used anywhere.
- Local DB: 1 block (blake_iu 6979e030-690b-4092-bb91-fd6f00a6a988 blocks casey_purdue be3e2af2-f457-4414-8f22-8746bdf9bf59). 9 posts (blake_iu 3 published, casey 1), 3 comments. drew_new 8dc49662-65fd-437f-9692-20741e00a298 is a clean third party.

## Questions for Franky (ruled in waveA-build.md)

- Should someone be able to report a post or comment from a person who blocked them, or whom they blocked? The reports route's own comments say yes ("exactly backwards" otherwise). Recommended: yes. Keep reports working across a block through the service-role fallback, and add no new UI.
- When you add someone to a group chat and they have a block with someone already in it, what should the adder see? Recommended: refuse with one generic line, "You can't add this person to this chat." Don't name who or why. Letting the add through would stop both people in the pair from sending in the group.
- Any signed-in student can currently read everyone's last-online time (users.last_active_at) and typed location through the data API, blocked or not. A block can't hide these without breaking chat names and the blocked-users list. Recommended: a follow-up batch (not A2) moves the 'active now' counts (stats/campus) to a count-only server path and revokes last_active_at from students. location_text stays on the profile.

