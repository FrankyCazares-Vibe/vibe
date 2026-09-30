# Review A2 (blocks in the database) — bypass lens ("does it actually close the findings?")

Reviewer, 2026-09-27. Read-only; local-DB probes only inside ROLLBACK transactions.

## Progress
- [x] read plan.md A2 row, waveA-build.md (rulings + product calls 5, 6), approach-A2.md, critique-A2.md, notes-A2.md
- [x] migration read end to end; policies re-read locally (posts/post_comments SELECT carry the clause; post_comments has NO UPDATE policy so the all-column UPDATE grant is inert; INSERT WCs cascade via EXISTS(posts))
- [x] trg_notify_on_comment only notifies the POST owner -> a refused insert on the blocker's post sends nothing
- [x] reports table: no authenticated grants/policies -> the cross-block fallback can't be used to READ a blocked pair's post back (snapshot never returned; POST answers ok/404 only)
- [x] channels direct INSERT (authenticated has it) creates a memberless orphan; channel_members has no authenticated INSERT -> group add/cap only via routes
- [x] DM create (threads POST 1:1) has no block check: pre-existing, sends refused by messages_insert_member, GET hides blocked peers -> out of A2 scope

## Probe p1 (as casey = blocked by blake; rolled back)
- blake posts 0; blake's comment 934ff433 on avery's post 0 (viewer-vs-commenter works).
- bookmark insert on blake post -> 42501; repost upsert (ON CONFLICT DO UPDATE) -> 42501. Cascade holds for upsert too.
- record_post_view(blake post) -> TRUE (documented residual, numbers only). post_engagement_counts(blake posts) -> rows (numbers only, documented).
- **GAP: INSERT post_comments (post=avery's 552aacf3, parent_comment_id=blake's 934ff433) -> INSERT 0 1.**
  post_comments_insert_own only asks EXISTS(posts); it never asks whether the PARENT comment is readable.
  The reply is hidden from blake (viewer-vs-commenter) and shown to everyone else, threaded under blake's comment:
  exactly report #4's harm ("everyone else sees it and the victim never does"), for replies. Route POST refuses (parent read
  under RLS -> 400), so this is PostgREST-only. Needs a parent id known from before the block (a loaded page is enough).
- Fix tried (rolled back): a plain `EXISTS (select from post_comments pc ...)` in post_comments_insert_own -> "infinite recursion detected in policy". A SECURITY DEFINER helper works:
  post_comment_reply_ok(parent, post) = parent is null OR exists(parent on the SAME post, not blocked either way with auth.uid()).
  Probe p3: casey reply under blake -> 42501; casey reply to own comment ok; top-level ok; avery reply to blake ok; parent on another post -> 42501.
- Group filter checked through LOCAL PostgREST (service key, read-only): add casey->[blake,drew] hit; drew->[blake,avery] none;
  create drew+[blake,casey] hit; avery->[blake,casey] none; UPPER-case ids still hit (lower-cased). Syntax parses (200).
- A2 unit tests: 46/46 pass.

## Session 2 (2026-09-28, resumed after usage limit)
- [x] re-read migration end to end: helper is sql STABLE SECDEF, search_path '', schema-qualified, EXECUTE to anon/auth/service_role, no REVOKE. PRE-FLIGHT/POST-CHECK sound.
- [x] trg_notify_on_comment notifies post owner only (confirmed again) -> the reply gap sends blake nothing; harm is the threaded public reply he can't see.
- [x] re-probed 2026-09-28 (rolled back): casey reply under blake's 934ff433 on avery's post -> INSERT 0 1; blake reply under casey's 94da982e -> INSERT 0 1; drew sees both threaded; blake sees casey's 0. Gap still open, both directions.
- [x] no SECDEF fn returns post/comment CONTENT (only counts + triggers + the new helper); no views over posts. blocks: only blocker deletes, no UPDATE policy -> the blocked side can't undo a block.
- [x] no RPC inserts channel_members; authenticated has no INSERT on channel_members, no UPDATE on channels -> group add/rename only via routes.
- **GAP widens (route too):** the comments POST route flattens replies to the ROOT (`resolvedParentId = parent.parent_comment_id ?? parent.id`, route.ts:416). Probe (rolled back): drew's reply 1111... under blake's root 934ff433; as casey the parent read of drew's reply returns parent_comment_id=934ff433, so POST /api/posts/<avery post>/comments {parent_comment_id: <drew's reply>} inserts casey's reply under blake's root through the APP route, not only PostgREST. GET threads it under blake's comment for everyone but blake.
  => a helper that checks only the immediate parent is not enough for direct inserts either (casey -> parent=drew's reply; GET maps it to blake's root). Fix must also require the parent to be top-level (the route already only writes root parents).
