# Critique: cross-batch and completeness (cross)

Reviewer: cross critic. Read-only. Sources: plan.md, 2026-09-27-security-lenses-authz-dataexp.md, live DB via read-only MCP, local DB, code grep.

## 1. Coverage (confirmed + Low)

(in progress)

### Live facts pulled so far (read-only MCP, 2026-09-27)
- Last applied migration live = 20260927142000; all 20260928* versions are free and sort after it.
- posts policies: posts_select_authenticated = published AND removed_at null AND user_visible(user_id) AND (org_id null OR org_content_visible(org_id)) OR own. posts_update_own / posts_delete_own = auth.uid()=user_id. No DELETE clause on removed_at.
- post_comments_insert_own and post_reposts_insert_own WITH CHECK use `EXISTS (select 1 from posts p where p.id = ...)` under the caller's RLS -> a block clause added to posts SELECT flows into both insert checks automatically (A2 still needs the commenter<->author clause on post_comments SELECT).
- can_manage_event ALREADY grants current club owner/admin; the hole is its `e.creator_id = auth.uid()` branch, which also fires for club events. events_update_creator WITH CHECK already requires officer role for org events, so the demoted-admin edit path is really "set org_id = null in the same UPDATE" (org_id is UPDATE-granted). events_delete_creator is creator-only.
- events column grants (authenticated): title/description/location are INSERT only (no UPDATE); org_id/creator_id/starts_at/ends_at/created_at are UPDATE-granted.
- All 13 live events are club events; 12 of 13 start in the past; 3 sit on hidden (test) clubs; 0 on unverified clubs; 0 whose creator is no longer an officer.
- channel_members: hidden_at/pinned_at/muted_until/cleared_at/last_read_at/typing_until are SELECT+UPDATE granted; 2 club-chat rows, 0 stale -> A5's _cleanup.sql would delete 0 rows today.
- profile_views: only policy is profile_views_owner_select; authenticated holds S/I/U on all columns. 43 rows.
- users: profile_layout is NOT selectable by authenticated (server-only already); bio/skills/work_experience/current_on/location_text/last_active_at are SELECT-granted.
- All helpers exist, SECURITY DEFINER, EXECUTE granted to anon+authenticated: user_visible, is_blocked_either_way(viewer_id, other_id) (self-guarded: returns false unless one arg = auth.uid()), org_content_visible, org_member_role, can_manage_event, event_visible, rsvp_on_home_campus, is_channel_member, can_view_org_channel, is_org_member.
- 0 blocks, 0 mutes, 0 admins, 0 club posts, 5 orgs (1 visible).

### Coverage table (18 confirmed + 18 Low/Info)
Confirmed: #1 deferred on purpose (note in B1) OK. #2 B1 + A1(2b) OK. #3 A1. #4 A2. #5 A1. #6 A1. #7 A1. #8 B3. #9 B2 (posts) + B3 (avatar/banner). #10 B4 (+ B2 edit-path word filter). #11 A4 (+ club-rename variant -> A5 orgs Low). #12 A4. #13 A5. #14 A5. #15 A5. #16 A5. #17 A3. #18 A3. All 18 land somewhere.

Partial gaps inside confirmed findings:
- #5 "decide the broader #8 question (non-students reading student data at all)" is a product call; not in the plan. -> question for Franky.
- #9 "88 of 100 objects in the profiles bucket are already orphans": nobody cleans the existing orphans (B3's backfill script is EXIF-only). Either give B2 a local-only orphan-count + removal SCRIPT (count in header, Franky approves) or leave out with the reason "deferred with the cache decision (#1)".
- #11 "campus list filters org ids only on hidden_at, not verified" (events/route.ts:258-266): A4 owns the file but the plan row doesn't name it. Add it to A4's row.
- #18 names BOTH savers and "free viewers"; the viewers route `src/app/api/me/posts/[id]/viewers/route.ts` computes `total` after loadHiddenUsers (same oracle) but is NOT in A3's owned files, and A3's grep rule ("reads profile_views/post_views identities with the cookie client") would not catch it (it reads through the service-role helper). Add it to A3.

Low/Info that fell through (not assigned, no reason given):
- L4 chat reactions name every reactor (`message_reactions`). Product call -> leave out, question for Franky (recommend: leave as is; reactions are visible in most chat apps).
- L14 `user_visible()` answers "is this user restricted?" for any id. The report's fix (REVOKE EXECUTE from anon/authenticated) is WRONG twice: the plan forbids REVOKE EXECUTE (backend crash), and policies run their functions as the querying role, so every users/posts/comments policy would break. The same bit is already observable by selecting the users row under users_select_authenticated. -> leave out with that reason (or later move it to a non-exposed schema).
- Info: account deletion wipes quarantined evidence incl. child-safety images (`storage-purge.ts:260`). Lawyer question for James -> leave out of both waves, record as open legal item.
- Info: restore guard defeated by the author deleting the other removed post. Closed as a side effect of B2's "author can't hard-delete a moderator-removed post" IF B2 covers both the policy and the route. Say so in B2's row so the reviewer checks it.
- L2 (channel_members settings columns readable by other members) IS assigned to A5 but is not buildable as written: see section 2 (column revoke 500s the thread list and Otto). Recommend moving it out of wave A.

