# The Campus bar on club pages (Oct 22, 2026, option A)

Franky looked at a club page on his computer: no way back to Campus at the top, and the cover's two
top-right buttons (+ and ≡) "don't make sense there". Three options went on the canvas
(claude.ai/artifact/Aoee3QoLVqJ92Gts9Vuf6f, row "The top of a club page on a computer", boards TopA/B/C).
He picked **A, the Campus bar**, and added: **"put the edit page button in settings tab ... settings arc
or something"**, so Edit page moves into the Arc's Club settings instead of the row under the bio.

## What ships (computer only: the app frame, from 900px wide)
1. **Campus's own top bar on the club page** (`/orgs/<handle>`), exactly as Campus draws it
   (`CampusTopBar` in `src/app/campus/campus-home.tsx`): campus name, Campuses, the search, the seam, the
   tab pills, with **Orgs lit**. A tab goes to that Campus tab (`/campus?tab=<tab>`); Orgs goes back to
   the clubs list. Search is Campus's search, unchanged (people, clubs, events). Campuses opens the same
   picker (`CampusBrowsePicker`); picking a campus goes to its Orgs list (`/campus?tab=orgs&campus=<id>`,
   home drops `campus`). When the page was reached while visiting another campus (the page's
   `visitedCampusId`), the bar shows THAT campus (visiting look), and its tabs keep `campus=<id>`, the
   way `backHref` does. The Chat pill hides as on Campus when the `chat_desktop` switch is on
   (`chatDesktopFor`, src/lib/chat/flag-desktop-server.ts); Map hides when visiting a campus that isn't
   open (`isOpenCampus`), as on Campus.
2. **The cover's corner is empty on a computer**: `.vibe-club-cover-actions` (CoverOfficerButtons) is
   hidden in the app frame from 900px. Phones, and computer windows under 900px, keep them as today.
3. **The row under the bio, officers, from 900px in the frame: `+ Post` (coral, first) · `Share page`.**
   + Post opens the same PlusSheet the cover's + opened. Edit page is not in this row there.
   From 900 to 1023px the Arc's planet doesn't show (globals.css), so the row also has a **Club tools**
   button there (opens the Arc via `openClubToolsLauncher`, like the cover's ≡ did; a plain link to
   `/orgs/<h>/tools` if the launcher isn't up). A hidden club: no + Post (nothing new goes on it), as today.
4. **Edit page moves into Club settings.** `SettingsScreen` (src/components/orgs/tools/SettingsScreen.tsx)
   gets a first group, "Your page", with one row: **Edit page**, sub-line "Name, background, about and
   links". In the Arc's panel it calls the panel host's `onEditPage` (it closes the panel and opens the
   Edit page dialog, already wired: ClubToolsLauncher.tsx `onEditPage`). On the `/orgs/<h>/tools/settings`
   page (phones and links) it goes to `/orgs/<h>?edit=1`. Every officer who can open Club settings may
   edit the page (owner and admins: same as the Edit page button today), hidden clubs included.
   The Tools index's existing "Edit the page" row stays.
5. **The Edit page button stays mounted but out of sight** in the frame from 900px (a class the CSS hides),
   so `openEditPage()` and `?edit=1` keep working. When it is hidden, opening Edit page must not try to
   focus the hidden button, and closing the dialog gives focus back to where it was before (the planet
   or the Arc's place), never to a hidden element.
6. Under 900px, phones and signed-out visitors: everything exactly as today (TopNav with "Return to
   Organizations", cover buttons, Edit page | Share page). The bar is CSS-hidden under 900px.

## Not in this change
The setup list (`/orgs/<h>/setup`) and the Club tools page (`/orgs/<h>/tools`) keep their own tops.
No database change. No Privacy Policy change (nothing new collected or shown).

## The batches (file-owned; each builder touches only its files)
- **B1 · the bar.** `src/app/campus/campus-home.tsx` (export `CampusTopBar` and `CampusViewContext` plus
  its `CampusView` type; change nothing else in it) and NEW
  `src/app/orgs/[handle]/club-page/ClubCampusBar.tsx` + NEW `club-page/club-campus-bar.ts` (pure: the
  hrefs) + `club-page/club-campus-bar.test.ts`. Export:
  `ClubCampusBar({ visitedCampusId: string | null, hideChat: boolean })`. It renders inside
  `<div className="vibe-club-campusbar">` (the CSS owner is B4). Clicking a tab: `router.push(href)`.
- **B2 · the row buttons.** `club-page/OfficerActions.tsx`: export `RowPostButton({ orgId, orgHandle,
  orgName, verified, viewerRole, boardId })` (coral "+ Post", 44px tall, half-pill size, opens PlusSheet,
  focus back to it on close as CoverOfficerButtons does) and `RowClubToolsButton({ orgHandle })`
  ("Club tools", same pill as Share page). `EditPageButton` gets `inSettingsOnComputer?: boolean`: adds
  `className="vibe-press vibe-club-edit-page"` to its button and fixes focus as in item 5. Keep
  CoverOfficerButtons as is.
- **B3 · Club settings.** `src/components/orgs/tools/SettingsScreen.tsx` (+ the panel's
  `club-page/ClubToolsPanelScreens.tsx` to pass `onEditPage={host.onEditPage}`). New optional prop
  `onEditPage?: () => void`; without it the row is a Link to `/orgs/<h>?edit=1`. Reuse the tools UI rows
  (`tools-ui.tsx` / ToolsIndex's NavRow look) and the pencil icon (`icons.tsx`).
- **B4 · the page and the CSS.** `src/app/orgs/[handle]/page.tsx` and `src/app/globals.css`. Mount
  `<ClubCampusBar>` as the first child of `<main>` when `framed` (signed in + computer); read
  `chatDesktopFor(user.id)`. In the row, for officers when framed: `RowPostButton` first (not on a hidden
  club), `EditPageButton inSettingsOnComputer`, `SharePageButton`, `RowClubToolsButton`. CSS, only under
  `@media (min-width: 900px)` and `.vibe-app-shell`: show `.vibe-club-campusbar` (hidden by default
  everywhere), hide `.vibe-club-cover-actions` and `.vibe-club-edit-page`, hide the row Post/Club-tools
  buttons by default and show Post from 900px, Club tools only 900–1023px. The bar spans the middle
  column edge to edge at the very top (it scrolls with the page, as on Campus), and the page's top air
  stays as now under it. Re-check the cover's width rules and the planet still clear the bar.

## Checks
`npx tsc --noEmit`, `npm run lint` on touched files, `npm test`, plus the [handle] tests run by hand
(`cd "src/app/orgs/[handle]/club-page" && node --test *.test.ts`; npm test skips them). Then a walk at
1440, 1100, 960 and 375 as officer and member, Night and Light: bar present from 900, Orgs lit, tabs go
to Campus, search finds people, Campuses picker opens and closes, cover corner empty, + Post opens the
sheet, Club settings > Edit page opens the dialog and focus comes back, phone unchanged.
