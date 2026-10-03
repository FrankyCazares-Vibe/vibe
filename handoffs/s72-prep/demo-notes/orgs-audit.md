# Orgs, Events and on-camera audit (Franky's account, phone, Night)

Date: 2026-10-02. Walked on http://localhost:3102 as franky@example.test in a headless
phone browser (390x844, dpr 2, dark, iPhone UA), READ-ONLY: nothing was followed, RSVP'd,
liked or posted. The database was read with read-only psql inside the local container
(`supabase_db_vibe`, `default_transaction_read_only = on`).

Legend: **RAN** = seen by running it. **CODE** = read in the source only.
Paths are relative to /Users/franciscocazares/vibe unless absolute.
Stills are in `notes/audit/` (list at the end).

---

## 1. Orgs

### 1.1 The Orgs tab on /campus (phone)

Component: `src/components/mobile/CampusMobile.tsx`, `OrgsPane` (lines 3112-3275), row = `OrgRow` (3299-3497).
Data: three reads, `GET /api/orgs?filter=discover`, `?filter=following`, and the invites inbox (`src/app/api/orgs/route.ts`).

Sections, in this fixed order (CODE 3210-3253, RAN):

1. **You're invited** (only when there is a live invite; Franky has none, so it is absent).
2. **Following**: every club the viewer follows OR is a member of, newest follow first, never re-sorted (3150). Member clubs read "Joined ✓".
3. **Verified**: the rest of the campus directory that is verified, A to Z.
4. **All clubs**: the unverified rest, A to Z (none on Bloomington today).

What Franky sees today (RAN, `03-orgs-top.png`, `03-orgs.json`; y = page px from the top of the page):

| # | Section | Row | Meta line | Controls | y |
|---|---|---|---|---|---|
| 1 | Following | North Hall | @north_hall · 3 members | Following ✓ / Join | 184 |
| 2 | Following | Tower Floor 3 | @tower_floor_3 · By request · 3 members | chip "Following" + Request | 330 |
| 3 | Following | Finance Club | @finance_club · 3 members | Following ✓ / Join | 422 |
| 4 | Following | Chess Club | @chess_club · 4 members | Following ✓ / Join | 568 |
| 5 | Following | SAE | @sae · Invite only · 3 members | Joined ✓ | 714 |
| 6 | **Verified** | **Bloomington Cycling (test)** | @test_bloomington_cycling · 0 members | Follow / Join | **857** |

- The test club is the ONLY row under "Verified", the 6th and last row of the pane.
  Its card starts at page y = 857, i.e. 13 px below the 844 px viewport, and the "VERIFIED"
  header is already half visible behind the bottom tab bar at y ~ 818 on the first screen
  (`03-orgs-top.png`). **Any scroll at all on the Orgs tab puts "Bloomington Cycling (test)"
  and "@test_bloomington_cycling · 0 members" on screen.** Without a scroll only the word
  "VERIFIED" ghosts through the translucent tab bar.
- DB row (RAN): `orgs.handle = 'test_bloomington_cycling'`, name "Bloomington Cycling (test)",
  `campus_id = 'iu-bloomington'`, `verified = true`, `hidden_at is null`, owner `avery_owner`,
  0 members, 0 followers. It is local-seed's row; demo-seed never touches it.
  Ways to keep it off camera without deleting: the recorder never scrolls the Orgs tab, or the
  seed sets `hidden_at` on that one row for the shoot (it then leaves the directory:
  `/api/orgs?filter=discover` lists visible clubs only), or moves its `campus_id`.
- Two rows are clipped on a 390 px phone (RAN):
  - "Tower Floor 3" renders as **"Tower…"** and its meta as **"@tower_floor_3 · By requ…"**: a
    by-request club uses the `slot` layout (chip "Following" + a "Request" pill on the same line
    as the name), so the name only gets ~70 px. The other rows use the `line` layout.
  - SAE's meta is **"@sae · Invite only · 3 me…"**.
  Both ellipses come from `whiteSpace: nowrap; textOverflow: ellipsis` at 3401-3411 (name) and
  3455-3466 (meta).
- All five logos are the default tile: initials on a peach gradient
  (`linear-gradient(135deg,#FFD3C2,#FF9D7E)`, 3371-3373) because every club's `logo_url` is NULL.
  SAE's tile says just "S".
- Order under Following is by follow time, so it is an accident of the seed's insert order
  (North Hall first, SAE last). SAE, the club the video opens, is the LAST following row, at
  y = 714: its card's lower half sits under the tab bar on the first screen. The recorder's
  `onScreen(page, page.locator('a[href="/orgs/sae"]'))` works today because the link's box
  top is inside the viewport, but the tap lands near the tab bar. To move SAE to the top the
  seed would have to give Franky's SAE follow the newest `org_followers` timestamp
  (order comes from `loadViewerFollowedOrgIds`, `src/lib/orgs/following.ts`).

Selectors (RAN):
- tab chip: `page.getByRole("button", { name: "Orgs", exact: true }).first()`
- a club row link: `a[href="/orgs/<handle>"]` (use `onScreen`, the other panes are in the DOM)
- section headers are plain `div`s with the text FOLLOWING / VERIFIED (uppercase via CSS; DOM text is "Following", "Verified").
- Following order = `org_followers.created_at desc, id desc` (`loadViewerFollowedOrgIds`, `src/lib/orgs/following.ts:234-239`).
  The seed's `ensureOrgFollow` (demo-seed.mjs 567-574) does not set `created_at`; set it to put SAE first.

### 1.2 The org page /orgs/[handle] (walked: sae and chess_club as franky; sae as james for the member view)

Files: `src/app/orgs/[handle]/page.tsx` (server page), `OrgContent.tsx` (phone tabs Posts / Events / About),
`OrgPostsList.tsx`, `OrgEventsSection.tsx`, `ChannelsSection.tsx`, `admin-actions.tsx`, `join-button.tsx`.

**Why it looks purple and older: BOTH things are true.**

