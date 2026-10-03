# Waitlist map: email, admin tools, data, legal, abuse protection

Read-only run, Oct 3 2026. Repo `/Users/franciscocazares/vibe` at `4c59568` (main, clean).
"Verified" = I read the code or queried the local database. "Read only" = I read a
handoff or comment and did not check the live system.

---

## 1. Email: how Vibe sends mail today

### Two senders, one provider (Resend)

1. **Supabase Auth's own mail** (signup confirmation with the 8-digit code).
   Production Supabase is pointed at Resend SMTP (`smtp.resend.com:465`, user `resend`,
   sender `noreply@connectvibe.app`, name `Vibe`), branded templates set by API, Auth
   email rate limit raised from 2 to 30 per hour.
   *Read only:* `handoffs/2026-09-04-session-53-private-resumes.md:129-132`.
   Local template: `supabase/templates/confirmation.html`; local limits in
   `supabase/config.toml:192-232` (local `email_sent = 2`, `otp_length = 8`).
2. **The app's own Resend calls** (verified in code):
   - Client: `src/lib/resend.ts:18` (`createResendClient`, needs `RESEND_API_KEY`).
   - From address: `RESEND_FROM` env var, read at `src/lib/email/resend-transactional.ts:6-14`
     (production value per handoffs is `Vibe <noreply@connectvibe.app>`; `.env.example:87`
     still shows a placeholder).
   - One branded HTML template builder, `brandedEmailHtml()` at
     `src/lib/email/resend-transactional.ts:53-135`: headline, intro, optional code box,
     optional orange button, notes, footer with "Privacy policy" link. Light-only cream card.
     Two senders use it: `sendPasswordResetEmail` (`:152`) and `sendSchoolVerificationEmail` (`:199`).
   - A third sender: moderation alerts to the founders, plain text, `src/lib/moderation/alerts.ts:158-169`.
   - Every send goes through `sendLogged()` (`src/lib/email/send-log.ts:30`) which writes one row
     to `public.email_sends` (service role only, address kept only as a keyed hash, cleared on
     account deletion). Table + rules: `supabase/migrations/20260922104000_email_sends.sql`.
     **Allowed kinds are a CHECK constraint**: `school_verification`, `password_reset`, and
     `moderation_alert` (added in `20260923090000_moderation_foundation.sql`). Code list at
     `src/lib/email/send-log-core.ts:39-44`. A waitlist adds kinds `waitlist_confirm` and
     `waitlist_invite` in BOTH places (migration + array) or the log insert fails silently
     (the send itself still goes; see the comment at migration line 136-138).
   - Health probe: `src/app/api/health/resend/route.ts` (never sends).

### Can the waitlist reuse it? Yes, almost as is

- **"You're on the list" confirmation**: one more function next to the two in
  `resend-transactional.ts`, using `brandedEmailHtml()` with no code and no button (or a
  "See what Vibe is" button to the landing). Log it with `sendLogged("waitlist_confirm", ...)`
  and `userId = null` (no account yet). Note the hash in `email_sends` is keyed by
  `SCHOOL_EMAIL_VERIFY_SECRET` and is only cleared when a *user* is deleted; a waitlist row
  with no user never gets cleared by the trigger, so the waitlist delete path must also
  delete or null its `email_sends` hashes (or accept the 180-day manual purge in the
  migration comment, line 123-124).
- **"You're in" invite with a single-use link**: copy the password-reset pattern, not a
  plain GET link. `src/app/api/auth/password-reset/route.ts:14-23` explains why: Outlook
  Safe Links and Gmail scanners GET every link before the student taps it, and 3 of 8
  "token not found" errors on Sept 14 were scanners spending one-time tokens. IU mail is
  Microsoft 365, so this WILL happen. The invite link must open a page that does nothing
  on load and only spends the token when the person taps "Create my account" (a POST).
  Token options already in the codebase:
  - HMAC-signed token like `signSchoolEmailToken()` (`src/lib/auth/school-email-token.ts:46-60`,
    48h default, `SCHOOL_EMAIL_VERIFY_SECRET`). Single-use needs a DB row to mark spent.
  - Simplest: a random token whose SHA-256 is stored on the waitlist row with
    `invited_at`, `expires_at`, `redeemed_at`, `redeemed_by`; redeem with one
    `update ... where redeemed_at is null and expires_at > now() returning *`.
  - Do NOT use Supabase `generateLink({type:'invite'})`: it creates the auth user before
    they choose a password and before the school-email check, which skips the signup flow.