- [x] other post/comment readers: comment-like route reads under cookie RLS (now hidden -> 404); messages shared-post attachment reads posts under cookie RLS; /posts/[id] page service read is id-only; posts/[id]/media is public media (signed-out too) -> not a block surface. orgs/[slug]/profile + club page grid read club posts with the service role (pre-existing, already noted by builder as follow-up).
- [x] A2 routes read: by-id (isUuid 404, loadPairBlock 404/500) OK; posts/[id] GET (non-author loadPairBlock before club check, 404/500) OK; members route (requireCanPublish, strict uuid, service roster, loadGroupBlockConflict target vs roster, 409 cap, 23505->already) OK; threads create (strict lower-case ids, loadGroupBlockConflict(invitees,[creator]) covers invitee-invitee + invitee-creator) OK; rename (requireCanPublish + checkText) OK; channels UPDATE not granted -> no other rename path.
- [x] reports fallback: only when a suspect (post author / comment author / comment's post author) is blocked with the reporter; judged by the pre-A2 rule; snapshot never echoed. Minor: orgContentAccessAsService is viewer-less, so a hidden-club MEMBER can't report a hidden-club post across a block (fails closed, not a bypass).
- [x] post_reposts.comment (quote text) covered by the insert/update EXISTS(posts) cascade; users.pinned_post_id not writable by authenticated.
- [x] FIX TESTED (rolled back, local clean after: helper absent, insert_own fp back to 111c5d0a, 3 comments): SECDEF post_comment_parent_ok(parent, post) = parent null OR (parent on SAME post AND parent is top-level AND NOT is_blocked_either_way(auth.uid(), parent author)); appended to post_comments_insert_own WC.
  T1 casey->blake root 42501; T2 casey->drew's reply under blake (non-root) 42501; T3 casey->drew root ok; T4 casey top-level ok; T5 parent on another post 42501; T6 avery->blake root ok; T7 blake->casey root 42501; T8 blake->own root ok.
- [x] product calls 2/5/6 not backwards: bio dropped (school-or-blank); pair rule hides both directions (consistent with either-way blocks; blocked side can't see/delete them); copy GROUP_ADD_REFUSED matches call 6 verbatim, GROUP_CREATE_REFUSED names nobody, cap 50 incl. adder.
- [x] OUT OF SCOPE, pre-existing, unowned: GET /api/orgs/[slug]/profile (anon-safe) reads club posts with the SERVICE role filtered only by org_id -> no status/removed_at/restriction/block filter (the club page itself filters status + removed_at). Flag to orchestrator.
- note: members POST has no rateLimit (create has 30/10min); refusal copy is generic but a creator connected to A and B can learn "A and B can't share a chat" (inherent to call 6).
- [x] users row across a block: casey still reads blake's handle, last_active_at, location_text over PostgREST (ruled: users SELECT unchanged, last_active_at revoke is a listed follow-up). Finding #4's "find + stalking signals" half stays open BY DESIGN; the posts/comments/writes half is closed except the reply gap.
- [x] A2 tests 46/46; `npx tsc --noEmit -p .` clean.

## Verdict: fix-first (one real defect)

### MUST FIX
1. **Reply into a blocked person's thread still lands (PostgREST AND the app route).**
   File: `supabase/migrations/20260928120000_blocks_in_rls.sql` (post_comments_insert_own is left unchanged; it asks only EXISTS(posts)).
   Harm: casey (blocked by blake) replies under blake's comment on a third party's post; everyone but blake sees it threaded under blake's comment (report #4's "everyone else sees it and the victim never does"). Works either way round, and through `POST /api/posts/<id>/comments` by passing a THIRD party's reply as the parent (the route flattens to the root without re-checking it, route.ts:416).
   Fix (tested above): new helper
   `create function public.post_comment_parent_ok(p_parent_id uuid, p_post_id uuid) returns boolean language sql stable security definer set search_path = '' as $$ select p_parent_id is null or exists (select 1 from public.post_comments c where c.id = p_parent_id and c.post_id = p_post_id and c.parent_comment_id is null and not public.is_blocked_either_way((select auth.uid()), c.user_id)); $$;`
   + `grant execute ... to anon, authenticated, service_role;` then ALTER POLICY post_comments_insert_own restating its WC word for word `AND public.post_comment_parent_ok(parent_comment_id, post_id)`.
   Migration bookkeeping: move post_comments_insert_own from POST-CHECK 4c `pinned` to a changed-policy regex check; PRE-FLIGHT asserts the new name is free; ROLLBACK restates the old WC (fp 111c5d0a…) and drops the helper; header "HOW ... WITHOUT A WITH CHECK EDIT" updated. The route needs no change to stay clean (42501 -> isRlsRefusal -> 404); optionally re-read the flattened root under RLS and answer 400 "Parent comment not found".

### SHOULD FIX / follow-ups (not A2 defects)
- OUT OF SCOPE, pre-existing, unowned, worth its own ticket: `src/app/api/orgs/[slug]/profile/route.ts:161-168` (anon-safe) reads a club's latest 24 posts with the SERVICE role filtered only by `org_id`: no `status='published'`, no `removed_at is null`, no author-restriction, no block filter. Drafts and moderator-removed club posts reach signed-out callers; a blocked pair's club posts bypass the new RLS. The club page (`src/app/orgs/[handle]/page.tsx:257-264`) does filter status + removed_at.
- Finding #4 is only half closed by design: users row (handle, last_active_at, location_text) stays readable across a block over PostgREST. Keep the last_active_at revoke follow-up on the list.
- `src/app/api/me/threads/[id]/members/route.ts` POST has no rateLimit (create has 30/10 min). The generic refusal is still a pair oracle (a creator/adder connected to A and B learns "A and B can't share a chat"); inherent to product call 6, but a limiter bounds probing.
- A blocked person's PRE-block quote-repost (`post_reposts.comment`) of the blocker's post stays visible to everyone but the blocker (new ones are refused). Ask Franky whether product call 5 extends to quote-reposts.
- reports fallback uses viewer-less `orgContentAccessAsService`: a hidden-club MEMBER can't report that club's post across a block (fails closed; not a bypass).
- comments POST `isMissingPostFk` doesn't cover `post_comments_parent_comment_id_fkey` (parent deleted between read and insert -> 500). Pre-existing.
- Residual accepted and documented: `post_comment_block_hidden(<comment id>)` confirms whether that comment's author and post author are a block pair.

Review complete 2026-09-28.
