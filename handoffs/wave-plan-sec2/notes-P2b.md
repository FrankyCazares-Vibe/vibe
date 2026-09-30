# notes-P2b (builder P2: image-removal follow-ups) — 2026-09-28

Owns: src/app/api/admin/images/**, src/app/admin/image-slots.tsx, reports-client.tsx, admin-orgs-client.tsx,
orgs/[slug] PATCH hunk, me/threads/[id] PATCH hunk, legal/privacy + legal/delete-account pages.

## Progress
- read waveB-build.md, crosscheck-waveB RESULT, notes-B1/B2, review-B1-*/B2-*.
- code read: images GET/remove/restore + _lib, image-slots.tsx, reports-client card, admin-orgs-client logo tile,
  orgs PATCH (logo/banner via normalizeOrgAssetInput; only admin-actions.tsx sends them, after a fresh uuid upload),
  threads PATCH (photo_url; only messages.html sends it, after a fresh uuid upload), legal pages, storage-purge evidence.

## Plan
1. `_lib/slot-token.ts` (pure, node:crypto): slotToken(type,id,slot,value). GET adds `token` per slot; remove requires
   `expected` (400 if missing), 409 stale_panel "This photo changed since you opened the panel. Refresh and look again."
   when it no longer matches; panel sends view.token and offers Refresh on a 409.
2. ImageSlots takes `reports` (id + reason); tick list; pre-tick intimate_image/sexual/child_safety; sends only ticked
   ids that are in the card's list and look like uuids. Remove answers `resolvedReportIds` (additive) so the card drops
   only those.
3. `_lib/removed-picture.ts` (pure, zero imports) + test; `_lib/removed-picture-store.ts` (server-only service read).
   Canonical compare (trim, drop empty and "." segments). A removal later put back (image_restore with removal_id and
   the slot) no longer counts. Any slot of the same target counts. Read error -> 500 (fail closed). 422 picture_removed.
4. admin-orgs-client LogoTile: blurred, tap to Show/Blur.
5. privacy location line names videos, chat photos, club logos/banners, group chat pictures; delete-account uses B2's
   sentence (open report + moderator removed, up to a year).

## Built
- WROTE _lib/slot-token.ts (+ test 5/5): slotToken = sha256(JSON [type,id,slot,value]) first 32 hex; isSlotToken;
  slotStillMatches; STALE_PANEL_MESSAGE.
- GET /api/admin/images: each slot gains `token` (from slotValues, the same comparable form removalStep uses).
- POST remove: `expected` required (400 "Refresh the panel and look again before taking a photo down." when
  missing/malformed); after the admin guard, 409 stale_panel STALE_PANEL_MESSAGE when the slot's value no longer
  hashes to it (nothing logged, moved or closed). Answer gains `resolvedReportIds` (additive; ids closeReports returned).
  Retry paths checked: moves failed / clear failed -> column unchanged -> token still matches -> "finish" works; a
  two-slot clear that failed half way -> 409 on the cleared slot, refresh, Take down on the other slot finishes.
- image-slots.tsx: SlotView.token; Take down sends expected; a 409 shows the sentence + a Refresh button (re-reads the
  panel, keeps the typed reason). Previews keyed by address, so a different picture after a refresh starts blurred.
  New `reports` prop (PanelReport[]) replaces `reportIds`: ReportTicks fieldset (reason label, @reporter, when);
  intimate_image / sexual / child_safety start ticked, others unticked; only moderator changes are stored, so a
  report that arrives later gets the same default. Sent ids = ticked AND in the card's list AND isUuid, max 100.
  onReportsClosed gets the closed ids.
- reports-client: passes `reports` (open tab only), drops exactly the closed ids from the card and the count; Photos
  button title "Closes the reports you tick."
- admin-orgs-client: LogoTile (44px button, blur(10px) + "Show" label until pressed, aria-pressed, keyed by the stored
  logo key since the proxy address never changes); initials tile unchanged when there's no logo.
- WROTE _lib/removed-picture.ts (pure, no imports; + test 10/10) and _lib/removed-picture-store.ts (server-only,
  service read of the target's image_* rows, newest 1000; "removed" | "ok" | "error").
- orgs/[slug] PATCH: after logo/banner normalize, any non-null value -> checkRemovedPicture("org") -> 422
  picture_removed REMOVED_PICTURE_MESSAGE; read error -> 500 load_failed (fails closed). Imports added at the top only.
- me/threads/[id] PATCH: same for photo_url ("channel"), before the update; 500 "Could not update thread" on read error.
- Writers checked: only these two routes write orgs.logo_url/banner_url and channels.photo_url (thread create reads
  photo_url only; org create refuses orgs/ keys). Both clients send a key only right after a fresh randomUUID upload.
- privacy: location line now "Videos, photos sent in chats, club logos and banners, and group chat pictures keep their
  original details, which can include where they were taken or filmed."
- delete-account: "Your files" -> "except files kept because of a report or a moderator's decision (see below)";
  the moderators-removed bullet replaced by B2's sentence widened to what the code keeps (moderator removed; open
  post/account report; post photo/video after a moderator acted on its report; post deleted under an open report;
  photo/cover changed under an open account report; up to a year for safety and legal reasons). Code comment updated.
  48-hour wording untouched.
