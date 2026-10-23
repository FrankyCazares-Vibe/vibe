# First run, ship-by-freeze version (realist)

**The idea in one line:** keep today's screens, cut the heavy form to two fields, and let Campus arrive quiet. Otto comes first, then the feed, then the left side, then the right side. Each piece grows in only when Otto names it.

Short names used below:

| Short | File |
|---|---|
| **CH** | src/app/campus/campus-home.tsx |
| **CM** | src/components/mobile/CampusMobile.tsx |
| **UMT** | src/components/mobile/use-mobile-tour.ts |
| **OT** | public/html/_otto-tour.js |
| **HTML** | public/html/onboarding.html |
| **COPY** | src/components/mobile/onboarding/onb-copy.ts |

## 1. Storyboard

**1. Sign-up and code.** No change.

**2. Hello, Otto first.** Both devices already open on "i'm otto." (HTML:536, OnboardingMobile.tsx:1100-1108). Only the words change:
- Otto: "think of me as your campus compass. i'll show you what's on tonight, which clubs are worth a look, and who's around. we'll start small and let the rest fill in."
- Note: "about a minute: your campus, your name, then your clubs and people". Today's note leaves clubs out (COPY:43).
- For club-link guests (P2): "you came in with {club}. i'll take you there at the end."

**3. Campus.** Same screen. Skip is hidden on steps 1 and 2.
- Today Skip on step 1 can finish onboarding with no campus (OnbHeader.tsx:66-72, HTML:508).
- That person then lands on "Pick your campus…" (CH:5143-5163), the opposite of a world growing in.

**4. "what should people call you?"** The nine-field profile (StepProfile.tsx:272-445, HTML:584-653) now shows only Name and Handle.
- The other seven fields sit behind a closed row: "Add more about you (optional)". The fields fade in when the row opens (opacity only).
- Otto: "a name and a handle. that's all for now. the rest can wait."
- The bio placeholder loses "what you're building" (StepProfile.tsx:77).

**5. Photo.** Same screen. Otto: "people follow faces. add one now or later, your call."

**6. Clubs.** Same list. The line stops selling the feed (COPY:116): "Follow to get their updates and events. Join the ones that let you."

**7. People.** Same list. Otto: "students at {campus}. follow a few so you know who's around." (COPY:134-137)

**8. Hand-off.** Same routes:
- A club link goes to /c/welcome. Everyone else goes to /campus?welcome=1 (onboarding-complete/route.ts:195-197).
- The computer's exit loses its blur (HTML:484-488) (P2).

**9. First light, Campus, first visit only.** It happens when the tour is about to run: ?welcome=1 or the pending flag, and the tour not yet seen (CH:668-680).
- **Computer:** the top bar, the left menu and the feed show. The Your clubs column, the Tonight column and the Otto orb are held invisible: opacity 0, 8px low, keeping their place, so nothing jumps.
- **Phone:** the page opens on Feed, and the + button is held back.

**10. Otto arrives.** This is the tour's first bubble. The engine already dims the page around one spotlight (OT:102-121).
- **Computer:** the orb `#otto-corner` (OttoCorner.tsx:187) pops in with one overshoot (SPRING_POP, springs.ts:21).
  - Words: "Hi again. I'm **Otto**." / "I'll be right here in the corner. Click me for your messages and anything new."
- **Phone:** the spotlight is on the Otto tab (MobileTabBar.tsx:189). Its icon does the same pop, but it is never hidden.
  - Words: "Hi again. I'm **Otto**." / "I live in this tab. Anything new for you lands here."

**11. The feed (Next).** Both devices show the same bubble: "Your campus, **live**." / "What students and clubs at {campus} are posting. People and clubs you follow come first." That matches how the feed ranks (api/feed/route.ts:133-138).

**12. The left side (Next).** What shows depends on the screen.
- **Computer, 1400px and wider:** Your clubs (FeedSideLayout.tsx:43) rises in on SPRING_SOFT.
  - Words: "Your **clubs**." / "Follow or join a club and its latest Board post shows up here."
- **Computer, 1100-1399px:** Your clubs is folded into the right column (feed-side.css:161-164), so beats 12 and 13 become one bubble.
  - Words: "Your clubs and tonight." / "Your clubs' latest, then what's on at {campus} tonight and this week."
