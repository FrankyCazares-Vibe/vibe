# Facts: the waitlist and the new landing page  (read on 2026-10-03, main c71e9a4 + landing-night 21af1a5)

Reader 06. Evidence paths are relative to the repo root, read in the landing-night tree.
Migrations are named by their timestamp: `…100000` = `supabase/migrations/20261003100000_waitlist.sql`,
`…110000` gate, `…120000` hardening, `…130000` code_scrub, `…140000` retention, `…150000` retention_fixes,
`…160000` line, `…170000` margin.

**LIVE NOW vs LANDING-NIGHT ONLY**
- The whole waitlist is LANDING-NIGHT ONLY. Main has no `/waitlist`, no waitlist tables, no cron, no access code.
- The commit says "local only so far" (21af1a5). The eight migrations are not on production yet (BUILD.md 6.2 e).
- The new landing page is LANDING-NIGHT ONLY. The old landing is live.
- `/legal/privacy` is the same file on both trees (`git diff main origin/landing-night -- src/app/legal` is empty).
- The sign-up checkbox wording is the same on both trees. The Access code field is LANDING-NIGHT ONLY.
- LIVE NOW and unchanged: Google Fonts on every page, Sentry in the browser, the service worker, the rate limiter.

## 1. What is collected or stored

### 1a. What a person types on `/waitlist`

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F1 | School email. Required. Only an IU or Purdue school address passes. Label: "School email" with the hint "@iu.edu or @purdue.edu". | `waitlist.email` (clear text, lowercased) and `waitlist.email_key` (same address with +tags and subdomains folded; one person, one row) | Server only (service role). Admins see it masked (F36). Listed founders can reveal it (F37). | `src/app/waitlist/waitlist-form.tsx:147-153`; `src/lib/waitlist/form.ts:131-145`; `src/lib/waitlist/store.ts:167-170`; `…100000:166-173` |
| F2 | Name. Required. Up to 80 characters. Label: "Name". | `waitlist.name` | Server; every platform admin | `waitlist-form.tsx:155-160`; `form.ts:154`; `…100000:176` |
| F3 | Year. Optional. Choices: "Prefer not to say", "1st year", "2nd year", "3rd year", "4th year", "5th+ / grad". | `waitlist.class_year` (1 to 5, or empty) | Same | `form.ts:31-39`; `waitlist-form.tsx:161-168` |
| F4 | Major (optional, up to 80). "Clubs you’re in" (optional, up to 200). | `waitlist.major`, `waitlist.clubs` | Same | `waitlist-form.tsx:170-181`; `form.ts:20-28` |
| F5 | "I run a club" tick ("or help run one. Officers go first.") and "Which club?" (optional, up to 80). | `waitlist.is_officer`, `waitlist.officer_club` | Same | `waitlist-form.tsx:183-196`; `form.ts:176-187` |
| F6 | "What would you want from Vibe?" Optional free text, up to 280. Placeholder "One line is plenty". | `waitlist.wish` | Same | `waitlist-form.tsx:198-203` |
| F7 | Where they came from: the `?src=` tag in the page address. Kept only if it is 1 to 40 of a-z, 0-9, `_`, `-`. The landing buttons add `src=landing`. The club door adds `officer=1&src=club`. | `waitlist.source` | Same | `form.ts:96-101,190`; `src/app/waitlist/page.tsx:47-48`; `src/lib/waitlist/view.ts:58-64` |
| F8 | University (iu or purdue). Worked out from the address, not typed. | `waitlist.school_system` | Same | `form.ts:142-145`; `store.ts:170` |
| F9 | The three consents, as times, and which notice wording was shown ("2026-10-03"). | `waitlist.age_attested_at`, `consent_invite_at`, `consent_news_at` (empty if not ticked), `notice_version` | Server; admins see only "wants Vibe news" | `store.ts:180-183`; `form.ts:18`; `src/app/admin/waitlist-rows.tsx:199` |
| F10 | A hidden trap field for bots: labelled "Website", `name="website"`, pushed off screen, `aria-hidden`. If it is filled, the server answers OK and stores nothing. | Not stored | Nobody | `waitlist-form.tsx:230-235`; `src/app/waitlist/waitlist.css:39`; `src/app/api/waitlist/route.ts:95-97` |
| F11 | NOT stored on the entry: IP address, browser, device, location. The table has no such column. (The IP does go into a rate-limit counter: F20.) | n/a | n/a | `…100000:163-215` |

Required vs optional (F1 to F9): email, name, the age tick and the invite tick are required. Everything else is optional.
Evidence: `form.ts:132, 154, 165-174`.

**The two required ticks and the optional one, exact words** (`waitlist-form.tsx:216, 221, 226`):
- "I’m 18 or older and a current student." (required)
- "Email me when it’s my turn." (required)
- "Also send me Vibe news. Optional." (optional)

**The notice above the ticks, exact words** (`waitlist-form.tsx:206-212`; the number comes from `WAITLIST_RETENTION_DAYS = 40`, `src/lib/waitlist/types.ts:19`):
> "We collect your school email, your name and the answers above to confirm your spot, choose who gets in each wave and email you when it’s your turn. Supabase stores them, Vercel runs the site and Resend sends our emails. We keep your answers for up to 40 days. Every email we send has a link to take you off the list sooner, which deletes your answers. Privacy Policy"

"Privacy Policy" links to `/legal/privacy` (new tab). The submit button says "Join the waitlist".
The code marks the notice as a draft: `{/* Draft notice for Franky; the Privacy Policy's waitlist lines are owed (legal v3). */}` (`waitlist-form.tsx:205`).

