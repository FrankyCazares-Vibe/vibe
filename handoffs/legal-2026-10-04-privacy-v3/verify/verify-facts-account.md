# Fact check, round 3: accounts, profiles, posts, files, sign-in, devices, storage

2026-10-04. Independent check of `privacy-policy-final.md` (the round-3 text, rebuilt 11:13) against the code.
Not legal advice. Earlier notes are kept beside this file as `verify-facts-account-r1.md` and `verify-facts-account-r2.md`.

**Skill:** no skill is named for this job, so the framework in the job was used: for each factual sentence, open the code, try to disprove it, quote file and line.

**Code read:** the release worktree, branch `release-s74` at `62a2daa` (merges `ab3a93c`, `5f3b8b0`, `fe40634` are done). Four files there have uncommitted edits (the sign-up form's access-code reader); none touches a sentence in this lens. Paths are from the worktree root. Nothing was edited. Production, dashboards and `.env.local` were not read.

**Sections covered:** short version 1, 6, 7, 8, 10; sections 2, 3a to 3f, 3h, 5 (table rows on profiles, posts, résumés, views), 5a to 5d, 5g, 7, 8 (files), 9, 10, 13; section 6 only where it speaks of sign-in. Messages, clubs, the waitlist, the vendor list and the law sections are other checkers' lenses.

**Result: passes. 0 high, 0 medium, 6 low.** Round 2's one medium (the profile list) is closed and stays closed under a fresh read. No new medium came in with the round-3 edits.

---

## Low (polish; none blocks publishing)

| # | Where | What the code says | Fix |
|---|---|---|---|
| L1 | 3d, fourth bullet: "At **three** steps they also hold an email address" | Five, not three. The two missing: (a) when you **confirm** the school email by link or code, the same lookup runs again with the address in it (`src/lib/auth/school-email-apply.ts:189-194`, called from `confirm/route.ts:73` and `confirm-code/route.ts:139`); (b) when a cofounder **adds** an address to the waitlist that is already on it (`src/lib/waitlist/store.ts:448-450` calls `findByEmailKey`, `:145-150`). The three named are right (`store.ts:110-111, 149`; `school-email/request/route.ts:199-204`; `src/app/api/admin/users/route.ts:79-80`) | "At a few steps they also hold an email address: when you send the waitlist form, when you type **or confirm** a school email, and when a cofounder looks an account up by email **or adds one to the waitlist**." Row 14's pattern (d) already covers all five |
| L2 | 3b ("Your profile holds") and 5b ("For any account") | Set-up has one more box a student can fill: "Department / school (optional)" (`src/components/mobile/onboarding/onb-copy.ts:80`; `public/html/onboarding.html:594-595`; written at `src/app/api/me/profile/route.ts:173-174`). It is stored, it is **not** on the profile page (`src/lib/profile/build-vibe-user-v1.ts:76-92` never sends it, so the writer's call for 5a is right), but any signed-in account can read the column straight from the database (`supabase/migrations/20260903100000_security_hardening.sql:41-48`; no later migration takes `department` back). The policy names it nowhere | 3b: add a bullet "the department or school you typed at set-up, if any". 5b, last bullet: "…its total profile views **and the department it typed at set-up**". Or one small migration: take `department` out of the readable columns, then only the 3b bullet is needed |
| L3 | 5a: "your follower and following counts"; section 9: "counts" | The public answer carries three numbers, signed out too: followers, following and **connections** (people who follow each other) (`src/app/api/users/[handle]/bootstrap/route.ts:362-367`) | 5a: "your follower, following and connection counts" |
| L4 | Section 2: "University staff and faculty have these addresses too." | An address on any sub-address of the two domains verifies as well (`src/lib/auth/school-email-domains.ts:100-102`, `host.endsWith("." + domain)`). If either university gives graduates an address such as `@alumni.purdue.edu`, it verifies. Whether such addresses exist is not in the repo: confirm before adding | "University staff and faculty have these addresses too, and some former students may." |
| L5 | Section 6, Supabase: the list of pages where the browser talks to Supabase directly | One more place: the account sheet (Sign out, Delete account) in phone set-up reads your own handle from Supabase in the browser each time it opens (`src/components/mobile/onboarding/OnbHeader.tsx:103`; `src/app/account/suspended/suspended-actions.tsx:70-100`). Every page already loads photos from Supabase, so nothing new reaches Supabase | "…or read a suspension notice, **and during set-up on a phone**." Optional |
| L6 | 3f, notifications | Carried from rounds 1 and 2, stands: the device record also holds a browser's two keys, platform, app version, three times and a failure count. Notifications are off; item 16 lists it for the day they turn on. Also, with previews on a notification can carry the group's or club's name, not only the sender's (`src/lib/push/payload.ts:416, 451-456`) | none today; add both the day notifications turn on |

---

## Round 2's eight findings in this lens, re-read in the round-3 text

| R2 | Finding | Round-3 text | Verdict |
|---|---|---|---|
| M1 | Profile list left out tagline, location, website, interest tags | 5a and section 9 name all four; 5a adds "including which one you pinned" | Closed. `build-vibe-user-v1.ts:59-85`; pinned post sent to signed-out visitors too (`bootstrap/route.ts:373-386`). Department: see L2 |
| L1 | Trail also holds our software's log lines | 3d: "and lines our own software logs" | Closed |
| L2 | An email address typed can be in what the browser sent | 3d first bullet: "or an email address you typed" | Closed |
| L3 | Starter name read by more than profile visitors | 3a: "Anyone who sees your name on Vibe can read it." | Closed. Trigger `20261003120000_waitlist_hardening.sql:274-281`. The starter **handle** is made from the account ID, not the email (`:254`), so the name is the only leak |
| L4 | "the day it was made" | 5b: "when it was made" | Closed |
| L5 | Outside link with bars | 5c: "An outside link you drew bars on is not shown to others." | Closed (`bootstrap/route.ts:304-327`) |
| L6 | Dismissed suggestions | 3c and 5g | Closed |
| L7 | Notification device record | unchanged | Stands (L6 above) |

One correction to my own round-2 note: I wrote that the sign-in cookie rides only on **error** reports. The round-3 text says "error or speed", and that is the right scope. In the installed kit the request record is put on every event, speed reports included, with cookies unfiltered (`node_modules/@sentry/core/build/cjs/integrations/requestdata.js:40-47, 61-65, 111-135`); the by-name filter I cited (`utils/request.js:163-173`) only runs on the newer span-streaming path (`requestdata.js:49-57`), which this app does not switch on (`src/lib/sentry-config.ts:193-206`).

---

## Sentences that are true only after a listed change

| Sentence | True today? | Listed change | Small and exact? |
|---|---|---|---|
| "Effective October 4, 2026" | The page says October 5 (`src/app/legal/privacy/page.tsx:22`) | row 1 | Yes. One constant |
| 7: "Signing out in Settings signs your account out on every device." | True in the code (`src/app/api/auth/logout/route.ts:86`, a global sign-out, and it drops every notification device first, `:44-51`). Only the label says "on this browser" (`src/components/settings/SettingsClient.tsx:1255`) | row 13 | Yes. One string |
| 9: "see connectvibe.app/legal/delete-account" | The page exists; eight of its lines disagree with sections 1, 3d, 8 and 9 | row 3 | Yes. Every line number in the row was opened and is right (`src/app/legal/delete-account/page.tsx:84, 140-143, 158-160, 165-166, 197-198, 210-211, 236-237`) |
| "Two words to know": removed means hidden, deleted means gone | Settings says "Permanently removes your profile, posts…" (`SettingsClient.tsx:1366`) | row 53 | Yes. One string |
| Short version 10: verified does not mean student | Campus page hint says "Groups created by verified students" (`src/app/campus/campus-home.tsx:12334`) | row 54 | Yes. One string |
| The whole text on the live page | The page ships v2's wording | row 2 | Large, but it is the publish itself; "Row 2 must not block the text" is the right rule |

The first row is the only sentence in this lens that is false until its change ships. Rows 13, 3, 53 and 54 fix other screens that say the opposite of a policy sentence that is already true. No other sentence here leans on code that has not shipped. Rows 14, 26, 49, 50 and 51 each take an admission out; the policy is true without them.

---

## Confirmed in round 3 (tried to disprove, found the line that makes it true)

**New or changed sentences**

| Sentence | Evidence |
|---|---|
| 3d: "Their addresses hold account IDs … yours and other people's" and the three named email steps | see L1 for the lines; the count is the only thing off |
| 3d: "A rough location … We have not confirmed that the IP address itself is always left out" | the kit drops only its own list of IP headers (`node_modules/@sentry/core/build/cjs/vendor/getIpAddress.js:3-16`); Vercel's `x-vercel-ip-*` and `x-vercel-proxied-for` are not on it, and nothing in `sentry-config.ts:154-190` removes headers. The hedge is the honest wording |
| 3d: "Our own code does not put your name, account or email on these reports" | the only capture our code makes by hand is `src/app/global-error.tsx:13`, the bare error; the two framework hooks (`src/instrumentation.ts`, `src/instrumentation-client.ts:5-7`) add nothing of ours. No `setUser`, `setTag`, `setContext` or `setExtra` anywhere in `src` |
| 3d: "the parts of the database that we built hold no IP address" | no IP, browser, device or location column in any migration (grep for `inet`, `cidr`, `ip_`, `user_agent`, `device`, `lat`, `lng`: only `campuses.city`); the only readers of an IP header are the abuse counts (`src/lib/rate-limit.ts:52-60`) |
| 3e: "each report your browser sends to Sentry carries the browser's language and time zone" | `node_modules/@sentry/browser/build/npm/cjs/prod/sdk.js:30`; `…/integrations/culturecontext.js:23-24` |
| 3e: no birth date, phone, contacts, card; no Google or Apple sign-in; no location asked | no `signInWithOAuth`, `signInWithIdToken` or `signInWithOtp` in `src`; no `geolocation` call; no phone or birth column |
| 3e: "Vibe makes one automatic check … a short list of blocked words", messages included | `src/lib/moderation/text-filter.ts:1-25`; called from posts, comments, reposts, messages, threads, cards, clubs, rooms, events, profiles. No image scan, no AI call, no analytics package in `package.json` |
| 3a: "School email. Stored once you confirm it." | the request stores nothing: the link carries a signed token (`school-email/request/route.ts:237-249`); the write is at confirm (`school-email-apply.ts:221-229`) |
| 3b: up to three résumé documents | `src/lib/profile/resume-docs.ts:23` |
| 3d Last active: only while the Campus page is open | one caller of the heartbeat (`src/app/campus/campus-home.tsx:4722`; `src/app/api/me/heartbeat/route.ts:29`) |
| 5a: bio, experience, skills, "Working on" hidden on the server, before the tagline can borrow the bio's first line | `src/lib/profile/hidden-fields.ts:50-70`; `bootstrap/route.ts:265-273`. And no signed-in account can read those four columns directly (`20260928160000_users_profile_widgets_server_only.sql:155`) |
| 5a: signed-out grid has no club posts, no drafts, no removed posts, no totals | `src/app/api/users/[handle]/posts/route.ts:117-135` |
| 5a: a post photo or video opens for anyone with the link | `src/app/api/posts/[id]/media/route.ts:20-31` ("deliberately no signed-out gate") |
| Table: who liked = author only; who saved = nobody; reposts | `20260922110000_t1_close_world_readable_selects.sql:286-294, 316`; like notification `20260922120000…:428`; savers route returns a number only (`src/app/api/me/posts/[id]/savers/route.ts:81`) |
| 6: pages where the browser talks to Supabase directly | the 13 files that call the browser client (`grep getSupabaseBrowserClient src`) match the list, bar L5; `useSignupOpen` runs only on the sign-in page and the email-link cards (`src/lib/waitlist/use-signup-open.ts:21-47`) |
| 7: cookies are only the sign-in ones | the only cookie writers in `src` and `public`: `src/lib/supabase/server.ts:27`, `src/lib/supabase/middleware.ts:26-30`, `src/proxy.ts:202` |
| 7: browser copies cleared on every way out | `src/lib/pwa/leave-device-clean.ts:43-56`, called on all five sign-out and delete paths. The service worker keeps one file, the offline page (`public/sw.js:13-20`) |
| 9: delete order (Vibe+, files, sign-in record) and what each failure does | `src/app/api/me/route.ts:110-160` |
| 9: the same delete control on "verify your campus" and the suspended notice | `src/app/auth/school-email/page.tsx:731-734`; `src/app/account/suspended/suspended-actions.tsx:299-412` (also in phone set-up, `OnbHeader.tsx:143-228`) |
| 9, "What stays": names taken off, not rows kept under your ID | every reference to an account that does not cascade is `ON DELETE SET NULL` (grep for `references public.users` without `cascade` over `supabase/migrations`: reporter, pinned-by, removed-by, invited-by, added-by, resolved-by, club owner, email log, restriction and waitlist columns; none is left pointing at the old ID) |
| 10: no other user can read proof of agreement or moderation records | `20260906120000_terms_acceptances.sql:59`; `20260923090000_moderation_foundation.sql:1865, 1935, 2122` |
| 3f, 3h: permissions, the app names itself, Firebase quiet until the first yes, Apple registration at every launch | `mobile/ios/App/App/Info.plist:28, 40-47`; `mobile/android/app/src/main/AndroidManifest.xml:98, 104-107`; `mobile/capacitor.config.ts:62, 68`; `mobile/README.md:203-214` |
| 3f: Stripe gets only the account ID | `src/lib/billing/customers.ts:140`; `src/app/api/billing/checkout/route.ts:180-185` |

**Round 2's confirmed list** (sign-up checkbox, unverified limits, résumé rules, photo stripping, Vibe+ viewers, 400-day cookies, evidence files, one scheduled delete, the section 10 gap) was spot-checked again where a line could have moved in the merge; all still hold at `62a2daa`.

**Not in the repo, so not proven either way:** the "about an hour" after sign-out and "Confirm email" (Supabase settings); whether the sign-in log is written to the database; `BILLING_ENABLED` and `PUSH_ENABLED` in Vercel; whether any account holds Vibe+ today; whether a live Sentry report really carries a body or cookie (item 9); whether the universities issue alumni addresses (L4). `decisions.md` part E and items 9 and 11 list them.
