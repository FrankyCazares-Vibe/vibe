# A5a club membership: builder notes (S67 sec wave 2)

Started 2026-09-27. Owns: src/lib/orgs/**, api/orgs/[slug]/{join,requests,members,invites,followers}/**, other officer-only
orgs/[slug] routes except channels/**, posts/**, route.ts; api/me/org-invites/**; orgs/[handle]/page.tsx (orgJoinState call only).
Migrations: 20260928100000_club_membership_rules.sql (before deploy) + 20260928100500_club_channel_members_cleanup.sql.

## Progress
- read plan.md, waveA-build.md, approach-A5.md, critique-A5.md
- read findings #13-#16 + Lows, approach-product/cross A5 lines, lib/orgs (membership, join-state, hidden-org-access), join, invites, members/[userId]
- DECISION: no new JoinState value (campus-home.tsx, CampusMobile.tsx, social-steps.ts own JoinState unions/sets; not mine). Blocked/removed
  map onto existing states via OPTIONAL inputs; removed on open-at-home -> can_request; blocked-by-officer -> the route refuses before
  orgJoinState, display maps to an existing no-button state (see below).
- DECISION: org_removals cleared by an AFTER INSERT trigger on org_members (atomic, can't be forgotten) instead of best-effort in admitMember.
- DECISION: org blocks are one-directional for join/request/accept (officer blocked student => refuse); invites keep today's either-way
  check with inviter+owner and add "any officer blocked the invitee".

## LIVE STATE (prod, read-only MCP, 2026-09-27)
- org_members_update USING ((org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])) AND (role <> 'owner'::text) AND (NOT is_restricted_now()))
  CHECK ((role = ANY (ARRAY['member'::text, 'mod'::text, 'admin'::text])) AND ((role <> 'admin'::text) OR (org_member_role(org_id, auth.uid()) = 'owner'::text)))
- org_members_delete USING ((role <> 'owner'::text) AND ((user_id = auth.uid()) OR ((org_member_role(org_id, auth.uid()) = ANY (ARRAY['owner'::text, 'admin'::text])) AND (NOT is_restricted_now()))))
- org_members relacl authenticated=rdDxtm (no table UPDATE), column role={authenticated=w}. Triggers: org_members_imply_follow (AI), org_members_unfollow_on_leave (AD).
- org_removals: absent. Default ACL public tables: anon+authenticated arwdDxtm (=> explicit revoke needed). Functions default X to anon/auth.
- rsvps(id,event_id,user_id,status,created_at); events.ends_at NOT NULL; events_org_id_fkey ON DELETE SET NULL (A4 makes it CASCADE later).
- org_channel_members relacl gives anon+authenticated arwdDxtm (policies are authenticated-only; noted, not mine).
- Counts: org_members 7 (0 admin, 0 mod); org-chat channel_members 2, stale 0; org_channel_members 0, stale 0; upcoming club RSVPs by
  non-members 0; org_join_requests 0; blocks 0; orgs 5.

## Route inventory (who gets what)
- 404 sweep: already 404 for hidden non-members: invites GET/POST, invites/[id], invite-candidates (requireInviteOfficer), members GET,
  followers, followers/[userId], follow, asset, profile. MISSING (fixing): members/[userId] PATCH+DELETE, requests GET, requests/[id] POST,
  upload-url POST. channels/** is A5b.
- me/org-invites/[id] is decline-only; ACCEPT goes through POST /join (via "invite"), so the join block check covers accept. No change there.
- org_members writers: join DELETE (cookie, self-leave), members/[userId] PATCH/DELETE (service), orgs POST insert (service),
  admitMember insert (service). No cookie-client officer write => revoke UPDATE(role) is safe; public/html has no org_members calls.
- DECISION: blocked-by-officer is NOT an orgJoinState input (no fitting existing state; a new one breaks unowned files). The page shows the
  normal Join/Request; the route answers 403 join_unavailable "You can't join this club right now." (product call 9 wording).
- DECISION: removed is an OPTIONAL orgJoinState input: removed + open + at home -> can_request (reason "policy"). Unowned callers
  (orgs/route.ts, orgs/[slug]/route.ts, orgs/[slug]/profile/route.ts) keep compiling; they show Join and the route files a request.
- join-state.ts: + optional `removed` input (step 6 skips can_join; step 9 reason "visiting" only when really visiting, found by
  the new test), + canApproveRequest(role, removedBefore) (removed person needs owner/admin). 53/53 join-state tests pass.
- hidden-gate.ts + test: officerGate(hidden, role, allowed) -> ok|not_found|forbidden. 6/6 pass.
- org-blocks.ts + test (12/12): orgSideIds, summarizeOrgBlocks (pure), loadOrgSideIds, loadOrgBlocks (service, fail closed),
  isBlockedWithOrg moved verbatim from invites/route.ts. Kept the two-query .eq/.in shape (no .or string), so no dependency on A2's
  pair-block.ts edits.
- join-copy.ts: + errors.joinUnavailable / approveUnavailable / removedNeedsAdmin, meta.removedBefore (+ test: no copy names a block).
- removals.ts + test (4/4): isMissingRemovalsTable (42P01/PGRST205 naming org_removals only), removedIdSet.
- membership.ts (additive): ViewerOrgContext.removed (5th parallel read; missing table => false, other error => ok:false),
  recordOrgRemoval / forgetOrgRemoval / loadRemovedUserIds. admitMember unchanged (the DB clears the removal on INSERT).
- MIGRATION 20260928100000 written (388 lines) and APPLIED LOCALLY clean (pre-flight + post-check passed).
- ROLLBACK round-trip verified locally: header ROLLBACK then re-apply => PRE-FLIGHT passes (rollback restores exact live state).

## Local probes (real roles, each inside BEGIN..ROLLBACK)
- P1 admin (emery) DELETE another admin (casey, seeded) as authenticated: 0 rows. PASS
- P2 admin DELETE a plain member (drew, seeded): 1 row. PASS
- P3 admin UPDATE role of another admin: 42501 permission denied (UPDATE(role) revoked). PASS
- P4 owner (avery) DELETE the admin: 1 row; P4b owner role UPDATE over the data API: 42501 (route uses service role). PASS
- P5 admin self-leave with the cookie client: 1 row; their 2 club-chat channel_members rows 2 -> 0 (SECURITY DEFINER trigger). PASS
- P6 voluntary leave (blake, cookie client) from the open club: chat 2->0, private-channel row 1->0, upcoming RSVP KEPT (1),
  blake's DM row untouched (1). PASS
- P7 removal (service role: org_removals upsert first, then delete): chat 0, upcoming RSVP dropped (0), removal row 1. PASS
- P8 org_removals: authenticated SELECT/DELETE and anon SELECT all 42501. PASS
- P9 re-admission (service-role insert, as admitMember) clears the removal row (AFTER INSERT trigger). PASS
- P10 removal keeps the RSVP to a PAST club event (seeded), drops the upcoming one, DM rows unchanged (1 -> 1). PASS
- P11 account deletion (delete auth.users row) with membership + removal + RSVPs: cascades clean through the new trigger, all 0. PASS
- P12 club deletion as postgres with members, chat rows and a removal row: clean, all 0. P13 owner deletes the club with the COOKIE
  client: 1 row, no error. PASS
- BASELINE (old policies, inside a rolled-back txn): admin demotes admin 1 row, admin removes admin 1 row => #16 reproduced, and
  P1/P3 show it closed. Migration still applied locally after all probes.
- CLEANUP 20260928100500 written. Probe (rolled back): seeded 1 stale channel_members + 1 stale org_channel_members for drew on the
  open club -> PRE-FLIGHT counted 1/1, DELETE 1 + DELETE 1, the 2 real member rows untouched, POST-CHECK passed. Then APPLIED LOCALLY
  for real: 0/0, DELETE 0 + DELETE 0.
- join/route.ts: removed -> orgJoinState; loadOrgBlocks before invited/can_join/can_request (403 join_unavailable, 500 on read error).
- members/[userId]: officerGate 404 for hidden non-members, requireNotRestricted on PATCH+DELETE, recordOrgRemoval BEFORE delete (500 if it fails; forgetOrgRemoval if the delete fails).
- requests GET: officerGate 404, hide requesters in a block pair with this officer (loadHiddenUsers(...).blocked, 500 on error), + removed_before + can_approve per row.
- requests/[id]: officerGate 404; pair block approver<->requester (either way) => 404 request_not_found for approve AND deny; approve re-checks loadOrgBlocks (409 approve_unavailable) and removal (mod => 403 removed_needs_admin).
- upload-url: officerGate(SETTINGS_ROLES = owner/admin, same as before) 404 for hidden non-members.
- invites POST: isBlockedWithOrg (moved to org-blocks) + loadOrgBlocks.blockedByOfficer => 404 user_not_found; private fn removed.
- invite-candidates: loadStandings gains officerSide (loadOrgSideIds); "blocked" now also = any officer blocked the candidate, matching
  the send. Fails closed (500) if the officer read fails.
- orgs/[handle]/page.tsx: only the orgJoinState call gains `removed: ctx.removed`.
- tsc --noEmit -p . clean (whole tree, at the time of the run). node --test src/lib/orgs/*.test.ts: 146/146. npm test: 1128/1129,
  the only failure is the known src/lib/otto/parse-reminder.test.ts.
- LIB vs LOCAL STACK (node script, service key from .env.development.local = 127.0.0.1:54321; NOTE .env.local points at PROD, never
  used): loadViewerOrgContext removed false -> recordOrgRemoval ok (and re-upsert ok) -> removed true -> loadRemovedUserIds finds
  blake -> forgetOrgRemoval -> removed false (0 rows left). loadOrgSideIds(invite club) = owner avery + admin emery.
  loadOrgBlocks(casey, request club) blockedByOfficer TRUE (owner blake blocked casey in the local seed); isBlockedWithOrg true.
  Local PostgREST: service reads org_removals ([]), anon gets 42501.
- join-copy orgErrorCopy: + join_unavailable / approve_unavailable / removed_needs_admin (OrgJoinControl toasts them). test added.

## Final state
- LOCAL DB: 20260928100000 + 20260928100500 APPLIED (no schema_migrations rows, per waveA-build). org_removals 0 rows.
- tsc --noEmit -p . exit 0 (whole tree at 23:xx). src/lib/orgs/*.test.ts 147/147. npm test: only the known parse-reminder failure.
- No HTTP route walk: .env.local = PROD (never touched); the browser walk is the orchestrator's (dev server on .env.development.local).

## Requests for others (not my files)
1. campus-home.tsx requests panel (unowned): render ORG_COPY.meta.removedBefore when a row has `removed_before`, hide/disable Approve
   when `can_approve` is false. Approve can now answer 404 request_not_found (block pair with this officer), 409
   approve_unavailable (an officer blocked the requester), 403 removed_needs_admin (mod letting back a removed person).
2. Pass `removed` to orgJoinState in the unowned callers: orgs/[slug]/profile/route.ts (`removed: ctx.removed`), orgs/[slug]/route.ts
   (A5b: `removed: ctx.removed`), orgs/route.ts (Discover: needs an org_removals read for the viewer). Until then a removed member of
   an open club sees "Join"; tapping it files a request (200 pending), never a 500.
3. A4: review the RSVP delete in org_members_drop_club_access (rsvps/events are A4's); re-run a club-deletion probe once
   20260928110000 (events_org_id_fkey -> CASCADE) is applied locally too.
4. Follow-ups: demotion doesn't drop private officer channels; org_channel_members has anon/authenticated arwdDxtm table grants
   (RLS policies are TO authenticated, so anon is refused by RLS; tidy the grants); a pending invite from a club whose officer later
   blocked the student stays in /api/me/org-invites (accept answers join_unavailable).

## Open questions for Franky
- Mods can't approve a "Removed before" request (owner/admin only, canApproveRequest) - approach-product's call; build spec silent.
- Invite send keeps the either-way block check with sender+owner AND adds "any officer blocked the invitee".
- Removal drops RSVPs to club events that haven't ENDED (in-progress included), not only future ones.
- An owner/admin deleting someone's membership straight through the data API isn't recorded as a removal (treated as a leave).
  Alternative: narrow org_members_delete to self-leave only (all officer removals already use the service-role route).
--- progress: repair pass started (reviewer: org_join_requests_select lacks block clause)
- prod (read-only MCP 2026-09-28): org_join_requests_select qual identical to local; only policy on the table; RLS on; is_blocked_either_way md5 11a5c6dc... SECURITY DEFINER STABLE (live == local)
- REPAIR: ran the old header ROLLBACK locally (clean: triggers/functions dropped, policies + UPDATE(role) restored, org_removals dropped)
- BASELINE probe (old policy, rolled back; script scratchpad/a5a_jr_probe.sql): B1 mod blocked BY the requester sees 1 (HOLE), B2 mod who blocked the requester sees 1 (HOLE), B3 owner 1, B4 requester own 1, B5 unrelated 0, B6 requester own 1, B7 mod no block 1, B8 anon 42501. Reviewer reproduced.
- EDITED 20260928100000: header (why, item 6, LIVE STATE, ROLLBACK restores old org_join_requests_select USING), PRE-FLIGHT (exact old qual, no other permissive SELECT/ALL policy, RLS on, is_blocked_either_way md5 11a5c6dc + SECURITY DEFINER), section 6 ALTER POLICY org_join_requests_select (officer branch AND NOT is_blocked_either_way((select auth.uid()), user_id)), POST-CHECK (qual has is_blocked_either_way, self branch, 'mod'). APPLIED LOCALLY clean (pre-flight + post-check passed).
- ROLLBACK round-trip (new header ROLLBACK extracted verbatim): clean; org_join_requests_select back to the exact prod text, org_removals gone, 2 triggers. Re-applied: pre-flight + post-check passed. A second apply is refused by the pre-flight (drift guard works).
- RE-PROBE after re-apply (SQL, rolled back): B1 blocked-by-requester mod 0, B2 mod-who-blocked 0, B3 owner 1, B4 requester own 1,
  B5 unrelated 0, B6 requester own (blocked by mod) 1, B7 mod no block 1, B8 anon 42501. P1-P13 all re-run: same results as before.
- LOCAL POSTGREST (real HS256 user JWTs, seeded committed rows then deleted; snapshot identical before/after): emery mod 0 rows
  in both block directions, 1 with no block; blake owner 1; requester 1. So the reviewer's JWT read is closed end to end.
- App impact: re-grepped every org_join_requests read: requests/route.ts, requests/[id], join, invite-candidates, membership.ts all use
  the service role (bypass RLS); the only cookie-client read is api/orgs/route.ts:324 (.eq user_id = me, the self branch). No function
  or view reads the table. The requests list route keeps its loadHiddenUsers filter (defense in depth).
- tsc --noEmit -p . exit 0. node --test src/lib/orgs/*.test.ts 147/147. npm test 1129/1130, only the known parse-reminder failure.
- REPAIR DONE (2026-09-28). LOCAL DB: 20260928100000 (repaired) + 20260928100500 applied; org_removals 0 rows; no schema_migrations rows.
  Probe scripts (scratchpad): a5a_jr_probe.sql, a5a_pgrst.mjs + a5a_pgrst_run.sh, a5a_probe1-3.sql, a5a_rollback.sql.
