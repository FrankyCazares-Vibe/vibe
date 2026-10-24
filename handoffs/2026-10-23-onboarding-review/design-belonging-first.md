# Belonging first: sign-up to first campus visit (draft, Oct 23)

**The idea.** In the first minute, a new student should see their clubs and what's on tonight. They shouldn't be filling in a profile. Franky's order stays: Otto first, then the feed, then the left and right sides. The sides appear only when they have something real to show. Follow a club and "Your clubs" fills in on the left. Tonight shows on the right once there is a real event. Otto talks the student through it but is never the main thing on screen.

Menus, tabs, search, the + button and Otto are never held back. Only empty panels wait.

## Storyboard

**1. Sign up.** The form stays as it is. The step strip changes from "3 Profile" to "3 Your clubs" (signup-form.tsx:595-610).

**2. Code.** No change.

**3. Otto says hello (step 1).** The Otto orb shows first, alone. The words come a moment later.
- Words: "i'm otto." / "i'll show you around: your clubs, what's on tonight, and your people." Note: "about a minute: your campus, your name, then your clubs." The current note leaves clubs out (onb-copy.ts:43).
- Club members' link: "{Club} sent you. let's get you in."
- Motion: the orb scales 0.92→1 with a fade (SPRING_SOFT); the text rises 8px (Reveal.tsx:19-45).

**4. Campus (step 2).** The words stay. Skip is turned off until a campus is saved. No campus means no clubs or events (campus-home.tsx:5143-5163).

**5. You (step 3).** Only name and handle are open. The other seven fields fold under "Add more (optional)", which starts closed.
- Title: "what should your clubs call you?" Otto: "just a name and a handle. the rest can wait."
- The career-era hints go: "what you're building", Skills, "Showing my work" (StepProfile.tsx:58-89, onboarding.html:1178-1194).

**6. Photo (step 4).** Unchanged before the freeze. Skipping takes one tap.

**7. Clubs (step 5).**
- Title: "find your clubs". Sub: "follow a club and its events and Board updates come to you." This replaces "Their posts show up in your feed" (onb-copy.ts:116).
- Club members' link: that club is pinned first, tagged "brought you here".

**8. People (step 6).** Title: "people from your clubs". The "rise to the top of your feed" wording goes (onb-copy.ts:135-137).

**9. Finish.** The computer's exit animation keeps its zoom and fade but loses its blur, which breaks the motion rule (onboarding.html:484-488).

**10. Club members' link only.** The page asks "Join {Club}?" (c/welcome/page.tsx:62-75). Join opens the club page (redeem/route.ts:88). The campus tour runs on their first Campus visit, and its "Your clubs" bubble points at that club.

**11. Arriving on Campus, computer (1100px wide or more).** The left menu, top bar and Otto orb are there at first paint.
- **t0:** the feed rises in card by card, as it already does.
- **When the feed has loaded:** the left column grows in (SPRING_SOFT: a fade and an 8px rise).
  - Student follows clubs: their Board lines.
  - Student follows none: a seed card, "Your clubs grow here." / "Follow a club and its newest Board post shows up here.", plus the existing "Find clubs on campus" button (YourClubsPanel.tsx:62-67).
- **When Tonight's data has loaded:** the right column grows in, one beat after the left. It stays hidden if there is nothing tonight and nothing this week, which is how the phone card already works (TonightCard.tsx:44). The grid keeps its columns, so the feed never moves (FeedSideLayout.tsx:33-42).
- **Then Otto narrates, in Franky's order:**
  1. On the orb (OttoCorner.tsx:187): "Hi again." / "I live down here. Notifications and messages, whenever you want them."
  2. On the feed: "Your campus, live." / "Posts from students and clubs at {campus}. Clubs you follow come first."
  3. On Your clubs: "Your clubs." / "Each club's newest Board post lands here."
  4. On Tonight: "What's on tonight." / "School and club events, soonest first." Button: "Got it".
