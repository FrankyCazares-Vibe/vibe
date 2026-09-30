# Google Play, plus which other stores are worth it (research, session 65, 2026-09-24)

Read-only research. Repo claims are `path:line`; web claims are URL + date. **UNVERIFIED** marks anything
I could not confirm from a primary source. Lead times are in calendar days unless marked "business days".

---

## 0. The short version (plain English)

- **Google Play is doable by Oct 31, but only if the D-U-N-S number is requested this week.** Every step
  after it (Google's company check, the build, Google's first review) fits in about two weeks. A slow
  D-U-N-S (the free D&B route can take up to 30 business days) pushes Play past Halloween.
- **Sign up as an organization (CONNECTVIBE. LLC), not a person.** Company accounts skip Google's
  "12 testers for 14 days" rule. Personal accounts must run that test first, and they show a founder's name.
- **Ship Android as a Trusted Web Activity (TWA):** a small Android shell that opens www.connectvibe.app
  full screen in Chrome. It reuses the PWA wave, keeps the planned web push, needs no Android Studio, and
  takes about 1–2 days once the manifest is live.
- **Vibe's shipped moderation already matches what Google asks for:** report, block, filtering,
  a public child-safety page with a named contact, and help@. The open gaps are paperwork: a public
  account-deletion page, a reviewer test account, the Data safety form, and the content-rating form.
