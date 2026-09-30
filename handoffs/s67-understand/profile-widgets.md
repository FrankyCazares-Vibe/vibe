# profile-widgets — change A: hideable + movable profile widgets

READ-ONLY reading of the profile subsystem, 2026-09-25 (session 67 prep). Nothing edited.

## Summary

- Desktop profile is the legacy vanilla page `public/html/profile.html` (11,122 lines); `/profile` and `/profile/[handle]` only forward to it on ≥900px (`ProfileHtmlBridge` → `staticProfileHref`, `src/app/profile/profile-html-bridge.tsx:23-35,97-102`). Phone is `src/components/mobile/ProfileMobile.tsx` (6,258 lines, one component).
- Desktop widget order is hard-coded markup: a two-column `.profile-grid` with LEFT = About me · Experience · Skills · Posts card, RIGHT = Resume/Portfolio · Currently working on (`profile.html:3482-3653`). No per-user layout exists anywhere; the only "layout toggle" CSS (`.layout-toggle`, `profile.html:1893-1903`) is dead — nothing in the JS or markup references it.
- Phone widget order is also fixed JSX: cover → avatar → stats → name → handle → tagline → meta chips → Here for → tags → bio → tab strip (Posts | Portfolio), with Portfolio = Experience · Working on · Resume · Skills sub-sections that already hide when empty for visitors (`ProfileMobile.tsx:3396`).
- Both surfaces load the same shape: owner via `GET /api/me/profile-bootstrap` → `vibeUser` (cached in `localStorage.vibe_user_v1`), visitor via `GET /api/users/[handle]/bootstrap`. Owner saves go through `POST /api/me/profile-sync` (desktop, `profile.html:9035`) and `PATCH /api/me/profile` (phone, onboarding); both are fenced by `SELF_PROFILE_WRITE_COLUMNS` (`src/lib/profile/self-write-columns.ts:25-47`).
- Recommended storage: one new jsonb column `public.users.profile_layout` (default `'{}'`), service-role only like the S49+ detail columns, added to `SELF_PROFILE_WRITE_COLUMNS` and its pinned test, sanitized by a new pure `src/lib/profile/profile-layout.ts`, and returned by both bootstrap routes so the legacy page and ProfileMobile read the identical document.
- Zero new deps needed: desktop already has a hand-rolled drag reorder (`setupReorderable`, used for `#workList` / `#currentList`); phone already has `DragHandleButton` / `ReorderButton` up-down editors and `vaul` sheets. `framer-motion` / `motion` are in package.json for animation only.
- Biggest risk is the legacy HTML page: 11k lines, no unit tests reference it, edit/viewer mode is body-class CSS (`body.edit-mode`, `body.viewer-mode`, `.owner-only`), and every widget has hidden owner-only chrome that a "hide widget" must also hide.

## Files