### 1b. What the system adds to an entry

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F12 | The confirm link's token. 32 random bytes. Only its SHA-256 is stored (plain SHA-256, not keyed). Plus when the confirm email went and when the person confirmed. | `waitlist.manage_token_hash`, `confirm_sent_at`, `confirmed_at` | Server only | `src/lib/waitlist/tokens.ts:20-37`; `…100000:189-192` |
| F13 | The access-code email's own "Take me off the list" token. SHA-256 only. | `waitlist.invite_token_hash` | Server only | `…120000:114-118`; `store.ts:514-533` |
| F14 | The access code (`VIBE-XXXX-XXXX`, 40 random bits). Only the SHA-256 of its 8 characters is stored (not keyed). Plus when it was issued, when it ends, how many codes were sent, the batch name, and which founder sent it. | `waitlist.code_hash`, `code_issued_at`, `code_expires_at`, `invite_count`, `batch`, `invited_by` | Server only; admins see dates, batch, count | `src/lib/waitlist/access-code.ts:6-8,16-19`; `…100000:193-203,302-314` |
| F15 | The email address typed on the sign-up page together with the code (usually a personal address, not the school one). Clear text. Written BEFORE the account exists, and it stays if making the account then fails. | `waitlist.code_claimed_email`, `code_claimed_at` | Server only. Not shown in the admin tab. | `…120000:185-199`; columns `…100000:198-199` |
| F16 | The link from the entry to the account the code made. | `waitlist.redeemed_at`, `redeemed_user_id` | Server; admins see "Joined as @handle" | `…120000:312-331`; `waitlist-rows.tsx:49-51` |
| F17 | What a new code replaced, kept for an undo: old code hash, old claimed address, old account id, old batch, old invite token hash. | `waitlist.code_prev` (JSON) | Server only | `…120000:389-393, 405` (same lines in `…170000:199-215`) |
| F18 | How the entry got there (`form` or `founder`) and which founder added it. | `waitlist.origin`, `added_by` | Server; admins see form/founder | `…100000:175, 201`; `store.ts:442-444` |
| F19 | A send-log row for each waitlist email we try to send: the kind (`waitlist_confirm` or `waitlist_invite`), the address's domain (only `iu.edu`, `purdue.edu` or one of gmail / outlook / hotmail / icloud / yahoo; anything else is "other"), a keyed hash of the address (HMAC-SHA256, key = `SCHOOL_EMAIL_VERIFY_SECRET`, over "email-send-v1\|" + address), Resend's message id, sent or failed, the error text with addresses removed, the time. No user id. | `public.email_sends` | Server only | `src/lib/email/send-log-core.ts:92-102,134-156`; `src/lib/email/send-log.ts:42`; `src/lib/email/resend-transactional.ts:304` |
| F20 | Rate-limit counters. The keys hold the visitor's IP address in clear text (IPv4 whole, IPv6 as its /64): `waitlist-net:<ip>` (30 an hour), `waitlist-confirm-net:<ip>` (10 confirm emails a day), `waitlist-token-net:<ip>` (60 an hour, for the status / confirm / leave calls). Also `waitlist-email:<keyed hash of the address>` (3 a day) and `waitlist-global` (300 an hour). | `public.rate_limits` (key, window start, count) | Server only | `src/app/api/waitlist/route.ts:27,79-81,99,123-124,165-168`; `src/app/api/waitlist/status/route.ts:28`; `src/lib/rate-limit.ts:52-93` |
| F21 | The wave tag of an account made with a code: the account id, the batch name (`wave-1`, `officers-2`, `clubs-`, `friends-`, `test-`; never free text), form or founder, the day the code was sent, the day the account was made. No name, no address, no answers. | `public.user_cohorts` (`user_id`, `batch`, `origin`, `invited_on`, `joined_on`) | Server only. Nothing in the app reads it yet. | `…140000:78-93, 96-122`; `…150000:95-98`; `types.ts:92-93` |
| F22 | The code as typed at sign-up rides in the sign-up data. Two database triggers swap it for its SHA-256 (`access_code_hash`) before it is saved. That hash then stays in the account's sign-in record for the life of the account. If hosted Supabase refuses those triggers, the plain code stays instead (the file says so). | `auth.users.raw_user_meta_data`, `auth.identities.identity_data` | Server; also inside that user's own sign-in token | `src/app/auth/signup/signup-form.tsx:283-296`; `…130000:4-10, 20-26, 54-76, 108-116` |
| F23 | A log row for each founder action on the list: `waitlist_invite`, `waitlist_add`, `waitlist_remove`, `waitlist_reveal`. Holds the founder's user id, the entry's row id, and small notes (batch, officer yes/no, origin). Never an address or a name. | `public.moderation_actions` | Server; platform admins in the Log tab | `src/lib/auth/require-platform-admin.ts:157-162, 189-213`; `src/app/api/admin/waitlist/add/route.ts:82-88`; `…/invite/route.ts:91-97`; `…/[id]/remove/route.ts:45-51`; `…/[id]/reveal/route.ts:53-58` |
| F24 | People a founder adds by hand ("Add someone"): any real address (Gmail is allowed: "officers write from Gmail"), name, officer tick, club, clubs, batch. Marked confirmed at once. No consent times: the person never saw the form or its notice. | `waitlist` row with `origin = 'founder'` | Same as any entry | `src/lib/waitlist/admin-view.ts:256-308`; `store.ts:431-454`; `src/app/api/admin/waitlist/add/route.ts:24-27`; `…100000:209-210` |
| F25 | Two settings: the launch switch (`signup_open`, starts false) and the list of user ids allowed to see full addresses (`waitlist_email_viewers`, starts empty). | `public.app_settings` | Server only. Whether sign-up is open is public: anyone may ask `signup_is_open()`. | `…100000:135-149, 257-267` |
| F26 | Addresses that may always sign up without a code (the App Review accounts, founders, a manual exception): address in clear text, a reason, a note. | `public.signup_allowlist` | Server only | `…100000:151-160` |

### 1c. The landing page (`/`) and what sits in the browser

| # | What | Where | Evidence |
|---|---|---|---|
| F27 | The landing and waitlist code store nothing in the browser: no cookie, no localStorage, no sessionStorage. (grep `localStorage\|sessionStorage\|document.cookie\|indexedDB` over `src/components/landing`, `src/app/waitlist`, `src/app/page.tsx`, `src/lib/landing`, `src/lib/waitlist`: no hits.) | n/a | grep, no hits |
| F28 | Every page, the landing included (LIVE NOW, unchanged): a script reads `localStorage.vibe_theme` (it does not write it), and on `www.connectvibe.app` a service worker is registered that keeps one file, `/offline.html`. | Browser | `src/app/layout.tsx:94, 122`; `src/lib/theme/theme.ts:100-103`; `public/sw.js:13, 27-28` |
| F29 | On each visit to `/` the server reads the launch switch and checks whether the request comes from the store app. It stores nothing about the visitor. | n/a | `src/app/page.tsx:48-54`; `src/lib/waitlist/signup-open.ts:23-49` |
| F30 | The sign-up link in the invite email carries the code in the address (`/auth/signup?access_code=VIBE-…`). The page puts it in the field, then removes it from the address bar and history. The confirm link keeps `?token=` in the address bar; that page is marked no-index and sends no referrer. | Browser address bar | `signup-form.tsx:181-188`; `src/app/waitlist/confirm/page.tsx:7-11`; `src/lib/waitlist/email-content.ts:81-102` |

## 2. Who can see it

**Anyone on the internet**
- F31. Nothing from the waitlist. The three tables and `user_cohorts` have row-level security on, no policies, and no rights
  for the public or signed-in roles. Evidence: `…100000:221-225, 439-450`; `…140000:89-90`.
- F32. The form cannot be used to find out who is on the list or who has an account. Every well-formed submit gets the same
  `{ok:true}` and the same thank-you page: a new person, someone already on the list, an address that already has an account,
  a filled trap field, a spent limit. The real work runs after the answer has gone. For an address that already has an
  account the server does nothing and says nothing (it checks `users.email` and `users.school_email`).
  Evidence: `src/app/api/waitlist/route.ts:37-43, 113, 127`; `store.ts:107-117`; `src/app/waitlist/waitlist-done.tsx:9-14`.
- F33. Whether sign-up is open or closed is public (`signup_is_open()`, callable with the public key; the login page asks it
  from the browser). Evidence: `…100000:256-267, 425`; `src/lib/waitlist/use-signup-open.ts:29-37`.

