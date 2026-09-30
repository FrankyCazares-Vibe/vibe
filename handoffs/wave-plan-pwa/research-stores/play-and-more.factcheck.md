# Fact-check: play-and-more.md (adversarial pass, 2026-09-24)

Checked 43 claims against primary sources (Google/Apple/Microsoft/Samsung/D&B pages, GitHub APIs, the
Chromium commit, CA leginfo) or, for court/legislative history, dated law-firm and news reports.
**Result: 37 CONFIRMED, 3 CORRECTED, 3 UNVERIFIED.** No finding changes the headline plan (org account,
D-U-N-S this week, TWA, hide Vibe+, 18+ with Restrict Minor Access). Two corrections change a step:
Play **does** require website verification for org accounts (do it with the Play-owning Google account),
and the Microsoft Store does **not** need an Entra tenant but **does** need a work email on connectvibe.app.

## Corrections (act on these)

**C1. Website verification for Play org accounts (§1 table, checklist step 3). CORRECTED.**
File says: "For Play Console org accounts I found no page requiring it. UNVERIFIED for Play."
Actually: answer/10841920 says "In February 2024, we introduced new verification requirements for developers
who create new organization accounts" and lists "Website verification (for organization accounts)" as a step
before developer phone verification. answer/13205715: the request is sent from Play Console → Account details,
and "If the Google account you used to register the website in Search Console is the same Google account you
used to log in to your Play Console developer account, the request will be automatically approved."
Impact: step 3 should be done **with the dedicated company Google account from step 4** (do step 4 first).
Sources: https://support.google.com/googleplay/android-developer/answer/10841920 ;
https://support.google.com/googleplay/android-developer/answer/13205715

**C2. Microsoft Store "new company accounts must link a Microsoft Entra ID tenant" (§4 table, §6). CORRECTED.**
Actually: "You can now sign in with either a personal Microsoft account (MSA) or a Microsoft Entra ID work
account when creating a company developer account." Entra is optional. But the new flow requires a
**work email matching the company's domain**: "Personal emails like Gmail or Yahoo aren't supported." Company
accounts also need business **and employment** verification; up to three appeals **per verification type**;
document-based manual review "up to 3-5 business days". Entry point must be storedeveloper.microsoft.com.
Impact: drop the "Entra tenant" step and its UNVERIFIED caveat; use a @connectvibe.app address (help@ or a
founder alias) for verification. Source: https://learn.microsoft.com/en-us/windows/apps/publish/whats-new-company-developer
(updated 2026-07-17); https://blogs.windows.com/windowsdeveloper/2026/05/07/publish-to-microsoft-store-as-a-company-now-with-free-registration-and-faster-onboarding/

**C3. Android developer verification timing for Vibe (§1, checklist step 18). CORRECTED (minor).**
File says check registration "after the first upload" and lists it under "After launch … Nov".
Actually: "For new apps, when you create an app in the Google Play Console, Google Play automatically registers
the package name and links it to your account." Separately, the July 15, 2026 policy update and the June 18
blog say unregistered Play apps face "global removal from Google Play" after Sept 30, 2026 (not US-exempt).
Impact: Vibe is auto-registered at app creation; verify the status the day the app is created (step 7),
not in November. Sources: https://developer.android.com/developer-verification/guides/google-play-console ;
https://support.google.com/googleplay/android-developer/answer/17134731

## Confirmed