| Path | Lines | Role |
|---|---|---|
| `src/app/profile/page.tsx` | 1-33 | `/profile` server gate (campus access + session) then `<ProfileSwitch/>` |
| `src/app/profile/ProfileSwitch.tsx` | 25-35 | viewport fork: mobile → `ProfileMobile`, desktop → `ProfileHtmlBridge` |
| `src/app/profile/profile-html-bridge.tsx` | 23-35, 37-115 | `staticProfileHref` builds `/html/profile.html?app=1[&handle]`; bridge fetches `/api/me/profile-bootstrap`, writes `vibe_user_v1`, `location.replace` |
| `src/app/profile/profile-params.ts` | 20-32, 45-58 | allowlist of query params carried across the hop (`welcome`, `post`, `embedded`, `clear`) |
| `src/app/profile/[handle]/page.tsx` | 25-36, 114-145 | public share route; OG meta via service role; renders `ProfileHandleSwitch` |
| `src/app/profile/[handle]/ProfileHandleSwitch.tsx` | 43-147 | desktop → static page with `handle=`; mobile → `ProfileMobile targetHandle=` (self → `/profile`) |
| `public/html/profile.html` | 1-11122 | the desktop page: CSS 1-3100, markup 3100-3860 + modals to ~10700, JS from 3860 |
| `public/html/_persistence.js` | 11-40, 523-570, 656 | `VIBE_KEYS`, `vibeLoad/vibeSave` (localStorage), `VIBE_COVER_THEMES` mirror, `vibePersist` |
| `src/components/mobile/ProfileMobile.tsx` | 302-2482 main, 3221-3690 PortfolioPane | phone profile, owner + visitor |
| `src/lib/profile/self-write-columns.ts` | 25-47, 54-58 | closed list of self-writable `users` columns + `unexpectedSelfWriteKeys` |
| `src/lib/profile/types.ts` | 7-42 | `ProfileView` (the API/UI subset of `users`) |
| `src/lib/profile/cover-themes.ts` | 30-79, 119-142 | 8 cover keys, `resolveCoverThemeCss`, `normalizeCoverThemeInput`; mirrored in `_persistence.js:523` |
| `src/app/api/me/profile/route.ts` | 106-421 | `PATCH` self profile (phone/onboarding/settings) |
| `src/app/api/me/profile-sync/route.ts` | 221-855 | `POST` bulk save from the legacy page (media data-URLs, resume, redactions, current_on) |
| `src/app/api/me/profile-bootstrap/route.ts` | 46-177 | owner bootstrap → `vibeUser` via `build-vibe-user-v1.ts` |
| `src/app/api/users/[handle]/bootstrap/route.ts` | 1-325 | visitor bootstrap (public columns only, `PUBLIC_PROFILE_SELECT`) |
| `src/app/api/me/pinned/route.ts` | — | pin/unpin (`users.pinned_post_id`, migration 20260504170000) |
| `supabase/migrations/20260430190000_phase1_initial_schema.sql` | 11-33 | `users` base columns incl. jsonb `otto_answers`, `voice_samples` |
| `supabase/migrations/20260503120000_profile_extension_storage.sql` | 3-10 | tagline, website, headline, location_text, `work_experience jsonb`, `banner_gradient` |
| `supabase/migrations/20260512000000_otto_reminders_and_settings.sql` | 16-17 | `otto_settings jsonb` (the "JSON bag so we can add toggles without migration churn" precedent) |
| `supabase/migrations/20260514000000_users_current_on.sql` | 18-19 | `current_on jsonb` |
| `supabase/migrations/20260514100000_users_resume_redactions.sql` | 14-15 | `resume_redactions jsonb` |
| `supabase/migrations/20260518000000_work_order_manual.sql` | 15 | `work_order_manual boolean` (the one "layout preference" column that exists today) |
| `supabase/migrations/20260922130000_users_profile_detail_server_only.sql` | — | takes detail columns off the `authenticated` UPDATE grant (service role only) |

## How it works today

### Routing and data flow (both surfaces)
- `/profile` → `page.tsx:22-32` gates (campus access, session) → `ProfileSwitch` → desktop `ProfileHtmlBridge` fetches `GET /api/me/profile-bootstrap`, writes `localStorage.vibe_user_v1` (`profile-html-bridge.tsx:57-93`) and `location.replace('/html/profile.html?app=1…')` (`:97-102`). Mobile renders `<ProfileMobile/>` (`ProfileSwitch.tsx:27-33`).
- `/profile/[handle]` → `ProfileHandleSwitch.tsx:51-62` desktop hop to `?app=1&handle=<h>`; mobile `<ProfileMobile targetHandle/>` (`:125-129`), own handle bounces to `/profile` (`:110-118`).
- Owner bootstrap: `profile-bootstrap/route.ts:24-28` `BASE_PROFILE_SELECT` (service role, self id) → `normalizeProfileView` (`normalize-profile-view.ts:25-96`) → `buildVibeUserV1FromProfile(profile, {appShell:true})` (`build-vibe-user-v1.ts:55-140`). Visitor bootstrap: `users/[handle]/bootstrap/route.ts:28-29` `BASE_PUBLIC_PROFILE_SELECT` (no email, no looking_for) → same builder with `appShell:false`, plus `counts`, `_isViewerMode`, `_viewerFollowState`, `pinnedPostId` (`:273-324`).
- Any new column must be added in FOUR selects to reach both surfaces: `BASE_PROFILE_SELECT` (`profile-bootstrap:24`), `BASE_PUBLIC_PROFILE_SELECT` (`users/[handle]/bootstrap:28`), `SYNC_PROFILE_SELECT` (`profile-sync/route.ts:46`), and `settings/page.tsx:36` is unrelated. Then `normalizeProfileView` + `ProfileView` type + `buildVibeUserV1FromProfile` (which maps snake_case columns to the camelCase `vibeUser` keys the legacy page reads, e.g. `interests`→`vibeTags`, `current_on`→`currentlyOn`, `work_experience`→`workExperience`).
- Migration-lag pattern already exists: `isMissingColumnError` (`src/lib/db/missing-column.ts:26-38`) with a retry select without the new column (`profile-bootstrap:64-72`, `profile-sync:829-838`).

