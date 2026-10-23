# First-run plan: attack (Fri Oct 23)

The direction is right. Most of the citations check out. But the headline piece, the "quiet arrival" (item 5), has three real holes. There are also smaller slips in the rest of the list. Problems are listed most serious first.

## Problems

**1. The quiet arrival flashes on the most common launch-night path.**
- *Claim:* the hold is "worked out on every load" from "is the tour about to run?", so nothing new is stored.
- *True:* the computer's Campus page is built on the server first (CampusSwitch.tsx:9-13, 85). The server can't read the browser's `vibe_tour_pending` flag. A club-link guest who taps Join goes to the club page (club-link-action.tsx:52). So their first Campus visit has only that flag, with no `?welcome=1`. The sides paint, vanish once the page wakes up, then grow back. If the hold is read during the first render instead, the server and browser disagree about the page.
- *Fix:* decide the hold before the first paint. Add a tiny script with the page's nonce, next to the theme script (layout.tsx:99). On /campus, when the pending flag is "campus" (or `?welcome=1` and the tour is not yet seen), it marks the page. CSS holds the columns while the mark is there, and the page removes the mark on release. Add about 1.5 h to item 5.

**2. Held columns can be clicked, even though nobody can see them.**
- *Claim:* "Nothing hidden can be clicked, because the tour's dim layer takes every click (_otto-tour.js:27)."
- *True:* the dim layer only exists once `OttoTour.start` runs (_otto-tour.js:207-209). Campus calls that only after the script loads and the campus lookup finishes, which can take up to 1.5 s (campus-home.tsx:686-692). Until then, invisible club rows, "See all" (YourClubsPanel.tsx:45) and Tonight's events can be clicked or reached with the Tab key.
- *Fix:* hold the columns with `visibility:hidden` or `inert`. Both keep the column's size, so the tour engine still finds it (_otto-tour.js:139-142). Turn it off at the reveal.

**3. At 1100-1399px (most student laptops), the clubs beat contradicts the screen.**
- *True:* in this width range the right column holds a folded "Your clubs" strip above Tonight (FeedSideLayout.tsx:48-59; feed-side.css:161-169).
  - Beat 12 grows both of them as "Tonight".
  - Beat 13 then says "Find your clubs… Orgs has every club", while a club-link guest's club is already showing in that strip.
  - Parker's "end on clubs" is lost for most laptops.
- *Fix:* hold the strip and the Tonight panel separately. Beat 12 points at the Tonight panel. Beat 13 points at `.tonight-fold` when it has size (it is empty with no clubs, YourClubsPanel.tsx:130); otherwise it points at the tabs.

**4. Cutting "Showing my work" changes what gets saved, and breaks a test.**
- *Claim:* "What gets saved doesn't change."
- *True:* the phone's option list (StepProfile.tsx:58-63) builds the allowed values (OnboardingMobile.tsx:115). Those values filter the restored profile and the draft (:165, :211). So a saved "showing-work" would be silently dropped on the next profile save. looking-for.test.ts:94-101 also requires that value and its label in both onboardings.
- *Fix:* keep the option before freeze. It sits in the closed "Add more about you" section anyway. Retire it in week 1 across looking-for.ts, both onboardings and profile.html.

**5. The 16 h estimate assumes the weekend belongs to this plan. It doesn't.**
- *True:* the same session also owes, by Tue Oct 27 (handoffs/2026-10-23-session-81-task-order-hq-onboarding.md:56-61):
  - event covers
  - pointing desktop Messages' "Manage club" at Club tools
  - the upload sweep
  - the sentinels on Oct 27, which eat "Tuesday is for fixes"

  The CS club and SAE links go out this weekend (:47-50), so real guests will onboard while these deploys land. With fixes 1-3, item 5 is about 6-7 h, not 4. Item 8's club-link path needs a fresh account and a real link on production for each run.
- *Fix:* ship items 1, 3, 4 and 6 as one deploy by Saturday night. Ship item 5 as its own deploy on Monday, with an off switch. Franky reruns his live sign-up test after the onboarding deploy, because his weekend test (:48-49) covers today's flow.

