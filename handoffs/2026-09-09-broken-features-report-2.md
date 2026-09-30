# Vibe — Broken Features Report

**Prepared:** September 9, 2026  |  **Target:** https://www.connectvibe.app  |  **Method:** read-only breakage audit — 5 lenses over code, live database state, and the running site, with every user-impacting finding independently re-checked before it was kept.

> **What this is.** The sibling of the security report. That one asks "can someone attack this?"; this one asks "does this still work?" It hunts the failures that do not throw — a feature that renders nothing, a filter on data that is always empty, a defensive header that blocks a real screen — because those are invisible to type checks, to builds, and to a security review.
>
> **Scope.** Read-only: nothing was modified, no data was written, no migration was run. **No signed-in session was available**, so anything behind login was assessed from code and database state only — findings marked "needs authed test" are unconfirmed and should be checked with a real account.

**At a glance:** 19 live findings — 18 confirmed broken, 1 needing a live check. Verification dropped 2 already fixed and 1 false positives.

---

## Executive Summary

The app is up and the core loop works — people can sign in, post, scroll the campus feed, and send messages. But it is not currently in a state you'd want to hand to a new tester on a phone, which is how every one of your pilot students will open it. The worst single thing a tester hits: someone sends them a photo in a DM and they see an empty bubble. Nothing loads, nothing explains why, and the only fix is to go find a laptop. Right behind it, the Orgs tab on mobile shows "No orgs here yet" even though the clubs exist — a new student's honest conclusion is that nobody is on Vibe.

There is a clear pattern, and it is not random rot. Almost everything here is a contract that quietly drifted: the mobile client asks the API for a field the API stopped sending (or never sent), and instead of erroring it renders empty. That's the Orgs tab, the unread dot, the DM profile cards, and the four post APIs handing out raw storage keys instead of proxy URLs. A second cluster is the campus field you shipped last session — the column exists, zero user rows have it set, so the Map tab is empty for 100% of accounts and the "Go to Settings" fix it suggests doesn't actually fix it. A third cluster is everything a logged-out person sees: share cards, 404s, and profile links. The through-line is that the surfaces you personally use — signed in, on desktop — are healthy, and the surfaces you don't are where the drift accumulated.

Three of these cost real trust. DM media on mobile is first, because messaging is the reason someone opens the app twice, and it fails silently rather than showing an error you could apologize for. The empty Orgs tab is second, because emptiness reads as abandonment: a tester doesn't think "bug," they think "dead app," and that judgment is very hard to reverse. Third is the share path as a whole — a Vibe link pasted into a group chat unfurls as a naked "Vibe" with no picture or author, and a stale or mistyped link lands on Next's stock white 404 with no logo and no way back. That combination makes your only organic growth channel look broken and slightly untrustworthy at the exact moment someone is deciding whether to sign up.

What is genuinely fine matters as much as the list above. Nothing found in this run loses or corrupts data. No posts, messages, or accounts are at risk, no user is seeing another user's private content, and no fix here requires cleaning up bad rows — every confirmed break is display, routing, or metadata, so the repairs are code changes that take effect the moment they deploy. The campus feed works, including images and video. Messages are delivered correctly; it is only the media rendering that fails. Sign-in works (the page just paints late). Profiles load, the desktop experience is broadly intact, and the front-door signup bugs from last session are still fixed.

The large caveat: this run had no signed-in session, so everything behind the login wall was read from the code rather than exercised. That means the whole authenticated core — posting end to end, notifications, RSVPs, group chats, org creation, settings writes, Otto's panels with real data — was inferred, not observed. One finding is explicitly parked on that: trending tags and event search still hard-filter on the raw school field, which would go blank for anyone who sets a campus, and that needs a logged-in test to confirm. It also means severity may be understated in places, since some of these get worse with real data volume, and there could be authenticated-only breaks this pass simply could not see.

If you fix in one order, make it the two blockers first (mobile Orgs, DM media), then the post-image URL contract since it touches profiles, the viewer, and saved posts at once, then the share and 404 surfaces as a single batch before you invite anyone new. And schedule a signed-in pass as its own run — the blind spot in this report is the half of the product your testers spend the most time in.

---

## Blocking — a user cannot do this at all

### DM photos and videos never appear on a phone

**What breaks.** "Someone sent me a photo in a DM and on my phone there's just an empty bubble — I have to open it on a laptop to see it." Every image and video sent in a direct message renders as a blank bubble on mobile. Nothing indicates that media was even attached, so the conversation reads as if the sender sent an empty message.

**Why.** `src/app/messages/MessagesSwitch.tsx:28-37` routes every viewport under 900px to the mobile messages component. Inside `src/components/mobile/MessagesMobile.tsx:75-87`, the `MessageRow` type carries only `id`, `content`, `created_at`, `user_id`, `users` and `reactions` — no media fields at all — and the bubble around line 3104 renders `{message.content}` and nothing else. The data is not missing: the server selects `media_url`, `media_kind` and the post attachment at `src/app/api/me/threads/[id]/messages/route.ts:31` and signs the R2 URL at lines 171-185. Desktop reads those same fields and renders them at `public/html/messages.html:1304-1306`. Mobile simply drops them on the floor.

**Fix.** Add `media_url`, `media_kind` (and `attachment`, `parent_message_id`) to `MessageRow` in `src/components/mobile/MessagesMobile.tsx` and render them in the bubble, mirroring what desktop does at `public/html/messages.html:1304-1306`. As an interim guard, render an explicit fallback label ("Photo" / "Video") for any message whose `content` is empty, so a bubble is never blank even if the media itself fails to load.

**Where.** Grepping `src/components/mobile/MessagesMobile.tsx` for `media|attach` returns three hits, all of them the English word "immediately" inside comments — zero actual code references. Grepping for `<img|<video` returns no matches at all; the avatars are CSS `background:url` at lines 575 and 1043. The server-side media columns are confirmed at `src/app/api/me/threads/[id]/messages/route.ts:31,171-185`.

### The Orgs tab on mobile says there are no clubs on Vibe

**What breaks.** "There are no clubs on Vibe — the Orgs tab on my phone says 'No orgs here yet' even though my friend showed me Finance Club on his laptop." On a phone, the Campus → Orgs tab shows an empty list to anyone who has not already joined an org, which is most accounts. There is no way to browse or discover a club from mobile at all.

