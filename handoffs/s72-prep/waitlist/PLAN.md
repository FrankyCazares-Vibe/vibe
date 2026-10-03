# Vibe waitlist: a plan you can build (Oct 3, 2026)

This is a plan only. Nothing in the repo was changed and nothing in production was touched.
Sources: `signup-gate.md`, `email-admin-data.md`, `notes-01-create-paths.md` and `notes-02-after-account.md`
in this folder, plus my own checks (listed in section 8). "Verified" means I checked the code, git or
the LOCAL database. "Read only" means I read it somewhere and did not test it.

## 0. The short version

- **The ask.** Sign-up stops being open to anyone. People join a waitlist. The founders pick about 100
  testers, see whether Vibe fits the market, collect data, and open to everyone at the end of October,
  or later if the numbers say so.
- **The line Franky asked to remove is already gone.** "The real app with sample accounts. The three founders
  play themselves." was removed on branch `landing-night` in commit `9fc3906` ("drop the sample-accounts
  line under A day on Vibe"), which changed `src/components/landing/day-on-vibe.tsx` and `landing.css`.
  Verified with `git show --stat`. A grep of main's `src` and the landing-night `src` finds no match.
  Only old scratchpad drafts under `landing-work/` still have it. Nothing more to do.
- **What I recommend:**
  1. **The form:** a waitlist form that accepts only an IU or Purdue school email. The person confirms
     it with one tap.
  2. **Picking and inviting:** a founders-only Waitlist tab in `/admin`. It picks batches by school,
     year, major and club, and sends the invites.
  3. **The invite:** a link that works once and expires after 7 days.
  4. **The gate:** a Supabase "before user created" hook, which refuses any new account that has no valid
     invite. Nobody can get around it by skipping our pages.
  5. **The launch switch:** one database setting, `signup_open`, opens everything at launch with no deploy.
- **Pick testers in groups that already know each other** (whole clubs and their friends), not 100
  strangers. With 100 people spread across campus a social app feels empty, and the test would fail for
  the wrong reason.
- **Upgrade Resend before the form goes live.** The free tier is 100 emails a day for the whole account.
  A busy sign-up day would also block password resets and school-email codes for current users.
- **Build time is about 3.5 working days, in three steps:**
  1. The form goes live (1 day).
  2. The gate and the invites (1.5 days).
  3. The measuring tools (1 day).

  All three fit before the store submission on Oct 16.

## 1. The visitor's path

### 1a. Landing buttons
**Recommendation:**
- Every "Sign up" or "Create your account" button becomes **"Join the waitlist"** and goes to a new page,
  `/waitlist`.
- **"Log in" stays.**
- Under the main button, add a small line: "Got an invite? Open the link in your email."

**Where (landing-night worktree, `src/components/landing/home-landing.tsx`, verified):**
- **`:32`:** change `SIGNUP_HREF = "/auth/signup"` to `"/waitlist"`. The warp click handler at `:147`
  accepts any path that starts with `/`, so the animation keeps working.
- **The four buttons:** the header "Sign up" at `:209`, the hero "Sign up" at `:225`, door 05 "Create your
  account" at `:315`, and the closing "Sign up" at `:336`.
- **`:314`:** the copy "Sign up with your school email. It's free, and only people who have one can join."
  becomes something like "We're opening Vibe in waves, starting with a small group at IU Indianapolis and
  Purdue Indianapolis. Join the list with your school email." Franky picks the final words.
- **Door 06, "Bring your club"** (`:316-322`, mailto at `:33`): keep "Email us". Add a second link, "Or join
  the list as a club officer", going to `/waitlist?officer=1`.

**The live main site** has its own buttons at `home-landing.tsx:20` and `landing-orbit.tsx:71`, cited from
the gate map.
- Recommendation: ship the waitlist in the same deploy as landing-night, so only one landing changes.
- Alternative: change both landings if landing-night slips.

**Other links into sign-up (verified):**
- **The login page** (`src/app/auth/login/page.tsx:374`): "New to vibe? Create an account" becomes "New to
  Vibe? Join the waitlist".
- **After an account is deleted:** `src/app/account/suspended/suspended-actions.tsx:40` sets
  `AFTER_DELETE = "/auth/signup"`. Change it to `/`.
- **A broken email link:** the "Start over" button at `src/components/auth/EmailLinkProblem.tsx:231` goes to
  sign-up. Change it to `/auth/login`, so an invited person halfway through sign-up never lands on the waitlist.

All of this wording follows the launch switch (3c): when `signup_open` is on, the buttons say "Sign up" again.

### 1b. The form (`/waitlist`)
1. **School email (required).** Only `@iu.edu` and `@purdue.edu` addresses, including their subdomains.
   - The browser checks it, and the server checks it again with the existing helpers in
     `src/lib/auth/school-email-domains.ts`: `SYSTEM_DOMAINS` `:54`, `isSchoolEmail` `:190`,
     `schoolSystemForEmail` `:209`, `retiredIuDomainFor` `:175`.
   - Retired IU domains are refused with the existing "use @iu.edu" message.
   - Store the address in one standard form: lowercase, trimmed, subdomain folded into the main domain. The
     review seed script already does this (`scripts/seed-review-accounts.mjs:264-274`).
