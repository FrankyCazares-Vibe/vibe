# B9: Otto stats tidy-up (Oct 19, 2026)

Status: built, reviewed, repaired, tested, browser-checked. Not committed.

## Files
- NEW `src/components/icons/engagement-icons.tsx`: EyeIcon, LikeIcon, CommentIcon, RepostIcon, BookmarkIcon. Copied path for path from `campus-home.tsx` (now lines 10087-10162). Adds a `size` prop (default 16), plus `filled` on Like and Bookmark. `campus-home.tsx` keeps its own copies and wasn't touched.
- NEW `src/components/icons/engagement-icons.test.ts`: a drift test. It reads both sources and compares viewBox, paths, circles and stroke widths per icon. It also checks the icons are aria-hidden with no hard-coded colour, and that `OttoMetrics.tsx` imports them and has no ❤ 💬 ↻ 🔖 left.
- NEW `src/components/otto/metrics-count.ts`: `fmtCount` (the old `fmt`, moved), `pluralNoun`, `countWithNoun` ("1 comment") and `spokenCount` ("1,234 views", for screen readers). Pure, no imports. The plan's owned list didn't name it, but node's test runner can't import a .tsx file, so the plural helper needs its own .ts.
- NEW `src/components/otto/metrics-count.test.ts`: 6 tests (singulars, an irregular plural, the short form unchanged, at most 4 characters, the exact spoken number).
- `src/components/otto/OttoMetrics.tsx`:
  - Each top-post count is its own cell: a 13px icon plus the number. The "·" separators are gone.
  - Screen readers hear ", 7 views" and the like; the short form and the icon are aria-hidden. A hover `title` gives the same words.
  - The Saves column shows only when a row sends `save_count`. A row without it gets an empty cell, never 0.
  - Singular forms: "1 post", "1 like", "1 comment", "1 repost", "1 save", in the window rows and the Posts sub-header.
  - The title slice went from 80 to 120 characters, so the CSS "…" always does the cutting.
  - The window-row dots are aria-hidden.
- `src/app/globals.css`, `.otto-metrics*` rules only:
  - `.otto-metrics` is `repeat(2, minmax(0,1fr))`; the 760px rule is `minmax(0,1fr)`.
  - `.otto-metrics-block` gets `min-width: 0`. The 4-tile grids are `minmax(0,1fr)` too.
  - `.otto-metrics-top-row` is a grid: `minmax(0,1fr) repeat(5, 44px)` (4 columns with `--no-saves`), digits are tabular and muted, plus hover and focus-visible states.
  - New `.otto-metrics-sr` (visually hidden).
  - `.otto-metrics-top` is a size container. Under 420px the title takes its own line and the counts sit in their columns below it. This covers the phone, and a 1024px desktop where each half is 363px. Only the list is a container, because containment also traps `position: fixed` children.
  - The colours keep the Otto room's light-on-dark rgba ink, not the app tokens. Otto stays dark in Light mode until the revamp (D8), and tokens would print dark ink on its dark background. The CSS comment says so.

## Checks
- `node --test` on the two new test files: 13/13 pass.
- `npx eslint` on all 5 files: clean.
- `npx tsc --noEmit -p .`: no errors in any B9 file. Its first full run exited 0. Later runs show errors only in other batches' in-flight files: `src/lib/posts/reposters.test.ts` and `reposters-route.test.ts` (B2), and `src/lib/school-events/sources.test.ts` (B4).
- `npm test`: 3321 tests, 3268 pass, 53 fail. All 53 are in `school-events/route.test.ts`, `sources.test.ts` and `switch.test.ts`, B4's area, which is in flight. The check-in tests are green.

## Browser check (blake, non-admin; numbers mocked in the browser, every write stubbed)
- 1440x900, Night and Light: two equal 441px halves. No label wraps (the "30 DAYS" wrap is gone). The count cells sit at the same x on every row (1025/1075/1125/1175/1225), and none are clipped.
- 390x844 iPhone UA, Night and Light: both halves 328px, inside the screen (31 to 359). The rows stack, all counts are visible and none are clipped.
- 1024x900, no saves in the payload: the rows stack in 4 columns and the title uses the full 363px.
- Light: Otto stays dark next to the cream sidebar and tab bar. That's expected until the revamp.
- Shots: `shots/B9-desktop-night.png`, `B9-desktop-light.png`, `B9-desktop-night-top-posts-zoom.png`, `B9-phone-night.png` (full page), `B9-phone-night-top-posts.png`, `B9-phone-light.png`, `B9-phone-light-top-posts.png`, `B9-mid-night.png`, `B9-mid-night-top-posts-zoom.png`.

## Was open: the phone page was 15px wide (fixed in the repair pass below)
The document on /otto is 405px wide at 390, on both the Today and Stats tabs. Each pane in `src/components/mobile/OttoMobile.tsx` has a visually hidden `<h2>` ("Today" / "Stats", `visuallyHidden` = `position: absolute`). The pane `<section>` (`paneStyle`, about line 394) has no `position: relative`, so the Stats heading is placed against an ancestor outside the horizontal scroller, at x=403. That widens the layout viewport, and with it the fixed tab bar (405px), so the page can be dragged 15px sideways. Other pages measure 390 (/campus, /messages, /settings).

