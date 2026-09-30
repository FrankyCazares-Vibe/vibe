# S67 security wave — adversarial review (attempt 2)

Reviewer: adversarial pass over batches a–d (notes-sec-a..d). READ-ONLY on app code.
Inputs: handoffs/2026-09-27-security-risk-report.md (reaction XSS, media ownership deletion,
resume eval, moderator-removal leftovers, saves/viewers, intimate-image process, 24h promise,
admin-flag exposure) + the four notes files. Gate: tsc ok, tests ok, migrations ok.

## Method
- Replay each attack as a signed-in non-owner against the LOCAL db (supabase_db_vibe) with the new
  migrations applied, in rolled-back transactions.
- Read prod READ-ONLY to check existing rows vs new constraints.
- Walk each legitimate flow in code (routes + renderers).

## Log
- Read all four notes. Next: report sections, then diffs + migrations one by one.
- Local DB: all five migrations present (emoji CHECK, reports CHECK w/ intimate_image, posts/messages
  media triggers + 3 helpers, quarantine bucket private, authenticated SELECT on is_platform_admin = f).

### 1. Reaction XSS (110000 + batch a)
- DB: CHECK is byte-exact seven strings, U& escapes, validated; pre-flight pins the old def + aborts
  on stray rows; post-check probes by behaviour (no row written). Rollback restores the exact old
  length CHECK. Heart bytes e29da4efb88f match in lib, MessagesMobile, campus-home. OK.
- Route: react route + GET grouping both use the lib; stray stored rows are dropped. OK.
- Renderers: messages.html chipsFor + mini chips/pill now escape emoji + count and use data- attrs
  with one delegated listener each; __dmEsc/esc escape & < > " '. No intermediate click handlers
  between button and #vmmMsgs, so moving stopPropagation to the container is behaviour-neutral.
  CLOSED at all three layers. Legit: 7 emoji via route on desktop, mini, phone unchanged.

### 2. Media ownership (120000 + batch b)
- DB: posts trigger = NULL | own-host https (any path) | clips/<user_id>/ | orgs/<org_id>/ (club).
  messages = messages/<channel_id>/<one file>. orgs = own host | orgs/<id>/. Checks only on INSERT
  or when the column changes; org_id SET NULL on club delete is safe. Pre-flight aborts on any
  cross-folder row; post-check probes helpers. Rollback drops all 6 fns + 3 triggers = old state.
- Route: DELETE /api/posts/[id] is author-only and deletes only clips/<caller>/ keys, rate limited.
  media GET signs clips/ only under clips/<user_id>/, orgs/ only under orgs/<org_id>/; removed post
  / restricted author -> 404 except author + admins (fails closed). storage-purge keeps a chat key
  another user's message names. No other R2/storage delete site exists (grep). CLOSED for the
  report's attack (delete + re-host of clips/ and orgs/, chat purge).
- Legit: video post (clips/<uid>/uuid.ext + profiles posters https) passes; photo post (plain
  getPublicUrl, no query) passes; club post (service insert with org_id + orgs/<org>/..) passes;
  chat photo (messages/<channel>/<uuid>.<ext>) passes; own video delete still deletes the file.
- GAP: the https arm allows ANY path on our host (open q3). publish-post accepts it too.
  -> see finding "quarantine bypass" below.

### 3. Moderator removal / quarantine (130000 + batch c)
- planPostQuarantine only moves <author>/posts/<f> and <author>/posters/<f>. A post whose
  media_url is the author's own <uid>/banner-*.jpg or avatar-*.jpg (profile-upload kinds with an
  empty folder prefix) is accepted by publish-post (isOwnedMediaRef https arm) AND the trigger;
  on removal plan.left.foreign=1, paths=[], route answers 200 quarantined:0 and only console.warns.
  => an NCII poster who uploads as "banner" and posts that URL keeps the photo public after a
  moderator "removal", and the admin sees success. BLOCKER for the 48h copy.
- Quarantine migration: private bucket, no policy; pre-flight refuses a policy not pinned to one
  bucket (regex only catches the absence of `bucket_id = 'x'`, so `... OR true` would slip; prod has
  just profiles_select_own, scoped). Rollback needs an empty bucket (documented). OK.

