# Notes I2 — club write rules (integration pass, 2026-09-28)

Owns: orgs/[slug]/members/[userId], orgs/[slug]/invites, orgs/[slug]/requests/[id], src/lib/orgs/org-blocks.ts (+test),
me/threads/[id]/members, migrations 20260928100000 + 20260928150000.
Tasks: (1) members PATCH/DELETE race; (2) invite ruling 14; (3) requireNotRestricted on requests/[id] + invites POST;
(4) rateLimit on threads/[id]/members POST; (5) 100000 org_members_delete self-leave only; (6) 150000 revoke INSERT on channels.

## Progress
- read waveA-build (rulings 13-18), crosscheck-waveA, notes-A5a, notes-A5b, notes-A2.
- proxy check (task 3): src/proxy.ts refuses non-GET /api/* for a restricted session, but only from app_metadata and it
  says itself "This is the fast path, not the wall" (updateSession drops GoTrue errors -> user null -> no check). So the
  route helper is still needed: adding requireNotRestricted (it includes the exact requireTermsAccepted gate + body).
- grep org_members deletes: only join DELETE (cookie client, .eq user_id = me: self-leave) and members/[userId] DELETE
  (service role). No public fn deletes org_members. public/html + mobile: no org_members calls. => ruling 15 is safe.
- grep channels inserts: orgs/route.ts:865 (service), orgs/[slug]/channels/route.ts:169 (guard.service = service),
  me/threads/route.ts:297 + :369 (admin = service). No public fn inserts into channels. => ruling 17 is safe.
- local channels: relacl authenticated=ardDxtm (no anon entry); channels_insert_authenticated WITH CHECK
  ((org_id IS NULL) OR owner/admin) AND has_recorded_consent() AND can_publish_now().
- PROD (read-only MCP 2026-09-28): last migration 20260927142000; org_removals absent; org_members_delete = the old text in
  100000's LIVE STATE; channels relacl {postgres=arwdDxtm,authenticated=ardDxtm,service_role=arwdDxtm}, no column ACLs,
  RLS on (not forced); channels_insert_authenticated WITH CHECK as local; channels: group 3, dm 7, org_channel 12.
- (1) DONE members/[userId]: ACTABLE_ROLES {owner: admin/mod/member, admin: mod/member}; PATCH update + DELETE delete
  filter .in("role", ACTABLE_ROLES[viewerRole]) and .select("user_id"); 0 rows -> re-read: still a member 409
  "Their role just changed. Refresh and try again." / gone 404 "Member not found" / read error 500. DELETE 0 rows:
  forget the removal record ONLY if still a member (a concurrent removal by another officer must keep its record).
  Also: non-uuid userId -> 404; target read error -> 500 (was a silent 404). Residual: the VIEWER's own role can still
  change between requireStaff and the write (an admin demoted mid-request); not closed (would need an RPC).
- (2) DONE org-blocks.ts additive: inviteSideIds (org side + sender, minus invitee), inviteRefusedByBlocks (blockedByOfficer
  || invitee blocked the SENDER), loadInviteBlocks (service, fails closed); loadOrgBlocks body moved into a private
  readBlocksWithSide (same signature + result). invites POST now asks loadInviteBlocks only (404 user_not_found kept);
  isBlockedWithOrg import dropped there (still exported, still used by requests/[id]). Tests 23/23 (11 new).
- (3) DONE requests/[id] POST and invites POST: requireTermsAccepted -> requireNotRestricted (same terms body + restriction).
- (4) DONE threads/[id]/members POST: rateLimit(`thread-member-add:${user.id}`, 30/600s) before requireCanPublish,
  same shape as thread-create.
- (5) 100000 EDITED: title, WHY #15 (+ruling 15), WHAT 3 (self-leave only + grep evidence), DOES NOT (dropped the
  "officer data-API delete isn't recorded" bullet; added "UPDATE owner-only-admin clause stays"), LIVE STATE re-read note,
  section 3 ALTER POLICY org_members_delete USING ((role <> 'owner') AND (user_id = auth.uid())), POST-CHECK exact text.
  ROLLBACK unchanged (already restores the old live text). Not applied yet.
- (6) 150000 EDITED: title, WHY (ruling 17 + grep), WHAT 5 = REVOKE INSERT ON channels FROM authenticated; DECISION: keep
  channels_insert_authenticated dormant (no grant -> 42501 before RLS; same call as orgs_update; ROLLBACK is one GRANT;
  a future blanket re-grant still meets the old owner/admin+consent+can_publish rule). DOES NOT updated. LIVE STATE
  channels re-read. PRE-FLIGHT: authenticated table INSERT held, anon none, no column ACLs, exact policy WITH CHECK,
  no other INSERT/ALL policy. Section 4b revoke. POST-CHECK 1: no anon/auth INSERT (any column), service_role INSERT
  kept, authenticated SELECT kept. POST-CHECK 2 a2: authenticated INSERT -> 42501. ROLLBACK + GRANT INSERT.
  Committed code (24dac9f) also inserts channels only with the service role -> safe on either side of the deploy.
- ROLLBACK round 1 (reverse version order 160000..100000, NEW header texts): all rc=0; rolled-back org_members_delete + channels relacl == PROD text/ACL
- SNAG + FIX: my first ROLLBACK extractor stripped only "--", so 110000's header CREATE OR REPLACE bodies came back with
  3 extra spaces per line -> 110000 PRE-FLIGHT (md5 pins) refused: "can_manage_event body drifted" (nothing applied; the
  file is one txn). Fixed the extractor to strip "--   " (5 chars) and re-created the two helpers from the header text:
  md5 now 61096085... / 43f184a0... == the LIVE STATE pins. Only function bodies are whitespace-sensitive (policies are
  deparsed), so no other object was affected. 100000 + 100500 were already applied (new) at this point.
- APPLY (version order, ON_ERROR_STOP=1): 100000, 100500 (0/0 stale), 110000..160000 all rc=0. Snapshot diff vs before-start: ONLY org_members_delete qual md5 and channels relacl (authenticated ardDxtm -> rdDxtm). Everything else byte-identical.
- PROBES org_members (real roles, BEGIN..ROLLBACK; scratchpad i2/probe_delete.sql, probe_delete2.sql), invite club, seeded
  drew member + casey admin: D1 owner deletes member 0; D2 admin deletes member 0; D3 admin deletes admin 0; D6 owner
  self-delete 0; D4 member self-leave 1 (+ his 2 club chat rows -> 0 via trigger); D5 admin self-leave 1.
  S1 service-role removal (record, then delete role in (mod,member)) 1, upcoming club RSVP dropped, record kept;
  S2/S2b the admin-filtered delete/update on an ADMIN row 0 (the race answer); U1 owner data-API role UPDATE 42501;
  K1 owner deletes the club with the cookie client 1 row, members cascade to 0; A1 account delete cascades. ALL PASS.
- PROBES channels (scratchpad i2/probe_channels.sql, probe_channels2.sql): owner avery direct club-channel INSERT and a
  group INSERT -> 42501 "permission denied for table channels"; anon 42501; service_role inserts 1 + 1; owner still
  SELECTs her 2 club channels. BASELINE (old grant put back inside the rolled-back txn): both direct inserts SUCCEED ->
  the hole was real and is closed. ALL PASS.
- ROUND 2 (new ROLLBACK texts from the NEW state): starting.
- ROUND 2: all 7 ROLLBACKs rc=0 from the NEW state; rolled-back snapshot == round-1 rolled-back except the 2 helper md5s (now the correct live pins); channels INSERT grant restored. Re-applied 100000..160000 in version order, all rc=0; snapshot == after-round-1 byte for byte. LEFT APPLIED.
- LOCAL POSTGREST (supabase-js, service key from .env.development.local = 127.0.0.1:54321; script refuses any other URL;
  scratchpad i2/pgrst_members.mjs): the route's exact chains. admin-filter PATCH/DELETE on an ADMIN -> [] no error;
  owner-filter PATCH on admin -> 1 row; record removal ok; admin-filter DELETE on a mod -> 1 row; second DELETE -> [];
  re-read -> null (gone). Committed rows cleaned up (members 0, removals 0, and the org_follow_firsts row the imply-follow
  trigger wrote, deleted). Catalog unchanged.
- Comment-only fix in 100000's header after the apply ("DELETE /api/orgs/[slug]/join"); a second apply is refused by the
  PRE-FLIGHT (drift guard) and the catalog is unchanged (final snapshot == after round 2).
- GATES: tsc --noEmit -p . exit 0 (whole tree); eslint on my 6 TS files exit 0; node --test src/lib/orgs/*.test.ts 162/162
  (org-blocks 23/23, 11 new).

## Final state
- LOCAL DB: all 8 wave-A files applied in version order (my two in their final text). No schema_migrations rows. Nothing
  touched in prod (MCP reads only).

## Left for others
- invite-candidates (A5a's file, not mine): lines ~449 and ~647 build orgSide = [viewer, owner] for the "candidate blocked
  the org side" direction, so someone who blocked the OWNER is still hidden from an admin's candidate list while the send
  now accepts them (ruling 14). Use [viewerId] for that direction (keep blockerSide = viewer + owner + officers), or call
  loadInviteBlocks per candidate. Conservative today (hides, never leaks).
- invites/[id] DELETE (revoke) and me/org-invites/[id] (decline) still use requireTermsAccepted only; both are
  de-escalating acts, so a restriction gate is optional.
- members/[userId] residual: the VIEWER's own role can still change between requireStaff and the write (an admin demoted
  mid-request can finish one action); closing it needs an RPC that checks both rows in one statement.
- Proxy: src/proxy.ts does refuse non-GET /api/* for a restricted session, but only from session app_metadata; the route
  gates are the wall.
- REPAIR round (2026-09-28): reviewer F1 must-fix = invite-candidates picker (orgSide [viewer, owner] for candidate-blocked read) vs loadInviteBlocks send. Starting.
- F1 step 1: org-blocks.ts additive export inviteRefusedIds(senderId, blockerSide, rows) -> Set (batch form of ruling 14 for the picker).
- F1 step 2: org-blocks tests 27/27 (4 new incl. exhaustive 2x4096x2 agreement: batch == send's one-at-a-time == picker's two narrower reads). Now editing invite-candidates.
- F1 step 3 DONE invite-candidates: loadStandings(service, orgId, senderId, blockerSide, ids, withFollows); theyBlocked read = blocker in ids AND blocked_id = sender (was in [viewer, owner]); blockedThem = blocked in ids AND blocker in blockerSide (sender+owner+officers, new private inviteBlockerSide); both folded by inviteRefusedIds. Docblocks (top, followers list, loadStandings ~158, followersResponse step 4, search) updated. tsc exit 0.
- Should-fix (own file) DONE invites GET: loadHiddenUsers first (fails closed 500), then the pending list .notIn(invitee_id, blocked either way) before the limit; inviter-name hiding unchanged. tsc exit 0.
- Local PostgREST probe (read-only, scratchpad i2/pgrst_picker.mts): picker's two block reads + inviteRefusedIds on the local block row: candidate-blocked-sender hidden, candidate-blocked-OWNER with admin sender NOT hidden, officer-blocked-candidate hidden; invites GET chain with .notIn ok. 4/4 PASS.
- Should-fix DONE threads/[id]/members: rateLimit limit 30 -> MAX_GROUP_MEMBERS (50) per 600s (bucket name unchanged), so one
  adder can fill a group from the add sheet (create already takes 50 in one call). Docblock + comment updated.
- GATES (repair round): tsc --noEmit -p . exit 0; eslint on invite-candidates, invites, threads/[id]/members, org-blocks(+test)
  exit 0; node --test src/lib/orgs/*.test.ts 166/166 (org-blocks 27/27); npm test 1149, 1148 pass, 1 fail = the known
  src/lib/otto/parse-reminder.test.ts.
- Migrations: NOT changed this round, so no rollback/re-apply needed. Local re-check: org_members_delete =
  ((role <> 'owner') AND (user_id = auth.uid())); channels relacl authenticated=rdDxtm. Still applied.

## Repair round result (F1)
- FIXED in invite-candidates (A5a's file, assigned to I2 by the orchestrator for this repair): hidden set == loadInviteBlocks'
  refused set, proved by the exhaustive agreement test (pure) + the local PostgREST probe (query shapes). A student who blocked
  the owner now shows in an admin's picker (and can be invited from OrgInviteSheet); the owner's own picker still hides them.
- Left for others (unchanged): members/[userId] viewer-role race (needs an RPC); invites/[id] DELETE + me/org-invites decline
  stay terms-only (de-escalating). New side effect to know: an officer's Pending invites no longer lists an invitee who later
  blocked them (or whom they blocked), so they can't revoke that invite from the sheet; it still expires / can be declined.