- **Batch sends**: 100 invites at once. Resend has a batch endpoint (up to 100 emails per
  call) and a per-second API limit on the account; the current code sends one at a time.
  For 100 invites, a loop with a small delay from an admin route (or a script) is enough.
  *Not verified:* which Resend plan the account is on (free plan = 100 emails/day,
  3,000/month). If free, 100 invites + confirmations + normal signup mail in one day can
  hit the daily cap. Check the Resend dashboard before the first batch.

### Deliverability (school inboxes)

*Read only* (`handoffs/2026-09-15-session-60-email-verification.md:111`, S53 notes):
DKIM at `resend._domainkey.connectvibe.app` aligned with `From: noreply@connectvibe.app`;
DMARC `p=none`; Resend envelope on `send.connectvibe.app`. Open item from S60: root SPF
does not include `amazonses.com` (belt-and-braces for university filters). First test mail
landed in Gmail spam before DMARC was added. Recommendations:
- Send waitlist mail from the same verified domain, but consider a reply-able address
  (`hello@connectvibe.app`) for the "you're in" mail so replies reach the founders
  (Cloudflare forwards hello@ to Franky's Gmail; f2 "send as hello@" was due Oct 4).
- Plain-text part on every message (the existing senders already do this).
- No link shorteners, no images-only mail, one link per mail where possible.
- Invite in small batches (20-30) and watch `email_sends` + Resend bounces before the next.
- Ask people to sign up to the waitlist with their school email: it is what they must
  verify later anyway, and it lets you filter IU vs Purdue before inviting.

### Unsubscribe / CAN-SPAM

- Confirmation and "you're in" mails are transactional (the person asked for them), so
  CAN-SPAM's unsubscribe rule does not strictly apply. Anything beyond that (teasers,
  "launch is Friday", newsletters) is commercial: it needs a working unsubscribe link,
  honoring opt-outs within 10 business days, a physical postal address in the footer,
  and a non-misleading subject. **The LLC has no address yet** (memory: "address still
  NONE"), so marketing mail cannot go out until it does (a PO box or registered-agent
  address works). The footer in `brandedEmailHtml()` (`:124-127`) has no address and no
  unsubscribe link today.
- Gmail/Yahoo bulk-sender rules (one-click `List-Unsubscribe` header) apply at 5,000/day;
  not a concern at 100, but adding the header is cheap.
- Lightest: keep the waitlist to two transactional mails plus at most one "we launched"
  mail, and give every waitlist mail a "Take me off the list" link (a signed token to a
  page that deletes the row). That one link covers unsubscribe and deletion.

---

## 5. Abuse protection a public waitlist form must use

Verified in code:
- **DB rate limiter**: `src/lib/rate-limit.ts:25` `rateLimit(key, {limit, windowSec, failClosed?})`
  calls `public.rate_limit_hit` (fixed window, SECURITY DEFINER, service role only;
  `supabase/migrations/20260903100000_security_hardening.sql:279-324`). Fail-open by
  default; `failClosed: true` for limiters that are the security control.
- `clientIp(req)` (`:52`) and `clientNetworkKey(req)` (`:69`, IPv6 collapsed to /64 so one
  phone cannot rotate addresses). `tooManyRequests()` (`:133`) gives the 429 + Retry-After.
- **The model to copy** is the one anonymous, pre-account email endpoint:
  `src/app/api/auth/password-reset/route.ts`:
  - per-IP limit first (5 per 15 min, `:35-39`),
  - per-address limit keyed on a HASH, never the address (`recipientRateKey`, `:56-61`;
    plaintext keys in `rate_limits` were a past privacy bug, deleted by the E1 migration),
  - the same constant answer for every outcome so the form cannot tell anyone whether an
    address is already on the list or already has an account (`:25-33`),
  - slow work (DB write, send) in `after()` so timing does not leak either (`:78-104`).
  For a waitlist: use `clientNetworkKey` (not `clientIp`) per IP, e.g. 5 per hour; per
  address 3 per day; and a global cap (e.g. `waitlist-global` 300 per hour) so a bot
  cannot burn the Resend quota. Consider `failClosed: true` on the global cap.