2. **Name (required, up to 80 characters).** A first name is enough.
3. **Campus.** Indianapolis is selected by default. Other campuses are listed as "Another campus (we'll let
   you know when we get there)". Those answers show demand elsewhere.
4. **Year and major.** Year is a choice: Freshman / Sophomore / Junior / Senior / Grad / Other. Major is
   optional free text, up to 80 characters.
5. **Clubs you're in (optional, free text up to 200).** No clubs are on Vibe yet, so there is nothing to
   pick from.
6. **"I run or help run a club" tick box.** If ticked, ask "Which club?" and "Your role".
7. **One line:** "What would make Vibe worth opening every day?" Optional, up to 280 characters.
8. **Consent** (the wording is in section 5):
   - required: "I'm 18 or older and a current student";
   - required: "Email me when it's my turn";
   - optional and unticked: "Also send me Vibe news";
   - a short notice with a link to the Privacy Policy.
9. **Hidden fields:**
   - a honeypot field to catch bots;
   - `src`, taken from the link (`/waitlist?src=sae` or a flyer code), so we know which channel worked.

**Recommendation:** one screen, about 60 seconds to fill in.
- Alternative: ask for the email only, and the rest after confirming.
- I reject that: the rest is exactly what the founders need to pick a cohort, and people answer most
  willingly at the moment they sign up.

### 1c. What they see after submitting
The page shows the same message whether the person is new, already on the list, or stopped by a limit. That
way the form can't be used to find out who is on the list. The message: "Check your school inbox. Tap the
button in our email to confirm your spot. Already confirmed? You're on the list, and we'll email you when it's
your turn."

Below it, two links:
- "Bring your club";
- "Share Vibe with a friend", which copies `/waitlist?src=friend`.

### 1d. Confirmation email (confirm by link: yes)
**Recommendation:** yes, they confirm by link before they count. This is also the only "you're on the list"
email, so each person gets one email, not two.
- **The email:** the subject is "Confirm your spot on Vibe". The button "Confirm my spot" goes to
  `/waitlist/confirm?t=<token>`.
- **Opening the page changes nothing.** Outlook Safe Links and Gmail open links before the student does, and
  IU mail is Microsoft 365. The page shows one button, and only tapping it confirms the spot (a POST that sets
  `confirmed_at`). This is the password-reset pattern; the reason is written down in
  `src/app/api/auth/password-reset/route.ts:14-23`.
- **How it's built:** with `brandedEmailHtml()` (`src/lib/email/resend-transactional.ts:53-135`). Each send
  is logged with `sendLogged("waitlist_confirm", ...)`, a new kind (section 5).
- **Why confirm:**
  - it proves they own the school address;
  - it filters out typos and bots;
  - it stops someone filling the list with classmates' addresses.

  Only confirmed people can be invited.
- **Alternative:** skip it, and let the invite email prove ownership later. That saves nothing, because the
  first email goes out either way, and the founders would be picking a cohort from addresses nobody has proven.
- **The confirm link expires after 7 days.** Sending the form again mails a fresh link, within the rate limit.

### 1e. Duplicates
- **One person, one row.** Each standardized school email appears once (a unique index).
- **Same address, not confirmed yet:** send a new confirmation, at most 3 a day per address. The count is kept
  on a hash of the address, not the address.
- **Same address, already confirmed, invited or joined:** nothing changes and nothing is sent; the page shows
  the same message. Their answers are not overwritten, since anyone could type someone else's address.
- **The address is already a Vibe account's verified school email:** the same message, and nothing is sent.
  The founders see "already a member" in admin.

### 1f. A friendly status
- **The confirm link doubles as a private status page.** Opening it later shows one of:
  - "You're on the list";
  - "You're invited, check your email";
  - "You've joined".

  It only reads; nothing changes when it loads.
- **Nothing is public:**
  - no "is this email on the list?" lookup;
  - no place in line;
  - no "X people ahead of you". That is a vanity number, against the design principles, and it would leak
    information.
- **Every email has "Take me off the list"** (`/waitlist/leave?t=`). One tap deletes the row and its
  `email_sends` hashes.

## 2. Getting in

### 2a. Who goes first
**Recommendation:** build the 100 from groups of people who already know each other.
- **Wave 0, about 10-20 people:** club officers from the waitlist and from "Bring your club" emails. They set
  up their club pages before members arrive, which is the clubs-first plan.
- **Waves 1-3, about 25 each:** members of those clubs and their friends. Filter by `src=<club>` or by the
  clubs text. Everyone who arrives then finds people they know.
- **Keep about 10 places for students who aren't in a club,** to test whether Vibe works for someone who
  isn't in one yet.
- **Indianapolis only** for the pilot, with both IU and Purdue, since they share the campus.

Alternative: 100 people picked at random from the list. That is fairer, but it tests a network with too few
connections to say anything.

### 2b. The admin page (founders only)
**Where it goes:** a fifth tab, "Waitlist", in `/admin`. That means:
- the `AdminTab` type at `src/app/admin/admin-shell.tsx:28`;
- the `TABS` list at `:44-70`;
- the tab whitelist at `src/app/admin/page.tsx:51-52`;
- a new `waitlist-client.tsx`.

