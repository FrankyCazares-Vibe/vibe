# Claims ledger for `privacy-policy-v2.md`

Written 2026-10-03. One row per factual claim in the policy, in the order the policy makes them.

How to read it:
- **Facts** = fact file number and fact id. `05:F12` is fact F12 in `facts/05-vendors-network-device.md`. `07:R7` is requirement R7 in `facts/07-legal-inputs.md`.
- **Evidence** = the code path and line copied from that facts file. Paths are from the repo root. `LAND:` = the file or lines exist only on branch `landing-night`. `mig/` = `supabase/migrations/`; where a facts file gave only the timestamp, the name is written `<timestamp>_*.sql`.
- Rows marked **(promise)** are things we say we will do. No code does them; they are listed again in the last section.
- The last section, "Not verified", lists every claim that rests on a handoff, a dashboard or a person.

## Top of the page and "The short version"

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C1 | Intro | Run by CONNECTVIBE. LLC, an Indiana LLC | 07:R6; 06:F81 | `handoffs/legal-2026-09-29/02-terms-of-service-v2.md:7`; LAND: `src/components/landing/home-landing.tsx:67-72, 361-367` |
| C2 | Intro | Not part of, sponsored by, endorsed by or operated by IU or Purdue | 07:R6; 06:F81; 01:F113 | `handoffs/legal-2026-09-29/02-terms-of-service-v2.md:9`; LAND: `src/app/waitlist/layout.tsx:29-39`; no university call in `src/app/api/auth/**`, `src/lib/auth/**` |
| C3 | Intro | Built for people with an IU or Purdue address (only those verify) | 01:F18 | `src/lib/auth/school-email-domains.ts:44, 54-70` |
| C4 | Intro | Covers the site, the installable web app and the store apps; apps are the same site in a shell; not published yet | 05:F37, F94, F46 | `mobile/capacitor.config.ts:3-6,18,28,62,68`; `src/app/manifest.ts`; `handoffs/2026-10-03-session-72-landing-demo-waitlist.md:64` |
| C5 | Short | 18 or older by a tick, no date of birth | 01:F1, F2, F33 | see C25, C26 |
| C6 | Short | "Verified" = could read mail at an @iu.edu or @purdue.edu address at one moment | 01:F18, F22, F23 | see C31, C34 |
| C7 | Short | Profile, club pages with recent posts and authors, post previews are public and indexable | 02:F44a, F44i, F44j, F44f | see C108, C112, C113, C114 |
| C8 | Short | Signed-in views are recorded; count free, names with Vibe+; no opt-out | 02:F31, F32, F46, F47 | see C66, C67, C128, C130 |
| C9 | Short | Messages not end-to-end encrypted; a reported message is copied and readable by the three admins | 03:F2; 04:F8, F53 | see C151, C11 |
| C10 | Short | No sale, no ads, no analytics tracker, no AI vendor, no AI training | 05:F60, F61 | see C79, C107 |
| C11a | Short | All three cofounders moderate | 04:F51 | see C12 |
| C11b | Short | Delete in Settings at once; a list of things stays | 01:F93, F97-F104 | see C216, C226-C242 |
| C11c | Short | No two-factor sign-in; moderation records have no end date | 01:F17; 04:F72, F76, F77 | see C253, C243 |
| C11d | Short | Waitlist: up to 40 days; "Take me off the list" deletes sooner | 06:F42, F48, F49 | see C270, C274 |

## Section 1. Who we are and who can reach your data

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C12 | 1 | All three cofounders hold the platform-admin flag and moderate | 04:F51; 06:F36 | `handoffs/2026-09-22-session-64-stripe-redaction-and-moderation.md:118` (handoff); gate `src/lib/auth/require-platform-admin.ts:21-75` |
| C13 | 1 | Admins see each report: reason, reporter's words and handle, the copy of what was reported; for a message the copy is the message text, a DM included | 04:F53, F8, F63 | `src/app/api/admin/reports/route.ts:73-75, 284-326`; `src/app/admin/reports-client.tsx:29-31, 195-236, 778-780`; `src/app/api/me/reports/route.ts:65, 331-338, 540-546` |
| C14 | 1 | Admins see one account's handle, name, verified flag, join date, every restriction (dates, reason code, private note) and the moderation actions about it | 04:F55; 01:F79 | `src/app/api/admin/users/[id]/route.ts:44-71, 84-136, 166-186` |
| C15 | 1 | Admins see the whole moderation log | 04:F56 | `src/app/api/admin/actions/route.ts:30-49, 96-111` |
| C16 | 1 | Admins see every club, hidden ones included | 04:F57 | `src/app/admin/page.tsx:70-108`; `src/app/api/admin/orgs/route.ts:50-52` |
| C17 | 1 | Admins see the photo slots of an account, club or group chat, and a 2-minute preview of a taken-down profile photo | 04:F52, F32; 02:F35 | `src/app/api/admin/images/route.ts:24-50, 157-161` (PREVIEW_SEC = 120) |
| C18 | 1 | Admins see the waitlist with masked addresses | 04:F61; 06:F36 | LAND: `src/app/api/admin/waitlist/route.ts:11-35, 36-63`; `src/lib/waitlist/admin-view.ts:34-55, 76-80` |
| C19 | 1 | Exact-email lookup returns the account and never an address | 04:F54 | `src/app/api/admin/users/route.ts:30-54, 74-90, 127-138`; `src/app/admin/users-client.tsx:6-13` |
| C20 | 1 | Admin tools show no email, password, résumé, unreported message, view list, billing data or IP | 04:F58; 03:F58 | every route under `src/app/api/admin/**` and `src/app/admin/`; `grep -rn '"messages"' src/app/api/admin src/lib/moderation src/app/admin` |
| C21 | 1 | Direct database access can read everything, both emails and every message included | 04:F59; 02:F55; 03:F58 | service-role client on the server-only reads; `supabase/migrations/20260903100000_security_hardening.sql:34-48` |
| C22 | 1 | No record is kept of database reads or of what admins open | 04:F60; 02:F55 | `grep -rn -i "audit_log\|admin_reads\|access_log\|read_log" src supabase/migrations` = a comment only; `grep -rn -i "audit" src/lib/supabase` = NOT FOUND |
| C23 | 1 | The one logged read: showing a full waitlist address | 04:F62; 06:F37 | LAND: `src/app/api/admin/waitlist/[id]/reveal/route.ts:19-34, 46-61` |
| C24 | 1 | Three contact addresses and their jobs | 07:R8; 01:F51 | `handoffs/legal-2026-09-29/02-terms-of-service-v2.md:13, 290, 297`; `src/app/legal/delete-account/page.tsx:118-125`; `src/app/account/suspended/page.tsx:353-367` |
| C24a | 1 | hello@ is forwarded by Cloudflare Email Routing to a Gmail inbox | 05:F9; 01:F117 | `handoffs/2026-09-04-session-53-private-resumes.md:131, 186` (handoff, not code) |
| C24b | 1 | No postal address is published | 07:R9 | `handoffs/legal-drafts/2026-09-07-privacy-policy.md:13, 334` |

## Section 2. Who this policy covers

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C25 | 2 | The checkbox wording, exactly; sign-up will not submit without it | 01:F2; 06:F84 | `src/app/auth/signup/page.tsx:466-487, 491, 528`; LAND: `src/app/auth/signup/signup-form.tsx:585-618` |
| C26 | 2 | No date of birth is asked; age is not checked any other way | 01:F1, F33 | `src/app/auth/signup/page.tsx:208-221`; `mig/20260906120000_terms_acceptances.sql:44-51` |
| C27 | 2 | Agreement is the tick; without a recorded tick for the current version every gated page goes to the acceptance screen | 01:F31, F35 | `src/lib/legal/terms.ts:15-26`; `src/lib/legal/require-terms.ts:27-38`; `src/lib/auth/campus-access.ts:41-43` |
| C28 | 2 | Sign-up asks for an email, a password and the tick only | 01:F1 | `src/app/auth/signup/page.tsx:208-221`; LAND: `src/app/auth/signup/signup-form.tsx:280-297` |
| C29 | 2 | While sign-up is closed it also asks for an access code | 01:F62; 06:F85 | LAND: `src/app/auth/signup/signup-form.tsx:496-519`; `mig/20261003120000_waitlist_hardening.sql:136-222` |
| C30 | 2 | Four steps in order: confirm email, Terms, school email, profile set-up | 01 section 6 "Still TRUE"; 01:F10 | `src/lib/auth/campus-access.ts:38-49`; `supabase/config.toml:221-223` |
| C31 | 2 | Verifying = a link and a code sent to the school address; using one proves the inbox could be read then | 01:F22, F23, F24 | `src/lib/auth/school-email-token.ts:25-27, 46-61, 98-105`; `src/lib/email/resend-transactional.ts:199-255` |
| C32 | 2 | We do not contact the university | 01:F113 | read of `src/app/api/auth/**`, `src/lib/auth/**`: no call |
| C33 | 2 | No verification date is stored | 01:F20 | `grep school_verified_at`, `verified_at` over `src` and `supabase/migrations`: nothing |
| C34 | 2 | Accepted: @iu.edu, @purdue.edu and subdomains. Refused: retired IU domains, @pfw.edu, @pnw.edu, other schools | 01:F18 | `src/lib/auth/school-email-domains.ts:44, 54-70` |
| C35 | 2 | One school address, one account; tagged and subdomain forms count as the same | 01:F21 | `src/app/api/auth/school-email/request/route.ts:176-226`; `src/lib/moderation/access.ts:330-357`; `src/lib/moderation/identity.ts:80-93` |
| C36 | 2 | University comes from the address | 01:F26 | `src/lib/auth/school-email-apply.ts:163, 222-229` |
| C37 | 2 | Campus is self-chosen, not checked, one change per 45 days | 01:F27, F29 | `mig/20260916100000_campuses_school_system.sql:443-459`; `src/lib/profile/onboarding-prefill.ts:402-403`; `src/lib/profile/settings-campus-card.ts:29-30, 86` |
| C38 | 2 | Without a verified school email: no posting, commenting or messaging | 01:M6, F46 | `src/lib/moderation/access.ts:208-221` |
| C39 | 2 | An unverified account can read what any signed-in account reads | 02:F45a, F20 | `handoffs/legal-2026-09-29/00-code-facts.md:183-187`; `src/app/api/users/[handle]/posts/route.ts:120-128` |
| C40 | 2 | Résumés are the exception: the viewer needs a verified school email | 02:F49 | `src/app/api/resume/[...path]/route.ts:28, 118-157` |

