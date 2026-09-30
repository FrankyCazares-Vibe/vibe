# desktop-campus-home — S67 understand report

Subsystem: desktop campus page `src/app/campus/campus-home.tsx` (15,705 lines), `src/components/campus-app-shell.tsx` (50), `src/components/LeftNav.tsx` (1,772). Changes B (desktop feed like phone) and D (rolling strip) on desktop. Read-only pass on 2026-09-25; paths relative to the repo root.

NOTE: an earlier chunk of this report was written to `REPORT_KEY.md` before it became clear that file is shared with the campus-enforcement reader; lines "### Column widths / breakpoints" .. "### Heads up / Trending strip" in that file belong to THIS report and can be dropped there.

## Summary
(see "## Summary (final)" at the end)

## Files
| Path | Lines | Role |
|---|---|---|
| src/app/campus/page.tsx | 1-19 | Server page: `enforceCampusAccess("/campus")` then `<CampusSwitch showSchoolVerifiedBanner>` |
| src/app/campus/CampusSwitch.tsx | 1-31 | `useIsMobile()` fork: mobile -> `MobileShell + CampusMobile`; else `CampusHome` |
| src/app/campus/campus-home.tsx | 360-925 | `CampusHome` — page shell, tab state, org/channel state, modals |
| campus-home.tsx | 4040-4186 | `ViewerCampus` store (`useViewerCampus`, `viewerCampusPromise` -> `GET /api/campuses`) |
| campus-home.tsx | 4275-4303 | `PickCampusStrip` (verified student with no campus; links `/settings#campus`) |
| campus-home.tsx | 4305-4546 | `CampusBanner` (title/monogram/stats + search bar mount; shared with phone) |
| campus-home.tsx | 4625-5174 | `CampusSearchBar`, `PersonRow`, `EntityRow` |
| campus-home.tsx | 5176-5260 | `CampusTabs` (`#campus-tabs`), `TabBody` (switch on tab) |
| campus-home.tsx | 5262-5314 | `GlassCard`, `DarkGlassCard` (+ `DARK_GLASS_SURFACE` 5281) |
| campus-home.tsx | 5316-5484 | Feed types (`FeedPost` 5335, `FeedEntry` 5383), `useReportedPostIds`, `relativeTime` |
| campus-home.tsx | 5486-5764 | `FeedTabBody` — fetches feed, renders heading + OttoFeedStrip + composer + post list |
| campus-home.tsx | 5769-6212 | `FeedComposer` (wraps itself in the `glass` prop, 5987) |
| campus-home.tsx | 6214-7199 | `renderPostContent`, `FeedRow` (the desktop post card) |
| campus-home.tsx | 7239-7625 | `PostViewersModal`, `FriendRepostPill`, `RepostBanner`, `RepostMenu` |
| campus-home.tsx | 7627-8215 | `CommentsDrawer`, `CommentRow` |
| campus-home.tsx | 8216-8390 | SVG icons + `EngagementAction` (like/comment/repost/views/save) |
| campus-home.tsx | 8392-8444 | `SceneHeader` (eyebrow + h2 + subtitle) |
| campus-home.tsx | 8446-8649 | `CampusEvent` type, `EventsTabBody` (`GET /api/events?limit=50`) |
| campus-home.tsx | 8651-8877 | `EventCard` (RSVP via `PUT/DELETE /api/events/[id]/rsvp`, attendees, report) |
| campus-home.tsx | 8879-9391 | `AttendeesModal`, `AttendeeList`, `RsvpButton` (9296), `formatUpcomingChip` (9340), `formatEventTime` (9362) |
| campus-home.tsx | 9392-9700 | `CreateEventModal` |
| campus-home.tsx | 9701-11420 | Orgs tab: `OrgsTabBody`, `OrgQuickViewModal`, Discover* |
| campus-home.tsx | 11422-13265 | Map tab: `MapTabBody`, Starfield, halos, nodes, `ZonePanel` |
| campus-home.tsx | 13267-13696 | **`OttoFeedStrip`** (Heads up / Trending) + `TalkingHeadIcon`, `FireIcon`, `StripHeader` |
| campus-home.tsx | 13698-14276 | Chat rails: `ServerRail` (aside 13710), `ChannelRail` (asides 14073 / 14088) |
| campus-home.tsx | 14278-15243 | `ChannelMain`, `ChannelChat` |
| campus-home.tsx | 15244-15705 | `Avatar`, badges, role chips, chat time helpers, `EmptyState` |
| src/components/campus-app-shell.tsx | 33-50 | `CampusAppShell` — `.vibe-app-shell`: `<LeftNav/>` + children + optional `.vibe-right-rail` + `MobileTabBar` + `OttoCorner` |
| src/components/LeftNav.tsx | 167-390 | `LeftNav` aside (`.vibe-left-nav-aside`, sticky, 100vh, cream `#FAF7F2` + coral radials); nav, admin link, `NavIdentityChip`, `CalendarWidget` |
| src/components/LeftNav.tsx | 451-1750 | `CalendarWidget`, `CalendarModal`, RSVP/personal events (`CALENDAR_CHANGED_EVENT` at 18, `emitCalendarChanged` 19) |
| src/app/globals.css | 2590-2648 | `.vibe-app-shell` layout + 899px collapse rules, `body.vibe-hide-otto` |
| src/app/globals.css | 2862-2875 | 760px rules for `.campus-three-rail` / `.campus-feed-grid` / `.campus-feed-aside` (legacy) |
| src/components/mobile/CampusMobile.tsx | 583, 645-673, 890-898, 991-1062, 1131-1790 | `ottoCollapsed`, strip mount, `paneStyle`, `FeedPane`, `FeedCard` (phone card to match for B) |
| src/app/api/trending/hashtags/route.ts | 15-89 | Trending: viewer's campus, 7 days; `resolveCampusRequest(null, …)` — no `?campus=` (78, 89) |
| src/app/api/me/upcoming-events/route.ts | 28-89 | RSVP'd (going/maybe) events not yet ended, by start; no campus scope |

