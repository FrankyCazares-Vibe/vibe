# W4b notes: shared client for viewing a campus (contracts C5)

Owner: batch b. Owns ONLY: NEW `src/components/campus/viewing-campus.ts`, `viewing-campus.test.ts`, `CampusBrowsePicker.tsx`, `VisitingBanner.tsx`.

## What I'm doing
- `viewing-campus.ts`: pure `parseViewingCampus(search, homeId)`, `withCampus(url, viewingId, homeId)`, `isOpenCampus`, label helpers (group rows for the picker, `campusName`, banner copy), plus the one hook `useViewingCampus(homeId)`.
- `viewing-campus.test.ts`: node:test over the pure parts.
- `CampusBrowsePicker.tsx`: the "Look around." sheet, `variant: "drawer" | "modal"`.
- `VisitingBanner.tsx`: the coral pill + charcoal Back home.

## Decisions so far
- Read contracts C0/C5, plan E + fixes, waves W4, campus-enforcement, critique-product 2-7.
- Hook takes `homeId` as an argument (each shell passes its own; the desktop learns it from `useViewerCampus`, the phone from its own source). C5 shows `useViewingCampus()` with no args; the task text says accept homeId as an argument, so the signature is `useViewingCampus(homeId: string | null)` and it echoes `homeId` back to keep the C5 return shape.
- Read the canvas boards `CampusPickerPhone.dc.html` and `VisitingPhone.dc.html` (artifact B69NRnhbB8mvdrKsc9NQFJ) for exact sizes/copy.
- `viewing-campus.ts` WRITTEN (272 lines, two calls). Exports: `CAMPUS_PARAM`, `canonicalCampusId`, `isVisitingCampus`, `parseViewingCampus`, `withCampus`, `hrefWithViewing`, `isOpenCampus`, `campusViewName`, `visitingEyebrow`, `visitingBannerText`, `visitingComposerNote`, `VISITING_COPY` (rsvpTitle/rsvpNote/emptyFeed/emptyEvents/emptyClubs), `BROWSE_PICKER_INTRO`/`_FOOTER`, `NO_STUDENTS_YET`, `homeChangeDay`, `browsePickerGroups`, types `BrowsePickerRow`/`BrowsePickerGroup`/`ViewingCampus`, hook `useViewingCampus(homeId)`.
- Decision: `isVisiting` = a KNOWN campus is named and it isn't home; an unknown home (loading / none picked) counts as not-home, so a named campus reads visiting until home loads (safe direction: composer hidden, RSVP disabled). Differs from the server's `isVisitingOrg` (both known) only for a campus-less verified straggler: client is stricter, never looser.
- Decision: unknown ids and `?campus=all` resolve to HOME on the client (never sent). `setViewing(home)` drops the param (home = bare URL).
- Decision: `replaceState(null, ...)` NOT `history.state`: Next's patched replaceState skips the useSearchParams sync when handed its own `__NA` state (checked node_modules/next/dist/client/components/app-router.js:255-274, docs 04-linking-and-navigating "Native History API").
- Decision: `campusViewName` says the full name for the two "Northwest"s (IU Northwest / Purdue Northwest) so the banner is unambiguous; picker rows keep the short name (the group heading disambiguates).
- Decision: home row date = `homeChangeDay(availableAt)` "Nov 9" (short month, Indiana calendar, per canvas); past or unreadable date → just "Home".
- Decision: picker layout per canvas: full rows = shared campuses + home + the first campus of a group with >2 rows (Bloomington); rest are 44px compact tiles in a 2-col grid (sub-line only on full rows; compact tiles carry it in `title`/aria-label). Counts: only 0 shows "No students yet · still viewable"; positive/unknown say nothing (no numbers).
- Decision: a viewed non-home row gets a coral border, "Viewing" instead of "View ›", and `aria-current`; "You're here" stays on the home row as the task says.
- `viewing-campus.test.ts` WRITTEN: 23 node:test cases, all pass (`node --test src/components/campus/viewing-campus.test.ts`). "react" and "next/navigation" resolve to data: stubs in the resolve hook (the `handle-change.test.ts` precedent), so only the pure helpers run. withCampus covered on a bare url, a `?limit=` url and a url that already has `campus` (replaced, never doubled).
- `VisitingBanner.tsx` WRITTEN: props `{ viewingId, homeId, onBackHome, className?, style? }`; renders null unless `isVisitingCampus`; `role="status"`; pill 44px tall so Back home's transparent button is a full 44px hit area with the 30px charcoal chip drawn inside; focus ring on the chip via a scoped `<style>`.
- `CampusBrowsePicker.tsx` WRITTEN: props `{ open, variant?: "sheet"|"modal" (default modal), homeId, viewingId?, homeChangeAvailableAt? (ISO), counts?, onPick(id), onClose?, onOpenChange? }`. Sheet = vaul Drawer (z 10000/10001, like Post options), modal = portaled dialog (z 11000, ReportSheet modal pattern: focus in, Escape, Tab trap, body scroll lock, focus back to the opener, a 44px Close button). Rows are real buttons with aria-labels + aria-current; rows get `var(--card-shadow)` so they read as tappable in Light (the canvas's white edge nearly vanishes on cream) — small deviation from the board.
- API adaptation: W4c (desktop) passes `onOpenChange` instead of `onClose`, so the picker takes either (both optional). Their `onPick(id: string | null)` is assignable as is.
- Checks: `npx eslint` on my four files exit 0; `npx tsc --noEmit`: my files clean; remaining errors are siblings' in-progress work (campus-home.tsx `discoverUrl` undefined at ~10424/10447; CampusMobile.tsx:2910 passes `{viewingId, homeId}` to `MapMobile`, which W4d hasn't widened yet).
- Final `npx tsc --noEmit` (after siblings landed more edits): clean, no errors anywhere.
