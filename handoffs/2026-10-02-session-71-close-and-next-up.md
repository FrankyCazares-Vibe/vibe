# Session 71 close (2026-10-02): the new chat is live on phones; next = the dated October work, then desktop chat, the landing page and a demo

Full detail of S71 is in `2026-09-30-session-71-audit-chat-waves-1-2.md` (the key leak and its fix, both chat audits, wave 2 going to production, the week swipe and month calendar). This file is the short state, what is owed, and where session 72 starts.

**State.** `main` is deployed (Vercel success). Production database is at migration `20261001120000` (97 rows recorded). The new chat (`chat_v2`) is ON for the three founders and the SAE club, phone only. Franky's first phone test, Oct 2: "everything seems to work". The same day the week strip got swiping and a month calendar (`00257b5`, contract 17.11), checked live. Franky will send his fine-tuning notes later.

Research behind this file (four readers, two checkers, all read-only) is in `handoffs/s72-prep/`: `todo-verified.md` (73 items, each with its source), `desktop.md`, `landing.md`, `obsidian-verified.md`, and the long notes in `notes/`.

## START HERE — session 72

**0. Ask Franky first (dated work depends on the answers):**
- Is the `hello@connectvibe.app` mailbox done (f2, due Sun Oct 4)?
- Has the D-U-N-S number arrived? Did James file the LLC amendment (Oct 3)? Is the EIN done?
- What did the founders' meetings settle? Nothing from Sept 26 is written down.
- His thoughts on the Terms review (`handoffs/legal-2026-09-29/12-results.md`: ten outcomes, nineteen calls). The Terms work has been stopped on this since Sept 30.
- His fine-tuning notes from the phone test, and whether he sent a real photo DM.
- The reference websites for the landing page.

**1. Then work in date order.** October is full. The three new asks (desktop chat, landing page, portfolio) are real work on top of dates that were already tight, so they are slotted below, not stacked on top.

| When | What | Who |
|---|---|---|
| This weekend | Real-phone walk of the new chat (long-press on cards, the sheets, Board replies, the keyboard, the iPhone edge swipe next to the week swipe). Fine-tuning notes. | Franky |
| This weekend | Two-factor sign-in on Supabase, Vercel, GitHub, Stripe, Cloudflare, Resend and the inboxes. Open the company Google account and the Firebase project (neither needs D-U-N-S). | Franky |
| Sun Oct 4 | f2: the hello@ mailbox. First Sunday meeting. | Franky |
| By Tue Oct 6 | Answer the Terms review calls. Pick the desktop chat layout from mockups (see below). Send the landing page references. | Franky |
| Oct 5 to 9 | Terms v3 written (James sends the lawyer one list by Oct 9). Demo days start: club creation only works on a computer, so create each club the night before. | Claude session, James, Rylan |
| Fri Oct 9 | f9: first Android build. Android Studio's setup wizard has not been run on this Mac (`~/Library/Android/sdk` is missing): that click is Franky's. Store call: store apps at launch, or the home-screen version. | Franky |
| Before Oct 15 | The old-screen chat fixes that flag-off users see: M2 to M5 and M8 (a club room acting like a DM with a random member, "Clear chat history" on club rooms, desktop Campus › Chat never marking read, no Report or Delete there). The 1,000-row read in the old Messages list. Security sentinel and feature sentinel over everything since Sept 27. | Claude session |
| Thu Oct 15 | Chat freeze: nothing a flag-off user can see changes after this. Work behind the flag can continue. | |
| Before Oct 16 | Support page Block wording. Push notifications on in production (the push migration must be renumbered; needs Franky's yes). The new chat checked inside the store apps on a real device (F10). Store notes: the review accounts must never join SAE. | Claude session, Franky |
| Fri Oct 16 | Store submission, both stores. | Franky |
| Before Oct 26 | Report and Remove on text Board posts (contract 17.2 L3). The sign-up takeover fix. Moderation gaps in the new chat. Measure the database traffic of the 4-second checks (feeds the Supabase Pro call, about $25 a month, recommended yes). | Claude session |
| Fri Oct 23 | Rylan's ten-clubs check. Desktop chat go or no-go. Walk the app as a brand-new student. | all |
| Mon Oct 26 | New chat on for everyone (`CHAT_V2_ALLOWLIST=*`), by Franky's hand in Vercel. | Franky |
| Oct 31 | The launch deadline. | |

Zero clubs are signed today (SAE is a test page). That is still the main focus for the campus side.

## The three new asks (Franky, Oct 2)

### A. The new chat on desktop

**Today:** a laptop shows the old chat in three places (`/messages` is an iframe of `public/html/messages.html`; Campus › Chat still looks like Discord; the chat bubble on the profile page). None of them reads the flag. On a laptop a poll shows as plain text, nobody can vote or take a spot, an event chat cannot be opened at all, and Board replies never show. No desktop mockup exists: all 26 boards are phone.

**Proposed layout (recommended): one inbox, three columns.** Left: Messages, "Your week" on top with arrows, the same rows as the phone. Middle: the open room (club header, room chips, Board strip, thread, composer). Right, closable: details (Up next, members, RSVP). The month calendar is a popover; sheets become centred dialogs; hover shows react, reply and "...". Campus › Chat leaves desktop when the flag is on.

**What carries over as is:** every route, all the rules in `src/lib/chat/`, about 20 inner pieces (rows, room chips, the Board, the thread, the composer, the three card views). What is phone-shaped and needs a wrapper: the full-screen drawers, the bottom sheets, the Back-button layering, long-press, the swipe.

**Honest answer on dates.** The whole job cannot make Oct 26. The core can, with no slack, if (1) Franky picks a layout from mockups by Tue Oct 6, (2) it gets its own switch (`CHAT_V2_DESKTOP`) so the phone never waits for it, and (3) go or no-go is decided Fri Oct 23. The roadmap that James and Rylan read says desktop follows launch; update that line if the plan changes.

**Order:** mockups on the design canvas (Light and Night) → Franky picks → a contract `wave-3-desktop-contracts.md` and a plan critic → the old-screen fixes above (same files) → build behind the switch → walk → decide.

**Calls for Franky (recommendation first):** layout A; aim for Oct 26 with the Oct 23 escape hatch; keep today's desktop DM thread for v1 (it has typing dots, Read and the @mention picker, which the phone's does not); cards stay phone-size in a centred column. All ten calls are in `s72-prep/desktop.md`.

