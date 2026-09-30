# Review B2 (post + club deletes) — breakage lens

Reviewer, 2026-09-28. Read-only. Lens: does anything break (callers, 500s, silent loss, wrong file deleted, route vs policy, migration PRE/POST/ROLLBACK, tests, UI).

## Progress
- read plan.md, waveA-build.md, plan-waveB.md, waveB-build.md, critique-B2.md, notes-B2.md, critique-Bcross B2 lines
- read migration 110000 (422 lines), route diffs (posts/[id], orgs/[slug]), delete-media.ts, delete-media-store.ts, storage-purge diff, r2 diff
- checked: quarantineProfilesObjects treats a missing source as alreadyGone (not failed) -> account delete won't throw on already-quarantined evidence. OK
- checked: extractPostTags output ([a-z0-9_]{1,32}, <=10, dedup) passes B4's CHECK; B4 120000 doesn't pin posts_update_own. OK
- checked: EDIT_AS_ORG_ROLES = owner/admin = policy; requireNotRestricted -> NextResponse|null. OK
- checked: reports has target_owner_id/target_snapshot; status open|actioned|dismissed; POST snapshot carries user_id+media cols. OK
- checked: all FKs into orgs/posts cascade chain are CASCADE/SET NULL (no NO ACTION) and no net/http triggers -> POST-CHECK probe h (deletes the visible club in a rolled-back subtxn) can't abort on prod. OK
- checked: orgs.owner_id is SET NULL, so account delete never deletes a club. OK
- SUSPECT F1: orgs_delete policy `(auth.uid() = owner_id) AND NOT is_restricted_now()` + authenticated DELETE grant on orgs: an owner can DELETE /rest/v1/orgs directly, skipping the route's hidden refusal AND the detach. With CASCADE (new) that erases moderator-removed club posts. Probing locally (rolled back).
- CONFIRMED F1 (local, rolled back): as blake (owner, authenticated) `delete from orgs where id=<test_request_club>` -> DELETE 1 and a moderator-removed club post went with it (CASCADE); as avery `delete from orgs where id=<test_hidden_club>` -> DELETE 1 (hidden club deleted). Route's detach + hidden refusal are bypassed via PostgREST. Pre-B2 (SET NULL) the removed post survived, so the CASCADE opens this. No cookie-client/public html writer deletes orgs (only the service-role route) -> fix: revoke DELETE on orgs from authenticated in 110000 (+ ROLLBACK re-grant, POST-CHECK 42501), or a BEFORE DELETE trigger that detaches removed posts + refuses hidden.
- checked: org_content_visible = hidden_at null -> visible to all signed-in; SAE (non-public, not hidden) works for probes c/e on prod. OK
- gates re-run: node --test delete-media.test.ts 10/10; tsc clean; npm test 1227/1228 (known parse-reminder only)
- checked: postgrest-js 2.105.1 maybeSingle is client-side (0 rows -> null, no error) so PATCH 0-row -> 404 works; 409 sentences pass failure-copy isHumanSentence (PostViewerMobile/ProfileMobile toast), _postViewer.js shows j.error raw; campus-home prompt already says "its chats, its posts and its events" (B3)
- checked: no cookie-client/public-html writer UPDATEs or DELETEs posts besides posts/[id] (admin remove/restore are service role); every media column in public is covered by keepRefs/others/orphan counter
- checked: B1 logs club image actions target_type 'org' with keys in meta -> clubKeysToKeep holds them
- SUSPECT F2: POST-CHECK probe b (author edits own live post) runs as v_other = first-created user_visible non-member; posts_update_own WITH CHECK needs has_recorded_consent() + can_publish_now() (terms+age+school_verified). An unverified/no-terms v_other -> UPDATE raises 42501 "new row violates RLS", not 0 rows -> re-raised -> whole migration aborts at apply on prod (6/20 prod accounts unverified). Local picked a verified user so it passed. Probing.
- CONFIRMED mechanism F2 (local, rolled back): drew_new (unverified) editing own live post -> "new row violates row-level security policy" 42501, so probe b would re-raise and abort the apply. PROD today (read-only MCP, counts only): owner found 1, probe user found 1, probe user can publish 1 -> probe b passes today. Downgraded to shouldFix (data-dependent fragility).

## Verdict: fix-first (one must-fix)

MUST FIX
1. F1 — supabase/migrations/20260929110000_post_club_deletes.sql. The CASCADE makes the direct PostgREST path `DELETE /rest/v1/orgs?id=eq.<id>` (orgs_delete policy + authenticated DELETE grant) erase moderator-removed club posts and delete hidden clubs, skipping the route's detach and "You can't delete this club right now." (proved locally as blake and avery, rolled back). Only the service-role route deletes orgs. Fix in this file: `revoke delete on public.orgs from authenticated;` (table privilege, not EXECUTE; ruling-17 pattern). PRE-FLIGHT: assert has_table_privilege('authenticated','public.orgs','DELETE') is true today. POST-CHECK probe: as v_owner, `delete from public.orgs where id = v_org` must raise 42501 (catch insufficient_privilege). ROLLBACK: `grant delete on public.orgs to authenticated;`. Fix the header's "Change any grant" line. Apply order unchanged (after). Optional belt-and-braces: a BEFORE DELETE trigger on orgs that detaches removed posts (also closes the read->delete race, S2).

SHOULD FIX
S1 probe b's v_other must be able to publish (add school_verified + terms_accepted_at + age_attested_at to its selection) or data can abort the apply.
S2 orgs DELETE: run the detach unconditionally (drop the removedPosts.length guard) so a removal landing after the read is still detached.
S3 purgeDeletedClubMedia runs ~5 round trips per media post inside the request after the club is already gone; a big club can time out and show an error for a finished delete. Use next/server after() (0 club posts live today).
S4 B1 legal: delete-account "What we keep" doesn't cover files kept because a report was open/actioned (post deleted under report, reported avatar/cover). Fold B2's sentence.
S5 Follow-up: admin restore of a detached removed club post republishes club words as a personal post whose orgs/<deleted>/posts/ media no longer serves; restore should refuse when the club is gone.
S6 Product: officers of a HIDDEN club can still delete its posts one by one (route and policy agree) while the whole-club delete is refused as "under review".
