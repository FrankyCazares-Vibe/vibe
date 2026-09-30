# W3a-core notes (wave 3, step 3.1) — theme mechanism

Owner of: `src/app/layout.tsx`, `src/app/globals.css`, NEW `src/lib/theme/theme.ts`, NEW `src/lib/theme/theme.test.ts`. Nothing else is touched.

## What I'm doing
1. `theme.ts`: `DEFAULT_THEME_PREF = "light"`, `THEME_PREFS`, `readThemePref()` (localStorage `vibe_theme`, validated), `resolveTheme(pref, prefersDark)`, `THEME_BOOT_SCRIPT` (ES5 string, sets `data-theme` only, try/catch), `applyTheme(pref)` (attribute + `meta[name=theme-color]` + `vibe:theme` event; client-only), `watchSystemTheme(cb)` (returns unsubscribe).
2. `theme.test.ts`: node:test over resolve/read/script string + the DRIFT test that reads the four static heads and asserts each contains `THEME_BOOT_SCRIPT` verbatim (expected to fail until W3a-static pastes it; the failure names the file).
3. `layout.tsx`: `data-theme="light" suppressHydrationWarning` on `<html>`, the boot script as the FIRST child of `<head>`. `viewport.themeColor` stays static cream.
4. `globals.css`: line 5 `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`; `:root[data-theme="dark"]` after the wave 1 unlayered `:root` (~47-67) with the C0 dark column for all 14 tokens + `color-scheme: dark` + the folded shadcn `.dark` values (delete the old `.dark` block ~261-293); `--background: var(--cream); --foreground: var(--charcoal)` in both selectors; standalone overrides (~2908-2922) read `var(--cream)`; `.vibe-mobile-tabbar` and the cursor ring get token colours.

