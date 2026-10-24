# Otto first, then the world grows in (first-run design, Oct 23)

**The idea.** Otto is the first face. He says hello, asks for a few things, then "goes home": the corner on a computer, the Otto tab on a phone. Campus opens on the feed alone. Otto lights the sides one at a time: tonight on the right, your clubs on the left. After that, the world grows only when the person does something real. The first club follow fills "Your clubs", the first RSVP fills the calendar, and only then does Otto ask for a photo. Menus, tabs, search and + are never hidden.

## 1. Storyboard

**Beat 1. Otto says hello (onboarding step 1)**
- Computer: the big three-ring orb (onboarding.html:153-177). Phone: the big orb (OnboardingMobile.tsx:1100-1106).
- Words: "hi, i'm otto." / "i keep an eye on campus: what's on tonight, which clubs are meeting, who's around. a few quick things and it's yours." Note, honest to the six steps: "about two minutes: your campus, your name, a photo, your clubs, your people." Week 1: "about a minute: your campus, your name, your clubs."
- Club link: "{club} sent you. a few quick things, then i'll take you to them."
- Trigger: page load. Motion: orb scale 0.85→1, opacity 0→1, SPRING_SOFT; lines use the Reveal stagger (Reveal.tsx:19-45).

**Beat 2. Campus (step 2).** Unchanged, one tap. Skip is hidden on steps 1-2: today Skip on step 1 can leave someone with no campus, so Campus only asks them to pick one (campus-home.tsx:5143-5163) and club creation is refused (api/orgs/route.ts:681).

**Beat 3. Your name (step 3).** Name and handle on top. The seven optional fields fold under "More about you (optional)", closed (stretch before the freeze; they leave onboarding in week 1). Otto: "just your name and a handle. the rest can wait."

**Beat 4. Your clubs (step 5 today, step 4 in week 1).** "find your clubs" / "follow a club to see its Board and events. join the ones that let you." Each Follow pops (SPRING_POP). Club-link guests see their club pinned first, tagged "you came in through this club" (week 1).

**Beat 5. Otto goes home (the exit)**
- Computer: the orb shrinks and glides to the bottom-right corner. That is where the real orb sits on Campus, 24px from the edges (network/OttoCorner.tsx:187-206).
- Phone: the orb shrinks down into the middle of the bottom bar. The Otto tab is the middle of five (MobileTabBar.tsx).
- Motion: translate and scale on SPRING_SOFT, with the background fading out. This replaces the hyperdrive, whose `filter` blur breaks the rule (onboarding.html:484-488).
- Before the freeze, only the blur goes. The glide is week 1.

**Beat 6. Campus: Otto first**
- Computer: the feed column is in place. Both side columns start at opacity 0. They keep their space, so nothing jumps. The corner orb pops in (SPRING_POP). Bubble on `#otto-corner`: "I'll be down here." / "Tap me any time for what's new and your messages."
- Phone: the bubble sits on the Otto tab, which already has a tour id (`#otto-mobile-tour-network-otto`, MobileTabBar.tsx:189). Words: "That's me." / "Tap here any time for what's new on campus."
- Trigger: arriving with the tour pending (campus-home.tsx:671-674; use-mobile-tour.ts:205-209).

**Beat 7. The feed arrives**
- Both: the bubble moves to the feed, and the posts rise in. "This is {campus}, live." / "What clubs and students are posting right now. You don't need to follow anyone to see it."
- Trigger: Next. Motion: Reveal (opacity, plus 8px of rise).

**Beat 8. The right side grows: Tonight**
- Computer, 1100px and wider: the Tonight panel rises in inside the spotlight. "Tonight on campus." / "What's on tonight and this week. Open one for the details."
- Phone: the bubble sits on the tab strip. "Events and clubs are one swipe over." / "Events for what's coming up. Orgs to find your clubs."
- Trigger: Next. Motion: opacity 0→1, y 8→0, SPRING_SOFT, on the panel's inner box only, so the spotlight (which measures the outer box) stays aligned.