**Why.** `src/components/mobile/CampusMobile.tsx:177` calls `fetch("/api/orgs", { cache: "no-store" })` with no query string. The route at `src/app/api/orgs/route.ts:58` reads `url.searchParams.get("filter") === "discover" ? "discover" : "mine"`, so an absent filter falls through to `"mine"` and the response contains only the viewer's own memberships (mapped at `src/app/api/orgs/route.ts:105-112`). Desktop asks the same endpoint differently — it builds `new URLSearchParams({ filter: "discover" })` at `src/app/campus/campus-home.tsx:7748` — which is exactly why the same tab is populated on a laptop and empty on a phone.

**Fix.** Change the CampusMobile fetch to `/api/orgs?filter=discover`. The discover payload already carries `member_count`, `role`, `pending_request` and `dormant`, all of which `OrgRow` can render (including a Joined chip), so no server change is required. If the tab should show the viewer's own orgs first, either fetch both filters and merge client-side, or add a `filter=all` mode to the route.

**Where.** The three lines that tell the whole story: `src/components/mobile/CampusMobile.tsx:177` (no filter param), `src/app/api/orgs/route.ts:58` (absent filter defaults to `"mine"`), and `src/app/campus/campus-home.tsx:7748` (desktop sends `filter=discover`). The live database has 5 orgs — 3 verified, 2 public, including `finance-club` and `kelley-floor-university-tower` — and most accounts belong to none of them, so most phone users see a completely empty tab.

---

## Degraded — it works, but gives the wrong result

### Post photos are blank grey boxes everywhere except the feed

**What breaks** — "The photo on my club post shows up in the campus feed, but when I tap the post — or look at it on my own profile — the picture is just a blank grey box." It affects your own profile grid, other people's profile grids, the post viewer modal, and saved posts, on desktop and mobile alike.

**Why** — Post rows store an R2 object key, not a URL. Three routes convert it: `src/app/api/feed/route.ts:252-253` wraps it in `postMediaProxyUrl(row.id, row.media_url, "media")`, and so do `src/app/api/orgs/[slug]/profile/route.ts:93` and `src/app/api/users/[handle]/reposts/route.ts:125`. Four routes do not — `src/app/api/me/posts/route.ts:37`, `src/app/api/users/[handle]/posts/route.ts:80`, `src/app/api/posts/[id]/route.ts:39`, `src/app/api/me/bookmarks/route.ts:39` select `media_url,media_thumbnail_url` and hand the raw key back unchanged. Six renderers then use that value as an image source (`public/html/profile.html:8020-8021` and `:8151`, `public/html/_postViewer.js:558`, `src/components/mobile/PostViewerMobile.tsx:568`, `src/components/mobile/ProfileMobile.tsx:2011,2069,2251`), so the browser resolves the key as a relative path and 404s.

**Fix** — Apply `postMediaProxyUrl(row.id, row.media_url, "media")` and the `"thumbnail"` variant in all four routes, exactly as the feed route does. Fixing it at the API layer repairs all six renderers at once. Better still, move the mapping into one shared `serializePostRow()` that every post-returning route calls, so the next new route can't forget it.

**Where** — Live anonymous `GET https://www.connectvibe.app/api/users/frankycazares/posts?limit=20` returns post `c171e570` with `"media_url":"orgs/923896fb-…/posts/54a50f68-….jpg"`. Loading `/html/profile.html?handle=frankycazares` then fires `GET /html/orgs/923896fb-…/posts/54a50f68-….jpg` → 404, twice. `postMediaProxyUrl` landed in 30fb463 (2026-05-06) and was wired into the org and feed routes only; the per-user, per-post and bookmark routes were never back-filled.

### Tapping a shared profile link on a phone opens the desktop website

**What breaks** — "I tapped a Vibe profile link someone texted me and got the tiny desktop website squashed onto my phone instead of the app." Every profile link shared into a text thread or a DM lands a phone user on the desktop layout — which is the first thing most new people will ever see of Vibe.

**Why** — `src/app/profile/[handle]/ProfileHandleSwitch.tsx:37-45` calls `window.location.replace('/html/profile.html?app=1&handle=…')` inside a `useEffect` whose only guard is `if (isMobile) return`. `src/lib/use-is-mobile.ts:36-38` returns `false` from `getServerSnapshot()` during hydration, so on the effect's first run `isMobile` is still false and the redirect always fires. The sibling component `src/app/profile/profile-html-bridge.tsx:23-28` gets this right by checking `window.matchMedia("(max-width: 899px)").matches` directly; that guard was never copied over.

**Fix** — Copy the guard from `profile-html-bridge.tsx` into `ProfileHandleSwitch.tsx` and bail early inside the effect when `window.matchMedia("(max-width: 899px)").matches`. Longer term, make `useIsMobile` return `boolean | null` — null until resolved — so no consumer can act on a false negative during hydration.

**Where** — Live, Chromium at 375x812, anonymous, two cold loads of `https://www.connectvibe.app/profile/james`: final `location.href` = `/html/profile.html?app=1&handle=james` with `innerWidth` 375 and body text "vibe. Upload photo Choose gradient … James Andres". Introduced by 84a4b1b (2026-05-12), the commit that added visitor mode.

### The Campus Map tab is an empty dark screen for every single account

**What breaks** — "The Campus Map tab is just a dark screen telling me to pick my campus — there's no map." This is one of the five primary tabs on /campus, and it is empty for 100% of accounts, desktop and mobile.

**Why** — `src/app/api/campus-map/route.ts:43-55` returns `{ok:true, majors:[], orgs:[], reason:"no_school"}` whenever `(me.school ?? '').trim()` is falsy. Both clients branch on that flag and render the "pick your campus" overlay: `src/app/campus/campus-home.tsx:9323` and `:9384`, and `src/components/mobile/MapMobile.tsx:284` and `:392`. `users.school` is the campus column (`src/lib/iu/campus-scope.ts`) and it is empty for every row, because campus only became a self-declared field a few days ago and nothing back-filled the existing accounts.

**Fix** — Back-fill `users.school` for the 8 existing accounts (all IU Indianapolis pilot testers) with a one-row-per-user UPDATE, or ship a one-time in-app campus prompt. Until the column is populated, consider hiding the Map tab when `reason === "no_school"` rather than putting an empty state on a primary nav tab.

