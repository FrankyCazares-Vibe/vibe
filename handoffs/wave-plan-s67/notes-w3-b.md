# W3b notes (wave 3 step 3.2, batch b): campus-home.tsx literal pass

Owns: `src/app/campus/campus-home.tsx` only. No commit, no push, no dev server, no DB.

## What I'm doing
C0 replacement map on the LIGHT surfaces of the desktop campus page (Feed, Events, Orgs/Discover, Map light parts, banner/search/tab pills on cream, composer, FeedRow, comments drawer, the white/cream modals, EmptyState, SceneHeader text). Rule: Light must resolve to the exact same value; if no token matches exactly, leave the literal and list it.

Skip: Chat tab chrome (CHAT_CHROME_BACKDROP and inside), BACKDROP_PRESETS, DarkGlassCard / EventCard dark glass, map night sky, avatar palettes, text on coral/green/red fills, image/video overlays.

## Tokens available (globals.css 57-122)
--cream --charcoal --ink-2 --ink-muted --paper --hairline --scrim-rgb --glass --glass-border --coral --tag-ink --tag-bg --card-shadow --feed-backdrop --danger-ink --error-ink --ok-ink --eyebrow-ink, plus --paper-55 (rgba(255,255,255,0.55)) and --paper-70 (rgba(255,255,255,0.70)) and --tabbar-bg. No color-mix anywhere (iOS 15 computes it transparent; see notes-w3a-core.md:47-48).

## Decisions so far
- rgba(255,255,255,0.55) surfaces → var(--paper-55); rgba(255,255,255,0.7/0.70) SURFACES → var(--paper-70); rgba(255,255,255,0.7) BORDERS → var(--glass-border). Exact light values, so Light is unchanged.
- Never var(--muted) / var(--accent) / var(--border).

## Log

### COLORS object (one edit fixes the search dropdown, feed rows, comments, SceneHeader text)
- L223: `"#FAF7F2"` → `"var(--cream)"`
- L224: `"rgba(28,28,30,0.08)"` → `"var(--hairline)"`
- L225: `"rgba(28,28,30,0.12)"` → `"rgba(var(--scrim-rgb),0.12)"`
- L226: `"#1C1C1E"` → `"var(--charcoal)"`
- L227: `"#5C5853"` → `"var(--ink-2)"`
- L228: `"#8A8580"` → `"var(--ink-muted)"`

### Feed: ?post= flash, composer, FeedRow, repost menu/pill, row menu
- L5722: `"rgba(255,92,53,0.10)"` → `"var(--tag-bg)"`
- L6138: `rgba(28,28,30,0.06)` → `rgba(var(--scrim-rgb),0.06)`
- L6160: `"1px solid rgba(28,28,30,0.08)"` → `"1px solid var(--hairline)"`
- L6251: `"rgba(28,28,30,0.18)"` → `"rgba(var(--scrim-rgb),0.18)"`
- L6748: `"rgba(28,28,30,0.06)"` → `"rgba(var(--scrim-rgb),0.06)"`
- L6764: `"white"` → `"var(--paper)"`
- L6765: `"1px solid rgba(28,28,30,0.08)"` → `"1px solid var(--hairline)"`
- L6783: `"#FAF7F2"` → `"var(--cream)"`
- L6805: `"#FAF7F2"` → `"var(--cream)"`
- L6825: `"#FAF7F2"` → `"var(--cream)"`
- L6848: `"#FAF7F2"` → `"var(--cream)"`
- L6867: `"#FAF7F2"` → `"var(--cream)"`
- L7060: `rgba(28,28,30,0.12)` → `rgba(var(--scrim-rgb),0.12)`
- L7061: `"#fff"` → `"var(--paper)"`
- L7088: `"#C0392B"` → `"var(--error-ink)"`
- L7098: `rgba(28,28,30,0.12)` → `rgba(var(--scrim-rgb),0.12)`
- L7168: `rgba(28,28,30,0.06)` → `rgba(var(--scrim-rgb),0.06)`
- L7185: `rgba(28,28,30,0.06)` → `rgba(var(--scrim-rgb),0.06)`
- L7251: `"#1C1C1E"` → `"var(--charcoal)"`
- L7499: `"#C0392B" : "#1C1C1E"` → `"var(--error-ink)" : "var(--charcoal)"`
- L7555: `"2px solid #FAF7F2"` → `"2px solid var(--cream)"`
- L7650: `"#FFFFFF"` → `"var(--paper)"`
- L7651: `"1px solid rgba(28,28,30,0.08)"` → `"1px solid var(--hairline)"`
- L7678: `rgba(28,28,30,0.12)` → `rgba(var(--scrim-rgb),0.12)`
- L7697: `rgba(28,28,30,0.12)` → `rgba(var(--scrim-rgb),0.12)`

