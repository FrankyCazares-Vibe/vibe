# Wave A final check, round 2 (2026-09-28, after I1 + I2)

Progress notes, appended as I go. Local database only; nothing pushed, committed or applied to production.

- Started. 8 wave-A files (100000, 100500, 110000, 120000, 130000, 140000, 150000, 160000). ROLLBACK blocks extracted from the CURRENT file headers (I2 edited 100000/150000). No local schema_migrations rows exist for 20260928*.
- Catalog snapshot taken (public policies md5, functions md5/secdef/config/acl, table + column ACLs, constraints, triggers) with everything applied.
- ROLLBACK in reverse version order 160000, 150000, 140000, 130000, 120000, 110000, 100000 (100500 has none): all 7 exit 0 with ON_ERROR_STOP=1, no ERROR/WARNING. Each log is BEGIN ... COMMIT; DELETE 0 on schema_migrations (no local rows).
- Applied all 8 in version order with ON_ERROR_STOP=1: all exit 0, each log ends in COMMIT, every PRE-FLIGHT/POST-CHECK passed. Only output of note: `NOTICE: club-chat-cleanup: 0 stale channel_members, 0 stale org_channel_members`.
- Snapshot after the re-apply == snapshot before the rollback, byte for byte. All 8 left APPLIED.
- Fingerprints unchanged from crosscheck-waveA.md §7 (posts_update_own bb2425..., posts_select_authenticated 19ad59..., post_comments_select_authenticated 24311c..., post_comments_insert_own 2c7653..., channel_members_select_member 1532e4...).
- Ruling 15 landed: org_members_delete = `(role <> 'owner') AND (user_id = auth.uid())`. Ruling 17 landed: authenticated has no INSERT on channels (the old channels_insert_authenticated policy still exists but is inert without the grant). authenticated has no UPDATE(role) on org_members.
- GATE: `npx tsc --noEmit -p .` exit 0 (also re-run with `--incremental false`: exit 0, no output). `npm test`: 1149 tests, 1148 pass, 1 fail = src/lib/otto/parse-reminder.test.ts (the known pre-existing one). No other failures.

