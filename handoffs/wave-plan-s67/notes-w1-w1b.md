# W1b notes — desktop campus-home.tsx (Feed cards + rolling strip)

Owner: W1b. File: `src/app/campus/campus-home.tsx` only. Started 2026-09-26.

## Plan (from waves.md W1b + contracts C0/C1/C2)
1. FeedRow → per-post card (var(--glass), 1px var(--glass-border), radius 18, padding 16px 18px, var(--card-shadow), no overflow hidden, no backdrop-filter). Drop `hairline` prop end to end (incl. removed-post branch). Entries column = plain flex column gap 12; loading/error/empty keep one frosted card.
2. `#campus-feed` section: maxWidth 720, margin "0 auto", width 100%, boxSizing border-box.
3. Composer card via `glass` prop: radius 18, no blur.
4. FeedTabBody owns `useStripData({upcomingLimit:3, trendingLimit:8, days:14})` from `@/components/campus/strip-data` (W1a writes it); mounts `<RollingStrip data roll onPickTag onPickEvent activeTag={tagFilter}/>` as its own row above the composer, only when no tag filter. SceneHeader back to a plain heading row (delete the header+strip flex row).
5. `onPickEvent`: CampusHome `pendingEventId` state → TabBody → EventsTabBody `highlightEventId`; scroll+flash `#event-<id>` like `?post=`; EventCard wraps `<MouseSpotlight>` in `<div id="event-<id>" style={{scrollMarginTop:140}}>`.
6. Search bar: new sibling row between `<CampusBanner/>` and `<CampusTabs/>` (desktop), 38px pill, placeholder "Search people, clubs, events"; `CampusBanner` gets `search={false}` prop (phone's `compactSearch` unaffected).
7. `FEED_BACKDROP` → `var(--feed-backdrop)`.
8. DELETE `OttoFeedStrip`, `StripHeader`, `TalkingHeadIcon`, `FireIcon`, the strip `<style>`, old `formatUpcomingChip` + `StripTrend`/`StripUpcoming` types.

## Decisions / progress log
- (start) Read contracts, plan, waves, reader report. Mapping the file with grep next.
- Deleted old strip block (was 13267-13697: StripTrend/StripUpcoming types, OttoFeedStrip incl. its <style>, TalkingHeadIcon, FireIcon, StripHeader) and formatUpcomingChip (was 9340-9361) with one sed, BEFORE any string edits so line refs above stayed valid. Backup of the untouched file in the scratchpad (campus-home.before.tsx). File now 15,252 lines.
- Decision: one module-level `FEED_CARD_SURFACE` const (C0 tokens) shared by FeedRow, the removed-post branch, the composer's `glass` prop and the loading/error/empty state card. No blur anywhere on the feed, so the PostViewersModal comment about the backdrop-filter trap gets reworded (still portalled).
- Decision: `pendingEventId` is cleared by an `onHighlightDone` callback from EventsTabBody (after the scroll+flash, or when the event isn't in the list), so a stale id never re-flashes on a later Events visit. Also seeded once from `?event=` (the search bar's goEvent already emits /campus?tab=events&event=<id>, which nothing read until now; 1 line, reported as an addition).
- Decision: the event flash is a coral box-shadow ring on the `#event-<id>` wrapper (the card is dark glass; a background tint behind it would barely show). Same rAF + 2200ms timing as ?post=.
- Decision: `CampusSearchBar` gets `variant="row"` + `placeholder` props; the banner keeps the default "banner" variant so the phone is unaffected.
- MouseSpotlight's outer div has no height of its own, so wrapping EventCard in a plain div changes nothing about card heights in the grid.

## Done (2026-09-26)
- All 8 items applied in campus-home.tsx; 282 insertions / 584 deletions; file 15,4xx lines. Anchors intact: `#campus-tabs`, `#campus-feed`, `id="post-<id>"` (both branches), new `id="event-<id>"`.
- `npx tsc --noEmit`: campus-home.tsx clean. Remaining error is in `src/components/campus/RollingStrip.tsx(122,1)` (W1a, mid-write). Note W1c already imports `@/components/campus/RollingStrip` too.
- Additions beyond the row: `onHighlightDone` prop on EventsTabBody (so `pendingEventId` clears itself); `pendingEventId` seeded once from `?event=`; RollingStrip's `onPickTag` wrapped so an active tag clears the filter (C1).
- Not done on purpose: composer inner padding stays 16px 20px (only its `glass` prop changed, per the row); the search dropdown keeps `COLORS.bg`/`COLORS.border` literals (wave 3's colour pass owns literals).
- Verify walk (W1d): 1280 as blake — centered 720 column, 12px gaps, kebab opens on a one-line post, search pill row between banner and tabs (also visible on the Chat tab's dark chrome: decide if it should hide there), strip rolls only when overflowing, `/campus?post=<id>` and `/campus?tab=events&event=<id>` both scroll + flash, Settings → Replay tour finds `#campus-feed` and `#campus-tabs`.

## Repair round 1 (2026-09-26)
Reviewer items that land in `src/app/campus/campus-home.tsx` (my only file); plan per item, updated as each lands:
1. SHOULD EventCard anchor `scrollMarginTop: 140` → `"calc(env(safe-area-inset-top, 0px) + 140px)"` (installed notched iPhone stacks safe-area + 64 banner + ~52 tab header). The matching C2 amendment lives in contracts.md, which I do NOT own: the exact replacement text is recorded below for the orchestrator.
2. SHOULD search row on the Chat tab: hide the row when `tab === "chat"` and pass `search={tab === "chat"}` to CampusBanner, so Chat keeps its in-banner white-on-dark pill and its 100dvh lock loses nothing. Chosen over a dark `row` tone because Chat's chrome was already built around the banner pill.
3. NICE dead `tag === tagFilter` branch: the strip only mounts under `!tagFilter`, so the branch can never fire on the desktop. Deleting the dead branch (keeps waves.md's "only when no tag filter"; the desktop's way out is the ← Back button). Flagged as Franky's call in the handoff.
4. NICE row pill `maxWidth: 720` → `672` so it lines up with the 672px cards inside `#campus-feed` (720 border-box, 24px side padding).
5. NICE kebab wrapper z-index under per-card backgrounds: can't run a browser walk here (no dev server allowed), so applying the defensive `zIndex: showMoreMenu ? 20 : 2` outright; it is inert while the menu is closed.

### Repair round 1 — done
- All five items applied in campus-home.tsx (five small Edits, one region each). `npx tsc --noEmit`: clean, whole repo (no sibling errors at the time of the run). Anchors intact: `#campus-feed`, `#campus-tabs`, `id="post-<id>"` (both branches), `id="event-<id>"`. No `var(--muted|--accent|--border)`.
- Item 1 (anchor): `scrollMarginTop: "calc(env(safe-area-inset-top, 0px) + 140px)"` with a comment. **C2 amendment for the orchestrator (contracts.md is not mine):** in C2 replace `style={{ scrollMarginTop: 140 }}` with `style={{ scrollMarginTop: "calc(env(safe-area-inset-top, 0px) + 140px)" }}` — env() is 0 on the desktop and in Safari, 44–59px installed on a notched iPhone.
- Item 2 (Chat): `<CampusBanner search={tab === "chat"} />` and the row is wrapped in `tab !== "chat" ? … : null`. Chat is exactly as it was before this wave (banner pill, full 100dvh). Not taken: a dark `row` tone (more surface for wave 3 to recolour, and Chat's chrome already had a pill).
- Item 3 (dead branch): `onPickTag={onPickTag}` and `activeTag={null}` with the comment saying why; the ternary was unreachable because the strip only mounts under `!tagFilter`. **Franky's call, recorded for the handoff:** desktop clears a tag with the ← Back button only; mounting the strip under a filter too (phone parity) would be a 2-line change (`{!tagFilter ? …}` → always, `activeTag={tagFilter}`, and `onPickTag` back to the clear-when-active wrapper) but would also put a 40px strip above the "Posts tagged #x" header, which plan D didn't ask for. `onClearTagFilter` is still used by the Back button, so no unused prop.
- Item 4 (pill width): `maxWidth: 672` (= 720 − 2×24) so the pill lines up with the cards, not the section box.
- Item 5 (kebab): no browser walk possible in this batch (dev server forbidden), so the defensive `zIndex: showMoreMenu ? 20 : 2` is applied outright; inert while the menu is closed, so a walk can only confirm it. W1d: confirm on the 1280 walk with a one-line post followed by another card.
- "clip" grep: the only matches in the file are CSS "overflow clip" comments from round 0, not the parked feature word; left as is.

## Repair round 2 (2026-09-26)
Two SHOULD items came back for `src/app/campus/campus-home.tsx`. Both were already applied in repair round 1 (the reviewer's line refs 8845 / 789 point at the pre-round-1 file); verified against the working tree before touching anything, and per the round-2 brief ("already fixed → say so in the notes") NO code changed this round.
1. SHOULD anchor `scrollMarginTop: 140` → already `"calc(env(safe-area-inset-top, 0px) + 140px)"` at line 8861 (EventCard's `#event-<id>` wrapper), with the comment explaining env() is 0px on the desktop and in Safari. Nothing to do in my file. **C2 in contracts.md still reads `scrollMarginTop: 140` (line 62); I do not own contracts.md.** Amendment for the orchestrator, unchanged from round 1: replace `style={{ scrollMarginTop: 140 }}` with `style={{ scrollMarginTop: "calc(env(safe-area-inset-top, 0px) + 140px)" }}`.
2. SHOULD search row on Chat → already gated: `<CampusBanner search={tab === "chat"} />` (line 790) and the row is `tab !== "chat" ? <div …><CampusSearchBar variant="row" …/></div> : null` (792–802), with a comment on why Chat keeps the in-banner pill (dark chrome + 100dvh lock). Chat is exactly as it was before this wave. The alternative (a dark `row` tone) was considered and not taken in round 1: more surface for wave 3 to recolour, and Chat's chrome already had a pill.
- Re-checked: `CampusBanner`'s `search` prop is a real prop (not dangling), the phone's `compactSearch` path is untouched. Anchors intact (`#campus-feed`, `#campus-tabs`, `id="post-<id>"`, `id="event-<id>"`). Typecheck result appended below.
- `npx tsc --noEmit`: clean, whole repo, at the time of this run (no sibling errors). Round 2 closed with zero edits to `campus-home.tsx`; the only outstanding piece is the C2 wording in contracts.md, which belongs to the orchestrator.