**Who can open it:**
- `requirePlatformAdminPage` (`:89`) guards the page;
- `requirePlatformAdmin` (`src/lib/auth/require-platform-admin.ts:21`) guards the routes;
- the existing admin read and write limits apply (`:125-135`).

**The list shows:**
- a masked email (`f*****@iu.edu`);
- name, school, campus, year, major, clubs, officer and club, the "one line", source and sign-up date;
- a status: unconfirmed / waiting / invited / joined / expired.

The full address never reaches the browser. That is an existing house rule (`page.tsx:31-35`).

**Filters:** school, campus, year, major, club, officers only, source, status and date. Counts at the top:
total, confirmed, by school, by source, and officers.

**Choosing a batch:** tick rows, or "select all filtered", then "Invite N people" with a batch name such as
"officers-1" or "sae-1".
- The server sends at most 25 per click.
- It refuses to send more than what is left of the day's email budget.

**Per row:**
- resend the invite, which mints a new link and kills the old one;
- remove the person;
- mark them declined.

**"Add someone":** for officers who wrote to help@. A founder types a school email, a name and a club. That
creates an already-confirmed row that can be invited straight away.

**Every action is logged.** Each invite batch, add or removal writes one row through `logModerationAction()`
(`:183`), with details such as `{count, batch}`. This needs new action kinds in the database (section 5).

**Who sees what:**
- Franky can reveal one person's full address at a time, and each reveal is logged.
- James and Rylan see masked addresses only, which matches "only Franky has data access". Founder
  question 6.

**Routes:**
- `GET /api/admin/waitlist`;
- `POST /api/admin/waitlist/invite`;
- `POST /api/admin/waitlist/add`;
- `POST /api/admin/waitlist/[id]/resend`;
- `POST /api/admin/waitlist/[id]/remove`;
- `POST /api/admin/waitlist/[id]/reveal`.

### 2c. The invite link
**The token:** 32 random bytes. Only its SHA-256 hash is stored, along with the time it was sent, the expiry
(7 days), the batch name and the founder who sent it.

**The email:**
- the subject is "You're in. Make your Vibe account";
- it comes from `hello@connectvibe.app`, so replies reach the founders;
- its button goes to `/join?t=<token>`.

**The `/join` page:**
- When it loads, it only checks that the token is still good; it never uses it up. That way a mail scanner
  opening the link first does no harm.
- **Token good:** the page says "You're in" and shows today's sign-up form. The email box is filled in with
  their school email but can be changed, because some people sign up with a personal address, as Franky did.
- **Token expired or used:** "This invite has expired. Reply to this email and we'll send a new one."

**What it unlocks: exactly one new account.**
- The token travels with the sign-up request, next to the Terms fields in `options.data` (verified at
  `src/app/auth/signup/page.tsx:207-221`).
- The hook checks it (section 3).
- `handle_new_user()` marks it used and records the new account's id on the waitlist row.

**Everything after that is unchanged:**
- the email code, the school email and Otto;
- a banned school identity is still refused (`src/lib/moderation/access.ts:263`).

**What not to use:** Supabase's `generateLink('invite')`. It creates the account too early and skips our steps.

**A forwarded invite** lets one other person in, instead of the invitee. Admin shows "joined with a different
school email" (by comparing hashes) so the founders can see it. At 100 people it is not worth blocking.

**Recommendation: the token**, not matching the email.
- Alternative, the gate map's first idea: the hook lets in any sign-up whose email is marked invited.
- Problem 1: it forces the account email to be the school email.
- Problem 2: it depends on email confirmation being on in production. The comment at `supabase/config.toml:221-222`
  says it is ("Production has this set to true"); I did not check that live.
- The token avoids both problems.
- The email list is kept only for the few accounts that are created by hand (2e).

### 2d. Club officers skip the line
- **On the form:** officers tick "I run a club". In admin, the "officers only" filter lets the founders invite
  them first.
- **By email:** the "Bring your club" email (`mailto:help@` at `home-landing.tsx:33`). A founder uses "Add
  someone", then invites.
- **Their members:** the officer shares `connectvibe.app/waitlist?src=<club>`. The founders filter by that
  source and invite the club as one batch.
- **Club invites inside the app can't do this.** `org_invites.invitee_id` is `NOT NULL` (verified in the
  local database by the gate map), so they only reach people who already have an account.
- **Alternative:** give each officer 15 single-use links to hand out. That is more code, so wait until
  officers ask for it.

### 2e. The App Review accounts
- **Signing in is untouched.** The reviewers only sign in (`handoffs/stores/review-notes.md:58-61`), and the
  hook never runs at sign-in.
- **If Apple deletes review account 1,** `scripts/seed-review-accounts.mjs` recreates it with
  `admin.createUser` (`:677`).
  - First, the script adds both `REVIEW_EMAIL_n` addresses to a small `signup_allowlist` table.
  - That way it works whether or not the hook runs for accounts made with the secret key. The Supabase docs
    don't say; I read the hook page through `search_docs`. Test it on the local stack.
- **Same for the local and demo seeds:** `scripts/demo-seed.mjs:382` and `scripts/local-seed.mjs:217`. Either
  put their `@example.test` users on the allowlist, or have the local stack's `signup_open` on.
