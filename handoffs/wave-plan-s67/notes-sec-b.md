# S67 security wave — batch b notes

Findings: [High] any student can erase others' videos (report ~263-410), [Medium] #10 videos
from removed posts / banned accounts still load, #13 account deletion erases other members'
chat files (same root, storage-purge).

Owns: src/app/api/posts/[id]/route.ts (DELETE), src/app/api/posts/[id]/media/route.ts,
src/app/api/me/publish-post/route.ts, src/lib/profile/storage-purge.ts (+test),
src/lib/org-asset-url.ts (+test), NEW src/lib/posts/media-ownership.ts (+test),
NEW migration(s) 20260927120000-129999.

## Log

- Read report exec summary, register, both [High] sections, roadmap. No publish-clip route
  exists (grep): only publish-post + clip-upload-url.
- PROD (read-only, 2026-09-27): posts 21 rows. media_url: 16 NULL, 2 `clips/` (both under
  clips/<own user_id>/), 3 https on rqopjkimxbjkwdkpkbfq.supabase.co under
  /storage/v1/object/public/profiles/<own uid>/. thumb: 16 NULL, 5 https same shape. 0 club
  posts with media, 0 `orgs/` post keys. messages: 54 NULL, 3 `messages/<own channel_id>/`.
  orgs: 1 logo + 1 banner, both `orgs/<own id>/`. No existing public fn named *media*.
  Grants: authenticated INSERT posts.media_url = true, UPDATE = false; messages the same.
- posts.org_id FK is ON DELETE SET NULL, so the posts trigger must NOT re-check when only
  org_id / user_id change (a club deletion would otherwise fail on its own posts). It checks
  on INSERT, and on UPDATE only when media_url / media_thumbnail_url actually change.
- No publish-clip route exists; video posts go through publish-post (video_object_key).
- normalizeOrgAssetInput callers (orgs/route.ts create, orgs/[slug]/route.ts PATCH) are NOT
  mine: signature gains an optional orgId; see open question.

## Done

- NEW src/lib/posts/media-ownership.ts (+ .test.ts, 10 tests): isOwnClipKey, isOrgAssetKey,
  isChannelMediaKey (owner id must be a lower-case UUID; rest = safe segments, no `..`, no
  empty segment/backslash/space/control/%), hasSafeMediaUrlShape, ownClipKeysToDelete,
  postMediaKeyKind, purgeableMessageMediaKeys. No imports.
- DELETE /api/posts/[id]: rateLimit `post-delete:<uid>` 30/10min; R2 delete only for
  media_url / media_thumbnail_url keys under clips/<caller>/ (deduped); a foreign clips/
  key is kept and logged.
- GET /api/posts/[id]/media: selects removed_at; removed post or author with a suspension/
  ban in force (getActiveRestriction, fails closed) -> 404 except author + platform admins;
  such answers are `private, no-store`. clips/ signed only under clips/<post.user_id>/,
  orgs/ only when org_id set and under orgs/<org_id>/. No signed-out gate added.
- publish-post: isOwnedMediaRef = isOwnClipKey | (hasSafeMediaUrlShape && isSupabaseHttpsUrl),
  so route and DB agree (a crafted value is a 400, not a DB 500).
- org-asset-url: normalizeOrgAssetInput(v, orgId?) - string id scopes to orgs/<id>/, null
  (creation) refuses every orgs/ key, omitted = legacy (any well-formed orgs/<uuid>/ key,
  DB trigger scopes it). isAllowedMediaUrl uses isOrgAssetKey + safe https shape.
  NEW src/lib/org-asset-url.test.ts (6 tests, resolve-hook pattern).
- storage-purge: a chat key is purged only if under its own message's channel AND no other
  user's message names it (service read, chunks of 100, throws on read error).
- Migration 20260927120000_media_ref_ownership.sql: helpers media_key_in_folder,
  media_url_on_own_host (host pinned: rqopjkimxbjkwdkpkbfq.supabase.co), post_media_ref_ok;
  BEFORE INSERT/UPDATE triggers on posts, messages, orgs (checks a column only on INSERT or
  when it changes; 23514). Applied LOCALLY only. Local proof (rolled back): as authenticated
  ef638534, draft naming another student's clip refused, foreign poster refused, club file on
  personal post refused, traversal refused, outside host refused; text/own-video/own-photo
  posts OK; other-chat file refused, own-chat photo OK; (as server) other club's logo refused,
  own OK; club post with own key OK; club deletion (FK SET NULL) OK; removal/edit OK.
- tsc clean. npm test: 1026/1027; the one failure is src/lib/otto/parse-reminder.test.ts
  (module file missing, not this batch).

## Open questions