**Fix (one line, not applied: `OttoMobile.tsx` isn't a B9 file and no batch owns it):** add `position: "relative",` to `paneStyle` in `OttoMobile.tsx`. Applied in the browser, this took the document to 390/390 and the tab bar to 390.

## Repair pass (Oct 19, after the adversarial review)

All seven findings taken. Nothing rejected.

1. **Phone page 15px too wide: fixed.** `src/components/mobile/OttoMobile.tsx`: `paneStyle` gets `position: "relative"` (the orchestrator handed this file to B9; no other batch owns it). The hidden "Stats" heading now sits inside its pane. Measured on /otto, Today and Stats, Night and Light: 390/390 with the tab bar 390 on an iPhone at 390; 768/768 and 820/820 (tab bar the same) in a desktop browser. The page can't be dragged sideways.
2. **"COMMENTS" past its tile at 900 to 1024: fixed.** `.otto-metrics-block` is now a size container (`otto-metrics-block`). `@container otto-metrics-block (max-width: 390px)` folds the 4-tile rows to 2 x 2, and the old 760px media rule for the tiles is gone, so the fold follows the half, not the window. Safety net: `.otto-metrics-tile` has `min-width: 0`, and `.otto-metrics-tile-l` is one line with "…". Measured with saves in the payload at 768, 820, 900, 960, 1024, 1100, 1180, 1440 and 1920: no label over or touching its tile, and none wrap. Halves of 301 to 371px show 2 x 2; 401 and 441 show 4 across (96 and 106px tiles).
3. **"1000k": fixed.** `fmtCount` goes to millions from 999,500 ("1M", "1.3M", "9.9M", "10M"). Every short form is 4 characters or fewer up to 999 million. Tests: 999,500, 999,999, 1,000,000 and the M edges added to the 4-character test, plus a new "M instead of 1000k" test. In the stacked layout the count cells are `minmax(44px, 52px)`: 52px wherever there's room (phone 390, all desktop halves), 44px only on a phone narrower than about 340px. With the stress numbers "1M" is 31px and "100k" is 43px in a 52px cell, nothing over.
4. **"1 / SAVES": fixed, singular.** The Reactions tiles pass the count through `pluralNoun` ("1 LIKE", "3 COMMENTS", "1 SAVE"), like the window rows. The view tiles keep their time labels (they name a window).
5. **Top-post title cut to 191px at 1440: stacked.** The `otto-metrics-top` threshold is 460px, so the 441px desktop halves stack too. At 1440 the title gets the full 441px and the counts sit in their columns under it, the same layout as the phone and the 1024 window. Columns line up on every row at every width checked.
6. **Different tile widths: fixed for the normal payload.** Post views now uses the same 4-column track, with All time two columns wide (`.otto-metrics-tile--wide`). Every tile in the card is the same width: 106px (All time 218) at 1440, 161px (All time full width) on the phone. Still different: the no-saves fallback (an older route that doesn't send saves) keeps Reactions on the 3-tile auto-fit grid, 117px against 179px at 1024. Production sends saves. Left for the Otto revamp (D8).
7. **The drift test vs the later clean-up: fixed.** In `engagement-icons.test.ts`, each per-icon check now skips itself when campus-home has no copy of that icon and imports the shared file ("no copy to drift"). It no longer fails with "EyeIcon not found". Checked by running it against a copy of campus-home with EyeIcon swapped for an import: 6 pass, 1 skipped. **For the clean-up chore:** whoever removes campus-home's five duplicate icons can delete the per-icon block. Keep the aria-hidden/currentColor test and the no-emoji test.

### Checks after the repair
- `node --test` on metrics-count and engagement-icons: 14/14 pass (7 + 7).
- `npx eslint` on the 6 touched files: clean. `npx tsc --noEmit -p .`: no errors.
- `npm test`: 3353 tests, 3353 pass, 0 fail.
- Browser (blake, non-admin; numbers mocked in the browser, every write stubbed): the widths above, the normal and stress payloads, the no-saves payload at 1024, Night and Light.
- Re-taken shots in `shots/`: `B9-desktop-night.png`, `B9-desktop-light.png`, `B9-desktop-night-top-posts-zoom.png`, `B9-phone-night.png`, `B9-phone-night-top-posts.png`, `B9-phone-light.png`, `B9-phone-light-top-posts.png`, `B9-mid-night.png` and `B9-mid-night-top-posts-zoom.png` (1024, no saves). New ones: `B9-w900-night-metrics.png`, `B9-w1024-night-metrics.png`, `B9-w1100-light-stress.png`, `B9-stress-desktop-night-top-posts.png`, `B9-stress-phone-night-top-posts.png`, `B9-phone-night-today.png`.