| # | Claim (file §) | Verdict / note | Source |
|---|---|---|---|
| 1 | D-U-N-S required for Play org accounts; "can take up to 30 days" (§1) | CONFIRMED | support.google.com/googleplay/android-developer/answer/13628312 |
| 2 | Payments-profile legal name + address must match D&B (§1) | CONFIRMED | same |
| 3 | US$25 one-time fee; prepaid cards not accepted (§1) | CONFIRMED | …/answer/6112435 |
| 4 | Org needs gov ID + org document + verified payments profile; device check is personal-only (§1) | CONFIRMED | …/answer/10841920 |
| 5 | D&B direct: "up to 30 business days" free; "within eight business days" expedited (§1) | CONFIRMED (fee unstated) | dnb.com/en-us/smb/duns/get-a-duns.html |
| 6 | Apple tool: "up to 5 business days" + "up to 2 business days" for Apple; free (§1) | CONFIRMED; Apple adds that expediting does not shorten the 2-day wait | developer.apple.com/help/account/membership/D-U-N-S/ |
| 7 | 12 testers x 14 days only for **personal** accounts created after Nov 13, 2023; production-access review "usually takes seven days or less" (§1) | CONFIRMED; org accounts not mentioned | …/answer/14151465 |
| 8 | Dev verification: Sept 30, 2026 in Brazil/Indonesia/Singapore/Thailand; Play + 6 partner stores (Galaxy, HONOR, OPPO, vivo V-Appstore, Transsion Palm, Xiaomi GetApps); global "2027 and beyond"; "99% of apps on Play have been registered automatically"; advanced flow Aug 2026 (§1) | CONFIRMED (blog dated 2026-06-18) | android-developers.googleblog.com/2026/06/android-developer-verification.html |
| 9 | Target API 36 for new apps + updates from Aug 31, 2026; extension to Nov 1, 2026 (§2.1) | CONFIRMED | …/answer/11926878 |
| 10 | Bubblewrap v1.25.0 published 2026-07-31; template `compileSdkVersion 36`, `targetSdkVersion 36` (§2.1) | CONFIRMED via GitHub API at tag v1.25.0 | github.com/GoogleChromeLabs/bubblewrap |
| 11 | Data safety: internal testing exempt; service-provider transfers are not "sharing"; declare webview data when "your app is in control of the code/behavior delivered through that webview" (§2.2) | CONFIRMED | …/answer/10787469 |
| 12 | UGC: terms "before users can create or upload UGC"; in-app report + block; "robust, effective, and ongoing UGC moderation" (§2.3) | CONFIRMED | …/answer/9876937 |
| 13 | Child Safety Standards: published CSAE standards, in-app feedback, CSAM, law compliance, point of contact; declaration (§2.4) | CONFIRMED; the contact is "a name and contact information for an individual" (supports the file's "pick a founder") | …/answer/14747720 |
| 14 | Deletion web link: "functional", "prominently featured and easily discoverable", reference app/developer name, no re-download; retention "for legitimate reasons such as security, fraud prevention or regulatory compliance" (§2.5) | CONFIRMED | …/answer/13327111 |
| 15 | Age groups 5-under … 18+; Families policy only if under-13 or "everyone, including children"; Restrict Minor Access when 18+ is the only group (§2.8) | CONFIRMED; nuance: existing under-18 users keep access but can't buy/renew | …/answer/9867159 |
| 16 | Reviewer credentials "accessible at all times, reusable, and valid regardless of user location", English (§2.10) | CONFIRMED; also "maintained at all times without any error" and must bypass 2-step verification. Vibe has password sign-in (`src/app/auth/login/page.tsx:138`), so a password account works | …/answer/15748846 |
| 17 | Texas SB 2420 in effect: PI Dec 23, 2025; Fifth Circuit stay in June 2026; SCOTUS declined July 6, 2026 (§2.9) | CONFIRMED. Timeline detail: administrative stay ~May 28 / June 1, stay pending appeal June 4, 2026; SCOTUS order unsigned, "no public dissents"; merits appeal still pending | scotusblog.com/2026/07/supreme-court-allows-texas-to-enforce-law-requiring-age-verification-and-parental-consent-on-app/ ; texaspolicyresearch.com/fifth-circuit-keeps-texas-app-store-law-alive/ ; W.D. Tex. order 1:25-cv-01660 (2025-12-23) |
| 18 | Texas developer duties (ratings, verify age category + consent via store data, notify significant changes, limited data use) + good-faith safe harbor (§2.9) | CONFIRMED (MoFo, updated 2026-06-10) | mofo.com/resources/insights/251111-texas-targets-app-stores-with-new-accountability-law |
| 19 | Utah ASAA → May 7, 2027; Louisiana → July 1, 2027 via HB 977 signed May 15, 2026 (§2.9) | CONFIRMED | alstonprivacy.com/louisiana-delays-app-store-accountability-effective-date-to-july-2027/ |
| 20 | California AB 1043 operative Jan 1, 2027; developer must request a signal "when the application is downloaded and launched" (§2.9) | CONFIRMED from bill text (§1798.501(b)(1), §1798.505) | leginfo.legislature.ca.gov … AB1043 |
| 21 | Play Age Signals API (beta); ranges 0-12/13-15/16-17/18+; Texas users whose accounts were created after May 28, 2026; "Google Play doesn't mandate the use of these features" (§2.9) | CONFIRMED. Note: the July 29 blog widens the parent-shared age range feature globally, but the API page (updated 2026-07-20) still says beta and Brazil + Texas only | developer.android.com/google/play/age-signals/overview ; …/understand-age-signals-responses ; …/answer/16569691 |
| 22 | US: Google "will not require the use of Google Play Billing"; notice dated 2026-09-17 (§2.11) | CONFIRMED | …/answer/15582165 |
| 23 | From June 30, 2026: 10% service fee on first $1M; Play Billing adds 5% billing fee (§2.11) | CONFIRMED. Nuance: alternative billing (new installs) is 20% above $1M; external-links subscriptions 10% | android-developers.googleblog.com/2026/06/play-expanded-billing.html (2026-06-24); …/answer/16497028 |
| 24 | External links / alt billing need enrollment + APIs with an information screen; report and pay fees from Oct 1, 2026 (§2.11) | CONFIRMED; also a Dec 1, 2026 deadline for reporting download events | …/answer/16470497 ; …/answer/15582165 |
| 25 | android-browser-helper 2.7.3 (2026-08-12) adds high-priority TWA notifications; billing-1.2.0 (2026-07-30) (§2.11, §3.3) | CONFIRMED (release notes: `USE_HIGH_PRI_NOTIFICATIONS`, PR #607) | github.com/GoogleChrome/android-browser-helper/releases |
| 26 | Review "up to seven days or longer in exceptional cases"; managed publishing controls go-live (§2.12) | CONFIRMED | …/answer/9859751 |
| 27 | Chromium commit 6955cdc1 "Remove TWA QualityEnforcer related code", 2023-05-04, bug 1441963, M115 (§3.2) | CONFIRMED (commit position 1139588 falls in M115) | github.com/chromium/chromium commit 6955cdc1 |
| 28 | Use the Play app-signing fingerprint; App Links verification won't follow redirects (§3.1) | CONFIRMED, upgrades the file's UNVERIFIED: "must be accessible without any redirects (no 301 or 302 redirects)", served as `application/json`, snippet shown under Release > Setup > App signing | developer.android.com/training/app-links/configure-assetlinks |
| 29 | Notification delegation: Chrome, Brave, Vivaldi only (not Samsung Internet, Edge, Firefox); launcher tries the user's default browser first (§3.3) | CONFIRMED (doc is "best effort", may lag real browsers) | android-browser-helper docs/trusted-web-activity-browser-support.md; TwaProviderPicker.java |
| 30 | `prefer_related_applications` must be false/absent for Chromium installability (§3.4) | CONFIRMED: "should be set to false or omitted to make your web app installable" (MDN, 2025-05-05) | developer.mozilla.org …/prefer_related_applications |
| 31 | Bubblewrap "offers to automatically download and install" JDK/SDK; signature mismatch is a common verification failure (§3.1, §3.4) | CONFIRMED (page last updated 2019-08-28) | developer.chrome.com/docs/android/trusted-web-activity/quick-start/ |
| 32 | PWABuilder commit 2026-09-22 raised Android min SDK default to 24 (§3.4) | CONFIRMED (#6375, "for Play automatic protection") | github.com/pwa-builder/pwabuilder commits |
| 33 | Microsoft Store free for companies since May 7, 2026 ($99 removed); D-U-N-S instant retrieval (§4) | CONFIRMED | blogs.windows.com 2026-05-07; learn.microsoft.com whats-new-company-developer |
| 34 | MSIX certification "can take up to three business days" (§4) | CONFIRMED | learn.microsoft.com/…/msix/app-certification-process |
| 35 | Galaxy Store: commercial seller status needed "free or paid"; D-U-N-S "up to 10 business days"; approval "several days"; PayPal/bank (§4) | CONFIRMED | developer.samsung.com/galaxy-store/prepare.html |
| 36 | Amazon Appstore on Android ended Aug 20, 2025; stays on Fire TV / Fire tablets (§4) | CONFIRMED | developer.amazon.com/apps-and-games/blogs/2025/02/upcoming-changes-to-amazon-appstore-for-android-devices-and-coins-program |
| 37 | User-installed Chrome apps ended with ChromeOS 138 (July 2025) (§4) | CONFIRMED | support.google.com/chrome/a/answer/15950395 |

## Unverified

- **U1. Indiana HEA 1408 (§2.9).** Secondary sources agree: signed Mar 4, 2026; parental consent under 16;
  covers platforms with ≥ $1B revenue **and** (per Wikipedia) ≥ 10% of the audience under 16, so almost
  certainly not Vibe. The effective date conflicts (July 1, 2026 per a June 30 radio report; Jan 1, 2027 per
  Wikipedia). iga.in.gov would not render, so the enacted text is still unverified. Lawyer question stands.
- **U2. "The clock resets when you submit another change while one is in review" (§2.12).** Not on
  answer/9859751. Keep it as a caution, not a rule.
- **U3. Chrome Web Store "doesn't have a Chrome app landing page…" quote (§4).** Not on the cited page
  (answer/15950395). The verdict (not applicable) doesn't depend on it.

Items the file already marked UNVERIFIED and that stay unverified: Google's org-verification time (2–7 days),
D-U-N-S propagation to Google, IARC rating outcome, TWA checkout classification under Play billing rules,
Samsung review time, Galaxy-signed key registration in 2027 (Google says registration "may include proving
ownership of the private signing keys", nothing Galaxy-specific), Bubblewrap `autoVerify` default.

## Arithmetic check on the critical path (§1, §5)
Sep 25 (Fri) + 5 business days = Oct 2; + 2 business days for propagation = Oct 6. So step 5 "~Oct 1–13"
only starts Oct 1 if D&B is faster than its maximum. Otherwise the file's Oct 5–20 range holds.
Add C1 (website verification) to step 5's day; it takes about 10 minutes if the same Google account owns both.
