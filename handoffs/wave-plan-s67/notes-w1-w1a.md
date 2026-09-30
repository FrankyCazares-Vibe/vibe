# W1a notes — strip + tokens (recovery file)

Batch W1a, wave 1. Owner of: `src/components/campus/strip-data.ts` (new), `RollingStrip.tsx` (new),
`rolling-strip-view.ts` + `.test.ts` (new), `src/app/api/trending/hashtags/route.ts`,
`src/app/api/me/upcoming-events/route.ts`, `src/app/globals.css` (one unlayered `:root` block only),
`package.json` (two scripts only).

## Read so far
- contracts.md C0/C1/C2, plan.md B/D/"Fixed after the four critiques"/rules, waves.md W1 row.
- campus-home.tsx 9340-9360 (`formatUpcomingChip`) and 13267-13336 (`StripTrend`, `StripUpcoming`,
  the two fetch effects). Read only; W1b deletes the originals.
- Both routes I own; `src/app/api/stats/campus/route.ts:81-84` for the `campusScopeError` pattern.
- `LoadFailed.tsx` (`LoadFailure`, `asLoadFailure`), `request.ts` (`vibeRequest`, `quiet`).
- `community-scope.test.ts` for the node:test + registerHooks style.
- globals.css: `@layer base` block is lines 7-45; `@theme inline` starts 47; UI kit `:root` at 135.

## Decisions
- `StripUpcoming` per C1 (`ends_at: string | null`, `location: string | null`, `org: {handle,name} | null`)
  is looser than the old campus-home type; the route's rows fit it, so no cast games.
- `useStripData` keeps the old two-effect shape (own error + own retry key per source) so a failing
  source never blanks the other. `refresh()` bumps both keys.
- `stripIsEmpty` is defined once in `rolling-strip-view.ts` (pure, tested) and re-exported from
  `strip-data.ts` so both C1 import paths work.
- Trending route: `?campus=` goes through `resolveCampusRequest(url.searchParams.get("campus"), viewer)`;
  a `forbidden` scope answers `campusScopeError` like stats does. Header comment updated.
- Upcoming route: `?days=` optional; when present, clamp 1..60 and add `.lte("event.starts_at", now+days)`.
- globals.css: new unlayered `:root` block right after line 45 (`@layer base` close), C0 light values,
  re-declares `--cream`/`--charcoal` so the unlayered copy wins.

## Progress
- [x] notes written (this file)
- [x] rolling-strip-view.ts + test (10 tests green)
- [x] strip-data.ts
- [x] RollingStrip.tsx (367 lines: hooks, render, C0-only styles, scoped <style>)
- [x] trending route ?campus=
- [x] upcoming route ?days=
- [x] globals.css token block (22 lines, after @layer base, before @theme inline)
- [x] package.json scripts (typecheck, test)
- [ ] tsc + node --test run

## Progress log
- rolling-strip-view.ts written (orderChips, stripEntries, stripIsEmpty, shouldRoll, rollDurationSec,
  nextTagFilter, leadIn, eventChipTitle/Label, tagChipTitle, formatUpcomingChip). `formatUpcomingChip`
  is IMPLEMENTED here (pure, testable) and re-exported from strip-data.ts, so the C1 import path holds.
- strip-data.ts written (types, useStripData, re-exports). Failure chips render whenever `err` is set,
  even beside stale rows (never silent); retry clears err then re-reads, like the old strip.
- Next: the test file, then RollingStrip.tsx, routes, globals.css, package.json.
- Design choice for the fade: CSS `mask-image` on the scroller (no extra element, works while scrolling
  and while rolling, shows the backdrop beneath). The container IS the scroller so the phone's
  `vibe-no-scrollbar` + bleed className lands on the right element.
