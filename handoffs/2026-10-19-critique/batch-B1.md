# Batch B1: feed and open post (Oct 19, 2026)

Built on decisions 1, 2 and 5 (repost line, "Reposted by", tags inside the caption only). Nothing is committed (workflow rule). Every edit stayed in B1's files, plus four new files listed below.

## Files

Changed (B1's own):
- `src/components/mobile/CampusMobile.tsx`: the phone feed card.
- `src/app/campus/campus-home.tsx`: the desktop feed row.
- `src/components/mobile/PostViewerMobile.tsx`: the open post.
- `src/app/api/posts/[id]/route.ts`: `viewer.reposted`.

New (in the plan):
- `src/lib/posts/engagement-store.ts` and `engagement-store.test.ts` (11 tests).
- `src/lib/feed/friend-repost-label.ts` and `friend-repost-label.test.ts` (8 tests).

New (not in the plan's list, no other batch touches them):
- `src/lib/feed/caption-segments.ts` and `caption-segments.test.ts` (7 tests). One caption cutter for the phone card, the desktop row and the open post, so the three can't read tags differently. It sits in the new `src/lib/feed/` folder, which only B1 uses.
- `src/components/feed/FriendRepostLine.tsx`. The repost line itself, shared by phone and desktop so they look the same. It is in B2's folder; B2 is finished and no wave-2 batch owns that folder.
- `src/lib/posts/post-read-route.test.ts` (4 tests). This is the post route's test. The route had no test before. It lives in `src/lib/posts/` for the same reason as B2's route test: `node --test` can't match a path with `[id]` in it.

## What changed

**1. One shared record per post (M1).** `engagement-store.ts` keeps `{liked, likeCount, saved, reposted, repostCount, commentCount}` for each post id, and screens read it with `useSyncExternalStore`.
- The feed seeds it: the phone feed, the phone #tag list and both desktop feed loads.
- A fresh server read overwrites it: opening a post, or refreshing the feed.
- A read never overwrites a group (like, save, repost or comment) while a tap on that group is still in flight. It also never overwrites a group tapped after the read was sent. Each read takes a token just before its request goes out, so a slow, stale answer can't undo a like.
- A tap changes the record at once. If the server refuses it, the record rolls back, on every screen together, and the toast says why. A second tap while the first is still out is dropped. That replaces the old `likingRef` / `repostingRef` / `savingRef` guards.
- The phone card, the open post and the desktop row all read and write it. The comment count goes up from a comment posted in the open post, or in the desktop comment box. The desktop Repost menu writes it after the server says yes.
- It holds only what the feed and the post read already send, in the tab's memory, at most 2,000 posts.

**2. "You reposted this" from the server.**
- `GET /api/posts/[id]` now sends `viewer.reposted`. It counts the caller's own `post_reposts` row on the cookie client, head-only, the same way it counts `viewer.liked`.
- The open post's Repost is now an on/off button with its count: green when on (`--ok-ink`), POST to repost, DELETE to undo. The old "Reposted" toast is gone, because the button now shows the state.
- Like, Repost and Save in the open post now have `aria-pressed`, plus labels such as "Unlike, 3 likes".

**3. The repost line (M2, decision 2a).**
- One quiet line above the author, the same on phone and desktop: a small green repost icon, up to 3 overlapping 16px faces, then grey 12px words. The names are in bold.
- The wording: "Maya reposted", "Maya and Jonah reposted", "Maya and 6 others reposted".
- The line is only as wide as its words. On desktop it stops 44px short of the card's right edge, so it never sits under the ⋯.
- Tapping it opens B2's `RepostersSheet` on the phone and `RepostersPopover` on desktop. The pop-up's anchor is kept as state, set from the click, and a second click closes it. On the phone, a tap on the line doesn't open the post.
- Removed:
  - the phone's green pill and `friendRepostLabel`
  - the desktop `FriendRepostPill`
  - the dead desktop `RepostBanner` (`/api/feed` only sends `kind: "post"`)
- **The number** follows B2's contract: "others" = the post's repost count minus the people named.
- **Judgement call:** your own repost is left out of "others" too. The list names you apart ("You reposted this.") and doesn't count you in its "+ N others", so "Maya and 1 other" can never secretly mean you. The rule is: others = repostCount − named − (you reposted ? 1 : 0), never below 0, and never fewer people than were named.
  - Example: 3 people you follow plus 4 others is 7 in all. The line reads "Maya and 6 others reposted". The list shows Maya, Jonah, Hana, then "+ 4 others reposted". That adds up: 6 = 2 + 4.
- **Judgement call:** each face with no photo shows one initial. Two initials at 16px were a smudge ("MO" read as "MC").

**4. Tags lit only when saved (decisions 3-5).**
- All three screens use `captionSegments(text, post.tags)`.
- A #tag lights up only where B3's rule finds one: `POST_TAG_IN_TEXT_RE` over `blankPostLinks`, the same reading the post got when it was saved. It also has to be in the post's saved `tags`.
- So `#notsaved`, `x.com/page#section` and `#café` are plain text, and only `#gameday` is a button.
- @mentions keep their old rule: 3 to 32 characters, not glued to a word.
- `normalizeFeedTag` (phone) now uses the read rule `^[a-z0-9_]{1,32}$`. That is `POST_TAG_RE` / `isValidPostTag` in `tags.ts`, copied inline with a comment naming its twin, because importing `tags.ts` pulls the word list into the browser (B3 note 3). It used to accept any letter, including "é".

**5. Tags inside the caption only (decision 5).**
- **Phone card:** the caption's tags are buttons. A tap filters the feed and doesn't open the post. The chip row is gone.
- **Open post:** the duplicate chip row is gone, and the tags are links inside the caption.
- **Desktop:** it had no chip row. Its caption tags now follow the saved-only rule.

**6. Also fixed in the open post (judgement call, my file).** The top bar, the ⋯ menu and the comment box were fixed Light colours: a pale cream strip at the top and bottom of a Night page. They now use theme tokens: `--cream-92`, `--paper`, `--paper-70`, `--charcoal`, `rgba(var(--scrim-rgb),…)` and `--error-ink`. Light is all but unchanged (cream 250,247,242 in place of 255,253,248).

## Checks

- **New tests:** 30 of 30 pass (store 11, label 8, caption 7, post route 4). With B2's, B3's and the tests that read B1's sources (engagement-icons, vibe-bloom, org-mark, event-checkin, join-copy, follow-label, r2-sign, active-now, touch, use-is-mobile, signed-out-reads, engagement-counts), 278 of 278 pass.
- **`npm test`:** 3,459 of 3,460 pass. The one failure is `src/components/events/checkin/door-screen.test.ts` ("doorAfterLine: no 'yet' once check-in has ended"), which belongs to another batch in progress (`DoorView.tsx` is being edited). An earlier run showed 3 failures in `src/lib/chat/remove-route.test.ts` (B7, in progress). None of them are B1's.
- **`npx tsc --noEmit -p .`:** no errors in B1 files. The only errors are in B7's in-progress `src/components/mobile/messages/delete-rules.test.ts`.
- **`npx eslint`:**
  - The new files are clean.
  - The four changed files have no new findings. I checked each against `git show HEAD:<file> | eslint --stdin`.
  - Their old findings are unchanged: 4 `set-state-in-effect` errors in CampusMobile, the unused `ShareIcon` in the viewer, and the unused `GlassCard` and `handleShare` plus 4 `window.location` warnings in campus-home.
- **Mutation sense check:** the route test reads reposts the way the database rules play them (each account sees only its own rows on the cookie client). So a route that counted every repost row, or read on the service role, fails the "only other people reposted" test.

## Browser check

Setup:
- Local dev server, signed in as **blake** (a non-admin member). He is also the **owner** of 3 of the 4 local posts, so the owner case is covered.
- Every write was stubbed in the browser. Nothing was written to any database.
- A simulated "server truth" fed the single-post read, as in the critique's `feed/` scripts.
- The repost names, and the "Reposted by" list answer, were mocked: the local database has no reposts.
- The scripts are in the session scratchpad, `b1/`: `sync-phone.mjs`, `line.mjs`, `owner-viewer.mjs`, `desk-sync.mjs`, `tagtap-desk.mjs`.

**Sync, phone 390 (iPhone user agent), Light and Night, with the same results in both:**

| Step | Feed card | Open post |
|---|---|---|
| Feed loaded | liked, 1 | (closed) |
| Unlike in the post | unliked, 0 at once | unliked, 0 |
| Save in the post | saved | saved |
| Repost in the post | repost on, 1 | repost on, 1 |
| Comment in the post | comments 1 | |
| Close the post | all of the above kept | |
| Like on the card, then open the post | | liked, 1 |
| Undo repost in the post | repost off, 0 | repost off, 0 |
| A refused (500) unlike in the post | stays liked | stays liked |

No sideways scroll (390 / 390) and no page errors.

**Desktop row, 1440:** like and save write the shared record, and a refused save stays off.

**The repost line, at 390 and 1440, Light and Night:**
- Phone widths: 127, 223 and 201px on a 358px card.
- Desktop widths: the same, on a 672px card, with 389 to 485px of space before the ⋯. It never overlaps the ⋯.
- A tap opens "Reposted by" (the sheet on the phone, the pop-up on desktop) without opening the post, and Esc closes it.

**Caption tags:**
- Only `#gameday` is a button. `#notsaved` and `x.com/page#section` are plain text, and there is no chip row.
- A tap filters the feed: "#gameday ×" on the phone, "Posts tagged #gameday" on desktop. The post doesn't open.

**Owner, open post, 390, both themes:** `#mobile` shows once, inside the caption. The bar reads "Like, 0 likes", "Repost, 0 reposts", "1 views — see who saw this" and "Save". The Night header is now dark.

**Screenshots in `shots/`:**
- `B1-sync-390-{light,night}-{0-card,1-post,2-card-after}.png`
- `B1-line-{390,1440}-{light,night}.png` and `-zoom.png`
- `B1-reposted-by-{390,1440}-{light,night}.png`
- `B1-caption-tags-{390,1440}-{light,night}.png` and `B1-caption-tag-tapped-1440-light.png`
- `B1-owner-post-390-{light,night}.png`

## For the main session

- **No database change, no Privacy Policy change, no production step.**
  - `viewer.reposted` is the caller's own state.
  - The line names the same people the old pill named (people you follow), with the same photos.
  - The repost count was already public on the card.
  - The Policy already covers reposts (`sections-4-5.tsx`, B2's check).
  - The store is per tab, in memory only, and keeps nothing new.
- **Not done, and optional:** refreshing the line's number from the list's `total` when the list opens (B2's contract suggests it). B2's hook lives inside its own files, so B1 can't read that answer without editing them. The line already uses the live repost count from the shared record.
- **For B6 (profile):**
  - `GET /api/posts/[id]` now carries `viewer.reposted`.
  - ProfileMobile's grids don't read the shared record yet. `usePostEngagement(postId, fallback)` and `seedEngagementFromFeed` are ready if B6 wants profile cards to follow the open post.
  - `captionSegments(text, tags)` is the caption cutter to reuse.
- **A side effect of decision 5, worth a line in the docs:**
  - A tag saved under the old rule that the new rule can't find in the caption is no longer shown or tappable on the cards, now that the chips are gone. Examples: `caf` from "#café", `section` from a link, a 1-character `#1`. Typing `?tag=` by hand still filters them.
  - Production has 7 posts with tags, so this is small.
- **The critique's scripts are now out of date.** `handoffs/2026-10-19-critique/feed/scripts/like-sync.mjs` finds the open post's Like by looking for a button labelled "Repost" and walking back from it. That button now says "Repost, N reposts", so the script won't find it. Its replacement is `b1/sync-phone.mjs` in the scratchpad.
- **Review:** I did a self-review of the full diff only. No separate adversarial reviewer ran inside this batch.

## Review fixes (Oct 19, second pass)

All 7 findings were right, and all 7 are fixed. Nothing is committed (workflow rule).

**1. A read sent during a tap could undo it (store race).**
- `commit()` and `rollback()` now re-stamp the group as the tap settles. Any read sent before that moment is too old for that group; a read sent after it overwrites as usual.
- 2 new store tests: a read sent during the tap that lands after commit, and the same for a refused tap. Both fail without the fix (checked on a copy).
- Browser, 390, Light and Night (the reviewer's r3 script, DELETE delayed 0.8 s, post read delayed 2.5 s with the old state): the card and the open post stay unliked, 0 after the stale read lands, and the next tap in the post sends a POST like, not a second DELETE.

**2. "Couldn't count" became 0 on the card.**
- `GET /api/posts/[id]` now leaves a key out when it couldn't read it: `likes` and `reposts` when the count RPC fails, `comments` when its count fails, and `viewer.liked` / `saved` / `reposted` when that own-row read fails. Each failure is logged.
- The open post passes the store only real numbers and booleans (no `num()` on that path).
- `seedEngagementFromFeed` now skips a missing or null field too, so a feed refresh can't zero a good value either.
- 2 new route tests (RPC failure; comment count plus own-row failures) and 1 new store test.
- `_postViewer.js` reads `(counts.likes) || 0` and `!!viewer.liked`, so an absent key looks the same there as before.
- **/api/feed is not B1's file.** The matching server half (send null for a field whose sub-read failed) is a patch for the main session: `B1-feed-route-unread-null.patch` (it applies cleanly; the client side already handles null).
- Browser, 390, both themes: with the fixed route's degraded answer (likes, reposts, comments and viewer.liked left out), the card keeps liked, 1 before and after the post closes.

**3. Two caption highlighters.** `captionSegments` now takes its tags from B6's `captionTagRanges` and only adds the mention pass, so the feed, the open post, the profile and the static twins share one TS source. The trim and `#`-strip on saved tags are gone (stored tags never have them). A new test runs edit.test.ts's PROBE table through both and checks they agree. **For the main session:** B6 owns `caption-tag-ranges.ts`; B1 only imports it.

**4. The ellipsis cut "reposted".** The names now take the "…" and " and N others reposted" never shrinks. At 390, 'Maximiliana-Alexa… and 1.2K others reposted' (`shots/B1-fix-longname-390-{light,night}.png`).

**5. Count formats differed.**
- New `src/lib/feed/compact-count.ts` (and test): "999", "1.2K", "12K", "1.2M". It is the desktop row's old rule, with one fix: 999,500 and up now reads "1M", not "1000K".
- The repost line, its spoken label, the desktop row's buttons and the phone card's like / comment / repost counts all use it. At 1440 the line reads "and 1.2K others" over a "1.2K" button (`shots/B1-fix-longname-1440-{light,night}.png`).
- Judgement call: the phone card's counts changed too (they printed a bare "1234"), so phone and desktop agree. No production post is near 1,000.

**6. The phone tap target was 24px.** The phone line is now 44px tall, with -10px / -2px margins, so it sits exactly where it did. Checked: the author row is still 47px from the card's top. A tap 21px above the line's middle still hits it. Desktop is unchanged (24px).

**7. Hidden caption tags took keyboard focus.**
- A tag button below the phone card's 4-line clamp now gets `tabIndex=-1`. It is re-measured when the caption changes, the card resizes or fonts load.
- Screen readers still read the whole caption, as with any clamped text, and the open post has every tag.
- Checked with a 6-line caption: the line-1 `#gameday` is tab 0, the line-6 one is -1.

**Checks.**
- `npm test`: 3,478 of 3,478 pass.
- `npx tsc --noEmit -p .`: clean.
- eslint on every B1 file: no new findings. The same 4 old `set-state-in-effect` errors in CampusMobile remain, plus the unused `ShareIcon` / `GlassCard` / `handleShare` and 4 `window.location` warnings.

**Browser re-checks.** Every one ran as blake, with every write stubbed.
- The sync table above, at 390 in both themes: unchanged.
- The repost line: widths 127 / 223 / 201px, never under the ⋯. The phone height is now 44px; desktop stays 24px. The sheet and the pop-up still open without opening the post.
- Caption tags: only `#gameday` is a button. A tap filters ("#gameday ×" on the phone, "Posts tagged #gameday" on desktop).
- Owner post: labels unchanged, and the Night header is dark.
- No sideways scroll and no page errors.
- Re-taken shots: `B1-line-*`, `B1-reposted-by-*`, `B1-caption-tags-*`, `B1-caption-tag-tapped-1440-light`, `B1-sync-*`, `B1-owner-post-*`.
- New shots: `B1-fix-r3-{light,night}.png`, `B1-fix-r2b-card-{light,night}.png`, `B1-fix-longname-{390,1440}-{light,night}.png`.

**Privacy.** Nothing new is shown or kept about anyone. The post read now sends *less* when a read fails. No Policy change.
