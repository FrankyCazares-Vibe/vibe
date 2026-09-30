# PWA research — completeness critic (2026-09-24)

Reader: the completeness critic. Read all seven research files, all three `*.factcheck.md` files, and
session 64 §10–§11. Where a factcheck says CORRECTED, the factcheck wins. Where the two factchecks disagree
with each other, I went to the primary source myself (noted below). Read-only on the repo; the only web
calls were public GETs of WebKit's source on GitHub and Apple's Safari 17.2 release-notes JSON.

---

## 0. The short version (plain English)

- **The research is solid, but four things in it would have shipped broken.**
  1. The notification tap link. On iPhone the "open this screen" link inside a push must be a full
     address (`https://www.connectvibe.app/...`). The Android file says to send a short `/messages?...`
     path. WebKit's own code throws a short path away and rejects the whole notification.
  2. The badge number. The two fact-checkers disagree on where it goes in the message. WebKit's current
     code reads it from the top level. Send it in both places so old and new iPhones both show it.
  3. Testing "production mode" on the Mac. The advice to run `next build && next start` locally would
     quietly talk to the **live database**. On this Mac, only `next dev` uses the practice copy.
  4. The offline page. For a suspended student, the offline page would be swapped for the suspension
     notice, which then gets saved on the phone and shown to whoever picks it up offline.
- **One new risk nobody raised:** when a student adds Vibe to the Home Screen, iPhone copies Safari's
  sign-in into the app. Both copies then hold the same one-time "refresh" key. Supabase treats a reused
  key as theft. The likely result is that **both Safari and the app get signed out** about an hour after
  install. I couldn't confirm this from here. It's a 70-minute test on a real iPhone, and it goes first.
- **Everything else fits together:** a hand-written `/sw.js` that stores nothing personal, a manifest
  with `start_url: /campus`, and push as a delivery channel for the notification rows that already exist.
  Those rows go through a small outbox table fed by one database trigger, plus the messages route for DMs.
  Every block, mute and suspension is checked again at send time.
- **Six product calls are yours** (section 3): which notifications buzz, what shows on the lock screen,
  where "Install Vibe" appears, how much works offline, whether sign-in changes for iPhone, and how push
  gets tested (only on production, only on founder accounts, because Preview shares the live database).
- **Build order:** four waves (section 4). No file is shared between two batches of the same wave. Only
  wave 2 carries a migration. Real-iPhone checks are marked **[iPhone]**.

---

## 1. Contradictions (research vs research, research vs code)

### Plain English
Each row is two sources saying different things, or a source colliding with how Vibe actually works.
The "Fix" column is what the builders should follow.

