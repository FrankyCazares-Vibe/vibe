# W2c notes — phone "Arrange your profile" (ProfileMobile.tsx only)

Batch W2c, wave 2, 2026-09-26. Owns ONLY `src/components/mobile/ProfileMobile.tsx`.

## What I'm doing
1. Read `user.profileLayout` from the bootstrap (typed via C3 `ProfileLayout` from `@/lib/profile/profile-layout`, W2a writing it; local fallback to the default when absent).
2. Portfolio tab renders sub-sections from `order` filtered to `working_on | experience | skills | resume`, skipping `hidden`. Add a Skills sub-section (tag row at ~2038 kept). Bio stays in the header regardless of `bioSide`. Visitor empty-hiding unchanged.
3. "Layout" action in the owner edit chrome → "Arrange your profile." vaul sheet on `PortfolioEditorShell`: one row per widget (Bio, Working on, Experience, Skills, Resume, Posts), 7px colour dot, name, one-line status, ↑ ↓ (44px, disabled at ends), eye toggle (aria-pressed; hidden rows dashed @75%), Posts locked with lock glyph + "Always shown. It's the profile." Footer: coral Save (48px) + "Back to the default order". Save → `savePortfolioPatch({ profile_layout })`.

## Rules I'm holding
- C0 tokens only; never `--muted` / `--accent` / `--border`.
- "video posts", never "clips". Real `<button>`s with aria-labels; ≥44px targets.
- Edits ≤150 lines each; no commit, no push, no dev server, no DB.
- Match surrounding style.

## Decisions so far
- `profile-layout.ts` does NOT exist yet (W2a still writing). I import `ProfileLayout`, `WidgetId`, `DEFAULT_PROFILE_LAYOUT`, `sanitizeProfileLayout`, `isDefaultLayout` from `@/lib/profile/profile-layout` per C3. tsc will fail on that import until W2a lands; report, don't shim.
- `VibeUser.profileLayout?: ProfileLayout | null`; the phone still runs `sanitizeProfileLayout()` on read (absent → default).
- Hidden Portfolio sections are skipped for everyone, owner in edit mode included (task says "skipping hidden"); the Arrange sheet is where they come back. Bio: hidden → not painted outside edit mode; in edit mode the textarea stays (title "Bio · hidden") so the text can still be edited.
- Posts row: ↑↓ still work (desktop cards all carry a grip, so `order` includes posts there); only the eye is replaced by a lock glyph + "Always shown. It's the profile."
- "Back to the default order" resets the WHOLE document to `DEFAULT_PROFILE_LAYOUT` (incl. `bioSide=false`); disabled via `isDefaultLayout(draft)`.
- Skills sub-section: full `user.skills` list as paper chips (the header tag row keeps its 8-cap merge — but since Repair round 1 it contributes no skills when `hidden` includes "skills"). No phone skills editor exists → owner empty copy points at the desktop profile.
- Colour dots, C0 only: bio tag-ink, working_on coral, experience charcoal, skills ink-2, resume ink-muted, posts coral. Focus rings via a scoped `<style>` (`.vibe-arrange-btn:focus-visible`) like RollingStrip's `STRIP_CSS`.
- PortfolioPane: the three JSX blocks become `const workingOnSection / experienceSection / resumeSection` (+ new `skillsSection`), rendered through `order.map` in `<Fragment>`s so a null (visitor-empty) section leaves no gap.
- `PortfolioEditorShell` gains optional `footer` + `headerSave` (default true); `ReorderButton` gains `large` (44×44).
- New state `arrangeOpen`; "Layout" pill sits before Cancel in the edit chrome (same `floatingActionTextStyle` as Cancel).

## Edit map (ProfileMobile.tsx)
E1 imports · E2 doc comment · E3 VibeUser type · E4 pure helpers after `readOwnCampus` · E5 `arrangeOpen` state · E6 derived `layout`/`allSkills`/`widgetCounts` · E7 Layout pill · E8 bio hidden · E9 PortfolioPane call site · E10 mount sheet · E11 pane props · E12 allEmpty · E13 sections → consts + map · E14 shell footer · E15 ReorderButton large · E16 ArrangeProfileSheet + ArrangeRow.