- **Computer, 900-1099px:** there are no side columns (feed-side.css:179-181), so the bubble points at the tabs.
  - Words: "Events and clubs, **one click away**." / "Feed, Events, Organizations and Map live up here."
- **Phone:** the bubble points at the tab strip (CM:1073).
  - Words: "Events and clubs, **one swipe over**." / "Feed, Events, Orgs and Map. Swipe or tap to switch."

**13. The right side (computer, 1400px and wider).** Tonight (FeedSideLayout.tsx:48) rises in.
- Words: "What's on **tonight**." / "Events at {campus}, tonight and this week." The button reads "Got it".
- This beat is dropped if the panel draws nothing (TonightPanel.tsx:58-62).

**14. Settled.** Everything is visible.
- On the phone, the + pops in now. It replaces today's "Your turn… post" bubble (UMT:120-124): pay off first, ask later.
- The push ask already waits for the next visit (CM:310-325).
- The "add a personal email" card now waits too. Today it sits on top of the tour (CampusSwitch.tsx:75, PersonalEmail.tsx:461).

**15. Growth from real actions.** This already exists; the new copy simply points at it:
- A club followed in beat 6 fills Your clubs on day one.
- The first RSVP puts a count on My Calendar (LeftNav.tsx:639-656).

## 2. Cut, merge, move

**Cut** from both tours:
- the computer tour's opening photo ask (CH:704-710)
- the search bubble, "Otto threads the right matches in" (CH:722-730), which sounds like the AI agent
- the phone's post ask
- the dead "Chat" tab name (UMT:112)

**Fold:** seven optional profile fields go behind one row. The field names, the draft and the server stay as they are (draft.ts:78-89).

**Keep the six steps and their numbers before the freeze.** The numbers are wired into the draft, the history rule and the static page (draft.ts:56-64, OnboardingMobile.tsx:136-149, 957-1075).

**Move to week 1:** putting clubs before the profile, and taking the photo step out.

## 3. Club members' link vs access code

**Access code:** six steps, then /campus?welcome=1, then beats 9-14 right away.

**Club link:**
- Six steps. In P2 the hello step names their club.
- Then "Join <club>?" (c/welcome/page.tsx:62-75), then the club page (club-links/redeem/route.ts:88).
- The tour and first light wait for their first Campus visit, through the pending flag (OnboardingMobile.tsx:647, HTML:3824). The first bubble is about Otto, not "you just signed up", so it still makes sense days later.
- "Not now" goes straight to /campus?welcome=1 (club-link-action.tsx:52).

## 4. A returning person

Nothing changes for them:
- First light only switches on when the tour is about to run.
- The tour only runs on ?welcome=1, or on the pending flag that onboarding sets, and never once it has been seen (CH:668-680, UMT:205-209).
- Returning people, and people on a new device, get today's page.

## 5. Storage, and why it can't trap anyone

**Nothing new is stored before the freeze.**
- The tour keeps its per-device flags `vibe_tour_pending` and `vibe_campus_tour_seen_v1` (CH:675, UMT:66-71).
- First light is never saved. Each visit works it out from one question: is the tour about to run?

**Rules (write them as tests):**
1. **Visible by default.** Things are held back only when the tour will run. On a computer that also needs a window at least 900px wide.
2. **Held means invisible, not removed.** The engine measures with getBoundingClientRect (OT:139-142), which still works at opacity 0. The dim layer blocks every click while the tour runs (OT:27), so no invisible button can be tapped.
3. **Every way out shows everything:**
   - Done or Skip (CH:734-748)
   - the script failing to load (CH:750)
   - a tab change, or leaving the page
   - a 4-second ceiling if the tour hasn't started
   - a 500ms check of `OttoTour.isRunning()`, the same pattern as CM:1403-1425
4. **Reduced motion:** no rise and no pop, only a fade.
5. **The engine gains one optional `step.before()` hook** (OT:228). It is safe to run twice, because resize and scroll re-run the step (OT:212). profile.html's tour is untouched (profile.html:916).