**Beat 9. The left side grows: Your clubs (computer, 1400px and wider)**
- No clubs yet: the panel shows a seed. "Your clubs grow here." / "Follow a club and its Board shows up here: updates, events, what's next."
- Already in a club: "Your club's already here." / "Its Board and events land here. Add more any time."
- Last bubble, on the tabs: "Find your clubs." / "Orgs has every club on campus." The button says "Show me clubs" and opens Orgs when they have none. Otherwise it says "Got it".
- On narrower windows, a step whose target isn't on screen is dropped. So a bubble never floats in the middle (_otto-tour.js:238-242).

**Beat 10. The first follow (a real action)**
- Computer: next time the Feed shows, the new club's row rises into Your clubs; the very first one pops once. The side columns mount only on the Feed tab (campus-home.tsx, TabBody near 6841), so returning from Orgs re-reads.
- Only after that first follow does Otto ask for a photo, on the grey profile card: "Add a photo so your club knows it's you." (week 1)
- Phone: the Otto tab checklist ticks the step, and a "Your clubs" row grows in above the Tonight card (both week 1).

**Beat 11. The first RSVP (week 1)**
- Computer: until then, "My Calendar" shows one line: "Events you RSVP to land here." On the first RSVP, the month grid rises in. Today it is an empty grid with no sentence (LeftNav.tsx:638-656).
- Phone: the event shows under Coming up on the Otto tab, which already works.

**Beat 12. Otto's checklist, "Your campus so far" (week 1)**
- It sits at the top of Today, on /otto (OttoPageClient.tsx:238) and on the phone Otto tab (OttoMobile.tsx:368).
- Items: ✓ your campus · follow a club · pick something to go to · add a photo (after the first club) · get Vibe on your phone (computer only; the QR from step 6). Each tick pops. All done: "That's your campus. I'll keep watch." and the card folds away.

## 2. Onboarding: cut, merge, move

- **Keep:** Hello (Otto first), Campus (required, one tap), Name and handle, Clubs.
- **Merge:** the profile step becomes name and handle. The seven optional fields fold away now and leave in week 1; they live in the profile editor, and several are LinkedIn-era (StepProfile.tsx:58-89).
- **Move later:** Photo, asked after the first follow (pay before asking, Eli). People, after the first club, on Network and the checklist. The phone QR, to the checklist.
- **Cut:** the old agent settings saved into otto_answers (onboarding.html:2538-2546), after checking what still reads them.
- **Keep six steps until week 1.** The step number is hard-wired in the phone flow (OnboardingMobile.tsx:957-1069), draft.ts:64 and onboarding.html:1774, so before the freeze only words and the fold change.

## 3. Club link vs access code

**Club link** (most launch-night guests):
- Sign-up already shows the club.
- Otto's hello names the club. That needs the club's name in the onboarding start-up data, which is built to take new fields (boot.ts:96-112), read from `pendingClubLink` (club-links/store.ts:280).
- Finish still asks "Join {club}?" on /c/welcome. It is a tap, never done for them, because the link's place belongs to whoever signed up with it (c/welcome/page.tsx:19-28).
- Join leads to the club page. The intro waits for their first Campus visit, where Beat 9 says their club is already there, so the gap the map found becomes the payoff.

**Access code:** a plain hello, then /campus?welcome=1 (finish.ts:47): the full intro with seeds, ending on "Show me clubs".

## 4. Returning people

- Anyone who has seen the tour gets no intro. The page is as full as their own data. Someone with no clubs sees the seed line, which is today's empty state (tonight-view.ts:81).
- Testers who onboarded before this ships keep their seen flag. Settings → Replay tour plays the new intro (SettingsClient.tsx:168-183).
- Deep links (`?tab=`, events, /c/) never start the intro.

## 5. Where the state lives, and why it can't trap anyone

