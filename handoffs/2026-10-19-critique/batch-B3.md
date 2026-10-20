# Batch B3: one tag rule, plus the strip (Oct 19, 2026)

Built on decisions 3, 4 and 5. Nothing committed (workflow rule). No database change, no Privacy Policy change: nothing new is collected or shown, and the strip still shows counts only, never names.

## What changed

**The rule for new posts and edits** (`src/lib/posts/edit.ts`, re-exported by `src/lib/posts/tags.ts`):
- At most **5** tags a post (`POST_TAG_MAX`, was 10).
- Each tag is 2 to 32 of `a-z 0-9 _` with at least one letter (`isNewPostTag`).
- A tag starts at the beginning of the text or after a space or punctuation, never after a letter (any language), a digit, `_`, `#` or `/`. So `hello#world`, `x.com/page#section`, `x.com/#top` and `##hype` give no tag.
- A tag must end cleanly. If it runs on into more letters, an accent or a 33rd character, it is no tag at all, never cut short. `#café` gives nothing (it used to save `caf`). A 40-character tag gives nothing (it used to save the first 32).
- `normalizePostTags` (publish-post) uses the same write rule, so the desktop profile composer is held to 5 and 2-32-with-a-letter on the server even before B6 changes its own reader.

**Old tags keep working.** `isValidPostTag` and `POST_TAG_RE` (1-32, any mix) stay as the read rule and the database twin, so an old `#1`, or a post's 8th tag, still filters, links and trends. The database trigger was not changed (it still allows 10 and 1-32), which is the safe direction.

**Why the rule is defined in edit.ts.** edit.ts must stay import-free (client components and its test load it bare), and tags.ts pulls in the word filter. So edit.ts defines `POST_TAG_MAX`, `isNewPostTag` and `POST_TAG_IN_TEXT_RE`, and tags.ts re-exports the first two. One definition; a test checks they are the same objects.

**The strip** (`rolling-strip-view.ts`, `RollingStrip.tsx`):
- `STRIP_MAX_TAGS` is 5 (was 8). The feed shells still ask the route for 8. That's harmless.
- The count reads "N people" from 2 up. At 1 the chip shows the tag alone (new `tagChipCount`). The hover title ("1 person this week") is unchanged.
- A long tag ends in "…". **A judgement call:** the plan says the chip gets `maxWidth: 160`. I put the 160px cap on the tag text, not the whole chip. With "14 people" beside it, a 160px chip would cut ordinary 10-letter tags. The cap on the tag cuts only long ones, and the count is never the part that gets cut. A full chip is at most about 245px.

**Trending floor: not changed** (plan and decision 4). `TRENDING_MIN_AUTHORS` in `src/lib/trending/count-tags.ts` is still 1. On launch morning it goes to 2 (one line, plus `count-tags.test.ts:51`). With the new chip copy, every chip will then read "N people".

## Files changed
- `src/lib/posts/edit.ts`
- `src/lib/posts/tags.ts`
- `src/lib/posts/edit.test.ts`
- `src/lib/posts/tags.test.ts`
- `src/lib/posts/post-tag-filter.test.ts`: it asserted the old 10 and `caf` rules
- `src/components/campus/rolling-strip-view.ts`
- `src/components/campus/rolling-strip-view.test.ts`
- `src/components/campus/RollingStrip.tsx`

## Checks
- Tag and strip tests (edit, tags, post-tag-filter, caption-tags, count-tags, rolling-strip-view): 64 of 64 pass.
- `npm test`: 3,314 of 3,321 pass. All 7 failures are B4's school-events tests (B4 was mid-edit).
- `tsc --noEmit`: no errors in B3 files. The only errors are in B2's `reposters*.test.ts` and B4's `sources.test.ts`.
- `eslint` on all 8 files: clean.
- Every probe case in `hashtags/extractor-probe.jsonl` now has its new expected result, in the `PROBE` table in `edit.test.ts`.