- GATES: tsc clean; eslint clean on every touched file; npm test 1254 / 1253 pass (only parse-reminder).
- RENDER (scratchpad p2b harness: bun-built real ImageSlots + AdminOrgsClient, mocked fetch, Playwright 375 + 1280):
  no horizontal overflow; ticks start [intimate on, spam off, child_safety on, sexual on]; after the moderator flips
  two, Take down sent exactly the ticked uuids (a ticked non-uuid id was dropped) plus expected=<token>; first answer
  409 showed the sentence + Refresh; Refresh kept the typed reason; second press "Taken down. 2 reports closed." and
  onReportsClosed got those two ids. Logo tile blur(10px) -> none on press; no page errors.
- Not done (needs a signed-in admin + service key): live walk of the 409 against a real student photo change, and the
  422 on re-sending a removed club/chat key. Orchestrator walk: as avery, Clubs > Photos > Take down the logo, then as
  the officer PATCH the old key -> 422 "That picture was removed by Vibe moderators. Choose a different one."; upload a
  new logo -> saves.

## Open questions
- Privacy §5 retention line still says only "Content our moderators removed may be kept…"; it doesn't mention files
  kept because a report was open (the delete-account page now does). Left as is (not in my brief); lawyer/Franky call.
- The removed-picture helpers live under src/app/api/admin/images/_lib (my ownership) but are imported by the orgs and
  threads routes; moving them to src/lib/moderation/ later would be tidier.
DONE.

## REPAIR round (2026-09-28, after review-P2b MUST FIX 1)
- OWNERSHIP: src/app/api/orgs/[slug]/posts/route.ts is outside my list; the orchestrator routed the must-fix to me
  ("Fix each"), which I took as the grant. POST hunk + imports only; the file had no other uncommitted change.
- CONFIRMED the bypass by reading: isAllowedMediaUrl -> isOrgAssetKey passes any orgs/<orgId>/ key, logo/banner included.
- FIXED: POST /api/orgs/[slug]/posts, after the media checks, length and word filter, just before the insert: when
  media_url or media_thumbnail_url is set -> checkRemovedPicture(service, "org", org.id, [mediaUrl, mediaThumb]);
  "error" -> 500 post_failed (the route's loadFailed, fails closed); "removed" -> 422 picture_removed
  REMOVED_PICTURE_MESSAGE. The club composer (admin-actions.tsx) shows postData.error, so the sentence reaches the
  officer. A new upload (orgs/<id>/posts/<uuid>) never matches.
- Other paths re-checked: only posts, orgs.logo_url/banner_url, channels.photo_url, messages.media_url and users.*
  hold media; authenticated has no UPDATE on posts.media_url/media_thumbnail_url and no INSERT on posts.org_id (local
  grants), so a personal post can't name an orgs/ key's club; the posts PATCH never changes media; messages must be
  messages/<channel>/... (reviewer). So "the only writers" is now true for the picture, not just the columns.
- TEST: removed-picture.test.ts + 1 case (removed logo as media_url, removed banner as thumbnail, "" in the other,
  a new post key passes): 11/11. Store + matcher comments name the club post route.
- SHOULD FIX taken (my file): delete-account "What we keep" no longer reads as ALL photos/videos under an account
  report: "While a report about your account is open, the same goes for your current profile photo and cover, and for a
  profile photo or cover you change or remove." Post-report and moderator-removed parts unchanged; 48-hour untouched.
- SHOULD FIX left: "up to a year" has no sweep job (lawyer/Franky, pre-existing B1); moving removed-picture(+store) to
  src/lib/moderation/ (now three non-admin importers; a move deletes the old files, so not additive: later tidy);
  privacy §5 retention line (Franky/lawyer).
- GATES: npx tsc --noEmit -p . clean; node --test images/_lib/*.test.ts + media-quarantine-images 35/35; eslint clean
  on the touched files; npm test 1255 / 1254 (only parse-reminder). Local dev (not started by me): anon POST
  /api/orgs/sae/posts -> 401 (compiles), /legal/delete-account 200.
- Not done (needs a signed-in officer + service key): live walk. Orchestrator: take down a club logo as an admin,
  then as the officer POST /api/orgs/<handle>/posts {media_url: <old logo key>} -> 422 with the sentence; a fresh
  post photo -> 201.
DONE (repair).
