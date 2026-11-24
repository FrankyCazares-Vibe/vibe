# The landing, rebuilt as "find your system" (Nov 23, 2026)

**Shipped Nov 23, 2026, on Franky's yes ("Ship it"), as PR 5, squash-merged into main.** `LANDING=classic` in Vercel's environment brings the old landing back.

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

## Round 7 (Nov 23, Franky's notes)
- **The cursor spotlight** is a third of its size (30 design px on a desktop).
- **Cut-off letters fixed:** each headline line is padded past its letters, because background-clip: text only paints inside the box.
- **Grain** (Franky: "don't be afraid to try the grainy"; refs: the dithered hands and the glitch-window portrait in `vibe-marketing/brand/learnings/refs-2026-11-22`). This reverses the brand guide's "no grain", so check it on a phone.
  - The headlines melt into dithered grain (`grain-dither.png`).
  - The hero's dots where the photo breaks up are dithered: scattered off the grid and uneven in size.
  - A faint film grain covers the page (`grain-film.png`). Turning it off is one rule: `.fys-root::after`.
- **The coral full stop** now falls into the next screen's full stop ("made of your people."), tied to the scroll, and lands with the sign-in bounce. At rest it hops every few seconds in "yourself.". The close's sun stays where it is.

## Round 8 (Nov 23, Franky: "way way way too grainy")
- The page-wide film grain is gone (and `grain-film.png` with it).
- The headlines are solid nearly all the way down, with a fine grain only at their very foot.
- The hero's dots are only slightly uneven now.

## Round 9 (Nov 23, Franky: "make sure the period keeps dropping")
- There is one coral full stop, and it travels. As the page scrolls it drops from headline to headline: "yourself." → "made of your people." → "bring your club." → "see you there." → "one campus at a time." → the sun of "vibe.".
- At each headline it lands with the sign-in bounce and rests for about a third of a screen of scrolling as that headline's full stop. Scrolling up runs it back.
- Every headline full stop is a `.fys-stop` (in page order), and the close's sun is `.fys-orb`. Only the one it rests in shows.
- Without JavaScript, or with reduced motion, every full stop sits in its place.

## Round 10 (Nov 23, Franky's notes; investigated with a 6-agent workflow)
- **The Log in "hyperdrive" (the warp) was broken.** The round-6 clean-up had deleted its fade rule, its dust sat under the hero picture, and buttons lower down skipped it.
  - Night now falls over the whole page while the hero's dust, pinned over the screen, streaks outward (`.fys-root.is-warping::after`, and `.vln-sky` fixed).
  - It plays from every Log in and Sign up button, including at the bottom. While pinned, the dust stops drifting with the scroll (NightSky `pinnedWarp`, opt-in, so the classic page is unchanged).
  - The two places it goes are prefetched when the page loads.
- **The circled "stray dot" was the app's own coral mouse pointer** (CustomCursor.tsx, a dot in a ring). On this page it reads as a planet, so here the pointer is the system's own. It comes back on every other page, through a `:has()` rule.
- **Drop hardening:**
  - The last landing, into the close's sun, now happens 8% of a screen before the very end, so it never hangs over the sun.
  - Positions are measured without the bounce's transform.
- **Headline texture:** "halftone fall". Every letter is solid to about the middle of its lowercase, then opens into a fine hex halftone that shrinks toward its foot, so it's no longer only p's and y's.
  - Chosen by three judges from five tried on the live page (fine screen, halftone fall, riso shadow, ember screen, dot halo), with one judge's tweak: start lower, fade faster, wider dots.
  - The investigation's files are in the session scratchpad (`wf/`).

## Round 11 (Nov 23)
- The hero's hover spotlight is removed (Franky). Nothing on the page follows the mouse now; the hero only breathes.
- **The close, cleaner** (Franky: "fix the cropping, let the orange dot sit cleanly"):
  - The rings were cut off on a desktop, for two reasons. The hand library's halo filter only reaches 120px past its drawing's box, and the rings were drawn in pieces whose ends fade, so their tips looked cropped.
  - Each ring is now one unbroken loop, in a wider box, behind the letters and the sun. The front-layer drawing (close-front) is gone.
  - The sun sits a hair right of the full stop (0.035em), so it never touches the "e", and on top of the rings.

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

