# Selling Vibe+ inside the store apps (research, 2026-09-24)

Question: can Vibe+ ($3.99/month, $24.99/year, sold through Stripe Checkout on the web) be sold inside
the Apple App Store and Google Play apps? If so, how, as of September 2026, on US storefronts?
READ-ONLY research. Repo claims are cited as path:line. Web claims are cited as URL + date. **UNVERIFIED** means
I could not confirm the claim from a primary source.

---

## TL;DR in plain English

1. **iPhone.** Apple's rulebook still says that an app which unlocks features has to sell them through
   Apple's in-app purchase (IAP). Apple takes 15% under the Small Business Program. Because of a court order,
   US apps may also show a "Subscribe on the web" button since May 2025, and Apple takes **0%** of those web
   sales today. That 0% probably won't last. Apple asked the court in Aug 2026 to allow a 5% fee for small
   developers, and the Supreme Court hears Apple's appeal this term.
2. **Android.** Google says that **any** app may be "consumption-only", meaning nothing is bought in the app
   and web subscribers just get their perks. That path costs 0%. US apps may also link to a web checkout or
   use their own billing *instead of* Google's. But Google charges **10%** on a subscription bought within 24
   hours of the student tapping the link, and it collects those fees from **Oct 1, 2026**. Stripe's fees come
   on top of that 10%. So for a $3.99 plan, sending the student to the web is **worse** than Google's own
   billing, which costs 15% in total.
3. **The hard blocker is the bank account, the same one Stripe is waiting on.** Apple won't let you even
   *test* an in-app purchase until its Paid Apps Agreement is Active. That needs the LLC's bank account and
   tax forms. Vibe+ isn't on sale in production either, for the same reason (contract.md:28-29).
4. **Recommendation for Oct 31.** Ship both apps with **no purchase, no price, no "Subscribe", no web link
   and no Vibe+ upsell**. The main job is making sure the apps do NOT show today's `/plus` page and the
   "See Vibe+" prompts. Selling can come later:
   - **iPhone:** once the bank exists, add Apple IAP through RevenueCat. The US web button can be added at
     the same time.
   - **Android:** go consumption-only first (0%) and add Google Play Billing later.

### The three questions, answered

| | Apple, US storefront | Google Play, US |
|---|---|---|
| **(1) "Subscribe on the web" button that opens Stripe Checkout** | **Allowed**, with no entitlement needed and 0% commission today. Apple may not show a scare screen. By the guideline text, IAP must still be offered alongside it. The button only works on the US storefront, and it should open the real browser. | **Allowed only if you enroll** in the External content links program: a declaration form, Google's link APIs and info screen, 10% on subscriptions, and reporting from Oct 1, 2026. Without enrolling, it breaks the Payments policy. |
| **(2) Stripe Checkout running inside the app's web view** | **Don't.** It amounts to a non-IAP purchase inside the app (3.1.1). Apple's 2024 US link rule required the default browser. The 2025 rules say nothing about web views (UNVERIFIED), and RevenueCat (Feb 2026) says to use the full browser. | **Allowed only if you enroll** in the US Alternative billing program: Google's APIs, reporting within 24 hours, and 10% on subscriptions. Otherwise not allowed. |
| **(3) No purchase in the app, but web subscribers still get Vibe+** | **Gray zone.** Guideline 3.1.3(b) allows it only if the same item is *also* sold as an IAP. Some apps pass review, but each update risks a 3.1.1 or 3.1.3(b) rejection. It is safe at launch because nobody can buy Vibe+ anywhere yet. | **Explicitly allowed.** Google says "any app" can be consumption-only, and the app may even say "Go to our website to upgrade" as long as there is no link. It costs 0%. |

---

## What Vibe+ is today (repo facts that drive the answer)

- **Vibe+ unlocks features.** It is not "reader" content. The `/plus` headline is "See who's looking."
  (src/app/plus/page.tsx:501), and profile viewers are gated server-side with `requirePlus`
  (src/app/api/me/profile-viewers/route.ts:50). So Apple 3.1.1 applies, and the reader-app exception 3.1.3(a)
  does not.
