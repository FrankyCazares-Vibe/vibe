# Facts: vendors, network contacts, on-device storage  (read on 2026-10-03, main c71e9a4 + landing-night 21af1a5)

Reader 05. Read-only audit. Evidence is `path:line` from the repo root.
"LIVE NOW" = on `main` (production today). "LANDING-NIGHT ONLY" = added by `landing-night`, live after the merge.
Paths marked `LAND:` were read in the landing-night worktree; everything else is the same on both trees.
Flags: billing OFF, push OFF, chat_v2 limited in production today (per the handoffs; the code has both paths).

## The complete vendor list (short form)

After the merge, the 12 numbered rows below touch user data or are contacted by the user's device (several rows belong to the same company: Vercel, Cloudflare, Google, Apple). The live page names 3.

| # | Vendor | Role | State |
|---|---|---|---|
| 1 | Supabase | database, sign-in, file storage, sends the sign-up confirmation email | LIVE NOW |
| 2 | Vercel | hosting, server code, request logs | LIVE NOW |
| 2a | Vercel Cron | daily waitlist purge | LANDING-NIGHT ONLY |
| 2b | Vercel Blob | hosts the landing page film | LANDING-NIGHT ONLY |
| 3 | Cloudflare R2 | video, chat media, group photos, club media | LIVE NOW |
| 3a | Cloudflare DNS + Email Routing | DNS; forwards hello@ to Gmail | LIVE NOW (not in code; handoffs only) |
| 3b | Cloudflare cdnjs | serves the PDF reader script to the browser | LIVE NOW |
| 4 | Resend | sends email (and Amazon SES under it, per a handoff) | LIVE NOW |
| 5 | Sentry | error and performance reports, browser and server | LIVE NOW |
| 6 | Google Fonts | serves fonts to every page and to opened emails | LIVE NOW |
| 7 | Google (Gmail) | support inbox behind hello@ | LIVE NOW (not in code; handoffs only) |
| 8 | Stripe | Vibe+ checkout and billing | code exists; OFF in production |
| 9 | Google Firebase Cloud Messaging | push to the store apps and to Chrome | code exists; OFF in production |
| 10 | Apple (APNs, web.push.apple.com) | push to iPhones and Safari | code exists; OFF in production |
| 11 | Mozilla, Microsoft push services | push to Firefox and Edge | code exists; OFF in production |
| 12 | Apple App Store / Google Play | distribute the store apps | apps are in the repo, not published yet |

NOT a vendor (looked for, not found): any analytics or ads SDK, any AI or language-model vendor, any maps or tiles provider, any link-preview fetcher, any CAPTCHA, any third-party login. See F60 to F65.

## 1. What is collected or stored

### 1a. Outside services (server side)

| F | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F1 | Supabase holds the whole database, sign-in (email, password hash, sessions) and file storage. Buckets: `profiles` (public), `resumes` (private), plus a quarantine bucket. | Supabase project `rqopjkimxbjkwdkpkbfq.supabase.co` | Vibe server code; the browser through row rules; Supabase | `src/lib/supabase/server.ts:16-34`; `src/lib/profile/storage-purge.ts:71`; `src/lib/profile/resume-doc-url.ts:21`; `supabase/migrations/20260927130000_quarantine_bucket.sql`; host named in `supabase/migrations/20260912102000_users_media_url_host_lock.sql:30` |
| F2 | The browser talks to Supabase directly, not only through Vibe's server: sign-up, sign-in and "send a new email" go straight from the page to Supabase. | n/a | Supabase sees IP and browser | `src/lib/supabase/browser.ts:11-15`; `src/app/auth/signup/page.tsx:208` (LAND: `src/app/auth/signup/signup-form.tsx:280`); `src/app/auth/login/page.tsx:138`; `src/components/auth/ResendConfirmation.tsx:115` |
| F3 | No Supabase Realtime (live socket) is used. | n/a | n/a | NOT FOUND: `grep -rnE "\.channel\(|postgres_changes|realtime" src` returns nothing |
| F4 | Vercel runs the site and server code and keeps request logs. Server code writes its own log lines there (errors, warnings). Code comments say no email, token or push address may be logged. | Vercel logs | Vercel; the founders with Vercel access | `next.config.ts:1-133`; `src/lib/moderation/alerts.ts:22-25`; `src/lib/push/send-webpush.ts:39-42`; `src/lib/email/send-log.ts:27-28` |
| F5 | Vercel Preview deployments share the production database (said twice in code comments). | n/a | n/a | `src/lib/push/config.ts:11-12`; `src/components/pwa/ServiceWorkerRegistrar.tsx:24-26` |
| F6 | LANDING-NIGHT ONLY. Vercel Cron calls `/api/cron/waitlist-purge` once a day (`17 8 * * *`). It deletes old waitlist entries and returns only a count. | n/a | n/a | `LAND: vercel.json:1-9`; `LAND: src/app/api/cron/waitlist-purge/route.ts:14-36` |
| F7 | LANDING-NIGHT ONLY. The landing film ("A day on Vibe") is two video files on a public Vercel Blob store. Code comment: it "shows the founders' own photos with real people in them". The visitor's browser fetches it from `npzptkkzqxthhsnu.public.blob.vercel-storage.com`. | Vercel Blob store `vibe-landing-media` (handoff says "public, Cleveland") | anyone with the link | `LAND: src/lib/landing/demo-media.ts:4-8,25-28`; `LAND: src/components/landing/use-day-film.ts:58-63`; `handoffs/2026-10-03-session-72-landing-demo-waitlist.md:23` |
| F8 | Cloudflare R2 stores media. The server signs short links; default link life is 300 seconds. Account endpoint is `https://<account>.r2.cloudflarestorage.com`. | R2 bucket (name in env `R2_BUCKET_NAME`) | whoever holds a signed link while it is valid | `src/lib/r2.ts:18,39-41,109-118` |
| F9 | Cloudflare DNS and Email Routing are NOT in code. Handoffs say Email Routing was turned on Sept 7 and forwards hello@ to a Gmail inbox. The rule for help@ was still an open item on Sept 22. The app shows help@ 31 times and hello@ 8 times. | Cloudflare; Google (Gmail) | Franky's Gmail | `handoffs/2026-09-04-session-53-private-resumes.md:131,186`; `handoffs/2026-09-22-session-64-stripe-redaction-and-moderation.md:130`; address counts from `grep -rnoE "[a-z.]+@connectvibe\.app" src public mobile/www` |
| F10 | Resend sends Vibe's own emails through its API, from the address in env `RESEND_FROM`. Resend receives the recipient address and the full email body. | Resend | Resend; the founders with Resend access | `src/lib/resend.ts:18-21`; `src/lib/email/resend-transactional.ts:15-23` (LAND numbering) |
| F11 | The sign-up confirmation email ("Confirm your Vibe account") is sent by Supabase Auth, not by Vibe's code. Handoffs say Supabase is set to send through Resend SMTP. That is a dashboard setting, not in code. | Supabase Auth, then Resend | Supabase, Resend | `supabase/config.toml:249-251` (template + subject); `supabase/templates/confirmation.html`; `handoffs/2026-09-04-session-53-private-resumes.md:186`; `handoffs/2026-09-08-session-54-legal-campuses-feature-sentinel.md:13` |
| F12 | Sentry gets error reports and a 10% sample of performance traces from the browser, the Node server and the edge. No user id is ever attached (`Sentry.setUser` is never called). Session replay is off. There is no tunnel, so the browser sends to Sentry directly. | Sentry (host is inside env `NEXT_PUBLIC_SENTRY_DSN`) | Sentry; the founders with Sentry access | `src/lib/sentry-config.ts:189-203` (`tracesSampleRate ... 0.1`, `sendDefaultPii: false`); `src/instrumentation-client.ts:5-7`; `src/instrumentation.ts:3-13`; `src/sentry.server.config.ts:5`; `src/sentry.edge.config.ts:5`; `src/app/global-error.tsx:13`; `next.config.ts:128-133` (no `tunnelRoute`); NOT FOUND: `grep -rnE "Sentry\.setUser|replayIntegration|replaysSessionSampleRate" src` |
| F13 | What Sentry scrubbing removes before sending: sign-in and reset tokens in URLs and bodies (`token_hash`, `token`, `access_token`, `refresh_token`, `code`, `provider_token`); the handle in `/profile/<handle>` and `/api/users/<handle>`; `handle=` and `user=` link values; a `"handle"` field in a request body; the raw query string. LANDING-NIGHT ONLY adds `access_code` (the waitlist code) to the list. | n/a | n/a | `src/lib/sentry-config.ts:12-13,63-67,80-87,150-186`; `git diff main origin/landing-night -- src/lib/sentry-config.ts` |
| F14 | What Sentry scrubbing does NOT remove: club handles in `/orgs/<handle>`, post ids, thread ids, account ids in paths, and any other field of a request body. The installed server SDK (10.73.0) attaches request bodies up to "medium" size by default. | n/a | n/a | `src/lib/sentry-config.ts:63-67` (only profile and users paths); `node_modules/@sentry/node-core/build/cjs/integrations/http/httpServerIntegration.js:17` (`maxRequestBodySize ... ?? "medium"`). UNSURE whether bodies are really attached on Vercel; see Q5 |

