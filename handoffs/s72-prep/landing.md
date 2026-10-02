# Landing page, demo and portfolio: prep for S72

Read-only research. Nothing was changed. Full notes are in the notes file.

## 1. What the landing page says today

Files: `src/app/page.tsx` renders `src/components/landing/home-landing.tsx`, with `landing-orbit.tsx`, `landing-typewriter.tsx`, and the `.vibe-landing-*` rules in `src/app/globals.css`.

- **Screen 1:** stars, a small Otto orb, typed text: "Hey, welcome to vibe." then "I'm Otto. This is your campus, all in one place." It takes about 5 seconds to finish typing. No button. No picture.
- **Screen 2:** "Pick a form to see how it works · 0/3". Three orbiting labels: PULSE ("Your campus, live."), SCENE ("What's on tonight."), CONNECT ("Find your people."). Each opens a card with an abstract drawing. After all three: "Step inside →".
- **Screen 3:** "IU · Purdue live", "Sign up with your school email. Your campus. Your people. Yourself.", "New here? Create your account →", "Already have an account? Log in →".
- **Footer:** "© CONNECTVIBE. LLC", Terms, Privacy, Guidelines, Support.
- **Link preview:** "Vibe · Your campus. Your people. Yourself." plus the near-black and coral card (`src/lib/og/share-card.tsx`).

**What a stranger does NOT get in 5 seconds:**
1. What Vibe is. The words "social app" never appear.
2. Who it is for. The schools sit on screen 3 in tiny type.
3. Who Otto is. A character is introduced before the product.
4. What you can do. It hides behind made-up labels you have to tap.
5. What it looks like. Zero screenshots, zero video.
6. Where to click. Sign-up is three screens down.
7. Anything for clubs. The clubs-first plan has no door here.
8. That it is free, verified-students-only, and not run by IU or Purdue. The "not affiliated" line the roadmap asks for (`handoffs/roadmap-2026-09-25/marketing.md`) is still missing.

Also: the page still wears the May look (purple sky, three ring colors, hard-coded hex). The share card already uses the new brand, so the preview and the page it opens do not match.

## 2. Proposed structure

Top bar (wordmark, Log in, Sign up) → hero → three things you can do, each with a real screen → 30 second product peek → two doors (students, clubs) → trust points without numbers → final call to action → footer with the "not affiliated" line.

Hero candidates (the tagline stays under the wordmark):
1. **"The social app for the Indianapolis campus."** Sub: "Vibe is where IU Indy and Purdue Indy students find their clubs, their events, and each other. Free with your school email." **Recommended.**
2. **"Your campus has a feed now."** More attitude, needs the same sub line.
3. **"Find your clubs, your events, and each other."** The founders' agreed sentence, trimmed.

Never name Instagram. The roadmap says replacing it is "our goal, never our pitch". No club or student numbers: zero clubs are signed.

Look: the share card grown into a page. Near-black `#0C0B0B`, one coral bloom, soft Fraunces wordmark, Night tokens. One catch: the soft wordmark font is loaded only by the share card, not by `src/app/layout.tsx`.

## 3. The demo

| Option | Effort | Risk | Verdict |
|---|---|---|---|
| (a) Screen-recorded video from the local practice copy | 1.5 to 2 days | Low | **Do this for October** |
| (b) Demo mode inside the real app | 1 to 2 weeks | High | Not now |
| (c) Animated mock from real components | 2 to 4 days | Medium | Skip |

- **(a)** needs a new demo seed. Today's `scripts/local-seed.mjs` holds test names ("Test Invite Club", "Avery Owner") that look fake on camera. Record the phone layout in Night, 25 to 35 seconds, muted, 8 shots: title card, feed, club page, RSVP, club chat, arrange your profile, a DM, end card with the tagline. Script the taps so it can be re-recorded in minutes. The same footage feeds Instagram, the store screenshots and the portfolio. No real faces, no real club names, no school colors (the desktop top bar paints crimson and gold, so film the phone).
- **(b)** would put fake people in production or open a no-login path. Session 55 removed exactly that (`handoffs/2026-09-09-session-55-strip-demo-personas.md`). If you still want a clickable demo site, build it in November as a separate site on its own database.
- **(c)** the real pieces cannot be reused: `FeedCard` is locked inside `src/components/mobile/CampusMobile.tsx` (4,480 lines). Real screenshots do the same job for far less work.
- **Timing:** build the page with stills first (week of Oct 5). Record the final video after the Oct 15 chat freeze. Live before doors open Oct 26.

