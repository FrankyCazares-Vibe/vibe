# Review B1 (image removal) — breakage lens

Reviewer: read-only. Lens: does anything break (callers, 500s, lost data, wrong deletes, migration, tests, UI).

## Progress
- Read plan.md, waveA-build.md, plan-waveB.md, waveB-build.md, critique-B1.md, notes-B1.md.
- Migration: local constraint = e30d12ff (validated), rows post_remove/user_lift/user_suspend only. Reason CHECK is length<=2000 only; actor_id nullable; no FK. Sibling 20260929110000/120000 don't touch moderation_actions.
- PROBE (one rolled-back txn): insert image_remove row -> header ROLLBACK (NOT VALID) ok, stripped md5 = b413bf4c -> re-run body (PRE-FLIGHT, ADD validates incl. image row, POST-CHECK) ok -> e30d12ff validated. After ROLLBACK 0 probe rows. Migration PASS; before-deploy claim right.
- Read planner, B0 key, _lib/target|apply|sweep, remove/restore/GET routes, media-quarantine-store (moves idempotent; alreadyGone via exists()), r2 sign helpers (assert prefixes), B2 club sweep keeps keys named in moderation_actions meta for the org (B1 previous.logo/banner are kept). B3 upload writes the file before the client PATCHes the column (sweep race window only; negligible).
- FINDING F1 (mustFix): log-client PutBack posts {targetType,targetId,slot} with NO row id; restore route acts on the NEWEST image row for the slot. Put back on an older image_remove row (R1: photo P removed; student sets Q; R2: Q removed) restores Q (R2's photo) and answers "Put back." -> the later, abusive photo goes back online while the moderator meant P. Fix: send removalId=row.id; restore route 409 when latest is not that removal (or a restore of it).
- GATES re-run by me: node --test media-quarantine-images.test.ts 14/14; tsc clean; npm test 1227/1228 (only parse-reminder). Shared libs: union-only diffs in require-platform-admin.ts + actions.ts; media-quarantine.ts / -store.ts untouched. No public/html or mobile caller of /api/admin/*. Readers of moderation_actions (admin/actions, users/[id], B2 club sweep) tolerate image rows.
- Columns nulled are already nullable/handled (16 null avatars live); logos JSON null handled by work-experience.ts/current-on.ts. post_media_ref_ok pins posts to posts/|posters/ so the sweep can't hit a post file.
- B3 me/profile now refuses a non-own or missing avatar/banner file: a stale client re-sending the taken-down URL gets 400 "Invalid avatar_url" (B3 surface; acceptable, it refuses re-setting a removed photo).
- shouldFix candidates: restoreLogos puts a logo back by array INDEX only (entry deleted/reordered since -> logo lands on a different entry); sweep ignores other rows naming the file (orgs.logo_url https legacy, pre-B3 foreign avatars; 0 live); delete-account "except anything our moderators removed" misses B2/B3 open-report evidence also kept.
- FINDING F2 (mustFix, narrower): restore "finish" (latest row = image_restore) re-releases meta.paths and set-if-empty's the column with NO log row, at any age. Log tab keeps Put back on every old image_remove row. Sequence: R1 removal -> restore done -> student clears their photo while a report is open (B3 retireProfilePhotos moves P into quarantine as evidence) -> moderator presses the stale Put back on R1 -> P is moved back out of quarantine to the public bucket and set as their photo again, unlogged, "Finished putting it back." Fix: finish a restore only while it is fresh (e.g. image_restore row < 10 min old) else answer nothing; F1's removalId check alone doesn't cover it.
- Sweep (sweep.ts) doesn't skip files another row still shows; B3's retire has namedElsewhere() for exactly this (users avatar/banner of other ids, orgs logo/banner). 0 live -> shouldFix.
- UI: admin root paints its own dark gradient + COLORS.text, so Light/Night both read; .adm-actions stacks at <=375; previews 72px + button fit; textarea width 100%. Copy plain, no block named. Outside addresses never loaded, href only for http(s).

## Verdict: fix-first
mustFix
1. log-client.tsx PutBack + restore/route.ts: Put back on an older image_remove row restores the NEWEST removal's photo (wrong photo back online). Send removalId (row.id; panel sends view.removed.actionId); route 409 `not_latest` unless latest is that removal, or an image_restore whose meta.removal_id is it.
2. restore/route.ts finish path: an old completed restore can be "finished" again from the Log tab at any age, unlogged, pulling a B3 open-report evidence file out of quarantine and re-setting a photo the student cleared (or setting a dead URL). Only finish when the image_restore row is recent (e.g. < 10 min); otherwise answer nothing.
shouldFix
- sweep.ts: skip paths another row still shows (copy B3's namedElsewhere check: other users' avatar/banner, orgs logo/banner). 0 live.
- restoreLogos: match the entry (title/company or text) not just the array index, or count it not_put_back.
- delete-account "Your files ... except anything our moderators removed" + "What we keep": B2/B3 also keep files under an open report (reported posts, replaced avatar/cover). Say so (Franky/lawyer call; wording was dictated).
- admin-orgs-client logo tile is unblurred (now that it loads); a reported logo shows at 44px. Consider blur for hidden/reported clubs.
