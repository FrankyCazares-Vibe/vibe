# Facts: accounts, sign-in, school-email verification, consent, bans, account deletion  (read on 2026-10-03, main c71e9a4 + landing-night 21af1a5)

How to read this file
- Paths are relative to the repo root. "LAND:" means the file or the lines exist only on branch `landing-night` (goes live next). No prefix means the file is the same on both branches (checked with `git diff main origin/landing-night -- <path>`).
- "LIVE NOW" = true on main today. "LANDING-NIGHT ONLY" = true only after the merge.
- Sources are code, migrations and config only. No database or dashboard was queried. Where a fact depends on a Supabase dashboard setting, it says "DASHBOARD, not in repo".
- `supabase/config.toml` is the LOCAL stack's config. Production auth settings live in the Supabase dashboard. Where they are known to differ, the file's own comments say so and I quote them. A few production settings are recorded in older handoffs; those are in section 4b, marked as dated notes.
- Three texts are compared: the live Privacy page (section 5), the Sept 7 privacy draft (section 6), and, because the user asked for it, the Terms of Service v2 draft of Sept 29 (section 6b).
- Fact numbers run F1 to F118. L = live-page problem, M = missing from the live page, S / X = Sept 7 draft, T = Terms v2 draft, P = surprise, Q = open question.

## 1. What is collected or stored