### 1b. Every kind of email the code can send

Six kinds after the merge. Four are LIVE NOW. The live page names three kinds and the Sept 7 draft names three.

| F | Email (subject) | To | Sent by | Carries | State | Evidence |
|---|---|---|---|---|---|---|
| F15 | "Confirm your Vibe account" | the sign-up email | Supabase Auth (through Resend SMTP per handoffs, F11) | a confirm link and an 8-digit code | LIVE NOW | `supabase/config.toml:249-251`; `supabase/config.toml:230` (`otp_length = 8`); `supabase/templates/confirmation.html:50,58` |
| F16 | "Reset your Vibe password" | the sign-in email | Resend API | a reset link | LIVE NOW | `src/lib/email/resend-transactional.ts:152-162` (LAND: `:172-182`); `src/app/api/auth/password-reset/route.ts:82-98` |
| F17 | "Verify your school email on Vibe" | the school email | Resend API | a digits-only code (30 minutes) and a link (48 hours) | LIVE NOW | `src/lib/email/resend-transactional.ts:199-215` (LAND: `:219-254`); `src/app/api/auth/school-email/request/route.ts:249` |
| F18 | "New report on Vibe" | every platform admin's sign-in email | Resend API | target type, reason, open-report count, a link to /admin. No reported text, no reporter. | LIVE NOW | `src/lib/moderation/alerts.ts:59-72,108-122,157-170`; `src/app/api/me/reports/route.ts:595` |
| F19 | "Confirm your spot on the Vibe waitlist" | the school email typed on the form | Resend API, reply-to hello@connectvibe.app | a confirm link (7 days) and a "Take me off the list" link | LANDING-NIGHT ONLY | `LAND: src/lib/waitlist/email-content.ts:43-46,138-168`; `LAND: src/lib/email/resend-transactional.ts:289-336`; `LAND: src/app/api/waitlist/route.ts:143` |
| F20 | "Your Vibe access code" | a waitlist entry, when a founder sends it | Resend API, reply-to hello@connectvibe.app | the typed name ("Hi <name>"), the access code, a sign-up link with the code in it, a leave link | LANDING-NIGHT ONLY | `LAND: src/lib/waitlist/email-content.ts:176-223`; `LAND: src/lib/email/resend-transactional.ts:344-361`; `LAND: src/lib/waitlist/store.ts:522` |

| F | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F21 | No marketing, digest or activity email exists in code. The list of kinds is closed: `school_verification`, `password_reset`, `moderation_alert`, and on LAND `waitlist_confirm`, `waitlist_invite`. | n/a | n/a | `src/lib/email/send-log-core.ts:39-43` (LAND: `:44-50`) |
| F22 | LANDING-NIGHT ONLY. The waitlist form has an optional box "Also send me Vibe news." The answer is stored (`consent_news_at`). No code sends a news email yet. | `waitlist` table, `consent_news_at` | server only | `LAND: src/app/waitlist/waitlist-form.tsx:225-227`; `LAND: supabase/migrations/20261003100000_waitlist.sql:187`; F21 |
| F23 | Vibe's own send log: one row per email Vibe's code sends through Resend (not the Supabase confirmation email). It stores: kind, account id, a coarse domain (a school domain, one of gmail/outlook/hotmail/icloud/yahoo, or "other"), a keyed hash of the address, Resend's message id, ok or not, error code and text, HTTP status, time. Never the address itself: the database refuses any "@". | `public.email_sends` | server only (no client grant, no policy) | `supabase/migrations/20260922104000_email_sends.sql:7-13,143-166`; `src/lib/email/send-log-core.ts:10-19,134-141,147-156`; `src/lib/email/send-log.ts:18-22` |
| F24 | All Vibe emails, and the Supabase confirmation template, link a Google Fonts stylesheet. A mail app that loads remote styles (the code says Apple Mail does) contacts Google when the email is opened. | n/a | Google sees the reader's IP and mail app | `src/lib/email/resend-transactional.ts:91` (LAND: `:110`, comment `:25-27`); `supabase/templates/confirmation.html:10` |

### 1c. Stripe (code exists; OFF in production)

| F | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F25 | Billing is on only when `BILLING_ENABLED` is exactly "true" AND a Stripe key AND a `whsec_` webhook secret are set. The migration header says production has the switch unset and no Stripe keys on Vercel "until the LLC has its EIN and bank account and the Terms with subscription wording are published". | n/a | n/a | `src/lib/billing/config.ts:102-108`; `supabase/migrations/20260922150000_billing_stripe.sql:76-79` |
| F26 | Checkout is Stripe-hosted. The browser is sent to `https://checkout.stripe.com/` (and `https://billing.stripe.com/` for Manage). No Stripe script loads on Vibe pages. "No card field ever touches Vibe." | Stripe | Stripe | `src/app/plus/PlusActions.tsx:69-70`; `src/app/api/billing/checkout/route.ts:33-34,176-189`; NOT FOUND: `grep -rnE "js\.stripe\.com|@stripe/stripe-js|loadStripe" src public` |
| F27 | The only thing Vibe sends Stripe about the student is the Vibe account id (in `metadata.vibe_user_id` and `client_reference_id`). No name, no email: Stripe's own page asks for the email. | Stripe customer + session | Stripe | `src/lib/billing/customers.ts:18-21,139-143`; `src/app/api/billing/checkout/route.ts:177-188` |
| F28 | Vibe stores: account id to Stripe customer id (deleted with the account), and a ledger of Stripe events (event id, type, object id, account id, outcome, short error). No payload, no card data, no email. The ledger outlives the account. | `public.billing_customers`, `public.billing_events`, `public.entitlements` | server only | `supabase/migrations/20260922150000_billing_stripe.sql:25-44,57-61,227-253` |
| F29 | Vibe+ is not sold inside the store apps: checkout refuses requests from the app shell. | n/a | n/a | `src/app/api/billing/checkout/route.ts:100-109` |

### 1d. Push notifications (code exists; OFF in production)

