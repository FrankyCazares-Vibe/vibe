# Batch B2: "Reposted by" list (Oct 19, 2026)

Built on decision 1(a): the list names the people you follow and shows everyone else as a number. Nothing is committed.

## Files

New:
- `src/lib/posts/reposters.ts`: the rules and the words. No database, no `@/` imports.
- `src/lib/posts/reposters.test.ts`: 10 tests (8 before the review repair).
- `src/app/api/posts/[id]/reposters/route.ts`: `GET /api/posts/[id]/reposters`.
- `src/lib/posts/reposters-route.test.ts`: 14 tests that run the route against fakes (10 before the review repair). It lives in `src/lib/posts/` because `node --test` reads its arguments as globs, and a path with `[id]` never matches (the same reason as `attendees-route.test.ts`).
- `src/components/feed/RepostersSheet.tsx`: the phone bottom sheet.
- `src/components/feed/RepostersPopover.tsx`: the desktop pop-up.
- `src/components/feed/reposters-list.tsx`: **one extra new file the plan didn't list.** It holds the fetch hook and the list, shared by the sheet and the pop-up, so the two can't word or count anything differently. It sits in the new `feed/` folder, which only B2 owns.

Changed:
- `src/lib/limits/budgets.ts`: one new budget, `repostersRead`, 600 a day per account. It uses a day window so the count never says *when* someone opened a list.

## The route

- Signed out: 401. Over budget: 429. Both checks run before anything is read.
- The post must be one you can see. Since the review repair this is the shared `postAccessForCaller`, the same check the repost, comments, save and view routes use, plus the block check those routes add. A missing post, a non-uuid id, someone else's draft or removed post, a post by a suspended or banned author, a block with the author in either direction, or a hidden club's post when you aren't a member all get the same 404 "Post not found", the same as `GET /api/posts/[id]`. The author always gets their own post's list.
- Answer: `{ ok, followed: [{ id, name, handle, avatar_url, follows_you }], followed_total, others_total, viewer_reposted, total }`.
  - **Two fields the plan didn't have:**
    - `follows_you` makes the button say Connected ✓ rather than Following ✓.
    - `viewer_reposted` drives the "You reposted this." line.
    - `total` (added in the review repair) is the post's repost count as the list read it, your own repost included.
    - All three are additions, and the plan's three keys are unchanged.
  - `others_total` = repost count − `followed_total` − (1 if you reposted), never below 0. That way the line, the list and the post's own repost number always add up.
  - The list names only people you follow, leaving out anyone blocked either way or muted right now. Those people are still counted in the number.
  - A followed person whose profile can't be read is counted, not named.
  - At most 100 names. Past that, the rest are still in `followed_total`.
  - A suspended or banned person is counted, never named: their profile is read on your own client, whose database rules hide them.
- Other people's repost rows are read with the service role, by post, at most 1,000 rows (the database server's own ceiling; the old "2,000" could never come back), newest first.
- Then the route asks "which of these reposters do I follow?", 100 ids at a time. It used to read your whole follow list, which stops at 1,000 rows with no set order, so someone following more than 1,000 people could see different names on two opens.
- If any read that decides who gets named fails, the answer is a 500, never a list of names. Every answer sends `Cache-Control: private, no-store`.

## Contract for B1

- `<RepostersSheet postId open onClose />` on the phone. It returns focus to whatever had it when it opened.
- `<RepostersPopover postId open onClose anchor />` on desktop.
  - Pass the anchor element **as state**, e.g. `useState<HTMLElement|null>` set from the click's `currentTarget`, not as `ref.current` during render.
  - It closes on Esc, on a press outside, when Tab walks off either end, when focus goes to something outside, and when the line scrolls out of sight (also inside an inner scrolling box).
  - A press on the anchor itself is left to the anchor's own click, so make the click toggle `open`.
  - Focus goes back to the line only after Esc or Shift+Tab off the top, or when B1 closes it while focus is inside. Tab off the bottom goes on to the next stop after the line. A press outside, a scroll-away, or a click into a comment box leaves focus where it went.
  - Its Esc is heard first, on the window, and stopped there, so opening it from inside a desktop modal is safe: one Esc closes only the pop-up.
- Both components read the list each time they open, so B1 passes nothing but the post id.

