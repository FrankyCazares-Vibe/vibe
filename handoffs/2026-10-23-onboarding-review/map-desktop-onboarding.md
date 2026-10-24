# Computer sign-up and onboarding, as built (Oct 23)

## Which flow you get
The phone/computer choice is made once, by window width: under 900px wide you get the phone flow, otherwise the computer flow. It never switches mid-flow (`src/lib/use-is-mobile.ts:29`, `src/app/onboarding/OnboardingSwitch.tsx:34-41`). On a computer, `/onboarding` loads the old static page in a full-screen frame: `/onboarding/classic` (`OnboardingSwitch.tsx:99-113`), which serves `public/html/onboarding.html` (`src/app/onboarding/classic/route.ts:120-131`). Before that, both routes check, in order: signed in, Terms accepted, school email verified, and onboarding not already done (`src/app/onboarding/page.tsx:72-105`). "Onboarding done" means `otto_answers` is not empty (`src/lib/auth/post-login.ts:7-10`).

## 1. Every screen in order

**A. Sign-up** (`/auth/signup`, or `/c/<code>` for a club link)
- Headline: "Create your account." Under it: "Use your school email, the one ending in .edu. We'll send it a code to confirm you're a student." (`src/app/auth/signup/signup-form.tsx:584-591`)
- A strip shows three steps: "1 Account · 2 Code · 3 Profile" (`:595-610`)
- Access code: only shown when sign-up is closed and the person did not come by a club link (`:221`, `:613-637`)
- School email, required (`:650-670`)
- Password, required (`:683-697`)
- "I'm 13 or older…" checkbox, required (`:699-737`)
- A note: "Good to know: people can see that you viewed their profile or post." (`:740-742`)
- The human check box (`:745`), then "Create account" (`:785-794`)

**B. "Check your email."** An 8-digit code goes to the inbox ("check Junk too") (`:462-472`). The person types it and taps "Confirm with code". It does not submit on its own (`src/components/auth/ConfirmCodeForm.tsx:280`).

**C. Hidden hops.** Confirming goes to `/auth/school-email?account_verified=1` (`src/lib/auth/email-confirm-redirect.ts:15`). A school sign-in email skips that screen and goes straight to `/onboarding` (`src/lib/auth/campus-access.ts:86-90`).

**D. Onboarding, six steps** ("{n} of 6", `public/html/onboarding.html:843`). Skip sits in the header on every step (`:508`). Back is hidden on step 1 (`:2337`).
1. **Hello.** "i'm otto." (`:536`). Otto: "think of me as your campus compass…" (`:848`). Note: "about two minutes: your campus, your profile, a photo, then your people" (`:849`). Button: "Let's go →" (`:850`).
2. **Campus.** "which campus is yours?" (`:853`). Required at Finish (`src/lib/onboarding/finish.ts:145-147`). It is only pre-picked for single-campus email domains (`src/lib/onboarding/boot.ts:86-94`), so @iu.edu and @purdue.edu students must tap one. There is also a "Purdue student with an IU email?" switch panel (`onboarding.html:560-575`). Continue saves the pick (`:2654-2686`).
3. **Profile.** "let's pin down your profile" (`:877`). Name and handle are required (`:880-881`). Seven fields are optional: Bio, Major, Department / school, Year, Interests & projects, Skills, and "What are you here for?" (`:882-888`).
4. **Photo.** "put a face to the name" (`:910`). Buttons: "Choose a photo" or "Skip for now" (`:912-913`).
5. **Follow clubs.** "Follow clubs" (`:919`), "Their posts show up in your feed. You can join the ones that let you." (`:920`). Every discoverable club is listed (`:3252`). The button reads "Skip for now" until the person follows one (`:3283-3288`).
6. **Follow people.** "follow a few people" (`:932`), people suggested by the app (`:3650`). Also a "Get Vibe on your phone" QR code, computer only (`:716-728`, `:2118`). Button: "Finish →" (`:953`).

**Skip sheet:** "Skip the rest?" (`:958`). If no name and handle are saved yet, it asks for both first and offers "Save & skip" (`:960`, `:3969-4058`). On Skip, campus is optional (`src/app/api/me/onboarding-complete/route.ts:129`, `finish.ts:145`).

## 2. Club members' link vs access code
**Access code.** The invite email links to `/auth/signup?access_code=…`, which fills the field (`src/app/auth/signup/page.tsx:52-56`). A non-school email only gets a warning (`signup-form.tsx:672-681`). The code then belongs to the first address used. A typo means "Reply to your invite email" and waiting for a founder (`:537-542`).

**Club members' link (`/c/<code>`).** The same form, with the club's logo on top: "Join <club> on Vibe." plus "Already on Vibe? Sign in", which brings the person back to the link (`src/app/c/club-link-parts.tsx:81-104`, `src/app/c/[code]/page.tsx:117-133`). No access code is asked for (`signup-form.tsx:221`). A non-school email is blocked here (`:330-333`). The club code rides along with the sign-up (`:355`).

**In between:** the six steps are exactly the same. They never mention the club. Step 5 lists every club on campus, not this one (`onboarding.html:3252`).

**At the end:** for a link sign-up, the server answers `next=/c/welcome` (`onboarding-complete/route.ts:195-197`, `src/lib/club-links/redeem.ts:220`). That page asks "Join <club>?" with "Join <club>" or "Not now" (`src/app/c/welcome/page.tsx:62-75`). Join goes to `/orgs/<handle>` (`src/app/api/club-links/redeem/route.ts:88`). Not now goes to `/campus?welcome=1` (`src/app/c/club-link-action.tsx:52`). A setup link asks "Set up <club>?" instead, with "Make me the owner" or "Not me".