**Other Vibe users, club officers, "the other person"**
- F34. Nothing. No page or API for students reads these tables. The only code that reads `waitlist` is
  `src/lib/waitlist/store.ts`, called by the public form routes and the admin routes
  (grep `from("waitlist")|user_cohorts|signup_allowlist|app_settings` over `src`: store.ts, signup-open.ts, admin files only).
  A waitlist entry never becomes profile data: the name and answers are not copied into the account.

**The person themself**
- F35. The link in their email (`/waitlist/confirm?token=…`) shows only a state, "never a name or an address":
  unconfirmed, confirm expired, waiting, invited, invite expired, joined, or "This link no longer works".
  Evidence: `src/app/api/waitlist/status/route.ts:12-16`; `src/app/waitlist/confirm/confirm-client.tsx:24-59`.
  There is no page where a person can read back or edit their answers. Sending the form again while unconfirmed replaces
  them (F46). Evidence: `store.ts:205-239`.

**Platform admins** (accounts with `users.is_platform_admin`; BUILD.md 6.3 counted 3 on production on Oct 3; not checked in code)
- F36. The admin Waitlist tab lists every entry, newest first, up to 2000: a masked address (`f*****@iu.edu`; a personal
  domain is masked too, `m*****@f*****.dev`), name, university, year, major, clubs, officer tick and club, the free-text
  line, the `src` tag, form or founder, "wants Vibe news", status, the dates, batch, how many codes were sent, the deletion
  date, and for someone who joined, the account's handle ("Joined as @handle").
  Evidence: `src/app/api/admin/waitlist/route.ts:36-63`; `src/lib/waitlist/admin-view.ts:41-54, 76-79, 112-144`;
  `src/app/admin/waitlist-rows.tsx:49-51, 185, 193, 199`.
- F37. The full address: the "Show email" button, one person at a time, only for user ids listed in
  `app_settings.waitlist_email_viewers`. The list starts empty; the runbook puts Franky in it (BUILD.md 6.2 e). Any other
  admin gets "Full addresses are shown to some founders only." A log row is written first; if the log fails the address is
  not shown ("The reveal couldn't be logged, so the address isn't shown.").
  Evidence: `src/app/api/admin/waitlist/[id]/reveal/route.ts:47-61`; `store.ts:86-95`; `waitlist-rows.tsx:241-243`.
- F38. Every founder action is logged and shown in the admin Log tab: "sent an access code to", "added", "removed",
  "looked at the email address of" + "a waitlist entry". Evidence: `src/app/admin/log-client.tsx` (the four `waitlist_*` verbs).
- F39. Admins can also: send codes to up to 25 people at once, send or re-send one code, add someone by hand, remove someone.
  Evidence: `src/app/api/admin/waitlist/invite/route.ts`, `…/[id]/send-code/route.ts`, `…/add/route.ts`, `…/[id]/remove/route.ts`.
- F40. No export, CSV, download or copy-all in the tab. NOT FOUND (grep `csv|download|clipboard|new Blob` over
  `src/app/admin/waitlist-*.tsx`: no hits).

**Only the server, and whoever holds the database keys**
- F41. Clear-text addresses, the claimed sign-up address (F15), all hashes, the allowlist, the send log, the rate-limit
  counters. Anyone with the Supabase dashboard or the service key can read the whole table directly; the "Show email" log
  covers the admin page only, not a direct database read. Evidence: `…100000:232-233` ("Service role only").

## 3. How long it is kept and what deletes it

**The promise people see, and the real deletion lines**
- F42. Every page and email says "up to 40 days". Only that number is shown to the public; 30 (unconfirmed) is shown to
  admins only. `WAITLIST_RETENTION_DAYS = 40`, `WAITLIST_UNCONFIRMED_RETENTION_DAYS = 30` (`src/lib/waitlist/types.ts:19-21`).
  Where 40 appears, word for word:
  - form notice: "We keep your answers for up to 40 days." (`waitlist-form.tsx:209`)
  - thank-you page: "A spot lasts up to 40 days; after that you can join again." (`waitlist-done.tsx:31-32`)
  - confirm email: "A spot lasts up to 40 days. If we haven't sent your code by then, you can join again." (`email-content.ts:140`)
  - status page, waiting: "A spot lasts up to 40 days; if we haven’t sent your code by then, you can join again." (`confirm-client.tsx:46`)
  - status page, dead link: "Your spot may have expired after 40 days, or a newer email from Vibe replaced this link." (`confirm-client.tsx:34`)
  - admin tab: "Each entry is deleted within 40 days of joining the list, whatever its state (unconfirmed ones within 30 days
    of their last confirm email)…" (`src/app/admin/waitlist-client.tsx:215`)
- F43. The database deletes two days early: 38 days after the entry joined, whatever its state; an unconfirmed form entry
  with no code 28 days after its last confirm email (or after joining, if none went), if that is sooner. The whole row goes:
  address, name, answers, hashes, the claimed address, the link to the account.
  Evidence: `types.ts:28-35, 59-68`; `…170000:78-90` (`waitlist_deletes_at`), `101-135` (`waitlist_purge_expired`);
  `src/lib/waitlist/retention.test.ts:51-76` ties the numbers, the SQL and `vercel.json` together.
- F44. Three things run that delete: a daily Vercel Cron (`vercel.json:3-8`, "17 8 * * *" = 08:17 UTC, path
  `/api/cron/waitlist-purge`, needs `CRON_SECRET` or it answers 401 and deletes nothing), the form's background step, and
  opening the admin tab (the last two at most once an hour per server). Up to 5000 entries a run.
  Evidence: `src/app/api/cron/waitlist-purge/route.ts:37-56`; `src/lib/cron/auth.ts:22-31`; `store.ts:334-382`;
  `route.ts:121`; `src/app/api/admin/waitlist/route.ts:44`.
- F45. Past its line, an entry counts as gone even before the purge reaches it: its email link reads "This link no longer
  works", it can't be confirmed, no code can be sent to it, and if the same person sends the form again (or a founder adds
  them) the old entry is deleted first and they start fresh.
  Evidence: `store.ts:131-142, 271-274`; `…160000:101-120`; `…170000:178-184`.
- F46. The clock can restart. When someone sends the form again for an address that is still unconfirmed, and a new confirm
  link is made, the new answers replace the old ones and the entry's join date becomes now. So "40 days after joining"
  means 40 days after the LAST time the form was sent for that address while it was unconfirmed. A confirmed, invited or
  joined entry never restarts. Evidence: `store.ts:205-239`; `…170000:238-262`; `route.ts:138`.
- F47. Shorter clocks: a confirm link works 7 days (`tokens.ts:25`; email: "The link works for 7 days."). A code works once,
  for 14 days or until the entry's 38-day mark if that is sooner; the invite email names the exact end
  ("Your code works once, until Saturday, October 17 at 2:14 PM EDT."). No code is sent in an entry's last 24 hours.
  Evidence: `access-code.ts:18`; `…170000:182-185, 209`; `email-content.ts:15-36, 189`.

**"Take me off the list"**
- F48. Both emails carry it. Confirm email: "Changed your mind? Take me off the list." Invite email: "Not for you anymore?
  Take me off the list." The link opens `/waitlist/confirm?token=…&leave=1`. Opening it removes nothing; the page says
  "This takes you off the list and deletes your answers." and needs a tap on "Yes, take me off". Then: "You’re off the
  list. We deleted your answers. Changed your mind? You can join again any time."
  Evidence: `email-content.ts:85-91, 133-135, 152, 205`; `confirm-client.tsx:58, 185-203`.
