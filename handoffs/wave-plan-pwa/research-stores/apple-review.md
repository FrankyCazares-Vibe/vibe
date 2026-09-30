# Apple App Store requirements for Vibe (as of 2026-09-24)

Research pass, session 65. Read-only: nothing in the repo was changed. Web claims carry URL + date
(publish date, or "accessed 2026-09-24" when the page shows none). Repo claims are `path:line`.
**UNVERIFIED** = I could not confirm it from a primary source. Apple's guideline text is paraphrased,
with only short phrases quoted.

---

## Bottom line (plain English)

1. **The slowest part isn't code, it's Apple checking who we are.** No test build can go to anyone's
   phone until Apple verifies CONNECTVIBE. LLC. That takes a free D-U-N-S number (up to ~7 business
   days) and then Apple's enrollment review. In 2026 that review took anywhere from a few days to over a
   month. **Start it today.**
2. **Apple rejects "the website in a box"** (guideline 4.2). A Capacitor shell that loads
   connectvibe.app passes only if it clearly does things the website can't: a native tab bar, real
   push notifications, the share sheet, a native offline screen, the photo/camera picker, haptics. The
   review notes then have to list those in plain words. Even apps that did this have been rejected
   several times.
3. **Our moderation already covers Apple's four rules for social apps** (filter, report, block,
   contact). Four gaps remain. The Terms still say "no guarantee about response time". There's no
   "zero tolerance" line in the Terms. A reported post doesn't vanish for the student who reported it.
   And help@ has never been shown to deliver an email.
4. **Delete-account inside the app already exists.** Sign in with Apple is **not** required, because we
   only use our own email and password. The privacy policy is linked in the app, but it doesn't name
   Sentry, Resend or Stripe.
5. **Age:** since September 2026, any app with a social feed gets at least a 13+ rating. Our Terms say
   18+, so the clean choice is an **18+ rating**. Fizz, a college app that also verifies .edu emails, is
   18+. Texas's app-store age law has been in force since June 4, 2026. Utah's and Louisiana's were
   pushed back to 2027.
6. **Realistic date:** an approved app by Oct 31 is possible only if Apple finishes our enrollment by
   about **Oct 14**. Treat the PWA as the Oct 31 floor and the store app as "yes, if Apple is quick".
   There's a faster fallback: enroll under Franky's own name. It is a decision for Franky (§E).

---

## §A — Guideline 4.2: "more than a repackaged website"

**Plain English.** Apple wants the app to feel like an app. If Safari can do everything the app does,
the reviewer asks why the app exists. Apple doesn't publish a list of features that count. What
reliably helps is visible native behaviour plus review notes that say where to find it.