- **Three founder decisions:** (1) is the app 18+ only (that matches today's Terms) or open to
  17-year-old freshmen, (2) whether Vibe+ is sold inside the Android app at all at launch, and
  (3) whether to list on the Microsoft Store.
- **Other stores:** the Microsoft Store is free and cheap to add (it takes the same PWA, packaged by
  PWABuilder), so do it right after Play if time allows. Samsung Galaxy Store can wait until 2027. Skip
  Amazon, Meta Quest, Huawei and the Chrome Web Store.

---

## 1. (a) The Play Console organization account for an Indiana LLC

### Plain English
Google needs to know the company is real. The proof is a D-U-N-S number: a free 9-digit business ID from
Dun & Bradstreet. The LLC's legal name and address on Google's payments profile must match D&B's record
**exactly**. After that come a $25 one-time fee, one founder's ID, a company document, a phone and email
verified by code, and a public developer email and phone that appear on the store page. The Apple
Developer Program also needs a D-U-N-S, so one request covers both stores, plus Samsung and Microsoft.

### Detail

| Item | What's true now | Source |
|---|---|---|
| D-U-N-S required for organizations | "To create a developer account for an organization, you must have a D-U-N-S number"; D&B "can take up to 30 days so you should plan ahead." | support.google.com/googleplay/android-developer/answer/13628312 (fetched 2026-09-24; page shows no date) |
| Name/address must match D&B | "the legal name and address in your Google payments profile [must] match those in your Dun & Bradstreet profile". A mismatch produces a banner saying the org is "no longer verified". | same page |
| Other required fields | Developer name (may differ from the legal name), org phone, org website, contact name/email/phone, and a **public** developer email and phone shown on Google Play. Contact email and phone are verified with a one-time code. | answer/13628312; answer/13634081 |
| Documents | "Official government identity document" + "Official organization document" + a verified Google payments profile. The device-access check applies only to personal accounts. | answer/10841920 (fetched 2026-09-24) |
| Website verification | Required through Google Search Console for organization accounts in the **Android Developer Console** (the tool for apps outside Play). For **Play Console** org accounts I found no page requiring it. UNVERIFIED for Play. Verifying connectvibe.app in Search Console is a 10-minute DNS TXT record in Cloudflare, so do it anyway. | support.google.com/android-developer-console/answer/16641416 (fetched 2026-09-24) |
| Fee | "US$25 one-time registration fee"; prepaid cards not accepted. Whether a founder's personal card can pay for an org profile before the LLC has a bank card is UNVERIFIED (community threads say yes). | answer/6112435 (fetched 2026-09-24) |
| D-U-N-S lead time | D&B direct: "within 30 business days" free; "within eight business days" if you pay to expedite (price not shown). **Apple's D-U-N-S lookup tool: "up to 5 business days"**, then up to 2 business days for Apple to see it. The number is the same one Google uses. | dnb.com/en-us/smb/duns/get-a-duns.html (fetched 2026-09-24); developer.apple.com/help/account/membership/D-U-N-S/ (fetched 2026-09-24) |
| Google's org verification time | Google publishes no number. Plan **2–7 calendar days**. UNVERIFIED: this comes from community reports, not a Google page. | — |

**Realistic path from today (Thu Sep 24):** look up whether CONNECTVIBE. LLC already has a D-U-N-S (free
lookup, same day) → if not, request it through Apple's tool (≈7 calendar days) → Google payments org
profile + $25 + documents (1 day) → Google verification (2–7 days) → first app review (≤7 days, §2.12).
**Total ≈11–26 calendar days, which means live between about Oct 5 (everything fast) and Oct 20 (every
step at its limit), or about Oct 27 after one rejection, if the D-U-N-S request goes in by Sep 25–26.**
A standard free D&B request (≤42 calendar days) lands after Oct 31.

### The "12 testers for 14 days" rule does NOT apply to an organization account
Google's own text reads: "Google Play requires **personal** developer accounts created after November 13,
2023" to "run a closed test for their app with a minimum of 12 testers who have been opted in continuously
for at least 14 days", followed by a production-access application whose "Review usually takes seven days
or less". Organization accounts are not mentioned. Source: support.google.com/googleplay/android-developer/
answer/14151465 (fetched 2026-09-24; no page date). The fallback, a personal account, therefore costs at
least 14 + ≤7 days before the first production review, and it shows a founder's own name as the developer.

### Android developer verification (the 2026 sideloading/registration program): current status
- **Sept 30, 2026:** certified Android devices in **Brazil, Indonesia, Singapore and Thailand only** block
  installs of apps whose developer and package aren't registered. This covers Google Play and six partner
  stores (Samsung, Xiaomi, OPPO/OPlus, vivo, Honor, Transsion). **Global expansion: "2027 and beyond."**
  Google says "99% of apps on Play have been registered automatically" and that Play developers should
  check registration in Play Console. There's an "advanced flow" (Aug 2026) for power-user sideloading.
  Source: android-developers.googleblog.com/2026/06/android-developer-verification.html (2026-06-18);
  support.google.com/android-developer-console/answer/16561738.
- **What it means for Vibe (US only):** nothing extra this fall. The Play org verification *is* the identity
  step. After the first upload, check the package shows as registered in Play Console. In 2027, any copy
  sold outside Play (for example the Galaxy Store) must be registered too; if that copy is signed with a
  different key, that key probably needs registering (UNVERIFIED).

---

## 2. (b) The policies Vibe must meet

### Plain English
Google checks six things for a social app like Vibe: (1) the app is built for a recent Android version,
(2) an honest form about what data Vibe collects, (3) a way to report, block and moderate, (4) a public
child-safety page with a named contact, (5) account deletion inside the app **and** on a public web page,
and (6) an age rating plus a stated audience. Vibe already has most of the substance. What's missing is
mostly forms and one public page. Texas's app-store age law is in force and needs the lawyer's eye.

### 2.1 Target API level (in force now)
"New apps and app updates must target **Android 16 (API level 36)** or higher", effective **Aug 31, 2026**,
with an optional extension to Nov 1, 2026. Source: support.google.com/googleplay/android-developer/answer/
11926878 (fetched 2026-09-24). Bubblewrap **v1.25.0 (2026-07-31)** sets `targetSdkVersion 36` and
`compileSdkVersion 36` in its template (github.com/GoogleChromeLabs/bubblewrap releases; template
`packages/core/template_project/app/build.gradle`, read 2026-09-24). **Use ≥ 1.25.0.**

### 2.2 Data safety form
Required for any app on a closed, open or production track (internal testing is exempt). Data sent to a
**service provider** acting on Vibe's instructions (Supabase, Vercel, Stripe, Resend) counts as
"collected", not "shared". The form asks about encryption in transit and whether users can request
deletion. It must match the privacy policy. The help page doesn't mention TWAs, but it says to declare
webview data when "your app is in control of the code/behavior delivered through that webview", and a TWA
is Vibe's own site, so declare everything the site collects: name, email, user IDs, photos/videos, messages,
app activity, résumé files, and the school email. Source: answer/10787469 (fetched 2026-09-24).
Bubblewrap's shell adds no ads SDK or analytics SDK of its own. Still, confirm the generated manifest and
dependencies before answering "no ads / no advertising ID" (UNVERIFIED for the 1.25.0 output).

### 2.3 User-generated content policy vs what Vibe shipped
Policy text: answer/9876937 (fetched 2026-09-24).

| Google requires | Vibe today | Gap |
|---|---|---|
| Users accept terms/UGC policy "before users can create or upload UGC" | Terms gate exists (`src/app/auth/terms/accept-terms-form.tsx:34`, `/api/me/accept-terms`). Posting needs a verified school email (S64 handoff §6, lines 119–120). | None. The legal-publish step (new Terms text + `TERMS_VERSION`, `src/lib/legal/terms.ts:1`) should land **before** store submission, because today's Terms say "no guarantee about response time" (S64 §6 line 126) while the guidelines promise 24 h. |
| In-app reporting of UGC **and** users | Report on posts, comments, a single message, conversations, clubs and people (`src/app/legal/community/page.tsx:107–116`; S64 §11 lines 264–268). | None. |
| In-app blocking for 1:1 interaction | Block/mute from profiles and beside Report in conversations (community page :116; S64 §11 :267). | Known hole: blocked students can still comment on, save or repost the blocker's posts (S64 §11 :292–293). A reviewer is unlikely to test this, but a user report could surface it. Worth closing. |
| "Robust, effective, and ongoing" moderation; action against violators | /admin desk, removals, suspensions/bans, word filter (community page :99–104), every report emailed to three founders, "within 24 hours" (community page :127). | Operational: three founders must actually meet 24 h. The help@ inbox had never received a real email as of S64 (§11 :281–282). |

### 2.4 Child Safety Standards (Social category)
Google requires published CSAE standards that are "globally accessible" and name the app, an in-app
feedback mechanism, action on CSAM, compliance with child-safety law, a named **child safety point of
contact**, and a **declaration form in Play Console**. Source: answer/14747720 (fetched 2026-09-24; no
effective date on the page). Vibe has `/legal/child-safety` with help@ named as the contact
(`src/app/legal/child-safety/page.tsx:82–96`) and a NCMEC reporting commitment (:126). **Gap:** the form
asks for a person's name. Pick which founder, and route help@ to them.

### 2.5 Account deletion (in-app + a web URL)
Any app that lets people create an account must also let them request deletion. It may be "a link within
your app" to a web resource, and it must have a web link that works **without reinstalling the app**. That
link must be "functional", with the deletion path "prominently featured and easily discoverable", and must
"reference the app or developer name" as it appears on the store listing. Data may be kept "for legitimate
reasons such as security, fraud prevention or regulatory compliance" if users are told. Source: answer/
13327111 (fetched 2026-09-24).
- **Vibe today:** full self-serve deletion at Settings → Danger zone (`src/components/settings/
  SettingsClient.tsx:1265–1328`, `DELETE` in `src/app/api/me/route.ts:58`), described in the privacy
  policy (`src/app/legal/privacy/page.tsx:110–118`). Because the TWA *is* the website, the in-app path is done.
- **Gap:** `/settings` needs a sign-in, so a reviewer who clicks it lands on a login page. Google's text
  doesn't forbid that, but rejections for "invalid deletion link" are common in community threads
  (UNVERIFIED how Google treats login walls). **Recommend a small public page** (e.g. `/legal/delete-account`)
  that names "Vibe", gives the steps (sign in → Settings → Danger zone), offers help@ for anyone locked
  out, and states what's kept (the ban-key hash and billing records). About 1 hour of work.

### 2.6 Notification permission
On Android 13+ notifications are **off by default**. Apps targeting 33+ must ask for `POST_NOTIFICATIONS`
at runtime, best "in context" (for example when the student taps a bell or follows someone). Source:
developer.android.com/develop/ui/views/notifications/notification-permission (updated 2026-09-16). In a
TWA the web page's `Notification.requestPermission()` is forwarded to the Android prompt (§3.3). The PWA
plan's "ask in context" design carries over unchanged.

### 2.7 Content rating (IARC)
A free questionnaire in Play Console (no fee is mentioned anywhere). The US authority is the ESRB. Answer
honestly: users interact and share content (UGC), there's messaging, and there are digital purchases
(if Vibe+ is sold in the app). My expectation is that a social app with UGC rates Teen or higher, but
that's from memory, not a source (UNVERIFIED). Vibe's actual rating is unknown until the form is filled in. Source: answer/9859655 (fetched 2026-09-24).
Misrepresenting content can get an app removed.

### 2.8 Target audience, the Families policy, and 17-year-old freshmen
- Play Console makes you pick target age groups: 5 and under, 6–8, 9–12, 13–15, 16–17, 18 and over. The
  **Families policy applies only if you target under-13s** (or "everyone, including children"), so it
  doesn't apply to Vibe. Choosing any teen group (13–15, 16–17) brings teen-content rules. Google also
  checks that the store listing doesn't appeal to children. Source: answer/9867159 (fetched 2026-09-24).
- **"Restrict Minor Access"**: if 18+ is the *only* target group, you can switch it on. Users Google
  believes are under 18 then can't find, download or buy the app. Source: same page; answer/16302250.
- **Vibe's own documents say 18+:** Terms "Be at least 18 years old" (`src/app/legal/terms/page.tsx:40`),
  and Privacy "Vibe is for users 18 and older" (`src/app/legal/privacy/page.tsx:162`). Signup has no
  age question. **A 17-year-old freshman is already outside today's Terms.** This is a founder and lawyer
  decision, not a store one:
  - (a) Keep 18+, select only "18 and over", and turn on Restrict Minor Access. This is consistent with the
    Terms, and Google blocks under-18 Google accounts. 17-year-olds can still use the website.
  - (b) Open to 16–17: rewrite the Terms and Privacy, add the 16–17 group, meet the teen content rules,
    and come into scope for Texas-style parental-consent flows (§2.9).

### 2.9 US state age-verification laws (as of Sept 24, 2026)
| Law | Status | Source |
|---|---|---|
| **Texas SB 2420** (App Store Accountability Act) | **In effect.** Enjoined Dec 23, 2025; the Fifth Circuit stayed that injunction in June 2026; the Supreme Court declined to reinstate it on **July 6, 2026**. | scotusblog.com/2026/07/… (2026-07-06); mofo.com/resources/insights/251111-… (updated 2026-06-10) |
| Utah ASAA | Postponed to **May 7, 2027** | alstonprivacy.com/louisiana-delays-… (2026-05-27) |
| Louisiana ASAA | Postponed to **July 1, 2027** (HB 977, signed May 15, 2026) | same |
| California AB 1043 (Digital Age Assurance Act) | Effective **Jan 1, 2027**. Developers must request an age signal from the OS/store at download and launch. | leginfo.legislature.ca.gov (AB 1043); en.wikipedia.org/wiki/California_Digital_Age_Assurance_Act |
| Indiana HEA 1408 (signed Mar 4, 2026) | A social-media age law. As described in January 2026 it covers platforms with ≥ $1B global revenue, so **probably not Vibe**. The final enacted text is UNVERIFIED. | aclu-in.org/legislation/… (2026-01-14) |

**Texas's duties for developers** (per MoFo): assign age ratings, use the store's data to "verify the age
category … and confirm whether consent has been obtained for minors", notify the store of "significant
changes", and use store-provided age data only for compliance. There's a **safe harbor** for good-faith
reliance on store data. **What Google does:** it verifies age and gets parental consent for supervised
users in Texas. Developers "should consider" the **Play Age Signals API (beta)**, which returns ranges
0–12 / 13–15 / 16–17 / 18+ for eligible Texas users whose accounts were created after May 28, 2026. Google
says it "doesn't mandate the use of these features". Significant changes are reported through Play
Console. Sources: answer/16569691 (fetched 2026-09-24); developer.android.com/google/play/age-signals/
overview; android-developers.googleblog.com/2026/07/google-play-age-signals-api-safer-experiences.html
(2026-07-29).
- **For a TWA:** the Age Signals API is native Kotlin/Java. Calling it means adding a little native code to
  the Bubblewrap shell and passing the result to the page (for example with `postMessage`). That's a small
  job, but it's no longer "no native code". **Option (a) above plus Restrict Minor Access is the simplest
  posture.** Whether it satisfies Texas's developer duties for an 18+ app is a **question for the lawyer**
  (James owns that relationship).

### 2.10 Reviewer access (easy to miss, and a common rejection)
If sign-in is needed, choose "All or some functionality is restricted" under App content → App access
and give a **reusable** test username and password that is "accessible at all times … valid regardless
of user location", in English, and not a real user's. Source: answer/15748846 (fetched 2026-09-24).
**Vibe needs a dedicated reviewer account whose school email is already verified** (posting requires a
verified .edu, per S64 §6 :119–120). It must be non-admin, sit in a real campus with content to see, and
never be suspended. Consider a note in the admin desk so no founder bans it by mistake.

### 2.11 Selling Vibe+ inside the Android app
US rules changed after Epic v. Google. Google "will not require the use of Google Play Billing" for US users
(answer/15582165, latest notice 2026-09-17). From **June 30, 2026** the service fee is **10% on the first
$1M** under every billing path, and Play Billing adds a **5% billing fee** in the US
(android-developers.googleblog.com/2026/06/play-expanded-billing.html, 2026-06-24). Linking out or using
alternative billing requires **enrolling** in the US external-content-links or alternative-billing program,
integrating its APIs (an information screen before linking out), and **reporting transactions and paying
fees from Oct 1, 2026** (answer/16470497; answer/16497028).
- A TWA shows the website, and the website's Vibe+ page opens Stripe Checkout. Inside the Play app that is
  almost certainly "alternative billing / external offer" for Google's purposes. UNVERIFIED how Google
  classifies checkout inside a TWA.
- **Simplest for launch:** production selling is off anyway (`BILLING_ENABLED` unset,
  `handoffs/wave-plan-stripe/contract.md:28`). Detect the Play app (TWA launch URL marker or
  `document.referrer` starting `android-app://`) and hide Subscribe there. Show "manage on the web" only.
  Decide the paid path (enroll in external links at 10%, or Play Billing via the Digital Goods API at
  10% + 5%; android-browser-helper `billing-1.2.0`, 2026-07-30) when the LLC's bank account exists.

### 2.12 Review times for a new app
"For certain developer accounts, we'll take more time … review times of up to seven days or longer in
exceptional cases" (answer/9859751, fetched 2026-09-24). The clock resets when you submit another change
while one is in review. **Plan 7 calendar days for the first review, plus 7 more per rejection.** Use
managed publishing so an approved build goes live when you choose.

---

## 3. (c) If Android ships as a Trusted Web Activity (TWA)

### Plain English
A TWA is a thin Android app that opens www.connectvibe.app in Chrome with no address bar. Google
builds and maintains the tools for it (Bubblewrap, android-browser-helper), so what's in the app is
simply the live website. Two things make or break it: a small file on the website that proves the app
and the site belong together, and, for notifications, which browser the student's phone uses. The old
"crash the app if it's offline or 404s" rule is gone from Chrome. Play's general quality rules still apply.

### 3.1 Digital Asset Links (the proof that the app and the site match)
- Both directions are needed: the app's `asset_statements` (Bubblewrap writes it, template
  `AndroidManifest.xml:60`) and `https://www.connectvibe.app/.well-known/assetlinks.json` listing the
  package name and SHA-256 certificate fingerprints. If this fails, Chrome shows the URL bar and the app
  looks like a browser tab (developer.chrome.com/docs/android/trusted-web-activity/, "required to remove
  the URL bar").
- **Use the Play *app signing* key fingerprint** (Play Console → App integrity), not only the upload key.
  Google re-signs the app, and a "signature mismatch" is "a common cause for verification failing"
  (developer.chrome.com/docs/android/trusted-web-activity/quick-start/, last updated 2019-08-28). List both
  fingerprints so locally built test APKs verify too.
- **Repo facts:** there's no `public/.well-known/` yet. The proxy matcher (`src/proxy.ts:323–325`) doesn't
  exclude `.well-known`, so the file would pay a GoTrue `getUser` and could carry a session cookie. Add
  `\\.well-known/` to the negative lookahead, the same way wave 1 did for `sw.js`, and serve it as
  `application/json`. The apex host redirects 308 to www (`next.config.ts:28–32`), so declare **only
  `www.connectvibe.app`** in the app's host and intent filters. Android App Links verification doesn't follow
  redirects (developer.android.com App Links docs; I didn't re-fetch them this pass, so UNVERIFIED).

### 3.2 Play's quality bar for a TWA
- Chrome's 2020 criteria (crash on asset-link failure, offline non-200, navigation 404/5xx) are still in
  Chrome's docs (developer.chrome.com/docs/android/trusted-web-activity/whats-new, 2020-12-02). **But
  Chrome deleted the enforcement code on May 4, 2023:** commit `6955cdc1` "Remove TWA QualityEnforcer
  related code" (chromium.googlesource.com/chromium/src/+/6955cdc1f7058d6c8ec65b4591e7436816cecc5d, bug
  1441963, Chromium 115). A 404 on a deleted post won't crash the app.
- I found **no Lighthouse score or PWA-audit requirement in Play policy** (UNVERIFIED as an absence). What
  applies is the general policy: no apps that are "a webview of a website without permission from the
  website owner" (answer/9899034). That doesn't apply, because Vibe owns the site. Apps that "crash, do not
  have the basic degree of adequate utility as mobile apps" can be rejected (answer/9898783, via search
  summary). The wave-1 offline page (`handoffs/wave-plan-pwa/plan.md:18` R4, `:32` R18) and the installable
  manifest (R1–R2) are enough of a floor. The real risks are a login wall with no reviewer account (§2.10)
  and a missing URL-bar fix (§3.1).