- **One sentence for the reviewer notes:** "Vibe is opening in waves during a pilot at IU Indianapolis and
  Purdue Indianapolis. New visitors join a waitlist; please sign in with the review account below."
  - Don't use the word "beta" in the store listing.
  - Check the current wording of Apple's guideline 2.2 before Oct 16. I am going from memory; not verified.

### 2f. Existing accounts
- **Everyone who has an account keeps it** and signs in as today, because the hook only runs when an account
  is created. That includes people who started signing up and never finished.
- **Count them in production** before picking the cohort. I did not check: this was a read-only run.
- **Recommendation:** tag them "batch 0". They appear on the dashboard but stay out of the product-fit numbers
  unless they are active.
- **Someone who deleted their account and wants back in** needs a new invite. That is fine for a pilot. Bans
  still hold through the school email check.

### 2g. An invite chain (each tester gets a few invites)
**Recommendation:** off in week 1. From week 2, each activated tester gets **3 invites** that work the same
way. All of them count toward the 100.
- **Why:**
  - a social app needs friends on it, and testers' friends make the network denser;
  - "how many testers used their invites" is one of the best signs of fit there is.
- **Why not from day one:**
  - the founders would lose control of who is in the group, and of the 100 limit;
  - you couldn't tell whether people stayed for the product or because friends were pulled in.
- **Cost:** 4-6 hours. It is the first thing to cut if time runs short.

## 3. The gate itself

### 3a. Where sign-up closes
**What it is:** a Postgres function, `public.hook_waitlist_gate(event jsonb)`, switched on as Supabase Auth's
"before user created" hook.

**Supabase runs it before it creates any account, from any path:**
- the sign-up page;
- a direct call to `/auth/v1/signup` with the public key;
- any sign-in method switched on later. The docs say the hook "runs before a new user is created".

Our own server is not on that path: the sign-up page calls Supabase straight from the browser
(`signup/page.tsx:207-221`, verified). So this hook is the only place a gate can hold.

**It allows the new account if any one of these is true, and refuses it otherwise:**
1. `app_settings.signup_open` is true;
2. `user_metadata.vibe_invite` hashes to a waitlist row that has been invited, has not expired and has not
   been used. The docs' payload includes `user_metadata` (read only; test it locally);
3. the email is in `signup_allowlist` (the review accounts and founder test accounts).

**The refusal:** `{"error":{"http_code":403,"message":"Vibe is invite-only for now. Join the waitlist at
connectvibe.app/waitlist."}}`. The sign-up page's `signUpErrorMessage` (`signup/page.tsx:67-102`, verified)
needs a branch for it. Today that error would fall through to "Something went wrong."

**How the function is set up:**
- it runs as its owner, postgres (`SECURITY DEFINER`, with `search_path = ''`);
- only `supabase_auth_admin` may run it; `anon`, `authenticated` and `public` may not. That is the same
  setup as `handle_new_user`.
- **One trap:** without `SECURITY DEFINER`, `supabase_auth_admin` would see the protected waitlist tables as
  empty (row security on, no policies) and refuse everyone. Test both "allow" and "refuse" locally.

**`handle_new_user()`** (latest version: `supabase/migrations/20260906120000_terms_acceptances.sql:68-138`)
- It gets one more statement: mark the invite used (`redeemed_at`, `redeemed_user_id`), in the same database
  step that creates the user.
- If two sign-ups race with one token, the second update finds nothing. Log it; don't fail it.

**Switching it on:**
- **Locally:** the block at `supabase/config.toml:285-288` is commented out today (verified). It becomes
  `[auth.hook.before_user_created] enabled = true`, `uri = "pg-functions://postgres/public/hook_waitlist_gate"`.
- **In production:** Dashboard > Authentication > Hooks. The main session or Franky does this.

**If the function breaks,** sign-ups stop rather than opening up. People who already have accounts are not
affected.

**The page side:** with no invite and sign-up closed, `/auth/signup` sends people to `/waitlist`. That only
guides people; the hook is the real wall.

**Options I rejected:**
- **Turning off "Allow new users to sign up":** sign-up would then need rewriting as a server route. Keep it
  as the fallback if the hook misbehaves.
- **A database trigger that raises an error:** people would see a 500 that looks like a crash.
- **A check at the school email step:** strangers could still create accounts before it.
- **The proxy:** sign-up never passes through it.

### 3b. Bypass tests before turning it on (local first, then production)
- A direct POST to `/auth/v1/signup` with the public key and no token gets a 403. So does one with a used,
  expired or made-up token.
- A signed-in student who reads `/rest/v1/waitlist`, `/rest/v1/app_settings` or `/rest/v1/signup_allowlist`
  gets a 401 or 403, or nothing.
- `admin.createUser`, with and without the allowlist row. Does the hook run? Not known yet.
- With the hook on, the App Review account still signs in.
- Check in production that magic link, OAuth and anonymous sign-in are off, and that email confirmation is on.
  None of this was checked here.
- A browser pass at 375px, signed in as a non-admin, on the real deploy.

### 3c. The switch that opens everything at launch
- **One row:** `app_settings`, key `signup_open`, value `false`.
- **Launch is one SQL line,** run by the main session through the management API:
  `update public.app_settings set value = 'true'::jsonb, updated_at = now() where key = 'signup_open';`
  No deploy, no trip to the dashboard.
