# Notes A2 — blocks in the database (builder, 2026-09-27)

Migration: supabase/migrations/20260928120000_blocks_in_rls.sql (apply AFTER the deploy).
Read: plan.md, waveA-build.md, approach-A2.md, critique-A2.md. Started.

## Progress
- [ ] read findings (#4 + Lows) in 2026-09-27-security-lenses-authz-dataexp.md
- [ ] live state re-read via MCP (read-only)

## LIVE STATE (read-only MCP, 2026-09-27)
- counts: blocks 0, posts 23, post_comments 11, post_reposts 5, bookmarks 2, channels 22, channel_members 25, largest channel 3.
- RLS on for posts + post_comments. Policy fps match the critique exactly:
  posts_select_authenticated 997152785d7c4188e10394c7c98a1c16 (only SELECT on posts);
  post_comments_select_authenticated bc9bd5d608e9cff736fc284ee225abe3 (only SELECT on post_comments);
  post_comments_insert_own 111c5d0a...; post_reposts_insert_own 32d525cf...; post_reposts_update_own e44b86b6...;
  bookmarks_all_own 1f1a49c2...; users_select_authenticated e52bb54d...
- fn md5(prosrc): is_blocked_either_way 11a5c6dc... (SECDEF, stable, EXECUTE anon+auth); user_visible 58f1d922...;
  org_content_visible 771be321...; record_post_view f67cc5ce...; post_engagement_counts ba7ed25c...; comment_like_counts cf13a87c...
- No function named post_comment_block_hidden exists (name free).
- Indexes: blocks (blocker_id, blocked_id) unique + each column; post_comments pkey + (post_id, created_at).

## Decision D1 — product call 5 needs a THIRD clause (not in approach-A2)
waveA-build product call 5: "A blocked person's comments on your posts disappear for everyone."
approach-A2's comment clause is viewer-vs-commenter only. is_blocked_either_way answers false for a
third party (neither id = auth.uid()), so it can't express commenter-vs-post-author. Adding a narrow
SECURITY DEFINER helper keyed on the COMMENT id: public.post_comment_block_hidden(p_comment_id)
= true when the comment's author and its post's author are a block pair. Keyed on an existing comment
(not an arbitrary user pair) so it can't be used to probe any two people. Residual: for an existing
comment id it confirms that pair is blocked; the product rule itself already shows that (the
comments vanish for everyone). Documented in the header under DOES NOT / residual.
- Live + local: posts/post_comments/blocks owned by postgres (BYPASSRLS, no FORCE RLS), so a SECDEF
  helper that reads post_comments from inside the post_comments policy does not recurse.
- Local fingerprints == live (all 7 policies + 4 fns). Local seed: blake_iu 6979e030 blocks casey_purdue be3e2af2;
  drew_new 8dc49662 clean; avery_owner c3b9dbb5; emery_admin ef638534.

## Decision D2 — record_post_view: SKIP (listed under DOES NOT). Numbers only; the view route already
  stops blocked pairs (postAccessForCaller -> 404 once posts RLS hides it); the Vibe+ name list leaves
  blocked people out (product call 7). Restating a 50-line plpgsql body for a +1 count isn't worth the drift.
## Decision D3 — migration POST-CHECK behaviour probe without writes: create helper, count as a no-block
  sample user BEFORE the ALTERs (stored in a local GUC), ALTER, count AFTER: posts equal; comments
  after = before - (visible-before, not-own comments the pair rule now hides). Plus, if any block row
  exists, assert the blocker reads none of the blocked person's published posts (live: 0 blocks, skipped).

## Migration written + applied locally (2026-09-27)
- supabase/migrations/20260928120000_blocks_in_rls.sql applied with ON_ERROR_STOP: BEGIN..COMMIT clean;
  PRE-FLIGHT passed (local fps == live); POST-CHECK 4a-4e passed (4e ran on the local blake->casey block).
- Added a `lock table posts, post_comments, blocks in share mode` before the BEFORE probe so the
  BEFORE/AFTER counts see the same rows (read committed would otherwise race a concurrent insert).

## Local probes, as real roles, rolled back (scratchpad a2/probe1.sql, probe2.sql)
Seeded (as postgres, rolled back): casey + drew comments on blake post e43d125e, blake comment on casey post, blake repost of casey post.
- casey: blake posts 0; own posts 1; own comment on blake post 1 (own branch); drew's comment on blake post 0; blake's comments 0.
- drew: blake posts 3; casey posts 1; casey's comment on avery post 1; casey-on-blake 0 + blake-on-casey 0 (pair rule, product call 5); own comment on blake post 1.
- blake: casey posts 0; own posts 4 (incl. removed); casey's comment on avery post 0; drew's comment on own post 1;
  DELETE old repost of casey post -> 1 row; DELETE own comment on casey post -> 1 row.
- WRITES as casey (consent t, can_publish t): comment/repost/bookmark on blake post -> 42501 x3 (RLS);
  controls on vibe_review's post -> INSERT 0 1 x3. As blake: comment on casey post -> 42501; on own post -> ok.
- Residual confirmed: drew calling post_comment_block_hidden('<casey-on-blake id>') -> true (documented in header).
- ROLLBACK text tested inside BEGIN..ROLLBACK: restores posts 997152785d7c... and comments bc9bd5d6... exactly.
- NEW fingerprints after this file (tell A5b / B2 / the orchestrator): posts_select_authenticated
  19ad59364b9b85d3773638e72ad7d89a; post_comments_select_authenticated 24311c968863e5f07045e5ee095fdbcd.

## TS work
- pair-block.ts: + groupBlockFilter / loadGroupBlockConflict (SERVICE client, additive; header updated).
  Test: new src/lib/safety/pair-block-group.test.ts (7 tests) — 29/29 pass with pair-block.test.ts.
- NEW src/lib/messages/group-rules.ts (+ test): MAX_GROUP_MEMBERS=50, GROUP_ADD_REFUSED / GROUP_CREATE_REFUSED /
  GROUP_FULL copy, groupAddDecision (already > full > refused > add), groupSizeAllowed. New file in
  src/lib/messages/ (only channel-access.ts there is A5b's).
- members route: requireCanPublish; strict uuid target (404); service roster read; groupAddDecision;
  loadGroupBlockConflict(admin,[target],roster) -> 403 GROUP_ADD_REFUSED; full -> 409 GROUP_FULL; 23505 on insert -> already.
- rename route: requireCanPublish + checkText(name) -> contentBlockedResponse("name") (422), empty name still clears.
- threads route: bio dropped from ThreadPeer + roster embed (messages.html:2014 `peer.school || peer.bio || ''` degrades
  to school-or-blank = product call 2, no client edit needed); group create: loadGroupBlockConflict(admin, invitees, [creator])
  -> 403 GROUP_CREATE_REFUSED; cap via groupSizeAllowed; resolveMembers now strict isUuid + lower-case (dup-spelling fix).
- by-id route: isUuid -> 404; loadPairBlock blocked -> 404 "User not found"; !ok -> 500.
- posts/[id] GET: loadPairBlock for non-authors, blocked -> 404 "Post not found", !ok -> 500 (before the club check).
- comments route: docblock updated; POST insert 42501 (RLS refusal race) -> 404 postNotFound, not 500.
- NEW src/lib/moderation/report-visibility.ts (+ test, 10 tests pass): crossBlockReportVerdict etc.
- reports route: readTarget post (postAccessForCaller not_found, or empty row read) and comment (empty read)
  -> crossBlockFallback: service re-read; blockSuspects -> loadPairBlock with the REPORTER's client; none blocked
  -> not_found (no further reads); else getActiveRestriction (authors) + orgContentAccessAsService (club) ->
  crossBlockReportVerdict; allow -> same snapshot columns as the normal path. No service role -> not_found.
  User branch: cookie read id,handle,name,tagline; bio via service (best effort, null on failure).
- tsc: clean for the whole tree (exit 0) at this point.
- npm test: 1129 tests, 1128 pass, 1 fail = the known src/lib/otto/parse-reminder.test.ts. Mine: pair-block-group (7),
  group-rules (7), report-visibility (10) all pass.
- probe3 (rolled back): group filter semantics as service_role: add casey->[blake,drew] t; add drew->[blake,avery] f;
  create drew+[blake,casey] t; add avery->[blake,casey] f (existing pair not asked). Through drew's OWN client:
  blake/casey block rows 0 and is_blocked_either_way(blake,casey) f -> confirms the viewer client fails OPEN,
  so the group routes must use the service client. casey still reads blake's users row (users SELECT unchanged).
- Route-level HTTP walk NOT done by me: signing in needs the seed password and this task came from the
  orchestrator, not Franky in chat, so I stayed at DB-role probes (the plan's own test method). The browser
  walk after the wave covers the HTTP layer.
- Header edited (record_post_view residual + comment-count note) -> ran the header ROLLBACK locally (fps back to
  997152785d7c / bc9bd5d608e9), re-applied the final file: clean; fps now 19ad5936... / 24311c96.... LEFT APPLIED.
- Negative test of POST-CHECK: posts policy restated WITHOUT the block clause -> POST-CHECK raises
  "posts_select_authenticated does not read as written" (neg2.sql). Equivalent-with-extra-(1=1) passes (neg1.sql).
- Cross-batch notes: creator-stats comment counts (cookie client) now drop comments hidden by blocks; posts/[id] GET
  comment count too (A3's area; not an identity leak). /posts/[id] page (A1) gets null for a blocked pair.

## DONE (2026-09-27)
- Final tsc --noEmit -p . exit 0; my 4 test files 46/46; npm test only the known parse-reminder failure.
- Migration left APPLIED locally (final version). No schema_migrations row recorded locally. Nothing touched in prod.
- Left for others: /api/search blocks-read fail-open (unowned, optional); users/search fail-closed is A5b's row;
  record_post_view direct-RPC view count (numbers only); last_active_at/location_text readable by any student (follow-up);
  club page grid (src/app/orgs/[handle]/page.tsx:254, service role) still shows a blocked officer's club post.
- My routes don't call ensureMember (A5b's new 403 path doesn't reach them): members + rename do their own
  membership reads, and both are group-only.
- REPAIR (2026-09-28) started: reviewer finding = replies across a block via parent_comment_id; fix = post_comment_parent_ok helper in insert_own WITH CHECK.
- Live re-read (MCP read-only, 2026-09-28): post_comments_insert_own fp still 111c5d0a; no post_comment_parent_ok; 0 nested replies (reply under a reply) and 0 cross-post replies live, so a top-level-parent rule rejects nothing that exists.
- Only writer of post_comments with a parent: POST /api/posts/[id]/comments (clients call it; no direct supabase-js insert). No UPDATE policy on post_comments, so parent_comment_id can't be changed after insert.
- Migration edited: 1b post_comment_parent_ok (mirrors the comments SELECT rule on a TOP-LEVEL parent of the same post), 3b ALTER insert_own WC + parent_ok, PRE-FLIGHT both names free, POST-CHECK 4a'/4b' + 4d no-block user refused no readable root + 4e pair refused both ways; 4c pinned drops insert_own; header + ROLLBACK updated. Old ROLLBACK run locally first (fps back to 99715278/bc9bd5d6/111c5d0a).
- Applied locally (ON_ERROR_STOP): clean; PRE-FLIGHT + POST-CHECK 4a-4e passed (4e ran on blake->casey with both roots 934ff433 / 94da982e).
  New fp post_comments_insert_own 2c7653204c6c1131a0c77752d5b98393 (posts 19ad5936 / comments 24311c96 unchanged from before).
- Reply probes as real roles, rolled back (scratchpad a2/probe_reply.sql, probe_reply2.sql): T1 casey->blake root 42501; T2 casey->third party's
  reply under blake (non-root) 42501; T3 casey->drew root ok; T4 casey top-level ok; T5 parent on another post 42501; T6 avery->blake root ok;
  T7 blake->casey root 42501; T8 blake->own root ok; X5 parent that doesn't exist 42501; X6 blake top-level ok; X7 casey top-level on blake post 42501.
  Third party = vibe_review_pal (drew_new has can_publish_now()=false, so drew rows were not evidence): removed root 42501; pair-hidden root 42501;
  blake root ok; casey root ok; controls ok. avery -> own removed root ok (mirrors the route, which reads own comments).
  RPC: anon null->true, anon blake root->false; casey blake root->false; drew->true. Local comments back to 3 after each rollback.
- Route: src/app/api/posts/[id]/comments/route.ts POST now re-reads the flattened ROOT under RLS when the clicked parent is a reply (missing/other post/not top-level -> 400 'Parent comment not found'; read error -> 500 logged); parentNotFound helper; 23503 on parent_comment_id_fkey -> 400 (was 500, reviewer should-fix); isRlsRefusal + POST docblock mention the reply rule.
- New file's ROLLBACK run locally for real: fps back to 99715278 / bc9bd5d6 / 111c5d0a, both helpers gone. Negative test neg3.sql
  (insert_own restated WITHOUT the reply clause) -> POST-CHECK raised "post_comments_insert_own does not read as written"; nothing left behind.
  Re-applied the final file: clean; re-ran probe_reply/probe_reply2/probe1/probe2: same results as above and as before.
- tsc --noEmit -p . exit 0; A2 tests 46/46; npm test 1130 / 1129 pass, only the known parse-reminder failure.
## REPAIR DONE (2026-09-28)
- Migration LEFT APPLIED locally (final version). NEW fp for other batches: post_comments_insert_own 2c7653204c6c1131a0c77752d5b98393
  (posts 19ad5936..., post_comments SELECT 24311c96... unchanged). No other wave-2 migration pins post_comments_insert_own (grepped).
- Not done (not in the must-fix, noted for the orchestrator): members POST rateLimit; pre-block quote-reposts; orgs/[slug]/profile service read.
