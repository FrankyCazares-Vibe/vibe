# Review B5 (bypass lens: "does it close the gap?") — 2026-09-28

Reviewer, READ-ONLY on repo files. Local DB probes only inside ROLLBACK transactions.
Scope: B5 (a) no Retry on 400/403/404/422 load failures, (b) phone Deny on the invite sheet, (c) invite sheet/modal Night tokens.

## Progress
- Read plan.md, waveA-build.md (rulings + SHIPPED), plan-waveB.md, waveB-build.md (product call 7), critique-B5.md, notes-B5.md.
- Read the diffs: failure-copy.ts (+NO_RETRY_STATUSES, failureRetryable), LoadFailed.tsx, _persistence.js twin, join-copy.ts (+4 keys), OrgInviteSheet.tsx (deny + tokens), PostViewerMobile.tsx (comment only). Matches critique-B5 final approach + the two declared deviations.
- (c) tokens: all nine used tokens (--charcoal, --ink-muted, --ink-2, --cream, --paper, --glass, --paper-70, --scrim-rgb "r,g,b" triple, --eyebrow-ink) are defined in globals.css :root and :root[data-theme="dark"]. No var(--muted|accent|border). Remaining literals: PRIMARY, Avatar chip, banner coral tints, overlays, DARK — as specified.
- (b) route (unchanged, pre-existing) re-read: org-scoped (.eq org_id), officerGate (hidden → 404), requireNotRestricted, pair block with THIS officer → 404, 409 if not pending. Deny UPDATE is `.eq("id")` only — no `status='pending'` compare-and-set (pre-existing race vs a concurrent approve; not B5).
- (a) posts/[id] GET: 500 on read error, 404 when gone/blocked. BUT the club check (orgContentAccessAsService) fails CLOSED to 404 on a read error → that transient failure now shows "That's no longer available." with no Retry (close + reopen still works). Critique said GET is "clean"; it is not quite. shouldFix (B2's route), not B5 mustFix.
- GATES: tsc --noEmit exit 0. node --test failure-copy + join-copy: 39/39.
- DB PROBES (local, one txn, ROLLBACK; test request drew → test_request_club):
  drew (requester) UPDATE own row → approved: permission denied. drew INSERT status 'approved': permission denied.
  blake (owner) direct UPDATE → denied: permission denied; DELETE: permission denied. So Deny is route-only (service role), as intended.
  casey (outsider) SELECT: 0 rows. blake SELECT: 1. anon SELECT: permission denied.
  FOUND (pre-existing, not B5): table-level SELECT to authenticated includes `resolved_by`; the requester's own row is visible to them, so a denied student reads the DENYING officer's uuid (joined to users.handle → "blake_iu" in the probe). The app only reads id, org_id of own pending rows (orgs/route.ts:323). Follow-up migration: column-level SELECT without resolved_by (or resolved_by server-only). Live has 0 rows today.
- (b) sheet logic re-read: deny() guarded by busyId + request_id; Approve disabled while Deny in flight; wasDenied needs state "none", and rowOf drops patches older than a fresh read, so a re-request (fresh "requested") outranks "Denied". 409/404 → toast + reloadList. Double-tap within one frame can send two POSTs (pre-existing busyId-in-state pattern); the second gets 409 "Request already resolved". Harmless.
- (b) reachability: invite-candidates DROPS anyone an officer blocked (inviteRefusedIds), so the can_approve===false row is effectively unreachable for owner/admin; Deny on the phone can't clear those (desktop Requests tab can). Matches scope as written ("add Deny beside Approve"); not a defect.
- (a) static twin: failed() carries status; retryable() mirrors the TS rule incl. the capital-T exception; node --check ok; no name collisions. Drift test regexes match the source.
- (a) desktop gone post: /api/posts/<missing>/comments answers 200 [] (comments/route.ts ~:209-212), so no Retry appears but "No comments yet — be the first." does. Confirmed builder's follow-up; not B5-owned.
- Other tests: avatar-upload + theme 31/31. Local test rows: org_join_requests 0, org_removals 0 (builder's cleanup holds).
- Product call 7 check: 400/403/404/422 no Retry (with the "Try again" line exception, flagged as open question); Deny one tap → "Denied"; re-invite allowed (new sheet shows Invite; invite route has no 'denied' read); sheet + modal follow Night. Implemented as written, not backwards.

## Verdict: ship
No must-fix. Should-fix (follow-ups, none B5-owned):
1. org_join_requests.resolved_by is readable by the requester (table SELECT) → a denied student can identify the denying officer via PostgREST. Column-level SELECT without resolved_by in a later org migration.
2. requests/[id] deny UPDATE lacks `.eq("status","pending")` (concurrent approve/deny can leave a member with a 'denied' row).
3. posts/[id] GET club check fails closed to 404 on a read error → that transient failure now shows the gone line with no Retry.
4. Desktop gone post invites a first comment (comments GET 200 []).
5. Stale 30-day re-invite doc in requests/[id]/route.ts header.