- **The website reads the same row** on the server, cached for about 60 seconds. It decides:
  - whether the buttons say "Join the waitlist" or "Sign up";
  - whether `/auth/signup` shows the form or sends people to `/waitlist`.

  One switch read in two places, so the two can't disagree. Caching in Next 16 works differently from older
  versions: read `node_modules/next/dist/docs/` before choosing how.
- **In an emergency** (the hook blocking invited people): set `signup_open` to true, which lets everyone in,
  or turn the hook off in the dashboard. Both undo in a minute.
- **Write it down** in the handoff and in a comment at the top of the migration: "Launch = this one SQL line."
  `PURDUE_SIGNUPS_ENABLED` (`school-email-domains.ts:44`) is a separate switch and stays as it is.
- **After launch,** `/waitlist` becomes a "Bring your club" page plus a redirect to sign-up.

## 4. Product-fit data

### 4a. Definitions to agree before the first invite
- **Joined:** created an account from an invite.
- **Set up:** school email verified and Otto finished.
- **Activated:** within 7 days of joining, set up, plus all of:
  - follows at least 3 people or clubs;
  - did at least one real thing: an RSVP, a post, a message or joining a club.
- **Active day:** any day (Indianapolis time) the person opened the signed-in app.
- **Week-N retention:** the share of people who joined that were active on at least one day in days 7-13
  (week 1), days 14-20 (week 2), and so on.

### 4b. The numbers to watch, per batch
| Number | Comes from | Pilot target (a sign of fit) |
|---|---|---|
| Waitlist sign-ups per week, share confirmed, by source | `waitlist` | growing each week; at least 70% confirm |
| Invited, then joined | `waitlist` | at least 60% within 7 days |
| Joined, then set up | `users.school_verified`, Otto state | at least 80% |
| Joined, then activated | `connections`, `org_followers`, `rsvps`, `posts`, `messages`, `org_members` | at least 50% |
| Week-1 retention | `user_active_days` (new) | at least 40% of the people who joined |
| Week-4 retention | `user_active_days` | at least 25% |
| Active days per week (median, among active people) | `user_active_days` | 3 or more |
| Messages per active person per week (after Oct 26) | `messages` | going up |
| Clubs posting at least one event a week | `events` | at least half the clubs that set up |
| Testers who used an invite (if the chain is on) | `waitlist` | at least a third of activated testers |
| Survey: "very disappointed" | `pmf_responses` (new) | at least 40%, from at least 30 answers |

**Where the targets come from:**
- The 40% line is Sean Ellis's benchmark.
- The retention targets are my recommendation for a social app tested on one dense campus, not a rule.

**A caution:** with 100 people, each number moves by about 10 points because of a handful of people. So:
- show how many people each percentage is based on, next to it;
- decide on the numbers together with what testers say in person (4c).

**What can already be counted** (the data map checked these tables locally): connections, club follows,
memberships, posts, RSVPs, messages, the daily post and profile view rows, Terms acceptances,
`school_verified`, and `push_devices.last_seen_at`.

**What is missing:**
- **A history of active days.** `users.last_active_at` is overwritten each time and only updated from
  `/campus`: the heartbeat route `src/app/api/me/heartbeat/route.ts:29` is called only from
  `src/app/campus/campus-home.tsx:4673`.
- **A tag for the batch** each person came in with.
- **A survey.**

### 4c. The survey, and when it's asked
- **The questions:**
  1. Sean Ellis's question: "How would you feel if you could no longer use Vibe?" The answers are Very
     disappointed / Somewhat disappointed / Not disappointed / I don't really use it.
  2. "What's the main thing Vibe does for you?"
  3. "What would make it better?"
  4. Optional: "Who should we invite next?" Free text; no email addresses are collected.
- **When:** once, 10-14 days after joining, to people with 3 or more active days. Shown as a card on `/campus`
  that can be closed, plus one email.
- **Optional:** a one-tap "What didn't work?" question for people who haven't been back for 7 days.
- **Also: talk to people.** The founders hold 10-15 conversations of about 15 minutes each with testers. At
  100 people this is the most useful data there is. Recommended.
- **No prizes** for answering until James's lawyer has checked the rules for giveaways and contests.

### 4d. The founders-only dashboard
- **Where:** a sixth tab, "Cohort", in `/admin`. Platform admins only, numbers only.
- **What it shows:**
  - each batch's path from invited to joined, set up and activated;
  - weekly active people;
  - retention by week for each batch;
  - median follows, RSVPs and messages;
  - the "very disappointed" share, with how many answered;
  - the free-text answers, without names. A name is shown only if the person ticked "OK to contact me".
- **How:** one route, `GET /api/admin/cohort`, which counts with the service key.
- **Small groups are hidden:** any cell with fewer than 5 people is hidden. Nothing here is shown to students.
- **No waitlist count on the landing page** for now. It would be a count, which the "counts public from 5 up"
  rule allows, but a small number hurts more than it helps.

### 4e. Privacy limits
- **No outside analytics.** No analytics or advertising SDK, no outside trackers; everything comes from our
  own database. That matches the legal companion ("No analytics SDK", `handoffs/legal-2026-09-29/03-companion.md:23`).
