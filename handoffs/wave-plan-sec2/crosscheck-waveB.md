# Wave B cross-check (final checker)

Started 2026-09-28. Local only. Progress appended below in small chunks.

## Progress log
- started; read waveB-build.md ownership table
- Local schema_migrations has no 20260928*/20260929* rows (max 20260926100000); applied-state checked from the catalog instead.
- Catalog snapshot taken with all wave B applied (policies, functions, constraints, triggers, table/column ACLs, RLS flags). Fingerprints matched B2's notes (posts_update_own fed3ba53, posts_delete_own 4c952759, posts_delete_club_officer bb984330; action CHECK e30d12ff).
- ROLLBACK blocks extracted from the current headers; ran 120000, 110000, 100000 with ON_ERROR_STOP=1: all exit 0, BEGIN..COMMIT, DELETE 0 on schema_migrations.
- Rolled-back state = pre-wave-B fingerprints exactly (posts_update_own bb242564, posts_delete_own f655cc3d, posts_stamp_edited f3a2e0e0, FK SET NULL, authenticated DELETE on orgs t, action CHECK NOT VALID).
- Applied 100000, 110000, 120000 in order with ON_ERROR_STOP=1: all exit 0, each ends COMMIT, every PRE-FLIGHT/POST-CHECK DO passed. Only output of note: `NOTICE: post-club-deletes: removed posts 1, club posts 1, removed club posts 0 (live 2026-09-28: 0 / 0 / 0)` (local test rows).
- Snapshot after re-apply == snapshot before rollback, byte for byte. All three LEFT APPLIED.
- Wave A still applied: posts_select_authenticated 19ad5936, post_comments_select 24311c96, post_comments_insert_own 2c765320, channel_members_select_member 1532e43e, org_members_delete = (role <> 'owner') AND (user_id = auth.uid()); authenticated has no INSERT on channels/events/profile_views, no UPDATE(role) on org_members. 20260928* files are committed in c0b0533 and git shows them unmodified.
- GATE: `npx tsc --noEmit -p .` exit 0, no output. `npm test`: 1233 tests, 1232 pass, 1 fail = src/lib/otto/parse-reminder.test.ts (known pre-existing). No other failures. (Wave A ended at 1149; +84 tests from wave B.)
- Interplay (storage): every delete site listed (grep .remove(/deleteR2*/.move(): delete-media-store (profiles + R2 clips/orgs), storage-purge (profiles + resumes only; quarantine sweep removed), profile-photo-retire (profiles only), resume-storage (resumes), media-quarantine-store moveAll (profiles<->quarantine). No code path deletes from `quarantine`; the only thing that takes a file OUT of quarantine is B1's restore (release = move back, paths from its own log row). All candidate paths go through ownProfileImageKey / planPostQuarantine / ownClipKeysToDelete (owner folder only). OK.
- Interplay (CASCADE vs log): moderation_actions and reports have no FK to posts/orgs, so posts CASCADE can't touch B1's image log; B2's clubKeysToKeep reads moderation_actions meta for target_type 'org' (B1 writes 'org' + meta.previous) and orgKeysNamedIn keeps every orgs/<id>/ key named. OK.
- FINDING (tags): PATCH /api/posts/[id] filters firstBlockedTag(extractPostTags(content)) only (first 10 ASCII tags, 32-char cut); publish filters [...tags, ...captionHashtags(content)] (every caption tag). An edit can add an 11th `#x_<term>`, `#café_<term>` or a >32-char tag that publish would refuse.
- B5 vs B1 admin: admin screens never use LoadFailed/asLoadFailure; adminGet/adminPost (admin-shell.tsx, unchanged) render the route's sentence inline with no Retry button. NO_RETRY_STATUSES [400,403,404,422] can't reach them. No conflict.
- git status: 35 modified + 34 untracked, every one maps to an owner in waveB-build.md except src/lib/profile/resume-storage.ts (no owner; B3 took it at repair, asked for it to be recorded). Additive-only checks: actions.ts / require-platform-admin.ts = union members only; PostViewerMobile.tsx = comment only; join-copy.ts = 4 added keys; r2.ts = one added export (+ a private regex); failure-copy.ts = NO_RETRY_STATUSES + failureRetryable added. orgs/[slug] route hunks all in the DELETE docblock/body + one import; posts/[id] hunks in DELETE/PATCH + imports (wave A's GET untouched).
- Strays: no debugger, no .only/.skip/.todo. Added console.* are tagged server logs ([purgeUserUploads], [profile-photo], delete-media-store LOG), intentional. Only non-source files newer than wave A's check: tsconfig.tsbuildinfo, .gstack/browse-audit.jsonl, supabase/.temp/cli-latest (tooling).

## Resumed run (16:20)
- report last written 16:12; no repo file newer than it (find -newer: none). Re-verifying from the DB up.

## Run 3 (16:34)
- previous run stopped after the 16:20 resume line; find -newer the report: nothing. Re-running every step.

## Run 4 (16:43)
- run 3 stopped after its start line. Re-verifying in short steps.
- R4 step 1: catalog snapshot before == run-1 after-snapshot. ROLLBACKs re-extracted from the current headers (identical to run 1's): 120000, 110000, 100000 each exit 0, BEGIN..COMMIT, DELETE 0. Rolled-back snapshot == run-1 rolled-back snapshot (posts_update_own bb242564, posts_delete_own f655cc3d, posts_stamp_edited f3a2e0e0, FK SET NULL, orgs authenticated DELETE back, action CHECK 42af37f3 NOT VALID). Re-apply 100000 -> 110000 -> 120000 with ON_ERROR_STOP=1: all exit 0; only output the 110000 NOTICE (local test rows). After == before byte for byte. LEFT APPLIED. Migration files untouched since 16:02 (before run 1).
- R4 wave A: 20260928* committed in c0b0533, no diff; fingerprints 19ad5936 / 24311c96 / 2c765320 / 1532e43e present; authenticated INSERT on channels/events/profile_views f, UPDATE(org_members.role) f, SELECT(users.is_platform_admin) f.
- R4 GATE: `npx tsc --noEmit -p .` exit 0, no output. `npm test`: 1233 tests, 1232 pass, 1 fail = src/lib/otto/parse-reminder.test.ts (known). No other failures.
- R4 tags finding re-confirmed: posts/[id] PATCH :680-684 runs firstBlockedTag(extractPostTags(content)) only; publish-post :158 runs firstBlockedTag([...tags, ...captionHashtags(content)]).
- R4 interplay re-check: delete sites unchanged from run 1's list. Only code that removes from `quarantine` is the pre-existing moveAll duplicate branch (release when an identical copy already sits in `profiles`; media-quarantine-store.ts unchanged in wave B) = completing a restore, not a delete of evidence. posts DELETE: removed_at 409 at body line 60 BEFORE the delete (71) and purge (93); purge only after a row came back. B5 NO_RETRY [400,403,404,422] + "Try again" clause identical in failure-copy.ts and _persistence.js; no admin file uses LoadFailed. OK.
- R4 git status: same 69 files as run 1 (35 M + 34 ??), all owned per waveB-build.md except src/lib/profile/resume-storage.ts (B3 repair; ownership not recorded in waveB-build.md yet). No .only/.skip/debugger; added console.log only in scripts/count-exif-uploads.mjs (local script, refuses non-127.0.0.1) and tagged [profile-photo] server logs. scripts/sql/profiles-orphans-count.sql is one SELECT.

## RESULT (run 4, final)

**Ordering.** Rollback 120000 -> 110000 -> 100000, then apply 100000 -> 110000 -> 120000, ON_ERROR_STOP=1: no failures. Catalog after == catalog before, byte for byte. All three left applied locally. Wave A (20260928*) still applied and unchanged. Deploy order stays as the headers say: 100000 BEFORE the deploy; 110000 and 120000 AFTER the deploy is green (each then gets its schema_migrations row).

**Gate.** tsc clean. npm test 1233 / 1232 pass; the one failure is the known parse-reminder.test.ts.

**Interplay.**
- Quarantine vs deletes: OK. Nothing deletes from `quarantine` (the one `remove` on it is the pre-existing duplicate branch that finishes a restore). Every delete goes through the owner-folder planners (ownProfileImageKey slot avatar|banner for B3; planPostQuarantine / ownClipKeysToDelete / orgs/<club>/posts/ for B2). Self-delete moves evidence to quarantine first and never sweeps it.
- CASCADE vs image log: OK. moderation_actions and reports have no FK to posts/orgs; clubKeysToKeep keeps every orgs/<id>/ key named in image_remove meta.
- Tags: DB rule, tags.ts and extractPostTags agree (PATCH output is always valid, so the trigger never 500s an edit). ONE MISMATCH (should-fix, B2's file): src/app/api/posts/[id]/route.ts:684 filters only `extractPostTags(content)` (first 10, ASCII, 32-char cut), but publish-post:158 filters `[...tags, ...captionHashtags(content)]`. So an edit can add an 11th `#x_<term>`, a `#café_<term>` or an over-32-character tag that publish would refuse. Fix: import captionHashtags from "@/lib/posts/caption-tags" and change :684 to `firstBlockedTag([...patch.tags, ...captionHashtags(c.content)])`. Add a test for an 11th tag and a `#café_<term>` edit.
- B5 no-Retry vs B1 admin: OK. Admin screens never use LoadFailed; TS and legacy lists match.

**Stray files.** 69 changed files, all owned per waveB-build.md except src/lib/profile/resume-storage.ts (B3 repair; record it). No .only/.skip/debugger; console.log only in the local script and tagged server logs.

**leftForOthers, done or not.**
- B1 -> orchestrator: admin browser walk as avery (a-d), 375 + 1280. NOT DONE (pending walk).
- B1 -> B3: delete-previous only avatar|banner, profiles only, root naming kept. DONE (profile-photo-replace.ts:46; storage-upload keeps `${userId}/${kind}-uuid`).
- B1 -> B2: club purge keeps image_remove meta.previous keys. DONE (clubKeysToKeep + test).
- B1 follow-up: users.current_on UPDATE grant. NOT DONE (recorded follow-up).
- B1 should-fix list (sweep namedElsewhere, restoreLogos by index, stale-panel token, report card closes all, org logo tile blur, empty-slot finish). NOT DONE (recorded in notes-B1).
- B2 -> B1: delete-account "What we keep" sentence for files kept under an open/actioned report. PARTLY: the :18 code comment is fixed; the page still says files are erased "except anything our moderators removed", which misses posts deleted under an open report and an avatar/cover kept under an open report. Fix in src/app/legal/delete-account/page.tsx ~:153 and the "Content our moderators removed" bullet ~:188: use B2's sentence (notes-B2 "Requests"). Franky/lawyer call on wording.
- B2 -> B4: 120000 must not pin posts_update_own. DONE (comment only).
- B2 -> cross-check: 110000's extra pins. DONE (rollback/re-apply clean).
- B2: admin restore of a removed club post whose club is gone. NOT DONE. content/remove meta has no org_id, so restore can't tell. Fix: remove route adds `org_id` to meta; restore route refuses (409, "This club was deleted, so the post can't be put back.") when the post's org_id is null and the removal meta names an org that no longer exists. 0 live today.
- B2 follow-ups (F4 direct PATCH of tags, purge in after(), officer Delete UI, hide Edit/Delete on removed posts, club chat R2 media). NOT DONE (recorded).
- B2 -> orchestrator walk (photo-post delete, 409s, 422 tag edit, hidden-club refusal). NOT DONE.
- B3 -> orchestrator: record resume-storage.ts ownership in waveB-build.md. NOT DONE.
- B3 walk (résumé JPEG desktop + phone, video hint, group cropper; avatar/cover prod-like only). NOT DONE.
- B3 follow-ups (old work/working-on logo not deleted, R2 EXIF, prod EXIF backfill needs Franky's yes). NOT DONE (recorded).
- B4 -> B2: reuse captionHashtags in PATCH. NOT DONE (the tags mismatch above).
- B4: RollingStrip.tsx:219 comment still says "1 post this week". NOT DONE (comment only; unowned file).
- B4: raise TRENDING_MIN_AUTHORS to 2 at launch. Recorded in waveB-build.md call 6 only; no separate launch checklist entry.
- B5: desktop gone post's comments box still invites a first comment (comments route 200 [] for a missing post). NOT DONE (follow-up). Not walked: can_approve=false Deny row, desktop settings Invites tab.
- B0: tag length 32 in SQL. DONE (^[a-z0-9_]{1,32}$).

**Open items for Franky.** B1 Q1 (48-hour legal wording vs CDN cache; cache fix before first real takedown), Q2 (R2 EXIF scheduling; privacy line names chats only), Q3 (sweep vs hotlinks), Q4 (image résumé can't be removed), Q5 (10-min restore retry window), Q6 (Log-tab Put back uses the first slot). B2: F2/S6 (officers can delete posts of a hidden club; recommend yes, one clause), F-B2-1 (blocked ex-officer's posts), orgs_delete left in place. Delete-account wording above.
