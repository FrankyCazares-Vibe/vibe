# Meeting with Arash, Sun Oct 25, 2026 (5:30 PM): notes

Franky's notes, as he sent them (Oct 28; made with Granola, transcript link at the bottom). Arash is a friend who
signed up live during the call, one of Vibe's first users from outside Franky's circle, and offered to build: a first
Otto chatbot and the feed's ranking. Two developers he knows may reach out. Next meeting: **Sun Nov 1, 5:30 PM**, the
day after the public launch. "Auto" in the transcript is **Otto**.

## What it changes (Oct 28 reading, a recommendation for each)

- **The GitHub repo is public since the call.** It was opened so Arash could read it. Anyone can read 1,897 handoff files: the security sentinel reports (attack paths, some fixes
  still owed after launch), the legal attacker review, production facts, and meeting notes naming Parker, Eli, Kaki
  and others. The private journal is readable in 50 old commits. Not exposed: `DOCS/` (money), `vibe-hq/`, the
  journal file itself, `.env.local` (only `.env.example` is in git). 0 forks; the one star is Franky's own.
  **Franky's call (Oct 28): leave it public.** From here on, handoffs and commits are written as public: no secrets,
  codes, people's details or private links in git.
- **Arash's sign-up hit two problems.**
  - The verification code was slow and landed in Junk: the same thing seen Oct 13 with IU mail. Still open; the
    shared code (below) skips only the invite email, not this one. Recommendation: tell every new person "check
    Junk" until Resend's paid plan and a sender reputation fix it; a mail-delivery look after launch.
  - "The access code expired" was most likely not an expiry. Two access-code emails went to the same person
    that evening (the second at 5:48 PM), and a new code replaces the old one. The first email's code then gets "We don't recognise that access
    code, or it has expired." Recommendation: after the freeze, one line in the access-code email ("if we sent you more
    than one code, use the newest") and the same in that refusal's words.
  - The master code Franky planned in the call: **done Oct 26** (`handoffs/2026-10-26-shared-access-code.md`; 25
    school-email places until Oct 31 midnight).
- **Otto as an AI agent ("Auto" in the notes).** Arash researches open-source models and demos a chatbot on Nov 1;
  first small jobs (reminders, scheduling), later "make an event for my club at 8". Parker and Eli both said to prove
  the core (events, club updates) first, so nothing ships before the 30-day retention read (~Nov 30); a side prototype
  from a volunteer costs Franky nothing. Rules for it: build on the local stack's sample data, never production; no
  real person's data reaches any model until the Privacy Policy names the model company and what it sees (today it
  names Claude only as the coding assistant). On the model: at ~20 users cost is near zero either way; for actions
  that touch calendars and events, hosted models call tools far more reliably than small open-source ones.
- **The feed.** It already does more than the notes say. `scoreFeedRow` (`src/lib/iu/community-scope.ts`): likes +
  2 × reposts + comments, fading with age; people and clubs you follow ×1.6; your home campus ×1.35; +3 for each
  repost by someone you're connected to. `/api/feed?sort=recent` is a newest-first mode. Missing: a "following only"
  mode, saves as a signal, and the deep-scroll fallback. So the 1-2 page spec is mostly those three plus weights.
  Parker and Eli both said the feed isn't the core. Recommendation: Franky writes the spec in week 1 after launch;
  Arash builds "following only" first.
- **Working on the code.** Arash (and the two developers if they come) work on the code and the local stack only:
  no production database, Vercel or Supabase keys. The Privacy Policy says one person can see people's data; that
  stays true only while it stays that way. If anyone gets production access, the policy changes the same day. No
  equity language anywhere (standing rule).
- **A security reviewer from Purdue's cybersecurity program:** matches the plan for a live test before the store
  apps. Recommendation: after launch, with a written scope (read-only, no live attacks on production without Franky).
- **Slack:** Franky invites Arash. James and Rylan are there but not active (Franky is solo since Oct 24).
- Small corrections to the notes' stack: the site runs on Vercel (Cloudflare does the human check and photo storage);
  the front end is Next.js (React).

## Action items and where they stand (Oct 28)
| Item | Who | Status |
|---|---|---|
| Feed spec, 1-2 pages | Franky | Open; recommend week 1 after launch |
| Repo access and Slack invite for Arash | Franky | Repo public by choice; Slack invite not sent |
| Verification email speed | Franky | Open (Junk) |
| Master access code | Franky | Done Oct 26 |
| Open-source model research, Otto chatbot demo | Arash | Due Sun Nov 1 |
| Purdue cybersecurity reviewer | Franky | Open |

## Franky's notes, as sent

**Vibe Platform and Tech Stack**

* Vibe: campus social app for IU/Purdue, branded as ConnectVibe (LLC)
   * Lets students find clubs, events, and each other via school email
   * LLC under James's name (fraternity brother), but set up as multi-ownership, easily changeable
* Current stack:
   * Frontend: React
   * Backend/DB: Supabase
   * Domain/hosting: Cloudflare
   * Email: Resend
   * LLM dev: Claude Max Pro ($200/month)
   * Code: private GitHub repo (made public during call for Arash's access)
   * Docs: Obsidian vault for session files and handoffs
* ~20 users so far, mostly friends; Arash would be among first real external users

**Auto (AI Agent) and Feed Algorithm**

* Auto: planned AI agent feature within Vibe
   * Near-term scope: simple agentic tasks (calendar reminders, scheduling)
   * Stretch goal: full event creation via natural language ("make an event for my club at X time")
   * Agreed to start small and expand based on traction
   * Model options: open-source (lighter, cheaper) vs. OpenAI/Anthropic APIs (more capable, costlier)
   * Arash to research best open-source LLM this week; aims to demo a working chatbot by next meeting
   * Needs GitHub/codebase access to understand backend and API connections before integrating
* Feed algorithm: currently surfaces posts by most likes and reposts
   * Franky wants a dynamic, refreshing feed (Twitter-style, not static top-posts)
   * Reposts from connections should carry more weight than reposts from strangers
   * Two modes: "everyone" (default) and "following only"
   * Arash can build this; needs a 1-2 page spec from Franky defining priorities and logic

**Onboarding Issues and Next Steps**

* Live onboarding walkthrough with Arash surfaced two bugs:
   * Email verification code slow to arrive (lands in spam/junk; Arash's went to junk)
   * Access code expired before Arash could use it; had to use a club invite link as workaround
   * Fix: Franky plans to create a master access code for waitlist approvals
* Cybersecurity review: Arash doesn't have a contact; suggested searching Purdue's cybersecurity program
* Two full-stack developers Arash knows have been briefed on Vibe and may reach out to Franky
* Slack workspace exists; Franky to invite Arash (two other co-founders are on it but largely inactive)
* Next meeting: same time (5:30 PM), same day, next Sunday (1st November 2026)

**Next Steps**

* Write 1-2 page feed algorithm spec (Franky). Define post-ranking priorities: connection-weighted reposts, likes,
  comments, saves, and relevance fallback for deep scrolling.
* Share GitHub repo and Slack invite with Arash (Franky). Repo is now public; Slack invite still to be sent.
* Fix verification email speed and build master access code (Franky). Slow delivery and expiry caused onboarding
  failure; master code simplifies waitlist approvals.
* Research open-source LLMs and prototype Auto chatbot (Arash). Target a lightweight, operable demo for the next
  meeting on 1st November.
* Search Purdue's cybersecurity program for a reviewer (Franky). Arash has no contacts; Purdue has a strong program.

Transcript: in Granola (Franky's account; the share link is kept out of this public repo).