**Known gap:** the "seen" flags survive sign-out on purpose (leave-device-clean.ts:36-38). At the Demo Day booth laptop, use Settings > Replay tour (SettingsClient.tsx:168-183) before each guest.

## 6. Build list

### BEFORE FREEZE, P1: lands by Mon Oct 26 night; Tue is for fixes

One wave of four batches, each owning its own files. HTML has a single owner.

| # | Change | Files | Hours |
|---|---|---|---|
| 1 | Onboarding copy (beats 2, 4-7) | COPY:40-45, 72-74, 105-137; HTML:845-950 (mirror); StepProfile.tsx:77 and HTML placeholders; parity test | 2 |
| 2 | Profile folds to Name and Handle | StepProfile.tsx:272-445; HTML:584-653 | 3 |
| 3 | Skip hidden on steps 1-2 | OnbHeader.tsx:66-72; HTML:2337 (copy Back's rule) | 1 |
| 4 | Computer tour: Otto, feed, left, right, plus the 3 width variants | new `src/lib/tour/campus-tour-steps.ts` and its test; CH:700-731 calls it | 3 |
| 5 | Computer first light, with every way out | OT:228 `before` hook; new `src/app/campus/use-first-light.ts`; feed-side.css; `--vibe-spring-soft` and `--vibe-spring-pop` CSS twins beside globals.css:3929-3933, made by spring-curve.ts, checked by spring-curve.test.ts | 4 |
| 6 | Phone tour: Otto tab, feed, tabs, "Chat" fixed; + held until the tour ends; personal-email card held on the welcome visit | UMT:107-126; use-mobile-tour.test.ts:76-81; CM:1264-1266 (key it to "first-run visit": `useCampusTourActive` starts true for everyone, CM:1404); PersonalEmail.tsx:461 | 3.5 |
| 7 | Browser pass as a non-admin | none: 375, 1000, 1200 and 1440px; Light and Night; reduced motion; both entry paths | 2 |
| | **P1 total** | | **18.5** |

### BEFORE FREEZE, P2: only if P1 is green Mon night

| # | Change | Files | Hours |
|---|---|---|---|
| 8 | The hello step names the club | boot.ts:101-112 (add `clubName`); onboarding/page.tsx:110 and onboarding/classic/route.ts:112 (via `pendingClubLink`); OnboardingMobile.tsx:1100-1108; HTML:536 (textContent only) | 3 |
| 9 | Motion fixes: exit blur dropped; phone step animation behind reduced motion; tour bubble and scroll on spring twins | HTML:484-488; onb-theme.ts:40; OT:43-46, 234 | 2 |
| 10 | Onboarding frame uses the background token (no charcoal flash in Light mode) | OnboardingSwitch.tsx:111, 121 | 0.5 |
| | **P2 total** | | **5.5** |

If we fall behind, cut 10 first, then 9, then 8. Never cut items 3, 4 or 5.

### WEEK 1 (Nov 2-8)

| Change | Files and notes | Effort |
|---|---|---|
| Reorder onboarding: campus, clubs, people, then name. The photo becomes a nudge after the first follow, and the sign-up strip matches the step count | draft.ts:56-64; OnboardingMobile.tsx:136-149, 957-1075; HTML; parity script; signup-form.tsx:595-610. First check that following works before a handle exists | ~1.5 days |
| Club-link guests: their club pinned first with Join; a two-bubble Otto welcome on the club page; the tour flag set only when they land on Campus; "Share Vibe" shares the club's link | HTML:3805-3816; StepPeople.tsx:141 | ~1 day |
| Per-account first-run state (tours seen, growth stages), so shared laptops and new devices behave | Database change, needs Franky's yes | ~1 day |
| Growth from real actions: My Calendar appears with the first RSVP; Otto-voiced empty states; a pop on the first club row | CH:7416-7437; CM:1716-1717 | ~1.5 days |
| Colour tokens and accessibility for the tour engine and phone onboarding | OT:28-42, 126-130; onb-theme.ts:17-31 | ~1 day |
| Stale leftovers: agent settings saved on finish; "Showing my work"; a wrong comment | HTML:2538-2546; onboarding-step/route.ts:69 | ~2 hours |