## Section 3. What we collect

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C41 | 3a | Sign-in email: server-only; shown to its owner in Settings | 01:F3, F78 | `mig/20260903100000_security_hardening.sql:34-48`; `src/components/settings/SettingsClient.tsx:469`; `src/app/settings/page.tsx:28-45` |
| C42 | 3a | Password never stored by Vibe; Supabase Auth stores a hash; 8 to 72 characters | 01:F4, F14 | `src/lib/auth/password-rules.ts:5-9, 20-27` |
| C43 | 3a | Starter display name = sign-in email before the @; readable by signed-in users | 01:F6 | `mig/20260906120000_terms_acceptances.sql:104-108`; `mig/20260903100000_security_hardening.sql:41-48` |
| C44 | 3a | Starter handle = "u" + internal id | 01:F5 | `mig/20260906120000_terms_acceptances.sql:82` |
| C45 | 3a | School email stored only after confirming; server-only; never shown to others | 01:F18 | `src/lib/auth/school-email-apply.ts:221-229`; `src/app/api/auth/school-email/request/route.ts:33`; `mig/20260903100000_security_hardening.sql:39-48` |
| C46 | 3a | Verified flag, university, campus and created date are profile data; when campus was set is server-only | 01:F19, F26, F27, F28, F9 | `mig/20260903100000_security_hardening.sql:41-48`; `mig/20260916100000_campuses_school_system.sql:446, 453-459` |
| C47 | 3a | Unconfirmed or unfinished accounts are kept with no time limit | 01:F92 | `grep email_confirmed_at`, `last_sign_in_at`, "inactive" in `src`: no purge |
| C48 | 3b | The list of profile fields | 02:F1-F8, F10, F11, F14, F15 | `src/lib/profile/self-write-columns.ts:27-50`; `src/lib/profile/build-vibe-user-v1.ts:37-46, 76-84` |
| C49 | 3b | Up to three résumé or portfolio documents (file or outside link); redaction bars | 02:F12, F13 | `src/lib/profile/resume-docs.ts:10-25`; `src/lib/profile/resume-storage.ts:94-116, 302-359` |
| C50 | 3b | The hidden-sections list is stored | 02:F14 | `mig/20260926100000_users_profile_layout.sql:124`; `src/lib/profile/hidden-fields.ts:50-60` |
| C51 | 3b | "What are you here for?" answers are owner-only | 02:F9 | `src/app/api/users/[handle]/bootstrap/route.ts:252-263, 329-332`; `mig/20260922130000_users_profile_detail_server_only.sql:163` |
| C52 | 3b | Old recruiter-snapshot data still held, unused, on a few accounts | 02:F16 | `mig/20260922130000_users_profile_detail_server_only.sql:35-45, 64-66, 163`; `src/lib/profile/self-write-columns.ts:15-16` |
| C53 | 3c | Posts, drafts, comments, likes, reposts, saves are stored | 02:F20, F21, F25, F26, F27, F28 | `mig/20260430190000_phase1_initial_schema.sql:48-73`; `mig/20260516100000_post_drafts.sql:8`; `mig/20260508100000_post_reposts.sql:13-19` |
| C54 | 3c | Follows in both directions are stored | 02:F45b, F72 | `src/lib/connections/queries.ts:374-385, 424`; `mig/20260430190000_phase1_initial_schema.sql:77-78` |
| C55 | 3c | Clubs: membership and role; follows with first-follow date and source; join requests with message; invites and outcome | 03:F38, F39, F40, F41 | `src/app/api/orgs/[slug]/members/route.ts:85-90`; `mig/20260916120000_*.sql:641-678`; `mig/20260507100000_*.sql:55-70`; `mig/20260916103000_*.sql:812-833` |
| C56 | 3c | Club events, RSVPs (Going, Interested), personal calendar entries | 03:F34, F35, F36 | `src/app/api/events/[id]/rsvp/route.ts:160-163`; `mig/20260508130000_*.sql:13-51` |
| C57 | 3c | Message content: text, photo, video, shared post, reactions, replies, mentions, group name and picture | 03:F1, F3, F5, F6, F7, F8, F11 | `src/app/api/me/threads/[id]/messages/route.ts:45, 296-353, 406-424, 564-606`; `src/app/api/me/threads/[id]/route.ts:19-21, 87` |
| C58 | 3c | Per-chat state: last read, typing, mute, pin, hide, clear | 03:F9 | `mig/20260903110000_*.sql:17-18`; `src/app/api/me/threads/[id]/mute/route.ts:8-11, 40-53`; `.../typing/route.ts:7, 23-28` |
| C59 | 3c | Every poll vote is stored with the voter's id, anonymous polls included; anonymous = counts only to the room | 03:F27, F28 | `mig/20261001110000_chat_v2_cards.sql:631-639, 884-885`; `src/lib/chat/cards/hydrate.ts:17-22, 171-172, 180, 260-261` |
| C60 | 3c | Polls and sign-ups exist only where the new chat is on | 03 section 1c | `src/app/api/me/threads/[id]/cards/route.ts:72`; `.../cards/[messageId]/vote/route.ts:59` |
| C61 | 3c | Reports filed, block list and mute list are stored | 04:F1, F38, F39 | `mig/20260506100000_safety_block_mute_report.sql:15-42, 44-77, 79-89` |
| C62 | 3c | Otto settings and reminders stored; Otto is rule-based code; no AI vendor | 04:F48, F49, F50; 05:F61 | `src/app/api/me/otto/route.ts:38-56, 181-189`; `mig/20260512000000_otto_reminders_and_settings.sql:16-34`; `src/lib/otto/parse-reminder.ts:4` |
| C63 | 3c | Details removed from: profile photo, cover, own-post photo, work logo, résumé image | 02:F43a-F43f | `src/lib/media/strip-image.ts:5-25, 87-142`; `src/app/api/me/profile-upload/route.ts:19-26, 39-46, 82-88, 158-189` |
| C64 | 3c | Details kept on: videos, club post photos, club logo and banner, chat photos and videos, group pictures, résumé PDFs | 02:F43g-F43l; 03:F4 | `src/app/api/me/profile-upload/route.ts:88, 158-163`; `src/app/api/me/clip-upload-url/route.ts:19-29, 88-93`; `src/app/api/orgs/[slug]/upload-url/route.ts:36-41, 167-178`; `src/app/api/me/messages-upload-url/route.ts:16-17, 38-44`; `src/app/api/me/group-photo-upload-url/route.ts:14` |
| C65 | 3c | Photos uploaded before late September 2026 may still carry details | 02:S15, Q7 | `scripts/count-exif-uploads.mjs:2-25`; `handoffs/2026-09-28-session-67-waves-2-4-and-security.md:49` |
| C66 | 3d | Profile view row: viewer, date, referrer up to 80 characters, one per day; own and signed-out views not recorded; referrer never read | 02:F31, F68 | `mig/20260513000000_profile_views_and_user_view_count.sql:30-37, 49-80`; `src/app/api/profile-views/route.ts:26-55`; `grep -rn "referrer" src/lib/metrics src/app/api/me src/app/api/admin` = NOT FOUND |
| C67 | 3d | Post view row: viewer, post, date, one per day; author's own and signed-out views not recorded | 02:F32 | `mig/20260508110000_post_views.sql:18-32`; `mig/20260912100500_post_views_self_guard.sql`; `src/app/api/posts/[id]/view/route.ts:36-41` |
| C68 | 3d | Last-active ping from the Campus page about every 30 seconds; latest time stored | 02:F33 | `src/app/campus/campus-home.tsx:4661-4673`; `src/app/api/me/heartbeat/route.ts:6-15, 27-30` |
| C69 | 3d | Notification rows (mention, club invite, approved request, cancelled event) | 03:F44; 04:F86 | `src/lib/mentions.ts:176-182`; `src/app/api/orgs/[slug]/invites/route.ts:631`; `mig/20260930100000_*.sql:1-33`; `mig/20260504150000_notifications.sql:12-21` |
| C70 | 3d | IP-keyed counters: password reset (full IP); school-email request and code entry (IPv4, or IPv6 /64); waitlist form | 01:F54, F56, F57, F61; 04:F44, F45; 06:F20 | `src/app/api/auth/password-reset/route.ts:35-39`; `src/lib/rate-limit.ts:52-93`; `src/app/api/auth/school-email/request/route.ts:150-174`; `.../confirm-code/route.ts:109-127`; LAND: `src/app/api/waitlist/route.ts:79-81, 165-168` |
| C71 | 3d | Password reset and waitlist also count by a keyed hash of the email, not the address | 01:F55; 04:F46; 06:F20 | `src/app/api/auth/password-reset/route.ts:54-61`; `mig/20260922104000_email_sends.sql:21-23, 213`; LAND: `src/app/api/waitlist/route.ts:123-124` |
| C72 | 3d | Rate-limit counters are the only place Vibe's own tables hold an IP | 05:F171; 04:P5; 06:F11 | `src/lib/rate-limit.ts:52-71`; LAND: `mig/20261003100000_waitlist.sql:163-215` (no IP column) |
| C73 | 3d | Counter clean-up: rows older than one day, 1 chance in 100 per call, no schedule | 01:F60; 04:F83 | `mig/20260903100000_security_hardening.sql:279-324`; `mig/20260922090000_guard_function_privileges.sql:229-232`; `mig/20260922104000_email_sends.sql:26-37` |
| C74 | 3d | Email log row: kind, keyed hash, coarse domain, provider message id, outcome, time; never the address | 01:F25; 05:F23 | `mig/20260922104000_email_sends.sql:143-166, 206-210`; `src/lib/email/send-log.ts:17-45`; `src/lib/email/send-log-core.ts:10-19, 134-156` |
| C75 | 3d | Nothing deletes email-log rows automatically | 01:F87; 05:F108 | `mig/20260922104000_email_sends.sql:123-124, 169` |
| C76 | 3d | Sentry: errors plus a 10% trace sample; no user id or email attached; tokens, access codes and profile handles scrubbed; club handles and ids are not | 05:F12, F13, F14 | `src/lib/sentry-config.ts:12-13, 63-67, 80-87, 150-186, 189-203`; `src/instrumentation-client.ts:5-7`; `grep "Sentry\.setUser"` = NOT FOUND; LAND diff adds `access_code` |
| C77 | 3d | Search words are not stored; they ride in `?q=` | 02:F36 | `src/app/api/search/route.ts`; `src/app/api/users/search/route.ts` (no insert in either) |
| C78 | 3d | Recent searches stay on the device | 02:F40; 05:F74 | `src/app/campus/campus-home.tsx:5445`; `public/html/profile.html:7159` |
| C79 | 3e | No analytics or advertising SDK | 05:F60 | `grep -nE "analytics|speed-insights|posthog|plausible|gtag|segment|mixpanel|amplitude|hotjar|logrocket|datadog|fullstory|clarity" package.json mobile/package.json` = nothing |
| C80 | 3e | No location: no geolocation call, headers block it, no IP-to-location code | 05:F64, F96 | `grep -rnE "navigator\.geolocation|getCurrentPosition|watchPosition" src public` = nothing; `grep -rnE "x-vercel-ip|request\.geo" src` = nothing; `next.config.ts:87-91` |
| C81 | 3e | No date of birth, no phone number, no third-party login | 01:F1, F16 | `src/app/auth/signup/page.tsx:208-221`; `grep signInWithOAuth, signInWithOtp, signInWithIdToken` = nothing; `supabase/config.toml:264-266, 329-331` |
| C82 | 3e | No contact list | 05:F39 | `mobile/package.json:13-25`; `mobile/ios/App/CapApp-SPM/Package.swift:14-24` |
| C83 | 3e | No card numbers reach Vibe | 05:F26, F28 | `src/app/api/billing/checkout/route.ts:33-34, 176-189`; `mig/20260922150000_billing_stripe.sql:25-44` |
| C84 | 3e | No image scanning | 04:F42 | `grep -rn -i "photodna\|csam\|perceptual\|phash\|hash.*image" src` = nothing relevant |
| C85 | 3e | Word filter runs before text is saved; a match is refused and nothing is stored about it | 04:F41 | `src/lib/moderation/text-filter.ts:1-27`; `src/lib/moderation/access.ts:129-144` |
| C86 | 3f | Billing is off in production | 05:F25 | `src/lib/billing/config.ts:102-108`; `mig/20260922150000_billing_stripe.sql:76-79` |
| C87 | 3f | Payment on Stripe's own pages; no card field on Vibe | 05:F26 | `src/app/plus/PlusActions.tsx:69-70`; `src/app/api/billing/checkout/route.ts:33-34, 176-189`; `grep "js\.stripe\.com|@stripe/stripe-js|loadStripe"` = NOT FOUND |
| C88 | 3f | Only the Vibe account id is sent to Stripe | 05:F27 | `src/lib/billing/customers.ts:18-21, 139-143`; `src/app/api/billing/checkout/route.ts:177-188` |
| C89 | 3f | Stored: Stripe customer id, entitlement, event ledger with no card data or email | 05:F28 | `mig/20260922150000_billing_stripe.sql:25-44, 57-61, 227-253` |
| C90 | 3f | Vibe+ is not sold inside the store apps | 05:F29 | `src/app/api/billing/checkout/route.ts:100-109` |
| C91 | 3f | Push is off in production | 05:F30 | `src/lib/push/config.ts:11-18, 46-67` |
| C92 | 3f | Device row: push address, platform, app version, last seen | 05:F31 | `mig/20260924120000_push_notifications.sql:32-37, 72-80` |
| C93 | 3f | Device row removed at sign-out, turn-off, account deletion, or after 60 days unseen | 05:F112; 01:F41 | `src/lib/push/payload.ts:599-601`; `src/app/api/me/push-devices/route.ts:47-50, 83`; `src/app/api/auth/logout/route.ts:28-34, 84-87` |
| C94 | 3f | A push shows the sender's name and up to 100 characters; previews can be turned off | 05:F35; 03:F45 | `src/lib/push/payload.ts:10-25, 112-113, 407, 432-456` |
| C95 | 3f | Browser push is encrypted and goes through Google, Apple, Mozilla or Microsoft push services | 05:F33 | `src/lib/push/device-address.ts:57-68`; `src/lib/push/send-webpush.ts:1-4, 24-42` |
| C96 | 3f | App push goes through Firebase, which hands iPhone pushes to Apple; title and body in the clear | 05:F34 | `src/lib/push/send-fcm.ts:1-6, 36-38, 278`; `src/lib/push/payload.ts:571-594` |
| C97 | 3f | After the first opt-in the Firebase SDK checks in at every launch | 05:F43 | `mobile/README.md:205-211`; `mobile/ios/App/App/Info.plist:25-29`; `mobile/android/app/src/main/AndroidManifest.xml:94-99` |
| C98 | 3f | iPhone app asks for camera, microphone and photo library when the picker needs them | 05:F40, F92 | `mobile/ios/App/App/Info.plist:40-47` |
| C99 | 3f | Android app declares only internet and notifications | 05:F42 | `mobile/android/app/src/main/AndroidManifest.xml:3-9, 104, 107` |
| C100 | 3f | No location, contacts, analytics or advertising plugin in either app | 05:F39 | `mobile/package.json:13-25`; `mobile/ios/App/CapApp-SPM/Package.swift:14-24` |
| C101 | 3g | People without an account report by email to help@; the app stores nothing of it | 04:F20, F106 | `src/app/legal/community/page.tsx:217-225, 227-248`; `src/app/support/page.tsx:35` |
| C102 | 3g | The recovery proofs we may ask for **(promise, from the new Terms)** | 07:R29 | `handoffs/legal-2026-09-29/11-defender-round1.md:1697-1702`; no code |