### 3.3 Push notifications inside a TWA
- **Web push keeps working, and the planned server doesn't change** (VAPID, `web-push`, same origin
  `https://www.connectvibe.app`, so critic.md C4's origin check passes). Chrome **delegates** the site's
  notifications to the Android app, so they show under Vibe's name and icon. With `enableNotifications`,
  Bubblewrap adds a `DelegationService` and android-browser-helper's `NotificationPermissionRequestActivity`
  (template `AndroidManifest.xml:257–274`). That's how the page's `Notification.requestPermission()`
  becomes the Android 13+ system prompt (the Bubblewrap issue #730 fix; android-browser-helper
  `demos/twa-notification-delegation`). android-browser-helper **2.7.3 (2026-08-12)** added high-priority
  TWA notifications.
- **Caveat: the student's default browser decides.** The launcher picks "the user's default" browser first
  if it supports TWAs (`TwaProviderPicker.java`, android-browser-helper main). Notification delegation
  works in **Chrome, Brave and Vivaldi only, not Samsung Internet, Edge or Firefox**
  (android-browser-helper `docs/trusted-web-activity-browser-support.md`). On a Samsung phone that defaults
  to Samsung Internet, Vibe runs inside Samsung Internet and pushes won't be branded as Vibe (or may not
  show; UNVERIFIED on a device). **Test on one Samsung phone with Samsung Internet as default.**
