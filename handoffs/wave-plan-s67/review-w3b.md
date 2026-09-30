# Review: wave 3 step 3.2 (W3b campus desktop, W3c phone + shell, W3d profile phone + sheets, W3e messages + network)

Reviewer: adversarial, read-only. Date 2026-09-27.

## Verdict

REPAIR (4 BLOCKERs, all Night readability; Light unchanged except the sanctioned backdrops). Full
verdict at the end of this file. Gates folded in: tsc clean; 933/934 tests pass (the one failure is the known
pre-existing `src/lib/otto/parse-reminder.test.ts`); no `var(--muted|accent|border)` in the src diff.

## Method
1. Read contracts C0, plan C, waves Wave 3, theming.md, notes-w3-{b,c,d,e}.
2. Token Light/Night values read from src/app/globals.css:57-128.
3. Script walks every -/+ pair in `git diff -U0 -- src` for the step 3.2 files, resolves each var(--x)
   on the + side to its LIGHT value, normalises (hex case, #fff/white/#FFFFFF, rgba spacing) and flags
   any pair whose resolved + line differs from the - line.
4. Night read: surfaces that stayed literal-light with text that now resolves to a light token, and
   dark literals left as text on surfaces that now flip dark. Inheritance traps: Night body ink is
   var(--charcoal) = #F6F1EA and Tailwind preflight gives inputs/buttons `color: inherit`, so a light
   island that does not pin its own ink inherits light text.

## Findings so far
(appended below)

### Light check (script, scratchpad/rev/lightcheck.py)
- 488 one-for-one -/+ literal pairs across the 16 step-3.2 files: ALL resolve to the identical Light value
  (hex case, #fff/white, rgba spacing and 0.7/0.70 normalised). No token-in-concatenation (`${x}22`) or
  var() in SVG presentation attributes on the + side; COLORS.* only used as whole values or inside
  `1px solid ${...}`.
- Only non-pair changes: (a) four page backdrops moved from the old peach wash to var(--feed-backdrop)
  (CampusMobile <main> 666, MessagesMobile list <main> 537, NetworkMobile <main> 329, NetworkPageClient
  <main> 363): a VISIBLE Light change (peach radial wash + #FAF7F2→#F4EDE2 linear → coral corner bloom
  on flat #FAF7F2). W3c/W3e both cite a task-map line sanctioning it; desktop FEED_BACKDROP was already
  var(--feed-backdrop) at HEAD, so this matches the desktop. (b) MessagesMobile `onDark = !!backdropCss ||
  night` (Light: night=false, identical). (c) PostPageClient wrapper div (cream/charcoal, 100dvh).
  (d) BookmarkIcon fill → currentColor. (e) ProfileMobile FollowButton ternary + two #1C1C1E pins.

### campus-home.tsx (W3b)
- F1 SHOULD-high 7479: "Who saw this" (PostViewersModal) surface is now COLORS.bg = var(--cream)
  (#0C0B0B in Night) but PostAudienceList's light tone paints its headline "N people saw this" and the
  "Loading…/No one yet./Vibe+ shows you who." notes in literal #1C1C1E / #8A8580
  (PostAudienceList.tsx:229-230). Headline invisible in Night; before 3.2 the modal was a readable cream
  island. Fix: PostAudienceList light branch → ink var(--charcoal), faint var(--ink-muted) (Light-identical;
  its phone caller PostAudienceSheet stays cream literal, so check that sheet too, or pin there).
- F2 SHOULD 5126/5223: search dropdown PersonRow/ItemRow hover paints #F2EFE9 behind var(--charcoal)
  (#F6F1EA) name text in Night: row text vanishes while hovered. Fix: a --row-hover token
  (Light #F2EFE9, Night e.g. #1F1D1C) or `rgba(var(--scrim-rgb),0.05)` only if Franky accepts the tiny
  Light shift.
- F3 SHOULD (unowned) LoadFailed.tsx:77-78 light tone (#5C5853 text, rgba(28,28,30,0.14) rim) now sits on
  Night paper in the feed error card (5830), search dropdown (4985), comments drawer (7861): ~2.8:1.
  Fix: light branch → var(--ink-2) / rgba(var(--scrim-rgb),0.14). ChannelChat's cream preset (tone light)
  would then read light-on-cream: pass an explicit prop or keep a literal for that caller.

### Systemic: translucent "light islands" over pages that now flip to #0C0B0B
The batches kept surfaces with no exact token literal ("a readable light island in Night"). That holds
for near-opaque islands (α ≥ 0.85: text stays ≥ 5:1) but NOT for translucent ones: once the page under
them is var(--cream) = #0C0B0B, white@α composites to a mid grey (α .38 ≈ #686767, .55 ≈ #929191,
.65 ≈ #AAA9A8, .7 ≈ #B6B5B4). Measured on that grey: #8A8580 → 1.2–1.8:1 (invisible), #5C5853 →
2.3–3.0:1, #1C1C1E → 3.1–8:1. Before 3.2 these islands sat on literal cream, so this is new in 3.2.

### ProfileMobile.tsx (W3d)
- F4 BLOCKER 2828-2876 PostFeedCard (the phone profile Posts tab, default tab, every profile): surface
  `linear-gradient(rgba(255,255,255,0.55) → rgba(255,253,248,0.38))` over the Night page = grey slab
  #929191→#686767; post text #1C1C1E is 5.4→3.1:1 and the timestamp #8A8580 (2876) is ~1.2–1.5:1,
  invisible. PostFeedSkeleton (5427) the same slab. Fix: two tokens for this card (e.g. --card-hi Light
  rgba(255,255,255,0.55) / Night rgba(22,21,21,0.86); --card-lo Light rgba(255,253,248,0.38) / Night
  rgba(22,21,21,0.72)), then text → var(--charcoal), meta → var(--ink-muted), border rgba(124,92,252,x) ok.
- F5 SHOULD 5471/5487 EmptyTab ("no posts yet" on a fresh profile; α .65): body #8A8580 ≈ 1.6:1.
  Same for SubPaneEmpty 3357 (#5C5853 on .55 ≈ 2.3:1), SubsectionEmpty 4007/4011 (#8A8580 on .7 ≈ 1.8:1),
  Experience/Working-on editor empties 4158-4160 and 4458-4460 (#8A8580 on .7), "+ Add role/item"
  4194/4555 (#1C1C1E on white .4 ≈ 3.3:1), RepostRow meta 3156/3173 (#8A8580 on .78 ≈ 2.2:1).
  Fix: an --island-55/65/70 set of tokens or move these empties to var(--paper-70)/var(--paper-55)
  (exact Light values exist for the white@.55/.70 ones) with token inks; the rgba(255,253,248,x) ones
  need new tokens.
- F6 SHOULD 3301-3316 SavedGrid text-only tile: rgba(28,28,30,0.06) tint on #0C0B0B with #3C3A36 text
  ≈ 1.6:1, unreadable (owner-only Saved tab; W3d listed it as broken). Fix: tint → rgba(var(--scrim-rgb),0.06),
  ink → a token (nearest is var(--ink-2); needs a --ink-body token #3C3A36/#E4DDD3 to keep Light exact).
- OK: header, stats, tabs, sub-tab ON chip (charcoal/paper), bio Section (#fff island + #1C1C1E pinned title,
  textarea #1C1C1E), ExperienceCard .92 + SheetInput/SheetTextarea #fff + #1C1C1E, editor header .92,
  Arrange sheet rows (var(--paper) on var(--cream)), FollowButton, safety/report/mute sheets.

### Network (W3e)
- F7 BLOCKER NetworkPageClient.tsx:363 (+ UserCard.tsx:215-374, unchanged): the desktop /network <main>
  now paints var(--feed-backdrop) (#0C0B0B in Night) but every person card is UserCard's literal
  `linear-gradient(rgba(255,253,248,0.78) → rgba(255,250,240,0.66))` island, which composites to a grey
  slab (#CAC9C7→#AAA8A5). Name #1C1C1E reads, but handle/mutuals #8A8580 (295, 331, 374) ≈ 1.6–2.2:1 and
  the headline #5C5853 (308) ≈ 3–4:1. Same for the tabs (509-531: inactive count #8A8580), the inactive
  filter chips (607-610) and the empty/load-more islands (747-841). Before 3.2 the page stayed cream in
  Night, so this is a 3.2 regression on a main flow. Fix (pick one): (a) revert just the <main>
  background to its HEAD literal until UserCard + the islands get tokens (restores Light exactly too);
  or (b) add --glass-lo (Light rgba(255,250,240,0.66)) and tokenise UserCard's surface + inks (UserCard
  is shared with campus-home's PostViewersModal and Otto's ProfileViewersList: check both).
- NetworkMobile OK: rows are exact --glass/--glass-border/--card-shadow with token inks. Islands left:
  header rgba(250,247,242,0.86) + h1/search/tabs (readable, a cream bar in Night), EmptyState 1148-1171
  (.6, #5C5853 body ≈ 2.6:1: NICE), skeleton rows .45 (grey slabs, NICE).

### Messages (W3e)
- MessagesMobile threads: `onDark = !!backdropCss || night` is sound. Light: night=false so every
  ternary is the old one. Night: DM/group threads wear the org dark-glass palette on #0C0B0B; bubbles
  (darkMode), composer, reply pill, LoadFailed tone, header all key off onDark; the leftover literals in
  2150-4400 are either light branches of darkMode/onDark ternaries, avatar palettes, or the white attach
  pill (white-on-dark, readable). useSyncExternalStore server snapshot false → no hydration mismatch.
- F8 SHOULD list/compose/group chrome: the Messages list header (544, rgba(250,247,242,0.86)), New
  message header + search strip (3575/3618, .94), Group info header (2936, .94), name input (.92) and
  ⋯/✎ buttons (.78) stay cream in Night with their Light inks: readable, but the walk's "phone messages
  dark" will show a cream bar on a black page. Same for NetworkMobile's header (337), PostViewerMobile's
  top bar (551, .92), kebab menu (701, .98) and comment composer (1073, .94). Fix: --cream-86/-92/-94 and
  --paper-78/-92 translucent steps (as W3e's follow-up list says), then tokenise those inks.

### Campus phone (W3c) + unowned components it hosts
- F9 BLOCKER OrgJoinControl.tsx:460-473 (unowned; caller CampusMobile.tsx:2971 OrgRow). The phone Orgs
  row card is now var(--glass) (Night rgba(22,21,21,0.86)), but OrgJoinControl's `phone_row` CREAM
  palette paints `outline` actions ("Join", "Request to join", "Decline", "Verify to join") in literal
  #1C1C1E on transparent → invisible, and `quiet` ones ("Following", "Joined", "Requested", "Invite only")
  in #5C5853 on rgba(28,28,30,0.05) ≈ 2.8:1. The clubs list is the launch's main flow. Fix (Light-exact,
  phone_row is CampusMobile-only): outline color var(--charcoal), border rgba(var(--scrim-rgb),0.14);
  quiet color var(--ink-2), bg rgba(var(--scrim-rgb),0.05), border rgba(var(--scrim-rgb),0.10); sub
  var(--ink-muted).
- F10 SHOULD green inks with no token: #1F6B3A friend-repost pill (CampusMobile 1549; campus-home 7537)
  and the "Link copied" toast (CampusMobile 3355) on a green tint over Night glass/paper ≈ 2.6:1.
  Fix: an --ok-ink-2 token (Light #1F6B3A, Night #6FDB9A) or accept var(--ok-ink) with Franky's OK.
- F11 NICE CampusMobile EmptyTab 3161-3185 (.6 island: #5C5853 ≈ 2.6:1), PaneSkeleton 3146 and
  NetworkMobile skeleton 1106 (.45 grey slabs, token bars nearly invisible on them).
- OK: TabStrip, FeedCard (glass tokens, charcoal/paper inversions), FeedTagChip, PostActionsSheet,
  search overlay, MobileShell, CampusConfirmBanner, PushAsk (campus + dm; dm only in DM threads which
  are dark in Night), NotificationsCard, LeftNav + CalendarWidget/Modal (today pill charcoal/paper,
  addEventInput paper/charcoal). MapMobile, chat panes untouched (hunks skip 1864-2900).

### Sheets (W3d)
- F12 SHOULD ReportSheet.tsx:329-343 error box: #8E2317 text/link on rgba(196,43,28,0.07) over Night
  cream ≈ 2.2:1 (only when a report fails). Fix: a --error-ink-deep token (Light #8E2317, Night #FF9A8C).
- OK: SharePostSheet (inputs .92 + #1C1C1E, --tabbar-bg footer), PostViewerMobile drawer/body/comments
  tokens; BookmarkIcon currentColor = activeColor var(--charcoal) only when saved (Light-identical).

### Other
- F13 NICE #C42B1C left literal (LeftNav 1463 Delete, 1646 error box; campus-home 6199 composer error)
  ≈ 3.2:1 on Night paper. Token candidate --error-ink-2.
- F14 NICE W3g not done: every /legal/* and /support page renders through the unowned
  src/components/legal/LegalLayout.tsx (literal cream + pinned inks), so they stay Light in Night
  (readable). nav-identity-chip.tsx in LeftNav stays a white card (readable). List for wave 5.
- F15 NICE ProfileMobile bio Section (6753) is a stark #fff card on the Night page (readable, pinned);
  needs an --ink-body token (#3D3D3A / #3C3A36) to finish.
- Checks passed: tone traps not flipped (SceneHeader only the dark-TEXT branch; `scene.tone === "light"`
  keeps glassText; LoadFailed/MessagesMobile `onDark ? "dark" : "light"` = surface semantics);
  CHAT_CHROME/BACKDROP_PRESETS/isCream ink, Otto glass (OttoSidePanel untouched, OttoCorner ring only),
  map sky, avatar palettes untouched; no var(--muted|accent|border); copy unchanged (only comments);
  no shadow turned into scrim-rgb; no var(--charcoal) fill with literal white text; no var(--paper)
  text on a coral fill. Structural changes limited to the sanctioned ones (useNightTheme, PostPage
  wrapper, FollowButton ternary, two #1C1C1E pins).

## Verdict
REPAIR, then re-walk. Light: all 488 one-for-one swaps resolve to the identical Light colour; the only
Light change is the four backdrops moved to var(--feed-backdrop) (sanctioned by the batch map, confirm
in the walk). Gates green (tsc clean, 933/934 with the known parse-reminder failure, no shadcn names).
Night: four BLOCKERs, all "a page flipped dark while something on it kept Light ink": F9 phone Orgs
join buttons (OrgJoinControl), F4 phone profile post cards, F7 desktop Network cards, F1 "Who saw this"
headline. F1 and F9 are two-line Light-exact fixes in unowned files; F4/F7 need either new translucent
tokens or leaving that page's backdrop literal until the tokens land.
