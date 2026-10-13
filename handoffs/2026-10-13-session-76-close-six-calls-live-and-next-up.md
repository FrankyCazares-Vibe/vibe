# Session 76 close (Oct 13, 2026): the six calls are live, the human check is on, and what comes next

Read this first in session 77. The long record of S76 (Oct 11 to 13: the video
transcripts, the new tools, the launch checklist audit, both build waves, the
human check going on, the sign-in note) is
`handoffs/2026-10-12-session-76-videos-tools-launch-checklist.md`. This file
is where things stand and the plan forward.

## START HERE — session 77

**What Franky is doing.** He sends transcripts of AI / vibecoding videos, one
at a time, and wants each applied to Vibe: check it against the real app, do
what needs no decision, bring him the calls that are his. Two are done (below).
**He will add another transcript in S77.** How S76 handled one that turned out
big (a 20-item checklist): a read-only audit workflow (five checkers, a skeptic
per group), one table for him, then build waves of four file-owned batches with
a reviewer and a repair pass each, then the main session's own gate and browser
walk before any push.

**Where things stand.** Live at www.connectvibe.app behind the waitlist, 20
accounts, build `dpl_CCsMAKxUu4CmdsPfLN9UvTzyXhea` (main `6b1dc13`). 21 commits
in S76. Privacy Policy date: October 13, 2026 (page = text 1,150 of 1,150).
2,491 tests.

**Model rule:** Opus 5.5 with ultracode; Fable 5.1 only for the sentinels.

**First ten minutes of S77:**
1. `git branch -r | grep claude/` (Oct 13: nothing main lacks).
2. Ask Franky the three things under "Franky's list" marked FIRST.
3. One Sentry look (it is connected): `span.op:pageload transaction:/campus`,
   LCP by release, to see what the feed change bought (before: 2.2 s typical,
   4.1 s slow), and one browser speed report from release `82cced3` or later
   to confirm no element name carries a person's name.
4. Then his next transcript.

## What S76 shipped, in one screen

