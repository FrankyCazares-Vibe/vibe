# Fact-check: payments.md (Selling Vibe+ inside the store apps)

Checked 2026-09-24 against primary sources where they exist. The research file was NOT edited.
Verdicts: **CONFIRMED** / **CORRECTED** (with the correct statement + URL) / **UNVERIFIED** (no primary source found).

## Bottom line
- The decision-driving claims all hold: the Apple guideline text, US 0% on link-outs today, the SCOTUS docket, Apple's
  proposed 15/10/5% rates, Google's fees (10% service + 5% Play Billing fee), the Oct 1, 2026 reporting start,
  consumption-only, PBL 8 deadline, and the Paid Apps Agreement gate.
- Three small corrections. None of them changes the launch recommendation. One of them settles an open question:
  RevenueCat webhooks are on the free tier.
- One research UNVERIFIED is now CONFIRMED from a primary source: the 2021 injunction's "in addition to In-App
  Purchasing" wording, quoted in the Ninth Circuit opinion.

## Apple: guideline text (https://developer.apple.com/app-store/review/guidelines/, fetched 2026-09-24)
1. **CONFIRMED.** 3.1.1: "If you want to unlock features or functionality within your app ... you must use in-app
   purchase." Restore: "you should make sure you have a restore mechanism for any restorable in-app purchases".
2. **CONFIRMED.** 3.1.1(a): entitlements "are not required for developers to include buttons, external links, or other
   calls to action in their United States storefront apps". Other storefronts are still prohibited without an entitlement.
3. **CONFIRMED.** 3.1.3 intro: "except for apps on the United States storefront and as set forth in 3.1.1(a) and 3.1.3(a)."
4. **CONFIRMED.** 3.1.3(b): "provided those items are also available as in-app purchases within the app."
5. **CONFIRMED.** 3.1.3(f): "provided there is no purchasing inside the app, or calls to action for purchase outside of the app."
6. **CONFIRMED.** 3.1.2(a) "Subscriptions must work on all of the user's devices where the app is available"; 3.1.2(c)
   "clearly describe what the user will get for the price" + Schedule 2.
7. **CONFIRMED.** Guideline text never mentions web views, SFSafariViewController or the default browser for US links.
   The research's "rules are silent" is accurate.