**Where** — SQL against production: `select handle, coalesce(nullif(trim(school),''),'(empty)') from public.users` returns `(empty)` for all 8 rows (frankycazares, james, mariman20134, leah, tyler, vibecqo, henryodie, ua1e46fa3e…). The empty column dates to 91e322a (2026-09-07); 2ebc276 and 1794253 (2026-09-09) removed the demo roster that had been masking it.

### Following the Map's "Go to Settings" prompt doesn't give you a map

**What breaks** — The empty Map tab tells you to pick your campus in Settings. You do, you come back, and the map is still empty — it now says "No zones yet" instead. The one action the product asks you to take does not produce the result it promises, which is worse than the original empty state because the user has already spent the effort.

**Why** — The CTA and the Settings control both work: the link points at `/settings#campus` and that anchor exists at `src/components/settings/SettingsClient.tsx:504`. The problem is the second gate. Once `school` is set, `src/app/api/campus-map/route.ts:58-62` selects peers with `.eq("school", school)` and drops the viewer, so with every other row still empty the peer set is zero, `majors` comes back `[]`, and both clients fall through to the `!hasData` branch — `src/app/campus/campus-home.tsx:9403` and `src/components/mobile/MapMobile.tsx:411`, "We'll start lighting up zones once more students at your school have a major set." Orgs don't rescue it either: `hasData` only checks `majors.length > 0`, so the org center stays hidden even though the orgs query runs unfiltered.

**Fix** — This is fixed by the same back-fill as the finding above: set `school` on all 8 accounts at once, and the map has peers to draw. If a partial back-fill isn't possible, make the "No zones yet" copy honest about being the first person on your campus rather than implying the map is loading toward something, and render the org center when `orgs.length > 0` even with no majors.

**Where** — Peer filter at `src/app/api/campus-map/route.ts:58-62`; `hasData` derivation at `src/app/campus/campus-home.tsx:9322`; the two empty states at `campus-home.tsx:9384` (no_school) and `:9403` (no zones), mirrored at `MapMobile.tsx:392` and `:411`.

### The unread dot on mobile messages never goes away — and group chats never get one

**What breaks** — "My phone shows an unread dot and a badge on messages I already read — it never goes away. And I never get a dot for group chats at all." Both halves are wrong in opposite directions, which makes the badge worthless: it's always on for DMs and always off for groups.

