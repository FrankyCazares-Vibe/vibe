# Review I1 (club surfaces), reviewer pass 2026-09-28

Read-only. Progress notes appended as I go.

- Started. Read waveA-build (rulings 13-18), crosscheck-waveA, notes-A5a/A5b/A2/I1.
- Read the I1 diffs: page.tsx, profile/route.ts, [slug]/route.ts, orgs/route.ts, posts/route.ts, officer-guard.ts, campus-home RequestRow/act, new club-posts*.ts, link-labels.ts; archived gate.ts.
- node --test club-routes/*.test.ts + hidden-gate.test.ts: 19/19. tsc --noEmit -p . exit 0.
- Fold (5): officerGate + the routes' own org-read/owner_id/memberErr ordering reproduces clubRouteGate's answers in PATCH, DELETE, posts POST, officer-guard. No leftover import of club-routes/gate.
- Only two service-role club-post lists exist (grep): the club page grid and /api/orgs/[slug]/profile. Both now filtered. /api/orgs/[slug]/profile has no caller in src, public/html, mobile/www.
- npm test 1145/1144 (only the known parse-reminder failure).
- Rolled-back RLS probe: seeded a club post by blake (owner of test_request_club); casey (blake blocked casey) reads 0 via RLS, reads the block row (blocks_select_either), drew reads 1. So loadBlockedAuthors(cookie client) = what RLS hides. Grid + profile route now match cookie surfaces.
- Anon GET localhost:3000 /api/orgs/test_invite_club/profile 200 with 1 post; hidden club 404.
- DELETE docblock vs pg_constraint: all FKs to orgs CASCADE except posts (SET NULL), events->rsvps CASCADE. Docblock accurate.
- campus-home modal is always dark (modalFormStyle gradient, #fff text); --coral on --tag-bg tint is ~5.7:1. OK both themes.
- eslint on I1 files: clean. Every orgJoinState caller now passes removed except invites POST (A5a's, target is the invitee; out of I1 scope). No other route emits join_state.
- Phone: CampusMobile has no requests panel; OrgInviteSheet (not I1's) approves "requested" rows without removed_before/can_approve; its 403/409 toasts are human sentences via describeFailure. Follow-up only.
- Refusal copy: approve_unavailable / removed_needs_admin -> orgErrorCopy (same text as the server's); 404 request_not_found -> "That's no longer available."; not_found -> "This org isn't available."; everything else unchanged (r.error).

## Verdict: SHIP (no must-fix)
Should-fix (not blocking):
1. Club grid + profile route drop blocked/restricted authors AFTER the 24-row read. A prolific blocked officer can push the other officers' posts out and leave the grid on "Nothing posted to the org yet." loadHiddenUsers documents excluding inside the query (`.not("user_id","in",...)`) before the limit; do that for the blocked set.
2. OrgInviteSheet / invite-candidates (A5a's files): send removed_before + can_approve and hide Approve for a mod on a removed person's request (today a human 403 toast).
3. requests GET could mark can_approve false when an officer blocked the requester (today Approve shows, then 409 "You can't approve this request right now.").
4. Open product note: blocks only, not mutes, on the club grid (matches posts RLS). Fine as built.