## Section 4. How we use it

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C103 | 4 | Five kinds of automatic email to users: confirm account, reset password, verify school email, waitlist confirm, access code | 05:F15, F16, F17, F19, F20, F21 | `supabase/config.toml:249-251`; `src/lib/email/resend-transactional.ts:152-162, 199-215`; LAND: `src/lib/email/resend-transactional.ts:289-361`; `src/lib/email/send-log-core.ts:39-43` (LAND `:44-50`) |
| C104 | 4 | Admins get a report alert with no reported text, no reporter, no target | 04:F21; 05:F18 | `src/lib/moderation/alerts.ts:46-47, 59-72, 108-122, 157-175` |
| C105 | 4 | No marketing, digest or activity email exists | 05:F21 | `src/lib/email/send-log-core.ts:39-43` (closed list of kinds) |
| C106 | 4 | The waitlist has an optional "Also send me Vibe news" tick; no code sends news | 05:F22; 06:F9, X11 | LAND: `src/app/waitlist/waitlist-form.tsx:225-227`; `mig/20261003100000_waitlist.sql:187`; `grep consent_news|newsOptIn`: form, store, admin view only |
| C107 | 4 | No sale, no advertisers, no AI training: no ad or analytics SDK and no AI vendor exist | 05:F60, F61; 03:F85 | `grep -rnoiE "openai|anthropic|generative-ai|gemini|..." src public/html package.json` = two comments; see C79 |