- F49. What the tap deletes: the whole `waitlist` row, at once, whatever its state; and the keyed address hash on that
  address's waitlist send-log rows. Evidence: `src/app/api/waitlist/leave/route.ts:40-44`; `store.ts:297-318`.
- F50. What stays after leaving (and after the 38-day purge, and after a founder's "Remove"):
  - the send-log rows themselves, without the hash: kind, domain, time, sent/failed, Resend's message id (`store.ts:291-307`).
    Nothing deletes these rows; the table's own note says "Retention: purge rows older than 180 days by hand"
    (`supabase/migrations/20260922104000_email_sends.sql:169`).
  - Resend's own record of the email (address, and the email's content) under that message id (F63).
  - the founder action log rows (F23): they hold the deleted entry's row id and the batch, kept for good (append-only).
  - rate-limit counters (F20) until their clean-up (F57).
  - if the person already made an account: the account, its wave tag (F21) and its `access_code_hash` (F22).
- F51. The leave button is not offered once the entry is "joined" (the page shows "You’re in." with a Log in link only).
  That entry goes at its 38-day mark, or when the account is deleted, or if a founder removes it.
  Evidence: `confirm-client.tsx:57, 65` (`CAN_LEAVE` has no "joined").
- F52. Older links stop working. A new confirm email replaces the confirm token; a new code replaces the invite token. A dead
  link shows "This link no longer works" and offers no leave button; the newest email's link is the one that works.
  Evidence: `tokens.ts:5-9`; `store.ts:229`; `…170000:214`; `confirm-client.tsx:32-37, 65`.
- F53. A founder's "Remove" does the same delete as the person's own. Evidence: `…/[id]/remove/route.ts:42-51`.

**When the person signs up, and when that account is later deleted**
- F54. Signing up with the code does not delete the entry. It marks it joined, links it to the new account
  (`redeemed_user_id`), and keeps the sign-up address (F15). The entry still goes at its 38-day mark. The wave tag (F21) is
  written at that moment. Evidence: `…120000:312-331`; `…140000:96-122`.
- F55. Deleting the account deletes the entry its code redeemed (name, school address, answers), forgets that address's
  send-log hash, clears any "claimed by this sign-in address" mark on other entries, and deletes the wave tag with the
  account. Evidence: `src/app/api/me/route.ts:139-148`; `store.ts:320-332`; `…120000:470-502` (trigger
  `waitlist_forget_user`, BEFORE DELETE on `public.users`); `…140000:79` (`on delete cascade`).
- F56. Gap: an entry that was NOT redeemed by that account is not touched by account deletion. Example: someone on the list
  with their school address who got an account another way (the allowlist, or after sign-up opens). That entry waits for
  its own 38-day mark. Evidence: `store.ts:327` (matches on `redeemed_user_id` only); `…120000:485`.

**Things with their own clocks**
- F57. Rate-limit counters (with the IP): rows older than one day are deleted only when a later rate-limit call happens to
  trigger the clean-up (1 call in 100). At low traffic they can stay for days or weeks.
  Evidence: `supabase/migrations/20260922090000_guard_function_privileges.sql:229-232`;
  `20260922104000_email_sends.sql:26-36` ("can outlive a deleted account by weeks").
- F58. Send-log backstop: the purge also blanks the hash on every waitlist send-log row older than 38 days, in case the
  per-person step failed. Evidence: `…170000:113-119`.
- F59. `access_code_hash` in the account's sign-in record (F22): for the life of the account. Nothing removes it.
- F60. The founder action log (F23): no deletion. "a trigger refuses UPDATE and DELETE" (`require-platform-admin.ts:186-187`).
- F61. `signup_allowlist` and `app_settings`: no deletion rule in code.
- F62. Backups: NOT FOUND in code. Whether Supabase keeps backups (in which a deleted entry would outlive 40 days) is a
  plan setting. The live page says backups keep copies "up to 30 days"; the Sept 7 draft and Terms v2 say there are none.

## 4. Third parties that receive it

**For the waitlist**
- F63. **Resend** sends the two emails and so receives, for each one, the address and the whole email.
  - Confirm email, subject "Confirm your spot on the Vibe waitlist": the school address, the confirm link and the leave link
    (both carry the token). No typed text in it.
  - Access-code email, subject "Your Vibe access code": the address, the person's name ("Hi <name>, your spot on Vibe is
    ready."), the access code in clear text, the sign-up link with the code in it, the leave link.
  - Reply-To is `hello@connectvibe.app`. The From address is the `RESEND_FROM` setting. Resend keeps its own log; how long
    is not in code. Default caps: 40 access-code emails and 30 confirm emails in any 24 hours.
  Evidence: `src/lib/waitlist/email-content.ts:46, 138-168, 176-223`; `src/lib/email/resend-transactional.ts:289-325`;
  `src/lib/waitlist/admin-view.ts:156-157`.
- F64. **Supabase** holds the database (every table in section 1) and runs sign-in. At sign-up it receives the typed access
  code and checks it in a hook before any account is made. Evidence: `…120000:136-224`; `signup-form.tsx:280-296`.
- F65. **Vercel** runs the site, the server code and the daily clean-up (Vercel Cron), so every request passes through it
  with the visitor's IP and the page address. The confirm link and the sign-up link are ordinary page loads, so
  `?token=…` and `?access_code=…` reach Vercel as part of the address. (The status / confirm / leave calls send the
  token in the body instead: "so the token never sits in a URL our server logs".) What Vercel's request log keeps of an
  address, and for how long, is a Vercel setting: NOT in code.
  Evidence: `vercel.json:3-8`; `email-content.ts:81-102`; `src/app/api/waitlist/status/route.ts:18`.
- F66. **Google (Google Fonts)**, two ways. (1) Every page loads a font stylesheet from `fonts.googleapis.com` and font files
  from `fonts.gstatic.com`: LIVE NOW; landing-night only adds a `preconnect`. (2) Every email's HTML links the same Google
  Fonts stylesheet, so a mail app that loads remote styles (the code names Apple Mail) contacts Google when the email is
  opened: LIVE NOW for the existing emails, new for the two waitlist emails.
  Evidence: `src/app/layout.tsx:99-103`; `resend-transactional.ts:25-27, 110` (main: line 91 of the same file).
- F67. **Sentry**. The browser SDK starts on every page, the landing and the waitlist included, when the Sentry address is
  set: error reports and a 10% sample of performance traces, sent straight from the browser to Sentry (no tunnel).
  "sendDefaultPii: false". Token and `access_code` values are blanked out of addresses before sending
  (`access_code` added on landing-night). Nothing blanks an email address or a name if one ever landed in an event.
  Evidence: `src/instrumentation-client.ts:5`; `src/lib/sentry-config.ts:16-17, 202-205`; `next.config.ts:128-133`.
