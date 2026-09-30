# Critique result: A5 club membership + chat roster (go-with-changes)

## Recommended approach

Critique file: /Users/franciscocazares/vibe/handoffs/wave-plan-sec2/critique-A5.md

MIGRATION 20260928140000_club_membership_chat_roster.sql. Apply it BEFORE the code deploy, because the new code reads and writes org_removals. The PRE-FLIGHT must assert the exact live texts listed in liveFacts. It should read the catalog only, not schema_migrations: the local DB has no 20260927* rows, although those functions exist there.

1. #13 edits. ALTER POLICY posts_update_own: restate both expressions word for word, then append `AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])))` to USING and to WITH CHECK. This is the same rule the PATCH route already enforces (posts/[id]/route.ts:554-572, EDIT_AS_ORG_ROLES, then a cookie update with .single() at :628), so the route cannot 500. Check only this policy in the PRE-FLIGHT, because A2 (110000) alters posts_select_authenticated on the same table.

2. #13 officer delete. Do NOT add a posts DELETE policy. Such a policy would open a data-API hard-delete that purges no media, and it would collide with B2's removed_at change to posts_delete_own. Hand it to B2 as a request instead. The post DELETE route should let a CURRENT owner/admin of post.org_id delete through the service role, refuse posts a moderator removed, and purge the media. Club-post media lives under `orgs/<orgId>/` (orgs/[slug]/posts/route.ts:153), not in the author's clips folder. There are 0 club posts live today.

3. #14 roster rule. Add a new SECURITY DEFINER helper public.can_read_channel_roster(cid uuid): stable, search_path '', every name schema-qualified, EXECUTE granted to anon, authenticated and service_role. It returns true when the channel exists AND (org_id IS NULL OR public.can_view_org_channel(cid, (select auth.uid()))). Then ALTER POLICY channel_members_select_member USING (is_channel_member(channel_id) AND public.can_read_channel_roster(channel_id)).
   - Use can_view_org_channel, not org_content_visible. org_content_visible returns TRUE for an ex-member of any club that isn't hidden, so it would not close #14. can_view_org_channel is already what messages_select_org_member, messages_insert_org_member, channels_select_org_member and message_reactions use.
   - Do NOT test for an org channel with a subquery on `channels` inside the policy. channels RLS hides an org channel from an ex-member, so `NOT EXISTS(org channel)` would come out true and let them in.

4. #14 leave/removal trigger. Add an AFTER DELETE FOR EACH ROW trigger on org_members, named for example org_members_drop_chat_on_leave. Its function is SECURITY DEFINER with search_path ''. It deletes public.channel_members rows and public.org_channel_members rows where user_id = old.user_id and channel_id is in (select id from public.channels where org_id = old.org_id).
   - SECURITY DEFINER is mandatory. The leave route deletes with the cookie client (join/route.ts:268), and authenticated may only delete its own PENDING channel_members rows. An invoker trigger would silently delete 0 rows.
   - Include org_channel_members, so a rejoin doesn't quietly restore private-channel access.
   - No GRANT/REVOKE on the trigger function.

5. #16 officer powers.
   - `revoke update (role) on public.org_members from authenticated`. The only writer is members/[userId]/route.ts:100, which uses the service role.
   - ALTER POLICY org_members_delete: restate it and add `AND ((role <> 'admin'::text) OR (org_member_role(org_id, auth.uid()) = 'owner'::text))` inside the officer branch. The self-leave branch stays as it is.

6. orgs Low. Revoke UPDATE (backdrop_preset, banner_url, description, links, logo_url, name, philanthropy, tags, updated_at) on public.orgs from authenticated. The only writer is orgs/[slug]/route.ts:634, which uses the service role and already runs requireCanPublish plus the word filter.

7. #15 removal records. Create public.org_removals(org_id → orgs ON DELETE CASCADE, user_id → users ON DELETE CASCADE, removed_by → users ON DELETE SET NULL, removed_at timestamptz default now(), PRIMARY KEY(org_id, user_id)). Enable RLS, add no policies, and `revoke all ... from anon, authenticated`. The prod default ACL grants ALL on every new public table to anon and authenticated, so the revoke is required.

8. POST-CHECK:
   - has_column_privilege is false for every revoked column.
   - Policy texts match.
   - The trigger exists.
   - Behaviour probes, run under `set local role authenticated` with claims:
     - An admin deleting another admin's row affects 0 rows.
     - A leave removes that user's org chat rows.
     - A stale row is invisible to its ex-member.
     - A demoted author's club-post update affects 0 rows.
     - An orgs name update fails with 42501.
   - Then notify pgrst.

