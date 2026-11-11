# Otto Wave 1: Planet everywhere (ship record)

- Branch `claude/otto-wave-1` (worktree `.claude/worktrees/otto-wave-1`), from `main` 9b1731f1.
- Build commit f1d12296. **SHIPPED Nov 10** on Franky's "Ship Wave 1": `main` fast-forwarded 9b1731f1 → f14a7ce0, Vercel deploy succeeded.
- Plan: `BUILD-ORDER.md` (this folder). Design: `handoffs/2026-11-09-otto-agent-design-board.md`.

## What's built
- Otto is **Planet** everywhere he shows: the phone's Otto tab icon (24px, still), the computer's left menu
  (24px, still), the corner button (a 64px paper puck with a 46px Planet that moves), the side panel's small
  Otto, the Otto page's hero (phone and computer), onboarding, the map, and the static profile and onboarding
  pages.
- He's drawn in CSS: an ember planet with two eyes, an open tilted ring, and a coral moon that laps the ring,
  passing behind him and round the front (about 16 s; faster and violet while thinking, once a model
  exists). At 24 and 28px and under reduced motion he holds still with the moon parked.
- **Waiting on you** is the moon at the raised end of his ring. The corner's count is ink now, so his moon is
  the only coral thing there. The old badge pulse (which kept going under reduced motion) is gone.
- **Otto's look**, a new row in Otto's settings: ten colours (the club backdrop names, Ember first) and
  "Otto's motion: Still / Living". Saved in the existing Otto settings (no database change) and on the device,
  so every Otto changes at once.
- The static pages share a copy of the same stylesheet, checked byte for byte by a test. The onboarding
  wormhole keeps the moon in step at the hand-over (no second moon). Purple glows behind a resting Otto
  became warm gold.
- The rest of the Otto page (the purple starfield room) is unchanged until Wave 2.

## What you need to approve
- **Ship = merge to `main` and push** (Vercel deploys it). No database change. No Privacy Policy change: the
  policy already lists "Otto settings" (`src/app/legal/privacy/sections-1-3.tsx`) and covers the device copy
  under "a few similar notes".

## Checks
- `npm test`: 4,097 pass (baseline 4,062; 35 new, including the kit rules, static drift, look, settings and
  the corner). `npm run typecheck` clean. eslint: 0 errors on touched files (old warnings only).
- `npm run build` (Turbopack, as Vercel runs it) passes from a checkout with its own `node_modules`.
- Two adversarial reviews (correctness, looks) and a repair pass. Fixed: the static corner's old 52px shell,
  the coral count beside the coral moon, badge loops under reduced motion, purple glows, the Tonight panel's
  clearance for the bigger corner, focus jumping in the look dialog, 40px controls.

## Browser walk (local stack only)
- Phone 390, Blake and Avery, Night and Light: tab bar Planet at 4x, the Otto page hero, the look sheet,
  Midnight + Still (every Otto turns blue and stops; survives a reload), reduced motion (no Otto animation).
- Computer 1440, Avery, Night and Light: left menu, corner at rest and waiting (ink "9+"), side panel and its
  Messages tab, the Otto page, the map's 220px Planet, the static profile's corner, the Tonight panel clears
  the corner, reduced motion and Still. No console errors.

## Not done, or not checked
- A real phone (Safari's `container` units and `color-mix` need iOS 16.2 or later; older shows a misdrawn
  Planet, not a crash).
- Onboarding for a new person (signed-in test accounts are sent past it); the wormhole was checked on a
  local static server instead.
- Low, left for Wave 2 or later: the phone hero keeps its animation after scrolling off screen; the static
  corner shows a dot, not the waiting pose; the static panel's small Otto is 42px against 28px in the app;
  a thin dark outline around the moon on the map's navy band; a device that already has a look doesn't
  follow a change made on another device; one frame of Ember before a chosen colour on page load.

## Calls for you
- **Violet colourway while thinking:** his thinking moon is purple, so on a Violet Otto it nearly matches
  his body (only its rim tells them apart). My pick: keep Violet (you kept all ten) and give the thinking
  moon a cream rim on Violet and Midnight, done in Wave 2.

## Shipped (Nov 10)
- Franky: "Ship Wave 1". `main` was still 9b1731f1, so the branch fast-forwarded to f14a7ce0 and was pushed.
- Vercel status for f14a7ce0: success (build `dpl_ENyqT1H67qCMCe1Bv8SsqmgYz2Ht` on /api/version).
- Live checks, signed out: `/html/_otto-planet.css` is 200 and byte-equal to the repo copy; the live
  site-wide CSS no longer carries the old orb rules (the previous build had them). Signed-in pages redirect to
  login when signed out, so Planet on them was not checked live.
- Not checked: Franky's phone walk on the live app (the tab icon, the corner, the Otto page hero, Otto's look).