**The line's number (from the review, Oct 19, 2026). B1 must follow this.**
- "Others" means the same group on the line and in the list: everyone the words on screen haven't named.
- So the line's "N others" is the post's **repost count minus the people the line names**. It is not `friend_reposter_count − 1`, which is what the feed's label does today (`CampusMobile.tsx` `friendRepostLabel`, and `campus-home.tsx` `FriendRepostPill`).
- Example: 3 people you follow and 12 others reposted (15 in all). The line reads "Maya and 14 others reposted". The list shows Maya, Jonah and Priya, then "+ 12 others reposted". Today's math would say "Maya and 2 others", and "others" would mean two different groups one tap apart.
- "Maya and Jonah reposted" only when those two are the whole count.
- The list's answer carries `total`, the same count, so B1 can refresh the line from it when the list opens. The rule is `total = followed_total + others_total + (viewer_reposted ? 1 : 0)`, except in the rare case where a repost lands between two reads and `others_total` stops at 0.
- No privacy change: the repost count is already public, and the line still names only people you follow.

## Words

- "Reposted by"
- "You reposted this."
- "+ 12 others reposted" (or "+ 1 other reposted")
- When nobody you follow reposted: "5 people reposted this", then "You see names only for people you follow."
- With no reposts at all: "No reposts yet."

## Checks (first build)

- Tests: `node --test src/lib/posts/reposters.test.ts src/lib/posts/reposters-route.test.ts` pass 18 of 18. With `social-limits.test.ts` added, 24 of 24 pass.
- Mutation check: I swapped the service read for the cookie client and dropped the block and mute filter. The tests failed both times, as they should.
- Full `npm test`: 3,348 of 3,349 pass. The one failure is B4's in-progress `school-card.test.ts`, not B2.
- `npx tsc --noEmit -p .`: my files are clean. The remaining errors are in B4's `school-card.test.ts` and `sources.test.ts`.
- `npx eslint` on every B2 file: clean.
- Live route on the LOCAL database (curl as seed accounts):
  - blake got avery named, 2 others and "you reposted".
  - drew got no names, 3 others and "you reposted".
  - Signed out got 401, and both a bad id and a missing post got 404.
  - The 4 test repost rows were deleted afterwards. The local `post_reposts` table is back to 0.

## Screenshots

In `shots/`:
- `B2-sheet-390-{light,night}.png`, `B2-sheet-390-strangers-{light,night}.png`
- `B2-popover-1440-{light,night}.png`, `B2-popover-1440-you-{light,night}.png`, `B2-popover-1440-failed-{light,night}.png`
- `B2-sheet-390-light-real-local.png`: the real route on the local database, not mocked.

How they were taken:
- The components were drawn alone on a temporary page (`src/app/b2-harness`), which is now **deleted**. The list answers were mocked with Playwright, and the follow call was mocked too, so nothing was written.
- 390x844 used an iPhone user agent. Both themes and both sizes were checked.
- The page never scrolls sideways at 390px.
- Tested and passing: tapping Follow, Close, Esc, a press outside, the anchor toggling the pop-up, and focus moving in and back out. There were no console errors.

## Review repair (Oct 19, 2026)

