# Facts: reports, moderation, safety, admin access, retention and clean-up jobs  (read on 2026-10-03, main c71e9a4 + landing-night 21af1a5)

How to read this file
- Paths are relative to the repo root. "mig" = `supabase/migrations/`.
- LIVE NOW = on `main` (production today). LANDING-NIGHT ONLY = arrives when `landing-night` merges.
- I read code, migrations and config only. No database query, no network call. Anything that depends on a dashboard setting (Supabase plan, Auth settings, Vercel env) is marked "NOT IN REPO".
- Moderation is the same on both trees. `git diff main origin/landing-night` shows no change under `src/lib/moderation`, `src/app/api/admin/{reports,users,content,images,orgs,actions}`, `src/app/legal`, `src/app/support`. The only differences in my area are the waitlist admin tab, four new log actions, new IP-keyed counters, and the first cron job (F23, F45, F46, F61, F62, F90, F95).
- Flags: billing (BILLING_ENABLED) and push (PUSH_ENABLED) are OFF in production; the new chat (chat_v2) is on only for the three founders and one test club until Oct 26. Each fact that depends on a flag says so.

## 1. What is collected or stored

### 1a. Reports

| # | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F1 | A report: who filed it, what kind of thing, which thing, a reason code, the reporter's own words, the time | `reports.reporter_id`, `target_type`, `target_id`, `reason_code`, `reason`, `created_at` | Server only (service role). No client grant, no RLS policy. | mig `20260506100000_safety_block_mute_report.sql:79-89`; grants removed in mig `20260923090000_moderation_foundation.sql:2121-2122` |
| F2 | Things that can be reported: post, comment, message, person, chat, club, event | `reports.target_type` CHECK | - | `src/lib/moderation/reports.ts:29-37`; mig `20260923090000:2077-2079` |
| F3 | Reason codes and the labels a student sees: `spam` "Spam", `harassment` "Harassment or bullying", `sexual` "Sexual content", `intimate_image` "An intimate image shared without consent", `child_safety` "Child sexual abuse or exploitation", `hate` "Hate or a slur", `self_harm` "Self-harm", `other` "Something else" | `reports.reason_code` CHECK | - | `src/lib/moderation/reports.ts:55-64, 108-117`; mig `20260927140000_reports_intimate_image_reason.sql:109-112` |
| F4 | Free text limit: 1,000 characters. Longer text is cut, not refused. | `reports.reason` CHECK `length(reason) <= 1000` | - | `src/app/api/me/reports/route.ts:62, 500`; mig `20260506100000:87` |
| F5 | A COPY of the reported thing is stored on the report at filing time ("snapshot"). It is text and links, not the media file itself. | `reports.target_snapshot` (jsonb) | Server only; shown to platform admins on /admin (F53) | mig `20260923090000:2062-2066, 2124-2125` ("What was reported, captured at report time (text, handles, media urls). Student text: it stays in the database and never goes into an email.") |
| F6 | Snapshot of a POST: id, author id, text, media_url, media_thumbnail_url, created_at, club id, plus the author's handle and name | same | same | `src/app/api/me/reports/route.ts:91, 371-387` |
| F7 | Snapshot of a COMMENT: id, author id, post id, text, created_at, plus author's handle and name | same | same | `route.ts:92, 330` |
| F8 | Snapshot of a MESSAGE (a DM, group chat or club chat message): id, sender id, chat id, the message text, media_url, created_at, kind, thread_root_id, the sender's handle and name, and for a poll / sign-up / event card the card as the reporter saw it (question, options, vote COUNTS; "No voter names, no ids of people") | same | same | `route.ts:65, 331-338, 540-546`; `src/lib/chat/cards/snapshot.ts:1-13, 50-60` |
| F9 | Snapshot of a PERSON: id, handle, name, tagline, bio | same | same | `route.ts:329, 361` |
| F10 | Snapshot of a CHAT: id, type, name, club id, created_at (no messages, no member list) | same | same | `route.ts:339` |
| F11 | Snapshot of a CLUB: id, handle, name, description, owner id. Of an EVENT: id, title, description, creator id, club id, starts_at | same | same | `route.ts:340-345` |
| F12 | Who owned the reported thing when it was reported (an account id, no foreign key, so it survives that account's deletion) | `reports.target_owner_id` | Server only | mig `20260923090000:2059-2061` |
| F13 | Outcome of the report: status (`open` / `actioned` / `dismissed`), which admin closed it, when, and the admin's note (up to 2,000 chars). For a takedown the note is the same sentence the author is shown. | `reports.status`, `resolved_by`, `resolved_at`, `resolution_note` | Server only | mig `20260923090000:2054-2058, 2069-2071`; `src/app/api/admin/content/remove/route.ts:289-296` |
| F14 | When the founders were emailed about this report | `reports.admin_alerted_at` | Server only | mig `20260923090000:2067`; `src/lib/moderation/alerts.ts:100-106` |
| F15 | A counter of how many reports this account filed in the current hour (limit 10 per hour) | `rate_limits.key = 'report:<user id>'` | Server only | `src/app/api/me/reports/route.ts:513` |
| F16 | One open report per person per thing. Reporting again while it is open stores nothing new and answers "ok". | unique partial index | - | mig `20260923090000:2109-2111`; `route.ts:532, 575` |

Rules around filing (not storage, but the policy will describe them)
- F17. Any signed-in account that has accepted the Terms and is not suspended or banned can report. A verified school email is NOT required. `src/app/api/me/reports/route.ts:516-519` ("Unverified students CAN report").
- F18. You cannot report yourself or your own content. `route.ts:507-509, 527-529`.
- F19. You can only report something you can see (or something hidden from you only because of a block). `route.ts:264-290`.
- F20. There is NO way to file a report without an account inside the app. A person with no account reports by email to help@connectvibe.app (`src/app/legal/community/page.tsx:217-225`). Emails to that inbox are not stored by the app; the mailbox itself is NOT IN REPO.

### 1b. Emails sent to the founders about a report

| # | What | Where | Who can read | Evidence |
|---|---|---|---|---|
| F21 | Every new report triggers one email to each platform admin's sign-in address. Body: "Someone reported a post on Vibe.", the reason label, "This target now has N open reports.", a link to /admin. No reported text, no reporter, no target id. At most one alert per reported thing per hour. | Sent through Resend; logged in `email_sends` (kind `moderation_alert`) as a keyed hash of the recipient plus a coarse domain | The three founders' inboxes; Resend | `src/lib/moderation/alerts.ts:108-122, 46-47, 164-175`; mig `20260923090000:93-99` |

### 1c. The moderation log

| # | What | Where | Who can read | Evidence |
|---|---|---|---|---|
| F22 | One row per thing a moderator did: who did it, what, to what, the linked report, a reason, extra details, the time. Nobody can edit or delete a row, including the server (a trigger refuses UPDATE and DELETE for every role). No foreign keys, so the ids keep standing after the accounts are gone. | `moderation_actions` (`actor_id`, `action`, `target_type`, `target_id`, `report_id`, `reason`, `meta`, `created_at`) | Server only; shown to platform admins on /admin "Log" tab (F56) | mig `20260923090000:1894-1961` |
| F23 | Actions recorded: report_dismiss, report_action, post/comment/message remove and restore, org_hide/unhide/verify/unverify, user_suspend, user_ban, user_lift, image_remove, image_restore. LANDING-NIGHT ONLY adds waitlist_invite, waitlist_add, waitlist_remove, waitlist_reveal. | `moderation_actions.action` | same | mig `20260923090000:1899-1905`; mig `20260929100000_moderation_image_actions.sql:129-136`; `git diff main origin/landing-night -- src/lib/auth/require-platform-admin.ts` |
| F24 | What the `meta` details hold, per action. Content takedown: flags, the ids of the reports it closed, the AUTHOR's account id, the club id. Suspend/ban: the student's HANDLE at the time, days, end date, restriction id, whether a private note exists. Lift: handle, count. Club hide: club handle. Photo takedown: the student's or club's handle, the OLD PHOTO ADDRESS(ES) that were in the slot (`previous`), storage paths moved, report ids. | `moderation_actions.meta` | same | `src/app/api/admin/content/remove/route.ts:183-191`; `src/app/api/admin/users/[id]/restrict/route.ts:183-192`; `.../lift/route.ts:103`; `src/app/api/admin/orgs/[slug]/hide/route.ts:165-169`; `src/app/api/admin/images/remove/route.ts:183-192` |
| F25 | `reason` on a takedown row is the sentence shown to the author (max 500 chars). On a suspend/ban row it is the reason CODE only. | `moderation_actions.reason` | same | `content/remove/route.ts:27, 107, 182`; `restrict/route.ts:182` |
| F26 | The code says no email, token or reported text is ever written to the log. I found none in the writers listed in F24. | - | - | `src/lib/moderation/actions.ts:579-580` ("NOTHING PERSONAL IN `meta`. Ids, counts and flags only") - note a handle and a photo address ARE written (F24), so "nothing personal" is too strong. |

### 1d. Suspensions and bans

| # | What | Where | Who can read | Evidence |
|---|---|---|---|---|
| F27 | A restriction record: kind (suspension or ban), start, end (a ban has none), reason code, a private moderator note (up to 2,000 chars, never shown to the student), who set it, when lifted and by whom, the account id, and a scrambled code made from the email | `account_restrictions` (`kind`, `starts_at`, `ends_at`, `reason_code`, `note`, `created_by`, `lifted_at`, `lifted_by`, `user_id`, `identity_key`, `key_kind`) | Server only. Platform admins see everything except `identity_key` on /admin (F55). The student sees kind, end date and a plain sentence for the reason code (F69). | mig `20260923090000:1828-1869` |
| F28 | The scrambled code is HMAC-SHA256 of the canonical email, keyed with a server secret (`RESTRICTION_PEPPER`). Up to TWO rows are written per restriction: one for the school email (`key_kind = 'school'`), one for the sign-in email (`'personal'`). The school one is what blocks re-verifying that school email on a new account. The personal one is stored but nothing checks it. | `account_restrictions.identity_key` | Server only; never returned by any route | `src/lib/moderation/identity.ts:105-125`; `src/lib/moderation/actions.ts:142-171, 394-407`; `src/app/api/admin/users/[id]/route.ts:51-55` |
| F29 | A copy of the restriction (kind + end date only) is written onto the Supabase Auth user so pages can redirect without a database read | Supabase Auth `app_metadata.restriction` | The student's own session token carries it; Supabase | `src/lib/moderation/actions.ts:173-212` |
| F30 | Restriction reason codes and what the student reads: spam "Spam, or pretending to be a lot of people."; harassment "Harassing or bullying someone."; sexual "Sexual content."; hate "Hate speech."; self_harm "Content about hurting yourself or someone else."; impersonation "Pretending to be someone else."; ban_evasion "Coming back after a ban."; fallback "Something on your account broke the Vibe rules." | `account_restrictions.reason_code` (no CHECK) | - | `src/lib/moderation/reports.ts:222-247` |

### 1e. Removed content and files kept as evidence

| # | What | Where | Who can read | Evidence |
|---|---|---|---|---|
| F31 | A takedown is a "soft" removal. The post, comment or message row STAYS, stamped with when it was removed, which admin removed it, and the reason sentence. | `posts`, `post_comments`, `messages`: `removed_at`, `removed_by`, `removed_reason` | The author (own row only) and the server. Nobody else. | mig `20260923090000:2127-2147`; `src/app/api/admin/content/remove/route.ts:143-152` |
| F32 | A removed post's photo and a video's poster frame are MOVED out of the public `profiles` bucket into a private bucket called `quarantine`, at the same path (`<author id>/posts/<file>`, `<author id>/posters/<file>`). | Supabase Storage bucket `quarantine` (`public = false`, no access policy) | Server only. A platform admin gets a 2-minute signed preview link for removed PROFILE photos (F52). There is no admin preview for a removed post's photo. | mig `20260927130000_quarantine_bucket.sql:101-104`; `src/lib/moderation/media-quarantine.ts:1-43`; `content/remove/route.ts:235-267` |
| F33 | A removed post's VIDEO file is not moved. It stays in Cloudflare R2 (`clips/<author id>/...`), which was never public; the media route refuses to sign a link for a removed post. | Cloudflare R2 | Server only | `content/remove/route.ts:48-49`; `media-quarantine.ts:20-21` |
| F34 | A moderator can also take down one PHOTO without removing a post: a profile photo, cover, the logos on experience / working-on entries, a club logo or banner, a group chat photo. The column is cleared; the student's own file moves to `quarantine`; club and group-chat files (R2) stay where they are. The log row is the only record of what was there (F24). | `quarantine` bucket; R2; `moderation_actions.meta.previous` | Server; platform admins | `src/app/api/admin/images/remove/route.ts:57-98, 197-204` |
| F35 | When a photo is taken down, older unused copies of that student's profile photo / cover in their storage folder are swept into `quarantine` too. | `quarantine` bucket | Server only | `src/app/api/admin/images/_lib/sweep.ts:10-17` |
| F36 | Files also go to `quarantine` WITHOUT any moderator decision, just because a report is open: (a) a post the author deletes while a report about it is open; (b) a profile photo or cover the student replaces or removes while a report about them is open; (c) on account deletion, files of posts with an open OR actioned report, files of removed posts, and the current profile photo and cover if a report about the account is open. | `quarantine` bucket | Server only | `src/lib/posts/delete-media-store.ts:24-29, 176-185`; `src/lib/media/profile-photo-retire.ts:16-20, 122-136`; `src/lib/profile/storage-purge.ts:57-64, 262-341` |
| F37 | Club officers (owner, admin, mod) can remove someone else's message in a club chat. The message is marked removed with the fixed reason "Removed by a club officer."; who removed it and their club role go to a separate table. NEW CHAT ONLY (chat_v2: on in production for the three founders and one test club; everyone on Oct 26). | `messages.removed_at`, `removed_reason`; `chat_removals` (`message_id`, `removed_by`, `removed_role`, `removed_at`) | `chat_removals`: server only, and NO route reads it back (grep `chat_removals` in `src`: only the writer). The author still sees their own removed message. | `src/app/api/me/threads/[id]/messages/[messageId]/route.ts:39-55, 183-206`; mig `20261001110000_chat_v2_cards.sql:649-656`; `src/lib/chat/room-rules.ts:31` |

### 1f. Block and mute lists

| # | What | Where | Who can read | Evidence |
|---|---|---|---|---|
| F38 | Who you blocked and when | `blocks` (`blocker_id`, `blocked_id`, `created_at`) | Both people in the pair can read the row through the data API (policy `blocks_select_either`); the app does not show the blocked person a notice | mig `20260506100000:15-42`; mig `20260515000000_blocks_select_either_party.sql:16-18` |
| F39 | Who you muted, when, and optionally until when | `mutes` (`muter_id`, `muted_id`, `until`, `created_at`) | Only you | mig `20260506100000:44-77` |
| F40 | A suspended or banned student can still block and mute (neither gate applies). | - | - | `src/lib/moderation/access.ts:27-28` |

### 1g. The word filter (the only automated moderation)

- F41. A small word list is checked before text is saved (names, bios, taglines, posts, comments, messages, events). A match answers "That includes words that aren't allowed on Vibe" and the text is NOT saved. The matched word is never echoed and NOTHING is stored about the attempt (no table, no counter). `src/lib/moderation/text-filter.ts:1-27`; `src/lib/moderation/access.ts:129-144`.
- F42. There is NO image scanning, NO CSAM hash matching, NO automated duplicate-image detection. Greps: `grep -rn -i "photodna\|csam\|perceptual\|phash\|hash.*image" src` returned nothing relevant; the Sept 29 audit says the same (`handoffs/legal-2026-09-29/00-code-facts.md:333`).

### 1h. Rate-limit counters

| # | What | Where | Who can read | Evidence |
|---|---|---|---|---|
| F43 | One row per (key, time window) with a count. The key is a text label plus an identifier. | `rate_limits` (`key`, `window_start`, `count`) | Server only | mig `20260903100000_security_hardening.sql:279-286` |
| F44 | Keys that hold an IP ADDRESS, LIVE NOW: `pw-reset-ip:<full IP>` (15-minute windows); `school-email-ip:<IPv4, or the /64 of an IPv6>`; `school-code-ip:<same>` | same | same | `src/app/api/auth/password-reset/route.ts:35-38`; `src/app/api/auth/school-email/request/route.ts:165`; `.../confirm-code/route.ts:119`; `src/lib/rate-limit.ts:51-93` |
| F45 | Keys that hold an IP, LANDING-NIGHT ONLY (waitlist form, no account): `waitlist-net:<network>`, `waitlist-confirm-net:<network>`, `waitlist-token-net:<network>` | same | same | landing tree `src/app/api/waitlist/route.ts:80, 165`; `.../confirm/route.ts:28`; `.../leave/route.ts:24`; `.../status/route.ts:28` |
| F46 | Keys that hold a KEYED HASH of an email (not the address): `pw-reset-email:<hash>` LIVE NOW; `waitlist-email:<key>` LANDING-NIGHT ONLY | same | same | `password-reset/route.ts:54-60` ("Keyed on a hash, never the address"); landing `src/app/api/waitlist/route.ts:124` |
| F47 | Every other key holds an account id (for example `report:<id>`, `admin-write:<id>`, `message-remove:<id>`). | same | same | `src/app/api/me/reports/route.ts:513`; `src/lib/auth/require-platform-admin.ts` (adminWriteKey) |

### 1i. Otto

| # | What | Where | Who can read | Evidence |
|---|---|---|---|---|
| F48 | Otto settings: chattiness (quiet / moderate / loud), RSVP day-before reminders, mention pings, milestone pings, daily summary on/off and its time, unanswered-DM pings | `users.otto_settings` (jsonb) | Only you, through the server (column is not readable through the data API) | `src/app/api/me/otto/route.ts:38-56, 181-189`; mig `20260512000000_otto_reminders_and_settings.sql:16-17` |
| F49 | Otto reminders: a title (max 240 chars), an optional note (max 1,000), an optional time, and when it was shown / dismissed / acted on. Kinds: manual, rsvp, mention, milestone, unanswered_dm, connection. | `otto_reminders` | Only you (RLS own-row) | mig `20260512000000:19-34, 40-60`; `src/app/api/me/otto/reminders/route.ts:6-7, 59-64` |
| F50 | Otto is rule-based code. No AI or language-model vendor: `package.json` has no anthropic / openai / gemini / ai-sdk dependency, and `grep -rn -i "anthropic\|openai\|gemini\|\bllm\b" src` finds only two comments, both saying it is not an LLM. | - | - | `src/lib/otto/parse-reminder.ts:4` ("Deliberately not an LLM."); `src/components/otto/OttoTellInput.tsx:24` |

## 2. Who can see it

### 2a. The platform admins (the three founders)

- F51. A platform admin is any account with `users.is_platform_admin = true`. The flag is set by hand in SQL; no screen sets it. Handoffs say all three founders hold it in production (`handoffs/2026-09-22-session-64-stripe-redaction-and-moderation.md:118`: "all three already hold `is_platform_admin` in production"). Gate: `src/lib/auth/require-platform-admin.ts:21-75` (API, 401/403) and `:92-108` (page, answers "not found" to everyone else). Admin sign-in is a password only: no code asks for a second factor (`grep -rn -i "aal2\|mfa\." src` = nothing).
- F52. PHOTO PANEL. For one account, club or group chat, an admin sees the current profile photo, cover, experience / working-on logos, club logo and banner, or group-chat photo, and a 2-minute signed preview of a photo that was taken down. "Reads only the photo columns ... No emails, no other profile fields." `src/app/api/admin/images/route.ts:24-50, 157-161`.
- F53. REPORTS TAB. Per reported thing an admin sees: the snapshot TEXT (post text, comment text, MESSAGE text including a reported DM, bio, club or event description), a "has media" badge (not the picture itself), the owner's handle and name as captured and as now, whether the thing is still up / removed / hidden, the owner's current restriction, each report's reason, the reporter's own words, the time, and the REPORTER'S HANDLE. `src/app/api/admin/reports/route.ts:73-75, 284-326`; `src/app/admin/reports-client.tsx:29-31, 195-236, 778-780`. The code comment: "THE SNAPSHOT IS THE MOST PRIVATE THING ON THIS PAGE — for a `message` target it is somebody's DM."
- F54. USERS TAB. Search by handle, name, or an EXACT email (sign-in or school). The answer never contains an email: `id, handle, name, school_verified, restriction, openReportCount`. But an exact-email search does tell the admin which account owns that address. Search text is not logged or put in the URL. `src/app/api/admin/users/route.ts:30-54, 74-90, 127-138`; `src/app/admin/users-client.tsx:6-13`.
- F55. ONE STUDENT'S RECORD. Handle, name, school-verified yes/no, admin yes/no, join date, the restriction in force, EVERY past restriction (kind, dates, reason code, the PRIVATE NOTE, which admin set and lifted it, whether keyed on school or personal email), and every moderation action about them or their content. "NO EMAIL, EVER, AND NO `identity_key`." `src/app/api/admin/users/[id]/route.ts:44-71, 84-136, 166-186`.
- F56. LOG TAB. Every row of the moderation log (F22-F25) with the acting admin's handle. `src/app/api/admin/actions/route.ts:30-49, 96-111`.
- F57. CLUBS TAB. Every club, hidden ones included: handle, name, description, logo, public/private, verified, hidden, last activity, member count, join policy, audience. `src/app/admin/page.tsx:70-108`; `src/app/api/admin/orgs/route.ts:50-52`.
- F58. WHAT THE ADMIN SCREENS DO NOT SHOW (I read every route under `src/app/api/admin/**` and every file in `src/app/admin/`): no email address, no school email, no password data, no resume, no message or chat other than a REPORTED message's snapshot, no chat member lists, no DMs browse, no profile-view or post-view lists, no billing data, no IP address, no removed post's photo or video (only the "has media" badge and the stored link).
- F59. WHAT ONLY DATABASE ACCESS GIVES (Supabase dashboard or the service key, outside the app): everything, including all messages, emails, the private columns, the `quarantine` bucket and Supabase's auth audit log. Who holds that access is NOT IN REPO. The Sept 7 draft says only Francisco Cazares does (`handoffs/legal-drafts/2026-09-07-privacy-policy.md:13`); nothing in the code confirms or contradicts it.
- F60. NO AUDIT LOG OF ADMIN READS, LIVE NOW. Opening the reports queue, a student's record or a photo preview writes nothing. Only WRITES are logged (F22). Greps: `grep -rn -i "audit_log\|admin_reads\|access_log\|read_log" src supabase/migrations` = only a comment in the delete-account page.
- F61. LANDING-NIGHT ONLY: WAITLIST TAB. Admins see every waitlist entry (up to 2,000): a MASKED email (`f*****@iu.edu`), name, school, class year, major, clubs, officer yes/no and which club, what they'd want, source, dates, and the handle of the account that later joined. Landing tree `src/app/api/admin/waitlist/route.ts:11-35`; `src/lib/waitlist/admin-view.ts:34-55, 76-80`.
- F62. LANDING-NIGHT ONLY: the ONE logged read. "Show email" returns one person's full address, only to the account ids listed in `app_settings.waitlist_email_viewers` (seeded empty; the route comment says "production: Franky"), and only after a `waitlist_reveal` row is written to the moderation log ("NO REVEAL WITHOUT ITS LOG ROW"). Landing tree `src/app/api/admin/waitlist/[id]/reveal/route.ts:19-34, 46-61`; mig `20261003100000_waitlist.sql:149`.

### 2b. The reporter and the reported person

- F63. REPORTER IDENTITY. Stored as `reports.reporter_id`. Shown on the admin Reports tab as a handle only ("A handle and nothing else. Null once the reporter deletes their account", `src/app/api/admin/reports/route.ts:321-322`). Never sent to the reported person: no route returns reports to a student, and the table has no client grant (F1). Not in the founders' alert email (F21).
- F64. What the reporter is told. In the sheet: "Reports go to Vibe admins only. The person you're reporting won't see this." and after sending "Thanks — we're on it." / "We'll hide it from your feed." (`src/components/safety/ReportSheet.tsx:255, 218, 225`). The reporter gets NO later message about the outcome: there is no notification type for reports (types are follow / like / comment and later additions; none for a report). `/legal/community`: "We don't send you a play-by-play of what happened to someone else's account".
- F65. The reported person is NOT notified that a report was filed. If their content is removed they see a notice in its place (F67). If they are suspended or banned they see `/account/suspended` (F69). No email is sent to them in either case (grep `resend` under `src/lib/moderation`: only `alerts.ts`, which emails admins).
- F66. A post you reported disappears from YOUR feed at once and stays out whatever the decision (`src/app/api/feed/route.ts:150-156`, up to your 100 newest post reports).

### 2c. The author of removed content, and everyone else

- F67. The author still sees their own removed post, comment or message, with "Removed by Vibe moderators" and the reason sentence the moderator wrote (`public/html/_postViewer.js:640`; `public/html/profile.html:9818`; `public/html/messages.html:1413`; `src/components/safety/ReportSheet.tsx:696`). For a club-officer removal the text is "Removed by a club officer." Through the data API the author's own removed row also carries `removed_by`, which for a platform takedown is the ADMIN'S ACCOUNT ID (mig `20260923090000:190-195`: "removed_by (a founder's uuid) reaches the author of the removed thing and nobody else"). Officer removals leave it null on purpose.
- F68. Everyone else: the removed thing is gone, and it stops counting toward likes, comments and views. Removing a POST also hides every comment under it from everyone but each comment's own author (mig `20260923090000:132-137`).
- F69. A suspended or banned student. To everyone else their profile, posts and comments do not come back at all: "Restricted and deleted looking identical is a feature ... no screen announces that a named student was suspended" (mig `20260923090000:139-164`). In a DM the thread stays and shows a nameless peer. To themselves: every page redirects to `/account/suspended` except `/legal/*` and a few sign-in pages (`src/proxy.ts:145-157, 246-248`). That page says "Your account is paused." or "Your account is closed.", the end date for a suspension, "What happened: <reason sentence>", and "If you think we got this wrong, email help@connectvibe.app and tell us what we missed. A person reads it." (`src/app/account/suspended/page.tsx:262, 316-367`). The private note is never shown. Sign-in is never blocked, for a ban either (`src/lib/moderation/actions.ts:34-39`).

### 2d. Club officers, and people outside Vibe

- F70. Club officers see NO reports, not even reports about their own club or its posts (the `reports` table has no client access; no club route reads it). They can remove a club-chat message (F37) unless a report on it is open: then the answer is `report_open` and Vibe's moderators handle it (`src/app/api/me/threads/[id]/messages/[messageId]/route.ts:167-181`). That refusal does tell the officer a report exists on that message.
- F71. Anyone on the internet: nothing in this area. But a removed PUBLIC photo "can take a few days to disappear from every cache", and "Link previews already shared in other apps keep their own copy, which Vibe can't reach." (`src/lib/moderation/media-quarantine-images.ts:88-92`; `src/lib/posts/delete-media-store.ts:37-38`).

## 3. How long it is kept and what deletes it

Headline: in this whole area the code enforces a time limit in only three places: rate-limit counters (F83), the push queue (F84) and, on landing-night, the waitlist (F90). Everything else is kept until someone deletes it by hand. "Up to a year" is a written promise with no job behind it.

### 3a. Reports, the log, restrictions

- F72. REPORTS ARE NEVER DELETED. No code deletes from `reports` (grep `from("reports")` across `src`: selects, inserts and updates only) and no job exists. The migration says so: "Nothing deletes a report today (they are closed, never removed)" (mig `20260923090000:1912`). Closed reports (actioned or dismissed) stay too.
- F73. When the REPORTER deletes their account: `reporter_id` becomes null (`ON DELETE SET NULL`, mig `20260506100000:81`). Everything else on the row stays, including the words they typed. The admin screen then shows "an account that's gone" (`src/app/admin/reports-client.tsx:780`).
- F74. When the REPORTED PERSON deletes their account: the report stays whole. `target_owner_id` has no foreign key ("the owner may delete their account, and the report still has to say who it was about", mig `20260923090000:2059-2061`), and the snapshot keeps their text, handle, name and (for a person report) bio. `target_id` has no foreign key either, so deleting the reported post, comment or message does not touch the report.
- F75. When an ADMIN deletes their account: `reports.resolved_by` and the content's `removed_by` go null; the log row keeps the admin's id (no foreign key) and shows no handle.
- F76. THE MODERATION LOG IS PERMANENT. A trigger refuses every UPDATE and DELETE, "for the service role and for postgres too" (mig `20260923090000:1938-1958`). It keeps account ids, the handle at the time (suspend / ban / lift / photo takedown) and the old photo address (photo takedown) after the account is gone (F24). Removing a row needs someone to disable the trigger by hand in SQL (the recipe is in the migration comment, `:1940-1943`).
- F77. RESTRICTION RECORDS ARE NEVER DELETED by any code. An expired suspension stays as history ("An expired suspension needs no job to clear it: it simply stops matching", `src/lib/moderation/access.ts:82-84`). A lifted one stays with `lifted_at`. On account deletion `user_id`, `created_by`, `lifted_by` go null and the scrambled email code, kind, dates, reason code and PRIVATE NOTE stay (mig `20260923090000:1809-1827`). This is true for a SUSPENSION as well as a ban, and for BOTH the school-email code and the sign-in-email code (F28).
- F78. A ban on a deleted account cannot be lifted from the admin screen: the lift route looks the account up first and answers 404 (`src/app/api/admin/users/[id]/lift/route.ts:72-81`), and `liftRestriction` finds rows by `user_id`, which is null by then (`src/lib/moderation/actions.ts:484-489`). Freeing that school email needs hand-written SQL.

### 3b. Removed content and quarantined files

- F79. A removed POST cannot be deleted or edited by its author: "A moderator took this post down, so it can't be deleted." (`src/app/api/posts/[id]/route.ts:402-403, 416-418`; database rule in mig `20260929110000_post_club_deletes.sql:276-277`). It stays until an admin restores it or the author deletes the whole ACCOUNT, when the row is erased with everything else.
- F80. A removed COMMENT or MESSAGE row can still be hard-deleted by its author (the delete rules for those two tables were left alone, mig `20260923090000:201-210`). The app has no comment-delete button; a sender can delete their own message "also when a report is open" (`src/app/api/me/threads/[id]/messages/[messageId]/route.ts:96-109`). What survives is the report's snapshot and the log row.
- F81. Deleting a CLUB keeps its moderator-removed posts: they are detached from the club and stay removed (trigger `orgs_keep_removed_posts`, mig `20260929110000:54-60, 299-312`). Logos / banners a moderator took down and files named by an open report are kept in R2 (`src/lib/posts/delete-media-store.ts:203-238`).
- F82. NOTHING DELETES FROM THE `quarantine` BUCKET. I searched every use of the bucket (`grep -rn "QUARANTINE_BUCKET_ID\|quarantine" src scripts`): files are moved IN (takedown, open report, account deletion), moved BACK on a restore (`releaseQuarantinedObjects`), or previewed with a signed link. There is no remove call, no cron, no script. Account deletion skips it on purpose: "KEPT: this purge never touches the quarantine bucket. They are the record of what was removed, kept for up to a year until the lawyer says how long" (`src/lib/profile/storage-purge.ts:35-42`). So "up to a year" (live privacy page, delete-account page, Terms v2) is NOT enforced: today a quarantined file stays forever.
- F82b. Same for evidence VIDEOS in R2: on account deletion the videos of removed posts and of posts with an open or actioned report are skipped (`storage-purge.ts:43-45, 371-374`) and nothing deletes them later. A video kept because a post was deleted under an open report (`delete-media-store.ts:176-185`) also stays after the report is closed, even if it is dismissed.
### 3b-2. The two clean-ups that do exist on main (both opportunistic, neither scheduled)

- F83. RATE-LIMIT COUNTERS: rows older than ONE DAY are deleted, but only when a limiter call happens to roll under 1% ("IF random() < 0.01 THEN DELETE ... WHERE window_start < now() - interval '1 day'", mig `20260922090000_guard_function_privileges.sql:229-232`). No schedule. At low traffic an IP-bearing row can sit for days or weeks; the email-log migration admits it "can outlive a deleted account by weeks" (mig `20260922104000_email_sends.sql:26-37`). Account deletion does not remove them.
- F84. PUSH QUEUE (`push_outbox`): finished rows older than 7 days are deleted the same 1%-per-call way (mig `20260924120000_push_notifications.sql:634-641`). Push is OFF in production today. On suspension or ban the student's registered devices (`push_devices`) are deleted at once (`src/lib/moderation/actions.ts:244-265`).

### 3c. Things with no time limit at all

- F85. EMAIL SEND LOG (`email_sends`, including the founders' report alerts): no automatic deletion. A 180-day delete exists only as a comment for a human to run ("RETENTION (manual, Franky's yes, as needed)", mig `20260922104000:123-124`). On account deletion a trigger clears the recipient hash; the row keeps kind, coarse domain, provider message id, outcome and time (`:14-19`).
- F86. NOTIFICATIONS: no expiry. A row goes when either account, the post or the comment it points at is deleted (foreign keys cascade, mig `20260504150000_notifications.sql:12-21`), or when you delete it yourself (policy `notifications_delete_own`, `:45-48`). The badge count only LOOKS at 30 days (`src/app/api/me/notifications/count/route.ts:12`); nothing is deleted at 30 days.
- F87. PROFILE-VIEW and POST-VIEW history: no expiry. One row per viewer per profile (or post) per day; rows go only when the viewer's or owner's account (or the post) is deleted (mig `20260513000000_profile_views_and_user_view_count.sql:30-37`; mig `20260508110000_post_views.sql:18-23`).
- F88. BLOCKS and MUTES: until you undo them or either account is deleted (cascade, mig `20260506100000:17-18, 46-47`). A mute with an `until` date is not deleted when it passes; it just stops applying (`:136-141`).
- F89. OTTO reminders and settings: until you delete the reminder or the account (cascade, mig `20260512000000:21`). No expiry on dismissed reminders.
- F90. SCHEDULED JOBS. LIVE NOW: none. `main` has no `vercel.json` (`git ls-tree main --name-only | grep vercel` = `.vercelignore` only), no `src/app/api/cron/`, and no `pg_cron` anywhere (`grep -rn -i "pg_cron\|cron\.schedule" supabase/` = nothing). LANDING-NIGHT ONLY: one job. `vercel.json` runs `/api/cron/waitlist-purge` daily at `17 8 * * *` (08:17 UTC). It deletes every waitlist entry 38 days after it joined and an unconfirmed one 28 days after its last confirm email, inside the promised 40 / 30 days (landing tree `src/app/api/cron/waitlist-purge/route.ts:14-34`; mig `20261003170000_waitlist_margin.sql:78-90`). It only runs if `CRON_SECRET` (16+ chars) is set in Vercel; otherwise every call is refused and the purge "did not run" (`src/lib/cron/auth.ts`, `route.ts:38-44`). The same purge also runs at most hourly when someone uses the form or opens the admin Waitlist tab.
- F91. A SUSPENSION ends by itself: every check compares the end date to now. No job, nothing to clean up (F77).

### 3d. Link and code lifetimes (nothing is stored for these)

- F92. School-email verification LINK: 48 hours (`src/lib/auth/school-email-token.ts:49`, `ttlSeconds = 60 * 60 * 48`). Stateless signed token; no table.
- F93. School-email verification CODE (8 digits): 30-minute windows, the current and previous window are accepted, so a code works for at least 30 and at most 60 minutes (`school-email-token.ts:98-105`). The app tells the student "codes work for 30 minutes" (`src/app/api/auth/school-email/confirm-code/route.ts:133`). Terms v2 says "valid up to an hour" (`handoffs/legal-2026-09-29/02-terms-of-service-v2.md:67`). Both are defensible; pick one wording.
- F94. Password-reset and sign-up confirmation links, and session length, are Supabase Auth settings. The LOCAL config says `otp_expiry = 3600` (1 hour) and `jwt_expiry = 3600` (`supabase/config.toml:232, 160`). The PRODUCTION values live in the Supabase dashboard: NOT IN REPO. Do not print a number without checking the dashboard.
- F95. LANDING-NIGHT ONLY: a waitlist access code lasts 14 days or until its entry's deletion moment, whichever is sooner (landing tree `src/lib/waitlist/types.ts:202`; mig `20261003170000:13-16`).

### 3e. Backups and provider logs

- F96. BACKUPS. Nothing in the repo turns backups on or states a window. The handoffs say production has none: "production has no backups on the free plan" (`handoffs/2026-09-30-session-71-audit-chat-waves-1-2.md:1206`); "Supabase Pro (backups and session limits) | Before students arrive; until then the Terms say 'no backups'" (`handoffs/legal-2026-09-29/12-results.md`, call 19); "Privacy page's 'backups up to 30 days' is unverified against the Supabase plan" (`handoffs/2026-09-24-session-65-installable-app-and-store-shell.md:89`). The delete-account page carries a TODO: "no backup-retention number until you confirm the Supabase plan's backup window (and whether PITR is on)" (`src/app/legal/delete-account/page.tsx:47-49`). The plan itself is NOT IN REPO.
- F97. SUPABASE AUTH AUDIT LOG. `auth.audit_log_entries` has no link to the account, so account deletion leaves its rows, "which carry the email address ... and, on hosted Supabase, the IP address" (`src/app/legal/delete-account/page.tsx:44-54`, with a TODO to check whether production writes it and for how long). NOT IN REPO.
- F98. APPEALS leave no record in the app. An appeal is an email to help@connectvibe.app; there is no form and no table. What the app records is the outcome: a `user_lift` log row and "Lifted: <note>" appended to the restriction's private note (`src/lib/moderation/actions.ts:446-461`), or a `*_restore` log row and the files moved back out of quarantine (`src/app/api/admin/content/restore/route.ts:294, 338`). Restoring does not reopen the reports (`actions.ts:813-816`).

## 4. Third parties that receive it

| # | Who | What they hold or receive in this area | Evidence |
|---|---|---|---|
| F99 | Supabase (database, sign-in, file storage) | Reports and their snapshots (including reported DMs), the moderation log, restriction records and the scrambled email codes, the private `quarantine` bucket, the restriction copy on the auth user (F29), rate-limit rows with IP addresses, the auth audit log | F1-F30, F32, F43-F47, F97 |
| F100 | Cloudflare R2 (file storage) | Videos kept as evidence; club logos / banners and group-chat photos a moderator took down (they stay in R2, unlinked) | F33, F34, F82b |
| F101 | Resend (email sending) | The founders' report alerts only: the three founders' sign-in addresses and a body with no student data (F21). NO moderation email is ever sent to a student: not on a report, a takedown, a suspension, a ban or a lift (`grep -rln -i "resend\|sendLogged\|emails.send" src/lib/moderation src/app/api/admin src/app/account` = `alerts.ts` only). | `src/lib/moderation/alerts.ts:164-170` |
| F102 | Stripe (payments) | On a BAN the code deletes the student's Stripe customer, which cancels Vibe+ with no refund; a suspension leaves billing running. Billing is OFF in production today (BILLING_ENABLED), so this path does nothing yet. | `src/lib/moderation/actions.ts:267-325` |
| F103 | Vercel (hosting) | Runs the admin routes; its server logs get moderation log lines. The code's rule is ids and counts only, "NEVER LOG AN EMAIL" (`src/lib/moderation/actions.ts:68-71`); I saw post ids, account ids and error text in the `console.error` calls, no addresses and no reported text. LANDING-NIGHT ONLY: Vercel Cron calls the waitlist purge once a day (F90). | `src/app/api/admin/content/remove/route.ts:129, 258`; landing `vercel.json` |
| F104 | Apple / Google push services | Not in this area's data. A restricted account's devices are deleted and skipped (F84). Push is OFF in production. | `src/lib/moderation/actions.ts:244-265` |
| F105 | NCMEC and law enforcement | NO code path. There is no CyberTipline integration, no export tool, no hash matching (F42). Any report to NCMEC or the police would be made by a founder by hand. The public promise: "We escalate to law enforcement and to the National Center for Missing & Exploited Children (NCMEC) where the law requires it or where we believe a child is at risk." | `src/app/legal/child-safety/page.tsx:126-130`; grep `ncmec\|cybertip` in `src` = that page and one code comment only |
| F106 | The mailbox behind help@connectvibe.app | Appeals, intimate-image removal requests, child-safety reports, deletion requests and under-18 tips arrive there by email, outside the app. Which mail provider hosts it and who can read it is NOT IN REPO. (The Sept 7 draft said hello@ is routed by Cloudflare Email Routing into a Gmail inbox; it says nothing about help@.) | `src/app/support/page.tsx:35`; `src/app/account/suspended/page.tsx:19`; `handoffs/legal-drafts/2026-09-07-privacy-policy.md:15` |
| F107 | AI / language-model vendors | None. Otto is in-house rules (F50). | F50 |
| F108 | The universities | Nothing is sent to IU or Purdue by any code in this area. | No integration found; grep `iu.edu\|purdue.edu` under `src/lib/moderation` = email-domain rules only |

## 5. Live page: claims that are false or missing

Source: `src/app/legal/privacy/page.tsx` (effective "September 28, 2026"; same file on both trees). Line numbers are that file's.

FALSE or overstated
- P1 (`:145-147`) "When you delete your account, we remove your data from our live systems immediately." FALSE as written. These stay in the live database or storage: reports about you with the copy of your words, handle and name (F74); reports you filed, with your words (F73); moderation-log rows with your account id, handle and old photo address (F76); restriction rows with the reason and private note (F77); quarantined photos and evidence videos (F82, F82b); the email-log stub (F85); rate-limit rows (F83); Supabase's auth audit log with your email and IP (F97).
- P2 (`:147-148`) "Encrypted backups may retain copies for up to 30 days, after which they are overwritten in the normal course of operations." UNSUPPORTED. The handoffs say production has no backups on the free plan (F96). No number is safe until the Supabase plan is checked.
- P3 (`:151-154`) "retaining a record of a banned account's identifier so the same actor can't simply re-register". MISLEADING three ways: (a) it does not stop re-registration; sign-up is never blocked, only re-verifying the SAME school email is (F28, F69); (b) the same record is kept for a SUSPENSION, not just a ban (F77); (c) the record is more than an identifier: reason code, dates and the moderator's private note stay too (F27).
- P4 (`:157-159`) "Content our moderators removed, and photos or videos kept while a report about them was open, may be kept for up to a year for safety and legal reasons, even after you delete your account." THREE PROBLEMS: (a) "up to a year" is not enforced; nothing ever deletes these files (F82, F82b); (b) the removed post / comment / message ROW itself is erased with the account; what stays is the photo or video, the report's text copy and the log (F79, F80); (c) it leaves out files kept after a report was ACTIONED, files kept after a report was DISMISSED (F82b), and old profile-photo copies swept on a takedown (F35).
- P5 (`:60-62`) "approximate location derived from IP". No code derives a location from an IP (`grep -rn -i "x-vercel-ip\|geoip\|geolocation\|request\.geo" src` = nothing). In this area the only place Vibe's own database stores an IP is a rate-limit key (F44, F45).
- P6 (`:164-166`) "role-based access for our team". There is one on/off admin flag shared by the three founders, no roles and no second sign-in factor (F51). The same sentence tells users to "turn on multi-factor authentication if your account email supports it"; Vibe itself offers none.
- P7 (`:174-177`) "If you believe a minor has signed up, contact us and we will promptly remove the account." There is no admin tool that deletes an account (`src/app/legal/delete-account/page.tsx:55-56`: "an emailed request has no admin tool yet"). The Child Safety page says something different: "If the person is under 18, we ban the account ... and we take its content down" (`src/app/legal/child-safety/page.tsx:144-147`). A ban keeps the data. Pick one and make all three documents say it.
- P8 (`:124-125`) "Deletion permanently removes your profile, posts, comments, reactions, connections, RSVPs, messages, and chat reactions." True for the rows; silent about the copies in F74 and the kept files. Needs the same exceptions the delete-account page already lists.

MISSING (the live page says nothing about these)
- P9. That a report stores a COPY of the reported thing, including the text of a reported private message (F5-F11).
- P10. That reports are kept with no time limit, and what happens to them when either person deletes their account (F72-F74).
- P11. Who can read reports: the three founders; that they see the reporter's handle; that the reported person is never told (F53, F63-F65).
- P12. That founders can read a reported DM, and that database access can read all messages; no audit log of reads (F53, F59, F60).
- P13. The moderation log and that it is permanent (F22, F76).
- P14. Suspensions and bans: what is recorded, the scrambled email code, the private note, and that it outlives the account (F27, F28, F77).
- P15. The word filter (the only automated check) and that there is no image scanning (F41, F42).
- P16. Club officers removing chat messages and the record kept of who did it (F37).
- P17. Appeals: how (email help@), and that the page itself uses hello@ while every safety page uses help@ (F98, F106).
- P18. Rate-limit counters holding IP addresses and how long (F44, F83). The page mentions IP "for abuse prevention and rate-limiting" but gives no retention.
- P19. Notification and view-history retention (none; F86, F87).
- P20. `:138-139` "report content from the post or comment menu" undersells it: people, messages, chats, clubs and events can be reported too (F2).
- P21. `:90-93` lists Supabase, Vercel and Cloudflare R2 only. In this area Resend also handles the founders' alert emails (F101) and Stripe is touched on a ban (F102). (Sentry and others: see the vendors reader.)
- P22. LANDING-NIGHT ONLY: the waitlist (collected without an account), its 40 / 30-day limit, and the masked-email admin view (F61, F62, F90).

## 6. Sept 7 draft: claims that are stale, false or missing

Source: `handoffs/legal-drafts/2026-09-07-privacy-policy.md`. "L" = line in that file.

FALSE NOW
- S1 (L13) "Francisco Cazares is the only person with administrative access to your data ... James Andres and Rylan Conaway can read the business inbox ... and nothing else". STALE. All three founders hold the admin flag (F51) and can read the report queue with its copies of reported posts, bios and DMs, restriction history with private notes, and the moderation log (F53-F56); all three get the report alert email (F21). Whether database access is still Franky only is NOT IN REPO (F59).
- S2 (L227) "a report does not keep a copy of the post's text" and "If a post is changed after you report it, we review the post as it is when we look." FALSE. A copy is stored at filing time (F5-F11).
- S3 (L227) "Today there is no automated moderation." FALSE. A word filter blocks text before it is saved (F41). Still true: no image scanning (F42).
- S4 (L227) "We aim to look at every report within 7 days". STALE. The published pages promise "We aim to review reports within 24 hours; reports of child exploitation or self-harm go first" and "We remove it within 48 hours of a valid request" for intimate images (`src/app/legal/community/page.tsx:142-145, 202`; `src/app/legal/child-safety/page.tsx:113-116`; `src/app/support/page.tsx:63-66, 84`). No code tracks either deadline (Q14).
- S5 (L227) "You can report a user ... or a post ... There is not yet a menu option to report a specific message or a group chat". STALE. Post, comment, message, chat, club, event and person are all reportable (F2).
- S6 (L272) "We do not keep a 'banned users' list or any record of deleted accounts". FALSE. Restriction rows keyed on a scrambled email outlive the account (F27, F28, F77); so do reports about the account (F74) and log rows with its handle (F76).
- S7 (L71) "Reports you file about a user or a post (a reason code and up to 1,000 characters of free text)". INCOMPLETE. Seven target types, eight reasons, plus the copy of the reported thing, the owner's id, and the outcome fields (F1-F14).
- S8 (L80) "Password-reset requests are counted by your email address and your IP address". STALE on the email half: the key is now a keyed hash, not the address (F46). IP half still true. New since: code-entry attempts are also counted per network (F44), and IPv6 is stored as its /64.
- S9 (L202, L206) "Image posts: ... the image file stays in storage" and "Files you replace or remove from your profile ...: the previous file is not removed". STALE. Deleting a post now removes its files, and replacing a profile photo removes the old file, EXCEPT while a report is open, when they go to quarantine instead (F36). (L204 on message attachments: not checked by me; see the media reader.)
- S10 (L239) "Delete every file you uploaded". Needs the evidence exceptions (F36, F82, F82b).
- S11 (L249-254) "What stays with your name removed". INCOMPLETE and partly wrong: reports ABOUT you keep your handle and name inside the copy (F74); the moderation log keeps your handle (F76); restriction rows keep the reason and note (F77). None of those has "your name removed".
- S12 (L310) "If we learn that someone under 18 has an account, we will delete it and the data it holds ... run by hand." CONFLICTS with the live Child Safety page ("we ban the account ... and we take its content down") and with what the tools can do (ban yes, admin delete no). See P7.
- S13 (L158) Resend "the three transactional emails". STALE: a fourth kind, the founders' report alert (F21); LANDING-NIGHT adds waitlist confirm and access-code emails.
- S14 (L15, L231, L300, L304, L310) every contact is hello@connectvibe.app. STALE for safety: the suspension notice, appeals, child safety, intimate-image requests and support all use help@connectvibe.app (F106).
- S15 (L21) "Vibe is a website; there is nothing separate to download or install." STALE (store apps); not my area, noted because the suspension and delete pages now mention App Review.

STILL TRUE (checked again today)
- S16 (L72) Otto has no AI vendor (F50).
- S17 (L210) rate-limit counters "eligible for deletion after one day; cleaned up opportunistically" (F83). Say "an IP address or a scrambled email", not "your IP or email".
- S18 (L211) notifications and profile-view history kept until an account is deleted (F86, F87). The suggested 90-day window was never built.
- S19 (L212, L254) reports kept indefinitely; reporter field cleared on deletion (F72, F73). The suggested retention window was never built.
- S20 (L217) "We do not currently run automated database backups." Matches the handoffs (F96) and contradicts the LIVE page (P2).
- S21 (L138, L296) no audit trail of administrative reads (F60). LANDING-NIGHT adds exactly one logged read (F62).
- S22 (L134) the blocked person's device is told a block exists (F38).

MISSING from the Sept 7 draft (all shipped after Sept 17)
- S23. Suspensions and bans, the notice page, the scrambled email code, the private note, appeals by email (F27-F30, F69, F98).
- S24. The moderation log (F22-F26). The quarantine bucket and every "kept as evidence" rule (F32-F36, F82).
- S25. Photo takedowns, the sweep of old copies (F34, F35). Club officers removing chat messages (F37).
- S26. The admin screens and exactly what they show (F52-F58). The email-to-account lookup (F54).
- S27. A post you report leaves your feed for good (F66).
- S28. Push devices deleted on restriction; Stripe customer deleted on a ban (F84, F102).
- S29. The intimate-image process, which takes requests from people with NO account (F20, Q9).
- S30. LANDING-NIGHT: the waitlist, its retention job, the masked admin view and the logged reveal (F61, F62, F90).

## 7. Surprises and open questions

### 7a. Things a privacy regulator would ask

- Q1. "UP TO A YEAR" IS NOT REAL. Three published texts promise it (live privacy page `:157-159`, delete-account page `:194-204`, Terms v2 L247). No code ever deletes a quarantined file or an evidence video (F82, F82b). Either build a purge job or change the words to "until we delete it by hand". The code comment itself says the year is a placeholder: "kept for up to a year until the lawyer says how long" (`src/lib/profile/storage-purge.ts:40-42`).
- Q2. REPORTS AND THE LOG HAVE NO END DATE. Reports are never deleted (F72). The log cannot be deleted without disabling a trigger by hand (F76). Terms v2 L242 pencils in "retention period; default 3 years": that needs a job for reports and a deliberate hand procedure for the log. Until then the honest word is "indefinitely".
- Q3. A REPORTED PRIVATE MESSAGE IS COPIED AND READ BY THREE PEOPLE. One member of a DM can report a message; its text is copied into the report and shown to all three founders, and kept forever, even if the sender deletes the message or their account (F8, F53, F74, F80). The other person in the chat is never told. This must be said plainly.
- Q4. FILES ARE KEPT BECAUSE SOMEONE REPORTED, NOT BECAUSE ANYONE DECIDED. A photo you delete while a report on it is open goes to quarantine. If the report is later DISMISSED, nothing moves it back or deletes it (F36, F82b). An innocent person's deleted photo is kept forever on a stranger's say-so. Same for a profile photo swapped while a report about you was open.
- Q5. A DISMISSED REPORT STILL KEEPS YOUR WORDS. The copy (post text, bio, handle, name) stays on a dismissed report after you delete your account (F72, F74).
- Q6. THE PRIVATE MODERATOR NOTE outlives the account and is about an identifiable person while the account exists (F27, F77). If a student asks for "all data you hold on me", the note, the reports about them and the log rows are in scope. The export today is assembled by hand (Sept 7 draft L231); nothing lists these tables for whoever does it.
- Q7. A SCRAMBLED COPY OF THE SIGN-IN EMAIL IS STORED AND NEVER USED. The `personal` key is written "as evidence; nothing tests it" (mig `20260923090000:1816-1817`; F28). Collected with no function: easy to criticise.
- Q8. A SUSPENSION LEAVES THE SAME PERMANENT RECORD AS A BAN (F77). The live page and Terms v2 only talk about a "ban record".
- Q9. PEOPLE WITH NO ACCOUNT. The intimate-image process invites anyone to email help@ with "Your signature ... Where the image is ... A good-faith statement ... How to reach you" (`src/app/legal/community/page.tsx:227-248`), and child-safety tips come the same way. The policy must cover these people. Where that mailbox lives, who reads it and how long mail is kept is NOT IN REPO (F106). LANDING-NIGHT adds waitlist sign-ups, also without an account.
- Q10. CHILD SEXUAL ABUSE MATERIAL. (a) If a moderator removes a post with such an image, the code MOVES the file into `quarantine` and keeps it forever like any other (F32, F82), and a taken-down profile photo gets an admin preview link (F52). (b) The Child Safety page promises escalation to NCMEC "where the law requires it" and "We keep the records the law requires us to keep" (`src/app/legal/child-safety/page.tsx:125-130`); there is no tooling for either (F105). (c) Terms v2 L125 is stronger: "we report it to the National Center for Missing & Exploited Children and the authorities". The lawyer must say what to keep, for how long, who may view it, and how a report is actually filed. I am not giving a legal answer here.
- Q11. "ALONG WITH ANY IDENTICAL COPIES OF IT WE FIND" (`community/page.tsx:202-204`; Terms v2 L190). There is no matching tool (F42). Finding copies is a person looking.
- Q12. THE ADMIN ACCOUNTS. Three accounts, password only, no second factor in code (F51). Each can read reported DMs and can confirm which account owns any email address by exact search (F54). The security report of Sept 27 flagged this (`handoffs/2026-09-27-security-risk-report.md:103-113`); nothing in `src` has changed since.
- Q13. NO RECORD OF WHAT ADMINS LOOK AT (F60). The policy should say so, as the Sept 7 draft did.
- Q14. THE 24-HOUR AND 48-HOUR PROMISES ARE NOT TRACKED. The queue sorts child-safety, self-harm, intimate-image and sexual reports first (`src/lib/moderation/reports.ts:159-164`) and emails the founders (F21). Nothing measures a report's age, warns at 24 or 48 hours, or records when a takedown met the deadline. An emailed request (the only path for non-users) is not in the queue at all.
- Q15. UNDER 18: THREE DOCUMENTS, THREE ANSWERS. Live privacy page: "promptly remove the account". Child Safety page: "we ban the account ... and we take its content down". Sept 7 draft and Terms v2 L211: "close it and delete its data". The tools can ban; there is no admin delete (P7).
- Q16. BACKUPS. Live page: "up to 30 days". Sept 7 draft and Terms v2 L250: none. Handoffs: none on the free plan (F96). Someone must read the Supabase plan page before a number is printed.
- Q17. IP ADDRESSES CAN SIT FOR WEEKS (F83), and on landing-night that includes visitors who only touched the waitlist form (F45). A scheduled prune was proposed on Sept 7 (draft L80) and never built.
- Q18. SUPABASE'S AUTH AUDIT LOG keeps email and IP after deletion; nobody has confirmed whether production writes it or for how long (F97).
- Q19. "THE CODE CAN'T BE TURNED BACK INTO AN ADDRESS" (`src/app/legal/delete-account/page.tsx:209-211`). True while the server secret stays secret. School usernames are short and guessable, so anyone holding the secret could test addresses one by one. The secret "CAN NEVER BE ROTATED" (`src/lib/moderation/identity.ts:18-22`). Safer wording: "we can't read the address from it".

### 7b. Smaller surprises in the code

- Q20. The author of a removed post can read the removing ADMIN'S ACCOUNT ID through the data API (F67). The chat-officer path was changed to avoid exactly this; the platform path was not.
- Q21. `chat_removals` is written and never read by anything (F37). Stored "for the officers' eyes" with no screen.
- Q22. A club officer who tries to remove a reported message is told `report_open` (F70): they learn a report exists on that message, though not who filed it.
- Q23. A removed or deleted post's PHOTO has no preview on the admin screen (F32, F58). To look at it someone opens Supabase Storage directly, which is the unlogged database-level access of F59.
- Q24. LANDING-NIGHT: the waitlist purge only runs if `CRON_SECRET` is set in Vercel (F90). If it is missing, the 40-day promise depends on someone opening the admin tab or using the form. The route logs "the purge did not run" and nothing else.
- Q25. A ban on an already-deleted account cannot be lifted from the screen (F78).
- Q26. Code-comment drift, harmless but worth knowing: `src/app/api/admin/actions/route.ts:99-100` says the log's `actor_id` is "ON DELETE SET NULL"; the migration gives it no foreign key at all (mig `20260923090000:1896-1898`), so the id stays.
- Q27. `src/lib/moderation/access.ts:37-39` still describes an "up-to-one-hour window where a banned student's existing JWT still works"; `actions.ts:61-66` says nobody is signed out and the checks run on every request. Not a privacy issue; do not copy the "one hour" into the policy.

### 7c. Terms v2 (Sept 29) against the code, for this area

The user's request named the Sept 29 Terms (`handoffs/legal-2026-09-29/02-terms-of-service-v2.md`). The privacy policy must not contradict it. "L" = line in that file.
- T1 (L241) "The ban record ... the scrambled school email (Section 12). Nothing else from the account." FALSE against the code: the row also keeps the reason code, dates, the private note and a second scrambled code for the sign-in email, and suspensions are kept too (F27, F28, F77). Fix one of the two documents.
- T2 (L242) "Moderation records ... [REVIEWER: retention period; default 3 years.]" Nothing enforces any period (Q2).
- T3 (L247) "Media our moderators removed, or that was reported, kept in a locked area as evidence for up to a year." Not enforced (Q1).
- T4 (L207) Appeals "within 30 days". The live Community page gives no window (`src/app/legal/community/page.tsx:275-281`). And "If you deleted the account before the appeal succeeded ... the school email is freed": needs hand SQL today (F78).
- T5 (L211) under-18 "close it and delete its data": see Q15.
- T6 (L163) "We can read chats when a report or the law requires" against (L189) "We may also look at content on our own, including messages, when we have reason to think these Terms are being broken". Two different promises. The code: the admin screens show only a REPORTED message; anything more is database access (F58, F59). The privacy policy has to pick the same sentence as the Terms.
- T7 (L67) code "valid up to an hour" against the app's own words "codes work for 30 minutes" (F93).
- T8 (L190) "along with identical copies we find": see Q11.
- T9 (L250) "We do not currently keep our own database backups" contradicts the LIVE privacy page (Q16).
- T10 (L125) "we report it to the National Center for Missing & Exploited Children and the authorities": see Q10.
- MATCHES THE CODE: L187 (report without a verified school email, hourly limit = 10, F15, F17); L189 "We keep a snapshot of what was reported so that later edits or deletions do not hide it" (F5); L197, L199 suspension and ban (F69, F102); L161 "content our moderators removed is kept as evidence" on club deletion (F81); L237 "reports you filed, kept for safety with the reporter field cleared" (F73).

### 7d. What I could not check from the repo (needs a dashboard or a person)

- How many reports, restrictions, log rows and quarantined files exist in production today (no database query allowed).
- The Supabase plan: backups, point-in-time recovery, log retention, whether the auth audit log is written.
- Production Auth settings: link expiry, session length (F94).
- Whether `RESTRICTION_PEPPER` and (after the merge) `CRON_SECRET` are set in Vercel. Without the first, no one can be suspended or banned (`src/lib/moderation/actions.ts:342-349`); without the second, the waitlist purge never runs on schedule.
- Who can read help@connectvibe.app and where that mail is stored.
- Who holds the Supabase service key and dashboard login.
- Vercel, Resend and Sentry log retention (the vendors reader).
