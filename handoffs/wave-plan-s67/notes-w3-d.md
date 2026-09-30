# W3 step 3.2, batch d (profile phone + sheets + unowned pages): notes

Owner files: src/components/mobile/ProfileMobile.tsx, PostViewerMobile.tsx, SharePostSheet.tsx,
src/components/safety/ReportSheet.tsx, src/app/legal/**, src/app/support/page.tsx, src/app/posts/[id]/*.

## What I'm doing
Literal pass per contracts C0 REPLACEMENT MAP. Rule: Light must compute identical; Night reads on near-black.
Tokens available (globals.css :root / :root[data-theme="dark"]): --cream --charcoal --ink-2 --ink-muted --paper
--hairline --scrim-rgb --glass --glass-border --coral --tag-ink --tag-bg --card-shadow --feed-backdrop
--danger-ink --error-ink --ok-ink --eyebrow-ink --tabbar-bg --paper-55 (rgba(255,255,255,0.55)) --paper-70 (rgba(255,255,255,0.70)).

## Decisions so far
- rgba(255,255,255,0.55) / 0.70 surfaces → var(--paper-55) / var(--paper-70) (exact Light values exist).
- Never var(--muted|--accent|--border).
- Leave: white text on coral/green/red fills, image/video overlays, cover-theme pictures (src/lib/profile/cover-themes.ts),
  avatar palettes, already-dark chrome.

## Progress log
(appended below per file)
- Decision: text on a #1C1C1E FILL (charcoal chip/button/avatar-placeholder with white text) → fill var(--charcoal) + text var(--paper)
  (Light: #1C1C1E/#FFFFFF identical; Night inverts to #F6F1EA fill / #161515 text, the React twin of the legacy --on-ink).
- Decision: coral #FF5C35 literals left as-is (same value in both themes; not in the map).
- Decision: surfaces with no exact token (rgba(255,253,248,0.92/0.94/0.98), #EFEAE2 media placeholder, dark reds #8E2317/#C42B1C)
  are LEFT and listed; where such a surface holds text, that text stays literal too (a readable light island in Night).
- /legal/* and /support: every page renders through src/components/legal/LegalLayout.tsx (NOT owned), which paints its own cream
  gradient + literal inks; the pages themselves only carry coral links. Nothing to change in my files; LegalLayout listed as open.
- ReportSheet.tsx DONE (23 edits): charcoal/ink-muted/ink-2/hairline/scrim/paper/cream. Left: overlay blacks, red fill+white
  (Block button), coral border/tint, error box rgba(196,43,28,x) + #8E2317 text (no token; dark red on Night paper, listed).
- SharePostSheet.tsx DONE (22 edits): cream sheet, glass preview strip, --tabbar-bg footer (exact rgba(250,247,242,0.96)),
  #B83A1A error ink → --tag-ink, unselected check box → --paper. Left: the two inputs rgba(255,255,255,0.92) (no token) with
  their #1C1C1E text (island), avatar/thumbnail peach gradients + their #1C1C1E initials (palette), coral, overlay/shadow blacks.
- PostViewerMobile.tsx DONE (24 edits): drawer cream/charcoal, body, tags (--tag-bg), engagement inks (--ink-2),
  save activeColor → --charcoal and BookmarkIcon fill → currentColor (= the active colour, identical in Light), comments,
  comment avatar fallback (--charcoal fill / --paper initials), skeleton scrims. LEFT as light islands (no exact token):
  the top bar rgba(255,253,248,0.92) + everything in it (close, author, kebab), the kebab menu rgba(255,253,248,0.98) +
  ViewerMenuItem inks (#1C1C1E / #C42B1C), the comment composer bar rgba(255,253,248,0.94) + its input/button.
  Also left: #EFEAE2 image placeholder (under the picture), video #000.
- PRINCIPLE (ProfileMobile): a surface and the text on it move together. If the surface OR its text has no exact token
  (rgba(255,253,248,0.38/0.55/0.65/0.7/0.92), rgba(250,247,242,0.92), rgba(255,255,255,0.4/0.62/0.92), text #3D3D3A/#3C3A36),
  the whole unit stays literal (a light island in Night) and is listed; inheritors inside an island get a literal colour pinned
  on the island root (Light-identical: the body already resolves to #1C1C1E there). Body/page ink inherits var(--charcoal) since 3.1.
- posts/[id]/PostPageClient.tsx DONE: wrapper div paints var(--cream)/var(--charcoal) under the portalled viewer.
- ProfileMobile.tsx DONE (115 line edits + 2 pins): root/error/skeleton cream+charcoal; header inks (name, handle, tagline,
  campus hints, mutual pill, stats, meta chips, Here-for, vibe-tag editor box → --paper-55); edit inputs → --paper-70 +
  scrim borders; avatar/logo rings → --cream; tab strip (hairlines, cream, active ink + underline); posts sub-tab ON chip
  (--charcoal fill / --paper text); experience rows (--glass), resume rows (--paper, --tag-bg icon, --tag-ink ×); subsection
  titles; EditPill; DragHandleButton; UploadableLogo; PortfolioEditorShell body (--cream: fixes the wave 2 Arrange sheet's
  --paper rows sitting on a literal cream sheet in Night) + its error (--tag-ink); FollowButton (charcoal fill → --charcoal/
  --paper; coral fill keeps #fff; ghost → --paper-70); BlockedByTargetView; safety/report/mute sheets (sheet styles, rows,
  --error-ink danger row, report radios/textarea). Arrange sheet itself: already tokens (verified).
  Pins: Section (bio card) color #1C1C1E; Working-on editor row color #1C1C1E (inputs inherit).
- LEFT (no exact token) in ProfileMobile — light islands in Night: PostFeedCard + PostFeedSkeleton (gradient .55→.38 + lavender),
  its kebab (white .62); RepostRow (glass surface HAS a token but its content ink #3C3A36 doesn't, so the unit stays);
  SubPaneEmpty (.55), SubsectionEmpty + both editor empties (.7), EmptyTab (.65); ExperienceCard (.92) + SheetInput/SheetTextarea
  (only used there); Working-on editor rows (.92); "+ Add role/item" (white .4); PortfolioEditorShell header rgba(250,247,242,0.92)
  + Cancel/title; bio Section (#fff) + its edit textarea + bio #3D3D3A; projectItemStyle (#FAF7F2 + #3D3D3A); posts sub-tab OFF
  chips (white .62); VerifiedBadge; vibe tags #FFF0EC; Here-for ON chip #FFF0EC; avatar peach #FFD3C2 / #F0EBE3 discs + their inks.
  BROKEN in Night until a token lands: SavedGrid text-only tile ink #3C3A36 on a 6% tint (owner-only).
  Also left: cover overlays + floating pills (on the picture), crop guides, FAB, coral fills, shadows, red tints, inset white
  highlights (RepostRow .85, FollowButton ghost .6).
- tsc: clean (npx tsc --noEmit, no output).

## Repair round 1
- Read: contracts C0, plan C, waves 3.2, theming.md, review-w3b.md (F4/F5/F6 + ReportSheet item), globals.css token blocks.
- CONSTRAINT: the fixes ask for NEW tokens (--card-hi/--card-lo, island steps, --ink-body, --error-ink-deep), but
  src/app/globals.css is NOT in my Owns list. Decision: define them as component-local tokens in a <style> block the
  component already has precedent for (ProfileMobile renders <style>{ARRANGE_CSS}</style>), keyed on a data attribute on
  the component root: `[data-pm-tokens]{...light...}` + `:root[data-theme="dark"] [data-pm-tokens]{...night...}`.
  Plain rgba/hex values (no color-mix: iOS < 16.2 rule from globals.css). Prefixed names (--pm-*, --rs-*) so they
  can't collide with whatever globals.css adds later; a later token pass can hoist them into globals.css and drop the
  prefix. No createPortal in ProfileMobile, so every consumer sits under the root that carries the attribute
  (checked below per consumer).
- CORRECTION: PortfolioEditorShell and the safety sheets are vaul drawers with Drawer.Portal (render into <body>), so the
  editor empties and "+ Add role/item" sit OUTSIDE the page root. The local tokens therefore go on `:root` /
  `:root[data-theme="dark"]` inside a <style>{PM_TOKENS_CSS}</style> rendered in ProfileMobile's main root (mounted
  whenever any consumer is; prefixed --pm-*, so no clash with globals.css).
- ProfileMobile tokens (Light = today's literal exactly; Night = rgba of #161515 like --paper-55/70, or an ink):
  --pm-card-hi rgba(255,255,255,0.55)/rgba(22,21,21,0.86), --pm-card-lo rgba(255,253,248,0.38)/rgba(22,21,21,0.72),
  --pm-glass-55/65/70 rgba(255,253,248,.55/.65/.70)/rgba(22,21,21,same α), --pm-paper-40/62 white .40/.62 /
  rgba(22,21,21,same α), --pm-sheen white .85 / white .04 (the --card-shadow Night inset), --pm-ink-body #3C3A36/#E4DDD3,
  --pm-ink-bio #3D3D3A/#E4DDD3 (bio + project rows use #3D3D3A, NOT #3C3A36, so one token can't serve both and keep Light exact).
- ProfileMobile DONE (58 anchored line edits via scratchpad/pm_repair.py, every hit checked against an expected count per range,
  + PM_TOKENS_CSS constant + <style> as the main root's first child + two comment updates):
  F4 BLOCKER PostFeedCard: gradient → var(--pm-card-hi)/var(--pm-card-lo); inset white .7 → var(--glass-border) (exact);
    text → var(--charcoal); image rim + kebab rim → rgba(var(--scrim-rgb),0.06); timestamp → var(--ink-muted);
    kebab disc → var(--pm-paper-62) + dots var(--ink-2). PostFeedSkeleton: same gradient + inset, bars → scrim .06/.04.
  F5 SHOULD: EmptyTab → var(--pm-glass-65), scrim .14 dash, title var(--charcoal), body var(--ink-muted);
    SubPaneEmpty → var(--pm-glass-55), var(--glass-border), var(--ink-2) body, var(--charcoal) title;
    SubsectionEmpty + both editor empties → var(--pm-glass-70), scrim .12 dash, var(--ink-muted);
    "+ Add role" / "+ Add item" → var(--pm-paper-40), scrim .22 dash, var(--charcoal);
    RepostRow → var(--glass), var(--glass-border), inset var(--pm-sheen), "Post" tile scrim .08 + var(--ink-muted),
    meta var(--ink-muted), author name var(--charcoal), content var(--pm-ink-body). Avatar #FFD3C2 + its #1C1C1E initials left (palette).
    None of the empties were white .55/.70 (all rgba(255,253,248,x)), so --paper-55/70 fit none of them; island tokens instead.
  F6 SHOULD SavedGrid text tile: tint → rgba(var(--scrim-rgb),0.06), ink → var(--pm-ink-body). Thumb #1C1C1E under the picture left.
  Also finished with the same tokens (the item said the ink token "finishes the bio card"): bio Section #fff → var(--paper),
    rim scrim .06, ink var(--charcoal); bio text #3D3D3A → var(--pm-ink-bio); bio edit textarea → var(--paper-70), scrim .10,
    var(--charcoal); projectItemStyle (Working-on rows) #FAF7F2 → var(--cream), scrim .06, var(--pm-ink-bio);
    posts sub-tab OFF chip white .62 → var(--pm-paper-62) + var(--charcoal) (was a grey chip on the Night page).
- ReportSheet DONE: RS_TOKENS_CSS (--rs-error-ink-deep #8E2317 / #FF9A8C, ~8.8:1 on the red tint over Night paper), <style> as
  the form body's first child (same div as the error box, which is inside the portal); error text + its link read it.
- Light identity: every repair replacement resolves to the same Light value (--glass-border = white .70, --glass = warm .78,
  --paper-70 = white .70, --cream = #FAF7F2, --paper = #FFFFFF, scrim = 28,28,30, --pm-* Light = the literal they replace).
- OPEN for whoever owns globals.css: hoist --pm-* and --rs-error-ink-deep into the token blocks (suggested names --card-hi,
  --card-lo, --glass-55/65/70, --paper-40/62, --sheen, --ink-body, --ink-bio, --error-ink-deep), then drop the two <style> blocks.
- Still left in my files (unchanged by this round, near-opaque readable islands per the review): ExperienceCard .92 + SheetInput/
  SheetTextarea, Working-on editor rows .92, PortfolioEditorShell header rgba(250,247,242,0.92), VerifiedBadge, #FFF0EC tag/Here-for
  chips, avatar peach discs; PostViewerMobile top bar .92 / kebab menu .98 / composer .94 (review F8, not a repair item for me).
- Repair round 1 tsc: clean (npx tsc --noEmit, no output). No var(--muted|accent|border) in my files.