1. It is a per-club theme. `orgs.backdrop_preset` picks one of five hard-coded gradients in
   `BACKDROP_PRESETS` (page.tsx 56-73): `sand-purple` (purple top-left + coral bottom-right on
   #1B1530/#241B40/#2E1F35), `ember`, `deep-violet`, `forest`, `midnight`. Unknown or NULL falls
   back to `sand-purple` (page.tsx 313, 372-373). It is painted on `<main>` with
   `backgroundAttachment: fixed` (374-383).
   - RAN: SAE's row has `backdrop_preset = 'sand-purple'`, so SAE is the purple-and-coral one
     (`10-sae-franky-top.png`). Chess Club is `forest` (dark green, `11-chess-franky-top.png`).
   - **The seed asks for `midnight` on SAE and never writes it.** `CLUBS[0]` says
     `backdrop: "midnight"` (demo-seed.mjs 410-412) but SAE is the `shared` club and the shared
     branch of `ensureClub` (437-449) writes only `name, description, campus_id, verified`. Add
     `backdrop_preset: spec.backdrop` to that `fields` object and SAE becomes the near-black
     blue `midnight` preset, the closest of the five to the app's Night look. (North Hall is
     also `sand-purple`, on purpose, 425.)
2. The page was never moved to the Night tokens. CODE: across all seven files of the route
   there are **0 uses of `var(--…)`** and ~100 hard-coded `rgba(255,…)`/hex colours
   (page.tsx 30 + 14, admin-actions.tsx 31, ChannelsSection 18, …). It is always a dark glass
   page with white text, in Light and in Night alike, with its own top bar ("vibe." wordmark +
   "← Return to Organizations", page.tsx 519-583) instead of the app's header. No preset equals
   the Night backdrop (`var(--feed-backdrop)`: near-black with a coral bloom).

**Layout on a phone, top to bottom** (RAN, y in page px on /orgs/sae as franky):

| y | Block | Notes |
|---|---|---|
| 20 | top nav: "vibe." + pill "← Return to Organizations" (`a[href="/campus?tab=orgs"]`) | the only way back besides the tab bar |
| 78-228 | **OFFICER TOOLS** bar: Invite people, Banner, Logo, Edit details, New post | owners and admins only; 150 px tall on a phone (wraps to 3 rows) |
| 240-360 | Banner slot, 3:1, radius 22 | empty today: a flat grey-glass box |
| 380-465 | Logo tile (86 px, radius 20) + name + chips VERIFIED / INVITE ONLY + "@sae · 6 followers · 3 members" | logo empty today: "S" on a coral-to-purple gradient |
| 476 | buttons "Following ✓" and "Joined ✓", caption "Members follow automatically" under the first | |
| 588 | description card | |
| 688 | tabs Posts / Events / About (`button` exact names) | |
| 738+ | "RECENT POSTS" list: small logo, club name, "posted by @franky", date, text, photo, then "Delete post" (officer or author) or "Report post" | no like/comment row on this page at all |

