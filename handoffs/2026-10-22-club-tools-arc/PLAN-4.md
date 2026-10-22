# Part 4 (Oct 22, 2026): the Look section, one list of backgrounds, the Name field

Franky: "Build the Look section: one shared list of the 10 tuned backgrounds, the picker in the Edit page on
phone and computer, and the Name field. Write up the database change for the 5 new presets for my yes."

Research: `SETTINGS-MAP.md` (sections A and B: the three lists that disagree, the picker design, the 10 presets).
Mockups (the look to build): the canvas https://claude.ai/artifact/Aoee3QoLVqJ92Gts9Vuf6f, boards
`LookDesktop.dc.html` and `LookPhone.dc.html`; their source and renders are in the session scratchpad
`tools-board/project/` and `tools-board/shots/LookDesktop*.png`, `LookPhone*.png`.

## Done by the lead (read it, don't change it without saying why)
`src/lib/orgs/backdrops.ts` (+ test): THE list. `BACKDROPS` (10, picker order, exact tuned CSS), `BackdropKey`
(incl. legacy "cream"), `NEW_BACKDROPS_LIVE = false`, `DEFAULT_BACKDROP = "sand-purple"`,
`storableBackdropKeys()`, `pickerBackdrops()`, `isPickableBackdrop()`, `backdropFor()` / `backdropCss()` (cream and
unknown paint Dusk), `legacyChatWallpaper()` (cream keeps its light paper in the old chat panes only).
**Until migration 20261026100000 is applied, only the 5 existing keys are offered or saveable.**

## Batches (strict file ownership; nobody but the lead edits `src/app/orgs/[handle]/page.tsx`)

### K1 · Server and the old pickers
Owns: `src/app/api/orgs/[slug]/route.ts`, `src/app/api/orgs/route.ts`, `src/app/campus/campus-home.tsx` (ONLY its
backdrop code: the `BackdropKey` type and `BACKDROP_PRESETS` (~307, ~400-450), `DEFAULT_BACKDROP`, the chat-pane
wallpaper ~907, the create dialog picker ~1299/1481, the settings window's backdrop picker and read-only row
~1904/2039/2107, the org type ~12853/12974), `src/components/mobile/CampusMobile.tsx` (ONLY its backdrop uses),
their tests.
- Both pickers and every reader use the shared module (no second list anywhere: grep for the old gradient strings
  and `VALID_BACKDROPS` and remove them). Old pickers offer `pickerBackdrops()`; the old chat panes use
  `legacyChatWallpaper(key)`; the settings window's read-only row shows `backdropFor(key).label`.
- PATCH `/api/orgs/[slug]`: a `backdrop_preset` that isn't `isPickableBackdrop` is a 400 `invalid_backdrop` (today
  it is silently dropped); a 23514 on `orgs_backdrop_preset_check` (a new key before the migration) is a 409
  `backdrop_not_ready`, never a 500. POST create: default `DEFAULT_BACKDROP`, a bad key 400. Name: confirm the
  PATCH's existing 2-50 + word filter and that the officer roles that may edit the page may rename (owner and
  officers, the same gate as description); say what it is.
- Tests: the PATCH backdrop answers (pickable, cream, unknown, new-before-live, 23514 → 409) and the name answers,
  in the existing org route tests (find them: `grep -rln "api/orgs/\[slug\]/route" src/lib`).

### K2 · The Look section and the Name field (Edit page, phone and computer)
Owns: `src/app/orgs/[handle]/admin-actions.tsx` (EditPageModal), `src/app/orgs/[handle]/club-page/OfficerActions.tsx`
(EditPageButton: new props `initialName: string`, `initialBackdrop: string`), NEW
`src/app/orgs/[handle]/club-page/LookSection.tsx` (+ a pure helper/test file if useful), and in
`src/app/globals.css` a NEW block placed right after the Arc block, starting `/* The Edit page's Look section`.
- Look is the FIRST section of Edit page: Photo (the club logo + "Change photo"), Cover (the cover strip + "Change
  cover": the existing upload buttons move here), Background: a radio group of `pickerBackdrops()` swatches (one
  Tab stop, arrows / Home / End like `EventVisibilityField` in campus-home.tsx; each ≥44px, the gradient itself,
  the selected one ringed with a check, NOT colour alone; its name under the group, "Dusk · the default" for the
  default). A hidden club keeps today's rule (no photo/cover buttons there); the background picker shows for a
  hidden club too (it only paints its own page).
