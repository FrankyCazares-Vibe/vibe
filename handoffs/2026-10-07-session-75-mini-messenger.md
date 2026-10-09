# Session 75 (Oct 7): the mini messenger is the new inbox

S75 started from `2026-10-05-session-74-go-live-landing-waitlist-privacy.md`. Its "START HERE" list still stands except items 1 and 2, answered or done below.

## What Franky answered

- Live sign-up test: **not done yet** (S74 section 4, still his).
- Vercel Cron Run: **not sure**. The session could not read the logs (the Vercel connector answers 403 on runtime logs). Still his: Vercel > Settings > Cron Jobs > `/api/cron/waitlist-purge` > Run, 200 = good.
- A tab left open reloaded onto a newer build by itself: **yes, once**. The new-build check works on his machine.
- Mini messenger: choice 1, a small version of the new inbox that opens chats in `/messages`.

## What shipped (`0c387a4`, live Oct 7, build `dpl_2zmkeb89…`)

The small Messages window over the desktop profile now shows the real inbox, not a copy of it.

- `public/html/_miniMessenger.js` asks `/api/me/features` once. With `chat_v2` the panel frames **`/messages/mini`**; without it (the off button) the old list and chat run as before, untouched.
- `/messages/mini` (`src/app/messages/mini/page.tsx`, `src/components/desktop/messages/MiniInbox.tsx`) is the phone's `MessagesHome` with a new `mini` prop: no header, no tab-bar gap. So: Your week, one row per club with its logo, unread marks, pinned first, one date format. Nothing to keep in step by hand.
- Every tap takes the whole tab: a row or a week card to `/messages?channel=<id>`, a link (`Find clubs`) to its own address. `openMiniMessenger(handle)` goes to `/messages?to=<handle>`.
- The unread dot on the profile's Messages icon now counts clubs too. It is `allBadgeCount` (home-rules.ts) written by hand in the script: change one, change the other.
- The frame exists only while the panel is open (its page polls every 30 s).
- If the framed page is redirected (sign-in, Terms), the whole tab follows it.

**Checked:** typecheck clean, 2,225 tests pass, walked locally at 1280 wide as Blake (a plain member) in Night and Light: the panel, a club row, a person row, the dot, close and reopen. Live: the new script is served and `/messages/mini` signed out goes to sign-in. **Not seen:** a signed-in account on the live site.

**Known:** a hidden test club still shows for its own members (Franky), as it does in full Messages: the database lets a member see a hidden club. Hiding them from members is an inbox-route decision, not a mini one. No search box in the mini any more (the inbox has none).

## Local environment

- `.env.development.local` now turns the new chat on for everyone locally (`CHAT_V2_*`, `CHAT_DESKTOP_*`); before, the main checkout ran the old chat.
- This handoff is committed but NOT pushed on purpose: a docs-only push redeploys and reloads everyone's open tabs. It goes out with the next code push.

## Next

S74's list from item 3: the blocked-pair traces, the store review note and the providers' terms before Oct 16; the privacy follow-ups; James's lawyer file; Android build Fri Oct 9; both sentinels before Oct 15.

## Later on Oct 7: the blocked-pair traces, decided (Franky said yes to the recommendation)

Two people in one club who blocked each other used to leave three traces. Decided:

| Trace | Decision | State |
|---|---|---|
| A blocked owner's or admin's Board post still shows | **Keep**: members need club announcements. Say so in the store review note. | Unchanged |
| Unread counts included the blocked person's messages | **Fix** | Shipped, `f10758f` |
| Reply and vote counts include theirs | **Leave**: a bare number names nobody. | Unchanged |