## Files this wave touched (git status --short; handoffs/ is gitignored)
Modified (52 tracked) and new (31 untracked files), by owner:
- A1: users/[handle]/bootstrap, users/[handle]/posts, resume/[...path], posts/[id]/page.tsx, profile/[handle]/page.tsx, lib/profile/build-vibe-user-v1.ts (+test), lib/profile/profile-layout.ts (doc comment only), NEW lib/profile/hidden-fields.ts (+test), migration 160000.
- A2: posts/[id]/route.ts (hunks at lines 22, 108, 189: import, helper, GET only; DELETE/PATCH untouched), posts/[id]/comments, users/by-id/[id], me/threads/route.ts, me/threads/[id]/route.ts, me/threads/[id]/members (+ I2), me/reports, lib/safety/pair-block.ts (2 exports added), NEW lib/safety/pair-block-group.test.ts, NEW lib/moderation/report-visibility.ts (+test), NEW lib/messages/group-rules.ts (+test; not in A2's written owns list, declared in notes-A2 line 66), migration 120000.
- A3: me/profile-viewers, me/profile-views, me/posts/[id]/savers, me/posts/[id]/viewers, lib/metrics/post-audience.ts, lib/metrics/profile-viewers.ts, NEW lib/metrics/audience-split.ts (+test), PostAudienceList.tsx (docblock only), public/html/_postViewer.js (docblock + the paintAudience empty-state branch at ~1890, which the orchestrator handed to A3 after review, notes-A3 line 70), migration 140000.
- A4: api/events/route.ts, api/events/[id]/attendees, NEW lib/events/**, migrations 110000 + 130000.
- A5a: lib/orgs/join-copy.ts (+test), join-state.ts (+test), membership.ts, NEW lib/orgs/hidden-gate.ts (+test), org-blocks.ts (+test), removals.ts (+test); orgs/[slug]/join, requests, requests/[id] (+ I2), members/[userId] (+ I2), invites (+ I2), invite-candidates (+ I2), upload-url; migrations 100000 (+ I2) + 100500.
- A5b: lib/messages/channel-access.ts, me/messages-upload-url, users/search, orgs/[slug]/channels/** (5 files), orgs/[slug]/posts (+ I1), orgs/[slug]/route.ts (+ I1), migration 150000 (+ I2).
- I1: orgs/route.ts, orgs/[slug]/profile, orgs/[handle]/page.tsx, campus/campus-home.tsx (diff confined to RequestRow + SettingsRequests), NEW lib/club-routes/{club-posts, club-posts-read, link-labels}.ts (+ tests), officer-guard.ts; lib/orgs/hidden-gate.test.ts (tests added).
- Files changed since the first cross-check (mtime newer than crosscheck-waveA.md): exactly the I1 + I2 set above plus migrations 100000 and 150000. Nothing else moved.

## Stray-file / ownership check
- No console.log/debug/dir/trace/table or `debugger` added in any tracked diff or new src/supabase/public file.
- No `.only(` / `only: true` / `.skip(` / `skip: true` / `.todo(` in new or changed tests.
- No stray debug files: no untracked non-ignored file outside src/ and supabase/; the only ignored files changed in the last 30h outside handoffs/ are tsconfig.tsbuildinfo, next-env.d.ts, supabase/.temp/cli-latest (tooling). src/lib/club-routes/gate.ts + gate.test.ts are gone from src (archived as .txt in handoffs/wave-plan-sec2/archive-I1/; nothing imports them).
- Shared libs: HEAD vs now `^export` lines of build-vibe-user-v1, profile-layout, lib/orgs/{join-copy,join-state,membership}, channel-access, pair-block, profile-viewers are identical except ADDED exports (canApproveRequest; recordOrgRemoval/forgetOrgRemoval/loadRemovedUserIds; groupBlockFilter/loadGroupBlockConflict). Additive.
- Flags (all low, none blocking):
  1. src/lib/metrics/post-audience.ts is NOT additive: loadPostSavers + PostSaverEntry removed (replaced by countPostSavers), AudienceResult<T> gained a required `total`. A3 owned it and it is not on the build spec's additive list; the only importers are A3's own savers/viewers routes; tsc clean. Accept, just know it.
  2. I1 edited src/lib/orgs/hidden-gate.test.ts (A5a's lib/orgs area, outside I1's orgs routes/pages/campus-home/club-routes). Tests only, 4 added, part of the gate fold. Accept.
  3. The I2 summary's file list leaves out four files I2 did edit (all inside I2's owned area, all recorded in notes-I2.md): orgs/[slug]/members/[userId]/route.ts, orgs/[slug]/requests/[id]/route.ts, migrations 20260928100000 and 20260928150000. I2 also edited invite-candidates/route.ts (A5a's, invites area; declared).
  4. channels_insert_authenticated policy still exists on channels after 150000's INSERT revoke; inert without the grant. Harmless; could be dropped in a later tidy.

## Open items (for Franky / orchestrator)
Decisions:
- I1 (ruling 13): the club grid + GET orgs/[slug]/profile drop only authors the viewer BLOCKED, not muted. One-line change in club-routes/club-posts-read.ts loadBlockedAuthors (hidden.ids) if muted officers' club posts should hide too.
- I2: thread add rate limit is 50 per 10 min per adder (was going to be 30 like thread-create). Keep 50 or match 30?
- I2: invites GET now 500s when the blocks/mutes read fails (fail closed, like the requests list) instead of hiding every inviter name. Confirm.
Follow-ups:
- invite-candidates route + OrgInviteSheet (phone/org-page approve path): still no removed_before/can_approve, so a mod sees Approve on a removed person's request; the server refuses with a readable line. Fix: send both fields, hide Approve when can_approve === false, show ORG_COPY.meta.removedBefore. Confirmed still missing (grep).
- members/[userId]: viewer's own role can change between requireStaff and the write (needs a one-statement RPC).
- invites/[id] DELETE (revoke) and me/org-invites/[id] (decline) gated on Terms only; de-escalating, optional.
- Officer's Pending invites list hides an invitee in a block pair with them; that officer can't revoke from the sheet (invite still expires / can be declined).
- B2: posts_org_id_fkey ON DELETE SET NULL (deleted club's posts become authors' own posts); orgs DELETE docblock now says so. B2 migrations at 20260929*, restating posts_update_own with fingerprint bb242564edecd0feeb551439d4ece148.
- Delete handoffs/wave-plan-sec2/archive-I1/ once the gate fold is accepted.
- Small: club page reads blocks twice (loadInviterFirstName + loadBlockedAuthors).
- Orchestrator: signed-in browser walk at 375px as a non-admin (not done here); prod order stays 100000/100500/110000 before the deploy, 120000..160000 after (160000 last, after A2's threads + reports are live).
