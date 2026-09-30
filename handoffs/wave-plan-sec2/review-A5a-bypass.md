# Review A5a (club membership): bypass lens

Reviewer: adversarial "does it actually close the findings" pass. Read-only on repo; local-DB probes inside BEGIN..ROLLBACK only.
Started 2026-09-27.

## Progress
- read plan.md, waveA-build.md, approach-A5.md, critique-A5.md, notes-A5a.md
- read migration 20260928100000 (full), org-blocks.ts, removals.ts, hidden-gate.ts, join-state diff, membership diff,
  join route, members/[userId], requests (list + [id]), invites, invite-candidates, upload-url diffs
- grep: only admit paths = join route (admitMember) + requests/[id] approve (admitMember); orgs POST inserts owner.
  No DB function writes org_members/org_removals/channel_members except the two new triggers.
- local grants: org_members authenticated=rdDxtm (no INSERT/UPDATE), org_removals no anon/auth, org_join_requests auth=r(m),
  org_invites auth=r. orgs_delete = owner only.
- CANDIDATE: org_join_requests_select lets ANY owner/admin/mod read every request row of the club over PostgREST, no block
  clause. Product call 9 says a victim's request is hidden from the officer they blocked; only the list ROUTE hides it.
  Only cookie read of org_join_requests is the self branch (orgs/route.ts:324); officer reads are service role -> a block
  clause on the officer branch breaks nothing. To probe.

## Session 2 (resumed after usage limit, 2026-09-28)
- re-read notes, waveA-build, migration 20260928100000, org-blocks/removals/hidden-gate, join, members/[userId], requests (+[id]), invites, invite-candidates diffs
- local catalog: org_members authenticated=rdDxtm, no column UPDATE left; org_removals service only; no public function
  besides the two new triggers writes org_members/channel_members/org_removals; orgs has no authenticated UPDATE columns locally
- admitMember spends pending invites; invites POST refuses current members => no stale pre-removal invite path found
- org_channel_members INSERT policy lets owner/admin add ANY user_id (incl. a removed non-member) but can_view_org_channel
  requires is_org_member first => inert. Not a bypass.

## Probes (session 2, all BEGIN..ROLLBACK, real roles)
- P-JR1 CONFIRMED DEFECT: mod emery (seeded on test_request_club), blocked BY vibe_review; vibe_review's pending
  request seeded. As authenticated emery: `select ... from org_join_requests join users` returns the row with
  user_id, message 'please let me in', handle vibe_review. Prod policy text identical (MCP read). Product call 9
  ("their request is hidden from that officer") holds only in the list ROUTE; PostgREST hands it straight over.
- FIX PROBED: alter org_join_requests_select officer branch AND NOT public.is_blocked_either_way((select auth.uid()), user_id)
  (helper exists live, SECURITY DEFINER, md5-pinned by A2): blocked mod 0 rows, unblocked owner blake 1, requester own 1.
- #16 re-probe as admin emery vs seeded admin pal (invite club): UPDATE role 42501; INSERT..ON CONFLICT DO UPDATE 42501;
  DELETE admin 0 rows; DELETE owner 0 rows; org_removals SELECT 42501. CLOSED at DB.
- Trigger scope: owner avery cookie-DELETE of member vibe_review on open club -> open-club chat rows 2->0, other club's
  chat row kept (1), upcoming RSVP kept (no removal row), org_removals 0. Matches product call 10 (leave semantics).

## Other checks (session 2)
- node --test src/lib/orgs/*.test.ts: 147/147.
- Hidden 404: members/[userId] PATCH+DELETE, requests GET, requests/[id], upload-url now 404 for non-members of a hidden
  club; followers, followers/[userId], members GET, invites/[id] already did. Pre-gate checks (auth, rate limit, terms,
  restriction) answer the same for real and fake handles => no existence oracle.
- Product calls 9/10/11 direction: join refuses only blockedByOfficer (student-blocked-officer still joins/requests);
  approve re-checks officer blocks + removal (mod -> 403); removed + open + home -> can_request; live invite from
  owner/admin still admits (admitMember spends invites; invites POST refuses current members, so no pre-removal invite
  survives). Removal drops RSVPs to not-yet-ended club events; leave keeps them. Only owner touches admins. All correct way round.
- SECURITY DEFINER triggers: search_path '', every table schema-qualified, now() is pg_catalog, no REVOKE EXECUTE,
  trigger-returning functions aren't RPC-callable. Deletes are keyed on OLD.user_id + OLD.org_id only.
- members/[userId] check-then-write race (target read as member, owner promotes to admin, admin's service-role
  delete/update lands on an admin): low, shouldFix (add role filter to the write).
- UI: nothing renders removed_before / can_approve yet (campus-home.tsx unowned) -> product call 10's
  "Officers see Removed before" not visible until someone owns it.

## Verdict: fix-first (one mustFix: org_join_requests_select block clause, probed above)