## Top-level map of campus-home.tsx (line -> symbol)
- 107 `loadOttoTourScript`, 128 `stripWelcomeParam`, 140 `CAMPUS_TAB_KEYS`, 148 `parseInitialTab`
- 155-202 types `Role`, `Org`, `BackdropKey`, `Channel`; 203 `colorForOrg`, 210 `initialsForOrg`
- 220 `COLORS`, 247 `GLASS_SURFACE`, 261 `BACKDROP_PRESETS`, 311 `DEFAULT_BACKDROP`, 314 `FEED_BACKDROP`, 322 `CHAT_CHROME_BACKDROP`, 327 `Tone`, 329 `getTabScene`, 341 `CampusTab`, 343 `TABS`, 356 `campusEyebrow`
- 360 `CampusHome` (page), 927 `LoadingPane`
- 945 `CreateOrgModal`, 1225 `CreateChannelModal`, 1354 `OrgSettingsModal`, 1514-3553 settings sub-panels + channel settings
- 3555 `ModalShell`, 3631-3745 modal style helpers, 3746 `LinksEditor`, 3880 `Field`, 3913 `ChoiceField`
- 4040 `ViewerCampus` + store (4073-4186), 4188 `campusMonogram`, 4199-4273 banner palette/stats, 4275 `PickCampusStrip`, 4305 `CampusBanner`
- 4548-4623 search types/helpers, 4625 `CampusSearchBar`, 5009 `PersonRow`, 5108 `EntityRow`
- 5176 `CampusTabs`, 5234 `TabBody`, 5262 `GlassCard`, 5295 `DarkGlassCard`
- 5316-5484 feed types/hooks, 5486 `FeedTabBody`, 5769 `FeedComposer`, 6214 `renderPostContent`, 6279 `FeedRow`
- 7239 `PostViewersModal`, 7366 `feedRowMenuItemStyle`, 7388 `FriendRepostPill`, 7444 `RepostBanner`, 7480 `RepostMenu`
- 7627 `FeedComment`, 7648 `CommentsDrawer`, 7813 `CommentRow`, 8216-8318 icons, 8320 `EngagementAction`, 8379/8384 count formatters
- 8392 `SceneHeader`, 8446 `CampusEvent`, 8475 `EventsTabBody`, 8651 `EventCard`, 8863 `eventCardSubtleLink`, 8900 `EventReportAction`, 8930 `ManageAttendeesAction`, 8970 `AttendeesModal`, 9171 `AttendeeList`, 9296 `RsvpButton`, 9340/9362 time formatters, 9394 `CreateEventModal`
- 9701-9847 org discover types/helpers, 9848 `OrgsTabBody`, 10435 `OrgQuickViewModal`, 10769 `CreateOrgBanner`, 10851 `DiscoverGroup`, 10979 `DiscoverSearchBar`, 11038 `DiscoverFilterChips`, 11105 `DiscoverCard`, 11335 `DiscoverChip`, 11402 `SearchIcon`
- 11422-11471 map types, 11473 `MapTabBody`, 12250 `LegendDot`, 12273 `Starfield`, 12344 `SchoolHalos`, 12389 `SchoolLabels`, 12442 `ContourBackdrop`, 12486 `YouHereNode`, 12560 `MajorNode`, 12720 `OrgCenterCluster`, 12940 `ZonePanel`, 13178 `ZonePersonRow`, 13261 `hashString`
- 13267 `StripTrend`, 13268 `StripUpcoming`, 13288 `OttoFeedStrip`, 13551 `TalkingHeadIcon`, 13600 `FireIcon`, 13651 `StripHeader`
- 13698 `ServerRail`, 13806 `ServerPill`, 13896 `RailSectionHeader`, 13915 `ChannelRow`, 14033 `ChannelRail`, 14278 `ChannelMain`, 14409 `ChatMessage`, 14432 `ChannelChat`
- 15244 `Avatar`, 15315 `VerifiedBadge`, 15337 `RoleChip`, 15374 `PermissionsCard`, 15435 `RoleLegend`, 15470-15533 chat time helpers, 15535 `hexToRgba`, 15543 `EmptyState`