**The rule.** Section 4.2 says an app needs features, content and UI that lift it beyond a "repackaged
website", and that it should be "app-like". 4.2.2 adds that an app shouldn't be mainly marketing, web
clippings, content aggregators or a collection of links
(https://developer.apple.com/app-store/review/guidelines/, accessed 2026-09-24).

**Why Vibe is squarely in scope.** Vibe is server-rendered (Next.js App Router), so the only realistic
Capacitor setup loads the live site from `server.url`. Capacitor's own docs say `server.url` is meant
for live-reload and is "not intended for use in production" (https://capacitorjs.com/docs/config, v8,
accessed 2026-09-24). Apps built that way ship all the same. But it is exactly the shape 4.2 targets: a
full-screen web view of a remote URL.

Changing the web content later is allowed without a new review, as long as the app's main purpose
doesn't change. The DPLA's interpreted-code clause exempts code that WebKit runs, provided it doesn't
change the app's primary purpose. That clause is quoted from older DPLA copies
(https://news.ycombinator.com/item?id=18431247); the current section number is UNVERIFIED.

**Real developer reports (dated):**
- **Nov 2025**, Apple forums 806726: a hybrid app with a native main screen and menus, but 2–3 screens
  still in web views, was rejected **10 times** under 4.2. App Review's only answer was to book a
  consultation. https://developer.apple.com/forums/thread/806726
- **Jan 2026**, Apple forums 812889: a **Capacitor** app with native location, reverse geocoding,
  clipboard, the **share sheet** and Apple Maps links was still rejected under 4.2. One reply pointed out
  that the notes described Swift internals rather than what a user gets.
  https://developer.apple.com/forums/thread/812889
- **Older precedent** (Ionic forum, 2019–2020): the same pattern, with web-view-only apps rejected.
  https://forum.ionicframework.com/t/app-store-rejection-4-2-design-minimum-functionality-my-first-after-2-years-of-ionic/200908
- **Vendor blogs** (MobiLoud, Code2Native, and Publishd, 2026-04-28:
  https://publishd.app/blog/why-wrapping-a-web-app-doesnt-work) all give the same checklist. They sell
  wrapping or native services and publish no data, so treat them as opinion.
- **A pattern Apple does accept:** Hotwire Native, from the makers of Basecamp and HEY, puts native
  navigation and transitions around server-rendered web screens (https://native.hotwired.dev/,
  accessed 2026-09-24). Whether each of their store apps uses it is UNVERIFIED.

**What to build so a reviewer sees an app, not a site** (none of these is a guarantee):

| Native feature | Why it counts | Capacitor route |
|---|---|---|
| Native tab bar (Campus / Messages / Otto / Profile) + native back navigation | the reviewer's first impression; the clearest "app-like" signal | custom Swift `UITabBarController`, or a native-navigation plugin (UNVERIFIED maturity) |
| APNs push with deep links into the right screen | a website in Safari can't do it; see §F | `@capacitor/push-notifications` v8 |
| Share sheet for a post, profile or event | a native iOS surface | `@capacitor/share` |
| Photo library / camera picker with clear purpose strings | device integration (and a crash if the strings are missing, see §C) | `@capacitor/camera`, or the WKWebView file input plus Info.plist keys |
| Native offline / "can't reach Vibe" screen | our `sw.js` won't run inside WKWebView without App-Bound Domains (https://developer.apple.com/forums/thread/781744), so the PWA's `offline.html` never shows in the shell | a native view shown on network failure |
| Haptics on like, send and report | cheap, and it feels native | `@capacitor/haptics` |
| Home-screen badge count | native | the push payload `badge` |
| Universal links (`connectvibe.app/profile/x` opens the app) | the landing-page and share flow | apple-app-site-association + Associated Domains |
| Widgets (for example "today on campus") | strong signal, but needs Swift/WidgetKit | not for v1 |

**Review-notes rule:** in App Review Information, list each native feature in user words ("tap Share
on any post to open the iOS share sheet") and attach a 60–90 second screen recording. Before the first
submission, book a 30-minute **App Review consultation** (Webex, Tuesdays and Thursdays; it needs an
enrolled account) (https://developer.apple.com/distribute/app-review/, accessed 2026-09-24).

---

## §B — Guideline 1.2: user-generated content, and Vibe's moderation as shipped

**Plain English.** Apple's written rule has four parts. Its reviewers enforce a longer list taken from
a standard rejection letter: agree to Terms that say "zero tolerance", act on reports within 24 hours,
and be able to throw people off. We have nearly all of it. Four fixes remain, and all of them are small.

**Written rule** (guidelines, accessed 2026-09-24). A social app must have:
(1) a way to filter objectionable material before it's posted;
(2) a way to report content, with "timely responses";
(3) a way to block abusive users;
(4) published contact information.

The **June 8, 2026** revision added a paragraph making the developer responsible for removing
violating content. If Apple finds some, it can ask for a compliance plan and pull the app
(https://developer.apple.com/news/?id=a233fmpw, 2026-06-08). **Feb 6, 2026:** random and anonymous chat
now falls explicitly under 1.2
(https://www.mactech.com/2026/02/06/apple-updates-its-app-review-guidelines-with-expanded-list-of-apps-with-objectionable-content/).

**What reviewers actually demand** (rejection-letter template, reproduced by GoodBarber, undated:
https://www.goodbarber.com/help/apple-rejection-r100/apple-rejection-user-generated-content-a209/).
The same list appears in a **Nov 2025** forum case: https://developer.apple.com/forums/thread/807358.
- Users must agree to Terms (a EULA) that make clear there's no tolerance for objectionable content or
  abusive users.
- Users can flag content and report the person who posted it. Users can block abusive users.
- The developer acts on reports **within 24 hours**: removes the content and ejects the user. There
  must be a way to eject users.
- In the Nov 2025 case, a resubmission was rejected again within minutes with **new** demands: an
  **18+ age rating**, a reported post removed from the reporter's feed **immediately**, and **in-app**
  contact information.

| Apple expects | Vibe as shipped | Gap / action |
|---|---|---|
| Filter before posting | Server word filter blocks slurs, directed threats and words that sexualise minors; a match is a 422 (`src/lib/moderation/text-filter.ts:1-20`; S64 handoff §6) | Text only; no image screening; no per-user "hide words" setting. Low–medium risk. Say so in the notes |
| Report anything | Report a post, comment, message, chat, club or person (`src/app/legal/community/page.tsx:107-121`); phone pass verified at 375px (S64 handoff §11:264-268); every report emails all three founders (S64 §6:118-119) | **A reported item is not hidden from the reporter.** I found no such code in `src/app/api/me/reports/route.ts` (UNVERIFIED beyond a code search). Add "hide it for me" on submit |
| Timely response (24 h in practice) | 24-hour commitment on both safety pages (`src/app/legal/community/page.tsx:127`, `src/app/legal/child-safety/page.tsx:111`) | **Conflict:** the Terms say "no guarantee about response time" (`src/app/legal/terms/page.tsx:89-90`). Fix at the legal publish |
| Block | Block from a profile or conversation; the feed drops blocked authors both ways and fails closed (`src/app/api/feed/route.ts:185-207`, `:325`) | Blocked students can still comment on, save or repost the blocker's posts (S64 §8:142, §11:292-293). Blocking doesn't alert the team; offer "Also report?" when someone blocks |
| Eject users | Suspensions and bans keyed on a scrambled school email; proven live (S64 §11:258-262) | none |
| Published contact | help@connectvibe.app on the guidelines page and in Settings → Help & Safety (`src/app/legal/community/page.tsx:176-188`; S64 §10b:207) | **help@ has never carried a real email** (S64 §11:282). Send a test before submitting |
| EULA with "zero tolerance" | A Terms-acceptance gate exists (`src/app/auth/terms/`); Terms 18+ (`src/app/legal/terms/page.tsx:40`) | The Terms have no "zero tolerance for objectionable content or abusive users" line. The community page says it only for sexual content involving minors (`src/app/legal/community/page.tsx:72`). Add it at the legal publish |

**During review:** reviewers sometimes file a test report. Someone must act on it inside 24 hours while
the app is in review.

---

## §C — Accounts, privacy, sign-in, and the reviewer's demo account

**Plain English.** Delete-account and the privacy link are done. The privacy policy needs three more
vendors named. The app needs a "privacy manifest" file and camera and photo permission sentences, or
it crashes. Sign in with Apple isn't needed. The reviewer needs a ready-made, already-verified account,
because they can't get an IU or Purdue email.

**5.1.1(v) — account deletion.** Required in the app since 2022-06-30. It must delete the whole
account and its data; deactivation alone doesn't count. A link to a web page is allowed only if it goes
straight to the deletion page, and the app must not make people email or phone in. If deletion isn't
instant, say how long it takes
(https://developer.apple.com/support/offering-account-deletion-in-your-app/, accessed 2026-09-24).

- **Vibe:** Settings → "Delete account…" calls `DELETE /api/me`
  (`src/components/settings/SettingsClient.tsx:1245-1258`, `:1328`; `src/app/api/me/route.ts:58`). It
  purges uploads, deletes the sign-in user, and deletes the Stripe customer first (S64 §4:82).
  **Compliant.**
- Open item: warn that deleting ends Vibe+ with no refund (S64 §4:91-92). If Apple subscriptions are
  ever added, the deletion flow must also say billing continues through Apple and link to manage them
  (same Apple page).

**5.1.1(i) — privacy policy.** Needs a link in App Store Connect **and** an easy-to-find one inside the
app. It must say what's collected and how it's used, confirm that third parties give equal protection,
give retention and deletion rules, and explain how to revoke consent (guidelines).

- **Vibe:** `/legal/privacy` is linked from Settings (`src/components/settings/SettingsClient.tsx:1563`)
  and has a retention section (`src/app/legal/privacy/page.tsx:136-148`).
- **Gaps:** the service-provider list names only Supabase, Vercel and Cloudflare R2
  (`src/app/legal/privacy/page.tsx:83-85`). It leaves out **Sentry** (`package.json:17`; client config
  `sendDefaultPii: false`, `src/lib/sentry-config.ts:127`), **Resend** (`package.json:33`) and **Stripe**
  (`package.json:38`). It also needs APNs/FCM once native push lands. My grep found no "equal
  protection" sentence.
- 5.1.2(i) now calls out sharing with "third-party AI". Vibe ships no AI SDK (none in `package.json`),
  so there's nothing to disclose there.

**App Privacy label (App Store Connect).** Required before any submission. Data collected through a
web view **counts**, unless the app is an open-web browser
(https://developer.apple.com/app-store/app-privacy-details/, accessed 2026-09-24).

Draft for Vibe, to confirm with the builder:
- **Contact Info:** name, email (including school email). Linked to the user.
- **User Content:** photos, posts, messages, résumés. Linked.
- **Identifiers:** user ID, plus the device push token once native push lands. Linked.
- **Usage Data:** profile and post views. Linked.
- **Diagnostics:** Sentry crash and performance data. Probably "not linked", since PII is off.
- **Purchases:** only if Vibe+ is sold in the app.
- **Tracking:** none (no ad SDK).

**Privacy manifest (`PrivacyInfo.xcprivacy`).** Required-reason API declarations have been mandatory
since **2024-05-01**; a missing one triggers ITMS-91053
(https://www.avanderlee.com/xcode/missing-api-declaration-required-reason-itms-91053/). Capacitor core
supports it from 5.7.4 / 6 / 7 / 8. The **app** must add its own `PrivacyInfo.xcprivacy`; for example,
UserDefaults use needs reason `CA92.1` when a plugin like Preferences is used
(https://capacitorjs.com/docs/ios/privacy-manifest, accessed 2026-09-24). Each plugin's manifest has to
be checked as well.

**Purpose strings: a crash that means a 2.1 rejection.** Vibe has image file inputs
(`src/components/mobile/PostComposerMobile.tsx`, `src/components/mobile/onboarding/StepPhoto.tsx`,
`src/components/mobile/ProfileMobile.tsx`). In WKWebView, "Take Photo" kills the app if
`NSCameraUsageDescription` is missing (https://developer.apple.com/forums/thread/772332). Add it,
together with `NSPhotoLibraryUsageDescription`.

**Export compliance:** HTTPS only, so set `ITSAppUsesNonExemptEncryption` = NO. The 2026 form wording
is UNVERIFIED.

**4.8 — login services.** Sign in with Apple (or an equivalent) is required **only** when the app uses
a third-party or social login such as Google or Facebook. One exemption is an app that "exclusively uses
your company's own account setup" (guidelines, accessed 2026-09-24). Vibe is email + password only, on
Vibe's own accounts, so **Sign in with Apple is not required. Confirmed.** Adding Google sign-in later
would change that.

**2.1 — the reviewer's demo account.** The guideline requires demo account details and a live
back-end. A built-in demo mode is allowed only with Apple's prior approval (guidelines 2.1(a)). Posting
at Vibe is gated on `users.school_verified` (`src/lib/auth/campus-access.ts:43`), and only IU and Purdue
domains qualify (`src/lib/auth/school-email-domains.ts:209-218`). Plan:
1. Create `appreview@connectvibe.app` (a Cloudflare route to the founders). Set it `school_verified` on
   a real campus through the service role. **That's a production write, so it needs Franky's yes.**
   Keep it non-admin.
2. Seed at least two other test accounts' posts and comments, plus a DM, on that campus, so the
   reviewer can **report and block**. Real content is sparse (21 posts, 20 accounts, S64 §10b:214).
3. Notes: "Vibe is for verified IU and Purdue students. This account is already verified." Explain that
   a new sign-up can confirm with the 8-digit code but can't post without a school email. Attach the
   recording.

**"Limited audience" risk.** Apple's unlisted-distribution page gives "higher-education students" as
an example of a limited audience
(https://developer.apple.com/support/unlisted-app-distribution/, accessed 2026-09-24). A reviewer could
therefore push us toward an **unlisted** app. Precedent against that: **Fizz**, a social app for
verified college students, is publicly listed, rated **18+**, and sells subscriptions through Apple
(https://apps.apple.com/us/app/fizz-your-authentic-community/id1548207780, accessed 2026-09-24).
Unlisted would still work for us, because the landing-page button can use the direct link. Unlisted
apps pass the same App Review.

---

## §D — Age ratings, and the state app-store age laws

**Plain English.** Two separate things are going on. **(1)** Apple's own ratings: any app with a social
feed is now at least 13+, and we can choose 18+ to match our Terms. **(2)** State laws that make the
*app stores* check ages and pass an age band to apps. Texas's is live. Utah's and Louisiana's slipped to
2027. None of them blocks our launch. Texas asks apps to read Apple's age signal, which we can add in
an update. Have James's lawyer confirm.

**Apple's rating system:**
- **2025-07-24:** new tiers 4+, 9+, **13+, 16+, 18+**. New required questions on in-app controls,
  capabilities, medical/wellness and violent themes, with an answer deadline of 2026-01-31. A developer
  may set a **higher** rating than the calculated one (https://developer.apple.com/news/?id=ks775ehf,
  2025-07-24).
- **2026-07-09:** new **social media** questions, required for every new submission and update **from
  September 2026**. A "social media capability" means redistributing, amplifying or interacting with
  user content through a feed. It adds a "Social Media" descriptor and a **minimum rating of 13+**. If
  the feature is disabled for under-13s, the app stays out of the Social Media time-allowance category
  for them (https://developer.apple.com/news/?id=tlur8uvi, 2026-07-09;
  https://9to5mac.com/2026/07/09/apple-adds-social-media-questions-to-app-store-connect-age-rating-questionnaire/).
- **Capability mappings:** Messaging and Chat gives 13+; **Unrestricted Web Access gives 16+**
  (https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/,
  accessed 2026-09-24). The shell must **not** offer free web browsing: open outside links in Safari or
  SFSafariViewController.
- **Recommendation: 18+ via the higher-rating option.** It matches the Terms
  (`src/app/legal/terms/page.tsx:40`) and the privacy policy (`src/app/legal/privacy/page.tsx:161-165`),
  it's what the Nov 2025 reviewer demanded (§B), and Fizz uses it.
  - Cost: Screen Time can block the app for under-18 devices. In Australia, Brazil and Singapore,
    unverified users can't download 18+ apps (https://developer.apple.com/news/?id=f5zj08ey,
    2026-02-24), which doesn't matter for a US-only launch.
  - A 17-year-old freshman is already excluded by our Terms. Admitting them would mean rewriting the
    Terms and taking on the minors' rules.

**State laws (status on 2026-09-24):**

| State | Status | What it means for Vibe |
|---|---|---|
| **Texas SB 2420** | **In force for new Texas Apple Accounts since 2026-06-04.** Enjoined 2025-12-23 (https://ccianet.org/news/2025/12/judge-blocks-texass-app-store-accountability-act-as-unconstitutional-speech-restriction/). The Fifth Circuit stayed that injunction (administrative stay 2026-05-28, stay pending appeal 2026-06-04). The Supreme Court declined to vacate the stay on 2026-07-06 (https://www.scotusblog.com/2026/07/supreme-court-allows-texas-to-enforce-law-requiring-age-verification-and-parental-consent-on-app/). The appeal is still pending | Apple asks developers to adopt: the **Declared Age Range API**; the **Significant Change API** (PermissionKit) for parental re-consent after a significant change; the StoreKit `ageRatingCode`; and App Store Server Notifications for consent revocation (https://developer.apple.com/news/?id=sg176nne, 2026-06-03). Penalties up to $10k per violation (https://www.macrumors.com/2026/06/03/apple-app-store-texas-sb-2420/). Apple's Q&A: **18+ apps must still check age where the law requires it** (https://developer.apple.com/support/age-assurance, accessed 2026-09-24) |
| **Utah** | Amended by HB 498 (2026-03-18): obligations moved to **2026-05-06 → 2027-05-06**; the AG's enforcement power removed (private suits only); CCIA's suit dismissed 2026-04-21 (https://www.alstonprivacy.com/challenge-to-utahs-app-store-accountability-act-voluntarily-dismissed-following-statutory-amendments/, 2026-04-27) | nothing for launch |
| **Louisiana** | HB 977, signed 2026-05-15: **delayed to 2027-07-01**; AG enforcement (https://www.alstonprivacy.com/louisiana-delays-app-store-accountability-effective-date-to-july-2027/) | nothing for launch |
| **Alabama** | Effective **2027-01-01** (https://www.wiley.law/alert-Key-Developments-With-State-App-Store-Accountability-Acts-as-Texas-Act-Takes-Effect, 2026-06-08) | plan for it in v1.x |
| **California AB 1043** | 2027-01-01; the age band comes from the operating system (https://www.recordinglaw.com/us-laws/age-verification-laws/app-store-age-verification-laws/; primary source UNVERIFIED) | plan for it in v1.x |
| **Indiana HB 1408** | Signed 2026-03-04, effective **2027-01-01**; social-media rules for under-16s. News reports say it covers only very large platforms (a ~$1B revenue threshold, UNVERIFIED) (https://www.wane.com/top-stories/gov-braun-signs-bill-into-law-creating-social-media-restrictions-for-kids-15-and-under/) | likely not Vibe; **lawyer to confirm** |

**What developers must do, and a sensible Vibe plan:**
- **Launch:** answer the questionnaire honestly. User content: yes. Messaging: yes. Social media: yes.
  Moderation, reporting and blocking: yes. Set 18+.
- **v1.1:** add Declared Age Range through a plugin (`@capgo/capacitor-age-range`,
  https://github.com/Cap-go/capacitor-age-range, or `@capawesome/capacitor-age-signals`; both need
  iOS 26+ for real results). Ask only where Apple says regulation applies, keep only the band, and
  refuse under-18 accounts to match the Terms.
- Texas exposure is low (the users are in Indiana), but it isn't zero. A Texan student with a new Apple
  Account counts.

---

## §E — Enrolling CONNECTVIBE. LLC in the Apple Developer Program

**Plain English.** $99 a year. The person who enrolls becomes the "Account Holder" and must have
authority to sign for the LLC; Franky, as a member, qualifies. We need a D-U-N-S number (free through
Apple), a working email on connectvibe.app, and a public website on that domain. Then Apple reviews us,
and may phone. Expect **1–4 weeks in total**.

**Requirements** (https://developer.apple.com/programs/enroll/ and
https://developer.apple.com/help/account/membership/program-enrollment/, accessed 2026-09-24):
- A legal entity that can sign contracts. An LLC is fine; DBAs and trade names are not.
- A D-U-N-S number.
- The enroller must have legal authority to bind the LLC: an owner/founder, an executive, or someone
  those people authorise.
- An Apple Account with two-factor authentication.
- A **work email on the org's domain**.
- A **public, working website on that domain**. A social-media page or a near-empty site is refused.
- $99 USD a year.

The **legal entity name becomes the App Store seller name**, so it must match D&B exactly, down to the
period in "CONNECTVIBE. LLC".

**D-U-N-S.** Free through Apple's lookup tool (sign in first). If no record exists, D&B creates one in
**up to 5 business days**, and Apple receives it **up to 2 business days** later. Paying D&B to expedite
doesn't shorten this. If it takes more than two weeks, contact D&B
(https://developer.apple.com/help/account/membership/D-U-N-S/, accessed 2026-09-24).
**About 9–11 calendar days**, or 0 if the LLC is already listed. D&B sometimes lists new LLCs from state
filings on its own (UNVERIFIED).

**Verification and real 2026 timelines.** Apple Developer Support verifies authority, may call, and
asks for a reference if the enroller isn't an owner. Reports:
- **7 days** pending with no reply, Mar 2026 (https://developer.apple.com/forums/thread/820213).
- **3+ weeks** and **~1 month** pending identity verification, Feb–Mar 2026. One developer was offered
  a refund instead of approval (https://developer.apple.com/forums/thread/817247).
- Vendor guides say 3–10 business days (UNVERIFIED).

The Apple Developer app with an ID scan is listed for individuals and, on one Apple page, for
organizations as well (https://developer.apple.com/help/account/membership/enrolling-in-the-app/). The
program-enrollment page says organizations enroll on the web. **Conflicting; try the app first.**

**Before enrolling (1 day of prep):**
- A mailbox such as `franky@connectvibe.app`. Cloudflare routing has never shown a message received,
  so test it (S64 §11:282).
- Have the site name the LLC. Today only the child-safety page does
  (`src/app/legal/child-safety/page.tsx:108`, `:167`). The Terms say "operated by the Vibe team"
  (`src/app/legal/terms/page.tsx:24`). Whether Apple checks the site for the entity name is UNVERIFIED,
  but it's cheap insurance.

**Roles for three cofounders** (https://developer.apple.com/help/account/access/roles/, accessed
2026-09-24):
- **Only the Account Holder** can accept agreements (including each new DPLA revision, which otherwise
  blocks submissions), renew, and manage banking and tax. The role can be transferred.
- **Admins** can invite users, and create certificates and APNs keys if granted access.
- **App Managers** can upload builds and submit.

Recommendation:
- **Franky = Account Holder.** He builds, holds the Mac, and creates the keys.
- **James = Admin** (plus Finance if we ever sell through Apple).
- **Rylan = Marketing + Customer Support.** App Manager if he'll edit listings.

A free app with no in-app purchase needs no bank or tax setup, so **James's bank account is not on the
store critical path** (standard Apple practice; the 2026 agreement wording is UNVERIFIED).

**Other one-time items:**
- DSA trader status must be declared even when not distributing in the EU
  (https://developer.apple.com/news/?id=einwn76m). Launch in the **US storefront only**.
- The app name must be unique. "Vibe" alone is very likely taken (UNVERIFIED), so pick a fallback such
  as "Vibe: Campus". The name is reserved only when the App Store Connect record is created, after
  enrollment.

**Fallback: enroll as an individual.** Enrollment for an individual can be faster (UNVERIFIED; the 2026
reports above include individuals who also waited weeks). The seller name would be Franky's legal name.
The app can later be **transferred** to the LLC's account. Transfer requires turning off TestFlight and
regenerating APNs keys
(https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer). Whether
an individual account can transfer to an organization account is not stated on that page (UNVERIFIED).

---

## §F — Push notifications in a native iOS shell

**Plain English.** The PWA's web push is for Home Screen web apps. The App Store app is a different
thing: it needs Apple's native push service (APNs), which needs the paid account. The push plan we
already have mostly carries over; it just needs a second delivery channel.

- **Web push doesn't cover the native app.** Apple offers web push to *Home Screen web apps* (iOS
  16.4+), with no developer account needed (`handoffs/wave-plan-pwa/research/web-ios.md:23`, `:157-171`;
  https://webkit.org/blog/13878/, 2023-02-16). A WKWebView inside a native app isn't a Home Screen web
  app, and service workers don't even register there without App-Bound Domains
  (https://developer.apple.com/forums/thread/781744). **Inference:** the iOS app needs APNs. Apple
  doesn't state this in one sentence (UNVERIFIED as an explicit statement).
- **APNs auth key (.p8).** Created under Certificates, Identifiers & Profiles → Keys. It can be
  **downloaded only once**, doesn't expire, and one key serves many apps. The JWT is refreshed at most
  every 20 minutes and must be under an hour old
  (https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns;
  the page is script-rendered, so details are UNVERIFIED). Since **2025-02-17**, keys can be limited to
  sandbox or production ("team-scoped") and to one bundle ID ("topic-specific")
  (https://developer.apple.com/news/?id=wy4tb0uo, 2025-02-17). The per-team key limit is UNVERIFIED.
- **Needs the paid membership:** APNs, the Push Notifications capability and `aps-environment`
  entitlement, TestFlight and the App Store. A free Apple ID can run the shell in the Simulator (and
  briefly on your own phone) without push. The Account Holder, or an Admin with access, creates the key
  (roles page, §E).
- **Capacitor:** `@capacitor/push-notifications` (v8 docs) needs the Push capability and two
  AppDelegate hooks. On iOS it returns an **APNs token**; on Android, an FCM token (via
  `google-services.json`) (https://capacitorjs.com/docs/apis/push-notifications, accessed 2026-09-24).
  Two ways to send:
  - **(a) FCM for both platforms.** Upload the .p8 to Firebase and use `@capacitor-firebase/messaging`
    to get an FCM token on iOS as well. One sender, one token type.
  - **(b) Direct APNs over HTTP/2 from Vercel, plus FCM for Android.** One fewer vendor, but two
    senders. HTTP/2 client support in Vercel functions is UNVERIFIED.
- **What changes in the push plan** (`handoffs/wave-plan-pwa/research/critic.md` §C5–C6, wave 2):
  - The outbox, dispatcher, safety checks and `PUSH_ENABLED` / allowlist switch all stay.
  - `push_subscriptions` gains a `transport` column (`webpush` | `apns` | `fcm`), or a sibling table.
  - The payload builder emits an APNs/FCM shape next to the declarative web-push shape.
  - Build the migration so native rows fit on day one.
- **Rule 4.5.4** (guidelines): the app must work without push; no sensitive personal information in a
  push; marketing pushes only after explicit opt-in, with an in-app opt-out. This matches the critic's
  "previews off by default" (critic.md C6).

---

## §G — Review timing, TestFlight, expedited review, typical rejections

**Plain English.** Most reviews finish within a day. A first app from a new company gets a closer look,
and this summer some developers waited weeks. Plan on **two rounds of review at 1–7 days each**. Get an
approval early, then press "release" ourselves on launch day.

**Timing:**
- **Apple:** "90% of submissions are reviewed in less than 24 hours"
  (https://developer.apple.com/distribute/app-review/, accessed 2026-09-24). In April 2026 Apple said
  90% within **48** hours, averaging 1.5 days (reported by
  https://mjtsai.com/blog/2026/03/02/mac-app-store-review-times-increasing/, updated through Aug 2026).
- **Tracker (updated 2026-09-18):** September average of 8 h 29 min waiting plus 2 h 38 min in review;
  TestFlight 9 h 10 min plus 1 h 16 min. Faster than July and August
  (https://www.runway.team/appreviewtimes).
- **Outliers:**
  - AI-built apps have flooded the queue (https://www.forbes.com/sites/josipamajic/2026/03/24/the-apple-app-store-is-flooded-with-ai-slop-and-legitimate-developers-are-paying-for-it/, 2026-03-24).
  - A new app sat **44 days** in "Waiting for Review", Jan–Mar 2026
    (https://developer.apple.com/forums/thread/818613).
  - In **Sept 2026**, forum threads report 9 days waiting after an expedited request was *approved*,
    and 35 days total (submitted Aug 14)
    (https://developer.apple.com/forums/tags/app-review?page=3, accessed 2026-09-24).
  - **A first app from a new developer gets more scrutiny**; budget 1–7 days per round.

**TestFlight** (https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers,
accessed 2026-09-24):
- **Internal** testers (up to 100) get builds right after processing, with **no review**. Processing
  averages about 31 minutes (Runway).
- **External** testers (up to 10,000, including a **public link**): the first build of each version
  goes through Beta App Review. At most 6 builds can go to beta review per 24 hours. Needs a "What to
  Test" note, a feedback email and sign-in details.
- Use external TestFlight for campus ambassadors and as a dress rehearsal for §A and §B. Whether beta
  review is as strict as full review is UNVERIFIED.

**Expedited review:** only for a critical bug fix or an **event-related** app (give the event name and
date) (https://developer.apple.com/distribute/app-review/). A first launch isn't a listed reason; a
campus launch event might qualify (UNVERIFIED). In Sept 2026, approved expedites didn't move the queue
(above).

**Appeals:** one appeal per rejection, to the App Review Board.

**Typical rejections:**
- **2025 Transparency Report:** 9,100,620 submissions reviewed and 2,093,244 rejected. By category:
  performance 1.35M, legal 496k, design 416k, business 284k, safety 151k
  (https://www.apple.com/legal/app-store/transparency/2025/, © 2026). Apple says over 40% of unresolved
  issues are **2.1 (completeness)**: crashes, placeholders, broken links, incomplete info, privacy-policy
  problems (distribute/app-review page).
- **For a social web-shell app like Vibe, most likely first to least:**
  1. 2.1: a demo account that can't post, or a crash from a missing camera purpose string.
  2. 4.2: wrapper.
  3. 1.2: EULA / zero tolerance / 24 h / hide-on-report / in-app contact.
  4. 5.1.1(i): privacy policy incomplete.
  5. 2.3: screenshots showing browser chrome or placeholder text.
  6. 3.1.1: selling Vibe+ outside Apple's IAP (see §H).
  7. Age rating: the reviewer demands 18+.
  8. The "limited audience → unlisted" suggestion (§C).

---

## §H — Vibe+ inside the iOS app (guideline 3.1)

**Plain English.** Normally, a digital subscription sold inside an iOS app must use Apple's in-app
purchase. On the **US** App Store, a court order currently lets apps link out to their own web checkout
at 0% commission, but the Supreme Court has taken the case. Since Vibe+ sales are switched off anyway
(`handoffs/wave-plan-stripe/contract.md`; S64 §4), **v1 of the iOS app should not sell Vibe+.**

- 3.1.1 requires IAP to unlock digital features. 3.1.1(a) and 3.1.3 say US-storefront apps may include
  buttons and links to other purchase methods with no entitlement (guidelines, accessed 2026-09-24).
- **Legal status of the US exception:**
  - The Ninth Circuit (2025-12-11) upheld the contempt order but lets Apple charge a cost-based
    commission (https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html).
  - The commission stays **0%** until the district court sets one.
  - **The Supreme Court granted cert on 2026-06-30** (https://www.courthousenews.com/apples-fight-over-commissions-for-linked-out-app-store-purchases-continues-in-federal-court/, 2026-08-11).
- **Options later:**
  - (i) US link-out to Stripe: cheapest, but legally unsettled.
  - (ii) IAP at $3.99 / $24.99: durable. Adds Paid Apps agreement, bank and tax (James), subscription
    wording, and deletion-flow warnings (§C).
  - (iii) Web-only, with no mention in the app.

---

## Apple checklist for Vibe (with lead times)

"Cal. days" means calendar days from when the item starts. **Bold** = on the critical path.

| # | Item | Who | Lead time (cal. days) | Needs |
|---|---|---|---|---|
| 1 | **Apple Account with 2FA for the Account Holder, plus a working `@connectvibe.app` mailbox (test that it delivers)** | Franky | 0–1 | Cloudflare rule |
| 2 | **D-U-N-S lookup in Apple's tool; request one if the LLC isn't found** | Franky or James | 0 if listed; else **~9–11** (5+2 business days) | exact legal name "CONNECTVIBE. LLC", Indiana address |
| 3 | Name the LLC on the site (footer now; Terms at the legal publish) | Franky | 1 | — |
| 4 | **Enroll as an organization ($99), take Apple's call** | Account Holder | **2–30** (2026 reports) | 1–3 |
| 5 | Build the Capacitor shell with the §A native features; Simulator only until enrolled | Franky | ~10–14 (UNVERIFIED estimate) | Xcode 26.4.1 (Xcode 26 / iOS 26 SDK is required for uploads since 2026-04-28: https://9to5mac.com/2026/02/03/apple-to-update-minimum-sdk-requirements-for-all-app-store-submissions/) |
| 6 | `PrivacyInfo.xcprivacy`, camera and photo purpose strings, export-compliance key, iPhone-only target | Franky | 1 | 5 |
| 7 | Moderation gaps: hide-on-report; "Also report?" after a block; block also stops comment, save and repost; help@ delivery test | Franky | 2–4 | — |
| 8 | Legal publish: Terms (24 h, zero tolerance, LLC name, 18+); Privacy (Sentry, Resend, Stripe, APNs/FCM, equal protection) | James + lawyer, Franky | unknown (the lawyer) | — |
| 9 | Demo account `appreview@` verified by the service role, plus seeded posts and a DM | Franky (**prod write, needs his yes**) | 1 | 1 |
| 10 | App Store Connect record: unique name, bundle ID, US-only, privacy label, age questionnaire incl. social media → **18+**, DSA trader status, support and privacy URLs, screenshots, review notes and video | Franky + Rylan | 1–2 | 4 |
| 11 | APNs .p8 key (sandbox and production), plus the FCM or direct sender (§F) | Franky | 2–4 | 4 |
| 12 | Book an App Review consultation (Tue/Thu) | Franky | next open slot | 4 |
| 13 | **TestFlight internal (no review) → external beta review** | Franky | 0 / **~1** (hours–2 days) | 4, 5, 6 |
| 14 | **Submit for App Review, with release set to manual** | Franky | **1–7 per round; budget 2 rounds (+1–2 fix days)** | 7–13 |
| 15 | Release on launch day; landing-page button → App Store link (or the unlisted link) | Franky | 0 | 14 |

Later, not for launch: Declared Age Range (v1.1, before Alabama/California on 2027-01-01, and now for
Texas); Vibe+ IAP or US link-out (§H); widgets.

## Critical path to an approved app by Oct 31

```
Thu Sep 24–Fri Sep 25  items 1–3; D-U-N-S requested (or found)
Tue Oct 6   (latest)   D-U-N-S reaches Apple → enroll (item 4). Shell built in parallel (5–7)
Fri Oct 9   DECISION   if Apple hasn't moved: switch to Franky-as-individual or accept a PWA-only Oct 31
~Tue Oct 14 TARGET     enrollment approved → same day items 6, 10, 11, 13 (internal TestFlight)
Thu Oct 15–16          submit App Review (round 1) + external TestFlight
Oct 17–23              round 1 result (1–7 days) → fix → round 2
Oct 24–30              round 2 result → approved, "Pending Developer Release"
Sat Oct 31             release
```

- **Slack:** if enrollment lands on Oct 14, we have 17 days for two review rounds, and some rounds take
  7 days. If it lands after about **Oct 18**, a store app by Oct 31 needs a first-pass approval.
- **Nothing else costs as much as a late D-U-N-S request:** each day's delay there comes straight off
  the end of the schedule.
- **Floor:** the PWA (wave 1) ships regardless. Until approval, the landing page can say "App Store —
  coming soon" next to "Add to Home Screen".

## Sources index (primary first)

**Apple:**
- Guidelines: https://developer.apple.com/app-store/review/guidelines/
- App Review: https://developer.apple.com/distribute/app-review/
- Account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Privacy details: https://developer.apple.com/app-store/app-privacy-details/
- News: ks775ehf (2025-07-24), tlur8uvi (2026-07-09), a233fmpw (2026-06-08), sg176nne (2026-06-03),
  2ezb6jhj (2025-11-04), 8jzbigf4 (2025-12-23), f5zj08ey (2026-02-24), wy4tb0uo (2025-02-17)
- Help: D-U-N-S, program-enrollment, roles, invite-external-testers, transfer overview
- Transparency 2025: https://www.apple.com/legal/app-store/transparency/2025/

**Courts and law:** SCOTUSblog (2026-07-06); CCIA (2025-12-23); Alston & Bird (2026-04-27, Louisiana
delay); Wiley (2026-06-08); Courthouse News (2026-08-11); Justia 9th Cir. (2025-12-11).

**Press and trackers:** MacRumors (2026-06-03); 9to5Mac (2026-02-03, 2026-07-09); Forbes (2026-03-24);
mjtsai (2026-03-02, updated); Runway (2026-09-18).

**Developer reports:** Apple forums 806726, 812889, 807358, 818613, 820213, 817247, 772332, 781744.

**Frameworks:** Capacitor docs (config, privacy-manifest, push-notifications; v8).