**6. Hiding Skip on steps 1-2 leaves the computer with no way out.**
- *True:* the computer's onboarding header has only Back, the logo and Skip (onboarding.html:504-509), and no sign-out anywhere. The logo goes to /campus, which sends the person straight back to onboarding (campus-access.ts:52-54). The phone keeps Sign out in its ⋯ sheet (OnbHeader.tsx:76-87).
  - Someone signed into the wrong account on the Demo Day booth laptop is stuck.
  - So is someone whose campus save keeps failing on the rate limit, which is shared with profile saves (OnboardingMobile.tsx:583-584).
- *Fix:* on the computer, put a quiet "Sign out" where Skip was on steps 1-2.

**7. The reason for the personal-email fix is wrong. The fix itself is fine.**
- *Claim:* the card "sits on top of the tour."
- *True:* the card sits at layer 9980 (PersonalEmail.tsx:284), under the tour's 9990 dim (_otto-tour.js:22, 27). So it is dimmed, not on top. It sits right beside the orb (bottom 24, right 96; :286-287), where beat 10's bubble opens above the orb (_otto-tour.js:165-167), so it crowds that bubble.
- *Fix:* keep item 7. Read `?welcome=1` once when the card loads, as the phone already does (CampusMobile.tsx:310), because the tour removes it from the address.

**8. The feed step scrolls the page away from the side columns.**
- *True:* `#campus-feed` is the whole feed column (campus-home.tsx:7301-7313). The engine centres it on screen (_otto-tour.js:233-234), which scrolls to the middle of the feed. Beats 12-13 then point at columns that stick to the top of the screen while you scroll (feed-side.css:20-23), and the engine re-runs the step on every scroll (:212, 260-261). Expect the page to jump around during beat 12.
- *Fix:* point beat 11 at the feed's first screen, not the whole column, so the page stays at the top. Add this to the browser pass.

**9. A new animated box inside the columns can break Tonight's height limit.**
- *True:* the columns are vertical stacks with a 12px gap and a height limit that keeps Tonight above the orb (feed-side.css:20-23, 29, 37-39).
- *Fix:* animate the columns' existing children. Or give the wrapper `display:flex; flex-direction:column; gap:12px; min-height:0`. Test at 1440 and 1200 with a short window.

**10. Copy.**
- "who's around" (hello, and the people step) reads like seeing who is nearby, which Vibe doesn't do. Use "who's here" or "students at {campus}".
- The plan leaves two lines on the old feed wording, "posts land in your feed" (onb-copy.ts:118-121).
- It drops the "IU and Purdue both" line for Indianapolis (:134-135).
- P2's "{club} sent you" is wrong for a setup link (kind "setup", club-links/store.ts:272-274; c/welcome/page.tsx:62-68). Officers need their own line.

**11. Small slips.**
- With reduced motion, Reveal keeps the fade and only drops the rise (Reveal.tsx:15-17). That is fine, but the sides don't "simply appear".
- Week 1's "cut the old agent settings" must keep `otto_answers` non-empty. Otherwise onboarding never counts as done (onboarding.html:2537-2545; OnboardingMobile.tsx:117-121).
- Week 1's day-7 and day-30 count also needs a Privacy Policy check, not just a database OK.

## Checked and true

- **Shared laptop:** the computer and the phone really do follow different rules (use-mobile-tour.ts:205-209 vs campus-home.tsx:675-680). Giving the computer the phone's rule fixes it.
- **Tour engine:**
  - A missing target puts the bubble mid-screen (_otto-tour.js:238-243).
  - The existing Otto hide switch uses display:none (globals.css:2451).
  - The phone's "tour running" check starts true for everyone, so the + would flash (CampusMobile.tsx:1404).
- **Skip with no campus:** Skip can finish without a campus (OnboardingMobile.tsx:786-792), which leads to the "Pick your campus" strip (campus-home.tsx:5143-5163) and the refused club creation (api/orgs/route.ts:681).
- **Live growth:** Your clubs re-reads every time you come back to the Feed (campus-home.tsx:6841; use-your-clubs.ts:62-71).
- **Arrivals:** the routes and pending flag are as described (onboarding.html:3824; finish.ts:47).
- **Phone Otto:** the phone uses the Otto tab, not a floating Otto (MobileTabBar.tsx:189). The tab bar's layer (9988) sits under the dim, so the spotlight works.
- **Database:** nothing in P1 or P2 changes the production database. P2 only reads the existing `club_link_pending` (store.ts:280).

## Verdict

**Needs the listed fixes.** The direction is right and fits the binding facts. Fix 1-4 before building item 5. Split the deploys (5), and only then call it ship-ready.