## Section 5. Who can see what

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C108 | 5a | The signed-out profile payload (the listed fields and counts) | 02:F44a | `src/app/api/users/[handle]/bootstrap/route.ts:34-46, 247-263, 338-388`; `src/lib/profile/build-vibe-user-v1.ts:76-180`; `src/app/profile/[handle]/page.tsx:134-136` |
| C109 | 5a | Not in it: either email, résumés, "here for", hidden sections' fields | 02:F44b | `src/app/api/users/[handle]/bootstrap/route.ts:28-31, 255-273`; `src/lib/profile/hidden-fields.ts:39-71` |
| C110 | 5a | Public-bucket files open by exact link, links never expire, bucket cannot be listed | 02:F44g, F10, F22, F23 | `src/app/api/me/profile-upload/route.ts:74-78, 219-220`; `mig/20260904100000_private_resumes_bucket.sql:9-13` |
| C111 | 5a | Post video and club media: no login, redirect to a 1-hour storage link | 02:F44h, F24 | `src/app/api/posts/[id]/media/route.ts:27-47, 84-114, 143-144`; `src/app/api/orgs/[slug]/asset/[kind]/route.ts:18-19, 52-59` |
| C112 | 5a | Post share link: page needs sign-in; preview carries author, up to 140 characters, photo or poster | 02:F44i | `src/app/posts/[id]/page.tsx:36-144, 158-164` |
| C113 | 5a | Club page contents, 12 newest posts with authors, follower count from 5, true for ask-to-join and invite-only clubs | 02:F44j; 03:F48 | `src/app/orgs/[handle]/page.tsx:139-146, 184-187, 240-282`; `src/app/api/orgs/[slug]/profile/route.ts:22-52`; `src/lib/club-routes/club-posts.ts:25, 28`; `src/lib/orgs/following.ts:85-103` |
| C114 | 5a | Profile and club pages may be indexed | 02:F44f | `src/app/robots.ts:13-27`; `grep -rn "noindex\|robots:" src/app` (auth and suspended pages only) |
| C115 | 5a | A service a link is pasted into fetches the preview | 02:F78, F44e | `src/app/posts/[id]/page.tsx:26-34`; `src/app/profile/[handle]/page.tsx:90-117` |
| C116 | 5a | Not public: posts list, follower and following lists, chats, RSVP lists, member lists | 02:F44c; 03:F48 | `src/app/api/users/[handle]/posts/route.ts:49` (401); same check in `followers`, `following`, `connections`, `mutuals`, `reposts`; `src/app/api/events/route.ts:105-113` |
| C117 | 5a | A hidden club and a restricted account's profile answer "not found" | 02:F44d, F44j | `src/app/api/users/[handle]/bootstrap/route.ts:189-201`; `src/app/profile/[handle]/page.tsx:85-88, 165-174` |
| C118 | 5a | A block does not change what a signed-out visitor sees | 02:F44a, F45d; 07:R41 | the no-login routes in C108 and C113 take no viewer; block handling only at `bootstrap/route.ts:217-245` for a signed-in pair |
| C119 | 5b | Signed-in accounts, verified or not, at any campus, read posts, comments, reposts and follow lists | 02:F45a, F45b, F20, F25, F27 | `src/app/api/users/[handle]/posts/route.ts:120-128`; `src/app/api/users/[handle]/followers/route.ts:24-41`; `src/app/api/posts/[id]/comments/route.ts:13, 118-145` |
| C120 | 5b | Like totals are visible; who liked is not; the author gets a notification naming the liker | 02:F26 | `mig/20260922110000_t1_close_world_readable_selects.sql:13-17, 60-66` |
| C121 | 5b | Saves are private; the author sees a count, never names | 02:F28, F50 | `src/app/api/me/posts/[id]/savers/route.ts:7-13, 41`; `public/html/profile.html:3824` |
| C122 | 5b | Club events with Going and Interested totals | 03:F49, F57 | `src/app/api/events/route.ts:54-60, 332-357` |
| C123 | 5b | Search: by name or handle, both universities, only verified and onboarded accounts | 02:F45e | `src/app/api/search/route.ts:205, 214`; `src/app/api/users/search/route.ts:118, 125` |
| C124 | 5b | Open club's member list readable through the data API; the app shows the roster to members only | 03:F49 | `mig/20260916103000_*.sql:778-788`; `src/app/api/orgs/[slug]/members/route.ts:8-12, 78-82` |
| C125 | 5b | Any signed-in account can read `created_at`, `last_active_at`, `handle_changed_at`, `profile_view_count` of any account through the data API | 02:F45f, F17, F18, F19 | `mig/20260903100000_security_hardening.sql:39-48`; no later revoke: `grep -n -i "revoke.*\(last_active_at\|profile_view_count\|handle_changed_at\|created_at\)" supabase/migrations/*.sql` |
| C126 | 5c | Résumé access conditions; 5-minute link; redacted copy only | 02:F49, F13 | `src/app/api/resume/[...path]/route.ts:28, 118-157, 175, 239-256`; `src/lib/profile/hidden-fields.ts:87-103` |
| C127 | 5c | An outside résumé link or logo address makes the viewer's browser contact that site | 05:F57; 02:F80 | `src/lib/profile/resume-doc-url.ts:13-14`; `src/components/mobile/ResumeViewerMobile.tsx:294`; `src/lib/profile/work-experience.ts:26-46`; `public/html/profile.html:10344-10346` |
| C128 | 5d | View counts free; names with Vibe+; profile list 90 days; post list all time | 02:F46, F47 | `src/app/api/me/profile-views/route.ts:17-35, 69-71, 236-248`; `src/lib/metrics/profile-viewers.ts:86`; `src/app/api/me/posts/[id]/viewers/route.ts:15-28, 60-63` |
| C129 | 5d | People the owner blocked or muted are left off the profile viewer list | 02:F46 | `src/app/api/me/profile-viewers/route.ts:8-9, 56-60` |
| C130 | 5d | No private viewing mode | 02:F46, S5 | `src/app/plus/page.tsx:708-710` |
| C131 | 5d | Billing is off but an entitlement can be granted by hand | 02:F46 | `mig/20260912101000_entitlements.sql:146, 196-198`; `mig/20260928140000_profile_views_server_only.sql:10-12, 64` |
| C132 | 5e | DM and group members see messages, media, shared posts, reactions, members, the other side's last-read time and who is typing | 03:F50, F10 | `mig/20260923090000_moderation_foundation.sql:2232-2241`; `src/app/api/me/threads/[id]/messages/route.ts:177-226` |
| C133 | 5e | A message from a non-connection is a request, readable before accepting | 03:F13, F50 | `src/app/api/me/threads/route.ts:212-214, 378-391`; `src/app/api/me/threads/[id]/messages/route.ts:535-548` |
| C134 | 5e | A block stops new DM and group messages both ways and leaves old ones readable | 03:F50, F60 | `src/app/api/me/threads/[id]/messages/route.ts:426-446`; `src/lib/messages/group-rules.ts:17-24` |
| C135 | 5e | Club rooms: Board and Lounge for all members; Officers for owner, admins and an allow-list; an event chat for members who RSVP'd plus owners and admins | 03:F15, F16, F17 | `mig/20261001100000_chat_v2_rooms.sql:5-11, 727-730, 826-850, 1049-1136, 1319-1344` |
| C136 | 5e | A new member can read a room's whole history | 03:F52 | `mig/20261001100000_chat_v2_rooms.sql:1325-1340`; `mig/20260923090000_moderation_foundation.sql:2244-2252` |
| C137 | 5e | No read receipts or typing in club rooms; no photos or videos | 03:F21, F20 | `src/app/api/me/threads/[id]/messages/route.ts:152-173, 366`; `src/lib/chat/types.ts:126`; `src/app/api/me/messages-upload-url/route.ts:96-97` |
| C138 | 5e | Polls: names on = room sees who; anonymous = no names to anyone through the app; sign-ups always show names | 03:F28, F29, F30 | `src/lib/chat/cards/hydrate.ts:17-22, 52-53, 171-172, 180, 260-261`; `src/components/mobile/messages/compose/NewSignupSheet.tsx:195` |
| C139 | 5e | "Who's going" in an event chat shows the first few Going names; elsewhere only totals | 03:F53, F57 | `src/lib/chat/message-read.ts:274, 992-1044, 1106-1123`; `mig/20260922110000_t1_close_world_readable_selects.sql:306-309` |
| C140 | 5e | Blocks in club rooms are applied by the app (placeholder), not by the database rule; officer Board posts always show | 03:F25, F60 | `src/lib/chat/stub.ts:9-22, 57-80`; `src/lib/chat/message-read.ts:585-590, 642, 650`; `mig/20261001100000_chat_v2_rooms.sql:54-58` |
| C141 | 5e | Co-members can read each other's `channel_members` row (read marker, mute, pin, hide, clear) through the data API | 03:F51 | `mig/20260928150000_*.sql:45-47, 79-81, 283`; `mig/20261001100000_chat_v2_rooms.sql:59-61` |
| C142 | 5f | Owners and admins see the follower list (card, first-follow date, source), invites and outcomes, and the RSVP list of the club's own events | 03:F55 | `src/app/api/orgs/[slug]/followers/route.ts:38-66, 163-175`; `mig/20260916103000_*.sql:857-860`; `src/app/api/events/[id]/attendees/route.ts:21-31, 59-70, 72-95` |
| C143 | 5f | They can remove a follower; the person is not told | 03:F55 | `src/app/api/orgs/[slug]/followers/[userId]/route.ts:15-36` |
| C144 | 5f | They can delete any post made as the club | 02:F53 | `src/app/api/posts/[id]/route.ts:405-415`; `mig/20260929110000_post_club_deletes.sql:37-42` |
| C145 | 5f | Owners, admins and mods see pending join requests with the message and a "Removed before" mark | 03:F56, F42 | `src/app/api/orgs/[slug]/requests/route.ts:27-62`; `mig/20260928100000_*.sql:240-256, 355-362` |
| C146 | 5f | They can remove a member's message in a club room; who removed it is recorded | 03:F22, F23; 04:F37 | `src/app/api/me/threads/[id]/messages/[messageId]/route.ts:39-57, 162-206, 221-241`; `mig/20261001110000_chat_v2_cards.sql:646-656` |
| C147 | 5f | Officers get no email addresses | 03:F55, F56 | `src/app/api/orgs/[slug]/invite-candidates/route.ts:39-68`; `src/app/api/orgs/[slug]/requests/route.ts:27-62` |
| C148 | 5f | Officers see no reports | 04:F70 | `mig/20260923090000_moderation_foundation.sql:2121-2122` (no client grant on `reports`); no club route reads it |
| C149 | 5g | Owner-only: drafts, saves, personal calendar, notifications, mutes, Otto data, redaction bars, hidden list, "here for" | 02:F21, F28, F13, F14, F9; 03:F36, F44; 04:F39, F48, F49 | `src/app/api/posts/[id]/media/route.ts:84-91`; `mig/20260508130000_*.sql:13-51`; `mig/20260506100000_safety_block_mute_report.sql:44-77`; `mig/20260512000000_otto_reminders_and_settings.sql:40-60` |
| C150 | 5g | A block row is readable by both people; no notice is sent | 04:F38 | `mig/20260515000000_blocks_select_either_party.sql:16-18` |
| C151 | 5h | Messages are stored as plain text, not end-to-end encrypted | 03:F2 | `grep -rniE "encrypt|e2e|end-to-end" src/lib/chat src/app/api/me/threads src/components/mobile/messages src/lib/messages` = nothing |
| C152 | 5h | The three cases in which we read private messages **(promise)**. What the code does: admin screens show only a reported message; anything more is database access | 07:R42; 03:F58 | `handoffs/legal-2026-09-29/11-defender-round1.md:1651`; `src/app/api/admin/reports/route.ts:46, 290` |
| C153 | 5h | Reportable: post, comment, message, person, chat, club, event | 04:F2 | `src/lib/moderation/reports.ts:29-37`; `mig/20260923090000_moderation_foundation.sql:2077-2079` |
| C154 | 5h | A report stores a copy: text, media links, owner's handle and name | 04:F5, F6, F7, F8, F9; 02:F34 | `src/app/api/me/reports/route.ts:90-92, 329-345, 361, 366-387`; `mig/20260923090000_moderation_foundation.sql:2062-2066` |
| C155 | 5h | The reported person is not told of the report or the reporter | 04:F63, F65 | `src/app/api/admin/reports/route.ts:321-322`; `src/components/safety/ReportSheet.tsx:255`; no route returns reports to a student |
| C156 | 5h | People review reports; no software decides them | 04:F53, F41, F42 | admin queue `src/app/api/admin/reports/route.ts`; the only automated check is `src/lib/moderation/text-filter.ts:1-27` |
| C157 | 5h | We aim to look at each report within 24 hours **(aim; nothing tracks it)** | 04:S4, Q14 | `src/app/legal/community/page.tsx:142-145`; `src/lib/moderation/reports.ts:159-164` |
| C158 | 5h | The author still sees removed content with the reason; nobody else does | 04:F67, F68, F31 | `public/html/_postViewer.js:640`; `public/html/profile.html:9818`; `public/html/messages.html:1413`; `mig/20260923090000_moderation_foundation.sql:2127-2147` |
| C159 | 5i | No code sends anything to IU or Purdue | 01:F113; 04:F108; 03:F85 | `grep iu.edu\|purdue.edu` under `src/lib/moderation` = domain rules only; no call in `src/app/api/auth/**` |
| C160 | 5i | School-address emails are delivered through the university's mail system | 01:F108; 05:F139 | `src/lib/email/resend-transactional.ts:199-255` |
| C161 | 5i | The three cases in which we share with a university **(promise)** | 07:R43 | `handoffs/legal-2026-09-29/11-defender-round1.md:1534` |
| C162 | 5i | No code path to law enforcement or NCMEC; a report would be made by hand | 04:F105 | `grep ncmec\|cybertip` in `src` = `src/app/legal/child-safety/page.tsx:126-130` and one comment |
| C163 | 5i | We will tell users before data moves to a new operator **(promise)** | 07 section 3 | `handoffs/legal-2026-09-29/02-terms-of-service-v2.md:288` |

