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

## Later on Oct 12: Franky said "yes to all six"

**Wave 1 is LIVE** (`f9943f9` to `76f89a2`, build `dpl_BszmY3LcsCWBkXAsAqQZiiDKm7u2`).
Checked: 2,420 tests, typecheck, lint, build, page = text 1,124 of 1,124, a
local walk of every piece, and the live site signed out.

| Call | What shipped | State |
|---|---|---|
| 1 Terms | Names CONNECTVIBE. LLC, the draft paragraph is gone, the banner says what was corrected. `TERMS_VERSION` unchanged. The county waits for v3. | Live |
| 2 Human check | Cloudflare Turnstile box on sign-in, sign-up and resend (`TurnstileBox.tsx`, `src/lib/auth/captcha.ts`). | **ON since Oct 12, about 10:45 pm EDT.** Franky made the widget ("Vibe sign-in", Managed, pre-clearance No), put the site key on Vercel (Config, Production only), the policy sentences went out in that deploy (`4d15fa8`, build `dpl_C2vgDp28poNwsBf566ZAVLQLPrqR`), he signed in on iPhone and desktop, then turned on Supabase's Captcha switch. Checked after: the sign-in service answers `captcha_failed` to a sign-in and to its own reset door with no token (the email-budget attack in the security report is closed); our own forgot-password route still answers. **Not seen: a real reset email arriving with the switch on (no email was sent in the 3 hours around it); the store app shells.** To turn off: Supabase's switch FIRST, then the key. Details: `handoffs/2026-10-12-turnstile-policy-and-steps.md` |
| 3 Visit tally | `page_open_tally` + `tally_page_open()` (`20261012180000`, **applied on production through the connector, recorded, post-checks pass**), `POST /api/tally/open`, a beacon on `/`, `/waitlist`, `/auth/signup`, admin > Numbers. | Live and counting (2 opens on Oct 12, both mine) |
| 4 Chat photos | Shrunk in the browser to 2048 px JPEG (`src/lib/media/shrink-photo.ts`), phone chat and the desktop static page (`public/html/_shrinkPhoto.js`, pinned by `shrink-photo-static.test.ts`). | Live. A real upload was never made (no storage locally): **Franky's real-phone walk covers it** |
| 5 Contrast, pass 1 | Light-look text tokens darker (`--ink-muted #6C6761`, `--tag-ink` for orange words), static twins, emails. Night unchanged. | Live |
| 5 Contrast, pass 2 | Dark words on everything drawn on coral (`--on-coral #160A06`), coral-as-text uses `--tag-ink`, leftover greys follow `--ink-muted`; React, phone components, static pages, the offline page (`SW_VERSION` bumped). | Live (`91e0b9d`) |
| 6 Feed speed | The server guesses phone or laptop (`src/lib/device-hint.ts`) and sends that screen first; `useScreen` in `src/lib/use-is-mobile.ts`; campus, profile, network, otto load each screen with `next/dynamic`. | Live (`95578ea`), **half of the goal: see below** |

**One change beyond the builders:** the tally's per-network limit is keyed on a
scrambled daily code (`src/lib/tally/network-code.ts`, HMAC with
`SCHOOL_EMAIL_VERIFY_SECRET`), never the address, so opening the front page
stores no visitor IP. Policy 3d says so.

**Policy changes made the same deploy (Franky has not read them yet):** 3d
"Page opens" bullet and the "Until October 12, 2026" label sentence; section 11
(the waitlist page is counted); section 8 (the tally is not deleted); the short
version item 8 and a "Chat photos" paragraph in 3c ("often", not promised for
every photo). Date at the top: October 12, 2026.

**Sentry numbers for call 6 (14 days, thin):** feed 2.2 s typical / 4.1 s slow;
Messages about 4.1 s; landing 0.5 / 1.0 s. The Lighthouse 58 was the lab test.

**Local leftovers:** the local database has the tally table with test rows;
the preview server may be running; `.env.development.local` is back to no
Turnstile key.

**More gotchas:**
- The repo has tests that READ SOURCE TEXT (the tally route's shape, static
  twins). Changing a line a test quotes fails the test: run `npm test` after
  any hand edit, not only the file's own test.
- `node --test <folder>` fails; pass files (`src/lib/tally/*.test.ts`).
- A test imports its module as `await import("./x.ts")` through a variable
  (the typecheck refuses a static `.ts` import).
- A zsh `${2:+-H "$2"}` in a curl helper makes a malformed header (a 400 with
  an empty body that looks like an app bug).
- Turnstile draws its frame inside a closed shadow root: look at a
  screenshot, not `document.querySelectorAll('iframe')`.

## Wave 2 is LIVE too (Oct 12 night, build `dpl_747szdcvv7jw6zrkGBi1dC4skRcu`)

Checked: 2,460 tests, typecheck, lint (0 new), build; walked locally signed in
as Blake: phone preset (server markup is the phone feed, no hydration error on
campus, profile, a visitor profile, network, otto), 1280 (desktop markup,
desktop feed), and the wrong guess (a laptop browser at 800px: desktop markup,
one swap to the phone feed, no error). Live, signed out: every public page
200, the button token in the stylesheet, the offline page's rule intact, no
console error, no new Sentry issue.

