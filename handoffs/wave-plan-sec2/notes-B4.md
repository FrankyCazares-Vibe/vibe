# notes-B4 (tags + Trending + onboarding) — 2026-09-28

Scope (waveB-build.md B4 row + critique-B4 Final approach):
- src/app/api/trending/hashtags/route.ts, src/app/api/me/publish-post/route.ts,
  src/app/api/me/onboarding-complete/route.ts, src/app/api/me/onboarding-step/route.ts
- new src/lib/trending/count-tags.ts (+test)
- src/components/campus/rolling-strip-view.ts tagChipTitle (+ its test)
- migration supabase/migrations/20260929120000_post_tags_rules.sql (AFTER deploy)
Imports B0 contracts (tags.ts, token-filter.ts), never edits them.

## Rulings that override critique-B4
- waveB-build call 6: TRENDING_MIN_AUTHORS = 1 (critique said 2); chip says "N people this week" (critique said "N people posted this week").
- B0 D1: tag length 32 (not 30) -> SQL '^[a-z0-9_]{1,32}$'.
- Migration file name per task: 20260929120000_post_tags_rules.sql.

## Progress
- read plan.md, waveA-build.md, plan-waveB.md, waveB-build.md, critique-B4, Bcross B4 lines, notes-B0, tags.ts, token-filter.ts
- code read: trending route (select tags only, no status/removed filter, no order, per-element count), publish-post (normalizeTags \p{L}\p{N}, no tag word filter), onboarding-complete (legacy branch can write {} otto_answers -> resets campus lock + handle cooldown), onboarding-step (profile step: no word filter, no handle token filter), handle-change (free claim only while otto_answers empty -> closing legacy closes both resets), tagChipTitle ("N posts this week"; RollingStrip only renderer).
- LIVE STATE (read-only MCP 2026-09-28): posts_stamp_edited md5 f3a2e0e0e4e2dac652529abcecc8eb7c, ACL postgres+service_role; posts triggers bump_org_activity_on_post, posts_check_media_refs, posts_stamp_campus, posts_stamp_edited; 23 posts, 4 tagged, 0 violators of ^[a-z0-9_]{1,32}$/<=10/no dup/no null/1-dim; post_tags_ok + posts_check_tags absent; authenticated INSERT+UPDATE(tags) true; tags text[] NOT NULL default '{}'; schema_migrations max 20260928160000; PG 17.6. Local: same md5, 9 posts (3 tagged).
- WROTE src/lib/trending/count-tags.ts (+test 9/9 pass): distinct authors per tag, grammar + firstBlockedTag at count time (memoized), floor TRENDING_MIN_AUTHORS=1 exported there (one place to raise at launch), code-point tie order (locale-independent; old route used localeCompare).
- trending route: select tags,user_id; + status=published, removed_at null, order created_at desc before limit; countTrendingTags(TRENDING_MIN_AUTHORS). Shape unchanged.
- tagChipTitle -> "N people this week" / "1 person this week" (waveB call 6 wording); test updated, 10/10. RollingStrip.tsx:219 comment still says "1 post this week" (comment only, not mine; harmless).
- DEVIATION D1: publish-post tag word filter runs over normalizePostTags(body.tags) + NEW captionHashtags(content) (src/lib/posts/caption-tags.ts + test 4/4) instead of extractPostTags(content): extractPostTags is ASCII + first 10 only, so "#café_<term>" or an 11th caption tag would skip the tag filter. Superset of the critique's union. B2 may reuse it for PATCH (optional).
- publish-post: removed MAX_TAGS/MAX_TAG_LEN/TAG_RE/normalizeTags; 422 content_blocked field "content".
- migration design: post_tags_ok uses CASE (array_position errors on multi-dim arrays; CASE orders the guards); trigger checks on INSERT or when tags CHANGE (new writes only, media-refs pattern); no REVOKE on the trigger fn (rule), default ACL grants X, harmless (trigger fns can't be called directly).
- MIGRATION 20260929120000_post_tags_rules.sql written (366 lines: header, PRE-FLIGHT catalog, post_tags_ok, PRE-FLIGHT rows via the rule, trigger, stamp restated, POST-CHECK catalog+truth table, POST-CHECK behaviour w/ sentinel subtransactions). Applied locally: all DO blocks pass.
- Mutation tests of the POST-CHECK (rolled back): drop trigger -> "only 0 of 10 bad tag arrays were refused"; old stamp text -> "tags-only edit ... left no edited_at". Baseline passes.
- ROLLBACK from the header run locally: posts_stamp_edited md5 back to f3a2e0e0e4e2dac652529abcecc8eb7c, function+trigger gone; re-applied; left APPLIED. New posts_stamp_edited md5 = 38da087bb96ebb856cb027f305ecbe45 (for the cross-check).
- LOCAL PROBES (rolled back) as blake_iu 6979e030 (authenticated + jwt claims): direct INSERT {campus_life,iu_2026} ok; 11 tags / {Foo} / {"#a"} / {a,a} / {café} / 5000-char tag -> 23514 tags_invalid; tags-only UPDATE of own published post -> edited_at set; UPDATE {UPPER} -> 23514.
- As postgres with the trigger disabled for one legacy-shaped row {Legacy,Legacy}: removed_at update ok, caption edit ok (tags untouched, not re-checked), tags change refused. service_role: {A} refused, {ok} ok.
- onboarding-complete: requireTermsAccepted -> requireNotRestricted (same Terms 403 + DB restriction check); legacy branch DELETED (finishLegacy, LEGACY_*); no v:2 -> 400 {code:"update_required", error:"Refresh the page to finish setting up."}; Body.profile dropped; docblock rewritten. Verified callers: OnboardingMobile.tsx:716,811 + onboarding.html:3786,3934 send v:2; /onboarding/classic serves onboarding.html. Lib exports legacyCampusPatch/sanitizeOnboardingProfile left in place.
- onboarding-step (added to B4's owns per critique-B4 §5/§9 + waveB call 6): requireNotRestricted; profile step runs checkToken(handle) (unless it's the handle already stored: read only on a trip) and blockedProfileField(patch) BEFORE the handle claim -> 422 content_blocked field handle / name / bio / interests[i]...
- DEVIATION D2: the handle check allows the student's current handle (critique's plain checkToken would lock a replaying student whose handle trips a later list entry out of the step; mirrors blockedProfileField's "unchanged is allowed").
- tsc clean (whole project, at this moment).
- GATES: node --test on B4 + neighbouring tests (count-tags, caption-tags, tags, token-filter, rolling-strip-view, viewing-campus, campus-request, self-write-columns, onboarding-prefill, onboarding/*, profile-filter): 210/210. npm test 1227/1228 (only known parse-reminder). tsc clean. eslint clean on the 10 B4 files.
- NEXT: HTTP probes on localhost:3000 (if dev server up) for trending / publish-post / onboarding routes.
- HTTP PROBES (localhost:3000 dev server, local seed sessions via scripts/local-seed.mjs test password; cookies in scratchpad, deleted after):
  H1 blake publish "#Campus_Life" tags [#Campus_Life, campus_life, café, ½, 33x, ok_2] -> 200, stored [campus_life, ok_2].
  H2a caption "#<term>_lol" tags [] -> 422 content_blocked/content (checkText alone passes it). H2b clean caption, body tag lol_<term> -> 422. H2c 11th caption tag glued -> 422. H2d desktop "#café_<term>" -> 422.
  T trending: blake 2 posts #campus_life -> count 1; + avery -> 2 (people). blake's own draft (#mydraft_b4) and removed (#removed_b4) posts NOT in his strip. A grammar-valid filtered tag stored directly by 2 authors -> never shown. Blocks still apply (blake doesn't see casey's #careerfair; avery does).
  O1 onboarding-complete {otto_answers:{}} (no v) -> 400 update_required; v:1 -> 400. O2 step blocked bio -> 422 field bio; O3 glued handle -> 422 field handle; O4 blocked interest -> 422 field interests[1]; blake's row byte-identical after (handle, name, bio, interests, otto_answers md5, handle_changed_at, campus_set_at). Clean step with his stored values -> 200, row unchanged.
  R temp DB-only suspension on blake (app_metadata untouched, so the proxy lets it through): onboarding-complete v:2 and onboarding-step -> 403 account_restricted (the new DB gate). Row deleted after (restrictions back to 2).
  Cleanup: 7 "b4 probe%" posts deleted locally; local posts back to 9.
- Browser walk NOT done by B4: the only UI change is the tag chip's title/aria-label text ("N people this week"); leave to the wave walk (hover a tag chip on desktop /campus; VoiceOver name on phone).
- FINAL: migration still applied locally (post_tags_ok present, trigger 1, stamp md5 38da087b...). tsc clean project-wide at finish.
- LEFT FOR OTHERS: B2 may reuse captionHashtags for the PATCH caption tag filter (optional; extractPostTags output is already grammar-valid). RollingStrip.tsx:219 comment still says "1 post this week" (comment only). Launch checklist: raise TRENDING_MIN_AUTHORS (src/lib/trending/count-tags.ts) to 2.
- Follow-ups (not B4, per critique-B4 §11): /api/me/handle handle word filter via checkToken; revoke direct UPDATE on users.department/current_on/resume_docs/website; look-alike-letter fold; posts_check_tags pairs with a "tags must appear in the caption" rule only if Trending abuse shows up.
DONE.
