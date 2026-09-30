# mobile-feed-strip — the phone campus experience (changes B and D on the phone)

Read-only report, S67. Scope: `src/components/mobile/CampusMobile.tsx`, `OttoMobile.tsx`, `MobileShell.tsx`, the Otto panels, and the two APIs behind "Heads up" / "Trending". Say "video posts", never clips.

## Summary

- The phone does NOT have its own Heads up / Trending code. `CampusMobile.tsx:15` imports `OttoFeedStrip` from the DESKTOP file `src/app/campus/campus-home.tsx:13288` and mounts it at `CampusMobile.tsx:671`, wrapped in a collapse animator (`:645-673`, `maxHeight: 240`).
- It is mounted ABOVE the tab strip, so it shows on Feed AND Events; it only collapses on Orgs / Chat / Map (`ottoCollapsed`, `:583`).
- Data comes from two GETs the strip makes itself: `/api/trending/hashtags?limit=8` (`campus-home.tsx:13300`) and `/api/me/upcoming-events?limit=3` (`campus-home.tsx:13320`).
- Vertical cost above the first post on the Feed tab today: banner (~56–64px sticky) + Otto strip (~10px pad + up to 240px, realistically ~150–200px with two cards) + banner slot + tab header (`padding: 10px 0 4px` + pill row) + pane top padding. Exact style values in "How it works today".
- The Otto tab (`OttoMobile.tsx`) is a separate page (`/otto`) with its own "Coming up" (`OttoUpcoming.tsx:43`) and "Otto saw" (`OttoActivity.tsx:91`) panels fed by `/api/me/otto` — it never renders `OttoFeedStrip`. Change D leaves it untouched.
- Change D on the phone = replace the `:645-673` block with a ≤44px chip strip rendered INSIDE `FeedPane` (or gated `tab === "feed"`), reusing the two fetches + `pickFeedTag` (`:259`) and `setTab("events")`.
- Change B = copy the `FeedCard` style object (spec in "Change points") to desktop. Details below once FeedCard is read.

## Files