## 4. Your portfolio site

- **Holds:** the Vibe case study (demo video, what you built, your exact role), 2 to 4 other projects, about, resume, contact.
- **Lives:** a new repo, for example `~/franky-site`, with its own Vercel project and domain. Not in `~/vibe` and not in `~/vibe-marketing`.
- **Stack:** Astro static pages on Vercel. No database, no login, nothing to secure.
- **Stays off it:** the journal, security findings, real student data, your home address, school logos, equity language.
- **When:** after the demo video exists. It should not compete with Android (Oct 9) or launch.
- **Gather first:** what the site is for, a 3 sentence bio, your other projects with screenshots, resume PDF, links, and an OK from James and Rylan on how the team is described.

## 5. Send before the build starts

1. 3 to 5 reference sites. For each: the link, the ONE thing you like, anything you dislike, phone or desktop.
2. Your headline pick.
3. James's lawyer answer on "IU Indy / Purdue Indy" wording.
4. Keep or retire the Otto intro and the rings.
5. Always Night, or follow Auto.
6. Where "Bring your club" goes and who answers.
7. OK to invent the demo cast, plus any photos you have the rights to.
8. Footage you already have.

## Decisions
- Q: Which hero headline goes on the new landing page?
  R: "The social app for the Indianapolis campus." with the sub line "Vibe is where IU Indy and Purdue Indy students find their clubs, their events, and each other. Free with your school email." Keep "Your campus. Your people. Yourself." as the brand line under the wordmark. If you want more attitude, use "Your campus has a feed now." with the same sub line.
- Q: Is the "IU Indy / Purdue Indy" wording OK to print, and can the "not affiliated" line go on the page now?
  R: Add "Vibe is not affiliated with Indiana University or Purdue University." to the footer right away (the roadmap already assigns it to you). Ask James for the lawyer's answer on the school names. Fallback wording: "students on the Indianapolis campus (IU and Purdue)".
- Q: Keep the Otto typewriter intro and the three-ring game (PULSE / SCENE / CONNECT)?
  R: Retire both from the first screens. Keep the Otto orb as a small accent and keep the warp into sign-up. The rings hide the explanation behind a game and use labels nobody outside the team knows.
- Q: Should the landing page always be Night (near-black + coral), or follow Auto like the rest of the app?
  R: Always Night for launch. It matches the share card people tap to get there, and it is one design to polish instead of two. Build it with tokens so a Light version is easy later.
- Q: Which demo do we build for the end-of-October launch: video, in-app demo mode, or animated mock?
  R: The short screen-recorded video from the local practice copy, plus real screenshots from the same stack. About 2 days, low privacy risk, and the footage also serves Instagram, the store screenshots and your portfolio. No demo mode inside the real app before launch.
- Q: Who appears in the demo video?
  R: Invented students and invented clubs in a new demo seed script (local database only). No real club names, since that would imply traction, and no real faces without written OK. The three founders can appear as themselves if they each agree.
- Q: When do we record the final video?
  R: After the Oct 15 chat freeze, in the week of Oct 19 to 23, so it shows the new chat that turns on for everyone Oct 26. Build the new page earlier with still screenshots as placeholders. Record the phone layout only, because the desktop is about to be revamped and its top bar uses school colors.
- Q: Where does the "Bring your club" button go, and who answers?
  R: An email to help@connectvibe.app for now, answered by Rylan since he leads the campus. A real form can come after launch.
- Q: Can the landing page print the "every report reviewed within 24 hours" promise?
  R: Not yet. Say "Report anything in one tap" until James confirms the lawyer's Terms carry the same promise.
- Q: Do you still want a clickable demo site that needs no sign-in?
  R: Yes, but in November and as a separate site (for example demo.connectvibe.app) on its own database that holds only fake data, with writes turned off. Nothing fake ever goes into production. It doubles as the demo for your portfolio.
- Q: Where does your portfolio live, on what stack, and when?
  R: A new separate repo such as ~/franky-site with its own Vercel project and domain, built as Astro static pages. Not in ~/vibe and not in ~/vibe-marketing. Gather the material now and build version 1 in one session after the demo video exists, so it does not compete with Android (Oct 9) or launch.
- Q: What is the portfolio for: internships, recruiters, investors, or freelance clients?
  R: Decide this first, because it changes the first screen. If unsure, lead with "I build Vibe" and the 30 second demo video, which works for all four.