# Review W3a (wave 3, step 3.1: mechanism) — adversarial, read-only

Reviewer run 2 (Opus 5.5). Scope: working-tree diff (13 modified + theme/, AppearanceCard + view + test).
Gate results folded in: tsc OK, node --test 928/929 (parse-reminder.test.ts known pre-existing), theme drift tests pass, one theme-color meta per static page.

## Verdict (draft, will be updated)
DRAFT: leaning SHIP-WITH-FIXES. Mechanism (boot script, dark block, variant) reads correct so far. Open: Light-mode visible changes from `--background: var(--cream)`, no app-wide applyTheme host.

## Findings so far
1. (checking) globals.css ~223: kit `:root --background` oklch(1 0 0) (white) -> var(--cream). Body + every `bg-background` surface goes white -> cream in LIGHT. Plan C says "Body finally paints var(--cream) for real" so the body part is intended; need to list which surfaces relied on white (shadcn Button outline/Input/etc.).
2. (checking) core notes OPEN: nothing calls applyTheme outside Settings -> theme-color meta stays cream in Night on every React route after a hard load; Auto does not follow OS flips outside Settings until reload.

## Checks done
- layout.tsx: script first child of <head>, data-theme="light" + suppressHydrationWarning on <html>, viewport.themeColor untouched. OK.
- theme.ts: ES5 boot string, outer + inner try/catch, sets dataset.theme only, DEFAULT_THEME_PREF "light". OK.
- globals.css dark block: 14 tokens match C0 dark column; color-scheme: dark; shadcn .dark folded verbatim; --background/--foreground in both blocks; @custom-variant uses attribute; standalone + html.vibe-app read var(--cream).

## Log 2 (after reading every diff + new files)
- Static heads: THEME_BOOT_SCRIPT is the first <head> child and byte-identical in profile/messages/onboarding/offline (string compare, not includes). One theme-color meta each, static #FAF7F2. node --test theme + view: 23/23.
- ES5 script: precedence of `p=window.matchMedia&&...matches?"dark":"light"` is correct; inner try around getItem.
- route.ts: VALID_THEMES allowlist, 400 "Invalid theme" on bad value, unknown keys still dropped. Shallow merge keeps other keys. OK.
- bridge.ts: setStyle DARK over Night (Capacitor: DARK = light text) / LIGHT over cream; pageColor() reads computed --cream with #hex guard; MutationObserver on data-theme, disconnected. No stale styleStatusBarForCream refs. OK.
- DEFAULT_THEME_PREF = "light"; page.tsx never-picked -> "light"; _persistence.js default 'light'. Nothing defaults to dark.

## Findings (candidates)
A. SHOULD AppearanceCard.tsx:72-87 + Next back/forward cache: Next reuses the cached RSC payload on browser Back (docs glossary: "Pages ... are reused during browser back/forward navigation"). Settings -> pick Night (saved) -> tab to /campus -> Back: card remounts with the STALE initial="light" -> mountSync mirrors "light" -> vibe_theme overwritten + page repaints Light while the account says Night. Fix: router.refresh() after a confirmed save, or stamp confirmed saves (vibe_theme_at) and mirror only when the page render is newer.
B. SHOULD no app-wide theme host: applyTheme runs only from the Settings card (and only when device != account). Night on any hard load: theme-color meta stays cream (browser chrome / PWA status bar cream over a near-black page). Auto: React pages don't follow an OS flip until reload while the legacy iframes (_persistence.js) DO -> /messages desktop shell Light around a Night iframe. No `storage` listener on the React side either. Fix: tiny ThemeSync client component in layout.tsx (applyTheme(readThemePref()) on mount; watchSystemTheme while "system"; storage listener).
C. SHOULD legacy Night legibility: profile.html has 21, messages.html 9 rules that FILL var(--charcoal) with literal white text (.btn-acc, .start-btn, .msg-row.mine .msg-attach-caption, .profile-subnav a.active, .doc-nav-btn.primary, .action-btn.rec ...) -> white on #F6F1EA in Night; `.c-btn:hover{background:white;color:var(--charcoal)}` same. Plan says wave 5 is "cuttable without leaving anything broken" -- not true now. Fix: per-page `--on-ink` var (white / #0C0B0B) or a short dark-twin selector list setting color:#0C0B0B on those rules.
D. SHOULD drift gap: _persistence.js `_VIBE_THEME_DEFAULT='light'` is not covered by theme.test.ts; the documented flip recipe (change constant, run test, paste where it fails) will miss it, and vibeApplyTheme() at load would then force Light on legacy pages for no-choice devices, fighting the boot script. Fix: assert it in theme.test.ts.
E. NICE/SHOULD Light visible changes (vs HEAD): (1) kit --background white -> var(--cream): body/canvas + shadcn outline Button bg-background go white -> cream; --foreground oklch(0.145) -> #1C1C1E (plan-intended "body paints cream for real"); (2) Settings PAGE_BG peach gradients -> feed coral bloom; CARD_GLASS gradient/extra inset/shadow -> flat token (planned in waves.md, but the notes claim "pixel-identical in Light"); (3) offline.html glyph #1A1A1A -> #1C1C1E (imperceptible).
F. NICE drift test uses head.includes(), not "first child of <head>".