- Nice side effects on Android: the TWA shares Chrome's cookies, so a student signed in on Chrome is
  already signed in, and verified App Links can open email links in the app. That avoids the iOS
  "links open Safari" problem (plan R16). Whether Bubblewrap turns on `autoVerify` by default is
  UNVERIFIED.

### 3.4 Wiring the website to the store app
- Add `related_applications: [{ "platform": "play", "id": "<package>" }]` to the manifest. **Keep
  `prefer_related_applications` absent or false**, because `true` makes the PWA uninstallable in Chromium
  (developer.mozilla.org …/prefer_related_applications, 2025-05-05). Then `navigator.getInstalledRelatedApps()`
  lets the landing page show "Open the app" instead of "Get it on Google Play" (developer.chrome.com/docs/
  capabilities/get-installed-related-apps). This is a change to plan R1, so schedule it for wave 3 or 4.
- The **package name is permanent** (for example `app.connectvibe.android`). Pick it once.
- **Tools on this Mac:** Bubblewrap CLI needs Node and "offers to automatically download and install" the
  JDK and Android SDK (quick-start page), so **no Android Studio**. PWABuilder.com builds the same kind of
  package with no local tools (github.com/pwa-builder/pwabuilder; a 2026-09-22 commit raised its Android
  minimum SDK to 24). Keep the upload keystore and its passwords in a password manager.