**Why** — `src/app/api/me/threads/route.ts:592-604` returns `unread` (computed at `:571-574` from the viewer's own `last_read_at`), plus `peer_last_read_at` and `is_request`. There is no `last_read_at` key in the response. `src/components/mobile/MessagesMobile.tsx:59` declares `last_read_at: string | null` on `ThreadEntry` anyway, and `:545-549` computes `unread = !!thread.last_message && thread.last_message.user_id === thread.peer?.id && (!thread.last_read_at || …)`. Because the field is always `undefined`, `!thread.last_read_at` is permanently true for any thread whose last message came from the peer — and the `thread.peer?.id` comparison is permanently false for group threads, which have no peer.

**Fix** — Use the server's value instead of re-deriving it: `const unread = !!thread.unread`, and count `threads.filter(t => t.unread).length` for the badge. Drop `last_read_at` from the mobile `ThreadEntry` type and add `unread: boolean`, so the type stops advertising a field the API doesn't return.

**Where** — Server field list at `src/app/api/me/threads/route.ts:592-604`; client type and derivation at `src/components/mobile/MessagesMobile.tsx:59`, `:314-322`, `:545-549`. The live DB confirms the server distinguishes the two states — viewer `5ecad222` has group memberships that can never light up under the client's rule.

### Photos and videos in DMs stop loading after five minutes

**What breaks** — "I opened the chat, read for a while, then tapped play on the video someone sent and nothing happens — it just sits there black." Any DM media you don't open within five minutes of the thread loading is dead until you reload the page, and it fails silently rather than showing an error.

**Why** — `src/lib/r2.ts:18` sets `DEFAULT_SIGN_EXPIRES_SEC = 300`, and `src/app/api/me/threads/[id]/messages/route.ts:178` calls `signMessageMediaGetUrl(key)` with no TTL override, so every chat media URL expires five minutes after it is minted. The 2-second poll (`POLL_MS` at `public/html/messages.html:1642`) does fetch fresh signed URLs, but the client throws them away on purpose: the comment at `public/html/messages.html:1190-1193` states the tradeoff — bubbles only re-render when message ids change, because re-signed URLs would remount `<img>`/`<video>` and flicker.

**Fix** — Either change fixes it alone. Pass a longer TTL for chat media, e.g. `signMessageMediaGetUrl(key, 60*60*6)`, so the URL outlives any realistic session. Or stop baking a signed URL into the bubble at all and render `<video src="/api/messages/<id>/media">` behind a proxy route that signs on demand — the pattern already used for post media.

**Where** — TTL at `src/lib/r2.ts:18`, unoverridden at `src/app/api/me/threads/[id]/messages/route.ts:178`; anti-remount comment at `public/html/messages.html:1190-1193`; poll interval at `:1642`. R2 does enforce the signature rather than serving anyway — tampering with `X-Amz-Date` on a live signed URL from `/api/orgs/sae/asset/logo` returned HTTP 400 InvalidArgument while the unmodified URL served.

### A dead link drops you on a blank white 404 with no way back into Vibe

**What breaks** — "I tapped a link someone sent me and got a blank white page that just says 404 — there's nothing to click, I don't even know it's still Vibe." No logo, no navigation, no sign-in link. This is the end of the road for anyone arriving from a stale share link or a typo'd handle.

**Why** — There is no `not-found.tsx` anywhere under `src/app`, so Next falls back to its stock not-found boundary. Routes that reach it in ordinary use: `/posts/<id>` calls `notFound()` for any post whose status isn't `published` (`src/app/posts/[id]/page.tsx:41` filters `.eq("status","published")`, `:121` calls `notFound()`) — 1 of the 24 posts in the database is already in that state; `/profile/<handle>` on an unknown handle; `/orgs/<slug>` likewise.

**Fix** — Add `src/app/not-found.tsx` with the Vibe wordmark and two links: `/campus` (or `/` for anonymous visitors) and `/auth/login`. The styling already exists in the "User not found" state in `public/html/profile.html` (~`:6982`). One small file retires an entire class of dead ends.

**Where** — `find src/app -name not-found.tsx` returns nothing. Live `GET https://www.connectvibe.app/notifications` → 404 whose body contains only `<h1 class="next-error-h1">404</h1>`, "This page could not be found.", and zero anchors. Same for `/profile/nosuchuser`, `/orgs/nosuchorg`, and `/posts/<random-uuid>`.

### Clicking a profile card inside a DM opens the app inside the messages panel

**What breaks** — "I clicked the profile card someone sent me in a DM and it opened the profile inside my messages panel — two sidebars, and the address bar still says Messages." Desktop Messages runs in an iframe, and three links inside it navigate the frame instead of the page.

**Why** — `X-Frame-Options` is `SAMEORIGIN` (`next.config.ts:57`), so the target page renders inside the frame rather than refusing. `/network` renders its own `CampusAppShell`, producing a second LeftNav next to the parent's. `/profile/<handle>` on desktop runs `window.location.replace('/html/profile.html?handle=…')` at `src/app/profile/[handle]/ProfileHandleSwitch.tsx:44`, which inside the frame targets the frame. All three bypass the escape helper that the rest of the file uses.

**Fix** — Route all three through the existing helper: `messages.html:1001` becomes `onclick="window.__vibeTopNav('/network');return false;"`, and both `_profilePreview.js:67` (drop `target="_self"`) and `_postViewer.js:548` get the same `__vibeTopNav` onclick.

**Where** — Offenders at `public/html/messages.html:1001`, `public/html/_profilePreview.js:67`, `public/html/_postViewer.js:548`. Contrast `public/html/messages.html:1022`, `:2110`, `:2577`, which correctly call `window.__vibeTopNav`; the helper is defined at `public/html/_persistence.js:55-63`. Live: `x-frame-options: SAMEORIGIN` on `GET /profile/frankycazares` → 200.

---

## Quiet failures — outages that look like emptiness

_Nothing found in this category._

---

## Cosmetic and latent

### Anonymous share-link visitors get a "Back to your profile" pill that dumps them on a login wall

**What breaks.** "My friend sent me his Vibe profile and the bar at the top says 'Viewing James Andres · Back to your profile' — I don't have an account, and clicking it just dumps me on a login screen." This is the first thing a stranger sees on a shared profile link: a bar addressed to someone else's session, and a dead end behind it. Share links are how new people find Vibe, so this is the cosmetic bug that costs the most.

**Why.** `public/html/profile.html:6965` calls `showViewerBackBanner(v.name)` inside the `if (viewingHandle)` branch with no check for a session, and `showViewerBackBanner` (`profile.html:7233-7249`) hardcodes `<a href="/profile">Back to your profile</a>`. `src/proxy.ts:80-83` deliberately lets `/html/profile.html?handle=<h>` through for anonymous visitors, so that branch now runs with no user — and the same proxy sends anonymous `/profile` requests to `/auth/login`.

**Fix.** Gate the pill on an actual session: either the cached `vibeLoad('vibe_user_v1')` test that `_otto.js:24` already uses to suppress the Otto ring for anonymous visitors, or a signal from the bootstrap response the page already fetches. For anonymous viewers, swap it for a "Join Vibe" / "Create your account" CTA — the exact moment a stranger is most likely to sign up.

**Where.** Live screenshots with no session on both `https://www.connectvibe.app/html/profile.html?handle=frankycazares` and `/profile/james` show the dark pill "Viewing &lt;name&gt; · Back to your profile" fixed at the top of the viewport; a DOM probe returned `{t: "Back to your profile", visible: true, href: "/profile"}`. `curl` confirms `/profile` → 307 to `/auth/login?next=%2Fprofile`. Code: `profile.html:6965`, `:7233-7249`; `src/proxy.ts:80-83`.

### The unread-messages dot on the desktop profile is fake

**What breaks.** "I opened someone's Vibe profile link without an account and it's showing me an unread-messages notification." And for signed-in users with real unread DMs, the opposite failure: "Why do the calendar, edit, settings and share buttons all have notification dots?" The badge is noise in both directions — it lies to logged-out visitors and it smears across five buttons for logged-in ones.

**Why.** `public/html/profile.html:3171` ships the dot in the markup: `<button class="nav-msg-btn has-unread" onclick="toggleMessenger()">`, drawn by the CSS rule at `profile.html:2065-2070`. `public/html/_miniMessenger.js:296` does `if (!j || !j.ok) return;` before ever calling `paintBadge`, so a 401 leaves that hardcoded class in place forever. When the badge code does run, `_miniMessenger.js:312` selects `document.querySelectorAll(".nav-msg-btn")` and toggles the class on all of them — and `profile.html` hands that class to five different buttons.

**Fix.** Drop `has-unread` from the static markup so the page starts clean and JS adds it. In `refreshBadge`, call `paintBadge(0)` on a non-ok response instead of returning. Scope `paintBadge` to the messages button alone — give it its own id or a `.nav-msg-btn--messages` class — rather than every `.nav-msg-btn`.

**Where.** Live screenshot of `https://www.connectvibe.app/html/profile.html?handle=frankycazares` with no session: an orange dot on the chat icon in the top nav; the network log for that load shows `GET /api/me/threads` → 401. Code: `profile.html:2065-2070`, `profile.html:3171`, `_miniMessenger.js:296`, `:312`.

### Profile preview cards in DMs are missing the major, the year, and the custom banner

**What breaks.** "When someone shares a profile in a DM, the card only shows the name and @handle — no major or year — and the banner is always the same generic gradient even though that person has a custom one." The card is a stripped-down version of the person it is supposed to introduce.

**Why.** `public/html/_profilePreview.js:96-99` reads `v.banner_gradient`, `v.major`, `v.year` and `v.school` (falling back to `v.studentMeta.*`). `src/lib/profile/build-vibe-user-v1.ts:116-120` sets `coverGradient`, never `banner_gradient`, and `:88-100` never emit `major`, `year`, `school` or `studentMeta` at all. `src/app/api/users/[handle]/bootstrap/route.ts:212` returns that object as-is. Only `src/app/api/me/profile-bootstrap/route.ts:108-110` adds `vibeUser.major` / `vibeUser.year` — which is why the fields exist on your own profile and vanish on everyone else's.

**Fix.** Cheapest version is two lines in `_profilePreview.js`: read `v.headline` (which already contains "Major · Year N") for the meta line, and `v.coverGradient` for the banner. The fuller fix is to add `major`, `year` and `coverGradient` to the viewer bootstrap's `vibeUser`, the way `/api/me/profile-bootstrap` already does.

**Where.** Live `GET https://www.connectvibe.app/api/users/frankycazares/bootstrap` returns `vibeUser` keys `[_isViewerMode, _onboarded, _viewerFollowState, avatarPhoto, bio, counts, coverPhoto, currentlyOn, handle, headline, id, location, name, pinnedPostId, skills, snapshot, studentVerification, tagline, vibeTag…]` — no `banner_gradient`, `major`, `year` or `school`.

### Every image and video re-downloads in full on every page load

**What breaks.** "The video on the feed just spins forever on campus wifi, and it re-buffers from the start every time I come back to the page." Nothing is technically broken, which is why this is filed as latent — but it means every media byte on Vibe is paid for again on every visit, by the phone and by the bandwidth bill.

**Why.** `src/app/api/posts/[id]/media/route.ts:66-71` and `src/app/api/orgs/[slug]/asset/[kind]/route.ts:57` call `signClipGetUrl` / `signOrgAssetGetUrl`, which build an AWS SigV4 presigned URL whose `X-Amz-Date` and `X-Amz-Signature` differ on every request (`src/lib/r2.ts:223-232`, `:273-282`). A URL that changes every time can never be a cache hit. Neither route sets `Cache-Control` on its 307, and the R2 S3 endpoint returns objects without one because nothing sets object metadata at upload time.

**Fix.** Snap the signed-URL expiry to a bucket — the top of the hour, say — so the same asset yields a stable URL within that window, and give the proxy's 307 a matching `Cache-Control: public, max-age=<window>`. Set `CacheControl` on R2 objects at upload time so the object response itself is cacheable.

**Where.** Two GETs of `https://www.connectvibe.app/api/posts/0436bc60-8d45-4d92-98f3-114ede37e887/media` two seconds apart returned different `Location` values (different `X-Amz-Date`/`X-Amz-Signature`). The 307 carries `cache-control: public, max-age=0, must-revalidate` and `x-vercel-cache: MISS`; the followed R2 response carries no `Cache-Control` and no `Access-Control-Allow-Origin`.

### Trending tags and event search will go empty the moment anyone picks a campus

**What breaks.** Nobody is hitting this today, and that is the only reason it is quiet. The failure, once a user sets a campus: "Ever since I set my campus in settings, the Trending tags strip is blank and searching for an event returns nothing — it worked before I picked a campus." This one still needs a live signed-in check to confirm — set `school` to a valid campus label on one test account and hit `/api/trending/hashtags` and `/api/search?q=<event word>`.

**Why.** `src/app/api/trending/hashtags/route.ts:57` does `if (school) query = query.eq("author.school", school)` on an inner-joined author. `src/app/api/search/route.ts:265` does `if (viewerSchool && r.creator?.school !== viewerSchool) continue`. Both compare the raw stored string. Neither uses `campusOrFilter("school", label)` from `src/lib/iu/campus-scope.ts` — the contract `/api/events` and `/api/orgs` adopted in `91e322a`, which deliberately keeps campus-less rows visible. That commit converted those two routes and left these two behind on the old semantics.

**Fix.** Route both through `resolveCampusScope` + `campusOrFilter`, so campus-less rows stay visible and `?campus=all` is reachable.

**Where.** `src/app/api/trending/hashtags/route.ts:57`; `src/app/api/search/route.ts:265`; contrast `src/app/api/events/route.ts` (`campusOrFilter` + `resolveCampusScope`) and `src/app/api/orgs/route.ts:174`. Live DB: `users.school = ''` for all 8 accounts, which is exactly why the bug is invisible right now. Introduced by `91e322a`.

### /auth/login server-renders nothing but "Loading…"

**What breaks.** "The sign-in page just said 'Loading…' for a moment instead of showing the email and password boxes." On a slow connection that moment stretches; if scripts fail to load at all, it never ends and there is no form on the page. The signup page does not have this problem, so the two front doors behave differently.

**Why.** `src/app/auth/login/page.tsx:1` is `"use client"` and `LoginForm` calls `useSearchParams()` at `:12`. Next.js opts a Suspense boundary containing `useSearchParams` out of server rendering entirely, so only the fallback is streamed. The signup page does not read search params at the top level, which is why its inputs SSR.

**Fix.** Move the search-param read out of the render path: make `src/app/auth/login/page.tsx` a server component that awaits `searchParams` and passes `next`, `error` and `school_verified` as props into a small client form — the structure signup already uses.

**Where.** `curl -s https://www.connectvibe.app/auth/login`, tags stripped, yields exactly "Vibe" then "Loading…", and grep for `<input` returns nothing. `curl -s https://www.connectvibe.app/auth/signup | grep -oE 'type="(email|password|submit)"'` returns one of each, present in the server-rendered HTML.

### "+ Add an event" in the desktop Messages calendar throws

**What breaks.** "I clicked '+ Add an event' on the calendar in Messages and nothing happened." The click throws a JavaScript error, so the button is inert every time. Reach is narrow — the calendar lives in the desktop Messages left rail, which is hidden in the embedded view (`messages.html:24`, `body.vibe-embedded .left-nav { display: none !important; }`) — which is why this sits in latent rather than higher.

**Why.** `public/html/messages.html:1595` does `document.getElementById('evtName').value=''` and `:1599` does `document.getElementById('createEventModal').classList.add('open')`. `grep -c 'id="createEventModal"' public/html/messages.html` returns 0, and `git log -S` for that id on the file returns no commits. The markup was never there — those ids exist only in `profile.html`. The handler has been calling into nothing since the day it was written.

**Fix.** Either port the create-event modal markup from `profile.html` into `messages.html`, or remove the "+ Add" affordances and make the messages calendar read-only. Cheapest safe fix: guard `_openCreateForm` with a null check and no-op, so the button cannot throw.

**Where.** `public/html/messages.html:1591-1602` (`openCreateEvent` / `_openCreateForm` / `closeCreateEvent`), `:1535` and `:1585` (the buttons that call them), `:948` (the `openCalModal` trigger, inside the `<aside class="left-nav">` opened at `:921`). Zero id matches in markup and zero commits ever adding them.

---

## Fix Order

# Fix order — breakage sweep, 2026-09-09

Verified against the repo before writing: the four post routes still select raw `media_url`, `CampusMobile.tsx:177` still fetches `/api/orgs` with no filter, `MessagesMobile.tsx:545` still derives unread from `last_read_at`, and there is no `not-found` file anywhere under `src/app`.

Three of these can only be *confirmed* while signed in (noted per item). Everything else is checkable logged out.

## Right now — a tester hits these in their first session

**1. Post images are blank everywhere except the feed (one root cause, four routes).**
Apply `postMediaProxyUrl(row.id, row.media_url, "media")` and the `"thumbnail"` variant — copy the two lines from `/Users/franciscocazares/vibe/src/app/api/feed/route.ts:252-253` — into:
- `/Users/franciscocazares/vibe/src/app/api/me/posts/route.ts:37`
- `/Users/franciscocazares/vibe/src/app/api/users/[handle]/posts/route.ts:80`
- `/Users/franciscocazares/vibe/src/app/api/posts/[id]/route.ts:39`
- `/Users/franciscocazares/vibe/src/app/api/me/bookmarks/route.ts:39`

Fixing the API layer fixes all six renderers (profile grid, post viewer, saved, desktop + mobile) at once — do not touch the renderers.
**Confirm:** logged out, `curl 'https://www.connectvibe.app/api/users/frankycazares/posts?limit=20'` returns a `/api/...` proxy path, not `orgs/923896fb-.../....jpg`; load `/html/profile.html?handle=frankycazares` and the network tab shows zero image 404s. The saved-posts and own-profile halves need a signed-in session — check both after deploy.

**2. Photos and videos in DMs render as an empty bubble on phones.**
`/Users/franciscocazares/vibe/src/components/mobile/MessagesMobile.tsx:75-87` — add `media_url`, `media_kind`, `attachment`, `parent_message_id` to `MessageRow` and render them in the bubble, mirroring `/Users/franciscocazares/vibe/public/html/messages.html:1304-1306`. Ship the empty-content fallback ("Photo" / "Video") in the same pass so no bubble can ever be blank again.
**Confirm:** signed in only — send yourself a photo from desktop, open that thread at 375px wide, the image renders.

**3. Mobile Campus → Orgs is empty for everyone.**
`/Users/franciscocazares/vibe/src/components/mobile/CampusMobile.tsx:177` — `fetch("/api/orgs?filter=discover", { cache: "no-store" })`.
**Confirm:** signed in on a phone, Campus → Orgs lists Finance Club and Kelley Floor; an account that belongs to an org still shows its Joined chip.

## This week

**4. Profile links texted to a phone open the squashed desktop page.**
`/Users/franciscocazares/vibe/src/app/profile/[handle]/ProfileHandleSwitch.tsx:37-45` — bail inside the effect on `window.matchMedia("(max-width: 899px)").matches`, the guard that already works at `/Users/franciscocazares/vibe/src/app/profile/profile-html-bridge.tsx:23-28`. Then make `useIsMobile` (`/Users/franciscocazares/vibe/src/lib/use-is-mobile.ts:36-38`) return `boolean | null` so no other consumer can act on the hydration-time `false`.
**Confirm:** logged out, cold-load `/profile/james` in a 375x812 window — URL stays `/profile/james`, mobile layout. Must be a fresh load; the bug only fires on first hydration. This does *not* fix item 6 — desktop still redirects inside the frame.

**5. Mobile unread dot never clears, group chats never get one.**
`/Users/franciscocazares/vibe/src/components/mobile/MessagesMobile.tsx` — use the server's value: `const unread = !!thread.unread` (:545-549), badge from `threads.filter(t => t.unread).length` (:314-322), and swap `last_read_at` for `unread: boolean` on `ThreadEntry` (:59) so the type stops advertising a field the API never sends.
**Confirm:** signed in on a phone — open an unread thread, back out, dot is gone; a new group-chat message lights the group thread.

**6. Three links inside the desktop Messages iframe hijack the frame.**
Route all three through the existing `window.__vibeTopNav` escape helper: `/Users/franciscocazares/vibe/public/html/messages.html:1001`, `/Users/franciscocazares/vibe/public/html/_profilePreview.js:67` (drop `target="_self"`), `/Users/franciscocazares/vibe/public/html/_postViewer.js:548`.
**Confirm:** desktop Messages — click a shared profile card, a post, and the /network link; each replaces the whole page (address bar changes, one sidebar, not two).

## When convenient

**7. Branded 404.** There is no `not-found.tsx` under `src/app` at all, so every bad URL is Next's stock white page. Add `/Users/franciscocazares/vibe/src/app/not-found.tsx` with the app shell and a "Back to Campus" link. (The finding text I was given is truncated mid-sentence, so treat scope as "the default 404" until someone re-reads it.)
**Confirm:** hit `/nonexistent` logged out and signed in, at 375px and desktop — Vibe chrome, working link home.

**8. One `serializePostRow()` helper.** After item 1 ships, move the media mapping into a single shared serializer every post-returning route calls, so route number seven cannot forget it.
**Confirm:** grep for `media_url` in `src/app/api/**/route.ts` returns no route that maps it by hand.

## Needs a decision, not a fix

**9. The Campus Map is empty for 100% of accounts because nobody has declared a campus.** The code is correct — `/Users/franciscocazares/vibe/src/app/api/campus-map/route.ts:43-55` returns `reason:"no_school"` and all 8 production rows have `users.school = ''`. Your call between: (a) a one-time UPDATE setting all 8 pilot accounts to IU Indianapolis, (b) a one-time in-app campus prompt, (c) hiding the Map tab while `reason==="no_school"` instead of parking a "Go to Settings" overlay on a primary nav tab. (a)+(c) unblocks this week; (b) is what you need before a second campus.

**10. Whether Messages keeps framing app routes at all.** `X-Frame-Options: SAMEORIGIN` (`/Users/franciscocazares/vibe/next.config.ts:57`) is doing exactly what session 54 asked for, but it converts every in-frame link into a potential double-shell bug — item 6 will recur with each new link. Either commit to the iframe and make `__vibeTopNav` mandatory (a grep check in CI for raw `href="/` in `public/html/*`), or stop framing app routes. Patching link-by-link forever is the option that loses.

---

## Appendix A — All findings

| # | Finding | Impact | Status | Surface | Viewport | Lens |
|---|---------|--------|--------|---------|----------|------|
| 1 | Mobile Campus → Orgs tab shows an empty list because it asks the API for "my orgs" instead of the directory | Blocking | confirmed_broken | mobile campus, Orgs tab | mobile | contract-drift |
| 2 | Photos and videos sent in DMs are invisible on mobile — the bubble renders empty | Blocking | confirmed_broken | messages / DMs on a phone | mobile | render-blockers |
| 3 | The Campus Map tab is empty for 100% of accounts — no user row has a campus set | Degraded | confirmed_broken | the Campus Map tab (5th tab on /campus, desktop and mobile) | both | recent-regression |
| 4 | Opening a profile share link on a phone hard-redirects to the squashed desktop page | Degraded | confirmed_broken | a shared /profile/<handle> link opened on a phone | mobile | live-smoke |
| 5 | Post images are broken everywhere except the feed — four post APIs return the raw R2 object key instead of the proxy URL | Degraded | confirmed_broken | profile posts grid (own and others'), post viewer modal, saved posts | both | contract-drift (+3 lenses) |
| 6 | Mobile messages compute unread from a field the API never sends, so the dot never clears | Degraded | confirmed_broken | mobile messages, thread list | mobile | contract-drift |
| 7 | Three links inside the desktop Messages iframe load the app into the iframe instead of the page | Degraded | confirmed_broken | desktop messages | desktop | dead-ends |
| 8 | Every 404 is Next's stock white page — no logo, no navigation, no way back into the app | Degraded | confirmed_broken | any 404 (dead links, stale share links, typo'd handles) | both | dead-ends |
| 9 | DM media URLs expire after 5 minutes and the desktop client deliberately refuses to refresh them | Degraded | confirmed_broken | messages / DMs on desktop | desktop | render-blockers |
| 10 | Following the Map's "Go to Settings" CTA does not fix the Map — it swaps one empty state for another | Degraded | confirmed_broken | the Campus Map tab + Settings → Campus | both | recent-regression |
| 11 | Post share links unfurl as a blank "Vibe" card because the page 307s to login before the crawler reads its OG tags | Degraded | confirmed_broken | pasting a Vibe post link into iMessage, Discord, Slack, or Twitter | both | live-smoke |
| 12 | Sharing connectvibe.app itself produces a bare card — the root layout defines no OpenGraph metadata at all | Degraded | confirmed_broken | the marketing homepage link, anywhere it gets pasted | both | live-smoke |
| 13 | Profile preview cards in DMs read four fields the viewer bootstrap never returns | Cosmetic | confirmed_broken | profile preview card in DMs and the mini messenger (desktop) | desktop | contract-drift |
| 14 | The desktop profile's unread-messages dot is hardcoded in markup and never clears for logged-out visitors | Cosmetic | confirmed_broken | the messages icon in the desktop profile top nav | desktop | recent-regression |
| 15 | Anonymous share-link visitors get a "Back to your profile" pill that dumps them on a login wall | Cosmetic | confirmed_broken | desktop public profile viewer (/profile/<handle> → /html/profile.html?handle=<h>) | desktop | live-smoke (+1 lenses) |
| 16 | /auth/login server-renders nothing but "Loading…" — the form exists only after hydration | Cosmetic | confirmed_broken | the sign-in page | both | live-smoke |
| 17 | Trending and event search still hard-filter on raw users.school, so they go empty the moment anyone picks a campus | Latent | needs_authed_test | Otto trending strip (both viewports), search results "Events" section | both | contract-drift |
| 18 | Every R2-backed image and video is re-downloaded in full on every page load | Latent | confirmed_broken | campus feed, org pages, clips — anywhere R2 media appears | both | render-blockers |
| 19 | "+ Add an event" in the desktop Messages calendar throws — the modal it opens does not exist on that page | Latent | confirmed_broken | the calendar widget in the desktop Messages left rail | desktop | recent-regression |

## Appendix B — Method & coverage

- **Lenses (5):** Client/server contract drift; Dead ends, dead links and gate traps; Render blockers: frames, assets, scripts, media; Recent-change regression sweep; Live smoke test of the running site.
- **Merge:** 27 raw findings from 5 independent lenses were folded into 23 canonical findings before verification (duplicates seen by several lenses count once; the trail is kept per finding).
- **Verification:** every Blocking or Degraded finding was re-checked by an independent agent instructed to disprove it; already-fixed and false-positive items were dropped before this report.
- **Impact scale:** Blocking = the feature cannot be used. Degraded = usable but wrong or incomplete. Cosmetic = looks wrong, still works. Latent = fine today, breaks on a foreseeable condition.
- **Not covered:** performance and load, real device testing, anything requiring a POST or a state change, and every authenticated surface (no session this run).
- **Inventory basis:** RECON SNAPSHOT (2026-09-09, read-only; no edits, no writes, ~85 anonymous GETs). STATE: local HEAD == origin/main == 9f6dd56 (session 55 journal). Live www.connectvibe.app is running >= ac00ff1: the S55 proxy gating of /html/*.html is live, the new "Create your account" landing pill is live, and /html/_mockUsers.js (deleted in ac00ff1) 404s. `npx tsc --noEmit` is clean. DB schema_migrations top = 20260906130000 (consent_db_boundary) == newest file in /Users/franciscocazares/vibe/supabase/migrations — repo and DB agree; no migrations in the last 2 days. REAL DATA (Supabase, read-only): 8 users, all with handle + school_verified=true; 7 have otto_answers (user `ua1e46fa3e…` does not); ONLY 1 of 8 (frankycazares) has a complete consent record (terms_version 2026-05-07 + both timestamps) — the other 7 (james, vibecqo, mariman20134, tyler, leah, henryodie, ua1e…) will be redirected to /auth/terms by enforceCampusAccess on every gated page AND get 403 terms_required from /api/me/profile-bootstrap and every write route until they accept. users.school = '' for ALL 8 → /api/campus-map returns {majors:[],orgs:[],reason:"no_school"} for everyone (Map tab on desktop campus-home + MapMobile shows the "pick your campus" empty state), while /api/feed, /api/events, /api/orgs?filter=discover, suggested-connections fall back to "all campuses" (src/lib/iu/campus-scope.ts). 3 platform admins (frankycazares, james, vibecqo). 24 posts (23 published), 5 orgs (public: finance-club, kelley-floor-university-tower; private: sae, private-equity-club, cs-club), 8 events (1 in the future), 22 channels / 25 channel_members / 51 messages, 17 connections, 45 notifications, 1 otto_reminder, 6 rate_limit rows. ARCHITECTURE SEAMS: (1) src/proxy.ts (middleware, moved from repo root in 2ebc276) refreshes the Supabase cookie on every non-asset request and gates /html/*.html: anonymous → /auth/login?next=<clean route>; signed-in without ?app=1 → clean route; ?app=1 allowed only for profile.html + messages.html; the single anonymous exception is /html/profile.html?handle=<h> (desktop share-link viewer); ?user=<h> → 307 /profile/<h>. The gate matches only paths ending in .html, so /html/_*.js are served to anyone. (2) Viewport fork: src/lib/use-is-mobile.ts = matchMedia(max-width:899px) via useSyncExternalStore; SSR ALWAYS renders the desktop branch, mobile flips after hydration. (3) Server gates: src/lib/auth/campus-access.ts enforceCampusAccess = login → consent → school_verified → otto complete (redirect chain /auth/login → /auth/terms → /auth/school-email → /onboarding); src/lib/legal/require-terms.ts 403s content-producing APIs. (4) Self-framing (X-Frame-Options SAMEORIGIN live-confirmed on / and on /html/profile.html): MessagesSwitch iframes /html/messages.html?app=1&embedded=1; OnboardingSwitch iframes /onboarding/classic (a route handler that re-runs the gates and serves public/html/onboarding.html with no-store); OnboardingMobile.tsx:777, onboarding.html:502 (#resumeMiniFrame) and profile.html:4520 iframe resume previews via /api/resume/** signed URLs. (5) Desktop /profile is NOT framed: ProfileHtmlBridge fetches /api/me/profile-bootstrap, writes localStorage vibe_user_v1, then window.location.replace('/html/profile.html?app=1') — the user leaves the React shell entirely and profile.html's own static left nav becomes the nav. (6) /otto server page fetches its own /api/me/otto over `${x-forwarded-proto}://${host}` with the raw cookie header forwarded (src/app/otto/page.tsx) — a host/cookie seam that cannot be live-tested anonymously. (7) public/html/_persistence.js is loaded synchronously in <head> by all three static pages: it reads localStorage, repaints the sidebar chip, refetches /api/me/profile-bootstrap and redirects to /auth/terms on 403 — any regression there hits desktop profile, messages and onboarding at once. (8) No error.tsx / not-found.tsx / loading.tsx anywhere under src/app — every failure surfaces as the default Next 404/500. No CSP header (inline scripts in static pages). LIVE ANONYMOUS RESULTS (all 307 targets verified): / 200 (HSTS, nosniff, XFO SAMEORIGIN, Referrer-Policy, Permissions-Policy present); /auth/login, /auth/signup, /auth/forgot-password, /auth/verify-school, /legal/terms, /legal/privacy 200; /auth/terms → login (next=/auth/terms?next=/onboarding), /auth/school-email → login; /campus /network /messages /otto /settings /the-map /admin /onboarding → /auth/login?next=…; /profile → login (proxy); /onboarding/classic 302 login; /feed → /campus (flag NEXT_PUBLIC_SHOW_GLOBAL_FEED is off in prod) → login; /opportunities → /campus; /html/landing.html → /; every other /html/*.html → login with clean next (profile.html?app=1 included); /html/profile.html?handle=frankycazares 200 (421 KB static); /profile/frankycazares 200 with full OG (title, description, avatar image), handle case-insensitive; /profile/<unknown> 404; /orgs/finance-club 200; /orgs/sae (PRIVATE org) 200 to an anonymous visitor (43 KB; page is service-role rendered, posts are always fetched, any member-only gating lives in src/app/orgs/[handle]/OrgContent.tsx — grep found no is_public gating there; needs a lens); /orgs/<unknown> 404; /posts/<real id> → 307 login (OG meta is emitted before the auth gate, per src/app/posts/[id]/page.tsx), /posts/<unknown or non-uuid> 404; /api/users/<h>/bootstrap 200 (includes website "http://localhost:3000/html/profile.html?app=1" as real data), /api/users/<h>/posts 200, /api/orgs/<slug>/profile 200, /api/orgs/sae/asset/logo 307 → signed R2 URL, /api/orgs/finance-club/asset/logo 404 (no logo), /api/posts/<id>/media 404 (no media) — everything else under /api 401 (including /api/health/* and /api/handle/check); /html/_persistence.js and _otto.js 200 to anyone; /journal/vibe_journal.html 200 (294 KB internal product journal is publicly served from public/journal); /robots.txt allows all, /sitemap.xml 404. CONFIRMED DEAD ENTRY POINTS: (a) /notifications 404 live — linked as "view all activity →" from src/components/otto/OttoActivity.tsx:67, rendered on BOTH desktop /otto (OttoPageClient.tsx:185) and mobile (OttoMobile.tsx:311). (b) /campus/discover 404 live — Link at src/app/campus/campus-home.tsx:13010 (desktop Campus). (c) /campus?tab=events&event=<id> (campus-home.tsx:3598 goEvent) — nothing reads an `event` param, so it lands on the Events tab without opening the event (code-confirmed, needs authenticated live check). (d) /profile?post=<id> fallback from public/html/_otto.js:771 — ProfileHtmlBridge forwards only `welcome`, so `post` is dropped before profile.html's ?post= consumer (profile.html:7084); ProfileMobile ignores it too (code-confirmed, low reach because openPostViewer usually exists). BEHIND LOGIN (not live-testable this run, reason from code + DB): everything under enforceCampusAccess (/campus, /feed, /network, /messages, /otto, /profile), /settings (login only, deliberately no consent gate), /onboarding + /onboarding/classic, /auth/terms, /auth/school-email, /the-map + /admin (platform admins only; others 404 / → /campus), /posts/<id> click-through, /html/profile.html?app=1 and /html/messages.html?app=1&embedded=1, and every /api/me/**, /api/orgs/** (except profile/asset), /api/events, /api/feed, /api/search, /api/campus-map, /api/posts/[id] (except media), /api/resume/**, /api/health/* (token).
