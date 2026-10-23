# Meeting with Eli Serrano, Oct 23, 2026: notes

Franky's notes, as he sent them (S81, Oct 23). Eli built Airoma, an augmented-reality social app on the IU
Bloomington campus (~400 downloads, VC-backed, shut down when retention fell week over week), and switched his
degree from entrepreneurship to sociology to study how social networks form. Same day Franky onboarded the
computer science club's president (see the S80 close handoff, "The CS club").

## What it changes (S81 reading, for the priorities)

- **The 30-day retention check is the first real KPI.** About 30 sign-ups, then: are they still active 30 days
  later? With public launch on Sat Oct 31, the first read is around **Sun Nov 30**. Tracked in the KPI board.
- **Interviews join Parker's ask.** Parker: 10+ students at a general campus event, plus 2 club owners and 2
  general students in user tests. Eli: ask the Mom Test way (what did you last do, not "would you use this").
  One interview list for both, Sebastian can help find people. Tracked in the pipeline.
- **Switching cost is the onboarding problem.** Vibe arrives as app number six. The first minutes have to give
  something the other five don't (your clubs and tonight's events in one place) before asking for anything.
  This feeds the onboarding and campus tour review (S81).
- **Otto: validate the core first.** Eli's note matches Parker's: events and club updates are the core; agent
  features come after people show they care. Otto as the *guide* in the tour costs nothing and fits; Otto as
  an AI agent stays after launch.
- **Money: nobody obvious pays yet.** Students won't, universities buy slowly and build in-house, local
  businesses don't need a small app. Same answer as the Kaki meeting (national Greek orgs, insurers, housing
  corps). Study how Luma, Eventbrite and Partiful make money and where they started.
- **Reading:** "The Cold Start Problem" (Andrew Chen). Eli will send a free link; copies to borrow in Bloomington.
- **Web or app:** students don't think of websites as social apps. Not urgent; the store apps are already the plan.

## Vibe: background and evolution

* Started as a LinkedIn competitor concept, inspired by the lack of a connection-based rival
* Grew to include jobs, clubs, events, a main feed, and a clips section, but became too bloated
* Pivoted after feedback from Sam Beat (founder of Cotonai): treat users like babies, keep it simple
* Stripped out jobs and opportunities; refocused on campus life exclusively
* Current premise: "your campus in your pocket," centralizing orgs, events, and student connection
   * IU Indianapolis has 300+ student organizations spread across Instagram, Discord, GroupMe, Flare
   * Students can't even find clubs on Instagram without knowing their exact handle
   * The existing directory (Spot) is unknown to most students and universally disliked by those who do know it

## Eli's background and Airoma

* Built Airoma (airoma-website.vercel.app): augmented reality social media inspired by Pokémon GO
   * Concept: point your camera at the world to see geo-tagged posts, forcing users outside
   * Got ~400 downloads on IU Bloomington campus; received VC backing
* Retention collapsed quickly: users dropped off week over week
* Key lessons learned:
   * Switching costs: users don't replace existing apps, they add another one, splitting attention
   * Be Real was a direct competitor for time, splitting users 50/50
   * Monetization is extremely hard for social/dual-sided marketplace apps
      * Can't charge end users
      * Local businesses (e.g., Bloomington) don't need extra marketing for a 400-person app
      * Universities won't pay: 3-5 year procurement cycles, prefer building in-house (IU has ~100 engineers)
   * Eventually shut down despite VC backing; couldn't find a sustainable revenue model
* Changed degree from entrepreneurship to sociology to understand social network formation

## Core challenges for Vibe

* Switching cost problem: Vibe becomes app #6, not a replacement
* Monetization gap: students won't pay, local businesses may not need it, universities won't buy quickly
* User motivation: many students are commuters with jobs and no time for clubs, even if discovery were easy
   * Org Fest exists already as a centralized discovery moment, yet only ~20 people show up
* ICP uncertainty: students vs. clubs/orgs as the primary customer
   * Clubs likely won't pay either, but may be more motivated to maintain a presence

## Eli's recommendations

* The Mom Test: ask behavioral questions, not yes/no validation questions
   * "When did you last try to find an event, and what did you do?" surfaces the real problem
   * First answers are usually symptoms, not root causes
* Read "The Cold Start Problem" by Andrew Chen (a16z partner, helped scale Uber to 10M users)
   * Covers network effects, LinkedIn's early private-network strategy, why there's no LinkedIn competitor
   * Free version available online; Eli will send the link; physical copies in Bloomington to borrow
* Study comparable platforms: Luma, Eventbrite, Partiful
   * How do they make money? How did they scale? Where did they start geographically?
* Snapchat Plus context: only 3% of Snap's revenue, ~10M paying users globally; personalization is growing but
  not yet a primary revenue driver
* Form factor question: college students don't associate websites with social apps
   * Not urgent to change now, but worth validating whether web is the right surface
* Parker's framing: start as a student directory (like early Facebook), earn trust, expand later
* Retention experiment: get 30 signups, check if they're still active 30 days later

## Vibe product demo and current state

* Profile: banner, picture, bio, tags, clubs, projects, resume upload (legacy LinkedIn-era feature)
* Campus feed: hashtags, club announcements, live campus events (e.g., IU Indy vs. Ball State swim meet)
* Organizations: profiles, past events, member vs. follower distinction, officer-only controls
* Club workspace (Discord-style): lounge chat, event chats, announcement board, polls
* Cross-campus browsing: can view other campuses (e.g., Bloomington) but can't post there
* Color theming: red for IU email signups, black and gold for Purdue
* "Auto" feature (Otto): currently a notification/stats center; vision is an AI assistant or cross-platform
  marketing agent
   * CS club president (onboarded today) interested; suggested API integration or custom LLM
   * Eli's note: validate that people care about the core before adding agent features

## Next steps (from the meeting)

1. Read "The Cold Start Problem" by Andrew Chen. Eli will send a link to the free version; physical copies
   available to borrow in Bloomington.
2. Run Mom Test-style user interviews with club organizers and students. Ask behavioral questions about past
   discovery attempts, not yes/no problem validation. Sebastian can help identify who to talk to.
3. Run a 30-day retention check on new signups. Get ~30 users on, then measure whether they're still active
   after 30 days to validate core engagement.
