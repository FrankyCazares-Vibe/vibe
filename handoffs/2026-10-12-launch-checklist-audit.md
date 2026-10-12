# Launch checklist audit (Oct 12, 2026)

The 20 items come from a video transcript Franky sent in session 76. Five agents checked each item against the code and the live site (read-only); a second agent re-checked every item marked partly. Result: 8 done, 1 not needed, 11 partly, 0 missing. What shipped the same day is in `2026-10-12-session-76-videos-tools-launch-checklist.md`; this file is the working detail for the items that are still open. Line numbers are as of commit 2bbbdf8 and will drift.

| # | Item | State | Whose | Effort |
|---|---|---|---|---|
| 1 | Privacy policy page | Done | claude | minutes |
| 2 | Terms and conditions page | Partly | both | a day or more |
| 3 | Secrets off the front end | Done | nobody | none |
| 4 | Force HTTPS | Done | nobody | none |
| 5 | Cookie consent banner | Not needed | nobody | none |
| 6 | Meta titles and descriptions | Partly | claude | minutes |
| 7 | Social preview image | Partly | claude | minutes |
| 8 | Favicon | Done | nobody | none |
| 9 | Sitemap and robots.txt | Partly | both | minutes |
| 10 | Alt text on images | Partly | claude | hours |
| 11 | Compressed images | Partly | both | hours |
| 12 | Page load speed | Partly | both | hours |
| 13 | Color contrast | Partly | both | hours |
| 14 | Mobile friendly | Done | nobody | none |
| 15 | Custom 404 page | Done | nobody | none |
| 16 | Broken links | Done | nobody | none |
| 17 | Form validation | Partly | claude | hours |
| 18 | Spam protection | Partly | both | hours |
| 19 | Analytics | Partly | both | hours |
| 20 | One clear call to action | Done | nobody | none |

## 1. Privacy policy page: Done

**In plain terms.** The Privacy Policy is live, names the company, and is linked from every place a visitor hands over something: the front page, the waitlist form, sign-up, sign-in and the emails that carry links. Two small touch-ups remain: the date at the top still says October 5 although the page changed on October 8 and 10, and the forgot-password page has no link to it.

**If left.** A reader on the waitlist is told the date at the top is how they can tell the policy changed, and today that date is stale by five days.

**Fix.**

Optional, both tiny. (1) src/app/legal/privacy/page.tsx:23: set the date at the top to the day of the last change (October 10, 2026), and the first line of handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md to match, so the page keeps its own section 13 promise. (2) src/app/auth/forgot-password/page.tsx: add the same 'Privacy Policy · Terms' line the sign-in page has (login/page.tsx:413-422).

**Evidence.**
- https://www.connectvibe.app/legal/privacy -> 200, title 'Privacy Policy · Vibe', 'Effective October 5, 2026'
- Landing footer: src/components/landing/home-landing.tsx:68-69 (live / has href="/legal/privacy" and "/legal/terms")
- Waitlist: src/app/waitlist/layout.tsx:34-35 footer and src/app/waitlist/waitlist-form.tsx:216 notice (live /waitlist has 2 links to /legal/privacy#waitlist)
- Sign-up: src/app/auth/signup/signup-form.tsx:582 and :592, inside the required 18+ tick box (live /auth/signup has both links)
- Sign-in: src/app/auth/login/page.tsx:415 and :419 (live /auth/login has both links)
- Also linked from src/app/auth/terms/accept-terms-form.tsx:171/181, src/components/settings/SettingsClient.tsx:1617/1624, src/app/support/page.tsx:179/185, src/app/plus/page.tsx:736/740
- Emails: src/lib/email/resend-transactional.ts:152 puts 'Privacy policy' in the footer of the password reset, waitlist confirm and access-code emails (waitlist ones point at #waitlist, line 404)
- The four code emails and supabase/templates/confirmation.html carry no link at all, on purpose (school mail scans links and delays delivery; resend-transactional.ts:236-241)
- Gap 1: section 13 of the policy says 'When we change this page we put the new date at the top'; the page changed in 5 commits on Oct 8 and Oct 10 (git log src/app/legal/privacy, latest 16a509a) but src/app/legal/privacy/page.tsx:23 still has EFFECTIVE_DATE = "October 5, 2026"
- Gap 2: https://www.connectvibe.app/auth/forgot-password -> 200 with zero /legal links (src/app/auth/forgot-password/page.tsx has 0 matches for 'legal/')

## 2. Terms and conditions page: Partly

**In plain terms.** A Terms page is live and every signed-out page and the sign-up tick box link to it, but it is still the May version. Its third paragraph tells readers it is a "baseline draft" a lawyer should review before anyone relies on it, it never names the company, and it sends disputes to Monroe County, not the Marion County you settled on. The replacement is written and waiting on your answers. Two of the three problems can be fixed today without waiting for it.

**If left.** Every student and club is agreeing to a page that calls itself a draft, names no company and names the wrong court, which weakens it in any dispute and looks unfinished to a club officer, a lawyer or a store reviewer.

**Fix.**

TODAY (Claude, minutes, on Franky's yes): in /Users/franciscocazares/vibe/src/app/legal/terms/page.tsx delete the "baseline draft" paragraph (lines 45-51) and change "operated by the Vibe team" (line 40) to "operated by CONNECTVIBE. LLC, an Indiana limited liability company", the same words the Privacy Policy opens with. Add a short "Corrected October 12, 2026" note to the banner paragraph. Leave TERMS_VERSION alone: neither edit changes anyone's rights, so nobody is asked to accept again and Privacy Policy section 13 stays true.

Do NOT swap Monroe for Marion in that edit, as the first report's stopgap proposed. Which court hears a dispute is a real term. It should change only with a new version number that every account re-accepts, which is v3. Doing it now means raising TERMS_VERSION, rewording the accept screen and editing Privacy Policy section 13 and its date the same day.

THEN v3 (a day or more, both):
1. Franky answers the 19 calls and ten outcomes in /Users/franciscocazares/vibe/handoffs/legal-2026-09-29/12-results.md.
2. James registers the copyright agent and confirms the Terms can point to the registered agent the way the Privacy Policy does.
3. Claude writes v3 from 02-terms-of-service-v2.md plus the replacements in 11-defender-round1.md part 4a.
4. Publish day: replace the page, raise TERMS_VERSION in src/lib/legal/terms.ts, and reword src/app/auth/terms/accept-terms-form.tsx:147-154 ("One quick thing" / "you won't see this again").
5. Same day: change the part 4c strings that are still open: "Officially recognized" (src/app/campus/campus-home.tsx:12333-12334), "IU students only" (src/lib/orgs/join-copy.ts:147-203) and "signed-in student" (src/app/plus/page.tsx:685).
6. Same day: build the gate's small code items or use the fallback wording part 4e allows. Three I checked are not built: account deletion still asks for the handle, not the password (src/app/api/me/route.ts:18-95), no consent record is kept after deletion, and there is no "URGENT:" subject.
7. Same day: update Privacy Policy section 13 and the date at its top.

DEADLINE: the Terms banner (page.tsx:27) and Privacy Policy section 13 both say the new Terms come in October. If v3 slips past October 31, both sentences must be edited that day.

**The second check (gap confirmed by the skeptic).** The gap is real and I reproduced it. GET https://www.connectvibe.app/legal/terms returns 200 and contains "baseline draft", "the Vibe team", "Monroe County", "May 7, 2026" and "New Terms arrive in October". It contains no "CONNECTVIBE" and no "Marion County". The repo matches at src/app/legal/terms/page.tsx:20, 27, 40, 46-50 and 158, and TERMS_VERSION is still "2026-05-07" (src/lib/legal/terms.ts:1). The page is linked once each from /, /waitlist, /auth/login and /auth/signup.

Three corrections to the first report:

1. Its stopgap collides with Vibe's own rules. Privacy Policy section 13 (privacy-policy-final.md:584-586) ties re-acceptance to the version number and says the next ask comes "when the Terms change later in October 2026". A silent Monroe-to-Marion swap changes a term under an unchanged version, so the consent record would no longer say which text a person accepted. Deleting the draft note and naming the company change no rights. The v2 draft's own header (02-terms-of-service-v2.md:5) says not to carry the draft line forward, and Privacy Policy line 5 already names the LLC.

2. "Names the wrong court" is overstated. Monroe County is a valid Indiana court clause. It is just not the county the founders settled on (02-terms-of-service-v2.md:277).

3. The publish-day list is partly stale. The "Student" badge it says to change first is already gone (src/components/mobile/ProfileMobile.tsx:6540 and public/html/profile.html:8535 now say "Verified"). The landing line, the Community Guidelines "real student" line and the ban-notice line have also changed, and the Privacy rewrite (gate item 2) has been live since October 5.

The remaining gate is still more than a day: 14 [DECISION], 13 [REVIEWER] and 8 [CODE] markers remain in the v2 draft. I spot-checked three of the gate's eight code items, not all of them.

Notes: /private/tmp/claude-501/-Users-franciscocazares-vibe/81a12e11-4ed3-4da4-838b-e8caceee3c9d/scratchpad/launch-checklist/verify-legal-consent.md

**Evidence.**
- https://www.connectvibe.app/legal/terms -> 200; live text contains 'baseline draft', 'the Vibe team', 'Monroe County', 'May 7, 2026', 'New Terms arrive in October'; contains no 'CONNECTVIBE' and no 'Marion County'
- src/app/legal/terms/page.tsx:20 effectiveDate "May 7, 2026"
- src/app/legal/terms/page.tsx:40 'operated by the Vibe team' (no company named)
- src/app/legal/terms/page.tsx:46-50 'This is a baseline draft ... Review with qualified legal counsel before broad public launch'
- src/app/legal/terms/page.tsx:158 'courts located in Monroe County, Indiana'
- src/app/legal/terms/page.tsx:58 asks for a '.edu' address (the app takes only IU and Purdue); :89 still says 'clips'; :95 'backups' and :166 'Continued use ... means you accept' both contradict the Privacy Policy (the page's own banner at :27-37 admits this)
- src/lib/legal/terms.ts:1 TERMS_VERSION = "2026-05-07"
- Parked: handoffs/legal-2026-09-29/02-terms-of-service-v2.md (21 sections; line 7 names CONNECTVIBE. LLC; line 277 says Marion County; still holds 14 [DECISION], 13 [REVIEWER] and 8 [CODE] markers, '[PUBLISH DATE]' at line 3 and an unfilled copyright-agent address at line 112)
- handoffs/legal-2026-09-29/12-results.md:3 'Stop here and read this before anything else gets written. Your thoughts decide v3.' It asks for Franky's view on ten ranked outcomes and nineteen yes/no calls (table at lines 66-86); 54 loopholes were found, 43 closable cheaply
- handoffs/2026-10-11-session-75-close-browser-rule-and-next-up.md:201-203 'The Terms draft (#14): the words students agree to still say "draft" and name no company ... (stopped since Sept 30)'
- Re-acceptance screen still reads 'One quick thing' (src/app/auth/terms/accept-terms-form.tsx:147), which the review says must change the day new Terms publish (12-results.md outcome 8)

## 3. Secrets off the front end: Done

**In plain terms.** Nothing secret is in the files a visitor's browser downloads. The only keys in there are the two that are meant to be public, and the build refuses to ship if a secret database key is ever put in the public slot again.

**Evidence.**
- Live scan Oct 12: https://www.connectvibe.app/ , /auth/login, /auth/signup, /waitlist, /auth/forgot-password -> 19 script files + 2 pages (1.33 MB). Counts: sb_secret_ key 0, sk_live_ 0, sk_test_ 0, whsec_ 0, sntrys_ 0, '-----BEGIN' 0, re_ + 20 chars 0, AWS key id 0, AWS secret names 0, JWT-shaped strings 0
- Same scan: 1 sb_publishable_ key and 1 Sentry address (both public by design). The words 'sb_secret_' and 'service_role' appear once each, as the key checker's own startsWith test, not as keys
- Same scan: names of secret settings in the bundle (SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, R2_SECRET_ACCESS_KEY, CRON_SECRET, SCHOOL_EMAIL_VERIFY_SECRET, STRIPE_SECRET_KEY, RESTRICTION_PEPPER): 0
- /Users/franciscocazares/vibe/next.config.ts:20-26 and :77 - the public key is chosen at build time and overrides whatever NEXT_PUBLIC_SUPABASE_ANON_KEY holds
- /Users/franciscocazares/vibe/src/lib/supabase/key-guard.ts:70-90 - throws 'Refusing to build' (:84) when the only keys set are secret ones
- NEXT_PUBLIC_ names used in src/: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY, SENTRY_DSN, SITE_URL, VAPID_PUBLIC_KEY, DEMO_MEDIA_BASE, BUILD_ID, APP_STORE_URL, PLAY_STORE_URL, SW_KILL, SW_DEV, SHOW_GLOBAL_FEED, CHAT_* flags - none is a secret kind
- Every file that reads a secret is a server route or starts with import 'server-only' (src/lib/supabase/service.ts, src/lib/resend.ts, src/lib/r2.ts, src/lib/billing/stripe.ts, src/lib/email/resend-transactional.ts, src/lib/auth/school-email-token.ts, src/lib/moderation/access.ts)
- public/ (static pages served as-is): 0 matches for the same shapes. .gitignore:37-38 ignores .env* except .env.example; git tracks only .env.example
- Limits of this check: only the signed-out pages' script files were downloaded (the signed-in pages' files are judged from code). The build guard covers Supabase keys only; nothing stops a future variable like NEXT_PUBLIC_RESEND_API_KEY, and none exists today

## 4. Force HTTPS: Done

**In plain terms.** Anyone who types the address without https is moved to the secure site before any page loads, and browsers are told to use only the secure site for the next two years. The sign-in cookie is marked so it is never sent over an insecure connection.

**Evidence.**
- http://connectvibe.app/ -> 308 Location: https://connectvibe.app/
- http://www.connectvibe.app/ -> 308 Location: https://www.connectvibe.app/ (a deep link keeps its path and query: /auth/login?next=%2Fcampus)
- https://connectvibe.app/ -> 307 Location: https://www.connectvibe.app/ ; strict-transport-security: max-age=63072000
- https://www.connectvibe.app/ -> 200 ; strict-transport-security: max-age=63072000; includeSubDomains; preload ; the content-security-policy ends with upgrade-insecure-requests
- /Users/franciscocazares/vibe/next.config.ts:134-135 (the two-year rule on every response) and :113-118 (bare domain -> www)
- /Users/franciscocazares/vibe/src/lib/security/csp.ts:206 (upgrade-insecure-requests in production)
- /Users/franciscocazares/vibe/src/lib/supabase/cookie-options.ts:54-56 (secure: true in production), wired into src/lib/supabase/browser.ts:16, server.ts:22, middleware.ts:23
- Landing and login pages: 0 plain http:// resource references; signed-out pages set no cookie (no set-cookie header on / or /auth/login)
- Not checked here: the Secure mark on a real sign-in cookie in the browser (needs a sign-in, which this check may not do). It is already on Franky's list from Oct 11 (look in devtools after the live sign-up test)
- Detail, optional: the bare domain's redirect sends the two-year rule without includeSubDomains/preload, so the word 'preload' on www does nothing unless the domain is submitted to the browsers' built-in list. Not needed for launch

## 5. Cookie consent banner: Not needed

**In plain terms.** Vibe does not need a cookie banner today. A visitor who is not signed in gets no cookie at all, and the only cookie Vibe ever sets is the one that keeps you signed in; there is no advertising, no tracking across sites and no outside analytics tool. The Privacy Policy already says exactly this, including the line 'so there is no cookie banner'.

**If left.** None today. A banner becomes needed, and the policy must change the same day, if any of these happen: an advertising or retargeting pixel (Meta, TikTok, Google Ads); an analytics tool that sets a cookie or follows people across sites (Google Analytics, session replay); embeds that set their own cookies (YouTube, Instagram, on-page Stripe); or opening Vibe to people in the EU or UK, where even the Google font load and the non-essential browser notes need consent.

**Evidence.**
- Live headers, signed-out GET of /, /waitlist, /auth/login, /auth/signup, /legal/privacy, /legal/terms: no Set-Cookie header on any of them
- Only cookie in the code: the Supabase sign-in cookie (src/lib/supabase/cookie-options.ts: Secure, SameSite Lax, up to 400 days), written in src/lib/supabase/middleware.ts:34 and src/proxy.ts:221; no document.cookie write anywhere in src/ or public/
- Real-browser runs (Lighthouse, 6 pages): the only outside hosts contacted were fonts.googleapis.com, fonts.gstatic.com, the Sentry ingest host (2-3 small sends per page) and Supabase on /auth/login; 'third-party-cookies' audit passed with an empty list on all six
- Live Content-Security-Policy on /: outside hosts are cdnjs.cloudflare.com (the PDF viewer), Google Fonts, Supabase, Cloudflare R2, Vercel file storage (the landing film) and Sentry; no advertising or analytics host (list built in src/lib/security/csp.ts:56-59)
- package.json: no analytics or advertising package; no gtag, pixel, PostHog, Plausible, Hotjar or Stripe.js in src/ or public/; iframes are same-origin only (frame-src 'self')
- Browser storage is all functional: theme (src/lib/theme/theme.ts:30), the email just signed up with for 24 hours (src/lib/auth/pending-signup.ts:12), own profile card, recent searches (src/app/campus/campus-home.tsx:5503), tour and notification-prompt flags, onboarding draft, build-refresh markers (src/lib/build/build-refresh.ts:278,290); no IndexedDB; the service worker (public/sw.js:28) caches one offline page only
- Sentry runs with sendDefaultPii false and 10% speed sampling (src/lib/sentry-config.ts:354-355), no session replay, tap trail off (src/instrumentation-client.ts:11); it sets no cookie
- Policy matches: handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md:370 'The only cookies Vibe sets are the ones that keep you signed in ... so there is no cookie banner'; :140 'No advertising tracker ... Sentry is the one outside tool that measures anything'; :530 'The waitlist pages set no cookie'; section 6 names Google fonts, Sentry, Vercel and Cloudflare (live page: src/app/legal/privacy/sections-6-8.tsx:43-50)
- One small omission: section 7 does not mention the offline page copy and the background helper registered on every page (src/app/layout.tsx:134); it holds nothing about the person

## 6. Meta titles and descriptions: Partly

**In plain terms.** Every page meant to be found (front page, waitlist, the five legal pages, Support, Vibe+, club pages) has its own name and one-line summary, and Google's page checker scores all six tested pages 100. What is left is cosmetic: log in, create account and reset password share one generic tab name, and a texted link to a legal or support page shows the Vibe tagline instead of that page's name.

**If left.** Search results and shared links for the sign-in, legal and support pages all read the same generic line, which looks unfinished but breaks nothing.

**Fix.**

1) src/app/layout.tsx: delete the `title` and `description` lines inside `openGraph` (lines 33-34) and inside `twitter` (lines 39-40). Next then fills each page's share card from that page's own title and description, and pages with none keep the site title. This alone fixes the legal, Support and Vibe+ cards. 2) Name the sign-in pages: add `export const metadata` to src/app/auth/signup/page.tsx ('Create your account · Vibe' plus one line), and add a small layout.tsx beside src/app/auth/login/page.tsx ('Log in · Vibe') and src/app/auth/forgot-password/page.tsx ('Reset your password · Vibe'). Both are client pages, so they cannot carry it themselves; copy the shape of src/app/auth/confirm/layout.tsx without its noindex line. In the login one add `alternates: { canonical: "/auth/login" }`, because the club page links to /auth/login?next=... and those variants should count as one page. 3) src/app/plus/page.tsx line 79: reword the description, which promises 'how to subscribe or cancel' while the page says Vibe+ isn't on sale yet. Skip canonical tags on the legal and support pages: not needed. No Privacy Policy change and no new host for the browser rule.