| Path | Lines | Role |
|---|---|---|
| `src/components/mobile/CampusMobile.tsx` | 1–4059 | Whole phone /campus page. Top-level `CampusMobile()` `:136-846`; render `:615-845` |
| `src/components/mobile/CampusMobile.tsx` | `:645-673` | Otto strip wrapper (collapse animator) — the thing to remove for D |
| `src/components/mobile/CampusMobile.tsx` | `:686-700` | Sticky tab header (`TabStrip`), top offset depends on `ottoCollapsed` |
| `src/components/mobile/CampusMobile.tsx` | `:702-773` | Horizontal snap-scroller with the five panes (Feed `:726`, Events `:742`, Orgs `:753`, Chat `:765`, Map `:770`) |
| `src/components/mobile/CampusMobile.tsx` | `:909-970` | `TabStrip` (pill row) |
| `src/components/mobile/CampusMobile.tsx` | `:991-1065` | `FeedPane` — list, skeleton, empty/failed states, `FeedTagChip` |
| `src/components/mobile/CampusMobile.tsx` | `:1131-1790` | `FeedCard` — the post card (style spec for B) |
| `src/components/mobile/CampusMobile.tsx` | `:1790-1827` | `EventsPane` (reuses desktop `EventCard`) |
| `src/components/mobile/CampusMobile.tsx` | `:229-267` | `#tag` filter state + `pickFeedTag` (what a trending chip tap calls) |
| `src/components/mobile/CampusMobile.tsx` | `:3583-4059` | `CampusSearchOverlay` + `SearchSection` header `:3799` (not feed-related) |
| `src/app/campus/campus-home.tsx` | `:13288-13545` | `OttoFeedStrip` — Heads up + Trending cards (shared desktop+phone) |
| `src/app/campus/campus-home.tsx` | `:13547-13650` | Megaphone / flame SVG icons for the strip headers |
| `src/app/campus/campus-home.tsx` | `:5652-5672` | Desktop mount of `OttoFeedStrip` |
| `src/components/mobile/OttoMobile.tsx` | 1–493 | Phone `/otto` page: Today/Stats panes, mounts `OttoActivity` `:377`, `OttoUpcoming` `:378` |
| `src/components/otto/OttoUpcoming.tsx` | `:41-104` | "Coming up" panel (RSVP'd events + reminders) from `/api/me/otto` payload |
| `src/components/otto/OttoActivity.tsx` | `:88-138` | "Otto saw" panel (notifications) — no trending here |
| `src/components/mobile/MobileShell.tsx` | `:25-40` | Wrapper: `paddingBottom: calc(64px + safe-area)`, bg `#FAF7F2`, bottom tab bar |
| `src/app/api/trending/hashtags/route.ts` | `:44-127` | Trending tags, 7-day window, campus lane scoped, `limit` ≤20 default 6 |
| `src/app/api/me/upcoming-events/route.ts` | `:28-79` | RSVP'd (going+maybe) events not yet ended, `limit` ≤25 default 5 |
| `src/app/api/me/otto/route.ts` | `:56-89`, `:254-313` | Otto page payload (`UpcomingRow`, `ActivityRow`) — Otto tab's own source |
| `src/components/mobile/use-mobile-tour.ts` | `:107-125` | Campus tour steps target `#otto-mobile-tour-tabs`, `#otto-mobile-tour-feed`, `#otto-mobile-tour-compose` — NOT the Otto strip |
| `src/app/campus/CampusSwitch.tsx` | `:3-26` | Phone gate: `MobileShell` + `CampusMobile` |

## How it works today

### Vertical stack on the phone Feed tab, top to bottom (`CampusMobile.tsx:615-773`)

1. `<main>` `:616-624` — warm gradient bg `linear-gradient(180deg,#FAF7F2 0%,#F4EDE2 100%)` + two radial washes; `minHeight: 100dvh`.
2. Sticky banner wrapper `:627-636` — `paddingTop: env(safe-area-inset-top)`, `position: sticky; top: 0; zIndex: 6`. Inside: `CampusBanner compactSearch` (`campus-home.tsx:4305`), a fixed `height: 64` header (`campus-home.tsx:~4393`), campus colour bg, 44px tile, title 18px, stats line 11px, search icon button 38px. **Cost: 64px + safe-area, always.**
3. **Otto strip wrapper** `:645-673` — `overflow: hidden; maxHeight: ottoCollapsed ? 0 : 240; paddingTop: ottoCollapsed ? 0 : 10; paddingLeft/Right: 12`. Inner div `:659-670` does the swoop animation (`translateY(48vh) scale(0.04)` when collapsed, `transformOrigin: 50% 100%`). Mounts `<OttoFeedStrip onPickTag={pickFeedTag} />` `:671`. `ottoCollapsed = tab === "orgs" || "chat" || "map"` `:583` — so it is OPEN on Feed and Events.
   - `OttoFeedStrip` (`campus-home.tsx:13288-13545`): dark glass bubble `surface` `:13346-13363` (`background rgba(12,8,14,0.78)` + orange gradient, `backdropFilter blur(28px)`, `border 1px rgba(255,140,90,0.45)`, six-layer orange `boxShadow`, `borderRadius 18`). Two sections each `padding: 14px 16px` (`sectionPad` `:13365-13371`). Below 560px the `<style>` block `:13393-13406` stacks them vertically with a 1px horizontal divider.
   - Heads up section `:13410-13473`: `StripHeader` (icon 20px + 11px uppercase title + 11px italic subtitle, `:13651-13695`) then up to 3 rows `padding: 6px 0`, 13px title + 11px date chip (`formatUpcomingChip` `:9340`: Today / Tmrw / weekday / "Sep 25"), green `#5BD18C` dot for going, amber `#FFB85A` for maybe. Rows are NOT tappable (plain divs, `:13440`).
   - Trending section `:13479-13541`: `StripHeader` then `flexWrap` pill row `gap: 6`, `marginTop: 8`; each pill a `<button>` `padding: 5px 10px`, `borderRadius 999`, `background rgba(255,140,90,0.12)`, `border 1px rgba(255,140,90,0.28)`, `color #FFB89C`, 12px/700, `#tag` + count. Tap → `onPickTag(t.tag)`.
   - **Px estimate on a 375px phone (stacked):** 10 pad + Heads up (14 pad + 16 header + 4 + 3×~30 rows + 14 pad ≈ 138) + 1 divider + Trending (14 + 16 + 8 + one or two 28px pill rows + 14 ≈ 80–110) ≈ **220–260px**, clamped by `maxHeight: 240` (`:648`), so the bottom of Trending can be CLIPPED when both sections are full. With zero RSVPs it is ~190px (the empty copy `:13431-13433` still takes two lines).
4. Banner slot `:681-684` — `CampusConfirmBanner` + `PushAsk placement="campus"`; 0px when neither renders, hidden on Map.
5. Sticky tab header `:686-700` — `padding: 10px 0 4px`, `position: sticky; top: calc(safe-area + 64px)` (56px when collapsed — 8px UNDER the 64px banner, `:692-694`; harmless because the header bg is transparent but worth knowing). `TabStrip` `:909-963`: pills `padding: 7px 14px`, 13px/700, `border 1px rgba(28,28,30,0.10)`, active `#1C1C1E`/white, inactive `rgba(255,255,255,0.7)`/`#5C5853`, row `padding: 0 16px 8px`, `gap: 6`. **Cost: 10 + ~32 pill + 8 + 4 = ~54px.**
6. Pane scroller `:702-724` — `display: flex; overflowX: auto; scrollSnapType: x mandatory`; five `<section style={paneStyle}>` `:726-772`. `paneStyle` `:890-898`: `flex: 0 0 100%`, `padding: "12px 16px 96px"`, `display: flex; flexDirection: column; gap: 10`. **Cost before first card: 12px.** The 96px bottom clears the FAB + `MobileShell` adds `paddingBottom: calc(64px + safe-area)` (`MobileShell.tsx:32`).
7. `FeedPane` `:991-1062` — optional `FeedTagChip` `:1065-1094` (`#tag ×`, `padding: 6px 10px 6px 12px`, `rgba(255,92,53,0.10)` bg, `#B83A1A`), then `FeedCard` per post; `PaneSkeleton` `:3103` (3 × 110px, radius 18); `EmptyTab` `:3121` (dashed 18px radius card).

**Total chrome above the first post today (Feed tab, no banner card): ~64 (banner) + ~220 (strip) + ~54 (tabs) + 12 (pane pad) ≈ 350px + safe-area.** The strip alone is ~60% of that. On an iPhone 15 (852pt tall, ~59pt status, ~34 home) the first card starts at ~410pt and the FAB/tab bar eat the bottom 64+34, so roughly 340pt of feed is visible on first paint.

### Data the strip fetches (its own two GETs, per mount; no hook is shared)

- `/api/trending/hashtags?limit=8` (`campus-home.tsx:13300`) → `{ trending: [{tag, count}], school, campus_id }`. Route `src/app/api/trending/hashtags/route.ts:44-127`: posts with `type = "post"` in the last 7 days (`WINDOW_DAYS`, `:11`), scoped to the viewer's campus lane via `feedLaneOrFilter(feedLaneFor(scope, viewer))` `:91-94`, tags normalised (`trim, lowercase, strip #`, `:107`), counted in JS, top-`limit` (max 20, default 6).
- `/api/me/upcoming-events?limit=3` (`campus-home.tsx:13320`) → `{ upcoming: [{id,title,starts_at,ends_at,location,org,viewer_status}] }`. Route `src/app/api/me/upcoming-events/route.ts:46-58`: `rsvps` inner-joined to `events`, `user_id = me`, `status in (going, maybe)`, `event.ends_at >= now`, ordered by `starts_at`, max 25 default 5. No 7-day cap (the Otto route has one, `otto/route.ts:262`).
- Each has its own error state + Retry (`LoadFailed tone="dark" compact`, `:13419`, `:13496`).

### Tap targets today

- Trending pill → `pickFeedTag(tag)` (`CampusMobile.tsx:259-267`): normalises, `setFeedTag`, `setTab("feed")`, `window.scrollTo(0)`. FeedPane then shows `visibleFeed` (`:589-598`) = loaded matches until `/api/feed?limit=50&tag=` answers (`:503-551`).
- Heads up row → nothing. There is no `/events/<id>` page (`OttoUpcoming.tsx:57-58` says that link 404'd); the Otto panel links to `/campus?tab=events`.

### The Otto tab (`/otto` → `OttoMobile.tsx`) is separate

- `OttoMobile` `:44-404` gets `initial: OttoPayload` from `/api/me/otto` server-side, renders Today pane `:369-394`: `PushAsk`, `OttoActivity` ("Otto saw", notifications, `OttoActivity.tsx:88-138`), `OttoUpcoming` ("Coming up": RSVP'd events within 7 days + dated reminders, `OttoUpcoming.tsx:41-104`), `OttoRequests`, `OttoTellInput`, `OttoSettings`; Stats pane `:395-400` `OttoMetrics`.
- No "Trending" and no `OttoFeedStrip` anywhere in `OttoMobile.tsx` or `src/components/otto/*` (grep: only `campus-home.tsx:5672` and `CampusMobile.tsx:15,671` reference `OttoFeedStrip`). The Otto tab's "Heads up" equivalent is the `OttoUpcoming` "Coming up" list, fed by `otto/route.ts:254-313` (own query, 7-day window, includes reminders). **Change D does not need to touch any of it.**

## Change points

### D1 — Remove the Otto strip from above the tabs (S)
- **Where:** `CampusMobile.tsx:638-673` (wrapper + animator + `<OttoFeedStrip>`), `:583` (`ottoCollapsed`), `:692-696` (header `top` ternary + `transition: top`), `:15` (import), `:229` (comment mentions "the Otto strip's trending chips").
- **Approach:** delete the block; header `top` becomes the constant `calc(env(safe-area-inset-top, 0px) + 64px)`. Keep `OttoFeedStrip` exported from `campus-home.tsx` until the desktop wave replaces it there too (`campus-home.tsx:5672` still uses it). Gain: ~220–260px back on Feed and Events.

### D2 — Shared data hook for the strip (S)
- **Where:** new `src/components/campus/use-otto-strip-data.ts` (or `src/lib/otto/`), lifted from `campus-home.tsx:13289-13336` (the two `useEffect`s, error state, retry keys).
- **Shape:** `useOttoStripData({ upcomingLimit = 3, trendingLimit = 8 })` → `{ upcoming: StripUpcoming[] | null, trending: StripTrend[] | null, upcomingErr, trendingErr, retryUpcoming(), retryTrending() }`. Move the `StripTrend` / `StripUpcoming` types (`campus-home.tsx:13267-13276`) and `formatUpcomingChip` (`:9340-9360`) next to it and re-import them in `campus-home.tsx` so the desktop `OttoFeedStrip` keeps working unchanged.
- Uses `vibeRequest` with `quiet: true` exactly as today (`:13300-13304`, `:13320-13324`); no API change.

### D3 — `RollingStrip` component, phone Feed pane only (M)
- **Where:** new `src/components/campus/RollingStrip.tsx`; mounted as the FIRST child of the Feed `<section>` at `CampusMobile.tsx:726-741`, above `<FeedPane>` (so it scrolls with the feed, swipes away with the pane, and gets `paneStyle`'s `gap: 10` below it for free). Props: `{ onPickTag, onPickEvent, activeTag, tone: "light" }`.
- **Container (≤44px):** `height: 40; display: flex; alignItems: center; gap: 8; overflowX: auto; overscrollBehaviorX: contain; scrollSnapType: "x proximity"; scrollbarWidth: none; WebkitOverflowScrolling: touch; margin: "0 -16px"; padding: "0 16px"` (bleeds past `paneStyle`'s 16px side padding so chips run edge to edge), `className="vibe-no-scrollbar"` (`globals.css:2707`). Optional edge fade: `WebkitMaskImage: linear-gradient(90deg, transparent 0, #000 16px, #000 calc(100% - 28px), transparent)`.
- **Chip base:** `<button type="button">` `height: 30; padding: "0 12px"; borderRadius: 999; flexShrink: 0; display: inline-flex; alignItems: center; gap: 6; fontFamily: "DM Sans, sans-serif"; fontSize: 12.5; fontWeight: 700; whiteSpace: nowrap; scrollSnapAlign: start; WebkitTapHighlightColor: transparent; cursor: pointer`.
- **Event chip (RSVP'd, first):** `background: rgba(255,253,248,0.78); border: 1px solid rgba(255,255,255,0.7); color: #1C1C1E; boxShadow: inset 0 1px 0 rgba(255,255,255,0.85)` (the FeedCard surface, `:1298-1305`). Leading 6px dot: `#5BD18C` going / `#FFB85A` maybe (accent rule `campus-home.tsx:13436`). Title `maxWidth: 150; overflow: hidden; textOverflow: ellipsis`. Trailing `formatUpcomingChip(starts_at)` in `fontSize: 11; fontWeight: 700; color: #8A8580`. `aria-label={`${title}, ${when}, you're ${going ? "going" : "interested"}`}`.
- **Tag chip (trending, after events):** `background: rgba(255,92,53,0.10); border: 1px solid rgba(255,92,53,0.22); color: #B83A1A` (= `FeedTagChip`, `:1078-1080`); text `#tag` + count in `fontWeight: 500; opacity: 0.65`. Active tag (`activeTag === tag`): `background: #1C1C1E; color: #fff; border-color: transparent` (the active `TabStrip` pill, `:947-948`), and tapping it again clears the filter.
- **Order + caps:** `upcoming.slice(0,3)` then `trending.slice(0,8)`; ~11 chips max, ~2.5 screens of scroll at 375px.
- **Hidden when empty:** `if ((upcoming?.length ?? 0) === 0 && (trending?.length ?? 0) === 0 && !upcomingErr && !trendingErr) return null;` — also `null` while both are still `null` (no skeleton: a 40px placeholder would just re-introduce the jump the feed is trying to lose). On a refused read render ONE muted chip `Couldn't load · Retry` per failed source (`border: 1px dashed rgba(28,28,30,0.14); color: #5C5853`), calling `retryUpcoming` / `retryTrending` — the codebase rule is that a refused read never reads as "nothing here" (`OttoUpcoming.tsx:44-45`, `campus-home.tsx:13291-13292`).
- **Rolling:** v1 = manual horizontal scroll with snap. If Franky wants auto-roll: duplicate the chip row inside a track, `@keyframes strip-roll { to { transform: translateX(-50%) } }` at ~40s linear, `animation-play-state: paused` on `:hover`/touch, and `@media (prefers-reduced-motion: reduce) { animation: none }`. Adds ~30 lines and a `<style>` tag; not recommended for the first cut.

### D4 — Tap targets (S)
- **Tag chip →** the existing `pickFeedTag` (`CampusMobile.tsx:259-267`) — normalises, sets `feedTag`, `setTab("feed")`, scrolls to top. Pass `activeTag={feedTag}`; `onPickTag = (t) => t === feedTag ? setFeedTag(null) : pickFeedTag(t)`.
- **Event chip →** new `pickEvent(id)` in `CampusMobile`: `setTab("events")` then `requestAnimationFrame(() => document.getElementById(`event-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }))`. Needs an anchor: `EventCard` (`campus-home.tsx:8651`) has no `id`/`data-` attribute today (grep of `:8651-8760`), so either add `id={`event-${ev.id}`}` to its `MouseSpotlight` root (`:8697`) or wrap it in `EventsPane` (`CampusMobile.tsx:1814-1816`) with `<div id=... style={{ scrollMarginTop: 130 }}>` (sticky banner 64 + tab header ~54 + pad). If `events === null` (still loading) just switch tabs. No `/events/<id>` page exists (`OttoUpcoming.tsx:57-58`).

### B1 — Phone post card spec for desktop to copy (S, spec only; desktop reader implements)
- **Page/bg:** `MobileShell` bg `#FAF7F2` (`MobileShell.tsx:33`); `<main>` gradient `linear-gradient(180deg,#FAF7F2 0%,#F4EDE2 100%)` + two warm radial washes (`CampusMobile.tsx:618-621`).
- **List:** column, `gap: 10`, side padding 16 (`paneStyle` `:890-898`). Separation is the gap + each card's own border/shadow; NO divider lines.
- **Card root** (`:1285-1308`): `<button>` `width: 100%; background: rgba(255,253,248,0.78); border: 1px solid rgba(255,255,255,0.7); borderRadius: 18; padding: 14; textAlign: left; boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)"; overflow: hidden; position: relative`.
- **Header row** (`:1310-1399`): `flex; alignItems: center; gap: 10`. Avatar 36×36, `borderRadius: 999`, `url(avatar) center/cover` or `#FFD3C2`, initials Fraunces 800 13px `#1C1C1E`, `border: 1px solid rgba(255,255,255,0.6)`. Name: Fraunces 14/800 `#1C1C1E`, single line ellipsis. Meta: DM Sans 11.5/600 `#8A8580`, `letterSpacing: 0.02em`, `@handle · 2h · Edited · Club`. ⋯ button 30×30 round, `background: rgba(255,255,255,0.62); border: 1px solid rgba(28,28,30,0.06); color: #5C5853`, 3 dots r=1.6.
- **Body** (`:1402-1415`): `<p>` `margin: 10px 0 0`; DM Sans 14; `#1C1C1E`; `lineHeight: 1.45`; `-webkit-line-clamp: 4`; `whiteSpace: pre-wrap; wordBreak: break-word`.
- **Media** (`:1422-1456`): `marginTop: 10; width: 100%; aspectRatio: "1 / 1"; borderRadius: 14; overflow: hidden; background: url(thumb) center/cover, #1C1C1E`. Video posts: centered 44px circle `rgba(0,0,0,0.55)` with an 18px white play triangle.
- **Tags** (`:1460-1494`): `marginTop: 10; flexWrap; gap: 6`; max 4; pill `padding: 3px 9px; borderRadius: 999; border: none; background: rgba(255,92,53,0.10); color: #B83A1A`; DM Sans 11.5/700.
- **Friend-repost pill** (`:1502-1537`): `marginTop: 10; padding: 4px 8px 4px 4px; borderRadius: 999; background: rgba(46,160,72,0.10); border: 1px solid rgba(46,160,72,0.22); color: #1F6B3A`; 11.5/700; up to 3 stacked 18px avatars, `marginLeft: -6`, `border: 1.5px solid #FAF7F2`.
- **Action row** (`:1544-1763`): `marginTop: 10; flex; alignItems: center; gap: 14`; DM Sans 12/700 `#8A8580` `letterSpacing: 0.02em`. Like / Comment / Repost pills: `padding: 4px 8px; borderRadius: 999; border: 1px solid rgba(28,28,30,0.06); background: rgba(255,255,255,0.55); color: #5C5853`, 14px stroke icons, `gap: 6`, `transition: transform 140ms ease, background 140ms ease`. Liked: `background: rgba(255,92,53,0.10); color: #E04A26`, heart filled `#FF5C35`, `scale(1.03)`. Reposted: `rgba(46,160,72,0.12)` / `#2E8242`. Views: plain inline `gap: 4` eye icon + count, only when `view_count > 0`. Save: 30×30 round, `marginLeft: auto`; saved `background: rgba(28,28,30,0.10); color: #1C1C1E`, `scale(1.05)`.
- **Behaviour** (`:1247-1268`): single tap opens the viewer after a 240ms window; double tap toggles like; inner links/chips `stopPropagation` + cancel the pending open. Skeleton (`:3103-3119`): 3 × `height: 110; borderRadius: 18; background: rgba(255,253,248,0.45); border: 1px solid rgba(255,255,255,0.6)`.
- Note for desktop: these are LIGHT-surface values; the desktop feed column is dark glass today (`SceneHeader tone="dark"`, `campus-home.tsx:5647`, `DARK_GLASS_SURFACE` on `EventCard` `:8697`). Copying the card verbatim implies the desktop feed column goes cream too, or a dark twin of each value.

## Risks

1. **Nested horizontal scrollers.** The strip (`overflowX: auto`) sits inside the pane scroller (`CampusMobile.tsx:702-724`, `overflowX: auto; scrollSnapType: x mandatory`). On iOS the inner scroller takes the gesture while it can scroll and chains to the outer at its ends, so a swipe that runs off the end of the chips can flip the tab. `overscrollBehaviorX: contain` on the strip stops the chaining; still needs the 375px browser pass (memory: request-level checks passed three broken things in S64).
2. **Today's strip clips silently.** `maxHeight: 240` (`:648`) is below the stacked strip's natural height when both sections are full (~220–260px), so the bottom of Trending is cut off on some phones now. Removing the block fixes it; nobody should "port" the 240 cap.
3. **Header offset regression.** `top` flips 64→56px with `ottoCollapsed` (`:692-694`) even though the banner is always 64px (`campus-home.tsx:~4393`). When D1 makes it a constant, verify the tab header sits flush under the banner on all five tabs and that the Map pane height assumption (`:677-679`) still holds.
4. **Desktop still imports `OttoFeedStrip`.** Only two mounts exist (`campus-home.tsx:5672`, `CampusMobile.tsx:671`). D2 must move `StripTrend`/`StripUpcoming`/`formatUpcomingChip` without breaking the desktop mount; once the desktop wave also replaces it, `OttoFeedStrip`, `StripHeader`, `TalkingHeadIcon`, `FireIcon` (`:13288-13695`) become dead code to delete in one sweep, not two.
5. **Events tab loses its "Heads up".** The strip is above the tabs today, so Events shows RSVP'd events at the top. D says Feed only; the Events tab will show only `EventCard`s (`:1812-1818`) with no "you're going to these" summary. Intended, but a visible change for anyone who RSVP'd.
6. **RSVP window mismatch.** `/api/me/upcoming-events` has no date cap (`route.ts:46-58`), Otto's "Coming up" caps at 7 days (`otto/route.ts:262`). A chip for an event 10 weeks out next to "trending this week" reads wrong; add `?days=` server-side or filter client-side to ≤14 days.
7. **Event chip has nowhere to go.** No `/events/<id>` page (`OttoUpcoming.tsx:57-58`). D4's tab-switch + `scrollIntoView` depends on an `id` that `EventCard` doesn't render yet and on `events` having loaded; the fallback is a bare tab switch.
8. **Auto-roll a11y.** A marquee needs `prefers-reduced-motion`, pause-on-touch, and duplicated DOM for the loop; chips moving under a thumb hurt tap accuracy. Manual snap scroll avoids all three.
9. **Two-chip duplication with the `#tag ×` chip.** With a filter on, `FeedTagChip` (`:1018`, `:1065-1094`) and a highlighted strip chip both say the tag; pick one (recommend: highlighted strip chip clears on re-tap, drop `FeedTagChip` when the strip renders, keep it when the strip is hidden/empty).
10. **Dark mode (C) later.** Every colour in `CampusMobile.tsx` and `OttoFeedStrip` is an inline literal (`#1C1C1E`, `rgba(255,253,248,0.78)`, …); nothing reads a CSS variable. Build `RollingStrip` on `tone` props or `var(--…)` tokens from day one so C doesn't have to reopen it.
11. **Tour spotlight.** The campus tour targets `#otto-mobile-tour-feed` (the pane scroller, `use-mobile-tour.ts:107-125`). The strip inside the Feed pane falls inside that spotlight; the copy "The campus feed." still fits, but replay the tour once (Settings → Replay tour).
12. **Refresh coupling.** Posting/deleting/RSVPing refetches feed/events (`:786`, `:750`) but never the strip; a fresh RSVP won't appear as a chip until remount (same as today). If wanted, expose `retryUpcoming` and call it from `EventsPane`'s `onMutate` (`:750`).

## Open questions for Franky

1. Rolling = manual side-scroll with snap (recommended) or an auto-moving marquee? Marquee adds motion, needs reduced-motion handling, and moving chips are harder to tap.
2. Tapping an RSVP'd event chip: switch to the Events tab and scroll to that card (there's no event page yet) — good enough, or should it open an RSVP/detail sheet in place?
3. While a #tag filter is on, keep the strip and highlight the active chip (tap again clears), or hide the strip behind the current `#tag ×` chip?
4. The Events tab currently shows Heads up too (the strip sits above the tabs). Confirm it goes Feed-only and Events gets nothing back.
5. RSVP'd chips: only the next 7–14 days (like Otto's "Coming up"), or every future RSVP?

## Copy suggestions

Not asked for this subsystem. One note: "video posts", never "clips" — the header comment in `CampusMobile.tsx:61-62` and the `?clip=` fallback comment `:204-206` still say "Clips"; leave the `?clip=` param (legacy links) but the comments can change when the file is next touched.
