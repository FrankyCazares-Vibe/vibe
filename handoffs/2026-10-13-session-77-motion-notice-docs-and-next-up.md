# Session 77 (Oct 13, 2026): three more transcripts, the living bloom, the cookie notice, real docs, and what comes next

Read this first in session 78. The S76 close
(`2026-10-13-session-76-close-six-calls-live-and-next-up.md`) still holds for
everything this file does not mention.

## START HERE — session 78

**Franky's order for what comes next (decided Oct 13):**
1. **Usage stats.** "As many stats as we can check" so the team knows where to
   scale and where to spend time. Plan below.
2. **Rate limits and upload caps** (security report #7 to #11, untouched).
3. **The pipeline tracker** (outreach, demos, prospects): later, when Franky
   gives the detail.
4. The live sign-up test can wait (his call). The Junk question stays open.

**Research is assigned to James and Rylan, not to a session.** The two briefs
are in `handoffs/2026-10-13-research-briefs-james-rylan.md`, ready for Franky
to send. Do not run that research unless he asks.

**First ten minutes of S78:**
1. `git branch -r | grep claude/` (Oct 13: `claude/relaxed-davinci-9d11h3`
   has nothing main lacks).
2. Open `src/app/admin/numbers-client.tsx` and its route to see what admin >
   Numbers already counts, before proposing new stats.
3. One Sentry look at feed speed (`span.op:pageload transaction:/campus`, LCP
   by release). On Oct 13 the newest reading was from Oct 11, before the feed
   change, so there was nothing to judge.

**Where things stand.** Live at www.connectvibe.app behind the waitlist. Main
is `64e3739`, deployed (Vercel: success). 2,504 tests. Privacy Policy date
October 13, 2026 (page = text 1,153 of 1,153).

## What S77 shipped

| What | State |
|---|---|
| **Transcript 3 (design tools) and 4 (19 visual styles)** | Sorted against the app. Mockup: claude.ai/artifact/Fmi9BqXH3k21dcDgDgF2zL (private to Franky). He chose **kinetic type and the living bloom**. Split-flap: no. Liquid glass counts and the holographic card: liked less, not built. |
| **The living bloom** (`src/components/bloom/VibeBloom.tsx`, the `vibe-bloom` block in globals.css) | Live on the feed, Network and Settings, phone and desktop, Light and Night. Two small glow layers moved by transform only. Reduced motion paints the old static backdrop. |
| **The kinetic wordmark** (`src/components/brand/KineticWordmark.tsx`) | Live on sign-in, sign-up and the landing's top bar. The wordmark on the two cards went from 18px to 26px. |
| **Transcript 5 (an 18-item "don't get sued" list)** | Audited read-only: 9 done or not needed, 9 partly. The gaps are under "Franky's list" and "Engineering next". |
| "Clubs verified by Vibe" (was "Officially recognized clubs") | Live |
| 60 spoken names on icon-only buttons; the resume redaction bar by keyboard | Live. Like and Comment in the post viewer keep their counts in the name. |
| **A one-time cookie notice** on the landing, waitlist, sign-in, sign-up and forgot-password pages (`src/components/legal/CookieNotice.tsx`, rules in `src/lib/legal/cookie-notice.ts`) | Live. A notice with "Got it", not accept/decline. Policy section 7 changed in the same commit. |
| The phone post card is a plain box, not a button holding buttons | Live. Feed, Events, Orgs and Map scanned at phone size, and Feed, Events and Orgs at 1280: no nested buttons or links left on screen. |
| The Chat pill no longer flashes on the phone Campus page | Live. It shows only when the chat switch answers `false`, or the address asks for chat. |
| README.md rewritten, ARCHITECTURE.md and scripts/README.md added | In git. The README had been the create-next-app template. |
| GitHub: description, eight topics, website link set to https://www.connectvibe.app | Done (the repo is still private) |

No database file was applied in S77.

## Not verified (say so if asked)

- **The motion itself.** The test pane only gives stills. The bloom's layers
  were confirmed running by their computed animation; nobody has watched the
  wordmark land. Franky was asked to look on his phone.
- **Reduced motion** for the bloom and the wordmark: covered by a test and by
  reading the CSS, never switched on in a browser.
- **On top of the bloom:** sheets, the post viewer, the mini messenger, the
  installed app and iOS overscroll colour were not walked.
- **The cookie notice** hides itself whenever it would cover a main button, a
  submit button or the human check. On the phone landing it appears only
  after a small scroll. On the phone sign-in page it was never seen (the test
  account was signed in, which pushes the form under it). The waitlist page,
  the Light look and 800 wide were not walked.
- **The Chat flash:** the server's page has no Chat pill; the first half
  second was not watched. Franky's "chat button" was read as the Chat pill in
  the tab row; he has not confirmed that.
- **Double-tap to like** and the card's Like and Save were not re-tested after
  the card stopped being a button (their code is unchanged).
- **The README quick start** was not run from a fresh clone.

## The stats plan (next build)

Franky wants to see where to scale and where to invest time. From the Kaki
meeting: "pay attention to what students and orgs actually use".

Rules that apply: counts only, never people's records (the Privacy Policy
promises it); a new counter never stores a visitor's IP; if the app starts
collecting anything new, the policy changes in the same deploy.