**The second check (gap confirmed by the skeptic).** Reproduced live today: /auth/login, /auth/signup and /auth/forgot-password all return the title 'Vibe · Your campus. Your people. Yourself.'; /legal/privacy, /legal/terms, /support and /plus have their own title and description but og:title and twitter:title are the site tagline. So the gap is real but small: nothing is missing, three pages are unnamed and seven share cards are generic. Lighthouse SEO is 1.0 on all six reports (document-title and meta-description both pass). The proposed fix is mechanically right in the installed Next 16.3.4: an empty share-card title resolves to '' (node_modules/next/dist/lib/metadata/resolvers/resolve-title.js) and is then filled from the page's title and description after all layers merge (resolve-metadata.js:603-612, 658-659). It is safe: every public page with a changing title (clubs, posts, profiles) already sets its own share block, and the profile fallback title is only the handle from the address itself. I added the login canonical and dropped the legal-page canonicals as unnecessary.

**Evidence.**
- https://www.connectvibe.app/ -> 200, lang=en, title 'Vibe: the social app for your campus', own description, og:title/og:description match, canonical https://www.connectvibe.app (src/app/page.tsx:18-24)
- https://www.connectvibe.app/waitlist -> title 'Join the Vibe waitlist', own description, canonical /waitlist (src/app/waitlist/page.tsx:16-22)
- /legal/privacy, /legal/terms, /legal/community, /legal/child-safety, /legal/delete-account, /support, /plus -> each has its own title + description, but og:title, og:description and twitter:title all read 'Vibe · Your campus. Your people. Yourself.' because the root layout sets them explicitly (src/app/layout.tsx:33-34 and 39-40)
- /auth/login, /auth/signup, /auth/forgot-password -> all three: title 'Vibe · Your campus. Your people. Yourself.', description 'Your campus. Your people. Yourself.' (no metadata: src/app/auth/login/page.tsx:1 and src/app/auth/forgot-password/page.tsx:1 are client pages, src/app/auth/signup/page.tsx has no metadata export)
- /orgs/sae -> title 'SAE · Vibe', description taken from the club's own text (src/app/orgs/[handle]/page.tsx:116-140)
- /posts/<id> signed-out card -> title 'Post · Vibe', og:title 'A post on Vibe', meta description falls back to the generic tagline (src/app/posts/[id]/page.tsx:40-44)
- /waitlist/confirm -> own title, noindex; /html/profile.html -> title 'Vibe Profile', no description, noindex (public/html/profile.html:11,23)
- Canonical tag present only on / and /waitlist; none on the legal, support, plus or auth pages
- /plus description says 'how to subscribe or cancel' while the page itself says Vibe+ is not on sale yet (src/app/plus/page.tsx:77-80)
- Lighthouse SEO score is 100 on all six reports (landing mobile + desktop, login, signup, waitlist, privacy) in /private/tmp/claude-501/-Users-franciscocazares-vibe/81a12e11-4ed3-4da4-838b-e8caceee3c9d/scratchpad/launch-checklist/lh/
- How the fix works: Next fills a page's share-card title/description from its own title/description when the card has none (node_modules/next/dist/lib/metadata/resolve-metadata.js:603-612, 658-659)

## 7. Social preview image: Partly

**In plain terms.** The picture card exists and shows on a link to the front page and to the legal and support pages. The waitlist link, the one in the Instagram bio and in the message going to club officers, shows a title with no picture, and so does a link to a club page.

**If left.** The waitlist link, the one being handed out right now, shows up as a bare link with no picture in group chats and on X, so fewer people tap it.

**Fix.**

One line does the part that matters: in src/app/waitlist/page.tsx line 20, add `images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "vibe. Your campus. Your people. Yourself." }]` inside `openGraph`. The X/Twitter picture follows from it automatically. Add the same line to the club page's `openGraph` in src/app/orgs/[handle]/page.tsx line 138 and change its twitter card from "summary" to "summary_large_image"; SAE's page has no logo image today, so the Vibe card is the only choice for now. Optional: the same line in GENERIC_POST_METADATA (src/app/posts/[id]/page.tsx lines 40-44). Two cautions: this fixed picture address does not change when the card art changes, so add `?v=2` to it if the art is ever redrawn; and to test after the deploy, paste the waitlist link into iMessage with a fresh ending such as ?src=test, because phones remember the old preview for a link they have already seen. No Privacy Policy change and no new host.

