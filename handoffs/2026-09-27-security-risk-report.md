# Vibe — Security, Privacy & Risk Report

**Prepared:** today  |  **Target:** https://www.connectvibe.app  |  **Method:** authorized, read-only adversarial audit (11 attacker lenses, each finding independently verified against current code)

> **Scope & rules of engagement.** This was a READ-ONLY audit: static analysis of the codebase, database (RLS policies + grants), configuration, and dependencies, plus a handful of safe read-only requests to the live site. It did NOT run live exploits against production, because production holds real student data and private messages. Findings marked "needs live test" should be confirmed against a staging / preview deploy, not production.
>
> **Not legal advice.** The Legal & Compliance section flags risk areas in plain terms so you can prioritize; items marked as needing a specialist should go to a qualified lawyer.

**At a glance:** 61 still-relevant findings (34 confirmed in current code, 0 need a live test). During verification, 0 candidate issues were found already fixed and 1 were rejected as false positives, and are not carried below.

---

## Executive Summary

On September 27 this review went through Vibe asking the questions an attacker, a regulator and whoever pays the bills would ask. Can an outsider pass as an IU or Purdue student? Who can read or change whose messages, profiles and club pages? Can a message, post or file carry hidden code that runs on someone else's screen? What happens to the photos, videos and resumes students upload, including after they delete them? What does the app cost if someone abuses it? Do our legal pages match what the app actually does? Reviewers read Vibe's code, the database's own rules about who may see what, the site's settings, and the outside software Vibe is built from. A second reviewer then tried to knock down every finding rated Medium or higher. It threw out one, lowered ten and raised one. Nobody attacked the live site, because real students' profiles and private messages are on it. The one question only a real attempt could settle is marked as needing a test on a copy of the site. Two parts of the review ran but their results were blocked before reaching this report: who can see or change whose data, and what personal details pages hand out. Treat those two areas as unchecked, not clean.

The honest answer is yes: a student using Vibe today is exposed to a few serious risks. Right now the only people in a position to use them are the roughly 20 accounts on Vibe, most of them founders and testers. That changes the day clubs and students arrive. Someone in a chat can plant a reaction that takes over the account of every member who opens it. Someone can upload a resume that does the same to anyone who views it. Any verified student can permanently erase another student's videos. And a student whose intimate photo gets posted has no clear way to get it taken down, which a federal law in force since May now requires. Vibe's code is public on GitHub, so anyone can read the same code this review read.

The September hardening work holds. Other students can't see anyone's email, school email or resume file. Resumes stay private and show with any black-out bars the owner drew. The main pages display what students type safely. Search boxes and links can't be used to trick the database or send students to fake sites, secrets stay on the server, deleting an account clears that student's own data, and reporting and blocking in messages work. Most of what's left comes from two gaps. The database still accepts some changes straight from a student's browser that the app's own screens would refuse. And the site has no browser rule limiting what code can run on its pages, so one slip becomes an account takeover. The rest is privacy promises that don't match reality (anyone with a Gmail account can browse every student, and deleted photos stay online) and running costs with no ceiling: one throwaway account could add about $260 a month to the storage bill.

### Risk register

| # | Risk | Area | Severity | Status | One-line impact |
|---|------|------|----------|--------|-----------------|
| 1 | Chat reactions can carry hidden code: the database accepts any short text as a reaction, and the chat screens run it | Messages | High | Confirmed | Anyone in a chat, group or club channel could read and send private messages as every member who opens it |
| 2 | The resume viewer uses an old PDF reader with a publicly known flaw (found twice) | Resumes | High | Confirmed | Someone could upload a resume that takes over the account of anyone who opens it, founders and admins included |
| 3 | A post can point at another student's video file, and deleting that post deletes the file (found twice) | Video posts | High | Confirmed | Any verified student could permanently erase another student's or club's videos, or repost them as their own |
| 4 | No way to report intimate images shared without consent, and a moderator's removal leaves the file online (federal TAKE IT DOWN Act) | Safety and legal | High | Confirmed | Someone could post a student's intimate photo and the student would have no clear way to get it down; Vibe could face fines above $50,000 per case (lawyer to confirm) |
| 5 | No browser rule limiting what code runs on Vibe's pages, and the sign-in cookie (the small file that keeps a student signed in) can be read by page code (found three times) | Whole site | High | Confirmed | Any slip like #1 or #2 would let someone take over student accounts, with nothing on the page to stop it |
| 6 | Results for "who can see or change whose data" were blocked before reaching this report | Messages, clubs, paid features | Unknown | Results missing | We can't yet say whether one student could read or change another student's messages, club roles or paid features |
| 7 | Results for "what personal details pages hand out" were blocked before reaching this report | Profiles, posts, clubs | Unknown | Results missing | We can't yet say whether profile, post or club pages give out more personal details than they should |
| 8 | The school-email check gates posting but not reading | Who can see students | Medium | Confirmed | Anyone who signs up with a non-school email could browse every student's name, major, year, work history and when they were last online, plus every post |
| 9 | Profiles and posts load for logged-out visitors and search engines | Privacy | Medium | Confirmed | A student's blocked harasser could log out and still see their profile and posts |
| 10 | Videos from removed posts and banned accounts still load for anyone, signed in or not | Moderation | Medium | Confirmed | Anyone holding the link could still watch a video a moderator took down, or one from a banned account |
| 11 | An unconfirmed account keeps whoever set its password first | Sign-in | Medium | Confirmed | Someone could sign up first with a student's email and keep a way into that account after the student confirms it |
| 12 | The three admin accounts use a password only, the leaked-password check is off, and the admins are easy to identify | Admin accounts | Medium | Confirmed | Anyone who phishes one founder's password could ban students, read reports and look up any student's email address |
| 13 | Account deletion erases every chat file the leaving member's messages point to, including other members' uploads | Group chats | Medium | Confirmed | One student could wipe the photos and videos others shared in a group or club chat by deleting their own account |
| 14 | Posts can show images hosted anywhere, skipping the app's checks (found three times) | Feed | Medium | Confirmed | A student could learn the rough location and viewing times of everyone who scrolls past their post, and swap the picture after a moderator looks |
| 15 | Vibe+ shows authors who saved or viewed their posts, while the app says "Only you can see your saves" | Vibe+ | Medium | Confirmed | Once Vibe+ goes on sale, a post's author could see which students privately saved it, despite the app telling them nobody can |
| 16 | Deleted posts, replaced profile photos and moderator-removed images stay reachable | Photos | Medium | Confirmed | Anyone who saved the link could still open a photo a student deleted or replaced |
| 17 | Deleted chat and club files are never erased, contrary to the delete-account page | Group chats | Medium | Confirmed | A student who deletes a photo sent by mistake would still have it stored by Vibe for good, despite what our deletion page promises |
| 18 | No "prove you're human" check (CAPTCHA) on sign-up, and the project can send only about 40 sign-up emails an hour (found twice) | Sign-up | Medium | Confirmed | A simple script could use up the hourly email allowance so real students at a demo-day table never get their confirmation email |
| 19 | Students' browsers can write straight to the database, skipping the app's speed and length limits | Uptime | Medium | Confirmed | One free account could fill the free-plan database until nobody on Vibe can post, message or RSVP |
| 20 | Video uploads up to 200 MB each, with no per-person storage limit and no cleanup of abandoned files (found twice) | Running costs | Medium | Confirmed | One throwaway account could add about $260 a month to the storage bill, and ten could add $2,600, growing every month |
| 21 | The live Privacy and Terms pages date from May 7 and no longer match what the app does | Legal pages | Medium | Confirmed | Apple or Google could reject the store apps over the mismatch, and a regulator could call our privacy statements misleading |
| 22 | No copyright complaint process and no registered copyright agent | Copyright | Medium | Confirmed | A record label could sue Vibe directly over music in a student's video, for $750 to $150,000 per song |
| 23 | Sign-ins last 400 days, and changing the password or deleting the account doesn't ask for the current password | Sign-in | Low | Confirmed | Someone using a student's still-signed-in laptop could change the password or delete the account |
| 24 | Uploads aren't checked for file type | Links | Low | Confirmed | Someone could host a fake sign-in page behind a Vibe link, and browsers could start flagging the Vibe name as unsafe |
| 25 | No automatic alerts for outdated software or for secrets pasted into the public code | Code upkeep | Low | Confirmed | A secret accidentally published with the code, or a known flaw in outside software, could sit unnoticed for months |
| 26 | The internal product journal is public on the site and in the public code (found twice) | Internal notes | Low | Confirmed | Anyone could read the founders' names, roles, launch plans and the history of past security gaps |
| 27 | Public pages promise every report is "acted on within 24 hours" | Safety promises | Low | Confirmed | If one report waits longer than a day, a harmed student could hold that promise against Vibe in court |
| 28 | The age check is one checkbox, the documents disagree on the minimum age, and a minor who is found is banned for good | Age | Low | Confirmed | A 17-year-old could join by ticking one box, and our Terms might not hold up against them |
| 29 | The leaked-password check is off | Sign-in | Low | Not re-checked | Someone could get into a student's account with a password already leaked from another site |
| 30 | Live-site secrets sit on a founder laptop, and some can't be swapped out quickly | Founder laptop | Low | Not re-checked | If that laptop were stolen or infected, someone could read and change all of Vibe's data and send email as Vibe |
| 31 | The resume viewer loads its PDF reader from an outside site with no tamper check | Outside software | Low | Not re-checked | If that outside site were hacked, the attacker could take over the account of anyone who opens a resume |
| 32 | Vibe's web framework version has a critical published flaw in a feature Vibe doesn't use yet | Outside software | Low | Not re-checked | If share-preview images are added before upgrading, someone could run their own code on Vibe's servers and reach every secret |
| 33 | A design tool ships with the live app and pulls in 304 extra outside packages | Outside software | Low | Not re-checked | A hijacked package Vibe doesn't even need could steal the master database password during a build |
| 34 | No unsubscribe setup for email | Email | Low | Not re-checked | A launch email sent without an unsubscribe link could cost up to about $53,000 per email in fines |
| 35 | Suspended club officers are stopped by a single check that lets them through if it errors | Club officers | Low | Not re-checked | A suspended officer could, in rare conditions, keep adding, removing or promoting club members |
| 36 | An old-style password-reset link swaps you into whatever account the link belongs to | Sign-in | Low | Not re-checked | Someone could trick a student into using the attacker's account, so what the student adds lands with the attacker |
| 37 | Sign-up reveals whether an email already has an account | Sign-up | Low | Not re-checked | Someone could check whether a specific person uses Vibe, then target them with fake emails |
| 38 | Any signed-in user can list the admin accounts | Admin accounts | Low | Not re-checked | Anyone signed in could see exactly who the admins are and aim phishing at them |
| 39 | Calendar export doesn't clean club event text | Calendar | Low | Not re-checked | A club could slip a fake reminder or link into a student's personal calendar that looks like it came from Vibe |
| 40 | A copy of your profile stays saved in the browser if you leave without signing out | Shared computers | Low | Not re-checked | The next person on a shared computer could see the previous student's profile details |
| 41 | Uploaded resumes go through image tools with default limits | Resumes | Low | Not re-checked | Someone could upload malformed resumes that crash the viewer and add to the hosting bill |
| 42 | Some error messages show raw database details | Whole site | Low | Not re-checked | Someone probing Vibe could learn internal names that make an attack easier to plan |
| 43 | Some buttons build code from stored text, safe today only because of limits on that text | Posts and messages | Low | Not re-checked | One careless future edit could let someone booby-trap posts and messages the way #1 does |
| 44 | Crash reports keep some search terms and email addresses | Crash reports | Info | Not re-checked | Some students' searches and email addresses could end up with our crash-reporting service, against what our app-store privacy forms say |
| 45 | The upload size limit is built in but not yet proven on the live storage | Running costs | Info | Needs a test on a copy | If the limit doesn't hold, someone could upload files of any size and run up the storage bill |
| 46 | A few spots on the profile page would run page code if a future edit fed them outside text | Profiles | Info | Not re-checked | Nobody could use these today, but a later edit could hand someone a new way to booby-trap profiles |

Rows marked "found twice" or "found three times" were reported separately by different reviewers and are merged here. "Not re-checked" means a Low or Info item the second reviewer did not examine. Six more entries recorded things checked and found working; they are credited above instead of listed.

### Top things to do now

1. **Upgrade the resume viewer's PDF reader, and make chat reactions accept only the approved emoji in the database as well as the app.** Gone: a resume or a chat reaction that takes over the account of whoever opens it.
2. **Make the database refuse post and media changes the app itself would refuse, and check who owns a video before deleting its file.** Gone: students erasing each other's videos, tracking viewers with outside images, and one account filling the database.
3. **Add a browser rule listing which code may run on Vibe's pages, and hide the sign-in cookie from page code.** Gone: the next slip like #1 or #2 turning into an account takeover.
4. **Add an "intimate image shared without consent" report and email path, make a moderator's removal delete the actual file, and register a copyright agent ($6).** Gone: a harmed student with no way to get an image down, and the federal fines and lawsuits that follow.
5. **Turn on a "prove you're human" check at sign-up, the leaked-password check, and two-step sign-in for the three admin accounts.** Gone: a script stalling sign-ups on demo day, and one phished founder password handing someone moderator powers.
6. **Re-run the two review areas whose results were blocked.** Gone: not knowing whether one student can read or change another student's messages, club roles or data.

---

## Authentication & Session Security

Five gaps were found in how people sign up, prove they are students, sign in, stay signed in and reset their passwords. The most important one is that the students-only promise is checked when someone posts, not when they read. Anyone with any email address can make an account and see student profiles and posts. The other four are about making accounts harder to steal and keeping sign-up working when someone is trying to jam it.

### [Medium] Non-students can read every student's profile and every post — happening today (confirmed)

**In plain terms:** Anyone can make a Vibe account with a personal Gmail, skip the student check, and still read student profiles and posts. That includes each student's name, school, major, year, the location they typed on their profile, their work history and when they were last online, plus every post and comment. The student check only stops them from posting. A recruiter, a scraper or someone following a particular student could browse Vibe almost like a real student, which breaks the students-only promise that the product and the privacy policy make. This may have been a deliberate "check before posting" choice, but it should be decided on purpose, not by accident.