| # | Issue | Evidence | Fix |
|---|---|---|---|
| C1 | **Where `app_badge` goes in a declarative push.** The web-android factcheck says inside `notification`. The web-ios factcheck says top level. | I read WebKit `main`, `Source/WebCore/Modules/notifications/NotificationJSONParser.cpp` (fetched 2026-09-24). Line 155 reads `app_badge` from `outerObject` only. Lines 142–151 read `mutable` from the top level, with a "non-standard" inside-`notification` fallback (webkit.org/b/297389). The move happened in bug 293457 (2025-05-23, per web-ios.factcheck.md:16), so iOS 18.4–18.x likely read the inside copy. `parseNotificationOptions` ignores unknown keys (it reads only dir/lang/body/tag/icon/data/silent, :180–227). | Send `app_badge` **both** at the top level and inside `notification`. Put `mutable: false` at the top level only. Our own SW reads the top-level copy first, then the inside one. web-android.factcheck.md correction 1 is wrong for current WebKit. |
| C2 | **`navigate` must be an absolute URL.** web-android-push.md:204 says put "only relative, same-origin paths" in `data.url`/`navigate`. | `NotificationJSONParser.cpp:115–124`: `navigationURL = URL { value->asString() }` with no base URL, then `if (!navigationURL.isValid())` → SyntaxError. A relative path is invalid, so the message is rejected as declarative. On iOS 18.4+ it then falls back to our SW (non-declarative path); with no SW handling it, that's a permission-revocation risk. | The server builds `navigate` as `https://www.connectvibe.app` + path, from a constant, never from the request host. The SW (Chrome/Firefox/older iOS) checks `new URL(navigate).origin === self.location.origin` before `openWindow`. Also pass `navigate` in `showNotification` options (web-ios.factcheck.md U1). `icon` has the same absolute-URL rule (`:207–214`). |
| C3 | **Do Safari and the installed app share a sign-in?** code-privacy-cache.md:161–165 (firt 2020) and code-shell.md:136 treat them as fully separate. web-nextjs-sw.factcheck.md #32 says cookie copy is documented "only for macOS Sonoma". | web-ios.md:109–115 and web-ios.factcheck.md #11 cite Safari 17.2. I re-fetched Apple's Safari 17.2 release-notes JSON: "Added support for copying cookies when saving a website to the Home Screen on iOS and iPadOS. (104438319)". | Plan for "already signed in on first launch (iOS 17.2+), separate afterwards". **New risk this creates (C3b):** local `supabase/config.toml:160,166–169` has `jwt_expiry = 3600`, `enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10`. The copied cookie carries the **same refresh token** as Safari's. After ~1 h, whichever side refreshes second presents a used token. GoTrue's reuse detection likely revokes the session family, signing out **both**. Production settings and exact GoTrue behaviour are UNVERIFIED. Test first on a device (section 6, item I2). If confirmed, add standalone copy: "Signed out? Sign in once here and you'll stay signed in." |
| C4 | **VAPID keys on Preview.** web-android-push.md:112 and :249 say use one pair in Production, Preview and Development. code-conventions.md:275–281 says the private key goes on Production only. | `.env.example:73–74` and S64 handoff: "Preview shares the production Supabase database". A preview holding the private key could push real students from unreviewed code. Rows subscribed on a preview origin would land in the production table. | `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `PUSH_ENABLED`: **Production only, Sensitive**. `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: Production. Local: a **separate** key pair in `.env.development.local` (the local DB is separate, so no rows cross). The subscribe route refuses unless `VERCEL_ENV === "production"` or a localhost dev host. Each row stores `origin`; the sender skips rows whose origin isn't `https://www.connectvibe.app`. |
| C5 | **How pushes get fanned out.** web-android-push.md:273, :315 recommends an outbox plus a DB webhook / `pg_net` call to a signed route. code-notifications.md §H rejects `pg_net`/webhooks. | Webhooks are dashboard state outside migrations, the same failure mode as the `connection` drift (code-notifications.md:90–97). They also fire on direct PostgREST inserts. No migration enables `pg_net`. | Outbox via a **migrated** trigger on `notifications`, plus the messages route enqueuing DMs. Drain with `after()` from the writer routes/helpers (precedent: `src/app/api/auth/password-reset/route.ts:1,78`). An optional Vercel cron backstops it if the plan allows (UNVERIFIED, section 5). No `pg_net`. |
| C6 | **A trigger-fed push can be abused.** code-notifications.md §G:309–313 warns that direct PostgREST comment inserts skip the route's rate limit and word filter, "a trigger-fed push would let a student … buzz someone's phone with unfiltered text". Section H then recommends exactly that trigger. | `post_comments_insert_own` / `messages_insert_member` policies (20260923090000_moderation_foundation.sql:437, 460). Rows made this way still write a `notifications` row through `notify_on_comment_insert`. | Keep the trigger (it's the only single door), but the dispatcher treats every row as untrusted. It runs `checkText` (`src/lib/moderation/text-filter.ts:145`, pure) on any preview text, applies the per-recipient cap (`push:<recipient>`) and pair cap, and drops rows older than a staleness cutoff (e.g. 15 min). Text previews are off by default (decision 2). DMs are enqueued only by the route, so a direct `messages` insert never buzzes a phone (code-notifications.md:366–368). |
| C7 | **Where the installed app opens.** web-ios.md:293 says `start_url: "/"`. code-shell.md:88–99 says `/campus`. | `src/app/page.tsx` renders `HomeLanding` with no session check (code-shell.md:81–83). `/campus` runs `enforceCampusAccess` (`src/lib/auth/campus-access.ts:19–49`). | `start_url: "/campus"`, `id: "/"`, `scope: "/"`. Don't put a `?source=` query in `start_url` (it's dropped at the first gate, code-shell.md:95–97). |
| C8 | **The offline page vs the suspension gate.** | `src/proxy.ts:94–98`: `.html` is not in `ASSET_EXTENSIONS`. `:235–243`: a restricted student's non-file page request is redirected to `/account/suspended`. That page renders the restriction details. A SW precaching `/offline.html` would store the notice and show it offline to whoever holds the phone. | Add `sw\\.js\|offline\\.html\|manifest\\.webmanifest` to the matcher's negative lookahead (`src/proxy.ts:315–317`). The SW precaches with `fetch('/offline.html', {cache:'reload', redirect:'error'})` and refuses any response that is `redirected` or not 200. Verify with an anonymous curl and a restricted local account. |
| C9 | **"Test with `next build && next start`" on the Mac hits production.** web-nextjs-sw.md:354 and its `check-pwa.mjs` plan (:385) say to test against local `next start`. | `.env.local` points `NEXT_PUBLIC_SUPABASE_URL` at the production project (host `rqop…`). `.env.development.local` points at `127.0.0.1` (checked 2026-09-24, names and hosts only, no values read). Next loads `.env.development.local` only when `NODE_ENV=development`, so `next start` reads `.env.local`, which is the **live DB**. | Test the SW under `next dev` (port 3000, the `vibe` launch config) with `NEXT_PUBLIC_SW_DEV=1`, against the local stack. Run `check-pwa.mjs` in two modes: full checks against `localhost:3000` (dev), and **GET-only** header checks (manifest, `/sw.js`, `/offline.html`, icons) against the live deploy. Never run `next start` on this Mac. |
| C10 | **`Content-Type: application/notification+json`.** web-ios.md:326 says to send it. | Both factchecks: not required (webpushd parses the payload), and `web-push` 3.6.7 overwrites it with `application/octet-stream` (web-ios.factcheck.md:31; web-android-push.factcheck.md:13). | Drop it. Don't plan on it. |
| C11 | **Does our SW run for an iPhone push?** web-ios.md:200–201 says a root-scope SW's `push` event fires for declarative messages. | web-ios.factcheck.md correction 2: only when top-level `"mutable": true`. | With `mutable: false`, iOS 18.4+ shows the server's text as-is. All suppression and wording decisions live on the **server** (already the design, code-notifications.md §F). The SW `push` handler serves only iOS 16.4–18.3, Chrome, Firefox and Edge. It must try/catch `event.data.json()` and fall back to `text()` (web-nextjs-sw.factcheck.md #35). |
| C12 | **`100vh`.** web-ios.md:344 says replace the 34 `100vh` hits. code-shell.md:202–209 says there is no standalone blocker. | code-shell: nearly every hit is `min-height` or a desktop-only frame (`MessagesSwitch.tsx:51`, `OnboardingSwitch.tsx`, `LeftNav.tsx:242`). Phone code already uses `dvh` (`MobileShell.tsx:25–39`, `PostComposerMobile.tsx:349–358`). | No mass replace. Device-test the keyboard open→close cycle in Messages and the composer instead. |
| C13 | **"No back button" pages.** code-shell.md:177–180 lists `/plus`, `/orgs/<h>`, `/posts/<id>`, `/legal/*` as having no tab bar. web-ios.md:342 says every non-root screen needs a visible back. | Spot-check: `/orgs/<h>` mounts `MobileTabBar` for signed-in students (`src/app/orgs/[handle]/page.tsx:446`), as does `/plus` (`src/app/plus/page.tsx:706`, back link `:469`). `/posts/<id>` Close → `/campus` (`src/app/posts/[id]/PostPageClient.tsx:19`). `/legal/*` "← Back to Vibe" goes to **`/`** (`src/components/legal/LegalLayout.tsx:38–47`), the marketing starfield. | Only the legal back needs a change: in standalone, go to `/campus` (or `history.back()` when there is history). `/the-map` is internal. `/account/suspended` is dead-ended on purpose. |
| C14 | **Who can read subscription rows.** web-android-push.md:252: "the owner can select and delete their own rows". code-conventions.md:521–523 and code-notifications.md:356–358: service role only. | Standing rule "grants, not routes" (`supabase/migrations/20260906130000_consent_db_boundary.sql:4–10`). The browser already knows its own subscription via `PushManager`. | Service role only: RLS on, zero policies, revoke from anon/authenticated (the `billing_customers` shape). |
| C15 | **Route naming.** web-android-push.md:253 says `POST /api/push/subscribe`. code-conventions.md:490 says `src/app/api/me/<name>`. | House convention: per-student routes live under `/api/me/`. | `src/app/api/me/push-subscription/route.ts`: POST upserts by endpoint (re-pointing `user_id`), DELETE removes by endpoint. Add DELETE to `restrictedApiAllowed` (`src/proxy.ts:172–177`). |
| C16 | **`Clear-Site-Data` on logout.** code-privacy-cache.md:190–197 suggests `"storage"` as a backup. web-nextjs-sw.md:254–257 says never on normal sign-out. | `"storage"` also unregisters the SW, and its CacheStorage and iOS push effects are UNVERIFIED (web-nextjs-sw.factcheck.md U1). | v1: no header. Clean up explicitly in code: unsubscribe, server delete, `caches.delete`, the named `vibe_*_v1` keys, `clearDraft()`. One helper, `src/lib/pwa/leave-device-clean.ts`. The two files named it differently (`leaveDeviceClean` / `signOutDevice`); use this one. |
| C17 | **Event reminders and moderation-outcome pushes "on by default".** web-android-push.md:316. | No writer, no scheduler (`vercel.json`, `pg_cron` and edge functions all absent; code-notifications.md:125–130), and no `/events` route (web-android-push.md:209). | Out of v1. Launch kinds are the ones that already write rows, plus DMs (decision 1). |
| C18 | **`Topic` length.** web-android-push.md:268 suggests `dm-<thread>`. | RFC 8030 / Apple: ≤ 32 base64url characters. A UUID with the hyphens stripped is already 32. | Topic = the first 32 characters of base64url(SHA-256(`kind:id`)). `tag` (no length limit) can stay readable, e.g. `dm:<channel_id>`. |

---

## 2. Gaps: questions a builder will hit

### Plain English
Part A lists questions no research file answered that I settled by reading the code. Part B lists what's
still open: someone has to decide it, check a dashboard, or try it on a phone.

### A. Closed by reading the repo
| # | Question | Answer (evidence) |
|---|---|---|
| G1 | What colour is behind the page on launch and when you overscroll? | **White, not cream.** `src/app/globals.css:34–40`: `body { background: var(--cream); … @apply bg-background … }`. The later `@apply` wins, and `--background: oklch(1 0 0)` (`:136`) is white. Phone shells paint cream themselves (`MobileShell.tsx:33`), so it shows only at the edges, on bounce and on the iOS launch flash. Fix, standalone only: `@media (display-mode: standalone), (display-mode: fullscreen) { html, body { background:#FAF7F2 } }`. Both queries are needed because of the iOS quirk (web-ios.factcheck.md #9). Don't change it globally: the landing page is dark and some pages rely on the white. Computed value not measured in a browser (UNVERIFIED). |
| G2 | Does a push tap land in the right conversation on a phone? | Yes. `/messages?channel=<id>` is read server-side (`src/app/messages/page.tsx:26–31`) and opened by `MessagesMobile` (`:400–411`); `?to=<handle>` also works (`:413+`). **But** the phone thread list never refetches (no `visibilitychange`/`focus` listener in `MessagesMobile.tsx`). A student who taps a push and then goes back sees a stale list. Add a refetch on `visibilitychange → visible` (wave 3E). |
| G3 | Is the word filter usable from the dispatcher? | Yes. `checkText` is pure and has no server-only import (`src/lib/moderation/text-filter.ts:1–3, 145`). |
| G4 | Is `after()` already a house pattern? | Yes: `src/app/api/auth/password-reset/route.ts:1, 78`. |
| G5 | Can the logout route carry the endpoint? | Today it takes no body and just calls `signOut()` (`src/app/api/auth/logout/route.ts:10–14`). It's already on the restricted allow-list (`src/proxy.ts:173`). Accept an optional `{ endpoint }` JSON body and delete that row **before** `signOut()`. |
| G6 | Where can per-kind push preferences live without a migration? | `users.otto_settings`: the whitelist is in `src/app/api/me/otto/settings/route.ts:18–26`, and unknown keys are dropped. Add `push_*` keys there. |
| G7 | Is there a timezone to support "quiet hours"? | No `timezone`/`time_zone` column in any migration (grep). Both campuses are in Eastern time, but v1 should rely on iOS Focus / Android Do Not Disturb and skip quiet hours. |
| G8 | Which migration comes before ours? | Production is at `20260923090000_moderation_foundation`. `20260922150000_billing_stripe` is written but **not applied** (S64 handoff:62–63) and gets renumbered above ours when billing goes live (code-conventions.md:42–47). Our file gates on "`20260923090000` present and my version absent" (rule H2). |
| G9 | Is `sharp` available to render the 512 and maskable icons? | Yes: `package.json` pins `sharp` 0.35.4, and the vector source is `src/app/icon.svg`. Generate them with a script; don't hand-export. |

### B. Still open (someone must decide, check a dashboard, or test on a device)
1. **Vercel plan tier, and so cron frequency.** Hobby allows only a daily cron (UNVERIFIED for this
   project). If there's no per-minute cron, the outbox relies on `after()` kicks plus drains on the next
   write, and must drop rows older than the staleness cutoff rather than send them late.
2. **Refresh-token collision after install** (C3b). Needs the device test; the production Supabase
   rotation and reuse settings are unchecked.
3. **The outbox trigger must never break a like, follow or comment.** Wrap its insert in
   `BEGIN … EXCEPTION WHEN others THEN RAISE WARNING … END`. No research file says this.
4. **Claiming outbox rows:** an RPC using `FOR UPDATE SKIP LOCKED`. Per house rules it's granted EXECUTE to
   anon, authenticated and service_role, and refuses inside unless the caller is `service_role`, raising
   `42501` (never REVOKE EXECUTE; rulings.md:3–7). The migration's post-check count must be 0.
5. **One badge number.** Three unread rules disagree today (code-notifications.md §E). Wave 2 needs one
   helper (`src/lib/push/badge.ts`) used by the push payload and `/api/me/badge`. Whether the notification
   count route and the threads route switch to it now or later is a scope call; later is fine.
6. **`beforeinstallprompt` fires early, on whatever page loads first.** It must be captured by a module
   mounted in the root layout (the registrar), not by the Settings card. Nothing in the research says where.
7. **iPad detection.** iPadOS Safari reports a Mac user agent; the "is this iOS Safari?" check needs
   `navigator.maxTouchPoints > 1`. The in-app-browser user-agent markers (Instagram, TikTok, Snapchat) are
   UNVERIFIED.
8. **Notification title and actor naming.** Is the title "Vibe" or the actor's name? Ruling M6 makes naming
   the actor the free exception (`20260922110000_*.sql:63–65`). No push kind may reveal a paid-only identity
   (profile viewers). None of the proposed kinds does, but the payload builder's tests should pin it.
9. **Android notification `badge` icon.** It needs a monochrome PNG (≈96 px). No design exists.
10. **Manifest screenshots** for Chrome's richer install sheet. They need clean images of seeded local
    accounts only, never real students. That's optional, so wave 4.
11. **How many students installed / turned push on.** Nothing counts it. `push_subscriptions` with
    `platform` + `installed` answers it as a count (no identities), which fits "counts public, identities
    private".
12. **Where iOS starts an app added from a page other than `start_url`** (e.g. added while on
    `/profile/x`). UNVERIFIED on iOS 26/27; device test.
13. **iOS "Show Previews: When Unlocked" for web-app notifications.** UNVERIFIED. If it applies, our
    preview switch is a second layer.
14. **Apple's "one JWT per hour".** `web-push` signs per send. Accept it for v1, and cache the header per
    push origin if Apple ever answers 403/429 (web-android-push.md:107).
15. **The dead `connection` kind** is still counted (`src/app/api/me/notifications/count/route.ts:73`). The
    payload builder must map it to "no push".

---

## 3. Decisions that belong to Franky

### Plain English
These are product calls, not engineering ones. Each has the options, my recommendation and the reason.
Wave 1 can start before any of them is answered. Wave 2 needs D1, D2 and D6. Wave 3 needs D3.

**D1. Which notifications buzz a phone at launch, and which are on by default?**
- Options: (a) everything that already makes a notification row, plus DMs, all on;
  (b) conversations on (DMs, group chats, message requests, @mentions, comments on your post, club invite /
  request approved), likes and new followers available but **off** by default;
  (c) DMs + mentions only.
- **Recommendation: (b).** Likes arrive collapsed ("Maya and 4 others") when switched on. Not in v1: event
  reminders and moderation outcomes (no writer, no scheduler, no `/events` route), per-message pushes
  from club channels (@mentions only), reposts.
- Why: a phone learns about a new DM **only** by opening Messages today, because the phone list never polls
  (code-notifications.md §C). Likes and follows are the noisy kinds with no action attached, and Chrome
  pulls permission from high-volume, low-open senders (web-android-push.md §b). Mute rules already promise
  "no notification ping" (`public/html/messages.html:3103`), so chat mutes and person mutes suppress, and
  an @mention does **not** break through a chat mute.

**D2. What shows on the lock screen?**
- Options: (a) name + text for everything, with a switch to hide it (iMessage/Instagram norm);
  (b) name + what happened ("Maya sent you a message", "Jordan commented on your post"), text **off**
  by default behind one "Show message previews" switch; (c) fully generic ("New activity on Vibe").
- **Recommendation: (b), plus four fixed rules:**
  - Message requests are always "New message request", no name, no text.
  - Club invites and approvals never name the club ("You're invited to join a club"). A club's name can
    out someone's faith, culture or orientation.
  - Photos are "sent a photo", never the image.
  - With previews on, text is capped at about 100 characters and only shown if it passes `checkText`.
- Why: roommates read lock screens. Comment and message text can arrive through the PostgREST path that
  skips the word filter (C6). A campus launch lives on trust.

**D3. Where and when does "Install Vibe" appear?**
- Options: (a) Settings only; (b) Settings + one dismissible Campus banner; (c) (b) + contextual nudges
  (after the first DM: "Know when they reply"); (d) a screen during sign-up.
- **Recommendation: (c) without (d).**
  - Settings card: always there.
  - Campus banner: shown from the **second** session on, never during the welcome tour, never alongside
    the campus-confirm banner. "Not now" hides it for 14 days.
  - Messages: one line after the first DM is sent.
  - Per browser:
    - iOS Safari: a steps sheet (… → Share → Add to Home Screen → keep "Open as Web App" on → Add).
    - Instagram, TikTok and Snapchat in-app browsers: "Open in Safari first".
    - Android Chrome / Edge / desktop Chromium: a real Install button.
    - Samsung Internet: "Open in Chrome" (Samsung's Android 14 install block).
    - Firefox: no install; offer notifications instead.
  - The notification opt-in appears **only inside the installed app** on iPhone, only after a tap: in
    Settings, on the Otto tab, and after the first DM.
- Why: iOS has no install prompt, and asking at sign-up is before the student has any reason to care.
  Chrome and Apple both punish early asks.

**D4. How much works offline?**
- Options: (a) a branded "You're offline" page only; (b) (a) + cached app code for faster cold starts;
  (c) read-only cached feed and messages.
- **Recommendation: (a) for launch; (b) after launch.**
- Why: every page and API answer is personal. Caching them risks showing one student's data to the next
  person on a shared phone, and it can trap an installed phone on an old version. (a) needs no update
  logic and has a one-commit kill switch.

**D5. Does sign-in change for iPhone?**
- Options: (a) no flow change, only copy: in the installed app, the confirm and school-email screens lead
  with the 8-digit code and say links open Safari; the reset email says "then open Vibe from your Home
  Screen and sign in"; (b) (a) + an 8-digit code in the password-reset email so reset finishes in-app;
  (c) add magic-link or Sign in with Apple.
- **Recommendation: (a) now, (b) in wave 4 if time allows, never (c).**
- Why: password sign-in already works inside the app, and email links can't open the app on iOS
  (web-ios.md §b). A magic link would make it worse. Pending the C3b device test, which may add one line
  of copy.

**D6. How do we test push without touching real students?**
- Options: (a) Vercel Preview (it shares the production database); (b) production, dark-launched: the
  sender is off unless `PUSH_ENABLED=true`, and while `PUSH_ALLOWLIST` (founder user ids) is set, only those
  accounts can subscribe or receive; (c) an HTTPS tunnel to the local stack.
- **Recommendation: (b) for iPhone; local Chrome on `next dev` for everything else.**
- Why: an iPhone needs real HTTPS plus a Home Screen install. Preview is production data under a different
  origin anyway. The allowlist makes "test on prod" safe and matches "test mobile via Vercel deploy".

**Smaller calls (recommendation in brackets):**
- Can a suspended student turn push off? [Yes; add the DELETE route to `restrictedApiAllowed`.]
- Should a suspended or banned student get any push? [No, except a future "your appeal was answered".]
- Samsung Internet? [Coach to Chrome.]
- The dead `connection` kind? [Leave it out of push; clean up later.]

---

## 4. Build order: four waves, disjoint file ownership inside each

### Plain English
- **Wave 1** makes Vibe installable and safe to install: icons, manifest, the worker, the offline page.
  It ships to production on its own and changes nothing for people who don't install.
- **Wave 2** builds the push machinery behind a switch that stays off, plus the one migration.
- **Wave 3** adds everything a student touches: the notification switch, install coaching, and clean
  sign-out.
- **Wave 4** is polish, plus the real-iPhone sign-off before the switch is flipped for everyone.

Each wave runs implement → adversarial review → repair (memory `feedback_workflow_waves`). Writes and
Edits stay at 150 lines or fewer. Interface contracts are fixed in the plan before a wave starts, because
some batches import a file another batch in the same wave creates. **[iPhone]** means the check needs a real
iPhone on HTTPS (production, founder accounts).

### Wave 1: installable shell (no push, no migration)
| Batch | Files it owns | Scope |
|---|---|---|
| 1A Manifest + icons + head | `src/app/manifest.ts`, `scripts/gen-pwa-icons.mjs`, `public/icons/{icon-192,icon-512,maskable-192,maskable-512,badge-mono-96}.png`, `src/app/layout.tsx` | `id "/"`, `start_url "/campus"`, `scope "/"`, `display "standalone"`, name/short_name "Vibe", colours `#FAF7F2`, separate `any` / `maskable` entries, `launch_handler {client_mode:["navigate-existing","auto"]}`, 2–3 `shortcuts` (Messages, Campus). `appleWebApp {title:"Vibe", statusBarStyle:"default"}`. Keep `apple-icon.png` and never strip it by user agent. Mount `<ServiceWorkerRegistrar/>` (from 1B). Icons rendered from `src/app/icon.svg` with `sharp`. |
| 1B Worker + registrar | `public/sw.js`, `public/offline.html`, `docs/pwa/sw-killswitch.js`, `src/components/pwa/ServiceWorkerRegistrar.tsx`, `src/lib/pwa/install-prompt.ts` | SW: `SW_VERSION`; install precaches `/offline.html` (`redirect:'error'`, refuse `redirected`/non-200); activate cleans old caches, enables navigation preload, `clients.claim`; fetch handles **only** same-origin GET navigations outside `/api`/`/auth` (network → offline page on throw), everything else untouched; `push` try/catches `json()`, reads the declarative shape, top-level `app_badge` first; `notificationclick` validates same origin, focuses or opens; `message SIGNED_OUT` purges. The registrar runs in production only (or `NEXT_PUBLIC_SW_DEV=1`), honours kill flag `NEXT_PUBLIC_SW_ENABLED`, registers with exactly `{scope:'/', updateViaCache:'none'}`, calls `update()` on visible at most hourly, and `install-prompt.ts` captures `beforeinstallprompt` at load. |
| 1C Gate files + checker | `src/proxy.ts`, `next.config.ts`, `scripts/check-pwa.mjs` | Matcher skips `sw.js`, `offline.html`, `manifest.webmanifest`. `/sw.js` headers: `Cache-Control: no-cache`, JS content type. Keep `SAMEORIGIN`. Checker: dev-mode full checks on `localhost:3000`; GET-only header checks against the live site (C9). |
| 1D Static pages | `public/html/_sw.js`, `public/html/profile.html`, `public/html/messages.html`, `public/html/onboarding.html` | `<link rel="manifest">`, `theme-color`, and `<script src="/html/_sw.js" defer>`, which registers with the **identical** options (web-nextjs-sw.factcheck.md #18). Grep plus ranged reads only; profile.html is 11k lines. |
| 1E Standalone copy + fixes | `src/lib/pwa/display-mode.ts` (+ `.test.ts`), `src/app/auth/signup/page.tsx`, `src/app/auth/school-email/page.tsx`, `src/lib/email/resend-transactional.ts`, `src/components/mobile/ResumeViewerMobile.tsx`, `src/components/legal/LegalLayout.tsx`, `src/app/globals.css` | Pure `isStandalone()` (`navigator.standalone` or display-mode `standalone`/`fullscreen`) and `platform()` (iOS Safari incl. iPad via `maxTouchPoints`, iOS in-app, Android Chrome, Samsung, Firefox, desktop Chromium). In standalone: lead with the code (D5a); reset-email copy; résumé "Open file" in the same window; legal Back → `/campus`; standalone-only cream background (G1). |

Acceptance, wave 1:
- Local, `next dev` + `NEXT_PUBLIC_SW_DEV=1`, local stack:
  - `check-pwa.mjs` green.
  - CDP `Page.getInstallabilityErrors` returns `[]`.
  - The SW controls `/campus`. DevTools Offline shows the offline page, inside the desktop messages iframe
    too.
  - A suspended local account's `/offline.html` is 200 and not redirected.
  - Kill-switch drill leaves 0 registrations and 0 caches.
  - 375 px pass as a non-admin.
- After deploy: GET-only checks on www (manifest 200 `application/manifest+json`; `/sw.js` and
  `/offline.html` 200, no `set-cookie`, no redirect).
- **[iPhone]** I1–I10 in section 6.

### Wave 2: push machinery (dark, behind `PUSH_ENABLED`) + the migration
| Batch | Files it owns | Scope |
|---|---|---|
| 2A Migration | `supabase/migrations/2026092xHHMMSS_push_notifications.sql` | `push_subscriptions` (uuid pk, `user_id` FK users ON DELETE CASCADE, `endpoint` UNIQUE, `p256dh`, `auth`, `platform`, `origin`, `installed`, `created_at`, `last_seen_at`, `last_ok_at`, `failure_count`). `push_outbox` (uuid pk, `user_id` CASCADE, `source`, `notification_id` FK CASCADE, `message_id` FK CASCADE, `created_at`, `claimed_at`, `sent_at`, `skipped_reason`, `status_code`, no content). AFTER INSERT trigger on `notifications` (SECURITY DEFINER, exception-swallowing, gap B3). `claim_push_outbox(n)` RPC (gap B4). RLS on, zero policies, revoke anon/authenticated, service_role re-granted by name. Full house header (WHY / DOES NOT / LOCKING / NUMBERING / pre-flight / post-check incl. the EXECUTE count = 0 / ROLLBACK). Local test copy only in this wave; production **only with Franky's yes**, after wave 2 code is deployed (code first). |
| 2B Subscribe + sign-out server side | `src/app/api/me/push-subscription/route.ts`, `src/lib/push/endpoint.ts` (+ `.test.ts`), `src/app/api/auth/logout/route.ts`, `src/proxy.ts` | POST: auth → validate (`https:`, host allow-list `fcm.googleapis.com`, `*.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`; p256dh 87 / auth 22 base64url; size cap) → `rateLimit('push-subscribe:'+uid)` → `requireNotRestricted` → env guard (production or localhost; allowlist while set) → upsert by endpoint, re-point `user_id`. DELETE by endpoint for the caller. Logout accepts `{endpoint}` and deletes before `signOut()`. Proxy: DELETE added to `restrictedApiAllowed`. Treat missing tables as "no row" (42P01/PGRST205). |
| 2C Sender + config | `src/lib/push/send.ts`, `src/lib/push/config.ts` (+ `.test.ts`), `src/app/api/health/push/route.ts`, `package.json`, `package-lock.json`, `.env.example` | `web-push` pinned `3.6.7` exactly, `@types/web-push` as dev, `import "server-only"`, `runtime nodejs`. Explicit `TTL` ≥ 1, the `urgency` option (not a header), `topic`, `timeout`. Status map: 201 ok; 404/410 delete; **401/403** alert and keep; 413/400 log as a bug; 429/5xx back off. Never log endpoints. `pushEnabled(env)` is exactly `"true"`. `.env.example` paragraphs say "Production only, Sensitive" and "NEVER rotate". Optional `engines.node "24.x"`. |
| 2D Dispatcher + payload + badge | `src/lib/push/dispatch.ts`, `src/lib/push/payload.ts` (+ `.test.ts`), `src/lib/push/badge.ts`, `src/app/api/me/badge/route.ts`, `src/app/api/cron/push-drain/route.ts`, `vercel.json` (only if the plan allows) | `kickPushDrain()` and `enqueueMessagePush()`, both exported. Every section F check at send time: blocks, person mute, chat mute, `channel_member_mutes`, hidden club, `removed_at`, restricted actor/recipient, `read_at`/`last_read_at`, Terms. Preferences from `otto_settings`. Per-recipient and pair caps. Staleness cutoff. Merge the mention and the DM push for the same `message_id`. Payload: declarative shape, **absolute** `navigate` (C2), `app_badge` in both places (C1), `mutable:false`, readable `tag`, hashed `Topic` (C18), D2 wording rules, `checkText`. Cron route guarded by `CRON_SECRET`. |
| 2E Writer kicks | `src/app/api/me/threads/[id]/messages/route.ts`, `src/app/api/me/follow/route.ts`, `src/app/api/posts/[id]/like/route.ts`, `src/app/api/posts/[id]/comments/route.ts`, `src/lib/mentions.ts`, `src/lib/orgs/membership.ts` | Messages route: after the insert, `after(() => enqueueMessagePush(...))` for DM/group members except the sender (requests flagged; club channels skipped). Everywhere else: `after(kickPushDrain)`. Kicking from inside `insertMentionNotifications` and `notifyOrg` covers publish-post, post edit, chat mentions, invites and approvals without touching their five callers. |

Acceptance, wave 2:
- Unit tests (endpoint validation, payload per kind incl. "no paid identity" and "connection → none",
  config), `tsc`, eslint.
- Local stack, applied by the acceptance agent only: the migration applies, and the post-check passes with
  0 functions denying EXECUTE.
- A direct `notifications` insert still succeeds with `push_outbox` renamed away (the trigger fails open).
- Local Chrome on `next dev`, local VAPID pair:
  - avery subscribes; blake's like, comment, @mention and DM each reach avery.
  - Blocked either way: no push. Muted chat: no push. Muted person: no push.
  - A restricted blake: no new rows. Sign-out: the row is gone.
  - A direct PostgREST comment with a filtered word gives the generic line.
  - The DevTools "Push" test payload doesn't throw.
- Production: the migration (Franky's yes, pre-flight measured on prod), then a GET-only smoke.
  `PUSH_ENABLED` stays unset.

### Wave 3: what students touch
| Batch | Files it owns | Scope |
|---|---|---|
| 3A Settings card | `src/components/settings/SettingsClient.tsx`, `src/components/settings/NotificationsCard.tsx`, `src/app/api/me/otto/settings/route.ts`, `src/components/otto/OttoSettings.tsx` | Card after Campus tour, `id="notifications"`. Shows:<br>• this-device on/off<br>• per-kind toggles (D1 defaults)<br>• "Show message previews" (D2)<br>• iOS Safari not installed: "Add Vibe to your Home Screen first" + opens the coach<br>• denied: how to re-enable per platform<br>• desktop Chromium: an Install button<br>Whitelist the `push_*` keys; make Otto's "Ping on mentions" the same key. Wire `leaveDeviceClean()` into Settings **Sign out** (after `r.ok`) and **Delete account** (after `data.ok`). Export `CARD_GLASS`/`SectionTitle`. |
| 3B Client push lib | `src/lib/pwa/push-client.ts`, `src/lib/pwa/push-state.ts` (+ `.test.ts`), `src/lib/pwa/leave-device-clean.ts`, `src/components/pwa/ServiceWorkerRegistrar.tsx` | `turnOn()` calls `requestPermission`/`subscribe` synchronously inside the tap handler (no `await` first). It prefers `window.pushManager` (iOS 18.4+), else `registration.pushManager`. It treats `default` after a prompt as "not now" (Chrome 155 chip). `leaveDeviceClean()`: read endpoint → server delete (the logout body or DELETE route) → `unsubscribe()` → `caches.delete` all → clear `vibe_user_v1`, `vibe_posts_v1`, `vibe_relationships_v1` + `clearDraft()` → `SIGNED_OUT` to the SW. The registrar re-syncs the subscription on every open (iOS has no `pushsubscriptionchange`) and sets `setAppBadge` from `/api/me/badge` on visible. |
| 3C Other sign-out paths | `src/app/account/suspended/suspended-actions.tsx`, `src/app/auth/terms/accept-terms-form.tsx`, `src/app/auth/verify-school/page.tsx`, `src/components/auth/EmailLinkProblem.tsx`, `src/lib/moderation/actions.ts` | Call `leaveDeviceClean()` before navigating. The two browser-only sign-outs (verify-school `:235`, EmailLinkProblem `:75`) must hit the DELETE route **before** `signOut`. `restrictUser` deletes a banned user's push rows (belt; the sender re-checks anyway). |
| 3D Install coaching | `src/components/pwa/InstallCoachSheet.tsx`, `src/components/pwa/install-coach-view.ts` (+ `.test.ts`), `src/components/pwa/InstallBanner.tsx`, `src/components/mobile/CampusMobile.tsx` | Pure "which card" from platform × installed × dismissed × session count × campus-confirm-showing. vaul sheet at z 10400/10401, house chrome. Banner in the `CampusConfirmBanner` slot (`CampusMobile.tsx:631`), one banner at a time, `vibe_install_nudge_v1` in localStorage with a 14-day snooze, every storage call in try/catch, renders nothing on failure. Android/desktop: `prompt()` from the stashed event. |
| 3E Contextual asks + list refresh | `src/components/mobile/OttoMobile.tsx`, `src/components/mobile/MessagesMobile.tsx` | Otto tab: "Get these on your lock screen" (installed only). Messages: after the first DM sent, "Know when they reply" (installed → push ask; Safari → install coach). Refetch the thread list on `visibilitychange → visible` (G2). |

Acceptance, wave 3:
- Local Chrome: each of the five sign-out paths plus account deletion removes the row and the browser
  subscription. The next account on the same browser receives nothing meant for the previous one.
  Per-kind toggles change what the dispatcher sends.
- A 375 px pass as a non-admin, walked by hand. Remember a magic link doesn't switch accounts.
- **[iPhone]** P1–P10 in section 6, on production with `PUSH_ENABLED=true` and `PUSH_ALLOWLIST` set to
  the founders.

### Wave 4: polish + launch gate
| Batch | Files it owns | Scope |
|---|---|---|
| 4A Update toast | `src/app/api/version/route.ts`, `src/components/pwa/UpdateToast.tsx`, `src/app/layout.tsx` | `force-static` route returning `VERCEL_GIT_COMMIT_SHA` (needs system env vars exposed; UNVERIFIED). "New version, tap to refresh" on visible. |
| 4B Richer install | `src/app/manifest.ts`, `public/screenshots/*` | 3–5 narrow + 1–2 wide screenshots from **seeded local accounts only**, plus a `description`. |
| 4C Reset code (only if D5 = b) | `src/app/api/auth/password-reset/route.ts`, `src/lib/email/resend-transactional.ts`, `src/app/auth/update-password/page.tsx` | An 8-digit code beside the link, 30 min, spent on submit, rate-limited like the school code. |
| 4D Runbook + record | `docs/pwa/RUNBOOK.md`, `public/journal/vibe_journal.html` (absolute path), next handoff | Kill-switch steps, "bump `SW_VERSION`", how to test, the env list, "never rotate VAPID". |

Launch gate, after wave 4:
1. Every **[iPhone]** item passes on iOS 26/27, and ideally one iOS 16.4–18.3 device for the SW path.
2. Android items A1–A4 pass.
3. Re-run both sentinels over the push routes (S64 §11 "next").
4. Remove `PUSH_ALLOWLIST`; `PUSH_ENABLED` stays `true`.

---

## 5. Blockers outside the code

### Plain English
These need Franky, James or Rylan at a dashboard or with a phone in hand. None needs an Apple Developer
account: Apple says web push doesn't need one (web-ios.md §c, confirmed in web-ios.factcheck.md #14).

1. **VAPID keys, once and forever.**
   - Run `npx web-push generate-vapid-keys` once and put the pair in the founders' password manager.
   - On Vercel, **Production only**:
     - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
     - `VAPID_PRIVATE_KEY` (Sensitive)
     - `VAPID_SUBJECT`: a real `mailto:` on our domain, never localhost, which Apple rejects. `help@`
       is fine, even though its delivery is still unproven (S64 §11).
     - `PUSH_ENABLED=true` only when dark-launching; `PUSH_ALLOWLIST` = the founders' user ids.
   - Local: a **different** pair in `.env.development.local`.
   - **Rotating the production pair kills every subscription.** Never set any of these on Preview; it
     shares the live database.
2. **Vercel project settings to read, and fix if needed:**
   - The Node.js version must not be 20.x (deprecated 2026-10-01; web-android-push.factcheck.md #30).
   - The plan tier decides whether a per-minute cron is possible (gap B1).
   - Is Skew Protection on?
   - Are System Environment Variables exposed (needed for `VERCEL_GIT_COMMIT_SHA`)?
   - Is Deployment Protection on Preview?
   - `NEXT_PUBLIC_SITE_URL` must be exactly `https://www.connectvibe.app` in Production. Stripe returns
     and push links must stay on the installed host.
3. **Supabase dashboard (production), read only:** the refresh-token rotation and reuse-interval settings,
   for C3b. If rotation is on, the device test I2 decides whether we need to act.
4. **The production migration:** Franky's explicit yes, a read-only pre-flight measured on production, a
   curl through the management API, then the `schema_migrations` row. Code ships before the migration.
5. **Devices:**
   - A real iPhone on iOS 26 or 27 with Vibe added from Safari. A second iPhone on iOS 16.4–18.3 is
     ideal, since that's the only way to exercise the service-worker push path on iOS.
   - A second non-admin account on another device to send the DMs and likes.
   - An Android 13+ phone with Chrome.
   - On the iPhone, turn on Web Inspector (Settings → Apps → Safari → Advanced) so Mac Safari can inspect
     the installed app.
6. **Stripe from the installed app** can't be proven on iPhone until billing is on somewhere with HTTPS.
   Production billing stays off until the LLC bank account exists, and Preview must never hold Stripe keys.
   Run this test during the Stripe go-live window.
7. **Icons are baked in at install** on iOS and Android (WebAPK re-mints only on Wi-Fi + charging). The
   brand icon, name and status-bar style must be final **before** any tester installs.

---

## 6. What needs a real device (the [iPhone] and Android items)

### Plain English
These can't be checked from the Mac. Each is a step Franky, or a tester, does on a phone against
production, signed in as a non-admin founder test account. "iPhone" means iOS 26/27 unless noted.

**Install shell (after wave 1):**
- I1. Safari: the coach steps match the phone (… → Share → Add to Home Screen → Open as Web App on). The
  icon and the name "Vibe" are right. The app opens standalone at `/campus`.
- I2. **Sign in in Safari → install → open: already signed in? Then use Safari and the app alternately for
  70+ minutes.** Is either one signed out (C3b)?
- I3. Status bar with `default`: no seam against cream, no content under the clock or Dynamic Island,
  safe areas right on every tab. Overscroll shows cream (G1).
- I4. Keyboard up, then down, in the Messages composer and the post composer: the layout recovers.
- I5. Every screen has a way back (edge-swipe works too); legal Back lands on `/campus`.
- I6. Email links: confirm, school verify and reset open Safari. The 8-digit code finishes inside the app.
- I7. Résumé "Open file", photo library and camera pickers, video playback, and the `.ics` export all work
  in standalone.
- I8. Airplane mode shows the offline page; it reloads on reconnect. A kill-switch drill on the installed
  app leaves it working.
- I9. Added from a non-start page: where does it open (gap B12)? iPad landscape shows the desktop tree
  inside the app.
- I10. Instagram / TikTok in-app browsers: the "Open in Safari" coach appears.

**Push (after wave 3, founder allowlist on production):**
- P1. In a Safari tab: no push button, the "install first" copy shows instead. In the app: the button
  appears, and the system prompt appears only on the tap.
- P2. A DM from the second account arrives with the phone locked and the app closed. The wording follows
  D2, and "Show previews" changes it.
- P3. Tapping the notification opens that exact conversation (absolute `navigate`, C2).
- P4. The badge number on the icon matches unread notifications + DMs and clears after reading (C1).
- P5. Block the sender, mute the chat, mute the person: no pushes. An @mention doesn't break the chat mute.
- P6. A message request shows "New message request" only. A club invite doesn't name the club.
- P7. Sign out inside the app: no more pushes. Sign back in and turn it on again: pushes resume.
- P8. Delete the Home Screen icon, then send: the server gets 404/410 and deletes the row. Reinstall and
  resubscribe.
- P9. On iOS 16.4–18.3, if available: the service-worker path shows the same notification and tap target.
- P10. iOS Settings → Notifications → Vibe exists. "Show Previews: When Unlocked" hides the text.

**Android (Chrome, after wave 3):**
- A1. The Install button (`beforeinstallprompt`) makes a WebAPK in the app drawer. Samsung Internet shows
  "open in Chrome".
- A2. The Android 13+ notification permission prompt. The Chrome 155 chip timing out leaves `default`, and
  we back off.
- A3. A notification tap opens inside the installed app and reuses the open window (`launch_handler`).
- A4. There's no numeric badge on Android (expected); the tray dot appears.

---

## Sources checked by this critic (beyond the research files)
- WebKit `main`, `Source/WebCore/Modules/notifications/NotificationJSONParser.cpp`, fetched 2026-09-24
  (raw.githubusercontent.com): lines 115–124 (`navigate` parsed with no base URL), 142–151 (`mutable`),
  155–166 (`app_badge` top level), 207–214 (`icon`).
- Apple, Safari 17.2 release notes (documentation JSON, fetched 2026-09-24; released 2023-12-11): "Added
  support for copying cookies when saving a website to the Home Screen on iOS and iPadOS. (104438319)".
- Repo, read-only: `src/proxy.ts:94–98, 172–177, 218–243, 315–317`; `next.config.ts`;
  `src/app/layout.tsx`; `src/app/globals.css:34–40, 136`; `package.json`; `supabase/config.toml:154–169`;
  `src/app/api/auth/logout/route.ts:10–14`; `src/app/messages/page.tsx:17–35`;
  `src/components/mobile/MessagesMobile.tsx:400–411`; `src/app/plus/page.tsx:469, 706`;
  `src/app/orgs/[handle]/page.tsx:446`; `src/app/posts/[id]/PostPageClient.tsx:19`;
  `src/components/legal/LegalLayout.tsx:38–47`; `src/lib/moderation/text-filter.ts:1–3, 145`;
  `src/app/api/me/otto/settings/route.ts:18–26`; env file names and Supabase hosts (no values).
- `handoffs/2026-09-22-session-64-stripe-redaction-and-moderation.md` §3, §10b, §11.