### Desktop legacy page (`public/html/profile.html`)
- Init IIFE at `:7786` (viewer branch `:7791-7900`, owner branch `:7906-7960`). Viewer: `body.viewer-mode`, fetch `/api/users/<h>/bootstrap`, paint with `renderUserSections`. Owner: `vibeInit()` reads `vibe_user_v1`; if empty, re-bootstraps and reloads (`:7913-7950`); else `hydrateProfileFields(user)` (`:8175-8183`, fills `[data-user-field]`) then `renderUserSections(user)` (`:9725-9830`: handle, bio `.bio-text`, avatar initials, resume card, redaction bars, cover, `#vibeTags` from `user.vibeTags`, `#skillsWrap` from `user.skills`, `#currentList` from `user.currentlyOn`, then work list). `clearFreshUserExtras` (`:9968`) wipes placeholder markup first.
- Edit mode: `toggleEdit()` (`:3910-3946`) flips `body.edit-mode`, sets `contentEditable` on every `[data-edit]`, shows `#viewerBtn`. All owner chrome is CSS-gated: `body.edit-mode .card-add-btn {display:block}` (`:494`), `.drag-handle` (`:534`), `.tag-remove` (`:468`), `.skill-remove` (`:611`), `.work-delete` (`:593`), `.current-delete` (`:668`), `.resume-upload-row` (`:946`), `.cover-panel` (`:1406`), `.pin-unpin-btn` (`:1516`). Viewer mode: `body.viewer-mode .owner-only {display:none !important}` (`:1532`), `.viewer-only` (`:1533-1534`), `#editToggle` hidden (`:1536`), Otto hero hidden (`:3383`), `.shared-section` forced visible for owner (`:1605`).
- Preview as visitor: `toggleViewerMode()` (`:6037-6058`) toggles `body.viewer-mode`/`owner-mode`, drops edit, shows the floating pill (`:6062-6075`).
- Save path: every edit calls `saveProfileToStorage({edited:'<key>'})` (`:8320-8470`) which rebuilds `vibe_user_v1` FROM THE DOM (identity fields, `.bio-text`, avatar, `#currentList`, `#workList`, chips, counts, `pinnedId`) then `scheduleProfileServerSync()` (`:8536-8543`, 1.2 s debounce) → `flushProfileServerSync` → `buildProfileSyncPayload` (`:8558-8640`) sends ONLY keys in `_editedUserFields` (`:8507-8532`: name, website, bio, tagline, location, majorYear, interests, skills, work(+`work_order_manual`), current, avatar, banner, resume, redactions) → `POST /api/me/profile-sync` (`:9035-9039`) → on success `_settleProfileEdits`, re-fetch bootstrap and adopt echo unless newer local edits (`:9060-9075`).
- Existing per-list reorder: `setupReorderable(listSelector, itemSelector, onChange)` (`:7414-7476`), pointer events on `.drag-handle`, only in `body.edit-mode`; wired for `#currentList` (`:7377`) and `#workList` (flips `_workOrderManual`). This is the drag primitive to reuse for widget cards.
- Pinned post: `#pinnedItem` above the grid (`:3472-3480`), `#pinnedItem.has-pin {display:block}` (`:1484-1485`), rendered by `pinFromProfile` (`:5905-5975`) from the post card DOM; pin state is `PATCH /api/me/pinned` (`:5977+`), not profile-sync.
- Section subnav: `#profileSectionsNav` (`:3462-3467`) pills for `#overview #experience #skills #vibes`; scroll-spy hard-codes `sectionIds = ['overview','experience','skills','vibes']` (`:5812-5813`). Hiding/reordering a widget must update this list or a pill points at a hidden node.
- Calendar: there is NO calendar widget in the profile grid any more. `.cal-widget` CSS (`:2209-2312`) and `renderCalendar()` (`:7192`) survive, but `#calGrid`/`#calMonthLabel` only exist inside the full calendar modal (`:10068+`), fed by `localStorage.vibe_cal_events_v1` (`:7309`). Not a widget for change A.
- Layout toggle: `.layout-toggle`/`.layout-btn` CSS (`:1893-1903`) and `.vibes-posts-split` (`:1763-1780`) have no markup and no JS. Dead CSS, safe to delete or repurpose.
- Grid: `.profile-grid {grid-template-columns:1fr 300px; gap:28px}` (`:320-323`); `.card` (`:479-483`, 24px radius, 28px padding) for left widgets, `.stat-card` (`:697-701`) and `.resume-card` (`:885`) for right widgets. Collapses to one column at `max-width:760px` (`:2908-2935`).

