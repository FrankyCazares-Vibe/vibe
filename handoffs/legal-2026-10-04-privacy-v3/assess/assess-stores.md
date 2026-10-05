# Privacy Policy v3: app store and platform rules

Assessor: stores. Written 2026-10-04. Skill used: `legal:compliance-check` (its output shape is followed below: summary, rules, requirements, risks, actions, approvals, further review).

Not legal advice. Store rules are quoted from the guidelines as I know them and from the repo's own store research of 2026-09-24 (`handoffs/wave-plan-pwa/research-stores/`, fact-checked there). I did not browse. Anything marked "verify" should be checked by the lawyer or against the live store page before October 16.

Code was read from the release worktree (`release-s74`, merges of landing-night, chat-desktop and privacy-v2 all present at `fe40634`). Nothing was edited there. Production was not touched.

## 1. Summary

**Verdict: proceed with conditions.**

The app already does what both stores demand of a social app: delete your account inside the app, report, block, a word filter, a contact address, a public deletion page. Privacy Policy v2 already covers most of what the stores require a policy to say.

What is missing is small and specific:

- **Four sentences the stores require and v2 does not have** (section 4, changes 1 to 4). Two of them are named in Apple's guideline 5.1.1(i): a statement that the outside companies protect data as well as we do, and how to take back consent. One is Apple's 2025 rule on third-party AI (5.1.2(i)): v2's AI sentence, as written, admits sharing people's records with an AI provider, which under that rule needs explicit permission. The founder's counts-only rule fixes that, but the policy must say it.
- **Three places where the store forms would contradict the policy or the code** (section 8): error reports are declared "not linked to you" in the app's privacy file while the policy says a failed request can identify the account; the public deletion page still says three things the policy says are untrue; the privacy file leaves out search words, the notification address and the "suggestions" purpose.
- **One thing to do the day the reviewer account is made:** a hand-verified test account makes v2's definition of "verified" untrue unless one sentence is added.

Nothing here blocks publishing the policy today. Changes 1 to 5 should go in today's text. The rest is due before the October 16 submission.

## 2. Rules that apply