- Capacitor is the alternative (a native shell with native push through FCM). It means a second push path
  and Android Studio or Gradle work. Not worth it for Oct 31 if iOS isn't using Capacitor too. That's
  another research file's call.

---

## 4. (d) "And more": the other stores

### Plain English
IU and Purdue students carry iPhones and Android phones, which means the App Store and Google Play, and
Windows laptops or MacBooks. Only one other store reaches them in a way that matters: the **Microsoft
Store**, and even there students can already install Vibe straight from Edge or Chrome once the PWA ships.
Because it's now free and uses the same PWA, it's a cheap extra, but it's not a launch blocker. Everything
else is either dead, pointless for students, or unavailable in the US.

| Store | Status (Sept 2026) | Fit for IU/Purdue students | Effort | Verdict |
|---|---|---|---|---|
| **Microsoft Store** | **Free** for individuals and, since **May 7, 2026, for companies** (the $99 fee is gone). New company accounts must link a **Microsoft Entra ID tenant**. Verification by D-U-N-S ("instant retrieval") or documents, with at most three appeals. Sources: blogs.windows.com/windowsdeveloper/2026/05/07/publish-to-microsoft-store-as-a-company-… (2026-05-07); learn.microsoft.com/…/whats-new-individual-developer. PWABuilder turns the live PWA into `.msixbundle` + `.classic.appxbundle` after you reserve the name in Partner Center and copy Package ID, Publisher ID and Publisher Display Name (github.com/pwa-builder/pwabuilder `docs/builder/windows.md`). Certification "can take up to three business days" (learn.microsoft.com/…/msix/app-certification-process). | Medium-low. Lots of Windows laptops, but Edge and Chrome already offer "Install app". The listing mainly adds Store search and a badge. | ~1 day once the PWA is live (Entra tenant, reservation, package, listing, screenshots), plus ≤3 business days review. | **Optional, after Play.** Can make Oct 31 if Play is already moving. How hard the Entra tenant step is for an LLC with no Microsoft 365 is UNVERIFIED. Microsoft's rules on selling Vibe+ through outside checkout weren't checked this pass (UNVERIFIED). |
| **Samsung Galaxy Store** | Seller Portal is free, but **"commercial seller status" is required even for free apps**. D-U-N-S verification takes "up to 10 business days" and approval "several days". Needs PayPal or a bank account (developer.samsung.com/galaxy-store/prepare.html, fetched 2026-09-24). App review is "2–5 business days" per a third-party summary (UNVERIFIED), and Samsung's forum has threads about month-long reviews. It's one of the six partner stores in Android developer verification (2027 globally). | Low. Every US Galaxy phone also has Google Play, and students install from Play. | Same TWA APK, plus the Samsung key's fingerprint in `assetlinks.json` if it's signed differently. About 1 day of work, 2–3 weeks of calendar time. | **Later (2027) or never.** |
| **Amazon Appstore** | Shut down on Android phones **Aug 20, 2025**. Remains only on Fire TV and Fire tablets (developer.amazon.com/apps-and-games/blogs/2025/02/upcoming-changes-…, 2025-02). Reports say Amazon may move future tablets to Android (liliputing.com, 2025). | None. | — | **Skip.** |
| **Chrome Web Store** | Extensions and themes only. Chrome Apps were deprecated in 2020, the store "doesn't have a Chrome app landing page and searches for Chrome apps are not supported", and user-installed Chrome apps ended with ChromeOS 138 (July 2025) (support.google.com/chrome/a/answer/15950395). | None. Chromebook students install the PWA from Chrome, or get the Play app (Android apps run on ChromeOS; whether a TWA runs well there is UNVERIFIED). | — | **Not applicable.** |
| **Meta Horizon Store (Quest)** | 2D PWAs can be listed, packaged with Meta's Bubblewrap fork (developers.meta.com/horizon/documentation/web/pwa-overview/; github.com/meta-quest/bubblewrap). | Near zero. A headset isn't where students use a campus social app. | ~1–2 days plus Meta review (not checked). | **Skip.** |
| **Huawei AppGallery** | New Huawei phones run HarmonyOS NEXT, which "supports only native" apps (en.wikipedia.org/wiki/Huawei_AppGallery; HarmonyOS 5 article). Huawei phones aren't sold through US carriers (US trade restrictions since 2019; general knowledge, UNVERIFIED this pass). | None in the US. | — | **Skip.** |

