# W1c notes — phone strip (CampusMobile.tsx only)

Owner: batch w1c. File: `src/components/mobile/CampusMobile.tsx`. Never commit/push/dev-server/DB.

## Plan (from waves.md W1c + contracts C1/C2)

1. Delete the Otto strip wrapper + swoop animator (`:638-673`), `ottoCollapsed` (`:580-583`), the header `top` ternary + `transition: top` (`:692-696`) → constant `calc(env(safe-area-inset-top, 0px) + 64px)`.
2. Drop the `OttoFeedStrip` import (`:15`); keep `CampusBanner`, `EventCard`, `BACKDROP_PRESETS`, etc.
3. `CampusMobile` owns `useStripData({ upcomingLimit: 3, trendingLimit: 8, days: 14 })` from `@/components/campus/strip-data` (W1a writes it; trust the C1 signature). Mount `<RollingStrip data onPickTag activeTag={feedTag} onPickEvent={pickEvent} className="vibe-no-scrollbar" style={{ margin: "0 -16px", padding: "0 16px" }} />` as the FIRST child of the Feed `<section>` (`:726`). `roll` stays default false.
4. `onPickTag`: tapped === feedTag → `setFeedTag(null)`, else `pickFeedTag(tag)`.
5. `pickEvent(id)`: `setTab("events")` then rAF → `document.getElementById(\`event-${id}\`)?.scrollIntoView({ block: "start", behavior: "smooth" })` (EventCard carries the id after W1b).
6. `stripEmpty = stripIsEmpty(stripData)` → `FeedPane` prop; `FeedTagChip` renders only when `stripEmpty`.
7. Comments: `:61-62` and `:204-206` say "video posts" (leave the `?clip=` param). `:229` "Otto strip's trending chips" → "the strip's trending chips".
8. Verify Map pane height assumption (`:677-679`) with the constant header offset.

## Decisions / findings (append as I go)

- Header `top`: banner is always 64px (`CampusBanner` fixed height), so the old 56px "collapsed" value put the header 8px UNDER the banner; the constant 64px is the correct one on every tab.
- Strip `style` prop: C1's `RollingStrip` props list has `className` but no `style`. The task text says "style-bleed per C1 (margin 0 -16px, padding 0 16px)". I'll pass the bleed through `className` + a wrapper? No: simplest that respects C1 is to wrap the strip in a `<div style={{ margin: "0 -16px", padding: "0 16px" }}>`... but that wrapper would clip nothing and the strip's own `overflowX:auto` needs the padding INSIDE the scroller for edge-to-edge chips. Decision below once I see whether W1a exposes `style`.

## Progress (append-only)

- [done] Import: `OttoFeedStrip` dropped; added `RollingStrip` from `@/components/campus/RollingStrip` and `stripIsEmpty, useStripData` from `@/components/campus/strip-data` (neither file exists yet — W1a writing; trusting C1).
- [done] Comments → "video posts": header (`:61-63`), `?clip=` (`:205-206`), `#tag` filter (`:229`), ComposerFab (`:3512`, not in the task list but same rule; param `?clip=` untouched).
- [done] Hook + handlers after `pickFeedTag`: `stripData`, `stripEmpty`, `pickStripTag` (toggle), `pickEvent` (setTab + rAF scrollIntoView, contract C2 verbatim).
- [done] `ottoCollapsed` deleted; strip wrapper + swoop animator deleted; header `top` = constant 64px, `transition: top` removed.
- Bleed decision: C1 has no `style` prop, so the bleed goes through `className` as C1 says: Tailwind `-mx-4 px-4` (= margin 0 -16px / padding 0 16px; `--spacing` is not overridden, `@import "tailwindcss"` at globals.css:1). Works as long as RollingStrip's container sets no inline margin/padding/width (C1's layout list has none). RE-CHECK when the file lands.
- Map pane: unchanged in flow. On Map the old strip already had 0 height (maxHeight 0 / paddingTop 0), so `MapMobile`'s `calc(100dvh - 220px)` sees the same stack (banner 64 + safe-area, hidden banner slot, tab header). The sticky `top` change only matters while scrolling, which the Map tab doesn't.
- Not doing: a phone-side "flash" of the event card. waves.md's 375 walk says "scrolled + flashed" but C2 gives the flash to desktop only (`highlightEventId`) and the phone only `scrollIntoView`; I don't own EventCard. Flagging as an open question.
- Hook nudge: the Edit hook asks for a preview server; the batch rules forbid starting one. Not started.
- [done] Feed `<section>`: `<RollingStrip data onPickTag={pickStripTag} onPickEvent={pickEvent} activeTag={feedTag} className="vibe-no-scrollbar -mx-4 px-4" />` is the first child; `FeedPane` gets `stripEmpty` and renders `FeedTagChip` only when `tag && stripEmpty`; doc comments updated.
- [done, addition] `EventsPane.onMutate` also calls `stripData.refresh()` — an RSVP is what the event chips show (reader-report risk 12). One line; flagged in the structured answer as an addition beyond the six numbered items.
- [done] Imports re-pointed: `stripIsEmpty` + `nextTagFilter` from `rolling-strip-view.ts` (already on disk, structural input type), `useStripData` from `strip-data.ts` (not on disk yet). `pickStripTag` normalises via `normalizeFeedTag` before `nextTagFilter`, same as `pickFeedTag`.
- Next: `ls src/components/campus`, then `npx tsc --noEmit` once; if `strip-data.ts` / `RollingStrip.tsx` haven't landed, the two "Cannot find module" errors in my file are expected and reported, not fixed.
- strip-data.ts landed (13:31) and matches C1: `useStripData({upcomingLimit,trendingLimit,days,campusId})`, `refresh()` = both retries (keys bump; rows stay until the answer lands → no strip flash on the Events tab after an RSVP). `stripIsEmpty` is re-exported there too; I import it from `rolling-strip-view.ts` together with `nextTagFilter` (one line, same function).
- `npx tsc --noEmit` started in the background → scratchpad `tsc-w1c.txt`. RollingStrip.tsx was not on disk at 13:31; a "Cannot find module '@/components/campus/RollingStrip'" in my file is expected until W1a writes it.