- **Web purchase flow.** Hosted Stripe Checkout plus Customer Portal (contract.md:13-14). Prices are fixed
  labels "$3.99" / "$24.99" (contract.md:15-16, 83). Subscribe does `window.location.assign(url)` to
  `https://checkout.stripe.com/` (src/app/plus/PlusActions.tsx:53, :158-160). The page decides its state on
  the SERVER through `billingEnabled()` (src/app/plus/page.tsx:382).
- **Sales are off in production** until the LLC has its EIN, bank account and Terms (contract.md:28-29,
  src/app/plus/page.tsx:37-38). When signed out or when sales are off, the page still shows the explanation
  **and the price** (src/app/plus/page.tsx:34).
- **Entitlement store.** One row per user (`user_id` PK), with `source IN ('stripe','apple','comp')`, a
  unique `(source, provider_ref)`, and expiry read at request time
  (supabase/migrations/20260912101000_entitlements.sql:141-160). There is no `'google'` source yet. The
  ledger `billing_events.provider` is `CHECK (provider = 'stripe')` (contract.md:58). The Sept 12 design
  already planned an Apple leg: StoreKit 2 + App Store Server Notifications v2 writing `source='apple'`
  (handoffs/2026-09-12-design-paywall-monetization.md:304-305).
- **Places inside the app that would steer to purchase** (all of them lead to `/plus`):
  - src/components/posts/PostAudienceList.tsx:88
  - src/components/otto/OttoMetrics.tsx:99
  - src/lib/feedback/failure-copy.ts:164 ("See Vibe+")
  - public/html/_postViewer.js:1933
  - public/html/_persistence.js:157 ("That's a Vibe+ feature.")
  - the `/plus` tab mapping in src/components/mobile/mobile-tab-active.ts:20
- **Account deletion** cancels Stripe first and fails closed (contract.md:33, :171-174). It cannot cancel
  an Apple or Google subscription.

---

## A. Apple, US storefront

**Plain English.** The written rule hasn't changed: to unlock features, sell them with Apple IAP (3.1.1). If
students can buy elsewhere, the app may honor those purchases only if the same thing is also sold as an
IAP (3.1.3(b)). What changed, in the US only, is that Apple may no longer stop you from adding a button or
link to your own checkout, and it may not charge anything on those sales for now. Apple is fighting this at
the Supreme Court, so treat the 0% as temporary.

### Guideline text today (https://developer.apple.com/app-store/review/guidelines/, fetched 2026-09-24)
- **3.1.1.** "If you want to unlock features or functionality within your app, (by way of example:
  subscriptions …) you must use in-app purchase." It also asks for "a restore mechanism for any restorable
  in-app purchases."
- **3.1.1(a).** Link entitlements "are not required for developers to include buttons, external links, or
  other calls to action in their United States storefront apps." In all other storefronts, calls to action
  pointing to non-IAP purchasing are still prohibited unless the app holds an entitlement.
- **3.1.3 (intro).** Apps "cannot, within the app, encourage users to use a purchasing method other than
  in-app purchase, except for apps on the United States storefront …"
- **3.1.3(b), multiplatform.** Apps may let users access subscriptions or features acquired elsewhere,
  "provided those items are also available as in-app purchases within the app."
- **3.1.3(f).** Free stand-alone companion apps to a paid web tool (VoIP, cloud storage …) need no IAP, but
  only with "no purchasing inside the app, or calls to action for purchase outside." That is a poor fit for
  a social app: it is **not** Vibe's category.
- **3.1.2(a) and (c).** Subscriptions must work "on all of the user's devices where the app is available".
  Before asking a student to subscribe, the app must describe what they get for the price, per Schedule 2.