The review sent 11 entries: 10 findings and 1 "checked, sound" note. I fixed 9 fully and 1 in part (#8). I rejected none.

1. **Focus jumped back to the line** after a click on bare page, or in Safari after any button. Fixed: a press outside now never moves focus. Focus goes back to the line only after Esc, Shift+Tab off the top, or when B1 closes it while focus is inside. Checked in Chromium: after a bare click, and after a button press that doesn't take focus (the Safari case, simulated), focus is on `<body>` and Space no longer reopens the list.
2. **The pop-up stuck to the top of the window** after its line scrolled away. Fixed: it closes once the line is out of sight. It uses an IntersectionObserver, so it also catches the line leaving an inner scrolling box, not just the window. A small scroll keeps it open and still under the line.
3. **Tab order.** Fixed: Shift+Tab off the first stop (or off the box) closes it and focuses the line. Tab off the last Follow button closes it and goes on to the next stop after the line, as if the box sat right after it. Checked: from the last button, focus landed on the post's next button.
4. **The test fake didn't play the database rules for `users` and `posts`.** Fixed. The fake now hides suspended and banned people from your own client, and hides someone else's drafts, removed posts and posts by restricted authors. It also stops every read at 1,000 rows, as the database server does. New tests:
   - a suspended followed reposter is counted, not named;
   - someone else's draft, removed post or restricted author's post is a 404, but your own draft is not;
   - a member of a hidden club gets its list.
   - Mutation checks: I read profiles on the service role, read the post on the service role, dropped the block check, and went back to the old whole-follow-list read. Each one turned exactly one test red.
5. **The 2,000 cap was really 1,000.** Fixed: `MAX_REPOST_ROWS` is now 1000, with the reason in the comment. The follow read no longer depends on a list cut at 1,000. The route asks about the reposters themselves, 100 at a time, all at once. A tie-break order on the repost read keeps the 1,000 cut the same on every open.
6. **"Others" meant two groups.** Fixed in the contract above ("The line's number"), plus `total` in the answer.
7. **The route copied the post-access rule by hand.** Fixed: it calls `postAccessForCaller`, then the block check, the same way the repost route does. That costs one extra key lookup, because the helper doesn't return the author. The test now runs the real helper, not a stand-in.
8. **A second people row instead of UserRow.** Fixed in part.
   - Names now use `next/link` with `prefetch={false}`: a client-side move, and no 100 profile fetches when the list opens. Checked on the phone sheet: the tap went to `/profile/avery` without a page reload.
   - **Not reused:** `UserRow`. Its colours are fixed Light ones (a `#FFD3C2` face, a white Following ✓ pill), which would glow in Night, and its link pieces aren't exported from `NetworkMobile.tsx`, which isn't B2's file.
   - What must match already does: the button words, the Unfollow confirm and the follow call all come from `follow-label.ts`. The reason is in the file's header.
9. **Sticky hover on phones, and @handle shown twice.** Fixed: the hover tint sits inside `@media (hover: hover)`, and a person with no name shows `@handle` once. Checked: no tint after a tap on the phone, and one `@noname_handle` line.
10. **The Esc comment was wrong.** Fixed in code, not just the comment. Esc is now heard first, on the window, and stopped entirely. Checked: with a page-level Esc listener on the document, the first Esc closed only the pop-up, and the second Esc reached the page.
11. **Note: nothing to fix.** I re-checked it live after the changes (below).

**Checks after the repair:**
- B2 tests: 24 of 24 pass (10 rules + 14 route).
- Full `npm test`: 3,364 of 3,364 pass.
- `npx tsc --noEmit -p .`: clean.
- `npx eslint` on every B2 file: clean.
- Browser, temporary page `src/app/zz-b2-review` (now **deleted**), drew (non-admin), mocked list, mocked follow call: no console errors, and no sideways scroll at 390 in either theme.
- Live route on the LOCAL database, as seed accounts:
  - blake, with noor (followed) banned: avery named, 2 others, "you reposted", total 4. Once the ban was lifted, noor and avery were both named.
  - drew: no names, 4 others.
  - A temporary hidden-club post: 404 for drew and blake, 200 for avery (its author). `GET /api/posts/[id]` gave the same 404 and 200.
  - A temporary draft: 404 for drew, 200 for its author.
  - Signed out got 401. A bad id got 404. Every answer sent `private, no-store`.
- Everything I inserted locally (4 reposts, 1 follow, 1 ban, 2 posts, with triggers off so no notifications were made) was deleted. Local `post_reposts` is back to 0, and there are no restrictions in force.

**New screenshots in `shots/`:**
- `B2-repair-pop-1440-{light,night}.png`
- `B2-repair-sheet-390-{light,night}.png`
- `B2-repair-pop-1440-scrolled-light.png`: after scrolling the line away, the pop-up is gone.

## For the main session

- **No database change. No Privacy Policy change.** The Policy already shows "Your comments and reposts" and "The people you follow and who follows you" to any signed-in account (`src/app/legal/privacy/sections-4-5.tsx`). This list names only people you follow, the same people the feed's repost line already names.
- Nothing was written to production.

## Final check across B2, B3, B4 (Oct 19, 2026)

`npx tsc --noEmit -p .` clean (exit 0). `npm test` 3364 of 3364 pass. `npx eslint` on all 33 changed files of B2, B3 and B4: no errors, no warnings. No fixes were needed. B5/B9 were already committed (7c35593) and nothing in their files failed.