## Section 6. Outside services

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C164 | 6 | Supabase: database, sign-in, three storage areas; the browser calls it directly at sign-up and sign-in; it sends the confirmation email; it keeps a sign-in security log | 05:F1, F2, F11, F118, F123 | `src/lib/supabase/server.ts:16-34`; `src/lib/supabase/browser.ts:11-15`; `src/app/auth/login/page.tsx:138`; `mig/20260927130000_quarantine_bucket.sql`; `supabase/config.toml:249-251`; `src/app/legal/delete-account/page.tsx:44-54` |
| C165 | 6 | Vercel: hosting, request logs, the daily waitlist cron, Blob for the landing film | 05:F4, F6, F7, F124, F125, F126 | `next.config.ts:1-133`; LAND: `vercel.json:1-9`; LAND: `src/lib/landing/demo-media.ts:4-8, 25-28` |
| C166 | 6 | Cloudflare: R2 media, Email Routing, cdnjs for pdf.js on first PDF use | 05:F8, F9, F52, F127, F128, F129 | `src/lib/r2.ts:13-18, 39-41, 109-118`; `src/lib/pdfjs-cdn.ts:13-14, 64-65`; `public/html/profile.html:24-27, 5001-5025` |
| C167 | 6 | Resend receives the address and full body of every email Vibe's code sends | 05:F10, F130 | `src/lib/resend.ts:18-21`; `src/lib/email/resend-transactional.ts:15-23` |
| C168 | 6 | Sentry: error reports and 10% of traces | 05:F12, F131 | `src/lib/sentry-config.ts:189-203` |
| C169 | 6 | Google Fonts on almost every page and in emails opened by a mail app that loads remote styles; Gmail holds mail to hello@ | 05:F50, F24, F132, F133, F9 | `src/app/layout.tsx:95-98`; `public/html/profile.html:21`; `src/lib/email/resend-transactional.ts:91` (LAND `:110`); `supabase/templates/confirmation.html:10` |
| C170 | 6 | Stripe (off): the account id and what the student types on its page | 05:F134, F27 | `src/lib/billing/customers.ts:18-21, 139-143` |
| C171 | 6 | Firebase, Apple, Mozilla, Microsoft push services (off) | 05:F135, F136, F137 | `src/lib/push/device-address.ts:57-68`; `src/lib/push/send-fcm.ts:1-6` |
| C172 | 6 | App Store and Google Play once the apps are published | 05:F138, F46 | `src/app/get/route.ts:6-13, 39-48`; `src/lib/native/store-links.ts:22-23` |
| C173 | 6 | The list of hosts the browser or app contacts directly | 05:F47-F57 | `next.config.ts:56-61`; `src/lib/supabase/browser.ts:13`; `src/lib/r2.ts:39-41`; `src/app/layout.tsx:95-98`; LAND: `src/components/landing/use-day-film.ts:20-26, 58-63`; `src/app/plus/PlusActions.tsx:69-70` |
| C174 | 6 | Other sites receive only the site origin as referrer | 05:F97 | `next.config.ts:86` |
| C175 | 6 | Provider regions are dashboard settings, not in code | 05:Q1 | no `regions` key in LAND `vercel.json` |

## Section 7. Cookies and what is stored on your device

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C176 | 7 | Only Supabase session cookies (`sb-<project>-auth-token`, split parts, a short-lived code-verifier cookie) | 01:F37; 05:F66 | `src/lib/supabase/browser.ts:11-16`; `src/lib/supabase/server.ts:18-34`; `src/lib/supabase/middleware.ts:19-33`; `src/proxy.ts:202` |
| C177 | 7 | Cookie lifetime 400 days; refreshed on every request | 01:F38; 05:F68 | `node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11`; `src/lib/supabase/middleware.ts:13-41` |
| C178 | 7 | No advertising, analytics, consent or CSRF cookie | 01:F40; 05:F67 | `grep -rnE "cookies\(\)\.set|\.cookies\.set\(|Set-Cookie|setCookie|document\.cookie" src`; `grep -rnEi "csrf" src` (two non-cookie hits) |
| C179 | 7 | Landing and waitlist code set no cookie and no browser storage | 06:F27 | `grep localStorage\|sessionStorage\|document.cookie\|indexedDB` over `src/components/landing`, `src/app/waitlist`, `src/app/page.tsx`, `src/lib/landing`, `src/lib/waitlist`: no hits |
| C180 | 7 | localStorage copies (profile, posts, follow list, calendar, searches, Otto, onboarding draft 14 days, push device record), wiped at sign-out and account deletion | 05:F70-F76, F80, F119; 01:F43 | `src/lib/pwa/leave-device-clean.ts:33-56, 66-85`; `src/lib/onboarding/draft.ts:17-31`; `public/html/_persistence.js:11-15` |
| C181 | 7 | The just-signed-up email is kept 24 hours | 01:F8; 05:F77 | `src/lib/auth/pending-signup.ts:1-62` |
| C182 | 7 | Theme, tour flags and notification-tap ids stay | 05:F78, F79, F82 | `src/lib/theme/theme.ts:27-30`; `src/lib/pwa/leave-device-clean.ts:36-41`; `src/components/native/NativeBridge.tsx:63-71` |
| C183 | 7 | One-tab items (reset token moved out of the address bar, and similar) | 05:F83-F87 | `src/app/auth/update-password/page.tsx:54-66`; `src/app/auth/verify-school/page.tsx:32-40` |
| C184 | 7 | The service worker caches one file, the offline page, and no feed, profile or message | 05:F89 | `public/sw.js:3-20, 27-28, 57-66, 79-96` |
| C185 | 7 | Sign out ends every session and deletes the account's push devices | 01:F41 | `src/app/api/auth/logout/route.ts:28-34, 84-87`; `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3143, 3176` |

