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

## Round 4 (Nov 23, Franky's notes on the preview)
- **Hero:**
  - The headline is the tagline, "your campus. your people. yourself." (Franky's call; it was a sign-off only, decision 10), and the close drops it.
  - The kicker says "Open now / IU + Purdue".
  - The picture is bigger (desktop box 1000 x 900, photo 1.2x), and "trivia, thursdays." is now "astronomy callout.".
  - It's alive: every second or so a few small patches flutter into the real photo and back, fast, like wings (Franky: "like bees, or wings when they flicker"). Each flutter is two or three patches beating against each other at 13-20 beats a second, then dying away within a second. Under a mouse the dots near the pointer turn into the photo smoothly, and a tap sets off a flutter on a phone. The patches stay small, so it never flashes a big area, and with reduced motion nothing flutters by itself.
  - The planet's people flutter alight the same way.
- **Made of your people:** the planet is drawn live (`planet.tsx`, the post's recipe), with room round the coral you. People light up now and then (about one in ten coral), and the people under the pointer light up.
- **Bring your club:** no hand notes or hand numbers; the list numbers are mono "01 02 03".
  - Two desktop screens of a sample club, **Coffee & Chess**: its page and its chat. A SAMPLE label sits on each.
  - The club is Sixty-Four Chess renamed, so its chess posts and Blitz Night still make sense. Its cover is the top of Franky's cafe photo (no people, no screens).
  - They were taken on the local practice copy (`tools/indy-shoot.py` and `capture-app.mjs`, which has a new desktop "org-page" shot), and the data was put back afterwards.
  - The screens are cropped to the club itself: no side rail (Franky's profile picture shows faces), no school header, no chat list (SAE).
  - Full shots: `vibe-marketing/campaigns/2026-11-landing-revamp/board/assets/desktop-club-*-coffee.png`. The SAE cover can't be used even renamed, because it is the chapter's own letters.
- **See you there** replaces "everything looks different." Otto is in a round night window up in the sky, its rim breaking into dots, with one line ("it's nicer in here, honestly."). The band across the eyes and the other two notes are gone.
- **One campus at a time:** Indianapolis and Bloomington are lit, and "your campus next?" has no arrow. The body says "Open now for IU and Purdue students."
- **The close:** the coral full stop is drawn by the art now, so the rings are centred on it. They pass behind it and behind the letters at the back, and in front of it below the letters.

## Round 5 (Nov 23, Franky's notes on the preview)
- **Smaller everywhere:** headlines about 20% down (desktop hero 78, sections 80, close wordmark 170 at 1440), body 17, and the handwritten notes about 13% smaller.
- **See you there:** Otto's window is back across his eyes, as on the first board. It's a rounded band whose edges fray into dark dots (the hero's texture), not a hard rectangle, with only Otto's line.
- **Bring your club:**
  - No SAMPLE pills on the pictures (Franky: they spoil them). Instead, one small line under the screens: "A made-up club, to show how a page looks.", so nobody reads Coffee & Chess as a real club on Vibe (zero clubs are signed).
  - The cafe-ceiling cover is replaced by a coffee-and-chess scene drawn in code (`board/club-banner.html`; no photo, no AI), and the screens were retaken the same way and the practice data put back.

## Round 6 (Nov 23, Franky's notes)
- **Flow, no random flicker.** Franky's reference: a pixel figure whose edges shimmer (Pinterest pin "R&D for Polsia"). Its page needs a sign-in, so it was read from its preview frame.
  - Hero: the dots where the photo breaks up now breathe in slow waves (two crossing sine waves, at most 30 frames a second, only on screen), and a few coral dots glow in and out.
  - The random flutters (hero and planet) are gone. Hover still turns dots into the photo.
  - The spotlight is smaller (desktop 285 x 335, phone 132 x 158), so there are more small dots.
  - The photo's sides and foot fade out, so the dots never stop at a line.
- **Headlines:** more room between lines (hero line height 1) and under the hero headline. The letters melt into dots toward their foot, per line (background-clip text over a dot grid).
- **The coral full stop's journey** (`coral-drop.tsx`):
  - It bounces once in "yourself." with the sign-in dot's bounce, and a moment later (or on the first scroll) drops to the bottom left.
  - It rides down the left margin as the page scrolls, then lands in "vibe." as its sun and bounces. Scrolling up takes it back out.
  - Without JavaScript, or with reduced motion, both full stops just sit still. The close's sun is a page element now (`.fys-orb`), placed from the export.
- **See you there:** smaller (420 wide on a desktop). The photo melts into dots in a soft oval (`dot-photo.tsx`), and Otto pops up out of the band over the forehead.
- **Removed:** the scene slugs in every section's corner, and the "made-up club" line (Franky's call; the alt text still says it's made up).

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