- **Activity is one row per person per day,** and nothing finer: no page views, no clicks.
- **Survey answers** are tied to the account, so they can be compared with activity:
  - the founders read them;
  - they are deleted with the account;
  - other students never see them.
- **How long waitlist data is kept:**
  - a row is deleted the moment the person taps "Take me off";
  - rows of people who never join are deleted 60 days after the public launch;
  - rows of people who joined lose their form answers when the pilot ends. The batch and dates stay.
- **Who sees what:** only Franky sees individual rows. James and Rylan see masked rows and the dashboard.
- **Kept internal.** Nothing is published or used for class work. If it ever were, university research rules
  could apply; that is a question for the lawyer.

## 5. Data model and security

### 5a. New tables
Three migrations, applied by the main session through the management API with a `schema_migrations` row.
The migration step for each table is in 5d.

**1. `public.waitlist`**
- **Who they are:**
  - `id` (uuid);
  - `email` (the standardized school email, unique);
  - `school_system` (`iu` or `purdue`);
  - `campus_id`;
  - `name` (up to 80 characters);
  - `class_year` (one of the six choices);
  - `major` (up to 80);
  - `clubs` (up to 200);
  - `is_officer`, `officer_club`, `officer_role`;
  - `wish` (up to 280);
  - `source` (up to 40).
- **Consent:**
  - `age_attested_at` (required);
  - `consent_invite_at` (required);
  - `consent_news_at` (empty unless they ticked news);
  - `notice_version`.
- **Confirming:**
  - `confirm_token_hash`;
  - `confirm_sent_at`;
  - `confirmed_at`.
- **The invite:**
  - `invite_token_hash` (unique);
  - `invited_at`, `invite_expires_at`, `invited_by` (a founder's id) or `invited_by_user_id` (a tester, for
    the chain);
  - `batch`;
  - `invite_count`.
- **Joining:**
  - `redeemed_at`;
  - `redeemed_user_id` (set to empty if that account is deleted);
  - `declined_at`.
- **Housekeeping:** `created_at`, `updated_at`.
- **Not stored:** IP addresses. The rate limiter handles those.

**2. `public.signup_allowlist`**
- **Columns:** `email` (the key, lowercase), `reason` (`review`, `founder` or `manual`), `note`,
  `created_at`.

**3. `public.app_settings`**
- **Columns:** `key` (the key), `value` (jsonb), `updated_at`, `updated_by`.
- **Starts with one row:** `signup_open = false`.

**4. `public.user_active_days`**
- **Columns:** `user_id` and `day`, which together are the key. The row is deleted along with the account.
- **Who writes it:** the heartbeat, which adds the day's row and does nothing if it is already there.
- **The heartbeat moves** from `/campus` into the signed-in app shell, so the feed, chat, clubs and the store
  app all count.
- **Size:** 100 people over 30 days is about 3,000 rows.

**5. `public.pmf_responses`**
- **Columns:**
  - `user_id` (deleted with the account) and `survey_key`;
  - `disappointment` (one of the four answers);
  - `main_benefit` and `improve` (up to 500 characters each);
  - `who_next` (up to 200);
  - `ok_to_contact` (off by default);
  - `created_at`.
- **One answer each:** `(user_id, survey_key)` is unique.

### 5b. Changes to what exists
- **Allowed email kinds:** `email_sends_kind_check` and the code list in `src/lib/email/send-log-core.ts:39-44`
  get `waitlist_confirm` and `waitlist_invite`.
  - If only one of the two is changed, the log insert fails quietly; the mail itself still goes.
  - Deleting a waitlist row must also delete its `email_sends` hashes. The existing clean-up only runs when an
    account is deleted.
- **Allowed admin actions:** the `moderation_actions` lists of allowed actions and target types (database
  rules), and the `ModerationAction` type in `require-platform-admin.ts:138-156`, get `waitlist_invite`,
  `waitlist_add`, `waitlist_remove` and `waitlist_reveal`, with the target type `waitlist`.
- **The gate:** `hook_waitlist_gate(event jsonb)` is added, and `handle_new_user()` gets one more statement
  (3a).
- **Hashing:** SHA-256 in SQL uses Postgres's own `sha256()` (Postgres 11 and up), so no extension is needed.

### 5c. Security
- **Row security on every new table, and no policies.** Access is taken away from `anon` and `authenticated`,
  and only server routes using the service key write. That is the same setup as `email_sends` and
  `rate_limits`. Students write active days and survey answers through routes, never directly.
- **The rate limiter** is `rateLimit` (`src/lib/rate-limit.ts:25`), with `clientNetworkKey` (`:69`) and
  `tooManyRequests` (`:133`), all verified.
  - **`POST /api/waitlist`:**
    - 5 an hour per network;
    - 3 a day per address, counted on a hash of the address;
    - an overall limit of 300 an hour, which refuses when the limiter itself is down;
    - and a check of the day's email budget.
  - **Confirm, leave and the `/join` check:** 30 an hour per network.
  - **`POST /api/pmf`:** 5 a day per user.
- **Copy the password-reset route** (`src/app/api/auth/password-reset/route.ts`):
  - the same answer for every outcome (`:25-33`);
  - the per-address limit keyed on a hash (`:56-61`);
  - the slow work done after replying, with `after()` (`:78`, verified), so response times don't give
    anything away either.