## How it works today

### Page shell + tab system (campus-home.tsx 360-925)
- `CampusHome` wraps everything in `<CampusAppShell>` (747) -> `.vibe-app-shell` from globals.css 2598 (LeftNav + flex content; no `sidebar` prop is passed, so /campus has NO right rail).
- Outer `<div>` (749-766): `minHeight: 100vh` (chat: `height: 100dvh; overflow: hidden`), `background: scene.css`, `backgroundAttachment: fixed`, `color` from `scene.tone`. `getTabScene` (329-339): every non-chat tab uses `FEED_BACKDROP` (cream paper, 314-317) with tone `dark`; chat uses `CHAT_CHROME_BACKDROP` (322-325) tone `light`.
- Order inside: `<CampusBanner/>` (767) -> `<PickCampusStrip/>` if verified-but-no-campus (768) -> `<CampusTabs active onChange/>` (769; dark glass pill bar 5184-5230) -> either the chat three-rail grid `72px 240px 1fr` (793-829) or `.campus-feed-grid` flex column (837-853) holding `<TabBody tab feedTagFilter onClearTagFilter onPickTag/>` (5234-5260).
- Tab state: `useState<CampusTab>` seeded once from `?tab=` (382-400); `?welcome=1`, `?post=`, `?tag=` all force `feed`. Tab changes do NOT write to the URL (379-380). `feedTagFilter` seeded from `?tag=` (415-418). `onPickTag` (425-428) = switch to feed + set tag filter (this is what Trending chips call). `TabBody` keys `FeedTabBody` by the tag (5250), so a tag change remounts the feed.
- `?campus=` is NOT read anywhere in campus-home.tsx (grep). `CampusSwitch.tsx` is only a viewport fork. Banner identity comes from `useViewerCampus()` (4179): one shared `GET /api/campuses` (4099) with 30 s TTL (4061), cached in module state, refreshed on pageshow/visibility (4137-4143). `needsCampusPick` (743-744) shows `PickCampusStrip`.

### Column widths / breakpoints
- `.vibe-app-shell` = `grid-template-columns: 200px 1fr` (globals.css 2598-2601); `--with-rail` adds `320px` (2603) but /campus never passes `sidebar` (campus-home 747), so the content column is `100vw - 200px` with NO max-width on the Feed tab.
- LeftNav aside: `.vibe-left-nav-aside`, `padding 20px 14px`, sticky, `height: 100vh`, `overflowY: auto`, cream `#FAF7F2` + two coral radial gradients (LeftNav.tsx 234-260). Contains logo (278-292), nav items Campus/Network/Messages/Otto/Settings (27/75/98/113/138), Admin link (326-367), `NavIdentityChip` (377), `CalendarWidget` (387; fetches `/api/me/calendar` at 467/488).
- Breakpoints: 899px hides `.vibe-left-nav-aside`, `.vibe-right-rail`, `#otto-corner` and collapses the grid to `1fr` (globals 2628-2643). `useIsMobile` (src/lib/use-is-mobile.ts, `MOBILE_BREAKPOINT_PX = 900`) makes `CampusSwitch` render `CampusMobile` under 900px, so `CampusHome` desktop code only runs at >= 900px; the 760px rules in globals 2862-2875 (`.campus-three-rail`, `.campus-feed-grid`, `.campus-feed-aside`) are legacy and effectively dead (`.campus-feed-aside` has no element anymore). The 560px media query inside the strip's `<style>` (campus-home 13393-13406) only matters on phone, where the strip is shared.
- The only `<aside>`s in campus-home are the Chat rails: `ServerRail` aside 13710 (72px grid column, dark glass, `height: 100%`), `ChannelRail` asides 14073 (no org) / 14088 (240px column, `railGlass`), `ChannelMain` `<main>` 14291/14316 (`1fr`). None are on the Feed tab.
- Feed tab section `#campus-feed` (5632-5641): `flex: 1; padding: "28px 24px 28px 28px"; display flex column; gap 14; width 100%`. Events section (8544-8553) is the same but `maxWidth: 1100`. Map section `maxWidth: 1300` (11823).