CLEANUP 20260928140500_org_chat_members_cleanup.sql. It deletes channel_members and org_channel_members rows on org channels whose user has no org_members row. COUNT for the header: 0 and 0 today. Apply it right AFTER the main file, so the trigger is already stopping new stale rows when the sweep runs.

CODE (all A5-owned unless noted):

a. src/lib/messages/channel-access.ts ensureMember: if the `channels` read returns null, return 403 BEFORE the DM path. Today an ex-member's org channel is hidden by RLS, so the code falls into the DM branch, reads the stale channel_members row, and returns ok:true.

b. me/messages-upload-url/route.ts:82 and users/search/route.ts:70: replace the channel_members viewer check with ensureMember. Search keeps its roster read, which now returns [] for anyone who isn't allowed.

c. Blocks helper. Move the private isBlockedWithOrg from invites/route.ts:648 into a new src/lib/orgs/org-blocks.ts with a test, keeping it fail-closed. The org side = the owner plus every owner/admin/mod (OFFICER_ROLES). Call it:
   - in join POST, before admitMember AND before filing a request;
   - in requests/[id] approve, since a block can come after the request;
   - in invites, widened from [inviter, owner].

d. requests/route.ts: filter out requesters in loadHiddenUsers(cookie, officerId).blocked (blocks only, not mutes).

e. Wiring the removal record:
   - members/[userId] DELETE upserts org_removals BEFORE deleting the membership, and gains a restriction check on both PATCH and DELETE. The policy's NOT is_restricted_now() is bypassed by the service role today.
   - admitMember (membership.ts) deletes the org_removals row.
   - loadViewerOrgContext returns `removed` and `blockedWithOfficers`.
   - orgJoinState takes both as OPTIONAL inputs: a removed viewer on an open club gets can_request (per the plan), and blocked gets a neutral refusal state. Add join-copy strings and extend join-state.test.ts.

f. orgs/[slug]/posts/route.ts: replace requireTermsAccepted with requireCanPublish (@/lib/moderation/access), and run checkText(content) → contentBlockedResponse (@/lib/moderation/text-filter).

