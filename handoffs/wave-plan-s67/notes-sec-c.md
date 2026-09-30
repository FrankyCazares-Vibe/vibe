# Security wave, batch c — notes

Findings (from handoffs/2026-09-27-security-risk-report.md):
1. [High] Rigged resume (pdf.js CVE-2024-4367) — IMMEDIATE part only: `isEvalSupported: false`
   on every getDocument call in src/lib/pdfjs-cdn.ts and public/html/profile.html (~line 5010).
2. [High]/[Medium] Moderator removal leaves the image online — quarantine the profiles-bucket
   image into a new private bucket "quarantine" on admin removal; path kept for appeal.
3. [Medium] Vibe+ savers list (register #15) — savers route returns a COUNT only.

Owns: src/lib/pdfjs-cdn.ts, public/html/profile.html (getDocument only),
src/app/api/admin/content/remove/route.ts, src/app/api/me/posts/[id]/savers/route.ts + its
client(s), new migrations 20260927130000-139999.

## Log
- (start) Read report sections + roadmap. Read admin remove route.
- (1) pdf.js DONE. src/lib/pdfjs-cdn.ts: new pure `pdfDocumentParams(input, pageHref)` always
  sets `isEvalSupported: false`; rasterizePdf uses it. Test: src/lib/pdfjs-cdn.test.ts (4 pass).
  public/html/profile.html _rasterizePdf: `source.isEvalSupported = false` before getDocument.
  Only two getDocument calls exist in src/ + public/ (grep).
- Live state read (prod, read-only MCP): buckets = profiles (public) + resumes (private);
  storage.objects has ONE policy (profiles_select_own). 21 posts, 3 image posts whose
  media_url AND media_thumbnail_url are the same profiles URL (<uid>/posts/post-*.jpg);
  2 clips: media_url = R2 `clips/<uid>/<uuid>.mp4`, thumbnail = profiles `<uid>/posters/*`.
  0 removed posts. No `quarantine` bucket.
- Design (quarantine): keep media_url / media_thumbnail_url as-is (they ARE the recorded path),
  move each profiles object in the author's own posts/ or posters/ folder to the private
  `quarantine` bucket at the SAME key, so an appeal restore is a move back and the URL works
  again. Never touch an object outside the author's folder (a hostile post can point its
  media_url at another student's file — moving that would take the victim's photo down).
  R2 clips/orgs media is left (batch b's media route refuses removed posts).
  Order: row write -> reports -> log -> quarantine; a failed move answers 500 with a sentence
  (the admin UI prints it) and a retry is idempotent (already removed -> just re-tries the move).
- removeContent in src/lib/moderation/actions.ts has NO callers (grep) -> the route is the only
  removal path; actions.ts is not mine, so its copy is flagged, not changed.
- (3) saves DONE: savers route answers `{ok, viewer_identities:"private", total}` on every tier
  (no hasPlus, no users, no paging). Clients: PostAudienceList.tsx (countOnly branch, "Saves are
  private, so you see how many, never who."; never renders saver rows even if a server sent
  them), PostAudienceSheet.tsx (title "Saves"), PostViewerMobile.tsx (aria "N saves"),
  public/html/_postViewer.js (paintAudienceCount; button title/aria "Saves").
- (2) pure helper src/lib/moderation/media-quarantine.ts + test (11 pass).
  Migration 20260927130000_quarantine_bucket.sql applied LOCALLY OK; re-run aborts in pre-flight.
- (2) route DONE: POST /api/admin/content/remove, for type=post, runs quarantinePostMedia LAST
  (after row write, reports, log) on every call: reads user_id/media_url/media_thumbnail_url,
  planPostQuarantine, quarantineProfilesObjects. Any failure -> 500 `media_still_online`
  ("The post is hidden, but its photo may still be online. Press Remove again…"); the admin UI
  prints that sentence. 200 adds `quarantined` (count moved).
  Store helper src/lib/moderation/media-quarantine-store.ts: move(path, path,
  {destinationBucket}); after an error it asks `exists()` on the SOURCE instead of trusting the
  error text (a missing destination bucket also answers statusCode 404 — proven locally);
  409 duplicate -> remove the public copy. `releaseQuarantinedObjects` = the appeal move back.
- Local proof (storage-api v1.72.1, local keys, scratch scripts, objects cleaned up):
  move -> public URL 400; anon sign/list/download of quarantine all refused; retry = alreadyGone;
  duplicate = 409 handled; hostile post naming another student's file leaves it public (200)
  while the author's poster goes; release -> public URL 200 again.
- Checks: node --test (15 pass), npx tsc --noEmit clean, eslint clean on touched files.

## Open questions / follow-ups (not my files)
1. src/app/plus/page.tsx:668 still sells "Who saved your posts." — false after this wave; remove
   that bullet in the same deploy.
2. src/app/api/admin/content/restore/route.ts: restoring a post does not move its quarantined
   photo back. Wire `releaseQuarantinedObjects(service, planPostQuarantine(post, getSupabaseUrl()).paths)`
   after the row update (post type only), or the restored post shows a broken image.
3. src/lib/moderation/actions.ts removeContent/restoreContent (no callers today) don't quarantine;
   "CHANGE BOTH TOGETHER" — mirror or delete them. moderation_actions.meta has no quarantine keys
   (left out to keep the two meta shapes identical).
4. Account deletion (src/lib/profile/storage-purge.ts) does not purge quarantine/<uid>/…;
   decide retention (TAKE IT DOWN records vs "every photo erased") with the lawyer.
5. Public objects were uploaded with the default cache-control (3600s); a CDN/browser copy can
   outlive the move by up to an hour. Consider a shorter cacheControl on post uploads.
6. R2 media (clips/, orgs/) is left in place by design; relies on batch b's media route refusing
   removed posts. Chat photos (messages) are R2 and not moved either.
7. Apply 20260927130000_quarantine_bucket.sql to prod BEFORE the route deploys.

## Repair round 1
Items from the adversarial review:
- BLOCKER restore/route.ts: restore only cleared removed_at; the quarantined photo never came back.
- SHOULD remove/route.ts: media left online (foreign/external) only logged; 200 gave no signal.
Log:
- (start) Re-read restore route, remove route, media-quarantine(.ts, -store.ts). No UI calls
  /api/admin/content/restore today (grep); the remove caller is src/app/admin/reports-client.tsx:533,
  which is NOT in my Owns list.
- BLOCKER FIXED (src/app/api/admin/content/restore/route.ts). For type=post the read also takes
  media_url + media_thumbnail_url. After the row update and the log row, `releasePostMedia` plans
  the paths with planPostQuarantine(post, getSupabaseUrl()) (the removal's own plan) and runs
  releaseQuarantinedObjects. Failure -> 500 `media_still_quarantined` ("The post is back, but its
  photo is still offline. Press Restore again to bring it back."). Retry: a post that is already
  live now still runs the release (and only that), so pressing Restore again repeats just the move.
  One guard added: a path that another REMOVED post by the same author also plans stays in
  quarantine (`held`), so restoring post A can't put removed post B's photo back online. Only the
  author's own posts can plan a path in the author's folder, so the query is the author's other
  removed posts. 200 now {ok, changed, logged, released, held}. meta keys unchanged (actions.ts parity).
- SHOULD FIXED in the route (src/app/api/admin/content/remove/route.ts). quarantinePostMedia now
  returns leftOnline = plan.left.foreign + plan.left.external (R2 not counted: never public, media
  route refuses removed posts). 200 adds `left_online` (count) and `left_online_note`
  ("This post's image is stored outside the author's post folder and is still online." or null).
  The admin UI half is NOT done: the only caller, src/app/admin/reports-client.tsx doRemove (~line
  532), is outside my Owns list. See open question 8.
- Local proof (scratch script, local stack only, real planPostQuarantine + store, rows inserted
  via psql with triggers off because the local media-ref trigger only knows prod's host):
  remove A (moved 1) + remove B (alreadyGone 1) -> public 400; restore A -> held 1, still 400;
  retry A -> held 1, 400; restore B -> released 1, public 200; retry B -> released 0, 200.
  Posts + objects cleaned up (0 rows left).
- Checks: node --test media-quarantine + pdfjs-cdn (15 pass), npx tsc --noEmit clean, eslint clean
  on src/app/api/admin/content/. No migration changed this round.

## Open questions added in repair round 1
8. src/app/admin/reports-client.tsx (not mine): add `left_online?: number; left_online_note?:
   string | null` to the doRemove adminPost type and append `r.data.left_online_note` to the
   setSaid(...) line, so the moderator actually sees the sentence. Until then it is only in the JSON.
9. Nothing in the UI calls POST /api/admin/content/restore today (grep), so appeals are restored by
   hand/API. When a Restore button lands, print the 500 `media_still_quarantined` message and, if
   `held > 0`, say the photo stays down because another removed post uses the same file.
10. restoreContent in src/lib/moderation/actions.ts (no callers) still only clears removed_at;
    same "CHANGE BOTH TOGETHER" follow-up as item 3.
(Item 2 above is now DONE in this round.)
