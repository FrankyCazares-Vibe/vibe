# Session 76 (Oct 11 to 12, 2026): the videos, three new tools, and the launch checklist

Read this first in session 77. S76 started from
`2026-10-11-session-75-close-browser-rule-and-next-up.md`; that file's
engineering order and "Franky's own list" still stand except where this one
says done.

## START HERE — session 77

**What Franky is doing.** He is sending transcripts of AI / vibecoding videos,
one at a time, and wants each one applied to Vibe: check it against the real
app, do what needs no decision, and bring him the calls that are his. Two so
far. More are coming; the session may still be open.

**First ten minutes:**
1. `git branch -r | grep claude/` (unchanged on Oct 12: nothing main lacks).
2. Ask Franky for his answers to the six calls under "Franky's calls" below.
   Each one is ready to build the moment he says yes.
3. One look at Sentry for a browser speed report made after the Oct 12 deploy
   (Explore > Traces, `span.op:pageload`, release `82cced3`): no element name
   in it should carry a person's name. The fix was proven in a headless
   browser, not yet seen in a real report.

## Video 1: "is there an MCP, an API or a CLI for this?"

Adopted, with one condition of ours: a tool that can show people's records is
a privacy decision first (memory `feedback_connector_api_cli_first.md`).

- **Sentry is connected** (org `vibe-z6`, project `javascript-nextjs`). The
  Privacy Policy already allows the assistant to read Sentry's reports.
- **Cloudflare is connected**, but its tools cover buckets, databases and
  workers only: no lifecycle rules and no Turnstile. Those still need
  Cloudflare's API or `wrangler`.
- **The Vercel command-line tool is installed and signed in.** `vercel logs`
  reaches back about ONE HOUR on the free plan. `vercel crons run <path>` is
  refused to the assistant (a production action): Franky runs it.
- **Resend is NOT connected, on purpose**: its log shows recipients' addresses.
  Recommendation given: a script that prints only times and statuses, plus a
  policy line. Not decided.

**Closed from Franky's list by these tools:**
- The `users_active_count` grant: Franky ran it in the SQL editor; checked
  after: 0 public functions that a signed-out caller cannot run.
- Both crons work. Waitlist purge: Sentry shows 200 on Oct 6 and Oct 11 at its
  scheduled minute. School check-in: 200 on Oct 12, the scheduled run and a
  manual one (counts first: 20 accounts, oldest 161 days, nobody in scope).
  To look back at a cron run, ask Sentry (`transaction:*api/cron*`).
- The Sentry read: 2 issues in 30 days, both outside software; no browser-rule
  warning since Oct 11. A browser report holds error text, page address,
  browser, language and time zone, build id, and a rough location (the city)
  that Sentry adds itself. **Policy 3d does not mention the city.** Franky:
  Sentry > project > Security & Privacy > "Prevent Storing of IP Addresses",
  then re-read a report; if the city is still there the policy needs a
  sentence. No server-side report exists to open.

## Video 2: a 20-item launch checklist

Full detail, with evidence and the exact fix per item:
`handoffs/2026-10-12-launch-checklist-audit.md`. Result: **8 done, 1 not
needed (cookie banner), 11 partly, 0 missing.**

**Shipped Oct 12** (`56130f8`, `8291a2b`, `3f3a34c`, `82cced3`; live build
`dpl_EoRpbkrJYGjxJHeZbHYtwtXSt7kj`):
- A sitemap of the nine public pages (never a student, club or post); robots
  points to it; the signed-out post shell is noindex.
- Log in, sign-up and reset have their own tab names; shared legal, support
  and Vibe+ links show their own name; the waitlist link and club pages carry
  the share picture. Vibe+'s description follows the billing switch.
- Forgot password and the two resend screens ask for "Email" (school
  placeholder); forgot password links the Privacy Policy and Terms.
- Reset emails: per network (fails closed), 3 an hour and 5 a day per address,
  20 an hour and 40 a day overall (`src/lib/auth/password-reset-limits.ts`).