## 2. Collisions

### File ownership (wave A)
- F1 SHARED LIBS WITH OUTSIDE CALLERS. A5 owns `src/lib/orgs/**`, but it is imported by ~30 files outside A5, incl. A2's `posts/[id]/route.ts` + `posts/[id]/comments/route.ts` (following, hidden-org-access, join-state) and the accept-invite route `me/org-invites/[id]/route.ts` (admitMember). A1 owns `build-vibe-user-v1.ts` + `profile-layout.ts`, imported by unowned `me/profile-bootstrap`, `me/profile-sync`, `me/profile`. Owner stays A5 / A1; RULE: exports change additively only (new optional params, new functions); no signature/return-shape change. A1 also owns the existing `build-vibe-user-v1.test.ts` + `profile-layout.test.ts` (not listed; add them).
- F2 A3 MISSING FILES. `src/app/api/me/profile-views/route.ts` (the free tiles, reads `profile_views` incl. `viewer_user_id` with the cookie client, lines 115-121, 172-186), `src/lib/metrics/profile-viewers.ts` (:237 cookie read), and `src/app/api/me/posts/[id]/viewers/route.ts` (#18 oracle). None is claimed by another batch -> give all three to A3 by name. Without the first two, dropping the policy silently zeroes everyone's profile-view tiles and the Otto panel.
- F3 A5 posts DELETE vs A2 posts route. Plan handles it (A5 policy + orgs route; request to B2). Add: an officer-delete route under orgs/** must not reuse the author-only R2 cleanup; it should delete the row only and leave media to B2 (#9), or the officer's delete orphans another officer's files. Say it in A5's row.
- F4 channel_members readers. A5's Low "settings columns not readable by other members" would need changes in `me/threads/route.ts:434-438`, `me/otto/route.ts:407-409`, `lib/push/badge.ts:84-86` (own-row reads of hidden_at/pinned_at/muted_until via the cookie client). None is A5's. -> move this Low out of wave A (see section 4).
- No other two-batch file overlaps found: A1 {users/[handle]/*, resume, posts/[id]/page, profile/[handle]/page}, A2 {posts/[id]/route GET, posts/[id]/comments, users/by-id, me/threads/[id], me/threads/[id]/members}, A3 {metrics, me/profile-view*, me/posts/[id]/*}, A4 {api/events/**}, A5 {api/orgs/**, lib/orgs/**, channel-access, messages-upload-url, users/search} are disjoint. `users/search` already filters blocks in the route (lines 177-196), so A2 needs nothing there.
- channel-access.ts `ensureMember` is called by unowned `me/threads/[id]/messages/route.ts` and `.../messages/[messageId]/media/route.ts`: A5 keeps its signature and ChannelAccess union shape.

### Policy / object collisions (owner in brackets)
- P1 `posts` has four writers across waves: A2 posts_select_authenticated [A2]; A5 posts_update_own [A5] + officer delete [A5]; B2 posts_delete_own (removed-post Low) [B2]; B4 tags CHECK/trigger [B4]. Rule: A5 ADDS a new permissive policy (e.g. `posts_delete_club_officer`) instead of altering posts_delete_own, and writes `removed_at is null` into it from day one, so B2 only alters posts_delete_own. Every PRE-FLIGHT asserts only the text of the policy it alters, never "posts has N policies" (A5 adds one; B2 would otherwise abort).
- P2 `post_comments` / `post_reposts` [A2 only]. Their INSERT WITH CHECK already does `EXISTS (select 1 from posts p ...)` under the caller's RLS, so A2's posts SELECT block clause flows into both inserts; A2 proves it by behaviour and adds the explicit clause only if the probe shows a gap.
- P3 `users`: A1 column-grant revoke [A1] and A2 users_select_authenticated [A2]. Separate objects; neither pre-flight checks the other's.
- P4 "is caller a current owner/admin" is needed by A4 (can_manage_event, events policies) and A5 (org_members, posts). Use the existing `public.org_member_role(oid, uid)` in both; NO new shared helper (A4's version 130000 sorts before A5's 140000, so A4 could not depend on an A5 helper).
- P5 `channel_members_select_member` [A5]: the new "club visible" clause must go through a SECURITY DEFINER helper (e.g. wrap can_view_org_channel + "channel.org_id is null"). A plain subquery on `channels` recurses: channels_select_member does EXISTS on channel_members -> "infinite recursion detected in policy". DMs/groups (org_id null) must stay visible to members; can_view_org_channel returns false for them.
- P6 A5's AFTER DELETE trigger on org_members must be SECURITY DEFINER (like the live org_members_unfollow_on_leave): the self-leave route deletes with the cookie client and channel_members has no DELETE policy for accepted rows, so an invoker trigger silently deletes nothing. Consider also `org_channel_members` (private-channel roster) in the same trigger.
- P7 events + rsvps [A4 only]; rsvps_select_own_or_manager rides on can_manage_event, so the attendees route and the rsvps read change together. event_visible's `p_creator_id = auth.uid()` branch also keeps a demoted creator reading a hidden club's events; A4 decides whether to narrow it too.

### F5 (most important cross-batch break): the report route reads targets with the reporter's own client, on purpose, with NO block check
- `src/app/api/me/reports/route.ts:77-104,297` (`readTarget`) reads the reported post/comment/user/event/org through the COOKIE client so RLS decides "may this student see it", and its comment says it deliberately skips blocks: "a student who blocked a harasser ... could no longer report them. That is exactly backwards".
- A2 puts blocks INTO posts / post_comments (/ maybe users) SELECT. After that, a student who blocked a harasser (or was blocked by them) reads nothing -> the report is refused as not_found. That defeats the very case #4 is about (the victim must be able to report).
- A1's optional revoke of SELECT on users.bio breaks the same route harder: the user-target snapshot selects `id,handle,name,bio,tagline` (line 119 in the spec map) with the cookie client -> permission denied -> "error" on every user report.
- Nobody owns this file. OWNER: give `src/app/api/me/reports/route.ts` to A2 in wave A. Fix shape: keep the cookie read; when it returns nothing, and the pair is blocked either way (loadPairBlock), re-read with the service role and re-apply the route's own non-block checks (deleted / draft / hidden club / chat membership). A1 files a request to A2: drop `bio` from the user snapshot or read it with the service role, if A1 does the revoke.
- Cross-batch review must add a probe: blake blocks casey, then blake reports casey's post, comment and profile -> 200 created.

## 3. Migration order vs the deploy

The plan's gate says "Franky's yes -> apply in order -> push -> live check". That is the wrong way round for the subtractive migrations. Per batch:
- A5 20260928140000 — ADDITIVE part (removals table, org_members AFTER DELETE trigger, SD roster helper) is READ by A5's new code (join-state / admitMember) -> must be live BEFORE the deploy. Its tightenings are all tolerated by today's code (officer writes to org_members/orgs already use the service role: members/[userId] :98, orgs/[slug] :632; self-leave keeps its branch; PATCH post already checks loadOrgRole). -> APPLY BEFORE PUSH. 20260928140500 cleanup: live count is 0 stale rows -> no-op; apply right after 140000 or skip.
- A2 20260928110000 — tightening only; new routes don't need it. Old code under it: reads just return fewer rows; a blocked-pair comment insert would 403->500 in the old comments route, but live blocks = 0. -> APPLY AFTER PUSH (and only once F5's report-route fix is live).
- A4 20260928130000 — if the officer edit/delete route uses the service role (it must for edits: see section 4), no code depends on it. New CHECKs could refuse rows the old route accepts. -> APPLY AFTER PUSH.
- A3 20260928120000 — drops profile_views_owner_select. Old `/api/me/profile-views` + `/api/me/profile-viewers` read with the cookie client and would silently return zeros. -> APPLY AFTER PUSH, after the served code is confirmed to be the new build. Do NOT add a count RPC that the new code calls (that would force a split pre/post migration); count with the service role in the route.
- A1 20260928100000 (optional revoke) — only after every cookie reader of bio/skills/work_experience/current_on is gone, incl. F5's report snapshot. -> APPLY LAST, AFTER PUSH.

Safe sequence: gate + review -> Franky's yes -> apply A5 140000 (+140500) -> push, wait for Vercel READY, verify served JS is the new build (S65 stale-cache lesson) -> apply A2 110000 -> A4 130000 -> A3 120000 -> A1 100000 -> live check per batch.
Versions then no longer match apply order. Recommend renumbering the post-deploy ones above A5 (e.g. A2 ...150000, A4 ...151000, A3 ...152000, A1 ...153000) and moving wave B to 20260929xxxxxx, so schema_migrations reads in apply order. Each migration header must state "apply BEFORE/AFTER the deploy" (house format already asks for it).
Cross-migration dependencies inside wave A: none, provided P4 holds (no new shared helper) and P1 holds (pre-flights assert only their own policy text). Every wave-A migration can be reverted independently.

## 4. Where the plan (or the report it copies) is wrong about the live DB
- W1 A3 "narrow profile_views_owner_select" / report "revoke SELECT on viewer_user_id/referrer": authenticated holds TABLE-level SELECT/INSERT/UPDATE/DELETE on profile_views, so a column revoke changes nothing. Only dropping the policy (RLS then refuses every row) works. Also revoke the table-level I/U/D while there (no policy uses them; writes are service-role).
- W2 A5 Low "channel_members settings columns not readable by other members": authenticated holds TABLE-level SELECT on channel_members, so a column revoke is a no-op, and a table revoke + column re-grant 500s /api/me/threads (:434-438), /api/me/otto (:407-409) and the push badge (:84-86), which read their OWN hidden_at/pinned_at/muted_until with the cookie client. RLS can't hide columns per row. -> Leave out of wave A (reason: needs a table split or those readers moved to the service role; low impact: co-members only).
- W3 A4 "#12 ... follows CURRENT owner/admin role (can_manage_event)": can_manage_event already grants current officers; the fix is to drop its `creator_id = auth.uid()` branch for club events (keep it only when org_id is null). events_update_creator's WITH CHECK already demands officer role for club events; the live escape is setting org_id = null in the same UPDATE -> the org_id column revoke is the key line.
- W4 A4 "current officers can edit ... any of the club's events": authenticated has NO UPDATE grant on events.title/description/location, so a cookie-client edit route would get "permission denied" -> 500. The edit route must write with the service role after its checks (don't add the grants back; that reopens the word-filter bypass).
- W5 A4 "no past start": 12 of the 13 live events already start in the past. A table CHECK (starts_at >= now()) fails to add (or, NOT VALID, blocks every later edit of a past event). Put the guard in events_insert WITH CHECK or a BEFORE INSERT trigger only. Length CHECKs: PRE-FLIGHT must count existing rows over each cap, and the caps must be >= the route's caps.
- W6 A4 rsvps "FOLLOW-UP in 20260927100000_rsvp_home_campus_rls.sql": that file is APPLIED live (schema_migrations has 20260927100000). The fix goes in A4's new file; never edit the applied one. Live: 0 RSVPs by non-members on hidden-club events, so no cleanup needed.
- W7 A5 #14 cleanup: live stale club-chat rows = 0 (2 club-chat rows total). The _cleanup.sql is a no-op today; keep it as a guarded no-op or drop it.
- W8 A5 #16 on org_members_delete: the USING has a self-leave branch (user_id = auth.uid()) that the leave route uses with the COOKIE client (join/route.ts:267-271). The owner-only-over-admins clause must sit inside the officer branch only, or an admin can no longer leave: RLS filters the DELETE silently, the route reports success, membership stays.
- W9 Rule "never REVOKE EXECUTE / grant EXECUTE to anon+authenticated": trigger functions are exempt in practice. Live org_members_imply_follow, org_members_unfollow_on_leave and posts_stamp_edited have NO authenticated EXECUTE and fire fine. Follow that precedent for A5's new trigger function (SECURITY DEFINER, pinned search_path).
- W10 Report Low "user_visible(): revoke EXECUTE from anon/authenticated (policies still call it)" is wrong: policies run their functions as the querying role, so that revoke breaks users/posts/comments reads for everyone (and the plan forbids it). See section 1.
- W11 Local test DB: supabase_migrations.schema_migrations locally stops at 20260926100000, but the Sept 27 objects ARE present locally and the policy text on the 11 wave-A tables hashes identical to live (md5 91e2db47...). PRE-FLIGHTs must check catalog state, never schema_migrations rows, or they abort locally.
- Confirmed correct: last live version 20260927142000; 20260928* free; users grants are column-level (A1 revoke is technically possible); orgs and events UPDATE grants are column-level (A4/A5 column revokes work); every orgs write goes through the service role; profile_layout is already server-only; 1 account hides a résumé it holds; 6/20 unverified; 0 blocks/mutes/admins/club posts/active restrictions; seed ids (blake_iu, casey_purdue, drew_new unverified, avery_owner) exist locally.

## 5. Questions for Franky (each with a recommendation)
- Non-student (unverified) accounts reading student data at all (#5's "broader #8 question"): recommend gating only résumés in this wave (A1) and putting the broader rule on the pre-launch list.
- "Who reacted" in chats (Low): recommend leaving reactor names visible to chat members (normal in chat apps); record it as decided.
- The 88 orphaned photos in the public bucket (#9): recommend a local-only count script now (B2), deletion with the photo-cache decision.
- Account deletion wipes quarantined evidence (Info): recommend keeping quarantined objects out of the self-delete purge until the lawyer (via James) confirms the preservation duty.

## Verdict
go-with-changes. Blocking changes before wave A starts: F5 (report route owner = A2), F2 (A3 owns profile-views route, profile-viewers lib, post viewers route), W2 (pull the channel_members column Low), P1/P5/P6 rules into A2/A5 rows, W3-W6 into A4's row, and the split apply order (A5 before push, the rest after).