### B. The landing page, and a demo

**Today's page** (`src/components/landing/home-landing.tsx`) opens with Otto typing for several seconds, then a three-ring game (PULSE / SCENE / CONNECT), then sign-up on the third screen. A visitor who has never heard of Vibe does not learn what it is, who it is for, what it looks like, or where to click. There is no screenshot, no door for clubs, and no "not affiliated with IU or Purdue" line (the roadmap asks for one). The page still wears the May look; the link preview already uses the new brand.

**Proposed:** top bar (wordmark, Log in, Sign up) → a hero that says what Vibe is and for whom → three things you can do, each with a real screen → a 30-second product peek → two doors (students, clubs) → the call to action → footer with the not-affiliated line. Always Night for launch (near-black, coral, the soft wordmark).

**Hero line, recommended:** "The social app for the Indianapolis campus." with "Vibe is where IU Indy and Purdue Indy students find their clubs, their events, and each other. Free with your school email." The tagline stays under the wordmark. Never name Instagram; no club or student numbers.

**The demo, recommended: a short screen-recorded video** (25 to 35 seconds, phone layout, Night, eight shots) recorded from the local practice copy with an invented cast, so no real student ever appears. It needs a new demo seed (today's test names look fake on camera). The same footage serves Instagram, the store screenshots and the portfolio. A clickable demo site is a November job, as a separate site on its own fake-data database; nothing fake goes into production (session 55 removed exactly that).

**Order:** Franky sends 3 to 5 reference sites (for each: the one thing he likes) → build the new page with still screenshots the week of Oct 5 → record the final video after the Oct 15 freeze (week of Oct 19) so it shows the chat everyone gets on Oct 26.

**Calls for Franky:** the hero line; keep or retire the Otto intro and the rings (recommended: retire, keep the orb as an accent); where "Bring your club" goes (recommended: an email to help@, answered by Rylan); the school-names wording (ask James for the lawyer's answer). All twelve are in `s72-prep/landing.md`.

### C. Franky's portfolio site

A new, separate repo (for example `~/franky-site`) with its own Vercel project and domain. Not in `~/vibe`, not in `~/vibe-marketing`. Static pages (Astro), no database, no login. It holds the Vibe case study with the demo video, two to four other projects, about, resume, contact. Keep off it: the journal, security findings, real student data, equity language. **When:** after the demo video exists and after the Oct 16 store submission. **Gather now:** what the site is for (internships, recruiters, investors, clients), a three-sentence bio, other projects with screenshots, the resume PDF, and an OK from James and Rylan on how the team is described.

## Obsidian: why nothing is connected, and the fix

**Why.** Obsidian only draws a line when a note contains a `[[link]]`. The vault shows 443 notes; 425 of them are the handoffs folder (through the `Founder/Handoffs` link), and the handoffs point at each other with file paths in backticks and "session 63" in plain words. That is text to Obsidian, not a link. Only 14 notes hold a real link, so 404 of 443 (91%) are loose dots. The one hub, `Founder/Handoffs Index.md`, was written by hand and stops at session 52. Claude's memory notes do link to each other, but they live outside the vault. Settings are fine; nothing is hidden. One pointer is broken: `Founder/vibe_journal.html` still points at the journal's old place.

**Fix (recommended, about 1 hour, checked by a second pass):** one small script, `scripts/vault-map.mjs`, that writes ONLY into `~/vault/Founder/Map/`:
- `Vibe Map` (home), `All Handoffs`, one note per session (23 to 71, each linking the previous, the next, its handoff and the docs it cites), one hub per handoffs folder, and read-only COPIES of the memory notes.
- It changes no handoff file, does not touch `~/.claude`, and does not overwrite the hand-written index. Run it at each session close so it cannot go stale.
- Links are written as the exact path (nine handoff files share a name, nine have a dot in the name).
- By hand: one pointer line in `Handoffs Index.md` and `Vibe.md`, four stale lines in `Journal.md`, re-point the journal link. In Obsidian, Franky sets four graph colours (2 minutes).

**Not recommended:** linking the memory folder live into the vault (a rename in Obsidian would silently change Claude's memory), or writing links into 300 committed handoff files.

**Five-second tidy view now:** in the graph's filter, turn "Orphans" off. It hides the loose dots; it connects nothing.

Also noticed: the vault has no backup (the Daily notes exist only on this Mac), and `Inbox/` is empty. Details: `s72-prep/obsidian-verified.md`.

## Small choices left from the week swipe (for Franky's fine-tuning)

- Two faint arrows at the edges of the day strip, shown at rest (`EDGE_HINTS_AT_REST` in `home/YourWeek.tsx`; one line to turn off).
- The month calendar opens from the bottom; the mockup hung it from the top.
- Tapping a day opens the calendar (it used to scroll the cards to that day).
- Not tested with a real finger: the swipe beside the iPhone's edge-back gesture, the sheet's drag-to-close against the grid's swipe, a 320px-wide phone.

## Housekeeping owed

- The journal's newest entry is Session 66: S67 to S71 are missing.
- The published roadmap still says the chat arrives the week of Oct 5, and that desktop follows launch. Read the live page before republishing (it has Edit mode).
- Two unused rows are still in Vercel (`SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`): Franky's click, no rush.

## Local environment

- Worktree with the local stack keys and the flag on: `scratchpad/wave2` of the S71 session (branch `chat-week-nav` = `00257b5`). It will not exist in a new session: make a fresh worktree, copy `node_modules` with `cp -cR` (Turbopack refuses a symlinked one), and write `.env.development.local` with the local keys, `CHAT_V2_ENABLED=true`, the allowlist (avery, blake, emery) and the local SAE id.
- Sign a seed account in without a password: `node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs <who>`, then set the cookie in the page. Never leave the staged cookie file in `public/`.

## Gotchas learned in S71

- **Cloud handoffs sit on their own `claude/*` branch.** At session start: `git fetch && git branch -r | grep claude/`.
- **Never `REVOKE EXECUTE` on a public function from anon, authenticated or service_role** on this Postgres image: the permission error crashes the database. Grant to all three and refuse inside the function or by table privilege.
- **Browser pane at 375px:** a click by `ref` lands in the wrong place; click by coordinates (page px is about 0.967 of the screenshot's). The first click after a navigation only focuses the tab. The console keeps old errors from a half-saved edit: reload before believing one.
- **A "stalled" agent is usually the Mac asleep.** Keep `caffeinate` running; the app also stops the dev server when idle.
- **A Secret-type Vercel variable cannot hold a `NEXT_PUBLIC_` value.** Delete and recreate it as Config. The build now refuses a secret key in a public slot (`src/lib/supabase/key-guard.ts`).