| What | State |
|---|---|
| **Video 1: "is there an MCP, an API or a CLI?"** | Sentry and Cloudflare connected, the Vercel command-line tool installed and signed in. Both crons confirmed working. Resend NOT connected on purpose (its log shows recipients). |
| **Video 2: a 20-item launch checklist** | Audited: 8 done, 1 not needed, 11 partly. Detail: `handoffs/2026-10-12-launch-checklist-audit.md`. |
| Sitemap, page names, share cards | Live |
| Reset-email limits, plain error sentences, photo labels for screen readers | Live |
| Sentry no longer receives element labels or account ids (a reviewer's find) | Live; policy 3d says so |
| Terms name CONNECTVIBE. LLC, the draft paragraph is gone | Live; the county waits for v3 |
| **The human check (Cloudflare Turnstile) on sign-in, sign-up, resend** | **ON since Oct 12 night.** Off order: Supabase's switch FIRST, then the Vercel key. `handoffs/2026-10-12-turnstile-policy-and-steps.md` |
| Visit tally (`page_open_tally`, admin > Numbers) | Live and counting; no visitor IP stored |
| Chat photos made smaller before sending (phone and desktop) | Live; a real upload has never been seen |
| Light-look contrast: darker text, dark words on coral | Live. **Franky has not answered whether dark words in his own chat bubbles are OK** (he was sent the screenshot). Undo: the four `--on-coral` lines in `MessageBubble.tsx` |
| Feed speed: the server sends each device its own screen first | Live, **half of the goal** (below) |
| **The sign-in note** for Forgot password typed with a school or personal email | Live Oct 13; reworded the same night |

Database files applied on production in S76, both through the connector and
recorded: `20261012180000_page_open_tally`, `20261013090000_email_kind_signin_hint`.
Franky also ran the `users_active_count` grant by hand (S75's leftover).

## The open problem that matters most: school mail goes to Junk

On Oct 13 the first real sign-in note reached Franky's IU inbox within about a
minute (so link-free mail is no longer slow) but **Outlook filed it under
Junk**. The mail records are in order (SPF on `send.connectvibe.app`, DKIM for
connectvibe.app, DMARC `p=none`), so it is sender reputation and wording, not a
setup error. The note was reworded to drop the word "password".

**Nobody knows whether the sign-up and school-verification CODE emails are
junked too.** If they are, a new student sees "I never got my code". How to
find out: the owed live sign-up test with James's or Rylan's school email,
looking in Inbox AND Junk. If codes are junked: read Cloudflare's DMARC
reports first (so replies from hello@ and help@ are not caught), then tighten
the policy to quarantine, and ask testers to mark Vibe as a safe sender.

## Franky's list

- **FIRST: the live sign-up test** with James's or Rylan's school email. Time
  the code email and note Inbox or Junk. (Open since Oct 5; now it also
  answers the Junk question.)
- **FIRST: retest the sign-in note** with his IU address (one note per address
  per UTC day, so any time after 8 pm on Oct 13). Did the new wording stay out
  of Junk? He was told to click "It's not junk" on the first one.
- **FIRST: his answer on the chat bubbles** (dark words on coral in Light).
- The real-phone walk: the new chat, sending a chat photo, the new button
  colours, the human check on sign-in.
- Google Search Console: verify the domain (a DNS record in Cloudflare),
  submit `https://www.connectvibe.app/sitemap.xml`, ask for a re-read.
- Sentry > project > Security & Privacy > "Prevent Storing of IP Addresses",
  then tell the session so it can re-read a report (the city Sentry adds is
  not in the policy).
- Supabase Auth switches still owed from S75: secure password change, the
  "password changed" and "email changed" emails, emails per hour.
- The lawyer file for James; his answers on the Terms review
  (`legal-2026-09-29/12-results.md`); the duplicate sign-up decision.
- Small: open the Riley Children's link on the SAE page once; check whether
  Vercel Speed Insights is on (nothing uses it).
- Apple: still parked.

## Engineering next, in order

1. **Whatever the Junk test shows.** If codes are junked, that outranks
   everything here.
2. **The second half of feed speed.** A phone still downloads the desktop
   feed's file (about 74 KB compressed) because `CampusMobile.tsx` imports nine
   things from `campus-home.tsx`. Move those shared pieces into their own file
   (and `CampusSearchOverlay` out of CampusMobile, `UserRow` out of
   NetworkMobile); Messages has its own smaller step. Read the Sentry numbers
   first: the first half may have bought most of it.
3. **Rate limits on the routes with none, upload caps and type pinning**
   (security report #7 to #11; untouched in S76).
4. **Terms v3** once Franky answers; both the Terms banner and Privacy section
   13 promise new Terms in October.
5. **The static pages' second half of the browser rule** (inline scripts into
   files, about 280 handlers).
6. Leftovers the S76 reviewers listed (in the long record): the desktop
   composers still show raw error text; greyed-out buttons keep white words;
   calendar pills in other colours; a Night gold chip; a waitlist link on the
   signed-out club page and `/get`; three unlabelled photos in ProfileMobile.
7. The Next.js patch bump with a full walk; a live pentest on staging.

## Things a new session must know

- **Turnstile is ON.** Any NEW browser call to the sign-in service must pass
  `options.captchaToken` or it is refused. A Vercel preview build cannot sign
  in (no key there, same Supabase). Local dev is unaffected.
- **Forgot password works on the SIGN-IN address.** 15 of 20 accounts sign in
  with a personal address and hold their school address as a second one.
  Franky's own sign-in is his Gmail. Test with the right one.
- **A counter must never store a visitor's IP.** The tally keys its limit on a
  daily scrambled code (`src/lib/tally/network-code.ts`).
- **The policy changes in the same deploy as the code,** in the text file, the
  page, the date at the top and `check/checks.mjs` together; then run the
  page = text check against a dev server (`--url http://localhost:3000/legal/privacy`).
- **Tools:** Sentry (org `vibe-z6`, project `javascript-nextjs`); to look back
  at a cron run ask Sentry (`transaction:*api/cron*`). `vercel logs` reaches
  back about one hour; `vercel crons run` and other production actions are
  refused to the session, Franky runs them. The Cloudflare connector has no
  DNS, lifecycle or Turnstile tools. A database file is applied with the
  Supabase connector's `apply_migration` (body without begin and commit), then
  its row renamed to the file's version.
- **Tests read source text.** After any hand edit run the whole suite, not
  only the file's own test. `node --test` takes files, not a folder.
- **The Mac idles between turns:** ask for keep-awake `session_idle` before
  each long step; a workflow that lost its network resumes with
  `resumeFromRunId`.
- **Builders told "no dev server" cannot walk anything:** the main session
  owes the browser walk every time (phone preset, 1280, and the wrong-guess
  width of 800 for anything that depends on the device).
- The gstack `investigate` skill was used once; its setup offers an upgrade
  and three one-time questions. They were skipped, not answered.

## Local environment (Oct 13)

- Local Supabase up; it has the tally table (with test rows) and the eighth
  email kind. Seed accounts as before (`blake@example.test` plain member,
  `avery@example.test` admin). No Resend key in dev, so nothing can be emailed
  from this Mac.
- `.env.development.local` has no Turnstile key (Cloudflare's test keys are
  listed in `.env.example` for a local walk of the box).
- Scratch files for S76 are under the session scratchpad and may not survive.