- **No CAPTCHA / Turnstile / BotID anywhere** (grep of `src/` for turnstile, hcaptcha,
  recaptcha, captcha, honeypot, botid: zero hits). A hidden honeypot field plus the
  limits above is the light option; Cloudflare Turnstile is the next step if bots show up.
- Validate the address server-side with the existing school-domain lists
  (`SYSTEM_DOMAINS` / `KNOWN_SCHOOL_EMAIL_DOMAINS`, `src/lib/email/send-log-core.ts`) if the
  waitlist is school-email only; otherwise at least a length cap and one `@`.
- The waitlist table must follow the house posture: RLS on, zero policies, `revoke all
  from anon, authenticated`, written only by a server route with the service role (same
  as `email_sends`, `rate_limits`). The anon key ships in the bundle; never let the
  browser insert directly.

---

## 2. Admin: what exists and where a Waitlist page fits

### How a platform admin is recognised (verified)

- One boolean: `public.users.is_platform_admin`. Local DB: 1 of 20 users has it (prod
  should be the three founders; not checked, read-only run).
- Route gate: `requirePlatformAdmin()` `src/lib/auth/require-platform-admin.ts:21` (401
  signed out, 403 otherwise; reads the flag with the service client, fails closed).
- Page gate: `requirePlatformAdminPage(path)` `:89` (signed out -> login with `next`;
  anyone else -> `notFound()`, so the URL does not admit it exists).
- Limits: `ADMIN_READ_LIMIT` 240 / 10 min and `ADMIN_WRITE_LIMIT` 60 / 10 min with one
  shared write key `adminWriteKey()` (`:125-135`).
- Audit trail: `logModerationAction()` (`:183`) into `moderation_actions` (append-only,
  service role only). Its `action` and `target_type` are CHECK constraints (verified
  locally: `moderation_actions_action_check`, `moderation_actions_target_type_check`), so
  logging a "waitlist_invite" needs a migration adding the action and a target type
  (e.g. `waitlist`), plus the `ModerationAction` union at `:138-156`.

### Existing admin surfaces (verified)

- `/admin` (`src/app/admin/page.tsx`): one page, four tabs via `?tab=`:
  Reports, Clubs, Users, Log. Tab type `AdminTab` at `src/app/admin/admin-shell.tsx:28`,
  tab list `TABS` at `:44-70`, tab whitelist at `page.tsx:51-52`. Clients:
  `reports-client.tsx`, `admin-orgs-client.tsx`, `users-client.tsx`, `log-client.tsx`.
- API under `src/app/api/admin/`: `users`, `users/[id]`, `restrict`, `lift`, `reports`,
  `reports/resolve`, `content/remove|restore`, `images` (+ remove/restore), `orgs`,
  `orgs/[slug]/verify|hide`, `actions`.
- `/the-map` (`src/app/the-map/page.tsx`): founders' roadmap page, same flag, own inline
  gate (`:25-37`).
