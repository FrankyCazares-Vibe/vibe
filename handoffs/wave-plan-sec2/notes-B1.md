# notes-B1 (image removal) — 2026-09-28

Scope (waveB-build.md B1 row + critique-B1 "Final recommended approach" + critique-Bcross):
- new src/app/api/admin/images/** (GET slots, POST remove, POST restore)
- src/app/admin/image-slots.tsx (new) + mounts in users/orgs/reports/log clients (+ org-logo preview fix)
- src/lib/moderation/media-quarantine.ts additive exports + tests
- src/lib/auth/require-platform-admin.ts + src/lib/moderation/actions.ts: ModerationAction union members only
- ALL legal/support copy (src/app/legal/**, src/app/support/page.tsx)
- migration 20260929100000_moderation_image_actions.sql (before deploy)
- imports ownProfileImageKey from B0; media-quarantine-store.ts read-only.

## Progress
- read plan.md, waveA-build.md, plan-waveB.md, waveB-build.md, critique-B1.md, critique-Bcross.md, notes-B0.md + profile-image-key.ts
- LIVE (read-only MCP 2026-09-28): latest migration 20260928160000; moderation_actions_action_check fp b413bf4c519a9eef8fb6c4c1717e0516, target_type fp dbb1ba407960c58e045f56391b5262fa, reason fp 311a4b55...; rows user_lift 1, user_suspend 1; RLS on, 0 policies, 1 trigger (append-only); anon/authenticated no INSERT. LOCAL identical fps; local rows post_remove 1, user_suspend 1, user_lift 1.
- code read: media-quarantine.ts/-store.ts, content/remove route, restrict guards, require-platform-admin (logModerationAction returns bool only), admin-shell (dark-only COLORS), users/orgs/reports/log clients, r2.ts sign helpers, org-asset-url.ts.

## Decisions
- D1 planner goes in a NEW pure file `src/lib/moderation/media-quarantine-images.ts` (+ test), inside my `media-quarantine*.ts` glob. Deviation from critique-B1 §3 ("append to media-quarantine.ts, NO imports"): waveB-build says import B0's ownProfileImageKey, and media-quarantine.ts must stay import-free (its test loads it with no resolve hook). The new file imports `../media/profile-image-key` extensionless; its test copies B0's registerHooks resolver. media-quarantine.ts untouched.
- D2 admin UI stays on admin-shell COLORS (dark-only surface by design, critique-B1 §7); no student-facing screen changes, so no C0 tokens needed. Deviation from the generic "C0 tokens" line, per critique.
- WROTE + APPLIED LOCALLY supabase/migrations/20260929100000_moderation_image_actions.sql (ON_ERROR_STOP clean; POST-CHECK behaviour probe ran: image_remove/image_restore insert ok, image_bogus refused 23514, no probe row survives). New action CHECK fp e30d12ff2a5602dbddd78d9634efd09a, validated.
- PROBE rollback+reapply (one rolled-back txn): with an image_remove row present, header ROLLBACK (NOT VALID) succeeds, narrow def prints "... NOT VALID" and strip-md5 = b413bf4c... (so PRE-FLIGHT accepts it); a new image insert is refused 23514; old image row kept; re-running the file body validates and lands e30d12ff... again. Final state: applied, 0 image rows persisted.
- D3 PRE-FLIGHT strips a trailing ' NOT VALID' before the fingerprint so the cross-check's rollback + re-apply works.
- WROTE ModerationAction union members (image_remove, image_restore) in require-platform-admin.ts + actions.ts (additive, nothing else).
- WROTE src/lib/moderation/media-quarantine-images.ts (pure): IMAGE_SLOTS, labels, columns, notes (CACHE_NOTE, PRIVATE_CACHE_NOTE, UNFURL_NOTE, LEFT_NOTES), classifyImageRef/planImageRemoval (own via B0 ownProfileImageKey, acting on slot), sweepPaths, logos JSON helpers (collect/strip/restore/logoValueKey), readImageMeta, removalStep/restoreStep/latestPerSlot. tsc clean for it.
- D4 no compare-and-set for the logos JSON rewrite (read-modify-write with the service role): PostgREST jsonb equality filters are brittle and the race is a student editing experience in the same second. Column slots DO use CAS (.eq(col, seen)).
- D5 sweep takes every unused root avatar-/banner- copy in the student's folder (both kinds, whichever slot was removed); nothing a kept slot still shows.
- WROTE src/lib/moderation/media-quarantine-images.test.ts (14 tests: own/foreign/post/logos/traversal/R2/sweep/logos JSON/meta/removalStep/restoreStep/latestPerSlot). node --test: 14/14 pass.
- WROTE src/app/api/admin/images/_lib/target.ts (parse, service read of slot columns only, self/admin guard, slotValues/slotRefs, latestImageRow via meta @> {slots:[slot]}, openReportIds, closeReports) and _lib/apply.ts (clearSlots CAS / putBackSlots set-if-empty; logos read-modify-write touching only recorded URLs). `_lib` = Next private folder (not routed; checked node_modules/next/dist/docs project-structure).
- stripLogos gained optional `only` (additive; test added, 14/14 still).
- WROTE routes: GET src/app/api/admin/images/route.ts (slot state + previews: public own/foreign file = its URL, R2 = 120 s signed, removed = 120 s quarantine signed; outside addresses never loaded, returned as href), POST remove/route.ts (log FIRST; finish-on-retry; named open reports only; sweep older copies; CAS clear), POST restore/route.ts (log FIRST; finish; 409 replaced_since; set-if-empty; swept not put back). _lib/sweep.ts. tsc + eslint clean on all of them.
- D6 route-level reason validation copy: remove requires a reason ("Write why it's coming down first."); restore reason optional.
## Probes (local, rolled back; script scratchpad/probe-b1.sql)
- HTTP signed out (dev server :3000, not started by me): GET /api/admin/images, POST remove, POST restore -> 401 each (compile + gate). NO signed-in calls: a workflow subagent must not sign in or mint a session (A5b precedent); storage moves not exercised (need the service key). The orchestrator's walk should run the admin flow as avery (admin).
- P1 service_role: image_remove row (slots avatar+banner) inserts; the route's lookup `meta @> {"slots":["banner"]}` finds it (1), logos finds 0. PASS
- P2 CAS clear on users.avatar_url: 1 row, again 0. P3 set-if-empty: 1 row; over a new photo 0. PASS
- P5 orgs.logo_url: restoring an own-folder R2 key passes orgs_check_asset_refs; CAS clear 1 row. P6 channels.photo_url clear 1 row. P7 users work_experience/current_on JSON rewrite as service_role ok. PASS
- P4 authenticated: no UPDATE on users.avatar_url / orgs.logo_url / channels.photo_url, no INSERT on moderation_actions (has_*_privilege all f); a direct UPDATE of users and INSERT of an image_* row both 42501. PASS. After rollback: 0 image rows persisted.
- WROTE src/app/admin/image-slots.tsx (ImageSlots panel: per slot label/badges, blurred previews with Show/Blur, outside addresses as a deliberate link only, reason field, Take down / Put back, server notes shown inline; footer = cache note per kind + unfurl note + "nothing tells the student"). admin-shell COLORS only.
- MOUNTED: users-client UserCard "Photos" toggle; admin-orgs-client row "Photos" toggle + logo preview FIX via orgAssetProxyUrl (was url(orgs/...) relative, never loaded; body re-indented inside a block, cosmetic diff); reports-client "Photos" for user/org/channel cards with that card's report ids (open tab only) + onReportsClosed patch; the three "no takedown" lines rewritten; post Remove form gains the cache line (Bcross G8) and the answer prints left_online_note.
- tsc + eslint clean on src/app/admin/*.tsx.
- log-client: VERBS image_remove "took down a photo on" / image_restore "put back a photo on"; detailLine adds slot labels, "left where it was" count and swept count; image_remove rows get a Put back button (server decides; prints its sentence). tsc + eslint clean.
## Legal / support copy (B1 owns all of it)
- community: "The content is removed." bullet gains the single-photo sentence (profile photo or cover, profile logos, club logo/banner, group chat photo; can set a new one). effectiveDate Sept 27 -> Sept 28. 48-hour wording untouched; no cache wording on legal pages (waveB-build call 4).
- support: one paragraph under the intimate-image section: moderators can also take down profile photo/cover, profile logos, club logo/banner, group chat photo. effectiveDate -> Sept 28.
- privacy: (b) "Photo location" paragraph in §1; (a) retention sentence in §5. effectiveDate May 7 -> Sept 28.
- delete-account: "What we keep" bullet (a); "Your files" now says "except anything our moderators removed"; moderation-log bullet mentions a photo takedown keeps the handle; header comment records the B2 dependency + image_* meta. effectiveDate -> Sept 28.
- D7 DEVIATION on (b): waveB-build's line "When you upload a photo, we remove its location details" would be FALSE for chat photos (MessagesMobile PUTs the raw File to R2; R2 EXIF is out of scope this wave). Wrote "When you upload a photo to your profile or a post, we remove its location details before it's stored. Videos, and photos sent in chats, keep their original details, which can include where they were taken." True only with B3 deployed alongside (open question).
- tsc + eslint clean on legal/support.
- REFINE restoreStep: 409 replaced_since only when EVERY photo slot the removal names holds a new photo (a both-slots removal with only the cover replaced still puts the photo back; cover counted not_put_back). putBackSlots counts a column not put back only when it holds a different value (0 rows + same value = a finished retry). Test assertions added.
- GATES: npx tsc --noEmit -p . clean (whole project); npm test 1227/1228 (only the known parse-reminder failure); node --test media-quarantine-images.test.ts 14/14.
- Signed-out page loads on :3000: /legal/community, /legal/privacy, /support, /legal/delete-account 200 with the new sentences in the HTML; /admin 307 to login (expected). eslint clean on every file B1 touched.
- Peeked (read-only) at B2's storage-purge diff: it keeps quarantine/<uid>/** on self-delete, so the delete-account "except anything our moderators removed" line is consistent.

## Hand-offs (critique-B1 §12, Bcross)
- B2: keep ALL of quarantine/<uid>/** on self-delete (B1 quarantines avatar-*, banner-*, logos/* there, not only posts/posters) -- looks done. If club-delete media cleanup ever deletes R2 orgs/<orgId>/**, skip keys named in image_remove meta.previous (the R2 key IS the evidence for a removed club logo/banner). Today orgs DELETE purges no R2 logo/banner.
- B3: delete-previous only for ownProfileImageKey slot avatar|banner, from `profiles` only, never `quarantine`; keep the root `avatar-`/`banner-` naming (B1's sweep and planner rely on it).
- Orchestrator walk (B1 could not sign in): as avery (admin) on /admin at 375 + 1280: Users > Photos on a seeded student with an avatar in profiles/<uid>/avatar-*: Take down -> object in quarantine, column null, one image_remove row with meta.previous; press again -> no second row; Log tab Put back -> file back, column back, one image_restore row; Clubs > Photos (logo preview now loads via the asset proxy); a user/org report card > Photos closes exactly that card's reports. Don't load previews for R2 keys against a real bucket.

## Open questions for Franky
- Q1 (critique-B1 Q1, unchanged): legal pages still promise 48 hours while a removed PUBLIC photo can serve from the CDN for days; moderator panel says so; the cache fix is a must-do before the first real takedown.
- Q2 privacy (b) was narrowed to "profile or a post" because chat photos (R2, raw file) keep location data this wave; true only with B3 deployed together. Want chat-photo EXIF stripping (R2 path) scheduled?
- Q3 the sweep takes unused older photo/cover copies offline even if some OTHER account hotlinks one as its own avatar (0 live foreign avatars today). OK?
- Q4 an image résumé (1 live) is still not removable by any tool; the copy doesn't claim it.

## REPAIR round 1 (2026-09-28, after review-B1-breakage + review-B1-bypass)
Must-fix list (4 items, 3 distinct): R1 Put back acts on the newest takedown, not the row pressed (both reviewers); R2 a repeat takedown of a re-set club/chat key or foreign/outside address writes no log row; R3 an old image_restore can be "finished" at any age, unlogged.
- Read restore/remove routes, _lib/target, log-client PutBack, image-slots restore, planner + test. Panel shows Take down only when a photo is up; view.removed.actionId = newest image_remove id for the slot.
- FIX R2 (planner): ImageMeta gains `left` (readImageMeta parses meta.left, whole numbers >0, else 0). removalStep: a slot equal to meta.previous counts as untouched only when movedEverything(meta) = paths non-empty AND left post/other/foreign/external all 0; null still untouched. Remove route writes meta.left into its in-memory meta and reads the finish counts from readImageMeta (countsOf helper dropped).
- FIX R1 (planner): new pure isSameTakedown(latest, removalId): image_remove with that id, or image_restore whose meta.removal_id is it; null/other -> false.
- FIX R3 (planner): restoreStep(latest, current, now?) + RESTORE_FINISH_MS (10 min). With `now`, an image_restore row finishes only when created_at parses and now - at <= 10 min; else "nothing". Without `now` behaviour unchanged (additive signature).
- FIX R1 (route + UI): restore/route.ts parses optional removalId (400 "removalId must be a uuid" when present and not a uuid); after latestImageRow: none -> nothing; removalId given and !isSameTakedown(latest) -> 409 not_latest "A newer change to this photo came after this takedown, so nothing was put back. Open their Photos panel to see what's there now." log-client PutBack sends removalId: row.id (comment rewritten; prints not_put_back); image-slots restore sends removalId: view.removed.actionId (also covers two moderators at once).
- EXTRA (same class as R1): new pure scopeToLatestSlots(row, latestBySlot): a removal naming avatar+banner (one shared file) where one slot has a NEWER takedown is put back only in the other slot; the route reads latestImageRow per extra slot; skipped slots count in not_put_back. Without it, putting back R1 on the cover also filled the photo slot and hid R2's takedown from the panel (R2 undoable never again).
- FIX R3 (route): restoreStep(scoped, current, Date.now()): a restore older than 10 min answers 200 nothing (no re-release, no re-fill, no row).
- Copy: "Press Remove/Restore again" -> "Press Take down / Put back again" (the buttons' real names). Panel's not-put-back sentence gains "or a newer takedown covers it".
- TESTS: 5 new (readImageMeta left; Remove-again R2 key/chat/foreign/outside-logo -> new, own moved file -> finish, null -> finish; isSameTakedown incl. the reviewers' R1/A,R2/B sequence via latestPerSlot; restore window 1 min finish / 10 min finish / 10 min+1 ms nothing / days nothing / no time nothing / removal unaffected; scopeToLatestSlots). node --test media-quarantine-images.test.ts 19/19.
- PROBE (local, rolled back, service_role): R1 avatar+banner, R2 avatar, restore of R1 scoped to [banner] 20 min old: route lookup gives avatar -> R2 (still undoable), banner -> the restore (removal_id R1, stale=t -> nothing). 0 image rows after rollback.
- GATES: npx tsc --noEmit -p . exit 0; eslint clean on every file touched; npm test 1232/1233 (only the known parse-reminder failure).
- Migration 20260929100000 NOT changed this round (no rollback/re-apply needed); still applied locally, action CHECK fp e30d12ff validated, 0 image rows.
- Reviewers proved wrong: none. All four must-fix items accepted and fixed.
- Should-fix NOT done (recorded): sweep.ts skip files another row still shows (B3's namedElsewhere; 0 live); restoreLogos matches by array index only; stale-panel Take down acts on the current value (no expected-value token); a report card closes every listed report; delete-account wording misses B2/B3 open-report evidence; org logo tile unblurred; a removal "finish" with every slot already empty can still close named reports without a new row (panel never offers Take down on an empty slot).
- Note: a restore that 500s (media_still_quarantined) and is retried after 10 min now answers "nothing"; the file stays in quarantine (fails safe; the student can upload again).
- HTTP signed out after the repair (dev server :3000, not started by me): POST restore, POST remove, GET images -> 401 each (routes compile). Repair round 1 DONE.