**The second check (gap confirmed by the skeptic).** Reproduced live today: /waitlist has no og:image and no twitter:image while still declaring twitter:card summary_large_image; / has both. The cause is as described: the picture file only applies in the folder that owns it (resolve-metadata.js:126-163), and the waitlist page's own share block replaces the root one whole (src/app/waitlist/page.tsx:20-21). The fix works: /opengraph-image answers 200 image/png (89,821 bytes) without its hash, and Next copies the picture to the Twitter tags when that block has none (`if (!hasTwImages) autoFillProps.images = openGraph.images`). The claim that this is the link being handed out checks out: vibe-marketing uses connectvibe.app/waitlist?src=ig-vibe (12 times), ?src=ig-bts (9) and ?officer=1 (13, including setup/for-rylan-to-send-officers.md), and all four buttons on the live front page go to /waitlist?src=landing. /orgs/sae live has no og:image and zero <img> tags, so there is no club logo to use instead. One correction to the wording: a phone chat still shows the page title, just without the large picture.

**Evidence.**
- https://www.connectvibe.app/opengraph-image -> 200 image/png, 1200 x 630, 90 KB; https://www.connectvibe.app/twitter-image -> 200 image/png, 1200 x 630 (src/app/opengraph-image.tsx:15-19, src/app/twitter-image.tsx:13-17)
- / -> og:image https://www.connectvibe.app/opengraph-image?... with width 1200, height 630 and alt text; twitter:card summary_large_image; twitter:image set
- /waitlist -> NO og:image and NO twitter:image, while twitter:card still says summary_large_image (src/app/waitlist/page.tsx:20-21: the page's own openGraph and twitter blocks replace the root ones, picture included)
- Why: Next merges these blocks shallowly, the last one wins (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:1344-1348); the front page keeps its picture only because the image file sits in the same folder
- /orgs/sae -> no og:image, no og:site_name, twitter:card summary: a text-only card (src/app/orgs/[handle]/page.tsx:138-139)
- /posts/<id> generic card -> no og:image, twitter:card summary (src/app/posts/[id]/page.tsx:40-44); a real public post with a photo uses that photo (same file, lines 131-147)
- /auth/login, /auth/signup, /legal/*, /support, /plus -> og:image and twitter:image present (inherited from the root)

## 8. Favicon: Done

**In plain terms.** The Vibe icon (the V in the coral ring) shows in the browser tab, in Google's results, on an iPhone home screen and in the installable app. The older desktop pages declare it too.

**Evidence.**
- https://www.connectvibe.app/favicon.ico -> 200 image/vnd.microsoft.icon (multi-size)
- https://www.connectvibe.app/icon.png -> 200 PNG 192 x 192; /favicon-48.png -> 200 PNG 48 x 48; /vibe-icon.svg -> 200 image/svg+xml
- https://www.connectvibe.app/apple-icon.png -> 200 PNG 180 x 180 (apple-touch-icon link on every page)
- https://www.connectvibe.app/manifest.webmanifest -> 200; /icons/icon-192.png -> 200 (192 x 192), /icons/icon-512.png -> 200 (512 x 512); maskable pair is the same files by design (scripts/gen-pwa-icons.mjs:17-21)
- Every React page carries the icon, apple-touch-icon and manifest links (src/app/layout.tsx:42-52); seen live on all 15 signed-out pages
- Static pages declare them by hand: public/html/profile.html:12-17, public/html/messages.html:8-13, public/html/onboarding.html:8-13
- public/offline.html has no icon link (it falls back to /favicon.ico; not worth changing)

## 9. Sitemap and robots.txt: Partly

**In plain terms.** The robots file is live and lets search engines read everything. There is no sitemap, but with nine public pages that the front page already links to, search engines can find them without one, so this is a tidy-up and not a hole. A web search today turned up only the front page, with an older description, so asking Google to re-read the site is the step that would change what people actually see.

**If left.** Low: with nine public pages Google finds them anyway; the real cost is post links turning up in search results as empty 'Sign in to see this post' entries.

**Fix.**

Claude: add src/app/sitemap.ts returning the nine public pages as full https://www.connectvibe.app addresses (/, /waitlist, /legal/privacy, /legal/terms, /legal/community, /legal/child-safety, /legal/delete-account, /support, /plus), and add `sitemap: "https://www.connectvibe.app/sitemap.xml"` to the object in src/app/robots.ts. Keep student profiles, clubs and posts out of the file so it never becomes a list of every student's handle. Franky: finish the Search Console step that has been open since September: verify connectvibe.app with the DNS record in Cloudflare (it adds nothing to the site, so no Privacy Policy edit and no browser-rule change), submit the sitemap, and request a re-read of the front page. Optional, not urgent: add `robots: { index: false }` to both metadata returns in src/app/posts/[id]/page.tsx (line 40 and line 133); link previews ignore it.

**The second check (gap confirmed by the skeptic).** Reproduced live: /sitemap.xml returns 404 and /robots.txt returns 200 with no Sitemap line; there is no src/app/sitemap.ts. The new file would be served without trouble: xml is on the proxy's file list (src/proxy.ts:111-115, 128-133, 247), and the proxy has no allow-list of public pages. Two corrections to the first report. First, the value is lower than implied: the live front page already links to /waitlist, three legal pages, /support and the sign-in pages, so discovery works today; the bigger lever is Search Console, still an open to-do in the handoffs (session 50 lines 108 and 141, session 52 line 104, and wave-plan-pwa/research-stores/play-and-more.md line 336 names Franky). A web search limited to the domain returned one result, the home page, with outdated wording. Second, the post-link risk was misdescribed: the live club page contains zero links to /posts/, so search engines have no path to post links unless someone pastes one on a public web page, and for a real post the listing would carry the author's name and up to 140 characters of the text (src/app/posts/[id]/page.tsx:114-147), not an empty sign-in entry. The policy's short version (line 13) already says search engines can list posts, so marking post links 'do not list' gives more privacy than promised and needs no policy edit; it is cheap insurance rather than a launch item.

**Evidence.**
- https://www.connectvibe.app/robots.txt -> 200 text/plain: 'User-Agent: * / Allow: /' and 'User-Agent: Googlebot-Image / Allow: / , /favicon.ico , /icon.png , /favicon-48.png'. No 'Sitemap:' line (src/app/robots.ts:13-27)
- https://www.connectvibe.app/sitemap.xml -> 404 (Vibe's not-found page); there is no src/app/sitemap.ts
- Privacy Policy: handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md:13 ('search engines can list them'), :218 ('profile and club pages can appear in search results'), :216 (a post link needs sign-in)
- Pages that carry noindex: /waitlist/confirm (src/app/waitlist/confirm/page.tsx:9), /html/profile.html (public/html/profile.html:11), /auth/confirm, /auth/callback, /auth/update-password, /account/suspended, and every 404
- Pages with no noindex: /orgs/sae and /profile/<handle> (src/app/profile/[handle]/page.tsx:77-119) - consistent with the policy; /posts/<id> sign-in card - every made-up id answers 200 with the same card (src/app/posts/[id]/page.tsx:40-44, 171-173); /auth/login, /auth/signup, /auth/forgot-password
- Belong in a sitemap: /, /waitlist, /legal/privacy, /legal/terms, /legal/community, /legal/child-safety, /legal/delete-account, /support, /plus
- Must stay out: /profile/*, /posts/*, /html/*, /auth/*, /waitlist/confirm and everything behind sign-in; /orgs/* out for now (one real club, and test clubs exist)
- A new /sitemap.xml route would be served, not gated: the proxy treats .xml as a file (src/proxy.ts:111-115)

## 10. Alt text on images: Partly

**In plain terms.** The front page's pictures are described, and a photo in a chat already announces itself as a photo. The gap is photos on posts: in the feed, on a profile and on a club's page, someone using a screen reader is never told a photo is there, and nobody can write a description for one.

**If left.** A student who uses a screen reader cannot tell that a post has a photo or what it shows, which is the kind of accessibility gap a university office can raise before a campus rollout.

**Fix.**

Quick pass (Claude, about an hour plus the phone and desktop walk; no data change, no policy change). Give every post photo a spoken label from what the card already knows, 'Photo posted by <name>': role="img" + aria-label on the photo div at src/components/mobile/CampusMobile.tsx:1769-1779 and src/components/mobile/PostViewerMobile.tsx:867-877; change the label at src/app/campus/campus-home.tsx:8277 from 'Open comments' to 'Photo posted by <name>, open comments'; a real alt in place of alt="" at src/app/orgs/[handle]/OrgPostsList.tsx:208-210, public/html/_postViewer.js:1139 and public/html/profile.html:9839. While there, add alt="" to the 12 avatar and logo images that have no alt at all (public/html/profile.html 4042, 4445, 4498, 4809, 4841, 4915, 6193, 10330, 10352; public/html/messages.html 3034, 3080; public/html/_persistence.js 670). Optional, one word each: alt="Photo" at public/html/messages.html:1557 and public/html/_miniMessenger.js:980 (the fallback chat only). Not needed to tick this item: a 'Describe this photo' box when posting. That is a new column, three composers and a Privacy Policy line the same day, and it is Franky's call for after launch.

**The second check (gap confirmed by the skeptic).** I reproduced the gap, but it is smaller than described. Post photos: the feed photo is a background picture with no label (CampusMobile.tsx:1769-1779), same in the opened post (PostViewerMobile.tsx:867-877); on desktop it is a button that only says 'Open comments' (campus-home.tsx:8270-8287); the public club page, the desktop post viewer and the static profile use alt="" (OrgPostsList.tsx:210, _postViewer.js:1139, profile.html:9839). Chat is NOT part of the gap: the live chat already says alt="Photo" (src/components/mobile/messages/MessageBubble.tsx:335-338) and the new chat is on for everyone on phone and desktop; the two alt="" chat spots the first agent listed are the off-switch fallback. The 12 images with no alt are avatars and logos sitting next to a printed name, so the right fix is alt="", minutes of work. Lighthouse image-alt passes on the landing page (score 1) and accessibility is 100 on all five tested signed-out pages, so the checklist item as the video means it (the site's own pictures) is already met. The quick pass uses only the name already shown on the card, so it collects nothing new and touches neither the Privacy Policy nor the CSP.

**Evidence.**
- Lighthouse image-alt audit passes and accessibility scores 100 on /, /auth/login, /auth/signup, /waitlist, /legal/privacy (scratchpad launch-checklist/lh/*.json)
- src/components/landing/home-landing.tsx:43,47,51 - the three landing stills have full written descriptions; src/components/landing/day-on-vibe.tsx:94-113 - film poster alt plus a spoken description of the film
- src/: 28 '<img' + 1 next/image grep hits, 13 of them code comments. Real elements 16: 0 missing alt, 11 alt="", 5 with real text (2 landing, chat photo "Photo" at MessageBubble.tsx:335, resume page at ResumeViewerMobile.tsx:799, admin slot at admin/image-slots.tsx:104)
- src/: 80 photos are drawn as CSS backgrounds (url(${...})), which have no alt by nature: src/app/campus/campus-home.tsx (20), src/components/mobile/ProfileMobile.tsx (8), src/components/mobile/CampusMobile.tsx (8), PostViewerMobile.tsx (3), 32 other files. None of the photo ones has role="img" + aria-label (the 3 role="img" hits in src are icons / a faces stack)
- src/components/mobile/CampusMobile.tsx:1778 - feed post photo is a background div with no label; src/components/mobile/PostViewerMobile.tsx:872 - same in the opened post
- Post photos with empty alt: public/html/_postViewer.js:1139, public/html/profile.html:9839, src/app/orgs/[handle]/OrgPostsList.tsx:208 (the public, signed-out club page)
- public/html (desktop static pages): 53 real images (47 tags + 6 built with createElement; 10 more grep hits are comments): 12 with NO alt, 38 alt="", 3 real text
- The 12 with no alt: public/html/profile.html:4042, 4445, 4498, 4809, 4841, 4915, 6193, 10330, 10352 (avatar, work and company logos); public/html/messages.html:3034, 3080 (avatars); public/html/_persistence.js:670 (avatar)
- No way to describe a photo: grep for alt_text / media_alt / 'describe' across src, supabase/migrations and public/html returns 0 hits; src/components/mobile/PostComposerMobile.tsx has no such field
- Avatars and club logos mostly sit next to the person's or club's name, so empty alt is acceptable there; the gap is post photos and chat photos

## 11. Compressed images: Partly

**In plain terms.** Every picture the site ships is small, and profile photos, post photos and club pictures are all shrunk before they are stored. The one real gap is chat: a photo sent in a DM or group chat goes up exactly as the phone took it, up to 15 MB, so the people receiving it on cell data wait for it and pay for it.

**If left.** A student on cell data who opens a group chat or a club's posts can pull down several megabytes per photo, which feels slow and eats their data plan.

**Fix.**

One change (Claude, 1 to 2 hours with the phone and desktop walk): shrink a chat photo in the browser before it is sent. In chooseMedia at src/components/mobile/messages/ConversationView.tsx:513-536 (one component serves phone and desktop chat), draw JPG, PNG and WebP picks onto a canvas at 2048 px on the long edge and export JPEG at about 0.85, the same step as src/components/ImageCropperModal.tsx:317-338; leave GIFs and anything already under about 1 MB alone. The upload route needs no change, it signs whatever size is declared. Same day: the Privacy Policy says chat photos keep their hidden location (handoffs/legal-2026-10-04-privacy-v3/privacy-policy-final.md lines 28 and 111, and the live page under src/app/legal/privacy/). After this change photos sent from the app lose it as a side effect, so reword both lines to say that without promising it, because it happens in the browser and GIFs and videos are untouched. Franky OKs that wording. Drop from the first agent's list: server shrinking for club uploads, a second smaller copy of each post photo for the feed, and extra 640-px landing files.

**The second check (gap confirmed by the skeptic).** The chat gap is real: the route allows 15 MB photos (src/app/api/me/messages-upload-url/route.ts:16-17) and the chat stages the file as picked and uploads it untouched (ConversationView.tsx:513-536 and 346-351). It only applies to DMs and group chats (line 508). The rest of the first agent's finding does not hold up. Club pictures do NOT go up at full size: every club image picked in the app is forced through the cropper first, logo to 1024 px, banner to 2400 px, post image to 1600 px, JPEG 0.92 (src/app/orgs/[handle]/admin-actions.tsx:361-382, 443-446, 501-508, 545-562, 686-697), and that file is the only caller of the club upload route; the 5/10/15 MB numbers are ceilings, not what gets stored. Post photos are already 1600-px JPEGs (PostComposerMobile.tsx:639-649, campus-home.tsx:7317-7326, then src/lib/media/strip-image.ts caps 2048 px at quality 88). A phone feed tile is about 1,000 device pixels wide, so a 720-px copy would look soft, and a second stored file would have to be handled by account deletion and the moderation sweeps: not a launch item. The landing 640-px variants save about 70 KB and 0 ms by Lighthouse's own estimate. Site assets confirmed fine: nothing in public/ over 78 KB, AVIF/WebP with fallbacks, film is preload="none".

**Evidence.**
- public/: 34 image files, the largest is 77.5 KB (public/landing/film-poster-780.jpg). Nothing over 300 KB. No video file in the repo
- Live HEAD https://www.connectvibe.app/landing/still-events-960.avif 200 image/avif 27,269 B; still-dm-960.avif 23,254 B; still-orgs-960.avif 21,042 B; film-poster-780.avif 36,746 B; /opengraph-image 200 image/png 89,821 B; /icon.png 8,838 B; /apple-icon.png 8,019 B
- Live HEAD film (src/lib/landing/demo-media.ts:25-28, Vercel Blob): vibe-demo-780.mp4 200 video/mp4 2,180,527 B; vibe-demo-390.mp4 200 video/mp4 1,024,134 B; cache-control max-age=2592000
- src/components/landing/day-on-vibe.tsx:79 - the film is preload="none", so it is not downloaded until Play (Lighthouse landing total 632 KiB confirms it)
- src/components/landing/readout.tsx:67-71 and day-on-vibe.tsx:91-103 - <picture> with AVIF, WebP and JPG, two widths, lazy loading, width/height set. Raw <img>, not next/image; next/image is used once in the whole app (src/components/otto/OttoRequests.tsx:70)
- Lighthouse landing-mobile: 4 images, 107 KB total; modern-image-formats, uses-optimized-images and offscreen-images all pass; 'Properly size images' 72 KiB (960-px stills shown 328 px wide, 780-px poster shown 280 px wide), estimated time saving 0 ms
- Profile and own-post uploads: src/app/api/me/profile-upload/route.ts:19-45 + src/lib/media/strip-image.ts:109-131 - server shrinks to avatar 1024 px, cover 2560, post photo 2048, video poster 1920, work logo 512, JPEG quality 88, same format back (no WebP/AVIF conversion). Caps 6 / 6 / 8 / 2 / 2 MB
- Before upload the browser cropper already shrinks: src/components/ImageCropperModal.tsx:91-93 (1600 px, JPEG 0.92); avatar 768 px and cover 3200 px at 0.96 (src/components/mobile/ProfileMobile.tsx:2557-2558); post photo 1600 px (PostComposerMobile.tsx:647)
- Chat photos NOT shrunk: src/app/api/me/messages-upload-url/route.ts:16-17 (15 MB photo, 200 MB video); src/components/mobile/messages/ConversationView.tsx:330-349 and 534 send the original file straight to storage; same route used by public/html/messages.html:2760
- Club uploads NOT shrunk on the server: src/app/api/orgs/[slug]/upload-url/route.ts:37-40 (banner 10 MB, logo 5 MB, post image 15 MB, post video 200 MB), direct to storage; only the browser cropper shrinks them (src/app/orgs/[handle]/admin-actions.tsx:446, 505, 693)
- No small feed version: src/app/api/posts/[id]/media/route.ts:119-144 redirects to the stored file as is; the thumbnail variant exists only for video posters. Feed draws it at src/components/mobile/CampusMobile.tsx:1778
- /landing/* is served with cache-control: public, max-age=0, must-revalidate (re-checked on every visit; minor)

## 12. Page load speed: Partly

**In plain terms.** The signed-out pages are fine on a laptop and acceptable on a phone, with the animated front page the heaviest of them. The page that is actually slow is the feed: in the real visits the error tracker has sampled, it takes about 3 seconds on a typical load and 4.5 to 5 on a slow one before the main content shows. The speed test itself was run on a busy laptop and its phone scores swing too much to act on.

**If left.** A student opening the link from a poster or Instagram on a weak signal waits 4 to 6 seconds, sometimes longer on the first hit, and some will leave before the waitlist button shows.

**Fix.**

Do not do the first agent's list (fonts through next/font with Privacy Policy and CSP edits, trimming Sentry, hunting 'old-browser code', splitting the big files): none of it is backed by the measurements. Instead, in this order. (1) Franky, 10 minutes: get clean phone numbers that do not depend on this Mac. Paste https://www.connectvibe.app/ and https://www.connectvibe.app/waitlist into pagespeed.web.dev, phone tab, three runs each, and write down the scores. Nothing is added to the site, so no policy change. (2) Franky or Claude, 10 minutes: read the real-visit numbers Sentry already collects (Sentry, Insights, Web Vitals, by page). Today's thin sample is in the why field. (3) Claude, a few hours, only if (2) keeps showing the feed over 3 seconds: stop sending phones the desktop feed. src/app/campus/CampusSwitch.tsx:3-8 imports both feeds and src/lib/use-is-mobile.ts:37-39 makes the server always build the desktop one, so a phone downloads and runs the desktop feed, then swaps. Have src/app/campus/page.tsx read the request's phone hint and pass it down as the first guess, and load CampusMobile and CampusHome with next/dynamic so each device gets only its half; then the same for the Profile, Messages, Network and Otto switch files. Walk it at 375 px and on desktop in the same deploy. No new data, no new host. (4) Franky, 5 minutes, only if first answers over 1 second keep showing up: Vercel, project, Settings, Functions, check that Fluid Compute is on. Optional: cut src/components/landing/fraunces-soft.woff2 (118 KB, front page and waitlist) down to the letters it draws; it is self-hosted, so no policy or CSP change.

**The second check (gap confirmed by the skeptic).** The verdict stands but the diagnosis and the fix do not. (a) The front page's 58 was not caused by one slow server answer: I re-ran the same phone test once and got 46 with a fast answer (325 ms), first content at 2.9 s, blocking time 1,170 ms. The front page does far more script work than the other pages in both runs (blocking 420 and 1,170 ms against 60 to 120 ms), which is the animated night sky and title. (b) The lab numbers are noisy: the same front page painted 0.2 s after its styles in one run and 1.9 s after in the next with nothing left to wait for, and the login and privacy runs show the same late paint, so those scores (73, 71) are probably pessimistic; several checks were running on this Mac at once. Google's own tester was quota-blocked. (c) Fonts are not the bottleneck: the Google stylesheet already has display=swap and a preconnect (src/app/layout.tsx:110-115), Lighthouse puts render-blocking savings at 0 ms, and the static pages and emails would keep loading Google fonts anyway, so the policy line could not simply go. (d) The shared script is not 'largely the error tracker': in the build it is about 46% React, 28% Sentry, 16% Next, with no session replay; trimming Sentry would save roughly 10 KB and cut the speed reports the policy describes. The 14 KiB of old-browser code is Next's own. (e) What the first agent could not see: Sentry already measures real visits (10% sample, src/lib/sentry-config.ts:354). Last 30 days, production, counts only: feed 4.7 s at the 75th percentile (7 sampled loads; about 3 s median; iPhone 4.9 s), messages 4.1 s (1 load), profile 1.2 s on Mac and 2.3 s on iPhone, front page on iPhone 2.8 s, signup 0.9 s, waitlist 0.45 s; one Windows front-page visit waited 5.8 s for the first answer. My own 6 timed requests to the front page answered in 0.22 to 0.41 s. Samples are small and include test loads, so step 1 and 2 come before any code.

**Evidence.**
- Method: Lighthouse 12.8.2, one run per page, phone runs simulate slow 4G (1.6 Mbps, 150 ms) and a 4x slower processor. Accessibility, best-practices and SEO are 100 on all six. Layout shift is 0 everywhere
- / (phone): score 58, LCP 5.5 s, blocking time 420 ms, CLS 0, 632 KiB in 30 requests. Top 3: server answered in 2,680 ms on this run (est. saving 2.6 s); unused JavaScript 93 KiB (350 ms); connect early to the Sentry host (360 ms). Also 2.0 s of main-thread work, 1.1 s of it in one shared script; oversize images 72 KiB (0 ms)
- /auth/login (phone): score 73, LCP 5.7 s, blocking 60 ms, CLS 0, 483 KiB in 38 requests. Top 3: unused JavaScript 116 KiB (730 ms); connect early to Supabase and Sentry (310 ms); old-browser code 14 KiB (200 ms)
- /auth/signup (phone): score 83, LCP 4.4 s, blocking 110 ms, CLS 0, 485 KiB in 35 requests. Top: unused JavaScript 123 KiB (550 ms); old-browser code 14 KiB (about 0 ms); no third item flagged
- /waitlist (phone): score 81, LCP 4.2 s, blocking 70 ms, CLS 0, 496 KiB in 29 requests. Top: unused JavaScript 66 KiB (360 ms); old-browser code 14 KiB (60 ms); no third item flagged
- /legal/privacy (phone): score 71, LCP 5.2 s, blocking 120 ms, CLS 0, 437 KiB in 25 requests. Top 3: unused JavaScript 65 KiB (360 ms); connect early to Sentry (330 ms); old-browser code 14 KiB (180 ms). 890 page elements
- / (desktop): score 98, LCP 1.0 s, blocking 0 ms, CLS 0, 578 KiB in 30 requests. Top: unused JavaScript 96 KiB (80 ms); old-browser code 14 KiB (30 ms); nothing else
- Slow first answer is occasional: page-document times seen were 2,826 ms once (the front-page phone run) and 343-627 ms on the other five Lighthouse runs; three plain requests to https://www.connectvibe.app/ gave first byte at 0.53 s, 0.26 s, 0.30 s. So the 58 is partly that one slow answer; the other phone pages (71-83) are the steadier picture. Not re-run to confirm
- https://www.connectvibe.app/ responds cache-control: private, no-cache, no-store and x-vercel-cache: MISS - the page is built fresh on every visit (src/app/layout.tsx:4 reads the request headers for the security nonce), so it can never be served from the edge cache
- One shared script is on every page: /_next/static/immutable/chunks/22nofgwmyo48i.js, 136 KB on the wire (437 KB unpacked), about half unused on each page; it contains 241 mentions of 'sentry', i.e. it is largely the error tracker's code
- Fonts are the second-biggest weight: 217 KB in 4 files on / (118 KB src/components/landing/fraunces-soft.woff2 + 40 KB self-hosted + 58 KB from fonts.gstatic.com). src/app/layout.tsx:111-116 loads a Google Fonts stylesheet on every page on top of the self-hosted fonts
- Signed-in pages, estimate from the local build of Oct 11 (.next, script referenced per page, compressed): /profile/[handle] ~424 KB, /profile ~362 KB, /campus (the feed) ~334 KB, /orgs/[handle] ~226 KB, /messages ~200 KB, versus ~45 KB for the front page. Local build, not the live one
- Source size behind those: src/app/campus/campus-home.tsx 572 KB, src/components/mobile/ProfileMobile.tsx 229 KB, src/components/mobile/CampusMobile.tsx 150 KB; desktop static public/html/profile.html 521 KB (113 KB compressed) plus 10 script files

## 13. Color contrast: Partly

**In plain terms.** The dark look is easy to read everywhere, and the landing page and waitlist (always dark) pass. On a phone set to light mode, the orange links and hints, the grey helper text, the faded example text inside boxes and the white words on orange buttons are paler than the accessibility standard asks: most people can still read them, but it gets hard in sunlight or with weaker eyesight. The perfect score from the speed tool does not settle it, because it could not measure text on Vibe's soft backgrounds and passed it by default.

**If left.** Students on light-mode phones, outdoors or with weaker eyesight struggle to read links, buttons and helper text on the sign-in and legal pages, and the app would fail a university accessibility review (WCAG AA) on those points.

**Fix.**

Pass 1 (Claude, about an hour; only the light look gets slightly darker, Night values stay): (a) grey helper text: src/app/globals.css:62 --ink-muted #8A8580 -> #6F6A64 (5.0:1 on cream), same value in the twins public/html/profile.html:93 and :107 and public/html/messages.html:84. (b) example text inside boxes: globals.css:117 --ink-faint #A8A39C -> #767169 and :193 #7A746C -> #857F77 (the token is used only inside globals.css, so this is safe); src/app/waitlist/waitlist.css:17 alpha 0.38 -> 0.5. (c) globals.css:78 --ok-ink #1A9E5B -> #147A45 (twin public/html/profile.html:128) and :79 --eyebrow-ink #C84A20 -> #B83A1A. (d) orange words on the signed-out pages: swap raw #FF5C35 / var(--coral) used as a text colour for var(--tag-ink) (exists in both themes; #B83A1A in Light = 5.4:1) at globals.css:737, 783, 790, 878, 986, 1135, 1177; src/app/legal/privacy/parts.tsx:15; src/app/legal/terms/page.tsx:31,115,175; src/app/legal/community/page.tsx:21; src/app/legal/child-safety/page.tsx:17; src/app/legal/delete-account/page.tsx:55; src/app/support/page.tsx:30. Side effect to know: Night links turn a shade lighter (#FF8A66), still passing. (e) src/app/auth/login/page.tsx:414 drop opacity 0.75; globals.css:989, 1001, 1005 #b48414 -> #8F6A10. Pass 2 (Franky decides the look first): white words on orange buttons are 3.07:1 and need 4.5. Either dark words on orange, as the landing page already does (#160A06, src/components/landing/landing.css:40, 6.3:1), or keep white and darken the fill to about #D23C17. Recommendation: dark words, one look across landing and app. Then globals.css:844, :959, :962-963, the roughly 80 in-app spots, and public/offline.html:101 (that file needs SW_VERSION bumped in public/sw.js in the same commit). Later sweep: the old grey is hard-coded where the token cannot reach it (src/app/the-map/page.tsx 9 places; src/components/mobile/ProfileMobile.tsx:4350, 5356, 5403, 5757; src/components/mobile/messages/ConversationView.tsx:771, 857), and orange words on the desktop static pages (profile.html, messages.html). The static pages must go out in the same deploy as globals.css. Check by walking Light and Night at 375px; the speed tool cannot check this. No Privacy Policy change and no new outside host are involved.

**The second check (gap confirmed by the skeptic).** Reproduced, so the finding stands. I recomputed every ratio myself and they match: white on orange 3.07, orange on cream 2.88 (3.03 on the sign-in card), grey helper text 3.42 on cream / 3.65 on white, example text 2.50, green 3.45, eyebrow 4.41; all Night pairs pass except the example text (3.94) and the white-on-orange button. My own anonymous render of https://www.connectvibe.app/auth/login at 375px in Light showed the button white on rgb(255,92,53) at 15px/600, 'Forgot?' orange at 12px, the tail line #8A8580 and the placeholder #A8A39C; https://www.connectvibe.app/legal/privacy showed 33 orange links at 15px/700 and the date line in #8A8580. The checker behind Lighthouse returned 0 violations but 21 (login) and 724 (privacy) text nodes it could not measure, and all six Lighthouse reports list color-contrast score 1 with zero items, so the 100 is a non-measurement, as the first agent said. Every line number in the proposed fix checked out and every proposed colour reaches 4.5:1 or better. Three corrections: the severity was overstated (the pages are readable in my screenshots, they are below the standard rather than hard to use); the token change misses hard-coded copies of the grey (listed in the fix); and the offline page edit needs the service worker version bumped (public/sw.js:6), which the first fix left out. No test pins these colour values (src/lib/theme/theme.test.ts only pins the two theme-color values and the boot script). The fix does not touch what the app collects or shows, adds no host and no tracker, so it does not collide with the Privacy Policy rule or the browser code rule. Notes and screenshots: /private/tmp/claude-501/-Users-franciscocazares-vibe/81a12e11-4ed3-4da4-838b-e8caceee3c9d/scratchpad/launch-checklist/verify-a11y-mobile.md and .../launch-checklist/verify-a11y/ (login-light-375.png, privacy-light-375.png).

**Evidence.**
- Maths script (96 colour pairs): /private/tmp/claude-501/-Users-franciscocazares-vibe/81a12e11-4ed3-4da4-838b-e8caceee3c9d/scratchpad/launch-checklist/a11y-contrast.js; notes in .../launch-checklist/a11y-mobile.md
- Lighthouse 12.8.2, all six reports: color-contrast score 1, accessibility 1.00, zero failing elements listed. It ran in Light only (headless Chrome), so Night on login/signup/privacy was never audited by it
- Why that pass is hollow: axe-core run on the live pages (anonymous headless Chrome, GET only) returned 0 violations but marked the text 'incomplete' = could not measure: /auth/login 21 nodes (pseudoContent), /auth/signup 34, / 43 (bgGradient, imgNode), /waitlist 42, /legal/privacy 724 (bgGradient). Cause: src/components/legal/LegalLayout.tsx:7,31 (gradient page background), src/app/globals.css:619-643 (auth page ::before/::after overlays), src/components/landing/landing.css:14 (gradient --page)
- LIGHT fail, white on coral button 3.07:1 (needs 4.5 at 15px/600): src/app/globals.css:843-844 (.vibe-auth-submit). Seen live on https://www.connectvibe.app/auth/login 'Sign in', /auth/forgot-password 'Send reset link', the 404 page 'Go to Campus'. Same 3.07 in Night
- LIGHT fail, coral #FF5C35 as text: 2.88:1 on cream, 3.03 on the sign-in card (fails even the 3:1 large-text bar on cream). Live: /legal/privacy 33 links, /support 12, /legal/community 9, /legal/terms 3, login 'Forgot?' (12px), 'Join the waitlist', signup hints at 11px. Code: src/app/globals.css:737,783,790,878; src/app/legal/privacy/parts.tsx:15; src/app/legal/terms/page.tsx:31,115,175; src/app/legal/community/page.tsx:21; src/app/legal/child-safety/page.tsx:17; src/app/legal/delete-account/page.tsx:55; src/app/support/page.tsx:30
- LIGHT fail, grey helper text --ink-muted #8A8580: 3.42:1 on cream, 3.65 on white, 3.14 on the legal backdrop's darker end (src/app/globals.css:62). Used as a text colour about 313 times in 31 files. Live: 'Effective October 5, 2026', 'New to Vibe?', the 10px '← BACK' pill (3.54)
- LIGHT fail, placeholder --ink-faint #A8A39C on white 2.50:1 (src/app/globals.css:117, .vibe-auth-input::placeholder at :814). NIGHT placeholder #7A746C 3.94:1 (globals.css:193). Waitlist placeholder cream at 38% = 3.32:1 (src/app/waitlist/waitlist.css:17)
- LIGHT fail, smaller ones: login 'Privacy Policy · Terms' footer 2.47:1 because of opacity 0.75 (src/app/auth/login/page.tsx:414); '.edu' chip 2.65 (globals.css:731-737); success green --ok-ink #1A9E5B 3.23-3.45 (globals.css:78); eyebrow labels #C84A20 at 11px 4.41 (globals.css:79); school-step gold #b48414 3.31 and white on #d4a020 2.37 (globals.css:962-963, 989)
- PASS, Night theme: body 17.5:1, secondary 11.9, muted 6.6 (6.2 on cards), coral text 6.4, error 7.2, green 9.3. Live /legal/privacy in Night: 0 failing of 733 text elements; /legal/terms, /support, /legal/community, /plus: 0
- PASS, landing and waitlist (always Night, own colours in src/components/landing/landing.css:4-10): 85 text elements measured live on /, 0 fail. The coral button there uses dark ink #160A06 on coral = 6.33:1 (landing.css:40), body #CFC8BE 11.9, muted #9C958C 6.6 (5.2 on the hottest coral bloom), every accent colour 6.9 or better
- Static pages keep their own hand-copied token blocks with the same values, not globals.css: public/html/profile.html:89-168 (Light) and :170-229 (Night), public/html/messages.html:84 and :94, public/html/onboarding.html:27 and :40, public/offline.html:31-41. Same Light failures there: color:var(--muted) 108 times in profile.html and 66 in messages.html, coral text 40 and 12, white on coral fills 28 and 13; public/offline.html:100-101 cream on coral 2.88; onboarding hints at white 35-40% = 3.2-3.8 (onboarding.html:182,192,215,231)
- Spread across the app: white text on a coral fill in 80 places / 24 files, coral as a text colour in 136 places / 32 files (scan script .../launch-checklist/a11y-scan.js)

## 14. Mobile friendly: Done

**In plain terms.** Yes, this one is done. Every page a visitor can open fits a phone screen with no sideways scrolling, pinch-zoom works, typing in a box does not make the page jump, and the app itself is built for phones first. What the first check listed is polish already on the handoff list (posts showing through the feed's tab chips, one button sitting inside another in the feed, a few small text links) plus your own walk of the new chat on a real iPhone, which was already owed.

**If left.** Nothing on the public pages breaks on a phone; the cost is a feed header that looks unfinished when posts slide under it, a few fiddly links, and the chance that the new chat has a phone-only problem nobody has seen because it has never been walked on a real device.

**The second check (first verdict overturned by the skeptic).** The leftovers the first agent found are real in the code, but none of them makes the app less than phone-friendly, so 'partly' overstates it. What I checked myself: anonymous renders at 375px and 320px of https://www.connectvibe.app/auth/login, /legal/privacy and /orgs/sae (the club page, which the first agent never saw live) all had page width equal to screen width, the right viewport tag (width=device-width, initial-scale=1, viewport-fit=cover) and zero tap-size violations; the five mobile Lighthouse reports score 1 on target-size, viewport, meta-viewport and font-size; there is no zoom lock anywhere in src or public; the landing film plays inline and muted (src/components/landing/day-on-vibe.tsx:79-80); phones are kept off the desktop static profile (src/app/profile/[handle]/ProfileHandleSwitch.tsx:44-60). The small links (Back to Vibe 96x17, the sign-up tail links) pass the 24px accessibility rule in both tools; they are only under the 44px comfort size. Optional polish, none of it required for this item: (1) src/components/mobile/CampusMobile.tsx:883 give the sticky tab strip a background (var(--tabbar-bg)) so posts do not show through the chips (the panes do not scroll on their own, :1179-1187, so posts do pass under it). (2) CampusMobile.tsx:1633 and :1719-1725, the button inside a button: it works on a phone because feed cards are built in the browser after the feed loads; the cost is a console warning and a screen reader that may not reach 'More actions'. The S75 close handoff (line 242) names the wrong file for this, src/app/campus/campus-home.tsx; CampusMobile.tsx is the right one. (3) add the vibe-auth-link--tap class at src/app/auth/signup/signup-form.tsx:513, 585, 595, 662, 672 and a 44px height on src/components/legal/LegalBackLink.tsx:21. Still true and still Franky's: nothing behind sign-in can be seen from outside, and the real-phone walk of the new chat is on his own list in handoffs/2026-10-11-session-75-close-browser-rule-and-next-up.md:223. Notes: /private/tmp/claude-501/-Users-franciscocazares-vibe/81a12e11-4ed3-4da4-838b-e8caceee3c9d/scratchpad/launch-checklist/verify-a11y-mobile.md; club page screenshot .../launch-checklist/verify-a11y/org-light-375.png.

**Evidence.**
- Viewport tag, root layout: src/app/layout.tsx:66-71 (width device-width, initialScale 1, viewportFit cover); src/app/page.tsx:28 and src/app/waitlist/layout.tsx:11 only change themeColor. Served on all 11 pages rendered: 'width=device-width, initial-scale=1, viewport-fit=cover'
- Viewport tag, static pages: public/html/profile.html:7, public/html/messages.html:7, public/html/onboarding.html:7 ('width=device-width, initial-scale=1.0'); public/offline.html:24 (adds viewport-fit=cover). No zoom lock anywhere: no user-scalable / maximum-scale in src or public
- Phones never get the desktop static pages: src/app/profile/[handle]/ProfileHandleSwitch.tsx:44-60 branches on screen width and renders the React phone profile
- Lighthouse 12.8.2 mobile (412px): accessibility 1.00 and SEO 1.00 on /, /auth/login, /auth/signup, /waitlist, /legal/privacy (and desktop /). Audits target-size, viewport, meta-viewport, font-size all pass on each. Lighthouse 12 no longer has the 'content wider than screen' or old 'tap-targets' audits, so overflow was measured directly
- Rendered check, anonymous headless Chrome, GET only (script .../scratchpad/launch-checklist/a11y-render.js): page width equals screen width at 375px and at 320px on /, /waitlist, /auth/login, /auth/signup, /auth/forgot-password, /legal/privacy, /legal/terms, /legal/community, /support, /plus and the 404 page. No text cut off at the edge
- Tap sizes: effective touch area 44px or more for every control on /auth/login, /auth/forgot-password's button and the 404 page (the small pills carry invisible hit-area extenders, src/app/globals.css:670-674 and :1091-1106)
- Form fields are 16px, so iPhone does not zoom in on focus: src/app/globals.css:798-812 (.vibe-auth-input), src/app/waitlist/waitlist.css:16
- No fixed width over 375px on the signed-out routes: the 720px values in src/app/orgs/[handle]/OrgContent.tsx:15 and OrgPostsList.tsx:36 are breakpoints; landing sizes use clamp()/max-width (src/components/landing/landing.css:70,173,236); legal tables stack under 480px (src/components/legal/LegalLayout.tsx:171-180)
- Legible text share (Lighthouse font-size): / 85.5%, login 89.2%, signup 93.3%, waitlist 98.1%, privacy 100%. The small text: landing mono labels at 10-10.5px (landing.css:76,140,156,195,219,240,252; 35 elements at 10.5px live), '← BACK' pill 10px (globals.css:653), field hints 11px (globals.css:782)
- Small tap targets found live: '← Back to Vibe' on the legal pages 96x17px (src/components/legal/LegalBackLink.tsx:21-23); bottom legal nav rows 20px tall (LegalLayout.tsx:92-125); signup 'Log in', 'Join the waitlist', help@ links 19px tall (they lack the vibe-auth-link--tap class the login page uses); waitlist wordmark link 52x32
- Known open, session 74 handoff section 8, STILL in code: the phone feed's Feed/Events/Orgs/Map chips have no background when posts scroll under them: src/components/mobile/CampusMobile.tsx:880-884 (sticky header, background 'transparent')
- Known open, session 74 section 8 and session 75 close handoff line 242, STILL in code: a feed card is a button holding a button: src/components/mobile/CampusMobile.tsx:1633 (outer <button>) and :1719-1725 (inner 'More actions', which is also only 30x30px, :1727-1728)
- Known open, session 75 close handoff ('Franky's own list'): the real-phone walk of the new chat, live for everyone since Oct 5, is still owed
- Already fixed since the Oct 8 feature report: phone profile has a Message button and unfollow asks first (commit d9346b6, src/components/mobile/ProfileMobile.tsx:5655); a refused follow or RSVP now says why (commit 02096c3)
- Not seen live: everything behind sign-in (feed, chat, Settings, map) and /orgs/<handle>, /posts/<id>; those were judged from code only

## 15. Custom 404 page: Done

**In plain terms.** A wrong or old link shows Vibe's own 'That page isn't here' card with a Go to Campus button plus Sign in and Home, not a bare error page. That holds for made-up pages, made-up profiles and made-up clubs. One small wrinkle: the main button takes a signed-out visitor to the sign-in screen first.

**Evidence.**
- https://www.connectvibe.app/zz-no-such-page-q7 -> 404, title 'Not found · Vibe', heading 'That page isn't here.', links Go to Campus (/campus), Sign in (/auth/login), Home (/) (src/app/not-found.tsx:4-8, 22-46)
- https://www.connectvibe.app/legal/zz-nonsense -> 404, same card
- https://www.connectvibe.app/profile/zz-no-such-person-q7 -> 404 + noindex; the card renders in a fresh, signed-out headless browser (screenshot: /private/tmp/claude-501/-Users-franciscocazares-vibe/81a12e11-4ed3-4da4-838b-e8caceee3c9d/scratchpad/launch-checklist/seo/nf-profile.png)
- https://www.connectvibe.app/orgs/zz-no-such-club-q7 -> 404 + noindex, same card in the page payload
- https://www.connectvibe.app/html/zz-nonsense.html -> 307 to /auth/login?next=%2F, not the 404 card: every /html/*.html address sends a signed-out visitor to sign-in by design (src/proxy.ts:319-362)
- Go to Campus -> /campus -> 307 /auth/login?next=%2Fcampus when signed out; the sign-in page then offers 'New to Vibe? Join the waitlist' (src/app/auth/login/page.tsx:391-397)
- src/app/global-error.tsx exists for crashes

## 16. Broken links: Done

**In plain terms.** Every link on the signed-out pages and in the emails goes somewhere real; none is dead. The two contact addresses (help@ for support and safety, hello@ for general contact) are used consistently. One outside link on the SAE club page (Riley Children's) refused my automated check, so open it once by hand.

**Evidence.**
- 15 signed-out pages fetched (/, /auth/login, /auth/signup, /auth/forgot-password, /waitlist, /waitlist/confirm, five /legal pages, /support, /plus, /orgs/sae, /posts/<id>): every internal link answers 200, or 307 to sign-in for /campus and /settings (expected)
- All in-page jump links exist: #section-1 to #section-15 with 3a-3h and 5a-5i and #waitlist on the Privacy Policy, #intimate-images on the Guidelines, #vln-doors and #vln-film on the front page
- Source scan: every internal path used in src/ and public/html maps to a real route under src/app
- Outside links: https://report.cybertip.org -> 200 (child-safety page); https://www.sae.net/ -> 200 (the club's own link); https://www.rileychildrens.org/ (the club's own link on /orgs/sae) -> timed out behind an Akamai bot wall, unconfirmed by script
- Front-page media: /landing/still-orgs-720.jpg and /landing/film-poster-780.jpg -> 200; the film files on Vercel storage (vibe-demo-780.mp4, vibe-demo-390.mp4) -> 200 video/mp4
- Emails: supabase/templates/confirmation.html links {{ .SiteURL }}/auth/confirm (route exists), {{ .SiteURL }} and https://www.connectvibe.app/legal/privacy (200); src/lib/waitlist/email-content.ts:81-102 builds /waitlist/confirm?token=... and /auth/signup?access_code=... (both pages 200); src/lib/email/resend-transactional.ts:54,140,152
- Addresses: help@connectvibe.app (46 mentions: support, safety, access-code help, 'Bring my club') and hello@connectvibe.app (7 mentions: src/components/legal/LegalLayout.tsx:120, src/app/legal/terms/page.tsx:174, src/app/plus/page.tsx:744, src/app/legal/delete-account/page.tsx:61, waitlist reply-to at src/lib/waitlist/email-content.ts:46). No third address. Both reach the same inbox per the policy (privacy-policy-final.md:156)
- Small nits, nothing broken: the '← Back' link on /plus goes to /campus, so a signed-out reader lands on sign-in; calendar downloads name the organizer as noreply@vibe.local, which is not a real address (src/app/api/events/[id]/ics/route.ts:110, src/app/api/me/calendar/ics/route.ts:151)

## 17. Form validation: Partly

**In plain terms.** Checking what people type is done: every form checks in the browser and again on the server. Two small things are left. The forgot-password screen asks for a "personal email" when new students sign up with their school one, so a student who follows the label is told to check their inbox and nothing ever arrives. And when a post or a Settings change fails, a few screens show the computer's own words instead of a plain sentence.

**If left.** A tester whose post fails on weak campus Wi-Fi sees "Load failed" or "Unauthorized" with no hint what to do, which reads as a broken app.

**Fix.**

In this order.

1. Labels (minutes): make the email field on forgot password and the two resend screens read exactly like the sign-in page ("Email", hint "the one you signed up with", placeholder you@iu.edu): src/app/auth/forgot-password/page.tsx:101 and :107, src/components/auth/ResendConfirmation.tsx:161 and :173, src/components/auth/EmailLinkProblem.tsx:163 and :173.

2. Phone post composer (about an hour): in src/components/mobile/PostComposerMobile.tsx:222-317 send the three calls to Vibe's own servers through the shared helper (vibeRequest with quiet and a failure sentence, src/lib/feedback/request.ts) and show its message; give a failed video upload (:239) a fixed sentence such as "Your video didn't upload. Check your connection and try again."

3. Settings (minutes): the same for change handle (src/components/settings/SettingsClient.tsx:1016-1030) and delete account (:1297-1307).

Can follow after the first testers, lower traffic: group chat settings (src/components/mobile/messages/GroupSettingsView.tsx, six spots), the desktop composer and event windows (src/app/campus/campus-home.tsx:7124, 10821, 10844, 10871 and the 13 "Failed to ..." lines), src/components/LeftNav.tsx:1527, src/app/orgs/[handle]/ChannelsSection.tsx:107, and the four toasts in public/html/profile.html (use the window.vibeRequest twin).

Drop from the first plan: the 2000-character counter (already there) and the pop-ups in public/html/messages.html (fallback page only).

No Privacy Policy change, no browser-rule change: nothing new is collected or loaded.

**The second check (gap confirmed by the skeptic).** The gap is real but smaller and a bit different from how it was described, and one claim was wrong.

Wrong: "the phone post composer has no character count". It has one. src/components/mobile/PostComposerMobile.tsx:507 shows the count out of 2000 and :525 stops typing at 2000.

Over-counted: src/components/mobile/SharePostSheet.tsx:208-219 and src/components/mobile/ProfileMobile.tsx:905-921 already write their own plain sentences when the server refuses; only a dropped connection lets the browser's own text through there.

Confirmed:
- PostComposerMobile.tsx:317 shows whatever was caught. That can be the server's "Unauthorized" (src/app/api/me/publish-post/route.ts:60), "Invalid JSON" (:76), "Request failed" (:185), "Upload failed (HTTP n)" (composer :239), or the browser's own network and parse wording, because each call does .then(r => r.json()). The composer is used on the Campus and Profile tabs (CampusMobile.tsx:1039, ProfileMobile.tsx:2648).
- SettingsClient.tsx:1023 builds "HTTP <number>" and :1030 shows it; same at :1304 and :1307.
- GroupSettingsView.tsx:83, 113, 139, 161, 194, 221, and this is the live phone chat (ConversationView.tsx:1446), not the fallback.
- campus-home.tsx:1258 "Failed to create org", :1264 "Network error", 13 lines of the server's text or a "Failed to ..." fallback; profile.html:4801, 6635, 6678, 9259.

The one true form defect, which the first report listed last: forgot-password/page.tsx:101 says "Personal email (the one you log in with)" with you@gmail.com at :107, while sign-in says "Email, the one you signed up with, you@iu.edu" (login/page.tsx:290-296) and sign-up says "School email" (signup-form.tsx:522). The reset route gives the same answer whether or not the address has an account (src/app/api/auth/password-reset/route.ts:29-33, on purpose), so the label is the only guidance a student gets. That is why it goes first.

Input checking itself holds up: the 8 to 72 password rule on update-password, length limits on onboarding and profile fields, and server caps on posts and comments. I found no form that accepts junk silently. So the checklist item in its own sense is met; what remains is a wrong label and failure wording, about one to two hours for the three steps that testers will touch.

**Evidence.**
- GOOD, waitlist: one checker runs in the browser and on the server (src/lib/waitlist/form.ts parseWaitlistForm; src/app/waitlist/waitlist-form.tsx:101; src/app/api/waitlist/route.ts:95); the message sits under the field and the cursor moves to it
- GOOD, sign-up: checks before sending (src/app/auth/signup/signup-form.tsx:236-265) and turns every refusal into its own sentence (:75-116). Sign-in: src/app/auth/login/page.tsx:35-45. Forgot password: src/app/auth/forgot-password/page.tsx:25-38. Confirm code: src/components/auth/ConfirmCodeForm.tsx:96-102
- GOOD, server checks sampled: events (src/lib/events/validate.ts, called at src/app/api/events/route.ts:457), posts (src/app/api/me/publish-post/route.ts, 2000-character cap :24), clubs (src/app/api/orgs/route.ts:655-720), profile (src/app/api/me/profile/route.ts:247-359), reports (src/app/api/me/reports/route.ts:494-528), personal email (src/app/api/me/personal-email/route.ts:97-152), comments (src/app/api/posts/[id]/comments/route.ts:392-396). No sampled form accepts junk silently
- GOOD, the shared helper that writes clean messages: src/lib/feedback/request.ts and src/lib/feedback/failure-copy.ts (used by the report sheet, the event composer at src/app/campus/campus-home.tsx:11330-11355, Settings campus and personal email)
- RAW TEXT, phone post composer (Campus and Profile tabs): src/components/mobile/PostComposerMobile.tsx:317 prints the caught error as is, so a student can see the server's 'Unauthorized', 'Request failed' or 'Invalid JSON', iPhone's 'Load failed' when offline, or 'Upload failed (HTTP 403)' (:239)
- RAW TEXT, Settings: src/components/settings/SettingsClient.tsx:1030 (change handle, can print 'HTTP 500') and :1307 (delete account)
- RAW TEXT, 15 more places that print the caught error: src/components/mobile/messages/GroupSettingsView.tsx:83, 113, 139, 161, 194, 221; src/components/mobile/SharePostSheet.tsx:219; src/components/mobile/ProfileMobile.tsx:921; src/app/campus/campus-home.tsx:7124, 10821, 10844, 10871; src/components/LeftNav.tsx:1527; src/components/mobile/ResumeViewerMobile.tsx:306; src/app/orgs/[handle]/ChannelsSection.tsx:107
- TERSE, desktop club windows: src/app/campus/campus-home.tsx:1258 ('Failed to create org'), :1264 ('Network error'); 13 lines in that file show the server's sentence or a 'Failed to ...' fallback
- RAW TEXT, desktop profile page: public/html/profile.html:4801, 6635, 6678, 9259 (toast of the error's own message). Old messages page: 17 browser pop-ups (public/html/messages.html:2844-3751) and public/html/_miniMessenger.js:1128; that page is only the fallback since the new chat went to everyone
- WRONG LABEL: forgot password asks for 'Personal email ... you@gmail.com' (src/app/auth/forgot-password/page.tsx:101, :107), as do src/components/auth/ResendConfirmation.tsx:161, :173 and src/components/auth/EmailLinkProblem.tsx:163, :173, while sign-up (signup-form.tsx:522, :528) and sign-in (login/page.tsx:296) now say school email
- MISSING HINT: the phone post composer has no character count; a post over 2000 characters is only refused after tapping Post (no maxLength in PostComposerMobile.tsx; src/app/api/me/publish-post/route.ts:24)

## 18. Spam protection: Partly

**In plain terms.** The one form a stranger can fill in, the waitlist, is well protected, and sign-up is closed without an access code. What is left: nothing asks "are you human", so someone with a short script can make Vibe's sign-in service email a member every minute, which uses up the shared email allowance and stops new students' sign-up codes from arriving.

**If left.** In launch week one person with a short script can stop every new student's sign-up code from arriving, hour after hour, and flood a student's inbox with reset emails.

**Fix.**

Two steps, the first can ship alone today.

STEP A (Claude, minutes, no policy change, no new outside host): in src/app/api/auth/password-reset/route.ts key the per-network limit on clientNetworkKey(req) instead of clientIp(req) (line 35), make it failClosed, and add an hourly and a daily cap on reset emails counted inside after() just before sendPasswordResetEmail (line 98), so junk requests cannot spend the cap. Drop the per-address allowance from 3 an hour to about 3 a day. Forgot password does NOT need the human check or a Cloudflare server call: it sends through the service role, which Supabase's captcha switch never touches. That removes the TURNSTILE_SECRET_KEY setting and the server check from the first plan.

STEP B (both, a few hours, before testers arrive and in any case before signup_open is switched on): put the Cloudflare Turnstile box on the three forms that talk to Supabase straight from the browser and pass its token as options.captchaToken: signUp (src/app/auth/signup/signup-form.tsx:276), signInWithPassword (src/app/auth/login/page.tsx:139), resend (src/components/auth/ResendConfirmation.tsx:115). A token works once, so reset the box after every try, and give a failed check its own sentence in the sign-in and sign-up error maps. In src/lib/security/csp.ts add https://challenges.cloudflare.com to frame-src (and to script-src as a fallback) for the app flavour only, and update csp.test.ts. The static pages need no change: none of them has a sign-in form. One new public setting: NEXT_PUBLIC_TURNSTILE_SITE_KEY; skip the box when it is unset so local sign-in keeps working.

Franky, after that deploy is live: create the free Turnstile site in Cloudflare for www.connectvibe.app, add the site key in Vercel, then Supabase > Authentication > Attack Protection > turn on Captcha, provider Turnstile, paste the secret. Flipping it before the code is live locks everyone out of sign-in. Sign in once inside the iPhone shell first: the store app loads the live site in a webview and a reviewer signs in through that same page.

Same day, Privacy Policy in two places, not one line: the sentence "Sentry is the one outside tool that measures anything" (privacy-policy-final.md:140) and the Cloudflare row in section 6 (:346), plus the live page in src/app/legal/privacy. Cloudflare is already a named company there, so no new company is added. Keep the box off the waitlist pages.

Not a fix on its own: raising Supabase's emails-per-hour number. On the free Resend plan the daily allowance then becomes the wall and all of Vibe's email stops instead.

**The second check (gap confirmed by the skeptic).** I tried to knock this down and could not; the gap is real, but the fix was bigger and slightly wrong in three places.

Confirmed by reading:
- 0 mentions of captcha or turnstile in src/ and public/html. supabase/config.toml:208-211 has the captcha block commented out.
- src/app/api/auth/password-reset/route.ts:35 uses the raw address (clientIp), no failClosed, no overall cap; :57 is 3 an hour per address.
- Sign-in, sign-up and resend call Supabase from the browser with no captcha token (login/page.tsx:139, signup-form.tsx:276, ResendConfirmation.tsx:115). These three are the only calls in src/ to the doors Supabase's captcha switch guards; there is no signInWithOtp or resetPasswordForEmail anywhere.
- Waitlist guards are as described (src/app/api/waitlist/route.ts:79-116 and mayEmail): hidden trap field checked before the global cap, 30 an hour per network, 300 an hour overall failClosed, 3 a day per address, a daily confirm budget.
- The only signed-out write doors on Vibe's own servers are the four waitlist routes and password-reset; every admin route calls requirePlatformAdmin; /support has 0 forms.
- handoffs/2026-10-11-session-75-close-browser-rule-and-next-up.md:195-198 still lists this as next-up number 1; handoffs/2026-10-08-security-risk-report.md:87-99 says it was confirmed on the live app on Oct 8 (40 emails an hour, 60 seconds per address). I did not re-check the Supabase dashboard, so whether Franky has since raised that number is unknown.
- Live HEAD https://www.connectvibe.app/auth/login: 200, frame-src 'self' only, so a Turnstile box is refused until csp.ts changes.
- Vercel firewall read answered "config not found" for me too; not confirmed in the dashboard.

Where the first plan was off:
1. It put the box and a Cloudflare server check on forgot password. Not needed: that route uses the service role, and its real holes close with about ten lines and no outside tool.
2. It said the static pages need the Cloudflare host. No static page has a password field or a sign-in call, so only the app flavour of the rule changes.
3. It said one line in the Privacy Policy. Two passages change (:140 and :346) plus the live page.
4. It missed that the token is single use (a second sign-in try fails unless the box is reset).

A worry I checked and cleared: the three scripts that sign in with a password (scripts/waitlist-gate-e2e.mjs:87, demo-seed.mjs:126, local-seed.mjs) refuse anything but localhost, so the production switch does not break them.

Smaller than described: the sign-in door sends no email (password guessing, not spam), and the four signed-out read routes with no limit are about copying profiles, which is next-up number 2, not this item.

**Evidence.**
- Captcha: 0 mentions of captcha or turnstile in src/. handoffs/2026-10-11-session-75-close-browser-rule-and-next-up.md:195-198 lists 'Email budgets + sign-up captcha' as next-up #1, not done
- DOOR 1, waitlist join (POST /api/waitlist) - guarded: hidden trap field (src/app/waitlist/waitlist-form.tsx:238, src/app/api/waitlist/route.ts:103); own-page JSON posts only (src/lib/waitlist/request-guard.ts); 30/hour per network, lets through if the limiter is down (route.ts:86); 300/hour for everyone, refuses if the limiter is down (:105); 3/day per address, hashed (:126); 10 confirm emails/day per network (:167) plus a daily confirm-email budget WAITLIST_CONFIRM_DAILY_CAP (:162). No captcha
- DOOR 2, waitlist confirm / status / leave - guarded: 60/hour per network (src/app/api/waitlist/confirm/route.ts:28, status/route.ts:28, leave/route.ts:24); sends no email
- DOOR 3, forgot password (POST /api/auth/password-reset) - OPEN to a script: 5 per 15 min keyed on the raw IP address, not the network bucket, and lets through if the limiter is down (src/app/api/auth/password-reset/route.ts:35-39); 3/hour per address (:57-61); no overall hourly or daily email cap, no captcha, no trap field. Each hit on a real account sends one Resend email (:82-98)
- DOOR 4, sign-up - closed while sign-up is closed: the browser talks to Supabase directly (src/app/auth/signup/signup-form.tsx:276) and the database gate refuses before an account or an email exists unless a valid access code is sent (supabase/migrations/20261003120000_waitlist_hardening.sql:136; codes are 8 random characters, src/lib/waitlist/access-code.ts:17). No captcha, so this door is wide open the day signup_open is switched on
- DOOR 5, sign-in - OPEN to a script: the browser talks to Supabase directly (src/app/auth/login/page.tsx:140); only Supabase's built-in per-IP limit, no captcha and no lock after failed tries
- DOOR 6, resend code and Supabase's own mailers - OPEN to a script: src/components/auth/ResendConfirmation.tsx:115 calls Supabase /auth/v1/resend; /auth/v1/recover, /otp and /magiclink answer anyone holding the public key that is in the page. Limits are Supabase's 60-second gap per address and one hourly email cap for the whole project (40/hour on Oct 8, handoffs/2026-10-08-security-risk-report.md:91), the same cap sign-up codes use
- No contact form exists: /support is email links only (src/app/support/page.tsx:39, :102)
- Not spam but related: four signed-out read routes have no limit at all (0 rateLimit calls in src/app/api/users/[handle]/bootstrap/route.ts, users/[handle]/posts/route.ts, orgs/[slug]/profile/route.ts, posts/[id]/media/route.ts), so profiles and club pages can be copied in bulk
- Already safe: cron routes need Vercel's secret and refuse without it (src/lib/cron/auth.ts:26-30); the Stripe webhook checks the signature (src/app/api/billing/webhook/route.ts:80); /api/health/* is founders only
- Vercel firewall: the settings read for the project answered 'config not found', which is what a project with no firewall or bot rule returns. Likely nothing is switched on there; not confirmed in the dashboard
- Browser code rule today (live header on https://www.connectvibe.app/): frame-src 'self' only and no challenges.cloudflare.com in script-src, so a Turnstile box would be refused until src/lib/security/csp.ts is changed

## 19. Analytics: Partly

**In plain terms.** You can already see errors, waitlist joins by link label, and a rough page-open figure in Sentry: about 40 front-page and 30 waitlist-page opens in the last 7 days, your own testing included. What you cannot see is an exact count of people opening the front page and the waitlist page, so you cannot tell what share of visitors join. Account numbers (made, finished setup, active this week) have no screen, but Claude can count them for you on request. No outside analytics tool is installed, which is what the Privacy Policy promises, and none should be added.

**If left.** Launch month runs without knowing whether the front page and the teasers turn visitors into waitlist joins, and the waitlist numbers that do exist erase themselves after 40 days.

**Fix.**

No outside tool. Three steps, smallest first.

1. TODAY (Franky, no code):
- Put a ?src= label on every link you post. The admin waitlist tab already counts joins per label.
- Use Instagram's own link-tap number as the visitor count for teasers.
- Copy the waitlist tab's count line into a note every Monday, because entries delete themselves after 38 days.
- In Sentry (Explore > Traces, span.op:pageload, grouped by transaction) the count shown is already scaled up from the one-in-ten sample. Do not multiply it by ten as the first report said. Treat it as a rough guide until visits reach the hundreds.

2. ANY TIME (minutes): ask Claude for the account counts: made, finished setup, active in the last 7 days, by wave. It is a counts-only read the Privacy Policy already allows. Nothing to build.

3. BEFORE THE TEASERS RAMP UP (Claude, hours): an exact first-party count of opens for /, /waitlist and /auth/signup.
- A day-totals table: day, page, link label, count. No id, no cookie.
- A small same-origin route the page calls once, put behind the existing limiter in src/lib/rate-limit, as src/app/api/waitlist/route.ts:86 does. Without it anyone can inflate the numbers.
- A Numbers tab in src/app/admin/admin-shell.tsx that saves one row a week.
- Same day: one sentence in Privacy Policy section 3d, one in section 11, and the new date at the top. Word it as "the tally holds no IP address". Do not say nothing does, because the limiter keeps a per-network abuse count.
- No change to the browser rule's host list (same origin), no new company in section 6, and the short waitlist notice and WAITLIST_NOTICE_VERSION stay as they are.

Also Franky: in the Vercel dashboard, turn Speed Insights off. Its script is being served but no page loads it. Do not add Vercel Web Analytics, Plausible, PostHog or Google Analytics without first rewriting "Sentry is the one outside tool that measures anything" (section 3e).

**The second check (gap confirmed by the skeptic).** The gap is real, but it is smaller than described and the first report's free stopgap had an error.

Reproduced:
- package.json holds only @sentry/nextjs, and no analytics script appears anywhere in src/ or public/.
- https://www.connectvibe.app/_vercel/insights/script.js returns 404.
- https://www.connectvibe.app/_vercel/speed-insights/script.js returns 200 JavaScript, and none of the six saved live pages references "_vercel". I could not confirm the dashboard switch itself: the Vercel connector's project read shows no analytics fields.
- The live browser rule allows connections only to the site itself, Supabase, Cloudflare R2 and Sentry.
- The sampling rate is 0.1 at /Users/franciscocazares/vibe/src/lib/sentry-config.ts:354.
- The waitlist counters and the 38-day purge are as described (src/lib/waitlist/view.ts:196-218, src/app/api/admin/waitlist/route.ts:26-29).

Corrections:

1. "Times ten" is wrong. A counts-only Sentry query for the last 7 days (page loads, production, grouped by route) returned / 40, /waitlist 30, /auth/signup 10 and /waitlist/confirm 10. Every figure is a multiple of 10, so Sentry already scales the sample. Multiplying again would overstate traffic tenfold. At this volume each sampled load shows as 10, so the figure is a rough guide and includes team testing and today's audit runs.

2. The account funnel needs no build. The Privacy Policy's own rule (section 6) lets the assistant read counts from the live database, so "made, finished setup, active this week" is a one-minute ask. I did not run it.

3. The proposed policy sentence, "the count holds no IP address and nothing about you", needs care. A browser-called route must sit behind the limiter, and the limiter keeps a per-network count. Section 11 already says "The waitlist pages count how often each IP address uses them" (privacy-policy-final.md:528) and section 3d covers abuse counts, so the sentence should speak only about the tally.

4. The first report's direction is right: first-party, no new host, no new company. Section 3e already lists "visits" among the things Sentry measures, and section 4 says "We also count things", so no promise is broken.

Notes: /private/tmp/claude-501/-Users-franciscocazares-vibe/81a12e11-4ed3-4da4-838b-e8caceee3c9d/scratchpad/launch-checklist/verify-legal-consent.md

**Evidence.**
- package.json: the only measuring package is @sentry/nextjs; no @vercel/analytics, PostHog, Plausible or Google tag anywhere in src/ or public/
- https://www.connectvibe.app/_vercel/insights/script.js -> 404 (Vercel Web Analytics is off)
- https://www.connectvibe.app/_vercel/speed-insights/script.js -> 200 JavaScript, yet no live page references '_vercel' and no package loads it: Vercel Speed Insights looks switched on in the dashboard but collects nothing
- Sentry today: errors, a speed report for about 1 page load in 10 with the page's route (src/lib/sentry-config.ts:354), and a visit signal with no page address (policy line 121); so page-load counts per page are a sample to multiply by ten, with no unique-visitor number
- Admin waitlist tab already counts: total, waiting, unconfirmed, with a code, code expired, joined, by school, club officers, and by source tag (?src=) (src/app/admin/waitlist-client.tsx:231-235; src/lib/waitlist/view.ts:196-218; src/app/waitlist/page.tsx:47)
- Those waitlist rows are deleted within 40 days (src/app/api/admin/waitlist/route.ts:26-29), so the funnel has no history unless someone writes the numbers down; per-account wave tags survive in user_cohorts (supabase/migrations/20261003140000_waitlist_retention.sql:13-18)
- Admin tabs are reports, clubs, users, waitlist, log (src/app/admin/admin-shell.tsx:28); the users tab is a search for moderation, not totals (src/app/api/admin/users/route.ts:30-36)
- The database can answer the rest by count only: setup finished = otto_answers saved (src/lib/auth/post-login.ts:6), last_active_at (Campus page only), profile_views and post_views tables; no screen shows them
- Cannot be answered today: front-page visits; front page to waitlist click-through; waitlist page opens versus forms sent; visits per source tag. Answerable only by a hand-run count: accounts to finished setup; active this week; return rate by wave
- Policy room for first-party totals already exists: privacy-policy-final.md:172 'We also count things, so we can see in totals how Vibe is used.' The promise an outside tool would touch is line 140: 'Sentry is the one outside tool that measures anything'

## 20. One clear call to action: Done

**In plain terms.** The front page has one obvious action: the coral 'Join the waitlist' button, shown four times and always going to the same form. Nothing sends a visitor to a dead end while sign-up is closed. A few side doors (a shared club page, a shared post, the 404 button, the /get poster link on a phone) land on the sign-in screen first, where the waitlist link is small text under the form.

**If left.** A newcomer who arrives through a shared club page, a shared post or the /get poster link meets a sign-in form first and has to spot the small waitlist line under it; worth a waitlist link on the signed-out club page, and /get pointing phones at the waitlist, before clubs start sharing links.

**Evidence.**
- Front page, in order (sign-up-closed version, served live): header 'Log in' (text) and 'Join the waitlist' (coral) -> /waitlist?src=landing
- Hero: 'Join the waitlist' (coral) next to 'Bring your club' (outline, jumps down the page); six tappable lights (Film club, Robotics, Tonight, Open mic, Study group, From your major) that stay on the page
- Middle: 'Evening / Afternoon / Night' jump links to the film, seven time-of-day buttons and Play: all stay on the page
- 'Step inside': 'Join the waitlist' (coral) and 'Got an access code? Create your account' -> /auth/signup (src/components/landing/home-landing.tsx:319-322)
- 'Bring your club': 'Email us' (outline, opens the mail app to help@connectvibe.app) and 'Or join the waitlist as a club officer' -> /waitlist?officer=1&src=club (home-landing.tsx:329-336). The club path's main button depends on a mail app being set up
- Close: 'Join the waitlist' (coral) and 'Already have an account? Log in' (home-landing.tsx:354); footer: Terms, Privacy, Guidelines, Support
- Primary = Join the waitlist (the only filled button, 4 placements, one destination). Competes: only the outline 'Bring your club' beside it and the 'Log in' text link. Phone screenshot from the Lighthouse run: /private/tmp/claude-501/-Users-franciscocazares-vibe/81a12e11-4ed3-4da4-838b-e8caceee3c9d/scratchpad/launch-checklist/seo/landing-mobile-final.jpg
- No dead end: /auth/signup with sign-up closed shows the access-code form with 'No code yet? Join the waitlist'; the sign-in page shows 'New to Vibe? Join the waitlist' and 'Got an access code?' (src/app/auth/login/page.tsx:391-407, seen in seo/login-mobile-final.jpg)
- Side doors that reach sign-in first: /orgs/sae signed out offers only 'Sign in' and 'Sign in to follow', no waitlist link; /posts/<id> sends the browser to sign-in (src/app/posts/[id]/SignedOutShell.tsx:22-26); the 404 card's main button (src/app/not-found.tsx:34)
- Known open app fix: https://www.connectvibe.app/get opened as an iPhone -> 307 /campus -> sign-in, not the front page or waitlist (src/app/get/route.ts:44-48); the marketing plan already bans that link (vibe-marketing/campaigns/2026-10-launch/campaign-plan.md:141)
