# Fact check, round 3: providers, security, breach, international, the AI sentence, contact

2026-10-04. Independent check of `privacy-policy-final.md` (619 lines, the round-3 text). The policy was not edited. Round 2's notes are kept at `parts-r2/verify-facts-providers.round2.md`, round 1's at `parts-r1/verify-facts-providers.round1.md`. This is not legal advice; laws are cited from memory and marked "verify with counsel".

**Skill.** No skill is named for this job. `legal:compliance-check` was loaded first as the closest fit; its table shapes are used in sections 7 and 8. The checking itself is the job's own framework: open the code, find the host, quote file and line.

**Verdict: passes. 0 high, 0 medium, 5 low.** Every company section 6 names really gets what the policy says. No unnamed company gets a student's information. Each "we do not" in this lens is true of the release code. Round 2's one medium (what a Sentry report about a server request holds) is closed in the text, and I re-read the kit to confirm the new wording. The five lows are small wording slips and one change-list row that is still not exact.

## 1. What was checked, and against what

- **Code:** the release worktree, `release-s74` at `62a2daa` (merges `ab3a93c`, `5f3b8b0`, `fe40634` are in; the other workflow is still editing there: 15 files were uncommitted at the end of this run, and their diff adds no host, Sentry call, cookie, outside fetch, environment variable or contact address). Read only.
- **The Sentry kit the build installs:** `@sentry/*` 10.73.0, the version `package-lock.json:4264-4290` pins. Read again from scratch, not taken from round 2.
- **Public DNS** for connectvibe.app, run again today.
- **GitHub:** one read of the repo's visibility (it is private).
- **Not opened:** any dashboard, the production database, `.env.local`. No email was sent.

Searches over `src`, `public`, `supabase`, `mobile`, `next.config.ts`, `vercel.json`, `package.json`: every `https://` host (41 names); every environment variable (about 46 names); about 95 analytics, ad, replay, CAPTCHA, map, AI, embed and CDN vendor names; every Sentry call; every cookie write; every `fetch(` (169); every socket, beacon and outside script; every email send; every database call that filters on an email column; every sign-in method.

## 2. Round 2's findings, re-checked in the new text

| Round 2 | Now | Where |
|---|---|---|
| M1 a server-request report holds more than 3d said | Closed | Lines 124-129: lead line and four bullets. Kit re-read: body kept up to 10,000 bytes (`@sentry/core/build/cjs/integrations/http/server-subscription.js:51-57`, `utils/request.js:18-21`); cookies and headers ride on error and speed reports unfiltered (`integrations/requestdata.js:26-29, 111-135`; the name filter in `utils/data-collection/filtering-snippets.js:28-55` runs only for streamed spans, `requestdata.js:89-96`); outgoing calls keep their full address (`@sentry/node-core/build/cjs/integrations/node-fetch/undici-instrumentation.js:105-110`). Line 349 says "Sentry's reports"; line 522 says "your address included" |
| L1 language and time zone | Closed | Line 135. Kit default: `@sentry/browser/build/npm/cjs/prod/sdk.js` lists `cultureContextIntegration` |
| L2 the rule covers the database only | Closed | Lines 346-350, three bullets |
| L3 pages where the browser talks to Supabase | Closed | Line 336 matches the 13 files that import the browser client (list in section 3) |
| L4 "could be used to act as you" | Closed | Line 127 |
| L5 row 49 removes the browser's trail only | Closed on the list | Row 49 |
| L6 `x-vercel-proxied-for` | Closed | Line 128 "We have not confirmed that the IP address itself is always left out"; row 14 keeps only `user-agent`. The kit's drop list really omits that header (`@sentry/core/build/cjs/vendor/getIpAddress.js:3-16`) |

## 3. Section 6, company by company (checked again from the code)