- **Against abuse:**
  - a honeypot field. There is no CAPTCHA anywhere today (verified by the data map); add Cloudflare Turnstile
    only if bots show up;
  - only school addresses are accepted, so the form can't be used to spam random inboxes;
  - text fields have length limits and are shown as plain text in admin.
- **Tokens:**
  - 32 random bytes; only the SHA-256 hash is stored;
  - they expire, and each works once;
  - the referrer policy is `strict-origin-when-cross-origin` (`next.config.ts:86`, verified), so a token in a
    link doesn't leak to other sites;
  - `/join` and `/waitlist/confirm` get `noindex`, so search engines skip them.
- **Never expose:**
  - waitlist addresses in the browser, except Franky's logged reveal;
  - any answer to "is this address on the list, or does it have an account?";
  - anyone's place in line;
  - tokens in logs. Never log the query string of `/join` or `/waitlist/confirm`.

### 5d. Migrations (the main session applies them)
1. **Migration 1** (the form step): `waitlist`, `app_settings` and the new email kinds.
2. **Migration 2** (the gate step):
   - `signup_allowlist`;
   - `hook_waitlist_gate`;
   - the change to `handle_new_user`;
   - the new admin action kinds;
   - and then switching the hook on in the dashboard, plus `config.toml` for local.
3. **Migration 3** (the measuring step): `user_active_days` and `pmf_responses`.

### 5e. Legal additions
These belong in the Terms and Privacy v3 work, which is paused at `handoffs/legal-2026-09-29/12-results.md`.

**On the form, a short notice:**
- what we collect, and why: to invite you and to choose who goes first;
- who handles it: Supabase, Vercel and Resend;
- how long we keep it (4e);
- how to get off the list;
- a link to the Privacy Policy.

**The Privacy Policy** (`src/app/legal/privacy/page.tsx`; lines from the data map, read only):
- **Cover waitlist sign-ups.** It opens "By using Vibe" (`:22-26`), as if everyone had an account. Add a
  waitlist section.
- **Name Resend.** It is missing from the providers list (`:89-94`).
- **Add a product-feedback line** about the survey.
- **Make the analytics line true.** It says "aggregate usage analytics" (`:73`). Change it to: "we count, from
  our own database, how many people use features and come back each week; no analytics or advertising SDK."

**The Terms:**
- bring in v2's Feedback clause (`02-terms-of-service-v2.md:289`);
- add one line: "Vibe is opening in waves; access may be limited during the pilot."

**Every email:**
- a plain sender name and an honest subject;
- a plain-text version;
- a "Take me off the list" link.

No news or marketing email goes out until the LLC has a postal address and the person has ticked "Vibe news".

**For James and the lawyer:**
- Do the invite emails count as "transactional" under CAN-SPAM?
- Which postal address do we publish?
- Are prizes for answering the survey allowed?
- Can we use the IU and Purdue names on the waitlist page?
- How long should waitlist data be kept?

## 6. Build order and timing

Hours are rough, for building with agents. Each step is one wave of the usual shape: 4-5 batches with their
own files, then build, adversarial review and repair.

| Step | What | Hours | Target |
|---|---|---|---|
| 0. Decide and check | Founder answers (section 7). Check in production: email confirmation is on, the Resend plan, the Auth email limit (30 an hour per the handoffs), how many accounts exist. Upgrade Resend and raise the Auth email limit | 1-2 | Sun-Mon Oct 4-5 |
| 1. The form goes live | Migration 1; `POST /api/waitlist` with its limits; the `/waitlist` page; the confirm email and the confirm/status page; the take-me-off link; landing-night buttons and copy; the login page link; the notice on the form; the Privacy Policy's waitlist and Resend lines | 8-10 | Tue-Wed Oct 6-7, in the same deploy as landing-night |
| 2. The gate and invites | Migration 2 and `config.toml`; the `/join` page; invite mode and the 403 message on the sign-up page; the allowlist step in the seed scripts; the admin Waitlist tab and its routes; the invite email; local tests (refuse, allow, review account, `admin.createUser`); the main session applies it and switches the hook on in production; a browser pass at 375px as a non-admin | 10-12 | Thu-Fri Oct 8-9 |
| 3. Measuring | Migration 3; the heartbeat writes the active day and moves into the app shell; the Cohort tab; the survey card and its route | 6-8 | Mon-Wed Oct 12-14, before the big waves |
| 4. Optional | The invite chain (3 per activated tester) | 4-6 | around Oct 20, if wanted |
| Launch | One SQL line; the landing wording follows by itself | 0.5 | end of October or later |

**What ships first:** step 1 alone is useful. The list fills while the gate is built.

**The two-day gap between steps 1 and 2:**
- `/auth/signup` still works for anyone who knows the address. Step 1 removes the visible links to it.
- That is acceptable, since the current landing is not drawing sign-ups.
- If that changes, ship steps 1 and 2 together.

**The calendar:**
- **Oct 6-7:** the form goes live. Marketing teasers point to `/waitlist?src=<channel>`.
- **Oct 9:** the gate is on in production. Wave 0 goes out: 10-20 officers, who set up their club pages.
- **Oct 13-16:** waves 1-3, about 25 a day.
  - The Auth email limit of 30 an hour and the Resend daily cap are the reasons for the pace.
  - Both are read from handoffs, not checked.
