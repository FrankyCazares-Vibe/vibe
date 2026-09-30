# S67 contracts: shapes shared between batches

Anything two batches both depend on is written here first, so owners build against the same thing. Revised 2026-09-26 after the four plan critiques (`critique-*.md`) and the design canvas https://claude.ai/artifact/B69NRnhbB8mvdrKsc9NQFJ.

## C0. Token names (wave 1 defines the light values; wave 3 adds the dark block)

`--muted`, `--accent` and `--border` are shadcn names and are shadowed by the UI kit's unlayered `:root` (globals.css:145-150; `var(--muted)` is near-white today). **Never use `var(--muted)`, `var(--accent)` or `var(--border)`.** Vibe's own tokens, all defined in ONE unlayered `:root` block that W1a adds to `src/app/globals.css` (≤30 lines, light values), overridden under `:root[data-theme="dark"]` by W3a-core:

| token | light | dark |
|---|---|---|
| `--cream` (page) | `#FAF7F2` | `#0C0B0B` (near-black, from Franky's brand images) |
| `--charcoal` (ink) | `#1C1C1E` | `#F6F1EA` |
| `--ink-2` | `#5C5853` | `#CFC8BE` |
| `--ink-muted` | `#8A8580` | `#9C958C` |
| `--paper` | `#FFFFFF` | `#161515` |
| `--hairline` | `rgba(28,28,30,0.08)` | `rgba(255,255,255,0.09)` |
| `--scrim-rgb` | `28,28,30` | `255,255,255` |
| `--glass` | `rgba(255,253,248,0.78)` | `rgba(22,21,21,0.86)` |
| `--glass-border` | `rgba(255,255,255,0.70)` | `rgba(255,255,255,0.07)` |
| `--coral` | `#FF5C35` | `#FF5C35` |
| `--tag-ink` | `#B83A1A` | `#FF8A66` |
| `--tag-bg` | `rgba(255,92,53,0.10)` | `rgba(255,92,53,0.14)` |
| `--card-shadow` | `inset 0 1px 0 rgba(255,255,255,0.85), 0 4px 14px rgba(180,120,60,0.08)` | `inset 0 1px 0 rgba(255,255,255,0.04), 0 6px 18px rgba(0,0,0,0.45)` |
| `--feed-backdrop` | `radial-gradient(620px 520px at 100% 0%, rgba(255,92,53,0.30), rgba(255,92,53,0.06) 45%, transparent 70%), radial-gradient(520px 420px at 0% 100%, rgba(255,92,53,0.16), transparent 65%), #FAF7F2` | `radial-gradient(720px 620px at 0% 100%, rgba(255,92,53,0.42), rgba(255,92,53,0.10) 40%, transparent 68%), radial-gradient(560px 420px at 100% 0%, rgba(255,92,53,0.20), transparent 60%), #0C0B0B` |

Status inks added in wave 3.1 (same rule: literals map to them, Light keeps today's hex): `--danger-ink` `#B83030`/`#FF7A6B`, `--error-ink` `#C0392B`/`#FF7A6B`, `--ok-ink` `#1A9E5B`/`#4FD08A`, `--eyebrow-ink` `#C84A20`/`#FF8A66`. Red/green FILLS under white text stay literal. The legacy desktop pages (`public/html/profile.html`, `messages.html`) keep their Night twins behind `:root[data-theme="dark"][data-legacy-night]`, which nothing sets until wave 5, so those two pages stay Light inside a Night shell (readable) until their literal pass lands; wave 5 drops the `[data-legacy-night]` qualifier.

`--cream` and `--charcoal` already exist in `@layer base` (globals.css:9-10); the new unlayered block re-declares them so they win. The campus header in night mode is `linear-gradient(90deg, #151012 0%, #1E1416 60%, #241618 100%)`. Replacement map for the literal passes (waves 3 and 5): `#1C1C1E → var(--charcoal)`, `#fff` as a surface → `var(--paper)`, `#8A8580 → var(--ink-muted)`, `#5C5853 → var(--ink-2)`, `#FAF7F2 → var(--cream)`, `rgba(28,28,30,0.08)` borders → `var(--hairline)`, other `rgba(28,28,30,x) → rgba(var(--scrim-rgb),x)`, `rgba(255,253,248,0.78) → var(--glass)`, `rgba(255,255,255,0.7)` borders → `var(--glass-border)`, `#B83A1A → var(--tag-ink)`. Text on coral/green/amber fills and anything inside already-dark chrome (chat, org backdrops, Otto glass, landing, admin) is left alone. Focus: every new `<button>`/chip gets `outline: 2px solid var(--coral); outline-offset: 2px` on `:focus-visible`.

## C1. Strip data and the RollingStrip (W1a → W1b, W1c; W4 adds `campusId`)

```ts
// src/components/campus/strip-data.ts
export type StripTrend = { tag: string; count: number };
export type StripUpcoming = { id: string; title: string; starts_at: string; ends_at: string | null;
  location: string | null; org: { handle: string; name: string } | null; viewer_status: "going" | "maybe" };
export function formatUpcomingChip(startsAt: string, now?: Date): string; // COPIED from campus-home (W1b deletes the original)
export type StripData = { upcoming: StripUpcoming[] | null; trending: StripTrend[] | null;
  upcomingErr: LoadFailure | null; trendingErr: LoadFailure | null;
  retryUpcoming(): void; retryTrending(): void; refresh(): void };
export function useStripData(opts: { upcomingLimit?: number; trendingLimit?: number; days?: number; campusId?: string | null }): StripData;
export function stripIsEmpty(d: StripData): boolean; // true while both null, or both empty with no errors
```
- **The PARENT owns the hook** (`FeedTabBody` on desktop, `CampusMobile` on the phone) and passes the data down, so the parent knows when the strip is hidden (the phone shows `FeedTagChip` only when `stripIsEmpty`). Fetches `/api/me/upcoming-events?limit=3&days=14` and `/api/trending/hashtags?limit=8[&campus=<id>]` with `vibeRequest({quiet:true})`. `campusId` only when visiting (W4). While visiting, the student's own RSVP chips still show (they are theirs); only trending follows the campus.

```ts
// src/components/campus/RollingStrip.tsx
export function RollingStrip(props: { data: StripData; onPickTag(tag: string): void; onPickEvent(eventId: string): void;
  activeTag?: string | null; visiting?: boolean; roll?: boolean; className?: string }): JSX.Element | null;
```
- Returns `null` when `stripIsEmpty(data)`.
- Layout: container `height:40; display:flex; alignItems:center; gap:8; position:relative; overscrollBehaviorX:contain` with the dotted track `background: repeating-linear-gradient(90deg, rgba(var(--scrim-rgb),0.16) 0 2px, transparent 2px 8px) center / 100% 1px no-repeat`; lead-in first: Fraunces italic 16px `var(--coral)` on a `var(--cream)` patch, text `today.` (or `there.` when `visiting`); a 40–56px right-edge fade; on the phone the parent passes `className` for the `margin:0 -16px; padding:0 16px` bleed and `vibe-no-scrollbar`.
- Chip: `<button type="button">` `height:30; padding:0 12px; borderRadius:999; flexShrink:0; fontSize:12.5; fontWeight:700; whiteSpace:nowrap; scrollSnapAlign:start`, each with a `title`.
  - Event chip: `background: var(--glass); border: 1px solid var(--glass-border); color: var(--charcoal); boxShadow: var(--card-shadow)`; leading 14px open-orbit glyph (`<path d="M20.5 14.5A9 9 0 1 1 15 3.5" stroke=coral 2.4/>` + `<circle cx=19 cy=18 r=3>` filled = going, `r=2.6` stroked = interested); title `maxWidth:150` ellipsis; trailing `formatUpcomingChip` in 11px `var(--ink-muted)`; `title="You're going"` / `"You're interested"`; `aria-label="<title>, <when>, you're going|interested"`.
  - Tag chip: `background: var(--tag-bg); border: 1px solid rgba(255,92,53,0.22); color: var(--tag-ink)`; text `#tag` + count at `fontWeight:500; opacity:0.7`; `title="<n> posts this week"`. Active (`activeTag === tag`): `background: var(--charcoal); color: var(--cream); borderColor: transparent`; tapping the active chip calls `onPickTag(tag)` again and the parent clears the filter (`nextTagFilter`).
  - Failed source: one chip `Couldn't load · Retry`, `border: 1px dashed rgba(var(--scrim-rgb),0.14); color: var(--ink-2)`, calling the matching retry.
- Order: events (≤3, next 14 days) then tags (≤8).
- **`roll` false (phone, default):** single copy, `overflowX:auto; scrollbarWidth:none`, NO scroll-snap (snap parked the strip at 16px and clipped the lead-in in the wave 1 walk). No motion.
- **`roll` true (desktop):** render ONE copy, measure it with a `ResizeObserver`; when `trackWidth > viewportWidth + 8` and `!prefers-reduced-motion`, set `rolling=true`: container becomes `overflow:hidden`, a second copy is appended with `aria-hidden="true"` and `tabIndex={-1}` on every child (NOT `inert`: it swallows pointer events, so the clone half would be dead to clicks while the roll is paused on hover — repair round 1), both inside a `transform`-animated wrapper (`@keyframes vibe-strip-roll { to { transform: translateX(-50%) } }`, duration `max(20, trackWidth/30)` s, `animation-play-state: paused` on `:hover`, `:focus-within` and when `document.hidden`). When it fits, or reduced motion is on, behave exactly like `roll` false. A horizontal `wheel` (or shift+wheel) or an ArrowLeft/ArrowRight `keydown` on the scroller sets `manual` for the life of the mount: `rolling` turns off, the rolled offset is carried into `scrollLeft`, and the strip behaves like `roll` false from then on (plan D's "manual scroll always works").

Pure view helper (unit-tested, no React): `src/components/campus/rolling-strip-view.ts` exporting `orderChips(upcoming, trending, now)`, `stripIsEmpty(data)`, `shouldRoll(trackWidth, viewportWidth, reducedMotion)`, `nextTagFilter(current, tapped)`, `leadIn(visiting)`.

## C2. Event anchor (W1b ↔ W1c)
`EventCard`'s root is `<MouseSpotlight>`, which takes no `id`. `EventCard` therefore returns `<div id={`event-${ev.id}`} style={{ scrollMarginTop: 140 }}><MouseSpotlight …>…</MouseSpotlight></div>`; `mouse-spotlight.tsx` is not touched. Desktop highlights via a `highlightEventId` prop on `EventsTabBody` (same flash as `?post=`); the phone calls `scrollIntoView` on the id after `setTab("events")`.

## C3. Profile layout document (W2a → W2b, W2c)

```ts
// src/lib/profile/profile-layout.ts (pure, zero imports)
export type WidgetId = "bio" | "experience" | "skills" | "working_on" | "resume" | "posts";
export type ProfileLayout = { v: 1; order: WidgetId[]; hidden: WidgetId[]; bioSide: boolean };
export const WIDGET_IDS: readonly WidgetId[];
export const DEFAULT_PROFILE_LAYOUT: ProfileLayout; // order: bio, experience, skills, posts, resume, working_on; hidden: []; bioSide: false
export function sanitizeProfileLayout(raw: unknown): ProfileLayout;
export function isDefaultLayout(l: ProfileLayout): boolean;
```
- `sanitizeProfileLayout`: non-object → default; `order` = known ids in given order, deduped, missing ids appended in default order; `hidden` = known ids minus `posts`, deduped; `bioSide` = `=== true`. Always returns a full document.
- Desktop columns are derived: LEFT = `order` minus `resume`/`working_on` (and minus `bio` when `bioSide`); RIGHT = (`bio` if `bioSide`) + `resume`, `working_on` in `order` order. Phone: the header always keeps `bio` (`bioSide` ignored); the Portfolio tab renders `order` filtered to `working_on`, `experience`, `skills`, `resume`; Posts tab = `posts`.
- Desktop arrange mode per the canvas: each card gets a 28px control strip (coral 6-dot grip, uppercase label, the dotted track, "To side →" / "← Main" or "Dock to side →" on bio, an eye); hidden cards render dashed at 72% opacity with "hidden · only you can see this"; Posts reads "always shown"; the side column ends in a coral dashed drop slot. Phone sheet per the canvas: rows with a colour dot, name, one-line status, ↑ ↓ (44px targets) and an eye; Posts row locked; Save + "Back to the default order".
- vibeUser key: `profileLayout` (camelCase), set by `buildVibeUserV1FromProfile`. Write key on both routes: `profile_layout`; both sanitize before writing and never accept a partial.
- Column: `public.users.profile_layout jsonb not null default '{}'::jsonb`, service-role only. **Select tier:** `profile_layout` joins the OPTIONAL columns next to `school_system,campus_id,campus_set_at` in the first-tier select of `profile-bootstrap`, `users/[handle]/bootstrap` and `profile-sync`, never the `BASE_*` fallback strings; each guard becomes `isMissingColumnError(error, [...M1_USER_COLUMNS, "profile_layout"])`; W2a adds a unit test feeding a fake 42703 message naming `profile_layout` and asserting the retry select omits it.

## C4. Theme (W3a-core → W3a-settings, W3a-static, W3b–W3g, W5)

- Attribute: `document.documentElement.dataset.theme = "light" | "dark"` (resolved; never "system" on the element). Preference key `localStorage.vibe_theme` ∈ `light | dark | system`; server key `otto_settings.theme`, same enum. Settings words: **Auto / Light / Night**, in that order. **`DEFAULT_THEME_PREF = "light"` until wave 5 ships**, then `"system"`.
- `src/lib/theme/theme.ts`: `DEFAULT_THEME_PREF`, `THEME_BOOT_SCRIPT` (the string; sets `data-theme` ONLY on React pages), `readThemePref()`, `resolveTheme(pref, prefersDark)`, `applyTheme(pref)` (attribute + `meta[name=theme-color]` + `vibe:theme` event; called from a client effect after mount, never pre-hydration, because `viewport.themeColor` renders a React-owned meta), `watchSystemTheme(cb)`. Meta colours: light `#FAF7F2`, dark `#0C0B0B`. The four static heads (profile, messages, onboarding, offline) paste the same script and MAY rewrite their static meta in-script; the static meta text stays `#FAF7F2` so `scripts/check-pwa.mjs` keeps passing. `theme.test.ts` reads the four public files and asserts each `<head>` contains the exact current script (drift tripwire). The flip to Auto = change the constant, run the test, paste where it fails, bump `SW_VERSION`.
- `vibe_theme` is a device key: it survives sign-out (not in `ACCOUNT_KEYS`); the Settings page mirrors the account value into it on the next visit.
- `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *))`; the shadcn `.dark` block folds into `:root[data-theme="dark"]` as-is; `color-scheme: dark` under it; body paints `var(--cream)`/`var(--charcoal)` for real (set `--background: var(--cream); --foreground: var(--charcoal)` inside both selectors); standalone overrides (globals.css:2887-2901) read `var(--cream)`. No CSP today; if one is added, `THEME_BOOT_SCRIPT` needs a `'sha256-…'` in `script-src`.

## C5. Viewing campus (W4a → W4b, W4c, W4d, W4e)

```ts
// src/components/campus/viewing-campus.ts (pure + one hook)
export function parseViewingCampus(search: string, homeId: string | null): { viewingId: string | null; isVisiting: boolean };
export function withCampus(url: string, viewingId: string | null, homeId: string | null): string; // bare url at home; otherwise new URL(url, origin) + searchParams.set("campus", id); tested on a bare url and a ?limit= url
export function useViewingCampus(): { viewingId: string | null; homeId: string | null; isVisiting: boolean; setViewing(id: string | null): void };
```
- URL is the truth: `setViewing` uses `history.replaceState` on `?campus=`; `null` = home (param removed).
- Server codes the client must handle: 403 `campus_not_in_system` (only for no-system viewers now), 400 `unknown_campus`, 403 `campus_visiting` (RSVP only), 403 `audience_mismatch` (existing). Join states are unchanged (a visitor to an open club still gets Request to join).
- Visiting UI (both shells, per the canvas "Viewing Bloomington" board): header shows the viewed campus with the eyebrow "IU · JUST LOOKING" and a "Campuses" button that opens the picker; under it a coral pill `Viewing <name> · home is <home>` with a charcoal **Back home** button; the eyebrow and banner title follow the viewed campus; composer/FAB hidden and a dashed one-line note in its slot: "You're just looking. New posts go to <home>."; **Chat tab stays**; **Map tab hidden while the viewed campus is not open**; RSVP buttons disabled with `title="RSVP works on your home campus"` and an italic "RSVP works at home" beside them; Follow, profiles, DMs unchanged; search and trending pass `?campus=`; strip lead-in `there.`. Empty copy: "Nobody's posted here yet." / "No events here yet." / "No clubs here yet."
- `/orgs/[handle]` (W4e): when the club's `campus_id` ≠ the viewer's home, its `EventCard`s render the disabled RSVP state; the back link keeps `?campus=<club campus>`; a 403 `campus_visiting` answer shows "RSVP works on your home campus", never a generic failure.
- Picker ("Look around" sheet): groups Shared · IU + Purdue (Indianapolis, Fort Wayne), IU (7), Purdue (2); home row "Home · you can change it on <date>" with a "You're here" pill; campuses with nobody read "No students yet · still viewable"; footer "home stays home for 45 days after you pick it."
- 45 days: `CAMPUS_CHANGE_COOLDOWN_MS = 45 * 24 * 60 * 60 * 1000`; copy "Confirming locks your campus for 45 days." / "You can't change your campus again for 45 days." / the banner note; the three tests that pin "30" literally are W4a's to update.