- F68. **Email replies and "write to us" links.** Replies to a waitlist email go to `hello@connectvibe.app`. The pages link
  `mailto:help@connectvibe.app` ("Bring my club to Vibe", "My Vibe access code"). Where those inboxes live is not in code.
  The Sept 7 draft says hello@ is forwarded by Cloudflare Email Routing to a Gmail inbox. NOT VERIFIED here.
  Evidence: `email-content.ts:46`; `waitlist-done.tsx:7`; `confirm-client.tsx:20-21`; `home-landing.tsx:28`.
- F69. **IU and Purdue** get nothing from Vibe. But the emails are delivered to the person's school mailbox, so the school's
  mail system carries them (the code plans for it: "mail scanners open links"). Evidence: `src/app/waitlist/confirm/page.tsx:14-16`.
- F70. No analytics, ad or tracking service. `package.json` has none; grep `gtag|analytics|posthog|plausible|fbq|mixpanel|segment`
  over the landing and waitlist code: no hits. The only "where did you come from" data is the `?src=` tag (F7).

**For the landing page: what a logged-out visitor's browser contacts**
- F71. Vibe's own site: the page, its scripts and styles, the stills and the film poster (`public/landing/*.avif|webp|jpg`),
  and the headline font, a local file (`src/components/landing/fraunces-soft.woff2` through `next/font/local`).
  LANDING-NIGHT ONLY. Evidence: `src/components/landing/soft-font.ts:11`; `src/components/landing/readout.tsx:63-70`;
  `src/components/landing/day-on-vibe.tsx:28, 91-95`.
- F72. **Vercel Blob**, for the demo film: host `npzptkkzqxthhsnu.public.blob.vercel-storage.com`, files
  `vibe-demo-780.mp4` or `vibe-demo-390.mp4`. The browser fetches it by itself when the film section comes near the
  screen (within 60% of a screen height); no click needed. With reduced motion or Save-Data nothing is fetched until
  Play. Vercel sees the IP and browser; the site sends only its origin as referrer. LANDING-NIGHT ONLY.
  Evidence: `src/lib/landing/demo-media.ts:25-28`; `src/components/landing/use-day-film.ts:17-26, 59-65, 133-138`;
  `next.config.ts:86` (Referrer-Policy).
- F73. Google Fonts (F66) and Sentry (F67), as on every page. LIVE NOW.
- F74. No browser call to Supabase from the landing or the waitlist pages: the server reads the switch. The login page does
  ask Supabase "is sign-up open" from the browser (LANDING-NIGHT ONLY). Evidence: `src/app/page.tsx:54`;
  `src/lib/waitlist/use-signup-open.ts:29-37`; `src/app/auth/login/page.tsx` (diff vs main).
- F75. Store links ("Get Vibe on the App Store / Google Play") show only when their settings hold a real listing; they are
  plain links that leave Vibe. Evidence: `home-landing.tsx:74-85, 379-388`.

**What the landing says (quotes)**
- F76. Hero: "Find your clubs, your events, and each other. Free with your school email." (`home-landing.tsx:220`)
- F77. Page description: "Vibe is the social app for college students. Find your clubs, see what they have on this week, and
  meet people from your major. Free with your school email." (`src/app/page.tsx:12-13`)
- F78. Student door while closed: "We’re opening Vibe in waves. Join the waitlist with your school email, and we’ll send you
  an access code when it’s your turn." Once open: "Sign up with your school email. It’s free, and only people who have
  one can join." (`home-landing.tsx:313, 319`)
- F79. Club door: "A page, your events, and a chat your members will open. Write to us and we’ll set it up with you." with
  "Email us" (help@connectvibe.app) and "Or join the waitlist as a club officer". (`home-landing.tsx:328-337`)
- F80. Film label: "Real app" · "Sample accounts". The code's own note: "The film shows the founders' own photos with real
  people in them". (`day-on-vibe.tsx:69-74`; `demo-media.ts:4-5`; `.vercelignore`: "it shows real people's photos")
- F81. Footer, on the landing and on the waitlist pages: "© CONNECTVIBE. LLC", links Terms (`/legal/terms`), Privacy
  (`/legal/privacy`), Guidelines (`/legal/community`), Support (`/support`), then
  "Vibe is not affiliated with Indiana University or Purdue University."
  The live landing has the same © line and four links but NOT that sentence (LANDING-NIGHT ONLY).
  Evidence: `home-landing.tsx:67-72, 361-367`; `src/app/waitlist/layout.tsx:29-39`.
- F82. Schools line at the bottom: "IU · Purdue". (`home-landing.tsx:31, 356`; `src/lib/iu/campuses.ts:191-194`)
- F83. No privacy promise on the landing or the waitlist pages (no "private", "we never sell", "secure"). NOT FOUND
  (grep `privat|never sell|secure|safe|your data|track` over those files: only code comments).

**The sign-up page on landing-night**
- F84. The checkbox, same words as live: "I’m **18 or older** and I agree to the Terms of Service and Privacy Policy." Both
  names are links (`/legal/terms`, `/legal/privacy`, new tab). Under it until ticked: "Required — check the box above to
  create your account." What is recorded is the Terms version in code, `"2026-05-07"`, and that the age box was ticked.
  Evidence: `src/app/auth/signup/signup-form.tsx:585-618, 283-296`; `src/lib/legal/terms.ts:1-2`.
- F85. New on landing-night: an "Access code" field ("from your invite email", placeholder `VIBE-XXXX-XXXX`), shown while
  sign-up is closed; "Can't find it? Search your email for “Your Vibe access code”, or write to help@connectvibe.app and
  we'll send a new one."; "No code yet? Join the waitlist". The page has no legal footer; the only legal links are the
  two in the checkbox. Evidence: `signup-form.tsx:497-531, 668-675`.
- F86. The page tells people to sign up with a personal address: "Use your **personal email** — the one you actually check.
  Your school .edu is verified separately in the next step." The invite email says the same. So one person usually has
  two addresses in play: the school one on the waitlist entry, the personal one on the account (and in F15).
  Evidence: `signup-form.tsx:470-473`; `email-content.ts:190`.

## 5. Live page: claims that are false or missing

Source: `src/app/legal/privacy/page.tsx` (effective "September 28, 2026"; the same file on both trees). For this area only.

- L1. MISSING: the waitlist, entirely. No word about it in any section. The form's notice links to this page, and
  BUILD.md 6.2(a) says these lines must be live before anything else in the go-live. (page.tsx: no "waitlist")
- L2. FALSE by omission, section 3 "Service providers": it lists "Supabase (database, auth, storage), Vercel (hosting and
  serverless functions), and Cloudflare R2 (media storage)". Resend is not there, yet the waitlist form itself tells
  people "Resend sends our emails" (F63). Sentry and Google Fonts are not there either (F66, F67). (page.tsx:89-93)
- L3. MISSING, section 1: people who have no account. The page speaks only of "Account info you give us". A waitlist entry
  is personal data from someone with no account: school address, name, year, major, clubs, the club they run, a free
  line, the source tag, three consent times (F1 to F9). (page.tsx:35-41)