| Rule | Why it applies | What it requires |
|---|---|---|
| Apple App Review Guideline 5.1.1(i), privacy policy | Every app | A link in App Store Connect and inside the app. The policy must say what is collected, how, and every use; confirm that third parties give "the same or equal protection"; explain retention and deletion; say how to revoke consent or ask for deletion |
| Apple 5.1.1(ii) and (iii), permission and data minimisation | The app asks for camera, microphone, photos, notifications | Consent for collection; clear purpose strings; ask only for what a feature needs |
| Apple 5.1.1(v), account sign-in and deletion | The app lets people make an account | Account deletion inside the app, deleting the account and its data, not a deactivation. If not instant, say how long. No "email us to delete" as the only way |
| Apple 5.1.2(i), data use and sharing | Every app | No tracking without permission. Since the November 2025 revision: say clearly where personal data is shared with third parties, "including with third-party AI", and get explicit permission first (verify the exact wording on the live page) |
| Apple 1.2, user-generated content | Posts, comments, chats, clubs | A filter for objectionable material, a way to report with timely response, a way to block abusive users, published contact information. In practice reviewers also ask for: Terms with "no tolerance for objectionable content or abusive users", action within 24 hours, the reported item hidden from the reporter, an 18+ rating |
| Apple 4.8, login services | Only if a third-party login is used | Not triggered: Vibe uses its own email and password accounts |
| Apple 2.1, app completeness | Sign-up is closed by the waitlist and posting needs a school email | A working demo account for the reviewer, and notes explaining the gate |
| Apple App Privacy label and privacy manifest | Every app; data collected in a web view the app controls counts | Label answers in App Store Connect that match the policy; `PrivacyInfo.xcprivacy` in the binary that matches the label |
| Apple age rating | Social feed, chat | Answer the questionnaire; Vibe's Terms say 18+, so choose 18+ |
| Google Play User Data policy | Every app | A privacy policy link in Play Console and inside the app, on a public page that is not a PDF and not behind a login. It must name the app or the developer, give a privacy contact, list the data accessed, collected, used and shared and with whom, describe secure handling, and give the retention and deletion policy. A "prominent disclosure" inside the app for collection a user would not expect |
| Google Play Data safety form | Every app outside internal testing | Answers that match the policy and the app's real behaviour, including web view data the app controls |
| Google Play account deletion | The app lets people make an account | A way to delete inside the app and a public web link that works without the app, names the app or developer, shows the steps, and says what is kept and why |
| Google Play user-generated content policy | Posts, comments, chats | Users accept terms before posting; the terms define what is not allowed; in-app reporting of content and users; in-app blocking; ongoing moderation |
| Google Play Child Safety Standards (social apps) | Vibe is a social app | Published standards against child sexual abuse and exploitation, an in-app way to report, action on such material, compliance with child-safety law, a named contact declared in Play Console |
| Google Play target audience and content rating | Every app | Choose "18 and over" only; fill in the rating questionnaire honestly |
| State app-store age laws (Texas SB 2420 in force per the repo's research; California, Utah, Louisiana, Alabama in 2027) | Store apps available to residents of those states | Stores pass an age band to apps; developers are expected to use it. Verify with counsel. It changes one policy sentence if adopted (section 4, change 11) |

## 3. What the Privacy Policy must say, checked against v2

"v2" is `handoffs/legal-2026-10-03-privacy/privacy-policy-publish.md`, the same text as `src/app/legal/privacy/*.tsx` in the release.

| # | The store requires the policy to | Store | v2 | Where, or what is missing |
|---|---|---|---|---|
| 1 | Be clearly labelled a privacy policy, on a public page, not a PDF, no login | Google | Met | Title "Vibe Privacy Policy". `/legal/*` is public: `src/proxy.ts:155` lets even a suspended account read it, and nothing else gates it |
| 2 | Name the app or the developer as the store listing shows them | Google | Met | "Vibe", "CONNECTVIBE. LLC" in the first paragraph. The listing name must contain "Vibe" and the developer name must be the LLC |
| 3 | Give a privacy contact | Google | Met | Section 15, hello@connectvibe.app |
| 4 | Say what is collected, how, and every use | Both | Met | Sections 3 and 4 |
| 5 | Say who it is shared with | Both | Met | Sections 5 and 6 |
| 6 | **Confirm third parties give the same or equal protection** | Apple 5.1.1(i) | **Not met** | Section 6 says only "Each works under its own published terms and privacy policy." That describes them; it does not confirm anything. Change 2 |
| 7 | Explain retention and deletion | Both | Met | Sections 8 and 9, unusually complete |
| 8 | **Say how to revoke consent** | Apple 5.1.1(i) | **Partly** | Deletion is explained. Nothing says how to take back the agreement, or that phone permissions can be turned off. Change 3 |
| 9 | Describe secure handling | Google | Met | Section 10 |
| 10 | **Disclose sharing with third-party AI, with permission first** | Apple 5.1.2(i) | **Wrong today** | Section 6: "the database records it reads pass through that tool's provider." That is an admission of sharing records with an AI provider with no permission asked. The founder's counts-only rule makes it untrue as well. Change 1 |
| 11 | Cover the apps and their permissions | Both | Met, but filed under "switched off today" | Section 3f. A reviewer reading on October 16 finds the app described as a feature that is off. Change 4 |
| 12 | Match the "no tracking" answer on the label | Apple | Mostly | Section 3e says no advertising tracker. No sentence says the thing the label says: no tracking across other companies' apps and sites, nothing to data brokers. Change 5 |
| 13 | Say what stays after account deletion and why | Google deletion rule | Met | Section 9, "What stays after deletion" |
| 14 | Link to a public deletion page | Google | Met | Section 9 names connectvibe.app/legal/delete-account. The page itself contradicts the policy in three places (section 5, row 3) |
| 15 | Age: match the store rating | Both | Met | Sections 2 and 12 say 18 or older. Rate 18+ in both consoles |
| 16 | Child safety contact and NCMEC | Google | Met | Sections 5i and 15; the standards themselves are `/legal/child-safety` |

## 4. Changes the policy needs, ranked

Each has the exact sentence. "Today" means it should be in the text that publishes on October 4. Section numbers are v2's and do not move.

### Change 1 (today). The AI sentence, section 6. Apple 5.1.2(i), and the founder's own fact

Replace the bullet "**AI coding tools.** We build and maintain Vibe with them. When the cofounder with direct access uses one to look into a problem, the database records it reads pass through that tool's provider." with:

> **An AI coding assistant.** We write Vibe's code with Claude, an AI assistant made by Anthropic. It works on our code, not on your information. Our rule: when it looks at the live database, it may read only counts, settings and code fingerprints (short codes that show which version of our code is running). It may never read anyone's profile, posts, messages or other records. People keep this rule. No system enforces it.

Why this wording: it is the founder's rule, stated as a rule, in the same honest form section 5h already uses for reading messages. Under it no personal data goes to a third-party AI, so Apple's "explicit permission" step is not triggered. If a technical limit does exist, drop the last two sentences.

**Open gap to decide in the synthesis (I could not settle it from the facts given):** the rule covers the database. The assistant can also be pointed at hosting logs and error reports, and those can hold an IP address, a page address and, until the Sentry fix in section 8, a sign-in cookie. Two honest options:

- (a) Extend the rule to logs and error reports (a rule for people, no code), and add: "The same rule covers our server logs and error reports."
- (b) Leave the rule as it is and add: "To fix a bug it may also read server logs and error reports (section 3d), which can include an IP address or a page address."

By the founder's fourth rule, (a) protects students more and keeps Apple's AI rule out of play. Do not publish the sentence in (a) unless the rule is really adopted.

### Change 2 (today). Equal protection, section 6. Apple 5.1.1(i)

Replace "These outside services hold your information or are contacted by your device. Each works under its own published terms and privacy policy." with:

> These outside services hold your information or are contacted by your device.
>
> **How they must treat it.** Supabase, Vercel, Cloudflare, Resend and Sentry (and Stripe, once billing is on) handle your information only to provide their service to Vibe, under their published customer terms, which commit them to keep it secure. We have given none of them permission to sell it or to use it for advertising. We will not use a provider that protects your information less than this policy does. Google and Apple follow their own privacy policies where your device contacts them directly (fonts, notifications, the app stores) and where our inbox sits (Gmail).

Why this wording: Apple wants a confirmation. This one is made of things the company controls (what it permits, what it will do) plus one claim about the providers' published terms. Verify that claim before October 16: someone opens each of the six providers' terms and data-processing addendum and confirms "security commitments, use only to provide the service". Supabase's addendum may need to be signed in its dashboard to bind (verify). If any provider fails the check, name it in the second group instead.

### Change 3 (today). Taking back consent, section 9. Apple 5.1.1(i)

Add after "**See and change.**":

> **Taking back your agreement.** You agreed by checking the box at sign-up. To take that back, delete your account. That is the only way, because Vibe cannot run an account without the information on this page. On the waitlist, use "Take me off the list". In the phone apps you can turn off the camera, microphone, photos and notifications for Vibe in your phone's settings at any time, and Vibe keeps working without them.

Checked: the photo step in onboarding can be skipped (`src/components/mobile/onboarding/StepPhoto.tsx:29`), so nothing in the app forces a permission.

### Change 4 (today, or at the latest before October 16). The apps get their own heading, section 3

Move "**The store apps.**" out of "3f. Features that are switched off today" into its own subsection, written so it is true before and after the apps are approved. The old 3g becomes 3h.

> ### 3g. The iPhone and Android apps
>
> The apps show the same Vibe as the website, inside an app. Everything on this page applies to them. They add only this:
>
> - **Permissions.** The iPhone app asks for the camera, microphone and photo library only when you take, pick or save a photo or video, and for notifications when you turn them on. The Android app asks only for notifications.
> - **Telling the site it is the app.** Each request says it comes from the iPhone or Android app. We use that to show the right screens. We store it only next to a notification address, if you turn notifications on.
> - **Apple's notification service.** The iPhone app registers with it each time it opens, even before you turn notifications on. That shows no prompt, and Vibe's servers learn nothing from it until you say yes.
> - **What they do not have.** No location, no contacts, no advertising or tracking code, and nothing that follows you into other companies' apps or websites.
> - **The stores.** If you install the app, Apple or Google knows you installed it and handles that under its own privacy policy. They show us totals, such as how many people installed it, not who.
> - **Vibe+** is not sold inside the apps.

And in section 6, replace "Off today: **Stripe** and the notification services (section 3f), and the **Apple App Store and Google Play** once the apps are published." with "Off today: **Stripe** and the notification services (section 3f). **Apple and Google**, as the app stores: section 3g."

Evidence for each line: permissions `mobile/ios/App/App/Info.plist:40-47`, `mobile/android/app/src/main/AndroidManifest.xml:103-107`; the app tag `mobile/capacitor.config.ts:62,68`, read and not stored (facts file 05, F38); Apple registration at every launch `mobile/README.md:212-213` (new: v2 does not say it); plugins `mobile/package.json:13-25`; no in-app sale `src/app/api/billing/checkout/route.ts:100-109`. The "totals, not who" line is how both consoles work as I know them; verify once the consoles exist. Until the Firebase file is in the build the Apple-registration line describes the release build, not today's; it is still true of the app people will install.

Also drop "once they are in the stores" from the second paragraph of the page on the day the first app is approved. It is true today and merely stale later.

### Change 5 (today). No tracking, section 4. Matches the label

After "We do not sell your personal information, share it with advertisers, or use it to train AI models." add:

> We do not track you across other companies' apps or websites, and we give nothing to data brokers.

True: no advertising or analytics code in either `package.json`, `NSPrivacyTracking` false, no tracking domains (`mobile/ios/App/App/PrivacyInfo.xcprivacy:26-29`).

### Change 6 (today). Suggestions use your campus too, section 4

"including suggesting people and clubs from who you follow and your major" becomes "including suggesting people and clubs from who you follow, your campus and your major". The code reads campus and university for suggestions (`src/app/api/me/suggested-connections/route.ts:38`). The label declares this purpose (section 6), so the policy should name every input.

### Change 7 (today). The date

`src/app/legal/privacy/page.tsx:22` says `EFFECTIVE_DATE = "October 5, 2026"`. The founder's fact is that it publishes October 4, 2026. Set the date to the day it really goes live. Both stores read this date against the submission.

### Change 8 (the day the reviewer account is made, before October 16). Hand-verified test accounts, section 2

Apple and Google reviewers cannot get an IU or Purdue address, so the plan (`apple-review.md` section C) is a reviewer account marked verified by hand. That makes "Verified means the account could once read mail at an @iu.edu or @purdue.edu address" untrue for that account. Add to "**What 'verified' means**":

> The only exceptions are a few test accounts we run ourselves, such as the one Apple's and Google's reviewers sign in with. We mark those verified by hand. They are not students.

If hand-verified test accounts already exist in production today, this sentence belongs in today's text. I did not look (production is off limits); the founder knows.

### Change 9 (the day notifications or billing is switched on)

Both live under "3f. Features that are switched off today". The day either switch flips, move its paragraph out of 3f the same day, and update the two store forms the same day (both can be edited without a new build). If notifications are on in the build submitted October 16, do it before submitting.

### Change 10 (only if the Sentry fix does not ship before October 16)

No text change: v2 already says a failed server request "can include the sign-in details your browser sent, which identify your account". But then the label must say diagnostics are linked to you (section 6). If the fix ships, delete that sentence and the label can say "not linked".

### Change 11 (later, only if the apps start reading the stores' age signal). Verify with counsel

Section 2 says "We do not ask for a date of birth or check age any other way." If the apps adopt Apple's Declared Age Range or Google's Play Age Signals, replace with: "In the iPhone and Android apps, where a state law requires it, Apple or Google tells us an age range for the phone's account, not a birth date. We use it only to refuse accounts under 18 and do not store it."

### Not a policy change, but the policy depends on it

The Terms that go live around October 14 need two lines the store reviewers look for: no tolerance for objectionable content or abusive users, and review of reports within 24 hours. The live Terms still say "no guarantee about response time" (`src/app/legal/terms/page.tsx:89-90`), which contradicts section 5h of the policy and the support page.

## 5. What the app must do, and whether the code does it

Read in the release worktree. "Phone" is the layout the store apps show (both apps are portrait-only shells around the live site, `mobile/capacitor.config.ts`).

| # | Requirement | Store | Status | Evidence, and what is left |
|---|---|---|---|---|
| 1 | Delete the account inside the app | Apple 5.1.1(v), Google | **Met** | Settings, "Danger zone", "Delete account…", type the handle: `src/components/settings/SettingsClient.tsx:1323-1386`. The request: `DELETE /api/me`, `src/app/api/me/route.ts:59`, which deletes the sign-in user, so it is a real deletion and it is instant. Also offered where an account could be stuck: the verify-school screen (`src/app/auth/school-email/page.tsx:731`), the onboarding "⋯" sheet (`src/components/mobile/onboarding/OnbHeader.tsx:143`), the suspended notice (`src/app/account/suspended/suspended-actions.tsx:331`). The proxy lets a suspended account call it (`src/proxy.ts:177`) |
| 2 | Deletion removes the person's data, not only the login | Apple 5.1.1(v) | **Mostly** | Apple accepts keeping what the law requires if the policy says so. Section 9 of the policy does. But some files stay through a gap, not a legal duty: media on deleted messages, group pictures, replaced logos (policy section 8, "What Vibe does not delete yet"). Disclosed honestly; a reviewer cannot see it; fixing it before October 16 is the stronger position |
| 3 | A public web page for deletion | Google | **Met, with wrong text** | `/legal/delete-account` is public, names Vibe and the LLC, gives the steps and an email route. Three lines contradict the policy: "erased from storage, not just hidden" (`page.tsx:159`; the policy lists files that stay), "for up to a year" (`:198`; the policy says no end date is set), "routine backups" (`:237`; there are none). Google reads this page for "what is kept". Fix before the Data safety form is filed |
| 4 | Report content and people | Apple 1.2, Google UGC | **Met** | Seven things can be reported: post, comment, message, person, chat, club, event (`src/lib/moderation/reports.ts:29-37`), eight reasons including intimate image and child safety (`:55-64`). On the phone: post and profile menus, a single message (`src/components/mobile/messages/ReactionPicker.tsx:240`), a whole chat (`ConversationActionSheet.tsx:336`). Desktop Messages reuses the same room components (`src/components/desktop/messages/ClubPane.tsx:10,15`). An unverified account can report (`src/app/api/me/reports/route.ts:516-518`) |
| 5 | Reported item hidden from the reporter at once | Apple reviewers in practice | **Not found** | No such step in `ReportSheet.tsx` or the reports route. The sheet does offer "Block" after a report (`ReportSheet.tsx:160`), which hides the author. Low effort to add; the repo's research records a rejection on this point |
| 6 | Block abusive users | Apple 1.2, Google UGC | **Met** | `POST /api/me/block` (`src/app/api/me/block/route.ts:113`). On the phone: profile (`ProfileMobile.tsx:5658`), post viewer "Block author" (`PostViewerMobile.tsx:498`), feed (`CampusMobile.tsx:3625`), chat (`ConversationActionSheet.tsx:227`); unblock in Settings, "Blocked users" (`SettingsClient.tsx:240-289`). A suspended account can still block (`src/proxy.ts:180`). Known limits the policy already admits: a block does not reach signed-out visitors, and in club rooms it only hides on screen |
| 7 | Filter objectionable material | Apple 1.2 | **Met, text only** | Word filter before saving: posts, comments (`src/app/api/posts/[id]/route.ts:750`), messages (`src/app/api/me/threads/[id]/messages/route.ts:300`), profiles, clubs, events (`src/lib/moderation/text-filter.ts`). No image screening. Say so in the review notes |
| 8 | Published contact information, inside the app | Apple 1.2 | **Met** | Settings, "Help & safety", with help@connectvibe.app (`SettingsClient.tsx:1502-1536`); `/support`. The repo's notes say help@ had never carried a real email as of September 22: send a test before submitting |
| 9 | Users accept terms before posting | Google UGC, Apple in practice | **Met** | One checkbox at sign-up with both links (`src/app/auth/signup/signup-form.tsx:596-606`); posting needs a verified school email. The "no tolerance" and "24 hours" lines are missing from the live Terms until about October 14 |
| 10 | Privacy policy link inside the app, easy to find | Both | **Met** | Settings (`SettingsClient.tsx:1621`), sign-up, the accept-terms screen, the suspended notice, every legal page's footer. The sign-in screen has no link (`src/app/auth/login/page.tsx`); adding one is cheap and is the first screen a reviewer sees |
| 11 | Permission prompts with honest reasons, asked in context | Apple 5.1.1(ii), Google | **Met** | Four iPhone purpose strings (`Info.plist:40-47`); Android declares only internet and notifications (`AndroidManifest.xml:103-107`); notifications are asked in context, never at first launch |
| 12 | No third-party login without Sign in with Apple | Apple 4.8 | **Not triggered** | Email and password only; no `signInWithOAuth` anywhere (facts file 05, F65) |
| 13 | No tracking, no ad identifier | Both | **Met** | No ads or analytics packages; `NSPrivacyTracking` false. On Android, confirm the built app's merged manifest has no `AD_ID` permission before answering "no advertising ID" (Firebase libraries sometimes add it) |
| 14 | A demo account for the reviewer | Apple 2.1, Google app access | **Not yet** | Sign-up needs an access code or the allowlist (`supabase/migrations/20261003110000_waitlist_gate.sql:137`), and posting needs a school email. The reviewer account must be made and marked verified by hand: a production write that needs the founder's yes. See change 8 |
| 15 | Tell people about collection they would not expect, inside the app | Google "prominent disclosure"; Apple 5.1.1(ii) in spirit | **Not found** | Vibe records each profile and post a signed-in person opens, cannot be turned off, and shows names to Vibe+ owners. The policy's short version says so. Nothing in sign-up or onboarding does. One line under the sign-up checkbox would close it: "People can see that you viewed their profile or post." This is also the option that protects students more |
| 16 | Child safety standards page and a named contact | Google | **Met, one wrong word** | `/legal/child-safety`, public, names help@ and NCMEC. Line 35 still says members must be "enrolled", which the policy says Vibe never checks. Play Console asks for a person's name: pick one cofounder |
| 17 | Vibe+ not sold in the apps outside the stores' billing | Apple 3.1, Google | **Met** | Checkout refuses requests from the app (`src/app/api/billing/checkout/route.ts:100-109`); billing is off in production |

## 6. Draft: Apple App Privacy label

Rule used: the label must say what the policy says, no less. Apple counts data gathered in a web view the app controls, so this is the whole website's collection. "Collect" in Apple's sense means kept longer than the request needs. Where the choice was free I declared more, not less.

**Data used to track you: none.** No advertising, no data brokers, no linking with other companies' data. No tracking prompt is needed and the app must not show one.

**Data linked to you**

| Apple's data type | Collected | What it is in Vibe (policy section) | Purposes to tick |
|---|---|---|---|
| Contact Info: Name | Yes | Display name; the name on a waitlist entry (3a, 3b, 11) | App Functionality |
| Contact Info: Email Address | Yes | Sign-in email and school email (3a) | App Functionality |
| User Content: Emails or Text Messages | Yes | Direct, group and club chat messages (3c) | App Functionality |
| User Content: Photos or Videos | Yes | Profile photos, post media, chat media (3c) | App Functionality |
| User Content: Customer Support | Yes | Reports you file, mail to help@ and hello@ (3c, 3g) | App Functionality |
| User Content: Other User Content | Yes | Posts, comments, bio, major, year, campus, work experience, résumés, poll votes, calendar entries (3b, 3c) | App Functionality, Product Personalization |
| Identifiers: User ID | Yes | Account number and handle | App Functionality |
| Identifiers: Device ID | Yes, once notifications are on | The notification address the phone gives us (3f) | App Functionality |
| Usage Data: Product Interaction | Yes | Views of profiles and posts, likes, saves, follows, RSVPs, last active (3c, 3d) | App Functionality, Product Personalization |
| Search History | Yes | Search words, held only in our host's logs and in error reports, never in our database (3d) | App Functionality |
| Purchases: Purchase History | Yes, once billing is on | Vibe+ status and payment events (3f) | App Functionality |
| Diagnostics: Crash Data, Performance Data, Other Diagnostic Data | Yes | Sentry error reports and the one-in-ten speed samples (3d) | App Functionality |

**Data not linked to you: none, until the Sentry fix ships.** After it ships, move the three Diagnostics types and Search History here.

**Not collected (answer No):** Location, precise or coarse. Health and fitness. Financial info, including payment info (cards are typed on Stripe's own pages, never in the app). Contacts. Browsing history. Sensitive info. Audio data. Advertising data. Other usage data. Body, surroundings.

Notes on the lines that needed a decision:

1. **Product Personalization** is ticked because section 4 says Vibe suggests people and clubs from who you follow, your campus and your major. The app's own privacy file ticks only App Functionality for these.
2. **Diagnostics linked.** The app's privacy file says "not linked". The policy says a report about a failed server request "can include the sign-in details your browser sent, which identify your account", and the code confirms the cookie is not stripped (`src/lib/sentry-config.ts:155-190` rewrites tokens in addresses and bodies and never touches `request.cookies` or the `cookie` header). Truth first: linked, until that is fixed.
3. **Search History** is not in the app's privacy file. Search is a web address with the words in it (`/api/search?q=…`, `src/app/campus/campus-home.tsx:5583`), so the host's logs and one in ten Sentry samples hold the words past the request. The policy already says this.
4. **Device ID and Purchase History** are declared ahead of their switches. Both can be turned on at the server without a new app build, and a label that lags the switch would be wrong the same day. If notifications ship switched off in the October 16 build and stay off, Device ID could wait, but declaring it costs nothing.
5. **Location is No.** The app never asks the phone for location and never works one out from an IP address. Photos and videos sent in chats or posted as a club can still carry a location inside the file (3c); that is declared under Photos or Videos. Two things would make this answer firmer before October 16: strip those details from every upload, and confirm that server error reports do not carry the city and coordinates headers the host adds to requests (the October 3 check could not rule that out; one look at a live Sentry event settles it, or drop those headers in the same fix as the cookie).
6. **Contacts is No.** Apple's definition mentions a "social graph". Vibe never reads the phone's address book, and the policy says "no contact list". Follows are declared under Product Interaction. A cautious reader could tick Contacts as well; I chose not to, because the label would then say something the policy denies.
7. **Sensitive info is No.** Vibe does not ask for it. Club membership can hint at religion, politics or orientation; member lists are not public (5a). Mention to counsel.

## 7. The app's privacy file must match the label

`mobile/ios/App/App/PrivacyInfo.xcprivacy` is uploaded with the app and Apple compares it with the label. To match section 6:

| Change | Why |
|---|---|
| Crash, Performance and Other Diagnostic: `Linked` false to true, until the Sentry fix ships | Lines 161-196 say not linked; the policy says a report can identify the account |
| Add `NSPrivacyCollectedDataTypeSearchHistory`, linked, App Functionality | Not declared today |
| Add `NSPrivacyCollectedDataTypeDeviceID`, linked, App Functionality | The notification address; not declared today |
| Add `NSPrivacyCollectedDataTypePurposeProductPersonalization` to Other User Content and Product Interaction | Suggestions |
| Keep `NSPrivacyTracking` false and the tracking domains empty | Correct |

Better than the first row: ship the fix (drop `event.request.cookies` and the `cookie` and `authorization` headers in `beforeSend` and `beforeSendTransaction`, `src/lib/sentry-config.ts:204-205`). Then the file's "not linked" is true, the label says "not linked", and a sentence leaves the policy.

## 8. Draft: Google Play Data safety form

Google's words: "collected" means sent off the phone; "shared" means passed to another company, but not a service provider working for the developer, not something the user chose to make public, and not a legal demand. On that definition Vibe shares nothing: Supabase, Vercel, Cloudflare, Resend, Sentry and Firebase are service providers, and posts and profiles are public because the person published them.

**Top of the form**

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | Yes |
| Is all of the user data collected by your app encrypted in transit? | Yes (policy section 10: every connection is HTTPS) |
| Which account creation methods does the app support? | Username and password (email and password; no Google or Apple sign-in) |
| Delete account URL | `https://www.connectvibe.app/legal/delete-account` |
| Can users ask for some data to be deleted without deleting the account? | Yes, if the deletion page gains a short section saying how: delete a post, a message, a résumé or a photo in the app (policy section 8), or write to hello@. Otherwise answer No. Do not answer Yes with no page to point to |
| Independent security review | No |
| Committed to the Play Families policy | Does not apply (18 and over only) |

**Data types.** For every row: Shared = No. Processed only in passing = No.

| Google's data type | Collected | Required or optional | Purposes to tick | What it is (policy section) |
|---|---|---|---|---|
| Personal info: Name | Yes | Required | App functionality, Account management | Display name (3a, 3b) |
| Personal info: Email address | Yes | Required | App functionality, Account management, Fraud prevention, security and compliance | Sign-in and school email; the scrambled codes kept for bans (3a, 9) |
| Personal info: User IDs | Yes | Required | App functionality, Account management, Fraud prevention, security and compliance | Account number, handle; abuse limits count by account (3d) |
| Personal info: Other info | Yes | Required | App functionality, Personalization | University, campus, year, major, bio, work experience (3b). The university is read from the school email, so it is not optional; the rest mostly is. Answer "required" when any part is |
| Financial info: Purchase history | Yes, once billing is on | Optional | App functionality, Account management | Vibe+ status and payment events (3f) |
| Messages: Other in-app messages | Yes | Optional | App functionality, Fraud prevention, security and compliance | Chats; a reported message is copied for moderators (3c, 5h) |
| Photos and videos: Photos | Yes | Optional | App functionality | (3c) |
| Photos and videos: Videos | Yes | Optional | App functionality | (3c) |
| Files and docs | Yes | Optional | App functionality | Résumé and portfolio files (3b) |
| App activity: App interactions | Yes | Required | App functionality, Personalization | Views, likes, saves, follows, RSVPs, last active (3c, 3d). Required because view recording cannot be turned off |
| App activity: In-app search history | Yes | Required | App functionality | Search words in host logs and error reports only (3d) |
| App activity: Other user-generated content | Yes | Optional | App functionality, Fraud prevention, security and compliance | Posts, comments, poll votes, calendar entries, reports (3c) |
| App info and performance: Crash logs | Yes | Required | Analytics | Sentry error reports (3d) |
| App info and performance: Diagnostics | Yes | Required | Analytics | Sentry's one-in-ten speed samples (3d) |
| Device or other IDs | Yes, once notifications are on | Optional | App functionality | The notification address; Firebase's own install number (3f) |

**Answer No:** Location (approximate and precise). Personal info: address, phone number, race and ethnicity, political or religious beliefs, sexual orientation. Financial info: payment info, credit score, other. Health and fitness. Messages: emails, SMS. Audio. Calendar (Google means the phone's calendar; Vibe's own calendar entries are "other user-generated content"). Contacts. Installed apps. Web browsing.

Three notes:

1. **"Analytics" on the two Sentry rows is Google's word, not ours.** Google's definition of the Analytics purpose includes finding and fixing crashes. Vibe has no analytics tool and the policy never claims one. The policy avoids the phrase "no analytics", so nothing clashes; keep it that way.
2. **Ads.** "Contains ads": No. "Uses advertising ID": No, after checking the built app (section 5, row 13).
3. **Emails.** Google's "Emails" type means the user's own mailbox. Mail sent to help@ does not come from the app, so it is not declared here; the policy covers it in 3g.

## 9. Other console answers that must agree with the policy

| Console question | Answer | Policy line it must match |
|---|---|---|
| Apple age rating | 18+ (user content, messaging and social media: yes) | Section 2, "You must be 18 or older" |
| Google target audience | "18 and over" only, with Restrict Minor Access on | Same |
| Privacy policy URL (both) | `https://www.connectvibe.app/legal/privacy` (the www address; the bare one redirects) | Section 15 |
| Support URL | `https://www.connectvibe.app/support` | Section 15 |
| Google child safety standards URL and contact | `https://www.connectvibe.app/legal/child-safety`, one named cofounder, help@ | Sections 5i, 15 |
| Apple review notes, Google app access | Sign-up is by invite while the waitlist runs; posting needs a verified IU or Purdue address; here is a verified test account | Section 2, with change 8 |
| Does the app use third-party AI on user data? (review notes) | No. Vibe has no AI features. Its code is written with an AI assistant that, by rule, reads only counts from the live database | Section 6, with change 1 |
| Store listing screenshots and preview video | Only people who agreed to appear, or test accounts | The founder's fact covers the landing film. Screenshots are a separate set: use the demo seed, not real students |

## 10. The waitlist and invite-only, as the stores see it

- **Both stores allow an invite-only app.** What they require is that the reviewer can get in (section 5, row 14) and that the notes say why sign-up is closed.
- **The waitlist form is reachable inside the app** (it is the website). It collects a school email, name and optional answers from people with no account. Section 11 of the policy is its notice and the form has its own checkboxes, so consent is collected where the data is collected, which is what Apple 5.1.1(ii) asks. The label and the Data safety form already cover name and email.
- **Account deletion and the waitlist.** A waitlist entry is not an account, so the stores' deletion rules do not reach it. The policy still gives "Take me off the list" and the 40-day clean-up, and the public deletion page should say one line about it so a person who only joined the list is not sent to Settings.
- **Apple may call a campus app a "limited audience"** and suggest unlisted distribution (the repo's research, with Fizz as the public precedent). Either outcome passes the same review and needs the same policy.

## 11. Decisions I made, by the founder's four rules

| # | Open choice | Decision | Rule that decided it |
|---|---|---|---|
| 1 | Describe the AI assistant as "records pass through the provider" (v2) or by the counts-only rule | The counts-only rule, stated as a rule people keep | 1 (true to how the company works), then 3 (Apple 5.1.2(i)) |
| 2 | Promise that providers give "equal protection", or say only what we control | Say what we control, plus one checkable claim about their published terms | 1 before 3: Apple wants a confirmation, but an unverified promise about six contracts would be a promise nothing backs |
| 3 | Diagnostics "linked" or "not linked" on the label | Linked until the Sentry fix ships | 1 |
| 4 | Declare search words | Yes | 4 (declare more) and 1 (logs do hold them) |
| 5 | Declare the notification address and Vibe+ status before their switches | Yes, now | 4, and it prevents a label that is wrong on switch day |
| 6 | Declare Location because some files carry it | No; say it in the policy (already there) and strip it in code | 1: the app never collects location as such. 4 is served by the code fix, not by a label that misdescribes the app |
| 7 | Declare Contacts for the follow graph | No | 1: the policy says no contact list is read |
| 8 | Tell people about view recording inside the app | Yes, one line at sign-up | 4 |
| 9 | Hand-verified reviewer account: say so or stay silent | Say so, one sentence | 1 |
| 10 | Keep the apps under "switched off today" | Give them their own heading | 2 (plain) and 3 (a reviewer must find it) |

## 12. Risk areas

| Risk | Severity | Mitigation |
|---|---|---|
| Apple reads v2's AI sentence as sharing personal data with third-party AI without permission | High if v2's sentence ships; none after change 1 | Change 1 today |
| No "equal protection" sentence and no "revoke consent" sentence: a standard 5.1.1(i) rejection | Medium | Changes 2 and 3 |
| The label says diagnostics are not linked while the policy says a report can identify the account | Medium (a mismatch Apple or a student can point to) | Ship the Sentry fix, or mark linked (sections 6 and 7) |
| The public deletion page contradicts the policy in three lines; Google reads that page | Medium | Fix lines 159, 198, 237 of `src/app/legal/delete-account/page.tsx` before filing the form |
| The reviewer cannot get in, or gets an account that cannot post | High for timing, not for privacy | Reviewer account, verified by hand, with content to report and block; needs the founder's yes |
| Terms still say "no guarantee about response time" and lack "no tolerance" on October 16 | Medium | The Terms update planned for about October 14 must land first |
| Reported post still shows for the reporter | Low to medium (a recorded rejection reason) | Hide on submit |
| View recording is a surprise to a new user | Low for review, real for students | One line at sign-up (section 5, row 15) |
| Photos in chats and club posts keep location | Low for review, real for students | Strip on upload; then two sentences leave the policy |
| Texas age-signal duties for store apps | Unknown: verify with counsel | 18+ rating and Restrict Minor Access now; age signal in an update if counsel says so |
| Play listing will show the LLC's legal address and phone while the policy gives none | Low | When the address exists, put the same one in section 15 |

## 13. Recommended actions, in order

**Today, in the policy text:** changes 1, 2, 3, 5, 6, 7. Change 4 if there is time; it is only a move plus one new true sentence.

**Before the Terms change (about October 14):** the two Terms lines (no tolerance, 24 hours); fix "enrolled" on the child-safety page.

**Before the October 16 submission:**
1. Sentry: drop cookies and the cookie and authorization headers (and the host's location headers) before sending. Then set the label and the privacy file to "not linked" and cut the policy sentence.
2. Fix the three lines on the deletion page, and add the "delete some of your data" and waitlist lines.
3. Update `PrivacyInfo.xcprivacy` (section 7). Fill in the label (section 6) and the Data safety form (section 8) from this file.
4. Make the reviewer account (founder's yes), add change 8, write the review notes.
5. One line about views at sign-up; a privacy link on the sign-in screen; hide a reported item for the reporter.
6. Check the six providers' terms for change 2; sign Supabase's addendum if it needs signing.
7. Send a real email to help@ and hello@ and see it arrive.

**The day notifications or billing turn on:** change 9, and re-open both forms.

## 14. Approvals needed

| Who | Why | Status |
|---|---|---|
| Franky | The reviewer account is a production write; the Sentry fix and the deletion page are code | Pending |
| James, with the lawyer | Change 2's claim about provider terms; Texas and other state age laws; whether showing viewer names with Vibe+ counts as "sharing" or a "sale" | Pending |
| One named cofounder | Google's child-safety contact must be a person | Pending |

## 15. Further review recommended (verify with counsel)

- Apple 5.1.2(i): exact current wording on third-party AI, and whether logs read by a coding assistant fall under it (section 4, change 1, open gap).
- Texas SB 2420 and the 2027 state laws: whether an 18+ app must read the stores' age signal.
- Whether "service provider" fits each outside company for Google's "shared" answer, especially Google Fonts and the personal Gmail inbox, which have no contract with the LLC.
- Whether account deletion that leaves some media files behind (policy section 8) satisfies Apple 5.1.1(v) and Google's deletion rule as "legitimate" retention. My reading: evidence files yes, leftover files no; fix the leftovers.

## 16. Sources

- Policy and checks: `handoffs/legal-2026-10-03-privacy/` (publish text, calls, changes after verify, facts 05 and 07, verify V5).
- Store research with dated sources: `handoffs/wave-plan-pwa/research-stores/apple-review.md` (sections B, C, D), `play-and-more.md` (sections 2.2 to 2.10), `repo-readiness.md` (section c), and their fact-check files.
- Code, release worktree at `fe40634`: paths and lines as cited in sections 4 to 7.
- Store rules from memory, not re-read today: Apple App Review Guidelines 1.2, 2.1, 4.8, 5.1.1, 5.1.2; Apple "App privacy details" and "Offering account deletion in your app"; Google Play User Data policy, Data safety help, account deletion requirement, user-generated content policy, Child Safety Standards policy.