| Company | Policy says | Code or record | Verdict |
|---|---|---|---|
| Supabase | whole database, sign-in, public photos, private résumés, evidence photos; Ohio; the pages where the browser talks to it | Region host `aws-1-us-east-2`. Browser client imported by 13 files: `src/app/auth/{login,signup,confirm,callback,update-password,school-email,verify-school}`, `src/components/auth/{ConfirmCodeForm,EmailLinkProblem,ResendConfirmation}.tsx`, `src/app/account/suspended/suspended-actions.tsx`, `src/app/profile/[handle]/ProfileHandleSwitch.tsx`, `src/lib/waitlist/use-signup-open.ts` (used only by the login page and the email-link card). No socket: 0 hits for `.channel(`, `WebSocket`, `EventSource`. Passwords go browser to Supabase only (`login/page.tsx:140`, `signup-form.tsx:280`, `update-password/page.tsx:380`); no server route reads one | True |
| Vercel | hosting, server code, daily clean-up, visit logs, the film | `vercel.json` cron `17 8 * * *`; film host `src/lib/landing/demo-media.ts:28`; the film file is asked for only near view or on Play (`src/components/landing/use-day-film.ts:62, 133-139`; `day-on-vibe.tsx:81` `preload="none"`); the poster is on our own site (`day-on-vibe.tsx:28`). DNS: `www` is a Vercel name, not behind Cloudflare | True |
| Cloudflare | post videos, club media, chat media, group photos; the PDF program; the name; incoming mail | `src/lib/r2.ts:13-16, 41`; `src/lib/pdfjs-cdn.ts:14`, `public/html/profile.html:5024, 5099`. DNS today: name servers `violet` and `miguel.ns.cloudflare.com`; mail `route1/2/3.mx.cloudflare.net` | True. The two forwarding rules are a dashboard fact (item 4) |
| Resend | address and full content of every email; through Amazon | Sends: `src/lib/email/resend-transactional.ts:179, 232, 305`, `src/lib/moderation/alerts.ts:169`. Waitlist emails answer to hello@ (`src/lib/waitlist/email-content.ts:46`). DNS today: `send.connectvibe.app` mail goes to `feedback-smtp.us-east-1.amazonses.com` | True. L4 is one word |
| Sentry | error reports, speed reports, visit signals; what a report can hold | `src/lib/sentry-config.ts:193-207` (one in ten, PII off, one scrubber for both kinds); no tunnel (`next.config.ts:128-133`); `Sentry.setUser`, `setTag`, `setContext`: 0 hits; local variables off (kit needs `includeLocalVariables`, not set). The visit signal holds a random ID, a status and the browser name, no page and no account (`@sentry/browser/.../integrations/browsersession.js:17-41`, `@sentry/core/build/cjs/session.js:97-104`) | True. L1, L3 |
| Google | fonts on almost every page and in emails; the Gmail inbox | `src/app/layout.tsx:99-101`; `public/html/{messages,onboarding,profile}.html` lines 17, 17, 21; `src/lib/email/resend-transactional.ts:110`; `supabase/templates/confirmation.html:10` | True. Gmail is the founder's fact |
| Anthropic | Claude builds the app; counts-only rule for the database; three things outside it; not enforced; training not confirmed | No AI package, key or host in the app (0 real hits for 12 AI vendor names; `supabase/config.toml:95` is the local studio's default) | True as a rule people keep. See L5 |
| Stripe, notifications | not in use today | `src/lib/billing/config.ts:102-108` needs `BILLING_ENABLED` exactly "true"; `src/lib/push/config.ts:46-48` needs `PUSH_ENABLED`. No Stripe script on any page (only the server package; `src/app/plus/PlusActions.tsx:69-70` sends people to Stripe's own pages). `handoffs/s72-prep/notes/todo.md:86`: the notification tables were never applied to production | True in code; three Vercel settings unread (item 11) |
| Amazon | Supabase and Resend run on it | region host; DNS | True |

**Any company the code uses that section 6 leaves out?** None that gets a student's information.

- The browser loads from our own site, Supabase, Cloudflare, Google Fonts, Vercel's file storage and Sentry. No other script, frame, image host, map, embed, GIF, avatar or link-preview service (0 hits).
- Server code calls Supabase, Cloudflare storage, Resend, and Google Fonts for the share picture (`src/lib/og/share-card.tsx:42, 47`, no visitor data).
- No analytics: no `@vercel/analytics`, no Speed Insights, no `_vercel/insights`, no tag manager, no pixel.
- The sign-up gate is a database function, not an outside address (`supabase/config.toml:290-292`).
- The apps: Capacitor and Firebase Messaging only (`mobile/package.json`); Firebase held back until the first yes (`AndroidManifest.xml:97-99`, `Info.plist:28-29`); Android asks only for internet and notifications (`AndroidManifest.xml:104, 107`).
- GitHub holds the code and the handoffs. The repo is private today. The 52 email addresses in tracked files are test names, placeholders, the founder's own and two university offices: no student's. So GitHub need not be listed. (Two code comments still say the repo is public: `mobile/capacitor.config.ts`, `src/lib/landing/demo-media.ts:4`. Not a policy matter.)
- The domain's TXT record carries a Google site-verification code. That lets the owner see Google's own search figures; it sends Google nothing about visitors.

## 4. Each "we do not", and security, breach, international, contact

| Line | Claim | Evidence | Verdict |
|---|---|---|---|
| 29, 170-177 | No selling, no advertisers, no brokers, no AI training by us, no cross-site tracking | No ad, broker, analytics or AI package or host | True |
| 134 | No advertising tracker; Sentry is the one outside tool that measures | as above | True |
| 135 | We do not ask for location or work one out; three things come close | 0 hits for `navigator.geolocation` and for Vercel's place headers in our code; `next.config.ts:88-90` forbids geolocation; IP is read only to count abuse (`src/lib/rate-limit.ts:52-70`) | True |
| 136 | No date of birth, phone, contacts, card number, outside sign-in | 0 hits for `signInWithOAuth`, `signInWithOtp`, `.mfa.` | True |
| 168 | Five automatic emails to you | kinds at `src/lib/email/send-log-core.ts:44-50` (the fifth kind there goes to the cofounders, line 316 says so), plus Supabase's confirm email | True |
| 362 | The only cookies Vibe sets are the sign-in ones; up to 400 days | three writers, all the sign-in cookie: `src/lib/supabase/middleware.ts:24-30`, `server.ts:24-27`, `src/proxy.ts:202`; 0 hits for `document.cookie`; `@supabase/ssr/dist/main/utils/constants.js:10` | True |
| 366 | Sign out signs out every device; about an hour more elsewhere | `src/app/api/auth/logout/route.ts:30, 86`; `supabase/config.toml:160` | True (the hour is a dashboard setting) |
| 368 | Do Not Track; nothing follows you | 0 hits for `doNotTrack`, `globalPrivacyControl` | True |
| 484 | HTTPS everywhere; expiring links | HSTS two years (`next.config.ts:72-75`); 300 seconds (`src/lib/r2.ts:18`, `src/lib/profile/resume-storage.ts:192`), one hour for a chat photo (`.../messages/[messageId]/media/route.ts:16`) | True |
| 486 | Email and password only; no end-to-end encryption; no backups; no access log | no second-step call anywhere; founder's facts | True |
| 488 | The school-email gap; three tries an hour | `src/app/api/auth/school-email/request/route.ts:150-159, 217-235` | True |
| 490 | Breach: email each person, notice here, 30 days at most, everyone if we cannot tell, the attorney general where required | A promise people keep. Indiana's law allows 45 days and names the attorney general (IC 24-4.9, verify with counsel) | Acceptable |
| 584 | Run from Indiana; information comes to the United States | database in Ohio | True |
| 597 | Indiana's and California's laws cover much bigger companies | both start near 100,000 people or a revenue test (verify with counsel) | True |
| 606, 610 | No office or representative outside the United States; no office; registered agent in the state's record | founder's facts | True |
| 614-619 | hello@ and help@; one inbox; the page addresses | The only contact addresses in the code (`help@` 35 times, `hello@` 5; automatic mail leaves from `noreply@`, `src/app/auth/signup/signup-form.tsx:390`); the Outlook address appears nowhere in the app; the domain takes mail (DNS today); `src/app/legal/{privacy,terms,delete-account}` exist | Real. Send the test email today (item 4) |

## 5. Findings

Severity: high = false, unlawful or must not publish. Medium = misleading, a real gap, or likely to be believed wrongly. Low = polish. **None is high or medium.**

### L1 (low). "At three steps" is one step short, and the cofounder-adds-you path is missing (lines 129, 522, 526)

Line 129 says the database calls hold an email address "at three steps". The code has a fourth, on the ordinary path, and a rarer fifth:

- **Confirming a school email, by link or by typed code.** `src/lib/auth/school-email-apply.ts:189-194` asks `users?select=id&school_email=eq.<the address>&id=neq.<your ID>`. It runs from `src/app/api/auth/school-email/confirm/route.ts:73` and `confirm-code/route.ts:139` whenever the first scan found nothing, which is the normal case.
- **A cofounder adding you to the waitlist.** The cofounder's request carries your address, name and clubs in its body (`src/app/api/admin/waitlist/add/route.ts:65`), so a speed or error report about that request can hold them, the same way the form's contents can. If the address is already on the list, the database call holds it too (`src/lib/waitlist/store.ts:447-449`, `:145-149`; `email_key` is the address in lower case, `supabase/migrations/20261003100000_waitlist.sql:171-173`).
- For the record: the cofounder's look-up carries the address in the page's own web address (`src/app/admin/users-client.tsx:83`, `?q=`), not only in the database call (`src/app/api/admin/users/route.ts:60, 79-80`). Row 35 is the fix for that.

Why it is only low: the fourth step is the same person, the same address and the same screen as the third, a minute later. Nobody is told less than the truth about what kind of thing reaches Sentry. But a count that is wrong should not stand, and a person a cofounder added never "sent the form".

**Fix, words.** Line 129, last sentence: "At a few steps they also hold an email address: when you send the waitlist form, when you type or confirm a school email at the "verify your campus" step, and when a cofounder looks an account up by email." Line 522: "An error or speed report made at the moment you send the form, or at the moment a cofounder adds you, can include everything that was typed, your address included (section 3d)."

### L2 (low). Row 14 is still not exact as a reason to cut sentences

Today's text is true, so this is about the list, not the policy. Row 14 says that once it ships and two live reports are read, the "four more things" in 3d can be cut. Two of them would still be true:

- **Account IDs stay.** The new pattern cleans `column=eq.value`. It does not clean `or=(…)`, `not.in.(…)`, a filter on a joined table (`creator.campus_id=in.…`), or an ID in the path. Tried on eleven sample addresses in this run. Real cases: the block look-up on most pages, `or=(blocker_id.eq.<your ID>,blocked_id.eq.<your ID>)` (`src/lib/chat/blocks.ts:25`, `src/lib/safety/hidden-users.ts:34`, `src/app/api/search/route.ts:235`; 68 `.or(` calls in all); storage calls to `profiles/<account ID>/…` (18 call sites); `auth/v1/admin/users/<account ID>` (`src/app/api/me/route.ts:148`, `src/lib/moderation/actions.ts:198, 230`).
- **The cofounder's look-up stays** until row 35 ships, because the address is in `?q=`.

**Fix, list (small, exact).** In row 14 (d) use two patterns, both with the replacement `"$1[redacted]"`:
`/([?&][a-z_.]+=(?:not\.)?(?:eq|neq|gt|gte|lt|lte|in|like|ilike|is|cs|cd|ov|fts|plfts|phfts|wfts|match|imatch)\.)[^&#\s"']+/gi` and `/([?&](?:not\.)?(?:or|and)=)[^&#\s"']+/gi`. Make row 35 part of the same gate. And change the cut instruction: do not cut the fourth bullet, shorten it to "The calls our server made to the database for that request. Some of their addresses hold account IDs (random labels)."

### L3 (low). Two more things a browser report can hold (line 122)

- **A label can carry a person's name.** The trail copies a button's `aria-label`, `title` or `alt` (`@sentry/core/build/cjs/utils/browser.js:71`; `@sentry/browser/build/npm/cjs/prod/integrations/breadcrumbs.js:84`). Fifteen labels in `src` are built from a name (a person's, a club's or a major's), for example `Open ${displayName}'s profile` (`src/app/campus/campus-home.tsx:8025`), `Remove ${authorName(person)}` (`src/components/desktop/messages/RoomPeople.tsx:194`) and, in a cofounder's browser, `Pick ${row.name} for the next batch` (`src/app/admin/waitlist-rows.tsx:166`). So the sentence "Our own code does not put your name … on these reports" is true of you, and someone else's tap can still leave your name in their trail.
- **A speed report from the browser lists the address of each file the page loaded** (`@sentry/browser-utils/build/cjs/metrics/browserMetrics.js:401-420`). A profile or post photo's address holds its owner's account ID as a folder (`src/app/api/admin/images/route.ts:148`). Chat photos and other expiring links do not show: they load through our own address and a redirect (`src/app/api/me/threads/[id]/messages/[messageId]/media/route.ts:90-91`), and Supabase's link key is named `token`, which the scrubber removes (`src/lib/sentry-config.ts:16-17`).

**Fix, words.** After "For a button it holds the label, never what you typed." add: "A label can include a person's name, for example "Open Sam's profile"." In the sentence before, add "the account ID inside a photo's address" to the list of what a report can include.

### L4 (low). "Every email Vibe sends" (line 339)

Resend gets every automatic email. A reply a cofounder writes by hand leaves from the Gmail inbox, unless Gmail has been set to send through Resend, which only a dashboard shows (`handoffs/legal-2026-10-03-privacy/facts/05-vendors-network-device.md:362`). **Fix:** "every automatic email Vibe sends". True either way.

### L5 (low, stands from round 1). A second AI tool in the history

Twelve commits are signed "Co-authored-by: Cursor" and five "Made-with: Cursor"; `.cursor/rules/vibe-hub-copy.mdc` changed on September 28. The policy does not say Claude is the only tool, so line 342 is true. Item 7c already asks whether any other tool is shown live data. Nothing to change in the text today.

## 6. Sentences that are true only after a listed change

In sections 3d, 3e, 3g, 4, 6, 7, 10, 14 and 15: **none**. Each was checked against the release as it stands.

On the list itself:

- **Row 1 (small, exact):** the page's date still says October 5 (`src/app/legal/privacy/page.tsx:22`).
- **Row 2 (large):** until it ships the page shows the October 3 text ("AI coding tools", no Anthropic, no Gmail: `src/app/legal/privacy/sections-6-8.tsx:54`). The final text is true of the company today; the page is not yet the final text. The row's "must not block the text" note is right.
- **Row 6 (small, exact):** the form's notice says "error reports go to Sentry" (`src/app/waitlist/waitlist-form.tsx:210`); section 11 says error reports, speed reports and visit signals. Same companies, no contradiction.
- **Row 14 (small, not yet exact):** L2.
- **Row 49 (small, exact):** the two names are right. Adding `"CultureContext"` is right too.
- **Items 6 and 7a (before the page goes live):** people, not code. Line 352's "We have not yet confirmed" is true until 7a is done.

## 7. Laws and rules in this lens (the skill's table; from memory, verify with counsel)

| Rule | How it applies | What it asks |
|---|---|---|
| California Bus. & Prof. Code 22575 | Any site that collects personal information from Californians | Name the kinds of information and of outside parties; say how changes are told; a date; a Do Not Track answer |
| FTC Act section 5 | Every US company | What the policy says must be true |
| Indiana IC 24-4.9 (breach) | Indiana company | Notice without unreasonable delay, 45 days at most; tell the attorney general |
| Indiana IC 24-15, California CCPA | Thresholds not met (about 100,000 people or a revenue test) | Nothing today; the policy gives the rights anyway |
| Apple 5.1.1, 5.1.2; Google Play User Data | When the apps are submitted | Name outside parties and third-party AI; store forms must match |
| GDPR, UK GDPR | Only if Vibe is found to target people there | Reasons for use; a complaint route (line 599-606) |

## 8. Requirements

| # | Requirement | Status | Action |
|---|---|---|---|
| 1 | Name the outside parties that get personal information | Met | none |
| 2 | Statements about what we do and do not collect are true | Met (five low slips) | L1, L3, L4 |
| 3 | Store forms match the policy | Unknown until row 14 is settled | Keep "Diagnostics: linked" (row 42); L2 |
| 4 | Do Not Track answer; whether others follow people across sites | Met (line 368) | none |
| 5 | Breach notice inside the state deadline | Met: 30 days promised | The one-page plan (item 14); Resend's plan (item 18) |
| 6 | A working contact, and a route for copyright complaints | Met in the text | Test email today (item 4); lawyer question on a copyright agent |
| 7 | Third-party AI and personal data named | Met, with the honest "no rule yet" for the inbox | Item 7a before the page goes live; 7b before October 16 |

## 9. Could not be checked from code

Dashboards and people, none opened: the two Cloudflare forwarding rules; how a cofounder's reply is sent; Supabase's hand-off to Resend, the "Confirm email" switch and the sign-in token lifetime; Vercel's `CRON_SECRET`, `BILLING_ENABLED`, `PUSH_ENABLED`, `PUSH_ALLOWLIST` and whether a Stripe key is set; whether Sentry is switched on in production at all, its region, retention, IP storage and its own scrubber, and what one live report holds; Resend's open and click tracking; where the Cloudflare bucket is; the Anthropic plan and training setting; any provider agreement; the film's yeses.

## 10. Recommended actions, in order

1. Items 6 and 7a before the page goes live, and row 14 in today's deploy, as the list already says.
2. L1: two wording edits (lines 129 and 522).
3. L2: widen row 14's pattern, tie row 35 to it, and shorten the fourth bullet when the time comes instead of cutting it.
4. L3, L4: three short wording edits.
5. Item 9: read one live server error and one live speed report in Sentry. Everything 3d says about cookies, bodies and place rests on reading the kit's code.

## 11. For the lawyer

- Whether account IDs, email addresses and a sign-in cookie inside bug-tool reports change the "linked to you" answers on the store forms, and whether Sentry's data-processing terms must be accepted first (item 10).
- Whether the assistant's rule must cover the inbox before a safety report from a student arrives there.
- Carried from rounds 1 and 2: a copyright agent; naming Indiana's 45 days; a personal Gmail inbox for safety reports.