## Section 8. How long we keep things, and what happens to files

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C186 | 8 | The only scheduled clean-up is the waitlist purge | 01:F91; 04:F90 | no `vercel.json` or `src/app/api/cron` on main; LAND: `vercel.json` (`17 8 * * *`); `grep -rn -i "pg_cron\|cron\.schedule" supabase/` = nothing |
| C187 | 8 | View rows stay until the viewer's account, the viewed account or the post is deleted | 02:F68; 04:F87 | `mig/20260513000000_profile_views_and_user_view_count.sql:30-37`; `mig/20260508110000_post_views.sql:18-23`; no `DELETE FROM ... profile_views|post_views` |
| C188 | 8 | Notifications stay until deleted by their owner or either account is deleted | 04:F86 | `mig/20260504150000_notifications.sql:12-21, 45-48` |
| C189 | 8 | Messages stay until the sender deletes the message or the account, or the chat is deleted | 03:F61 | `mig/20260430190000_phase1_initial_schema.sql:116`; `mig/20260903110000_*.sql:19` |
| C190 | 8 | An event chat stops taking messages 7 days after the event ends and is deleted with the event | 03:F18, F69 | `mig/20261001100000_chat_v2_rooms.sql:710, 729-730, 1385-1388`; `src/lib/chat/room-state.ts:5-8, 30` |
| C191 | 8 | Events, RSVPs, answered join requests and invites stay until the event, club or account is deleted; an unanswered invite expires after 30 days and its row stays | 03:F71, F72, F76, F77 | `src/app/api/events/[id]/route.ts:129-153`; `mig/20260507100000_*.sql:55-70`; `mig/20260916103000_*.sql:812-833` |
| C192 | 8 | School verification link 48 hours; code 30 to 60 minutes | 01:F81, F82 | `src/lib/auth/school-email-token.ts:49, 98-105, 145-158` |
| C193 | 8 | Deleting a post deletes the row with its likes, comments, saves and views, then its files | 02:F57 | `src/app/api/posts/[id]/route.ts:427-440, 459, 508-543`; `src/lib/posts/delete-media-store.ts:15-39, 159-199` |
| C194 | 8 | Under an open report the photo is moved to quarantine and the video is kept | 02:F58; 04:F36 | `src/lib/posts/delete-media-store.ts:24-29, 176-185` |
| C195 | 8 | A deleted public photo can stay in a cache for a few days | 02:F57, S9 | `src/lib/posts/delete-media.ts:12-22` (code comment) |
| C196 | 8 | A post a moderator removed cannot be deleted or edited by its author | 02:F59; 04:F79 | `src/app/api/posts/[id]/route.ts:416-418, 499-504, 584-586`; `mig/20260929110000_post_club_deletes.sql:33-36` |
| C197 | 8 | An edit overwrites the text; only the edit time is kept; an earlier report keeps the earlier text | 02:F56 | `src/app/api/posts/[id]/route.ts:566-606, 632`; `mig/20260916130000_post_edited_at.sql:277-285`; `src/app/api/me/reports/route.ts:91` |
| C198 | 8 | No way to delete one comment | 02:F60 | `src/app/api/posts/[id]/comments/route.ts:147, 338` (GET and POST only) |
| C199 | 8 | Deleting a message removes it for everyone, with its reactions and, for a Board post, the replies under it | 03:F62 | `src/app/api/me/threads/[id]/messages/[messageId]/route.ts:31-37, 96-109`; `mig/20261001100000_chat_v2_rooms.sql:713-714` |
| C200 | 8 | The message's file is not deleted and account deletion cannot find it; no link can be made to it | 03:F63; 02:F62 | `src/lib/r2.ts:311-327`; `src/lib/profile/storage-purge.ts:44-55, 198-223, 375` |
| C201 | 8 | After leaving a chat or club the app refuses the delete (403), and the messages stay | 03:S9, F74 | `src/app/api/me/threads/[id]/messages/[messageId]/route.ts:77-116`; `src/lib/messages/channel-access.ts:94-99` |
| C202 | 8 | "Clear chat history" and "Delete conversation" delete nothing | 03:F64, F65 | `src/app/api/me/threads/[id]/clear/route.ts:7-15, 27-31`; `.../hide/route.ts:7-11` |
| C203 | 8 | A replaced photo or cover is deleted, or quarantined under an open report | 02:F64; 04:F36 | `src/lib/media/profile-photo-retire.ts:10-25, 107-147` |
| C204 | 8 | A replaced work logo stays at its public link until account deletion | 02:F65 | `src/lib/media/profile-photo-replace.ts:44-47`; `src/lib/media/profile-image-key.ts:26-28` |
| C205 | 8 | A removed résumé file is deleted in the same save | 02:F66 | `src/app/api/me/profile-sync/route.ts:827-843, 866-898` |
| C206 | 8 | Group chat pictures are never deleted by any code path | 02:F63; 03:F67 | `src/lib/r2.ts:287-290, 301-307, 419-447` |
| C207 | 8 | Leaving a club deletes votes; messages stay; the first-follow date is kept | 03:F70, F74, F75 | `mig/20261001110000_chat_v2_cards.sql:932-973`; `src/app/api/orgs/[slug]/join/route.ts:258-271`; `mig/20260916120000_*.sql:636-650, 678-680` |
| C208 | 8 | We keep no database backups (see "Not verified") | 04:F96 | `handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md:1206` (handoff) |