### 1a. Sign-up (what the form asks for and what the database writes)

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F1 | Sign-up asks for three things only: an email ("Personal email", hint "not your .edu"), a password, and one checkbox. No name, no handle, no date of birth, no phone. | Sent from the browser straight to Supabase Auth (`supabase.auth.signUp`). No Vibe server route sees a sign-up. | Supabase Auth; then see F2 to F6 | `src/app/auth/signup/page.tsx:208-221` (main), LAND: `src/app/auth/signup/signup-form.tsx:280-297`; labels at main `:407-408`, `:441-442` |
| F2 | The checkbox wording: "I'm **18 or older** and I agree to the Terms of Service and Privacy Policy." Submit is disabled until it is ticked. The note under it: "Required — check the box above to create your account." | Not stored as text. It becomes the consent record (F20 to F24). | n/a | main `src/app/auth/signup/page.tsx:466-487`, `:491`, `:528`; same wording on LAND signup-form |
| F3 | Sign-in email. | `auth.users.email` (Supabase Auth) and a copy in `public.users.email`. | `public.users.email`: server code with the service key only. No grant to signed-in users, none to anonymous. The user sees their own in Settings ("Email", hint "Used for sign-in."). | copy made by trigger `handle_new_user`: `supabase/migrations/20260906120000_terms_acceptances.sql:91-103`; grants: `supabase/migrations/20260903100000_security_hardening.sql:34-48` (comment at `:39-40`: "Excludes: email, school_email, otto_answers, otto_settings, voice_samples"); Settings: `src/components/settings/SettingsClient.tsx:469`, `src/app/settings/page.tsx:28-45` |
| F4 | Password. Vibe never stores it. Supabase Auth stores a hash (bcrypt, per the code comment "bcrypt reads only 72"). | `auth.users.encrypted_password` (Supabase Auth's own table, not in this repo). | Supabase Auth only | `src/lib/auth/password-rules.ts:5-9` |
| F5 | A placeholder handle is made at sign-up: the letter `u` plus the account's internal ID with the dashes removed. So until the student picks a handle, their handle IS their internal account ID. | `public.users.handle` | Any signed-in user (column grant) | `supabase/migrations/20260906120000_terms_acceptances.sql:82`; grant `20260903100000_security_hardening.sql:41-48` |
| F6 | A placeholder display name is made at sign-up: the part of the sign-in email before the `@` (or `full_name` / `name` if the sign-up metadata had one; the form sends neither). It stays until onboarding saves a real name. | `public.users.name` | Any signed-in user (column grant), for any account that is not suspended or banned | trigger: `20260906120000_terms_acceptances.sql:104-108` (`split_part(base_email, '@', 1)`); grant `20260903100000_security_hardening.sql:41-48`; row policy `20260923090000_moderation_foundation.sql:2330-2334`; the app knows this default: `src/lib/profile/onboarding-prefill.ts:464-470` |
| F7 | Sign-up metadata sent with the request: `terms_version` (today "2026-05-07") and `age_attested: true`. | `auth.users.raw_user_meta_data` and `auth.identities.identity_data` (Supabase Auth writes sign-up metadata to both, per the LAND migration's own note). It is also inside every session token (JWT `user_metadata`). | Supabase Auth; the signed-in user's own browser (it is in their token) | main `src/app/auth/signup/page.tsx:213-219`; `src/lib/legal/terms.ts:1-3`; LAND: `supabase/migrations/20261003130000_waitlist_code_scrub.sql:4-9` |
| F8 | The sign-up address is remembered in the browser for 24 hours so "send a new email" and the code box are one tap. | Browser `localStorage` key `vibe.pendingSignup.v1` = `{email, at}`. Never sent anywhere new. Cleared when the account is confirmed in that browser, on "Wrong address? Start over", or ignored after 24 h. | That browser only | `src/lib/auth/pending-signup.ts:1-62` |
| F9 | Account created date. | `public.users.created_at` | Any signed-in user (column grant) | `20260903100000_security_hardening.sql:41-48` |

### 1b. Confirming the sign-in email, and password reset

| # | What | Where / how long | Evidence |
|---|---|---|---|
| F10 | A new account must confirm its sign-in email before it can sign in (production). The email has a Confirm link and an 8-digit code. | Sent by Supabase Auth from the template in the repo. The sender shown to students is "noreply@connectvibe.app". Which mail provider Supabase Auth uses in production is DASHBOARD, not in repo (a handoff records Resend SMTP: F114). | config comment "Production has this set to true. Local stays false": `supabase/config.toml:221-223`; template: `supabase/config.toml:249-251`, `supabase/templates/confirmation.html`; copy "We sent a link to … from noreply@connectvibe.app": main `src/app/auth/signup/page.tsx:313-317` |
| F11 | The sign-up code is 8 digits and expires after 1 hour (local config; the file says it matches production's length). | `otp_length = 8`, `otp_expiry = 3600` | `supabase/config.toml:228-232` |
| F12 | Password reset: the student types an email; the answer is always the same sentence, so it cannot be used to learn who has an account: "If an account exists for that email, you'll receive reset instructions shortly." | The reset email is sent by Vibe's server through Resend. The link goes to `/auth/update-password?token_hash=…&type=recovery`. | `src/app/api/auth/password-reset/route.ts:29-33`, `:82-98`; `src/lib/email/resend-transactional.ts:152-191` |
| F13 | Reset email wording: "Only the newest reset email works." | One-time token held by Supabase Auth; lifetime is Supabase Auth's (1 hour locally, F11). | `src/lib/email/resend-transactional.ts:165-172` |

### 1c. Passwords and other sign-in methods

| # | Fact | Evidence |
|---|---|---|
| F14 | Password rule: 8 to 72 characters (72 bytes). Checked in the browser, enforced by Supabase Auth. Hint shown: "8–72 characters". Local config has no character-class rule (`password_requirements = ""`). | `src/lib/auth/password-rules.ts:20-27`; `supabase/config.toml:177-180` |
| F15 | The sign-up page has copy ready for Supabase Auth's breached-password check ("That password has shown up in a data breach. Pick a different one."). Whether that check is switched on in production is DASHBOARD, not in repo (handoffs record it as OFF: F116). | main `src/app/auth/signup/page.tsx:57-58`, `:71-79` |
| F16 | Sign-in is email + password only. NOT FOUND: any Google / Apple / other third-party login, any magic-link sign-in, any phone sign-in. Greps: `signInWithOAuth`, `signInWithOtp`, `signInWithIdToken`, `signInAnonymously` over `src` returned nothing; only `signInWithPassword` (`src/app/auth/login/page.tsx:138`), `verifyOtp`, `resend`, `updateUser({password})`. | grep results; `supabase/config.toml:329-331` (Apple off), `:264-266` (SMS off) |
| F17 | No two-factor / multi-factor sign-in for users. NOT FOUND: grep `\.mfa\.`, `mfa`, `totp`, `2fa`, `two-factor`, `enroll(` over `src` found only an unrelated test file. Local config has TOTP and phone MFA off. | grep; `supabase/config.toml:304-316` |

### 1d. School-email verification

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F18 | The school email address, once the student proves they can read that inbox. Accepted: `@iu.edu` and `@purdue.edu` (subdomains included). Refused: retired IU domains (`@iupui.edu` …), `@pfw.edu`, `@pnw.edu`, every other school. | `public.users.school_email` (lowercased, trimmed). Nothing is written until the link or code is confirmed. | Server code with the service key only. No grant to signed-in users. The user sees their own in Settings ("School email"). | write: `src/lib/auth/school-email-apply.ts:221-229`; "does not mutate DB until confirm": `src/app/api/auth/school-email/request/route.ts:33`; domains: `src/lib/auth/school-email-domains.ts:44`, `:54-70`; grants: `20260903100000_security_hardening.sql:39-48`; Settings `src/components/settings/SettingsClient.tsx:471-472` |
| F19 | A yes/no "school verified" flag. | `public.users.school_verified` | Any signed-in user (column grant). This is the public "verified" badge. | grant `20260903100000_security_hardening.sql:42`; write `school-email-apply.ts:221` |
| F20 | NO date of verification is stored. NOT FOUND: grep `school_verified_at` and `verified_at` over `src` and `supabase/migrations` returned nothing. | n/a | n/a | grep |
| F21 | One school email = one account. Compared in "canonical" form: `name@iu.edu`, `name+2@iu.edu` and `name@mail.iu.edu` count as the same student. Refusal wording: "That school email is already linked to another account." | The check reads every verified `users.school_email` on the server. | Server only | `src/app/api/auth/school-email/request/route.ts:176-226`; `src/lib/moderation/access.ts:330-357`; `src/lib/moderation/identity.ts:80-93` |
| F22 | The verification LINK: valid 48 hours. Not stored in the database. It is a signed token that CONTAINS the account's internal ID and the school email (base64, readable by anyone who has the link, not encrypted) plus an expiry. It rides in the URL: `/auth/verify-school?token=…&next=…`. It only works in a browser signed in as the account that asked. | Nowhere in Vibe's database. It is in the email, and in request URLs (so in hosting request logs). | Anyone holding the link can decode the ID and address; only the right signed-in account can USE it | `src/lib/auth/school-email-token.ts:25-27`, `:46-61` (48 h = `60 * 60 * 48`); URL built at `request/route.ts:246`; "belongs to a different account" check `src/app/api/auth/school-email/confirm/route.ts:63-72` |
| F23 | The verification CODE: 8 digits, good for 30 to 60 minutes (a 30-minute window; the current and the previous window are accepted). Not stored anywhere: recomputed from a server secret + account ID + address + time window. Email wording: "It works for 30 minutes." | Nowhere | n/a | `src/lib/auth/school-email-token.ts:98-105`, `:138-159`; `src/lib/email/resend-transactional.ts:218-224` |
| F24 | The verification email is sent by Vibe's server through Resend to the school address. Resend receives the address, the code and the link. | Resend (third party) | Resend | `src/lib/email/resend-transactional.ts:199-255` |
| F25 | Every send attempt (school verification, password reset) writes one log row: kind, account ID, a keyed hash of the address (never the address), a coarse domain (`iu.edu`, `gmail.com`, or "other"), Resend's message ID, success/failure, error text with addresses redacted, time. | `public.email_sends` | Server / founders with database access only. No grant to any app user. | `supabase/migrations/20260922104000_email_sends.sql:143-166`, `:206-210`; `src/lib/email/send-log.ts:17-45` |

### 1e. University and campus

| # | What | Where | Who can read it | Evidence |
|---|---|---|---|---|
| F26 | University ("iu" or "purdue"), taken from the verified school email's domain. Never typed by the student. | `public.users.school_system` | Any signed-in user | `src/lib/auth/school-email-apply.ts:163`, `:222-229`; grant `supabase/migrations/20260916100000_campuses_school_system.sql:459` |
| F27 | Home campus, chosen by the student from their university's campuses. Not verified. | `public.users.campus_id` | Any signed-in user | same migration `:443-459` |
| F28 | When the campus was last set. | `public.users.campus_set_at` | Server only (no grant). The user sees its effect in Settings. | same migration `:446`, `:453-458` ("Deliberately NO grant on campus_set_at") |
| F29 | Campus change limit is **45 days** (was 30 until late September). UI wording: "You can't change your campus again for 45 days." | constant | n/a | `src/lib/profile/onboarding-prefill.ts:402-403`; `src/lib/profile/settings-campus-card.ts:29-30`, `:86` |
| F30 | Verifying an address at the OTHER university is allowed and changes the university. The campus is kept only if both universities share it, otherwise cleared. | `users.school_system`, `users.campus_id` | as above | `src/lib/auth/school-email-apply.ts:109-113`, `:221-241` |

### 1f. The consent record

| # | What | Where | Who can read it | Evidence |
|---|---|---|---|---|
| F31 | Current consent: the Terms version accepted, when, and when the 18+ box was ticked. | `public.users.terms_version`, `terms_accepted_at`, `age_attested_at` | Server only (no grant to signed-in users). The user cannot read their own through the database API. | `supabase/migrations/20260906100000_terms_acceptance.sql:28-43`; `src/lib/legal/terms.ts:5-6` |
| F32 | Consent history, one row per acceptance, never overwritten: account ID, Terms version, time, `age_attested` (always true), and `source` = "signup" or "interstitial" (the re-consent screen at `/auth/terms`). | `public.terms_acceptances` | Server only (RLS on, no policies, all privileges revoked from app roles) | `supabase/migrations/20260906120000_terms_acceptances.sql:44-60`; writer `src/app/api/me/accept-terms/route.ts:67-73` |
| F33 | NOT stored with consent: IP address, browser details, a copy of the document, a separate Privacy Policy version, date of birth. (Table has exactly the six columns in F32.) | n/a | n/a | same migration `:44-51` |
| F34 | The version string the code records today is **"2026-05-07"** on both branches. It is the TERMS version. The live Privacy page says "effective September 28, 2026"; the live Terms page says "May 7, 2026". Changing the Privacy Policy does NOT re-prompt anyone unless `TERMS_VERSION` is changed. | constant | n/a | `src/lib/legal/terms.ts:1` (same on LAND); `src/app/legal/privacy/page.tsx:20`; `src/app/legal/terms/page.tsx:20` |
| F35 | Consent only counts if all three parts exist AND the version equals the current one. Otherwise every gated page sends the student to `/auth/terms`, and every write route answers 403 `terms_required`. So bumping the version re-prompts every user. | logic | n/a | `src/lib/legal/terms.ts:15-26`; `src/lib/legal/require-terms.ts:27-38`; `src/lib/auth/campus-access.ts:41-43` |
| F36 | Re-consent screen: same checkbox, plus "Don't agree? You can delete your account" (link to Settings) and a sign-out link. | n/a | n/a | `src/app/auth/terms/accept-terms-form.tsx:169-227` |

### 1g. Sessions, cookies and browser storage (sign-in only)

| # | Fact | Evidence |
|---|---|---|
| F37 | The only cookies Vibe's code sets are Supabase's session cookies, named `sb-<project>-auth-token` (split into `.0`, `.1` … when long), plus a short-lived `…-code-verifier` cookie while an email link sign-in is in flight. NOT FOUND: any other cookie. Grep `document.cookie`, `cookies.set(`, `cookieStore.set(` over `src` and `public/html` hits only `src/lib/supabase/*` and `src/proxy.ts:202` (which copies the same cookies onto a redirect). | `src/lib/supabase/browser.ts:11-16`, `server.ts:18-34`, `middleware.ts:19-33` |
| F38 | Cookie settings (library defaults, not overridden): path `/`, `SameSite=Lax`, NOT HttpOnly (page scripts can read it), lifetime 400 days. | `node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11` (@supabase/ssr 0.6.1) |
| F39 | What is inside the cookie: Supabase's access token (a JWT, 1 hour life locally) and a refresh token (rotated on use). The JWT carries the account ID, sign-in email, the sign-up metadata (F7) and `app_metadata`, which holds the suspension/ban marker when there is one (F48). (The `user_metadata` part is confirmed by the LAND scrub migration's note; that `app_metadata` rides in the token is how Supabase tokens normally work and is not shown in this repo.) Production token lifetimes and any session time limit are DASHBOARD, not in repo (the local file has `[auth.sessions]` commented out). | `supabase/config.toml:160`, `:166-169`, `:279-283`; `src/proxy.ts:71-82` |
| F40 | There is NO CSRF cookie. NOT FOUND: a case-insensitive grep for `csrf` or `xsrf` over `src` and `next.config.ts` hits only the live Privacy page's own sentence (`src/app/legal/privacy/page.tsx:66`) and one comment in `src/lib/push/device-address.ts:266` (a header/origin check, not a cookie). | grep; F37 |
| F41 | "Sign out" signs the account out EVERYWHERE, not just on this browser: the route calls `signOut()` with the library default, which is scope "global" (ends every session of that account). It also deletes every push-notification device registered to the account. The button's own description says something narrower: "End your session on this browser. You can sign back in any time." | `src/app/api/auth/logout/route.ts:28-34`, `:84-87`; `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3143`, `:3176`; wording `src/components/settings/SettingsClient.tsx:1255` |
| F42 | There is no separate "sign out of other devices" control and no list of active sessions for the user. NOT FOUND: grep `scope: "others"` and `auth.sessions` in `src` (only a migration comment mentions `auth.sessions`). Two email-link error screens sign out THIS browser only (`scope: "local"`), when a link was opened under the wrong account. | grep; `src/app/auth/verify-school/page.tsx:258`; `src/components/auth/EmailLinkProblem.tsx:98` |
| F43 | On sign-out and on account deletion the browser clears these `localStorage` keys: `vibe_user_v1`, `vibe_posts_v1`, `vibe_vibes_v1`, `vibe_relationships_v1`, `vibe_otto_lastpost_v1`, `vibe_otto_v1`, `vibe_cal_events_v1`, `vibe_recent_searches_v1`, the push-device keys, `vibe_push_ask_v1`, `vibe_first_dm_ask_v1`, and the onboarding draft. Kept on purpose: the `*_tour_seen_v1` flags and `vibe_push_taps_v1` (message IDs only). | `src/lib/pwa/leave-device-clean.ts:33-53`, `:66-82` |

### 1h. Suspensions and bans, as they touch identity (LIVE NOW; shipped after the Sept 7 draft)

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F44 | A suspension (has an end date, 1 to 365 days) or a ban (no end date). One row per identity key (F45): the kind, start, end, a reason code, a private moderator note (up to 2,000 characters), which moderator did it, and, if lifted, when and by whom. | `public.account_restrictions` | Server only: RLS on, no policies, all privileges revoked from `anon` and `authenticated`. Platform admins see the history (including the note) through `/api/admin/users/[id]`. The student sees kind, end date and the reason in plain words, never the note. | `supabase/migrations/20260923090000_moderation_foundation.sql:1828-1866`; admin read `src/app/api/admin/users/[id]/route.ts:106-108`; student view `src/app/account/suspended/page.tsx:243-248`, `src/lib/moderation/access.ts:54-55` |
| F45 | Each restriction is filed under a "scrambled code": HMAC-SHA256 of the canonical email, keyed with a server secret (`RESTRICTION_PEPPER`, min 32 characters). Up to TWO rows are written per restriction: one for the SCHOOL email (`key_kind = 'school'`; `+tags` dropped, subdomains folded, so `a+2@mail.iu.edu` = `a@iu.edu`) and one for the SIGN-IN email (`key_kind = 'personal'`; lowercased and trimmed only). The address itself is not stored in this table. | `account_restrictions.identity_key`, `.key_kind` | Server only. The admin API deliberately never returns it ("NO EMAIL, EVER, AND NO `identity_key`"). | `src/lib/moderation/identity.ts:80-93`, `:115-125`; `src/lib/moderation/actions.ts:156-171`, `:394-408`; `src/app/api/admin/users/[id]/route.ts:51-54` |
| F46 | Is each hash actually CHECKED? **School hash: yes, in exactly one place**, school-email verification (both when the email is requested and again when the link or code is confirmed). A match answers 403: "This school email can't be used on Vibe. Questions: help@connectvibe.app". **Sign-in-email hash: no, it is never checked anywhere.** The code calls it "EVIDENCE ONLY in v1 and nothing tests it". A banned person can sign up again with the same sign-in email; what they cannot do is verify the same school email, so the new account cannot post, comment or message. | n/a | n/a | checked: `src/lib/moderation/access.ts:263-302`, called from `src/lib/auth/school-email-apply.ts:93-99`, `:218-219` and `src/app/api/auth/school-email/request/route.ts:232-235`; never checked: `src/lib/moderation/actions.ts:145-151`, `20260923090000_moderation_foundation.sql:398-404`. Grep `key_kind` over `src`: the only read filter is `.eq("key_kind", "school")` at `access.ts:277` |
| F47 | The school-email check does NOT look at whether the row is a ban or a suspension. Any restriction in force on that school identity (not lifted, started, not past its end date) blocks verification. So a suspended student who deletes and re-registers also cannot verify until the suspension would have ended. | n/a | n/a | `src/lib/moderation/access.ts:273-280` (no `.eq("kind", …)`) |
| F48 | A copy of the restriction (`{kind, ends_at}` only) is written into the account's Supabase Auth `app_metadata`. The site reads it on every request to send the student to `/account/suspended`. Because `app_metadata` is part of the session token, it sits in the student's own cookie. | `auth.users.raw_app_meta_data.restriction` | Supabase Auth; the student's own browser | `src/lib/moderation/actions.ts:191-212`, `:423`; `src/proxy.ts:71-82`, `:239-249` |
| F49 | A ban does NOT block sign-in. Vibe never sets Supabase Auth's own ban (it clears one if present). A suspended or banned student can still: sign in, read the notice, read `/legal/*`, sign out, delete the account, open the Vibe+ billing portal, remove a push device, block and mute. Everything else that writes is refused; every other page redirects to the notice. | n/a | n/a | `src/lib/moderation/actions.ts:34-39`, `:228-242`; `src/proxy.ts:142-157`, `:175-181` |
| F50 | While restricted, the student's profile, posts and comments are hidden from everyone else. Notice wording (suspension): "While it's paused, your profile, posts and comments aren't visible to anyone else on Vibe. Nothing is deleted". Ban: "A Vibe moderator closed this account, for good — there's no end date on it." | n/a | n/a | `src/app/account/suspended/page.tsx:316-347` |
| F51 | Appeals: there is no appeal form and no appeals table. The notice says: "If you think we got this wrong, email help@connectvibe.app and tell us what we missed. A person reads it." So an appeal is an email, held in the support inbox. NOT FOUND: grep -i `appeal` in `supabase/migrations` for a table (comments only). | support inbox (outside the app) | whoever reads help@connectvibe.app | `src/app/account/suspended/page.tsx:353-367`, `:19` |
| F52 | Restricting an account also deletes every push-notification device row for it, and a BAN (not a suspension) deletes the Stripe customer, which cancels Vibe+ with no refund. (Billing and push are OFF in production today.) | `push_devices`, Stripe | n/a | `src/lib/moderation/actions.ts:256-265`, `:282-325`, `:436-441` |
| F53 | Every suspend / ban / lift is also written to an append-only log: who did it (moderator's internal ID), the action, the target's internal ID, the reason, and `meta` including the student's HANDLE at the time. No email. The log has no foreign keys and cannot be edited or deleted by anyone, including the server. | `public.moderation_actions` | Server / platform admins | `20260923090000_moderation_foundation.sql:1894-1958`; `src/app/api/admin/users/[id]/restrict/route.ts:177-190` |

### 1i. Rate-limit counters that hold an IP address or an email-derived key

| # | Action | Key stored | Limit | Evidence |
|---|---|---|---|---|
| F54 | Password-reset request (signed out) | `pw-reset-ip:<the full IP address>` (IPv4 or IPv6, exactly as received) | 5 per 15 min | `src/app/api/auth/password-reset/route.ts:35-39`; `src/lib/rate-limit.ts:52-60` |
| F55 | Password-reset request (signed out) | `pw-reset-email:<keyed hash of the address>`. NOT the address. (Before Sept 22 it was the plain address; that migration deleted those rows.) | 3 per hour | `password-reset/route.ts:54-61`; `supabase/migrations/20260922104000_email_sends.sql:21-23`, `:213` |
| F56 | School-verification email request (signed in) | `school-email:<account ID>` and `school-email-ip:<network>`, where network = the IPv4 address as is, or the first 64 bits of an IPv6 address | 3 per hour per account; 60 per hour per network | `src/app/api/auth/school-email/request/route.ts:150-174`; `src/lib/rate-limit.ts:62-93` |
| F57 | Typing the school code (signed in) | `school-code:<account ID>` and `school-code-ip:<network>` | 5 per 15 min; 150 per hour | `src/app/api/auth/school-email/confirm-code/route.ts:109-127` |
| F58 | Accepting the Terms, changing a handle, saving an onboarding step | keyed by account ID only | 10 / 10 min; 10 / 10 min; 30 / 10 min | `src/app/api/me/accept-terms/route.ts:42`; `src/app/api/me/handle/route.ts:31`; `src/app/api/me/onboarding-step/route.ts:30-31` |
| F59 | Sign-up and sign-in themselves (they go from the browser straight to Supabase Auth, so Vibe's own limiter never sees them) | Held by Supabase Auth, per IP | Local config: 30 sign-ups/sign-ins per 5 min per IP, 2 emails per hour. Production values are DASHBOARD, not in repo. | `supabase/config.toml:192-204`; `src/app/auth/login/page.tsx:138` |
| F60 | Where Vibe's own counters (F54 to F58, F61) live, and for how long | Table `public.rate_limits (key, window_start, count)`. Server only (RLS on, all privileges revoked from app roles). | No scheduled cleanup. On each call there is a 1-in-100 chance that rows older than ONE DAY are deleted. So at low traffic a row (with its IP) can stay for days or weeks. | `supabase/migrations/20260903100000_security_hardening.sql:279-324` (cleanup at `:314-317`); "can outlive a deleted account by weeks": `20260922104000_email_sends.sql:26-37` |
| F61 | LANDING-NIGHT ONLY: the waitlist form and its links (signed out). Detail belongs to the waitlist reader. | `waitlist-net:<network>`, `waitlist-confirm-net:<network>`, `waitlist-token-net:<network>`, `waitlist-email:<keyed hash>`, on the same table | 30 per hour per network for the form; 60 per hour for the token links; 3 per day per address | LAND: `src/app/api/waitlist/route.ts:79-80`, `:124`, `:165`; `src/app/api/waitlist/confirm/route.ts:28` |

### 1j. The access-code gate at sign-up (LANDING-NIGHT ONLY; nothing in this block is live today)

On main today anyone can open `/auth/signup` and make an account (F1). After the merge, sign-up is closed by default (`app_settings.signup_open = false`) and a new account needs an access code from the waitlist invite email, unless the address is on an allow list.

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F62 | A fourth sign-up field appears while sign-up is closed: "Access code" (hint "from your invite email", placeholder "VIBE-XXXX-XXXX"). The invite email's button fills it from `?access_code=` and the page then removes it from the address bar. | Sent to Supabase Auth inside the sign-up metadata as `access_code`. | Supabase Auth | LAND: `src/app/auth/signup/signup-form.tsx:496-519`, `:181-188`, `:290-295`; `src/app/auth/signup/page.tsx:20-27`, `:39-42` |
| F63 | What of the TYPED code is kept: a database trigger swaps the typed code for its SHA-256 hash before the account row is written, on both Supabase Auth tables that hold sign-up metadata. So the account keeps `access_code_hash`, not the code. An invalid code keeps nothing. | `auth.users.raw_user_meta_data.access_code_hash`, `auth.identities.identity_data.access_code_hash` | Supabase Auth; it is in the user's own session token (`user_metadata`) | LAND: `supabase/migrations/20261003130000_waitlist_code_scrub.sql:54-76`, `:108-116` |
| F64 | One exception the migration states itself: the FIRST session token right after sign-up still carries the plain code ("built from GoTrue's memory and handed to the person who typed the code"); every refreshed token carries only the hash. My inference, not stated in code: in production a new account gets no session until it confirms its email, so this mostly applies to local/dev. | the first JWT, in that person's browser | that person | LAND: `20261003130000_waitlist_code_scrub.sql:19-22` |
| F65 | The scrub file is separate on purpose: "If the hosted project refuses that, 20261003120000 still stands on its own and this file can wait (its absence only means the plain code is kept)." So whether the code is hashed in production depends on this migration actually being applied. | n/a | n/a | LAND: `20261003130000_waitlist_code_scrub.sql:24-26` |
| F66 | The gate runs inside Supabase Auth, before any account exists (a "before user created" hook). When it accepts a code it writes the SIGN-IN EMAIL, in plain text, and the time, onto that person's waitlist row. | `public.waitlist.code_claimed_email`, `.code_claimed_at` | Server only (RLS on, all privileges revoked from app roles) | LAND: `supabase/migrations/20261003120000_waitlist_hardening.sql:136-222` (claim at `:188-199`); table `20261003100000_waitlist.sql:197-199`, `:221-225` |
| F67 | When the account is created, the waitlist row is marked used and LINKED to the new account. This ties the waitlist entry (school email, name, year, major, clubs, free-text answer) to the account's internal ID and sign-in email until that row is deleted: about 38 to 40 days after the person joined the list, or at account deletion (F90, F95). | `public.waitlist.redeemed_at`, `.redeemed_user_id` | Server only | LAND: `20261003120000_waitlist_hardening.sql:312-331` |
| F68 | A small "cohort tag" is written for the new account: batch name, how they came in ("form" or "founder"), the day invited, the day joined. No name, address or answers. It stays for the life of the account. | `public.user_cohorts` | Server only (RLS on, nothing for app roles) | LAND: `supabase/migrations/20261003140000_waitlist_retention.sql:78-90` |
| F69 | An allow list of sign-in emails that skip the gate, in plain text, with a reason ("review", "founder", "manual") and an optional note. | `public.signup_allowlist` | Server only | LAND: `20261003100000_waitlist.sql:150-159`, `:221-225` |
| F70 | What the code itself is: "VIBE-" plus 8 random characters, good for 14 days (less if the waitlist entry is deleted first). Only its hash is stored on the waitlist row. | `public.waitlist.code_hash` | Server only | LAND: `src/lib/waitlist/access-code.ts:6-19`; `20261003140000_waitlist_retention.sql:39-40` |
| F71 | Refusal messages a visitor can get from the gate: "Vibe is opening in waves. Enter the access code from your invite email." / "That access code is not one we know." / "…has already been used to make an account." / "…has expired." / "…is being used with a different email right now." | n/a | n/a | LAND: `20261003120000_waitlist_hardening.sql:176-222` |
| F72 | Not gated: accounts made by the founders with the admin API (`auth.admin.createUser`), sign-in, and password reset. | n/a | n/a | LAND: `20261003120000_waitlist_hardening.sql:34-41` |
| F73 | After deleting an account, LAND sends the browser to `/` (the landing page). Main sends it to `/auth/signup`. | n/a | n/a | `git diff main origin/landing-night -- src/app/account/suspended/suspended-actions.tsx` (`AFTER_DELETE`) |

## 2. Who can see it

Short version, by audience. "Signed-in user" below means any signed-in account talking to the database API directly, which is the real boundary (the app's own screens show less).

**Anyone on the internet (no account)**
- F74. Nothing in this area from the database: `anon` has no privileges at all on `public.users` (`20260903100000_security_hardening.sql:34`). What a logged-out visitor sees of a profile comes through server routes and belongs to the profiles reader.
- F75. LANDING-NIGHT ONLY: whether sign-up is open (`signup_is_open()` is callable with the public key; "it is public information"). LAND: `src/lib/waitlist/use-signup-open.ts:9-13`.
- F76. LANDING-NIGHT ONLY, an accepted side effect the migration documents: while sign-up is closed, Supabase Auth's sign-up endpoint answers a NEW address with 403 "access code required" and an EXISTING address the way it always has, "so it tells whether an address has an account without emailing anyone". Mitigation named: the hosted sign-up rate limit; CAPTCHA "is the next step if that is not enough". LAND: `20261003120000_waitlist_hardening.sql:42-47`.

**Every signed-in user (database column grants)**
- F77. Of the columns in this area, a signed-in user can read on ANY visible account: `id`, `handle`, `name`, `school_verified`, `school_system`, `campus_id`, `school` (campus label), `created_at`, `last_active_at`, `handle_changed_at`. Evidence: `20260903100000_security_hardening.sql:41-48`; `20260916100000_campuses_school_system.sql:459`. "Visible" = not suspended or banned, or it is your own row: `20260923090000_moderation_foundation.sql:2330-2334`.
- F78. NOT readable by a signed-in user, even for their own row, through the database API: `email`, `school_email`, the three consent columns, `campus_set_at`, `is_platform_admin`, `otto_answers`. Evidence: `20260903100000_security_hardening.sql:39-40`, `:50-52`; `20260906100000_terms_acceptance.sql:28-31`; `20260916100000_campuses_school_system.sql:456-458`; `20260927141000_users_platform_admin_flag_server_only.sql:124`. The user sees their own email and school email only because the Settings page reads them on the server: `src/app/settings/page.tsx:28-45`, `:115-116`.

**Club officers**: nothing extra in this area.

**The other person**: nothing extra in this area. No other user ever sees either full email address. One exception to keep in mind: the part of the sign-in email before the `@` is the default display name until the student changes it (F6).

**Platform admins (the moderation screens)**
- F79. For one account: internal ID, handle, name, school-verified flag, admin flag, created date, the restriction in force, the count of open reports, the full restriction history (kind, dates, reason code, private note, who set and lifted it), and the moderation log about that account. Never the email, never the identity hash. `src/app/api/admin/users/[id]/route.ts:45-72`, `:106-108`.
- Who is a platform admin: `users.is_platform_admin = true`, set only with database access. `src/lib/auth/require-platform-admin.ts:51-63`.

**Only the server / whoever has database and dashboard access**
- F80. Sign-in email, school email, consent record and history, `campus_set_at`, `account_restrictions` (with the hashes and notes), `moderation_actions`, `email_sends`, `rate_limits`, and on LAND `waitlist`, `signup_allowlist`, `user_cohorts`, `app_settings`. Plus everything Supabase Auth keeps in its own `auth` schema (password hash, sessions, tokens, metadata).

## 3. How long it is kept and what deletes it

### 3a. Lifetimes of links, codes and counters

| # | Thing | Lifetime | Evidence |
|---|---|---|---|
| F81 | School-verification link | 48 hours | `src/lib/auth/school-email-token.ts:49`; email text "The link works for 48 hours." `src/lib/email/resend-transactional.ts:227` |
| F82 | School-verification code | 30 to 60 minutes (30-minute windows; current + previous accepted) | `src/lib/auth/school-email-token.ts:98-105`, `:145-158` |
| F83 | Sign-up confirmation code / link and password-reset link | 1 hour in the local config (`otp_expiry = 3600`). Production value is DASHBOARD, not in repo. | `supabase/config.toml:231-232` |
| F84 | Remembered sign-up address in the browser | 24 hours | `src/lib/auth/pending-signup.ts:13` |
| F85 | Session cookie | up to 400 days in the browser; the access token inside lasts 1 hour (local config) and is refreshed | F38, F39 |
| F86 | Rate-limit counters (incl. IP addresses) | no fixed time; removed "opportunistically" once older than 1 day (1% chance per limiter call). No scheduled job. | F60 |
| F87 | Email send log | no automatic deletion. The migration says "Retention (manual …): DELETE … older than 180 days" by hand. | `supabase/migrations/20260922104000_email_sends.sql:123-124`, `:169` |
| F88 | Suspension | ends on its own at `ends_at`; nothing needs to run. The row itself is kept as history. | `src/lib/moderation/access.ts:82-85` |
| F89 | Ban, and every past restriction row | kept with no end date and no deletion code. NOT FOUND: any delete of `account_restrictions` in `src` (grep `account_restrictions` shows only select / insert / update). | grep; `src/lib/moderation/actions.ts:394-408`, `:501-510` |
| F90 | Access code (LAND) | 14 days, or until its waitlist entry is purged (about 38 to 40 days after the person joined the list), whichever is first | LAND: `src/lib/waitlist/access-code.ts:18`; `src/lib/waitlist/store.ts:339-347` |
| F91 | Scheduled clean-up jobs | On main, NONE exist (no `vercel.json`, no `src/app/api/cron`). On LAND, exactly one: the daily waitlist purge at 08:17 UTC. Nothing scheduled touches accounts, restrictions, the email log or rate limits. | `ls vercel.json` / `ls src/app/api/cron` fail on main; LAND: `vercel.json` |
| F92 | Accounts that never confirm their email, or never finish verification or onboarding | Kept with no time limit. NOT FOUND: grep `email_confirmed_at`, `last_sign_in_at`, "inactive" in `src` shows no purge. They keep the sign-in email, the placeholder name (F6) and the consent record until someone deletes them. | grep |

### 3b. Account deletion, end to end (LIVE NOW unless marked)

**Where the button is.** Settings ("Danger zone" → "Delete your account" → "Delete account…" → type the handle → "Permanently delete"); the "Verify your campus" screen; the phone onboarding account sheet; the suspended/banned notice. `src/components/settings/SettingsClient.tsx:1342-1465`; `src/app/account/suspended/suspended-actions.tsx:131-136`; `src/app/auth/school-email/page.tsx:731-734`; `src/components/mobile/onboarding/OnbHeader.tsx`.

**What confirmation it asks for.**
- F93. Type your handle. Settings: "Type your handle **@handle** to confirm." If the handle is still the sign-up placeholder (F5), the other screens ask for the word "delete" instead, and still send the real handle to the server. No password prompt, no email confirmation, no waiting period. `SettingsClient.tsx:1286-1297`, `:1405-1407`; `suspended-actions.tsx:23-32`, `:162-166`, `:221-227`; server check `src/app/api/me/route.ts:75-99`.
- F94. Settings' own summary line: "Permanently removes your profile, posts, comments, reactions, connections, RSVPs, messages, and chat reactions. This can't be undone." `SettingsClient.tsx:1366-1367`.

**The order the server works in** (`src/app/api/me/route.ts`):
1. Check the session and the typed handle (`:59-99`).
2. Stop Vibe+ billing: delete the Stripe customer, which cancels every subscription with no refund. If Stripe cannot confirm, answer 503 and delete NOTHING: "We couldn't close your Vibe+ subscription, so your account wasn't deleted." (`:109-111`, `:156-218`). Billing is OFF in production, so today this step finds no customer and passes.
3. Files: first MOVE evidence files to a private "quarantine" bucket (media of posts a moderator removed, of posts with an open or actioned report, and the current photo and cover if a report about the account is open), then erase everything else the user uploaded: `profiles/<id>/**`, `resumes/<id>/**`, R2 `clips/<id>/*`, and the R2 chat files their own messages point at. If any of this fails the account is NOT deleted and the user retries. (`:113-131`; `src/lib/profile/storage-purge.ts:354-382`, evidence rules `:271-341`.)
4. F95. LANDING-NIGHT ONLY: forget the waitlist entry this account's access code redeemed (school address, name, answers) and its send-log hashes. Best effort; a database trigger also deletes that row and clears any claim made with this sign-in email. LAND: `src/app/api/me/route.ts:138-147`; `supabase/migrations/20261003120000_waitlist_hardening.sql:477-502`.
5. Delete the Supabase Auth user. The `public.users` row and everything with a cascading foreign key goes with it (`:136-149`). If this fails after the files are gone: "Your uploaded files were removed, but the account itself couldn't be deleted. Please try again".
6. Sign the session out and clear the device (`:151`; F43).

**What is deleted with the account (this area).**
- F96. Sign-in email and school email on `public.users`; password hash and sign-up metadata in Supabase Auth; the consent columns AND the whole consent history (`terms_acceptances … ON DELETE CASCADE`, `20260906120000_terms_acceptances.sql:46`); campus and university; push devices (`20260924120000_push_notifications.sql:462`); the Stripe customer mapping (`20260922150000_billing_stripe.sql:228`); on LAND the cohort tag (`20261003140000_waitlist_retention.sql:79`) and the redeemed waitlist row (F95).

**What survives account deletion (this area).**
- F97. **The suspension/ban record.** `account_restrictions.user_id` is set to empty; the row stays with both scrambled codes (school and sign-in email), kind, dates, reason code and the private note. This is deliberate: it is what stops the school email being verified on a new account. No end date, no deletion code. `20260923090000_moderation_foundation.sql:1808-1832`; F89.
- F98. **The moderation log.** No foreign keys, cannot be edited. Keeps the old internal ID and the handle as it was. `20260923090000_moderation_foundation.sql:1871-1958`.
- F99. **The email send log.** The row stays with kind, coarse domain (e.g. `iu.edu`), Resend's message ID, outcome and time. The account ID and the address hash are wiped by a trigger. `20260922104000_email_sends.sql:147`, `:188-204`.
- F100. **Rate-limit rows** keyed by the account ID, by IP, or by the email hash stay until the opportunistic cleanup (F60). The migration says so itself: "it can outlive a deleted account by weeks".
- F101. **Supabase Auth's own audit log**, if production writes it to the database: it has no link to the account, "so deleteUser leaves its rows, which carry the email address … and, on hosted Supabase, the IP address." Whether production writes it and for how long is an open TODO in the code. `src/app/legal/delete-account/page.tsx:44-54`.
- F102. **Resend** keeps its own record of emails sent to the address (under the message ID in F99). `src/app/legal/delete-account/page.tsx:40-43`.
- F103. **The handle** becomes free at once. NOT FOUND: any reserved-after-deletion list (grep `handle_history`, `old_handle`, `previous_handle`, `reserved_handles` over `src` and `supabase/migrations`: nothing). Same when a handle is changed (14-day cooldown on changing again, but the old handle is free immediately). `src/lib/profile/handle.ts:10-12`; `src/lib/profile/handle-change.ts:134-152`.
- F104. Outside this area but kept (listed on the live delete page): reports about the user with a snapshot of name and handle; reports the user filed (reporter cleared); quarantined photos and videos; Stripe's and our billing-event records; a club the user started. `src/app/legal/delete-account/page.tsx:171-234`. Those belong to the moderation and billing readers.

## 4. Third parties that receive it

| # | Who | What they get (this area) | Evidence |
|---|---|---|---|
| F105 | **Supabase** (database + Supabase Auth) | Everything in sections 1a to 1j: sign-in email, password hash, session tokens, sign-up metadata, school email, consent record, restriction records, email log, rate-limit keys (IP addresses). Supabase Auth also receives every sign-up and sign-in request directly from the browser (so it sees the IP and browser of each one). | `src/lib/supabase/browser.ts:11-16`; `src/app/auth/login/page.tsx:138`; F1 |
| F106 | **Resend** (email sending) | Password-reset email: the sign-in address and the reset link. School-verification email: the school address, the 8-digit code, and the link (which contains the account ID and the school address, F22). Resend keeps its own log. Also the "New report on Vibe" alert to platform admins. LANDING-NIGHT ONLY: the two waitlist emails. | `src/lib/email/resend-transactional.ts:152-255`; `src/lib/email/send-log-core.ts:35-43`; LAND diff of the same file adds `waitlist_confirm`, `waitlist_invite` |
| F107 | **Whoever delivers Supabase Auth's own emails** (the sign-up confirmation) | The sign-in address, the confirm link and the 8-digit code. Not in the repo (the local file's SMTP block is commented out). A handoff records that production uses Resend's SMTP for this since Sept 6 (F114). | `supabase/config.toml:234-242`, `:249-251` |
| F108 | **The student's university mail system** (IU / Purdue) | Only by receiving the verification email: it can see that Vibe emailed that student, and the email's contents. Vibe sends the university nothing else. | F24 |
| F109 | **Vercel** (hosting) | Runs every server route above. Its request logs see the IP address, the path and browser details of each request. The school-verification link and the password-reset link carry their tokens in the URL query string (`?token=…`, `?token_hash=…`); the pages strip them from the address bar after reading. | URL shape: `src/app/api/auth/school-email/request/route.ts:246`, `src/app/api/auth/password-reset/route.ts:95`; stripping: `src/app/auth/verify-school/page.tsx:77`, `src/app/auth/update-password/page.tsx:416` |
| F110 | **Stripe** | At account deletion or a ban: a "delete this customer" call for an account that ever checked out. Stripe keeps its own payment records. Billing is OFF in production today, so today nothing is sent. | `src/app/api/me/route.ts:184-218`; `src/lib/moderation/actions.ts:282-325` |
| F111 | **Google Fonts** | The reset and verification emails link a Google Fonts stylesheet. A mail app that loads remote styles (the code comment names Apple Mail) contacts Google when the email is opened. | `src/lib/email/resend-transactional.ts:16-18`, `:91` |
| F112 | **Sentry** (error reports) | Auth link tokens (`token`, `token_hash`, `code`, `access_token`, `refresh_token`; on LAND also `access_code`) and handles are scrubbed from URLs and captured bodies before an error report leaves. Detail belongs to the vendors reader. | `src/lib/sentry-config.ts:11-45`, `:88-105`; LAND diff adds `access_code` |
| F113 | **Indiana University / Purdue University as institutions** | Nothing. NOT FOUND: any call to a university system in the auth code. | read of `src/app/api/auth/**`, `src/lib/auth/**` |

### 4b. Production settings recorded in earlier handoffs (dated notes, NOT code; re-check before relying on them)

| # | Recorded fact | Source |
|---|---|---|
| F114 | Supabase Auth in production sends its emails through **Resend SMTP** (host smtp.resend.com, sender noreply@connectvibe.app), set up Sept 6. So the sign-up confirmation also goes through Resend. | `handoffs/2026-09-04-session-53-private-resumes.md:130` |
| F115 | "Confirm email" is ON in production since Sept 6; the email code/link lifetime is 3,600 s (1 hour); minimum password length 8; Auth's email cap raised to 30 per hour. | same file `:127`, `:130`, `:186` |
| F116 | Leaked-password checking is NOT on: it needs a paid Supabase plan, and the organisation was on the **Free** plan (Sept 6, repeated in the Sept 29 audit). | same file `:128`; `handoffs/legal-2026-09-29/00-code-facts.md:56` |
| F117 | `hello@connectvibe.app` is forwarded by Cloudflare Email Routing to a founder's Gmail inbox (Sept 7). Where `help@connectvibe.app` lands is NOT FOUND in the files I read. | same file `:131` |
| F118 | The sign-in email copy in `public.users.email` is written once at sign-up and "never re-synced". No app screen changes the sign-in email, but Supabase Auth's own change-email endpoint "is not blocked by app code", so a signed-in user could call it directly; then `public.users.email` (and the sign-in-email ban hash built from it) "would go stale". | `handoffs/legal-2026-09-29/00-code-facts.md:60-70`; consistent with my grep (only `updateUser({ password })`, `src/app/auth/update-password/page.tsx:380`) |

## 5. Live page: claims that are false or missing

Live page = `src/app/legal/privacy/page.tsx` (effective "September 28, 2026"). Line numbers are that file's.

**False or misleading**
- L1 (`:65-67`) "strictly necessary cookies for sign-in sessions and CSRF protection": there is no CSRF cookie. Only Supabase session cookies exist (F37, F40).
- L2 (`:36-37`) "school-verified ".edu" email": not any .edu. Only `@iu.edu` and `@purdue.edu` (F18).
- L3 (`:60-63`) "approximate location derived from IP": NOT FOUND in code. Grep `x-vercel-ip`, `geoip`, `request.geo`, `geolocation(` over `src`: nothing. In this area an IP is only used as a rate-limit key (F54 to F57).
- L4 (`:75`) "account-related emails (verification, password reset, security notices)": no "security notice" email exists in code. The kinds sent are sign-up confirmation, school verification, password reset, a report alert to admins, and on LAND two waitlist emails (F106, F107). The "password changed" notification is commented out in config (`supabase/config.toml:258-262`).
- L5 (`:145-148`) "When you delete your account, we remove your data from our live systems immediately": not all of it. The suspension/ban record with both scrambled emails, the moderation log, parts of the email log, rate-limit rows and the sign-in provider's audit log stay (F97 to F102). The page's next paragraph half-says this; the first sentence still reads as absolute.
- L6 (`:151-155`) "retaining a record of a banned account's identifier so the same actor can't simply re-register": three things off. (a) What is kept is a keyed hash, not an identifier (F45). (b) It is kept for suspensions too, and blocks during an active suspension (F47). (c) It does NOT stop re-registering; it stops the school email being verified again (F46, F49). Also unsaid: a hash of the SIGN-IN email is stored and never used for anything (F46).
- L7 (`:147-148`) "Encrypted backups may retain copies for up to 30 days": no evidence in the repo. The delete page's own TODO says there is "no backup-retention number until you confirm the Supabase plan's backup window" (`src/app/legal/delete-account/page.tsx:47-49`), and the Sept 7 draft says there are no automated backups. Three texts, three answers.
- L8 (`:167-169`) "turn on multi-factor authentication if your account email supports it": Vibe itself has no two-factor sign-in (F17). The sentence can be read as if Vibe offers it.
- L9 (`:174-177`) "users 18 and older who are affiliated with a U.S. college": the code only admits IU and Purdue addresses (F18). "We do not knowingly collect information from anyone under 13" sits oddly beside an 18+ rule; the only age control is the checkbox (F2).
- L10 (`:182-183`) "we'll give you reasonable notice (in-app or by email)": the only mechanism in code is the re-consent screen when `TERMS_VERSION` changes (F35). It is still "2026-05-07" while this page says September 28, so nobody was re-prompted for this version (F34). No email-notice code exists.
- L11 (`:117-125`) Delete "From Settings → Danger zone": true, but there are three more places (verify-campus screen, phone onboarding, the suspended notice) and an email route (help@), and a restricted student cannot open Settings at all (F49). The page never links to `/legal/delete-account`, which is the accurate text.
- L12 (`:130-135`, `:190-194`) contact is `hello@connectvibe.app`; every in-app support, appeal and deletion line says `help@connectvibe.app` (grep: 12 files use help@, 4 use hello@).
- L13 (`:28-31`) the page still calls itself "a baseline draft … Review with qualified legal counsel before broad public launch".
- L14 (`:24-25`) "By using Vibe, you agree": the code requires an explicit tick and records it (F2, F31, F32); the page never mentions that record.

**Missing (in this area)**
- M1. Password: that Supabase Auth holds a hash, the 8 to 72 rule, no two-factor (F4, F14, F17).
- M2. The consent record and its history: what is stored and what is not (F31 to F33).
- M3. University and campus, the 45-day campus rule, and that campus is self-chosen (F26 to F30).
- M4. How school verification works: link 48 h, code 30 to 60 min, nothing stored until confirmed, one student one school email (F18 to F23).
- M5. The whole suspension/ban system: the record, the two scrambled emails, what a restricted person can still do, appeal by email, profile hidden while restricted (F44 to F53).
- M6. Verify-before-posting: an account without a verified school email cannot post, comment or message (`src/lib/moderation/access.ts:208-221`).
- M7. Session facts: cookie name and 400-day life, "Sign out" ends every session (F37 to F41).
- M8. The email send log and the rate-limit counters holding IP addresses, with no fixed deletion time (F25, F54 to F60).
- M9. Resend, Sentry, Stripe and Google Fonts are not in the service-provider list (`:89-94` names only Supabase, Vercel, Cloudflare R2).
- M10. The placeholder name made from the sign-in email (F6).
- M11. LANDING-NIGHT ONLY: the access code, the link from waitlist entry to account, the cohort tag, the allow list (F62 to F72).
- M12. Accounts that never confirm are kept (F92).

## 6. Sept 7 draft: claims that are stale, false or missing

Draft = `handoffs/legal-drafts/2026-09-07-privacy-policy.md`. "§" and line numbers are that file's.

**Now FALSE**
- S1 (§9d, line 272) "We do not keep a "banned users" list or any record of deleted accounts — whether you deleted the account yourself or we deleted it for breaking the Terms." False since Sept 23. `account_restrictions` outlives the account, keyed on scrambled school and sign-in emails (F45, F97); `moderation_actions` keeps the old ID and handle (F98); `email_sends` keeps a stub (F99).
- S2 (§13, line 318) "Both this policy and the Terms carry the same dated version string at the top (today: `2026-09-07`)." The code's version is "2026-05-07"; the live Privacy page says September 28; the live Terms page says May 7 (F34). The draft's own DECISION at line 320 ("TERMS_VERSION … must be bumped") is still not done.
- S3 (§9d step 1, line 239) "Delete every file you uploaded … We never delete the account and leave your files behind." Now with exceptions: evidence files are MOVED to a private quarantine and kept (step 3 in section 3b; `src/lib/profile/storage-purge.ts:57-64`).
- S4 (§4, line 97; §6 Resend row, line 158) "The only automated emails Vibe sends are the three listed". Now also a report alert to platform admins, and on LAND two waitlist emails (F106). Also the Resend row says Resend sends the sign-up confirmation; in code that email is sent by Supabase Auth, and its provider is not in the repo (F107).
- S5 (§1, line 13) "Francisco Cazares is the only person with administrative access to your data … James Andres and Rylan Conaway can read the business inbox … and nothing else." The code now has moderation screens for anyone with `is_platform_admin` (F79). Project memory says all three founders moderate. If James or Rylan hold that flag, this sentence is false: they can see reports, reported content, restriction history and private notes (not emails). CONFIRM who holds the flag.
- S6 (§2, line 21) "Vibe is a website; there is nothing separate to download or install." The sign-up page already branches for the installed app and the store apps (`src/app/auth/signup/page.tsx:142-152`). Detail belongs to the apps reader.

**STALE (was true, changed)**
- S7 (§2 line 26; §3a line 42) campus change "at most once every 30 days": now 45 (F29).
- S8 (§3d line 80; §8 line 210; §9d line 270) "Password-reset requests are counted by your email address and your IP address" / counters "may contain your IP or email": the email is now a keyed hash, not the address (F55). The IP is still stored in full (F54). New since then: code-typing attempts are also counted per account and per network (F57); IPv6 is stored as its /64 for the school-email counters (F56).
- S9 (§3d line 80) "This is the **only** place Vibe itself stores an IP address": still true for Vibe's own tables in this area (plus the waitlist counters on LAND, same table). But the delete page now says Supabase Auth's audit log holds "the IP address the request came from" (F101). The policy should not imply no IP is kept anywhere.
- S10 (§10 line 288) "Passwords must be at least 8 characters": now 8 to 72 (F14).
- S11 (§10 line 294) "No checking of passwords against known breach lists at present": still true as far as the notes go. The sign-up page has copy ready for a breached-password refusal (F15), but the handoffs record the check as not enabled because the project is on the Free plan (F116). Re-check if the plan changed.
- S12 (§10 line 296; §5e) "No audit trail": still true for READS on main. There is now an append-only log of moderator ACTIONS (F53). On LAND, a founder revealing a waitlist address is logged too (`waitlist_reveal`, LAND: `src/lib/auth/require-platform-admin.ts:157-162`).
- S13 (§2 line 24) "You can sign up with any email address": LANDING-NIGHT ONLY change. While sign-up is closed a new account needs an access code or an allow-listed address (F62, F69).
- S14 (§9d line 235) "Go to Settings → Danger zone, type your handle": still true, but there are now three other delete buttons, the word "delete" when the handle is a placeholder, and an email route (F93; `src/app/legal/delete-account/page.tsx:111-125`).
- S15 (§9d line 247 and the Stripe-free step list): deletion now starts by closing Vibe+ billing and refuses to delete if Stripe cannot confirm (section 3b step 2). Off in production today.
- S16 (§3d line 81; §9d line 269) "a page URL in a report can include a handle": handles and auth tokens are now scrubbed before a report is sent (F112).
- S17 (§1 line 15, §15) contact `hello@connectvibe.app` only: the app now sends students to `help@connectvibe.app` for support, appeals and deletion (L12).
- S18 (§8 line 217) "We do not currently run automated database backups": cannot be checked from code; the live page and the delete page now say backups exist (L7). Needs one answer.
- S19 (§3a line 40) "one address can verify only one account": now stronger. Tagged and subdomain variants count as the same address (F21).
- S20 (§3a line 44) platform-admin flag: since Sept 27 other users can no longer read it (`supabase/migrations/20260927141000_users_platform_admin_flag_server_only.sql:124`). The draft's sentence is still true; section 5 of the draft should not list it as visible.

**Still TRUE (checked again today)**
- The checkbox wording (line 29, §13) = F2. The four gates in order: confirm email, Terms, school email, onboarding (line 24) = `src/lib/auth/campus-access.ts:38-49`.
- Consent record contents and what is not stored (§3a line 43, §13 line 316) = F31 to F33. Deleted with the account (§8 line 214) = F96.
- Sign-in and school email are server-only (§3a line 46, §10 line 286) = F3, F18, F78.
- Link 48 h, code 30 to 60 min, sign-up/reset links 1 h (§8 line 213) = F81 to F83 (the 1 h is the local config value).
- No two-factor, no third-party login (§10 line 292, §3e line 89) = F16, F17.
- Cookie name (§7 line 193) = F37. Settings needs no accepted Terms, so a decliner can delete (§9e) = `src/app/settings/page.tsx:102-104`.
- Handle becomes reusable at once (§9d line 262) = F103. Universities receive nothing (§6c) = F113.

**MISSING from the draft (shipped after Sept 17)**
- X1. Suspensions and bans: F44 to F53, F97. Includes that the sign-in-email hash is stored but unused.
- X2. Verify-before-posting (M6).
- X3. "Sign out" ends every session and removes every push device (F41).
- X4. The email send log (F25, F87, F99) and the moderation log (F53, F98).
- X5. Cookie lifetime (400 days), not HttpOnly, the code-verifier cookie (F37, F38). The browser key `vibe.pendingSignup.v1` (F8) is not in §7's local-storage list.
- X6. The placeholder name and handle made at sign-up (F5, F6). Line 46 says "Other users never see either address"; the part of the sign-in email before the `@` is the default display name.
- X7. Accounts that never confirm are kept (F92).
- X8. Stripe at deletion and at a ban (F110). Google Fonts in emails (F111).
- X9. LANDING-NIGHT ONLY: access code, its hash on the account, the claim that stores the sign-in email on the waitlist row, the account-to-waitlist link, cohort tag, allow list, and the deletion step for them (F62 to F73, F95).
- X10. The verification link contains the account ID and the school email in readable form (F22).

### 6b. The Terms of Service v2 draft of Sept 29 (the user asked that it be counted)

File: `handoffs/legal-2026-09-29/02-terms-of-service-v2.md` (a DRAFT, not live; the live Terms page is still "May 7, 2026"). The new Privacy Policy is accepted with the same checkbox, so the two must say the same thing. Checked for this area only. Line numbers are that file's.

**Where the Terms v2 draft and today's code disagree**
- T1 (§14 line 241) "The ban record … the scrambled school email (Section 12). Nothing else from the account." The code keeps more: a second row for the scrambled SIGN-IN email, the kind, dates, reason code, the private moderator note and the moderator's ID (F44, F45, F97). And SUSPENSION rows survive deletion too, not only bans.
- T2 (§12 line 199) the school email is blocked "for a ban". In code an active suspension blocks it as well (F47). "Can never be verified" is also too strong: a lifted ban frees it (`src/lib/moderation/access.ts:278`; the Terms' own appeals paragraph, line 207, says so).
- T3 (§12 line 201) "we keep a scrambled record of the banned account's login email as evidence": true, and it is written for suspended accounts too (`src/lib/moderation/actions.ts:156-171`, no check of `kind`). Still never checked (F46); the draft marks that as a code change to make (H17).
- T4 (§12 line 199, §14) "a keyed hash — it cannot be turned back into the address": see P5 for the safer wording.
- T5 (§1 line 21; §14 line 243) the draft's DEFAULT is to keep proof of agreement (user ID, version, time) for 3 years after deletion. Code today deletes it with the account (F96). The Privacy Policy must follow whichever the founders choose; if the default stands, a code change is needed first.
- T6 (§4 line 57) "Passwords must be at least 8 characters": the code's rule is 8 to 72 (F14).
- T7 (§2 line 28) "Anyone 18 or older may create a login with any email address": LANDING-NIGHT ONLY, not while sign-up is closed (F62).
- T8 (§14 line 235) "If removing your files fails part-way, nothing is deleted": not exact. The purge "Throws on the first storage error; nothing is rolled back", so files removed before the failure stay removed, and a Vibe+ subscription already cancelled stays cancelled (`src/lib/profile/storage-purge.ts:348-350`; `src/app/api/me/route.ts:120-128`). The account itself is kept and the retry finishes the job.
- T9 (§14 line 252) "We can end your account too … we tell you at the login email … then run the same file purge": NOT FOUND, no admin delete route (`src/app/api/admin/users/[id]/` has only `route.ts`, `restrict`, `lift`). The live delete page's TODO says a founder would do it by hand.
- T10 (§12 line 211) "If we learn an account belongs to someone under 18 we close it and delete its data": no such path in code; the draft's own note says today's tool would be a permanent ban, which would KEEP a scrambled record of the minor's school email.
- T11 (line 7) "only one of them, Francisco Cazares, can reach the systems that hold your data": see S5.
- T12 (§14 line 250) "We do not currently keep our own database backups": agrees with the Sept 7 draft and with the Free plan recorded in F116; disagrees with the live Privacy page's "up to 30 days" (L7).

**Where the Terms v2 draft and the code agree (so the Privacy Policy can reuse the wording)**
- Consent record contents (§1 line 21) = F31 to F33. Limited pages before acceptance (§1 line 23).
- Campus change "at most once every 45 days" (§3 line 40) = F29.
- "There is no way to change your login email inside Vibe today" (§4 line 55) = F118. No two-factor (§4 line 57) = F17.
- Handles: 3 to 20 characters, change once every 14 days, freed on deletion (§4 line 61) = F103.
- Verification: link 48 hours, code "valid up to an hour", no verification date recorded (§5 lines 67, 80) = F20, F22, F23.
- What a suspended or banned account can still do (§12 lines 197-199) = F49, F50. A ban does not stop sign-in.
- Appeals by email to help@connectvibe.app (§12 line 207) = F51. The 30-day window in the draft is a rule on paper; nothing in code enforces it.
- "Signing out from any device signs you out everywhere within about an hour" (§13 line 221) = F41 plus the 1-hour token life (F39).
- Two contact addresses with separate jobs: hello@ for questions, help@ for safety, appeals and takedowns (line 13, §21). This settles L12 if the Privacy Policy adopts the same split.

## 7. Surprises and open questions

### Surprises (things the writer probably does not expect)

- P1. **A piece of the private sign-in email is public by default.** Sign-up asks for no name, so the database sets the display name to the text before the `@` of the sign-in email (F6), and the handle to `u` + the internal ID (F5). `users.name` is readable by every signed-in user. It stays that way until onboarding saves a real name, and for accounts that never finish. It is written even before the email is confirmed. Some app lists skip placeholder accounts (`isTriggerDefaultHandle` in `src/app/api/orgs/[slug]/invite-candidates/route.ts`), but the database grant does not. Both drafts say other users never see the address.
- P2. **"Sign out" signs you out everywhere**, while the button says "End your session on this browser" (F41). Good for safety, but the wording is wrong, and a policy sentence about sessions should match the code.
- P3. **The sign-in-email ban hash is stored and never used** (F46). A regulator's question: why keep a keyed hash of a personal email, forever, with no use? Project memory already notes this ("login-email ban hash never checked"). Either use it, stop writing it, or say plainly it is kept as a record.
- P4. **Restriction records never expire and nothing deletes them** (F89, F97): not expired suspensions, not lifted bans, not after account deletion. No retention period exists in code.
- P5. **"The code can't be turned back into an address"** (live delete page, `src/app/legal/delete-account/page.tsx:210-211`) is true only while the server secret stays secret. It is a keyed hash of a guessable value (a school username). Anyone holding `RESTRICTION_PEPPER` can test a guessed address against it. The secret "can never be rotated" (`src/lib/moderation/identity.ts:18-22`). Safer wording: "stored as a keyed code, not as the address".
- P6. **One secret, three jobs.** `SCHOOL_EMAIL_VERIFY_SECRET` signs verification links and codes, AND keys the email-log hash, AND keys the password-reset rate-limit key (`src/lib/auth/school-email-token.ts:10-18`; `src/lib/email/send-log.ts:39-41`; `src/app/api/auth/password-reset/route.ts:56`). Rotating it "orphans every earlier hash" (`20260922104000_email_sends.sql:173`).
- P7. **The consent record does not track the Privacy Policy** (F34). The live policy is dated September 28; every consent row says "2026-05-07". Publishing the new policy without changing `TERMS_VERSION` means nobody is asked to accept it, and "we recorded your agreement to this version" would be untrue.
- P8. **Deleting an account needs no password** (F93). A live session plus the handle (which is public) is enough, and the session cookie lasts up to 400 days and is readable by page scripts (F38). The typed handle guards against accidents, not against someone holding the unlocked phone.
- P9. **Sign-up reveals whether an address already has an account.** On main the page shows "This email may already have an account." (`src/app/auth/signup/page.tsx:243-264`, `:501`). On LAND, with sign-up closed, the raw endpoint also tells new from existing addresses without sending any email (F76). Password reset is careful not to (F12); sign-up is not.
- P10. **No scheduled cleanup exists for anything in this area** (F91). The IP addresses in `rate_limits` go only by a 1%-per-call chance (F60); the email log is "by hand" (F87).
- P11. **A suspension also blocks the school email**, not only a ban (F47). The live delete page says "For a ban, it's what stops that school email from being verified on a new account" (`:211-212`), which undersells it.
- P12. **A ban is not a lockout.** A banned student signs in normally and sees one page (F49). And after deleting and signing up again, the new account is not restricted at all; it just cannot verify that school email, so it cannot post, comment or message (F46). The policy must not say bans prevent re-registration.
- P13. LANDING-NIGHT ONLY: **the sign-in email is written in plain text onto the waitlist row** when the code is claimed (F66), which joins a person's waitlist answers (school email, name, clubs, free text) to their account's sign-in email and ID (F67) for up to about 40 days. And whether the typed access code is hashed in production depends on a separately applied migration (F65).
- P14. The school-verification link carries the account's internal ID and the school email in readable base64 (F22). It travels through Resend, the university's mail system and any link scanner (Outlook Safe Links is named in `src/app/api/auth/password-reset/route.ts:19-21`).
- P15. **The sign-in email can be changed behind the app's back** (F118). No screen offers it, but Supabase Auth's own endpoint is reachable with the public key. If used, Settings would keep showing the OLD address (it reads `public.users.email` first, `src/app/settings/page.tsx:115`), and a later ban would hash the old address. A policy line "your sign-in email is the one shown in Settings" is only true while nobody does this.
- P16. **A failed deletion can say "Nothing was deleted" when something was.** The route's message on a file-purge failure is "Couldn't remove your uploaded files. Nothing was deleted — please try again." (`src/app/api/me/route.ts:127`), but the purge does not roll back files it already removed (`src/lib/profile/storage-purge.ts:348-350`). Harmless in outcome (the retry finishes), but the policy and Terms should say "your account is not deleted and you can retry", not "nothing is deleted" (see T8).

### Open questions (need a person or a dashboard, not code)

- Q1. **Supabase Auth production settings**, none of which are in the repo. Recorded in handoffs as of early September (F114 to F116): confirmation on, 1-hour codes and links, Resend SMTP, no leaked-password check, Free plan. Please re-confirm those are still the values. Never recorded anywhere I read: access-token and session lifetime; the per-IP limits (F59); and whether Auth writes its audit log (email + IP) to the database and for how long (F101; the code's own TODO at `src/app/legal/delete-account/page.tsx:50-54`).
- Q2. Does Supabase Auth's `auth.sessions` table keep an IP address and browser string per session in production? Not in this repo (only a migration comment names the table). I believe hosted Supabase does, but I did not verify it. If yes, "the only place Vibe stores an IP" is wrong and the policy needs a line.
- Q3. **Backups.** Live page: up to 30 days. Sept 7 draft and Terms v2 draft: none. Delete page: "routine backups", no number. The handoffs record the Free plan (F116), which points to "none of our own", but that note is a month old. Which is true for the current Supabase plan?
- Q4. **Who holds `is_platform_admin`** today (S5)? And is `RESTRICTION_PEPPER` set in production? Without it nobody can be suspended or banned (`src/lib/moderation/actions.ts:342-349`), and the school-email check behaves differently (`src/lib/moderation/access.ts:255-258`, `:282-291`).
- Q5. **Retention numbers to decide**: restriction records (P4), the moderation log, the email log (180 days is only a comment), rate-limit rows, unconfirmed accounts (F92).
- Q6. **Emailed deletion requests.** The delete page promises them, but "an emailed request has no admin tool yet; today a founder would have to run the same Stripe → files → auth-user sequence by hand" (`src/app/legal/delete-account/page.tsx:55-56`). How is the requester's identity checked?
- Q7. **Appeals** are emails to help@connectvibe.app (F51). Who reads that inbox, where is it hosted, and how long are appeal emails kept? Not in code.
- Q8. **Which contact address** goes in the policy: hello@ or help@ (L12)?
- Q9. Can a student change their sign-in email? NOT FOUND: no `updateUser({ email` call in `src` (only `{ password }` at `src/app/auth/update-password/page.tsx:380`). The API lets a verified account verify a DIFFERENT school email (F30), but the `/auth/school-email` page sends verified students away (`src/lib/auth/campus-access.ts:78-83`); whether any screen offers it is UNSURE. This matters for the "access and correction" right.
- Q10. LANDING-NIGHT ONLY: has migration `20261003130000_waitlist_code_scrub.sql` been (or will it be) applied in production (F65)? Is the hook turned on in the dashboard? Who is on `signup_allowlist`?
- Q11. Do Vercel's request logs keep the query string? If yes, verification tokens (with the school email inside, F22) and reset token hashes sit in those logs for Vercel's retention window.
- Q12. The 18+ rule is a checkbox only (F2). Some first-years are 17. The live page's under-13 sentence and the Sept 7 draft's strict 18+ both need the founders' decision; nothing in code verifies age.
- Q13. "Up to a year" for quarantined files (live page `:157-160`) has no deleting job that I found (F91). For the moderation reader to confirm.