- L4. MISSING, section 1: people a founder adds by hand, who never saw a form (F24).
- L5. MISSING, section 1: the personal address typed at sign-up is also written on the waitlist entry (F15).
- L6. STALE, section 2, emails: "account-related emails (verification, password reset, security notices)". Two more
  automatic emails now exist, to people without an account: "Confirm your spot on the Vibe waitlist" and "Your Vibe
  access code" (F63). (page.tsx:75)
- L7. NEEDS CARE, section 2: "We will not send marketing email without your consent." The form now asks for that consent
  ("Also send me Vibe news. Optional.", F9). The sentence stays true. Missing: how to take the consent back, and that
  the consent is deleted with the entry within 40 days. No code sends news. (page.tsx:75; F9)
- L8. MISSING, section 2, purposes: "to confirm your spot, choose who gets in each wave and email you when it's your turn"
  (the notice's words), and the `?src=` tag's purpose (which channel brought people: `view.ts:55-57`).
- L9. MISSING, section 3, who inside Vibe sees it: platform admins see the list with masked addresses; full addresses only
  for listed founders, each look logged (F36, F37). The page only says "role-based access for our team". (page.tsx:165-166)
- L10. MISSING, section 4, choices: "Take me off the list" in every waitlist email (F48, F49). The page offers only
  "Delete your account" from Settings, which a waitlist person does not have. (page.tsx:116-126)
- L11. MISSING, section 4, "Access and correction": a waitlist person cannot view or edit their answers anywhere; the page
  points to "your profile page". (page.tsx:105-115)
- L12. FALSE for the waitlist, section 5: "We keep your account data for as long as your account is active." There is no
  line for the 40-day rule (30 unconfirmed), the 7-day confirm link, or the 14-day code. The number must match the
  notice word for word: "We keep your answers for up to 40 days." (page.tsx:144-149; F42, F43, F47)
- L13. NEEDS CHECK, section 5: "Encrypted backups may retain copies for up to 30 days". If that is true, a deleted waitlist
  entry can sit in a backup after day 40, and "up to 40 days" needs "plus backups". If it is false (the Sept 7 draft and
  Terms v2 say there are no backups), the sentence is wrong for everyone. Not answerable from code (F62).
- L14. MISSING, section 5: what stays after an entry is deleted: send-log rows without the address hash, Resend's own
  record, the founder action log, rate-limit counters for about a day or more, and for someone who joined, the wave tag
  and the code hash on the account (F50, F59).
- L15. MISSING, section 5: deleting an account also deletes the waitlist entry its code came from and the wave tag (F55).
  The list "profile, posts, comments, reactions, connections, RSVPs, messages, and chat reactions" has neither.
  (page.tsx:124-125)
- L16. TRUE but thin, section 1: "IP address (used for abuse prevention and rate-limiting)". The waitlist form does count
  by IP (F20). Missing: that this applies to visitors with no account, and how long (F57).
- L17. NOT FOUND in this area, section 1: "approximate location derived from IP". Nothing in the waitlist or landing code
  works out a location from an IP (grep `geo|x-vercel-ip|ipcountry|latitude|city` over `src/lib/waitlist`,
  `src/app/api/waitlist`, `src/app/api/cron`, `src/lib/rate-limit.ts`, `src/app/waitlist`, `src/components/landing`: no
  real hits, only "opacity"). The Sept 7 draft says Vibe never does. Other readers own the rest of the app.
- L18. NOT FOUND in this area, section 1: "strictly necessary cookies for sign-in sessions and CSRF protection". The waitlist
  sets no cookie. Its cross-site guard is not a cookie: it refuses a post that is not JSON or that the browser marks as
  cross-site. (`src/lib/waitlist/request-guard.ts:20-33`)
- L19. NOT FOUND in this area, section 2: "aggregate usage analytics". The landing and waitlist have none (F70).
- L20. MISSING, section 3: the landing's demo film is fetched from Vercel Blob (F72). After the merge, a logged-out visitor's
  browser contacts that host. The page has no "requests your browser makes" list at all.
- L21. MISSING: Google Fonts is contacted by every page and by email apps that load the emails' fonts (F66).
- L22. WEAK for the waitlist, opening line: "By using Vibe, you agree to the practices described here." A waitlist person
  ticks no Privacy Policy box. They tick age + student, and "Email me when it's my turn"; the notice only links here (F9).
  What is recorded is the notice version "2026-10-03", not a policy version.
- L23. NEEDS CARE, section 7: "Vibe is for users 18 and older who are affiliated with a U.S. college." The waitlist asks for
  "I’m 18 or older and a current student." and takes only IU or Purdue addresses; a founder can add any address (F24).
  "We do not knowingly collect information from anyone under 13" sits oddly beside an 18+ rule.
- L24. MISMATCH, contact: the page gives hello@connectvibe.app. The waitlist pages and the sign-up page send people to
  help@connectvibe.app; waitlist emails reply to hello@ (F68). Not wrong, but the policy should name both or one.
- L25. MISSING: "not affiliated" wording. The new landing and waitlist footers say "Vibe is not affiliated with Indiana
  University or Purdue University." (F81). The live policy says nothing about the universities.
- L26. The page still calls itself "a baseline draft for our early college rollout. Review with qualified legal counsel
  before broad public launch." (page.tsx:27-32). The waitlist form links to it as the Privacy Policy.

## 6. Sept 7 draft: claims that are stale, false or missing

Source: `handoffs/legal-drafts/2026-09-07-privacy-policy.md` (line numbers are that file's). For this area only.

- S1. MISSING everywhere: the waitlist. grep `waitlist|access code` over the draft: no hits. It needs its own rows in
  section 3 (what we collect), 5 (who can see), 6 (vendors), 8 (how long), 9 (choices).
- S2. STALE, section 2 (line 21): "This policy applies to everyone who visits www.connectvibe.app … or creates a Vibe
  account." A third group now exists: people on the waitlist, who have no account, and people a founder added (F24).
- S3. FALSE after the merge while sign-up is closed, section 2 (line 24): "You can sign up with any email address". A new
  account now needs an access code, or an address on the allowlist, until the switch opens (F25, F26, F64).
- S4. STILL EXACT, section 2 (line 29) and section 13 (line 316): the checkbox quote "I'm 18 or older and I agree to the
  Terms of Service and Privacy Policy" matches the code on both trees (F84).
- S5. STALE, section 4 (line 97): "The only *automated* emails Vibe sends are the three listed in section 6 (signup
  confirmation, password reset, school-email verification)." Add the waitlist confirm email and the access-code email
  (F63). They go to people with no account.
- S6. STALE, section 4 (line 97): "We do not send marketing email, digests, or activity emails." Still true in code (no news
  sender exists), but the form now collects a consent to "Vibe news" (F9). Say what that consent is for, or drop the box.
- S7. STALE, section 1 (line 13), the postal-address decision: "Add one before any of these: sending promotional email…".
  The news tick is the first step toward promotional email. The waitlist emails carry no postal address; their footer is
  "vibe. · Indianapolis" and a "Privacy policy" link (`resend-transactional.ts:145-146`).
- S8. STALE, section 6 table, Resend (line 158): "the three transactional emails we send". Now five kinds to users, and the
  access-code email carries the person's name and the code (F63).
- S9. STALE, section 6 table, Vercel (line 156): "Runs the Vibe website and server code; keeps short-lived request logs".
  Add: runs the daily waitlist clean-up (Cron), and Vercel Blob serves the landing's demo film (F65, F72). Also `?token=`
  and `?access_code=` reach Vercel inside page addresses (F65).
- S10. STALE, section 6a (lines 164-173), "Requests your browser makes directly": add the Vercel Blob host on the landing
  (F72). Google Fonts and Sentry lines still hold. Add that emails also load Google Fonts (F66).
- S11. STALE, section 3d (line 80), rate limits: the list of what is counted has no waitlist lines. New counters by IP for
  visitors with no account: the form (30 an hour), confirm emails (10 a day), the status / confirm / leave calls (60 an
  hour) (F20). "This is the **only** place Vibe itself stores an IP address" stays true for this area: same table.
- S12. STALE, sections 3d, 8 and 9d (lines 80, 210, 270): "Password-reset requests are counted by your email address" / counters
  "which may contain your IP or email". Since Sept 22 the address is a keyed hash, and the waitlist's per-address counter
  is too (F20; `20260922104000_email_sends.sql:21-23`).
- S13. STALE, section 1 (line 13): "Francisco Cazares is the only person with administrative access to your data … James
  Andres and Rylan Conaway can read the business inbox … and nothing else". The Waitlist tab is open to every platform
  admin: names, answers and masked addresses (F36). Only the full address is limited to listed founders (F37). Who the
  admins are is data, not code: BUILD.md 6.3 counted 3. Check before writing this sentence.
- S14. STALE for this area, section 5e (line 138): "We do not keep an audit trail of administrative reads." For the waitlist
  there is one: every "Show email" is logged first (F37), and adds, removes and code sends are logged (F23).
- S15. MISSING, section 5: who can see a waitlist entry (nobody outside Vibe; admins as in F36/F37), and that the form gives
  the same answer to everyone (F32).
- S16. MISSING, section 8: 40 days (30 unconfirmed), deleted two days early in practice; the restart on a second submit
  (F46); 7-day confirm link; 14-day single-use code that never outlives its entry (F47). The draft's list of link lifetimes
  (line 213) has none of these.
- S17. MISSING, section 8: the send log. Rows stay with kind, domain, time, outcome and Resend's message id; only the address
  hash is forgotten (F19, F50). The draft never mentions `email_sends` (it predates it: Sept 22).
- S18. MISSING, section 9d: account deletion now also removes the waitlist entry the code came from, the wave tag, and
  clears the claimed-address mark (F55). And the gap in F56.
- S19. MISSING, section 9e "Withdraw consent": "Take me off the list" (F48), and how to take back the news consent.
- S20. MISSING, section 12 (age): the waitlist has its own attestation, with different words: "I’m 18 or older and a current
  student." (F9). Section 12 covers only the sign-up checkbox.
- S21. MISSING, section 13 (how we record agreement): for the waitlist we store three consent times and the notice version
  "2026-10-03" (F9). No IP or browser details on the entry (F11): the draft's sentence "We do **not** store … your IP
  address, your browser details" holds for the waitlist row too.
- S22. MISSING, section 3a: the wave tag kept with an account (F21) and the code hash in the sign-in record (F22).
- S23. STILL TRUE for this area, section 3e (lines 85-89): no analytics or ad SDK, no location. Add the `?src=` tag so the
  "no tracking" line is not read as "we don't note where you came from" (F7, F70).
- S24. STILL TRUE, section 1 (line 11): "not affiliated with, endorsed by, or operated by Indiana University or Purdue
  University". The new footer says the short form (F81). Section 6c (line 181) "Vibe sends nothing to IU or Purdue" holds;
  add that waitlist emails land in the school mailbox (F69).
- S25. STALE, section 7 (lines 193-195): fine for this area (the waitlist and landing add no cookie and no local storage,
  F27), but the service worker's one cached file is not in the draft (F28; other readers own this).
- S26. STALE, section 2 (line 21): "Vibe is a website; there is nothing separate to download or install." The new landing
  can show App Store and Google Play links (F75). Other readers own the store apps.

### 6b. The Terms of Sept 29 (v2), where this area touches them

Source: `handoffs/legal-2026-09-29/02-terms-of-service-v2.md`. It was written before the waitlist existed.
grep `waitlist|access code|wave` over it: no hits.

- T1. FALSE after the merge while sign-up is closed, section 2 (line 28): "Anyone 18 or older may create a login with any
  email address." A new login needs an access code or an allowlisted address (F64, F26).
- T2. MISSING: any term for the waitlist and the code. The facts a term would rest on: a code is single use, tied to the
  first address that uses it, ends after 14 days or with the entry, can be replaced by a founder, and joining the list
  promises nothing but "we'll email you when it's your turn" (F14, F15, F47; `view.ts:32-44` for the refusal wording).
- T3. STALE, intro (line 7): "only one of them, Francisco Cazares, can reach the systems that hold your data". Same point as
  S13: every platform admin can open the Waitlist tab.
- T4. MISSING, section 14 "What we delete": the waitlist entry tied to the account and the wave tag (F55).
- T5. CONSISTENT: section 1 (line 19) quotes the checkbox exactly as the code has it (F84). The intro's "Vibe is not part
  of, sponsored by, endorsed by, or operated by Indiana University, Purdue University" is stronger than the footer's "not
  affiliated" (F81); pick one wording for both documents.
- T6. NOTE: the Terms say the Privacy Policy is agreed "at the same time you agree to these Terms" (line 11). A waitlist
  person agrees to neither document (L22).

## 7. Surprises and open questions

### 7a. BUILD.md 6.2(a), line by line (what the Privacy Policy "must say")

| 6.2(a) line | Verdict | What it misses |
|---|---|---|
| "What the waitlist collects: the school email, name, year, major, clubs, whether they run a club and which one, the optional one line, where they came from (the `?src=` tag), when they agreed (age, invites, the optional news), and a record of each email we send (its kind, the address's domain, the time and a keyed hash of the address)." | TRUE as far as it goes (F1 to F9, F19) | The sign-up address stored on the entry (F15). The link to the account (F16). IP-keyed rate-limit counters (F20). Resend's message id and the sent/failed result in the send log (F19). People added by a founder, any address, no consents (F24). The founder action log (F23). The domain is stored only for school and five big providers, else "other". |
| "Why: to confirm the spot, choose who gets in each wave and email the access code." | TRUE; matches the notice | The `src` tag's purpose (which channel worked). The news tick's purpose. Abuse limits (the IP counters). |
| "Who stores or handles it: Supabase (the database), Vercel (runs the site and the daily clean-up), Resend (sends the emails)." | TRUE; matches the notice | Google Fonts (page and email fonts, F66). Sentry (F67). Whoever hosts hello@ / help@ when a person replies (F68). The school's own mail system (F69). |
| "How long: up to 40 days after joining the list, whatever happens; an unconfirmed entry up to 30 days after its last confirm email. The email record forgets the address with the entry." | TRUE with three footnotes | (1) "Joining" restarts when an unconfirmed person sends the form again (F46). (2) "Forgets the address" = the hash is blanked; the row, its domain, time and Resend's message id stay, and Resend keeps its own copy (F50). (3) It holds only while one of the three purge callers runs (F44); see Q3. |
| "After joining: an account made with an access code keeps only which wave it came in with (the batch, form or added by a founder, the day let in, the day joined), deleted with the account." | MOSTLY TRUE (F21) | "Only" is too strong: the account's sign-in record also keeps the code's hash for good (F22), and the entry itself stays linked to the account until its own 38-day mark (F54). |
| "Leaving sooner: "Take me off the list", in every email, deletes the entry at once." | TRUE (F48, F49) | It needs a second tap on the page. Only the newest email's link works (F52). No leave button once joined (F51). What stays behind (F50). |

### 7b. Surprises

- X1. A second email address is stored. The address typed on the sign-up page with a code is written on the waitlist entry
  in clear text before the account exists, and stays if the sign-up fails (F15). After a re-sent code the old one is
  also kept inside `code_prev` (F17). The notice and 6.2(a) mention only the school address.
- X2. The form counts by IP address for people who have no account (F20), and those counters are cleaned up only by chance
  (F57). The live page mentions IP for rate limiting in general; nothing tells a waitlist visitor.
- X3. Anyone can type anyone's school address. An unconfirmed entry is "a stranger's typing" (the code's words,
  `store.ts:347`). A second submit for the same address overwrites the name and answers and restarts the clock (F46).
  The address owner gets a confirm email: "Didn't sign up? You can ignore this email." Ignored, it is deleted in 28 days.