## Section 9. Your choices, and deleting your account

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C209 | 9 | Settings shows both emails; hiding a section withholds it from others | 01:F3, F18; 02:F67 | `src/components/settings/SettingsClient.tsx:469, 471-472`; `src/lib/profile/hidden-fields.ts:8-12` |
| C210 | 9 | No screen changes the sign-in email | 01:F118, Q9 | only `updateUser({ password })` at `src/app/auth/update-password/page.tsx:380` |
| C211 | 9 | Reporting needs accepted Terms and no restriction, not a verified school email | 04:F17 | `src/app/api/me/reports/route.ts:516-519` |
| C212 | 9 | A reported post leaves the reporter's feed | 04:F66 | `src/app/api/feed/route.ts:150-156` |
| C213 | 9 | The reporter gets no message about the outcome | 04:F64 | no notification type for reports; `src/components/safety/ReportSheet.tsx:218, 225, 255` |
| C214 | 9 | Export: by email, assembled by hand, aim of 30 days **(promise)** | 07:R63 | `handoffs/legal-drafts/2026-09-07-privacy-policy.md:231`; no export code |
| C215 | 9 | The delete button is also on the verify screen, in onboarding and on the suspended notice; emailed deletion has no tool | 01 section 3b, Q6, L11 | `src/app/account/suspended/suspended-actions.tsx:131-136`; `src/app/auth/school-email/page.tsx:731-734`; `src/app/legal/delete-account/page.tsx:55-56, 111-125` |
| C216 | 9 | Settings, Danger zone, type the handle; deleted at once; no password, no waiting period | 01:F93 | `src/components/settings/SettingsClient.tsx:1286-1297, 1342-1465`; `src/app/api/me/route.ts:75-99` |
| C217 | 9 | Step 1: Stripe customer deleted first; if Stripe cannot confirm, 503 and nothing is deleted | 01 section 3b step 2; 05:F114 | `src/app/api/me/route.ts:109-111, 156-218` |
| C218 | 9 | Step 2: evidence moved to quarantine, other files erased; on failure the account is kept and removed files stay removed | 01 section 3b step 3, T8; 02:F71 | `src/app/api/me/route.ts:113-131`; `src/lib/profile/storage-purge.ts:271-341, 348-350, 354-382` |
| C219 | 9 | Step 3: the redeemed waitlist entry is deleted | 01:F95; 06:F55 | LAND: `src/app/api/me/route.ts:138-147`; `mig/20261003120000_waitlist_hardening.sql:477-502` |
| C220 | 9 | Step 4: the auth user is deleted and the listed records cascade | 01:F96; 02:F72; 03:F80; 04:F88, F89 | `src/app/api/me/route.ts:136-149`; `mig/20260906120000_terms_acceptances.sql:46`; `mig/20260924120000_push_notifications.sql:462`; LAND: `mig/20261003140000_waitlist_retention.sql:79` |
| C221 | 9 | Step 5: signed out, device copies cleared | 01 section 3b step 6, F43 | `src/app/api/me/route.ts:151`; `src/lib/pwa/leave-device-clean.ts:33-53` |
| C222 | 9 | Other people lose the messages you sent, and replies under your Board posts | 03:F61, F62, S3 | `mig/20260430190000_phase1_initial_schema.sql:116`; `mig/20261001100000_chat_v2_rooms.sql:713, 733-734` |
| C223 | 9 | Posts and events made as a club are deleted; each event takes everyone's RSVPs and its chat; no cancel notice on this path | 02:F72; 03:F69, S2 | `mig/20260430190000_phase1_initial_schema.sql:124`; `mig/20260928110000_*.sql:111`; `src/app/api/events/[id]/route.ts:136-148` |
| C224 | 9 | A restricted account can still sign in, read the notice and legal pages, block, mute, sign out and delete | 01:F49; 04:F40 | `src/lib/moderation/actions.ts:34-39, 228-242`; `src/proxy.ts:142-157, 175-181` |
| C225 | 9 | Its profile, posts and comments are hidden from others; the notice shows kind, end date and reason, not the note; appeals are emails to help@ | 01:F50, F51, F44; 04:F69, F98 | `src/app/account/suspended/page.tsx:243-248, 316-367` |
| C226 | 9 | Restriction rows outlive the account: kind, dates, reason code, private note, two keyed hashes; for suspensions too | 01:F97, F44, F45; 04:F77 | `mig/20260923090000_moderation_foundation.sql:1808-1832`; `src/lib/moderation/actions.ts:156-171, 394-408` |
| C227 | 9 | The hash is HMAC-SHA256 with a server-held secret; not reversible without the secret | 01:F45, P5; 04:F28, Q19 | `src/lib/moderation/identity.ts:80-93, 105-125` |
| C228 | 9 | The school hash blocks verification while any restriction is in force | 01:F46, F47 | `src/lib/moderation/access.ts:263-302`; `src/lib/auth/school-email-apply.ts:93-99, 218-219` |
| C229 | 9 | The sign-in-email hash is never checked | 01:F46; 04:F28 | `src/lib/moderation/actions.ts:145-151`; the only `key_kind` read filter is `src/lib/moderation/access.ts:277` |
| C230 | 9 | A ban does not stop a new account being made | 01:F46, F49 | `src/lib/moderation/actions.ts:34-39` |
| C231 | 9 | Reports about a deleted account stay whole, with the snapshot and the old owner id | 04:F74; 02:F70 | `mig/20260923090000_moderation_foundation.sql:2059-2061` |
| C232 | 9 | Reports a deleted account filed stay with the words; reporter id set to null | 04:F73 | `mig/20260506100000_safety_block_mute_report.sql:81` |
| C233 | 9 | The moderation log keeps the old id, the handle at the time and old photo addresses; it cannot be edited or deleted | 04:F76, F24; 01:F98 | `mig/20260923090000_moderation_foundation.sql:1894-1958`; `src/app/api/admin/images/remove/route.ts:183-192` |
| C234 | 9 | Evidence files stay: quarantined photos, evidence videos in R2, also after a dismissed report | 02:F73; 04:F36, F82, F82b | `src/lib/profile/storage-purge.ts:35-45, 57-64, 371-374`; `grep QUARANTINE_BUCKET_ID` (no remove call) |
| C235 | 9 | Files deletion cannot find: files of messages deleted one by one, group pictures, club post media | 02:F73; 03:F63, F67 | `src/lib/profile/storage-purge.ts:44-55`; `src/lib/posts/delete-media-store.ts:240-277` |
| C236 | 9 | Officer-action rows stay with the id blanked; an owned club stays with no owner | 03:F80 | `mig/20260507100000_*.sql:11`; `mig/20260916103000_*.sql:812-833` |
| C237 | 9 | Email-log rows stay with hash and account id wiped | 01:F99 | `mig/20260922104000_email_sends.sql:147, 188-204` |
| C238 | 9 | Billing: Stripe keeps its records; the event ledger outlives the account | 05:F115, F114; 01:F110 | `mig/20260922150000_billing_stripe.sql:57-61` |
| C239 | 9 | Rate-limit rows stay until the opportunistic clean-up | 01:F100 | `mig/20260922104000_email_sends.sql:26-37` |
| C240 | 9 | Provider logs remain on their own schedules; retention not confirmed | 01:F101, F102; 05:F110, F116, F117, F118 | `src/app/legal/delete-account/page.tsx:40-54` |
| C241 | 9 | The handle is free at once | 01:F103 | `src/lib/profile/handle.ts:10-12`; no reserved-handle table |
| C242 | 9 | Copies others made, search-engine copies, link previews, cache | 02:F73, S14; 04:F71 | `src/lib/moderation/media-quarantine-images.ts:88-92` |
| C243 | 9 | Nothing deletes reports, the log, restriction rows or quarantined files today | 04:F72, F76, F77, F82; 01:F89 | `mig/20260923090000_moderation_foundation.sql:1912, 1938-1958`; `src/lib/profile/storage-purge.ts:35-42` |
| C244 | 9 | A ban deletes the Stripe customer, which cancels Vibe+ with no refund | 01:F52; 04:F102 | `src/lib/moderation/actions.ts:267-325` |
| C245 | 9 | Without the current Terms accepted, gated pages go to the acceptance screen; Settings stays open | 01:F35, F36 | `src/lib/legal/require-terms.ts:27-38`; `src/app/settings/page.tsx:102-104`; `src/app/auth/terms/accept-terms-form.tsx:169-227` |

## Section 10. Security

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C246 | 10 | HTTPS forced by header (HSTS, two years) | 05:F95 | `next.config.ts:72-75` |
| C247 | 10 | Résumés are in a private bucket | 02:F12 | `src/lib/profile/resume-storage.ts:94-116`; `mig/20260904100000_private_resumes_bucket.sql:9-13` |
| C248 | 10 | Expiring links: résumé 5 minutes, group picture 5 minutes, chat media 1 hour | 02:F49; 03:F82 | `src/lib/r2.ts:18, 159-218`; `src/app/api/me/threads/[id]/messages/[messageId]/media/route.ts:12-17, 85-89` |
| C249 | 10 | Emails, consent record and moderation tables are server-only | 01:F78, F32; 04:F1, F22, F27 | `mig/20260903100000_security_hardening.sql:39-52`; `mig/20260906120000_terms_acceptances.sql:44-60`; `mig/20260923090000_moderation_foundation.sql:1828-1866, 2121-2122` |
| C250 | 10 | Uploads are size-limited; most actions are rate-limited | 02:F43a-F43l; 01:F58; 03:F14 | `src/app/api/me/profile-upload/route.ts:19-26`; `src/lib/rate-limit.ts:52-93` |
| C251 | 10 | No other site can frame Vibe | 05:F98 | `next.config.ts:76, 85` |
| C252 | 10 | No end-to-end encryption; no record of reads | 03:F2; 04:F60 | see C151, C22 |
| C253 | 10 | No two-factor sign-in for users or admins | 01:F17; 04:F51 | `grep \.mfa\., totp, 2fa, aal2` over `src` = nothing; `supabase/config.toml:304-316` |
| C254 | 10 | The session cookie is not HttpOnly | 01:F38 | `node_modules/@supabase/ssr/dist/main/utils/constants.js:4-11` |
| C255 | 10 | Breach notice by email, without unreasonable delay **(promise)** | 07:R57 | `handoffs/legal-drafts/2026-09-07-privacy-policy.md:298` |