### Phone (`ProfileMobile.tsx`)
- One component, `isVisitor = !!targetHandle` (`:308`). Bootstrap fetch `:426-461`, posts `:508-540`, reposts `:579-604`, saved `:616`. Header edit saves via `POST /api/me/profile-sync` then re-bootstrap (`:1216-1240`); portfolio sheets via `savePortfolioPatch` (`:823-860`, same route, then re-bootstrap); avatar/banner via `/api/me/profile-upload` then profile-sync (`:753-778`).
- Owner chrome: `editMode` state toggled by the pencil in the cover (`:1485-1595`); `showOwnerEdits = !isVisitor && !!editMode` (`:3277`) gates `EditPill`, `DragHandleButton`, logo upload in the Portfolio pane. Per-row reorder is `buildDragHandlers` (`:3296-3350`, pointer capture + `[data-row]` midpoint hit-test) plus `ReorderButton` up/down (`:4709`). Sheets are `vaul` `Drawer.Root` (`:4364`, `PortfolioEditorShell`).
- Visitor empty-hiding already exists: `currentProjects.length > 0 || !isVisitor` (`:3399`), `workExperience.length > 0 || !isVisitor` (`:3465`); bio renders only when non-empty (`:2120-2126`); tags row only when any (`:2029`).

## Change points

### CP1 — Storage: `public.users.profile_layout jsonb` (size S)
- Migration `supabase/migrations/20260926100000_users_profile_layout.sql`: `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profile_layout jsonb NOT NULL DEFAULT '{}'::jsonb;` + `COMMENT`. NO `authenticated` UPDATE grant (the 20260922130000 model, `:1-3`); `GRANT SELECT (profile_layout)` to `authenticated` is optional — both bootstraps read with the service role (`profile-bootstrap:64`, `users/[handle]/bootstrap:100`), so leave it ungranted like `campus_set_at`. Apply via management API curl + `schema_migrations` row (memory rule), not MCP.
- Why jsonb on users, not a table: the row is one-per-user, small (<1 KB), read on every profile paint, and every precedent is jsonb (`otto_settings` 20260512:16, `current_on` 20260514:18, `resume_redactions` 20260514100000:14, `work_experience` 20260503:8). A table would need a join in four selects and an RLS policy for nothing.
- Document shape (`src/lib/profile/profile-layout.ts`, pure, zero imports, with `profile-layout.test.ts`):
  `{ v: 1, order: WidgetId[], hidden: WidgetId[], bioSide: boolean }` where `WidgetId = 'bio'|'experience'|'skills'|'working_on'|'resume'|'posts'`. `sanitizeProfileLayout(raw)` drops unknown ids, dedupes, appends missing ids in default order, caps `hidden` to non-`posts` ids (posts cannot be hidden — it is the profile), and returns `DEFAULT_PROFILE_LAYOUT` for anything non-object. Export `DEFAULT_PROFILE_LAYOUT` = today's markup order: `['bio','experience','skills','posts']` left, `['resume','working_on']` right (see canon below).
