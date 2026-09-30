# Fact-check: apple-review.md (checked 2026-09-24)

Adversarial pass over `apple-review.md`. The research file was not edited. Each claim is checked against a
primary source where one exists. **CONFIRMED** = the primary source (or, where marked, a reputable secondary)
says it. **CORRECTED** = the claim is wrong or misleading, with the right statement and URL. **UNVERIFIED** = no
primary source found.

## Summary

- 42 claims checked. 37 confirmed, 5 corrected, plus one wrong citation (#37: the claim holds). None of the
  corrections changes the bottom line (start
  enrollment now, 18+ rating, don't sell Vibe+ in v1, PWA is the Oct 31 floor).
- **Corrections that matter for decisions:**
  1. **Messaging and chat do not trigger 13+.** The 13+ minimum comes from the social media capability.
     Messaging sits at 4+.
  2. **Xcode 27 shipped in Sept 2026** (Apple silicon only). Xcode 26.4.1 is still accepted until April 2027.
  3. **Role permissions are slightly off.** Admins create keys by default. App Managers can submit but can't
     upload builds unless given Certificates, Identifiers & Profiles access.
  4. **Organizations can enroll through the Apple Developer app.** The help page says so plainly, so there's
     no conflict.

## Legal status (courts, state laws)

| # | Claim | Verdict | Source / note |
|---|---|---|---|
| 1 | Texas SB 2420: enjoined 2025-12-23; 5th Cir. administrative stay late May 2026, then a stay pending appeal on 2026-06-04; SCOTUS declined to vacate on 2026-07-06; appeal pending | CONFIRMED | https://www.scotusblog.com/2026/07/supreme-court-allows-texas-to-enforce-law-requiring-age-verification-and-parental-consent-on-app/ ; https://www.texaspolicyresearch.com/fifth-circuit-keeps-texas-app-store-law-alive/ (June 4 order); https://ccianet.org/litigation/ccia-v-paxton-w-d-tex/ (admin stay May 2026; no merits ruling or argument listed). The law's nominal effective date was 2026-01-01. Wiley dates enforceability from 2026-05-28 |
| 2 | Apple: new Texas Apple Accounts are subject from 2026-06-04; developers use Declared Age Range, the Significant Change API (PermissionKit), StoreKit `ageRatingCode` and a consent-revoked server notification | CONFIRMED | https://developer.apple.com/news/?id=sg176nne (2026-06-03). Apple adds: "it's the developer's responsibility to determine when there's a significant change" |
| 3 | Texas penalties up to $10k per violation | CONFIRMED (secondary) | https://www.macrumors.com/2026/06/03/apple-app-store-texas-sb-2420/ . Statute text not checked |
| 4 | Apple's Q&A: 18+ apps must still check age where the law requires it | CONFIRMED | https://developer.apple.com/support/age-assurance : "In regions where legally required, you need to check the age … with the Declared Age Range API" |
| 5 | Utah HB 498 (signed 2026-03-18) moved obligations from 2026-05-06 to 2027-05-06 and removed the AG's enforcement (private suits only); CCIA suit dismissed 2026-04-21 | CONFIRMED | https://www.alstonprivacy.com/challenge-to-utahs-app-store-accountability-act-voluntarily-dismissed-following-statutory-amendments/ ; https://le.utah.gov/~2026/bills/static/HB0498.html |
| 6 | Louisiana HB 977, signed 2026-05-15, delays to 2027-07-01 | CONFIRMED | https://www.alstonprivacy.com/louisiana-delays-app-store-accountability-effective-date-to-july-2027/ (2026-05-27). "AG enforcement" is **not** in that source (UNVERIFIED) |
| 7 | Alabama effective 2027-01-01 | CONFIRMED | Wiley 2026-06-08 alert (cited). HB 161 was signed Feb 2026 (https://www.alreporter.com/2026/02/19/gov-ivey-signs-app-store-accountability-act-into-law/) |
| 8 | California AB 1043 is effective 2027-01-01, with the age band coming from the OS (the research called the primary source UNVERIFIED) | CONFIRMED (primary found) | https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202520260AB1043 . Signed 2025-10-13. Developers must request the signal on download and launch. Pre-2027 devices get the OS interface by 2027-07-01 |
| 9 | Indiana HB 1408: signed 2026-03-04, effective 2027-01-01; only platforms with about $1B revenue | CONFIRMED (secondary) | https://www.aclu-in.org/legislation/bills-that-restrict-minor-access-to-social-media-arious/ : "at least $1 billion in global revenue" with algorithmic feeds. Statute text not read, so the lawyer should still confirm |
| 10 | Epic v. Apple: the 9th Cir. (2025-12-11) upheld contempt and lets Apple charge a cost-based commission; it stays 0% until the district court sets one | CONFIRMED | https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf ; https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple . The commission is limited to costs "genuinely and reasonably necessary". As of 2026-08-11 the district court had not set it (Courthouse News) |
| 11 | SCOTUS granted cert on 2026-06-30 | CONFIRMED, with nuance | https://www.crowell.com/en/insights/client-alerts/us-supreme-court-will-consider-challenge-to-contempt-order-in-federal-antitrust-and-unfair-competition-case . Cert is **limited** to whether contempt can rest on an injunction's "spirit". The Court declined the CASA/nonparty question. Apple's merits brief was filed Sept 2026, and argument is unlikely before 2027 |

## Store policy text (current guidelines, "Last Updated: June 8, 2026")

| # | Claim | Verdict | Source / note |
|---|---|---|---|
| 12 | 1.2 requires four things: filter, report with timely responses, block, published contact | CONFIRMED | https://developer.apple.com/app-store/review/guidelines/ |
| 13 | The June 8, 2026 revision made the developer responsible for removing violating content, with a compliance plan and possible removal | CONFIRMED | Guideline text: "It is your responsibility to remove content that violates this guideline, your terms of service, or your community standards … provide a plan to improve your compliance … your app may be removed". News: https://developer.apple.com/news/?id=a233fmpw |
| 14 | Feb 6, 2026: random/anonymous chat is explicitly named in 1.2 | CONFIRMED | Apple's primary source is https://developer.apple.com/news/?id=d75yllv4 (the research cited MacTech) |
| 15 | 4.2 wants apps "app-like", beyond a "repackaged website"; 4.2.2 excludes web clippings and link collections | CONFIRMED | guidelines (verbatim) |
| 16 | 4.8: Sign in with Apple is not required when the app "exclusively uses your company's own account setup" | CONFIRMED | guidelines. A further exemption covers education apps that require an existing education account, but Vibe doesn't use SSO, so it doesn't apply |
| 17 | 3.1.1(a)/3.1.3: US-storefront apps may include buttons and links to other purchase methods without an entitlement | CONFIRMED | guidelines: "not required for developers to include buttons, external links, or other calls to action in their United States storefront apps" |
| 18 | 5.1.1(i) "same or equal protection"; 5.1.2(i) "third-party AI" | CONFIRMED | guidelines (verbatim) |
| 19 | 2.1: demo account required; a built-in demo mode only with Apple's prior approval | CONFIRMED | guidelines 2.1(a) |
| 20 | 4.5.4: the app must work without push; no sensitive information in pushes; marketing only after opt-in, with an in-app opt-out | CONFIRMED | guidelines (verbatim) |
| 21 | Account deletion required since 2022-06-30; deactivation alone is not enough; a direct web link is OK; no email or phone flows | CONFIRMED | https://developer.apple.com/support/offering-account-deletion-in-your-app/ |
| 22 | The App Privacy label must include data collected through web views unless the app is an open-web browser | CONFIRMED | https://developer.apple.com/app-store/app-privacy-details/ : "Data collected via web traffic must be declared, unless you are enabling the user to navigate the open web" |
| 23 | Unlisted distribution names "higher-education students"; unlisted apps pass the same App Review | CONFIRMED | https://developer.apple.com/support/unlisted-app-distribution/ |
| 24 | The Nov 2025 case (807358): resubmission rejected within minutes with new demands: 18+, "a reported post removed from the reporter's feed immediately", in-app contact | **CORRECTED** (wording) | https://developer.apple.com/forums/thread/807358 . The developer's paraphrase reads "A mechanism for users to immediately remove posts from the feed (new)". It does not say *reported* posts or *the reporter's* feed. "Hide on report" is still a sensible fix, but it's an inference, not Apple's text. 18+ and in-app contact are confirmed (5 minutes in review) |
| 25 | Nov 2025 thread 806726: hybrid app rejected 10 times under 4.2, pointed to a consultation. Jan 2026 thread 812889: Capacitor app with share sheet etc. rejected under 4.2 | CONFIRMED | Both threads. 812889 was rejected **twice**, and the reviewer said location or sharing "alone are not robust enough" |

## Age ratings

| # | Claim | Verdict | Source / note |
|---|---|---|---|
| 26 | 2025-07-24: new 13+/16+/18+ tiers; answers due 2026-01-31; the developer may set a higher rating | CONFIRMED | https://developer.apple.com/news/?id=ks775ehf |
| 27 | 2026-07-09: social media questions required from Sept 2026; "Social Media" descriptor; **minimum 13+** | CONFIRMED | https://developer.apple.com/news/?id=tlur8uvi (the post itself doesn't state 13+). The 13+ is on the ratings reference page. Note: "social media disabled for under 13" requires, at a minimum, a Declared Age Range API check before enabling the features |
| 28 | "Messaging and Chat gives 13+" | **CORRECTED** | https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/ . In the standard (US) ratings, **Messaging and chat and User-generated content are 4+**, Social media is 13+ and Unrestricted web access is 16+ (that part is confirmed). Vibe's 13+ floor comes from social media, not DMs |
| 29 | From 2026-02-24, unverified users in Australia, Brazil and Singapore can't download 18+ apps | CONFIRMED | https://developer.apple.com/news/?id=f5zj08ey |
| 30 | Fizz is 18+ and sells subscriptions through Apple | CONFIRMED | https://apps.apple.com/us/app/fizz-your-authentic-community/id1548207780 (18+; Fizz Plus IAP). ".edu verification" isn't stated on the listing (UNVERIFIED) |
| 31 | Declared Age Range plugins need iOS 26+ for real results | CONFIRMED | https://github.com/Cap-go/capacitor-age-range (returns NOT_AVAILABLE below iOS 26; v8 maintained). Some verification methods need iOS 26.2 |

## Enrollment, fees, roles

| # | Claim | Verdict | Source / note |
|---|---|---|---|
| 32 | $99/yr; legal entity (no DBAs); D-U-N-S; the enroller has binding authority; public website on the org's domain; work email on that domain; seller name = legal entity name | CONFIRMED | https://developer.apple.com/programs/enroll/ |
| 33 | D-U-N-S: free; up to 5 business days (D&B) plus up to 2 (to Apple); expediting doesn't help; contact D&B after 2 weeks | CONFIRMED | https://developer.apple.com/help/account/membership/D-U-N-S/ |
| 34 | 2026 enrollment waits of 3+ weeks to about a month, and a refund offered (817247) | CONFIRMED | https://developer.apple.com/forums/thread/817247 . Note that the posters were **individuals**, which undercuts the "individual is faster" fallback |
| 35 | Apple Developer app enrollment for organizations is "conflicting" | **CORRECTED** | https://developer.apple.com/help/account/membership/enrolling-in-the-app/ explicitly covers "company, nonprofit organization, joint venture, partnership", in select regions, with a government photo ID scan. It's a supported route, not a conflict |
| 36 | Roles: only the Account Holder accepts agreements. Admins create certificates and APNs keys "if granted access". App Managers upload builds and submit | **CORRECTED** (partly) | https://developer.apple.com/support/roles/ . The Account Holder part is confirmed. **Admin: full access to "Create keys" and to upload builds (no grant needed).** App Manager: "Submit apps" yes. "Upload builds" and "Create keys" only with Certificates, Identifiers & Profiles access granted in Users and Access |
| 37 | DSA trader status must be declared even when not distributing in the EU | CONFIRMED (the cited source is wrong) | einwn76m only covers EU removal. The correct source is https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/ : "Even if you don't distribute apps in the EU, you'll still need to declare a trader status." A US-only app can declare "not a trader" |
| 38 | A free app with no IAP needs no bank or tax setup | CONFIRMED | https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements/ . Free apps fall under the DPLA. The Paid Apps Agreement, plus bank and tax, is needed only to sell apps or IAP |
| 39 | App transfer: turn off TestFlight; APNs keys regenerated | CONFIRMED, with nuance | https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer . The recipient team can generate **or reuse** an existing APNs key. Individual → organization transfer isn't stated (still UNVERIFIED) |

## Versions, capabilities, timing

| # | Claim | Verdict | Source / note |
|---|---|---|---|
| 40 | iOS 26 SDK / Xcode 26 required for uploads since 2026-04-28; build with "Xcode 26.4.1" | **CORRECTED** (stale) | The requirement is confirmed: https://developer.apple.com/news/?id=ueeok6yw . But **Xcode 27 is current**: the RC came out Sept 9 and the release around Sept 14, 2026 (https://developer.apple.com/news/?id=k1mtkt1k). It is Apple-silicon only, needs macOS Tahoe 26.4–26.6+, and the iOS 27 SDK becomes mandatory in **April 2027**. Xcode 26.4.1 (2026-04-16) is still accepted today. Start new work on Xcode 27 |
| 41 | Capacitor: `server.url` "not intended for use in production" (v8); privacy manifest supported from 5.7.4/6/7; the app needs its own `PrivacyInfo.xcprivacy` (e.g. CA92.1 for Preferences); required since 2024-05-01. Push: iOS returns an APNs token, two AppDelegate hooks, Android uses `google-services.json` | CONFIRMED | https://capacitorjs.com/docs/config ; https://capacitorjs.com/docs/ios/privacy-manifest (also lists 4.8.2 for Cap 4) ; https://capacitorjs.com/docs/apis/push-notifications |
| 42 | APNs team-scoped and topic-specific keys since 2025-02-17. Service workers in WKWebView need App-Bound Domains. App Review: "90% … in less than 24 hours"; April 2026 "90% within 48 hours, avg 1.5 days". Runway Sept numbers. 44-day wait (818613). Sept 2026 approved expedites that didn't move. Expedite reasons. Consultations (Webex, 30 min, Tue/Thu). TestFlight 10,000 external, public link, 6 beta-review builds per 24h. 2025 Transparency figures. ">40% … 2.1" | CONFIRMED | https://developer.apple.com/news/?id=wy4tb0uo ; forum 781744 (a developer report, not an Apple doc) ; https://developer.apple.com/distribute/app-review/ ; https://mjtsai.com/blog/2026/03/02/mac-app-store-review-times-increasing/ (update 2026-04-09, quoting 9to5Mac) ; https://www.runway.team/appreviewtimes (Sep 18: 8h29m + 2h38m; TF 9h10m + 1h16m; processing 31m) ; forum 818613 (Jan 22 – Mar 7, 2026) ; forums app-review tag p3 (one app sat 17 days "In Review" after an accepted expedite, 35 days since Aug 14; another 9 days waiting after approval on Sept 11) ; https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers ; https://www.apple.com/legal/app-store/transparency/2025/ (9,100,620 / 2,093,244; 1,354,418 / 495,673 / 415,532 / 283,820 / 151,159) |

## Still UNVERIFIED (no primary source found)

- Louisiana enforcement by the AG (not in the cited Alston post).
- Fizz verifies .edu emails (the store listing is silent).
- An individual account can transfer an app to an organization account.
- The DPLA interpreted-code clause's current section number.
- A campus launch event qualifies for expedited review.
- Beta App Review is as strict as full review.
- "Vibe" is taken as an app name.
- The APNs per-team key limit. HTTP/2 client support in Vercel functions.
- Apple checks the website for the legal entity name. D&B auto-lists new Indiana LLCs.
- Hotwire Native is used in Basecamp's and HEY's store apps.
