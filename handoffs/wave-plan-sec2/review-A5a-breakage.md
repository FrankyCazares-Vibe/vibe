# Review A5a (club membership) — breakage lens

Reviewer started 2026-09-27. Read-only; probes only inside BEGIN..ROLLBACK.

## Progress
- read plan.md, waveA-build.md, approach-A5.md, notes-A5a.md
- read both migrations + diffs of join-state, join-copy, membership, org-blocks, removals, hidden-gate, join, members/[userId],
  requests, requests/[id], invites, invite-candidates, upload-url, orgs/[handle]/page.tsx
- loadViewerOrgContext callers (page.tsx, orgs/[slug]/route.ts, profile/route.ts, join, invites): ALL pass the service client, so
  the new org_removals read can't 42501 -> no 500 from the added 5th read. OK
- ViewerOrgContext gains a REQUIRED `removed` field: only membership.ts constructs it (grep) -> additive for readers. OK
- orgJoinState: step 9 reason change only reachable when removed=true (open && !visiting && !removed -> can_join). No change for
  callers that omit `removed`. OK
- org_members writers: join DELETE (cookie, self-leave branch unchanged), members PATCH/DELETE (service), orgs POST insert
  (service), admitMember insert (service). public/html: no org_members calls. UPDATE(role) revoke breaks nothing. OK
- channel_members inserts on club channels: admitMember + subscribe-public, both require membership -> cleanup's "no org_members
  row = stale" definition can't eat a legit non-member subscription. OK
- Local DB: A4 (events_org_id_fkey = CASCADE) and A5b (roster rule) are applied locally too; no FKs reference rsvps /
  channel_members / org_channel_members / org_removals; no triggers on rsvps/channels/events.
- (resumed after usage-limit reset, 2026-09-28) re-read both migrations, join/requests/requests[id]/upload-url diffs, lib diffs.
- join can_request insert + requests approve use the service role; no triggers on org_join_requests -> a removed viewer on an
  OPEN club filing a request is accepted by the DB. OK
- requests GET: loadHiddenUsers on the officer's cookie client (blocks_select_either); requesterIds built from the FILTERED rows;
  removedIdSet lower-cases both sides. OK
- apply order: A5a is the FIRST file (100000) so its PRE-FLIGHT pins today's org_members policies; no later file edits
  org_members policies/triggers (grep of 110000/120000/150000: only reads via org_member_role / EXISTS). OK
- PROBE R1 (rolled back): owner avery deletes test_open_club with the COOKIE client, A4's events CASCADE applied locally, seeded
  drew member + 2 chat rows + upcoming RSVP + a removal row for blake: DELETE 1, no error; members/chat/rsvps/removals all 0. PASS
- members PATCH/DELETE: route rules == new policy (admin-over-admin refused in both); requireNotRestricted also adds the terms
  gate to these two routes (new 403 terms_required for a consent-less officer; acceptable, house standard).
- club channel_members / org_channel_members writers all require an org_members row (subscribe-public, channels/members,
  admitMember); DM/group channels never carry org_id (type check) -> trigger + cleanup can't eat a legit row. OK
- blocks_select_either unchanged after A2 (local) -> requests-list hiding via the officer's cookie client still sees both ways.
- OrgJoinControl + onboarding.html both treat {pending:true} as "requested" -> an unowned caller that still says "Join" to a
  removed viewer degrades to a filed request, never an error.
- onboarding.html's ONB-PURE-MIRROR copy of ORG_COPY/orgErrorCopy lacks the 3 new codes; falls back to r.message, which IS the
  same copy (server sends it as `error`). No user-visible break; mirror drift only (unowned file). shouldFix.
- node --test src/lib/orgs/*.test.ts: 147/147. npx tsc --noEmit -p .: clean.
- PROD (MCP, read-only, 2026-09-28): both org_members policy texts equal the PRE-FLIGHT strings byte for byte; UPDATE(role)
  held, no table UPDATE; 2 triggers; org_removals absent; stale chat rows 0/0; every org owner has an org_members row; all org
  and user ids pass the strict RFC-4122 isUuid (so loadOrgSideIds can't refuse a real id). Local ids likewise.
- ROLLBACK R2 (rolled back): header ROLLBACK statements run on the local DB (A4/A2/A5b also applied), then the file's PRE-FLIGHT
  block -> passes. Rollback is complete (table+index+comment, 2 triggers, 2 functions, both policies, the column grant).
- No later migration (110000..160000) pins org_members policies/triggers or references org_removals/the triggers in SQL.
- Shared-lib shapes: only additions (ViewerOrgContext.removed is built only in membership.ts; OrgJoinStateInput.removed optional;
  ORG_COPY keys added). All 5 loadViewerOrgContext callers pass the service client.

## Verdict: ship (no must-fix breakage found)

## Should fix (non-blocking)
1. POST-CHECK is catalog-only. plan.md asks for behaviour "where possible", and A5b shows the pattern. Cheap adds: as
   `authenticated` with a random sub, `update public.org_members set role = role where false` must raise
   insufficient_privilege, and `select 1 from public.org_removals limit 1` must raise insufficient_privilege.
2. Unowned callers (orgs/route.ts Discover, orgs/[slug]/route.ts, orgs/[slug]/profile/route.ts) don't pass `removed`: a removed
   viewer sees "Join" there but "Request to join" on the page, and after filing, those routes still say can_join (step 6 runs
   before the pending-request step 7). Tapping only returns the pending request (no error). Already in notes as request 2.
3. public/html/onboarding.html ONB-PURE-MIRROR: ORG_COPY.errors/meta and orgErrorCopy lack the 3 new codes. User sees the same
   words (falls back to the server's `error`, which is the copy), but the mirror has drifted (unowned file).
4. members PATCH/DELETE: requireNotRestricted also brings the terms gate (new 403 terms_required). Intended; say so in notes.
5. Product edge for Franky: a student who blocked the OWNER of a club with no other officer files a request nobody can see or
   resolve; it stays "Requested" forever.
6. PRE-FLIGHT's "unknown trigger on org_members" check pins something the file doesn't need. Harmless while 100000 applies
   first; it would only abort (safely) if an unrelated trigger landed before it.
