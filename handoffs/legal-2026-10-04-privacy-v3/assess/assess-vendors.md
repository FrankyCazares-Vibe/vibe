# Vendor / provider check for Privacy Policy v3

Search date: 2026-10-04. Checked against the release tree (`release-s74` at `fe40634` = main + landing-night + chat-desktop + privacy-v2). Not legal advice: a lawyer should confirm every "verify" below.

**Skill:** `legal:vendor-check` was loaded and its method followed (identify the vendor, search the connected systems, compile agreement status, gap analysis, report, state what was not searched). It is built for one vendor and for contract systems; here it was run across every vendor, with the code as the main source.

**Sources checked:** the release code (`package.json`, `next.config.ts`, `vercel.json`, `.env.example`, `src/`, `public/`, `supabase/`, `mobile/`); the installed Sentry SDK (10.73.0) in `node_modules`; the Oct 3 fact files (`facts/05`, `verify/V5`); handoffs; the local Supabase CLI metadata (`supabase/.temp/pooler-url`); public DNS for connectvibe.app; the GitHub repo's visibility flag; the founder's Oct 2 to 4 answers.

**Sources unavailable:** no contract system, CRM, shared drive, email or chat is connected (the legal plugin's connectors are not authorized). No provider dashboard was opened. So **no executed agreement was found for any vendor**, and every "agreement" cell below is from general knowledge of each vendor's standard terms, marked verify. A search of all handoffs finds no record that any DPA was ever accepted or signed.

**What the three merged branches add:** nothing new from chat-desktop (no new package, host, socket or storage prefix; `git diff a508c07 HEAD -- package.json mobile/package.json next.config.ts` is empty). landing-night adds Vercel Blob (the film), Vercel Cron (the waitlist purge) and an early connection to `fonts.gstatic.com`.

## 1. Every outside company, in one table

"Named right?" refers to section 6 of `privacy-policy-publish.md`, which is word for word what the release ships (`src/app/legal/privacy/sections-6-8.tsx:11-69`).

| # | Company (service) | State | Gets personal data or an IP? | Named right in the policy? |
|---|---|---|---|---|
| 1 | Supabase (database, sign-in, storage, sign-up gate hook) | live | yes, everything | yes; two small fixes |
| 2 | Vercel (hosting, logs) | live | yes | yes |
| 2a | Vercel Blob (the landing film) | live today | IP and browser of landing visitors | **NO, not mentioned anywhere** |
| 2b | Vercel Cron (daily waitlist purge) | live today | no | yes (section 11) |
| 3 | Cloudflare R2 (media) | live | yes | yes; add that the browser fetches from it |
| 3a | Cloudflare cdnjs (PDF reader script) | live | IP and browser | yes |
| 3b | Cloudflare DNS + Email Routing (hello@, help@) | live | full content of every email to us | **NO, policy names no mail company** |
| 4 | Resend (email), on Amazon SES | live | address and content of every email | partly: sign-up email and Amazon missing |
| 5 | Sentry (error reports) | live | yes | yes; 3d needs one more clause |
| 6 | Google Fonts | live | IP and browser, almost every page | yes |
| 7 | Google Gmail (one cofounder's personal inbox) | live | everything people write to us | **NO, "the email service that hosts our inbox"** |
| 8 | Anthropic (Claude, AI coding assistant) | live, by rule | counts and settings only, plus see row 8 notes | **NO, sentence now untrue and names nobody** |
| 9 | GitHub (code host, private repo) | live | no user records; verify screenshots | not named; fine |
| 10 | Stripe | built, OFF | account number, checkout page | yes ("off today") |
| 11 | Google Firebase Cloud Messaging | built, OFF | push token, notification text | yes (3f) |
| 12 | Apple (push; App Store) | built, OFF / not published | notification text; store data | yes (3f, 6) |
| 13 | Mozilla, Microsoft, Google browser push | built, OFF | encrypted pushes | yes (3f) |
| 14 | Google Play | not published | store data | yes |
| 15 | IU and Purdue mail systems | live | our emails to school inboxes | yes (5i, 11); not our vendor |
| 16 | Any site a student pastes as a résumé or logo link | live | viewer's IP | yes (5c) |

**Used by the code, missing from the policy:** Vercel Blob (2a), Cloudflare Email Routing and DNS (3b), Gmail (7), Anthropic by name (8), Amazon under Resend (4).

**Named by the policy, not used by the code:** none. (The Outlook address was already removed. Stripe, the push services and the app stores are correctly marked off or not yet published.) One sentence is now untrue in the other direction: the "AI coding tools" bullet says database records pass through the tool's provider, which the counts-only rule now forbids.

**Looked for, not found** (release tree): any analytics, ads, session-replay, CAPTCHA, maps, third-party login or AI package or host; any Supabase Realtime socket; any image optimiser on another host; any script from a CDN other than cdnjs. `grep` for `@vercel/analytics`, `gtag(`, `posthog`, `sendBeacon`, `openai`, `anthropic` and the like over `src`, `public`, both `package.json` files: nothing. "No analytics tools" holds.

## 2. Vendor by vendor

Each entry: what it gets, why, where, whether the policy has it right, what agreement covers it, and the wording to use. Paths are relative to the release tree.

### 2.1 Supabase (Supabase, Inc.)

- **Gets:** the whole database; sign-in (email, scrambled password, sessions, its own sign-in log with email and IP); files in `profiles` (public), `resumes` (private) and the quarantine bucket. The browser calls it directly on the sign-in and sign-up pages (`src/app/auth/login/page.tsx:72` asks `signup_is_open` before anyone signs in; `src/lib/waitlist/use-signup-open.ts:31-33`), at sign-up, password change, resend, and every time a public photo loads (`src/lib/profile/storage-upload.ts:70`). So it sees the IP and browser of signed-out visitors too.
- **The sign-up gate hook:** `supabase/config.toml:290-292` points `before_user_created` at `pg-functions://postgres/auth_hooks/hook_waitlist_gate`. It is a function inside the same database, not a call to another company. It reads the email and the typed access code and stores no IP (`supabase/migrations/20261003120000_waitlist_hardening.sql:133-222`). No new vendor.
- **Where:** United States, AWS `us-east-2` (Ohio). Source: the local CLI's `supabase/.temp/pooler-url` (`aws-1-us-east-2.pooler.supabase.com`). Free plan: no backups, as the policy says.
- **Policy:** correct, with two fixes. (a) "when you sign in" is too narrow: it is also the sign-in and sign-up pages before you sign in. (b) "It sends the 'confirm your account' email" hides that the email leaves through Resend: `.env.example:102-103` says Supabase Auth's sign-up mail spends the same Resend allowance, and two handoffs (S53, S54) say Supabase is set to send through Resend. That is a dashboard setting: verify, but name Resend, since naming a company that sees the address is the safer mistake.
- **Agreement:** Supabase Terms of Service. A DPA exists but I believe it must be requested and signed from the dashboard (Legal documents); it is not automatic. Verify, and verify it is offered on the Free plan.
- **Wording:** "**Supabase** (database, sign-in, file storage). The whole database, your sign-in (email, scrambled password and a log of sign-in activity), public photos, private résumés and evidence files. Your browser talks to it directly on the sign-in and sign-up pages and each time a profile or post photo loads, so it sees your IP address and browser. It writes the "confirm your account" email and passes it to Resend to send."

### 2.2 Vercel (Vercel Inc.): hosting, logs, Blob, Cron

- **Gets:** every request (web address, IP, browser, the sign-in cookie in transit) and our server's log lines. Blob: the two film files, plus the IP and browser of each landing visitor whose browser fetches them from `npzptkkzqxthhsnu.public.blob.vercel-storage.com` (`src/lib/landing/demo-media.ts:28`; loaded when the film nears view or Play is pressed, `src/components/landing/use-day-film.ts:53-64`). Cron: calls one URL a day, no personal data (`vercel.json`).
- **Where:** no `regions` key in `vercel.json`, so functions run in Vercel's default region (Washington, D.C. area; verify). The Blob store is "public, Cleveland" per `handoffs/2026-10-03-session-72-landing-demo-waitlist.md:23`. Files and pages are served from Vercel's worldwide network. `www.connectvibe.app` resolves straight to Vercel (public DNS), so no other company sits in front of the site.
- **Policy:** hosting and logs are right. **The film is not mentioned anywhere in the policy**, and it goes live today on the page every newcomer sees. The film shows real people (the cofounders and friends, who agreed); that belongs in the policy only as one clause.
- **Agreement:** Vercel's Terms of Service; its DPA is part of those terms for every plan (verify). **Plan problem:** the only plan on record is Hobby (`handoffs/2026-04-30-session-28-...md:1`, repeated as unconfirmed in the S71 audit). Hobby is for personal, non-commercial use. A company's product with a waitlist should be on Pro before students arrive. Verify the plan today.
- **Wording:** "**Vercel** (hosting). It runs the site, our server code and the daily waitlist clean-up. Its visit logs record the web address requested, your IP address and browser. Some web addresses carry personal details, such as search words or the link in one of our emails. It also stores the short film on our front page, which your browser fetches from Vercel when you reach it."

### 2.3 Cloudflare (Cloudflare, Inc.): R2, cdnjs, DNS, Email Routing

- **Gets:** R2: post videos, club media, chat photos and videos, group pictures (`src/lib/r2.ts:13-16`), and the IP and browser of whoever uploads or views one, because the browser goes straight to `<account>.r2.cloudflarestorage.com` through signed links (`src/lib/r2.ts:41`). cdnjs: IP and browser when a résumé PDF is first opened or uploaded (`src/lib/pdfjs-cdn.ts:14`). DNS: Cloudflare's name servers answer for connectvibe.app (public DNS: `miguel` and `violet.ns.cloudflare.com`). **Email Routing: every email sent to any @connectvibe.app address goes to Cloudflare first** (public DNS: MX `route1/2/3.mx.cloudflare.net`), which forwards it. Its DMARC reports also go to Cloudflare (counts and sending servers, no addresses).
- **Not:** Cloudflare does not sit in front of the website (DNS-only; `www` points at Vercel).
- **Where:** R2 bucket location is a dashboard setting (verify). Mail and DNS: Cloudflare's worldwide network.
- **Policy:** R2 and the PDF program are right. Mail forwarding and DNS are missing: section 6 says only "the email service that hosts our inbox". With DNS now confirming it and the founder's answer final, name it.
- **Agreement:** Cloudflare's Self-Serve Subscription Agreement, which includes its DPA automatically (verify).
- **Wording:** "**Cloudflare** (media storage and incoming mail). Post videos, club media, chat photos and videos, and group pictures. Your browser fetches them straight from Cloudflare, so it sees your IP address and browser. It also serves the small program that shows a résumé PDF, looks after the connectvibe.app name, and passes every email sent to hello@ or help@ on to our inbox."

### 2.4 Resend (Plus Five Five, Inc.), sending through Amazon

- **Gets:** the recipient address and full content of every email: password reset link, school code, waitlist confirm link, the access code with the typed name, the admin report alert (`src/lib/email/resend-transactional.ts:179,232,305`; `src/lib/moderation/alerts.ts:169`), and the sign-up confirmation that Supabase hands it (2.1). Five kinds in the log list (`src/lib/email/send-log-core.ts:44-50`); no marketing kind exists.
- **Where:** United States. Public DNS shows Resend sending through Amazon's email service in `us-east-1` (MX `feedback-smtp.us-east-1.amazonses.com`, SPF `include:amazonses.com` on `send.connectvibe.app`). Amazon is Resend's own provider.
- **Policy:** "every email our code sends" leaves out the sign-up email. Amazon is not named; one clause is enough.
- **Agreement:** Resend's Terms, with a DPA incorporated by reference (verify). Free tier per `.env.example:102`. How long Resend keeps each email's address and content: not confirmed (the policy already says so in section 9).
- **Wording:** "**Resend** (sending email). The address and full content of every email Vibe sends, with the codes and links inside. Resend sends them through Amazon's email service."

### 2.5 Sentry (Functional Software, Inc.)

- **Gets:** error reports and 1 in 10 page loads and server requests (`src/lib/sentry-config.ts:202`), sent by the browser directly (no tunnel in `next.config.ts:128-133`), so Sentry sees the IP and browser. No account tag (`setUser` is never called), `sendDefaultPii: false`, no session replay, and **Sentry sets no cookie**.
- **The cookie leak is still in the release.** `src/instrumentation.ts:13` hands failed server requests to `Sentry.captureRequestError`, which attaches every request header (`node_modules/@sentry/nextjs/build/cjs/common/captureRequestError.js:8-13`). With PII off the SDK still keeps the `cookie` header and a parsed cookie map on error events (`node_modules/@sentry/core/build/cjs/integrations/requestdata.js:24-33,112-135`; its deny list only filters span attributes). Vibe's scrubber does not touch headers or cookies (`src/lib/sentry-config.ts:154-190`). The sign-in cookie carries the access token, refresh token, account number and email. The policy already admits this in 3d.
- **New in this check:** the same path keeps every header the host adds except the usual IP headers (`node_modules/@sentry/core/build/cjs/vendor/getIpAddress.js:3-16`). Vercel adds headers with a rough city, region and coordinates worked out from the IP, and `x-vercel-proxied-for` with the IP itself; none is on the drop list. So a failed-request report can carry a rough location. Vibe's code still never works one out (3e stays true), but Sentry would hold it. Verify by opening one server event in Sentry.
- **Request bodies:** with PII off this SDK version's default is not to collect them (`.../utils/data-collection/defaultPiiToCollectionOptions.js`, `httpBodies: []`). Not confirmed on Vercel: same one-event check.
- **Where:** United States or Germany, fixed in the DSN (an env value I did not read). Verify. Retention on the free plan: I believe 30 days; verify.
- **Policy:** section 6 is right. Section 3d should add the location clause, or the code fix should ship (delete `event.request.cookies`, and the `cookie`, `authorization` and `x-vercel-*` headers, in `beforeSend`). The fix is a few lines and removes two awkward sentences.
- **Agreement:** Sentry's Terms; its DPA must be accepted in the organisation's Legal and Compliance settings (verify).
- **Wording for 3d (until the fix ships):** "One about a failed server request can include what your browser sent with it: your sign-in details, which identify your account, and the rough location our hosting company works out from your IP address."

### 2.6 Google: Fonts

- **Gets:** IP, browser and our site's address (never the page path: `next.config.ts:86`) from every visitor on every React page (`src/app/layout.tsx:99-101`, now with an early connection to `fonts.gstatic.com`) and three static pages (`public/html/messages.html:17`, `profile.html:21`, `onboarding.html:17`), before any sign-in, the landing, waitlist and legal pages included. Also from a mail app that loads the fonts linked in our emails (`src/lib/email/resend-transactional.ts:110`, `supabase/templates/confirmation.html:10`). No cookie.
- **Where:** Google's worldwide network.
- **Policy:** named correctly.
- **Agreement:** none is offered for the fonts service. Google acts on its own, under its own privacy policy. The protective fix is in code, not words: serve Fraunces and DM Sans from our own site, as `next/font` already does for JetBrains Mono (`src/app/layout.tsx:3`) and the landing does for Fraunces Soft. That takes Google off every page. The emails would still link the fonts unless that line is removed too.
- **Wording:** keep, folded into one Google bullet with the inbox (2.7).

### 2.7 Google: Gmail (one cofounder's personal account)

- **Gets:** every email sent to hello@ or help@connectvibe.app, after Cloudflare forwards it: the sender's address, name and whatever they wrote, which can be a report, an intimate-image removal request, a child-safety tip or account-recovery proof. Waitlist replies land there too (`src/lib/email/resend-transactional.ts:308`, reply-to hello@).
- **Not in code.** Source: the founder's answer (Oct 4), and public DNS for the Cloudflare half.
- **Policy:** two sentences are wrong or vague. Section 6: "held by the email service that hosts our inbox" names nobody. Section 3g: "our support inbox, which the Vibe team reads" is not true; one cofounder's inbox receives it.
- **Agreement:** none. A personal Gmail account runs on Google's consumer terms; Google is not our processor there. This is the weakest link on the list, because the most sensitive mail (safety reports, recovery proof) lands in a personal account. Recommendation outside the policy: a company mailbox (for example Google Workspace, which comes with a data processing addendum) before students arrive.
- **Wording, section 6:** "**Google** (fonts and our inbox). Fonts: your IP address and browser on almost every page, and when a mail app loads the fonts in one of our emails. Inbox: email to hello@ or help@ ends up in one cofounder's Gmail account, so Google holds your address and whatever you write to us."
- **Wording, section 3g:** replace "What you send stays in our support inbox, which the Vibe team reads, until one of us deletes it." with "What you send goes through Cloudflare to one cofounder's Gmail inbox (section 6). That cofounder reads it, and it stays there until it is deleted." (Nothing is said about passing it to the other two cofounders, because no rule or system covers that. All three moderate, so section 1 already tells the reader a report can reach all three.)

### 2.8 Anthropic (Claude, the AI coding assistant)

- **Gets:** our code, working notes and whatever the assistant is shown while working. Under the founder's counts-only rule (Oct 4), when it reads the live database it reads counts, settings and code fingerprints, never anyone's records. Nothing in the app sends anything to Anthropic: no AI package, key or host in the release tree.
- **The rule is kept by people, not by a system.** The database tool the assistant uses is read-only, but nothing limits a read to counts. The policy must say so, the way section 5h does for reading messages.
- **Two paths the rule's wording does not cover, both real:**
  1. **Testing the live site.** The team's own notes describe the assistant driving a browser signed in as the cofounder's account on www.connectvibe.app. It then sees what that account sees: other people's public profiles and posts, and any chat that account is in. Screens it looks at pass through Anthropic.
  2. **Provider logs.** The assistant can be asked to read Supabase or Vercel logs. Supabase's sign-in log holds email addresses and IP addresses.
  To keep the policy true, either the sentence says path 1 (wording below), or the rule is widened to "no live-site sessions and no provider logs through the assistant". Decided here by the stated rules (truth first, then protect students): say path 1 in the policy, and widen the rule to cover logs, because logs can be avoided at no cost.
- **Where:** United States (verify).
- **Policy:** the current bullet ("AI coding tools ... the database records it reads pass through that tool's provider") names nobody and now describes something the rule forbids. Replace it.
- **Agreement:** depends on the plan the cofounder uses. Anthropic's commercial terms (API, Team, Enterprise) include a DPA and no training on inputs by default. On a personal plan (Pro or Max) the consumer terms apply and training on chats and coding sessions is a setting in the account. **Verify the plan, and that the "help improve Claude" setting is off.** Until that is checked, the policy must not say what Anthropic does with the data; it can only say what we give it.
- **Wording, section 6:** "**Anthropic** (AI coding assistant). We build and maintain Vibe with Claude, an AI assistant made by Anthropic. It works on our code. When it checks the live database it may read counts, settings and whether the right code is installed. It may not read anyone's records: not your profile, posts, messages or email address. When a cofounder tests the live site with it, it sees the screens that cofounder's own account sees. This is a rule we keep ourselves. No system enforces it."
- **Wording, short version** (after "no AI features"): "We build Vibe with an AI coding assistant. It is not given your records (section 6)."
- **Unchanged and still true:** "Vibe has no ads and no AI features, and we do not train AI on what you post" (no code does either).

### 2.9 GitHub (GitHub, Inc., owned by Microsoft)

- **Gets:** the code and the working notes. The repo is **private** (checked today: `visibility: PRIVATE`, a personal account). No user database, no `.env` file (`.gitignore:37`), and the film is kept out (`.vercelignore`, `demo-media.ts:4-5`). Vercel builds from it.
- **Verify:** 356 screenshots are tracked under `handoffs/chat-redesign/` (for example `s71-walk/` and `wave-3-desktop/walk/`). If any was taken on the live site with real accounts on screen, GitHub holds that. If all are from the local demo data, nothing to say.
- **Policy:** not named, and need not be, unless the check above finds real accounts. Then add to the Anthropic bullet: "Our code and working notes are kept in a private GitHub repository."
- **Housekeeping:** two code comments still call the repo public (`src/lib/landing/demo-media.ts:4-5`, `mobile/capacitor.config.ts:14`), and `.gitignore:69` says private. Private is the truth today.
- **Agreement:** GitHub's Terms and Privacy Statement. A DPA comes with paid organisation plans only (verify).

### 2.10 Built but switched off, or not yet published

| Company | State in the release | What it would get | Agreement | Policy |
|---|---|---|---|---|
| Stripe | off: needs `BILLING_ENABLED=true`, a key and a webhook secret (`src/lib/billing/config.ts:102-108`); no Stripe script on any page | the Vibe account number; whatever is typed on Stripe's own checkout page | Stripe Services Agreement, DPA included automatically (verify) | right (3f, 6) |
| Google Firebase Cloud Messaging | off: `PUSH_ENABLED` unset, and the two Firebase config files are absent from `mobile/`, so no build can get a token | the push token; each notification's title and text in the clear | Firebase data processing terms, accepted in the console (verify) | right (3f) |
| Apple push | off | app pushes handed over by Google; encrypted web pushes | Apple Developer Program agreement | right (3f) |
| Mozilla, Microsoft, Google browser push | off | encrypted pushes, the endpoint, size, timing | none; each runs under its own terms | right (3f) |
| Apple App Store, Google Play | apps in `mobile/`, not published (submission planned Oct 16) | whatever each store collects at install | each store's developer agreement | right (6) |

One caution from the Oct 3 facts that still holds: the billing portal route needs only a Stripe key, not the switch (F200). No key is on Vercel, so it is inert. If a key is ever added before billing opens, Stripe becomes a live vendor that day and "off today" stops being true.

For the store forms (Oct 16): the iPhone privacy manifest declares crash and diagnostic data as not linked to the user (`mobile/ios/App/App/PrivacyInfo.xcprivacy`). That is only true once the Sentry cookie fix ships (2.5).

## 3. The exact text for the policy

### 3.1 Section 6, whole (replaces publish.md lines 185 to 200)

> ## 6. Outside services
>
> These outside companies hold your information or are contacted by your device. Each works under its own published terms and privacy policy. Vibe uses no advertising or analytics company.
>
> - **Supabase** (database, sign-in, file storage). The whole database, your sign-in (email, scrambled password and a log of sign-in activity), public photos, private résumés and evidence files. Your browser talks to it directly on the sign-in and sign-up pages and each time a profile or post photo loads, so it sees your IP address and browser. It writes the "confirm your account" email and passes it to Resend to send.
> - **Vercel** (hosting). It runs the site, our server code and the daily waitlist clean-up. Its visit logs record the web address requested, your IP address and browser. Some web addresses carry personal details, such as search words or the link in one of our emails. It also stores the short film on our front page, which your browser fetches from Vercel when you reach it.
> - **Cloudflare** (media storage and incoming mail). Post videos, club media, chat photos and videos, and group pictures. Your browser fetches them straight from Cloudflare, so it sees your IP address and browser. It also serves the small program that shows a résumé PDF, looks after the connectvibe.app name, and passes every email sent to hello@ or help@ on to our inbox.
> - **Resend** (sending email). The address and full content of every email Vibe sends, with the codes and links inside. Resend sends them through Amazon's email service.
> - **Sentry** (finding bugs). Error reports and speed measurements (section 3d), with your IP address, browser and the page address.
> - **Google** (fonts and our inbox). Fonts: your IP address and browser on almost every page, and when a mail app loads the fonts in one of our emails. Inbox: email to hello@ or help@ ends up in one cofounder's Gmail account, so Google holds your address and whatever you write to us.
> - **Anthropic** (AI coding assistant). We build and maintain Vibe with Claude, an AI assistant made by Anthropic. It works on our code. When it checks the live database it may read counts, settings and whether the right code is installed. It may not read anyone's records: not your profile, posts, messages or email address. When a cofounder tests the live site with it, it sees the screens that cofounder's own account sees. This is a rule we keep ourselves. No system enforces it.
>
> Off today: **Stripe** and the notification services (section 3f), and the **Apple App Store and Google Play** once the apps are published.
>
> These companies use providers of their own. Supabase and Resend, for example, run on Amazon's servers.
>
> **Where.** Our database is in the United States (Ohio). The other companies work mainly from servers in the United States. Cloudflare, Vercel and Google also use servers around the world to deliver files quickly. Ask and we will tell you what we know.

Notes on that text:
- "Vibe uses no advertising or analytics company" is checked (section 1). It gives the reader the most useful fact first.
- "Each works under its own published terms and privacy policy" stays as is. A stronger sentence ("under terms that require them to protect your information", which Apple's review guideline 5.1.2 looks for) can go in only after the DPAs in section 4 are confirmed, and it could never cover Google Fonts or a personal Gmail account. Verify with counsel.
- The "Where" paragraph replaces "Each company decides where its servers are." Ohio is from the project's own connection address. "Mainly ... United States" is hedged on purpose: Sentry's region and the R2 bucket location are not confirmed. If either turns out to be in Europe the sentence is still true.
- If the Supabase-to-Resend setting turns out to be off, the Supabase bullet's last sentence goes back to "It sends the 'confirm your account' email." and Resend's "every email Vibe sends" becomes "every other email Vibe sends".

### 3.2 Other sentences that must change with it

| Where (publish.md line) | Now | Change to |
|---|---|---|
| Short version, line 18 | "...Vibe has no ads and no AI features, and we do not train AI on what you post." | add: "We build Vibe with an AI coding assistant. It is not given your records (section 6)." |
| 3d Error reports, line 83 | "One about a failed server request can include the sign-in details your browser sent, which identify your account." | "One about a failed server request can include what your browser sent with it: your sign-in details, which identify your account, and the rough location our hosting company works out from your IP address." (Drop the whole sentence once the scrub fix ships.) |
| 3g, line 104 | "What you send stays in our support inbox, which the Vibe team reads, until one of us deletes it." | "What you send goes through Cloudflare to one cofounder's Gmail inbox (section 6). That cofounder reads it, and it stays there until it is deleted." |
| 9 Logs at our providers, line 274 | lists Supabase, Resend, Vercel, Sentry | add at the end: "Emails you sent us stay in the Gmail inbox until they are deleted there." |
| 11 Who handles it, line 307 | "Supabase stores it, Vercel runs the site and the daily clean-up, and Resend sends our emails. Fonts load from Google and error reports go to Sentry." | add: "The film on the front page loads from Vercel's file storage. A reply to one of our emails goes through Cloudflare to one cofounder's Gmail inbox." |
| 11 Who at Vibe sees it, line 309 | "A reply to one of our emails lands in our support inbox with your full address" | "A reply to one of our emails lands in one cofounder's Gmail inbox with your full address" |

Sections 1, 3f, 5c and 5i need no vendor change. Section 1's "our accounts at the companies in section 6" now also covers Anthropic and Gmail, which is true: the same cofounder holds both.

The waitlist form's own notice still names three companies (`src/app/waitlist/waitlist-form.tsx:208`). It links to the policy, so this is acceptable, but "and a few others listed in the Privacy Policy" would make it exact. That is a page edit for the release team, not for this run.

## 4. Agreement coverage (the skill's gap analysis)

Nothing here could be read from a signed document. All "verify".

| Vendor | Terms that apply | DPA | Gap |
|---|---|---|---|
| Supabase | Terms of Service | exists; must be requested and signed in the dashboard | **likely not signed.** Do it |
| Vercel | Terms of Service | part of the terms | **plan: Hobby is non-commercial.** Move to Pro |
| Cloudflare | Self-Serve Subscription Agreement | part of the agreement | none known |
| Resend | Terms of Service | incorporated by reference | confirm how long it keeps sent emails |
| Sentry | Terms of Service | must be accepted in settings | **likely not accepted.** Do it; confirm region and the "do not store IP addresses" setting |
| Google Fonts | Google's own terms | none offered | remove by self-hosting the fonts |
| Gmail (personal) | Google consumer terms | none | **move support mail to a company mailbox** |
| Anthropic | commercial or consumer terms, by plan | commercial only | confirm plan and the training setting |
| GitHub | Terms, Privacy Statement | paid organisation plans only | none, while no user data is in the repo |
| Stripe, Firebase, Apple, stores | each one's own | at switch-on | confirm on the day each goes live |

## 5. Things to do outside the policy, ranked

1. Ship the Sentry scrub fix (cookie, authorization and `x-vercel-*` headers). Removes the worst sentence in 3d and makes the iPhone privacy manifest true.
2. Check the Vercel plan; move to Pro if it is Hobby.
3. Accept or sign the Supabase and Sentry DPAs; note the date somewhere the team can find.
4. Check the Anthropic plan and switch model training off; widen the counts-only rule to provider logs.
5. Give hello@ and help@ a company mailbox instead of a personal Gmail.
6. Self-host Fraunces and DM Sans; then Google leaves the "fonts" half of its bullet.
7. Look at the tracked screenshots under `handoffs/chat-redesign/` for real accounts.
8. Fix the two stale "repo is public" comments. Add an integrity hash to the cdnjs script (`src/lib/pdfjs-cdn.ts`).

## 6. Law and store rules this section answers to (from memory; verify with counsel)

- **FTC Act section 5** (deceptive practices): the list must be true and complete. This is why the unnamed inbox, the film host and the AI bullet change.
- **California Online Privacy Protection Act** (Bus. & Prof. Code 22575 and following): a site that collects personal details from Californians must say what kinds of outside parties it shares them with. A student from California makes this apply. Section 6 meets it.
- **Indiana Consumer Data Protection Act** (IC 24-15, in force since January 1, 2026): its contract rules for processors apply only above 100,000 Indiana consumers (or 25,000 plus mostly sale revenue). Vibe is far below. Not triggered today.
- **Apple App Store Review Guideline 5.1.1 and 5.1.2:** the policy must name what is collected and who gets it, and third parties must give the same or equal protection. Section 6 names them; the "equal protection" half rests on the DPAs in section 4.
- **Google Play User Data policy:** the policy and the Data safety form must list who data is shared with. Same list.
- **GDPR** (processor contracts, transfers): only if Vibe is offered to people in Europe. It is not. Not triggered.

## 7. Still unverified (one line each)

- Supabase really sends the sign-up email through Resend (dashboard).
- Vercel plan and function region; R2 bucket location; Sentry region, retention, IP setting, and what one live server event holds.
- How long Resend, Vercel, Supabase and Sentry keep their logs.
- Whether any DPA was ever accepted (no record found).
- Anthropic plan and training setting; whether the assistant has ever read provider logs.
- Whether tracked screenshots show real accounts.
- Company legal names in section 2 are from memory.