## After ship: "before you sign up." (Nov 23)

Franky tried the third-party taste skill on the landing (the trial and its notes: `vibe-marketing/campaigns/2026-11-landing-revamp/taste-trial/`). He wasn't a fan, and kept three things from it: an FAQ, telling people how to add Vibe to their home screen, and the skill's checker.

- **New section, before the close:** "Questions / 05", "before you sign up.", with four answers always open (no accordion):
  - **Is there an app to download?** No download needed: Vibe runs in the browser. Then the home-screen steps, in the app's own words (`settings/notifications-card-view.ts`). Once a store listing is set, the answer points to it instead.
  - **What does it cost?** Free for students, and so is setting up a club's page.
  - **Who sees that I went to an event?** The club's officers. Everyone else sees only how many checked in, from 5 up (`checkinCountLine`).
  - **How does my club get on Vibe?** Email us, and we set up the page in person.
- **The coral full stop** now also lands in "sign up." on its way down to "vibe.".
- **The checker, for landing previews:** run `node ~/.claude/skills/design-taste-frontend/scripts/consistency.mjs <preview url> --widths 1440,390 --profile <a temp folder>`.
  - Read only cut text, overflow (`off-viewport`), `overlap-text` and `tap-size`. On this page all four pass.
  - Ignore the rest. Its `spill` and `off-grid` findings on every headline come from the halftone padding (round 7), and its one-section, row-lines and scroll-motion rules are its own taste.
  - `collide` flags only the cookie notice, a fixed banner.
- **Checked:**
  - `npm test` passes (4230) and the typecheck is clean.
  - In the browser at 1440 and 375, the new section has no sideways scroll.
- **The close's sun and its rings** (Franky: "the ring at the bottom of the orange dot should go over it, and it should be above the ring at the top").
  - The inner ring is the only one that crosses the sun: its half-height is 0.108 of the font size, under the sun's radius of 0.116.
  - `close-front` is that same hand-drawn stroke, copied rather than redrawn, by `board/export-front.mjs`. It has no dark outline (over coral the outline read as a smudge).
  - The page shows it only over the sun's lower half: a half disc cut along the rings' -10° tilt (`FRONT_STYLE`). So the ring's near side runs in front of the sun and its far side behind.
  - `export.mjs` doesn't know this piece. Re-export it with `node campaigns/2026-11-landing-revamp/board/export-front.mjs <app root>`.
- **Three small fixes from a motion audit (Nov 23):**
  - The front ring's clip goes from 1.08 to 1.18 times the sun's radius. The landing squash starts 1.15 times as wide, so for a moment the ring slipped behind the sun's edges.
  - The planet's description no longer says people light up at random. That was removed in round 6.
  - With reduced motion, a tap on the planet is one plain fade, with no 14 to 20 Hz flutter.
- **The handoff's motion notes are out of date.** On a desktop, the night dust still leans with the mouse, and the planet lights up under it. Franky said to remove the hero's hover spotlight, which is gone. These two are still there, and they are his call.

## Motion, ideas 1 and 2 and a faster hero (Nov 23, Franky: "Yes, build 1 and 2")

The idea list and its review are in `vibe-marketing/campaigns/2026-11-landing-revamp/motion-ideas/README.md`.

- **1. Your people light up, starting from you (`planet.tsx`).**
  - Trigger: the travelling full stop lands in "your people." from above (`fys-land`) while the planet is at least half on screen. Without the drop, the planet being half on screen starts it.
  - What happens: your coral light swells once over 700 ms. Then a band of cream runs out from you through the crowd: each person starts 120 ms plus up to 900 ms by distance, lights over 140 ms, dims over 320 ms, and grows up to 1.4 times at the peak. It plays once per visit and never with reduced motion.
  - Measured on a phone at 2x: it lifts each third of the planet by 50 to 64%, right to left, and settles in about 1.3 s.
  - Not changed: the desktop mouse lighting and the tap flutter. Removing the mouse lighting is Franky's call.