**What it is:** Signup accepts any email address. Only 1 of 20 production accounts signed up with a school address. The @iu.edu / @purdue.edu requirement is enforced only through `can_publish_now()`, which requires `users.school_verified`. That function appears only in INSERT/UPDATE RLS policies (row-level security: the database rules that decide which rows each signed-in person may read or change). The read policies `users_select_authenticated`, `posts_select_authenticated` and `post_comments_select_authenticated` require only the `authenticated` role plus `user_visible()`, which is true for any user who is not restricted. The `school_verified` filters in the search routes (the app's own server addresses) run in app code only. They do not limit reads that go directly to the database.

**How an attacker uses it:** An outsider signs up with a personal email, confirms it, and never verifies a school address. They then query `users`, `posts` and `post_comments` directly through the Supabase REST API (the public web address that answers database requests for any signed-in account), which skips the app's filtered search.

**Impact:** For every non-restricted student, non-students can read name, handle, school/campus, major, year, `location_text`, `work_experience` and `last_active_at` (a signal of when someone is online), plus every published post and comment. The `authenticated` column grant (the database's per-column read permission) also exposes `campus_id` and `is_platform_admin`.

**What to do:** Decide explicitly. If reading should also require verification, add a SECURITY DEFINER helper such as `is_verified_viewer()` that returns the caller's `users.school_verified`, and AND it into the SELECT policies on `users`, `posts`, `post_comments`, `events` and the org tables. At minimum, column grants apply to a whole role and cannot vary by viewer. So revoke `authenticated` SELECT on `last_active_at` and `location_text`, and serve those two columns through a function that checks the viewer is verified.

**Where:** `pg_policies`: `users_select_authenticated` (`id = auth.uid() OR user_visible(id)`), `posts_select_authenticated` (`user_visible(user_id)`), `post_comments_select_authenticated`. `can_publish_now()` appears in write policies only. App-layer-only filters: `src/app/api/search/route.ts:205`, `src/app/api/users/search/route.ts:109`.

### [Medium] The three admin accounts are protected by a password alone — present today (confirmed)

**In plain terms:** Anyone who guessed or phished the password of one of the three admin accounts could ban or suspend any student, delete or restore posts, read every report, and look up which account belongs to any email address. These accounts ask only for a password, with no second step like a code from a phone app. Any signed-in user can also see which accounts are the admins. Vibe's login service can warn when a password has already leaked in another company's data breach, and that check is switched off. One reused password would put every student's safety and privacy in a stranger's hands.

**What it is:** Three users have `is_platform_admin`, and `auth.mfa_factors` has 0 rows. No code checks for AAL2 (Supabase's "authenticator assurance level 2", meaning the second factor was used during this sign-in). The `authenticated` role can SELECT `users.is_platform_admin`, so admin accounts are easy to list. The Supabase security advisor reports `auth_leaked_password_protection` as a WARN, meaning the HIBP breached-password check is off. There is no CAPTCHA, and GoTrue has no account lockout, only per-IP rate limits. Recon found the founders' contact emails in the publicly served product journal. `requirePlatformAdmin` checks only the `is_platform_admin` flag.

**How an attacker uses it:** The attacker lists the accounts where `is_platform_admin = true`, works out likely login addresses from public material, and then tries reused passwords (rotating IPs to stay under the per-IP limits) or phishes those accounts. With no second factor, one correct password gives full moderator powers.

**Impact:** Whoever holds an admin sign-in can ban or suspend any student, remove or restore content, and read reports. They can also use the admin lookup, which resolves any login email or school email to an account. That means moderation abuse across the whole platform and exposure of personal details for every user.

**What to do:** Enroll TOTP MFA (an authenticator-app code) for all three admins. Require `aal2` in `requirePlatformAdmin` and `requirePlatformAdminPage` via `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`. Revoke `authenticated` SELECT on `users.is_platform_admin` and let each viewer read the flag only about themselves, through a function. Turn on leaked-password protection in the Supabase Auth settings. Add CAPTCHA (see the sign-up finding below).

**Where:** `src/lib/auth/require-platform-admin.ts:51-72` (flag check only). `src/app/api/admin/users/route.ts:79-80` (lookup by email / `school_email`). `auth.mfa_factors`. `has_column_privilege(authenticated, users.is_platform_admin, SELECT) = true`. Supabase Auth settings.

### [Medium] Someone can claim a student's account before the student joins — confirmed in Vibe's code; one Supabase behaviour still needs a quick test

**In plain terms:** Someone could sign up with a student's email address before that student joins Vibe, choose the password, and leave the account unconfirmed. Later the real student signs up and clicks the confirmation link in their own inbox. The account then goes live with the password the other person chose, so both of them can sign in, and the student is never told. From then on the other person could read the student's private messages, see their resume and act as them in clubs, until the student happens to reset their password. It takes planning and a specific target, but the result is a full takeover.

**What it is:** Signup is open to any email, and email confirmation is on (recent accounts have `confirmation_sent_at`, and 1 unconfirmed auth user exists). As currently understood, when GoTrue gets a second `signUp` for an address that is still unconfirmed, it does not replace the stored password. It only resends the confirmation email, so confirming the account keeps the first password. The app has no step that makes the confirming user set or re-prove a password. `/auth/confirm` calls `verifyOtp` and sends the user straight to `POST_EMAIL_CONFIRM_PATH` (school-email verification), so the owner is unlikely to notice.

**How an attacker uses it:**
1. The attacker calls `signUp` with an address the target is likely to use, sets a password, and leaves the account unconfirmed.
2. The target signs up later. `src/app/auth/signup/page.tsx` shows the normal "check your email" pending state.
3. The target confirms from their own inbox.
4. The attacker signs in with the step-1 password and watches as the target fills in their profile, messages and resume.

**Impact:** Full takeover of the victim's Vibe account, including DMs, resume, school verification and org roles, until the victim resets their password.

**What to do:** First, confirm GoTrue's behaviour on a staging project using addresses you own. Then add at least one of these fixes:
- Run a scheduled job that deletes unconfirmed auth users after 24 hours. This also helps with the next finding.
- Make `/auth/confirm` require setting a password for accounts created by `signUp`.
- On first confirmation, call `signOut({ scope: 'others' })` and force a password reset.
- Move to passwordless-first signup (email code or magic link, with a password set afterwards).

**Where:** `src/app/auth/signup/page.tsx:208-275` (direct `signUp`; an existing unconfirmed address returns the normal pending state). `src/app/auth/confirm/page.tsx:178-215` (`verifyOtp`, then straight to `POST_EMAIL_CONFIRM_PATH`, with no password step). `auth.users` (confirmations on, 1 unconfirmed).

### [Medium] One person can stop everyone from signing up — present today (confirmed)

**In plain terms:** One person running a simple script could stop every real student from signing up for as long as they keep it running. Vibe can send only 30 sign-up emails an hour across the whole site, and there is no "I'm not a robot" check. A flood of fake sign-ups uses up the hour's emails, so real students get an error and never receive their confirmation email. This would hurt most at a club demo day or a sign-up table, when a crowd is trying to join at once and first impressions decide whether they come back. Even with no attacker, 30 an hour may be too few for a busy table. The flood would also send Vibe emails to strangers' inboxes, which can get Vibe's email sender marked as spam or suspended, and every fake sign-up leaves a junk account behind.

**What it is:** `signUp` and resend-confirmation go straight from the browser to GoTrue with no CAPTCHA. Searching `src` for `captcha` or `turnstile` finds nothing. The project-wide email cap is `rate_limit_email_sent = 30/h` (from the Sept 14 onboarding map), and the signup page already handles `over_email_send_rate_limit` and the project-wide cap. GoTrue's per-IP signup limit (default 30 per 5 minutes) is far above that shared hourly budget, so a single client can use it all up.

**How an attacker uses it:** An automated client repeatedly calls `auth.signUp` (and `resend`) with throwaway or other people's addresses. Each call sends a confirmation email and counts against the shared hourly budget. During that hour, real signups get "email rate limit exceeded" and no email.

**Impact:**
- Onboarding stops for as long as the abuse continues.
- Confirmation emails go to arbitrary inboxes from Vibe's sending domain, which puts the Resend account's reputation at risk and could get it suspended.
- `public.handle_new_user()` inserts a `public.users` row on every `auth.users` insert, before confirmation, so junk rows pile up.

**What to do:**
- Enable Supabase Auth CAPTCHA with Cloudflare Turnstile, and pass `options.captchaToken` on `signUp`, `resend` and `signInWithPassword`. The token is the one-time "this is a human" code the Turnstile widget produces. Once CAPTCHA is on, Supabase checks for it on its protected auth calls, so audit every auth call the app makes (including the password-reset request) so none of them break.
- Raise the project email cap to fit launch volume.
- Add a cleanup job for unconfirmed accounts older than 24–48 hours. The same job helps with the previous finding.

**Where:** `src/app/auth/signup/page.tsx:208` (`supabase.auth.signUp`, no `captchaToken`) and `:223-240` (rate-limit handling). `src/components/auth/ResendConfirmation.tsx:115`. `handoffs/2026-09-14-onboarding-map.md:34`. `public.handle_new_user()`.

### [Low] A brief break-in can become permanent loss of the account — present today (confirmed)

**In plain terms:** Suppose someone briefly gets a student's signed-in state, for example through a bug that lets outside code run on a Vibe page, or a few minutes at the student's unlocked laptop. Today they could stay signed in as that student for more than a year and change the password without knowing the old one, which locks the student out. They could also delete the account for good, because the only confirmation asked is typing the student's username, which anyone can see. None of this lets someone in by itself. It decides how bad a separate break-in gets, and right now a short one can become permanent.

**What it is:**
- `@supabase/ssr` 0.6.1 is used with its default cookie options. There is no `cookieOptions` override in `src/lib/supabase/server.ts`, the browser client, or `src/lib/supabase/middleware.ts` (the helper that refreshes the sign-in on each request).
- The package default is `{ httpOnly: false, sameSite: "lax", maxAge: 400 days }`. So the auth cookie, which holds the access token and the refresh token (the long-lived credential that keeps minting new sign-ins), can be read by page JavaScript through `document.cookie` and lasts 400 days.
- No response carries a Content-Security-Policy (a browser rule listing which code may run on Vibe's pages). The comment in `next.config.ts` `headers()` (instructions the server sends with every response) says there is "no CSP yet" because the static prototypes under `/html` rely on inline scripts, so a strict policy would first need a nonce rollout.
- `/auth/update-password` calls `supabase.auth.updateUser({ password })` using either a recovery link's session or "the session this browser already has". It never asks for the current password. It only handles `reauthentication_needed` if the server happens to demand it.
- `DELETE /api/me` requires only `confirm_handle` to match the user's public handle.

**How an attacker uses it:**
1. Any XSS (cross-site scripting: someone else's code running inside a Vibe page) reads `document.cookie`. With no CSP to block inline script or requests to other sites, it sends the refresh token out.
2. The attacker mints fresh sessions for up to 400 days.
3. The attacker either sets a new password through `updateUser`, which needs no old password, or calls `DELETE /api/me` with the public handle.

Brief physical access to a signed-in device gets the same result, without the script.

**Impact:** A one-time, short-lived compromise becomes a lasting takeover. Deletion also purges the account's uploads, so it is permanent data loss. It is rated Low because it depends on a separate first bug or on physical access.

**What to do:**
- Require the current password (checked server-side) or Supabase `reauthenticate()` plus its nonce before any password change that does not come from a recovery link, and before `DELETE /api/me`.
- On password change, call `signOut({ scope: 'others' })` so other sign-ins are revoked.
- Roll out a nonce-based CSP, starting in report-only mode, after moving or excluding the `/html` prototypes that need inline scripts.
- Shorten the cookie `maxAge` through `cookieOptions`, and set a Supabase session time-box or inactivity timeout. Do not simply set `httpOnly: true`: the browser Supabase client reads this cookie, so that setting would break sign-in on the client.

**Where:** `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts` and the browser client (no `cookieOptions`). `node_modules/@supabase/ssr/dist/main/utils/constants.js` (`DEFAULT_COOKIE_OPTIONS`). `next.config.ts` `headers()` (lines 46-52). `src/app/auth/update-password/page.tsx:380`. `src/app/api/me/route.ts` `DELETE` (handle-only check, about lines 58-98).

---

## Authorization & Data Isolation

This section is about who can see and change what on Vibe. Can one student read another student's messages or edit their posts? Can a regular club member make themselves an admin? Does a hidden club really stay out of sight for people outside it? The check for all of this ran to the end, but its written results were lost before they reached this report. So this area has no answer yet: it has neither passed nor failed.

### [INFO] The "who can see what" check ran, but its results were lost — not answered yet, needs a second look

**In plain terms:** We still don't know whether one student can see or change another student's private things on Vibe. That includes their messages, their posts, the follower list of a club they don't run, and a club that is supposed to be hidden. The check for exactly this finished, but its results were cut off before they reached this report, so an empty section here means "not answered," not "all clear." A mistake in this area would show one student's private information to someone who should never see it. A new app rarely gets a second chance with students after that.

**What it is:** This is a gap in what the review covered, not a confirmed flaw. The lens covered authorization, IDOR (insecure direct object reference: changing an id in a request to reach someone else's record) and RLS (row-level security: database rules that decide which rows each signed-in user may read or write). It finished its read-only pass. It read the API routes (the server addresses the app calls) under `src/app/api/me/**`, `src/app/api/orgs/**`, `src/app/api/admin/**`, `src/app/api/posts/**` and `src/app/api/users/**`. It also pulled the live RLS policies (the individual row rules, from `pg_policies`), column grants (database permissions on individual columns), triggers and helper functions over read-only SQL. Its written findings were stopped before delivery, so none of them reached this report. The status is `unverified_low` because nothing arrived to verify. It does not mean anything was checked and found sound.

**How an attacker uses it:** Not provided, because no attack path was delivered. For whoever picks this up, the open questions are the ones the lens was scoped to answer:
- Can user A read or change user B's rows by swapping a thread, message, post, org, channel or event id in a request?
- Can an org member or mod raise their own role to admin or owner?
- Does any route that uses the service role (the admin database login that skips the row rules) act on data without first re-checking that the caller is allowed?
- Does a hidden club (`orgs.hidden_at` set) leak to non-members through its page, its follow or followers routes, or search?

**Impact:** Unknown. This lens's findings are missing from the report, so the authorization and RLS surface still needs review. Until that happens, treat the Session 51 policies and column grants as unconfirmed.

**What to do:** Have the owner review this lens directly, or re-run it on its own with `.claude/workflows/security-sentinel.js` so its output reaches the report this time. Match each authorization rule the routes enforce (blocks, paid features, club roles, club verification, hidden clubs) against the RLS policy and column grant that should back it. The database should enforce everything the route enforces. The specific rules to confirm:
1. Only a club's owner or admins can list or remove its followers (`src/app/api/orgs/[slug]/followers/**`).
2. A hidden club returns 404 (a "not found" response) to non-members on its page and follow routes, and does not appear in search. Org lookups for non-members use the service client (the server's service-role database connection), so each of those routes must re-check `hidden_at` and membership itself.
3. Only owners and admins can send invites. Check both the `org_invites` insert policy and `src/app/api/orgs/[slug]/invites/**`.
4. A student can update only the text, tags and draft status of their own posts. Confirm that the `posts` column UPDATE grants from migration (a dated database change file) `20260916130000_post_edited_at.sql` still hold in the live database.
5. Confirm the policies and grants hold on `users`, `orgs`, `org_members`, `org_followers`, `org_invites`, `channels`, `channel_members`, `messages` and `posts`, including that private `users` columns can only be reached through the service role.

**Where:** `src/app/api/me/**`, `src/app/api/orgs/**` (especially `[slug]/followers`, `[slug]/follow`, `[slug]/invites`, `[slug]/members`), `src/app/api/admin/**`, `src/app/api/posts/**`, `src/app/api/users/**`; live `pg_policies` and column grants on the nine tables above; `supabase/migrations/20260916130000_post_edited_at.sql`.

---

## Injection, XSS & Input Handling

This section asks one question: can something a student types, uploads or sends into Vibe be turned against other students? The heading's "injection" and "XSS" (cross-site scripting) are two names for that worry: the app treats something a student sent as instructions, or trusts it as safe, when it should treat it as plain words or files. Two problems passed verification. Both are High and both are confirmed in the code today. They share one cause: Vibe's server checks the right things, but a signed-in student can also write to the database directly, around those checks, and the database doesn't repeat them.

### [High] A booby-trapped emoji reaction lets an attacker use the account of anyone who opens the chat — confirmed in the code today

**In plain terms:** Any student in a group chat, club chat or direct message could hide a trap inside an emoji reaction. Anyone else who then opens that chat, on the desktop messages page or in the small chat window on the profile page, would have their account quietly used by the attacker: their private messages read, messages sent in their name, their profile changed. The victim sees nothing unusual, and at Vibe's current size one busy chat could reach every active user, founders included. Private messages are the thing students most need to trust Vibe with, and this reaches them directly.

**What it is:** This is stored XSS: code an attacker writes is saved in the database and later runs inside other people's browsers.
- The reaction route (the server address that records a reaction), `POST /api/me/threads/[id]/messages/[messageId]/react`, only accepts emoji from the fixed `ALLOWED_EMOJIS` set.
- The database does not repeat that check. The `authenticated` role holds an INSERT grant (a database permission given to every logged-in account) on `public.message_reactions`, including the `emoji` column.
- The RLS policy `message_reactions_insert_member` (row-level security: the database's per-row permission rule) checks only that the writer is a member of the channel.
- The only limit on the stored value is `CHECK (length(emoji) BETWEEN 1 AND 16)`.
- `GET /api/me/threads/[id]/messages` groups the stored reactions and returns `emoji` unfiltered.

Both static renderers then place `r.emoji` into innerHTML (the browser feature that turns a string into live page elements) in two spots:
1. As raw content: `<span class="dm-rx-emo">${r.emoji}</span>` in `messages.html`, and `<span>${r.emoji}</span>` in `_miniMessenger.js`.
2. Inside a single-quoted JavaScript string in an inline `onclick` attribute. This spot goes through `__dmEsc` / `esc`, the helpers that escape text (turn special characters like `<` and `'` into harmless text). That doesn't protect it, because the browser decodes those encoded characters back into real quotes before the click handler runs.

The 16-character cap limits a single stored value, but it is not a defense. The table's primary key (its uniqueness rule) is `(message_id, user_id, emoji)`, so one user can store many different values on the same message. The real boundary here is the grant, and it is wider than the route's check. This is the highest-risk rendering spot in this section, because one person's content is shown to everyone else in the chat.

**How an attacker uses it:** The attacker is any member of a DM, a group chat or a visible club channel.
1. They skip the reaction route and write a reaction row straight through PostgREST (the Supabase database's built-in web interface, which the browser can call without going through Vibe's server). They use the anon key (the public access code shipped to every browser) and their own login session: `POST /rest/v1/message_reactions` with `{message_id, user_id: <own uid>, emoji: <markup, up to 16 chars>}`. `message_reactions_insert_member` accepts the row because they are a channel member.
2. Every other member who opens that thread gets the stored value rendered as live markup inside their own signed-in session. That covers desktop `/messages`, which embeds `/html/messages.html`, and the mini messenger on `/profile`. The raw-content spot fires as soon as the thread renders, with no click needed. The `onclick` spot fires when the victim taps the reaction chip.

**Impact:**
- The attacker's script runs on the www.connectvibe.app site inside each victim's signed-in session.
- The site sends no Content-Security-Policy (a browser rule listing which code is allowed to run on your pages), so nothing blocks the script.
- The script can call Vibe's own server addresses (the `/api` routes) as the victim. It can read their DMs and threads, send messages as them, change profile details, and follow or unfollow.
- One group chat or club channel reaches every member at once. At the current scale (20 users, 57 messages), that is the whole active user base, founders included.

**What to do:** Close it at every layer.
1. **Database.** Either replace `message_reactions_emoji_check` with a CHECK that `emoji` is one of the `ALLOWED_EMOJIS` values, or revoke INSERT/UPDATE on `message_reactions` from `authenticated` and write reactions only through the route, using the service role (the server's all-access database login).
2. **Read route.** Drop any grouped reaction whose `emoji` is not in `ALLOWED_EMOJIS` before returning it.
3. **Rendering.** Pass `r.emoji` through `__dmEsc` / `esc` for the displayed text. Stop building inline `onclick` strings from data. Put the message id and emoji in `data-` attributes and handle clicks with one listener on the parent element. The action-bar buttons in `_miniMessenger.js` build `onclick` strings the same way. Their emoji come from a fixed list today, but move them to the same pattern.
4. **Follow-up.** Add a Content-Security-Policy as a second line of defense. A strict one requires first moving the static prototypes' many inline handlers, so it adds to steps 1–3 and does not replace them.

**Where:**
- `public/html/messages.html:1377-1381` (`chipsFor`).
- `public/html/_miniMessenger.js:756` (reaction chips).
- `GET /api/me/threads/[id]/messages`.
- `src/app/api/me/threads/[id]/messages/[messageId]/react/route.ts:5,44` (`ALLOWED_EMOJIS`, the check that exists only in the route).
- The migration file (a saved database change script) `supabase/migrations/20260508150000_message_reactions_and_replies.sql`: lines 20-22 hold the length-only CHECK and the primary key, and line 44 onward holds `message_reactions_insert_member`.
- Live grants on `public.message_reactions` for `authenticated`.

### [High] Any student can permanently erase other students' and clubs' videos — confirmed in the code today

**In plain terms:** Any student with a verified school email could permanently delete other students' and clubs' videos from Vibe. A short automated program could do it to every public video at once, leaving broken posts behind and nothing that points to who did it. The same gap lets someone re-post another student's video as their own, make a hidden club's video public, or erase photos another member shared in a group chat. Only two videos exist today, so the loss right now is small, but every video posted from here on is exposed, and a student whose work vanishes has little reason to post again.

**What it is:** The check that a post's media is the author's own upload (`isOwnedMediaRef`) exists only in `/api/me/publish-post`. The database doesn't enforce it.
- `authenticated` holds INSERT on `posts.media_url` and `posts.media_thumbnail_url`.
- The policy `posts_insert_authenticated` checks only `auth.uid() = user_id`, `has_recorded_consent()` and `can_publish_now()`.
- No CHECK constraint or trigger looks at `media_url`.

So a student can insert a post directly through PostgREST with `media_url` set to any R2 storage path. R2 is the Cloudflare file storage that holds the videos, and each file's path is its R2 object key. Two server routes then trust the stored path:
1. `DELETE /api/posts/[id]` sends an R2 `DeleteObjectCommand` for any stored `media_url` that starts with `clips/`. It never checks that the path is under `clips/<caller>/`, and it has no `rateLimit`.
2. `GET /api/posts/[id]/media` signs any `clips/` or `orgs/` path for a published post and 307-redirects to it. Signing creates a temporary download link, and a 307 redirect sends the browser on to that link. The route requires no login. It runs the hidden-club check (`orgContentAccess`) only when `posts.org_id` is set, and a directly inserted personal post always has `org_id = null`.

Victims' paths are easy to collect: `authenticated` can SELECT `posts.media_url`, so PostgREST returns the raw path of every visible published post.

Two related gaps have the same root cause:
- `messages.media_url` is not tied to the message's own `channel_id`. Account deletion (`purgeUserUploads`) deletes every `messages.media_url` that matches `messages/<any-channel>/<file>`.
- `normalizeOrgAssetInput` accepts any `orgs/...` path rather than only `orgs/<this org>/`, and officers can UPDATE `orgs.logo_url` / `orgs.banner_url` directly.

**How an attacker uses it:** The attacker is any school-verified student who accepted the Terms and isn't restricted.
1. **Collect victim paths.** Send `GET https://<project>.supabase.co/rest/v1/posts?select=id,user_id,media_url&media_url=like.clips/*` with the request headers (labels attached to the request) `apikey: <anon key>` and `Authorization: Bearer <own JWT>`. The JWT is the signed login pass the browser holds. The response lists the raw storage path of every visible published video post.
2. **Point a new post at each victim's file.** Send `POST /rest/v1/posts` with `{"user_id":"<own uid>","type":"post","status":"draft","content":"x","media_url":"clips/<victim uid>/<uuid>.mp4"}` and `Prefer: return=representation`. The policy passes because it checks only `user_id`. As a draft, the row is invisible to everyone else.
3. **Delete the post.** Send `DELETE https://www.connectvibe.app/api/posts/<new post id>` with the attacker's own session cookie. The route confirms the attacker owns the row, deletes it, then sends DeleteObject for the victim's `clips/<victim>/<uuid>.mp4`. Neither the direct insert nor the DELETE route is rate-limited, so a short script can cover every public video.

Two variants use the same gap:
- **Variant A (theft / re-hosting).** Insert with `"status":"published"` and skip step 3. `/api/posts/<id>/media`, which needs no login, now serves the victim's video as the attacker's own post. It can do the same for a hidden club's `orgs/<hidden-org>/posts/...` media the attacker learned while a member, and the hidden-club check never runs.
- **Variant B (chat media).** In a group chat, read other members' raw `messages.media_url` paths through PostgREST. Insert a message into your own DM whose `media_url` is another member's `messages/<channel>/<file>`, then call `DELETE /api/me`. `purgeUserUploads` deletes that file too.

**Impact:**
- Other students' and clubs' video files are destroyed for good across the whole platform. R2 has no versioning here, and the database rows stay behind as broken posts.
- Victims can't tell who did it, because the attacker's draft row is already gone.
- Someone else's video can be re-published as the attacker's own post.
- A hidden club's media can be re-exposed publicly after the attacker leaves the club.
- Photos and files shared in group chats can be erased the same way.
- Prod holds 2 `clips/` files today (1 published), so the current loss is small, but every future video post is exposed.

**What to do:** Enforce ownership in the database, not only in the route. Pick one of these:
- **Option (a).** Revoke INSERT on `posts.media_url` and `posts.media_thumbnail_url` from `authenticated`. Have `publish-post` / `publish-clip` write those columns with the service role after validation.
- **Option (b).** Add a BEFORE INSERT trigger or CHECK that allows only NULL, an https URL on your own Supabase host, or a value starting with `'clips/' || user_id || '/'` that contains no `..`.

Before adding the rule, check existing rows and how club posts are written. Club posts store `orgs/<org>/...` paths, so either the rule must allow those or club posts must go through the service role. Add it as `NOT VALID` first if old rows don't match.

Then add defense in depth in code:
- **`DELETE /api/posts/[id]`:** delete from R2 only when ``key.startsWith(`clips/${user.id}/`)``, and add a `rateLimit`.
- **`GET /api/posts/[id]/media`:** sign a `clips/` path only if it is under `clips/<row.user_id>/`. Sign an `orgs/` path only if `row.org_id` is set and the path is under `orgs/<row.org_id>/`.
- **Club images:** scope `normalizeOrgAssetInput` to `orgs/<org.id>/`, and add the same constraint on `orgs.logo_url` / `orgs.banner_url`.
- **Chat media:** add `CHECK (media_url IS NULL OR media_url LIKE 'messages/' || channel_id || '/%')` on `messages`.
- **Recovery:** consider turning on R2 object versioning or a soft-delete window so a mass delete can be undone.

**Where:**
- `supabase/migrations/20260916130000_post_edited_at.sql:307-309`: the INSERT grant on `posts` columns, including `media_url` and `media_thumbnail_url`.
- Policy `posts_insert_authenticated`.
- `src/app/api/me/publish-post/route.ts:46-57, 117-148`: `isOwnedMediaRef`, the only ownership check.
- `src/app/api/posts/[id]/route.ts:361-376`: DELETE sends `DeleteObjectCommand` with no owner-prefix check and no `rateLimit`.
- `src/app/api/posts/[id]/media/route.ts:73-81, 108-118`: the hidden-club check runs only when `org_id` is set, and any `orgs/` or `clips/` path gets signed. A live request with no login, for a random post id, came back 404 (not found) rather than 401 (not signed in). That confirms there is no login gate.
- `src/lib/profile/storage-purge.ts:161-212`: `MESSAGE_MEDIA_KEY_RE` accepts any channel.
- Policy `messages_insert_member`, which does not constrain `media_url`.
- `src/lib/org-asset-url.ts:66-77`: `normalizeOrgAssetInput`.
- `authenticated` UPDATE on `orgs.logo_url` / `orgs.banner_url`.

---

## Data Privacy & Exposure

This section covers who can see what about a student on Vibe: their email, their résumé, their profile, who viewed that profile, what their notifications say, and whether a stranger can work out who has an account. The automated check for this area ran and found real problems. Its write-up was blocked before it reached this report. So this area is **not reviewed yet**. It is not clean, and nobody should read the empty space below as good news.

### [Info] Privacy check results are missing and need a re-run: not yet reviewed

**In plain terms:** We don't yet know where Vibe might be showing a student's private details to the wrong people, such as their email, their résumé, or who looked at their profile. The check that looks for this did find problems, but its results were lost before they reached this report. Until someone re-runs it or goes through these pages by hand, treat every student's personal information as unchecked. That matters before any club or student is invited in, because one leaked résumé or email is the kind of thing that ends trust in a new app on a campus.

**What it is:** The data exposure and enumeration lens of the security sentinel finished and produced findings. Enumeration means a stranger working out which handles, emails or user IDs exist by trying them one at a time. A safety classifier stopped the lens's findings report before it was delivered, so none of its findings are in this run. The finding is filed as Info only because no specific issue can be stated. That is not a sign the area is low risk. The lens's own run recorded that it found real issues, so the true severity of what is missing is unknown.

**How an attacker uses it:** No specific attack can be described, because the details were withheld. The risk is the gap itself. This lens covers the most likely way a college social app hurts students:
- personal details reaching an audience that shouldn't see them
- server addresses the app calls for data (API routes) that send back more than the screen shows
- link previews (the title, image and text shown when a Vibe link is pasted into iMessage or Instagram, built by `generateMetadata` / OpenGraph tags) that include private data
- database queries that select more columns than needed
- résumé files stored where anyone with the link can open them, with the hiding done only in the student's browser
- handle, email or user-ID enumeration
- profile-view and notification data leaking to other users

Every one of these is still unexamined in this report.

**Impact:** The final report has no results for data exposure. Anyone reading it, including the cofounders or a later reviewer, could wrongly conclude this area is clean. Any real exposure the lens found stays live and unfixed until it is re-surfaced.

**What to do:**
1. Re-run the data exposure lens of `.claude/workflows/security-sentinel.js` on its own, not as part of the full 11-lens run, and deliver its findings as a separate report. It stays read-only, with no live attacks on prod.
2. If the re-run is blocked again, review by hand. Work through the list below and write down pass or fail for each item.
3. Until one of these is done, mark this section "unreviewed" wherever the report is shared.

Manual review list:
- **User and org data routes:** in `src/app/api/users/**` and `src/app/api/orgs/[slug]/profile`, check what an anonymous visitor gets back compared with a signed-in stranger, a follower and a member. Confirm that no route running on the service role returns private `users` columns: email, school email, résumé path, or moderation state. The service role is the all-access database login that skips every per-user rule.
- **Link previews:** in `src/app/{profile,posts,orgs}/**/page.tsx`, check what each `generateMetadata` puts into the preview title, description and image for a private or hidden profile, a hidden test org, and a post from a private account.
- **Profile helpers:** in `src/lib/profile/**`, look for `select('*')` or wide column lists that feed client components (pieces of the page that run in the visitor's browser and can see everything they are given). Also look for redaction done in the browser rather than on the server.
- **Résumé storage:** confirm the `resumes` Storage bucket (the folder where uploaded résumé PDFs are kept) is private. Confirm its access rules (the database's per-user rules for who may read which rows or files) do not let a signed-in user list or read another user's files. Confirm the only way in is the `/api/resume` server path, and that it checks the viewer.
- **Enumeration:** test whether sign-up, handle lookup, magic-link sign-in, or profile URLs answer differently for a handle or email that exists and one that doesn't. That difference lets a stranger check whether a given person is on Vibe.
- **Profile views and notifications:** confirm that only the profile owner can read who viewed their profile. Confirm that notifications never carry another user's private details.
- **Database access rules:** run `get_advisors` (security) through the Supabase tools. Read the row-level access rules on every table the files above read from, and check each one for anonymous and cross-user reads.

**Where:** `src/app/api/users/**`, `src/app/api/orgs/[slug]/profile`, `src/app/{profile,posts,orgs}/**/page.tsx` (including `generateMetadata`), `src/lib/profile/**`, the `resumes` Storage bucket and its access rules, the `/api/resume` route, and the row-level access rules on the tables those files read. The lens itself lives in `/Users/franciscocazares/vibe/.claude/workflows/security-sentinel.js`.

---

## Abuse, Rate-Limiting & Cost / Monetary Risk

This section covers whether one person, acting alone and for free, can run up Vibe's bills, knock the app offline by flooding it, or damage other students' photos and videos. The normal buttons in the app are guarded. Uploads are limited by size and file type, the storage service itself enforces video sizes, and the app has its own speed limits. But there are three side doors. One lets a student erase other people's videos. One lets anyone fill the database until it stops taking new posts. One lets uploaded files pile up with no limit and no cleanup. For the most serious one, we checked and found no sign that anyone has ever used it.

### [High] Any verified student can permanently delete another student's video — confirmed in the code and live database today; no sign it has been used

**In plain terms:** Any student with a verified school account could permanently erase the video on any other student's post, and keep going until every video on Vibe is gone. The videos can't be recovered. The victim's post stays up with its video missing, and the same trick lets someone repost another student's video as their own. A creator who loses their work to a stranger has little reason to post on Vibe again.

**What it is:** `DELETE /api/posts/[id]` is the route (the server address the app calls) for deleting a post. It checks that the caller owns the post row. It then deletes whatever Cloudflare R2 object key (a file's storage name in R2, where videos live) sits in that row's `media_url`. The only checks on the key are that it starts with `clips/` and has no `..`. It never checks that the key is under `clips/<caller id>/`. The ownership check that would stop this is `isOwnedMediaRef`, and it runs only inside `/api/me/publish-post`.

The database, though, lets any signed-in student insert a `posts` row directly through PostgREST (Supabase's built-in web interface that talks straight to the database), with any `media_url` value. PostgREST is reachable with the anon key, the public access code already inside the app's JavaScript bundle (the code files sent to every browser). Migration `20260916130000` (a database change script) removed UPDATE on `media_url` for exactly this reason: its header names "point media_url at any object key" as the gap. But it left `media_url` in the INSERT grant (a database permission). Students can also SELECT other people's raw `media_url` values, so finding targets is trivial.

**How an attacker uses it:**
1. Sign in as any school-verified student. The project URL and anon key are already in the browser.
2. `GET https://<proj>.supabase.co/rest/v1/posts?select=id,user_id,media_url&media_url=like.clips/*`. The read policy `posts_select_authenticated` (a database rule deciding who may read which rows) returns every visible video post's raw key, e.g. `clips/<victim-uuid>/<uuid>.mp4`.
3. `POST /rest/v1/posts` with `{"user_id":"<me>","type":"post","status":"draft","media_url":"clips/<victim-uuid>/<uuid>.mp4"}`. The insert policy `posts_insert_authenticated` checks only `user_id = auth.uid()`, `has_recorded_consent()` and `can_publish_now()`. No trigger or CHECK constraint validates `media_url`. Using `status=draft` hides the row from everyone else.
4. `DELETE https://www.connectvibe.app/api/posts/<my-new-post-id>`. The route sees `row.user_id === me` and deletes the attacker's row. It then sends `DeleteObjectCommand` for `clips/<victim-uuid>/<uuid>.mp4` using the server's own R2 credentials.
5. Repeat for every key. It scripts across the whole platform, the attacker's account survives, and no rate limit is specific to this path.

**Impact:** Every video on the platform can be destroyed, one request at a time, and none of it can be undone. No R2 versioning is set up in code. The victim's post row survives, but its video is gone for good. The same insert also lets anyone republish another student's video as a post of their own.

**What to do:**
- **(a) Route fix, ship first.** In the DELETE route, delete from R2 only when `key.startsWith(\`clips/${user.id}/\`)` and the key matches a strict `^clips/<uuid>/<uuid>\.(mp4|mov|webm)$` pattern.
- **(b) Close the database hole.** Revoke INSERT on `posts.media_url` and `posts.media_thumbnail_url` from `authenticated`. Move publish-post's insert to the service-role client (the server's all-access database login), after `isOwnedMediaRef` has run. Alternatively, add a BEFORE INSERT trigger that rejects `media_url` unless it meets one of these:
  - it is NULL
  - it matches `^clips/<auth.uid()>/[0-9a-f-]{36}\.(mp4|mov|webm)$`
  - it is an https URL on the project's own storage host under `/profiles/<auth.uid()>/`
- **(c) Stop exposing raw keys.** Revoke SELECT on `posts.media_url` and `posts.media_thumbnail_url` from `authenticated`, and serve them only through the app's own serializers.

**Where:**
- `src/app/api/posts/[id]/route.ts`:
  - :340 reads `media_url` through the user client.
  - :350 checks only `row.user_id`.
  - :354 deletes the row.
  - :364 checks only the `clips/` prefix and no `..`.
  - :370 sends `DeleteObjectCommand({Key: key})`.
- `supabase/migrations/20260916130000_post_edited_at.sql`:
  - :307–309 is `grant insert (user_id, type, content, tags, media_url, media_thumbnail_url, status) on public.posts to authenticated`.
  - The header at :27–33 names the gap.
- Live checks:
  - `has_column_privilege('authenticated','public.posts','media_url','INSERT')` = true, and the same for `'SELECT'`.
  - Policy `posts_insert_authenticated`.
  - The triggers `posts_stamp_campus`, `posts_stamp_edited` and `bump_org_activity_on_post` don't touch `media_url`.
- `isOwnedMediaRef` lives only in `src/app/api/me/publish-post/route.ts:46–57`.
- Prod today has 0 posts whose `clips/` key belongs to another user.

### [Medium] One free account can fill the database until the whole app stops accepting posts — confirmed today

**In plain terms:** One person with a throwaway account, with no school email needed, could stuff Vibe's database with junk until it hits the size limit of our free hosting plan. At that point the database locks itself to read-only. Nobody on Vibe can post, message, RSVP or report anything until someone cleans it up by hand. The app's own speed limits don't help, because this goes around the app and talks to the database directly.

**What it is:**
- The limiter in `src/lib/rate-limit.ts` and the `MAX_*` length checks only run inside Next.js route handlers.
- The browser client uses the anon key, so any signed-in user can call the Supabase Data API directly. That is `/rest/v1/*`, the direct-to-database web interface. The handlers are skipped entirely, and the only limits left are RLS (the database's per-row access rules) and column grants.
- `authenticated` still holds INSERT on these tables. It has to, because routes write through the caller's own session client.
- Some tables need only an email-confirmed account. On `otto_reminders`, `personal_events`, `reminders` and `bookmark_collections`, the insert policies check only `auth.uid() = user_id`, with no `can_publish_now()` or `has_recorded_consent()` gate.
- `posts`, `messages`, `post_comments`, `events` and `channels` are also directly insertable, by any school-verified account.
- Prod has no CHECK constraint on the length of `otto_reminders.body`/`metadata` (jsonb), `personal_events.notes`/`location`, `reminders.message`, `bookmark_collections.name`, `posts.content`, `posts.tags`, `messages.content` or `events.description`.
- PostgREST accepts a JSON array body, so one request inserts many rows.
- The Supabase org is on the Free plan (`plan=free`, `tier=tier_free`). A Free project that crosses its database-size ceiling is forced read-only.

**How an attacker uses it:**
1. Register with a throwaway address and confirm it. No `.edu` is needed.
2. Copy the session token (the login pass the browser keeps) from the `sb-…-auth-token` cookie. The project URL and anon key are already in the bundle.
3. Loop `POST /rest/v1/otto_reminders`, or `reminders`, `bookmark_collections` or `personal_events`. Each request carries an array of many rows with very large `body`/`metadata` values. Send the token in the Authorization header (the part of a request that carries the login pass) with `apikey: <anon>`.
4. No handler runs, so no limiter or length cap applies. Table and index size grow until the ceiling is reached.

**Impact:**
- The database is 17 MB today and the Free-plan ceiling is 500 MB, so roughly 480 MB of junk takes the app down. Depending on how large a single request the hosting service accepts, that is likely minutes to an hour of scripted requests from an ordinary connection.
- Once over the ceiling, every write path fails for every user: posting, messaging, RSVPs and moderation.
- Short of that, the junk inflates storage and egress (download traffic), and pollutes the reminder and notification surfaces.
- It costs the attacker essentially nothing.

**What to do:**
- Add database-level CHECK constraints capping the length of every user-writable text and jsonb column, and the element count of `tags`. Cover at least `content`, `notes`, `location`, `message`, `body`, `metadata`, `name` and `description`, so the database enforces size no matter how a request arrives.
- Add a per-user row-count guard, as a trigger or a statement-level check, on the tables that have no publish gate: `otto_reminders`, `reminders`, `bookmark_collections` and `personal_events`.
- Set a Supabase usage alert, and consider moving off Free so a fill attempt degrades gracefully instead of flipping the project read-only.
- Stop relying on route-level limits for any table whose grant is exposed to the anon-key session client.

**Where:**
- `src/lib/rate-limit.ts` (callable only from route code).
- Policies `otto_reminders_insert_own`, `reminders_all_own`, `bookmark_collections_all_own` and `personal_events_insert_own`, each with `with_check = auth.uid() = user_id` and no publish gate.
- `pg_constraint` shows no length CHECK on the columns listed above.
- The management API's `get_organization` returns `plan=free`.

### [Medium] Uploaded videos and photos pile up with no cap and no cleanup — confirmed today

**In plain terms:** One signed-in account can keep uploading very large videos, up to about 24 GB an hour. Nothing ever deletes the ones that never get posted. Storage is billed every month, so a few days of this leaves Vibe paying a growing bill, indefinitely, for files no student ever sees. Even normal use slowly piles up, because every time a student changes a profile photo the old one is kept forever. On our free plan's photo storage, the same trick could use up the whole allowance in about an hour.

**What it is:**
- `/api/me/clip-upload-url` hands out a signed PUT URL (a short-lived upload link the server gives the browser) for up to 200 MB. It allows 20 per 10 minutes per user. The declared size is bound into the signature as Content-Length, so R2 does enforce the per-file cap. What's missing is any per-user total.
- The upload link is issued before any database row exists. If the client uploads and never calls publish, the object is orphaned.
- `/api/me/messages-upload-url` allows the same 200 MB per video, also 20 per 10 minutes.
- Post deletion cleans R2 only on a best-effort basis. The code comment says orphans are left for a lifecycle policy (a storage rule that auto-deletes old files), and that policy doesn't exist. Gate B in `BACKLOG_CLIPS.md` is still open.
- `/api/me/profile-upload` writes every avatar, banner and post image to the public `profiles` bucket (a storage folder). Each upload gets a fresh `randomUUID()` name with `upsert: false`, and the previous object is never deleted.
- Profile uploads are capped at 30 per 10 minutes, at 6–8 MB each.

**How an attacker uses it:**
- Script the clip upload route: request a URL, PUT 200 MB of junk, never publish, and repeat at the limit. That adds about 4 GB per 10 minutes, or about 24 GB an hour, per account.
- Do the same through chat attachments to roughly double it.
- Separately, hit `profile-upload` 30 times per 10 minutes with 8 MB post images. That adds about 1.4 GB an hour to the `profiles` bucket, which holds about 23 MB across 100 files today.

**Impact:**
- **R2 bill.** Sustained for a day, one account adds roughly 1.1 TB to R2. At Cloudflare's published rate of about $0.015 per GB per month, that is about $17 a month added for each day the attack runs. A week is roughly $120 a month, and the charge recurs until someone finds and deletes the files. Several accounts multiply it.
- **Supabase storage.** On Free, the `profiles` bucket would exhaust the plan's file-storage allowance (about 1 GB) in under an hour. After that, Supabase can restrict the project until it is cleaned up or upgraded.
- **Normal use.** Profile-photo churn leaks storage with no attacker at all.

**What to do:**
- **Track pending uploads.** Record each signed clip or message key in a `pending_uploads` table when it is issued. Run a scheduled sweep that deletes R2 objects still unreferenced after about 24 hours.
- **Add an R2 lifecycle rule** as a backstop, and close Gate B.
- **Cap total storage per user.** Sum declared bytes per user per day and refuse to sign past the cap. Consider a daily cap on top of the 10-minute window.
- **Clean up replaced profile files.** In `profile-upload`, delete the previous avatar or banner object after a successful replace, or switch to one fixed name per kind with `upsert: true`.
- **Billing alerts.** Turn on usage and billing alerts in both Cloudflare R2 and Supabase.

**Where:**
- `src/app/api/me/clip-upload-url/route.ts`: `MAX_BYTES` at :10, and `rateLimit` limit 20 / window 600.
- `src/app/api/me/messages-upload-url/route.ts`: :14–15 (15 MB image, 200 MB video) and :60–62 (limit 20 / 600 s).
- `src/app/api/me/profile-upload/route.ts`: :32–39 (size caps), :86 (limit 30 / 600 s), :156–160 (`randomUUID()` path, `upsert: false`, no delete of the old object).
- `src/app/api/posts/[id]/route.ts:314`, the comment deferring orphans to a nonexistent lifecycle policy.

---

## Legal & Compliance

This section is about whether Vibe keeps the promises it makes in writing, and whether it meets the legal duties of a social app for college students. It covers what the Privacy Policy (the page telling students what Vibe does with their information) and the Terms say, what really happens when someone deletes a photo, and how a person gets a harmful image taken down. Deleting a whole account does clear out a student's files, and students can report posts inside the app. But three gaps remain: there is no legally required way to get an intimate image removed, the published legal pages date from May and no longer match the app, and deleting a single photo leaves it online. This is not formal legal advice, and each place that needs Vibe's lawyer is marked.

### [High] No way to get an intimate photo taken down, and "removed" photos stay online — confirmed, happening today

**In plain terms:** Someone could post a nude or sexual photo of a student without their consent, and that student would have no clear way to get it taken down. If they don't have a Vibe account, they can't even report it. Even after a founder removes the post, the photo stays online for anyone who saved the link. A federal law now requires apps like Vibe to publish a takedown process and remove these images within 48 hours. That makes this serious harm to a real student and also a direct legal risk, with penalties that can reach tens of thousands of dollars per case.

**What it is:** The TAKE IT DOWN Act was signed in May 2025, and its duties for platforms took effect around May 2026. It covers any public app built mainly around user content. Such an app must publish a notice-and-removal process for non-consensual intimate images (NCII). It must accept requests from the person shown, even if that person is not a user, and remove the image within 48 hours. Vibe has none of this:
- The only report reasons are `spam`, `harassment`, `sexual`, `hate`, `self_harm` and `other`. There is no NCII reason, and no impersonation or copyright reason either. This is true in `src/lib/moderation/reports.ts` and in the DB constraint `reports_reason_code_check`.
- No legal or support page mentions intimate images, a takedown process or a 48-hour commitment.
- In-app reporting (`src/app/api/me/reports/route.ts`) requires a signed-in, verified, non-restricted account. A victim who is not a user has no way in.
- Moderator removal is a soft delete: the row is marked removed but kept. The image file stays at a permanent URL in the `profiles` bucket (the storage folder that holds photos), and that bucket is public.

**How an attacker uses it:**
1. An ex-partner posts an intimate photo of a student as an image post, or sends it in a direct message.
2. The student in the photo has no Vibe account, or can't sign in with a .edu address, so the Report sheet is closed to them. The only published contact, help@connectvibe.app, is presented for child-safety and account issues. It comes with no NCII process and no 48-hour promise.
3. A founder eventually calls the admin removal endpoint (the server address the moderator tool calls), `POST /api/admin/content/remove`, with body `{type:'post', id}`. That sets `posts.removed_at`. But `posts.media_url` still points to `https://<project>.supabase.co/storage/v1/object/public/profiles/<uid>/posts/<file>`.
4. Anyone who copied or forwarded that URL, for example into a group chat, can still open the image with no login.

**Impact:** Serious, lasting harm to the student in the photo. The FTC enforces the Act as a rule violation, with civil penalties on the order of $50k+ per violation (the lawyer should confirm the figure). Vibe also cannot honestly say it removed the content while the file is still online. A campus app whose users are mostly 18–22 is a predictable place for this abuse, so treat this as a before-launch item.

**What to do (before launch):**
1. Publish an "Intimate images / TAKE IT DOWN" section on `/legal/community` and `/support`. Include:
   - the contact address
   - what a valid request needs: a signature, where the image is, a good-faith statement and contact details
   - a commitment to remove the image within 48 hours

   Link the section from the footer.
2. Add a report reason `intimate_image`. Update `reports_reason_code_check` with a migration (a database change script) and update `reports.ts`. Sort these reports to the top of the admin queue. Also accept these requests from people without an account, through a public form or the dedicated address.
3. Make removal real. When a moderator removes a post, move its file out of the public `profiles` bucket into a private quarantine bucket, or delete it, and blank or replace `media_url`. The last finding in this section needs the same fix, so build it once.
4. Have the lawyer confirm that Vibe counts as a "covered platform" under the Act, and which records of requests and removals Vibe must keep.

**Where:**
- `src/lib/moderation/reports.ts:44-50`
- DB constraint `reports_reason_code_check`
- `src/app/api/admin/content/remove/route.ts:31-34` (the code comment reads "SOFT REMOVAL, always: the row stays")
- `src/app/api/me/reports/route.ts`
- `storage.buckets`: `profiles.public = true`. Prod has 3 image posts, all stored at `/storage/v1/object/public/profiles/...`.
- `src/app/legal/**` and `src/app/support/**`: a search for intimate, non-consensual, take it down and 48 hours finds nothing.

### [Medium] The live Privacy Policy and Terms describe an older Vibe — confirmed, happening today

**In plain terms:** Every student agrees to privacy promises and rules that were written in May and no longer match how Vibe works. The pages leave out at least four outside companies that receive student information. They promise backups that don't exist and understate who can see a profile. They also never name CONNECTVIBE. LLC as the company students are agreeing with. Apple and Google can reject an app whose privacy page doesn't match what the app declares, so this could delay the end-of-October store launch. Regulators also treat an inaccurate privacy page as misleading consumers. And because the Terms don't name the company, they protect it less than they seem to.

**What it is:** `/legal/privacy` and `/legal/terms` are still the May 7 "baseline drafts". The last commit to the legal pages was Sept 2, and `TERMS_VERSION = "2026-05-07"`. The founders' own Sept 7/17 replacement drafts in `handoffs/legal-drafts/` (gitignored, unpublished) confirm the live text is wrong:
- **(a)** The service providers list names only Supabase, Vercel and Cloudflare R2. Missing are:
  - Resend, which receives school-verification and sign-in emails
  - Sentry, which receives error reports
  - Stripe, for Vibe+
  - browser/FCM push services (`web-push`)
  - Cloudflare Email Routing
- **(b)** It promises "Encrypted backups may retain copies for up to 30 days". The founders' draft says "We do not currently run automated database backups".
- **(c)** It says "Other Vibe users see your public profile". In fact anyone on the internet can (see the public-profile finding elsewhere in this report).
- **(d)** It says nothing about names being shown in the who-viewed-you, who-saved and who-viewed-post lists. The Sept drafts also get saves and post viewers wrong, so fix the drafts before publishing them.
- **(e)** Section 7 says users must be 18+, but then only commits to not collecting data from children under 13. That leaves it unclear what applies to a 17-year-old first-year. This is a call for the lawyer.
- **(f)** The Terms say the service is "operated by the Vibe team" and never name CONNECTVIBE. LLC. The venue is Monroe County. There are no subscription, renewal or refund terms, even though `/plus` already shows auto-renewal wording.

**How an attacker uses it (a document problem, not a hack):**
1. A student, a state attorney general, the FTC, or an App Store or Play reviewer compares `/legal/privacy` with what Vibe actually does. The page names three vendors, but Resend delivers @iu.edu verification mail and Sentry receives error events.
2. After a data loss, a student cites "encrypted backups for up to 30 days" and asks for a restore that Vibe cannot do. Or, after deleting their account, a student relies on that 30-day window.
3. In a dispute, the $100 liability cap, indemnity and venue clauses are hard to enforce. The Terms don't name the LLC, and the version students accepted (`2026-05-07`) doesn't describe the product.

**Impact:**
- Deception exposure under FTC Act §5 and the Indiana Deceptive Consumer Sales Act.
- App Store and Google Play can reject an app whose privacy policy disagrees with its privacy labels and Data Safety form. That directly threatens the end-of-October launch.
- The Terms protect the LLC less than they appear to.
- Turning on Stripe billing without subscription terms adds exposure under auto-renewal laws.

**What to do:**
1. Correct the Sept 7 drafts where they are wrong themselves (saves and post viewers). Then take them through the lawyer (James owns this) and publish them before the store submission.
2. Name CONNECTVIBE. LLC as the operator. Set the venue to the county you and the lawyer choose.
3. Add a Vibe+ subscription section (price, auto-renewal, cancellation, refunds) before setting `BILLING_ENABLED=true`.
4. List every processor: Supabase, Vercel, Cloudflare R2 and Email Routing, Resend, Sentry, Stripe, and Apple/Google push.
5. Replace the backup sentence with what is actually true.
6. Bump `TERMS_VERSION` so the existing re-consent screen collects fresh agreement. Keep the App Store privacy labels and the Play Data Safety answers in line with the new text.

**Where:**
- `src/app/legal/privacy/page.tsx:20, 77-93, 136-142, 160-166`
- `src/app/legal/terms/page.tsx:20-27, 138-143`
- `src/lib/legal/terms.ts:1`
- The processors actually in use: `src/lib/email/resend-transactional.ts`, `src/lib/sentry-config.ts`, `src/lib/billing/*`, `package.json` (`web-push`)
- `handoffs/legal-drafts/2026-09-07-privacy-policy.md:217`
- `src/app/plus/page.tsx:475-483`
- Live check: `GET /legal/privacy` returns "May 7, 2026" and "up to 30 days" and mentions no Sentry, Resend or Stripe. `GET /legal/terms` returns "the Vibe team" and "Monroe County".

### [Medium] Deleted photos, old profile pictures and "removed" images stay online — confirmed, happening today

**In plain terms:** A student who deletes a photo post, or changes their profile picture to hide an old one, has not actually made the photo disappear. Anyone who saved the link can still open it, with no login, and nothing ever takes it down. Right now 88 of the 100 files Vibe keeps in public storage are leftovers like this: no longer shown anywhere in the app, but still reachable. Students take "delete" to mean gone. Finding a deleted photo still online is the kind of moment that ends someone's trust in Vibe, and for a photo they regret, it can be a safety problem.

**What it is:** Only account deletion removes files (`purgeUserUploads` in `src/lib/profile/storage-purge.ts`). Everywhere else, the files stay:
- **Deleting a single post** (`DELETE /api/posts/[id]`) removes the DB row but only cleans up R2 `clips/` video objects. The image in the public `profiles` bucket stays, and so does a video's poster frame.
- **Uploading a new avatar or banner** (`/api/me/profile-upload`) writes a new `avatar-<uuid>` or `banner-<uuid>` object and never removes the previous one.
- **Moderator removal** is a soft delete (see the first finding).

All of these files keep their permanent public URL. In prod, 88 of the 100 objects in the `profiles` bucket are no longer referenced by any profile, post, event or org.

Separately, `purgeUserUploads` does not cover the R2 `orgs/<orgId>/...` media that a deleted user uploaded as a club officer. That media is not publicly reachable. But it contradicts the delete-account page's promise that "every photo, video and document you uploaded is erased from storage".

**How an attacker uses it:**
1. A student posts a photo, regrets it, and deletes the post. `DELETE /api/posts/<id>` returns 200.
2. Someone who had opened the post kept the image URL (`https://<project>.supabase.co/storage/v1/object/public/profiles/<uid>/posts/<uuid>.jpg`). They could have copied it, or it could sit in a link-preview cache (the saved copy a chat app keeps to show a preview).
3. Days later the URL still returns the image with no sign-in.

Replacing a profile photo to hide an old one fails the same way: the old `avatar-<uuid>.jpg` URL keeps working.

**Impact:**
- It breaks students' reasonable expectation that "delete" means gone.
- For org media, it contradicts Vibe's own written promises: the delete-account page ("erased from storage") and the Privacy Policy ("we remove your data from our live systems immediately"). Together with the previous finding, this adds to the deception exposure.
- For a regretted or harmful photo, neither the student nor the founders can make it disappear without cleaning up storage by hand.

**What to do:**
1. When a post is deleted, also remove the `profiles` object behind its `media_url` and any video poster frame. Log failures the same way the existing R2 cleanup does.
2. When an avatar or banner is replaced, delete the previous object once the profile row points at the new one.
3. When a moderator removes a post, quarantine or delete the file and blank `media_url`. This is shared with the first finding.
4. Run a one-time sweep of the 88 orphaned objects. Right before deleting each one, check again that nothing references it: profiles, posts, events, orgs and messages.
5. Decide whether club media should stay with the club when an officer deletes their account.
   - If it should go, extend `purgeUserUploads` to the R2 `orgs/<orgId>/...` objects that user uploaded. Look them up from their org posts' `media_url` before the rows are gone, as the purge already does for message media.
   - If it should stay, reword the delete-account page and the Privacy Policy to say so.
6. Later, consider serving post images from a private bucket through short-lived signed links, so a copied URL stops working. Weigh this against cost and page speed.

**Where:**
- `src/app/api/posts/[id]/route.ts:317` (the DELETE handler; R2 `clips/` cleanup only, at :360-378)
- `src/app/api/me/profile-upload/route.ts` (each upload creates a new object with `upsert: false` at :160, and the previous one is never removed)
- `src/app/api/admin/content/remove/route.ts:31-34`
- `src/lib/profile/storage-purge.ts`: covers `profiles/<uid>/`, `resumes/<uid>/`, R2 `clips/<uid>/` and message media, but not `orgs/<orgId>/`
- `src/app/legal/delete-account/page.tsx:146-147`
- `src/app/legal/privacy/page.tsx:138-141`
- The Supabase `profiles` bucket: public, with 88 of its 100 objects unreferenced in prod

---

## Infrastructure, Config & Dependencies

This section is about the foundations under the app: the outside software Vibe is built from, the safety settings the site sends to every visitor's browser, and whether anyone is warned when one of those pieces turns out to be broken. Some basics are in place: the site forces encrypted connections and refuses to be shown inside other websites. But three gaps make each other worse. A PDF reader with a publicly known flaw opens other students' resumes. Nothing limits the damage if harmful code ever runs on a Vibe page. And no alarm goes off when the software we depend on is found to have a flaw. The most serious of the three has a two-line first fix.

### [High] A rigged resume could hand over the account of anyone who opens it — confirmed in today's code, not tried on the live site

**In plain terms:** Any student with an ordinary account could upload a specially rigged PDF as their resume. Anyone who then opens it on Vibe, whether another student, a club officer or one of the founders, would unknowingly give the uploader control of their account. That means their private messages, their profile, the ability to post as them and, for a founder, the power to moderate. The rigged file could also copy itself onto each victim's resume and keep spreading. The flaw is in a free PDF-reading tool that Vibe loads from the internet. It has been publicly known since 2024, and the first fix is a two-line change.

**What it is:** Both resume viewers load pdf.js 3.11.174 at runtime from cdnjs, a public code-hosting site. They call `getDocument()` with default options, which leaves `isEvalSupported: true`. pdf.js versions up to 4.1.392 are affected by CVE-2024-4367 (GHSA-wgrm-67xf-hhpq). A crafted PDF gets arbitrary JavaScript run in the page that renders it. This is a stored XSS (attacker code saved inside an uploaded file that runs in the browser of whoever opens it).

These viewers render other users' documents:
- **Desktop:** visitors reach it through `renderDocViewer` → `_backfillRasterIfNeeded` → `_rasterizePdf`.
- **Mobile/PWA:** `ProfileMobile` renders `ResumeViewerMobile` with `editable={!isVisitor}`, and that viewer always calls `rasterizePdf`.

The uploader controls the file's bytes through the app's API (the server addresses its pages call for data):
- The upload route (`POST /api/me/profile-upload`, the address that receives files) checks only the file type the client declares. It stores the file as-is.
- `/api/resume` serves non-owners the ORIGINAL file whenever the document has no redaction bars.
- Linked https PDFs are parsed in-page too.

There is no Content-Security-Policy, or CSP (a browser rule listing which code may run on our pages and where it may send data). So pdf.js's eval check (whether text can be run as code) passes. `npm audit` cannot see this library, because it is loaded outside `package.json`. The version was pinned in commit `8c25b59` (2026-05-11).

This was verified in the current HEAD source. The live page sits behind login, so it was not fetched signed-in, and no exploit was attempted.

**How an attacker uses it:**
1. An attacker with an ordinary account uploads, as their resume, a PDF built to trigger the publicly documented CVE-2024-4367 flaw.
2. They add no redaction bars, so `/api/resume` serves the original bytes to visitors.
3. A victim (another student, a club officer, or a founder/platform admin) opens the attacker's profile and clicks or taps the resume card.
4. The viewer loads pdf.js 3.11.174 and renders the file. The attacker's script runs in the `https://www.connectvibe.app` origin with the victim's session.

**Impact:** Anyone who views the document can have their account taken over:
- The Supabase browser client keeps the session in cookies that page scripts can read (see the next finding).
- The script can call every same-origin API as the victim: read DMs, fetch other users' resumes the victim can see, post, and change settings.
- If the victim is a platform admin, the script gets moderation powers.
- The malicious file can spread by re-uploading itself as each victim's resume.
- The planned Capacitor store apps point `server.url` at the live site with native plugins attached. There, the same script would reach the native bridge (the link that lets web code use phone features such as push notifications).

This is also a concrete case of the next finding. With no CSP, nothing stops the script from sending what it takes to an outside server.

**What to do:**
1. **Now:** pass `isEvalSupported: false` to both `getDocument` calls (`public/html/profile.html:5010` and `src/lib/pdfjs-cdn.ts:97`). This is the vendor's workaround and a two-line change.
2. **Next:** stop loading from cdnjs.
   - Install `pdfjs-dist` >= 6.2.108 (6.3.289 is current) through npm, so the lockfile pins it and `npm audit` covers it.
   - Serve the library and its worker from the app's own origin.
   - Avoid 5.6.83 through 6.2.107, which carry CVE-2026-16633 (GHSA-hq66-cqwq-w95j).
3. **Defense in depth:**
   - For non-owners, always serve the server-rendered image-only derivative that resume-redact already produces, never the original file.
   - Open linked PDFs in a new tab instead of parsing them in-origin.
   - Add a CSP without `'unsafe-eval'` (next finding).

**Where:**
- `public/html/profile.html:4931` and `:5006`: cdnjs pdf.js 3.11.174 and its worker.
- `public/html/profile.html:5010`: `getDocument(source)` with no `isEvalSupported:false`.
- `public/html/profile.html:5709`: backfill rasterize on server-listed docs.
- `src/lib/pdfjs-cdn.ts:13-14`: `PDFJS_VERSION` 3.11.174.
- `src/lib/pdfjs-cdn.ts:97`: `getDocument(source)`.
- `src/components/mobile/ResumeViewerMobile.tsx:297`: `rasterizePdf`.
- `src/components/mobile/ProfileMobile.tsx:2418`: `editable={!isVisitor}`.
- `src/app/api/resume/[...path]/route.ts:94`: original file served when there are no bars.
- `src/app/api/me/profile-upload/route.ts:124-132`: only the declared MIME type is checked.
- `next.config.ts`: sends no CSP.
- Advisories: GHSA-wgrm-67xf-hhpq (affects <=4.1.392, fixed in 4.2.67) and GHSA-hq66-cqwq-w95j (affects >=5.6.83 <6.2.108).

### [High] Nothing limits the damage if harmful code runs on a Vibe page, and the sign-in pass is easy to steal — confirmed on the live site today

**In plain terms:** Suppose one mistake anywhere on Vibe lets outside code run on a page; the resume problem above is a real example. That code can quietly copy the visiting student's sign-in pass and use it from anywhere. The copied pass keeps working until the student deliberately signs out. So one small slip becomes a long-lasting break-in to that student's messages, profile, resume and club roles. The standard browser safety rule that limits which code may run on our pages, and where it may send what it finds, is not switched on. Nothing stands between one slip and a stolen account.

**What it is:** No response carries a CSP. A live GET of `https://www.connectvibe.app/` on 2026-09-27 was checked for its response headers (the notes the server attaches to every page it sends). It returned HSTS, `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy` and `Permissions-Policy`, and no `Content-Security-Policy`. A comment in `next.config.ts` says the rule was left out because the static prototypes rely on inline scripts.

Separately, the auth cookie uses the `@supabase/ssr` 0.6.1 defaults. No `cookieOptions` are passed in `src/lib/supabase/browser.ts`, `server.ts` or `middleware.ts`, the three places the app opens its Supabase connection. The defaults are:
- `HttpOnly=false`
- `SameSite=Lax`
- no `Secure`
- `Max-Age` 400 days

That cookie (`sb-<ref>-auth-token`) holds both the access token and the refresh token. These are the short-lived sign-in pass and the long-lived pass that mints new ones.

The static shells under `public/html` (profile.html alone is about 11k lines) have about 200 `innerHTML` sinks and a lot of inline script, and they render live `/api` data. So a single missed escape (user text not made safe before it is written into the page) becomes a stolen, long-lived session.

The pages also inject a third-party CDN script with no Subresource Integrity hash (a fingerprint the browser checks before running a downloaded file).

Note: `@supabase/ssr`'s browser client reads the session from `document.cookie`. So `HttpOnly` cannot simply be turned on without moving session handling to the server. The realistic controls are CSP, `Secure`, and shorter session lifetimes.

**How an attacker uses it:**
1. The attacker finds any one HTML-injection sink (a spot where user-typed text lands in the page as live markup) in the static shells or the React app. An example is a user-controlled string reaching `innerHTML` unescaped.
2. The injected script reads `document.cookie` and takes the `sb-<ref>-auth-token` access and refresh pair.
3. It posts the pair to a host the attacker controls. No `script-src` or `connect-src` blocks either step.
4. The attacker refreshes the session through Supabase Auth and keeps access until the victim explicitly signs out.

**Impact:** One XSS bug becomes a full, persistent takeover of any student account that loads it: DMs, profile, org officer powers and resume files. Without CSP, nothing contains the damage. Without `Secure`, and with `HttpOnly` off, the cookie itself has no protection.

**What to do:**
1. Ship a CSP in two steps.
   - First send `Content-Security-Policy-Report-Only` with these settings:
     - `script-src 'self'` plus nonces minted in the Next 16 proxy (`src/proxy.ts`, the gatekeeper that runs before every request)
     - `connect-src` limited to self, the Supabase project host, R2, Sentry ingest and cdnjs
     - `object-src 'none'`
     - `base-uri 'self'`
     - `frame-ancestors 'self'`
   - Watch the reports, then enforce.
2. Move the inline handlers in `public/html` into external files so they can run under that rule.
3. Add `integrity` and `crossorigin` attributes to every CDN script, or self-host the files. Self-hosting pdf.js is already step 2 of the previous finding.
4. Pass `cookieOptions: { secure: true }` to all three Supabase clients in production.
5. Turn on Supabase session time-boxing or an inactivity timeout, so a stolen refresh token stops working.

**Where:**
- `next.config.ts:47-51`: comment "No CSP yet".
- Live response headers for `https://www.connectvibe.app/`: no `content-security-policy`.
- `node_modules/@supabase/ssr/dist/main/utils/constants.js`: `DEFAULT_COOKIE_OPTIONS` `{sameSite:'lax', httpOnly:false, maxAge: 400 days}`.
- `src/lib/supabase/{browser,server,middleware}.ts`: no `cookieOptions`.
- `innerHTML` counts:

  | File | Count |
  |---|---|
  | `public/html/profile.html` | 96 |
  | `messages.html` | 31 |
  | `_postViewer.js` | 25 |
  | `_otto.js` | 19 |
  | `_miniMessenger.js` | 13 |
- `public/html/profile.html:4931` and `src/lib/pdfjs-cdn.ts:51-53`: cdnjs script injected with no `integrity` attribute.

### [Low] No alarm goes off when Vibe's building blocks turn out to have security flaws — confirmed in the code-hosting settings today

**In plain terms:** Nobody is warned when a security flaw is found in the outside software Vibe is built on, or when a password is accidentally saved into the code. For about four months this year the site ran on a version of its main toolkit (Next.js) with more than 20 publicly announced flaws. Some of them could let someone get past the check that keeps signed-out people away from private pages. Nobody noticed, because no alarm was set, and a critical fix published five days ago is still not installed. Vibe's code is public, so anyone can look up exactly which versions we run. The alarms that would close this gap are free and take minutes to switch on.

**What it is:** Dependabot alerts are off. `GET /repos/FrankyCazares-Vibe/vibe/vulnerability-alerts` returns 404, which is GitHub's answer when the feature is off. The repo settings show these all disabled:
- `dependabot_security_updates`
- `secret_scanning`
- `secret_scanning_push_protection`

There is no `.github/` directory, so no CI (automatic checks that run on every push) runs `npm audit`.

History shows why this matters:
- `package.json` pinned `next` 16.2.4 from the initial commit (2026-04-25) until `d803937` (2026-09-03).
- In that window the GitHub advisory database published more than 20 Next.js 16.x advisories affecting that version (on 2026-05-11 and 2026-07-22).
- They include middleware/proxy bypasses (GHSA-492v-c6pp-mqqv, GHSA-26hh-7cqf-hhc6, GHSA-6gpp-xcg3-4w24). These matter because this app gates routes in `src/proxy.ts`.
- They also include SSRF (tricking our server into making requests on an attacker's behalf).
- Nothing ever flagged the CDN-loaded pdf.js flaw, which has been public since 2024.

Today the lockfile resolves `next` 16.3.4. The critical GHSA-vcvr-r3jv-pc5j fix in 16.3.6 (2026-09-22) is not applied. `npm audit` does not report that advisory yet, so audit output alone understates the risk.

**How an attacker uses it:** The attacker follows Next.js and React security advisories and reads the exact installed versions from the public `package-lock.json`. They then target connectvibe.app in the weeks or months before anyone notices by hand and upgrades the package.

**Impact:** Framework-level bugs stay open for months. That includes auth-gate bypass, SSRF, and remote code execution (attacker code running on our server). Secret scanning and push protection are also off. So an accidentally committed key in this public repo would not be caught. A key here means a secret password the code uses to reach services like Supabase, Stripe or R2.

**What to do:**
1. Upgrade `next` to >= 16.3.6 now (the lockfile is at 16.3.4) and redeploy.
2. In GitHub → Settings → Code security, turn on all four: Dependabot alerts, Dependabot security updates, secret scanning, and push protection. All are free on public repos.
3. Add a small GitHub Action that runs `npm audit` on every push and pull request, for example `npm audit --audit-level=high`, so a new advisory fails loudly.
4. Move pdf.js into `package.json` (finding 1) so these tools can see it at all. Anything still loaded from a CDN needs a manual watch on its advisory feed.

**Where:**
- GitHub repo `FrankyCazares-Vibe/vibe` (public), code security settings.
- Missing `.github/workflows/`.
- `package.json` / `package-lock.json`: `next` resolves to 16.3.4.
- Commit `d803937`: the 2026-09-03 Next upgrade that ended the 16.2.4 window.

---

## Remediation Roadmap

61 findings are still open. A second reviewer confirmed 34 of them. The rest are low-risk notes nobody double-checked, and some of those just say "checked, looks fine." Two areas were reviewed, but their write-ups were lost, so treat those areas as unreviewed. "This month" means before the October 16 store submission, or before the October 31 launch where noted.

### Immediate (this week)

- **Stop students deleting each other's videos.** In `DELETE /api/posts/[id]`, delete a storage file only when its key starts with `clips/<caller id>/`, and add a rate limit there. In the database, revoke direct INSERT on `posts.media_url` and `posts.media_thumbnail_url` from signed-in users. Do that insert with the server key inside `publish-post` and `publish-clip`, after `isOwnedMediaRef` passes. Once no page reads those two columns directly, revoke SELECT on them too, so raw storage keys stop leaking. In `GET /api/posts/[id]/media`, sign a `clips/` key only when it sits under the post author's folder, and an `orgs/` key only under the post's own club folder. (code + migration, ~half day) — after this, one student can no longer permanently erase another student's or club's video, or repost it as their own.
- **Close the chat-reaction code hole.** Replace `message_reactions_emoji_check` with a check that allows only the `ALLOWED_EMOJIS` list, or revoke direct INSERT and UPDATE on `message_reactions` and write only through the `/react` route. Drop unknown emoji in `GET /api/me/threads/[id]/messages`. In `chipsFor` in `public/html/messages.html` and at `public/html/_miniMessenger.js:756`, escape the emoji. Also replace the inline `onclick` string with `data-` attributes and one shared click listener. (code + migration, ~3h) — after this, a message in a group chat can no longer run hidden code that takes over the account of everyone who opens that chat.
- **Switch off the dangerous part of the resume viewer today.** Pass `isEvalSupported: false` to both `getDocument` calls, at `public/html/profile.html:5010` and `src/lib/pdfjs-cdn.ts:97`, then deploy. This is the vendor's own workaround. The full upgrade is under Short term. (code, 15 min) — after this, opening a rigged resume file can no longer take over the account of the person viewing it.
- **Publish an intimate-image removal process.** Add a TAKE IT DOWN Act section to `/legal/community` and `/support`, linked from the footer. It needs a contact address, a list of what a request must include (a signature, where the image is, a good-faith statement, contact details) and a promise to remove the image within 48 hours. Add an `intimate_image` reason to `src/lib/moderation/reports.ts` and to the `reports_reason_code_check` constraint. Sort those reports to the top of the admin queue, and accept requests by email from people who have no account. (code + copy, ~3h) — after this, a student whose private photo is posted without consent has a clear way to get it taken down within 48 hours, which federal law now requires of apps like Vibe.
- **Make a moderator removal actually remove the picture.** When `/api/admin/content/remove` runs, move the image out of the public `profiles` bucket into a private quarantine bucket and blank the post's media link. In `GET /api/posts/[id]/media`, also select `removed_at` and `user_id`. Return not-found when the post was removed, when the author is suspended or banned, or when the visitor is signed out. The author and admins are the only exceptions. (code, ~half day) — after this, a photo or video a moderator took down stops loading for anyone who saved the link.
- **Put two-step login on the three admin accounts.** Build a small screen where a founder adds an authenticator app. Then change `requirePlatformAdmin` and `requirePlatformAdminPage` in `src/lib/auth/require-platform-admin.ts` to refuse any session whose `getAuthenticatorAssuranceLevel` is below `aal2`. (code ~half day, then 5 min per founder) — after this, a guessed or leaked founder password is no longer enough to ban students, remove posts or look up anyone's email address.
- **Turn on the "prove you're human" check at signup.** Enable CAPTCHA with Cloudflare Turnstile in Supabase Auth. Pass `captchaToken` to `signUp` in `src/app/auth/signup/page.tsx`, to `resend` in `src/components/auth/ResendConfirmation.tsx` and to `signInWithPassword`. Raise the project's 30-per-hour email cap so it covers a demo-day rush. (Supabase dashboard + code, ~3h) — after this, an automated program can no longer use up the hourly signup-email budget and leave real students at a demo day without a confirmation email.
- **Make the Saved tab's promise true.** Change `src/app/api/me/posts/[id]/savers/route.ts` to return a count only, with no names, so "Only you can see your saves" is accurate. I recommend this because saves are not on the list of things Vibe+ sells. Keep the profile and post viewer lists as the paid feature, and have the lawyer sign off on how that is disclosed (see below). (code, ~1h) — after this, a student who bookmarks a post is no longer secretly shown to that post's author.
- **Register a copyright agent.** File Vibe's DMCA designated agent at copyright.gov/dmca-directory. It costs $6 and needs renewing every three years. Use a PO box or the LLC's registered-agent address. (James, 15 min, $6) — after this, Vibe keeps its legal shield if a student posts a video with someone else's song in it.
- **Set spending alerts.** Add a Cloudflare billing alert on R2 storage and a spend alert in Supabase. (dashboards, 10 min) — after this, we find out within a day, not at month-end, if someone starts running up our storage bill.
- **Hide who the admins are.** Run `REVOKE SELECT (is_platform_admin) ON public.users FROM authenticated`. `profile-bootstrap` keeps returning each user's own flag. (migration, 15 min) — after this, an ordinary user can no longer look up which accounts belong to the founders with moderator powers.
- **Move Supabase to the Pro plan and block leaked passwords.** Upgrade the project, about $25 a month. Then turn on leaked-password protection under Auth, Password security, and set the minimum password length to 10. Pro also means a full database gets more space instead of freezing into read-only. (Supabase dashboard, 10 min, ~$25/month) — after this, nobody can sign up with, or reset to, a password that is already on public lists of stolen passwords.
- **Take the product journal off the public site.** Move `public/journal/vibe_journal.html` into the vault or a private repo and keep editing it there. `git rm` the old file, add it to `.gitignore` and drop its line from robots.txt. Treat everything it already published, including founder emails, as public. I recommend making the GitHub repo private, because its history still holds the journal. (code, 30 min) — after this, a stranger can no longer read Vibe's internal plans and the founders' contact details by visiting one web address.
- **Turn on GitHub's security alerts.** In the repo settings, enable Dependabot alerts and security updates, plus secret scanning and push protection if the plan allows. (GitHub settings, 10 min) — after this, we hear about a known flaw in the outside code Vibe is built on within a day, not months later.
- **Patch Next.js and sharp.** Bump `next` and `eslint-config-next` to 16.3.6 and `sharp` to 0.35.5, then deploy. Vibe does not use the affected Next.js feature today, so this is routine upkeep. (code, 20 min) — after this, a newly announced critical flaw in our web framework stays out of reach even if someone later adds the feature it lives in.

### Short term (this month)

- **Add a browser safety rule to every page.** Ship a Content-Security-Policy, a rule the browser enforces about which code may run on our pages and where those pages may send data. Start in report-only mode, with reports going to Sentry. Limit `connect-src`, `img-src` and `media-src` to our site, the Supabase host, R2 and Sentry. Set `object-src 'none'`, `base-uri 'self'` and `frame-ancestors 'self'`, then switch from report-only to enforced. Move the inline `onclick` handlers in `public/html` into shared listeners so scripts can be locked down as well. In production, pass `cookieOptions: { secure: true }` to the Supabase clients and turn on a session inactivity timeout. The store apps load the live site, so they are covered too. (code, ~3 days) — after this, one missed bug on any page can no longer be used to copy a student's login and send it off the site.
- **Finish the resume viewer fix.** Install a current `pdfjs-dist` through npm, and serve it and its worker from our own site instead of cdnjs. Make `/api/resume` always give non-owners the server-made image copy instead of the original file. Open linked PDFs in a new tab instead of inside Vibe. (code, ~1 day) — after this, other people's resumes reach a viewer only as pictures, so a rigged file has nothing it can run.
- **Put the media-link rules into the database.** Revoke direct UPDATE on `orgs.logo_url`, `orgs.banner_url` and `orgs.links`, and direct INSERT on `channels.photo_url`, and write those columns through server routes. Add check constraints that allow only an empty value, our own storage key under the right club or chat, or our own Supabase host. Make `postMediaProxyUrl`, `orgAssetProxyUrl` and `withPostMediaUrls` drop any outside web address, and limit `normalizeOrgAssetInput` to `orgs/<club id>/`. (code + migration, ~1 day) — after this, nobody can slip an outside image into the feed that quietly records the rough location and viewing time of every student who scrolls past it.
- **Tie chat photos to the person who uploaded them.** Name message uploads `messages/<chat>/<uploader>/<id>`, or record each signed upload in an `uploads` table along with who uploaded it. Have the send route and a database trigger require the uploader to be the sender. Change `purgeUserUploads` to delete by uploader instead of by message rows, and delete the stored file when a message is deleted. Until this ships, soften the delete-account page, which is also our Google Play data-safety page, so it stays true. (code + migration, ~1 day) — after this, a member leaving Vibe can no longer wipe everyone else's photos from a group chat, and photos a student deletes are actually erased.
- **Erase images when they are deleted or replaced.** When a post is deleted, remove its image and poster frame from the `profiles` bucket, the same way `clips/` videos are already removed. When an avatar, banner or logo changes, delete the old file. Run a one-time sweep of the 88 files nothing points to, after checking a dry-run list first. Later, serve post images through expiring links, the way resumes already are. (code, ~1 day) — after this, a photo a student deletes or replaces stops being downloadable by anyone who kept the link.
- **Cap what one account can upload.** Require a verified, unrestricted account on every upload-link route by using `requireCanPublish`. Upload into a staging folder that an R2 lifecycle rule (an automatic cleanup rule in Cloudflare) empties after 24 hours unless the file gets published. Add a per-user daily byte limit, recorded when the upload link is signed. Set `failClosed: true` on the upload limiters, and lower the 200 MB ceiling to what video posts actually need. (code + Cloudflare dashboard, ~1 day) — after this, one throwaway account can no longer pile up hundreds of dollars a month in storage charges.
- **Put size limits in the database itself.** Add length checks on every text and JSON column students can write to. Add a per-user row cap on `otto_reminders`, `reminders`, `bookmark_collections` and `personal_events`. (migration, ~1 day) — after this, one free account can no longer fill the database until posting and messaging stop working for everyone.
- **Decide what unverified accounts can read.** Today anyone with any confirmed email can read the student directory and every post straight from the database. My recommendation is to keep browsing open, which matches the moderation decision. Stop signed-in users reading `last_active_at`, `location_text` and `work_experience` directly, and serve those fields only through routes that check `school_verified`. If the founders want reading to require a school email too, add an `is_verified_viewer()` check to the read rules on users, posts, comments, events and clubs. (founders decide, then code + migration, ~half day) — after this, an outsider signed up with a personal email can no longer pull every student's location and last-online time.
- **Close the early-signup takeover gap.** First test the behavior on a separate test project, using two addresses you own. Then add a daily job that deletes accounts still unconfirmed after 24 hours. On first confirmation in `/auth/confirm`, sign out every other session and have the student set their password. (code, ~half day) — after this, someone who signs up with a student's email before the student does can no longer keep a secret way into that student's account.
- **Stop showing student profiles to the open web by default.** Add `robots: { index: false }` to `/profile/[handle]` and disallow `/api/` in `robots.ts`. Cut the signed-out profile response down to name, handle, avatar and tagline. Add an "Only signed-in students can see my profile" setting, on by default. Correct what the Support page promises about blocking. (code, ~1 day) — after this, a blocked person can no longer see a student's posts just by logging out, and students stop showing up when someone searches their name on Google.
- **Publish a copyright page.** Add `/legal/copyright`, covering what a takedown notice must contain, a counter-notice process and a repeat-infringer policy. Link it from the Terms and add a `copyright` report reason. (code + copy ~2h, lawyer reviews) — after this, a rights holder who complains has a clear process to follow instead of going straight to a lawsuit.
- **Ask for the password again before big account changes.** In Supabase Auth, turn on Secure password change, Secure email change and the password-changed and email-changed notice emails. Add the reauthentication code step to `/auth/update-password`. Require a fresh password or email code for `DELETE /api/me`. Delete the legacy `#access_token` branch in `/auth/update-password`. (Supabase dashboard + code, ~half day) — after this, someone holding a student's unlocked phone can no longer quietly change the password or delete the account, and the student gets an email if the password changes.
- **Lock uploads to the file type we checked.** Pass `signableHeaders: new Set(['content-type'])` to `getSignedUrl`. On every signed download, set `ResponseContentType` from the file extension and set `ResponseContentDisposition`, using `attachment` for anything that is not an allowed image or video. (code, ~2h) — after this, nobody can use Vibe's storage to host a fake login page behind a connectvibe.app link.
- **Check suspensions on every server-side write.** Build `requireNotRestricted` into the shared guard helpers for club-officer and chat routes. Add it to the roughly 12 server-key write routes that skip it today. Add a CI check that fails when a write route uses the server key without it. (code, ~3h) — after this, a suspended or banned club officer can no longer keep acting for the club when one safety check hiccups.
- **Ask age as its own question.** Take the age question out of the Terms checkbox and ask for birth year in a neutral way. Store the answer, and ask again at the re-consent screen. Make Privacy §7 say 18+ everywhere. Suspend an under-18 account until the student's 18th birthday instead of banning it for life. (code ~3h, lawyer answers the 17-year-old question below) — after this, Vibe has a real record that each user said they are an adult, and a 17-year-old first-year is not banned for life.
- **Stop promising a 24-hour response.** The Support, Community and Child Safety pages promise every report is acted on within 24 hours. Change that to "We aim to review reports within 24 hours; reports of child exploitation or imminent harm go first", and make Terms §5 match. (copy, 20 min) — after this, Vibe no longer publicly guarantees a response time that three part-time moderators cannot always keep.
- **Take production keys off the laptop.** Point `.env.local` at the local stack only, and pull production values into a temp folder with `vercel env pull` when you need them. Keep the Supabase personal access token in the CLI keychain, limited in scope and set to expire. Move to Supabase's new `sb_secret_` keys, which can be revoked one at a time. (code + Supabase dashboard, ~2h) — after this, a lost or hacked laptop no longer hands someone full control of the live database.
- **Run a security check on every push.** Add a GitHub Action that runs `npm audit --omit=dev --audit-level=high` for the root and for `mobile/`. (code, ~1h) — after this, a newly known flaw in our outside code blocks the build instead of shipping quietly.
- **Give the same signup answer for every email.** Show the same "check your inbox" screen whether or not the address already has an account. (code, ~1h) — after this, a stranger can no longer use the signup page to check whether a particular person is on Vibe.
- **Build email unsubscribe before the first marketing email.** Send marketing only through a separate Resend audience with opt-in, an unsubscribe link, a List-Unsubscribe header and a postal address. Never send it to the school-email column. Add a marketing-email switch in Settings. (code, ~half day) — after this, launch emails can go out without breaking the federal anti-spam law.
- **Hide raw database errors.** Return fixed error codes such as `{ ok: false, code: 'internal' }` from `/api/feed`, `/api/events/[id]/ics` and `/api/me/profile-bootstrap`. Check that the calendar event id is a real UUID, and set `poweredByHeader: false`. (code, ~1h) — after this, error messages no longer give an attacker clues about how our database is built.
- **Fix calendar-file escaping.** In `escIcsText`, turn every `\r\n`, `\r` and `\n` into `\\n`. Quote the organizer name and fold long lines. Add a database check that rejects control characters in event titles. (code + migration, ~1h) — after this, a club can no longer slip a fake link into the calendar file students add to their phones.
- **Clear cached profile data on sign-out.** Clear `vibe_user_v1` and the other account keys whenever the app sees no session, and leave `resumeRedactions` out of the cached copy. (code, ~1h) — after this, the next person on a shared computer cannot find the last student's resume details left behind in the browser.
- **Scrub search terms and emails from error reports.** Add `q`, `query` and `email` to Sentry's redacted list, and add an email pattern to `scrubString`. On the school-email paths, log `error.code` instead of whole error objects. (code, 30 min) — after this, students' searches and email addresses stop landing in our error-tracking tool.
- **Put limits on server-side resume image processing.** Pass `limitInputPixels` of about 50 megapixels and `failOn: 'error'` to sharp. Check that a file really is JPEG, PNG, WebP or PDF at upload and again before decoding. Cap redacted-copy renders per owner per hour. (code, ~1h) — after this, a malformed file cannot crash or tie up the server that makes redacted resume copies.
- **Drop the shadcn command-line tool from the app.** Copy `shadcn/tailwind.css` into `src/app` and remove `shadcn` from `package.json`. Run a pinned `npx shadcn@<version>` only when adding components. (code, 30 min) — after this, about 300 fewer outside packages get installed with Vibe, so there are fewer places for a tampered package to slip in.

### Ongoing / process

- **Finish the two areas this audit could not report on.** The first covers access rules: blocks, paid features, club roles, club verification and hidden clubs. The second covers data exposure in `src/app/api/users/**`, `orgs/[slug]/profile` and the pages that read them. Re-run both, either as a fresh sentinel run or by hand, and treat them as unreviewed until then. (Franky, ~half day) — after this, we know whether the two areas nobody could report on hide the same kind of hole found everywhere else.
- **Make the database the rule-keeper.** Whenever a route checks something, such as who owns a file, which web addresses are allowed, how long text can be or which emoji are valid, add the same rule in the database or remove students' direct write access to that column. Add a test that tries the direct write. (code, part of every feature) — after this, the trick behind the worst findings in this report, skipping the app and writing to the database directly, stops working on new features.
- **Patch serious framework flaws within 48 hours.** Watch the Next.js and Supabase security advisories directly, because npm audit hears about them late, and patch any critical one within two days. (Franky, ongoing) — after this, a known hole in the software Vibe is built on cannot sit in production for months again.
- **Run the security sentinel at every milestone.** Run it before the Oct 16 store submission, before the Oct 31 launch and after any big feature. Walk the fixes in a browser as a non-admin at phone width. (Franky, ~1h per run) — after this, new holes get caught before students run into them.
- **Keep the legal pages in step with the product.** When a feature changes who sees what, such as viewer lists, saves or public profiles, update the Privacy Policy, the App Store privacy labels and the Play data-safety form in the same week. Bump `TERMS_VERSION` whenever the Terms change. (Franky + James, each release) — after this, the app stores and regulators never find a gap between what Vibe says and what it does.
- **Share weekend and exam moderation duty.** Set up a rotation among the three founders with a push or text alert for new reports, and show time-to-first-action in `/admin`. (all three founders) — after this, a serious report filed on a Friday night does not sit until Monday.

### Needs a specialist

- **Hire a live pentest before the App Store launch.** Pay a security tester to attack a staging copy of Vibe on purpose, meaning a separate project filled with fake students. Their list should cover the fixes above, the early-signup takeover and whether R2 rejects an upload bigger than the size its link allows. It should also cover the store apps, which load the live site. (staging pentest) — after this, an outside expert has actually tried to break in, instead of us only reading the code.
- **Lawyer confirmation on intimate images.** Confirm that Vibe is a covered platform under the TAKE IT DOWN Act, review the notice published this week, and say which records to keep after a removal. (lawyer, James arranges) — after this, we know the removal process meets the federal rule, not just our own reading of it.
- **Lawyer review of the Privacy Policy and Terms, due before the Oct 16 store submission.** Take the Sept 7 drafts to the lawyer after fixing what they get wrong about saves and post viewers. The final text should:
  - name CONNECTVIBE. LLC as the operator and set Marion County as the venue
  - list every service that receives student data: Supabase, Vercel, Cloudflare, Resend, Sentry, Stripe and Apple and Google push
  - replace the backups sentence with what is actually true
  - add a Vibe+ section on price, renewal, cancellation and refunds before billing turns on

  Then publish it and bump `TERMS_VERSION`. (lawyer, James arranges) — after this, the published policy matches what Vibe really does, so the app stores have no reason to reject us and regulators have no false-statement claim.
- **Lawyer sign-off on selling "who viewed you".** Before paid Vibe+ turns on, agree how the viewer lists are disclosed: the policy wording, a one-time notice to viewers, and whether to offer a browse-privately setting. (lawyer, before billing) — after this, the paid "see who viewed you" feature does not become a deceptive-practice problem the day students start paying for it.
- **Lawyer decision on 17-year-olds.** IU Indianapolis and Purdue Indianapolis admit some students under 18. Decide whether they are kept out or allowed in with limits, and check the age wording. (lawyer) — after this, the youngest first-years are handled in a way the lawyer has signed off on, not one we guessed.
- **Lawyer review of the copyright page.** Check `/legal/copyright` and the repeat-infringer policy. (lawyer, ~1h) — after this, the copyright process holds up if a record label sends a takedown.

---

## Appendix A — All findings (register)

| # | Finding | Area | Severity | Status | Where |
|---|---------|------|----------|--------|-------|
| 1 | Any verified student can delete other people's videos in R2 by pointing their own post at the victim's storage key | injection | High | confirmed_current | Direct PostgREST insert into public.posts, then DELETE /api/ |
| 2 | Stored XSS: message reaction emoji rendered unescaped in desktop messages and mini messenger | xss | High | confirmed_current | public/html/messages.html (chipsFor), public/html/_miniMesse |
| 3 | Any verified student can permanently delete another student's video from R2 | uploads | High | confirmed_current | PostgREST INSERT on public.posts + DELETE /api/posts/[id] (s |
| 4 | Resume viewer renders other students' PDFs with pdf.js 3.11.174, which has a known code-execution bug (CVE-2024-4367) | client | High | confirmed_current | Profile resume viewer: desktop public/html/profile.html (vie |
| 5 | Resume viewer runs pdf.js 3.11.174 (CVE-2024-4367) on other users' PDFs, a stored XSS risk on www.connectvibe.app | deps | High | confirmed_current | Resume/portfolio viewer: desktop public/html/profile.html an |
| 6 | No notice-and-removal process for intimate images, and a moderator "removal" leaves the image live | legal | High | confirmed_current | Reporting and moderation (src/lib/moderation/reports.ts, src |
| 7 | No Content-Security-Policy, and the session cookie can be read from JavaScript | infra | High | confirmed_current | All pages (next.config.ts headers), Supabase auth cookies vi |
| 8 | School-email verification gates posting, not reading: any confirmed non-student account can read the student directory and all posts | auth | Medium | confirmed_current | Supabase RLS policies and column grants on public.users, pub |
| 9 | No CAPTCHA on signup: the project-wide 30 emails/hour confirmation cap can be exhausted, blocking every real signup | auth | Medium | confirmed_current | Supabase Auth signup and resend-confirmation (called straigh |
| 10 | Platform admin accounts are password-only, publicly identifiable, and have leaked-password protection off | auth | Medium | confirmed_current | GoTrue password sign-in for the 3 is_platform_admin accounts |
| 11 | Possible pre-registration takeover: an unconfirmed account keeps whoever set its password first | auth | Medium | confirmed_current | Supabase Auth signup plus the /auth/confirm and /auth/callba |
| 12 | Direct database writes put any external image URL into the feed and club lists (viewer IP tracking, image swapped after moderation) | injection | Medium | confirmed_current | posts.media_url / media_thumbnail_url and orgs.logo_url / ba |
| 13 | Direct PostgREST writes bypass every route-level rate limit and length cap; one free account can grow the Free-plan database until it goes read-only | abuse | Medium | confirmed_current | Supabase Data API (/rest/v1/*) reached with the attacker's o |
| 14 | 200 MB signed video PUTs with no per-user storage quota and no orphan cleanup or lifecycle policy | abuse | Medium | confirmed_current | src/app/api/me/clip-upload-url (200 MB PUTs, 20 per 10 min), |
| 15 | Anonymous signup and resend-confirmation have no CAPTCHA, allowing exhaustion of the project email cap and unbounded auth.users creation | abuse | Medium | confirmed_current | Client-side GoTrue calls: supabase.auth.signUp (src/app/auth |
| 16 | Direct database writes skip every media-URL check, so any image URL or key can be shown to every viewer | uploads | Medium | confirmed_current | PostgREST: posts INSERT (media_url, media_thumbnail_url), or |
| 17 | Deleting your own account can wipe other people's photos and videos in a group chat | uploads | Medium | confirmed_current | DELETE /api/me → purgeUserUploads → deleteR2Keys (src/lib/pr |
| 18 | Unverified accounts can fill R2 with 200MB files that are never cleaned up | uploads | Medium | confirmed_current | POST /api/me/clip-upload-url (plus messages-upload-url, orgs |
| 19 | Deleted chat and club media stays in storage forever, which contradicts the delete-account page | uploads | Medium | confirmed_current | DELETE /api/me/threads/[id]/messages/[messageId]; org post d |
| 20 | Media from removed posts and banned authors is still served, to anyone, without sign-in | uploads | Medium | confirmed_current | GET /api/posts/[id]/media; public `profiles` bucket |
| 21 | No Content-Security-Policy anywhere, while Supabase session tokens sit in JavaScript-readable cookies | client | Medium | confirmed_current | All pages on www.connectvibe.app, especially the legacy stat |
| 22 | The live Privacy Policy and Terms (May 7) don't match what Vibe actually does | legal | Medium | confirmed_current | src/app/legal/privacy/page.tsx, src/app/legal/terms/page.tsx |
| 23 | Deleted posts, replaced avatars and banners, and moderator-removed images stay publicly reachable | legal | Medium | confirmed_current | Supabase public `profiles` bucket; src/app/api/posts/[id]/ro |
| 24 | "Only you can see your saves" is false: Vibe+ authors see who saved, who viewed a post and who viewed their profile | legal | Medium | confirmed_current | GET /api/me/posts/[id]/savers, /api/me/posts/[id]/viewers, / |
| 25 | Student profiles and posts are open to the whole internet and indexable, so a block is bypassed by logging out | legal | Medium | confirmed_current | GET /api/users/[handle]/bootstrap, /api/users/[handle]/posts |
| 26 | No copyright policy, takedown process or DMCA designated agent | legal | Medium | confirmed_current | src/app/legal/** (Terms §4), user uploads (photos, video pos |
| 27 | A stolen session turns into a lasting takeover: JS-readable 400-day tokens, no CSP, and password change or account deletion without re-authentication | auth | Low | confirmed_current | @supabase/ssr session cookies; /auth/update-password; DELETE |
| 28 | Signup reveals whether an email already has a confirmed Vibe account | auth | Low | unverified_low | Supabase Auth signup response (the identities array) |
| 29 | The legacy #access_token path on /auth/update-password replaces an existing session with whichever tokens the link carries | auth | Low | unverified_low | /auth/update-password page, legacy implicit-token branch |
| 30 | Calendar (.ics) export does not escape bare carriage returns or ':' in the ORGANIZER name, so a club event can inject extra calendar lines | injection | Low | unverified_low | GET /api/events/[id]/ics and GET /api/me/calendar/ics |
| 31 | No Content-Security-Policy, so any missed sink is full account takeover | xss | Low | confirmed_current | next.config.ts headers(); all pages, especially /html/*.html |
| 32 | Escaped values inside inline onclick JS strings (unsafe pattern, currently held safe by data constraints) | xss | Low | unverified_low | public/html/_postViewer.js renderCommentRow; public/html/mes |
| 33 | Media and link URL columns still writable directly, bypassing route validators (viewer beaconing, CSS injection in reposts pane) | xss | Low | unverified_low | public.posts (INSERT media_url, media_thumbnail_url), public |
| 34 | Upload type is not enforced, so attackers can host HTML or SVG pages behind connectvibe.app links | uploads | Low | confirmed_current | src/lib/r2.ts presigned PUTs (clip, message, group, org uplo |
| 35 | Internal product journal ships as a public static file with no auth | client | Low | confirmed_current | https://www.connectvibe.app/journal/vibe_journal.html (publi |
| 36 | pdf.js and its worker load at runtime from cdnjs without Subresource Integrity | client | Low | unverified_low | public/html/profile.html and src/lib/pdfjs-cdn.ts (resume vi |
| 37 | Cached profile blob in localStorage outlives sessions that end without an explicit sign-out | client | Low | unverified_low | Browser localStorage (vibe_user_v1 and related keys) on shar |
| 38 | No automated dependency or secret monitoring on a public repo; known-vulnerable Next.js stayed in prod for months | deps | Low | confirmed_current | GitHub repo FrankyCazares-Vibe/vibe (public), build pipeline |
| 39 | Next.js 16.3.4 is inside the range of critical GHSA-vcvr-r3jv-pc5j (next/og ImageResponse RCE), but the app doesn't use next/og | deps | Low | unverified_low | next dependency (package.json / package-lock.json) |
| 40 | shadcn CLI is a production dependency for one 1.7 KB CSS import, and brings 304 extra packages into every install and build | deps | Low | unverified_low | package.json dependencies, Vercel build environment, develop |
| 41 | Uploaded resume files reach PDFium (WASM) and sharp/libvips in the /api/resume function with default limits and no content sniffing | deps | Low | unverified_low | GET /api/resume/* (non-owner or ?view=public render path), s |
| 42 | The 18+ rule rests on a bundled checkbox, the policies disagree on the age, and a minor who is found gets banned permanently | legal | Low | confirmed_current | src/app/auth/signup/page.tsx, src/app/api/me/accept-terms, s |
| 43 | The public pages promise every report is "acted on within 24 hours", which contradicts the Terms and creates liability | legal | Low | confirmed_current | src/app/legal/community, src/app/legal/child-safety, src/app |
| 44 | No email-unsubscribe setup exists, so any launch or marketing email would break CAN-SPAM and the Privacy Policy | legal | Low | unverified_low | src/lib/email/resend-transactional.ts, src/lib/moderation/al |
| 45 | The internal product journal is public on the site and in the public GitHub repo | infra | Low | confirmed_current | https://www.connectvibe.app/journal/vibe_journal.html (publi |
| 46 | Suspended or banned officers are stopped only by a fail-open proxy check on about 12 service-role write routes | infra | Low | unverified_low | src/proxy.ts restriction gate; org and thread management rou |
| 47 | Production secrets and an account-wide Supabase token sit in .env.local, and several keys can't be rotated | infra | Low | unverified_low | Developer workstation (/Users/franciscocazares/vibe/.env.loc |
| 48 | Several API routes send raw PostgREST or SDK error messages back to the client | infra | Low | unverified_low | src/app/api/feed, events/[id]/ics, me/profile-bootstrap, me/ |
| 49 | Supabase leaked-password protection is turned off | infra | Low | unverified_low | Supabase Auth configuration |
| 50 | Any signed-in user can list who the platform admins are | infra | Low | unverified_low | public.users column grant is_platform_admin + RLS users_sele |
| 51 | The findings for this lens were drafted but could not be delivered | authz | Info | unverified_low | Authorization, IDOR and data isolation (RLS) lens |
| 52 | Verified clean: PostgREST filter injection, open redirect, SSRF, RPC/dynamic SQL and email header/host injection | injection | Info | unverified_low | src/lib/pgrest.ts callers, keyset cursors, auth next= handli |
| 53 | Latent sinks and owner-only (self) XSS in the static profile page | xss | Info | unverified_low | public/html/profile.html, public/html/_sharePicker.js, publi |
| 54 | Session 51/58 escaping holds on the main visitor-facing render paths | xss | Info | unverified_low | /html/profile.html?app=1&handle=<h> (public profile viewer, |
| 55 | Data exposure lens: findings were withheld and need a manual re-run | dataexp | Info | unverified_low | Data exposure and enumeration lens (whole lens) |
| 56 | Upload size limit is signed into each upload URL, but one live upload is needed to confirm R2 enforces it | uploads | Info | unverified_low | src/lib/r2.ts signed PUTs |
| 57 | Server-only secrets stay out of the browser bundle (checked, clean) | client | Info | unverified_low | Client JS bundle, env handling, public repo history, Capacit |
| 58 | Remaining npm audit hits are dev/build tooling only and not reachable at runtime | deps | Info | unverified_low | Root devDependencies (eslint toolchain) and mobile/ Capacito |
| 59 | Checked and working: account deletion, Sentry scrubbing, blocks in DMs, report intake, and the Maya Chen fix | legal | Info | unverified_low | DELETE /api/me, src/lib/sentry-config.ts, messages RLS, /api |
| 60 | Sentry scrubbing is strong but misses search terms and email-bearing error details | infra | Info | unverified_low | src/lib/sentry-config.ts beforeSend / beforeSendTransaction |
| 61 | Checked and working: health endpoints, email-link host, CORS, source maps, git history, dependencies | infra | Info | unverified_low | Health routes, site-url, headers, build output |

## Appendix B — Method & coverage

- **Lenses run (11):** Authentication & session; Authorization, IDOR & data isolation (RLS); Injection: SQL/PostgREST/SSRF/redirect/path; XSS: stored / DOM / reflected; Data exposure & enumeration; Abuse, rate-limiting, DoS & monetary cost; File upload & storage; Client-side & secrets in bundle; Dependencies & supply chain; Legal & compliance; Infrastructure, config & headers.
- **Verification:** every Medium-or-higher finding was re-checked by an independent adversarial agent that read the current code before the finding was kept; already-fixed and false-positive items were dropped.
- **Not covered by this run:** live/dynamic exploitation, authenticated multi-account fuzzing, and load/DoS testing — all of which require a staging deploy. Social-engineering and physical security are out of scope.
- **Inventory basis:** RECON INVENTORY: Vibe (connectvibe.app), checked 2026-09-27, read-only. Stack: Next.js 16.3 App Router on Vercel. Supabase handles Postgres, Auth and Storage. Cloudflare R2 holds media through the S3 SDK with presigned URLs. Resend sends email, Sentry catches errors, and Stripe is wired in for Vibe+ but switched off. Push is built but dark: web-push/VAPID for browsers, and FCM for a Capacitor 8 iOS/Android shell in mobile/, which uses @capacitor-firebase/messaging. Otto makes no LLM or AI API calls. API surface: 150 route.ts handlers under src/app/api. 83 of them use the service-role client, so each must authorize itself in code. 61 call the Postgres rate limiter (rate_limit_hit). Only two routes have no user-auth check, both by design: auth/password-reset (rate-limited per IP and per hashed email, same answer whether or not the account exists) and orgs/[slug]/asset/[kind]. Anonymous GETs to /api/campuses and /api/health/supabase returned 401, and /api/me returned 405. Live DB scale is small: 20 users (14 school-verified), 5 orgs, 21 posts, 57 messages, 40 objects in the resumes bucket, 100 in profiles, 1 entitlement row. Buckets: `profiles` is PUBLIC (8MB limit, images plus PDF). `resumes` is PRIVATE and served through /api/resume with 300s signed URLs plus server-side PDFium/sharp redaction (maxDuration 60). Column grants on public.users hold: anon has no access, and authenticated cannot SELECT email, school_email, resume_url/docs/redactions, otto_answers, voice_samples, recruiter_snapshot, otto_settings or terms/age fields. Authenticated CAN read location_text, work_experience, last_active_at and is_platform_admin. CURRENT-STATE OBSERVATIONS FOR OTHER AUDITORS: (1) The internal product journal is public. https://www.connectvibe.app/journal/vibe_journal.html returned 200 (364KB, confirmed live). It is also tracked in git in a PUBLIC GitHub repo (FrankyCazares-Vibe/vibe, confirmed through gh). robots.ts calls it a "real internal document (security model, past vulnerabilities, business plans)". It mentions the EIN, the D-U-N-S number, @iu.edu addresses and service_role. The only protection is robots Disallow plus X-Robots-Tag noindex. There is no auth. (2) Prod schema drift. schema_migrations stops at 20260926100000. 20260922150000_billing_stripe and 20260924120000_push_notifications were never applied, so billing_customers, billing_events, push_devices and push_outbox do not exist in prod. The untracked 20260927100000_rsvp_home_campus_rls.sql is also unapplied. DELETE /api/me deliberately treats a missing billing_customers table as "no customer", so account deletion still works. (3) Supabase security advisors: 22 SECURITY DEFINER functions are executable by anon and 28 by authenticated. I spot-checked rate_limit_hit, which refuses the anon/authenticated roles in its body, and record_profile_view, which requires auth.uid(); both are mitigated. Leaked-password (HIBP) protection is DISABLED. moderation_actions_append_only has a mutable search_path. Eight service-only tables have RLS on and no policies, which is intended. (4) There is no CSP (a documented choice, because the /html prototypes use inline scripts). HSTS preload, nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy and Permissions-Policy (geolocation=()) were confirmed live. (5) Upload caps: 200MB video (post clips and DMs), 15MB message images, 10MB group photos, 8MB resumes. The R2 upload-URL routes are rate-limited. posts/[id]/media, search, users/search and handle/check have no rate limit. (6) Raw client IPs are kept as rate-limit keys in public.rate_limits (for example pw-reset-ip:<ip>), with opportunistic cleanup after about a day. (7) The privacy policy (effective May 7 2026, marked "baseline draft") names only Supabase, Vercel and R2 as processors. It leaves out Resend, Sentry, Stripe, Firebase/FCM/APNs, Google Fonts and cdnjs. It claims "aggregate usage analytics", but no analytics SDK is present. Terms, Privacy and Child Safety all require 18+, enforced only by a self-attested checkbox (terms_acceptances.age_attested; 15 rows). (8) Sentry runs with sendDefaultPii false, 10% trace sampling in prod and no Replay, and redacts auth tokens and handles from URLs.