- Write path: add `"profile_layout"` to `SELF_PROFILE_WRITE_COLUMNS` (`self-write-columns.ts:25-47`) and update the pinned test (`self-write-columns.test.ts:34-40`, "exactly the 21 columns" → 22). In `profile-sync/route.ts` after `current_on` (`:415-420`): `if ("profile_layout" in body) patch.profile_layout = sanitizeProfileLayout(body.profile_layout);`. Also in `PATCH /api/me/profile` (`profile/route.ts:154-156` area) so a future settings screen can write it. Both routes already run `unexpectedSelfWriteKeys` before the one service-role `update` (`profile/route.ts:~348-356`, `profile-sync:~690`).
- Read path: append `profile_layout` to `BASE_PROFILE_SELECT` (`profile-bootstrap:24`), `BASE_PUBLIC_PROFILE_SELECT` (`users/[handle]/bootstrap:28`) and `SYNC_PROFILE_SELECT` (`profile-sync:46`); add `profile_layout: ProfileLayout` to `ProfileView` (`types.ts:7-42`) and `normalizeProfileView` (`normalize-profile-view.ts:93-95`, via `sanitizeProfileLayout(row.profile_layout)`); in `buildVibeUserV1FromProfile` emit `u.profileLayout = profile.profile_layout` (`build-vibe-user-v1.ts:~140`). Extend `isMissingColumnError` fallbacks in the two bootstraps with `["profile_layout"]` so a deploy before the migration does not 404 the profile (`missing-column.ts:26`).
- Visitors get the owner's layout through the public bootstrap: order and hidden are public by nature (they ARE the page). `bioSide` too.

