# Store apps: what Apple/Google reviewers and a WebView shell will hit in Vibe as built

Research pass, 2026-09-24. Read-only. Repo: `main` @ 9c0e645. **The PWA wave 1 is editing the working tree
right now** (`next.config.ts`, `src/proxy.ts`, `public/html/{profile,messages,onboarding}.html`, new
`public/icons/`, `public/html/_sw.js`), so line numbers for those files are quoted from `HEAD`.
Repo claims are `path:line`. Web claims carry a URL and the date I read it (2026-09-24; most pages show no
publish date). Anything I could not confirm is marked **UNVERIFIED**. Nothing here was run on a phone.

## TL;DR (plain English)

1. **Account deletion works on a phone** — Profile tab → gear → Settings → Danger zone → type your handle →
   Permanently delete. It cancels Stripe, deletes files, deletes the account. **One dead end:** someone who
   signed up but never verified a school email is stuck on "Verify your campus" with no sign-out and no
   delete button. That is exactly where an Apple/Google reviewer without an .edu address lands.
2. **A reviewer cannot get in on their own.** Every main tab needs a verified `@iu.edu` or `@purdue.edu`
   address. We must hand both stores a ready demo account (verified, Terms accepted, onboarding done) plus a
   second "friend" account so they can test report and block. There is no admin tool to make one today.
3. **Report / block / contact are on almost every phone surface.** Gaps: **events can't be reported
   anywhere** (the API accepts it, no button does), and **posts shown on a club's page** have no report
   button (the same post can be reported from the feed).
4. **Legal pages exist but the live Terms and Privacy are the May 7 "baseline draft"** with a visible
   "review with legal counsel" line, an 18+ rule, and a vendor list missing Sentry, Stripe and Resend. The
   Sept 7 rewrites are unpublished and predate Stripe, moderation and the store apps. No public Support page
   and no public "how to delete your account" page (Google requires a web link for deletion).
5. **Six WebView hazards on the phone UI**: "Add to calendar" (.ics download, silently fails in a Capacitor
   shell), "Open file" on résumés (new window → system browser without the login cookie → 401), Stripe
   Checkout/Portal (leaves the app for the system browser), Share (no Web Share in Android WebView; the code
   already falls back to copy-link), photo/video pickers (need iOS permission strings), and ~17 `confirm()`
   dialogs (Capacitor handles these; a hand-rolled WKWebView would not).
6. **Data collected by third parties is small and clean**: Supabase, Cloudflare R2, Vercel, Resend, Stripe,
   Sentry (errors + 10% traces, no Session Replay, PII off), Google Fonts, cdnjs. **No analytics, no ads, no
   AI vendor, no location.**
7. **Vibe+ upsells on phones are 4 links into `/plus`** (Otto stats, post "who viewed", a generic "See
   Vibe+" toast, and `/plus` itself with its Stripe buttons). All must branch inside the store apps.
8. **Landing page `/` has no footer links and says "vibe · prototype / early access"** — fine on the web,
   but "prototype" must never render inside a store app (Apple 2.2), and deletion currently sends people to `/`.
9. **One helper should decide "am I inside the store app"** — a user-agent token set by the shell (so the
   server can render `/plus` correctly with no flicker), with `window.Capacitor` as the client check.

---

## (a) Reviewer checklist against the code

### Plain English
Apple and Google both test four things on a social app: can I delete my account inside the app, can I
report and block people, is there a way to contact you, and can I actually log in. Vibe passes the first three
for a fully set-up student. It fails the fourth for a reviewer unless we give them an account, and the
"stuck before school verification" screen breaks the first one for anyone who never verified.

### a1. In-app account deletion — the path, end to end (phone)
| Step | What the student taps / what runs | Evidence |
|---|---|---|
| 1 | Profile tab → gear icon (icon only, `aria-label="Settings"`) | `src/components/mobile/ProfileMobile.tsx:1580` |
| 2 | `/settings` — login-only gate, **no Terms or school gate on purpose** | `src/app/settings/page.tsx:16-23`, `60-62` |
| 3 | Card order: Account, Campus, Handle, Tour, Blocked, **Help & safety**, Sign out, **Danger zone** | `src/components/settings/SettingsClient.tsx:115-126` |
| 4 | "Delete account…" → type `@handle` → "Permanently delete" | `SettingsClient.tsx:1231-1238`, `1328`, `1351`, `1407` |
| 5 | `fetch("/api/me", {method:"DELETE", body:{confirm_handle}})` | `SettingsClient.tsx:1245-1249` |
| 6 | Server: auth → handle must match → cancel Stripe customer (fails closed, 503) → purge Supabase + R2 files → `auth.admin.deleteUser` (DB rows cascade) → sign out | `src/app/api/me/route.ts:58-154`, `184-218` |
| 7 | Client clears the onboarding draft and goes to `/` (the marketing landing) | `SettingsClient.tsx:1254-1256` |

Other doors to the same delete: the Terms interstitial links `/settings#delete-account`
(`src/app/auth/terms/accept-terms-form.tsx:155`); suspended/banned accounts get their own Sign out + Delete on
`/account/suspended` (`src/app/account/suspended/suspended-actions.tsx:52-90`). Every user has a handle from
signup (`handle text NOT NULL`, `supabase/migrations/20260430190000_phase1_initial_schema.sql:18`), so the
handle-typing check can always be satisfied.

**Gaps a reviewer can hit**
- **Dead end before school verification.** `/auth/school-email` has only a "← back" link to `/campus`
  (`src/app/auth/school-email/page.tsx:472`), and `/campus` sends an unverified account straight back
  (`src/lib/auth/campus-access.ts:43-45`). No Sign out, no Settings, no Delete on that screen. In a browser a
  student can type `/settings`; in a store app there is no address bar. Fix: add "Sign out" and "Delete
  account" links to `/auth/school-email` (and to the phone onboarding header) before submission.
- **After deleting, the app lands on `/`**, the "prototype / early access" landing (see (d)). In the store app
  it should land on sign-up/log-in instead.
- Apple wants deletion "easy to find", allows a confirmation step, and says deactivation alone is not enough —
  Vibe's flow satisfies all three (https://developer.apple.com/support/offering-account-deletion-in-your-app/,
  read 2026-09-24; requirement effective June 30, 2022). If Vibe+ is ever sold through Apple IAP, Apple also
  wants the delete screen to say billing continues through Apple until cancelled (same page).