| F | What | Where it is stored | Who can read it | Evidence |
|---|---|---|---|---|
| F30 | Push runs only when `PUSH_ENABLED` is exactly "true", on the production site, and only for accounts named in `PUSH_ALLOWLIST` ("*" = everyone; unset = nobody). | n/a | n/a | `src/lib/push/config.ts:11-18,46-67` |
| F31 | One device row per browser or phone: account id, transport (`webpush` or `fcm`), the push address (a browser endpoint URL or an FCM token), two encryption keys for web push, platform (`ios-app`, `android-app`, `ios-web`, `android-web`, `desktop-web`, `other`), app version, the site origin, created / last seen / last ok times, failure count. | `public.push_devices` | server only (no client grant at all) | `supabase/migrations/20260924120000_push_notifications.sql:32-37,72-80` |
| F32 | A queue row per owed push: recipient, source (notification or message), ids, times, attempts, a one-word skip reason. No text column: "no message, comment, name or club sits in the queue". | `public.push_outbox` | server only | `supabase/migrations/20260924120000_push_notifications.sql:38-42,62-66` |
| F33 | Browser push goes to the browser maker's push service. Allowed hosts: `fcm.googleapis.com` (Chrome, Edge on Android), `updates.push.services.mozilla.com` (Firefox), `web.push.apple.com` and `*.push.apple.com` (Safari, Home Screen app), `*.notify.windows.com` (Edge on Windows). Sent with the `web-push` library, which encrypts the payload to the browser's keys. | the push service, in transit | the push service sees the endpoint, size and timing | `src/lib/push/device-address.ts:57-68`; `src/lib/push/send-webpush.ts:1-4,24-42`; `package.json` (`"web-push": "3.6.7"`) |
| F34 | Store-app push goes to Google Firebase Cloud Messaging, "which also hands iPhone pushes to Apple". The message Google receives has the title and body in the clear, plus a Vibe link, a tag and the kind. | Google, then Apple, in transit | Google and Apple | `src/lib/push/send-fcm.ts:1-6,36-38,278`; `src/lib/push/payload.ts:571-594` |
| F35 | What a push can show: the sender's name; message, comment or post text only when the student leaves previews on and the text passes the word filter (and, for comments, post mentions and message requests, only from someone they follow). A club chat is never named. Titles max 60 characters, bodies max 100. | n/a | anyone holding the phone | `src/lib/push/payload.ts:10-25` |
| F36 | Pushes are sent from inside the request that caused them (`after()`), not from a scheduled job. | n/a | n/a | `src/lib/push/dispatch.ts:92-104,124-135` |

### 1e. The store apps (`mobile/`, in the repo; not published yet)

| F | What | Evidence |
|---|---|---|
| F37 | Both apps are a Capacitor shell: "one full-screen web view pointed at the live site". Every screen, sign-in and API call is the website. App id `app.connectvibe.vibe`. The app adds `VibeApp/1 (ios)` or `VibeApp/1 (android)` to the browser signature so the site knows it is inside the app. | `mobile/capacitor.config.ts:3-6,18,28,62,68` |
| F38 | The server reads that signature to detect the app. It is "read ... but not stored". | `src/lib/native/server.ts:27`; `src/app/get/route.ts:33-37`; `handoffs/legal-2026-09-29/00-code-facts.md:402` |
| F39 | Native plugins in the app: Firebase Messaging (push), App, Browser, Filesystem, Haptics, Keyboard, Share, Splash Screen, Status Bar. No analytics, ads, location, contacts or camera plugin. No native Sentry SDK. | `mobile/package.json:13-25`; `mobile/ios/App/CapApp-SPM/Package.swift:14-24` |
| F40 | iPhone permission strings (shown the first time the site's photo or video picker needs them). Camera: "Vibe uses your camera when you take a photo or video to post, send in a message, or add to your profile." Microphone: "Vibe uses your microphone to record sound when you take a video to post or send in a message." Photo library: "Vibe opens your photo library when you choose a photo or video to post, send in a message, or add to your profile." Save to library: "Vibe adds a photo or video to your library only when you choose to save it." | `mobile/ios/App/App/Info.plist:40-47` |
| F41 | iPhone entitlements: push (`aps-environment`) and links that open the app (`applinks:www.connectvibe.app`). Release builds only. | `mobile/ios/App/App/App.entitlements:19-28` |
| F42 | Android permissions: `INTERNET` and `POST_NOTIFICATIONS` only. No camera, microphone, location, contacts or storage permission is declared. Device backup is off (`allowBackup="false"`) so sign-in cookies are not copied to Google Drive. | `mobile/android/app/src/main/AndroidManifest.xml:3-9,104,107` |
| F43 | Firebase stays silent until the first opt-in: auto-init is off on both platforms, so "a fresh install makes no FCM token and doesn't contact Firebase Messaging before a student turns notifications on". After the first opt-in "the Firebase SDK checks in at every launch, even after Turn off or Sign out". | `mobile/ios/App/App/Info.plist:25-29`; `mobile/android/app/src/main/AndroidManifest.xml:94-99`; `mobile/README.md:205-211` |
| F44 | The two Firebase config files are not in the repo and not on this Mac, so today's builds cannot get a push token. | `mobile/README.md:197-199`; `ls mobile/android/app/google-services.json mobile/ios/App/App/GoogleService-Info.plist` → not found |
| F45 | Apple privacy manifest: tracking false, no tracking domains. One required-reason API: file timestamps (C617.1). Declared data, all "app functionality", linked to the user: name, email address, user id, emails or text messages, photos or videos, other user content, customer support, product interaction, purchase history. Declared NOT linked: crash data, performance data, other diagnostic data. | `mobile/ios/App/App/PrivacyInfo.xcprivacy:26-40,41-196` |
| F46 | The store submission is planned for Oct 16 (handoff). No final store listing text is in the repo. | `handoffs/2026-10-03-session-72-landing-demo-waitlist.md:64`; `handoffs/legal-2026-09-29/00-code-facts.md:467` |

### 1f. What the browser or app contacts directly

| F | Host | When | What it learns | State | Evidence |
|---|---|---|---|---|---|
| F47 | `www.connectvibe.app` (Vercel) | every page and API call | IP, browser, the session cookie | LIVE NOW | `next.config.ts:56-61` |
| F48 | the project's `*.supabase.co` | sign-up, sign-in, resend, some data reads; public profile images | IP, browser, sign-in details | LIVE NOW | F2; `src/lib/supabase/browser.ts:13` |
| F49 | `*.r2.cloudflarestorage.com` | uploading and viewing video, chat media, group photos, club media through signed links | IP, browser | LIVE NOW | `src/lib/r2.ts:39-41` |
| F50 | `fonts.googleapis.com` and `fonts.gstatic.com` | every React page and three static pages (profile, messages, onboarding). Not the offline page. | IP, browser, and the site origin as referrer | LIVE NOW | `src/app/layout.tsx:95-98`; `public/html/profile.html:21`; `public/html/messages.html:17`; `public/html/onboarding.html:17`; `public/offline.html:10-15` |
| F51 | same, plus an early connection to `fonts.gstatic.com` | every React page | same | LANDING-NIGHT ONLY | `LAND: src/app/layout.tsx:95-103` |
| F52 | `cdnjs.cloudflare.com` (pdf.js 3.11.174, no integrity hash) | only when a PDF is first rasterized: a résumé upload or opening the résumé viewer. On desktop and on phone. Not on every profile load any more. | IP, browser, origin as referrer | LIVE NOW | `public/html/profile.html:24-27,5001-5025,5099`; `src/lib/pdfjs-cdn.ts:13-14,64-65`; `src/components/mobile/ResumeViewerMobile.tsx:6` |
| F53 | Sentry ingest host | on an error, and for 1 in 10 page loads (traces) | IP as seen by Sentry, the scrubbed event | LIVE NOW | F12 |
| F54 | `npzptkkzqxthhsnu.public.blob.vercel-storage.com` | the landing page, when the film section loads or Play is pressed (Save-Data: only on Play) | IP, browser | LANDING-NIGHT ONLY | F7; `LAND: src/components/landing/use-day-film.ts:20-26,58-63` |
| F55 | `checkout.stripe.com`, `billing.stripe.com` | Subscribe or Manage on /plus | everything Stripe's page collects | OFF in production | F26 |
| F56 | the browser maker's push service; in the apps, Firebase | after a student turns notifications on | a push subscription or token | OFF in production | F33, F34, F43 |
| F57 | any outside host a student pasted as a résumé link | when a viewer opens that résumé | the viewer's IP and browser | LIVE NOW | `src/lib/profile/resume-doc-url.ts:13-14`; `src/components/mobile/ResumeViewerMobile.tsx:294` ("external https pass through unchanged"); `public/html/profile.html:5091-5102` |
| F58 | `apps.apple.com` / `play.google.com` | tapping "get the app" or opening `/get` on a phone, once the listing URLs are set | a normal store visit | not set yet | `src/app/get/route.ts:6-13,39-48`; `src/lib/native/store-links.ts:22-23` |
| F59 | Google Fonts, from Vibe's server only (not the user's device) | when a link-preview picture is drawn | nothing about the user | LIVE NOW | `src/lib/og/share-card.tsx:36-49` |

### 1g. Looked for and NOT FOUND