- **Leaves the tour:** the photo request (campus-home.tsx:707-709) and "Otto threads the right matches in" (campus-home.tsx:728).
- Bubbles for panels not on screen are dropped first, or they float mid-screen (_otto-tour.js:238-242).

**12. Arriving on Campus, phone.** The banner, tabs and bottom bar are there at first paint. There is no floating Otto.
- The Tonight card rises in only when something is on (TonightCard.tsx:44, 53).
- The personal-email card is held back for this first visit. Today it sits on top of the tour (CampusSwitch.tsx:75-77).
- The tour:
  1. "Swipe between Feed, Events, Orgs and Map." The current copy names a Chat tab that no longer exists (use-mobile-tour.ts:112).
  2. On the Tonight card ("What's on tonight."), or on the feed ("Your campus, live.") when there is no card.
  3. On the Otto tab (MobileTabBar.tsx:189): "That's me." / "What's coming up and your notifications. Messages is next door." Button: "Got it". This replaces "Your turn. Tap + to post", so the tour ends on a payoff, not a request (Eli).

**13. The world grows (any visit).**
- Every follow goes through one button (OrgJoinControl.tsx:140). It sends a "clubs changed" signal, like the club-events one (club-events-signal.ts:13-21).
- "Your clubs" re-reads on it and only the new row rises in. Today it re-reads only on load or tab return (use-your-clubs.ts:28-80).

**14. Later firsts (week 1).**
- "My Calendar" appears in the left menu after the first RSVP (LeftNav.tsx:416, 639-656).
- A photo card ("put a face to the name. your clubs see it.") after the first visit.
- "People from your clubs" once the student follows 2 or more clubs.
- The personal-email card on a later visit, not the first.

## Cut, merge, move

| Step | Before freeze | Week 1 | Why |
|---|---|---|---|
| Hello | rewrite | merge with Campus | names clubs; one tap fewer |
| Campus | Skip off until saved | (merged) | no campus = no clubs |
| Profile | name + handle; rest folded | extra fields leave onboarding | heaviest screen, career-leaning |
| Photo | keep | round "add photo" on You, then a nudge | not belonging |
| Clubs | rewrite, pin the club | right after You | the payoff |
| People | rewrite | Campus card at 2+ clubs | pay off before asking |

**Week-1 order:** Hello + Campus → You (name, handle, photo) → Clubs → arrive.
- Name comes before clubs on purpose. Following needs only accepted Terms (follow/route.ts:80-81). But a student with no name yet shows up to the club's officers as "Member" (onboarding-prefill.ts:474-478).

## Club members' link vs access code

- **Club members' link:** the hello names the club, the club is pinned on the clubs step, and after onboarding comes "Join {Club}?" and then the club page. Campus comes later, and its tour points at the club in Your clubs.
- **Setup link:** "let's set up {club}", then "Set up {Club}?" (c/welcome/page.tsx:54-75).
- Today onboarding doesn't know the club (boot.ts:105-116). It would read the waiting link like /c/welcome does (c/welcome/page.tsx:32-50), passing only the club's name and link kind.
- **Access code:** a plain hello, the clubs step in its usual order, then Campus with the arrival and the tour.

## A returning person

No staging and no tour. Every panel with something in it shows at once. Your clubs shows the seed card if they follow none. Tonight hides when nothing is on. Settings > Replay tour still works (SettingsClient.tsx:168-183).

## Where the state lives, and why it can't trap anyone

- **Growth is worked out from real data on every load:** clubs followed and events that exist. Nothing is stored, so nothing can get stuck half-shown. Unfollow every club and the seed card comes back.
- **The tour keeps its on-device flags, with one fix.** Finishing onboarding clears `vibe_campus_tour_seen_v1` on that device, in the same spot where the pending flag is set (OnboardingMobile.tsx:642-650, onboarding.html:3822-3824).
  - Today that flag survives sign-out (leave-device-clean.ts:36-40). So the second person to sign up at the Demo Day booth never gets a tour.
  - No new browser storage is added, so the Privacy Policy's "Kept in your browser" list doesn't change.
