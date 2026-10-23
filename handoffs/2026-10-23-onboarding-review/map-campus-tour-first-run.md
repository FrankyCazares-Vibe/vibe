# Campus tour and first-run map (read-only, Fri Oct 23)

Short names: **CH** = src/app/campus/campus-home.tsx, **CM** = src/components/mobile/CampusMobile.tsx, **UMT** = src/components/mobile/use-mobile-tour.ts, **OT** = public/html/_otto-tour.js.

## The short version
- The tour is short: 4 bubbles on a computer, 3 on a phone. It covers the feed, the tabs, and search or the + button. It never points at Tonight, Your clubs, the Otto orb, Messages or the phone's Otto tab. Those are the club and event surfaces Parker said matter most.
- Both tours ask for something. The computer tour opens by asking for a photo, and the phone tour ends by asking for a post. Eli's rule (pay off before asking) says to flip that.
- On first load, everything is on screen at once. The only staging today is panels that hide themselves when they have no data.
- The phone tour's copy is out of date. It names a Chat tab that nobody has any more.
- A staged reveal can attach to FeedSideLayout and CampusMobile's tab list without growing the 18,754-line CH.

## 1. The tour, step by step

**How it starts (both).** Onboarding sets `vibe_tour_pending=campus` (OnboardingMobile.tsx:647, onboarding.html:3824). It then sends people to `/campus?welcome=1` (finish.ts:47), or to the "Join <club>?" question when a club link let them in (onboarding-complete/route.ts:195-197). Joining lands on the club page (club-links/redeem/route.ts:88), so the flag holds the tour until the first /campus visit. "Not now" goes to `/campus?welcome=1` (club-link-action.tsx:52). Both tours share the seen key `vibe_campus_tour_seen_v1` (CH:675, UMT:69). Settings > Replay tour resets it (SettingsClient.tsx:168-183).

**The engine (OT, shared).** It dims the page with an SVG mask and cuts a rounded hole around the target (OT:102-121). Otto's bubble is headed "otto · 1 / 4" and has "Skip tour" plus "Next →" ("Got it" on the last step) (OT:180-190). It starts 350 ms after load (OT:263). If a target is missing, the bubble floats in the middle of the screen (OT:238-242).

### Computer (CH:655-750; skipped under 900px, CH:667)
It waits up to 1.5 s for the campus name (CH:686-693).
1. **`#nav-identity-chip`**, the profile card in the left menu (nav-identity-chip.tsx:372). "This is you on Vibe." / "Pop in a profile picture and a banner — click your card to jump into your profile and customize it. Without them, the card stays grey." (CH:703-710)
2. **`#campus-feed`**, the whole centre column (CH:7302). "Your campus pulse." / "What students at {campus} are posting. People and clubs you follow rise to the top." (CH:694-697)
3. **`#campus-tabs`**, the pills in the top bar (CH:6743). "Switch lanes anytime." / "Feed, Events, Orgs, Map — same Otto, different angle on what's happening." (CH:717-720)
4. **`#campus-search`**, or the round button `#campus-search-toggle` under 1024px (CH:5599, 5885, 6256). "Find your people." / "Search students, clubs, or events. Otto threads the right matches in." The button says "Got it". (CH:722-730)

Done and Skip do the same thing: mark the tour seen, clear the flag, drop `?welcome=1`, and stay on the page (CH:733-748).

### Phone (UMT:107-126, mounted at CM:209)
It starts when the flag says "campus", or on `?welcome=1` if the tour hasn't been seen (UMT:205-209, tested at use-mobile-tour.test.ts:50-72). It waits up to 1.5 s for the campus name (UMT:211-240) and polls for the first target for up to 8 s (UMT:287-316).
1. **`#otto-mobile-tour-tabs`**, the tab strip (CM:1073). "Everything's one swipe away." / "Feed, Events, Orgs, Chat, and the Map. Swipe or tap to switch."
2. **`#otto-mobile-tour-feed`**, the whole swipe pager across all tabs (CM:1094). "The campus feed." / the same campus line.
3. **`#otto-mobile-tour-compose`**, the + button (CM:4515). "Your turn." / "Tap + to post text, photos, or video." The button says "Got it".

Done and Skip both mark it seen; no hand-off (UMT:151-155, 362-381).