---

## 5. Google Play checklist for Vibe (with lead times)

Dates assume the D-U-N-S request goes in by **Fri Sep 25/26** through Apple's tool. "Days" = calendar days.

| # | Step | Owner | Lead time | Earliest done | Blocks |
|---|---|---|---|---|---|
| 1 | Look up whether CONNECTVIBE. LLC already has a D-U-N-S (dnb.com lookup, free) | James | same day | Sep 25 | 2 |
| 2 | If not, request it through **Apple's D-U-N-S tool** with the exact Indiana legal name and address. This unblocks Apple, Google, Samsung and Microsoft. | James | ≤5 business days ≈ 7 days, +≤2 business days for it to propagate (Apple's figure; Google's is UNVERIFIED) | ~Oct 2–6 | 5 |
| 3 | Verify `connectvibe.app` in Google Search Console (DNS TXT in Cloudflare) | Franky | 10 min | Sep 25 | — |
| 4 | Make a dedicated company Google account to own Play Console (so no founder's personal account owns it), then invite the other two founders. This is best practice, not a written rule. | Franky | same day | Sep 25 | 5 |
| 5 | Google payments **organization** profile (name and address = D&B) → Play Console org account → $25 → ID + org document → email and phone codes. Public developer email = help@connectvibe.app; public phone = a business line, not a founder's cell. | Franky + James | 1 day + Google verification 2–7 days (UNVERIFIED) | ~Oct 1–13 | 15 |
| 6 | PWA wave 1 live in production (manifest, icons, offline page) | build | in flight | — | 7 |
| 7 | Build the TWA with **Bubblewrap ≥ 1.25.0** (targets API 36). Turn on `enableNotifications`, pick the permanent package name, and store the upload keystore in a password manager. | Franky | 1 day | ~Sep 29 | 8, 12 |
| 8 | `public/.well-known/assetlinks.json` (upload + Play app-signing SHA-256), proxy exclusion, `application/json`, www only | build | 0.5 day | after 7; final fingerprint after the first upload | 12 |
| 9 | Hide Vibe+ Subscribe inside the Play app (TWA detection), since production selling is off anyway | build | 0.5 day | anytime | 15 |
| 10 | Public **account-deletion page** naming "Vibe" (steps + help@ + what's kept) | build | 1 h | anytime | 11 |
| 11 | **App content** forms: privacy URL `/legal/privacy`, App access (reviewer account), Ads = none, **IARC** rating, **Target audience** (18+ only + Restrict Minor Access, if decision D1 = a), **Data safety** (with the deletion URL), **Child safety standards** declaration (a named person) | Franky | 0.5 day | after 5 | 15 |
| 12 | **Reviewer account**: verified school email, non-admin, in a campus with content, marked "do not restrict" | Franky | 1 h | anytime | 11 |
| 13 | Legal publish (Terms that match the 24-hour review promise) **before** submitting | James/lawyer | per the legal plan | — | 15 |
| 14 | Store listing: name, short and full description, icon, feature graphic, phone screenshots (usual specs are 512×512 icon, 1024×500 graphic, ≥2 screenshots, 80/4000-character text; from memory, UNVERIFIED this pass). Countries: **US only** at launch. | Franky | 0.5 day | after 5 | 15 |
| 15 | **Internal test track** on founders' phones: no URL bar, sign-in, report/block, deletion, push on Pixel/Chrome **and** Samsung/Samsung Internet | all three | 1–2 days | ~Oct 7–15 | 16 |
| 16 | Submit to production with **managed publishing** → review ≤7 days, +7 per rejection | Franky | ≤7 days | **~Oct 5–20** (Oct 27 with one rejection) | 17 |
| 17 | Landing page: official "Get it on Google Play" badge linking `play.google.com/store/apps/details?id=<package>`; `related_applications` in the manifest; "Open the app" when installed | build | 0.5 day | at approval | — |
| 18 | After launch: confirm the package shows as registered for Android developer verification; decide the Vibe+ billing path when the bank account exists; if the lawyer says so, wire Texas age signals | Franky | — | Nov | — |

**Critical path:** 2 → 5 → 16 ≈ 11–26 days. **If step 2 goes the free D&B route (≤30 business days), Play
misses Oct 31.** Fallback for launch day: Android students install the PWA from Chrome (a real home-screen
app with push), and the Play badge follows in November.

## 6. Other stores, ranked for IU/Purdue students

1. **Microsoft Store**: free, PWABuilder, ~1 day + ≤3 business days of review. *Optional before Oct 31,
   and only once Play is submitted.*
2. **Samsung Galaxy Store**: needs commercial seller status and D-U-N-S (≤10 business days). Same APK.
   *2027, if ever.*
3. **Meta Horizon Store**: possible for a 2D PWA, but no student audience. *Skip.*
4. **Amazon Appstore**: gone from Android phones since Aug 2025. *Skip.*
5. **Huawei AppGallery**: not in the US and native-only. *Skip.*
6. **Chrome Web Store**: extensions only. *Not applicable.*

## 7. Decisions for Franky (with a recommendation)

- **D1: Age:** 18+ only with Restrict Minor Access (matches Terms/Privacy) vs opening to 16–17.
  → **18+ now**; ask the lawyer about Texas SB 2420 and 17-year-old freshmen.
- **D2: Vibe+ in the Android app:** hide at launch vs enroll in US external links (10%) vs Play Billing
  (10% + 5%). → **Hide at launch**, decide with the bank account.
- **D3: Android wrapper:** TWA (Bubblewrap) vs Capacitor. → **TWA** (keeps web push, no Android Studio).
- **D4: Microsoft Store by Oct 31?** → **Only after Play is submitted**; otherwise November.
- **D5: Public developer identity:** developer name ("Vibe" vs "CONNECTVIBE"), public email (help@),
  public phone (a business line).

## Sources (fetched 2026-09-24 unless dated)
Play Console Help (support.google.com/googleplay/android-developer/answer/…): 13628312 (org account info),
10841920 (identity verification), 13634081, 6112435 ($25), 14151465 (12 testers), 11926878 (target API),
10787469 (Data safety), 13327111 (account deletion), 9876937 (UGC), 14747720 (child safety), 9867159
(target audience), 16302250 (age-restricted), 9859655 (content rating), 15748846 (review sign-in), 9859751
(review times), 9899034 (spam/webviews), 16569691 (US state laws), 15582165 (US policy update, 2026-09-17),
16470497 and 16497028 (US external links / alternative billing). android-developer-console/answer/16561738
and 16641416. Blogs: android-developers.googleblog.com 2026/06/android-developer-verification (2026-06-18),
2026/06/play-expanded-billing (2026-06-24), 2026/07/google-play-age-signals-api-safer-experiences
(2026-07-29). developer.android.com notification-permission (2026-09-16) and age-signals overview.
Chrome/TWA: developer.chrome.com/docs/android/trusted-web-activity (2020), quick-start (2019-08-28),
whats-new (2020-12-02); Chromium commit 6955cdc1 (2023-05-04); github.com/GoogleChrome/android-browser-helper
(2.7.3, 2026-08-12; billing-1.2.0, 2026-07-30; TwaProviderPicker.java; browser-support doc);
github.com/GoogleChromeLabs/bubblewrap (v1.25.0, 2026-07-31; template manifest/gradle); MDN
prefer_related_applications (2025-05-05). D-U-N-S: dnb.com get-a-duns; developer.apple.com/help/account/
membership/D-U-N-S/. Legal: scotusblog.com 2026/07 (2026-07-06); mofo.com Texas update (2026-06-10);
alstonprivacy.com Louisiana delay (2026-05-27); leginfo.legislature.ca.gov AB 1043; aclu-in.org HEA 1408
(2026-01-14). Other stores: blogs.windows.com 2026-05-07; learn.microsoft.com (individual free
registration, MSIX certification); pwa-builder/pwabuilder docs/builder/windows.md; developer.samsung.com/
galaxy-store/prepare.html; developer.amazon.com blog 2025-02; support.google.com/chrome/a/answer/15950395;
developers.meta.com/horizon pwa-overview; en.wikipedia.org Huawei AppGallery.