1. normalizeOrgAssetInput callers (not mine): src/app/api/orgs/[slug]/route.ts:495,502 should
   pass `org.id`, and src/app/api/orgs/route.ts:673-674 should pass `null`. Until then a
   foreign orgs/ key is refused by the DB trigger (PATCH 500 "Failed to update") instead of
   a clean 400.
2. The messages send route (not mine) validates with MESSAGE_MEDIA_KEY_RE (`[^/]+` file name),
   looser than the DB (`[A-Za-z0-9._-]+`); only crafted keys differ (500 instead of 400).
   Could switch it to isChannelMediaKey.
3. The https arm allows any path on our Supabase host, per the task. All 8 live https values
   sit in /storage/v1/object/public/profiles/<author>/; tightening to that folder would also
   stop re-posting another student's PHOTO as your own. Founder/lead call.
4. Chat purge keeps a file another member's message also names. Side effect: a member who
   plants a row naming your photo keeps it alive after you delete your account. Root fix is
   uploader-scoped chat keys (roadmap "Tie chat photos to the person who uploaded them").
5. Report option (a)/(c) not done: INSERT/SELECT on posts.media_url is still granted to
   authenticated (trigger is the boundary instead); raw keys still readable.

## Repair round 1

Item (SHOULD, storage-purge.ts:247): account deletion never purges `quarantine/<uid>/`, so a
moderator-removed post's photo outlives the author's account in the private bucket, against
the delete-account page's "every photo ... erased from storage".
- Quarantine layout (batch c, media-quarantine.ts): same path as in `profiles`, i.e.
  `quarantine/<authorId>/posts/<file>` and `quarantine/<authorId>/posters/<file>`. So the
  author's folder is exactly `quarantine/<uid>/`, same recursive purge as `profiles/<uid>/`.
- Only caller of purgeUserUploads: src/app/api/me/route.ts DELETE (not mine).
- Decision: PURGE (option 1). The delete-account page (also the Google Play data-safety page)
  promises "every photo, video and document you uploaded is erased from storage", and its
  "What we keep" list names reports, the moderation log, restrictions, billing and email logs,
  never the removed photos. Purging makes that promise true with no legal-page change;
  disclosing + a scheduled cleanup would need legal pages this batch doesn't own.
- FIXED src/lib/profile/storage-purge.ts: purgeUserUploads now runs
  purgeStorageFolder(QUARANTINE_BUCKET_ID, uid) right AFTER profiles (a removal that moves a
  photo out of profiles mid-purge lands in quarantine before the sweep). PurgeResult gains
  `quarantine: number` (additive; DELETE /api/me only logs/returns it, no client reads it).
  Header layout comment lists the quarantine folder and why it goes with the account.
- Missing-bucket check (local storage API): list() on a bucket that does not exist returns
  `[]` with no error, so until 20260927130000 is applied the sweep is 0, never a failed
  account deletion. No deploy-order hazard for DELETE /api/me.
- Local proof (scratch script, local stack only, R2 env unset on purpose): uploaded
  A/posts/p1.png, A/posters/f1.png, A/avatar-1.png and B/posts/p2.png to profiles; moved the
  three post files into quarantine with the real quarantineProfilesObjects (moved 3). Called
  the real purgeUserUploads(A): it erased profiles/A and quarantine/A (both post files gone),
  then threw at the R2 step (no R2 env, as intended so nothing touched real R2). B's
  quarantined file was untouched; cleaned it up after.
- No new pure helper, so no new test. tsc clean. media-ownership + org-asset-url +
  media-quarantine tests: 27/27.
- Not mine, trivial: src/app/api/me/route.ts:55 doc comment lists
  `{ profiles, resumes, clips, messageMedia }`; add `quarantine`.

### Open question (repair round 1) - for the lawyer, before the first NCMEC report
6. Evidence preservation vs. erasure. 18 U.S.C. 2258A(h) requires keeping reported CSAM for
   1 year after a CyberTipline report, and the child-safety page says "We keep the records
   the law requires us to keep". Banned students can still delete their account, and that
   now erases their quarantined files too. Today nothing is at risk (0 removed posts in prod,
   no NCMEC report tooling exists). Recommendation: when a report is filed, copy the file to a
   hold path that is NOT under a user folder (e.g. `quarantine/holds/<reportId>/<file>`);
   purgeUserUploads only sweeps `quarantine/<uuid>/`, so a hold survives deletion by design.
   Then add one line to "What we keep" on /legal/delete-account ("content we must preserve
   for law enforcement, for as long as the law requires").
7. Tiny race, not fixed: an appeal release (quarantine -> profiles) landing between the
   profiles sweep and the quarantine sweep would leave that one file in profiles. Needs an
   appeal granted in the same second the author deletes their account.