8. **CONFIRMED.** May 1, 2025 news (https://developer.apple.com/news/?id=9txfddzf) changed 3.1.1, 3.1.1(a), 3.1.3, 3.1.3(a)
   for the US storefront.
9. **CORRECTED (minor, conclusion holds).** "No 3.1.x changes since May 1, 2025" is right, but the details are off:
   - The Nov 13, 2025 update (https://developer.apple.com/news/?id=ey6d8onl) changed 1.2.1(a), 2.5.10, 3.2.2(ix), 4.1(c),
     4.7/4.7.2/4.7.5, 5.1.1(ix) and 5.1.2(i). It did not change kid/teen safety.
   - The June 8, 2026 update (https://developer.apple.com/news/?id=a233fmpw) changed the Introduction (kid/teen safety),
     1.2, 4.3(a), 4.3(b) and 4.5.3. Its 3.1 references are in the DPLA, not the Guidelines.
   - The research omits a **Feb 6, 2026** update (https://developer.apple.com/news/?id=d75yllv4). It changed 1.2 only, so
     random or anonymous chat now falls under user-generated content. That is relevant to Vibe's DMs and moderation, not to payments.
10. **CONFIRMED.** The Jan 2024 US link entitlement required that links "open a new window in the default browser ... and are not
    able to open a web view" (https://mjtsai.com/blog/2024/01/18/storekit-purchase-link-entitlement-for-united-states/).

## Apple: Epic v. Apple legal status
11. **CONFIRMED (was UNVERIFIED).** The 2021 injunction bars prohibiting "buttons, external links, or other calls to action that
    direct customers to purchasing mechanisms, in addition to In-App Purchasing." It is quoted verbatim in the Ninth Circuit
    opinion (https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf).
12. **CONFIRMED, with nuance.** Ninth Circuit, Dec 11, 2025 (same PDF):
    - The contempt finding is affirmed. The scare-screen and static-URL findings are upheld. Apple may still show "a neutral
      message apprising users that they are leaving".
    - The commission ban is reversed. Apple may charge for costs "genuinely and reasonably necessary for its coordination of
      external links", and only "as permitted by the district court on remand".
    - The prominence limit applies only "where both Apple and a developer offer a purchase option". Apple may then bar links
      "in more prominent fonts, larger sizes, larger quantities, and more prominent places" than its own, but it must allow parity.
13. **CONFIRMED.** On May 6, 2026, Justice Kagan alone denied 25A1213, Apple's application to stay the mandate
    (https://www.scotusblog.com/2026/05/court-tuns-down-apples-request-to-pause-order-holding-it-in-contempt/).
14. **CONFIRMED.** 26A194: Kagan granted an administrative stay on Aug 12, 2026 that ran until 5 p.m. on Aug 13. She denied the
    stay of district-court proceedings the same day (https://9to5mac.com/2026/08/12/apple-wins-temporary-supreme-court-pause-in-epic-games-proceedings/;
    Law360/Mealey's https://www.law360.com/mealeys/articles/2513831).
15. **CONFIRMED.** Docket 25-1311 (https://www.supremecourt.gov/docket/docketfiles/html/public/25-1311.html):
    - Petition filed May 21, 2026. Cert granted June 30, 2026, "limited to Question 1".
    - Question 1 asks whether contempt can rest on an injunction's "spirit"
      (https://www.scotusblog.com/cases/apple-inc-v-epic-games-inc-2/).
    - Apple's brief was filed Sept 14. Epic's is due Nov 13. No argument date as of Sept 21.
16. **CORRECTED (minor).** The research says a decision is likely "by about June 2027". The cited TechTimes piece (Sept 15, 2026)
    says argument is "not expected before January 2027 at the earliest" and a ruling "would likely come no earlier than June 2027",
    so treat June 2027 as the earliest date, not the latest
    (https://www.techtimes.com/articles/327527/20260915/app-store-commission-limbo-enters-new-phase-apples-epic-merits-brief-opens-scotus-fight.htm).
17. **CONFIRMED.** No commission applies today (Courthouse News, Aug 11, 2026,
    https://www.courthousenews.com/apples-fight-over-commissions-for-linked-out-app-store-purchases-continues-in-federal-court/).
    Newer detail: per the Sept 10 joint status report, Epic's 60-day clock to answer Apple's fee proposal **has not started**
    because of a document-production dispute (TechTimes, above). A court-set rate is therefore not imminent.
18. **CONFIRMED.** Apple's proposed rates are 15% standard, 5% Small Business Program, and 10% for renewals and VPP/NPP/Mini Apps
    (https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/). The filing
    itself was made Thursday, Aug 13, 2026. No source mentions retroactivity or reporting (the research correctly marks that UNVERIFIED).
19. **CONFIRMED.** RevenueCat's statements, both RevenueCat's reading and not Apple text:
    - "most apps are still required to also offer In-App Purchases (IAP)" and "may be rejected during their next update"
      (May 1/3, 2025).
    - "IAP must live alongside the external payment option ... link out to the full browser rather than an in-app web view"
      (Dec 9, 2025, updated Feb 20, 2026).

## Apple: store operations
20. **CONFIRMED.** "The agreement must be Active to test In-App Purchases in the sandbox environment" and "If you're submitting your
    first In-App Purchase, you must submit it with a new version of your app"
    (https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/).
21. **CONFIRMED.** Small Business Program:
    - 15%. Eligible are developers with up to $1M in prior-year proceeds **and developers new to the App Store**.
    - Proceeds are adjusted "fifteen (15) days after the end of the fiscal calendar month in which your enrollment is approved"
      (https://developer.apple.com/app-store/small-business-program/).
    - "≤ about 45 days" is a fair upper bound.
22. **CONFIRMED.** Account deletion: "notify them that their billing will continue through Apple". Use showManageSubscription or
    https://apps.apple.com/account/subscriptions. Scheduled deletion only "as long as there is also an option to delete the account
    immediately" (https://developer.apple.com/support/offering-account-deletion-in-your-app/).
23. **CONFIRMED.** App Store Server Notifications V1 is deprecated, and new apps must use V2 (Apple docs; e.g.
    https://developer.apple.com/documentation/appstoreservernotifications/app-store-server-notifications-changelog).
24. **UNVERIFIED.** Paid Apps Agreement lead time of "3–7 days". There is no Apple primary source for it. Secondary and forum reports
    say it often goes Active within about 24 hours of bank and tax info, but tax-form review can take much longer
    (https://developer.apple.com/forums/thread/115049). Keep the buffer.

## Google Play
25. **CONFIRMED.** SCOTUS denied Google's stay on Oct 6, 2025 (https://www.scotusblog.com/2025/10/justices-side-against-google/).
26. **CONFIRMED.** On Oct 29, 2025, Google said it "will not require the use of Google Play Billing" in the US. Three programs
    opened Dec 9, 2025. Reporting and fees start Oct 1, 2026 (https://support.google.com/googleplay/android-developer/answer/15582165).
27. **CONFIRMED.** Epic and Google jointly withdrew the settlement on July 15, 2026, a day before the approval hearing. Rival stores
    in Play began July 22, 2026 (https://www.androidauthority.com/epic-google-play-store-settlement-withdrawn-3687649/;
    https://www.techtimes.com/articles/320593/20260715/epic-google-jointly-withdraw-play-store-settlement-rival-android-app-stores-open-july-22.htm).
28. **UNVERIFIED (end date).** Injunction length:
    - Secondary sources say three years, through Nov 1, 2027 (https://www.techpolicy.press/tracker/epic-games-inc-v-google-llc/).
    - The same tracker says the three-year clock for the technology provisions starts "once the technology is functioning", which
      was July 2026. So different provisions may end on different dates.
    - No primary source was checked for whether the billing provisions lapse in Nov 2027. Flag it: Google's "not required" stance
      could end then.
29. **CONFIRMED.** Fees from June 30, 2026 (US, EEA, UK):
    - 10% service fee on auto-renewing subscriptions, and 10% on the first $1M.
    - A 5% billing fee applies only to Google Play Billing. Alternative billing and external links pay no billing fee.
    - Sources: https://android-developers.googleblog.com/2026/06/play-expanded-billing.html (June 24, 2026) and the service-fee page,
      https://support.google.com/googleplay/android-developer/answer/112622, which says "10% + 5% billing fee".
30. **CONFIRMED.** External content links (https://support.google.com/googleplay/android-developer/answer/16470497, last updated
    July 22, 2026):
    - Links may be used "in lieu of or alongside" Play Billing, with a 24-hour window and 10% on subscriptions at every tier.
    - Required: the APIs plus the information screen, and enrollment at Settings > External content links.
    - Links may open "on a browser, in a webview or another app store". Reporting and payment start Oct 1, 2026; the download
      deadline is Dec 1, 2026.
    - Addition: the link APIs need **Play Billing Library 8.2.1+**
      (https://developer.android.com/google/play/billing/externalcontentlinks/integration).
31. **CONFIRMED.** Alternative billing (https://support.google.com/googleplay/android-developer/answer/16497028):
    - "in lieu of or alongside" Play Billing, 10% on subscriptions.
    - Report "within 24 hours using alternative billing APIs", from Oct 1, 2026.
    - Required: order-history, manage-subscription and refund links. Non-subscription items are 10% on the first $1M, then 20%
      (new installs) or 25% (existing installs).
32. **CONFIRMED.** Consumption-only: "Google Play allows any app to be consumption-only, even if it is part of a paid service." It may
    say "Go to our website to upgrade your subscription to Premium", but only "without direct links"
    (https://support.google.com/googleplay/android-developer/answer/10281818).
33. **CONFIRMED.** Billing Library: "By Aug 31, 2026, all new apps and updates ... must use Billing Library version 8 or later", with
    an extension to Nov 1, 2026 (https://developer.android.com/google/play/billing/getting-ready). The current release is 9.1.0.
34. **CONFIRMED.** Setup: a payments profile, a Pub/Sub topic where `google-play-developer-notifications@system.gserviceaccount.com`
    has Publisher, and the Play Developer API (same page).
35. **UNVERIFIED.** "No official Capacitor plugin" for external content links. I found none either, but absence is not proof.

## RevenueCat, Stripe, taxes, other stores
36. **CONFIRMED.** `@revenuecat/purchases-capacitor` is the official plugin for iOS, Android and web. StoreKit 2 needs iOS 16+
    (https://github.com/RevenueCat/purchases-capacitor).
37. **CORRECTED (settles an open question).** RevenueCat's paid "Pro" plan is its free plan. The pricing page labels the standard
    plan "Pro": "Pay nothing for up to $2,500 in monthly tracked revenue", then 1%, with "Real-time event notifications via
    webhooks" included (https://www.revenuecat.com/pricing/). The webhook docs say "Webhooks are available on our Pro plan"
    (https://www.revenuecat.com/docs/integrations/webhooks), so **webhooks are available at $0 below $2,500 MTR**.
38. **CONFIRMED.** Webhooks:
    - Authorization is an auth header or the HMAC `X-RevenueCat-Webhook-Signature`.
    - Up to 5 retries, at 5/10/20/40/80 min.
    - RevenueCat recommends `GET /subscribers` after each webhook (same docs page).
    - The payload field names were not on that page; they are on the event-types page and were not checked.
39. **CONFIRMED.** Stripe charges "2.9% + 30¢" for domestic cards plus "0.7% of Billing volume". Checkout and Portal add no fee
    (https://stripe.com/pricing).
40. **CONFIRMED.** The keep-per-sale arithmetic:
    - I recomputed every row: $3.55/$23.79, $3.39/$21.24, $3.35/$22.54, $3.15/$21.29.
    - The web-button saving over IAP is $0.16/mo and $2.55/yr.
41. **Split: Google CONFIRMED, Apple UNVERIFIED.** Store sales tax:
    - Google "is responsible for determining, charging, and remitting sales tax" on Play-billed purchases, in listed states
      (https://support.google.com/paymentscenter/answer/7161449). Whether Indiana is on that list was not checked.
    - Apple collecting US sales tax in all states is widely reported, but no Apple primary page was found in this pass.
42. **CONFIRMED.** Amazon Appstore for Android **mobile** devices was discontinued Aug 20, 2025. Fire TV and Fire tablets continue
    (https://developer.amazon.com/apps-and-games/blogs/2025/02/upcoming-changes-to-amazon-appstore-for-android-devices-and-coins-program).
43. **CONFIRMED.** Microsoft Store lets non-game apps "choose their own commerce platform and keep 100% of the revenue". The page was
    updated 2024-07-23 (https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/why-distribute-through-store).
44. **CONFIRMED.** Capacitor v8 `server.allowNavigation`: "By default, all external URLs are opened in the external browser (not the
    Web View)". `appendUserAgent` has iOS and Android overrides (https://capacitorjs.com/docs/config). `@capacitor/browser` on iOS
    "uses SFSafariViewController" (https://capacitorjs.com/docs/apis/browser).

## Tally
Checked 44. CONFIRMED 37 in full (including #11, which was upgraded from UNVERIFIED). #41 is split: the Google half is
confirmed, the Apple half unverified. CORRECTED 3 (#9, #16, #37). UNVERIFIED 3 (#24, #28, #35).