## 3. Where it ends
- Finish or Skip calls `POST /api/me/onboarding-complete`, which only accepts version 2 (`route.ts:98-104`). It checks the saved row: a real name, a real handle, and a campus unless the person skipped (`finish.ts:132-151`). A skip saves `otto_answers` as `{skipped:true}` (`finish.ts:236`).
- The page then sets `localStorage.vibe_tour_pending = "campus"` and saves the `vibe_otto_v1` and `vibe_user_v1` caches. It plays the "hyperdrive" animation and goes to the server's `next`, or `/campus?welcome=1` if there is none (`onboarding.html:3822-3831`; `finish.ts:47`).
- On `/campus`, either flag forces the Feed tab (`src/app/campus/campus-home.tsx:576`, `:582`). It starts a four-bubble Otto tour (`:671-736`): "This is you on Vibe." (`:707`), "Your campus pulse." (`:713`), "Switch lanes anytime." (`:718`), "Find your people." The tour runs once (`vibe_campus_tour_seen_v1`, `:675`).
- **Club-link gap:** the tour flag is set even when the person goes to `/c/welcome` and then to the club page. The campus tour fires later, on their first visit to `/campus`, out of context.

## 4. Friction
**Fewest steps before the first real payoff (computer, happy path):**
- Club members' link, where the payoff is the club's Board and events: **5 fields and 11 taps.** That is email, password, code, name and handle, plus the checkbox, Create account, Confirm with code, Let's go, campus, Continue, Continue, Skip photo, Skip clubs, Finish and Join. Add a trip to the inbox and sometimes the human check.
- Access code: **4 fields and 10 taps.** The payoff is the campus feed, and the tour comes on top of it.
- The fastest legal path is header Skip on step 1, then name, handle and "Save & skip". But it leaves the person with **no campus**. `/campus` then shows "Pick your campus to see its clubs, events and map." (`campus-home.tsx:5143-5163`), and creating a club is refused (`src/app/api/orgs/route.ts:681`).

**Stale, from the LinkedIn era:**
- No resume, jobs or projects *steps* remain on the computer. But the profile step still has "Interests & projects" (`onboarding.html:886`), Skills with the placeholder "e.g. Figma, Python, public speaking" (`:1182`), and a bio placeholder "what you're building" (`:1178`).
- The interests placeholder is "Clubs, side projects, topics" (`:1181`), and one "here for" option is "Showing my work" (`:1194`).
- `otto_answers` still saves old agent settings: `platforms`, `voiceSamples`, `leash:'ask'` (`:2538-2546`).
- A code comment in `onboarding-step` says "NOT CALLED BY ANY CLIENT YET" (`src/app/api/me/onboarding-step/route.ts:69`). That is false: `onboarding.html:2516-2525` calls it.

**Copy that contradicts "a campus social app built around clubs":**
- Clubs come 5th of 6, after a 9-field profile and a photo. The Hello note's list doesn't mention clubs at all (`:849`).
- The clubs and people steps both sell the *feed* (`:920`, `:933`). The tour opens on the feed (`campus-home.tsx:713`), and its tabs bubble calls clubs "Orgs" (`:719`). This runs against Parker's "events and club updates beat the feed".
- The tour line "Otto threads the right matches in" (`:728`) sounds like an AI agent, and Otto as an agent waits until after launch.
- The sign-up strip promises 3 steps (`signup-form.tsx:595-610`). Onboarding then starts again at "1 of 6", so it feels like 9 steps. That cuts against Eli's point that the first minutes must pay off before asking for anything.

**Sharp edges:**
- The frame behind onboarding is hard-coded charcoal `#1C1C1E` (`OnboardingSwitch.tsx:111`, `:121`). In Light mode it flashes before the cream page loads.
- The hyperdrive animation blurs with `filter` (`onboarding.html:484-488`). That breaks the "transform and opacity only" motion rule. Reduced motion is respected (`:489-493`).
- "Share Vibe" on step 6 shares the site's home page, not the club's link (`:3805-3816`).

## 5. Already reusable for a gradual reveal
- **Steps that save on their own.** `/api/me/onboarding-step` saves campus or profile separately (`route.ts:63-67`, `:144-145`). A later card can ask one question and save it.
- **The minimum is already defined.** Name and handle are all Skip needs, campus is optional, and the `{skipped:true}` marker exists (`finish.ts:132-151`, `:236`). Onboarding could shrink to identity plus campus with no server change.
- **Server-chosen landing page.** onboarding-complete returns `next` (`route.ts:195-197`). `/c/welcome` is already a one-question page after onboarding, and other first-run questions could use the same hook.
- **The Otto tour engine and its hand-off flag.** `window.OttoTour.start(steps, {onDone, onSkip})` (`campus-home.tsx:700-746`). `vibe_tour_pending` already has legs for campus, profile and network (`src/components/settings/SettingsClient.tsx:174`, `src/components/network/NetworkPageClient.tsx:145-152`), each with a "seen" key. Each leg can be one reveal moment.
- **Existing nudges.** The identity-chip bubble already asks for a photo and banner (`campus-home.tsx:707`), and there is a "Pick your campus" strip (`:5143-5163`). So the photo step, and even the campus step, could move out of onboarding.
- **Saved progress.** The draft in localStorage uses the phone's format (`onboarding.html:776-783`), and the server prefill (`boot.ts:101-111`) lets a later screen start from saved answers.
- **Pieces that fit as cards later.** Club rows use the shared join wording (`onboarding.html:970`, `:1210`), and suggested people and the QR block exist too (`:3650`, `:716-728`). Each can become a card on the campus page or the club page.
