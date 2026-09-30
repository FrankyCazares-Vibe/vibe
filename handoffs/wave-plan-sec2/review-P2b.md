# Review P2b (image-removal follow-ups): bypass + breakage

Reviewer: read-only. Local only; DB probes read-only or in rolled-back transactions. 2026-09-28.

## Progress
- Read notes-P2b, waveB-build (calls + notes), crosscheck-waveB RESULT, notes-B1, notes-B2 "Requests", review-B1-breakage/-bypass.
- Code read: images GET / remove / restore, _lib/slot-token, _lib/target, _lib/removed-picture(+store), image-slots.tsx, reports-client + admin-orgs-client diffs, orgs/[slug] PATCH hunk, me/threads/[id] PATCH hunk, privacy + delete-account diffs.
- Gates re-run by me: node --test slot-token + removed-picture + media-quarantine-images 34/34; `npx tsc --noEmit -p .` clean; eslint clean on every P2b file; npm test 1254 / 1253 (only parse-reminder).
- Dev server (:3000, not started by me): signed out, GET /api/admin/images, POST remove, PATCH /api/orgs/sae -> 401 each (compile); /legal/privacy and /legal/delete-account 200 with the new sentences.

## Item 1: stale panel token -> CLOSED
- GET and remove hash the same `slotValues(...)[slot]`, bound to type/id/slot. Remove checks it after the admin guard and before latestImageRow, plan, log, move, clear, close: a 409 changes nothing.
- The only caller of remove is image-slots.tsx, and it sends view.token. Log-client only calls restore. An old admin tab without `expected` gets a plain 400 sentence.
- Retry paths hold: a failed move or failed clear leaves the column as is, so the token still matches and "finish" works. A two-slot half-clear gives 409 on the cleared slot, and the other slot finishes after a Refresh.
- A race after the token check is covered by the compare-and-set clear (meta.previous).
- UI: a 409 sets `stale`, shows the sentence (it passes isSentence) and a Refresh button; the reason is kept, since SlotCard is keyed by slot. Previews are keyed by address.

## Item 2: report tick list -> CLOSED
- PRETICK = intimate_image / sexual / child_safety, which match REPORT_REASON_CODES. The rest start unticked. Only moderator changes are stored.
- Sent = ticked AND in the card's list AND isUuid, max 100. The server still narrows to open reports about this target (openReportIds + closeReports scoped).
- `resolvedReportIds` is added to both the "new" and "finish" answers. reports-client drops exactly those ids and lowers openCount by the same number. Actioned/dismissed tabs pass no reports.

## Item 3: removed picture can't come back by re-sending the key -> NOT CLOSED (other route)
- The PATCH checks are right. Club PATCH: checked after normalize and before any write. Thread PATCH: checked before the update. Both fail closed on a read error.
- Matcher: any slot of the target counts. A put-back is tracked per removal id and per slot, and the restore meta fields (removal_id, slots) match what the restore route writes. A removal after a put-back is refused again.
- Canonical form over-matches harmlessly: `//` is refused by KEY_REST_RE anyway, and `/./` or a case change is a different or unsignable object.
- target_id is uuid, so an upper-case route id still finds the rows. Its prefix then names a different object anyway.
- Grants (local): authenticated/anon have no UPDATE on orgs.logo_url/banner_url or channels.photo_url, and no INSERT on orgs or channels. The only DB function naming these columns is the orgs_check_asset_refs trigger.
- Group photo keys can't be reused elsewhere: messages.media_url must be `messages/<channel>/<file>` (trigger messages_check_media_ref).
- BYPASS (confirmed): a club owner or admin can put a removed logo or banner back online as a CLUB POST.
  - POST /api/orgs/[slug]/posts accepts `media_url` / `media_thumbnail_url` = any `orgs/<orgId>/…` key (isAllowedMediaUrl -> isOrgAssetKey), so `orgs/<orgId>/logo/<uuid>.jpg` passes.
  - The DB agrees: `post_media_ref_ok('orgs/<org>/logo/<uuid>.jpg', <user>, <org>)` = t (probe in a rolled-back txn).
  - /api/posts/[id]/media then signs it (postMediaKeyKind "org").
  - Result: the picture moderators took down is republished to the campus feed, which reaches more people than the logo did. The same officers who hit the new 422 on PATCH can do this; they get the key back from the upload-url answer. Direct PostgREST can't do it (authenticated has no INSERT on posts.org_id).
  - Fix (file outside P2b's ownership): in `src/app/api/orgs/[slug]/posts/route.ts` POST, after the isAllowedMediaUrl checks, call `checkRemovedPicture(service, "org", org.id, [mediaUrl, mediaThumb])`. Answer 500 on "error" and 422 picture_removed REMOVED_PICTURE_MESSAGE on "removed". Update the builder's "only writers" note: it's true for the columns, but not for the picture.

## Item 4: Clubs list logo tile blur -> CLOSED
- LogoTile is a real button: aria-pressed, a "Show" label, blur(10px) + scale until pressed. It's keyed by the stored key, so a new logo starts blurred. The initials tile is unchanged with no logo. 44px fits at 375.
- The admin desk is dark-only by design (B1 D2), so it uses admin-shell COLORS. `url(${JSON.stringify(url)})` goes through the CSSOM, so it can't inject anything.

## Item 5: legal wording -> DONE as briefed
- Privacy names videos, chat photos, club logos and banners, and group chat pictures. That is conservative: club logo, banner and post photos pass the desktop cropper today.
- Delete-account "Your files" now has the exception, and "What we keep" is B2's sentence widened. Checked against storage-purge loadEvidence: evidence videos are kept in R2 clips, and profile evidence goes to quarantine.
- The 48-hour wording is untouched. No block is named anywhere.

## Verdict: fix-first
MUST FIX
1. src/app/api/orgs/[slug]/posts/route.ts POST: a removed club logo or banner key is accepted as club-post media and republished to the feed. Add the checkRemovedPicture call on media_url + media_thumbnail_url (422 picture_removed, 500 on read error). Needs an ownership grant.

SHOULD FIX
- Legal "kept for up to a year": nothing deletes quarantine/evidence files after a year, so the promise has no job behind it. Schedule a retention sweep, or have Franky/lawyer word it as a maximum they will enforce (pre-existing from B1; the lawyer call is already open).
- delete-account "What we keep": "a report about ... your account is still open, that photo or video is kept" reads as ALL your photos and videos. The code keeps only the current profile photo and cover for an account report. Consider "your current profile photo and cover".
- Move removed-picture(.ts/-store.ts) from src/app/api/admin/images/_lib to src/lib/moderation/ (non-admin routes import it). The builder noted this too.
- Privacy §5 retention line doesn't mention files kept under an open report (builder's open question; Franky/lawyer).
DONE.
