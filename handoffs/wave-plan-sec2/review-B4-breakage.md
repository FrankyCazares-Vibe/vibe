# Review B4 — breakage lens (reviewer, read-only) — 2026-09-28

Lens: does anything break? Callers of every changed route/export/policy; 500s; lost data; migration PRE-FLIGHT/POST-CHECK/ROLLBACK; tests; UI copy.

## Progress
- read plan.md, waveA-build.md, plan-waveB.md, waveB-build.md, critique-B4.md, notes-B4.md
- read diffs: trending route, publish-post, count-tags.ts, tags.ts (B0), token-filter.ts (B0), caption-tags.ts, migration (all 366 lines)
- posts writers (grep): publish-post (normalizePostTags, always valid), PATCH (extractPostTags, always valid ASCII <=10 dedupe <=32), orgs/[slug]/posts insert (no tags -> '{}'), orgs DELETE update org_id only, local-seed/seed-review scripts (valid tags). No writer produces a tag the trigger refuses.
- migration POST-CHECK §5c runs as the FIRST users row (order by created_at) and needs it to pass posts_update_own WITH CHECK (consent + can_publish_now). Prod read-only (booleans only): first user = Franky, terms+age+verified+system set, not restricted -> probe will pass in prod. Fragile but OK today.
- B2 migration 20260929110000 touches posts policies only (not tags, not posts_stamp_edited): B4's md5 pin holds after B2.
- trending route: authenticated-only; SELECT on posts tags/user_id/status/removed_at/created_at/type granted (local + prod). Only consumer of `count` is RollingStrip (tagChipTitle); strip-data.ts shape unchanged.
- onboarding-complete callers: OnboardingMobile.tsx:716,811 + onboarding.html:3786,3934, all v:2. No other caller in src/public/mobile/scripts. requireNotRestricted = same Terms 403 + fail-closed restriction read.
- onboarding-step: 422 content_blocked -> failure-copy/_persistence.js 422 branch gives the plain line; onboarding clients toast it (profileFieldForCode has no content_blocked; no focus, acceptable).
- GATES (reviewer re-run): node --test B4 + neighbours 162/162; tsc clean; npm test 1227/1228 (only known parse-reminder).
- NEXT: migration probes on local DB inside ROLLBACK txns (ROLLBACK text, re-apply idempotence, PATCH-path, PostgREST error mapping).
- LOCAL (rolled back): header ROLLBACK restores stamp md5 f3a2e0e0...; re-apply of the file body in the same txn passes every DO block; final state untouched (38da087b..., trigger 1).
- LOCAL (rolled back) as blake: publish-post-shaped insert ok; PATCH-shaped content+tags update ok + edited_at; same-tags rewrite ok; direct bad tags -> 23514 tags_invalid.
- PROD read-only now: stamp md5 f3a2e0e0..., ACL {postgres=X,service_role=X}, 23 posts, 0 violators, names free, max mig 20260928160000 -> PRE-FLIGHT will pass. Only risk: old publish-post stores a desktop Unicode tag before the deploy -> PRE-FLIGHT aborts (fails closed; re-count just before apply).
- No other posts.tags writer (grep src/public/scripts): orgs posts insert no tags; seeds valid; no service-role tag rewrite, so the new "Edited on tags change" stamp can't fire unexpectedly.
- Perf: worst-case caption (263 tags) filter 3 ms; trending 5000 distinct tags 15 ms.

## Verdict: SHIP (no must-fix)
Nothing 500s, loses data or deletes files. Every posts.tags writer emits tags the trigger accepts; the route never allows what the trigger refuses. AFTER-deploy order is right (old publish-post keeps Unicode tags). ROLLBACK tested, restores md5, works regardless of rows. Tests + tsc + eslint clean.

## Should-fix / notes
1. Re-run the violator count right before the apply: until the deploy is live, the OLD publish-post can store a desktop "#café"; PRE-FLIGHT then aborts (fails closed, but it's a surprise at apply time).
2. POST-CHECK §5c probes as the first users row by created_at and needs it to pass posts_update_own WITH CHECK (consent + can_publish_now). Prod = Franky, passes today; pick the probe user by that predicate to make it robust.
3. Onboarding name filter: 2 of 12 sampled real surnames trip checkText (indexes only, no terms here). Before B4 they saved at onboarding; now Finish is blocked until the name changes. Same rule as the profile editor + product call 6, but Franky should know (option: skip `name` at onboarding).
4. Desktop composer (profile.html _extractHashtags, not B4's file): still takes Unicode tags inside its cap of 10, so a "#café" costs a later ASCII tag, and the local card shows chips that weren't stored.
5. PATCH (B2) filters extractPostTags (ASCII, first 10), not captionHashtags: edit is looser than publish. B2 can reuse captionHashtags.
6. Onboarding clients show content_blocked as a toast; profileFieldForCode has no content_blocked, so no focus. Small client follow-up.
7. Comments only: RollingStrip.tsx:219 says "1 post this week"; CampusMobile.tsx:1185 normalizeFeedTag still Unicode.
DONE.
