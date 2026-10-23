# First run: the recommendation (director's pass, Fri Oct 23)

## 1. In 30 seconds

Start from the "ship by freeze" plan and add the best ideas from the other two. Onboarding keeps its six screens until week 1, but gets lighter:
- Otto's hello mentions clubs.
- The profile screen asks only for a name and a handle.
- Nobody can skip past the campus pick.

The big change is the first visit to Campus. On a computer, the page arrives quiet: the feed, the menus and Otto, with both sides empty. Otto introduces himself, then the feed. Then the right side grows in (what's on tonight), then the left side (your clubs). The last button says "Show me clubs".

Phones tell the same story in their own shape: the Otto tab, the feed, then the tabs. After that, the world grows from real actions: follow a club and it shows up in Your clubs.

It is about 16 hours of work before the freeze. Reordering the onboarding steps and Otto's checklist wait for week 1.

## 2. Scores (1-10)

| | Honours the brief | Belonging fast | Fits the freeze | Phones | Low risk | **Total** |
|---|---|---|---|---|---|---|
| Otto first, world grows | 9 | 8 | 6 | 7 | 6 | **36** |
| Belonging first | 6 | 9 | 5 | 8 | 7 | **35** |
| Ship by freeze | 8 | 6 | 9 | 7 | 7 | **37** |

- **Otto first** fits the brief best. But before the freeze it also moves the tour code and passes the club's name into onboarding.
- **Belonging first** has the best club logic: the pinned club, live growth, and the officers-see-"Member" catch (onboarding-prefill.ts:474). But its sides grow when their data loads, before Otto names them. It also changes Tonight's tested empty state before the freeze.
- **Ship by freeze** is the only plan with a cut order and a list of ways out. It is weakest on belonging: clubs stay at step 5, and the tour ends on Tonight.
  - It hides the Otto orb. The existing hide switch uses display:none (globals.css:2451), which would leave the tour with nothing to point at.
  - It hides the phone's +. The check it would use starts as "tour running" for everyone (CampusMobile.tsx:1404), so the + would flash for returning people.

**A correction to all three designs.** They say the second person on a shared laptop never gets the tour. That is true only on a computer.
- The phone starts the tour whenever the pending flag says so, even if it was seen before (use-mobile-tour.ts:205-209).
- The computer checks "seen" first and drops the flag (campus-home.tsx:675-680).
- Giving the computer the phone's rule fixes the Demo Day booth laptop.

## 3. Storyboard

**Onboarding, both devices.** All six steps stay for now; their numbers are wired into the saved draft (draft.ts:56-64) and the back-button history (OnboardingMobile.tsx:136-149).

1. **Sign-up and code.** No change.
2. **Hello (step 1).** Otto already comes first (onboarding.html:536; OnboardingMobile.tsx:1100-1108).
   - Otto: "i keep an eye on campus: what's on tonight, which clubs are meeting, who's around. a few quick things and it's yours."
   - Note: "about two minutes: your campus, your name, a photo, then your clubs and people." Today's note leaves clubs out (onb-copy.ts:43).
   - Club members' link (P2): "{club} sent you. a few quick things, then i'll take you to them." The club name goes in as plain text.
3. **Campus (step 2).** Same words. Skip is hidden on steps 1 and 2.
   - Today Skip on step 1 can finish with no campus (OnbHeader.tsx:67-74).
   - That person lands on "Pick your campus" (campus-home.tsx:5143-5163) and can't create a club (api/orgs/route.ts:681).
4. **Name (step 3).** "what should your clubs call you?" Otto: "just a name and a handle. the rest can wait."
   - The seven optional fields fold under a closed row, "Add more about you (optional)", and fade in when it opens.
   - "what you're building" (StepProfile.tsx:77) and "Showing my work" (:60) go.
   - What gets saved doesn't change (draft.ts:78-89).
5. **Photo (step 4).** Same screen. Otto: "people follow faces. add one now or later, your call."
6. **Clubs (step 5).** "find your clubs" / "Follow a club to get its updates and events. Join the ones that let you." This replaces "Their posts show up in your feed" (onb-copy.ts:116).
7. **People (step 6).** Otto: "students at {campus}. follow a few so you know who's around." This replaces the feed wording (onb-copy.ts:134-137).
8. **Exit.** Same routes (onboarding-complete/route.ts:195-197). In P2, the computer's exit drops its blur, which breaks the motion rule (onboarding.html:484-488).

**Campus, first visit, computer.** Everything here happens only when the tour is about to run.

9. **A quiet arrival.** The top bar, left menu, feed and Otto orb show as normal. Both side columns are held: invisible and 8px low, but still taking their space, so the feed never moves (FeedSideLayout.tsx:33-58). Nothing hidden can be clicked, because the tour's dim layer takes every click (_otto-tour.js:27).
10. **Otto.** The first bubble sits on the orb (`#otto-corner`, OttoCorner.tsx:187). The orb is never hidden, because it also holds Messages.
    - "Hi again. I'm **Otto**." / "I live down here. Click me for what's new and your messages."
11. **The feed** (Next).
    - "This is {campus}, **live**." / "What students and clubs here are posting. Clubs and people you follow come first."
    - That matches how the feed ranks posts (api/feed/route.ts:133-150).
12. **The right side grows: Tonight** (Next, windows 1100px and wider). The column's contents fade in and rise 8px on SPRING_SOFT as the bubble appears.
    - "What's on **tonight**." / "School and club events at {campus}, tonight and this week. Open one for the details."
13. **The left side grows: Your clubs** (Next, windows 1400px and wider). It rises in the same way.
    - "Your **clubs**." / "Every club you follow or join posts its newest Board update here."
    - A newcomer sees the existing empty line and the "Find clubs on campus" button (YourClubsPanel.tsx:54-67).
    - Below 1400px the column is hidden (feed-side.css:161-163). The bubble then points at the tabs: "Find your **clubs**." / "Orgs has every club at {campus}. Follow one and its updates come to you."
    - The last button reads **"Show me clubs"** and opens the Orgs tab. Skip tour stays.
    - A step whose target has no size is dropped before the tour starts. Today a missing target floats the bubble mid-screen (_otto-tour.js:238-243).
    - Bubble text is treated as HTML. Only the campus name from our own table goes in it (campus-home.tsx:694-696), never a club name.

**Campus, first visit, phone.** No floating Otto.

14. **Three bubbles.**
    - **Otto tab** (MobileTabBar.tsx:189): "Hi again. I'm **Otto**." / "This tab is me: what's coming up and what's new for you. Messages is right next door."
    - **The feed:** the same words as beat 11.
    - **The tabs:** "Clubs and events, **one swipe over**." / "Feed, Events, Orgs and Map. Orgs has every club on campus." The button reads "Got it".
    - **Gone:** the dead "Chat" tab name (use-mobile-tour.ts:112) and the "Your turn… post" ask (:120-124).
    - **Already in place:**
      - Posts and the Tonight card rise in (Reveal.tsx:19-45).
      - The push ask waits for the whole welcome visit (CampusMobile.tsx:310-325).
    - **New:** the personal-email card waits for that visit too, on both devices. Today it sits on top of the tour (CampusSwitch.tsx:75, 86; PersonalEmail.tsx:461).

**After the tour**

15. **The world grows from real actions.**
    - **Already true:** a club followed on the Orgs tab appears in Your clubs back on the Feed. The side columns exist only on the Feed tab (campus-home.tsx:6841), and they read the list each time they appear (use-your-clubs.ts:60-69).
    - **Week 1:**
      - The new club row pops in once (SPRING_POP).
      - My Calendar grows its grid after the first RSVP (LeftNav.tsx:638-656).
      - Otto asks for a photo after the first follow.

## 4. Onboarding changes

**Keep**
- **Hello as the first screen.** It is already Otto first.
- **Campus, required.** No campus means no clubs or events.
- **Clubs and people.** Each follow saves on tap (StepClubs.tsx:137-181).

**Merge**
- **The profile step becomes name and handle.** It is the heaviest screen, and it leans toward careers (StepProfile.tsx:58-89). Eli: pay off before asking.

**Move later (week 1)**
- **Photo:** a nudge after the first follow.
- **People:** a Campus card once the person follows 2 or more clubs.
- **The phone QR code:** to Otto's checklist (it sits at onboarding.html:716-728 today).
- **The order:** Hello and Campus, then name, then clubs.
  - Following needs only accepted Terms (orgs/[slug]/follow/route.ts:80-81).
  - Someone who joins before setting a name shows officers "Member" (onboarding-prefill.ts:470-474).

**Cut**
- **From the tours:**
  - the computer's opening photo ask (campus-home.tsx:703-710)
  - "Otto threads the right matches in" (:728), which sounds like the agent
  - the phone's post ask
- **In week 1:** the old agent settings saved on Finish (onboarding.html:2538-2546).

## 5. Three kinds of arrival

**Club members' link (most launch-night guests)**
- Six steps (in P2, the hello names the club), then "Join {club}?" (c/welcome/page.tsx:62-75), then the club page (club-links/redeem/route.ts:88). Joining stays one tap.
- The pending flag holds the quiet arrival and tour for their first Campus visit (onboarding.html:3824; OnboardingMobile.tsx:647).
- The first bubble is about Otto, so it still makes sense days later. Beat 13 shows their club already in Your clubs.
- "Not now" goes to /campus?welcome=1 (club-link-action.tsx:52), and the intro runs right away.

**Access code:** six steps, then /campus?welcome=1 (finish.ts:47), then beats 9-13 or 14, ending on clubs.

**Returning people**
- Nothing is held and no tour runs (campus-home.tsx:668-680; use-mobile-tour.ts:205-209).
- Settings > Replay tour plays the new one (SettingsClient.tsx:168-183).
- Direct links never start it.

**Storage: nothing new, so the Privacy Policy doesn't change.** The quiet arrival is worked out on every load from one question: is the tour about to run? Per-account state would need a database change and Franky's yes, and launch doesn't need it.

**Ways out (written as tests).** Each of these shows everything at once:
- Done or Skip
- the script failing to load (campus-home.tsx:750)
- a 4-second ceiling if `OttoTour.isRunning()` never turns true (_otto-tour.js:266)
- a tab change, or leaving the page

With reduced motion, the sides simply appear (Reveal.tsx:15-17).

## 6. Build list

### BEFORE FREEZE, P1: Sat Oct 24 to Mon Oct 26, about 16 h (Tuesday is for fixes)

| # | Change | Files | Hours |
|---|---|---|---|
| 1 | Onboarding words (beats 2, 4-7) | onb-copy.ts:40-45, 114-137; its twin, onboarding.html:843-950; StepProfile.tsx:60, 77; the words-match check | 1.5 |
| 2 | Profile folds to name and handle | StepProfile.tsx:272-445; onboarding.html:584-653, 877-888 | 2.5 |
| 3 | Skip hidden on steps 1-2 | OnbHeader.tsx:67-74 (Back's rule, :57); onboarding.html:2337 | 0.5 |
| 4 | New computer tour: Otto, feed, right, left/tabs, "Show me clubs" opens Orgs, empty steps dropped, the phone's start rule | new `src/lib/tour/campus-tour-steps.ts` plus a test; campus-home.tsx:666-748; reuse `tourStartDecision` (use-mobile-tour.ts:205-209) | 3 |
| 5 | Quiet arrival: the sides are held and grow in as Otto names them | one added line in `showStep` (_otto-tour.js:228) calling an optional `step.onShow`, plus its 3 type declarations; new `src/app/campus/use-first-light.ts`; a `held` setting and column ids in FeedSideLayout.tsx:33-58, passed from campus-home.tsx:6841 | 4 |
| 6 | Phone tour: Otto tab, feed, tabs | use-mobile-tour.ts:107-126; use-mobile-tour.test.ts:76-81 | 1.5 |
| 7 | The personal-email card waits for the welcome visit | PersonalEmail.tsx:461 | 1 |
| 8 | Browser pass as a non-admin | 375, 1000, 1200 and 1440px; Light and Night; reduced motion; club link and access code | 2 |

**Notes on item 5**
- The engine re-runs a step on every scroll and resize (_otto-tour.js:212, 260-261), so `onShow` may only move the reveal forward.
- Only each column's inside moves, so the spotlight around it stays lined up.
- No other tour uses `onShow`. The engine's page class, which profile.html relies on (profile.html:916), is untouched.

**If Monday night is red:** move item 5 to week 1. The new tour alone still follows Franky's order. Never cut items 3, 6 or 8.

### BEFORE FREEZE, P2: only if P1 is green Monday night (cut 10 first)

| # | Change | Files | Hours |
|---|---|---|---|
| 9 | Hello names the club | boot.ts:101-112; onboarding/page.tsx and classic/route.ts via `pendingClubLink` (club-links/store.ts:280); OnboardingMobile.tsx:1100-1108; onboarding.html:536 | 3 |
| 10 | Exit without the blur; the frame uses a colour token (no charcoal flash in Light mode) | onboarding.html:484-488; OnboardingSwitch.tsx:111, 121 | 0.75 |

### WEEK 1 (Nov 2-8), about 55 h

| Change | Files | Hours |
|---|---|---|
| Reorder: Hello+Campus, then name (with a round photo button), then clubs; the sign-up strip matches | draft.ts:56-64; OnboardingMobile.tsx:136-149, 957-1075; onb-copy.ts:36; onboarding.html; signup-form.tsx:595-610 | 12 |
| Club-link guests: their club pinned first; an Otto line on the club page; Share Vibe shares the club's link | StepClubs.tsx; onboarding.html:3252, 3805-3816; StepPeople.tsx:141; redeem/route.ts:88 | 8 |
| "Your campus so far" checklist: campus, a club, an event, a photo, the phone QR | api/me/otto/route.ts:136; OttoPageClient.tsx:238; OttoMobile.tsx:368 | 6 |
| Live growth: a follow sends "clubs changed", and the new row pops | OrgJoinControl.tsx:138; club-events-signal.ts:13-28 pattern; use-your-clubs.ts | 3 |
| Phone Your clubs row; a Tonight beat in the phone tour | CampusMobile.tsx near :1125 | 5 |
| Otto "goes home" (orb into the corner or the Otto tab) in place of the hyperdrive and the phone's fade | onboarding.html:442-492; OnboardingMobile.tsx:1137-1138, 1324-1332 | 4 |
| My Calendar: a seed line, then the grid | LeftNav.tsx:638-656 | 2 |
| Tour engine house rules: colour tokens, Escape, focus, a screen-reader label, springs, reduced-motion scrolling | _otto-tour.js:28-46, 126-130, 234 | 5 |
| Phone onboarding on colour tokens, springs and reduced motion | onb-theme.ts:17-40 | 5 |
| Leftovers: the agent settings, a wrong comment, "Interests & projects" | onboarding.html:2538-2546; onboarding-step/route.ts:69; onb-copy.ts:82 | 1 |
| Eli's test, counts only: club followed on the first visit; back on day 7 and day 30 | admin > Usage | 4 |

## 7. Questions for Franky

1. **Should the sides grow in only on the first visit, as Otto names them?** Recommend **yes**. If they grew on every load, regulars would wait every day.
2. **Tonight (right) first, then Your clubs (left)?** You said "right and left". Recommend **yes**: it also ends the tour on clubs, which is Parker's point.
3. **Should "Show me clubs" open the Orgs tab?** Recommend **yes**. A newcomer's next move should be finding a club.
4. **Fold the seven optional profile fields before the freeze?** Recommend **yes**. It is the heaviest screen, and what gets saved doesn't change.
5. **Should Otto's hello name the club, in P2 or in week 1?** Recommend **P2**, if Monday is green. Most launch-night guests arrive by club link.
6. **In week 1, should name come before clubs?** Recommend **yes**. Otherwise officers see "Member" join.
7. **Rename the "Orgs" tab to "Clubs" in week 1?** Recommend **yes**. Vibe is built around clubs, and the tour already says "clubs".
8. **May we count first-visit club follows and day-7 and day-30 returns, counts only?** Recommend **yes**. That is Eli's test. Any database change still needs your OK.
