# Phone onboarding: how it works today (Oct 23)

## How a phone gets there
- `/onboarding` checks four things in order: are you signed in, have you accepted the Terms, is your school email verified, and have you already finished onboarding. Someone who already finished goes straight to where they were heading (src/app/onboarding/page.tsx:72-105).
- `OnboardingSwitch` measures the screen once, on the first load. Under 900px wide you get the phone flow. Wider screens get the old static computer page inside an iframe (src/app/onboarding/OnboardingSwitch.tsx:34-42, 87-114; src/lib/use-is-mobile.ts:29).
- The choice is locked for the whole session, so rotating a phone or resizing a window can't wipe what the student typed (OnboardingSwitch.tsx:63-69). An iPad held upright counts as a phone.
- Sign-up itself asks only for email, password and the code, plus the club code when the student came in through a club link (src/app/auth/signup/signup-form.tsx:163-167). So a new student always starts onboarding at step 1.

## 1. The six steps, in order
The header stays pinned on every step. It has Back (hidden on step 1), the "vibe." logo, "n of 6", Skip, and a "⋯" button that opens Sign out / Delete account (OnbHeader.tsx:50-87). Every step except step 1 shows a small Otto orb above it (OnboardingMobile.tsx:1100-1114).

1. **Hello.** Shows "i'm otto." Otto says: "think of me as your campus compass. i'll point you to what's loud, what's tonight, and who's on your wavelength — your guide while you build out your home on vibe." The note under it reads "about two minutes: your campus, your profile, a photo, then your people". The button is "Let's go →". Nothing is saved (onb-copy.ts:40-45; OnboardingMobile.tsx:1021-1026).
2. **Campus**, "which campus is yours?". Otto says "your school email says IU. pick your campus. Indianapolis is shared with Purdue students." (Purdue students see the Purdue version.) Each campus is a card. A campus the email names gets the tag "from your school email", and closed campuses say "not open yet". Students with an IU email who picked Indianapolis also see a link to verify a @purdue.edu address instead, which sends a real code (StepCampus.tsx:97-152, 163-337).
   - **Required.** Continue saves it through `POST /api/me/onboarding-step {step:"campus"}` (OnboardingMobile.tsx:571-606).
   - If no university is on record, there are no cards, and Continue just moves on (StepCampus.tsx:84-93).
3. **Profile**, "let's pin down your profile". Otto says: "same fields as your Vibe profile. name and handle are the must-haves. a photo is next."
   - There are nine fields on one screen: Name and Handle (both required, and the handle is checked live as the student types), then Bio, Major (with suggestions), Department, Year, Interests, Skills, and "What are you here for?" (Meeting people / Showing my work / Finding clubs / Just exploring). A note says "you can change anything later" (StepProfile.tsx:58-89, 176-239, 272-445).
   - Continue saves everything (OnboardingMobile.tsx:609-638).
4. **Photo**, "put a face to the name". Otto says "people follow faces…". The buttons are "Choose a photo" and "Skip for now", which become "Continue →" and "Change photo" once a photo is in.
   - **Optional.** The photo saves as soon as it is cropped (StepPhoto.tsx:67-86; OnboardingMobile.tsx:1039-1062).
5. **Follow clubs**, with the line "Their posts show up in your feed. You can join the ones that let you." It lists the campus clubs with Follow + Join, Follow + Request, or Follow only for invite-only clubs. A search box appears when there are more than 8 clubs.
   - **Optional.** Each tap saves right away. The button reads "Continue →" once something is followed, otherwise "Skip for now" (StepClubs.tsx:96, 137-181, 218-227; OnboardingMobile.tsx:1063-1068).
6. **follow a few people**, "students at {campus}… their posts rise to the top of your feed". People are grouped as From your clubs / At {campus} / Same major / Elsewhere / More people. Following updates instantly on screen. When few people are suggested, there is a "Share Vibe" button.
   - **Optional.** "Finish →" sends `POST /api/me/onboarding-complete` (StepPeople.tsx:92-138, 231; OnboardingMobile.tsx:657-752).

Two things run in the background:
- Everything typed is also kept on the device, so a reload or the iOS camera brings the student back to the same step (OnboardingMobile.tsx:396-418).
- **Skip**, on every step including step 1, opens "Skip the rest?". Skip still needs a name and handle (the sheet asks for them if missing) and then completes onboarding with `skip:true`. The campus is saved only if the student actually saw step 2 (OnboardingMobile.tsx:754-833; SkipSheet.tsx:20-25).

## 2. How the computer version differs
Both versions use the same six steps and the same words. A script checks that the copy matches (onb-copy.ts:6-11). The computer page (public/html/onboarding.html) adds:
- a custom cursor (71-77)
- six progress dots (511-519)
- bigger, three-ring Otto orbs (153-177)
- a full "hyperdrive" exit animation that respects reduced motion (442-492)
- a "Get Vibe on your phone" QR code on the people step (2116-2123)

It also makes the logo a link to /campus (506) and has no account menu (1086). The phone version has the "⋯" account sheet, and its exit is a plain 700ms colour fade (OnboardingMobile.tsx:1324-1332).

