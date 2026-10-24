# Event cover photos (Oct 23, 2026)

Franky (relayed by the coordinating session): "make it to where you can upload photos for the event, like event
profile photos or whatever". The picture half of event covers, pulled forward from week 1. The icon (shipped
today, 50a49ea) stays the fallback when there's no photo.

**What the code really has (the map, Oct 23):** no pending-upload table and no purge of unused uploads (the
"3-day purge" is the rate limiter's counts); no image scanning (reports + admin takedowns). Club banners and logos
are the model: a signed PUT straight to R2, the database keeps the object KEY (never a URL), a same-origin proxy
route answers a short-lived signed GET. So covers follow that path, and we add what banners lack: the old file is
deleted when replaced or when the event goes (unless a report is open on it), reports keep it as evidence, and
admins can take a cover down.

## Product
- An officer adds, changes or removes a **cover photo** in the event form (create and edit): pick a photo, crop it
  to 16:9 (ImageCropperModal, JPEG, up to 1600 px wide), it uploads, a preview shows with Change / Remove.
- **Where it shows:** the event card (EventCard) as a 16:9 picture across the top; the officers' Up next card as a
  slim picture strip at the top; small tiles (EventIconTile: past events, and anywhere the tile is used) show the
  cover cropped square, else the icon. Everything else keeps its look.
- Who sees it: exactly who can see the event (signed-in only; Members only events only to members; a hidden
  club's to its members). The picture route reads the event with the VIEWER's client, so the database's own rule
  (`event_visible`) decides. Signed out: 404.
- Not now: covers in chat cards, the club link picture, event pages (week 1).

## Storage and API (B1)
- `POST /api/orgs/[slug]/upload-url` gains kind **"event-cover"**: images only (jpeg, png, webp), 10 MB, owner and
  officers of a verified, visible club, key `orgs/<org_id>/events/<uuid>.<ext>`. Same rate limit as the route.
  Update `src/lib/r2-sign.test.ts` and `src/lib/uploads/upload-routes.test.ts` lists if they enumerate kinds.
- **Migration** `supabase/migrations/20261028100000_event_covers.sql`: `events.cover_key text null` + a trigger or
  CHECK that a key is null or under `orgs/<that event's org_id>/events/` with safe characters (mirror
  `orgs_check_asset_refs` in 20260927120000_media_ref_ownership.sql). Header with PRE-FLIGHT (read-only, counts
  only) / apply / POST-CHECK / ROLLBACK, like 20261027100000. Rehearse on the LOCAL stack only.
- `src/lib/events/validate.ts`: a `cover_key` field (string | null; create default null; edit keeps stored; null
  clears), refused unless under this club's `orgs/<org_id>/events/` folder (`invalid_cover`), checked last;
  `checkRemovedPicture(service, "org", org.id, [key])` refuses a key moderators took down.
- `src/lib/events/event-item.ts`: `cover_key` in `EVENT_ROW_COLUMNS`/`EventListRow`; `toEventListItem` appends
  `cover_url: eventCoverProxyUrl(id, cover_key)` (null when none) and NEVER the raw key.
- NEW `src/app/api/events/[id]/cover/route.ts` (GET): viewer's client reads `id, org_id, visibility, cover_key`
  (RLS decides; not found → 404 like a missing event); `checkRemovedPicture`-style refusal if moderators removed
  it; a 1-hour signed GET with the service role; 307. Cache: `private, max-age=300` for an Everyone event, `private,
  no-store` for Members only. NEW helper `eventCoverProxyUrl(id, key)` → `/api/events/<id>/cover?v=<file name>`.
- POST and PATCH `/api/events`: accept `cover_key`. On PATCH when the key changes or clears, and on DELETE, delete
  the old object best-effort with a NEW guarded single-key deleter (only `orgs/<uuid>/events/<file>` keys), unless
  the event has an open report (then keep it as evidence).
- Signed-out read limit: nothing (the route needs sign-in).

## Moderation (B3)
- `src/lib/moderation/reports.ts`: an event report's snapshot also keeps `cover_key` (evidence).
- `src/lib/posts/delete-media-store.ts` `clubKeysToKeep`: open reports on the club's EVENTS keep their covers too.
- Admin image takedown (`src/lib/moderation/media-quarantine-images.ts` IMAGE_SLOTS, `src/app/admin/images/_lib/*`):
  an **event cover** slot, so an admin can remove a cover (clears `events.cover_key`, records the removed key so
  `checkRemovedPicture` refuses it again, same as a club banner). Read how org banner takedown works and mirror it.

## UI (B2)
- `CampusEvent.cover_url?: string | null` (campus-home.tsx). CreateEventModal: a **Cover photo** field under the
  icon picker (button "Add a cover photo" → file picker → ImageCropperModal aspect 16/9 → POST upload-url kind
  event-cover → PUT → keep `objectKey`; preview with Change / Remove; edit mode sends `cover_key` only when changed,
  `null` to remove). Busy and failure states; the Create/Save button waits for an upload in flight.
- EventCard: the cover across the top (16:9, rounded top corners, `object-fit: cover`, alt "" because the title is
  right under it, lazy-loaded, a failed load hides it). EventIconTile: the cover square-cropped when present.
- `src/app/orgs/[handle]/club-page/UpNextSteps.tsx`: a slim cover strip at the top when the event has one.
- Theme tokens; 44px targets; motion via springs.ts on transform/opacity only.

## Privacy Policy (B4, staged; the date goes in on ship day)
- 3c: "…the icon its club picked for it and its cover photo…"; the photo-details line that lists what we don't
  strip: add "event cover photos"; 5b (who sees events): "An event's cover photo is shown to whoever can see the
  event."; section 8 retention: a cover is deleted when replaced or removed, when the event is cancelled or
  deleted, or when the club is deleted; "What Vibe does not delete yet": a cover on an event that went with the
  account that made it stays until the club is deleted. Both copies (the .md and the TSX) + a test like
  `src/lib/legal/event-icons-policy.test.ts`; the checker must PASS.

## Ship order
Build → review → walk → Franky's own yes here → pre-flight → apply → rename the row → post-check → push code +
policy the same day → check live.