| F | Thing | Greps run |
|---|---|---|
| F60 | Analytics or ads SDK (Vercel Analytics, Speed Insights, PostHog, GA, Plausible, Segment, Mixpanel, Amplitude, Hotjar, LogRocket, Datadog, Clarity) | `grep -nE "analytics|speed-insights|posthog|plausible|gtag|segment|mixpanel|amplitude|hotjar|logrocket|datadog|fullstory|clarity" package.json mobile/package.json` → nothing; `grep -rnE "@vercel/(analytics|speed-insights)|va\.track|gtag\(|sendBeacon" src public` → nothing |
| F61 | AI or language-model vendor | `grep -rnoiE "openai|anthropic|generative-ai|gemini|replicate\.com|huggingface|api\.groq|perplexity|ollama|\bllm\b|gpt-[0-9]|claude-[0-9a-z]" src public/html package.json` → only two comments saying Otto is "Deliberately not an LLM" (`src/lib/otto/parse-reminder.ts:4`, `src/components/otto/OttoTellInput.tsx:23`) |
| F62 | Maps or tiles provider | `grep -rnilE "mapbox|leaflet|maplibre|tile\.openstreetmap|maps\.googleapis|google\.maps|tileLayer" src public` → nothing |
| F63 | Link-preview fetcher that calls other sites | `grep -rnE "await fetch\(" src/app/api src/lib` → only Vibe's own routes and one Supabase health check (`src/app/api/health/supabase/route.ts:29`) |
| F64 | Location: no `navigator.geolocation`, no IP-to-location code, no Vercel geo headers | `grep -rnE "navigator\.geolocation|getCurrentPosition|watchPosition" src public` → nothing; `grep -rnE "x-vercel-ip|request\.geo" src` → nothing |
| F65 | Third-party login, CAPTCHA, embeds (YouTube, Spotify, Giphy, Drive, Dropbox by name), third-party iframes | `grep -rnE "signInWithOAuth|signInWithOtp" src` → nothing; `grep -rnoiE "(drive|docs)\.google|dropbox|youtube|vimeo|spotify|giphy|tenor|gravatar" src public/html` → nothing; the only iframes frame Vibe's own pages (`src/app/messages/MessagesSwitch.tsx:45`, `src/app/onboarding/OnboardingSwitch.tsx:100`) |

### 1h. Cookies

| F | What | Evidence |
|---|---|---|
| F66 | The only cookies are Supabase's sign-in session cookies, set by the `@supabase/ssr` library (named `sb-<project>-auth-token`, split into numbered parts when long; the library also keeps a short-lived code-verifier cookie during sign-up). Vibe's code never names a cookie itself. | `src/lib/supabase/browser.ts:10-13`; `src/lib/supabase/server.ts:19-33`; `src/lib/supabase/middleware.ts:19-34`; `src/proxy.ts:17,201-202`; `LAND: src/app/auth/signup/signup-form.tsx:242-243` (PKCE code verifier) |
| F67 | There is NO CSRF cookie, no analytics cookie, no advertising cookie, no consent cookie. | NOT FOUND: `grep -rnE "cookies\(\)\.set|\.cookies\.set\(|Set-Cookie|setCookie|document\.cookie" src` → only the three Supabase session lines in F66. `grep -rnEi "csrf" src` → two hits, neither a cookie: the live privacy page's own sentence (`src/app/legal/privacy/page.tsx:66`) and a comment about an Origin check (`src/lib/push/device-address.ts:266`) |
| F68 | The session cookie is refreshed on every request by the proxy. | `src/proxy.ts:17`; `src/lib/supabase/middleware.ts:13-41` |
| F69 | In the store apps the same cookies live inside the app's web view (Capacitor's own cookie and HTTP replacements are off). | `mobile/capacitor.config.ts:71-75` |

### 1i. localStorage (stays on the device; never sent anywhere by itself)

No key is added or removed by landing-night (`diff` of the file lists on both trees is empty).

| F | Key | What it holds | Cleared at sign-out? | Evidence |
|---|---|---|---|---|
| F70 | `vibe_user_v1` | a cached copy of your own profile card | yes | `src/app/profile/profile-html-bridge.tsx:93`; `public/html/_persistence.js:11-12`; `src/lib/pwa/leave-device-clean.ts:44` |
| F71 | `vibe_posts_v1`, `vibe_vibes_v1` | cached posts for the desktop profile page | yes | `public/html/_persistence.js:13-14`; `public/html/profile.html:9612-9646`; `leave-device-clean.ts:45-46` |
| F72 | `vibe_relationships_v1` | a map of who you follow / are connected to | yes | `public/html/_persistence.js:15`; `leave-device-clean.ts:47` |
| F73 | `vibe_cal_events_v1` | cached calendar events | yes | `public/html/profile.html:7560`; `public/html/messages.html:1742`; `leave-device-clean.ts:50` |
| F74 | `vibe_recent_searches_v1` | your recent search terms | yes | `src/app/campus/campus-home.tsx:5445`; `public/html/profile.html:7159`; `leave-device-clean.ts:51` |
| F75 | `vibe_otto_v1`, `vibe_otto_lastpost_v1` | the Otto setup object from desktop onboarding; the text of the last post published with Otto's help | yes | `public/html/onboarding.html:3731`; `public/html/_otto.js:1045`; `leave-device-clean.ts:48-49` |
| F76 | `vibe_onb_draft_v1:<userId>` | the onboarding draft: campus, name, handle, bio, major, department, year, interests, skills, looking-for. 14-day life. | yes | `src/lib/onboarding/draft.ts:17-31`; `leave-device-clean.ts:81-85` |
| F77 | `vibe.pendingSignup.v1` | the email address this browser just signed up with, for 24 hours | cleared when the account is confirmed here, or after 24 h | `src/lib/auth/pending-signup.ts:1-13,23-30,46-48` |
| F78 | `vibe_theme`, `vibe_theme_at` | Light / Night / Auto and when it was saved | NO, kept on purpose | `src/lib/theme/theme.ts:27-30`; `src/components/settings/appearance-card-view.ts:120-126` |
| F79 | `vibe_campus_tour_seen_v1`, `vibe_network_tour_seen_v1`, `vibe_profile_tour_seen_v1`, `vibe_tour_pending` | which intro tours you have seen | NO, kept on purpose | `src/components/settings/SettingsClient.tsx:164-166`; `src/components/mobile/use-mobile-tour.ts:66`; `leave-device-clean.ts:36-37` |
| F80 | `vibe_push_device_v1` | this device's push record: account id, transport, the push address, last sync time | yes | `src/lib/pwa/device-push-logic.ts:16-19,35-42`; `leave-device-clean.ts:52` |
| F81 | `vibe_push_sync_fail_v1`, `vibe_push_ask_v1`, `vibe_first_dm_ask_v1`, `vibe_push_ask_probe` | when the last push sync failed; whether you said "Not now" to the notification ask (14-day snooze) | yes (the probe key is a storage test) | `src/lib/pwa/device-push-logic.ts:19`; `src/components/push/push-ask-view.ts:66-71`; `src/components/push/PushAsk.tsx:281`; `leave-device-clean.ts:53-55` |
| F82 | `vibe_push_taps_v1` | the last 20 notification taps the app acted on, by message id only (store apps) | NO, kept on purpose | `src/components/native/NativeBridge.tsx:63-71`; `leave-device-clean.ts:39-41` |

### 1j. sessionStorage (one tab; gone when the tab closes)

| F | Key | What it holds | Evidence |
|---|---|---|---|
| F83 | `vibe.recoveryToken.v1` | the password-reset token, moved out of the address bar; cleared once used | `src/app/auth/update-password/page.tsx:54-66` |
| F84 | `vibe.schoolVerifyLink.v1` | the school-verification link token, moved out of the address bar | `src/app/auth/verify-school/page.tsx:32-40` |
| F85 | `vibe.schoolEmailSent.v1` | the school address the last code went to, your account id, and the time; 30-minute life | `src/app/auth/school-email/page.tsx:37-46` |
| F86 | `vibe_campus_confirm_dismissed` | that you tapped "Not now" on the campus banner | `src/components/mobile/campus-confirm-banner-view.ts:13-14` |
| F87 | `vibe.launchUrlHandled` | store apps: the link that launched the app has been opened | `src/components/native/NativeBridge.tsx:23-30` |