- X4. "Up to 40 days" is kept by a cron on Vercel's Hobby plan that runs once a day and is not retried, plus two helpers that
  run only when someone uses the form or the admin tab. If `CRON_SECRET` is unset the cron answers 401; if the cron is
  sent to the apex domain it gets a 308 and never runs (BUILD.md 6.2 i 8). On a quiet week with a broken cron, entries
  stay past 40 days, though their links already read as dead (F45).
- X5. Send-log rows are never deleted by code. After the hash is blanked, a row still has Resend's message id, and Resend's
  dashboard can show the address and the email for that id for as long as Resend keeps it (F50, F63).
- X6. The access code is hashed with plain SHA-256 over 40 bits. Someone holding the database could recover codes by trying
  them all. A security note, not a privacy claim, but the policy should say "stored only as a hash", not "cannot be
  recovered". The 256-bit link tokens are fine. (F12, F14)
- X7. If hosted Supabase refuses the two triggers of `…130000`, the plain code stays in the account's sign-in record and in
  every refreshed sign-in token (F22). The file itself allows for this ("its absence only means the plain code is
  kept", `…130000:24-26`). Then "only its hash is stored" is false until that file is in.
- X8. The confirm and leave links carry the token in the page address; the sign-up link carries the code. Those reach
  Vercel with the page load (F65) and sit in the browser history for the confirm page (F30). Sentry is scrubbed (F67).
  The token is 256 random bits. Whoever holds it can see the entry's state, confirm it, or take it off the list; it
  never shows a name or an address. The code is single use.
- X9. Admins see which account a waitlist person became ("Joined as @handle"), next to their waitlist answers, until the
  entry's 38-day mark (F16, F36).
- X10. Founder-added people get no notice and gave no consent, and may be on a personal address (F24). Their first contact is
  the access-code email, which does carry "Take me off the list".
- X11. The news tick is collected, shown to admins, and then deleted with the entry within 40 days. No code sends news, and
  no list of "news" addresses survives the purge (grep `consent_news|newsOptIn`: form, store, admin view only). If news is
  ever sent, addresses would have to be copied out by hand first, which the policy would have to disclose.
- X12. The demo film sits on a public Vercel Blob address and "shows the founders' own photos with real people in them"
  (F80). It is labelled "Real app · Sample accounts". The local copy is kept out of git and deploys for that reason.
- X13. The waitlist emails ask the mail app to load Google Fonts (F66). In mail apps that do, Google sees that the email was
  opened (IP, mail app). Vibe sets no tracking pixel of its own (none in `resend-transactional.ts`).
- X14. Account deletion removes only the entry that account's code redeemed (F56). The delete-account page's promise should
  not be read as "every waitlist trace goes".
- X15. No "Take me off" button for a joined entry (F51), and no self-serve way to see or correct waitlist answers (L11).
- X16. `signup_allowlist` holds clear-text addresses with no deletion rule (F26). Small (reviewers, founders), but it is
  personal data the policy does not cover if a "manual exception" is ever a student.
- X17. The form's notice names three processors in the product itself ("Supabase stores them, Vercel runs the site and
  Resend sends our emails."). The policy must name at least the same three, and any change of vendor now needs a change
  to the form and a new `WAITLIST_NOTICE_VERSION` (`form.ts:18`).
- X18. Good news for the writer: the entry stores no IP, no device, no location (F11); addresses never reach the admin
  page unmasked without a logged reveal (F37); the form leaks nothing about who is on the list (F32); tokens and codes
  are never stored in clear (F12 to F14, with the X7 caveat).

### 7c. Open questions (not answerable from code)

- Q1. Who are the platform admins on production, and who is in `waitlist_email_viewers`? The policy's "who at Vibe can see
  this" sentence depends on it. (BUILD.md: 3 admins; viewers = Franky.)
- Q2. Does Supabase keep backups on the current plan? Decides whether "up to 40 days" needs "plus backups" (L13).
- Q3. Is the Vercel plan's cron reliable enough to promise 40 days in a legal text, or should the policy say "about 40 days"?
  The form's notice already says "up to 40 days", and the policy must match it on the number.
- Q4. Resend: how long does it keep sent emails (address, name, code)? Region? Same for Vercel's request logs and Sentry.
- Q5. Will "Vibe news" ever be sent? From which list, given the 40-day deletion? A postal address is needed first
  (Sept 7 draft, line 13; the LLC has none yet).
- Q6. Do waitlist people agree to the Privacy Policy at all? Today they only see a link (L22). Is a notice enough, or
  should the form's first tick mention the policy?
- Q7. Some IU and Purdue first-years are 17. The form's tick is "I’m 18 or older and a current student." Same open decision
  as the sign-up box.
- Q8. Where do hello@ and help@ land today (Cloudflare Email Routing to Gmail, per the Sept 7 draft)? A reply to a
  waitlist email goes there.
- Q9. Will `…130000` (the code scrub) apply on hosted Supabase? If not, see X7.
- Q10. Should the policy say entries are deleted "38 days" (the truth) or "up to 40 days" (the promise)? Every page and
  email says 40; BUILD.md 6.1 says "only those two numbers are ever shown".
- Q11. Can Sentry ever capture the form's JSON body (address, name) on a server error? Not seen in the config (no body
  capture is set up, `sendDefaultPii: false`), but nothing would blank an address if it did (F67). Worth one test.
- Q12. Is the person in a "founder-added" row told what was stored about them? Today only by the access-code email.
- Q13. The people in the demo film: did they agree to appear on the public landing page (X12)?
- Q14. Does the Vercel Blob host set cookies or keep logs of film downloads? Not visible from code.
