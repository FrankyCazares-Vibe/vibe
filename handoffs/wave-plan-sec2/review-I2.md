# Review I2 (club write rules) — reviewer, 2026-09-28

Read-only review. Progress appended as I go.

- Read waveA-build (rulings 13-18), crosscheck-waveA, notes-A5a/A5b/A2, notes-I2.
- Read the 4 routes + org-blocks.ts + both migrations. org-blocks tests 23/23 pass (re-run).
- Proxy claim verified: src/proxy.ts:233 calls its restriction check "the fast path, not the wall" -> route gate needed (done).
- Grep: no DB function (local pg_proc) inserts into channels/org_members or deletes org_members; only src channels inserts are service-role (orgs POST, channels POST, me/threads POST).
- Local catalog: org_members_delete = ((role <> 'owner') AND (user_id = auth.uid())); channels relacl authenticated=rdDxtm; policy channels_insert_authenticated dormant.
- DB probes as real roles (BEGIN..ROLLBACK, scratchpad rev-i2/p1.sql): owner deletes member 0, owner deletes admin 0, owner bulk delete of club 0, owner self 0, admin deletes mod 0; member self-leave 1, mod self-leave 1; owner role UPDATE 42501; channels INSERT as owner (club) 42501, group 42501, upsert 42501. PASS.
- Gates: tsc --noEmit exit 0; eslint on the 6 I2 files exit 0; node --test src/lib/orgs/*.test.ts 162/162.
- UI callers: campus-home.tsx 2238/2258 (members PATCH/DELETE) show data.error -> 409 copy renders; OrgInviteSheet invites via candidates only (POST {user_id}); messages.html add-members loop stops on 429.
- PROD (read-only MCP, 2026-09-28): org_members_delete = the old text in 100000's PRE-FLIGHT; channels relacl authenticated=ardDxtm, 0 column ACLs; channels_insert_authenticated WITH CHECK == 150000's PRE-FLIGHT string; only one INSERT policy on channels; org_removals absent; last migration 20260927142000. Both files' PRE-FLIGHTs will pass on prod.
- Local PostgREST (service key, 127.0.0.1 only; zero-row filters, nothing written): admin-filtered PATCH on an admin row -> []; owner-filtered DELETE on the owner row -> []. Chains behave as the route expects.
- Did NOT re-run the rollback/re-apply loop (the reviewer rule is rolled-back txns only); relied on the builder's two rounds + the crosscheck, and checked no later wave-A file references org_members_delete / org_removals / channels grants (grep: none).

## Finding F1 (mustFix, file NOT owned by I2): invite-candidates now disagrees with the send -> block oracle + ruling 14 unreachable in the UI
- invite-candidates/route.ts ~449 and ~647 build orgSide = [viewer, owner] for the "candidate blocked the org side" read, so a
  student who blocked the OWNER is hidden from an admin's picker. The send (loadInviteBlocks) now ACCEPTS that student.
- Before I2 the two sets were identical (A5a: send refused either-way with sender+owner). Now "missing from the picker but a
  direct POST {user_id} succeeds" happens exactly when the student blocked the owner (and not the viewer, and no officer
  blocked them): an admin can learn a third party's block with one API call. And OrgInviteSheet invites ONLY from the
  picker, so ruling 14's "a victim can still be invited by an officer they haven't blocked" can't be done in the app.
- Fix: in loadStandings' "theyBlocked" read use [viewerId] (the sender) instead of [viewer, owner]; keep blockerSide =
  viewer + owner + officers. Then hidden == refused, exactly. Update the docblock at ~158 (it still names loadOrgBlocks).

## Item by item
1. members/[userId] race: CLOSED for the target's role (write filters ACTABLE_ROLES + .select; 0 rows -> 409/404/500). Removal-record
   bookkeeping on a miss is right (forget only when still a member). Residual (not asked): the VIEWER's own role can move between
   requireStaff and the write. UI (campus-home 2238/2258) shows data.error, so the 409 copy renders.
2. Ruling 14 send: CORRECT in org-blocks.ts + invites POST (sender either way; any officer incl. owner/mod blocked invitee; invitee
   blocking owner/other officer does not refuse; 404 user_not_found kept; fails closed). Tests 23/23. BUT see F1 (picker mismatch).
3. requireNotRestricted on requests/[id] (approve + deny) and invites POST: DONE; body identical to requireTermsAccepted + account_restricted;
   both UIs show r.error for unknown codes. Proxy check is app_metadata-only ("fast path, not the wall"), so the route gate is needed.
4. threads/[id]/members POST: rateLimit("thread-member-add:<id>", 30/600s) before requireCanPublish, same house shape as thread-create;
   messages.html add loop already stops on 429.
5. 100000 org_members_delete: self-leave only, locally and in POST-CHECK exact text; ROLLBACK restores prod text; UPDATE owner-only-admin
   clause kept. No cookie-client/other-person delete anywhere (src + pg_proc). Probes pass.
6. 150000 channels INSERT revoke: correct; prod PRE-FLIGHT facts re-read and match; no cookie/DB-function insert into channels; dormant
   policy is a sound call. Probes pass (club, group, upsert all 42501).

## Should-fix (not blocking)
- invites GET (I2's file) names an invitee who blocked the viewing officer in Pending invites; since ruling 14 that now includes the
  OWNER. The requests list hides the analogous row (call 9). loadHiddenUsers is already loaded there: drop invitees in .blocked.
- members/[userId]: viewer-role race residual (needs an RPC that checks both rows in one statement).
- Adding people to an existing group is now capped at 30 per 10 minutes (one POST per person), while create takes up to 50 at once.
- invites/[id] DELETE and me/org-invites decline stay terms-only (de-escalating; fine).

## Verdict: I2's own files are right. One must-fix (F1) sits in invite-candidates (A5a's file), created by the send change.