## Browser check (blake, non-admin, local)
Trending was mocked in the browser with 8 tags (one 32 characters long, one used by 1 person). Every non-GET request was stubbed.
- At 390 (iPhone user agent) and 1440, Light and Night: 5 tag chips, the long tag cut with "…", `#mobile` with no number, no sideways page scroll.
- With real local data, the strip shows `#mobile` alone (before: `#mobile 1`).
- Screenshots: `shots/B3-strip-{390,1440}-{light,night}{,-zoom,-end}.png` (the `-end` shots scroll the strip to its last chips) and `shots/B3-real-390-light*.png`.

## For the main session
1. **Stale comments in files B3 doesn't own** still say "first 10" or "cut to 32": `src/lib/posts/caption-tags.ts:5-11`, `src/lib/posts/post-tag-filter.ts:5-9`, `src/lib/composer/helpers.ts:80-81`, and `src/app/api/posts/[id]/route.ts:778-781` (B1 owns that file). The behaviour is correct; only the wording is out of date.
2. **B6 (profile.html twin):** copy `POST_TAG_IN_TEXT_RE` from edit.ts as-is. It uses no lookbehind, so it parses on every browser. Then apply `isNewPostTag` and the cap of 5. The strongest twin test reads the page's regex literal and checks its `.source` equals `POST_TAG_IN_TEXT_RE.source`, then runs the `PROBE` table from `edit.test.ts`.
3. **B1 (inline highlight, `normalizeFeedTag`):** for client code, import from `@/lib/posts/edit`, not `@/lib/posts/tags`. tags.ts drags the word list into the browser bundle. The list isn't secret, but it's weight. `isValidPostTag` (read rule) lives only in tags.ts. If B1 needs it on the client, a 1-32 check inline, or moving it into edit.ts, is lighter.
4. **Edits shrink old tag lists.** Editing the text of an old post with 8 tags, or a `#1`, re-derives its tags under the new rule (up to 5, letters required). An edit that leaves the text unchanged leaves the tags alone. This is expected, but worth knowing.
5. ~~The dotted line shows through the tag chips~~: fixed in the repair below (it was both themes, not only Night).

## Repair after review (Oct 19, 2026)

Nine findings. B3 fixed 1, 2, 4, 5, 7 and 8 in its own files. 3, 6 and 9 sit in files B3 doesn't own, so they are written up below for the main session. None was rejected.

**1. Links no longer give tags** (`edit.ts`). New `POST_TAG_LINK_RE` and `blankPostLinks(text)`: before the tag regex runs, every link is turned into spaces of the same length. A link starts at `://` or at a domain followed by `/` (`x.com/`, `en.wikipedia.org/`) and runs to the end of its word. The domain's label takes `_` and `-` too, and the regex finds the leftmost start, so a link never begins in the middle of a tag: `#tagx.com/a` gives nothing, never a cut-short `tag`. A tag earlier in the same word still counts (`#gameday,iuhoosiers.com/tix` gives `gameday`). I left out a separate "starts with www." test: `www.x.com/...` is already a domain followed by `/`, and a bare `www.` matched `awww.#cute`. All five review cases now give `[]`.
**2. Tags right after emoji** (`edit.ts`). U+FE0E, U+FE0F and U+20E3 may come before a `#`: `❤️#love`, `⚽️#gameday` and `1️⃣#first` give their tags. A real combining accent (`cafe\u0301#xy`) still gives none. The end of a tag is unchanged, so `#top1️⃣` gives nothing (dropped, never cut to `top`).
**5. The lastIndex test can now fail** (`edit.test.ts`). It reads a 7-tag caption (past the cap of 5), then `#ab`, and checks the second gives `["ab"]` and both shared regexes have `lastIndex` 0.
- PROBE: the five link cases, `x.com/a#bc` (was `#b`, which the one-letter rule refused anyway), `❤️#love`, `⚽️#gameday`, `1️⃣#first`, `👍🏽#nice`, `cafe\u0301#xy`, `#top1️⃣` and the link-glued cases. A new `blankPostLinks` test checks that the length is kept.
- A 200,000-string fuzz (scratch only): the new rule never gave a tag the pre-Oct 19 rule didn't, and `blankPostLinks` always kept the length. The worst 2,000-character input takes about 5 ms.