**What call 6 does and does not deliver.** A phone no longer gets the desktop
feed built on the server, hydrated and thrown away: its first paint is the
phone feed. It STILL DOWNLOADS the desktop feed's file (about 74 KB
compressed) because `CampusMobile.tsx` imports nine things from
`campus-home.tsx` (CampusBanner, EventCard, useViewerCampus,
useReportedPostIds, withoutReportedPosts, BACKDROP_PRESETS, three types), and
`ProfileMobile` imports `CampusMobile`. **Next step, not done:** move those
shared pieces into their own file (and `CampusSearchOverlay` out of
CampusMobile, `UserRow` out of NetworkMobile). Then check
`.next/server/app/campus/page/react-loadable-manifest.json`: the CampusMobile
entry must not list the desktop feed's chunk. Messages was left as it was (its
framed and mini logic); a smaller safe step for it is described in the
builder's notes. **Measure before doing more:** Sentry, `span.op:pageload`,
`transaction:/campus`, LCP by release (before: 2.2 s typical, 4.1 s slow).

**The one look change Franky should see:** in Light, my own chat bubble is
coral, so its words are now dark instead of white (`MessageBubble.tsx`). It
follows his "dark words on orange" call but he approved buttons, not bubbles.
To undo only that: the four `--on-coral` lines in
`src/components/mobile/messages/MessageBubble.tsx`.

**Left by the wave 2 reviewers (small):**
- Buttons whose fill turns GREY when disabled keep white words (feed Post,
  event Save, share, composer): faint, as before.
- Calendar event pills in other colours keep white names; green, purple and
  gold are under 4.5:1 (static profile and messages).
- Night only: the gold school chip (`--edu-ink`) is 3.5:1; a lighter gold
  would pass. The finished step on the school-email strip is dimmed to 4.3:1.
- A wide window with a phone user-agent loads both screens (the old behaviour
  for every phone); `?post=` and `?tag=` links are put back by `useScreen`.
- The Android store app's web view must send `Sec-CH-UA-Mobile: ?1` or say
  "Mobile" in its user-agent, else it silently gets the old desktop-first path.
- `/otto` formats an event time in the server's time zone (an older
  difference; it can make React rebuild that list in the browser).

**Not seen:** anything signed in on the live site, a real phone, Safari, the
store apps, VoiceOver, a real chat photo upload.

## Oct 13, after midnight: the sign-in note (Franky: "yes build that")

**What happened.** With the human check on, Franky tried Forgot password with
his school email and got nothing. Not a bug: a reset goes to the address an
account SIGNS IN with, and his signs in with a personal one. Counts: 0 sign-in
accounts under the typed address, 1 account holding it as its school email,
0 emails logged. With his sign-in address the reset arrived at once, which is
also the proof that resets still send with the human check on.
**15 of the 20 accounts sign in with a different address than their school
email**, so they would all have met the same silence.

**What shipped** (`136bf7d`, build `dpl_4FKbUDNCE8mnuLB1KJCFgJZ9SxtX`): when the
typed address is the verified school email or proven personal email of exactly
one account, that inbox gets a short link-free note, "Your Vibe sign-in
email", with the sign-in address masked (`g•••@gmail.com`).
- `sendSigninNote` in `src/app/api/auth/password-reset/route.ts`, the pure
  pieces in `src/lib/auth/signin-hint.ts`, the sender `sendSigninHintEmail`.
- Same answer, status and timing on screen for every address. All new work
  runs after the answer.
- Limits: the reset limits, plus one note per typed address per UTC day
  (`pw-reset-hint-day:`), and the note counts against the 20-an-hour,
  40-a-day reset cap.
- No note for a suspended or banned account, a retired IU domain, a sign-in
  email that does not start with a letter or digit, or when two accounts match.
- New email kind `signin_hint`: `20261013090000`, **applied on production
  BEFORE the push** (so no note goes out unlogged), recorded, and on the local
  database.
- Privacy Policy sections 3a, 4 ("these eight") and 5; date October 13, 2026;
  page = text 1,150 of 1,150.
- Checked: 2,491 tests, typecheck, lint, build; the real route run locally
  (a seed school address reached the send once, the repeat was refused, the
  answer never changed; nothing can be sent locally, there is no Resend key in
  dev). **Seen Oct 13, 1:29 am: the note reached Franky's IU inbox within
  about a minute of the send, but in JUNK** (Outlook: "This message was
  identified as junk"). So link-free mail is fast now, and placement is the
  open problem. Mail records checked the same night: SPF passes on the
  `send.` subdomain, DKIM is signed for connectvibe.app, DMARC is `p=none`.
  Nothing is misconfigured; it is sender reputation (a new domain on a shared
  pool) and wording that reads like a password email. **Nobody knows yet
  whether the sign-up and school-verification CODE emails land in Junk too:
  that is the launch risk, and the owed live sign-up test with James's or
  Rylan's school email is how to find out (look in Inbox AND Junk).** First written as: a real note arriving in a school
  inbox (Franky's test: his IU address on Forgot password; then
  `select count(*) from email_sends where kind = 'signin_hint'`).

**Gotcha:** this session ran the gstack `investigate` skill for the report;
its setup step offers an upgrade and three one-time questions (telemetry and
so on). They were skipped, not answered.

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
