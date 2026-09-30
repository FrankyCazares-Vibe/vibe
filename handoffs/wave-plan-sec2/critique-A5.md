# Critique: A5 club membership + chat roster

Reviewer notes, appended as I go (read-only review, 2026-09-27).

## Scope read
- plan.md row A5; findings #13, #14, #15, #16 + Lows (orgs column writes, 403 vs 404, orgs/[slug]/posts route, channel_members settings columns).

## Live state pulled (prod, read-only MCP)
- posts_update_own: USING `(auth.uid() = user_id)`; CHECK `((auth.uid() = user_id) AND has_recorded_consent() AND can_publish_now())`. posts_delete_own: USING `(auth.uid() = user_id)`.
- org_members_update USING `((org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner','admin'])) AND (role <> 'owner') AND (NOT is_restricted_now()))` CHECK `((role = ANY (ARRAY['member','mod','admin'])) AND ((role <> 'admin') OR (org_member_role(org_id, auth.uid()) = 'owner')))`.
- org_members_delete USING `((role <> 'owner') AND ((user_id = auth.uid()) OR ((org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner','admin'])) AND (NOT is_restricted_now()))))`.
- channel_members_select_member USING `is_channel_member(channel_id)`; authenticated has TABLE-level SELECT on channel_members (so hiding settings columns = revoke table SELECT + column-list grant), column UPDATE on accepted_at,cleared_at,hidden_at,last_read_at,muted_until,pinned_at,typing_until; DELETE via channel_members_delete_own_pending only.
- orgs: authenticated column UPDATE on backdrop_preset,banner_url,description,links,logo_url,name,philanthropy,tags,updated_at; orgs_update policy owner/admin.
- org_members triggers: org_members_imply_follow (AFTER INSERT), org_members_unfollow_on_leave (AFTER DELETE, SECDEF, search_path=public). No channel_members cleanup.
- org_member_role(oid,uid) returns NULL for authenticated when uid <> auth.uid() (so a policy can only ask about the CALLER's role).
- Other chat policies use `can_view_org_channel(cid, uid)` (SECDEF; false unless is_org_member; private channels need owner/admin or org_channel_members). messages_select_org_member / messages_insert_org_member / message_reactions use it. channels_select_org_member uses it too.
- Counts (prod today): org-channel channel_members rows 2, STALE 0; org_channel_members rows 0 (stale 0); org channels 12; club posts 0; org_members 7 (0 admins, 0 mods); org_join_requests 0; orgs 5, visible 1.

## Callers checked
- org_members writes: members/[userId] PATCH/DELETE use SERVICE role (policy change can't 500 them). Route has NO is_restricted check and 403s (not 404) a hidden club.
- orgs UPDATE: only `orgs/[slug]/route.ts:634` (service) + admin verify/hide (service). No cookie-client or static-page orgs write -> REVOKE of the orgs column UPDATE grants is safe.
- public/html/*: no direct PostgREST calls to posts/org_members/channel_members/orgs.
- posts PATCH (`posts/[id]/route.ts:554-634`, A2/B2-owned) already checks owner/admin via loadOrgRole then updates with the cookie client + `.single()` -> matches the new posts_update_own clause, no 500.
- posts DELETE (`posts/[id]/route.ts:364`) deletes with the cookie client and does NOT check rows affected, then purges R2. If posts_delete_own were tightened, a refused delete = 0 rows, no error, R2 video purged, row stays. DO NOT tighten posts_delete_own in A5.
- Leave (`join/route.ts:268`) deletes org_members with the COOKIE client -> the new AFTER DELETE trigger must be SECURITY DEFINER; authenticated can only delete its own PENDING channel_members rows, so an invoker trigger would delete 0 rows silently (RLS DELETE = no error).
- Join/request/admit (`join/route.ts`, `membership.ts admitMember`) all write with the SERVICE role -> #15 can only be enforced in TS, not by policy. `isBlockedWithOrg` is a private function at `invites/route.ts:648` and checks [inviter, owner] only, not "all officers" (plan's "same check as invite route" != finding's "owner + all officers").
- org_members UPDATE: the ONLY writer is `members/[userId]/route.ts:100` (service). No cookie-client caller -> `revoke update (role) on org_members from authenticated` is safe.
- channel_members settings columns: own-row cookie reads at `me/threads/route.ts:435` (hidden_at,pinned_at,muted_until), `me/otto/route.ts:408` (hidden_at), `me/threads/[id]/pin/route.ts:32` (pinned_at), `channel-access.ts` (cleared_at). A column revoke breaks all of them (none but channel-access are A5's). -> DEFER that Low.
- ensureMember bug: for an ex-member, `channels` RLS hides the org channel -> `channel` null -> falls into the DM path -> stale channel_members row -> ok:true isOrgChannel:false. Fix: channel null => 403 before the DM path.
- orgs/[slug]/route.ts PATCH already runs requireCanPublish + checkChangedText (service write) -> orgs Low is just the grant revoke. Club posts route lacks requireCanPublish + checkText (helpers: `@/lib/moderation/access`, `@/lib/moderation/text-filter`).
- `src/lib/orgs/hidden-org-access.ts` and `following.ts loadOrgRole` are imported by A2-owned post routes: A5 must not change their exports.

## Decisions / recommendations
1. #13 edit: ALTER posts_update_own, add `AND ((org_id IS NULL) OR (org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])))` to BOTH USING and WITH CHECK (restated word for word). Matches the PATCH route's EDIT_AS_ORG_ROLES, so no 500.
2. #13 officer delete: NO new DELETE policy on posts. A policy widens a data-API door that hard-deletes without purging the author's R2/storage media and collides with B2's `removed_at` change to posts_delete_own. Hand it to B2 as a request: post DELETE route lets a CURRENT owner/admin of post.org_id delete via the service role, refuses moderator-removed posts, purges with `ownClipKeysToDelete(refs, row.user_id)` + B2's photo purge. 0 club posts live, so nothing is lost by waiting.
3. #14 policy: new SECDEF helper `public.can_read_channel_roster(cid uuid)` (search_path '', stable, schema-qualified, grant execute anon/authenticated/service_role): channel exists AND (org_id is null OR public.can_view_org_channel(cid, (select auth.uid()))). Policy = `is_channel_member(channel_id) AND can_read_channel_roster(channel_id)`. Do NOT write the org test as a subquery on `channels` inside the policy: channels RLS hides the org channel from an ex-member, so `NOT EXISTS (org channel)` would come out TRUE and let them in. Use can_view_org_channel (not org_content_visible): org_content_visible is TRUE for an ex-member of any non-hidden club, so it would not close #14.
4. #14 trigger: AFTER DELETE on org_members, SECURITY DEFINER, search_path '', deletes channel_members AND org_channel_members rows for (old.user_id, channels of old.org_id). Recommend including org_channel_members so a rejoin doesn't silently restore private-channel access (0 rows today). No GRANT/REVOKE needed (trigger fns can't be called directly); don't REVOKE per plan rule.
5. #16: `revoke update (role) on public.org_members from authenticated` (sole writer is the service-role route) + restate org_members_delete with `AND ((role <> 'admin'::text) OR (org_member_role(org_id, auth.uid()) = 'owner'::text))` inside the officer branch. Leave (self) branch untouched. Add a restriction check to members/[userId] PATCH/DELETE (the policy's NOT is_restricted_now() is bypassed by the service role today).
6. orgs Low: revoke the 9 column UPDATE grants on orgs from authenticated (no cookie writer exists). orgs_update policy can stay.
7. #15: move `isBlockedWithOrg` out of invites/route.ts into `src/lib/orgs/org-blocks.ts` (+ test), org side = owner + every owner/admin/mod (OFFICER_ROLES), fails closed. Use it in join POST (before admit AND before filing a request), requests/[id] approve (block may postdate the request), and invites (widen from [inviter, owner]). Requests list: drop requesters in `loadHiddenUsers(cookie, officer).blocked` (not mutes).
8. Removal records: new table `public.org_removals (org_id, user_id, removed_by, removed_at, pk(org_id,user_id))`, RLS on, no policies, and `revoke all ... from anon, authenticated` (prod default ACL grants ALL on new public tables to anon+authenticated). members/[userId] DELETE upserts the record BEFORE deleting the membership (a failure in between never leaves a one-tap-rejoin gap). admitMember clears it. loadViewerOrgContext returns `removed` + `blockedWithOfficers`; orgJoinState takes them as OPTIONAL inputs (page.tsx, CampusMobile, org-invites callers keep compiling).
9. ensureMember: `channel` null -> 403 before the DM path. messages-upload-url + users/search call ensureMember (search keeps its roster read; it just returns [] if the caller has no row).
10. Club posts route: swap requireTermsAccepted for requireCanPublish; checkText(content) + contentBlockedResponse. No tags are inserted there, so B4's tags CHECK can't 500 it.
11. 404 Low: one helper in src/lib/orgs that answers 404 for a hidden club to a non-member (403 otherwise) and use it in the ~12 officer routes. Largest mechanical chunk: do it LAST or split it out.

## Deploy order
Main migration BEFORE the code (the code reads/writes org_removals; every other change is safe under today's code: role/org writes are service-role, PATCH already checks the role, the roster rule only narrows ex-member reads). Cleanup right AFTER the main file (trigger first, so nothing goes stale after the sweep). Rollback: code first, then migration.

## Ownership
- Add: `src/app/orgs/[handle]/page.tsx` (only its orgJoinState call, to pass removed/blockedWithOfficers) - no other batch owns it.
- Remove from A5: the channel_members settings-columns Low (needs me/threads/route.ts, me/otto/route.ts, me/threads/[id]/pin/route.ts). Officer club-post delete -> B2 request (route + purge; note club post media lives in `orgs/<orgId>/`, not the author's folder, so ownClipKeysToDelete(…, user) never purges it today).
- Shared: A5 owns src/lib/orgs/hidden-org-access.ts + following.ts (loadOrgRole) which A2's post routes import: no export changes.
- Verdict: go-with-changes.
