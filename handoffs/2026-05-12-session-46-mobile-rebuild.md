# Session 46 handoff — mobile rebuild (2026-05-12)

Stage 7 mobile push. What started as a responsive sweep (session 45's
pickup) turned into a full mobile rebuild — a component-fork
architecture that lets the iOS-bound app diverge from the desktop
codebase without bleeding. Two surfaces shipped end-to-end:
**Profile** (owner + visitor) and **Network** (discovery-first).
Persistence gaps closed along the way (Working-on items,
work-experience logos, resume redaction bars).

29 commits, ~2.5k lines added. Desktop is byte-identical to the start
of the session everywhere except the two profile.html additions that
were behavior-only (logo upload write-through + thumbnail redaction
overlay).

---

## Agent labels

| Label | Meaning |
|--------|--------|
| **`[Claude Code]`** | Sidebar Claude — primary for everything below. |
| **`[You]`** | Human — product direction, real-device feedback (this whole session was on-phone), the architectural call to fork mobile rather than CSS-collapse it. |

---

## 1) What shipped

### Phase A — Responsive sweep (the false start)

The first six commits tried to make every page responsive via media
queries. Built `MobileNavChrome` (top bar + hamburger sheet + bottom
tab bar), collapsed `CampusAppShell` from `200px 1fr [320px]` to
`1fr` under 900px, hid LeftNav, added `env(safe-area-inset-*)`
handling, swept profile.html / auth / landing / network / settings.

This worked but you flagged it as the wrong direction:

> "No matter what the mobile version and the desktop version will look
> different. I will make this into an iOS app. So lets keep that in
> mind."

That was the pivot point. Everything after was the rebuild.

Notable commits from this phase that ARE still load-bearing:
- `83beeb7` mobile responsive sweep + bottom tab nav
- `334d1e0` hide stuck CustomCursor dot/ring on touch
- `dc9349e` / `7951c99` / `6928a7c` landing typewriter wraps on mobile
- `3906ad3` bottom tab bar was leaking to desktop (CSS cascade bug)
- `20a3c70` revert CampusBanner inline change to keep desktop byte-identical
- `2cda528` strip top bar + hamburger sheet — bottom tabs only

### Phase B — Component-fork architecture

The actual mobile foundation. Pattern: **mobile and desktop never
share UI components**. They share API routes, types, and business
logic; nothing else.

- `src/lib/use-is-mobile.ts` — `useIsMobile()` hook, 900px breakpoint,
  `useSyncExternalStore` + `matchMedia`. SSR returns desktop. After
  hydration the hook flips and the right tree paints.
- `src/components/mobile/` — home for the mobile component tree.
  - `MobileTabBar.tsx` — bottom 5-tab nav (Campus / Network / Otto /
    Messages / Profile). CSS-gated to `<900px`.
  - `MobileShell.tsx` — wraps every forked mobile route. Renders the
    tab bar + reserves `64px + env(safe-area-inset-bottom)` of
    bottom padding so content clears the tabs.
- `<Route>Switch.tsx` per forked route — `useIsMobile()` chooses
  between the mobile component and the existing desktop one. Server
  page does auth + hands off to the switch.

Shipped in `320c0a4`.

### Phase C — ProfileMobile (owner view)

- Full-bleed cover (image or `coverGradient`) flush with the iOS
  status bar via `env(safe-area-inset-top)`.
- Floating pencil + settings glyph buttons in the cover top-right
  (frosted dark glass, owner-only).