## Decisions so far
- The boot script is a plain `<script dangerouslySetInnerHTML>` in a Server Component layout (the docs' Themes recipe, lines 246-268). The `InlineScript` text/plain wrapper is for Client Components rendered on soft navigations; the root layout never re-renders on soft nav, so the plain tag is the sanctioned form here.
- The script reads the key, validates against `light|dark|system`, falls back to `DEFAULT_THEME_PREF`, resolves `system` with matchMedia, and sets `document.documentElement.dataset.theme`. Nothing else (no meta rewrite — React owns the theme-color meta).
- Drift test reads files relative to the repo root via `import.meta.url` (`../../../public/...`) so it runs from any cwd.

## Progress log
- [ ] theme.ts
- [ ] theme.test.ts
- [ ] layout.tsx
- [ ] globals.css (variant, dark block, body tokens, standalone, tab bar, cursor)
- [ ] tsc + node --test

## Log 1
- theme.ts written (zero imports; exports THEME_PREFS, ThemePref, ResolvedTheme, DEFAULT_THEME_PREF, THEME_STORAGE_KEY, THEME_META_COLORS, THEME_EVENT, ThemeEventDetail, isThemePref, resolveTheme, readThemePref(storage?), systemPrefersDark, THEME_BOOT_SCRIPT, applyTheme, watchSystemTheme).
- Extra exports beyond C4 for the sibling batches: `THEME_STORAGE_KEY` (settings writes the key), `isThemePref` (the route's `case "theme"`), `THEME_META_COLORS`, `THEME_EVENT` + `ThemeEventDetail` (NativeBridge listens), `systemPrefersDark` (the "Right now: Night, because your phone is in dark mode" line).
- The boot script uses an INNER try/catch around localStorage.getItem so a blocked storage still resolves "system" via matchMedia (matters once the default flips).
- theme.test.ts written: pure tests + the script RUN against fakes via `new Function("window","document","localStorage", script)` + applyTheme/watchSystemTheme with fake globals + the drift test (one subtest per file, message names the file).

## Resume (run 2, after the usage-limit stop)
- On disk at resume: theme.ts (139 lines) + theme.test.ts (236 lines) written; layout.tsx done (data-theme="light", suppressHydrationWarning, boot script first in <head>); globals.css has the variant, the dark block with all 14 tokens + color-scheme + folded .dark values, --background/--foreground in the kit :root (light) and the dark block, .dark deleted, standalone + vibe-app read var(--cream), tab bar + cursor on tokens.
- Now: verify each file against C0/C4, check the @theme inline mapping, run node --test and tsc.
- Verified theme.ts / theme.test.ts / layout.tsx against C4: correct, kept as is.
- Verified globals.css: variant, 14-token dark block + color-scheme, folded .dark (old block gone), --background/--foreground = cream/charcoal in the kit's unlayered :root (the one that used to say oklch(1 0 0); it sits after W1's :root so it has to be there) and in the dark block; @theme inline maps --color-background → var(--background). Standalone + html.vibe-app read var(--cream). Tab bar + cursor ring on tokens.
- Added: the tab ITEMS (.vibe-mobile-tab ink-muted, --active charcoal, active bar coral) were still literals; #1c1c1e active ink would vanish on Night. Tokenized (MobileTabBar.tsx reads these classes; only its badge dot is inline coral).
- Token values checked mechanically against the C0 table: all 14, light and dark, match.
- node --test src/lib/theme/theme.test.ts: 13/13 pass (the static batch has pasted the script into all four heads, so the drift subtests are green too).
- tsc: only src/components/settings/AppearanceCard.tsx errors (W3a-settings, mid-work: paint, TILE_CSS, INTRO, GRID, ThemeTile, STATUS undefined). None in my files.
- OPEN: nothing calls applyTheme on mount on every route. The Settings card does, NativeBridge only watches the attribute for the status bar. So on a hard load of any other page in Night, the theme-color meta stays React's cream, and Auto doesn't follow an OS flip live outside Settings until reload. Needs a tiny client host (e.g. NEW src/components/theme/ThemeSync.tsx: applyTheme(readThemePref()) on mount + watchSystemTheme when the pref is "system" + a `storage` listener for vibe_theme), mounted in layout.tsx. Not in my Owns list; flagged to the orchestrator.

## Repair round 1 (run 3)
- Read notes, git status, theme.ts, layout.tsx diff, C0/C4, waves 3.1. On-disk work from runs 1-2 still matches C4 (re-checked theme.ts + layout.tsx).
- Item 1 (BLOCKER, missing applyTheme-on-mount host): agreed, it is the OPEN item from run 2. Fixing inside my Owns list: NEW `src/lib/theme/ThemeSync.tsx` (not src/components/theme/, which is outside my Owns), mounted in layout.tsx next to NativeBridge.
- Item 2 (SHOULD, color-mix "fallback" never falls back): agreed. A var()-bearing declaration is only validated at computed-value time, so on iOS < 16.2 the color-mix line wins the cascade and computes to transparent. Fixing with rgba tokens.
- Item 1 done. theme.ts: NEW `syncThemeColorMeta(theme)` (writes only a meta whose content differs, so an observer can't loop; applyTheme now uses it) and `currentTheme()` (reads <html data-theme>). NEW `src/lib/theme/ThemeSync.tsx` ("use client", renders null): mount → `applyTheme(readThemePref())`; `watchSystemTheme` re-applies "system" when the key (read at flip time) is "system"; `storage` listener on `vibe_theme` (and key null = cleared) re-applies; a MutationObserver on <head> (childList+subtree+content attr) and a `usePathname` effect repaint the meta from the attribute. The meta-only paths never re-read the pref, so they can't undo a Settings tap.
- DEVIATION (placement): ThemeSync is the FIRST child of <body>, not next to NativeBridge. Passive effects run in tree order, so its mount applyTheme runs before any page effect; the Settings card's mount paint (account value mirrored on a new device) then always wins. After {children} it would clobber the card's paint when storage is blocked (card paints without storing; ThemeSync would re-read the default).
- DEVIATION (location): `src/lib/theme/ThemeSync.tsx`, not `src/components/theme/`, because only src/lib/theme/ is in my Owns list. Move it later if wanted (one import in layout.tsx).
- Item 2 done. globals.css: NEW rgba tokens in both blocks, `--tabbar-bg` (light rgba(250,247,242,0.96) = HEAD's value, Night rgba(12,11,11,0.96)), `--paper-55` / `--paper-70` (light white at .55/.70, Night rgba(22,21,21,.55/.70)). `.vibe-mobile-tabbar` reads `var(--tabbar-bg)`; the cursor ring is plain rgba(255,92,53,0.4) (coral is the same in both themes). No color-mix left in globals.css outside comments.
- NOT MINE, for the sibling batches: SettingsClient.tsx 367/1582 should read `var(--paper-55)` and 1416/1475 `var(--paper-70)` instead of color-mix; AppearanceCard.tsx:353 boxShadow `color-mix(in srgb, var(--coral) 16%, transparent)` → `rgba(255,92,53,0.16)` (it only loses the shadow on iOS 15, harmless but same bug class).
- theme.test.ts: +1 test (syncThemeColorMeta no-rewrite + currentTheme). node --test: 14/14 pass. tsc: clean. eslint on my three touched files: only the pre-existing font-link warning.