- Touch target: chips stay 30px tall (C1); a `::before` pseudo-element extends the hit area to the
  40px container height. Noted as a limit (44 asked, 40 is the strip's height).

## Flag for W1d (contract followed, worth a look)
- C1 says the rolled clone is `aria-hidden` + `inert` + `tabIndex -1`. `inert` also blocks mouse clicks,
  so while the roll is paused on hover, chips from the clone half don't respond to a click. If that
  feels broken in the walk, drop `inert` (keep aria-hidden + tabIndex -1); one attribute in RollingStrip.
- Touch target: chips are 30px (C1); the `::before` hit area is 40px (the strip's height), not 44.

## Final state
- Trending route: one tsc error caught (redundant `kind !== "forbidden"` after the early return); the
  guard is now `if (scope)` with a comment. `?campus=` resolves through `resolveCampusRequest`;
  forbidden -> `campusScopeError` body/status (same as stats route).
- Upcoming route: `?days=` optional, clamped 1..60, adds `.lte("event.starts_at", horizon)`; absent or
  junk = no horizon (Otto's panel unchanged).
- Structure of RollingStrip: the outer div IS the scroller (`.vibe-strip`, gets `className`), children =
  lead-in span (cream patch, zIndex 1) + `.vibe-strip-track` (animated wrapper) > copy [+ inert clone].
  `data-rolling` turns the animation on; `data-paused` mirrors `document.hidden`; CSS handles
  :hover / :focus-within. Duration via `--vibe-strip-dur` = max(20, trackWidth/30)s.
- Measurement: RO on the scroller + the first copy; viewport = scroller.clientWidth - track.offsetLeft.

## Repair round 1 (2026-09-26, after review-w1)
Four items handed back; two SHOULD, two NICE. Decisions:
- SHOULD `inert` on the clone (RollingStrip.tsx:219): agreed, it was my own flag. `inert` swallows pointer
  events, so while the roll is paused on hover the clone half of the strip is dead to clicks. Dropping
  `inert`; keeping `aria-hidden="true"` + `tabIndex={-1}` (chips already carry the same onClick). Doc
  comment at the top of the file updated to match. C1 in contracts.md gets the one-word change
  (contracts.md is not in my Owns list, but the repair item says "Update C1" explicitly; flagged in the
  structured answer as a deviation).
- SHOULD `npm test` red on day one (package.json:11): script becomes
  `node --test $(git ls-files -co --exclude-standard 'src/**/*.test.ts')` so untracked test files run
  before `git add`. The two pre-existing failures (parse-reminder.test.ts extensionless import;
  self-write-columns.test.ts:144 limiter-after-Terms ordering in the profile write route) are NOT my
  files; recorded as the follow-up below, not fixed here. `npm test` stays red until that follow-up lands.
- NICE manual scroll while rolling (RollingStrip.tsx:188): taking the code route, not the plan edit, so
  plan D's "manual scroll always works" becomes true. A horizontal `wheel` (or shift+wheel) or an
  ArrowLeft/ArrowRight `keydown` on the scroller sets a `manual` state that turns `rolling` off for the
  life of the component (the Feed tab mount = "the session"); the strip then falls back to the phone's
  snap-scroller. The rolled offset is carried into `scrollLeft` (read from the track's computed
  transform) so the chips don't jump when the clone unmounts. C1 gets one sentence about the takeover.
- NICE 40px hit area (RollingStrip.tsx:365): left as is, per the item. If the 375 walk shows mis-taps,
  raise the strip to 44 (C1 change), don't grow the pseudo-element past the container.

### Follow-up (NOT wave 1; hardening list)
1. `src/lib/otto/parse-reminder.test.ts`: extensionless relative import does not resolve under
   `node --test`; add the `.ts` extension (or a resolve hook).
2. `src/lib/profile/self-write-columns.test.ts:144` + the profile write route: the test asserts the rate
   limiter runs BEFORE the Terms gate; the route runs it after. Real ordering bug, pre-existing. Move the
   limiter above the Terms gate in the route (owner: W2a in wave 2 owns `src/app/api/me/profile/route.ts`).

### Progress (repair)
- [x] notes appended (this section)
- [x] RollingStrip.tsx: drop inert, manual takeover (wheel/shift+wheel/arrows -> `manual`, offset carried
      into scrollLeft in a useLayoutEffect), doc comment
- [x] package.json test script (`git ls-files -co --exclude-standard`; verified it now lists
      rolling-strip-view.test.ts, which the old glob skipped)
- [x] contracts.md C1 (inert clause + one takeover sentence)
- [x] `npx tsc --noEmit` clean; `node --test src/components/campus/rolling-strip-view.test.ts` 10/10 green
- Not done on purpose: `npm test` overall is still red (the two pre-existing failures in files I don't own,
  see the follow-up above). The 40px hit-area item is left as is.

## Repair round 2 (2026-09-26)
Two items handed back; both are the SAME two SHOULDs from round 1, and both are ALREADY FIXED in the
working tree (the round-2 list was cut from the round-1 review, before the repair landed). Verified, not
re-changed:
- SHOULD `inert` on the clone (RollingStrip.tsx:219): `grep -n inert src/components/campus/RollingStrip.tsx`
  finds one hit, line 44, the doc comment explaining why it is NOT used. The clone render carries
  `aria-hidden="true"` + `tabIndex={-1}` on every chip and no `inert`. contracts.md C1 (line 57) already
  reads "NOT `inert` ... repair round 1". Nothing to do.
- SHOULD `npm test` red (package.json:11): the script is already
  `node --test $(git ls-files -co --exclude-standard 'src/**/*.test.ts')` (git diff --stat shows the
  change). The two pre-existing failures (parse-reminder.test.ts import; self-write-columns.test.ts:144 +
  the profile write route ordering) are in files I don't own; they stay in the "Follow-up (NOT wave 1)"
  list above for the hardening pass / W2a. `npm test` stays red until that lands. Nothing to do here.

### Progress (repair 2)
- [x] notes appended (this section)
- [x] verified both items already in place (grep + package.json read); the clone at RollingStrip.tsx:267
      is `aria-hidden="true"` with `renderEntry(e, true)` giving every chip `tabIndex={-1}`
- [x] `npx tsc --noEmit` clean (no output); `node --test src/components/campus/rolling-strip-view.test.ts`
      10/10 green; `git ls-files -co --exclude-standard 'src/**/*.test.ts'` lists 52 files incl. the
      untracked rolling-strip-view.test.ts
- No code changed in round 2. Files touched this round: this notes file only.