Candidates, most of them readable from tables that already exist (check each
before promising it):
- **The door:** waitlist joined, code sent, signed up, profile finished,
  school email verified.
- **Sign-ups per access code,** so an ambassador's or a club's code shows who
  brings people in.
- **Coming back:** people active per day and per week, and how many of a
  week's sign-ups return the week after.
- **What gets used:** posts, comments, likes, reposts, saves; events made and
  RSVPs; follows; club joins; chat messages per club (a count per club, never
  the words); Otto opens; map opens if they are counted at all.
- **Clubs:** how many have an officer active this week, an event this month,
  a chat with messages.
- **Where and how:** by campus and by school; phone or desktop; the page-open
  tally already counts three signed-out pages.

Start by listing what admin > Numbers shows today, then bring Franky one table
of "have it / can count it from what we store / would need new collection".

## From the Kaki meeting (Oct 13)

Saved in memory (`project_kaki_meeting.md`). In short: users before
monetization; students may be the users while national Greek organizations,
insurers, housing corporations, foundations or local businesses are the
customers; research Lounge and Rally; keep Vibe simple and campus-first; clubs
running themselves through Vibe deserve development priority; an ambassador
network of influential students. Billing off, video posts parked and the
resume features hidden already match it.

## Franky's list

- Send James and Rylan their research briefs (the file above).
- Look at the bloom, the wordmark, the cookie notice and the Campus page on
  his phone and say what feels off.
- Whether the liquid glass counts or the holographic card ever get built
  (he liked them less; nothing is waiting on this).
- The detail for the pipeline tracker when he is ready.
- Still open from S76: the live sign-up test (Inbox or Junk), the sign-in note
  retest, dark words on coral in his chat bubbles, the real-phone walk, Search
  Console, Sentry's "Prevent Storing of IP Addresses", the Supabase Auth
  switches, the lawyer file for James, his answers on the Terms review.
- From the transcript 5 audit: Terms v3 (both documents promise new Terms in
  October); a registered copyright (DMCA) agent, which sits with James and the
  lawyer; a postal address for the LLC (the policy promises one before any
  news email).

## Engineering next, after the stats and the limits

- The second half of feed speed (S76's item), once Sentry has readings.
- Bloom on phone Messages (`MessagesHome` paints flat cream, so it has none),
  and on the static profile, Messages and onboarding pages.
- The kinetic wordmark on the other cards that carry the small wordmark
  (forgot password, the code screens, not-found), if Franky wants it.
- A nested-button scan of sheets, menus and the post viewer.
- Refund and auto-renewal wording must be live before billing is switched on.
- `noreply@vibe.local` as the organizer in calendar downloads (from the audit,
  not checked this session).
- Four files still say "the repo is public" (`.gitignore`, `.vercelignore`,
  `.env.example`, `mobile/README.md`); GitHub says private. Left as is.

## Things a new session must know

- **A wrapper with its own background around a bloom screen hides the bloom.**
  The layer is fixed at z-index -1 in the root stacking context, and
  globals.css clears the body and the phone shell while one is mounted.
- **A docs/ folder cannot be used:** on this Mac it is the same folder as the
  gitignored `DOCS/`. Developer docs sit at the repo root.
- **The preview pane shows a still for files outside the project,** and it
  re-syncs the tab to the account's saved theme (the seed member is on Light).
  For a mockup, screenshot with gstack's Playwright instead.
- **psql is not installed.** Reach the local database with
  `docker exec supabase_db_vibe psql -U postgres -d postgres`.
- A subagent can die on a dropped connection before changing anything; resume
  it with SendMessage instead of starting over.

## Local environment (Oct 13)

- **Sign-up is CLOSED in the local database** (`signup_open` false), at
  Franky's ask, so the local landing says "Join the waitlist" like the live
  site. `supabase/seed.sql` opens it again on a reset. To open by hand:
  update `public.app_settings` where key = 'signup_open'.
- The dev server was left running on port 3000 at Franky's ask.
- An untracked `.agents/` folder (it holds `skills`) was there at the start of
  the session and was left alone.
