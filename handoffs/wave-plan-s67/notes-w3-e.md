# W3e notes: messages + network literal pass (wave 3, step 3.2, batch e)

Owns: src/components/mobile/MessagesMobile.tsx, src/components/mobile/NetworkMobile.tsx,
src/components/network/* (NetworkPageClient, OttoCorner, OttoSidePanel, UserCard),
src/app/network/* (NetworkSwitch, page).

## Rules I'm following
- C0 map only; every swap must resolve to the SAME value in Light. No --muted/--accent/--border.
- Extra exact-Light tokens available in globals.css: --paper-55 = rgba(255,255,255,0.55),
  --paper-70 = rgba(255,255,255,0.70), --tabbar-bg = rgba(250,247,242,0.96).
- Leave: white text on coral/green/red fills, Otto dark glass, org-backdrop dark branch
  (MessagesMobile darkMode === true), avatar palettes, image/video overlays.
- MessagesMobile darkMode = "org backdrop is dark": only the light branch gets tokens.

## Progress log
- (start) read contracts C0, plan C, waves row, theming report. Tokens verified in globals.css:57-121.

## Decisions (after surveying network files)
- src/app/network/{NetworkSwitch,page}.tsx: no colour literals; nothing to do.
- PAGE_BG family backdrop (radial peach washes + linear #FAF7F2→#F4EDE2) in NetworkPageClient <main>
  (byte-identical to HEAD's SettingsClient PAGE_BG) and NetworkMobile root (same wash, 0.40/0.32 alphas)
  → var(--feed-backdrop): SANCTIONED by the task map ("FEED_BACKDROP / PAGE_BG cream gradients"), a
  planned Light change (same as Settings in 3.1). Flag it in the return.
- Glass GRADIENT surfaces `linear-gradient(180deg, rgba(255,253,248,0.78) 0%, rgba(255,250,240,0.66|0.68) 100%)`
  (UserCard, NetworkPageClient tabs/search/filters/empty/cards): second stop has no exact token → LEAVE
  (listed). Everything painted ON such a surface (ink, ghost fills, danger ink) also stays literal, so the
  card is a readable Light island in Night instead of light-on-light. Borders that are exact tokens are
  harmless either way; I leave them on islands too for coherence.
- Drop shadows `0 Npx Mpx rgba(28,28,30,x)` stay literal (a white glow in Night is wrong; dark shadow on dark
  is harmless). Only the exact warm pair → var(--card-shadow).
- Flat rgba(255,253,248,0.78) + 0.7 border + exact warm shadow (NetworkMobile CARD) → --glass/--glass-border/--card-shadow.
- NetworkPageClient DONE: <main> bg → var(--feed-backdrop) (sanctioned PAGE_BG), borderRight → var(--hairline),
  eyebrow #C84A20 → var(--eyebrow-ink), h1 → var(--charcoal), subline → var(--ink-2), active filter chip ink
  (on a coral tint straight on the backdrop) → var(--eyebrow-ink). Tabs/search/filters/load-more/skeleton/empty
  = glass-gradient islands, left.
- UserCard: NO change (whole card is a 0.78→0.66 glass-gradient island; also used by campus-home + Otto
  ProfileViewersList). Listed.
- OttoCorner DONE: badge ring #FAF7F2 → var(--cream) (page cut-out). Orb #1C1C1E + toast = dark chrome, left.
- OttoSidePanel: all dark (#141416 panel, white inks) → no change.
- NetworkMobile DONE: <main> bg → var(--feed-backdrop) (sanctioned PAGE_BG variant 0.40/0.32 alphas);
  group label/blurb → --charcoal/--ink-muted; row dismiss × → rgba(var(--scrim-rgb),0.08)/--ink-2;
  SuggestionReason ink, UserNameLink → --charcoal; skeleton bars → scrim; rowItemStyle → --glass /
  --glass-border / --card-shadow (exact); metaLineStyle → --ink-muted.
  LEFT (islands, listed): sticky header rgba(250,247,242,0.86) + its h1/search (rgba(255,255,255,0.78))/
  clear ×/tabs; Following pill rgba(255,255,255,0.78)+#1C1C1E; Follow pill #1C1C1E fill + #fff; skeleton row
  bg rgba(255,253,248,0.45); EmptyState rgba(255,253,248,0.6) + its inks; SuggestionReason accent palette
  (concatenated `${accent}22`, so #8A8580 there can't be a var); avatar peach + ring.
- MessagesMobile (in progress): vaulContentStyle #FAF7F2 → var(--cream); vaulHandleStyle → scrim 0.18;
  list <main> bg → var(--feed-backdrop) (sanctioned PAGE_BG variant: one radial 0.30 + linear);
  ThreadRow hairline/title/time/preview → scrim 0.04/--charcoal/--ink-muted; ListSkeleton → scrim;
  EmptyState inks → --ink-2/--charcoal. LEFT: list header island (rgba(250,247,242,0.86)) + h1 +
  New-message button (rgba(255,255,255,0.78)) + TabPill (header-only); "Find people" #1C1C1E fill + #fff.
- DECISION (ConversationView): added `useNightTheme()` (useSyncExternalStore over THEME_EVENT +
  currentTheme(); server snapshot false) and `onDark = !!backdropCss || night`. Every `backdropCss ? dark : light`
  chrome conditional (header, back/title/handle/⋯ button, loading/empty copy, LoadFailed tone, reply pill,
  composer bar, textarea) and MessageBubble `darkMode` now read `onDark`. Light: night=false → identical.
  Night: a DM/group thread wears the existing org dark-glass palette on var(--cream) paper (waves row:
  "bubbles read theme || orgBackdropDark"). Surface `backdropCss ?? "#FAF7F2"` → `?? "var(--cream)"`.
  Non-conditional literals in the view tokenised (request bar hairline/ink-2/decline scrim+charcoal, staged
  thumb scrim + Photo/size inks + remove ×, disabled send scrim 0.18). Attach button (rgba(255,255,255,0.78))
  left: a white pill in both dark palettes, as it already is on org channels.
- Sheets: action-sheet feedback pill, SheetRow (danger #C0392B → var(--error-ink), ink, hairline), Mute title → tokens.
- GroupSettingsView: overlay #FAF7F2 → var(--cream); section border, name, count, feedback, Members label → tokens;
  MemberRow inks/hairline/Muted chip → tokens; MemberActionSheet title → charcoal.
  LEFT (islands): Group info sticky header rgba(250,247,242,0.94) + back arrow + title; name input
  rgba(255,255,255,0.92); member ⋯ button rgba(255,255,255,0.78); pencil SVG stroke="#8A8580" (attribute; mid grey
  reads on both papers); avatars.
- ComposeOverlay: overlay #FAF7F2 → var(--cream); empty copy, Suggested label, ComposeUserRow name/meta → tokens.
  LEFT (islands): header rgba(250,247,242,0.94) + Cancel + title; search strip rgba(250,247,242,0.94) + icon +
  input rgba(255,255,255,0.78).

## Done (all owned files)
- tsc --noEmit: exit 0.
- Files touched: MessagesMobile.tsx, NetworkMobile.tsx, network/NetworkPageClient.tsx, network/OttoCorner.tsx.
  No change: network/UserCard.tsx (island), network/OttoSidePanel.tsx (dark chrome), app/network/* (no literals).

## Follow-ups for a later token pass (to finish Night on the islands)
- --cream-86 / --cream-94 (Light rgba(250,247,242,0.86|0.94)): list headers (Messages, People), Group info +
  New message headers and search strip.
- --paper-78 / --paper-92 (Light rgba(255,255,255,0.78|0.92)): search inputs, ✎ / ⋯ / attach round buttons,
  Following pill, group-name input.
- --glass-lo (Light rgba(255,250,240,0.66|0.68)) for the `--glass → glass-lo` gradients: UserCard, desktop
  network tabs/search/filters/load-more; plus the skeleton/empty gradients (0.55→0.4, 0.6→0.5, rgba(255,243,228,0.66)).
- LoadFailed.tsx light tone (#5C5853 + rgba(28,28,30,0.14)) is unowned in 3.2; on Night paper it reads ~2.9:1.
- Copy (not a colour issue, left): "Post a clip" (NetworkPageClient + NetworkMobile empty states), "Shared a clip"
  (thread preview) vs the "video posts" rule.

## Repair round 1 (review-w3b.md F7 BLOCKER + F8 SHOULD)
- Constraint: src/app/globals.css is NOT in my Owns list, so I cannot add --glass-lo / --cream-86 / -94 /
  --paper-78 / -92 there. Current globals has only --tabbar-bg, --paper-55, --paper-70 as translucent steps.
- F7 plan: option (a) from the review. Revert NetworkPageClient <main> background to its HEAD literal AND
  revert every token that paints straight onto that backdrop (h1, subline, eyebrow, active chip ink, the
  borderRight hairline) so the desktop /network page is a coherent Light island in Night, as before 3.2.
  UserCard untouched (so campus-home PostViewersModal + Otto ProfileViewersList are unchanged by me).
- F8 plan: decide after checking how MessagesMobile/NetworkMobile mount (client-only vs SSR) and whether a
  theme-aware value can be expressed inside my files without drifting from the one :root token block.
- F8 decision: MessagesMobile + NetworkMobile mount only after hydration (MessagesSwitch/NetworkSwitch gate on
  useIsMobile, server snapshot false), so a useSyncExternalStore theme read is correct on their first paint
  (no flash). Since the -86/-94/-78/-92 steps can't be added to globals.css from here, each bar's surface is
  `night ? <nearest existing Night token> : <today's literal>` (Light byte-identical; Night on tokens that track
  the palette): cream .86/.94 bars → var(--tabbar-bg) (Night rgba(12,11,11,0.96)); paper .78 buttons/inputs →
  var(--paper-70); paper .92 name input → var(--paper). Inks/borders on those bars go to exact tokens
  (--charcoal, --ink-muted, --ink-2, rgba(var(--scrim-rgb),x)). TabPill: exact tokens only (same as W3c's
  TabStrip: --paper-70 / --charcoal / --paper / --ink-2), active badge ink → var(--paper).
  When globals gains --cream-86/-94 and --paper-78/-92, each ternary collapses to var(--x).
- Also (in-file, Light-exact): LoadFailed callers on flipped surfaces pass tone={night ? "dark" : "light"}
  (list, compose search, NetworkMobile), same as ConversationView's onDark call. LoadFailed.tsx untouched.
- Not mine: PostViewerMobile top bar/kebab/composer (W3d's file); globals.css tokens.
- R1 progress: NetworkPageClient reverted (main bg HEAD literal + color #1C1C1E pin, borderRight literal, eyebrow/
  h1/subline/active chip back to literals; comment explains). MessagesMobile: list header (tabbar-bg ternary,
  scrim border, h1 charcoal, New-message button paper-70 ternary + inset shadow ternary), TabPill (exact tokens,
  active badge ink var(--paper)), list LoadFailed tone, "Find people" charcoal/paper, GroupSettingsView header +
  back + title + name input (paper ternary), MemberRow ⋯ (paper-70 ternary). Next: ComposeOverlay, NetworkMobile.
- R1 progress: ComposeOverlay (header + search strip tabbar-bg ternaries, Cancel/title charcoal, icon ink-muted,
  input paper-70 ternary + charcoal ink, LoadFailed tone). NetworkMobile: local useNightTheme (copy of
  MessagesMobile's; comment explains), header tabbar-bg ternary + scrim border + h1 charcoal, SearchInput
  (icon ink-muted, input paper-70 ternary + inset ternary + charcoal, clear × scrim/ink-2), TabStrip exact
  tokens (as W3c), ListPane/SearchPane LoadFailed tone. Left: Follow/Following pills on rows (reviewer: OK;
  the shared `#fff` ink covers the coral Follow-back too, so a split would be a restructure), EmptyState .6 and
  skeleton .45 islands (reviewer NICE, need --glass-lo-ish tokens).
- R1 DONE. tsc --noEmit clean. Light check (git diff -U0 read by hand): every repair swap resolves to the same
  Light value; each `night ? … : <literal>` keeps today's literal in Light; NetworkPageClient's only non-comment
  change vs HEAD is `color: "#1C1C1E"` on <main>, which is exactly what it inherits from <body> in Light.
- F7 status: fixed by option (a). The desktop /network page is again a cream island in Night (as before 3.2),
  now with its ink pinned so inputs / unpinned text don't inherit Night's light body ink.
- UserCard "check both": unchanged by me. Otto ProfileViewersList: unchanged (light cards on Otto's dark glass,
  as before). campus-home PostViewersModal: its surface is COLORS.bg = var(--cream) since W3b, so in Night the
  UserCard rows there are the same grey slabs (handle/mutuals #8A8580 on ~#ACA9A4 ≈ 1.6:1). Not fixable from my
  files without --glass-lo in globals.css; the Light-exact stopgap is in campus-home (keep that modal's surface
  literal #FAF7F2 + PostAudienceList light tone until --glass-lo lands). Reported as an open question.
- F8 status: fixed in my files with Night ternaries on existing tokens (see decision above). PostViewerMobile
  top bar / kebab / comment composer are W3d's file: not touched.