### PROD read-only (2026-09-27)
- emoji CHECK def + reports CHECK def match both PRE-FLIGHT strings exactly; 24 reactions, 0 stray;
  0 reports; last migration 20260927100000; buckets profiles(public)+resumes; one storage policy.
- posts/messages/orgs: 0 rows fail the new triggers' rules. 0 https post media/thumbs outside
  profiles/<author>/(posts|posters)/<file> -> tightening the https arm is free today.
- users.is_platform_admin ACL {authenticated=r/postgres}, no table-wide SELECT: pre-flight passes.

### LOCAL attack replay (as authenticated, rolled back; scratchpad/rev_probe.sql)
- reaction '<img src=x>' as a real channel member -> 23514; listed heart -> stored. CLOSED.
- draft post naming another student's clips/ key -> 23514. CLOSED.
- post naming ANOTHER student's profiles avatar (https arm) -> STORED. Re-host of photos still open.
- post naming OWN banner-*.jpg -> STORED (feeds the quarantine bypass above).
- post with org_id of a foreign club -> permission denied (org_id not in authenticated INSERT grant).
- message naming another chat's key -> 23514. CLOSED.
- SELECT ... where is_platform_admin as authenticated -> permission denied for table users. CLOSED.
- direct reports insert -> permission denied (service-role route only), as before.

### 4. Resume eval (batch c)
- Only two getDocument calls exist (profile.html:5015, pdfjs-cdn.ts:96); both now pass
  isEvalSupported:false (data: and url: arms). Vendor workaround; fonts still render. CLOSED at the
  renderer (no DB/route layer). cdnjs load without SRI / npm pin is the report's "Next" step.

### 5. Saves promise (batch c)
- DB: bookmarks RLS bookmarks_all_own (auth.uid() = user_id) -> no one reads others' saves.
- Route: savers answers {viewer_identities:"private", total} on every tier. Renderers:
  PostAudienceList / PostAudienceSheet / PostViewerMobile / _postViewer.js show a count only, even
  if a server sent rows. CLOSED. Saved tab (own bookmarks) untouched.
- LEFTOVER: src/app/plus/page.tsx:668 still sells "Who saved your posts."

### 6-7. Intimate-image process + 24h promise (batch d)
- Reason list -> route (isReportReasonCode) -> CHECK (140000) -> admin queue: open tab page 1 pulls
  open intimate_image reports (cap) on top; buildAnswer dedupes by id; client mergeGroups keeps
  order; label via reportReasonLabel. Works end to end in ReportSheet.tsx surfaces.
- GAP: _safetyActions.js:291 (desktop DM/post/profile) + ProfileMobile.tsx:5799 lack the reason;
  fallback "Sexual content" reports are NOT lifted, so "go to the front of the queue" is false there.
- GAP: copy says child exploitation / imminent harm "go first"; only intimate_image is lifted.
- Copy: plain English; four elements (signature, location, good-faith statement, contact);
  48 hours; email path with subject; footer link; 24h promise replaced on all three pages.
- 48h "we remove it" depends on quarantine -> undermined by the bypass in section 3.
- Restore route (appeal) never calls releaseQuarantinedObjects (0 callers) -> a restored post's
  photo stays in the private bucket: broken image. BLOCKER (legit flow breaks).

### 8. Admin flag (141000 + batch d)
- Every read (require-platform-admin x2, the-map, admin users/restrict, orgs members, feed,
  hidden-org-access, membership, alerts, posts media) is on the service client; profile-bootstrap
  switched to service. DB: only org_content_visible (DEFINER) reads it. Prod pre-flight conditions
  all hold. Rollback re-grants exactly the column. CLOSED; founders' gate intact.

## Verdict
NOT READY: 2 BLOCKERs (quarantine bypass via own-host non-post path; appeal restore leaves the
photo quarantined). Reaction XSS, clip deletion/re-host, chat purge, resume eval, saves, admin flag
are closed at every layer I could reach. All five migrations would apply cleanly to prod today.
