# Review B3 (uploads) — breakage lens

Reviewer, read-only. Lens: does anything break (500, lost data, deleting a file that should stay, route vs policy, callers, tests, UI Light/Night 375).

## Progress
- read plan.md, waveA-build.md, plan-waveB.md, waveB-build.md, critique-B3.md, notes-B3.md
- read code: strip-image.ts, profile-image-key.ts (B0), profile-photo-replace.ts, profile-photo-retire.ts, copy.ts; diffs of profile-upload, storage-upload, me/profile, profile-sync, clip-upload-url, PostComposerMobile, campus-home, messages.html
- callers checked: /api/me/profile PATCH (avatar-upload.ts, onboarding.html send a fresh upload URL; Settings + CampusConfirmBanner send campus only); profile-sync (ProfileMobile sends fresh upload URL; desktop sends avatar/banner only when edited, as data: URL); clip-upload-url (both composers show sig.error, same string publish-post would have given)
- --ink-muted defined in light (#8A8580) and dark (#9C958C) in globals.css: OK
- gates re-run: node --test src/lib/media/*.test.ts 23/23; tsc clean; npm test 1227/1228 (only parse-reminder, known)
- count script: local-only gate (supabase status, host 127.0.0.1/localhost), no .env read, counts only: OK
- messages.html cropper: API matches _imageCropper.js (shape, onError, Blob|null); raw never uploaded; cropper modal white in Night = pre-existing (wave 5)
- composer hints: column flex (phone) / own line (desktop), var(--ink-muted) both themes: OK at 375 by reading
- probes (scratchpad, sharp only, no repo/db writes): 12MP orient-6 JPEG -> 1536x2048 130ms / null edge 58ms; animated GIF 3 frames resized per frame (100x40 x3); CMYK JPEG ok; 16-bit PNG ok; JPEG + trailing bytes ok; JPEG missing EOI ok; JPEG cut to 90% -> refused "type" (failOn default 'warning')
- group-photo-upload-url allows image/jpeg: cropped blob accepted
- B1 privacy sentence is scoped ("profile or a post"; videos + chat photos keep details)

## Findings
F1 (defect, privacy promise false on a live path): desktop résumé IMAGES go profile.html handleResumeUpload -> data: URL -> profile-sync resolveResumeUrlInput -> resume-storage.ts uploadResumeDataUrl -> stored RAW (EXIF/GPS kept) and /api/resume serves the original to verified viewers when there are no bars. B1's privacy line now says photos uploaded "to your profile" lose location. Phone résumé (profile-upload kind=resume) IS stripped. Fix: in uploadResumeDataUrl, for contentType !== application/pdf run stripImage(buf,{maxEdge:null}); refuse (null) on !ok or type not in MIME_EXT; upload out.bytes with out.contentType. resume-storage.ts is unowned: orchestrator assigns (B3 repair).

## Checked, no defect (breakage lens)
- Retire can't take a file it should keep: only own avatar-/banner- slots (B0 parser), only paths the re-read row names in neither column (substring = err toward keeping), skips paths another users/orgs row shows, fails closed (read error -> keep); open user report or report-read error -> quarantine, never deletes from quarantine. Post media can't be an avatar- file (post_media_ref_ok). channels.photo_url is R2-only.
- B1 interplay: B1 remove + concurrent student replace -> remove() on an already-moved path is a no-op; B1 restore answers 409 when the column changed; B3-quarantined files are outside B1's log. B2 self-delete keeps quarantine.
- Callers never re-send an unchanged or legacy avatar/banner value: phone + onboarding send a fresh upload URL; desktop sends avatar/banner only when edited, as data: (strip thumbnails stay data:); bootstrap doesn't decorate URLs. So the stricter own-file rule can't 400 an ordinary profile save.
- Error strings unchanged ("Unsupported file type"/"Invalid file size"/"Upload failed"); 403 bodies readable in both composers + legacy toast.
- Buckets: outputs within profiles/resumes MIME + 8 MB limits; quarantine unrestricted.
- No migration; no dependency on 20260929* files. B2's CASCADE is "after deploy" but live club posts = 0, so the new delete prompt can't mislead today.
- campus-home diff = only B3's 3 hunks; profile.html untouched.

## Should fix / follow-ups
- failOn default 'warning' refuses slightly corrupt phone JPEGs (probe: 90%-truncated -> "Unsupported file type"); raw paths only (legacy composer, work logos, résumé images). Consider failOn:"error".
- profile-sync now loads sharp at module load (storage-upload -> strip-image): a sharp load failure on Vercel would 500 every profile save, not just photo saves. Resume proxy precedent says it traces fine; live-check a plain profile-sync save right after deploy (or lazy-import strip-image in uploadProfileDataUrl).
- Existing raw uploads (<=12 referenced + 1 image résumé live) keep GPS until the prod backfill (separate yes) while the privacy line is live: schedule it right after the deploy.
- _imageCropper modal is hard-coded white: now also on messages.html in Night (pre-existing; wave 5).
- Club DangerCard title/button still say "org" while its text says "club" (cosmetic).

## Verdict
fix-first: F1 only (small; needs resume-storage.ts assigned to the B3 repair, or B1 narrows the privacy line to exclude résumé attachments). Everything else ships.
