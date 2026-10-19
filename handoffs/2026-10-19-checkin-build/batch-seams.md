# Seam pass after batches 1 to 5 (Oct 19 2026)

## Numbers
- `npx tsc --noEmit -p .`: exit 0, also after `npx next typegen` regenerated
  `.next/types` (so the new routes' and pages' exports are checked by Next's
  validator too).
- `npm test`: 3296 / 3296 pass (one new test).
- eslint on all 52 new or changed `src/` files: 0 errors, 1 warning
  (`SettingsClient.tsx:1258`, already at HEAD). `campus-home.tsx` vs HEAD: 6
  warnings both, 0 new. `CampusMobile.tsx` is not changed.
- Local SQL check: `event-checkins-check: all 119 cases passed` (ROLLBACK).
- No dev server on :3000 (curl exit 7). None started. Batch 1's curl check
  and the browser pass are still owed.

## Seams checked, all fine
- Every path the UI calls has its route and method: checkin GET/POST/DELETE,
  door GET/POST/DELETE, marks/[userId] PUT/DELETE, marks DELETE,
  me/event-checkins GET, attendees GET, events `?org_id&when=past`.
- Response shapes match the readers (door feed, attendees `walk_ins` and
  `checkin`, Settings' `checkins`, viewer `state`).
- No import cycle (no check-in component imports campus-home; OrgPastEvents
  does, as the contract says). Every client component says "use client";
  checkin-route.ts is server-only.
- Every CSS token used exists in globals.css; `.vibe-press` exists; the door's
  own classes come from its inline `<style>` (style-src allows it).
- `data-holds-reload="false"` is honoured (`page-snapshot.ts:27`).
- `uqr` 0.1.3 pinned exactly; lockfile matches.
- No campus layout, so the door page has no tab bar.

## Changed in this pass
- Upper-case ids (Batch 2's finding 4, the cross-batch half). isUuid takes
  either case, but the state row is looked up by the id string, so an
  upper-case id gave 404 on GET and a null `initial` on the landing page.
  - The three check-in route files lower-case the event id right after
    isUuid; marks/[userId] lower-cases both ids.
  - Landing page: looks the state up by `row.id` (the database's).
  - Door page: passes `id.toLowerCase()` to DoorView.
  - checkin-routes.test.ts: one new GET test and one PUT case, with an id
    that has letters in it.