- **2. The full stop falls like a real drop (`coral-drop.tsx`, rewritten).**
  - One dot of one size, moved and scaled by a transform, with no width or height writes each frame. It stretches with its speed, up to 12% narrower and 22% longer at 1800 px a second.
  - Landings use the sign-in dot's keyframes, played with Web Animations so a take-off can cancel them. Their height scales with the fastest speed of the fall: 0.55 after a slow scroll, 1 (today's bounce) from 1200 px a second.
  - Coming back up, it settles in (scale 0.92 to 1 over 320 ms) instead of bouncing.
  - It takes off from where the full stop is on screen, mid-bounce included. Measured: within 1 to 2 px, against up to 0.55em before.
  - It hands over to the full stop on the same frame, so two coral dots never show at once. A stop never bounces twice within 400 ms. Within 4% of a fall it still counts as resting, so a phone toolbar resizing the page no longer lifts it off.
  - Each landing fires `fys-land` on `.fys-root` with `{ index, stop, fromAbove }`.
- **A faster hero (`hero-dots.tsx`).**
  - The still part (the photo through the still dots, and the still cream dots) is composed once per size. Each frame redraws only the band where dots move, and the flowing photo dots are made on a canvas the band's size.
  - It pauses when less than 30% of the hero shows, and phones draw at 1.5x instead of 2x.
  - Pixel check with reduced motion: desktop is identical (25 of 3.6M pixels differ by more than 8 levels). The phone is a little softer at 2x zoom. Nothing changes outside the band.
- **Measured** on local production builds, on a phone at 390 with its processor slowed 4x:

  | | Hero while scrolling | Frames over 33 ms | p95 |
  |---|---|---|---|
  | Before | 27.8 fps | 64.6% | 46.6 ms |
  | After | 66 fps | 0% | 25.8 ms |

  Desktop at 1440: the hero went from 35 to 57 fps.
- **Checked:**
  - `npm test` passes (4230), the typecheck is clean and the build passes. Reduced motion shows no drop and no wave, with every full stop showing.
  - Across a scripted scroll at 390 (no screen recording), neither the old nor the new page has a frame over 100 ms. The pauses a reviewer saw in the screen recording came from the recorder itself.
  - Not checked: a real iPhone, Safari, or Android.

Shipped Nov 23, 2026, on Franky's yes ("Ship both"): PR 6 (the questions, the front ring and the small fixes), then PR 7 (the drop, the wave and the faster hero), each squash-merged into main.

