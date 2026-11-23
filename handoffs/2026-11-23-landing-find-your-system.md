# The landing, rebuilt as "find your system" (Nov 23, 2026)

First draft of the record. Franky can change any of it.

## What changed
`/` (signed out) is the "find your system" landing Franky picked on the board (hero 3, "fade into dots", with his two tweaks on Nov 23: the photo a touch bigger, the sun up and to the right).
- **Board:** https://claude.ai/artifact/TAevpg1bdz3mdMY7kzf3qj (private).
- **Board source (marketing, uncommitted):** `vibe-marketing/campaigns/2026-11-landing-revamp/board/` (`d.html#fade`, `export.html`, `export.mjs`).
- **Hero:** his dunes photo, seen through a grid of dots. Near him the dots overlap into the whole photo; further out they shrink into dots, then turn cream. A coral sun sits up and to the right. His people are on a hand-drawn orbit ("the run club.", "trivia, thursdays.", "the group chat.", "that's you.").
- **Then:**
  - "made of your people." (the planet of people);
  - "bring your club." (three SAMPLE screens, numbered by hand);
  - "everything looks different." (the car window, with Otto's one line);
  - "one campus at a time." (Indianapolis lit, the rest "?");
  - the close (the full stop's small system, the tagline as a sign-off).
- **Buttons:** "Sign up free" (`landingCta`; it was "Sign up") and "Bring your club" (the hero's scrolls down to the club section; the other two open an email to help@).
- **Search description:** "Vibe is the social app for your campus, built around clubs. Find your clubs, your events, and each other. Free with your school email."

## How it's built
- `src/components/landing/system/`:
  - `system-landing.tsx`: the page;
  - `system.css`;
  - `hero-dots.tsx`: the photo in dots, drawn once per size on a canvas, with the board's maths;
  - `art.tsx` + `art-data.ts`: the hand-drawn SVGs and where they sit.
- **The art** in `public/landing/system/` is made by the board's `export.mjs`.
  - The handwriting is outlines, so the page loads no hand font.
  - To change a note, edit `export.html` in the board folder and run `export.mjs` again (usage at its top). It rewrites the SVGs and `art-data.ts`.
- **Kept from the classic landing:**
  - the warp into sign-up (`NightSky` with no lights; two new optional props, cream-only dust and no shooting stars);
  - the sign-up switch;
  - the cookie notice, the legal links and the not-affiliated line;
  - `force-dynamic` and the store links (still none).
- **Motion:** one moment. The picture and its notes fade in once the dots are drawn (`--vibe-spring-soft`), and the sun's light breathes. Nothing else moves except the dust.
  - With reduced motion, everything shows complete at once.
  - Every word is real text and shows on the first frame.
- **Weight:** hero photo 44 KB on a phone and 93 KB on a desktop (AVIF; WebP where AVIF isn't supported), plus his outline (343 bytes); each SVG is 1-15 KB gzipped.

## Rollback
`LANDING=classic` in Vercel's environment brings back the Oct-Nov landing (the night sky with six lights) with no code deploy. Keep it for about a week, then delete `home-landing.tsx` and its parts if nobody misses it.

## Checked (Nov 23)
- `npm test`: 4230 passed.
- `npm run typecheck`: clean.
- `npm run build`: passes.
- `npm run lint`: 0 problems in the changed files. The 32 errors it reports are all in files this doesn't touch (mobile/, ui/, the-map/), the same as on main.
- `node scripts/check-pwa.mjs` against `next dev`: 84 passed, 0 failed.
- **Browser** (headless Chromium, the production build with its CSP):
  - checked at 390 and 1440 with reduced motion, and at 375x667, 768x1024, 1024x768, 1280x720 and 1920x1080;
  - no console errors and no sideways scroll;
  - the headline and the button are in the first screen at every size;
  - with motion on, the warp lands on `/auth/signup`;
  - `LANDING=classic` serves the old page.
- **Not checked:** a real phone, and Safari. Franky looks at the Vercel preview on his phone before shipping.

## Open calls (a recommendation each)
- **"We'll set up its page with you, in person. Free."** It's a promise. Recommendation: keep it while it's true.
- **The classic stills** with residence-hall names stay in `public/landing/` only for the rollback. Recommendation: delete them with the classic page in a week.
- **The dots drifting in and settling into the photo on load** (offered on the board, not built). Recommendation: only if the static fade feels flat on his phone.

Franky ships on his yes. Don't merge without it.