- 88px rounded-square avatar overlapping the cover (-44px), elevated
  above the cover's bottom-fade overlay with `position: relative;
  z-index: 1` (paint-order fix).
- Stats row in its own line below avatar — **Followers ·
  Connections** (dropped Following on both surfaces per your call,
  `cdf3a12`).
- Name + verified school badge + @handle + tagline.
- Meta chips (headline + location) and Vibe tags row.
- Bio section (kept "where you liked it" per direct feedback).
- Instagram-style tab strip: **Posts · Clips · Portfolio**
  (`f214e67`, renamed Resume → Portfolio in `6d85d7c`).
- Posts tab: 1:1 thumbnail grid from `/api/me/posts`.
- Clips tab: 9:14 thumbnail grid filtered to `type === "clip"`, with
  play-icon overlay.
- Portfolio tab: 3 stacked subsections — Working on, Experience,
  Resume. Each has its own empty state; the whole-pane empty state
  fires only when all three are empty.

### Phase D — Persistence work (cross-device data)

Three columns added to `users`, each behind its own migration. The
user applied both migrations during the session.

#### `users.current_on jsonb` (`20260514000000_users_current_on.sql`)

Working-on items (`{icon, text}[]`). Backed `currentlyOn` which had
been localStorage-only on profile.html.

- `src/lib/profile/current-on.ts` — `CurrentOnItem` + sanitizer (caps
  icon 12 chars, text 160 chars, ≤10 items).
- `normalizeProfileView` reads `current_on`.
- `buildVibeUserV1FromProfile` emits `currentlyOn`.
- `/api/me/profile-sync` accepts `current_on` or `currentlyOn`.
- profile.html `buildProfileSyncPayload` adds the field;
  bootstrap-hydrate prefers server, falls back to localStorage on
  empty (migration safety).

#### `users.resume_redactions jsonb` (`20260514100000_users_resume_redactions.sql`)

Bar coordinates over the user's resume / portfolio. `{docIndex,
pageNumber, x, y, w, h}` in 0–100 page-percentage coords.

- `src/lib/profile/resume-redactions.ts` — sanitizer clamps pcts,
  drops sub-1% misclicks, caps at 200 bars.
- Same read-through + write-through pattern as `current_on`.
- profile.html `_renderThumbBars()` overlays the same bars on the
  left thumbnail strip in the doc viewer (`0f0acdc`) — same coord
  space, no cursor/handles, purely a "this doc has redactions"
  preview.

#### Work-experience logos (no new column)

`work_experience.logo_url` already existed; the sanitizer rejected
`data:` URIs. Profile.html stored logos as `data:` URIs in
localStorage → sanitizer dropped them to `null` on every sync.

- `/api/me/profile-upload` gains a `logo` kind (2 MB cap, bitmap-only,
  stored under `<user.id>/logos/logo-<uuid>.<ext>` in the `profiles`
  bucket).
- profile.html `applyLogoFromInput` + `previewWorkLogo`: upload
  first, set img.src to the returned HTTPS URL, then trigger save.
  Optimistic data:-URI preview rolls back on failure.
- `_migrateDataUriLogos()` auto-converts pre-fix `data:` URI logos
  on every sync — for users (like you) who had logos saved before
  the fix shipped. Pairs with a load-time `scheduleProfileServerSync()`
  one-shot so the migration runs the first time the page opens after
  the fix lands.

### Phase E — ResumeViewerMobile

Full-screen sheet rendered when the user taps a Resume card under
the Portfolio tab.

- `src/lib/pdfjs-cdn.ts` — on-demand pdf.js loader pinned to
  3.11.174 (matches profile.html's CDN). `loadPdfJs()` is cached;
  `rasterizePdf(input)` handles both `https:` URLs and `data:` URIs,
  returns one JPEG data URL per page at scale 1.6.
- `src/components/mobile/ResumeViewerMobile.tsx` — full-screen
  overlay with safe-area-padded top bar (close + filename + "Open
  original" outlink), vertical page stack, redaction overlays
  positioned as % of each page wrap. View-only on mobile by design.

### Phase F — Visitor mode for ProfileMobile

`/profile/<someone>` on mobile now renders the iOS-native visitor
view instead of falling through to the static `profile.html`.

- ProfileMobile accepts optional `targetHandle` prop. When set:
  - Routes bootstrap + posts to `/api/users/[handle]/*` (public).
  - Hides pencil + settings cluster.
  - Renders the `FollowButton` in place of the owner Edit
    affordance (Connect / Follow back / Following ✓ / Connected ✓).
  - POSTs / DELETEs `/api/me/follow` with `target_handle`,
    optimistic update + rollback on error.
  - PortfolioPane / PostsGrid / ClipsGrid: visitor-aware empty
    copy (`${name} hasn't posted yet`), no owner CTAs, empty
    subsections hide entirely instead of showing "Add roles…"
    instructions.
- `PUBLIC_PROFILE_SELECT` in `/api/users/[handle]/bootstrap` extended
  to include `current_on` + `resume_redactions` so visitors see those
  surfaces too.
- `/profile/[handle]/page.tsx` keeps server auth, hands off to
  `ProfileHandleSwitch` (client). On mobile: `MobileShell +
  ProfileMobile(targetHandle)`. On desktop: client-side
  `window.location.replace` to `/html/profile.html?handle=...`
  (matches the previous server-side redirect target).

Shipped in `84a4b1b`.

### Phase G — NetworkMobile (discovery-first)

You said: *"how am i supposed to find people im not connected to?"*
Built the answer.

- `src/components/mobile/NetworkMobile.tsx`. Sticky frosted header
  with "People" title, large search field, horizontal scrolling tab
  strip: **Discover · Connections · Following · Followers**.
- Discover (default): Suggestions from `/api/me/suggested-connections`
  (friends-of-friends → shared-orgs → same-major ranking).
- Search: 280ms debounce; while query is non-empty, results from
  `/api/users/search` override the tab content. Clear-button + ESC
  bail.
- Relationship tabs hit `/api/me/{connections,followers,following}`.
- Each row: 48px avatar → `/profile/<handle>` (lands in the new
  visitor view), name + handle + major + mutual count, and inline
  Connect / Follow back / Following ✓ / Connected ✓ pill with
  optimistic POST/DELETE against `/api/me/follow`.

Shipped in `d2feb10`.

### Phase H — Polish / fixes

- `efdaf18` auto-migrate pre-fix localStorage logos + redactions
  (load-time `scheduleProfileServerSync()`).
- `fd4d247` drop stats to their own row below avatar (originally
  flush against the banner — uncomfortable).
- `1557593` banner gradient was painting over the avatar (paint-order
  fix).
- `41c836c` ProfileMobile was reading the wrong bootstrap field
  names (`avatar_url` vs the actual `avatarPhoto`; `banner_url` vs
  `coverPhoto`; etc.) — `vibe_user_v1` shape predates the React app.
- `ed0ddfa` profile.html nav overflow at phone widths (search bar +
  Campus/Network text links + 6 right icons crammed onto one row).
- `dfefa7d` swap wide Edit button for pencil icon next to settings
  gear.
- `c28795b` `ProfileHtmlBridge` was doing a hard
  `window.location.replace('/html/profile.html')` on mount before
  `useIsMobile` could flip — mobile users were getting yanked to the
  desktop static page every page load. Now bails on mobile widths
  via `matchMedia` so the React mobile tree mounts cleanly.

---

## 2) Repo state at session end

- **29 commits on `main`**, all pushed. Vercel auto-deployed; live
  on `connectvibe.app`.
- Latest: `d2feb10` (network discovery rebuild).
- Two migrations applied to prod Supabase by the user during the
  session:
  - `20260514000000_users_current_on.sql`
  - `20260514100000_users_resume_redactions.sql`
- `npx tsc --noEmit` — clean.
- `npx eslint` — clean on every touched file.

### File additions / changes worth knowing

#### New

- `src/lib/use-is-mobile.ts`
- `src/lib/pdfjs-cdn.ts`
- `src/lib/profile/current-on.ts`
- `src/lib/profile/resume-redactions.ts`
- `src/components/mobile/MobileTabBar.tsx` (moved from
  `src/components/MobileNavChrome.tsx`)
- `src/components/mobile/MobileShell.tsx`
- `src/components/mobile/ProfileMobile.tsx`
- `src/components/mobile/ResumeViewerMobile.tsx`
- `src/components/mobile/NetworkMobile.tsx`
- `src/app/profile/ProfileSwitch.tsx`
- `src/app/profile/[handle]/ProfileHandleSwitch.tsx`
- `src/app/network/NetworkSwitch.tsx`
- `supabase/migrations/20260514000000_users_current_on.sql`
- `supabase/migrations/20260514100000_users_resume_redactions.sql`

#### Modified

- `src/lib/profile/types.ts` — adds `current_on`, `resume_redactions`
- `src/lib/profile/normalize-profile-view.ts` — wires sanitizers
- `src/lib/profile/build-vibe-user-v1.ts` — emits `currentlyOn`,
  `resumeRedactions`
- `src/app/api/me/profile-bootstrap/route.ts` — extended SELECT
- `src/app/api/me/profile-sync/route.ts` — accepts `current_on` and
  `resume_redactions`
- `src/app/api/me/profile-upload/route.ts` — adds `logo` kind
- `src/app/api/users/[handle]/bootstrap/route.ts` — extended public
  SELECT
- `src/app/profile/page.tsx`, `src/app/profile/[handle]/page.tsx`,
  `src/app/network/page.tsx` — server auth + hand-off to switches
- `src/app/profile/profile-html-bridge.tsx` — bail on mobile
  viewports so the redirect never hijacks the mobile fork
- `src/components/campus-app-shell.tsx` — class-based grid +
  MobileTabBar render
- `src/app/layout.tsx` — viewport meta with `viewportFit: "cover"`
  + `themeColor`
- `src/app/globals.css` — `.vibe-app-shell` + `.vibe-mobile-tabbar`
  + various per-page mobile media queries (Otto room collapse, auth
  card padding, landing typewriter wrapping, etc.)
- `public/html/profile.html` — logo upload write-through,
  redaction-bar thumbnail overlay, sync payload includes `current_on`
  + `resume_redactions`, `_migrateDataUriLogos` runner, mobile
  responsive sweep block, cursor hide on coarse pointers
- `public/html/messages.html` — cursor hide on coarse pointers

---

## 3) Known issues / debt

- **Mobile editing**: pencil icon on ProfileMobile is wired to
  `/profile?edit=1` but ProfileSwitch ignores the param — the tap
  currently no-ops on mobile. Editing still happens on desktop.
  Building inline mobile-native editing is the natural next move
  after this session's continuation.
- **Post + Clip viewers on mobile**: the Posts/Clips grids in
  ProfileMobile are dead-end thumbnails. Tapping should open a
  full-screen viewer (Instagram-style for posts, vertical 9:16 for
  clips). **User has greenlit this as the next pickup.**
- **Campus mobile fork**: legacy `CampusAppShell` + media queries
  still handle `/campus`, `/otto`, `/settings`, `/messages` on
  mobile. Campus is the biggest remaining lift (feed reflow + chat
  3-rail handling + clips reel + tabs). Otto already has reasonable
  mobile collapse via earlier sweep.
- **Second resume doc**: `resumePortfolio[1]` (the user can attach
  up to 2 docs on desktop) doesn't persist server-side —
  `users.resume_url` is a single string. Visible on desktop via
  localStorage only; not surfaced on mobile.
- **Chat 3-rail on mobile**: currently hidden via CSS in
  campus-home.tsx's class-based grid collapse. Channel switching
  works only on desktop until we build a drawer pattern.
- **Pinch-to-zoom in ResumeViewerMobile**: not implemented. Texts
  in small PDFs read but are tight on a phone. Touch-event handling
  would land alongside the post/clip viewers.

---

## 4) Stage 7 plan — what's left

| # | Item | Notes |
|---|---|---|
| — | **Post viewer (mobile)** | Greenlit — next session pickup. Full-screen, opens from Profile Posts grid. |
| — | **Clip viewer (mobile)** | Pairs with the post viewer. Vertical 9:16, video autoplay, side action stack. |
| — | **Mobile-native profile editing** | Pencil icon wakes up. Inline edits for name / tagline / bio / vibe tags / work experience. |
| 36 | **Mobile responsive sweep** | Mostly DONE via the component-fork rebuild. Remaining surfaces: campus, otto, settings, messages. |
| — | **Campus mobile fork** | Largest remaining lift. Feed first, then chat 3-rail drawer pattern. |
| 35 | Custom domain — swap legal pages | Still 5-min find/replace. |
| 29 | First-class Notifications panel | `/notifications` still a stub. |
| 30, 31 | Discover Browse + Departments | Empty stubs. |
| 38 | Polish + QA + final deploy | The launch. |
| 8 | localStorage migration | Carry-over. |

---

## 5) Resume instructions for the next chat

Open the new chat with:

```
Read /Users/franciscocazares/vibe/handoffs/2026-05-12-session-46-mobile-rebuild.md
and start the mobile post viewer + clip viewer. User has greenlit.

Both viewers are full-screen sheets opened from ProfileMobile's
Posts and Clips tab thumbnails (currently dead-end taps). Post
viewer: image + body + tags + like/comment/repost actions. Clip
viewer: vertical 9:16 video, side action stack.
```

**Before pickup, run:**

```bash
git status
git log --oneline -5
npx tsc --noEmit 2>&1 | head -5
```

**Suggested approach for the post/clip viewers:**

1. Find the relevant API surfaces for like/comment/repost.
   `/api/posts/[id]/like`, `/api/posts/[id]/comments`,
   `/api/posts/[id]/repost`, `/api/posts/[id]/view`,
   `/api/posts/[id]/save` all exist (saw them in the route tree).
2. Build `src/components/mobile/PostViewerMobile.tsx` as a
   full-screen overlay (similar shell to ResumeViewerMobile —
   safe-area-padded top bar, scroll body, close button).
3. Hook into ProfileMobile's `PostThumb` / `ClipsGrid` — replace
   the static `<div>` with a tap target that opens the viewer.
4. For clips, separate component `ClipViewerMobile.tsx` since the
   video playback + swipe-to-close interaction is meaningfully
   different from the post layout.
5. Both viewers should fetch post detail data via the existing
   posts endpoint(s) — likely no new API needed.

---

## 6) Architectural principle for the next person

**Mobile and desktop never share UI components.** They share API
routes, types, and `src/lib/*` business logic. Anything in
`src/components/mobile/*` is mobile-only; anything else is desktop.
The `useIsMobile()` hook is the only branch point — typically inside
a `<Route>Switch.tsx` per route.

CSS media queries that try to "collapse" desktop components into a
mobile view bit us hard at the start of this session. The component
fork is the right pattern for an app that's going to ship as iOS.
Stay with it.

---

## 7) Deploy state — LIVE

All 29 commits on `origin/main`, Vercel built + deployed. Both
migrations applied to prod Supabase. Spot-check URLs on phone:

- `/` — landing typewriter wraps at phone widths (no overflow).
- `/profile` — mobile-native owner view: cover, avatar, stats,
  tabs (Posts / Clips / Portfolio). Pencil + settings glyphs top-
  right of cover.
- `/profile/<someone>` — mobile-native visitor view: Connect button
  replaces owner chrome. Same tabs.
- `/network` — discovery-first rebuild: search field, Discover
  default tab, Connections / Following / Followers behind tabs.
- Resume viewer — tap the Resume card under Portfolio. Renders PDF
  pages with persisted redaction bars overlaid.
- Desktop sites unchanged everywhere.

The next handoff should pick up at **post + clip viewers on mobile**.
