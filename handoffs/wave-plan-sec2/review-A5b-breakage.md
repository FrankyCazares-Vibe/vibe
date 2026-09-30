# Review A5b (club chat + club posts) — lens: does anything break?

Reviewer log, appended in small chunks (2026-09-27). Read-only; local DB probes only inside ROLLBACK.

## Progress
- Read plan.md, waveA-build.md, approach-A5.md, notes-A5b.md.
- Read migration 20260928150000 end to end, the two new club-routes modules, and diffs of channel-access.ts, messages-upload-url, users/search, orgs/[slug]/posts, orgs/[slug] PATCH/DELETE, channels/** (5 files).
- orgs writers: only service-role (orgs PATCH :667, admin verify/hide). DB functions that UPDATE orgs (bump_org_activity*, record_post_view) are all SECURITY DEFINER, so the column revoke can't hit a trigger running as authenticated. OK.
- posts cookie-client UPDATE: only posts/[id] PATCH :650, which already refuses a club post unless loadOrgRole = owner/admin. Policy and route agree. OK.
- ensureMember callers: messages GET/POST, media proxy, upload-url, search. All map !ok to 403/404/500; return shape unchanged. OK.
- `node --test src/lib/club-routes/gate.test.ts`: 9/9 pass. `npx tsc --noEmit -p .`: clean (exit 0).
- My probes (rolled back, rv-a5b-probe1.sql in scratchpad), as emery (current admin, subscribed): roster 1; own settings UPDATE (last_read/typing, mute/pin/hidden) 1 row each; own org rows joined to channels 2. After flipping #general private: admin still 1; demoted to member with no allow row: 0 and a settings UPDATE silently 0 (no error); public #announcements still 1. So the UPDATE-applies-SELECT-policy side effect only touches rows the viewer can't read anyway.
- Thread setting routes (read/typing/mute/pin/hide/clear) don't `.single()` the UPDATE, so a 0-row update can't turn into a 500.
- Header ROLLBACK run in a rolled-back txn, then the PRE-FLIGHT block: passes. ROLLBACK is complete and exact.
- Other wave-A migrations (100000..160000): none touch channel_members policies, posts_update_own or orgs grants; A2 alters posts_select_authenticated only. PRE-FLIGHT pins nothing another batch changes first.
- Apply-order claim checked both ways: old code + new DB (ex-member stale row invisible -> old ensureMember DM branch, old upload-url, old search all refuse); new code + old DB (ensureMember uses channels RLS, not the new helper). Either side safe: claim right.
- (resumed 2026-09-28) Re-read migration + every A5b diff. Re-ran gate.test.ts 9/9, tsc clean.
- No realtime subscriptions and no direct PostgREST calls in public/html or client components: the policy/grant changes only reach server routes.
- orgs writers re-grepped: PATCH /api/orgs/[slug] (service), admin verify + hide (service), org create insert (service). DB functions that UPDATE orgs: bump_org_activity* (SECDEF). Revoke is safe.
- posts UPDATE writers: posts/[id] PATCH only (cookie; route already refuses non-officer club edits, then `.single()` -> 500 only on a mid-request role change race). DB: record_post_view (SECDEF). OK.
- UI error handling: admin-actions.tsx shows `data.error` for PATCH / club post / uploads, so the new 422 content_blocked (links, philanthropy, content) and 403 school_email_required read as plain sentences. OK.
- PRE-FLIGHT scope: pins channel_members_select_member, posts_update_own + "only permissive UPDATE on posts", posts.org_id/user_id not updatable, orgs 9-col grant set, RLS on, helper free, can_view_org_channel SECDEF. Wave-A files before 150000 (100000 A5a, 110000/130000 A4, 120000 A2, 140000 A3) touch none of those (A2 explicitly leaves posts UPDATE/DELETE to A5/B2). OK.
- channel_members cookie readers re-walked (messages GET peers, threads GET memberships/others/findExistingDm, badge, otto, block, pair-block, thread setting routes): all own-row or DM/group, or org-channel reads by current members, which can_view_org_channel still passes. Ex-member club threads now drop out of the inbox whole (own row + roster both hidden), no half-rendered thread, no lost DM/group names.
- channels_select_member's EXISTS on channel_members now also runs can_read_channel_roster; for org_id IS NULL it is true, so DM/group channel visibility is unchanged (and the helper is SECDEF: no recursion).
- ensureMember: signature + ChannelAccess unchanged; new 500/403 paths map cleanly in all 4 callers (messages GET/POST pass status through, media proxy 500->failed else 404, upload-url 500/403, search 500/[]).
- UI: campus-home.tsx channel create/save/delete, club delete, club settings save and admin-actions.tsx all surface `data.error`, so 422 content_blocked / 403 school_email_required / 404 read as plain sentences.
- Re-ran the migration's POST-CHECK (parts 1+2) against today's local DB (all wave-A files applied) in a rolled-back txn: passes. The posts probe is not vacuous (posts_select_authenticated has `OR user_id = auth.uid()`, so the author sees the row and only the new clause stops the edit).
- eslint on all A5b files: clean.

## Verdict: SHIP. No mustFix.
shouldFix:
1. Version clash for the orchestrator: plan.md still gives B2 `20260928150000`; B2 needs a new number, and if it alters posts_update_own it must restate A5b's org clause.
2. users/search fails closed on a MUTES read error too (loadHiddenUsers reads blocks+mutes, only blocks are used). Spec-compatible, but a mutes hiccup now 500s every search.
3. Two copies of the hidden-club 404 rule (club-routes/gate.ts vs A5a's orgs hidden gate): fold after wave A (builder already flagged).
4. Follow-up already noted: authenticated still holds INSERT on channels (channels_insert_authenticated has no word filter on name/topic).