**Copy bugs.** Phone step 1 names "Chat", but the chat switch is on for everyone and removes that tab (CM:134, 245-256). The test pins that exact sentence (use-mobile-tour.test.ts:76-81), so a copy fix must update the test too. The network leg used to show the Otto tab (UMT:130-142, MobileTabBar.tsx:189), but nothing starts it now.

## 2. First-run layout (follows nothing, in no club)
A newcomer's feed is **not** empty. It carries every post on their home campus; follows only change the ranking (api/feed/route.ts:133-138).

### Computer, all visible at once
- **Left menu:** the vibe. wordmark; Campus, Network, Messages, otto, Settings (LeftNav.tsx:40-160); the profile card with the school strip and the Your clubs menu (nav-identity-chip.tsx:372-376); "My Calendar", an empty month grid. The count badge appears only once there is an upcoming RSVP (LeftNav.tsx:416, 639-656). There is no empty-state sentence.
- **Top bar:** campus name, stats, "Campuses", search, pills Feed/Events/Orgs/Map (CH:5826-5904, 6733-6734).
- **Centre column:** "Feed · {campus}" / "What's on campus today" / "Posts from clubs, orgs, and your network." (CH:7323-7329). Below that come a rolling strip of RSVP'd events and trending tags, hidden when both are empty (CH:7331-7346), the composer (CH:7379), and posts. Empty: "No posts yet — orgs you follow and people from your school will show up here once they post." (CH:7416-7437)
- **Left panel (1400px and up):** "Your clubs" / "Latest on each club's Board". Empty: "Join or follow a club to see its Board here." plus "Find clubs on campus", which opens the Orgs tab (YourClubsPanel.tsx:42-69; tonight-view.ts:77-81).
- **Right panel (1100px and up):** "What's the vibe tonight?", showing school and club events for the whole campus. It does not depend on follows. Empty: "Nothing on campus tonight yet." plus "Next up this week" and "All in Events" (TonightPanel.tsx:67-121; tonight-view.ts:60, 71-72).
- **Otto orb:** bottom right, closed (OttoCorner.tsx:56, 186-210). It opens a panel with two tabs: Otto (notifications, stats) and Messages (OttoSidePanel.tsx:102-121).
- **Not on the campus page:** Trending exists only as chips in the strip. There is no People panel. "Heads up" is now "Coming up" on /otto (OttoUpcoming.tsx:43). The shell gets no right rail (campus-app-shell.tsx:61; CH:1030).
- **Other tabs, empty:** Events "No upcoming events on campus" (CH:10553-10562); Orgs "You don't follow any clubs yet." (CH:13576).

### Phone
Top to bottom: campus banner (CM:1034-1039); one card slot for the confirm banner or push ask (CM:1059-1062); tabs Feed/Events/Orgs/Map (CM:1072-1091); Feed with the Tonight card (hidden when nothing is on), the strip and posts (CM:1123-1170); the + button (CM:1265-1267); the bottom bar Campus/Network/otto/Messages/Profile (MobileTabBar.tsx:51-143).