### 1k. Other device storage, the service worker, permissions

| F | What | Evidence |
|---|---|---|
| F88 | No IndexedDB is used by Vibe's code. | NOT FOUND: `grep -rnE "indexedDB" src public` → nothing |
| F89 | The service worker caches ONE file, `/offline.html`. It keeps no copy of any feed, profile or message: "this worker never keeps copies of any of it". It only handles failed same-site page loads, shows pushes, and opens the tapped link. It registers on `www.connectvibe.app` only. | `public/sw.js:3-20,27-28,57-66,79-96`; `src/components/pwa/ServiceWorkerRegistrar.tsx:23-28` |
| F90 | The offline page loads nothing from anywhere (inline CSS, system fonts, no scripts from other files). It reads `vibe_theme` only. | `public/offline.html:10-15,22` |
| F91 | At sign-out the worker closes every shown notification, clears the icon badge and deletes any other cache. | `public/sw.js:322-336` |
| F92 | Browser permissions Vibe can ask for: notifications (only when a student turns them on; push is off in production). Camera, microphone and photos are reached only through the phone's own file picker; the code never calls the camera API directly. | NOT FOUND: `grep -rnE "getUserMedia|mediaDevices|capture=" src public/html` → nothing; `src/lib/pwa/device-push.ts:307-318,402` (the browser's notification prompt, then push subscribe); `src/lib/native/push-native.ts:161` (the app's prompt) |
| F93 | The site reads `navigator.connection` (Save-Data, connection speed) on the landing page to pick the small or large film file. It is used in the page and not sent to the server. | `LAND: src/components/landing/use-day-film.ts:50-63` (LANDING-NIGHT ONLY) |
| F94 | The web app can be installed (a manifest, start page `/campus`). Installing adds nothing to what is collected. | `src/app/manifest.ts` (`start_url: "/campus"`, `display: "standalone"`) |

### 1l. Security headers (the same on both trees; `git diff main origin/landing-night -- next.config.ts` is empty)

| F | Header | Value | Evidence |
|---|---|---|---|
| F95 | Strict-Transport-Security | `max-age=63072000; includeSubDomains; preload` (HTTPS forced for two years) | `next.config.ts:72-75` |
| F96 | Permissions-Policy | `camera=(self), microphone=(self), geolocation=(), payment=(), usb=()`. Location, payment and USB are blocked for every page. Camera and microphone are allowed for Vibe's own pages only. | `next.config.ts:87-91` |
| F97 | Referrer-Policy | `strict-origin-when-cross-origin`: an outside site (Google Fonts, cdnjs, a pasted link) gets only `https://www.connectvibe.app`, never the page path. | `next.config.ts:86` |
| F98 | X-Frame-Options / X-Content-Type-Options | `SAMEORIGIN` (no other site can frame Vibe) / `nosniff` | `next.config.ts:76,85` |
| F99 | Content-Security-Policy | NONE. "No CSP yet". So there is no `connect-src` / `img-src` / `font-src` list to use as a second source for the vendor list, and nothing in the browser limits which hosts a page may contact. | `next.config.ts:67-69` |
| F100 | Image optimisation through other hosts | none configured (no `images` block) | `next.config.ts:21-126` |

## 2. Who can see it

| F | Audience | What they can see (this area only) | Evidence |
|---|---|---|---|
| F101 | Anyone on the internet | The landing film on Vercel Blob (LANDING-NIGHT ONLY). Nothing else in this area: every table named here (`email_sends`, `push_devices`, `push_outbox`, `billing_customers`, `billing_events`) has no client grant and no policy. | F7; `supabase/migrations/20260922104000_email_sends.sql:8-10`; `supabase/migrations/20260924120000_push_notifications.sql:43-46`; `supabase/migrations/20260922150000_billing_stripe.sql:34-36` |
| F102 | Signed-in users | Nothing in this area. A signed-in user's browser cannot read another user's device, email-log or billing rows. | same as F101 |
| F103 | Club officers | Nothing in this area. | none of the tables above has an officer path |
| F104 | The other person | Whoever is holding the phone can read a push on the lock screen (name, and text if previews are on). Push is OFF in production. | F35 |
| F105 | Platform admins | They receive the "New report on Vibe" email at their sign-in address (no reported text in it). The founders can read each vendor's dashboard: Supabase, Vercel logs, Resend's log of sent emails (address and content), Sentry events, Stripe, Cloudflare, the Gmail inbox. Who holds which dashboard login is NOT in code. | F18; `src/lib/moderation/alerts.ts:27-29` |
| F106 | Only the server | The email send log, the push device addresses and keys, the Stripe customer mapping and event ledger, the rate-limit counters (which hold IP addresses). | F23, F31, F28; `src/lib/rate-limit.ts:52-71` |
| F107 | The vendors themselves | Each vendor sees what it processes: see section 4. | section 4 |

## 3. How long it is kept and what deletes it

| F | What | Kept for | What deletes it | Evidence |
|---|---|---|---|---|
| F108 | Email send log rows | No automatic deletion. A comment suggests a manual 180-day delete "as needed". | On account deletion the account id is cleared and the address hash is cleared; the row stays with kind, coarse domain, Resend message id, outcome and time. | `supabase/migrations/20260922104000_email_sends.sql:14-18,123-124,147`; `src/app/legal/delete-account/page.tsx:41-43` |
| F109 | Waitlist send-log rows (LANDING-NIGHT ONLY) | the address hash is cleared after 40 days; the row stays | the daily purge | `LAND: supabase/migrations/20261003140000_waitlist_retention.sql:27-33,151-156` |
| F110 | Resend's own log of each email (address and content) | Resend's retention period. NOT in code. | Resend | `src/app/legal/delete-account/page.tsx:41-43,47-49` (TODO for Franky) |
| F111 | Rate-limit counters, including IP-keyed ones (`pw-reset-ip:<ip>`, `school-email-ip:<ip or /64>`, `school-code-ip:<ip or /64>`; LANDING-NIGHT ONLY adds `waitlist-net:<ip or /64>` and `waitlist-confirm-net:<ip or /64>`) | windows older than one day are removed by chance: 1 call in 100 runs the cleanup. No scheduled job. At low traffic they can last longer. Not deleted with the account. | the 1% cleanup inside `rate_limit_hit` | `src/app/api/auth/password-reset/route.ts:35`; `src/app/api/auth/school-email/request/route.ts:165`; `src/app/api/auth/school-email/confirm-code/route.ts:119`; `LAND: src/app/api/waitlist/route.ts:79-80,165`; `supabase/migrations/20260903100000_security_hardening.sql:315-316`; `supabase/migrations/20260922104000_email_sends.sql:26-37` |
| F112 | Push device rows | until the device is unseen for 60 days, or sign-out on that device, or "Turn off", or account deletion. At most 10 devices per account. | the sender (60 days), the logout route, account deletion (cascade) | `src/lib/push/payload.ts:599-601`; `src/app/api/me/push-devices/route.ts:47-50,83`; `supabase/migrations/20260924120000_push_notifications.sql:114-118` |
| F113 | Push queue rows | finished rows older than 7 days are deleted now and then; a deleted message, comment or notification takes its pending push with it | `claim_push_outbox`; cascades | `supabase/migrations/20260924120000_push_notifications.sql:19-23,55-57,640` |
| F114 | Stripe customer | deleted in Stripe FIRST when the account is deleted (this cancels the subscription); if Stripe cannot confirm, the account deletion stops. Stripe keeps its own records. | `DELETE /api/me` | `supabase/migrations/20260922150000_billing_stripe.sql:25-29`; `src/app/legal/delete-account/page.tsx:18,215-217`; `handoffs/legal-2026-09-29/00-code-facts.md:287-289` |
| F115 | Stripe event ledger (`billing_events`) | kept after account deletion, on purpose. It holds an account id that then "points at nothing", no name, email or payload. | nothing | `supabase/migrations/20260922150000_billing_stripe.sql:57-61` |
| F116 | Sentry events | Sentry's retention period. NOT in code. | Sentry | `src/app/legal/delete-account/page.tsx:47-49` |
| F117 | Vercel request and function logs | Vercel's retention period. NOT in code. | Vercel | same |
| F118 | Supabase sign-in security log | kept after the account is gone: the delete-account page says it "still keeps" a record, and its code comment says the log holds the address and "on hosted Supabase, the IP address". How long: NOT in code. | Supabase | `src/app/legal/delete-account/page.tsx:44-46,50-53,154,229` |
| F119 | localStorage | account keys are removed at sign-out, at account deletion, and every other way a student stops being signed in on the device. Theme, tour flags and the push-tap list stay. Everything goes when the user clears site data. | `leaveDeviceClean` | `src/lib/pwa/leave-device-clean.ts:1-8,35-56,74-85` |
| F120 | The offline page cache | until a new worker version replaces it, or the user clears site data | the worker's activate step | `public/sw.js:41-51,68-75` |
| F121 | The landing film on Vercel Blob (LANDING-NIGHT ONLY) | until a founder deletes it from the Blob store. No code deletes it. | by hand | F7 |
| F122 | Emails already delivered (confirmation, reset, verification, waitlist) | they sit in the recipient's own mailbox; Vibe cannot recall them. School emails sit on IU's or Purdue's mail system. | the recipient | F15 to F20 |

## 4. Third parties that receive it

Regions are dashboard settings unless a row says otherwise (see Q1).

| F | Vendor | What it receives | Why | State | Evidence |
|---|---|---|---|---|---|
| F123 | Supabase | everything in the database; sign-in email and password hash; sessions; files in `profiles`, `resumes`, quarantine; the IP and browser of direct browser calls; it sends the confirmation email | database, sign-in, storage | LIVE NOW | F1, F2, F11 |
| F124 | Vercel | every request (path, IP, browser), server log lines | hosting | LIVE NOW | F4 |
| F125 | Vercel Cron | nothing personal: it calls one URL daily | waitlist purge | LANDING-NIGHT ONLY | F6 |
| F126 | Vercel Blob | the IP and browser of landing-page visitors who load the film; the film itself (real people's photos) | landing film | LANDING-NIGHT ONLY | F7, F54 |
| F127 | Cloudflare R2 | video, chat photos and videos, group photos, club media; IP and browser of whoever uploads or views through a signed link | media storage | LIVE NOW | F8, F49 |
| F128 | Cloudflare (DNS, Email Routing) | DNS lookups; the full content of any email sent to hello@ (and help@ if its rule exists) | DNS, inbound mail | LIVE NOW, not in code | F9 |
| F129 | Cloudflare cdnjs | IP and browser of anyone who opens or uploads a résumé PDF | PDF reader script | LIVE NOW | F52 |
| F130 | Resend (and Amazon SES under it, per a handoff that adds SES to the SPF record) | recipient address and full content of every email in F15 to F20, including the school-verification code, the reset link, the waitlist access code and the typed name | sending email | LIVE NOW (F19, F20 after the merge) | F10, F11; `handoffs/2026-09-15-session-60-email-verification.md:111` |
| F131 | Sentry | scrubbed error events and 10% of traces; no user id; IP as Sentry sees it | error monitoring | LIVE NOW | F12 to F14 |
| F132 | Google Fonts | IP, browser and site origin of every visitor on almost every page; and of people who open a Vibe email in a mail app that loads remote styles | fonts | LIVE NOW | F50, F51, F24 |
| F133 | Google (Gmail) | support email sent to hello@ | support inbox | LIVE NOW, not in code | F9 |
| F134 | Stripe | the Vibe account id; whatever the student types on Stripe's checkout page (email, card) | Vibe+ payments | OFF in production | F25 to F28 |
| F135 | Google Firebase Cloud Messaging | the app's push token; each push's title and body in the clear | push to the store apps | OFF in production | F34, F43 |
| F136 | Apple (APNs through Firebase; `web.push.apple.com` for Safari) | app pushes handed over by Google; encrypted web pushes | push | OFF in production | F33, F34 |
| F137 | Mozilla, Microsoft, Google (browser push services) | encrypted web pushes, the endpoint, size and timing | push to browsers | OFF in production | F33 |
| F138 | Apple App Store, Google Play | whatever each store collects when someone installs the app | distribution | not published yet | F46 |
| F139 | IU and Purdue mail systems | the school-verification email and the waitlist emails are delivered to the student's school inbox | delivery only; Vibe sends nothing else to either university | LIVE NOW | F17, F19 |
| F140 | GitHub | the code. The repo is described as public in two code comments. No user database is in it. | source hosting | LIVE NOW | `mobile/capacitor.config.ts:14`; `LAND: src/lib/landing/demo-media.ts:4-5` |

## 5. Live page: claims that are false or missing

Live page = `src/app/legal/privacy/page.tsx` (effective "September 28, 2026"). Same file on both trees.

| F | Line | The page says | What the code does | Verdict |
|---|---|---|---|---|
| F141 | `:90-93` | "Supabase (database, auth, storage), Vercel (hosting and serverless functions), and Cloudflare R2 (media storage)." | Also live today: Resend, Sentry, Google Fonts, cdnjs, Cloudflare Email Routing, Gmail. After the merge: Vercel Blob and Vercel Cron. Built but off: Stripe, Firebase, Apple, browser push services. | MISSING (nine or more parties) |
| F142 | `:65-67` | "strictly necessary cookies for sign-in sessions and CSRF protection" | Only Supabase session cookies exist. No CSRF cookie. | FALSE (the CSRF half) (F66, F67) |
| F143 | `:67` | "We do not run third-party advertising trackers." | True. But every page loads fonts from Google, which is not said anywhere. | TRUE, with a MISSING disclosure (F50) |
| F144 | `:60-63` | "approximate location derived from IP" | No code derives location from an IP. Vibe's own code only uses the IP as a rate-limit key. | FALSE (F64, F111) |
| F145 | `:60-62` | "Pages you visit on Vibe, actions you take ... browser, OS" | Vibe's code stores no page-visit log and no browser or OS. Vercel's and Supabase's logs hold request paths and browsers; Sentry gets a sample. The push device row stores a platform word (`ios-app`, `android-web`, ...) and app version, when push is on. | MISLEADING: reads as if Vibe keeps a usage log (F31, F38, F124) |
| F146 | `:73` | "aggregate usage analytics that help us understand which features people use" | There is no analytics tool. | FALSE (F60) |
| F147 | `:75` | "account-related emails (verification, password reset, security notices). We will not send marketing email without your consent." | Missing kinds: the report alert to admins (live), and after the merge the two waitlist emails. No "security notice" email exists in code. The waitlist stores an optional "Vibe news" consent; nothing sends news yet. | PARTLY FALSE / MISSING (F15 to F22) |
| F148 | `:164-166` | "encryption at rest with our cloud providers" | Not in code. It rests on each vendor's own statement. | UNVERIFIABLE from code |
| F149 | `:167-169` | "turn on multi-factor authentication if your account email supports it" | Vibe has no two-factor sign-in. | MISLEADING (`handoffs/legal-2026-09-29/00-code-facts.md:463,496`) |
| F150 | `:146-148` | "Encrypted backups may retain copies for up to 30 days" | No backup setting is in code. A handoff parks a task "until Supabase Pro", which suggests the Free plan. The delete-account page has a TODO: "no backup-retention number until you confirm the Supabase plan's backup window". | UNVERIFIED number; two legal pages disagree (`src/app/legal/delete-account/page.tsx:47-49,236-238`; `handoffs/2026-09-28-session-68-header-f10-officer-tools.md:12-14`) |
| F151 | whole page | nothing about error reports | Sentry gets browser and server error reports and 10% traces. | MISSING (F12) |
| F152 | whole page | nothing about what stays in the browser | About 20 localStorage keys and 5 sessionStorage keys, some with profile data, searches, the sign-up email. | MISSING (F70 to F87) |
| F153 | whole page | nothing about push, the store apps, or phone permissions | Code for all three exists; the apps ask for camera, microphone, photos and notifications. | MISSING (F30 to F46) |
| F154 | whole page | nothing about payments | Stripe code exists (off in production). The delete-account page already tells users about Stripe. | MISSING; the two pages disagree (F25 to F28; `src/app/legal/delete-account/page.tsx:215-217`) |
| F155 | whole page | nothing about vendor logs that outlive account deletion | Supabase's sign-in log (address + IP), Resend's log, Sentry, Vercel logs. The delete-account page says this; the privacy page says "we remove your data from our live systems immediately". | MISSING / CONTRADICTED (F108 to F118) |
| F156 | `:128-135`, `:188-195` | contact hello@connectvibe.app | True as an address. Not said: mail to it passes through Cloudflare and lands in Gmail. Other pages use help@. | MISSING (F9) |
| F157 | LANDING-NIGHT ONLY | the waitlist form's own notice says "Supabase stores them, Vercel runs the site and Resend sends our emails" and links to this page | This page does not name Resend, the waitlist, the 40-day rule, or the landing film host. | MISSING after the merge (`LAND: src/app/waitlist/waitlist-form.tsx:205-211`) |

## 6. Sept 7 draft: claims that are stale, false or missing

Draft = `handoffs/legal-drafts/2026-09-07-privacy-policy.md`. Line numbers are the draft's.

| F | Line | The draft says | Now | Verdict |
|---|---|---|---|---|
| F158 | `:21` | "Vibe is a website; there is nothing separate to download or install." | An installable web app (manifest + service worker) is live, and two store apps are in the repo with an Oct 16 submission date. | STALE (F37, F46, F89, F94) |
| F159 | `:87` | "No camera, microphone, or push-notification access: no part of Vibe asks for these permissions today." | The iPhone app declares camera, microphone and photo-library purpose strings; Android declares notifications; the web app has a notification ask (push off in production). The site header allows camera and microphone for Vibe's own pages. | STALE (F40, F42, F92, F96) |
| F160 | `:88` | "No ... payment details." | Still true for Vibe's own database (card data stays at Stripe). But Stripe is now a built vendor and must be named for when billing turns on. | STALE by omission (F25 to F28) |
| F161 | `:97`, `:158` | "The only automated emails Vibe sends are the three listed in section 6 (signup confirmation, password reset, school-email verification)." | Four kinds live (adds the admin report alert), six after the merge (adds two waitlist emails). | FALSE (F15 to F21) |
| F162 | `:97` | "We do not send marketing email, digests, or activity emails." | Still true in code. But the waitlist now stores an opt-in for "Vibe news". | TRUE today; needs a line (F21, F22) |
| F163 | `:158` | "Resend keeps a log of sent emails" | True, and Vibe now also keeps its own send log (hash, coarse domain, Resend message id, outcome). | MISSING (F23, F108) |
| F164 | `:81`, `:159`, `:269` | "a page URL in a report can include a handle" / "Sentry error events that happened to include your handle in a URL" | Handles are now scrubbed from profile and user paths and from `handle=` values. Club handles and ids are not. | STALE (F13, F14) |
| F165 | `:159` | "a 10% sample of performance traces ... personally-identifying defaults off; we never attach your user id or email" | Still true. | TRUE (F12) |
| F166 | `:168` | Google Fonts "on every page" | True for React pages and three static pages; not the offline page. Emails also link Google Fonts. LAND adds an early connection to `fonts.gstatic.com`. | MOSTLY TRUE; emails MISSING (F24, F50, F51) |
| F167 | `:169` | cdnjs loads the PDF library "on every profile page when you use Vibe on a desktop browser, and on a phone only when a resume PDF is opened" | Desktop now loads it on first use too ("Not loaded here: _waitForPdfJs injects it the first time a PDF is rasterized"). | STALE; the DECISION on that line is done (F52) |
| F168 | `:151`, `:153-160` | "The table below plus section 6a is the complete list of outside services that receive personal data." | Missing: Stripe, Firebase / Apple / browser push services, Vercel Blob, the app stores, Amazon SES under Resend. | FALSE as a "complete list" (section 4) |
| F169 | `:156` | Vercel "Runs the Vibe website and server code; keeps short-lived request logs" | Still true. LAND adds Vercel Cron and Vercel Blob. | MISSING after the merge (F6, F7) |
| F170 | `:155` | Supabase file storage: "profile photos, banners, post images, video poster frames, work-experience logos (public bucket) and resumes (private bucket)" | A quarantine bucket now exists too. | MISSING (F1) |
| F171 | `:80` | rate-limit counters are "the only place Vibe itself stores an IP address" | Still the only place in Vibe's own tables. LAND adds two waitlist network keys. The cleanup is still by chance, no schedule. | TRUE; list of keys is STALE after the merge (F111) |
| F172 | `:193` | "There are no advertising, analytics, or consent cookies." | Still true. | TRUE (F66, F67) |
| F173 | `:195` | localStorage list: profile card, cached posts, relationships, calendar events, recent searches, tour flags, onboarding draft, Otto name and last post | Missing: the theme choice, the sign-up email kept 24 hours, the push device record (account id + push address), push-ask snoozes, notification-tap ids. sessionStorage is not mentioned at all (reset token, school-verify token, school address). | STALE / MISSING (F77, F78, F80 to F87) |
| F174 | `:195` | "is cleared when you clear site data ... The onboarding draft is removed when you ... sign out" | Now ALL account keys are removed at sign-out and account deletion, not only the draft. Theme, tour flags and tap ids stay. | STALE (better now) (F119) |
| F175 | none | nothing about a service worker or offline page | One exists and caches only `/offline.html`. | MISSING (F89) |
| F176 | `:282` | "all traffic to Vibe uses HTTPS (HSTS enabled)" | True. | TRUE (F95) |
| F177 | `:85-86` | "No usage-analytics or advertising SDK"; "we never ask your browser for geolocation (it is disabled by our page headers) and never estimate it from your IP" | True. | TRUE (F60, F64, F96) |
| F178 | `:72` | "Nothing you tell Otto is sent to any AI or language-model vendor; no such vendor is part of Vibe." | True. | TRUE (F61) |
| F179 | `:13` | "Francisco Cazares is the only person with administrative access to your data"; James and Rylan "can read the business inbox (vibe.llc@outlook.com) and nothing else" | Not checkable in code. All three founders are now platform admins who moderate and get report emails (per the code comment). The Outlook inbox appears nowhere in code. | STALE; needs the founders' answer (F18; `src/lib/moderation/alerts.ts:12-14`) |
| F180 | `:266-269` | vendor log windows ("hours to one day", "one hour to one day", "90 days") | None is in code. | UNVERIFIED (Q2) |
| F181 | `:217` | "We do not currently run automated database backups." | Not in code. The live page says the opposite ("Encrypted backups ... up to 30 days"). | UNVERIFIED; conflicts with the live page (F150) |

### 6b. Sept 29 Terms of Service v2: lines the new policy must agree with (this area only)

Terms v2 = `handoffs/legal-2026-09-29/02-terms-of-service-v2.md` (a draft; not published). It points at the Privacy Policy in seven places (`:7`, `:86`, `:106`, `:108`, `:163`, `:245`, `:248`), using the Sept 7 draft's numbering (sections 1, 5, 8, 9). If the new policy renumbers, those pointers break.

| F | Terms v2 line | It says | Code check | Note for the writer |
|---|---|---|---|---|
| F201 | `:7` | "only one of them, Francisco Cazares, can reach the systems that hold your data (Privacy Policy, section 1)" | Not checkable in code. All three founders are platform admins who moderate and get report emails. | Same question as F179 / Q9. Both documents must say the same thing. |
| F202 | `:7`, `:291` | the Service covers "the Vibe apps for iPhone and Android"; App Store and Play terms apply to the download | The apps are in the repo, not published. | The policy must cover the apps (F37 to F46); the Sept 7 draft says there is nothing to install (F158). |
| F203 | `:171` | "Payment is handled by **Stripe** on Stripe's own pages; we never see or store your card number ... Vibe+ is bought and managed on the website, not inside the iPhone or Android app." | True in code. | Matches F26, F27, F29. The policy must name Stripe. |
| F204 | `:244` | "Payment records at Stripe and in our billing table ... kept as tax and accounting law requires (generally 7 years)." | The billing table has no deletion at all, and holds event ids, not invoices. "7 years" is not in code. | Matches F115 in spirit; the number is a founder / counsel choice. |
| F205 | `:245` | "Short-lived operational logs at our providers (email delivery, hosting requests, sign-in audit) that expire on their schedules (Privacy Policy, section 9)." | The windows are not in code (Q2). Missing from this list: Sentry events, and Vibe's own email send log, which has no expiry (F108). | "Short-lived" is unproven for Resend, Sentry and the sign-in log. |
| F206 | `:250` | "We do not currently keep our own database backups" | Not in code. The live privacy page says backups are kept up to 30 days. | Three texts, two answers (F150, F181, Q3). |

## 7. Surprises and open questions

### Surprises (things a regulator or a store reviewer would ask about)

| F | Surprise | Evidence |
|---|---|---|
| F182 | The live page names 3 services from 3 companies. Live today the code and handoffs show 9 services from 6 companies: Supabase; Vercel; Cloudflare (R2, DNS, Email Routing, cdnjs); Resend; Sentry; Google (Fonts, Gmail). The merge adds 2 Vercel services (Blob, Cron). Built but switched off: Stripe, Google Firebase, Apple, Mozilla and Microsoft push. Not yet published: the two app stores. | section 4 |
| F183 | Google sees every visitor. The font stylesheet is on every React page and three static pages, including the public landing page and the legal pages, before any sign-in. Only JetBrains Mono (via `next/font/google`) and the landing's Fraunces Soft (LAND, `next/font/local`) are served from Vibe's own domain. | `src/app/layout.tsx:3,13,95-98`; `LAND: src/components/landing/soft-font.ts:1,11` |
| F184 | Opening a Vibe email can contact Google too (the font link inside the email). This includes the school-verification and waitlist emails. | F24 |
| F185 | There is no Content-Security-Policy, so nothing in the browser enforces the vendor list. A policy with `connect-src` / `font-src` / `script-src` would make the list checkable. | F99 |
| F186 | The pdf.js script comes from cdnjs with no integrity hash. A changed file at the CDN would run inside the profile page. (Security, but a reviewer will ask.) | `src/lib/pdfjs-cdn.ts:64-66`; `public/html/profile.html:5022-5025`; `grep -n "integrity=" public/html/profile.html src/lib/pdfjs-cdn.ts` → nothing |
| F187 | A student can paste an outside link as a résumé. Anyone who opens that résumé makes their browser fetch from that outside host, which then sees the viewer's IP. Profile photos and banners are locked to the Supabase host; résumé links are not. | F57; `supabase/migrations/20260912102000_users_media_url_host_lock.sql:9,30-34` |
| F188 | Sentry: handles and tokens are scrubbed, but request bodies are not scrubbed beyond tokens and `handle`. If the server SDK attaches a body on an error, it could hold message text, an email address (password-reset and waitlist forms post one) or a typed name. | F13, F14 |
| F189 | The Apple privacy manifest declares crash, performance and diagnostic data as NOT linked to the user. That holds only while F188 is not happening and no id is in a URL. The manifest itself calls it "A decision for S4 to confirm". | `mobile/ios/App/App/PrivacyInfo.xcprivacy:158-160` |
| F190 | The Apple privacy manifest has no "Device ID" entry, while the app registers an FCM push token tied to the account (when push is on). Whether a push token counts is a store-form question. | F31, F45 |
| F191 | After the first notification opt-in in the store app, the Firebase SDK keeps checking in with Google at every launch, "even after Turn off or Sign out". | F43 |
| F192 | App pushes are readable by Google and Apple in transit (name, and message text when previews are on). Browser pushes are encrypted. | F33, F34, F35 |
| F193 | The iPhone Info.plist comment says the site is "Always light ... doesn't switch for Dark Mode"; Night mode has shipped since. Not a privacy fact, but the file is stale. | `mobile/ios/App/App/Info.plist:90-93` |
| F194 | Vercel Preview deployments use the production database. Anyone with a preview link and an account is reading real data. | F5 |
| F195 | A migration comment in a repo described as public names a real person ("the Sebastian Penix case"). | `supabase/migrations/20260922104000_email_sends.sql:1-2`; F140 |
| F196 | The landing film shows real people's photos on a public Blob link (the address is in the page source and in the repo). Whether the people shown agreed is not recorded anywhere in code. | F7 |
| F197 | Three legal pages disagree with each other today: the privacy page ("we remove your data from our live systems immediately", "backups ... 30 days", no Stripe) versus the delete-account page (Stripe keeps records, the sign-in log keeps address and IP, no backup number). | F150, F154, F155 |
| F198 | IP-keyed rate-limit rows have no scheduled cleanup and are not removed when an account is deleted. The password-reset key holds the raw IP; the others hold the IP or its /64. | F111 |
| F199 | The waitlist form already names its three vendors to the public ("Supabase stores them, Vercel runs the site and Resend sends our emails") and links to a privacy page that does not name Resend. | F157 |
| F200 | The billing portal route needs only a Stripe key, not `BILLING_ENABLED`. Per the migration header there is no Stripe key on Vercel, so it is inert in production. If a key is added before the switch, Stripe becomes a live vendor at that moment. | `src/lib/billing/config.ts:87-94`; `handoffs/legal-2026-09-29/00-code-facts.md:284`; `supabase/migrations/20260922150000_billing_stripe.sql:76-79` |

### Open questions (not answerable from code)

- Q1. Regions. Where is each vendor's data? Supabase project region; Vercel function region (no `regions` key in `vercel.json`); R2 bucket location; Sentry US or EU (it is in the DSN); Resend region; the Blob store ("Cleveland" per the handoff, not in code). 
- Q2. Retention at each vendor: Vercel logs, Supabase auth audit log and API logs, Resend's email log, Sentry events. The delete-account page carries a TODO for exactly this (`src/app/legal/delete-account/page.tsx:47-53`).
- Q3. Supabase plan and backups. Free plan (no backups) or Pro (daily backups, 7 days)? The live page says 30 days, the Sept 7 draft says none. Handoffs hint at Free ("parked until Supabase Pro"; "HIBP deferred (Free plan)", `handoffs/2026-09-04-session-53-private-resumes.md:186`).
- Q4. Is the sign-up confirmation email really sent through Resend SMTP in production today? Only a handoff says so (F11). If yes, Resend sees every sign-up address.
- Q5. Does the Sentry server SDK attach request bodies on Vercel? And is "Prevent Storing of IP Addresses" on in the Sentry project? Both are checkable in the Sentry dashboard by opening one server error event.
- Q6. Is `www.connectvibe.app` proxied through Cloudflare (orange cloud) or DNS-only? If proxied, Cloudflare sees all traffic, not only DNS.
- Q7. Email Routing: does a rule for help@ exist yet (it was open on Sept 22)? Where do hello@ and help@ land today: one founder's personal Gmail, or the company Google account a handoff says to open? Is vibe.llc@outlook.com still used (Microsoft would then be a vendor)?
- Q8. Does anyone reply from hello@ through Gmail "Send mail as" over Resend SMTP (planned in `handoffs/2026-09-28-session-68-header-f10-officer-tools.md:12`)? If yes, support replies also pass through Resend.
- Q9. Who holds each vendor dashboard login (Supabase, Vercel, Resend, Sentry, Stripe, Cloudflare, Firebase)? The Sept 7 draft says only Franky; the code now treats all three founders as platform admins.
- Q10. Has a data processing agreement been accepted with each vendor (Supabase, Vercel, Cloudflare, Resend, Sentry, Stripe, Google for Firebase)? Google Fonts and cdnjs have none.
- Q11. Push go-live: when `PUSH_ENABLED` turns on, is `PUSH_ALLOWLIST` the three founders or "*"? The policy wording depends on it.
- Q12. Store listings: what will the App Store privacy label and the Play Data safety form say? They must match F45 and this policy. Is a push token declared?
- Q13. Will the fonts be self-hosted before launch? `next/font` already does it for JetBrains Mono; doing the same for Fraunces and DM Sans removes Google Fonts from the list (emails would still need a decision).
- Q14. The "Vibe news" opt-in on the waitlist: will any news email be sent, from which tool, and with what unsubscribe? A postal address is needed for marketing email under CAN-SPAM (the Sept 7 draft notes this at `:13`).
- Q15. The people in the landing film: did they agree to be shown publicly?
- Q16. Amazon SES sits under Resend (per the SPF note). Should the policy name sub-processors, or link to each vendor's list?