**4. Solid chips** (`RollingStrip.tsx`). `TAG_CHIP` is now `linear-gradient(var(--tag-bg), var(--tag-bg)), var(--cream)`. The tint looks the same and the dots stop at the chip's edge, in Light and Night.
**7. The tag cap is 120px** (was 160). Measured at 390: `#homecomingweek` (14 letters) fits uncut, and the widest chip (32 w's plus "1234 people") is 221px, down from 262. The comment now gives these measured numbers.
**8. The hover title names the whole tag.** There is a new `tagChipHover(tag, count)` in `rolling-strip-view.ts` (with a test): "#a_very_long_tag_that_is_32_chars · 6 people this week".

**Files changed in the repair:** `src/lib/posts/edit.ts`, `src/lib/posts/edit.test.ts`, `src/components/campus/RollingStrip.tsx`, `src/components/campus/rolling-strip-view.ts`, `src/components/campus/rolling-strip-view.test.ts`.

**Checks:** `npm test` passes 3,353 of 3,353. `tsc --noEmit` is clean for the whole project. `eslint` is clean on all B3 files.
**Screenshots** (blake, local; trending mocked, every non-GET stubbed): `shots/B3-repair-{390,1440}-{light,night}{,-zoom,-end}.png` and `shots/B3-repair-390-light-mid.png`. No page scrolls sideways at either width.

### For the main session (files B3 doesn't own)
- **3. publish-post doesn't check tags against the caption.** `normalizePostTags(body.tags)` checks only the shape and the cap of 5. So a cut-short tag from today's profile composer, or `tags:["anything"]` from a direct call, is still saved. Fix in `src/app/api/me/publish-post/route.ts` (about line 157): `tags = extractPostTags(content)`, or keep only the `body.tags` entries that `extractPostTags(content)` also returns. Then publish and PATCH follow one rule on the server, link rule and emoji fix included, and B6's twin only matters for highlighting. Tightening the database trigger `posts_check_tags` would need Franky's yes for production.
- **6. Trending still uses the old read rule.** `readTag` in `src/lib/trending/count-tags.ts:48` uses `isValidPostTag`, so `#1` or `#2026` from old rows can still reach the strip (the mock shows "#1 999 people"). Recommendation: switch that line to `isNewPostTag` and add a test. Old tags would still filter and link through `isValidPostTag` and `?tag=`. It can ship with the launch-morning floor change.
- **9. Put the floor change on the launch checklist.** Add this line to `handoffs/2026-10-12-launch-checklist-audit.md` and to the session's close handoff: "Launch morning: TRENDING_MIN_AUTHORS 1 → 2 in src/lib/trending/count-tags.ts:29 and its assert in count-tags.test.ts:51". Tie it to whichever launch date Franky confirms (Oct 26 in roadmap v14, Oct 31 in vibe-marketing/CLAUDE.md).
- **B6 twin (profile.html):** copy BOTH `POST_TAG_IN_TEXT_RE` and `POST_TAG_LINK_RE` from edit.ts, and run the tag regex over the blanked text, as `blankPostLinks` does. Neither regex uses lookbehind. Then run the `PROBE` table against it.
- **B1 highlighter:** match `POST_TAG_IN_TEXT_RE` over `blankPostLinks(caption)`. The length is kept, so the match positions work on the original caption. Import from `@/lib/posts/edit`.

## Final check across B2, B3, B4 (Oct 19, 2026)

`npx tsc --noEmit -p .` clean (exit 0). `npm test` 3364 of 3364 pass. `npx eslint` on all 33 changed files of B2, B3 and B4: no errors, no warnings. No fixes were needed. B5/B9 were already committed (7c35593) and nothing in their files failed.