- The phone composer and two Settings actions show plain sentences on failure
  and keep the draft.
- Post photos say "Photo posted by <name>" (phone feed, opened post, desktop
  feed, club page, desktop profile).
- **Sentry scrub (found by a reviewer):** element labels with a person's name
  ("Open Jane's profile") had been reaching Sentry's speed reports all along.
  `redactElementLabels`, `redactElementIds`, `beforeSendSpan` and
  `reportScrubIntegration` in `src/lib/sentry-config.ts` blank them on every
  route out. Policy 3d gained one "Until October 12, 2026" sentence and the
  date at the top is October 12. **Franky has not read that sentence yet.**
- Checked: 2,324 tests, typecheck, build, page = text 1,099 of 1,099, lint (4
  old errors in `CampusMobile.tsx`, none new). Walked locally at 375 as Blake:
  forgot password, the composer with forced failures, an opened photo post,
  Settings; at 1280 the desktop profile's photo alts. Live, signed out: every
  item above, the browser rule and nonces on login, no console errors.
- **Not seen:** the photo label on the phone feed card itself (Blake's local
  feed has no photo post); anything signed in on the live site; VoiceOver.

## Franky's calls (each has a recommendation; all six: yes)

1. **Terms, today's patch:** remove the "baseline draft" paragraph and name
   CONNECTVIBE. LLC; nobody re-accepts. The county waits for v3 (a real term).
2. **Human check on sign-in and sign-up (Turnstile):** code first, then he
   creates the Turnstile site, adds the key in Vercel, flips the Supabase
   switch. Two policy lines the same day. Before testers.
3. **Visit counts:** a tally of our own (day, page, link label; no id, no
   cookie) and two policy sentences. Until then, `?src=` on every posted link.
4. **Chat photos shrunk before sending;** they lose the hidden location, so
   two policy lines get reworded.
5. **Light-mode contrast:** darker grey and orange text in Light only, and
   dark words on the orange buttons (as the landing page does).
6. **Feed speed:** stop sending phones the desktop feed too (hours plus a full
   walk). After the others; read more of Sentry's real-visit numbers first.

**His hands:** Google Search Console (DNS record in Cloudflare, submit the
sitemap, ask for a re-read of the front page); open the Riley Children's link
on the SAE page once; check whether Vercel Speed Insights is on (nothing uses
it). Still open from before: the live sign-up test, the Supabase Auth
switches, the Resend timeline, the real-phone walk, the lawyer file, the Terms
review answers.

## Left open on purpose (small, from the reviews)

- The desktop composer and the static profile composer still show raw error
  text (`campus-home.tsx` around 7124, `profile.html` around 6676).
- Three post photos in `ProfileMobile.tsx` (around 2893, 3167, 3328) are still
  unlabelled; a "describe this photo" box is a post-launch call.
- The reset cap is counted after the link is made: while the overall cap is
  spent, a request for a real account retires that student's older reset link
  and sends nothing. Accepted; a comment in the route says so.
- Admin pages build element ids from account ids; the scrub covers them, but
  `useId` would be cleaner (`users-client.tsx` 395, 413, 442).
- A signed-out club page or post, the 404 button and `/get` on a phone land on
  sign-in first, where the waitlist link is small. Worth a waitlist link there
  before clubs share links.
- Phone speed numbers from this Mac swing too much to act on (58 then 46 for
  the same page). Google's own tester was over its daily limit.

## Gotchas learned

- A workflow's reviewer died with "can't reach the API server" after the Mac
  idled between turns: ask for keep-awake `session_idle` again at the start of
  each long step, and resume with `resumeFromRunId` (the builder replayed).
- Builders told "no dev server" cannot do the browser walk: the main loop owes
  it, every time.
- `zsh` does not split an unquoted variable into words: pipe file lists
  through `tr '\n' '\0' | xargs -0`.
- Lighthouse's accessibility 100 is not a contrast pass: it skips text it
  cannot measure on soft backgrounds.
- A page that sets its own `openGraph` without `images` loses the site
  picture (this is what the waitlist page had done).