### Comments drawer + CommentRow (the input glass .7 → --paper-70; avatar #1C1C1E fallback under #fff initials left)
- L7853: `rgba(28,28,30,0.06)` → `rgba(var(--scrim-rgb),0.06)`
- L7901: `rgba(28,28,30,0.12)` → `rgba(var(--scrim-rgb),0.12)`
- L7908: `"rgba(255,255,255,0.7)"` → `"var(--paper-70)"`
- L7919: `"rgba(28,28,30,0.18)"` → `"rgba(var(--scrim-rgb),0.18)"`
- L8060: `rgba(28,28,30,0.06)` → `rgba(var(--scrim-rgb),0.06)`
- L8237: `"white"` → `"var(--paper)"`
- L8238: `"1px solid rgba(28,28,30,0.08)"` → `"1px solid var(--hairline)"`
- L8300: `rgba(28,28,30,0.12)` → `rgba(var(--scrim-rgb),0.12)`
- L8307: `"rgba(255,255,255,0.7)"` → `"var(--paper-70)"`
- L8318: `"rgba(28,28,30,0.18)"` → `"rgba(var(--scrim-rgb),0.18)"`

### SceneHeader (tone "dark" = dark TEXT on the cream scene: only that branch tokenized; the light-text branch for dark scenes left)
- L8535: `dark ? "#C84A20"` → `dark ? "var(--eyebrow-ink)"`

### Events tab: EventCard / AttendeesModal / CreateEventModal are dark glass, left; only the org <option> ink
- L9701: `"#1C1C1E"` → `"var(--charcoal)"`

### Orgs tab: text that sits straight on the cream backdrop (DiscoverGroup header/hint/loading, footers, 'See all' link). Cards, search, chips, OrgQuickViewModal, CreateOrgBanner are dark glass / coral fill: left
- L10383: `"rgba(28,28,30,0.55)"` → `"rgba(var(--scrim-rgb),0.55)"`
- L10473: `"#C84A20"` → `"var(--eyebrow-ink)"`
- L11045: `"#1C1C1E"` → `"var(--charcoal)"`
- L11057: `"rgba(28,28,30,0.55)"` → `"rgba(var(--scrim-rgb),0.55)"`
- L11061: `"rgba(28,28,30,0.55)"` → `"rgba(var(--scrim-rgb),0.55)"`
- L11072: `"rgba(28,28,30,0.55)"` → `"rgba(var(--scrim-rgb),0.55)"`
- L11096: `"rgba(28,28,30,0.55)"` → `"rgba(var(--scrim-rgb),0.55)"`