- Google additionally needs a **public web link** where people can request deletion without the app
  (https://support.google.com/googleplay/android-developer/answer/13327111, read 2026-09-24). `/settings`
  requires sign-in; a public page (e.g. `/legal/delete-account` or a section of `/support`) listing the steps
  and help@connectvibe.app is the safe answer. **Missing today.**

### a2. Report / block / filter / contact on every phone UGC surface
Apple 1.2 asks for four things on a UGC app: a filter, a way to report plus timely response, blocking, and
published contact info (https://developer.apple.com/app-store/review/guidelines/, read 2026-09-24).
Google's UGC policy asks for Terms acceptance before posting, in-app report **and** block, and 1:1 blocking
(https://support.google.com/googleplay/android-developer/answer/9876937, read 2026-09-24).
All phone reports go through one component, `ReportSheet` (`src/components/safety/ReportSheet.tsx:340`), which
offers "Block this person" after a report when an author is known (`:50-60`, `:66`).

| Phone surface | Report | Block | Evidence |
|---|---|---|---|
| Campus feed card ⋯ | "Report post" | "Block author" | `src/components/mobile/CampusMobile.tsx:3247-3253`, sheet `:3310-3330` |
| Post viewer (also `/posts/<id>`, which renders the same viewer) | post + each comment | "Block author" | `src/components/mobile/PostViewerMobile.tsx:725-741`, `1028`, `1296`; `src/app/posts/[id]/PostPageClient.tsx:5,17` |
| DM / group / club chat: one message | yes | via the sheet | `src/components/mobile/MessagesMobile.tsx:1667-1680` |
| DM thread ⋯ | "Report @handle" | "Block @handle" | `MessagesMobile.tsx:2414-2450` |
| Group chat ⋯ | "Report this chat" | n/a | `MessagesMobile.tsx:2430-2440` (club channels `type:"org"` get message-level report only, `:2157-2158`) |
| Someone's profile ⋯ | Report | Block + Mute | `src/components/mobile/ProfileMobile.tsx:1518-1530`, menu `5218-5345` |
| Club page `/orgs/<h>` | "Report this club" (About tab, bottom) | n/a | `src/app/orgs/[handle]/OrgContent.tsx:145-172` |
| **Club page "Recent posts"** | **none** (plain cards, no ⋯, no link to the viewer) | none | `src/app/orgs/[handle]/page.tsx:939-1030` |
| **Events** (Campus → Events, club page events) | **none** — API accepts `event` (`src/lib/moderation/reports.ts:28-35`), no UI sends it | n/a | `EventCard` `src/app/campus/campus-home.tsx:8556`; used by `CampusMobile.tsx:1698-1723`, `src/app/orgs/[handle]/OrgEventsSection.tsx:165` |
| Message requests from strangers | Decline + the thread ⋯ above (**UNVERIFIED** the ⋯ is reachable while pending) | same | `MessagesMobile.tsx:1217-1245` |

- **Filter:** a word filter runs on 11 write routes (posts, comments, reposts, club create/edit, profile,
  DMs, chat messages, events) via `contentBlockedResponse` (`src/lib/moderation/access.ts:134`,
  `src/lib/moderation/text-filter.ts`). **Images and videos are not scanned** — acceptable for 1.2's
  wording, but say "reports reviewed within 24 hours" in Review Notes.
- **Publishing needs a verified school email** (`requireCanPublish`, `src/lib/moderation/access.ts:217-221`,
  403 `school_email_required` at `:122-127`); reporting does not (`:22-24`).
- **Contact:** Settings → Help & safety (Community Guidelines, Child safety, `mailto:help@connectvibe.app`,
  `SettingsClient.tsx:1444-1482`); removed-content notice names help@ (`ReportSheet.tsx:634-645`); Community
  Guidelines promise action "within 24 hours" (`src/app/legal/community/page.tsx:127`) and the Child Safety
  page says the same (`src/app/legal/child-safety/page.tsx:111`). Settings is the only in-app contact entry;
  it is reachable from the Profile gear only.
- **Terms before posting:** signup checkbox (`src/app/auth/signup/page.tsx:415-445`) and the `/auth/terms`
  gate that every campus route runs first (`src/lib/auth/campus-access.ts:40-42`) — meets Google's rule.

### a3. Legal pages and their URLs
All live on `https://www.connectvibe.app` (the apex 301s to www, `next.config.ts` HEAD `:28-33`), public, no sign-in.
| Page | URL | State in code | What's missing for the stores |
|---|---|---|---|
| Terms | `/legal/terms` | May 7 "baseline draft", visible "review with qualified legal counsel" line (`src/app/legal/terms/page.tsx:20`, `31-32`); **18+** (`:40`; `MIN_AGE = 18`, `src/lib/legal/terms.ts:2`) | Sept 7 rewrite unpublished (`handoffs/legal-drafts/2026-09-07-terms-of-service.md`); it flags 17-year-old freshmen as an open decision (`:35`) |
| Privacy | `/legal/privacy` | May 7 draft (`src/app/legal/privacy/page.tsx:20`, `29-30`); vendors listed: Supabase, Vercel, Cloudflare R2 only (`:83-85`); "Children … 13" (`:160-164`) | Sentry, Stripe, Resend, Google Fonts, cdnjs not named; mentions "aggregate usage analytics" (`:66`) though no analytics exists; Sept 7 draft names Sentry/Resend/Fonts/cdnjs but **not Stripe**, says "no camera… or push" (`2026-09-07-privacy-policy.md:81-89`, `151-173`) — both need a pass for Stripe, moderation data, app stores, push |
| Community Guidelines | `/legal/community` | Live, effective Sept 23 (`src/app/legal/community/page.tsx:26`) | Nothing for review |
| Child Safety Standards | `/legal/child-safety` | Live, effective Sept 23 (`src/app/legal/child-safety/page.tsx:27`); CyberTipline link `:154-155` | Nothing (Google's child-safety declaration can point here) |
| Support | **none** | Contact lives on legal pages + in-app Settings | App Store Connect requires a Support URL; add a public `/support` (email, how to report/block, how to delete) |
| Account deletion (web) | **none** | `/settings#delete-account` needs sign-in | Google Play Data safety asks for a public deletion URL (a1) |

Apple 5.1.1(i) also requires the privacy policy link **inside the app** "in an easily accessible manner"
(guidelines page above). Today: Settings footer (`SettingsClient.tsx`, `LegalFooter`, links at `:1556-1563`),
signup checkbox, Terms interstitial. **The landing page has no legal links at all** (`src/components/landing/home-landing.tsx:228-231`).

### a4. A reviewer without a school email, and what the demo account needs
**Plain English.** A reviewer can create an account (email + password + 8-digit code), but the moment they
confirm, every tab bounces them to "Verify your campus", which only accepts `@iu.edu` or `@purdue.edu`.
They will see nothing of the product and can't delete what they made (a1). Apple's rule is simply "include
demo account info … if your app includes a login" (2.1(a)); Google asks for "all required details to enable
access" in Play Console → App access (https://support.google.com/googleplay/android-developer/answer/9859455,
read 2026-09-24). A built-in "demo mode" is allowed by Apple only "with prior approval" (2.1(a)).

What blocks an unverified account (all cite `HEAD`):
- **The whole app shell.** `enforceCampusAccess` (login → Terms → `school_verified` → onboarding) guards
  `/campus`, `/feed`, `/messages`, `/network`, `/otto`, `/profile` (`src/lib/auth/campus-access.ts:19-49`).
- **Publishing** (posts, comments, reposts, messages, chat and event creation) → 403 `school_email_required`
  (`src/lib/moderation/access.ts:209-221`). Likes, follows, RSVPs and reports only need Terms + not restricted.
- **Allowed domains** are exactly `iu.edu` and `purdue.edu` (`src/lib/auth/school-email-domains.ts:54-62`);
  retired IU domains are rejected (`:65-78`).
- **One account per school address** — a second account gets 409 `school_email_taken`
  (`src/lib/auth/school-email-apply.ts:182-212`), and a banned address stays banned by hash (`:72-100`).
- Reachable without verification: `/settings` (by URL only), `/posts/<id>` (login only,
  `src/app/posts/[id]/page.tsx:128-130`), public profiles `/profile/<h>` and club pages `/orgs/<h>`, `/plus`, `/legal/*`.

**Demo account recipe (needs a decision from Franky — see decisions):**
1. A **dedicated school address the company controls** that no real student uses (it gets claimed forever).
   Options: a founder-owned secondary `@iu.edu`/`@purdue.edu` alias (**UNVERIFIED** whether IU/Purdue allow
   aliases), or a one-off service-role write of `school_email`, `school_verified`, `school_system`, `campus_id`
   (the columns `school-email-apply.ts:221-240` writes). There is **no admin screen** that verifies an account
   (`src/app/api/admin/users/[id]/route.ts` only reads `school_verified`, `:86`). The write is a production DB
   change — Franky's call, and it should be scripted so it can be re-run.
2. Terms accepted at signup (consent columns), onboarding finished so `otto_answers` is saved
   (`src/lib/auth/post-login.ts:7`), a handle, a photo, and membership in a club with a few posts, one event
   and one chat, on a campus that has content (only SAE is a real club today).
3. A **second demo account** ("friend") that posts, comments and DMs the reviewer, so Report, Block and Mute
   can be tried on real content. Say in Review Notes which items to try.
4. Assume the reviewer **deletes** the demo account (Apple tests 5.1.1(v)). Keep the recipe re-runnable and
   re-check the credentials before every submission.
5. Password only — no 2FA or magic link, so nothing expires (good for both stores).

---

## (b) WebView hazards in the phone UI

**Plain English.** A store app built with Capacitor is a thin native window around the live site. Most of
Vibe just works inside it. The trouble spots are the few places that open new windows, download a file,
leave for another website, or reach for phone hardware. Capacitor's defaults (checked in its source): a
new-window link opens the **system browser**; any other website opens in the **system browser**; `alert`,
`confirm`, `prompt` show native dialogs; camera requests are auto-granted on iOS; **downloads are not handled
on iOS or Android**. The system browser does not share the app's login cookie, so anything that needs a
signed-in session breaks there.

Sources for the Capacitor behaviour (read 2026-09-24, `main` branch, v8 docs):
iOS `WebViewDelegationHandler.swift` — implements alert/confirm/prompt, `createWebViewWith` →
`UIApplication.shared.open(url)`, external hosts → system browser, auto-grants media capture, **no download
handling** (https://github.com/ionic-team/capacitor/blob/main/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift).
Android `BridgeWebChromeClient.java` — fullscreen video, camera/mic permission, alert/confirm/prompt,
file chooser with camera capture; **no `onCreateWindow`** (https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java).
Android `Bridge.java` — external hosts → `Intent.ACTION_VIEW`; **no `setDownloadListener`**
(https://github.com/ionic-team/capacitor/blob/main/android/capacitor/src/main/java/com/getcapacitor/Bridge.java).
Config docs: "By default, all external URLs are opened in the external browser (not the Web View)" and
`server.url` is "not intended for use in production" (https://capacitorjs.com/docs/config, v8).

| # | Hazard (phone unless noted) | Where | Inside a Capacitor shell | What the shell / web code needs |
|---|---|---|---|---|
| B1 | **"Add to calendar"** `<a href="/api/events/<id>/ics" download>` — on phone via `EventCard` | `src/app/campus/campus-home.tsx:8738-8746`; phone hosts `CampusMobile.tsx:1723`, `OrgEventsSection.tsx:165`; route needs the cookie (`src/app/api/events/[id]/ics/route.ts:18-25`) and sends `attachment` (`:76-77`) | No download handler on either platform → **likely nothing happens** (**UNVERIFIED** on device). Correction: `research/code-shell.md` (b) said this was desktop-only; it isn't. | Hide in shell for v1, or add a native calendar path (a signed/tokened .ics URL opened in the system browser, or a calendar plugin) |
| B2 | **Résumé "Open file" / "blacked-out copy"** `target=_blank` to `/api/resume/…` | `src/components/mobile/ResumeViewerMobile.tsx:489-491`, `534-536`; 401 without a session (`src/app/api/resume/[...path]/route.ts:129-131`) | iOS: opens **Safari** (no Vibe cookie) → 401. Android: no `onCreateWindow`, so the link loads **in the app's own view** — a PDF the WebView can't show, with no way back (**UNVERIFIED**) | Hide in shell (PWA ruling R16 already hides it in standalone), or have the route return its 300-second signed URL as JSON and open that in an in-app browser (no cookie needed) |
| B3 | **Stripe Checkout / Customer Portal** — top-level nav to another origin | `src/app/plus/PlusActions.tsx:53-54`, `157-160`; returns to `/plus?checkout=success…` / `/plus` (`src/app/api/billing/checkout/route.ts:167-171`, `src/app/api/billing/portal/route.ts:94`) | Other host → **system browser**. Payment finishes in Safari/Chrome, the return page opens there (signed out). Entitlement still lands via the webhook. | Governed by the payment ruling (see (e)); at minimum never call `window.location.assign(stripe)` inside the shell |
| B4 | Terms / Privacy links `target=_blank` mid-signup | `src/app/auth/signup/page.tsx:427-440`; `src/app/auth/terms/accept-terms-form.tsx:113-122` | iOS: leaves to Safari (public page, works). Android: loads in place and **may drop the half-filled form** (**UNVERIFIED**) | In shell: open in an in-app sheet/browser, or drop `target` and keep form state |
| B5 | External links `target=_blank` (club links, CyberTipline) | `src/app/orgs/[handle]/page.tsx:1066-1070`; `src/app/legal/child-safety/page.tsx:154-155` | System browser | Fine; optional in-app browser for polish |
| B6 | `mailto:` (no `tel:`/`sms:` anywhere) | `SettingsClient.tsx:1476`; `src/app/account/suspended/page.tsx:194`, `355`; `suspended-actions.tsx:160`; `src/app/plus/page.tsx:699`; legal pages (`community/page.tsx:176,187`, `child-safety/page.tsx:91,139,168`, `privacy/page.tsx:123,178`, `terms/page.tsx:158`); `src/components/legal/LegalLayout.tsx:125` | iOS: non-app URL → `UIApplication.open` → Mail. Android: host mismatch → `ACTION_VIEW` intent → mail app | Device-test; a phone with no mail app (**UNVERIFIED** behaviour) — show the address as copyable text too |
| B7 | **File inputs** (photos, video, résumé PDF) | `PostComposerMobile.tsx:460` (image+video); `MessagesMobile.tsx:1933` (image+video, `ATTACH_ACCEPT` `:170-171`); `ProfileMobile.tsx:1466` (banner), `1660` (avatar), `2303` (résumé: PDF+images), `4605`; `onboarding/StepPhoto.tsx:112`; club logo/banner `src/app/orgs/[handle]/admin-actions.tsx:477`, `662` | iOS: system picker offers Library / **Take Photo or Video** / Files. Android: Capacitor's chooser offers camera capture | iOS `Info.plist`: `NSCameraUsageDescription`, `NSMicrophoneUsageDescription` (video capture), `NSPhotoLibraryUsageDescription` — Apple: the camera key "is required if your app uses APIs that access the device's camera" (developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription). Android: `CAMERA` permission for capture |
| B8 | Direct uploads to Cloudflare R2 (presigned `PUT`) | `MessagesMobile.tsx:1137-1140`, `PostComposerMobile.tsx:232-234` (per `research/code-privacy-cache.md` (d)) | Works only if the page's origin is still `https://www.connectvibe.app` (R2 CORS + auth cookies) | Load the live site in the shell; a bundled `capacitor://localhost` origin would break CORS and cookies |
| B9 | Camera / microphone / geolocation APIs | none (`getUserMedia`, `mediaDevices`, `capture=`, `geolocation`: zero hits in `src/`) | — | Nothing |
| B10 | Clipboard | `CampusMobile.tsx:3150`; `PostViewerMobile.tsx:399-400`; `copyText` with `execCommand` fallback `src/lib/feedback/request.ts:178-215` (used `PostViewerMobile.tsx:718`, `onboarding/StepPeople.tsx:149`) | **UNVERIFIED** in both WebViews; fallback exists | `@capacitor/clipboard` behind the helper if device tests fail |
| B11 | Web Share API | `PostViewerMobile.tsx:394-400` (falls back to copy); `onboarding/StepPeople.tsx:140-149` (falls back to copy) | Android WebView: not supported per MDN (https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share, read 2026-09-24) → copy-link fallback. iOS WKWebView: **UNVERIFIED** | `@capacitor/share` in the shell for a real share sheet |
| B12 | Video playback `<video controls playsInline>` | `MessagesMobile.tsx:4003-4007`, `1856-1859`; `PostViewerMobile.tsx:835-838` | Android: fullscreen via `onShowCustomView` (implemented). iOS inline playback depends on `allowsInlineMediaPlayback` (**UNVERIFIED** Capacitor default) | Device-test |
| B13 | ~17 `window.confirm()` on phone paths (Block, Decline request, Leave chat, Delete post…) | e.g. `ProfileMobile.tsx:5323`; `MessagesMobile.tsx:1239`, `2235-2319`, `2688`, `2767`; `PostViewerMobile.tsx:205`, `457`; `CampusMobile.tsx:3125`; `EditPostSheet.tsx:160`; `src/components/orgs/OrgJoinControl.tsx:147`; `ResumeViewerMobile.tsx:799` | Capacitor shows native dialogs on both platforms | Only a hand-rolled WKWebView without a UI delegate would break these (Block would silently do nothing) |
| B14 | iframes | `src/app/messages/MessagesSwitch.tsx:45`, `src/app/onboarding/OnboardingSwitch.tsx:100` — desktop tree only (≥ 900 px) | An **iPad in landscape** gets the desktop tree, frames and static `/html/*` pages | Ship iPhone-only first, or add iPad to the device pass |
| B15 | Service worker from the PWA wave | `plan.md` R8-R9 | WKWebView disables service workers unless App-Bound Domains are configured (https://github.com/ionic-team/capacitor/issues/4122; https://developer.apple.com/forums/thread/781744 — dates not shown, **UNVERIFIED** current) | Registrar should skip inside the store shell |
| B16 | Email links (confirm, school verify, reset) | `research/code-shell.md` (d) | Open in the system browser, not the app; no `public/.well-known/` exists (no Universal Links / App Links) | The 8-digit codes already work in-app; Universal Links later |
| B17 | Pages with no tab bar (`/plus`, `/orgs/<h>`, `/posts/<id>`, `/legal/*`, `/auth/*`, `/account/suspended`) | `research/code-shell.md` (c) | iOS has no system Back; Android Back behaviour depends on the shell (**UNVERIFIED**) | 375 px pass inside the shell: every page needs a visible way back |

---

## (c) Every outside service that touches user data (for Apple's App Privacy and Google's Data safety)

**Plain English.** Vibe sends data to seven outside services, and none of them is analytics or advertising.
Almost everything a student types or uploads lives in Supabase (database, login, photos, résumés) and
Cloudflare R2 (videos and chat attachments). Resend sends three kinds of email. Stripe takes card details on
its own page (Vibe never sees the card). Sentry gets crash reports with personal details switched off and no
screen recording. Google Fonts and cdnjs see a visitor's IP address when a page loads. Both stores say data
collected through a web view you control counts as your app's data: Apple — "Data collected via web traffic
must be declared" (https://developer.apple.com/app-store/app-privacy-details/, read 2026-09-24); Google — it
"includes user data collected from a webview … if your app is in control of the code"
(https://support.google.com/googleplay/android-developer/answer/10787469, read 2026-09-24).

| Service | What it receives / keeps | Evidence | Apple App Privacy | Play Data safety |
|---|---|---|---|---|
| **Supabase** (DB, Auth, Storage) | Sign-in email, password hash, name, handle, school email, school/campus, year, major, bio, links, work history, skills, interests; avatar/banner/post photos (public bucket); résumés (private bucket); posts, comments, likes, reposts, bookmarks; DMs and chat messages + reactions; follows, connections, RSVPs, personal calendar entries; **who viewed which profile/post** (`profile_views`, `post_views`); reports, blocks, mutes, moderation actions; Terms acceptances; Otto answers; notifications; Vibe+ status + Stripe customer id; email-send log (hash + domain only). **Auth sessions store IP + user agent** (read-only check on the connected project: 64 of 64 `auth.sessions` rows carry both; `auth.audit_log_entries.ip_address` exists). | tables in `supabase/migrations/*.sql`; private columns via service role (`src/app/settings/page.tsx:25-36`); rate-limit keys are IP or IPv6 /64 (`src/lib/rate-limit.ts:51-75`) | Contact Info: Name, Email Address · User Content: Emails or Text Messages, Photos or Videos, Other User Content, Customer Support (reports) · Identifiers: User ID · Usage Data: Product Interaction · Purchases: Purchase History · all **linked to the user**, **no tracking** | Personal info: Name, Email address, User IDs, Other info (school, major, year) · Messages: Other in-app messages · Photos and videos · Files and docs (résumés) · App activity: App interactions, Other user-generated content · Financial info: Purchase history |
| **Cloudflare R2** | Post videos, chat image/video attachments (presigned PUT/GET) | `src/lib/r2.ts:41-43`, `209-233`; PUTs `MessagesMobile.tsx:1138`, `PostComposerMobile.tsx:233` | Photos or Videos (as above) | Photos and videos |
| **Vercel** (hosting) | Request logs (IP, user agent, URL) for the plan's retention. **No Vercel Analytics or Speed Insights** (not in `package.json`) | `package.json` dependencies | Probably not "collected" if only transient logs — confirm retention (**UNVERIFIED**) | Ephemeral processing still goes on the form, may be hidden (Google page above) |
| **Resend** | Recipient address + contents of the school-email code and password-reset emails; founder report alerts carry target type, reason, count, link — **no reported text** | `src/lib/email/resend-transactional.ts:142-175`, `187-235`; `src/lib/moderation/alerts.ts:27-29`. Sign-up confirmation is Supabase's template (`supabase/templates/confirmation.html`); which SMTP sends it in production is **UNVERIFIED** | Email Address (already declared) | Email address |
| **Stripe** (web only today) | Card, email, billing details typed on Stripe's hosted page; Vibe stores only the customer id + `vibe_user_id` metadata and plan status | `src/lib/billing/customers.ts:21`, `140-143`; `src/app/api/billing/checkout/route.ts:167-172`; production selling off unless `BILLING_ENABLED=true` + keys (`src/lib/billing/config.ts:102-108`) | Payment info entered outside the app that you never access "is not collected and does not need to be disclosed" (Apple page above); Purchase History yes | Payment-service data need not be declared if the app never accesses it (Google page above); Purchase history yes |
| **Sentry** (`@sentry/nextjs` ^10.51) | Stack traces, page URL (can contain a handle or post id), browser/OS, breadcrumbs, 10% of performance traces. `sendDefaultPii: false`, auth tokens scrubbed, **no Session Replay**, no `setUser` anywhere (only `captureException` in `src/app/global-error.tsx:13`), no tunnel route | `src/lib/sentry-config.ts:11-114`, `117-131`; `src/instrumentation-client.ts:5`; `src/sentry.server.config.ts`, `src/sentry.edge.config.ts`; `next.config.ts` (HEAD) `88-93`. SDK v10 does not infer IP when `sendDefaultPii` is false (https://docs.sentry.io/platforms/javascript/migration/v9-to-v10/, read 2026-09-24) | Diagnostics: Crash Data, Performance Data, Other Diagnostic Data — "not linked" is defensible but URLs with handles argue for "linked" (decision) | App info and performance: Crash logs, Diagnostics |
| **Google Fonts** | IP + user agent on every page load | `src/app/layout.tsx:42-45`; static pages' `<head>` | Third party sees it; self-hosting with `next/font` removes the question | same |
| **cdnjs** (Cloudflare) | IP when the phone résumé viewer loads pdf.js | `src/lib/pdfjs-cdn.ts:14` | same | same |

Not present (checked): analytics or ad SDKs, AI/LLM vendors, maps, geolocation, contacts, third-party
sign-in (grep of `src/`, `public/html/`, `package.json`). Recent searches stay in the browser
(`localStorage`, `src/app/campus/campus-home.tsx:4584-4589`). **New in the store apps:** push tokens
(APNs/FCM) and any native SDK the shell adds (e.g. a Sentry native SDK) must be added to both forms; Apple
also expects a privacy manifest in the app bundle for any required-reason APIs the shell uses (**UNVERIFIED**
what Capacitor ships by default).

---

## (d) The landing page and the desktop onboarding — where "get the app" goes

### Plain English
The home page is one client component: a typing intro, three orbiting rings, then two buttons (Create your
account, Log in) and a two-word footer. Store buttons belong right under those two buttons, showing only the
matching store on a phone and both stores plus a QR code on a laptop. The footer should also get Terms,
Privacy, Support links. On the desktop onboarding, the natural moment is the last step (follow people),
just above Finish — or, with less risk, a card after the campus tour and a permanent card in Settings.

### How `/` is built
- `src/app/page.tsx:1-7` — server page, `force-dynamic`, renders `<HomeLanding />`; **no session check**, so
  signed-in students see the same page (`research/code-shell.md` (a)).
- `src/components/landing/home-landing.tsx` (`"use client"`, 299 lines): hero typewriter `:122-148`; orbit
  scene `:150-163`; bottom rail `.vibe-landing-cta` `:166-226` with progress dots, school chips (`:190-198`,
  from `enabledSchoolSystems()` `:19`), the sign-up link `:206-215` and log-in link `:216-225`; footer
  `:228-231` reads **"vibe · prototype" / "early access"**. Phone vs desktop copy via `useIsMobile` (`:55-56`).
- **Trap for store badges:** a capture-phase click handler grabs any element with `data-warp-trigger` and,
  if its `href` doesn't start with `/`, sends the student to `/auth/login` instead (`:74-96`, the rule at
  `:88-89`). Store links must **not** carry `data-warp-trigger`.
- Styles: `.vibe-landing-*` in `src/app/globals.css` (dark background `:367-375`, per `research/code-shell.md` (e)).

### Where the store buttons go
- **Under the two doors** (after `home-landing.tsx:225`): "Get Vibe for iPhone / Android". On a phone show
  only the platform's badge (the in-flight `detectPlatform` in `src/lib/pwa/display-mode.ts:111` already
  tells iOS from Android); on desktop show both plus a QR code.
- **One stable link for QR codes, emails and posters:** a server route such as `/get` that redirects by user
  agent (App Store / Play / the landing). No QR library is in `package.json`; since the `/get` URL never
  changes, a pre-generated static SVG is enough.
- **Footer** (`:228-231`): Terms, Privacy, Community Guidelines, Support. Drop "prototype" before any
  review: Apple 2.2 says "Demos, betas, and trial versions of your app don't belong on the App Store", and 2.1
  asks that "placeholder text … and other temporary content" be removed (guidelines page, read 2026-09-24).
- **iOS Safari banner for free:** `<meta name="apple-itunes-app" content="app-id=…, app-argument=…">` in the
  layout shows Apple's own "Open / View" banner in Safari (https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners,
  read 2026-09-24). Add it once the app has an App Store id; skip it inside the store app itself.
- **Inside the store app `/` should never render**: the shell starts at `/campus` (same as PWA ruling R1),
  and the two places that send people to `/` after deletion (`SettingsClient.tsx:1256`,
  `src/app/account/suspended/suspended-actions.tsx:87`) should go to `/auth/signup` in the app.

### Desktop onboarding (`public/html/onboarding.html`, 4,030 lines; grep only; lines from `HEAD`)
- Served on desktop inside a full-screen iframe via `/onboarding/classic` (`src/app/onboarding/OnboardingSwitch.tsx`,
  `src/app/onboarding/classic/route.ts:126-131`); phones get `OnboardingMobile` instead.
- Six steps: `<section data-step="1…6">` at `:466`, `:483`, `:522`, `:592`, `:611`, `:634`; step 6 is
  "follow a few people" (copy `:857`) and ends with the Finish button `#onbFinish` (`:655`).
  `DRAFT_TOTAL_STEPS = 6` (`:1621`) and the draft validator (`:1650`) assume six.
- Finish → `succeed()` (`:3660-3669`) → `/campus?welcome=1` → the desktop campus tour
  (`src/app/campus/campus-home.tsx:438-522`, driven by `vibe_tour_pending`).
- **Where the QR fits, lowest risk first:**
  1. A "Get Vibe on your phone" card in **Settings** after the Campus tour card (`SettingsClient.tsx:120-121`)
     — always there, desktop and phone web.
  2. A dismissible card on desktop Campus **after the tour ends** (`campus-home.tsx:515-522`, where the tour
     flag is cleared) — the student has just finished setup.
  3. A panel on onboarding **step 6 above Finish** (`onboarding.html:652-656`) — no step-count change.
     A true step 7 means touching `DRAFT_TOTAL_STEPS`, the validator and the progress UI in a 4,000-line file.

---

## (e) The `/plus` screen and every Vibe+ upsell a phone can reach

**Plain English.** A phone reaches Vibe+ four ways, and all four end on `/plus`, whose buttons send the student
to Stripe. Inside the store apps every one of these must change to match the payment ruling (separate
research): show the store's own purchase, show a permitted "buy on the web" link, or show no price at all.

| # | Surface (phone) | What it shows | Evidence |
|---|---|---|---|
| E1 | **`/plus` page** (no tab bar; "← Back" link) | Prices, plan cards, **Subscribe → Stripe Checkout**, **Manage subscription → Stripe Portal**, "run on Stripe, so Vibe never sees your card", arrival sync from `?checkout=success` | `src/app/plus/page.tsx:65` (force-dynamic), `:382` (`billingEnabled()`), `:422-430`, `:468-473`, `:555`, `:559-575`, `:699` (mailto); `src/app/plus/PlusActions.tsx:53-54`, `144-160` |
| E2 | **Otto tab → stats → "Who viewed you"** teaser | "N people looked at your profile this week. **See who · Vibe+**" → `/plus?next=/otto?tab=stats` | `src/components/otto/OttoMetrics.tsx:99`, `312-323`; mounted `src/components/mobile/OttoMobile.tsx:397` |
| E3 | **Post viewer → audience sheet** (viewers) | "Vibe+ shows you who." + **See Vibe+** → `/plus?next=<here>` | `src/components/posts/PostAudienceList.tsx:77-88`, `262-278`; `src/components/mobile/PostAudienceSheet.tsx:165`; `src/components/mobile/PostViewerMobile.tsx:1166` |
| E4 | **Any 403 `plus_required`** → toast "That's a Vibe+ feature." with **See Vibe+** | generic; today from the viewers routes | `src/lib/feedback/failure-copy.ts:161-165`; `src/app/api/me/profile-viewers/route.ts:50`; `src/app/api/me/posts/[id]/viewers/route.ts` (`requirePlus`) |
| E5 | Mentions, not upsells | Suspension and deletion copy mention Vibe+ billing | `src/app/account/suspended/page.tsx:323`, `341`; `suspended-actions.tsx:140`; `src/app/api/me/route.ts:126`, `156-157` |
| — | Desktop-only (static pages; would appear on an iPad in landscape) | "See Vibe+" in the post viewer and the static-page toast | `public/html/_postViewer.js:1923-1933`; `public/html/_persistence.js:157` |

There is **no Vibe+ entry in Settings or Profile** (grep of both), and `/plus` sits under the Profile tab
(`src/components/mobile/mobile-tab-active.ts:20`). Production selling is off until `BILLING_ENABLED=true`
and the keys are set (`src/lib/billing/config.ts:102-108`); with it off, `/plus` hides the buttons
(`showPlans` needs `enabled`, `src/app/plus/page.tsx:425-427`) but **still prints "$3.99 a month, or $24.99
a year"** (`:580-595`). Inside a store app, a price for a digital subscription with no store purchase is
exactly what the payment ruling has to settle, so this "off" state needs its own branch too.

For framing only (the payments research owns the ruling): Apple 3.1.1 says unlocking features or
subscriptions "must use in-app purchase"; 3.1.3 lets apps "on the United States storefront" include
"buttons, external links, or other calls to action"; and 3.1.3(b) lets an app honour a subscription bought on
the web only "provided those items are also available as in-app purchases within the app" (guidelines page,
read 2026-09-24). So E1–E4 need three possible behaviours, picked per store and storefront.

---

## (f) Where the web code should branch on "running inside the store app"

### Plain English
Build one small helper that answers "is this the iPhone app, the Android app, or a browser?" and have every
spot above ask it. The shell adds a short tag to its user agent, so the **server** can tell too — that matters
for `/plus`, which is rendered on the server and must never flash Stripe prices inside the app. The helper
only ever hides or swaps things, so someone faking the tag gains nothing.

### Today
- Layout is picked by width only (`src/lib/use-is-mobile.ts:14`, `31-55`); its comment already expected
  "mobile users will mostly arrive via Capacitor" (`:50`). No user-agent sniffing in routing.
- The PWA wave is adding `src/lib/pwa/display-mode.ts` (`isStandalone`, `detectPlatform`) and
  `src/lib/pwa/use-standalone.ts` (`useIsStandalone`, `usePlatform`) — **uncommitted, in the working tree now**
  (plan: `handoffs/wave-plan-pwa/plan.md:46`, `51`). **Hazard:** a Capacitor iOS web view's user agent has no
  in-app marker and no Chrome token, so `detectPlatform` returns `"ios-safari"` (`display-mode.ts:111-125`,
  in-flight) — wave 3's "Add to Home Screen" coach would show inside the store app. The store-app check must
  run **before** `detectPlatform`.

### Recommended shape (one helper)
- **Shell side:** Capacitor `appendUserAgent: "VibeApp/<version> (ios|android)"` — a documented option
  ("String to append to the original user agent", https://capacitorjs.com/docs/config, v8).
- **Web side:** a pure module (house rule: no React, testable with `node --test`), e.g.
  `src/lib/app-shell/runtime.ts` → `detectAppShell(ua) → "ios-app" | "android-app" | null`; a server reader
  from `headers().get("user-agent")` for server components; a client hook `useAppShell()` that also checks
  `window.Capacitor?.isNativePlatform?.()`. Or add `"ios-app" | "android-app"` as the first rule of
  `detectPlatform` so every PWA caller inherits it.

### Components that need the branch
| Priority | Where | In the store app |
|---|---|---|
| P0 | `/plus` `src/app/plus/page.tsx` (server) + `PlusActions.tsx:144-160` | Per ruling: store purchase, permitted link-out, or no price |
| P0 | Upsell links `OttoMetrics.tsx:99,322`; `PostAudienceList.tsx:83-88,262-278`; toast `failure-copy.ts:161-165` | Same ruling |
| P0 | `/auth/school-email` (`page.tsx:472`) + phone onboarding header | Sign out + Delete account (needed on the web too) |
| P0 | Landing `/` and the two deletion redirects (`SettingsClient.tsx:1256`, `suspended-actions.tsx:87`) | Never show the landing; hide store badges; go to `/auth/signup` |
| P1 | `src/components/pwa/ServiceWorkerRegistrar.tsx`, `src/lib/pwa/install-prompt.ts`, wave-3 install coach, wave-2/3 web-push opt-in | Off; native push (APNs/FCM) registers instead |
| P1 | Résumé "Open file" `ResumeViewerMobile.tsx:489-491,534-536`; "Add to calendar" `campus-home.tsx:8738-8746` | Hide or native path (B1, B2) |
| P1 | Every sign-out path (`SettingsClient.tsx:1175-1190`, `accept-terms-form.tsx:66`, `suspended-actions.tsx:54`, `src/components/auth/EmailLinkProblem.tsx:69-75`) and deletion (`SettingsClient.tsx:1246`) | Also drop the native push token |
| P2 | Share / copy (`PostViewerMobile.tsx:394-400`, `CampusMobile.tsx:3150`, `onboarding/StepPeople.tsx:140-149`) | Native share sheet |
| P2 | Legal links in sign-up / Terms (`signup/page.tsx:427-440`, `accept-terms-form.tsx:113-122`); `LegalLayout` back link | In-app sheet; back to `/campus` (as PWA R16) |
| P2 | "Check your email" views (`signup/page.tsx:280-310`, `school-email/page.tsx:566-590`) | Lead with the 8-digit code (as PWA R16) until Universal/App Links exist |

---

## Lead times (calendar days, repo side; store-account paperwork is in the other research files)
- School-email dead end (Sign out + Delete links): **1 day** incl. a 375 px browser pass.
- Report button on events + on club-page posts: **1–2 days**.
- Public `/support` and `/legal/delete-account` pages: **1 day** once Franky writes the copy.
- Legal publish: the roadmap's own estimate is "1 day after the answers land" (`docs/ROADMAP.md:31`), but
  the Sept 7 drafts now also need Stripe, moderation, store apps and push — plus James's lawyer. **Unknown;
  it gates submission** (Apple 5.1.1(i) needs the privacy link in App Store Connect and in the app).
- Store-app helper + P0/P1 branches: **3–4 days**; a device pass per platform per build: **1–2 days**.
- Demo accounts + seeded content (script, run, document): **1 day** after the decision below.
- App Privacy + Data safety answers: **1 day** after the Sentry and IP decisions below.
- Landing badges, `/get`, footer, Smart App Banner: **1 day**, after the store listings exist (the App Store id
  exists once the app record is created in App Store Connect).
- The roadmap already flagged D-U-N-S at "2–6 weeks" and "starts now" (`docs/ROADMAP.md:38`).

---

## Decisions for Franky
1. **How the demo accounts get a verified school email.** (a) a company-controlled `@iu.edu`/`@purdue.edu`
   mailbox (**UNVERIFIED** that IU/Purdue will issue one); (b) a scripted, re-runnable service-role seed that
   writes the verification columns for two named review accounts (a production write — yours to run);
   (c) Apple's built-in demo mode (needs Apple's prior approval; Google has no equivalent).
   **Recommendation: (b)**, documented in the handoffs, using addresses nobody else can own, re-run before
   every submission.
2. **Sentry label: "linked to you" or not.** Page URLs can carry a handle. **Recommendation:** scrub
   `/profile/<handle>` to `/profile/:handle` in `beforeSend` (`src/lib/sentry-config.ts:11-114`), then declare
   Crash + Performance Data as not linked and not tracking.
3. **IP addresses kept by Supabase Auth sessions.** Declare or not (Apple: kept → collected; Google: the
   same). **Recommendation:** ask the lawyer with the privacy rewrite; disclose in the policy either way.
4. **Age.** Terms and signup say 18+ (`src/lib/legal/terms.ts:2`); the draft flags 17-year-old freshmen;
   the privacy page talks about under-13s. The store age questionnaires must match whatever the Terms say.
5. **Where "get the app" lives on desktop.** **Recommendation:** Settings card + post-tour Campus card for
   launch; the onboarding step-6 panel only if there is time.
6. **Events and club-page posts need a Report button** before submission (Apple 1.2 / Google UGC).

## Risks and open questions
- **Capacitor says `server.url` "is not intended for use in production"** (https://capacitorjs.com/docs/config,
  v8) — yet Vibe is server-rendered with server gates and cookie auth, so it cannot be bundled as static
  files. The shell choice (Capacitor with a remote URL, a native WKWebView, or something else) is the first
  thing the shell research must settle, together with Apple 4.2 ("elevate it beyond a repackaged website").
- **Signing in inside the app, paying in the system browser** splits the student across two cookie jars
  (B3). Entitlement still arrives by webhook, but the return page shows a signed-out Safari.
- **iPad** gets the desktop tree, frames and static HTML pages (B14) if the iOS app allows iPad.
- **Unverified on a device:** B1, B2 (Android), B4, B6 (no mail app), B10–B12, B15, B17.
- The in-flight PWA files (`src/lib/pwa/*`, `src/components/pwa/*`) may still change; re-check the
  `detectPlatform` hazard after wave 1 lands.
- Images and videos are not filtered automatically; the promise is "reviewed within 24 hours". Three
  founders must actually answer the report emails once the stores bring strangers.

## Sources (web; all read 2026-09-24 — publish/update dates not shown on the page unless stated)
- App Review Guidelines (1.2, 1.2.1, 2.1(a), 2.2, 3.1.1, 3.1.3, 3.1.3(b), 4.2, 4.2.2, 4.8, 5.1.1(i), 5.1.1(v)):
  https://developer.apple.com/app-store/review/guidelines/
- Offering account deletion in your app (effective June 30, 2022): https://developer.apple.com/support/offering-account-deletion-in-your-app/
- App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Smart App Banners: https://developer.apple.com/documentation/webkit/promoting-apps-with-smart-app-banners
- `NSCameraUsageDescription`: https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription
- Google Play account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play UGC policy: https://support.google.com/googleplay/android-developer/answer/9876937
- Google Play app access for review: https://support.google.com/googleplay/android-developer/answer/9859455
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Capacitor config (v8): https://capacitorjs.com/docs/config
- Capacitor source, `main` branch: `ios/Capacitor/Capacitor/WebViewDelegationHandler.swift`,
  `android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java`, `…/Bridge.java` at
  https://github.com/ionic-team/capacitor
- Service workers in WKWebView need App-Bound Domains: https://github.com/ionic-team/capacitor/issues/4122;
  https://developer.apple.com/forums/thread/781744
- MDN `navigator.share()`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- Sentry JS v9→v10 migration (IP not inferred without `sendDefaultPii`): https://docs.sentry.io/platforms/javascript/migration/v9-to-v10/
- Production database: one read-only query on `auth.sessions` column presence and non-null counts; no values read, nothing written.