Empty copy: Feed "The feed is quiet" / "Be the first to drop a post — tap the + in the corner." (CM:1716-1717; differs from the computer's). Events "Nothing scheduled" (CM:2580). Orgs "No clubs here yet" / "Clubs are just getting started at {campus}. Follow the ones you like — posts land in your feed." (CM:3586-3597)

## 3. What is already staged or gated
Nothing appears because of what a person does (nothing like "after your first follow, show X"). What does exist:
- **Panels that hide when empty:** the rolling strip (CH:7331-7346), the folded Your clubs strip (YourClubsPanel.tsx:128-130), the Tonight panel when nothing could be read (TonightPanel.tsx:58-62), the calendar badge (LeftNav.tsx:639).
- **Staged by window width on a computer:** under 1100px, feed only; 1100-1399, plus Tonight; 1400 and up, plus Your clubs (feed-side.css:161-181).
- **Phone, one card at a time:** the push ask is held back for the whole welcome visit, while the tour runs, and while the confirm banner shows (CM:304-325, useCampusTourActive CM:1403-1425).
- **Arrival motion only:** posts and club rows rise in on SPRING_SOFT (Reveal.tsx:19-45; CM:1726-1740).
- **Count floors:** "active now" and "going" counts show only from 5 up (CM:111-114; tonight-view.ts:98-103).
- **Switches that hide tabs:** Chat (CH:6733-6734; CM:134), and Map while visiting a closed campus.

## 4. Where a staged reveal could attach
**Computer**
- **`FeedSideLayout`** (src/components/campus/tonight/FeedSideLayout.tsx:27-61): the two side columns `aside.tonight-feed-left` and `.tonight-feed-right`, each inside a `QuietBoundary`. The grid uses named areas (feed-side.css:17), so emptying a column does not move the feed. This is the cheapest place to add a `stage` prop.
- **`TabBody`** (CH:6817-6868) builds FeedSideLayout. It is the one place to pass a stage in.
- **`CampusTabs`** already takes `hideMap`/`hideChat` and filters the pills (CH:6717-6734). The same pattern could hold back other pills.
- **Otto orb:** the `body.vibe-hide-otto` class hides `#otto-corner` (globals.css:2448-2451, set at CH:646-653). `#otto-corner` (OttoCorner.tsx:187) is a stable target if the tour should point at it.
- **`RollingStrip`** (CH:7339) and **`FeedComposer`** (CH:7379), where they are mounted.
- **Tour end:** `onDone`/`onSkip` passed to `OttoTour.start` (OT:224-225) are the only "tour finished" signal. The engine fires no event (CM:1395-1397).

**Phone**
- **`TabStrip order={tabOrder}`** (CM:1080-1090). The order is already computed in one spot (CM:250-256).
- **Feed pane pieces:** `TonightCard`, `RollingStrip`, `FeedPane` (CM:1125-1170), and the + button's existing condition (CM:1265).
- **Sequencing:** `pushAskSuppressed` (CM:319-325), `useCampusTourActive` (CM:1403).

**Motion.** `Reveal` (src/lib/motion/Reveal.tsx) gives SPRING_SOFT plus an 8px rise and already respects reduced motion (Reveal.tsx:15-17). SPRING_SNAPPY is for taps, SPRING_POP for one celebratory pop (springs.ts:15-24).

## 5. Risks
- **CH is 18,754 lines.** The tour code (CH:655-750) and the first-tab logic (CH:571-590) are self-contained. Put new logic in FeedSideLayout or a new hook file, not in CH.
- **One engine, four users.** OT runs the computer campus tour, the computer network tour (NetworkPageClient.tsx:33), the phone legs and the static profile page (profile.html:13020-13091). profile.html relies on the engine's `otto-tour-active` body class to un-hide widgets (profile.html:916). Changing that class or `start()` breaks the profile tour. The `window.OttoTour` type is declared three times, and all three must match (UMT:32-34).
- **The engine breaks the house rules:** fixed 240 ms curves, not springs (OT:43-46); hard-coded colours, not tokens (OT:28-42, 84); smooth scroll ignores reduced motion (OT:234); no Escape key or focus move, unlabelled dialog (OT:126-130).
- **The dim layer catches every click** (OT:27), so step 1's "click your card" can't be done mid-tour.
- **Hiding a tour target breaks the tour.** On a computer, the bubble floats in the middle (OT:238-242). On a phone, the tour silently never starts and retries on the next visit (UMT:309-313). Meanwhile the push ask stays held back (CM:1416-1419).
- **Hiding a phone tab.** The pager maps scroll position to `tabOrder` (CM:1101), but the panes are fixed sections (CM:1123-1257): drop a tab without its pane and tabs show the wrong pane. `?tab=` links must still land (CM:211-220).
- **MobileTabBar is on every phone page** (campus-app-shell.tsx:62). Hiding Otto or Messages there hides them everywhere. Profile's long-press is the officers' club switcher (MobileTabBar.tsx:161-162).
- **Your clubs' empty state holds "Find clubs on campus"**, the computer's main way into clubs. Don't hide it on first run.
- **Seen flags live on the device and survive sign-out** (leave-device-clean.ts:36-38). On a shared laptop (Demo Day booth, launch-night sign-ups), the second person never gets the tour without Replay tour. A reveal stored the same way has the same gap; a server flag needs a migration and Franky's yes.
- **900-1099px windows** get the tour but only the feed, no side panels (feed-side.css:179-181).