**The fix:** `/api/me/inbox` (the Lounge number, the Board dot) and `/api/orgs/[slug]/space` (each room's dot) leave out authors blocked either way; a blocked current owner or admin still counts on the Board, where their post still shows. The rule is `unreadLeftOut` in `src/lib/chat/reads.ts` (tested). Checked on the local database: a member with 16 unread Lounge messages blocked the owner (9 of them) and the number became 7; the Board dot stayed. 2,226 tests pass. The Privacy Policy says nothing about unread counts, so no policy change.

**For the store review note (draft line):** "Blocking hides a person's messages and replies everywhere, including club chats. One exception: a club's official announcements, posted by its owner or admins on the club's Board, stay visible to every member."

**Not covered:** the old thread list (`/api/me/threads` without `scope=chats`) for an account with the new chat switched off; nobody is in that state.

## Evening of Oct 7: the mini messenger, second pass (Franky: "it shouldnt directly send you to the messages tab, it should allow you to send messages from when youre in your own profile, on feed, etc")

The first pass opened every chat in `/messages`. He wants to read and answer in the small window, and to have the window on the feed and the other pages too.

- **Chats open in the window.** The frame is now `/messages?mini=1`: the phone's whole Messages (`MessagesMobile` with `mini`), inbox and chat views with their composers, no shell and no tab bar. `/messages/mini` and `MiniInbox.tsx` are gone. `MessagesSwitch` also treats any framed `/messages` as mini, because opening a chat rewrites the frame's address without `mini`.
- **Only Messages stays in the frame.** `src/components/desktop/messages/MiniFrame.tsx` sends the whole tab for any link or router push that leaves `/messages` (a profile, a club page, an event).
- **On the feed, Network, Otto, Settings:** `src/components/desktop/messages/MiniMessenger.tsx`, mounted in `CampusAppShell`: a `Messages` button at the bottom right, left of Otto, with the unread number; laptops with `chat_v2` only, never on `/messages`. The static profile keeps `public/html/_miniMessenger.js`. The two are twins: change one, change the other.
- **Window title bar:** a pencil (new message, sent to the frame as `{ source: "vibe-mini", type: "compose" }`), `Open` (the chat on screen, in full Messages), close.
- The window carries `data-holds-reload` while open, so the new-build check never reloads a page under a draft typed in the frame.

**Checked locally at 1280 as Blake:** the button on the feed, the inbox, a person's chat (sent a message, it arrived, the inbox preview updated), a club's Lounge, Back inside the window, the club's page arrow taking the whole tab, and the same on the static profile. 2,226 tests pass.

**Known:** each chat opened in the window adds an entry to the tab's history, and closing the window does not take it out, so the browser's Back can need an extra press afterwards. Not seen on the live site signed in, in Safari, or in Light for this pass.

## Oct 8: Messages as a tab of Otto's panel (Franky: "maybe we should make otto be the messages tab aswell in some way ... lets try the first one")

A try, his words: he is not sure what he is picturing. Of three choices he picked the lightest: one corner, one button.

- The separate `Messages` button on the shelled pages is gone. Otto's orb is the only button; **Otto's panel has two tabs, `Otto` and `Messages`** (`PanelTabs` in `src/components/network/OttoSidePanel.tsx`). The Messages tab is the same frame (`/messages?mini=1`), with the pencil and `Open` in the tab row. The panel opens on the tab it was left on.
- **The orb's number is Otto's news plus unread chats**; the Messages tab carries the chat count.
- `src/components/desktop/messages/MiniMessenger.tsx` is now the shared pieces: `useMiniMessages` (is it available, the unread number) and `MiniMessagesFrame`. Laptops with `chat_v2` only; a phone's Otto panel is unchanged.
- **The static desktop profile has the same** (later on Oct 8, Franky: "i like this direction, lets do same thing to profile"): `_otto.js` announces its panel opening and closing (`vibe:otto-panel`), and `_miniMessenger.js` adds the two tabs and the frame to `#ottoPanel`. The top-bar Messages icon opens Otto's panel on the Messages tab (and closes it); Otto's ring lights for unread chats (`.has-chats`). The old floating window only runs without `chat_v2`.

**Checked locally at 1280 as Blake:** two tabs, the inbox, a person's chat with its composer, at 380 wide. 2,226 tests pass.

**For Franky to judge:** Otto's panel dims and blurs the page behind it, so chatting there is not "on the side" of the feed the way the small window was; the panel is always dark, so in Light the Messages tab is a light inbox inside a dark panel; If the try is kept, those two are the follow-ups (he said he likes the direction). If not, the corner button is one commit back.

**Light fixed (Oct 8, his yes):** the Messages frame is always Night, on the feed and on the profile, because Otto's panel is dark in both themes. `MiniFrame` renders `NIGHT_LOCK_SCRIPT` (sets `<html data-theme-lock="dark">` before the first paint) and `applyTheme` keeps a locked document Night (`src/lib/theme/theme.ts`). Seen locally with the page in Light: the frame's page is Night. Still open: the page behind dims while the panel is open.

## Privacy follow-ups done in S75 (rows of `legal-2026-10-04-privacy-v3/page-and-code-changes.md` part 2)

| Row | What | Policy change, same deploy |
|---|---|---|
| 56 | A sender sees their removed message marked, in direct and group chats (phone and desktop) | 5h: one sentence instead of three |
| 50 | Profile views no longer send or store the page you came from | 3d: "Until October 7, 2026 we also recorded…". Old values still stored: clearing them is `update public.profile_views set referrer = null;` on production, NOT run (needs Franky's yes); then the sentence can go |
| 36 | A block also stops new reactions on the blocked person's messages (taking one back is never refused) | 5e Blocks: "new messages and new reactions" |
| 28 | Deleting an account also deletes a waitlist entry under its sign-in or school email, not only the one its code came from | Section 9: "your waitlist entry" |
| 52 | Deleting an account takes its sign-in address off the no-code sign-up list | Section 9 bullet removed; section 11 says so; delete-account page in line |
| 39 | Sign-up: "Good to know: people can see that you viewed their profile or post." under the checkbox | none |
| 40 | Sign-in screen: Privacy Policy and Terms links | none |

Checked: page = text 1,081 of 1,081; 2,230 tests (three new for rows 28 and 52, one for the Night lock); the reaction block walked locally (403 with a block, 200 without, take-back always 200). **Not walked end to end:** account deletion, because the local setup has no file storage and the route stops at the file step before the new lines; rows 28 and 52 rest on their unit tests.

**Changes to the by-hand steps (part 3):** item 20 (deleting an account by email, by hand) now needs one more step, because only the Settings route does it: take the address off `signup_allowlist` and delete any waitlist entry under the account's addresses. The policy says "If we delete your account for you, we take it off by hand."

**Looked at and left:** row 33 (a deleted message's file cannot be attached again) is not small: a deleted message leaves no record to check against. Row 29 (the email service's reference number) needs a database change for the account-deletion half. Rows 24, 51, 58, 21 to 23 are database changes on production: Franky's yes first.

**Second code-only pass (Oct 8):**

| Row | Outcome |
|---|---|
| 35 | DONE. The admin student search sends what was typed in a POST body (`POST /api/admin/users`), never in a web address. Policy 3d: the "email address a cofounder types" sentence is cut. Walked locally as the seed admin: found by email, no address in any URL or on screen; a non-admin gets 403. |
| 16 | Already done before S75: both post composers show `VIDEO_LOCATION_HINT` under a picked video. |
| 38 | NOT code-only: the report reason list is a database CHECK (`reports_reason_code_check`). Needs a migration: Franky's yes. |
| 20 | Left: taking back a join request means a new action in the shared, heavily tested join control (three views) plus the route. Medium, and no live club takes requests today (SAE is invite-only). |
| 27 | Left on purpose: clearing the per-address count when an entry is deleted lets someone leave and rejoin to reset the 3-a-day limit on confirm emails to that address. The count's window is one day. Recommend cutting this row, not building it. |
| 49 | Franky's call: dropping the browser's trail from error reports removes four policy sentences but leaves bug reports with no trail. The gentler form drops only the button taps. |

## Oct 8: error-report trail, and three database changes PREPARED (not applied on production)

**Row 49, the gentler form (Franky's pick), live:** error reports from the browser no longer record button taps (`Sentry.breadcrumbsIntegration({ dom: false })` in `src/instrumentation-client.ts`). The trail keeps pages, requests and our own log lines. Policy 3d says "Until October 8, 2026 it also listed the buttons you tapped". Not seen: a live report after the change (open one in Sentry and check the trail has no `ui.click` lines).

**Three files in `supabase/migrations/`, applied on the LOCAL database only. Each needs Franky's yes, then the Management API recipe in its header, then its `schema_migrations` row.** Each header lists the one read to do on production first (a fingerprint or settings, allowed by the counts-only rule).

| File | Row | What | Order | Policy, the same day |
|---|---|---|---|---|
| `20261008100000_reports_under_18_reason.sql` | 38 | `under_18` joins the report reasons | File FIRST, then merge local branch `after-db-under18` (the code that offers it) | Section 12 can name the Report sheet as well as the address |
| `20261008110000_starter_name_not_from_email.sql` | 24 | A new account with no name starts as "Member", never the front of its sign-in email | Either order; onboarding on main already treats "Member" as "no name yet" | The three "starter name" exceptions go only when the count in the file's header is 0 |
| `20261008120000_users_last_active_private.sql` | 23 | Signed-in accounts can no longer read anyone's last-active time; "active now" comes from `users_active_count(text[])` | CODE FIRST: `/api/stats/campus` on main asks the function and falls back while it is missing. It is live, so the file can go any time | Cut "roughly when it was last active" from 5b |

**Checked locally:** all three apply cleanly with their pre-flights and post-checks; a new account with no name gets "Member"; a signed-in member reading `last_active_at` over the database's web API is refused (42501) while other columns still read; the heartbeat still writes; "active now" answers the same number before and after. 2,230 tests pass.

**A local-only oddity, found while testing:** on this Mac's local database (PostgreSQL 17.6 in the Supabase CLI image), ANY call to a function the caller has no EXECUTE right on crashes the database process (segmentation fault) instead of answering "permission denied". A one-line probe function does it too, so it is the local image, not these files. Production answers such calls with an error (S74 saw exactly that for `signup_is_open()`). The local database recovers by itself in a few seconds. Worth a `supabase` CLI update; not chased further.

## Oct 8, later: the three database files are APPLIED ON PRODUCTION (Franky: "yes apply all three")

- **How:** the Supabase connector (`execute_sql` for the reads, `apply_migration` for the files, each body without its `begin` / `commit`). The connector can write: the old note that it is read-only no longer holds. It records a migration under its own timestamp, so the three rows were renamed to the files' versions (`20261008100000`, `110000`, `120000`) with one `update` on `supabase_migrations.schema_migrations`.
- **Before:** one read of fingerprints and settings; all matched the files' pre-flights (the reason CHECK, `handle_new_user` md5 `2841f3c5…`, column rights t / t / f, the function absent, `campus_id` text). The live build was `d8284bc`, the code the third file needs.
- **After (settings only):** `under_18` allowed; `handle_new_user` no longer reads the email for a name and the sign-up system can still run it; signed-in accounts cannot read `last_active_at`, can still write their own, can still read other columns; the count runs for signed-in accounts only.
- **Counted:** 7 accounts still have a name equal to the front of their sign-in email. So the policy keeps the starter-name exception, now worded "If you made your account before October 8, 2026 and have not chosen a name".
- **Same day:** `after-db-under18` merged (the Report sheet offers "This person is under 18" everywhere it is used); Privacy Policy 3a, 5b and 12 changed; page = text passes; 2,231 tests.
- **Not seen:** the live "active now" number signed in (Franky: glance at the campus banner); a live report with the new reason; a live sign-up with no name.
- **Undo:** each file's ROLLBACK block.

## Oct 8: school email first (Franky), and the slow school emails

**His words:** "people accidentally put school emails first instead of personal"; then: "just do school email, password > code, then profile setup > campus > add a personal email". And, in capitals: the school verification email takes about 20 minutes; he wants **30 seconds**.

**Why it is slow (read from public mail records, Oct 8):** IU and Purdue student mail are both Microsoft 365. Our sender is Resend's shared pool, signed (DKIM in place), with our domain policy at its most lenient (`p=none`). Our emails were branded pages with a button link, the kind Microsoft holds while it scans the link. Not known: whether Microsoft defers us ("try again later", Resend retries) or accepts and then holds. **Franky's 2-minute check:** Resend > Emails > one sent to a school address > its timeline ("Delivery delayed" before "Delivered" = deferral = a better-placed sender is needed).

**LIVE on main (`ce84149`):** the school verification email is a code and nothing to tap: a few lines of system-font text, the code in the subject, no link, no button, no web font, no image. The school-email screen no longer mentions a link. Not measured live yet: ask Franky to time one.

**On local branch `school-email-first` (`fd357ee`), NOT pushed, NOT live:**
- Sign-up asks for the school email (a hint, not a block, for any other address: the team's and the review accounts use other addresses), then the 8-digit code screen, then onboarding.
- `src/lib/auth/school-sign-in.ts` `verifySchoolFromSignInEmail`: confirming the sign-up IS the school check. `enforceCampusAccess`, `enforceSchoolEmailPage` and `GET /api/me/onboarding-state` call it before sending anyone to the school-email screen.
- `supabase/templates/confirmation.html` is the same code-only message (subject `{{ .Token }} is your Vibe code`); the old one is `confirmation.previous.html`. **Production's copy lives in the Supabase dashboard (Authentication > Emails > Confirm signup): paste the file and the subject there. That alone speeds up today's sign-up email too, and can be done any time.**
- Sign-in page and the waitlist invite no longer say "personal email".
- **Walked locally with email confirmation switched on** (config put back after): sign-up with a made-up `@iu.edu` address, the code screen, the email in the local mail catcher (1.5 KB, 0 links), the code typed, landed on `/onboarding` with `school_email` = sign-in email, verified, system `iu`, name "Member".

**Still to build before it goes live:** (1) "add a personal email" after campus and in Settings: a private `users.personal_email` column (a production database change), a code email to that address, two routes; (2) the Privacy Policy and Terms wording (the sign-in email is now a school address; the personal one is optional); (3) later: signing in with either address, and moving the sign-in to the personal address when the school one closes. The four defaults he approved: existing accounts untouched; the no-code list stays for people without a school email; ask for the personal email once, remind in Settings and in the final year; a closed school inbox with no personal email is handled by hand through help@.

**Later on Oct 8, school email first:**
- Franky pasted the code-only confirmation email into the Supabase dashboard (his word: "ok i saved it"). Not seen by the session.
- Policy 3a on main (`6817f5d`): "We send a verification code to your school email and you type it into Vibe" (the morning's email change had made "a link and a verification code" untrue).
- **Branch `school-email-first` (local, 3 commits on top of main, NOT pushed), now complete for a first go-live:**
  1. Sign-up with the school email, the code screen, verified on confirmation (`school-sign-in.ts`).
  2. **Add a personal email:** `supabase/migrations/20261008130000_users_personal_email.sql` (two private columns, one account per address, the email log's new kind `personal_email_code`; applied on the LOCAL database only), `src/lib/auth/personal-email.ts` (the 8-digit code, its own label), `/api/me/personal-email` (GET / POST / PUT / DELETE), `src/components/settings/PersonalEmail.tsx` (the Settings row and the one-time Campus card; "Not now" asks again after 60 days). Nothing renders until the columns exist. An address another account uses answers "ok" and sends nothing.
  3. The Privacy Policy for both (3a "Making an account", a "Personal email" bullet, six automatic emails, the who-sees-what row).
- **Walked locally:** sign-up, the code, onboarding; the Campus card; refusals (a school address, junk, a wrong code); the code typed, stored, shown in Settings, removed. The "send code" call itself was stood in for in the page (no real email was sent from this Mac); the code was worked out the way the server does. 2,235 tests on the branch; page = text passes.
- **To go live (Franky's yes):** apply `20261008130000` on production (the connector, then rename its row), merge the branch, push. Either order is safe.
- **Not built:** signing in with the personal email; moving the sign-in to it when the school inbox closes (by hand through help@ until then); the reminder in the final year; step 3's label on the sign-up form still says "Otto".

## Oct 8, evening: SCHOOL EMAIL FIRST IS LIVE (Franky: "yes apply it and put it live")

- `20261008130000_users_personal_email` applied on production through the connector (pre-flight read matched; after: two columns, private to every client role, the unique index, the email log's new kind; recorded under the file's version). Branch `school-email-first` merged (`63ac6a0`) and pushed; step 3 of the strip reads "Profile" (his ask).
- **Seen live, signed out:** the sign-up page asks for the school email and its strip reads Account, Code, Profile; `/api/me/personal-email` answers 401; the Privacy Policy has the "Personal email" bullet. 2,235 tests; page = text passes.
- **NOT seen live (needs a real person and a real inbox):** a sign-up with an access code and a school address through the code to onboarding; how long the code email takes to arrive at IU and at Purdue (the 30-second target); the Campus card and the Settings row sending a real code to a personal address. Franky's test, with James's or Rylan's school email, covers all three and is the S74 "live sign-up test" he still owed.
- **If sign-up misbehaves:** `git revert -m 1 63ac6a0` and push puts the old form back; the database change can stay (nothing else reads it). The dashboard email (code-only) works with both forms.
- **Still not built:** signing in with the personal email; moving the sign-in to it when a school inbox closes (by hand through help@); the final-year reminder; measuring delivery time in our own log.

## Oct 8, night: the yearly school check-in (Franky: "yearly check-in and 90 days, build it now")

**The rule** (`src/lib/auth/school-checkin.ts`, one pure function, `checkinStage`): an account that SIGNS IN with a school email and has NO personal email is emailed a code at its school address once a year (counted from its last check-in, else from the day it was made). Typed in: fine for a year. Not typed in within 14 days: a 90-day countdown starts. The code or a personal email ends it. Day 90 with neither: deleted. Exempt for ever: an account that signs in with a personal email (all 21 older accounts) or holds one.

**Pieces:** `20261008140000_school_checkin.sql` (three private dates on `users`, the email-log kind `school_checkin`; APPLIED on production, 0 accounts affected) · `school-checkin-job.ts` + `GET /api/cron/school-checkin` (daily at 14:47 UTC, second entry in `vercel.json`) · `/api/me/school-checkin` (GET state, POST the code, PUT send again) · `CampusAccountCard` in `src/components/settings/PersonalEmail.tsx` (the check-in card while one is open, else the personal-email offer; never both) · two code-only emails (`sendSchoolCheckinEmail`) · Privacy Policy section 9 "The yearly school check-in" and "these seven" automatic emails.

**THE DELETE SWITCH IS OFF.** The job deletes nothing unless the Vercel variable `SCHOOL_CHECKIN_DELETE_ENABLED` is exactly `true`. Off, an ended countdown is only counted (`would_delete` in the cron's answer). Turning it on is Franky's decision, after reading that number once. Other guards, each with a test: every account is read again right before it is deleted and a personal email added in the meantime wins; at most 5 deletions and 25 check-in emails a run; an account with a billing customer is never deleted here; files are purged before the account and a failed purge keeps it; a check-in whose email failed is closed again.

**When it first does anything:** October 2027 at the earliest (a year after the first school-first sign-ups). Nobody is in scope today.

**Checked:** 15 new unit tests (the rule, the code, the job against an in-memory table); walked locally as a made-up `@iu.edu` account with the dates set by hand: the "Still have your school email?" card, a wrong code, the right code, the countdown card with its date and no "Later", a personal email ending it. 2,250 tests; page = text passes. **Not run for real:** the cron route end to end (its emails would have gone to a made-up IU address), and no real email of these two kinds has been sent.

**Owed:** in Vercel > Settings > Cron Jobs, press Run once on `/api/cron/school-checkin` and expect `{ok:true, checkins_sent:0, ...}`; a line in the lawyer file (we delete accounts on our own initiative after a notice); the Terms draft should say the same; the 60 / 30 / 7-day reminders are the Campus card only (no reminder emails yet); Vercel's Hobby plan allows two cron jobs and this is the second.

## Oct 8, late: the security sentinel ran (`handoffs/2026-10-08-security-risk-report.md`)

41 agents, 6.1M tokens, 37 min on Fable 5.1 (the run died once when the model was switched mid-run; resumed). 57 raised, **20 confirmed** against today's code, 0 need a live test; none Critical, **one High**. Its own roadmap writer was cut to 3 findings (noted at the top of the report); the Executive Summary's "Top things to do now" is the real list. The new S75 code (school email first, personal email, the check-in cron, Messages in Otto) produced no confirmed finding of its own.

**Pick-up list, in the report's order, with its numbers:**
1. **[#1, High] Evidence for the law.** A reported or moderator-removed chat photo/video is erased when the sender deletes their account, so the company could not make a required report. Fix: a locked copy kept for reports, surviving account deletion (code: the purge in `src/lib/profile/storage-purge.ts` and the chat remove routes; the Privacy Policy already allows evidence to be kept). Mine.
2. **[#2] Password change needs the current password and sends an email.** Supabase > Auth: "Secure password change" and the "password changed" notification: Franky, 5 min each. Code: the signed-in branch of `/auth/update-password` asks for the current password. Mine.
3. **[#3, #4] A browser rule (Content-Security-Policy) and sessions that expire.** CSP with nonces from `src/proxy.ts`, inline scripts in `public/html/*.html` moved to files (about a day, full phone walk after). Supabase > Auth > Sessions: time-box + inactivity timeout are Pro-plan switches: Franky's call on the plan. One sign-out-everywhere pass after (69 logins for 21 people).
4. **[#5, #6] Email budgets.** Daily cap + per-address cooldown on password reset and on the sign-in service's own emails; captcha on sign-up / sign-in / reset / resend and the Supabase "Attack protection" switch; raise the project-wide emails-per-hour from 40. Code mine; the two dashboard switches Franky's.
5. **[#8, #9, #10] Storage cost and fake pages.** Cap upload permissions per account per day, pin each upload to its declared type (R2 serves what the uploader claims), nightly sweep of uploads never attached to anything (this is privacy row 18 too). Mine.
6. **[#7, #11, #13, #14] Rate limits on the signed-out profile/post/club pages and the signed-in actions without one; `next` four patches behind (one serious): a one-line bump; the live Terms call themselves a draft and name no company: the Terms v2 work (`handoffs/legal-2026-09-29/`, STOPPED at 12-results.md waiting for Franky).**
7. **[#12] Work logos and résumé links from any website load on every profile visitor's screen**: a profile owner could learn visitors' addresses. Proxy or drop them. Mine.
8. Lows worth a line: a blocked student can follow you again and ping notifications; any signed-in account could read an open club's full member list (no club is open yet); a club officer could put a fake link in a calendar invite (untested); a build-time tool is in the live dependencies (278 packages).
9. **Needs a specialist:** a paid live pentest against a staging copy before the store submission and the campus launch (store work is parked until Apple accepts; the pentest is not).

Dashboard items for Franky, together: Supabase > Auth: Secure password change ON; "password changed" + "email changed" emails ON; captcha / Attack protection ON after the code ships the box; emails per hour 40 → a few hundred; Sessions time-box 30 d + inactivity 7 d (Pro). The report's Appendix B says what was and was not checked.

## Oct 8, night: the feature sentinel ran (`handoffs/2026-10-08-broken-features-report-3.md`)

23 agents, 4.9M tokens, 85 min on Fable 5.1, **no signed-in session** (the gstack browser's CLI hangs on this Mac, even `--help`; Franky did not sign in on the pane). 32 raised, 21 live, **16 confirmed**, 4 need a signed-in check, 1 false positive dropped. The fix-order agent died on the usage limit; the Executive Summary carries the picture. **Nothing Blocking.** The numbers below are the report's Appendix A.

**Pick-up list, in the order to fix:**
1. **[#1] The sign-up lock (my S75 regression).** Someone whose school address is already verified on an OLDER account signs up again with that address, types the code, and every page sends them to "Verify your campus", which refuses the address as taken. **1 real account is stuck** (created Sept, never signed in). Fix: the school-email screen gets a clear "already verified on another account: sign in there" state instead of the form; refusing the duplicate at sign-up needs the gate hook changed (a database file) and a policy line: Franky's call. Unsticking the one row = deleting a never-used duplicate: Franky's yes.
2. **[#2] Desktop Report sheet has no "This person is under 18"** (`public/html/_safetyActions.js` REPORT_REASONS, the static twin I did not update on Oct 8). One line + a parity test.
3. **[#9, #10, #8] Loose ends of school email first:** login tells an unconfirmed account to find a link that no longer exists; the Confirm-with-code card still says "Personal email" with a Gmail placeholder; the school-email gate drops the `next` deep link it was given.
4. **[#4] A refused reaction stays painted** (`ConversationView.tsx` and `club/reactions.ts` only roll back when fetch throws; the 403 I added for blocks is a clean non-2xx). Swap to `vibeRequest`, roll back on `!ok`.
5. **[#3] Phone visitor profile: no Message button, and "Connected" unfollows on tap.** Add a Message action (`/messages?to=<handle>`), put unfollow behind a confirm.
6. **[#5, #15, #17] Sharing:** a signed-out GET of `/posts/<id>` and `/orgs/<handle>` is a 307 to login, so iMessage/Discord preview the generic card; a dead share link is Next's bare 404. Serve a 200 shell with the OG tags + "Sign in to see this", and a branded not-found page.
7. **[#11, #12, #13, #14] Silent flip-backs:** RSVP, Follow (phone), Unblock, the desktop Mute sheet show nothing when the server refuses.
8. **[#7, #16] Small:** the chat's rich profile card reads fields the bootstrap never sends; public club/profile pages tell never-signed-in visitors "You've been signed out".
9. **Needs a signed-in walk (Franky, or a session after he signs in on the pane):** [#21] "active now" and the heartbeat after the Oct 8 revoke (counts: nobody's last-active has been written since Oct 6); [#20] Otto's Messages tab on a laptop; [#19] the campus map's club bubbles for a 20-member club; [#6] the small Messages window flashing the whole shell on reload; [#18] push: none of the six push variables exist on Vercel (parked until Apple accepts, but Settings > Notifications may be missing).

Re-check after the fixes with the cheap pair: `lenses: ["recent-regression","live-smoke"]`.
