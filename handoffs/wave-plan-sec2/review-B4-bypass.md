# Review B4 (tags + Trending + onboarding) — bypass lens ("does it close the gap?")

Reviewer, read-only. Local DB probes in ROLLBACK transactions only. No repo edits.

## Progress
- read plan.md, waveA-build.md, plan-waveB.md, waveB-build.md, critique-B4.md, notes-B4.md
- read code: tags.ts, token-filter.ts, caption-tags.ts, count-tags.ts, trending route, publish-post diff, onboarding-complete (full), onboarding-step diff, handle-change.ts, finish.ts, profile-filter.ts, migration 20260929120000 (header, rule, trigger, stamp).
- otto_answers writers: ONLY onboarding-complete finishV2 (ottoAnswersForFinish never returns {}). Legacy branch gone -> no path empties otto_answers -> handleClaimPolicy free claim + campusChangeDecision "not onboarded" can't be re-entered. Lock resets CLOSED (code read).
- posts.tags writers: publish-post (normalizePostTags), PATCH posts/[id] (extractPostTags: ASCII, dedup after lower, <=10, <=32 -> always passes post_tags_ok), orgs/[slug]/posts (no tags -> default '{}'). Desktop profile.html sends Unicode tags to publish-post -> normalizePostTags drops them. No route can hand the trigger a refusable array.
- posts_insert_authenticated WITH CHECK has can_publish_now(): sock-puppet Trending boost needs verified accounts (accepted).
- DB probes (local, BEGIN..ROLLBACK, as blake 6979e030 authenticated): direct INSERT {a,a} / {{a},{b}} / NULL -> 23514 tags_invalid; tags-only UPDATE own published post -> edited_at set; UPDATE {Upper} -> 23514; UPDATE own REMOVED post -> 0 rows (policy); UPDATE casey's post -> 0 rows; direct edited_at/created_at write -> permission denied (no column grant).
- Regex under ICU: exactly 37 code points match [a-z0-9_] (whole Unicode scanned); 'a\n', '\na', '' refused; 11 elems with [0:10] bounds refused; [2:3]={a,b} ok (harmless).
- Catalog: trigger BEFORE INSERT OR UPDATE OF tags present; stamp md5 38da087b...; post_tags_ok IMMUTABLE, search_path "", EXECUTE anon/auth/service.
- No SQL function writes posts.tags; other migrations' sentinel inserts carry no tags.
- node --test B4 files + finish.test: 55/55. tsc clean.
- Lock-clock writers (handle_changed_at / campus_set_at / otto_answers) in code + SQL: only handle-change (free claim needs empty otto_answers), finish v2 (stamps only when null), onboarding-step campus (45-day rule when onboarded), profile-campus-write. No SQL function writes them. Reset path CLOSED.
- onboarding-step profile step: requireNotRestricted (same gate as PATCH /api/me/profile + profile-sync); checkToken(handle) + blockedProfileField(name,bio,major,department,interests,skills) BEFORE the claim; looking_for is an enum. D2 (keep own stored handle) mirrors the profile filter; safe (read only on a trip; unreadable -> filter stays on).
- PROD read-only (counts only): 23 posts, 0 violators, stamp md5 still f3a2e0e0...; oldest users row (the POST-CHECK's probe author) is verified + terms + age + unrestricted today (9 users can publish), so part c's authenticated UPDATE passes WITH CHECK today.
- Product calls (waveB-build call 6) implemented as written: a-z0-9_ / <=10 / no dups; word filter at publish (B4) and edit (B2 PATCH via firstBlockedTag); Trending = people; floor 1 in count-tags.ts; chip "N people this week"/"1 person this week"; legacy finish deleted; both onboarding routes gated + filtered.

## Verdict: SHIP (no must-fix)
Every B4 item closes its gap at the database and at the routes: direct PostgREST tag writes are refused by shape (trigger, all roles); Trending re-checks shape + word filter at count time and counts people; publish filters stored + caption tags (underscore-glued caught); the legacy finish path that emptied otto_answers is gone and no other writer can empty it; both onboarding routes are gated and filtered.

## Should fix (non-blocking)
1. Migration POST-CHECK part c uses the OLDEST users row as the author and expects its authenticated UPDATE to pass posts_update_own WITH CHECK (has_recorded_consent + can_publish_now). True on prod today (count read), but if that account is ever unverified/restricted the post-deploy apply aborts with 42501. Select the probe author with `u.school_verified and u.terms_accepted_at is not null and u.age_attested_at is not null and public.user_visible(u.id)`; notice+skip when none.
2. Trending: newest-first 500-row cap + floor 1 means one verified student who direct-inserts ~500 tagged posts (no DB insert rate limit; the route limiter is skipped) owns the strip (code-point ties let "0..." lead). Visible spam, removable; longer term aggregate count(distinct user_id) per tag in SQL over the whole window, and raise the floor to 2 at launch as planned.
3. B2 parity (B2's file): PATCH filters extractPostTags(content) only (ASCII, first 10), so an edit adding an 11th "#<term>_x" or "#café_<term>" passes where publish refuses. Reuse captionHashtags in src/app/api/posts/[id]/route.ts. Stored tags/Trending unaffected.
4. PRE-FLIGHT pins 0 violators; old publish-post (live until deploy) still stores desktop Unicode tags ("café"), so one desktop post before the apply aborts it. Re-run the count just before apply; header should name the remedy (separate _cleanup.sql for Franky's yes).
5. Stale comments (not B4's files): finish.ts header "Bodies WITHOUT v keep the legacy behaviour", onboarding-prefill.ts:191, RollingStrip.tsx:219 "1 post this week".
6. Reminder (recorded follow-up): /api/me/handle and PATCH /api/me/profile handle branch have no checkToken, so the onboarding-step handle filter can be sidestepped there.
DONE.
