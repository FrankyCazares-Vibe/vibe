# Critique A2 — blocks in the database (read-only review, 2026-09-27)

Status: in progress. Notes appended in chunks as evidence comes in.

## Scope read
- plan.md (all batches), report #4 + Lows (group add cap/blocks, group rename word filter).

## Live state (MCP, read 2026-09-27)
- Counts: blocks 0, posts 23, post_comments 11, post_reposts 5, users 20, channels 22, channel_members 25 (largest channel 3 members).
- posts_select_authenticated: `(((status = 'published') AND (removed_at IS NULL) AND user_visible(user_id) AND ((org_id IS NULL) OR org_content_visible(org_id))) OR (user_id = (SELECT auth.uid())))`
- post_comments_select_authenticated: `((user_id = (SELECT auth.uid())) OR ((removed_at IS NULL) AND user_visible(user_id) AND (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_comments.post_id))))`
- post_comments_insert_own WC: `((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now() AND (EXISTS (SELECT 1 FROM posts p WHERE p.id = post_comments.post_id)))`
- post_reposts_insert_own WC: same shape as comments (EXISTS posts). post_reposts_update_own WC: `((auth.uid() = user_id) AND can_publish_now() AND (EXISTS ...posts...))`; select is own-only.
- users_select_authenticated: `((id = (SELECT auth.uid())) OR user_visible(id))`.
- post_likes_insert_own WC: `(auth.uid() = user_id)` ONLY (no EXISTS posts) and trigger trg_notify_on_like writes a notification to the post owner. comment_likes_insert_own same (no EXISTS). bookmarks_all_own WC has EXISTS posts.
- is_blocked_either_way(viewer_id, other_id): SECURITY DEFINER, STABLE, search_path=public; anon -> false; authenticated with neither arg = auth.uid() -> false; else EXISTS blocks either direction. EXECUTE granted anon+authenticated.
- user_visible(p_user_id): SECURITY DEFINER STABLE; false for anon; true unless an active account_restrictions row.
- Column grants (authenticated SELECT on users): id, school, school_verified, name, handle, year, major, department, bio, avatar_url, banner_url, interests, skills, created_at, last_active_at, tagline, website, headline, location_text, work_experience, banner_gradient, handle_changed_at, pinned_post_id, profile_view_count, current_on, work_order_manual, school_system, campus_id. anon has no users columns; anon has column SELECT on posts/post_comments but no anon policy.
- KEY: comments/reposts/bookmarks INSERT already run `EXISTS (SELECT 1 FROM posts ...)` under the caller's RLS, so adding the block clause to posts SELECT alone closes "comment/repost/bookmark on a blocked author's post" with no WITH CHECK rewrite needed.

## Grants + route pre-checks (evidence)
- authenticated has NO INSERT on post_likes or comment_likes (like route writes via service role after loadPairBlock), so the dead `post_likes_insert_own` policy is not a hole. No change needed there.
- authenticated HAS INSERT on post_comments (all 9 cols) and post_reposts (4 cols) and bookmarks: all three WITH CHECKs already contain `EXISTS (SELECT 1 FROM posts p WHERE p.id = ...)`, evaluated under the caller's RLS.
- Routes already pre-check blocks BEFORE writing, and read the post with the cookie client first: comments POST (`authorBlockCheck`, route.ts:46-70), repost (`authorBlockCheck` repost/route.ts:69-120), save, like. Once posts SELECT refuses a blocked pair, their first `.from("posts")` read returns null -> existing 404 path. No route will 500 against the new posts/comments rules.
- comments GET already drops blocked commenters (`notIn user_id`) and orphaned replies; POST parent lookup via cookie client -> a hidden parent gives the existing 400 "Parent comment not found".
- SECURITY DEFINER re-implementations of post visibility that will NOT pick up the new clause: post_engagement_counts, comment_like_counts, record_post_view (all check removed/user_visible/hidden-club only). Numbers only; optional to add `not public.is_blocked_either_way(auth.uid(), p.user_id)` (see approach).

