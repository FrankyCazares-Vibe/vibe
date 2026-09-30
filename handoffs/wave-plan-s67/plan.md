# S67 build plan: feed + rolling strip, profile widgets, dark mode, campus viewing

Written 2026-09-25 from Franky's asks after the Sept 26 founders' meeting and the six reader reports in `handoffs/s67-understand/`. Companion files: `waves.md` (batches, file ownership, order) and `contracts.md` (shapes shared between batches). Status: DRAFT, to be critiqued before wave 1 starts.

## What Franky asked for (his words, condensed)

1. Hideable and movable profile widgets: move widgets around, move the bio to the side, hide or remove widgets.
2. The desktop feed page should look more like the phone view, with separation between posts.
3. A dark mode.
4. The RSVP'd / Heads up / Trending block becomes one slim "rolling newsletter" strip, only on the campus Feed tab, on phone and desktop, so the feed gets breathing room.
5. After sign-up a student can view other campuses: no RSVP, no club chat there, but following people and DMs work anywhere. Your home campus is locked for 1.5 months after you set it, so transfers can pick their new campus later.
6. The vibeIUI / vibePUI account names are decided later (nothing to build).

## Decisions taken in this plan (each reversible; flagged so Franky can overrule)

### A. Profile widgets
- Six widgets: `bio`, `experience`, `skills`, `working_on`, `resume`, `posts`. The header (cover, avatar, stats, name, handle, tagline, meta, Here for, interest tags) is fixed on both surfaces. Pinned post and the Otto hero stay fixed.
- **Posts cannot be hidden.** It is the profile.
- **Empty widgets are hidden for visitors on both surfaces** (the phone already does this; desktop starts doing it). Owners still see empty widgets with the "+ Add" affordance.
- **Moving and hiding are free.** No Vibe+ gate anywhere in this work.
- Layout lives in one jsonb column `users.profile_layout` `{v:1, order:[...], hidden:[...], bioSide:boolean}`, sanitized on read and write, returned by both bootstraps, so the legacy desktop page and the phone read the same document.
- Desktop UX: no new mode. The existing edit mode (pencil) shows a slim control strip on each widget card: drag handle (existing `setupReorderable`), an eye toggle, and "Move to side / Move to main" arrows. Bio has "Dock to side". Autosaves through the existing 1.2 s profile-sync debounce.
- Phone UX: an "Arrange your profile" sheet (vaul, like the Portfolio editors) with up/down and an eye per row. Skills becomes its own Portfolio sub-section on the phone so `order`/`hidden` mean the same thing everywhere. **The phone ignores `bioSide`**: the bio stays in the header at its `order` slot. Docking the bio to the side is a desktop layout choice; hiding the bio behind a tab on the phone, where most students read profiles, would silently bury it.
- Not in Settings for v1; reachable from the profile's edit mode only.

### B. Desktop feed like the phone
- **Franky chose Option A (2026-09-26): the centered 720px reading column.** Design canvas: https://claude.ai/artifact/B69NRnhbB8mvdrKsc9NQFJ. He also asked for the **campus search bar in the header, between the campus name and the Feed/Events/Clubs/Chat/Map pills** (today it's mounted inside `CampusBanner`; keep that mount, move it visually to the middle). Option B ("wide paper", two columns of cards) stays on the canvas as an idea to revisit, not to build now.
- Per-post card with the phone's exact surface (`rgba(255,253,248,0.78)`, 1px white border, radius 18, warm shadow), 12px gap, no hairlines, no `backdrop-filter` on cards (perf + the fixed-position trap). Composer becomes a matching card.
- Feed column capped at **720px, centered**, cream margins. Events and Map keep their own widths.
- Square media and tag chips under the body are NOT copied; the desktop keeps its inline #tags and 56% media. (Parity touches can follow if Franky wants them.)
- Kebab menus keep working: no `overflow: hidden` on cards.

