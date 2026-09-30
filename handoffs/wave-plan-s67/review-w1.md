# W1d review — wave 1 (feed cards + rolling strip)

Reviewer: W1d, read-only. Started 2026-09-26. Scope: the working-tree diff of
`package.json`, both routes, `campus-home.tsx`, `globals.css`, `CampusMobile.tsx`, and the
three new files in `src/components/campus/`. Checked against contracts C0–C2, plan B/D,
"Fixed after the four critiques", waves.md Wave 1, and the three batch notes.

## Verdict (draft, updated as I go)

**REPAIR THEN SHIP.** 1 BLOCKER (phone: a tag filter with no way out), 4 SHOULD, 5 NICE.
Contracts C0–C2 are honoured by all three batches; the blocker is a 3-line fix in W1c's file.

What passed (checked, not assumed):
- (a) No contract drift: `RollingStrip` props match C1 at both call sites; `stripIsEmpty` is one
  function (view helper, re-exported from strip-data); `onPickEvent` is threaded on both shells;
  `id="event-<id>"` + `scrollMarginTop` per C2; desktop `highlightEventId` + `onHighlightDone`.
- (c) `#campus-feed` (5739), `#campus-tabs` (5274), `id="post-<id>"` (both branches) intact; the
  `?post=` flash saves/restores `el.style.background` so the card's inline `var(--glass)` survives;
  `FEED_CARD_SURFACE` has no `overflow: hidden` and no `backdrop-filter`; the composer takes the same
  surface; `CampusBanner search={false}` only on desktop, the phone's `compactSearch` path untouched
  (two mounts in the whole tree). `.campus-feed-grid` is already a flex column, so the 720 cap
  centres cleanly inside it.
- (d) One copy measured (`copyRef`), clone `aria-hidden` + `inert` + `tabIndex -1`, `overflowX`
  hidden only while rolling, paused on `:hover` / `:focus-within` / `document.hidden`, reduced
  motion honoured in JS and CSS. Loop is seamless (each copy `paddingRight: 8`, track `-50%`).
- (e) Every new colour is a C0 token; no `var(--muted|accent|border)` anywhere in the diff or the
  new files. The `:root` block is unlayered, sits after `@layer base` (ends :45) and before
  `@theme inline` (:69); nothing later in globals.css re-declares any of the 14 names; 22 lines.
- (f) trending: `?campus=` → `resolveCampusRequest`, `forbidden` → `campusScopeError` body+status
  before the query; upcoming: `?days=` clamps 1..60 (`ceil`), junk/absent = no horizon, filter on
  the `events!inner` embed like the existing `ends_at` one.
- (g) `stripEntries` emits a "Couldn't load · Retry" chip whenever a source has an error, even next
  to stale rows; `stripIsEmpty` is false when an error is set, so the strip never hides a failure.
- (h) `OttoFeedStrip`, `StripHeader`, `TalkingHeadIcon`, `FireIcon`, `.otto-strip`, the old
  `formatUpcomingChip` and the two types are gone from `src/` (grep clean); no dangling imports;
  eslint reports 4 errors / 7 warnings on the two shells, ALL on pre-existing lines (none inside
  the added-line ranges); the four new files lint clean.
- (i) Every new comment says "video posts"; the `?clip=` param name is untouched as the row says.
- Tests: `node --test src/components/campus/rolling-strip-view.test.ts` → 10/10 green.
- Phone: the 64px constant is right (banner is `height: 64` at campus-home:4433; the old 56 put the
  header 8px under it); Map's `100dvh - 220px` sees the same stack (the old strip was 0px on Map);
  the `-mx-4 px-4` bleed is safe because `SCROLLER` sets no inline margin/padding/width;
  `overscroll-behavior-x: contain` only engages when the strip actually overflows, so a short strip
  still lets the pane swipe through.

Gate results folded in:
- `tsc_ok: true`.
- `tests_ok: false`, two failures, BOTH pre-existing / outside wave 1's files:
  - `src/lib/otto/parse-reminder.test.ts` — extensionless import does not resolve under
    `node --test` (nothing in wave 1 touched otto). Surfaced now only because W1a added the
    `test` script that runs every `*.test.ts`.
  - `src/lib/profile/self-write-columns.test.ts:144` — limiter ordering in the profile write
    route; not a wave-1 file. Pre-existing failing assertion.
  Neither blocks wave 1, but the new `npm test` script is red on day one; see findings.

## Things the batch notes already flag for me (to verify, not take on faith)
- W1a: clone has `inert` → clicks on the clone half are dead while paused on hover.
- W1a: chip hit area 40px via `::before`, not 44.
- W1c: bleed via Tailwind `-mx-4 px-4` — depends on RollingStrip's root setting no inline
  margin/padding/width.
- W1c: phone event tap is scroll-only, no flash (C2 says desktop-only flash; waves.md walk
  says "scrolled + flashed").
- W1c: `scrollIntoView` on the horizontal pane scroller while `setTab`'s smooth scroll runs.
- W1b: search row also renders on the Chat tab's dark chrome.
- W1b: `?event=` seeding added (addition beyond the row).

## Findings