## 3. Hand-off into the phone tour, and the first screen
- On Finish or Skip, `succeed()` clears the saved draft and sets `vibe_tour_pending=campus`. It plays the 700ms fade, then does a full page load to the address the server returns (OnboardingMobile.tsx:642-655, 132-134).
- That address is `/c/welcome` if a club link is waiting ("Join <club>?" / "Set up <club>?"). Otherwise it is `/campus?welcome=1` (onboarding-complete/route.ts:193-197; c/welcome/page.tsx:19-27; club-link-action.tsx:52).
- On Campus, the tour starts from that flag or from `?welcome=1`. It waits up to 1.5s for the campus name and up to 8s for its first target, then shows three bubbles and ends with "Got it" (use-mobile-tour.ts:205-208, 212, 287, 108-125, 152-153; CampusMobile.tsx:209):
  1. "Everything's one swipe away." (the tabs)
  2. "The campus feed."
  3. "Your turn. Tap + to post…"
- The first screen opens on the **Feed** tab (CampusMobile.tsx:215-220).
- The "turn on notifications" ask is held back for that visit (CampusMobile.tsx:310-322). The "Keep your account after graduation" personal-email card is not held back. It is pinned near the bottom of the screen, right on top of the tour (CampusSwitch.tsx:72-74; PersonalEmail.tsx:258-298; personal-email/route.ts:102).

## 4. Friction and stale steps
- **Four asks before any payoff** (Eli's point). Steps 1-4 are an intro, a campus pick, a nine-field form and a photo. Clubs and people, the actual payoff, come only at steps 5-6.
- **The profile step is the heaviest screen.** Seven of its nine fields are optional, and several lean toward careers and portfolios ("what you're building", Skills, "Showing my work") (StepProfile.tsx:58-89). That conflicts with "careers later".
- **Club-link guests are never told about their club.** Onboarding doesn't know which club brought them. "Join <club>?" only appears after Finish, and on step 5 they may see that club as just another row (route.ts:193-197).
- **The hello note leaves out clubs.** It says "your campus, your profile, a photo, then your people" (onb-copy.ts:43), but step 5 is clubs.
- **The wording is feed-first** on the clubs step, the people step and the tour ("posts show up in your feed", "rise to the top of your feed"; onb-copy.ts:116, 134-136; use-mobile-tour.ts:96-99). Parker said events and club updates matter more than the feed.
- **The tour mentions a tab that's gone.** It says "Feed, Events, Orgs, Chat, and the Map" (use-mobile-tour.ts:112), but the Chat tab was removed for everyone when the new chat went live (CampusMobile.tsx:134, 249-256).
- **"Share Vibe" sends only connectvibe.app** (StepPeople.tsx:141). Until Oct 31, a friend who opens it still needs an access code.
- **Skip on step 1** can finish onboarding before the student has seen the campus question at all (OnbHeader.tsx:67-74; OnboardingMobile.tsx:788).
- **Colours are hard-coded, not tokens** (onb-theme.ts:17-31; OnboardingMobile.tsx:1205-1215). Onboarding is always dark, even for someone using Light mode.
- **Motion breaks the rules.** Animations use fixed timings and curves instead of springs, and the phone version never checks the reduced-motion setting (onb-theme.ts:40; OnboardingMobile.tsx:1151-1170, 1330).
- **Out-of-date code comments** (harmless): onb-theme.ts:7-11, OnboardingSwitch.tsx:10-13, and StepPhoto.tsx:21-23 (which mentions HEIC, while line 113 accepts only JPEG, PNG and WebP).

## 5. What's already in place for a "world grows in" reveal
- **The step engine.** Each step re-mounts as a new section (OnboardingMobile.tsx:1099), and today it enters with a CSS animation (onb-theme.ts:40). That is one place to swap in springs.
- **`Reveal`** (src/lib/motion/Reveal.tsx) uses SPRING_SOFT, rises 8px, and staggers items by `delayIndex` (capped at 6). Campus already uses it on feed cards (CampusMobile.tsx:1731, 2591, 2603, 3608).
- **`MotionRoot`** makes every Motion animation follow the reduce-motion setting (MotionRoot.tsx; layout.tsx:118). That covers reduced motion for free.
- **The three springs** (springs.ts:15-24): SNAPPY for taps, SOFT for things arriving, and POP (the LikeBurst pop) for follow taps.
- **Everything a reveal would show is already in memory at Finish:** name, photo, campus, followed clubs (`clubs.rows/local`) and followed people (OnboardingMobile.tsx:337-363, 949-952). A "your campus, your clubs, your people" assembly could play in the warp slot (1137-1138, 653-654) without adding a step. That fits before the freeze, at about a day of work.
- **The arrival side has hooks too:** Campus knows it was a welcome arrival (`arrivedOnWelcome`, CampusMobile.tsx:310) and whether the tour is running (318). The glow layer (OnboardingMobile.tsx:1082-1085) could grow from step to step using transform and opacity only.
- **Adding a real seventh step is bigger.** It touches "n of 6" (onb-copy.ts:36), `ONBOARDING_TOTAL_STEPS` (draft.ts:64), the one-history-entry-per-step rule (OnboardingMobile.tsx:136-149), and keeping the computer page in sync. That belongs in week 1.