## Result

- `npx tsc --noEmit` (13:33): CampusMobile.tsx has ONE error, `TS2307 Cannot find module '@/components/campus/RollingStrip'` — W1a hadn't written the component yet. Six more errors are in `src/app/campus/campus-home.tsx` (same missing module, `highlightEventId` prop not yet on `EventsTabBody`, implicit-any `tag`, `feedGlass`/`hairline` names) — W1b's file, mid-edit, not mine to touch.
- Left for the reviewer / W1a: the phone bleed is `className="vibe-no-scrollbar -mx-4 px-4"` (Tailwind: margin 0 -16px / padding 0 16px). It needs RollingStrip's container to set no inline `margin`, `padding` or `width` (C1 lists none); if it sets `width: 100%`, the right edge falls 16px short — use `-mx-4 px-4 w-[calc(100%+32px)]` then.
- Left for the reviewer: waves.md's 375 walk says the event card is "scrolled + flashed"; C2 gives the flash to desktop (`highlightEventId`) and the phone only `scrollIntoView`. Built to C2. A phone flash would need a hook on EventCard (W1b's file) or an imperative `el.animate` from here.
- Left for the reviewer: `scrollIntoView` also scrolls the horizontal pane scroller (`inline: "nearest"` default) while `setTab`'s smooth `scrollTo` runs; both land on the Events pane and `x mandatory` snap finishes the last 16px. Same 420ms guard as before; watch for a flip back to Feed on a slow phone in the 375 walk.

## Repair round 1

Item: BLOCKER CampusMobile.tsx:1030 — `FeedTagChip` renders only when `tag && stripEmpty`. When the strip is visible but the active filter tag isn't one of its ≤8 trending chips (a #tag tapped on a post card, a `?tag=` link), nothing is highlighted and no "×" chip renders, so the phone has no visible way to clear the filter.

Agreed: it's real. `pickFeedTag` (post-card #tag) and `urlTag` both set `feedTag` without consulting the strip's list.

Fix chosen: the first option. In `CampusMobile`, `stripHasTag = !!feedTag && (stripData.trending ?? []).some((t) => t.tag === feedTag)`; the `FeedPane` prop is renamed `stripEmpty` → `showTagChip` and receives `stripEmpty || !stripHasTag`. The chip therefore shows whenever the strip can't show the active filter (strip hidden OR tag not among the chips); when the strip does highlight the tag, tapping the highlighted chip still clears it (`nextTagFilter`). Not restoring the unconditional chip: when the strip highlights the tag, two "clear" affordances 40px apart would be noise, and the reviewer's own first option keeps the design intent.