1. **BLOCKER** `src/components/mobile/CampusMobile.tsx:1030` — `FeedTagChip` renders only when
   `tag && stripEmpty`. With the strip showing and a filter tag that is NOT one of the ≤8 trending
   chips (any `#tag` tapped on a post card, any `?tag=` link), nothing is highlighted and no "×"
   renders: the phone has no visible way out of the filter (`setFeedTag(null)` is reachable only via
   `onClearTag` :738 and the strip toggle :285). Regression from today's always-on chip.
   Fix: `const stripHasTag = !!feedTag && (stripData.trending ?? []).some(t => t.tag === feedTag)`
   and pass `stripEmpty={stripEmpty || !stripHasTag}` (rename to `showTagChip`); or simply restore
   `tag ?` — on a 375px strip the highlighted chip is often scrolled off-screen anyway.
2. **SHOULD** `src/app/campus/campus-home.tsx:8845` — `scrollMarginTop: 140` is a bare number; the
   phone's sticky stack is `env(safe-area-inset-top) + 64 + ~52`. Safari: 116 (fine). Installed on a
   notched iPhone: 163–175, so `pickEvent`'s `scrollIntoView({block:"start"})` lands the card 23–35px
   under the tab header. Desktop uses `block:"center"`, unaffected.
   Fix: `scrollMarginTop: "calc(env(safe-area-inset-top, 0px) + 140px)"`; amend C2 the same way.
3. **SHOULD** `src/components/campus/RollingStrip.tsx:219` — the clone carries `inert`, which also
   swallows pointer events: while the roll is paused on hover, every chip whose on-screen instance is
   the clone (up to half the strip) is dead to clicks. C1 asked for it; the contract is wrong here.
   Fix: drop `inert`, keep `aria-hidden` + `tabIndex={-1}` (clone chips already have the onClick).
4. **SHOULD** `src/app/campus/campus-home.tsx:789` — the search row renders on every tab, including
   Chat, whose chrome is dark and locked to `height: 100dvh; overflow: hidden` (:772): a cream
   `var(--glass)` pill on dark chrome, and 48px taken from the viewport-locked chat. Before this
   wave Chat's search was the banner's white-on-dark pill.
   Fix: row only when `tab !== "chat"` and `<CampusBanner search={tab === "chat"} />`, or a dark
   `row` tone for Chat. Franky's "between the name and the pills" ask is about the cream tabs.
5. **SHOULD** `package.json:11` — `npm test` is red on day one: `src/lib/otto/parse-reminder.test.ts`
   (extensionless import; needs `.ts` or the resolve hook the other tests use) and
   `src/lib/profile/self-write-columns.test.ts:144` (the profile write route runs the limiter AFTER
   the Terms gate — a real, pre-existing ordering bug, not a wave-1 file). `git ls-files` also skips
   untracked files, so the wave's own `rolling-strip-view.test.ts` is not run until `git add`.
   Fix: `node --test $(git ls-files -co --exclude-standard 'src/**/*.test.ts')`; follow-up for the
   two red tests (the limiter order belongs to the hardening list). Not a wave-1 blocker.
6. **NICE** `src/components/campus/RollingStrip.tsx:188` — while rolling, `overflowX: hidden` makes
   plan D's "manual scroll always works" false on the desktop: wheel does nothing and hovering
   pauses, so an off-screen chip is reachable only by un-hovering and waiting. C1 chose hidden, so
   this is plan-vs-contract drift. Fix: amend plan D, or on horizontal `wheel`/`keydown` set a
   `manual` flag that turns `rolling` off for the session (the strip then acts like the phone's).
7. **NICE** `src/app/campus/campus-home.tsx:5775` — the strip mounts only when `!tagFilter`, so
   `activeTag` is always null on the desktop and `tag === tagFilter ? onClearTagFilter()` is dead;
   C1's "tap again to clear" exists only on the phone (desktop has "← Back"). Per waves.md's row,
   but plan D's line has no shell qualifier. Delete the branch or mount under a filter; Franky's call.
8. **NICE** `src/app/campus/campus-home.tsx:4832` — the row pill is `maxWidth: 720` but the cards are
   672 (`#campus-feed` is 720 border-box with 24px side padding): the pill overhangs the column it
   heads by 24px each side. Fix: `maxWidth: 672` on the pill (or pad the section outward).
9. **NICE** `src/app/campus/campus-home.tsx:6712` — cards now have a background; the kebab wrapper is
   `zIndex: 2` and its menu hangs ~180px below, reaching the next card whose own kebab wrapper is
   also `zIndex: 2` and later in DOM order, so the menu's bottom items can paint under it on a
   one-line post. Same DOM-order risk as before but visible now. Verify in the 1280 walk; fix is
   `zIndex: 20` on the wrapper while `showMoreMenu`.
10. **NICE** `src/components/campus/RollingStrip.tsx:365` — the `::before` hit area is 40px, not 44
    (the strip's own height). Known limit (W1a flagged); fine for wave 1, noted so the walk doesn't
    re-discover it.

## Walk items (not findings; for the 375 / 1280 pass)
- 375 as blake, installed: tap an event chip → does the card's top clear the tab header? (finding 2)
- 375: strip overflowing → swipe the strip to its end; the pane must NOT flip to Events. Then tap an
  event chip and watch for a flip back to Feed on the 420ms guard (W1c's note).
- 1280: hover the rolling strip and click a chip in the trailing half (finding 3).
- 1280: Chat tab — look at the search row (finding 4).
- Live: computed colour of a tag chip is `rgb(184,58,26)` (the `--tag-ink` tripwire); Turbopack's
  build cache is still off in next.config.ts:13, so the served CSS should carry the new block.
