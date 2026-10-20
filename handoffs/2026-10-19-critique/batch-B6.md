# Batch B6: profile twins (Oct 19, 2026)

Built on decisions 5 (tags inside the caption, no chips) and 15 (plain theme-coloured text tiles). Nothing committed (workflow rule). Every edit stayed inside B6's files plus three new files only B6 uses.

## Plan step 6 (D12, the desktop profile calendar): built in the repair round

The first run left it out. The repair round below built it on top of B8's work in the tree, using `B8-handoff-profile-calendar.js` (now applied, so that file can be deleted at merge).

## What changed

**D1: the composer outline no longer touches the tabs** (`profile.html`, CSS)
- New rule: `body:not(.viewer-mode) .profile-composer + .content-tabs { margin-top:4px; }`.
- Measured on your own profile: the tabs start **16px below** the composer box (before: 12px inside it), in Light and Night.
- On someone else's profile (composer hidden), the tab row is still flush at the top of the card (margin -28px, 1px from the card's top edge).

**D3: Saved shows photos on desktop, and text tiles use theme colours**
- Desktop `_buildSavedCell` (between `// saved-tiles:start` and `// saved-tiles:end`):
  - a photo fills the tile;
  - a video shows its poster with a drawn play badge (an SVG, not the ▶ character);
  - a video with no poster, or a text post, is a plain tile: `rgba(var(--scrim-rgb),.06)` with `var(--ink-post)`, DM Sans, 6 lines, then "…".
- Every tile is now a real `<button>`, so you can reach it with Tab and Enter. A photo tile is read out as "Saved photo. <caption>". The six pastel themes and `_savedThemeFor` are gone (they glowed in Night), and so are the dead `postThemeFor` and `postExcerpt`.
- `.post-thumb-body` is still there in both tile kinds. The `vibe:post-edited` listener now finds it in `#profileSavedGrid` by `data-source-post-id`, so an edit also updates a photo tile's spoken name.
- The prefill passed to the viewer now carries `media_kind`.
- **One picture rule for both twins:** new `src/lib/profile/saved-tile.ts` `savedTileThumb`: the poster first, otherwise a PHOTO's `media_url`. A video's `media_url` is the video file, never a picture. Before, both screens checked `type === "post"`, which every saved post is.
- **Phone** (`ProfileMobile.tsx`):
  - `SavedGrid` and `RepostRow` use `savedTileThumb`. `media_kind` was added to `SavedPost` and to `RepostEntry.post`.
  - Video tiles get the same drawn play badge.
  - Photo tiles get an aria-label ("Saved photo. <caption>"). They had no spoken name before.
  - The text tile's "…" bug is fixed. The cause was the clamped span's own padding: a clamped box clips only at its padding edge, so line 6 showed in the bottom padding. The 8px gap now sits outside the span (`top/left/right: 8`, `maxHeight: calc(100% - 16px)`, line height 1.35). Measured: lines stop at 5, with "…".
  - `RepostRow` now shows the repost's own quote (`entry.comment`) under "Reposted 5d ago", as desktop does. A video with no poster says "VIDEO" in place of "POST".

**D7: the drawn repost icon** (`profile.html`, `// repost-banner:start … end`)
- The 🔁 emoji is replaced with the phone's `IconRepost` drawing (the same two paths, pinned by a test) plus "Reposted 5d ago" / "Reposted just now" / "Reposted Sep 17", from `repost.reposted_at` through `_formatRelativeDate`. When the row has no time it says just "Reposted".