### Feed tab: post list + post card (FeedTabBody 5486-5764, FeedRow 6279-7199)
- Data: `GET /api/feed?limit=50` (+`&tag=`) at 5503-5505 via `vibeRequest`; entries are `FeedEntry` (post | repost, 5383-5392) holding `FeedPost` (5335-5381). `viewerId` comes back in the same answer (5546). `refresh` (5536-5550) refetches after any row mutation. `?post=<id>` deep link scrolls to `#post-<id>` and flashes coral (5581-5610).
- Styling is ALL inline style objects (no classes, no `<style jsx>`; the one `<style>` tag in the feed area is the strip's at 13375). Two style objects matter:
  - `feedGlass` (5614-5627): cream frosted column: `background: linear-gradient(180deg, rgba(255,253,248,0.65), rgba(255,250,240,0.55))`, `backdropFilter: blur(28px) saturate(180%)`, `border: 1px solid rgba(255,255,255,0.7)`, inset/outer shadows, `borderRadius: 22`, `overflow: hidden`. Used TWICE: composer wrapper (`<FeedComposer glass={feedGlass}>` 5702, applied at 5987) and the posts column `<div style={feedGlass}>` (5711).
  - `hairline` = `"1px solid rgba(28,28,30,0.06)"` (5629), passed per row as `hairline={idx < entries.length - 1 ? hairline : "none"}` (5753) and applied as `borderBottom` on the `<article>` (6592). So posts are X-style rows inside ONE glass column: `article` = `display flex column; padding "16px 20px"; borderBottom: hairline; position relative` (6584-6596). There is no gap, no per-post surface, no per-post radius.
- Inside the row: kebab menu absolutely positioned top-right (6597-6757, dropdown `position: absolute; top: 32; right: 0; minWidth 180`), `RepostBanner`/quote (6758-6774), `FriendRepostPill` (6775-6779), avatar 40px (6782-6814; org = radius 12, person = round), name/handle/time header (6816-6904), body `<p>` 15px with `renderPostContent` (7011-7032; #tags and @mentions inline, coral `#FF5C35`, 6214-6277), image `paddingTop: 56%` (7034-7052), `<video controls maxHeight 540>` (7053-7068), engagement row `gap 24, marginTop 12` with `EngagementAction` buttons (7069-7150; 8320-8373), inline `CommentsDrawer` (7151-7157), `SharePostSheet` (7161-7172; a vaul Drawer, SharePostSheet.tsx 4, so it portals), portalled `PostViewersModal` (7177-7179; the comment at 7229-7237 explains why `feedGlass`'s backdrop-filter breaks non-portalled fixed descendants), `ReportSheet` (7181-7196, portalled at ReportSheet.tsx 521).
- Phone card for comparison (CampusMobile.tsx `FeedCard` 1131-1790): each post is its own `<button>` surface: `background rgba(255,253,248,0.78); border 1px solid rgba(255,255,255,0.7); borderRadius 18; padding 14; boxShadow inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08); overflow hidden` (1296-1308), 36px avatar (1317-1337), 14px body clamped to 4 lines (1401-1419), square media `aspectRatio 1/1, radius 14` (1421-1457), tag chips (1459-1496), action row (1544+). Cards sit in `paneStyle` = flex column `gap: 10`, `padding "12px 16px 96px"` (890-898). The phone has no inline composer (FAB) and shows the tag chip row above the list (1065).

### "Heads up / Trending" strip (OttoFeedStrip 13288-13545; mounted 5672 desktop and CampusMobile.tsx 671 phone)
- Fetches: `GET /api/trending/hashtags?limit=8` (13300; route = viewer's campus, last 7 days, does NOT accept `?campus=`: trending route 78/89) and `GET /api/me/upcoming-events?limit=3` (13320; route = viewer's RSVPs going/maybe with `event.ends_at >= now`, ordered by start, no campus scope: upcoming-events/route.ts 47-58). Each has its own error/retry state (13293-13296). Types `StripTrend`, `StripUpcoming` (13267-13276). Chip text via `formatUpcomingChip` (9340-9360: Today / Tmrw / weekday / "Sep 30").
- Where it sits (desktop): inside `FeedTabBody`, ONLY when no tag filter, in a flex-wrap row (5655-5674): left `SceneHeader` ("Feed · Indianapolis" eyebrow, h2 "What's on campus today", subtitle; box `flex: 0 1 360px; minWidth 240; maxWidth 480`), right `<OttoFeedStrip>` box `flex: 1 1 460px; minWidth 280`. Then the `← Back` button (tag mode only, 5677-5699), the composer (5701-5708), the posts column (5711). So the strip is the dark rounded block to the right of the heading, above the composer.
- How much space: `surface` (13346-13363) is a dark bubble `rgba(12,8,14,0.78)` with coral glow, `borderRadius 18`; two sections `padding "14px 16px"` (13365-13371) split by `.otto-strip-divider` (13381-13392); each section has a `StripHeader` (icon + uppercase title + italic subtitle, 13651-13694) then up to 3 event rows (`padding "6px 0"`, 13440-13468) or wrapped tag pills (13512-13538). Net height ~120-150px; it never hides when empty (renders "No upcoming events…" / "No trending tags yet…" 13431-13433, 13508-13510, and "Loading…" 13429/13506).
- Event rows are NOT clickable today (plain `<div>`s 13440-13468); only tag pills call `onPickTag` (13516). There is no `/events/[id]` page (`src/app/events` does not exist) and `EventCard` has no `id=` anchor, so "tap → event" needs a new target.
- Phone specifics (mobile reader's file, noted because the component is shared): CampusMobile collapses the strip on orgs/chat/map via `ottoCollapsed = tab === "orgs" || tab === "chat" || tab === "map"` (583) with a max-height/scale animation (645-673); it still shows on Events. The /otto page fetches neither endpoint (grep), so replacing the strip does not touch the Otto tab's panels.

### Events tab RSVP UI (EventsTabBody 8475-8649, EventCard 8651-8861)
- `EventsTabBody` loads `GET /api/events?limit=50` (8487, 8504) and `GET /api/orgs?filter=mine` (8526) to decide `canCreate` (owner/admin of a verified org, 8533). Grid `repeat(auto-fill, minmax(280px, 1fr))`, gap 14 (8624-8629). `refresh` (8486-8497) refetches after RSVP/create.
- `EventCard.setRsvp` (8658-8690): optimistic counters, then `PUT /api/events/${ev.id}/rsvp` `{status}` or `DELETE` (8669-8675), `onMutate()` + `emitCalendarChanged()` (8677-8678; LeftNav's calendar listens), rollback on error. Buttons: two `RsvpButton`s "Going" / "Interested · n" (8808-8823; 9296-9338, `disabled` prop exists). Below: "Add to calendar" ics (8833-8842), `ManageAttendeesAction` if `viewer_can_manage` (8843-8848), `EventReportAction` unless creator (8855).
- Both `/api/feed` (route comment 151-156) and `/api/events` (78-98, `resolveCampusRequest(url.searchParams.get("campus"), viewer)` at 160) already accept `?campus=<id>` server-side (403 `campus_not_in_system`, 400 unknown), as do `/api/orgs`, `/api/campus-map`, `/api/campus-map/zone`, `/api/stats/campus` (grep). `/api/trending/hashtags` does not (78, 89). The desktop page never sends it. The RSVP route has no campus gating (grep of `src/app/api/events/[id]/rsvp/route.ts` finds no campus/scope check).
- Campus lock today: `campus_set_at` on `users` starts a 30-DAY rule (`decideProfileCampusWrite` in `/api/me/profile` route 244-270 -> 429 `campus_change_too_soon`; copy in `src/lib/profile/settings-campus-card.ts` 18-85: `CAMPUS_CONFIRM_LOCK_COPY`, `CAMPUS_SWITCH_LOCK_COPY`, `campusChangeAvailableAt`). Founder wants 45 days: one constant + two copy strings, plus the Settings card note (settings/page.tsx 44-58).

## Change points

### B — desktop feed like the phone: clear separation between posts
1. **Per-post card surface instead of one hairline column** (S). `FeedTabBody` 5711: change `<div style={feedGlass}>` to `<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>` for the entries branch only (keep `feedGlass` for the loading / error / empty states 5712-5747, or wrap those in one card). In `FeedRow` 6584-6596 replace `borderBottom: hairline` with the phone card surface: `background: "rgba(255,253,248,0.78)"`, `border: "1px solid rgba(255,255,255,0.7)"`, `borderRadius: 18`, `padding: "16px 18px"`, `boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)"`. Do NOT add `overflow: hidden` on the article: the kebab dropdown (6635-6650) is `position: absolute` inside it and would clip on short posts. Drop the `hairline` prop end to end (5629, 5753, 6281/6288, 6572, 6592) or leave it wired to `"none"`; the removed-post branch 6569-6573 needs the same surface.
2. **Cap the feed column width** (S). Section 5632-5641 has no max width; add `maxWidth: 720, margin: "0 auto", boxSizing: "border-box"` (or `alignSelf: "center"` + `width: "100%"`) so posts read as a phone-like column on wide screens. Events uses `maxWidth: 1100` (8551) as precedent; Map 1300 (11823). If the strip stays a full-width row (D below) it inherits the same cap.
3. **Composer as its own card** (S). Composer already wraps itself in `glass` (5987). Pass the same card surface object (rename `feedGlass` -> `cardGlass`, drop `overflow: hidden` there too since the composer's cropper is a portalled modal) so the composer and posts share one look; `borderRadius 22` -> `18` to match the phone.
4. **Optional parity touches** (S each, only if wanted): square media (phone `aspectRatio: "1 / 1"` 1427 vs desktop `paddingTop: "56%"` 7047); tag chips under the body (phone 1459-1496; desktop only inlines `#tags` in the text via `renderPostContent` 6246-6266). Leave body clamp off on desktop (phone clamps to 4 lines 1410; desktop opens comments inline, 7012-7020).
5. **Backdrop-filter note** (S, verify): moving `backdropFilter` from the column to each article multiplies blur layers x50; either drop `backdropFilter` on per-post cards (the phone card has none, 1296-1308) or keep it only on the composer. Dropping it also removes the fixed-position containing-block trap described at 7229-7237.

### D — one slim rolling strip, Feed tab only (replaces Heads up / Trending)
6. **Rewrite `OttoFeedStrip` in place as the rolling strip** (M). Keep the component name, the two fetch effects (13297-13336), the types (13267-13276), `formatUpcomingChip` (9340-9360) and the `onPickTag` prop; both mounts (desktop 5672, phone CampusMobile 671) then get the new strip with no import changes. New render: one row, `height ~40px`, `display: flex; gap: 8; overflowX: auto; scrollbarWidth: none; whiteSpace: nowrap` with chips: RSVP'd events first (`● {title} · {formatUpcomingChip}` with the green/amber dot 13436), then trending tags (`#tag n`, reuse the pill style 13517-13531). Auto-roll: a CSS `@keyframes` translateX marquee on a duplicated chip row, paused on hover (`animation-play-state: paused`) and disabled under `prefers-reduced-motion`; or plain horizontal scroll if simpler. Delete the two-section layout 13341-13544, the `<style>` block 13375-13407 (with its 560px rule), `StripHeader` 13651-13694, `TalkingHeadIcon` 13551-13595, `FireIcon` 13600-13649 (~280 lines out). Keep a single small `LoadFailed compact` only when BOTH loads failed; otherwise show what loaded.
7. **Hidden when empty** (S). Render `null` while both lists are `null` (loading) and when `upcoming.length === 0 && trending.length === 0`; no "Loading…" / "No upcoming events…" copy (13429-13433, 13506-13510 go). Because the strip returns null, the parent wrapper must add no padding/gap of its own (desktop: it sits in the section's `gap: 14` flow, fine; phone wrapper 645-673 has `paddingTop 10` when expanded — mobile reader's call).
8. **Mount position on desktop** (S). Replace the header+strip flex row 5651-5674 with the plain `SceneHeader` (5664-5669) followed by `<OttoFeedStrip onPickTag onPickEvent />` as its own flex child, full width of the (now capped) column, directly above the composer 5701. It renders only when `!tagFilter` (already the case: 5643-5675), so it is Feed-tab-only by construction on desktop (`TabBody` 5247-5255 mounts `FeedTabBody` for feed only). Net vertical saving ~80-110px.
9. **Tap → event** (M). No `/events/[id]` page exists and `EventCard` has no anchor. Smallest: thread `onPickEvent(eventId)` like `onPickTag` (CampusHome 425-428 -> TabBody 5239-5259 -> FeedTabBody 5486-5493 -> strip prop): `setTab("events")` + `setPendingEventId(id)`; `EventsTabBody` accepts `highlightEventId`, gives each card `id={`event-${ev.id}`}` (8632) and reuses the scroll+flash pattern from 5588-5596. Alternative with zero plumbing: chip is a `<Link href="/campus?tab=events&event=<id>">`, and `EventsTabBody` reads `?event=` once (like `?post=` at 5581-5610). Trending chips keep `onPickTag(t.tag)` (13516).
10. **Phone follow-through (mobile reader owns)**: `ottoCollapsed` (CampusMobile 583) must also be true on `events` so the strip is Feed-only there; pass `onPickEvent` from CampusMobile (it already has `setTab`).

### E hooks visible from this file (owned by campus-enforcement; listed so D/E can meet)
11. **Browse another campus on desktop** (L overall; desktop part M). Add a `viewCampusId` (from `?campus=` read once like `?tab=` 382-400, or a `CampusSwitch`-level picker) and append `&campus=<id>` to `/api/feed` (5503-5505), `/api/events` (8487, 8504), `/api/orgs` discover calls in `OrgsTabBody`, map calls in `MapTabBody`; `/api/trending/hashtags` needs the param added server-side first (route 78/89). `campusEyebrow` (356) and `CampusBanner` (4318-4324, 4446) show the viewer's HOME campus only; browse mode needs a "Viewing Bloomington · home: Indianapolis" line. Hide the Chat tab or its three-rail (738, 792-829) while browsing; disable both `RsvpButton`s (9313 `disabled`) and the composer (5701) while `viewCampusId !== home`, and add the server check in `/api/events/[id]/rsvp` (none today).
12. **45-day home-campus lock** (S): `CAMPUS_CHANGE_COOLDOWN_MS` (imported at src/lib/profile/profile-campus-write.ts 45; definition site in the next section) + copy strings `CAMPUS_CONFIRM_LOCK_COPY` / `CAMPUS_SWITCH_LOCK_COPY` and the "30-day" doc comments in `src/lib/profile/settings-campus-card.ts` 18-85. `campus_set_at` is already stamped; no schema change.

Cooldown constant for change point 12: `export const CAMPUS_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;` at `src/lib/profile/onboarding-prefill.ts:395` (45 days = change the `30`). Tests to update: `profile-campus-write.test.ts`, `settings-campus-card.test.ts` (same folder).

Change point count: 12 (B: 1-5, D: 6-10, E hooks: 11-12).

## Risks
- **Shared component, two viewports.** `OttoFeedStrip` is imported by `CampusMobile.tsx` (15, 671). Any rewrite ships to the phone the same minute; the phone wrapper's collapse animation (645-673) assumes a ~240px `maxHeight` and `paddingTop 10` even when the strip renders nothing. Coordinate with the mobile reader before deleting the 560px `<style>` rule (13393-13406).
- **The desktop tour targets `#campus-feed`** (500, selector at 5633) and `#campus-tabs` (505, 5185). Keep both ids when restructuring `FeedTabBody`; `/campus?post=<id>` relies on `id="post-<id>"` (5589, 6586).
- **`backdrop-filter` containing block.** `PostViewersModal` is portalled precisely because `feedGlass` sets `backdropFilter` (7229-7237). If the per-post card keeps `backdropFilter`, every non-portalled `position: fixed` child stays trapped; `SharePostSheet` is a vaul drawer (portals), `ReportSheet` portals (521), `ImageCropperModal` portals. Anything new that is fixed-positioned inside a card must portal too. Dropping `backdropFilter` on cards is the safer default and matches the phone.
- **Kebab dropdown clipping.** The row menu (6635-6650) is absolutely positioned; a card with `overflow: hidden` clips it on short posts. Today it is inside a column with `overflow: hidden` too but the column is tall.
- **Hairline prop removal touches the removed-post branch** (6569-6573) and the `FeedRow` signature (6281, 6288); TypeScript will flag any missed caller.
- **Perf.** 50 rows x `backdrop-filter: blur(28px)` is heavy on integrated GPUs; the current design has one blur layer. Marquee animation on the strip should use `transform` only and pause when `document.hidden`.
- **Empty-strip layout shift.** Hiding the strip until data arrives means the composer jumps down ~40px when RSVPs/tags land. Reserve `minHeight: 40` only when the previous answer had rows, or accept the shift.
- **Trending is home-campus only** (route 78/89). In browse mode (E) the strip would show the home campus's tags under another campus's feed unless the route grows `?campus=`.
- **Dark mode (C) footprint here.** campus-home.tsx has ~166 hardcoded cream/ink literals (`#1C1C1E`, `#FAF7F2`, `#8A8580`, `#5C5853`, `rgba(28,28,30,…)`, `#fff`), LeftNav.tsx ~57; `COLORS` (220-245) covers only part. globals.css already declares a shadcn `.dark` token block (239) and `@custom-variant dark` (5) that nothing toggles. B should route new card colors through `COLORS`/CSS variables now so C does not re-touch them.
- **Legacy CSS.** `.campus-feed-aside` / `.campus-feed-grid` 760px rules (globals 2862-2875) are dead under the 900px fork; harmless but misleading when hunting layout bugs.
- **Report file collision.** This reader's first chunk went into the shared `REPORT_KEY.md` (now headed by the campus-enforcement reader's report); its lines "### Column widths / breakpoints" through the strip section duplicate content here and can be deleted from that file.

## Open questions for Franky
1. Should the desktop feed be a centered phone-width column (~680-720px) with empty cream margins, or keep the full width and only add the card separation?
2. On the rolling strip, does tapping an RSVP'd event go to the Events tab (scroll + flash the card) or open the club's page (`/orgs/<handle>`)? There is no event detail page today.
3. Auto-rolling marquee (pauses on hover, off under reduced motion) or a plain horizontally scrollable chip row with no motion?
4. When a student has no RSVPs and no trending tags, hide the strip entirely (composer moves up) or keep a one-line "Nothing rolling yet — RSVP from Events" placeholder?
5. Should the composer card keep the frosted blur look, or match the phone's flat cream card everywhere (the phone has no blur)?

## Copy suggestions
- Strip chips: `● Hack Night · Tmrw`, `#welcomeweek 12`. Empty state (if kept): "Nothing rolling yet — RSVP to an event or start a #tag."
- Browse mode (E) banner line: "Viewing Bloomington · Your home campus is Indianapolis". Disabled RSVP tooltip: "RSVP works on your home campus."

## Summary (final)
1. Desktop /campus = `CampusHome` (campus-home.tsx 360-925) inside `CampusAppShell` (200px LeftNav + 1fr; no right rail). Tabs are local state seeded from `?tab=`; `?campus=` is never read on the client.
2. The Feed tab is one frosted column (`feedGlass` 5614-5627) with hairline-separated rows (`hairline` 5629, `borderBottom` 6592); no max width, all inline styles.
3. The phone card (CampusMobile `FeedCard` 1296-1308) is a separate cream card per post with `gap: 10`; B = per-post surface + column cap + composer card (change points 1-5, all S).
4. "Heads up / Trending" = `OttoFeedStrip` (13288-13545), a two-section dark bubble to the right of the heading (row 5655-5674), fetching `/api/trending/hashtags?limit=8` and `/api/me/upcoming-events?limit=3`; ~120-150px tall, never hides, event rows not clickable.
5. D = rewrite `OttoFeedStrip` in place as a 40px chip row (events first, then tags), null when empty, mounted as its own row above the composer; delete the two-section layout, `StripHeader`, both icons (~280 lines). Shared with the phone via one import.
6. Tap → event needs new plumbing (`onPickEvent` or `?event=` deep link + `id="event-<id>"` on `EventCard`); there is no `/events/[id]` page.
7. E hooks: `/api/feed`, `/api/events`, `/api/orgs`, map and stats routes already accept `?campus=`; trending does not; the RSVP route has no campus check; the desktop never passes the param. 30-day lock lives at `onboarding-prefill.ts:395` (`CAMPUS_CHANGE_COOLDOWN_MS`) + copy in `settings-campus-card.ts`.
8. Biggest risks: shared strip component with the phone, `backdrop-filter` containing-block trap on per-post cards, kebab dropdown clipping, and ~220 hardcoded color literals across campus-home + LeftNav for dark mode.