## Section 11. The waitlist (all LANDING-NIGHT ONLY)

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C256 | 11 | Form fields: school email (IU or Purdue only), name; optional year, major, clubs, officer tick and club, one line | 06:F1-F6 | LAND: `src/app/waitlist/waitlist-form.tsx:147-203`; `src/lib/waitlist/form.ts:20-39, 131-187` |
| C257 | 11 | University derived from the address; `?src=` tag stored | 06:F7, F8 | LAND: `src/lib/waitlist/form.ts:96-101, 142-145, 190` |
| C258 | 11 | The three ticks, exact words, stored as times; notice version | 06:F9 | LAND: `src/app/waitlist/waitlist-form.tsx:216, 221, 226`; `src/lib/waitlist/store.ts:180-183`; `src/lib/waitlist/form.ts:18` |
| C259 | 11 | A send-log row per waitlist email: kind, domain, time, outcome, Resend message id, keyed hash | 06:F19 | `src/lib/email/send-log-core.ts:92-102, 134-156`; `src/lib/email/send-log.ts:42`; LAND: `src/lib/email/resend-transactional.ts:304` |
| C260 | 11 | The entry stores no IP, browser, device or location | 06:F11 | LAND: `mig/20261003100000_waitlist.sql:163-215` |
| C261 | 11 | The form counts requests by IP | 06:F20 | LAND: `src/app/api/waitlist/route.ts:27, 79-81, 99, 123-124, 165-168`; `src/app/api/waitlist/status/route.ts:28` |
| C262 | 11 | Founder-added rows: address, name, club; first contact is the access-code email | 06:F24, X10 | LAND: `src/lib/waitlist/admin-view.ts:256-308`; `src/lib/waitlist/store.ts:431-454`; `src/app/api/admin/waitlist/add/route.ts:24-27` |
| C263 | 11 | Purposes: confirm the spot, choose each wave, email the code; the source tag shows which link worked | 06 section 1a notice; 06:F7 | LAND: `src/app/waitlist/waitlist-form.tsx:206-212`; `src/lib/waitlist/view.ts:55-64` |
| C264 | 11 | Supabase stores it, Vercel runs the site and the daily clean-up, Resend sends the emails | 06:F63, F64, F65 | LAND: `vercel.json:3-8`; `src/lib/email/resend-transactional.ts:289-325`; `src/app/waitlist/waitlist-form.tsx:206-212` |
| C265 | 11 | Google Fonts and Sentry load on these pages as on every page | 06:F66, F67 | `src/app/layout.tsx:99-103`; `src/instrumentation-client.ts:5`; `src/lib/sentry-config.ts:16-17, 202-205` |
| C266 | 11 | The emails land in the school mailbox; nothing else goes to the universities | 06:F69 | LAND: `src/app/waitlist/confirm/page.tsx:14-16` |
| C267 | 11 | Admins see the list with masked addresses plus name and answers | 06:F36 | LAND: `src/app/api/admin/waitlist/route.ts:36-63`; `src/lib/waitlist/admin-view.ts:41-54, 76-79, 112-144` |
| C268 | 11 | Full address: one at a time, listed founders only, logged before it is shown | 06:F37 | LAND: `src/app/api/admin/waitlist/[id]/reveal/route.ts:47-61`; `src/lib/waitlist/store.ts:86-95` |
| C269 | 11 | The form gives the same answer to everyone | 06:F32 | LAND: `src/app/api/waitlist/route.ts:37-43, 113, 127`; `src/lib/waitlist/store.ts:107-117` |
| C270 | 11 | Up to 40 days after joining; unconfirmed up to 30 days after the last confirm email (the database deletes at 38 and 28) | 06:F42, F43 | LAND: `src/lib/waitlist/types.ts:19-21, 28-35, 59-68`; `mig/20261003170000_waitlist_margin.sql:78-90, 101-135` |
| C271 | 11 | A daily clean-up deletes the whole entry | 06:F44; 04:F90 | LAND: `vercel.json:3-8`; `src/app/api/cron/waitlist-purge/route.ts:37-56`; `src/lib/cron/auth.ts:22-31` |
| C272 | 11 | Re-sending the form while unconfirmed replaces the answers and restarts the clock | 06:F46 | LAND: `src/lib/waitlist/store.ts:205-239`; `mig/20261003170000_waitlist_margin.sql:238-262` |
| C273 | 11 | Confirm link 7 days; code works once, up to 14 days | 06:F47; 01:F70 | LAND: `src/lib/waitlist/tokens.ts:25`; `src/lib/waitlist/access-code.ts:6-19` |
| C274 | 11 | "Take me off the list" in both emails; a second tap; the entry is deleted at once | 06:F48, F49 | LAND: `src/lib/waitlist/email-content.ts:85-91, 133-135, 152, 205`; `src/app/waitlist/confirm/confirm-client.tsx:58, 185-203`; `src/app/api/waitlist/leave/route.ts:40-44` |
| C275 | 11 | Only the newest email's link works | 06:F52 | LAND: `src/lib/waitlist/tokens.ts:5-9`; `src/lib/waitlist/store.ts:229` |
| C276 | 11 | No leave link once joined; the entry goes at the purge or with the account | 06:F51 | LAND: `src/app/waitlist/confirm/confirm-client.tsx:57, 65` |
| C277 | 11 | After deletion: send-log rows without the hash, Resend's own record, founder-action log rows (row id, batch), counters | 06:F50, F57, F60, F23 | LAND: `src/lib/waitlist/store.ts:291-318`; `src/lib/auth/require-platform-admin.ts:157-162, 186-213` |
| C278 | 11 | The sign-up address is written on the entry, and the entry is linked to the account, until the entry is deleted | 06:F15, F16; 01:F66, F67 | LAND: `mig/20261003120000_waitlist_hardening.sql:185-199, 312-331` |
| C279 | 11 | The account's sign-in record keeps a record of the code used (a hash once the scrub migration is applied) | 06:F22; 01:F63, F65 | LAND: `mig/20261003130000_waitlist_code_scrub.sql:4-10, 20-26, 54-76, 108-116` |
| C280 | 11 | Wave tag: batch, form or founder, day invited, day joined; no name, address or answers; deleted with the account | 06:F21; 01:F68 | LAND: `mig/20261003140000_waitlist_retention.sql:78-93, 96-122` |
| C281 | 11 | Waitlist answers are not copied into the profile | 06:F34 | only `src/lib/waitlist/store.ts` reads `waitlist` |
| C282 | 11 | Deleting the account deletes the entry its code redeemed | 06:F55, F56 | LAND: `src/app/api/me/route.ts:139-148`; `src/lib/waitlist/store.ts:320-332` |
| C283 | 11 | An allow list of addresses (address, reason) skips the code | 06:F26; 01:F69 | LAND: `mig/20261003100000_waitlist.sql:150-160` |

## Sections 12 to 15

| ID | § | Claim | Facts | Evidence |
|---|---|---|---|---|
| C284 | 12 | Age is confirmed by a tick at sign-up and on the waitlist form; no date of birth | 01:F2; 06:F9 | see C25, C258 |
| C285 | 12 | For a minor, "close" is the ban tool today, which keeps the hashes; there is no admin delete tool; freeing a school address is hand work **(the rest is a promise)** | 01:T9, T10; 04:P7, F78; 07:R14 | `src/app/api/admin/users/[id]/` has only `route.ts`, `restrict`, `lift`; `src/app/api/admin/users/[id]/lift/route.ts:72-81` |
| C286 | 13 | Consent record: Terms version, time, 18+ confirmed, source screen | 01:F31, F32 | `mig/20260906100000_terms_acceptance.sql:28-43`; `mig/20260906120000_terms_acceptances.sql:44-60` |
| C287 | 13 | One row per acceptance, never overwritten | 01:F32 | `src/app/api/me/accept-terms/route.ts:67-73` |
| C288 | 13 | Not recorded: date of birth, IP, browser, a copy of the page | 01:F33 | `mig/20260906120000_terms_acceptances.sql:44-51` |
| C289 | 13 | The record is deleted with the account | 01:F96 | `mig/20260906120000_terms_acceptances.sql:46` |
| C290 | 13 | One recorded version (the Terms version) covers both documents; changing it re-prompts every account | 01:F34, F35 | `src/lib/legal/terms.ts:1, 15-26`; `src/lib/legal/require-terms.ts:27-38` |
| C291 | 13 | Small corrections add a "Last corrected" line and no new version **(promise)** | 07:R58 | `handoffs/legal-2026-09-29/02-terms-of-service-v2.md:281` |
| C292 | 14 | Choices open to all, free; no sale **(promise; see C107)** | 07:R63 | `handoffs/legal-drafts/2026-09-07-privacy-policy.md:326-328` |
| C293 | 15 | Contact block | 07:R8 | see C24 |

## Not verified

These claims are in the policy but no code line proves them. The first group carries a bracket in the policy. The second group is worded as an aim or a promise.

**Rests on a dashboard, a handoff or a person**

| ID | § | Claim | Why it is not verified | What to check |
|---|---|---|---|---|
| N1 | 1 | Only Francisco Cazares can reach the database, storage and provider dashboards | 04:F59, 05:Q9, 03:Q3: "NOT IN REPO" | Who holds each login and the service key |
| N2 | 1 | help@ lands in the same Gmail inbox; the cofounders read hello@, help@ and vibe.llc@ | 05:F9, Q7; 04:F106: the help@ rule was open on Sept 22 | Cloudflare Email Routing rules; who can open each inbox |
| N3 | 1, 6 | vibe.llc@outlook.com is in use (Microsoft as a provider) | 05:Q7: the address appears nowhere in code | Ask James |
| N4 | 1 | hello@ is forwarded to Gmail (C24a) | handoff of Sept 4 only | Cloudflare dashboard |
| N5 | 1 | All three cofounders hold the admin flag (C12) | handoff of Sept 22 and BUILD.md 6.3; the flag is data | `select handle from users where is_platform_admin` |
| N6 | 6 | The sign-up confirmation email goes through Resend | 05:F11, Q4; 01:F114: a dashboard setting | Supabase Auth SMTP settings |
| N7 | 8 | No database backups (C208) | 04:F96, 05:Q3: plan is not in the repo | Supabase plan page |
| N8 | 3f | Billing and push are off in production | 05:F25, F30: env switches; handoffs | Vercel env: `BILLING_ENABLED`, `PUSH_ENABLED` |
| N9 | 3c | Photos from before late September still carry details (C65) | 02:S15: no record the re-encode ran on production | Run `scripts/count-exif-uploads.mjs` against production, or ask |
| N10 | 11 | The account keeps only a hash of the code | 06:X7, 01:F65: depends on migration `20261003130000` being applied. The policy says "a record of the code", true either way | `list_migrations` on production after the merge |
| N11 | 11 | The daily clean-up runs (keeps "up to 40 days" true) | 06:X4, 04:F90: needs `CRON_SECRET` in Vercel | Vercel env and the cron log |
| N12 | 11 | Who is on the "show full address" list | 06:F37, Q1: `app_settings.waitlist_email_viewers` is data, seeded empty | The setting on production |
| N13 | 9 | Supabase's sign-in security log holds email and IP after deletion | 01:F101, Q1: whether production writes it is an open TODO | Supabase dashboard |
| N14 | 3d | A failed request's details can reach Sentry | 05:F14, Q5: unsure whether bodies are attached on Vercel | Open one server event in Sentry |
| N15 | 6 | No separate agreement with Google Fonts, cdnjs or Gmail (inside a REVIEWER bracket) | from the Sept 7 draft, line 151 | Lawyer question |

**Aims and promises (no code keeps them)**

| ID | § | Promise | Source |
|---|---|---|---|
| P1 | 5h | We read private messages only in three cases | 07:R42 |
| P2 | 5h | Reports looked at within 24 hours (aim) | 04:S4, Q14 |
| P3 | 5i | We share with a university only in three cases; we tell users before a business transfer | 07:R43; Terms v2 line 288 |
| P4 | 4 | News email only to people who ticked the box | 07:R33 |
| P5 | 9 | A copy of your data within 30 days (aim) | 07:R63 |
| P6 | 3g | The recovery proofs we ask for; deleting them within 90 days (aim, DECISION) | 07:R29 |
| P7 | 10 | Breach notice without unreasonable delay | 07:R57 |
| P8 | 12 | A minor's data deleted by hand except what the law requires; school address freed at 18 on request | 07:R14 |
| P9 | 13 | "Last corrected" line for small changes | 07:R58 |
| P10 | 14 | Honor extra rights where a law requires | 07:R63 |