### Map tab, Chat tab, org modals: nothing to do
- Map: the whole map is the night-sky panel (#07091A) with white text; the only light part is SceneHeader (via COLORS). Left.
- 982-4040 (CreateOrg, CreateChannel, OrgSettings + every Settings* panel, ChannelSettings, ModalShell, modal*Style, inputStyle, LinksEditor, Field, ChoiceField): ALL dark purple glass (`modalFormStyle` rgba(40,20,50,0.92)) with #fff text. Zero light-surface literals. Left.
- Chat (ServerRail/ChannelRail/ChannelMain/ChannelChat/EmptyState/RoleLegend/PermissionsCard): left. `isCream` in ChannelMain/ChannelChat (14028-14162) is the org's literal "cream" BACKDROP PRESET, which stays cream in Night, so its #1C1C1E / rgba(28,28,30,x) ink stays literal on purpose.
- CampusBanner / bannerPalette / CampusTabs / non-row search pill / "← Back to main feed": already-dark chrome. Left.
- EventCard, AttendeesModal, AttendeeList, RsvpButton, CreateEventModal, DiscoverCard, DiscoverSearchBar, DiscoverFilterChips, OrgQuickViewModal: dark glass. Left. CreateOrgBanner: coral fill. Left.

## Decisions
- Shadows and modal backdrop overlays in rgba(28,28,30,x) / rgba(0,0,0,x) are LEFT literal: scrim-rgb flips to white in Night, which would turn a drop shadow into a white glow (7435, 7653).
- Charcoal FILLS under white text are left (7119 edit-post Save button, avatar fallbacks 5137 / 6912 / 7978).
- SceneHeader: only the tone "dark" (= dark text on the cream scene) branch changed.

## Left, no exact token (a later pass can add one)
- 4323 PickCampusStrip: surface #FFF1E8 + ink #1C1C1E (4328) + link #C84A20 (4334) kept together so the strip stays a readable peach island in Night.
- 5126 / 5223 search-dropdown row hover #F2EFE9: the dropdown now follows the theme (COLORS.bg), so in Night a hovered row paints light behind light text. Needs a hover token (light #F2EFE9).
- 5163 / 5258 search-row action pill #FFF5F2 (coral text): pale pill on the dark dropdown in Night, readable.
- 6199 composer error #C42B1C (not #C0392B): ~3.3:1 on Night glass.
- 7537 FriendRepostPill ink #1F6B3A on a green tint: ~2.9:1 on Night.
- 6163 composer video chip tint rgba(123,95,224,0.08): fine both.

## Shared components on surfaces that now flip (not mine)
- LoadFailed.tsx light branch (#5C5853 text, rgba(28,28,30,0.14) dashed border) renders on the feed error card (5830), the search dropdown (4985) and the comments drawer (7861): dark-on-dark in Night until tokenized. Caveat: ChannelChat passes tone "light" for the literal cream org preset (14535), which stays cream in Night.
- PostAudienceList.tsx light branch (`ink` #1C1C1E / `faint` #8A8580, lines 229-230) inside PostViewersModal (COLORS.bg surface now flips).
- UserCard.tsx (W3e) inside PostViewersModal.

## Pre-existing (Light) oddities seen, not touched
- "Loading events…" (8766) and "Loading orgs…" (10252) paint COLORS.glassMuted (white 62%) straight on the cream backdrop: faint in Light today, fine in Night.

## Done
- 50 single-line replacements in campus-home.tsx (log above). `npx tsc --noEmit`: exit 0, no output. Not browser-walked (no dev server in this batch).

## Repair round 1 (review-w3b.md F1 BLOCKER, F2 SHOULD)

Owns still only `src/app/campus/campus-home.tsx`. Both suggested fixes reach outside it
(F1 edits PostAudienceList.tsx, F2 adds a token to globals.css), so each is done from the
campus-home side instead, Light-exact, and the out-of-file follow-up is listed.

### F1 BLOCKER, PostViewersModal ("Who saw this", ~7432/7479)
- Wrong file for the suggested fix: PostAudienceList.tsx is not mine. Done here instead: a
  `useNightTheme()` hook (same shape as MessagesMobile's: useSyncExternalStore on THEME_EVENT
  + currentTheme(), server snapshot false) and `tone={night ? "dark" : "light"}` on
  <PostAudienceList>. Light: tone "light", byte-identical. Night: the list's existing "dark"
  tone (ink #FAF7F2, faint rgba(250,247,242,0.62), dark LoadFailed, dark Show-more pill), the
  one it already wears on Otto's glass, readable on the #0C0B0B modal.
- Robust either way: if someone later tokenises the list's light branch (var(--charcoal) /
  var(--ink-muted)), Night still gets the dark tone; nothing here pins a literal that a token
  would then fight.
- Not chosen: pinning the modal back to a literal cream island. It would read today, but the
  moment the list's light branch is tokenised its ink goes #F6F1EA on #FAF7F2 (invisible).
- Phone PostAudienceSheet: untouched (not mine), still passes the default light tone on its
  literal cream sheet, so it keeps #1C1C1E on cream. Fine as is.
- Code: import `{ currentTheme, THEME_EVENT }` from "@/lib/theme/theme" (line 85);
  `subscribeTheme` + `useNightTheme` just above PostViewersModal (~7377-7388); `const night`
  (~7405); `tone={night ? "dark" : "light"}` on the list (~7513). Modal surface, title, close
  and border keep their COLORS tokens.
- Left, not mine: UserCard compact rows inside the modal are translucent cream glass
  (rgba(255,253,248,0.78)→0.66) over the #0C0B0B surface ≈ a #C9→#A9 grey card in Night;
  their #1C1C1E name reads (~7:1), their #8A8580 meta is weak (~1.5:1). Same "translucent
  light island" issue the review calls systemic; UserCard.tsx owner's call.

### F2 SHOULD, search dropdown row hover (PersonRow 5136, ItemRow 5233)
- The suggested --row-hover token lives in globals.css, not mine. Done here instead:
  `searchRowHoverBg()` (~5111) returns `currentTheme() === "dark" ? "#1F1D1C" : "#F2EFE9"`,
  read at hover time inside both onMouseEnter handlers (onMouseLeave still "transparent").
  Light byte-identical; Night #1F1D1C behind var(--charcoal) #F6F1EA (~15:1).
- Checked: no existing token equals #F2EFE9, and rgba(var(--scrim-rgb),a) over #FAF7F2 can't hit
  it on all three channels (a≈.036/.037/.042), so a scrim tint would shift Light.
- Follow-up for whoever owns globals.css: add `--row-hover` (Light #F2EFE9, Night #1F1D1C) and
  swap the helper body for "var(--row-hover)".

### Gate
- `npx tsc --noEmit`: no output (clean).