**Tags inside the caption (B3's rule, matching B1)**
- New `src/lib/posts/caption-tag-ranges.ts` `captionTagRanges(text, post.tags)`. It returns where each **saved** tag sits, using `POST_TAG_IN_TEXT_RE` over `blankPostLinks`, so positions are on the original caption.
  - A `#word` the post didn't save is plain text: a 6th tag, `#café`, or `x.com/tix#gameday`.
  - An old stored tag like `#2026` still links.
- **Static twin** `// tags-twin:start … end`, in both `profile.html` and `_postViewer.js`: `POST_TAG_IN_TEXT_RE` and `POST_TAG_LINK_RE` copied character for character, plus `vibeExtractPostTags` and `vibeCaptionTagRanges`.
- **Desktop profile:**
  - `_extractHashtags` now uses the twin. The old one had its own regex, a cap of 10, and an `exec` loop that left `lastIndex` partway through the text.
  - `_profileCaptionHTML` turns saved tags into links to `/campus?tab=feed&tag=<t>` inside the caption, with every other part escaped. The chip row is gone from new cards: the API rows, a fresh publish (tags from `j.post.tags`) and an edit repaint (which also removes the chips of an old cached card).
  - One capture listener on the document handles every tag link (Posts, All, pinned slot). A plain click goes through `__vibeTopNav` and never opens the viewer. Cmd/Ctrl-click still opens a new tab.
  - `_profilePrefillFromCard` reads the tags from the links, and from chips left in an old cache.
- **Desktop post viewer** (`_postViewer.js`): `formatBodyText(content, tags)` links the saved tags inside the text, the same way as `@mentions`. The `.vpv-tags` chip row and `repaintTags` are gone; after a save, the text repaint uses the new tags. **This viewer is also loaded by `messages.html`** (B7's file), so posts opened from Messages get inline tags too. No change in `messages.html` was needed.
- **Phone profile card:** saved tags are `next/link` links inside the caption; other `#words` are plain text. `@mentions` are still coloured words, as before.
  - **Structure change:** the card was one big `<button>`, and a link inside a button is invalid. It is now a box with a full-size "Open post, <time>" button (zIndex 1), with the tag links above it (zIndex 2) and `isolation: isolate`.
  - Measured in the page: a tap on a tag hits the link, a tap on the words hits the open button, and the ⋯ stays on top.

## Files

Changed:
- `public/html/profile.html`
- `public/html/_postViewer.js`
- `src/components/mobile/ProfileMobile.tsx`

New:
- `src/lib/posts/caption-tag-ranges.ts`: the shared highlight rule
- `src/lib/profile/saved-tile.ts`: the shared picture rule
- `src/lib/posts/static-profile-tags.test.ts`: 9 tests
- `src/lib/profile/static-profile-saved.test.ts`: 7 tests

## Checks

- **New tests:** 16 of 16 pass.
  - **Tags (9 tests):**
    - The twins' regex `.source` and flags equal edit.ts's.
    - edit.test.ts's own PROBE table, read out of that file (39 cases), gives the same tags through both twins.
    - `isNewPostTag` and `blankPostLinks` agree with edit.ts.
    - `captionTagRanges` cases, then the twins run beside it on every sample and on a 1,500-caption fuzz.
    - The real `_profileCaptionHTML` and the viewer's `formatBodyText`, pulled from the files and run.
  - **Saved (7 tests):**
    - Photo, video-with-poster, bare video and text tiles, built on a fake DOM from the page's own block.
    - The desktop picks the same picture as `savedTileThumb` over a 36-case grid.
    - The pastels are gone and the tile uses tokens.
    - The repost icon paths equal the phone's `IconRepost`, and "Reposted 5d ago / 3h ago / just now".
    - The D1 rule.
  - **Mutation check:** I broke the profile twin's range index and the photo rule. 5 tests went red, and green again after the restore.
- **`npm test`:** 3,467 of 3,467 pass. That includes other batches' work in flight.
- **`npx tsc --noEmit -p .`:** no errors in any B6 file. The errors left are in other batches' in-flight files: campus-home.tsx (B1) and delete-rules.test.ts (B7).
- **`npx eslint`:**
  - The four new files are clean.
  - `ProfileMobile.tsx` has 7 errors and 4 warnings, exactly the same findings as the HEAD version (checked by linting HEAD's copy through stdin). They are all old and none is in B6's lines: `react-hooks/refs`, `set-state-in-effect`, unused vars.
- `node --check` passes on `_postViewer.js` and on all 8 inline scripts of `profile.html`.

## Browser check (local dev, LOCAL database, nothing written)

- **Accounts:**
  - The owner is `franky`, a local seed and non-admin (`isPlatformAdmin: false`) with photo posts.
  - The visitor is franky on `/profile/hanasato`.
- **Mocks, in the browser only:**
  - `/api/me/bookmarks` and `/api/users/*/reposts` are mocked with real local rows (2 photos, a video with a poster, a video without one, 2 text posts, 2 reposts, one with a quote).
  - One real post of franky's is shown with the caption "…#GameDay tonight? #notsaved\ntickets at x.com/tix#gameday #iu_football" and tags `[gameday, iu_football]`.
- **Every write was stubbed.** Only heartbeat, profile-views and post-view POSTs fired, and all were stubbed.
- **No page errors** in any run.

**Desktop, 1440x900, Light and Night:**
- **Composer gap:** 16px.
- **Card links:** `#GameDay` and `#iu_football` are links (`#B83A1A` Light, `#FF8A66` Night). `#notsaved` and `x.com/tix#gameday` are plain text, and the card has no chip row.
- **Viewer:** a click on the card's words opens it, with the same two inline links and no chips. A click on `#GameDay` goes to `/campus?tab=feed&tag=gameday`, not the viewer.
- **Saved:** 3 photo tiles (one with a play badge), then 3 plain token tiles. The text stays inside each tile, and the badge tile's words stay clear of the badge.
- **Reposts:** the drawn icon with "Reposted 5d ago" and "Reposted 3h ago", and no emoji.
- **Visitor:** tabs flush, no Saved tab, no composer.
- **Edit event:** a `vibe:post-edited` sent from the page updated the Posts card, the All card and the cache with inline links. It added " · Edited" and no chips, and a photo tile's name read "Saved photo." after its caption was cleared.

**Phone, 390x844, iPhone UA, Light and Night:**
- **Width:** the page is 390 wide on every screen.
- **Posts card:** inline tag links. The tag, the open button and the ⋯ each get their own taps, measured with `elementFromPoint`. A tap on the words opens the viewer, which shows both tag links. A tap on `#GameDay` goes to `/campus?tab=feed&tag=gameday`.
- **Saved:** photos, a poster with a badge, and text tiles clamped at 5 lines with "…" and no 6th line.
- **Reposts:** the quote shows.
- **Visitor:** sub-tabs are only Posts and Reposts.

**Screenshots** (`shots/`):
- `B6-desk-owner-composer-tabs-{light,night}.png`, `B6-desk-owner-tags-*`, `B6-desk-viewer-tags-*`, `B6-desk-saved-*`, `B6-desk-reposts-*`, `B6-desk-visitor-reposts-*`
- `B6-phone-posts-tags-*`, `B6-phone-viewer-*`, `B6-phone-saved-*`, `B6-phone-reposts-*`, `B6-phone-visitor-*`

**Scripts:** session scratchpad `b6/` (`common.mjs`, `desk.mjs`, `phone.mjs`, `edit-event.mjs`).

## For the main session

- **Database:** no change. **Production:** nothing written, no step needed.
- **Privacy Policy:** no change.
  - Nothing new is collected or kept.
  - The photos in Saved were already sent to the owner by `/api/me/bookmarks`, and Saved is still owner-only on both twins (checked: visitors get no Saved tab).
  - The repost quote and "Reposted 5d ago" were already shown by one twin, and the routes already sent them (reposts are visible to signed-in accounts under the current Policy).
- **For B1:** `captionTagRanges(text, post.tags)` in `src/lib/posts/caption-tag-ranges.ts` is import-light (only `./edit`) and fits B1's step 4. If campus-home `renderPostContent`, `PostViewerMobile` and `CampusMobile` use it, every screen highlights the same tags. If B1 wrote its own, the two should agree; a quick diff of outputs is worth doing at merge.
- **Follow-up, not done (outside the plan's step list):** the phone Posts card (`PostFeedCard`) still uses `media_thumbnail_url || media_url` as its picture. A video post with no poster gets its video file as a background, which shows a blank tile.
  - `/api/me/posts` sends `media_kind`, so `savedTileThumb` plus a video branch would fix it.
  - I left it alone: with no picture the card would show nothing, so it needs a small design call (a "Video" placeholder or a real `<video>` poster frame).

---

# Repair round (Oct 19, 2026, after the review)

Six findings. Five fixed, one was wrong evidence only (retaken). Nothing committed (workflow rule). Only B6's files were edited, plus new files only B6 uses.

## 1. D12: the desktop /profile calendar is the real calendar now (fixed)

`public/html/profile.html`, between `// cal-real:start` and `// cal-real:end`. The old browser-only list is gone.
- **Reads:** the page start and every `openCalModal` read `GET /api/me/calendar`: your RSVPs and your own entries. One read runs at a time. If a change arrives during a read, it reads once more afterwards. A failed read keeps what was already on screen. If nothing has loaded yet, the day panel says "Couldn't load your calendar." with a Try again button.
- **Writes:**
  - `saveNewEvent` sends `POST /api/me/personal-events`. The time field starts at 9am and is required, as in My Calendar. The inputs have the route's length limits.
  - Deleting your own entry sends `DELETE /api/me/personal-events/<id>`. The first tap turns the × into a red "Delete", and the second tap deletes.
  - RSVPs have no ×. Saving or deleting posts `{type:'calendar-changed',v:1}` on the channel.
- **The key (B8's paint, hand-copied):** Going is solid coral with a drawn check. Interested is a coral outline. Yours is a plain chip with a 3px bar in your colour. A key line sits under the grid: "Going / Interested / Yours. Click an event to open its club."
  - `vibeCalKind`, `vibeCalBar` and `vibeCalHref` are checked against `calendar-key.ts` by a test.
  - The colour swatches are now My Calendar's (blue first). Green, amber and black are gone. They are real buttons with names.
  - The old `#1C1C1E` entries follow `--charcoal`, so they show in Night.
- **Links:**
  - An RSVP chip and its title open `/orgs/<handle>?event=<id>`.
  - The day panel adds the club's name, "Event chat" (when the event has one) and "Add to calendar app" (.ics), as My Calendar does.
  - Links leave through `__vibeTopNav`. A click with Cmd, Ctrl, Shift or Alt keeps the browser's own meaning.
  - Every title, place and note is escaped. The old code put entry names into the page as raw HTML, and event titles are other people's words.
- **The grid (as B8's D11):**
  - The modal is `min(1040px, 100vw - 48px)` wide, with seven `minmax(0,1fr)` columns and fixed 96px days.
  - Each day shows two chips, then "+N more".
  - The day number is the day's button, with a spoken label ("Thu, Oct 15, 1 event"). Focus stays on the picked day after the grid redraws.
  - Today and the picked day get an inside ring, so their size never changes.
- **Sync (B8's twin):** the page listens on `BroadcastChannel('vibe-calendar')` and on the page's own `vibe:calendar-changed` event.
  - A hidden tab waits, then reads once when it is looked at again.
  - Coming back to the tab with the calendar open re-reads at most every 30 seconds.
  - This covers the Otto-corner window, since its RsvpSheet posts on the channel.
- **The old list (`vibe_cal_events_v1`):** each time the calendar opens and the old list still has entries, a coral note above the grid offers to move them. It reads "N events are saved only in this browser (names). Move them … so they show on your phone and in My Calendar too." The buttons are **Move them** and **Discard**; Discard asks a second time.
  - Move sends one POST per entry, oldest first, then clears the list.
  - If a move stops part way (the hourly limit is 60), the entries not yet moved stay in the list, and a message says "Moved 1 of 2. The rest stay in this browser."
  - The old demo seeds are never moved. Neither is a day that doesn't exist.
  - An entry with no time moves to 9am.
- **Not done:** `messages.html` (B7's file) still has its own copy of the old list for its old full-page calendar. That calendar only shows when chat_desktop is off, which it isn't today. Moving entries on /profile empties that list for it too.

## 2. Desktop Saved text tiles show whole lines at every width (fixed)

- **The fix:**
  - The tile is now a size container (`container: saved-tile / size`).
  - The clamp and the `max-height` are always the same whole number of lines. They follow the tile's text height: 6 lines from 113.1px, then 5, 4, 3 and 2, each step just under a whole 18.85px line. `max-height:100%` is gone.
  - `word-break:break-word` became `overflow-wrap:anywhere`.
  - From 761 to 1023px wide, the tile frame is 10px and the play badge is 20px.
  - Words are hyphenated only in tiles under 90px of text width. There, many words are longer than the line, and the hyphen falls where English allows one.
- **Measured** at 761, 800, 880, 900, 1024 and 1440, in Light and Night. Every text tile shows a whole number of lines (4 at 761 and 800, up to 6 at 880 and wider) and ends inside its frame.
- **Word breaks:** only one word breaks across a line. That is "rehearsal," in the 97px video tile at 761, and it breaks as "re-hearsal,", with a hyphen. Nothing breaks at 880 or wider.
- **Shots:** `B6-desk-saved-{761,800,900}-{light,night}.png`.

## 3. The phone card's open button says the caption (fixed)

- **The name:** `postOpenLabel` in the new `src/lib/profile/profile-caption.ts` makes "Open post: <caption>, 2d ago".
  - The caption goes on one line, cut at a word near 80 characters, with "…".
  - With no caption it says "Open photo post, …" or "Open video post, …". It says just "Open post" when the kind isn't known.
- **Data:** `media_kind` was added to `PostRow` (`/api/me/posts` already sends it).
- **Measured:** "Open post: Friday night lights., Oct 8" and similar.
- **Saved tiles:** `savedTileLabel` moved into `saved-tile.ts`, with no change in what it says.

## 4. One TypeScript source for the tag rule (fixed, together with B1)

- **B1's side:** while this round ran, B1 rebuilt `captionSegments` on top of `captionTagRanges`. That file is B1's and I didn't touch it. So `captionTagRanges` is now the one tag rule.
- **The phone card:** it now cuts its caption with `profileCaptionParts`, which is `captionSegments`. Its own mention regex (`CARD_MENTION_RE`, `@` plus 1 to 32 characters) and `pushMentions` are gone. So "@jo" is plain text on the profile card, as on the feed card. A mention is `@` plus 3 to 32 characters everywhere in TypeScript.
- **The twin test:** `static-profile-tags.test.ts` now runs `captionSegments` and `profileCaptionParts` beside `captionTagRanges` and both static twins, on every sample and on the 1,500-caption fuzz. It also checks that the segments join back to the caption. A tag rule changed in one place only now fails a test.
- **Left as is:** the desktop viewer's mention LINK rule (`_postViewer.js`, 3 to 20 characters). It links to `/profile/<handle>`, and handles are at most 20 characters, so a longer one would link to nothing.

## 5. Tests that prove what they claim (fixed)

- **New `profile-caption.test.ts`, 8 tests:**
  - '#tag@name', '@a #tag' and '@ava #tag', '#Tag #tag' (same lower-case filter), and a link's #fragment.
  - Keys are unique, the parts join back, and only tags carry a link.
  - The open-button names and the cut at about 80 characters.
  - `savedTileLabel`.
- **The D1 check:** a small walker counts `<div>` and `</div>` from the composer's opening tag, then asserts that the next tag is `<div class="content-tabs">`. A built-in case proves that an element slipped in between gets caught.
- **Removed:** the `savedTileThumb(p)` call count.
- **New Saved CSS test:** it reads the font size, line height and every container step out of the page. Then it walks every text height from 30 to 200px and checks that the clamp there fits, and that one more line wouldn't. It caught my first thresholds (113/94/75/56px), which were a fraction too high, and that is why the steps sit at 113.09, 94.24, 75.39 and 56.54px.
- **New `static-profile-calendar.test.ts`, 11 tests:** it runs the `cal-real` block on a fake page.
  - The key matches `calendar-key.ts` over a grid of inputs.
  - The read fills the days in start order and drops bad rows. A failed read keeps what was shown, or shows the error with nothing shown.
  - Chips: the three looks, titles escaped, an unsafe colour falls back to grey, and RSVPs link to the club page.
  - The day panel: RSVPs have links and no delete; yours has a delete.
  - Save: the POST body uses the local time, the channel post goes out, and nothing is written to localStorage.
  - Delete: only your own entries, never an RSVP.
  - The old list: what can move, the move itself, and a stop part way.
  - Sync: wrong messages are ignored, and a hidden tab waits.

## 6. The Night phone Reposts shot (retaken)

- **The shot:** `B6-phone-reposts-night.png` now shows the Reposts sub-tab selected, with the drawn icon, "Reposted 5d ago", the quote and "Reposted 3h ago". The Light one was retaken the same way.
- **Retaken too:** `B6-phone-posts-tags-{light,night}.png`, since the card's renderer changed. Both inline tag links are still there, and `#notsaved` and `x.com/tix#gameday` stay plain.
- **Checks:** the page is 390 wide, no page errors, and only the heartbeat was stubbed.

## Checks

- `npm test`: 3,507 of 3,507 pass. That includes the other batches' work in the tree.
- `npx tsc --noEmit -p .`: 0 errors.
- `npx eslint`:
  - The new and changed `src/lib` files are clean.
  - `ProfileMobile.tsx` has the same 11 findings as HEAD, all old (checked against HEAD's copy).
- `node --check`: passes on all 8 inline scripts of `profile.html` and on `_postViewer.js`.

## Browser check (local dev, LOCAL database, 1440x900 unless stated, Light and Night)

**blake, owner of his own /profile, on the real calendar.**
- **What it showed:** the calendar opened on his real RSVPs.
  - "Open Club Study Night" (Oct 20) was a Going chip linking to `/orgs/test_open_club?event=…`.
  - The ended "Chat Seed Game Night" (Oct 15) was Going too, and its day panel had the club, "Event chat" (`/messages?channel=…`) and "Add to calendar app", with no delete.
  - All 42 days were 98.3 x 96px, and the modal was 1040px wide.
- **Real writes, all through the app's routes, all undone:**
  - The offer moved a seeded old entry, "B6 test: old browser entry" (one POST). The old list was then empty.
  - The form saved "B6 test: dentist" (Oct 22, 3:30pm, purple), which showed as a Yours chip. The server's `/api/me/calendar` listed both entries as personal.
  - **Sync:** a second tab changed the Study Night RSVP to Interested (PUT) and posted on the channel. The first tab made exactly 1 read and the chip turned into the outline. Changing it back to Going made 1 read and the chip filled again.
  - Both B6 test entries were deleted from the page (two taps each, real DELETEs).
- **After the run:** `/api/me/calendar` matched the start exactly (2 RSVPs, both Going). No page errors; only heartbeats were stubbed.

**franky visiting /profile/hanasato.**
- The nav calendar shows franky's own RSVPs (Blitz Night Oct 14, Cookout Oct 18).
- Browser-only rows on Oct 21 (4 entries) show 2 chips and "+2 more", all inside the day.
- A title with `<i>` shows as text.
- The old black entry follows the ink token in Night.
- No page errors.

**Phone 390 (franky):** the open buttons say the caption (see 3), the tag links work, and Reposts shows correctly (see 6).

**Shots** (`shots/`):
- `B6-desk-cal-offer-*`, `B6-desk-cal-saved-*`, `B6-desk-cal-interested-*`, `B6-desk-cal-visitor-day-*`
- `B6-desk-saved-{761,800,900}-*`
- `B6-phone-posts-tags-*`, `B6-phone-reposts-*`

The red ring near a click in some shots is the app's CustomCursor.

**Scripts:** session scratchpad `b6r/`:
- `calcommon.mjs`: real writes only for the routes a check names
- `cal-real.mjs`, `cal-mock.mjs`
- `widths.mjs`, `phone.mjs`

## For the main session

- **Database:** no change.
- **Production:** nothing written.
- **Local database:** the only writes were through the app's routes (two "B6 test:" personal entries, both deleted, and blake's RSVP set to maybe and back to going).
- **Privacy Policy:** no change needed.
  - The desktop profile calendar now keeps your own entries on Vibe's servers instead of only in this browser, and moves old ones only when you tap Move.
  - "Personal calendar entries" is already a listed category (sections-1-3, the "Club events, your RSVPs (Going or Interested) and personal calendar entries" item), and it is already in the export and delete lists.
  - It shows only the viewer's own RSVPs and entries. Club names and event titles were already public club data.
- **D12 on /profile is built** (not committed). The close handoff can drop it from the open list once this merges.
- **At merge:**
  - `B8-handoff-profile-calendar.js` is applied and can be deleted.
  - B1's `caption-segments.ts` now imports `captionTagRanges`. Keep that file's signature as it is: both batches depend on it.