## Log
- Read contracts C0/C3, plan A + fixes, waves W2c row, reader report. Starting the file read.
- E1–E4 done (imports, doc comment, VibeUser.profileLayout, pure helpers before campusHintStyle).
- E5–E13 done (arrangeOpen state, derived layout, Layout pill, bio hidden, pane call site + props + allEmpty, sections → consts + ordered Fragment map, Skills sub-section + skillChipStyle). Next: shell footer/headerSave, ReorderButton large, ArrangeProfileSheet.
- E14/E15 done (shell footer + headerSave, ReorderButton large + tokenised). Writing ArrangeProfileSheet now (two edits before PortfolioEditorShell).
- E16 done (ArrangeProfileSheet + ArrangeRow + ARRANGE_CSS before PortfolioEditorShell). W2a's profile-layout.ts landed 19:10; exports match my import. Running tsc next.
- tsc clean (exit 0, whole repo incl. siblings). Browser smoke at 375 as blake on the already-running :3000 dev server (not started by me): Layout pill renders; sheet renders; ↓ moves Bio under Experience; eye hides Skills (dashed, 75%, struck eye); 'Back to the default order' restores + disables itself. NOT tapped Save: an agent write to the DB, on a column whose migration awaits Franky's yes. Fixed: Posts status truncated at 375 → status now wraps instead of ellipsis.

## Done (2026-09-26)
- ProfileMobile.tsx only: +~600 / −46 lines across 16 small edits; tsc exit 0 on the whole repo (siblings included).
- Untested in the browser: Save round-trip (needs the migration applied; walk as blake, tap Save, reload, check `GET /api/me/profile-bootstrap` → `profileLayout`), and the Skills sub-section itself (blake has no skills → the pre-existing owner EmptyTab shows; walk with an account that has skills, or visit one).
- Browser-pane quirk seen, not mine: tapping the Portfolio tab didn't switch panes in the emulated 375 viewport (smooth scrollTo); verify on the production build walk.
- Pre-existing console error on /campus (W1c's CampusMobile): `<button>` nested inside FeedCard's `<button>` → hydration error. Not touched.

## Contract deviations to flag to the reviewer
1. "Layout" pill uses the existing floatingActionTextStyle (~34px tall) to match Cancel/Save in the cover chrome; the 44px rule is met inside the sheet (↑ ↓ eye 44×44, Save 48, reset 44).
2. Status line may wrap to two lines (Posts at 375px) instead of truncating the mandated copy.
3. ReorderButton's literals → C0 tokens (shared with the small ExperienceCard arrows; identical light values).
4. Posts row: ↑ ↓ stay enabled (desktop carries a grip on every card); only the eye is locked.
5. "Back to the default order" resets the whole document, bioSide included.
6. Hidden Portfolio sections are skipped for the owner in edit mode too; the Arrange sheet is the way back.

## Repair round 1 (2026-09-26)
Items assigned to w2c:
- SHOULD ProfileMobile.tsx:1440 — header tag row merged `skills` (cap 6) for everyone, so `hidden:["skills"]` hid only the Portfolio sub-section while the skills stayed in the visited header; desktop hides them completely. CONFIRMED (skills computed at 1439, layout at 1444 — wrong order). FIX: moved the `layout` / `bioHidden` computation above the skills lines and gated the header-row `skills` on `layout.hidden.includes("skills")` → `[]`. `allSkills` (Portfolio sub-section source) unchanged — the sub-section is already skipped via `portfolioWidgetOrder(layout)`. This supersedes the "header tag row keeps its cap merge" note in Decisions.
- Repair round 1 done: one edit at ~1439–1450 (layout block moved up, `skills` gated). Header `skills` is only read at the tag row (2157/2166); `allSkills` still feeds the Portfolio sub-section + Arrange sheet count (real count shown even when hidden, so the owner sees what's hidden). `npx tsc --noEmit` clean (no output). Not browser-walked: needs an account with skills + `hidden:["skills"]` saved, which needs the migration applied.