Progress (append as I go):
- [done] `CampusMobile` (:274-286): `stripHasTag = !!feedTag && (stripData.trending ?? []).some((t) => t.tag === feedTag)`; `showTagChip = stripEmpty || !stripHasTag`. Strict `===` on the served tag, the same compare `RollingStrip.tsx:145` uses for `activeTag`, so the chip and the highlight can't disagree; `feedTag` is already normalised (lowercase, no `#`) and the trending route serves tags the same way.
- [done] Feed `<section>` (:739-742): `FeedPane` prop `stripEmpty` → `showTagChip={showTagChip}`, comment rewritten.
- [done] `FeedPane` (:1010, :1024-1027, :1037): destructure, prop type + doc comment, and the chip line all renamed; `stripEmpty` now lives only in `CampusMobile`.
- Behaviour: strip hidden → chip (as before). Strip visible + tag in its chips → highlighted chip only (tap clears). Strip visible + tag NOT in its chips (post-card #tag, ?tag=) → plain "#tag ×" chip renders above the posts. Trending still loading (`trending === null`) with a `?tag=` on arrival → chip shows, then disappears once the list lands if the tag is in it; that brief chip is the safe direction (never no way out).
- `npx tsc --noEmit` running in the background → scratchpad `tsc-w1c-r1.txt`.

### Repair round 1 result

- `npx tsc --noEmit` (repair round 1): exit 0, no errors anywhere — W1a's `RollingStrip.tsx` has landed (the round-0 "Cannot find module" is gone) and W1b's `campus-home.tsx` is clean too.
- Item BLOCKER :1030 → FIXED via the reviewer's first option (`stripHasTag` + prop renamed `stripEmpty` → `showTagChip`). No other items were assigned to w1c this round.
- For the 375 walk: tap a #tag on a post card while the strip shows other tags → the "#tag ×" chip appears above the first post; tap a trending chip → no plain chip, the strip chip is highlighted; tap it again → filter clears. `?tag=<not-trending>` on arrival → chip present.

## Repair round 2

Item received: the SAME BLOCKER as round 1 ("CampusMobile.tsx:1030: FeedTagChip renders only when `tag && stripEmpty` … FIX: `stripHasTag` + rename the prop to `showTagChip`, or restore the unconditional chip").

Status on reading the file (before any edit this round): **already fixed in round 1**, exactly per the reviewer's first option.
- `:278-285` — `stripData` / `stripEmpty` / `stripHasTag = !!feedTag && (stripData.trending ?? []).some((t) => t.tag === feedTag)` / `showTagChip = stripEmpty || !stripHasTag`.
- `:742` — `<FeedPane … showTagChip={showTagChip} …>`; the `stripEmpty` prop no longer exists on `FeedPane`.
- `:1011`, `:1025-1028`, `:1038` — destructure, prop type + doc comment, and `const chip = tag && showTagChip ? <FeedTagChip …/> : null`.
- `grep -n stripEmpty` finds it only at `:279` and `:285` (the local in `CampusMobile`); the `:1030` reference in the item points at code that is no longer there (the chip line is `:1038` and reads `showTagChip`).

So the item is stale (the round-2 review ran against the pre-round-1 file, or re-listed the round-1 finding). Not changing the code for it.

Checking one narrower variant before closing: `?tag=<trending tag>` on arrival → `stripHasTag` is true → no plain chip, and the highlighted strip chip may be scrolled off-screen to the right (≤3 event chips come first). Reading `RollingStrip.tsx` for whether it scrolls the active chip into view; if it doesn't, deciding whether the phone should do it from here (DOM lookup inside the strip) or leave it for the 375 walk.

Finding: `RollingStrip.tsx` never scrolls the active chip into view (`activeTag` only sets `aria-pressed` + the active colours at `:191-199`; `scrollLeft` is touched only for the desktop roll carry-over). So round 1 left a real hole of the same species as the BLOCKER, and a common one: a #tag tapped on a post card is *likely* trending (that is what trending means), so `stripHasTag` is true, the plain chip is hidden, and the highlighted chip sits off-screen to the right behind the event chips. Same for `?tag=<trending>` on arrival. The reviewer's own remark ("on a 375px strip the highlighted chip is often scrolled off-screen anyway") is this case.

Decision (round 2): hide the plain chip ONLY when the filter was just tapped on the strip itself, because that is the one case where the highlighted chip is surely on-screen. New state `tagFromStrip` (`:242-246`): `pickStripTag` sets it true after `pickFeedTag` (which resets it to false, as does the `?tag=` render-adjust block). `showTagChip = !(tagFromStrip && stripHasTag)`. `stripEmpty` dropped as redundant (`stripHasTag` ⇒ trending non-empty ⇒ strip visible), and the now-unused `stripIsEmpty` import removed from `:19`. Not chosen: the unconditional chip (duplicate "clear" 40px apart in the strip-tap path, and it would break the walk's "tap a tag → FeedTagChip hidden"); a DOM `scrollIntoView` on the strip's `[aria-pressed=true]` chip (couples to W1a's markup, and `block` would fight `pickFeedTag`'s smooth `window.scrollTo(0)` under the sticky header).

Behaviour now: strip tap → highlighted chip only (tap again clears); post-card #tag (trending or not) → plain chip; `?tag=` (trending or not) → plain chip, no flicker while trending loads; strip tap then trending refresh drops the tag → plain chip appears. Known edge, accepted: strip tap, then the student swipes the strip away by hand → the highlighted chip is off-screen and no plain chip; they just tapped it and know where it is.

Progress:
- [done] `tagFromStrip` state + reset in the `?tag=` block (`:242-254`); reset in `pickFeedTag` (`:272`); set in `pickStripTag` (`:287-302`) with the early-return clear branch; `showTagChip` derivation and comments (`:279-291`).
- [done] Comments: Feed `<section>` prop comment, `FeedPane.showTagChip` doc, `FeedTagChip` doc.
- [done] Import `:19` → `nextTagFilter` only.
- Next: `npx tsc --noEmit 2>&1 | head -60` once.