### CP2 — Desktop: layout engine in `profile.html` (size M)
- Give every widget card a `data-widget="<id>"` attribute: bio card `:3488`, `#experience` `:3494`, `#skills` `:3503`, `#vibes` `:3514`, `#resumeCard` `:3604`, working-on `.stat-card.shared-section` `:3641`. Keep ids; the tour (`:10997+` uses `.bio-text`, `.profile-composer`) and scroll-spy (`:5812`) rely on them.
- New `applyProfileLayout(layout)` called at the end of `renderUserSections` (`:9725`, both owner and visitor paths reach it): for each id, `appendChild` the card into `.profile-left` or `.profile-right` in `order` (a DOM move keeps event handlers and `setupReorderable`'s `dataset.reorderable` intact); `hidden` → `card.hidden = true` + class `widget-hidden`; `bioSide` → move bio card to the top of `.profile-right`. Rebuild `sectionIds`/subnav pills from visible widgets only (`:5812-5813`, `:3462-3467`): hide a pill whose target is hidden.
- Customize mode = edit mode (`body.edit-mode`, no new mode): show a small per-card header strip (`.widget-controls`, CSS-gated exactly like `.card-add-btn` at `:494`) with a 6-dot handle (`_DRAG_HANDLE_HTML`, `:7408`), an eye toggle, and for bio a "Dock to side" toggle. Reuse `setupReorderable('.profile-left', '[data-widget]', onChange)` and `('.profile-right', …)` (`:7414`): it already restricts to `.drag-handle` inside `body.edit-mode` and reorders by pointer midpoint. Cross-column drag is the one thing it lacks; ship with arrows ("Move to side / Move to main") on the strip instead of extending the primitive — same outcome, zero new code paths in the pointer handler.
- Persist: `onChange` → read the DOM order per column, build the layout, `saveProfileToStorage({edited:'layout'})`; in `buildProfileSyncPayload` add `if (edited.layout) payload.profile_layout = u.profileLayout;` (`:8558-8640`); in `saveProfileToStorage` capture `user.profileLayout` from the DOM (`:8400-8470`). This rides the existing 1.2 s debounce, "Changes saved" toast and echo adoption.
- Hidden widgets in edit mode render at 40% opacity with the eye struck through (owner still sees them to un-hide); outside edit mode and for visitors they are `display:none`. `#pinnedItem`, the Otto hero and the identity block stay fixed (they are not widgets, see canon).

### CP3 — Phone: "Edit layout" sheet in `ProfileMobile.tsx` (size M)
- Add a `Layout` row to the owner edit chrome (next to the pencil, `:1485-1595`) opening a `vaul` sheet built on `PortfolioEditorShell` (`:4348`), listing the six widgets with `ReorderButton` up/down (`:4709`) and an eye toggle per row; Save → `savePortfolioPatch({ profile_layout })` (`:823`), which re-bootstraps so `user.profileLayout` refreshes.
- Apply: the header is fixed on phone (cover, avatar, stats, name, handle, tagline, meta, Here for, tags). The movable set is bio + the four Portfolio sub-sections. Render bio from `order` (`:2096-2126` becomes a slot), and map `PortfolioPane`'s three `PortfolioSubsection`s (`:3400`, `:3466`, `:3557`) plus a new Skills sub-section through a `visibleWidgets` array; `hidden` means not rendered even for the owner outside edit mode. `bioSide` has no meaning at 375px: treat it as "bio after the tab strip" (i.e. inside Portfolio at its `order` slot) so the two surfaces agree on intent (side = secondary).
- Empty + owner: keep today's `SubsectionEmpty` copy; empty + visitor: keep today's hide (`:3399`, `:3465`).

### CP4 — Tests + sentinel (size S)
- `profile-layout.test.ts` (sanitize: unknown ids, dupes, hides `posts`, non-object). Extend `self-write-columns.test.ts` count and `build-vibe-user-v1.test.ts:102` ("every other key is unchanged") to include `profileLayout`. Manual browser pass at 375px and 1280px as owner AND as a non-admin visitor (memory: browser pass is not optional).

## Deliverable 1 — canonical widget list

Fixed header (NOT widgets; never move or hide; same on both surfaces):

| Element | Desktop | Phone | Owner-only |
|---|---|---|---|
| Cover (photo or 1 of 8 themes, `banner_url`/`banner_gradient`) | `#profileCover` `:3180-3188` | `:1408-1484` | edit chrome only |
| Avatar (`avatar_url`) | `#avatarEl` `:3196-3212` | `:1602-1676` | edit chrome only |
| Stats (Followers · Connections; phone adds nothing) | `#profileTopStats` `:3223-3232` | `:1680-1692` | no |
| Connect / Follow / "N you both follow" / ⋯ safety | `#profileViewerActions` `:3238-3270` | `:2067-2095` | visitor-only |
| Name, @handle, tagline, meta (Location · Major · Campus · Web) | `#overview` `:3280-3303` | `:1693-2010` | no (edit chrome only) |
| Here for (4 chips) | `#hereForRow` `:3307-3315` | `HereForRow` `:2014-2021` | YES (ruling H6; visitor bootstrap blanks `looking_for`) |
| Interest tags (`interests` → `vibeTags`) | `#vibeTags` `:3316-3318` | `:2024-2044` merged with skills, capped at 8 | no |
| Otto status hero | `#ottoProfileHero` `:3438-3458` | none | YES (`:3383`) |
| Section subnav pills | `#profileSectionsNav` `:3462-3467` | none (tab strip instead `:2130`) | no |
| Pinned post | `#pinnedItem` `:3472-3480` | none on phone today | no (pin button owner-only) |

Movable / hideable widgets (the six ids for `profile_layout.order`):

| id | Name | Desktop today | Phone today | Owner-only | Empty today (visitor) |
|---|---|---|---|---|---|
| `bio` | About me (`bio`) | LEFT #1, card `:3488-3491`, `.bio-text` | header, `Section "Bio"` `:2096-2126` | no | desktop shows empty card; phone hides |
| `experience` | Experience (`work_experience`, `work_order_manual`) | LEFT #2, `#experience` `:3494-3500`, `#workList` | Portfolio tab #2 `:3465-3555` | no | desktop shows empty card; phone hides |
| `skills` | Skills (`skills`) | LEFT #3, `#skills` `:3503-3509`, `#skillsWrap` | NOT a section — merged into the tag row `:2038` | no | desktop empty card; phone: absent |
| `posts` | Posts card: composer + All/Posts/Reposts/Saved | LEFT #4, `#vibes` `:3514-3598` | Posts tab `:2163-2200` (Posts/Reposts/Saved sub-tabs) | composer + Saved owner-only | empty states `:3552`, `:3564`, `:3578`, `:3589` |
| `resume` | Resume / Portfolio (`resume_docs`, `resume_url`, `resume_redactions`) | RIGHT #1, `#resumeCard` `:3604-3634` | Portfolio tab #3 `:3556+` | no (upload row owner-only) | desktop "Attach a resume…" placeholder even for visitors; phone hides |
| `working_on` | Currently working on (`current_on`) | RIGHT #2, `.stat-card.shared-section` `:3641-3646`, `#currentList` | Portfolio tab #1 `:3399-3464` | no | desktop empty card; phone hides |

Not widgets, not in scope: calendar (only the full modal exists, `:10068`, localStorage-fed), the removed "At a glance" (`:3636-3638`, dead capture at `:8446-8455` `#glanceCard`), "People also viewed" (`:3647`).

## Deliverable 4 — what viewers see when a widget is hidden or empty

- Hidden by owner: not rendered for anyone but the owner in edit mode (desktop `display:none` outside `body.edit-mode`; phone not mounted). No placeholder, no "hidden" label to visitors — a hidden widget must be indistinguishable from a never-filled one. Subnav pill for that section disappears with it (CP2). Hiding never deletes data: `hidden` is a view flag; un-hiding brings the content back. `posts` cannot be hidden (sanitizer strips it; the eye is not drawn on that card).
- Empty, visible, visitor: adopt the phone rule everywhere — a widget with no content is not drawn for visitors (`ProfileMobile.tsx:3396-3399`). Today desktop paints empty "Experience" / "Skills" / "Attach a resume or portfolio" cards on visited profiles (`:3494`, `:3503`, `:3621`); `applyProfileLayout` should add `widget-empty` when the list has zero items and `body.viewer-mode` hides it. Bio empty → the card goes too (desktop `:3488`).
- Empty, visible, owner (not editing): keep the card with today's copy so the owner sees where things go; in edit mode add the "+ Add" affordance as today.
- Moved bio to side: desktop renders the same `.card` in `.profile-right` above Resume (300px column, `:320`); phone treats it as a Portfolio-tab slot (CP3). On the one-column collapse (`max-width:760px`, `:2908`) columns stack left-then-right, so a side bio lands after Posts — acceptable, and the phone component is what real phones see anyway.

## Deliverable 3 — UX recommendation (both free)

- Desktop: no separate "Customize" screen. Entering the existing edit mode (pencil, `#editToggle` `:3134`) reveals a slim strip on each widget card: 6-dot drag handle (`_DRAG_HANDLE_HTML` `:7408`, same look as work rows), eye toggle, and on the bio card a "Dock to side / Back to main" pill. Drag reorders within a column via `setupReorderable` (`:7414`); arrow pills move between columns. Autosaves through the existing 1.2 s profile-sync debounce and the "Changes saved" exit toast (`:3932-3934`), so the student never sees a Save button. "View as visitor" (`:6037`) already previews the result, including empty-hiding.
- Phone: a `Layout` action in the owner edit chrome opens a `vaul` sheet ("Arrange your profile") listing Bio, Working on, Experience, Skills, Resume, Posts with up/down `ReorderButton`s and an eye per row; Posts row has no eye. Save → `savePortfolioPatch` (`:823`). Up/down over drag on phone because the vertical list is six rows and `ReorderButton` already exists and is tested by use.
- Libraries: none new. `framer-motion`/`motion` are present (`package.json:26,28`) but only used by `campus-home.tsx`, `LeftNav.tsx` and `components/ui/*`; a `layout` prop animation on phone rows is optional polish. `@dnd-kit` is NOT installed; do not add it — the legacy page cannot import npm modules and the phone has its own pointer reorder.

## Risks

- R1 — Legacy page editability: `profile.html` is 11,122 lines of vanilla JS with inline `onclick=` handlers, globals (`editMode`, `viewerMode`, `profilePinnedId`, `_editedUserFields`), and an IIFE that must run after every helper it calls (`:7400-7406` TDZ note). There is NO test that loads it (51 `*.test.ts` files, none touch the page; `scripts/check-pwa.mjs` only greps it). Every change is verified by hand in a browser. Budget the browser pass, not the code.
- R2 — DOM is the source of truth on desktop: `saveProfileToStorage` rebuilds `vibe_user_v1` from what is on screen (`:8320-8470`). A hidden card is still in the DOM, so its list still captures — good (hiding never loses data) — but if a widget is ever *removed* from the DOM instead of hidden, its data silently drops from the local copy and, if marked edited, from the server. Hide with `hidden`/class only; never `remove()` a widget card.
- R3 — The `_editedUserFields` allowlist (`:8558-8640`) only sends keys that were marked. A layout change must mark `'layout'` or nothing is sent; conversely, moving a card must NOT mark `'work'`/`'current'` (their lists did not change) or the stale cached list re-sends over a newer phone edit — the exact bug the allowlist was built to stop.
- R4 — Scroll-spy + subnav: `sectionIds` is hard-coded (`:5812-5813`) and `IntersectionObserver` targets are captured once at load. Reordering/hiding without rebuilding this leaves a pill highlighting a hidden section or jumping to the wrong place.
- R5 — Tours: desktop tour anchors `#profileCover`, `#avatarEl`, `.bio-text`, `.profile-composer` (`:11027-11043`); phone tour anchors `#otto-mobile-tour-cover/identity/actions/tabs/feed/compose` (`use-mobile-tour.ts:78-115`). If a first-run student hides bio before the tour fires (unlikely, but `?welcome=1` re-runs), the spotlight targets a hidden node. Have `applyProfileLayout` skip hiding while `body.otto-tour-active` (or whatever class `_otto-tour.js` sets) — check `_otto-tour.js:25-30`.
- R6 — Visitor bootstrap is public: `profile_layout` travels to logged-out share-link visitors. It contains nothing private (widget ids only), but the sanitizer must run on READ too (`normalizeProfileView`) so a hand-written jsonb never reaches `innerHTML`. Ids are matched against a closed enum, never interpolated.
- R7 — Migration lag on Vercel: the four selects name the new column; without the `isMissingColumnError` retry (`missing-column.ts:26`) a deploy before the migration 404s every profile (the exact failure the campus columns guarded against, `profile-bootstrap:56-72`). Apply migration first, deploy second, and still add the guard.
- R8 — Two write routes, one list: adding `profile_layout` to `SELF_PROFILE_WRITE_COLUMNS` makes BOTH `profile` and `profile-sync` accept it. Fine, but the test `self-write-columns.test.ts:34` pins the exact 21-column list and will fail until updated on purpose — that is the intended tripwire.
- R9 — Phone Skills: there is no Skills section on phone today (merged into the tag row `:2038`, capped at 8). Making it a movable widget means adding a sub-section; leaving it merged means the phone ignores `order`/`hidden` for `skills` — pick one before building (Q3).
- R10 — Desktop-only `bioSide` on a 300px column: a long bio in the right column pushes Resume and Working-on far down at 1fr/300px (`:320`). Cap side-bio to ~6 lines with "Read more", or accept.
- R11 — `.layout-toggle` dead CSS (`:1893-1903`) and `.vibes-posts-split` (`:1763`) suggest an earlier side-by-side attempt was abandoned without cleanup; don't build on them.

## Open questions for Franky

1. Can a student hide **Posts**? This report assumes no (Posts is the profile). If yes, what does a visitor land on — the header and nothing else?
2. Should visitors see the owner's **empty** widgets on desktop (today they do: empty Experience/Skills/"Attach a resume")? Recommendation: hide empty widgets for visitors on both surfaces, like the phone already does.
3. Skills on phone: today they merge into the interest-tag row (8 max). Make Skills its own phone section so it can be moved/hidden, or leave it merged and let `skills` in the layout apply to desktop only?
4. Does moving the bio "to the side" also mean anything on phone (there is no side)? Proposal: side = "after the tab strip, inside Portfolio"; otherwise ignore `bioSide` on phone.
5. Should the layout be reachable from **Settings** too (a "Profile layout" card), or only from the profile's edit mode?

## Copy suggestions

Not asked; none.