- **House rule that matters for a waitlist**: `page.tsx:31-35` and the users API return
  NO email addresses to the browser on purpose ("GET /api/admin/users selects id, handle,
  name, school_verified, created_at and returns no email at all").

### Where a Waitlist tab fits

- Add a fifth tab `waitlist` to `AdminTab` + `TABS` + the whitelist, a
  `waitlist-client.tsx`, and routes `src/app/api/admin/waitlist/route.ts` (GET: list +
  filters + counts) and `src/app/api/admin/waitlist/invite/route.ts` (POST: ids[] ->
  mint tokens, send, mark `invited_at`). Gate both with `requirePlatformAdmin`, the read
  and write limits, and a log row per batch (one row with `meta: {count, batch}` keeps
  the log readable).
- Filters that matter for picking a 100-person cohort: school system (IU / Purdue),
  campus, "I run or help run a club" + club name (lets you invite officers first, which
  is the clubs-first plan), year, signed-up date, status (waiting / invited / joined /
  expired), and a referral or source tag (which flyer, which club).
- Show a MASKED address (`f*****@iu.edu`) in the list, not the full one, to keep the
  no-email-in-browser rule; the server resolves ids to addresses when it sends. If the
  founders truly need full addresses (to reply by hand), make that a deliberate,
  per-row "reveal" that is logged, and remember memory says only Franky has data access.
- "See who joined": on redemption, store `redeemed_user_id` on the waitlist row; the
  tab then shows joined / verified / onboarded per batch as counts, and handle + name
  only (like the Users tab) for people who have accounts.
- App Review: the review accounts (`scripts/seed-review-accounts.mjs`) are pre-created
  and only sign in, so a signup-side waitlist does not touch them. Any gate must sit on
  account CREATION, not on sign-in or on page access, or the Oct 16 submission breaks.
  Note signup happens in the browser (`supabase.auth.signUp` at
  `src/app/auth/signup/page.tsx:208`) straight to Supabase Auth, so a server-route check
  alone does not stop someone calling Auth directly with the public key. Enforcement
  needs either the Supabase `before_user_created` auth hook (stub commented in
  `supabase/config.toml:286`) or signup moved behind a server route with public signups
  off. (Gate design is outside this note; flagging because the invite link depends on it.)

---

## 3. Data for product fit

### What the app already records (verified in the local schema)

| Signal | Where | Notes |
|---|---|---|
| Signed up | `auth.users.created_at`, `public.users.created_at` | |
| School verified, campus | `users.school_verified`, `school_system`, `campus_id`, `campus_set_at` | |
| Onboarded | `terms_acceptances.accepted_at` (+ `source`), `users.terms_accepted_at` | |
| Profile filled | `users.avatar_url`, `bio`, `interests`, `major`, `profile_layout` | customization = the student hook |
| Follows people | `connections (follower_id, following_id, created_at)` | |
| Follows clubs | `org_followers (created_at, first_followed_at, source)` | |
| Joins clubs | `org_members (role, joined_at)`, `org_join_requests`, `org_invites` | |
| Posts, comments, likes, reposts, saves | `posts`, `post_comments`, `post_likes`, `post_reposts`, `bookmarks` (all `created_at`) | |
| Events, RSVPs | `events.created_at`, `rsvps (status, created_at)`, `personal_events` | |
| Messages | `messages (user_id, channel_id, created_at)`, `channel_members.last_read_at` | chat v2 for everyone Oct 26 |
| Daily views (per user per day) | `post_views (post_id, user_id, viewed_on)` via `record_post_view`; `profile_views (viewer_user_id, viewed_on)` | the only per-day history that exists today |
| Last seen | `users.last_active_at` | OVERWRITTEN, no history; bumped only by `/api/me/heartbeat` (`src/app/api/me/heartbeat/route.ts:29`), called only from `/campus` (`src/app/campus/campus-home.tsx:4673`) every ~30 s |
| Store app seen | `push_devices.last_seen_at`, `platform`, `app_version` | |
| Sessions | `auth.sessions (created_at, refreshed_at, user_agent)`, `auth.refresh_tokens.created_at` | token refreshes roughly hourly while the app is open, so a rough "days with the app open"; not designed for this, do not depend on it |
| Notifications read | `notifications.read_at` | |

- **No product analytics at all**: no `@vercel/analytics`, PostHog, Plausible, etc. in
  `package.json` (verified). Sentry (`@sentry/nextjs`) is errors only:
  `sendDefaultPii: false`, traces 10% (`src/lib/sentry-config.ts:198-201`). No events
  table, no survey/feedback table (`src/lib/feedback/` is error-toast copy, not user feedback).

### What is missing for a cohort test

1. **A day-by-day activity record.** Retention (D1 / D7 / D14 / D30, weekly actives) needs
   "was this person here on day X". Lightest: a table `user_active_days (user_id, day
   date, primary key both)`, written by the existing heartbeat route with `insert ... on
   conflict do nothing` (one tiny row per person per day; 100 people x 30 days = 3,000
   rows), and move the heartbeat call from `/campus` into the signed-in app shell so the
   feed, chat, clubs and the store app all count. Service-role only, deleted with the account.
2. **A cohort tag.** Which invite batch someone came in on: the waitlist row's
   `redeemed_user_id` + `batch` is enough; no column on `users` needed.
3. **The product-fit survey.** Nothing exists.
4. **One definition of "activated"** agreed before the test, e.g. within 7 days of
   signing up: verified school email + follows 3 or more clubs/people + one of (RSVP,
   post, message, club join). Every number below hangs off it.

### Lightest product-fit survey (Sean Ellis)

- Question 1: "How would you feel if you could no longer use Vibe?" Very disappointed /
  Somewhat disappointed / Not disappointed / I don't really use it. Benchmark: 40% or more
  "very disappointed" among people who actually used it.
- Then two short free-text questions: "What's the main thing Vibe does for you?" and
  "What would make it better?". Optional: "Who else on campus would love it?"
- Who gets it: cohort members after ~10-14 days with at least 3 active days (Ellis asks
  people who have used the product recently and more than once). With 100 invited,
  expect maybe 30-60 answers, so show the count next to every percentage.
- How: one table `pmf_responses (user_id, survey_key, answer, main_benefit, improve,
  ok_to_contact, created_at)`, unique on (user_id, survey_key), written only by a server
  route; one dismissible card on `/campus` (and a link in one email). No new vendor.
  (A Google Form is lighter still but loses the link to activity data.)
- Privacy: say on the card who sees answers ("The three founders read these. Your name
  isn't shown unless you tick 'OK to contact me'").

### Small cohort dashboard for the founders

- A sixth `/admin` tab (`cohort`) or `/the-map` section, platform admins only, numbers
  only: invited -> signed up -> verified -> activated funnel per batch; weekly actives;
  D1/D7/D14 retention per batch; median follows / RSVPs / messages per active person;
  PMF % very disappointed with n; free-text answers without names.
- One server route doing a handful of `count(*)` queries with the service role; no names,
  no emails; hide any breakdown cell with fewer than 5 people (so James and Rylan see
  the shape without seeing individuals, matching "only Franky has data access").
- Nothing here is shown to students. The only student-facing numbers stay the existing
  public counts (e.g. "N on Vibe", `src/app/api/stats/campus/route.ts`), which is
  consistent with "counts public, identities private". Do not show a waitlist position
  or "X people ahead of you" to students: that is a vanity metric.

---

## 1b. Two email ceilings that a 100-person batch will hit (read only, from handoffs)

- **Resend is on the free tier** (`handoffs/2026-09-01-session-49-...md:91`, "Free tier
  today"): 100 emails per day, 3,000 per month. Supabase Auth's signup mail also goes
  through the same Resend account (SMTP). Each invited person who signs up costs about
  3 mails (invite + signup confirmation + school verification), so 100 invites in one
  day is ~300 mails, three times the cap. The Sept 17 Sebastian case already listed a
  Resend daily cap as a suspect (`handoffs/2026-09-15-session-60-...md:113`).
  Recommendation: move Resend to the paid plan (about $20/month, no daily cap) before
  the first batch, or invite at most ~25 a day.
- **Supabase Auth email limit is 30 per hour** (`handoffs/2026-09-04-session-53-...md:130`).
  If 40 invitees sign up in the same hour, confirmation mails 31+ fail and those signups
  stall. Raise it in the dashboard before a batch, and send invites in small waves.

---

## 4. Legal and privacy

### What the live documents say today (verified, `src/app/legal/`)

- **Privacy** (`src/app/legal/privacy/page.tsx`, effective Sept 28 2026):
  - Opens "By using Vibe, you agree..." (`:22-26`): written for account holders. Nothing
    covers collecting an email from someone with no account (a waitlist).
  - "We will not send marketing email without your consent" (`:75`). So any non-
    transactional waitlist mail needs a consent tick.
  - "To improve the Service: aggregate usage analytics" (`:73`). The legal companion
    says this line is currently untrue and should be removed
    (`handoffs/legal-2026-09-29/03-companion.md:102`, "none is true; remove"). A cohort
    dashboard would make a narrow version true; reword rather than delete.
  - Service providers (`:89-94`) list Supabase, Vercel, Cloudflare R2 only. **Resend is
    not named** (nor Stripe, Sentry). A waitlist sends people's addresses to Resend
    before they have an account, so Resend must be listed.
  - Age: "18 and older ... affiliated with a U.S. college" (`:172-178`).
  - Still marked "baseline draft ... review with qualified legal counsel" (`:28-31`).
- **Terms** (`src/app/legal/terms/page.tsx`, effective May 7 2026): no feedback clause,
  no beta / pilot / waitlist wording, eligibility = 18+, enrolled, working .edu (`:37-44`).
- **Drafts not yet live:**
  - Sept 7 Privacy draft (`handoffs/legal-drafts/2026-09-07-privacy-policy.md`): says the
    only automated emails are three and "We do not send marketing email, digests, or
    activity emails" (`:97`); a postal address must be added "before ... sending
    promotional email; ... submitting to an app store" (`:13`); "Francisco Cazares is
    the only person with administrative access to your data" (`:13`).
  - Terms v2 (`handoffs/legal-2026-09-29/02-terms-of-service-v2.md`): has a Feedback
    clause, "If you send us ideas about Vibe, we may use them without owing you
    anything" (`:289`), and the postal-address DECISION (`:290`). Companion §3d:
    "No analytics SDK, no advertising SDK" (`03-companion.md:23`).
  - The legal work is paused at `12-results.md` waiting for Franky's thoughts before v3.

### What a waitlist must add (plain recommendations)

1. **A short notice on the waitlist form itself** (people there have accepted nothing):
   what we collect (email, school, optional name, year, club), why (to invite you and to
   pick who goes first), who handles it (Supabase, Vercel, Resend), how long (deleted
   when you join, or 60 days after public launch if you never do), how to get off (link
   in every email, or email hello@). Link to the Privacy Policy. "For college students
   18 and older" with a tick box, matching the app's 18+ rule.
2. **Two separate permissions**: required, "email me when it's my turn"; optional and
   unticked, "also send me Vibe news". Only the second allows teasers / launch news.
3. **Privacy Policy additions** (fold into the v3 work): a waitlist section (above);
   Resend named as a provider; a "product feedback" line (survey answers kept with the
   account, read by the founders, deleted with the account, never shown to other
   students); and the analytics line reworded to the truth, e.g. "we count, from our
   own database, how many people use features and come back each week; no analytics
   or advertising SDK".
4. **Terms**: bring in v2's Feedback clause (survey free-text) and one line that Vibe is
   opening in waves and access may be limited during the pilot. Avoid the word "beta"
   in the store listing (Apple asks betas to use TestFlight; invite-only apps with
   review accounts are accepted). General knowledge, not checked against today's
   App Store guidelines.
5. **Every waitlist mail**: plain sender name, honest subject, plain-text part, a
   "Take me off the list" link. Promotional mail additionally needs the LLC's postal
   address, which does not exist yet.

### For the lawyer (James runs this)

- Is the "you're in" invite a transactional / relationship message under CAN-SPAM
  (likely yes, since they asked for it), and what counts as promotional after that?
- Postal address for the footer and policies: registered-agent address or PO box
  (companion I.12 already recommends the registered agent's; needed for store
  submission anyway).
- If the founders offer anything for survey answers (a raffle, gift cards, free Vibe+),
  that is a sweepstakes or promotion with its own rules; keep it off until reviewed.
- Using IU / Purdue names on a public waitlist page (already counsel question J.9).
- If any cohort data or survey results are ever used for a class project or published,
  the founders' own university research rules (IRB) could apply; keep it internal
  product feedback.
- Waitlist retention period and deletion on request (already true if the form and the
  "take me off" link delete the row and its `email_sends` hashes).

---

## What I verified vs only read

- Verified in code: everything with a `src/...:line` or `supabase/migrations/...` cite;
  absence of CAPTCHA/bot protection and of analytics packages (grep + `package.json`).
- Verified in the LOCAL database (docker psql, read-only): table list, columns of
  activity tables, the `email_sends_kind_check` (3 kinds) and
  `moderation_actions_action_check` / `target_type_check` constraints, 1 of 20 local
  users is a platform admin, `auth.sessions` / `auth.refresh_tokens` shapes.
- Read only (handoffs, not checked live): Resend free tier, Resend SMTP for Supabase
  Auth, 30/hour Auth email limit, DKIM/DMARC/SPF state, production `RESEND_FROM`,
  number of production admins, App Store beta rule.
- Nothing edited in the repo, nothing run against production.