- **No 3.1.x changes since May 1, 2025.** That update is at https://developer.apple.com/news/?id=9txfddzf
  (May 1, 2025). The Nov 13, 2025 update (https://developer.apple.com/news/?id=ey6d8onl) and the June 8, 2026
  update (https://developer.apple.com/news/?id=a233fmpw) changed kid/teen safety, 1.2 and 4.x, but not 3.1.

### Legal status, Epic v. Apple (newest last)
- **2021 injunction.** It bars Apple from prohibiting "buttons, external links, or other calls to action
  that direct customers to purchasing mechanisms, **in addition to** In-App Purchasing." Those words are
  why Apple can still require IAP alongside a link. Source: ABA summary,
  https://www.americanbar.org/groups/antitrust_law/resources/newsletters/epic-v-apple/ (UNVERIFIED against
  the original order; the quote appears in many secondary sources).
- **Apr 30, 2025 contempt order.** Apple may charge no commission on link-outs. It may not restrict where
  links go or how they look, may not show scare screens, and may not require static URLs; dynamic,
  logged-in links are OK. Source: https://www.neonpay.com/blog/making-sense-of-the-april-30th-2025-epic-v-apple-ruling
  (Apr 30, 2025). That write-up notes the order says nothing about in-app web views.
- **May 1, 2025.** Apple changed 3.1.1, 3.1.1(a), 3.1.3 and 3.1.3(a) for the US storefront
  (https://developer.apple.com/news/?id=9txfddzf).
- **Dec 11, 2025, Ninth Circuit** (https://cdn.ca9.uscourts.gov/datastore/opinions/2025/12/11/25-2935.pdf).
  - **Affirmed:** the contempt finding, the scare-screen ban, and dynamic links.
  - **Vacated:** the total ban on commissions. Apple may charge only for costs "genuinely and reasonably
    necessary" to coordinate the hand-off, and the district court sets the amount.
  - **Also allowed:** Apple may require that external links be **no more prominent than its own IAP**
    buttons.
  - Summaries: Fenwick (Dec 22, 2025),
    https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple, and
    SCL (Dec 29, 2025), https://scl-llp.com/ninth-circuit-upholds-apple-contempt-finding-but-narrows-scope-of-remedial-relief/.
    SCL says Apple can't charge until the district court approves a rate.
- **Stays refused.** May 6, 2026: Justice Kagan denied Apple's request to stay the mandate (25A1213,
  https://www.scotusblog.com/2026/05/court-tuns-down-apples-request-to-pause-order-holding-it-in-contempt/).
  Aug 13, 2026: she denied a request to stay the district-court proceedings (26A194).
- **Supreme Court.** Petition 25-1311 was filed May 21, 2026, and cert was **granted June 30, 2026**,
  limited to Question 1: can contempt rest on the "spirit" of an injunction?
  - Apple's brief was filed Sept 14, 2026; Epic's is due Nov 13, 2026.
  - Docket: https://www.supremecourt.gov/docket/docketfiles/html/public/25-1311.html
  - Argument is "unlikely before January 2027" (TechTimes, Sept 15, 2026,
    https://www.techtimes.com/articles/327527/20260915/app-store-commission-limbo-enters-new-phase-apples-epic-merits-brief-opens-scotus-fight.htm).
  - A decision by about June 2027 is likely (UNVERIFIED; that is the usual term calendar).
- **Rate proceedings.** On remand, Judge Gonzalez Rogers refused to pause the rate-setting. Today
  "no commission applies" (Courthouse News, Aug 11, 2026,
  https://www.courthousenews.com/apples-fight-over-commissions-for-linked-out-app-store-purchases-continues-in-federal-court/).
- **Apple's proposed rates** for linked-out purchases, pending court approval: 15% standard, 10% on
  renewals and partner programs, and **5% for the Small Business Program**. Sources: TechCrunch (Aug 14,
  2026), https://techcrunch.com/2026/08/14/apple-proposes-to-take-a-15-cut-of-purchases-made-outside-the-app-store/,
  and 9to5Mac (Aug 13, 2026).
  - I found no word on whether those fees would be retroactive or come with a reporting duty (UNVERIFIED).

### Answers for Apple
1. **A "Subscribe on the web" button that opens Stripe Checkout is allowed today on the US storefront.**
   - No entitlement is needed and Apple takes 0%.
   - Keep it off every non-US storefront. International students may hold non-US Apple IDs, and the
     storefront follows the account's country. Gate the button on StoreKit's storefront country.
   - Open it in the **default browser**. In a Capacitor app that happens automatically for any host that
     is not in `server.allowNavigation`: "all external URLs are opened in the external browser"
     (https://capacitorjs.com/docs/config, v8 docs). So **never add `*.stripe.com` to allowNavigation**.
     Don't use `@capacitor/browser` either: it is SFSafariViewController
     (https://capacitorjs.com/docs/apis/browser), which the 2024 US rule banned
     (https://mjtsai.com/blog/2024/01/18/storekit-purchase-link-entitlement-for-united-states/, Jan 18,
     2024). Whether that ban still applies is UNVERIFIED, so the real browser is the safe choice.
   - By the guideline text (3.1.1, 3.1.3(b)) the app **must still offer IAP**. RevenueCat reports that
     "most apps are still required to also offer In-App Purchases". It also says some non-reader apps
     passed review without IAP and "may be rejected during their next update"
     (https://www.revenuecat.com/blog/growth/apple-anti-steering-ruling-monetization-strategy, May 1,
     2025, updated May 3, 2025). A later RevenueCat post says "IAP must live alongside the external payment
     option" and to link out "to the full browser rather than an in-app web view"
     (https://www.revenuecat.com/blog/engineering/app-to-web-purchase-guidelines, Dec 9, 2025, updated Feb
     20, 2026).
2. **Stripe Checkout inside the app's web view: no.** In a Capacitor app the whole UI is a web view, so
   loading checkout.stripe.com inside it is a non-IAP purchase inside the app. That is a 3.1.1 rejection
   risk.
3. **No purchase in the app, but web subscribers still get Vibe+:**
   - **At launch this is fine.** Production can't sell Vibe+, so the only Plus users are comps. A comp is
     not a purchase.
   - **Once the web sells Vibe+, it becomes a gray zone.** 3.1.3(b) requires the IAP too. Expect a reviewer
     to ask "where can I buy this?" whenever a free account runs into a Vibe+ gate.

### What Apple requires once Vibe+ can be bought outside the app and is also sold in it
- **Offer IAP at an equal footing** (3.1.3(b)). The Ninth Circuit lets Apple require that the web button be
  no more prominent than the IAP option, so give them equal size and placement.
- **Add a Restore Purchases control** (3.1.1).
- **Paywall disclosure** (3.1.2(c) and Schedule 2):
  - what Vibe+ gives, the title, the length, and the price;
  - the price must be StoreKit's localized `displayPrice`, not the hard-coded `PLUS_PRICE_LABEL`;
  - auto-renew wording, and links to Terms and Privacy.
  - Reviewers commonly also want a Terms of Use (EULA) link in the App Store metadata (UNVERIFIED as a
    written rule).
- **Account deletion.** Tell the student that "billing will continue through Apple". Link them to
  `https://apps.apple.com/account/subscriptions` or `showManageSubscription`. Scheduled deletion is allowed
  only alongside an immediate option (https://developer.apple.com/support/offering-account-deletion-in-your-app/).
  Today `DELETE /api/me` only knows Stripe (contract.md:171-174).
- **Paid Apps Agreement.** It must be **Active** "to test In-App Purchases in the sandbox". That needs
  banking and tax information. The **first IAP must be submitted with a new app version**
  (https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/).

---

## B. Google Play, US

**Plain English.**
- Google lost its case, and the court's original order now governs.
- US apps may use their own billing, or link to their website, **instead of** Google Play Billing.
- The catch: Google still charges a service fee (10% on subscriptions), even when you use your own checkout.
- The free option: an app that sells nothing inside itself. Google explicitly allows it, even for a paid
  service, and it costs nothing.

### Status
- **Injunction in force.** The Supreme Court refused a stay on Oct 6, 2025
  (https://www.scotusblog.com/2025/10/justices-side-against-google/). Google's US policy changes took
  effect **Oct 29, 2025**, and three programs opened **Dec 9, 2025**. Google now says it "will not require
  the use of Google Play Billing" in the US
  (https://support.google.com/googleplay/android-developer/answer/15582165).
- **Settlement dropped.** Epic and Google proposed a settlement in Nov 2025 and revised it Mar 4, 2026.
  They **withdrew it July 15, 2026**, so the Oct 2024 injunction governs (Android Authority, Jul 15, 2026,
  https://www.androidauthority.com/epic-google-play-store-settlement-withdrawn-3687649/).
- **How long it lasts.** The injunction's term is reported as 3 years (UNVERIFIED end date).
- **Fees since June 30, 2026** (US, EEA, UK), per the Android Developers Blog (June 24, 2026,
  https://android-developers.googleblog.com/2026/06/play-expanded-billing.html):
  - auto-renewing subscriptions: 10% service fee;
  - first $1M a year: 10%;
  - Play Billing adds a **5% billing fee**, so Vibe+ through Play Billing costs 15% in total;
  - alternative billing and external links pay **no billing fee**, only the service fee.

### The US programs (Play Console Help, both pages "last updated" July 22, 2026)

**External content links** (https://support.google.com/googleplay/android-developer/answer/16470497)
- Links may be used "in lieu of or alongside Google Play Billing".
- The fee applies to purchases made within 24 hours of the student following the link: 10% for new
  installs and on the first $1M.
- You must "integrate with the external content links APIs, which surface an information screen", and
  enroll under Play Console > Settings > External content links.
- Links may open "a browser, in a webview or another app store".
- Reporting and payment start **Oct 1, 2026**.

**Alternative billing** (https://support.google.com/googleplay/android-developer/answer/16497028)
- Your own checkout inside the app, "in lieu of or alongside" Play Billing.
- 10% on auto-renewing subscriptions.
- Report each transaction "within 24 hours using alternative billing APIs", starting Oct 1, 2026.
- You must provide support plus order-history, manage-subscription and refund links.

**Baseline Payments policy** (https://support.google.com/googleplay/android-developer/answer/9858738)
- Play Billing is required unless an exception applies, and apps "may not lead users to a payment method
  other than Google Play's billing system" unless they are in a program.
- **Consumption-only** (https://support.google.com/googleplay/android-developer/answer/10281818): "Google
  Play allows any app to be consumption-only, even if it is part of a paid service." It may say "Go to our
  website to upgrade your subscription to Premium", **without a link**.

**Play Billing Library.** New apps and updates need **version 8 or later** by Aug 31, 2026, with an
extension to Nov 1, 2026 (https://developer.android.com/google/play/billing/getting-ready).

### Answers for Google
1. **A web button to Stripe Checkout:** only after enrolling in External content links and building the
   native link APIs. That takes Android-native code; I found no official Capacitor plugin (UNVERIFIED).
   The cost is 10% plus Stripe, which is worse than Play Billing at $3.99.
2. **Stripe Checkout inside the app:** only after enrolling in Alternative billing, with the same 10% and
   24-hour reporting.
3. **No purchase in the app, but web subscribers still get Vibe+:** **allowed and free.** This is the
   right Android answer until Vibe adds Play Billing.

---

## C. If store billing is used

**Plain English.** For each store, the app needs a small native purchase screen. The server needs one new
webhook. RevenueCat is the shortest path: one Capacitor plugin covers both stores, and one webhook can write
the same `entitlements` table that Stripe writes today. Stripe stays exactly as it is.

### Direct integration (no vendor)
- **Apple.**
  - StoreKit 2. Pass `appAccountToken` = the Vibe user UUID at purchase, and Apple returns it on every
    transaction.
  - App Store Server Notifications **V2**: signed JWS payloads, typed events. V1 is deprecated.
  - App Store Server API and Apple's Node server library.
  - Source: https://developer.apple.com/documentation/appstoreservernotifications/app-store-server-notifications-v2
- **Google.**
  - Play Billing Library 8 or later, with `obfuscatedAccountId`.
  - Real-time developer notifications (RTDN) through a Cloud Pub/Sub topic, where Google's service account
    is granted Publisher.
  - Play Developer API `subscriptionsv2` to verify.
  - A payments profile or merchant account.
  - Source: https://developer.android.com/google/play/billing/getting-ready
- **Both need native plugin code in the Capacitor shell.**

### RevenueCat
- **SDK.** `@revenuecat/purchases-capacitor` is official and covers iOS (StoreKit 2 on iOS 16+) and
  Android (https://github.com/RevenueCat/purchases-capacitor).
- **Price.** Free up to $2,500 a month in tracked revenue, then 1% (https://www.revenuecat.com/pricing/,
  fetched 2026-09-24). The webhook docs say webhooks need the Pro plan, and whether Pro is the free tier is
  UNVERIFIED.
- **Webhooks.** They carry `app_user_id`, `store`, `entitlement_ids` and `expiration_at_ms`. They are signed
  with HMAC or a header secret and retried 5 times. RevenueCat recommends re-reading `GET /subscribers`
  after each one (https://www.revenuecat.com/docs/integrations/webhooks).
- **Does it fit Vibe's entitlements table? Yes.**
  - The app configures RevenueCat with the Vibe user UUID as `app_user_id`.
  - A new route `POST /api/billing/revenuecat` verifies the signature and records the event id in
    `billing_events`. It then re-reads the subscriber and upserts `entitlements` with `source='apple'` or
    `'google'` and `provider_ref` = the original transaction id or purchase token.
  - This is the same "always re-fetch" rule Stripe follows (contract.md:26).
  - RevenueCat can also import Stripe subscriptions (https://www.revenuecat.com/docs/web/integrations/stripe),
    but Vibe doesn't need that: Stripe keeps writing the table itself.
- **Schema and logic changes the store leg needs** (a future wave; none of this is done):
  - Add `'google'` to the `entitlements.source` CHECK (migration :146).
  - Widen `billing_events.provider` (contract.md:58).
  - **Precedence rules** for one row per user. Say a Stripe subscriber also buys on the iPhone: the second
    writer must not blank out the first, the same way comp is protected with `skipped_comp`
    (contract.md:30). Hide the IAP paywall when Plus is already active from any source.
  - Handle RevenueCat's "transfer" event (a restore under a different Vibe account moves the
    subscription).
  - Change the account-deletion copy for store subscribers.

### What Vibe keeps from each sale (my arithmetic)
Stripe's rate is 2.9% + 30¢ on domestic cards, plus 0.7% for Billing (https://stripe.com/pricing, fetched
2026-09-24).

| Path | $3.99 / month → Vibe keeps | $24.99 / year → Vibe keeps |
|---|---|---|
| Web, Stripe | ≈ $3.55 | ≈ $23.79 |
| Apple IAP, Small Business Program 15% | $3.39 | $21.24 |
| Apple US web button, today (0% + Stripe) | ≈ $3.55 | ≈ $23.79 |
| Apple web button if the proposed 5% is approved | ≈ $3.35 | ≈ $22.54 |
| Google Play Billing (10% + 5%) | $3.39 | $21.24 |
| Google external link (10% + Stripe) | ≈ $3.15 | ≈ $21.29 |
| Google consumption-only (no link) | ≈ $3.55 | ≈ $23.79 |

- **Small Business Program.** 15% if proceeds are under $1M. The reduced rate starts 15 days after the end
  of the fiscal month in which Apple approves the enrollment, so **enroll before the first sale**
  (https://developer.apple.com/app-store/small-business-program/).
- **Taxes.** With store billing, Apple and Google handle US sales tax as the seller. Stripe here has no tax
  registration (contract.md:19-20). The store-tax part is UNVERIFIED for Indiana specifically.

---

## D. Recommendation for launch (Oct 31) and the /plus screen

**Plain English.**
- Vibe+ can't be sold on the web yet, and Apple won't even let you *test* an in-app purchase until the LLC's
  bank account is connected. So don't try to sell inside the apps for launch.
- Ship both apps with Vibe+ **invisible** to anyone who doesn't have it: no price, no buttons, no "coming
  soon".
- Turn selling on later, one platform at a time, once the bank and the Terms exist.

### Launch scope: what must change inside the apps
1. **Know on the server that the page is inside a store app.** `/plus` picks its state on the server
   (src/app/plus/page.tsx:382), so client-only detection is too late.
   - Suggestion: set Capacitor `appendUserAgent` (for example `VibeApp/1 ios` or `android`,
     https://capacitorjs.com/docs/config) and add a pure `nativeShell(ua)` helper next to the PWA wave's
     `detectPlatform` (handoffs/wave-plan-pwa/plan.md:46).
   - Spoofing it only hides UI, so it carries no security risk.
2. **`/plus` inside the apps shows no price and no plan cards.**
   - It never shows the Subscribe button, the renewal disclosure, the "not on sale yet" price (today shown
     even when signed out or when sales are off, page.tsx:34-38), or any web link.
   - Either send `/plus` to `/campus`, or show status only: "Your Vibe+ is complimentary" for comps, and
     later "Vibe+ is active until {date}".
3. **Hide every upsell in the apps:**
   - PostAudienceList.tsx:88
   - OttoMetrics.tsx:99
   - failure-copy.ts:164
   - public/html/_postViewer.js:1933
   - public/html/_persistence.js:157
   - Gated affordances such as "see who viewed" should be absent for free accounts, not locked with a
     "See Vibe+" dead end.
4. **Belt and braces on the server.** `POST /api/billing/checkout` refuses a request that comes from a store
   shell (a new code, e.g. `store_app`), so flipping `BILLING_ENABLED` on can't make the apps start selling
   overnight without review.
   - This matters because the shells load the live site: a Vercel env change changes app behavior with no
     App Review.
   - `/api/billing/portal` stays open so a subscriber can always cancel (contract.md:163).
5. **Never put `*.stripe.com` in Capacitor `allowNavigation`.** Stripe pages must never render inside the
   app's web view.

### After the bank account and Terms exist (phase 2, per platform)
- **Android first (cheapest).**
  - Consumption-only: in the app, plain text such as "Vibe+ is available at connectvibe.app", with **no
    link**. It costs 0% and needs no enrollment (Google's own example wording).
  - Add Play Billing later if conversion data asks for it.
  - **Skip the external-links program.** 10% plus Stripe is worse than Play Billing at $3.99.
- **iPhone: IAP through RevenueCat.**
  - Sell `vibe_plus_monthly` and `vibe_plus_yearly` at the same $3.99 / $24.99, with a Restore button and
    the 3.1.2 disclosure.
  - Optionally add an **equal-size** "Subscribe on the web" button, US storefront only, opening the default
    browser. It saves about $0.16 a month or $2.55 a year per subscriber today, and less if Apple's 5% is
    approved.
  - Tag Checkout sessions that start in the app (metadata `origin: "ios_app"`) in case the court's rate
    comes with reporting (UNVERIFIED).
  - Give app-started checkouts their own `success_url` that says "You're all set, go back to the Vibe
    app". Safari will usually be signed out, and page.tsx:387 only syncs when a user is signed in; the
    webhook applies Vibe+ anyway.
  - Show the account-deletion "billing continues through Apple" step.

### Lead times (calendar days; hand-offs to James / the bank are the long pole)
| Step | Lead time | Blocked by |
|---|---|---|
| Hide purchase and upsells in the shells (launch scope) | about 1–2 days of code, plus the 375px phone pass | nothing |
| Apple Paid Apps Agreement **Active**: bank and tax info | UNVERIFIED; plan 3–7 days after the bank exists | LLC bank account and EIN (James), org developer account |
| Small Business Program enrollment | apply on day 1; rate starts ≤ about 45 days after approval | developer account |
| First IAP (must ship with a new app version) + App Review | about 7 days including sandbox tests (UNVERIFIED) | an Active agreement |
| RevenueCat + webhook + schema wave | about 3–5 build days (estimate) | none for code; testing needs the agreement |
| Google payments profile + subscription products + RTDN | UNVERIFIED, days | bank account, Play Billing Library 8+ |

### "And more" stores (payments angle only)
- **Amazon Appstore for Android** was discontinued Aug 20, 2025
  (https://developer.amazon.com/apps-and-games/blogs/2025/02/upcoming-changes-to-amazon-appstore-for-android-devices-and-coins-program).
- **Microsoft Store** lets non-game apps "choose their own commerce platform and keep 100% of the
  revenue" (https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/why-distribute-through-store,
  updated 2024-07-23). A PWA listed there could keep Stripe as-is.
- **Samsung Galaxy Store:** not researched (UNVERIFIED).

### Open questions (not settled by primary sources)
- Does App Review in 2026 consistently reject US non-reader apps that link out without IAP? Reports are
  mixed.
- Are in-app web views or SFSafariViewController acceptable for US link-outs after April 2025? The rules
  are silent.
- The district court's final link-out rate. Will it be retroactive? Will it come with a reporting duty?
- The Supreme Court outcome, expected by about June 2027. A reversal could bring back Apple's 2024 link
  rules (27%, default-browser-only, IAP required).
- The end date of the Epic v. Google injunction (reported as 3 years).
- Is RevenueCat's webhook feature available on the free tier?
- Can Google subscription products be created before the payments profile's bank account is verified?