g. 404 Low: add one helper in src/lib/orgs that answers 404 for a hidden club to a non-member and 403 otherwise, then apply it across the roughly 12 officer routes (members/[userId] requireStaff, requests, requests/[id], invites/[id], invite-candidates, upload-url, channels/*, followers/[userId]). Do it LAST, since it is the most mechanical part and the easiest to split out.

LOCAL TESTS. Local data is 5 orgs, 5 members (4 owners, 1 admin), 8 org channels, 2 org-chat rows and 1 club post. Seed the missing roles (a second admin, a mod, a stale row) as postgres inside the rolled-back transaction. Also prove that deleting a user (cascade) and deleting an org both run cleanly with the new trigger.

## Ownership changes

- ADD to A5: src/app/orgs/[handle]/page.tsx, only its orgJoinState call at ~line 165, so the button shows the removed or blocked state. No other batch owns this file. Without it the button offers 'Join', and the route answers with a pending request or a refusal.
- ADD to A5 (new files): src/lib/orgs/org-blocks.ts + org-blocks.test.ts, plus the 404-gate helper in src/lib/orgs. Both are inside A5's src/lib/orgs/** glob, so this is just confirming them.
- REMOVE from A5: the Low about the channel_members settings columns (muted/hidden/cleared/pinned). A column revoke breaks the caller's own-row cookie reads at me/threads/route.ts:435, me/otto/route.ts:408 and me/threads/[id]/pin/route.ts:32, and A5 owns none of those files. Park it as its own later batch: move those reads to a SECURITY DEFINER 'my channel settings' read, then revoke table SELECT and grant a column list.
- MOVE to B2 as a written request: officers delete club posts (route + purge in src/app/api/posts/[id]/route.ts DELETE, service role, current owner/admin, refuse moderator-removed). Also tell B2 that club-post media lives under orgs/<orgId>/, so today's author purge (ownClipKeysToDelete(refs, user.id)) never deletes it. That is a #9 variant.
- B2 request (product-dependent): decide whether a demoted or removed ex-officer may still hard-delete a club post they wrote. Tighten posts_delete_own and the DELETE route TOGETHER, because a refused RLS DELETE returns 0 rows with no error, and the route at :364 would then purge the R2 files of a post that still exists.
- SHARED, NO SIGNATURE CHANGES: src/lib/orgs/hidden-org-access.ts and src/lib/orgs/following.ts (loadOrgRole) are imported by the A2-owned posts/[id]/route.ts and posts/[id]/comments/route.ts. A5 may add exports but must not change existing ones. The same applies to orgJoinState/loadViewerOrgContext: new inputs must be optional, because src/app/orgs/[handle]/page.tsx, src/components/mobile/CampusMobile.tsx and src/app/api/me/org-invites/[id]/route.ts use them and are not A5's.
- Optional request (owner: none in wave A): src/app/api/me/org-invites/[id]/route.ts accept should re-run the officer block check. The invite route checks only at send time.
- No conflict with A2 on users/search/route.ts: it already filters blocks either way (lines 177-197), so A2 has no reason to touch it. It stays A5-only.
- Batch size: A5 is roughly twice any other wave-A batch (about 20 files and 2 migrations). If the builder runs long, split off the 404 sweep plus the club-posts route gates as A5b.

## Breakage risks

- Leave silently keeps the chat rows if the trigger function is SECURITY INVOKER. The leave route deletes org_members with the cookie client, authenticated can only delete its own PENDING channel_members rows, and an RLS-refused DELETE is 0 rows with no error. Fix: make the function SECURITY DEFINER, and add a local probe that leaves as a member and checks the rows are gone.
- The roster rule stays open if the org-channel test is written as a subquery on channels inside the policy. channels RLS hides the channel from an ex-member, so NOT EXISTS comes out true. Fix: use the SECURITY DEFINER can_read_channel_roster helper.
- #14 stays open for any club that isn't hidden if the builder uses org_content_visible as the plan's wording suggests. It is TRUE for ex-members of visible clubs. Fix: use can_view_org_channel, which requires org membership and handles private channels the way the message rules do.
- Tightening posts_delete_own in A5 would break the post DELETE route. It deletes with the cookie client, never checks the row count, then purges R2, so a refused delete reports ok, purges the video and leaves a broken post. Fix: no DELETE-policy changes in A5; B2 changes the route and the policy together.
- Adding a posts DELETE policy for officers would open a data-API hard-delete that skips the media purge (orphaned orgs/<orgId>/ objects) and the moderator-removed rule. B2 would also have to restate it. Fix: route only, in B2.
- Org chat breaks for current members if the new rule is keyed off anything other than membership. The threads list (me/threads/route.ts:463), the messages GET roster (me/threads/[id]/messages/route.ts:290) and search all read org-channel rosters with the cookie client. can_view_org_channel is TRUE for current members of public channels. Probe as a current member and as a DM participant to confirm nothing changes.
- Any caller will 500 if the orgJoinState/loadViewerOrgContext input types gain required fields. tsc will fail in page.tsx, CampusMobile.tsx and org-invites/[id]/route.ts, none of which A5 owns. Fix: make the new fields optional and default them to false.
- A removal can be recorded but the user left a member, or removed but not recorded (a one-tap-rejoin gap), if the members DELETE route deletes first. Fix: upsert org_removals first, then delete the membership. Member state beats removal, and the next removal simply re-upserts.
- The members DELETE and join routes 500 against a DB that doesn't have org_removals yet if code deploys before the migration. Fix: migration first. To roll back: code first, then the migration.
- The new table is readable and writable over the data API if the builder only enables RLS. The prod default ACL grants ALL on new public tables to anon and authenticated. Fix: add an explicit `revoke all on public.org_removals from anon, authenticated`, and POST-CHECK it with has_table_privilege.
- No route breaks when UPDATE(role) on org_members is revoked. The only writer is the service-role members route, and the static pages make no PostgREST calls (grep of public/html found none). Any future cookie-client role write would get a 42501, so note that in the header.
- No route breaks from the orgs column revokes. All orgs writes (orgs/[slug]/route.ts:634, admin verify/hide) use the service role, and the browser-client files (ProfileHandleSwitch, suspended-actions) touch only `users`.
- Mention search: for an org channel where the caller can view the channel but has no channel_members row, the search returns an empty list after the switch to ensureMember instead of 200 with nothing. That is harmless, and no 500 path exists.
- Account deletion and org deletion both cascade through org_members into the new trigger. Probe both locally inside a rolled-back transaction. The deletes are separate queries, so no 'already modified' error is expected, but prove it.

## Live facts

- posts_update_own (prod = local). USING `(auth.uid() = user_id)`. WITH CHECK `((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now())`. posts_delete_own USING `(auth.uid() = user_id)`.
- org_members_update. USING `((org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])) AND (role <> 'owner'::text) AND (NOT is_restricted_now()))`. WITH CHECK `((role = ANY (ARRAY['member'::text, 'mod'::text, 'admin'::text])) AND ((role <> 'admin'::text) OR (org_member_role(org_id, auth.uid()) = 'owner'::text)))`.
- org_members_delete USING `((role <> 'owner'::text) AND ((user_id = auth.uid()) OR ((org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])) AND (NOT is_restricted_now()))))`. org_members_select: member OR (is_public AND open AND not hidden).
- channel_members policies: select_member USING `is_channel_member(channel_id)`; update_own `(auth.uid() = user_id)` both ways; delete_own_pending `((auth.uid() = user_id) AND (accepted_at IS NULL))`. There is no INSERT policy.
- Grants for authenticated. channel_members: TABLE-level SELECT and DELETE, plus column UPDATE on accepted_at, cleared_at, hidden_at, last_read_at, muted_until, pinned_at, typing_until. org_members: table SELECT and DELETE, plus column UPDATE(role) only. orgs: table SELECT and DELETE, plus column UPDATE on backdrop_preset, banner_url, description, links, logo_url, name, philanthropy, tags, updated_at, with no INSERT. org_join_requests: SELECT only. posts: column INSERT on content, media_thumbnail_url, media_url, status, tags, type, user_id, and column UPDATE on content, status, tags (no org_id).
- Default ACL in public (owner postgres and supabase_admin): new tables get arwdDxtm for anon and authenticated, and new functions get EXECUTE for anon and authenticated. So a new table needs an explicit REVOKE.
- Helpers. org_member_role(oid, uid) returns NULL for authenticated when uid <> auth.uid(), so a policy can only ask about the caller's own role. can_view_org_channel(cid, uid) is SECURITY DEFINER with search_path=public. It returns false for anon, for another uid, for org_id null, and for non-members; true for a public channel; for a private channel it requires owner/admin or an org_channel_members row. org_content_visible(p_org_id) is TRUE for a non-hidden club regardless of membership.
- Triggers on org_members: org_members_imply_follow (AFTER INSERT) and org_members_unfollow_on_leave (AFTER DELETE, SECURITY DEFINER, search_path=public, deletes org_followers where source='join'). Neither touches channel_members. Precedent: 20260916120000 revoked EXECUTE on both trigger functions from public, anon and authenticated, and leaves still work.
- Other chat rules: messages_select_org_member, messages_insert_org_member, channels_select_org_member and message_reactions (org branch) all use can_view_org_channel. The DM rules require c.org_id IS NULL, which is why message text was already protected.
- Constraints: org_join_requests status CHECK allows ('pending','approved','denied'), with a unique pending index on (org_id, user_id). org_members has UNIQUE(org_id, user_id) and role CHECK ('owner','admin','mod','member'). channel_members has UNIQUE(channel_id, user_id), and its role CHECK allows ('admin','member').
- Counts (prod, 2026-09-27): org-channel channel_members rows 2, stale 0; org_channel_members rows 0, stale 0; org channels 12; club posts 0; org_members 7 (0 admins, 0 mods); org_join_requests 0; orgs 5, of which 1 is visible. Cleanup header COUNT = 0.
- Local DB: these policies match prod exactly. schema_migrations max is 20260926100000, yet the 20260927 functions (posts_check_media_refs etc.) are present, so the pre-flight must read the catalog. Local fixtures: 5 orgs, 5 org_members (4 owners, 1 admin), 8 org channels, 2 org-chat rows, 1 club post. Seed users: blake_iu 6979e030-690b-4092-bb91-fd6f00a6a988, casey_purdue be3e2af2-f457-4414-8f22-8746bdf9bf59, drew_new 8dc49662-65fd-437f-9692-20741e00a298, avery_owner c3b9dbb5-df1f-4674-9a9b-134a487ae1a2.

## Questions for Franky (ruled in waveA-build.md)

- A member removed from an open club: should they have to send a request to come back (the plan), or wait for an invite (the audit's suggestion)? Recommend a request: an officer who wants them fully out can block them, and the block then refuses both joining and requesting.
- When a student blocked by (or blocking) an officer taps Join or Request, what do they see? Recommend a neutral 'You can't join this club right now.' that never mentions the block. Don't pretend the club doesn't exist, since they can see its page.
- Leaving or being removed from a club: should it also drop access to the club's private chat channels, so rejoining doesn't quietly restore it? Recommend yes. There are 0 such rows today, so it costs nothing.
- Should a removed or demoted ex-officer still be able to delete club posts they wrote while an officer? Recommend no, because club posts belong to the club. Have B2 do it along with the officer-delete route, because the delete route and the rule have to change together.