## Crisp drawings on iPhone (Nov 23, Franky: "on mobile the drawn wording looks very low quality")
- **Cause:** every drawing's ink had one SVG filter, the hand library's soft dark halo, there so the cream ink reads over the photo. Safari draws an SVG filter at low resolution, so on an iPhone every handwritten word and line came out blurry. In the iOS simulator: with the filter, blurry; the same file at 3x intrinsic size, still blurry; without the filter, crisp.
- **Fix (`board/vector-halo.mjs`, run on all ten drawings):** the filter becomes a vector halo. The same ink is drawn once more underneath, in night at 62% (the filter's own tight halo), thickened by the filter's dilate radius (1.2 px on phones, 1.8 on desktop) with a non-scaling stroke. The filter's wide 22% blur goes, since it can't be drawn without a filter.
- **Re-exports:** `export.mjs` and `export-front.mjs` in the board now run it on what they write.

Shipped Nov 23, 2026, on Franky's yes ("Ship it"), as PR 8.

## The ring of light and soft arrivals (Nov 23, Franky: "build the ring of light and soft arrivals")
- **The ring of light (`close-ring.tsx`, motion idea 6, the dot's spec: "one thin cream ring out as it lands, gone within a second"):**
  - When the drop first lands in the sun of "vibe." from above, a 1 px cream ring in the inner ring's own shape and tilt (0.72 × 0.216 em, -10°) runs out from 0.7 to 1.5 times and fades, over 900 ms on the soft spring.
  - A faint coral light swells behind the sun (2.6 times its radius, up to 40%) and goes.
  - Once per visit; never on the way back up; never with reduced motion (tested: one ring on the first landing, none after scrolling up and down again, none with reduced motion).
- **Soft arrivals (motion idea 5):**
  - The "see you there." photo melts away under its dots over 700 ms (300 ms with reduced motion) instead of swapping in one frame.
  - A club screen that hasn't loaded when the page starts waits unseen and fades up 8 px into place as it arrives (500 ms; the front one 120 ms after the back one; with reduced motion, a 300 ms fade only). On a fast connection the screens are already loaded, so nothing fades.
  - Without JavaScript the screens simply show (tested).

Shipped Nov 23, 2026, on Franky's yes ("Ship it"), as PR 9.

## One campus at a time, lit one at a time (Nov 23, Franky: "build the campus lighting next")
- **The two lit campuses come out of the drawn line** (`board/lift-campuses.mjs` took their coral dots and glows out of `open-*.svg`; `export.mjs` now does it on every re-export) and are drawn by `campus-lights.tsx`, placed from `ART_EXTRA.campuses`.
- **Until the drop lands in "at a time.",** they sit on the line as faint cream rings. When it lands, Indianapolis lights coral with a small version of the sign-in bounce, then Bloomington 260 ms later, coral too.
- **Both campuses light coral,** as before (Franky: "ship it in coral"). The PR first had Bloomington in cream, to keep one coral thing in a frame; he chose coral.
- **Never left dark:**
  - a landing further down the page lights them too (a fast flick that skips "at a time.");
  - so does the line being 60% in view for 2.5 s.
  - Without JavaScript, with reduced motion, or before the drop starts, they're simply lit.
- **Tested** on a local production build at 390: calm scroll, fast flick, a pause short of the landing, reduced motion and no JavaScript all end lit, and only the calm scroll and the pause show the faint state first.

Shipped Nov 23, 2026, on Franky's yes ("yes ship it in coral"), as PR 10.

## The ring of light, stronger (Nov 23, Franky: "Make it stronger")
- The ring starts at 85% (was 55%), is 1.6 px (was 1 px) and runs out to 1.65 times (was 1.5). It moves out on the soft spring but fades evenly over 1.1 s, so it is seen for most of a second. The coral light behind the sun peaks at 55% (was 40%).
- Still once per visit, never on the way up, and never with reduced motion (tested).

Shipped Nov 23, 2026, on Franky's yes ("Ship it"), as PR 11.

## The hero arrives in one order (Nov 23, Franky: "build the hero arrival order next", motion idea 7)
- **The order:** the logo's dot lands (done by about 1.4 s), the photo fades into dots, the sun comes up 0.25 s later, and the notes 0.15 s after the sun. Only then does the full stop in "yourself." hop: 0.9 s after the picture is in, and never before 1.8 s. So two coral bounces never fire at once.
- **The hop:** every 7 s (was 5.2 s) for as long as the reader stays at the top, then never again once they scroll. The taste review said to keep it hopping until a scroll rather than cap it.
- **A slow photo:** after 3 s the sun and the notes fade in anyway over 0.6 s, in the same order (they used to snap on). The first hop then waits 0.9 s more. The words never wait.
- **Reduced motion:** everything is still and shows at once, and the picture fades in over 0.3 s once drawn instead of popping in.
- **Measured** in a browser at 390 (production build): picture visible 0.6 s, sun 0.8 s, notes 1.0 s, first hop 2.1 s, then every 7 s. A scroll at 5 s stopped the hops. With the photo 5 s late: sun 3.6 s, notes 3.7 s, first hop 4.4 s. Reduced motion: no hops, sun and notes at once.

Shipped Nov 23, 2026, on Franky's yes ("Ship it"), as PR 12.

## Headlines: dots only where they mean something (Nov 23, Franky: "I'm not sure if I like all of them having the dots. I feel like they need some differentiation")
- The halftone texture stays on the hero ("your campus. your people. yourself.", where the photo breaks into dots) and on "made of your people." (the planet of dots).
- "bring your club.", "see you there.", "one campus at a time." and "before you sign up." are solid cream with their coral full stop.
- One selector in `system.css`: `:is(.fys-hero-hl, #fys-people-title) span`. The layout doesn't move, since the padding and its cancelling margin go together.
