# S68 wave 5 — Night mode on the older pages + phone header colors (2026-09-29)

Franky, Sept 29: "Yes, Night mode now" and "Yes, match desktop" (phone header). Background: `handoffs/wave-plan-s67/waves.md` (Wave 3 "SHIPPED" note + Wave 5), `handoffs/wave-plan-s67/plan.md` lines 34–42 (mechanism, accepted limits, why wave 5 can't be cut), `handoffs/wave-plan-s67/contracts.md` C0 (token names) and C4 (Night palette).

## Rules for every batch

1. **Light stays pixel-identical.** Every literal you replace becomes a token/variable whose LIGHT value equals the literal exactly (same hex/rgba). If no existing token has that exact Light value, add one (Light = the literal; Night = from the palette below). Never "close enough" in Light.
2. **Night palette** (C4 / the design canvas): page `#0C0B0B`, card/paper `#161515`, ink `#F6F1EA`, ink-2 `#CFC8BE`, muted `#9C958C`, hairline `rgba(255,255,255,0.08)`, tag ink `#FF8A66`, coral `#FF5C35` unchanged. Text on a charcoal fill uses the existing `--on-ink` pattern (white in Light, `#0C0B0B` in Night). Reuse the tokens that already exist in `src/app/globals.css` (Light ~57–106, Night `:root[data-theme="dark"]` ~113+) and, in static pages, the page's own `:root` / `:root[data-theme="dark"]` blocks.
3. **Static pages** (`public/html/*`) can't see globals.css. They have their own token blocks; `profile.html` and `messages.html` have a dark twin gated on `[data-legacy-night]` — batch B5a/B5b REMOVE that qualifier so the twin applies under `html[data-theme="dark"]`. Shared scripts (`_otto.js`, `_postViewer.js`, …) inject markup/styles into those pages: use `var(--token, <light literal>)` with a fallback equal to the Light literal so they're safe on any host page.
4. **What must be readable in Night:** no light-on-white or dark-on-dark text anywhere; white surfaces (cards, modals, sheets, menus, inputs, dropdowns, toasts, skeletons) become paper/cream tokens; borders become hairlines; shadows may stay. Images, avatars, brand coral, school colors, and deliberate dark chrome stay as they are.
5. **Do NOT** flip the default theme, touch `src/lib/theme/theme.ts`, `_persistence.js`'s default, the pasted `<head>` boot scripts, or `public/sw.js` — batch B5f does those after all batches pass.
6. **Tool hygiene:** never Read a file over ~1500 lines whole (grep + ranged Reads ≤400 lines). Every Write/Edit ≤150 lines. Prefer many small Edits.
7. **Self-check script:** before reporting, write a small script (node or python, in the scratchpad or `/tmp`-free: use `scripts/` only if you delete it after) that lists every literal you replaced with its token and asserts the token's Light value equals the literal. Report the count.
8. No commit/push, no dev server, no database. Visual checks are DEFERRED to the orchestrator's browser walk; list them.

## Batches (one file belongs to exactly one batch)

- **B5a** `public/html/profile.html`.
- **B5b** `public/html/messages.html`, `public/html/_miniMessenger.js`.
- **B5c** `public/html/{_otto.js,_postViewer.js,_profilePreview.js,_safetyActions.js,_sharePicker.js,_mentionPicker.js,_imageCropper.js,_otto-tour.js}`.
- **B5d** `public/html/onboarding.html`; the auth pages (`src/app/auth/**`), `LegalLayout` and the pages using it (`src/app/legal/**`, `src/app/support/**`), `/account/suspended`, `/feed`, `/plus` (find their files); the auth/legal CSS in `src/app/globals.css` (B5d is the ONLY batch that edits globals.css).
- **B5e** React leftovers + the phone header: the phone FeedCard "⋯" buttons and other pale islands in `src/components/mobile/CampusMobile.tsx`; the desktop `/network` cards (`src/app/network/**`, `src/components/network/**` except `OttoSidePanel.tsx` unless needed); `src/app/admin/**` (the dark background that stops partway down); `src/components/LegalLayout*` only if B5d doesn't own it (coordinate: B5d owns it); **phone header**: `CampusBanner` in `src/app/campus/campus-home.tsx` (see below). Needs a globals.css change? Report it; don't edit.
- **B5f** (after all pass, by the orchestrator or one agent): `DEFAULT_THEME_PREF = "system"` in `src/lib/theme/theme.ts` + the drift test, `_VIBE_THEME_DEFAULT` in `public/html/_persistence.js`, the pasted boot scripts in the static heads, `SW_VERSION` bump in `public/sw.js`.

## Phone header (B5e)

Match the desktop top bar's rule (`CampusTopBar`, `src/lib/iu/school-colors.ts` `SCHOOL_ZONE_PALETTES`): the skin follows the campus on screen; on a SHARED campus the viewer's own school leads (`useViewerCampus().system === "purdue"` → Purdue leads; else IU leads); single-school campuses use only their school; unknown → neutral. Phone banner layout stays as is (tile + name/sub/stats on the left, globe + search buttons on the right). Left zone (tile, name, lines) = leading school's palette; the right button cluster sits on the other school's color behind the same "/" seam with its edge line (gold beside Purdue black, cream beside IU crimson), drawn from the cluster's left edge like desktop. Tile: IU leads → cream tile, crimson letters; Purdue leads → gold tile, black letters. The round buttons take the right zone's palette (bg/border/ink). Keep the sticky wrapper, heights, tap targets (44px) and the `.vibe-campus-banner` phone CSS working. Must not change the desktop `CampusTopBar`.