- **Growth comes from real data, read on every load:** clubs (the two reads Your clubs already makes, use-your-clubs.ts), RSVPs, the photo. Per account, same on every device, no new table.
- **Only the choreography is per device,** using the existing seen flag.
  - Shared-laptop fix (the Demo Day booth): Finish clears the seen flag before it sets the pending one (onboarding.html:3822-3824; OnboardingMobile.tsx:647). Then everyone who has just finished gets the intro. Today the flag survives sign-out (leave-device-clean.ts:37).
  - "Which club rows already rose in" is a cosmetic per-device, per-user list. If storage fails, rows just appear.
- **Don't store "intro seen" on the server:** new data about people needs Franky's yes and a same-day Privacy Policy change.
- **Rules:**
  1. The default is "everything shown". The intro only holds the sides back while it runs. Skip, an error, or 10 s without the tour starting shows everything at once.
  2. Navigation is never staged.
  3. Unlocks only add content, never a feature. Every empty side says what grows there and has the button that grows it.
  4. Reduced motion: same order, fades only (MotionRoot).
  5. No club name inside a tour bubble: the engine renders bubble text as HTML (use-mobile-tour.ts:102-106). Hence "Your club's already here."
  6. The engine change is additive: an optional per-step `onShow`. It re-runs on scroll and resize (_otto-tour.js:211, 256-257), so it may only raise the stage. The other tours don't pass it.

## 6. Build list

**BEFORE FREEZE (by Tue Oct 27), about 17 h**
1. Computer intro, 6 h: a `stage` prop on FeedSideLayout (FeedSideLayout.tsx:27-61); new `src/components/campus/tonight/use-world-stage.ts`; tour steps moved from campus-home.tsx:700-746 to new `src/lib/tour/campus-intro.ts`; off-screen steps dropped; "Show me clubs" opens Orgs.
2. Tour engine, 1 h: an optional `step.onShow` in public/html/_otto-tour.js:229, plus the three type declarations.
3. Phone tour, 1.5 h: Otto tab → feed → tabs; drop "Your turn" and the dead "Chat"; update use-mobile-tour.test.ts:76-81.
4. Club named in the hello, 3 h: boot.ts, onboarding/page.tsx, onboarding/classic/route.ts, OnboardingMobile.tsx, onboarding.html. Insert the name as text, never as HTML.
5. Copy pass, 1.5 h (onb-copy.ts, ONB_COPY, parity test): hello note; clubs and people steps talk Board and events; drop "Otto threads the right matches in" (campus-home.tsx:728).
6. Small fixes, 2 h: Finish clears the seen flag; hyperdrive without blur; frame colour as a token (OnboardingSwitch.tsx:111, 121); phone step entrance respects reduced motion (onb-theme.ts:40); no Skip on steps 1-2.
7. Walk it, 2 h: at 375px and 1440px, as a non-admin, by club link and by access code, in Light and Night.

Stretch: the new-club rise and first-row pop in YourClubsPanel.tsx (2 h). The "More about you" fold in StepProfile.tsx and onboarding.html (3 h).

**WEEK 1 (Nov 2-8), about 40 h**
- Four-screen onboarding on both (draft version, step counts, parity tests). 10 h
- "Your campus so far": optional `firstSteps` in OttoPayload (api/me/otto/route.ts:136); one shared card for both Otto pages and the corner panel. 6 h
- Photo ask after the first follow. 2 h
- The link's club pinned first on the clubs step. 2 h
- The orb glides home, replacing the hyperdrive and the phone warp (OnboardingMobile.tsx:1138). 3 h
- Phone "Your clubs" row. 4 h
- My Calendar seed, then grow. 2 h
- A first-visit bubble on the club's Board. 2 h
- Phone onboarding on tokens and springs. 4 h
- Tour engine house rules: Escape, focus, a label, reduced-motion scroll, tokens. 4 h
- Stop saving the old agent settings. 1 h

**How we'll know it works (Eli's 30-day test):** the share of new accounts that follow a club in their first session, as a count only, if Franky says yes.