## Log 3 (more probes)
- Light block: 14 tokens byte-identical to HEAD (only `color-scheme: light` added; no used-scheme change for iframes or UA widgets). Dark block token list == light list (14/14).
- No `.dark` class or next-themes anywhere, so dropping the old `.dark` block changes nothing in Light. No var(--muted|accent|border) under src/ beyond the kit's own @theme mapping.
- No CSP today (next.config.ts, src/proxy.ts). theme-color meta precedes _persistence.js in all three legacy heads, so the load-time meta rewrite finds it.
- G. SHOULD color-mix "fallback" doesn't fall back: a declaration containing var() is never dropped at parse time, so where color-mix is unsupported (iOS < 16.2; the store app targets iOS 15.0, project.pbxproj:271) `background: color-mix(in srgb, var(--cream) 96%, transparent)` is invalid at computed-value time -> transparent, overriding the solid line above it. Tab bar (globals.css:2754) goes see-through in LIGHT on iOS 15; same for SettingsClient 367/1416/1475/1582 rows/inputs and the cursor ring. Fix: rgba tokens (e.g. --tabbar-bg light rgba(250,247,242,0.96) / dark rgba(12,11,11,0.96)) or @supports.
- Legacy Night also: messages.html `.form-input:focus{background:white}` with color var(--charcoal) -> near-white text on white while typing (fold into C).
- NICE: bridge.ts:159 in-app browser toolbar stays CREAM in Night. NICE: SettingsClient.tsx:96 eyebrow #C84A20 on Night glass ~3:1. NICE: NotificationsCard (W3c) is #1C1C1E on dark glass until 3.2 lands; don't push 3.1 alone.

## Verdict (final)
REPAIR, then proceed to 3.2. One BLOCKER: the waves.md 3.1 deliverable "applyTheme in a client effect" (W3a-core) is missing; applyTheme has a single caller (the Settings card, and only on a device/account mismatch), so in Night every React route keeps the cream theme-color (browser chrome / Android PWA status bar), and Auto doesn't follow the OS outside Settings while the legacy iframes do. Mechanism otherwise sound: hydration recipe, ES5 script byte-identical x4, tokens, variant, route allowlist, card a11y, status bar, default Light.
SHOULD: A back/forward stale-initial mirror; C legacy Night legibility; D _persistence.js default not in the drift test; G color-mix fallback on iOS 15; E Light visible change on Settings (backdrop + glass), notes wrongly say pixel-identical.
NICE: F drift test `includes` not first-child; body white->cream + foreground (plan-intended); offline glyph #1A1A1A->#1C1C1E; toolbar CREAM; eyebrow contrast; don't push 3.1 without 3.2.