- Live preview: on a computer the club page behind repaints as you pick: the page's `<main>` paints
  `background: var(--club-backdrop)` and sets `--club-backdrop` inline (the lead does that in page.tsx); the modal
  sets `--club-backdrop` on that element while open, cross-fade not required (a quick opacity fade on a layer is
  fine if simple), and RESTORES it on Cancel / × / Escape / close without saving. On a phone (the page's own sheet
  layout, `PHONE_QUERY` 720px in `club-page/use-phone.ts`), a preview card at the top of Look (mini cover, logo,
  name, @handle on the chosen background), since the sheet covers the page.
- Name field: first field of the About part (2-50 chars, counter like the mockup "16/50", the word-filter error
  from the route shown inline). Save sends `name` and `backdrop_preset` only when changed, with the rest exactly as
  today; after a successful save `router.refresh()` as today.
- Motion: springs.ts only (swatch press: the existing `.vibe-press` or a spring scale), transform/opacity only,
  reduced motion respected. Theme tokens (the Edit page is a night island).
- Tests for the pure parts (selection, labels, what Save sends).

### K3 · The database change for the 5 new presets (write it up; don't apply to production)
Owns: NEW `supabase/migrations/20261026100000_club_backdrop_presets.sql`, NEW
`src/lib/orgs/backdrop-migration.test.ts`, NEW `handoffs/2026-10-22-club-tools-arc/BACKDROP-MIGRATION.md`.
- The migration: `orgs_backdrop_preset_check` dropped and re-added in one transaction with the 6 current keys
  (`cream, sand-purple, ember, deep-violet, forest, midnight`, same order) + `rose, cardinal, lantern, canal,
  onyx`; house-style header (PLAIN ENGLISH, PRE-FLIGHT on production with expected answers: the current CHECK text
  exactly, counts per `backdrop_preset`, nothing outside the new list; POST-CHECK; ROLLBACK, which must first move
  any club on a new key back to `sand-purple`; DEPLOY ORDER: apply, then flip `NEW_BACKDROPS_LIVE` and deploy).
  Safe to run twice, lock_timeout 5s. Rehearse on the LOCAL stack only (`docker exec -i supabase_db_vibe psql -U
  postgres -d postgres -v ON_ERROR_STOP=1 < file`: apply, check, apply again, rollback, apply) and leave it applied
  locally with its `supabase_migrations.schema_migrations` row. NEVER production; never db reset.
- The test reads the migration text: the list equals `storableBackdropKeys(true)` from backdrops.ts.
- `BACKDROP-MIGRATION.md`: plain English for Franky, short: what it changes (one rule in the database lets five
  more background names be saved), what it doesn't (no data changes, no grants), the pre-flight, how to undo it,
  and the one-line code flip after.

Rules for everyone: no Privacy Policy change is expected (a club's background is the club's, not a person's
data; say so if you find otherwise); tsc, `npm test` (all), eslint on touched files; never commit, stash or push;
never touch production; don't start a dev server.

## Lead's page wiring (done, for K2)
The club page's `<main>` now carries `data-club-backdrop=""` and paints `background: var(--club-backdrop)` with
`--club-backdrop` set inline from `backdropCss(org.backdrop_preset)`. The Look section finds it with
`document.querySelector<HTMLElement>("[data-club-backdrop]")`, sets `style.setProperty("--club-backdrop", css)`
while picking, and puts back the value it read on open when the officer cancels or closes without saving.