## BREAKAGE FOUND: reports across a block (not in the plan)
- `src/app/api/me/reports/route.ts:76-126` `readTarget` DELIBERATELY reads the reported post/comment/user through the REPORTER'S cookie client and says in its docblock it relies on RLS having NO block check ("a student who blocked a harasser - or who a harasser blocked - could no longer report them. That is exactly backwards"). Post branch goes via `postAccessForCaller` (src/lib/orgs/hidden-org-access.ts:159-167, cookie-client posts read), comment branch reads post_comments with the cookie client.
- After the posts + post_comments block clause: report of a blocked pair's post or comment -> "That's not there anymore" 404 (route.ts:301). User reports keep working only if users SELECT stays block-free.
- UI order today is report-then-block (ReportSheet.tsx:129 report, :155-170 block offered after), so the everyday flow survives; what breaks is (a) a harasser who blocks the victim first makes their posts/comments unreportable by the victim (block-to-evade), (b) a stale sheet submitted after blocking from another tab.
- Nobody owns reports/route.ts in either wave. A2 must take it (post + comment branches of readTarget only), and must NOT edit postAccessForCaller (A5 owns src/lib/orgs/**).

## users SELECT: do NOT add the block clause (evidence)
- /settings "Blocked users" list: `src/app/api/me/block/route.ts:41-44` reads names of the people you blocked with the cookie client -> every row loses its name/handle/avatar (the screen you unblock from). Legacy profile.html:8462 list same route.
- Chat: messages/route.ts:45,249,525 embed `users!messages_user_id_fkey` and :293 `users!channel_members_user_id_fkey`; threads/route.ts:465 roster embed. Group chats can hold a blocked pair today (the Low) -> nameless senders. (peerTyping filter at :322 guards null, no crash.)
- stats/campus/route.ts:95-110 counts users with the cookie client (incl. `last_active_at` filter): counts become viewer-relative and pay a per-row SECURITY DEFINER call.
- reports "user" target would 404 across a block (see above).
- Hiding is already done where it matters: users/search (block filter :177-196), /api/search (:273-281), bootstrap, follow lists; A2 adds by-id. Residual: a blocked student with their own session can still read the blocker's public columns (same as any student) incl. last_active_at + location_text. Put to Franky, not in A2.

## Group chat Lows (evidence)
- messages_insert_member WC refuses a send when the sender is in a block pair with ANY other member of a non-club channel. So adding T to a group where T and member M are blocked silently makes the group read-only for BOTH T and M: the adder can mute M's own group. The add check is not cosmetic.
- members/route.ts:61-99 checks inviter<->target "connected" only. The target<->existing-members check must read `blocks` with the SERVICE client: `blocks_select_either` only shows the viewer's own rows, and `is_blocked_either_way` returns false for authenticated when neither id is auth.uid(). Reusing `loadAnyPairBlock` with the viewer's client would fail OPEN silently.
- Same gap at group CREATE (threads/route.ts:224-265: invitees are never checked against each other). threads/route.ts is owned by no batch.
- MAX_GROUP_MEMBERS = 50 is a private const in threads/route.ts:25; the add route never counts. Live max channel size 3.
- Rename (threads/[id]/route.ts PATCH) writes via service role, gate is requireTermsAccepted only; create path uses requireCanPublish + checkText + contentBlockedResponse("name") (threads/route.ts:213,264). Both clients print `j.error` (MessagesMobile.tsx:2780,2918; messages.html:3367 vibeRequest).

## Search fail-open (low, noted)
- /api/search/route.ts:273-283 and users/search/route.ts:177-196 ignore a `blocks` read error and show unfiltered results. users/search is A5's; /api/search is unowned.

## Local DB
- Local policy/function md5s match live exactly (fingerprints in approach). Local has 1 block: blake_iu (6979e030...) blocks casey_purdue (be3e2af2...). 9 posts, 3 comments locally. drew_new 8dc49662-65fd-437f-9692-20741e00a298 is a clean third party.

## Verdict: go-with-changes
Approach is right for posts + comments (DB) and the two GET routes. Changes:
1. users SELECT: leave it alone (evidence above). Hide via routes (by-id 404; search/bootstrap already do).
2. Do NOT restate the comment/repost INSERT WITH CHECKs: they already run EXISTS(posts) under the caller's RLS, so the posts clause cascades. Fewer restated expressions = less drift. Prove it by behaviour in POST-CHECK/local tests instead.
3. Take `src/app/api/me/reports/route.ts` (post + comment branches): cross-block fallback so reporting keeps working (route docblock promises it).
4. Group add block check reads `blocks` with the SERVICE client (target vs every current member); same check at group create (`threads/route.ts`, unowned). Cap 50 counted with service head count; share the const.
5. Rename: checkText -> contentBlockedResponse("name") and requireCanPublish (as create does).
6. Order: code deploy FIRST, migration after (reports fallback must be live before RLS hides blocked pairs). Live has 0 blocks so the window is harmless either way, but write "after" in the header.

## Pre-flight fingerprints (live == local, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) from pg_policies; md5(prosrc) for functions)
- posts_select_authenticated 997152785d7c4188e10394c7c98a1c16 (the ONLY SELECT/ALL policy on posts)
- post_comments_select_authenticated bc9bd5d608e9cff736fc284ee225abe3 (the ONLY SELECT/ALL policy on post_comments)
- post_comments_insert_own 111c5d0a128e36a6cf4bbf936561d9a9; post_reposts_insert_own 32d525cf1ed184b48bfa645414add24a; post_reposts_update_own e44b86b68e06a9dd5ada830f10664128; bookmarks_all_own 1f1a49c2d42e2473b2e2abac2ca41643 (pin unchanged: the cascade depends on their EXISTS(posts))
- users_select_authenticated e52bb54d505c551afd51cf78fd24668b (pin unchanged)
- fn is_blocked_either_way 11a5c6dc6e744b30bf18ecc5c515716e; user_visible 58f1d9227ad4f90bf4630bbbb8751caa; org_content_visible 771be32197d1da4b92665c1e0a1256a9; record_post_view f67cc5ce01cb7782c8241a813846a81d; post_engagement_counts ba7ed25c8d5f2794b904f7f9ae0a2559; comment_like_counts cf13a87cabb7a962c180d178c37ff38f

Status: complete (2026-09-27). Structured critique returned to the orchestrator.
