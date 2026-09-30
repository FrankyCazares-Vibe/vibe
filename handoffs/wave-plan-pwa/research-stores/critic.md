# Store apps — completeness critic and plan (2026-09-24, session 65)

Reader: Franky first, then whoever plans the store waves. I read all five research files, all four
`*.factcheck.md` files (a CORRECTED line beats its research file), `../plan.md`, `../research/critic.md`
and `../critic-w1.md`, and spot-checked the repo (read-only). Precedence for the store work, matching
`plan.md`: **plan.md rulings > this file > a factcheck CORRECTED line > the research file.**
Repo claims are `path:line`. Web claims point at the research file that cites the URL and date.
**UNVERIFIED** = nobody confirmed it from a primary source.

---

## 0. The short version (plain English)

- **The route:** use Capacitor for both stores. The app is a native shell that opens
  `www.connectvibe.app/campus`, so every web deploy updates both apps. Around the page it adds native
  push, links that open the app, the share sheet, haptics, an offline screen and native back. Those are
  what get it past Apple's "that's just a website" rule. There's **nothing for sale inside the apps**
  at launch, and the rating is **18+** on both stores. The only extra store worth adding is the
  **Microsoft Store**, in November.
- **The slow part is paperwork, not code, and it has two problems the research missed.**
  1. The LLC's state record lists its principal office as **"NONE"**.
  2. Nothing on paper says Franky can sign for CONNECTVIBE. LLC.

  D&B, Apple and Google all check the company's name, address and signing authority. **James has to fix
  both today**, before the D-U-N-S request, or every date below moves.
- **Oct 31, honestly:**
  - **Google Play is likely.**
  - **The App Store is possible, not dependable.** It depends on how fast Apple verifies the LLC (2
    days to a month in 2026) and on getting through Apple's "repackaged website" review.
  - **The website and the installable PWA ship on Oct 31 no matter what.** If Apple is late, iPhone
    students get "Add to Home Screen" (or a TestFlight beta link) plus web push until the listing is
    approved.
- **The PWA plan changes but isn't wasted:**
  - Wave 1 stays exactly as planned. It's the iPhone fallback and the Microsoft Store package.
  - Wave 2 (push) comes off hold as one pipeline with two delivery routes: Firebase for the store apps,
    web push for the PWA and desktop.
  - Wave 3's "Add to Home Screen" coaching becomes **"Get the app" store buttons**.
- **Three more things nobody flagged:**
  1. The GitHub repo is **public**, so the app's signing keys need `.gitignore` rules before `mobile/`
     exists.
  2. The Sept 3 decision ("security checks before app-store submission") isn't in any research file.
  3. An Apple reviewer will see a nearly empty campus unless Rylan's first clubs are live by mid-October.
- **Workload:** about 13–15 builder-days of store work, plus push, in the 26 working days left. It fits
  only if the store waves come before any new features.

---

## 1. The recommended route (one answer)

