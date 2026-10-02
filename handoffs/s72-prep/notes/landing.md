# S72 prep: landing page revamp, demo, portfolio (research notes)

Date: Fri Oct 2, 2026. Read-only research. Nothing in the repo was changed.

## 0. Sources being read (ticked as I go)
- [x] src/app/page.tsx + what it renders
- [x] layout.tsx metadata, opengraph-image.tsx, twitter-image.tsx, manifest.ts
- [x] auth/login + onboarding entry
- [x] 8 memory notes
- [x] ~/vibe-marketing (listed: brand/, research/, assets/screenshots/, empty content/ campaigns/ outreach/)
- [x] handoffs that mention "landing" (S23, S44, S67, S68, marketing-pass-site-findings 09-25)

## 1. What the landing page is today (read from code, Oct 2)

Files:
- `src/app/page.tsx` (24 lines): renders `<HomeLanding />`. Inside the store apps it redirects to /campus (App Review 2.3.10).
- `src/components/landing/home-landing.tsx` (423 lines): the whole page.
- `src/components/landing/landing-orbit.tsx` (423 lines): the three rings + the three feature cards.
- `src/components/landing/landing-typewriter.tsx` (94 lines): the typing effect.
- CSS: `.vibe-landing-*` classes in `src/app/globals.css`.
- Metadata: `src/app/layout.tsx` (title/description), `src/lib/og/share-card.tsx` (share image), `src/app/manifest.ts`.

### Section by section, exact copy

**A. Hero (full first screen).** Starfield background, small Otto orb, then typed text:
- Desktop: "Hey, welcome to vibe." / "I'm Otto. This is your campus, all in one place."
- Phone: "Hey, welcome to vibe." / "I'm Otto." / "This is your campus, all in one place."
- Typing speed 60 ms per letter + 700 ms pause between lines. The second line has 48 characters, so the full sentence takes about 5 seconds to finish typing. Then a "scroll" cue fades in.
- NO button, NO link, NO picture of the product on the first screen.

**B. Orbit scene (second screen).** Eyebrow: "Pick a form to see how it works · 0/3". Three orbiting buttons labelled PULSE, SCENE, CONNECT around an Otto orb. Tapping one opens a glass card:
- Pulse: "Your campus, live." / "See what's trending, what's loud, what just dropped — the feed updates as your campus moves." (abstract heartbeat line)
- Scene: "What's on tonight." / "Events, club meetings, talks, study sessions. RSVP, see who's going, never miss out." (abstract calendar tiles)
- Connect: "Find your people." / "Classmates, club mates, mutuals. vibe shows you who you actually know on campus." (abstract node graph)
- "← Back to orbit". After all three: eyebrow "All three explored. You're in." and the centre becomes a sun with "Step inside →" (goes to /auth/signup with a warp animation).

**C. Bottom rail (third block).**
- Three progress dots, hint "Tap each form above to keep going · 0/3" (then "Tap the sun to step inside.")
- School chips: "Indiana University · Purdue University" + a "live" pill (from `enabledSchoolSystems()`).
- "Sign up with your school email. Your campus. Your people. Yourself."
- "New here? Create your account →" (/auth/signup)
- "Already have an account? Log in →" (/auth/login)
- Store links "Get Vibe on the App Store / Google Play" only when the env vars are set (they render nothing today unless set).

**D. Footer.** "© CONNECTVIBE. LLC" + Terms, Privacy, Guidelines, Support.

### Metadata and share image
- Title: "Vibe · Your campus. Your people. Yourself." Description: "Your campus. Your people. Yourself." (`src/app/layout.tsx` lines 15-16)
- Share card (`src/lib/og/share-card.tsx`): "vibe." wordmark, the tagline with campus/people in coral, caption "BUILT IN INDIANAPOLIS", near-black + coral bloom. 1200x630.
- Manifest description: same tagline. theme color cream #FAF7F2.