Without the officer bar (James's view, `12-sae-james-top.png`) everything moves up 150 px: banner at y 90, name at y 231.

Other things seen on the org page (RAN):
- Chess Club's count line wraps: "@chess_club · 9 followers" then a second line that starts
  with a stray "· 4 members" (`11-chess-franky-top.png`). The separator travels with its count
  (page.tsx 760-770), so the wrapped line begins with a dot. SAE's line fits ("@sae · 6 followers · 3 members").
- Chess Club's name sits above the logo's top edge (grid `alignItems: flex-end` with a taller text column); SAE's does not.
- The SAE post is dated "Sep 30, 2026" (it was seeded 38 hours back) and reads "posted by @franky".
- The photo shows a real chapter board: "ΣΑΕ·ΦΜ Paddy Murphy 2024 / PADDY'S BACK!" next to the letters.
- **About tab** (`13-sae-franky-about.png`): a "CHANNELS" card with "+ Join all public", PUBLIC "# lounge ↗",
  "# board ↗", "# events ↗", PRIVATE "officers ↗". This is the OLD club-chat language (hash names,
  "channels") and the links still point at `/campus?tab=chat&org=sae&channel=<id>` (ChannelsSection.tsx);
  with chat_v2 on, CampusMobile redirects that to `/messages?channel=<id>` (CampusMobile.tsx 307-311).
  Club chat is no longer in the Campus section, so do not film the About tab. Below it: an ABOUT facts
  card (Followers 6, Members 3, Who can join "By invitation", Open to "Anyone", Status "Verified",
  Last activity "Oct 2, 2026"), and for non-officers "Report this club".
- **Events tab** (`13-sae-franky-events.png`): "UPCOMING EVENTS", for officers "+ Create event", then the same EventCard as the campus Events tab.

(Line fix for 1.2: the default-preset fallback is page.tsx 320 and 369-370; the background is set at 374-383.)

### 1.3 Banner and logo: how they are stored, what refuses a local URL, how the seed can set them

Columns: `public.orgs.banner_url text`, `public.orgs.logo_url text` (both NULL on all 16 local clubs, RAN).

How the app stores them (CODE):
- Officer taps Banner / Logo -> `UploadAssetModal` (admin-actions.tsx) -> `POST /api/orgs/[slug]/upload-url`
  -> a signed PUT to **Cloudflare R2** -> `PATCH /api/orgs/[slug]` stores the **R2 object key**
  `orgs/<org id>/...` in the column. Limits: banner 10 MB, logo 5 MB; jpeg/png/webp/gif.
  The route answers 503 "Storage not configured" when the R2 env is missing (`isR2Configured`, src/lib/r2.ts 50-53);
  demo-seed's own header says the local R2 keys are blank, so **the Banner and Logo buttons cannot work on the local stack**.
- Reading: every surface runs the stored value through `orgAssetProxyUrl` (src/lib/org-asset-url.ts 14-27):
  a value starting `http://` or `https://` is **passed through unchanged**; an `orgs/` key becomes
  `/api/orgs/<handle>/asset/<banner|logo>`, which 307-redirects to a signed R2 URL (src/app/api/orgs/[slug]/asset/[kind]/route.ts).
  The page paints them as CSS backgrounds, `url(<value>) center/cover` (banner: page.tsx 598-600; logo: 655-657).
  There is no CSP `img-src` and no image-host allowlist in next.config.ts (grep found none), and the post
  photos already load from `http://127.0.0.1:54321/storage/v1/object/public/profiles/...` (RAN, HTTP 200).

Three gates refuse a local URL (two in the app, one in the database):
1. `normalizeOrgAssetInput` (org-asset-url.ts 87-103), used by `PATCH /api/orgs/[slug]`: only an `orgs/<own id>/` key
   or an **https** URL on the configured Supabase host. `http://127.0.0.1` fails on the protocol.
2. `GET /api/orgs/[slug]/asset/[kind]` only redirects http(s) values that pass `isSupabaseHttpsUrl` (not used when
   the value is passed through directly, which is what the page does).
3. **Database trigger `orgs_check_asset_refs`** (`before insert or update of logo_url, banner_url on public.orgs`,
   supabase/migrations/20260927120000_media_ref_ownership.sql 330-356, enabled locally, RAN): the value must be
   NULL, or pass `media_url_on_own_host()` = `^https://rqopjkimxbjkwdkpkbfq\.supabase\.co/[A-Za-z0-9._~/-]*$`
   (the PRODUCTION host is pinned in the function), or be `orgs/<this org's id>/<safe path>`.
   RAN (read-only call): `media_url_on_own_host('http://127.0.0.1:54321/storage/v1/object/public/profiles/.../demo-sae-letters.jpg')` = **false**.
   So a service-role UPDATE with a local URL raises 23514 `media_ref_not_owned`, exactly like `posts_check_media_refs` does for post photos.
   An `orgs/<id>/...` key WOULD pass the trigger, but then the page asks R2 for it and gets nothing locally.

**Recipe for the seed (same trick demo-seed already uses for post photos, `setLocalMediaUrl`, demo-seed.mjs 675-700):**
1. Upload the file to the local PUBLIC bucket `profiles` (the only public bucket; `resumes` and `quarantine` are private, RAN),
   e.g. path `<officer user id>/orgs/demo-sae-logo.jpg` and `.../demo-sae-banner.jpg`, with
   `admin.storage.from("profiles").upload(path, bytes, { contentType: "image/jpeg", upsert: true })`.
2. Build `url = ${API_URL}/storage/v1/object/public/profiles/<path>`.
3. Write it past the trigger in one psql transaction inside the container `supabase_db_vibe`:
   `begin; set local session_replication_role = replica; update public.orgs set logo_url = :'logo', banner_url = :'banner' where id = :'id'::uuid; commit;`
   (generalise `setLocalMediaUrl` to take table / column). Nothing else on `orgs` fires on those two columns
   (`orgs_sync_join_policy`, `orgs_keep_removed_posts` are the other two triggers).
4. Re-run safety: local-seed.mjs resets SAE's name and campus but does not touch logo/banner; a later plain UPDATE of other
   columns does not re-check them (the trigger is `update of logo_url, banner_url` and compares old vs new).

Result once set (CODE, all of these read through `orgAssetProxyUrl`): the org page banner + logo + the small logo on each
recent post, the Orgs tab row tile, the Messages home club row and the club space header, the campus map, search rows,
followed-orgs on a profile. One UPDATE cleans all of them.

Picture notes:
- `~/vibe-demo-photos/web/sae-letters.jpg` is 1279x1600 (portrait), 274 KB. The banner slot is 3:1 `center/cover`, so it
  shows only the middle 1279x426 band (rows ~587-1013): that band cuts through the letters. Make two crops with ffmpeg
  into `~/vibe-demo-photos/web/` (outside the repo): a 3:1 banner framed on the letters, and a square logo. The logo tile is
  only 86 px on the org page and 52 px on the Orgs tab, so the whole "ΣΑΕ" board will be tiny; a tight crop of one letter or
  a plain crest reads better. The banner also gets a dark gradient over its lower 60 % (page.tsx 608-616).
- There is no chess picture in the folder (campus-fog, campus-night, dunes, field-night, gorilla, kitchen, kitten,
  lawn-event, sae-letters, turtle). Chess Club needs a new, face-free image, or stays on initials.
- The same photo is already uploaded at `profiles/<franky id>/posts/demo-sae-letters.jpg` (the SAE post), so banner + post
  would show the same picture twice on one screen. Prefer a different crop.

### 1.4 "Officer tools": who sees it, and swapping Franky and James

Who sees it (CODE): page.tsx 387-399 renders `OrgProfileAdminBar` when `isSettingsOfficer(viewerRole)`,
i.e. `org_members.role in ('owner','admin')` (`SETTINGS_ROLES`, src/lib/orgs/join-state.ts 176). Mods and members do not.
The role comes from `loadViewerOrgContext` (service role read of `org_members`).

Local rows today (RAN): SAE = `avery_owner` **owner** (local-seed's test account), `franky` **admin**, `jamesandres` member.

What changes on screen if James is the admin and Franky a plain member (RAN for the member view: I opened /orgs/sae as james):

| Screen | Franky = admin (today) | Franky = member |
|---|---|---|
| /orgs/sae top | OFFICER TOOLS bar (5 buttons, 150 px) above the banner | gone; banner is the first thing under the nav |
| /orgs/sae Posts | "Delete post" under every post | "Report post" under others' posts; still "Delete post" under a post Franky wrote (OrgPostsList.tsx 230-249) |
| /orgs/sae Events | "+ Create event"; card has Manage attendees / Edit event / Cancel event | none of those; card has Add to calendar (+ "Report event" unless Franky is the event's creator) |
| /orgs/sae About | PRIVATE "officers" room listed; no "Report this club" | no officers room; "Report this club" row appears |
| /campus Events tab, Cookout card | "Manage attendees", "Edit event", "Cancel event" under the RSVP buttons (`02-events.txt`) | only "Add to calendar" (`viewer_can_manage` = officer of the club, src/lib/events/manage.ts 74-82) |
| Messages | the Officers room is open to him by role (it has NO `channel_members` rows locally, RAN; the inbox still showed one SAE row) | not open to him. NOT VERIFIED on screen. The `chat_org_members_rooms` trigger (`after insert or update of role`) only moves EVENT-room rows: a demoted officer leaves event rooms he holds no RSVP for (Franky is "going" to the Cookout, so he keeps that one) |
| Feed ⋯ menu on SAE posts | Delete on every SAE post | Delete only on his own |
| Create-event / post-as-club pickers | SAE offered | not offered |

What in scripts/demo-seed.mjs depends on Franky being SAE admin:
- `MEMBERS` 495-496: `{ club: "sae", user: "franky", role: "admin" }`, `{ ..., user: "james", role: "member" }`. `ensureMember`
  is an UPSERT on (org_id, user_id), so swapping the two roles and re-running really does demote Franky and promote James
  (the seed then runs `chat_repair_club` for every club, 1381-1383, which settles the room rows).
  Line refs for this section: officer bar page.tsx 389-401; banner 599-601; logo 658-660; banner shade 610-613;
  `normalizeOrgAssetInput` org-asset-url.ts 84-99; trigger function at migration line 330, `create trigger` at 373.
- `POSTS` 613-615: `{ author: "franky", club: "sae", image: "sae-letters.jpg" }`. The row already exists and is keyed on
  (author, club, content), so it stays as it is: still "posted by @franky", still attributed to SAE in the feed
  ("@franky · 1d ago · SAE"), and Franky still gets Delete on it as its author. Two side effects of a demotion:
  (a) on a FRESH write (new database, or a campus move, which deletes and re-inserts) the `posts_stamp_campus` trigger gives a
  club post the club's campus only when the author is the club's owner or admin, otherwise the author's own campus
  (same campus here, so nothing visible changes); (b) the app itself would refuse this post from a member
  (`/api/orgs/[slug]/posts` and the `posts_update_own` policy need owner/admin), so it is a row the product could not have produced.
  Cleaner: make James the author (`author: "james"`). TRAP: `wasBy` only deletes a PERSONAL copy (`.is("org_id", null)`, 749),
  so Franky's existing club post would stay next to James's new one; delete it by id or extend `wasBy` to club posts.
  The photo would be re-uploaded under James's folder.
- `EVENTS` 807-809: `{ club: "sae", creator: "franky", title: "Cookout on the Lawn" }`. `ensureEvent` rewrites `creator_id` on
  every run, so `creator: "james"` just works. If Franky stays creator while a member, his card shows no "Report event"
  (`is_creator`) and no officer buttons: harmless, but again a row the app would not produce (POST /api/events needs owner/admin).
- `RSVPS`: Franky "going" to the Cookout: independent of role. Fine.
- `CLUB_MESSAGES` 984-991: Franky's lines in SAE's Lounge and `events` room: both public rooms, fine for a member.
  The header comment at 925-929 ("Franky is an SAE officer, so those rooms are in HIS inbox") goes stale.
- `signInCheck` / `printSummary`: read-only, no role assumption found by grep (only the comments at 44, 488-493).
- NOT fixed by any swap: **the owner of SAE is still `avery_owner`**. "3 members" counts him, and /network opens with
  "From your clubs · Avery Owner · @avery_owner · In your org" (`30-network.png`). See section 5.

---

## 2. Events

### 2.1 The Events tab on /campus (phone)

Component: `EventsPane` (CampusMobile.tsx 2141-2196) renders the shared `EventCard` (src/app/campus/campus-home.tsx 9925-10230).
Data: `GET /api/events?limit=50` (src/app/api/events/route.ts): not-ended events (`ends_at >= now`, line 164) of
VERIFIED, not-hidden clubs on the viewer's home campus (248-253), soonest first (166).

What Franky sees today (RAN 2:11 pm Indianapolis time, `02-events-top.png`, `41-events-scroll-*.png`; y = page px):

| y | Card | Top-right pill | Time line | Buttons | Under the buttons |
|---|---|---|---|---|---|
| 134 | **Blitz Night** by Chess Club ✔ | 4 going | 🗓 Fri, Oct 2 · 7 PM – 10 PM / 📍 Campus Center, Room 148 | **Going (filled gold)**, Interested · 1 | Add to calendar, Report event |
| 420 | Resume Review Night by Finance Club ✔ | 1 going | Sun, Oct 4 · 6 PM – 8 PM | Going, Interested · 1 | Report event |
| 706 | Floor Movie Night by Tower Floor 3 ✔ | 2 going | Mon, Oct 5 · 8 PM – 10 PM | Going, Interested | Report event |
| 992 | **Cookout on the Lawn** by SAE ✔ | 3 going | Tue, Oct 6 · 5 PM – 7 PM | **Going (filled)**, Interested | "You'll appear in the event chat." + Add to calendar, **Manage attendees, Edit event, Cancel event** |
| 1338 | Midterm Study Jam by North Hall ✔ | 2 going | Wed, Oct 7 · 2 PM – 5 PM | Going, Interested | Report event |

Each card is 276 px tall (the Cookout card 335 px because of the officer row), so the first screen shows Blitz Night whole,
Resume Review Night whole, and the top of Floor Movie Night under the tab bar.

- **Going state**: the Going button is filled with the club's accent and glows; "Add to calendar" appears only when the viewer
  has an RSVP (campus-home.tsx ~10182-10200). The accent is `colorForOrg(org id)` (240-244): a hash of the club's uuid into
  `ORG_PALETTE` (229-238), also the 3 px left stripe. Computed from the local ids: Chess Club and North Hall = amber #D4A30E,
  SAE and Tower Floor 3 = red #E84D4D, Finance Club = brand orange #FF5C35. So the one "Going" the video shows (Blitz Night) is
  amber-brown, not the app's coral, and SAE's is red. It is tied to the uuid, so it only changes if the club row is re-created.
- "Interested · 1" shows a count only when it is above 0; the "N going" pill is always shown. Numbers are small but real
  (table `rsvps`: `event_id, user_id, status in ('going','maybe','no')`, unique (event_id, user_id)).
- The date line is formatted in the BROWSER's time zone with `toLocaleDateString` / `toLocaleTimeString`
  (campus-home.tsx 11109-11139). lib.mjs sets `timezoneId: "America/Indiana/Indianapolis"`; without it a headless browser in
  another zone would print another hour. The card never says "Today"; only the feed strip does.
- The calendar and pin are emoji (🗓, 📍), drawn by the system emoji font: they look like tiny colour stickers next to
  otherwise flat line icons.
- "Report event" is a pill on every card that is not the viewer's own; "Manage attendees / Edit event / Cancel event" on the
  Cookout card are officer controls (`viewer_can_manage`, src/lib/events/manage.ts 74-82: for a club event, a CURRENT owner
  or admin of the club). "Cancel event" is in red. All of that is on camera if the recorder scrolls to the fourth card.
- Under the last card the pane is empty for ~5,000 px (the pane is as tall as the Feed, see bug 4a): never fling on this tab.

### 2.2 Time-dependent things

| What | Rule | Consequence for the shoot |
|---|---|---|
| Blitz Night in the Events list | `/api/events` drops it when `ends_at < now` (10:00 pm tonight, Indianapolis) | film before 10 pm, or re-run the seed that day (dates are recomputed per run) |
| An officer's event card left open past its end | `useEventEnded` (campus-home.tsx 10375-10390, used only by `EventOfficerActions`, 10455) swaps "Cancel event" for the ended wording with a timer at `ends_at` | only matters for a club Franky is an officer of (SAE's Cookout, Tuesday): not today |
| "today." strip chip "Blitz Night Today" | `/api/me/upcoming-events?limit=3&days=14`: the viewer's going/maybe RSVPs with `ends_at >= now` (route lines 68-75); label from `formatUpcomingChip` (src/components/campus/rolling-strip-view.ts 53-69): Today / Tmrw / weekday / "Oct 9", computed in the browser's zone | after 10 pm the first chip disappears and the strip reads "today. · Cookout on the Lawn Tue"; tomorrow without a re-seed Blitz Night is gone everywhere |
| The lead-in word "today." | constant (`leadIn`, rolling-strip-view.ts 173-176); it does not mean the chips are today | fine today because the first chip really is today |
| Feed times "3h ago", "1d ago" | relative to now, from `posts.created_at`, written once at first seed | the top post said "2h ago" at 1 pm and "3h ago" at 2 pm: it drifts. By tomorrow the "tonight at 7" post reads "1d ago" |
| Org page post date | absolute ("Sep 30, 2026", "Oct 2, 2026") | the year 2026 is on screen |
| Messages "Your week" strip | shows "Fri 2" selected with "7 PM · ✓ Going · Blitz Night · Chess Club" (`32-messages.png`) | same 10 pm / next-day dependency |
| Banner line "13 at IU Bloomington · 1 active now" | live count from heartbeats | "1 active now" is the recorder itself; 13 = the cast |
| SAE inbox row time "5:01 AM" | club message seeded 8.6 h before the seed ran | a club chat line at 5 am looks odd; seed later in the day or pick `hoursAgo` so it lands in the evening |

Test event off camera (RAN): `Lake Monroe ride (test)` by `test_bloomington_cycling` ended Sep 30, so the list filter already hides it.

### 2.3 The "today." strip on the feed

`RollingStrip` (src/components/campus/RollingStrip.tsx), first child of the Feed pane (CampusMobile.tsx 924-931), 40 px tall at
y = 133, selector `[aria-label="Your events and trending tags"]`. Chips are `button`s with aria-labels
"Blitz Night, Today, you're going" (x 73, w 146) and "Cookout on the Lawn, Tue, you're going" (x 227, w 200: it runs off the
right edge and fades, "Cookout on the Law…"). No trending-tag chips: no seeded post has `tags`. Tags would come from
`/api/trending/hashtags` (real `posts.tags` counts); adding 2-3 tags to seeded posts would fill the strip with "#chips".

Tapping a chip (RAN): switches to the Events tab and calls `scrollIntoView({ block: "start", behavior: "smooth" })` on
`#event-<id>` (CampusMobile.tsx 432-445). See bug 4c: for the FIRST card (Blitz Night) this lands badly.

---

## 3. The feed: likes, comments, reposts, saves, views

State today (RAN): `post_likes` 0 rows, `post_reposts` 0, `bookmarks` 0, `post_comments` 3 (all on test posts on
indianapolis, none on the cast's), `post_views` 19 rows of which ONE is on a cast post (franky viewed Priya's Blitz Night
post on 2026-10-02, from an earlier take: that is the lone "👁 1" on the first card). `push_devices` 0, `push_outbox` 0.

The phone card (`FeedCard`, CampusMobile.tsx 1479-2140) ALWAYS prints the three numbers, zeros included
("♡ 0  💬 0  ⟳ 0", 1888-2035); the eye + number appears only when `view_count > 0` (2042-2068); the bookmark has no number.

### 3.1 Where each number comes from

| Number | Table (columns) | How the feed counts it (src/app/api/feed/route.ts) |
|---|---|---|
| Likes | `post_likes (post_id, user_id, created_at)`, PK (post_id, user_id) | RPC `post_engagement_counts(p_post_ids uuid[])`: `count(*)` of rows per post (lines 640-672) |
| Reposts | `post_reposts (post_id, user_id, comment, created_at)`, PK (post_id, user_id); `comment` NULL or 1-500 chars | same RPC |
| Comments | `post_comments (id, post_id, user_id, content, created_at, parent_comment_id, removed_at…)`; content 1-1000 chars | rows the viewer's RLS returns (`removed_at is null`, author visible, not blocked), replies included (644, 674-676) |
| Views | `post_views (post_id, user_id, viewed_on date)`, PK (post_id, user_id, viewed_on); RLS on, NO policies (service role only) | ledger rows minus the post author's own (`loadHonestViewRows` / `tallyViews`, src/lib/posts/honest-views.ts); falls back to `posts.view_count` only when the service read fails (517) |
| Saved | `bookmarks (id, user_id, post_id, collection_id, created_at)`, unique (user_id, post_id) | the viewer's own rows only: it fills the bookmark icon, no public count |
| Comment likes | `comment_likes (comment_id, user_id, created_at)` | RPC `comment_like_counts`, shown in the post viewer |

### 3.2 What fires when the seed writes them with the service role

- `post_likes` INSERT -> trigger `trg_notify_on_like` -> `notify_on_like_insert()`: one `notifications` row
  (`type 'like'`, `user_id` = post author, `actor_id` = liker, `post_id`), skipped for a self-like and when the same
  (author, actor, post) like notice already exists.
- `post_comments` INSERT -> trigger `trg_notify_on_comment` -> `notify_on_comment_insert()`: one `notifications` row
  (`type 'comment'`, with `comment_id`), skipped only for the author's own comment. **Not de-duplicated**: delete-and-reinsert
  on every run would stack notices, so look the comment up first (key: post, user, content), as `ensureMessage` does.
- `notifications` INSERT -> trigger `trg_push_on_notification` -> `push_on_notification_insert()`: queues `push_outbox` ONLY
  when the recipient has a `push_devices` row. There are none locally, so nothing is queued and nothing is sent.
- `post_reposts`, `post_views`, `bookmarks`, `comment_likes`: **no triggers**. A direct `post_views` insert does not bump
  `posts.view_count` (only the RPC `record_post_view` does); the feed does not need it, but update it to the same number so
  any screen still reading the stored counter agrees. Updating `view_count` does not mark a post "Edited"
  (`posts_stamp_edited` is about the text; `record_post_view` does the same UPDATE in production).
- No counters to maintain for likes/comments/reposts: all three are counted live.
- The rate limiter (`rate_limits`) and the text filter live in the routes, not the database: direct inserts skip them.
- RLS (`has_recorded_consent()`, `can_publish_now()`) does not apply to the service role.

Where the notices show: Franky's **otto** tab lists them under "OTTO SAW" ("Lucas followed you · 30m" x10 today,
`31-otto.png`) and counts them in the "10 nudges" pill. Likes and comments on FRANKY's posts would add
"… liked your post" lines there, stamped with the seed's run time. If that is not wanted, write those rows in the same
`session_replication_role = replica` psql session the photos use (triggers skipped), or set `notifications.read_at`.

### 3.3 Recipe (small, believable)

- 13 cast accounts, so at most 12 likes per post. Suggested: top post 7-9 likes, 2 comments; the next few 2-6 likes;
  0-1 comment each; older posts 1-4. Upsert `post_likes` with `{ onConflict: "post_id,user_id", ignoreDuplicates: true }`.
- Comments: insert with `created_at` AFTER the post's `created_at` (the viewer shows "2h"); short lines from cast members,
  e.g. on Priya's Blitz Night post: Noor "bringing a friend who has never played", Eli "see you there";
  on Theo's study-spots post: Hana "third floor of the library, by the windows".
- Views: `post_views` rows for NON-authors. One row per (post, user, day), so 12 per day at most; add earlier
  `viewed_on` dates (not before the post's date) for 20-40 on older posts. The author's own rows are not counted.
- Saves: only if the video shows Franky's Saved tab or a filled bookmark; a `bookmarks` row for franky fills the icon.
- Likes BY franky fill his heart on those cards (`viewer_liked`, feed/route.ts 521), which looks used. Fine in moderation.

### 3.4 TRAPS

1. **The feed is ranked by engagement, so adding numbers reorders it.** `scoreFeedRow` (src/lib/iu/community-scope.ts 521-547):
   `score = (1 + likes + 2*reposts + comments) / (ageHours + 2)^1.5`, x1.6 for a followed author or club, x1.35 home campus,
   **+3 per friend who reposted**. With zero engagement the order is simply newest first, which is why the feed opens on
   Priya's "Blitz Night is tonight" post today. To keep it first, give it the most engagement and let numbers fall with age.
   Scores also drift as posts age, so the seed should print the ranked order (`GET /api/feed` as franky) and the recorder
   should assert the first card before filming.
2. **One repost by anyone Franky follows (he follows the whole cast) adds +3**, which outranks everything else, and puts a
   "‹Name› reposted this" pill with a small avatar above that card (`friend_reposters`, CampusMobile.tsx 1849-1887, label 3883-3897).
   Repost only the post that should be on top (Priya's), or none.
3. The page keeps at most 3 posts per author (or per club for club posts): a 4th is DROPPED from the feed
   (`MAX_PER_AUTHOR = 3`, feed/route.ts 560-577). Franky and Rylan already have 3 personal posts each: a 4th would not show.
4. Likes need distinct users: the PK is (post_id, user_id). `post_likes`/`post_reposts` are readable only by their owner under
   RLS; the counts come from the SECURITY DEFINER RPC, so check the result through `/api/feed`, not by selecting the tables as franky.
5. `ensurePost` deletes and re-inserts a post when the cast moves campus or a post is reworded (`was`), and the FK cascade
   takes its likes, comments, reposts and views with it (the script says so at 761-763): seed engagement AFTER posts, every run.
6. Opening any other person's post in the phone viewer writes a view (`POST /api/posts/[id]/view`, PostViewerMobile.tsx 338):
   each take adds at most one franky view per post per UTC day, so the eye count can tick between takes on the same post.
7. The org page's post list (`OrgPostsList`) shows no engagement at all, so seeded numbers never appear on /orgs/sae.

---

## 4. The suspected app bugs

### 4a. Feed scrolled far down, then Events (or Orgs): the pane is blank. **CONFIRMED, a real bug.**

RAN with real touch input (`bug-a.mjs`): three CDP `Input.synthesizeScrollGesture` flings with
`gestureSourceType: "touch"` on the Feed, then `page.touchscreen.tap` on the Events chip. Log in `20-bug-a.json`:

| Step | window.scrollY | track scrollLeft | bottom of the last Events card (viewport px) | readable text in the pane area |
|---|---|---|---|---|
| start, Feed | 0 | 0 | 1614 | yes |
| after 3 touch flings on Feed | 2717 | 0 | -1103 | feed cards |
| after tapping **Events** | **2717** | 390 | **-1103** (the whole list is above the screen) | **none** (`20-bug-a-2-events-after-tap.png`: header, chips, black) |
| after tapping **Orgs** | 2717 | 780 | -1739 | none (`20-bug-a-3-orgs-after-tap.png`) |
| touch scroll back up | 0 | 780 | | the rows are back |
| Feed scrolled 1805, then a sideways SWIPE to Events | 1805 | 390 | -191 | none (`20-bug-a-5-after-swipe.png`) |

Cause (CODE, src/components/mobile/CampusMobile.tsx):
- The panes are flex children of ONE horizontal track: `display: flex; overflowX: auto; overflowY: hidden; scrollSnapType: "x mandatory"`,
  no height (893-916); each pane is `flex: 0 0 100%` (`paneStyle`, 1179-1187). Flex stretch makes every pane as tall as the
  tallest one. RAN: all four panes are 6,695 px tall; their content is Feed 6,397, Events 1,440, Orgs ~850, Map 624.
- Vertical scrolling is the DOCUMENT's (`window.scrollY`); there is one position for all panes.
- Changing tab only moves the track sideways: the effect at 775-788 calls `el.scrollTo({ left })`; the chip is
  `onClick={() => onChange(t.id)}` (1236) -> `setTab` (890); the swipe handler (896-904) only calls `setTab`.
  Nothing resets or remembers the vertical position per tab. (`window.scrollTo({ top: 0 })` exists only for a campus
  switch, 231, and a #tag pick, 385.)

Would a student hit it? Yes: scroll the feed a few screens (anything past ~600 px for Orgs, ~1,300 px for Events), then
tap Events or Orgs, or swipe sideways. They see an empty screen and must scroll up by exactly as much as they scrolled down.
The reverse also holds: on Events and Orgs you can scroll ~5,000 px of empty space below the last row.
Caveat: run in headless Chromium with touch emulation, not on an iPhone; the cause is layout, not browser-specific.

For the recorder: record.mjs already works around it (`glide(page, -1500, 1300)` before the Events tap, lines 51-53).
Keep that, and never fling on Events or Orgs. A fix is small (reset `window.scrollTo(0, 0)`, or keep a per-tab scroll
position, in the 775-788 effect), but it is an app change, outside this job.

### 4b. The post viewer's top bar is light while the app is in Night. **CONFIRMED.**

RAN: opened Franky's own SAE post through `/campus?post=8b55b764-…` (own post, so no view is recorded) with
`colorScheme: dark`; `<html data-theme="dark">`. Computed styles (`21-bug-b.json`, still `21-bug-b-post-viewer.png`):

| Part | Computed | Source (src/components/mobile/PostViewerMobile.tsx) |
|---|---|---|
| viewer body | `rgb(12, 11, 11)` (Night) | 550 `background: "var(--cream)"` (token, correct) |
| **top bar** | `rgba(255, 253, 248, 0.92)` (cream) | **581** `background: "rgba(255,253,248,0.92)"`, border 580 `rgba(28,28,30,0.06)` |
| Close "×" button | `rgba(255,255,255,0.7)` on `#1C1C1E` | 594-596 |
| "⋯" menu button | same | 686-690 |
| menu panel | cream | 729 `rgba(255,253,248,0.98)` |
| **comment bar** at the bottom | `rgba(255, 253, 248, 0.94)` | **1105** |
| comment input | `rgb(255, 255, 255)`, text `#1C1C1E` | 1129-1134 |
| "Post" button idle | light grey | 1143-1145 |

So the viewer is a Night page with a light strip on top AND a light strip at the bottom. These are hard-coded colours that
were never moved to tokens. Also seen there: the header of a CLUB post shows only "Franky Cazares · @franky · 1d", no club
name; the author sees "👁 0"; "Be the first to comment." under COMMENTS.
For the video: do not open the post viewer (record.mjs uses the card's ⋯ sheet instead, which is correctly dark,
`42-feed-card-menu.png`), or fix the six colours first.

### 4c. NEW: tapping the strip chip "Blitz Night · Today" lands with the card's title hidden. (RAN, Chromium)

`pickEvent` (CampusMobile.tsx 432-445) switches to Events and calls `scrollIntoView({ block: "start" })` on `#event-<id>`.
The card has `scrollMarginTop: calc(env(safe-area-inset-top) + 140px)` (campus-home.tsx 10025-10027) to clear the sticky
banner and chips. RAN (`chip.mjs`): for the Cookout card (4th) it lands at 140 px, correct. For **Blitz Night, the first
card**, the page ends at `scrollY = 122` with the card's top at **12 px**, under the 64 px crimson banner and the chip row:
the title "Blitz Night" and the "4 going" pill are covered, and the date line sits behind the chips
(`40-events-via-strip-chip.png`). A plain instant `scrollIntoView` gives the same 12 px, so it is not a race with the
sideways animation: the track is itself a scroll container, and for a card whose margin box reaches above the track's top
the window aligns to the track instead of the card. Not checked on iOS Safari.
For the video: reach Events with the Events chip from the top of the feed, not with the strip chip.

### 4d. NEW: the sticky chip row has no backing. (RAN)

`<header id="otto-mobile-tour-tabs">` is sticky with `background: "transparent"` (CampusMobile.tsx 879-891). In every
scrolled frame the cards slide BEHIND the Feed / Events / Orgs / Map chips and their text collides with the chips
(`20-bug-a-1-feed-scrolled.png`: "Noor Haddad" runs through the chip row; `41-events-scroll-2.png`). Unavoidable in any
scrolling shot of the feed; least visible when a scroll stops with a card gap or a photo under the chips.

### 4e. Console: nested button on every feed card (dev only, hidden by lib.mjs)

RAN: every /campus load logs two React errors, "In HTML, <button> cannot be a descendant of <button>": `FeedCard` is a
`<button>` (CampusMobile.tsx ~1600) that contains the "More actions" `<button>` (and the like/comment/repost/save buttons).
In dev, Next's overlay shows a red "2 Issues" pill bottom-left (`nextjs-portal`, shadow root `[data-issues-count]` = "2",
`50-console-campus.txt`). lib.mjs hides it with `nextjs-portal{display:none!important}`: keep that init script in EVERY
context that records. No other console errors and no 4xx/5xx on /campus, /orgs/sae, /orgs/chess_club, /network, /otto,
/messages, /profile, /profile/jamesandres.

(Line fix for 4e: the card's outer `<button>` is CampusMobile.tsx 1633; the inner "More actions" button is 1725.)

---

## 5. Cleanliness list for the video, most visible first

Scope of the cut (user): feed, events, orgs, DMs and club DMs, profiles, visiting profiles. Club chat is no longer in the
Campus section (with chat_v2 on, the Campus chips are Feed / Events / Orgs / Map; no Chat chip, RAN).

**On every Campus frame**
1. **Every feed card reads ♡ 0 · 💬 0 · ⟳ 0.** Seed fix, section 3 (mind the ranking trap).
2. **Header subtitle is clipped: "13 at IU Bloomington · 1 acti…"** (full text "13 at IU Bloomington · 1 active now",
   `bannerStatsLine`, campus-home.tsx 4550-4561). It also repeats the title above it, and "13" is the whole cast, so the
   campus reads as tiny. Not fixable from the seed short of adding people (the ellipsis stays either way); a code matter.
3. **The crimson header** is by design: the banner wears the school's colours and "Light and Night paint the same"
   (`bannerPalette`, campus-home.tsx 4505-4533). Bloomington is IU-only, so it is solid crimson with a "BL" tile. On the
   shared Indianapolis campus it would be crimson plus a Purdue seam. It is the one loud, non-Night block on screen.
4. **Sticky chips with no backing** (4d): text slides behind Feed / Events / Orgs / Map in every scrolled frame.
5. **The bottom tab bar is see-through**: card text is legible behind "Campus / Network / otto / Messages / Profile" in
   every still (e.g. `01-feed-top.png`, `03-orgs-top.png` where "VERIFIED" shows through it).
6. **Every avatar and club logo is a peach initials tile** (PR, TL, AD, HS … and NH, TF, FC, CC, S). No cast member has
   `users.avatar_url` or `banner_url` (RAN: all 13 NULL). `users` has no media trigger (only `users_campus_in_system`), unlike
   posts and orgs; whether the app shows a local-URL avatar was not tested here.
7. The orange "+" button covers the ⋯ of the 4th card on the first screen (`01-feed-top.png`).
8. Dev only: the "2 Issues" pill (4e), hidden by lib.mjs. Keep that init script.

**Feed photos (further down the feed, y > ~1,300 px)**
9. `lawn-event.jpg` (Rylan, "Tabling outside the Campus Center"): a vendor banner reads "INDY … We bring the party to you ·
   317-414-5484 · www.indyinflatables.com" (`60-lawn-crop.png`). That is an Indianapolis business, a real phone number and
   URL, under an "IU Bloomington" header.
10. `campus-night.jpg` (Hana) and `campus-fog.jpg` (Maya) are downtown Indianapolis / the Indianapolis campus, not Bloomington
    (a "… CENTER LOADING DOCK" sign is readable in the night one). Franky allowed either campus; the header says Bloomington.
11. Recognisable people: Rylan's face fills the kitchen photo; a person sits in the gorilla-statue photo; James holds the
    kitten (face cropped at the nose). demo-cast.md line 5 still says these are "held until Franky says the people in them
    agree", while the seed (628-642) now puts them on the founders' own posts. Confirm the hold is lifted before publishing.
12. `sae-letters.jpg` shows a real chapter board ("ΣΑΕ·ΦΜ Paddy Murphy 2024 / PADDY'S BACK!").

**Orgs tab** (section 1.1)
13. **"Bloomington Cycling (test)" / "@test_bloomington_cycling · 0 members"** under VERIFIED, 13 px below the first screen.
14. "Tower…" and "@tower_floor_3 · By requ…"; "@sae · Invite only · 3 me…".
15. Row layouts differ (Tower Floor 3 and SAE are one-line rows, the open clubs two-line): the list looks uneven.

**Org page** (section 1.2-1.4)
16. Purple/coral (SAE) or green (Chess) glass page with its own "vibe." top bar: reads as a different, older app next to Night.
17. Empty grey banner box and a gradient "S" / "CC" logo tile.
18. OFFICER TOOLS bar (150 px) as the first thing on SAE while Franky is admin; red underlined "Delete post" under the post.
19. "· 4 members" wrapped onto its own line on Chess Club.
20. About tab: "CHANNELS · # lounge ↗ # board ↗ # events ↗ · officers ↗" (old chat language, links into /campus?tab=chat).
21. SAE says "3 members": the third is the test owner `avery_owner`.

**Events tab** (section 2)
22. "Manage attendees / Edit event / Cancel event" (red) on the Cookout card; "Report event" pill on the others.
23. Emoji 🗓 and 📍 as icons; amber "Going" on Blitz Night.
24. Empty black space under the last card.

**Post viewer**: light top bar and light comment bar in Night (4b).

**Messages** (`32-messages.png`, seen in passing; another agent owns this area)
25. SAE row time "5:01 AM". SAE's avatar here is a TEAL "S" (peach on the Orgs tab, coral-to-purple on the org page: three looks
    for one club until a logo is set). Opening SAE's rooms shows Avery Owner's test lines above the cast's (seed header 925-929).

**Profiles** (`33-profile.png`, `34-profile-james.png`, seen in passing)
26. Default pastel banner (peach to lavender to blue): a large LIGHT block on a Night page; initials avatar.
27. Franky: "vibin" twice (the italic quote and the Bio card); "🎓 IU Bloomington" badge next to the name and a "📍 IU Bloomington" chip.
    Portfolio tab: "Nothing here yet · Show what you're working on, where you've worked, or add a resume. · Edit profile →".
28. James (visiting): the major chip reads "📚 IU Bloomington" because his `major` and `year` are empty (seed `real: true`),
    so "IU Bloomington" appears THREE times in a row; "2 followers / 2 connections"; "1 you both follow"; bio "Vibe team.".
    Rylan has the same empty major/year.

**Tabs outside the cut, do not film as they are**
29. **Network** (`30-network.png`): the first screen is test accounts: "From your clubs · Avery Owner @avery_owner · In your org",
    then "Elsewhere at IU": Vibe Review Friend, Vibe Review, Emery Admin, Blake Student; "New on Vibe": Casey Purdue.
30. **otto** (`31-otto.png`): "10 nudges", ten "‹name› followed you · 30m" lines, "Profile views 0 … Nobody's looked yet."; its own brown gradient.
31. **Map** (`04-map-top.png`): broken bubble labels ("Informati cs", "Explorato ry", "Mechanic al…", "Music Technol…"), every bubble "1".

**Place names**: no "Fort Wayne", "Indianapolis", "IUPUI" or "Purdue" in any app text on Franky's screens (grep of every text
dump), except the test account "Casey Purdue" on Network and the "INDY" banner inside a photo (item 9).

---

## 6. Side effects of this audit (honest list)

Nothing was followed, RSVP'd, liked, posted, saved or sent. The app itself wrote, as it does for any visitor:
- `POST /api/me/heartbeat` on each page (Franky's and James's "active now" stamp).
- `POST /api/profile-views` once when franky opened /profile/jamesandres (one profile-view row for James, if not already counted today).
- `POST /api/posts/<own post>/view` twice: Franky's own post, which the RPC does not count (self-view), so no row.
No file in the repo or the worktree was edited; no server was started or stopped; nothing was committed.

## 7. Stills and logs (all in notes/audit/)

Campus: `01-feed-top.png`, `01-feed-full.png` (+ crops `-b` … `-e`), `01-feed.txt`, `01-geometry.json`, `01-console.txt`,
`02-events-top.png`, `02-events-full.png`, `02-events.txt`, `03-orgs-top.png`, `03-orgs-full.png`, `03-orgs-full-crop.png`,
`03-orgs.json`, `04-map-top.png`.
Org pages: `10-sae-franky-top.png`, `-s1.png`, `10-sae-franky.txt`; `11-chess-franky-top.png`, `-s1.png`, `.txt`;
`12-sae-james-top.png`, `-s1.png`, `.txt` (member view); tabs `13-sae-franky-events.png`, `13-sae-franky-about.png` (+ `-full`),
`13-sae-franky-tabs.txt`; `14-sae-james-*.png/.txt`; `15-chess-franky-*.png/.txt`.
Bugs: `20-bug-a-1-feed-scrolled.png`, `20-bug-a-2-events-after-tap.png`, `20-bug-a-3-orgs-after-tap.png`,
`20-bug-a-4-orgs-scrolled-up.png`, `20-bug-a-5-after-swipe.png`, `20-bug-a.json`; `21-bug-b-post-viewer.png`, `21-bug-b.json`.
Other tabs: `30-network.png/.txt`, `31-otto.png/.txt`, `32-messages.png/.txt`, `33-profile.png/.txt`, `34-profile-james.png/.txt`, `30-console.txt`.
Events and strip: `40-events-via-strip-chip.png`, `40-walk5.json`, `41-events-scroll-1.png`, `41-events-scroll-2.png`,
`42-feed-card-menu.png`, `43-cookout-via-chip.png`. Console: `50-console-campus.txt`. Photo checks: `60-lawn-crop.png`, `60-campus-night-small.png`.
Scripts (read-only walks): `walk1.mjs` … `walk5.mjs`, `bug-a.mjs`, `chip.mjs`, `console.mjs`, `q.sh` (read-only psql).

## 8. Not determined

- Whether 4a and 4c behave the same on a real iPhone (run in headless Chromium with touch emulation only).
- Whether a local-URL `users.avatar_url` renders (not tested), and what the Officers room looks like in Franky's inbox before/after a role swap.
- Whether the worktree's env has R2 keys (I did not read any env file; the seed's own comment says they are blank locally).
- The exact look of a seeded "liked your post" line on the otto tab (no like exists yet to look at).