**Capacitor 8 on iOS and Android.** The shell loads the live site
(`server.url: "https://www.connectvibe.app"`, `appStartPath: "/campus"`, `errorPath: "offline.html"`).
Both platforms use one permanent ID, `app.connectvibe.vibe`. Around the page, the shell adds:
- push through Firebase Cloud Messaging (Apple's APNs is reached through Firebase);
- Universal Links and App Links;
- the share sheet and haptics;
- a native offline page;
- iOS swipe-back and the Android back button;
- a ½-day native tab-bar experiment.

**Payments:** no Vibe+ price, button, link or upsell inside either app.
**Accounts:** organization accounts for CONNECTVIBE. LLC on both stores, using one D-U-N-S number.
**Rating:** 18+ on both.
**Other stores:** the Microsoft Store (PWABuilder package of the wave-1 PWA) comes after both phone apps
are submitted. The Samsung Galaxy Store waits until 2027 or never. Skip Amazon, Huawei, Meta Quest and
the Chrome Web Store.
**Fallbacks:** if Capacitor Android slips, a Trusted Web Activity (TWA) built with Bubblewrap. If Apple
slips, the PWA on iPhone.

**Why this and not the alternatives:**
- **It can't be bundled.** Vibe is rendered on the server per request: 147 API routes, `src/proxy.ts`,
  cookie auth. So every realistic shell loads the live site (wrapper-tech §1). Capacitor does that on
  both stores with one bridge, one push route and one "am I in the app" check.
- **The alternatives are worse:**
  - Expo would take about 12–15 days, and stable native tabs need a **preview** SDK (wrapper-tech
    factcheck, correction 2).
  - PWABuilder's iOS template is archived.
  - Commercial wrappers put a vendor between Vibe and the stores.
- **Why Capacitor beats a TWA on Android** (play-and-more recommends the TWA):
  - A TWA runs Vibe inside the student's *default browser*. Notification delegation works only in Chrome,
    Brave and Vivaldi, **not Samsung Internet** (play-and-more factcheck #29). Samsung phones are a big
    share of Android.
  - A TWA would need a second push route (web push) and a second "in the app" mode at launch.
  - It can't use the share sheet or other native plugins.
  - Capacitor Android costs about one extra day over iOS: installing Android Studio plus Gradle.
  - The TWA stays the 1-day fallback. Moving from TWA to Capacitor later is an update under the same
    package name and signing key.
- **Why Firebase for push:** one sender, one token type, and one failure map for both phones. It's
  testable on the Android emulator **before any store account exists**. Direct APNs would need an
  HTTP/2 client in Vercel functions (UNVERIFIED) and a second sender.

---

## 2. Critical path to approved listings

**Plain English.** Every date hangs off the D-U-N-S number. That hangs off James fixing the LLC's
address and Franky's authority. Code runs alongside and isn't the long pole unless the legal pages slip.
Dates assume the D-U-N-S request goes in by **Fri Sep 25**. Each business-day wait is converted to
calendar days.

| # | Step | Owner | Lead time | Start by | Target done |
|---|---|---|---|---|---|
| 1 | **Paper identity.** Pick the public business address: the INBiz principal office is "NONE" (memory `project_team`); D&B, the Apple seller record and the Play payments profile must all match it. Put in writing (one line, the lawyer can do it) that Franky may bind CONNECTVIBE. LLC to developer agreements. apple-review §E assumed he's a member, which isn't on record | James (+ lawyer) | 0–2 days; INBiz amendment time UNVERIFIED | **Thu Sep 24** | Fri Sep 25 |
| 2 | A mailbox on connectvibe.app that provably receives mail (franky@, help@). Send a real test; help@ has never carried one (S64 §11) | Franky | hours | Sep 24 | Sep 24 |
| 3 | **D-U-N-S** through Apple's lookup tool, signed in as the future Account Holder. Never the free D&B web form (≤30 business days) | Franky; James answers D&B | 0 if listed; else 5+2 business days ≈ 11 calendar days | **Fri Sep 25** | Mon Oct 5–Tue Oct 6 |
| 4 | Landing page names the LLC; drop "vibe · prototype / early access" (`src/components/landing/home-landing.tsx:229-230`); footer links to Terms, Privacy, Guidelines, Support. Apple checks for a real org website | Franky | 1 day | Sep 25 | Sep 28 |
| 5 | Company Google account → Firebase project (free) + Search Console DNS verification of connectvibe.app. The same account must own Play (play factcheck C1) | Franky | hours | Sep 24 | Sep 25 |
| 6 | **Apple Developer Program, organization, $99**, via the Apple Developer app (supported for orgs, apple factcheck #35); take Apple's call | Franky = Account Holder; James reachable | 2–30 days | the day D-U-N-S shows (~Oct 5) | **Mon Oct 12–Wed Oct 14** |
| 7 | **Play Console org:** payments profile (name + address = D&B) → $25 → ID + org document → phone/email codes → website check | Franky; James (documents) | 1 day + 2–7 days (UNVERIFIED) | ~Oct 5 | Oct 8–13 |
| 8 | Build: store waves S1–S3 + push waves (§6–§7). Simulator/emulator only until 6 and 7 are done | Franky (agents) | ~13–15 builder-days | Sep 25, after wave 1 lands | Oct 14 |
| 9 | **Legal publish.** Terms: 24 h review, zero tolerance, LLC name, 18+, Marion County. Privacy: Sentry, Resend, Stripe, Firebase/APNs, push tokens, camera/photos, "equal protection" | James + lawyer; Franky ships | **unknown**: the biggest unknown after Apple | Sep 24 (send the store deltas) | Oct 14, before any submission |
| 10 | Pre-store security gate (decision of Sept 3): both sentinels, Sentry URL scrub, write throttles, proxy-trusted client IP, CSP report-only; pentest on the **local** stack | Franky | 2–4 days | Oct 5 | Oct 14 |
| 11 | Two review accounts (service-role seed, a **production write**, Franky's yes) + Rylan's first clubs live with posts and events | Franky; Rylan | 1 day; clubs ongoing | Oct 9 | Oct 14 |
| 12 | Link files live: the Apple file needs the Team ID, `assetlinks.json` needs the Play signing SHA-256. Publish ≥7 days before launch (propagation) | Franky | ½ day + 7 days | when 6 and 7 finish | **Fri Oct 23 latest** |
| 13 | Play: internal test → production, managed publishing | Franky | ≤7 days per round | Oct 12–14 | ~Oct 21 (Oct 28 after one rejection) |
| 14 | Apple: TestFlight internal the same day → App Review (manual release). Book the 30-min consultation | Franky | 1–7 days per round; plan 2 | the day 6 clears | ~Oct 23–30 |
| 15 | Listings: names, screenshots (seeded local accounts only), privacy label + Data safety, age 18+, review notes + a 60–90 s video | Franky + Rylan | 1–2 days | Oct 9 | Oct 14 |
| 16 | Release both; landing store buttons switch on by env | Franky | 0 | — | **Sat Oct 31** |

**Last safe submission, both stores: Fri Oct 16.** That leaves room for one worst-case round:
7 days of review, 1 day to fix, 7 more days. With September's typical Apple times (about 11 hours,
Runway, per apple-review §G), Oct 24 still works. Note that Oct 14 is a Wednesday; apple-review's
"Tue Oct 14" is off by a day.

### The Oct 31 verdict

- **Google Play: likely.** If the D-U-N-S request goes in by Sep 25 and the address is settled, the
  listing is approved around Oct 14–21, with a week to spare for one rejection.
- **Apple App Store: possible, not dependable.** It needs enrollment cleared by about Oct 14. 2026
  reports run from a few days to a month, and forum 817247 was an individual account, which weakens the
  "enroll as Franky" hedge.
- **Apple's rule 4.2 is the other risk.** A Capacitor app with a share sheet was rejected twice in
  Jan 2026 (forum 812889). Count on at least one rejection round.
- **Decision date: Fri Oct 9.** If Apple hasn't moved on enrollment by then, switch the iPhone plan to
  the fallback. Keep building the iOS app regardless.

**Fallback if Apple is late:**
1. **Enrolled, but not approved by ~Oct 28.**
   - Put an external TestFlight public link behind the landing's iPhone button ("Try the iPhone beta").
   - TestFlight builds pass Beta App Review in about a day. Whether that review is as strict as the full
     one is UNVERIFIED.
   - Students need the TestFlight app. Builds expire after about 90 days (from memory, UNVERIFIED).
2. **Not enrolled.**
   - The iPhone button shows the "Add to Home Screen" steps and "App Store: coming soon".
   - iPhone notifications go through web push. This is why push wave 2 keeps the web-push sender.
3. **Either way:** Rylan's teasers must not promise "on the App Store Oct 31" until the listing is
   approved and waiting in "Pending Developer Release".

---

## 3. Contradictions between the files, and the resolution

| # | Contradiction | Resolution |
|---|---|---|
| X1 | **Android wrapper:** wrapper-tech D2 says Capacitor; play-and-more D3 says TWA | **Capacitor** (§1). TWA = the 1-day fallback, under the same package name |
| X2 | **Android push:** play-and-more §3.3 says web push through TWA delegation; wrapper-tech §4.2 says FCM | **FCM for both store apps.** Web push only for the PWA and desktop (§6, wave 2) |
| X3 | **Supreme Court scope:** wrapper-tech factcheck #3 says cert was granted "on both questions"; payments factcheck #15 and apple factcheck #11 say "limited to Question 1" | **The docket wins: limited to Question 1** (supremecourt.gov 25-1311, per payments factcheck). No effect on launch |
| X4 | **Apple commission on web links today:** wrapper-tech factcheck says "disputed"; payments factcheck #17 says 0% | **0% today.** The district court hasn't set a rate, and Epic's 60-day clock hasn't started. Moot: no selling in the apps |
| X5 | **Apple schedule:** apple-review has submit Oct 15–16 and two rounds; wrapper-tech has submit by Oct 20 and one 3–5-day round | **Two rounds; last safe submit Fri Oct 16** (§2) |
| X6 | **Messaging and chat give 13+** (apple-review §D) | **CORRECTED** (apple factcheck #28): messaging is 4+; the social-media capability gives 13+. 18+ is chosen anyway |
| X7 | **Xcode:** both files say 26.4.1; apple factcheck #40 says Xcode 27 shipped and to "start new work on 27" | **Build v1 on the installed 26.4.1.** Uploads accept it until April 2027, and Capacitor 8 on Xcode 27 is UNVERIFIED. Move to 27 after launch |
| X8 | **Android back:** wrapper-tech §4.6 says the app exits when it can't go back | **CORRECTED** (wrapper factcheck #6): it does nothing. The bridge registers `backButton`: `goBack()` if it can, else `App.exitApp()` |
| X9 | **D-U-N-S wait:** "≤7 business days" (apple, wrapper) vs "up to 30 days" (Google page, play) | Both are true for different routes. **Apple's tool (5+2 business days); the same number serves Google, Microsoft and Samsung.** Never the free D&B form |
| X10 | **"Enroll as an individual, it's faster"** (apple-review §E) | Weak (apple factcheck #34: the slow 2026 cases *were* individuals). It also puts Franky's legal name on the store, and moving the app to the LLC later is UNVERIFIED. A last resort only, decided Oct 9 |
| X11 | **Apple roles:** Admins need a grant for keys; App Managers upload | **CORRECTED** (apple factcheck #36): Admins create keys and upload by default; App Managers need Certificates, Identifiers & Profiles access to upload. James = Admin, Rylan = Marketing + Customer Support |
| X12 | **Play website verification** "not required" (play §1) | **CORRECTED** (play factcheck C1): required. Do it from the company Google account that owns Play; it approves automatically |
| X13 | **Microsoft Store needs an Entra tenant** (play §4) | **CORRECTED** (play factcheck C2): optional. It does need a work email **on connectvibe.app** |
| X14 | **Android developer verification: check in November** (play step 18) | **CORRECTED** (play factcheck C3): the package is auto-registered when the app is created in Play Console. Check that day |
| X15 | **Universal Links / App Links:** "later" (repo-readiness B16) vs v1 (wrapper-tech §4.3) | **v1.** Two files and an entitlement; they count toward 4.2; they need 7 days to propagate. The 8-digit code stays the lead |
| X16 | **"In the app" signal:** a TWA referrer `android-app://` (play §2.11) vs a user-agent token (wrapper §4.7, repo-readiness §f) | **The user-agent token** `VibeApp/1 (ios\|android)` via `appendUserAgent`, plus `window.Capacitor` on the client. One pure helper, readable by the server |
| X17 | **Package name:** `app.connectvibe.vibe` (wrapper D1) vs `app.connectvibe.android` (play §3.4) | **One ID on both:** `app.connectvibe.vibe`. It's permanent, so Franky confirms it (§5, D8) |
| X18 | **Engineering size:** "~7 days to first TestFlight" (wrapper §6) vs "10–14" (apple checklist #5) | wrapper-tech's 7 leaves out repo-readiness's work: dead ends, reports, public pages, Vibe+ branches, the demo seed (~6–8 days). **Plan 13–15 builder-days** |
| X19 | **Where the store apps sit in time:** `docs/ROADMAP.md:38` has them Nov–Dec, after launch; plan.md D3 and the Sept 21 launch plan put native first | **D3 wins** (newest). Update the roadmap line at the next journal/handoff |
| X20 | **Utah's date:** 2027-05-06 (apple) vs May 7, 2027 (play) | Use the statute's 2027-05-06 (apple factcheck #5, le.utah.gov). Not a launch item |
| X21 | **Indiana HB 1408 in effect:** 2027-01-01 (apple) vs possibly 2026-07-01 (play factcheck U1) | Lawyer question. The $1B-revenue threshold almost certainly excludes Vibe either way |
| X22 | **The iPad gets the desktop tree** (repo-readiness B14) | With an **iPhone-only** build, an iPad runs the app at iPhone size, so the phone tree should render (reasoning, UNVERIFIED). Keep device test N9 |

---

## 4. What every research file missed

1. **The LLC has no address on record** (INBiz principal office "NONE", memory `project_team`). A
   D-U-N-S number, Apple's seller record and the Play payments profile all need one that matches. Play
   also shows a public developer email and phone. Step 1 of §2.
2. **Signing authority.** apple-review §E says "Franky, as a member, qualifies". The LLC was filed by
   James, and "formalities are deliberately untouched" (memory `project_launch_plan`). Apple verifies the
   enroller's authority and may call. A one-line written authorization from James fixes it. What exactly
   Apple accepts is UNVERIFIED.
3. **The repo is public** (`gh api repos/FrankyCazares-Vibe/vibe` → `"private": false`), and `.gitignore`
   has no rules for keystores or keys. Before `mobile/` exists:
   - ignore `*.jks`, `*.keystore`, `*.p8`, `*.mobileprovision`, `google-services.json`,
     `GoogleService-Info.plist`;
   - keep the upload keystore and the APNs `.p8` only in the founders' password manager;
   - restrict the Firebase API keys to the app IDs.
4. **The Sept 3 pre-store security gate** (memory `project_security_sequencing`; `docs/ROADMAP.md:42`):
   CSP, throttles, a trusted client IP, a Sentry scrub and a live pentest. None of the five files carries
   it. Its "pentest a Vercel preview" collides with a fact the PWA critic already established: **Preview
   shares the production database** (`../research/critic.md` C4, C9). So pentest the local Docker stack.
5. **An empty campus fails the "useful app" bar.** Only SAE is a real club; S64 counted 21 posts and 20
   accounts. The review account's campus needs Rylan's first signed clubs, with their events, by about
   Oct 12. Seed only the two review accounts, never fake students.
6. **The live site *is* the app.** A Vercel deploy or env change alters both store apps with no review.
   House rule from now on:
   - nothing that sells, and nothing that changes the app's main purpose, ships without a new store
     build and review;
   - `/api/billing/checkout` refuses requests from the store apps (payments §D.4).
7. **Store-app look gaps:**
   - The app isn't "standalone", so R17's cream background never matches inside it, and the edges and
     bounce show white. Needs Capacitor `backgroundColor` plus an app class.
   - Icons: App Store 1024 px opaque; Play 512 px + a 1024×500 feature graphic. Extend the icon script.
   - The Android status-bar icon must be white on transparent. `badge-mono-96.png` can seed it.
8. **New personal data and vendors:**
   - **Firebase (Google) is a new sub-processor.** Device push tokens become "Identifiers" on Apple's
     label and in Data safety.
   - The Sept 7 privacy draft says "no camera … or push" (repo-readiness §a3). The lawyer needs this
     delta.
9. **Credential hygiene carries over from PWA critic C4.** The FCM service-account key is
   **Production-only and Sensitive**. Use a separate Firebase project (e.g. `vibe-dev`) on the local
   stack, and never give Firebase keys to Preview.
10. **The Account Holder must accept every new Apple agreement revision**, or submissions stop. That goes
    to Franky's Apple Account email; watch it.

---

## 5. Franky's decisions

**Plain English.** These are product and money calls. Each has options, a recommendation and the
reason. D1–D4 and D7 unblock work this week. D6 and D10 need the lawyer or a policy call before
submission.

**D1. Android wrapper.** (a) Capacitor, same as iOS; (b) a TWA built with Bubblewrap.
→ **(a).** One bridge, one push route, one "in the app" mode, and it works on Samsung phones whatever
the default browser. (b) stays the 1-day fallback (§1).

**D2. Vibe+ inside the store apps.**
- Options:
  - (a) invisible at launch: no price, no button, no link and no upsell; the server refuses checkout
    from the apps;
  - (b) iOS US-storefront "Subscribe on the web" link;
  - (c) Apple in-app purchase + Play Billing now.
- → **(a).** Production can't sell Vibe+ anywhere until the bank exists (`contract.md:28-29`), and
  Apple won't let anyone *test* an in-app purchase until its Paid Apps Agreement is Active, which also
  needs the bank (payments factcheck #20).
- (b) is legally in flux. Apple's guideline text still expects IAP to be offered alongside the link.
- **After the bank exists:**
  - iOS: Apple IAP through RevenueCat (free under $2,500 a month in revenue, webhooks included;
    payments factcheck #37). Optionally add an equal-size US web button.
  - Android: consumption-only first (0%: the app may *say* "available at connectvibe.app", with no
    link). Add Play Billing later.
  - Skip Google's external-links program: 10% plus Stripe keeps less than Play Billing's 15%.
- Enroll in Apple's Small Business Program before the first sale.

**D3. Push in the store apps.**
- Options:
  - (a) Firebase Cloud Messaging for both apps (`@capacitor-firebase/messaging`), plus web push for
    the PWA and desktop;
  - (b) `@capacitor/push-notifications` with direct APNs + FCM (two native senders + web push);
  - (c) web push only.
- → **(a).** (c) is impossible: WKWebView and Android WebView have no Push API (wrapper factcheck #36).
  (a) gives the phones one sender and can be tested on the Android emulator before any store account
  exists.
- Web push stays because it's the iPhone fallback if Apple is late.

**D4. Where the code lives.** (a) a `mobile/` folder in this repo, with its own `package.json`, not a
workspace, and excluded from `tsconfig`, eslint and Vercel; (b) a separate private repo.
→ **(a).** The web code and the shell change together (the in-app check, the link files, the
device-token route), and one agent sees both sides.
- The repo is **public**, so add the `.gitignore` rules first (§4.3).
- The native project holds nothing secret once keys are ignored. It can move to its own repo later
  without touching the store listings.

**D5. Which "more" stores.**
- Options: (a) Microsoft Store in November; (b) Microsoft Store before Oct 31 if both phone apps are
  already submitted; (c) Samsung Galaxy Store too; (d) none.
- → **(a), and (b) only if slack appears.**
- Why the Microsoft Store is cheap:
  - It's free for companies since May 2026.
  - PWABuilder packages the wave-1 PWA.
  - It needs a connectvibe.app work email.
  - Certification takes ≤3 business days.
  - Non-game apps keep their own checkout, so Stripe stays.
- Samsung needs commercial seller status and adds little, since every US Galaxy phone has Play: 2027
  or never.
- Amazon, Huawei, Meta Quest and the Chrome Web Store don't reach IU or Purdue students.

**D6. Age rating and verification.**
- Options:
  - (a) 18+ on both stores (Apple: choose the higher 18+ rating; Play: "18 and over" as the only group
    + Restrict Minor Access); the Terms stay 18+ (`src/lib/legal/terms.ts:2`); 17-year-old freshmen
    wait;
  - (b) open to 16–17 (rewrite the Terms and Privacy, meet the teen content rules, take on
    parental-consent flows).
- → **(a).** It matches today's Terms and Privacy. Fizz, a comparable college app, is 18+, and a Nov 2025
  reviewer demanded 18+ (apple §B). The Families policy never applies.
- **Lawyer question (James):** Texas SB 2420 is in force for new Texas Apple Accounts, and Apple says
  18+ apps must still check age "where legally required" (apple factcheck #4). Plan to add Apple's
  Declared Age Range (iOS 26+) and Play Age Signals in v1.1, or at launch if the lawyer says so.
- Rylan should know that 17-year-olds are out for now.

**D7. Who enrolls with Apple.**
- Options:
  - (a) Franky is Account Holder, with James's written authorization;
  - (b) James is Account Holder (he filed the LLC) and Franky is Admin;
  - (c) Franky enrolls as an individual.
- → **(a).** The Account Holder accepts every agreement and owns the keys, and Franky builds. If the
  authorization can't exist by Sep 25, switch to (b) rather than wait.
- (c) is a last resort (X10).

**D8. Permanent IDs and names.**
- The ID is `app.connectvibe.vibe` on both stores. It can never change, and a later Expo or native app
  ships as an update under it.
- The store name is chosen when the record is created. "Vibe" alone is probably taken (UNVERIFIED), so
  have fallbacks like "Vibe: Campus" ready (decide with Rylan).
- Apple shows the seller as "CONNECTVIBE. LLC"; that's fixed. The Play developer name can be "Vibe".

**D9. Review accounts.** (a) a scripted, re-runnable service-role seed of two accounts, a reviewer and
a "friend" (a production write); (b) a company-owned `@iu.edu` alias (UNVERIFIED that one exists); (c)
Apple's demo mode (needs prior approval, and Google has no equivalent). → **(a).** Mark both accounts
"do not restrict" in the admin desk, and re-run the seed before every submission, since the reviewer
may delete one.

**D10. The Sept 3 pre-store security gate.** (a) keep it whole: both sentinels, Sentry scrub,
throttles, trusted client IP, CSP report-only, pentest; (b) trim it to sentinels + Sentry scrub and move
the rest to November. → **(a), with the pentest on the local stack**, never Preview (§4.4). Students
arrive on Oct 31 through the web anyway, so this protects them whichever door they use.

**Smaller calls:**
- iPhone-only v1: yes.
- Native tab-bar spike: ½ day, yes. If it fights the Next router, keep the web tab bar.
- Build on Xcode 26.4.1: yes (X7).
- A founder named as the child-safety contact in Play Console: Franky, with help@ routed to him.

---

## 6. How this changes the PWA waves (`../plan.md`, `../research/critic.md`)

**Wave 1 (in flight): keep every batch. Don't change the contract mid-wave.**
- **1A (manifest, icons, head): keep.** The manifest serves four things: desktop install, the Android
  Chrome install, the iPhone fallback, and the Microsoft Store package. Two follow-ups:
  - Wave 3′ adds `related_applications` (Play ID) and leaves `prefer_related_applications` out.
  - S3A renders the store icons (App Store 1024 px opaque; Play 512 px + the 1024×500 feature graphic)
    from the same `src/app/icon.svg`.
- **1B (worker, registrar): keep.**
  - The iOS web view has no service worker, so the registrar skips itself there.
  - **The Android web view would register it**: the hostname matches, and in the store app it would
    then take over offline from Capacitor's `errorPath`. S2A adds "skip inside the store app".
  - `install-prompt.ts` stays: `beforeinstallprompt` never fires inside a web view.
- **1C (proxy, headers, checker): keep.** S3D later adds `\\.well-known/` to the matcher
  (`src/proxy.ts:325`) and the Apple link file's JSON header in `next.config.ts`, after wave 1 merges.
- **1D (static desktop pages): keep.** The store apps are phone-only.
- **1E (detection, copy): keep, with one contract addition.**
  - `Platform` gains `"ios-app" | "android-app"`, checked **first**.
  - Today a Capacitor iPhone user agent falls through to `"ios-safari"`
    (`src/lib/pwa/display-mode.ts:124`), and an Android web view to `"android-other"` (`:127`).
  - It's harmless until wave 3 reads it. If 1E hasn't passed review, add the two values and a
    `/VibeApp\//` first rule now (~10 lines); otherwise S2A does it.
  - The R16 standalone copy correctly doesn't fire inside the store app.
  - R17's cream background has to be extended to the app (S2B).

**Wave 2 (push): take it off hold once D3 is answered, and make it transport-agnostic.** Everything in
`../research/critic.md` C1–C18 and plan R13–R14 stands. The changes, batch by batch:

- **2A migration.** One table, `push_devices` (it replaces `push_subscriptions`):
  - `transport` CHECK in (`webpush`, `fcm`);
  - `address` UNIQUE (the endpoint or the FCM token);
  - `p256dh` and `auth` required only when `transport = 'webpush'` (a CHECK);
  - `platform` (`ios-app` | `android-app` | `ios-pwa` | `android-pwa` | `desktop`);
  - `app_version`, and `origin` (web push only).

  Everything else stays as planned: `push_outbox` (one row per recipient, not per device), the trigger,
  the claim RPC, service-role only, code before the migration, production with Franky's yes.
- **2B registration routes.**
  - The web route stays.
  - Add `src/app/api/me/device-token/route.ts`:
    - POST upserts by token and re-points `user_id`;
    - DELETE removes the caller's token;
    - rate-limited, with the same production/localhost guard as C4.
  - The logout route accepts `{endpoint}` or `{token}`.
  - Both DELETEs go on `restrictedApiAllowed`.
- **2C senders.**
  - `send-webpush.ts`: as planned, `web-push` 3.6.7.
  - New `send-fcm.ts`: FCM HTTP v1, with an OAuth token signed with `node:crypto` from the service-account
    key, so no new dependency.
  - FCM failures: an unregistered or invalid token is deleted; 429 and 5xx back off; an APNs-auth error
    alerts. Verify the error codes against Firebase's docs at build time (UNVERIFIED here).
  - Env: `FCM_SERVICE_ACCOUNT_JSON` is Production-only and Sensitive; local uses a dev Firebase project.
- **2D payload.** The builder makes one neutral message (`kind`, `title`, `body`, absolute `url`, `tag`,
  `badge`). Two encoders turn it into each shape:
  - `toWebPush()`: exactly R13.
  - `toFcm()`:
    - `notification` holds the title and body;
    - `data` values are all strings, including `url`;
    - Android: a `channel_id` of `messages` or `activity`;
    - APNs: `aps.badge`, `thread-id`, and a hashed collapse id (≤64 bytes, from memory, UNVERIFIED).

  The D1/D2 wording and every send-time safety check (C6) are unchanged.
- **2E writer kicks:** unchanged.
- **Test order:**
  - FCM end to end on the Android emulator against the dev Firebase project. This needs no store
    account.
  - Web push on local Chrome.
  - Then production, dark, behind `PUSH_ENABLED` plus the founder allowlist (D6), same as before.

**Wave 3 (what students touch): coaching becomes store buttons.**
- **3A Settings card:**
  - It knows which delivery route it's on. Inside the store app it shows a native on/off switch and no
    "Add to Home Screen" or Install button.
  - Add a "Get Vibe on your phone" card, with a QR code on desktop (repo-readiness §d).
- **3B client push:**
  - `push-client.ts` (web) and a new `src/lib/native/push-native.ts` sit behind one `turnOn()` /
    `turnOff()`.
  - A tap on a notification opens `data.url`, after an origin check (as R14).
  - `leaveDeviceClean()` also deletes the FCM token on the server and on the phone.
- **3C other sign-out paths:** unchanged.
- **3D install coaching → "Get the app":**
  - The Campus install banner and the full coach are **dropped** (plan D3).
  - What remains:
    - a post-tour Campus card;
    - the Smart App Banner `<meta name="apple-itunes-app">` once the App Store ID exists;
    - manifest `related_applications`;
    - the iPhone "Add to Home Screen" steps sheet, shown **only while** `NEXT_PUBLIC_APP_STORE_URL` is
      unset (the Apple-late fallback);
    - "Open in Safari first" for Instagram and TikTok in-app browsers.
  - The landing badges and `/get` move earlier, to S1D.
- **3E contextual asks:** "Know when they reply" asks for native push inside the app. In mobile Safari
  it opens the "Get the app" sheet.

**Wave 4:**
- 4A update toast: **keep**. Long-lived web-view pages go stale too.
- 4B manifest screenshots: **drop for launch**. Store screenshots (S4) replace them.
- 4C reset code: **optional, lower**. App Links open the reset link inside the app.
- 4D runbook: **add** `mobile/README.md` (build, sign, upload) and the store runbook.
- Launch gate: add device checks N1–N10 (wrapper-tech §8) on both platforms.

---

## 7. Store engineering waves (4–5 batches each; one owner per file)

Order: wave 1 (now) → **S1 and S3A–C in parallel** (the files don't overlap) → wave 2′ → **S2** →
wave 3′ + **S3D** → **S4** → wave 4. Same rules as always: implement → adversarial review → repair,
Writes and Edits ≤150 lines, a 375 px pass as a non-admin, and no production writes without Franky.

| Wave | Batch | Owns | Job |
|---|---|---|---|
| **S1 Reviewer-ready web** | S1A Report everywhere | `src/app/campus/campus-home.tsx` (ranged edits at `EventCard` :8556), `src/app/orgs/[handle]/page.tsx`, `src/app/orgs/[handle]/OrgEventsSection.tsx` | Report on events: the sheet supports it (`src/components/safety/ReportSheet.tsx:67`) but no button sends it. Report on club-page posts (`page.tsx:939-1030`) |
| | S1B Block holes + hide on report | `src/app/api/posts/[id]/comments/route.ts`, `.../save/route.ts`, `.../repost/route.ts`, `src/app/api/me/reports/route.ts`, `src/app/api/feed/route.ts` | Blocked users can't comment, save or repost (S64 §11; the comments route has no block check today). A reported post disappears from the reporter's feed |
| | S1C Dead ends | `src/app/auth/school-email/page.tsx`, `src/components/mobile/onboarding/OnbHeader.tsx`, `src/app/account/suspended/suspended-actions.tsx` | Sign out and Delete on the unverified screen (only "← back" today). After deletion, go to `/auth/signup`, not the landing |
| | S1D Public pages + landing | `src/app/support/page.tsx`, `src/app/legal/delete-account/page.tsx`, `src/components/landing/home-landing.tsx`, `src/app/get/route.ts` | Support URL (Apple) and deletion URL (Play). Footer names CONNECTVIBE. LLC with legal links; drop "prototype". Store badges from env, without `data-warp-trigger` (`:74-96`). `/get` redirects by user agent |
| | S1E Review kit | `scripts/seed-review-accounts.mjs`, `src/lib/sentry-config.ts`, `docs/stores/review-notes.md` | The seed runs dry by default; local first, production only with Franky's yes. Scrub `/profile/<handle>` in Sentry URLs. Review-notes template listing the native features in plain words |
| **S2 App mode in web code** | S2A Detection | `src/lib/native/detect.ts` (+ `.test.ts`), `src/lib/native/server.ts`, `src/lib/pwa/display-mode.ts` (+ test), `src/components/pwa/ServiceWorkerRegistrar.tsx` | Pure `detectAppShell(ua)` → `ios-app` / `android-app` / null. A server reader via `headers()`. App values first in `detectPlatform`. The registrar skips inside the app |
| | S2B Bridge | `src/lib/native/bridge.ts`, `src/components/native/NativeBridge.tsx`, `src/app/layout.tsx`, `src/app/globals.css` | A thin typed wrapper over `window.Capacitor` (whether plugin packages are needed in the web bundle: settle in a spike). Link opens with an origin check; Android back = `goBack` else `exitApp`; status bar; same-origin new windows stay in the app; cream background in app mode |
| | S2C Store-safe Vibe+ | `src/app/plus/page.tsx`, `src/app/plus/PlusActions.tsx`, `src/components/otto/OttoMetrics.tsx`, `src/components/posts/PostAudienceList.tsx`, `src/lib/feedback/failure-copy.ts`, `src/app/api/billing/checkout/route.ts` | In the app: no price (`page.tsx:588-592` prints it even when selling is off), no button, no upsell; status only for comp or active. Checkout refuses app requests (`store_app`); the portal stays open |
| | S2D Web-view hazards | `src/components/mobile/ResumeViewerMobile.tsx`, `src/lib/feedback/request.ts`, `src/app/auth/signup/page.tsx`, `src/app/auth/terms/accept-terms-form.tsx`, `src/components/mobile/PostViewerMobile.tsx`, `src/components/mobile/onboarding/StepPeople.tsx` | Hide "Open file" in the app. `.ics` via the Filesystem + Share plugins, or hide it. Legal links in an in-app sheet. Native share sheet |
| **S3 Native shell** | S3A Scaffold + hygiene | `mobile/package.json`, `mobile/capacitor.config.ts`, `mobile/www/*`, `mobile/resources/*`, `mobile/README.md`, `.gitignore`, `.vercelignore`, `tsconfig.json`, `eslint.config.mjs` | Capacitor 8.5.2 pinned; `appendUserAgent` `VibeApp/1 (ios\|android)`; no `allowNavigation` (and never `*.stripe.com`). The key-ignore rules land **first**. A dev config pointed at the Mac's LAN `next dev` + local Supabase |
| | S3B iOS | `mobile/ios/App/App/{AppDelegate.swift,MainViewController.swift,Info.plist,PrivacyInfo.xcprivacy,App.entitlements}` | Swipe-back; Firebase push hooks; camera, photo-library and microphone purpose strings; `ITSAppUsesNonExemptEncryption` NO; privacy manifest; iPhone-only |
| | S3C Android | `mobile/android/app/src/main/AndroidManifest.xml`, `mobile/android/app/build.gradle`, `mobile/android/app/src/main/res/**` (notification icon) | `autoVerify` link filters for www only; `POST_NOTIFICATIONS`; notification channels; the white-on-transparent status icon; `google-services` plugin |
| | S3D Link files (needs the Team ID + Play SHA-256) | `public/.well-known/apple-app-site-association`, `public/.well-known/assetlinks.json`, `src/proxy.ts`, `next.config.ts` | Claim the paths in wrapper-tech §4.3; exclude `/`, `/legal/*`, `/api/*`. Matcher skips `.well-known`; JSON content type; no redirects. Live **by Oct 23** |
| **S4 Submission kit** | non-code + assets | `docs/stores/*`, store screenshots from seeded **local** accounts | App Privacy label + Data safety (apple §C, repo-readiness §c), age forms (D6), review notes + video, internal tracks, device pass N1–N10 |

---

## 8. Do today (Thu Sep 24)

1. **James:** choose the LLC's public business address and plan the INBiz update. Send Franky the exact
   legal name and address, plus a one-line authorization for Franky to sign developer agreements (D7).
   Email the lawyer the store deltas: 18+, Texas SB 2420, zero tolerance, 24 h, Firebase, push, camera.
2. **Franky:** get a working `@connectvibe.app` mailbox and send a real test to help@. Make the company
   Google account → Firebase project + Search Console TXT record. Look up the D-U-N-S in Apple's tool
   and request one if it's missing (by Fri Sep 25 at the latest).
3. **Franky:** answer D1–D4 and D7 so wave 2 comes off hold and S1 and S3 can start the moment wave 1
   lands. Confirm the permanent ID `app.connectvibe.vibe` (D8).
4. **Franky:** drop "prototype" from the landing footer and name the LLC. Apple looks at the website.
5. **Rylan:** aim the first signed clubs at having real posts and events up by about Oct 12 (the
   reviewer's campus). Don't promise an App Store date in the teasers.

## Repo spot-checks behind this file (read-only, 2026-09-24)
- `src/lib/pwa/display-mode.ts:111-128`: no store-app branch; a WKWebView user agent returns
  `ios-safari`.
- `src/proxy.ts:325`: the matcher skips `sw.js`, `offline.html` and the manifest, not `.well-known`.
  `public/.well-known/` doesn't exist.
- `package.json`: no Capacitor, Firebase or `web-push` yet.
- `src/lib/legal/terms.ts:2`: `MIN_AGE = 18`.
- `src/app/plus/page.tsx:588-592`: prices render.
- `home-landing.tsx:229-230`: "prototype".
- `next.config.ts:30-32`: the apex domain redirects permanently to www.
- `src/components/safety/ReportSheet.tsx:67`: supports `event`; no caller sends it.
- `src/app/api/posts/[id]/comments/route.ts`: no block check.
- `src/app/auth/school-email/page.tsx`: "← back" only; no sign-out or delete.
- `gh api repos/FrankyCazares-Vibe/vibe`: `"private": false`.
- `docs/ROADMAP.md:38,42`: store apps were scheduled Nov–Dec, plus the pre-store security list.