- **No per-account storage for launch** (it needs a database change and Franky's yes).
- **Guards:**
  - Nothing is gated; empty panels just wait. Skip tour is always there.
  - With reduced motion on, everything simply appears (Reveal.tsx:15-17).
  - If a read fails, today's quiet fallbacks apply (FeedSideLayout.tsx:33-42; TonightPanel.tsx:62-66).

## Build list

### BEFORE FREEZE (by Tue Oct 27), about 18 h. If it slips, drop from the bottom.

1. **Copy, both devices:** hello, clubs and people text (onb-copy.ts:40-45, 114-137, and its twin in onboarding.html near 845-935, kept in step by the existing match check), plus the sign-up strip (signup-form.tsx:595-610). **2 h**
2. **Shorter profile step:** name and handle open, the rest folded, career hints gone. StepProfile.tsx; onboarding.html:877-888, 1178-1194. What gets saved doesn't change. **3 h**
3. **Club-aware onboarding:** add the club's name and link kind to what the onboarding page starts with (boot.ts:105-116, onboarding/page.tsx, onboarding/classic/route.ts). Hello names the club, and the clubs step pins it. **4 h**
4. **Both tours:** computer at campus-home.tsx:700-731 (orb, feed, Your clubs, Tonight; drop missing targets). Phone at use-mobile-tour.ts:107-126, and update the test at use-mobile-tour.test.ts:76-81. The Tonight card needs an id the tour can point at. **3 h**
5. **Shared device:** clear the "seen" flag on Finish; Skip off until a campus is saved (OnbHeader.tsx:43, onboarding.html:508); hold the personal-email card on the first visit (CampusSwitch.tsx:75-77). **1.5 h**
6. **Computer arrival:**
   - an "arriving" flag from TabBody (campus-home.tsx:6817-6859) into FeedSideLayout
   - side columns enter with `Reveal`
   - TonightPanel hides when nothing is on tonight or this week (TonightPanel.tsx:106-121, with its tests)
   - the seed card's words (tonight-view.ts:83)
   **3 h**
7. **Live growth:** OrgJoinControl.tsx:140 sends the signal, use-your-clubs.ts listens, and the new row rises in. **1.5 h**
8. **Browser pass (required):** phone at 375px as a non-admin; computer at 1440px and 1200px; Light and Night; the club-link path and the access-code path. **2 h**
9. If time: take the blur out of the exit animation (onboarding.html:484-488). **0.5 h**

### WEEK 1 (Nov 2-8), about 49 h

- **Three-screen onboarding** on both devices: draft.ts:64, the one-history-entry-per-step rule (OnboardingMobile.tsx:136-149), the "n of 6" copy, and the copy match check. **12 h**
- **A "you're in" finish:** the campus name, then the student's club logos gather, on springs, where the exit animation plays today (OnboardingMobile.tsx:653-654, 1137-1138). **6 h**
- **A phone "Your clubs" row** on the Feed after the first follow (CampusMobile.tsx:1130; reuses use-your-clubs.ts). **5 h**
- **Later firsts** (beat 14). **8 h**
- **A welcome line on the club page** for students who joined from /c/welcome (`?welcome=1` added at redeem/route.ts:88). **3 h**
- **Tour engine:**
  - colour tokens, the Escape key, keyboard focus and a screen-reader label
  - scrolling that respects reduced motion
  - an optional signal at each step, so panels can grow in as Otto names them (_otto-tour.js:28-46, 126-130, 234)
  - Four tours share it; profile.html:916 depends on it.
  **6 h**
- **Onboarding on colour tokens, springs and reduced motion** (onb-theme.ts:17-40; OnboardingSwitch.tsx:111, 121). **5 h**
- **Measure it (Eli's 30-day test):** counts only. "Followed a club in the first visit" and "came back on day 7 / day 30", in admin > Usage. Needs Franky's yes if it takes a database change. **4 h**

**Calls for Franky:**
- (a) The sides grow from clubs and real events, not a timer.
- (b) Week 1: name before clubs.
- (c) Rename the "Orgs" pill to "Clubs" in week 1.