### Things worth knowing about the current build
- The landing is ALWAYS dark (starfield, hard-coded hex colors like #FF5C35, #F5C842, #7B5FE0, rgba cream). It does not use the Night tokens. It is one of the "raw literal" surfaces.
- The landing still uses the old three-color system (coral, yellow, purple rings). The S67 brand direction is near-black + ONE coral bloom + soft Fraunces wordmark. The share card already follows the new direction; the page itself does not. So the link preview and the page it opens do not match.
- There is no picture, screenshot, or video of the real product anywhere on the page.
- The words "clubs", "organizations", "Indianapolis", "students", "free", "social" (as in a social app), "post", "photos", "chat", "profile" do not appear. "club" appears once, inside a card you only see if you tap SCENE.

### Evidence from earlier work
- S44 handoff (`handoffs/2026-05-11-session-44-landing-auth-onboarding-tour-cursor.md`): the current landing was built May 11 as "Otto as tour guide" (typewriter, orbit, sun CTA, warp). It replaced "the network where your AI agent lives". It predates the social-first thesis (Sept 15), the clubs-first plan (Sept 21) and the brand direction (Sept 26).
- Marketing pass (`handoffs/2026-09-25-marketing-pass-site-findings.md` item 10): "Landing hero types for ~9 seconds. For the first seconds the page reads just 'I''. On phones, the first screen is mostly empty dark space above a SCROLL hint." Item 9: the custom cursor dot sits mid-screen on load. Item 12: Fraunces weights 600/800 were faked (layout.tsx now loads 400/700/800/900, so 600 is still faked).
- S68 f10 (`handoffs/2026-09-28-session-68-header-f10-officer-tools.md`, commit `64d9c4b`): tagline + share image + journal private. f10 fixed the link preview, not the page content.
- `~/vibe-marketing/research/product-story.md` "Don't claim yet": planned landing line "Vibe is not affiliated with Indiana University or Purdue University." It isn't on the landing page yet. (Still true today: not in home-landing.tsx.)
- Screenshots from Sept 25 in `~/vibe-marketing/assets/screenshots/landing-*.png` show the page as it is (old tagline in the footer line has since been swapped).

### What a first-time visitor would NOT understand in the first 5 seconds (blunt list)
1. **What Vibe is.** The page never says "social app". "Your campus, all in one place" could be a campus map, a student portal, a Canvas clone, or a housing site.
2. **That it is for them.** No "for IU Indianapolis and Purdue Indianapolis students". "IU · Purdue live" is on the third screen, in tiny type.
3. **Who Otto is.** The first full sentence introduces a character ("I'm Otto") before the product. A stranger does not know if Otto is a person, a bot, or the app's name.
4. **What they can do.** Post? Chat? Find events? Nothing on screen one. The three answers hide behind made-up labels (PULSE, SCENE, CONNECT) that you have to tap.
5. **What it looks like.** No screenshot, no phone frame, no video. They cannot picture the product.
6. **Where to click.** No button on the first screen. In 5 seconds the page has typed "Hey, welcome to vibe." and part of line two. The sign-up link is 3 screens down.
7. **That clubs are a thing.** A club officer sees nothing about club pages, events, member chat, or "free". The clubs-first plan has no door on the page.
8. **Why switch from Instagram / GroupMe.** No reason given. No "verified students only", no "one place for both universities".
9. **Is it real / safe / free.** No "free", no "school email required to post", no "not affiliated with IU or Purdue", no "built in Indianapolis by students".
10. **"Pick a form to see how it works"** reads like a form to fill in. "0/3" reads like a quiz.
11. **Is it an app?** No store badges (correct today, no listing), but also no "works on your phone right now".

## 2. Proposed new structure

### Ground rules I am holding to (each has a source)
- Tagline is decided: "Your campus. Your people. Yourself." (S68). It stays as the brand line. It is NOT the explanation. The hero needs a second, plain line that says what Vibe is.
- "'Replace Instagram' is our goal, never our pitch" (roadmap v8 ch. 2, quoted in `~/vibe-marketing/research/product-story.md`). So the landing never names Instagram.
- Agreed one-sentence story: "Vibe is where IU Indy and Purdue Indy students find their clubs, their events, and each other, all in one place." (`handoffs/roadmap-2026-09-25/marketing.md` section 1). "IU Indy / Purdue Indy" wording is still waiting on the lawyer (marked UNVERIFIED there).
- No IU or Purdue logos, colors, mascots or building photos on marketing surfaces (same file). The landing must carry: "Vibe is not affiliated with Indiana University or Purdue University." This is an open Franky task from the roadmap (marketing.md line 137) and is not on the page yet.
- Only claim what is live. Zero clubs signed, about 20 accounts. No numbers, no "join 500 students".
- Brand: near-black #0C0B0B, one coral bloom from a corner, soft Fraunces wordmark with coral dot, small letter-spaced caption with a coral dot, italic Fraunces tagline with the nouns in coral (`reference_design_canvas.md`). The share card (`src/lib/og/share-card.tsx`) already looks like this. The landing should look like the share card grown into a page.

### Hero line candidates (pick one headline; the tagline sits under the wordmark either way)
1. **"The social app for the Indianapolis campus."**
   Sub: "Vibe is where IU Indy and Purdue Indy students find their clubs, their events, and each other. Free with your school email."
   Why: says what it is (social app) and for whom in 7 words. Safest wording. RECOMMENDED.
2. **"Your campus has a feed now."**
   Sub: "Clubs, events and people at IU Indy and Purdue Indy, in one place. Only verified students can post."
   Why: the coolest of the three and hints at "social" without naming a rival. Needs the sub line to be clear.
3. **"Find your clubs, your events, and each other."**
   Sub: "One app for IU Indy and Purdue Indy students in Indianapolis. Free with your school email."
   Why: it is the founders' agreed sentence, trimmed. Leads with clubs, which is what will be on the app on day one.

Recommendation: headline 1 with sub 1. If Franky wants more attitude, headline 2 with sub 1.
If the lawyer says no to "IU Indy / Purdue Indy", swap to "students on the Indianapolis campus (IU and Purdue)".

### Page order (top to bottom)
0. **Top bar.** "vibe." wordmark left. Right: "Log in" (text) and "Sign up" (coral pill). Always visible. Fixes "no button on screen one".
1. **Hero.** Caption "● BUILT IN INDIANAPOLIS". Headline. Sub line. Two buttons: "Create your account" (coral) and "I run a club" (outline, jumps to section 4). On desktop a phone frame sits to the right showing the product peek; on phones it sits right under the buttons. Text is there at first paint. No typing delay.
2. **What you can do (3 points, each with a real screen).** Reuse the three headlines that already exist, in plain words:
   - "What's on tonight." Events from your clubs. RSVP and add it to your calendar.
   - "Follow your clubs." Their posts, events and member chat in one place.
   - "Find your people." Post, follow and message verified students from both universities.
   (Drop the labels PULSE / SCENE / CONNECT. They are internal names.)
3. **Product peek.** The 25 to 35 second demo video, muted, looping, in a phone frame, with a "Watch the 30 second tour" label. Section 3 below compares the options.
4. **Two doors: students and clubs.**
   - Students: "Sign up with a personal email, verify your school email, pick your campus. About two minutes." Button: Create your account.
   - Clubs: "A page for your club, events with RSVPs, and a member chat. Free. Nobody has to quit Instagram. We build your page with you." Button: "Bring your club" (see decision D4 on where it goes).
5. **Why trust it (proof without numbers).**
   - "One campus, two universities." IU Indy and Purdue Indy students share Indianapolis on Vibe.
   - "Only verified students can post, comment or message."
   - "Counts are public, names are private."
   - "Report anything in one tap." (Check the 24 hour promise with James before printing it here. The Terms still say no guarantee until the lawyer's version is live.)
   - "Built by students in Indianapolis."
   - Later, when real: club logos with written OK ("On Vibe now: ..."). Not before.
6. **Final call to action.** Tagline in the italic device. "Create your account" + "Log in". Store badges appear here only when the listings exist (the env-gated `StoreLinks` already does this).
7. **Footer.** "© CONNECTVIBE. LLC", Terms, Privacy, Guidelines, Support, and the "not affiliated" line.

### What happens to Otto and the orbit
- Recommendation: Otto stops being the narrator of the first screen. Keep the orb as a small accent (for example next to "What's on tonight") and keep the warp transition into sign-up, since both are built and liked.
- Retire the "tap three rings to unlock" gate. It hides the explanation behind a game.
- The orbit code (`landing-orbit.tsx`) can be kept in git history. Decision D2.

### Build notes for the next session (facts found in code)
- The landing's colors are hard-coded hex and a purple gradient (`globals.css` line 543 on, 104 `.vibe-landing` rules). A revamp should use the Night tokens. The tokens live on `:root[data-theme="dark"]`, so "landing is always dark" needs a small scoped token block, or the landing simply follows Auto like the rest of the app (cream + bloom in Light). Decision D3.
- The soft wordmark font is NOT loaded on the site. `src/app/layout.tsx` loads Fraunces 400/700/800/900 without the SOFT axis; only the share card fetches `Fraunces:opsz,wght,SOFT,WONK@144,900,100,0`. The new hero wordmark needs that axis (load it for the landing only, so the app's font download does not grow).
- `/` is `force-dynamic` and never cached (`src/app/page.tsx`), because of the store-app redirect. Fine for now. A video must be lazy loaded so it never slows first paint.
- `HomeLanding` is one big client component. The new page can be mostly server-rendered text (better for Google and for speed) with small client islands (video, warp).
- AGENTS.md rule: read `node_modules/next/dist/docs/` before writing Next code. This Next version differs from the usual.
- Browser pass at 375px as a signed-out visitor is required (memory `feedback_browser_pass.md`). Commit and push so Franky can test on his phone (memory `feedback_mobile_push.md`).

## 3. The demo: three options compared

### Facts that shape the choice
- A safe practice copy already exists: local Supabase in Docker + `scripts/local-seed.mjs` (S63 handoff section 5). The seed refuses to run unless the database host is 127.0.0.1 or localhost. Proof you are on the local copy: `http://localhost:3000/api/users/avery_owner/bootstrap` returns 200 (that handle exists only locally).
- BUT the current seed is test data, not demo data: "Avery Owner", "Blake Student", "Test Invite Club", "Chat Seed Club", "SAE (local copy)". It would look fake on camera. A separate demo seed is needed.
- The anonymous demo was deliberately REMOVED in S55 (`handoffs/2026-09-09-session-55-strip-demo-personas.md`): six prototype pages deleted, fake personas (Maya, Kwame, Priya...) stripped, because fake data was leaking into real students' screens ("every real owner was seeing MC"). `src/proxy.ts` says "Since S55 there is no anonymous demo". Memory `project_org_model.md`: it says never to seed fake orgs, content must be real.
- The real UI pieces are not reusable today. `FeedCard` is a private function inside `src/components/mobile/CampusMobile.tsx` (4,480 lines) with live like/repost/save calls. `src/app/campus/campus-home.tsx` is 17,286 lines. Nothing is exported as a clean "post card".
- Dates: no chat changes after Thu Oct 15; new chat on for everyone Mon Oct 26; launch night Thu Oct 29; launch Sat Oct 31. The desktop revamp is next, so desktop screens will change.
- `public/` has no video today (1.4 MB total). No Content-Security-Policy header blocks video.

### (a) Short screen-recorded video, from the local seeded stack
- How: (1) write `scripts/demo-seed.mjs` (same local-only safety gate as local-seed): 6 to 8 invented students, 3 invented clubs, about 12 posts with photos Franky has the rights to, 4 upcoming events, a club chat with a poll, one DM thread. (2) `supabase db reset`, run the demo seed, start the dev server on the local stack, run the proof curl. (3) Record a 390x844 phone-size window in Night mode. Best: a small Playwright script that plays the taps and records video, so it can be re-recorded in minutes when the UI changes. Fallback: record by hand with Cmd+Shift+5.
- Length: 25 to 35 seconds for the landing loop (muted, on-screen captions). A 45 to 60 second vertical cut for Instagram and TikTok from the same footage.
- Shots (8, about 30 s):
  1. Title card: "vibe." + the headline (1.5 s)
  2. Campus feed scrolls: student posts, a club post, the rolling "today." strip (4 s)
  3. Tap a club: club page with logo, Follow and Join (4 s)
  4. Events: tap Going, add it to the calendar (4 s). "Your week" is part of the new chat, so only show it on or after Oct 26.
  5. Club chat: the Lounge with an event card and a poll (4 s). Only if the page goes live on or after Oct 26, when the new chat is on for everyone. Before that, show the current chat.
  6. Profile: move a widget, flip to Night (4 s). Customization is the hook.
  7. Messages: a DM with a photo and a reaction (3 s)
  8. End card: "Your campus. Your people. Yourself." + connectvibe.app + "Free with your school email" (3 s)
- File: MP4 (H.264) + a poster image, under about 3 MB at 720 px wide, `muted playsInline loop`, lazy loaded so it never slows the first paint. Start in `public/`; move to R2 if it grows.
- Effort: about 1.5 to 2 days (demo seed half a day, script and record half a day, edit and embed half a day).
- Privacy risk: LOW. No real student data can appear if the proof step passes. Rules: no real faces without written OK, no real club names (would imply traction), no IU or Purdue logos or colors. Record the PHONE layout: the desktop top bar paints IU crimson and Purdue gold, which the marketing rules say not to use.
- Maintenance: re-record when the UI changes. Cheap if scripted.
- Load time: one small lazy file. Fine.
- Bonus: the same seeded stack gives the 3 feature screenshots for the landing, the store screenshots the roadmap asks Franky to plan, the social teasers, and the portfolio video.

### (b) Interactive "demo mode" inside the real app, fake data, no sign-in
- What it takes: every API route answers 401 to signed-out visitors, and the proxy sends app pages to login. A demo needs either a shared demo account with fake people and clubs living in the PRODUCTION database, or a fake data layer under every screen.
- Effort: 1 to 2 weeks, plus upkeep on every feature after.
- Privacy and safety risk: HIGH. Fake accounts in production break "no fake accounts, ever" and the S55 clean-up. A public no-login path is a new attack surface days after the S71 key leak. Visitors acting as a shared account can post or message real students unless every write is blocked.
- Recommendation: NOT for October. If Franky still wants a clickable demo site later, build it as a SEPARATE deployment (for example demo.connectvibe.app) on its own Supabase project that holds only the demo seed, with writes switched off. Nothing fake ever touches production. About 3 to 5 days, in November. That is also the best "demo site" for the portfolio.

### (c) Scripted animated mock on the landing, built from the real components
- Reality: the real components cannot be dropped in (see facts). Either pull FeedCard and friends out of launch-critical files (risky before Oct 31) or draw look-alike mini components with the same tokens (they drift from the real app and can show things that are not live).
- Effort: 2 to 4 days for a good one. Load time: best of the three (no video bytes, sharp at any size). Privacy: none (hand-written fake data).
- Risk: MEDIUM. Drift, and it eats polish time.
- Recommendation: later, if at all. For October, real screenshots in the 3-point section do the same job for a tenth of the work.

### Recommendation for the end-of-October launch
1. Do (a): one demo seed, one scripted phone recording, plus stills from the same stack.
2. Build the new landing structure first with stills as placeholders (week of Oct 5 to 9). Record the final video after the Oct 15 chat freeze (Oct 19 to 23). Live before doors open Mon Oct 26.
3. Park (b) as a separate fake-data deployment for November. Skip (c).

(Checked: the phone profile has an "Arrange your profile." sheet, `ArrangeProfileSheet` in `src/components/mobile/ProfileMobile.tsx`, so shot 6 is recordable on a phone.)

## 4. Franky's personal portfolio site

### What it should hold
1. **Top.** Name, one line ("I build Vibe, a social app for college students in Indianapolis."), three links: email, GitHub, LinkedIn.
2. **Vibe case study (the centrepiece).**
   - The 30 second demo video from section 3. Later, a link to the separate demo site.
   - What it is, in two sentences. Link to connectvibe.app.
   - His role, in exact words: he builds the app; James runs the paperwork; Rylan leads the campus. No equity language (memory `project_launch_plan.md`, `feedback_founder_docs.md`).
   - What he built, as 5 or 6 short cards with a screenshot each: the feed and posts, club pages with three join modes, events and RSVPs, DMs and club chat, the customizable profile + Night mode, the iPhone and Android shells.
   - How he works: plans, waves, audits before launches. Short and true.
   - True numbers only (for example sessions worked, tests passing). No user or club counts.
3. **Other work.** 2 to 4 projects, each with one line, one picture or clip, one link. Folder names on this Mac that may be candidates (names only, I did not open them): `NetBeansProjects/TaskManagementApp`, `garageapp`, `tomsautoadventurefrankycazares`, `StudentInfoGUI`; `PycharmProjects/DataSciAssignment3`. Franky picks.
4. **About + contact + resume PDF.**

### What must stay OFF it
- The product journal (private since S68) and anything from the handoffs.
- Security findings (the S71 key leak has an open disclosure decision).
- Any real student's name, face, handle or message. Demo seed footage only.
- His home address (it is the LLC's principal office; marketing CLAUDE.md says never write it anywhere).
- IU or Purdue logos.

### Where it lives
- A new, separate repo and folder, for example `~/franky-site`, with its own GitHub repo and its own Vercel project. NOT inside `~/vibe` (public product repo, deploys to production, belongs to the LLC's product) and NOT inside `~/vibe-marketing` (shared with James and Rylan).
- Its own domain (Franky buys it himself). The demo video file is copied in; the site never reads from the Vibe repo or database.

### Stack (simple)
- Recommended: **Astro, static pages, plain CSS, hosted on Vercel.** No database, no login, nothing to secure, free tier, loads fast. Video as a small MP4.
- Fallback if he wants one toolchain: Next.js like Vibe. More moving parts than a 3-page site needs.
- Give it its own look. It should not wear Vibe's brand; Vibe is one project shown inside it.

### When
- Not before the launch work. Franky's own priorities are the native apps (Android due Oct 9) and the Oct 31 launch.
- Recommended: gather the material now, build version 1 in one session right after the demo video exists (late October or the first week of November).

### What he needs to gather first
- What the site is FOR: internships, recruiters, investors, or freelance clients. This changes the first screen.
- Name to use (Franky or Francisco) and the domain.
- A 3 sentence bio, his major and year, a photo (or decide on none).
- 2 to 4 other projects: one line each, screenshots or a screen recording, a link or repo.
- Resume PDF. GitHub and LinkedIn links. The email he wants public.
- A quick OK from James and Rylan on how the team and Vibe are described.

## 5. What Franky should send before the build starts
1. **3 to 5 reference sites.** For each: the link; the ONE thing he likes (layout, motion, type, color, how they show the product, the scroll); anything he dislikes; whether he is judging the phone or the desktop view. One "too much" example helps too.
2. **Headline pick:** 1, 2, 3, or his own words (section 2).
3. **School wording:** James's answer from the lawyer on "IU Indy / Purdue Indy", and the OK for the "not affiliated" line.
4. **Otto and the orbit:** keep as an accent, or retire.
5. **Always Night, or follow Auto** (cream in Light).
6. **The clubs button:** where "Bring your club" goes and who answers (Rylan).
7. **Demo cast:** OK to invent students and clubs for the demo seed; any photos he has the rights to; whether the three founders want to appear as themselves.
8. **Footage he already has** (phone recordings, founders' clips) and whether the social cut gets his voice or music.
9. **The 24 hour report promise:** OK to print on the landing? (James.)
10. **For the portfolio:** the list in section 4.

## 6. Suggested order for the next sessions
1. Franky sends references + picks (items 1 to 6). 
2. Session A (about 1 day): new landing structure with real stills, Night tokens, top bar with Sign up, the "not affiliated" line, clubs door. Browser pass at 375px signed out. Push.
3. Session B (half a day): `scripts/demo-seed.mjs` + the Playwright recording script. Stills replace placeholders.
4. After Oct 15 (chat freeze): record the final video, embed it, cut the social versions into `~/vibe-marketing/content/`.
5. November: portfolio v1 in its own repo; optional separate demo site.

## Sources read (all ticked)
- [x] src/app/page.tsx, src/components/landing/*.tsx, globals.css `.vibe-landing-*`
- [x] src/app/layout.tsx, src/lib/og/share-card.tsx, opengraph-image.tsx, twitter-image.tsx, manifest.ts, robots.ts, src/app/get/route.ts
- [x] src/app/auth/login + signup (headlines), auth/layout.tsx, onboarding entry (listed)
- [x] 8 memory notes + project_team.md
- [x] ~/vibe-marketing: README, CLAUDE.md, brand/brand-guide.md, brand/voice-and-copy.md, research/product-story.md, principles-and-positioning.md, feature-inventory.md (demo script), founder-questions.md, assets/screenshots (README + 2 landing images). content/, campaigns/, outreach/ are empty.
- [x] handoffs: S44, S55, S63, S68, S71, marketing-pass-site-findings (09-25), roadmap-2026-09-25/marketing.md
- Note: `~/vibe-marketing/brand/brand-guide.md` is stale on one point. It says "The app is light only". Night mode shipped Sept 29.