### C. Dark mode
- Mechanism: `data-theme="light|dark"` on `<html>`, set by a ~10-line inline head script before paint (the Next "preventing flash before hydration" recipe, with `suppressHydrationWarning`), reading `localStorage.vibe_theme` = `light | dark | system` (default **light** until wave 5, see below) and `matchMedia`. A `[data-theme="dark"]` token block in globals.css; `@custom-variant dark` switched to the attribute. Body finally paints `var(--cream)` for real.
- Preference stored **both** places: localStorage (instant, per device) and `users.otto_settings.theme` via the existing PATCH route (follows the account). Settings gets an **Appearance** card with **Auto / Light / Night**, in that order (Franky, 2026-09-26). "Night" is the product word; the code enum stays `light | dark | system`.
- **Palette correction (2026-09-26, from Franky's brand images):** night paper is near-black `#0C0B0B` with a soft coral bloom in one corner, cards `#161515` / glass `rgba(22,21,21,0.86)`, ink `#F6F1EA`, ink-2 `#CFC8BE`, muted `#9C958C`, tag ink `#FF8A66`. `contracts.md` C4 must be updated to these before wave 3.
- ~~Palette: neutral charcoal (`#15141A`…)~~ SUPERSEDED by the palette correction above; the values in `contracts.md` C0 are the truth. The violet-night surfaces (landing, /otto, chat chrome, org backdrops) are already dark and stay as they are.
- Scope in this session: mechanism, campus (desktop + phone), settings + shell + tab bar + LeftNav, phone profile, phone messages, network, post viewer and sheets. **Legacy desktop pages** (profile.html, messages.html, onboarding.html, `_otto.js`, `_postViewer.js`, `_miniMessenger.js`) get the script + a `:root[data-theme=dark]` override in this session (partial dark) and their literal-by-literal pass as the last wave, which can no longer be cut (see "Wave 5 can no longer be cut" below).
- Known limits accepted: manifest `theme_color`/`background_color` and the store apps' first paint stay cream; the native status bar flips after load.
- Known limits accepted (wave 3, static batch): `mobile/capacitor.config.ts` (`backgroundColor`, `SplashScreen`, `StatusBar: LIGHT`) and `mobile/www/offline.html` stay cream, so the store apps' splash and first frame are cream in Night until the shell is rebuilt; auth, `/account/suspended`, `/feed` and `/plus` paint their own cream and stay light until wave 5.
- **Default is Light until wave 5 lands.** With Auto as the default, every student whose phone is in dark mode would get the legacy desktop pages half-dark the day wave 3 ships. Students can pick Auto or Night from day one; flipping the default to Auto is one line once the legacy pages are fully dark.
- **Wave 5 can no longer be cut (wave 3 review, 2026-09-27).** Night can be picked from day one, and on the legacy pages the `:root` twin turns the ink light while the `background:white` surfaces (about 28 in profile.html, 18 in messages.html: the thread column, the conversation pane, cards, modals) stay white, so their text is light on white. Wave 3 fixed what the twin alone broke: text on a charcoal fill reads `var(--on-ink)` (white in Light, `#0C0B0B` in Night), coral hovers keep white text, white hover/focus states read `var(--paper)`, and three dark-chrome pieces (profile's edit toolbar and welcome banner, messages' own attachment caption) are pinned to `#1C1C1E`. Recommendation: keep wave 5. If it has to be cut, drop the `:root[data-theme="dark"]` twins in profile.html and messages.html instead, so those pages stay Light inside a Night shell (readable, like `/feed` and auth today). **Done that way for now (2026-09-27):** the two twins are gated on `[data-legacy-night]` (nothing sets it), so profile.html and messages.html stay Light in Night until wave 5 removes the qualifier.

### D. The rolling strip (Feed tab only)
- One new `RollingStrip` component + one shared data hook, mounted on the desktop Feed tab (full width of the capped column, above the composer) and as the first child of the phone Feed pane. The old `OttoFeedStrip`, its two icons and `StripHeader` are deleted in the same wave (~280 lines).
- Content order: RSVP'd events in the **next 14 days** first (max 3), then trending tags (max 8). Height 40px, chips 30px.
- **Phone: manual snap-scroll, no marquee** (on a 375px phone the chips always overflow, and chips moving under a thumb hurt taps). **Desktop: auto-roll only when the chips overflow the width**; pauses on hover, stops under `prefers-reduced-motion`, manual scroll always works. When the chips fit, nothing moves.
- Look (canvas, Feed boards): dotted track, italic coral lead-in `today.` (`there.` when visiting), the logo's open orbit as the "going" mark, tooltips on every chip.
- **Hidden when both lists are empty** (no placeholder; the composer moves up). A refused read shows one muted "Couldn't load · Retry" chip per failed source, never silent.
- Tap a tag → tag filter (existing `onPickTag`); tap it again → clears. Tap an event → Events tab, scroll to and flash that card (`id="event-<id>"` added to `EventCard`). No event page exists, so no new route.
- The Otto tab's own "Coming up" panel is untouched. The Events tab loses the Heads up summary (accepted).
- The trending route learns `?campus=` now, so the strip follows the viewed campus later (E).

### E. View any campus, home locked 45 days
- Any signed-in **verified** student can read any campus's feed, events, orgs and map: delete the one `includes` check in `resolveScopeV2`; the "no system → no browsing" clamp stays. `?campus=all` keeps meaning "my whole university". Trending and search follow the viewed campus (`?campus=`).
- Away from home: **RSVP refused** (403 `campus_visiting`). **Club Join stays what S61 built (Request to join)**: a request doesn't grant chat, chat is members-only already, and a transfer inside the 45-day lock must still be able to ask. Composer hidden, with a one-line note in its slot ("You're just looking. New posts go to Indianapolis."). **The Chat tab stays**: it lists the student's own clubs, not the viewed campus. **Map hidden while visiting a campus that isn't open** (a two-person zone would name people). Follows, profiles and DMs unchanged (already global).
- Existing members keep their clubs and chats when they change home campus later.
- Picker ("Look around"): all 11 campuses grouped as Shared (Indianapolis, Fort Wayne) · IU · Purdue; campuses with nobody on them read "No students yet · still viewable", never "not open yet" (that phrase means unpickable in the home picker); empty-state copy says "Nobody's posted here yet", not "Pick your campus". Purdue-only clubs show to IU viewers with Join disabled ("Purdue students only").
- `?campus=<id>` is the source of truth for the viewed campus (shareable); both shells build every campus fetch through ONE helper so they cannot drift. The eyebrow and banner title follow the viewed campus.
- Home campus lock: the existing 30-day cooldown becomes **45 days**. The clock starts when onboarding finishes with a campus (or on the "Confirm your campus" tap) and restarts on every change; during onboarding itself nothing is locked. Settings keeps showing "You can change your campus on <date>".
- "Announcements" in the meeting notes had no block on the campus page (only the `#announcements` channel default); nothing to merge there.

## Order of waves and why

1. **Feed + strip (B + D).** Smallest, most visible, and every later wave touches the same two campus files; do the layout surgery before the colour pass.
2. **Profile widgets (A).** Franky's first-named item; independent files.
3. **Dark mode mechanism + main surfaces (C).** After 1 and 2 so it doesn't recolour code that is about to be restructured.
4. **Campus viewing + 45-day lock (E).** Server rules first, then the two shells.
5. **Dark mode, legacy pages (C, tail).** Not cuttable while Night is offered (see C); the fallback is dropping the legacy twins.

Each wave: implement (3–5 file-owned batches) → adversarial review → repair → `npx tsc --noEmit` + `node --test` → local production build walked at 375px and 1280px as blake → commit and push (production deploy) → live re-walk + served-CSS tripwire → rollback line. Wave 6 closes with the journal (v7.9 / Session 67), the handoff, memory and the sentinels.

## Fixed after the four critiques (2026-09-26)
- **Tokens ship in wave 1**, not wave 3: W1a adds one unlayered `:root` block with the light values (contracts C0). The names avoid the UI kit's: `--ink-muted` not `--muted`, `--hairline` not `--border`, `--coral` not `--accent` (the kit's unlayered `:root` shadows those three).
- **`profile_layout` goes in the first-tier select**, next to the campus columns, never the `BASE_*` fallback, and the missing-column guard gets the column name; otherwise the migration-lag safety net is dead.
- The strip's data hook lives in the parent, so the phone knows when the strip is hidden; `EventCard` wraps itself for the anchor; the search bar is a new sibling row (the banner is shared with the phone); `withCampus(url)` replaces the `&campus=` string.
- The theme boot script sets `data-theme` only; the theme-color meta changes after mount (React owns it). `DEFAULT_THEME_PREF` is one constant with a drift test over the pasted heads; the flip to Auto is "change the constant, run the test, paste where it fails, change `_VIBE_THEME_DEFAULT` in `public/html/_persistence.js`, bump `SW_VERSION`" (no test pins that last line yet; at load that file keeps the boot script's answer, so a miss only shows when another tab removes the saved choice or clears storage). No CSP today; a future CSP needs the script's hash.
- Verify commands are `npx tsc --noEmit` and `node --test` (no `npm test` existed); every wave walks a local production build before the push and the live URL after, as the non-admin **blake**; every commit carries a rollback line. Full procedure in `waves.md`.
- Wave 3 splits its mechanism into three batches and adds the pages nobody owned (`/legal/*`, `/support`, `/posts/[id]`); wave 4 adds the org page and the three tests that pin "30 days"; wave 6 closes (journal, handoff, memory, sentinels). The security sentinel runs after wave 4, the feature sentinel after the last wave shipped.
- While visiting another campus the student's own RSVP chips stay on the strip (they're theirs); only trending follows the campus.

## Rules that bind every batch
- One owner per file. Nobody edits a file they don't own in that wave.
- Writes and Edits stay under ~150 lines per call (the stall rule). Every batch and reviewer writes its notes to `handoffs/wave-plan-s67/` within its first 8 tool calls.
- Never `remove()` a profile widget from the DOM; hide it (the DOM is the desktop save source).
- Say "video posts", never "clips", in any new copy or comment.
- New colours go through the C0 tokens (`var(--…)`) from day one in waves 1 and 2, so wave 3 doesn't reopen them. Never `var(--muted)`, `var(--accent)` or `var(--border)`.
- No prod writes from agents; migrations via the management API + a `schema_migrations` row, applied BEFORE the deploy that reads the column, with the `isMissingColumnError` guard in place anyway.
- Keep `#campus-feed`, `#campus-tabs`, `id="post-<id>"` and the tour anchors intact.