- **Oct 14-15:** re-run the review seed against production with the gate on and check that the review account
  signs in. Add the sentence to the reviewer notes.
- **Oct 16:** store submission.
- **Oct 23-28:** the survey reaches waves 0-1, at 10-14 days in. Wave 3 gets it around Oct 30.
- **Oct 26:** the new chat turns on for everyone. During the pilot, "everyone" means the testers plus the
  founders. How much they use chat in that last week is a key signal.
- **Oct 30-31:** decide.
  - **Launch** (flip `signup_open`) if all three hold:
    - at least 40% "very disappointed", from at least 30 answers;
    - week-1 retention of at least 40%;
    - at least 50% of the people who joined activated.
  - **Otherwise:** keep the waitlist, fix what the answers point at, and survey again in November.
  - The list keeps filling either way, so launch day starts with people waiting to be invited.

**One honest limit:** by Oct 31 most waves will have only week-1 or week-2 retention. Week-4 retention can't
be known for anyone who joins after Oct 3. Launching "at the end of the month" means deciding on early numbers
plus the survey.

**Fit with the other October work:**
- **The gate must not break App Review.** The hook only runs when an account is created, and the review pair
  only sign in, so Oct 16 is safe as long as the allowlist step is in the seed script.
- **Chat for everyone on Oct 26:** nothing to change for the pilot.
- **The desktop chat go/no-go on Oct 23** and the owed chat fixes compete for the same days as steps 2-3.
  Plan the waves around them.

## 7. Questions only the founders can answer (with my recommendation)

1. **Is a school email required to join the list?**
   Recommendation: yes, IU or Purdue only. Alternative: any email, with the school checked at sign-up.
2. **Who are the 100?**
   Recommendation:
   - Indianapolis, IU and Purdue;
   - built from 4-6 clubs plus their friends, plus about 10 students who aren't in a club;
   - the founders, the review accounts and existing accounts are outside the 100.
3. **Confirm the email by link before someone counts?**
   Recommendation: yes. It is the same single email anyway.
4. **How long does an invite last?**
   Recommendation: 7 days, and founders can send a new one.
5. **An invite chain?**
   Recommendation: 3 invites for each activated tester, from week 2.
6. **Who sees full email addresses?**
   Recommendation: Franky only, through a logged reveal. James and Rylan see masked addresses.
7. **Upgrade Resend (about $20 a month) before the form goes live, and raise the Auth email limit?**
   Recommendation: yes to both.
8. **Show a waitlist count on the landing page?**
   Recommendation: not for now.
9. **What is the bar for launching?**
   Recommendation: at least 40% "very disappointed" (from at least 30 answers), week-1 retention of at least
   40%, and at least 50% activated. If the bar is missed, launch moves into November.
10. **The store listing.**
    Recommendation: one sentence in the reviewer notes, and no "beta" anywhere. Check Apple's guideline 2.2
    before Oct 16.
11. **Ship it with landing-night?**
    Recommendation: yes, in the same deploy.
12. **A prize for answering the survey?**
    Recommendation: none until the lawyer has looked at it.
13. **People who already have accounts in production?**
    Recommendation: they stay, as "batch 0". Count them first.
14. **How long is waitlist data kept?**
    Recommendation: rows of people who never join are deleted 60 days after the public launch. The form
    answers of people who joined are cleared when the pilot ends.
15. **Talk to testers?**
    Recommendation: yes. The three founders split 10-15 short conversations in the second and third weeks.

## 8. What I verified and what I only read

**Verified (code, git or the local database):**
- the line is removed on landing-night (`9fc3906`, `git show --stat`, and a grep of both `src` folders);
- the landing button and copy lines in `home-landing.tsx` (`:31-33`, `:147`, `:209`, `:225`, `:314-322`,
  `:336-337`);
- the login link at `:374`, `AFTER_DELETE` at `:40` and `EmailLinkProblem.tsx:231`;
- the sign-up page's `signUp` call and `options.data` (`:207-221`) and `signUpErrorMessage` (`:67-102`);
- in `config.toml`, the commented-out hook (`:285-288`) and confirmations off locally (`:223`), with the
  comment at `:221-222` saying production has them on;
- the school-domain helpers;
- the rate-limiter exports;
- `after()` in the password-reset route;
- the referrer policy at `next.config.ts:86`;
- the columns of `users` in the local database (it has `year` and `major`, and no settings table), and
  20 local accounts.

**Read in the Supabase docs, through `search_docs`:**
- the hook's payload includes `user_metadata` and the user's email;
- a 4xx error with a message blocks the sign-up;
- the docs don't say whether `admin.createUser` triggers the hook.

**Taken from the two maps** (their own verified and read-only split applies):
- everything about email sending, admin, legal and existing data;
- `org_invites.invitee_id NOT NULL`;
- the trigger list on `auth.users`.

**Read only, not checked live:**
- whether production requires email confirmation;
- the Resend free tier;
- the 30-an-hour Auth email limit;
- whether production has other sign-in methods switched on;
- how many accounts exist in production;
- Apple's guideline 2.2 wording.
